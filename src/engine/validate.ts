/**
 * 스토리 데이터 검증기 (순수 함수).
 *  - 연결 오류: 존재하지 않는 장면/스텝/라벨, 장면 끝 누락
 *  - id 중복, 에셋 키·의상 조합 누락, 치환 변수 누락
 *  - 모든 선택 조합을 실제 실행기(settle/advance/choose/visibleOptions)로 시뮬레이션: 보이는 옵션만 고른다.
 *    엔딩 도달·루트 혼입·루트 규칙(독립 오라클 expectedRouteFromChoices 와 대조)·분기 분포(기대값이 주어지면 비교)
 *  - 히든 히로인 흔적: 해금되지 않은 상태에서 그 인물의 화자·그림·CG·배경·장면·이름 치환 키·개인 선택지가 실행되면 오류
 *  - 도달 불가능한 장면·엔딩
 */
import type { Cond, DecideRouteStep, GameState, HeroineId, Scene, Step, Story, UnlockStep } from './types';
import { BASE_HEROINES, HEROINES, HIDDEN_HEROINES, isHeroineId } from './types';
import { advance, choose, cloneState, newGameState, routeCandidates, settle, StoryError, visibleOptions, type StepObserver } from './runner';
import { resolveText, unknownPlaceholders } from './text';

export interface AssetChecker {
  hasBg(bg: string): boolean;
  hasSprite(char: string, outfit: string, hair: string, expr: string): boolean;
  hasBgm(id: string): boolean;
  hasSfx(id: string): boolean;
  /** 이벤트 CG 존재 여부(없으면 CG 검사 생략) */
  hasCg?(id: string): boolean;
  speakers: readonly string[];
}

export interface PathChoice {
  choice: string;
  option: string;
  /** 개인 선택의 히로인('함께'·루트 안 선택 등은 없음) */
  heroine?: HeroineId;
}

export interface PathRecord {
  choices: PathChoice[];
  route: HeroineId | null;
  ending: string | null;
  /** 독립 오라클(expectedRouteFromChoices)이 선택 기록만으로 계산한 루트 */
  expectedRoute: HeroineId;
  /** 이 경로에서 히든 히로인이 하나라도 해금됐는가(코하루: flags['kh.met'] === true) */
  met: boolean;
  /** 해금된 히든 히로인 */
  unlocked: HeroineId[];
  /** 해금 판정이 실행될 때까지 고른 선택 수(= 초반 조합 길이). 해금 판정이 없는 경로면 null */
  gateAt: number | null;
  /** 루트가 정해진 순간의 점수(정해지지 않았으면 null) */
  points: Record<HeroineId, number> | null;
  /** 루트 후보 중 공동 최고점이라 동점 처리로 정해졌는가 */
  tie: boolean;
  mainChars: number;
  mainLines: number;
  epilogueChars: number;
  epilogueLines: number;
}

/** 분기 분포 집계 */
export interface BranchStats {
  /** 엔딩까지 간 경로 수(보이는 옵션만 고른 모든 조합) */
  paths: number;
  /** 서로 다른 초반 조합(해금 판정 전까지의 선택) 수 */
  earlyCombos: number;
  /** 그중 해금된 초반 조합 수 */
  unlockedEarlyCombos: number;
  /** 엔딩별 경로 수 */
  endings: Record<string, number>;
  /** 동점 처리로 루트가 정해진 경로 수(해금/미해금) */
  ties: number;
  tiesUnlocked: number;
  tiesLocked: number;
  /** 해금/미해금 경로 수 */
  unlockedPaths: number;
  lockedPaths: number;
  /** 초반 조합 중, 그 플레이의 루트 후보 전원(미해금이면 기본 2명, 해금이면 3명)에 도달할 수 있는 조합 수 */
  earlyCombosReachingAll: number;
}

/** 분기 분포 기대값. 시뮬레이션 결과가 다르면 오류 */
export interface BranchExpectation {
  paths: number;
  earlyCombos: number;
  unlockedEarlyCombos: number;
  endings: Partial<Record<string, number>>;
  ties?: number;
  tiesUnlocked?: number;
  tiesLocked?: number;
  /** 초반 조합마다 그 플레이의 루트 후보 전원에 도달할 수 있어야 한다 */
  everyEarlyComboReachesAll?: boolean;
}

/**
 * 《내일도 같이 갈래?》 코하루 확장의 분기 기대값(독립 계산으로 확인된 값, CONTRACT 0절).
 * 3^7 = 2,187 경로, 초반 81조합 중 해금 25, 엔딩 아카네 999 / 히나 999 / 코하루 189,
 * 동점 처리 146회(해금 3인 동점 42, 미해금 2인 동점 104)
 */
export const EXPECTED_BRANCHING: BranchExpectation = {
  paths: 2187,
  earlyCombos: 81,
  unlockedEarlyCombos: 25,
  endings: { osana: 999, tenko: 999, koharu: 189 },
  ties: 146,
  tiesUnlocked: 42,
  tiesLocked: 104,
  everyEarlyComboReachesAll: true,
};

