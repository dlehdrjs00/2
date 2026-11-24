/**
 * 느린 네트워크: 대사가 그림보다 먼저 나오지 않는다(game.ts present → stage.ready)
 *
 * 그림 파일 하나를 page.route 로 붙잡아 두었다가(약 3초) 풀어 준다. 그동안
 *  - 그 줄의 대사 글자는 그려지지 않고(이전 대사 그대로), 1.2초가 넘으면 무대에 '그림을 불러오는 중…' 알약이 뜬다
 *  - 그림이 켜진 뒤에야(.cg-layer.on / 스프라이트 .entering 해제) 대사가 그려진다
 *  - 기다리는 동안의 클릭 한 번은 기다림만 끝낸다(hurry: 대사가 그려지고, 다음 줄로 넘어가지 않는다)
 * 붙잡는 동안에는 미리 불러오기의 같은 주소 요청도 함께 붙잡히므로, 언제 실행해도 '아직 받지 못한 그림'이 된다.
 */
import { expect, test, type Page } from '@playwright/test';
import { boot, continueAt, doubleTap, info, newGame, tapStage, toTitle, waitSettled } from './helpers';

/** url 패턴의 요청을 release() 할 때까지 붙잡는다 */
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

/**
 * 대사 글자(.textbox .text)가 지금과 다른 문장으로 처음 바뀐 때와, 그림이 켜진 때(cg: .cg-layer.on, char: 스프라이트 .entering 해제)의
 * 순서를 페이지 안에서 기록한다(window.__order). 빈 문장(clear)은 세지 않는다.
 */
async function recordOrder(page: Page, what: 'cg' | 'char') {
  await page.evaluate((what) => {
    const w = window as unknown as { __order: string[] };
    w.__order = [];
    const push = (k: string) => {
      if (!w.__order.includes(k)) w.__order.push(k);
    };
    const text = document.querySelector('.textbox .text')!;
    const initial = text.textContent ?? '';
    new MutationObserver(() => {
      const now = (text.textContent ?? '').trim();
      if (now && now !== initial.trim()) push('text');
    }).observe(text, { childList: true, characterData: true, subtree: true });
    const stage = document.querySelector('.stage')!;
    const check = () => {
      if (what === 'cg' && stage.querySelector('.cg-layer.on')) push('art');
      if (what === 'char' && stage.querySelector('img.char:not(.entering)')) push('art');
    };
    new MutationObserver(check).observe(stage, { attributes: true, attributeFilter: ['class'], subtree: true, childList: true });
  }, what);
}

const order = (page: Page) => page.evaluate(() => (window as unknown as { __order: string[] }).__order);
const textNow = (page: Page) => page.locator('.textbox .text').evaluate((e) => (e.textContent ?? '').trim());

/** 대사가 다음 스텝으로 바뀔 때까지 무대를 누른다(시작 직후 입력 잠금으로 첫 탭이 무시될 수 있다). 그림 대기는 기다리지 않는다 */
async function tapUntilStep(page: Page, stepId: string) {
  for (let i = 0; i < 40; i++) {
    await tapStage(page);
    await page.waitForTimeout(40);
    if ((await info(page)).step === stepId) return;
  }
  throw new Error(`${stepId} 로 넘어가지 않음`);
}

test('느린 망: 이벤트 CG 가 3초 늦게 와도 그 줄 대사는 CG 가 켜진 뒤에 나온다', async ({ page }) => {
  const hold = await holdRequests(page, '**/assets/cg/rain_tenko.webp');
  try {
    await boot(page);
    await continueAt(page, { sceneId: 'c6_rain', stepId: 'c6.b20', stage: { bg: 'shoe_lockers_rain', bgm: null, chars: {}, order: [], cg: null } });
    const before = await textNow(page);
    expect(before.length).toBeGreaterThan(0);
    await recordOrder(page, 'cg');

    await tapUntilStep(page, 'c6.b30');
    // 그림을 기다리는 중: 연출 중(transitioning)으로 보이고, 대사는 이전 문장 그대로
    expect((await info(page)).transitioning).toBe(true);
    await expect(page.locator('.stage-loading.on')).toBeVisible({ timeout: 4000 });
    await page.waitForTimeout(3000 - 1200);
    expect(await textNow(page)).toBe(before);
    await expect(page.locator('.stage .cg-layer.on')).toHaveCount(0);
    expect(await order(page)).toEqual([]);
    expect(hold.seen.length).toBeGreaterThan(0);

    hold.release();
    await expect(page.locator('.stage .cg-layer.on')).toHaveAttribute('data-cg', 'rain_tenko');
    await waitSettled(page);
    expect((await info(page)).step).toBe('c6.b30');
    expect(await textNow(page)).not.toBe(before);
    // CG 가 켜진 뒤에 대사
    expect(await order(page)).toEqual(['art', 'text']);
    await expect(page.locator('.stage-loading.on')).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath('slow-cg-after.png') });
  } finally {
    hold.release();
  }
});

