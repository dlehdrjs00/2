/** 단위 테스트용 작은 합성 스토리 (실제 대본과 무관하게 엔진 규칙만 검증) */
import type { Story } from '../../src/engine/types';
import { bg, bgm, choice, chose, decideRoute, ending, flag, goto, isFlag, jump, label, me, mono, opt, routeBranch, say, scene, show, when } from '../../src/engine/dsl';

export function miniStory(): Story {
  const scenes = [
    scene({ id: 'c1', title: '공통1', route: 'common', part: 'main' }, [
      bg('classroom_day', 'black'),
      show('osana', { pos: 'left' }),
      show('tenko', { pos: 'right' }),
      mono('c1.010', '시작'),
      say('c1.020', 'osana', '웃음', 'smile'),
      choice('c1.ch', '첫 선택', [opt('a', 'A', { heroine: 'osana', goto: 'c1.a' }), opt('b', 'B', { heroine: 'tenko', goto: 'c1.b' })]),
      label('c1.a'),
      say('c1.a10', 'osana', 'a 반응'),
      goto('c1.join'),
      label('c1.b'),
      say('c1.b10', 'tenko', 'b 반응'),
      label('c1.join'),
      me('c1.030', '합류'),
      choice('c1.ch2', undefined, [opt('a', 'A2', { heroine: 'osana' }), opt('b', 'B2', { heroine: 'tenko' })]),
      when(chose('c1.ch2', 'a'), 'c1.x'),
      mono('c1.040', '두 번째 선택 b'),
      label('c1.x'),
      choice('c1.ch3', undefined, [opt('a', 'A3', { heroine: 'osana' }), opt('b', 'B3', { heroine: 'tenko' })]),
      choice('c1.ch4', undefined, [opt('a', 'A4', { heroine: 'osana' }), opt('b', 'B4', { heroine: 'tenko' })]),
      decideRoute(),
      routeBranch({ osana: 'o1', tenko: 't1' }),
    ]),
    scene({ id: 'o1', title: '소꿉 본편', route: 'osana', part: 'main' }, [
      mono('o1.010', '소꿉 루트'),
      choice('o1.ch', undefined, [opt('a', '루트 안 선택', { heroine: 'tenko' }), opt('b', '다른 선택')]),
      jump('o2'),
    ]),
    scene({ id: 'o2', title: '소꿉 후일담', route: 'osana', part: 'epilogue' }, [mono('o2.010', '후일담'), ending('o2.end', 'osana')]),
    scene({ id: 't1', title: '전학 본편', route: 'tenko', part: 'main' }, [mono('t1.010', '전학 루트'), jump('t2')]),
    scene({ id: 't2', title: '전학 후일담', route: 'tenko', part: 'epilogue' }, [mono('t2.010', '후일담'), ending('t2.end', 'tenko')]),
  ];
  return {
    version: 'test',
    start: 'c1',
    scenes: Object.fromEntries(scenes.map((s) => [s.id, s])),
    endings: {
      osana: { id: 'osana', heroine: 'osana', title: 'A' },
      tenko: { id: 'tenko', heroine: 'tenko', title: 'B' },
    },
  };
}

/**
 * '장면 처음부터' 복구 검증용 합성 스토리.
 * r2 는 실제 대본의 c3_break 처럼 bg·bgm 지시 없이 r1 의 무대(교실·daily·소꿉친구)를 물려받고,
 * 장면 안에서 점수·플래그를 바꾸는 선택 뒤에 루트를 정한다.
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
      decideRoute(),
      routeBranch({ osana: 'ro', tenko: 'rt' }),
    ]),
    scene({ id: 'ro', title: '소꿉 루트', route: 'osana', part: 'main' }, [mono('ro.010', '소꿉 루트'), ending('ro.end', 'osana')]),
    scene({ id: 'rt', title: '전학 루트', route: 'tenko', part: 'main' }, [mono('rt.010', '전학 루트'), ending('rt.end', 'tenko')]),
  ];
  return {
    version: 'test',
    start: 'r1',
    scenes: Object.fromEntries(scenes.map((s) => [s.id, s])),
    endings: {
      osana: { id: 'osana', heroine: 'osana', title: 'A' },
      tenko: { id: 'tenko', heroine: 'tenko', title: 'B' },
    },
  };
}

export const permissiveAssets = {
  hasBg: () => true,
  hasSprite: () => true,
  hasBgm: () => true,
  hasSfx: () => true,
  speakers: ['me', 'osana', 'tenko', 'teacher', 'grandma', 'classmates', 'shopkeeper'],
};
