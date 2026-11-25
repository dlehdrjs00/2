import { expect, test, type Page } from '@playwright/test';

export interface Info {
  mode: string;
  step: string | null;
  frame: string | null;
  route: string | null;
  /** 누적 점수. koharu 는 해금 판정 때 두 점수의 평균(0.5 단위)으로 정해지고, 미해금이면 0 그대로 */
  points: { osana: number; tenko: number; koharu: number } | null;
  lastHeroine: string | null;
  auto: boolean;
  skip: boolean;
  overlays: number;
  /** 무대에 표시 중인 배경 id */
  bg: string | null;
  /** 마지막으로 요청한 배경음 id */
  bgm: string | null;
  typing: boolean;
  /** 암전·번쩍임 연출 중(대사가 아직 그려지기 전) */
  transitioning: boolean;
  textOverflow: boolean;
  readCount: number;
  /** 대사창 숨김(H) 중인지 */
  hidewin: boolean;
  /** 열린 시스템 시트의 탭(save/load/settings/log) */
  sheet: string | null;
  /**
   * 자동 저장 상태(src/ui/savestatus.ts): none(없음·아직 안 씀) / ok(브라우저에 저장됨) / tab-only(이 탭 메모리에만) /
   * low-space(쓰기 실패 뒤 다시 브라우저에 저장됐지만 여유 공간이 거의 없음)
   */
  autoSave: 'none' | 'ok' | 'tab-only' | 'low-space';
  /**
   * 무대 해독 캐시(src/ui/image-cache.ts): count 보관 수(해독 중 포함), pixels 해독이 끝난 것의 픽셀 합,
   * pending 해독 중, attached·attachedPixels 화면에 붙어 퇴출하지 않는 것(CG), maxImages·maxPixels 상한,
   * givenUp 기다리다 넘긴(아직 해독 전) 그림 수
   */
  decode: { count: number; pixels: number; pending: number; attached: number; attachedPixels: number; maxImages: number; maxPixels: number; givenUp: number };
  /** 미리 불러오기 대기열(decoded: 미리 해독해 붙잡아 둔 그림 수) */
  preload: { near: number; bulk: number; active: number; held: number; decoded: number };
}

/** 지금 브라우저 엔진이 Chromium 인지(CDP 입력은 Chromium 에서만 쓸 수 있다) */
export function isChromium(page: Page): boolean {
  return page.context().browser()?.browserType().name() === 'chromium';
}

/** CDP(Chromium 전용)로 입력을 보내야 하는 검사는 다른 엔진(WebKit)에서 건너뛴다(실패 대신 이유를 남김) */
export function requireCdp(page: Page) {
  test.skip(!isChromium(page), '입력 시각을 정해 보내는 CDP(Chromium 전용)가 필요한 검사');
}

/** 설정(글자 즉시 표시 등)을 넣고 게임을 연다. 저장 데이터는 건드리지 않는다. */
export async function boot(page: Page, settings: Record<string, number> = { textSpeed: 10, autoSpeed: 10, bgmVolume: 0, sfxVolume: 0 }) {
  await page.addInitScript((s) => {
    try {
      const cur = JSON.parse(localStorage.getItem('ashita.settings') || '{}');
      localStorage.setItem('ashita.settings', JSON.stringify({ ...cur, ...s }));
    } catch {
      /* ignore */
    }
  }, settings);
  await page.goto('./?debug');
  await expect(page.locator('#vn')).toHaveAttribute('data-mode', 'title');
}

export async function info(page: Page): Promise<Info> {
  return page.evaluate(() => (window as unknown as { __vn: { info: () => Info } }).__vn.info());
}

export async function newGame(page: Page) {
  await page.locator('[data-action=new]').click();
  const confirm = page.locator('[data-panel=confirm] [data-action=ok]');
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await expect(page.locator('#vn')).toHaveAttribute('data-mode', 'play');
  await waitSettled(page);
}

/** 연출(암전 등)이 끝나 블로킹 프레임이 표시될 때까지(암전 중에는 아직 대사를 그리기 전이라 기다린다) */
export async function waitSettled(page: Page) {
  await expect
    .poll(async () => {
      const i = await info(page);
      return i.mode !== 'play' || (i.step !== null && !i.typing && !i.transitioning);
    })
    .toBe(true);
}

