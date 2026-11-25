/** 화면들이 함께 쓰는 값·도우미 */
import type { HeroineId } from '../../engine/types';

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
