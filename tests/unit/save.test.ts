import { describe, expect, it } from 'vitest';
import { advance, choose, newGameState, settle, visibleOptions } from '../../src/engine/runner';
import {
  GAME_KEY,
  GLOBAL_RECORD_KEYS,
  isGlobalRecordKey,
  LEGACY_LATE_FLAG,
  markLegacyLate,
  SAVE_SCHEMA,
  SaveManager,
  type SlotId,
} from '../../src/engine/save';
import { MemoryStore, openStore } from '../../src/engine/storage';
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from '../../src/engine/settings';
import type { GameState, Story } from '../../src/engine/types';
import { STORY } from '../../src/story';
import { manifestChecker } from '../../src/story/checker';
import { branchStory, ENDINGS8, FORK_CHOICES, miniStory, permissiveAssets } from './fixtures';
import v3 from './fixtures/v3-saves.897ae1f.json';

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

  it('대사창 불투명도: 처음 플레이·깨진 설정은 기본 70%, 이미 저장된 값(예전 기본 82% 포함)은 그대로', () => {
    expect(DEFAULT_SETTINGS.windowOpacity).toBe(70);
    expect(loadSettings(new MemoryStore(true)).windowOpacity).toBe(70);
    const broken = new MemoryStore(true);
    broken.set('ashita.settings', '{not json');
    expect(loadSettings(broken).windowOpacity).toBe(70);
    // 항목이 빠진 예전 설정(다른 항목만 저장)도 기본 70%
    const partial = new MemoryStore(true);
    partial.set('ashita.settings', JSON.stringify({ schema: 1, textSpeed: 8 }));
    expect(loadSettings(partial)).toMatchObject({ textSpeed: 8, windowOpacity: 70 });
    for (const v of [82, 40, 55, 100]) {
      const store = new MemoryStore(true);
      saveSettings(store, { ...DEFAULT_SETTINGS, windowOpacity: v });
      expect(loadSettings(store).windowOpacity).toBe(v);
    }
  });
});

// ---------------------------------------------------------------------------
// 저장 스키마 4(여덟 엔딩): 구판(1·2)·스키마 3 이전, 왕복, 한 번만 반영, 전역 기록 보조 키
// ---------------------------------------------------------------------------

/** picks 를 순서대로 고르며 진행(모자라면 첫 보이는 옵션 = 결말 갈래는 축제 쪽). stopAt(블로킹 step id)에 닿으면 멈춘다 */
function playTo(story: Story, picks: readonly string[], stopAt?: string) {
  const state = newGameState(story);
  let r = settle(story, state);
  let i = 0;
  while (r.step.t !== 'ending' && r.step.id !== stopAt) {
    r = r.step.t === 'choice' ? choose(story, state, picks[i++] ?? r.step.options[0].id)! : advance(story, state)!;
  }
  return { state, r };
}

/** 이어서 엔딩까지 진행한 결과(picks 가 모자라면 첫 옵션) */
function finish(story: Story, state: GameState, picks: readonly string[]) {
  let r = settle(story, state);
  let i = 0;
  const ids: string[] = [];
  while (r.step.t !== 'ending') {
    ids.push(r.step.id);
    if (r.step.t === 'choice') {
      const pick = picks[i++] ?? r.step.options[0].id;
      const next = choose(story, state, pick);
      if (!next) throw new Error(`${r.step.id} 에서 ${pick} 불가`);
      r = next;
    } else r = advance(story, state)!;
  }
  return { ids, route: state.route, points: { ...state.points }, flags: { ...state.flags }, ending: r.step.ending };
}

/** 후반 h(히나)를 옵션 id b 로: 'ahk' → ['a','b','k'] */
const late = (x: string) => [...x].map((c) => (c === 'h' ? 'b' : c));

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
  delete old.flags['ep3.done'];
  if (old.sceneEntry) {
    old.sceneEntry.points = oldPoints(old.sceneEntry.choices);
    delete old.sceneEntry.flags['kh.met'];
    delete old.sceneEntry.flags['ep3.done'];
  }
  if (schema === 1) delete old.sceneEntry;
  store.set('ashita.save.1', JSON.stringify({ schema, game: GAME_KEY, storyVersion: '0.1.0', savedAt: '2026-11-01T00:00:00.000Z', summary, state: old }));
}

/** 이 상태를 스키마 3(897ae1f 형식, 루트는 히로인만) 저장으로 넣는다 */
function putSchema3(store: MemoryStore, state: GameState, slot = '1') {
  store.set(`ashita.save.${slot}`, JSON.stringify({ schema: 3, game: GAME_KEY, storyVersion: '0.2.0', savedAt: '2026-11-20T00:00:00.000Z', summary, state }));
}

/**
 * 897ae1f 의 옛 흐름 재현: 해금된 채 토요일 추첨을 마친 상태를 옛 장면 c8_bakery 처음에 놓는다
 * (그 빌드에서는 c8_raffle 끝이 c8_bakery 로 이어졌다). 장면 진입 스냅샷도 그 장면 것으로
 */
