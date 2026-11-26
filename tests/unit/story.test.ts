/**
 * 실제 대본 데이터 검사(실제 실행기 settle/advance/choose 로): 연결·에셋 파일·전 분기(39,474 경로 분포)·루트 규칙·
 * 히든 루트·구저장 시드·코하루 흔적, 초반 81 결과의 897ae1f 대조, 발견 25 × 729·미발견 56 × 27 전수, 설계 계약 5.1 표와
 * 경계 사례, 루트별 두 결말, 고정 id 불변, 모든 위치에서의 저장·불러오기
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { STORY } from '../../src/story';
import { manifestChecker } from '../../src/story/checker';
import { TEXT_VARS } from '../../src/story/config';
import { EXPECTED_BRANCHING, validateStory } from '../../src/engine/validate';
import { advance, choose, cloneState, newGameState, settle, snapshotSceneEntry, visibleOptions, type StepResult } from '../../src/engine/runner';
import { SaveManager } from '../../src/engine/save';
import { MemoryStore } from '../../src/engine/storage';
import type { ChoiceStep, DecideRouteStep, EndingId, GameState, HeroineId, RouteId, Step } from '../../src/engine/types';
import { allEarly, BRANCH_ORDER, BRANCH_ORDER6, contractRoute, contractRouteOld, EARLY_CHOICES, FORK_CHOICES, LATE_CHOICES6 } from './fixtures';
import early81 from './fixtures/early81.897ae1f.json';
import scriptIds from './fixtures/script-ids.897ae1f.json';

const checker = manifestChecker((p) => existsSync(resolve(__dirname, '../../public', p)));
const report = validateStory(STORY, checker, TEXT_VARS, { expect: EXPECTED_BRANCHING });
const steps = Object.values(STORY.scenes).flatMap((s) => s.steps.map((step) => ({ scene: s, step })));
const decideOf = (sceneId: string) => STORY.scenes[sceneId].steps.find((s): s is DecideRouteStep => s.t === 'decideRoute')!;
const routeChoices = (p: (typeof report.paths)[number]) => p.choices.filter((c) => !FORK_CHOICES.includes(c.choice));
/** 후반 h(히나)를 옵션 id b 로 */
const late = (x: string) => [...x].map((c) => (c === 'h' ? 'b' : c));

/** 첫 선택지(또는 엔딩·stop 조건)까지 대사를 넘긴다 */
function toChoice(state: GameState, stop?: (r: StepResult, st: GameState) => boolean): StepResult {
  let r = settle(STORY, state);
  while ((r.step.t === 'say' || r.step.t === 'card') && !stop?.(r, state)) r = advance(STORY, state)!;
  return r;
}

/** picks 를 순서대로 고르며 진행. 모자라면 첫 보이는 옵션(결말 갈래는 축제 쪽). stopAt 블로킹 id 에서 멈춘다 */
function play(picks: readonly string[], stopAt?: string) {
  const state = newGameState(STORY);
  let r = settle(STORY, state);
  let i = 0;
  const seen: string[] = [];
  while (r.step.t !== 'ending' && r.step.id !== stopAt) {
    seen.push(r.step.id);
    if (r.step.t === 'choice') {
      const pick = picks[i++] ?? visibleOptions(state, r.step)[0].id;
      const next = choose(STORY, state, pick);
      if (!next) throw new Error(`${r.step.id} 에서 ${pick} 불가`);
      r = next;
    } else r = advance(STORY, state)!;
  }
  return { state, r, seen };
}

/** 초반 네 선택을 고르고 다음 선택지(발견 e1f.ch1 / 미발견 c8.ch)에 선 상태 */
function afterEarly(picks: readonly string[]) {
  const state = newGameState(STORY);
  let r = toChoice(state);
  const scenes: string[] = [];
  for (const p of picks) {
    if (r.step.t !== 'choice' || !EARLY_CHOICES.includes(r.step.id)) throw new Error(`초반 선택지가 아님: ${r.step.id}`);
    r = choose(STORY, state, p)!;
    for (;;) {
      if (scenes[scenes.length - 1] !== state.sceneId) scenes.push(state.sceneId);
      if (r.step.t === 'choice') break;
      r = advance(STORY, state)!;
    }
  }
  return { state, r, scenes };
}

/**
 * 이 상태(선택지 위)에서 보이는 옵션을 모두 골라 가며 루트가 정해진 첫 블로킹 스텝까지 실제 실행기로 진행한 잎들.
 * at5 를 주면 다섯째 후반 선택 직후(여섯째 선택지)의 점수를 모은다
 */
