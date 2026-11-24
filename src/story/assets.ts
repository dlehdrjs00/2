/**
 * ★ 이미지·오디오 경로 중앙 관리 ★
 *
 * - 모든 경로는 public/ 기준 상대 경로다(빌드 결과에서도 그대로 사용).
 * - placeholder: true 인 항목은 개발용 임시 에셋이다. 최종 에셋으로 교체하면 false 로 바꾼다.
 * - 존재하지 않는 파일은 연결하지 않는다. `npm run validate` 가 파일 존재 여부를 검사한다.
 *
 * 캐릭터 그림 교체 방법:
 *   SPRITE_SETS 의 dir/ext 를 최종 에셋 폴더로 바꾸고 placeholder 를 false 로 바꾼다.
 *   파일 이름 규칙은 `${outfit}_${hair}_${expr}.${ext}` (예: uniform_default_smile.webp)
 */
import type { BgId, BgmId, CharId, Expr, Hair, Outfit, SfxId } from '../engine/types';
import { EXPRS } from '../engine/types';

/** 배경 톤: UI 유리의 색(밤이면 남색 유리)과 장소 표시 아이콘(해/달)을 고른다 */
export type BgTone = 'day' | 'evening' | 'night';

export interface ImageAsset {
  /** public/ 기준 경로. 단색 배경이면 생략하고 color 사용 */
  src?: string;
  /** 작은 그림(480x270, 저장 칸·엔딩 폴라로이드의 미니 무대용). `python3 scripts/bg-thumbs.py` 가 src 에서 만든다 */
  thumb?: string;
  color?: string;
  placeholder: boolean;
  /** 사람이 읽는 설명(에셋 목록 문서에 출력) */
  desc: string;
  /** 배경 톤. 생략하면 낮(day). 비 배경은 id 의 '_rain' 으로 따로 판별한다 */
  tone?: BgTone;
}

export interface AudioAsset {
  src: string;
  placeholder: boolean;
  desc: string;
  /** 0~1, 트랙별 기본 음량 보정 */
  gain?: number;
}

/** 최종 배경(1920x1080 WebP, 제작 기록 docs/BACKGROUND_PROMPTS.md)과 그 썸네일(thumb/) */
const BG = 'assets/bg';

