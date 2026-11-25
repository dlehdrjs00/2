/**
 * 비주얼노벨 엔진 공용 타입.
 *
 * 스토리 데이터(src/story)는 이 타입만 사용해 작성한다.
 * 엔진 코드(src/engine, src/ui)는 스토리 내용을 모른다.
 */

/**
 * 히로인(=루트) 식별자. 이름이 바뀌어도 바뀌지 않는 역할 기반 ID.
 * osana = 소꿉친구, tenko = 전학생, koharu = 히든 후배(해금 조건을 만족한 플레이에서만 등장).
 */
export type HeroineId = 'osana' | 'tenko' | 'koharu';
/** 모든 히로인. 점수·무대·저장 검증은 이 목록을 기준으로 한다 */
export const HEROINES: readonly HeroineId[] = ['osana', 'tenko', 'koharu'] as const;
/** 매 플레이 처음부터 등장하고 항상 루트 후보인 히로인 */
export const BASE_HEROINES: readonly HeroineId[] = ['osana', 'tenko'] as const;
/** 해금(UnlockStep)된 플레이에서만 등장하고 루트 후보가 되는 히로인 */
export const HIDDEN_HEROINES: readonly HeroineId[] = ['koharu'] as const;

export function isHeroineId(v: unknown): v is HeroineId {
  return typeof v === 'string' && (HEROINES as readonly string[]).includes(v);
}

/** 화면에 그림이 있는 캐릭터 = 히로인 3명 */
export type CharId = HeroineId;

/**
 * 대사의 화자. null 은 주인공의 독백/서술(이름표 없음).
 * kh_friend = 코하루의 친구(복도 첫 만남), raffle = 상점회 추첨 담당.
 */
export type SpeakerId =
  | 'me'
  | 'osana'
  | 'tenko'
  | 'koharu'
  | 'teacher'
  | 'grandma'
  | 'classmates'
  | 'shopkeeper'
  | 'kh_friend'
  | 'raffle';

export type Expr = 'neutral' | 'smile' | 'fluster' | 'shy' | 'pout' | 'sad';
export const EXPRS: readonly Expr[] = ['neutral', 'smile', 'fluster', 'shy', 'pout', 'sad'] as const;

export type Outfit = 'uniform' | 'casual' | 'yukata';
export type Hair = 'default' | 'ponytail';
export type Pos = 'left' | 'center' | 'right';

export type BgId =
  | 'title'
  | 'road_morning'
  | 'road_evening'
  | 'road_rain'
  | 'road_night'
  | 'classroom_day'
  | 'classroom_evening'
  | 'hallway'
  | 'shoe_lockers'
  | 'shoe_lockers_rain'
  | 'courtyard'
  | 'shotengai'
  | 'riverbank_evening'
  | 'station_morning'
  | 'apartment_door'
  | 'shrine_steps'
  | 'festival_street'
  | 'riverbank_night'
  | 'shrine_night'
  | 'kh_stationery'
  | 'kh_lantern_lane'
  | 'black';

export type BgmId = 'title' | 'daily' | 'heart' | 'evening' | 'festival' | 'confession';
export type SfxId =
  | 'select'
  | 'bell'
  | 'door'
  | 'rain'
  | 'camera'
  | 'firework'
  | 'message'
  | 'sparkle'
  | 'footsteps'
  | 'cat';

export type EndingId = 'osana' | 'tenko' | 'koharu';

/** 이벤트 CG(한 장 그림). 무대 위(캐릭터보다 앞, 대사창 뒤)에 화면 가득 표시된다. */
export type CgId =
  | 'rain_osana'
  | 'rain_tenko'
  | 'door_osana'
  | 'ramune_osana'
  | 'fireworks_osana'
  | 'homeward_osana'
  | 'cats_tenko'
  | 'bench_tenko'
  | 'selfie_tenko'
  | 'shutter_tenko'
  | 'polaroid_tenko'
  | 'kh_meet'
  | 'kh_draw'
  | 'kh_relay'
  | 'kh_confession'
  | 'kh_home'
  | 'kh_date';