function exploreToRoute(start: GameState, onSixth?: (st: GameState) => void) {
  const out: Array<{ picks: string[]; state: GameState }> = [];
  const stack = [{ state: cloneState(start), picks: [] as string[] }];
  while (stack.length) {
    const { state, picks } = stack.pop()!;
    let r = settle(STORY, state);
    for (let guard = 0; ; guard++) {
      if (guard > 3000) throw new Error('진행이 끝나지 않음');
      if (state.route !== null) {
        out.push({ picks, state });
        break;
      }
      if (r.step.t === 'choice') {
        if (r.step.id === 'e3f.ch2') onSixth?.(state);
        for (const o of visibleOptions(state, r.step)) {
          const c = cloneState(state);
          if (!choose(STORY, c, o.id)) throw new Error(`${r.step.id}/${o.id}`);
          stack.push({ state: c, picks: [...picks, o.id] });
        }
        break;
      }
      if (r.step.t === 'ending') throw new Error('루트 없이 엔딩');
      r = advance(STORY, state)!;
    }
  }
  return out;
}

/** 897ae1f 의 옛 흐름 재현: 새 흐름이 e1_ice4 에 들어가는 순간(장면 진입 스냅샷)의 상태를 옛 장면 c8_bakery 처음에 놓는다 */
function oldBakery(early: readonly string[]): GameState {
  const { state } = play(early, 'e1f.010');
  const e = state.sceneEntry!;
  expect(e.sceneId).toBe('e1_ice4');
  const st: GameState = {
    sceneId: 'c8_bakery',
    stepId: STORY.scenes.c8_bakery.steps[0].id,
    points: { ...e.points },
    lastHeroine: e.lastHeroine,
    route: e.route,
    choices: { ...e.choices },
    flags: { ...e.flags },
    stage: JSON.parse(JSON.stringify(e.stage)) as GameState['stage'],
    log: [],
    endedWith: null,
  };
  st.sceneEntry = snapshotSceneEntry(st);
  return st;
}

