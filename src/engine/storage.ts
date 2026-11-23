/**
 * localStorage 안전 래퍼.
 * 사생활 보호 모드·저장소 차단·용량 초과 등으로 접근이 실패해도 게임이 멈추지 않도록
 * 메모리 저장소로 대체하고, 그 사실을 persistent=false 로 알려 준다.
 */
export interface KeyValueStore {
  readonly persistent: boolean;
  get(key: string): string | null;
  set(key: string, value: string): boolean;
  remove(key: string): void;
  keys(): string[];
  /**
   * 다른 탭이 같은 저장소를 바꿨을 때 알림을 받는다(key 가 null 이면 전체 삭제).
   * 해제 함수를 돌려준다. 탭 간 공유가 없는 저장소는 구현하지 않는다.
   */
  watch?(listener: (key: string | null) => void): () => void;
}

export class MemoryStore implements KeyValueStore {
  readonly persistent: boolean;
  private map = new Map<string, string>();
  constructor(persistent = false) {
    this.persistent = persistent;
  }
  get(key: string) {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  set(key: string, value: string) {
    this.map.set(key, value);
    return true;
  }
  remove(key: string) {
    this.map.delete(key);
  }
  keys() {
    return [...this.map.keys()];
  }
}

/** 'storage' 이벤트를 받을 대상(브라우저에서는 window). 테스트에서 바꿔 끼울 수 있게 최소 형태만 쓴다 */
export interface StorageEventSource {
  addEventListener(type: 'storage', listener: (e: Event) => void): void;
  removeEventListener(type: 'storage', listener: (e: Event) => void): void;
}

export class BrowserStore implements KeyValueStore {
  /**
   * localStorage 에 쓰지 못한 값(용량 초과 등). 이 탭에서는 여기 있는 값이 localStorage 의 옛 값보다 새것이므로
   * get() 은 항상 이쪽을 먼저 본다('이 탭에서만 저장됐어요' 안내와 실제 불러오기가 일치하도록).
   */
  private fallback = new MemoryStore();
  /** localStorage 읽기 자체가 실패한 적이 있음 */
  private broken = false;
  constructor(
    private ls: Storage,
    private events: StorageEventSource | null = defaultEventSource(),
  ) {}
  /** 지금 이 탭의 모든 값이 브라우저 저장소에 실제로 들어가 있는가 */
  get persistent(): boolean {
    return !this.broken && this.fallback.keys().length === 0;
  }
  get(key: string) {
    const mem = this.fallback.get(key);
    if (mem !== null) return mem;
    try {
      return this.ls.getItem(key);
    } catch {
      this.broken = true;
      return null;
    }
  }
  set(key: string, value: string) {
    try {
      this.ls.setItem(key, value);
      // 이제 영구 저장본이 최신이므로 오래된 대체 값은 버린다
      this.fallback.remove(key);
      return true;
    } catch {
      // 용량 초과 등: 메모리에라도 남겨 이번 탭에서는 이어지게 한다(localStorage 의 옛 값은 새로고침 대비로 남겨 둔다)
      this.fallback.set(key, value);
      return false;
    }
  }
  remove(key: string) {
    try {
      this.ls.removeItem(key);
    } catch {
      /* 무시 */
    }
    this.fallback.remove(key);
  }
  keys() {
    const out = new Set<string>(this.fallback.keys());
    try {
      for (let i = 0; i < this.ls.length; i++) {
        const k = this.ls.key(i);
        if (k) out.add(k);
      }
    } catch {
      /* 무시 */
    }
    return [...out];
  }
  watch(listener: (key: string | null) => void): () => void {
    const src = this.events;
    if (!src) return () => {};
    const handler = (e: Event) => {
      const se = e as Event & { key?: string | null; storageArea?: unknown };
      if (se.storageArea != null && se.storageArea !== this.ls) return; // sessionStorage 등 다른 저장소
      listener(se.key ?? null);
    };
    src.addEventListener('storage', handler);
    return () => src.removeEventListener('storage', handler);
  }
}

function defaultEventSource(): StorageEventSource | null {
  const g = globalThis as unknown as Partial<StorageEventSource>;
  return typeof g.addEventListener === 'function' && typeof g.removeEventListener === 'function' ? (g as StorageEventSource) : null;
}

export function openStore(): KeyValueStore {
  try {
    const ls = globalThis.localStorage;
    if (!ls) return new MemoryStore();
    const probe = '__vn_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return new BrowserStore(ls);
  } catch {
    return new MemoryStore();
  }
}
