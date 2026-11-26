/**
 * '장면 처음부터' 복구(대본 수정으로 저장 위치를 잃었을 때) 회귀 테스트.
 * 결함: 복구가 stepId 와 무대만 바꾸고 점수·선택·플래그·로그는 저장 시점 값을 그대로 써서
 * 같은 선택지 점수가 두 번 들어가 루트가 바뀌고, 무대는 빈 검은 화면·음악 없음이 되었다.
 */
import { describe, expect, it } from 'vitest';
import { advance, choose, LOG_LIMIT, newGameState, pushLog, settle, type StepResult } from '../../src/engine/runner';
import { GAME_KEY, SAVE_SCHEMA, SaveManager } from '../../src/engine/save';
import { MemoryStore } from '../../src/engine/storage';
import type { GameState, Story } from '../../src/engine/types';
import { branchStory, permissiveAssets, recoveryStory } from './fixtures';

const summary = { sceneTitle: 't', text: 'x', route: null };

/** UI(game.ts)와 같은 순서로 진행한다: 대사·카드는 표시할 때 기록, 선택은 고르기 직전에 `${id}:${옵션}` 기록 */
function drive(story: Story, state: GameState, picks: Record<string, string>, stopAt?: string): StepResult {
  let r = settle(story, state);
  for (let guard = 0; guard < 500; guard++) {
    const step = r.step;
    if (step.t === 'say' || step.t === 'card') pushLog(state, { id: step.id, name: null, text: step.text, kind: 'say' });
    if (step.id === stopAt || step.t === 'ending') return r;
    if (step.t === 'choice') {
      const pick = picks[step.id];
      pushLog(state, { id: `${step.id}:${pick}`, name: null, text: pick, kind: 'choice' });
      r = choose(story, state, pick)!;
    } else r = advance(story, state)!;
  }
  throw new Error('진행이 끝나지 않음');
}

/** 결과 비교용: 진행에 영향을 주는 상태 전부 */
const outcome = (s: GameState) => ({
  sceneId: s.sceneId,
  stepId: s.stepId,
  points: s.points,
  lastHeroine: s.lastHeroine,
  route: s.route,
  choices: s.choices,
  flags: s.flags,
  stage: s.stage,
  log: s.log.map((e) => e.id),
});

/** 소꿉친구(a)를 고르고 r2.a20 에서 저장 → 대본 수정으로 r2.a20 이 사라진 상황 */
function brokenSave(story: Story) {
  const state = newGameState(story);
  drive(story, state, { 'r1.ch': 'a', 'r2.ch': 'a' }, 'r2.a20');
  expect(state.points).toEqual({ osana: 2, tenko: 0, koharu: 0 });
  return { ...state, stepId: 'r2.a20-removed' };
}