export const BACKGROUNDS: Record<BgId, ImageAsset> = {
  title: { src: `${BG}/title.webp`, thumb: `${BG}/thumb/title.webp`, placeholder: false, desc: '타이틀 화면 배경(초여름 하늘과 학교 언덕)' },
  road_morning: { src: `${BG}/road_morning.webp`, thumb: `${BG}/thumb/road_morning.webp`, placeholder: false, desc: '등굣길 주택가(아침)' },
  road_evening: { src: `${BG}/road_evening.webp`, thumb: `${BG}/thumb/road_evening.webp`, placeholder: false, desc: '하굣길 주택가(노을)', tone: 'evening' },
  road_rain: { src: `${BG}/road_rain.webp`, thumb: `${BG}/thumb/road_rain.webp`, placeholder: false, desc: '하굣길 주택가(소나기)' },
  road_night: { src: `${BG}/road_night.webp`, thumb: `${BG}/thumb/road_night.webp`, placeholder: false, desc: '밤 귀갓길(가로등, 여름밤)', tone: 'night' },
  classroom_day: { src: `${BG}/classroom_day.webp`, thumb: `${BG}/thumb/classroom_day.webp`, placeholder: false, desc: '2학년 3반 교실(낮, 창가)' },
  classroom_evening: { src: `${BG}/classroom_evening.webp`, thumb: `${BG}/thumb/classroom_evening.webp`, placeholder: false, desc: '교실(방과 후 노을)', tone: 'evening' },
  hallway: { src: `${BG}/hallway.webp`, thumb: `${BG}/thumb/hallway.webp`, placeholder: false, desc: '복도와 자판기(낮)' },
  shoe_lockers: { src: `${BG}/shoe_lockers.webp`, thumb: `${BG}/thumb/shoe_lockers.webp`, placeholder: false, desc: '현관 신발장(방과 후)' },
  shoe_lockers_rain: { src: `${BG}/shoe_lockers_rain.webp`, thumb: `${BG}/thumb/shoe_lockers_rain.webp`, placeholder: false, desc: '현관 신발장(밖은 소나기)' },
  courtyard: { src: `${BG}/courtyard.webp`, thumb: `${BG}/thumb/courtyard.webp`, placeholder: false, desc: '중정 벤치(점심시간)' },
  shotengai: { src: `${BG}/shotengai.webp`, thumb: `${BG}/thumb/shotengai.webp`, placeholder: false, desc: '동네 상점가와 오래된 막과자 가게(늦은 오후)' },
  riverbank_evening: { src: `${BG}/riverbank_evening.webp`, thumb: `${BG}/thumb/riverbank_evening.webp`, placeholder: false, desc: '강변 둑길(노을)', tone: 'evening' },
  station_morning: { src: `${BG}/station_morning.webp`, thumb: `${BG}/thumb/station_morning.webp`, placeholder: false, desc: '역 앞 맨션가(아침)' },
  apartment_door: { src: `${BG}/apartment_door.webp`, thumb: `${BG}/thumb/apartment_door.webp`, placeholder: false, desc: '맨션 복도의 현관문 앞(저녁)', tone: 'evening' },
  shrine_steps: { src: `${BG}/shrine_steps.webp`, thumb: `${BG}/thumb/shrine_steps.webp`, placeholder: false, desc: '언덕 위 작은 신사 돌계단(노을, 고양이 자리)', tone: 'evening' },
  festival_street: { src: `${BG}/festival_street.webp`, thumb: `${BG}/thumb/festival_street.webp`, placeholder: false, desc: '여름 축제 노점 거리(밤, 제등)', tone: 'night' },
  riverbank_night: { src: `${BG}/riverbank_night.webp`, thumb: `${BG}/thumb/riverbank_night.webp`, placeholder: false, desc: '불꽃놀이를 보는 강변 둑(밤)', tone: 'night' },
  shrine_night: { src: `${BG}/shrine_night.webp`, thumb: `${BG}/thumb/shrine_night.webp`, placeholder: false, desc: '불꽃놀이가 보이는 신사 언덕(밤)', tone: 'night' },
  black: { color: '#08070c', placeholder: false, desc: '검은 화면(파일 없음)' },
};

// ---------------------------------------------------------------------------
// 캐릭터 스프라이트
// ---------------------------------------------------------------------------

export interface SpriteSet {
  dir: string;
  ext: 'svg' | 'png' | 'webp';
  placeholder: boolean;
  /** 제공되는 의상×헤어 조합 */
  looks: ReadonlyArray<{ outfit: Outfit; hair: Hair; desc: string }>;
  expressions: readonly Expr[];
  /** 스프라이트 원본 비율(가로/세로). 화면 배치 계산용 */
  aspect: number;
}

export const SPRITE_SETS: Record<CharId, SpriteSet> = {
  osana: {
    dir: 'assets/char/osana',
    ext: 'webp',
    placeholder: false,
    looks: [
      { outfit: 'uniform', hair: 'default', desc: '교복(베이지 카디건), 반묶음+리본' },
      { outfit: 'yukata', hair: 'default', desc: '유카타(남색 바탕 금붕어 무늬, 붉은 오비), 올림머리(뒤로 틀어 올린 경단+한쪽으로 늘어뜨린 머리)·분홍 핀, 리본 없음' },
    ],
    expressions: EXPRS,
    aspect: 800 / 1200,
  },
  tenko: {
    dir: 'assets/char/tenko',
    ext: 'webp',
    placeholder: false,
    looks: [
      { outfit: 'uniform', hair: 'default', desc: '교복(연회색 카디건), 긴 웨이브+하늘색 머리핀' },
      { outfit: 'uniform', hair: 'ponytail', desc: '교복(연회색 카디건), 높은 포니테일+하늘색 리본' },
      { outfit: 'yukata', hair: 'ponytail', desc: '유카타(연하늘 바탕 흰 나팔꽃, 남색 오비), 포니테일' },
    ],
    expressions: EXPRS,
    aspect: 800 / 1200,
  },
};