describe('실제 대본: 검증기', () => {
  it('검증 오류가 없다(연결·id·에셋 파일·치환 키·0.5 배수·전 분기 시뮬레이션·분기 분포·히든 루트·구저장 시드·코하루 흔적·루트 전용 그림)', () => {
    expect(report.errors).toEqual([]);
  });

  it('엔딩 8개가 정의돼 있고(루트마다 축제 쪽·일상 쪽) 모두 도달할 수 있다', () => {
    const defs = Object.values(STORY.endings).map((e) => `${e.id}:${e.route}:${e.kind}`);
    expect(defs.sort()).toEqual(
      [
        'osana:osana:festival',
        'osana_daily:osana:daily',
        'tenko:tenko:festival',
        'tenko_daily:tenko:daily',
        'koharu:koharu:festival',
        'koharu_daily:koharu:daily',
        'group_festival:group:festival',
        'group_daily:group:daily',
      ].sort(),
    );
    expect(new Set(report.paths.map((p) => p.ending))).toEqual(new Set(Object.keys(STORY.endings)));
  });

  it('보이는 선택지로만 고른 39,474 경로가 계약 분포와 같다(판정 19,737 · 히든 1,710 · 두 사람 동점 1,770/104 · 구저장 시드 675)', () => {
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

  it('공통 선택지는 초반 넷 + 발견 여섯(e1f~e3f) + 옛 후반 셋(c8·c9·c10), 루트 안 선택지는 결말 갈래 넷뿐이다', () => {
    const common = steps.filter((x) => x.scene.route === 'common' && x.step.t === 'choice').map((x) => x.step.id);
    expect([...common].sort()).toEqual([...BRANCH_ORDER, ...LATE_CHOICES6].sort());
    const inRoute = steps.filter((x) => x.scene.route !== 'common' && x.step.t === 'choice');
    expect(inRoute.map((x) => x.step.id).sort()).toEqual([...FORK_CHOICES].sort());
    for (const { scene, step } of inRoute) {
      const c = step as ChoiceStep;
      expect(c.options.map((o) => o.id), c.id).toEqual(['f', 'd']);
      for (const o of c.options) {
        expect(o.heroine, `${c.id}/${o.id}`).toBeUndefined();
        expect(o.points, `${c.id}/${o.id}`).toBeUndefined();
        expect(o.effects, `${c.id}/${o.id}`).toBeUndefined();
        expect(o.visibleIf, `${c.id}/${o.id}`).toBeUndefined();
      }
      const route = scene.route as RouteId;
      const kinds = Object.values(STORY.endings).filter((e) => e.route === route).map((e) => e.kind);
      expect(kinds.sort(), c.id).toEqual(['daily', 'festival']);
    }
  });

  it('발견 경로 여섯 선택은 a·b·k 셋이고 각각 고른 한 사람에게만 +0.5(함께·조건부 옵션 없음)', () => {
    const who = { a: 'osana', b: 'tenko', k: 'koharu' } as const;
    for (const id of LATE_CHOICES6) {
      const c = steps.find((x) => x.step.id === id)!.step as ChoiceStep;
      expect(c.options.map((o) => o.id), id).toEqual(['a', 'b', 'k']);
      for (const o of c.options) {
        expect({ heroine: o.heroine, points: o.points, effects: o.effects, visibleIf: o.visibleIf }, `${id}/${o.id}`).toEqual({
          heroine: who[o.id as keyof typeof who],
          points: 0.5,
          effects: undefined,
          visibleIf: undefined,
        });
      }
    }
  });

  it('decideRoute 는 셋: 발견(처마 넷, tieRoute group) · 미발견(처마 셋) · 구저장 전용(c10, 옛 규칙)', () => {
    const decides = steps.filter((x) => x.step.t === 'decideRoute');
    expect(decides.map((x) => x.scene.id).sort()).toEqual(['c10_window', 'e3_rain3', 'e3_rain4']);
    expect(decideOf('e3_rain4')).toMatchObject({ order: BRANCH_ORDER6, hidden: { koharu: 'kh.met' }, tieRoute: 'group' });
    for (const id of ['e3_rain3', 'c10_window']) {
      expect(decideOf(id), id).toMatchObject({ order: BRANCH_ORDER, hidden: { koharu: 'kh.met' } });
      expect(decideOf(id).tieRoute, id).toBeUndefined();
    }
    const branchOf = (sceneId: string) => STORY.scenes[sceneId].steps.find((s) => s.t === 'routeBranch');
    expect(branchOf('e3_rain4')).toMatchObject({ scenes: { osana: 'o1_shop', tenko: 't1_cats', koharu: 'k1', group: 'h1' } });
    for (const id of ['e3_rain3', 'c10_window']) {
      const b = branchOf(id);
      expect(b?.t === 'routeBranch' && b.scenes, id).toEqual({ osana: 'o1_shop', tenko: 't1_cats', koharu: 'k1' });
    }
    // 경로마다 실제로 실행된 판정: 발견 = 처마 넷, 미발견 = 처마 셋, 구저장 시드 = c10
    for (const p of report.paths) {
      expect(p.decideStep).toBe(decideOf(p.met ? 'e3_rain4' : 'e3_rain3').id);
      expect(routeChoices(p).map((c) => c.choice)).toEqual(p.met ? BRANCH_ORDER6 : BRANCH_ORDER);
      expect(p.choices.length - routeChoices(p).length).toBe(1);
      expect(p.route).toBe(p.expectedRoute);
    }
    for (const p of report.legacyPaths) {
      expect(p.decideStep).toBe(decideOf('c10_window').id);
      expect(routeChoices(p).map((c) => c.choice)).toEqual(BRANCH_ORDER);
    }
  });

  it('모든 경로가 계약 5절 손 계산과 루트·해금·점수·동점·히든 여부까지 같다(구저장 시드는 옛 규칙 손 계산과)', () => {
    for (const p of report.paths) {
      const key = routeChoices(p).map((c) => c.option);
      const w = contractRoute(key);
      expect({ route: p.route, met: p.met, points: p.points, tie: p.tie, hidden: p.hidden }, key.join('')).toEqual({
        route: w.route,
        met: w.met,
        points: w.points,
        tie: w.tie,
        hidden: w.hidden,
      });
    }
    for (const p of report.legacyPaths) {
      const key = routeChoices(p).map((c) => c.option);
      const w = contractRouteOld(key);
      expect({ route: p.route, points: p.points, tie: p.tie, hidden: p.hidden }, key.join('')).toEqual({ route: w.route, points: w.points, tie: w.tie, hidden: false });
    }
  });

  it('고백·엔딩은 후일담(epilogue)에만 있고, 본편 마지막에는 엔딩이 없다', () => {
    for (const s of Object.values(STORY.scenes)) {
      const hasEnding = s.steps.some((x) => x.t === 'ending');
      if (hasEnding) expect(s.part, s.id).toBe('epilogue');
    }
  });
});

describe('실제 대본: 897ae1f 와 같은 것', () => {
  it('초반 81 조합의 발견 여부·시작 점수·최근 히로인·선택 기록이 897ae1f 실행 결과와 같다(실제 실행기)', () => {
    expect(early81.combos).toHaveLength(81);
    for (const old of early81.combos) {
      const { state, r, scenes } = afterEarly([...old.picks]);
      const met = state.flags['kh.met'] === true;
      expect({ met, points: state.points, lastHeroine: state.lastHeroine, choices: state.choices }, old.picks).toEqual({
        met: old.met,
        points: old.points,
        lastHeroine: old.lastHeroine,
        choices: old.choices,
      });
      // 897ae1f 에서는 발견·미발견 모두 c8.ch 로 갔다. 새 흐름: 발견 → 추첨 → 빙수집 넷, 미발견 → 빙수집 셋 → c8.ch
      expect(old.firstLateChoice).toBe('c8.ch');
      expect(r.step.id, old.picks).toBe(met ? 'e1f.ch1' : 'c8.ch');
      expect(old.afterC7).toBe(met ? 'c8_raffle' : 'c8_bakery');
      expect(scenes[scenes.indexOf('c7_friday') + 1], old.picks).toBe(met ? 'c8_raffle' : 'e1_ice3');
    }
    expect(early81.combos.filter((c) => c.met)).toHaveLength(25);
  });

  it('897ae1f 대본의 블로킹 스텝 id(대사·카드·선택지·엔딩)와 옛 후반 장면의 라벨은 같은 장면에 같은 종류로 남아 있다(저장 위치·읽음 기록)', () => {
    const now = new Map(steps.map((x) => [x.step.id, x]));
    const missing: string[] = [];
    const OLD_LATE = ['c8_bakery', 'c9_puzzle', 'c10_window'];
    for (const old of scriptIds.steps) {
      if (old.t === 'label' && !OLD_LATE.includes(old.scene)) continue;
      const hit = now.get(old.id);
      if (!hit || hit.scene.id !== old.scene || hit.step.t !== old.t) missing.push(`${old.scene}/${old.id}(${old.t})`);
    }
    expect(missing).toEqual([]);
  });

  it('옛 대사·카드 문장과 옛 선택지 옵션(배점·visibleIf·이동 목표)은 그대로다(옛 후반 c8·c9·c10 의 k +3·함께·c10.040 포함)', () => {
    const now = new Map(steps.map((x) => [x.step.id, x.step]));
    const changed: string[] = [];
    for (const old of scriptIds.steps as Array<{ id: string; t: string; text?: string; label?: string; who?: string | null; options?: unknown }>) {
      const st = now.get(old.id) as (Step & { text?: string; label?: string; who?: string | null; options?: unknown }) | undefined;
      if (!st) continue;
      if (old.t === 'say' && (st.text !== old.text || (st.label ?? undefined) !== (old.label ?? undefined) || st.who !== old.who)) changed.push(old.id);
      if (old.t === 'card' && st.text !== old.text) changed.push(old.id);
      if (old.t === 'choice' && JSON.stringify(st.options) !== JSON.stringify(old.options)) changed.push(old.id);
    }
    expect(changed).toEqual([]);
  });
});

describe('실제 대본: 실제 실행기 전수 검사', () => {
  const metEarly = allEarly().filter((p) => afterEarly(p).state.flags['kh.met'] === true);

  it('발견 25 × 후반 729 = 18,225: 아카네 5,811 / 히나 5,811 / 코하루 4,893 / 히든 1,710, 조합별 히든 90(동점 출발)·60(1점 차)', { timeout: 60000 }, () => {
    expect(metEarly).toHaveLength(25);
    const routes: Record<string, number> = {};
    let ties = 0;
    let lastNotTop = 0;
    let threeAfterFive = 0;
    const perStart = { tie: [] as number[], one: [] as number[] };
    for (const early of metEarly) {
      const { state: start, r } = afterEarly(early);
      expect(r.step.id).toBe('e1f.ch1');
      const leaves = exploreToRoute(start, (st) => {
        if (st.points.osana === st.points.tenko && st.points.tenko === st.points.koharu) threeAfterFive++;
      });
      expect(leaves, early.join('')).toHaveLength(729);
      let hidden = 0;
      for (const { picks, state } of leaves) {
        const w = contractRoute([...early, ...picks]);
        expect({ route: state.route, points: state.points }, [...early, ...picks].join('')).toEqual({ route: w.route, points: w.points });
        expect(state.flags['ep3.done']).toBe(true);
        routes[state.route!] = (routes[state.route!] ?? 0) + 1;
        if (state.route === 'group') hidden++;
        if (w.tie) {
          ties++;
          const lastWho = { a: 'osana', b: 'tenko', k: 'koharu' }[picks[picks.length - 1] as 'a' | 'b' | 'k'] as HeroineId;
          if (state.points[lastWho] !== Math.max(...Object.values(state.points))) lastNotTop++;
        }
      }
      (start.points.osana === start.points.tenko ? perStart.tie : perStart.one).push(hidden);
    }
    expect(routes).toEqual({ osana: 5811, tenko: 5811, koharu: 4893, group: 1710 });
    expect(ties).toBe(1770);
    expect(lastNotTop).toBe(180);
    // 다섯째 선택 직후의 세 명 동점은 0(합이 3 으로 나누어떨어지지 않는다)
    expect(threeAfterFive).toBe(0);
    expect(perStart.tie).toEqual(Array(7).fill(90));
    expect(perStart.one).toEqual(Array(18).fill(60));
  });

  it('미발견 56 × 27 = 1,512: 아카네 756 / 히나 756(동점 처리 104), 후반 선택지는 늘 a·b·함께', { timeout: 60000 }, () => {
    const routes: Record<string, number> = {};
    let ties = 0;
    let n = 0;
    for (const early of allEarly()) {
      const { state: start, r } = afterEarly(early);
      if (start.flags['kh.met'] === true) continue;
      n++;
      expect(r.step.id).toBe('c8.ch');
      if (r.step.t === 'choice') expect(visibleOptions(start, r.step).map((o) => o.id)).toEqual(['a', 'b', 'c']);
      const leaves = exploreToRoute(start);
      expect(leaves).toHaveLength(27);
      for (const { picks, state } of leaves) {
        const w = contractRoute([...early, ...picks]);
        expect({ route: state.route, points: state.points }).toEqual({ route: w.route, points: w.points });
        expect(state.flags['kh.met']).toBe(false);
        routes[state.route!] = (routes[state.route!] ?? 0) + 1;
        if (w.tie) ties++;
      }
    }
    expect(n).toBe(56);
    expect(routes).toEqual({ osana: 756, tenko: 756 });
    expect(ties).toBe(104);
  });

  it('구저장 시드 675(해금된 채 옛 c8_bakery 에 들어온 상태): 옛 k(+3)·옛 판정으로 243/243/189, 세 명 동점 42건은 히든이 아니다', { timeout: 60000 }, () => {
    const routes: Record<string, number> = {};
    let allTied = 0;
    for (const early of metEarly) {
      const start = oldBakery(early);
      const r = toChoice(start);
      expect(r.step.id).toBe('c8.ch');
      if (r.step.t === 'choice') expect(visibleOptions(start, r.step).map((o) => o.id)).toEqual(['a', 'b', 'k']);
      const leaves = exploreToRoute(start);
      expect(leaves).toHaveLength(27);
      for (const { picks, state } of leaves) {
        const w = contractRouteOld([...early, ...picks]);
        expect({ route: state.route, points: state.points }, [...early, ...picks].join('')).toEqual({ route: w.route, points: w.points });
        expect(state.flags['ep3.done']).toBeUndefined();
        routes[state.route!] = (routes[state.route!] ?? 0) + 1;
        if (state.points.osana === state.points.tenko && state.points.tenko === state.points.koharu) {
          allTied++;
          expect(state.route).not.toBe('group');
        }
      }
    }
    expect(routes).toEqual({ osana: 243, tenko: 243, koharu: 189 });
    expect(allTied).toBe(42);
  });
});

describe('실제 대본: 설계 계약 5.1 표와 경계 사례(실제 실행기)', () => {
  it.each([
    ['cccc', 'ahkahk', { osana: 5, tenko: 5, koharu: 5 }, 'group'],
    ['abba', 'hkhakh', { osana: 5.5, tenko: 5.5, koharu: 5.5 }, 'group'],
    ['baab', 'akahka', { osana: 5.5, tenko: 5.5, koharu: 5.5 }, 'group'],
    ['cccc', 'ahahah', { osana: 5.5, tenko: 5.5, koharu: 4 }, 'tenko'],
    ['cccc', 'aaaaaa', { osana: 7, tenko: 4, koharu: 4 }, 'osana'],
  ] as const)('초반 %s + 후반 %s → %j → %s', (early, six, points, route) => {
    const { state } = play([...early, ...late(six)], 'never');
    expect(state.flags['kh.met']).toBe(true);
    expect(state.points).toEqual(points);
    expect(state.route).toBe(route);
  });

  it.each([
    ['두 번씩 골라도 점수 차로 동점이 안 되는 출발', 'abba', 'aahhkk', { osana: 6, tenko: 5, koharu: 5.5 }, 'osana'],
    ['다섯째 뒤에만 두 사람 공동 최고점, 여섯째로 깨짐', 'cccc', 'ahkaha', { osana: 5.5, tenko: 5, koharu: 4.5 }, 'osana'],
    ['셋째 뒤 세 명 동점이어도 판정은 여섯째 뒤', 'cccc', 'ahkaaa', { osana: 6, tenko: 4.5, koharu: 4.5 }, 'osana'],
    ['마지막 선택자가 공동 최고점이 아님(마지막 h 를 건너뛰고 코하루)', 'abba', 'aakkkh', { osana: 6, tenko: 4.5, koharu: 6 }, 'koharu'],
    ['코하루 단독(동점 출발)', 'cccc', 'kkkkkk', { osana: 4, tenko: 4, koharu: 7 }, 'koharu'],
    ['코하루 단독(1점 차 출발)', 'abba', 'kkkkkk', { osana: 5, tenko: 4, koharu: 7.5 }, 'koharu'],
  ] as const)('%s: %s + %s', (_name, early, six, points, route) => {
    const { state } = play([...early, ...late(six)], 'never');
    expect(state.points).toEqual(points);
    expect(state.route).toBe(route);
  });

  it('다섯째 뒤 공동 최고점(5/5/4.5)은 여섯째 선택지에서 확인된다', () => {
    const { state, r } = play([...'cccc', ...late('ahkah')], 'e3f.ch2');
    expect(r.step.id).toBe('e3f.ch2');
    expect(state.points).toEqual({ osana: 5, tenko: 5, koharu: 4.5 });
    expect(state.route).toBeNull();
  });

  it('미발견: a·a·a·b + b·함께·함께 → 8/8 히나(옛 규칙 그대로), a×7 → 18/0 아카네', () => {
    expect(play([...'aaab', 'b', 'c', 'c'], 'never').state).toMatchObject({ route: 'tenko', points: { osana: 8, tenko: 8, koharu: 0 } });
    expect(play([...'aaaa', 'a', 'a', 'a'], 'never').state).toMatchObject({ route: 'osana', points: { osana: 18, tenko: 0, koharu: 0 } });
  });

  it.each([
    ['osana', 'aaaa', 'aaa'],
    ['tenko', 'bbbb', 'bbb'],
    ['koharu', 'cccc', 'kkkkkk'],
    ['group', 'cccc', 'ahkahk'],
  ] as const)('%s 루트: 결말 갈래 f → 축제 쪽 엔딩, d → 일상 쪽 엔딩. 갈래 선택은 점수·루트를 바꾸지 않는다', (route, early, rest) => {
    for (const kind of ['festival', 'daily'] as const) {
      const { state, r } = play([...early, ...late(rest), kind === 'festival' ? 'f' : 'd']);
      expect(state.route).toBe(route);
      expect(r.step.t).toBe('ending');
      const def = STORY.endings[(r.step as { ending: EndingId }).ending];
      expect({ route: def.route, kind: def.kind }).toEqual({ route, kind });
    }
    const atFork = play([...early, ...late(rest)], FORK_CHOICES.find((f) => (STORY.scenes[stepScene(f)].route as string) === route)!);
    const before = structuredClone({ points: atFork.state.points, route: atFork.state.route, lastHeroine: atFork.state.lastHeroine });
    choose(STORY, atFork.state, 'd');
    expect({ points: atFork.state.points, route: atFork.state.route, lastHeroine: atFork.state.lastHeroine }).toEqual(before);
  });

  it('발견 경로는 c8·c9·c10 을 거치지 않고, 미발견 경로는 새 에피소드 셋 판과 옛 c8·c9·c10 을 지난다(코하루 흔적 없음)', () => {
    const met = play([...'cccc', ...late('ahkahk')]).seen;
    for (const id of ['c7.m10', 'c8r.010', 'e1f.ch1', 'e1f.ch2', 'e2f.ch1', 'e2f.ch2', 'e3f.ch1', 'e3f.ch2']) expect(met, id).toContain(id);
    for (const id of ['c8.ch', 'c9.ch', 'c10.ch']) expect(met).not.toContain(id);
    const unmet = play([...'aaab', 'a', 'b', 'c']).seen;
    for (const id of ['c8.ch', 'c9.ch', 'c10.ch']) expect(unmet).toContain(id);
    for (const id of ['c7.m10', 'c8r.010', 'e1f.ch1', 'c10.040']) expect(unmet).not.toContain(id);
  });
});

function stepScene(id: string): string {
  return steps.find((x) => x.step.id === id)!.scene.id;
}

describe('실제 대본: 모든 블로킹 위치에서 저장→불러오기', () => {
  it.each([
    ['osana', false, 'osana'],
    ['tenko', false, 'tenko_daily'],
    ['osana', true, 'osana_daily'],
    ['tenko', true, 'tenko'],
    ['koharu', true, 'koharu'],
    ['koharu', true, 'koharu_daily'],
    ['group', true, 'group_festival'],
    ['group', true, 'group_daily'],
  ] as const)('%s 루트(발견 %s) → %s: 진행이 원본과 같고 불러온 직후 연출·판정이 다시 실행되지 않는다', { timeout: 60000 }, (route: RouteId, met: boolean, ending: EndingId) => {
    const path = report.paths.find((p) => p.route === route && p.met === met && p.ending === ending)!;
    expect(path).toBeDefined();
    const pickFor = (state: GameState, choiceId: string) => {
      const step = STORY.scenes[state.sceneId].steps.find((x) => x.id === choiceId);
      const fallback = step && step.t === 'choice' ? visibleOptions(state, step)[0].id : 'a';
      return path.choices.find((c) => c.choice === choiceId)?.option ?? fallback;
    };

    // 원본 진행 기록
    const trace: Array<{ id: string; state: string }> = [];
    const st = newGameState(STORY);
    let r = settle(STORY, st);
    for (;;) {
      trace.push({ id: r.step.id, state: JSON.stringify(st) });
      if (r.step.t === 'ending') break;
      r = r.step.t === 'choice' ? choose(STORY, st, pickFor(st, r.step.id))! : advance(STORY, st)!;
    }
    expect(st.route).toBe(route);
    expect(st.flags['kh.met']).toBe(met);
    expect(r.step.t === 'ending' && r.step.ending).toBe(ending);

    const store = new MemoryStore(true);
    const sm = new SaveManager(store, STORY, checker);
    const checked = { choice: false, epilogue: false, cg: false, fork: false, afterFork: false, between56: false, routeStart: false };
    for (let i = 0; i < trace.length - 1; i++) {
      const saved = JSON.parse(trace[i].state) as GameState;
      sm.write('1', saved, { sceneTitle: '', text: '', route: saved.route });
      const loaded = sm.load('1');
      expect(loaded.status, `위치 ${trace[i].id}`).toBe('ok');
      if (loaded.status !== 'ok') return;
      const s2 = loaded.data.state;
      expect(s2.points, `위치 ${trace[i].id}`).toEqual(saved.points);
      expect(s2.flags, `위치 ${trace[i].id}`).toEqual(saved.flags);
      expect(s2.route, `위치 ${trace[i].id}`).toEqual(saved.route);
      let r2 = settle(STORY, s2);
      expect(r2.step.id).toBe(trace[i].id);
      // 불러온 직후에는 연출이 다시 실행되지 않는다(CG 관람·점수·판정이 두 번 반영되지 않음)
      expect(r2.events, `위치 ${trace[i].id}`).toEqual([]);
      if (r2.step.t === 'choice') checked.choice = true;
      if (FORK_CHOICES.includes(r2.step.id)) checked.fork = true;
      if (s2.route && FORK_CHOICES.some((f) => f in s2.choices)) checked.afterFork = true;
      if (r2.step.id === 'e3f.ch2') checked.between56 = true;
      if (s2.route && i > 0 && JSON.parse(trace[i - 1].state).route === null) checked.routeStart = true;
      if (s2.stage.cg) checked.cg = true;
      if (STORY.scenes[s2.sceneId].part === 'epilogue') checked.epilogue = true;
      // 다음 몇 걸음이 원본과 같은지
      for (let k = i + 1; k < Math.min(trace.length, i + 4); k++) {
        r2 = r2.step.t === 'choice' ? choose(STORY, s2, pickFor(s2, r2.step.id))! : advance(STORY, s2)!;
        expect(r2.step.id).toBe(trace[k].id);
      }
    }
    expect(checked.choice && checked.epilogue && checked.cg && checked.fork && checked.afterFork && checked.routeStart).toBe(true);
    expect(checked.between56).toBe(met);
  });
});

describe('실제 대본: 검증기 속도', () => {
  it('검증기(39,474 경로 + 구저장 시드)는 루트 확정 뒤 구간을 메모해 수십 번만 시뮬레이션한다', () => {
    expect(report.stats.suffixRuns).toBeGreaterThan(0);
    expect(report.stats.suffixRuns).toBeLessThan(500);
    expect(report.paths.length + report.legacyPaths.length).toBe(39474 + 1350);
  });
});

/** 이 상태에서 picks 를 순서대로 고르며 엔딩까지 진행(모자라면 첫 보이는 옵션). 지나간 블로킹 id 를 모은다 */
function playFrom(state: GameState, picks: readonly string[]) {
  let r = settle(STORY, state);
  let i = 0;
  const seen: string[] = [];
  for (let guard = 0; r.step.t !== 'ending'; guard++) {
    if (guard > 5000) throw new Error('진행이 끝나지 않음');
    seen.push(r.step.id);
    if (r.step.t === 'choice') {
      const pick = picks[i++] ?? visibleOptions(state, r.step)[0].id;
      const next = choose(STORY, state, pick);
      if (!next) throw new Error(`${r.step.id} 에서 ${pick} 불가`);
      r = next;
    } else r = advance(STORY, state)!;
  }
  return { state, seen, ending: (r.step as { ending?: EndingId }).ending };
}

/**
 * 897ae1f 저장 위치 흉내: 새 흐름이 stopAt(장면 첫 블로킹 스텝)에 선 순간의 장면 진입 스냅샷을 장면 to 처음에 놓는다.
 * drop 의 플래그는 지운다(897ae1f 에 없던 줄이 세우는 플래그)
 */
function savedAt(picks: readonly string[], stopAt: string, to: string, drop: readonly string[] = []): GameState {
  const { state } = play(picks, stopAt);
  const e = state.sceneEntry!;
  const flags = { ...e.flags };
  for (const f of drop) delete flags[f];
  const st: GameState = {
    sceneId: to,
    stepId: STORY.scenes[to].steps[0].id,
    points: { ...e.points },
    lastHeroine: e.lastHeroine,
    route: e.route,
    choices: { ...e.choices },
    flags,
    stage: JSON.parse(JSON.stringify(e.stage)) as GameState['stage'],
    log: [],
    endedWith: null,
  };
  st.sceneEntry = snapshotSceneEntry(st);
  return st;
}

describe('실제 대본: 구저장 흐름은 본 적 없는 장면을 되부르지 않는다(새 플래그 ep1.three · kh.coin)', () => {
  it('미발견 새 흐름은 e1_ice3 끝에서 ep1.three 를 세우고 o1.066(토요일)·o1.067(막과자)을 모두 본다', () => {
    const { state, seen } = play([...'aaaaaaa']);
    expect(state.route).toBe('osana');
    expect(state.flags['ep1.three']).toBe(true);
    expect(seen).toEqual(expect.arrayContaining(['e1t.010', 'o1.066', 'o1.067']));
  });

  it('897ae1f 미발견 저장이 c8_bakery 에 있었으면 e1_ice3 를 건너뛰므로 o1.066 은 안 보이고 o1.067 만 보인다', () => {
    const st = savedAt([...'aaaa'], 'e1t.010', 'c8_bakery');
    expect(st.flags['kh.met']).not.toBe(true);
    const { state, seen } = playFrom(st, [...'aaa']);
    expect(state.route).toBe('osana');
    expect(state.flags['ep1.three']).toBeUndefined();
    expect(seen.some((id) => id.startsWith('e1t.'))).toBe(false);
    expect(seen).toEqual(expect.arrayContaining(['e2t.010', 'e3t.010', 'o1.067']));
    expect(seen).not.toContain('o1.066');
  });

  it('코하루 일상 갈래: 새 흐름은 k3 동전 씨앗 뒤 kh.coin 이 서고 kd1.140·150 을 본다. k4 의 897ae1f 저장(kh.coin 없음)은 kd1.155 만', () => {
    const fresh = play([...'cccc', ...'kkkkkk', 'd']);
    expect(fresh.state.route).toBe('koharu');
    expect(fresh.state.flags['kh.coin']).toBe(true);
    expect(fresh.seen).toEqual(expect.arrayContaining(['k3.230', 'kd1.140', 'kd1.150', 'kd1.155']));

    const st = savedAt([...'cccc', ...'kkkkkk'], 'k4.010', 'k4', ['kh.coin']);
    const old = playFrom(st, ['d']);
    expect(old.ending).toBe('koharu_daily');
    expect(old.state.flags['kh.coin']).toBeUndefined();
    expect(old.seen).toContain('kd1.155');
    expect(old.seen).not.toContain('kd1.140');
    expect(old.seen).not.toContain('kd1.150');
  });
});

describe('실제 대본: 그림·서술 정합(새 장면)', () => {
  const ORDER: Record<string, number> = { left: 0, center: 1, right: 2 };

  it('hf2: 첫 불꽃 직전 화면 배치가 CG(end_group_fireworks: 히나 L · 코하루 C · 아카네 R)와 같고, 자리를 옮기며 다른 인물을 가로지르지 않는다', () => {
    const st = STORY.scenes.hf2.steps;
    const fw = st.findIndex((s) => s.t === 'sfx' && s.sound === 'firework');
    expect(fw).toBeGreaterThan(st.findIndex((s) => s.id === 'hf2.350'));
    const pos = new Map<string, string>();
    for (const s of st.slice(0, fw)) {
      if (s.t === 'hide') {
        if (s.char === 'all') pos.clear();
        else pos.delete(s.char);
      } else if (s.t === 'show' && s.pos) {
        const from = pos.get(s.char);
        if (from !== undefined && from !== s.pos) {
          const [lo, hi] = [Math.min(ORDER[from], ORDER[s.pos]), Math.max(ORDER[from], ORDER[s.pos])];
          for (const [other, p] of pos) {
            if (other !== s.char) expect(ORDER[p] < lo || ORDER[p] > hi, `${s.char} ${from}→${s.pos} 가 ${other}(${p}) 를 지난다`).toBe(true);
          }
        }
        pos.set(s.char, s.pos);
      }
    }
    expect(Object.fromEntries(pos)).toEqual({ tenko: 'left', koharu: 'center', osana: 'right' });
  });

  it('e3_rain4: 장소 표시는 비 갠 처마 배경과 함께 뜨고(암전 중 해 아이콘 없음), 암전 구간 대사는 10줄 이하다', () => {
    const st = STORY.scenes.e3_rain4.steps;
    const bgAt = st.findIndex((s) => s.t === 'bg' && s.bg === 'bg_after_rain');
    const placeAt = st.findIndex((s) => s.t === 'place');
    expect(placeAt).toBe(bgAt + 1);
    expect(st.slice(0, bgAt).filter((s) => s.t === 'say').length).toBeLessThanOrEqual(10);
  });
});
