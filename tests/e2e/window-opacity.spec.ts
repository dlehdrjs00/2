/**
 * 대사창 바탕 불투명도(설정 windowOpacity, 기본 70%) — docs/UI_DESIGN.md 변수표·유리 배합·CG·설정 절
 *
 * 바뀐 것은 대사창(#vn > .textbox) 바탕의 입력값 a(= 설정 ÷ 100)뿐이다. 그래서 '같은 페이지·같은 대사에서 설정만 바꿔'
 * 계산 스타일을 비교한다:
 *  - 슬라이더 82 ↔ 70: 대사창 바탕만 달라지고, 빠른 메뉴 탭(.qbar, ::before·::after 이음새, 버튼)·이름표·글자·
 *    대사창/탭/이름표/글자 상자 위치·크기는 모두 같다(--win-alpha 가 탭에서는 --qbar-alpha = max(설정, .82) 로 바뀜).
 *  - 40 이면 탭은 82 와 같고, 100 이면 탭도 a=1 로 진해진다.
 *  - 계산 배경 알파는 기존 배합식(낮·밤·이벤트 CG·밤 CG·Apple 터치 +0.12/CG +0.1)에 a 만 넣은 값과 같다.
 * 설정 미리보기(.preview-stage .textbox)는 같은 설정의 플레이 화면 낮 대사창과 같은 바탕이다(Apple 터치 보강 포함).
 * 처음 플레이·[기본값으로] = 70%, 이미 저장된 값(예전 기본 82% 등)은 대사창 바탕에 그대로 쓴다(탭은 max(저장값, 82%)).
 *
 * 브라우저 계산값은 알파를 8비트로 저장·반올림해 내보내므로(.672 → 0.67 등) 배합식 비교는 ±0.005 로 본다.
 * 같은 설정끼리의 비교(82 ↔ 70 의 탭·글자 등)는 정확히 같아야 한다.
 * Linux Chromium(데스크톱·Android 크기 흉내)·WebKit(iPad 기기 설정 흉내)에서의 결과이며 실제 기기 확인은 아니다.
 */
import { expect, test, type Page } from '@playwright/test';
import { advanceOne, boot, continueAt, info, newGame, openMenu } from './helpers';

type Kind = 'day' | 'night' | 'cg' | 'nightcg' | 'nightcard';
type Stop = [number, number, number, number];

const OLD_DEFAULT = 82;
const NEW_DEFAULT = 70;

const min1 = (x: number) => Math.min(1, x);
const clamp = (lo: number, x: number, hi: number) => Math.min(hi, Math.max(lo, x));
/** CG 중 옅은 유리(play.css --cg-a, Apple 터치는 performance.css 의 +0.1 판) */
const cgA = (a: number, apple: boolean) => (apple ? clamp(0.4, a * a * 0.78 + 0.1, 0.9) : clamp(0.3, a * a * 0.78, 0.8));

/**
 * 설정 s(40~100)에서 기대하는 계산 배경(그라데이션 색 멈춤 또는 단색). tb 대사창, qbar 탭, pseudo 탭 ::before·::after.
 * 대사창은 a = s/100, 탭은 q = max(a, .82) 를 같은 배합식에 넣는다.
 */
