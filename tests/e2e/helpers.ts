import { expect, test, type Page } from '@playwright/test';

export interface Info {
  mode: string;
  step: string | null;
  frame: string | null;
  route: string | null;
  points: { osana: number; tenko: number } | null;
  lastHeroine: string | null;
  auto: boolean;
  skip: boolean;
  overlays: number;
  /** 무대에 표시 중인 배경 id */
  bg: string | null;
  /** 마지막으로 요청한 배경음 id */
  bgm: string | null;
  typing: boolean;
  textOverflow: boolean;
  readCount: number;
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

/** 연출(암전 등)이 끝나 블로킹 프레임이 표시될 때까지 */
export async function waitSettled(page: Page) {
  await expect
    .poll(async () => {
      const i = await info(page);
      return i.mode !== 'play' || (i.step !== null && !i.typing);
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

/** 끝까지 플레이. picks 는 공통 선택지 순서대로의 옵션 id, 루트 확정 후 선택지는 첫 옵션 */
export async function playToEnding(page: Page, picks: string[], onSay?: (i: Info) => Promise<void>) {
  let n = 0;
  for (let guard = 0; guard < 50; guard++) {
    const i = await advanceToStop(page, onSay);
    if (i.mode === 'ending') return i;
    if (i.frame === 'choice') {
      const opt = i.route === null ? picks[n++] : await page.locator('.choice').first().getAttribute('data-option');
      await pick(page, opt!);
    }
  }
  throw new Error('엔딩에 도달하지 못함');
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

/** 같은 자리를 빠르게 두 번 누른다(마우스: 더블클릭, 터치: 간격 gapMs 의 두 번 탭) */
export async function doubleTap(page: Page, x: number, y: number, gapMs = 120) {
  if (test.info().project.use.hasTouch) {
    await page.touchscreen.tap(x, y);
    await page.waitForTimeout(gapMs);
    await page.touchscreen.tap(x, y);
  } else {
    await page.mouse.dblclick(x, y);
  }
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
