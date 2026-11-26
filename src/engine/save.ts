/**
 * 저장·불러오기·전역 기록(읽은 대사, 엔딩) 관리.
 *
 * - 저장 데이터에는 스키마 버전(schema)이 들어간다.
 * - 손상/비호환 데이터는 예외를 던지지 않고 결과 객체로 사유를 돌려준다(게임이 멈추지 않게).
 * - 저장 위치는 (sceneId, stepId) 이므로 대사 배열 순서가 바뀌어도 유지된다.
 *   대사가 삭제되어 stepId 를 못 찾으면 '장면 처음부터' 복구를 제안한다.
 *   복구는 장면 진입 스냅샷(state.sceneEntry)으로 점수·선택·플래그·무대·대화 기록을 그 장면에 들어온 순간으로 되돌린다.
 *
 * 스키마 이력
 *   1: 최초 형식
 *   2: state.sceneEntry(장면 진입 스냅샷) 추가. 1 은 그대로 읽고, 복구가 필요하면 최소 규칙으로 되돌린다.
 *   3: 히든 히로인(koharu)·'함께' 선택·해금 플래그(kh.met)·소수 점수. 1·2 는 불러올 때 이전한다(upgradeLegacy):
 *      - 점수와 최근 히로인은 현재 대본의 옵션 정의(개인 가중치·'함께')로 선택 기록에서 다시 계산한다(sceneEntry 도).
 *      - 이미 루트가 있거나 금요일 노을길(c7.j20~j40, 즉 해금 판정 뒤)에 있는 저장은 해금 플래그를 false 로 둬
 *        첫 만남을 소급하지 않는다. 그보다 앞의 공통 저장은 플래그 없이 두어 새 규칙대로 판정한다.
 *      - 위치·루트는 그대로 둔다.
 *   4: 여덟 엔딩 확장(루트 id 'group' = 히든 루트, 엔딩 8개, 후반 선택 6회 +0.5). 3 은 불러올 때 이전한다(markLegacyLate):
 *      - 1·2 의 재계산(upgradeLegacy)을 타지 않는다. 점수·선택·위치·루트는 그대로 둔다.
 *      - 해금(kh.met = true)·루트 미확정이고 옛 후반 선택(c8.ch·c9.ch·c10.ch)을 하나라도 했거나 옛 후반 장면
 *        (c8_bakery·c9_puzzle·c10_window)에 있으면 구저장 표식 flags['kh.late3'] = true 를 붙인다(sceneEntry 도 같은 규칙).
 *        이 표식이 있으면 실행기는 히든 루트(tieRoute)를 고르지 않는다. 대본도 옛 장면이 옛 판정으로 이어진다.
 *      - 스키마 3 이하에는 루트 'group' 이 있을 수 없으므로 손상으로 본다.
 *   옛 빌드(스키마 3)는 스키마 4 저장을 '더 새로운 버전'으로 안내한다(손상으로 지우지 않는다).
 */
import type { CharId, EndingId, GameState, HeroineId, LogEntry, RouteId, Scene, SceneEntry, StageState, Story } from './types';
import { BASE_HEROINES, HEROINES, isHeroineId, isRouteId } from './types';
import {
  advance,
  choose,
  findChoiceStep,
  findStep,
  initialStage,
  isBlocking,
  LEGACY_LATE_FLAG,
  LOG_LIMIT,
  settle,
  snapshotSceneEntry,
  stepIndex,
  zeroPoints,
  type StepResult,
} from './runner';
import type { KeyValueStore } from './storage';

export const SAVE_SCHEMA = 4;
/**
 * 구판(스키마 1·2) 이전 전용: 해금 판정 뒤에 오는 금요일 노을길 문장. 구판에서 이 위치나 루트 확정 뒤에 저장했으면
 * 첫 만남을 소급하지 않는다(해금 플래그 = false)
 */
export const LEGACY_POST_GATE_SCENE = 'c7_friday';
export const LEGACY_POST_GATE_STEPS: readonly string[] = ['c7.j20', 'c7.j30', 'c7.j40'];
/**
 * 스키마 3 → 4 이전 전용: 옛 후반 선택(+3)과 그 장면. 해금된 진행 중 저장이 이 선택을 하나라도 했거나 이 장면에 있으면
 * 구저장 표식(LEGACY_LATE_FLAG)을 붙여 옛 배점·옛 판정으로 끝까지 가게 한다(대본도 이 장면을 고치지 않는다)
 */
export const LEGACY_LATE_CHOICES: readonly string[] = ['c8.ch', 'c9.ch', 'c10.ch'];
export const LEGACY_LATE_SCENES: readonly string[] = ['c8_bakery', 'c9_puzzle', 'c10_window'];
/** 히든 히로인(코하루) 해금 플래그. 구저장 표식은 해금된 저장에만 붙인다 */
export const LEGACY_MET_FLAG = 'kh.met';
export { LEGACY_LATE_FLAG };
/** 전역 기록(읽은 대사·엔딩) 형식 버전. 슬롯 저장 스키마와 따로 간다 */
export const GLOBAL_SCHEMA = 1;
export const GAME_KEY = 'ashita-mo-issho';
export const KEY_PREFIX = 'ashita.';
/** 수동 저장 칸 수(저장 화면 5쪽 × 6칸) */
export const MANUAL_SLOTS = 30;
/** auto = 자동 저장, quick = 퀵저장(빠른 메뉴), 숫자 = 수동 저장 칸 */
export type SlotId = 'auto' | 'quick' | `${number}`;
/**
 * 한 칸의 저장 상태. persisted = 브라우저 저장소에 들어 있음(새로고침·탭을 닫아도 남음),
 * tab-only = 이 탭의 메모리에만 있음(용량 초과로 쓰기 실패, 또는 브라우저 저장소를 쓸 수 없음).
 * 칸마다 따로 판단한다(다른 칸이 이 탭에만 있어도 이 칸의 판단은 바뀌지 않는다).
 */
export type SlotDurability = 'persisted' | 'tab-only';

export interface SaveSummary {
  sceneTitle: string;
  text: string;
  route: RouteId | null;
}

