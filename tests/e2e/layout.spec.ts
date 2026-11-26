/**
 * 화면 배치 회귀 검사: 낮은 가로 화면의 선택지·대사창 넘침, 토스트 위치, 저장 슬롯 삭제 버튼,
 * 설정 슬라이더 스크롤, 스크린리더 알림 범위.
 * 뷰포트를 테스트 안에서 직접 정하므로 desktop 프로젝트에서만 돈다(같은 검사를 세 번 반복하지 않게).
 */
import { expect, test, type Page } from '@playwright/test';
import { LINE_MAX_CHARS, OPTION_MAX_CHARS } from '../../src/engine/validate';
import { advanceToStop, boot, continueAt, info, newGame, openMenu, requireCdp, toTitle, visibleChoiceIds, waitChoicesArmed, waitSettled } from './helpers';

test.beforeEach(async ({}, ti) => {
  test.skip(ti.project.name !== 'desktop', '뷰포트를 직접 정하는 배치 검사(desktop 프로젝트에서만)');
});

type Box = { left: number; top: number; right: number; bottom: number };
const overlap = (a: Box, b: Box) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;

/** 실제 대본 문장과 비슷한 어절 길이의 한국어 문단(길이 한도 검사용) */
const PARA =
  '방과 후 교실에는 아무도 남아 있지 않았다. 창문 너머로 운동부의 구령이 들려오고, 칠판에는 지우다 만 수식이 희미하게 남아 있었다. ' +
  '나는 가방을 메고 복도로 나섰다. 계단을 내려가자 신발장 앞에서 누군가 기다리고 있었다. “늦었잖아.” 익숙한 목소리였다.';

