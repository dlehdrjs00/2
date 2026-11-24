/**
 * 화면 배치 계산 (순수 함수 + 적용 함수)
 *
 * - overlay 모드(가로 화면): 16:9 무대를 안전 영역 안에 최대한 크게(contain) 놓고 대사창을 무대 하단에 겹친다.
 * - below 모드(세로·정사각형에 가까운 화면): 무대를 위에, 대사창을 무대 아래 남는 공간에 둔다.
 * - 글자 크기는 무대 크기에 비례하되 최소 16px 을 보장한다(단순 축소로 글자가 작아지지 않게).
 *   최소 글자 크기를 지키느라 대사창이 커지면 무대 대비 비율이 커질 뿐 글자는 줄지 않는다.
 * - 이름표 탭(왼쪽)과 빠른 메뉴 탭(오른쪽)은 대사창 위 테두리에 붙어 같은 높이 띠(btn)를 나눠 쓴다
 *   (무대 위쪽 HUD 줄은 없앰 — 일러스트의 얼굴 부분을 비운다). 띠의 위끝이 hy = ty − btn 이다.
 * - 선택지 목록은 무대 위 여백 언저리(sy + m − 1)부터 그 탭 띠 바로 위(hy − 1)까지만 쓴다(빠른 메뉴·이름표·대사창과 겹치지 않게).
 *   높이가 모자라는 화면은 dense 단계로 버튼을 촘촘하게 하거나 가로로 나란히 놓고, 그래도 넘치면 목록 안에서
 *   스크롤된다(styles/play.css).
 * - 글자 크기 설정(textScale 배율 1 / 1.12 / 1.25)은 fs 의 상·하한까지 함께 키운다. 3줄을 넘는 문장은
 *   textbox.ts 의 넘침 안전장치가 대사창을 위로 늘려 처리한다. 수치는 docs/UI_DESIGN.md 9.1 과 같다.
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
  /** 선택지 목록 영역: 무대 위 여백 언저리(cy = sy + m − CHOICE_LIFT)부터 탭 띠 바로 위(hy − CHOICE_CLEAR)까지. 위아래 안쪽 여백 CHOICE_PAD_Y 포함 */
  cx: number;
  cy: number;
  cw: number;
  ch: number;
  /** 호환용(= cy − sy). 예전 HUD 줄 높이 */
  cband: number;
  /**
   * 선택지 배치 단계(한 줄짜리 버튼 기준).
   * 0: 보통 크기로 3개가 들어감 · 1: 촘촘하게 하면 3개가 들어감 · 2: 촘촘하게 2개까지(3개면 가로로 나란히) · 3: 항상 가로로 나란히
   */
  dense: Density;
  fs: number;
  /** 무대 안 여백 max(8, sh × 0.022) */
  m: number;
  /** 이름표·빠른 메뉴 탭 높이(터치 44~48px) */
  btn: number;
  /** 탭 띠의 위끝(= ty − btn) */
  hy: number;
  /** 빠른 메뉴 탭의 오른쪽 여백(화면 오른쪽 끝에서) */
  hr: number;
  /** 빠른 메뉴 폭 단계: 아이콘+글자 8개 / 글자 8개 / 4개 */
  qm: QuickMenuWidth;
  /**
   * 이벤트 CG 구도. 'low' = 대사창이 무대에 겹치고 탭 띠 위끝이 무대 높이의 CG_LOW_BAND 보다 위(휴대폰 가로 등).
   * 이때 styles/play.css 가 CG 마다 정한 확대·위치로 얼굴·동작을 탭 띠 위로 올린다. 그 밖(넓은 화면·세로 배치)은 'full'
   */
  cgfit: CgFit;
}

export type CgFit = 'full' | 'low';
/** 탭 띠 위끝 / 무대 높이가 이보다 작으면 CG 구도를 'low' 로(667×375 0.58 · 844×390 0.60 · 932×430 0.63 · 1280×720 0.70) */
export const CG_LOW_BAND = 0.66;

export type QuickMenuWidth = 'icons' | 'full' | 'compact';

export interface LayoutOptions {
  /** 글자 크기 배율(settings.textScaleFactor 결과: 1 / 1.12 / 1.25). 생략하면 1 */
  textScale?: number;
}

export const MIN_FONT = 16;
const ASPECT = 16 / 9;

/** 대사창 치수(styles/play.css .textbox / .textbox .text 와 같아야 함): 위+아래 안쪽 여백(em), 줄 높이(em), 테두리(px) */
export const TEXT_PAD_EM = 0.95 + 0.6;
export const TEXT_LINE_EM = 1.62;
export const TEXT_BORDER = 1;
/** 대사창이 글자 n줄을 담는 데 필요한 높이(테두리 포함, 소수점 반올림 여유 0.5px) */
export function textBoxHeightFor(lines: number, fs: number): number {
  return fs * (TEXT_PAD_EM + TEXT_LINE_EM * lines) + TEXT_BORDER * 2 + 0.5;
}

