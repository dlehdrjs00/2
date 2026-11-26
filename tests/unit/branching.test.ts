/**
 * 분기 규칙(설계 계약 5절): pickRoute·히든 루트 판정(judgeRoute·isGroupTie·routeFor), 해금 판정(1회·평균·0.5 보존),
 * 보이는 옵션, 검증기 전수 분포(39,474 경로·히든 1,710·구저장 시드 675)·독립 계산 대조·흔적·루트 전용 그림·정적 검사.
 * 실제 대본 대신 같은 장면·선택지 id 로 구조만 옮긴 branchStory 를 쓴다(실제 대본 검사는 story.test.ts).
 */
import { describe, expect, it } from 'vitest';
import {
  advance,
  applyUnlock,
  choose,
  isGroupTie,
  judgeRoute,
  LEGACY_LATE_FLAG,
  newGameState,
  pickRoute,
  routeFor,
  settle,
  StoryError,
  visibleOptions,
  type StepResult,
} from '../../src/engine/runner';
import { EXPECTED_BRANCHING, expectedRouteFromChoices, validateStory } from '../../src/engine/validate';
import type { ChoiceStep, DecideRouteStep, GameState, Story, UnlockStep } from '../../src/engine/types';
import {
  allPicks,
  BRANCH_ORDER,
  BRANCH_ORDER6,
  BRANCH_VARS,
  branchStory,
  contractRoute,
  contractRouteOld,
  FORK_CHOICES,
  miniStory,
  permissiveAssets,
} from './fixtures';

/** picks 를 순서대로 고르며 진행(결말 갈래 등 picks 가 모자라면 첫 옵션). stopAt(블로킹 step id)에 닿으면 멈춘다 */
function play(story: Story, picks: readonly string[], stopAt?: string) {
  const state = newGameState(story);
  let r: StepResult = settle(story, state);
  let i = 0;
  const seen: string[] = [];
  while (r.step.t !== 'ending' && r.step.id !== stopAt) {
    seen.push(r.step.id);
    if (r.step.t === 'choice') {
      const pick = picks[i++] ?? r.step.options[0].id;
      const next = choose(story, state, pick);
      if (!next) throw new Error(`${r.step.id} 에서 ${pick} 을(를) 고를 수 없음`);
      r = next;
    } else r = advance(story, state)!;
  }
  return { state, r, seen };
}

/** 후반 h(히나)를 옵션 id b 로 바꾼 표기: 'ahk' → ['a','b','k'] */
const late = (s: string) => [...s].map((c) => (c === 'h' ? 'b' : c));

const UNLOCK: UnlockStep = { t: 'unlock', id: 'u', heroine: 'koharu', among: ['osana', 'tenko'], maxDiff: 1, flag: 'kh.met' };
const ALL = ['osana', 'tenko', 'koharu'] as const;

function stateWith(points: GameState['points'], flags: GameState['flags'] = {}): GameState {
  return { ...newGameState(branchStory()), points: { ...points }, flags: { ...flags } };
}

describe('pickRoute', () => {
  it('최고점이 하나면 기록과 상관없이 그 히로인', () => {
    expect(pickRoute({ osana: 9, tenko: 8, koharu: 8.5 }, ALL, ['tenko', 'koharu'])).toBe('osana');
    expect(pickRoute({ osana: 7, tenko: 7, koharu: 7.5 }, ALL, ['osana'])).toBe('koharu');
  });
  it('0.5 점 차이도 그대로 비교한다', () => {
    expect(pickRoute({ osana: 7, tenko: 6.5, koharu: 6.5 }, ALL, ['koharu'])).toBe('osana');
    expect(pickRoute({ osana: 6.5, tenko: 7, koharu: 6.5 }, ALL, ['koharu'])).toBe('tenko');
  });
  it('7/7/7 동점이면 뒤에서부터 처음 만나는 개인 선택(옛 규칙: 후반 a·b·k → 코하루)', () => {
    expect(pickRoute({ osana: 7, tenko: 7, koharu: 7 }, ALL, [null, null, null, null, 'osana', 'tenko', 'koharu'])).toBe('koharu');
    expect(pickRoute({ osana: 7, tenko: 7, koharu: 7 }, ALL, [null, null, null, null, 'koharu', 'osana', 'tenko'])).toBe('tenko');
  });
  it('공동 최고점이 아닌 히로인과 함께(null)는 건너뛴다', () => {
    expect(pickRoute({ osana: 8, tenko: 8, koharu: 5 }, ALL, ['osana', null, 'tenko', 'koharu', null])).toBe('tenko');
    expect(pickRoute({ osana: 8, tenko: 8, koharu: 5 }, ALL, ['tenko', 'osana', null, null])).toBe('osana');
  });
  it('후보가 아닌 히로인은 점수가 높아도 무시한다(미해금)', () => {
    expect(pickRoute({ osana: 8, tenko: 8, koharu: 99 }, ['osana', 'tenko'], ['tenko', 'koharu'])).toBe('tenko');
  });
  it('기록으로 정할 수 없으면 후보 순서의 첫 공동 최고점', () => {
    expect(pickRoute({ osana: 4, tenko: 4, koharu: 4 }, ALL, [null, null])).toBe('osana');
    expect(pickRoute({ osana: 3, tenko: 4, koharu: 4 }, ALL, [])).toBe('tenko');
  });
});