/** 히든 히로인의 '흔적'으로 보는 것: 화자 id, 배경·CG id 접두사, 이름 치환 키 */
export interface HiddenTrace {
  speakers: readonly string[];
  assetPrefix: string;
  vars: readonly string[];
}

export const HIDDEN_TRACES: Partial<Record<HeroineId, HiddenTrace>> = {
  koharu: { speakers: ['koharu', 'kh_friend'], assetPrefix: 'kh_', vars: ['koharu', 'koharuFamily'] },
};

export interface ValidateOptions {
  /** 분기 분포 기대값(실제 대본 검사에서는 EXPECTED_BRANCHING) */
  expect?: BranchExpectation;
  /** 히든 히로인 흔적 정의(기본 HIDDEN_TRACES) */
  hiddenTraces?: Partial<Record<HeroineId, HiddenTrace>>;
}

export interface ValidationReport {
  errors: string[];
  warnings: string[];
  paths: PathRecord[];
  branching: BranchStats;
  stats: {
    scenes: number;
    sayLines: number;
    choices: number;
    unreachableSteps: string[];
  };
}

const ID_RE = /^[A-Za-z0-9_.-]+$/;
/**
 * 한 문장 길이 한도(치환 후 글자 수). 대사창은 3줄이 기본이고, 넘치면 대사창이 위로 늘어난다(textbox.ts 안전장치).
 * 근거: Playwright 로 실제 대사창에 대본 문장을 이어 붙여 넣고 3줄에 들어가는 길이를 잰 값(글꼴 16px, 2026-11 측정).
 *  - 740x320(휴대폰 가로·브라우저 UI 포함 기준, 대사창 글자 폭 508px): 108자까지 모두 3줄.
 *    공백을 한글 한 글자 폭(1em)으로 넓힌 최악 글꼴 가정에서는 88자까지 모두 3줄 → LINE_MAX_CHARS.
 *  - 740x280(안드로이드 크롬 주소창 표시, 글자 폭 437px): 최악 글꼴 가정에서 74자까지 모두 3줄 → LINE_WARN_CHARS.
 *  - 667x375(아이폰 SE 가로, 글자 폭 605px)는 최악 가정에서도 106자까지 3줄이라 위 기준보다 여유가 있다.
 */
export const LINE_WARN_CHARS = 74;
export const LINE_MAX_CHARS = 88;
export const OPTION_MAX_CHARS = 34;
/** 시뮬레이션할 최대 경로 수(실제 대본 2,187개보다 넉넉하게) */
export const MAX_PATHS = 20000;
const TERMINAL = new Set<Step['t']>(['jump', 'routeBranch', 'ending', 'goto']);

function emptyBranchStats(): BranchStats {
  return {
    paths: 0,
    earlyCombos: 0,
    unlockedEarlyCombos: 0,
    endings: {},
    ties: 0,
    tiesUnlocked: 0,
    tiesLocked: 0,
    unlockedPaths: 0,
    lockedPaths: 0,
    earlyCombosReachingAll: 0,
  };
}

