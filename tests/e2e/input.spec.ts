/** 메뉴·선택지 입력이 대사 진행으로 새지 않는지, 빠른 연속 입력에 두 번 선택되지 않는지 */
import { expect, test } from '@playwright/test';
import {
  advanceOne,
  advanceToStop,
  boot,
  doubleTap,
  doubleTapOn,
  info,
  newGame,
  openMenu,
  pick,
  readSlot,
  tapBackground,
  tapStage,
  toTitle,
  waitChoicesArmed,
  waitSettled,
} from './helpers';

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
  // 배경음 음량은 설정 시트의 '소리' 분류 안에 있다
  await page.locator('[data-panel=settings] [data-cfg=sound]').click();
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
  expect(now.points).toEqual({ osana: 0, tenko: 0, koharu: 0 });

  // 같은 선택지 연타 + 다른 선택지 즉시 클릭(선택지가 다 나타나 누를 수 있게 된 뒤)
  await waitChoicesArmed(page);
  const a = page.locator('.choice[data-option=a]');
  const b = page.locator('.choice[data-option=b]');
  const ab = (await a.boundingBox())!;
  const bb = (await b.boundingBox())!;
  await page.mouse.click(ab.x + ab.width / 2, ab.y + ab.height / 2, { clickCount: 1 });
  await page.mouse.click(ab.x + ab.width / 2, ab.y + ab.height / 2, { clickCount: 2 });
  await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await page.keyboard.press('2');
  await page.keyboard.press('3');
  await expect.poll(async () => (await info(page)).frame).not.toBe('choice');
  await waitSettled(page);
  now = await info(page);
  // 첫 입력(a, c3 개인 +2)만 반영. 뒤의 b 클릭·숫자 키 2·3(함께)은 무시된다
  expect(now.points).toEqual({ osana: 2, tenko: 0, koharu: 0 });
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

test('대사→선택지 경계의 연타, 선택지·대사에서 [이어하기] 더블클릭은 선택·진행으로 새지 않는다', async ({ page }) => {
  await boot(page);
  await newGame(page);
  // 선택지 바로 앞 대사의 자동 저장을 기억해 둔다
  let preChoice = '';
  const c = await advanceToStop(page, async () => {
    preChoice = await page.evaluate(() => localStorage.getItem('ashita.save.auto') ?? '');
  });
  expect(c.frame).toBe('choice');
  expect(preChoice).not.toBe('');

  // 1) 선택지 직전 대사에서, 대사를 넘기려고 무대 가운데(선택지 버튼이 나타날 자리)를 빠르게 두 번 누른다
  await page.evaluate((raw) => localStorage.setItem('ashita.save.1', raw), preChoice);
  await openMenu(page);
  await page.locator('[data-panel=menu] [data-action=load]').click();
  await page.locator('[data-panel=load] .slot[data-slot="1"]').click();
  await page.locator('[data-panel=confirm] [data-action=ok]').click();
  await expect.poll(async () => (await info(page)).frame).toBe('say');
  await page.waitForTimeout(500); // 불러온 직후 잠금이 풀린 뒤
  const box = (await page.locator('.stage').boundingBox())!;
  await doubleTap(page, box.x + box.width * 0.5, box.y + box.height * 0.35, 150);
  await page.waitForTimeout(800);
  let now = await info(page);
  expect(now.step).toBe(c.step);
  expect(now.frame).toBe('choice');
  expect(now.points).toEqual({ osana: 0, tenko: 0, koharu: 0 });

  // 2) 자동 저장이 선택지일 때 타이틀의 [이어하기]를 두 번 누른다 → 복원된 선택지가 골라지지 않음
  await page.reload();
  await expect(page.locator('#vn')).toHaveAttribute('data-mode', 'title');
  expect((await readSlot(page, 'auto'))!.state.stepId).toBe(c.step);
  await doubleTapOn(page, '[data-action=continue]');
  await page.waitForTimeout(800);
  now = await info(page);
  expect(now.mode).toBe('play');
  expect(now.step).toBe(c.step);
  expect(now.points).toEqual({ osana: 0, tenko: 0, koharu: 0 });
  expect((await readSlot(page, 'auto'))!.state.stepId).toBe(c.step);

  // 3) 자동 저장이 대사일 때 [이어하기] 더블클릭 → 이어 읽을 문장이 넘어가지 않음
  await pick(page, 'a');
  const line = await info(page);
  await page.reload();
  await expect(page.locator('#vn')).toHaveAttribute('data-mode', 'title');
  const read0 = (await info(page)).readCount;
  await doubleTapOn(page, '[data-action=continue]');
  await page.waitForTimeout(800);
  now = await info(page);
  expect(now.step).toBe(line.step);
  expect(now.readCount).toBe(read0);
});