test('느린 망: 스프라이트를 기다리는 동안 클릭 한 번은 기다림만 끝내고(대사 한 줄) 다음 줄로 넘어가지 않는다', async ({ page }) => {
  const hold = await holdRequests(page, '**/assets/char/tenko/yukata_ponytail_smile.webp');
  try {
    await boot(page);
    await continueAt(page, {
      sceneId: 't5_festival',
      stepId: 't5.020',
      route: 'tenko',
      stage: { bg: 'festival_street', bgm: null, chars: {}, order: [], cg: null },
    });
    const before = await textNow(page);
    await recordOrder(page, 'char');

    await tapUntilStep(page, 't5.030');
    expect((await info(page)).transitioning).toBe(true);
    await page.waitForTimeout(600);
    // 아직 그림도 대사도 없다
    expect(await textNow(page)).toBe(before);
    await expect(page.locator('.stage img.char.entering')).toHaveCount(1);

    // 기다리는 중 클릭 한 번: 기다림만 끝낸다 → 이 줄 대사가 그려지고 스텝은 그대로
    await tapStage(page);
    await expect.poll(() => textNow(page)).not.toBe(before);
    await page.waitForTimeout(300);
    const i = await info(page);
    expect(i.step).toBe('t5.030');
    expect(i.transitioning).toBe(false);
    await expect(page.locator('.stage img.char.entering')).toHaveCount(1); // 그림은 아직(받는 대로 붙는다)
    await page.screenshot({ path: test.info().outputPath('slow-sprite-hurried.png') });

    hold.release();
    await expect(page.locator('.stage img.char:not(.entering)')).toHaveCount(1);
    expect(await order(page)).toEqual(['text', 'art']);
    expect((await info(page)).step).toBe('t5.030');
  } finally {
    hold.release();
  }
});

test('느린 망: 이어하기 직후에도 무대 CG 가 켜지기 전에는 대사를 그리지 않는다', async ({ page }) => {
  const hold = await holdRequests(page, '**/assets/cg/rain_osana.webp');
  try {
    await boot(page);
    await newGame(page);
    await toTitle(page);
    // 자동 저장을 CG 가 떠 있는 대사(c6.a30)로 바꾼다(continueAt 과 같은 방식, 단 기다리지 않고 순서를 본다)
    await page.evaluate(() => {
      const d = JSON.parse(localStorage.getItem('ashita.save.auto')!);
      d.state.sceneId = 'c6_rain';
      d.state.stepId = 'c6.a30';
      d.state.route = null;
      d.state.stage = {
        bg: 'road_rain',
        bgm: null,
        chars: {
          osana: { pos: 'left', expr: 'neutral', outfit: 'uniform', hair: 'default' },
          tenko: { pos: 'right', expr: 'smile', outfit: 'uniform', hair: 'ponytail' },
        },
        order: ['osana', 'tenko'],
        cg: 'rain_osana',
      };
      delete d.state.sceneEntry;
      const raw = JSON.stringify(d);
      localStorage.setItem('ashita.save.auto', raw);
      window.dispatchEvent(new StorageEvent('storage', { key: 'ashita.save.auto', newValue: raw, storageArea: localStorage }));
    });
    await recordOrder(page, 'cg');
    await page.locator('[data-action=continue]').click();
    const changed = page.locator('[data-panel=confirm] [data-action=ok]');
    if (await changed.isVisible().catch(() => false)) await changed.click();
    await expect(page.locator('#vn')).toHaveAttribute('data-mode', 'play');
    await expect.poll(async () => (await info(page)).step).toBe('c6.a30');
    expect((await info(page)).transitioning).toBe(true);
    await page.waitForTimeout(1500);
    await expect(page.locator('.stage-loading.on')).toBeVisible();
    expect(await order(page)).toEqual([]);
    await page.screenshot({ path: test.info().outputPath('slow-continue-waiting.png') });

    hold.release();
    await waitSettled(page);
    await expect(page.locator('.stage .cg-layer.on')).toHaveAttribute('data-cg', 'rain_osana');
    expect(await order(page)).toEqual(['art', 'text']);
  } finally {
    hold.release();
  }
});

