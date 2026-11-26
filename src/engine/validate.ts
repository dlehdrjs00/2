/**
 * 스토리 데이터 검증기 (순수 함수).
 *  - 연결 오류: 존재하지 않는 장면/스텝/라벨, 장면 끝 누락
 *  - id 중복, 에셋 키·의상 조합 누락, 치환 변수 누락, 점수(points·add)가 0.5 의 배수인지
 *  - 루트(RouteId: 히로인 셋 + 히든 루트 'group') 기준 routeBranch·엔딩 정의(EndingDef.route) 검사
 *  - 모든 선택 조합을 실제 실행기(settle/advance/choose/visibleOptions)로 시뮬레이션: 보이는 옵션만 고른다.
 *    엔딩 도달·루트 혼입·루트 규칙(경로마다 실제로 실행된 decideRoute 기준의 독립 오라클 expectedRouteFromChoices 와 대조)·
 *    분기 분포(기대값이 주어지면 비교, 히든 루트와 두 사람 동점은 따로 센다)·결말 갈래 커버리지
 *  - 루트 확정 뒤 구간은 메모로 한 번만 시뮬레이션한다(memo, 기본 켬). 루트가 정해진 뒤의 진행은
 *    (위치·루트·플래그·루트 장면이 조건에 쓰는 선택·무대)로만 정해지므로, 같은 값이면 그 뒤 결과(엔딩·글자 수·흔적)를 재사용한다
 *  - 구저장 시드(legacySeeds): 새 흐름이 어떤 장면(from)에 들어가는 순간의 상태를 옛 장면(to)에 넣어 따로 시뮬레이션한다
 *    (옛 빌드에서 후반 선택을 시작한 저장이 옛 배점·옛 판정으로 끝나는지, 히든 루트가 나오지 않는지)
 *  - 히든 히로인 흔적: 해금되지 않은 상태에서 그 인물의 화자·그림(접두사·id 목록)·CG·배경·장면(자기 루트·히든 루트)·
 *    이름 치환 키·개인 선택지가 실행되면 오류. 루트 전용 그림(end_group_* 등)이 그 루트 밖에서 실행되면 오류
 *  - 도달 불가능한 장면·엔딩
 */
import type { Cond, DecideRouteStep, EndingKind, GameState, HeroineId, RouteId, Scene, Step, Story, UnlockStep } from './types';
import { BASE_HEROINES, HEROINES, HIDDEN_HEROINES, isHeroineId, isRouteId } from './types';
import { advance, choose, cloneState, newGameState, routeCandidates, settle, snapshotSceneEntry, StoryError, visibleOptions, type StepObserver } from './runner';
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
  route: RouteId | null;
  ending: string | null;
  /** 도달한 엔딩의 갈래(축제 쪽·일상 쪽). 엔딩 정의가 없으면 null */
  endingKind: EndingKind | null;
  /** 독립 오라클(expectedRouteFromChoices)이 선택 기록과 실행된 decideRoute 만으로 계산한 루트 */
  expectedRoute: RouteId;
  /** 이 경로에서 히든 히로인이 하나라도 해금됐는가(코하루: flags['kh.met'] === true) */
  met: boolean;
  /** 해금된 히든 히로인 */
  unlocked: HeroineId[];
  /** 해금 판정이 실행될 때까지 고른 선택 수(= 초반 조합 길이). 해금 판정이 없는 경로면 null */
  gateAt: number | null;
  /** 루트를 정한 decideRoute 가 실행될 때까지 고른 선택 수(= 판정 단위 조합 길이, 결말 갈래 선택 제외). 없으면 null */
  decisionAt: number | null;
  /** 이 경로에서 실제로 실행되어 루트를 정한 decideRoute 스텝 id */
  decideStep: string | null;
  /** 루트가 정해진 순간의 점수(정해지지 않았으면 null) */
  points: Record<HeroineId, number> | null;
  /** 판정 순간 후보 중 공동 최고점 인원(1 = 단독 최고점) */
  topCount: number;
  /** 이 판정이 낼 수 있었던 루트(후보 히로인 + 후보가 전원이면 tieRoute) */
  routeOptions: RouteId[];
  /** 두 사람 이상 공동 최고점이라 선택 기록(동점 처리)으로 루트를 정했는가. 히든 루트(전원 동점 → tieRoute)는 제외 */
  tie: boolean;
  /** 후보 전원 동점으로 히든 루트(tieRoute)가 정해졌는가 */
  hidden: boolean;
  /** 공통 장면(route 'common')에서 읽은 글자 수·문장 수(main 에 포함된다) */
  commonChars: number;
  commonLines: number;
  /** part 'main' 장면(공통 + 루트 본편) */
  mainChars: number;
  mainLines: number;
  epilogueChars: number;
  epilogueLines: number;
}

/** 판정 단위 집계(결말 갈래 선택 전까지의 서로 다른 선택 조합 = 루트가 정해진 조합) */
export interface DecisionStats {
  /** 엔딩까지 간 경로 수 */
  paths: number;
  /** 서로 다른 판정 조합 수 */
  decisions: number;
  /** 판정 조합별 루트 수 */
  routes: Record<string, number>;
  /** 히든 루트(후보 전원 동점 → tieRoute)로 정해진 판정 수 */
  hidden: number;
  /** 동점 처리(두 사람 이상 공동 최고점 → 선택 기록)로 정해진 판정 수. 히든 루트는 제외 */
  ties: number;
  /** 후보 셋 이상이 모두 같은 점수였던 판정 수(히든 루트 + 옛 규칙의 세 명 동점) */
  allTied: number;
}

/** 분기 분포 집계 */
export interface BranchStats {
  /** 엔딩까지 간 경로 수(보이는 옵션만 고른 모든 조합, 결말 갈래 선택 포함) */
  paths: number;
  /** 서로 다른 초반 조합(해금 판정 전까지의 선택) 수 */
  earlyCombos: number;
  /** 그중 해금된 초반 조합 수 */
  unlockedEarlyCombos: number;
  /** 엔딩별 경로 수 */
  endings: Record<string, number>;
  /** 판정 조합 수(결말 갈래 선택 전까지) */
  decisions: number;
  unlockedDecisions: number;
  lockedDecisions: number;
  /** 판정 조합별 루트 수(히든 루트 'group' 포함) */
  routes: Record<string, number>;
  /** 히든 루트로 정해진 판정 수 */
  hidden: number;
  /** 동점 처리로 정해진 판정 수(해금/미해금). 히든 루트는 세지 않는다 */
  ties: number;
  tiesUnlocked: number;
  tiesLocked: number;
  /** 후보 셋 이상 전원 동점이었던 판정 수 */
  allTied: number;
  /** 해금/미해금 경로 수 */
  unlockedPaths: number;
  lockedPaths: number;
  /** 초반 조합 중, 그 플레이가 낼 수 있는 루트 전원(미해금 2, 해금 3 + 히든 루트)에 도달할 수 있는 조합 수 */
  earlyCombosReachingAll: number;
  /** 판정 조합 중, 그 루트에 정의된 엔딩(축제 쪽·일상 쪽)에 모두 도달할 수 있는 조합 수 */
  decisionsReachingRouteEndings: number;
  /** 구저장 시드 시뮬레이션 결과(시드가 없으면 null). 위 집계에는 넣지 않는다 */
  legacy: DecisionStats | null;
}

