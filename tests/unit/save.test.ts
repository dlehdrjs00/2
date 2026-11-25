import { describe, expect, it } from 'vitest';
import { advance, choose, newGameState, settle } from '../../src/engine/runner';
import { SaveManager, GAME_KEY, SAVE_SCHEMA, type SlotId } from '../../src/engine/save';
import { MemoryStore, openStore } from '../../src/engine/storage';
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from '../../src/engine/settings';
import type { GameState, Story } from '../../src/engine/types';
import { branchStory, miniStory, permissiveAssets } from './fixtures';

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

  it('알 수 없는 배경/스프라이트는 버리고 진행은 유지하며, 버린 내용을 안내 문구(notes)로 돌려준다(장면 진입 스냅샷이 없는 스키마 1 저장)', () => {
    const story = miniStory();
    const store = new MemoryStore(true);
    const strict = { ...permissiveAssets, hasBg: (b: string) => b !== 'gone', hasSprite: () => false };
    const sm = new SaveManager(store, story, strict);
    const { state } = play(story, ['a'], 1);
    state.stage.bg = 'gone' as never;
    delete state.sceneEntry;
    store.set('ashita.save.1', JSON.stringify({ schema: 1, game: GAME_KEY, storyVersion: 'x', savedAt: '', summary, state }));
    const r = sm.load('1');
    expect(r.status).toBe('ok');
    if (r.status === 'ok') {
      expect(r.data.state.stage.bg).toBe('black');
      expect(r.data.state.stage.chars).toEqual({});
      // 캐릭터 둘을 버려도 같은 문구는 한 번만
      expect(r.notes).toEqual(['배경 정보를 복원하지 못했어요', '캐릭터 그림 정보를 일부 복원하지 못했어요']);
    }
  });

  it('위치가 정확하면 버린 배경·캐릭터를 장면 진입 스냅샷부터 현재 대본으로 다시 실행해 채우고, 못 채운 것만 안내한다', () => {
    const story = miniStory();
    const store = new MemoryStore(true);
    // 에셋 이름이 바뀌어 저장된 배경('gone')과 osana 의 표정('renamed')을 못 찾는 상황. tenko 그림은 아예 없음
    const strict = {
      ...permissiveAssets,
      hasBg: (b: string) => b !== 'gone',
      hasSprite: (c: string, _o: string, _h: string, e: string) => c !== 'tenko' && e !== 'renamed',
    };
    const sm = new SaveManager(store, story, strict);
    const { state } = play(story, ['a'], 1);
    expect(state.stepId).toBe('c1.ch2');
    state.stage.bg = 'gone' as never;
    state.stage.chars.osana!.expr = 'renamed' as never;
    sm.write('1', state, summary);
    const r = sm.load('1');
    expect(r.status).toBe('ok');
    if (r.status === 'ok') {
      expect(r.data.state.stage.bg).toBe('classroom_day');
      expect(r.data.state.stage.chars.osana).toEqual({ pos: 'left', expr: 'smile', outfit: 'uniform', hair: 'default' });
      expect(r.data.state.stage.chars.tenko).toBeUndefined();
      expect(r.data.state.stage.order).toEqual(['osana']);
      expect(r.notes).toEqual(['캐릭터 그림 정보를 일부 복원하지 못했어요']);
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
    expect(fresh.points).toEqual({ osana: 0, tenko: 0, koharu: 0 });
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

describe('퀵저장·수동 30칸·썸네일용 무대 요약', () => {
  it('quick 슬롯과 30번 슬롯에 저장·불러오기가 되고, peek 이 무대 상태를 돌려준다', async () => {
    const { MANUAL_SLOTS } = await import('../../src/engine/save');
    expect(MANUAL_SLOTS).toBe(30);
    const story = miniStory();
    const store = new MemoryStore(true);
    const sm = new SaveManager(store, story, permissiveAssets);
    const { state } = play(story, ['a'], 1);
    expect(sm.write('quick', state, summary)).toBe(true);
    expect(sm.write('30', state, summary)).toBe(true);
    expect(sm.load('quick').status).toBe('ok');
    const p = sm.peek('30');
    expect(p.empty).toBe(false);
    if (!p.empty) {
      expect(p.stage?.bg).toBe('classroom_day');
      expect(Object.keys(p.stage?.chars ?? {})).toEqual(expect.arrayContaining(['osana', 'tenko']));
      expect(p.recover).toBeUndefined();
    }
  });

  it("'장면 처음부터' 복구가 필요한 저장도 peek 이 썸네일용 무대(불러오면 처음 보게 될 무대)와 recover 표시를 돌려준다", () => {
    const story = miniStory();
    const store = new MemoryStore(true);
    const sm = new SaveManager(store, story, permissiveAssets);
    const { state } = play(story, ['a'], 1);
    expect(sm.write('quick', { ...state, stepId: `${state.stepId}_deleted` }, summary)).toBe(true);
    const loaded = sm.load('quick');
    expect(loaded.status).toBe('recoverable');
    const p = sm.peek('quick');
    expect(p).toMatchObject({ empty: false, broken: false, recover: true, summary });
    if (!p.empty && loaded.status === 'recoverable') {
      // 불러온 복구 상태를 첫 문장까지 진행했을 때의 무대와 같아야 한다(빈 썸네일이 아니게)
      const st = JSON.parse(JSON.stringify(loaded.data.state)) as GameState;
      settle(story, st);
      expect(p.stage).toEqual(st.stage);
      expect(p.stage?.bg).toBeTruthy();
    }
    // peek 은 저장 데이터를 바꾸지 않는다(다시 불러와도 같은 복구 결과)
    expect(sm.load('quick')).toEqual(loaded);
  });

  it('latestManual 은 savedAt 을 시각으로 비교하고, 시각으로 읽을 수 없는 savedAt 은 건너뛴다', () => {
    const story = miniStory();
    const store = new MemoryStore(true);
    const sm = new SaveManager(store, story, permissiveAssets);
    const { state } = play(story, ['a'], 1);
    const put = (slot: SlotId, savedAt: string) => {
      expect(sm.write(slot, state, summary)).toBe(true);
      const key = sm.slotKey(slot);
      const data = JSON.parse(store.get(key)!) as Record<string, unknown>;
      store.set(key, JSON.stringify({ ...data, savedAt }));
    };
    expect(sm.latestManual()).toBeNull();
    // 문자열로는 1번이 더 커 보이지만 시각으로는 01:00Z 라 2번(05:00Z)보다 이르다
    put('1', '2026-11-23T10:00:00+09:00');
    put('2', '2026-11-23T05:00:00Z');
    // 문자열 비교라면 가장 '커서' 뽑혔을 값들 — 시각이 아니므로 건너뛴다
    put('3', 'zzz-not-a-date');
    put('4', '');
    expect(sm.latestManual()).toBe('2');
    // 시각이 없는 슬롯만 남으면 안내할 슬롯이 없다
    sm.remove('1');
    sm.remove('2');
    expect(sm.latestManual()).toBeNull();
  });

  it('새 설정 항목(글자 크기·빛망울)은 범위로 보정되고 기본값이 있다', () => {
    const store = new MemoryStore(true);
    store.set('ashita.settings', JSON.stringify({ textScale: 9, particles: -1, windowOpacity: 10 }));
    const s = loadSettings(store);
    expect(s.textScale).toBe(2);
    expect(s.particles).toBe(0);
    expect(s.windowOpacity).toBe(40);
    expect(loadSettings(new MemoryStore(true))).toMatchObject({ textScale: 0, particles: 1 });
  });
});

// ---------------------------------------------------------------------------
// 코하루 확장(스키마 3): 구판 저장 이전·신판 왕복·한 번만 반영
// ---------------------------------------------------------------------------

/** picks 를 순서대로 고르며 진행. stopAt(블로킹 step id)에 닿으면 멈춘다 */
function playTo(story: Story, picks: readonly string[], stopAt?: string) {
  const state = newGameState(story);
  let r = settle(story, state);
  let i = 0;
  while (r.step.t !== 'ending' && r.step.id !== stopAt) {
    r = r.step.t === 'choice' ? choose(story, state, picks[i++])! : advance(story, state)!;
  }
  return { state, r };
}

/** 이어서 엔딩까지 진행한 결과 */
function finish(story: Story, state: GameState, picks: readonly string[]) {
  let r = settle(story, state);
  let i = 0;
  const ids: string[] = [];
  while (r.step.t !== 'ending') {
    ids.push(r.step.id);
    r = r.step.t === 'choice' ? choose(story, state, picks[i++])! : advance(story, state)!;
  }
  return { ids, route: state.route, points: { ...state.points }, flags: { ...state.flags }, ending: r.step.ending };
}

/** 구판 점수 규칙(모든 개인 선택 +1, 함께 없음)으로 센 점수 */
function oldPoints(choices: Record<string, string>) {
  const p = { osana: 0, tenko: 0 };
  for (const v of Object.values(choices)) {
    if (v === 'a') p.osana++;
    if (v === 'b') p.tenko++;
  }
  return p;
}

/**
 * 현재 대본으로 위치까지 진행한 상태를 구판(스키마 1·2) 저장 형식으로 바꿔 넣는다:
 * 해금 플래그·코하루 점수가 없고 점수는 구판 규칙. 스키마 1 은 장면 진입 스냅샷도 없다.
 */
function putLegacy(store: MemoryStore, schema: 1 | 2, state: GameState, patch: Partial<GameState> = {}) {
  const old = JSON.parse(JSON.stringify({ ...state, ...patch })) as Record<string, any>;
  old.points = oldPoints(old.choices);
  delete old.flags['kh.met'];
  if (old.sceneEntry) {
    old.sceneEntry.points = oldPoints(old.sceneEntry.choices);
    delete old.sceneEntry.flags['kh.met'];
  }
  if (schema === 1) delete old.sceneEntry;
  store.set('ashita.save.1', JSON.stringify({ schema, game: GAME_KEY, storyVersion: '0.1.0', savedAt: '2026-11-01T00:00:00.000Z', summary, state: old }));
}

describe('구판(스키마 1·2) 저장 이전', () => {
  it.each([1, 2] as const)('스키마 %i 공통 중간 저장: 선택 기록으로 점수·최근 히로인을 다시 계산하고 해금 플래그는 두지 않는다', (schema) => {
    const story = branchStory();
    const store = new MemoryStore(true);
    const { state } = playTo(story, ['a', 'b'], 'c6.010');
    // 구판에서는 최근 히로인이 잘못 남아 있을 수 있다 → 선택 시간순으로 다시 계산
    putLegacy(store, schema, state, { lastHeroine: 'osana' });
    const r = new SaveManager(store, story, permissiveAssets).load('1');
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    const st = r.data.state;
    expect(r.data.schema).toBe(SAVE_SCHEMA);
    expect(st.points).toEqual({ osana: 2, tenko: 2, koharu: 0 });
    expect(st.lastHeroine).toBe('tenko');
    expect('kh.met' in st.flags).toBe(false);
    if (schema === 2) {
      expect(st.sceneEntry?.sceneId).toBe('c6_rain');
      expect(st.sceneEntry?.points).toEqual({ osana: 2, tenko: 2, koharu: 0 });
      expect('kh.met' in (st.sceneEntry?.flags ?? {})).toBe(false);
    } else expect(st.sceneEntry).toBeUndefined();
    // 새 규칙대로 판정: c6 b(+2) · c7 a(+3) → 5/4 해금, 코하루 4.5
    const done = finish(story, st, ['b', 'a', 'k', 'k', 'a']);
    expect(done.flags['kh.met']).toBe(true);
    expect(done.ids).toContain('c7.k10');
    expect(done.points).toEqual({ osana: 8, tenko: 4, koharu: 10.5 });
    expect(done.route).toBe('koharu');
  });

  it.each([1, 2] as const)('스키마 %i, c7.ch 를 고른 직후(반응 대사) 저장: 플래그 없이 이어져 노을길 전에 새 규칙으로 판정한다', (schema) => {
    const story = branchStory();
    const store = new MemoryStore(true);
    const { state } = playTo(story, ['a', 'b', 'b', 'a'], 'c7.a10');
    putLegacy(store, schema, state);
    const r = new SaveManager(store, story, permissiveAssets).load('1');
    if (r.status !== 'ok') throw new Error(r.status);
    const st = r.data.state;
    expect(st.points).toEqual({ osana: 5, tenko: 4, koharu: 0 });
    expect('kh.met' in st.flags).toBe(false);
    const done = finish(story, st, ['a', 'b', 'k']);
    expect(done.flags['kh.met']).toBe(true);
    expect(done.ids.indexOf('c7.k10')).toBeLessThan(done.ids.indexOf('c7.j20'));
    expect(done.ids).toContain('c8r.010');
    // 5/4 → 코하루 4.5, 후반 a·b·k → 8/7/7.5 → 아카네
    expect(done.points).toEqual({ osana: 8, tenko: 7, koharu: 7.5 });
    expect(done.route).toBe('osana');
  });

  it.each([1, 2] as const)('스키마 %i, 노을길(c7.j20~j40) 저장: 첫 만남을 소급하지 않고 기존 두 히로인 경로로 이어진다', (schema) => {
    const story = branchStory();
    for (const at of ['c7.j20', 'c7.j30', 'c7.j40']) {
      const store = new MemoryStore(true);
      // 새 규칙이면 해금됐을 선택(5/4)이지만, 구판 저장이라 만남을 거치지 않았다
      const { state } = playTo(story, ['a', 'b', 'b', 'a'], at);
      putLegacy(store, schema, state, { stage: { ...state.stage } });
      const r = new SaveManager(store, story, permissiveAssets).load('1');
      if (r.status !== 'ok') throw new Error(`${at}: ${r.status}`);
      const st = r.data.state;
      expect(st.stepId).toBe(at);
      expect(st.flags['kh.met']).toBe(false);
      expect(st.points).toEqual({ osana: 5, tenko: 4, koharu: 0 });
      if (schema === 2) expect(st.sceneEntry?.flags['kh.met']).toBe(false);
      const peek = JSON.parse(JSON.stringify(st)) as GameState;
      const done = finish(story, peek, ['a', 'b', 'c']);
      expect(done.ids).not.toContain('c8r.010');
      expect(done.ids).toContain('c8.ch');
      expect(done.points).toEqual({ osana: 9, tenko: 8, koharu: 0 });
      expect(done.route).toBe('osana');
      // 미해금 경로이므로 후반 선택지에는 함께(c)가 보이고 k 는 숨는다
      const again = JSON.parse(JSON.stringify(st)) as GameState;
      let rr = settle(story, again);
      while (rr.step.t !== 'choice') rr = advance(story, again)!;
      expect(rr.step.id).toBe('c8.ch');
      expect(choose(story, JSON.parse(JSON.stringify(again)) as GameState, 'k')).toBeNull();
    }
  });

  it.each([1, 2] as const)('스키마 %i, 이미 개별 루트에 들어간 저장: 위치·루트를 그대로 두고 해금 플래그는 false', (schema) => {
    const story = branchStory();
    for (const route of ['osana', 'tenko'] as const) {
      const store = new MemoryStore(true);
      const picks = route === 'osana' ? ['a', 'a', 'b', 'a', 'a', 'a', 'a'] : ['b', 'b', 'a', 'b', 'b', 'b', 'b'];
      const { state } = playTo(story, picks, route === 'osana' ? 'o1.010' : 't1.010');
      expect(state.route).toBe(route);
      // 구판에는 후반 선택이 없었다
      const choices = Object.fromEntries(Object.entries(state.choices).filter(([k]) => ['c3.ch', 'c4.ch', 'c6.ch', 'c7.ch'].includes(k)));
      const entry = state.sceneEntry ? { ...state.sceneEntry, choices } : undefined;
      putLegacy(store, schema, state, { choices, sceneEntry: entry });
      const r = new SaveManager(store, story, permissiveAssets).load('1');
      if (r.status !== 'ok') throw new Error(r.status);
      const st = r.data.state;
      expect(st.route).toBe(route);
      expect(st.sceneId).toBe(route === 'osana' ? 'o1_shop' : 't1_cats');
      expect(st.flags['kh.met']).toBe(false);
      if (schema === 2) expect(st.sceneEntry?.flags['kh.met']).toBe(false);
      const done = finish(story, st, []);
      expect(done.route).toBe(route);
      expect(done.ending).toBe(route);
    }
  });
});

describe('신판(스키마 3) 저장', () => {
  it('해금 여부·선택 순서·소수 점수·위치를 그대로 복원하고, 이후 진행이 원본과 같다', () => {
    const story = branchStory();
    const store = new MemoryStore(true);
    const sm = new SaveManager(store, story, permissiveAssets);
    const { state } = playTo(story, ['a', 'b', 'b', 'a'], 'c8.ch');
    expect(state.points.koharu).toBe(4.5);
    sm.write('1', state, summary);
    const r = new SaveManager(store, story, permissiveAssets).load('1');
    if (r.status !== 'ok') throw new Error(r.status);
    expect(r.data.schema).toBe(3);
    expect(r.data.state).toEqual(state);
    expect(Object.keys(r.data.state.choices)).toEqual(['c3.ch', 'c4.ch', 'c6.ch', 'c7.ch']);
    expect(r.data.state.flags['kh.met']).toBe(true);
    const a = finish(story, JSON.parse(JSON.stringify(state)) as GameState, ['k', 'k', 'a']);
    const b = finish(story, r.data.state, ['k', 'k', 'a']);
    expect(b).toEqual(a);
    expect(b.route).toBe('koharu');
    expect(b.points).toEqual({ osana: 8, tenko: 4, koharu: 10.5 });
  });

  it('미해금 저장(kh.met = false)도 그대로 복원된다', () => {
    const story = branchStory();
    const store = new MemoryStore(true);
    const { state } = playTo(story, ['a', 'a', 'a', 'b', 'c'], 'c8.020');
    expect(state.points).toEqual({ osana: 7, tenko: 4, koharu: 0 });
    new SaveManager(store, story, permissiveAssets).write('1', state, summary);
    const r = new SaveManager(store, story, permissiveAssets).load('1');
    if (r.status !== 'ok') throw new Error(r.status);
    expect(r.data.state.flags['kh.met']).toBe(false);
    expect(r.data.state).toEqual(state);
  });

  it('점수: 코하루 점수가 없으면 0, 소수는 그대로, 기본 히로인 점수가 깨졌으면 손상', () => {
    const story = branchStory();
    const store = new MemoryStore(true);
    const sm = new SaveManager(store, story, permissiveAssets);
    const base = { schema: SAVE_SCHEMA, game: GAME_KEY, storyVersion: 'x', savedAt: '', summary, state: playTo(story, [], 'c3.010').state };
    store.set('ashita.save.1', JSON.stringify({ ...base, state: { ...base.state, points: { osana: 2.5, tenko: 1 } } }));
    const r = sm.load('1');
    expect(r.status === 'ok' && r.data.state.points).toEqual({ osana: 2.5, tenko: 1, koharu: 0 });
    store.set('ashita.save.1', JSON.stringify({ ...base, state: { ...base.state, points: { osana: 1, tenko: 2, koharu: 4.5 } } }));
    const r2 = sm.load('1');
    expect(r2.status === 'ok' && r2.data.state.points).toEqual({ osana: 1, tenko: 2, koharu: 4.5 });
    store.set('ashita.save.1', JSON.stringify({ ...base, state: { ...base.state, points: { osana: 'x', tenko: 2 } } }));
    expect(sm.load('1')).toMatchObject({ status: 'error', reason: 'corrupt' });
    store.set('ashita.save.1', JSON.stringify({ ...base, state: { ...base.state, points: { osana: 1, tenko: 2, koharu: 'x' } } }));
    expect(sm.load('1')).toMatchObject({ status: 'error', reason: 'corrupt' });
  });

  it('선택 직후 저장→불러오기: 그 선택의 점수가 두 번 들어가지 않는다', () => {
    const story = branchStory();
    const store = new MemoryStore(true);
    const sm = new SaveManager(store, story, permissiveAssets);
    const picks = ['c', 'c', 'c', 'c', 'a', 'b', 'k'];
    const whole = finish(story, newGameState(story), picks);
    // c7 '함께' 직후(반응 대사), c8 개인 선택 직후(다음 대사) 두 곳에서 끊어 본다
    for (const [stop, used] of [
      ['c7.c10', 4],
      ['c8.020', 5],
    ] as const) {
      const { state } = playTo(story, picks, stop);
      const before = structuredClone(state.points);
      sm.write('1', state, summary);
      const r = sm.load('1');
      if (r.status !== 'ok') throw new Error(r.status);
      settle(story, r.data.state);
      expect(r.data.state.points).toEqual(before);
      const rest = finish(story, r.data.state, picks.slice(used));
      expect(rest.points).toEqual(whole.points);
      expect(rest.route).toBe('koharu');
    }
    expect(whole.points).toEqual({ osana: 7, tenko: 7, koharu: 7 });
  });

  it('CG 표시 중 저장→불러오기: CG 와 점수·해금이 그대로이고, 불러온 직후 CG 이벤트가 다시 나지 않아 관람 기록은 한 번만', () => {
    const story = branchStory();
    const store = new MemoryStore(true);
    const sm = new SaveManager(store, story, permissiveAssets);
    const picks = ['a', 'b', 'b', 'a', 'k', 'k', 'a'];
    const whole = finish(story, newGameState(story), picks);
    const { state, r } = playTo(story, picks, 'c7.k20');
    expect(r.events).toContainEqual({ kind: 'cg', cg: 'kh_meet' });
    sm.markCg('kh_meet'); // 화면이 cg 이벤트를 받고 관람 기록
    sm.write('1', state, summary);
    const sm2 = new SaveManager(store, story, permissiveAssets);
    const l = sm2.load('1');
    if (l.status !== 'ok') throw new Error(l.status);
    const st = l.data.state;
    expect(st.stage.cg).toBe('kh_meet');
    expect(st.flags['kh.met']).toBe(true);
    expect(st.points).toEqual({ osana: 5, tenko: 4, koharu: 4.5 });
    const again = settle(story, st);
    expect(again.step.id).toBe('c7.k20');
    expect(again.events).toEqual([]);
    sm2.markCg('kh_meet');
    sm2.flushGlobal();
    expect(new SaveManager(store, story, permissiveAssets).cgsSeenList()).toEqual(['kh_meet']);
    const rest = finish(story, st, picks.slice(4));
    expect(rest.points).toEqual(whole.points);
    expect(rest.route).toBe(whole.route);
  });

  it('전역 기록은 코하루 엔딩과 kh_* CG 를 받아들인다', () => {
    const story = branchStory();
    const store = new MemoryStore(true);
    const sm = new SaveManager(store, story, permissiveAssets);
    sm.markEnding('koharu');
    sm.markCg('kh_date');
    sm.flushGlobal();
    const fresh = new SaveManager(store, story, permissiveAssets);
    expect(fresh.endingsReached()).toEqual(['koharu']);
    expect(fresh.hasSeenCg('kh_date')).toBe(true);
  });
});
