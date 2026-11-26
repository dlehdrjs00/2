/**
 * 작중 날짜·장소 찾기: 타이틀 [이어하기] 옆 날짜(game.ts autoDate·onContinue)와 엔딩 폴라로이드 캡션(showEnding).
 * 대본의 장소 표시(place)·날짜 카드(card) 문구를 거꾸로 훑어 splitDate 로 '7월 10일'과 장소를 뽑는다(docs/UI_DESIGN.md 6.15).
 * 화면 없이 계산만 하므로 단위 테스트가 실제 STORY 로 엔딩 8개의 캡션을 고정한다(tests/unit/album.test.ts).
 */
import type { GameState, Story } from '../engine/types';
import { findStep } from '../engine/runner';
import { withJosa } from './dom';
import { splitDate } from './screens/common';

export interface StoryDate {
  /** '7월 10일' */
  md: string;
  /** 장소(없으면 '') */
  place: string;
}

/** 날짜를 찾는 위치(GameState 의 일부) */
export type DateAt = Pick<GameState, 'sceneId' | 'stepId' | 'log'>;

/** 대본 문구의 {변수} 치환(game.ts t) */
export type TextResolver = (s: string) => string;

type TextStep = { t: string; text?: string; sub?: string };

/** place·card 스텝의 화면 문구(card 는 '본문 · 보조') */
function stepText(st: TextStep, t: TextResolver): string {
  return st.t === 'card' ? `${t(st.text ?? '')}${st.sub ? ` · ${t(st.sub)}` : ''}` : t(st.text ?? '');
}

/** 장면 id → 그 장면으로 jump·routeBranch 하는 장면 id(대본 순서) */
export function scenePreds(story: Story): Map<string, string[]> {
  const m = new Map<string, string[]>();
  const add = (to: string, from: string) => {
    const list = m.get(to) ?? [];
    if (!list.includes(from)) list.push(from);
    m.set(to, list);
  };
  for (const sc of Object.values(story.scenes)) {
    for (const st of sc.steps) {
      if (st.t === 'jump') add(st.scene, sc.id);
      else if (st.t === 'routeBranch') for (const to of Object.values(st.scenes)) if (to) add(to, sc.id);
    }
  }
  return m;
}

/**
 * 상태가 가리키는 위치의 작중 날짜. 지금 장면에서 그 위치 앞의 장소 표시·날짜 카드 → 이 장면으로 들어오는 장면(가까운 것부터)
 * → 대본 순서상 앞 장면(공통·같은 루트) → 대화 기록의 날짜 카드 순서로, 날짜가 든 첫 문구를 쓴다.
 */
export function dateAt(story: Story, at: DateAt, t: TextResolver, preds: Map<string, string[]> = scenePreds(story)): StoryDate | null {
  const scan = (steps: readonly TextStep[], from: number) => {
    for (let i = from; i >= 0; i--) {
      const st = steps[i];
      if (st.t !== 'place' && st.t !== 'card') continue;
      const d = splitDate(stepText(st, t));
      if (d) return d;
    }
    return null;
  };
  const loc = findStep(story, at.sceneId, at.stepId);
  const scene = story.scenes[at.sceneId];
  if (scene) {
    const hit = scan(scene.steps, loc ? loc.index : scene.steps.length - 1);
    if (hit) return hit;
    // 이 장면으로 들어오는 장면(jump·routeBranch)을 가까운 것부터. 대본 순서만 보면 같은 루트의 다른 결말 갈래
    // (일상 쪽 od* 앞의 축제 쪽 o5~o7)나 다른 판(넷·셋)의 날짜를 잘못 집을 수 있다
    const seen = new Set([scene.id]);
    const queue = [scene.id];
    while (queue.length) {
      for (const p of preds.get(queue.shift()!) ?? []) {
        if (seen.has(p)) continue;
        seen.add(p);
        const s = story.scenes[p];
        const h = s ? scan(s.steps, s.steps.length - 1) : null;
        if (h) return h;
        queue.push(p);
      }
    }
    // 대본 순서상 앞 장면(공통 + 같은 루트)
    const ids = Object.keys(story.scenes);
    for (let k = ids.indexOf(scene.id) - 1; k >= 0; k--) {
      const s = story.scenes[ids[k]];
      if (s.route !== 'common' && s.route !== scene.route) continue;
      const h = scan(s.steps, s.steps.length - 1);
      if (h) return h;
    }
  }
  for (let i = at.log.length - 1; i >= 0; i--) {
    const e = at.log[i];
    if (e.kind !== 'card') continue;
    const d = splitDate(e.text);
    if (d) return d;
  }
  return null;
}

