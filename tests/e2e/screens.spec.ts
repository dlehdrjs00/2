/**
 * 새 화면 구조 검사: 대사창 숨기기, 퀵저장·퀵로드, 탭 시트(저장·불러오기·설정·기록), 저장 쪽,
 * 대화 기록 항목과 선택지의 분리, 설정(글자 크기·빛망울), 전체화면 메뉴, 타이틀 곡 지연.
 */
import { expect, test } from '@playwright/test';
import { advanceOne, advanceToStop, boot, expectCssImages, info, newGame, openMenu, pick, readSlot, tapStage, waitChoicesArmed, waitSettled } from './helpers';

test.beforeEach(async ({}, ti) => {
  test.skip(ti.project.name !== 'desktop', '화면 구조 검사는 데스크톱에서(휴대폰 배치는 mobile.spec)');
});

test('대사창 숨기기: 숨긴 동안 클릭·Enter·Space 는 복귀만 하고 대사를 넘기지 않는다', async ({ page }) => {
  await boot(page);
  await newGame(page);
  await advanceOne(page);
  const s0 = (await info(page)).step;
  const vn = page.locator('#vn');

  // H 키 → 숨김, 무대 클릭 → 복귀(진행 없음)
  await page.keyboard.press('h');
  await expect(vn).toHaveAttribute('data-hidewin', '1');
  expect((await info(page)).hidewin).toBe(true);
  await expect(page.locator('.textbox')).toHaveCSS('opacity', '0');
  await page.waitForTimeout(450); // 숨긴 직후 같은 자리 두 번째 클릭 흡수 시간이 지난 뒤
  await tapStage(page);
  await expect(vn).not.toHaveAttribute('data-hidewin', '1');
  await page.waitForTimeout(450);
  expect((await info(page)).step).toBe(s0);

  // [숨기기] 버튼 → Enter·Space 로 복귀(진행 없음)
  for (const key of ['Enter', ' ']) {
    await page.locator('.qbar [data-q=hide]').click();
    await expect(vn).toHaveAttribute('data-hidewin', '1');
    await page.keyboard.press(key);
    await expect(vn).not.toHaveAttribute('data-hidewin', '1');
    // 같은 자리 두 번째 클릭(500ms 안)은 더블클릭으로 보고 흡수하므로 충분히 띄운다
    await page.waitForTimeout(650);
    expect((await info(page)).step).toBe(s0);
  }

  // 숨긴 동안 자동 진행은 멈춘다
  await page.keyboard.press('a');
  expect((await info(page)).auto).toBe(true);
  await page.keyboard.press('h');
  await page.waitForTimeout(2500);
  expect((await info(page)).step).toBe(s0);
  await page.keyboard.press('Escape'); // Esc 도 복귀만(메뉴를 열지 않음)
  expect((await info(page)).overlays).toBe(0);
  await expect(vn).not.toHaveAttribute('data-hidewin', '1');
  await page.keyboard.press('a');
  expect((await info(page)).auto).toBe(false);

  // 복귀 뒤 일반 입력은 정상 진행
  await page.waitForTimeout(450);
  await advanceOne(page);
  expect((await info(page)).step).not.toBe(s0);
});

test('대사창 숨기기: 선택지 화면에서 숨긴 동안 선택지를 눌러도 고르지 않는다', async ({ page }) => {
  await boot(page);
  await newGame(page);
  const c = await advanceToStop(page);
  expect(c.frame).toBe('choice');
  await waitChoicesArmed(page);
  const box = (await page.locator('.choice[data-option=a]').boundingBox())!;
  await page.keyboard.press('h');
  await expect(page.locator('#vn')).toHaveAttribute('data-hidewin', '1');
  await page.waitForTimeout(450);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('#vn')).not.toHaveAttribute('data-hidewin', '1');
  await page.keyboard.press('h');
  await page.keyboard.press('1'); // 숫자 키도 복귀만
  await page.waitForTimeout(500);
  const now = await info(page);
  expect(now.step).toBe(c.step);
  expect(now.points).toEqual({ osana: 0, tenko: 0 });
  // 복귀 뒤에는 정상적으로 고를 수 있다
  await pick(page, 'a');
  expect((await info(page)).points).toEqual({ osana: 1, tenko: 0 });
});

