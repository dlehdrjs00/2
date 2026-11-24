/**
 * 자동 저장 상태 기계(src/ui/savestatus.ts AutoSaveTracker) 회귀 테스트
 * - 실제 용량 초과에서 알림이 몇 줄마다 번갈아 뜨던 결함: 가득 찬 저장소에서도 같은 칸을 더 짧은 값으로 덮어쓰는 것은
 *   성공하므로, 대화 기록이 상한(LOG_LIMIT)에 닿아 자동 저장 크기가 줄마다 오르내리면 성공·실패가 번갈아 났고
 *   그때마다 경고·회복 토스트가 떴다. 여기서는 Chromium 처럼 '늘어나는 만큼만' 용량을 따지는 가짜 localStorage 와
 *   실제 대본으로 game.ts 의 자동 저장 흐름(기록 추가 → saveSlot('auto') → tracker.saved)을 돌린다.
 * - 한 번의 읽기 실패 뒤 모든 칸이 영원히 '이 탭에만'으로 남던 결함(BrowserStore.broken)
 * - 용량이 0인 저장소(옛 iOS Safari 사생활 보호 모드)를 '쓰기 실패'로 분류하던 결함(openStore)
 */
import { describe, expect, it } from 'vitest';
import { STORY } from '../../src/story';
import { manifestChecker } from '../../src/story/checker';
import { advance, choose, LOG_LIMIT, newGameState, pushLog, settle, type StepResult } from '../../src/engine/runner';
import { SaveManager } from '../../src/engine/save';
import { BrowserStore, MemoryStore, openStore, ROOM_PROBE_KEY } from '../../src/engine/storage';
import type { GameState } from '../../src/engine/types';
import {
  AUTOSAVE_HEADROOM,
  AUTOSAVE_REPEAT_MS,
  AutoSaveTracker,
  autosaveChipRow,
  type AutoSaveNotice,
  type AutoSaveStatus,
} from '../../src/ui/savestatus';

const checker = manifestChecker(() => true);

/** Chromium 식 localStorage: (키+값) 길이 합으로 용량을 재고, 덮어쓸 때는 늘어나는 만큼만 본다 */
function quotaLocalStorage(quota = 50_000_000) {
  const map = new Map<string, string>();
  let used = 0;
  const size = (k: string, v: string) => k.length + v.length;
  const ls = {
    quota,
    failGet: false,
    get used() {
      return used;
    },
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem(k: string) {
      if (ls.failGet) throw new DOMException('denied', 'SecurityError');
      return map.has(k) ? map.get(k)! : null;
    },
    setItem(k: string, v: string) {
      v = String(v);
      const old = map.has(k) ? size(k, map.get(k)!) : 0;
      const next = size(k, v);
      if (used - old + next > ls.quota) throw new DOMException('quota', 'QuotaExceededError');
      used += next - old;
      map.set(k, v);
    },
    removeItem(k: string) {
      if (map.has(k)) used -= size(k, map.get(k)!);
      map.delete(k);
    },
    clear() {
      map.clear();
      used = 0;
    },
  };
  return ls;
}

/** game.ts 의 진행·자동 저장 흐름(present → pushLog → autosave → tracker.saved)을 DOM 없이 */
class Play {
  tracker: AutoSaveTracker;
  state: GameState = newGameState(STORY);
  res: StepResult;
  line = 0;
  notices: Array<{ line: number; kind: AutoSaveNotice }> = [];
  statuses: AutoSaveStatus[] = [];
  /** 상태와 실제 저장 여부가 어긋난 줄(요구: 다시 저장에 성공하면 실제로 저장됐음을 반영) */
  mismatches: string[] = [];
  clock = 0;
  constructor(
    public saves: SaveManager,
    tracker?: AutoSaveTracker,
  ) {
    this.tracker = tracker ?? new AutoSaveTracker(() => this.clock);
    this.res = settle(STORY, this.state);
    this.present();
  }
  private summary() {
    const step = this.res.step as { t: string; text?: string; prompt?: string };
    let text = step.t === 'choice' ? `[선택지] ${step.prompt ?? ''}` : (step.text ?? '');
    if (text.length > 64) text = `${text.slice(0, 63)}…`;
    return { sceneTitle: STORY.scenes[this.state.sceneId]?.title ?? '', text, route: this.state.route };
  }
  autosave() {
    const d = this.saves.saveSlot('auto', this.state, this.summary());
    const c = this.tracker.saved({ persisted: d === 'persisted', canPersist: this.saves.canPersist, hasRoom: () => this.saves.hasRoom(AUTOSAVE_HEADROOM) });
    if (c.notice) this.notices.push({ line: this.line, kind: c.notice });
    this.statuses.push(c.status);
    const persisted = this.saves.slotPersisted('auto');
    if (persisted !== (c.status === 'ok' || c.status === 'low-space')) this.mismatches.push(`${this.line}:${c.status}/${persisted}`);
  }
  present() {
    const step = this.res.step;
    if (step.t === 'say') {
      pushLog(this.state, { id: step.id, name: step.who ?? null, text: step.text, kind: step.who ? 'say' : 'mono' });
      this.autosave();
    } else if (step.t === 'card') {
      pushLog(this.state, { id: step.id, name: null, text: step.sub ? `${step.text} · ${step.sub}` : step.text, kind: 'card' });
      this.autosave();
    } else if (step.t === 'choice') this.autosave();
    else if (step.t === 'ending') {
      this.saves.remove('auto');
      this.tracker.cleared();
    }
  }
  /** 한 줄(선택지는 첫 선택지). 엔딩이면 false */
  step(): boolean {
    const step = this.res.step;
    if (step.t === 'ending') return false;
    this.line++;
    this.clock += 3000; // 한 줄 3초
    if (step.t === 'choice') {
      const opt = step.options[0];
      pushLog(this.state, { id: `${step.id}:${opt.id}`, name: null, text: `▶ ${opt.text}`, kind: 'choice' });
      this.res = choose(STORY, this.state, opt.id)!;
    } else {
      this.saves.markRead(step.id);
      this.res = advance(STORY, this.state)!;
    }
    this.saves.flushGlobal();
    this.present();
    return true;
  }
  run(n: number) {
    let k = 0;
    while (k < n && this.step()) k++;
    return k;
  }
}

