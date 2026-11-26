/**
 * 스토리 조립. 장면 파일을 모아 하나의 Story 로 만든다.
 * 장면 흐름(docs/EIGHT_ENDINGS_DESIGN.md 3절):
 *   공통 c1~c7(1주 차 월~금, 초반 선택 4회) → c7 종소리 뒤 숨은 등장 판정
 *   → [발견] 금요일 복도 첫 만남·토요일 오전 추첨(c8_raffle) → 빙수집 넷(e1_ice4) → 일요일(e1s_sunday4)
 *            → 월 점심 종이개구리 넷(e2_frog4) → 월 방과 후 처마 넷(e3_rain4, 후반 선택 6회 +0.5) → 루트 결정(완전 동점이면 히든)
 *   → [미발견] 빙수집 셋(e1_ice3) → c8_bakery → c9_puzzle → 종이개구리 셋(e2_frog3) → c10_window → 처마 셋(e3_rain3) → 루트 결정(옛 규칙)
 *   → [구저장 발견] c8_bakery → c9_puzzle → c10_window(후반 선택 +3) → 루트 결정(옛 규칙)
 *   → 루트 분기(osana | tenko | koharu | group) → 루트 본편 끝의 결말 갈래 선택(축제 쪽 / 일상 쪽) → 엔딩 8개
 */
import type { EndingDef, EndingId, EndingKind, RouteId, Scene, Story } from '../engine/types';
import { ENDING_TITLES } from './config';
import { COMMON_SCENES } from './scenes/common';
import { EP3_SCENES } from './scenes/episodes3';
import { EP4_SCENES } from './scenes/episodes4';
import { GROUP_SCENES } from './scenes/group';
import { KOHARU_SCENES } from './scenes/koharu';
import { OSANA_SCENES } from './scenes/osana';
import { TENKO_SCENES } from './scenes/tenko';

function collect(...groups: Scene[][]): Record<string, Scene> {
  const out: Record<string, Scene> = {};
  for (const g of groups) {
    for (const s of g) {
      if (out[s.id]) throw new Error(`장면 id 중복: ${s.id}`);
      out[s.id] = s;
    }
  }
  return out;
}

const endingDef = (id: EndingId, route: RouteId, kind: EndingKind): EndingDef => ({ id, route, kind, title: ENDING_TITLES[id] });

export const STORY: Story = {
  version: '0.3.0',
  start: COMMON_SCENES[0].id,
  scenes: collect(COMMON_SCENES, EP4_SCENES, EP3_SCENES, OSANA_SCENES, TENKO_SCENES, KOHARU_SCENES, GROUP_SCENES),
  // 기존 세 id(osana·tenko·koharu)는 각 루트의 축제 쪽 결말(전역 기록이 이 id 를 참조하므로 바꾸지 않는다)
  endings: {
    osana: endingDef('osana', 'osana', 'festival'),
    osana_daily: endingDef('osana_daily', 'osana', 'daily'),
    tenko: endingDef('tenko', 'tenko', 'festival'),
    tenko_daily: endingDef('tenko_daily', 'tenko', 'daily'),
    koharu: endingDef('koharu', 'koharu', 'festival'),
    koharu_daily: endingDef('koharu_daily', 'koharu', 'daily'),
    group_festival: endingDef('group_festival', 'group', 'festival'),
    group_daily: endingDef('group_daily', 'group', 'daily'),
  },
};

/**
 * 공통 장면 시간순. 에피소드 장면(넷·셋 판)을 같은 시간대의 공통 장면 뒤에 끼운다.
 * 예: 토 오전 c8_raffle → 토 이른 오후 e1_ice4·e1_ice3 → 토 늦은 오후 c8_bakery → 일 e1s_sunday4 → c9_puzzle …
 * 여기에 없는 에피소드 장면(작가가 나중에 더한 장면)은 공통 장면 끝에 파일 순서대로 붙인다.
 */
const EPISODES_AFTER: Record<string, string[]> = {
  c8_raffle: ['e1_ice4', 'e1_ice3'],
  c8_bakery: ['e1s_sunday4'],
  c9_puzzle: ['e2_frog4', 'e2_frog3'],
  c10_window: ['e3_rain4', 'e3_rain3'],
};

function commonTimeline(): Scene[] {
  const episodes = [...EP4_SCENES, ...EP3_SCENES];
  const byId = new Map(episodes.map((s) => [s.id, s]));
  const placed = new Set<string>();
  const out: Scene[] = [];
  for (const s of COMMON_SCENES) {
    out.push(s);
    for (const id of EPISODES_AFTER[s.id] ?? []) {
      const ep = byId.get(id);
      if (ep && !placed.has(id)) {
        out.push(ep);
        placed.add(id);
      }
    }
  }
  for (const ep of episodes) if (!placed.has(ep.id)) out.push(ep);
  return out;
}

/** 장면 표시 순서(대본 출력·저장 슬롯 정렬용): 공통(에피소드 포함, 시간순) → 아카네 → 히나 → 코하루 → 네 사람 */
export const SCENE_ORDER: string[] = [...commonTimeline(), ...OSANA_SCENES, ...TENKO_SCENES, ...KOHARU_SCENES, ...GROUP_SCENES].map((s) => s.id);
