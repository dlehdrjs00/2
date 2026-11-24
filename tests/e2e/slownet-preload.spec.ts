/**
 * 느린 망: 미리 불러오기 붙잡기(hold)·기다림 입력·표정 대기·글꼴·데이터 절약 (game.ts present / screens/preload.ts / screens/title.ts)
 *
 * 그림 요청을 page.route 로 붙잡아(멈춘 연결 흉내) 다음을 본다.
 *  - 붙잡기 상한은 그림마다 '처음 붙잡은 때부터' 20초다. 한 줄씩 넘겨도 늘지 않는다(예전에는 스텝마다 늘어 끝없이 멈췄다)
 *  - 무대에서 걷힌 그림(cg(null))은 더 붙잡지 않는다
 *  - 선택지 스텝에서 그림을 기다리는 동안 Enter 등 진행 키는 클릭처럼 기다림만 끝낸다
 *  - 기다리는 동안 일어난 탭이 기다림이 끝난 뒤에 처리돼도 방금 그린 줄을 넘기지 않는다
 *  - 이미 보이는 인물의 표정만 바뀌는 줄은 그림을 오래 기다리지 않는다(이전 표정으로 대사 먼저)
 *  - 키 비주얼 전에 새 게임을 시작해도 그림을 기다리는 동안 첫 대사 글꼴 조각을 받는다
 *  - 데이터 절약 모드에서는 타이틀 키 비주얼 원본을 받지 않는다
 *  - 새 배경을 기다리며 맡아 둔 장소 표시는 그사이 건너뛰기가 줄을 넘기면 버린다(배경이 붙어도 뜨지 않는다).
 *    건너뛰기가 한 줄도 넘기지 않고 곧바로 멈추면 버리지 않는다(배경이 붙을 때 뜬다)
 */
import { expect, test, type Page } from '@playwright/test';
import { BACKGROUNDS } from '../../src/story/assets';
import { boot, info, newGame, tapStage, tapStageAt, toTitle, waitSettled, continueAt } from './helpers';

/**
 * 배경 그림 요청 주소 패턴. 매니페스트(BACKGROUNDS[id].src)에서 만든다: 배경 파일을 바꿔도(예: 임시 SVG → 최종 WebP)
 * 붙잡기가 옛 주소를 기다리며 아무것도 붙잡지 않은 채 헛돌지 않게. 붙잡는 테스트는 실제로 붙잡았는지(seen)도 단언한다
 */
const bgUrl = (id: keyof typeof BACKGROUNDS) => `**/${BACKGROUNDS[id].src!}`;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const bgRe = (id: keyof typeof BACKGROUNDS) => new RegExp(`/${escapeRe(BACKGROUNDS[id].src!)}$`);

interface PreloadInfo {
  near: number;
  bulk: number;
  active: number;
  held: number;
  decoded: number;
}

const preload = (page: Page) =>
  page.evaluate(() => (window as unknown as { __vn: { info: () => { preload: PreloadInfo } } }).__vn.info().preload);

/** url 패턴의 요청을 release() 할 때까지 붙잡는다(응답 없이 멈춘 연결). seen: 붙잡은 요청 주소 */
async function holdRequests(page: Page, pattern: string) {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const seen: string[] = [];
  await page.route(pattern, async (route) => {
    seen.push(route.request().url());
    await gate;
    await route.continue().catch(() => undefined);
  });
  return { release, seen };
}

const textNow = (page: Page) => page.locator('.textbox .text').evaluate((e) => (e.textContent ?? '').trim());

/** 대사가 stepId 로 바뀔 때까지 무대를 누른다(그림 대기 중의 누름은 기다림만 끝낸다) */
async function tapUntilStep(page: Page, stepId: string) {
  for (let i = 0; i < 60; i++) {
    await tapStage(page);
    await page.waitForTimeout(40);
    if ((await info(page)).step === stepId) return;
  }
  throw new Error(`${stepId} 로 넘어가지 않음`);
}