export type SlotPeek =
  | { empty: true }
  | {
      empty: false;
      broken: boolean;
      savedAt?: string;
      summary?: SaveSummary;
      stage?: GameState['stage'];
      /** 저장한 문장이 대본에서 사라져 '장면 처음부터' 이어야 하는 저장(불러올 때 확인창이 뜬다) */
      recover?: boolean;
    };

export interface SaveData {
  schema: number;
  game: string;
  storyVersion: string;
  savedAt: string;
  summary: SaveSummary;
  state: GameState;
}

export type LoadResult =
  | { status: 'empty' }
  | { status: 'ok'; data: SaveData; notes: string[] }
  | { status: 'recoverable'; data: SaveData; message: string; notes: string[] }
  | { status: 'error'; reason: 'corrupt' | 'schema' | 'foreign' | 'missing-scene'; message: string };

export interface GlobalRecord {
  schema: number;
  read: string[];
  endings: EndingId[];
  /** 한 번이라도 본 이벤트 CG (추억 앨범용). 예전 기록에는 없을 수 있다 */
  cgs?: string[];
}

/** 무대 상태 검증용(에셋 매니페스트 기반) */
export interface StageValidator {
  hasBg(bg: string): boolean;
  hasSprite(char: string, outfit: string, hair: string, expr: string): boolean;
  hasBgm(id: string): boolean;
  /** 이벤트 CG id 확인(없으면 CG 는 그대로 믿는다) */
  hasCg?(id: string): boolean;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isHeroineOrNull = (v: unknown): v is HeroineId | null => v === null || isHeroineId(v);
/** 루트: 히로인 셋 + 히든 루트. allowGroup = false(스키마 3 이하)면 히로인만 */
const isRouteOrNull = (v: unknown, allowGroup = true): v is RouteId | null => v === null || (allowGroup ? isRouteId(v) : isHeroineId(v));
const uniq = (xs: string[]): string[] => [...new Set(xs)];
const hasOwn = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

const GLOBAL_KEY = `${KEY_PREFIX}global`;
/**
 * 전역 기록 보조 키: 도달한 엔딩을 한 번 더 적어 둔다. 옛 빌드(코하루 확장 전)는 전역 기록을 다시 쓸 때 자기가 모르는
 * 엔딩 id 를 걸러 내므로, 옛 탭이 한 번 쓰면 GLOBAL_KEY 의 새 엔딩(koharu)이 사라진다. 옛 빌드는 이 키를 모르고 건드리지 않으므로
 * 읽을 때 두 키의 엔딩을 합친다(GLOBAL_SCHEMA 는 그대로: 옛 빌드가 새 기록을 '알 수 없는 형식'으로 버리지 않게)
 */
const GLOBAL_EXT_KEY = `${KEY_PREFIX}global.ext`;
/**
 * 전역 기록 두 번째 보조 키(여덟 엔딩 확장). 897ae1f 빌드는 GLOBAL_KEY 와 GLOBAL_EXT_KEY 를 둘 다 알고, 다시 쓸 때
 * 자기가 아는 엔딩 3개만 남긴다. 그 빌드가 모르는 이 키가 새 엔딩(일상 쪽·히든 루트) 기록을 지킨다.
 * 읽을 때는 세 키의 엔딩 합집합, 기록할 때는 세 키 모두 쓴다.
 */
const GLOBAL_V2_KEY = `${KEY_PREFIX}global.v2`;
/** 전역 기록이 들어 있는 저장소 키 전부. 다른 탭의 storage 이벤트를 볼 때 이 목록(또는 isGlobalRecordKey)을 쓴다 */
export const GLOBAL_RECORD_KEYS: readonly string[] = [GLOBAL_KEY, GLOBAL_EXT_KEY, GLOBAL_V2_KEY];
/** 저장소 키가 전역 기록(읽은 대사·엔딩·CG)인가. null(전체 삭제)도 true */
export function isGlobalRecordKey(key: string | null): boolean {
  return key === null || GLOBAL_RECORD_KEYS.includes(key);
}
const NOTE_BG = '배경 정보를 복원하지 못했어요';
const NOTE_CHARS = '캐릭터 그림 정보를 일부 복원하지 못했어요';
/** 무대 재구성 때 장면을 다시 실행하는 최대 블로킹 스텝 수 */
const REPLAY_LIMIT = 4000;

/** 무대 검증 결과: 매니페스트에 없어 버린 항목을 함께 기록한다 */
interface StageCheck {
  stage: StageState;
  droppedBg: boolean;
  droppedChars: CharId[];
}

interface SanitizedState {
  state: GameState;
  stage: StageCheck;
  /** sceneEntry 가 있고 쓸 만할 때만 */
  entryStage: StageCheck | null;
}

/** 점수표 검증. 기본 히로인 점수가 없거나 유한하지 않으면 null. 히든 히로인 점수가 없으면 0. 소수 허용 */
function sanitizePoints(v: unknown): Record<HeroineId, number> | null {
  if (!isObj(v)) return null;
  const points = zeroPoints();
  for (const h of HEROINES) {
    if (v[h] === undefined && !BASE_HEROINES.includes(h)) continue;
    const n = Number(v[h]);
    if (!Number.isFinite(n)) return null;
    points[h] = n;
  }
  return points;
}

function sanitizeChoices(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (isObj(v)) for (const [k, x] of Object.entries(v)) if (typeof x === 'string') out[k] = x;
  return out;
}

function sanitizeFlags(v: unknown): GameState['flags'] {
  const out: GameState['flags'] = {};
  if (isObj(v)) {
    for (const [k, x] of Object.entries(v)) {
      if (typeof x === 'string' || typeof x === 'number' || typeof x === 'boolean') out[k] = x;
    }
  }
  return out;
}

function cloneStage(s: StageState): StageState {
  return JSON.parse(JSON.stringify(s)) as StageState;
}

export class SaveManager {
  private readSet: Set<string>;
  private endings: Set<EndingId>;
  private cgsSeen: Set<string>;
  private globalDirty = false;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private store: KeyValueStore,
    private story: Story,
    private stageValidator: StageValidator,
  ) {
    const g = this.readGlobal();
    this.readSet = new Set(g.read);
    this.endings = new Set(g.endings);
    this.cgsSeen = new Set(g.cgs ?? []);
    // 다른 탭이 읽은 대사·엔딩을 기록하면 바로 합쳐 둔다(건너뛰기 판정·엔딩 배지가 탭마다 어긋나지 않게)
    store.watch?.((key) => {
      if (isGlobalRecordKey(key)) this.syncFromStore();
    });
  }