/** 분기 분포 기대값. 시뮬레이션 결과가 다르면 오류 */
export interface BranchExpectation {
  paths: number;
  earlyCombos: number;
  unlockedEarlyCombos: number;
  endings: Partial<Record<string, number>>;
  decisions?: number;
  unlockedDecisions?: number;
  lockedDecisions?: number;
  routes?: Partial<Record<string, number>>;
  hidden?: number;
  ties?: number;
  tiesUnlocked?: number;
  tiesLocked?: number;
  allTied?: number;
  unlockedPaths?: number;
  lockedPaths?: number;
  /** 초반 조합마다 그 플레이가 낼 수 있는 루트 전원에 도달할 수 있어야 한다 */
  everyEarlyComboReachesAll?: boolean;
  /** 판정 조합마다 그 루트의 엔딩(갈래) 전부에 도달할 수 있어야 하고, 루트마다 축제 쪽·일상 쪽 엔딩이 정의돼 있어야 한다 */
  everyDecisionReachesRouteEndings?: boolean;
  /** 구저장 시드 기대값(주면 시드 시뮬레이션이 있어야 한다) */
  legacy?: Partial<DecisionStats>;
}

/**
 * 《내일도 같이 갈래?》 여덟 엔딩 확장의 분기 기대값(독립 계산으로 확인된 값, 설계 계약 5.1절).
 *  - 초반 81 조합 중 발견 25(동점 출발 7·1점 차 18)
 *  - 발견 25 × 후반 여섯 선택 3^6 = 18,225 판정: 아카네 5,811 / 히나 5,811 / 코하루 4,893 / 히든 1,710, 두 사람 동점 1,770
 *  - 미발견 56 × 후반 세 선택 3^3 = 1,512 판정: 아카네 756 / 히나 756, 두 사람 동점 104
 *  - 판정 19,737 = 아카네 6,567 / 히나 6,567 / 코하루 4,893 / 히든 1,710
 *  - 경로(엔딩) 수는 결말 갈래 선택이 루트당 정확히 1회(두 갈래)일 때의 값: 39,474, 엔딩마다 그 루트의 판정 수와 같다
 *  - 구저장 시드(옛 후반 c8·c9·c10, +3): 발견 25 × 27 = 675 판정, 243 / 243 / 189, 세 명 동점 42건은 히든이 아니다
 */
export const EXPECTED_BRANCHING: BranchExpectation = {
  paths: 39474,
  earlyCombos: 81,
  unlockedEarlyCombos: 25,
  endings: {
    osana: 6567,
    osana_daily: 6567,
    tenko: 6567,
    tenko_daily: 6567,
    koharu: 4893,
    koharu_daily: 4893,
    group_festival: 1710,
    group_daily: 1710,
  },
  decisions: 19737,
  unlockedDecisions: 18225,
  lockedDecisions: 1512,
  routes: { osana: 6567, tenko: 6567, koharu: 4893, group: 1710 },
  hidden: 1710,
  ties: 1874,
  tiesUnlocked: 1770,
  tiesLocked: 104,
  allTied: 1710,
  unlockedPaths: 36450,
  lockedPaths: 3024,
  everyEarlyComboReachesAll: true,
  everyDecisionReachesRouteEndings: true,
  legacy: { paths: 1350, decisions: 675, routes: { osana: 243, tenko: 243, koharu: 189 }, hidden: 0, ties: 42, allTied: 42 },
};

/** 히든 히로인의 '흔적'으로 보는 것: 화자 id, 배경·CG id 접두사·id 목록, 그 인물이 나오는 루트, 이름 치환 키 */
export interface HiddenTrace {
  speakers: readonly string[];
  assetPrefix: string;
  /** 접두사와 상관없이 그 인물이 그려진 그림 id(CG·배경) */
  assets?: readonly string[];
  /** 그 인물 루트(장면 route = 히로인 id) 밖에서 그 인물이 나오는 루트(예: 히든 루트 'group') */
  routes?: readonly RouteId[];
  vars: readonly string[];
}

export const HIDDEN_TRACES: Partial<Record<HeroineId, HiddenTrace>> = {
  koharu: {
    speakers: ['koharu', 'kh_friend'],
    assetPrefix: 'kh_',
    assets: ['group_ice_four', 'group_frog', 'group_rain', 'end_koharu_coin', 'end_group_fireworks', 'end_group_morning'],
    routes: ['group'],
    vars: ['koharu', 'koharuFamily'],
  },
};

/** 그 루트가 확정된 경로에서만 실행되어야 하는 그림(CG·배경 id 접두사) */
export interface RouteOnlyAsset {
  prefix: string;
  route: RouteId;
}
export const ROUTE_ONLY_ASSETS: readonly RouteOnlyAsset[] = [{ prefix: 'end_group_', route: 'group' }];

/**
 * 구저장 시드: 메인 시뮬레이션이 장면 from 에 들어가는 순간(장면 진입 스냅샷)의 상태를 장면 to 의 처음에 놓고
 * 따로 끝까지 시뮬레이션한다. flags 는 시드에 더 얹을 플래그.
 */
export interface LegacySeed {
  from: string;
  to: string;
  flags?: Record<string, boolean | number | string>;
}
/**
 * 실제 대본의 구저장 시드: 새 발견 경로의 첫 에피소드(e1_ice4)에 들어가는 상태 = 옛 빌드에서 토요일 추첨 뒤 c8_bakery 에
 * 들어가던 상태. 옛 장면 c8_bakery → c9_puzzle → c10_window(옛 k 분기 +3, 옛 판정)로 가야 하고 히든 루트가 나오면 안 된다.
 * 구저장 표식(kh.late3)은 얹지 않는다: 표식 없이도 옛 장면이 옛 판정으로 이어지는지(대본 구조)를 본다
 */
export const LEGACY_SEEDS: readonly LegacySeed[] = [{ from: 'e1_ice4', to: 'c8_bakery' }];

