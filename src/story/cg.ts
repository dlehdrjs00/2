/**
 * ★ 이벤트 CG·타이틀 키 비주얼 경로 중앙 관리 ★
 *
 * - 사용자가 제공한 최종 일러스트(placeholder: false). 원본은 저장소에 넣지 않고
 *   `scripts/import-art.py` 로 WebP 로 변환해 public/assets/cg/ 에 둔다.
 * - 썸네일(thumb)은 저장 화면·추억 앨범 목록용 480x270.
 * - 코하루(kh_*) 6장은 인계 패키지의 WebP·썸네일을 그대로 넣었다(다시 인코딩하지 않음). 모두 hidden.
 * - 여덟 엔딩 확장 9장(group_*·end_*)은 코덱스가 제작한 묶음의 WebP·썸네일을 그대로 넣었다
 *   (import-art.py 로 다시 인코딩하지 않음, ART_MANIFEST.json sha256 대조). 제목은 묶음의 suggested_title_ko.
 *   앨범 정책: 코하루가 그려진 6장(group_ice_four·group_frog·group_rain·end_koharu_coin·end_group_*)은 hidden,
 *   group_ice_three(미발견 빙수집)·end_akane_walk·end_hina_walk 는 처음부터 잠긴 칸으로 보인다.
 */
import type { CgId, EndingId, RouteId } from '../engine/types';