function oldBakery(story: Story, early: readonly string[]) {
  const { state } = playTo(story, early, 'e1f.010');
  const st = JSON.parse(JSON.stringify(state)) as GameState;
  st.sceneId = 'c8_bakery';
  st.stepId = story.scenes.c8_bakery.steps[0].id;
  st.sceneEntry = { ...st.sceneEntry!, sceneId: 'c8_bakery' };
  return st;
}

/** 옛 흐름 상태에서 stopAt 까지 진행 */
function driveOld(story: Story, st: GameState, picks: readonly string[], stopAt: string) {
  let r = settle(story, st);
  let i = 0;
  while (r.step.id !== stopAt) r = r.step.t === 'choice' ? choose(story, st, picks[i++])! : advance(story, st)!;
  return st;
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
    expect(LEGACY_LATE_FLAG in st.flags).toBe(false);
    if (schema === 2) {
      expect(st.sceneEntry?.sceneId).toBe('c6_rain');
      expect(st.sceneEntry?.points).toEqual({ osana: 2, tenko: 2, koharu: 0 });
      expect('kh.met' in (st.sceneEntry?.flags ?? {})).toBe(false);
    } else expect(st.sceneEntry).toBeUndefined();
    // 새 규칙대로 판정: c6 b(+2) · c7 a(+3) → 5/4 해금, 코하루 4.5 → 새 발견 경로 후반 k×6(+0.5씩) → 5/4/7.5
    const done = finish(story, st, ['b', 'a', ...late('kkkkkk')]);
    expect(done.flags['kh.met']).toBe(true);
    expect(done.ids).toContain('c7.k10');
    expect(done.ids).toContain('e1f.ch1');
    expect(done.ids).not.toContain('c8.ch');
    expect(done.points).toEqual({ osana: 5, tenko: 4, koharu: 7.5 });
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
    const done = finish(story, st, late('hkhakh'));
    expect(done.flags['kh.met']).toBe(true);
    expect(done.ids.indexOf('c7.k10')).toBeLessThan(done.ids.indexOf('c7.j20'));
    expect(done.ids).toContain('c8r.010');
    // 5/4 → 코하루 4.5, 후반 h k h a k h → 5.5/5.5/5.5 → 히든
    expect(done.points).toEqual({ osana: 5.5, tenko: 5.5, koharu: 5.5 });
    expect(done.route).toBe('group');
  });

  it.each([1, 2] as const)('스키마 %i, 노을길(c7.j20~j40) 저장: 첫 만남을 소급하지 않고 미발견 경로(옛 +3·함께)로 이어진다', (schema) => {
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
      expect(LEGACY_LATE_FLAG in st.flags).toBe(false);
      expect(st.points).toEqual({ osana: 5, tenko: 4, koharu: 0 });
      if (schema === 2) expect(st.sceneEntry?.flags['kh.met']).toBe(false);
      const peek = JSON.parse(JSON.stringify(st)) as GameState;
      const done = finish(story, peek, ['a', 'b', 'c']);
      expect(done.ids).not.toContain('c8r.010');
      expect(done.ids).toContain('e1t.010');
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

  it.each([1, 2] as const)('스키마 %i, 이미 개별 루트에 들어간 저장: 위치·루트를 그대로 두고 해금 플래그는 false, 결말 갈래는 그대로 고를 수 있다', (schema) => {
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
      const fest = finish(story, JSON.parse(JSON.stringify(st)) as GameState, ['f']);
      expect(fest.route).toBe(route);
      expect(fest.ending).toBe(route);
      const daily = finish(story, st, ['d']);
      expect(daily.ending).toBe(`${route}_daily`);
    }
  });
});

