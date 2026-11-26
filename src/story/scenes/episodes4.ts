/**
 * 공통 에피소드 — 넷 판(코하루를 만난 플레이, 발견 경로) · 뼈대
 *
 * ※ 지금 파일은 흐름·선택·CG 연결만 잡은 뼈대다(대사는 '(초안)' 자리표시). 작가 초안이 이 파일을 통째로 대체한다.
 *   장면 id(e1_ice4·e1s_sunday4·e2_frog4·e3_rain4), 선택 id(e1f.ch1 … e3f.ch2), 옵션 id(a·b·k)와 배점(+0.5)은 유지한다.
 *
 * 흐름(docs/EIGHT_ENDINGS_DESIGN.md 3.1·11절):
 *   c8_raffle(토 오전) → e1_ice4(토 이른 오후 빙수집, 선택 ①②, group_ice_four)
 *   → e1s_sunday4(일, 선택 없음) → e2_frog4(월 점심 종이개구리, 선택 ③④, group_frog)
 *   → e3_rain4(월 방과 후 처마, 선택 ⑤⑥, group_rain) → ep3.done → 판정(완전 동점이면 히든 'group') → 루트 첫 장면
 * 후반 선택 6회: 옵션 a(아카네)·b(히나)·k(코하루), 고른 한 사람에게만 +0.5. '모두'·'함께' 옵션은 없다.
 * 사복 스프라이트는 코하루만 있으므로 토요일 빙수집은 스프라이트 없이 배경·CG·서술로 쓴다.
 * 셋을 한 화면에 세울 때는 아카네 left · 히나 center · 코하루 right(CG 배치와 같음). 7/13(월)은 체육이 없어 히나 기본 헤어.
 */
import type { Scene } from '../../engine/types';
import {
  bg,
  bgm,
  cg,
  choice,
  decideRoute,
  flag,
  goto,
  hide,
  jump,
  label,
  me,
  mono,
  opt,
  place,
  routeBranch,
  say,
  scene,
  set,
  sfx,
  show,
} from '../../engine/dsl';
import { EP3_DONE, MET, ROUTE_CHOICES6 } from './common';

/** 넷이 한 화면에 설 때(교복). 아카네 left · 히나 center · 코하루 right */
const standFour = () => [
  show('osana', { pos: 'left', expr: 'neutral', outfit: 'uniform', hair: 'default' }),
  show('tenko', { pos: 'center', expr: 'smile', outfit: 'uniform', hair: 'default' }),
  show('koharu', { pos: 'right', expr: 'smile', outfit: 'uniform', hair: 'default' }),
];

