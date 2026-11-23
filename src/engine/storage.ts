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

class BrowserStore implements KeyValueStore {
  persistent = true;
  private fallback = new MemoryStore();
  constructor(private ls: Storage) {}
  get(key: string) {
    try {
      const v = this.ls.getItem(key);
      return v ?? this.fallback.get(key);
    } catch {
      this.persistent = false;
      return this.fallback.get(key);
    }
  }
  set(key: string, value: string) {
    try {
      this.ls.setItem(key, value);
      return true;
    } catch {
      // 용량 초과 등: 메모리에라도 남겨 이번 탭에서는 이어지게 한다
      this.persistent = false;
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