  /** 저장소 전체 기준(모든 값이 브라우저 저장소에 있음). 칸 하나의 판단에는 slotPersisted 를 쓴다 */
  get persistent(): boolean {
    return this.store.persistent;
  }

  /** 브라우저 저장소를 쓰는가(false: 처음부터 쓸 수 없어 모든 저장이 이 탭 메모리에만 남음) */
  get canPersist(): boolean {
    return this.store.canPersist;
  }

  /**
   * 브라우저 저장소에 글자 chars 개를 더 쓸 자리가 있는가(임시 키로 재 본다. storage.ts hasRoom).
   * 자동 저장이 용량 초과로 실패한 뒤 '공간이 생겼는지'를 판단할 때만 쓴다(savestatus.ts AutoSaveTracker)
   */
  hasRoom(chars: number): boolean {
    return this.store.hasRoom(chars);
  }

  /** 이 칸의 지금 내용(없으면 '없음')이 브라우저 저장소에 그대로 들어 있는가. 다른 칸의 상태와 상관없다 */
  slotPersisted(slot: SlotId): boolean {
    return this.store.isPersisted(this.slotKey(slot));
  }

  /** 이 칸에 무엇이 있고 그것이 영구 저장인지. 빈 칸이면 null */
  slotDurability(slot: SlotId): SlotDurability | null {
    if (!this.exists(slot)) return null;
    return this.slotPersisted(slot) ? 'persisted' : 'tab-only';
  }

  slotKey(slot: SlotId): string {
    return `${KEY_PREFIX}save.${slot}`;
  }

  // ---- 전역 기록 ------------------------------------------------------------

  private readGlobal(): GlobalRecord {
    const extra = uniq([...this.readEndingsAt(GLOBAL_EXT_KEY), ...this.readEndingsAt(GLOBAL_V2_KEY)]) as EndingId[];
    const raw = this.store.get(GLOBAL_KEY);
    if (!raw) return { schema: GLOBAL_SCHEMA, read: [], endings: extra };
    try {
      const v = JSON.parse(raw) as unknown;
      if (!isObj(v)) throw new Error('bad');
      const read = Array.isArray(v.read) ? v.read.filter((x): x is string => typeof x === 'string') : [];
      const endings = Array.isArray(v.endings) ? this.knownEndings(v.endings) : [];
      const cgs = Array.isArray(v.cgs) ? v.cgs.filter((x): x is string => typeof x === 'string') : [];
      return { schema: GLOBAL_SCHEMA, read, endings: uniq([...endings, ...extra]) as EndingId[], cgs };
    } catch {
      // 전역 기록이 손상되면 읽음 기록만 잃고 계속한다(보조 키의 엔딩은 살린다)
      return { schema: GLOBAL_SCHEMA, read: [], endings: extra };
    }
  }

  private knownEndings(xs: unknown[]): EndingId[] {
    return xs.filter((x): x is EndingId => typeof x === 'string' && hasOwn(this.story.endings, x));
  }

  /** 보조 키(GLOBAL_EXT_KEY·GLOBAL_V2_KEY)의 엔딩. 없거나 손상되면 빈 목록 */
  private readEndingsAt(key: string): EndingId[] {
    const raw = this.store.get(key);
    if (!raw) return [];
    try {
      const v = JSON.parse(raw) as unknown;
      return isObj(v) && Array.isArray(v.endings) ? this.knownEndings(v.endings) : [];
    } catch {
      return [];
    }
  }

  /**
   * 저장소의 전역 기록을 메모리 기록에 합친다(합집합). 다른 탭이 남긴 기록을 반영할 때 쓴다.
   * 기록을 지우는 기능은 없으므로 합집합만으로 안전하다. 새로 생긴 항목이 있으면 true.
   */
  syncFromStore(): boolean {
    const g = this.readGlobal();
    const before = this.readSet.size + this.endings.size + this.cgsSeen.size;
    for (const id of g.read) this.readSet.add(id);
    for (const e of g.endings) this.endings.add(e);
    for (const c of g.cgs ?? []) this.cgsSeen.add(c);
    return this.readSet.size + this.endings.size + this.cgsSeen.size !== before;
  }

  isRead(stepId: string): boolean {
    return this.readSet.has(stepId);
  }

  markRead(stepId: string): void {
    if (this.readSet.has(stepId)) return;
    this.readSet.add(stepId);
    this.scheduleFlush();
  }

  readCount(): number {
    return this.readSet.size;
  }

  endingsReached(): EndingId[] {
    return [...this.endings];
  }

  markEnding(id: EndingId): void {
    this.endings.add(id);
    this.flushGlobal();
  }

  /** 이벤트 CG 를 본 것으로 기록(추억 앨범 해금) */
  markCg(id: string): void {
    if (this.cgsSeen.has(id)) return;
    this.cgsSeen.add(id);
    this.flushGlobal();
  }

  hasSeenCg(id: string): boolean {
    return this.cgsSeen.has(id);
  }

  cgsSeenList(): string[] {
    return [...this.cgsSeen];
  }

