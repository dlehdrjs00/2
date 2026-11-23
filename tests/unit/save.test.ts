import { describe, expect, it } from 'vitest';
import { advance, choose, newGameState, settle } from '../../src/engine/runner';
import { SaveManager, GAME_KEY, SAVE_SCHEMA } from '../../src/engine/save';
import { MemoryStore, openStore } from '../../src/engine/storage';
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from '../../src/engine/settings';
import type { GameState, Story } from '../../src/engine/types';
import { miniStory, permissiveAssets } from './fixtures';

const summary = { sceneTitle: 't', text: 'x', route: null };

function play(story: Story, picks: string[], stopAtChoice: number) {
  const state = newGameState(story);
  let r = settle(story, state);
  let n = 0;
  while (r.step.t !== 'ending') {
    if (r.step.t === 'choice') {
      if (n === stopAtChoice) break;
      r = choose(story, state, picks[n++] ?? 'a')!;
    } else r = advance(story, state)!;
  }
  return { state, r };
}

/** 저장 → 새 매니저로 불러오기 → 남은 진행이 원본과 같은지 */
function continueTrace(story: Story, state: GameState, picks: string[], from: number) {
  const ids: string[] = [];
  let r = settle(story, state);
  let n = from;
  for (;;) {
    ids.push(r.step.id);
    if (r.step.t === 'ending') break;
    if (r.step.t === 'choice') r = choose(story, state, state.route === null ? picks[n++] : 'a')!;
    else r = advance(story, state)!;
  }
  return { ids, route: state.route, points: { ...state.points } };
}