function open(quota?: number) {
  const ls = quotaLocalStorage(quota);
  const saves = new SaveManager(new BrowserStore(ls as unknown as Storage, null), STORY, checker);
  return { ls, saves };
}

describe('실제 용량 초과(늘어나는 만큼만 따짐)에서 자동 저장 알림', () => {
  it.each([130, 150, 160, 170, 190])('기록이 상한에 닿은 뒤(%i줄째) 저장 공간이 꽉 차면 60줄 동안 경고 한 번뿐이고, 상태는 실제 저장 여부를 따른다', (at) => {
    const { ls, saves } = open();
    const p = new Play(saves);
    p.run(at);
    expect(p.state.log.length).toBe(LOG_LIMIT);
    expect(p.tracker.status).toBe('ok');
    // 같은 origin 의 다른 앱이 저장소를 꽉 채움(남은 공간 0)
    ls.quota = ls.used;
    const from = p.statuses.length;
    const ran = p.run(60);
    expect(ran).toBeGreaterThan(30);
    const during = p.statuses.slice(from);
    // 저장이 성공·실패를 오가도(같거나 짧은 값은 덮어써진다) 알림은 문제 구간이 시작할 때 한 번
    expect(p.notices.map((n) => n.kind)).toEqual(['failed']);
    const first = during.indexOf('tab-only');
    expect(first).toBeGreaterThanOrEqual(0);
    // 첫 실패 뒤로는 회복으로 보지 않는다(여유 공간이 없음): 성공한 줄은 low-space(저장됨·공간 부족), 실패한 줄은 tab-only
    // (첫 실패 전에는 자동 저장이 짧아지는 동안 덮어쓰기가 성공해 ok 로 남을 수 있다)
    expect(during.slice(first)).not.toContain('ok');
    expect(during.slice(first)).toContain('low-space');
    expect(p.mismatches).toEqual([]);
  });

  it('남은 공간이 조금(200자) 있어도 알림은 2번 이하', () => {
    const { ls, saves } = open();
    const p = new Play(saves);
    p.run(150);
    ls.quota = ls.used + 200;
    p.run(80);
    expect(p.notices.length).toBeLessThanOrEqual(2);
    expect(p.notices.filter((n) => n.kind === 'failed').length).toBeLessThanOrEqual(1);
    expect(p.mismatches).toEqual([]);
  });

  it('공간이 생기면 다음 자동 저장에서 회복을 한 번 알리고, 그 뒤 60줄 동안은 더 알리지 않는다(저장 위치도 최신)', () => {
    const { ls, saves } = open();
    const p = new Play(saves);
    p.run(150);
    const full = ls.used;
    ls.quota = full;
    p.run(10);
    expect(p.notices.map((n) => n.kind)).toEqual(['failed']);
    // 쓰지 않는 칸 하나만큼(약 1만 자) 비움
    ls.quota = full + 10_000;
    p.run(1);
    expect(p.tracker.status).toBe('ok');
    expect(p.notices.map((n) => n.kind)).toEqual(['failed', 'recovered']);
    expect(JSON.parse(ls.getItem(saves.slotKey('auto'))!).state.stepId).toBe(p.state.stepId);
    expect(ls.getItem(ROOM_PROBE_KEY)).toBeNull(); // 재 보는 임시 키는 남기지 않는다
    p.run(60);
    expect(p.notices.map((n) => n.kind)).toEqual(['failed', 'recovered']);
    expect(p.mismatches).toEqual([]);
  });

  it('대조: 기록이 늘어나는 동안(상한 전) 가득 차면 실패가 이어져 경고 한 번, 상태 tab-only 유지', () => {
    const { ls, saves } = open();
    const p = new Play(saves);
    p.run(20);
    ls.quota = ls.used;
    const from = p.statuses.length;
    p.run(60);
    expect(p.notices.map((n) => n.kind)).toEqual(['failed']);
    expect(new Set(p.statuses.slice(from + 1))).toEqual(new Set(['tab-only']));
  });

  it('다른 칸(퀵)이 이 탭에만 있어도 자동 저장 상태는 바뀌지 않는다', () => {
    const { ls, saves } = open();
    const p = new Play(saves);
    p.run(10);
    ls.quota = ls.used + 10;
    expect(saves.saveSlot('quick', p.state, { sceneTitle: 'q', text: 'q', route: null })).toBe('tab-only');
    ls.quota = 50_000_000;
    p.run(1);
    expect(p.tracker.status).toBe('ok');
    expect(p.notices).toEqual([]);
    expect(saves.slotPersisted('quick')).toBe(false);
  });
});