/** 무대의 빈 곳(배경)을 눌러 대사를 진행 */
export async function tapStage(page: Page) {
  const box = await page.locator('.stage').boundingBox();
  if (!box) throw new Error('stage not visible');
  const x = box.x + box.width * 0.5;
  const y = box.y + box.height * 0.35;
  if (test.info().project.use.hasTouch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

/** 무대 가장자리(선택지 버튼이 없는 곳)를 누른다 */
export async function tapBackground(page: Page) {
  const box = await page.locator('.stage').boundingBox();
  if (!box) throw new Error('stage not visible');
  const x = box.x + box.width * 0.04;
  const y = box.y + box.height * 0.5;
  if (test.info().project.use.hasTouch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

/** 한 문장 진행하고 프레임이 바뀔 때까지 기다린다 */
export async function advanceOne(page: Page) {
  const before = await info(page);
  for (let tries = 0; tries < 40; tries++) {
    await tapStage(page);
    await page.waitForTimeout(30);
    const now = await info(page);
    if (now.step !== before.step || now.mode !== 'play') {
      await waitSettled(page);
      return now;
    }
  }
  throw new Error(`진행되지 않음: ${before.step}`);
}

/** 선택지가 등장 연출을 마치고 누를 수 있게 될 때까지(준비 전 클릭은 의도적으로 무시된다) */
export async function waitChoicesArmed(page: Page) {
  await expect(page.locator('.choices.on')).toHaveAttribute('data-armed', '1');
}

export async function pick(page: Page, optionId: string) {
  const before = await info(page);
  expect(before.frame).toBe('choice');
  await waitChoicesArmed(page);
  await page.locator(`.choice[data-option="${optionId}"]`).click();
  await expect.poll(async () => (await info(page)).step).not.toBe(before.step);
  await waitSettled(page);
}

/** 선택지 또는 엔딩까지 진행. 각 대사에서 onSay 콜백 */
export async function advanceToStop(page: Page, onSay?: (i: Info) => Promise<void>) {
  for (let guard = 0; guard < 600; guard++) {
    const i = await info(page);
    if (i.mode !== 'play' || i.frame === 'choice' || i.frame === 'ending') return i;
    if (onSay && i.frame === 'say') await onSay(i);
    await advanceOne(page);
  }
  throw new Error('너무 깁니다');
}

/** 공통 선택 7회(시간순). 초반 4회는 a/b/c(함께), 후반 3회는 a/b + 해금 시 k, 미해금 시 c(함께) */
export const COMMON_CHOICES = ['c3.ch', 'c4.ch', 'c6.ch', 'c7.ch', 'c8.ch', 'c9.ch', 'c10.ch'] as const;

/** 루트 첫 장면(o1_shop·t1_cats·k1)의 대사 id 접두사 */
export const ROUTE_FIRST_STEP: Record<'osana' | 'tenko' | 'koharu', string> = { osana: 'o1.', tenko: 't1.', koharu: 'k1.' };

/** 지금 화면에 보이는 선택지의 옵션 id(위에서부터). 선택지가 다 나타나 누를 수 있게 된 뒤에 읽는다 */
export async function visibleChoiceIds(page: Page): Promise<string[]> {
  await waitChoicesArmed(page);
  return page.locator('.choices.on .choice').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.option ?? ''));
}

/**
 * 끝까지 플레이. picks 는 공통 선택지 7회(COMMON_CHOICES 순서)의 옵션 id, 루트 확정 후 선택지는 첫 옵션.
 * picks 가 모자라거나 고를 옵션이 화면에 없으면(예: 미해금인데 k) 바로 실패한다.
 */
export async function playToEnding(page: Page, picks: string[], onSay?: (i: Info) => Promise<void>) {
  let n = 0;
  for (let guard = 0; guard < 50; guard++) {
    const i = await advanceToStop(page, onSay);
    if (i.mode === 'ending') {
      expect(n, '쓰지 않은 공통 선택').toBe(picks.length);
      return i;
    }
    if (i.frame === 'choice') {
      let opt: string | null;
      if (i.route === null) {
        expect(n, `공통 선택 ${i.step} 에 고를 옵션이 없음(picks ${picks.join(',')})`).toBeLessThan(picks.length);
        opt = picks[n++];
        expect(await visibleChoiceIds(page), `${i.step} 에 보이는 옵션`).toContain(opt);
      } else {
        opt = await page.locator('.choice').first().getAttribute('data-option');
      }
      await pick(page, opt!);
    }
  }
  throw new Error('엔딩에 도달하지 못함');
}

/** 루트가 정해질 때까지(마지막 공통 선택 뒤 독백을 지나 decideRoute 가 실행될 때까지) 진행. 루트가 없던 마지막 대사를 돌려준다 */
export async function advanceToRoute(page: Page): Promise<{ lastCommon: string | null; first: Info }> {
  let lastCommon: string | null = null;
  for (let g = 0; g < 120; g++) {
    const i = await info(page);
    if (i.route !== null) return { lastCommon, first: i };
    if (i.frame === 'choice') throw new Error(`루트가 정해지기 전에 선택지가 또 나옴: ${i.step}`);
    lastCommon = i.step;
    await advanceOne(page);
  }
  throw new Error('루트가 정해지지 않음');
}

export async function openMenu(page: Page) {
  await page.locator('.hud button', { hasText: '메뉴' }).click();
  await expect(page.locator('[data-panel=menu]')).toBeVisible();
}

export async function inViewport(page: Page, selector: string) {
  const vp = page.viewportSize()!;
  const boxes = await page.locator(selector).evaluateAll((els) =>
    els.filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => e.getBoundingClientRect().toJSON()),
  );
  for (const b of boxes) {
    expect(b.left, selector).toBeGreaterThanOrEqual(-0.5);
    expect(b.top, selector).toBeGreaterThanOrEqual(-0.5);
    expect(b.right, selector).toBeLessThanOrEqual(vp.width + 0.5);
    expect(b.bottom, selector).toBeLessThanOrEqual(vp.height + 0.5);
  }
  return boxes as Array<{ left: number; top: number; right: number; bottom: number; width: number; height: number }>;
}

/**
 * 같은 자리를 빠르게 두 번 누른다(마우스: 더블클릭, 터치: 간격 gapMs 의 두 번 탭).
 * 터치는 두 탭의 입력 시각을 CDP 로 직접 정해 보낸다. touchscreen.tap 을 두 번 부르면 테스트 도구·병렬 실행 부하로
 * 간격이 수백 ms 까지 벌어져 더 이상 '더블탭'이 아니게 되기 때문이다.
 */
export async function doubleTap(page: Page, x: number, y: number, gapMs = 120) {
  if (test.info().project.use.hasTouch) {
    requireCdp(page);
    const cdp = await page.context().newCDPSession(page);
    const g = gapMs / 1000;
    const base = Date.now() / 1000 - (g + 0.06); // 두 번째 탭이 '방금' 끝난 시각이 되게
    const pt = [{ x: Math.round(x), y: Math.round(y) }];
    await Promise.all([
      cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt, timestamp: base }),
      cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], timestamp: base + 0.03 }),
      cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt, timestamp: base + g }),
      cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], timestamp: base + g + 0.03 }),
    ]);
    await cdp.detach();
  } else {
    await page.mouse.dblclick(x, y);
  }
}

