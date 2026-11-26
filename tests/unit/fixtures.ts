/** 단위 테스트용 작은 합성 스토리 (실제 대본과 무관하게 엔진 규칙만 검증) */
import type { EndingDef, EndingId, Story } from '../../src/engine/types';
import {
  bg,
  bgm,
  cg,
  choice,
  chose,
  decideRoute,
  ending,
  flag,
  goto,
  hide,
  isFlag,
  jump,
  label,
  me,
  mono,
  not,
  opt,
  routeBranch,
  say,
  sayAs,
  scene,
  set,
  sfx,
  show,
  together,
  unlock,
  when,
} from '../../src/engine/dsl';

/** 축제 쪽 엔딩 셋만 있는 작은 스토리용(Story.endings 는 8개 키지만 합성 스토리는 쓰는 엔딩만 둔다) */
const ENDINGS: Story['endings'] = {
  osana: { id: 'osana', route: 'osana', kind: 'festival', title: 'A' },
  tenko: { id: 'tenko', route: 'tenko', kind: 'festival', title: 'B' },
  koharu: { id: 'koharu', route: 'koharu', kind: 'festival', title: 'C' },
} as Story['endings'];

/** 실제 대본과 같은 엔딩 8개(id·루트·갈래) */
export const ENDINGS8: Record<EndingId, EndingDef> = {
  osana: { id: 'osana', route: 'osana', kind: 'festival', title: 'A 축제' },
  osana_daily: { id: 'osana_daily', route: 'osana', kind: 'daily', title: 'A 일상' },
  tenko: { id: 'tenko', route: 'tenko', kind: 'festival', title: 'B 축제' },
  tenko_daily: { id: 'tenko_daily', route: 'tenko', kind: 'daily', title: 'B 일상' },
  koharu: { id: 'koharu', route: 'koharu', kind: 'festival', title: 'C 축제' },
  koharu_daily: { id: 'koharu_daily', route: 'koharu', kind: 'daily', title: 'C 일상' },
  group_festival: { id: 'group_festival', route: 'group', kind: 'festival', title: '넷 축제' },
  group_daily: { id: 'group_daily', route: 'group', kind: 'daily', title: '넷 일상' },
};

/**
 * 엔진 규칙용 작은 스토리. 첫 선택 c1.ch 의 '둘 다'(c, 함께)를 고르면 1:1 동점이라 해금(maxDiff 0)되고,
 * 마지막 선택 c1.ch4 에 코하루 개인 선택(k)이 보인다. a·b 만 고르면 해금되지 않아 예전 2인 스토리와 같다.
 */