function expected(kind: Kind, s: number, apple: boolean): { tb: Stop[] | null; qbar: Stop[]; pseudo: Stop[] | null } {
  const a = s / 100;
  const q = Math.max(a, 0.82);
  switch (kind) {
    case 'day':
      return {
        tb: apple
          ? [
              [255, 255, 255, min1(a * 0.96 + 0.12)],
              [244, 250, 255, min1(a * 0.9 + 0.12)],
            ]
          : [
              [255, 255, 255, a * 0.96],
              [244, 250, 255, a * 0.9],
            ],
        qbar: apple
          ? [[250, 253, 255, min1(q * 0.97 + 0.12)]]
          : [
              [255, 255, 255, q * 0.9],
              [255, 255, 255, q * 0.97],
            ],
        pseudo: [
          [0, 0, 0, 0],
          [255, 255, 255, q * 0.97],
        ],
      };
    case 'night':
      return {
        tb: apple
          ? [[24, 35, 63, min1(a * 0.94 + 0.12)]]
          : [
              [26, 38, 70, a * 0.9],
              [18, 26, 52, a * 0.94],
            ],
        qbar: apple
          ? [[24, 35, 63, min1(q * 0.94 + 0.12)]]
          : [
              [30, 42, 78, q * 0.88],
              [26, 38, 70, q * 0.9],
            ],
        pseudo: [
          [0, 0, 0, 0],
          [26, 38, 70, q * 0.9],
        ],
      };
    case 'cg': {
      const c = cgA(a, apple);
      const cq = cgA(q, apple);
      return {
        tb: [
          [255, 255, 255, c],
          [244, 250, 255, min1(c * 1.1)],
        ],
        qbar: [
          [255, 255, 255, cq * 0.94],
          [255, 255, 255, cq],
        ],
        pseudo: [
          [0, 0, 0, 0],
          [255, 255, 255, cq],
        ],
      };
    }
    case 'nightcg': {
      const c = cgA(a, apple);
      const cq = cgA(q, apple);
      return {
        tb: [
          [26, 38, 70, c],
          [18, 26, 52, min1(c * 1.1)],
        ],
        qbar: [
          [30, 42, 78, cq * 0.94],
          [26, 38, 70, cq],
        ],
        pseudo: [
          [0, 0, 0, 0],
          [26, 38, 70, cq],
        ],
      };
    }
    case 'nightcard':
      // 밤 날짜 카드: 대사창은 숨김, 탭은 이음새 없는 남색 캡슐(play.css .vn[data-frame='card']:has(... night) .qbar)
      return { tb: null, qbar: [[26, 38, 70, q * 0.9]], pseudo: null };
  }
}

interface Paint {
  image: string;
  color: string;
}

/** 계산 배경의 색 멈춤(그라데이션이 없으면 단색 하나) */
function stops(p: Paint): Stop[] {
  const src = p.image && p.image !== 'none' ? p.image : p.color;
  return [...src.matchAll(/rgba?\(([^)]*)\)/g)].map((m) => {
    const v = m[1]
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map(Number);
    return [v[0], v[1], v[2], v.length > 3 ? v[3] : 1] as Stop;
  });
}

function expectStops(p: Paint, want: Stop[], label: string) {
  const got = stops(p);
  const msg = `${label}: ${JSON.stringify(p)} ↔ 기대 ${JSON.stringify(want.map((w) => [w[0], w[1], w[2], +w[3].toFixed(4)]))}`;
  expect(got.length, msg).toBe(want.length);
  got.forEach((g, i) => {
    expect(g.slice(0, 3), msg).toEqual(want[i].slice(0, 3));
    expect(Math.abs(g[3] - want[i][3]), msg).toBeLessThanOrEqual(0.005);
  });
}

