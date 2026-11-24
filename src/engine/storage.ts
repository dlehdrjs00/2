/**
 * localStorage 안전 래퍼.
 * 사생활 보호 모드·저장소 차단·용량 초과 등으로 접근이 실패해도 게임이 멈추지 않도록
 * 메모리 저장소로 대체하고, 그 사실을 알려 준다.
 *
 * 저장이 '영구'인지는 키마다 다르다(용량 초과는 쓰는 값마다 따로 실패한다). 어떤 칸·자동 저장이 새로고침 뒤에도
 * 남는지는 isPersisted(key) 로만 판단한다. persistent 는 저장소 전체 기준이라 칸 하나만 이 탭에 남아도 false 다.
 */
export interface KeyValueStore {
  /** 지금 이 저장소의 모든 값이 브라우저 저장소에 들어가 있는가(저장소 전체 기준. 칸별 판단에는 isPersisted) */
  readonly persistent: boolean;
  /**
   * 브라우저 저장소를 쓰는 저장소인가. 메모리 저장소(처음부터 브라우저 저장소를 쓸 수 없음)나 읽기에 실패한 브라우저
   * 저장소면 false. 쓰기 하나가 용량 초과로 실패한 것과는 다르다(그건 isPersisted 가 키마다 알려 준다)
   */
  readonly canPersist: boolean;
  /**
   * 이 키의 지금 값(get 이 돌려주는 값. 없으면 '없음')이 브라우저 저장소에 그대로 들어가 있는가.
   * false 면 이 탭의 메모리에만 있어 새로고침하거나 탭을 닫으면 사라진다(브라우저 저장소에는 옛 값이 남아 있을 수 있다).
   */
  isPersisted(key: string): boolean;
  /** 브라우저 저장소에 들어 있는 값(새로고침하면 보게 될 값). 메모리에만 있는 새 값은 보지 않는다. 없거나 읽을 수 없으면 null */
  getPersisted(key: string): string | null;
  /**
   * 브라우저 저장소에 지금 글자 chars 개를 더 쓸 자리가 있는가. 임시 키(ROOM_PROBE_KEY)에 써 보고 곧바로 지운다.
   * 용량 초과 뒤 '회복'을 판단할 때만 쓴다: 가득 찬 저장소에서도 같은 키를 같거나 더 짧은 값으로 덮어쓰는 것은
   * 성공하므로, 쓰기 하나의 성공만으로는 공간이 생겼는지 알 수 없다. 브라우저 저장소를 쓸 수 없으면 false
   */
  hasRoom(chars: number): boolean;
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
  /** true 는 테스트에서 '영구 저장소'를 흉내 낼 때만. 실제 대체 저장소(브라우저 저장소를 쓸 수 없음)는 false */
  readonly persistent: boolean;
  private map = new Map<string, string>();
  constructor(persistent = false) {
    this.persistent = persistent;
  }
  get canPersist(): boolean {
    return this.persistent;
  }
  isPersisted(_key: string): boolean {
    return this.persistent;
  }
  getPersisted(key: string): string | null {
    return this.persistent ? this.get(key) : null;
  }
  hasRoom(_chars: number): boolean {
    return this.persistent;
  }
  has(key: string): boolean {
    return this.map.has(key);
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
   * get() 은 항상 이쪽을 먼저 본다('이 탭에만 저장됐어요' 안내·저장 칸의 '이 탭에만' 배지와 실제 불러오기가 일치하도록).
   */
  private fallback = new MemoryStore();
  /**
   * 마지막 localStorage 접근(읽기·쓰기)이 읽기 실패로 끝났음. 다음 읽기나 쓰기가 성공하면 풀린다
   * (한 번의 일시적인 실패로 모든 칸이 영원히 '이 탭에만'으로 보이지 않게)
   */
  private broken = false;
  constructor(
    private ls: Storage,
    private events: StorageEventSource | null = defaultEventSource(),
  ) {}
  /** 지금 이 탭의 모든 값이 브라우저 저장소에 실제로 들어가 있는가(저장소 전체 기준. 칸별 판단에는 isPersisted) */
  get persistent(): boolean {
    return !this.broken && this.fallback.keys().length === 0;
  }
  get canPersist(): boolean {
    return !this.broken;
  }
  /** 이 키만 본다: 다른 키가 대체 저장소에 있어도 이 키의 판단은 바뀌지 않는다 */
  isPersisted(key: string): boolean {
    return !this.broken && !this.fallback.has(key);
  }
  getPersisted(key: string): string | null {
    try {
      return this.ls.getItem(key);
    } catch {
      return null;
    }
  }
  hasRoom(chars: number): boolean {
    if (this.broken) return false;
    try {
      this.ls.setItem(ROOM_PROBE_KEY, 'x'.repeat(Math.max(1, Math.floor(chars))));
      return true;
    } catch {
      return false;
    } finally {
      try {
        this.ls.removeItem(ROOM_PROBE_KEY);
      } catch {
        /* 무시 */
      }
    }
  }
  get(key: string) {
    const mem = this.fallback.get(key);
    if (mem !== null) return mem;
    try {
      const v = this.ls.getItem(key);
      this.broken = false;
      return v;
    } catch {
      this.broken = true;
      return null;
    }
  }
  set(key: string, value: string) {
    try {
      this.ls.setItem(key, value);
      // 이제 영구 저장본이 최신이므로 오래된 대체 값은 버린다. 쓰기가 됐으니 앞선 읽기 실패 표시도 푼다
      this.fallback.remove(key);
      this.broken = false;
      return true;
    } catch {
      // 용량 초과 등: 메모리에라도 남겨 이번 탭에서는 이어지게 한다(localStorage 의 옛 값은 새로고침 대비로 남겨 둔다).
      // 공간을 만들려고 다른 키나 이 키의 옛 영구 저장본을 지우지 않는다(새로고침하면 그 위치로 돌아갈 수 있게)
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

/**
 * 남은 공간을 재 보는 임시 키(hasRoom). 저장 칸·전역 기록 키(ashita.)가 아니라서 다른 탭의 storage 이벤트 처리
 * (SaveManager·game.ts onStoreChanged)는 이 키를 무시한다
 */
export const ROOM_PROBE_KEY = '__vn_room__';

/** 용량 초과 예외인가(브라우저마다 이름·코드가 다르다) */
export function isQuotaError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const x = e as { name?: unknown; code?: unknown };
  return x.name === 'QuotaExceededError' || x.name === 'NS_ERROR_DOM_QUOTA_REACHED' || x.code === 22 || x.code === 1014;
}

/**
 * 브라우저 저장소를 연다. 읽을 수 없으면(차단·사생활 보호 모드 등) 메모리 저장소.
 * 읽을 수는 있지만 시험 쓰기가 용량 초과로 실패하면:
 *  - 저장소에 값이 있으면(저장 공간이 가득 참) 브라우저 저장소를 그대로 쓴다. 이전에 영구 저장한 진행([이어하기]·저장 칸)은
 *    불러올 수 있어야 하고, 새로 쓰는 값은 BrowserStore 가 이 탭 메모리로 대신 받아 칸마다 '이 탭에만'으로 알린다.
 *    (예전에는 메모리 저장소로 바꿔 이전 저장이 모두 안 보였다)
 *  - 저장소가 비어 있는데도 한 글자도 못 쓰면(용량이 0인 저장소. 예: 옛 iOS Safari 사생활 보호 모드) 처음부터 쓸 수 없는
 *    것과 같으므로 메모리 저장소(타이틀에서 알림). 불러올 이전 저장도 없다
 */
export function openStore(): KeyValueStore {
  const probe = '__vn_probe__';
  let ls: Storage | undefined;
  try {
    ls = globalThis.localStorage;
    if (!ls) return new MemoryStore();
    ls.getItem(probe);
  } catch {
    return new MemoryStore();
  }
  try {
    ls.setItem(probe, '1');
    ls.removeItem(probe);
  } catch (e) {
    if (!isQuotaError(e)) return new MemoryStore();
    let empty = false;
    try {
      empty = ls.length === 0;
    } catch {
      return new MemoryStore();
    }
    if (empty) return new MemoryStore();
  }
  return new BrowserStore(ls);
}
