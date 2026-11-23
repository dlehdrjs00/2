import { describe, expect, it } from 'vitest';
import {
  CG_LOW_BAND,
  CHOICE_PAD_Y,
  choiceSpace,
  choiceStackHeight,
  computeLayout,
  MIN_FONT,
  TAB_MAX,
  TAB_MIN,
  textBoxHeightFor,
  type Layout,
} from '../../src/ui/layout';
import { bgAfterCard, weatherOf } from '../../src/ui/stage';
import type { Step } from '../../src/engine/types';
import { STORY } from '../../src/story';

const none = { t: 0, r: 0, b: 0, l: 0 };
const notch = { t: 0, r: 47, b: 21, l: 47 }; // 아이폰 가로(노치) 대략값

const cases: Array<[string, number, number, typeof none]> = [
  ['PC 1920x1080', 1920, 1080, none],
  ['PC 1366x768', 1366, 768, none],
  ['울트라와이드 2560x1080', 2560, 1080, none],
  ['4:3 태블릿 가로 1024x768', 1024, 768, none],
  ['아이폰 SE 가로 667x375', 667, 375, none],
  ['아이폰 13 가로(노치) 844x390', 844, 390, notch],
  ['안드로이드 가로(브라우저 UI 포함) 800x340', 800, 340, none],
  ['휴대폰 가로(브라우저 UI 포함) 740x320', 740, 320, none],
  ['안드로이드 크롬 가로(주소창 표시) 740x280', 740, 280, none],
  ['360dp 안드로이드 크롬 가로 692x280', 692, 280, none],
  ['세로 390x844', 390, 844, none],
  ['세로로 계속하기 320x568', 320, 568, none],
];

/** 지원 범위보다 낮은 화면(위아래 툴바가 있는 브라우저 가로 등): 잘리지 않는 것만 확인 */
const tooShort: Array<[string, number, number, typeof none]> = [
  ['삼성 인터넷 가로(툴바 위아래) 740x232', 740, 232, none],
  ['아이폰 SE(1세대) 사파리 가로 568x212', 568, 212, none],
];

function expectChoicesClearOfHudAndTextbox(L: Layout, vw: number, safe: typeof none) {
  // 선택지 목록은 무대 안(위 여백 아래)에서 시작해 이름표·빠른 메뉴 탭 띠 위에서 끝난다
  // (겹친 곳을 누르면 기록·메뉴가 열리던 문제). 탭 띠 아래는 대사창이다
  expect(L.cy).toBeGreaterThanOrEqual(L.sy);
  expect(L.cy + L.ch).toBeLessThanOrEqual(L.hy);
  expect(L.hy + L.btn).toBeCloseTo(L.ty, 5);
  expect(L.cy + L.ch).toBeLessThanOrEqual(L.ty);
  expect(L.cx).toBeGreaterThanOrEqual(safe.l - 0.5);
  expect(L.cx + L.cw).toBeLessThanOrEqual(vw - safe.r + 0.5);
  expect(L.cband).toBeCloseTo(L.cy - L.sy, 5);
}