async function relayoutTo(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await expect.poll(() => page.evaluate(() => [innerWidth, innerHeight].join('x'))).toBe(`${width}x${height}`);
  // resize → 배치 다시 계산 → ResizeObserver(대사창) 반영까지 두 프레임
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

async function rects(page: Page, selector: string): Promise<Box[]> {
  return page.locator(selector).evaluateAll((els) =>
    els.map((e) => {
      const b = e.getBoundingClientRect();
      return { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
    }),
  );
}

/** 지원 화면: 아이폰 SE 가로, 휴대폰 가로(브라우저 UI 포함), 안드로이드 크롬 주소창 표시, 360dp 폰 크롬 가로 */
const LOW_SIZES: Array<[number, number]> = [
  [667, 375],
  [740, 320],
  [740, 280],
  [692, 280],
];

/** 지금 떠 있는 선택지 count 개가 각 크기에서 글자를 다 담고(44px 이상), HUD·대사창·서로와 겹치지 않고, 스크롤 없이 보이며, 가운데를 누르면 그 버튼이 눌린다 */
async function expectChoicesFit(page: Page, name: string, count: number) {
  for (const [w, h] of LOW_SIZES) {
    await relayoutTo(page, w, h);
    const where = `${name} @${w}x${h}`;
    const list = (await rects(page, '.choices'))[0];
    const btns = await rects(page, '.choice');
    const hud = await rects(page, '.hud button');
    const tb = (await rects(page, '.textbox'))[0];
    expect(btns.length, where).toBe(count);
    // 버튼 높이가 글자를 다 담는다(flex 축소로 글자가 버튼 밖으로 삐져나오던 문제)
    const clipped = await page.locator('.choice').evaluateAll((els) => els.map((e) => e.scrollHeight - e.clientHeight));
    for (const d of clipped) expect(d, `${where}: 버튼 글자 넘침`).toBeLessThanOrEqual(1);
    for (const [i, b] of btns.entries()) {
      // 44px 이상(소수점 배치 오차 0.01px 허용)
      expect(b.bottom - b.top, where).toBeGreaterThanOrEqual(44 - 0.01);
      for (const hb of hud) expect(overlap(b, hb), `${where}: ${i + 1}번이 HUD 와 겹침`).toBe(false);
      expect(overlap(b, tb), `${where}: ${i + 1}번이 대사창과 겹침`).toBe(false);
      for (const [j, c] of btns.entries()) if (j > i) expect(overlap(b, c), `${where}: ${i + 1}·${j + 1}번 겹침`).toBe(false);
      // 스크롤 없이 목록 안에 다 보인다
      expect(b.top, where).toBeGreaterThanOrEqual(list.top - 0.5);
      expect(b.bottom, where).toBeLessThanOrEqual(list.bottom + 0.5);
      // 버튼 가운데를 누르면 그 버튼이 눌린다(HUD 등에 가리지 않음)
      const hit = await page.evaluate(
        ([x, y]) => {
          const e = document.elementFromPoint(x, y);
          const btn = e?.closest('.choice');
          return btn ? [...document.querySelectorAll('.choice')].indexOf(btn) : -1;
        },
        [(b.left + b.right) / 2, (b.top + b.bottom) / 2],
      );
      expect(hit, where).toBe(i);
    }
  }
}

test('낮은 가로 화면: 두 줄·3개 선택지도 버튼 밖으로 넘치지 않고 HUD·대사창과 겹치지 않으며 스크롤 없이 보인다', async ({ page }) => {
  await page.setViewportSize({ width: 740, height: 320 });
  await boot(page);
  await newGame(page);
  const c = await advanceToStop(page);
  expect(c.frame).toBe('choice');
  await waitChoicesArmed(page);
  // 실제 첫 선택지(c3.ch): 아카네·히나·함께 3개
  expect(await visibleChoiceIds(page)).toEqual(['a', 'b', 'c']);
  await expectChoicesFit(page, '실제 c3.ch 3개', 3);

  const long = '히나에게 우산을 빌려주고 아카네의 우산에 같이 들어가서 집까지 걸어간다'.slice(0, OPTION_MAX_CHARS);
  const setChoices = (texts: string[]) =>
    page.evaluate((texts) => {
      const box = document.querySelector('.choices')!;
      const btns = [...box.querySelectorAll<HTMLButtonElement>('.choice')];
      while (btns.length < texts.length) {
        const b = btns[0].cloneNode(true) as HTMLButtonElement;
        b.dataset.option = `x${btns.length}`;
        box.append(b);
        btns.push(b);
      }
      btns.forEach((b, i) => {
        if (i < texts.length) b.textContent = texts[i];
        else b.remove();
      });
    }, texts);

  const shapes: Array<[string, string[]]> = [
    ['두 줄 문구 2개', [long, long]],
    ['선택지 3개(긴 문구 포함)', [long, '추천보다 먼저 히나의 취향을 묻는다', '아무 말도 하지 않는다']],
    // 공통 선택지는 늘 3개(a·b·함께 또는 a·b·코하루): 검사기 한도(OPTION_MAX_CHARS) 길이 문구 3개도 스크롤 없이 들어간다
    // (dense 단계는 한 줄짜리 기준이라 667×375 에서 넘치던 것 → game.ts fitChoices 가 촘촘하게·가로로 맞춘다)
    ['두 줄 문구 3개', [long, long, long]],
  ];
  for (const [name, texts] of shapes) {
    await setChoices(texts);
    // 새로 붙인 버튼의 등장 연출(아래에서 8px 올라옴)이 끝난 뒤의 자리를 잰다
    await page.evaluate(() => Promise.all([...document.querySelectorAll('.choice')].flatMap((e) => e.getAnimations().map((a) => a.finished.catch(() => undefined)))));
    await expectChoicesFit(page, name, texts.length);
  }
  // 고른 화면에서도 진행 상태는 그대로(배치만 바뀜)
  expect((await info(page)).step).toBe(c.step);
});

test('낮은 가로 화면: 실제 선택지(초반 4곳, 발견 에피소드 6곳, 미발견·구저장 옛 후반 3곳, 결말 갈래 4곳)의 버튼이 모두 들어간다', async ({ page }) => {
  test.setTimeout(480_000);
  await page.setViewportSize({ width: 740, height: 320 });
  await boot(page);
  const at: Array<[string, string, boolean | null, string[], string | null]> = [
    ['c3_break', 'c3.ch', null, ['a', 'b', 'c'], null],
    ['c4_lunch', 'c4.ch', null, ['a', 'b', 'c'], null],
    ['c6_rain', 'c6.ch', null, ['a', 'b', 'c'], null],
    ['c7_friday', 'c7.ch', null, ['a', 'b', 'c'], null],
    // 발견(해금) 새 흐름의 에피소드 여섯 선택: a·b·k(코하루)
    ['e1_ice4', 'e1f.ch1', true, ['a', 'b', 'k'], null],
    ['e1_ice4', 'e1f.ch2', true, ['a', 'b', 'k'], null],
    ['e2_frog4', 'e2f.ch1', true, ['a', 'b', 'k'], null],
    ['e2_frog4', 'e2f.ch2', true, ['a', 'b', 'k'], null],
    ['e3_rain4', 'e3f.ch1', true, ['a', 'b', 'k'], null],
    ['e3_rain4', 'e3f.ch2', true, ['a', 'b', 'k'], null],
    // 옛 후반: 미발견이면 a·b·c(함께), 해금된 구저장(897ae1f 의 c8·c9·c10 위치)이면 a·b·k
    ['c8_bakery', 'c8.ch', true, ['a', 'b', 'k'], null],
    ['c8_bakery', 'c8.ch', false, ['a', 'b', 'c'], null],
    ['c9_puzzle', 'c9.ch', true, ['a', 'b', 'k'], null],
    ['c9_puzzle', 'c9.ch', false, ['a', 'b', 'c'], null],
    ['c10_window', 'c10.ch', true, ['a', 'b', 'k'], null],
    ['c10_window', 'c10.ch', false, ['a', 'b', 'c'], null],
    // 루트 안 결말 갈래: f(축제)·d(일상) 두 개
    ['o4_promise', 'o4.fork', null, ['f', 'd'], 'osana'],
    ['t4_invite', 't4.fork', null, ['f', 'd'], 'tenko'],
    ['k4', 'k4.fork', true, ['f', 'd'], 'koharu'],
    ['h5', 'h.fork', true, ['f', 'd'], 'group'],
  ];
  for (const [n, [sceneId, stepId, met, ids, route]] of at.entries()) {
    if (n > 0) {
      await relayoutTo(page, 740, 320);
      await toTitle(page);
    }
    await continueAt(page, { sceneId, stepId, route, flags: met === null ? undefined : { 'kh.met': met } });
    expect((await info(page)).frame).toBe('choice');
    expect(await visibleChoiceIds(page), `${stepId} kh.met=${met}`).toEqual(ids);
    await expectChoicesFit(page, `${stepId}${met === null ? '' : met ? ' 해금' : ' 미해금'}`, ids.length);
  }
});

test('타이틀: 엔딩 배지(처음 ??? 4개, 여덟 엔딩을 다 보면 8개)가 낮은 가로 화면에서도 화면 안에 있고, 메뉴·서로와 겹치지 않으며 같은 루트 두 결말은 붙어 있고 읽기 이름은 그대로', async ({ page }) => {
  test.setTimeout(120_000);
  const ALL = ['osana', 'osana_daily', 'tenko', 'tenko_daily', 'koharu', 'koharu_daily', 'group_festival', 'group_daily'];
  const NAMES = ['아카네 · 축제 엔딩', '아카네 · 일상 엔딩', '히나 · 축제 엔딩', '히나 · 일상 엔딩', '코하루 · 축제 엔딩', '코하루 · 일상 엔딩', '네 사람 · 축제 엔딩', '네 사람 · 일상 엔딩'];
  await boot(page);
  // 타이틀을 맞춰 둔 크기(album.spec 의 타이틀 검사와 같은 최저 높이 320). 높이 280 타이틀은 배지 수와 상관없이 메뉴가 화면을 다 쓴다
  const sizes = [[667, 375], [740, 320], [844, 390], [932, 430], [1024, 768], [1280, 720]] as const;
  const check = async (n: number, names: string[]) => {
    await expect(page.locator('.title-foot .badge')).toHaveCount(n);
    // 화면 글자를 별만 남겨 접어도 읽기 이름(글자 내용)은 그대로
    expect(await page.locator('.title-foot .badge').allTextContents()).toEqual(names);
    for (const [w, h] of sizes) {
      await relayoutTo(page, w, h);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const where = `${n}개 ${w}x${h}`;
      const badges = await rects(page, '.title-foot .badge');
      const menu = await rects(page, '.title-menu .btn');
      expect(badges.length, where).toBe(n);
      for (const [i, b] of badges.entries()) {
        expect(b.left >= -0.5 && b.top >= -0.5 && b.right <= w + 0.5 && b.bottom <= h + 0.5, `${where}: 배지 ${i + 1} 화면 밖 ${JSON.stringify(b)}`).toBe(true);
        for (const m of menu) expect(overlap(b, m), `${where}: 배지 ${i + 1}이 메뉴 버튼과 겹침`).toBe(false);
        for (const [j, c] of badges.entries()) if (j > i) expect(overlap(b, c), `${where}: 배지 ${i + 1}·${j + 1} 겹침`).toBe(false);
      }
      // 같은 루트의 두 결말(.end-pair)은 한 줄에 붙어 있다
      const pairs = await page.locator('.title-foot .end-pair').evaluateAll((els) =>
        els.map((e) => [...e.querySelectorAll('.badge')].map((b) => b.getBoundingClientRect().top)),
      );
      expect(pairs.length, where).toBe(n / 2);
      for (const tops of pairs) expect(Math.abs(tops[0] - tops[1]), `${where}: 같은 루트 두 배지가 다른 줄`).toBeLessThan(1);
      // 글자 배지면 배지 글자가 배지 밖으로 넘치지 않고, 별만 남긴 배지(data-fit='icons')면 보이는 글자가 없다
      const fit = await page.locator('.title-foot').getAttribute('data-fit');
      if (fit === 'icons') {
        const shown = await page.locator('.title-foot .badge .bn, .title-foot .badge .bk, .title-foot .badge .bq').evaluateAll((els) =>
          els.filter((e) => e.getBoundingClientRect().width > 1.5).length,
        );
        expect(shown, `${where}: 별만 남긴 배지에 보이는 글자`).toBe(0);
      } else {
        const clipped = await page.locator('.title-foot .badge').evaluateAll((els) => els.map((e) => e.scrollWidth - e.clientWidth));
        for (const d of clipped) expect(d, `${where}: 배지 글자 넘침`).toBeLessThanOrEqual(1);
      }
      test.info().annotations.push({ type: 'title-foot', description: `${where}: ${fit ?? 'text'}` });
    }
  };
  // 처음: 아카네·히나 축제·일상 4개가 '???'(루트·갈래·제목이 드러나지 않음)
  await check(4, Array(4).fill('아직 보지 못한 엔딩'));
  await expect(page.locator('.title-foot .badge .bq')).toHaveText(Array(4).fill('???'));
  // 여덟 엔딩을 다 본 기록(다른 탭이 쓴 것처럼 알려 다시 그린다)
  await relayoutTo(page, 1280, 720);
  await page.evaluate((all) => {
    const raw = JSON.stringify({ schema: 1, read: [], endings: all, cgs: ['kh_date', 'end_group_fireworks'] });
    localStorage.setItem('ashita.global', raw);
    window.dispatchEvent(new StorageEvent('storage', { key: 'ashita.global', newValue: raw, storageArea: localStorage }));
  }, ALL);
  await expect(page.locator('.title-foot .badge[data-reached="1"]')).toHaveCount(8);
  expect(await page.locator('.title-foot .badge').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.ending))).toEqual(ALL);
  await check(8, NAMES);
});

