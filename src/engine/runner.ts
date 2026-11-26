/**
 * 스토리 실행기 — DOM 을 모르는 순수 로직.
 *
 * 상태(GameState)의 (sceneId, stepId) 는 항상 "지금 화면에 표시 중인 블로킹 스텝"
 * (대사·카드·선택지·엔딩)을 가리킨다. 연출 명령은 블로킹 스텝에 도달할 때까지 즉시 실행된다.
 */
import type {
  BlockingStep,
  CgId,
  CharState,
  ChoiceOption,
  ChoiceStep,
  Cond,
  DecideRouteStep,
  Effect,
  GameState,
  GroupRouteId,
  HeroineId,
  LogEntry,
  RouteId,
  Scene,
  SceneEntry,
  StageState,
  Step,
  Story,
  UnlockStep,
} from './types';
import { BASE_HEROINES, HEROINES, isHeroineId } from './types';

export const LOG_LIMIT = 120;

/** 렌더러가 연출할 이벤트 */
export type StageEvent =
  | { kind: 'bg'; bg: StageState['bg']; fx: 'fade' | 'black' | 'white' | 'cut' }
  | { kind: 'show'; char: keyof StageState['chars']; state: CharState; entering: boolean }
  | { kind: 'hide'; char: keyof StageState['chars'] }
  | { kind: 'bgm'; track: StageState['bgm'] }
  | { kind: 'sfx'; sound: string }
  | { kind: 'fx'; fx: 'shake' | 'flash' }
  | { kind: 'cg'; cg: CgId | null }
  | { kind: 'place'; text: string }
  | { kind: 'route'; route: RouteId };

export interface StepResult {
  step: BlockingStep;
  scene: Scene;
  events: StageEvent[];
}

export class StoryError extends Error {}

/**
 * settle/advance/choose 가 실행하는 비블로킹 스텝(연출·흐름 제어·판정)을 하나씩 알려 주는 관찰자.
 * 검증기가 '실제로 실행된 지시'를 모으는 데 쓴다(게임 화면은 쓰지 않는다)
 */
export type StepObserver = (step: Step, scene: Scene) => void;

/** 점수 0 으로 시작하는 히로인별 점수표 */
export function zeroPoints(): Record<HeroineId, number> {
  return Object.fromEntries(HEROINES.map((h) => [h, 0])) as Record<HeroineId, number>;
}

export function initialStage(): StageState {
  return { bg: 'black', chars: {}, order: [], bgm: null, cg: null };
}

export function newGameState(story: Story): GameState {
  const first = story.scenes[story.start];
  if (!first || first.steps.length === 0) throw new StoryError(`시작 장면이 없습니다: ${story.start}`);
  const state: GameState = {
    sceneId: first.id,
    stepId: first.steps[0].id,
    points: zeroPoints(),
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
 * 루트 결정 규칙(순수 함수)
 *  1) 후보(candidates) 중 누적 점수가 가장 높은 히로인
 *  2) 공동 최고점이면 history(선택 시간순, 개인 선택의 히로인 · '함께'나 미선택은 null)를 뒤에서부터 훑어
 *     공동 최고점인 히로인을 처음 만나면 그 히로인. 공동 최고점이 아닌 히로인·null 은 건너뛴다
 *  3) 그래도 정해지지 않으면 공동 최고점 중 후보 목록의 앞쪽(osana → tenko → koharu) — 실제 대본에서는 발생하지 않음
 * 점수는 0.5 단위 소수도 그대로 비교한다.
 */
export function pickRoute(
  points: Readonly<Partial<Record<HeroineId, number>>>,
  candidates: readonly HeroineId[],
  history: ReadonlyArray<HeroineId | null>,
): HeroineId {
  const pool = candidates.length ? candidates : BASE_HEROINES;
  const score = (h: HeroineId) => points[h] ?? 0;
  const top = Math.max(...pool.map(score));
  const tied = pool.filter((h) => score(h) === top);
  if (tied.length === 1) return tied[0];
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i];
    if (h !== null && tied.includes(h)) return h;
  }
  return tied[0];
}

/**
 * 예전 2인 규칙(호환용): 소꿉친구·전학생 중 점수가 높은 쪽, 동점이면 가장 최근 히로인 선택, 그것도 없으면 소꿉친구.
 * 새 코드는 pickRoute 를 쓴다.
 */
export function decideRoute(points: Readonly<Partial<Record<HeroineId, number>>>, lastHeroine: HeroineId | null): HeroineId {
  return pickRoute(points, BASE_HEROINES, [lastHeroine]);
}

/** 이야기에서 choice step 을 id 로 찾는다(루트 결정·저장 재계산에서 옵션 정의를 볼 때) */
export function findChoiceStep(story: Story, choiceId: string): ChoiceStep | null {
  const hit = stepIndex(story).get(choiceId);
  if (!hit) return null;
  const step = hit.scene.steps[hit.index];
  return step.t === 'choice' ? step : null;
}

