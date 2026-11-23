/**
 * ★ 이벤트 CG·타이틀 키 비주얼 경로 중앙 관리 ★
 *
 * - 사용자가 제공한 최종 일러스트(placeholder: false). 원본은 저장소에 넣지 않고
 *   `scripts/import-art.py` 로 WebP 로 변환해 public/assets/cg/ 에 둔다.
 * - 썸네일(thumb)은 저장 화면·추억 앨범 목록용 480x270.
 */
import type { CgId, HeroineId } from '../engine/types';

export interface CgAsset {
  src: string;
  thumb: string;
  /** 추억 앨범에 표시할 제목 */
  title: string;
  /** 어느 루트에서 보는 CG 인지(공통이면 null) */
  route: HeroineId | null;
  placeholder: boolean;
  desc: string;
}

const DIR = 'assets/cg';
const make = (id: string, title: string, route: HeroineId | null, desc: string): CgAsset => ({
  src: `${DIR}/${id}.webp`,
  thumb: `${DIR}/thumb/${id}.webp`,
  title,
  route,
  placeholder: false,
  desc,
});

/** 추억 앨범 표시 순서도 이 순서를 따른다 */
export const CGS: Record<CgId, CgAsset> = {
  rain_osana: make('rain_osana', '작은 우산', 'osana', '공통 c6 소나기 — 아카네 우산을 함께 쓴 하굣길'),
  rain_tenko: make('rain_tenko', '기울어진 우산', 'tenko', '공통 c6 소나기 — 히나와 우산을 함께 쓴 하굣길'),
  door_osana: make('door_osana', '체인 너머', 'osana', '아카네 루트 o2 — 감기 문병, 체인 걸린 현관문'),
  ramune_osana: make('ramune_osana', '토요일이거든', 'osana', '아카네 루트 o4 — 노을 강변의 라무네'),
  fireworks_osana: make('fireworks_osana', '첫 불꽃', 'osana', '아카네 루트 o6 — 고백 뒤 첫 불꽃'),
  homeward_osana: make('homeward_osana', '처음 바래다주는 길', 'osana', '아카네 루트 o7 — 손잡고 걷는 귀갓길'),
  cats_tenko: make('cats_tenko', '기다리면 오는 것', 'tenko', '히나 루트 t1 — 신사 돌계단의 다이후쿠'),
  bench_tenko: make('bench_tenko', '그거, 내 대사인데', 'tenko', '히나 루트 t4 — 노을 언덕 벤치'),
  selfie_tenko: make('selfie_tenko', '이번엔 둘이 같이', 'tenko', '히나 루트 t6 — 불꽃 아래 셀카'),
  shutter_tenko: make('shutter_tenko', '셔터가 눌린 순간', 'tenko', '히나 루트 t6 — 사진에 담긴 순간'),
  polaroid_tenko: make('polaroid_tenko', '첫 장에 넣을 사진', 'tenko', '히나 루트 t7 — 현상된 즉석사진'),
};

export const CG_ORDER = Object.keys(CGS) as CgId[];

/** 타이틀 화면 키 비주얼 */
export const KEY_VISUAL = {
  src: `${DIR}/kv.webp`,
  thumb: `${DIR}/thumb/kv.webp`,
  placeholder: false,
  desc: '타이틀 키 비주얼 — 여름 하늘 아래 등굣길의 두 히로인',
} as const;

/**
 * 엔딩 화면 폴라로이드에 넣을 대표 CG.
 * 두 엔딩 모두 히로인의 얼굴이 크게 보이는 그림으로 고른다(작은 폴라로이드에서도 표정이 읽히게).
 * 아카네는 엔딩 직전 장면 o7 의 「처음 바래다주는 길」(돌아보며 웃는 얼굴, 맞잡은 손).
 */
export const ENDING_CG: Record<HeroineId, CgId> = {
  osana: 'homeward_osana',
  tenko: 'polaroid_tenko',
};