describe('AutoSaveTracker 규칙', () => {
  const ok = { persisted: true, canPersist: true, hasRoom: () => true };
  const fail = { persisted: false, canPersist: true, hasRoom: () => false };
  const tight = { persisted: true, canPersist: true, hasRoom: () => false };

  it('문제 구간 안의 tab-only ↔ low-space 는 알리지 않고, 여유 공간이 있을 때만 회복', () => {
    const t = new AutoSaveTracker(() => 0);
    expect(t.saved(ok)).toEqual({ status: 'ok', changed: true, notice: null });
    expect(t.saved(ok)).toEqual({ status: 'ok', changed: false, notice: null });
    expect(t.saved(fail)).toEqual({ status: 'tab-only', changed: true, notice: 'failed' });
    expect(t.saved(fail).notice).toBeNull();
    expect(t.saved(tight)).toEqual({ status: 'low-space', changed: true, notice: null });
    expect(t.saved(fail)).toEqual({ status: 'tab-only', changed: true, notice: null });
    expect(t.saved(tight).notice).toBeNull();
    expect(t.saved(ok)).toEqual({ status: 'ok', changed: true, notice: 'recovered' });
  });

  it('여유 공간은 문제 구간 안에서 저장에 성공했을 때만 재 본다(평소에는 임시 키를 쓰지 않는다)', () => {
    const t = new AutoSaveTracker(() => 0);
    let probes = 0;
    const counted = (persisted: boolean, room: boolean) => ({ persisted, canPersist: true, hasRoom: () => (probes++, room) });
    for (let i = 0; i < 5; i++) t.saved(counted(true, true));
    expect(probes).toBe(0);
    t.saved(counted(false, false));
    expect(probes).toBe(0);
    t.saved(counted(true, false));
    t.saved(counted(true, true));
    expect(probes).toBe(2);
    t.saved(counted(true, true));
    expect(probes).toBe(2);
  });

  it('경고는 회복 직후라도 늘 띄우고, 회복 알림만 AUTOSAVE_REPEAT_MS 안에 다시 띄우지 않는다(상태는 그대로 바뀐다)', () => {
    let now = 0;
    const t = new AutoSaveTracker(() => now);
    t.saved(ok);
    expect(t.saved(fail).notice).toBe('failed');
    now += 1000;
    expect(t.saved(ok).notice).toBe('recovered');
    now += 1000;
    // 회복 알림을 본 직후 다시 실패해도 경고는 빠지지 않는다(마지막으로 본 알림이 '회복'인 채 진행을 잃지 않게)
    expect(t.saved(fail)).toEqual({ status: 'tab-only', changed: true, notice: 'failed' });
    now += 1000;
    expect(t.saved(ok)).toEqual({ status: 'ok', changed: true, notice: null });
    now += 1000;
    expect(t.saved(fail).notice).toBe('failed');
    now += AUTOSAVE_REPEAT_MS;
    expect(t.saved(ok).notice).toBe('recovered');
  });

  it('처음부터 저장소를 쓸 수 없으면 memoryOnly 를 페이지마다 한 번, 엔딩(cleared) 뒤 새 게임에서는 다시 안 뜬다', () => {
    const t = new AutoSaveTracker(() => 0);
    const mem = { persisted: false, canPersist: false, hasRoom: () => false };
    expect(t.saved(mem).notice).toBe('memoryOnly');
    expect(t.saved(mem).notice).toBeNull();
    expect(t.cleared()).toEqual({ status: 'none', changed: true, notice: null });
    expect(t.cleared().changed).toBe(false);
    expect(t.saved(mem)).toEqual({ status: 'tab-only', changed: true, notice: null });
  });

  it('실제 메모리 저장소 + 대본: 첫 자동 저장에 memoryOnly 한 번, 이후 회차 끝까지 알림 없음', () => {
    const p = new Play(new SaveManager(new MemoryStore(), STORY, checker));
    p.run(400);
    expect(p.notices.map((n) => n.kind)).toEqual(['memoryOnly']);
    expect(p.tracker.status).toBe('none');
  });
});