export interface CgAsset {
  src: string;
  thumb: string;
  /** 추억 앨범에 표시할 제목 */
  title: string;
  /** 어느 루트에서 보는 CG 인지(공통이면 null, 히든 루트 'group' 은 '네 사람' 묶음) */
  route: RouteId | null;
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
const make = (id: string, title: string, route: RouteId | null, desc: string, opts: { hidden?: boolean } = {}): CgAsset => ({
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

/**
 * 추억 앨범 표시 순서도 이 순서를 따른다(앨범은 루트별로 묶고 묶음 안에서는 이 순서).
 * 시간순: 각 루트 묶음의 끝에 그 루트의 일상 쪽 결말 그림(end_*), 공통 묶음은 kh_draw 뒤에 에피소드 그림(group_*),
 * 히든 루트(네 사람) 그림 end_group_* 는 맨 끝.
 */
export const CGS: Record<CgId, CgAsset> = {
  rain_osana: make('rain_osana', '작은 우산', 'osana', '공통 c6 소나기 — 소꿉친구의 우산을 함께 쓴 하굣길'),
  rain_tenko: make('rain_tenko', '기울어진 우산', 'tenko', '공통 c6 소나기 — 전학생과 우산을 함께 쓴 하굣길'),
  door_osana: make('door_osana', '체인 너머', 'osana', '소꿉친구 루트 o2 — 감기 문병, 체인 걸린 현관문'),
  ramune_osana: make('ramune_osana', '토요일이거든', 'osana', '소꿉친구 루트 o4 — 노을 강변의 라무네'),
  fireworks_osana: make('fireworks_osana', '첫 불꽃', 'osana', '소꿉친구 루트 o6 — 고백 뒤 첫 불꽃'),
  homeward_osana: make('homeward_osana', '처음 바래다주는 길', 'osana', '소꿉친구 루트 o7 — 손잡고 걷는 귀갓길'),
  end_akane_walk: make('end_akane_walk', '세 걸음 뒤에', 'osana', '소꿉친구 루트 일상 결말 — 복숭아 소다를 든 아카네가 데이트 신청을 알아듣고 하굣길에서 돌아보는 순간'),
  cats_tenko: make('cats_tenko', '기다리면 오는 것', 'tenko', '전학생 루트 t1 — 신사 돌계단의 다이후쿠'),
  bench_tenko: make('bench_tenko', '그거, 내 대사인데', 'tenko', '전학생 루트 t4 — 노을 언덕 벤치'),
  selfie_tenko: make('selfie_tenko', '이번엔 둘이 같이', 'tenko', '전학생 루트 t6 — 불꽃 아래 셀카'),
  shutter_tenko: make('shutter_tenko', '셔터가 눌린 순간', 'tenko', '전학생 루트 t6 — 사진에 담긴 순간'),
  polaroid_tenko: make('polaroid_tenko', '첫 장에 넣을 사진', 'tenko', '전학생 루트 t7 — 현상된 즉석사진'),
  end_hina_walk: make('end_hina_walk', '이쪽으로 갈래?', 'tenko', '전학생 루트 일상 결말 — 비 갠 낮 길, 분홍 수첩을 안은 히나가 다음에 함께 걸을 길을 가리키는 순간'),
  // 히든 히로인 코하루(manifest.json 순서·제목). kh_meet·kh_draw 는 해금된 플레이의 공통 장면이라 route null
  kh_meet: make('kh_meet', '금요일의 모퉁이', null, '공통 c7 금요일 하교(해금 시) — 복도 모퉁이에서 어깨가 부딪친 직후', hidden),
  kh_draw: make('kh_draw', '요일을 나눠 가진 자전거', null, '공통 c8 토요일 상점가 추첨(해금 시) — 결과를 듣고 휴지 한 팩을 받는 순간', hidden),
  // 공통 에피소드(토 빙수집 → 월 점심 종이개구리 → 월 방과 후 처마). group_ice_three 만 미발견 경로 그림(코하루 없음)
  group_ice_four: make('group_ice_four', '네 숟가락', null, '공통 e1_ice4 토요일 빙수집(해금 시) — 히나가 딸기빙수를 들어 올리고 네 숟가락이 한 그릇에 모이는 순간', hidden),
  group_ice_three: make('group_ice_three', '주문하기도 전에', null, '공통 e1_ice3 토요일 빙수집 — 히나가 메뉴의 딸기를 짚어 아카네 취향을 맞히는 순간'),
  group_frog: make('group_frog', '딱 한 판만', null, '공통 e2_frog4 월요일 점심 종이개구리 대회(해금 시) — 개구리가 소우타가 든 도시락 뚜껑에 착지하고 아카네·코하루가 하이파이브', hidden),
  group_rain: make('group_rain', '비는 벌써 그쳤는데', null, '공통 e3_rain4 월요일 방과 후 처마(해금 시) — 비가 그치고 햇빛이 돌아왔는데 아무도 먼저 일어나지 않는 순간', hidden),
  kh_relay: make('kh_relay', '두 사람 글씨', 'koharu', '후배 루트 k5 — 문구점 앞, 두 사람의 손글씨 안내판', hidden),
  kh_confession: make('kh_confession', '마지막 등롱 아래', 'koharu', '후배 루트 k6 — 고백에 대답하는 순간(첫 불꽃 전)', hidden),
  kh_home: make('kh_home', '오른손', 'koharu', '후배 루트 k7 — 귀갓길에 손을 잡은 뒤', hidden),
  kh_date: make('kh_date', '일요일은 둘이서', 'koharu', '후배 루트 k8 — 첫 데이트 장소(문구점)에 도착하며', hidden),
  end_koharu_coin: make('end_koharu_coin', '네 옆의 빈 의자', 'koharu', '후배 루트 일상 결말 — 마술이 끝나고 동전 든 연보라 필통을 한 손에, 다른 손으로 의자를 당겨 주는 순간', hidden),
  // 히든 루트(네 사람). route 'group' 묶음은 그 묶음의 그림을 하나라도 보기 전에는 앨범에 없다
  end_group_fireworks: make('end_group_fireworks', '불꽃이 오르기 전에', 'group', '네 사람 루트 축제 결말 — 세 사람의 대답이 모두 끝난 뒤 첫 불꽃 효과음에 맞춰(소우타의 눈으로 본 세 사람)', hidden),
  end_group_morning: make('end_group_morning', '내일도 넷이서 갈래?', 'group', '네 사람 루트 일상 결말 — 개학 첫날 모퉁이에서 넷이 웃으며 등교하는 순간', hidden),
};

export const CG_ORDER = Object.keys(CGS) as CgId[];

/**
 * 코하루가 그려진 CG. 코하루를 만나기 전(kh.met !== true)에는 미리 불러오기·앨범·검증기의 흔적 검사에서
 * 이 목록으로 막는다. kh_ 로 시작하는 6장 + 여덟 엔딩 확장 6장(이름에 kh_ 가 없는 그림)
 */
export const KOHARU_DRAWN_CGS: readonly CgId[] = [
  ...CG_ORDER.filter((id) => id.startsWith('kh_')),
  'group_ice_four',
  'group_frog',
  'group_rain',
  'end_koharu_coin',
  'end_group_fireworks',
  'end_group_morning',
];

/** 타이틀 화면 키 비주얼 */
export const KEY_VISUAL = {
  src: `${DIR}/kv.webp`,
  thumb: `${DIR}/thumb/kv.webp`,
  placeholder: false,
  desc: '타이틀 키 비주얼 — 여름 하늘 아래 등굣길의 두 히로인',
} as const;

/**
 * 엔딩 화면 폴라로이드에 넣을 대표 CG(엔딩 id 기준, 설계 계약 7절).
 * 축제 쪽 세 엔딩은 히로인의 얼굴이 크게 보이는 그림으로 고른다(작은 폴라로이드에서도 표정이 읽히게).
 * 아카네는 엔딩 직전 장면 o7 의 「처음 바래다주는 길」(돌아보며 웃는 얼굴, 맞잡은 손).
 * 코하루는 엔딩 장면 k8 의 「일요일은 둘이서」(엔딩 제목과 같은 그림, manifest ending.cg).
 * 일상 쪽 결말과 히든 루트의 두 결말은 그 결말의 마지막 CG.
 */
export const ENDING_CG: Record<EndingId, CgId> = {
  osana: 'homeward_osana',
  osana_daily: 'end_akane_walk',
  tenko: 'polaroid_tenko',
  tenko_daily: 'end_hina_walk',
  koharu: 'kh_date',
  koharu_daily: 'end_koharu_coin',
  group_festival: 'end_group_fireworks',
  group_daily: 'end_group_morning',
};
