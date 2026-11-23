/**
 * 화면 배치 계산 (순수 함수 + 적용 함수)
 *
 * - overlay 모드(가로 화면): 16:9 무대를 안전 영역 안에 최대한 크게(contain) 놓고 대사창을 무대 하단에 겹친다.
 * - below 모드(세로·정사각형에 가까운 화면): 무대를 위에, 대사창을 무대 아래 남는 공간에 둔다.
 * - 글자 크기는 무대 크기에 비례하되 최소 16px 을 보장한다(단순 축소로 글자가 작아지지 않게).
 *   최소 글자 크기를 지키느라 대사창이 커지면 무대 대비 비율이 커질 뿐 글자는 줄지 않는다.
 * - 선택지 목록은 HUD 줄 아래부터 대사창 위까지만 쓴다(HUD·대사창과 겹치지 않게). 높이가 모자라는 화면은
 *   dense 단계로 버튼을 촘촘하게 하거나 가로로 나란히 놓고, 그래도 넘치면 목록 안에서 스크롤된다(styles.css).
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
  /** 선택지 목록 영역: HUD 줄 아래(cy)부터 대사창 바로 위까지. 위아래 안쪽 여백 CHOICE_PAD_Y 포함 */
  cx: number;
  cy: number;
  cw: number;
  ch: number;
  /** 선택지 표시 중 어둡게 덮을 cy 위쪽 띠(무대 위 HUD 줄) 높이 */
  cband: number;
  /**
   * 선택지 배치 단계(한 줄짜리 버튼 기준).
   * 0: 보통 크기로 3개가 들어감 · 1: 촘촘하게 하면 3개가 들어감 · 2: 촘촘하게 2개까지(3개면 가로로 나란히) · 3: 항상 가로로 나란히
   */
  dense: Density;
  fs: number;
  btn: number;
  hy: number;
  hr: number;
}

export const MIN_FONT = 16;
const ASPECT = 16 / 9;

/** 대사창 치수(styles.css .textbox / .textbox .text 와 같아야 함): 위+아래 안쪽 여백(em), 줄 높이(em), 테두리(px) */
export const TEXT_PAD_EM = 0.95 + 0.6;
export const TEXT_LINE_EM = 1.62;
export const TEXT_BORDER = 1;
/** 대사창이 글자 n줄을 담는 데 필요한 높이(테두리 포함, 소수점 반올림 여유 0.5px) */
export function textBoxHeightFor(lines: number, fs: number): number {
  return fs * (TEXT_PAD_EM + TEXT_LINE_EM * lines) + TEXT_BORDER * 2 + 0.5;
}

/** 선택지(styles.css .choices / .choice 와 같아야 함) */
export const CHOICE_PAD_Y = 4;
export const CHOICE_MIN_H = 48;
export const CHOICE_DENSE_MIN_H = 44;
export const CHOICE_GAP_EM = 0.75;
export const CHOICE_DENSE_GAP_EM = 0.4;
/** HUD 줄·대사창과 선택지 목록 사이 간격 */
const CHOICE_CLEAR = 4;

export type Density = 0 | 1 | 2 | 3;

/** 선택지 목록에 실제로 버튼을 놓을 수 있는 높이 */
export function choiceSpace(L: Pick<Layout, 'ch'>): number {
  return L.ch - CHOICE_PAD_Y * 2;
}

/** 한 줄짜리 선택지 n개를 세로로 놓는 데 필요한 높이 */
export function choiceStackHeight(n: number, fs: number, dense: boolean): number {
  return dense ? CHOICE_DENSE_MIN_H * n + fs * CHOICE_DENSE_GAP_EM * (n - 1) : CHOICE_MIN_H * n + fs * CHOICE_GAP_EM * (n - 1);
}

function choiceDensity(space: number, fs: number): Density {
  if (space >= choiceStackHeight(3, fs, false)) return 0;
  if (space >= choiceStackHeight(3, fs, true)) return 1;
  if (space >= choiceStackHeight(2, fs, true)) return 2;
  return 3;
}

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
    const th = clamp(Math.max(sh * 0.265, textBoxHeightFor(3, fs)), 0, sh * 0.45);
    const tw = Math.min(sw - margin * 2, fs * 46);
    const tx = sx + (sw - tw) / 2;
    const ty = sy + sh - th - margin;
    const btn = clamp(fs * 1.9, 40, 46);
    const hy = sy + margin * 0.6;
    // 선택지: HUD 줄 아래 ~ 대사창 위. 무대가 높이에 맞춰 줄어 좌우가 비면(레터박스) 그 폭까지 써서 줄바꿈을 줄인다
    const cy = hy + btn + CHOICE_CLEAR;
    const ch = Math.max(0, ty - CHOICE_CLEAR - cy);
    const wide = aw - sw > 2;
    const cx = wide ? safe.l + margin : sx;
    const cw = wide ? aw - margin * 2 : sw;
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
      cx,
      cy,
      cw,
      ch,
      cband: cy - sy,
      dense: choiceDensity(choiceSpace({ ch }), fs),
      fs,
      btn,
      hy,
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
  const hy = sy + 6;
  // 선택지: HUD 줄 아래부터 무대 아래 대사창 바로 위까지(무대와 대사창 사이 간격 포함), 안전 영역 폭 전체
  const cy = hy + btn + CHOICE_CLEAR;
  const ch = Math.max(0, ty - CHOICE_CLEAR - cy);
  const cx = safe.l + 8;
  const cw = aw - 16;
  return {
    mode: 'below',
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
    cx,
    cy,
    cw,
    ch,
    cband: cy - sy,
    dense: choiceDensity(choiceSpace({ ch }), fs),
    fs,
    btn,
    hy,
    hr: vw - (sx + sw) + 6,
  };
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
  s.setProperty('--cx', px(L.cx));
  s.setProperty('--cy', px(L.cy));
  s.setProperty('--cw', px(L.cw));
  s.setProperty('--ch', px(L.ch));
  s.setProperty('--cband', px(L.cband));
  s.setProperty('--fs', px(L.fs));
  s.setProperty('--btn', px(L.btn));
  s.setProperty('--hy', px(L.hy));
  s.setProperty('--hr', px(L.hr));
  s.setProperty('--chip-top', px(L.hy - L.sy + L.btn + 8));
  root.dataset.layout = L.mode;
  root.dataset.dense = String(L.dense);
}

/** 휴대폰 세로 화면인지(태블릿·PC 의 세로 창은 안내하지 않음) */
export function isPhonePortrait(vw: number, vh: number): boolean {
  if (vh <= vw) return false;
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  return coarse && Math.min(vw, vh) < 600;
}