/** 자동 저장을 at 으로 바꾸고 [이어하기](continueAt 과 같되, 그림 대기가 끝나기를 기다리지 않는다) */
async function continueNoWait(page: Page, at: { sceneId: string; stepId: string; route?: string | null; stage: Record<string, unknown> }) {
  await newGame(page);
  await toTitle(page);
  await page.evaluate((at) => {
    const d = JSON.parse(localStorage.getItem('ashita.save.auto')!);
    d.state.sceneId = at.sceneId;
    d.state.stepId = at.stepId;
    d.state.route = at.route ?? null;
    d.state.stage = at.stage;
    delete d.state.sceneEntry;
    const raw = JSON.stringify(d);
    localStorage.setItem('ashita.save.auto', raw);
    window.dispatchEvent(new StorageEvent('storage', { key: 'ashita.save.auto', newValue: raw, storageArea: localStorage }));
  }, at);
  const t0 = Date.now();
  await page.locator('[data-action=continue]').click();
  const changed = page.locator('[data-panel=confirm] [data-action=ok]');
  if (await changed.isVisible().catch(() => false)) await changed.click();
  await expect(page.locator('#vn')).toHaveAttribute('data-mode', 'play');
  await expect.poll(async () => (await info(page)).step).toBe(at.stepId);
  return t0;
}

test('느린 망: 멈춘 무대 그림이 있어도 한 줄씩 넘기는 동안 붙잡기는 처음 붙잡은 때부터 20초에 풀린다', async ({ page }) => {
  // 이어하기 위치(c2.010)의 배경 요청이 끝내 응답하지 않는다. 그 배경으로 여러 줄을 2초마다 넘긴다
  const hold = await holdRequests(page, bgUrl('classroom_day'));
  try {
    await boot(page);
    const t0 = await continueNoWait(page, {
      sceneId: 'c2_homeroom',
      stepId: 'c2.010',
      stage: { bg: 'classroom_day', bgm: null, chars: {}, order: [], cg: null },
    });
    const samples: Array<{ t: number; held: number; step: string | null }> = [];
    while (Date.now() - t0 < 26_000) {
      await page.waitForTimeout(2000);
      await tapStage(page);
      const i = await info(page);
      samples.push({ t: Date.now() - t0, held: (await preload(page)).held, step: i.step });
    }
    expect(hold.seen.length, '붙잡은 배경 요청').toBeGreaterThan(0);
    const steps = new Set(samples.map((s) => s.step));
    expect(steps.size, '넘긴 줄').toBeGreaterThanOrEqual(4);
    // 붙잡기는 실제로 걸려 있었다(한 줄씩 넘기는 동안)
    expect(samples.filter((s) => s.t >= 10_000 && s.t <= 17_000).every((s) => s.held >= 1), JSON.stringify(samples)).toBe(true);
    // 처음 붙잡은 때부터 20초(+여유)가 지나면 풀린다(예전에는 스텝마다 '지금 + 20초'로 늘어 끝내 풀리지 않았다)
    const late = samples.filter((s) => s.t >= 22_500);
    expect(late.length).toBeGreaterThan(0);
    expect(late.every((s) => s.held === 0), JSON.stringify(samples)).toBe(true);
  } finally {
    hold.release();
  }
});

test('느린 망: 받기가 멈춘 CG 가 무대에서 걷히면 미리 불러오기를 더 붙잡지 않는다', async ({ page }) => {
  const hold = await holdRequests(page, '**/assets/cg/rain_tenko.webp');
  try {
    await boot(page);
    await continueAt(page, { sceneId: 'c6_rain', stepId: 'c6.b20', stage: { bg: 'shoe_lockers_rain', bgm: null, chars: {}, order: [], cg: null } });
    await tapUntilStep(page, 'c6.b30');
    await expect.poll(async () => (await preload(page)).held).toBeGreaterThanOrEqual(1);
    expect(hold.seen.length, '붙잡은 CG 요청').toBeGreaterThan(0);
    // 기다림을 끝내고(CG 는 아직) 계속 읽는다: CG 가 무대에 있는 동안은 붙잡는다
    await tapUntilStep(page, 'c6.b40');
    await waitSettled(page);
    expect((await preload(page)).held).toBeGreaterThanOrEqual(1);
    await tapUntilStep(page, 'c6.b50');
    await waitSettled(page);
    // c6.join 의 cg(null): CG 가 걷힌 줄부터는 놓아 준다(예전에는 받을 때까지 붙잡아 미리 불러오기가 계속 멈췄다)
    await tapUntilStep(page, 'c6.j10');
    await waitSettled(page);
    await expect(page.locator('.stage .cg-layer.on')).toHaveCount(0);
    await expect.poll(async () => (await preload(page)).held, { timeout: 3000 }).toBe(0);
  } finally {
    hold.release();
  }
});