test('퀵저장 → 진행 → 퀵로드로 왕복하고, 비었을 때는 안내한다', async ({ page }) => {
  await boot(page);
  await newGame(page);
  await page.keyboard.press('F9');
  await expect(page.locator('.toast')).toContainText('퀵저장이 비어 있어요');
  expect((await info(page)).overlays).toBe(0);

  await advanceOne(page);
  const saved = (await info(page)).step;
  await page.keyboard.press('F5');
  await expect(page.locator('.toast')).toContainText('퀵저장했어요');
  expect((await readSlot(page, 'quick'))!.state.stepId).toBe(saved);
  await advanceOne(page);
  await advanceOne(page);
  expect((await info(page)).step).not.toBe(saved);

  // 빠른 메뉴 [퀵로드] → 확인 → 저장한 위치
  await page.waitForTimeout(300);
  await page.locator('.qbar [data-q=qload]').click();
  await expect(page.locator('[data-panel=confirm] .dialog-msg')).toContainText('퀵저장');
  await page.locator('[data-panel=confirm] [data-action=ok]').click();
  await expect.poll(async () => (await info(page)).step).toBe(saved);
  await waitSettled(page);
  expect((await info(page)).overlays).toBe(0);

  // 불러오기 시트의 [자동·퀵] 쪽에 퀵 칸이 있다
  await openMenu(page);
  await page.locator('[data-panel=menu] [data-action=load]').click();
  await page.locator('[data-panel=load] .rail [data-page=q]').click();
  await expect(page.locator('[data-panel=load] .slot[data-slot=quick] .slot-meta')).toBeVisible();
  await expect(page.locator('[data-panel=load] .slot[data-slot=auto]')).toBeVisible();
});

test('탭 시트: 탭을 바꿔도 오버레이는 하나라 Esc 한 번에 닫힌다', async ({ page }) => {
  await boot(page);
  await newGame(page);
  await advanceOne(page);
  const s0 = (await info(page)).step;

  // 빠른 메뉴 [기록] → 탭 이동 → Esc 한 번
  await page.locator('.hud button', { hasText: '기록' }).click();
  await expect(page.locator('[data-panel=log]')).toBeVisible();
  for (const tab of ['save', 'load', 'settings', 'log', 'settings']) {
    await page.locator(`.sys-tabs [data-tab=${tab}]`).click();
    await expect(page.locator(`[data-panel=${tab}]`)).toBeVisible();
    expect((await info(page)).overlays).toBe(1);
  }
  expect((await info(page)).sheet).toBe('settings');
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await info(page)).overlays).toBe(0);

  // 메뉴 위에 겹쳐 연 시트: Esc 한 번에 메뉴로 돌아간다
  await page.waitForTimeout(300);
  await openMenu(page);
  await page.locator('[data-panel=menu] [data-action=save]').click();
  expect((await info(page)).overlays).toBe(2);
  await page.locator('.sys-tabs [data-tab=log]').click();
  await page.locator('.sys-tabs [data-tab=load]').click();
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await info(page)).overlays).toBe(1);
  await expect(page.locator('[data-panel=menu]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await info(page)).overlays).toBe(0);
  await page.waitForTimeout(300);
  expect((await info(page)).step).toBe(s0);

  // 키보드: ←/→ 로 탭을 옮긴다
  await page.keyboard.press('l');
  await expect(page.locator('[data-panel=log]')).toBeVisible();
  await page.locator('.sys-tabs [data-tab=log]').focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('[data-panel=settings]')).toBeVisible();
  await expect(page.locator('.sys-tabs [data-tab=settings]')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await info(page)).overlays).toBe(0);
});

