/** 자동 진행·건너뛰기가 선택지/메뉴/처음 보는 대사에서 멈추는지 */
import { expect, test } from '@playwright/test';
import { advanceOne, advanceToStop, boot, info, newGame, openMenu, pick, tapStageAt, toTitle, waitSettled } from './helpers';

test.beforeEach(async ({}, ti) => {
  test.skip(ti.project.name !== 'desktop', '데스크톱에서 확인');
});

test('자동 진행은 선택지에서 멈추고, 메뉴가 열려 있는 동안 멈춘다', async ({ page }) => {
  test.setTimeout(120_000);
  await boot(page, { textSpeed: 10, autoSpeed: 10, bgmVolume: 0, sfxVolume: 0 });
  await newGame(page);
  // 메뉴가 열린 동안 멈춤. 기준은 메뉴가 열린 시점의 대사(자동을 켠 뒤 메뉴가 열리기 전, 부하가 크면
  // 가장 빠른 자동 속도로 한 줄 넘어갈 수 있다 — 그건 정상 동작이라 여기서 보는 것이 아니다)
  await page.locator('.hud button', { hasText: '자동' }).click();
  await openMenu(page);
  const s0 = (await info(page)).step;
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

test('건너뛰기가 처음 보는 대사에서 스스로 멈춘 직후의 "정지" 클릭은 그 대사를 넘기지 않는다', async ({ page }) => {
  await boot(page); // 글자 즉시 표시: 타자 효과가 클릭을 흡수하지 않는 가장 엄한 조건
  await newGame(page);
  for (let k = 0; k < 4; k++) await advanceOne(page);
  const target = (await info(page)).step; // 아직 넘기지 않은(처음 보는) 대사
  await toTitle(page);
  await newGame(page);
  // 건너뛰기가 멈춘 순간(멈춤 안내 토스트가 붙는 순간 = 입력 잠금이 걸리는 순간)을 페이지 안에서 잡고,
  // 누른 시각을 그 순간 + 120ms(멈춘 것을 본 사용자가 반사적으로 누르는 시점)로 정해 보낸다.
  // (예전에는 rAF 폴링 → setTimeout → 테스트 왕복 → 클릭이라, 부하가 크면 실제 입력이 잠금 시간을 넘겨 불안정했다)
  await page.evaluate(() => {
    const w = window as unknown as { __skipStop?: Promise<{ epoch: number; perf: number; toast: string }>; __clicks?: number[] };
    w.__clicks = [];
    document.getElementById('vn')!.addEventListener('click', (e) => w.__clicks!.push(e.timeStamp), { capture: true });
    w.__skipStop = new Promise((resolve) => {
      const root = document.getElementById('vn')!;
      const mo = new MutationObserver(() => {
        const t = root.querySelector(':scope > .toast');
        if (!t || !t.textContent?.includes('처음 보는')) return;
        mo.disconnect();
        resolve({ epoch: performance.timeOrigin + performance.now(), perf: performance.now(), toast: t.textContent ?? '' });
      });
      mo.observe(root, { childList: true });
    });
  });
  await page.locator('.hud button', { hasText: '스킵' }).click();
  const stop = await page.evaluate(async () => {
    const s = await (window as unknown as { __skipStop: Promise<{ epoch: number; perf: number; toast: string }> }).__skipStop;
    // 보낼 입력 시각(멈춤 + 120ms)이 페이지 시계보다 미래가 되지 않게 그 시각이 지날 때까지 기다린다
    while (performance.now() < s.perf + 140) await new Promise((r) => setTimeout(r, 10));
    (window as unknown as { __clicks: number[] }).__clicks = []; // [스킵] 클릭은 빼고 센다
    return s;
  });
  await tapStageAt(page, stop.epoch + 120);
  // 입력 시각이 실제로 '멈춤 + 120ms'로 전달됐는지(도구가 시각을 무시하면 이 테스트는 의미가 없다)
  await expect.poll(() => page.evaluate(() => (window as unknown as { __clicks: number[] }).__clicks.length)).toBeGreaterThan(0);
  const clickAt = await page.evaluate(() => (window as unknown as { __clicks: number[] }).__clicks[0]);
  expect(Math.abs(clickAt - (stop.perf + 120))).toBeLessThan(30);
  await page.waitForTimeout(500);
  const i = await info(page);
  expect(i.skip).toBe(false);
  expect(i.step).toBe(target);
  // 멈출 때 안내 토스트가 떴다(토스트는 2.2초 뒤 사라지므로 멈춘 순간에 잡은 문구로 확인)
  expect(stop.toast).toContain('처음 보는');
  // 잠금이 풀린 뒤에는 정상적으로 넘어간다
  await advanceOne(page);
  expect((await info(page)).step).not.toBe(target);
});
