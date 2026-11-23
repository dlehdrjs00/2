/**
 * 스토리 조립. 장면 파일을 모아 하나의 Story 로 만든다.
 * 장면 흐름: 공통(common) → 루트 분기(osana | tenko) → 각 루트의 여름 축제 후일담 → 엔딩
 */
import type { Scene, Story } from '../engine/types';
import { ENDING_TITLES } from './config';
import { COMMON_SCENES } from './scenes/common';
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
  version: '0.1.0',
  start: COMMON_SCENES[0].id,
  scenes: collect(COMMON_SCENES, OSANA_SCENES, TENKO_SCENES),
  endings: {
    osana: { id: 'osana', heroine: 'osana', title: ENDING_TITLES.osana },
    tenko: { id: 'tenko', heroine: 'tenko', title: ENDING_TITLES.tenko },
  },
};

/** 장면 표시 순서(대본 출력·저장 슬롯 정렬용) */
export const SCENE_ORDER: string[] = [...COMMON_SCENES, ...OSANA_SCENES, ...TENKO_SCENES].map((s) => s.id);
