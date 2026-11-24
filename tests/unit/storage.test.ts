/**
 * 저장소 회귀 테스트
 * - 탭 두 개: 한 탭의 전역 기록(읽은 대사·엔딩) 쓰기가 다른 탭의 기록을 통째로 덮어쓰던 결함
 * - 용량 초과: 메모리 대체 저장 뒤에도 get() 이 localStorage 의 옛 값을 먼저 돌려주던 결함
 * - 칸별 영구 저장 판단: 저장소 전체 기준(persistent)으로 판단해 다른 칸이 이 탭에만 있으면 영구 저장된 칸도
 *   '사라져요'로 보던 결함, 플레이 중 자동 저장이 실패해도 알 수 없던 결함(isPersisted / saveSlot / slotPersisted)
 */
import { describe, expect, it } from 'vitest';
import { advance, newGameState, settle } from '../../src/engine/runner';
import { SaveManager } from '../../src/engine/save';
import { BrowserStore, MemoryStore, isQuotaError, openStore } from '../../src/engine/storage';
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

  it("'이 탭에만 저장됐어요' 뒤에 같은 탭에서 그 슬롯을 불러오면 방금 저장한 위치가 열린다", () => {
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

describe('칸(키)별 영구 저장 판단', () => {
  it('쓰기에 실패한 키만 isPersisted=false 이고, localStorage 의 옛 값은 지우지 않으며, 다시 성공하면 영구 저장으로 돌아온다', () => {
    const ls = fakeLocalStorage();
    const store = new BrowserStore(ls as unknown as Storage, null);
    expect(store.set('ashita.save.auto', 'S1')).toBe(true);
    expect(store.isPersisted('ashita.save.auto')).toBe(true);
    ls.full = true;
    expect(store.set('ashita.save.auto', 'S2')).toBe(false);
    // 같은 탭에서는 새 값, 브라우저 저장소(새로고침하면 보일 값)에는 옛 값 그대로
    expect(store.get('ashita.save.auto')).toBe('S2');
    expect(store.isPersisted('ashita.save.auto')).toBe(false);
    expect(ls.getItem('ashita.save.auto')).toBe('S1');
    expect(store.getPersisted('ashita.save.auto')).toBe('S1');
    expect(store.canPersist).toBe(true);
    // 실패가 이어져도 옛 값은 남는다
    expect(store.set('ashita.save.auto', 'S3')).toBe(false);
    expect(ls.getItem('ashita.save.auto')).toBe('S1');
    ls.full = false;
    expect(store.set('ashita.save.auto', 'S4')).toBe(true);
    expect(store.isPersisted('ashita.save.auto')).toBe(true);
    expect(ls.getItem('ashita.save.auto')).toBe('S4');
    expect(store.get('ashita.save.auto')).toBe('S4');
    // 대체 저장소가 비었다(저장소 전체 기준도 다시 영구)
    expect(store.persistent).toBe(true);
    expect(store.keys().filter((k) => k === 'ashita.save.auto')).toHaveLength(1);
  });

  it('다른 키가 대체 저장소에 있어도 이 키의 판단은 바뀌지 않는다(저장소 전체 기준 persistent 와 다르다)', () => {
    const ls = fakeLocalStorage();
    const store = new BrowserStore(ls as unknown as Storage, null);
    ls.full = true;
    expect(store.set('ashita.save.3', 'tab')).toBe(false);
    ls.full = false;
    expect(store.set('ashita.save.auto', 'disk')).toBe(true);
    expect(store.persistent).toBe(false); // 3번 칸 때문에 전체 기준은 false
    expect(store.isPersisted('ashita.save.auto')).toBe(true);
    expect(store.isPersisted('ashita.save.3')).toBe(false);
    // 아직 쓰지 않은 키(없음)는 잃을 것이 없으므로 영구로 본다
    expect(store.isPersisted('ashita.save.quick')).toBe(true);
    // 지우면 대체 값도 함께 지워진다
    store.remove('ashita.save.3');
    expect(store.isPersisted('ashita.save.3')).toBe(true);
    expect(store.persistent).toBe(true);
  });

  it('메모리 저장소(브라우저 저장소를 쓸 수 없음)는 set 이 성공해도 영구가 아니다. 테스트용 MemoryStore(true)만 영구', () => {
    const mem = new MemoryStore();
    expect(mem.set('k', 'v')).toBe(true);
    expect(mem.isPersisted('k')).toBe(false);
    expect(mem.canPersist).toBe(false);
    expect(mem.getPersisted('k')).toBeNull();
    const fake = new MemoryStore(true);
    fake.set('k', 'v');
    expect(fake.isPersisted('k')).toBe(true);
    expect(fake.getPersisted('k')).toBe('v');
  });

  it('localStorage 읽기가 실패하면(차단) 모든 키가 영구가 아니고 canPersist=false', () => {
    const ls = fakeLocalStorage();
    const store = new BrowserStore(ls as unknown as Storage, null);
    store.set('k', 'v');
    (ls as { getItem: (k: string) => string | null }).getItem = () => {
      throw new DOMException('denied', 'SecurityError');
    };
    expect(store.get('other')).toBeNull();
    expect(store.canPersist).toBe(false);
    expect(store.isPersisted('k')).toBe(false);
  });

  it('SaveManager.saveSlot·slotPersisted: 칸마다 따로 판단하고, 새로고침하면 보일 요약(peekPersisted)은 옛 위치다', () => {
    const story = miniStory();
    const ls = fakeLocalStorage();
    const sm = new SaveManager(new BrowserStore(ls as unknown as Storage, null), story, permissiveAssets);
    const state = newGameState(story);
    settle(story, state);
    expect(sm.slotDurability('auto')).toBeNull();
    expect(sm.saveSlot('auto', state, { ...summary, text: 'S1' })).toBe('persisted');
    expect(sm.saveSlot('5', state, { ...summary, text: '5번' })).toBe('persisted');
    advance(story, state);
    ls.full = true;
    expect(sm.saveSlot('auto', state, { ...summary, text: 'S2' })).toBe('tab-only');
    expect(sm.saveSlot('3', state, { ...summary, text: '3번' })).toBe('tab-only');
    expect(sm.slotPersisted('auto')).toBe(false);
    expect(sm.slotDurability('3')).toBe('tab-only');
    expect(sm.slotDurability('5')).toBe('persisted'); // 다른 칸이 이 탭에만 있어도 5번은 영구
    expect(sm.persistent).toBe(false); // 전체 기준은 칸 판단에 쓰지 않는다
    // 같은 탭: 최신(S2) / 새로고침하면: S1
    expect(sm.peek('auto')).toMatchObject({ empty: false, summary: { text: 'S2' } });
    expect(sm.peekPersisted('auto')).toMatchObject({ empty: false, summary: { text: 'S1' } });
    const loaded = sm.load('auto');
    expect(loaded.status === 'ok' && loaded.data.state.stepId).toBe('c1.020');
    const fresh = new SaveManager(new BrowserStore(ls as unknown as Storage, null), story, permissiveAssets);
    expect(fresh.peek('auto')).toMatchObject({ empty: false, summary: { text: 'S1' } });
    expect(fresh.exists('3')).toBe(false);
    // 회복: 자동 저장이 다시 영구가 되어도 3번 칸은 여전히 이 탭에만
    ls.full = false;
    expect(sm.saveSlot('auto', state, { ...summary, text: 'S3' })).toBe('persisted');
    expect(sm.slotPersisted('auto')).toBe(true);
    expect(sm.slotDurability('3')).toBe('tab-only');
    expect(sm.peekPersisted('auto')).toMatchObject({ summary: { text: 'S3' } });
    expect(new SaveManager(new BrowserStore(ls as unknown as Storage, null), story, permissiveAssets).peek('auto')).toMatchObject({
      summary: { text: 'S3' },
    });
  });

  it('SaveManager: 메모리 저장소에서는 write 가 true 여도 saveSlot 은 tab-only', () => {
    const story = miniStory();
    const sm = new SaveManager(new MemoryStore(), story, permissiveAssets);
    const state = newGameState(story);
    settle(story, state);
    expect(sm.write('quick', state, summary)).toBe(true);
    expect(sm.saveSlot('quick', state, summary)).toBe('tab-only');
    expect(sm.canPersist).toBe(false);
    expect(sm.peekPersisted('quick')).toEqual({ empty: true });
  });
});

describe('openStore', () => {
  function withLocalStorage(value: unknown, fn: () => void) {
    const orig = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => value });
    try {
      fn();
    } finally {
      if (orig) Object.defineProperty(globalThis, 'localStorage', orig);
      else delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  }

  it('저장 공간이 가득 차 시험 쓰기가 실패해도 브라우저 저장소를 쓴다(이전 진행을 새로고침 뒤에도 불러올 수 있게)', () => {
    const ls = fakeLocalStorage();
    ls.setItem('ashita.save.auto', 'S1');
    ls.full = true;
    withLocalStorage(ls, () => {
      const store = openStore();
      expect(store).toBeInstanceOf(BrowserStore);
      expect(store.get('ashita.save.auto')).toBe('S1');
      expect(store.canPersist).toBe(true);
      expect(store.set('ashita.save.auto', 'S2')).toBe(false);
      expect(store.isPersisted('ashita.save.auto')).toBe(false);
      expect(ls.getItem('ashita.save.auto')).toBe('S1');
    });
  });

  it('용량 초과가 아닌 쓰기 실패(차단)는 메모리 저장소', () => {
    const ls = fakeLocalStorage();
    (ls as { setItem: (k: string, v: string) => void }).setItem = () => {
      throw new DOMException('denied', 'SecurityError');
    };
    withLocalStorage(ls, () => {
      const store = openStore();
      expect(store).toBeInstanceOf(MemoryStore);
      expect(store.canPersist).toBe(false);
    });
  });

  it('isQuotaError: 브라우저별 용량 초과 예외를 알아본다', () => {
    expect(isQuotaError(new DOMException('q', 'QuotaExceededError'))).toBe(true);
    expect(isQuotaError({ name: 'NS_ERROR_DOM_QUOTA_REACHED' })).toBe(true);
    expect(isQuotaError({ code: 22 })).toBe(true);
    expect(isQuotaError(new DOMException('d', 'SecurityError'))).toBe(false);
    expect(isQuotaError(null)).toBe(false);
  });
});
