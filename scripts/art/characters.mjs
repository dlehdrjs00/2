#!/usr/bin/env node
/**
 * PLACEHOLDER 캐릭터 스프라이트 생성기 (의존성 없음, Node ESM)
 *
 *   node scripts/art/characters.mjs
 *
 * 출력: public/assets/placeholder/char/{osana|tenko}/{outfit}_{hair}_{expr}.svg (30개)
 * 최종 일러스트가 나오면 src/story/assets.ts 의 SPRITE_SETS 만 교체하면 된다.
 *
 * 구성: 레이어 함수(뒷머리 → 몸/의상 → 얼굴 → 눈·입·홍조 → 앞머리 → 눈썹 → 액세서리 → 효과)를
 * 조합한다. 표정 레이어(눈·눈썹·입·홍조·효과)만 바뀌고 나머지는 모든 표정에서 바이트 단위로 같다.
 * 좌표계: viewBox 0 0 800 1200, 얼굴 중심 x=400, 머리 꼭대기 y≈66, 허벅지 중간(y=1200)에서 잘림.
 * 외부 리소스·글꼴·텍스트·<use> 참조 없음.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_DIR = join(ROOT, 'public', 'assets', 'placeholder', 'char');
const EXPRS = ['neutral', 'smile', 'fluster', 'shy', 'pout', 'sad'];

/* ------------------------------------------------------------------ */
/* 기하 도우미                                                          */
/* ------------------------------------------------------------------ */
const rd = (n) => Math.round(n * 10) / 10;
let PREC = 1; // 0 이면 정수 좌표(머리카락 등 큰 도형의 파일 크기 절약)
const rq = (n) => (PREC ? rd(n) : Math.round(n));
const P = (p) => `${rq(p[0])} ${rq(p[1])}`;
const mx = (p) => [800 - p[0], p[1]];
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** 절대좌표 M/L/C/Q/T/Z 로만 된 path 문자열을 x=400 기준으로 좌우 반전 */
const mirrorD = (d) => d.replace(/(-?\d+(?:\.\d+)?)[ ,]+(-?\d+(?:\.\d+)?)/g, (_, x, y) => `${rd(800 - +x)} ${y}`);

function cubic(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return [
    u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
  ];
}

/** Catmull-Rom 스플라인(열린 곡선) → 'C..' 세그먼트 문자열 (시작 M 미포함) */
function cr(pts) {
  const n = pts.length;
  const g = (i) => pts[Math.max(0, Math.min(n - 1, i))];
  let d = '';
  for (let i = 0; i < n - 1; i++) {
    const p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2);
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${P(c1)} ${P(c2)} ${P(p2)}`;
  }
  return d;
}
function closed(pts) {
  const n = pts.length;
  const g = (i) => pts[(i + n) % n];
  let d = `M${P(pts[0])}`;
  for (let i = 0; i < n; i++) {
    const p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2);
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${P(c1)} ${P(c2)} ${P(p2)}`;
  }
  return d + 'Z';
}
/** 좌우 대칭 닫힌 도형: start 는 중심축 위, segs 는 오른쪽 절반 [c1,c2,end] (끝점도 중심축) */
function sym(start, segs) {
  let d = `M${P(start)}`;
  for (const [c1, c2, e] of segs) d += `C${P(c1)} ${P(c2)} ${P(e)}`;
  const pts = [start, ...segs.map((s) => s[2])];
  for (let i = segs.length - 1; i >= 0; i--) {
    const [c1, c2] = segs[i];
    d += `C${P(mx(c2))} ${P(mx(c1))} ${P(mx(pts[i]))}`;
  }
  return d + 'Z';
}
/** 중심선 점 + 폭 → 리본. fill: 닫힌 외곽, line: 시작 단면을 뺀 외곽선 */
function ribbon(pts, ws, from = 0) {
  const n = pts.length;
  const L = [], R = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const len = Math.hypot(tx, ty) || 1;
    tx /= len; ty /= len;
    const w = ws[i] / 2;
    L.push([pts[i][0] - ty * w, pts[i][1] + tx * w]);
    R.push([pts[i][0] + ty * w, pts[i][1] - tx * w]);
  }
  const Rr = R.slice().reverse();
  const line = `M${P(L[0])}${cr(L)}L${P(Rr[0])}${cr(Rr)}`;
  const Lp = L.slice(from), Rp = R.slice(from).reverse();
  const part = from ? `M${P(Lp[0])}${cr(Lp)}L${P(Rp[0])}${cr(Rp)}` : line;
  return { fill: line + 'Z', line: part };
}
/** Catmull-Rom 중심선 평가 */
function crAt(pts, t) {
  const n = pts.length - 1;
  const f = Math.min(n - 1e-9, Math.max(0, t * n));
  const i = Math.floor(f), u = f - i;
  const g = (k) => pts[Math.max(0, Math.min(n, k))];
  const p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2);
  return cubic(p1, [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6], p2, u);
}
const bz = (r, c1, c2, t) => (u) => cubic(r, c1, c2, t, u);
const poly = (pts) => (u) => crAt(pts, u);
/** 물결 중심선 */
function wavy(a, b, n, amp, phase = 0) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = lerp(a, b, t);
    p[0] += Math.sin(t * Math.PI * (n / 2) + phase) * amp * Math.min(1, t * 2.5);
    pts.push(p);
  }
  return pts;
}
const offsetAt = (fn, t, off) => {
  const p = fn(t), a = fn(Math.max(0, t - 0.01)), b = fn(Math.min(1, t + 0.01));
  const tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1;
  return [p[0] - (ty / l) * off, p[1] + (tx / l) * off];
};

const el = (tag, attrs, inner) => {
  const a = Object.entries(attrs).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => ` ${k}="${v}"`).join('');
  return inner === undefined ? `<${tag}${a}/>` : `<${tag}${a}>${inner}</${tag}>`;
};
/** 절대좌표 경로(M/L/C/Q/T/Z)를 상대좌표로 직렬화해 크기를 줄인다 */
function relD(d) {
  const toks = d.match(/[MLCQTZ]|-?\d*\.?\d+/g);
  if (!toks || /[^MLCQTZ0-9.\s,-]/.test(d)) return d;
  const AR = { M: 2, L: 2, T: 2, Q: 4, C: 6 };
  const num = (v) => String(Math.round(v * 10) / 10);
  let out = '', cx = 0, cy = 0, sx = 0, sy = 0, cmd = '', last = '', i = 0;
  while (i < toks.length) {
    const t = toks[i];
    if (/[A-Z]/.test(t)) { cmd = t; i++; if (t === 'Z') { out += 'z'; cx = sx; cy = sy; last = 'z'; } continue; }
    const n = AR[cmd];
    const v = toks.slice(i, i + n).map(Number);
    i += n;
    if (cmd === 'M') { out += 'M' + num(v[0]) + (v[1] < 0 ? '' : ' ') + num(v[1]); cx = sx = v[0]; cy = sy = v[1]; last = 'M'; cmd = 'L'; continue; }
    const rel = v.map((a, k) => a - (k % 2 ? cy : cx));
    const lc = cmd.toLowerCase();
    let body = rel.map((a, k) => { const q = num(a); return k === 0 || q[0] === '-' ? q : ' ' + q; }).join('');
    if (lc === last) out += body[0] === '-' ? body : ' ' + body; else out += lc + body;
    last = lc;
    cx = v[n - 2]; cy = v[n - 1];
  }
  return out;
}
const path = (d, attrs = {}) => el('path', { d: relD(d), ...attrs });

/* ------------------------------------------------------------------ */
/* 머리 가닥 시스템                                                      */
/* ------------------------------------------------------------------ */
const PROF = {
  bang: [0.2, 0.8, 1, 0.94, 0.72, 0.4, 0],
  lock: [0.5, 0.95, 1, 0.94, 0.8, 0.5, 0],
  back: [0.75, 0.96, 1, 1, 0.92, 0.66, 0],
  wisp: [0.3, 1, 0.92, 0.7, 0.45, 0.2, 0],
};
/** 중심선 함수 fn(t) + 최대 폭 w + 폭 프로필 → 가닥. opt.sh=[t0,t1,폭비,옆오프셋] 하이라이트, opt.fl=[[t0,t1,오프셋]] 결선 */
function strand(fn, w, prof = PROF.bang, opt = {}) {
  const N = prof.length - 1;
  const pts = [], ws = [];
  for (let j = 0; j <= N; j++) { pts.push(fn(j / N)); ws.push(prof[j] * w); }
  return { ...ribbon(pts, ws, opt.from ?? (prof === PROF.back ? 1 : prof === PROF.bang ? 3 : 2)), fn, w, ...opt };
}
function lens(fn, w, t0, t1, k, off = 0) {
  const pts = [], ws = [];
  for (let j = 0; j <= 4; j++) {
    const t = t0 + ((t1 - t0) * j) / 4;
    pts.push(offsetAt(fn, t, off * w));
    ws.push(Math.sin((Math.PI * j) / 4) * k * w);
  }
  return ribbon(pts, ws).fill;
}
function flowLine(fn, w, t0, t1, off) {
  const pts = [];
  for (let j = 0; j <= 4; j++) pts.push(offsetAt(fn, t0 + ((t1 - t0) * j) / 4, off * w));
  return `M${P(pts[0])}${cr(pts)}`;
}
/** 가닥 묶음 렌더: 전체 실루엣엔 굵은 외곽(언더레이), 겹치는 안쪽엔 가는 결선 */
function hairLayer(list, cls) {
  let s = el('g', { class: 'hu' }, list.map((st) => path(st.fill)).join(''));
  for (const st of list) {
    s += path(st.fill, { class: st.cls || cls });
    if (st.sh) s += path(lens(st.fn, st.w, ...st.sh), { class: 'hs' });
    if (st.fl) s += path(st.fl.map(([a, b, o]) => flowLine(st.fn, st.w, a, b, o)).join(''), { class: 'hw' });
    if (st.line) s += path(st.line, { class: 'hi' });
  }
  return s;
}
/** 좌우 반전 가닥 정의 */
const mirFn = (fn) => (t) => mx(fn(t));