/**
 * 장소 표시 문구의 장소 부분. 날짜가 있으면 splitDate 의 장소('7월 23일 목요일 점심 · 1학년 교실' → '1학년 교실'),
 * 없으면 마지막 ' · ' 뒤('하굣길 · 언덕 아래 자판기 앞' → '언덕 아래 자판기 앞', '학교 뒷길' → 그대로)
 */
export function placePart(text: string): string {
  const d = splitDate(text);
  if (d) return d.place;
  const parts = text.split('·').map((x) => x.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
}

/** 엔딩 위치(지금 장면 지금 스텝)에서 거꾸로, 들어오는 장면(같은 루트, 가까운 것부터)까지 그 CG 를 띄운 cg 스텝 */
function findCgStep(story: Story, cg: string, at: Pick<GameState, 'sceneId' | 'stepId'>, preds: Map<string, string[]>): { scene: string; index: number } | null {
  const scene = story.scenes[at.sceneId];
  if (!scene) return null;
  const last = (sceneId: string, from: number) => {
    const steps = story.scenes[sceneId].steps;
    for (let i = Math.min(from, steps.length - 1); i >= 0; i--) {
      const st = steps[i];
      if (st.t === 'cg' && st.cg === cg) return { scene: sceneId, index: i };
    }
    return null;
  };
  const loc = findStep(story, scene.id, at.stepId);
  const here = last(scene.id, loc ? loc.index : scene.steps.length - 1);
  if (here) return here;
  const seen = new Set([scene.id]);
  const queue = [scene.id];
  while (queue.length) {
    for (const p of preds.get(queue.shift()!) ?? []) {
      const s = story.scenes[p];
      // 다른 루트(공통·다른 히로인)로는 넘어가지 않는다: 엔딩 그림은 그 루트 장면에서 뜬다
      if (seen.has(p) || !s || s.route !== scene.route) continue;
      seen.add(p);
      const h = last(p, s.steps.length - 1);
      if (h) return h;
      queue.push(p);
    }
  }
  return null;
}

/**
 * 엔딩 폴라로이드 그림(ENDING_CG)이 뜬 장면 기준의 날짜·장소: 그 cg 스텝에서 거꾸로 훑어 장소는 가장 가까운 장소 표시의
 * 장소 부분(날짜가 없어도. 날짜 카드를 먼저 만나면 그 카드의 장소), 날짜는 가장 가까운 날짜(place·card).
 * 그 cg 스텝을 못 찾거나 그 장면의 cg 앞에 날짜가 없으면 null(호출 쪽이 dateAt 으로 되돌아간다).
 * 예) 아카네 일상: od3 의 엔딩 → od2 의 end_akane_walk → '하굣길 · 언덕 아래 자판기 앞'(장소)·od2 첫 장소 표시의 7월 20일(날짜)
 */
export function cgSceneDate(
  story: Story,
  cg: string | null | undefined,
  at: Pick<GameState, 'sceneId' | 'stepId'>,
  t: TextResolver,
  preds: Map<string, string[]> = scenePreds(story),
): StoryDate | null {
  if (!cg) return null;
  const hit = findCgStep(story, cg, at, preds);
  if (!hit) return null;
  const steps = story.scenes[hit.scene].steps;
  let place: string | null = null;
  let md: string | null = null;
  for (let i = hit.index; i >= 0 && md === null; i--) {
    const st = steps[i];
    if (st.t !== 'place' && st.t !== 'card') continue;
    const text = stepText(st, t);
    const d = splitDate(text);
    if (place === null) place = placePart(text);
    if (d) md = d.md;
  }
  return md === null ? null : { md, place: place ?? '' };
}

/** 엔딩 폴라로이드 캡션 문구: '7월 20일, 언덕 아래 자판기 앞' · 장소가 없으면 '8월 8일' · 날짜도 없으면 '아카네와 함께' */
export function captionText(date: StoryDate | null, routeName: string): string {
  if (!date) return `${withJosa(routeName, '와')} 함께`;
  return date.place ? `${date.md}, ${date.place}` : date.md;
}

/** 엔딩 캡션의 날짜·장소: 폴라로이드 그림이 뜬 장면 기준(cgSceneDate), 없으면 엔딩 위치 기준(dateAt) */
export function endingDate(
  story: Story,
  cg: string | null | undefined,
  at: DateAt,
  t: TextResolver,
  preds: Map<string, string[]> = scenePreds(story),
): StoryDate | null {
  return cgSceneDate(story, cg, at, t, preds) ?? dateAt(story, at, t, preds);
}
