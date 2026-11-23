/** 실제 대본 데이터 검사: 연결, 에셋 파일, 전 분기, 루트 규칙, 모든 위치에서의 저장·불러오기 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { STORY } from '../../src/story';
import { manifestChecker } from '../../src/story/checker';
import { TEXT_VARS } from '../../src/story/config';
import { validateStory } from '../../src/engine/validate';
import { advance, choose, decideRoute, newGameState, settle } from '../../src/engine/runner';
import { SaveManager } from '../../src/engine/save';
import { MemoryStore } from '../../src/engine/storage';
import type { GameState, HeroineId } from '../../src/engine/types';

const checker = manifestChecker((p) => existsSync(resolve(__dirname, '../../public', p)));
const report = validateStory(STORY, checker, TEXT_VARS);

describe('실제 대본', () => {
  it('검증 오류가 없다(연결·id·에셋 파일·치환 키·전 분기 시뮬레이션)', () => {
    expect(report.errors).toEqual([]);
  });

  it('두 히로인의 엔딩에 모두 도달할 수 있다', () => {
    const endings = new Set(report.paths.map((p) => p.ending));
    expect(endings).toEqual(new Set(['osana', 'tenko']));
  });

  it('공통 선택지는 3~4회이고, 모든 조합에서 규칙대로 루트가 정해진다', () => {
    const commonChoices = Object.values(STORY.scenes)
      .filter((s) => s.route === 'common')
      .flatMap((s) => s.steps.filter((x) => x.t === 'choice'));
    expect(commonChoices.length).toBeGreaterThanOrEqual(3);
    expect(commonChoices.length).toBeLessThanOrEqual(4);
    for (const p of report.paths) expect(p.route).toBe(p.expectedRoute);
  });

  it('동점 조합은 가장 최근 히로인 선택을 따른다', () => {
    let ties = 0;
    for (const p of report.paths) {
      const pts: Record<HeroineId, number> = { osana: 0, tenko: 0 };
      let last: HeroineId | null = null;
      for (const c of p.choices) {
        const scene = Object.values(STORY.scenes).find((s) => s.steps.some((x) => x.id === c.choice))!;
        if (scene.route !== 'common' || !c.heroine) continue;
        pts[c.heroine]++;
        last = c.heroine;
      }
      if (pts.osana === pts.tenko) {
        ties++;
        expect(p.route).toBe(last);
      }
      expect(p.route).toBe(decideRoute(pts, last));
    }
    expect(ties).toBeGreaterThan(0);
  });

  it.each(['osana', 'tenko'] as const)('%s 루트: 모든 블로킹 위치에서 저장→불러오기 후 진행이 원본과 같다', (route) => {
    const path = report.paths.find((p) => p.route === route)!;
    const pickFor = (_state: GameState, choiceId: string, options: { id: string }[]) =>
      path.choices.find((c) => c.choice === choiceId)?.option ?? options[0].id;

    // 원본 진행 기록
    const trace: Array<{ id: string; state: string }> = [];
    const st = newGameState(STORY);
    let r = settle(STORY, st);
    for (;;) {
      trace.push({ id: r.step.id, state: JSON.stringify(st) });
      if (r.step.t === 'ending') break;
      r = r.step.t === 'choice' ? choose(STORY, st, pickFor(st, r.step.id, r.step.options))! : advance(STORY, st)!;
    }
    expect(st.route).toBe(route);

    const store = new MemoryStore(true);
    const sm = new SaveManager(store, STORY, checker);
    let checkedEpilogue = false;
    let checkedChoice = false;
    for (let i = 0; i < trace.length - 1; i++) {
      const saved = JSON.parse(trace[i].state) as GameState;
      sm.write('1', saved, { sceneTitle: '', text: '', route: saved.route });
      const loaded = sm.load('1');
      expect(loaded.status, `위치 ${trace[i].id}`).toBe('ok');
      if (loaded.status !== 'ok') return;
      const s2 = loaded.data.state;
      let r2 = settle(STORY, s2);
      expect(r2.step.id).toBe(trace[i].id);
      if (r2.step.t === 'choice') checkedChoice = true;
      if (STORY.scenes[s2.sceneId].part === 'epilogue') checkedEpilogue = true;
      // 다음 몇 걸음이 원본과 같은지
      for (let k = i + 1; k < Math.min(trace.length, i + 4); k++) {
        r2 = r2.step.t === 'choice' ? choose(STORY, s2, pickFor(s2, r2.step.id, r2.step.options))! : advance(STORY, s2)!;
        expect(r2.step.id).toBe(trace[k].id);
      }
    }
    expect(checkedChoice).toBe(true);
    expect(checkedEpilogue).toBe(true);
  });

  it('고백은 후일담에만 있고, 본편 마지막에는 엔딩이 없다', () => {
    for (const s of Object.values(STORY.scenes)) {
      const hasEnding = s.steps.some((x) => x.t === 'ending');
      if (hasEnding) expect(s.part).toBe('epilogue');
    }
  });
});