  private scheduleFlush() {
    this.globalDirty = true;
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => this.flushGlobal(), 400);
  }

  flushGlobal(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    // 다른 탭이 그사이 기록한 내용을 먼저 합친 뒤 쓴다(이 탭의 메모리로 통째로 덮어써 기록을 잃지 않게)
    this.syncFromStore();
    const rec: GlobalRecord = { schema: GLOBAL_SCHEMA, read: [...this.readSet], endings: [...this.endings], cgs: [...this.cgsSeen] };
    this.store.set(GLOBAL_KEY, JSON.stringify(rec));
    // 엔딩은 보조 키에도(옛 빌드가 전역 기록을 다시 써서 모르는 엔딩을 지워도 남게). 전역 기록과 같이 매번 쓴다:
    // 용량 초과로 이 탭 메모리에만 남은 값도 다음 기록 때 다시 브라우저 저장소에 들어가게(값이 같다고 건너뛰지 않는다)
    // 두 번째 보조 키(GLOBAL_V2_KEY)는 897ae1f 빌드가 모르는 키라, 그 빌드가 앞의 두 키에서 새 엔딩을 지워도 남는다
    if (rec.endings.length) {
      const ext = JSON.stringify({ endings: rec.endings });
      this.store.set(GLOBAL_EXT_KEY, ext);
      this.store.set(GLOBAL_V2_KEY, JSON.stringify({ schema: GLOBAL_SCHEMA, endings: rec.endings }));
    }
    this.globalDirty = false;
  }

  get hasPendingGlobal(): boolean {
    return this.globalDirty;
  }

  // ---- 슬롯 -----------------------------------------------------------------

  write(slot: SlotId, state: GameState, summary: SaveSummary, now = new Date()): boolean {
    const data: SaveData = {
      schema: SAVE_SCHEMA,
      game: GAME_KEY,
      storyVersion: this.story.version,
      savedAt: now.toISOString(),
      summary,
      state: JSON.parse(JSON.stringify(state)) as GameState,
    };
    return this.store.set(this.slotKey(slot), JSON.stringify(data));
  }

  /**
   * 저장하고, 그 칸이 브라우저 저장소에 실제로 들어갔는지를 돌려준다(write 결과와 칸의 영구 저장 여부를 한 곳에서 판단).
   * write() 의 true 만으로는 알 수 없다: 메모리 저장소(브라우저 저장소를 쓸 수 없음)는 쓰기가 늘 성공한다.
   * 실패해도 다른 칸이나 이 칸의 옛 영구 저장본을 지우지 않는다(같은 탭에서는 새 값을, 새로고침하면 옛 값을 불러온다).
   */
  saveSlot(slot: SlotId, state: GameState, summary: SaveSummary, now = new Date()): SlotDurability {
    const ok = this.write(slot, state, summary, now);
    return ok && this.slotPersisted(slot) ? 'persisted' : 'tab-only';
  }

  /** 새로고침하면 보게 될(브라우저 저장소에 남아 있는) 이 칸의 요약. 이 탭에만 있는 새 값은 보지 않는다 */
  peekPersisted(slot: SlotId): SlotPeek {
    const raw = this.store.getPersisted(this.slotKey(slot));
    if (raw === null) return { empty: true };
    const r = this.parse(raw);
    if (r.status === 'ok' || r.status === 'recoverable') return { empty: false, broken: false, savedAt: r.data.savedAt, summary: r.data.summary };
    return { empty: false, broken: true };
  }

  remove(slot: SlotId): void {
    this.store.remove(this.slotKey(slot));
  }

  exists(slot: SlotId): boolean {
    return this.store.get(this.slotKey(slot)) !== null;
  }

  /**
   * 슬롯 목록 표시용 요약. 손상된 슬롯은 broken: true.
   * stage 는 저장 시점의 무대(배경·캐릭터) — 저장 화면 썸네일을 미니 무대로 다시 그리는 데 쓴다.
   * '장면 처음부터' 복구가 필요한 저장은 recover: true 이고, stage 는 불러오면 처음 보게 될 무대
   * (장면 진입 무대에 장면 앞부분의 배경·등장 지시를 첫 문장까지 적용한 것)다.
   */
  peek(slot: SlotId): SlotPeek {
    const raw = this.store.get(this.slotKey(slot));
    if (raw === null) return { empty: true };
    const r = this.parse(raw);
    if (r.status === 'ok') return { empty: false, broken: false, savedAt: r.data.savedAt, summary: r.data.summary, stage: r.data.state.stage };
    if (r.status === 'recoverable') {
      return { empty: false, broken: false, savedAt: r.data.savedAt, summary: r.data.summary, stage: this.firstFrameStage(r.data.state), recover: true };
    }
    return { empty: false, broken: true };
  }

  /** 이 상태로 불러오면 처음 보게 될 무대(첫 블로킹 스텝까지 진행한 사본). 진행할 수 없으면 그 상태의 무대 */
  private firstFrameStage(state: GameState): StageState {
    try {
      const copy = JSON.parse(JSON.stringify(state)) as GameState;
      settle(this.story, copy);
      return copy.stage;
    } catch {
      return state.stage;
    }
  }

  load(slot: SlotId): LoadResult {
    const raw = this.store.get(this.slotKey(slot));
    if (raw === null) return { status: 'empty' };
    return this.parse(raw);
  }

  /** 문자열 → 검증된 저장 데이터 */
  parse(raw: string): LoadResult {
    let v: unknown;
    try {
      v = JSON.parse(raw);
    } catch {
      return { status: 'error', reason: 'corrupt', message: '저장 데이터가 손상되어 읽을 수 없어요.' };
    }
    if (!isObj(v)) return { status: 'error', reason: 'corrupt', message: '저장 데이터 형식이 올바르지 않아요.' };
    if (v.game !== GAME_KEY) return { status: 'error', reason: 'foreign', message: '이 게임의 저장 데이터가 아니에요.' };
    if (typeof v.schema !== 'number') return { status: 'error', reason: 'corrupt', message: '저장 데이터에 버전 정보가 없어요.' };
    if (v.schema > SAVE_SCHEMA) {
      return { status: 'error', reason: 'schema', message: '더 새로운 버전의 게임에서 만든 저장 데이터라 불러올 수 없어요.' };
    }
    const migrated = migrate(v);
    if (!migrated) return { status: 'error', reason: 'schema', message: '예전 버전의 저장 데이터라 불러올 수 없어요.' };

    // 스키마 3 이하에는 히든 루트('group')가 없었다: 그런 저장은 손으로 고친 것이므로 손상으로 본다
    const checked = this.sanitizeState(migrated.state, migrated.from === SAVE_SCHEMA);
    if (!checked) return { status: 'error', reason: 'corrupt', message: '저장 데이터의 진행 정보가 손상되었어요.' };
    const { state } = checked;
    // 1·2 는 점수 재계산(upgradeLegacy), 3 은 표식만(markLegacyLate). 3 이 재계산을 타면 코하루 해금 평균이 사라진다
    if (migrated.from === 1 || migrated.from === 2) this.upgradeLegacy(state);
    else if (migrated.from === 3) upgradeFrom3(state);

    const summary: SaveSummary = isObj(migrated.summary)
      ? {
          sceneTitle: String(migrated.summary.sceneTitle ?? ''),
          text: String(migrated.summary.text ?? ''),
          route: isRouteOrNull(migrated.summary.route) ? migrated.summary.route : null,
        }
      : { sceneTitle: '', text: '', route: null };
    const data: SaveData = {
      schema: SAVE_SCHEMA,
      game: GAME_KEY,
      storyVersion: String(migrated.storyVersion ?? ''),
      savedAt: typeof migrated.savedAt === 'string' ? migrated.savedAt : '',
      summary,
      state,
    };

    const scene = this.story.scenes[state.sceneId];
    if (!scene) {
      return { status: 'error', reason: 'missing-scene', message: '저장한 장면이 현재 버전에 없어 불러올 수 없어요.' };
    }
    // 루트 장면인데 루트 정보가 맞지 않으면 혼입 방지를 위해 거부
    if (scene.route !== 'common' && state.route !== scene.route) {
      return { status: 'error', reason: 'corrupt', message: '저장 데이터의 루트 정보가 맞지 않아요.' };
    }
    const loc = findStep(this.story, state.sceneId, state.stepId);
    if (!loc || !isBlocking(loc.scene.steps[loc.index])) {
      const notes: string[] = [];
      const recovered = this.rewindToSceneStart(checked, scene, notes);
      return {
        status: 'recoverable',
        data: { ...data, state: recovered },
        message: `저장한 문장이 수정되어 정확한 위치를 찾을 수 없어요. '${scene.title}' 장면 처음부터 이어서 할 수 있어요.`,
        notes: uniq(notes),
      };
    }
    const notes = this.repairStage(checked, scene);
    return { status: 'ok', data, notes: uniq(notes) };
  }

  // ---- 구판 이전 -------------------------------------------------------------

  /**
   * 스키마 1·2 저장을 현재 분기 규칙에 맞춘다(파일 머리 주석 참고). 위치·루트·플래그(해금 플래그 제외)는 그대로 둔다.
   */
  private upgradeLegacy(state: GameState): void {
    const scored = rescoreChoices(this.story, state.choices);
    state.points = scored.points;
    state.lastHeroine = scored.lastHeroine;
    const entry = state.sceneEntry;
    if (entry) {
      const e = rescoreChoices(this.story, entry.choices);
      entry.points = e.points;
      entry.lastHeroine = e.lastHeroine;
    }
    if (this.legacyPastGate(state)) {
      for (const f of unlockFlags(this.story)) {
        state.flags[f] = false;
        if (entry) entry.flags[f] = false;
      }
    }
  }

  /** 구판 저장이 해금 판정 뒤(루트 확정 뒤, 또는 같은 장면에서 해금 지시보다 뒤의 문장)에 있는가 */
  private legacyPastGate(state: GameState): boolean {
    if (state.route !== null) return true;
    if (state.sceneId === LEGACY_POST_GATE_SCENE && LEGACY_POST_GATE_STEPS.includes(state.stepId)) return true;
    const loc = findStep(this.story, state.sceneId, state.stepId);
    if (!loc) return false;
    return loc.scene.steps.some((st, i) => st.t === 'unlock' && i < loc.index);
  }

  // ---- 복구 ----------------------------------------------------------------

  /** sceneEntry 가 이 장면의 것이고 루트 규칙과도 맞으면 돌려준다 */
  private usableEntry(state: GameState, scene: Scene): SceneEntry | null {
    const e = state.sceneEntry;
    if (!e || e.sceneId !== scene.id) return null;
    if (scene.route !== 'common' && e.route !== scene.route) return null;
    return e;
  }

  /**
   * '장면 처음부터' 복구 상태를 만든다.
   * - 스냅샷이 있으면(스키마 2): 점수·최근 히로인·루트·선택·플래그·무대를 장면 진입 시점으로 되돌리고 대화 기록도 그 위치까지 자른다.
   * - 없으면(스키마 1): 이 장면에서 고른 선택의 점수를 빼고 선택 기록을 지우며, 배경·음악만 남기고 캐릭터는 비운다
   *   (장면 앞부분의 show 지시가 다시 세운다). 최근 히로인과 플래그는 되살릴 수 없어 그대로 둔다.
   */
  private rewindToSceneStart(checked: SanitizedState, scene: Scene, notes: string[]): GameState {
    const { state } = checked;
    const entry = checked.entryStage ? this.usableEntry(state, scene) : null;
    let rewound: GameState;
    let droppedBg: boolean;
    let droppedChars: CharId[];
    if (entry && checked.entryStage) {
      const logEnd = Math.min(entry.logLength, state.log.length);
      rewound = {
        ...state,
        stepId: scene.steps[0].id,
        points: { ...entry.points },
        lastHeroine: entry.lastHeroine,
        route: entry.route,
        choices: { ...entry.choices },
        flags: { ...entry.flags },
        stage: cloneStage(entry.stage),
        log: state.log.slice(0, logEnd),
        endedWith: null,
      };
      droppedBg = checked.entryStage.droppedBg;
      droppedChars = checked.entryStage.droppedChars;
    } else {
      const points = { ...state.points };
      const choices = { ...state.choices };
      let route = state.route;
      // 공통 장면 안에서 루트를 정한 경우: 그 장면의 선택은 루트가 정해지기 전에 점수를 올렸고, 다시 고르면 루트도 다시 정해야 한다
      const decidesHere = scene.route === 'common' && route !== null && scene.steps.some((st) => st.t === 'decideRoute');
      const scoredHere = route === null || decidesHere;
      for (const st of scene.steps) {
        if (st.t !== 'choice' || !(st.id in choices)) continue;
        const opt = st.options.find((o) => o.id === choices[st.id]);
        delete choices[st.id];
        if (!opt || !scoredHere) continue;
        if (opt.heroine) points[opt.heroine] -= opt.points ?? 1;
        for (const ef of opt.effects ?? []) if ('add' in ef) points[ef.add] -= ef.n;
      }
      if (decidesHere) route = null;
      // 이 장면의 해금 판정도 되돌린다(장면을 다시 진행하면 다시 판정한다). 해금으로 받은 시작 점수도 뺀다
      const flags = { ...state.flags };
      if (scoredHere) {
        for (const st of scene.steps) {
          if (st.t !== 'unlock' || typeof flags[st.flag] !== 'boolean') continue;
          if (flags[st.flag] === true) points[st.heroine] = 0;
          delete flags[st.flag];
        }
      }
      const cur = checked.stage;
      rewound = {
        ...state,
        stepId: scene.steps[0].id,
        points,
        route,
        choices,
        flags,
        stage: { bg: cur.stage.bg, bgm: cur.stage.bgm, chars: {}, order: [], cg: null },
        log: state.log.slice(0, this.sceneLogStart(state.log, scene)),
        endedWith: null,
      };
      droppedBg = cur.droppedBg;
      droppedChars = [];
    }
    rewound.sceneEntry = snapshotSceneEntry(rewound);
    notes.push(...this.unresolvedAtSceneStart(rewound, droppedBg, droppedChars));
    return rewound;
  }

  /** 대화 기록에서 이 장면 항목이 시작되는 위치(뒤에서부터 이 장면·알 수 없는 id 가 이어지는 구간의 시작) */
  private sceneLogStart(log: LogEntry[], scene: Scene): number {
    const idx = stepIndex(this.story);
    const owner = (id: string): string | null => {
      const hit = idx.get(id) ?? (id.includes(':') ? idx.get(id.slice(0, id.lastIndexOf(':'))) : undefined);
      return hit ? hit.scene.id : null;
    };
    let start = log.length;
    let firstOwn = -1;
    for (let i = log.length - 1; i >= 0; i--) {
      const o = owner(log[i].id);
      if (o !== null && o !== scene.id) break;
      start = i;
      if (o === scene.id) firstOwn = i;
    }
    // 이 장면 항목 앞에 낀 알 수 없는 항목은 앞 장면의 지워진 대사로 보고 남긴다
    return firstOwn >= 0 ? firstOwn : start;
  }

  /** 복구 상태에서 첫 블로킹 스텝까지 연출을 실행해 봐도 버린 배경·캐릭터가 다시 채워지지 않으면 안내 문구를 돌려준다 */
  private unresolvedAtSceneStart(state: GameState, droppedBg: boolean, droppedChars: CharId[]): string[] {
    if (!droppedBg && droppedChars.length === 0) return [];
    let events: StepResult['events'] = [];
    try {
      events = settle(this.story, JSON.parse(JSON.stringify(state)) as GameState).events;
    } catch {
      /* 진행 오류는 불러온 뒤 화면에서 안내한다 */
    }
    const out: string[] = [];
    if (droppedBg && !events.some((e) => e.kind === 'bg')) out.push(NOTE_BG);
    if (droppedChars.some((c) => !events.some((e) => e.kind === 'show' && e.char === c))) out.push(NOTE_CHARS);
    return out;
  }

  /**
   * 정확한 위치를 찾았지만 무대 일부(배경·캐릭터)를 매니페스트에서 못 찾아 버린 경우,
   * 장면 진입 스냅샷부터 저장 위치까지 현재 대본으로 다시 실행해 버린 부분만 채운다.
   * 채우지 못한 부분의 안내 문구를 돌려준다.
   */
  private repairStage(checked: SanitizedState, scene: Scene): string[] {
    const { state, stage: check } = checked;
    if (!check.droppedBg && check.droppedChars.length === 0) return [];
    const rebuilt = this.replayStage(checked, scene);
    const stage = state.stage;
    let bgFixed = !check.droppedBg;
    if (check.droppedBg && rebuilt && rebuilt.bgKnown && this.stageValidator.hasBg(rebuilt.stage.bg)) {
      stage.bg = rebuilt.stage.bg;
      bgFixed = true;
    }
    let charsFixed = true;
    let added = false;
    for (const c of check.droppedChars) {
      const cs = rebuilt?.stage.chars[c];
      if (cs && this.stageValidator.hasSprite(c, cs.outfit, cs.hair, cs.expr)) {
        stage.chars[c] = { ...cs };
        added = true;
      } else charsFixed = false;
    }
    if (rebuilt && added) {
      // 되살린 캐릭터의 겹침 순서는 대본을 다시 실행한 결과를 따른다
      const present = (c: CharId) => !!stage.chars[c];
      const order = rebuilt.stage.order.filter(present);
      stage.order = [...order, ...stage.order.filter((c) => present(c) && !order.includes(c))];
    }
    const notes: string[] = [];
    if (!bgFixed) notes.push(NOTE_BG);
    if (!charsFixed) notes.push(NOTE_CHARS);
    return notes;
  }

  /** 장면 진입 스냅샷에서 저장된 선택대로 저장 위치까지 다시 진행한 무대. 위치에 닿지 못하면 null */
  private replayStage(checked: SanitizedState, scene: Scene): { stage: StageState; bgKnown: boolean } | null {
    const { state } = checked;
    const entry = this.usableEntry(state, scene);
    if (!entry || !checked.entryStage) return null;
    const sim: GameState = {
      ...(JSON.parse(JSON.stringify(state)) as GameState),
      stepId: scene.steps[0].id,
      points: { ...entry.points },
      lastHeroine: entry.lastHeroine,
      route: entry.route,
      choices: { ...entry.choices },
      flags: { ...entry.flags },
      stage: cloneStage(entry.stage),
      log: [],
      endedWith: null,
    };
    // 진입 무대의 배경이 유효했거나, 다시 실행하는 동안 대본의 bg 지시가 배경을 정했을 때만 그 배경을 믿는다
    let bgKnown = !checked.entryStage.droppedBg;
    try {
      let r = settle(this.story, sim);
      for (let guard = 0; guard < REPLAY_LIMIT; guard++) {
        if (r.events.some((e) => e.kind === 'bg')) bgKnown = true;
        if (sim.sceneId !== scene.id) return null;
        if (sim.stepId === state.stepId) return { stage: sim.stage, bgKnown };
        if (r.step.t === 'choice') {
          const pick = state.choices[r.step.id];
          const next = pick === undefined ? null : choose(this.story, sim, pick);
          if (!next) return null;
          r = next;
        } else if (r.step.t === 'say' || r.step.t === 'card') {
          const next = advance(this.story, sim);
          if (!next) return null;
          r = next;
        } else return null;
      }
    } catch {
      /* 대본이 바뀌어 다시 실행할 수 없으면 포기 */
    }
    return null;
  }

  // ---- 검증 ----------------------------------------------------------------

  /** 무대: 알 수 없는 에셋은 버리고 진행(화면만 잠깐 비어도 진행은 유지) */
  private sanitizeStage(v: unknown): StageCheck {
    const stage = initialStage();
    const check: StageCheck = { stage, droppedBg: false, droppedChars: [] };
    if (!isObj(v)) return check;
    if (typeof v.bg === 'string' && this.stageValidator.hasBg(v.bg)) stage.bg = v.bg as StageState['bg'];
    else if (v.bg !== undefined) check.droppedBg = true;
    if (typeof v.bgm === 'string' && this.stageValidator.hasBgm(v.bgm)) stage.bgm = v.bgm as StageState['bgm'];
    // 이벤트 CG 는 화면 연출일 뿐이라 알 수 없으면 조용히 버린다(진행에는 영향 없음)
    if (typeof v.cg === 'string' && (this.stageValidator.hasCg ? this.stageValidator.hasCg(v.cg) : true)) {
      stage.cg = v.cg as StageState['cg'];
    }
    if (isObj(v.chars)) {
      for (const c of HEROINES) {
        const cs = v.chars[c];
        if (!isObj(cs)) continue;
        const pos = cs.pos === 'left' || cs.pos === 'right' || cs.pos === 'center' ? cs.pos : 'center';
        if (
          typeof cs.outfit === 'string' &&
          typeof cs.hair === 'string' &&
          typeof cs.expr === 'string' &&
          this.stageValidator.hasSprite(c, cs.outfit, cs.hair, cs.expr)
        ) {
          stage.chars[c] = { pos, outfit: cs.outfit, hair: cs.hair, expr: cs.expr } as StageState['chars'][typeof c] & object;
        } else check.droppedChars.push(c);
      }
    }
    const order = Array.isArray(v.order) ? v.order.filter((c): c is HeroineId => (HEROINES as readonly unknown[]).includes(c)) : [];
    stage.order = order.filter((c) => stage.chars[c]);
    for (const c of HEROINES) if (stage.chars[c] && !stage.order.includes(c)) stage.order.push(c);
    return check;
  }

  /**
   * 장면 진입 스냅샷 검증. 형식이 깨졌으면 없는 것으로 본다(복구는 스키마 1 규칙으로).
   * keptRaw: 정리된 log 의 각 항목이 저장 원본 log 에서 몇 번째였는지(진입 위치를 정리된 log 기준으로 다시 맞춘다)
   */
  private sanitizeEntry(
    v: unknown,
    rawLogLength: number,
    keptRaw: number[],
    log: LogEntry[],
    allowGroup: boolean,
  ): { entry: SceneEntry; stage: StageCheck } | null {
    if (!isObj(v) || typeof v.sceneId !== 'string') return null;
    const scene = this.story.scenes[v.sceneId];
    if (!scene) return null;
    const points = sanitizePoints(v.points);
    if (!points) return null;
    if (!isHeroineOrNull(v.lastHeroine ?? null) || !isRouteOrNull(v.route ?? null, allowGroup)) return null;
    const rawLength = Number(v.logLength);
    if (!Number.isInteger(rawLength) || rawLength < 0) return null;
    // 진입 위치가 log 보다 뒤를 가리키면(손상) 기록 내용으로 장면 시작 위치를 다시 찾는다
    const logLength = rawLength > rawLogLength ? this.sceneLogStart(log, scene) : keptRaw.filter((i) => i < rawLength).length;
    const stage = this.sanitizeStage(v.stage);
    return {
      entry: {
        sceneId: v.sceneId,
        points,
        lastHeroine: (v.lastHeroine ?? null) as HeroineId | null,
        route: (v.route ?? null) as RouteId | null,
        choices: sanitizeChoices(v.choices),
        flags: sanitizeFlags(v.flags),
        stage: stage.stage,
        logLength,
      },
      stage,
    };
  }

  /**
   * 형식이 이상한 필드는 안전한 기본값으로 고치고, 핵심 필드가 깨졌으면 null.
   * route 는 루트 id(히로인 셋 + 'group', allowGroup = false 면 히로인만)·null, lastHeroine 은 히로인 id·null 만 받는다
   */
  private sanitizeState(v: unknown, allowGroup: boolean): SanitizedState | null {
    if (!isObj(v)) return null;
    if (typeof v.sceneId !== 'string' || typeof v.stepId !== 'string') return null;
    const points = sanitizePoints(v.points);
    if (!points) return null;
    if (!isHeroineOrNull(v.lastHeroine ?? null) || !isRouteOrNull(v.route ?? null, allowGroup)) return null;

    const stage = this.sanitizeStage(v.stage);

    const log: GameState['log'] = [];
    const keptRaw: number[] = [];
    const rawLog: unknown[] = Array.isArray(v.log) ? v.log : [];
    for (let i = Math.max(0, rawLog.length - LOG_LIMIT); i < rawLog.length; i++) {
      const e = rawLog[i];
      if (!isObj(e) || typeof e.text !== 'string') continue;
      const kind = e.kind === 'say' || e.kind === 'mono' || e.kind === 'card' || e.kind === 'choice' ? e.kind : 'say';
      log.push({ id: String(e.id ?? ''), name: typeof e.name === 'string' ? e.name : null, text: e.text, kind });
      keptRaw.push(i);
    }
    // 엔딩은 이 대본의 엔딩(8개) 중 하나만. 'constructor' 같은 프로토타입 이름은 엔딩이 아니다
    const endedWith = typeof v.endedWith === 'string' && hasOwn(this.story.endings, v.endedWith) ? (v.endedWith as EndingId) : null;
    const entry = this.sanitizeEntry(v.sceneEntry, rawLog.length, keptRaw, log, allowGroup);

    const state: GameState = {
      sceneId: v.sceneId,
      stepId: v.stepId,
      points,
      lastHeroine: (v.lastHeroine ?? null) as HeroineId | null,
      route: (v.route ?? null) as RouteId | null,
      choices: sanitizeChoices(v.choices),
      flags: sanitizeFlags(v.flags),
      stage: stage.stage,
      log,
      endedWith,
    };
    if (entry) state.sceneEntry = entry.entry;
    return { state, stage, entryStage: entry?.stage ?? null };
  }

  /**
   * 가장 최근에 저장된 수동 슬롯(자동 저장이 손상됐을 때 안내용).
   * savedAt 은 시각으로 바꿔 비교한다(문자열 비교는 시간대 표기·자릿수가 다르면 틀린다).
   * 시각으로 읽을 수 없는 savedAt(빈 문자열·손으로 고친 값 등)은 건너뛴다.
   */
  latestManual(): SlotId | null {
    let best: { slot: SlotId; at: number } | null = null;
    for (let i = 1; i <= MANUAL_SLOTS; i++) {
      const slot = String(i) as SlotId;
      const p = this.peek(slot);
      if (p.empty || p.broken || !p.savedAt) continue;
      const at = Date.parse(p.savedAt);
      if (Number.isNaN(at)) continue;
      if (!best || at > best.at) best = { slot, at };
    }
    return best?.slot ?? null;
  }
}