/** 플레이 화면 대사창·빠른 메뉴·이름표·글자의 계산 스타일과 상자 */
async function look(page: Page) {
  return page.evaluate(() => {
    const vn = document.getElementById('vn')!;
    const q = (s: string) => document.querySelector<HTMLElement>(s);
    const paint = (e: Element | null, pseudo?: string) => {
      if (!e) return null;
      const cs = getComputedStyle(e, pseudo);
      return { image: cs.backgroundImage, color: cs.backgroundColor };
    };
    const rect = (e: Element | null) => {
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return [r.left, r.top, r.width, r.height].map((v) => Math.round(v * 100) / 100);
    };
    const tb = q('#vn > .textbox');
    const qb = q('#vn > .qbar')!;
    const name = q('#vn > .textbox .name');
    const text = q('#vn > .textbox .text');
    const qcs = getComputedStyle(qb);
    const ncs = name ? getComputedStyle(name) : null;
    const tcs = text ? getComputedStyle(text) : null;
    const pseudoShape = (p: string) => {
      const cs = getComputedStyle(qb, p);
      return { display: cs.display, width: cs.width, height: cs.height, left: cs.left, right: cs.right, bottom: cs.bottom };
    };
    return {
      winAlpha: getComputedStyle(vn).getPropertyValue('--win-alpha').trim(),
      textbox: paint(tb),
      qbar: {
        paint: paint(qb),
        before: paint(qb, '::before'),
        after: paint(qb, '::after'),
        beforeShape: pseudoShape('::before'),
        afterShape: pseudoShape('::after'),
        opacity: qcs.opacity,
        boxShadow: qcs.boxShadow,
        radius: qcs.borderRadius,
        blur: qcs.getPropertyValue('backdrop-filter') || qcs.getPropertyValue('-webkit-backdrop-filter'),
        buttons: [...qb.querySelectorAll<HTMLElement>('button')]
          .filter((b) => b.getClientRects().length > 0)
          .map((b) => {
            const c = getComputedStyle(b);
            return { q: b.dataset.q ?? b.textContent, color: c.color, bg: c.backgroundColor, img: c.backgroundImage, shadow: c.textShadow, font: c.fontSize, rect: rect(b) };
          }),
      },
      name: ncs && {
        text: name!.textContent,
        image: ncs.backgroundImage,
        bg: ncs.backgroundColor,
        color: ncs.color,
        fontSize: ncs.fontSize,
        fontFamily: ncs.fontFamily,
        textShadow: ncs.textShadow,
        boxShadow: ncs.boxShadow,
        opacity: ncs.opacity,
      },
      text: tcs && {
        fontSize: tcs.fontSize,
        fontFamily: tcs.fontFamily,
        lineHeight: tcs.lineHeight,
        letterSpacing: tcs.letterSpacing,
        color: tcs.color,
        textShadow: tcs.textShadow,
        opacity: tcs.opacity,
      },
      textboxBox: tb && {
        blur: getComputedStyle(tb).getPropertyValue('backdrop-filter') || getComputedStyle(tb).getPropertyValue('-webkit-backdrop-filter'),
        border: getComputedStyle(tb).borderTopColor,
        radius: getComputedStyle(tb).borderRadius,
        opacity: getComputedStyle(tb).opacity,
      },
      rects: { textbox: rect(tb), qbar: rect(qb), name: rect(name), text: rect(text) },
    };
  });
}
type Look = Awaited<ReturnType<typeof look>>;

/**
 * 대사창·빠른 메뉴 안의 CSS 전환(화자 이름표 색 --name-1·--name-2 0.2s, 창 나타남 opacity 0.25s, 밤 톤 버튼 글자색 등)이
 * 끝날 때까지. WebKit 은 waitSettled(대사 표시 완료) 뒤에야 이 전환들이 시작되기도 해서, 값 두 번 비교만으로는
 * 전환 시작 전 값을 '안정'으로 잘못 읽을 수 있다(무한 반복인 다음 표시 별 CSSAnimation 은 셈하지 않는다)
 */
async function transitionsDone(page: Page) {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const roots = [document.querySelector('#vn > .textbox'), document.querySelector('#vn > .qbar')].filter((e): e is Element => !!e);
          return document
            .getAnimations()
            .filter((a) => typeof CSSTransition !== 'undefined' && a instanceof CSSTransition)
            .filter((a) => a.playState !== 'finished' && a.playState !== 'idle')
            .map((a) => ({ a, t: (a.effect as KeyframeEffect | null)?.target ?? null }))
            .filter(({ t }) => !!t && roots.some((r) => r === t || r.contains(t)))
            .map(({ a, t }) => `${(t as Element).className}:${(a as CSSTransition).transitionProperty}`);
        }),
      { message: '대사창·빠른 메뉴의 CSS 전환이 끝나야 함', timeout: 10_000 },
    )
    .toEqual([]);
}

/**
 * 화면 갱신 두 번을 기다린다. WebKit(헤드리스)은 끝난 전환의 마지막 값(예: opacity 0.998)을 다음 화면 갱신 전까지
 * 계산 스타일에 남겨 두기도 해서, 읽기 사이에 갱신이 없으면 중간값 두 번을 '안정'으로 잘못 볼 수 있다
 */
async function frames(page: Page) {
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
}

