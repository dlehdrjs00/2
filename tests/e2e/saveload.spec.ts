/** 선택 전후 · 루트 진입 후 · 후일담에서의 저장/불러오기, 새로고침 후 이어하기 */
import { expect, test, type Page } from '@playwright/test';
import { advanceOne, advanceToStop, boot, info, newGame, openMenu, pick, readSlot, tapBackground, toTitle, waitChoicesArmed, waitSettled } from './helpers';

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
  // 오버레이를 닫은 직후의 짧은 입력 잠금(250ms, 중복 입력 흡수)이 풀린 뒤에 다음 조작을 한다
  await page.waitForTimeout(300);
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
  // 루트는 마지막 공통 선택지의 반응 대사 뒤에 확정된다
  for (let g = 0; g < 80 && (await info(page)).route === null; g++) await advanceOne(page);
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

test('선택지가 떠 있을 때 불러오면 이전 선택지가 화면에 남지 않는다', async ({ page }) => {
  await boot(page);
  await newGame(page);
  await advanceOne(page);
  const saved = (await info(page)).step;
  await saveTo(page, '1');
  const c = await advanceToStop(page);
  expect(c.frame).toBe('choice');
  await expect(page.locator('.choice')).toHaveCount(2);
  await loadFrom(page, '1');
  const back = await info(page);
  expect(back.step).toBe(saved);
  expect(back.frame).toBe('say');
  await expect(page.locator('.choices')).not.toHaveClass(/\bon\b/);
  await expect(page.locator('.choice')).toHaveCount(0);
  // 무대 가장자리를 눌러도 정상적으로 진행된다(남은 선택지 영역이 입력을 막지 않음)
  await page.waitForTimeout(450);
  await tapBackground(page);
  await expect.poll(async () => (await info(page)).step).not.toBe(saved);
});

test('선택 직후 바로 페이지를 떠나도 자동 저장의 요약이 실제 위치(선택 후)와 맞는다', async ({ page }) => {
  await boot(page);
  await newGame(page);
  const c = await advanceToStop(page);
  expect(c.frame).toBe('choice');
  await waitChoicesArmed(page);
  // 선택 후 다음 대사를 그리기 전(200ms 연출 구간)에 새로고침
  await page.evaluate(() => {
    (document.querySelector('.choice[data-option=b]') as HTMLButtonElement).click();
    location.reload();
  });
  await expect(page.locator('#vn')).toHaveAttribute('data-mode', 'title');
  const auto = (await readSlot(page, 'auto'))!;
  expect(auto.state.stepId).not.toBe(c.step);
  expect(auto.summary.text.startsWith('[선택지]')).toBe(false);
  await page.locator('[data-action=load]').click();
  await expect(page.locator('[data-panel=load] .slot[data-slot=auto] .slot-text')).not.toContainText('[선택지]');
});

test('무대 정보 일부를 복원하지 못한 저장을 불러오면 그 사실을 알려 준다', async ({ page }) => {
  await boot(page);
  await newGame(page);
  await advanceOne(page);
  await advanceOne(page);
  const charsBefore = await page.locator('.stage img.char').count();
  await toTitle(page);
  // 에셋 이름이 바뀐 상황: 저장된 배경·표정 이름이 매니페스트에 없다
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('ashita.save.auto')!);
    d.state.stage.bg = 'renamed_bg_xyz';
    for (const c of Object.values(d.state.stage.chars) as Array<{ expr: string }>) c.expr = 'renamed_expr';
    localStorage.setItem('ashita.save.auto', JSON.stringify(d));
  });
  await page.locator('[data-action=continue]').click();
  await waitSettled(page);
  const i = await info(page);
  const charsAfter = await page.locator('.stage img.char').count();
  // 검은 화면이 되거나 캐릭터가 빠졌다면 반드시 이유를 안내한다
  if (i.bg === 'black' || charsAfter < charsBefore) await expect(page.locator('.toast')).toContainText('복원하지 못했어요');
  else await expect(page.locator('.toast')).toContainText('불러왔어요');
});

test("'장면 처음부터' 복구는 그 장면의 배경·음악을 되살리고 이전 선택지를 남기지 않는다", async ({ page }) => {
  await boot(page);
  await newGame(page);
  await advanceToStop(page);
  await pick(page, 'a');
  const before = await info(page);
  expect(before.bgm).not.toBeNull();
  await toTitle(page);
  // 대본 수정으로 저장한 문장이 사라진 상황
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('ashita.save.auto')!);
    d.state.stepId = `${d.state.stepId}_removed`;
    localStorage.setItem('ashita.save.auto', JSON.stringify(d));
  });
  await page.reload();
  await expect(page.locator('#vn')).toHaveAttribute('data-mode', 'title');
  await page.locator('[data-action=continue]').click();
  await expect(page.locator('[data-panel=confirm] .dialog-msg')).toContainText('장면 처음부터');
  await page.locator('[data-panel=confirm] [data-action=ok]').click();
  await expect(page.locator('#vn')).toHaveAttribute('data-mode', 'play');
  await waitSettled(page);
  const r = await info(page);
  expect(r.points).toEqual({ osana: 0, tenko: 0 }); // 그 장면의 선택이 되돌려짐(엔진 복구)
  expect(r.bg).not.toBe('black');
  expect(r.bgm).toBe(before.bgm); // 타이틀 곡이 계속 나오지 않음
  await expect(page.locator('.choice')).toHaveCount(r.frame === 'choice' ? 2 : 0);
});