describe('스키마 4 저장', () => {
  it('해금 여부·선택 순서·소수 점수·위치를 그대로 복원하고, 이후 진행이 원본과 같다', () => {
    const story = branchStory();
    const store = new MemoryStore(true);
    const sm = new SaveManager(store, story, permissiveAssets);
    const { state } = playTo(story, ['a', 'b', 'b', 'a'], 'e1f.ch1');
    expect(state.points.koharu).toBe(4.5);
    sm.write('1', state, summary);
    expect(JSON.parse(store.get('ashita.save.1')!).schema).toBe(4);
    const r = new SaveManager(store, story, permissiveAssets).load('1');
    if (r.status !== 'ok') throw new Error(r.status);
    expect(r.data.schema).toBe(4);
    expect(r.data.state).toEqual(state);
    expect(Object.keys(r.data.state.choices)).toEqual(['c3.ch', 'c4.ch', 'c6.ch', 'c7.ch']);
    expect(r.data.state.flags['kh.met']).toBe(true);
    const a = finish(story, JSON.parse(JSON.stringify(state)) as GameState, late('kkakka'));
    const b = finish(story, r.data.state, late('kkakka'));
    expect(b).toEqual(a);
    expect(b.route).toBe('koharu');
    expect(b.points).toEqual({ osana: 6, tenko: 4, koharu: 6.5 });
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

  it('히든 루트(group) 저장: 루트·요약 루트를 그대로 복원하고 엔딩 8개 중 하나만 endedWith 로 받는다', () => {
    const story = branchStory();
    const store = new MemoryStore(true);
    const sm = new SaveManager(store, story, permissiveAssets);
    const { state } = playTo(story, [...'cccc', ...late('ahkahk')], 'h1.010');
    expect(state.route).toBe('group');
    sm.write('1', state, { ...summary, route: 'group' });
    const r = sm.load('1');
    if (r.status !== 'ok') throw new Error(r.status);
    expect(r.data.state.route).toBe('group');
    expect(r.data.summary.route).toBe('group');
    expect(r.data.state.sceneEntry?.route).toBe('group');
    for (const [endedWith, want] of [
      ['group_daily', 'group_daily'],
      ['osana_daily', 'osana_daily'],
      ['constructor', null],
      ['toString', null],
      ['nope', null],
    ] as const) {
      sm.write('2', { ...state, endedWith: endedWith as GameState['endedWith'] }, summary);
      const l = sm.load('2');
      expect(l.status === 'ok' && l.data.state.endedWith, endedWith).toBe(want);
    }
    // lastHeroine 은 히로인만(group 은 손상)
    sm.write('3', { ...state, lastHeroine: 'group' as never }, summary);
    expect(sm.load('3')).toMatchObject({ status: 'error', reason: 'corrupt' });
    // 모르는 루트는 손상, 요약의 모르는 루트는 null
    sm.write('3', { ...state, route: 'nobody' as never }, summary);
    expect(sm.load('3')).toMatchObject({ status: 'error', reason: 'corrupt' });
    sm.write('3', state, { ...summary, route: 'nobody' as never });
    expect(sm.load('3')).toMatchObject({ status: 'ok', data: { summary: { route: null } } });
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

  it('스키마 5(더 새로운 빌드)는 손상이 아니라 "더 새로운 버전"으로 안내한다', () => {
    const story = branchStory();
    const store = new MemoryStore(true);
    const state = playTo(story, [], 'c3.010').state;
    store.set('ashita.save.1', JSON.stringify({ schema: 5, game: GAME_KEY, storyVersion: 'x', savedAt: '', summary, state }));
    expect(new SaveManager(store, story, permissiveAssets).load('1')).toEqual({
      status: 'error',
      reason: 'schema',
      message: '더 새로운 버전의 게임에서 만든 저장 데이터라 불러올 수 없어요.',
    });
  });

  /**
   * 한 플레이(초반 함께×4, 후반 a h k a h k = 5/5/5 → 히든, 결말 일상 쪽)의 여러 지점에서 저장 → 새 매니저로 불러오기 →
   * 남은 선택으로 끝까지. 점수·루트·엔딩이 저장 없이 끝까지 간 플레이와 같아야 한다(이중 가점·중복 판정 없음)
   */
  it.each([
    ['c7.c10', '초반 넷째(함께) 직후'],
    ['e1f.ch1.a10', '후반 첫째 선택 직후'],
    ['e1f.020', '단체 CG(group_ice_four) 표시 중'],
    ['e2f.020', '단체 CG(group_frog) 표시 중'],
    ['e3f.ch1.b10', '다섯째 직후(다섯째와 여섯째 사이)'],
    ['e3f.ch2', '여섯째 선택지 표시 중'],
    ['e3f.ch2.k10', '여섯째 직후(판정 직전)'],
    ['e3f.j10', '단체 CG(group_rain) 표시 중·판정 직전'],
    ['h1.010', '루트 확정 직후'],
    ['h.fork', '결말 갈래 선택 전'],
    ['hd1.010', '결말 갈래 선택 후'],
    ['hd1.020', '결말 쪽 화자 chorus 줄'],
  ])('%s(%s)에서 저장→불러오기: 점수·판정이 한 번만 반영된다', (stop) => {
    const story = branchStory();
    const store = new MemoryStore(true);
    const sm = new SaveManager(store, story, permissiveAssets);
    const picks = [...'cccc', ...late('ahkahk'), 'd'];
    const whole = finish(story, newGameState(story), picks);
    expect(whole).toMatchObject({ route: 'group', ending: 'group_daily', points: { osana: 5, tenko: 5, koharu: 5 } });
    const { state, r } = playTo(story, picks, stop);
    expect(r.step.id).toBe(stop);
    const before = structuredClone({ points: state.points, route: state.route, flags: state.flags, cg: state.stage.cg ?? null });
    sm.write('1', state, { ...summary, route: state.route });
    const l = new SaveManager(store, story, permissiveAssets).load('1');
    if (l.status !== 'ok') throw new Error(l.status);
    const again = settle(story, l.data.state);
    expect(again.step.id).toBe(stop);
    // 불러온 직후에는 연출·판정이 다시 실행되지 않는다(CG 관람·점수가 두 번 반영되지 않음)
    expect(again.events).toEqual([]);
    expect({ points: l.data.state.points, route: l.data.state.route, flags: l.data.state.flags, cg: l.data.state.stage.cg ?? null }).toEqual(before);
    const used = Object.keys(state.choices).length;
    const rest = finish(story, l.data.state, picks.slice(used));
    expect(rest.points).toEqual(whole.points);
    expect(rest.route).toBe(whole.route);
    expect(rest.ending).toBe(whole.ending);
  });

  it('CG 표시 중 저장→불러오기: 관람 기록은 한 번만(복도 첫 만남 kh_meet)', () => {
    const story = branchStory();
    const store = new MemoryStore(true);
    const sm = new SaveManager(store, story, permissiveAssets);
    const picks = ['a', 'b', 'b', 'a', ...late('kkakka')];
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
});

describe('스키마 3 → 4 이전: 구저장 표식(kh.late3)', () => {
  it('markLegacyLate: 해금·루트 미확정이고 옛 후반 선택을 했거나 옛 후반 장면에 있을 때만 붙인다(멱등)', () => {
    const mk = (sceneId: string, choices: Record<string, string>, flags: GameState['flags'], route: GameState['route'] = null) => ({ sceneId, choices, flags: { ...flags }, route });
    const met = { 'kh.met': true };
    const cases: Array<[string, ReturnType<typeof mk>, boolean]> = [
      ['c9 에서 c8.ch 를 고른 뒤', mk('c9_puzzle', { 'c8.ch': 'k' }, met), true],
      ['c10 에서 c8·c9 를 고른 뒤', mk('c10_window', { 'c8.ch': 'a', 'c9.ch': 'k' }, met), true],
      ['c8_bakery 첫 문장(아직 안 고름)', mk('c8_bakery', {}, met), true],
      ['옛 선택 기록만 있고 다른 장면(손상 가정)', mk('e1_ice4', { 'c10.ch': 'k' }, met), true],
      ['토요일 추첨(c8_raffle)', mk('c8_raffle', {}, met), false],
      ['복도 첫 만남(c7)', mk('c7_friday', {}, met), false],
      ['미발견(kh.met false)으로 c9', mk('c9_puzzle', { 'c8.ch': 'c' }, { 'kh.met': false }), false],
      ['판정 전 구판(kh.met 없음)으로 c8', mk('c8_bakery', {}, {}), false],
      ['루트 확정 뒤', mk('k1', { 'c8.ch': 'k', 'c9.ch': 'k', 'c10.ch': 'k' }, met, 'koharu'), false],
    ];
    for (const [name, target, want] of cases) {
      const before = structuredClone(target);
      expect(markLegacyLate(target), name).toBe(want);
      expect(target.flags[LEGACY_LATE_FLAG] === true, name).toBe(want);
      // 점수가 아닌 표식만, 다른 필드는 그대로
      expect({ ...target, flags: before.flags }, name).toEqual(before);
      const once = structuredClone(target);
      markLegacyLate(target);
      expect(target, `${name}(두 번째)`).toEqual(once);
    }
  });

  it('옛 c8.ch=k(+3) 를 고르고 c9.ch 에서 저장: 표식을 붙이고 점수·선택·위치는 그대로, 옛 k 분기와 옛 판정으로 끝난다', () => {
    const story = branchStory();
    const st = driveOld(story, oldBakery(story, [...'cccc']), ['k'], 'c9.ch');
    expect(st.points).toEqual({ osana: 4, tenko: 4, koharu: 7 });
    const store = new MemoryStore(true);
    putSchema3(store, st);
    const r = new SaveManager(store, story, permissiveAssets).load('1');
    if (r.status !== 'ok') throw new Error(r.status);
    const got = r.data.state;
    expect(r.data.schema).toBe(4);
    expect(got.flags[LEGACY_LATE_FLAG]).toBe(true);
    expect(got.sceneEntry?.flags[LEGACY_LATE_FLAG]).toBe(true);
    expect({ ...got, flags: st.flags, sceneEntry: { ...got.sceneEntry!, flags: st.sceneEntry!.flags } }).toEqual(st);
    // 옛 선택지 그대로: k 가 보이고 +3
    const r2 = settle(story, got);
    if (r2.step.t !== 'choice') throw new Error(r2.step.t);
    expect(visibleOptions(got, r2.step).map((o) => o.id)).toEqual(['a', 'b', 'k']);
    const done = finish(story, JSON.parse(JSON.stringify(got)) as GameState, ['k', 'k']);
    expect(done).toMatchObject({ route: 'koharu', points: { osana: 4, tenko: 4, koharu: 13 } });
    expect(done.ids).toContain('c10.040');
    expect(done.ids).not.toContain('e2t.010');
    expect(done.ids).not.toContain('e3f.ch1');
    // 옛 규칙의 세 명 동점(c8 k · c9 a · c10 b → 7/7/7)은 히든이 아니라 최근 선택(히나)
    const tie = finish(story, JSON.parse(JSON.stringify(got)) as GameState, ['a', 'b']);
    expect(tie).toMatchObject({ route: 'tenko', points: { osana: 7, tenko: 7, koharu: 7 } });
  });

  it('c8.ch 를 고른 직후(옛 반응 c8.k10) 저장도 이중 가점 없이, 1·2 의 재계산을 타지 않는다(코하루 해금 평균 유지)', () => {
    const story = branchStory();
    const st = driveOld(story, oldBakery(story, [...'abba']), ['k'], 'c8.k10');
    expect(st.points).toEqual({ osana: 5, tenko: 4, koharu: 7.5 });
    const store = new MemoryStore(true);
    putSchema3(store, st);
    const r = new SaveManager(store, story, permissiveAssets).load('1');
    if (r.status !== 'ok') throw new Error(r.status);
    // upgradeLegacy(재계산)를 탔다면 해금 평균 4.5 가 빠져 코하루 3 이 된다
    expect(r.data.state.points).toEqual({ osana: 5, tenko: 4, koharu: 7.5 });
    expect(r.data.state.lastHeroine).toBe(st.lastHeroine);
    expect(r.data.state.flags[LEGACY_LATE_FLAG]).toBe(true);
    const done = finish(story, r.data.state, ['k', 'k']);
    expect(done).toMatchObject({ route: 'koharu', points: { osana: 5, tenko: 4, koharu: 13.5 } });
  });

  it('후반 선택 전(c8_raffle·c7)의 해금 저장은 표식 없이 새 에피소드(+0.5·히든 루트)로 간다', () => {
    const story = branchStory();
    for (const stop of ['c8r.010', 'c8r.020', 'c7.k20', 'c7.j40']) {
      const { state } = playTo(story, [...'cccc'], stop);
      const store = new MemoryStore(true);
      putSchema3(store, state);
      const r = new SaveManager(store, story, permissiveAssets).load('1');
      if (r.status !== 'ok') throw new Error(`${stop}: ${r.status}`);
      expect(LEGACY_LATE_FLAG in r.data.state.flags, stop).toBe(false);
      expect(r.data.state).toEqual(state);
      const done = finish(story, r.data.state, late('ahkahk'));
      expect(done.ids).toContain('e1f.ch1');
      expect(done).toMatchObject({ route: 'group', points: { osana: 5, tenko: 5, koharu: 5 } });
    }
  });

  it('미발견(kh.met false) 옛 장면 저장·루트 확정 저장은 표식 없이 그대로이고, 확정 루트를 재분류하지 않는다', () => {
    const story = branchStory();
    const unmet = playTo(story, ['a', 'a', 'a', 'b', 'c'], 'c9.ch').state;
    const route = playTo(story, ['c', 'c', 'c', 'c', ...late('ahkahk')], 'h1.010').state;
    // 옛 규칙으로 정해진 코하루 루트(7/7/7) 저장
    const k1 = driveOld(story, oldBakery(story, [...'cccc']), ['a', 'b', 'k'], 'k1.010');
    expect(k1).toMatchObject({ route: 'koharu', points: { osana: 7, tenko: 7, koharu: 7 } });
    for (const [name, st] of [
      ['unmet', unmet],
      ['k1', k1],
    ] as const) {
      const store = new MemoryStore(true);
      putSchema3(store, st);
      const r = new SaveManager(store, story, permissiveAssets).load('1');
      if (r.status !== 'ok') throw new Error(`${name}: ${r.status}`);
      expect(r.data.state, name).toEqual(st);
    }
    const k1done = finish(story, JSON.parse(JSON.stringify(k1)) as GameState, []);
    expect(k1done).toMatchObject({ route: 'koharu', ending: 'koharu' });
    // 스키마 3 이하에는 group 루트가 있을 수 없다(손으로 고친 저장) → 손상
    const store = new MemoryStore(true);
    putSchema3(store, route);
    expect(new SaveManager(store, story, permissiveAssets).load('1')).toMatchObject({ status: 'error', reason: 'corrupt' });
  });

  it('이전은 결정적이고 멱등: 같은 원문을 몇 번 읽어도, 이전한 결과를 다시 스키마 3 으로 넣어도 같다', () => {
    const story = branchStory();
    const st = driveOld(story, oldBakery(story, [...'baab']), ['b'], 'c9.ch');
    const store = new MemoryStore(true);
    putSchema3(store, st);
    const sm = new SaveManager(store, story, permissiveAssets);
    const a = sm.load('1');
    const b = sm.load('1');
    expect(b).toEqual(a);
    if (a.status !== 'ok') throw new Error(a.status);
    // 저장소의 원본은 그대로(이전은 읽을 때 메모리에서만)
    expect(JSON.parse(store.get('ashita.save.1')!).schema).toBe(3);
    putSchema3(store, a.data.state, '2');
    const c = sm.load('2');
    if (c.status !== 'ok') throw new Error(c.status);
    expect(c.data.state).toEqual(a.data.state);
    // 새 빌드가 다시 쓰면 스키마 4 로 표식이 함께 남는다
    sm.write('3', a.data.state, summary);
    const d = sm.load('3');
    if (d.status !== 'ok') throw new Error(d.status);
    expect(d.data.state).toEqual(a.data.state);
    expect(JSON.parse(store.get('ashita.save.3')!).schema).toBe(4);
  });
});

describe('전역 기록: 엔딩 8개와 보조 키 두 개(ashita.global.ext · ashita.global.v2)', () => {
  it('세 키 이름과 storage 이벤트 판단 함수', () => {
    expect(GLOBAL_RECORD_KEYS).toEqual(['ashita.global', 'ashita.global.ext', 'ashita.global.v2']);
    for (const k of GLOBAL_RECORD_KEYS) expect(isGlobalRecordKey(k)).toBe(true);
    expect(isGlobalRecordKey(null)).toBe(true);
    expect(isGlobalRecordKey('ashita.save.1')).toBe(false);
    expect(isGlobalRecordKey('ashita.settings')).toBe(false);
  });

  it('새 엔딩 다섯 개와 새 CG 를 받아들이고, 기록할 때 세 키에 모두 쓴다', () => {
    const story = branchStory();
    const store = new MemoryStore(true);
    const sm = new SaveManager(store, story, permissiveAssets);
    for (const e of Object.keys(ENDINGS8) as Array<keyof typeof ENDINGS8>) sm.markEnding(e);
    sm.markCg('end_group_morning');
    sm.flushGlobal();
    const all = Object.keys(ENDINGS8).sort();
    expect(JSON.parse(store.get('ashita.global')!).endings.sort()).toEqual(all);
    expect(JSON.parse(store.get('ashita.global.ext')!).endings.sort()).toEqual(all);
    expect(JSON.parse(store.get('ashita.global.v2')!).endings.sort()).toEqual(all);
    const fresh = new SaveManager(store, story, permissiveAssets);
    expect(fresh.endingsReached().sort()).toEqual(all);
    expect(fresh.hasSeenCg('end_group_morning')).toBe(true);
  });

  it('897ae1f 빌드가 앞의 두 키를 아는 엔딩 셋만 남겨 덮어써도 새 엔딩은 v2 키로 남고, 다음 기록 때 되돌아온다', () => {
    const story = branchStory();
    const store = new MemoryStore(true);
    const sm = new SaveManager(store, story, permissiveAssets);
    sm.markEnding('koharu');
    sm.markEnding('group_daily');
    sm.markEnding('osana_daily');
    sm.markCg('end_group_morning');
    // 897ae1f 의 flushGlobal 흉내: 자기가 아는 엔딩(osana·tenko·koharu)만 남겨 global·ext 를 다시 쓴다. CG·읽음은 그대로 합쳐 쓴다
    const known = (xs: string[]) => xs.filter((e) => e === 'osana' || e === 'tenko' || e === 'koharu');
    const g = JSON.parse(store.get('ashita.global')!);
    store.set('ashita.global', JSON.stringify({ ...g, endings: known(g.endings), read: [...g.read, 'old.010'] }));
    store.set('ashita.global.ext', JSON.stringify({ endings: known(g.endings) }));
    const fresh = new SaveManager(store, story, permissiveAssets);
    expect(fresh.endingsReached().sort()).toEqual(['group_daily', 'koharu', 'osana_daily']);
    expect(fresh.isRead('old.010')).toBe(true);
    expect(fresh.hasSeenCg('end_group_morning')).toBe(true);
    fresh.flushGlobal();
    expect(JSON.parse(store.get('ashita.global')!).endings.sort()).toEqual(['group_daily', 'koharu', 'osana_daily']);
    expect(JSON.parse(store.get('ashita.global.ext')!).endings.sort()).toEqual(['group_daily', 'koharu', 'osana_daily']);
  });

  it('11612b4(코하루 이전) 빌드가 global 만 osana·tenko 로 덮어써도 세 키 합집합으로 남는다', () => {
    const story = branchStory();
    const store = new MemoryStore(true);
    const sm = new SaveManager(store, story, permissiveAssets);
    sm.markEnding('osana');
    sm.markEnding('koharu');
    sm.markEnding('tenko_daily');
    const g = JSON.parse(store.get('ashita.global')!);
    store.set('ashita.global', JSON.stringify({ ...g, endings: g.endings.filter((e: string) => e === 'osana' || e === 'tenko') }));
    expect(new SaveManager(store, story, permissiveAssets).endingsReached().sort()).toEqual(['koharu', 'osana', 'tenko_daily']);
  });

  it('보조 키가 손상되거나 모르는 엔딩이 있어도 나머지 키로 계속하고, 프로토타입 이름은 엔딩이 아니다', () => {
    const story = branchStory();
    const store = new MemoryStore(true);
    const sm = new SaveManager(store, story, permissiveAssets);
    sm.markEnding('group_festival');
    sm.markEnding('osana');
    store.set('ashita.global.v2', '{bad');
    expect(new SaveManager(store, story, permissiveAssets).endingsReached().sort()).toEqual(['group_festival', 'osana']);
    store.set('ashita.global', '{bad');
    store.set('ashita.global.ext', JSON.stringify({ endings: ['nope', 'constructor', 'tenko'] }));
    store.set('ashita.global.v2', JSON.stringify({ schema: 1, endings: ['__proto__', 'group_daily'] }));
    expect(new SaveManager(store, story, permissiveAssets).endingsReached().sort()).toEqual(['group_daily', 'tenko']);
  });

  it('기존 클리어 기록(엔딩 셋)을 다른 엔딩으로 재분류하지 않는다', () => {
    const story = branchStory();
    const store = new MemoryStore(true);
    store.set('ashita.global', JSON.stringify({ schema: 1, read: ['c3.010'], endings: ['osana', 'tenko', 'koharu'], cgs: ['kh_date'] }));
    store.set('ashita.global.ext', JSON.stringify({ endings: ['osana', 'tenko', 'koharu'] }));
    const sm = new SaveManager(store, story, permissiveAssets);
    expect(sm.endingsReached().sort()).toEqual(['koharu', 'osana', 'tenko']);
    sm.flushGlobal();
    expect(JSON.parse(store.get('ashita.global.v2')!).endings.sort()).toEqual(['koharu', 'osana', 'tenko']);
    expect(new SaveManager(store, story, permissiveAssets).endingsReached().sort()).toEqual(['koharu', 'osana', 'tenko']);
  });
});

/**
 * 897ae1f 빌드(스키마 3)가 실제로 쓴 저장 원문(tests/unit/fixtures/v3-saves.897ae1f.json, 만든 방법은 그 파일의 note·how)을
 * 실제 대본으로 불러온다. 옛 후반 장면·확정 루트 저장은 897ae1f 로 끝까지 간 결과(old)와 같아야 하고(루트 재분류 없음),
 * 후반 선택 전 저장은 새 에피소드(+0.5)로 간다.
 */
describe('897ae1f 스키마 3 고정 자료(실제 대본)', () => {
  type Fixture = (typeof v3.saves)[number];
  const checker = manifestChecker();
  const LATE3 = new Set(['met-c8ch-before', 'met-c8-010', 'met-c8k10', 'met-c9ch-before', 'met-c10j10-kkk', 'met-c10j10-abk']);
  const NEW_FLOW = new Set(['met-c8r-cg', 'met-c7-meet-cg']);
  const load = (f: Fixture) => {
    const store = new MemoryStore(true);
    store.set('ashita.save.1', JSON.stringify(f.save));
    const r = new SaveManager(store, STORY, checker).load('1');
    if (r.status !== 'ok') throw new Error(`${f.name}: ${r.status}`);
    return r.data;
  };
  /** 남은 선택은 picks 다음 것, 없으면 첫 보이는 옵션(897ae1f 생성 때와 같은 규칙. 결말 갈래는 축제 쪽 f) */
  const run = (f: Fixture, state: GameState, extra: readonly string[] = []) => {
    const rest = [...f.picks.slice(Object.keys(f.save.state.choices).length), ...extra];
    let r = settle(STORY, state);
    let i = 0;
    const ids: string[] = [];
    while (r.step.t !== 'ending') {
      ids.push(r.step.id);
      if (r.step.t === 'choice') {
        const pick = rest[i++] ?? visibleOptions(state, r.step)[0].id;
        r = choose(STORY, state, pick)!;
      } else r = advance(STORY, state)!;
    }
    return { ids, route: state.route, points: { ...state.points }, ending: r.step.ending };
  };

  it('고정 자료는 18개이고 모두 897ae1f 스키마 3 원문이다', () => {
    expect(v3.saves).toHaveLength(18);
    for (const f of v3.saves) expect({ schema: f.save.schema, version: f.save.storyVersion }, f.name).toEqual({ schema: 3, version: '0.2.0' });
  });

  it.each(v3.saves.map((f) => [f.name, f] as const))('%s: 위치·점수·선택·루트를 그대로 불러온다(표식만 규칙대로)', (_name, f) => {
    const data = load(f);
    const st = data.state;
    expect(data.schema).toBe(4);
    expect({ sceneId: st.sceneId, stepId: st.stepId, route: st.route, points: st.points }).toEqual({ sceneId: f.sceneId, stepId: f.stepId, route: f.route, points: f.points });
    expect(st.choices).toEqual(f.save.state.choices);
    expect(st.lastHeroine).toBe(f.save.state.lastHeroine);
    const late = LATE3.has(f.name);
    expect(st.flags[LEGACY_LATE_FLAG] === true).toBe(late);
    expect(st.sceneEntry?.flags[LEGACY_LATE_FLAG] === true).toBe(late);
    const { [LEGACY_LATE_FLAG]: _drop, ...rest } = st.flags;
    expect(rest).toEqual(f.save.state.flags);
    // 불러온 직후에는 연출·판정이 다시 실행되지 않는다
    expect(settle(STORY, JSON.parse(JSON.stringify(st)) as GameState).events).toEqual([]);
  });

  it.each(v3.saves.filter((f) => !NEW_FLOW.has(f.name)).map((f) => [f.name, f] as const))(
    '%s: 남은 진행이 897ae1f 로 끝까지 간 결과와 같다(옛 배점·옛 판정·같은 엔딩, 히든·재분류 없음)',
    (_name, f) => {
      const done = run(f, load(f).state);
      expect({ route: done.route, ending: done.ending, points: done.points }).toEqual({ route: f.old.finalRoute, ending: f.old.ending, points: f.old.finalPoints });
      expect(done.route).not.toBe('group');
      // 옛 후반 장면 저장은 새 에피소드로 새지 않는다
      if (LATE3.has(f.name)) for (const id of ['e1f.ch1', 'e2t.010', 'e3t.010']) expect(done.ids).not.toContain(id);
    },
  );

  it('7/7/7 에서 저장한 구저장(c10.j10, 옛 c8 a·c9 b·c10 k)은 옛 규칙대로 코하루이고 히든 루트가 아니다', () => {
    const f = v3.saves.find((x) => x.name === 'met-c10j10-abk')!;
    expect(f.points).toEqual({ osana: 7, tenko: 7, koharu: 7 });
    const done = run(f, load(f).state);
    expect(done).toMatchObject({ route: 'koharu', ending: 'koharu' });
    // 표식을 지워도 대본(옛 c10 판정에는 tieRoute 가 없다)만으로 같은 결과
    const st = load(f).state;
    delete st.flags[LEGACY_LATE_FLAG];
    expect(run(f, st).route).toBe('koharu');
  });

  it('옛 c9.ch·c8.ch 선택지 저장: 옛 옵션 a·b·k 가 그대로 보이고 k 는 +3', () => {
    for (const name of ['met-c8ch-before', 'met-c9ch-before']) {
      const f = v3.saves.find((x) => x.name === name)!;
      const st = load(f).state;
      const r = settle(STORY, st);
      if (r.step.t !== 'choice') throw new Error(r.step.t);
      expect(visibleOptions(st, r.step).map((o) => o.id), name).toEqual(['a', 'b', 'k']);
      const before = st.points.koharu;
      choose(STORY, st, 'k');
      expect(st.points.koharu - before, name).toBe(3);
    }
  });

  it('후반 선택 전 해금 저장(추첨 CG 중 c8r.180·복도 첫 만남 CG 중 c7.m40)은 새 에피소드 여섯 선택(+0.5)과 히든 루트로 이어진다', () => {
    for (const [name, six, route, points] of [
      ['met-c8r-cg', ['b', 'k', 'b', 'a', 'k', 'b'], 'group', { osana: 5.5, tenko: 5.5, koharu: 5.5 }],
      ['met-c7-meet-cg', ['a', 'b', 'k', 'a', 'b', 'k'], 'group', { osana: 5, tenko: 5, koharu: 5 }],
    ] as const) {
      const f = v3.saves.find((x) => x.name === name)!;
      const st = load(f).state;
      expect(st.stage.cg).toBe(name === 'met-c8r-cg' ? 'kh_draw' : 'kh_meet');
      const done = run(f, st, six);
      expect(done.ids).toContain('e1f.ch1');
      expect(done.ids).not.toContain('c8.ch');
      expect({ route: done.route, points: done.points }, name).toEqual({ route, points });
    }
  });

  it('확정 루트 저장: 결말 갈래 위치보다 앞이면 갈래 선택이 나오고 두 엔딩으로 갈 수 있다. 뒤면 기존 축제 쪽 엔딩 그대로', () => {
    const before = ['route-k1-abk', 'route-k3', 'route-o2', 'route-t2'];
    const after = ['route-k6', 'route-o4-110', 'route-o5', 'route-t5'];
    for (const name of before) {
      const f = v3.saves.find((x) => x.name === name)!;
      const fest = run(f, load(f).state, ['f']);
      const daily = run(f, load(f).state, ['d']);
      expect(fest.ids.some((id) => FORK_CHOICES.includes(id)), name).toBe(true);
      expect(fest.ending, name).toBe(f.route);
      expect(daily.ending, name).toBe(`${f.route}_daily`);
      expect(daily.route, name).toBe(f.route);
    }
    for (const name of after) {
      const f = v3.saves.find((x) => x.name === name)!;
      const done = run(f, load(f).state);
      expect(done.ids.some((id) => FORK_CHOICES.includes(id)), name).toBe(false);
      expect(done.ending, name).toBe(f.route);
    }
  });

  it('897ae1f 전역 기록(엔딩 셋·CG 17장)을 그대로 읽고 재분류하지 않으며, 그 빌드가 다시 덮어써도 새 엔딩이 남는다', () => {
    const store = new MemoryStore(true);
    for (const [k, v] of Object.entries(v3.global)) store.set(k, JSON.stringify(v));
    const sm = new SaveManager(store, STORY, checker);
    expect(sm.endingsReached().sort()).toEqual(['koharu', 'osana', 'tenko']);
    expect(sm.cgsSeenList().sort()).toEqual([...v3.global['ashita.global'].cgs].sort());
    for (const id of v3.global['ashita.global'].read) expect(sm.isRead(id)).toBe(true);
    // 새 빌드에서 일상 쪽·히든 엔딩을 본 뒤, 897ae1f 탭이 자기 형식으로 두 키를 다시 쓴다(아는 엔딩 셋만)
    sm.markEnding('group_daily');
    sm.markEnding('tenko_daily');
    const g = JSON.parse(store.get('ashita.global')!);
    const known = g.endings.filter((e: string) => ['osana', 'tenko', 'koharu'].includes(e));
    store.set('ashita.global', JSON.stringify({ ...v3.global['ashita.global'], read: g.read, cgs: g.cgs, endings: known }));
    store.set('ashita.global.ext', JSON.stringify({ endings: known }));
    expect(new SaveManager(store, STORY, checker).endingsReached().sort()).toEqual(['group_daily', 'koharu', 'osana', 'tenko', 'tenko_daily']);
  });
});