test('화면이 바뀐 직후 같은 자리 두 번째 클릭은 새로 나타난 버튼·슬롯·배경에 닿지 않는다', async ({ page }) => {
  await boot(page);
  await newGame(page);
  await advanceOne(page);
  // 이른 위치를 수동 슬롯 1~6 에 복사하고 더 진행한다(자동 저장이 더 최신)
  await page.evaluate(() => {
    const raw = localStorage.getItem('ashita.save.auto')!;
    for (let i = 1; i <= 6; i++) localStorage.setItem(`ashita.save.${i}`, raw);
  });
  for (let k = 0; k < 3; k++) await advanceOne(page);

  // HUD [메뉴] 더블클릭: 두 번째 클릭이 어두운 배경에 닿아 바로 닫히지 않음
  await doubleTapOn(page, '.hud button:has-text("메뉴")');
  await page.waitForTimeout(500);
  expect((await info(page)).overlays).toBe(1);
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await info(page)).overlays).toBe(0);

  await toTitle(page);
  const autoBefore = (await readSlot(page, 'auto'))!.state.stepId;
  await page.locator('[data-action=load]').click();
  await expect(page.locator('[data-panel=load]')).toBeVisible();
  for (const slot of ['2', '1', '3']) {
    const wrap = page.locator('[data-panel=load] .slot-wrap').filter({ has: page.locator(`.slot[data-slot="${slot}"]`) });
    await wrap.locator('.slot-del').click();
    await expect(page.locator('[data-panel=confirm]')).toBeVisible();
    // 되돌릴 수 없는 확인창은 취소에 포커스
    expect(await page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.action)).toBe('cancel');
    // [삭제] 더블클릭: 두 번째 클릭이 다시 그려진 아래 슬롯 카드를 눌러 확인 없이 불러오면 안 됨
    await doubleTapOn(page, '[data-panel=confirm] [data-action=ok]');
    await page.waitForTimeout(600);
    const i = await info(page);
    expect(i.mode).toBe('title');
    expect(i.overlays).toBe(1); // 불러오기 패널만
    await expect(page.locator(`[data-panel=load] .slot[data-slot="${slot}"]`)).toBeDisabled(); // 비었음
  }
  expect((await readSlot(page, 'auto'))!.state.stepId).toBe(autoBefore);
});

test('키를 누르고 있어도(자동 반복) 메뉴·자동 진행이 열렸다 닫혔다 하지 않는다', async ({ page }, ti) => {
  test.skip(ti.project.name !== 'desktop');
  await boot(page, { textSpeed: 10, autoSpeed: 1, bgmVolume: 0, sfxVolume: 0 });
  await newGame(page);
  await advanceOne(page);
  for (let k = 0; k < 7; k++) await page.keyboard.down('Escape');
  await page.keyboard.up('Escape');
  expect((await info(page)).overlays).toBe(1);
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await info(page)).overlays).toBe(0);
  for (let k = 0; k < 6; k++) await page.keyboard.down('a');
  await page.keyboard.up('a');
  expect((await info(page)).auto).toBe(true);
  await page.keyboard.press('a');
  expect((await info(page)).auto).toBe(false);
});

test('확인창: 기본 버튼에 포커스가 가고, Tab 으로 확인창 밖 버튼에 갈 수 없다', async ({ page }, ti) => {
  test.skip(ti.project.name !== 'desktop');
  await boot(page);
  await newGame(page);
  await advanceOne(page);
  await page.keyboard.press('Escape');
  await page.locator('[data-panel=menu] [data-action=title]').click();
  await expect(page.locator('[data-panel=confirm]')).toBeVisible();
  const active = () => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.action ?? null);
  expect(await active()).toBe('ok');
  for (let k = 0; k < 10; k++) {
    await page.keyboard.press('Tab');
    const where = await page.evaluate(() => {
      const a = document.activeElement;
      if (!a || a === document.body) return 'body';
      return a.closest('[data-panel=confirm]') ? 'confirm' : `outside:${a.textContent}`;
    });
    expect(where === 'confirm' || where === 'body', where).toBe(true);
  }
  // 아래 메뉴는 그대로 있고, 확인창 위에 다른 패널이 겹쳐 열리지 않았다
  expect((await info(page)).overlays).toBe(2);
  await page.locator('[data-panel=confirm] [data-action=cancel]').click();
  await expect.poll(async () => (await info(page)).overlays).toBe(1);
  // 다시 열어 Enter 를 누르면 기본 버튼(타이틀로)이 눌린다
  await page.waitForTimeout(450);
  await page.locator('[data-panel=menu] [data-action=title]').click();
  await expect(page.locator('[data-panel=confirm]')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('#vn')).toHaveAttribute('data-mode', 'title');
});