test('보통 속도: 이미 받은 그림이면 대사가 곧바로 나온다(그림 대기가 진행을 늦추지 않음)', async ({ page }) => {
  await boot(page);
  await continueAt(page, { sceneId: 'c6_rain', stepId: 'c6.b20' });
  // 같은 그림(이미 해독)으로 다시 한 번: c6.b30 에서 CG 를 받아 둔 뒤 c6.b20 으로 이어하고 다시 넘긴다
  await tapUntilStep(page, 'c6.b30');
  await waitSettled(page);
  await expect(page.locator('.stage .cg-layer.on')).toHaveAttribute('data-cg', 'rain_tenko');
  await toTitle(page);
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('ashita.save.auto')!);
    d.state.stepId = 'c6.b20';
    d.state.stage = { bg: 'black', bgm: null, chars: {}, order: [], cg: null };
    delete d.state.sceneEntry;
    const raw = JSON.stringify(d);
    localStorage.setItem('ashita.save.auto', raw);
    window.dispatchEvent(new StorageEvent('storage', { key: 'ashita.save.auto', newValue: raw, storageArea: localStorage }));
  });
  await page.locator('[data-action=continue]').click();
  const changed = page.locator('[data-panel=confirm] [data-action=ok]');
  if (await changed.isVisible().catch(() => false)) await changed.click();
  await waitSettled(page);
  expect((await info(page)).step).toBe('c6.b20');
  // '그림을 불러오는 중…' 알약이 한 번이라도 켜지는지 기록
  await page.evaluate(() => {
    const w = window as unknown as { __pill: boolean };
    w.__pill = false;
    const pill = document.querySelector('.stage-loading')!;
    new MutationObserver(() => {
      if (pill.classList.contains('on')) w.__pill = true;
    }).observe(pill, { attributes: true, attributeFilter: ['class'] });
  });
  const t0 = Date.now();
  await tapUntilStep(page, 'c6.b30');
  await waitSettled(page);
  // 입력 잠금(이어하기 직후 0.4초)·테스트 도구 왕복을 감안한 넉넉한 상한. 그림을 기다렸다면 1.2초 알약이 켜진다
  expect(Date.now() - t0).toBeLessThan(3000);
  expect(await page.evaluate(() => (window as unknown as { __pill: boolean }).__pill)).toBe(false);
  await expect(page.locator('.stage .cg-layer.on')).toHaveAttribute('data-cg', 'rain_tenko');
});

test('느린 망: 그림을 기다리는 동안 메뉴를 열고 닫아도 대사를 건너뛰지 않는다', async ({ page }) => {
  const hold = await holdRequests(page, '**/assets/cg/rain_tenko.webp');
  try {
    await boot(page);
    await continueAt(page, { sceneId: 'c6_rain', stepId: 'c6.b20', stage: { bg: 'shoe_lockers_rain', bgm: null, chars: {}, order: [], cg: null } });
    const before = await textNow(page);
    await tapUntilStep(page, 'c6.b30');
    expect((await info(page)).transitioning).toBe(true);
    // 메뉴: 기다리는 중에 열고, 그림이 도착한 뒤 닫는다 → 메뉴 뒤에서 이 줄 대사가 그려지고, 닫아도 다음 줄로 가지 않는다
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-panel=menu]')).toBeVisible();
    hold.release();
    await expect(page.locator('.stage .cg-layer.on')).toHaveCount(1);
    await expect.poll(() => textNow(page)).not.toBe(before);
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await info(page)).overlays).toBe(0);
    await waitSettled(page);
    expect((await info(page)).step).toBe('c6.b30');
  } finally {
    hold.release();
  }
});

test('느린 망: 그림을 기다리는 동안 대사창을 숨기면, 그림이 와도 숨긴 채이고 다음 클릭은 복귀만 한다', async ({ page }) => {
  const hold = await holdRequests(page, '**/assets/cg/rain_osana.webp');
  try {
    await boot(page);
    await continueAt(page, { sceneId: 'c6_rain', stepId: 'c6.a10', stage: { bg: 'shoe_lockers_rain', bgm: null, chars: {}, order: [], cg: null } });
    const before = await textNow(page);
    await tapUntilStep(page, 'c6.a20');
    expect((await info(page)).transitioning).toBe(true);
    await page.keyboard.press('h');
    await expect.poll(async () => (await info(page)).hidewin).toBe(true);
    hold.release();
    await expect(page.locator('.stage .cg-layer.on')).toHaveCount(1);
    await expect.poll(() => textNow(page)).not.toBe(before);
    await waitSettled(page);
    expect((await info(page)).hidewin).toBe(true);
    await page.waitForTimeout(450); // 숨기기 직후 같은 자리 두 번째 클릭 흡수 시간이 지나게
    await tapStage(page);
    await expect.poll(async () => (await info(page)).hidewin).toBe(false);
    await page.waitForTimeout(300);
    expect((await info(page)).step).toBe('c6.a20');
  } finally {
    hold.release();
  }
});