test('느린 망: 선택지 스텝에서 그림을 기다리는 동안 Enter 는 클릭처럼 기다림만 끝낸다(선택지를 고르지 않음)', async ({ page }) => {
  const hold = await holdRequests(page, '**/assets/char/tenko/uniform_ponytail_fluster.webp');
  try {
    await boot(page);
    await continueNoWait(page, {
      sceneId: 'c6_rain',
      stepId: 'c6.ch',
      stage: {
        bg: 'shoe_lockers_rain',
        bgm: null,
        chars: {
          osana: { pos: 'left', expr: 'shy', outfit: 'uniform', hair: 'default' },
          tenko: { pos: 'right', expr: 'fluster', outfit: 'uniform', hair: 'ponytail' },
        },
        order: ['osana', 'tenko'],
        cg: null,
      },
    });
    expect((await info(page)).transitioning).toBe(true);
    await page.waitForTimeout(600); // 이어하기 직후 입력 잠금(0.4초)이 지나게
    expect((await info(page)).transitioning).toBe(true);
    expect(hold.seen.length, '붙잡은 표정 그림 요청').toBeGreaterThan(0);
    await expect(page.locator('.choices .choice')).toHaveCount(0);
    await page.keyboard.press('Enter');
    // 기다림의 상한(8초)보다 훨씬 빨리 선택지가 뜬다
    await expect.poll(async () => (await info(page)).transitioning, { timeout: 2500 }).toBe(false);
    await expect(page.locator('.choices .choice')).toHaveCount(2);
    await page.waitForTimeout(700);
    const i = await info(page);
    expect(i.step).toBe('c6.ch');
    await expect(page.locator('.choices .choice.picked')).toHaveCount(0);
  } finally {
    hold.release();
  }
});

test('느린 망: 그림 대기 중에 일어난 탭이 대기가 끝난 뒤에 처리돼도 방금 그린 줄을 넘기지 않는다 (글자 속도 10)', async ({ page }) => {
  const hold = await holdRequests(page, '**/assets/cg/rain_tenko.webp');
  try {
    await boot(page, { textSpeed: 10, autoSpeed: 5, bgmVolume: 0, sfxVolume: 0 });
    await continueAt(page, { sceneId: 'c6_rain', stepId: 'c6.b20', stage: { bg: 'shoe_lockers_rain', bgm: null, chars: {}, order: [], cg: null } });
    const before = await textNow(page);
    // 대사 글자가 바뀐 시각(Date.now)을 기록한다
    await page.evaluate((before) => {
      const w = window as unknown as { __shownAt: number | null };
      w.__shownAt = null;
      const text = document.querySelector('.textbox .text')!;
      new MutationObserver(() => {
        const now = (text.textContent ?? '').trim();
        if (w.__shownAt === null && now && now !== before) w.__shownAt = Date.now();
      }).observe(text, { childList: true, characterData: true, subtree: true });
    }, before);
    await tapUntilStep(page, 'c6.b30');
    expect((await info(page)).transitioning).toBe(true);
    expect(hold.seen.length, '붙잡은 CG 요청').toBeGreaterThan(0);
    await page.waitForTimeout(500);
    // 그림이 와서 기다림이 저절로 끝난다
    hold.release();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __shownAt: number | null }).__shownAt)).not.toBeNull();
    const shownAt = (await page.evaluate(() => (window as unknown as { __shownAt: number }).__shownAt))!;
    // 대사가 그려지기 30ms 전(아직 기다리던 때)에 일어난 탭이 그 뒤에 처리된 경우
    await tapStageAt(page, shownAt - 30);
    await page.waitForTimeout(600);
    expect((await info(page)).step).toBe('c6.b30');
    // 그 뒤의 탭은 평소처럼 넘긴다
    await tapUntilStep(page, 'c6.b40');
  } finally {
    hold.release();
  }
});