/* ------------------------------------------------------------------ */
/* 팔레트                                                               */
/* ------------------------------------------------------------------ */
const SKIN = { base: '#fdebe2', shade: '#f6d0c3', deep: '#ecb6a6', line: '#bd7365', hi: '#fff8f4' };
const SHIRT = { base: '#fbfbfe', shade: '#dfe2ee', line: '#8d90a6' };
const RIB = { base: '#9c2335', light: '#c84556', dark: '#62121f', line: '#4b0d17' };
const SKIRT = { base: '#2e3454', light: '#444c75', dark: '#1c2038', line: '#10132a' };

const CHARS = {
  osana: {
    id: 'o',
    scale: 0.975, // 아카네가 조금 작다
    // 디자인 시트 B: 장밋빛이 도는 밤갈색(채도를 낮춘 붉은 갈색), 장밋빛 적색 눈
    hair: { line: '#66332f', dark: '#78433d', base: '#94564c', mid: '#a0625a', light: '#bb7c6e', hi: '#f0b9a8', inner: '#4d2628' },
    eye: { lash: '#2c1014', top: '#3d1119', mid: '#a8323f', bot: '#ea8a8f', pupil: '#24060b', glow: '#ffa3ab' },
    // 살짝 치켜올라간 눈꼬리는 유지하되 안쪽 눈꺼풀 경사를 완만하게(노려보는 인상 방지)
    eyeShape: {
      up: [[-29, -6], [-17, -22], [12, -27], [32, -17]],
      wing: [39, -18],
      outer: [[34, -7], [32, 7]],
      low: [[26, 16], [14, 26], [-8, 27], [-21, 20]],
      inner: [[-26, 13], [-29, 4]],
      iris: [2, 4, 20.5, 25.5],
    },
    brow: [[422, 189], [452, 180], [486, 185]],
    knit: { base: '#d8c2a6', light: '#e9dac7', shade: '#bda386', dark: '#9e8264', line: '#76593f' },
    // rim: 밤 장면(남색 하늘)에서 실루엣이 묻히지 않도록 어깨·소매 바깥쪽에 넣는 림라이트 색
    yukata: { base: '#29316a', light: '#3a4585', dark: '#181e40', line: '#0e1128', collar: '#1a1f42', edge: '#eef0ff', obi: '#c4313d', obiL: '#e2525c', obiD: '#86202b', cord: '#f0c35a', cordD: '#b98a2a', rim: '#aab6f6' },
  },
  tenko: {
    id: 't',
    scale: 1,
    hair: { line: '#b04a72', dark: '#d87595', base: '#f29fb7', mid: '#f5aec2', light: '#f9c8d5', hi: '#fff4f8', inner: '#c7678a' },
    eye: { lash: '#33203f', top: '#2d1c62', mid: '#8a6ed6', bot: '#d2c2ff', pupil: '#1b114a', glow: '#e6dbff' },
    eyeShape: {
      up: [[-28, -6], [-16, -24], [12, -29], [31, -12]],
      wing: [36, -4],
      outer: [[33, -1], [31, 10]],
      low: [[25, 18], [14, 28], [-8, 29], [-21, 22]],
      inner: [[-26, 15], [-29, 3]],
      iris: [1, 4, 21.5, 26.5],
    },
    brow: [[422, 193], [452, 184], [485, 190]],
    knit: { base: '#cfcac8', light: '#e2dedc', shade: '#b5afad', dark: '#958e8b', line: '#6a6361' },
    yukata: { base: '#bfe2f3', light: '#dcf1fa', dark: '#8fc3de', line: '#3f6f8f', collar: '#a2d0ea', edge: '#ffffff', obi: '#28305e', obiL: '#3a4482', obiD: '#161b3c', cord: '#f6a9c0', cordD: '#c66f8d' },
  },
};

/* ------------------------------------------------------------------ */
/* 표정 정의                                                            */
/* ------------------------------------------------------------------ */
const EXPR = {
  neutral: { eye: {}, brow: [0, 0, 0], blush: 0.5, mouth: 'smile' },
  smile: { eye: { mode: 'closed' }, brow: [-5, -7, -3], blush: 0.65, mouth: 'open' },
  fluster: { eye: { wide: true, drop: -3 }, brow: [-10, -6, 2], blush: 0.8, mouth: 'wave', sweat: true },
  shy: { eye: { drop: 6, look: [-8, 3], lowRaise: 3, sparkle: true }, brow: [-6, -2, 2], blush: 1, hatch: true, mouth: 'tiny' },
  pout: { eye: { drop: 9, look: [8, 1] }, brow: [8, 1, -4], blush: 0.8, mouth: 'pout', puff: true },
  sad: { eye: { drop: 5, droop: 6, look: [0, 4], tear: true }, brow: [-9, -2, 6], blush: 0.2, mouth: 'sad' },
};
// 아카네: 새침한 기본(살짝 내리깐 눈 + 한쪽 입꼬리), 웃을 때는 눈웃음 + 벌린 입
const EXPR_OVERRIDE = {
  osana: {
    neutral: { eye: { drop: 3, lowRaise: 3 }, mouth: 'smirk', brow: [-1, -1, 0] },
    smile: { eye: { mode: 'open', drop: 4, lowRaise: 11 }, brow: [-5, -6, -2] },
  },
};

/* ------------------------------------------------------------------ */
/* defs                                                                 */
/* ------------------------------------------------------------------ */
const stops = (list) => list.map(([o, c, op]) => el('stop', { offset: o, 'stop-color': c, 'stop-opacity': op })).join('');
const lg = (id, list, attrs = {}) => el('linearGradient', { id, ...attrs }, stops(list));
const rg = (id, list, attrs = {}) => el('radialGradient', { id, ...attrs }, stops(list));
const US = { gradientUnits: 'userSpaceOnUse' };

function baseDefs(C) {
  const h = C.hair, e = C.eye, k = C.knit, i = C.id;
  return [
    lg(`${i}hg`, [[0, h.mid], [0.1, h.light], [0.17, h.base], [0.5, h.base], [1, h.dark]], { x1: 0, y1: 70, x2: 0, y2: 900, ...US }),
    lg(`${i}hb`, [[0, h.base], [0.25, h.dark], [1, h.inner]], { x1: 0, y1: 60, x2: 0, y2: 980, ...US }),
    lg(`${i}ir`, [[0, e.top], [0.28, e.top], [0.62, e.mid], [1, e.bot]], { x1: 0, y1: 0, x2: 0, y2: 1 }),
    lg(`${i}sc`, [[0, '#cfd3ea'], [0.42, '#ffffff']], { x1: 0, y1: 0, x2: 0, y2: 1 }),
    rg(`${i}bl`, [[0, '#ff7d94', 0.6], [1, '#ff7d94', 0]]),
    lg(`${i}kn`, [[0, k.shade], [0.16, k.base], [0.44, k.light], [0.56, k.light], [0.84, k.base], [1, k.shade]], { x1: 230, y1: 0, x2: 570, y2: 0, ...US }),
    lg(`${i}sk`, [[0, SKIRT.dark], [0.28, SKIRT.base], [0.5, SKIRT.light], [0.72, SKIRT.base], [1, SKIRT.dark]], { x1: 190, y1: 0, x2: 610, y2: 0, ...US }),
    lg(`${i}lg`, [[0, SKIN.deep], [0.3, SKIN.shade], [0.6, SKIN.base]], { x1: 0, y1: 1100, x2: 0, y2: 1200, ...US }),
  ].join('');
}

/* ------------------------------------------------------------------ */
/* 얼굴                                                                 */
/* ------------------------------------------------------------------ */
const FACE = sym([400, 112], [
  [[456, 112], [500, 148], [501, 212]],
  [[502, 252], [494, 280], [476, 302]],
  [[454, 326], [424, 340], [400, 342]],
]);
const NECK = 'M378 300C379 336 378 362 371 390L429 390C422 362 421 336 422 300Z';
const NECK_SH = 'M378 300L422 300L422 358C410 370 390 370 378 358Z';

function face(C, bangs) {
  const i = C.id;
  let s = '';
  s += el('clipPath', { id: `${i}fc` }, path(FACE));
  s += path(FACE, { fill: SKIN.base });
  // 앞머리 그림자(앞머리 모양을 아래로 밀어 얼굴 안에 클립)
  PREC = 0;
  s += el('g', { 'clip-path': `url(#${i}fc)`, fill: SKIN.shade, transform: 'translate(3 12)' }, bangs.map((b) => path(b.fill)).join(''));
  PREC = 1;
  // 볼 옆 그늘
  s += el('g', { 'clip-path': `url(#${i}fc)` }, path('M501 200C499 262 472 318 400 343L400 360L520 360L520 200Z', { fill: SKIN.shade, opacity: 0.5 }));
  s += path(FACE, { fill: 'none', stroke: SKIN.line, 'stroke-width': 2.4, 'stroke-linejoin': 'round' });
  // 코
  s += path('M403 280C402 284 400 287 397 289', { fill: 'none', stroke: SKIN.line, 'stroke-width': 2, 'stroke-linecap': 'round' });
  s += el('ellipse', { cx: 405, cy: 276, rx: 2.2, ry: 3.5, fill: SKIN.hi, opacity: 0.9 });
  return s;
}

