/**
 * 스토리 실행기 — DOM 을 모르는 순수 로직.
 *
 * 상태(GameState)의 (sceneId, stepId) 는 항상 "지금 화면에 표시 중인 블로킹 스텝"
 * (대사·카드·선택지·엔딩)을 가리킨다. 연출 명령은 블로킹 스텝에 도달할 때까지 즉시 실행된다.
 */
import type {
  BlockingStep,
  CharState,
  ChoiceStep,
  Cond,
  Effect,
  GameState,
  HeroineId,
  LogEntry,
  Scene,
  SceneEntry,
  StageState,
  Step,
  Story,
} from './types';
import { HEROINES } from './types';

export const LOG_LIMIT = 120;

/** 렌더러가 연출할 이벤트 */
export type StageEvent =
  | { kind: 'bg'; bg: StageState['bg']; fx: 'fade' | 'black' | 'white' | 'cut' }
  | { kind: 'show'; char: keyof StageState['chars']; state: CharState; entering: boolean }
  | { kind: 'hide'; char: keyof StageState['chars'] }
  | { kind: 'bgm'; track: StageState['bgm'] }
  | { kind: 'sfx'; sound: string }
  | { kind: 'fx'; fx: 'shake' | 'flash' }
  | { kind: 'place'; text: string }
  | { kind: 'route'; route: HeroineId };

export interface StepResult {
  step: BlockingStep;
  scene: Scene;
  events: StageEvent[];
}

export class StoryError extends Error {}

export function initialStage(): StageState {
  return { bg: 'black', chars: {}, order: [], bgm: null };
}

export function newGameState(story: Story): GameState {
  const first = story.scenes[story.start];
  if (!first || first.steps.length === 0) throw new StoryError(`시작 장면이 없습니다: ${story.start}`);
  const state: GameState = {
    sceneId: first.id,
    stepId: first.steps[0].id,
    points: { osana: 0, tenko: 0 },
    lastHeroine: null,
    route: null,
    choices: {},
    flags: {},
    stage: initialStage(),
    log: [],
    endedWith: null,
  };
  state.sceneEntry = snapshotSceneEntry(state);
  return state;
}

/**
 * 현재 상태를 '장면 진입 시점' 스냅샷으로 깊은 복사한다.
 * state.sceneId 가 이미 들어온 장면을 가리키고, 그 장면의 첫 지시는 아직 실행되지 않은 시점에 부른다.
 */
export function snapshotSceneEntry(state: GameState): SceneEntry {
  return JSON.parse(
    JSON.stringify({
      sceneId: state.sceneId,
      points: state.points,
      lastHeroine: state.lastHeroine,
      route: state.route,
      choices: state.choices,
      flags: state.flags,
      stage: state.stage,
      logLength: state.log.length,
    }),
  ) as SceneEntry;
}

// ---------------------------------------------------------------------------
// 인덱스 (스텝 id → 위치)
// ---------------------------------------------------------------------------

interface StepIndex {
  scene: Scene;
  index: number;
}
const indexCache = new WeakMap<Story, Map<string, StepIndex>>();

export function stepIndex(story: Story): Map<string, StepIndex> {
  let idx = indexCache.get(story);
  if (!idx) {
    idx = new Map();
    for (const scene of Object.values(story.scenes)) {
      scene.steps.forEach((step, index) => {
        idx!.set(step.id, { scene, index });
      });
    }
    indexCache.set(story, idx);
  }
  return idx;
}

export function findStep(story: Story, sceneId: string, stepId: string): StepIndex | null {
  const hit = stepIndex(story).get(stepId);
  if (!hit || hit.scene.id !== sceneId) return null;
  return hit;
}

export function isBlocking(step: Step): step is BlockingStep {
  return step.t === 'say' || step.t === 'card' || step.t === 'choice' || step.t === 'ending';
}

// ---------------------------------------------------------------------------
// 루트 결정 규칙
// ---------------------------------------------------------------------------

/**
 * 루트 결정 규칙
 *  1) 누적 점수가 높은 히로인
 *  2) 동점이면 가장 최근에 고른 히로인 관련 선택의 히로인
 *  3) 그것도 없으면 소꿉친구(osana) — 현재 스토리에서는 발생하지 않음
 */
