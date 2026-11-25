/** 선택 전후 · 루트 진입 후 · 후일담에서의 저장/불러오기, 새로고침 후 이어하기 */
import { expect, test, type Page } from '@playwright/test';
import {
  COMMON_CHOICES,
  ROUTE_FIRST_STEP,
  advanceOne,
  advanceToRoute,
  advanceToStop,
  boot,
  info,
  newGame,
  openMenu,
  pick,
  readAutoState,
  readSlot,
  tapBackground,
  toTitle,
  visibleChoiceIds,
  waitChoicesArmed,
  waitSettled,
} from './helpers';

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
  expect(afterB.points).toEqual({ osana: 0, tenko: 2, koharu: 0 }); // c3 개인 선택 +2
  await advanceOne(page);
  await loadFrom(page, '1');
  const back = await info(page);
  expect(back.step).toBe(c1.step);
  expect(back.frame).toBe('choice');
  expect(back.points).toEqual({ osana: 0, tenko: 0, koharu: 0 });
  expect(await visibleChoiceIds(page)).toEqual(['a', 'b', 'c']);
  await pick(page, 'a');
  const afterA = await info(page);
  expect(afterA.points).toEqual({ osana: 2, tenko: 0, koharu: 0 });
  expect(afterA.step).not.toBe(afterB.step); // 선택 직후 반응이 다르다
  // '함께'도 같은 자리에서 다시 고를 수 있다(osana +1, tenko +1)
  await loadFrom(page, '1');
  await pick(page, 'c');
  expect((await info(page)).points).toEqual({ osana: 1, tenko: 1, koharu: 0 });
});

for (const [route, picks, epilogue, early, final, meetFlag] of [
  // a,b,a,b: osana 4, tenko 5 → 해금(koharu 4.5) → 후반 b,b,b → tenko 5+9=14 단독
  ['tenko', 'ababbbb', /^t[5-7]\./, { osana: 4, tenko: 5, koharu: 4.5 }, { osana: 4, tenko: 14, koharu: 4.5 }, true],
  // 함께 4회 4/4 → 해금(koharu 4) → 후반 a,b,k → 7/7/7 동점 → 마지막 k → koharu
  ['koharu', 'ccccabk', /^k[5-8]\./, { osana: 4, tenko: 4, koharu: 4 }, { osana: 7, tenko: 7, koharu: 7 }, true],
] as const) {
  test(`루트 진입 후·후일담 저장, 새로고침 후 불러오기와 이어하기 (${route})`, async ({ page }, ti) => {
    test.skip(route === 'koharu' && ti.project.name === 'phone-landscape', '코하루 루트 저장은 데스크톱·iPad WebKit 에서(휴대폰은 히나 루트로 같은 흐름)');
    test.setTimeout(330_000);
    await boot(page);
    await newGame(page);
    for (const [n, p] of [...picks].entries()) {
      const c = await advanceToStop(page);
      expect(c.step).toBe(COMMON_CHOICES[n]);
      if (n === 4) expect(c.points, '해금 판정 뒤').toEqual(early);
      await pick(page, p);
    }
    // 루트는 마지막 공통 선택(c10)의 반응과 독백(c10.j10) 뒤에 확정된다
    const { lastCommon, first } = await advanceToRoute(page);
    expect(lastCommon).toBe('c10.j10');
    expect(first.route).toBe(route);
    expect(first.step!.startsWith(ROUTE_FIRST_STEP[route])).toBe(true);
    expect(first.points).toEqual(final);
    const routePoints = final;
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
      if (epilogue.test(inEpilogue ?? '')) break;
      await advanceOne(page);
    }
    expect(epi.step).toMatch(epilogue);
    await advanceOne(page);
    const epiLine = await info(page);
    await saveTo(page, '3');
    await advanceOne(page);
    await advanceOne(page);
    const beforeReload = await info(page);

    // 새로고침 → 이어하기: 마지막으로 보던 문장, 루트·점수·해금 기록 그대로
    await page.reload();
    await expect(page.locator('#vn')).toHaveAttribute('data-mode', 'title');
    await page.locator('[data-action=continue]').click();
    await waitSettled(page);
    const cont = await info(page);
    expect(cont.step).toBe(beforeReload.step);
    expect(cont.route).toBe(route);
    expect(cont.points).toEqual(routePoints);
    expect((await readAutoState(page))!.flags['kh.met']).toBe(meetFlag);

    // 후일담 저장 불러오기
    await loadFrom(page, '3');
    expect((await info(page)).step).toBe(epiLine.step);
    expect((await info(page)).points).toEqual(routePoints);

    // 타이틀에서 루트 저장 불러오기
    await page.reload();
    await loadFrom(page, '2');
    const r2 = await info(page);
    expect(r2.step).toBe(routeLine.step);
    expect(r2.route).toBe(route);
    expect(r2.points).toEqual(routePoints);
    const slot2 = (await readSlot(page, '2')) as unknown as { state: { flags: Record<string, unknown> } };
    expect(slot2.state.flags['kh.met']).toBe(meetFlag);
  });
}

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
  await expect(page.locator('.choice')).toHaveCount(3);
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
  expect(before.points).toEqual({ osana: 2, tenko: 0, koharu: 0 });
  expect(r.points).toEqual({ osana: 0, tenko: 0, koharu: 0 }); // 그 장면의 선택이 되돌려짐(엔진 복구)
  expect(r.bg).not.toBe('black');
  expect(r.bgm).toBe(before.bgm); // 타이틀 곡이 계속 나오지 않음
  await expect(page.locator('.choice')).toHaveCount(r.frame === 'choice' ? 3 : 0);
});