/* ------------------------------------------------------------------ */
/* 눈                                                                   */
/* ------------------------------------------------------------------ */
const EX = 56, EY = 246, ES = 1.1;

function eyeShape(C, ex) {
  const S = C.eyeShape;
  const drop = ex.drop || 0, droop = ex.droop || 0, lr = ex.lowRaise || 0;
  const up = S.up.map((p) => [...p]);
  up[0][1] += drop * 0.25 - droop * 0.4;
  up[1][1] += drop * 0.95 - droop * 0.2;
  up[2][1] += drop + droop * 0.6;
  up[3][1] += drop * 0.55 + droop;
  if (ex.wide) { up[1][1] -= 2; up[2][1] -= 3; up[3][1] -= 2; }
  const wing = [S.wing[0], S.wing[1] + drop * 0.5 + droop * 1.3];
  const low = S.low.map((p) => [...p]);
  low[0][1] -= lr * 0.6; low[1][1] -= lr; low[2][1] -= lr; low[3][1] -= lr * 0.5;
  const outer = S.outer.map((p) => [p[0], p[1] + drop * 0.3 + droop * 0.5 - lr * 0.3]);
  const inner = S.inner.map((p) => [p[0], p[1] - lr * 0.3]);
  const d = `M${P(up[0])}C${P(up[1])} ${P(up[2])} ${P(up[3])}C${P(outer[0])} ${P(outer[1])} ${P(low[0])}C${P(low[1])} ${P(low[2])} ${P(low[3])}C${P(inner[0])} ${P(inner[1])} ${P(up[0])}Z`;
  return { up, wing, low, d };
}

function eyes(C, ex) {
  const e = C.eye, i = C.id;
  if (ex.mode === 'closed') return closedEyes(C);
  const sh = eyeShape(C, ex);
  const [icx0, icy0, rx0, ry0] = C.eyeShape.iris;
  const k = ex.wide ? 0.74 : 1;
  const rx = rx0 * k, ry = ry0 * k;
  const look = ex.look || [0, 0];
  let s = el('clipPath', { id: `${i}ec` }, path(sh.d));
  const lidPts = [0, 0.25, 0.5, 0.75, 1].map((t) => cubic(sh.up[0], sh.up[1], sh.up[2], sh.up[3], t));
  const lid = ribbon([...lidPts, sh.wing], [2.2, 4.4, 5.6, 6.6, 6.8, 0]);
  const lash1 = ribbon([lerp(lidPts[3], lidPts[4], 0.6), [sh.up[3][0] + 8, sh.up[3][1] - 9]], [3, 0]);
  const lash2 = ribbon([lerp(lidPts[2], lidPts[3], 0.7), [lidPts[3][0] + 4, lidPts[3][1] - 10]], [2.4, 0]);
  const crease = `M${P([lidPts[1][0] + 2, lidPts[1][1] - 7])}C${P([lidPts[2][0], lidPts[2][1] - 10])} ${P([lidPts[3][0], lidPts[3][1] - 9])} ${P([lidPts[4][0] - 2, lidPts[4][1] - 6])}`;
  const lowLine = `M${P(sh.low[0])}C${P(sh.low[1])} ${P(lerp(sh.low[1], sh.low[2], 0.6))} ${P(lerp(sh.low[2], sh.low[3], 0.3))}`;

  for (const side of [1, -1]) {
    const cx = 400 + side * EX;
    const lx = (look[0] * side) / ES;
    const ix = icx0 + lx, iy = icy0 + look[1] / ES;
    const hx = (dx) => ix + dx * side;
    let g = '';
    let inner = path(sh.d, { fill: `url(#${i}sc)` });
    inner += el('ellipse', { cx: rd(ix), cy: rd(iy), rx: rd(rx), ry: rd(ry), fill: `url(#${i}ir)` });
    inner += el('ellipse', { cx: rd(ix), cy: rd(iy + ry * 0.45), rx: rd(rx * 0.72), ry: rd(ry * 0.42), fill: e.glow, opacity: 0.55 });
    inner += el('ellipse', { cx: rd(ix), cy: rd(iy + 1), rx: rd(rx * (ex.wide ? 0.25 : 0.42)), ry: rd(ry * (ex.wide ? 0.25 : 0.46)), fill: e.pupil, opacity: 0.88 });
    inner += el('ellipse', { cx: rd(ix), cy: rd(iy), rx: rd(rx), ry: rd(ry), fill: 'none', stroke: e.top, 'stroke-width': 1.6 });
    inner += path(`M${P([ix - rx * 0.55, iy + ry * 0.2])}L${P([ix - rx * 0.25, iy + ry * 0.05])}M${P([ix + rx * 0.55, iy + ry * 0.25])}L${P([ix + rx * 0.25, iy + ry * 0.08])}M${P([ix, iy + ry * 0.75])}L${P([ix, iy + ry * 0.45])}`, { stroke: e.bot, 'stroke-width': 1.2, opacity: 0.6, 'stroke-linecap': 'round' });
    inner += path(`M${P(sh.up[0])}C${P(sh.up[1])} ${P(sh.up[2])} ${P(sh.up[3])}`, { fill: 'none', stroke: e.top, 'stroke-width': 13, opacity: 0.28 });
    inner += el('ellipse', { cx: rd(hx(-7)), cy: rd(iy - ry * 0.36), rx: rd(5.6 * k + 0.6), ry: rd(7.2 * k + 0.6), fill: '#fff', transform: `rotate(${-20 * side} ${rd(hx(-7))} ${rd(iy - ry * 0.36)})` });
    inner += el('circle', { cx: rd(hx(7.5)), cy: rd(iy + ry * 0.38), r: rd(2.8 * k + 0.4), fill: '#fff' });
    inner += el('circle', { cx: rd(hx(-9)), cy: rd(iy + ry * 0.46), r: 1.5, fill: '#fff', opacity: 0.85 });
    if (ex.sparkle) inner += el('circle', { cx: rd(hx(4)), cy: rd(iy - ry * 0.55), r: 1.8, fill: '#fff' });
    if (ex.tear) {
      inner += path(`M${P([ix - rx, iy + ry * 0.62])}Q${P([ix - rx * 0.4, iy + ry * 0.5])} ${P([ix, iy + ry * 0.66])}T${P([ix + rx, iy + ry * 0.6])}`, { fill: 'none', stroke: '#fff', 'stroke-width': 2.4, opacity: 0.85, 'stroke-linecap': 'round' });
    }
    g += el('g', { 'clip-path': `url(#${i}ec)` }, inner);
    g += path(crease, { fill: 'none', stroke: e.lash, 'stroke-width': 1.5, opacity: 0.45, 'stroke-linecap': 'round' });
    g += path(lid.fill, { fill: e.lash });
    g += path(lash1.fill, { fill: e.lash });
    g += path(lash2.fill, { fill: e.lash });
    g += path(lowLine, { fill: 'none', stroke: e.lash, 'stroke-width': 1.7, opacity: 0.7, 'stroke-linecap': 'round' });
    if (ex.tear) {
      g += path(`M${P([sh.low[0][0] - 2, sh.low[0][1] + 3])}Q${P([sh.low[1][0], sh.low[1][1] + 4])} ${P([sh.low[2][0], sh.low[2][1] + 3])}`, { fill: 'none', stroke: '#bfe4ff', 'stroke-width': 2, opacity: 0.8, 'stroke-linecap': 'round' });
    }
    s += el('g', { transform: `translate(${cx} ${EY}) scale(${side * ES} ${ES})` }, g);
  }
  return s;
}

function closedEyes(C) {
  const e = C.eye;
  const arc = ribbon([[-27, 6], [-16, -6], [0, -11], [16, -8], [28, 2], [33, 3]], [2.4, 4.6, 5.6, 5.6, 4.4, 0]);
  const lash = ribbon([[25, 0], [33, -6]], [3, 0]);
  const lower = 'M-18 13Q0 18 18 12';
  let s = '';
  for (const side of [1, -1]) {
    const g = path(arc.fill, { fill: e.lash }) + path(lash.fill, { fill: e.lash }) + path(lower, { fill: 'none', stroke: e.lash, 'stroke-width': 1.5, opacity: 0.45, 'stroke-linecap': 'round' });
    s += el('g', { transform: `translate(${400 + side * EX} ${EY + 4}) scale(${side * ES} ${ES})` }, g);
  }
  return s;
}

/* ------------------------------------------------------------------ */
/* 눈썹·입·홍조·효과                                                    */
/* ------------------------------------------------------------------ */
function brows(C, dy, alpha) {
  const b = C.brow.map((p, j) => [p[0], p[1] + dy[j]]);
  const r = ribbon([b[0], lerp(b[0], b[1], 0.5), b[1], b[2]], [4.4, 4.2, 3.4, 1]);
  return el('g', { fill: C.hair.line, opacity: alpha }, path(r.fill) + path(mirrorD(r.fill)));
}