export function decideRoute(points: Record<HeroineId, number>, lastHeroine: HeroineId | null): HeroineId {
  if (points.osana > points.tenko) return 'osana';
  if (points.tenko > points.osana) return 'tenko';
  return lastHeroine ?? 'osana';
}

// ---------------------------------------------------------------------------
// 조건 / 효과
// ---------------------------------------------------------------------------

export function evalCond(state: GameState, cond: Cond): boolean {
  if ('choice' in cond) return state.choices[cond.choice] === cond.is;
  if ('flag' in cond) return state.flags[cond.flag] === cond.eq;
  if ('route' in cond) return state.route === cond.route;
  if ('not' in cond) return !evalCond(state, cond.not);
  if ('all' in cond) return cond.all.every((c) => evalCond(state, c));
  if ('any' in cond) return cond.any.some((c) => evalCond(state, c));
  return false;
}

function applyEffects(state: GameState, effects: Effect[] | undefined): void {
  if (!effects) return;
  for (const e of effects) {
    if ('flag' in e) state.flags[e.flag] = e.value;
    else if ('add' in e) {
      // 루트 확정 후에는 점수를 바꾸지 않는다(루트 혼입 방지)
      if (state.route === null) state.points[e.add] += e.n;
    }
  }
}

// ---------------------------------------------------------------------------
// 실행
// ---------------------------------------------------------------------------

const MAX_INSTANT_STEPS = 5000;

function gotoInScene(story: Story, state: GameState, scene: Scene, target: string): void {
  const hit = stepIndex(story).get(target);
  if (!hit || hit.scene.id !== scene.id) {
    throw new StoryError(`장면 ${scene.id} 안에 이동 목표 ${target} 이(가) 없습니다`);
  }
  state.stepId = target;
}

function enterScene(story: Story, state: GameState, sceneId: string): void {
  const scene = story.scenes[sceneId];
  if (!scene || scene.steps.length === 0) throw new StoryError(`장면이 없습니다: ${sceneId}`);
  state.sceneId = scene.id;
  state.stepId = scene.steps[0].id;
  state.sceneEntry = snapshotSceneEntry(state);
}

function moveNext(state: GameState, scene: Scene, index: number): void {
  const next = scene.steps[index + 1];
  if (!next) throw new StoryError(`장면 ${scene.id} 이(가) jump/ending 없이 끝났습니다`);
  state.stepId = next.id;
}

/**
 * 현재 위치에서 연출 명령을 실행하며 다음 블로킹 스텝까지 진행한다.
 * 현재 위치가 이미 블로킹 스텝이면 아무것도 실행하지 않고 그 스텝을 돌려준다.
 */