export function validateStory(
  story: Story,
  assets: AssetChecker,
  vars: Readonly<Record<string, string>>,
  options: ValidateOptions = {},
): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const seen = new Map<string, string>();
  let sayLines = 0;
  let choiceCount = 0;
  const traces = options.hiddenTraces ?? HIDDEN_TRACES;
  const hiddenFlag = hiddenFlags(story);

  if (!story.scenes[story.start]) errors.push(`시작 장면 '${story.start}' 이(가) 없습니다`);

  // ---- 정적 검사 ----------------------------------------------------------
  for (const [key, scene] of Object.entries(story.scenes)) {
    if (key !== scene.id) errors.push(`장면 키 '${key}' 와 id '${scene.id}' 가 다릅니다`);
    if (scene.steps.length === 0) {
      errors.push(`장면 '${scene.id}' 에 스텝이 없습니다`);
      continue;
    }
    const last = scene.steps[scene.steps.length - 1];
    if (!TERMINAL.has(last.t)) errors.push(`장면 '${scene.id}' 의 마지막 스텝이 jump/routeBranch/ending/goto 가 아닙니다 (${last.id})`);

    const localIds = new Set(scene.steps.map((s) => s.id));
    for (const step of scene.steps) {
      const prevScene = seen.get(step.id);
      if (prevScene) errors.push(`스텝 id 중복: '${step.id}' (${prevScene}, ${scene.id})`);
      seen.set(step.id, scene.id);
      const auto = step.id.includes('~');
      if (!auto && !ID_RE.test(step.id)) errors.push(`스텝 id 형식 오류: '${step.id}' (영문·숫자·_.- 만 사용)`);
      if (auto && (step.t === 'say' || step.t === 'card' || step.t === 'choice' || step.t === 'ending' || step.t === 'label')) {
        errors.push(`${step.t} 스텝에는 고유 id 를 직접 적어야 합니다 (${step.id})`);
      }

      switch (step.t) {
        case 'say': {
          sayLines++;
          if (step.who !== null && !assets.speakers.includes(step.who)) errors.push(`${step.id}: 알 수 없는 화자 '${step.who}'`);
          checkText(step.id, step.text);
          if (step.label) checkText(`${step.id}(이름표)`, step.label);
          if (step.expr && !isHeroineId(step.who)) warnings.push(`${step.id}: 히로인이 아닌 화자에 표정 지정`);
          break;
        }
        case 'card':
          checkText(step.id, step.text);
          if (step.sub) checkText(step.id, step.sub);
          break;
        case 'place':
          checkText(step.id, step.text);
          break;
        case 'choice': {
          choiceCount++;
          if (step.prompt) checkText(step.id, step.prompt);
          // 조건부 옵션(visibleIf)은 서로 배타적으로 보이게 쓴다: 정의는 최대 4개, 항상 보이는 옵션은 최대 3개.
          // 실제로 보이는 개수(2~3개)는 시뮬레이션에서 확인한다
          const always = step.options.filter((o) => !o.visibleIf).length;
          if (step.options.length < 2 || step.options.length > 4 || always > 3) {
            errors.push(`${step.id}: 선택지는 2~3개여야 합니다(조건부 옵션 포함 정의 최대 4개, 현재 ${step.options.length}개·항상 보임 ${always}개)`);
          }
          const optIds = new Set<string>();
          for (const o of step.options) {
            if (optIds.has(o.id)) errors.push(`${step.id}: 옵션 id 중복 '${o.id}'`);
            optIds.add(o.id);
            const t = resolveText(o.text, vars);
            if (t.length > OPTION_MAX_CHARS) warnings.push(`${step.id}/${o.id}: 선택지 문구가 깁니다(${t.length}자)`);
            checkText(`${step.id}/${o.id}`, o.text);
            if (o.goto && !localIds.has(o.goto)) errors.push(`${step.id}/${o.id}: 같은 장면에 이동 목표 '${o.goto}' 가 없습니다`);
            if (scene.route !== 'common' && o.heroine) warnings.push(`${step.id}/${o.id}: 루트 확정 후 선택지의 heroine 점수는 무시됩니다`);
            if (o.visibleIf) checkCondRefs(`${step.id}/${o.id}`, o.visibleIf);
            for (const ef of o.effects ?? []) {
              if ('add' in ef && !Number.isFinite(ef.n)) errors.push(`${step.id}/${o.id}: 점수 효과가 유한한 수가 아닙니다`);
            }
            if (o.points !== undefined && !Number.isFinite(o.points)) errors.push(`${step.id}/${o.id}: points 가 유한한 수가 아닙니다`);
          }
          break;
        }
        case 'if':
          if (!localIds.has(step.goto)) errors.push(`${step.id}: 같은 장면에 이동 목표 '${step.goto}' 가 없습니다`);
          checkCondRefs(step.id, step.cond);
          break;
        case 'goto':
          if (!localIds.has(step.to)) errors.push(`${step.id}: 같은 장면에 이동 목표 '${step.to}' 가 없습니다`);
          break;
        case 'jump':
          if (!story.scenes[step.scene]) errors.push(`${step.id}: 존재하지 않는 장면 '${step.scene}' 으로 jump`);
          break;
        case 'unlock': {
          const [a, b] = step.among ?? [];
          if (!isHeroineId(step.heroine)) errors.push(`${step.id}: 해금 대상 '${step.heroine}' 은(는) 히로인이 아닙니다`);
          if (!isHeroineId(a) || !isHeroineId(b) || a === b || a === step.heroine || b === step.heroine) {
            errors.push(`${step.id}: 해금 비교 대상(among)은 해금 대상이 아닌 서로 다른 히로인 둘이어야 합니다`);
          }
          if (!Number.isFinite(step.maxDiff) || step.maxDiff < 0) errors.push(`${step.id}: maxDiff 는 0 이상의 수여야 합니다`);
          if (!step.flag) errors.push(`${step.id}: 해금 플래그 이름이 비었습니다`);
          if (scene.route !== 'common') errors.push(`${step.id}: 해금 판정은 공통 장면에만 둘 수 있습니다`);
          break;
        }
        case 'decideRoute': {
          const order = step.order ?? [];
          const orderSeen = new Set<string>();
          for (const id of order) {
            if (orderSeen.has(id)) errors.push(`${step.id}: order 에 선택지 '${id}' 가 두 번 있습니다`);
            orderSeen.add(id);
            const target = findChoice(story, id);
            if (!target) errors.push(`${step.id}: order 의 선택지 '${id}' 가 없습니다`);
            else if (sceneOfStep(story, id)?.route !== 'common') errors.push(`${step.id}: order 의 선택지 '${id}' 가 공통 장면에 있지 않습니다`);
          }
          for (const [h, f] of Object.entries(step.hidden ?? {})) {
            if (!isHeroineId(h)) errors.push(`${step.id}: hidden 의 '${h}' 은(는) 히로인이 아닙니다`);
            else if (!f) errors.push(`${step.id}: hidden.${h} 플래그 이름이 비었습니다`);
            else if (!unlockSteps(story).some((u) => u.step.flag === f)) warnings.push(`${step.id}: hidden.${h} 플래그 '${f}' 를 정하는 unlock 지시가 없습니다`);
          }
          break;
        }
        case 'routeBranch':
          for (const h of HEROINES) {
            const target = story.scenes[step.scenes[h]];
            if (!target) errors.push(`${step.id}: 존재하지 않는 장면 '${step.scenes[h]}'`);
            else if (target.route !== h) errors.push(`${step.id}: ${h} 루트 분기 대상 '${target.id}' 의 route 가 '${target.route}' 입니다`);
          }
          break;
        case 'bg':
          if (!assets.hasBg(step.bg)) errors.push(`${step.id}: 배경 에셋 '${step.bg}' 없음`);
          break;
        case 'cg':
          if (step.cg && assets.hasCg && !assets.hasCg(step.cg)) errors.push(`${step.id}: 이벤트 CG 에셋 '${step.cg}' 없음`);
          break;
        case 'bgm':
          if (step.track && !assets.hasBgm(step.track)) errors.push(`${step.id}: 음악 에셋 '${step.track}' 없음`);
          break;
        case 'sfx':
          if (!assets.hasSfx(step.sound)) errors.push(`${step.id}: 효과음 에셋 '${step.sound}' 없음`);
          break;
        case 'ending':
          if (!story.endings[step.ending]) errors.push(`${step.id}: 정의되지 않은 엔딩 '${step.ending}'`);
          else if (scene.route !== story.endings[step.ending].heroine) errors.push(`${step.id}: ${scene.route} 장면에서 ${step.ending} 엔딩`);
          break;
        default:
          break;
      }
    }
  }

  function checkText(where: string, text: string) {
    if (!text.trim()) errors.push(`${where}: 빈 문장`);
    const unknown = unknownPlaceholders(text, vars);
    if (unknown.length) errors.push(`${where}: 정의되지 않은 치환 키 ${unknown.join(', ')}`);
    const resolved = resolveText(text, vars);
    if (resolved.length > LINE_MAX_CHARS) errors.push(`${where}: 한 문장이 너무 깁니다(${resolved.length}자, 최대 ${LINE_MAX_CHARS})`);
    else if (resolved.length > LINE_WARN_CHARS) warnings.push(`${where}: 문장이 깁니다(${resolved.length}자, 권장 ${LINE_WARN_CHARS} 이하)`);
    if (/\{|\}/.test(resolved)) warnings.push(`${where}: 해석되지 않은 중괄호가 남아 있습니다`);
  }

  function checkCondRefs(where: string, cond: Cond) {
    if ('choice' in cond) {
      const target = findChoice(story, cond.choice);
      if (!target) errors.push(`${where}: 조건이 참조하는 선택지 '${cond.choice}' 없음`);
      else if (!target.options.some((o) => o.id === cond.is)) errors.push(`${where}: 선택지 '${cond.choice}' 에 옵션 '${cond.is}' 없음`);
    } else if ('not' in cond) checkCondRefs(where, cond.not);
    else if ('all' in cond) cond.all.forEach((c) => checkCondRefs(where, c));
    else if ('any' in cond) cond.any.forEach((c) => checkCondRefs(where, c));
  }

  // ---- 시뮬레이션 (보이는 옵션의 모든 조합) ----------------------------------
  const paths: PathRecord[] = [];
  const visitedSteps = new Set<string>();
  const visitedScenes = new Set<string>();
  const endingsReached = new Set<string>();
  const MAX_BLOCKING = 5000;
  /** 흔적 메시지 → 그 흔적이 실행된 경로 수 */
  const traceHits = new Map<string, { count: number; example: string }>();
  const choiceShapeErrors = new Set<string>();
  const textLen = new Map<string, number>();
  const tracer = makeTracer(vars, traces, hiddenFlag);
  /** 정적 검사를 통과해 시뮬레이션을 끝까지 돌렸는가(분포 비교는 이때만) */
  let simulated = false;

  if (errors.length === 0) {
    simulated = true;
    type Frame = { state: GameState; rec: PathRecord; hits: Set<string> };
    /** 이 경로의 상태·기록으로 실행된 지시를 본다(흔적·해금 시점·루트 결정 순간의 점수) */
    const observerFor = ({ state, rec, hits }: Frame): StepObserver => (step, scene) => {
      tracer.step(state, step, scene, hits);
      if (step.t === 'unlock' && rec.gateAt === null) rec.gateAt = rec.choices.length;
      if (step.t === 'decideRoute' && state.route === null) {
        const cands = routeCandidates(state, step);
        const top = Math.max(...cands.map((h) => state.points[h] ?? 0));
        rec.points = { ...state.points };
        rec.tie = cands.filter((h) => (state.points[h] ?? 0) === top).length > 1;
      }
    };
    const stack: Frame[] = [{ state: newGameState(story), rec: newRecord(), hits: new Set() }];
    while (stack.length) {
      if (paths.length >= MAX_PATHS) {
        warnings.push(`선택 조합이 ${MAX_PATHS}개를 넘어 시뮬레이션을 중단했습니다`);
        break;
      }
      const frame = stack.pop()!;
      const { state, rec, hits } = frame;
      const observe = observerFor(frame);
      try {
        let count = 0;
        let res = settle(story, state, observe);
        for (;;) {
          if (++count > MAX_BLOCKING) throw new StoryError('블로킹 스텝이 너무 많습니다(순환 의심)');
          markVisited(state, visitedSteps, visitedScenes);
          checkRouteMixing(state, res.scene, rec, errors);
          checkStage(state, res.step, errors, warnings, assets);
          const step = res.step;
          tracer.step(state, step, res.scene, hits);
          if (step.t === 'say' || step.t === 'card') {
            let len = textLen.get(step.id);
            if (len === undefined) {
              len = resolveText(step.text, vars).length;
              textLen.set(step.id, len);
            }
            if (res.scene.part === 'epilogue') {
              rec.epilogueChars += len;
              rec.epilogueLines += 1;
            } else {
              rec.mainChars += len;
              rec.mainLines += 1;
            }
            res = advance(story, state, observe)!;
            continue;
          }
          if (step.t === 'choice') {
            const shown = visibleOptions(state, step);
            if (shown.length < 2 || shown.length > 3) {
              const msg = `${step.id}: 보이는 선택지가 ${shown.length}개입니다(2~3개여야 함, 선택: ${fmtChoices(rec)})`;
              if (!choiceShapeErrors.has(step.id)) {
                choiceShapeErrors.add(step.id);
                errors.push(msg);
              }
            }
            for (const o of [...shown].reverse()) {
              const picked: PathChoice = o.heroine ? { choice: step.id, option: o.id, heroine: o.heroine } : { choice: step.id, option: o.id };
              const child: Frame = { state: cloneState(state), rec: { ...rec, choices: [...rec.choices, picked] }, hits: new Set(hits) };
              // 고른 직후 실행되는 지시(반응·해금 판정 등)는 그 경로의 관찰자로 본다. 꺼낸 뒤 settle 은 같은 위치를 돌려줄 뿐이다
              if (!choose(story, child.state, o.id, observerFor(child))) throw new StoryError(`${step.id}: 보이는 옵션 ${o.id} 를 고를 수 없습니다`);
              stack.push(child);
            }
            break;
          }
          // ending
          rec.ending = step.ending;
          rec.route = state.route;
          rec.unlocked = HIDDEN_HEROINES.filter((h) => {
            const f = hiddenFlag.get(h);
            return !!f && state.flags[f] === true;
          });
          rec.met = rec.unlocked.length > 0;
          rec.expectedRoute = expectedRouteFromChoices(rec.choices, story);
          endingsReached.add(step.ending);
          if (state.route === null) errors.push(`루트 확정 없이 엔딩 ${step.ending} 도달 (선택: ${fmtChoices(rec)})`);
          else if (story.endings[step.ending]?.heroine !== state.route) errors.push(`루트 ${state.route} 인데 엔딩 ${step.ending} 도달`);
          if (state.route !== rec.expectedRoute) errors.push(`루트 규칙 불일치: 기대 ${rec.expectedRoute}, 실제 ${state.route} (선택: ${fmtChoices(rec)})`);
          for (const h of hits) {
            const t = traceHits.get(h);
            if (t) t.count++;
            else traceHits.set(h, { count: 1, example: fmtChoices(rec) });
          }
          paths.push(rec);
          break;
        }
      } catch (e) {
        errors.push(`시뮬레이션 오류 (선택: ${fmtChoices(rec)}): ${(e as Error).message}`);
      }
    }

    for (const [msg, { count, example }] of traceHits) {
      errors.push(`해금 전 히든 히로인 흔적이 실행됨: ${msg} (${count}개 경로, 예: ${example})`);
    }
    for (const sceneId of Object.keys(story.scenes)) {
      if (!visitedScenes.has(sceneId)) errors.push(`도달할 수 없는 장면: ${sceneId}`);
    }
    for (const endingId of Object.keys(story.endings)) {
      if (!endingsReached.has(endingId)) errors.push(`도달할 수 없는 엔딩: ${endingId}`);
    }
    const routed = new Set(Object.values(story.endings).map((e) => e.heroine));
    for (const h of HEROINES) {
      if (routed.has(h) && !paths.some((p) => p.route === h)) errors.push(`${h} 루트로 가는 선택 조합이 없습니다`);
    }
  }

  const branching = summarizeBranching(paths);
  if (options.expect && simulated) compareBranching(branching, options.expect, errors);

  const unreachableSteps: string[] = [];
  if (errors.length === 0) {
    for (const scene of Object.values(story.scenes)) {
      for (const step of scene.steps) {
        if ((step.t === 'say' || step.t === 'card' || step.t === 'choice') && !visitedSteps.has(step.id)) unreachableSteps.push(step.id);
      }
    }
    if (unreachableSteps.length) warnings.push(`도달하지 않는 문장 ${unreachableSteps.length}개: ${unreachableSteps.slice(0, 10).join(', ')}`);
  }

  return {
    errors,
    warnings,
    paths,
    branching,
    stats: { scenes: Object.keys(story.scenes).length, sayLines, choices: choiceCount, unreachableSteps },
  };
}