/**
 * 구판 저장(스키마 2): 기준 커밋 11612b4 의 엔진·대본으로 실제로 쓴 원문(초반 a,b,a,b 조합, 예전 가중치 +1).
 * 계약 1절 이전 규칙으로 기대값을 직접 계산했다:
 *  - 점수는 새 가중치로 다시 합산: c3 a +2, c4 b +2, c6 a +2, c7 b +3, koharu 0
 *  - 노을길(c7.j20~j40)이나 루트 안 저장은 kh.met = false(첫 만남을 소급하지 않음), 그 앞 공통 저장은 플래그 없음(새 규칙대로 판정)
 *  - 위치·루트는 그대로
 */
const LEGACY_SCHEMA2 = {
  /** c5_gym 의 c5.020(c3 a·c4 b, 예전 점수 1/1) */
  c5: "{\"schema\":2,\"game\":\"ashita-mo-issho\",\"storyVersion\":\"0.1.0\",\"savedAt\":\"2026-11-25T16:56:49.931Z\",\"summary\":{\"sceneTitle\":\"음료 내기\",\"text\":\"\",\"route\":null},\"state\":{\"sceneId\":\"c5_gym\",\"stepId\":\"c5.020\",\"points\":{\"osana\":1,\"tenko\":1},\"lastHeroine\":\"tenko\",\"route\":null,\"choices\":{\"c3.ch\":\"a\",\"c4.ch\":\"b\"},\"flags\":{},\"stage\":{\"bg\":\"hallway\",\"chars\":{\"osana\":{\"pos\":\"left\",\"expr\":\"smile\",\"outfit\":\"uniform\",\"hair\":\"default\"},\"tenko\":{\"pos\":\"right\",\"expr\":\"smile\",\"outfit\":\"uniform\",\"hair\":\"ponytail\"}},\"order\":[\"osana\",\"tenko\"],\"bgm\":\"daily\",\"cg\":null},\"log\":[],\"endedWith\":null,\"sceneEntry\":{\"sceneId\":\"c5_gym\",\"points\":{\"osana\":1,\"tenko\":1},\"lastHeroine\":\"tenko\",\"route\":null,\"choices\":{\"c3.ch\":\"a\",\"c4.ch\":\"b\"},\"flags\":{},\"stage\":{\"bg\":\"courtyard\",\"chars\":{\"osana\":{\"pos\":\"left\",\"expr\":\"neutral\",\"outfit\":\"uniform\",\"hair\":\"default\"},\"tenko\":{\"pos\":\"right\",\"expr\":\"shy\",\"outfit\":\"uniform\",\"hair\":\"default\"}},\"order\":[\"osana\",\"tenko\"],\"bgm\":\"daily\",\"cg\":null},\"logLength\":0}}}",
  /** c7_friday 노을길 c7.j30(a,b,a,b 를 다 고른 뒤, 예전 점수 2/2) */
  c7road: "{\"schema\":2,\"game\":\"ashita-mo-issho\",\"storyVersion\":\"0.1.0\",\"savedAt\":\"2026-11-25T16:56:49.932Z\",\"summary\":{\"sceneTitle\":\"금요일 노을\",\"text\":\"\",\"route\":null},\"state\":{\"sceneId\":\"c7_friday\",\"stepId\":\"c7.j30\",\"points\":{\"osana\":2,\"tenko\":2},\"lastHeroine\":\"tenko\",\"route\":null,\"choices\":{\"c3.ch\":\"a\",\"c4.ch\":\"b\",\"c6.ch\":\"a\",\"c7.ch\":\"b\"},\"flags\":{},\"stage\":{\"bg\":\"road_evening\",\"chars\":{\"osana\":{\"pos\":\"left\",\"expr\":\"smile\",\"outfit\":\"uniform\",\"hair\":\"default\"},\"tenko\":{\"pos\":\"right\",\"expr\":\"smile\",\"outfit\":\"uniform\",\"hair\":\"default\"}},\"order\":[\"osana\",\"tenko\"],\"bgm\":\"evening\",\"cg\":null},\"log\":[],\"endedWith\":null,\"sceneEntry\":{\"sceneId\":\"c7_friday\",\"points\":{\"osana\":2,\"tenko\":1},\"lastHeroine\":\"osana\",\"route\":null,\"choices\":{\"c3.ch\":\"a\",\"c4.ch\":\"b\",\"c6.ch\":\"a\"},\"flags\":{},\"stage\":{\"bg\":\"road_rain\",\"chars\":{\"osana\":{\"pos\":\"left\",\"expr\":\"pout\",\"outfit\":\"uniform\",\"hair\":\"default\"}},\"order\":[\"osana\"],\"bgm\":\"heart\",\"cg\":null},\"logLength\":0}}}",
  /** 히나 루트 t2_notebook 의 t2.010(예전 동점 처리로 tenko) */
  t2: "{\"schema\":2,\"game\":\"ashita-mo-issho\",\"storyVersion\":\"0.1.0\",\"savedAt\":\"2026-11-25T16:56:49.932Z\",\"summary\":{\"sceneTitle\":\"이름 외우기 수첩\",\"text\":\"\",\"route\":\"tenko\"},\"state\":{\"sceneId\":\"t2_notebook\",\"stepId\":\"t2.010\",\"points\":{\"osana\":2,\"tenko\":2},\"lastHeroine\":\"tenko\",\"route\":\"tenko\",\"choices\":{\"c3.ch\":\"a\",\"c4.ch\":\"b\",\"c6.ch\":\"a\",\"c7.ch\":\"b\"},\"flags\":{},\"stage\":{\"bg\":\"hallway\",\"chars\":{},\"order\":[],\"bgm\":\"daily\",\"cg\":null},\"log\":[],\"endedWith\":null,\"sceneEntry\":{\"sceneId\":\"t2_notebook\",\"points\":{\"osana\":2,\"tenko\":2},\"lastHeroine\":\"tenko\",\"route\":\"tenko\",\"choices\":{\"c3.ch\":\"a\",\"c4.ch\":\"b\",\"c6.ch\":\"a\",\"c7.ch\":\"b\"},\"flags\":{},\"stage\":{\"bg\":\"shrine_steps\",\"chars\":{\"tenko\":{\"pos\":\"center\",\"expr\":\"shy\",\"outfit\":\"uniform\",\"hair\":\"default\"}},\"order\":[\"tenko\"],\"bgm\":\"heart\",\"cg\":null},\"logLength\":0}}}",
} as const;