export function settle(story: Story, state: GameState): StepResult {
  const events: StageEvent[] = [];
  for (let guard = 0; guard < MAX_INSTANT_STEPS; guard++) {
    const loc = findStep(story, state.sceneId, state.stepId);
    if (!loc) throw new StoryError(`위치를 찾을 수 없습니다: ${state.sceneId} / ${state.stepId}`);
    const { scene, index } = loc;
    const step = scene.steps[index];
    if (isBlocking(step)) {
      // 대사에 붙은 표정 변경은 무대 상태에 반영해 둔다(저장 스냅샷이 화면과 일치하도록)
      if (step.t === 'say' && step.expr && (step.who === 'osana' || step.who === 'tenko')) {
        const cs = state.stage.chars[step.who];
        if (cs && cs.expr !== step.expr) {
          cs.expr = step.expr;
          events.push({ kind: 'show', char: step.who, state: { ...cs }, entering: false });
        }
      }
      return { step, scene, events };
    }

    switch (step.t) {
      case 'bg':
        state.stage.bg = step.bg;
        events.push({ kind: 'bg', bg: step.bg, fx: step.fx ?? 'fade' });
        break;
      case 'show': {
        const prev = state.stage.chars[step.char];
        const next: CharState = {
          pos: step.pos ?? prev?.pos ?? 'center',
          expr: step.expr ?? prev?.expr ?? 'neutral',
          outfit: step.outfit ?? prev?.outfit ?? 'uniform',
          hair: step.hair ?? prev?.hair ?? 'default',
        };
        state.stage.chars[step.char] = next;
        if (!state.stage.order.includes(step.char)) state.stage.order.push(step.char);
        events.push({ kind: 'show', char: step.char, state: { ...next }, entering: !prev });
        break;
      }
      case 'hide': {
        const targets = step.char === 'all' ? [...state.stage.order] : [step.char];
        for (const c of targets) {
          if (state.stage.chars[c]) {
            delete state.stage.chars[c];
            events.push({ kind: 'hide', char: c });
          }
        }
        state.stage.order = state.stage.order.filter((c) => !targets.includes(c));
        break;
      }
      case 'bgm':
        if (state.stage.bgm !== step.track) {
          state.stage.bgm = step.track;
          events.push({ kind: 'bgm', track: step.track });
        }
        break;
      case 'sfx':
        events.push({ kind: 'sfx', sound: step.sound });
        break;
      case 'fx':
        events.push({ kind: 'fx', fx: step.fx });
        break;
      case 'place':
        events.push({ kind: 'place', text: step.text });
        break;
      case 'set':
        applyEffects(state, step.effects);
        break;
      case 'label':
        break;
      case 'if':
        if (evalCond(state, step.cond)) {
          gotoInScene(story, state, scene, step.goto);
          continue;
        }
        break;
      case 'goto':
        gotoInScene(story, state, scene, step.to);
        continue;
      case 'jump':
        enterScene(story, state, step.scene);
        continue;
      case 'decideRoute':
        if (state.route === null) {
          state.route = decideRoute(state.points, state.lastHeroine);
          events.push({ kind: 'route', route: state.route });
        }
        break;
      case 'routeBranch': {
        if (state.route === null) throw new StoryError(`루트가 확정되기 전에 routeBranch(${step.id}) 에 도달했습니다`);
        enterScene(story, state, step.scenes[state.route]);
        continue;
      }
      default: {
        const never: never = step;
        throw new StoryError(`알 수 없는 스텝: ${JSON.stringify(never)}`);
      }
    }
    moveNext(state, scene, index);
  }
  throw new StoryError('연출 명령이 너무 많이 이어집니다(무한 루프 의심)');
}

/** 대사/카드에서 다음으로 진행. 선택지·엔딩에서는 아무것도 하지 않고 null */
export function advance(story: Story, state: GameState): StepResult | null {
  const cur = settle(story, state);
  if (cur.step.t !== 'say' && cur.step.t !== 'card') return null;
  const loc = findStep(story, state.sceneId, state.stepId)!;
  moveNext(state, loc.scene, loc.index);
  return settle(story, state);
}

/** 선택지 결정. 현재 스텝이 선택지가 아니거나 옵션이 없으면 null (중복 입력 방어) */
export function choose(story: Story, state: GameState, optionId: string): StepResult | null {
  const cur = settle(story, state);
  if (cur.step.t !== 'choice') return null;
  const step: ChoiceStep = cur.step;
  const option = step.options.find((o) => o.id === optionId);
  if (!option) return null;

  state.choices[step.id] = option.id;
  if (option.heroine && state.route === null) {
    state.points[option.heroine] += option.points ?? 1;
    state.lastHeroine = option.heroine;
  }
  applyEffects(state, option.effects);

  if (option.goto) {
    gotoInScene(story, state, cur.scene, option.goto);
  } else {
    const loc = findStep(story, state.sceneId, state.stepId)!;
    moveNext(state, loc.scene, loc.index);
  }
  return settle(story, state);
}

export function pushLog(state: GameState, entry: LogEntry): void {
  const last = state.log[state.log.length - 1];
  if (last && last.id === entry.id && last.kind === entry.kind) return; // 같은 줄 중복 기록 방지(불러오기 직후 등)
  state.log.push(entry);
  if (state.log.length > LOG_LIMIT) {
    const drop = state.log.length - LOG_LIMIT;
    state.log.splice(0, drop);
    // 장면 진입 위치도 같은 만큼 앞으로 당겨, 복구 때 이 장면 기록만 정확히 잘라낼 수 있게 한다
    if (state.sceneEntry) state.sceneEntry.logLength = Math.max(0, state.sceneEntry.logLength - drop);
  }
}

export function cloneState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}

export { HEROINES };
