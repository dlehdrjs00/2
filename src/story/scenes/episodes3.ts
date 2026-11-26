/**
 * 공통 에피소드 — 셋 판(코하루를 만나지 않은 플레이, 미발견 경로) · 뼈대
 *
 * ※ 지금 파일은 흐름·CG 연결만 잡은 뼈대다(대사는 '(초안)' 자리표시). 작가 초안이 이 파일을 통째로 대체한다.
 *   장면 id(e1_ice3·e2_frog3·e3_rain3)는 유지한다.
 *
 * 흐름(docs/EIGHT_ENDINGS_DESIGN.md 3.2·11절):
 *   c7 → e1_ice3(토 이른 오후 빙수집, group_ice_three) → c8_bakery → c9_puzzle
 *   → e2_frog3(월 점심 종이개구리, CG 없음) → c10_window → e3_rain3(월 방과 후 처마, CG 없음)
 *   → ep3.done → 판정(옛 규칙, 아카네·히나만 후보) → 루트 첫 장면
 * 점수 선택은 없다(기존 c8·c9·c10 의 선택만). 코하루의 이름·그림·빈자리·네 번째 그릇 같은 단서를 남기지 않는다.
 */
import type { Scene } from '../../engine/types';
import { bg, bgm, cg, decideRoute, flag, hide, jump, mono, place, routeBranch, say, scene, set, show } from '../../engine/dsl';
import { EP3_DONE, MET, ROUTE_CHOICES } from './common';

/** 둘이 한 화면에 설 때(교복, 7/13 월요일은 히나 기본 헤어) */
const standTwo = () => [
  show('osana', { pos: 'left', expr: 'neutral', outfit: 'uniform', hair: 'default' }),
  show('tenko', { pos: 'right', expr: 'smile', outfit: 'uniform', hair: 'default' }),
];

export const EP3_SCENES: Scene[] = [
  // ---------------------------------------------------------------------------
  // e1_ice3 — {d6} 이른 오후, 상점가 빙수집(셋). 히나가 아카네 취향을 맞힌다 → c8_bakery
  // ---------------------------------------------------------------------------
  scene({ id: 'e1_ice3', title: '주문하기도 전에', route: 'common', part: 'main' }, [
    hide('all'),
    bg('bg_ice_shop', 'black'),
    bgm('daily'),
    place('{d6} 이른 오후 · 상점가 빙수집'),
    mono('e1t.010', '(초안) 토요일 오후, {osana:와} {tenko:와} 셋이서 상점가 빙수집에 왔다.'),
    say('e1t.020', 'tenko', '(초안) {osana}짱은 이거지?'),
    cg('group_ice_three'),
    mono('e1t.030', '(초안) {osana:가} 메뉴를 고르기도 전에 {tenko}의 손가락이 딸기를 짚었다.'),
    cg(null),
    mono('e1t.040', '(초안) 두 사람과 헤어진 뒤, 빵을 사러 옆 블록으로 갔다.'),
    jump('c8_bakery'),
  ]),

  // ---------------------------------------------------------------------------
  // e2_frog3 — {r1} 점심, 2학년 3반 교실(셋). 종이개구리 → c10_window
  // ---------------------------------------------------------------------------
  scene({ id: 'e2_frog3', title: '종이개구리', route: 'common', part: 'main' }, [
    hide('all'),
    bg('classroom_day', 'black'),
    bgm('daily'),
    place('{r1} 점심 · 2학년 3반 교실'),
    ...standTwo(),
    mono('e2t.010', '(초안) 점심을 먹고 셋이서 종이개구리를 접었다.'),
    say('e2t.020', 'osana', '(초안) 딱 한 판만이야.', 'neutral'),
    mono('e2t.030', '(초안) 한 판은 세 판이 됐다. 책상을 정리하고 복도로 나갔다.'),
    jump('c10_window'),
  ]),

  // ---------------------------------------------------------------------------
  // e3_rain3 — {r1} 방과 후, 소나기가 그친 학교 처마(셋, CG 없음) → 판정(옛 규칙)
  // ---------------------------------------------------------------------------
  scene({ id: 'e3_rain3', title: '처마 밑 셋', route: 'common', part: 'main' }, [
    hide('all'),
    bg('bg_after_rain', 'black'),
    bgm('evening'),
    place('{r1} 방과 후 · 학교 처마 밑'),
    ...standTwo(),
    mono('e3t.010', '(초안) 소나기를 피해 셋이 처마 밑 마루에 앉았다. 우산은 펴지 않았다.'),
    say('e3t.020', 'tenko', '(초안) 비, 그쳤다.', 'smile'),
    mono('e3t.030', '(초안) 그래도 한동안 셋 다 일어나지 않았다.'),
    // 처마를 지난 새 흐름 표시 → 판정(미발견 경로는 옛 규칙 그대로, 히든 없음)
    set(flag(EP3_DONE)),
    decideRoute(ROUTE_CHOICES, { koharu: MET }),
    routeBranch({ osana: 'o1_shop', tenko: 't1_cats', koharu: 'k1' }),
  ]),
];