describe('히든 루트 판정(judgeRoute·isGroupTie·routeFor)', () => {
  const g = { tieRoute: 'group' as const };
  it('후보가 세 명 전원이고 세 점수가 완전히 같으면 group, 기록과 상관없다', () => {
    expect(judgeRoute({ osana: 5, tenko: 5, koharu: 5 }, ALL, ['osana', 'tenko', 'koharu'], g)).toBe('group');
    expect(judgeRoute({ osana: 5.5, tenko: 5.5, koharu: 5.5 }, ALL, [], g)).toBe('group');
    expect(isGroupTie({ osana: 5, tenko: 5, koharu: 5 }, ALL, g)).toBe(true);
  });
  it('tieRoute 가 없으면(옛 판정) 세 명 동점도 기록으로 정한다', () => {
    expect(judgeRoute({ osana: 7, tenko: 7, koharu: 7 }, ALL, ['osana', 'tenko', 'koharu'])).toBe('koharu');
    expect(isGroupTie({ osana: 7, tenko: 7, koharu: 7 }, ALL, {})).toBe(false);
  });
  it('구저장 표식(legacyLate)이 있으면 tieRoute 를 쓰지 않는다', () => {
    expect(judgeRoute({ osana: 7, tenko: 7, koharu: 7 }, ALL, ['osana', 'tenko', 'koharu'], { ...g, legacyLate: true })).toBe('koharu');
    expect(isGroupTie({ osana: 7, tenko: 7, koharu: 7 }, ALL, { ...g, legacyLate: true })).toBe(false);
  });
  it('후보가 두 명(미발견)이면 두 점수가 같아도 group 이 아니다', () => {
    expect(judgeRoute({ osana: 8, tenko: 8, koharu: 8 }, ['osana', 'tenko'], ['tenko'], g)).toBe('tenko');
    expect(isGroupTie({ osana: 8, tenko: 8, koharu: 8 }, ['osana', 'tenko'], g)).toBe(false);
  });
  it('두 사람만 공동 최고점이면 최근 선택, 단독 최고점이면 그 사람', () => {
    expect(judgeRoute({ osana: 5.5, tenko: 5.5, koharu: 4 }, ALL, ['osana', 'tenko', 'osana', 'tenko'], g)).toBe('tenko');
    expect(judgeRoute({ osana: 7, tenko: 4, koharu: 4 }, ALL, ['osana'], g)).toBe('osana');
    expect(judgeRoute({ osana: 4.5, tenko: 4.5, koharu: 4 }, ALL, ['koharu'], g)).toBe('osana');
  });

  it('routeFor 는 decideRoute 스텝의 tieRoute·hidden 과 상태의 kh.met·kh.late3 을 그대로 쓴다', () => {
    const story = branchStory();
    const find = (id: string) => Object.values(story.scenes).flatMap((s) => s.steps).find((s) => s.t === 'decideRoute' && s.id.startsWith(id)) as DecideRouteStep;
    const neu = Object.values(story.scenes.e3_rain4.steps).find((s) => s.t === 'decideRoute') as DecideRouteStep;
    const old = Object.values(story.scenes.c10_window.steps).find((s) => s.t === 'decideRoute') as DecideRouteStep;
    expect(neu.tieRoute).toBe('group');
    expect(old.tieRoute).toBeUndefined();
    expect(find('e3_rain4')).toBe(neu);
    const st = stateWith({ osana: 5, tenko: 5, koharu: 5 }, { 'kh.met': true });
    expect(routeFor(story, st, neu)).toBe('group');
    expect(routeFor(story, { ...st, flags: { 'kh.met': true, [LEGACY_LATE_FLAG]: true } }, neu)).toBe('osana');
    expect(routeFor(story, st, old)).toBe('osana');
    // 미해금: 코하루는 후보가 아니다
    expect(routeFor(story, { ...st, flags: { 'kh.met': false } }, neu)).toBe('osana');
  });

  it('routeBranch 에 그 루트의 장면이 없으면 명확한 StoryError', () => {
    const story = branchStory();
    const br = story.scenes.e3_rain4.steps.find((s) => s.t === 'routeBranch');
    if (br?.t !== 'routeBranch') throw new Error('no routeBranch');
    delete br.scenes.group;
    expect(() => play(story, ['c', 'c', 'c', 'c', ...late('ahkahk')])).toThrow(StoryError);
    expect(() => play(story, ['c', 'c', 'c', 'c', ...late('ahkahk')])).toThrow(/routeBranch\(.+\) 에 'group' 루트로 갈 장면이 없습니다/);
  });
});