/** 배경 전환 방식. */
export type BgFx = 'fade' | 'black' | 'white' | 'cut';

/** 장면이 어느 구간에 속하는지. 루트 혼입 검사에 사용. */
export type SceneRoute = 'common' | HeroineId;
export type ScenePart = 'main' | 'epilogue';

// ---------------------------------------------------------------------------
// 조건 / 효과
// ---------------------------------------------------------------------------

export type Cond =
  /** 특정 선택지(step id)에서 특정 옵션(option id)을 골랐는가 */
  | { choice: string; is: string }
  /** 플래그 값 비교 */
  | { flag: string; eq: boolean | number | string }
  /** 확정 루트 */
  | { route: HeroineId }
  | { not: Cond }
  | { all: Cond[] }
  | { any: Cond[] };

export type Effect =
  | { flag: string; value: boolean | number | string }
  /** 호감 점수 직접 가산(개인 선택은 보통 choice option 의 heroine 필드를 쓴다. 소수도 된다) */
  | { add: HeroineId; n: number };

// ---------------------------------------------------------------------------
// 스텝(문장/명령). 모든 스텝은 이야기 전체에서 고유한 id 를 가진다.
// 저장 위치는 (sceneId, stepId) 로 기록되므로 배열 순서가 바뀌어도 깨지지 않는다.
// ---------------------------------------------------------------------------

export interface StepBase {
  /** 이야기 전체에서 고유. 한 번 공개한 id 는 바꾸지 않는다(읽음 기록·저장이 이 id 를 참조). */
  id: string;
}

/** 대사/독백. 블로킹(플레이어 입력 대기). */
export interface SayStep extends StepBase {
  t: 'say';
  /** null = 주인공 독백·서술 */
  who: SpeakerId | null;
  text: string;
  /** 화자가 화면에 있는 히로인이면 표정을 함께 바꾼다 */
  expr?: Expr;
  /** 이름표 덮어쓰기(예: 첫 등장 전 '???') */
  label?: string;
}

/** 시간 경과·장소 전환용 전체 화면 카드. 블로킹. */
export interface CardStep extends StepBase {
  t: 'card';
  text: string;
  sub?: string;
}

export interface ChoiceOption {
  /** 선택지 안에서 고유한 옵션 id (저장 데이터에 기록됨) */
  id: string;
  text: string;
  /**
   * 이 선택이 어느 히로인 개인 선택인지. 점수 가산 + '가장 최근 히로인 선택' 갱신.
   * 루트 결정의 동점 처리는 이 값으로 개인 선택을 판단한다('함께'처럼 heroine 이 없는 옵션은 건너뜀)
   */
  heroine?: HeroineId;
  /** heroine 점수 가산량 (기본 1) */
  points?: number;
  /** 선택 효과. '함께'는 heroine 없이 effects 의 add 로 여러 히로인에게 점수를 준다 */
  effects?: Effect[];
  /** 같은 장면 안의 step id 로 이동(선택 직후 반응 분기). 없으면 다음 스텝 */
  goto?: string;
  /**
   * 보이는 조건. 거짓이면 화면·키보드 번호·choose() 모두에서 없는 옵션이다(runner.visibleOptions).
   * 없으면 항상 보인다
   */
  visibleIf?: Cond;
}

/** 선택지. 블로킹. */
export interface ChoiceStep extends StepBase {
  t: 'choice';
  /** 선택지 위에 표시할 짧은 안내(대사창에 표시) */
  prompt?: string;
  options: ChoiceOption[];
}

export interface BgStep extends StepBase {
  t: 'bg';
  bg: BgId;
  fx?: BgFx;
}

export interface ShowStep extends StepBase {
  t: 'show';
  char: CharId;
  pos?: Pos;
  expr?: Expr;
  outfit?: Outfit;
  hair?: Hair;
}