export function spriteFile(set: SpriteSet, outfit: Outfit, hair: Hair, expr: Expr): string {
  return `${set.dir}/${outfit}_${hair}_${expr}.${set.ext}`;
}

/** 해당 조합의 스프라이트 경로. 제공되지 않는 조합이면 null */
export function spritePath(char: CharId, outfit: Outfit, hair: Hair, expr: Expr): string | null {
  const set = SPRITE_SETS[char];
  if (!set.looks.some((l) => l.outfit === outfit && l.hair === hair)) return null;
  if (!set.expressions.includes(expr)) return null;
  return spriteFile(set, outfit, hair, expr);
}

export function allSpritePaths(): string[] {
  const out: string[] = [];
  for (const set of Object.values(SPRITE_SETS)) {
    for (const look of set.looks) {
      for (const e of set.expressions) out.push(spriteFile(set, look.outfit, look.hair, e));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 오디오 (임시 음원은 scripts/gen-placeholder-audio.mjs 로 생성한 합성음)
// ---------------------------------------------------------------------------

const PH_AUDIO = 'assets/placeholder/audio';

export const BGM: Record<BgmId, AudioAsset> = {
  title: { src: `${PH_AUDIO}/bgm_title.mp3`, placeholder: true, desc: '타이틀: 초여름 바람 같은 잔잔한 곡' },
  daily: { src: `${PH_AUDIO}/bgm_daily.mp3`, placeholder: true, desc: '일상: 경쾌하고 가벼운 학교생활' },
  heart: { src: `${PH_AUDIO}/bgm_heart.mp3`, placeholder: true, desc: '설렘: 느리고 따뜻한 두근거림' },
  evening: { src: `${PH_AUDIO}/bgm_evening.mp3`, placeholder: true, desc: '노을: 그리움이 섞인 하굣길' },
  festival: { src: `${PH_AUDIO}/bgm_festival.mp3`, placeholder: true, desc: '축제: 피리·북 느낌의 들뜬 축제' },
  confession: { src: `${PH_AUDIO}/bgm_confession.mp3`, placeholder: true, desc: '고백: 조용하고 맑은 피아노풍' },
};

export const SFX: Record<SfxId, AudioAsset> = {
  select: { src: `${PH_AUDIO}/sfx_select.mp3`, placeholder: true, desc: 'UI 선택음' },
  bell: { src: `${PH_AUDIO}/sfx_bell.mp3`, placeholder: true, desc: '학교 차임벨' },
  door: { src: `${PH_AUDIO}/sfx_door.mp3`, placeholder: true, desc: '교실 미닫이문' },
  rain: { src: `${PH_AUDIO}/sfx_rain.mp3`, placeholder: true, desc: '소나기 소리(수 초)' },
  camera: { src: `${PH_AUDIO}/sfx_camera.mp3`, placeholder: true, desc: '즉석카메라 셔터' },
  firework: { src: `${PH_AUDIO}/sfx_firework.mp3`, placeholder: true, desc: '불꽃 터지는 소리' },
  message: { src: `${PH_AUDIO}/sfx_message.mp3`, placeholder: true, desc: '휴대폰 메시지 알림' },
  sparkle: { src: `${PH_AUDIO}/sfx_sparkle.mp3`, placeholder: true, desc: '반짝(놀람·깨달음 강조)' },
  footsteps: { src: `${PH_AUDIO}/sfx_footsteps.mp3`, placeholder: true, desc: '달려오는 발소리' },
  cat: { src: `${PH_AUDIO}/sfx_cat.mp3`, placeholder: true, desc: '고양이 울음(합성 임시음)' },
};
