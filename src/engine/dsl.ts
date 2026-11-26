/**
 * 스토리 작성용 도우미 함수.
 *
 * 규칙
 *  - 대사(say/mono/me), 카드(card), 선택지(choice), 엔딩(ending), 라벨(label)은
 *    반드시 고유 id 를 직접 적는다. 저장 위치·읽음 기록이 이 id 를 참조한다.
 *    권장 형식: '<장면약어>.<세 자리 숫자>' (10 단위로 증가시켜 사이에 끼워 넣기 쉽게)
 *  - 배경·캐릭터·음악 같은 연출 명령은 id 를 적지 않아도 된다(자동 부여).
 *  - 히든 히로인: unlock() 으로 해금을 한 번 판정하고, 해금 전용 옵션은 opt(..., { visibleIf }) 로 숨긴다.
 *    루트 결정은 decideRoute(선택 id 시간순, { 히든 히로인: 해금 플래그 }).
 */
import type {
  BgFx,
  BgId,
  BgmId,
  CgId,
  CardStep,
  CharId,
  ChoiceOption,
  ChoiceStep,
  Cond,
  Effect,
  EndingId,
  EndingStep,
  Expr,
  GroupRouteId,
  Hair,
  HeroineId,
  LabelStep,
  Outfit,
  Pos,
  RouteId,
  SayStep,
  Scene,
  SceneRoute,
  ScenePart,
  SfxId,
  SpeakerId,
  Step,
} from './types';

/** id 가 아직 없는 연출 명령 (scene() 이 자동으로 id 를 붙인다) */
type Draft<T extends Step> = Omit<T, 'id'> & { id?: string };
export type StepDraft = { [K in Step['t']]: Draft<Extract<Step, { t: K }>> }[Step['t']];

export interface SceneHeader {
  id: string;
  title: string;
  route: SceneRoute;
  part: ScenePart;
}

/** 장면 정의. 연출 명령에 자동 id(`장면id~n`)를 붙인다. */
export function scene(header: SceneHeader, steps: StepDraft[]): Scene {
  let auto = 0;
  const out: Step[] = steps.map((s) => {
    if (s.id) return s as Step;
    auto += 1;
    return { ...s, id: `${header.id}~${auto}` } as Step;
  });
  return { ...header, steps: out };
}

// --- 대사 -------------------------------------------------------------------

/** 일반 대사. expr 를 주면 화면의 해당 히로인 표정도 바뀐다 */
export function say(id: string, who: SpeakerId, text: string, expr?: Expr): SayStep {
  return expr ? { t: 'say', id, who, text, expr } : { t: 'say', id, who, text };
}

/** 주인공의 소리 내어 한 말 (이름표 표시) */
export function me(id: string, text: string): SayStep {
  return { t: 'say', id, who: 'me', text };
}

/** 주인공의 독백·서술 (이름표 없음) */
export function mono(id: string, text: string): SayStep {
  return { t: 'say', id, who: null, text };
}

/** 이름표를 임시로 바꾼 대사 (예: 이름을 모를 때 '???', 익명 화자 '여학생', 문자 메시지 '{osana} · 문자') */
export function sayAs(id: string, who: SpeakerId, label: string, text: string, expr?: Expr): SayStep {
  return expr ? { t: 'say', id, who, text, label, expr } : { t: 'say', id, who, text, label };
}

export function card(id: string, text: string, sub?: string): CardStep {
  return sub ? { t: 'card', id, text, sub } : { t: 'card', id, text };
}

// --- 선택지 -----------------------------------------------------------------

/**
 * 선택지 옵션. heroine 을 주면 그 히로인 개인 선택(points 기본 1), '함께'는 effects: together().
 * visibleIf 가 거짓이면 화면·키보드·choose() 에서 없는 옵션이 된다.
 */
export function opt(
  id: string,
  text: string,
  o: { heroine?: HeroineId; points?: number; goto?: string; effects?: Effect[]; visibleIf?: Cond } = {},
): ChoiceOption {
  return { id, text, ...o };
}