const MOUTH_LINE = '#8a3634';
function mouth(kind, i) {
  const st = { fill: 'none', stroke: MOUTH_LINE, 'stroke-width': 2.3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
  const OPEN = 'M382 300Q400 306 418 300C417 318 409 329 400 329C391 329 383 318 382 300Z';
  switch (kind) {
    case 'smile':
      return path('M388 305Q400 314 412 305', st);
    case 'smirk':
      return path('M387 308Q398 312 408 306Q412 303 414 300', st) + path('M391 315Q398 317 404 314', { ...st, 'stroke-width': 1.3, opacity: 0.5 });
    case 'open':
      return el('clipPath', { id: `${i}mc` }, path(OPEN)) + path(OPEN, { fill: '#a3333d' }) +
        el('g', { 'clip-path': `url(#${i}mc)` }, el('ellipse', { cx: 400, cy: 327, rx: 12, ry: 7, fill: '#f08b90' }) + path('M380 299Q400 306 420 299L420 305Q400 311 380 305Z', { fill: '#fff' })) +
        path(OPEN, { ...st, 'stroke-width': 2 });
    case 'wave':
      // 당황한 물결 입(살짝 벌어짐)
      return path('M384 310Q388 303 392 309Q396 315 400 309Q404 303 408 309Q412 315 416 309Q412 321 400 320Q388 321 384 310Z', { fill: '#c45a60', 'fill-opacity': 0.55, stroke: 'none' }) +
        path('M384 310Q388 303 392 309Q396 315 400 309Q404 303 408 309Q412 315 416 309', { ...st, 'stroke-width': 2.4 });
    case 'tiny':
      return path('M394 309Q400 312 406 308', st);
    case 'pout':
      // 삐죽 내민 입: 작은 ㅅ자 + 아랫입술
      return path('M390 313Q395 303 400 306Q405 303 410 313', st) + path('M394 317Q400 321 406 317', { ...st, 'stroke-width': 1.6, opacity: 0.7 });
    case 'sad':
      return path('M392 312Q400 307 408 312', st);
    default:
      return '';
  }
}

function blush(C, a, hatch, puff) {
  const i = C.id;
  let s = '';
  if (a > 0) {
    s += el('g', { opacity: a }, el('ellipse', { cx: 340, cy: 288, rx: 34, ry: 15, fill: `url(#${i}bl)` }) + el('ellipse', { cx: 460, cy: 288, rx: 34, ry: 15, fill: `url(#${i}bl)` }) +
      (a >= 0.95 ? el('ellipse', { cx: 400, cy: 282, rx: 22, ry: 8, fill: `url(#${i}bl)` }) : ''));
  }
  if (hatch) {
    let d = '';
    for (const x of [448, 457, 466]) d += `M${x} 293L${x + 6} 281`;
    s += path(d + mirrorD(d), { stroke: '#e65c78', 'stroke-width': 1.9, 'stroke-linecap': 'round', opacity: 0.85 });
  }
  if (puff) {
    // 부푼 볼: 볼 안쪽 곡선 + 홍조 위 하이라이트
    const d = 'M474 262Q492 280 478 302';
    s += path(d + mirrorD(d), { fill: 'none', stroke: SKIN.line, 'stroke-width': 2, 'stroke-linecap': 'round', opacity: 0.75 });
    s += el('ellipse', { cx: 466, cy: 280, rx: 6, ry: 3, fill: '#fff', opacity: 0.7 }) + el('ellipse', { cx: 334, cy: 280, rx: 6, ry: 3, fill: '#fff', opacity: 0.7 });
  }
  return s;
}

function sweat() {
  // 화면 왼쪽 관자놀이(리본·포니테일이 없는 쪽)
  const d = 'M272 150C277 166 288 178 288 190C288 201 281 208 272 208C263 208 256 201 256 190C256 178 267 166 272 150Z';
  return path(d, { fill: '#cdeeff', stroke: '#5c9fd2', 'stroke-width': 2.2, 'stroke-linejoin': 'round' }) +
    path('M264 188Q263 196 270 201', { fill: 'none', stroke: '#fff', 'stroke-width': 2.6, 'stroke-linecap': 'round' }) +
    path('M246 140L238 130M242 158L230 154', { stroke: '#5c9fd2', 'stroke-width': 2.2, 'stroke-linecap': 'round' });
}

/* ------------------------------------------------------------------ */
/* 머리 모양 정의                                                        */
/* ------------------------------------------------------------------ */
const TOP_R = 'M400 64C450 64 500 84 530 118C548 140 556 170 555 205';
const TOP_L = 'C244 170 252 140 270 118C300 84 350 64 400 64Z';
/** 뒷머리 두상 */
const DOME = TOP_R + 'C554 250 552 290 540 330C520 370 460 390 400 390C340 390 280 370 260 330C248 290 246 250 245 205' + TOP_L;
/** 포니테일용 두상(옆머리를 묶어 올려 아래가 좁다) */
const DOME_P = TOP_R + 'C554 240 546 280 526 312C500 350 450 372 400 372C350 372 300 350 274 312C254 280 246 240 245 205' + TOP_L;
/** 앞머리 레이어에 넣는 정수리 덮개(아래 가장자리는 앞머리·옆머리에 가려진다) */
const CAP = TOP_R + 'C554 236 548 272 530 306C520 270 510 230 496 196C480 170 444 152 400 150C356 152 320 170 304 196C290 230 280 270 270 306C252 272 246 236 245 205' + TOP_L;
/** 천사의 고리: 가르마 쪽을 향한 가는 빛줄기들을 호를 따라 배치 */
function angelRing(part, y0, x0 = 292, x1 = 508) {
  let d = '';
  let j = 0;
  for (let x = x0; x <= x1; x += 12, j++) {
    const y = y0 + Math.pow((x - 400) / 118, 2) * 34;
    const len = [40, 26, 48, 30, 44, 22][j % 6] * (1 - Math.abs(x - 400) / 320);
    const w = [9, 6, 11, 7, 10, 5][j % 6];
    const a = Math.atan2(y - part[1], x - part[0]);
    const ux = Math.cos(a), uy = Math.sin(a);
    const p0 = [x - ux * len * 0.5, y - uy * len * 0.5], p1 = [x + ux * len * 0.5, y + uy * len * 0.5];
    d += ribbon([p0, lerp(p0, p1, 0.5), p1], [0, w, 0]).fill;
  }
  return path(`M${x0} ${y0 + 30}Q400 ${y0 - 34} ${x1} ${y0 + 30}`, { fill: 'none', stroke: '#fff', 'stroke-width': 16, 'stroke-opacity': 0.12, 'stroke-linecap': 'round' }) + path(d, { class: 'hs' });
}

/* ---- 아카네(osana): 붉은 밤갈색 긴 생머리, 반묶음 + 짙은 리본, 분홍 핀 2개 ---- */
function osanaHair() {
  const pt = [440, 80];
  const bangs = [
    strand(bz(pt, [350, 74], [292, 150], [290, 256]), 46, PROF.bang, { fl: [[0.5, 0.85, 0.15]] }),
    strand(bz(pt, [368, 90], [312, 150], [318, 228]), 52, PROF.bang, { fl: [[0.5, 0.82, -0.1]] }),
    strand(bz(pt, [392, 98], [338, 162], [350, 222]), 54, PROF.bang, { fl: [[0.5, 0.85, 0.12]] }),
    strand(bz(pt, [412, 106], [372, 168], [380, 214]), 44, PROF.bang),
    strand(bz(pt, [492, 84], [518, 156], [512, 252]), 46, PROF.bang, { fl: [[0.5, 0.85, -0.12]] }),
    strand(bz(pt, [476, 96], [502, 164], [486, 218]), 48, PROF.bang, { fl: [[0.5, 0.82, 0.1]] }),
    strand(bz(pt, [456, 106], [474, 170], [456, 222]), 46, PROF.bang),
    strand(bz(pt, [436, 110], [444, 172], [426, 214]), 40, PROF.bang),
    strand(bz(pt, [420, 130], [398, 196], [404, 256]), 28, PROF.bang),
    strand(bz([430, 100], [396, 140], [364, 190], [366, 242]), 11, PROF.wisp),
    strand(bz([450, 100], [474, 150], [494, 200], [490, 236]), 10, PROF.wisp),
  ];
  const sideL = [
    strand(bz([308, 140], [266, 280], [306, 440], [296, 602]), 50, PROF.lock, { sh: [0.3, 0.5, 0.16, -0.2], fl: [[0.3, 0.85, 0.18], [0.35, 0.9, -0.15]] }),
    strand(bz([322, 130], [290, 206], [300, 300], [330, 364]), 32, PROF.lock, { fl: [[0.25, 0.8, 0.1]] }),
    strand(bz([326, 170], [304, 250], [316, 330], [344, 380]), 12, PROF.wisp),
  ];
  const sideR = [
    strand(bz([492, 140], [536, 280], [494, 440], [506, 598]), 50, PROF.lock, { sh: [0.3, 0.5, 0.16, 0.2], fl: [[0.3, 0.85, -0.18], [0.35, 0.9, 0.15]] }),
    strand(bz([478, 130], [510, 206], [500, 300], [470, 364]), 32, PROF.lock, { fl: [[0.25, 0.8, -0.1]] }),
    strand(bz([474, 170], [496, 250], [484, 330], [456, 380]), 12, PROF.wisp),
  ];
  const backL = [
    [bz([284, 180], [240, 400], [232, 700], [212, 950]), 58],
    [bz([304, 230], [272, 450], [266, 710], [250, 926]), 56],
    [bz([326, 300], [302, 500], [296, 720], [282, 906]), 52],
    [bz([270, 320], [234, 520], [222, 730], [204, 896]), 30],
  ];
  const back = [];
  backL.forEach(([fn, w], j) => {
    back.push(strand(fn, w, PROF.back, { fl: [[0.2, 0.9, 0.12 * (j % 2 ? -1 : 1)]], sh: j < 2 ? [0.25, 0.5, 0.12, -0.2] : undefined }));
    back.push(strand(mirFn(fn), w, PROF.back, { fl: [[0.2, 0.9, -0.12 * (j % 2 ? -1 : 1)]], sh: j < 2 ? [0.25, 0.5, 0.12, 0.2] : undefined }));
  });
  return { bangs, side: [...sideL, ...sideR], back, part: pt };
}

/** 반묶음 매듭 + 짙은 자주 리본 (뒤통수 오른쪽 위) */
function osanaKnot(C) {
  const h = C.hair;
  let s = '';
  // 묶은 머리 고리(뒤통수 오른쪽에서 살짝 보임)
  const loop = closed([[524, 96], [548, 80], [574, 88], [580, 114], [564, 134], [538, 132]]);
  s += path(loop, { fill: `url(#${C.id}hg)`, stroke: h.line, 'stroke-width': 2.6 });
  s += path('M532 102Q552 92 570 104M536 120Q552 112 568 122', { fill: 'none', stroke: h.line, 'stroke-width': 1.5, opacity: 0.7 });
  const R = { f: '#3b2131', l: '#6a4458', d: '#22121c', line: '#170a12' };
  const tail1 = ribbon([[560, 150], [570, 186], [566, 226], [574, 268]], [14, 15, 15, 15]);
  const tail2 = ribbon([[550, 150], [550, 184], [544, 220], [550, 252]], [13, 14, 14, 14]);
  s += path(tail2.fill, { fill: R.d, stroke: R.line, 'stroke-width': 2 }) + path(tail1.fill, { fill: R.f, stroke: R.line, 'stroke-width': 2 });
  s += path('M558 146C574 126 598 126 600 142C602 158 582 162 560 154Z', { fill: R.f, stroke: R.line, 'stroke-width': 2.2 });
  s += path('M550 146C534 126 512 128 512 144C512 160 532 162 550 154Z', { fill: R.f, stroke: R.line, 'stroke-width': 2.2 });
  s += path('M564 148C576 140 588 140 592 146M524 144C532 138 540 140 546 146', { fill: 'none', stroke: R.l, 'stroke-width': 2, opacity: 0.9 });
  s += el('rect', { x: 547, y: 141, width: 15, height: 15, rx: 5, fill: R.l, stroke: R.line, 'stroke-width': 2 });
  return s;
}
function osanaPins() {
  const pin = (y) => el('g', { transform: `translate(470 ${y}) rotate(-28)` },
    el('rect', { x: -20, y: -3.2, width: 40, height: 6.4, rx: 3.2, fill: '#f49ab6', stroke: '#c25e80', 'stroke-width': 1.6 }) +
    el('rect', { x: -15, y: -1.8, width: 18, height: 1.6, rx: 0.8, fill: '#fff', opacity: 0.85 }));
  return pin(152) + pin(166);
}

/* ---- 히나(tenko): 분홍 웨이브, 하늘색 핀 / 포니테일 + 하늘색 리본 ---- */
function tenkoBangs() {
  const pt = [392, 80];
  return [
    strand(bz(pt, [326, 80], [290, 156], [290, 258]), 46, PROF.bang, { fl: [[0.5, 0.85, 0.15]] }),
    strand(bz(pt, [344, 96], [298, 160], [318, 224]), 52, PROF.bang, { fl: [[0.5, 0.82, -0.1]] }),
    strand(bz(pt, [366, 104], [328, 170], [348, 218]), 52, PROF.bang),
    strand(bz(pt, [470, 80], [516, 156], [512, 254]), 46, PROF.bang, { fl: [[0.5, 0.85, -0.12]] }),
    strand(bz(pt, [452, 94], [506, 162], [484, 222]), 52, PROF.bang, { fl: [[0.5, 0.82, 0.1]] }),
    strand(bz(pt, [430, 102], [476, 168], [456, 216]), 50, PROF.bang),
    strand(bz(pt, [410, 108], [440, 172], [424, 214]), 44, PROF.bang),
    strand(bz(pt, [394, 112], [404, 172], [384, 212]), 40, PROF.bang),
    strand(bz(pt, [398, 136], [418, 198], [410, 254]), 26, PROF.bang),
    strand(bz([380, 100], [342, 150], [326, 196], [334, 240]), 10, PROF.wisp),
    strand(bz([412, 100], [452, 150], [476, 200], [470, 240]), 10, PROF.wisp),
  ];
}
function tenkoSide(long) {
  const fr = (sgn) => {
    const m = (p) => (sgn > 0 ? p : mx(p));
    const out = [
      strand(bz(m([320, 132]), m([286, 210]), m([300, 300]), m([326, 368])), 34, PROF.lock, { fl: [[0.25, 0.8, 0.1 * sgn]] }),
      strand(bz(m([326, 172]), m([302, 250]), m([316, 334]), m([344, 384])), 12, PROF.wisp),
    ];
    const wv = long ? wavy(m([304, 146]), m([300, 660]), 8, 14 * sgn, 0.7) : wavy(m([306, 146]), m([296, 450]), 5, 10 * sgn, 0.7);
    out.unshift(strand(poly(wv), long ? 52 : 44, PROF.lock, { sh: [0.28, 0.44, 0.16, -0.2 * sgn], fl: [[0.3, 0.85, 0.18 * sgn], [0.35, 0.9, -0.15 * sgn]] }));
    return out;
  };
  return [...fr(1), ...fr(-1)];
}
function tenkoBackLong() {
  const defs = [
    [wavy([280, 180], [204, 968], 9, 15, 0.3), 66],
    [wavy([302, 240], [244, 944], 8, -13, 1.0), 58],
    [wavy([324, 316], [288, 908], 6, 11, 1.6), 50],
    [wavy([262, 320], [186, 900], 6, 13, 2.2), 36],
  ];
  const back = [];
  defs.forEach(([pts, w], j) => {
    const o = { fl: [[0.2, 0.9, 0.12 * (j % 2 ? -1 : 1)]], sh: j < 2 ? [0.2, 0.42, 0.12, -0.2] : undefined };
    back.push(strand(poly(pts), w, PROF.back, o));
    const mp = pts.map(mx).map((p, k) => [p[0] + (k ? Math.sin(k * 1.3) * 5 : 0), p[1] + (k ? 6 : 0)]);
    back.push(strand(poly(mp), w, PROF.back, { ...o, fl: [[0.2, 0.9, -0.12 * (j % 2 ? -1 : 1)]], sh: o.sh && [0.2, 0.42, 0.12, 0.2] }));
  });
  return back;
}
function tenkoPony() {
  const S = (pts, w, prof, o) => strand(poly(pts), w, prof, o);
  return [
    S([[522, 100], [560, 90], [592, 116], [608, 184], [600, 270], [616, 360], [604, 450], [622, 540], [606, 630], [618, 700]], 76, [0.4, 0.8, 1, 1, 0.96, 0.9, 0.8, 0.62, 0.36, 0], { fl: [[0.15, 0.8, 0.15], [0.2, 0.82, -0.2]], sh: [0.1, 0.26, 0.12, 0.1] }),
    S([[528, 104], [562, 112], [584, 170], [580, 260], [594, 350], [580, 440], [596, 530], [578, 610], [586, 664]], 50, [0.4, 0.8, 1, 1, 0.96, 0.9, 0.75, 0.5, 0], { fl: [[0.2, 0.8, 0.1]] }),
    S([[536, 100], [580, 102], [616, 156], [630, 236], [642, 316], [634, 406], [648, 486], [636, 560]], 40, [0.4, 0.8, 1, 1, 0.92, 0.8, 0.5, 0], { fl: [[0.2, 0.78, -0.1]] }),
    S([[532, 96], [572, 80], [606, 94], [626, 136]], 22, [0.6, 1, 0.7, 0]),
  ];
}
/** 땋은 머리: 중심선을 따라 좌우로 기운 잎 모양을 엇갈려 쌓고, 잎마다 아래쪽에 그늘 */
function braid(fn, n, len, w) {
  let d = '', sd = '';
  for (let j = n - 1; j >= 0; j--) {
    const t = (j + 0.5) / n;
    const c = fn(t), a = fn(Math.max(0, t - 0.02)), b = fn(Math.min(1, t + 0.02));
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const tx = (b[0] - a[0]) / l, ty = (b[1] - a[1]) / l;
    const ang = (j % 2 ? 1 : -1) * 0.85;
    const ux = tx * Math.cos(ang) - ty * Math.sin(ang), uy = tx * Math.sin(ang) + ty * Math.cos(ang);
    const k = 1 - t * 0.3;
    const p0 = [c[0] - ux * len * 0.5 * k, c[1] - uy * len * 0.5 * k], p1 = [c[0] + ux * len * 0.5 * k, c[1] + uy * len * 0.5 * k];
    d += ribbon([p0, lerp(p0, p1, 0.45), p1], [4, w * k, 2]).fill;
    sd += ribbon([lerp(p0, p1, 0.55), lerp(p0, p1, 0.8), p1], [w * k * 0.7, w * k * 0.5, 1]).fill;
  }
  return path(d, { class: 'hbr' }) + path(sd, { class: 'hw', fill: '#000', 'fill-opacity': 0.1, stroke: 'none' });
}
function tenkoPin() {
  return el('g', { transform: 'translate(472 170) rotate(-32)' },
    el('rect', { x: -17, y: -5, width: 34, height: 10, rx: 4, fill: '#9fd6f2', stroke: '#4d93bf', 'stroke-width': 1.8 }) +
    el('rect', { x: -12, y: -2.6, width: 13, height: 2.2, rx: 1.1, fill: '#fff', opacity: 0.9 }) +
    el('circle', { cx: 9, cy: 0, r: 2, fill: '#fff', opacity: 0.8 }));
}
function tenkoPonyRibbon() {
  const R = { f: '#a8d9f3', l: '#d7f0fb', d: '#79b6dc', line: '#3f86b4' };
  let s = '';
  s += path(ribbon([[542, 104], [558, 138], [554, 172], [566, 200]], [14, 15, 15, 16]).fill, { fill: R.d, stroke: R.line, 'stroke-width': 2 });
  s += path(ribbon([[532, 104], [532, 136], [522, 166], [528, 190]], [13, 14, 14, 15]).fill, { fill: R.f, stroke: R.line, 'stroke-width': 2 });
  s += path('M538 96C550 66 586 62 590 82C594 102 568 110 542 106Z', { fill: R.f, stroke: R.line, 'stroke-width': 2.2 });
  s += path('M528 98C510 72 480 74 480 92C480 110 506 112 528 106Z', { fill: R.f, stroke: R.line, 'stroke-width': 2.2 });
  s += path('M546 96C558 82 574 78 582 84M492 92C500 84 512 84 522 92', { fill: 'none', stroke: R.l, 'stroke-width': 2.4, 'stroke-linecap': 'round' });
  s += path('M544 102C558 98 572 96 582 90M524 102C510 102 498 100 490 96', { fill: 'none', stroke: R.d, 'stroke-width': 1.6, opacity: 0.8 });
  s += el('rect', { x: 526, y: 92, width: 17, height: 17, rx: 6, fill: R.l, stroke: R.line, 'stroke-width': 2 });
  return s;
}

/* ------------------------------------------------------------------ */
/* 교복                                                                 */
/* ------------------------------------------------------------------ */
// 뒷짐 포즈: 윗팔은 몸통 앞, 아래팔은 팔꿈치에서 꺾여 몸통 뒤(허리 뒤)로 들어간다
const UPPER = [[274, 462], [264, 540], [258, 610], [259, 668], [262, 694]];
const UPPER_W = [60, 52, 48, 46, 44];
const FORE = [[258, 630], [262, 690], [282, 742], [318, 782], [350, 800]];
const FORE_W = [46, 46, 46, 44, 42];

function skirtAndLegs(i) {
  let s = '';
  const thigh = 'M322 1090C324 1130 328 1170 331 1200L397 1200C397 1170 398 1130 399 1090Z';
  s += path(thigh + mirrorD(thigh), { fill: `url(#${i}lg)`, stroke: SKIN.line, 'stroke-width': 2.2 });
  s += path('M399 1130L399 1200', { stroke: SKIN.deep, 'stroke-width': 2 });
  const N = 14;
  const hemY = (x) => 1110 + 18 * (1 - Math.pow((x - 400) / 208, 2));
  const X0 = 192, XW = 416;
  const topX = (t) => 306 + 188 * t;
  let panels = '';
  let hem = '';
  for (let j = 0; j < N; j++) {
    const t0 = j / N, t1 = (j + 1) / N;
    const bx0 = X0 + XW * t0, bx1 = X0 + XW * t1, bm = (bx0 + bx1) / 2;
    const b0 = [bx0, hemY(bx0) + (j % 2 ? 7 : 0)], b1 = [bx1, hemY(bx1) + (j % 2 ? 0 : 7)];
    const m = [bm, hemY(bm) + 4];
    if (!(j % 2)) panels += path(`M${P([topX(t0), 790])}L${P([topX(t1), 790])}L${P(b1)}L${P(m)}L${P(b0)}Z`, { fill: '#000', 'fill-opacity': 0.24 });
    if (!j) hem += `M${P(b0)}`;
    hem += `L${P(m)}L${P(b1)}`;
  }
  const hemPts = hem.slice(1).split('L');
  s += path(`M306 790L494 790L${hemPts.slice().reverse().join('L')}Z`, { fill: `url(#${i}sk)` });
  s += panels;
  // 주름 하이라이트/선
  let pl = '', hl = '';
  for (let j = 1; j < N; j++) {
    const t = j / N;
    pl += `M${P([topX(t), 850])}L${P([X0 + XW * t, hemY(X0 + XW * t) + (j % 2 ? 0 : 7)])}`;
    if (j % 2) hl += `M${P([topX(t) + 3, 880])}L${P([X0 + XW * t + 6, hemY(X0 + XW * t) - 20])}`;
  }
  s += path(pl, { stroke: SKIRT.line, 'stroke-width': 1.6, opacity: 0.75 });
  s += path(hl, { stroke: SKIRT.light, 'stroke-width': 3, opacity: 0.45, 'stroke-linecap': 'round' });
  s += path(`M494 790L${P([X0 + XW, hemY(X0 + XW)])}${hem.replace(/^M[^L]+/, '').split('L').reverse().filter(Boolean).map((p) => 'L' + p).join('')}L306 790`, { fill: 'none', stroke: SKIRT.line, 'stroke-width': 2.6, 'stroke-linejoin': 'round' });
  s += path('M300 838L500 838L504 880L296 880Z', { fill: '#000', opacity: 0.22 });
  return s;
}

function uniform(C, opts) {
  const i = C.id, k = C.knit;
  const ln = { stroke: k.line, 'stroke-width': 2.6, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' };
  let s = skirtAndLegs(i);
  // 아래팔(몸통 뒤)
  const fore = ribbon(FORE, FORE_W);
  s += path(fore.fill + mirrorD(fore.fill), { fill: `url(#${i}kn)` });
  s += path(fore.line + mirrorD(fore.line), { fill: 'none', ...ln });
  s += path('M248 700C256 712 264 718 274 720' + mirrorD('M248 700C256 712 264 718 274 720'), { fill: 'none', stroke: k.dark, 'stroke-width': 1.6, opacity: 0.6, 'stroke-linecap': 'round' });
  // 셔츠 뒷깃 + 목
  s += path('M366 390C368 368 374 350 380 344L420 344C426 350 432 368 434 390Z', { fill: SHIRT.base, stroke: SHIRT.line, 'stroke-width': 2 });
  s += path(NECK, { fill: SKIN.base, stroke: SKIN.line, 'stroke-width': 2.2 });
  s += path(NECK_SH, { fill: SKIN.shade });
  s += path('M360 386L440 386L478 440L470 720L330 720L322 440Z', { fill: SHIRT.base });
  s += path('M374 396L400 600L426 396', { fill: 'none', stroke: SHIRT.shade, 'stroke-width': 10, opacity: 0.8 });

  // 카디건 몸판 (화면 왼쪽 판이 위)
  const panelL = 'M366 386C342 396 304 410 282 426C258 440 246 458 244 482L300 524C306 600 320 650 320 700C318 750 306 800 304 846L408 850L408 596C396 540 378 450 366 386Z';
  const pR = 'M434 386C458 396 496 410 518 426C542 440 554 458 556 482L500 524C494 600 480 650 480 700C482 750 494 800 496 846L392 850L392 596C404 540 422 450 434 386Z';
  s += el('clipPath', { id: `${i}cp` }, path(pR) + path(panelL));
  s += path(pR, { fill: `url(#${i}kn)`, ...ln });
  s += path(panelL, { fill: `url(#${i}kn)`, ...ln });
  let shade = '';
  const bust = 'M312 552C330 580 360 590 392 578C372 600 336 598 314 578Z';
  shade += path(bust + mirrorD(bust), { fill: k.dark, opacity: 0.28 });
  const side = 'M282 430C300 480 306 560 322 640C332 700 322 780 334 850L300 850L296 430Z';
  shade += path(side + mirrorD(side), { fill: k.shade, opacity: 0.45 });
  shade += path('M300 410L500 410L500 444C460 432 340 432 300 444Z', { fill: k.dark, opacity: 0.2 });
  s += el('g', { 'clip-path': `url(#${i}cp)` }, shade);
  const fold = 'M320 688C336 694 352 694 366 688M322 712C334 716 346 716 356 712M316 566C328 578 344 586 360 588';
  s += path(fold + mirrorD(fold), { fill: 'none', stroke: k.dark, 'stroke-width': 1.7, 'stroke-linecap': 'round', opacity: 0.55 });
  // 앞여밈 밴드 + 단추
  s += path('M366 386C378 450 396 540 408 596L408 850L396 850L396 600C384 544 368 456 356 390Z', { fill: k.light, ...ln, 'stroke-width': 1.8 });
  s += path('M434 386C422 450 404 540 392 596L392 850L404 850L404 600C416 544 432 456 444 390Z', { fill: k.light, ...ln, 'stroke-width': 1.8 });
  for (const y of [624, 690, 756, 814]) {
    s += el('circle', { cx: 402, cy: y, r: 6, fill: k.dark, stroke: k.line, 'stroke-width': 1.6 }) + el('circle', { cx: 400.5, cy: y - 1.5, r: 1.8, fill: k.light, opacity: 0.8 });
  }
  // 밑단 고무뜨기
  let rib = '';
  for (let x = 300; x < 502; x += 7) rib += `M${x} 812L${x} 848`;
  s += el('g', { 'clip-path': `url(#${i}cp)` }, path('M280 806L520 806', { stroke: k.line, 'stroke-width': 1.8, opacity: 0.8 }) + path(rib, { stroke: k.dark, 'stroke-width': 1.2, opacity: 0.5 }));
  if (opts.pockets) {
    const pk = 'M324 738L378 736L380 790L326 793Z';
    s += path(pk + mirrorD(pk), { fill: k.base, ...ln, 'stroke-width': 1.8 });
    s += path('M324 750L378 748' + mirrorD('M324 750L378 748'), { stroke: k.line, 'stroke-width': 1.4, opacity: 0.8 });
  }
  // 윗팔(몸통 앞). 팔꿈치 단면에는 선을 긋지 않는다
  const up = ribbon(UPPER, UPPER_W);
  const cut = up.fill.indexOf('L');
  const upSides = up.fill.slice(0, cut) + 'M' + up.fill.slice(cut + 1, -1);
  for (const flip of [false, true]) {
    const f = (d) => (flip ? mirrorD(d) : d);
    s += path(f(up.fill), { fill: `url(#${i}kn)` });
    s += path(f('M246 478C238 540 234 610 238 690C244 660 250 600 266 470Z'), { fill: k.shade, opacity: 0.55 });
    s += path(f(upSides), { fill: 'none', ...ln });
    s += path(f('M242 472C258 464 284 466 304 478'), { fill: 'none', stroke: k.dark, 'stroke-width': 1.6, opacity: 0.55 });
    s += path(f('M280 600C272 610 271 622 277 634M236 640C242 648 244 658 240 668'), { fill: 'none', stroke: k.dark, 'stroke-width': 1.6, 'stroke-linecap': 'round', opacity: 0.6 });
  }
  // 셔츠 깃
  const collar = 'M400 406L370 370C358 380 346 394 338 408L370 452Z';
  s += path(collar + mirrorD(collar), { fill: SHIRT.base, stroke: SHIRT.line, 'stroke-width': 2, 'stroke-linejoin': 'round' });
  s += path('M368 434L346 408' + mirrorD('M368 434L346 408'), { stroke: SHIRT.shade, 'stroke-width': 3, opacity: 0.7 });
  s += ribbonTie();
  return s;
}

function ribbonTie() {
  let s = '';
  const tail = 'M394 420C388 440 380 460 372 480L384 474L392 486C398 464 402 444 402 424Z';
  const tail2 = 'M406 420C412 440 420 458 428 476L416 471L409 482C404 462 400 444 398 424Z';
  s += path(tail, { fill: RIB.base, stroke: RIB.line, 'stroke-width': 2 }) + path(tail2, { fill: RIB.dark, stroke: RIB.line, 'stroke-width': 2 });
  const loop = 'M392 406C376 390 350 382 343 396C336 412 344 432 356 438C368 442 382 430 392 420Z';
  s += path(loop + mirrorD(loop), { fill: RIB.base, stroke: RIB.line, 'stroke-width': 2.2, 'stroke-linejoin': 'round' });
  const inner = 'M390 410C378 404 362 404 356 412C364 420 378 422 390 418Z';
  s += path(inner + mirrorD(inner), { fill: RIB.dark, opacity: 0.7 });
  s += path('M350 398C356 392 366 392 374 396' + mirrorD('M350 398C356 392 366 392 374 396'), { fill: 'none', stroke: RIB.light, 'stroke-width': 2.2, 'stroke-linecap': 'round' });
  s += el('rect', { x: 390, y: 402, width: 20, height: 22, rx: 6, fill: RIB.base, stroke: RIB.line, 'stroke-width': 2 });
  s += path('M394 408L406 408', { stroke: RIB.light, 'stroke-width': 2, 'stroke-linecap': 'round' });
  return s;
}

/* ------------------------------------------------------------------ */
/* 유카타                                                               */
/* ------------------------------------------------------------------ */
function goldfishPattern(C) {
  const y = C.yukata;
  const fish = (x, yy, rot, sc) => el('g', { transform: `translate(${x} ${yy}) rotate(${rot}) scale(${sc})` },
    path('M-10 0C-24 -18 -40 -20 -46 -10C-40 -4 -40 4 -46 12C-38 20 -22 16 -10 0Z', { fill: '#e8484a', opacity: 0.9 }) +
    path('M-14 0L-40 -11M-14 0L-40 10M-14 0L-42 0', { stroke: '#ffd0c4', 'stroke-width': 1.2, opacity: 0.7 }) +
    el('ellipse', { cx: 2, cy: 0, rx: 16, ry: 10.5, fill: '#e33a3a' }) +
    path('M-2 -9C6 -6 12 -2 16 0', { fill: 'none', stroke: '#ff9a7a', 'stroke-width': 2.4, 'stroke-linecap': 'round' }) +
    path('M0 8L-6 16L6 10Z', { fill: '#e8484a' }) +
    el('circle', { cx: 10, cy: -3, r: 2, fill: '#2a0a0a' }) + el('circle', { cx: 10.6, cy: -3.6, r: 0.7, fill: '#fff' }));
  const ripple = (x, yy, w) => path(`M${x - w} ${yy}Q${x} ${yy - 9} ${x + w} ${yy}M${x - w * 0.6} ${yy + 8}Q${x} ${yy + 1} ${x + w * 0.6} ${yy + 8}`, { fill: 'none', stroke: '#7d9be0', 'stroke-width': 2, opacity: 0.55, 'stroke-linecap': 'round' });
  return el('pattern', { id: `${C.id}pt`, patternUnits: 'userSpaceOnUse', width: 230, height: 250, x: 20, y: 0 },
    el('rect', { width: 230, height: 250, fill: y.base }) +
    ripple(160, 40, 26) + ripple(70, 150, 22) + ripple(200, 215, 18) +
    fish(70, 60, 18, 1) + fish(175, 140, -28, 0.85) + fish(60, 210, 160, 0.75) + fish(200, 250, 10, 0.7) + fish(200, 0, 10, 0.7));
}

function asagaoPattern(C) {
  const y = C.yukata;
  const flower = (x, yy, r, rot) => {
    const pts = [];
    for (let j = 0; j < 30; j++) {
      const a = (j / 30) * Math.PI * 2;
      const rr = r * (1 + 0.07 * Math.cos(5 * a));
      pts.push([x + Math.cos(a + rot) * rr, yy + Math.sin(a + rot) * rr]);
    }
    let star = '';
    for (let j = 0; j < 5; j++) {
      const a = rot + (j / 5) * Math.PI * 2;
      star += `M${P([x + Math.cos(a) * r * 0.25, yy + Math.sin(a) * r * 0.25])}L${P([x + Math.cos(a) * r * 0.92, yy + Math.sin(a) * r * 0.92])}`;
    }
    return path(closed(pts), { fill: '#fff', stroke: '#8fc0de', 'stroke-width': 1.4 }) +
      path(star, { stroke: '#a9d3ec', 'stroke-width': 3, 'stroke-linecap': 'round' }) +
      el('circle', { cx: x, cy: yy, r: rd(r * 0.22), fill: '#f6fbff', stroke: '#b9dcef', 'stroke-width': 1 }) +
      el('circle', { cx: x, cy: yy, r: rd(r * 0.08), fill: '#e8f4c8' });
  };
  const leaf = (x, yy, rot, sc) => el('g', { transform: `translate(${x} ${yy}) rotate(${rot}) scale(${sc})` },
    path('M0 0C-8 -6 -22 -6 -24 -18C-14 -16 -10 -24 -2 -30C2 -24 12 -20 20 -24C18 -12 8 -8 0 0Z', { fill: '#5f96c4', opacity: 0.85 }) +
    path('M0 0L-2 -26M0 -10L-16 -16M0 -10L14 -18', { stroke: '#d6ecf8', 'stroke-width': 1, opacity: 0.8 }));
  const vine = path('M20 120C40 100 70 110 80 90C90 70 120 76 130 60M140 200C160 190 170 210 190 200', { fill: 'none', stroke: '#6fa3cc', 'stroke-width': 1.8, opacity: 0.7, 'stroke-linecap': 'round' });
  return el('pattern', { id: `${C.id}pt`, patternUnits: 'userSpaceOnUse', width: 230, height: 250, x: 0, y: 10 },
    el('rect', { width: 230, height: 250, fill: y.base }) + vine +
    leaf(104, 92, 20, 1) + leaf(30, 168, -30, 0.8) + leaf(190, 210, 60, 0.9) +
    flower(62, 64, 26, 0.2) + flower(176, 150, 22, 0.6) + flower(40, 222, 18, 1.1) + flower(214, 20, 16, 0.4));
}

function yukata(C) {
  const i = C.id, y = C.yukata;
  const ln = { stroke: y.line, 'stroke-width': 2.6, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' };
  let s = '';
  const fabric = `url(#${i}pt)`;
  const shade = `url(#${i}ys)`;
  // 아랫자락
  const skirt = 'M300 740C292 820 296 960 306 1200L494 1200C504 960 508 820 500 740Z';
  s += path(skirt, { fill: fabric, ...ln }) + path(skirt, { fill: shade });
  s += path('M398 756C392 900 384 1050 376 1200L392 1200C398 1050 404 900 410 756Z', { fill: '#000', opacity: 0.12 });
  s += path('M398 756C392 900 384 1050 376 1200', { fill: 'none', ...ln, 'stroke-width': 2.2 });
  s += path('M330 1000C340 1080 344 1140 346 1200M460 980C456 1060 452 1130 452 1200M318 800C340 830 360 840 380 842', { fill: 'none', stroke: y.dark, 'stroke-width': 2, opacity: 0.4, 'stroke-linecap': 'round' });
  // 목·가슴 V
  s += path('M378 300C379 336 378 362 371 390L400 482L429 390C422 362 421 336 422 300Z', { fill: SKIN.base, stroke: SKIN.line, 'stroke-width': 2.2 });
  s += path(NECK_SH, { fill: SKIN.shade });
  s += path('M384 410Q400 440 416 410', { fill: 'none', stroke: SKIN.deep, 'stroke-width': 1.5, opacity: 0.6 });
  // 상체
  const body = 'M366 386C342 396 304 410 282 428C266 440 258 456 260 474L296 560C302 600 306 630 304 660L496 660C494 630 498 600 504 560L540 474C542 456 534 440 518 428C496 410 458 396 434 386L400 482Z';
  s += path(body, { fill: fabric, ...ln }) + path(body, { fill: shade });
  // 깃: 착용자 왼쪽 판(화면 오른쪽)이 위
  const under = 'M366 386L404 474L392 490L348 394Z';
  const over = 'M434 386L454 394C438 470 406 560 350 656L322 656C380 560 414 470 434 386Z';
  s += path(under, { fill: y.collar, ...ln, 'stroke-width': 2 });
  s += path('M366 387L403 472', { fill: 'none', stroke: y.edge, 'stroke-width': 3.2, opacity: 0.85 });
  s += path(over, { fill: y.collar, ...ln, 'stroke-width': 2 });
  s += path('M435 388C414 470 380 560 323 654', { fill: 'none', stroke: y.edge, 'stroke-width': 3.2, opacity: 0.85 });
  s += path('M306 546C332 572 368 578 392 572M438 560C456 572 478 568 494 548', { fill: 'none', stroke: y.dark, 'stroke-width': 2, opacity: 0.5, 'stroke-linecap': 'round' });
  // 오비
  s += path('M296 640C360 652 440 652 504 640L510 756C440 768 360 768 290 756Z', { fill: y.obi, stroke: y.obiD, 'stroke-width': 2.6, 'stroke-linejoin': 'round' });
  s += path('M296 650C360 662 440 662 504 650L505 664C440 676 360 676 295 664Z', { fill: y.obiL, opacity: 0.7 });
  s += path('M292 730C360 742 440 742 508 730L509 756C440 768 360 768 290 756Z', { fill: y.obiD, opacity: 0.5 });
  s += path('M300 700C360 710 440 710 502 700', { fill: 'none', stroke: y.cordD, 'stroke-width': 7, 'stroke-linecap': 'round' });
  s += path('M300 698C360 708 440 708 502 698', { fill: 'none', stroke: y.cord, 'stroke-width': 4, 'stroke-linecap': 'round' });
  s += el('ellipse', { cx: 400, cy: 706, rx: 12, ry: 8, fill: y.cord, stroke: y.cordD, 'stroke-width': 2 });
  s += path('M392 712C388 726 386 740 388 752M408 712C412 726 416 738 414 750', { fill: 'none', stroke: y.cord, 'stroke-width': 3.4, 'stroke-linecap': 'round' });
  // 소매(넓게 늘어짐)
  const sleeve = 'M282 428C254 440 236 474 230 520C222 600 210 720 206 830C204 870 218 894 250 898L298 896C314 894 322 884 322 868C322 800 318 730 314 680C310 630 306 590 302 548L300 474Z';
  for (const flip of [false, true]) {
    const f = (d) => (flip ? mirrorD(d) : d);
    s += path(f(sleeve), { fill: fabric, ...ln }) + path(f(sleeve), { fill: shade });
    s += path(f('M234 504C226 620 216 760 214 850C214 880 226 890 250 892L258 892C240 876 234 856 236 816C238 718 242 600 250 500Z'), { fill: '#000', opacity: 0.14 });
    s += path(f('M270 470C262 540 258 610 262 680M292 700C286 760 284 820 290 884'), { fill: 'none', stroke: y.dark, 'stroke-width': 1.8, opacity: 0.55, 'stroke-linecap': 'round' });
    s += path(f('M262 680C272 700 290 712 312 716'), { fill: 'none', stroke: y.dark, 'stroke-width': 1.6, opacity: 0.45, 'stroke-linecap': 'round' });
  }
  if (y.rim) {
    // 림라이트: 바깥 윤곽선을 따라 굵은 선을 그리고 도형 안쪽만 남긴다(윤곽선 바로 안쪽이 밝아짐)
    const rimSt = { fill: 'none', stroke: y.rim, 'stroke-width': 10, 'stroke-linecap': 'round', opacity: 0.5 };
    const sleeveOuter = 'M282 428C254 440 236 474 230 520C222 600 210 720 206 830C204 870 218 894 250 898';
    const shoulder = 'M366 386C342 396 304 410 282 428';
    s += el('clipPath', { id: `${i}rb` }, path(body));
    s += el('g', { 'clip-path': `url(#${i}rb)` }, path(shoulder + mirrorD(shoulder), rimSt));
    for (const flip of [false, true]) {
      const f = (d) => (flip ? mirrorD(d) : d);
      const id = `${i}rs${flip ? 1 : 0}`;
      s += el('clipPath', { id }, path(f(sleeve)));
      s += el('g', { 'clip-path': `url(#${id})` }, path(f(sleeveOuter), rimSt));
    }
  }
  return s;
}

/* ------------------------------------------------------------------ */
/* 조립                                                                 */
/* ------------------------------------------------------------------ */
function hairStyle(C, charKey, hair) {
  PREC = 0;
  let H;
  if (charKey === 'osana') {
    const o = osanaHair();
    H = { bangs: o.bangs, side: o.side, back: o.back, pony: [], part: o.part, backExtra: '', acc: osanaKnot(C) + osanaPins() };
  } else if (hair === 'ponytail') {
    H = { bangs: tenkoBangs(), side: tenkoSide(false), back: [], pony: tenkoPony(), part: [392, 80], backExtra: tenkoPonyRibbon(), acc: '' };
  } else {
    H = { bangs: tenkoBangs(), side: tenkoSide(true), back: tenkoBackLong(), pony: [], part: [392, 80], backExtra: '', acc: tenkoPin(), braid: braid(bz([338, 116], [298, 200], [286, 320], [298, 444]), 14, 40, 24) };
  }
  H.backSvg = hairLayer([...H.back, ...H.pony], 'hd');
  H.domeSvg = path(hair === 'ponytail' ? DOME_P : DOME, { class: 'hd', stroke: C.hair.line, 'stroke-width': 2.7 });
  const cap = { fill: CAP, line: '' };
  H.frontSvg = hairLayer([cap, ...H.side], 'hf') + (H.braid || '') + hairLayer(H.bangs, 'hf') + angelRing(H.part, 122);
  PREC = 1;
  return H;
}

function build(charKey, outfit, hair, exprKey) {
  const C = CHARS[charKey];
  const i = C.id, h = C.hair;
  const ov = EXPR_OVERRIDE[charKey]?.[exprKey] || {};
  const ex = { ...EXPR[exprKey], ...ov, eye: { ...EXPR[exprKey].eye, ...(ov.eye || {}) } };
  const H = hairStyle(C, charKey, hair);

  let defs = baseDefs(C);
  if (outfit === 'yukata') {
    defs += charKey === 'osana' ? goldfishPattern(C) : asagaoPattern(C);
    defs += lg(`${i}ys`, [[0, '#000', 0.22], [0.2, '#000', 0], [0.8, '#000', 0], [1, '#000', 0.24]], { x1: 210, y1: 0, x2: 590, y2: 0, ...US });
  }
  const style = `.hf{fill:url(#${i}hg)}.hd{fill:url(#${i}hb)}.hu{fill:none;stroke:${h.line};stroke-width:5.4;stroke-linejoin:round}` +
    `.hi{fill:none;stroke:${h.line};stroke-width:1.6;stroke-opacity:.7;stroke-linejoin:round;stroke-linecap:round}` +
    `.hw{fill:none;stroke:${h.dark};stroke-width:1.4;stroke-opacity:.55;stroke-linecap:round}.hs{fill:${h.hi};fill-opacity:.7}` +
    `.hbr{fill:url(#${i}hg);stroke:${h.line};stroke-width:2;stroke-linejoin:round}`;

  // 1) 뒷머리: 긴 가닥 → 두상 → 목 뒤 어둠 → 매듭/리본
  const back = H.backSvg + H.domeSvg + el('ellipse', { cx: 400, cy: 350, rx: 112, ry: 96, fill: h.inner, opacity: 0.6 }) + H.backExtra;
  // 2) 몸/의상
  const body = outfit === 'yukata' ? yukata(C) : uniform(C, { pockets: charKey === 'osana' });
  // 3) 얼굴
  const fc = face(C, H.bangs);
  // 4) 표정
  const ex1 = blush(C, ex.blush, ex.hatch, ex.puff) + eyes(C, ex.eye) + mouth(ex.mouth, i);
  // 5) 앞머리, 6) 눈썹(앞머리 위로 비침), 액세서리, 효과
  const br = brows(C, ex.brow, 0.78);
  const fx = ex.sweat ? sweat() : '';

  const sc = C.scale;
  const tf = sc === 1 ? undefined : `matrix(${sc} 0 0 ${sc} ${rd(400 * (1 - sc))} ${rd(1200 * (1 - sc))})`;
  const L = (name, inner) => el('g', { 'data-layer': name }, inner);
  const g = L('back', back) + L('body', body) + L('face', fc) + L('expr', ex1) + L('front', H.frontSvg) + L('brow', br) + L('acc', H.acc) + L('fx', fx);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1200" width="800" height="1200">` +
    `<title>임시 일러스트</title><!-- PLACEHOLDER: ${charKey} ${outfit}/${hair}/${exprKey} — scripts/art/characters.mjs 로 생성한 교체용 임시 스프라이트 -->` +
    `<defs><style>${style}</style>${defs}</defs>` + el('g', { transform: tf }, g) + `</svg>\n`;
}

const LOOKS = {
  osana: [['uniform', 'default'], ['yukata', 'default']],
  tenko: [['uniform', 'default'], ['uniform', 'ponytail'], ['yukata', 'ponytail']],
};

let count = 0;
const sizes = [];
for (const [charKey, looks] of Object.entries(LOOKS)) {
  const dir = join(OUT_DIR, charKey);
  mkdirSync(dir, { recursive: true });
  for (const [outfit, hair] of looks) {
    for (const e of EXPRS) {
      const svg = build(charKey, outfit, hair, e);
      writeFileSync(join(dir, `${outfit}_${hair}_${e}.svg`), svg);
      sizes.push(Buffer.byteLength(svg));
      count++;
    }
  }
}
console.log(`characters: ${count} files, ${Math.min(...sizes)}–${Math.max(...sizes)} bytes`);
