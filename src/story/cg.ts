/**
 * ★ 이벤트 CG·타이틀 키 비주얼 경로 중앙 관리 ★
 *
 * - 사용자가 제공한 최종 일러스트(placeholder: false). 원본은 저장소에 넣지 않고
 *   `scripts/import-art.py` 로 WebP 로 변환해 public/assets/cg/ 에 둔다.
 * - 썸네일(thumb)은 저장 화면·추억 앨범 목록용 480x270.
 * - 코하루(kh_*) 6장은 인계 패키지의 WebP·썸네일을 그대로 넣었다(다시 인코딩하지 않음). 모두 hidden.
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
  /**
   * 히든 CG. 한 번이라도 관람(GlobalRecord 에 기록)하기 전에는 추억 앨범의 칸(빈칸 포함)·제목·썸네일,
   * 타이틀 화면, 앨범 총 장수('n / 전체')에 나타나지 않는다. 관람한 뒤에만 그 한 장이 공개된다.
   * 히든 히로인(코하루)을 미리 예고하지 않기 위한 표시. 없으면 숨기지 않는다
   */
  hidden?: boolean;
}

const DIR = 'assets/cg';
const make = (id: string, title: string, route: HeroineId | null, desc: string, opts: { hidden?: boolean } = {}): CgAsset => ({
  src: `${DIR}/${id}.webp`,
  thumb: `${DIR}/thumb/${id}.webp`,
  title,
  route,
  placeholder: false,
  desc,
  ...(opts.hidden ? { hidden: true } : {}),
});
/** 히든 CG(관람 전 앨범·타이틀·총 장수에 없음) */
const hidden = { hidden: true } as const;

/** 추억 앨범 표시 순서도 이 순서를 따른다 */
export const CGS: Record<CgId, CgAsset> = {
  rain_osana: make('rain_osana', '작은 우산', 'osana', '공통 c6 소나기 — 소꿉친구의 우산을 함께 쓴 하굣길'),
  rain_tenko: make('rain_tenko', '기울어진 우산', 'tenko', '공통 c6 소나기 — 전학생과 우산을 함께 쓴 하굣길'),
  door_osana: make('door_osana', '체인 너머', 'osana', '소꿉친구 루트 o2 — 감기 문병, 체인 걸린 현관문'),
  ramune_osana: make('ramune_osana', '토요일이거든', 'osana', '소꿉친구 루트 o4 — 노을 강변의 라무네'),
  fireworks_osana: make('fireworks_osana', '첫 불꽃', 'osana', '소꿉친구 루트 o6 — 고백 뒤 첫 불꽃'),
  homeward_osana: make('homeward_osana', '처음 바래다주는 길', 'osana', '소꿉친구 루트 o7 — 손잡고 걷는 귀갓길'),
  cats_tenko: make('cats_tenko', '기다리면 오는 것', 'tenko', '전학생 루트 t1 — 신사 돌계단의 다이후쿠'),
  bench_tenko: make('bench_tenko', '그거, 내 대사인데', 'tenko', '전학생 루트 t4 — 노을 언덕 벤치'),
  selfie_tenko: make('selfie_tenko', '이번엔 둘이 같이', 'tenko', '전학생 루트 t6 — 불꽃 아래 셀카'),
  shutter_tenko: make('shutter_tenko', '셔터가 눌린 순간', 'tenko', '전학생 루트 t6 — 사진에 담긴 순간'),
  polaroid_tenko: make('polaroid_tenko', '첫 장에 넣을 사진', 'tenko', '전학생 루트 t7 — 현상된 즉석사진'),
  // 히든 히로인 코하루(manifest.json 순서·제목). kh_meet·kh_draw 는 해금된 플레이의 공통 장면이라 route null
  kh_meet: make('kh_meet', '금요일의 모퉁이', null, '공통 c7 금요일 하교(해금 시) — 복도 모퉁이에서 어깨가 부딪친 직후', hidden),
  kh_draw: make('kh_draw', '요일을 나눠 가진 자전거', null, '공통 c8 토요일 상점가 추첨(해금 시) — 결과를 듣고 휴지 한 팩을 받는 순간', hidden),
  kh_relay: make('kh_relay', '두 사람 글씨', 'koharu', '후배 루트 k5 — 문구점 앞, 두 사람의 손글씨 안내판', hidden),
  kh_confession: make('kh_confession', '마지막 등롱 아래', 'koharu', '후배 루트 k6 — 고백에 대답하는 순간(첫 불꽃 전)', hidden),
  kh_home: make('kh_home', '오른손', 'koharu', '후배 루트 k7 — 귀갓길에 손을 잡은 뒤', hidden),
  kh_date: make('kh_date', '일요일은 둘이서', 'koharu', '후배 루트 k8 — 첫 데이트 장소(문구점)에 도착하며', hidden),
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
 * 세 엔딩 모두 히로인의 얼굴이 크게 보이는 그림으로 고른다(작은 폴라로이드에서도 표정이 읽히게).
 * 아카네는 엔딩 직전 장면 o7 의 「처음 바래다주는 길」(돌아보며 웃는 얼굴, 맞잡은 손).
 * 코하루는 엔딩 장면 k8 의 「일요일은 둘이서」(엔딩 제목과 같은 그림, manifest ending.cg).
 */
export const ENDING_CG: Record<HeroineId, CgId> = {
  osana: 'homeward_osana',
  tenko: 'polaroid_tenko',
  koharu: 'kh_date',
};