export function miniStory(): Story {
  const scenes = [
    scene({ id: 'c1', title: '공통1', route: 'common', part: 'main' }, [
      bg('classroom_day', 'black'),
      show('osana', { pos: 'left' }),
      show('tenko', { pos: 'right' }),
      mono('c1.010', '시작'),
      say('c1.020', 'osana', '웃음', 'smile'),
      choice('c1.ch', '첫 선택', [
        opt('a', 'A', { heroine: 'osana', goto: 'c1.a' }),
        opt('b', 'B', { heroine: 'tenko', goto: 'c1.b' }),
        opt('c', '둘 다', { effects: together(), goto: 'c1.join' }),
      ]),
      label('c1.a'),
      say('c1.a10', 'osana', 'a 반응'),
      goto('c1.join'),
      label('c1.b'),
      say('c1.b10', 'tenko', 'b 반응'),
      label('c1.join'),
      unlock('koharu', ['osana', 'tenko'], 0, 'kh.met'),
      when(not(isFlag('kh.met')), 'c1.030'),
      show('koharu', { pos: 'center' }),
      sayAs('c1.k10', 'koharu', '여학생', '안녕하세요'),
      hide('koharu'),
      me('c1.030', '합류'),
      choice('c1.ch2', undefined, [opt('a', 'A2', { heroine: 'osana' }), opt('b', 'B2', { heroine: 'tenko' })]),
      when(chose('c1.ch2', 'a'), 'c1.x'),
      mono('c1.040', '두 번째 선택 b'),
      label('c1.x'),
      choice('c1.ch3', undefined, [opt('a', 'A3', { heroine: 'osana' }), opt('b', 'B3', { heroine: 'tenko' })]),
      choice('c1.ch4', undefined, [
        opt('a', 'A4', { heroine: 'osana' }),
        opt('b', 'B4', { heroine: 'tenko' }),
        opt('k', 'K4', { heroine: 'koharu', visibleIf: isFlag('kh.met') }),
      ]),
      decideRoute(['c1.ch', 'c1.ch2', 'c1.ch3', 'c1.ch4'], { koharu: 'kh.met' }),
      routeBranch({ osana: 'o1', tenko: 't1', koharu: 'k1' }),
    ]),
    scene({ id: 'o1', title: '소꿉 본편', route: 'osana', part: 'main' }, [
      mono('o1.010', '소꿉 루트'),
      choice('o1.ch', undefined, [opt('a', '루트 안 선택', { heroine: 'tenko' }), opt('b', '다른 선택')]),
      jump('o2'),
    ]),
    scene({ id: 'o2', title: '소꿉 후일담', route: 'osana', part: 'epilogue' }, [mono('o2.010', '후일담'), ending('o2.end', 'osana')]),
    scene({ id: 't1', title: '전학 본편', route: 'tenko', part: 'main' }, [mono('t1.010', '전학 루트'), jump('t2')]),
    scene({ id: 't2', title: '전학 후일담', route: 'tenko', part: 'epilogue' }, [mono('t2.010', '후일담'), ending('t2.end', 'tenko')]),
    scene({ id: 'k1', title: '후배 본편', route: 'koharu', part: 'main' }, [mono('k1.010', '후배 루트'), jump('k2')]),
    scene({ id: 'k2', title: '후배 후일담', route: 'koharu', part: 'epilogue' }, [mono('k2.010', '후일담'), ending('k2.end', 'koharu')]),
  ];
  return {
    version: 'test',
    start: 'c1',
    scenes: Object.fromEntries(scenes.map((s) => [s.id, s])),
    endings: { ...ENDINGS },
  };
}

/**
 * '장면 처음부터' 복구 검증용 합성 스토리.
 * r2 는 실제 대본의 c3_break 처럼 bg·bgm 지시 없이 r1 의 무대(교실·daily·소꿉친구)를 물려받고,
 * 장면 안에서 점수·플래그를 바꾸는 선택 뒤에 루트를 정한다. 히든 히로인은 없다(rk 는 형식상 분기 대상).
 */
export function recoveryStory(): Story {
  const scenes = [
    scene({ id: 'r1', title: '등교', route: 'common', part: 'main' }, [
      bg('classroom_day', 'black'),
      bgm('daily'),
      show('osana', { pos: 'left' }),
      mono('r1.010', '아침'),
      choice('r1.ch', undefined, [opt('a', 'A', { heroine: 'osana' }), opt('b', 'B', { heroine: 'tenko' })]),
      say('r1.020', 'osana', '가자'),
      jump('r2'),
    ]),
    scene({ id: 'r2', title: '쉬는 시간', route: 'common', part: 'main' }, [
      mono('r2.010', '쉬는 시간'),
      show('tenko', { pos: 'right' }),
      say('r2.020', 'tenko', '안녕'),
      choice('r2.ch', '누구와', [
        opt('a', '소꿉친구', { heroine: 'osana', goto: 'r2.a', effects: [flag('r2_osana')] }),
        opt('b', '전학생', { heroine: 'tenko', goto: 'r2.b' }),
      ]),
      label('r2.a'),
      say('r2.a10', 'osana', 'a 반응', 'smile'),
      say('r2.a20', 'osana', 'a 반응 2'),
      goto('r2.join'),
      label('r2.b'),
      say('r2.b10', 'tenko', 'b 반응', 'shy'),
      label('r2.join'),
      when(isFlag('r2_osana'), 'r2.flagged'),
      mono('r2.030', '플래그 없음'),
      label('r2.flagged'),
      decideRoute(['r1.ch', 'r2.ch']),
      routeBranch({ osana: 'ro', tenko: 'rt', koharu: 'rk' }),
    ]),
    scene({ id: 'ro', title: '소꿉 루트', route: 'osana', part: 'main' }, [mono('ro.010', '소꿉 루트'), ending('ro.end', 'osana')]),
    scene({ id: 'rt', title: '전학 루트', route: 'tenko', part: 'main' }, [mono('rt.010', '전학 루트'), ending('rt.end', 'tenko')]),
    scene({ id: 'rk', title: '후배 루트', route: 'koharu', part: 'main' }, [mono('rk.010', '후배 루트'), ending('rk.end', 'koharu')]),
  ];
  return {
    version: 'test',
    start: 'r1',
    scenes: Object.fromEntries(scenes.map((s) => [s.id, s])),
    endings: { ...ENDINGS },
  };
}

