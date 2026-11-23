/**
 * 스토리 작성용 도우미 함수.
 *
 * 규칙
 *  - 대사(say/mono/me), 카드(card), 선택지(choice), 엔딩(ending), 라벨(label)은
 *    반드시 고유 id 를 직접 적는다. 저장 위치·읽음 기록이 이 id 를 참조한다.
 *    권장 형식: '<장면약어>.<세 자리 숫자>' (10 단위로 증가시켜 사이에 끼워 넣기 쉽게)
 *  - 배경·캐릭터·음악 같은 연출 명령은 id 를 적지 않아도 된다(자동 부여).
 */
import type {
  BgFx,
  BgId,
  BgmId,
  CardStep,
  CharId,
  ChoiceOption,
  ChoiceStep,
  Cond,
  Effect,
  EndingId,
  EndingStep,
  Expr,
  Hair,
  HeroineId,
  LabelStep,
  Outfit,
  Pos,
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

/** 이름표를 임시로 바꾼 대사 (예: 이름을 모를 때 '???') */
export function sayAs(id: string, who: SpeakerId, label: string, text: string, expr?: Expr): SayStep {
  return expr ? { t: 'say', id, who, text, label, expr } : { t: 'say', id, who, text, label };
}

export function card(id: string, text: string, sub?: string): CardStep {
  return sub ? { t: 'card', id, text, sub } : { t: 'card', id, text };
}

// --- 선택지 -----------------------------------------------------------------

export function opt(
  id: string,
  text: string,
  o: { heroine?: HeroineId; points?: number; goto?: string; effects?: Effect[] } = {},
): ChoiceOption {
  return { id, text, ...o };
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
export const decideRoute = (): StepDraft => ({ t: 'decideRoute' });
export const routeBranch = (scenes: Record<HeroineId, string>): StepDraft => ({ t: 'routeBranch', scenes });
export function ending(id: string, endingId: EndingId): EndingStep {
  return { t: 'ending', id, ending: endingId };
}

// --- 조건 도우미 -------------------------------------------------------------

export const chose = (choiceId: string, optionId: string): Cond => ({ choice: choiceId, is: optionId });
export const isFlag = (name: string, eq: boolean | number | string = true): Cond => ({ flag: name, eq });
export const not = (c: Cond): Cond => ({ not: c });