describe('설계 계약 5.1 재현 기준(실행기)', () => {
  it.each([
    ['cccc', 'ahkahk', { osana: 5, tenko: 5, koharu: 5 }, 'group'],
    ['abba', 'hkhakh', { osana: 5.5, tenko: 5.5, koharu: 5.5 }, 'group'],
    ['baab', 'akahka', { osana: 5.5, tenko: 5.5, koharu: 5.5 }, 'group'],
    ['cccc', 'ahahah', { osana: 5.5, tenko: 5.5, koharu: 4 }, 'tenko'],
    ['cccc', 'aaaaaa', { osana: 7, tenko: 4, koharu: 4 }, 'osana'],
  ] as const)('초반 %s + 후반 %s → %j → %s', (early, six, points, route) => {
    const story = branchStory();
    const { state, r } = play(story, [...early, ...late(six)]);
    expect(state.flags['kh.met']).toBe(true);
    expect(state.points).toEqual(points);
    expect(state.route).toBe(route);
    expect(r.step.t).toBe('ending');
  });

  it('초반 시작 점수: 함께×4 → 4/4/4, a·h·h·a → 5/4/4.5, b·a·a·b → 4/5/4.5', () => {
    const story = branchStory();
    expect(play(story, [...'cccc'], 'e1f.ch1').state.points).toEqual({ osana: 4, tenko: 4, koharu: 4 });
    expect(play(story, [...'abba'], 'e1f.ch1').state.points).toEqual({ osana: 5, tenko: 4, koharu: 4.5 });
    expect(play(story, [...'baab'], 'e1f.ch1').state.points).toEqual({ osana: 4, tenko: 5, koharu: 4.5 });
  });

  it('발견 경로 장면 순서: 복도 첫 만남 → 노을길 → 추첨 → 빙수집 넷 → 일요일 → 종이개구리 넷 → 처마 넷 → 루트', () => {
    const story = branchStory();
    const { seen, state } = play(story, [...'cccc', ...late('ahkahk')]);
    const at = (id: string) => seen.indexOf(id);
    const order = ['c7.k10', 'c7.j20', 'c8r.010', 'e1f.010', 'e1f.ch1', 'e1f.ch2', 'e1s.010', 'e2f.ch1', 'e2f.ch2', 'e3f.ch1', 'e3f.ch2', 'e3f.j10', 'h1.010', 'h.fork'];
    for (let i = 1; i < order.length; i++) expect(at(order[i - 1]), order[i]).toBeLessThan(at(order[i]));
    expect(seen).not.toContain('c8.ch');
    expect(state.flags['ep3.done']).toBe(true);
  });

  it('미발견 경로: 노을길 → 빙수집 셋 → c8 → c9 → 종이개구리 셋 → c10 → 처마 셋 → 옛 판정(+3·함께)', () => {
    const story = branchStory();
    const { state, seen } = play(story, [...'aaab', 'b', 'c', 'c']);
    expect(state.flags['kh.met']).toBe(false);
    expect(state.points).toEqual({ osana: 8, tenko: 8, koharu: 0 });
    expect(state.route).toBe('tenko');
    const order = ['c7.j40', 'e1t.010', 'c8.ch', 'c9.ch', 'e2t.010', 'c10.ch', 'c10.j10', 'e3t.010', 't1.010'];
    for (let i = 1; i < order.length; i++) expect(seen.indexOf(order[i - 1]), order[i]).toBeLessThan(seen.indexOf(order[i]));
    for (const id of ['c7.k10', 'c8r.010', 'e1f.ch1', 'c10.040']) expect(seen).not.toContain(id);
  });
});