/** 초반 선택지 하나(개인 a·b, 함께 c)와 반응 */
function earlyChoice(prefix: string, points: number) {
  const id = `${prefix}.ch`;
  return [
    choice(id, `${prefix} 선택`, [
      opt('a', `${prefix} 아카네`, { heroine: 'osana', points, goto: `${prefix}.a` }),
      opt('b', `${prefix} 히나`, { heroine: 'tenko', points, goto: `${prefix}.b` }),
      opt('c', `${prefix} 셋이 함께`, { effects: together(), goto: `${prefix}.c` }),
    ]),
    label(`${prefix}.a`),
    say(`${prefix}.a10`, 'osana', `${prefix} a 반응`, 'smile'),
    goto(`${prefix}.join`),
    label(`${prefix}.b`),
    say(`${prefix}.b10`, 'tenko', `${prefix} b 반응`, 'smile'),
    goto(`${prefix}.join`),
    label(`${prefix}.c`),
    mono(`${prefix}.c10`, `${prefix} c 반응`),
    label(`${prefix}.join`),
  ];
}

/** 옛 후반 선택지 하나(c8·c9·c10, 구저장·미발견 전용): 개인 a·b +3, 해금 시 코하루 k +3, 미해금 시 함께 c(언제나 3개가 보인다) */
function lateChoice(prefix: string) {
  return [
    choice(`${prefix}.ch`, `${prefix} 선택`, [
      opt('a', `${prefix} 아카네`, { heroine: 'osana', points: 3, goto: `${prefix}.a` }),
      opt('b', `${prefix} 히나`, { heroine: 'tenko', points: 3, goto: `${prefix}.b` }),
      opt('k', `${prefix} {koharuFamily}`, { heroine: 'koharu', points: 3, goto: `${prefix}.k`, visibleIf: isFlag('kh.met') }),
      opt('c', `${prefix} 셋이 함께`, { effects: together(), goto: `${prefix}.c`, visibleIf: not(isFlag('kh.met')) }),
    ]),
    label(`${prefix}.a`),
    goto(`${prefix}.join`),
    label(`${prefix}.b`),
    goto(`${prefix}.join`),
    label(`${prefix}.k`),
    sayAs(`${prefix}.k10`, 'koharu', '{koharu} · 문자', `${prefix} 코하루 반응`),
    goto(`${prefix}.join`),
    label(`${prefix}.c`),
    label(`${prefix}.join`),
  ];
}