export interface ValidateOptions {
  /** 분기 분포 기대값(실제 대본 검사에서는 EXPECTED_BRANCHING) */
  expect?: BranchExpectation;
  /** 히든 히로인 흔적 정의(기본 HIDDEN_TRACES) */
  hiddenTraces?: Partial<Record<HeroineId, HiddenTrace>>;
  /** 루트 전용 그림(기본 ROUTE_ONLY_ASSETS) */
  routeOnlyAssets?: readonly RouteOnlyAsset[];
  /** 구저장 시드(기본 LEGACY_SEEDS, 두 장면이 모두 있는 대본에서만 돈다). [] 이면 끈다 */
  legacySeeds?: readonly LegacySeed[];
  /** 루트 확정 뒤 구간 메모(기본 true). false 면 모든 경로를 끝까지 따로 실행한다(메모 검증용) */
  memo?: boolean;
}

export interface ValidationReport {
  errors: string[];
  warnings: string[];
  paths: PathRecord[];
  /** 구저장 시드 경로(분포·도달 집계에는 넣지 않는다. 방문 문장·흔적·혼입 검사는 함께 한다) */
  legacyPaths: PathRecord[];
  branching: BranchStats;
  stats: {
    scenes: number;
    sayLines: number;
    choices: number;
    unreachableSteps: string[];
    /** 루트 확정 뒤 구간을 실제로 시뮬레이션한 횟수(메모를 쓰면 경로 수보다 훨씬 작다) */
    suffixRuns: number;
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
/** 시뮬레이션할 최대 경로 수(실제 대본 39,474개 + 구저장 시드 1,350개보다 넉넉하게) */
export const MAX_PATHS = 200000;
const TERMINAL = new Set<Step['t']>(['jump', 'routeBranch', 'ending', 'goto']);
/** 흔적 기록 구분(히든 히로인 흔적 / 루트 전용 그림) */
const HIT_HIDDEN = 'H\u0001';
const HIT_ROUTE = 'R\u0001';

function emptyDecisionStats(): DecisionStats {
  return { paths: 0, decisions: 0, routes: {}, hidden: 0, ties: 0, allTied: 0 };
}

function emptyBranchStats(): BranchStats {
  return {
    paths: 0,
    earlyCombos: 0,
    unlockedEarlyCombos: 0,
    endings: {},
    decisions: 0,
    unlockedDecisions: 0,
    lockedDecisions: 0,
    routes: {},
    hidden: 0,
    ties: 0,
    tiesUnlocked: 0,
    tiesLocked: 0,
    allTied: 0,
    unlockedPaths: 0,
    lockedPaths: 0,
    earlyCombosReachingAll: 0,
    decisionsReachingRouteEndings: 0,
    legacy: null,
  };
}

/** 0.5 의 배수(점수 단위). 0.5 = 2^-1 이라 이 배수의 합은 소수 오차 없이 정확하다 */
const isHalfStep = (n: number) => Number.isFinite(n) && Number.isInteger(n * 2);

export function validateStory(
  story: Story,
  assets: AssetChecker,
  vars: Readonly<Record<string, string>>,
  options: ValidateOptions = {},
): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  // 같은 스토리 객체를 고친 뒤 다시 검사할 수 있으므로 색인을 새로 만든다
  ownIndex.delete(story);
  const seen = new Map<string, string>();
  let sayLines = 0;
  let choiceCount = 0;
  const traces = options.hiddenTraces ?? HIDDEN_TRACES;
  const routeOnly = options.routeOnlyAssets ?? ROUTE_ONLY_ASSETS;
  const useMemo = options.memo !== false;
  const hiddenFlag = hiddenFlags(story);
  const decideById = new Map<string, DecideRouteStep>();
  for (const s of Object.values(story.scenes)) for (const st of s.steps) if (st.t === 'decideRoute') decideById.set(st.id, st);

  if (!story.scenes[story.start]) errors.push(`시작 장면 '${story.start}' 이(가) 없습니다`);
  for (const [key, def] of Object.entries(story.endings)) {
    if (!def) continue;
    if (def.id !== key) errors.push(`엔딩 키 '${key}' 와 id '${def.id}' 가 다릅니다`);
    if (!isRouteId(def.route)) errors.push(`엔딩 ${key}: 루트 '${String(def.route)}' 은(는) 루트 id 가 아닙니다`);
  }

  // ---- 정적 검사 ----------------------------------------------------------
  for (const [key, scene] of Object.entries(story.scenes)) {
    if (key !== scene.id) errors.push(`장면 키 '${key}' 와 id '${scene.id}' 가 다릅니다`);
    if (scene.route !== 'common' && !isRouteId(scene.route)) errors.push(`장면 '${scene.id}' 의 route '${String(scene.route)}' 은(는) 루트 id 가 아닙니다`);
    if (scene.steps.length === 0) {
      errors.push(`장면 '${scene.id}' 에 스텝이 없습니다`);
      continue;
    }
    const last = scene.steps[scene.steps.length - 1];
    if (!TERMINAL.has(last.t)) errors.push(`장면 '${scene.id}' 의 마지막 스텝이 jump/routeBranch/ending/goto 가 아닙니다 (${last.id})`);

    const localIds = new Set(scene.steps.map((s) => s.id));
    /** 이 장면에서 지금까지 본 마지막 decideRoute(routeBranch 가 받아야 할 루트 확인용) */
    let lastDecide: DecideRouteStep | null = null;
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
              if ('add' in ef) checkPoints(`${step.id}/${o.id}`, '점수 효과', ef.n);
            }
            if (o.points !== undefined) checkPoints(`${step.id}/${o.id}`, 'points', o.points);
          }
          break;
        }
        case 'set':
          for (const ef of step.effects) if ('add' in ef) checkPoints(step.id, '점수 효과', ef.n);
          break;
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
          lastDecide = step;
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
          if (step.tieRoute !== undefined) {
            if (!isRouteId(step.tieRoute) || isHeroineId(step.tieRoute)) errors.push(`${step.id}: tieRoute '${String(step.tieRoute)}' 는 히든 루트 id 여야 합니다`);
            else if (!HIDDEN_HEROINES.every((h) => step.hidden?.[h])) warnings.push(`${step.id}: tieRoute 가 있지만 후보가 히로인 전원이 될 수 없습니다(hidden 에 모든 히든 히로인이 필요)`);
          }
          if (scene.route !== 'common') errors.push(`${step.id}: 루트 결정은 공통 장면에만 둘 수 있습니다`);
          break;
        }
        case 'routeBranch': {
          for (const [r, target] of Object.entries(step.scenes)) {
            if (!isRouteId(r)) {
              errors.push(`${step.id}: '${r}' 은(는) 루트 id 가 아닙니다`);
              continue;
            }
            const sc = target ? story.scenes[target] : undefined;
            if (!sc) errors.push(`${step.id}: 존재하지 않는 장면 '${target}'`);
            else if (sc.route !== r) errors.push(`${step.id}: ${r} 루트 분기 대상 '${sc.id}' 의 route 가 '${sc.route}' 입니다`);
          }
          // 같은 장면의 decideRoute 가 낼 수 있는 루트는 모두 적어야 한다(없는 루트로 오면 실행기가 멈춘다)
          if (lastDecide) {
            const need: RouteId[] = HEROINES.filter((h) => BASE_HEROINES.includes(h) || !!lastDecide!.hidden?.[h]);
            if (lastDecide.tieRoute && need.length === HEROINES.length) need.push(lastDecide.tieRoute);
            const missing = need.filter((r) => !step.scenes[r]);
            if (missing.length) errors.push(`${step.id}: ${lastDecide.id} 가 낼 수 있는 루트 ${missing.join(', ')} 의 장면이 없습니다`);
          }
          break;
        }
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
        case 'ending': {
          const def = story.endings[step.ending];
          if (!def) errors.push(`${step.id}: 정의되지 않은 엔딩 '${step.ending}'`);
          else if (scene.route !== def.route) errors.push(`${step.id}: ${scene.route} 장면에서 ${step.ending} 엔딩(루트 ${def.route})`);
          break;
        }
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

  function checkPoints(where: string, what: string, n: number) {
    if (!Number.isFinite(n)) errors.push(`${where}: ${what}가 유한한 수가 아닙니다`);
    else if (!isHalfStep(n)) errors.push(`${where}: ${what} ${n} 이(가) 0.5 의 배수가 아닙니다`);
  }

  function checkCondRefs(where: string, cond: Cond) {
    if ('choice' in cond) {
      const target = findChoice(story, cond.choice);
      if (!target) errors.push(`${where}: 조건이 참조하는 선택지 '${cond.choice}' 없음`);
      else if (!target.options.some((o) => o.id === cond.is)) errors.push(`${where}: 선택지 '${cond.choice}' 에 옵션 '${cond.is}' 없음`);
    } else if ('route' in cond) {
      if (!isRouteId(cond.route)) errors.push(`${where}: 조건의 루트 '${String(cond.route)}' 은(는) 루트 id 가 아닙니다`);
    } else if ('not' in cond) checkCondRefs(where, cond.not);
    else if ('all' in cond) cond.all.forEach((c) => checkCondRefs(where, c));
    else if ('any' in cond) cond.any.forEach((c) => checkCondRefs(where, c));
  }

  // ---- 시뮬레이션 (보이는 옵션의 모든 조합) ----------------------------------
  const paths: PathRecord[] = [];
  const legacyPaths: PathRecord[] = [];
  const visitedSteps = new Set<string>();
  const visitedScenes = new Set<string>();
  const endingsReached = new Set<string>();
  const MAX_BLOCKING = 5000;
  /** 흔적 메시지 → 그 흔적이 실행된 경로 수 */
  const traceHits = new Map<string, { count: number; example: string }>();
  const choiceShapeErrors = new Set<string>();
  const textLen = new Map<string, number>();
  const tracer = makeTracer(vars, traces, hiddenFlag, routeOnly);
  /** 루트 확정 뒤 구간 메모: 상태 키 → 그 뒤의 잎(선택·엔딩·글자 수·흔적) */
  const suffixMemo = new Map<string, Leaf[]>();
  const routeRefChoices = postRouteChoiceRefs(story);
  const seeds = (options.legacySeeds ?? LEGACY_SEEDS).filter((s) => story.scenes[s.from] && story.scenes[s.to]);
  let suffixRuns = 0;
  let stopped = false;
  /** 정적 검사를 통과해 시뮬레이션을 끝까지 돌렸는가(분포 비교는 이때만) */
  let simulated = false;

  type Frame = {
    state: GameState;
    rec: PathRecord;
    hits: Set<string>;
    /** 이 rec.choices 앞에 이미 고른 선택(오류 메시지용. 메모 구간에서만 쓴다) */
    before: PathChoice[];
    /** 직전 블로킹 스텝의 장면(구저장 시드를 뜰 장면 진입 판단) */
    lastScene: string | null;
  };
  type Leaf = { rec: PathRecord; hits: Set<string> };
  const fmt = (f: Frame) => fmtChoices([...f.before, ...f.rec.choices]);
  const total = () => paths.length + legacyPaths.length;

  /** 이 경로의 상태·기록으로 실행된 지시를 본다(흔적·해금 시점·루트 결정 순간의 점수와 후보) */
  const observerFor = ({ state, rec, hits }: Frame): StepObserver => (step, scene) => {
    tracer.step(state, step, scene, hits);
    if (step.t === 'unlock' && rec.gateAt === null) rec.gateAt = rec.choices.length;
    if (step.t === 'decideRoute' && state.route === null) {
      const cands = routeCandidates(state, step);
      const top = Math.max(...cands.map((h) => state.points[h] ?? 0));
      rec.points = { ...state.points };
      rec.decideStep = step.id;
      rec.decisionAt = rec.choices.length;
      rec.topCount = cands.filter((h) => (state.points[h] ?? 0) === top).length;
      rec.routeOptions = [...cands];
      if (step.tieRoute && cands.length === HEROINES.length) rec.routeOptions.push(step.tieRoute);
    }
  };

  /** 엔딩에 닿은 잎: 상태로만 정해지는 기록과 검사 */
  const closeLeaf = (frame: Frame, ending: string) => {
    const { state, rec } = frame;
    rec.ending = ending;
    rec.endingKind = story.endings[ending as keyof Story['endings']]?.kind ?? null;
    rec.route = state.route;
    rec.unlocked = HIDDEN_HEROINES.filter((h) => {
      const f = hiddenFlag.get(h);
      return !!f && state.flags[f] === true;
    });
    rec.met = rec.unlocked.length > 0;
    endingsReached.add(ending);
    const def = story.endings[ending as keyof Story['endings']];
    if (state.route === null) errors.push(`루트 확정 없이 엔딩 ${ending} 도달 (선택: ${fmt(frame)})`);
    else if (def && def.route !== state.route) errors.push(`루트 ${state.route} 인데 엔딩 ${ending}(루트 ${def.route}) 도달`);
  };

  /** 완성된 경로: 독립 오라클 대조·흔적 집계 */
  const finishPath = (rec: PathRecord, hits: Set<string>, legacy: boolean) => {
    const decide = rec.decideStep ? decideById.get(rec.decideStep) : undefined;
    rec.hidden = !!decide?.tieRoute && rec.route === decide.tieRoute;
    rec.tie = rec.topCount > 1 && !rec.hidden;
    rec.expectedRoute = expectedRouteFromChoices(rec.choices, story, { decide: rec.decideStep });
    if (rec.route !== null && rec.route !== rec.expectedRoute) {
      errors.push(`루트 규칙 불일치${legacy ? '(구저장 시드)' : ''}: 기대 ${rec.expectedRoute}, 실제 ${rec.route} (선택: ${fmtChoices(rec.choices)})`);
    }
    for (const h of hits) {
      const t = traceHits.get(h);
      if (t) t.count++;
      else traceHits.set(h, { count: 1, example: fmtChoices(rec.choices) });
    }
    (legacy ? legacyPaths : paths).push(rec);
  };

  /**
   * 한 시작점에서 보이는 옵션의 모든 조합을 끝까지(또는 stopAtRoute 면 루트가 정해진 첫 블로킹 스텝까지) 진행한다.
   * 블로킹 스텝마다 방문·혼입·무대·흔적을 검사하고, 엔딩이면 onEnd, 루트가 정해졌으면 onRoute 로 넘긴다.
   */
  const walk = (root: Frame, stopAtRoute: boolean, onEnd: (f: Frame) => void, onRoute: (f: Frame) => void, onScene?: (f: Frame) => void) => {
    const stack: Frame[] = [root];
    while (stack.length) {
      if (total() >= MAX_PATHS) {
        if (!stopped) warnings.push(`선택 조합이 ${MAX_PATHS}개를 넘어 시뮬레이션을 중단했습니다`);
        stopped = true;
        return;
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
          checkRouteMixing(state, res.scene, () => fmt(frame), errors);
          checkStage(state, res.step, errors, warnings, assets);
          const step = res.step;
          tracer.step(state, step, res.scene, hits);
          if (frame.lastScene !== state.sceneId) {
            frame.lastScene = state.sceneId;
            onScene?.(frame);
          }
          if (stopAtRoute && state.route !== null) {
            onRoute(frame);
            break;
          }
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
              if (res.scene.route === 'common') {
                rec.commonChars += len;
                rec.commonLines += 1;
              }
            }
            res = advance(story, state, observe)!;
            continue;
          }
          if (step.t === 'choice') {
            const shown = visibleOptions(state, step);
            if (shown.length < 2 || shown.length > 3) {
              const msg = `${step.id}: 보이는 선택지가 ${shown.length}개입니다(2~3개여야 함, 선택: ${fmt(frame)})`;
              if (!choiceShapeErrors.has(step.id)) {
                choiceShapeErrors.add(step.id);
                errors.push(msg);
              }
            }
            for (const o of [...shown].reverse()) {
              const picked: PathChoice = o.heroine ? { choice: step.id, option: o.id, heroine: o.heroine } : { choice: step.id, option: o.id };
              const child: Frame = {
                state: cloneState(state),
                rec: { ...rec, choices: [...rec.choices, picked], routeOptions: [...rec.routeOptions] },
                hits: new Set(hits),
                before: frame.before,
                lastScene: frame.lastScene,
              };
              // 고른 직후 실행되는 지시(반응·해금 판정 등)는 그 경로의 관찰자로 본다. 꺼낸 뒤 settle 은 같은 위치를 돌려줄 뿐이다
              if (!choose(story, child.state, o.id, observerFor(child))) throw new StoryError(`${step.id}: 보이는 옵션 ${o.id} 를 고를 수 없습니다`);
              stack.push(child);
            }
            break;
          }
          // ending
          closeLeaf(frame, step.ending);
          onEnd(frame);
          break;
        }
      } catch (e) {
        errors.push(`시뮬레이션 오류 (선택: ${fmt(frame)}): ${(e as Error).message}`);
      }
    }
  };

  /** 루트가 정해진 상태에서 끝까지의 잎(메모). 같은 키면 다시 실행하지 않는다 */
  const suffixOf = (frame: Frame): Leaf[] => {
    const key = suffixKey(frame.state, routeRefChoices);
    const hit = suffixMemo.get(key);
    if (hit) return hit;
    suffixRuns++;
    const leaves: Leaf[] = [];
    const root: Frame = {
      state: cloneState(frame.state),
      rec: { ...newRecord(), choices: [] },
      hits: new Set(),
      before: [...frame.before, ...frame.rec.choices],
      lastScene: frame.lastScene,
    };
    walk(
      root,
      false,
      (f) => leaves.push({ rec: f.rec, hits: f.hits }),
      () => undefined,
    );
    suffixMemo.set(key, leaves);
    return leaves;
  };

  /** 루트 확정 지점의 앞 기록 + 메모된 뒤 잎 → 경로 */
  const expand = (frame: Frame, legacy: boolean) => {
    for (const leaf of suffixOf(frame)) {
      if (total() >= MAX_PATHS) return;
      const a = frame.rec;
      const b = leaf.rec;
      const rec: PathRecord = {
        ...a,
        choices: [...a.choices, ...b.choices],
        route: b.route,
        ending: b.ending,
        endingKind: b.endingKind,
        met: b.met,
        unlocked: b.unlocked,
        routeOptions: [...a.routeOptions],
        commonChars: a.commonChars + b.commonChars,
        commonLines: a.commonLines + b.commonLines,
        mainChars: a.mainChars + b.mainChars,
        mainLines: a.mainLines + b.mainLines,
        epilogueChars: a.epilogueChars + b.epilogueChars,
        epilogueLines: a.epilogueLines + b.epilogueLines,
      };
      const hits = new Set(frame.hits);
      for (const h of leaf.hits) hits.add(h);
      finishPath(rec, hits, legacy);
    }
  };

  if (errors.length === 0) {
    simulated = true;
    const seedFrames: Frame[] = [];
    // 메인: 새 게임부터. 시드 장면(from)에 들어가는 순간 그 진입 스냅샷을 구저장 시드로 떠 둔다
    walk(
      { state: newGameState(story), rec: newRecord(), hits: new Set(), before: [], lastScene: null },
      useMemo,
      (f) => finishPath(f.rec, f.hits, false),
      (f) => expand(f, false),
      seeds.length
        ? (f) => {
            for (const seed of seeds) {
              if (f.state.sceneId !== seed.from || f.state.sceneEntry?.sceneId !== seed.from) continue;
              seedFrames.push({ state: seedState(story, f.state, seed), rec: { ...f.rec, choices: [...f.rec.choices] }, hits: new Set(f.hits), before: [], lastScene: null });
            }
          }
        : undefined,
    );
    for (const sf of seedFrames) {
      walk(
        sf,
        useMemo,
        (f) => finishPath(f.rec, f.hits, true),
        (f) => expand(f, true),
      );
    }
    if (seeds.length && seedFrames.length === 0) errors.push(`구저장 시드를 뜰 장면(${seeds.map((s) => s.from).join(', ')})에 들어가는 경로가 없습니다`);
    for (const p of legacyPaths) {
      if (p.hidden) {
        errors.push(`구저장 시드가 히든 루트로 갔습니다 (선택: ${fmtChoices(p.choices)})`);
        break;
      }
    }

    for (const [msg, { count, example }] of traceHits) {
      if (msg.startsWith(HIT_HIDDEN)) errors.push(`해금 전 히든 히로인 흔적이 실행됨: ${msg.slice(HIT_HIDDEN.length)} (${count}개 경로, 예: ${example})`);
      else errors.push(`루트 전용 그림이 그 루트 밖에서 실행됨: ${msg.slice(HIT_ROUTE.length)} (${count}개 경로, 예: ${example})`);
    }
    for (const sceneId of Object.keys(story.scenes)) {
      if (!visitedScenes.has(sceneId)) errors.push(`도달할 수 없는 장면: ${sceneId}`);
    }
    for (const endingId of Object.keys(story.endings)) {
      if (!endingsReached.has(endingId)) errors.push(`도달할 수 없는 엔딩: ${endingId}`);
    }
    const routed = new Set(Object.values(story.endings).map((e) => e.route));
    for (const r of routed) {
      if (!paths.some((p) => p.route === r)) errors.push(`${r} 루트로 가는 선택 조합이 없습니다`);
    }
  }

  const branching = summarizeBranching(paths, legacyPaths, story);
  if (options.expect && simulated) compareBranching(branching, options.expect, story, errors);

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
    legacyPaths,
    branching,
    stats: { scenes: Object.keys(story.scenes).length, sayLines, choices: choiceCount, unreachableSteps, suffixRuns },
  };
}