test('느린 망: 이미 보이는 인물의 표정만 바뀌는 줄은 그림을 오래 기다리지 않는다(이전 표정으로 대사 먼저)', async ({ page }) => {
  const hold = await holdRequests(page, '**/assets/char/osana/uniform_default_shy.webp');
  try {
    await boot(page);
    await continueAt(page, {
      sceneId: 'c6_rain',
      stepId: 'c6.030',
      stage: {
        bg: 'shoe_lockers_rain',
        bgm: null,
        chars: {
          osana: { pos: 'left', expr: 'pout', outfit: 'uniform', hair: 'default' },
          tenko: { pos: 'right', expr: 'neutral', outfit: 'uniform', hair: 'ponytail' },
        },
        order: ['osana', 'tenko'],
        cg: null,
      },
    });
    const before = await textNow(page);
    await page.evaluate(() => {
      const w = window as unknown as { __pill: boolean };
      w.__pill = false;
      const pill = document.querySelector('.stage-loading')!;
      new MutationObserver(() => {
        if (pill.classList.contains('on')) w.__pill = true;
      }).observe(pill, { attributes: true, attributeFilter: ['class'] });
    });
    const osana = page.locator('.stage img.char[data-expr]').first();
    await tapUntilStep(page, 'c6.040');
    const t = Date.now();
    // c6.040: 소꿉친구 표정(shy)만 바뀐다 → 그림이 멈춰 있어도 대사는 잠깐 뒤 나온다(예전에는 8초까지 기다렸다)
    await expect.poll(() => textNow(page), { timeout: 3000 }).not.toBe(before);
    expect(Date.now() - t).toBeLessThan(3000);
    await waitSettled(page);
    expect((await info(page)).step).toBe('c6.040');
    expect(await page.evaluate(() => (window as unknown as { __pill: boolean }).__pill)).toBe(false);
    // 그동안 이전 표정 그림 그대로(덜 받은 그림을 붙이지 않음)
    await expect(page.locator('.stage img.char[data-expr=pout]')).toHaveCount(1);
    expect(hold.seen.length, '붙잡은 표정 그림 요청').toBeGreaterThan(0);
    hold.release();
    // 받으면 표정이 바뀐다
    await expect(page.locator('.stage img.char[data-expr=shy]')).toHaveCount(1);
    expect(await osana.count()).toBeGreaterThan(0);
  } finally {
    hold.release();
  }
});

test('느린 망: 키 비주얼 전에 새 게임을 시작해도 첫 그림을 기다리는 동안 첫 대사 글꼴 조각을 받는다', async ({ page }) => {
  // 키 비주얼 원본과 새 게임 첫 배경을 붙잡는다(키 비주얼이 뜨기 전에 [새 게임] → 첫 대사는 배경을 기다린다)
  const kv = await holdRequests(page, '**/assets/cg/kv.webp');
  const bg = await holdRequests(page, bgUrl('road_morning'));
  try {
    // 붙잡은 키 비주얼이 문서의 load 이벤트를 막으므로 boot 대신 DOMContentLoaded 까지만 기다린다
    await page.addInitScript(() => {
      localStorage.setItem('ashita.settings', JSON.stringify({ textSpeed: 10, autoSpeed: 10, bgmVolume: 0, sfxVolume: 0 }));
    });
    await page.goto('./?debug', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#vn')).toHaveAttribute('data-mode', 'title');
    await expect(page.locator('.title-screen.kv-ready')).toHaveCount(0);
    // 첫 대사가 그려지는 순간(DOM 이 바뀐 직후, 화면을 그리기 전) 그 글자의 대사 글꼴 조각이 이미 받아져 있는지 기록한다
    await page.evaluate(() => {
      const w = window as unknown as { __fontOk: boolean | null };
      w.__fontOk = null;
      const text = document.querySelector('.textbox .text')!;
      new MutationObserver(() => {
        const now = (text.textContent ?? '').trim();
        if (w.__fontOk === null && now) w.__fontOk = document.fonts.check('16px "Gowun Dodum"', now);
      }).observe(text, { childList: true, characterData: true, subtree: true });
    });
    await page.locator('[data-action=new]').click();
    await expect(page.locator('#vn')).toHaveAttribute('data-mode', 'play');
    expect((await info(page)).transitioning).toBe(true);
    // 첫 배경을 기다리는 동안(대사는 아직)
    await page.waitForTimeout(3000);
    expect((await info(page)).transitioning).toBe(true);
    expect(await textNow(page)).toBe('');
    expect(kv.seen.length, '붙잡은 키 비주얼 요청').toBeGreaterThan(0);
    expect(bg.seen.length, '붙잡은 첫 배경 요청').toBeGreaterThan(0);
    bg.release();
    await waitSettled(page);
    expect((await info(page)).step).toBe('c1.010');
    // 예전에는 대사를 그리는 순간에야 그 글자 조각을 요청해 첫 문장이 대체 글꼴로 나왔다 바뀌었다
    expect(await page.evaluate(() => (window as unknown as { __fontOk: boolean | null }).__fontOk)).toBe(true);
  } finally {
    kv.release();
    bg.release();
  }
});

test('데이터 절약 모드: 타이틀 키 비주얼 원본은 받지 않고 작은 그림만 쓴다', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'connection', { configurable: true, get: () => ({ saveData: true, effectiveType: '4g' }) });
  });
  const urls: string[] = [];
  page.on('request', (r) => urls.push(r.url()));
  await boot(page);
  await expect(page.locator('.title-screen.kv-lite')).toHaveCount(1);
  await page.waitForTimeout(2500);
  expect(urls.some((u) => /\/assets\/cg\/thumb\/kv\.webp/.test(u))).toBe(true);
  expect(urls.filter((u) => /\/assets\/cg\/kv\.webp/.test(u))).toEqual([]);
  await expect(page.locator('.title-screen.kv-ready')).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('savedata-title.png') });
});