test('대사창: 기본 3줄을 넘는 문장은 넘침으로 잡히고, 대사창이 위로 늘어나 글자가 잘리지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 740, height: 320 });
  await boot(page);
  await newGame(page);
  // 글자를 바꾼 뒤 새로 필요한 웹폰트 조각(unicode-range)이 다 받아진 다음에 잰다(대체 글꼴 폭으로 재지 않게)
  const put = (s: string) =>
    page.evaluate(async (s) => {
      const t = document.querySelector('.textbox .text')!;
      (t.firstChild as Text).data = s;
      t.querySelector('.hidden-char')!.textContent = '';
      void t.getBoundingClientRect(); // 배치를 한 번 돌려 필요한 글꼴 조각 내려받기를 시작시킨다
      await new Promise((r) => requestAnimationFrame(r));
      await document.fonts.ready;
    }, s);
  const measure = () =>
    page.evaluate(() => {
      const tb = document.querySelector<HTMLElement>('.textbox')!;
      const cs = getComputedStyle(tb);
      const b = tb.getBoundingClientRect();
      const t = tb.querySelector('.text')!.getBoundingClientRect();
      const hud = [...document.querySelectorAll('.hud button')].map((e) => e.getBoundingClientRect());
      const hudBottom = Math.max(...hud.map((r) => r.bottom));
      const hudTop = Math.min(...hud.map((r) => r.top));
      const stageTop = document.querySelector('.stage')!.getBoundingClientRect().top;
      return { top: b.top, innerBottom: b.bottom - parseFloat(cs.borderBottomWidth), textBottom: t.bottom, hudBottom, hudTop, stageTop, vh: innerHeight };
    });
  const full = PARA.repeat(2);
  for (const [w, h] of [
    [740, 320],
    [667, 375],
  ] as const) {
    await relayoutTo(page, w, h);
    // 검증기가 허용하는 가장 긴 문장(LINE_MAX_CHARS)은 기본 3줄 안에 들어간다
    await put(full.slice(0, LINE_MAX_CHARS).trimEnd());
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const base = await measure();
    expect((await info(page)).textOverflow, `${w}x${h}: ${LINE_MAX_CHARS}자`).toBe(false);
    // 한 줄 넘게 긴 문장(LINE_MAX_CHARS 의 2배 — 고운돋움은 한글 폭이 1em 보다 좁아 +40자로는 667×375 에서 3줄 안에 들어간다): 넘침으로 잡히고(예전 판정은 아래 여백만큼 느슨해 4번째 줄을 놓쳤다), 대사창이 위로 늘어나 잘리지 않음
    await put(full.slice(0, LINE_MAX_CHARS * 2).trimEnd());
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const grown = await measure();
    expect((await info(page)).textOverflow, `${w}x${h}: ${LINE_MAX_CHARS * 2}자`).toBe(true);
    expect(grown.top, `${w}x${h}: 대사창이 위로 늘어남`).toBeLessThan(base.top - 10);
    expect(grown.textBottom, `${w}x${h}: 글자가 대사창 안`).toBeLessThanOrEqual(grown.innerBottom + 0.5);
    expect(grown.textBottom).toBeLessThanOrEqual(grown.vh);
    // 빠른 메뉴 탭은 대사창 위 테두리에 붙어 함께 올라간다: 탭 아랫변 = 대사창 윗변(소수점 오차 0.5px 허용)
    expect(grown.top, `${w}x${h}: 빠른 메뉴 탭은 덮지 않음`).toBeGreaterThanOrEqual(grown.hudBottom - 0.5);
    expect(grown.hudTop, `${w}x${h}: 빠른 메뉴 탭이 무대 위로 밀려나지 않음`).toBeGreaterThanOrEqual(grown.stageTop);
    // 짧은 문장으로 돌아오면 원래 크기
    await put('짧은 문장.');
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    expect((await measure()).top).toBeCloseTo(base.top, 0);
    expect((await info(page)).textOverflow).toBe(false);
  }
});