export const EP4_SCENES: Scene[] = [
  // ---------------------------------------------------------------------------
  // e1_ice4 — {d6} 이른 오후, 상점가 빙수집 야외 테이블. 선택 ①(첫 숟가락) ②(장난 가담)
  // ---------------------------------------------------------------------------
  scene({ id: 'e1_ice4', title: '네 숟가락', route: 'common', part: 'main' }, [
    hide('all'),
    bg('bg_ice_shop', 'black'),
    bgm('daily'),
    place('{d6} 이른 오후 · 상점가 빙수집'),
    mono('e1f.010', '(초안) 추첨 뒤 {koharuFamily:와} 상점가를 걷다가 {osana}·{tenko:와} 마주쳐 빙수집에 왔다.'),
    mono('e1f.020', '(초안) 넷이 서로 다른 맛을 시켰다. 그릇이 나오자 누구 것부터 맛볼지가 문제였다.'),
    choice('e1f.ch1', '(초안) 첫 숟가락은…', [
      opt('a', '(초안) {osana}에게 건넨다', { heroine: 'osana', points: 0.5, goto: 'e1f.1a' }),
      opt('b', '(초안) {tenko}에게 건넨다', { heroine: 'tenko', points: 0.5, goto: 'e1f.1b' }),
      opt('k', '(초안) {koharuFamily}에게 건넨다', { heroine: 'koharu', points: 0.5, goto: 'e1f.1k' }),
    ]),

    label('e1f.1a'),
    say('e1f.1a10', 'osana', '(초안) 아카네의 반응.'),
    goto('e1f.1j'),

    label('e1f.1b'),
    say('e1f.1b10', 'tenko', '(초안) 히나의 반응.'),
    goto('e1f.1j'),

    label('e1f.1k'),
    say('e1f.1k10', 'koharu', '(초안) 코하루의 반응.'),

    label('e1f.1j'),
    mono('e1f.030', '(초안) {tenko:가} 장난을 걸고, {koharuFamily:는} 알면서 속아 준다.'),
    choice('e1f.ch2', '(초안) 누구의 장난에 가담할까', [
      opt('a', '(초안) {osana} 편을 든다', { heroine: 'osana', points: 0.5, goto: 'e1f.2a' }),
      opt('b', '(초안) {tenko}의 장난에 끼어든다', { heroine: 'tenko', points: 0.5, goto: 'e1f.2b' }),
      opt('k', '(초안) {koharuFamily:와} 같이 속아 준다', { heroine: 'koharu', points: 0.5, goto: 'e1f.2k' }),
    ]),

    label('e1f.2a'),
    say('e1f.2a10', 'osana', '(초안) 아카네의 반응.'),
    goto('e1f.2j'),

    label('e1f.2b'),
    say('e1f.2b10', 'tenko', '(초안) 히나의 반응.'),
    goto('e1f.2j'),

    label('e1f.2k'),
    say('e1f.2k10', 'koharu', '(초안) 코하루의 반응.'),

    label('e1f.2j'),
    mono('e1f.040', '(초안) {tenko:가} 딸기빙수를 들어 올리자, 네 숟가락이 같은 그릇으로 향했다.'),
    cg('group_ice_four'),
    mono('e1f.050', '(초안) 누가 먼저였는지는 아무도 따지지 않았다.'),
    cg(null),
    mono('e1f.060', '(초안) 헤어지기 전에 넷이 쓰는 대화방이 하나 생겼다.'),
    jump('e1s_sunday4'),
  ]),

  // ---------------------------------------------------------------------------
  // e1s_sunday4 — {d7} 집. 낱말풀이 마지막 세 칸(선택 없음, 짧게)
  // ---------------------------------------------------------------------------
  scene({ id: 'e1s_sunday4', title: '세 칸', route: 'common', part: 'main' }, [
    hide('all'),
    bg('black', 'black'),
    bgm('daily'),
    place('{d7} 점심 · 집'),
    mono('e1s.010', '(초안) 신문 낱말풀이 마지막 세 칸이 비었다. ‘더우면 펴고, 바람 불면 접는다.’'),
    mono('e1s.020', '(초안) 못 채운 신문을 접어 월요일 가방에 넣었다.'),
    jump('e2_frog4'),
  ]),

  // ---------------------------------------------------------------------------
  // e2_frog4 — {r1} 점심, 2학년 3반 교실. 선택 ③(대회 중) ④(종 치기 오 분 전 창가)
  // ---------------------------------------------------------------------------
  scene({ id: 'e2_frog4', title: '딱 한 판만', route: 'common', part: 'main' }, [
    hide('all'),
    bg('classroom_day', 'black'),
    bgm('daily'),
    place('{r1} 점심 · 2학년 3반 교실'),
    ...standFour(),
    mono('e2f.010', '(초안) 책상 두 개를 붙였다. {koharuFamily:가} 1학년 교실에서 건너왔다.'),
    choice('e2f.ch1', '(초안) 대회 중에…', [
      opt('a', '(초안) {osana}의 골대를 같이 지킨다', { heroine: 'osana', points: 0.5, goto: 'e2f.1a' }),
      opt('b', '(초안) 심판 {tenko} 옆에 선다', { heroine: 'tenko', points: 0.5, goto: 'e2f.1b' }),
      opt('k', '(초안) {koharuFamily}의 개구리를 접어 준다', { heroine: 'koharu', points: 0.5, goto: 'e2f.1k' }),
    ]),

    label('e2f.1a'),
    say('e2f.1a10', 'osana', '(초안) 아카네의 반응.'),
    goto('e2f.1j'),

    label('e2f.1b'),
    say('e2f.1b10', 'tenko', '(초안) 히나의 반응.'),
    goto('e2f.1j'),

    label('e2f.1k'),
    say('e2f.1k10', 'koharu', '(초안) 코하루의 반응.'),

    label('e2f.1j'),
    sfx('sparkle'),
    mono('e2f.020', '(초안) 개구리가 {osana}의 손가락 골대를 지나 내 도시락 뚜껑에 내려앉았다.'),
    cg('group_frog'),
    mono('e2f.030', '(초안) 심판이 두 팔을 들었다. ‘딱 한 판만’이라던 {osana:가} 먼저 손바닥을 내밀었다.'),
    cg(null),
    mono('e2f.040', '(초안) 종 치기 오 분 전. 창가로 바람이 들어왔다.'),
    choice('e2f.ch2', '(초안) 창가에서 누구 곁으로 갈까', [
      opt('a', '(초안) {osana} 옆에서 바람을 쐰다', { heroine: 'osana', points: 0.5, goto: 'e2f.2a' }),
      opt('b', '(초안) {tenko:가} 짚은 그늘로 간다', { heroine: 'tenko', points: 0.5, goto: 'e2f.2b' }),
      opt('k', '(초안) {koharuFamily:를} 교실 앞까지 배웅한다', { heroine: 'koharu', points: 0.5, goto: 'e2f.2k' }),
    ]),

    label('e2f.2a'),
    say('e2f.2a10', 'osana', '(초안) 아카네의 반응.'),
    goto('e2f.2j'),

    label('e2f.2b'),
    say('e2f.2b10', 'tenko', '(초안) 히나의 반응.'),
    goto('e2f.2j'),

    label('e2f.2k'),
    say('e2f.2k10', 'koharu', '(초안) 코하루의 반응.'),

    label('e2f.2j'),
    sfx('bell'),
    mono('e2f.050', '(초안) 종이 울렸다.'),
    jump('e3_rain4'),
  ]),

  // ---------------------------------------------------------------------------
  // e3_rain4 — {r1} 방과 후, 소나기가 그친 학교 처마. 선택 ⑤(누구의 농담) ⑥(낱말풀이 세 칸) → 판정
  // ---------------------------------------------------------------------------
  scene({ id: 'e3_rain4', title: '비는 벌써 그쳤는데', route: 'common', part: 'main' }, [
    hide('all'),
    bg('bg_after_rain', 'black'),
    bgm('evening'),
    place('{r1} 방과 후 · 학교 처마 밑'),
    ...standFour(),
    mono('e3f.010', '(초안) 소나기를 피해 넷이 처마 밑 마루에 앉았다. 우산은 아무도 펴지 않았다.'),
    choice('e3f.ch1', '(초안) 누구의 농담을 받아 줄까', [
      opt('a', '(초안) {osana}의 농담을 받는다', { heroine: 'osana', points: 0.5, goto: 'e3f.1a' }),
      opt('b', '(초안) {tenko}의 농담을 받는다', { heroine: 'tenko', points: 0.5, goto: 'e3f.1b' }),
      opt('k', '(초안) {koharuFamily}의 농담을 받는다', { heroine: 'koharu', points: 0.5, goto: 'e3f.1k' }),
    ]),

    label('e3f.1a'),
    say('e3f.1a10', 'osana', '(초안) 아카네의 반응.'),
    goto('e3f.1j'),

    label('e3f.1b'),
    say('e3f.1b10', 'tenko', '(초안) 히나의 반응.'),
    goto('e3f.1j'),

    label('e3f.1k'),
    say('e3f.1k10', 'koharu', '(초안) 코하루의 반응.'),

    label('e3f.1j'),
    mono('e3f.020', '(초안) 가방에서 일요일에 못 채운 낱말풀이를 꺼냈다. 남은 건 세 칸.'),
    choice('e3f.ch2', '(초안) 마지막 세 칸을 누구에게 물을까', [
      opt('a', '(초안) {osana}에게 묻는다', { heroine: 'osana', points: 0.5, goto: 'e3f.2a' }),
      opt('b', '(초안) {tenko}에게 묻는다', { heroine: 'tenko', points: 0.5, goto: 'e3f.2b' }),
      opt('k', '(초안) {koharuFamily}에게 묻는다', { heroine: 'koharu', points: 0.5, goto: 'e3f.2k' }),
    ]),

    label('e3f.2a'),
    say('e3f.2a10', 'osana', '(초안) 아카네의 반응.'),
    goto('e3f.2j'),

    label('e3f.2b'),
    say('e3f.2b10', 'tenko', '(초안) 히나의 반응.'),
    goto('e3f.2j'),

    label('e3f.2k'),
    say('e3f.2k10', 'koharu', '(초안) 코하루의 반응.'),

    label('e3f.2j'),
    mono('e3f.030', '(초안) 빗소리가 멎고 햇빛이 돌아왔다. 아무도 먼저 일어나지 않았다.'),
    cg('group_rain'),
    me('e3f.040', '(초안) 비, 그쳤네.'),
    cg(null),
    mono('e3f.050', '(초안) 결국 다 같이 일어났다. 교문 앞에서 저마다의 방향으로 헤어졌다.'),
    // 처마를 지난 새 흐름 표시 → 판정(여섯째 선택 뒤 한 번). 세 명 완전 동점이면 히든 루트
    set(flag(EP3_DONE)),
    decideRoute(ROUTE_CHOICES6, { koharu: MET }, { tieRoute: 'group' }),
    routeBranch({ osana: 'o1_shop', tenko: 't1_cats', koharu: 'k1', group: 'h1' }),
  ]),
];