test('느린 망: 응답 없이 멈춘 미리 불러오기 한 장이 나머지 대기열을 영영 막지 않는다(30초 뒤 자리를 비움)', async ({ page }) => {
  // 새 게임 다음 장면 배경(가까운 묶음)의 요청이 끝내 응답하지 않는다. 가까운 묶음을 받는 동안에는 나머지를 시작하지 않으므로
  // 예전에는 나머지(게임 전체 그림) 미리 불러오기가 영영 멈췄다
  let seenAt = 0;
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  await page.route(bgUrl('classroom_day'), async (route) => {
    if (!seenAt) seenAt = Date.now();
    await gate;
    await route.continue().catch(() => undefined);
  });
  try {
    await boot(page);
    await expect(page.locator('.title-screen.kv-ready')).toHaveCount(1, { timeout: 20_000 });
    await expect.poll(() => seenAt, { timeout: 20_000 }).toBeGreaterThan(0);
    // 다른 가까운 그림을 다 받고 멈춘 한 장만 남으면 나머지는 시작하지 않는다
    await expect.poll(async () => (await preload(page)).active, { timeout: 15_000 }).toBe(1);
    const stuck = (await preload(page)).bulk;
    expect(stuck).toBeGreaterThan(0);
    await page.waitForTimeout(Math.max(0, seenAt + 20_000 - Date.now()));
    expect((await preload(page)).bulk, '멈춘 요청이 자리를 차지하는 동안').toBe(stuck);
    // 30초가 지나면 그 자리를 비우고 나머지를 잇는다(멈춘 요청은 그대로 둔다)
    await expect.poll(async () => (await preload(page)).bulk, { timeout: 25_000, intervals: [1000] }).toBeLessThan(stuck);
    expect(Date.now() - seenAt).toBeGreaterThan(28_000);
    expect((await info(page)).mode).toBe('title');
  } finally {
    release();
  }
});