function newRecord(): PathRecord {
  return {
    choices: [],
    route: null,
    ending: null,
    endingKind: null,
    expectedRoute: 'osana',
    met: false,
    unlocked: [],
    gateAt: null,
    decisionAt: null,
    decideStep: null,
    points: null,
    topCount: 0,
    routeOptions: [],
    tie: false,
    hidden: false,
    commonChars: 0,
    commonLines: 0,
    mainChars: 0,
    mainLines: 0,
    epilogueChars: 0,
    epilogueLines: 0,
  };
}

/** 구저장 시드 상태: 메인 경로가 seed.from 에 들어온 순간(장면 진입 스냅샷)의 값을 seed.to 의 처음에 놓는다 */
function seedState(story: Story, state: GameState, seed: LegacySeed): GameState {
  const e = state.sceneEntry!;
  const to = story.scenes[seed.to];
  const st: GameState = {
    sceneId: to.id,
    stepId: to.steps[0].id,
    points: { ...e.points },
    lastHeroine: e.lastHeroine,
    route: e.route,
    choices: { ...e.choices },
    flags: { ...e.flags, ...(seed.flags ?? {}) },
    stage: JSON.parse(JSON.stringify(e.stage)) as GameState['stage'],
    log: [],
    endedWith: null,
  };
  st.sceneEntry = snapshotSceneEntry(st);
  return st;
}

