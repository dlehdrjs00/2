/**
 * 저장소 회귀 테스트
 * - 탭 두 개: 한 탭의 전역 기록(읽은 대사·엔딩) 쓰기가 다른 탭의 기록을 통째로 덮어쓰던 결함
 * - 용량 초과: 메모리 대체 저장 뒤에도 get() 이 localStorage 의 옛 값을 먼저 돌려주던 결함
 */
import { describe, expect, it } from 'vitest';
import { advance, newGameState, settle } from '../../src/engine/runner';
import { SaveManager } from '../../src/engine/save';
import { BrowserStore, MemoryStore } from '../../src/engine/storage';
import { miniStory, permissiveAssets } from './fixtures';

const summary = { sceneTitle: 't', text: 'x', route: null };

/** 같은 origin 의 localStorage 흉내. full=true 이면 쓰기가 용량 초과로 실패한다(브라우저처럼 옛 값은 남김) */
function fakeLocalStorage() {
  const map = new Map<string, string>();
  const ls = {
    full: false,
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem(k: string, v: string) {
      if (ls.full) throw new DOMException('quota', 'QuotaExceededError');
      map.set(k, String(v));
    },
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  };
  return ls;
}

/** 다른 탭에서 저장소가 바뀌었을 때 브라우저가 보내는 'storage' 이벤트 */
function storageEvent(key: string | null, storageArea: unknown): Event {
  return Object.assign(new Event('storage'), { key, storageArea });
}

describe('탭 두 개에서 전역 기록', () => {
  it('늦게 쓴 탭이 먼저 쓴 탭의 읽음·엔딩 기록을 지우지 않는다(합집합으로 쓴다)', () => {
    const story = miniStory();
    const store = new MemoryStore(true);
    // 두 탭이 거의 동시에 열려 둘 다 빈 기록으로 시작
    const tabA = new SaveManager(store, story, permissiveAssets);
    const tabB = new SaveManager(store, story, permissiveAssets);

    const aRead = ['c1.010', 'c1.020', 'c1.a10', 'c1.030', 'c1.040', 'o1.010', 'o2.010', 'c1.b10'];
    for (const id of aRead) tabA.markRead(id);
    tabA.markEnding('osana');
    tabA.flushGlobal();

    tabB.markRead('t1.010');
    tabB.markEnding('tenko');
    tabB.flushGlobal();

    const fresh = new SaveManager(store, story, permissiveAssets);
    expect(fresh.readCount()).toBe(aRead.length + 1);
    for (const id of [...aRead, 't1.010']) expect(fresh.isRead(id)).toBe(true);
    expect(fresh.endingsReached().sort()).toEqual(['osana', 'tenko']);

    // B 도 쓰는 순간 A 의 기록을 받아 '읽은 대사만 건너뛰기' 판정이 맞아진다
    expect(tabB.isRead('c1.010')).toBe(true);
    // A 가 아무것도 바꾸지 않고 다시 써도(탭 전환·닫기) B 의 기록이 남는다
    tabA.flushGlobal();
    expect(new SaveManager(store, story, permissiveAssets).isRead('t1.010')).toBe(true);
  });

  it("다른 탭이 기록하면 'storage' 이벤트로 바로 합쳐진다", () => {
    const story = miniStory();
    const ls = fakeLocalStorage();
    const eventsA = new EventTarget();
    const eventsB = new EventTarget();
    const tabA = new SaveManager(new BrowserStore(ls as unknown as Storage, eventsA), story, permissiveAssets);
    const tabB = new SaveManager(new BrowserStore(ls as unknown as Storage, eventsB), story, permissiveAssets);

    tabA.markRead('c1.010');
    tabA.markEnding('osana');
    expect(tabB.isRead('c1.010')).toBe(false);
    // 브라우저는 쓴 탭이 아닌 다른 탭에만 이벤트를 보낸다
    eventsB.dispatchEvent(storageEvent('ashita.global', ls));
    expect(tabB.isRead('c1.010')).toBe(true);
    expect(tabB.endingsReached()).toEqual(['osana']);
    // 다른 저장소(sessionStorage 등) 이벤트는 무시
    ls.setItem('ashita.global', JSON.stringify({ schema: 1, read: ['c1.020'], endings: [] }));
    eventsB.dispatchEvent(storageEvent('ashita.global', {}));
    expect(tabB.isRead('c1.020')).toBe(false);
  });
});

describe('용량 초과 시 메모리 대체 저장', () => {
  it('대체 저장한 값을 같은 탭에서 바로 불러오고, 다시 저장에 성공하면 영구 저장으로 돌아온다', () => {
    const ls = fakeLocalStorage();
    const store = new BrowserStore(ls as unknown as Storage, null);
    expect(store.set('k', 'OLD')).toBe(true);
    ls.full = true;
    expect(store.set('k', 'NEW')).toBe(false);
    expect(store.persistent).toBe(false);
    expect(ls.getItem('k')).toBe('OLD'); // 새로고침 대비 영구 저장본은 남아 있다
    expect(store.get('k')).toBe('NEW');
    ls.full = false;
    expect(store.set('k', 'NEWER')).toBe(true);
    expect(store.get('k')).toBe('NEWER');
    expect(store.persistent).toBe(true);
    store.remove('k');
    expect(store.get('k')).toBeNull();
  });

  it("'이 탭에서만 저장됐어요' 뒤에 같은 탭에서 그 슬롯을 불러오면 방금 저장한 위치가 열린다", () => {
    const story = miniStory();
    const ls = fakeLocalStorage();
    const sm = new SaveManager(new BrowserStore(ls as unknown as Storage, null), story, permissiveAssets);
    const state = newGameState(story);
    settle(story, state);
    expect(sm.write('1', state, summary)).toBe(true);
    advance(story, state);
    ls.full = true;
    expect(sm.write('1', state, { ...summary, text: '새 위치' })).toBe(false);
    const r = sm.load('1');
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.data.state.stepId).toBe('c1.020');
    expect(sm.peek('1')).toMatchObject({ empty: false, summary: { text: '새 위치' } });
  });
});
