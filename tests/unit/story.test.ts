/** 실제 대본 데이터 검사: 연결, 에셋 파일, 전 분기(2,187 조합 분포), 루트 규칙, 코하루 흔적, 모든 위치에서의 저장·불러오기 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { STORY } from '../../src/story';
import { manifestChecker } from '../../src/story/checker';
import { TEXT_VARS } from '../../src/story/config';
import { EXPECTED_BRANCHING, validateStory } from '../../src/engine/validate';
import { advance, choose, newGameState, settle, visibleOptions } from '../../src/engine/runner';
import { SaveManager } from '../../src/engine/save';
import { MemoryStore } from '../../src/engine/storage';
import type { GameState, HeroineId } from '../../src/engine/types';
import { allPicks, BRANCH_ORDER, contractRoute } from './fixtures';

const checker = manifestChecker((p) => existsSync(resolve(__dirname, '../../public', p)));
const report = validateStory(STORY, checker, TEXT_VARS, { expect: EXPECTED_BRANCHING });
const picksOf = (p: (typeof report.paths)[number]) => p.choices.filter((c) => BRANCH_ORDER.includes(c.choice)).map((c) => c.option);

describe('실제 대본', () => {
  it('검증 오류가 없다(연결·id·에셋 파일·치환 키·전 분기 시뮬레이션·분기 분포·미해금 코하루 흔적)', () => {
    expect(report.errors).toEqual([]);
  });

  it('세 히로인의 엔딩에 모두 도달할 수 있다', () => {
    const endings = new Set(report.paths.map((p) => p.ending));
    expect(endings).toEqual(new Set(['osana', 'tenko', 'koharu']));
  });

  it('보이는 선택지로만 고른 2,187 조합이 계약 분포와 같다', () => {
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

  it('공통 선택지는 c3·c4·c6·c7(초반)과 c8·c9·c10(후반) 7회이고, 루트 결정은 이 순서와 kh.met 을 쓴다', () => {
    const commonChoices = Object.values(STORY.scenes)
      .filter((s) => s.route === 'common')
      .flatMap((s) => s.steps.filter((x) => x.t === 'choice'))
      .map((x) => x.id);
    expect([...commonChoices].sort()).toEqual([...BRANCH_ORDER].sort());
    const decides = Object.values(STORY.scenes).flatMap((s) => s.steps.filter((x) => x.t === 'decideRoute'));
    expect(decides).toHaveLength(1);
    const d = decides[0];
    if (d.t !== 'decideRoute') return;
    expect(d.order).toEqual(BRANCH_ORDER);
    expect(d.hidden).toEqual({ koharu: 'kh.met' });
    for (const p of report.paths) {
      expect(p.choices.map((c) => c.choice)).toEqual(BRANCH_ORDER);
      expect(p.route).toBe(p.expectedRoute);
    }
  });

  it('모든 경로가 계약 0절 손 계산과 루트·해금·점수·동점 여부까지 같다', () => {
    const want = new Map(allPicks().map((p) => [p.join(''), contractRoute(p)]));
    for (const p of report.paths) {
      const key = picksOf(p).join('');
      const w = want.get(key);
      expect(w, key).toBeDefined();
      expect({ route: p.route, met: p.met, points: p.points, tie: p.tie }, key).toEqual({ route: w!.route, met: w!.met, points: w!.points, tie: w!.tie });
      want.delete(key);
    }
    expect(want.size).toBe(0);
  });

  it('손 확인 경계 사례', () => {
    const find = (picks: string) => report.paths.find((p) => picksOf(p).join('') === picks)!;
    // 초반 모두 함께(4/4 해금, 코하루 4) + 후반 a·b·k → 7/7/7 → 코하루
    expect(find('ccccabk')).toMatchObject({ route: 'koharu', met: true, tie: true, points: { osana: 7, tenko: 7, koharu: 7 } });
    // 초반 a·b·b·a → 함께 없이 5/4 해금(코하루 4.5)
    expect(find('abbaaaa')).toMatchObject({ met: true, route: 'osana', points: { osana: 14, tenko: 4, koharu: 4.5 } });
    // 초반 a·a·a·b → 6/3 미해금, 후반 b·c·c → 8/8 → 히나
    expect(find('aaabbcc')).toMatchObject({ met: false, route: 'tenko', tie: true, points: { osana: 8, tenko: 8, koharu: 0 } });
  });

  it('미해금 플레이의 후반 선택지에는 코하루 개인 선택이 보이지 않고, 해금 플레이에는 함께가 보이지 않는다(항상 3개)', () => {
    for (const met of [false, true]) {
      const picks = met ? ['a', 'b', 'b', 'a'] : ['a', 'a', 'a', 'b'];
      const st = newGameState(STORY);
      let r = settle(STORY, st);
      let i = 0;
      const seen: string[][] = [];
      while (r.step.t !== 'ending' && st.route === null) {
        if (r.step.t === 'choice') {
          const ids = visibleOptions(st, r.step).map((o) => o.id);
          if (i >= 4) seen.push(ids);
          r = choose(STORY, st, picks[i++] ?? 'a')!;
        } else r = advance(STORY, st)!;
      }
      expect(st.flags['kh.met']).toBe(met);
      expect(seen).toEqual([0, 1, 2].map(() => (met ? ['a', 'b', 'k'] : ['a', 'b', 'c'])));
    }
  });

  it.each([
    ['osana', false],
    ['tenko', false],
    ['koharu', true],
    ['osana', true],
  ] as const)('%s 루트(해금 %s): 모든 블로킹 위치에서 저장→불러오기 후 진행이 원본과 같다', (route: HeroineId, met: boolean) => {
    const path = report.paths.find((p) => p.route === route && p.met === met)!;
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

    const store = new MemoryStore(true);
    const sm = new SaveManager(store, STORY, checker);
    let checkedEpilogue = false;
    let checkedChoice = false;
    let checkedCg = false;
    for (let i = 0; i < trace.length - 1; i++) {
      const saved = JSON.parse(trace[i].state) as GameState;
      sm.write('1', saved, { sceneTitle: '', text: '', route: saved.route });
      const loaded = sm.load('1');
      expect(loaded.status, `위치 ${trace[i].id}`).toBe('ok');
      if (loaded.status !== 'ok') return;
      const s2 = loaded.data.state;
      expect(s2.points, `위치 ${trace[i].id}`).toEqual(saved.points);
      expect(s2.flags, `위치 ${trace[i].id}`).toEqual(saved.flags);
      let r2 = settle(STORY, s2);
      expect(r2.step.id).toBe(trace[i].id);
      // 불러온 직후에는 연출이 다시 실행되지 않는다(CG 관람·점수가 두 번 반영되지 않음)
      expect(r2.events, `위치 ${trace[i].id}`).toEqual([]);
      if (r2.step.t === 'choice') checkedChoice = true;
      if (s2.stage.cg) checkedCg = true;
      if (STORY.scenes[s2.sceneId].part === 'epilogue') checkedEpilogue = true;
      // 다음 몇 걸음이 원본과 같은지
      for (let k = i + 1; k < Math.min(trace.length, i + 4); k++) {
        r2 = r2.step.t === 'choice' ? choose(STORY, s2, pickFor(s2, r2.step.id))! : advance(STORY, s2)!;
        expect(r2.step.id).toBe(trace[k].id);
      }
    }
    expect(checkedChoice).toBe(true);
    expect(checkedEpilogue).toBe(true);
    expect(checkedCg).toBe(true);
  });

  it('고백은 후일담에만 있고, 본편 마지막에는 엔딩이 없다', () => {
    for (const s of Object.values(STORY.scenes)) {
      const hasEnding = s.steps.some((x) => x.t === 'ending');
      if (hasEnding) expect(s.part).toBe('epilogue');
    }
  });
});
