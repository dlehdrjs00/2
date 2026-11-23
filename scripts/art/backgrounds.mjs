#!/usr/bin/env node
/**
 * PLACEHOLDER 배경 생성기 — 《내일도 같이 갈래?》
 *
 * 최종 배경 일러스트가 나오기 전까지 쓰는 교체 가능한 임시 배경 SVG 를 코드로 그린다.
 * 외부 이미지·폰트·라이브러리를 쓰지 않는다(Node 내장 모듈만 사용).
 *
 *   node scripts/art/backgrounds.mjs            # 전체 생성
 *   node scripts/art/backgrounds.mjs road_rain  # 일부만 생성
 *
 * 출력: public/assets/placeholder/bg/{id}.svg (id 는 src/story/assets.ts 의 BACKGROUNDS 기준)
 *
 * 구성 원칙
 *  - viewBox 1600x900, preserveAspectRatio="xMidYMid slice". 좌우 5%(80px)는 잘려도 되는 영역.
 *  - 아래 30%(y>630)는 대사창이 덮고, 가운데(x 560~1040)에는 캐릭터가 선다.
 *    그래서 중요한 요소는 위쪽과 좌우에 두고 가운데는 단순하게 둔다.
 *  - 같은 장소의 시간대 변형은 같은 기하(같은 난수 시드)를 쓰고 조명(TOD)만 바꾼다.
 *  - 원근감 있는 장면은 아주 작은 3D 투영(핀홀 카메라 + 화가 알고리즘)으로 그린다.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_DIR = join(ROOT, 'public', 'assets', 'placeholder', 'bg');
const W = 1600;
const H = 900;
const MAX_BYTES = 90 * 1024;

// ---------------------------------------------------------------------------
// 기본 유틸
// ---------------------------------------------------------------------------

/** 결정적 난수(mulberry32). 같은 시드 → 같은 그림 */
function rng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (lo, hi) => lo + (hi - lo) * next();
  next.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * next());
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  next.chance = (p) => next() < p;
  return next;
}

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const norm = (v) => {
  const l = Math.hypot(...v) || 1;
  return v.map((x) => x / l);
};
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

/** 숫자 → 소수 1자리 문자열(파일 크기 절약) */
const n = (v) => {
  const r = Math.round(v * 10) / 10;
  return String(Object.is(r, -0) ? 0 : r);
};
const pts = (arr) => arr.map((p) => `${n(p[0])},${n(p[1])}`).join(' ');

// --- 색 ---------------------------------------------------------------------
function rgb(h) {
  if (Array.isArray(h)) return h;
  let s = h.replace('#', '');
  if (s.length === 3) s = [...s].map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16) / 255);
}
function hex(c) {
  return (
    '#' +
    c
      .map((v) =>
        Math.round(clamp(v) * 255)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}
const mix = (a, b, t) => {
  const A = rgb(a);
  const B = rgb(b);
  return hex(A.map((v, i) => lerp(v, B[i], t)));
};
const scale = (a, k) => hex(rgb(a).map((v) => v * k));

// ---------------------------------------------------------------------------
// SVG 문서
// ---------------------------------------------------------------------------

function attrs(a) {
  if (!a) return '';
  let s = '';
  for (const [k, v] of Object.entries(a)) {
    if (v === undefined || v === null || v === false) continue;
    s += ` ${k}="${typeof v === 'number' ? n(v) : v}"`;
  }
  return s;
}

class Doc {
  /**
   * @param {string} id 배경 id
   * @param {object} t 시간대 조명(TOD)
   * @param {number} seed 기하 시드(같은 장소는 같은 시드)
   */
  constructor(id, t, seed) {
    this.id = id;
    this.t = t;
    this.r = rng(seed);
    this.defs = [];
    this.out = [];
    this.k = 0;
    this.cache = new Map();
  }
  uid(p) {
    return p + (this.k++).toString(36);
  }
  add(s) {
    if (s) this.out.push(s);
  }
  /** 그룹. fn 안에서 add 한 요소가 <g> 로 묶인다 */
  g(a, fn) {
    const prev = this.out;
    this.out = [];
    fn();
    const inner = this.out.join('');
    this.out = prev;
    if (inner) this.out.push(`<g${attrs(a)}>${inner}</g>`);
  }
  stops(list) {
    return list
      .map(([o, c, op]) => `<stop offset="${n(o)}" stop-color="${c}"${op === undefined || op === 1 ? '' : ` stop-opacity="${n(op * 100) / 100 === 0 ? 0 : +op.toFixed(2)}"`}/>`)
      .join('');
  }
  /** 사용자 좌표계 선형 그라데이션 → fill 값 */
  lin(list, x1, y1, x2, y2) {
    const key = `l${JSON.stringify(list)}${[x1, y1, x2, y2].map(n)}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const id = this.uid('l');
    this.defs.push(
      `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}">${this.stops(list)}</linearGradient>`,
    );
    const v = `url(#${id})`;
    this.cache.set(key, v);
    return v;
  }
  /** 도형 경계 상자 기준 세로 그라데이션 */
  linV(list) {
    const key = `v${JSON.stringify(list)}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const id = this.uid('v');
    this.defs.push(`<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${this.stops(list)}</linearGradient>`);
    const v = `url(#${id})`;
    this.cache.set(key, v);
    return v;
  }
  linH(list) {
    const key = `h${JSON.stringify(list)}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const id = this.uid('h');
    this.defs.push(`<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0">${this.stops(list)}</linearGradient>`);
    const v = `url(#${id})`;
    this.cache.set(key, v);
    return v;
  }
  /** 도형 경계 상자 기준 방사형(빛번짐, 제등 등) */
  radB(list) {
    const key = `r${JSON.stringify(list)}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const id = this.uid('r');
    this.defs.push(`<radialGradient id="${id}">${this.stops(list)}</radialGradient>`);
    const v = `url(#${id})`;
    this.cache.set(key, v);
    return v;
  }
  /** 가우시안 블러(피사계 심도). 필터 영역은 화면 전체로 고정 */
  blur(sd) {
    const key = `b${sd}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const id = this.uid('b');
    this.defs.push(
      `<filter id="${id}" filterUnits="userSpaceOnUse" x="-60" y="-60" width="${W + 120}" height="${H + 120}"><feGaussianBlur stdDeviation="${sd}"/></filter>`,
    );
    const v = `url(#${id})`;
    this.cache.set(key, v);
    return v;
  }
  clipRect(x, y, w, h) {
    const id = this.uid('c');
    this.defs.push(`<clipPath id="${id}"><rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}"/></clipPath>`);
    return `url(#${id})`;
  }
  clipPoly(p) {
    const id = this.uid('c');
    this.defs.push(`<clipPath id="${id}"><polygon points="${pts(p)}"/></clipPath>`);
    return `url(#${id})`;
  }
  /** 패턴 정의(id 반환) */
  pattern(w, h, inner, extra = '') {
    const id = this.uid('p');
    this.defs.push(`<pattern id="${id}" width="${n(w)}" height="${n(h)}" patternUnits="userSpaceOnUse"${extra}>${inner}</pattern>`);
    return `url(#${id})`;
  }

  // --- 2D 도형 ---
  rect(x, y, w, h, fill, a) {
    this.add(`<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}"${fill ? ` fill="${fill}"` : ''}${attrs(a)}/>`);
  }
  poly(p, fill, a) {
    if (!p || p.length < 3) return;
    this.add(`<polygon points="${pts(p)}"${fill ? ` fill="${fill}"` : ''}${attrs(a)}/>`);
  }
  path(d, a) {
    this.add(`<path d="${d}"${attrs(a)}/>`);
  }
  circle(x, y, r, fill, a) {
    this.add(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}"${fill ? ` fill="${fill}"` : ''}${attrs(a)}/>`);
  }
  ellipse(x, y, rx, ry, fill, a) {
    this.add(`<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(rx)}" ry="${n(ry)}"${fill ? ` fill="${fill}"` : ''}${attrs(a)}/>`);
  }
  line(x1, y1, x2, y2, stroke, w, a) {
    this.add(`<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="${stroke}" stroke-width="${n(w)}"${attrs(a)}/>`);
  }
  polyline(p, stroke, w, a) {
    this.add(`<polyline points="${pts(p)}" fill="none" stroke="${stroke}" stroke-width="${n(w)}"${attrs(a)}/>`);
  }

  // --- 조명/색 보정 ---
  /**
   * 고유색(albedo) → 시간대 조명이 적용된 색.
   * @param base 고유색
   * @param dist 카메라까지 거리(m) — 대기 원근(헤이즈)
   * @param k 햇빛을 받는 정도(0=그늘, 1=정면광). 평면 요소는 t.flat
   */
  G(base, dist = 0, k) {
    const t = this.t;
    let c = rgb(base);
    const l = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
    c = c.map((v) => l + (v - l) * t.sat);
    const kk = k === undefined ? t.flat : k;
    c = c.map((v, i) => v * (t.amb[i] + t.sun[i] * kk));
    if (dist > 0) {
      const h = rgb(t.haze);
      const f = 1 - Math.exp(-dist / t.hazeD);
      c = c.map((v, i) => lerp(v, h[i], f * t.hazeMax));
    }
    return hex(c);
  }
  /** 면의 법선 n 을 고려한 색 */
  shade(base, nrm, dist = 0) {
    const t = this.t;
    const k = Math.max(0, dot(nrm, t.s));
    const sky = 0.82 + 0.18 * nrm[1];
    let c = rgb(base);
    const l = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
    c = c.map((v) => l + (v - l) * t.sat);
    c = c.map((v, i) => v * (t.amb[i] * sky + t.sun[i] * k));
    if (dist > 0) {
      const h = rgb(t.haze);
      const f = 1 - Math.exp(-dist / t.hazeD);
      c = c.map((v, i) => lerp(v, h[i], f * t.hazeMax));
    }
    return hex(c);
  }

  svg() {
    const body = this.out.join('\n');
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" width="${W}" height="${H}">\n` +
      `<!-- PLACEHOLDER: 임시 배경 "${this.id}" — scripts/art/backgrounds.mjs 가 코드로 생성. 최종 일러스트로 교체 예정 -->\n` +
      `<title>임시 배경</title>\n<defs>${this.defs.join('')}</defs>\n${body}\n</svg>\n`
    );
  }
}

// ---------------------------------------------------------------------------
// 아주 작은 3D: 핀홀 카메라(+요 회전), 근평면 클리핑, 박스/평면
// 좌표계: X=오른쪽, Y=위, Z=앞(화면 안쪽), 단위 m
// ---------------------------------------------------------------------------

function camera({ cx = 800, hy = 450, f = 800, eye = 1.5, x0 = 0, z0 = 0, yaw = 0 } = {}) {
  const cs = Math.cos(yaw);
  const sn = Math.sin(yaw);
  const NEAR = 0.12;
  const toC = (p) => {
    const dx = p[0] - x0;
    const dz = p[2] - z0;
    return [dx * cs - dz * sn, p[1] - eye, dx * sn + dz * cs];
  };
  const pr = (c) => [cx + (f * c[0]) / c[2], hy - (f * c[1]) / c[2]];
  const clip = (pc) => {
    const out = [];
    for (let i = 0; i < pc.length; i++) {
      const a = pc[i];
      const b = pc[(i + 1) % pc.length];
      const ain = a[2] >= NEAR;
      const bin = b[2] >= NEAR;
      if (ain) out.push(a);
      if (ain !== bin) {
        const t = (NEAR - a[2]) / (b[2] - a[2]);
        out.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t), NEAR]);
      }
    }
    return out;
  };
  const pos = [x0, eye, z0];
  return {
    f,
    hy,
    cx,
    eye,
    pos,
    P: (p) => pr(toC(p)),
    depth: (p) => toC(p)[2],
    dist: (p) => Math.hypot(p[0] - x0, p[1] - eye, p[2] - z0),
    /** 월드 다각형 → 화면 다각형(근평면 클리핑) */
    poly: (list) => {
      const c = clip(list.map(toC));
      return c.length >= 3 ? c.map(pr) : null;
    },
    seg: (a, b) => {
      let A = toC(a);
      let B = toC(b);
      if (A[2] < NEAR && B[2] < NEAR) return null;
      if (A[2] < NEAR) A = B.map((v, i) => lerp(B[i], A[i], (B[2] - NEAR) / (B[2] - A[2])));
      if (B[2] < NEAR) B = A.map((v, i) => lerp(A[i], B[i], (A[2] - NEAR) / (A[2] - B[2])));
      return [pr(A), pr(B)];
    },
    /** 깊이 z 에서 1m 가 몇 px 인지 */
    px: (p) => f / Math.max(NEAR, toC(p)[2]),
    /** 카메라가 면(법선 nrm, 면 위 점 p)의 앞쪽에 있는가 */
    faces: (nrm, p) => dot(nrm, sub(pos, p)) > 0,
  };
}