function newRecord(): PathRecord {
  return {
    choices: [],
    route: null,
    ending: null,
    expectedRoute: 'osana',
    met: false,
    unlocked: [],
    gateAt: null,
    points: null,
    tie: false,
    mainChars: 0,
    mainLines: 0,
    epilogueChars: 0,
    epilogueLines: 0,
  };
}

/** 대본의 해금 지시와 그 판정 직전 선택지(같은 장면에서 해금 지시보다 앞에 있는 마지막 선택지) */
function unlockSteps(story: Story): Array<{ step: UnlockStep; gate: string | null }> {
  const out: Array<{ step: UnlockStep; gate: string | null }> = [];
  for (const scene of Object.values(story.scenes)) {
    let lastChoice: string | null = null;
    for (const st of scene.steps) {
      if (st.t === 'choice') lastChoice = st.id;
      else if (st.t === 'unlock') out.push({ step: st, gate: lastChoice });
    }
  }
  return out;
}

/** 히든 히로인 → 해금 플래그(decideRoute.hidden 우선, 없으면 unlock 지시) */
function hiddenFlags(story: Story): Map<HeroineId, string> {
  const out = new Map<HeroineId, string>();
  for (const { step } of unlockSteps(story)) if (!out.has(step.heroine)) out.set(step.heroine, step.flag);
  for (const scene of Object.values(story.scenes)) {
    for (const st of scene.steps) {
      if (st.t !== 'decideRoute') continue;
      for (const [h, f] of Object.entries(st.hidden ?? {})) if (isHeroineId(h) && f) out.set(h, f);
    }
  }
  return out;
}

