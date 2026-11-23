/**
 * 스토리 데이터 검증기 (순수 함수).
 *  - 연결 오류: 존재하지 않는 장면/스텝/라벨, 장면 끝 누락
 *  - id 중복, 에셋 키·의상 조합 누락, 치환 변수 누락
 *  - 모든 선택 조합을 실제 실행기로 시뮬레이션: 엔딩 도달·루트 혼입·루트 규칙 확인
 *  - 도달 불가능한 장면·엔딩
 */
import type { GameState, HeroineId, Scene, Step, Story } from './types';
import { HEROINES } from './types';
import { advance, choose, cloneState, decideRoute, newGameState, settle, StoryError } from './runner';
import { resolveText, unknownPlaceholders } from './text';

export interface AssetChecker {
  hasBg(bg: string): boolean;
  hasSprite(char: string, outfit: string, hair: string, expr: string): boolean;
  hasBgm(id: string): boolean;
  hasSfx(id: string): boolean;
  speakers: readonly string[];
}

export interface PathRecord {
  choices: Array<{ choice: string; option: string; heroine?: HeroineId }>;
  route: HeroineId | null;
  ending: string | null;
  expectedRoute: HeroineId;
  mainChars: number;
  mainLines: number;
  epilogueChars: number;
  epilogueLines: number;
}

export interface ValidationReport {
  errors: string[];
  warnings: string[];
  paths: PathRecord[];
  stats: {
    scenes: number;
    sayLines: number;
    choices: number;
    unreachableSteps: string[];
  };
}

const ID_RE = /^[A-Za-z0-9_.-]+$/;
export const LINE_WARN_CHARS = 85;
export const LINE_MAX_CHARS = 120;
export const OPTION_MAX_CHARS = 34;
const TERMINAL = new Set<Step['t']>(['jump', 'routeBranch', 'ending', 'goto']);