describe('저장소 상태 판단 보강', () => {
  it('한 번의 읽기 실패 뒤에도 다음 쓰기가 성공하면 영구 저장으로 돌아온다(broken 이 영원히 남지 않음)', () => {
    const { ls, saves } = open();
    const p = new Play(saves);
    p.run(2);
    expect(p.tracker.status).toBe('ok');
    ls.failGet = true;
    expect(saves.exists('quick')).toBe(false); // 어떤 읽기 하나가 실패
    expect(saves.canPersist).toBe(false);
    ls.failGet = false;
    p.run(1);
    expect(ls.getItem(saves.slotKey('auto'))).not.toBeNull();
    expect(saves.canPersist).toBe(true);
    expect(saves.slotPersisted('auto')).toBe(true);
    expect(p.tracker.status).toBe('ok');
    expect(p.notices).toEqual([]);
    expect(p.mismatches).toEqual([]);
  });

  it('읽기 실패가 이어지는 동안은 이 탭에만으로 보고, 읽기가 다시 되면 풀린다', () => {
    const ls = quotaLocalStorage();
    const store = new BrowserStore(ls as unknown as Storage, null);
    store.set('k', 'v');
    ls.failGet = true;
    expect(store.get('other')).toBeNull();
    expect(store.isPersisted('k')).toBe(false);
    expect(store.hasRoom(10)).toBe(false);
    ls.failGet = false;
    expect(store.get('k')).toBe('v');
    expect(store.isPersisted('k')).toBe(true);
    expect(store.canPersist).toBe(true);
  });

  it('hasRoom: 남은 공간만 재고 임시 키를 남기지 않으며 다른 값을 건드리지 않는다', () => {
    const ls = quotaLocalStorage(1000);
    const store = new BrowserStore(ls as unknown as Storage, null);
    store.set('a', 'x'.repeat(500));
    expect(store.hasRoom(400)).toBe(true);
    expect(store.hasRoom(600)).toBe(false);
    expect(ls.getItem(ROOM_PROBE_KEY)).toBeNull();
    expect(ls.used).toBe(501);
    expect(ls.getItem('a')).toHaveLength(500);
    expect(new MemoryStore().hasRoom(1)).toBe(false);
    expect(new MemoryStore(true).hasRoom(1)).toBe(true);
  });

  it('openStore: 비어 있는 저장소에 한 글자도 못 쓰면(용량 0) 처음부터 쓸 수 없는 것으로 본다. 값이 있는 저장소가 가득 찬 것과 구분', () => {
    const swap = (value: unknown, fn: () => void) => {
      const orig = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => value });
      try {
        fn();
      } finally {
        if (orig) Object.defineProperty(globalThis, 'localStorage', orig);
        else delete (globalThis as { localStorage?: unknown }).localStorage;
      }
    };
    swap(quotaLocalStorage(0), () => {
      const s = openStore();
      expect(s).toBeInstanceOf(MemoryStore);
      expect(s.canPersist).toBe(false);
    });
    const full = quotaLocalStorage(1000);
    full.setItem('ashita.save.auto', 'S1');
    full.quota = full.used;
    swap(full, () => {
      const s = openStore();
      expect(s).toBeInstanceOf(BrowserStore);
      expect(s.get('ashita.save.auto')).toBe('S1');
    });
  });
});

describe('세로 배치에서 상태 표시 줄(autosaveChipRow)', () => {
  it('무대 위 여백이 넉넉하면 장소 표시 위 줄, 모자라면 장소 표시 아래', () => {
    // 390×844(무대 위끝 약 204px), 360×640(약 113px): 위 줄
    expect(autosaveChipRow(204, 0, 16.38, 44)).toBe('above');
    expect(autosaveChipRow(113, 0, 16, 44)).toBe('above');
    // 위 여백이 거의 없는 정사각형에 가까운 창
    expect(autosaveChipRow(15, 0, 22, 48)).toBe('under');
    // 안전 영역(노치)만큼 위 여백이 줄어든다
    expect(autosaveChipRow(130, 47, 16, 44)).toBe('under');
  });
});