function firstDecide(story: Story): DecideRouteStep | null {
  for (const scene of Object.values(story.scenes)) {
    for (const st of scene.steps) if (st.t === 'decideRoute') return st;
  }
  return null;
}

/**
 * 히든 히로인 흔적 검사기. 그 히로인의 해금 플래그가 true 가 아닌 상태에서 실행된 지시를 모은다.
 * 흔적: 화자(say.who), 등장·퇴장(show/hide), 그 인물 전용 배경·CG(접두사), 그 인물 루트 장면,
 * 대사·이름표·카드·장소·선택지 문구·장면 제목의 이름 치환 키(또는 이름 그대로), 보이는 그 인물의 개인 선택지.
 */
function makeTracer(
  vars: Readonly<Record<string, string>>,
  traces: Partial<Record<HeroineId, HiddenTrace>>,
  flags: Map<HeroineId, string>,
) {
  const rules = HIDDEN_HEROINES.flatMap((h) => {
    const t = traces[h];
    if (!t) return [];
    const keys = t.vars.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const keyRe = keys.length ? new RegExp(`\\{(?:${keys.join('|')})(?::[^}]*)?\\}`) : null;
    const literals = t.vars.map((k) => vars[k]).filter((v): v is string => !!v);
    return [{ h, t, keyRe, literals, flag: flags.get(h) ?? null }];
  });
  const textCache = new Map<string, boolean>();
  const named = (h: HeroineId, keyRe: RegExp | null, literals: string[], text: string | undefined): boolean => {
    if (!text) return false;
    const k = `${h}\u0000${text}`;
    let v = textCache.get(k);
    if (v === undefined) {
      v = (!!keyRe && keyRe.test(text)) || literals.some((l) => resolveText(text, vars).includes(l));
      textCache.set(k, v);
    }
    return v;
  };
  return {
    step(state: GameState, step: Step, scene: Scene, hits: Set<string>): void {
      for (const { h, t, keyRe, literals, flag } of rules) {
        if (flag && state.flags[flag] === true) continue;
        const add = (what: string) => hits.add(`${h} · ${step.id}: ${what}`);
        const has = (text: string | undefined) => named(h, keyRe, literals, text);
        if (scene.route === h) hits.add(`${h} · 장면 ${scene.id}(route ${h}) 진입`);
        if (has(scene.title)) hits.add(`${h} · 장면 ${scene.id} 제목에 이름`);
        switch (step.t) {
          case 'say':
            if (step.who !== null && t.speakers.includes(step.who)) add(`화자 ${step.who}`);
            if (has(step.text)) add('대사에 이름');
            if (has(step.label)) add('이름표에 이름');
            break;
          case 'card':
            if (has(step.text) || has(step.sub)) add('카드에 이름');
            break;
          case 'place':
            if (has(step.text)) add('장소 표시에 이름');
            break;
          case 'choice': {
            if (has(step.prompt)) add('선택지 안내에 이름');
            for (const o of visibleOptions(state, step)) {
              if (o.heroine === h) add(`보이는 개인 선택지 ${o.id}`);
              if (has(o.text)) add(`선택지 ${o.id} 문구에 이름`);
            }
            break;
          }
          case 'show':
          case 'hide':
            if (step.char === h) add(`${step.t} ${h}`);
            break;
          case 'cg':
            if (step.cg && step.cg.startsWith(t.assetPrefix)) add(`CG ${step.cg}`);
            break;
          case 'bg':
            if (step.bg.startsWith(t.assetPrefix)) add(`배경 ${step.bg}`);
            break;
          default:
            break;
        }
      }
    },
  };
}

