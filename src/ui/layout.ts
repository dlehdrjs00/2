/**
 * 화면 배치 계산 (순수 함수 + 적용 함수)
 *
 * - overlay 모드(가로 화면): 16:9 무대를 안전 영역 안에 최대한 크게(contain) 놓고 대사창을 무대 하단에 겹친다.
 * - below 모드(세로·정사각형에 가까운 화면): 무대를 위에, 대사창을 무대 아래 남는 공간에 둔다.
 * - 글자 크기는 무대 크기에 비례하되 최소 16px 을 보장한다(단순 축소로 글자가 작아지지 않게).
 *   최소 글자 크기를 지키느라 대사창이 커지면 무대 대비 비율이 커질 뿐 글자는 줄지 않는다.
 */
export interface Insets {
  t: number;
  r: number;
  b: number;
  l: number;
}

export interface Layout {
  mode: 'overlay' | 'below';
  vw: number;
  vh: number;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  tx: number;
  ty: number;
  tw: number;
  th: number;
  /** 선택지 영역 높이(무대 위쪽부터) */
  ch: number;
  fs: number;
  btn: number;
  hy: number;
  hr: number;
}

export const MIN_FONT = 16;
const ASPECT = 16 / 9;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function computeLayout(vw: number, vh: number, safe: Insets): Layout {
  const aw = Math.max(1, vw - safe.l - safe.r);
  const ah = Math.max(1, vh - safe.t - safe.b);
  const ratio = aw / ah;

  if (ratio >= 1.3) {
    // ---- 가로: overlay ----
    let sw = aw;
    let sh = aw / ASPECT;
    if (sh > ah) {
      sh = ah;
      sw = ah * ASPECT;
    }
    const sx = safe.l + (aw - sw) / 2;
    const sy = safe.t + (ah - sh) / 2;
    const fs = clamp(sh * 0.034, MIN_FONT, 26);
    const margin = Math.max(8, sh * 0.022);
    const th = clamp(Math.max(sh * 0.265, fs * 6.5), 0, sh * 0.45);
    const tw = Math.min(sw - margin * 2, fs * 46);
    const tx = sx + (sw - tw) / 2;
    const ty = sy + sh - th - margin;
    const btn = clamp(fs * 1.9, 40, 46);
    return {
      mode: 'overlay',
      vw,
      vh,
      sx,
      sy,
      sw,
      sh,
      tx,
      ty,
      tw,
      th,
      ch: ty - sy - fs * 0.5,
      fs,
      btn,
      hy: sy + margin * 0.6,
      hr: vw - (sx + sw) + margin * 0.6,
    };
  }

  // ---- 세로/정사각형: below ----
  const fs = clamp(aw * 0.042, MIN_FONT, 22);
  const gap = Math.max(10, fs * 0.9);
  let sw = aw;
  let sh = sw / ASPECT;
  const minTh = fs * 7.2;
  if (sh + gap + minTh > ah) {
    sh = Math.max(ah * 0.45, ah - gap - minTh);
    sw = sh * ASPECT;
  }
  const th = clamp(ah - sh - gap - 10, minTh, fs * 10);
  const total = sh + gap + th;
  const sx = safe.l + (aw - sw) / 2;
  const sy = safe.t + Math.max(0, (ah - total) / 2);
  const tw = Math.min(aw - 16, fs * 40);
  const tx = safe.l + (aw - tw) / 2;
  const ty = sy + sh + gap;
  const btn = clamp(fs * 1.9, 40, 44);
  return { mode: 'below', vw, vh, sx, sy, sw, sh, tx, ty, tw, th, ch: sh, fs, btn, hy: sy + 6, hr: vw - (sx + sw) + 6 };
}

/** CSS env(safe-area-inset-*) 실측 */
export function measureSafeArea(probe: HTMLElement): Insets {
  const cs = getComputedStyle(probe);
  const n = (v: string) => parseFloat(v) || 0;
  return { t: n(cs.paddingTop), r: n(cs.paddingRight), b: n(cs.paddingBottom), l: n(cs.paddingLeft) };
}

export function applyLayout(root: HTMLElement, L: Layout): void {
  const px = (v: number) => `${Math.round(v * 100) / 100}px`;
  const s = root.style;
  s.setProperty('--sx', px(L.sx));
  s.setProperty('--sy', px(L.sy));
  s.setProperty('--sw', px(L.sw));
  s.setProperty('--sh', px(L.sh));
  s.setProperty('--tx', px(L.tx));
  s.setProperty('--ty', px(L.ty));
  s.setProperty('--tw', px(L.tw));
  s.setProperty('--th', px(L.th));
  s.setProperty('--ch', px(L.ch));
  s.setProperty('--fs', px(L.fs));
  s.setProperty('--btn', px(L.btn));
  s.setProperty('--hy', px(L.hy));
  s.setProperty('--hr', px(L.hr));
  s.setProperty('--chip-top', px(L.hy - L.sy + L.btn + 8));
  root.dataset.layout = L.mode;
}

/** 휴대폰 세로 화면인지(태블릿·PC 의 세로 창은 안내하지 않음) */
export function isPhonePortrait(vw: number, vh: number): boolean {
  if (vh <= vw) return false;
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  return coarse && Math.min(vw, vh) < 600;
}