describe('경계 사례(실행기)', () => {
  it('점수 차 때문에 두 번씩 골라도 동점이 안 되는 출발: a·h·h·a(5/4/4.5) + a a h h k k → 6/5/5.5 아카네', () => {
    const { state } = play(branchStory(), [...'abba', ...late('aahhkk')]);
    expect(state.points).toEqual({ osana: 6, tenko: 5, koharu: 5.5 });
    expect(state.route).toBe('osana');
  });

  it('다섯째 뒤에만 공동 최고점이고 여섯째로 깨진다: 4/4/4 + a h k a h → 5/5/4.5 → 여섯째 a → 5.5/5/4.5 아카네', () => {
    const story = branchStory();
    const five = play(story, [...'cccc', ...late('ahkah')], 'e3f.ch2').state;
    expect(five.points).toEqual({ osana: 5, tenko: 5, koharu: 4.5 });
    const { state } = play(story, [...'cccc', ...late('ahkaha')]);
    expect(state.points).toEqual({ osana: 5.5, tenko: 5, koharu: 4.5 });
    expect(state.route).toBe('osana');
  });

  it('셋째 뒤 세 명 동점(4.5/4.5/4.5)이어도 판정은 여섯째 뒤 한 번: + a a a → 6/4.5/4.5 아카네', () => {
    const story = branchStory();
    expect(play(story, [...'cccc', ...late('ahk')], 'e2f.ch2').state.points).toEqual({ osana: 4.5, tenko: 4.5, koharu: 4.5 });
    const { state } = play(story, [...'cccc', ...late('ahkaaa')]);
    expect(state.route).toBe('osana');
  });

  it('마지막 선택자가 공동 최고점이 아니면 건너뛴다: a·h·h·a + a a k k k h → 6/4.5/6 → 코하루', () => {
    const { state } = play(branchStory(), [...'abba', ...late('aakkkh')]);
    expect(state.points).toEqual({ osana: 6, tenko: 4.5, koharu: 6 });
    expect(state.route).toBe('koharu');
  });

  it('코하루 단독: 4/4/4 + k×6 → 4/4/7, 5/4/4.5 + k×6 → 5/4/7.5', () => {
    expect(play(branchStory(), [...'cccc', ...late('kkkkkk')]).state).toMatchObject({ route: 'koharu', points: { osana: 4, tenko: 4, koharu: 7 } });
    expect(play(branchStory(), [...'abba', ...late('kkkkkk')]).state).toMatchObject({ route: 'koharu', points: { osana: 5, tenko: 4, koharu: 7.5 } });
  });

  it('손 계산(contractRoute)·독립 오라클(실행된 decideRoute 기준)이 같은 답을 낸다', () => {
    const story = branchStory();
    const asRecord = (picks: string[], order: string[]) =>
      picks.map((option, i) => {
        const step = Object.values(story.scenes)
          .flatMap((s) => s.steps)
          .find((s) => s.id === order[i]) as ChoiceStep;
        const heroine = step.options.find((o) => o.id === option)?.heroine;
        return heroine ? { choice: order[i], option, heroine } : { choice: order[i], option };
      });
    for (const [picks, route] of [
      [[...'cccc', ...late('ahkahk')], 'group'],
      [[...'abba', ...late('hkhakh')], 'group'],
      [[...'cccc', ...late('ahahah')], 'tenko'],
      [[...'abba', ...late('aakkkh')], 'koharu'],
      [[...'aaab', 'b', 'c', 'c'], 'tenko'],
    ] as const) {
      expect(contractRoute(picks).route).toBe(route);
      const order = picks.length === 10 ? BRANCH_ORDER6 : BRANCH_ORDER;
      // decide 를 주지 않으면 고른 선택을 가장 많이 담은 decideRoute 를 쓴다
      expect(expectedRouteFromChoices(asRecord([...picks], order), story)).toBe(route);
      const decide = picks.length === 10 ? 'e3_rain4' : 'e3_rain3';
      const id = story.scenes[decide].steps.find((s) => s.t === 'decideRoute')!.id;
      expect(expectedRouteFromChoices(asRecord([...picks], order), story, { decide: id })).toBe(route);
    }
    // 옛 규칙(구저장): 함께×4 + c8 a·c9 b·c10 k → 7/7/7 → 코하루(히든 아님)
    const oldPicks = [...'cccc', 'a', 'b', 'k'];
    expect(contractRouteOld(oldPicks)).toMatchObject({ route: 'koharu', points: { osana: 7, tenko: 7, koharu: 7 }, tie: true });
    const oldId = story.scenes.c10_window.steps.find((s) => s.t === 'decideRoute')!.id;
    expect(expectedRouteFromChoices(asRecord(oldPicks, BRANCH_ORDER), story, { decide: oldId })).toBe('koharu');
    // 새 판정이라도 구저장 표식이 있으면 히든이 아니다
    expect(expectedRouteFromChoices(asRecord([...'cccc', ...late('ahkahk')], BRANCH_ORDER6), story, { legacyLate: true })).toBe('koharu');
  });
});