/** from = 원래 스키마(1·2·3·4). 이전 경로는 parse 가 이 값으로 고른다(truthy 검사로 섞이지 않게 숫자로 비교) */
type Migrated = Record<string, unknown> & { state: unknown; summary?: unknown; from: 1 | 2 | 3 | 4 };

/**
 * 스키마 이전(형식만). 이전 버전을 현재 형식으로 바꾼다. 받아들일 수 없는 버전이면 null.
 * 대본 정의가 필요한 이전은 from 을 보고 parse 가 한다: 1·2 → SaveManager.upgradeLegacy(점수 재계산·해금 플래그),
 * 3 → upgradeFrom3(구저장 표식만. 점수·선택·위치는 그대로).
 */
function migrate(v: Record<string, unknown>): Migrated | null {
  const base = v as Record<string, unknown> & { state: unknown };
  if (v.schema === SAVE_SCHEMA) return { ...base, from: SAVE_SCHEMA };
  if (v.schema === 3) return { ...base, schema: SAVE_SCHEMA, from: 3 };
  if (v.schema === 1 || v.schema === 2) {
    const state = isObj(v.state) ? { ...v.state } : v.state;
    // 1 → 2: 장면 진입 스냅샷이 없다. 다음 장면으로 넘어가면 실행기가 새로 채우고,
    // 그 전에 복구가 필요하면 rewindToSceneStart 의 스키마 1 규칙을 쓴다.
    if (v.schema === 1 && isObj(state)) delete state.sceneEntry;
    return { ...base, schema: SAVE_SCHEMA, state, from: v.schema };
  }
  return null;
}