/** 선택지(styles/play.css .choices / .choice 와 같아야 함) */
export const CHOICE_PAD_Y = 4;
export const CHOICE_MIN_H = 48;
export const CHOICE_DENSE_MIN_H = 44;
export const CHOICE_GAP_EM = 0.75;
export const CHOICE_DENSE_GAP_EM = 0.4;
/**
 * 선택지 목록의 위·아래 끝: 위끝은 무대 위 여백(sy + m)보다 CHOICE_LIFT 위, 아래끝은 탭 띠(이름표·빠른 메뉴)보다
 * CHOICE_CLEAR 위. 버튼은 목록 가운데에 놓이므로 위아래를 같은 양만큼 넓히면 버튼 자리는 그대로이고(예전 sy + m ~ hy − 2 와
 * 가운데가 같다) 3단을 놓을 여유만 2px 늘어난다. 740×320 의 촘촘한 3단 세로 배치(dense 1) 여유 0.14px → 2.14px.
 * 버튼과 탭 사이 = 목록 안쪽 여백(CHOICE_PAD_Y 4px) + CHOICE_CLEAR + 남는 높이의 절반: 단계 경계에서도 5px
 * (포커스 테 3px + 띄움 2px 가 탭 띠를 넘지 않음), 740×320 에서는 6.07px. 목록 경계에서 잘리던 버튼 그림자·포커스 테는
 * 1px 덜 잘린다.
 */
const CHOICE_CLEAR = 1;
const CHOICE_LIFT = 1;
/** 빠른 메뉴 폭 단계 경계(대사창 폭, px). 실측 탭 폭: 아이콘+글자 약 616px, 글자만 약 429px */
const QM_ICONS_MIN_TW = 900;
const QM_FULL_MIN_TW = 620;

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

/** 탭 높이: 글자에 비례하되 터치 44px 이상(휴대폰 가로에서 탭을 빗나가 대사가 넘어가지 않게), 무대를 덜 가리게 48px 이하 */
export const TAB_MIN = 44;
export const TAB_MAX = 48;
function tabHeight(fs: number): number {
  return clamp(fs * 1.75, TAB_MIN, TAB_MAX);
}

function quickMenuWidth(tw: number): QuickMenuWidth {
  return tw >= QM_ICONS_MIN_TW ? 'icons' : tw >= QM_FULL_MIN_TW ? 'full' : 'compact';
}

/**
 * @param safe 안전 영역(노치 등). 무대·대사창은 이 안에 놓는다
 * @param opts 선택. textScale = 글자 크기 배율(하위 호환: 생략하면 1)
 */
export function computeLayout(vw: number, vh: number, safe: Insets, opts: LayoutOptions = {}): Layout {
  const aw = Math.max(1, vw - safe.l - safe.r);
  const ah = Math.max(1, vh - safe.t - safe.b);
  const ratio = aw / ah;
  const scale = Number.isFinite(opts.textScale) && (opts.textScale as number) > 0 ? (opts.textScale as number) : 1;

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
    const fs = clamp(sh * 0.034 * scale, MIN_FONT * scale, 26 * scale);
    const m = Math.max(8, sh * 0.022);
    // 기본 높이는 무대의 22%(창 위끝을 낮춰 인물을 덜 가림). 3줄 용량은 늘 보장한다
    const th = clamp(Math.max(sh * 0.22, textBoxHeightFor(3, fs)), 0, sh * 0.45);
    const tw = Math.min(sw - m * 2, fs * 46);
    const tx = sx + (sw - tw) / 2;
    const ty = sy + sh - th - m;
    const btn = tabHeight(fs);
    const hy = ty - btn;
    // 선택지: 무대 위 여백 ~ 탭 띠 위. 무대가 높이에 맞춰 줄어 좌우가 비면(레터박스) 그 폭까지 써서 줄바꿈을 줄인다
    const cy = sy + m - CHOICE_LIFT;
    const ch = Math.max(0, hy - CHOICE_CLEAR - cy);
    const wide = aw - sw > 2;
    const cx = wide ? safe.l + m : sx;
    const cw = wide ? aw - m * 2 : sw;
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
      m,
      btn,
      hy,
      // 탭 오른쪽 = 대사창 오른쪽 끝에서 모서리 반경(fs×0.55) + 오목 이음새 폭(10px) 안쪽
      hr: vw - (tx + tw) + fs * 0.55 + 10,
      qm: quickMenuWidth(tw),
      cgfit: (hy - sy) / sh < CG_LOW_BAND ? 'low' : 'full',
    };
  }

  // ---- 세로/정사각형: below ----
  const fs = clamp(aw * 0.042 * scale, MIN_FONT * scale, 22 * scale);
  const btn = tabHeight(fs);
  // 무대와 대사창 사이: 8px + 이름표·빠른 메뉴 탭 띠
  const gap = btn + 8;
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
  const m = 8;
  const hy = ty - btn;
  // 선택지: 무대 위 여백부터 탭 띠 바로 위까지(무대와 대사창 사이 간격 포함), 안전 영역 폭 전체
  const cy = sy + m - CHOICE_LIFT;
  const ch = Math.max(0, hy - CHOICE_CLEAR - cy);
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
    m,
    btn,
    hy,
    hr: vw - (tx + tw) + fs * 0.55 + 10,
    qm: quickMenuWidth(tw),
    // 대사창이 무대 아래에 있어 CG 를 가리지 않는다
    cgfit: 'full',
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
  s.setProperty('--m', px(L.m));
  s.setProperty('--btn', px(L.btn));
  s.setProperty('--hy', px(L.hy));
  s.setProperty('--hr', px(L.hr));
  root.dataset.layout = L.mode;
  root.dataset.dense = String(L.dense);
  root.dataset.qm = L.qm;
  root.dataset.cgfit = L.cgfit;
}

/** 휴대폰 세로 화면인지(태블릿·PC 의 세로 창은 안내하지 않음) */
export function isPhonePortrait(vw: number, vh: number): boolean {
  if (vh <= vw) return false;
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  return coarse && Math.min(vw, vh) < 600;
}