test('타이틀: 자동 저장이 있으면 미리 불러오기를 [이어하기] 위치 기준으로 세운다', async ({ page, browser }) => {
  await boot(page);
  await newGame(page);
  await toTitle(page);
  // 자동 저장을 c6.030(다음 줄에 소꿉친구 shy, 그다음 전학생 fluster)으로 바꾼 저장소를 그대로 새 브라우저 문맥에 넣는다
  const store = await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('ashita.save.auto')!);
    d.state.sceneId = 'c6_rain';
    d.state.stepId = 'c6.030';
    d.state.route = null;
    d.state.stage = {
      bg: 'shoe_lockers_rain',
      bgm: null,
      chars: {
        osana: { pos: 'left', expr: 'pout', outfit: 'uniform', hair: 'default' },
        tenko: { pos: 'right', expr: 'neutral', outfit: 'uniform', hair: 'ponytail' },
      },
      order: ['osana', 'tenko'],
      cg: null,
    };
    delete d.state.sceneEntry;
    localStorage.setItem('ashita.save.auto', JSON.stringify(d));
    const out: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      out[k] = localStorage.getItem(k)!;
    }
    return out;
  });
  const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport: { width: 1280, height: 720 } });
  try {
    await ctx.addInitScript((store) => {
      if (sessionStorage.getItem('__seeded')) return;
      sessionStorage.setItem('__seeded', '1');
      for (const [k, v] of Object.entries(store)) localStorage.setItem(k, v);
    }, store);
    const p2 = await ctx.newPage();
    const urls: string[] = [];
    p2.on('request', (r) => urls.push(r.url()));
    await p2.goto('./?debug');
    await expect(p2.locator('.title-screen.kv-ready')).toHaveCount(1, { timeout: 20_000 });
    await expect(p2.locator('[data-action=continue]')).toBeEnabled();
    const idx = (re: RegExp) => urls.findIndex((u) => re.test(u));
    await expect.poll(() => idx(/tenko\/uniform_ponytail_fluster\.webp/), { timeout: 15_000 }).toBeGreaterThanOrEqual(0);
    // 이어하기 위치의 다음 줄 그림(c6.040 shy·c6.050 fluster)을 새 게임 첫 장면(c1) 배경보다 먼저 받는다
    const shy = idx(/osana\/uniform_default_shy\.webp/);
    const fluster = idx(/tenko\/uniform_ponytail_fluster\.webp/);
    expect(shy).toBeGreaterThanOrEqual(0);
    // 새 게임 첫 배경도 결국 받는다(표준 렌더링은 게임 전체 그림을 미리 받음). 받은 뒤에 순서를 비교한다(-1 로 헛돌지 않게)
    await expect.poll(() => idx(bgRe('road_morning')), { timeout: 20_000 }).toBeGreaterThanOrEqual(0);
    const road = idx(bgRe('road_morning'));
    expect(shy < road && fluster < road, JSON.stringify({ shy, fluster, road })).toBe(true);
  } finally {
    await ctx.close();
  }
});

/** 지금부터 장소 표시가 켜질 때마다 그 글을 기록한다(이미 켜져 있으면 'already:' 를 붙여 남긴다) */
async function recordPlaceOn(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __placeOn: string[] };
    w.__placeOn = [];
    const chip = document.querySelector('.place-chip')!;
    if (chip.classList.contains('on')) w.__placeOn.push('already:' + (chip.textContent ?? ''));
    new MutationObserver(() => {
      if (chip.classList.contains('on')) w.__placeOn.push(chip.textContent ?? '');
    }).observe(chip, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true });
  });
}
const placeOnLog = (page: Page) => page.evaluate(() => (window as unknown as { __placeOn: string[] }).__placeOn);

test('느린 망: 새 배경을 기다리며 맡아 둔 장소 표시는 그사이 건너뛰기가 줄을 넘기면 배경이 붙어도 뜨지 않는다', async ({ page }) => {
  // 건너뛰기는 장소 표시를 하지 않는다. 예전에는 배경 해독을 기다리며 맡아 둔 c2 장소 문구가 건너뛰는 중에 배경이 붙는 순간
  // 떠서, 같은 배경이 이어지는 c3 선택지 화면까지 3.2초 남았다
  const ids = [
    ...['010', '020', '030', '040', '050', '060', '070', '080', '090', '100', '110'].map((s) => `c1.${s}`),
    ...['010', '020', '030', '050', '060', '070', '080', '090', '100', '110'].map((s) => `c2.${s}`),
    'c3.010',
    'c3.020',
    'c3.030',
  ];
  await page.addInitScript((ids) => {
    localStorage.setItem('ashita.global', JSON.stringify({ schema: 1, read: ids, endings: [], cgs: [] }));
  }, ids);
  const hold = await holdRequests(page, bgUrl('classroom_day'));
  try {
    await boot(page);
    await continueAt(page, {
      sceneId: 'c1_morning',
      stepId: 'c1.110',
      stage: { bg: 'road_morning', bgm: 'daily', chars: { osana: { pos: 'center', expr: 'smile', outfit: 'uniform', hair: 'default' } }, order: ['osana'], cg: null },
    });
    // c2.010: 새 배경(교실)을 기다린다. 장소 표시는 배경이 붙을 때 띄우려고 맡아 둔다
    await tapUntilStep(page, 'c2.010');
    expect((await info(page)).transitioning).toBe(true);
    await page.waitForTimeout(700);
    await tapStage(page); // 기다림을 끝낸다(대사 먼저, 배경은 받는 대로 붙는다)
    await expect.poll(async () => (await info(page)).transitioning).toBe(false);
    // 교실 배경은 아직 붙지 않았다(info().bg 는 요청한 배경이라 그림 층으로 본다)
    await expect(page.locator('.stage .bg-layer[data-bg=classroom_day]')).toHaveCount(0);
    await page.waitForTimeout(500);
    // 이제부터 장소 표시가 켜지면 기록한다
    expect(hold.seen.length, '붙잡은 교실 배경 요청').toBeGreaterThan(0);
    await recordPlaceOn(page);
    await page.keyboard.press('s');
    await expect.poll(async () => (await info(page)).skip, { timeout: 2000 }).toBe(true);
    await page.waitForTimeout(150);
    hold.release(); // 건너뛰는 중에 교실 배경이 붙는다
    await expect(page.locator('.stage .bg-layer.on[data-bg=classroom_day]')).toHaveCount(1, { timeout: 5000 });
    // 건너뛰기는 같은 배경의 c3 선택지에서 멈춘다
    await expect.poll(async () => (await info(page)).step, { timeout: 8000 }).toBe('c3.ch');
    expect((await info(page)).skip).toBe(false);
    await page.waitForTimeout(800);
    expect(await placeOnLog(page)).toEqual([]);
    await expect(page.locator('.place-chip.on')).toHaveCount(0);
  } finally {
    hold.release();
  }
});

