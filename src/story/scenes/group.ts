/**
 * 히든 루트(네 사람, route 'group') — 본편 h1~, 축제 쪽 hf1~, 일상 쪽 hd1~ · 뼈대
 *
 * ※ 지금 파일은 흐름·CG·엔딩 연결만 잡은 뼈대다(대사는 '(초안)' 자리표시). 작가 초안이 이 파일을 통째로 대체한다.
 *   장면 id(h1·hf1·hd1)와 결말 갈래 선택 id(h.fork, 옵션 f·d)는 유지한다.
 *
 * 진입: e3_rain4 판정에서 세 사람(아카네·히나·코하루)의 점수가 완전히 같으면 routeBranch group → h1.
 * 흐름(docs/EIGHT_ENDINGS_DESIGN.md 3.5·11.6절):
 *   h1(7/13 방과 후~7/17, 본편) → h.fork
 *     f: hf1 …(8/8 강변, 고백 → 세 사람의 대답 → 첫 불꽃 → end_group_fireworks) → 엔딩 group_festival
 *     d: hd1 …(방학 중 → 9/1 개학 첫날 모퉁이, chorus 「응」 → end_group_morning) → 엔딩 group_daily
 * 결말 갈래 옵션에는 heroine·points·effects 가 없다(루트 확정 뒤라 점수에 영향 없음).
 */
import type { Scene } from '../../engine/types';
import { bg, bgm, card, cg, choice, ending, hide, jump, label, me, mono, opt, place, say, sayAs, scene, sfx, show } from '../../engine/dsl';

export const GROUP_SCENES: Scene[] = [
  // ---------------------------------------------------------------------------
  // h1 — {r1} 방과 후 ~ {r5}. 네 사람 본편(아직 사귀지 않음) → 결말 갈래 선택
  // ---------------------------------------------------------------------------
  scene({ id: 'h1', title: '넷이서', route: 'group', part: 'main' }, [
    hide('all'),
    bg('shoe_lockers', 'black'),
    bgm('daily'),
    place('{r1} 방과 후 · 학교 신발장'),
    show('osana', { pos: 'left', expr: 'neutral', outfit: 'uniform', hair: 'default' }),
    show('tenko', { pos: 'center', expr: 'smile', outfit: 'uniform', hair: 'default' }),
    show('koharu', { pos: 'right', expr: 'smile', outfit: 'uniform', hair: 'default' }),
    mono('h1.010', '(초안) 처마에서 일어난 뒤에도 넷은 신발장 앞에서 한참 서 있었다.'),
    hide('all'),
    bg('riverbank_evening', 'black'),
    bgm('heart'),
    card('h1.020', '{r5}', '방과 후 · 강변 둑'),
    mono('h1.030', '(초안) 금요일. 세 사람에게 각자 말할 시간을 받았고, 각자의 대답을 들었다.'),
    me('h1.040', '(초안) 여름 방학, 넷이서 뭘 할까.'),
    choice('h.fork', '(초안) 여름 방학, 넷이서…', [
      opt('f', '(초안) 함께 축제를 준비하자고 한다', { goto: 'h1.f' }),
      opt('d', '(초안) 방학 중에 만나 먼저 마음을 이야기한다', { goto: 'h1.d' }),
    ]),
    label('h1.f'),
    jump('hf1'),
    label('h1.d'),
    jump('hd1'),
  ]),

  // ---------------------------------------------------------------------------
  // hf1 — 축제 쪽 「불꽃이 오르기 전에」. {fest} 강변 → 엔딩 group_festival
  // ---------------------------------------------------------------------------
  scene({ id: 'hf1', title: '불꽃이 오르기 전에', route: 'group', part: 'epilogue' }, [
    hide('all'),
    bg('riverbank_night', 'black'),
    bgm('festival'),
    place('{fest} 밤 · 강변'),
    mono('hf1.010', '(초안) 강변에서 넷이 만났다. 불꽃이 오르기 전에 내가 먼저 말했다.'),
    mono('hf1.020', '(초안) 세 사람이 차례로, 분명하게 대답했다.'),
    sfx('firework'),
    cg('end_group_fireworks'),
    mono('hf1.030', '(초안) 첫 불꽃이 터졌는데, 우리는 하늘보다 서로를 먼저 봤다.'),
    cg(null),
    mono('hf1.040', '(초안) 돌아오는 길은 짧았다.'),
    ending('hf1.end', 'group_festival'),
  ]),

  // ---------------------------------------------------------------------------
  // hd1 — 일상 쪽 「내일도 넷이서 갈래?」. 방학 중 → {term2} 개학 첫날 모퉁이 → 엔딩 group_daily
  // ---------------------------------------------------------------------------
  scene({ id: 'hd1', title: '내일도 넷이서', route: 'group', part: 'epilogue' }, [
    hide('all'),
    bg('road_morning', 'black'),
    bgm('daily'),
    card('hd1.010', '{term2}', '아침 · 등굣길 모퉁이'),
    mono('hd1.020', '(초안) 늘 {osana:와} 만나던 모퉁이에 {tenko:와} {koharu:가} 먼저 와 있었다.'),
    say('hd1.030', 'osana', '(초안) 기다렸지?'),
    sayAs('hd1.040', 'chorus', '{me} · {tenko} · {koharu}', '(초안) 응.'),
    cg('end_group_morning'),
    mono('hd1.050', '(초안) 넷이 웃으며 학교로 걸었다.'),
    ending('hd1.end', 'group_daily'),
  ]),
];