function summarizeBranching(paths: PathRecord[]): BranchStats {
  const out = emptyBranchStats();
  out.paths = paths.length;
  const early = new Map<string, { met: boolean; unlocked: HeroineId[]; routes: Set<HeroineId> }>();
  for (const p of paths) {
    if (p.ending) out.endings[p.ending] = (out.endings[p.ending] ?? 0) + 1;
    if (p.met) out.unlockedPaths++;
    else out.lockedPaths++;
    if (p.tie) {
      out.ties++;
      if (p.met) out.tiesUnlocked++;
      else out.tiesLocked++;
    }
    if (p.gateAt === null) continue;
    const key = p.choices
      .slice(0, p.gateAt)
      .map((c) => `${c.choice}=${c.option}`)
      .join(',');
    let e = early.get(key);
    if (!e) {
      e = { met: p.met, unlocked: p.unlocked, routes: new Set() };
      early.set(key, e);
    }
    if (p.route) e.routes.add(p.route);
  }
  out.earlyCombos = early.size;
  for (const e of early.values()) {
    if (e.met) out.unlockedEarlyCombos++;
    const cands = [...BASE_HEROINES, ...e.unlocked];
    if (cands.every((h) => e.routes.has(h))) out.earlyCombosReachingAll++;
  }
  return out;
}

