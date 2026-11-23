/** 전학생 루트 — (임시 골격) */
import type { Scene } from '../../engine/types';
import { ending, mono, scene } from '../../engine/dsl';

export const TENKO_SCENES: Scene[] = [
  scene({ id: 't1_cats', title: '전학생 루트', route: 'tenko', part: 'main' }, [mono('t1.010', '임시'), ending('t9.end', 'tenko')]),
];
