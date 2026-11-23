/**
 * 저장·불러오기·전역 기록(읽은 대사, 엔딩) 관리.
 *
 * - 저장 데이터에는 스키마 버전(schema)이 들어간다.
 * - 손상/비호환 데이터는 예외를 던지지 않고 결과 객체로 사유를 돌려준다(게임이 멈추지 않게).
 * - 저장 위치는 (sceneId, stepId) 이므로 대사 배열 순서가 바뀌어도 유지된다.
 *   대사가 삭제되어 stepId 를 못 찾으면 '장면 처음부터' 복구를 제안한다.
 */
import type { EndingId, GameState, HeroineId, Story } from './types';
import { HEROINES } from './types';
import { findStep, initialStage, isBlocking, LOG_LIMIT } from './runner';
import type { KeyValueStore } from './storage';

export const SAVE_SCHEMA = 1;
export const GAME_KEY = 'ashita-mo-issho';
export const KEY_PREFIX = 'ashita.';
export const MANUAL_SLOTS = 6;
export type SlotId = 'auto' | `${number}`;

export interface SaveSummary {
  sceneTitle: string;
  text: string;
  route: HeroineId | null;
}

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
  | { status: 'recoverable'; data: SaveData; message: string }
  | { status: 'error'; reason: 'corrupt' | 'schema' | 'foreign' | 'missing-scene'; message: string };

export interface GlobalRecord {
  schema: number;
  read: string[];
  endings: EndingId[];
}

/** 무대 상태 검증용(에셋 매니페스트 기반) */
export interface StageValidator {
  hasBg(bg: string): boolean;
  hasSprite(char: string, outfit: string, hair: string, expr: string): boolean;
  hasBgm(id: string): boolean;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isHeroineOrNull = (v: unknown): v is HeroineId | null => v === null || (typeof v === 'string' && (HEROINES as readonly string[]).includes(v));

export class SaveManager {
  private readSet: Set<string>;
  private endings: Set<EndingId>;
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
  }

  get persistent(): boolean {
    return this.store.persistent;
  }

  slotKey(slot: SlotId): string {
    return `${KEY_PREFIX}save.${slot}`;
  }

  // ---- 전역 기록 ------------------------------------------------------------

  private readGlobal(): GlobalRecord {
    const raw = this.store.get(`${KEY_PREFIX}global`);
    if (!raw) return { schema: SAVE_SCHEMA, read: [], endings: [] };
    try {
      const v = JSON.parse(raw) as unknown;
      if (!isObj(v)) throw new Error('bad');
      const read = Array.isArray(v.read) ? v.read.filter((x): x is string => typeof x === 'string') : [];
      const endings = Array.isArray(v.endings)
        ? v.endings.filter((x): x is EndingId => typeof x === 'string' && x in this.story.endings)
        : [];
      return { schema: SAVE_SCHEMA, read, endings };
    } catch {
      // 전역 기록이 손상되면 읽음 기록만 잃고 계속한다
      return { schema: SAVE_SCHEMA, read: [], endings: [] };
    }
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
    const rec: GlobalRecord = { schema: SAVE_SCHEMA, read: [...this.readSet], endings: [...this.endings] };
    this.store.set(`${KEY_PREFIX}global`, JSON.stringify(rec));
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

  /** 슬롯 목록 표시용 요약. 손상된 슬롯은 broken: true */
  peek(slot: SlotId): { empty: true } | { empty: false; broken: boolean; savedAt?: string; summary?: SaveSummary } {
    const raw = this.store.get(this.slotKey(slot));
    if (raw === null) return { empty: true };
    const r = this.parse(raw);
    if (r.status === 'ok' || r.status === 'recoverable') return { empty: false, broken: false, savedAt: r.data.savedAt, summary: r.data.summary };
    return { empty: false, broken: true };
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

    const notes: string[] = [];
    const state = this.sanitizeState(migrated.state, notes);
    if (!state) return { status: 'error', reason: 'corrupt', message: '저장 데이터의 진행 정보가 손상되었어요.' };

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
      const recovered: GameState = { ...state, stepId: scene.steps[0].id, stage: initialStage(), endedWith: null };
      return {
        status: 'recoverable',
        data: { ...data, state: recovered },
        message: `저장한 문장이 수정되어 정확한 위치를 찾을 수 없어요. '${scene.title}' 장면 처음부터 이어서 할 수 있어요.`,
      };
    }
    return { status: 'ok', data, notes };
  }