test('토스트는 대사창 글자와 선택지를 가리지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 740, height: 320 });
  await boot(page);
  await newGame(page);
  // 처음 보는 대사에서 건너뛰기 → 안내 토스트
  await page.locator('.hud button', { hasText: '스킵' }).click();
  await expect(page.locator('.toast')).toContainText('처음 보는');
  let toast = (await rects(page, '.toast'))[0];
  expect(overlap(toast, (await rects(page, '.textbox'))[0]), '대사 중 토스트가 대사창을 가림').toBe(false);
  for (const hb of await rects(page, '.hud button')) expect(overlap(toast, hb)).toBe(false);

  const c = await advanceToStop(page);
  expect(c.frame).toBe('choice');
  await waitChoicesArmed(page);
  for (const [w, h] of [
    [740, 320],
    [667, 375],
    [740, 280],
  ] as const) {
    await relayoutTo(page, w, h);
    await page.keyboard.press('s');
    await expect(page.locator('.toast')).toContainText('선택지');
    toast = (await rects(page, '.toast'))[0];
    for (const b of await rects(page, '.choice')) expect(overlap(toast, b), `${w}x${h}: 토스트가 선택지를 가림`).toBe(false);
    for (const hb of await rects(page, '.hud button')) expect(overlap(toast, hb)).toBe(false);
    // 질문 문구(대사창 글자)도 가리지 않음
    const line = await page.locator('.textbox .text').evaluate((e) => {
      const r = document.createRange();
      r.selectNodeContents(e);
      const b = r.getBoundingClientRect();
      return { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
    });
    expect(overlap(toast, line), `${w}x${h}: 토스트가 질문 문구를 가림`).toBe(false);
  }
  expect((await info(page)).skip).toBe(false);
});