describe('화면 배치', () => {
  it.each(cases)('%s: 무대·대사창·버튼이 화면/안전 영역 안에 있고 글자가 최소 크기 이상', (_n, vw, vh, safe) => {
    const L = computeLayout(vw, vh, safe);
    expect(L.fs).toBeGreaterThanOrEqual(MIN_FONT);
    // 무대 16:9
    expect(Math.abs(L.sw / L.sh - 16 / 9)).toBeLessThan(0.01);
    // 안전 영역 안
    expect(L.sx).toBeGreaterThanOrEqual(safe.l - 0.5);
    expect(L.sx + L.sw).toBeLessThanOrEqual(vw - safe.r + 0.5);
    expect(L.sy).toBeGreaterThanOrEqual(safe.t - 0.5);
    expect(L.sy + L.sh).toBeLessThanOrEqual(vh - safe.b + 0.5);
    // 대사창
    expect(L.tx).toBeGreaterThanOrEqual(safe.l - 0.5);
    expect(L.tx + L.tw).toBeLessThanOrEqual(vw - safe.r + 0.5);
    expect(L.ty + L.th).toBeLessThanOrEqual(vh - safe.b + 0.5);
    // 대사창에 3줄이 테두리까지 포함해 들어감 (위아래 여백 1.55em + 줄 1.62em×3 + 테두리 1px×2)
    expect(L.th).toBeGreaterThanOrEqual(L.fs * (1.55 + 1.62 * 3) + 2);
    expect(L.th).toBeGreaterThanOrEqual(textBoxHeightFor(3, L.fs) - 0.01);
    // 버튼 터치 영역: 이름표·빠른 메뉴 탭 44px 이상(휴대폰 가로 포함), 무대를 덜 가리게 48px 이하
    expect(L.btn).toBeGreaterThanOrEqual(TAB_MIN);
    expect(L.btn).toBeLessThanOrEqual(TAB_MAX);
  });

  it.each(cases)('%s: 선택지 목록이 HUD·대사창과 겹치지 않고, 고른 배치 단계로 한 줄짜리 선택지가 스크롤 없이 들어감', (_n, vw, vh, safe) => {
    const L = computeLayout(vw, vh, safe);
    expectChoicesClearOfHudAndTextbox(L, vw, safe);
    const space = choiceSpace(L);
    expect(space).toBeCloseTo(L.ch - CHOICE_PAD_Y * 2, 5);
    // 단계 0·1: 세로로 3개, 단계 2: 세로로 2개(3개면 가로 배치). 지원 화면은 단계 3(항상 가로)까지 내려가지 않는다
    expect(L.dense).toBeLessThanOrEqual(2);
    if (L.dense <= 1) expect(space).toBeGreaterThanOrEqual(choiceStackHeight(3, L.fs, L.dense === 1));
    else expect(space).toBeGreaterThanOrEqual(choiceStackHeight(2, L.fs, true));
  });

  it.each(tooShort)('%s: 지원 범위 밖의 낮은 화면도 선택지가 HUD·대사창과 겹치지 않는다(가로 배치 + 스크롤)', (_n, vw, vh, safe) => {
    const L = computeLayout(vw, vh, safe);
    expectChoicesClearOfHudAndTextbox(L, vw, safe);
    expect(L.dense).toBe(3);
    expect(L.ty + L.th).toBeLessThanOrEqual(vh + 0.5);
  });

  it('선택지 배치 단계: 화면 높이가 낮을수록 촘촘해진다', () => {
    expect(computeLayout(844, 390, notch).dense).toBe(0);
    expect(computeLayout(667, 375, none).dense).toBe(0);
    expect(computeLayout(740, 320, none).dense).toBe(1);
    expect(computeLayout(740, 280, none).dense).toBe(2);
    expect(computeLayout(740, 232, none).dense).toBe(3);
  });

  it('무대가 높이에 맞춰 줄어 좌우가 비면(레터박스) 선택지는 안전 영역 폭을 쓴다(줄바꿈을 줄임)', () => {
    const L = computeLayout(740, 280, none);
    expect(L.sw).toBeLessThan(740 - 100);
    expect(L.cw).toBeGreaterThan(L.sw + 100);
    const W = computeLayout(1280, 720, none);
    expect(W.cx).toBeCloseTo(W.sx, 5);
    expect(W.cw).toBeCloseTo(W.sw, 5);
  });

  it('명세 9.1 실측표: 대사창 높이·폭, 탭 띠 위치, 선택지 영역, 빠른 메뉴 폭 단계', () => {
    const rows: Array<[number, number, typeof none, number, number, number, number, string]> = [
      // vw, vh, safe, fs, th, tw, ch, qm
      // 탭 44~48px(예전 40~44px)·선택지와 탭 띠 사이 2px(예전 4px) 기준
      [1920, 1080, none, 26, 238, 1196, 747, 'icons'],
      [1280, 720, none, 24.5, 159, 1126, 483, 'icons'],
      [1024, 768, none, 19.6, 128, 901, 377, 'icons'],
      [844, 390, notch, 16, 105, 640, 202, 'full'],
      [844, 390, none, 16, 105, 676, 222, 'full'],
      [667, 375, none, 16, 105, 650, 207, 'full'],
      [740, 320, none, 16, 105, 553, 153, 'compact'],
      [740, 280, none, 16, 105, 482, 113, 'compact'],
      [390, 844, none, 16.4, 164, 374, 217, 'compact'],
    ];
    for (const [vw, vh, safe, fs, th, tw, ch, qm] of rows) {
      const L = computeLayout(vw, vh, safe);
      const at = `${vw}x${vh}`;
      expect(Math.abs(L.fs - fs), `${at} fs`).toBeLessThan(0.06);
      expect(Math.abs(L.th - th), `${at} th`).toBeLessThan(1);
      expect(Math.abs(L.tw - tw), `${at} tw`).toBeLessThan(1);
      expect(Math.abs(L.ch - ch), `${at} ch`).toBeLessThan(1);
      expect(L.qm, at).toBe(qm);
    }
    // 1280x720 에서 탭 띠 위끝은 무대 높이의 약 69.5%(예전 71% 보다 낮음 = 인물을 덜 가림)
    const W = computeLayout(1280, 720, none);
    expect((W.hy - W.sy) / W.sh).toBeCloseTo(0.695, 2);
    // 휴대폰 가로도 탭은 44px(예전 40px — 터치 목표 44px 미달)
    for (const [vw, vh, safe] of [
      [844, 390, notch],
      [667, 375, none],
      [740, 280, none],
    ] as const)
      expect(computeLayout(vw, vh, safe).btn, `${vw}x${vh} btn`).toBe(44);
    expect(W.m).toBeCloseTo(720 * 0.022, 5);
    // 빠른 메뉴 탭 오른쪽 끝은 대사창 오른쪽 끝에서 모서리 반경 + 이음새 폭만큼 안쪽
    expect(1280 - W.hr).toBeCloseTo(W.tx + W.tw - W.fs * 0.55 - 10, 5);
  });

  it('글자 크기 배율: fs 상·하한이 함께 커지고, 3줄 용량·터치 크기·겹침 없음은 그대로', () => {
    for (const scale of [1.12, 1.25]) {
      for (const [, vw, vh, safe] of cases) {
        const base = computeLayout(vw, vh, safe);
        const L = computeLayout(vw, vh, safe, { textScale: scale });
        expect(L.fs).toBeGreaterThanOrEqual(MIN_FONT * scale - 1e-9);
        expect(L.fs).toBeGreaterThan(base.fs);
        expect(L.th).toBeGreaterThanOrEqual(Math.min(textBoxHeightFor(3, L.fs), L.sh * 0.45) - 0.01);
        expect(L.btn).toBeGreaterThanOrEqual(TAB_MIN);
        expect(L.btn).toBeLessThanOrEqual(TAB_MAX);
        expectChoicesClearOfHudAndTextbox(L, vw, safe);
      }
    }
    // 하위 호환: 세 번째 인자만 넘기면 배율 1
    expect(computeLayout(844, 390, notch)).toEqual(computeLayout(844, 390, notch, { textScale: 1 }));
    // 이상한 배율은 1 로 본다
    expect(computeLayout(844, 390, notch, { textScale: Number.NaN })).toEqual(computeLayout(844, 390, notch));
  });

  it('CG 구도(cgfit): 탭 띠가 무대 높이의 66% 보다 위인 겹침 배치만 low(휴대폰 가로), 넓은 화면·세로 배치는 full', () => {
    for (const [vw, vh, safe] of [
      [667, 375, none],
      [844, 390, none],
      [844, 390, notch],
      [932, 430, none],
      [740, 320, none],
      [740, 280, none],
    ] as const) {
      const L = computeLayout(vw, vh, safe);
      expect(L.cgfit, `${vw}x${vh}`).toBe('low');
      expect((L.hy - L.sy) / L.sh).toBeLessThan(CG_LOW_BAND);
    }
    for (const [vw, vh] of [
      [1280, 720],
      [1920, 1080],
      [1024, 768],
      [390, 844],
      [320, 568],
    ] as const)
      expect(computeLayout(vw, vh, none).cgfit, `${vw}x${vh}`).toBe('full');
    // 글자를 키우면 대사창이 커져 탭 띠가 올라가므로 1280x720 도 low 가 된다
    expect(computeLayout(1280, 720, none, { textScale: 1.25 }).cgfit).toBe('low');
  });

  it('가로 화면은 overlay, 세로 화면은 대사창을 무대 아래에 둔다', () => {
    expect(computeLayout(844, 390, none).mode).toBe('overlay');
    expect(computeLayout(390, 844, none).mode).toBe('below');
  });
});

