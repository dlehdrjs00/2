/** 이벤트 CG: 무대 상태·배경 전환 시 자동 해제·저장 복원·본 CG 기록 */
import { describe, expect, it } from 'vitest';
import type { Story } from '../../src/engine/types';
import { advance, newGameState, settle } from '../../src/engine/runner';
import { bg, cg, ending, mono, scene } from '../../src/engine/dsl';
import { SaveManager } from '../../src/engine/save';
import { MemoryStore } from '../../src/engine/storage';
import { validateStory } from '../../src/engine/validate';
import { permissiveAssets } from './fixtures';

function cgStory(): Story {
  const s = scene({ id: 'o1', title: 'CG', route: 'osana', part: 'epilogue' }, [
    bg('road_night', 'black'),
    mono('x.010', 'CG 전'),
    cg('fireworks_osana'),
    mono('x.020', 'CG 표시 중'),
    bg('riverbank_night'),
    mono('x.030', '장소가 바뀌면 CG 는 걷힌다'),
    cg('homeward_osana'),
    mono('x.040', '다시 CG'),
    cg(null),
    mono('x.050', '직접 걷기'),
    ending('x.end', 'osana'),
  ]);
  return {
    version: 't',
    start: 'o1',
    scenes: { o1: s },
    endings: { osana: { id: 'osana', heroine: 'osana', title: 'A' }, tenko: { id: 'tenko', heroine: 'tenko', title: 'B' } },
  };
}

describe('이벤트 CG', () => {
  it('cg 명령은 무대 상태와 이벤트를 남기고, bg 명령은 CG 를 먼저 걷는다', () => {
    const story = cgStory();
    const st = newGameState(story);
    st.route = 'osana';
    let r = settle(story, st);
    expect(st.stage.cg ?? null).toBeNull();
    r = advance(story, st)!;
    expect(r.step.id).toBe('x.020');
    expect(st.stage.cg).toBe('fireworks_osana');
    expect(r.events).toContainEqual({ kind: 'cg', cg: 'fireworks_osana' });
    r = advance(story, st)!;
    expect(r.step.id).toBe('x.030');
    expect(st.stage.cg).toBeNull();
    const kinds = r.events.map((e) => e.kind);
    expect(kinds.indexOf('cg')).toBeLessThan(kinds.indexOf('bg'));
    r = advance(story, st)!;
    expect(st.stage.cg).toBe('homeward_osana');
    r = advance(story, st)!;
    expect(r.step.id).toBe('x.050');
    expect(st.stage.cg).toBeNull();
  });

  it('CG 가 떠 있는 위치에서 저장·불러오면 CG 가 복원되고, 모르는 CG 는 조용히 버린다', () => {
    const story = cgStory();
    const st = newGameState(story);
    st.route = 'osana';
    settle(story, st);
    advance(story, st);
    const store = new MemoryStore(true);
    const known = new SaveManager(store, story, { ...permissiveAssets, hasCg: (id: string) => id === 'fireworks_osana' });
    known.write('1', st, { sceneTitle: '', text: '', route: 'osana' });
    const ok = known.load('1');
    expect(ok.status).toBe('ok');
    if (ok.status === 'ok') expect(ok.data.state.stage.cg).toBe('fireworks_osana');

    const strict = new SaveManager(store, story, { ...permissiveAssets, hasCg: () => false });
    const dropped = strict.load('1');
    expect(dropped.status).toBe('ok');
    if (dropped.status === 'ok') {
      expect(dropped.data.state.stage.cg ?? null).toBeNull();
      expect(dropped.data.state.stepId).toBe('x.020');
    }
  });

  it('본 CG 기록은 저장소에 남고, 다른 탭 기록과 합쳐진다', () => {
    const story = cgStory();
    const store = new MemoryStore(true);
    const a = new SaveManager(store, story, permissiveAssets);
    const b = new SaveManager(store, story, permissiveAssets);
    a.markCg('fireworks_osana');
    b.markCg('homeward_osana');
    const c = new SaveManager(store, story, permissiveAssets);
    expect(new Set(c.cgsSeenList())).toEqual(new Set(['fireworks_osana', 'homeward_osana']));
    expect(c.hasSeenCg('fireworks_osana')).toBe(true);
  });

  it('검증기는 없는 CG 를 오류로 잡는다', () => {
    const rep = validateStory(cgStory(), { ...permissiveAssets, hasCg: (id: string) => id !== 'homeward_osana' }, {});
    expect(rep.errors.join('\n')).toMatch(/homeward_osana/);
  });
});