test('저장 시트: 쪽을 옮겨 저장하면 그 쪽이 유지되고, 타이틀 불러오기는 수동 저장이 없으면 자동·퀵 쪽부터', async ({ page }) => {
  await boot(page);
  await newGame(page);
  await advanceOne(page);
  // 타이틀 불러오기: 수동 저장이 없으면 [자동·퀵] 쪽
  await openMenu(page);
  await page.locator('[data-panel=menu] [data-action=title]').click();
  await page.locator('[data-panel=confirm] [data-action=ok]').click();
  await page.locator('[data-action=load]').click();
  await expect(page.locator('[data-panel=load] .rail [data-page=q]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('[data-panel=load] .slot[data-slot=auto]')).toBeEnabled();
  await expect(page.locator('[data-panel=load] .sys-tabs [role=tab]')).toHaveCount(2); // 타이틀에서는 불러오기·설정
  await page.keyboard.press('Escape');

  await page.locator('[data-action=continue]').click();
  await waitSettled(page);
  await openMenu(page);
  await page.locator('[data-panel=menu] [data-action=save]').click();
  await expect(page.locator('[data-panel=save] .rail [data-page="1"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('[data-panel=save] .slot')).toHaveCount(6);
  await page.locator('[data-panel=save] .rail [data-page="2"]').click();
  await expect(page.locator('[data-panel=save] .slot[data-slot="7"]')).toBeVisible();
  await expect(page.locator('[data-panel=save] .slot[data-slot="1"]')).toHaveCount(0);
  await page.locator('[data-panel=save] .slot[data-slot="8"]').click();
  await expect(page.locator('.toast')).toContainText('슬롯 8에 저장했어요');
  await expect(page.locator('[data-panel=save] .slot[data-slot="8"] .slot-meta')).toBeVisible();
  await expect(page.locator('[data-panel=save] .slot[data-slot="8"]')).toHaveClass(/latest/);
  // 자동 저장 칸에는 직접 저장할 수 없다
  await page.locator('[data-panel=save] .rail [data-page=q]').click();
  await expect(page.locator('[data-panel=save] .slot[data-slot=auto]')).toBeDisabled();
  await page.locator('[data-panel=save] .rail [data-page="2"]').click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await info(page)).overlays).toBe(0);
  // 다시 열면 마지막으로 본 쪽(2쪽)
  await openMenu(page);
  await page.locator('[data-panel=menu] [data-action=load]').click();
  await expect(page.locator('[data-panel=load] .rail [data-page="2"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('[data-panel=load] .slot[data-slot="8"]')).toBeEnabled();
  // 썸네일은 저장된 무대로 그린 미니 무대(배경 그림 + 인물)
  const thumbBg = await page.locator('[data-panel=load] .slot[data-slot="8"] .slot-thumb').evaluate((e) => getComputedStyle(e).backgroundImage);
  expect(thumbBg).toContain('url(');
});

test('대화 기록: 날짜 카드·선택 항목이 무대 카드·선택지와 섞이지 않는다', async ({ page }) => {
  test.setTimeout(120_000);
  await boot(page);
  await newGame(page);
  await advanceToStop(page);
  await pick(page, 'a');
  const c2 = await advanceToStop(page);
  expect(c2.frame).toBe('choice');
  await expect(page.locator('.choice')).toHaveCount(2);
  await page.keyboard.press('l');
  await expect(page.locator('[data-panel=log]')).toBeVisible();
  // 기록의 선택 항목은 .log-item.is-choice 이고 .choice 가 아니다
  await expect(page.locator('[data-panel=log] .log-item.is-choice')).not.toHaveCount(0);
  await expect(page.locator('.choice')).toHaveCount(2);
  await expect(page.locator('[data-panel=log] .card')).toHaveCount(0);
  // '▶ ' 접두는 표시하지 않는다
  const choiceText = await page.locator('[data-panel=log] .log-item.is-choice .log-text').first().textContent();
  expect(choiceText!.startsWith('▶')).toBe(false);
  // 날짜 카드 항목이 실제로 보인다(무대 카드 스타일을 물려받아 투명해지지 않음)
  const card = page.locator('[data-panel=log] .log-item.is-card').first();
  if (await card.count()) await expect(card).toHaveCSS('opacity', '1');
  // 마지막 항목 강조, 이름 색은 화자별 클래스
  await expect(page.locator('[data-panel=log] .log-item').last()).toHaveClass(/\bnow\b/);
  await expect(page.locator('[data-panel=log] .log-item.k-osana .log-name').first()).toBeVisible();
  await page.keyboard.press('Escape');
});

test('설정: 글자 크기는 대사 글자를 키우고 저장되며, 빛망울 효과를 끌 수 있다', async ({ page }) => {
  await boot(page);
  await newGame(page);
  await advanceOne(page);
  const fs0 = await page.locator('.textbox .text').evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  await page.locator('.qbar [data-q=config]').click();
  await expect(page.locator('[data-panel=settings]')).toBeVisible();
  // 미리보기는 스크린리더가 읽지 않는다(알림 영역은 게임 대사창 하나)
  await expect(page.locator('[data-panel=settings] .preview')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('[aria-live]')).toHaveCount(1);
  await page.locator('[data-setting=textScale] [role=radio]', { hasText: '더 크게' }).click();
  await expect(page.locator('[data-setting=textScale] [role=radio]', { hasText: '더 크게' })).toHaveAttribute('aria-checked', 'true');
  await page.locator('[data-panel=settings] [data-cfg=screen]').click();
  const particles = page.locator('[data-setting=particles]');
  await expect(particles).toBeChecked();
  await particles.click({ force: true });
  await expect(page.locator('#vn')).toHaveAttribute('data-particles', '0');
  await page.locator('[data-panel=settings] .panel-foot .btn.primary').click();
  await expect.poll(async () => (await info(page)).overlays).toBe(0);
  const fs1 = await page.locator('.textbox .text').evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  expect(fs1).toBeGreaterThan(fs0 * 1.15);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ashita.settings')!));
  expect(saved.textScale).toBe(2);
  expect(saved.particles).toBe(0);
  // 다시 열면 그대로, 기본값으로 되돌리기
  await page.locator('.qbar [data-q=config]').click();
  await page.locator('[data-panel=settings] [data-action=reset]').click();
  await expect(page.locator('#vn')).toHaveAttribute('data-particles', '1');
  await expect(page.locator('[data-setting=textScale] [role=radio]').first()).toHaveAttribute('aria-checked', 'true');
});

test('전체화면 메뉴: 앱·브라우저 자체가 전체화면(display-mode)이면 숨긴다', async ({ page }) => {
  await page.addInitScript(() => {
    const orig = window.matchMedia.bind(window);
    window.matchMedia = (q: string) => {
      if (/display-mode:\s*(standalone|fullscreen)/.test(q)) {
        const noop = () => undefined;
        return { matches: true, media: q, onchange: null, addEventListener: noop, removeEventListener: noop, addListener: noop, removeListener: noop, dispatchEvent: () => false } as unknown as MediaQueryList;
      }
      return orig(q);
    };
  });
  await boot(page);
  await newGame(page);
  await openMenu(page);
  await expect(page.locator('[data-panel=menu] [data-action=fullscreen]')).toHaveCount(0);
  await expect(page.locator('[data-panel=menu] [data-action=title]')).toBeVisible();
  await page.locator('[data-panel=menu] [data-action=settings]').click();
  await page.locator('[data-panel=settings] [data-cfg=screen]').click();
  await expect(page.locator('[data-setting=fullscreen]')).toHaveCount(0);
});

test('타이틀을 바로 떠나면 타이틀 곡 파일을 받지 않는다', async ({ page }) => {
  const requested: string[] = [];
  page.on('request', (r) => {
    if (/\.mp3(\?|$)/.test(r.url())) requested.push(r.url());
  });
  await boot(page, { textSpeed: 10, autoSpeed: 10, bgmVolume: 60, sfxVolume: 0 });
  await page.locator('[data-action=new]').click();
  await expect(page.locator('#vn')).toHaveAttribute('data-mode', 'play');
  await page.waitForTimeout(1500);
  expect(requested.filter((u) => u.includes('bgm_title'))).toEqual([]);
  // 타이틀에 머물면 잠깐 뒤 타이틀 곡이 나온다
  await openMenu(page);
  await page.locator('[data-panel=menu] [data-action=title]').click();
  await page.locator('[data-panel=confirm] [data-action=ok]').click();
  await expect(page.locator('#vn')).toHaveAttribute('data-mode', 'title');
  await expect.poll(async () => (await info(page)).bgm, { timeout: 5000 }).toBe('title');
});

test('빌드 결과에서도 화면 그림이 실제로 받아지고 시트·메뉴 뒤가 흐려진다', async ({ page }) => {
  await boot(page);
  // 타이틀 키 비주얼(배경)
  await expectCssImages(page, '.title-screen');
  await newGame(page);
  await advanceOne(page);
  // 메뉴(작은 유리 카드) 뒤 흐림: 빌드 압축기가 표준 backdrop-filter 를 지우지 않았는지
  await openMenu(page);
  expect(await page.locator('.overlay').first().evaluate((e) => getComputedStyle(e).backdropFilter)).not.toBe('none');
  // 저장 → 썸네일(미니 무대 배경)
  await page.locator('[data-panel=menu] [data-action=save]').click();
  expect(await page.locator('.overlay.sys').evaluate((e) => getComputedStyle(e).backdropFilter)).toContain('blur');
  await page.locator('[data-panel=save] .slot[data-slot="1"]').click();
  await expect(page.locator('.toast')).toContainText('저장했어요');
  await expectCssImages(page, '[data-panel=save] .slot[data-slot="1"] .slot-thumb');
  // 설정 미리보기(교실 배경)
  await page.locator('.sys-tabs [data-tab=settings]').click();
  await expectCssImages(page, '[data-panel=settings] .preview-stage');
});

test('메뉴의 [대사창 숨기기]: 메뉴를 닫고 대사창을 숨기며, 다음 입력은 복귀만 한다', async ({ page }) => {
  await boot(page);
  await newGame(page);
  await advanceOne(page);
  const s0 = (await info(page)).step;
  await openMenu(page);
  await page.locator('[data-panel=menu] [data-action=hide]').click();
  await expect.poll(async () => (await info(page)).overlays).toBe(0);
  await expect(page.locator('#vn')).toHaveAttribute('data-hidewin', '1');
  await page.waitForTimeout(650);
  await tapStage(page);
  await expect(page.locator('#vn')).not.toHaveAttribute('data-hidewin', '1');
  await page.waitForTimeout(450);
  expect((await info(page)).step).toBe(s0);
});

test('시트·메뉴·확인창: Tab 포커스가 오버레이 밖으로 빠지지 않고 처음↔끝으로 순환한다', async ({ page }) => {
  await boot(page);
  await newGame(page);
  await advanceOne(page);
  const inTop = () =>
    page.evaluate(() => {
      const ovs = document.querySelectorAll('.overlay');
      const top = ovs[ovs.length - 1];
      const a = document.activeElement;
      return !!top && !!a && a !== document.body && top.contains(a);
    });
  // 설정 시트(조작 요소가 가장 많은 탭): 끝까지 Tab 을 눌러도 늘 시트 안
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-panel=menu]')).toBeVisible();
  await page.locator('[data-panel=menu] [data-action=settings]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-panel=settings]')).toBeVisible();
  const count = await page.locator('[data-panel=settings] button:visible, [data-panel=settings] input:visible').count();
  for (let i = 0; i < count + 4; i++) {
    await page.keyboard.press('Tab');
    expect(await inTop(), `Tab ${i + 1}번째`).toBe(true);
  }
  // 처음에서 Shift+Tab → 마지막(닫기 계열 버튼)
  await page.locator('.sys-tabs [aria-selected=true]').focus();
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Shift+Tab');
    expect(await inTop(), `Shift+Tab ${i + 1}번째`).toBe(true);
  }
  // 포커스가 body 로 빠져 있어도 Tab 한 번에 다시 시트 안으로
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Tab');
  expect(await inTop()).toBe(true);
  // 확인창(버튼 2개)
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-panel=menu]')).toBeVisible();
  await page.locator('[data-panel=menu] [data-action=title]').click();
  await expect(page.locator('[data-panel=confirm]')).toBeVisible();
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Tab');
    expect(await inTop(), `확인창 Tab ${i + 1}번째`).toBe(true);
  }
  await page.locator('[data-panel=confirm] [data-action=cancel]').click();
  await expect(page.locator('[data-panel=confirm]')).toHaveCount(0);
});
