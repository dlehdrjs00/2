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
 */
import type { CharId, EndingId, GameState, HeroineId, LogEntry, Scene, SceneEntry, StageState, Story } from './types';
import { HEROINES } from './types';
import { advance, choose, findStep, initialStage, isBlocking, LOG_LIMIT, settle, snapshotSceneEntry, stepIndex, type StepResult } from './runner';
import type { KeyValueStore } from './storage';

export const SAVE_SCHEMA = 2;
/** 전역 기록(읽은 대사·엔딩) 형식 버전. 슬롯 저장 스키마와 따로 간다 */
export const GLOBAL_SCHEMA = 1;
export const GAME_KEY = 'ashita-mo-issho';
export const KEY_PREFIX = 'ashita.';
/** 수동 저장 칸 수(저장 화면 5쪽 × 6칸) */
export const MANUAL_SLOTS = 30;
/** auto = 자동 저장, quick = 퀵저장(빠른 메뉴), 숫자 = 수동 저장 칸 */
export type SlotId = 'auto' | 'quick' | `${number}`;

export interface SaveSummary {
  sceneTitle: string;
  text: string;
  route: HeroineId | null;
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
const isHeroineOrNull = (v: unknown): v is HeroineId | null => v === null || (typeof v === 'string' && (HEROINES as readonly string[]).includes(v));
const uniq = (xs: string[]): string[] => [...new Set(xs)];

const GLOBAL_KEY = `${KEY_PREFIX}global`;
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

function sanitizePoints(v: unknown): Record<HeroineId, number> | null {
  if (!isObj(v)) return null;
  const points = { osana: Number(v.osana), tenko: Number(v.tenko) };
  if (!Number.isFinite(points.osana) || !Number.isFinite(points.tenko)) return null;
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
      if (key === null || key === GLOBAL_KEY) this.syncFromStore();
    });
  }

  get persistent(): boolean {
    return this.store.persistent;
  }

  slotKey(slot: SlotId): string {
    return `${KEY_PREFIX}save.${slot}`;
  }

  // ---- 전역 기록 ------------------------------------------------------------

  private readGlobal(): GlobalRecord {
    const raw = this.store.get(GLOBAL_KEY);
    if (!raw) return { schema: GLOBAL_SCHEMA, read: [], endings: [] };
    try {
      const v = JSON.parse(raw) as unknown;
      if (!isObj(v)) throw new Error('bad');
      const read = Array.isArray(v.read) ? v.read.filter((x): x is string => typeof x === 'string') : [];
      const endings = Array.isArray(v.endings)
        ? v.endings.filter((x): x is EndingId => typeof x === 'string' && x in this.story.endings)
        : [];
      const cgs = Array.isArray(v.cgs) ? v.cgs.filter((x): x is string => typeof x === 'string') : [];
      return { schema: GLOBAL_SCHEMA, read, endings, cgs };
    } catch {
      // 전역 기록이 손상되면 읽음 기록만 잃고 계속한다
      return { schema: GLOBAL_SCHEMA, read: [], endings: [] };
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

    const checked = this.sanitizeState(migrated.state);
    if (!checked) return { status: 'error', reason: 'corrupt', message: '저장 데이터의 진행 정보가 손상되었어요.' };
    const { state } = checked;

    const summary: SaveSummary = isObj(migrated.summary)
      ? {
          sceneTitle: String(migrated.summary.sceneTitle ?? ''),
          text: String(migrated.summary.text ?? ''),
          route: isHeroineOrNull(migrated.summary.route) ? migrated.summary.route : null,
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
      const cur = checked.stage;
      rewound = {
        ...state,
        stepId: scene.steps[0].id,
        points,
        route,
        choices,
        flags: { ...state.flags },
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
  ): { entry: SceneEntry; stage: StageCheck } | null {
    if (!isObj(v) || typeof v.sceneId !== 'string') return null;
    const scene = this.story.scenes[v.sceneId];
    if (!scene) return null;
    const points = sanitizePoints(v.points);
    if (!points) return null;
    if (!isHeroineOrNull(v.lastHeroine ?? null) || !isHeroineOrNull(v.route ?? null)) return null;
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
        route: (v.route ?? null) as HeroineId | null,
        choices: sanitizeChoices(v.choices),
        flags: sanitizeFlags(v.flags),
        stage: stage.stage,
        logLength,
      },
      stage,
    };
  }

  /** 형식이 이상한 필드는 안전한 기본값으로 고치고, 핵심 필드가 깨졌으면 null */
  private sanitizeState(v: unknown): SanitizedState | null {
    if (!isObj(v)) return null;
    if (typeof v.sceneId !== 'string' || typeof v.stepId !== 'string') return null;
    const points = sanitizePoints(v.points);
    if (!points) return null;
    if (!isHeroineOrNull(v.lastHeroine ?? null) || !isHeroineOrNull(v.route ?? null)) return null;

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
    const endedWith = typeof v.endedWith === 'string' && v.endedWith in this.story.endings ? (v.endedWith as EndingId) : null;
    const entry = this.sanitizeEntry(v.sceneEntry, rawLog.length, keptRaw, log);

    const state: GameState = {
      sceneId: v.sceneId,
      stepId: v.stepId,
      points,
      lastHeroine: (v.lastHeroine ?? null) as HeroineId | null,
      route: (v.route ?? null) as HeroineId | null,
      choices: sanitizeChoices(v.choices),
      flags: sanitizeFlags(v.flags),
      stage: stage.stage,
      log,
      endedWith,
    };
    if (entry) state.sceneEntry = entry.entry;
    return { state, stage, entryStage: entry?.stage ?? null };
  }

  /** 가장 최근에 저장된 수동 슬롯(자동 저장이 손상됐을 때 안내용) */
  latestManual(): SlotId | null {
    let best: { slot: SlotId; at: string } | null = null;
    for (let i = 1; i <= MANUAL_SLOTS; i++) {
      const slot = String(i) as SlotId;
      const p = this.peek(slot);
      if (!p.empty && !p.broken && p.savedAt && (!best || p.savedAt > best.at)) best = { slot, at: p.savedAt };
    }
    return best?.slot ?? null;
  }
}

/** 스키마 이전. 이전 버전을 현재 형식으로 바꾼다. 받아들일 수 없는 버전이면 null */
function migrate(v: Record<string, unknown>): (Record<string, unknown> & { state: unknown; summary?: unknown }) | null {
  if (v.schema === SAVE_SCHEMA) return v as Record<string, unknown> & { state: unknown };
  if (v.schema === 1) {
    // 1 → 2: 장면 진입 스냅샷이 없다. 다음 장면으로 넘어가면 실행기가 새로 채우고,
    // 그 전에 복구가 필요하면 rewindToSceneStart 의 스키마 1 규칙을 쓴다.
    const state = isObj(v.state) ? { ...v.state } : v.state;
    if (isObj(state)) delete state.sceneEntry;
    return { ...v, schema: SAVE_SCHEMA, state };
  }
  return null;
}