/** 이 decideRoute 에서 루트 후보가 되는 히로인: 기본 히로인 + hidden 플래그가 true 인 히로인 */
export function routeCandidates(state: GameState, step: DecideRouteStep): HeroineId[] {
  return HEROINES.filter((h) => {
    const flagName = step.hidden?.[h];
    if (flagName) return state.flags[flagName] === true;
    return BASE_HEROINES.includes(h);
  });
}

/** decideRoute.order 순서의 선택 기록을 개인 선택 히로인 목록으로 바꾼다('함께'·미선택은 null) */
export function choiceHistory(story: Story, state: GameState, step: DecideRouteStep): Array<HeroineId | null> {
  if (!step.order?.length) return [state.lastHeroine];
  return step.order.map((id) => {
    const picked = state.choices[id];
    if (picked === undefined) return null;
    const option = findChoiceStep(story, id)?.options.find((o) => o.id === picked);
    return option?.heroine ?? null;
  });
}

/**
 * 구버전(스키마 3 이하) 저장 호환 표식. 후반 선택을 옛 규칙(+3, c8.ch·c9.ch·c10.ch)으로 이미 시작한 진행 중 저장에
 * 저장 이전(save.ts, 3→4)이 붙인다. 이 플래그가 true 면 tieRoute(히든 루트)를 쓰지 않는다(옛 판정 유지).
 * 대본은 이 플래그를 직접 쓰지 않는다.
 */
export const LEGACY_LATE_FLAG = 'kh.late3';

/**
 * 히든 루트 조건(계약 6.3). 셋 다 맞을 때만 true:
 *  1) tieRoute 가 있음 2) 구저장 표식(LEGACY_LATE_FLAG)이 없음 3) 후보가 HEROINES 전원이고 후보 점수가 모두 같음.
 * 미발견 플레이는 후보가 두 명이라 히든이 될 수 없다.
 */
export function isGroupTie(
  points: Readonly<Partial<Record<HeroineId, number>>>,
  candidates: readonly HeroineId[],
  opts: { tieRoute?: GroupRouteId; legacyLate?: boolean },
): boolean {
  if (!opts.tieRoute || opts.legacyLate) return false;
  if (candidates.length !== HEROINES.length || !HEROINES.every((h) => candidates.includes(h))) return false;
  const first = points[candidates[0]] ?? 0;
  return candidates.every((h) => (points[h] ?? 0) === first);
}

/**
 * 루트 판정(순수 함수). 히든 루트 조건(isGroupTie)이면 tieRoute, 아니면 pickRoute(최고점 → 공동 최고점은 최근 선택).
 * 실행기(decideRoute 스텝)·미리 불러오기 시뮬레이션은 routeFor 를 거쳐 이 함수를 쓴다.
 */
export function judgeRoute(
  points: Readonly<Partial<Record<HeroineId, number>>>,
  candidates: readonly HeroineId[],
  history: ReadonlyArray<HeroineId | null>,
  opts: { tieRoute?: GroupRouteId; legacyLate?: boolean } = {},
): RouteId {
  if (opts.tieRoute && isGroupTie(points, candidates, opts)) return opts.tieRoute;
  return pickRoute(points, candidates, history);
}

/**
 * 지금 상태로 이 decideRoute 를 실행하면 정해질 루트.
 * 게임(실행기 settle)과 미리 불러오기 시뮬레이션(ui/screens/preload.ts)이 같은 이 함수를 쓴다.
 */
export function routeFor(story: Story, state: GameState, step: DecideRouteStep): RouteId {
  return judgeRoute(state.points, routeCandidates(state, step), choiceHistory(story, state, step), {
    tieRoute: step.tieRoute,
    legacyLate: state.flags[LEGACY_LATE_FLAG] === true,
  });
}

/**
 * 해금 판정(UnlockStep). 플래그에 이미 boolean 이 있으면 아무것도 하지 않는다.
 * 해금되면 그 히로인의 시작 점수 = 두 히로인 점수의 평균(0.5 단위 보존).
 */
export function applyUnlock(state: GameState, step: UnlockStep): void {
  if (typeof state.flags[step.flag] === 'boolean') return;
  if (state.route !== null) {
    state.flags[step.flag] = false; // 루트 확정 뒤에는 새로 등장하지 않는다
    return;
  }
  const [a, b] = step.among;
  const pa = state.points[a] ?? 0;
  const pb = state.points[b] ?? 0;
  if (Math.abs(pa - pb) <= step.maxDiff) {
    state.flags[step.flag] = true;
    state.points[step.heroine] = (pa + pb) / 2;
  } else {
    state.flags[step.flag] = false;
  }
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
      if (state.route === null) state.points[e.add] = (state.points[e.add] ?? 0) + e.n;
    }
  }
}