/** 전환이 끝나고(화면 갱신을 끼워) 두 번 연달아 읽은 값이 같을 때까지 */
async function stableLook(page: Page): Promise<Look> {
  await transitionsDone(page);
  await frames(page);
  let prev = await look(page);
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(120);
    await frames(page);
    const cur = await look(page);
    if (JSON.stringify(cur) === JSON.stringify(prev)) return cur;
    prev = cur;
  }
  throw new Error('계산 스타일이 안정되지 않음');
}

/** 대사창 바탕(과 그에 딸린 --win-alpha)만 뺀 나머지 */
function withoutTextboxPaint(l: Look) {
  const { textbox: _tb, winAlpha: _wa, ...rest } = l;
  void _tb;
  void _wa;
  return rest;
}

async function isApple(page: Page) {
  return (await page.locator('#vn').getAttribute('data-render')) === 'apple-touch';
}

const slider = (page: Page) => page.locator('[data-panel=settings] input[data-setting=windowOpacity]');
/** 슬라이더 바로 뒤의 값 표시(settings.ts rangeRow: label · input · output · 눈금) */
const sliderOut = (page: Page) => page.locator('[data-panel=settings] input[data-setting=windowOpacity] ~ output');

/** 플레이 중 설정 시트(글자·대사창 분류)를 연다. 폭이 좁아 탭에 [설정]이 없으면 메뉴에서 */
async function openSettings(page: Page) {
  const cfg = page.locator('#vn > .qbar [data-q=config]');
  if (await cfg.isVisible()) await cfg.click();
  else {
    await openMenu(page);
    await page.locator('[data-panel=menu] [data-action=settings]').click();
  }
  await expect(page.locator('[data-panel=settings]')).toBeVisible();
  await page.locator('[data-panel=settings] [data-cfg=text]').click();
  await expect(slider(page)).toBeVisible();
}

/** 설정 시트와 그 아래 메뉴까지 닫고, 마우스·포커스를 치워 탭 버튼에 올림·포커스 표시가 남지 않게 한다 */
async function closeAll(page: Page) {
  await page.locator('[data-panel=settings] [data-action=close-settings]').click();
  for (let k = 0; k < 4 && (await info(page)).overlays > 0; k++) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(120);
  }
  await expect.poll(async () => (await info(page)).overlays).toBe(0);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  // 마지막 누른 자리에 :hover 가 남지 않게(터치 흉내에서도 남을 수 있어 모든 프로젝트에서) 화면 구석으로
  await page.mouse.move(1, 1);
}

async function storedOpacity(page: Page): Promise<number | undefined> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('ashita.settings');
    return raw ? JSON.parse(raw).windowOpacity : undefined;
  });
}

/** 슬라이더를 v 로 옮긴다(설정 시트가 열려 있어야 함). 표시·#vn --win-alpha·저장값을 같이 확인 */
async function setSlider(page: Page, v: number) {
  await slider(page).fill(String(v));
  await expect(slider(page)).toHaveValue(String(v));
  await expect(sliderOut(page)).toHaveText(`${v}%`);
  await expect.poll(() => page.locator('#vn').evaluate((e) => getComputedStyle(e).getPropertyValue('--win-alpha').trim())).toBe(String(v / 100));
  expect(await storedOpacity(page), `저장된 windowOpacity`).toBe(v);
}

/** 플레이 화면에서 설정을 v 로 바꾸고 시트를 닫은 뒤의 계산 스타일 */
async function lookAt(page: Page, v: number): Promise<Look> {
  await openSettings(page);
  await setSlider(page, v);
  await closeAll(page);
  return stableLook(page);
}