/** 새 발견 경로의 에피소드 선택지 하나: a·b·k 모두 +0.5, '함께' 없음. 고른 인물의 반응 뒤 합류 */
function episodeChoice(id: string) {
  return [
    choice(id, `${id} 선택`, [
      opt('a', `${id} 아카네`, { heroine: 'osana', points: 0.5, goto: `${id}.a` }),
      opt('b', `${id} 히나`, { heroine: 'tenko', points: 0.5, goto: `${id}.b` }),
      opt('k', `${id} {koharuFamily}`, { heroine: 'koharu', points: 0.5, goto: `${id}.k` }),
    ]),
    label(`${id}.a`),
    say(`${id}.a10`, 'osana', `${id} a 반응`),
    goto(`${id}.join`),
    label(`${id}.b`),
    say(`${id}.b10`, 'tenko', `${id} b 반응`),
    goto(`${id}.join`),
    label(`${id}.k`),
    say(`${id}.k10`, 'koharu', `${id} k 반응`),
    label(`${id}.join`),
  ];
}

/** 결말 갈래 선택(f 축제 / d 일상, 점수 없음). 축제 쪽이 조건 거짓일 때의 기본 흐름 */
function forkChoice(id: string, festival: string, daily: string, dailyLabel: string) {
  return [
    choice(id, '결말 갈래', [opt('f', '축제 쪽'), opt('d', '일상 쪽')]),
    when(chose(id, 'd'), dailyLabel),
    jump(festival),
    label(dailyLabel),
    jump(daily),
  ];
}

/** 미발견·구저장 판정 순서(옛 규칙) */
export const BRANCH_ORDER = ['c3.ch', 'c4.ch', 'c6.ch', 'c7.ch', 'c8.ch', 'c9.ch', 'c10.ch'];
/** 발견 경로 판정 순서(새 규칙, 설계 계약 3.1 ROUTE_CHOICES6) */
export const BRANCH_ORDER6 = ['c3.ch', 'c4.ch', 'c6.ch', 'c7.ch', 'e1f.ch1', 'e1f.ch2', 'e2f.ch1', 'e2f.ch2', 'e3f.ch1', 'e3f.ch2'];
export const EARLY_CHOICES = BRANCH_ORDER.slice(0, 4);
export const LATE_CHOICES6 = BRANCH_ORDER6.slice(4);
export const LATE_CHOICES3 = BRANCH_ORDER.slice(4);
export const FORK_CHOICES = ['o4.fork', 't4.fork', 'k4.fork', 'h.fork'];

/**
 * 실제 대본의 분기 구조(설계 계약 3절)를 같은 장면·선택지 id 로 줄여 옮긴 스토리.
 * 초반 c3/c4/c6 (+2) · c7 (+3) · 함께 (+1/+1) → c7.join 의 종소리 뒤 해금 판정 →
 *  [발견] 복도 첫 만남 → 노을길 → 토요일 추첨 c8_raffle → e1_ice4(e1f.ch1·ch2) → e1s_sunday4 → e2_frog4(e2f.ch1·ch2)
 *         → e3_rain4(e3f.ch1·ch2, +0.5 씩) → ep3.done → decideRoute(ROUTE_CHOICES6, tieRoute 'group') → o1_shop / t1_cats / k1 / h1
 *  [미발견] 노을길 → e1_ice3 → c8_bakery(c8.ch) → c9_puzzle(c9.ch) → e2_frog3 → c10_window(c10.ch) → e3_rain3 → 옛 판정
 *  [구저장] c8_bakery·c9_puzzle·c10_window 에 해금 상태로 들어오면 옛 k(+3) 분기 → c10.join 의 옛 판정(tieRoute 없음)
 * 루트마다 결말 갈래 선택(f/d) → 축제 쪽 / 일상 쪽 엔딩(8개).
 */