test('확인창: Esc 는 [취소]와 같다(퀵로드·타이틀로 확인에서 아무것도 바뀌지 않고, 아래 메뉴는 남는다)', async ({ page }, ti) => {
  test.skip(ti.project.name !== 'desktop');
  await boot(page);
  await newGame(page);
  await advanceOne(page);
  await page.keyboard.press('F5');
  await expect(page.locator('.toast')).toContainText('퀵저장');
  await advanceOne(page);
  const at = (await info(page)).step;
  await page.keyboard.press('F9');
  await expect(page.locator('[data-panel=confirm]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await info(page)).overlays).toBe(0);
  expect((await info(page)).step).toBe(at);
  // 메뉴 → [타이틀로] 확인창에서 Esc: 확인창만 닫히고 메뉴는 그대로
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-panel=menu]')).toBeVisible();
  await page.locator('[data-panel=menu] [data-action=title]').click();
  await expect(page.locator('[data-panel=confirm]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await info(page)).overlays).toBe(1);
  await expect(page.locator('[data-panel=menu]')).toBeVisible();
  expect((await info(page)).mode).toBe('play');
  expect((await info(page)).step).toBe(at);
});

test('기록 시트: 글자를 드래그해 빈 곳에서 떼도 닫히지 않고, 메뉴 패널은 배경을 눌렀다 뗄 때만 닫힌다', async ({ page }, ti) => {
  test.skip(ti.project.name !== 'desktop');
  await boot(page);
  await newGame(page);
  await advanceOne(page);
  await advanceOne(page);
  // 1) 대화 기록(화면 전체를 덮는 시트): 글자를 눌러 시트의 빈 곳까지 끌고 가서 떼도 닫히지 않는다
  await page.locator('.hud button', { hasText: '기록' }).click();
  const item = page.locator('[data-panel=log] .log-item').first();
  await expect(item).toBeVisible();
  await page.waitForTimeout(450);
  const ib = (await item.boundingBox())!;
  const vp = page.viewportSize()!;
  const y = ib.y + ib.height / 2;
  await page.mouse.move(ib.x + ib.width * 0.3, y);
  await page.mouse.down();
  await page.mouse.move(vp.width - 8, y, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  expect((await info(page)).overlays).toBe(1);
  // 빈 곳에서 눌러 글자 위에서 떼도 그대로
  await page.mouse.move(vp.width - 8, y);
  await page.mouse.down();
  await page.mouse.move(ib.x + ib.width * 0.3, y, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  expect((await info(page)).overlays).toBe(1);
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await info(page)).overlays).toBe(0);

  // 2) 배경이 보이는 패널(메뉴): 누른 곳과 뗀 곳이 모두 배경일 때만 닫힌다
  await page.waitForTimeout(300);
  await openMenu(page);
  await page.waitForTimeout(450);
  const head = (await page.locator('[data-panel=menu] .panel-head h2').boundingBox())!;
  const pb = (await page.locator('[data-panel=menu]').boundingBox())!;
  const outX = Math.max(6, pb.x - 60);
  const hy = head.y + head.height / 2;
  // 패널 안에서 눌러 바깥 배경에서 떼기
  await page.mouse.move(head.x + head.width / 2, hy);
  await page.mouse.down();
  await page.mouse.move(outX, hy, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  expect((await info(page)).overlays).toBe(1);
  // 배경에서 눌러 패널 안에서 떼기
  await page.mouse.move(outX, hy);
  await page.mouse.down();
  await page.mouse.move(head.x + head.width / 2, hy, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  expect((await info(page)).overlays).toBe(1);
  // 배경을 눌렀다 떼면 닫힘
  await page.mouse.click(outX, hy);
  await expect.poll(async () => (await info(page)).overlays).toBe(0);
});

test('글자가 나오는 도중 누르면 그 문장을 바로 다 보여 주고, 다음 입력에서야 다음 문장으로 넘어간다', async ({ page }) => {
  // 가장 느린 글자 속도(초당 10자)로 열어 타자 효과가 충분히 길게 이어지게 한다
  await boot(page, { textSpeed: 1, autoSpeed: 10, bgmVolume: 0, sfxVolume: 0 });
  await page.locator('[data-action=new]').click();
  const confirm = page.locator('[data-panel=confirm] [data-action=ok]');
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await expect(page.locator('#vn')).toHaveAttribute('data-mode', 'play');
  // 첫 대사가 그려지기 시작할 때까지(암전·카드가 끝나 글자가 나오는 중)
  await expect.poll(async () => (await info(page)).typing, { timeout: 20_000 }).toBe(true);
  const typingStep = (await info(page)).step;
  expect(typingStep).not.toBeNull();
  await expect(page.locator('.textbox')).not.toHaveClass(/\bdone\b/);

  // 첫 누름: 같은 줄에 머물고 문장이 한 번에 다 보인다
  await tapStage(page);
  await expect.poll(async () => (await info(page)).typing).toBe(false);
  expect((await info(page)).step).toBe(typingStep);
  await expect(page.locator('.textbox')).toHaveClass(/\bdone\b/);

  // 잠시 그대로 두어도 저절로 넘어가지 않는다(자동 진행 꺼짐)
  await page.waitForTimeout(800);
  expect((await info(page)).step).toBe(typingStep);

  // 다음 누름에서야 다음 줄로 넘어간다
  await tapStage(page);
  await expect.poll(async () => (await info(page)).step).not.toBe(typingStep);
});