test('저장 시트의 토스트는 저장 카드·안내 줄·닫기·고른 탭을 가리지 않고, 시트를 닫으면 제자리로 돌아간다', async ({ page }) => {
  await boot(page);
  await newGame(page);
  let n = 0;
  for (const [w, h] of [
    [1280, 720],
    [844, 390],
    [667, 375],
  ] as const) {
    await relayoutTo(page, w, h);
    await openMenu(page);
    await page.locator('[data-panel=menu] [data-action=save]').click();
    const slot = String(++n);
    await page.locator(`[data-panel=save] .slot[data-slot="${slot}"]`).click();
    await expect(page.locator('.toast')).toContainText(`슬롯 ${slot}`);
    await expect(page.locator('.toast')).toHaveClass(/in-sheet/);
    const toast = (await rects(page, '.toast'))[0];
    expect(toast.left >= 0 && toast.top >= 0 && toast.right <= w && toast.bottom <= h, `${w}x${h}: 토스트가 화면 안`).toBe(true);
    for (const c of await rects(page, '[data-panel=save] .slot-wrap')) expect(overlap(toast, c), `${w}x${h}: 토스트가 저장 카드를 가림`).toBe(false);
    const [close] = await rects(page, '[data-panel=save] .panel-head .close');
    expect(overlap(toast, close), `${w}x${h}: 토스트가 닫기를 가림`).toBe(false);
    const [tab] = await rects(page, '[data-panel=save] .sys-tabs [aria-selected=true]');
    expect(overlap(toast, tab), `${w}x${h}: 토스트가 고른 탭을 가림`).toBe(false);
    const hint = page.locator('[data-panel=save] .panel-hint');
    if (await hint.isVisible()) expect(overlap(toast, (await rects(page, '[data-panel=save] .panel-hint'))[0]), `${w}x${h}: 토스트가 안내 줄을 가림`).toBe(false);
    // 시트·메뉴를 닫으면 토스트는 플레이 화면의 기본 자리(무대 오른쪽 위)로
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await info(page)).overlays).toBe(0);
    await expect(page.locator('.toast.in-sheet')).toHaveCount(0);
  }
});

