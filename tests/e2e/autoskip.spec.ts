/** 자동 진행·건너뛰기가 선택지/메뉴/처음 보는 대사에서 멈추는지 */
import { expect, test } from '@playwright/test';
import { advanceToStop, boot, info, newGame, openMenu, pick, waitSettled } from './helpers';

test.beforeEach(async ({}, ti) => {
  test.skip(ti.project.name !== 'desktop', '데스크톱에서 확인');
});

test('자동 진행은 선택지에서 멈추고, 메뉴가 열려 있는 동안 멈춘다', async ({ page }) => {
  test.setTimeout(120_000);
  await boot(page, { textSpeed: 10, autoSpeed: 10, bgmVolume: 0, sfxVolume: 0 });
  await newGame(page);
  const s0 = (await info(page)).step;
  // 메뉴가 열린 동안 멈춤
  await page.locator('.hud button', { hasText: '자동' }).click();
  await openMenu(page);
  await page.waitForTimeout(2500);
  expect((await info(page)).step).toBe(s0);
  await page.locator('[data-panel=menu] [data-action=resume]').click();
  await expect.poll(async () => (await info(page)).step, { timeout: 8000 }).not.toBe(s0);

  // 선택지까지 자동으로 가서 멈춤
  await expect.poll(async () => (await info(page)).frame, { timeout: 90_000, intervals: [300] }).toBe('choice');
  const c = await info(page);
  await page.waitForTimeout(3500);
  const still = await info(page);
  expect(still.step).toBe(c.step);
  expect(still.auto).toBe(true);
  await expect(page.locator('.choice')).toHaveCount(2);

  // 선택 후 자동 진행 계속
  await pick(page, 'a');
  const after = (await info(page)).step;
  await expect.poll(async () => (await info(page)).step, { timeout: 8000 }).not.toBe(after);
});

test('건너뛰기는 읽은 대사만 넘기고, 선택지·처음 보는 대사에서 멈춘다', async ({ page }) => {
  test.setTimeout(120_000);
  await boot(page);
  await newGame(page);
  // 처음 보는 대사에서는 시작되지 않음
  const s0 = (await info(page)).step;
  await page.locator('.hud button', { hasText: '스킵' }).click();
  await expect(page.locator('.toast')).toContainText('처음 보는');
  expect((await info(page)).skip).toBe(false);
  expect((await info(page)).step).toBe(s0);

  // 첫 선택지까지 직접 읽고 a 선택 후 몇 줄 읽기
  const c1 = await advanceToStop(page);
  await pick(page, 'a');
  const reactionA = (await info(page)).step;

  // 타이틀 → 새 게임 → 건너뛰기: 첫 선택지에서 멈춤
  await openMenu(page);
  await page.locator('[data-panel=menu] [data-action=title]').click();
  await page.locator('[data-panel=confirm] [data-action=ok]').click();
  await newGame(page);
  await page.locator('.hud button', { hasText: '스킵' }).click();
  await expect.poll(async () => (await info(page)).frame, { timeout: 30_000 }).toBe('choice');
  let i = await info(page);
  expect(i.step).toBe(c1.step);
  expect(i.skip).toBe(false);

  // 아직 안 읽은 b 반응을 선택 → 건너뛰기 시도 → 첫 줄에서 바로 멈춤
  await pick(page, 'b');
  const reactionB = (await info(page)).step;
  expect(reactionB).not.toBe(reactionA);
  await page.locator('.hud button', { hasText: '스킵' }).click();
  await page.waitForTimeout(800);
  i = await info(page);
  expect(i.step).toBe(reactionB);
  expect(i.skip).toBe(false);
  await waitSettled(page);
});