  /** 형식이 이상한 필드는 안전한 기본값으로 고치고, 핵심 필드가 깨졌으면 null */
  private sanitizeState(v: unknown, notes: string[]): GameState | null {
    if (!isObj(v)) return null;
    if (typeof v.sceneId !== 'string' || typeof v.stepId !== 'string') return null;
    if (!isObj(v.points)) return null;
    const points = { osana: Number(v.points.osana), tenko: Number(v.points.tenko) };
    if (!Number.isFinite(points.osana) || !Number.isFinite(points.tenko)) return null;
    if (!isHeroineOrNull(v.lastHeroine ?? null) || !isHeroineOrNull(v.route ?? null)) return null;

    const choices: Record<string, string> = {};
    if (isObj(v.choices)) for (const [k, x] of Object.entries(v.choices)) if (typeof x === 'string') choices[k] = x;
    const flags: GameState['flags'] = {};
    if (isObj(v.flags)) {
      for (const [k, x] of Object.entries(v.flags)) {
        if (typeof x === 'string' || typeof x === 'number' || typeof x === 'boolean') flags[k] = x;
      }
    }

    // 무대: 알 수 없는 에셋은 버리고 진행(화면만 잠깐 비어도 진행은 유지)
    const stage = initialStage();
    if (isObj(v.stage)) {
      const s = v.stage;
      if (typeof s.bg === 'string' && this.stageValidator.hasBg(s.bg)) stage.bg = s.bg as GameState['stage']['bg'];
      else if (s.bg !== undefined) notes.push('배경 정보를 복원하지 못했어요');
      if (typeof s.bgm === 'string' && this.stageValidator.hasBgm(s.bgm)) stage.bgm = s.bgm as GameState['stage']['bgm'];
      if (isObj(s.chars)) {
        for (const c of HEROINES) {
          const cs = s.chars[c];
          if (!isObj(cs)) continue;
          const pos = cs.pos === 'left' || cs.pos === 'right' || cs.pos === 'center' ? cs.pos : 'center';
          if (
            typeof cs.outfit === 'string' &&
            typeof cs.hair === 'string' &&
            typeof cs.expr === 'string' &&
            this.stageValidator.hasSprite(c, cs.outfit, cs.hair, cs.expr)
          ) {
            stage.chars[c] = { pos, outfit: cs.outfit, hair: cs.hair, expr: cs.expr } as GameState['stage']['chars'][typeof c] & object;
          } else notes.push('캐릭터 그림 정보를 일부 복원하지 못했어요');
        }
      }
      const order = Array.isArray(s.order) ? s.order.filter((c): c is HeroineId => (HEROINES as readonly unknown[]).includes(c)) : [];
      stage.order = order.filter((c) => stage.chars[c]);
      for (const c of HEROINES) if (stage.chars[c] && !stage.order.includes(c)) stage.order.push(c);
    }

    const log: GameState['log'] = [];
    if (Array.isArray(v.log)) {
      for (const e of v.log.slice(-LOG_LIMIT)) {
        if (!isObj(e) || typeof e.text !== 'string') continue;
        const kind = e.kind === 'say' || e.kind === 'mono' || e.kind === 'card' || e.kind === 'choice' ? e.kind : 'say';
        log.push({ id: String(e.id ?? ''), name: typeof e.name === 'string' ? e.name : null, text: e.text, kind });
      }
    }
    const endedWith = typeof v.endedWith === 'string' && v.endedWith in this.story.endings ? (v.endedWith as EndingId) : null;

    return {
      sceneId: v.sceneId,
      stepId: v.stepId,
      points,
      lastHeroine: (v.lastHeroine ?? null) as HeroineId | null,
      route: (v.route ?? null) as HeroineId | null,
      choices,
      flags,
      stage,
      log,
      endedWith,
    };
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

/** 스키마 이전. 현재는 1 버전뿐. 이전 버전이 생기면 여기서 변환한다. */
function migrate(v: Record<string, unknown>): Record<string, unknown> & { state: unknown; summary?: unknown } | null {
  if (v.schema === SAVE_SCHEMA) return v as Record<string, unknown> & { state: unknown };
  return null;
}