for (const speed of [10, 6]) {
  test(`느린 망: 그림을 기다리는 동안 더블클릭·더블탭해도 기다리던 줄을 건너뛰지 않는다 (글자 속도 ${speed})`, async ({ page }) => {
    const hold = await holdRequests(page, '**/assets/cg/rain_tenko.webp');
    try {
      await boot(page, { textSpeed: speed, autoSpeed: 5, bgmVolume: 0, sfxVolume: 0 });
      await continueAt(page, { sceneId: 'c6_rain', stepId: 'c6.b20', stage: { bg: 'shoe_lockers_rain', bgm: null, chars: {}, order: [], cg: null } });
      const before = await textNow(page);
      await tapUntilStep(page, 'c6.b30');
      expect((await info(page)).transitioning).toBe(true);
      await page.waitForTimeout(600);
      // 지나간 스텝을 화면 갱신마다 기록한다(한 프레임만 보이고 넘어가도 잡히게)
      await page.evaluate(() => {
        const w = window as unknown as { __steps: string[]; __vn: { info: () => { step: string } } };
        w.__steps = [];
        const tick = () => {
          const st = w.__vn.info().step;
          if (w.__steps[w.__steps.length - 1] !== st) w.__steps.push(st);
          requestAnimationFrame(tick);
        };
        tick();
      });
      // 첫 입력은 기다림만 끝내 이 줄을 그리고, 같은 연타의 둘째 입력은 그 줄을 넘기지 않는다
      // (글자 속도 10 은 첫 입력에 문장이 다 그려져, 예전에는 둘째 입력이 곧바로 c6.b40 으로 넘겼다)
      const box = (await page.locator('.stage').boundingBox())!;
      await doubleTap(page, box.x + box.width * 0.5, box.y + box.height * 0.35);
      await expect.poll(() => textNow(page)).not.toBe(before);
      await page.waitForTimeout(700);
      const steps = await page.evaluate(() => (window as unknown as { __steps: string[] }).__steps);
      expect(steps, '지나간 스텝').toEqual(['c6.b30']);
      expect((await info(page)).step).toBe('c6.b30');
      // 잠금은 잠깐뿐: 다음 입력은 평소처럼 다음 줄로 넘긴다(글자 속도 6 은 타자 마무리가 먼저일 수 있다)
      await waitSettled(page);
      await tapUntilStep(page, 'c6.b40');
    } finally {
      hold.release();
    }
  });
}

test('타이틀: 키 비주얼이 뜬 뒤 첫 대사·빠른 메뉴 탭 글자의 글꼴 조각을 미리 받는다(대사 화면에 들어가기 전에)', async ({ page }) => {
  await boot(page);
  // 첫 화면 문장을 알아 둔다(새 게임 첫 대사 = 그 자동 저장으로 [이어하기] 할 위치)
  await newGame(page);
  const first = await textNow(page);
  expect(first.length).toBeGreaterThan(0);
  // 새 문서로 다시 열어(글꼴은 문서마다 새로 불러온다) 타이틀에 머무른다
  await page.reload();
  await expect(page.locator('#vn')).toHaveAttribute('data-mode', 'title');
  await expect(page.locator('.title-screen.kv-ready')).toHaveCount(1, { timeout: 20_000 });
  const tabs = await page.evaluate(() =>
    [...document.querySelectorAll('.qbar button')].map((b) => (b.textContent ?? '').trim()).join(''),
  );
  expect(tabs).toContain('기록');
  const loaded = () =>
    page.evaluate(
      ({ first, tabs }) => {
        const btn = document.querySelector('.qbar button')!;
        const cs = getComputedStyle(btn);
        return {
          text: document.fonts.check('16px "Gowun Dodum"', first),
          tabs: document.fonts.check(`${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`, tabs),
        };
      },
      { first, tabs },
    );
  // 빠른 메뉴는 타이틀에서 숨겨져(display: none) 배치되지 않으므로, 미리 받지 않으면 탭 글자 조각은 여기서 받아지지 않는다
  await expect.poll(loaded, { timeout: 15_000 }).toEqual({ text: true, tabs: true });
  expect((await info(page)).mode).toBe('title');
  await expect(page.locator('.qbar')).toBeHidden();
});

