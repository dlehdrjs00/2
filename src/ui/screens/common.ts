/** 화면들이 함께 쓰는 값·도우미 */
import type { EndingKind, HeroineId, RouteId } from '../../engine/types';

/**
 * 히로인 → 인물 색 토큰(docs/UI_DESIGN.md 3장). -1 은 흰 글자를 올리는 바탕, -2 는 밝은 쪽.
 * 코하루는 민트(유카타 오비의 청록)를 바탕, 살구(유카타 바탕색)는 장식 토큰 --koharu-apricot 으로 둔다
 * (살구를 바탕으로 쓰면 아카네의 붉은 바탕과 배지·메달에서 구별되지 않는다).
 */
export const HEROINE_COLORS: Record<HeroineId, { c1: string; c2: string }> = {
  osana: { c1: 'var(--akane-1)', c2: 'var(--akane-2)' },
  tenko: { c1: 'var(--hina-1)', c2: 'var(--hina-2)' },
  koharu: { c1: 'var(--koharu-1)', c2: 'var(--koharu-2)' },
};

/**
 * 루트 → 색 토큰. route 가 'group' 일 수 있는 곳(타이틀 배지·저장 칸·엔딩 화면·앨범 묶음·뷰어)은 HEROINE_COLORS 대신 이것을 쓴다.
 * 히든 루트('group', 네 사람)는 --group-1·--group-2(tokens.css: 기존 소우타 색 --me-1·--me-2 를 그대로 가리킨다).
 *   - 파랑(색상 약 210°)은 세 히로인 색(빨강 약 5° · 분홍 약 335° · 민트 약 170°) 어느 것과도 겹치지 않아, 배지·메달에
 *     나란히 놓여도 서로 구별되고 누구 한 사람의 루트처럼 보이지 않는다(세 사람 색을 섞거나 빌리지 않는다).
 *   - 네 사람 루트는 소우타가 세 사람과 함께 '넷'으로 서는 루트라, 주인공 색을 루트 색으로 쓰는 근거가 된다.
 *   - -1 은 흰 글자 5.6:1(이름표 바탕 기준 4.5:1 이상), 공통 묶음(npc 슬레이트, 채도 낮음)과는 채도로 구별된다.
 */
export const ROUTE_COLORS: Record<RouteId, { c1: string; c2: string }> = {
  ...HEROINE_COLORS,
  group: { c1: 'var(--group-1)', c2: 'var(--group-2)' },
};

/** 모르는 루트 값이 와도 색 조회가 TypeError 를 내지 않게(공통 색) */
export const UNKNOWN_ROUTE_COLORS = { c1: 'var(--npc-1)', c2: 'var(--npc-2)' } as const;

export function routeColors(route: RouteId | null | undefined): { c1: string; c2: string } {
  return (route ? ROUTE_COLORS[route] : undefined) ?? UNKNOWN_ROUTE_COLORS;
}

/** 히든 루트(네 사람)의 표시 이름 */
export const GROUP_ROUTE_NAME = '네 사람';

/** 루트 표시 이름: 히로인 루트는 그 히로인 이름, 히든 루트는 '네 사람' */
export function routeName(route: RouteId, heroineName: (h: HeroineId) => string): string {
  return route === 'group' ? GROUP_ROUTE_NAME : heroineName(route);
}

/** 결말 갈래 이름(타이틀 배지·엔딩 배지에서 같은 루트의 두 결말을 구별한다) */
export const ENDING_KIND_NAMES: Record<EndingKind, string> = { festival: '축제', daily: '일상' };

/** 엔딩 짧은 이름: '아카네 · 축제', '네 사람 · 일상' */
export function endingLabel(route: RouteId, kind: EndingKind, heroineName: (h: HeroineId) => string): string {
  return `${routeName(route, heroineName)} · ${ENDING_KIND_NAMES[kind] ?? kind}`;
}

export function prefersReducedMotion(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * 날짜가 든 문구에서 '7월 10일'과 그 뒤 장소를 뽑는다.
 * 예) '몇 주 뒤, 여름방학 · 8월 8일 토요일 · 아사히 강 여름 축제' → { md: '8월 8일', place: '아사히 강 여름 축제' }
 */
export function splitDate(text: string): { md: string; place: string } | null {
  const m = /(\d{1,2}월 \d{1,2}일)(?: [월화수목금토일]요일)?(?:\s*·\s*([^·]+))?/.exec(text);
  if (!m) return null;
  return { md: m[1], place: (m[2] ?? '').trim() };
}

/** 앱으로 설치했거나 브라우저 자체가 전체화면이면(F11 등) 전체화면 메뉴가 필요 없다 */
export function displayIsFullscreenApp(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches;
  } catch {
    return false;
  }
}

export function fullscreenSupported(): boolean {
  const d = document as Document & { webkitFullscreenEnabled?: boolean };
  return !!(d.fullscreenEnabled || d.webkitFullscreenEnabled);
}

export function isFullscreen(): boolean {
  const d = document as Document & { webkitFullscreenElement?: Element };
  return !!(document.fullscreenElement || d.webkitFullscreenElement);
}

/**
 * 전체화면 켜기·끄기를 보여 줄지.
 * 지원하지 않는 브라우저, 또는 앱·브라우저 자체가 이미 전체화면(display-mode)인데 그게 이 페이지가 켠 전체화면이 아닐 때는 숨긴다.
 */
export function showFullscreenControl(): boolean {
  if (!fullscreenSupported()) return false;
  return isFullscreen() || !displayIsFullscreenApp();
}

export async function toggleFullscreen(): Promise<void> {
  try {
    const d = document as Document & { webkitExitFullscreen?: () => void };
    const de = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
    if (isFullscreen()) {
      if (document.exitFullscreen) await document.exitFullscreen();
      else d.webkitExitFullscreen?.();
    } else if (de.requestFullscreen) await de.requestFullscreen({ navigationUI: 'hide' });
    else de.webkitRequestFullscreen?.();
  } catch {
    /* 지원하지 않거나 거부됨: 무시 */
  }
}
