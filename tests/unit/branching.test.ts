/**
 * 히든 히로인(코하루) 분기 규칙: pickRoute 경계, 해금 판정(1회·평균·0.5 보존), 보이는 옵션, 검증기 전수 분포·흔적 검사.
 * 실제 대본 대신 같은 장면·선택지 id 로 구조만 옮긴 branchStory 를 쓴다(실제 대본 검사는 story.test.ts).
 */
import { describe, expect, it } from 'vitest';
import { advance, applyUnlock, choose, newGameState, pickRoute, settle, visibleOptions, type StepResult } from '../../src/engine/runner';
import { EXPECTED_BRANCHING, expectedRouteFromChoices, validateStory } from '../../src/engine/validate';
import type { ChoiceStep, GameState, Story, UnlockStep } from '../../src/engine/types';
import { allPicks, BRANCH_ORDER, BRANCH_VARS, branchStory, contractRoute, miniStory, permissiveAssets } from './fixtures';

/** picks 를 순서대로 고르며 진행. stopAt(블로킹 step id)에 닿으면 멈춘다 */
function play(story: Story, picks: readonly string[], stopAt?: string) {
  const state = newGameState(story);
  let r: StepResult = settle(story, state);
  let i = 0;
  const seen: string[] = [];
  while (r.step.t !== 'ending' && r.step.id !== stopAt) {
    seen.push(r.step.id);
    if (r.step.t === 'choice') {
      const next = choose(story, state, picks[i++]);
      if (!next) throw new Error(`${r.step.id} 에서 ${picks[i - 1]} 을(를) 고를 수 없음`);
      r = next;
    } else r = advance(story, state)!;
  }
  return { state, r, seen };
}

const UNLOCK: UnlockStep = { t: 'unlock', id: 'u', heroine: 'koharu', among: ['osana', 'tenko'], maxDiff: 1, flag: 'kh.met' };

function stateWith(points: GameState['points'], flags: GameState['flags'] = {}): GameState {
  return { ...newGameState(branchStory()), points: { ...points }, flags: { ...flags } };
}

describe('pickRoute', () => {
  const all = ['osana', 'tenko', 'koharu'] as const;
  it('최고점이 하나면 기록과 상관없이 그 히로인', () => {
    expect(pickRoute({ osana: 9, tenko: 8, koharu: 8.5 }, all, ['tenko', 'koharu'])).toBe('osana');
    expect(pickRoute({ osana: 7, tenko: 7, koharu: 7.5 }, all, ['osana'])).toBe('koharu');
  });
  it('0.5 점 차이도 그대로 비교한다', () => {
    expect(pickRoute({ osana: 7, tenko: 6.5, koharu: 6.5 }, all, ['koharu'])).toBe('osana');
    expect(pickRoute({ osana: 6.5, tenko: 7, koharu: 6.5 }, all, ['koharu'])).toBe('tenko');
  });
  it('7/7/7 동점이면 뒤에서부터 처음 만나는 개인 선택: 후반 a·b·k → 코하루', () => {
    expect(pickRoute({ osana: 7, tenko: 7, koharu: 7 }, all, [null, null, null, null, 'osana', 'tenko', 'koharu'])).toBe('koharu');
    expect(pickRoute({ osana: 7, tenko: 7, koharu: 7 }, all, [null, null, null, null, 'koharu', 'osana', 'tenko'])).toBe('tenko');
  });
  it('공동 최고점이 아닌 히로인과 함께(null)는 건너뛴다', () => {
    // 코하루는 최고점이 아니므로 마지막 선택이어도 건너뛰고, 그 앞의 히나
    expect(pickRoute({ osana: 8, tenko: 8, koharu: 5 }, all, ['osana', null, 'tenko', 'koharu', null])).toBe('tenko');
    expect(pickRoute({ osana: 8, tenko: 8, koharu: 5 }, all, ['tenko', 'osana', null, null])).toBe('osana');
  });
  it('후보가 아닌 히로인은 점수가 높아도 무시한다(미해금)', () => {
    expect(pickRoute({ osana: 8, tenko: 8, koharu: 99 }, ['osana', 'tenko'], ['tenko', 'koharu'])).toBe('tenko');
  });
  it('기록으로 정할 수 없으면 후보 순서의 첫 공동 최고점', () => {
    expect(pickRoute({ osana: 4, tenko: 4, koharu: 4 }, all, [null, null])).toBe('osana');
    expect(pickRoute({ osana: 3, tenko: 4, koharu: 4 }, all, [])).toBe('tenko');
  });
});