/**
 * 루트 확정 뒤에 갈 수 있는 장면(routeBranch 대상에서 jump·routeBranch 로 닿는 장면)의 조건이 참조하는 선택지 id.
 * 루트 확정 뒤 진행은 이 선택들과 위치·루트·플래그·무대로만 정해진다(점수는 바뀌지도 쓰이지도 않는다)
 */
function postRouteChoiceRefs(story: Story): string[] {
  const start: string[] = [];
  for (const s of Object.values(story.scenes)) for (const st of s.steps) if (st.t === 'routeBranch') start.push(...Object.values(st.scenes).filter((x): x is string => !!x));
  const seenScenes = new Set<string>();
  const refs = new Set<string>();
  const addCond = (c: Cond) => {
    if ('choice' in c) refs.add(c.choice);
    else if ('not' in c) addCond(c.not);
    else if ('all' in c) c.all.forEach(addCond);
    else if ('any' in c) c.any.forEach(addCond);
  };
  const queue = [...start];
  while (queue.length) {
    const id = queue.pop()!;
    if (seenScenes.has(id)) continue;
    seenScenes.add(id);
    const sc = story.scenes[id];
    if (!sc) continue;
    for (const st of sc.steps) {
      if (st.t === 'if') addCond(st.cond);
      else if (st.t === 'choice') {
        for (const o of st.options) if (o.visibleIf) addCond(o.visibleIf);
      } else if (st.t === 'jump') queue.push(st.scene);
      else if (st.t === 'routeBranch') queue.push(...Object.values(st.scenes).filter((x): x is string => !!x));
    }
  }
  return [...refs].sort();
}