/** 82 ↔ 70 ↔ 40 ↔ 100 비교와 배합식 확인(장면 하나) */
async function compareOpacities(page: Page, kind: Kind, label: string) {
  const apple = await isApple(page);
  const before = await info(page);
  const s70 = await stableLook(page); // 기본(저장 없음) = 70
  expect(s70.winAlpha, `${label}: 처음 플레이 --win-alpha`).toBe('0.7');
  const s82 = await lookAt(page, OLD_DEFAULT);
  const s70b = await lookAt(page, NEW_DEFAULT);
  const s40 = await lookAt(page, 40);
  const s100 = await lookAt(page, 100);
  // 설정을 바꾸는 동안 진행은 그대로(같은 대사로 비교했는지)
  expect((await info(page)).step, `${label}: 같은 대사`).toBe(before.step);

  // 1) 기본 70 과 슬라이더로 되돌린 70 은 완전히 같다
  expect(s70b, `${label}: 70(기본) = 70(슬라이더)`).toEqual(s70);
  // 2) 82 ↔ 70: 대사창 바탕만 다르고 나머지(탭·이음새·버튼·이름표·글자·상자)는 같다
  expect(withoutTextboxPaint(s70), `${label}: 82 → 70 에서 대사창 바탕 말고는 그대로`).toEqual(withoutTextboxPaint(s82));
  if (kind !== 'nightcard') expect(s70.textbox, `${label}: 대사창 바탕은 달라져야 함`).not.toEqual(s82.textbox);
  // 3) 40: 탭은 82 모습 그대로(대사창만 옅어짐)
  expect(withoutTextboxPaint(s40).qbar, `${label}: 40% 에서도 탭은 82% 모습`).toEqual(withoutTextboxPaint(s82).qbar);
  // 4) 100: 탭도 a=1 로 진해진다(예전처럼 같이 진해짐)
  expect(s100.qbar.paint, `${label}: 100% 에서 탭은 82% 보다 진함`).not.toEqual(s82.qbar.paint);
  // 5) 배합식: 대사창 a = 설정/100, 탭 q = max(a, .82)
  for (const [v, s] of [
    [NEW_DEFAULT, s70],
    [OLD_DEFAULT, s82],
    [40, s40],
    [100, s100],
  ] as const) {
    const want = expected(kind, v, apple);
    if (want.tb) expectStops(s.textbox!, want.tb, `${label} ${v}% 대사창`);
    expectStops(s.qbar.paint!, want.qbar, `${label} ${v}% 탭`);
    if (want.pseudo) {
      expectStops(s.qbar.before!, want.pseudo, `${label} ${v}% 탭 ::before`);
      expectStops(s.qbar.after!, want.pseudo, `${label} ${v}% 탭 ::after`);
    }
  }
  // 6) 대사가 실제로 보이는 줄이면 글자·이름표가 있다(비교가 헛돌지 않게)
  if (kind !== 'nightcard') {
    expect(s70.name?.text, `${label}: 이름표`).toBeTruthy();
    expect(s70.text?.fontSize, `${label}: 글자`).toBeTruthy();
  }
  return { s70, s82, s40, s100 };
}

// ===========================================================================
// a·b. 낮 일반 장면: 아카네의 월요일 등굣길 c1.040
// ===========================================================================

test('낮(c1.040 아카네 등굣길): 기본 70%, 82↔70 에서 대사창 바탕만 바뀌고 탭·이름표·글자·크기는 그대로, 40/100 탭 규칙', async ({ page }) => {
  await boot(page); // windowOpacity 는 저장하지 않는다(글자 즉시·소리 끔만)
  expect(await storedOpacity(page)).toBeUndefined();
  await newGame(page);
  for (let k = 0; k < 6 && (await info(page)).step !== 'c1.040'; k++) await advanceOne(page);
  const i = await info(page);
  expect(i.step).toBe('c1.040');
  await expect(page.locator('#vn')).toHaveAttribute('data-tone', 'day');
  await expect(page.locator('#vn > .textbox')).toHaveAttribute('data-who', 'osana');
  await expect(page.locator('.stage')).not.toHaveAttribute('data-cg', /.+/);
  const { s70 } = await compareOpacities(page, 'day', 'c1.040');
  // 글자 그림자(흰 번짐)는 그대로 남아 있다
  expect(s70.text!.textShadow).toContain('255, 255, 255');
  await page.screenshot({ path: test.info().outputPath('c1.040-70.png') });
});

// ===========================================================================
// c. 밤 톤·이벤트 CG·밤 CG·밤 날짜 카드
// ===========================================================================