describe('계약 0절 경계 사례(실행기)', () => {
  it('초반 c,c,c,c → 4/4 해금(코하루 4), 후반 a,b,k → 7/7/7 → 코하루', () => {
    const story = branchStory();
    const { state, r, seen } = play(story, ['c', 'c', 'c', 'c', 'a', 'b', 'k']);
    expect(state.flags['kh.met']).toBe(true);
    expect(state.points).toEqual({ osana: 7, tenko: 7, koharu: 7 });
    expect(state.route).toBe('koharu');
    expect(r.step.t === 'ending' && r.step.ending).toBe('koharu');
    // 해금 플레이: 복도 첫 만남 → 노을길 → 토요일 추첨 → 후반 선택
    const at = (id: string) => seen.indexOf(id);
    expect(at('c7.k10')).toBeGreaterThan(-1);
    expect(at('c7.k10')).toBeLessThan(at('c7.j20'));
    expect(at('c7.j40')).toBeLessThan(at('c8r.010'));
    expect(at('c8r.010')).toBeLessThan(at('c8.ch'));
  });

  it('초반 a,b,b,a → 5/4 로 함께 없이도 해금, 코하루 시작 점수 4.5', () => {
    const story = branchStory();
    const { state } = play(story, ['a', 'b', 'b', 'a'], 'c8.ch');
    expect(state.flags['kh.met']).toBe(true);
    expect(state.points).toEqual({ osana: 5, tenko: 4, koharu: 4.5 });
  });

  it('초반 a,a,a,b → 6/3 미해금(복도·추첨 없음), 후반 b,c,c → 8/8 → 히나', () => {
    const story = branchStory();
    const { state, seen } = play(story, ['a', 'a', 'a', 'b', 'b', 'c', 'c']);
    expect(state.flags['kh.met']).toBe(false);
    expect(state.points).toEqual({ osana: 8, tenko: 8, koharu: 0 });
    expect(state.route).toBe('tenko');
    expect(seen).not.toContain('c7.k10');
    expect(seen).not.toContain('c8r.010');
    expect(seen.indexOf('c7.j40')).toBeLessThan(seen.indexOf('c8.ch'));
  });

  it('손 계산(contractRoute)·독립 오라클이 같은 답을 낸다', () => {
    const story = branchStory();
    const asRecord = (picks: string[]) =>
      picks.map((option, i) => {
        const step = Object.values(story.scenes)
          .flatMap((s) => s.steps)
          .find((s) => s.id === BRANCH_ORDER[i]) as ChoiceStep;
        const heroine = step.options.find((o) => o.id === option)?.heroine;
        return heroine ? { choice: BRANCH_ORDER[i], option, heroine } : { choice: BRANCH_ORDER[i], option };
      });
    for (const [picks, route] of [
      [['c', 'c', 'c', 'c', 'a', 'b', 'k'], 'koharu'],
      [['a', 'a', 'a', 'b', 'b', 'c', 'c'], 'tenko'],
      [['a', 'b', 'b', 'a', 'k', 'k', 'a'], 'koharu'],
      [['a', 'b', 'b', 'a', 'a', 'b', 'b'], 'tenko'],
    ] as const) {
      expect(contractRoute(picks).route).toBe(route);
      expect(expectedRouteFromChoices(asRecord([...picks]), story)).toBe(route);
    }
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
  it('미해금이면 후반 선택지에 a·b·함께만 보이고, 숨은 k 는 choose 가 무시한다', () => {
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

  it('해금이면 a·b·k 가 보이고, 숨은 함께(c)는 choose 가 무시한다', () => {
    const story = branchStory();
    const { state, r } = play(story, ['c', 'c', 'c', 'c'], 'c8.ch');
    if (r.step.t !== 'choice') throw new Error(r.step.t);
    expect(visibleOptions(state, r.step).map((o) => o.id)).toEqual(['a', 'b', 'k']);
    const before = structuredClone(state);
    expect(choose(story, state, 'c')).toBeNull();
    expect(state).toEqual(before);
    choose(story, state, 'k');
    expect(state.points).toEqual({ osana: 4, tenko: 4, koharu: 7 });
    // 개인 선택이라 최근 히로인도 바뀐다(함께는 바꾸지 않음)
    expect(state.lastHeroine).toBe('koharu');
  });

  it('함께는 두 사람에게 1점씩이고 최근 히로인을 바꾸지 않는다', () => {
    const story = branchStory();
    const { state } = play(story, ['a', 'c'], 'c6.ch');
    expect(state.points).toEqual({ osana: 3, tenko: 1, koharu: 0 });
    expect(state.lastHeroine).toBe('osana');
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

  it('2,187 경로·초반 81(해금 25)·엔딩 999/999/189·동점 146(42/104)', () => {
    expect(report.errors).toEqual([]);
    expect(report.branching).toEqual({
      paths: 2187,
      earlyCombos: 81,
      unlockedEarlyCombos: 25,
      endings: { osana: 999, tenko: 999, koharu: 189 },
      ties: 146,
      tiesUnlocked: 42,
      tiesLocked: 104,
      unlockedPaths: 675,
      lockedPaths: 1512,
      earlyCombosReachingAll: 81,
    });
  });

  it('모든 경로가 손 계산(contractRoute)과 루트·해금·점수·동점 여부까지 같다', () => {
    const want = new Map(allPicks().map((p) => [p.join(''), contractRoute(p)]));
    expect(want.size).toBe(2187);
    for (const p of report.paths) {
      const key = p.choices.map((c) => c.option).join('');
      const w = want.get(key);
      expect(w, key).toBeDefined();
      expect(p.route, key).toBe(w!.route);
      expect(p.expectedRoute, key).toBe(w!.route);
      expect(p.met, key).toBe(w!.met);
      expect(p.points, key).toEqual(w!.points);
      expect(p.tie, key).toBe(w!.tie);
      expect(p.gateAt).toBe(4);
      want.delete(key);
    }
    expect(want.size).toBe(0);
  });

  it('기대 분포와 다르면 오류로 알린다', () => {
    const rep = validateStory(branchStory(), permissiveAssets, BRANCH_VARS, {
      expect: { ...EXPECTED_BRANCHING, endings: { osana: 1000, tenko: 999, koharu: 188 } },
    });
    expect(rep.errors.join('\n')).toMatch(/분기 분포 불일치: osana 엔딩 수 기대 1000, 실제 999/);
    expect(rep.errors.join('\n')).toMatch(/koharu 엔딩 수 기대 188, 실제 189/);
  });

  it('k 옵션이 미해금에도 보이면 흔적·보이는 개수·분포 오류', () => {
    const s = branchStory();
    const ch = s.scenes.c8_bakery.steps.find((x) => x.id === 'c8.ch') as ChoiceStep;
    delete ch.options.find((o) => o.id === 'k')!.visibleIf;
    const rep = validateStory(s, permissiveAssets, BRANCH_VARS, { expect: EXPECTED_BRANCHING });
    const all = rep.errors.join('\n');
    expect(all).toMatch(/c8\.ch: 보이는 선택지가 4개/);
    // 미해금 초반 56조합 × c8 에서 보이는 4개 × c9·c10 3×3 = 2,016 경로 모두에서 k 가 보인다
    expect(all).toMatch(/해금 전 히든 히로인 흔적이 실행됨: koharu · c8\.ch: 보이는 개인 선택지 k \(2016개 경로/);
    expect(all).toMatch(/분기 분포 불일치: 경로 수 기대 2187/);
  });

  it.each([
    ['show koharu', (s: Story) => s.scenes.c3_break.steps.splice(4, 0, { t: 'show', id: 'x.show', char: 'koharu' }), /show koharu/],
    ['화자', (s: Story) => s.scenes.c4_town.steps.splice(0, 0, { t: 'say', id: 'x.say', who: 'kh_friend', text: '안녕' }), /화자 kh_friend/],
    ['이름 치환 키', (s: Story) => s.scenes.c6_rain.steps.splice(0, 0, { t: 'say', id: 'x.name', who: null, text: '{koharuFamily:는} 누구?' }), /대사에 이름/],
    ['이름표', (s: Story) => s.scenes.c6_rain.steps.splice(0, 0, { t: 'say', id: 'x.label', who: 'tenko', label: '{koharu}', text: '...' }), /이름표에 이름/],
    ['CG', (s: Story) => s.scenes.c8_bakery.steps.splice(0, 0, { t: 'cg', id: 'x.cg', cg: 'kh_draw' }), /CG kh_draw/],
    ['배경', (s: Story) => s.scenes.c9_puzzle.steps.splice(0, 0, { t: 'bg', id: 'x.bg', bg: 'kh_stationery' }), /배경 kh_stationery/],
  ])('해금 전에 실행되는 코하루 흔적(%s)을 잡는다', (_name, mutate, pattern) => {
    const s = branchStory();
    mutate(s);
    const rep = validateStory(s, permissiveAssets, BRANCH_VARS);
    const traces = rep.errors.filter((e) => e.startsWith('해금 전 히든 히로인 흔적'));
    expect(traces.join('\n')).toMatch(pattern);
  });

  it('해금된 플레이의 코하루 장면(복도·추첨·루트)은 흔적이 아니다', () => {
    expect(report.errors.filter((e) => e.includes('흔적'))).toEqual([]);
    const k = report.paths.filter((p) => p.route === 'koharu');
    expect(k.length).toBe(189);
    expect(k.every((p) => p.met)).toBe(true);
  });
});