/** 루트 확정 뒤 메모 키: 위치·루트·플래그(이름순)·루트 장면이 참조하는 선택·무대 */
function suffixKey(state: GameState, refs: readonly string[]): string {
  const flags = Object.keys(state.flags)
    .sort()
    .map((k) => [k, state.flags[k]]);
  return JSON.stringify([state.sceneId, state.stepId, state.route, flags, refs.map((id) => state.choices[id] ?? null), state.stage]);
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

/**
 * 히든 히로인 흔적 검사기. 그 히로인의 해금 플래그가 true 가 아닌 상태에서 실행된 지시를 모은다.
 * 흔적: 화자(say.who), 등장·퇴장(show/hide), 그 인물이 그려진 배경·CG(접두사·id 목록), 그 인물이 나오는 루트 장면
 * (자기 루트·히든 루트), 대사·이름표·카드·장소·선택지 문구·장면 제목의 이름 치환 키(또는 이름 그대로), 보이는 그 인물의 개인 선택지.
 * 함께: 루트 전용 그림(routeOnly)이 그 루트가 확정되지 않은 상태에서 실행되면 기록한다.
 */
function makeTracer(
  vars: Readonly<Record<string, string>>,
  traces: Partial<Record<HeroineId, HiddenTrace>>,
  flags: Map<HeroineId, string>,
  routeOnly: readonly RouteOnlyAsset[],
) {
  const rules = HIDDEN_HEROINES.flatMap((h) => {
    const t = traces[h];
    if (!t) return [];
    const keys = t.vars.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const keyRe = keys.length ? new RegExp(`\\{(?:${keys.join('|')})(?::[^}]*)?\\}`) : null;
    const literals = t.vars.map((k) => vars[k]).filter((v): v is string => !!v);
    const routes = new Set<string>([h, ...(t.routes ?? [])]);
    const named = new Set(t.assets ?? []);
    const isAsset = (id: string) => id.startsWith(t.assetPrefix) || named.has(id);
    return [{ h, t, keyRe, literals, routes, isAsset, flag: flags.get(h) ?? null }];
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
      for (const { h, t, keyRe, literals, routes, isAsset, flag } of rules) {
        if (flag && state.flags[flag] === true) continue;
        const add = (what: string) => hits.add(`${HIT_HIDDEN}${h} · ${step.id}: ${what}`);
        const has = (text: string | undefined) => named(h, keyRe, literals, text);
        if (routes.has(scene.route)) hits.add(`${HIT_HIDDEN}${h} · 장면 ${scene.id}(route ${scene.route}) 진입`);
        if (has(scene.title)) hits.add(`${HIT_HIDDEN}${h} · 장면 ${scene.id} 제목에 이름`);
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
            if (step.cg && isAsset(step.cg)) add(`CG ${step.cg}`);
            break;
          case 'bg':
            if (isAsset(step.bg)) add(`배경 ${step.bg}`);
            break;
          default:
            break;
        }
      }
      for (const r of routeOnly) {
        const id = step.t === 'cg' ? step.cg : step.t === 'bg' ? step.bg : null;
        if (id && id.startsWith(r.prefix) && state.route !== r.route) {
          hits.add(`${HIT_ROUTE}${step.id}: ${step.t === 'cg' ? 'CG' : '배경'} ${id} 는 ${r.route} 루트 전용인데 루트 ${state.route ?? '미확정'} 에서 실행`);
        }
      }
    },
  };
}