describe('저장·불러오기', () => {
  it.each([0, 1, 2, 3, 4])('선택지 %i 시점에서 저장 후 불러와도 이후 진행·루트가 동일하다', (k) => {
    const story = miniStory();
    const picks = ['a', 'b', 'b', 'a'];
    const { state } = play(story, picks, k);
    const store = new MemoryStore(true);
    const sm = new SaveManager(store, story, permissiveAssets);
    expect(sm.write('1', state, summary)).toBe(true);

    const loaded = new SaveManager(store, story, permissiveAssets).load('1');
    expect(loaded.status).toBe('ok');
    if (loaded.status !== 'ok') return;
    expect(loaded.data.schema).toBe(SAVE_SCHEMA);
    expect(loaded.data.state).toEqual(state);

    const original = continueTrace(story, JSON.parse(JSON.stringify(state)), picks, k);
    const restored = continueTrace(story, loaded.data.state, picks, k);
    expect(restored).toEqual(original);
  });

  it('대사 도중(루트 진입 후·후일담) 저장도 정확한 문장으로 복원된다', () => {
    const story = miniStory();
    const state = newGameState(story);
    let r = settle(story, state);
    const store = new MemoryStore(true);
    const sm = new SaveManager(store, story, permissiveAssets);
    const checkpoints: string[] = [];
    while (r.step.t !== 'ending') {
      if (r.step.t === 'say' && (state.sceneId === 'o1' || state.sceneId === 'o2')) {
        sm.write('2', state, summary);
        const l = sm.load('2');
        expect(l.status).toBe('ok');
        if (l.status === 'ok') {
          expect(l.data.state.stepId).toBe(r.step.id);
          expect(l.data.state.route).toBe('osana');
          checkpoints.push(r.step.id);
        }
      }
      r = r.step.t === 'choice' ? choose(story, state, 'a')! : advance(story, state)!;
    }
    expect(checkpoints).toEqual(['o1.010', 'o2.010']);
  });

  it('손상된 JSON 은 예외 없이 오류 결과를 준다', () => {
    const store = new MemoryStore(true);
    store.set('ashita.save.1', '{"schema":1, broken');
    const r = new SaveManager(store, miniStory(), permissiveAssets).load('1');
    expect(r).toMatchObject({ status: 'error', reason: 'corrupt' });
  });

  it('다른 게임·미래 스키마·핵심 필드 누락은 불러오지 않는다', () => {
    const story = miniStory();
    const store = new MemoryStore(true);
    const sm = new SaveManager(store, story, permissiveAssets);
    const base = { schema: SAVE_SCHEMA, game: GAME_KEY, storyVersion: 'x', savedAt: '', summary, state: newGameState(story) };
    store.set('ashita.save.1', JSON.stringify({ ...base, game: 'other' }));
    expect(sm.load('1')).toMatchObject({ status: 'error', reason: 'foreign' });
    store.set('ashita.save.1', JSON.stringify({ ...base, schema: SAVE_SCHEMA + 1 }));
    expect(sm.load('1')).toMatchObject({ status: 'error', reason: 'schema' });
    store.set('ashita.save.1', JSON.stringify({ ...base, state: { ...base.state, points: null } }));
    expect(sm.load('1')).toMatchObject({ status: 'error', reason: 'corrupt' });
    store.set('ashita.save.1', JSON.stringify({ ...base, state: { ...base.state, sceneId: 'deleted-scene' } }));
    expect(sm.load('1')).toMatchObject({ status: 'error', reason: 'missing-scene' });
  });

  it('루트 장면인데 루트 정보가 다르면(혼입) 거부한다', () => {
    const story = miniStory();
    const store = new MemoryStore(true);
    const sm = new SaveManager(store, story, permissiveAssets);
    const st = { ...newGameState(story), sceneId: 't1', stepId: 't1.010', route: 'osana' as const };
    sm.write('1', st, summary);
    expect(sm.load('1')).toMatchObject({ status: 'error', reason: 'corrupt' });
  });

  it('문장이 삭제되어 위치를 못 찾으면 장면 처음부터 복구를 제안한다', () => {
    const story = miniStory();
    const store = new MemoryStore(true);
    const sm = new SaveManager(store, story, permissiveAssets);
    const st = { ...newGameState(story), stepId: 'c1.999-removed' };
    sm.write('1', st, summary);
    const r = sm.load('1');
    expect(r.status).toBe('recoverable');
    if (r.status === 'recoverable') {
      expect(r.data.state.sceneId).toBe('c1');
      expect(r.data.state.stepId).toBe(story.scenes.c1.steps[0].id);
      // 복구 상태로 실제 진행이 가능해야 한다
      expect(settle(story, r.data.state).step.t).toBe('say');
    }
  });

  it('알 수 없는 배경/스프라이트는 버리고 진행은 유지한다', () => {
    const story = miniStory();
    const store = new MemoryStore(true);
    const strict = { ...permissiveAssets, hasBg: (b: string) => b !== 'gone', hasSprite: (c: string) => c !== 'tenko' };
    const sm = new SaveManager(store, story, strict);
    const { state } = play(story, ['a'], 1);
    state.stage.bg = 'gone' as never;
    sm.write('1', state, summary);
    const r = sm.load('1');
    expect(r.status).toBe('ok');
    if (r.status === 'ok') {
      expect(r.data.state.stage.bg).toBe('black');
      expect(r.data.state.stage.chars.tenko).toBeUndefined();
      expect(r.data.state.stage.chars.osana).toBeDefined();
      expect(r.notes.length).toBeGreaterThan(0);
    }
  });

  it('읽은 대사 기록은 새 게임과 매니저 재생성 후에도 유지되고, 새 게임 상태에는 이전 루트가 남지 않는다', () => {
    const story = miniStory();
    const store = new MemoryStore(true);
    const sm = new SaveManager(store, story, permissiveAssets);
    const { state } = play(story, ['b', 'b', 'b', 'b'], 99);
    expect(state.route).toBe('tenko');
    sm.markRead('c1.010');
    sm.markEnding('tenko');
    sm.flushGlobal();

    const sm2 = new SaveManager(store, story, permissiveAssets);
    expect(sm2.isRead('c1.010')).toBe(true);
    expect(sm2.endingsReached()).toEqual(['tenko']);
    const fresh = newGameState(story);
    expect(fresh.route).toBeNull();
    expect(fresh.points).toEqual({ osana: 0, tenko: 0 });
    expect(fresh.lastHeroine).toBeNull();
    expect(fresh.choices).toEqual({});
  });

  it('전역 기록이 손상돼도 빈 기록으로 계속한다', () => {
    const store = new MemoryStore(true);
    store.set('ashita.global', 'not json');
    const sm = new SaveManager(store, miniStory(), permissiveAssets);
    expect(sm.readCount()).toBe(0);
  });
});

describe('저장소·설정', () => {
  it('localStorage 접근이 막혀도 메모리 저장소로 동작한다', () => {
    const orig = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError');
      },
    });
    try {
      const s = openStore();
      expect(s.persistent).toBe(false);
      s.set('k', 'v');
      expect(s.get('k')).toBe('v');
    } finally {
      if (orig) Object.defineProperty(globalThis, 'localStorage', orig);
      else delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });

  it('설정 값은 범위를 벗어나면 보정된다', () => {
    const store = new MemoryStore(true);
    store.set('ashita.settings', JSON.stringify({ textSpeed: 99, bgmVolume: -5, sfxVolume: 'abc' }));
    const s = loadSettings(store);
    expect(s.textSpeed).toBe(10);
    expect(s.bgmVolume).toBe(0);
    expect(s.sfxVolume).toBe(DEFAULT_SETTINGS.sfxVolume);
    saveSettings(store, { ...s, autoSpeed: 3 });
    expect(loadSettings(store).autoSpeed).toBe(3);
  });
});
