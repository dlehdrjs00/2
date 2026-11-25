/** 단위 테스트용 작은 합성 스토리 (실제 대본과 무관하게 엔진 규칙만 검증) */
import type { Story } from '../../src/engine/types';
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
  sfx,
  show,
  together,
  unlock,
  when,
} from '../../src/engine/dsl';

const ENDINGS: Story['endings'] = {
  osana: { id: 'osana', heroine: 'osana', title: 'A' },
  tenko: { id: 'tenko', heroine: 'tenko', title: 'B' },
  koharu: { id: 'koharu', heroine: 'koharu', title: 'C' },
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

/** 후반 선택지 하나: 개인 a·b, 해금 시 코하루 k, 미해금 시 함께 c(언제나 3개가 보인다) */
function lateChoice(prefix: string) {
  return choice(`${prefix}.ch`, `${prefix} 선택`, [
    opt('a', `${prefix} 아카네`, { heroine: 'osana', points: 3 }),
    opt('b', `${prefix} 히나`, { heroine: 'tenko', points: 3 }),
    opt('k', `${prefix} {koharu}`, { heroine: 'koharu', points: 3, visibleIf: isFlag('kh.met') }),
    opt('c', `${prefix} 셋이 함께`, { effects: together(), visibleIf: not(isFlag('kh.met')) }),
  ]);
}

export const BRANCH_ORDER = ['c3.ch', 'c4.ch', 'c6.ch', 'c7.ch', 'c8.ch', 'c9.ch', 'c10.ch'];

/**
 * 실제 대본의 분기 구조(CONTRACT 0절)를 같은 장면·선택지 id 로 줄여 옮긴 스토리.
 * 초반 c3/c4/c6 (+2) · c7 (+3) · 함께 (+1/+1) → c7.join 의 종소리 뒤 해금 판정 → (해금 시) 복도 첫 만남 →
 * 노을길 c7.j20~j40 → (해금 시) 토요일 추첨 → 후반 c8/c9/c10 (+3) → 루트 결정 → o1_shop / t1_cats / k1.
 */
export function branchStory(): Story {
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
      unlock('koharu', ['osana', 'tenko'], 1, 'kh.met'),
      when(not(isFlag('kh.met')), 'c7.road'),
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
      when(isFlag('kh.met'), 'c7.raffle'),
      jump('c8_bakery'),
      label('c7.raffle'),
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
      jump('c8_bakery'),
    ]),
    scene({ id: 'c8_bakery', title: '토요일 오후', route: 'common', part: 'main' }, [mono('c8.010', '토요일 오후'), lateChoice('c8'), mono('c8.020', '빵집'), jump('c9_puzzle')]),
    scene({ id: 'c9_puzzle', title: '일요일', route: 'common', part: 'main' }, [mono('c9.010', '일요일'), lateChoice('c9'), jump('c10_window')]),
    scene({ id: 'c10_window', title: '월요일 점심', route: 'common', part: 'main' }, [
      bg('hallway'),
      mono('c10.010', '월요일'),
      lateChoice('c10'),
      mono('c10.020', '방과 후'),
      decideRoute(BRANCH_ORDER, { koharu: 'kh.met' }),
      routeBranch({ osana: 'o1_shop', tenko: 't1_cats', koharu: 'k1' }),
    ]),
    scene({ id: 'o1_shop', title: '아카네 본편', route: 'osana', part: 'main' }, [mono('o1.010', '아카네 루트'), jump('o9_end')]),
    scene({ id: 'o9_end', title: '아카네 후일담', route: 'osana', part: 'epilogue' }, [mono('o9.010', '후일담'), ending('o9.end', 'osana')]),
    scene({ id: 't1_cats', title: '히나 본편', route: 'tenko', part: 'main' }, [mono('t1.010', '히나 루트'), jump('t9_end')]),
    scene({ id: 't9_end', title: '히나 후일담', route: 'tenko', part: 'epilogue' }, [mono('t9.010', '후일담'), ending('t9.end', 'tenko')]),
    scene({ id: 'k1', title: '코하루 본편', route: 'koharu', part: 'main' }, [
      hide('all'),
      show('koharu', { pos: 'center', outfit: 'uniform' }),
      say('k1.010', 'koharu', '선배!', 'smile'),
      jump('k8'),
    ]),
    scene({ id: 'k8', title: '코하루 후일담', route: 'koharu', part: 'epilogue' }, [
      cg('kh_date'),
      mono('k8.010', '일요일은 둘이서'),
      ending('k8.end', 'koharu'),
    ]),
  ];
  return {
    version: 'branch-test',
    start: 'c3_break',
    scenes: Object.fromEntries(scenes.map((s) => [s.id, s])),
    endings: { ...ENDINGS },
  };
}

/** branchStory 검증용 치환 값 */
export const BRANCH_VARS = { koharu: '코하루', koharuFamily: '나루세' } as const;

export const permissiveAssets = {
  hasBg: () => true,
  hasSprite: () => true,
  hasBgm: () => true,
  hasSfx: () => true,
  speakers: ['me', 'osana', 'tenko', 'koharu', 'teacher', 'grandma', 'classmates', 'shopkeeper', 'kh_friend', 'raffle'],
};

/**
 * CONTRACT 0절 규칙을 옵션 id(a=아카네, b=히나, k=코하루, c=함께)와 가중치만으로 손으로 옮긴 계산.
 * 대본의 옵션 정의·실행기·검증기 오라클 어느 것도 쓰지 않는다(세 번째 독립 계산).
 * picks = [c3, c4, c6, c7, c8, c9, c10] 의 옵션 id.
 */
export function contractRoute(picks: readonly string[]): {
  route: 'osana' | 'tenko' | 'koharu';
  met: boolean;
  points: { osana: number; tenko: number; koharu: number };
  tie: boolean;
} {
  const p = { osana: 0, tenko: 0, koharu: 0 };
  const early = [2, 2, 2, 3];
  const who = (id: string) => (id === 'a' ? 'osana' : id === 'b' ? 'tenko' : id === 'k' ? 'koharu' : null);
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
  for (const id of picks.slice(4)) {
    const h = who(id);
    if (h) p[h] += 3;
    else {
      p.osana += 1;
      p.tenko += 1;
    }
  }
  const cands = met ? (['osana', 'tenko', 'koharu'] as const) : (['osana', 'tenko'] as const);
  const top = Math.max(...cands.map((h) => p[h]));
  const tied = cands.filter((h) => p[h] === top);
  let route = tied[0];
  if (tied.length > 1) {
    for (let i = picks.length - 1; i >= 0; i--) {
      const h = who(picks[i]);
      if (h && (tied as readonly string[]).includes(h)) {
        route = h;
        break;
      }
    }
  }
  return { route, met, points: p, tie: tied.length > 1 };
}

/** 초반 a·b·c 와 후반(해금이면 a·b·k, 아니면 a·b·c) 의 모든 7회 선택 조합 */
export function allPicks(): string[][] {
  const out: string[][] = [];
  const rec = (acc: string[]) => {
    if (acc.length === 7) {
      out.push(acc);
      return;
    }
    let opts = ['a', 'b', 'c'];
    if (acc.length >= 4) opts = contractRoute([...acc, ...Array(7 - acc.length).fill('a')]).met ? ['a', 'b', 'k'] : ['a', 'b', 'c'];
    for (const o of opts) rec([...acc, o]);
  };
  rec([]);
  return out;
}