/** '함께' 선택 효과: 소꿉친구·전학생에게 각각 n 점(가장 최근 히로인 선택은 바꾸지 않는다) */
export function together(n = 1): Effect[] {
  return [
    { add: 'osana', n },
    { add: 'tenko', n },
  ];
}

export function choice(id: string, prompt: string | undefined, options: ChoiceOption[]): ChoiceStep {
  return prompt ? { t: 'choice', id, prompt, options } : { t: 'choice', id, options };
}

export function label(id: string): LabelStep {
  return { t: 'label', id };
}

// --- 연출 명령 ---------------------------------------------------------------

export const bg = (bgId: BgId, fx: BgFx = 'fade'): StepDraft => ({ t: 'bg', bg: bgId, fx });

export const show = (
  char: CharId,
  o: { pos?: Pos; expr?: Expr; outfit?: Outfit; hair?: Hair } = {},
): StepDraft => ({ t: 'show', char, ...o });

export const hide = (char: CharId | 'all'): StepDraft => ({ t: 'hide', char });
export const bgm = (track: BgmId | null): StepDraft => ({ t: 'bgm', track });
export const sfx = (sound: SfxId): StepDraft => ({ t: 'sfx', sound });
/** 이벤트 CG 표시. cg(null) 로 걷는다(다음 bg 명령에서도 자동으로 걷힘) */
export const cg = (id: CgId | null): StepDraft => ({ t: 'cg', cg: id });
export const shake = (): StepDraft => ({ t: 'fx', fx: 'shake' });
export const flash = (): StepDraft => ({ t: 'fx', fx: 'flash' });
export const place = (text: string): StepDraft => ({ t: 'place', text });
export const set = (...effects: Effect[]): StepDraft => ({ t: 'set', effects });
export const flag = (name: string, value: boolean | number | string = true): Effect => ({ flag: name, value });

// --- 흐름 제어 ---------------------------------------------------------------

/** 조건이 참이면 같은 장면의 label/대사 id 로 이동 */
export const when = (cond: Cond, goto: string): StepDraft => ({ t: 'if', cond, goto });
export const goto = (to: string): StepDraft => ({ t: 'goto', to });
export const jump = (sceneId: string): StepDraft => ({ t: 'jump', scene: sceneId });
/**
 * 히든 히로인 해금 판정(1회). |among 두 점수 차| ≤ maxDiff 면 flag = true, heroine 시작 점수 = 두 점수의 평균.
 * 아니면 flag = false. flag 에 이미 true/false 가 있으면 아무것도 하지 않는다.
 */
export const unlock = (heroine: HeroineId, among: [HeroineId, HeroineId], maxDiff: number, flag: string): StepDraft => ({
  t: 'unlock',
  heroine,
  among,
  maxDiff,
  flag,
});
/**
 * 루트 확정. order = 루트에 영향을 주는 선택지 id 시간순(동점 처리에 뒤에서부터 훑는다),
 * hidden = 히든 히로인 → 해금 플래그(true 일 때만 후보),
 * opts.tieRoute = 후보가 세 명 전원이고 세 점수가 완전히 같을 때 확정할 히든 루트('group').
 */
export const decideRoute = (
  order: string[],
  hidden?: Partial<Record<HeroineId, string>>,
  opts: { tieRoute?: GroupRouteId } = {},
): StepDraft => ({
  t: 'decideRoute',
  order: [...(order ?? [])],
  ...(hidden ? { hidden: { ...hidden } } : {}),
  ...(opts.tieRoute ? { tieRoute: opts.tieRoute } : {}),
});
/** 확정 루트 → 장면. 이 지점에서 나올 수 있는 루트를 모두 적는다 */
export const routeBranch = (scenes: Partial<Record<RouteId, string>>): StepDraft => ({ t: 'routeBranch', scenes: { ...scenes } });
export function ending(id: string, endingId: EndingId): EndingStep {
  return { t: 'ending', id, ending: endingId };
}

// --- 조건 도우미 -------------------------------------------------------------

export const chose = (choiceId: string, optionId: string): Cond => ({ choice: choiceId, is: optionId });
export const isFlag = (name: string, eq: boolean | number | string = true): Cond => ({ flag: name, eq });
export const not = (c: Cond): Cond => ({ not: c });