function compareBranching(got: BranchStats, want: BranchExpectation, errors: string[]): void {
  const cmp = (name: string, a: number, b: number | undefined) => {
    if (b !== undefined && a !== b) errors.push(`분기 분포 불일치: ${name} 기대 ${b}, 실제 ${a}`);
  };
  cmp('경로 수', got.paths, want.paths);
  cmp('초반 조합 수', got.earlyCombos, want.earlyCombos);
  cmp('해금 초반 조합 수', got.unlockedEarlyCombos, want.unlockedEarlyCombos);
  for (const [ending, n] of Object.entries(want.endings)) cmp(`${ending} 엔딩 수`, got.endings[ending] ?? 0, n);
  for (const ending of Object.keys(got.endings)) {
    if (!(ending in want.endings)) errors.push(`분기 분포 불일치: 기대하지 않은 엔딩 ${ending} (${got.endings[ending]}개 경로)`);
  }
  cmp('동점 처리 수', got.ties, want.ties);
  cmp('해금 경로 동점 처리 수', got.tiesUnlocked, want.tiesUnlocked);
  cmp('미해금 경로 동점 처리 수', got.tiesLocked, want.tiesLocked);
  if (want.everyEarlyComboReachesAll && got.earlyCombosReachingAll !== got.earlyCombos) {
    errors.push(`분기 분포 불일치: 후보 전원의 엔딩에 도달할 수 있는 초반 조합이 ${got.earlyCombosReachingAll}/${got.earlyCombos}개입니다`);
  }
}

function findChoice(story: Story, id: string) {
  for (const s of Object.values(story.scenes)) {
    for (const st of s.steps) if (st.id === id && st.t === 'choice') return st;
  }
  return null;
}

function fmtChoices(rec: PathRecord): string {
  return rec.choices.map((c) => `${c.choice}=${c.option}`).join(', ') || '(없음)';
}

/**
 * 실행기와 독립적으로 선택 기록만 보고 루트를 다시 계산한다(규칙 교차 검증).
 * 실행기 코드(pickRoute·applyUnlock·choose)를 쓰지 않고 대본의 정적 정의만으로 CONTRACT 0절 규칙을 다시 적용한다.
 *  1) 공통 장면 선택만 점수에 넣는다: 개인 선택은 heroine 에 points(기본 1), effects 의 add 도 더한다('함께').
 *  2) 해금 지시는 같은 장면에서 그 지시 앞의 마지막 선택지를 고른 직후에 한 번 판정한다:
 *     두 점수 차 ≤ maxDiff 면 해금하고 시작 점수 = 평균.
 *  3) 후보 = 기본 히로인 + 해금된 히든 히로인(decideRoute.hidden 의 플래그). 최고점 단독이면 그 히로인,
 *     동점이면 decideRoute.order 를 뒤에서부터 훑어 공동 최고점인 개인 선택을 처음 만나는 히로인
 *     (order 가 없으면 마지막 개인 선택), 그래도 없으면 후보 순서의 첫 공동 최고점.
 */