export function branchStory(): Story {
  const MET = 'kh.met';
  const scenes = [
    scene({ id: 'c3_break', title: '쉬는 시간', route: 'common', part: 'main' }, [
      bg('classroom_day', 'black'),
      bgm('daily'),
      show('osana', { pos: 'left', outfit: 'uniform' }),
      show('tenko', { pos: 'right', outfit: 'uniform' }),
      mono('c3.010', '월요일'),
      ...earlyChoice('c3', 2),
      jump('c4_town'),
    ]),
    scene({ id: 'c4_town', title: '동네 안내', route: 'common', part: 'main' }, [mono('c4.010', '화요일'), ...earlyChoice('c4', 2), jump('c6_rain')]),
    scene({ id: 'c6_rain', title: '비', route: 'common', part: 'main' }, [mono('c6.010', '목요일'), ...earlyChoice('c6', 2), jump('c7_friday')]),
    scene({ id: 'c7_friday', title: '금요일 노을', route: 'common', part: 'main' }, [
      bg('classroom_evening'),
      mono('c7.010', '금요일'),
      ...earlyChoice('c7', 3),
      sfx('bell'),
      unlock('koharu', ['osana', 'tenko'], 1, MET),
      when(not(isFlag(MET)), 'c7.road'),
      hide('all'),
      bg('hallway'),
      sayAs('c7.k10', 'koharu', '여학생', '앗, 죄송해요!'),
      cg('kh_meet'),
      sayAs('c7.k20', 'kh_friend', '여학생의 친구', '괜찮아?'),
      cg(null),
      label('c7.road'),
      hide('all'),
      bg('road_evening'),
      show('osana', { pos: 'left' }),
      show('tenko', { pos: 'right' }),
      say('c7.j20', 'tenko', '다음 주도 잘 부탁해.', 'smile'),
      say('c7.j30', 'osana', '새삼스럽게.', 'smile'),
      mono('c7.j40', '낯설던 일주일'),
      when(isFlag(MET), 'c7.met'),
      jump('e1_ice3'),
      label('c7.met'),
      jump('c8_raffle'),
    ]),
    scene({ id: 'c8_raffle', title: '토요일 추첨', route: 'common', part: 'main' }, [
      hide('all'),
      bg('shotengai'),
      show('koharu', { pos: 'center', outfit: 'casual' }),
      sayAs('c8r.010', 'koharu', '여학생', '어제 그…!'),
      cg('kh_draw'),
      say('c8r.020', 'koharu', '저는 {koharu}예요.', 'smile'),
      cg(null),
      hide('koharu'),
      jump('e1_ice4'),
    ]),
    // ---- 발견 경로 에피소드(넷) ----
    scene({ id: 'e1_ice4', title: '빙수집 넷', route: 'common', part: 'main' }, [
      bg('bg_ice_shop'),
      mono('e1f.010', '빙수집'),
      ...episodeChoice('e1f.ch1'),
      cg('group_ice_four'),
      mono('e1f.020', '네 숟가락'),
      ...episodeChoice('e1f.ch2'),
      jump('e1s_sunday4'),
    ]),
    scene({ id: 'e1s_sunday4', title: '일요일', route: 'common', part: 'main' }, [bg('black'), mono('e1s.010', '낱말풀이 세 칸'), jump('e2_frog4')]),
    scene({ id: 'e2_frog4', title: '종이개구리 넷', route: 'common', part: 'main' }, [
      bg('classroom_day'),
      mono('e2f.010', '종이개구리'),
      ...episodeChoice('e2f.ch1'),
      cg('group_frog'),
      mono('e2f.020', '하이파이브'),
      cg(null),
      ...episodeChoice('e2f.ch2'),
      jump('e3_rain4'),
    ]),
    scene({ id: 'e3_rain4', title: '처마 넷', route: 'common', part: 'main' }, [
      bg('bg_after_rain'),
      mono('e3f.010', '처마'),
      ...episodeChoice('e3f.ch1'),
      ...episodeChoice('e3f.ch2'),
      cg('group_rain'),
      mono('e3f.j10', '아무도 먼저 일어나지 않았다'),
      set(flag('ep3.done')),
      decideRoute(BRANCH_ORDER6, { koharu: MET }, { tieRoute: 'group' }),
      routeBranch({ osana: 'o1_shop', tenko: 't1_cats', koharu: 'k1', group: 'h1' }),
    ]),
    // ---- 미발견 경로 에피소드(셋) + 옛 후반 장면 ----
    scene({ id: 'e1_ice3', title: '빙수집 셋', route: 'common', part: 'main' }, [
      bg('bg_ice_shop'),
      mono('e1t.010', '빙수집 셋'),
      cg('group_ice_three'),
      mono('e1t.020', '딸기'),
      cg(null),
      jump('c8_bakery'),
    ]),
    scene({ id: 'c8_bakery', title: '토요일 오후', route: 'common', part: 'main' }, [
      bg('shotengai'),
      mono('c8.010', '토요일 오후'),
      ...lateChoice('c8'),
      mono('c8.020', '빵집'),
      jump('c9_puzzle'),
    ]),
    scene({ id: 'c9_puzzle', title: '일요일', route: 'common', part: 'main' }, [
      mono('c9.010', '일요일'),
      ...lateChoice('c9'),
      mono('c9.j10', '선풍기'),
      when(isFlag(MET), 'c9.old'),
      jump('e2_frog3'),
      label('c9.old'),
      jump('c10_window'),
    ]),
    scene({ id: 'e2_frog3', title: '종이개구리 셋', route: 'common', part: 'main' }, [bg('classroom_day'), mono('e2t.010', '셋이서 종이개구리'), jump('c10_window')]),
    scene({ id: 'c10_window', title: '월요일 점심', route: 'common', part: 'main' }, [
      bg('hallway'),
      mono('c10.010', '월요일'),
      when(not(isFlag(MET)), 'c10.ask'),
      mono('c10.040', '{koharuFamily:가} 손을 들어 보였다'),
      label('c10.ask'),
      ...lateChoice('c10'),
      mono('c10.j10', '방과 후'),
      when(not(isFlag(MET)), 'c10.ep3'),
      decideRoute(BRANCH_ORDER, { koharu: MET }),
      routeBranch({ osana: 'o1_shop', tenko: 't1_cats', koharu: 'k1' }),
      label('c10.ep3'),
      jump('e3_rain3'),
    ]),
    scene({ id: 'e3_rain3', title: '처마 셋', route: 'common', part: 'main' }, [
      bg('bg_after_rain'),
      mono('e3t.010', '셋이서 처마'),
      set(flag('ep3.done')),
      decideRoute(BRANCH_ORDER, { koharu: MET }),
      routeBranch({ osana: 'o1_shop', tenko: 't1_cats', koharu: 'k1' }),
    ]),
    // ---- 루트 ----
    scene({ id: 'o1_shop', title: '아카네 본편', route: 'osana', part: 'main' }, [
      when(not(isFlag('ep3.done')), 'o1.010'),
      mono('o1.005', '처마에서 막 헤어진 참'),
      mono('o1.010', '아카네 루트'),
      ...forkChoice('o4.fork', 'o9_end', 'od1', 'o4.d'),
    ]),
    scene({ id: 'o9_end', title: '아카네 후일담', route: 'osana', part: 'epilogue' }, [mono('o9.010', '후일담'), ending('o9.end', 'osana')]),
    scene({ id: 'od1', title: '아카네 일상', route: 'osana', part: 'epilogue' }, [cg('end_akane_walk'), mono('od1.010', '내일은 데이트하자'), ending('od1.end', 'osana_daily')]),
    scene({ id: 't1_cats', title: '히나 본편', route: 'tenko', part: 'main' }, [
      mono('t1.010', '히나 루트'),
      when(chose('c7.ch', 'b'), 't1.c7b'),
      mono('t1.020', '언덕길은 아직'),
      label('t1.c7b'),
      ...forkChoice('t4.fork', 't9_end', 'td1', 't4.d'),
    ]),
    scene({ id: 't9_end', title: '히나 후일담', route: 'tenko', part: 'epilogue' }, [mono('t9.010', '후일담'), ending('t9.end', 'tenko')]),
    scene({ id: 'td1', title: '히나 일상', route: 'tenko', part: 'epilogue' }, [cg('end_hina_walk'), mono('td1.010', '네가 먼저 보는 것'), ending('td1.end', 'tenko_daily')]),
    scene({ id: 'k1', title: '코하루 본편', route: 'koharu', part: 'main' }, [
      hide('all'),
      show('koharu', { pos: 'center', outfit: 'uniform' }),
      say('k1.010', 'koharu', '선배!', 'smile'),
      ...forkChoice('k4.fork', 'k8', 'kd1', 'k4.d'),
    ]),
    scene({ id: 'k8', title: '코하루 후일담', route: 'koharu', part: 'epilogue' }, [cg('kh_date'), mono('k8.010', '일요일은 둘이서'), ending('k8.end', 'koharu')]),
    scene({ id: 'kd1', title: '코하루 일상', route: 'koharu', part: 'epilogue' }, [cg('end_koharu_coin'), mono('kd1.010', '옆자리'), ending('kd1.end', 'koharu_daily')]),
    scene({ id: 'h1', title: '네 사람 본편', route: 'group', part: 'main' }, [
      hide('all'),
      show('osana', { pos: 'left' }),
      show('tenko', { pos: 'center' }),
      show('koharu', { pos: 'right' }),
      mono('h1.010', '넷이서'),
      ...forkChoice('h.fork', 'hf1', 'hd1', 'h.d'),
    ]),
    scene({ id: 'hf1', title: '네 사람 축제', route: 'group', part: 'epilogue' }, [
      sfx('firework'),
      cg('end_group_fireworks'),
      mono('hf1.010', '불꽃'),
      ending('hf1.end', 'group_festival'),
    ]),
    scene({ id: 'hd1', title: '네 사람 일상', route: 'group', part: 'epilogue' }, [
      say('hd1.010', 'osana', '기다렸지?'),
      sayAs('hd1.020', 'chorus', '{me} · {tenko} · {koharu}', '응'),
      cg('end_group_morning'),
      ending('hd1.end', 'group_daily'),
    ]),
  ];
  return {
    version: 'branch-test',
    start: 'c3_break',
    scenes: Object.fromEntries(scenes.map((s) => [s.id, s])),
    endings: { ...ENDINGS8 },
  };
}