describe("'장면 처음부터' 복구", () => {
  it('장면 진입 시점의 점수·선택·플래그·무대·로그로 되돌리고, 다시 고른 결과가 처음부터 그렇게 고른 플레이와 같다', () => {
    const story = recoveryStory();
    const store = new MemoryStore(true);
    const sm = new SaveManager(store, story, permissiveAssets);
    sm.write('auto', brokenSave(story), summary);

    const r = sm.load('auto');
    expect(r.status).toBe('recoverable');
    if (r.status !== 'recoverable') return;
    expect(r.notes).toEqual([]);
    const st = r.data.state;
    expect(st.sceneId).toBe('r2');
    expect(st.stepId).toBe(story.scenes.r2.steps[0].id);
    expect(st.points).toEqual({ osana: 1, tenko: 0, koharu: 0 });
    expect(st.lastHeroine).toBe('osana');
    expect(st.choices).toEqual({ 'r1.ch': 'a' });
    expect(st.flags).toEqual({});
    // 앞 장면에서 물려받은 무대(배경·음악·캐릭터)가 남아 있어야 검은 화면·무음이 되지 않는다
    expect(st.stage).toEqual({
      bg: 'classroom_day',
      bgm: 'daily',
      cg: null,
      chars: { osana: { pos: 'left', expr: 'neutral', outfit: 'uniform', hair: 'default' } },
      order: ['osana'],
    });
    expect(st.log.map((e) => e.id)).toEqual(['r1.010', 'r1.ch:a', 'r1.020']);

    // 이번엔 전학생(b)을 고른다. 정상 플레이 a,b 는 1:1 동점 → 최근 선택(tenko) 루트
    drive(story, st, { 'r2.ch': 'b' });
    const normal = newGameState(story);
    drive(story, normal, { 'r1.ch': 'a', 'r2.ch': 'b' });
    expect(normal.route).toBe('tenko');
    expect(outcome(st)).toEqual(outcome(normal));
  });

  it('복구한 상태도 장면 진입 스냅샷을 가지고 있어, 같은 장면에서 다시 위치를 잃어도 같은 시점으로 돌아간다', () => {
    const story = recoveryStory();
    const store = new MemoryStore(true);
    const sm = new SaveManager(store, story, permissiveAssets);
    sm.write('1', brokenSave(story), summary);
    const first = sm.load('1');
    if (first.status !== 'recoverable') throw new Error(first.status);
    const expected = structuredClone(outcome(first.data.state));
    const st = first.data.state;
    drive(story, st, { 'r2.ch': 'a' }, 'r2.a20');
    sm.write('1', { ...st, stepId: 'r2.a20-removed' }, summary);
    const again = sm.load('1');
    if (again.status !== 'recoverable') throw new Error(again.status);
    expect(outcome(again.data.state)).toEqual(expected);
  });

  it('스키마 1 저장(스냅샷 없음)도 받아들이고, 이 장면의 선택 점수를 빼고 배경·음악은 유지한다', () => {
    const story = recoveryStory();
    const store = new MemoryStore(true);
    const sm = new SaveManager(store, story, permissiveAssets);
    const v1State: Partial<GameState> = brokenSave(story);
    delete v1State.sceneEntry;
    store.set('ashita.save.1', JSON.stringify({ schema: 1, game: GAME_KEY, storyVersion: 'old', savedAt: '2026-01-01T00:00:00.000Z', summary, state: v1State }));

    const r = sm.load('1');
    expect(r.status).toBe('recoverable');
    if (r.status !== 'recoverable') return;
    expect(r.data.schema).toBe(SAVE_SCHEMA);
    const st = r.data.state;
    expect(st.points).toEqual({ osana: 1, tenko: 0, koharu: 0 });
    expect(st.choices).toEqual({ 'r1.ch': 'a' });
    // 캐릭터는 아직 등장 전일 수 있어 비우고, 배경·음악만 남긴다
    expect(st.stage).toEqual({ bg: 'classroom_day', bgm: 'daily', chars: {}, order: [], cg: null });
    expect(st.log.map((e) => e.id)).toEqual(['r1.010', 'r1.ch:a', 'r1.020']);
    // 이후 저장에는 스냅샷이 들어간다
    expect(st.sceneEntry?.sceneId).toBe('r2');

    drive(story, st, { 'r2.ch': 'b' });
    expect(st.points).toEqual({ osana: 1, tenko: 1, koharu: 0 });
    expect(st.route).toBe('tenko');
  });

  it('스키마 1 저장의 정확한 위치는 그대로 불러오고, 다음 장면부터 스냅샷이 생긴다', () => {
    const story = recoveryStory();
    const store = new MemoryStore(true);
    const sm = new SaveManager(store, story, permissiveAssets);
    const state = newGameState(story);
    drive(story, state, { 'r1.ch': 'a' }, 'r1.020');
    const v1State: Partial<GameState> = { ...state };
    delete v1State.sceneEntry;
    store.set('ashita.save.1', JSON.stringify({ schema: 1, game: GAME_KEY, storyVersion: 'old', savedAt: '', summary, state: v1State }));
    const r = sm.load('1');
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.data.schema).toBe(SAVE_SCHEMA);
    expect(r.data.state.sceneEntry).toBeUndefined();
    drive(story, r.data.state, { 'r2.ch': 'a' }, 'r2.010');
    expect(r.data.state.sceneEntry).toMatchObject({ sceneId: 'r2', points: { osana: 1, tenko: 0, koharu: 0 }, logLength: 3 });
  });

  it('대화 기록이 LOG_LIMIT 로 잘려도 장면 진입 위치가 같은 항목을 가리켜, 복구 때 이 장면 기록만 잘린다', () => {
    const story = recoveryStory();
    const state = newGameState(story);
    settle(story, state);
    for (let i = 0; i < 110; i++) pushLog(state, { id: `old.${i}`, name: null, text: '', kind: 'say' });
    drive(story, state, { 'r1.ch': 'a' }, 'r2.010');
    expect(state.sceneEntry?.logLength).toBe(113);
    for (let i = 0; i < 20; i++) pushLog(state, { id: i % 2 ? 'r2.010' : 'r2.020', name: null, text: '', kind: 'say' });
    expect(state.log.length).toBe(LOG_LIMIT);
    const entryAt = state.sceneEntry!.logLength;
    expect(state.log[entryAt - 1].id).toBe('r1.020');
    expect(state.log[entryAt].id).toBe('r2.010');

    const store = new MemoryStore(true);
    const sm = new SaveManager(store, story, permissiveAssets);
    sm.write('1', { ...state, stepId: 'r2.gone' }, summary);
    const r = sm.load('1');
    if (r.status !== 'recoverable') throw new Error(r.status);
    expect(r.data.state.log.length).toBe(entryAt);
    expect(r.data.state.log.at(-1)?.id).toBe('r1.020');
  });

  it('복구 지점의 무대를 매니페스트에서 못 찾고 장면 앞부분에도 bg 지시가 없으면 안내 문구를 함께 돌려준다', () => {
    const story = recoveryStory();
    const store = new MemoryStore(true);
    new SaveManager(store, story, permissiveAssets).write('1', brokenSave(story), summary);
    // 그 사이 교실 배경 이름이 바뀌었다고 가정
    const renamed = { ...permissiveAssets, hasBg: (b: string) => b !== 'classroom_day' };
    const r = new SaveManager(store, story, renamed).load('1');
    expect(r.status).toBe('recoverable');
    if (r.status !== 'recoverable') return;
    expect(r.data.state.stage.bg).toBe('black');
    expect(r.notes).toEqual(['배경 정보를 복원하지 못했어요']);
  });
});

