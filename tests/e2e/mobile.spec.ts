/** 휴대폰 가로 화면 배치와 세로↔가로 전환 */
import { expect, test } from '@playwright/test';
import { advanceOne, advanceToStop, boot, info, inViewport, newGame, openMenu, waitSettled } from './helpers';

test.beforeEach(async ({}, ti) => {
  test.skip(!ti.project.name.startsWith('phone'), '휴대폰 프로젝트 전용');
});

function overlap(a: DOMRectLike, b: DOMRectLike) {
  return a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
}
type DOMRectLike = { left: number; top: number; right: number; bottom: number };

test('가로: 대사창·HUD·선택지·메뉴가 잘리거나 겹치지 않고 터치 영역이 충분하다', async ({ page }) => {
  await boot(page);
  // 타이틀 버튼
  const titleBtns = await inViewport(page, '.title-menu .btn');
  for (const b of titleBtns) expect(b.height).toBeGreaterThanOrEqual(44);

  await newGame(page);
  await advanceOne(page);
  const hud = await inViewport(page, '.hud button');
  expect(hud.length).toBe(4);
  for (const b of hud) expect(Math.min(b.width, b.height)).toBeGreaterThanOrEqual(44);
  for (let i = 0; i < hud.length; i++) for (let j = i + 1; j < hud.length; j++) expect(overlap(hud[i], hud[j])).toBe(false);
  const [tb] = await inViewport(page, '.textbox');
  for (const b of hud) expect(overlap(b, tb)).toBe(false);
  const fs = await page.locator('.textbox .text').evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  expect(fs).toBeGreaterThanOrEqual(16);

  // 선택지
  const c = await advanceToStop(page);
  expect(c.frame).toBe('choice');
  const choices = await inViewport(page, '.choice');
  for (const b of choices) {
    expect(b.height).toBeGreaterThanOrEqual(44);
    expect(overlap(b, tb)).toBe(false);
    for (const h of hud) expect(overlap(b, h)).toBe(false);
  }
  expect(overlap(choices[0], choices[1])).toBe(false);
  await page.screenshot({ path: test.info().outputPath('choice.png') });

  // 메뉴와 저장 화면
  await openMenu(page);
  const items = await inViewport(page, '[data-panel=menu] .btn');
  for (const b of items) expect(b.height).toBeGreaterThanOrEqual(44);
  await page.locator('[data-panel=menu] [data-action=save]').click();
  await inViewport(page, '[data-panel=save] .panel-head');
  const firstSlot = await page.locator('[data-panel=save] .slot').first().boundingBox();
  expect(firstSlot!.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: test.info().outputPath('save.png') });
  await page.keyboard.press('Escape');
  await page.locator('[data-panel=menu] [data-action=settings]').click();
  await inViewport(page, '[data-panel=settings] .panel-head .btn');
  await page.screenshot({ path: test.info().outputPath('settings.png') });
});

test('세로로 돌리면 안내가 뜨고, 다시 가로로 돌려도 진행 상태가 유지된다', async ({ page }) => {
  await boot(page);
  await newGame(page);
  await advanceOne(page);
  await advanceOne(page);
  const before = await info(page);
  const land = page.viewportSize()!;

  await page.setViewportSize({ width: land.height, height: land.width });
  await expect(page.locator('.rotate')).toBeVisible();
  // 안내 화면을 눌러도 진행되지 않음
  await page.touchscreen.tap(land.height / 2, land.width * 0.3);
  await page.waitForTimeout(300);
  expect((await info(page)).step).toBe(before.step);
  await page.screenshot({ path: test.info().outputPath('portrait.png') });

  await page.setViewportSize(land);
  await expect(page.locator('.rotate')).toBeHidden();
  const after = await info(page);
  expect(after.step).toBe(before.step);
  expect(after.mode).toBe('play');
  await advanceOne(page);
  expect((await info(page)).step).not.toBe(before.step);

  // 세로로 계속하기: 대사창이 무대 아래로 가고 화면 안에 있음
  await page.setViewportSize({ width: land.height, height: land.width });
  await page.locator('[data-action=keep-portrait]').click();
  await expect(page.locator('.rotate')).toBeHidden();
  await expect(page.locator('#vn')).toHaveAttribute('data-layout', 'below');
  await inViewport(page, '.textbox');
  await inViewport(page, '.hud button');
  const s = (await info(page)).step;
  await advanceOne(page);
  expect((await info(page)).step).not.toBe(s);
  await page.screenshot({ path: test.info().outputPath('portrait-keep.png') });
});