test('저장 슬롯: 삭제 버튼 밑에 날짜·장면·루트 글자가 깔리지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 667, height: 375 });
  await boot(page);
  await newGame(page);
  await openMenu(page);
  await page.locator('[data-panel=menu] [data-action=save]').click();
  await page.locator('[data-panel=save] .slot[data-slot="1"]').click();
  await expect(page.locator('.toast')).toContainText('저장했어요');
  // 루트가 정해진 저장처럼 요약을 바꿔 두 슬롯에 둔다(메타 줄이 가장 길어지는 경우)
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('ashita.save.1')!);
    raw.summary = { ...raw.summary, route: 'osana', sceneTitle: '첫 불꽃이 터지기 전에', text: '한 줄 요약' };
    localStorage.setItem('ashita.save.1', JSON.stringify(raw));
    raw.summary = { ...raw.summary, route: 'tenko', sceneTitle: '이름 외우기 수첩' };
    localStorage.setItem('ashita.save.2', JSON.stringify(raw));
  });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await info(page)).overlays).toBe(0);
  for (const [w, h] of [
    [667, 375],
    [740, 360],
    [844, 390],
  ] as const) {
    await relayoutTo(page, w, h);
    await openMenu(page);
    await page.locator('[data-panel=menu] [data-action=load]').click();
    await expect(page.locator('[data-panel=load] .slot-del')).toHaveCount(2);
    const hidden = await page.locator('[data-panel=load] .slot-wrap').evaluateAll((wraps) =>
      wraps.map((wrap) => {
        const del = wrap.querySelector('.slot-del');
        if (!del) return '';
        const d = del.getBoundingClientRect();
        let s = '';
        for (const el of wrap.querySelectorAll('.slot-name, .slot-meta, .slot-text')) {
          const tn = el.firstChild as Text | null;
          if (!tn) continue;
          const r = document.createRange();
          for (let i = 0; i < tn.length; i++) {
            r.setStart(tn, i);
            r.setEnd(tn, i + 1);
            for (const c of r.getClientRects()) if (c.right > d.left && c.left < d.right && c.bottom > d.top && c.top < d.bottom) s += tn.data[i];
          }
        }
        return s.trim();
      }),
    );
    expect(hidden.filter(Boolean), `${w}x${h}: 삭제 버튼에 가린 글자`).toEqual([]);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await info(page)).overlays).toBe(0);
  }
});