/** branchStory 검증용 치환 값 */
export const BRANCH_VARS = { koharu: '코하루', koharuFamily: '나루세', me: '소우타', tenko: '히나' } as const;

export const permissiveAssets = {
  hasBg: () => true,
  hasSprite: () => true,
  hasBgm: () => true,
  hasSfx: () => true,
  speakers: ['me', 'osana', 'tenko', 'koharu', 'teacher', 'grandma', 'classmates', 'shopkeeper', 'kh_friend', 'raffle', 'chorus'],
};

type H3 = 'osana' | 'tenko' | 'koharu';
const who = (id: string): H3 | null => (id === 'a' ? 'osana' : id === 'b' ? 'tenko' : id === 'k' ? 'koharu' : null);
/** 초반 네 선택(c3·c4·c6 +2, c7 +3, c 함께 +1/+1)과 해금(차 ≤ 1 → 코하루 = 평균) */
function earlyScore(picks: readonly string[]) {
  const p = { osana: 0, tenko: 0, koharu: 0 };
  const early = [2, 2, 2, 3];
  picks.slice(0, 4).forEach((id, i) => {
    const h = who(id);
    if (h) p[h] += early[i];
    else {
      p.osana += 1;
      p.tenko += 1;
    }
  });
  const met = Math.abs(p.osana - p.tenko) <= 1;
  if (met) p.koharu = (p.osana + p.tenko) / 2;
  return { p, met };
}
/** 공동 최고점이면 picks 를 뒤에서부터 훑어 공동 최고점인 개인 선택(없으면 후보 순서 첫째) */
function byHistory(p: Record<H3, number>, cands: readonly H3[], picks: readonly string[]) {
  const top = Math.max(...cands.map((h) => p[h]));
  const tied = cands.filter((h) => p[h] === top);
  let route = tied[0];
  if (tied.length > 1) {
    for (let i = picks.length - 1; i >= 0; i--) {
      const h = who(picks[i]);
      if (h && tied.includes(h)) {
        route = h;
        break;
      }
    }
  }
  return { route, tied };
}