export function validateStory(story: Story, assets: AssetChecker, vars: Readonly<Record<string, string>>): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const seen = new Map<string, string>();
  let sayLines = 0;
  let choiceCount = 0;

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
          if (step.expr && step.who !== 'osana' && step.who !== 'tenko') warnings.push(`${step.id}: 히로인이 아닌 화자에 표정 지정`);
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
          if (step.options.length < 2 || step.options.length > 3) errors.push(`${step.id}: 선택지는 2~3개여야 합니다 (현재 ${step.options.length})`);
          const optIds = new Set<string>();
          for (const o of step.options) {
            if (optIds.has(o.id)) errors.push(`${step.id}: 옵션 id 중복 '${o.id}'`);
            optIds.add(o.id);
            const t = resolveText(o.text, vars);
            if (t.length > OPTION_MAX_CHARS) warnings.push(`${step.id}/${o.id}: 선택지 문구가 깁니다(${t.length}자)`);
            checkText(`${step.id}/${o.id}`, o.text);
            if (o.goto && !localIds.has(o.goto)) errors.push(`${step.id}/${o.id}: 같은 장면에 이동 목표 '${o.goto}' 가 없습니다`);
            if (scene.route !== 'common' && o.heroine) warnings.push(`${step.id}/${o.id}: 루트 확정 후 선택지의 heroine 점수는 무시됩니다`);
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

  function checkCondRefs(where: string, cond: import('./types').Cond) {
    if ('choice' in cond) {
      const target = findChoice(story, cond.choice);
      if (!target) errors.push(`${where}: 조건이 참조하는 선택지 '${cond.choice}' 없음`);
      else if (!target.options.some((o) => o.id === cond.is)) errors.push(`${where}: 선택지 '${cond.choice}' 에 옵션 '${cond.is}' 없음`);
    } else if ('not' in cond) checkCondRefs(where, cond.not);
    else if ('all' in cond) cond.all.forEach((c) => checkCondRefs(where, c));
    else if ('any' in cond) cond.any.forEach((c) => checkCondRefs(where, c));
  }

  // ---- 시뮬레이션 (모든 선택 조합) ----------------------------------------
  const paths: PathRecord[] = [];
  const visitedSteps = new Set<string>();
  const visitedScenes = new Set<string>();
  const endingsReached = new Set<string>();
  const MAX_PATHS = 4096;
  const MAX_BLOCKING = 5000;

  if (errors.length === 0) {
    type Frame = { state: GameState; rec: PathRecord };
    const stack: Frame[] = [
      {
        state: newGameState(story),
        rec: { choices: [], route: null, ending: null, expectedRoute: 'osana', mainChars: 0, mainLines: 0, epilogueChars: 0, epilogueLines: 0 },
      },
    ];
    while (stack.length) {
      if (paths.length >= MAX_PATHS) {
        warnings.push(`선택 조합이 ${MAX_PATHS}개를 넘어 시뮬레이션을 중단했습니다`);
        break;
      }
      const { state, rec } = stack.pop()!;
      try {
        let count = 0;
        let res = settle(story, state);
        for (;;) {
          if (++count > MAX_BLOCKING) throw new StoryError('블로킹 스텝이 너무 많습니다(순환 의심)');
          markVisited(story, state, visitedSteps, visitedScenes);
          checkRouteMixing(state, res.scene, rec, errors);
          checkStage(state, res.step, errors, warnings, assets);
          const step = res.step;
          if (step.t === 'say' || step.t === 'card') {
            const len = resolveText(step.text, vars).length;
            if (res.scene.part === 'epilogue') {
              rec.epilogueChars += len;
              rec.epilogueLines += 1;
            } else {
              rec.mainChars += len;
              rec.mainLines += 1;
            }
            res = advance(story, state)!;
            continue;
          }
          if (step.t === 'choice') {
            for (const o of [...step.options].reverse()) {
              const st = cloneState(state);
              const r2: PathRecord = { ...rec, choices: [...rec.choices, { choice: step.id, option: o.id, heroine: o.heroine }] };
              choose(story, st, o.id);
              stack.push({ state: st, rec: r2 });
            }
            break;
          }
          // ending
          rec.ending = step.ending;
          rec.route = state.route;
          rec.expectedRoute = expectedRouteFromChoices(rec.choices, story);
          endingsReached.add(step.ending);
          if (state.route === null) errors.push(`루트 확정 없이 엔딩 ${step.ending} 도달 (선택: ${fmtChoices(rec)})`);
          else if (story.endings[step.ending]?.heroine !== state.route) errors.push(`루트 ${state.route} 인데 엔딩 ${step.ending} 도달`);
          if (state.route !== rec.expectedRoute) errors.push(`루트 규칙 불일치: 기대 ${rec.expectedRoute}, 실제 ${state.route} (선택: ${fmtChoices(rec)})`);
          paths.push(rec);
          break;
        }
      } catch (e) {
        errors.push(`시뮬레이션 오류 (선택: ${fmtChoices(rec)}): ${(e as Error).message}`);
      }
    }

    for (const sceneId of Object.keys(story.scenes)) {
      if (!visitedScenes.has(sceneId)) errors.push(`도달할 수 없는 장면: ${sceneId}`);
    }
    for (const endingId of Object.keys(story.endings)) {
      if (!endingsReached.has(endingId)) errors.push(`도달할 수 없는 엔딩: ${endingId}`);
    }
    for (const h of HEROINES) {
      if (!paths.some((p) => p.route === h)) errors.push(`${h} 루트로 가는 선택 조합이 없습니다`);
    }
  }

  const unreachableSteps: string[] = [];
  if (errors.length === 0) {
    for (const scene of Object.values(story.scenes)) {
      for (const step of scene.steps) {
        if ((step.t === 'say' || step.t === 'card' || step.t === 'choice') && !visitedSteps.has(step.id)) unreachableSteps.push(step.id);
      }
    }
    if (unreachableSteps.length) warnings.push(`도달하지 않는 문장 ${unreachableSteps.length}개: ${unreachableSteps.slice(0, 10).join(', ')}`);
  }

  return { errors, warnings, paths, stats: { scenes: Object.keys(story.scenes).length, sayLines, choices: choiceCount, unreachableSteps } };
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

/** 실행기와 독립적으로 선택 기록만 보고 루트를 다시 계산한다(규칙 교차 검증) */
export function expectedRouteFromChoices(choices: PathRecord['choices'], story: Story): HeroineId {
  const pts: Record<HeroineId, number> = { osana: 0, tenko: 0 };
  let last: HeroineId | null = null;
  for (const c of choices) {
    if (!c.heroine) continue;
    const step = findChoice(story, c.choice);
    const scene = step ? sceneOfStep(story, step.id) : null;
    if (scene && scene.route !== 'common') continue; // 루트 확정 후 선택은 루트에 영향 없음
    const o = step?.options.find((x) => x.id === c.option);
    pts[c.heroine] += o?.points ?? 1;
    last = c.heroine;
  }
  return decideRoute(pts, last);
}

function sceneOfStep(story: Story, stepId: string): Scene | null {
  for (const s of Object.values(story.scenes)) if (s.steps.some((x) => x.id === stepId)) return s;
  return null;
}

function markVisited(story: Story, state: GameState, steps: Set<string>, scenes: Set<string>) {
  steps.add(state.stepId);
  scenes.add(state.sceneId);
  void story;
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
  if (step.t === 'say' && step.expr && (step.who === 'osana' || step.who === 'tenko')) {
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