test('스크린리더: 게임 전체가 아니라 대사창 문장만 한 번씩 알리고, 타자 효과 글자는 읽지 않는다', async ({ page }) => {
  await boot(page, { textSpeed: 6, autoSpeed: 10, bgmVolume: 0, sfxVolume: 0 });
  expect(await page.locator('#app').getAttribute('aria-live')).toBeNull();
  await expect(page.locator('.textbox')).not.toHaveAttribute('role', 'log');
  await expect(page.locator('.textbox .text')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('[aria-live]')).toHaveCount(1);
  await page.evaluate(() => {
    const w = window as unknown as { __live: string[]; __typed: number };
    w.__live = [];
    w.__typed = 0;
    const live = document.querySelector('[aria-live]')!;
    new MutationObserver(() => w.__live.push(live.textContent ?? '')).observe(live, { childList: true, characterData: true, subtree: true });
    new MutationObserver(() => w.__typed++).observe(document.querySelector('.textbox .text')!, { characterData: true, subtree: true, childList: true });
  });
  await page.locator('[data-action=new]').click();
  const confirm = page.locator('[data-panel=confirm] [data-action=ok]');
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await expect(page.locator('#vn')).toHaveAttribute('data-mode', 'play');
  await waitSettled(page);
  const r = await page.evaluate(() => {
    const w = window as unknown as { __live: string[]; __typed: number };
    return { live: w.__live.filter(Boolean), typed: w.__typed, text: document.querySelector('.textbox .text')!.textContent };
  });
  expect(r.typed, '타자 효과로 보이는 글자는 여러 번 바뀐다').toBeGreaterThan(5);
  // 알림은 문장 전체 한 번(글자 단위로 쌓이지 않음)
  expect(r.live).toHaveLength(1);
  expect(r.live[0]).toContain(r.text!);
});

/**
 * 날짜 카드 묶음(주 차 알약·일력·주간 점, 보이는 것만)이 무대 사각형 안에 있고 빠른 메뉴 캡슐과 겹치지 않는다.
 * 세로 대체 배치(390×844)는 캡슐이 무대 아래 탭 띠에, 아주 낮은 가로(740×280)는 무대 오른쪽 아래에 있다.
 */