/**
 * 옛 규칙(897ae1f, 코하루 확장)의 손 계산: 초반 넷 + 후반 c8·c9·c10(a·b·k +3, 미해금은 c 함께). 히든 루트 없음.
 * 구저장 시드(해금된 채 옛 후반 장면에 들어온 저장)의 기대값에 쓴다. picks = [c3, c4, c6, c7, c8, c9, c10] 의 옵션 id.
 */
export function contractRouteOld(picks: readonly string[]): { route: H3; met: boolean; points: Record<H3, number>; tie: boolean } {
  const { p, met } = earlyScore(picks);
  for (const id of picks.slice(4)) {
    const h = who(id);
    if (h) p[h] += 3;
    else {
      p.osana += 1;
      p.tenko += 1;
    }
  }
  const cands: readonly H3[] = met ? ['osana', 'tenko', 'koharu'] : ['osana', 'tenko'];
  const { route, tied } = byHistory(p, cands, picks);
  return { route, met, points: p, tie: tied.length > 1 };
}

/**
 * 설계 계약 5절 규칙을 옵션 id(a=아카네, b=히나, k=코하루, c=함께)와 가중치만으로 손으로 옮긴 계산.
 * 대본의 옵션 정의·실행기·검증기 오라클 어느 것도 쓰지 않는다(세 번째 독립 계산).
 *  - 발견: picks = [c3, c4, c6, c7, e1f.ch1, e1f.ch2, e2f.ch1, e2f.ch2, e3f.ch1, e3f.ch2], 후반 여섯은 고른 사람만 +0.5.
 *    세 점수가 완전히 같으면 히든 루트 'group', 단독 최고점이면 그 사람, 두 사람 동점이면 최근 선택.
 *  - 미발견: picks = [c3, c4, c6, c7, c8, c9, c10], 후반 셋은 a·b +3 / c 함께(옛 규칙 그대로, 후보 두 명).
 * 결말 갈래 선택(f/d)은 넣지 않는다(루트에 영향 없음).
 */