test('이벤트 CG(c7.m40 kh_meet, 금요일 복도 첫 만남): 대사창 --cg-a 는 a=.7, 탭은 a=.82 로 계산', async ({ page }) => {
  await boot(page);
  await continueAt(page, {
    sceneId: 'c7_friday',
    stepId: 'c7.m40',
    flags: { 'kh.met': true },
    stage: {
      bg: 'hallway',
      bgm: null,
      chars: {
        osana: { pos: 'left', expr: 'neutral', outfit: 'uniform', hair: 'default' },
        tenko: { pos: 'right', expr: 'neutral', outfit: 'uniform', hair: 'default' },
      },
      order: ['osana', 'tenko'],
      cg: 'kh_meet',
    },
  });
  await expect(page.locator('.stage')).toHaveAttribute('data-cg', 'kh_meet');
  await expect(page.locator('#vn')).toHaveAttribute('data-tone', 'day');
  await expect(page.locator('#vn > .textbox .name')).toHaveText('여학생');
  await compareOpacities(page, 'cg', 'c7.m40');
  await page.screenshot({ path: test.info().outputPath('c7.m40-70.png') });
});

test('밤(k6.080 축제 거리 끝): 남색 유리도 대사창만 a=.7, 탭은 .82', async ({ page }) => {
  await boot(page);
  await continueAt(page, {
    sceneId: 'k6',
    stepId: 'k6.080',
    route: 'koharu',
    flags: { 'kh.met': true },
    stage: {
      bg: 'kh_lantern_lane',
      bgm: null,
      chars: { koharu: { pos: 'center', expr: 'shy', outfit: 'yukata', hair: 'default' } },
      order: ['koharu'],
      cg: null,
    },
  });
  await expect(page.locator('#vn')).toHaveAttribute('data-tone', 'night');
  await expect(page.locator('.stage')).not.toHaveAttribute('data-cg', /.+/);
  await compareOpacities(page, 'night', 'k6.080');
});

test('밤 이벤트 CG(k6.170 kh_confession): 밤 CG 유리도 대사창만 a=.7, 탭은 .82', async ({ page }) => {
  await boot(page);
  await continueAt(page, {
    sceneId: 'k6',
    stepId: 'k6.170',
    route: 'koharu',
    flags: { 'kh.met': true },
    stage: {
      bg: 'kh_lantern_lane',
      bgm: null,
      chars: { koharu: { pos: 'center', expr: 'neutral', outfit: 'yukata', hair: 'default' } },
      order: ['koharu'],
      cg: 'kh_confession',
    },
  });
  await expect(page.locator('#vn')).toHaveAttribute('data-tone', 'night');
  await expect(page.locator('.stage')).toHaveAttribute('data-cg', 'kh_confession');
  await compareOpacities(page, 'nightcg', 'k6.170');
});

test('밤 날짜 카드(o5.010 축제 카드): 남색 캡슐 탭은 82% 모습 그대로', async ({ page }) => {
  await boot(page);
  await continueAt(page, { sceneId: 'o5_festival', stepId: 'o5.010', route: 'osana' });
  expect((await info(page)).frame).toBe('card');
  await expect(page.locator('.stage > .card.on')).toHaveAttribute('data-tone', 'night');
  await compareOpacities(page, 'nightcard', 'o5.010');
});

// ===========================================================================
// d. 설정 미리보기 = 플레이 화면 낮 대사창, 저장·[기본값으로]
// ===========================================================================