/**
 * 지금 상태에서 화면에 보이는 옵션(visibleIf 가 없거나 참인 옵션). 원래 순서를 유지한다.
 * 선택지 표시·키보드 번호·choose()·검증기가 모두 이 결과만 쓴다.
 */
export function visibleOptions(state: GameState, step: ChoiceStep): ChoiceOption[] {
  return step.options.filter((o) => !o.visibleIf || evalCond(state, o.visibleIf));
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
 * 현재 위치가 이미 블로킹 스텝이면 아무것도 실행하지 않고 그 스텝을 돌려준다
 * (그래서 저장 위치에서 불러와도 앞 지시의 점수·해금·CG 가 다시 적용되지 않는다).
 * observe 를 주면 실행한 비블로킹 스텝을 하나씩 알려 준다.
 */
export function settle(story: Story, state: GameState, observe?: StepObserver): StepResult {
  const events: StageEvent[] = [];
  for (let guard = 0; guard < MAX_INSTANT_STEPS; guard++) {
    const loc = findStep(story, state.sceneId, state.stepId);
    if (!loc) throw new StoryError(`위치를 찾을 수 없습니다: ${state.sceneId} / ${state.stepId}`);
    const { scene, index } = loc;
    const step = scene.steps[index];
    if (isBlocking(step)) {
      // 대사에 붙은 표정 변경은 무대 상태에 반영해 둔다(저장 스냅샷이 화면과 일치하도록)
      if (step.t === 'say' && step.expr && isHeroineId(step.who)) {
        const cs = state.stage.chars[step.who];
        if (cs && cs.expr !== step.expr) {
          cs.expr = step.expr;
          events.push({ kind: 'show', char: step.who, state: { ...cs }, entering: false });
        }
      }
      return { step, scene, events };
    }

    observe?.(step, scene);
    switch (step.t) {
      case 'bg':
        // 장소가 바뀌면 이벤트 CG 는 걷힌다(배경 전환 연출과 함께 사라지도록 bg 이벤트보다 먼저 알린다)
        if (state.stage.cg) {
          state.stage.cg = null;
          events.push({ kind: 'cg', cg: null });
        }
        state.stage.bg = step.bg;
        events.push({ kind: 'bg', bg: step.bg, fx: step.fx ?? 'fade' });
        break;
      case 'cg':
        if ((state.stage.cg ?? null) !== step.cg) {
          state.stage.cg = step.cg;
          events.push({ kind: 'cg', cg: step.cg });
        }
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
      case 'unlock':
        applyUnlock(state, step);
        break;
      case 'decideRoute':
        if (state.route === null) {
          state.route = routeFor(story, state, step);
          events.push({ kind: 'route', route: state.route });
        }
        break;
      case 'routeBranch': {
        if (state.route === null) throw new StoryError(`루트가 확정되기 전에 routeBranch(${step.id}) 에 도달했습니다`);
        const target = step.scenes[state.route];
        if (!target) throw new StoryError(`routeBranch(${step.id}) 에 '${state.route}' 루트로 갈 장면이 없습니다`);
        enterScene(story, state, target);
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
export function advance(story: Story, state: GameState, observe?: StepObserver): StepResult | null {
  const cur = settle(story, state, observe);
  if (cur.step.t !== 'say' && cur.step.t !== 'card') return null;
  const loc = findStep(story, state.sceneId, state.stepId)!;
  moveNext(state, loc.scene, loc.index);
  return settle(story, state, observe);
}

/**
 * 선택지 결정. 현재 스텝이 선택지가 아니거나, 그런 옵션이 없거나, 지금 보이지 않는 옵션(visibleIf 거짓)이면 null
 * (중복 입력·숨은 옵션 방어). 점수: option.heroine 이면 그 히로인에게 points(기본 1), effects 의 add 도 더한다.
 * 루트 확정 후에는 점수를 바꾸지 않는다.
 */
export function choose(story: Story, state: GameState, optionId: string, observe?: StepObserver): StepResult | null {
  const cur = settle(story, state, observe);
  if (cur.step.t !== 'choice') return null;
  const step: ChoiceStep = cur.step;
  const option = visibleOptions(state, step).find((o) => o.id === optionId);
  if (!option) return null;

  state.choices[step.id] = option.id;
  if (option.heroine && state.route === null) {
    state.points[option.heroine] = (state.points[option.heroine] ?? 0) + (option.points ?? 1);
    state.lastHeroine = option.heroine;
  }
  applyEffects(state, option.effects);

  if (option.goto) {
    gotoInScene(story, state, cur.scene, option.goto);
  } else {
    const loc = findStep(story, state.sceneId, state.stepId)!;
    moveNext(state, loc.scene, loc.index);
  }
  return settle(story, state, observe);
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

export { BASE_HEROINES, HEROINES };