describe("'장면 처음부터' 복구와 해금 판정", () => {
  /** 초반 a,b,b,a(5/4 해금)로 c7.j20 까지 진행한 저장에서 그 문장이 사라진 상황 */
  function metSave(story: Story) {
    const state = newGameState(story);
    drive(story, state, { 'c3.ch': 'a', 'c4.ch': 'b', 'c6.ch': 'b', 'c7.ch': 'a' }, 'c7.j20');
    expect(state.flags['kh.met']).toBe(true);
    expect(state.points).toEqual({ osana: 5, tenko: 4, koharu: 4.5 });
    return { ...state, stepId: 'c7.j20-removed' };
  }

  it('장면 진입 스냅샷으로 해금 전 상태로 돌아가고, 다시 진행하면 해금·시작 점수가 한 번만 들어간다', () => {
    const story = branchStory();
    const store = new MemoryStore(true);
    const sm = new SaveManager(store, story, permissiveAssets);
    sm.write('1', metSave(story), summary);
    const r = sm.load('1');
    if (r.status !== 'recoverable') throw new Error(r.status);
    const st = r.data.state;
    expect(st.sceneId).toBe('c7_friday');
    expect(st.points).toEqual({ osana: 2, tenko: 4, koharu: 0 });
    expect('kh.met' in st.flags).toBe(false);
    // 발견 경로는 추첨 뒤 새 에피소드(빙수집 넷)의 첫 선택지로 간다
    drive(story, st, { 'c7.ch': 'a' }, 'e1f.ch1');
    expect(st.flags['kh.met']).toBe(true);
    expect(st.points).toEqual({ osana: 5, tenko: 4, koharu: 4.5 });
  });

  it('스냅샷이 없어도(손상) 이 장면의 선택 점수와 해금 판정을 함께 되돌린다', () => {
    const story = branchStory();
    const store = new MemoryStore(true);
    const sm = new SaveManager(store, story, permissiveAssets);
    const broken: Partial<GameState> = metSave(story);
    delete broken.sceneEntry;
    sm.write('1', broken as GameState, summary);
    const r = sm.load('1');
    if (r.status !== 'recoverable') throw new Error(r.status);
    const st = r.data.state;
    expect(st.points).toEqual({ osana: 2, tenko: 4, koharu: 0 });
    expect('kh.met' in st.flags).toBe(false);
    expect(st.choices).toEqual({ 'c3.ch': 'a', 'c4.ch': 'b', 'c6.ch': 'b' });
    // 이번엔 b(+3) → 2/7 미해금
    drive(story, st, { 'c7.ch': 'b' }, 'c8.ch');
    expect(st.flags['kh.met']).toBe(false);
    expect(st.points).toEqual({ osana: 2, tenko: 7, koharu: 0 });
  });
});