describe('해금 판정(unlock)', () => {
  it('점수 차 1 이하면 해금하고 평균을 0.5 단위 그대로 준다. 차 2 면 미해금', () => {
    const a = stateWith({ osana: 5, tenko: 4, koharu: 0 });
    applyUnlock(a, UNLOCK);
    expect(a.flags['kh.met']).toBe(true);
    expect(a.points.koharu).toBe(4.5);
    const b = stateWith({ osana: 4, tenko: 4, koharu: 0 });
    applyUnlock(b, UNLOCK);
    expect(b.points.koharu).toBe(4);
    const c = stateWith({ osana: 6, tenko: 4, koharu: 0 });
    applyUnlock(c, UNLOCK);
    expect(c.flags['kh.met']).toBe(false);
    expect(c.points.koharu).toBe(0);
  });

  it('한 번 정해지면(true/false) 다시 판정하지 않는다', () => {
    const locked = stateWith({ osana: 4, tenko: 4, koharu: 0 }, { 'kh.met': false });
    applyUnlock(locked, UNLOCK);
    expect(locked.flags['kh.met']).toBe(false);
    expect(locked.points.koharu).toBe(0);
    const met = stateWith({ osana: 9, tenko: 8, koharu: 4.5 }, { 'kh.met': true });
    applyUnlock(met, UNLOCK);
    expect(met.points.koharu).toBe(4.5);
  });

  it('루트가 이미 정해졌으면 해금하지 않는다', () => {
    const st = { ...stateWith({ osana: 4, tenko: 4, koharu: 0 }), route: 'osana' as const };
    applyUnlock(st, UNLOCK);
    expect(st.flags['kh.met']).toBe(false);
    expect(st.points.koharu).toBe(0);
  });

  it('같은 판정 지시를 다시 실행해도(같은 장면 되감기) 점수·플래그가 한 번만 반영된다', () => {
    const story = branchStory();
    const { state } = play(story, ['a', 'b', 'b', 'a'], 'c7.k10');
    const before = structuredClone({ points: state.points, flags: state.flags });
    state.stepId = 'c7.join';
    const r = settle(story, state);
    expect(r.step.id).toBe('c7.k10');
    expect({ points: state.points, flags: state.flags }).toEqual(before);
  });
});

describe('보이는 옵션', () => {
  it('미해금이면 옛 후반 선택지에 a·b·함께만 보이고, 숨은 k 는 choose 가 무시한다(+3·함께 그대로)', () => {
    const story = branchStory();
    const { state, r } = play(story, ['a', 'a', 'a', 'b'], 'c8.ch');
    if (r.step.t !== 'choice') throw new Error(r.step.t);
    expect(visibleOptions(state, r.step).map((o) => o.id)).toEqual(['a', 'b', 'c']);
    const before = structuredClone(state);
    expect(choose(story, state, 'k')).toBeNull();
    expect(state).toEqual(before);
    expect(choose(story, state, 'c')?.step.id).toBe('c8.020');
    expect(state.points).toEqual({ osana: 7, tenko: 4, koharu: 0 });
  });

  it('발견이면 에피소드 선택지에 a·b·k 가 보이고 고른 한 사람에게만 +0.5(함께 없음)', () => {
    const story = branchStory();
    const { state, r } = play(story, ['c', 'c', 'c', 'c'], 'e1f.ch1');
    if (r.step.t !== 'choice') throw new Error(r.step.t);
    expect(visibleOptions(state, r.step).map((o) => o.id)).toEqual(['a', 'b', 'k']);
    expect(choose(story, state, 'c')).toBeNull();
    choose(story, state, 'k');
    expect(state.points).toEqual({ osana: 4, tenko: 4, koharu: 4.5 });
    expect(state.lastHeroine).toBe('koharu');
  });

  it('함께는 두 사람에게 1점씩이고 최근 히로인을 바꾸지 않는다', () => {
    const story = branchStory();
    const { state } = play(story, ['a', 'c'], 'c6.ch');
    expect(state.points).toEqual({ osana: 3, tenko: 1, koharu: 0 });
    expect(state.lastHeroine).toBe('osana');
  });

  it('결말 갈래 선택은 점수·루트를 바꾸지 않고, 고르지 않은 기록(옛 저장)은 축제 쪽으로 간다', () => {
    const story = branchStory();
    const { state } = play(story, [...'cccc', ...late('ahkahk')], 'h.fork');
    const before = structuredClone({ points: state.points, route: state.route });
    const d = JSON.parse(JSON.stringify(state)) as GameState;
    choose(story, d, 'd');
    expect({ points: d.points, route: d.route }).toEqual(before);
    let r = settle(story, d);
    while (r.step.t !== 'ending') r = advance(story, d)!;
    expect(r.step.ending).toBe('group_daily');
    // 갈래 선택지 뒤에서 시작한 저장(선택 기록 없음) = 축제 쪽 기본 흐름
    const f = JSON.parse(JSON.stringify(state)) as GameState;
    const fork = story.scenes.h1.steps.findIndex((s) => s.id === 'h.fork');
    f.stepId = story.scenes.h1.steps[fork + 1].id;
    let rf = settle(story, f);
    while (rf.step.t !== 'ending') rf = advance(story, f)!;
    expect(rf.step.ending).toBe('group_festival');
  });

  it('작은 합성 스토리도 미해금 마지막 선택지에는 a·b 만 보인다', () => {
    const story = miniStory();
    const { state, r } = play(story, ['a', 'a', 'a'], 'c1.ch4');
    if (r.step.t !== 'choice') throw new Error(r.step.t);
    expect(visibleOptions(state, r.step).map((o) => o.id)).toEqual(['a', 'b']);
  });
});