async function expectCardInStage(page: Page, where: string) {
  // resize → 배치 → ResizeObserver(카드 맞춤 data-fit) 반영까지
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));
  const r = await page.evaluate(() => {
    const box = (e: Element) => {
      const b = e.getBoundingClientRect();
      return { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
    };
    const visible = (e: Element) => {
      const cs = getComputedStyle(e);
      const b = e.getBoundingClientRect();
      return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0 && b.width > 0 && b.height > 0;
    };
    const card = document.querySelector('.stage > .card.on');
    const parts = card
      ? [...card.querySelectorAll(':scope > .card-kicker, :scope > .cal, :scope > .week, .cal-dots')].filter(visible).map((e) => ({ cls: e.classList[0], ...box(e) }))
      : [];
    const qbar = document.querySelector('.qbar')!;
    return { stage: box(document.querySelector('.stage')!), qbar: visible(qbar) ? box(qbar) : null, parts, fit: card?.getAttribute('data-fit') ?? null };
  });
  expect(r.parts.map((p) => p.cls), `${where}: 일력이 보임`).toContain('cal');
  for (const p of r.parts) {
    const at = `${where}: .${p.cls} (fit ${r.fit})`;
    expect(p.left, at).toBeGreaterThanOrEqual(r.stage.left - 0.5);
    expect(p.top, at).toBeGreaterThanOrEqual(r.stage.top - 0.5);
    expect(p.right, at).toBeLessThanOrEqual(r.stage.right + 0.5);
    expect(p.bottom, at).toBeLessThanOrEqual(r.stage.bottom + 0.5);
    if (r.qbar) expect(overlap(p, r.qbar), `${at}: 빠른 메뉴와 겹침`).toBe(false);
  }
}

for (const at of [
  { sceneId: 'c5_gym', stepId: 'c5.010', route: null, night: false, what: '공통 날짜 카드' },
  { sceneId: 'o5_festival', stepId: 'o5.010', route: 'osana', night: true, what: '아카네 루트 축제 카드' },
]) {
  test(`날짜 카드(${at.stepId} ${at.what}): 세로 390×844·낮은 가로 740×280 에서도 무대 안에 있고 빠른 메뉴와 겹치지 않는다`, async ({ page }) => {
    await boot(page);
    await continueAt(page, at);
    const i = await info(page);
    expect(i.frame).toBe('card');
    await expect(page.locator('.stage > .card.on')).toBeVisible();
    if (at.night) {
      // 축제 카드는 '다음 배경(축제 거리, 밤)'으로 그린다(game.ts bgAfterCard): 남색 밤 톤 + 달 아이콘
      await expect(page.locator('.stage > .card.on')).toHaveAttribute('data-tone', 'night');
      await expect(page.locator('.stage > .card.on .cal-head .ico[data-wx]')).toHaveAttribute('data-wx', 'moon');
    }
    // 세로 대체 배치(터치 화면이면 세로 안내를 넘긴 뒤)
    await relayoutTo(page, 390, 844);
    const keep = page.locator('[data-action=keep-portrait]');
    if (await keep.isVisible()) await keep.click();
    await expect(page.locator('.rotate')).toBeHidden();
    await expect(page.locator('#vn')).toHaveAttribute('data-layout', 'below');
    await expectCardInStage(page, `${at.stepId} @390x844`);
    // 아주 낮은 가로(안드로이드 크롬 주소창 + 360dp 폰)
    await relayoutTo(page, 740, 280);
    await expect(page.locator('#vn')).toHaveAttribute('data-layout', 'overlay');
    await expectCardInStage(page, `${at.stepId} @740x280`);
    // 배치만 바뀌고 진행은 그대로, 밤 톤도 유지
    expect((await info(page)).step).toBe(at.stepId);
    if (at.night) await expect(page.locator('.stage > .card.on')).toHaveAttribute('data-tone', 'night');
  });
}

test.describe('터치 화면', () => {
  test.use({ viewport: { width: 740, height: 320 }, hasTouch: true, isMobile: true });

  test('설정: 슬라이더 위에서 세로로 밀어도 패널이 스크롤된다', async ({ page }) => {
    await boot(page);
    await page.locator('.title-menu [data-action=settings]').click();
    const body = page.locator('[data-panel=settings] .panel-body');
    await expect(body).toBeVisible();
    const { scrollable } = await body.evaluate((b) => ({ scrollable: b.scrollHeight > b.clientHeight + 4 }));
    test.skip(!scrollable, '이 화면에서는 설정이 스크롤 없이 다 보임');
    const slider = (await page.locator('[data-panel=settings] input[type=range]').first().boundingBox())!;
    const x = slider.x + slider.width / 2;
    const y0 = slider.y + slider.height / 2;
    requireCdp(page);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
    for (let i = 1; i <= 15; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 - i * 5 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(() => body.evaluate((b) => b.scrollTop)).toBeGreaterThan(20);
  });
});