test('느린 망: 새 배경을 기다리는 줄에서 건너뛰기를 켰는데 곧바로 다음 줄(처음 보는 줄)에서 멈추면 맡아 둔 장소 표시는 배경이 붙을 때 뜬다', async ({ page }) => {
  // 건너뛰기가 한 줄도 건너뛰지 않았으니 c2 장소 표시(c2.010 을 보통으로 보여 줄 때 맡아 둔 것)는 버리지 않는다.
  // 예전에는 건너뛰기를 켜는 순간 버려서, 느린 망에서는 c2 장소 표시가 한 번도 뜨지 않았다
  const ids = [...['010', '020', '030', '040', '050', '060', '070', '080', '090', '100', '110'].map((s) => `c1.${s}`), 'c2.010'];
  await page.addInitScript((ids) => {
    localStorage.setItem('ashita.global', JSON.stringify({ schema: 1, read: ids, endings: [], cgs: [] }));
  }, ids);
  const hold = await holdRequests(page, bgUrl('classroom_day'));
  try {
    await boot(page);
    await continueAt(page, {
      sceneId: 'c1_morning',
      stepId: 'c1.110',
      stage: { bg: 'road_morning', bgm: 'daily', chars: { osana: { pos: 'center', expr: 'smile', outfit: 'uniform', hair: 'default' } }, order: ['osana'], cg: null },
    });
    await tapUntilStep(page, 'c2.010');
    expect((await info(page)).transitioning).toBe(true);
    await page.waitForTimeout(700);
    await tapStage(page); // 기다림을 끝낸다(대사 먼저, 배경은 받는 대로 붙는다)
    await expect.poll(async () => (await info(page)).transitioning).toBe(false);
    await expect(page.locator('.stage .bg-layer[data-bg=classroom_day]')).toHaveCount(0);
    expect(hold.seen.length, '붙잡은 교실 배경 요청').toBeGreaterThan(0);
    await page.waitForTimeout(500);
    await recordPlaceOn(page);
    await page.keyboard.press('s');
    // c2.020 은 처음 보는 줄이라 건너뛰기는 거기서 멈춘다(아무 줄도 건너뛰지 않음)
    await expect.poll(async () => (await info(page)).step, { timeout: 5000 }).toBe('c2.020');
    await expect.poll(async () => (await info(page)).skip).toBe(false);
    await page.waitForTimeout(300);
    expect(await placeOnLog(page)).toEqual([]); // 배경이 붙기 전에는 뜨지 않는다
    hold.release();
    await expect(page.locator('.stage .bg-layer.on[data-bg=classroom_day]')).toHaveCount(1, { timeout: 9000 });
    await expect.poll(async () => (await placeOnLog(page)).length, { timeout: 2000 }).toBeGreaterThan(0);
    const log = await placeOnLog(page);
    expect(log.every((t) => t.includes('조례'))).toBe(true);
    expect((await info(page)).step).toBe('c2.020');
    await expect(page.locator('.place-chip.on')).toHaveCount(1);
    // 기다리다 넘긴(누름) 교실 배경은 해독이 끝나면 '포기함' 표시를 지운다(해독 캐시에서 퇴출된 뒤 다시 나오면 평소처럼 기다리게)
    await expect.poll(async () => (await info(page)).decode.givenUp).toBe(0);
  } finally {
    hold.release();
  }
});