/**
 * 무대 빈 곳(tapStage 와 같은 자리)을 '입력이 일어난 시각'을 정해 누른다. atEpochMs: Date.now() 기준 ms.
 * 게임은 입력 판정을 처리 시각이 아니라 입력 시각(e.timeStamp)으로 하므로, 테스트 도구 왕복·병렬 실행 부하로
 * 전달이 늦어져도 사람이 그 시각에 누른 것과 같게 판정된다(doubleTap 과 같은 방식, CDP 로 직접 보냄).
 */
export async function tapStageAt(page: Page, atEpochMs: number) {
  const box = await page.locator('.stage').boundingBox();
  if (!box) throw new Error('stage not visible');
  const x = Math.round(box.x + box.width * 0.5);
  const y = Math.round(box.y + box.height * 0.35);
  const t = atEpochMs / 1000;
  requireCdp(page);
  const cdp = await page.context().newCDPSession(page);
  if (test.info().project.use.hasTouch) {
    const pt = [{ x, y }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt, timestamp: t - 0.04 });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], timestamp: t });
  } else {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, timestamp: t - 0.06 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, timestamp: t - 0.04 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, timestamp: t });
  }
  await cdp.detach();
}

/** 요소 가운데를 빠르게 두 번 누른다 */
export async function doubleTapOn(page: Page, selector: string, gapMs = 120) {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`${selector} not visible`);
  await doubleTap(page, box.x + box.width / 2, box.y + box.height / 2, gapMs);
}

/** 메뉴 → 타이틀로 → 확인 */
export async function toTitle(page: Page) {
  await openMenu(page);
  await page.locator('[data-panel=menu] [data-action=title]').click();
  await page.locator('[data-panel=confirm] [data-action=ok]').click();
  await expect(page.locator('#vn')).toHaveAttribute('data-mode', 'title');
}

/** localStorage 의 저장 슬롯 JSON */
export async function readSlot(page: Page, slot: string): Promise<{ summary: { text: string }; state: { sceneId: string; stepId: string } } | null> {
  return page.evaluate((k) => {
    const raw = localStorage.getItem(k);
    return raw ? JSON.parse(raw) : null;
  }, `ashita.save.${slot}`);
}