/** 판정 단위 키(루트를 정한 decideRoute 까지의 선택) */
const decisionKey = (p: PathRecord) => (p.decisionAt === null ? null : p.choices.slice(0, p.decisionAt).map((c) => `${c.choice}=${c.option}`).join(','));

/** 경로들을 판정 조합 단위로 묶는다(첫 경로가 대표, 도달한 엔딩 모음) */
function groupDecisions(paths: PathRecord[]): Map<string, { rec: PathRecord; endings: Set<string> }> {
  const out = new Map<string, { rec: PathRecord; endings: Set<string> }>();
  for (const p of paths) {
    const key = decisionKey(p);
    if (key === null) continue;
    let d = out.get(key);
    if (!d) {
      d = { rec: p, endings: new Set() };
      out.set(key, d);
    }
    if (p.ending) d.endings.add(p.ending);
  }
  return out;
}

function summarizeDecisions(paths: PathRecord[]): DecisionStats {
  const out = emptyDecisionStats();
  out.paths = paths.length;
  for (const { rec } of groupDecisions(paths).values()) {
    out.decisions++;
    if (rec.route) out.routes[rec.route] = (out.routes[rec.route] ?? 0) + 1;
    if (rec.hidden) out.hidden++;
    if (rec.tie) out.ties++;
    if (rec.topCount >= HEROINES.length) out.allTied++;
  }
  return out;
}

function summarizeBranching(paths: PathRecord[], legacy: PathRecord[], story: Story): BranchStats {
  const out = emptyBranchStats();
  out.paths = paths.length;
  const early = new Map<string, { met: boolean; routes: Set<RouteId>; options: Set<RouteId> }>();
  for (const p of paths) {
    if (p.ending) out.endings[p.ending] = (out.endings[p.ending] ?? 0) + 1;
    if (p.met) out.unlockedPaths++;
    else out.lockedPaths++;
    if (p.gateAt === null) continue;
    const key = p.choices
      .slice(0, p.gateAt)
      .map((c) => `${c.choice}=${c.option}`)
      .join(',');
    let e = early.get(key);
    if (!e) {
      e = { met: p.met, routes: new Set(), options: new Set() };
      early.set(key, e);
    }
    if (p.route) e.routes.add(p.route);
    for (const r of p.routeOptions) e.options.add(r);
  }
  out.earlyCombos = early.size;
  for (const e of early.values()) {
    if (e.met) out.unlockedEarlyCombos++;
    if ([...e.options].every((r) => e.routes.has(r))) out.earlyCombosReachingAll++;
  }
  const routeEndings = new Map<string, string[]>();
  for (const def of Object.values(story.endings)) {
    if (!def) continue;
    if (!routeEndings.has(def.route)) routeEndings.set(def.route, []);
    routeEndings.get(def.route)!.push(def.id);
  }
  for (const { rec, endings } of groupDecisions(paths).values()) {
    out.decisions++;
    if (rec.met) out.unlockedDecisions++;
    else out.lockedDecisions++;
    if (rec.route) out.routes[rec.route] = (out.routes[rec.route] ?? 0) + 1;
    if (rec.hidden) out.hidden++;
    if (rec.tie) {
      out.ties++;
      if (rec.met) out.tiesUnlocked++;
      else out.tiesLocked++;
    }
    if (rec.topCount >= HEROINES.length) out.allTied++;
    const want = rec.route ? (routeEndings.get(rec.route) ?? []) : [];
    if (want.length && want.every((id) => endings.has(id))) out.decisionsReachingRouteEndings++;
  }
  out.legacy = legacy.length ? summarizeDecisions(legacy) : null;
  return out;
}

