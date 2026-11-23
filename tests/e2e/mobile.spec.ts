/** 휴대폰 가로 화면 배치와 세로↔가로 전환 */
import { expect, test } from '@playwright/test';
import { advanceOne, advanceToStop, boot, info, inViewport, newGame, openMenu } from './helpers';

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
  for (const b of hud) expect(Math.min(b.width, b.height)).toBeGreaterThanOrEqual(40);
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
