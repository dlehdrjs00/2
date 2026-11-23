/** 선택 전후 · 루트 진입 후 · 후일담에서의 저장/불러오기, 새로고침 후 이어하기 */
import { expect, test, type Page } from '@playwright/test';
import { advanceOne, advanceToStop, boot, info, newGame, openMenu, pick, waitSettled } from './helpers';

test.beforeEach(async ({}, ti) => {
  test.skip(ti.project.name === 'phone-se-landscape', '저장 흐름은 데스크톱·휴대폰 1종에서 확인');
});

async function saveTo(page: Page, slot: string) {
  await openMenu(page);
  await page.locator('[data-panel=menu] [data-action=save]').click();
  const card = page.locator(`[data-panel=save] .slot[data-slot="${slot}"]`);
  await card.click();
  const ok = page.locator('[data-panel=confirm] [data-action=ok]');
  if (await ok.isVisible().catch(() => false)) await ok.click();
  await expect(page.locator(`[data-panel=save] .slot[data-slot="${slot}"] .slot-meta`)).toBeVisible();
  // 저장 패널·메뉴 닫기
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await info(page)).overlays).toBe(0);
}

async function loadFrom(page: Page, slot: string) {
  const i = await info(page);
  if (i.mode === 'play') {
    await openMenu(page);
    await page.locator('[data-panel=menu] [data-action=load]').click();
  } else {
    await page.locator('[data-action=load]').click();
  }
  await page.locator(`[data-panel=load] .slot[data-slot="${slot}"]`).click();
  const ok = page.locator('[data-panel=confirm] [data-action=ok]');
  if (await ok.isVisible().catch(() => false)) await ok.click();
  await expect(page.locator('#vn')).toHaveAttribute('data-mode', 'play');
  await expect.poll(async () => (await info(page)).overlays).toBe(0);
  await waitSettled(page);
}

test('선택 전 저장 → 다른 선택 → 불러오기 → 같은 선택지로 복귀', async ({ page }) => {
  await boot(page);
  await newGame(page);
  const c1 = await advanceToStop(page);
  expect(c1.frame).toBe('choice');
  await saveTo(page, '1');
  await pick(page, 'b');
  const afterB = await info(page);
  expect(afterB.points).toEqual({ osana: 0, tenko: 1 });
  await advanceOne(page);
  await loadFrom(page, '1');
  const back = await info(page);
  expect(back.step).toBe(c1.step);
  expect(back.frame).toBe('choice');
  expect(back.points).toEqual({ osana: 0, tenko: 0 });
  await expect(page.locator('.choice')).toHaveCount(2);
  await pick(page, 'a');
  const afterA = await info(page);
  expect(afterA.points).toEqual({ osana: 1, tenko: 0 });
  expect(afterA.step).not.toBe(afterB.step); // 선택 직후 반응이 다르다
});

test('루트 진입 후·후일담 저장, 새로고침 후 불러오기와 이어하기', async ({ page }) => {
  test.setTimeout(240_000);
  await boot(page);
  await newGame(page);
  for (const p of ['a', 'b', 'a', 'b']) {
    await advanceToStop(page);
    await pick(page, p);
  }
  const inRoute = await info(page);
  expect(inRoute.route).toBe('tenko');
  await advanceOne(page);
  const routeLine = await info(page);
  await saveTo(page, '2');

  // 후일담까지 진행
  let epi = await info(page);
  for (let g = 0; g < 400; g++) {
    epi = await info(page);
    if (epi.frame === 'choice') {
      await pick(page, (await page.locator('.choice').first().getAttribute('data-option'))!);
      continue;
    }
    const inEpilogue = await page.evaluate(() => document.querySelector('#vn')!.getAttribute('data-step'));
    if (/^t[5-7]/.test(inEpilogue ?? '')) break;
    await advanceOne(page);
  }
  expect(epi.step).toMatch(/^t[5-7]/);
  await advanceOne(page);
  const epiLine = await info(page);
  await saveTo(page, '3');
  await advanceOne(page);
  await advanceOne(page);
  const beforeReload = await info(page);

  // 새로고침 → 이어하기: 마지막으로 보던 문장
  await page.reload();
  await expect(page.locator('#vn')).toHaveAttribute('data-mode', 'title');
  await page.locator('[data-action=continue]').click();
  await waitSettled(page);
  const cont = await info(page);
  expect(cont.step).toBe(beforeReload.step);
  expect(cont.route).toBe('tenko');

  // 후일담 저장 불러오기
  await loadFrom(page, '3');
  expect((await info(page)).step).toBe(epiLine.step);

  // 타이틀에서 루트 저장 불러오기
  await page.reload();
  await loadFrom(page, '2');
  const r2 = await info(page);
  expect(r2.step).toBe(routeLine.step);
  expect(r2.route).toBe('tenko');
});

test('손상된 저장 데이터는 안내 후 삭제할 수 있고 게임은 계속된다', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('ashita.save.auto', '{"schema":1,"game":"ashita-mo-issho","state":{oops');
      localStorage.setItem('ashita.save.4', JSON.stringify({ schema: 99, game: 'ashita-mo-issho', state: {} }));
      sessionStorage.setItem('seeded', '1');
    }
  });
  await boot(page);
  await page.locator('[data-action=continue]').click();
  await expect(page.locator('[data-panel=confirm] .dialog-msg')).toContainText('손상');
  await page.locator('[data-panel=confirm] [data-action=ok]').click(); // 삭제
  await expect(page.locator('[data-action=continue]')).toBeDisabled();
  await page.locator('[data-action=load]').click();
  await expect(page.locator('[data-panel=load] .slot[data-slot="4"]')).toHaveClass(/broken/);
  await page.locator('[data-panel=load] .slot[data-slot="4"]').click();
  await expect(page.locator('[data-panel=confirm] .dialog-msg')).toContainText('새로운 버전');
  await page.locator('[data-panel=confirm] [data-action=cancel]').click();
  await page.keyboard.press('Escape');
  await newGame(page);
  expect((await info(page)).mode).toBe('play');
});