describe('검증기: 보이는 옵션 전수 시뮬레이션', () => {
  const report = validateStory(branchStory(), permissiveAssets, BRANCH_VARS, { expect: EXPECTED_BRANCHING });

  it('39,474 경로·판정 19,737·히든 1,710·두 사람 동점 1,874(1,770/104)·구저장 시드 675(243/243/189, 세 명 동점 42 · 히든 0)', () => {
    expect(report.errors).toEqual([]);
    expect(report.branching).toEqual({
      paths: 39474,
      earlyCombos: 81,
      unlockedEarlyCombos: 25,
      endings: {
        osana: 6567,
        osana_daily: 6567,
        tenko: 6567,
        tenko_daily: 6567,
        koharu: 4893,
        koharu_daily: 4893,
        group_festival: 1710,
        group_daily: 1710,
      },
      decisions: 19737,
      unlockedDecisions: 18225,
      lockedDecisions: 1512,
      routes: { osana: 6567, tenko: 6567, koharu: 4893, group: 1710 },
      hidden: 1710,
      ties: 1874,
      tiesUnlocked: 1770,
      tiesLocked: 104,
      allTied: 1710,
      unlockedPaths: 36450,
      lockedPaths: 3024,
      earlyCombosReachingAll: 81,
      decisionsReachingRouteEndings: 19737,
      legacy: { paths: 1350, decisions: 675, routes: { osana: 243, tenko: 243, koharu: 189 }, hidden: 0, ties: 42, allTied: 42 },
    });
  });

  it('루트 확정 뒤 메모를 꺼도 경로·분포·오류가 같다', () => {
    const plain = validateStory(branchStory(), permissiveAssets, BRANCH_VARS, { expect: EXPECTED_BRANCHING, memo: false });
    expect(plain.stats.suffixRuns).toBe(0);
    expect(report.stats.suffixRuns).toBeGreaterThan(0);
    expect(report.stats.suffixRuns).toBeLessThan(100);
    expect(plain.errors).toEqual(report.errors);
    expect(plain.branching).toEqual(report.branching);
    const key = (p: (typeof report.paths)[number]) => p.choices.map((c) => `${c.choice}=${c.option}`).join(',');
    const sort = (ps: typeof report.paths) => [...ps].sort((a, b) => (key(a) < key(b) ? -1 : 1));
    expect(sort(plain.paths)).toEqual(sort(report.paths));
    expect(sort(plain.legacyPaths)).toEqual(sort(report.legacyPaths));
  });

  it('모든 경로가 손 계산(contractRoute)과 루트·해금·점수·동점·히든 여부까지 같고, 판정마다 두 결말에 닿는다', () => {
    const want = new Map(allPicks().map((p) => [p.join(''), contractRoute(p)]));
    expect(want.size).toBe(19737);
    const forks = new Map<string, Set<string>>();
    for (const p of report.paths) {
      const picks = p.choices.filter((c) => !FORK_CHOICES.includes(c.choice));
      const key = picks.map((c) => c.option).join('');
      const w = want.get(key);
      expect(w, key).toBeDefined();
      expect({ route: p.route, expected: p.expectedRoute, met: p.met, points: p.points, tie: p.tie, hidden: p.hidden }, key).toEqual({
        route: w!.route,
        expected: w!.route,
        met: w!.met,
        points: w!.points,
        tie: w!.tie,
        hidden: w!.hidden,
      });
      expect(p.gateAt).toBe(4);
      expect(p.decisionAt).toBe(picks.length);
      expect(p.choices.length - picks.length).toBe(1);
      if (!forks.has(key)) forks.set(key, new Set());
      forks.get(key)!.add(p.endingKind!);
    }
    expect(forks.size).toBe(19737);
    for (const [key, kinds] of forks) expect([...kinds].sort(), key).toEqual(['daily', 'festival']);
  });

  it('발견 초반 조합마다 히든 90(동점 출발) 또는 60(1점 차 출발)', () => {
    const per = new Map<string, number>();
    for (const p of report.paths) {
      if (!p.met || p.endingKind !== 'festival') continue;
      const k = p.choices.slice(0, 4).map((c) => c.option).join('');
      per.set(k, (per.get(k) ?? 0) + (p.hidden ? 1 : 0));
    }
    expect(per.size).toBe(25);
    const byStart = { tie: [] as number[], one: [] as number[] };
    for (const [k, n] of per) {
      const pts = contractRoute([...k, ...'aaaaaa']).points;
      // 시작 점수: 초반 점수 그대로(후반 a×6 = +3 을 뺀다)
      (pts.osana - 3 === pts.tenko ? byStart.tie : byStart.one).push(n);
    }
    expect(byStart.tie).toEqual(Array(7).fill(90));
    expect(byStart.one).toEqual(Array(18).fill(60));
  });

  it('두 사람 동점 1,770 중 마지막 선택자가 공동 최고점에 없는 경우 180', () => {
    let lastNotTop = 0;
    for (const p of report.paths) {
      if (!p.met || !p.tie || p.endingKind !== 'festival') continue;
      const last = p.choices[p.decisionAt! - 1].heroine!;
      const top = Math.max(...Object.values(p.points!));
      if (p.points![last] !== top) lastNotTop++;
    }
    expect(lastNotTop).toBe(180);
  });

  it('구저장 시드: 옛 k 분기(+3)와 옛 판정이 실행되고, 손 계산(옛 규칙)과 같으며 히든이 없다', () => {
    const want = new Map<string, ReturnType<typeof contractRouteOld>>();
    for (const p of allPicks()) {
      if (p.length !== 10) continue;
      for (const a of 'abk') for (const b of 'abk') for (const c of 'abk') want.set([...p.slice(0, 4), a, b, c].join(''), contractRouteOld([...p.slice(0, 4), a, b, c]));
    }
    expect(want.size).toBe(675);
    const decides = new Set(report.legacyPaths.map((p) => p.decideStep));
    expect([...decides]).toEqual([branchStory().scenes.c10_window.steps.find((s) => s.t === 'decideRoute')!.id]);
    for (const p of report.legacyPaths) {
      const picks = p.choices.filter((c) => !FORK_CHOICES.includes(c.choice));
      expect(picks.map((c) => c.choice)).toEqual(BRANCH_ORDER);
      const key = picks.map((c) => c.option).join('');
      const w = want.get(key)!;
      expect(w, key).toBeDefined();
      expect({ route: p.route, points: p.points, tie: p.tie, hidden: p.hidden }, key).toEqual({ route: w.route, points: w.points, tie: w.tie, hidden: false });
    }
    // 세 명 동점(7/7/7 등) 42건은 히든이 아니라 옛 규칙의 최근 선택으로
    const allTied = report.legacyPaths.filter((p) => p.topCount === 3 && p.endingKind === 'festival');
    expect(allTied).toHaveLength(42);
    expect(allTied.every((p) => p.route !== 'group')).toBe(true);
  });

  it('기대 분포와 다르면 오류로 알린다', () => {
    const rep = validateStory(branchStory(), permissiveAssets, BRANCH_VARS, {
      expect: { ...EXPECTED_BRANCHING, endings: { ...EXPECTED_BRANCHING.endings, osana: 6568 }, hidden: 1711, legacy: { ...EXPECTED_BRANCHING.legacy, hidden: 1 } },
    });
    const all = rep.errors.join('\n');
    expect(all).toMatch(/분기 분포 불일치: osana 엔딩 수 기대 6568, 실제 6567/);
    expect(all).toMatch(/히든 루트 판정 수 기대 1711, 실제 1710/);
    expect(all).toMatch(/구저장 시드 히든 루트 수 기대 1, 실제 0/);
  });

  it('k 옵션이 미해금에도 보이면 흔적·보이는 개수·분포 오류', () => {
    const s = branchStory();
    const ch = s.scenes.c8_bakery.steps.find((x) => x.id === 'c8.ch') as ChoiceStep;
    delete ch.options.find((o) => o.id === 'k')!.visibleIf;
    const rep = validateStory(s, permissiveAssets, BRANCH_VARS, { expect: EXPECTED_BRANCHING });
    const all = rep.errors.join('\n');
    expect(all).toMatch(/c8\.ch: 보이는 선택지가 4개/);
    // 미해금 초반 56조합 × c8 에서 보이는 4개 × c9·c10 3×3 × 결말 갈래 2 = 4,032 경로 모두에서 k 가 보인다
    expect(all).toMatch(/해금 전 히든 히로인 흔적이 실행됨: koharu · c8\.ch: 보이는 개인 선택지 k \(4032개 경로/);
    expect(all).toMatch(/분기 분포 불일치: 경로 수 기대 39474/);
  });

  it.each([
    ['show koharu', (s: Story) => s.scenes.c3_break.steps.splice(4, 0, { t: 'show', id: 'x.show', char: 'koharu' }), /show koharu/],
    ['화자', (s: Story) => s.scenes.c4_town.steps.splice(0, 0, { t: 'say', id: 'x.say', who: 'kh_friend', text: '안녕' }), /화자 kh_friend/],
    ['이름 치환 키', (s: Story) => s.scenes.c6_rain.steps.splice(0, 0, { t: 'say', id: 'x.name', who: null, text: '{koharuFamily:는} 누구?' }), /대사에 이름/],
    ['이름표', (s: Story) => s.scenes.c6_rain.steps.splice(0, 0, { t: 'say', id: 'x.label', who: 'tenko', label: '{koharu}', text: '...' }), /이름표에 이름/],
    ['kh_ CG', (s: Story) => s.scenes.c8_bakery.steps.splice(0, 0, { t: 'cg', id: 'x.cg', cg: 'kh_draw' }), /CG kh_draw/],
    ['kh_ 배경', (s: Story) => s.scenes.c9_puzzle.steps.splice(0, 0, { t: 'bg', id: 'x.bg', bg: 'kh_stationery' }), /배경 kh_stationery/],
    ['넷 그림(group_ice_four)', (s: Story) => s.scenes.e1_ice3.steps.splice(1, 0, { t: 'cg', id: 'x.cg4', cg: 'group_ice_four' }), /CG group_ice_four/],
    ['코하루 일상 그림(end_koharu_coin)', (s: Story) => s.scenes.e2_frog3.steps.splice(1, 0, { t: 'cg', id: 'x.coin', cg: 'end_koharu_coin' }), /CG end_koharu_coin/],
    ['개구리 그림(group_frog)', (s: Story) => s.scenes.od1.steps.splice(0, 0, { t: 'cg', id: 'x.frog', cg: 'group_frog' }), /CG group_frog/],
  ])('해금 전에 실행되는 코하루 흔적(%s)을 잡는다', (_name, mutate, pattern) => {
    const s = branchStory();
    mutate(s);
    const rep = validateStory(s, permissiveAssets, BRANCH_VARS);
    const traces = rep.errors.filter((e) => e.startsWith('해금 전 히든 히로인 흔적'));
    expect(traces.join('\n')).toMatch(pattern);
  });

  it('히든 루트 장면(route group)에 미해금으로 들어가면 흔적이다', () => {
    const s = branchStory();
    // 미발견 경로의 종이개구리 셋이 히든 루트 장면으로 잘못 이어진 대본
    const steps = s.scenes.e2_frog3.steps;
    steps[steps.length - 1] = { t: 'jump', id: steps[steps.length - 1].id, scene: 'h1' };
    const rep = validateStory(s, permissiveAssets, BRANCH_VARS);
    expect(rep.errors.join('\n')).toMatch(/koharu · 장면 h1\(route group\) 진입/);
  });

  it('end_group_* 는 route = group 경로에서만: 다른 루트에서 실행되면 루트 전용 그림 오류', () => {
    const s = branchStory();
    s.scenes.k8.steps.splice(0, 0, { t: 'cg', id: 'x.fw', cg: 'end_group_fireworks' });
    const rep = validateStory(s, permissiveAssets, BRANCH_VARS);
    // 코하루 축제 쪽 4,893 경로 + 구저장 시드 코하루 축제 쪽 189 경로
    expect(rep.errors.join('\n')).toMatch(/루트 전용 그림이 그 루트 밖에서 실행됨: x\.fw: CG end_group_fireworks 는 group 루트 전용인데 루트 koharu 에서 실행 \(5082개 경로/);
    // 히든 루트 안의 같은 그림은 문제없다
    expect(report.errors.filter((e) => e.includes('루트 전용'))).toEqual([]);
  });

  it('해금된 플레이의 코하루 장면(복도·추첨·넷 에피소드·루트·히든 루트)은 흔적이 아니다', () => {
    expect(report.errors.filter((e) => e.includes('흔적'))).toEqual([]);
    const k = report.paths.filter((p) => p.route === 'koharu' || p.route === 'group');
    expect(k.length).toBe((4893 + 1710) * 2);
    expect(k.every((p) => p.met)).toBe(true);
  });

  it('정적 검사: 0.5 배수가 아닌 점수, routeBranch 에 빠진 루트, 엔딩 루트 불일치, 옛 판정의 tieRoute', () => {
    const s = branchStory();
    const ch = s.scenes.e1_ice4.steps.find((x) => x.id === 'e1f.ch1') as ChoiceStep;
    ch.options[0].points = 0.3;
    const br = s.scenes.e3_rain4.steps.find((x) => x.t === 'routeBranch');
    if (br?.t === 'routeBranch') delete br.scenes.group;
    s.endings.koharu_daily = { ...s.endings.koharu_daily, route: 'group' };
    const all = validateStory(s, permissiveAssets, BRANCH_VARS).errors.join('\n');
    expect(all).toMatch(/e1f\.ch1\/a: points 0\.3 이\(가\) 0\.5 의 배수가 아닙니다/);
    expect(all).toMatch(/가 낼 수 있는 루트 group 의 장면이 없습니다/);
    expect(all).toMatch(/kd1\.end: koharu 장면에서 koharu_daily 엔딩\(루트 group\)/);

    // 옛 판정(c10)에 tieRoute 를 넣으면 구저장 시드의 세 명 동점이 히든으로 가 오류
    const s2 = branchStory();
    const old = s2.scenes.c10_window.steps.find((x) => x.t === 'decideRoute');
    if (old?.t === 'decideRoute') old.tieRoute = 'group';
    const br2 = s2.scenes.c10_window.steps.find((x) => x.t === 'routeBranch');
    if (br2?.t === 'routeBranch') br2.scenes.group = 'h1';
    const rep2 = validateStory(s2, permissiveAssets, BRANCH_VARS, { expect: EXPECTED_BRANCHING });
    expect(rep2.errors.join('\n')).toMatch(/구저장 시드가 히든 루트로 갔습니다/);
    expect(rep2.errors.join('\n')).toMatch(/구저장 시드 히든 루트 수 기대 0, 실제 42/);
  });
});