test('설정 미리보기: 슬라이더를 움직이면 미리보기와 게임 대사창이 같은 바탕으로 같이 바뀌고 저장되며, [기본값으로]는 70%', async ({ page }) => {
  await boot(page);
  await newGame(page);
  for (let k = 0; k < 6 && (await info(page)).step !== 'c1.040'; k++) await advanceOne(page);
  expect((await info(page)).step).toBe('c1.040');
  await expect(page.locator('#vn')).toHaveAttribute('data-tone', 'day');
  const apple = await isApple(page);
  const pair = () =>
    page.evaluate(() => {
      const p = (s: string) => {
        const cs = getComputedStyle(document.querySelector(s)!);
        return { image: cs.backgroundImage, color: cs.backgroundColor };
      };
      return { preview: p('.preview-stage .textbox'), game: p('#vn > .textbox') };
    });

  await openSettings(page);
  // 미리보기는 #vn 안(같은 --win-alpha 를 물려받음)
  await expect(page.locator('#vn .preview-stage .textbox')).toHaveCount(1);
  await expect(slider(page)).toHaveValue(String(NEW_DEFAULT));
  await expect(sliderOut(page)).toHaveText('70%');
  let prev = await pair();
  expect(prev.preview, '기본 70%: 미리보기 = 게임').toEqual(prev.game);
  expectStops(prev.preview, expected('day', NEW_DEFAULT, apple).tb!, '기본 70% 미리보기');
  for (const v of [55, OLD_DEFAULT, 100, 40, 93]) {
    await setSlider(page, v);
    const now = await pair();
    expect(now.preview, `${v}%: 미리보기 = 게임`).toEqual(now.game);
    expectStops(now.preview, expected('day', v, apple).tb!, `${v}% 미리보기`);
    expect(now.game, `${v}%: 게임 대사창이 바뀜`).not.toEqual(prev.game);
    expect(now.preview, `${v}%: 미리보기가 바뀜`).not.toEqual(prev.preview);
    prev = now;
  }
  // [기본값으로]: 70 으로 돌아가고 저장값도 70
  await page.locator('[data-panel=settings] [data-action=reset]').click();
  await expect(slider(page)).toHaveValue(String(NEW_DEFAULT));
  await expect(sliderOut(page)).toHaveText('70%');
  await expect.poll(() => page.locator('#vn').evaluate((e) => getComputedStyle(e).getPropertyValue('--win-alpha').trim())).toBe('0.7');
  expect(await storedOpacity(page)).toBe(NEW_DEFAULT);
  const reset = await pair();
  expect(reset.preview).toEqual(reset.game);
  expectStops(reset.game, expected('day', NEW_DEFAULT, apple).tb!, '[기본값으로] 뒤 게임');
  await page.screenshot({ path: test.info().outputPath('settings-preview-70.png') });
  // 다시 열어도(새로 만든 시트) 70
  await closeAll(page);
  await openSettings(page);
  await expect(slider(page)).toHaveValue(String(NEW_DEFAULT));
  await expect(sliderOut(page)).toHaveText('70%');
});

test('처음 플레이(설정 저장이 아예 없음): 타이틀 설정의 슬라이더 70%, --win-alpha .7, 미리보기는 a=.7 배합', async ({ page }) => {
  await page.goto('./?debug');
  await expect(page.locator('#vn')).toHaveAttribute('data-mode', 'title');
  const first = await storedOpacity(page);
  // 열기만 해서는 저장하지 않거나, 저장하더라도 기본 70
  expect([undefined, NEW_DEFAULT]).toContain(first);
  await expect.poll(() => page.locator('#vn').evaluate((e) => getComputedStyle(e).getPropertyValue('--win-alpha').trim())).toBe('0.7');
  await page.locator('.title-menu [data-action=settings]').click();
  await expect(page.locator('[data-panel=settings]')).toBeVisible();
  await page.locator('[data-panel=settings] [data-cfg=text]').click();
  await expect(slider(page)).toHaveValue('70');
  await expect(sliderOut(page)).toHaveText('70%');
  await expect(slider(page)).toHaveAttribute('aria-valuetext', '70%');
  const apple = await isApple(page);
  const pv = await page.locator('.preview-stage .textbox').evaluate((e) => {
    const cs = getComputedStyle(e);
    return { image: cs.backgroundImage, color: cs.backgroundColor };
  });
  expectStops(pv, expected('day', NEW_DEFAULT, apple).tb!, '처음 플레이 미리보기');
  // 다른 값으로 옮겼다가 [기본값으로]
  await setSlider(page, 64);
  await page.locator('[data-panel=settings] [data-action=reset]').click();
  await expect(slider(page)).toHaveValue('70');
  expect(await storedOpacity(page)).toBe(NEW_DEFAULT);
});