export function expectedRouteFromChoices(choices: PathRecord['choices'], story: Story): HeroineId {
  const pts = {} as Record<HeroineId, number>;
  for (const h of HEROINES) pts[h] = 0;
  const flags = new Map<string, boolean>();
  const unlocks = unlockSteps(story);
  const decide = firstDecide(story);
  const picked = new Map<string, string>();
  let last: HeroineId | null = null;

  const judge = (u: UnlockStep) => {
    if (flags.has(u.flag)) return;
    const [a, b] = u.among;
    const ok = Math.abs(pts[a] - pts[b]) <= u.maxDiff;
    flags.set(u.flag, ok);
    if (ok) pts[u.heroine] = (pts[a] + pts[b]) / 2;
  };
  for (const u of unlocks) if (u.gate === null) judge(u.step);

  for (const c of choices) {
    const step = findChoice(story, c.choice);
    const scene = step ? sceneOfStep(story, step.id) : null;
    if (!step || !scene || scene.route !== 'common') continue; // 루트 확정 후 선택은 루트에 영향 없음
    picked.set(c.choice, c.option);
    const o = step.options.find((x) => x.id === c.option);
    if (o) {
      if (o.heroine) {
        pts[o.heroine] += o.points ?? 1;
        last = o.heroine;
      }
      for (const ef of o.effects ?? []) if ('add' in ef) pts[ef.add] += ef.n;
    }
    for (const u of unlocks) if (u.gate === c.choice) judge(u.step);
  }

  const hidden = decide?.hidden ?? {};
  const cands = HEROINES.filter((h) => {
    const f = hidden[h];
    return f ? flags.get(f) === true : BASE_HEROINES.includes(h);
  });
  let best = -Infinity;
  for (const h of cands) if (pts[h] > best) best = pts[h];
  const tied = cands.filter((h) => pts[h] === best);
  if (tied.length === 1) return tied[0];
  const history: Array<HeroineId | null> = decide?.order?.length
    ? decide.order.map((id) => {
        const opt = picked.get(id);
        const o = opt === undefined ? undefined : findChoice(story, id)?.options.find((x) => x.id === opt);
        return o?.heroine ?? null;
      })
    : [last];
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i];
    if (h && tied.includes(h)) return h;
  }
  return tied[0] ?? 'osana';
}

function sceneOfStep(story: Story, stepId: string): Scene | null {
  for (const s of Object.values(story.scenes)) if (s.steps.some((x) => x.id === stepId)) return s;
  return null;
}

function markVisited(state: GameState, steps: Set<string>, scenes: Set<string>) {
  steps.add(state.stepId);
  scenes.add(state.sceneId);
}

function checkRouteMixing(state: GameState, scene: Scene, rec: PathRecord, errors: string[]) {
  if (state.route !== null && scene.route !== state.route) {
    const msg = `루트 혼입: ${state.route} 확정 후 '${scene.id}'(${scene.route}) 장면 진입 (선택: ${fmtChoices(rec)})`;
    if (!errors.includes(msg)) errors.push(msg);
  }
  if (state.route === null && scene.route !== 'common') {
    const msg = `루트 확정 전 '${scene.id}'(${scene.route}) 장면 진입`;
    if (!errors.includes(msg)) errors.push(msg);
  }
}

function checkStage(state: GameState, step: Step, errors: string[], warnings: string[], assets: AssetChecker) {
  for (const [char, cs] of Object.entries(state.stage.chars)) {
    if (!cs) continue;
    if (!assets.hasSprite(char, cs.outfit, cs.hair, cs.expr)) {
      const msg = `${step.id}: '${char}' 스프라이트 조합 없음 (${cs.outfit}/${cs.hair}/${cs.expr})`;
      if (!errors.includes(msg)) errors.push(msg);
    }
  }
  if (step.t === 'say' && step.expr && isHeroineId(step.who)) {
    const cs = state.stage.chars[step.who];
    if (!cs) {
      const msg = `${step.id}: 화면에 없는 '${step.who}' 의 표정을 지정했습니다`;
      if (!warnings.includes(msg)) warnings.push(msg);
    } else if (!assets.hasSprite(step.who, cs.outfit, cs.hair, step.expr)) {
      const msg = `${step.id}: '${step.who}' 스프라이트 조합 없음 (${cs.outfit}/${cs.hair}/${step.expr})`;
      if (!errors.includes(msg)) errors.push(msg);
    }
  }
}
