/**
 * 스토리 조립. 장면 파일을 모아 하나의 Story 로 만든다.
 * 장면 흐름:
 *   공통 c1~c7(1주 차 월~금, 초반 선택 4회) → c7 종소리 뒤 숨은 등장 판정
 *   → [해금 시] 금요일 복도 첫 만남·토요일 오전 추첨(c8_raffle)
 *   → 토 오후 c8_bakery · 일 c9_puzzle · 월 점심 c10_window(후반 선택 3회) → 루트 결정
 *   → 루트 분기(osana | tenko | koharu) → 각 루트의 8월 후일담 → 엔딩
 */
import type { Scene, Story } from '../engine/types';
import { ENDING_TITLES } from './config';
import { COMMON_SCENES } from './scenes/common';
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

export const STORY: Story = {
  version: '0.2.0',
  start: COMMON_SCENES[0].id,
  scenes: collect(COMMON_SCENES, OSANA_SCENES, TENKO_SCENES, KOHARU_SCENES),
  endings: {
    osana: { id: 'osana', heroine: 'osana', title: ENDING_TITLES.osana },
    tenko: { id: 'tenko', heroine: 'tenko', title: ENDING_TITLES.tenko },
    koharu: { id: 'koharu', heroine: 'koharu', title: ENDING_TITLES.koharu },
  },
};

/** 장면 표시 순서(대본 출력·저장 슬롯 정렬용) */
export const SCENE_ORDER: string[] = [...COMMON_SCENES, ...OSANA_SCENES, ...TENKO_SCENES, ...KOHARU_SCENES].map((s) => s.id);