export function contractRoute(picks: readonly string[]): {
  route: H3 | 'group';
  met: boolean;
  points: Record<H3, number>;
  tie: boolean;
  hidden: boolean;
} {
  const { met } = earlyScore(picks);
  if (!met) {
    const old = contractRouteOld(picks);
    return { ...old, hidden: false };
  }
  const { p } = earlyScore(picks);
  for (const id of picks.slice(4)) p[who(id)!] += 0.5;
  if (p.osana === p.tenko && p.tenko === p.koharu) return { route: 'group', met, points: p, tie: false, hidden: true };
  const { route, tied } = byHistory(p, ['osana', 'tenko', 'koharu'], picks);
  return { route, met, points: p, tie: tied.length > 1, hidden: false };
}

/** 초반 a·b·c 넷과 후반(발견이면 a·b·k 여섯, 미발견이면 a·b·c 셋)의 모든 조합: 25×729 + 56×27 = 19,737 */
export function allPicks(): string[][] {
  const out: string[][] = [];
  const rec = (acc: string[], len: number, opts: string[]) => {
    if (acc.length === len) {
      out.push(acc);
      return;
    }
    for (const o of opts) rec([...acc, o], len, opts);
  };
  for (const early of allEarly()) {
    const { met } = earlyScore(early);
    rec(early, met ? 10 : 7, met ? ['a', 'b', 'k'] : ['a', 'b', 'c']);
  }
  return out;
}

/** 초반 네 선택의 81 조합 */
export function allEarly(): string[][] {
  const out: string[][] = [];
  for (const a of 'abc') for (const b of 'abc') for (const c of 'abc') for (const d of 'abc') out.push([a, b, c, d]);
  return out;
}

/** 초반 조합의 발견 여부와 시작 점수(손 계산) */
export function earlyOutcome(picks: readonly string[]) {
  return earlyScore(picks);
}