describe("'장면 처음부터' 복구: 판정 장면(처마 넷)·히든 루트·구저장 옛 장면", () => {
  const SIX = { 'e1f.ch1': 'a', 'e1f.ch2': 'b', 'e2f.ch1': 'k', 'e2f.ch2': 'a', 'e3f.ch1': 'b', 'e3f.ch2': 'k' };
  const EARLY = { 'c3.ch': 'c', 'c4.ch': 'c', 'c6.ch': 'c', 'c7.ch': 'c' };

  it('처마 넷(e3_rain4)의 여섯째 반응에서 위치를 잃으면 장면 진입 값(넷째 선택까지 5/4.5/4.5)으로 되돌리고, 다시 고르면 히든 루트로 한 번만 판정한다', () => {
    const story = branchStory();
    const state = newGameState(story);
    drive(story, state, { ...EARLY, ...SIX }, 'e3f.ch2.k10');
    expect(state.points).toEqual({ osana: 5, tenko: 5, koharu: 5 });
    expect(state.route).toBeNull();
    const sm = new SaveManager(new MemoryStore(true), story, permissiveAssets);
    sm.write('1', { ...state, stepId: 'e3f.ch2.k10-removed' }, summary);
    const r = sm.load('1');
    if (r.status !== 'recoverable') throw new Error(r.status);
    const st = r.data.state;
    expect(st.sceneId).toBe('e3_rain4');
    // 넷째까지: 4 + a·b·k·a → 5/4.5/4.5
    expect(st.points).toEqual({ osana: 5, tenko: 4.5, koharu: 4.5 });
    expect('e3f.ch1' in st.choices || 'e3f.ch2' in st.choices).toBe(false);
    expect(st.route).toBeNull();
    const end = drive(story, st, { 'e3f.ch1': 'b', 'e3f.ch2': 'k', 'h.fork': 'd' });
    expect(st.route).toBe('group');
    expect(st.points).toEqual({ osana: 5, tenko: 5, koharu: 5 });
    expect(end.step.t === 'ending' && end.step.ending).toBe('group_daily');
  });

  it('스냅샷이 없어도(손상) 처마 넷의 0.5 선택 둘을 빼고 같은 결과로 다시 간다', () => {
    const story = branchStory();
    const state = newGameState(story);
    drive(story, state, { ...EARLY, ...SIX }, 'e3f.ch2.k10');
    const broken: Partial<GameState> = { ...state, stepId: 'e3f.ch2.k10-removed' };
    delete broken.sceneEntry;
    const sm = new SaveManager(new MemoryStore(true), story, permissiveAssets);
    sm.write('1', broken as GameState, summary);
    const r = sm.load('1');
    if (r.status !== 'recoverable') throw new Error(r.status);
    const st = r.data.state;
    expect(st.points).toEqual({ osana: 5, tenko: 4.5, koharu: 4.5 });
    expect(Object.keys(st.choices)).not.toContain('e3f.ch1');
    drive(story, st, { 'e3f.ch1': 'b', 'e3f.ch2': 'k' }, 'h1.010');
    expect(st.route).toBe('group');
  });

  it('히든 루트 장면에서 위치를 잃어도 루트(group)를 유지한 채 그 장면 처음부터', () => {
    const story = branchStory();
    const state = newGameState(story);
    drive(story, state, { ...EARLY, ...SIX }, 'h1.010');
    expect(state.route).toBe('group');
    const sm = new SaveManager(new MemoryStore(true), story, permissiveAssets);
    sm.write('1', { ...state, stepId: 'h1.gone' }, { ...summary, route: 'group' });
    const r = sm.load('1');
    if (r.status !== 'recoverable') throw new Error(r.status);
    expect(r.data.state).toMatchObject({ sceneId: 'h1', route: 'group', points: { osana: 5, tenko: 5, koharu: 5 } });
    expect(r.data.summary.route).toBe('group');
    const end = drive(story, r.data.state, { 'h.fork': 'f' });
    expect(end.step.t === 'ending' && end.step.ending).toBe('group_festival');
  });

  it('구저장(옛 c8 k +3 를 고른 뒤 c9 에서 위치를 잃음)도 옛 장면 처음부터 옛 배점으로', () => {
    const story = branchStory();
    // 옛 흐름 재현: 해금된 상태를 옛 장면 c8_bakery 에 넣는다(897ae1f 의 추첨 → 빵집)
    const state = newGameState(story);
    drive(story, state, EARLY, 'e1f.010');
    const old = { ...JSON.parse(JSON.stringify(state)), sceneId: 'c8_bakery', stepId: 'c8.010' } as GameState;
    old.sceneEntry = { ...old.sceneEntry!, sceneId: 'c8_bakery' };
    drive(story, old, { 'c8.ch': 'k' }, 'c9.ch');
    expect(old.points).toEqual({ osana: 4, tenko: 4, koharu: 7 });
    const sm = new SaveManager(new MemoryStore(true), story, permissiveAssets);
    sm.write('1', { ...old, stepId: 'c9.gone' }, summary);
    const r = sm.load('1');
    if (r.status !== 'recoverable') throw new Error(r.status);
    expect(r.data.state).toMatchObject({ sceneId: 'c9_puzzle', points: { osana: 4, tenko: 4, koharu: 7 } });
    const end = drive(story, r.data.state, { 'c9.ch': 'k', 'c10.ch': 'k', 'k4.fork': 'f' });
    expect(r.data.state.route).toBe('koharu');
    expect(r.data.state.points).toEqual({ osana: 4, tenko: 4, koharu: 13 });
    expect(end.step.t === 'ending' && end.step.ending).toBe('koharu');
  });
});