export interface HideStep extends StepBase {
  t: 'hide';
  char: CharId | 'all';
}

export interface BgmStep extends StepBase {
  t: 'bgm';
  /** null = 음악 정지 */
  track: BgmId | null;
}

export interface SfxStep extends StepBase {
  t: 'sfx';
  sound: SfxId;
}

/**
 * 이벤트 CG 표시/해제. 비블로킹. cg: null 이면 CG 를 걷어 낸다.
 * 배경(bg) 명령이 실행되면 CG 는 자동으로 걷힌다.
 */
export interface CgStep extends StepBase {
  t: 'cg';
  cg: CgId | null;
}

/** 화면 효과(흔들림, 플래시). 비블로킹. */
export interface FxStep extends StepBase {
  t: 'fx';
  fx: 'shake' | 'flash';
}

/** 화면 왼쪽 위에 잠깐 표시되는 장소/시간 표시. 비블로킹. */
export interface PlaceStep extends StepBase {
  t: 'place';
  text: string;
}

export interface SetStep extends StepBase {
  t: 'set';
  effects: Effect[];
}

/** 조건이 참이면 같은 장면 안의 goto 로 이동 */
export interface IfStep extends StepBase {
  t: 'if';
  cond: Cond;
  goto: string;
}

/** goto/if/choice 의 이동 목표로 쓰는 표지(아무 동작 없음) */
export interface LabelStep extends StepBase {
  t: 'label';
}

/** 같은 장면 안 step 으로 이동 */
export interface GotoStep extends StepBase {
  t: 'goto';
  to: string;
}

/** 다른 장면의 처음으로 이동 */
export interface JumpStep extends StepBase {
  t: 'jump';
  scene: string;
}

/**
 * 히든 히로인 해금 판정(1회). 비블로킹.
 * flags[flag] 에 이미 boolean 이 있으면 아무것도 하지 않는다(불러오기·다시 실행에도 한 번만).
 * 없으면 |points[among[0]] − points[among[1]]| ≤ maxDiff 일 때 flags[flag] = true 이고
 * points[heroine] = 두 점수의 평균(0.5 단위 그대로)을 준다. 아니면 flags[flag] = false.
 * 루트가 이미 정해졌으면 해금하지 않는다(false).
 */
export interface UnlockStep extends StepBase {
  t: 'unlock';
  heroine: HeroineId;
  among: [HeroineId, HeroineId];
  maxDiff: number;
  flag: string;
}

/**
 * 누적 점수로 루트를 확정한다. 이미 확정돼 있으면 아무것도 바꾸지 않는다.
 * 후보: BASE_HEROINES + hidden 에 적힌 플래그가 true 인 히로인.
 * 최고점이 하나면 그 히로인, 동점이면 order(선택 step id 시간순)를 뒤에서부터 훑어
 * 공동 최고점인 히로인의 개인 선택(option.heroine)을 처음 만나는 히로인(runner.pickRoute).
 */
export interface DecideRouteStep extends StepBase {
  t: 'decideRoute';
  /** 루트에 영향을 주는 선택지 step id, 시간순. 비어 있으면 동점 처리에 '가장 최근 히로인 선택(lastHeroine)'을 쓴다 */
  order: string[];
  /** 히든 히로인 → 후보가 되기 위한 플래그 이름(flags[이름] === true 여야 후보) */
  hidden?: Partial<Record<HeroineId, string>>;
}

/** 확정 루트에 따라 장면 이동. decideRoute 이후에만 사용. */
export interface RouteBranchStep extends StepBase {
  t: 'routeBranch';
  scenes: Record<HeroineId, string>;
}

/** 엔딩 도달. 블로킹(엔딩 화면). */
export interface EndingStep extends StepBase {
  t: 'ending';
  ending: EndingId;
}