/** 로컬 좌표(피벗 기준) → 월드 좌표 변환(요 회전). 로컬 -X 면이 '정면' */
function yawT(pv, yaw) {
  const cs = Math.cos(yaw);
  const sn = Math.sin(yaw);
  const T = (p) => [pv[0] + p[0] * cs + p[2] * sn, p[1], pv[2] - p[0] * sn + p[2] * cs];
  T.R = (v) => [v[0] * cs + v[2] * sn, v[1], -v[0] * sn + v[2] * cs];
  return T;
}

/** 같은 색 선을 굵기별 path 하나로 묶어 파일 크기를 줄인다(그리는 순서는 flush 시점) */
class Lines {
  constructor(d, stroke, a = {}) {
    this.d = d;
    this.stroke = stroke;
    this.a = a;
    this.m = new Map();
  }
  add(x1, y1, x2, y2, w) {
    const k = Math.max(0.5, Math.round(w * 2) / 2);
    this.m.set(k, (this.m.get(k) || '') + `M${n(x1)} ${n(y1)}L${n(x2)} ${n(y2)}`);
  }
  add3(cam, a, b, wm) {
    const s = cam.seg(a, b);
    if (!s) return;
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    this.add(s[0][0], s[0][1], s[1][0], s[1][1], Math.max(0.6, cam.px(mid) * wm));
  }
  flush() {
    if (!this.m.size) return;
    const m = this.m;
    this.m = new Map();
    this.d.g({ stroke: this.stroke, fill: 'none', 'stroke-linecap': 'round', ...this.a }, () => {
      for (const [w, s] of m) this.d.path(s, { 'stroke-width': w });
    });
  }
}

/** 2D 볼록 껍질(빛기둥 다각형용) */
function hull(points) {
  const p = points.filter(Boolean).slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [];
  for (const q of p) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
    lo.push(q);
  }
  const up = [];
  for (const q of p.slice().reverse()) {
    while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop();
    up.push(q);
  }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

/** 3D 다각형 하나 그리기 */
function face(d, cam, list, fill, a) {
  const p = cam.poly(list);
  if (p) d.poly(p, fill, a);
}

/** 3D 선분 */
function seg3(d, cam, a, b, stroke, wMeters, extra) {
  const s = cam.seg(a, b);
  if (!s) return;
  const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const w = typeof wMeters === 'number' && wMeters < 0 ? -wMeters : Math.max(0.6, cam.px(mid) * wMeters);
  d.line(s[0][0], s[0][1], s[1][0], s[1][1], stroke, w, extra);
}

/**
 * 축 정렬 박스(요 회전 가능). 보이는 면만 그린다.
 * o: { x:[x1,x2], y:[y1,y2], z:[z1,z2], col: 고유색 | {top,side,front,...}, yaw, pivot }
 */