function compareBranching(got: BranchStats, want: BranchExpectation, story: Story, errors: string[]): void {
  const cmp = (name: string, a: number, b: number | undefined) => {
    if (b !== undefined && a !== b) errors.push(`분기 분포 불일치: ${name} 기대 ${b}, 실제 ${a}`);
  };
  const cmpMap = (name: string, a: Record<string, number>, b: Partial<Record<string, number>> | undefined) => {
    if (!b) return;
    for (const [k, n] of Object.entries(b)) cmp(`${k} ${name} 수`, a[k] ?? 0, n);
    for (const k of Object.keys(a)) if (!(k in b)) errors.push(`분기 분포 불일치: 기대하지 않은 ${name} ${k} (${a[k]}개)`);
  };
  cmp('경로 수', got.paths, want.paths);
  cmp('초반 조합 수', got.earlyCombos, want.earlyCombos);
  cmp('해금 초반 조합 수', got.unlockedEarlyCombos, want.unlockedEarlyCombos);
  cmpMap('엔딩', got.endings, want.endings);
  cmp('판정 조합 수', got.decisions, want.decisions);
  cmp('해금 판정 조합 수', got.unlockedDecisions, want.unlockedDecisions);
  cmp('미해금 판정 조합 수', got.lockedDecisions, want.lockedDecisions);
  cmpMap('루트', got.routes, want.routes);
  cmp('히든 루트 판정 수', got.hidden, want.hidden);
  cmp('동점 처리 수', got.ties, want.ties);
  cmp('해금 경로 동점 처리 수', got.tiesUnlocked, want.tiesUnlocked);
  cmp('미해금 경로 동점 처리 수', got.tiesLocked, want.tiesLocked);
  cmp('전원 동점 판정 수', got.allTied, want.allTied);
  cmp('해금 경로 수', got.unlockedPaths, want.unlockedPaths);
  cmp('미해금 경로 수', got.lockedPaths, want.lockedPaths);
  if (want.everyEarlyComboReachesAll && got.earlyCombosReachingAll !== got.earlyCombos) {
    errors.push(`분기 분포 불일치: 낼 수 있는 루트 전원에 도달할 수 있는 초반 조합이 ${got.earlyCombosReachingAll}/${got.earlyCombos}개입니다`);
  }
  if (want.everyDecisionReachesRouteEndings) {
    if (got.decisionsReachingRouteEndings !== got.decisions) {
      errors.push(`분기 분포 불일치: 그 루트의 엔딩 전부에 도달할 수 있는 판정 조합이 ${got.decisionsReachingRouteEndings}/${got.decisions}개입니다`);
    }
    for (const r of Object.keys(got.routes)) {
      const kinds = new Set(Object.values(story.endings).filter((e) => e && e.route === r).map((e) => e.kind));
      if (!kinds.has('festival') || !kinds.has('daily')) errors.push(`분기 분포 불일치: ${r} 루트에 축제 쪽·일상 쪽 엔딩이 모두 정의돼 있지 않습니다`);
    }
  }
  if (want.legacy) {
    const g = got.legacy;
    if (!g) errors.push('분기 분포 불일치: 구저장 시드 시뮬레이션 결과가 없습니다');
    else {
      const w = want.legacy;
      cmp('구저장 시드 경로 수', g.paths, w.paths);
      cmp('구저장 시드 판정 수', g.decisions, w.decisions);
      cmpMap('구저장 시드 루트', g.routes, w.routes);
      cmp('구저장 시드 히든 루트 수', g.hidden, w.hidden);
      cmp('구저장 시드 동점 처리 수', g.ties, w.ties);
      cmp('구저장 시드 전원 동점 수', g.allTied, w.allTied);
    }
  }
}

/** 검증기 자체의 스텝 색인(실행기 stepIndex 와 따로 둔다: 오라클이 실행기 코드에 기대지 않게). 같은 id 가 여럿이면 처음 것 */
const ownIndex = new WeakMap<Story, Map<string, { step: Step; scene: Scene }>>();
function indexOf(story: Story): Map<string, { step: Step; scene: Scene }> {
  let idx = ownIndex.get(story);
  if (!idx) {
    idx = new Map();
    for (const s of Object.values(story.scenes)) for (const st of s.steps) if (!idx.has(st.id)) idx.set(st.id, { step: st, scene: s });
    ownIndex.set(story, idx);
  }
  return idx;
}

function findChoice(story: Story, id: string) {
  const hit = indexOf(story).get(id);
  return hit && hit.step.t === 'choice' ? hit.step : null;
}

function fmtChoices(choices: readonly PathChoice[]): string {
  return choices.map((c) => `${c.choice}=${c.option}`).join(', ') || '(없음)';
}

/**
 * 실행기와 독립적으로 선택 기록만 보고 루트를 다시 계산한다(규칙 교차 검증).
 * 실행기 코드(pickRoute·judgeRoute·applyUnlock·choose)를 쓰지 않고 대본의 정적 정의만으로 설계 계약 5절 규칙을 다시 적용한다.
 *  1) 공통 장면 선택만 점수에 넣는다: 개인 선택은 heroine 에 points(기본 1), effects 의 add 도 더한다('함께').
 *  2) 해금 지시는 같은 장면에서 그 지시 앞의 마지막 선택지를 고른 직후에 한 번 판정한다:
 *     두 점수 차 ≤ maxDiff 면 해금하고 시작 점수 = 평균.
 *  3) 판정 기준은 그 경로에서 실제로 실행된 decideRoute(opts.decide). 주지 않으면 고른 공통 선택을 order 에 가장 많이 담은 decideRoute.
 *  4) 후보 = 기본 히로인 + 해금된 히든 히로인(decideRoute.hidden 의 플래그).
 *     tieRoute 가 있고 구저장 표식(opts.legacyLate)이 없으며 후보가 히로인 전원이고 모두 같은 점수면 → tieRoute(히든 루트).
 *     최고점 단독이면 그 히로인, 동점이면 decideRoute.order 를 뒤에서부터 훑어 공동 최고점인 개인 선택을 처음 만나는 히로인
 *     (order 가 없으면 마지막 개인 선택), 그래도 없으면 후보 순서의 첫 공동 최고점.
 */
export function expectedRouteFromChoices(
  choices: PathRecord['choices'],
  story: Story,
  opts: { decide?: string | null; legacyLate?: boolean } = {},
): RouteId {
  const pts = {} as Record<HeroineId, number>;
  for (const h of HEROINES) pts[h] = 0;
  const flags = new Map<string, boolean>();
  const unlocks = unlockSteps(story);
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

  const decide = pickDecide(story, opts.decide ?? null, picked);
  const hidden = decide?.hidden ?? {};
  const cands = HEROINES.filter((h) => {
    const f = hidden[h];
    return f ? flags.get(f) === true : BASE_HEROINES.includes(h);
  });
  let best = -Infinity;
  for (const h of cands) if (pts[h] > best) best = pts[h];
  const tied = cands.filter((h) => pts[h] === best);
  if (decide?.tieRoute && !opts.legacyLate && cands.length === HEROINES.length && tied.length === cands.length) return decide.tieRoute;
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

/** 오라클의 판정 기준 decideRoute: 주어진 id, 없으면 고른 공통 선택을 order 에 가장 많이 담은 것(같으면 먼저 나온 것) */
function pickDecide(story: Story, id: string | null, picked: Map<string, string>): DecideRouteStep | null {
  let best: DecideRouteStep | null = null;
  let bestHits = -1;
  for (const s of Object.values(story.scenes)) {
    for (const st of s.steps) {
      if (st.t !== 'decideRoute') continue;
      if (id !== null) {
        if (st.id === id) return st;
        continue;
      }
      const hits = (st.order ?? []).filter((x) => picked.has(x)).length;
      if (hits > bestHits) {
        best = st;
        bestHits = hits;
      }
    }
  }
  return best;
}

function sceneOfStep(story: Story, stepId: string): Scene | null {
  return indexOf(story).get(stepId)?.scene ?? null;
}

function markVisited(state: GameState, steps: Set<string>, scenes: Set<string>) {
  steps.add(state.stepId);
  scenes.add(state.sceneId);
}

function checkRouteMixing(state: GameState, scene: Scene, where: () => string, errors: string[]) {
  if (state.route !== null && scene.route !== state.route) {
    const msg = `루트 혼입: ${state.route} 확정 후 '${scene.id}'(${scene.route}) 장면 진입 (선택: ${where()})`;
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