test('두 손가락으로 확대해도 배치가 다시 계산되지 않아 대사가 잘리지 않는다', async ({ page }) => {
  await boot(page);
  await newGame(page);
  await advanceOne(page);
  const vars = () =>
    page.evaluate(() => {
      const s = getComputedStyle(document.getElementById('vn')!);
      return ['--sx', '--sy', '--sw', '--sh', '--th', '--fs'].map((k) => s.getPropertyValue(k).trim()).join(' ');
    });
  const before = await vars();
  const cdp = await page.context().newCDPSession(page);
  // 두 손가락 확대와 같은 상태(비주얼 뷰포트만 2배 확대). 이 환경의 Chromium 은 합성 핀치 제스처를 처리하지 않아 배율을 직접 바꾼다
  await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
  await expect.poll(() => page.evaluate(() => window.visualViewport?.scale ?? 1)).toBeGreaterThan(1.5);
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await page.waitForTimeout(300);
  expect(await vars()).toBe(before);
  expect((await info(page)).textOverflow).toBe(false);
  // 확대한 채로 대사를 넘겨도 잘리지 않는다(확대 중 터치 좌표 변환을 피해 키보드로 진행)
  const s0 = (await info(page)).step;
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await info(page)).step).not.toBe(s0);
  await waitSettled(page);
  expect((await info(page)).textOverflow).toBe(false);
  // 다시 원래 배율로
  await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
  await expect.poll(() => page.evaluate(() => window.visualViewport?.scale ?? 1)).toBeLessThan(1.05);
  await page.waitForTimeout(200);
  expect(await vars()).toBe(before);
});

test('터치: 메뉴의 [대사창 숨기기]로 숨기고(빠른 메뉴가 4개뿐인 compact 단계 포함), 탭하면 복귀만 한다', async ({ page }) => {
  await boot(page);
  await newGame(page);
  await advanceOne(page);
  const land = page.viewportSize()!;
  for (const vp of [land, { width: 740, height: 320 }]) {
    await page.setViewportSize(vp);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const s0 = (await info(page)).step;
    await openMenu(page);
    await inViewport(page, '[data-panel=menu] [data-action=hide]');
    const hb = (await page.locator('[data-panel=menu] [data-action=hide]').boundingBox())!;
    await page.touchscreen.tap(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await expect(page.locator('#vn')).toHaveAttribute('data-hidewin', '1');
    expect((await info(page)).overlays).toBe(0);
    await page.waitForTimeout(650);
    const st = (await page.locator('.stage').boundingBox())!;
    await page.touchscreen.tap(st.x + st.width / 2, st.y + st.height * 0.35);
    await expect(page.locator('#vn')).not.toHaveAttribute('data-hidewin', '1');
    await page.waitForTimeout(450);
    expect((await info(page)).step, `${vp.width}x${vp.height}: 복귀 탭이 대사를 넘김`).toBe(s0);
  }
  await expect(page.locator('#vn')).toHaveAttribute('data-qm', 'compact');
});

test('터치: 누른 자리 아래 버튼에 마우스 올림(hover) 모양이 남지 않는다', async ({ page }) => {
  const land = page.viewportSize()!;
  await page.setViewportSize({ width: land.height, height: land.width });
  await boot(page);
  expect(await page.evaluate(() => matchMedia('(hover: hover)').matches)).toBe(false);
  // 세로 안내의 [세로 화면으로 계속하기]를 누름 → 그 자리 아래 타이틀 버튼이 hover 로 밀려나지 않음.
  // 휴대폰 브라우저는 탭한 자리에 :hover 를 붙여 두므로(끈끈한 hover), 같은 상태를 만드는 마우스 클릭으로 누른다
  await page.locator('[data-action=keep-portrait]').click();
  await expect(page.locator('.rotate')).toBeHidden();
  await page.waitForTimeout(300);
  const moved = await page.locator('.title-menu .btn').evaluateAll((bs) => bs.map((b) => getComputedStyle(b).translate).filter((t) => t !== 'none' && t !== '0px'));
  expect(moved).toEqual([]);
});
