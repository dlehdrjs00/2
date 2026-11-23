/**
 * ★ 이름·학교·날짜 등 임시 설정은 전부 이 파일 한 곳에서 관리한다. ★
 *
 * 대사 안에서는 {osana}, {tenko:는}, {me} 처럼 치환 키를 쓰므로
 * 여기 값을 바꾸면 모든 대사·이름표·대본 출력에 반영된다.
 * (받침에 따라 은/는, 이/가 등 조사도 자동으로 맞춰진다)
 */
import type { SpeakerId } from '../engine/types';

export const GAME_TITLE = '내일도 같이 갈래?';
export const GAME_SUBTITLE = '— 여름이 오기 전, 우리 셋의 2주 —';
export const BUILD_LABEL = 'v0.1 첫 플레이 버전';

/** 임시 이름 (모두 미정 → 변경 가능) */
export const NAMES = {
  /** 주인공 (남학생, 그림 없음) */
  me: { given: '소우타', family: '아오야마' },
  /** 소꿉친구 히로인 */
  osana: { given: '아카네', family: '미즈하라' },
  /** 전학생 히로인 */
  tenko: { given: '히나', family: '사쿠라이' },
} as const;

/** 임시 배경 설정 */
export const SETTING = {
  school: '아사히가오카 고등학교',
  schoolShort: '아사히가오카 고교',
  classroom: '2학년 3반',
  town: '아사히가오카',
  teacher: '오카다',
  /** 어릴 때부터 다니던 동네 막과자 가게 */
  shop: '후루카와 상점',
  festival: '아사히 강 여름 축제',
  /** 고양이가 모이는 언덕 위 신사 */
  shrine: '히다마리 신사',
} as const;

/**
 * 임시 날짜. 요일은 2026년 달력 기준으로 맞춰 두었지만 작중에 연도는 표시하지 않는다.
 * 공통: 1주 차 월~금 / 루트: 2주 차 월~금 / 후일담: 8월 축제 당일
 */
export const DATES = {
  d1: '7월 6일 월요일',
  d2: '7월 7일 화요일',
  d3: '7월 8일 수요일',
  d4: '7월 9일 목요일',
  d5: '7월 10일 금요일',
  r1: '7월 13일 월요일',
  r2: '7월 14일 화요일',
  r3: '7월 15일 수요일',
  r4: '7월 16일 목요일',
  r5: '7월 17일 금요일',
  fest: '8월 8일 토요일',
} as const;

/** 대사 치환 변수. 스토리에서 {키} / {키:조사} 로 사용 */
export const TEXT_VARS: Readonly<Record<string, string>> = {
  me: NAMES.me.given,
  meFamily: NAMES.me.family,
  osana: NAMES.osana.given,
  osanaFamily: NAMES.osana.family,
  tenko: NAMES.tenko.given,
  tenkoFamily: NAMES.tenko.family,
  school: SETTING.school,
  schoolShort: SETTING.schoolShort,
  classroom: SETTING.classroom,
  town: SETTING.town,
  teacher: SETTING.teacher,
  shop: SETTING.shop,
  festival: SETTING.festival,
  shrine: SETTING.shrine,
  ...DATES,
};

/** 이름표에 표시될 화자 이름 */
export const SPEAKER_NAMES: Record<SpeakerId, string> = {
  me: NAMES.me.given,
  osana: NAMES.osana.given,
  tenko: NAMES.tenko.given,
  teacher: `${SETTING.teacher} 선생님`,
  grandma: '후루카와 할머니',
  classmates: '반 아이들',
  shopkeeper: '가게 아저씨',
};

/** 엔딩 제목 */
export const ENDING_TITLES = {
  osana: '내일도, 그다음 날도',
  tenko: '처음으로 함께 찍힌 사진',
} as const;
