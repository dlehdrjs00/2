/** 메뉴·선택지 입력이 대사 진행으로 새지 않는지, 빠른 연속 입력에 두 번 선택되지 않는지 */
import { expect, test } from '@playwright/test';
import { advanceOne, advanceToStop, boot, info, newGame, openMenu, tapBackground, waitSettled } from './helpers';

test('메뉴·기록·설정을 열고 닫아도 대사가 넘어가지 않는다', async ({ page }) => {
  await boot(page);
  await newGame(page);
  await advanceOne(page);
  const start = (await info(page)).step;

  await openMenu(page);
  await page.locator('[data-panel=menu] [data-action=close]').click();
  await page.waitForTimeout(400);
  expect((await info(page)).step).toBe(start);

  // 메뉴 바깥(어두운 배경)을 눌러 닫기
  await openMenu(page);
  const vp = page.viewportSize()!;
  await page.mouse.click(6, vp.height / 2);
  await expect.poll(async () => (await info(page)).overlays).toBe(0);
  await page.waitForTimeout(300);
  expect((await info(page)).step).toBe(start);

  // 설정 슬라이더 조작
  await openMenu(page);
  await page.locator('[data-panel=menu] [data-action=settings]').click();
  const slider = page.locator('[data-setting=bgmVolume]');
  const sb = (await slider.boundingBox())!;
  await page.mouse.click(sb.x + sb.width * 0.3, sb.y + sb.height / 2);
  await page.mouse.click(sb.x + sb.width * 0.8, sb.y + sb.height / 2);
  await page.locator('[data-panel=settings] .panel-foot .btn.primary').click();
  await page.locator('[data-panel=menu] [data-action=resume]').click();
  await page.waitForTimeout(300);
  expect((await info(page)).step).toBe(start);

  // 기록
  await page.locator('.hud button', { hasText: '기록' }).click();
  await expect(page.locator('[data-panel=log] .log-item').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  expect((await info(page)).step).toBe(start);

  // HUD 버튼 자체를 눌러도 진행되지 않음
  await page.locator('.hud button', { hasText: '자동' }).click();
  await page.locator('.hud button', { hasText: '자동' }).click();
  expect((await info(page)).step).toBe(start);

  // 그 다음 일반 입력은 정상 진행
  await advanceOne(page);
  expect((await info(page)).step).not.toBe(start);
});

test('선택지: 배경 클릭으로 넘어가지 않고, 빠른 연속 입력에도 한 번만 선택된다', async ({ page }) => {
  await boot(page);
  await newGame(page);
  const c = await advanceToStop(page);
  expect(c.frame).toBe('choice');

  // 선택지 표시 중 배경·대사창 영역 연타
  for (let k = 0; k < 5; k++) await tapBackground(page);
  // 대사창 영역도 연타
  const tb = (await page.locator('.textbox').boundingBox())!;
  for (let k = 0; k < 3; k++) await page.mouse.click(tb.x + tb.width / 2, tb.y + tb.height / 2);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  let now = await info(page);
  expect(now.step).toBe(c.step);
  expect(now.points).toEqual({ osana: 0, tenko: 0 });

  // 같은 선택지 연타 + 다른 선택지 즉시 클릭
  const a = page.locator('.choice[data-option=a]');
  const b = page.locator('.choice[data-option=b]');
  const ab = (await a.boundingBox())!;
  const bb = (await b.boundingBox())!;
  await page.mouse.click(ab.x + ab.width / 2, ab.y + ab.height / 2, { clickCount: 1 });
  await page.mouse.click(ab.x + ab.width / 2, ab.y + ab.height / 2, { clickCount: 2 });
  await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await page.keyboard.press('2');
  await expect.poll(async () => (await info(page)).frame).not.toBe('choice');
  await waitSettled(page);
  now = await info(page);
  expect(now.points).toEqual({ osana: 1, tenko: 0 });
  expect(now.frame).not.toBe('choice');
  const firstReaction = now.step;
  // 선택 직후 연타가 다음 대사까지 넘기지 않았는지(첫 반응 대사에 머묾)
  await page.waitForTimeout(500);
  expect((await info(page)).step).toBe(firstReaction);
});

test('키보드: 포커스된 HUD 버튼에서 Enter/Space 를 눌러도 대사가 두 번 진행되지 않는다', async ({ page }, ti) => {
  test.skip(ti.project.name !== 'desktop');
  await boot(page);
  await newGame(page);
  await advanceOne(page);
  const s0 = (await info(page)).step;
  await page.locator('.hud button', { hasText: '기록' }).focus();
  await page.keyboard.press('Enter'); // 기록 열림(진행 아님)
  await expect(page.locator('[data-panel=log]')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  expect((await info(page)).step).toBe(s0);
  await page.locator('body').click({ position: { x: 1, y: 1 }, force: true }).catch(() => undefined);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const s1 = (await info(page)).step;
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await info(page)).step).not.toBe(s1);
});