// ===========================================================================
// e. 기존 플레이어: 저장해 둔 불투명도는 그대로
// ===========================================================================

// 대사창 바탕(a = 저장값 ÷ 100)은 저장값 그대로다. 빠른 메뉴 탭은 q = max(a, .82) 이다.
// 그래서 82 이상(82·100)이면 예전 판과 같은 모습이다. 82 미만(40)을 저장해 둔 기존 플레이어는 대사창은 그대로지만
// 탭이 예전 판(탭도 a 를 따름)보다 진해져 82% 모습이 된다(팀 결정: 탭 = max(설정, .82)).
for (const v of [OLD_DEFAULT, 40, 100]) {
  const tabNote = v < OLD_DEFAULT ? `탭은 82% 모습(예전 판의 ${v}% 탭보다 진함)` : `탭도 ${v}%(예전 판과 같음)`;
  test(`기존 플레이어(저장된 windowOpacity ${v}): 슬라이더·--win-alpha·대사창 바탕이 ${v}% 그대로, 저장값도 유지, ${tabNote}`, async ({ page }) => {
    // 예전 판이 저장하던 모양 그대로(모든 항목 + schema)
    await boot(page, { schema: 1, textSpeed: 10, autoSpeed: 10, bgmVolume: 0, sfxVolume: 0, windowOpacity: v, textScale: 0, particles: 1 });
    await expect.poll(() => page.locator('#vn').evaluate((e) => getComputedStyle(e).getPropertyValue('--win-alpha').trim())).toBe(String(v / 100));
    await page.locator('.title-menu [data-action=settings]').click();
    await page.locator('[data-panel=settings] [data-cfg=text]').click();
    await expect(slider(page)).toHaveValue(String(v));
    await expect(sliderOut(page)).toHaveText(`${v}%`);
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await info(page)).overlays).toBe(0);
    await newGame(page);
    for (let k = 0; k < 6 && (await info(page)).step !== 'c1.040'; k++) await advanceOne(page);
    expect((await info(page)).step).toBe('c1.040');
    const apple = await isApple(page);
    const l = await stableLook(page);
    expect(l.winAlpha).toBe(String(v / 100));
    const want = expected('day', v, apple);
    expectStops(l.textbox!, want.tb!, `저장 ${v}% 대사창`);
    expectStops(l.qbar.paint!, want.qbar, `저장 ${v}% 탭`);
    expectStops(l.qbar.before!, want.pseudo!, `저장 ${v}% 탭 ::before`);
    // 게임이 저장값을 기본값으로 덮어쓰지 않았다
    expect(await storedOpacity(page)).toBe(v);
    // 설정을 열어도 그 값
    await openSettings(page);
    await expect(slider(page)).toHaveValue(String(v));
  });
}

// ===========================================================================
// f. 글자 크기 단계와 무관: 더 크게(textScale 2)에서도 82↔70 은 대사창 바탕만 바뀐다
// ===========================================================================

test('글자 크기 더 크게(textScale 2): 82↔70 에서도 대사창 바탕만 바뀌고 글자·이름표·탭은 그대로', async ({ page }) => {
  await boot(page, { textSpeed: 10, autoSpeed: 10, bgmVolume: 0, sfxVolume: 0, textScale: 2 });
  await newGame(page);
  for (let k = 0; k < 6 && (await info(page)).step !== 'c1.040'; k++) await advanceOne(page);
  expect((await info(page)).step).toBe('c1.040');
  const s70 = await stableLook(page);
  const s82 = await lookAt(page, OLD_DEFAULT);
  expect(withoutTextboxPaint(s70)).toEqual(withoutTextboxPaint(s82));
  expect(s70.textbox).not.toEqual(s82.textbox);
  const apple = await isApple(page);
  expectStops(s70.textbox!, expected('day', NEW_DEFAULT, apple).tb!, 'textScale 2 · 70% 대사창');
  expectStops(s82.textbox!, expected('day', OLD_DEFAULT, apple).tb!, 'textScale 2 · 82% 대사창');
});