/**
 * 요소들의 계산된 background-image 에 든 url() 을 실제로 받아 그림인지 확인한다.
 * CSS 변수(--bg)에 상대 주소를 넣으면 빌드(base './')에서 var(--bg) 를 쓰는 CSS 파일 기준으로 풀려
 * /assets/assets/… 처럼 되어 그림이 빠진다. vite preview 는 없는 주소에도 index.html(200)을 돌려주므로
 * 상태 코드가 아니라 content-type 으로 판정한다. min: 적어도 이만큼의 url 이 있어야 한다.
 */
export async function expectCssImages(page: Page, selector: string, min = 1) {
  const urls = await page.locator(selector).evaluateAll((els) =>
    els.flatMap((e) => Array.from(getComputedStyle(e).backgroundImage.matchAll(/url\("?([^")]+)"?\)/g), (m) => m[1])),
  );
  const remote = [...new Set(urls)].filter((u) => !u.startsWith('data:'));
  expect(remote.length, `${selector}: 배경 그림 url 개수`).toBeGreaterThanOrEqual(min);
  for (const u of remote) {
    const res = await page.request.get(u);
    expect(res.status(), u).toBe(200);
    expect(res.headers()['content-type'] ?? '', `${u} 는 그림이어야 함`).toMatch(/^image\//);
  }
}

/**
 * 원하는 위치(장면·스텝)에서 [이어하기]로 시작한다(긴 진행 없이 특정 화면에 서기).
 * 새 게임의 자동 저장을 받아 위치·루트·무대만 바꿔 넣는다. 무대 기본값은 암전(bg black) — 대본이 날짜 카드·장면 전환 앞에서 거는 상태.
 * 장면 진입 스냅샷(sceneEntry)은 다른 장면 것이라 지운다(정확한 위치로 불러오므로 쓰지 않음).
 */
export async function continueAt(
  page: Page,
  at: {
    sceneId: string;
    stepId: string;
    route?: string | null;
    stage?: Record<string, unknown>;
    /** 상태에 덮어쓸 플래그(예: { 'kh.met': true } 로 코하루 해금 상태의 후반 선택지에 서기) */
    flags?: Record<string, boolean | number | string>;
  },
) {
  await newGame(page);
  await toTitle(page);
  await page.evaluate((at) => {
    const d = JSON.parse(localStorage.getItem('ashita.save.auto')!);
    d.state.sceneId = at.sceneId;
    d.state.stepId = at.stepId;
    d.state.route = at.route ?? null;
    d.state.stage = at.stage ?? { bg: 'black', bgm: null, chars: {}, order: [], cg: null };
    if (at.flags) d.state.flags = { ...d.state.flags, ...at.flags };
    delete d.state.sceneEntry;
    const raw = JSON.stringify(d);
    localStorage.setItem('ashita.save.auto', raw);
    // 같은 탭의 쓰기에는 storage 알림이 오지 않으므로, 다른 탭이 쓴 것처럼 알려 타이틀([이어하기] 날짜)을 맞춘다.
    // (알리지 않으면 게임은 '자동 저장이 바뀌었어요' 확인을 먼저 띄운다 — storage.spec 에서 따로 확인)
    window.dispatchEvent(new StorageEvent('storage', { key: 'ashita.save.auto', newValue: raw, storageArea: localStorage }));
  }, at);
  await page.locator('[data-action=continue]').click();
  const changed = page.locator('[data-panel=confirm] [data-action=ok]');
  if (await changed.isVisible().catch(() => false)) await changed.click();
  await expect(page.locator('#vn')).toHaveAttribute('data-mode', 'play');
  await waitSettled(page);
  await expect.poll(async () => (await info(page)).step).toBe(at.stepId);
}

/** 전역 기록(읽은 대사·엔딩·본 CG, src/engine/save.ts GLOBAL_KEY 'ashita.global') */
export async function readGlobal(page: Page): Promise<{ schema: number; read: string[]; endings: string[]; cgs?: string[] }> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('ashita.global') ?? '{"schema":1,"read":[],"endings":[],"cgs":[]}'));
}

/** 자동 저장(ashita.save.auto)에 든 진행 상태 중 분기 확인에 쓰는 부분(플래그는 화면·debugInfo 에 나오지 않는다) */
export async function readAutoState(page: Page): Promise<{
  sceneId: string;
  stepId: string;
  route: string | null;
  points: Record<string, number>;
  choices: Record<string, string>;
  flags: Record<string, boolean | number | string>;
} | null> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('ashita.save.auto');
    return raw ? JSON.parse(raw).state : null;
  });
}