export type Step =
  | SayStep
  | CardStep
  | ChoiceStep
  | BgStep
  | ShowStep
  | HideStep
  | BgmStep
  | SfxStep
  | CgStep
  | FxStep
  | PlaceStep
  | SetStep
  | IfStep
  | LabelStep
  | GotoStep
  | JumpStep
  | UnlockStep
  | DecideRouteStep
  | RouteBranchStep
  | EndingStep;

export type BlockingStep = SayStep | CardStep | ChoiceStep | EndingStep;

export interface Scene {
  id: string;
  /** 저장 슬롯·대본 출력에 쓰이는 장면 제목 */
  title: string;
  route: SceneRoute;
  part: ScenePart;
  steps: Step[];
}

export interface EndingDef {
  id: EndingId;
  heroine: HeroineId;
  title: string;
}

export interface Story {
  /** 스토리 데이터 버전(저장 호환성 참고용) */
  version: string;
  start: string;
  scenes: Record<string, Scene>;
  endings: Record<EndingId, EndingDef>;
}

// ---------------------------------------------------------------------------
// 게임 상태 (저장 대상)
// ---------------------------------------------------------------------------

export interface CharState {
  pos: Pos;
  expr: Expr;
  outfit: Outfit;
  hair: Hair;
}

export interface StageState {
  bg: BgId;
  chars: Partial<Record<CharId, CharState>>;
  /** 등장 순서(겹침 순서) */
  order: CharId[];
  bgm: BgmId | null;
  /** 표시 중인 이벤트 CG (없으면 null). 예전 저장 데이터에는 없을 수 있다 */
  cg?: CgId | null;
}

export interface LogEntry {
  id: string;
  /** 표시 이름(이미 해석된 문자열). 독백이면 null */
  name: string | null;
  text: string;
  kind: 'say' | 'mono' | 'card' | 'choice';
}

/**
 * 장면에 들어온 순간의 상태 스냅샷.
 * 대본 수정으로 저장 위치를 잃었을 때 '장면 처음부터' 복구가 이 값으로 되돌린다
 * (같은 장면의 선택 점수·효과가 두 번 들어가거나 무대가 비는 것을 막는다).
 */
export interface SceneEntry {
  /** 스냅샷을 만든 장면(무결성 확인용) */
  sceneId: string;
  points: Record<HeroineId, number>;
  lastHeroine: HeroineId | null;
  route: HeroineId | null;
  choices: Record<string, string>;
  flags: Record<string, boolean | number | string>;
  /** 장면 첫 지시가 실행되기 전 무대(이전 장면에서 물려받은 배경·음악·캐릭터) */
  stage: StageState;
  /** 진입 시점의 log 길이. log 앞부분이 LOG_LIMIT 로 잘리면 같은 만큼 줄어 항상 현재 log 기준 위치를 가리킨다 */
  logLength: number;
}

export interface GameState {
  sceneId: string;
  stepId: string;
  /** 누적 호감 점수(화면에 표시하지 않음). 해금 시 평균을 주므로 0.5 단위 소수가 될 수 있다 */
  points: Record<HeroineId, number>;
  /**
   * 가장 최근에 고른 '히로인 개인' 선택의 히로인. 루트 결정의 동점 처리는 decideRoute.order 와
   * 선택 기록(choices)으로 다시 계산하고, 이 값은 order 가 없는 스토리의 동점 처리와 표시용이다
   */
  lastHeroine: HeroineId | null;
  route: HeroineId | null;
  /** choice step id -> option id */
  choices: Record<string, string>;
  flags: Record<string, boolean | number | string>;
  stage: StageState;
  /** 대화 기록(최근 N개) */
  log: LogEntry[];
  /** 이번 회차에 도달한 엔딩(엔딩 화면 표시 중인지 판단용) */
  endedWith: EndingId | null;
  /** 현재 장면 진입 시점 스냅샷. newGameState·장면 이동 때 실행기가 채운다(저장 스키마 1 에는 없음) */
  sceneEntry?: SceneEntry;
}