function box(d, cam, o) {
  const [x1, x2] = o.x;
  const [y1, y2] = o.y;
  const [z1, z2] = o.z;
  let T = (p) => p;
  let R = (v) => v;
  if (o.T) {
    T = o.T;
    R = o.T.R;
  } else if (o.yaw) {
    const pv = o.pivot || [(x1 + x2) / 2, 0, (z1 + z2) / 2];
    const L = yawT(pv, o.yaw);
    T = (p) => L([p[0] - pv[0], p[1], p[2] - pv[2]]);
    R = L.R;
  }
  const faces = [
    { nm: [0, 1, 0], p: [[x1, y2, z1], [x2, y2, z1], [x2, y2, z2], [x1, y2, z2]], k: 'top' },
    { nm: [0, -1, 0], p: [[x1, y1, z1], [x2, y1, z1], [x2, y1, z2], [x1, y1, z2]], k: 'bottom' },
    { nm: [-1, 0, 0], p: [[x1, y1, z1], [x1, y2, z1], [x1, y2, z2], [x1, y1, z2]], k: 'left' },
    { nm: [1, 0, 0], p: [[x2, y1, z1], [x2, y2, z1], [x2, y2, z2], [x2, y1, z2]], k: 'right' },
    { nm: [0, 0, -1], p: [[x1, y1, z1], [x2, y1, z1], [x2, y2, z1], [x1, y2, z1]], k: 'front' },
    { nm: [0, 0, 1], p: [[x1, y1, z2], [x2, y1, z2], [x2, y2, z2], [x1, y2, z2]], k: 'back' },
  ];
  const ctr = T([(x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2]);
  const dist = o.noHaze ? 0 : cam.dist(ctr);
  for (const f of faces) {
    const nm = R(f.nm);
    const wp = f.p.map(T);
    if (!cam.faces(nm, wp[0])) continue;
    const col = o.col;
    const base = typeof col === 'string' ? col : col[f.k] || col.side || col.base;
    if (!base) continue;
    const fill = o.flat ? base : o.emit && o.emit[f.k] ? o.emit[f.k] : d.shade(base, nm, dist);
    face(d, cam, wp, fill, o.a);
  }
}

/** 박스 중심까지 거리(화가 알고리즘 정렬용) */
const boxDist = (cam, o) => {
  const c = [(o.x[0] + o.x[1]) / 2, (o.y[0] + o.y[1]) / 2, (o.z[0] + o.z[1]) / 2];
  return cam.dist(o.T ? o.T(c) : c);
};

// ---------------------------------------------------------------------------
// 하늘, 구름, 빛
// ---------------------------------------------------------------------------

function skyRect(d, stops, y0 = 0, y1 = H) {
  d.rect(0, y0, W, y1 - y0, d.lin(stops, 0, y0, 0, y1));
}

/** 빛번짐(원형 방사 그라데이션) */
function glow(d, x, y, r, color, op = 1, ry) {
  const fill = d.radB([
    [0, color, op],
    [0.35, color, op * 0.45],
    [1, color, 0],
  ]);
  if (ry) d.ellipse(x, y, r, ry, fill);
  else d.circle(x, y, r, fill);
}

/**
 * 적운(뭉게구름). y=구름 밑면, w=폭, h=높이.
 * c: { lit, mid, shade } 위→아래 색. lx = 빛 방향(-1 왼쪽 위에서, 1 오른쪽 위에서)
 */
function cumulus(d, o) {
  const r = d.r;
  const { x, y, w, h } = o;
  const c = o.c;
  const lx = o.lx ?? -0.5;
  const puffs = [];
  const count = Math.max(7, Math.round(w / (o.density ?? 26)));
  for (let i = 0; i < count; i++) {
    const u = r.range(-1, 1);
    const prof = Math.pow(Math.max(0, 1 - u * u), o.pow ?? 0.7);
    const rr = h * (0.16 + 0.3 * prof) * r.range(0.75, 1.15);
    const py = y - rr * 0.55 - prof * h * r.range(0.25, 0.62);
    puffs.push([x + (u * w) / 2, py, rr]);
  }
  puffs.sort((a, b) => b[1] - a[1]);
  const top = y - h * 1.05;
  const shadeFill = d.lin(
    [
      [0, c.mid],
      [0.55, c.mid],
      [1, c.shade],
    ],
    0,
    top,
    0,
    y,
  );
  const litFill = d.lin(
    [
      [0, c.lit],
      [0.6, c.lit],
      [1, c.mid],
    ],
    0,
    top,
    0,
    y,
  );
  const clip = d.clipRect(x - w, top - h, w * 2, y - top + h + (o.soft ?? 2));
  d.g({ filter: d.blur(o.blur ?? 1.6), opacity: o.op ?? 1 }, () => {
    d.g({ 'clip-path': clip }, () => {
      d.g({ fill: shadeFill }, () => {
        for (const [px, py, rr] of puffs) d.circle(px, py, rr);
        d.ellipse(x, y - h * 0.12, w * 0.5, h * 0.16);
      });
      d.g({ fill: litFill }, () => {
        for (const [px, py, rr] of puffs) d.circle(px + lx * rr * 0.16, py - rr * 0.2, rr * 0.8);
      });
      if (c.hi) {
        d.g({ fill: c.hi, opacity: 0.75 }, () => {
          for (const [px, py, rr] of puffs.slice(-Math.ceil(puffs.length / 2))) d.circle(px + lx * rr * 0.3, py - rr * 0.38, rr * 0.45);
        });
      }
    });
  });
}

/** 길게 퍼진 층운/권운 띠 */
function streakCloud(d, x, y, w, h, color, op = 0.6, blurSd = 3) {
  const r = d.r;
  d.g({ filter: d.blur(blurSd), fill: color, opacity: op }, () => {
    const k = Math.max(3, Math.round(w / 60));
    for (let i = 0; i < k; i++) {
      d.ellipse(x + r.range(-0.5, 0.5) * w, y + r.range(-0.5, 0.5) * h, w * r.range(0.12, 0.28), h * r.range(0.3, 0.6));
    }
  });
}

function stars(d, count, yMax, color = '#ffffff', seed = 7) {
  const r = rng(seed);
  d.g({ fill: color }, () => {
    for (let i = 0; i < count; i++) {
      const y = Math.pow(r(), 1.4) * yMax;
      const big = r.chance(0.08);
      d.circle(r.range(0, W), y, big ? r.range(1.4, 2.1) : r.range(0.5, 1.1), undefined, { opacity: +(r.range(0.35, 0.95) * (1 - (y / yMax) * 0.6)).toFixed(2) });
    }
  });
}

/** 빗줄기(패턴 2겹) */
function rain(d, op = 1, angle = 14) {
  const mk = (size, count, len, sw, seed) => {
    const r = rng(seed);
    let s = '';
    for (let i = 0; i < count; i++) {
      const x = r.range(0, size);
      const y = r.range(0, size);
      const l = len * r.range(0.6, 1.3);
      s += `<line x1="${n(x)}" y1="${n(y)}" x2="${n(x)}" y2="${n(y + l)}"/>`;
      if (y + l > size) s += `<line x1="${n(x)}" y1="${n(y - size)}" x2="${n(x)}" y2="${n(y + l - size)}"/>`;
    }
    return `<g stroke="#e8f0f6" stroke-width="${sw}" stroke-linecap="round">${s}</g>`;
  };
  const far = d.pattern(140, 140, mk(140, 26, 22, 1, 11), ` patternTransform="rotate(${angle})"`);
  const near = d.pattern(260, 260, mk(260, 14, 70, 1.8, 12), ` patternTransform="rotate(${angle})"`);
  d.rect(-100, -100, W + 200, H + 200, far, { opacity: +(0.4 * op).toFixed(2) });
  d.rect(-100, -100, W + 200, H + 200, near, { opacity: +(0.32 * op).toFixed(2) });
}

/** 늘어진 전선 */
function wire(d, a, b, sag, color, w = 1.4, op) {
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2 + sag * 2;
  d.path(`M${n(a[0])} ${n(a[1])}Q${n(mx)} ${n(my)} ${n(b[0])} ${n(b[1])}`, { fill: 'none', stroke: color, 'stroke-width': w, opacity: op });
}

/** 가로 방향 노이즈 곡선(산, 나무 줄 실루엣) → 아래로 닫힌 다각형 */
function ridge(d, y, amp, freq, fill, seed, yBottom = H, a) {
  const r = rng(seed);
  const ph = [r() * 6.28, r() * 6.28, r() * 6.28];
  const p = [[-20, yBottom]];
  for (let x = -20; x <= W + 20; x += 16) {
    const v =
      Math.sin(x * freq + ph[0]) * 0.55 + Math.sin(x * freq * 2.3 + ph[1]) * 0.3 + Math.sin(x * freq * 5.1 + ph[2]) * 0.15;
    p.push([x, y - amp * (0.5 + 0.5 * v)]);
  }
  p.push([W + 20, yBottom]);
  d.poly(p, fill, a);
}

/** 나뭇잎 덩어리(애니메 배경식 3단 명암 클러스터) */
function foliage(d, cx, cy, rx, ry, col, o = {}) {
  const r = o.r || d.r;
  const cnt = o.count ?? Math.max(8, Math.round((rx * ry) / 300));
  const lx = o.lx ?? -0.45;
  const ly = o.ly ?? -0.6;
  const blobs = [];
  for (let i = 0; i < cnt; i++) {
    const a = r.range(0, Math.PI * 2);
    const rad = Math.sqrt(r());
    const bx = cx + Math.cos(a) * rx * rad * 0.8;
    const by = cy + Math.sin(a) * ry * rad * 0.8;
    const br = Math.min(rx, ry) * r.range(0.22, 0.42) * (o.size ?? 1);
    blobs.push([bx, by, br]);
  }
  const inner = () => {
    d.g({ fill: col.dark }, () => {
      for (const [x, y, rr] of blobs) d.circle(x, y, rr);
    });
    d.g({ fill: col.mid }, () => {
      for (const [x, y, rr] of blobs) d.circle(x + lx * rr * 0.22, y + ly * rr * 0.25, rr * 0.78);
    });
    if (col.light) {
      d.g({ fill: col.light }, () => {
        for (const [x, y, rr] of blobs) {
          if ((x - cx) * lx + (y - cy) * ly > -rr * 0.2) d.circle(x + lx * rr * 0.4, y + ly * rr * 0.45, rr * 0.42);
        }
      });
    }
  };
  if (o.blur) d.g({ filter: d.blur(o.blur), opacity: o.op }, inner);
  else if (o.op) d.g({ opacity: o.op }, inner);
  else inner();
}

// ---------------------------------------------------------------------------
// 시간대(TOD) 조명 프리셋
//   amb: 하늘빛(그늘색) 배율, sun: 햇빛 배율, s: 해 방향(정규화), haze: 대기색
// ---------------------------------------------------------------------------

const TOD = {
  morning: {
    sky: [
      [0, '#2a7fdc'],
      [0.42, '#5eaaee'],
      [0.75, '#a6d4f5'],
      [1, '#e2f2fb'],
    ],
    amb: [0.74, 0.8, 0.92],
    sun: [0.42, 0.38, 0.3],
    s: norm([-0.55, 0.78, 0.2]),
    haze: '#cfe5f6',
    hazeD: 150,
    hazeMax: 0.85,
    sat: 1,
    flat: 0.6,
    cloud: { lit: '#ffffff', mid: '#eef4fb', shade: '#a3bddf', hi: '#ffffff' },
    glass: '#a9cbe8',
    glass2: '#e3f0fa',
    wire: '#2c3340',
    night: false,
  },
  day: {
    sky: [
      [0, '#2476d6'],
      [0.45, '#55a3ec'],
      [0.78, '#9ccdf3'],
      [1, '#dbeffa'],
    ],
    amb: [0.72, 0.77, 0.88],
    sun: [0.46, 0.43, 0.35],
    s: norm([-0.3, 0.9, 0.3]),
    haze: '#cde3f4',
    hazeD: 160,
    hazeMax: 0.85,
    sat: 1,
    flat: 0.62,
    cloud: { lit: '#ffffff', mid: '#eef4fb', shade: '#a0bbdd', hi: '#ffffff' },
    glass: '#a3c6e6',
    glass2: '#e0eef9',
    wire: '#2c3340',
    night: false,
  },
  afternoon: {
    sky: [
      [0, '#3c80cf'],
      [0.45, '#7cb2e2'],
      [0.8, '#d2dfe9'],
      [1, '#f8e2bd'],
    ],
    amb: [0.68, 0.66, 0.74],
    sun: [0.56, 0.45, 0.3],
    s: norm([0.45, 0.45, 0.75]),
    haze: '#eadfcf',
    hazeD: 120,
    hazeMax: 0.8,
    sat: 1,
    flat: 0.55,
    cloud: { lit: '#fff6e6', mid: '#f3e8de', shade: '#aeadc4', hi: '#fffaf0' },
    glass: '#c9d2dc',
    glass2: '#f6e7cf',
    wire: '#30303c',
    night: false,
  },
  evening: {
    sky: [
      [0, '#3a3f86'],
      [0.32, '#8c5a9a'],
      [0.6, '#e07a7a'],
      [0.82, '#f6a865'],
      [1, '#ffd88f'],
    ],
    amb: [0.52, 0.42, 0.58],
    sun: [0.74, 0.45, 0.22],
    s: norm([0.18, 0.2, 1]),
    haze: '#f0a07c',
    hazeD: 90,
    hazeMax: 0.75,
    sat: 1,
    flat: 0.45,
    cloud: { lit: '#ffc9a0', mid: '#f19a8e', shade: '#7a5a92', hi: '#ffe6b8' },
    glass: '#f1a27e',
    glass2: '#ffd9a2',
    wire: '#2a1e34',
    night: false,
  },
  rain: {
    sky: [
      [0, '#5f6c7b'],
      [0.5, '#808c99'],
      [1, '#a7b0b9'],
    ],
    amb: [0.66, 0.7, 0.77],
    sun: [0.05, 0.05, 0.06],
    s: norm([0, 1, 0.2]),
    haze: '#9aa5b0',
    hazeD: 45,
    hazeMax: 0.9,
    sat: 0.55,
    flat: 0.5,
    cloud: { lit: '#b5bdc6', mid: '#98a2ad', shade: '#6d7884' },
    glass: '#7f8c99',
    glass2: '#aab4be',
    wire: '#2b3038',
    night: false,
  },
  night: {
    sky: [
      [0, '#141a42'],
      [0.45, '#28306a'],
      [0.8, '#4a4384'],
      [1, '#6a5290'],
    ],
    amb: [0.34, 0.36, 0.6],
    sun: [0.08, 0.09, 0.14],
    s: norm([-0.3, 0.8, 0.5]),
    haze: '#3e3e7a',
    hazeD: 90,
    hazeMax: 0.7,
    sat: 0.9,
    flat: 0.5,
    cloud: { lit: '#4e4e8c', mid: '#3a3c74', shade: '#2a2c5c' },
    glass: '#2a2e58',
    glass2: '#3e4072',
    wire: '#0d0f22',
    night: true,
  },
};

// 공통 고유색
const MAT = {
  asphalt: '#7d8088',
  asphaltDark: '#5d6068',
  concrete: '#c9c6bf',
  block: '#bdb8ae',
  white: '#f2f0ea',
  cream: '#ece2cc',
  beige: '#dcc9ab',
  gray: '#c3c7ca',
  paleBlue: '#c2d3dc',
  brownWall: '#9b7a5e',
  roofNavy: '#465165',
  roofGray: '#5d636c',
  roofBrown: '#7a5444',
  roofGreen: '#56705f',
  roofRed: '#9a4c3c',
  grass: '#7fae5a',
  leafDark: '#2f5a3a',
  leafMid: '#4f8a46',
  leafLight: '#8cc461',
  wood: '#b48a5e',
  woodDark: '#7a5638',
  pole: '#8f8a80',
  steel: '#9aa1a8',
};

/** 나뭇잎 3단 색을 시간대에 맞게 */
function leaves(d, dist = 0, k) {
  return {
    dark: d.G(MAT.leafDark, dist, 0.1),
    mid: d.G(MAT.leafMid, dist, k ?? 0.5),
    light: d.G(MAT.leafLight, dist, 1),
  };
}

// ---------------------------------------------------------------------------
// 공통 부품: 집(박공지붕), 전봇대
// ---------------------------------------------------------------------------

/**
 * 박공지붕 집. ridge: 'z'(용마루가 길 방향) | 'x'(길과 직각)
 * o: { x:[a,b], z:[a,b], h, rh, wall, roof, ov, win:{...} }
 */
function house(d, cam, o) {
  const [xa, xb] = o.x;
  const [za, zb] = o.z;
  const h = o.h;
  const rh = o.rh;
  const ov = o.ov ?? 0.45;
  const ctr = [(xa + xb) / 2, h / 2, (za + zb) / 2];
  const dist = cam.dist(ctr);
  const t = d.t;
  const roofCol = (nm) => d.shade(o.roof, nm, dist);
  const soffit = d.shade(scale(o.roof, 0.55), [0, -1, 0], dist);

  // 지붕면
  const slopes = [];
  if (o.ridge === 'z') {
    const xm = (xa + xb) / 2;
    const hw = (xb - xa) / 2;
    const yE = h - (ov * rh) / hw;
    const R = [xm, h + rh];
    slopes.push({ nm: norm([-rh, hw, 0]), p: [[xa - ov, yE, za - ov], [xa - ov, yE, zb + ov], [R[0], R[1], zb + ov], [R[0], R[1], za - ov]] });
    slopes.push({ nm: norm([rh, hw, 0]), p: [[xb + ov, yE, za - ov], [xb + ov, yE, zb + ov], [R[0], R[1], zb + ov], [R[0], R[1], za - ov]] });
  } else {
    const zm = (za + zb) / 2;
    const hd = (zb - za) / 2;
    const yE = h - (ov * rh) / hd;
    slopes.push({ nm: norm([0, hd, -rh]), p: [[xa - ov, yE, za - ov], [xb + ov, yE, za - ov], [xb + ov, h + rh, zm], [xa - ov, h + rh, zm]] });
    slopes.push({ nm: norm([0, hd, rh]), p: [[xa - ov, yE, zb + ov], [xb + ov, yE, zb + ov], [xb + ov, h + rh, zm], [xa - ov, h + rh, zm]] });
  }
  const vis = slopes.map((s) => cam.faces(s.nm, s.p[0]));
  slopes.forEach((s, i) => {
    if (!vis[i]) face(d, cam, s.p, soffit);
  });

  // 벽 + 박공 삼각형
  const walls = [
    { nm: [-1, 0, 0], X: xa, k: 'x' },
    { nm: [1, 0, 0], X: xb, k: 'x' },
    { nm: [0, 0, -1], Z: za, k: 'z' },
    { nm: [0, 0, 1], Z: zb, k: 'z' },
  ];
  for (const w of walls) {
    const p0 = w.k === 'x' ? [w.X, 0, za] : [xa, 0, w.Z];
    if (!cam.faces(w.nm, p0)) continue;
    const col = d.shade(o.wall, w.nm, dist);
    let quad;
    let gable = null;
    if (w.k === 'x') {
      quad = [[w.X, 0, za], [w.X, h, za], [w.X, h, zb], [w.X, 0, zb]];
      if (o.ridge === 'z') gable = null;
      else gable = [[w.X, h, za], [w.X, h + rh, (za + zb) / 2], [w.X, h, zb]];
    } else {
      quad = [[xa, 0, w.Z], [xa, h, w.Z], [xb, h, w.Z], [xb, 0, w.Z]];
      if (o.ridge === 'z') gable = [[xa, h, w.Z], [(xa + xb) / 2, h + rh, w.Z], [xb, h, w.Z]];
    }
    face(d, cam, quad, col);
    if (gable) face(d, cam, gable, col);
    // 창문
    if (o.win !== false) houseWindows(d, cam, o, w, dist);
  }
  // 앞쪽 지붕면
  slopes.forEach((s, i) => {
    if (vis[i]) face(d, cam, s.p, roofCol(s.nm));
  });
  // 처마 끝선
  if (o.ridge === 'z') {
    for (const xs of [xa - o.ov, xb + o.ov]) {
      // nothing: 처마선은 지붕면 경계로 충분
      void xs;
    }
  }
  void t;
}

function houseWindows(d, cam, o, w, dist) {
  const t = d.t;
  const r = o.r || d.r;
  const floors = o.floors ?? (o.h > 4.5 ? 2 : 1);
  const span = w.k === 'x' ? [o.z[0], o.z[1]] : [o.x[0], o.x[1]];
  const len = span[1] - span[0];
  const cols = Math.max(1, Math.floor(len / 2.6));
  const frame = d.shade('#e9e6df', w.nm, dist);
  for (let f = 0; f < floors; f++) {
    const y1 = 0.95 + f * 2.75;
    const y2 = y1 + (f === 0 ? 1.25 : 1.05);
    if (y2 > o.h - 0.2) continue;
    for (let c = 0; c < cols; c++) {
      if (!r.chance(o.winP ?? 0.75)) continue;
      const u0 = span[0] + (len / cols) * (c + 0.22);
      const u1 = span[0] + (len / cols) * (c + 0.78);
      const off = w.nm[0] + w.nm[2] > 0 ? 0.02 : -0.02;
      const P = (u, y) => (w.k === 'x' ? [w.X + off, y, u] : [u, y, w.Z + off]);
      const quad = [P(u0, y1), P(u0, y2), P(u1, y2), P(u1, y1)];
      let glass;
      const lit = t.night ? r.chance(o.litP ?? 0.55) : false;
      if (lit) glass = r.pick(['#ffd98a', '#ffe7b0', '#ffc977']);
      else glass = d.G(mix(t.glass, t.glass2, r()), dist * 0.5, 0.6);
      const pp = cam.poly(quad);
      if (!pp) continue;
      const sw = Math.max(0.7, cam.px([quad[0][0], y1, quad[0][2]]) * 0.08);
      d.poly(pp, glass, { stroke: frame, 'stroke-width': sw });
      if (lit && o.glowList) o.glowList.push(cam.P(P((u0 + u1) / 2, (y1 + y2) / 2)).concat(cam.px(quad[0]) * 1.6));
    }
  }
}

/**
 * 전봇대. base=[X,0,Z]. arms: 완금 높이 목록. 반환: 전선 연결점(화면 좌표)
 */
function pole(d, cam, X, Z, o = {}) {
  const hgt = o.h ?? 10;
  const dist = cam.dist([X, 4, Z]);
  const col = d.G(o.col ?? MAT.pole, dist, 0.5);
  const dark = d.G(scale(o.col ?? MAT.pole, 0.6), dist, 0.2);
  const b = cam.P([X, 0, Z]);
  const tp = cam.P([X, hgt, Z]);
  const s = cam.px([X, 0, Z]);
  const w0 = 0.32 * s;
  const w1 = 0.2 * s;
  d.poly([[b[0] - w0 / 2, b[1]], [b[0] + w0 / 2, b[1]], [tp[0] + w1 / 2, tp[1]], [tp[0] - w1 / 2, tp[1]]], col);
  // 그늘진 쪽
  const sd = d.t.s[0] > 0 ? -1 : 1;
  d.poly([[b[0] + (sd * w0) / 2, b[1]], [b[0] + (sd * w0) / 6, b[1]], [tp[0] + (sd * w1) / 6, tp[1]], [tp[0] + (sd * w1) / 2, tp[1]]], dark, { opacity: 0.7 });
  const pts2 = [];
  const arms = o.arms ?? [hgt - 0.4, hgt - 1.2];
  for (const ay of arms) {
    const a1 = cam.P([X - 0.75, ay, Z]);
    const a2 = cam.P([X + 0.75, ay, Z]);
    d.line(a1[0], a1[1], a2[0], a2[1], dark, Math.max(1, 0.1 * s));
    pts2.push([X - 0.65, ay + 0.12, Z], [X, ay + 0.12, Z], [X + 0.65, ay + 0.12, Z]);
  }
  // 변압기
  if (o.trans) {
    const ty = hgt - 2.6;
    const c = cam.P([X + (o.trans > 0 ? 0.35 : -0.35), ty, Z]);
    d.rect(c[0] - 0.22 * s, c[1] - 0.45 * s, 0.44 * s, 0.9 * s, d.G('#9aa0a4', dist, 0.6), { rx: 0.12 * s });
  }
  // 가로등 팔
  if (o.lamp) {
    const ly = o.lampY ?? 5.2;
    const a = cam.P([X, ly, Z]);
    const e = cam.P([X + o.lamp, ly + 0.25, Z]);
    d.line(a[0], a[1], e[0], e[1], dark, Math.max(1, 0.07 * s));
    d.rect(e[0] - 0.22 * s, e[1] - 0.02 * s, 0.44 * s, 0.1 * s, d.t.night ? '#fff4d6' : d.G('#d8dade', dist, 0.6), { rx: 0.04 * s });
    if (o.lampOut) o.lampOut.push([X + o.lamp, ly, Z]);
  }
  // 표지판 띠(무늬만)
  if (o.band) {
    const y1 = cam.P([X, 2.4, Z])[1];
    const y2 = cam.P([X, 3.4, Z])[1];
    const xx = cam.P([X, 2.9, Z])[0];
    d.rect(xx - w0 * 0.55, y2, w0 * 1.1, y1 - y2, d.G(o.band, dist, 0.6));
    d.rect(xx - w0 * 0.55, y2 + (y1 - y2) * 0.4, w0 * 1.1, (y1 - y2) * 0.2, d.G('#f3efe3', dist, 0.6));
  }
  return pts2;
}

/** 두 전봇대의 연결점을 전선으로 잇기 */
function wiresBetween(d, cam, A, B, color, sagM = 0.5) {
  for (let i = 0; i < Math.min(A.length, B.length); i++) {
    const a = cam.P(A[i]);
    const b = cam.P(B[i]);
    const mid = [(A[i][0] + B[i][0]) / 2, (A[i][1] + B[i][1]) / 2, (A[i][2] + B[i][2]) / 2];
    const s = cam.px(mid);
    wire(d, a, b, sagM * s * 0.5, color, Math.max(0.8, Math.min(2.4, s * 0.025)));
  }
}

/** 땅에 비친 빛 웅덩이(가로등 아래 등) */
function groundGlow(d, cam, X, Z, rM, color, op = 0.55) {
  const c = cam.P([X, 0, Z]);
  const s = cam.px([X, 0, Z]);
  const ry = Math.max(4, s * rM * ((cam.eye) / Math.max(0.5, cam.depth([X, 0, Z]))) * 1.0);
  glow(d, c[0], c[1], s * rM, color, op, ry);
}

// ---------------------------------------------------------------------------
// 장면: 주택가 길 (아침/노을/비/밤) — 같은 시드로 같은 거리
// ---------------------------------------------------------------------------

function sceneRoad(id, t) {
  const d = new Doc(id, t, 1101);
  const r = d.r;
  const cam = camera({ hy: 440, f: 820, eye: 1.55, x0: 0.3 });
  const night = t.night;
  const isRain = id === 'road_rain';
  const isEve = id === 'road_evening';
  const lampPts = [];
  const winGlows = [];

  // 하늘
  skyRect(d, t.sky, 0, cam.hy + 40);
  if (isEve) {
    glow(d, 900, 425, 520, '#ffe2a0', 0.75, 300);
    glow(d, 900, 430, 120, '#fff4d0', 0.95);
  }
  if (id === 'road_morning') glow(d, 120, 40, 520, '#ffffff', 0.55);
  if (night) {
    stars(d, 110, 380, '#fff', 3);
    glow(d, 800, 470, 700, '#7a5a8e', 0.45, 160);
  }
  // 구름
  const cl = t.cloud;
  if (isRain) {
    d.g({ filter: d.blur(6) }, () => {
      for (let i = 0; i < 9; i++) d.ellipse(r.range(0, W), r.range(40, 300), r.range(220, 420), r.range(40, 90), mix(cl.mid, cl.shade, r()), { opacity: 0.8 });
    });
  } else if (night) {
    streakCloud(d, 1150, 170, 700, 60, cl.lit, 0.5, 5);
    streakCloud(d, 350, 110, 500, 40, cl.mid, 0.5, 5);
  } else {
    cumulus(d, { x: 1180, y: 380, w: 620, h: 260, c: cl, lx: isEve ? 0 : -0.6, blur: 1.8 });
    cumulus(d, { x: 1250, y: 250, w: 300, h: 150, c: cl, lx: isEve ? 0 : -0.6, blur: 1.6 });
    cumulus(d, { x: 420, y: 330, w: 360, h: 110, c: cl, lx: isEve ? 0 : -0.6, blur: 2 });
    streakCloud(d, 700, 90, 600, 30, cl.lit, 0.55, 4);
  }
  // 원경 산/마을
  ridge(d, cam.hy - 6, 30, 0.004, d.G('#7d9ab0', 400, 0.5), 21, cam.hy + 30);
  d.g({ filter: d.blur(1.2) }, () => {
    for (let i = 0; i < 26; i++) {
      const x = r.range(560, 1060);
      const w = r.range(14, 40);
      const hh = r.range(6, 22);
      d.rect(x, cam.hy - hh, w, hh + 30, d.G(r.pick([MAT.cream, MAT.gray, MAT.paleBlue]), 220, 0.6));
    }
  });

  // 지면 바탕
  d.rect(0, cam.hy - 2, W, H - cam.hy + 2, d.G(MAT.asphalt, 30, 0.6));

  // 오른쪽: 밭(빈터) + 낮은 펜스
  face(d, cam, [[3.4, 0, 2], [40, 0, 2], [40, 0, 30], [3.4, 0, 30]], d.G('#86a85e', 15, 0.8));
  // 밭고랑
  for (let i = 0; i < 9; i++) {
    const X = 5 + i * 3.2;
    seg3(d, cam, [X, 0.01, 3], [X, 0.01, 29], d.G('#5f7f46', 18, 0.5), 0.25);
  }
  // 왼쪽 마당 바닥
  face(d, cam, [[-14, 0, 1], [-3.3, 0, 1], [-3.3, 0, 140], [-14, 0, 140]], d.G('#8f8c82', 30, 0.5));

  // 집 배치(시드 고정)
  const wallC = [MAT.cream, MAT.white, MAT.gray, MAT.beige, MAT.paleBlue, MAT.cream];
  const roofC = [MAT.roofNavy, MAT.roofGray, MAT.roofBrown, MAT.roofNavy, MAT.roofGreen];
  const left = [];
  let z = 4;
  while (z < 120) {
    const len = r.range(6, 9);
    left.push({ x: [-12, -4.6 - r.range(0, 0.8)], z: [z, z + len], h: r.range(5.4, 6.4), rh: r.range(1.6, 2.4), ridge: r.chance(0.6) ? 'x' : 'z', wall: r.pick(wallC), roof: r.pick(roofC), tree: r.chance(0.45) });
    z += len + r.range(1.2, 3);
  }
  const right = [];
  z = 31;
  while (z < 120) {
    const len = r.range(6, 9);
    right.push({ x: [4.8 + r.range(0, 0.8), 12], z: [z, z + len], h: r.range(5.4, 6.4), rh: r.range(1.6, 2.4), ridge: r.chance(0.6) ? 'x' : 'z', wall: r.pick(wallC), roof: r.pick(roofC), tree: r.chance(0.4) });
    z += len + r.range(1.2, 3);
  }
  // 밭 너머 집(정면이 보임)
  const back = [];
  let x = 7;
  while (x < 40) {
    const wdt = r.range(6, 8.5);
    back.push({ x: [x, x + wdt], z: [33 + r.range(0, 3), 41], h: r.range(5.4, 6.4), rh: r.range(1.8, 2.4), ridge: r.chance(0.5) ? 'x' : 'z', wall: r.pick(wallC), roof: r.pick(roofC), tree: r.chance(0.5) });
    x += wdt + r.range(1.5, 3);
  }
  const all = [...left, ...right, ...back].sort((a, b) => (b.z[0] + b.z[1]) - (a.z[0] + a.z[1]));
  for (const hs of all) {
    const dist = cam.dist([(hs.x[0] + hs.x[1]) / 2, 3, hs.z[0]]);
    if (hs.tree) {
      const tx = hs.x[0] < 0 ? hs.x[1] - 0.8 : hs.x[0] + 0.8;
      const tz = hs.z[1] + 0.8;
      const c = cam.P([tx, 4.8, tz]);
      const s = cam.px([tx, 4.8, tz]);
      foliage(d, c[0], c[1], s * 2.4, s * 2.0, leaves(d, dist), { lx: t.s[0] < 0 ? -0.5 : 0.4, blur: dist > 40 ? 1.2 : 0 });
    }
    house(d, cam, { ...hs, glowList: winGlows, r });
  }

  // 왼쪽 블록담
  const wallTop = 1.7;
  const gaps = [[11, 12.6], [27, 28.2], [44, 45.5]];
  const segs = [];
  let zs = 1.2;
  for (const [g0, g1] of gaps) {
    segs.push([zs, g0]);
    zs = g1;
  }
  segs.push([zs, 130]);
  const wallCol = d.shade(MAT.block, [1, 0, 0], 8);
  const wallTopCol = d.shade('#d9d4ca', [0, 1, 0], 8);
  for (const [a, b] of segs.slice().reverse()) {
    if (b < 130) {
      // 문기둥 정면
      face(d, cam, [[-3.6, 0, b], [-3.3, 0, b], [-3.3, wallTop, b], [-3.6, wallTop, b]], d.shade(MAT.block, [0, 0, -1], 10));
    }
    face(d, cam, [[-3.3, 0, a], [-3.3, wallTop, a], [-3.3, wallTop, b], [-3.3, 0, b]], wallCol);
    face(d, cam, [[-3.3, wallTop - 0.08, a], [-3.3, wallTop, a], [-3.3, wallTop, b], [-3.3, wallTop - 0.08, b]], wallTopCol);
    face(d, cam, [[-3.6, wallTop, a], [-3.3, wallTop, a], [-3.3, wallTop, b], [-3.6, wallTop, b]], wallTopCol);
    // 블록 줄눈
    for (let yy = 0.2; yy < wallTop - 0.1; yy += 0.2) seg3(d, cam, [-3.29, yy, a], [-3.29, yy, Math.min(b, 40)], d.shade(scale(MAT.block, 0.8), [1, 0, 0], 10), 0.012);
    for (let zz = a + 0.4; zz < Math.min(b, 14); zz += 0.4) {
      const row = Math.round(((zz - a) / 0.4) % 2);
      for (let yy = 0; yy < wallTop - 0.2; yy += 0.4) seg3(d, cam, [-3.29, yy + row * 0.2, zz], [-3.29, yy + row * 0.2 + 0.2, zz], d.shade(scale(MAT.block, 0.82), [1, 0, 0], 10), 0.012);
    }
  }
  // 담 위로 넘친 나무(왼쪽 앞)
  {
    const c = cam.P([-4.5, 3.2, 6.5]);
    const s = cam.px([-4.5, 3.2, 6.5]);
    foliage(d, c[0] - 40, c[1], s * 1.6, s * 1.3, leaves(d, 6), { lx: t.s[0] < 0 ? -0.5 : 0.4, count: 22 });
  }

  // 오른쪽 펜스(밭 앞)
  const fenceC = d.G('#8e959c', 8, 0.6);
  for (let zz = 2; zz < 30; zz += 2) {
    const a = cam.P([3.45, 0, zz]);
    const b = cam.P([3.45, 1.1, zz]);
    d.line(a[0], a[1], b[0], b[1], fenceC, Math.max(1, cam.px([3.45, 0, zz]) * 0.05));
  }
  seg3(d, cam, [3.45, 1.1, 1.5], [3.45, 1.1, 30], fenceC, 0.04);
  seg3(d, cam, [3.45, 0.6, 1.5], [3.45, 0.6, 30], fenceC, 0.02);

  // 도로
  const road = [[-3.3, 0, 1], [3.45, 0, 1], [3.45, 0, 150], [-3.3, 0, 150]];
  const rp = cam.poly(road);
  const near = isRain ? '#4e5660' : night ? '#2b2d4a' : isEve ? '#5a4660' : '#6f737c';
  const far = isRain ? '#8f99a3' : night ? '#3e3a66' : isEve ? '#e3a07a' : '#a9adb2';
  d.poly(rp, d.lin([[0, far], [0.25, mix(far, near, 0.5)], [1, near]], 0, cam.hy, 0, H));
  // 노변 흰 선
  for (const X of [-2.85, 3.0]) {
    face(d, cam, [[X - 0.07, 0.005, 1.5], [X + 0.07, 0.005, 1.5], [X + 0.07, 0.005, 140], [X - 0.07, 0.005, 140]], d.G('#eeeeea', 10, 0.8), { opacity: 0.85 });
  }
  // 측구 뚜껑(오른쪽)
  face(d, cam, [[3.0, 0.006, 1.5], [3.45, 0.006, 1.5], [3.45, 0.006, 60], [3.0, 0.006, 60]], d.G('#a4a19a', 10, 0.6), { opacity: 0.8 });

  // 그림자/빛
  if (id === 'road_morning') {
    // 왼쪽 담·집 그림자(해가 왼쪽 위)
    const s = t.s;
    const proj = (p) => [p[0] - (s[0] * p[1]) / s[1], 0.01, p[2] - (s[2] * p[1]) / s[1]];
    const shp = [];
    shp.push([-3.3, 0.01, 1]);
    for (const hs of left) {
      if (hs.z[0] > 60) break;
      shp.push(proj([-3.3, wallTop, hs.z[0] - 1]));
      shp.push(proj([hs.x[1], hs.h, hs.z[0]]));
      shp.push(proj([hs.x[1], hs.h, hs.z[1]]));
      shp.push(proj([-3.3, wallTop, hs.z[1] + 0.5]));
    }
    shp.push([-3.3, 0.01, 62]);
    d.g({ opacity: 0.5 }, () => face(d, cam, shp, '#3a4a7a'));
  }
  if (isEve) {
    // 길 끝에서 오는 빛줄기와 긴 그림자
    d.g({ opacity: 0.35 }, () => {
      face(d, cam, [[-2, 0.01, 90], [2.6, 0.01, 90], [3.2, 0.01, 2], [-1.4, 0.01, 2]], d.lin([[0, '#ffd29a'], [1, '#ffb27a', 0]], 0, cam.hy, 0, H));
    });
  }
  if (isRain) {
    // 젖은 노면 반사
    d.g({ filter: d.blur(4), opacity: 0.45 }, () => {
      face(d, cam, [[-1.2, 0.01, 60], [1.6, 0.01, 60], [2.2, 0.01, 3], [-1.8, 0.01, 3]], d.lin([[0, '#c4ccd4'], [1, '#c4ccd4', 0]], 0, cam.hy, 0, 760));
    });
    for (const [px, pz, pr] of [[-1.6, 5, 0.9], [1.2, 9, 1.2], [-0.4, 16, 1], [2.1, 4, 0.7]]) {
      const c = cam.P([px, 0, pz]);
      const s = cam.px([px, 0, pz]);
      d.ellipse(c[0], c[1], s * pr, s * pr * (cam.eye / pz), '#b9c3cc', { opacity: 0.55 });
    }
  }

  // 오른쪽 전봇대 + 자판기
  const poles = [4.5, 16, 28, 40, 52, 64, 76];
  const conns = [];
  // 자판기(밭 앞, 펜스 앞)
  const vmZ = 10;
  box(d, cam, { x: [2.55, 3.35], y: [0, 1.85], z: [vmZ, vmZ + 1.05], col: { front: '#d9dde2', left: '#e8ecef', top: '#c9cdd2', back: '#c0c4c8', right: '#c0c4c8' } });
  {
    // 자판기 앞면(길 쪽, X=2.55 면) 상품 진열창
    const P = (y, zz) => [2.54, y, vmZ + zz];
    const lit = night || isRain || isEve;
    face(d, cam, [P(1.05, 0.08), P(1.7, 0.08), P(1.7, 0.97), P(1.05, 0.97)], lit ? '#f4f7ff' : d.G('#eef2f6', 8, 0.8));
    for (let row = 0; row < 3; row++) {
      for (let k = 0; k < 6; k++) {
        const zz = 0.12 + k * 0.14;
        const y = 1.12 + row * 0.19;
        face(d, cam, [P(y, zz), P(y + 0.12, zz), P(y + 0.12, zz + 0.09), P(y, zz + 0.09)], r.pick(['#e2524a', '#3f86d6', '#f0c33c', '#4bb06a', '#f08a3a', '#8a5ad6']));
      }
    }
    face(d, cam, [P(0.25, 0.25), P(0.45, 0.25), P(0.45, 0.8), P(0.25, 0.8)], d.G('#2f3238', 8, 0.5));
    face(d, cam, [P(1.72, 0.04), P(1.84, 0.04), P(1.84, 1.01), P(1.72, 1.01)], d.G('#d9423c', 8, 0.7));
    if (lit) {
      const c = cam.P([2.4, 1.3, vmZ + 0.5]);
      glow(d, c[0], c[1], cam.px([2.4, 1, vmZ]) * 2.2, '#e8f0ff', night ? 0.55 : 0.35);
      if (night || isRain) groundGlow(d, cam, 2.0, vmZ + 0.5, 2.2, '#dfe8ff', night ? 0.45 : 0.3);
    }
  }
  for (const zp of poles.slice().reverse()) {
    conns.unshift(pole(d, cam, 3.75, zp, { trans: zp === 16 ? 1 : 0, lamp: zp % 24 === 16 ? -1.3 : 0, lampOut: lampPts, band: zp === 4.5 ? '#e6c23a' : null }));
  }
  for (let i = 0; i < conns.length - 1; i++) wiresBetween(d, cam, conns[i], conns[i + 1], t.wire, 0.6);
  // 길을 건너는 전선
  {
    const a = cam.P([3.1, 9.2, 16]);
    for (const [zz, yy] of [[19, 6.2], [22, 6.6]]) {
      const b = cam.P([-4.8, yy, zz]);
      wire(d, a, b, 10, t.wire, 1.3);
    }
    const a2 = cam.P([3.1, 8.6, 4.5]);
    const b2 = cam.P([-4.6, 6.2, 9]);
    wire(d, a2, b2, 30, t.wire, 2.2);
  }

  // 왼쪽 커브미러
  {
    const X = -3.0;
    const Z = 7.5;
    const b = cam.P([X, 0, Z]);
    const tp = cam.P([X, 2.7, Z]);
    const s = cam.px([X, 0, Z]);
    d.line(b[0], b[1], tp[0], tp[1], d.G('#e0743a', 7, 0.7), 0.09 * s);
    const m = cam.P([X + 0.05, 2.95, Z]);
    d.ellipse(m[0], m[1], 0.42 * s, 0.45 * s, d.G('#e0743a', 7, 0.7));
    d.ellipse(m[0] + 0.02 * s, m[1], 0.34 * s, 0.37 * s, night ? '#3a3f70' : d.G(t.glass2, 7, 0.9));
    d.ellipse(m[0] - 0.08 * s, m[1] - 0.1 * s, 0.1 * s, 0.14 * s, '#ffffff', { opacity: 0.6 });
  }

  // 빛(밤/비): 가로등
  if (night || isRain) {
    for (const p of lampPts) {
      const c = cam.P(p);
      const s = cam.px(p);
      if (night) {
        glow(d, c[0], c[1] + 0.2 * s, s * 2.6, '#fff1c8', 0.75);
        groundGlow(d, cam, p[0] - 0.2, p[2], 3.4, '#ffe2a6', 0.5);
      } else glow(d, c[0], c[1], s * 1.5, '#eef4ff', 0.5);
    }
  }
  if (night) {
    d.g({}, () => {
      for (const [gx, gy, gr] of winGlows) glow(d, gx, gy, gr, '#ffcf7a', 0.35);
    });
  }

  // 전경: 앞쪽 왼쪽 담 위 잎사귀(블러) — 깊이감
  {
    const lv = leaves(d, 0);
    foliage(d, 40, 60, 160, 120, lv, { blur: 6, count: 26, lx: 0.3 });
  }
  if (isRain) {
    d.rect(0, 0, W, H, d.lin([[0, '#9aa6b2', 0.25], [0.5, '#9aa6b2', 0.05], [1, '#5a6570', 0.1]], 0, 0, 0, H));
    rain(d, 1);
  }
  if (isEve) d.rect(0, 0, W, H, d.lin([[0, '#5a3a7a', 0.15], [0.45, '#ffb070', 0], [1, '#4a2a5a', 0.22]], 0, 0, 0, H));
  if (night) d.rect(0, 0, W, H, d.lin([[0, '#000020', 0], [1, '#100a30', 0.25]], 0, 0, 0, H));
  return d;
}

// ---------------------------------------------------------------------------
// 등록 및 출력
// ---------------------------------------------------------------------------

const SCENES = {
  road_morning: () => sceneRoad('road_morning', TOD.morning),
  road_evening: () => sceneRoad('road_evening', TOD.evening),
  road_rain: () => sceneRoad('road_rain', TOD.rain),
  road_night: () => sceneRoad('road_night', TOD.night),
};

function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const only = process.argv.slice(2);
  const ids = only.length ? only : Object.keys(SCENES);
  let failed = false;
  for (const id of ids) {
    const fn = SCENES[id];
    if (!fn) {
      console.error(`알 수 없는 배경 id: ${id}`);
      failed = true;
      continue;
    }
    const svg = fn().svg();
    const bytes = Buffer.byteLength(svg);
    writeFileSync(join(OUT_DIR, `${id}.svg`), svg);
    const flag = bytes > MAX_BYTES ? '  ← 90KB 초과!' : '';
    if (bytes > MAX_BYTES) failed = true;
    console.log(`${id.padEnd(20)} ${(bytes / 1024).toFixed(1).padStart(6)} KB${flag}`);
  }
  if (failed) process.exitCode = 1;
}

main();