/**
 * 구저장 표식 규칙(스키마 3 → 4, 계약 6.4). 해금(kh.met === true)·루트 미확정이고
 * 옛 후반 선택(LEGACY_LATE_CHOICES)을 하나라도 했거나 옛 후반 장면(LEGACY_LATE_SCENES)에 있으면 표식을 붙인다.
 * 점수·선택·위치·루트는 건드리지 않는다. 결정적이고 여러 번 적용해도 결과가 같다(멱등). 붙였으면 true.
 */
export function markLegacyLate(target: Pick<GameState, 'sceneId' | 'route' | 'choices' | 'flags'>): boolean {
  if (target.flags[LEGACY_MET_FLAG] !== true || target.route !== null) return false;
  const chose = LEGACY_LATE_CHOICES.some((id) => hasOwn(target.choices, id));
  const inOldScene = LEGACY_LATE_SCENES.includes(target.sceneId);
  if (!chose && !inOldScene) return false;
  target.flags[LEGACY_LATE_FLAG] = true;
  return true;
}

/** 스키마 3 저장 이전: 상태와 장면 진입 스냅샷에 같은 규칙으로 표식을 붙인다(각자의 장면·선택·플래그 기준) */
function upgradeFrom3(state: GameState): void {
  markLegacyLate(state);
  if (state.sceneEntry) markLegacyLate(state.sceneEntry);
}