/** 구판 원문을 슬롯 1에 넣고(첫 문서에서만) 타이틀의 [불러오기]로 연다 */
async function loadLegacy(page: Page, raw: string) {
  await page.addInitScript((raw) => {
    if (sessionStorage.getItem('legacy-seeded')) return;
    sessionStorage.setItem('legacy-seeded', '1');
    localStorage.setItem('ashita.save.1', raw);
  }, raw);
  await boot(page);
  await loadFrom(page, '1');
}

test.describe('구판 저장(스키마 2) 불러오기', () => {
  test.beforeEach(async ({}, ti) => {
    test.skip(ti.project.name === 'phone-landscape', '저장 이전 규칙은 데스크톱·iPad WebKit 에서 확인');
  });

  test('c7 이전 공통 저장: 점수를 새 가중치로 다시 세고 플래그 없이 이어, c7 뒤 해금 판정을 새 규칙대로 한다', async ({ page }) => {
    test.setTimeout(240_000);
    await loadLegacy(page, LEGACY_SCHEMA2.c5);
    const i = await info(page);
    expect(i.step).toBe('c5.020');
    expect(i.route).toBeNull();
    expect(i.points).toEqual({ osana: 2, tenko: 2, koharu: 0 }); // 예전 1/1 → c3 a +2, c4 b +2
    expect(i.lastHeroine).toBe('tenko');
    await advanceOne(page);
    await expect.poll(async () => (await readAutoState(page))?.stepId).toBe((await info(page)).step);
    expect((await readAutoState(page))!.flags).not.toHaveProperty('kh.met');
    // c6 a(+2) → 4/2, c7 b(+3) → 4/5 → 차 1 해금, koharu 4.5 → 복도 첫 만남 → 토요일 추첨 → c8.ch 에 k
    const seen: string[] = [];
    const onSay = async (x: { step: string | null }) => void seen.push(x.step!);
    expect((await advanceToStop(page, onSay)).step).toBe('c6.ch');
    await pick(page, 'a');
    expect((await advanceToStop(page, onSay)).step).toBe('c7.ch');
    await pick(page, 'b');
    const c8 = await advanceToStop(page, onSay);
    expect(c8.step).toBe('c8.ch');
    expect(c8.points).toEqual({ osana: 4, tenko: 5, koharu: 4.5 });
    expect(seen).toContain('c7.m20');
    expect(seen.some((s) => s.startsWith('c8r.'))).toBe(true);
    expect(await visibleChoiceIds(page)).toEqual(['a', 'b', 'k']);
    await expect.poll(async () => (await readAutoState(page))?.stepId).toBe('c8.ch');
    expect((await readAutoState(page))!.flags['kh.met']).toBe(true);
  });

  test('노을길(c7.j30) 저장: 점수를 다시 세고 kh.met = false 라 복도·추첨 없이 후반 선택지는 함께(c)', async ({ page }) => {
    await loadLegacy(page, LEGACY_SCHEMA2.c7road);
    const i = await info(page);
    expect(i.step).toBe('c7.j30');
    expect(i.route).toBeNull();
    // a,b,a,b: osana 2+2=4, tenko 2+3=5 → 새 규칙이면 해금될 차이지만 판정 지점을 이미 지난 저장이라 소급하지 않는다
    expect(i.points).toEqual({ osana: 4, tenko: 5, koharu: 0 });
    const seen: string[] = [];
    const c8 = await advanceToStop(page, async (x) => void seen.push(x.step!));
    expect(c8.step).toBe('c8.ch');
    expect(c8.points).toEqual({ osana: 4, tenko: 5, koharu: 0 });
    expect(seen.filter((s) => s.startsWith('c7.m') || s.startsWith('c8r.')), '코하루 장면').toEqual([]);
    expect(seen).toContain('c7.j40');
    expect(await visibleChoiceIds(page)).toEqual(['a', 'b', 'c']);
    await expect.poll(async () => (await readAutoState(page))?.stepId).toBe('c8.ch');
    expect((await readAutoState(page))!.flags['kh.met']).toBe(false);
  });

  test('루트 안(t2.010) 저장: 위치·루트 그대로, 점수만 새 가중치, kh.met = false', async ({ page }) => {
    await loadLegacy(page, LEGACY_SCHEMA2.t2);
    const i = await info(page);
    expect(i.step).toBe('t2.010');
    expect(i.route).toBe('tenko');
    expect(i.points).toEqual({ osana: 4, tenko: 5, koharu: 0 });
    await advanceOne(page);
    expect((await info(page)).route).toBe('tenko');
    await expect.poll(async () => (await readAutoState(page))?.stepId).toBe((await info(page)).step);
    expect((await readAutoState(page))!.flags['kh.met']).toBe(false);
  });
});