describe('날짜 카드: 카드가 그릴 다음 배경(bgAfterCard)과 날씨', () => {
  const steps = (id: string) => STORY.scenes[id]?.steps;

  it('카드 앞에서 암전하고 뒤에서 배경을 까는 대본은 그 다음 배경을 쓴다(축제 카드 → 밤 축제 거리·달)', () => {
    expect(bgAfterCard(steps('o5_festival'), 'o5.010')).toBe('festival_street');
    expect(bgAfterCard(steps('t5_festival'), 't5.010')).toBe('festival_street');
    expect(weatherOf('festival_street', 'night')).toBe('moon');
    // 카드 → hide → bg(hallway)
    expect(bgAfterCard(steps('c5_gym'), 'c5.010')).toBe('hallway');
  });

  it('카드 뒤 첫 대사·이동 전까지 bg 가 없으면 undefined(지금 배경을 쓴다)', () => {
    // 배경을 카드 앞에서 이미 깐 장면
    expect(bgAfterCard(steps('o1_shop'), 'o1.010')).toBeUndefined();
    expect(bgAfterCard(steps('t1_cats'), 't1.010')).toBeUndefined();
    const s = (x: Partial<Step> & { id: string; t: Step['t'] }) => x as Step;
    const flow: Step[] = [
      s({ id: 'k', t: 'card', text: '7월 6일 월요일' }),
      s({ id: 'a', t: 'say', who: null, text: '…' }),
      s({ id: 'b', t: 'bg', bg: 'classroom_day' }),
    ];
    expect(bgAfterCard(flow, 'k')).toBeUndefined();
    expect(bgAfterCard(flow, '없는 id')).toBeUndefined();
    expect(bgAfterCard(undefined, 'k')).toBeUndefined();
  });

  it('대본의 모든 날짜 카드는 그림 배경(다음 배경, 없으면 카드 앞 배경)을 흐려 그린다(암전 색 회색 카드 없음)', () => {
    let cards = 0;
    for (const scene of Object.values(STORY.scenes)) {
      scene.steps.forEach((st, i) => {
        if (st.t !== 'card') return;
        cards++;
        const before = scene.steps.slice(0, i).reverse().find((x) => x.t === 'bg');
        const drawn = bgAfterCard(scene.steps, st.id) ?? (before?.t === 'bg' ? before.bg : undefined);
        // 장면 첫 스텝이 카드면 앞 장면 배경을 쓴다(c5_gym 은 다음 배경이 있다)
        if (drawn === undefined) return;
        expect(['black', 'white'], `${st.id} → ${drawn}`).not.toContain(drawn);
      });
    }
    expect(cards).toBeGreaterThan(0);
  });
});