/** 대본의 모든 해금 플래그 이름 */
function unlockFlags(story: Story): string[] {
  const out = new Set<string>();
  for (const scene of Object.values(story.scenes)) {
    for (const st of scene.steps) if (st.t === 'unlock') out.add(st.flag);
  }
  return [...out];
}

/** 선택지 id 의 시간순 위치(대본의 decideRoute.order 기준). 없으면 undefined */
function choiceOrder(story: Story): Map<string, number> {
  const order = new Map<string, number>();
  for (const scene of Object.values(story.scenes)) {
    for (const st of scene.steps) {
      if (st.t !== 'decideRoute') continue;
      for (const id of st.order ?? []) if (!order.has(id)) order.set(id, order.size);
    }
  }
  return order;
}

/**
 * 선택 기록만으로 점수·최근 히로인을 다시 계산한다(현재 대본의 옵션 정의 기준, 루트 확정 전인 공통 장면 선택만).
 * 시간순은 대본의 decideRoute.order, 그 목록에 없는 선택이 섞여 있으면 저장된 기록 순서를 쓴다.
 * 해금 시작 점수는 넣지 않는다(구판 저장에는 해금이 없었다).
 */
export function rescoreChoices(story: Story, choices: Record<string, string>): { points: Record<HeroineId, number>; lastHeroine: HeroineId | null } {
  const idx = stepIndex(story);
  const scoring = Object.keys(choices).filter((id) => {
    const hit = idx.get(id);
    return !!hit && hit.scene.route === 'common' && hit.scene.steps[hit.index].t === 'choice';
  });
  const order = choiceOrder(story);
  if (scoring.every((id) => order.has(id))) scoring.sort((a, b) => order.get(a)! - order.get(b)!);
  const points = zeroPoints();
  let lastHeroine: HeroineId | null = null;
  for (const id of scoring) {
    const option = findChoiceStep(story, id)?.options.find((o) => o.id === choices[id]);
    if (!option) continue;
    if (option.heroine) {
      points[option.heroine] += option.points ?? 1;
      lastHeroine = option.heroine;
    }
    for (const ef of option.effects ?? []) if ('add' in ef) points[ef.add] += ef.n;
  }
  return { points, lastHeroine };
}
