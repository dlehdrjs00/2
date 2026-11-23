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

/**
 * 나뭇잎 덩어리(애니메 배경식 3단 명암 클러스터).
 * 바깥쪽에 작은 덩어리를 많이 두어 윤곽을 울퉁불퉁하게 하고,
 * 빛 쪽 절반에만 밝은 덩어리를 겹쳐 하이라이트가 이어진 면으로 보이게 한다.
 */
function foliage(d, cx, cy, rx, ry, col, o = {}) {
  const r = o.r || d.r;
  const cnt = o.count ?? Math.max(10, Math.round((rx * ry) / 260));
  const lx = o.lx ?? -0.45;
  const ly = o.ly ?? -0.6;
  const L = Math.hypot(lx, ly) || 1;
  const ux = lx / L;
  const uy = ly / L;
  const hk = col.hi ?? 1;
  const blobs = [];
  for (let i = 0; i < cnt; i++) {
    const a = r.range(0, Math.PI * 2);
    const rad = Math.pow(r(), 0.55);
    const bx = cx + Math.cos(a) * rx * rad * 0.8;
    const by = cy + Math.sin(a) * ry * rad * 0.8;
    const br = Math.min(rx, ry) * r.range(0.2, 0.34) * (o.size ?? 1) * (1.3 - 0.55 * rad);
    blobs.push([bx, by, br, ((bx - cx) / rx) * ux + ((by - cy) / ry) * uy]);
  }
  // 빛 방향 그라데이션(밝은 면 → 중간 → 그늘)
  const grad = d.lin(
    [
      [0, col.light || col.mid],
      [0.42, col.mid],
      [1, mix(col.mid, col.dark, 0.6)],
    ],
    cx + ux * rx,
    cy + uy * ry,
    cx - ux * rx,
    cy - uy * ry,
  );
  const inner = () => {
    d.g({ fill: col.dark }, () => {
      for (const [x, y, rr] of blobs) d.circle(x - ux * rr * 0.1, y - uy * rr * 0.1, rr);
    });
    d.g({ fill: grad }, () => {
      for (const [x, y, rr] of blobs) d.circle(x + ux * rr * 0.08, y + uy * rr * 0.08, rr * 0.86);
    });
    if (col.light) {
      d.g({ fill: col.light, opacity: 0.85 }, () => {
        for (const [x, y, rr, p] of blobs) {
          if (p < 0.45) continue;
          d.circle(x + ux * rr * 0.28, y + uy * rr * 0.28, rr * 0.5 * hk);
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
    leaf: { dark: '#2c4038', mid: '#56784e', light: '#b0946a' },
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
    amb: [0.4, 0.42, 0.68],
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
  const L = d.t.leaf;
  if (L) {
    return {
      dark: d.G(L.dark, dist, 0),
      mid: d.G(L.mid, dist, k ?? 0.3),
      light: d.G(L.light, dist, 0.6),
      hi: L.hi,
    };
  }
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
// 공용 소품: 자판기, 도리이, 석등, 제등, 사람 실루엣, 다리 여러 개 선
// ---------------------------------------------------------------------------

/** 여러 선분을 path 하나로(화가 순서를 지켜야 하는 다리·난간 등) */
function segsPath(d, cam, list, stroke, wm) {
  let s = '';
  let w = 0;
  let k = 0;
  for (const [a, b] of list) {
    const sg = cam.seg(a, b);
    if (!sg) continue;
    s += `M${n(sg[0][0])} ${n(sg[0][1])}L${n(sg[1][0])} ${n(sg[1][1])}`;
    w += cam.px([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]) * wm;
    k++;
  }
  if (k) d.path(s, { stroke, 'stroke-width': Math.max(0.7, w / k), fill: 'none' });
}

/** 자판기. T=yawT(피벗, 요). 로컬 x[0,0.8](깊이) z[0,1](폭), 정면은 로컬 -X */
function vending(d, cam, T, o = {}) {
  const lit = !!o.lit;
  const body = o.body || '#e9ecef';
  const r = o.r || d.r;
  const dist = cam.dist(T([0.4, 1, 0.5]));
  box(d, cam, { x: [0, 0.8], y: [0, 1.83], z: [0, 1.0], T, col: { left: body, top: scale(body, 0.95), side: scale(body, 0.88) } });
  const Q = (y0, y1, z0, z1) => [T([-0.012, y0, z0]), T([-0.012, y1, z0]), T([-0.012, y1, z1]), T([-0.012, y0, z1])];
  const nm = T.R([-1, 0, 0]);
  const sh = (c) => d.shade(c, nm, dist);
  face(d, cam, Q(1.6, 1.78, 0.03, 0.97), lit ? mix(o.accent || '#d8403a', '#ffffff', 0.15) : sh(o.accent || '#d8403a'));
  face(d, cam, Q(0.98, 1.56, 0.06, 0.94), lit ? '#f6f9ff' : sh('#f4f7fa'));
  const cols = ['#e2524a', '#3f86d6', '#f0c33c', '#4bb06a', '#f08a3a', '#8a5ad6', '#e8e8e8', '#6a4a3a'];
  for (let row = 0; row < 3; row++) {
    for (let k = 0; k < 6; k++) {
      const z0 = 0.1 + k * 0.137;
      const y0 = 1.04 + row * 0.18;
      const c = r.pick(cols);
      face(d, cam, Q(y0, y0 + 0.11, z0, z0 + 0.085), lit ? c : sh(c));
    }
  }
  face(d, cam, Q(0.62, 0.9, 0.66, 0.9), sh('#c3c8ce'));
  face(d, cam, Q(0.15, 0.4, 0.1, 0.72), sh('#2c2f35'));
  if (lit) {
    const c = cam.P(T([-0.2, 1.25, 0.5]));
    glow(d, c[0], c[1], cam.px(T([0, 1.2, 0.5])) * 1.7, '#eef4ff', o.glowOp ?? 0.5);
  }
}

/** 도리이. T: 로컬(가로 x, 위 y, 두께 z) → 월드. 정면은 로컬 -Z */
function torii(d, cam, T, o = {}) {
  const red = o.red || '#d4472f';
  const black = '#2c2624';
  const w = o.w ?? 1.55;
  const h = o.h ?? 4.3;
  const y0 = o.y0 ?? 0;
  const emitRed = o.lit ? o.lit : null;
  const col = (c) => (emitRed && c === red ? { base: c } : c);
  for (const s of [-1, 1]) {
    box(d, cam, { x: [s * w - 0.17, s * w + 0.17], y: [y0, y0 + h], z: [-0.17, 0.17], T, col: col(red), emit: emitRed ? { front: emitRed } : null });
    box(d, cam, { x: [s * w - 0.21, s * w + 0.21], y: [y0, y0 + 0.4], z: [-0.21, 0.21], T, col: black });
  }
  box(d, cam, { x: [-w - 0.5, w + 0.5], y: [y0 + h - 1.0, y0 + h - 0.74], z: [-0.1, 0.1], T, col: red, emit: emitRed ? { front: emitRed } : null });
  box(d, cam, { x: [-0.13, 0.13], y: [y0 + h - 0.74, y0 + h], z: [-0.09, 0.09], T, col: red });
  const zf = -0.25;
  const E = w + 0.95;
  const lift = (x) => 0.26 * Math.pow(Math.abs(x) / E, 3);
  const xs = [-E, -E * 0.75, -E * 0.4, 0, E * 0.4, E * 0.75, E];
  const nm = T.R([0, 0, -1]);
  const dist = cam.dist(T([0, y0 + h, 0]));
  const blk = d.shade(black, nm, dist);
  const rd = emitRed || d.shade(red, nm, dist);
  const top = xs.map((x) => T([x, y0 + h + 0.42 + lift(x), zf]));
  const mid = xs
    .slice()
    .reverse()
    .map((x) => T([x * 0.985, y0 + h + 0.22 + lift(x), zf]));
  const bot = xs
    .slice()
    .reverse()
    .map((x) => T([x * 0.93, y0 + h + lift(x) * 0.6, zf]));
  const p1 = cam.poly(top.concat(mid));
  const p2 = cam.poly(xs.map((x) => T([x * 0.985, y0 + h + 0.22 + lift(x), zf])).concat(bot));
  if (p2) d.poly(p2, rd);
  if (p1) d.poly(p1, blk);
}

/** 석등(도로). T: 로컬 → 월드 */
function stoneLantern(d, cam, T, o = {}) {
  const st = o.col || '#a9a394';
  const parts = [
    { x: [-0.36, 0.36], y: [0, 0.18], z: [-0.36, 0.36] },
    { x: [-0.14, 0.14], y: [0.18, 1.0], z: [-0.14, 0.14] },
    { x: [-0.32, 0.32], y: [1.0, 1.14], z: [-0.32, 0.32] },
    { x: [-0.23, 0.23], y: [1.14, 1.56], z: [-0.23, 0.23] },
    { x: [-0.46, 0.46], y: [1.56, 1.68], z: [-0.46, 0.46] },
    { x: [-0.3, 0.3], y: [1.68, 1.8], z: [-0.3, 0.3] },
    { x: [-0.08, 0.08], y: [1.8, 1.98], z: [-0.08, 0.08] },
  ];
  for (const p of parts) box(d, cam, { ...p, T, col: st });
  const fire = o.lit ? '#ffd27a' : d.shade('#3a342e', T.R([0, 0, -1]), cam.dist(T([0, 1.3, 0])));
  face(d, cam, [T([-0.12, 1.22, -0.235]), T([0.12, 1.22, -0.235]), T([0.12, 1.48, -0.235]), T([-0.12, 1.48, -0.235])], fire);
  face(d, cam, [T([-0.235, 1.22, -0.1]), T([-0.235, 1.48, -0.1]), T([-0.235, 1.48, 0.1]), T([-0.235, 1.22, 0.1])], fire);
  if (o.lit) {
    const c = cam.P(T([0, 1.35, 0]));
    glow(d, c[0], c[1], cam.px(T([0, 1.35, 0])) * 2.2, '#ffc46a', 0.6);
  }
}

/** 제등(2D). s = 세로 크기(px) */
function chochin(d, x, y, s, o = {}) {
  const body = o.color || '#e4473a';
  if (o.glow) glow(d, x, y, s * 1.7, o.glowCol || '#ffb35a', o.glow);
  d.ellipse(
    x,
    y,
    s * 0.36,
    s * 0.5,
    d.radB([
      [0, '#fff3cf'],
      [0.5, mix(body, '#ffe0a0', 0.25)],
      [1, scale(body, 0.72)],
    ]),
  );
  if (s > 9) {
    d.rect(x - s * 0.2, y - s * 0.57, s * 0.4, s * 0.12, '#2a1c1c');
    d.rect(x - s * 0.2, y + s * 0.46, s * 0.4, s * 0.12, '#2a1c1c');
  }
}

/** 사람 실루엣(흐린 군중용). x, 발 y, 키 px */
function person(d, x, y, h, col, r) {
  const s = h;
  const lean = r ? r.range(-0.03, 0.03) * s : 0;
  d.circle(x + lean, y - s * 0.9, s * 0.072, col);
  d.poly(
    [
      [x - s * 0.12 + lean, y - s * 0.8],
      [x + s * 0.12 + lean, y - s * 0.8],
      [x + s * 0.13, y - s * 0.45],
      [x + s * 0.1, y],
      [x - s * 0.1, y],
      [x - s * 0.13, y - s * 0.45],
    ],
    col,
  );
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
  const isMorn = id === 'road_morning';
  const lampPts = [];
  const winGlows = [];
  const lx = isEve ? 0.3 : -0.55;

  // 하늘
  skyRect(d, t.sky, 0, cam.hy + 40);
  if (isEve) {
    glow(d, 880, 430, 600, '#ffe2a0', 0.8, 330);
    glow(d, 880, 432, 120, '#fff6dc', 0.95);
  }
  if (isMorn) glow(d, 40, 10, 600, '#ffffff', 0.55);
  if (night) {
    stars(d, 70, 360, '#ffffff', 3);
    glow(d, 800, 470, 780, '#8a6aa8', 0.45, 170);
  }
  const cl = t.cloud;
  if (isRain) {
    d.g({ filter: d.blur(7) }, () => {
      for (let i = 0; i < 10; i++) d.ellipse(r.range(0, W), r.range(30, 320), r.range(220, 420), r.range(40, 90), mix(cl.mid, cl.shade, r()), { opacity: 0.75 });
    });
  } else if (night) {
    streakCloud(d, 1180, 180, 700, 60, cl.lit, 0.55, 6);
    streakCloud(d, 330, 120, 520, 40, cl.mid, 0.5, 6);
  } else {
    cumulus(d, { x: 1210, y: 395, w: 660, h: 285, c: cl, lx, blur: 1.8 });
    cumulus(d, { x: 1450, y: 150, w: 240, h: 70, c: cl, lx, blur: 1.6 });
    cumulus(d, { x: 420, y: 335, w: 380, h: 100, c: cl, lx, blur: 2 });
    streakCloud(d, 680, 80, 620, 30, cl.lit, 0.5, 5);
  }
  // 원경: 산과 먼 마을
  ridge(d, cam.hy - 4, 34, 0.004, d.G('#7f9cb4', 500, 0.5), 21, cam.hy + 30);
  d.g({ filter: d.blur(1.2) }, () => {
    for (let i = 0; i < 24; i++) {
      const x = r.range(560, 1060);
      const w = r.range(14, 40);
      const hh = r.range(6, 22);
      d.rect(x, cam.hy - hh, w, hh + 30, d.G(r.pick([MAT.cream, MAT.gray, MAT.paleBlue]), 260, 0.6));
    }
  });

  // 지면 바탕
  d.rect(0, cam.hy - 2, W, H - cam.hy + 2, d.G(MAT.asphalt, 30, 0.6));
  // 오른쪽 빈터(풀밭)
  face(d, cam, [[3.4, 0, 2], [40, 0, 2], [40, 0, 32], [3.4, 0, 32]], d.lin([[0, d.G('#9cbf6a', 60, 0.8)], [1, d.G('#7aa552', 5, 0.8)]], 0, cam.hy, 0, 700));
  d.g({ opacity: 0.55 }, () => {
    for (let i = 0; i < 40; i++) {
      const X = r.range(4.5, 30);
      const Z = r.range(3, 30);
      const c = cam.P([X, 0, Z]);
      const s = cam.px([X, 0, Z]);
      d.ellipse(c[0], c[1], s * r.range(0.4, 1.1), s * 0.12, r.chance(0.5) ? d.G('#5f8a44', Z, 0.4) : d.G('#b5d47e', Z, 0.9));
    }
  });
  // 빈터 뒤 나무 줄
  {
    const c = cam.P([20, 3, 34]);
    foliage(d, c[0] + 60, c[1] + 10, 320, 40, leaves(d, 34), { lx, blur: 1, count: 30, size: 0.8 });
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
  z = 33;
  while (z < 120) {
    const len = r.range(6, 9);
    right.push({ x: [4.8 + r.range(0, 0.8), 12], z: [z, z + len], h: r.range(5.4, 6.4), rh: r.range(1.6, 2.4), ridge: r.chance(0.6) ? 'x' : 'z', wall: r.pick(wallC), roof: r.pick(roofC), tree: r.chance(0.4) });
    z += len + r.range(1.2, 3);
  }
  const back = [];
  let x = 7;
  while (x < 40) {
    const wdt = r.range(6, 8.5);
    back.push({ x: [x, x + wdt], z: [35 + r.range(0, 3), 43], h: r.range(5.4, 6.4), rh: r.range(1.8, 2.4), ridge: r.chance(0.5) ? 'x' : 'z', wall: r.pick(wallC), roof: r.pick(roofC), tree: r.chance(0.5) });
    x += wdt + r.range(1.5, 3);
  }
  const all = [...left, ...right, ...back].sort((a, b) => cam.dist([(b.x[0] + b.x[1]) / 2, 3, (b.z[0] + b.z[1]) / 2]) - cam.dist([(a.x[0] + a.x[1]) / 2, 3, (a.z[0] + a.z[1]) / 2]));
  for (const hs of all) {
    const dist = cam.dist([(hs.x[0] + hs.x[1]) / 2, 3, hs.z[0]]);
    if (hs.tree) {
      const tx = hs.x[0] < 0 ? hs.x[1] - 0.8 : hs.x[0] + 0.8;
      const tz = hs.z[1] + 0.8;
      const c = cam.P([tx, 4.6, tz]);
      const s = cam.px([tx, 4.6, tz]);
      foliage(d, c[0], c[1], s * 2.3, s * 1.9, leaves(d, dist), { lx, blur: dist > 40 ? 1.2 : 0.5 });
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
  const wallTopCol = d.shade('#ddd8ce', [0, 1, 0], 8);
  const joint = new Lines(d, d.shade(scale(MAT.block, 0.78), [1, 0, 0], 8), { opacity: 0.8 });
  for (const [a, b] of segs.slice().reverse()) {
    if (b < 130) face(d, cam, [[-3.6, 0, b], [-3.3, 0, b], [-3.3, wallTop, b], [-3.6, wallTop, b]], d.shade(MAT.block, [0, 0, -1], 10));
    face(d, cam, [[-3.3, 0, a], [-3.3, wallTop, a], [-3.3, wallTop, b], [-3.3, 0, b]], d.lin([[0, wallCol], [1, scale(wallCol, 0.86)]], 0, 300, 0, 900));
    face(d, cam, [[-3.6, wallTop, a], [-3.3, wallTop, a], [-3.3, wallTop, b], [-3.6, wallTop, b]], wallTopCol);
    face(d, cam, [[-3.3, wallTop - 0.07, a], [-3.3, wallTop, a], [-3.3, wallTop, b], [-3.3, wallTop - 0.07, b]], wallTopCol);
    for (let yy = 0.2; yy < wallTop - 0.1; yy += 0.2) joint.add3(cam, [-3.29, yy, a], [-3.29, yy, Math.min(b, 40)], 0.012);
    for (let zz = a + 0.4; zz < Math.min(b, 16); zz += 0.4) {
      const row = Math.round(((zz - a) / 0.4) % 2);
      for (let yy = 0; yy < wallTop - 0.2; yy += 0.4) joint.add3(cam, [-3.29, yy + row * 0.2, zz], [-3.29, yy + row * 0.2 + 0.2, zz], 0.012);
    }
  }
  joint.flush();
  // 담 위로 넘친 나무(왼쪽 앞)
  {
    const c = cam.P([-4.5, 3.2, 6.5]);
    const s = cam.px([-4.5, 3.2, 6.5]);
    foliage(d, c[0] - 30, c[1], s * 1.7, s * 1.35, leaves(d, 6), { lx, count: 34, blur: 0.5 });
  }

  // 오른쪽 펜스(빈터 앞)
  const fence = new Lines(d, d.G('#8e959c', 8, 0.6));
  for (let zz = 8; zz < 32; zz += 2) fence.add3(cam, [3.45, 0, zz], [3.45, 1.1, zz], 0.05);
  fence.add3(cam, [3.45, 1.1, 8], [3.45, 1.1, 32], 0.04);
  fence.add3(cam, [3.45, 0.6, 8], [3.45, 0.6, 32], 0.025);
  fence.flush();

  // 도로
  const rp = cam.poly([[-3.3, 0, 1], [3.45, 0, 1], [3.45, 0, 150], [-3.3, 0, 150]]);
  const nearC = isRain ? '#525a66' : night ? '#3a3e66' : isEve ? '#5e4864' : '#767a83';
  const farC = isRain ? '#929ca6' : night ? '#5a5288' : isEve ? '#e8a87e' : '#b0b4b9';
  d.poly(rp, d.lin([[0, farC], [0.25, mix(farC, nearC, 0.5)], [1, nearC]], 0, cam.hy, 0, H));
  for (const X of [-2.85, 3.0]) face(d, cam, [[X - 0.07, 0.005, 1.5], [X + 0.07, 0.005, 1.5], [X + 0.07, 0.005, 140], [X - 0.07, 0.005, 140]], d.G('#f2f2ee', 10, 0.8), { opacity: 0.85 });
  face(d, cam, [[3.0, 0.006, 1.5], [3.45, 0.006, 1.5], [3.45, 0.006, 60], [3.0, 0.006, 60]], d.G('#a4a19a', 10, 0.6), { opacity: 0.8 });
  // 맨홀
  {
    const c = cam.P([1.1, 0, 6]);
    const s = cam.px([1.1, 0, 6]);
    d.ellipse(c[0], c[1], s * 0.32, s * 0.32 * (cam.eye / 6), d.G('#5b5f66', 6, 0.5), { opacity: 0.8 });
  }

  // 그림자/빛
  if (isMorn) {
    const s = t.s;
    const proj = (p) => [p[0] - (s[0] * p[1]) / s[1], 0.01, p[2] - (s[2] * p[1]) / s[1]];
    const shp = [[-3.3, 0.01, 1]];
    for (const hs of left) {
      if (hs.z[0] > 34) break;
      shp.push(proj([-3.3, wallTop, hs.z[0] - 0.5]), proj([hs.x[1], hs.h, hs.z[0] + 0.3]), proj([hs.x[1], hs.h, hs.z[1] - 0.3]), proj([-3.3, wallTop, hs.z[1] + 0.5]));
    }
    shp.push(proj([-3.3, wallTop, 60]), [-3.3, 0.01, 60]);
    d.g({ opacity: 0.32, filter: d.blur(1.5) }, () => face(d, cam, shp, '#3f4f8a'));
  }
  if (isEve) {
    d.g({ opacity: 0.4 }, () => face(d, cam, [[-2, 0.01, 90], [2.6, 0.01, 90], [3.2, 0.01, 2], [-1.4, 0.01, 2]], d.lin([[0, '#ffd29a'], [1, '#ffb27a', 0]], 0, cam.hy, 0, H)));
    // 전봇대의 긴 그림자
    d.g({ opacity: 0.28 }, () => {
      for (const zp of [15.5, 27]) face(d, cam, [[3.6, 0.01, zp], [3.9, 0.01, zp], [0.4, 0.01, 2], [-0.2, 0.01, 2]], '#3a2050');
    });
  }
  if (isRain) {
    d.g({ filter: d.blur(4), opacity: 0.4 }, () => face(d, cam, [[-1.2, 0.01, 60], [1.6, 0.01, 60], [2.2, 0.01, 3], [-1.8, 0.01, 3]], d.lin([[0, '#c4ccd4'], [1, '#c4ccd4', 0]], 0, cam.hy, 0, 760)));
    for (const [px, pz, pr] of [[-1.6, 5, 0.7], [1.2, 9, 0.9], [-0.4, 16, 0.8], [2.1, 4.2, 0.5]]) {
      const c = cam.P([px, 0, pz]);
      const s = cam.px([px, 0, pz]);
      d.ellipse(c[0], c[1], s * pr, s * pr * (cam.eye / pz), '#8d98a5', { opacity: 0.6 });
      d.ellipse(c[0] - s * pr * 0.2, c[1] - s * pr * (cam.eye / pz) * 0.2, s * pr * 0.5, s * pr * 0.08 * (cam.eye / pz) * 4, '#c9d2db', { opacity: 0.5 });
    }
  }

  // 자판기(빈터 모퉁이, 길 쪽을 비스듬히 봄)
  vending(d, cam, yawT([3.75, 0, 6.2], -0.75), { lit: night || isRain || isEve, glowOp: night ? 0.6 : 0.35, r: rng(77) });
  if (night || isRain) groundGlow(d, cam, 2.7, 6.0, 2.2, '#dfe8ff', night ? 0.42 : 0.28);

  // 오른쪽 전봇대
  const poles = [4.2, 15.5, 27, 38.5, 50, 61.5, 73];
  const conns = [];
  for (const zp of poles.slice().reverse()) conns.unshift(pole(d, cam, 3.75, zp, { trans: zp === 15.5 ? 1 : 0, lamp: zp === 15.5 || zp === 38.5 ? -1.3 : 0, lampOut: lampPts }));
  for (let i = 0; i < conns.length - 1; i++) wiresBetween(d, cam, conns[i], conns[i + 1], t.wire, 0.6);
  {
    const a = cam.P([3.1, 9.2, 15.5]);
    for (const [zz, yy] of [[19, 6.2], [22, 6.6]]) wire(d, a, cam.P([-4.8, yy, zz]), 10, t.wire, 1.3);
    wire(d, cam.P([3.1, 8.6, 4.2]), cam.P([-4.6, 6.2, 9]), 30, t.wire, 2.2);
  }

  // 왼쪽 커브미러
  {
    const X = -3.0;
    const Z = 7.5;
    const b = cam.P([X, 0, Z]);
    const tp = cam.P([X, 2.7, Z]);
    const s = cam.px([X, 0, Z]);
    const orange = night ? '#b0603a' : d.G('#e8743a', 7, 0.8);
    d.line(b[0], b[1], tp[0], tp[1], orange, 0.09 * s);
    const m = cam.P([X + 0.05, 2.95, Z]);
    d.ellipse(m[0], m[1], 0.42 * s, 0.45 * s, orange);
    d.ellipse(m[0] + 0.02 * s, m[1], 0.34 * s, 0.37 * s, night ? '#3a3f70' : d.G(t.glass2, 7, 0.9));
    d.ellipse(m[0] - 0.1 * s, m[1] - 0.12 * s, 0.09 * s, 0.13 * s, '#ffffff', { opacity: 0.6 });
  }

  // 가로등, 창문 빛
  if (night || isRain) {
    for (const p of lampPts) {
      const c = cam.P(p);
      const s = cam.px(p);
      if (night) {
        glow(d, c[0], c[1] + 0.2 * s, s * 2.8, '#fff1c8', 0.8);
        groundGlow(d, cam, p[0] - 0.2, p[2], 3.6, '#ffe2a6', 0.5);
      } else glow(d, c[0], c[1], s * 1.6, '#eef4ff', 0.5);
    }
  }
  if (night) for (const [gx, gy, gr] of winGlows) glow(d, gx, gy, gr, '#ffcf7a', 0.35);

  // 전경: 왼쪽 위 잎사귀(초점 밖)
  foliage(d, 40, 50, 170, 120, leaves(d, 0), { blur: 6, count: 26, lx: 0.3 });
  if (isRain) {
    d.rect(0, 0, W, H, d.lin([[0, '#9aa6b2', 0.25], [0.5, '#9aa6b2', 0.05], [1, '#5a6570', 0.12]], 0, 0, 0, H));
    rain(d, 1);
  }
  if (isEve) d.rect(0, 0, W, H, d.lin([[0, '#5a3a7a', 0.15], [0.45, '#ffb070', 0], [1, '#4a2a5a', 0.22]], 0, 0, 0, H));
  if (night) d.rect(0, 0, W, H, d.lin([[0, '#000020', 0], [1, '#100a30', 0.12]], 0, 0, 0, H));
  return d;
}

// ---------------------------------------------------------------------------
// 장면: 교실 (낮/노을) — 뒤쪽 복도 쪽에서 앞-창가 방향을 봄
// ---------------------------------------------------------------------------

function sceneClassroom(id, t) {
  const eve = id === 'classroom_evening';
  const d = new Doc(id, t, 2202);
  const r = d.r;
  const cam = camera({ hy: 420, f: 760, eye: 1.4, x0: 3.5, z0: 0.6, yaw: -0.6 });
  const XL = -4.6;
  const XR = 4.6;
  const ZB = -1.2;
  const ZF = 9;
  const HT = 3.0;
  const cl = t.cloud;
  const lx = eve ? 0.7 : -0.5;

  // --- 창밖(창문으로만 보임) ---
  skyRect(d, t.sky, 0, 600);
  if (eve) {
    glow(d, 150, 380, 560, '#ffd89a', 0.85, 320);
    glow(d, 160, 392, 70, '#fff6dc', 1);
  } else glow(d, 0, 0, 520, '#ffffff', 0.45);
  cumulus(d, { x: 360, y: 300, w: 560, h: 210, c: cl, lx, blur: 2.2 });
  cumulus(d, { x: 80, y: 180, w: 220, h: 70, c: cl, lx, blur: 2 });
  ridge(d, 430, 26, 0.006, d.G('#7d98b0', 500, 0.5), 31, 620);
  d.g({ filter: d.blur(1.4) }, () => {
    for (let i = 0; i < 34; i++) {
      const x = r.range(-40, 760);
      const y = r.range(436, 520);
      d.rect(x, y, r.range(30, 80), 120, d.G(r.pick([MAT.cream, MAT.gray, MAT.paleBlue, MAT.beige]), 200, 0.7));
      d.poly([[x - 4, y], [x + 20, y - 12], [x + 60, y - 12], [x + 84, y]], d.G(r.pick([MAT.roofNavy, MAT.roofGray, MAT.roofBrown]), 200, 0.5));
    }
  });
  foliage(d, 160, 600, 300, 120, leaves(d, 30), { blur: 1.6, lx, count: 40 });
  foliage(d, 560, 590, 220, 90, leaves(d, 40), { blur: 1.8, lx, count: 26 });

  // --- 방 ---
  const floorTop = d.G('#c69866', 0, 0.35);
  const floorNear = d.G('#a97c50', 0, 0.35);
  face(d, cam, [[XL, 0, ZB], [XR, 0, ZB], [XR, 0, ZF], [XL, 0, ZF]], d.lin([[0, floorTop], [1, floorNear]], 0, 440, 0, 900));
  const plank = new Lines(d, d.G('#7e5634', 0, 0.3), { opacity: 0.45 });
  for (let x = XL + 0.3; x < XR; x += 0.3) plank.add3(cam, [x, 0.003, ZB], [x, 0.003, ZF], 0.012);
  plank.flush();
  face(d, cam, [[XL, HT, ZB], [XR, HT, ZB], [XR, HT, ZF], [XL, HT, ZF]], d.lin([[0, d.G('#f2efe6', 0, 0.3)], [1, d.G('#d9d4c8', 0, 0.2)]], 0, 0, 0, 380));

  // 창가 벽(X=XL)
  const wallC = '#ece6d6';
  const nL = [1, 0, 0];
  face(d, cam, [[XL, 0, ZB], [XL, 0.9, ZB], [XL, 0.9, ZF], [XL, 0, ZF]], d.shade(wallC, nL, 0));
  face(d, cam, [[XL, 2.75, ZB], [XL, HT, ZB], [XL, HT, ZF], [XL, 2.75, ZF]], d.shade(wallC, nL, 0));
  face(d, cam, [[XL + 0.01, 0.9, ZB], [XL + 0.01, 2.75, ZB], [XL + 0.01, 2.75, ZF], [XL + 0.01, 0.9, ZF]], '#ffffff', { opacity: 0.07 });
  const bays = [ZB, 1.5, 4.2, 6.7, ZF];
  const frame = new Lines(d, d.shade('#c9ccd0', nL, 0));
  for (let i = 0; i < bays.length - 1; i++) {
    const a = bays[i] + 0.2;
    const b = bays[i + 1] - 0.2;
    for (const y of [0.92, 2.3, 2.73]) frame.add3(cam, [XL + 0.02, y, a], [XL + 0.02, y, b], 0.035);
    for (const u of [0, 0.25, 0.5, 0.75, 1]) frame.add3(cam, [XL + 0.02, 0.9, lerp(a, b, u)], [XL + 0.02, 2.75, lerp(a, b, u)], 0.03);
  }
  frame.flush();
  box(d, cam, { x: [XL, XL + 0.14], y: [0.86, 0.92], z: [ZB, ZF], col: '#e6e1d4' });
  // 기둥 + 커튼 묶음
  const cur = eve ? '#f6dcc0' : '#f3ecd8';
  for (let i = bays.length - 2; i >= 1; i--) {
    const b = bays[i];
    box(d, cam, { x: [XL, XL + 0.28], y: [0, HT], z: [b - 0.2, b + 0.2], col: wallC });
    for (const side of [-1, 1]) {
      const z0 = side < 0 ? b - 0.55 : b + 0.2;
      const z1 = side < 0 ? b - 0.2 : b + 0.55;
      face(d, cam, [[XL + 0.3, 0.98, z0], [XL + 0.3, 2.78, z0], [XL + 0.3, 2.78, z1], [XL + 0.3, 0.98, z1]], eve ? '#f7c9a0' : d.shade(cur, nL, 0));
      const fold = new Lines(d, eve ? '#d79a78' : d.shade(scale(cur, 0.82), nL, 0), { opacity: 0.8 });
      for (let k = 1; k < 4; k++) fold.add3(cam, [XL + 0.31, 1.0, lerp(z0, z1, k / 4)], [XL + 0.31, 2.76, lerp(z0, z1, k / 4)], 0.02);
      fold.flush();
    }
  }
  // 바람에 부푼 커튼(낮)
  if (!eve) {
    const a = 2.0;
    const p = [[XL + 0.3, 2.78, a], [XL + 0.3, 2.78, a + 1.0], [XL + 0.7, 2.1, a + 1.2], [XL + 1.05, 1.3, a + 1.05], [XL + 1.0, 0.98, a + 0.9], [XL + 0.95, 1.0, a + 0.25], [XL + 0.6, 1.9, a + 0.02]];
    const pp = cam.poly(p);
    if (pp) d.poly(pp, d.lin([[0, '#fffaf0'], [1, '#efe4cc']], 0, 200, 0, 520), { opacity: 0.85, filter: d.blur(0.8) });
    const fl = new Lines(d, '#e2d6bc', { opacity: 0.7 });
    for (const k of [0.25, 0.5, 0.75]) fl.add3(cam, [XL + 0.3, 2.75, a + k], [XL + 0.95 + k * 0.1, 1.0, a + 0.3 + k * 0.6], 0.02);
    fl.flush();
  }

  // 정면 벽(Z=ZF): 칠판, 시계, 게시판
  const nF = [0, 0, -1];
  face(d, cam, [[XL, 0, ZF], [XR, 0, ZF], [XR, HT, ZF], [XL, HT, ZF]], d.lin([[0, d.shade('#e7e1d0', nF, 8)], [1, d.shade('#d6cfbd', nF, 8)]], 0, 300, 0, 520));
  face(d, cam, [[XL, 0, ZF - 0.01], [XR, 0, ZF - 0.01], [XR, 0.12, ZF - 0.01], [XL, 0.12, ZF - 0.01]], d.shade('#8a7a66', nF, 8));
  face(d, cam, [[-2.95, 0.78, ZF - 0.02], [2.15, 0.78, ZF - 0.02], [2.15, 2.12, ZF - 0.02], [-2.95, 2.12, ZF - 0.02]], d.shade('#b9bcbf', nF, 8));
  const boardP = cam.poly([[-2.85, 0.85, ZF - 0.03], [2.05, 0.85, ZF - 0.03], [2.05, 2.05, ZF - 0.03], [-2.85, 2.05, ZF - 0.03]]);
  d.poly(boardP, d.shade('#2f5c4a', nF, 8));
  {
    // 지운 분필 자국(글자 없음)
    const clip = d.clipPoly(boardP);
    const bx = boardP.map((p) => p[0]);
    const by = boardP.map((p) => p[1]);
    const x0 = Math.min(...bx);
    const x1 = Math.max(...bx);
    const y0 = Math.min(...by);
    const y1 = Math.max(...by);
    d.g({ 'clip-path': clip, opacity: 0.09, filter: d.blur(2) }, () => {
      for (let i = 0; i < 7; i++) {
        const cx = lerp(x0, x1, r.range(0.1, 0.9));
        const cy = lerp(y0, y1, r.range(0.2, 0.8));
        d.ellipse(cx, cy, (x1 - x0) * r.range(0.1, 0.2), (y1 - y0) * r.range(0.03, 0.06), '#ffffff');
      }
    });
  }
  box(d, cam, { x: [-2.85, 2.05], y: [0.8, 0.84], z: [ZF - 0.1, ZF], col: '#a9acb0' });
  {
    const C = [-0.4, 2.5, ZF - 0.03];
    const c = cam.P(C);
    const rx = Math.abs(cam.P([C[0] + 0.18, C[1], C[2]])[0] - cam.P([C[0] - 0.18, C[1], C[2]])[0]) / 2;
    const ry = Math.abs(cam.P([C[0], C[1] + 0.18, C[2]])[1] - cam.P([C[0], C[1] - 0.18, C[2]])[1]) / 2;
    d.ellipse(c[0], c[1], rx, ry, d.shade('#5a5f66', nF, 8));
    d.ellipse(c[0], c[1], rx * 0.82, ry * 0.82, d.shade('#f8f6f0', nF, 8));
    d.line(c[0], c[1], c[0] + rx * 0.5, c[1] - ry * 0.25, '#333', 1.4);
    d.line(c[0], c[1], c[0] - rx * 0.1, c[1] - ry * 0.65, '#333', 1);
  }
  face(d, cam, [[2.45, 0.95, ZF - 0.02], [4.15, 0.95, ZF - 0.02], [4.15, 2.0, ZF - 0.02], [2.45, 2.0, ZF - 0.02]], d.shade('#c49a64', nF, 8));
  for (const [x0, y0, w0, h0, c] of [[2.6, 1.45, 0.35, 0.45, '#fdfbf3'], [3.05, 1.5, 0.4, 0.38, '#f6e3a8'], [3.55, 1.4, 0.45, 0.5, '#fdfbf3'], [2.75, 1.05, 0.5, 0.32, '#cfe3f4'], [3.4, 1.02, 0.55, 0.3, '#f8d6d6']]) {
    face(d, cam, [[x0, y0, ZF - 0.03], [x0 + w0, y0, ZF - 0.03], [x0 + w0, y0 + h0, ZF - 0.03], [x0, y0 + h0, ZF - 0.03]], d.shade(c, nF, 8));
  }
  box(d, cam, { x: [3.7, 4.2], y: [2.45, 2.85], z: [ZF - 0.16, ZF], col: '#d8d4c8' });

  // 오른쪽(복도 쪽) 벽 + 앞문
  const nR = [-1, 0, 0];
  face(d, cam, [[XR, 0, ZB], [XR, HT, ZB], [XR, HT, ZF], [XR, 0, ZF]], d.shade('#e3dccb', nR, 6));
  face(d, cam, [[XR - 0.01, 0, 6.9], [XR - 0.01, 1.95, 6.9], [XR - 0.01, 1.95, 8.6], [XR - 0.01, 0, 8.6]], d.shade('#c9a678', nR, 6));
  face(d, cam, [[XR - 0.02, 1.15, 7.05], [XR - 0.02, 1.75, 7.05], [XR - 0.02, 1.75, 7.6], [XR - 0.02, 1.15, 7.6]], d.shade('#cfe0ea', nR, 6));
  face(d, cam, [[XR - 0.01, 2.1, ZB], [XR - 0.01, 2.6, ZB], [XR - 0.01, 2.6, ZF], [XR - 0.01, 2.1, ZF]], d.shade('#c5d6e0', nR, 6), { opacity: 0.8 });

  // 햇빛(바닥 빛 웅덩이)
  const s = t.s;
  const toFloor = (p) => [p[0] - (s[0] * p[1]) / s[1], 0.004, p[2] - (s[2] * p[1]) / s[1]];
  const patches = [];
  for (let i = 0; i < bays.length - 1; i++) {
    const a = bays[i] + 0.25;
    const b = bays[i + 1] - 0.25;
    const win = [[XL, 0.92, a], [XL, 2.73, a], [XL, 2.73, b], [XL, 0.92, b]];
    patches.push({ win, floor: win.map(toFloor) });
  }
  const sunCol = eve ? '#ffb05e' : '#fff6dc';
  d.g({ opacity: eve ? 0.66 : 0.4, filter: d.blur(2) }, () => {
    for (const p of patches) face(d, cam, p.floor, sunCol);
  });

  // 교단, 교탁
  box(d, cam, { x: [-3.6, 2.8], y: [0, 0.2], z: [8.0, ZF], col: '#9a7350' });
  box(d, cam, { x: [-1.3, -0.1], y: [0.2, 0.95], z: [7.3, 7.95], col: { top: '#c9a476', side: '#8f99a2' } });

  // 형광등
  for (const fx of [-2.6, 0, 2.6]) {
    for (const fz of [1.6, 4.4, 7.2]) {
      box(d, cam, { x: [fx - 0.13, fx + 0.13], y: [2.88, 2.96], z: [fz - 0.65, fz + 0.65], col: '#e8e8e4', emit: eve ? null : { bottom: '#ffffff' } });
    }
  }

  // 책상·의자(멀리서부터)
  const items = [];
  const colsX = [-3.5, -2.3, -1.1, 0.1, 1.3, 2.5];
  const rowsZ = [1.2, 2.3, 3.4, 4.5, 5.6, 6.7];
  for (const cx of colsX) {
    for (const cz of rowsZ) {
      if (cam.dist([cx, 0.7, cz]) < 1.9) continue;
      items.push({ k: 'desk', cx, cz, dist: cam.dist([cx, 0.6, cz]) });
      const pull = r.range(-0.08, 0.12);
      items.push({ k: 'chair', cx: cx + r.range(-0.05, 0.05), cz: cz - 0.55 - pull, dist: cam.dist([cx, 0.5, cz - 0.6]), bag: r.chance(0.25) });
    }
  }
  items.sort((a, b) => b.dist - a.dist);
  const steel = '#95a0aa';
  const top = '#ddc196';
  const seat = '#c69f70';
  for (const it of items) {
    const { cx, cz } = it;
    if (it.k === 'desk') {
      segsPath(d, cam, [[[cx - 0.3, 0, cz - 0.19], [cx - 0.3, 0.56, cz - 0.19]], [[cx + 0.3, 0, cz - 0.19], [cx + 0.3, 0.56, cz - 0.19]], [[cx - 0.3, 0, cz + 0.19], [cx - 0.3, 0.56, cz + 0.19]], [[cx + 0.3, 0, cz + 0.19], [cx + 0.3, 0.56, cz + 0.19]]], d.shade(steel, [0, 0, -1], it.dist), 0.025);
      box(d, cam, { x: [cx - 0.31, cx + 0.31], y: [0.56, 0.68], z: [cz - 0.2, cz + 0.2], col: steel });
      box(d, cam, { x: [cx - 0.34, cx + 0.34], y: [0.68, 0.72], z: [cz - 0.23, cz + 0.23], col: { top, side: scale(top, 0.85) } });
    } else {
      segsPath(d, cam, [[[cx - 0.18, 0, cz - 0.17], [cx - 0.18, 0.42, cz - 0.17]], [[cx + 0.18, 0, cz - 0.17], [cx + 0.18, 0.42, cz - 0.17]], [[cx - 0.18, 0, cz + 0.17], [cx - 0.18, 0.82, cz + 0.17]], [[cx + 0.18, 0, cz + 0.17], [cx + 0.18, 0.82, cz + 0.17]]], d.shade(steel, [0, 0, -1], it.dist), 0.022);
      box(d, cam, { x: [cx - 0.2, cx + 0.2], y: [0.4, 0.44], z: [cz - 0.19, cz + 0.19], col: { top: seat, side: scale(seat, 0.8) } });
      box(d, cam, { x: [cx - 0.2, cx + 0.2], y: [0.56, 0.84], z: [cz + 0.17, cz + 0.2], col: seat });
      if (it.bag) box(d, cam, { x: [cx + 0.34, cx + 0.38], y: [0.3, 0.62], z: [cz + 0.4, cz + 0.72], col: r.pick(['#3a3f5a', '#5a3a3a', '#2f4a5a']) });
    }
  }
  // 책상 위에 떨어진 빛(약하게)
  d.g({ opacity: eve ? 0.3 : 0.12, filter: d.blur(3) }, () => {
    for (const p of patches) face(d, cam, p.floor.map((q) => [q[0], 0.72, q[2] + 0.4]), sunCol);
  });
  // 빛기둥
  d.g({ opacity: eve ? 0.28 : 0.11, filter: d.blur(8) }, () => {
    for (const p of patches) {
      const pts2 = hull([...p.win, ...p.floor].map((q) => cam.poly([q, q, q]) && cam.P(q)));
      if (pts2.length > 2) d.poly(pts2, eve ? '#ffcf8a' : '#ffffff');
    }
  });
  // 색 보정
  if (eve) {
    d.rect(0, 0, W, H, d.lin([[0, '#ffb070', 0.12], [0.5, '#ff9a6a', 0.05], [1, '#40285a', 0.28]], 0, 0, 0, H));
    d.rect(0, 0, W, H, d.lin([[0, '#ffd090', 0.25], [0.45, '#ffd090', 0], [1, '#2a1448', 0.3]], 0, 0, W, 0));
  } else d.rect(0, 0, W, H, d.lin([[0, '#ffffff', 0.12], [0.4, '#ffffff', 0], [1, '#3a4a6a', 0.08]], 0, 0, W, 0));
  return d;
}

// ---------------------------------------------------------------------------
// 장면: 복도와 자판기(낮)
// ---------------------------------------------------------------------------

function sceneHallway(id, t) {
  const d = new Doc(id, t, 3303);
  const r = d.r;
  const cam = camera({ hy: 430, f: 700, eye: 1.5, x0: -0.35, z0: 0, yaw: 0.16 });
  const XL = -1.5;
  const XR = 1.5;
  const HT = 3.0;
  const ZE = 40;
  const cl = t.cloud;

  // 창밖
  skyRect(d, t.sky, 0, 640);
  glow(d, 0, 60, 520, '#ffffff', 0.5);
  cumulus(d, { x: 260, y: 300, w: 520, h: 220, c: cl, lx: -0.5, blur: 2.2 });
  ridge(d, 440, 30, 0.006, d.G('#7d98b0', 500, 0.5), 41, 700);
  // 맞은편 교사동(흰 건물)
  d.g({ filter: d.blur(1.6) }, () => {
    d.rect(-40, 360, 720, 320, d.G('#eeeae2', 60, 0.8));
    d.rect(-40, 352, 720, 10, d.G('#c9c6c0', 60, 0.6));
    for (let f = 0; f < 3; f++) {
      d.rect(-40, 395 + f * 85, 720, 40, d.G('#9fb8cc', 60, 0.7));
      for (let x = -40; x < 680; x += 46) d.rect(x, 395 + f * 85, 4, 40, d.G('#d9dcdf', 60, 0.7));
    }
  });
  foliage(d, 150, 600, 300, 150, leaves(d, 25), { blur: 1.4, lx: -0.5, count: 44 });
  foliage(d, 560, 640, 200, 120, leaves(d, 30), { blur: 1.6, lx: -0.5, count: 26 });

  // 바닥, 천장
  const nL = [1, 0, 0];
  const floorC = d.G('#aab4a4', 0, 0.4);
  face(d, cam, [[XL, 0, 0], [XR, 0, 0], [XR, 0, ZE], [XL, 0, ZE]], d.lin([[0, d.G('#c3cbbf', 0, 0.5)], [1, floorC]], 0, 430, 0, 900));
  // 알코브 바닥
  face(d, cam, [[XR, 0, 2.6], [4.2, 0, 2.6], [4.2, 0, 7.2], [XR, 0, 7.2]], floorC);
  face(d, cam, [[XL, HT, 0], [XR, HT, 0], [XR, HT, ZE], [XL, HT, ZE]], d.lin([[0, d.G('#f3f1ea', 0, 0.4)], [1, d.G('#dedad0', 0, 0.3)]], 0, 0, 0, 400));
  face(d, cam, [[XR, HT, 2.6], [4.2, HT, 2.6], [4.2, HT, 7.2], [XR, HT, 7.2]], d.G('#e4e0d6', 0, 0.3));
  // 바닥 광택(창 반사: 거울상)
  d.g({ opacity: 0.3, filter: d.blur(3) }, () => {
    for (let z = 0.2; z < ZE - 1; z += 1.8) face(d, cam, [[XL, -0.95, z], [XL, -2.6, z], [XL, -2.6, z + 1.6], [XL, -0.95, z + 1.6]], '#f4f8fb');
  });

  // 왼쪽 창 벽
  const wallC = '#efe9da';
  face(d, cam, [[XL, 0, 0], [XL, 0.9, 0], [XL, 0.9, ZE], [XL, 0, ZE]], d.shade(wallC, nL, 0));
  face(d, cam, [[XL, 2.65, 0], [XL, HT, 0], [XL, HT, ZE], [XL, 2.65, ZE]], d.shade(wallC, nL, 0));
  face(d, cam, [[XL, 0, 0], [XL, 0.1, 0], [XL, 0.1, ZE], [XL, 0, ZE]], d.shade('#7c8076', nL, 0));
  face(d, cam, [[XL + 0.01, 0.9, 0], [XL + 0.01, 2.65, 0], [XL + 0.01, 2.65, ZE], [XL + 0.01, 0.9, ZE]], '#ffffff', { opacity: 0.08 });
  const fr = new Lines(d, d.shade('#c7cacd', nL, 0));
  for (const y of [0.92, 1.95, 2.63]) fr.add3(cam, [XL + 0.02, y, 0.05], [XL + 0.02, y, ZE], 0.035);
  for (let z = 0; z <= ZE; z += 0.9) fr.add3(cam, [XL + 0.02, 0.9, z], [XL + 0.02, 2.65, z], 0.03);
  fr.flush();
  box(d, cam, { x: [XL, XL + 0.12], y: [0.86, 0.92], z: [0, ZE], col: '#e2ddd0' });
  for (let z = ZE - 5.4; z > 0; z -= 5.4) box(d, cam, { x: [XL, XL + 0.22], y: [0, HT], z: [z - 0.18, z + 0.18], col: wallC });

  // 햇빛(창 → 바닥)
  const s = t.s;
  const toFloor = (p) => [p[0] - (s[0] * p[1]) / s[1], 0.004, p[2] - (s[2] * p[1]) / s[1]];
  const patches = [];
  for (let z = 0.2; z < ZE - 1; z += 1.8) {
    const win = [[XL, 0.95, z], [XL, 2.6, z], [XL, 2.6, z + 1.6], [XL, 0.95, z + 1.6]];
    patches.push({ win, floor: win.map(toFloor) });
  }
  d.g({ opacity: 0.4, filter: d.blur(1.5) }, () => {
    for (const p of patches) face(d, cam, p.floor, '#fffaea');
  });

  // 끝 벽(창)
  const nE = [0, 0, -1];
  face(d, cam, [[XL, 0, ZE], [XR, 0, ZE], [XR, HT, ZE], [XL, HT, ZE]], d.shade(wallC, nE, ZE));
  face(d, cam, [[-0.9, 0.9, ZE - 0.01], [0.9, 0.9, ZE - 0.01], [0.9, 2.5, ZE - 0.01], [-0.9, 2.5, ZE - 0.01]], '#e8f4fc');

  // 오른쪽 벽: 교실 벽(문, 위쪽 창), 알코브(자판기 코너)
  const nR = [-1, 0, 0];
  const wallR = d.shade('#ece5d4', nR, 0);
  face(d, cam, [[XR, 0, 7.2], [XR, HT, 7.2], [XR, HT, ZE], [XR, 0, ZE]], wallR);
  face(d, cam, [[XR, 0, 0], [XR, HT, 0], [XR, HT, 2.6], [XR, 0, 2.6]], wallR);
  face(d, cam, [[XR - 0.01, 0, 7.2], [XR - 0.01, 0.12, 7.2], [XR - 0.01, 0.12, ZE], [XR - 0.01, 0, ZE]], d.shade('#7c8076', nR, 0));
  face(d, cam, [[XR - 0.01, 2.15, 7.2], [XR - 0.01, 2.65, 7.2], [XR - 0.01, 2.65, ZE], [XR - 0.01, 2.15, ZE]], d.shade('#bcd0dc', nR, 0));
  const tr = new Lines(d, d.shade('#c9ccd0', nR, 0));
  for (let z = 7.2; z < ZE; z += 0.9) tr.add3(cam, [XR - 0.02, 2.15, z], [XR - 0.02, 2.65, z], 0.025);
  tr.flush();
  for (const z0 of [9.2, 17.2, 26.2, 34.2]) {
    face(d, cam, [[XR - 0.02, 0, z0], [XR - 0.02, 1.95, z0], [XR - 0.02, 1.95, z0 + 1.8], [XR - 0.02, 0, z0 + 1.8]], d.shade('#cda97a', nR, cam.dist([XR, 1, z0])));
    face(d, cam, [[XR - 0.03, 1.1, z0 + 0.15], [XR - 0.03, 1.75, z0 + 0.15], [XR - 0.03, 1.75, z0 + 0.8], [XR - 0.03, 1.1, z0 + 0.8]], d.shade('#cfe1ec', nR, cam.dist([XR, 1, z0])));
    box(d, cam, { x: [XR - 0.45, XR], y: [2.3, 2.52], z: [z0 - 0.02, z0 + 0.02], col: '#f4f2ec' });
  }
  // 게시판
  face(d, cam, [[XR - 0.02, 1.0, 12.0], [XR - 0.02, 1.9, 12.0], [XR - 0.02, 1.9, 15.6], [XR - 0.02, 1.0, 15.6]], d.shade('#c49a64', nR, 12));
  for (let k = 0; k < 6; k++) {
    const z0 = 12.2 + k * 0.56;
    face(d, cam, [[XR - 0.03, 1.15 + (k % 2) * 0.08, z0], [XR - 0.03, 1.75, z0], [XR - 0.03, 1.75, z0 + 0.42], [XR - 0.03, 1.15 + (k % 2) * 0.08, z0 + 0.42]], d.shade(r.pick(['#fdfbf3', '#f6e3a8', '#cfe3f4', '#f8d6d6']), nR, 12));
  }
  // 소화전함(빨강)
  face(d, cam, [[XR - 0.02, 0.6, 21.5], [XR - 0.02, 1.5, 21.5], [XR - 0.02, 1.5, 22.3], [XR - 0.02, 0.6, 22.3]], d.shade('#c8443a', nR, 21));
  // 알코브
  face(d, cam, [[XR, 0, 7.2], [4.2, 0, 7.2], [4.2, HT, 7.2], [XR, HT, 7.2]], d.shade('#e8e0cc', [0, 0, -1], 6));
  face(d, cam, [[4.2, 0, 2.6], [4.2, HT, 2.6], [4.2, HT, 7.2], [4.2, 0, 7.2]], d.shade('#efe8d6', nR, 5));
  face(d, cam, [[4.19, 2.0, 5.9], [4.19, 2.55, 5.9], [4.19, 2.55, 7.0], [4.19, 2.0, 7.0]], d.shade('#9fc0d6', nR, 5));
  // 자판기 2대 + 분리수거함 + 벤치
  vending(d, cam, yawT([3.4, 0, 3.0], 0), { body: '#2f6fb8', accent: '#f2f2f2', lit: true, glowOp: 0.3, r: rng(5) });
  vending(d, cam, yawT([3.4, 0, 4.1], 0), { body: '#eceff1', accent: '#d8403a', lit: true, glowOp: 0.3, r: rng(6) });
  for (const [z0, c] of [[5.25, '#3f8a4a'], [5.75, '#3f6aa8']]) {
    box(d, cam, { x: [3.75, 4.2], y: [0, 0.8], z: [z0, z0 + 0.45], col: '#d9dcdf' });
    face(d, cam, [[3.74, 0.6, z0 + 0.08], [3.74, 0.72, z0 + 0.08], [3.74, 0.72, z0 + 0.37], [3.74, 0.6, z0 + 0.37]], d.shade(c, nR, 5));
  }
  box(d, cam, { x: [1.75, 2.15], y: [0.4, 0.45], z: [6.0, 7.0], col: '#b48a5e' });
  segsPath(d, cam, [[[1.8, 0, 6.05], [1.8, 0.4, 6.05]], [[1.8, 0, 6.95], [1.8, 0.4, 6.95]]], d.G('#6f747a', 6, 0.5), 0.03);

  // 천장 형광등
  for (let z = 2.5; z < ZE; z += 3.6) box(d, cam, { x: [-0.14, 0.14], y: [2.9, 2.97], z: [z - 0.6, z + 0.6], col: '#e8e8e4', emit: { bottom: '#ffffff' } });

  // 빛기둥
  d.g({ opacity: 0.1, filter: d.blur(8) }, () => {
    for (const p of patches.slice(0, 8)) {
      const pts2 = hull([...p.win, ...p.floor].map((q) => cam.P(q)));
      if (pts2.length > 2) d.poly(pts2, '#ffffff');
    }
  });
  d.rect(0, 0, W, H, d.lin([[0, '#ffffff', 0.12], [0.45, '#ffffff', 0], [1, '#5a6a80', 0.08]], 0, 0, W, 0));
  return d;
}

// ---------------------------------------------------------------------------
// 장면: 현관 신발장 (방과 후 / 소나기)
// ---------------------------------------------------------------------------

function sceneShoeLockers(id, t) {
  const isRain = id === 'shoe_lockers_rain';
  const d = new Doc(id, t, 3404);
  const r = d.r;
  const cam = camera({ hy: 430, f: 700, eye: 1.5, x0: 0.15, z0: -0.8 });
  const XL = -5;
  const XR = 5;
  const ZF = 10;
  const HT = 3.2;
  const cl = t.cloud;

  // 바깥(유리문으로 보임)
  skyRect(d, t.sky, 0, 520);
  if (!isRain) {
    glow(d, 980, 430, 420, '#ffe9b8', 0.85, 220);
    cumulus(d, { x: 700, y: 330, w: 420, h: 150, c: cl, lx: 0.5, blur: 2 });
  } else {
    d.g({ filter: d.blur(6) }, () => {
      for (let i = 0; i < 6; i++) d.ellipse(r.range(450, 1150), r.range(250, 360), r.range(120, 220), r.range(30, 60), mix(cl.mid, cl.shade, r()), { opacity: 0.8 });
    });
  }
  foliage(d, 620, 395, 220, 50, leaves(d, 60), { blur: 1.6, count: 26, lx: 0.5 });
  foliage(d, 1050, 390, 200, 55, leaves(d, 60), { blur: 1.6, count: 24, lx: 0.5 });
  d.rect(0, 425, W, 120, d.lin([[0, d.G('#d8c6a2', 40, 0.8)], [1, d.G('#c9b28a', 15, 0.8)]], 0, 425, 0, 545));
  // 교문 기둥과 펜스
  d.g({ filter: d.blur(1) }, () => {
    d.rect(560, 380, 22, 70, d.G('#cfcac0', 40, 0.7));
    d.rect(1010, 380, 22, 70, d.G('#cfcac0', 40, 0.7));
    d.rect(440, 418, 720, 4, d.G('#8a9096', 40, 0.6));
  });
  if (isRain) {
    d.rect(400, 200, 800, 360, '#7d8995', { opacity: 0.35 });
    d.g({ 'clip-path': d.clipRect(380, 150, 840, 420) }, () => {
      rain(d, 1.6, 8);
      // 바깥 웅덩이의 물보라
      const sp = new Lines(d, '#dfe8f0', { opacity: 0.6 });
      for (let i = 0; i < 40; i++) {
        const x = r.range(440, 1160);
        const y = r.range(440, 520);
        sp.add(x - 4, y, x + 4, y, 1.2);
      }
      sp.flush();
    });
  }

  // 바닥: 실내(앞) / 스노코 / 현관 바닥(타일)
  face(d, cam, [[XL, 0, -1], [XR, 0, -1], [XR, 0, 6.6], [XL, 0, 6.6]], d.lin([[0, d.G('#d6c8ac', 0, 0.4)], [1, d.G('#b9a688', 0, 0.4)]], 0, 430, 0, 900));
  face(d, cam, [[XL, 0, 7.4], [XR, 0, 7.4], [XR, 0, ZF], [XL, 0, ZF]], d.G(isRain ? '#9c9a94' : '#bdb6a8', 9, 0.6));
  const tile = new Lines(d, d.G('#8c877c', 9, 0.5), { opacity: 0.6 });
  for (let x = -4.5; x <= 4.5; x += 0.6) tile.add3(cam, [x, 0.002, 7.4], [x, 0.002, ZF], 0.01);
  for (let z = 7.8; z < ZF; z += 0.6) tile.add3(cam, [XL, 0.002, z], [XR, 0.002, z], 0.01);
  tile.flush();
  face(d, cam, [[XL, 0, 6.6], [XR, 0, 6.6], [XR, 0, 7.4], [XL, 0, 7.4]], d.G('#c3a272', 7, 0.6));
  const slat = new Lines(d, d.G('#8e6c44', 7, 0.4));
  for (let z = 6.7; z < 7.4; z += 0.12) slat.add3(cam, [XL, 0.003, z], [XR, 0.003, z], 0.018);
  slat.flush();
  if (isRain) {
    // 젖은 바닥 반사
    d.g({ opacity: 0.5, filter: d.blur(3) }, () => {
      for (let x = -4.1; x < 4; x += 1.025) face(d, cam, [[x + 0.06, -0.17, ZF], [x + 0.96, -0.17, ZF], [x + 0.96, -2.28, ZF], [x + 0.06, -2.28, ZF]], '#b9c3cc');
    });
  }
  // 천장
  face(d, cam, [[XL, HT, -1], [XR, HT, -1], [XR, HT, ZF], [XL, HT, ZF]], d.lin([[0, d.G('#efebe2', 0, 0.3)], [1, d.G('#d6d0c4', 0, 0.2)]], 0, 0, 0, 400));
  // 옆벽
  face(d, cam, [[XL, 0, -1], [XL, HT, -1], [XL, HT, ZF], [XL, 0, ZF]], d.shade('#e8e1cf', [1, 0, 0], 6));
  face(d, cam, [[XR, 0, -1], [XR, HT, -1], [XR, HT, ZF], [XR, 0, ZF]], d.shade('#e8e1cf', [-1, 0, 0], 6));
  // 오른쪽 벽 게시판
  face(d, cam, [[XR - 0.02, 1.0, 7.0], [XR - 0.02, 1.9, 7.0], [XR - 0.02, 1.9, 9.2], [XR - 0.02, 1.0, 9.2]], d.shade('#c49a64', [-1, 0, 0], 8));
  for (let k = 0; k < 4; k++) face(d, cam, [[XR - 0.03, 1.12, 7.15 + k * 0.5], [XR - 0.03, 1.78, 7.15 + k * 0.5], [XR - 0.03, 1.78, 7.55 + k * 0.5], [XR - 0.03, 1.12, 7.55 + k * 0.5]], d.shade(['#fdfbf3', '#f6e3a8', '#cfe3f4', '#f8d6d6'][k], [-1, 0, 0], 8));

  // 정면: 유리문 벽(Z=ZF)
  const nF = [0, 0, -1];
  const wallF = d.shade('#e8e1cf', nF, 10);
  face(d, cam, [[XL, 2.95, ZF], [XR, 2.95, ZF], [XR, HT, ZF], [XL, HT, ZF]], wallF);
  face(d, cam, [[XL, 0, ZF], [-4.1, 0, ZF], [-4.1, HT, ZF], [XL, HT, ZF]], wallF);
  face(d, cam, [[4.1, 0, ZF], [XR, 0, ZF], [XR, HT, ZF], [4.1, HT, ZF]], wallF);
  face(d, cam, [[-4.1, 0, ZF - 0.01], [4.1, 0, ZF - 0.01], [4.1, 2.95, ZF - 0.01], [-4.1, 2.95, ZF - 0.01]], isRain ? '#c8d0d8' : '#ffffff', { opacity: isRain ? 0.14 : 0.1 });
  const df = new Lines(d, d.shade('#9aa0a6', nF, 10));
  for (let x = -4.1; x <= 4.11; x += 1.025) df.add3(cam, [x, 0, ZF - 0.02], [x, 2.95, ZF - 0.02], 0.06);
  for (const y of [0.02, 0.15, 2.3, 2.38, 2.93]) df.add3(cam, [-4.1, y, ZF - 0.02], [4.1, y, ZF - 0.02], 0.05);
  df.flush();
  const hd = new Lines(d, d.shade('#c9ced2', nF, 10));
  for (let x = -4.1 + 1.025; x < 4.1; x += 2.05) {
    hd.add3(cam, [x - 0.08, 0.85, ZF - 0.04], [x - 0.08, 1.45, ZF - 0.04], 0.03);
    hd.add3(cam, [x + 0.08, 0.85, ZF - 0.04], [x + 0.08, 1.45, ZF - 0.04], 0.03);
  }
  hd.flush();

  // 햇빛(오후: 문 유리 → 바닥에 긴 빛)
  const patches = [];
  if (!isRain) {
    const s = t.s;
    const toFloor = (p) => [p[0] - (s[0] * p[1]) / s[1], 0.004, p[2] - (s[2] * p[1]) / s[1]];
    for (let x = -4.1; x < 4.05; x += 1.025) {
      for (const [y0, y1] of [[0.17, 2.28], [2.4, 2.9]]) {
        const win = [[x + 0.05, y0, ZF], [x + 0.05, y1, ZF], [x + 0.97, y1, ZF], [x + 0.97, y0, ZF]];
        patches.push({ win, floor: win.map(toFloor) });
      }
    }
    d.g({ opacity: 0.62, filter: d.blur(1.5) }, () => {
      for (const p of patches) face(d, cam, p.floor, '#ffd690');
    });
  }

  // 우산꽂이(문 옆 왼쪽)
  {
    const um = isRain ? ['#3a6ab0', '#d84a5a', '#f0f0f0', '#4a9a6a', '#f2c84a', '#7a5ab0', '#2e3440'] : ['#3a6ab0', '#2e3440', '#d84a5a'];
    const ul = new Lines(d, '#555');
    let k = 0;
    for (const c of um) {
      const x = -3.95 + k * 0.17;
      const a = cam.P([x, 0.05, 8.9]);
      const b = cam.P([x + r.range(-0.08, 0.08), 0.95, 8.85]);
      const sp = cam.px([x, 0.5, 8.9]);
      d.poly([[a[0] - sp * 0.02, a[1]], [a[0] + sp * 0.02, a[1]], [b[0] + sp * 0.05, b[1]], [b[0] - sp * 0.05, b[1]]], d.G(c, 9, 0.6));
      ul.add(b[0], b[1], b[0], b[1] - sp * 0.12, 1.5);
      k++;
    }
    ul.flush();
    box(d, cam, { x: [-4.1, -2.7], y: [0.25, 0.3], z: [8.75, 9.1], col: '#8a9096' });
  }

  // 신발장(왼쪽, 오른쪽)
  const wood = '#bb8f5f';
  const cubby = '#5a4434';
  const shoeCols = ['#3f6fc0', '#d0504a', '#3f9a5a'];
  for (const side of [-1, 1]) {
    const xf = side * 1.85;
    const xb = side * 2.5;
    const nm = [-side, 0, 0];
    box(d, cam, { x: side < 0 ? [xb, xf] : [xf, xb], y: [0, 1.95], z: [0.2, 6.2], col: { side: wood, front: scale(wood, 0.95), top: wood } });
    const dist = 3;
    const cub = d.shade(cubby, nm, dist);
    const shoe = d.shade('#f2f0ea', nm, dist);
    for (let row = 0; row < 6; row++) {
      const y0 = 0.12 + row * 0.3;
      for (let c = 0; c < 18; c++) {
        const z0 = 0.32 + c * 0.32;
        const X = xf - side * 0.01;
        face(d, cam, [[X, y0 + 0.03, z0 + 0.03], [X, y0 + 0.27, z0 + 0.03], [X, y0 + 0.27, z0 + 0.29], [X, y0 + 0.03, z0 + 0.29]], cub);
        if (r.chance(row < 3 ? 0.7 : 0.45)) {
          const X2 = xf - side * 0.015;
          face(d, cam, [[X2, y0 + 0.03, z0 + 0.06], [X2, y0 + 0.11, z0 + 0.06], [X2, y0 + 0.11, z0 + 0.26], [X2, y0 + 0.03, z0 + 0.26]], shoe);
          if (c < 9) face(d, cam, [[X2 - side * 0.002, y0 + 0.03, z0 + 0.06], [X2 - side * 0.002, y0 + 0.06, z0 + 0.06], [X2 - side * 0.002, y0 + 0.06, z0 + 0.26], [X2 - side * 0.002, y0 + 0.03, z0 + 0.26]], d.shade(r.pick(shoeCols), nm, dist));
        }
      }
    }
  }

  // 천장 형광등
  for (const fz of [1.5, 4.5, 7.5]) {
    for (const fx of [-2.6, 0, 2.6]) {
      box(d, cam, { x: [fx - 0.6, fx + 0.6], y: [3.12, 3.18], z: [fz - 0.13, fz + 0.13], col: '#e8e8e4', emit: { bottom: '#ffffff' } });
      if (isRain) {
        const c = cam.P([fx, 3.12, fz]);
        glow(d, c[0], c[1], cam.px([fx, 3.1, fz]) * 1.2, '#f4f8ff', 0.4, cam.px([fx, 3.1, fz]) * 0.4);
      }
    }
  }
  // 빛기둥 / 비의 습기
  if (!isRain) {
    d.g({ opacity: 0.14, filter: d.blur(10) }, () => {
      for (const p of patches) {
        const pts2 = hull([...p.win, ...p.floor].map((q) => cam.poly([q, q, q]) && cam.P(q)));
        if (pts2.length > 2) d.poly(pts2, '#ffe2a8');
      }
    });
    d.rect(0, 0, W, H, d.lin([[0, '#3a2a40', 0.18], [0.5, '#ffd8a0', 0.06], [1, '#3a2a40', 0.18]], 0, 0, W, 0));
  } else {
    glow(d, 800, 330, 520, '#dfe6ee', 0.35, 260);
    d.rect(0, 0, W, H, d.lin([[0, '#2a3440', 0.22], [0.5, '#8a98a8', 0.04], [1, '#2a3440', 0.22]], 0, 0, W, 0));
  }
  return d;
}

// ---------------------------------------------------------------------------
// 장면: 중정 벤치(점심시간)
// ---------------------------------------------------------------------------

/** 리본창(층별 띠 유리 + 세로 창틀)이 있는 학교 건물 벽면. P(u, y) → 월드 점 */
function ribbonWall(d, cam, P, u0, u1, floors, nm, o = {}) {
  const dist = cam.dist(P((u0 + u1) / 2, 6));
  const glass = d.shade(o.glass || '#9bb9d2', nm, dist);
  for (let f = 0; f < floors; f++) {
    const y0 = 1.0 + f * 3.6;
    const y1 = y0 + 1.75;
    face(d, cam, [P(u0, y0), P(u1, y0), P(u1, y1), P(u0, y1)], glass);
    if (o.lit) {
      // 밤/노을: 일부 창이 밝게
    }
  }
  const mul = new Lines(d, d.shade(o.frame || '#e6e3dc', nm, dist));
  const step = o.step ?? 3.2;
  for (let u = u0 + step / 2; u < u1; u += step) mul.add3(cam, P(u, 1.0), P(u, 1.0 + (floors - 1) * 3.6 + 1.75), o.mw ?? 0.14);
  mul.flush();
}

function sceneCourtyard(id, t) {
  const d = new Doc(id, t, 4405);
  const r = d.r;
  const cam = camera({ hy: 500, f: 740, eye: 1.5, x0: 0.8 });
  const cl = t.cloud;
  const lx = 0.45;
  skyRect(d, t.sky, 0, 560);
  glow(d, 1400, -60, 620, '#ffffff', 0.55);
  cumulus(d, { x: 860, y: 315, w: 780, h: 250, c: cl, lx, blur: 2 });
  cumulus(d, { x: 330, y: 190, w: 300, h: 90, c: cl, lx, blur: 2 });
  streakCloud(d, 1250, 110, 520, 30, cl.lit, 0.5, 5);

  const Zb = 58;
  const bh = 15.5;
  // 본관(정면) — 초점 밖(약한 블러)
  d.g({ filter: d.blur(1.1) }, () => {
    box(d, cam, { x: [-80, 80], y: [0, bh], z: [Zb, Zb + 14], col: { front: '#f1ede4', top: '#d8d4cc' } });
    ribbonWall(d, cam, (u, y) => [u, y, Zb - 0.02], -80, 80, 4, [0, 0, -1]);
    const nF = [0, 0, -1];
    const fen = new Lines(d, d.shade('#8a9096', nF, 60));
    fen.add3(cam, [-80, bh + 1.1, Zb + 0.3], [80, bh + 1.1, Zb + 0.3], 0.07);
    for (let x = -80; x <= 80; x += 1.6) fen.add3(cam, [x, bh, Zb + 0.3], [x, bh + 1.1, Zb + 0.3], 0.05);
    fen.flush();
    // 시계(숫자 없음)
    const C = [21, 13.3, Zb - 0.05];
    const c = cam.P(C);
    const rr = cam.px(C) * 1.05;
    d.circle(c[0], c[1], rr * 1.12, d.shade('#6a7078', nF, 60));
    d.circle(c[0], c[1], rr, '#fbfaf6');
    d.line(c[0], c[1], c[0] + rr * 0.1, c[1] - rr * 0.7, '#333', 1.6);
    d.line(c[0], c[1], c[0] + rr * 0.55, c[1] + rr * 0.1, '#333', 2);
  });
  // 좌·우 별관
  const nl = [1, 0, 0];
  const nr = [-1, 0, 0];
  face(d, cam, [[-18, 0, 18], [-18, bh, 18], [-18, bh, Zb], [-18, 0, Zb]], d.shade('#efeae0', nl, 30));
  ribbonWall(d, cam, (u, y) => [-17.98, y, u], 18, Zb, 4, nl);
  face(d, cam, [[15, 0, 6], [15, bh, 6], [15, bh, Zb], [15, 0, Zb]], d.lin([[0, d.shade('#efeae0', nr, 30)], [1, d.shade('#e2ddd2', nr, 10)]], 0, 0, W, 0));
  ribbonWall(d, cam, (u, y) => [14.98, y, u], 6, Zb, 4, nr);
  // 옥상 난간(우)
  {
    const fen = new Lines(d, d.shade('#8a9096', nr, 20));
    fen.add3(cam, [15.2, bh + 1.1, 6], [15.2, bh + 1.1, Zb], 0.07);
    for (let z = 6; z <= Zb; z += 1.6) fen.add3(cam, [15.2, bh, z], [15.2, bh + 1.1, z], 0.05);
    fen.flush();
  }

  // 지면: 잔디 + 가운데 포장길 + 화단
  face(d, cam, [[-18, 0, 1], [15, 0, 1], [15, 0, Zb], [-18, 0, Zb]], d.lin([[0, d.G('#a6c878', 40, 0.9)], [1, d.G('#7fae58', 0, 0.9)]], 0, 500, 0, 900));
  face(d, cam, [[-2.6, 0.003, 1], [4.2, 0.003, 1], [4.2, 0.003, Zb], [-2.6, 0.003, Zb]], d.lin([[0, d.G('#e6dfd0', 40, 0.8)], [1, d.G('#cfc6b4', 0, 0.8)]], 0, 500, 0, 900));
  const tl = new Lines(d, d.G('#a89f8c', 10, 0.6), { opacity: 0.55 });
  for (let z = 2; z < Zb; z += 1.2) tl.add3(cam, [-2.6, 0.005, z], [4.2, 0.005, z], 0.015);
  for (let x = -2.6; x <= 4.21; x += 1.36) tl.add3(cam, [x, 0.005, 1], [x, 0.005, Zb], 0.015);
  tl.flush();
  box(d, cam, { x: [12.6, 15], y: [0, 0.35], z: [6, Zb], col: '#b06a50' });
  for (let i = 0; i < 70; i++) {
    const z = r.range(7, 40);
    const c = cam.P([r.range(12.8, 14.8), 0.45, z]);
    const s = cam.px([13.8, 0.4, z]);
    d.circle(c[0], c[1], Math.max(1.2, s * 0.12), d.G(r.pick(['#f26a7a', '#ffd34d', '#ffffff', '#b07ae0', '#ff9a4a']), z, 0.8));
  }
  // 왼쪽 생울타리
  for (let z = Zb - 4; z > 16; z -= 3.5) {
    const c = cam.P([-16.5, 0.8, z]);
    const s = cam.px([-16.5, 0.8, z]);
    foliage(d, c[0], c[1], s * 2.2, s * 0.8, leaves(d, z), { lx, count: 8 });
  }
  // 음수대(오른쪽)
  box(d, cam, { x: [5.2, 6.8], y: [0, 0.82], z: [9.2, 9.8], col: '#c9c6be' });
  segsPath(d, cam, [[[5.6, 0.82, 9.5], [5.6, 0.98, 9.5]], [[6.0, 0.82, 9.5], [6.0, 0.98, 9.5]], [[6.4, 0.82, 9.5], [6.4, 0.98, 9.5]]], d.G('#b9bec4', 9, 0.8), 0.03);

  // 큰 느티나무 그늘
  {
    const c = cam.P([-6.5, 0, 12]);
    const s = cam.px([-6.5, 0, 12]);
    d.g({ filter: d.blur(3), opacity: 0.5 }, () => {
      d.ellipse(c[0] + s * 1.2, c[1], s * 6, s * 6 * (cam.eye / 12) * 1.6, '#3d6a52');
    });
    d.g({ opacity: 0.45, filter: d.blur(1.5) }, () => {
      for (let i = 0; i < 16; i++) {
        const X = r.range(-11, -2);
        const Z = r.range(8, 16);
        const p = cam.P([X, 0, Z]);
        const ps = cam.px([X, 0, Z]);
        d.ellipse(p[0], p[1], ps * r.range(0.15, 0.4), ps * 0.08, '#e6f2b0');
      }
    });
  }
  // 벤치
  {
    const wood = '#b98a58';
    segsPath(d, cam, [[[-4.3, 0, 7.9], [-4.3, 0.42, 7.9]], [[-4.3, 0, 9.5], [-4.3, 0.42, 9.5]], [[-4.75, 0, 7.9], [-4.75, 0.9, 7.9]], [[-4.75, 0, 9.5], [-4.75, 0.9, 9.5]]], d.G('#5a5e64', 8, 0.4), 0.05);
    box(d, cam, { x: [-4.75, -4.2], y: [0.42, 0.47], z: [7.7, 9.7], col: wood });
    box(d, cam, { x: [-4.82, -4.75], y: [0.58, 0.9], z: [7.7, 9.7], col: wood });
  }
  // 나무 줄기와 가지
  {
    const b = cam.P([-6.8, 0, 11]);
    const tp = cam.P([-6.8, 4.5, 11]);
    const s = cam.px([-6.8, 0, 11]);
    const bark = d.G('#6b5442', 11, 0.4);
    d.poly([[b[0] - s * 0.32, b[1]], [b[0] + s * 0.32, b[1]], [tp[0] + s * 0.18, tp[1]], [tp[0] - s * 0.18, tp[1]]], bark);
    d.poly([[b[0] + s * 0.05, b[1]], [b[0] + s * 0.32, b[1]], [tp[0] + s * 0.18, tp[1]], [tp[0] + s * 0.04, tp[1]]], d.G('#8f7660', 11, 1));
    const br = new Lines(d, bark);
    br.add(tp[0], tp[1], tp[0] + s * 2.2, tp[1] - s * 1.6, s * 0.18);
    br.add(tp[0], tp[1], tp[0] - s * 1.4, tp[1] - s * 2.2, s * 0.2);
    br.add(tp[0] + s * 0.6, tp[1] - s * 0.5, tp[0] + s * 0.9, tp[1] - s * 2.8, s * 0.14);
    br.flush();
    const lv = leaves(d, 10);
    foliage(d, tp[0] + s * 0.6, tp[1] - s * 2.6, s * 4.6, s * 2.4, lv, { lx, count: 80, blur: 0.6 });
    foliage(d, tp[0] + s * 3.4, tp[1] - s * 2.0, s * 2.0, s * 1.3, lv, { lx, count: 26, blur: 0.6 });
  }
  // 전경 잎(초점 밖)
  foliage(d, 60, 40, 260, 140, leaves(d, 0), { blur: 7, count: 30, lx });
  d.rect(0, 0, W, H, d.lin([[0, '#fffbe8', 0.14], [0.5, '#ffffff', 0], [1, '#2a4a3a', 0.08]], 0, 0, 0, H));
  return d;
}

// ---------------------------------------------------------------------------
// 장면: 동네 상점가(아케이드)와 막과자 가게(늦은 오후)
// ---------------------------------------------------------------------------

function sceneShotengai(id, t) {
  const d = new Doc(id, t, 5506);
  const r = d.r;
  const cam = camera({ hy: 440, f: 680, eye: 1.5, x0: 0.3, z0: -3.5 });
  const XS = 3.2;
  const ZE = 74;
  const roofY = (X) => 7.6 + 1.0 * (1 - (X / XS) ** 2);

  // 아케이드 끝 너머(밝은 바깥)
  skyRect(d, t.sky, 0, 520);
  glow(d, 860, 420, 440, '#ffe2a6', 0.95, 230);
  d.g({ filter: d.blur(2) }, () => {
    for (let i = 0; i < 10; i++) {
      const X = r.range(-14, 14);
      const c = cam.P([X, 0, 90]);
      const s = cam.px([X, 0, 90]);
      d.rect(c[0] - s * 3, c[1] - s * r.range(5, 14), s * 6, s * 16, d.G(r.pick([MAT.cream, MAT.beige, MAT.gray]), 90, 0.6));
    }
  });
  // 바닥
  face(d, cam, [[-XS, 0, -6], [XS, 0, -6], [XS, 0, ZE], [-XS, 0, ZE]], d.lin([[0, d.G('#efe0c2', 50, 0.8)], [1, d.G('#c4b49a', 0, 0.6)]], 0, 440, 0, 900));
  const tl = new Lines(d, d.G('#a8977c', 6, 0.5), { opacity: 0.5 });
  for (let x = -XS; x <= XS + 0.01; x += 0.8) tl.add3(cam, [x, 0.003, -6], [x, 0.003, ZE], 0.012);
  for (let z = -5.5; z < 30; z += 0.8) tl.add3(cam, [-XS, 0.003, z], [XS, 0.003, z], 0.012);
  tl.flush();
  // 바닥에 비친 빛
  d.g({ opacity: 0.35, filter: d.blur(6) }, () => face(d, cam, [[-1.6, 0.004, ZE], [1.8, 0.004, ZE], [1.6, 0.004, 8], [-0.8, 0.004, 8]], d.lin([[0, '#fff0c8'], [1, '#fff0c8', 0]], 0, 440, 0, 700)));

  // 아케이드 지붕(반투명 패널) + 아치 골조
  const xsR = [-XS, -2.4, -1.6, -0.8, 0, 0.8, 1.6, 2.4, XS];
  for (let i = 0; i < xsR.length - 1; i++) {
    const a = xsR[i];
    const b = xsR[i + 1];
    face(d, cam, [[a, roofY(a), -6], [b, roofY(b), -6], [b, roofY(b), ZE], [a, roofY(a), ZE]], d.lin([[0, '#fff2d6'], [0.6, d.G('#f2e2c2', 0, 0.9)], [1, d.G('#d9c6a2', 0, 0.7)]], 0, 430, 0, -200));
  }
  const frame = new Lines(d, d.G('#6f6a62', 10, 0.4));
  for (let z = -6; z < ZE; z += 4) {
    for (let i = 0; i < xsR.length - 1; i++) frame.add3(cam, [xsR[i], roofY(xsR[i]) - 0.05, z], [xsR[i + 1], roofY(xsR[i + 1]) - 0.05, z], 0.1);
  }
  for (const x of xsR) frame.add3(cam, [x, roofY(x) - 0.05, -6], [x, roofY(x) - 0.05, ZE], 0.05);
  frame.flush();

  // 가게들(양쪽, 먼 곳부터)
  const shops = [];
  for (const side of [-1, 1]) {
    let z = side < 0 ? 6.8 : 5.0;
    while (z < ZE - 2) {
      const len = r.range(3.6, 5.4);
      shops.push({ side, z0: z, z1: z + len, wall: r.pick(['#e9e0cc', '#d9cdb4', '#e6e6e0', '#d6c2a4', '#cfd6d8']), aw: r.pick([['#d8443c', '#f4f0e8'], ['#2f6db0', '#f4f0e8'], ['#3f8a5a', '#f4f0e8'], ['#e0a030', '#f4f0e8'], ['#8a4a8a', '#f4e8f0']]), sign: r.pick(['#2a4a7a', '#7a2a2a', '#f2e6c8', '#2a6a4a', '#5a3a2a']), shutter: r.chance(0.18) });
      z += len + 0.15;
    }
  }
  // 앞쪽 가게들(오른쪽 과일가게, 왼쪽 막과자 가게 앞집)
  shops.push({ side: 1, z0: -1.2, z1: 4.85, wall: '#e9e0cc', aw: ['#2f6db0', '#f4f0e8'], sign: '#2a4a7a', fruit: true });
  shops.push({ side: 1, z0: -6, z1: -1.35, wall: '#d6c2a4', aw: ['#e0a030', '#f4f0e8'], sign: '#5a3a2a', shutter: true });
  shops.push({ side: -1, z0: -6, z1: 0, wall: '#cfd6d8', aw: ['#3f8a5a', '#f4f0e8'], sign: '#2a6a4a', shutter: true });
  shops.sort((a, b) => b.z0 - a.z0);
  // 가게 사이 틈이 비지 않도록 바탕 벽
  for (const sd of [-1, 1]) face(d, cam, [[sd * XS * 1.02, 0, -6], [sd * XS * 1.02, roofY(XS), -6], [sd * XS * 1.02, roofY(XS), ZE], [sd * XS * 1.02, 0, ZE]], d.G('#5a4a40', 10, 0.3));
  const goodsC = ['#e2524a', '#f0c33c', '#4bb06a', '#f08a3a', '#3f86d6', '#f4f0e8', '#c86ab0'];
  for (const sh of shops) {
    const s = sh.side;
    const X = s * XS;
    const nm = [-s, 0, 0];
    const dist = cam.dist([X, 2, (sh.z0 + sh.z1) / 2]);
    const Q = (x, y0, y1, z0, z1) => [[x, y0, z0], [x, y1, z0], [x, y1, z1], [x, y0, z1]];
    face(d, cam, Q(X, 0, roofY(X), sh.z0, sh.z1), d.shade(sh.wall, nm, dist));
    face(d, cam, Q(X - s * 0.01, 4.4, 6.4, sh.z0 + 0.5, sh.z1 - 0.5), d.shade('#a9c2d4', nm, dist));
    face(d, cam, Q(X - s * 0.02, 2.95, 3.75, sh.z0 + 0.1, sh.z1 - 0.1), d.shade(sh.sign, nm, dist));
    // 간판 무늬(글자 대신 원과 띠)
    const mid = (sh.z0 + sh.z1) / 2;
    face(d, cam, Q(X - s * 0.03, 3.25, 3.45, sh.z0 + 0.4, sh.z1 - 0.4), d.shade(mix(sh.sign, '#ffffff', 0.55), nm, dist));
    if (dist < 30) {
      const c = cam.P([X - s * 0.03, 3.35, mid]);
      const rr = cam.px([X, 3.35, mid]) * 0.3;
      d.ellipse(c[0], c[1], rr * Math.min(1, 6 / dist + 0.15), rr, d.shade('#f6d24a', nm, dist));
    }
    if (sh.shutter) {
      face(d, cam, Q(X - s * 0.01, 0, 2.8, sh.z0 + 0.15, sh.z1 - 0.15), d.shade('#a7abb0', nm, dist));
      const sl = new Lines(d, d.shade('#8a8e94', nm, dist));
      for (let y = 0.2; y < 2.8; y += 0.25) sl.add3(cam, [X - s * 0.02, y, sh.z0 + 0.15], [X - s * 0.02, y, sh.z1 - 0.15], 0.012);
      sl.flush();
    } else {
      face(d, cam, Q(X - s * 0.01, 0, 2.8, sh.z0 + 0.15, sh.z1 - 0.15), d.shade('#5a4636', nm, dist));
      face(d, cam, Q(X - s * 0.015, 1.2, 2.6, sh.z0 + 0.3, sh.z1 - 0.3), d.G('#ffe2b0', dist, 0.9), { opacity: 0.35 });
      if (dist < 40) {
        for (let k = 0; k < 6; k++) {
          const z0 = lerp(sh.z0 + 0.3, sh.z1 - 0.5, k / 6);
          const y0 = 0.5 + (k % 2) * 0.5;
          face(d, cam, Q(X - s * 0.02, y0, y0 + 0.35, z0, z0 + (sh.z1 - sh.z0) / 8), d.shade(r.pick(goodsC), nm, dist));
        }
      }
    }
    // 차양(줄무늬는 가까운 가게만)
    const ax = X - s * 0.95;
    const stripes = dist < 22 ? Math.round((sh.z1 - sh.z0) / 0.4) : 1;
    for (let k = 0; k < stripes; k++) {
      const z0 = lerp(sh.z0 + 0.1, sh.z1 - 0.1, k / stripes);
      const z1 = lerp(sh.z0 + 0.1, sh.z1 - 0.1, (k + 1) / stripes);
      const c = stripes === 1 ? sh.aw[0] : sh.aw[k % 2];
      face(d, cam, [[X, 2.95, z0], [ax, 2.55, z0], [ax, 2.55, z1], [X, 2.95, z1]], d.shade(c, norm([-s * 0.4, -1, 0]), dist));
      face(d, cam, [[ax, 2.55, z0], [ax, 2.3, z0], [ax, 2.3, z1], [ax, 2.55, z1]], d.shade(c, nm, dist));
    }
    if (sh.fruit) {
      const fc = ['#e2524a', '#f0a030', '#8ac040', '#f6d24a', '#c84060'];
      box(d, cam, { x: [XS - 1.15, XS - 0.2], y: [0, 0.62], z: [-0.8, 4.4], col: '#8a6a4a' });
      for (let k = 0; k < 5; k++) {
        const z0 = -0.7 + k * 1.02;
        face(d, cam, [[XS - 1.15, 0.64, z0], [XS - 0.25, 0.9, z0], [XS - 0.25, 0.9, z0 + 0.95], [XS - 1.15, 0.64, z0 + 0.95]], d.G('#c8a070', 3, 0.8));
        const ps = cam.px([XS - 0.7, 0.75, z0 + 0.45]);
        for (let i = 0; i < 9; i++) {
          const c = cam.P([XS - 1.05 + (i % 3) * 0.3, 0.72 + (i % 3) * 0.08, z0 + 0.18 + Math.floor(i / 3) * 0.3]);
          d.circle(c[0], c[1], ps * 0.1, d.G(fc[k], 3, 0.9));
        }
      }
    }
  }

  // 막과자 가게(왼쪽 앞)
  {
    const X = -XS;
    const nm = [1, 0, 0];
    const z0 = 0.0;
    const z1 = 6.6;
    const Q = (x, y0, y1, a, b) => [[x, y0, a], [x, y1, a], [x, y1, b], [x, y0, b]];
    const dist = 6;
    face(d, cam, Q(X, 0, roofY(X), z0, z1), d.shade('#6e5038', nm, dist));
    const bd = new Lines(d, d.shade('#4e3826', nm, dist), { opacity: 0.8 });
    for (let y = 3.9; y < 7.5; y += 0.22) bd.add3(cam, [X + 0.01, y, z0], [X + 0.01, y, z1], 0.015);
    bd.flush();
    face(d, cam, Q(X + 0.02, 4.6, 6.0, 3.6, 5.8), d.shade('#d9c9a4', nm, dist));
    const lat = new Lines(d, d.shade('#5a4030', nm, dist));
    for (let z = 3.6; z <= 5.8; z += 0.22) lat.add3(cam, [X + 0.03, 4.6, z], [X + 0.03, 6.0, z], 0.025);
    for (let y = 4.6; y <= 6.0; y += 0.35) lat.add3(cam, [X + 0.03, y, 3.6], [X + 0.03, y, 5.8], 0.025);
    lat.flush();
    // 나무 간판(무늬)
    face(d, cam, Q(X + 0.03, 3.0, 3.85, z0 + 0.3, z1 - 0.3), d.shade('#3e2a1c', nm, dist));
    for (let k = 0; k < 4; k++) {
      const c = cam.P([X + 0.04, 3.42, lerp(z0 + 1.2, z1 - 1.2, k / 3)]);
      const rr = cam.px([X, 3.42, lerp(z0 + 1.2, z1 - 1.2, k / 3)]) * 0.27;
      d.ellipse(c[0], c[1], rr * 0.6, rr, d.shade(['#f2c84a', '#f26a5a', '#f2c84a', '#7ac0e0'][k], nm, dist));
    }
    // 유리 미닫이문 + 안쪽 진열
    face(d, cam, Q(X + 0.02, 0, 2.6, z0 + 0.2, z1 - 0.2), d.shade('#5a4636', nm, dist));
    face(d, cam, Q(X + 0.025, 0.3, 2.5, z0 + 0.3, z1 - 0.3), d.G('#ffe2b0', dist, 0.9), { opacity: 0.22 });
    // 가게 안 선반(작은 과자 봉지·병이 줄지어)
    const shelf = new Lines(d, d.shade('#8a6a4a', nm, dist));
    for (const y of [0.7, 1.25, 1.8]) {
      shelf.add3(cam, [X + 0.03, y, z0 + 0.3], [X + 0.03, y, z1 - 0.3], 0.04);
      for (let z = z0 + 0.35; z < z1 - 0.4; z += r.range(0.12, 0.2)) {
        const h = r.range(0.14, 0.3);
        face(d, cam, Q(X + 0.035, y + 0.01, y + h, z, z + 0.1), d.shade(r.pick(goodsC), nm, dist));
      }
    }
    face(d, cam, Q(X + 0.04, 0, 2.6, z0 + 0.2, z1 - 0.2), '#ffffff', { opacity: 0.12 });
    const df = new Lines(d, d.shade('#8a6a4a', nm, dist));
    for (let k = 0; k <= 4; k++) df.add3(cam, [X + 0.05, 0, lerp(z0 + 0.2, z1 - 0.2, k / 4)], [X + 0.05, 2.6, lerp(z0 + 0.2, z1 - 0.2, k / 4)], 0.06);
    for (const y of [0.05, 0.8, 2.55]) df.add3(cam, [X + 0.05, y, z0 + 0.2], [X + 0.05, y, z1 - 0.2], 0.05);
    df.flush();
    // 빨강·흰 줄무늬 차양
    const ax = X + 1.15;
    const st = 16;
    for (let k = 0; k < st; k++) {
      const a = lerp(z0, z1, k / st);
      const b = lerp(z0, z1, (k + 1) / st);
      const c = k % 2 ? '#f6f1e6' : '#d63c34';
      face(d, cam, [[X, 2.9, a], [ax, 2.45, a], [ax, 2.45, b], [X, 2.9, b]], d.shade(c, norm([0.4, -1, 0]), dist));
      face(d, cam, [[ax, 2.45, a], [ax, 2.15, a], [ax, 2.15, b], [ax, 2.45, b]], d.shade(c, nm, dist));
    }
    // 진열대(기울어진 판 위에 과자 봉지)
    box(d, cam, { x: [X + 0.1, X + 0.95], y: [0, 0.62], z: [0.5, 2.6], col: '#8a6646' });
    face(d, cam, [[X + 0.1, 0.95, 0.5], [X + 0.95, 0.66, 0.5], [X + 0.95, 0.66, 2.6], [X + 0.1, 0.95, 2.6]], d.G('#b08a60', 4, 0.8));
    for (let row = 0; row < 3; row++) {
      for (let z = 0.58; z < 2.5; z += 0.16) {
        const x0 = X + 0.16 + row * 0.27;
        const y0 = 0.93 - row * 0.095;
        face(d, cam, [[x0, y0 + 0.012, z], [x0 + 0.2, y0 - 0.06, z], [x0 + 0.2, y0 - 0.06, z + 0.12], [x0, y0 + 0.012, z + 0.12]], d.G(r.pick(goodsC), 4, 0.9));
      }
    }
    // 가챠 기계 2대(빨간 받침 + 투명 캡슐 통)
    for (const gz of [3.0, 3.62]) {
      box(d, cam, { x: [X + 0.3, X + 0.82], y: [0, 0.78], z: [gz, gz + 0.55], col: '#d8403a' });
      box(d, cam, { x: [X + 0.32, X + 0.8], y: [0.78, 1.3], z: [gz + 0.03, gz + 0.52], col: { side: '#dfeaf0', top: '#eef4f8', front: '#d6e2ea' } });
      const ps = cam.px([X + 0.82, 1.0, gz + 0.27]);
      for (let i = 0; i < 12; i++) {
        const c = cam.P([X + 0.81, 0.85 + (i % 4) * 0.11, gz + 0.1 + Math.floor(i / 4) * 0.15]);
        d.circle(c[0], c[1], ps * 0.055, r.pick(goodsC));
      }
      const knob = cam.P([X + 0.83, 0.5, gz + 0.27]);
      d.circle(knob[0], knob[1], ps * 0.08, '#e8e8e8');
    }
    // 아이스 냉동고
    box(d, cam, { x: [X + 0.15, X + 0.95], y: [0, 0.85], z: [4.6, 6.0], col: { side: '#eef0f2', top: '#cfe4f0' } });
    // 매달린 장난감
    const hang = new Lines(d, '#6a5a4a');
    for (let k = 0; k < 7; k++) {
      const z = lerp(0.4, 6.2, k / 6);
      const a = cam.P([X + 0.9, 2.45, z]);
      const b = cam.P([X + 0.9, 1.95, z]);
      hang.add(a[0], a[1], b[0], b[1], 1);
      d.circle(b[0], b[1], cam.px([X, 2, z]) * 0.07, d.G(r.pick(goodsC), 4, 0.9));
    }
    hang.flush();
  }

  // 칠석 장식(후키나가시) — 지붕에 매달린 색 띠
  for (const z of [30, 22, 14]) {
    for (const X of [-2.0, 2.2]) {
      const top = cam.P([X, 7.3, z]);
      const s = cam.px([X, 7.3, z]);
      d.circle(top[0], top[1], s * 0.28, d.G('#f2a0c0', z, 1));
      const cols = ['#e84a5a', '#f6c84a', '#4ab0e0', '#6ac06a', '#f4f0f4', '#b06ae0'];
      cols.forEach((c, k) => {
        const x = top[0] + (k - 2.5) * s * 0.09;
        d.path(`M${n(x)} ${n(top[1] + s * 0.2)}q${n(s * 0.1)} ${n(s * 1.2)} ${n(s * 0.04)} ${n(s * 2.6)}`, { stroke: d.G(c, z, 1), 'stroke-width': Math.max(1, s * 0.07), fill: 'none', opacity: 0.9 });
      });
    }
  }
  // 걸개 깃발
  for (const z of [44, 36]) {
    for (const X of [-2.4, 2.4]) {
      face(d, cam, [[X - 0.3, 6.6, z], [X + 0.3, 6.6, z], [X + 0.3, 4.6, z], [X - 0.3, 4.6, z]], d.G(X < 0 ? '#d84a3a' : '#2f6db0', z, 0.8));
      face(d, cam, [[X - 0.3, 5.0, z - 0.01], [X + 0.3, 5.0, z - 0.01], [X + 0.3, 4.8, z - 0.01], [X - 0.3, 4.8, z - 0.01]], d.G('#f4f0e8', z, 0.8));
    }
  }
  // 빛줄기(지붕 틈)
  d.g({ opacity: 0.16, filter: d.blur(10) }, () => {
    for (const z of [10, 18, 26]) {
      const a = cam.P([-1.5, 8.4, z]);
      const b = cam.P([0.5, 8.4, z + 1.5]);
      const c = cam.P([2.8, 0, z - 6]);
      const e = cam.P([0.8, 0, z - 7]);
      d.poly([a, b, c, e], '#fff1c8');
    }
  });
  d.rect(0, 0, W, H, d.lin([[0, '#ffd08a', 0.16], [0.5, '#ffd08a', 0], [1, '#3a2830', 0.16]], 0, 0, 0, H));
  return d;
}

// ---------------------------------------------------------------------------
// 장면: 강변 둑길 (노을 / 불꽃놀이 밤)
// ---------------------------------------------------------------------------

function sceneRiverbank(id, t) {
  const night = id === 'riverbank_night';
  const d = new Doc(id, t, 6607);
  const r = d.r;
  const hy = night ? 500 : 470;
  const cam = camera({ hy, f: 900, eye: 7.2, x0: 0 });
  const cl = t.cloud;
  const sunX = 430;

  skyRect(d, t.sky, 0, hy + 60);
  if (!night) {
    glow(d, sunX, hy - 45, 760, '#ffd89a', 0.7, 400);
    glow(d, sunX, hy - 45, 110, '#fff5d8', 1);
    d.circle(sunX, hy - 45, 24, '#fffaf0');
    cumulus(d, { x: 1150, y: 300, w: 560, h: 170, c: cl, lx: -0.7, blur: 2 });
    streakCloud(d, 300, 220, 700, 40, cl.mid, 0.6, 5);
    streakCloud(d, 900, 150, 800, 40, cl.lit, 0.5, 6);
    streakCloud(d, 560, 360, 600, 25, '#ffd2a0', 0.6, 4);
  } else {
    stars(d, 140, hy - 40, '#ffffff', 9);
    glow(d, 800, hy + 10, 950, '#8a6aa8', 0.5, 190);
    streakCloud(d, 1200, 160, 600, 40, cl.lit, 0.45, 6);
    streakCloud(d, 300, 260, 500, 30, cl.mid, 0.4, 6);
  }
  // 먼 산
  ridge(d, hy - 3, 42, 0.0032, night ? '#2a2c5a' : d.G('#8a7aa8', 600, 0.4), 61, hy + 10);
  // 건너편 마을(먼 건물)
  const bld = [];
  for (let i = 0; i < 70; i++) bld.push({ X: r.range(-700, 700), Z: r.range(230, 720), w: r.range(10, 34), h: r.range(6, i < 10 ? 60 : 26) });
  bld.sort((a, b) => b.Z - a.Z);
  const winB = night ? new Lines(d, '#ffd98a') : null;
  for (const b of bld) {
    const c = cam.P([b.X, 0, b.Z]);
    const s = cam.px([b.X, 0, b.Z]);
    const top = cam.P([b.X, b.h, b.Z])[1];
    const col = night ? mix('#2a2c58', '#3a3a6e', r()) : d.G(r.pick([MAT.cream, MAT.gray, MAT.paleBlue, MAT.beige]), b.Z, 0.35);
    d.rect(c[0], top, b.w * s, c[1] - top + 2, col);
    if (night && s * b.w > 6) {
      for (let k = 0; k < 4; k++) {
        if (!r.chance(0.6)) continue;
        const wx = c[0] + r.range(0.1, 0.85) * b.w * s;
        const wy = lerp(top, c[1], r.range(0.1, 0.8));
        winB.add(wx, wy, wx + 2.5, wy, 1.6);
      }
    }
  }
  if (winB) winB.flush();
  // 송전탑(왼쪽 먼 곳)
  {
    const tw = new Lines(d, night ? '#1e2044' : d.G('#6a6a8a', 300, 0.4));
    for (const [X, Z] of [[-260, 420], [-120, 520]]) {
      const b = cam.P([X, 0, Z]);
      const s = cam.px([X, 0, Z]);
      const hh = 55 * s;
      tw.add(b[0] - 5 * s, b[1], b[0], b[1] - hh, 1.2);
      tw.add(b[0] + 5 * s, b[1], b[0], b[1] - hh, 1.2);
      for (const k of [0.55, 0.7, 0.85]) tw.add(b[0] - 7 * s * (1.1 - k), b[1] - hh * k, b[0] + 7 * s * (1.1 - k), b[1] - hh * k, 1);
    }
    tw.flush();
  }
  // 건너편 둑
  const gFar = night ? '#36466c' : d.G('#8aa868', 180, 0.6);
  face(d, cam, [[-3000, 0, 172], [3000, 0, 172], [3000, 6.2, 186], [-3000, 6.2, 186]], gFar);
  face(d, cam, [[-3000, 6.2, 186], [3000, 6.2, 186], [3000, 6.2, 194], [-3000, 6.2, 194]], night ? '#3a3a5e' : d.G('#b8a890', 190, 0.6));
  for (let i = 0; i < 26; i++) {
    const X = r.range(-260, 260);
    const c = cam.P([X, 8, 196]);
    const s = cam.px([X, 8, 196]);
    foliage(d, c[0], c[1], s * 4, s * 2.6, night ? { dark: '#1a2040', mid: '#242a52' } : leaves(d, 196), { count: 6, r });
  }
  // 강물
  const water = night ? [[0, '#6e5c98'], [0.5, '#3c447c'], [1, '#283060']] : [[0, '#ffd2a0'], [0.35, '#e89a8a'], [1, '#6a5a96']];
  face(d, cam, [[-3000, 0, 30], [3000, 0, 30], [3000, 0, 172], [-3000, 0, 172]], d.lin(water, 0, cam.P([0, 0, 172])[1], 0, cam.P([0, 0, 30])[1]));
  const yFar = cam.P([0, 0, 172])[1];
  const yNear = cam.P([0, 0, 30])[1];
  if (!night) {
    d.g({ filter: d.blur(3) }, () => d.ellipse(sunX, (yFar + yNear) / 2, 46, (yNear - yFar) / 2, '#fff0c0', { opacity: 0.7 }));
    const gl = new Lines(d, '#fff6dc', { opacity: 0.85 });
    for (let i = 0; i < 40; i++) {
      const y = r.range(yFar + 2, yNear - 2);
      const w = r.range(8, 40) * (0.5 + (y - yFar) / (yNear - yFar));
      const x = sunX + r.range(-60, 60) * (0.4 + (y - yFar) / (yNear - yFar));
      gl.add(x - w / 2, y, x + w / 2, y, 1.5);
    }
    gl.flush();
  } else {
    // 도시 불빛 반사(세로 줄)
    d.g({ filter: d.blur(2.5), opacity: 0.6 }, () => {
      for (let i = 0; i < 26; i++) {
        const x = r.range(0, W);
        d.rect(x, yFar, r.range(2, 5), (yNear - yFar) * r.range(0.3, 0.7), r.pick(['#ffd98a', '#ffe6b0', '#f0b0d0']));
      }
    });
  }
  const ripple = new Lines(d, night ? '#8a86c0' : '#ffffff', { opacity: night ? 0.3 : 0.35 });
  for (let i = 0; i < 50; i++) {
    const y = r.range(yFar + 4, yNear);
    const k = (y - yFar) / (yNear - yFar);
    const x = r.range(0, W);
    ripple.add(x, y, x + 10 + 50 * k, y, 1 + k);
  }
  ripple.flush();

  // 철교(트러스) — 오른쪽에서 건너편으로
  const BX = 38;
  const BX2 = 45;
  const bridgeC = night ? '#2a2e52' : d.G('#4f7a80', 60, 0.6);
  const bridgeFar = night ? '#20244a' : d.G('#3f6268', 80, 0.4);
  // 물에 비친 다리
  d.g({ opacity: night ? 0.35 : 0.3, filter: d.blur(2.5) }, () => {
    face(d, cam, [[BX, -7, 30], [BX, -8.2, 30], [BX, -8.2, 172], [BX, -7, 172]], night ? '#0e1030' : '#5a3a6a');
  });
  for (const pz of [160, 125, 90, 55]) {
    box(d, cam, { x: [BX + 0.3, BX2 - 0.3], y: [0, 6.95], z: [pz - 0.8, pz + 0.8], col: night ? '#262848' : '#8a8078', flat: night });
  }
  const far = new Lines(d, bridgeFar);
  const nearL = new Lines(d, bridgeC);
  const panel = 8;
  for (let z = 24; z < 196; z += panel) {
    for (const [X, L, w] of [[BX2, far, 0.25], [BX, nearL, 0.35]]) {
      L.add3(cam, [X, 8, z], [X, 8, z + panel], w);
      L.add3(cam, [X, 14, z], [X, 14, z + panel], w);
      L.add3(cam, [X, 8, z], [X, 14, z], w * 0.8);
      L.add3(cam, [X, ((z - 24) / panel) % 2 ? 8 : 14, z], [X, ((z - 24) / panel) % 2 ? 14 : 8, z + panel], w * 0.8);
    }
  }
  far.flush();
  face(d, cam, [[BX, 7, 20], [BX, 8.1, 20], [BX, 8.1, 200], [BX, 7, 200]], night ? '#1c2046' : d.G('#5a6a70', 50, 0.4));
  nearL.flush();
  if (night) {
    for (let z = 48; z < 190; z += 12) {
      const c = cam.P([BX - 0.2, 9.2, z]);
      const s = cam.px([BX, 9, z]);
      glow(d, c[0], c[1], s * 3, '#ffd88a', 0.8);
      d.circle(c[0], c[1], Math.max(1.2, s * 0.25), '#fff4d0');
      const m = cam.P([BX - 0.2, -9.2, z]);
      if (z < 172) d.rect(m[0] - 2, yFar + (m[1] - yFar) * 0.4, 4, (m[1] - yFar) * 0.9, '#ffd88a', { opacity: 0.35 });
    }
    // 건너편 둑 위 노점 불빛
    glow(d, 640, cam.P([0, 7, 188])[1], 520, '#ff9a6a', 0.35, 40);
    for (let i = 0; i < 70; i++) {
      const X = r.range(-170, 130);
      const c = cam.P([X, 6.8, 188]);
      glow(d, c[0], c[1], r.range(6, 14), r.pick(['#ffcf7a', '#ffb070', '#ff9a8a']), 0.9);
    }
    // 강물에 비친 노점 불빛
    d.g({ filter: d.blur(3), opacity: 0.45 }, () => d.rect(220, yFar, 860, (yNear - yFar) * 0.35, d.lin([[0, '#ff9a6a'], [1, '#ff9a6a', 0]], 0, yFar, 0, yFar + (yNear - yFar) * 0.35)));
  }

  // 가까운 둔치(풀밭 + 자갈길 + 갈대)
  const gNear = night ? '#2e3e5a' : d.G('#7aa258', 25, 0.6);
  face(d, cam, [[-3000, 0.4, 14], [3000, 0.4, 14], [3000, 0, 30], [-3000, 0, 30]], d.lin([[0, night ? '#3e5070' : d.G('#94b868', 30, 0.6)], [1, gNear]], 0, yNear, 0, 900));
  face(d, cam, [[-3000, 0.41, 20], [3000, 0.41, 20], [3000, 0.41, 21.8], [-3000, 0.41, 21.8]], night ? '#3e4462' : d.G('#d8c8a6', 20, 0.7));
  for (let i = 0; i < 60; i++) {
    const X = r.range(-60, 60);
    const c = cam.P([X, 0, 29.5]);
    const s = cam.px([X, 0, 29.5]);
    const h = s * r.range(1.2, 2.4);
    d.path(`M${n(c[0])} ${n(c[1])}q${n(-s * 0.2)} ${n(-h * 0.6)} ${n(s * 0.3)} ${n(-h)}M${n(c[0] + s * 0.3)} ${n(c[1])}q${n(s * 0.3)} ${n(-h * 0.5)} ${n(-s * 0.1)} ${n(-h * 0.8)}`, { stroke: night ? '#2a3e52' : d.G(r.pick(['#5f8a44', '#7aa858', '#4a7038']), 40, 0.6), 'stroke-width': Math.max(1, s * 0.08), fill: 'none' });
  }
  // 둑 경사면(아래, 대사창 영역)
  face(d, cam, [[-3000, 5.6, 5], [3000, 5.6, 5], [3000, 0.4, 14], [-3000, 0.4, 14]], night ? '#22304a' : d.G('#6f9a4e', 8, 0.7));
  // 전경 풀(초점 밖)
  d.g({ filter: d.blur(4) }, () => {
    for (let i = 0; i < 26; i++) {
      const x = r.chance(0.5) ? r.range(-20, 260) : r.range(1340, 1620);
      const h = r.range(80, 200);
      d.path(`M${n(x)} 910q${n(r.range(-20, 20))} ${n(-h * 0.6)} ${n(r.range(-40, 40))} ${n(-h)}`, { stroke: night ? '#1a2a3a' : d.G(r.pick(['#4f7a38', '#6a9a48']), 0, 0.5), 'stroke-width': r.range(5, 10), fill: 'none' });
    }
  });
  if (!night) d.rect(0, 0, W, H, d.lin([[0, '#5a3a8a', 0.12], [0.5, '#ffb070', 0.05], [1, '#3a2050', 0.25]], 0, 0, 0, H));
  else d.rect(0, 0, W, H, d.lin([[0, '#000018', 0], [1, '#0a0820', 0.18]], 0, 0, 0, H));
  return d;
}

// ---------------------------------------------------------------------------
// 장면: 역 앞 맨션가(아침)
// ---------------------------------------------------------------------------

function sceneStation(id, t) {
  const d = new Doc(id, t, 7708);
  const r = d.r;
  const cam = camera({ hy: 430, f: 700, eye: 1.5, x0: -2 });
  const cl = t.cloud;
  const lx = 0.6;
  skyRect(d, t.sky, 0, 520);
  glow(d, 1560, 20, 640, '#ffffff', 0.6);
  cumulus(d, { x: 760, y: 300, w: 520, h: 170, c: cl, lx, blur: 2 });
  cumulus(d, { x: 980, y: 150, w: 220, h: 60, c: cl, lx, blur: 2 });
  streakCloud(d, 640, 110, 560, 30, cl.lit, 0.55, 5);
  // 먼 도시
  d.g({ filter: d.blur(1.4) }, () => {
    for (let i = 0; i < 26; i++) {
      const X = r.range(-60, 30);
      const Z = r.range(80, 160);
      const c = cam.P([X, 0, Z]);
      const s = cam.px([X, 0, Z]);
      const h = r.range(8, 34);
      const top = cam.P([X, h, Z])[1];
      d.rect(c[0], top, s * r.range(8, 16), c[1] - top + 2, d.G(r.pick([MAT.cream, MAT.gray, MAT.paleBlue, MAT.white]), Z, 0.6));
    }
  });
  // 바닥(광장 포장 + 도로 + 횡단보도)
  face(d, cam, [[-60, 0, 1], [60, 0, 1], [60, 0, 60], [-60, 0, 60]], d.lin([[0, d.G('#dccdb0', 40, 0.9)], [1, d.G('#b09a7c', 0, 0.9)]], 0, 430, 0, 900));
  // 두 톤 보도블록(체크)
  d.g({ opacity: 0.35 }, () => {
    for (let z = 2; z < 12; z += 2) for (let x = -12; x < 22; x += 2) if (((x + z) / 2) % 2 === 0) face(d, cam, [[x, 0.002, z], [x + 1, 0.002, z], [x + 1, 0.002, z + 1], [x, 0.002, z + 1]], d.G('#c4a88a', z, 0.8));
  });
  face(d, cam, [[-60, 0.002, 12], [60, 0.002, 12], [60, 0.002, 17.5], [-60, 0.002, 17.5]], d.G('#7a7d86', 15, 0.6));
  const zebra = d.G('#f2f2ee', 15, 0.8);
  for (let x = -4.4; x <= 2.4; x += 0.9) face(d, cam, [[x, 0.004, 12.4], [x + 0.45, 0.004, 12.4], [x + 0.45, 0.004, 17.1], [x, 0.004, 17.1]], zebra, { opacity: 0.92 });
  const pv = new Lines(d, d.G('#8e887c', 8, 0.5), { opacity: 0.45 });
  for (let z = 2; z < 12; z += 1) pv.add3(cam, [-12, 0.003, z], [22, 0.003, z], 0.012);
  for (let x = -12; x < 22; x += 1) pv.add3(cam, [x, 0.003, 1], [x, 0.003, 12], 0.012);
  for (let z = 18.5; z < 26; z += 1) pv.add3(cam, [-12, 0.003, z], [22, 0.003, z], 0.012);
  pv.flush();
  // 플랫폼 지붕과 가선주(역 뒤, 왼쪽으로 이어짐)
  {
    box(d, cam, { x: [-80, 4], y: [0, 1.0], z: [34, 40], col: '#b9b4aa' });
    const cl2 = new Lines(d, d.G('#8a9096', 36, 0.5));
    for (let x = -70; x < 4; x += 6) cl2.add3(cam, [x, 1.0, 35], [x, 3.6, 35], 0.15);
    cl2.flush();
    box(d, cam, { x: [-80, 4], y: [3.6, 3.95], z: [34, 40], col: { side: '#dfe2e4', front: '#cfd3d6', bottom: '#9aa0a6' } });
    const pl = new Lines(d, d.G('#6f747a', 40, 0.5));
    for (let x = -60; x < 10; x += 10) {
      pl.add3(cam, [x, 0, 41], [x, 7.6, 41], 0.25);
      pl.add3(cam, [x - 1.2, 7.2, 41], [x + 1.2, 7.2, 41], 0.2);
    }
    for (const y of [6.5, 6.9]) pl.add3(cam, [-80, y, 41], [10, y, 41], 0.05);
    pl.flush();
  }
  // 역 뒤 맨션(오른쪽, 높이 솟음)
  const mansionFront = (o) => {
    const { x0, x1, z, h } = o;
    const nm = [0, 0, -1];
    const dist = cam.dist([(x0 + x1) / 2, 10, z]);
    box(d, cam, { x: [x0, x1], y: [0, h], z: [z, z + 14], col: o.col });
    const rail = new Lines(d, d.shade('#9aa0a6', nm, dist), { opacity: 0.7 });
    for (let y = 3.0; y < h - 1; y += 2.9) {
      const zr = z - 1.2;
      face(d, cam, [[x0 + 0.4, y + 0.2, z - 0.01], [x1 - 0.4, y + 0.2, z - 0.01], [x1 - 0.4, y + 2.6, z - 0.01], [x0 + 0.4, y + 2.6, z - 0.01]], d.shade('#86a2b8', nm, dist));
      face(d, cam, [[x0, y + 2.75, z], [x1, y + 2.75, z], [x1, y + 2.75, zr], [x0, y + 2.75, zr]], d.shade(scale(o.col, 0.72), [0, -1, 0], dist));
      face(d, cam, [[x0, y - 0.1, zr], [x1, y - 0.1, zr], [x1, y + 1.1, zr], [x0, y + 1.1, zr]], d.shade(o.rail, nm, dist));
      for (let x = x0 + 5; x < x1; x += 5) rail.add3(cam, [x, y - 0.1, zr], [x, y + 2.75, zr], 0.12);
    }
    rail.flush();
  };
  mansionFront({ x0: 14, x1: 40, z: 44, h: 30, col: '#d9cfc0', rail: '#cfdce4' });
  // 역 건물(오른쪽)
  house(d, cam, { x: [4, 17], z: [22, 29], h: 5.0, rh: 2.3, ridge: 'x', wall: '#f2ede2', roof: '#45566e', ov: 0.6, win: false });
  {
    const nF = [0, 0, -1];
    const dist = 22;
    const Z = 21.98;
    face(d, cam, [[8.4, 0, Z], [13.2, 0, Z], [13.2, 2.8, Z], [8.4, 2.8, Z]], d.shade('#3e4a5a', nF, dist));
    for (let k = 0; k < 5; k++) {
      const x = 8.8 + k * 0.9;
      face(d, cam, [[x, 0, Z - 0.01], [x + 0.2, 0, Z - 0.01], [x + 0.2, 1.0, Z - 0.01], [x, 1.0, Z - 0.01]], d.shade('#d6e6f2', nF, dist));
    }
    face(d, cam, [[8.4, 1.5, Z - 0.01], [13.2, 1.5, Z - 0.01], [13.2, 2.8, Z - 0.01], [8.4, 2.8, Z - 0.01]], '#bfe0f8', { opacity: 0.25 });
    for (const x0 of [4.8, 14.2]) face(d, cam, [[x0, 1.1, Z], [x0 + 2.2, 1.1, Z], [x0 + 2.2, 2.6, Z], [x0, 2.6, Z]], d.shade('#a9c6dc', nF, dist));
    box(d, cam, { x: [7.4, 14.2], y: [2.95, 3.2], z: [20.2, 22], col: '#e2ded6' });
    // 간판 띠(무늬만)
    face(d, cam, [[7.8, 3.35, Z], [13.8, 3.35, Z], [13.8, 4.05, Z], [7.8, 4.05, Z]], d.shade('#2f6db0', nF, dist));
    face(d, cam, [[8.2, 3.62, Z - 0.01], [13.4, 3.62, Z - 0.01], [13.4, 3.78, Z - 0.01], [8.2, 3.78, Z - 0.01]], d.shade('#f4f2ec', nF, dist));
    const C = [10.8, 5.85, Z - 0.02];
    const c = cam.P(C);
    const rr = cam.px(C) * 0.55;
    d.circle(c[0], c[1], rr * 1.15, d.shade('#4a5058', nF, dist));
    d.circle(c[0], c[1], rr, '#fbfaf6');
    d.line(c[0], c[1], c[0] - rr * 0.1, c[1] - rr * 0.7, '#333', 1.4);
    d.line(c[0], c[1], c[0] + rr * 0.5, c[1] - rr * 0.3, '#333', 1.8);
  }
  // 택시(역 앞 정차)
  {
    box(d, cam, { x: [4.6, 6.4], y: [0.25, 0.95], z: [18.4, 22.8], col: { side: '#f2f0ea', front: '#e8e4dc', top: '#f6f4f0' } });
    box(d, cam, { x: [4.8, 6.2], y: [0.95, 1.45], z: [19.4, 21.6], col: { side: '#5a6e86', front: '#4e6278', top: '#f2f0ea' } });
    box(d, cam, { x: [5.3, 5.7], y: [1.45, 1.6], z: [20.3, 20.7], col: '#f2c84a' });
    for (const z of [19.2, 22.0]) {
      const c = cam.P([4.58, 0.32, z]);
      const sp = cam.px([4.6, 0.3, z]);
      d.ellipse(c[0], c[1], sp * 0.12, sp * 0.32, '#2a2c30');
    }
  }
  // 왼쪽 맨션(발코니 줄)
  {
    const X = -12;
    const z0 = 4;
    const z1 = 32;
    const h = 31;
    const nm = [1, 0, 0];
    const col = '#ebe4d6';
    const dist = cam.dist([X, 10, 18]);
    const Q = (x, y0, y1, a, b) => [[x, y0, a], [x, y1, a], [x, y1, b], [x, y0, b]];
    box(d, cam, { x: [X - 25, X], y: [0, h], z: [z0, z1], col });
    const rail = new Lines(d, d.shade('#9aa0a6', nm, dist), { opacity: 0.7 });
    for (let y = 3.0; y < h - 1; y += 2.9) {
      const xr = X + 1.2;
      face(d, cam, Q(X + 0.01, y + 0.2, y + 2.6, z0 + 0.4, z1 - 0.4), d.shade('#86a2b8', nm, dist));
      face(d, cam, [[X, y + 2.75, z0], [xr, y + 2.75, z0], [xr, y + 2.75, z1], [X, y + 2.75, z1]], d.shade(scale(col, 0.7), [0, -1, 0], dist));
      face(d, cam, Q(xr, y - 0.1, y + 1.1, z0, z1), d.shade('#f6f6f2', nm, dist));
      face(d, cam, Q(xr, y - 0.1, y + 0.08, z0, z1), d.shade(scale(col, 0.95), nm, dist));
      for (let z = z0 + 5.6; z < z1; z += 5.6) rail.add3(cam, [xr, y - 0.1, z], [xr, y + 2.75, z], 0.12);
    }
    rail.flush();
    // 1층 상가(빵집: 차양)
    face(d, cam, Q(X + 0.02, 0, 2.6, 8, 15), d.shade('#4a3a30', nm, 8));
    face(d, cam, Q(X + 0.03, 0.9, 2.4, 8.3, 14.7), d.G('#ffe6b8', 8, 0.8), { opacity: 0.35 });
    const st = 14;
    for (let k = 0; k < st; k++) {
      const a = lerp(8, 15, k / st);
      const b = lerp(8, 15, (k + 1) / st);
      face(d, cam, [[X, 2.9, a], [X + 1.0, 2.5, a], [X + 1.0, 2.5, b], [X, 2.9, b]], d.shade(k % 2 ? '#f4f0e8' : '#3f8a5a', norm([0.4, -1, 0]), 8));
    }
  }
  // 광장 그림자(왼쪽 맨션)
  d.g({ opacity: 0.28, filter: d.blur(3) }, () => face(d, cam, [[-12, 0.006, 1], [-12, 0.006, 32], [-3, 0.006, 60], [3, 0.006, 1]], '#3a4a8a'));
  // 점자블록(노란 유도 블록) — 역 입구까지
  face(d, cam, [[-1.3, 0.004, 1], [-0.9, 0.004, 1], [-0.9, 0.004, 12], [-1.3, 0.004, 12]], d.G('#dcbc58', 6, 0.9));
  face(d, cam, [[-1.3, 0.004, 17.5], [-0.9, 0.004, 17.5], [-0.9, 0.004, 19.5], [-1.3, 0.004, 19.5]], d.G('#dcbc58', 18, 0.9));
  face(d, cam, [[-1.3, 0.004, 19.5], [10.8, 0.004, 19.5], [10.8, 0.004, 19.9], [-1.3, 0.004, 19.9]], d.G('#dcbc58', 18, 0.9));
  // 볼라드(도로 경계)
  for (let x = -11; x < 21; x += 2.2) {
    const b = cam.P([x, 0, 11.6]);
    const tp = cam.P([x, 0.8, 11.6]);
    const sp = cam.px([x, 0, 11.6]);
    d.rect(b[0] - sp * 0.07, tp[1], sp * 0.14, b[1] - tp[1], d.G('#9aa0a6', 11, 0.7));
    d.rect(b[0] - sp * 0.07, tp[1] + sp * 0.1, sp * 0.14, sp * 0.08, d.G('#f0c430', 11, 0.8));
  }
  // 화단·가로수
  for (const [X, Z] of [[-9.0, 22], [-9.0, 11], [2.6, 24.5], [12.5, 8.5]]) {
    const b = cam.P([X, 0, Z]);
    const tp = cam.P([X, 3.0, Z]);
    const s = cam.px([X, 0, Z]);
    box(d, cam, { x: [X - 0.8, X + 0.8], y: [0, 0.45], z: [Z - 0.8, Z + 0.8], col: '#b9b2a6' });
    d.rect(b[0] - s * 0.08, tp[1], s * 0.16, b[1] - tp[1] - s * 0.4, d.G('#6b5442', Z, 0.5));
    foliage(d, tp[0], tp[1] - s * 0.5, s * 1.7, s * 1.3, leaves(d, Z), { lx, count: 16 });
    for (let i = 0; i < 6; i++) {
      const c = cam.P([X + r.range(-0.6, 0.6), 0.5, Z - 0.75]);
      d.circle(c[0], c[1], Math.max(1.5, s * 0.08), d.G(r.pick(['#f26a7a', '#ffd34d', '#ffffff', '#b07ae0']), Z, 0.8));
    }
  }
  // 자전거 주차(왼쪽)
  {
    const bk = new Lines(d, d.G('#4a5058', 8, 0.5));
    for (let k = 0; k < 8; k++) {
      const Z = 3.2 + k * 0.65;
      const X = -10.5;
      const w1 = cam.P([X, 0.33, Z - 0.5]);
      const w2 = cam.P([X, 0.33, Z + 0.45]);
      const s = cam.px([X, 0.33, Z]);
      for (const w of [w1, w2]) d.ellipse(w[0], w[1], s * 0.1, s * 0.33, 'none', { stroke: '#3a3e44', 'stroke-width': Math.max(1, s * 0.035) });
      const seat = cam.P([X, 0.85, Z - 0.2]);
      const bar = cam.P([X, 0.95, Z + 0.35]);
      bk.add(w1[0], w1[1], seat[0], seat[1], s * 0.04);
      bk.add(seat[0], seat[1], bar[0], bar[1], s * 0.04);
      bk.add(bar[0], bar[1], w2[0], w2[1], s * 0.04);
      d.rect(bar[0] - s * 0.12, bar[1] - s * 0.05, s * 0.24, s * 0.14, d.G(r.pick(['#d8403a', '#3f86d6', '#f2f2ee', '#3a3e44']), Z, 0.7));
    }
    bk.flush();
  }
  // 버스 정류장(표지만, 글자 없음)
  {
    const X = -6.5;
    const Z = 9;
    const b = cam.P([X, 0, Z]);
    const tp = cam.P([X, 2.6, Z]);
    const s = cam.px([X, 0, Z]);
    d.line(b[0], b[1], tp[0], tp[1], d.G('#8a9096', Z, 0.6), s * 0.07);
    d.circle(tp[0], tp[1], s * 0.32, d.G('#f2f2ee', Z, 0.8));
    d.circle(tp[0], tp[1], s * 0.24, d.G('#2f6db0', Z, 0.8));
    d.rect(tp[0] - s * 0.18, tp[1] + s * 0.55, s * 0.36, s * 0.5, d.G('#f2f2ee', Z, 0.8));
  }
  // 가로등(오른쪽 앞)
  {
    const X = 9;
    const Z = 6.5;
    const b = cam.P([X, 0, Z]);
    const tp = cam.P([X, 4.8, Z]);
    const s = cam.px([X, 0, Z]);
    d.line(b[0], b[1], tp[0], tp[1], d.G('#6f747a', Z, 0.5), s * 0.11);
    const arm = cam.P([X - 0.9, 4.9, Z]);
    d.line(tp[0], tp[1], arm[0], arm[1], d.G('#6f747a', Z, 0.5), s * 0.07);
    d.ellipse(arm[0], arm[1], s * 0.3, s * 0.1, d.G('#dfe3e6', Z, 0.8));
  }
  d.rect(0, 0, W, H, d.lin([[0, '#ffffff', 0], [0.6, '#fff8e8', 0.08], [1, '#ffffff', 0.15]], 0, 0, W, 0));
  d.rect(0, 0, W, H, d.lin([[0, '#ffffff', 0], [0.6, '#ffffff', 0], [1, '#3a4a6a', 0.12]], 0, 0, 0, H));
  return d;
}

// ---------------------------------------------------------------------------
// 장면: 맨션 외부 복도의 현관문 앞(저녁)
// ---------------------------------------------------------------------------

function sceneApartment(id, t) {
  const d = new Doc(id, t, 8809);
  const r = d.r;
  const cam = camera({ hy: 430, f: 680, eye: 1.5, x0: -0.12, yaw: -0.1 });
  const XP = -0.85;
  const XW = 0.95;
  const HT = 2.55;
  const ZE = 30;
  const cl = t.cloud;

  // 바깥(난간 위로 보이는 노을과 마을)
  skyRect(d, t.sky, 0, 760);
  glow(d, 210, 420, 600, '#ffd59a', 0.85, 300);
  glow(d, 220, 430, 80, '#fff4d6', 1);
  cumulus(d, { x: 480, y: 300, w: 460, h: 130, c: cl, lx: -0.8, blur: 2 });
  streakCloud(d, 300, 190, 600, 34, cl.mid, 0.55, 5);
  ridge(d, 436, 36, 0.005, d.G('#6a5a8a', 600, 0.3), 81, 470);
  d.g({ filter: d.blur(1.2) }, () => {
    for (let i = 0; i < 60; i++) {
      const x = r.range(-40, 900);
      const y = r.range(440, 640);
      const w = r.range(30, 90);
      d.rect(x, y, w, 200, d.G(r.pick([MAT.cream, MAT.gray, MAT.beige, MAT.paleBlue]), 300, 0.4));
      d.poly([[x - 4, y], [x + w * 0.3, y - 12], [x + w * 0.7, y - 12], [x + w + 4, y]], d.G(r.pick([MAT.roofNavy, MAT.roofGray, MAT.roofBrown]), 300, 0.3));
      if (r.chance(0.35)) d.rect(x + w * 0.3, y + 14, 6, 5, '#ffd98a');
    }
  });

  // 천장 슬래브, 바닥
  face(d, cam, [[XP - 0.2, HT, 0], [XW, HT, 0], [XW, HT, ZE], [XP - 0.2, HT, ZE]], d.lin([[0, d.G('#a89c98', 0, 0.2)], [1, d.G('#d8ccc0', 0, 0.3)]], 0, 0, 0, 430));
  face(d, cam, [[XP, 0, 0], [XW, 0, 0], [XW, 0, ZE], [XP, 0, ZE]], d.lin([[0, d.G('#b8aea6', 0, 0.4)], [1, d.G('#8a8088', 0, 0.3)]], 0, 430, 0, 900));
  face(d, cam, [[XP, 0.002, 0], [XP + 0.18, 0.002, 0], [XP + 0.18, 0.002, ZE], [XP, 0.002, ZE]], d.G('#7a7076', 0, 0.3));
  // 끝 벽(비상계단 문)
  face(d, cam, [[XP, 0, ZE], [XW, 0, ZE], [XW, HT, ZE], [XP, HT, ZE]], d.shade('#e2d6c4', [0, 0, -1], ZE));
  face(d, cam, [[-0.3, 0, ZE - 0.01], [0.5, 0, ZE - 0.01], [0.5, 2.0, ZE - 0.01], [-0.3, 2.0, ZE - 0.01]], d.shade('#8a9aa8', [0, 0, -1], ZE));

  // 현관문 벽
  const nm = [-1, 0, 0];
  face(d, cam, [[XW, 0, 0], [XW, HT, 0], [XW, HT, ZE], [XW, 0, ZE]], d.lin([[0, d.shade('#e8dccb', nm, 4)], [1, d.shade('#d8cab6', nm, 20)]], 0, 0, W, 0));
  // 노을빛 띠(난간·기둥 그림자 사이)
  {
    const s = norm([-1, 0.28, 0.3]);
    const dx = XW - XP;
    const yLo = 1.15 - (s[1] / -s[0]) * dx;
    const yHi = HT - 0.3 - (s[1] / -s[0]) * dx;
    const zs = (s[2] / -s[0]) * dx;
    const cols = [5, 11, 17, 23, 29];
    d.g({ opacity: 0.55, filter: d.blur(2) }, () => {
      let z = 0;
      for (const c of [...cols, ZE + 3]) {
        const a = z;
        const b = Math.min(ZE, c - 0.35 + zs);
        if (b > a) face(d, cam, [[XW - 0.01, yLo, a], [XW - 0.01, yHi, a], [XW - 0.01, yHi, b], [XW - 0.01, yLo, b]], '#ffb877');
        z = c + 0.35 + zs;
      }
    });
  }
  const doors = [1.3, 7.3, 13.3, 19.3, 25.3];
  const doorC = ['#5e4a42', '#4e5e6a', '#5e4a42', '#4e5e6a', '#5e4a42'];
  for (let i = doors.length - 1; i >= 0; i--) {
    const z0 = doors[i];
    const z1 = z0 + 0.92;
    const dist = cam.dist([XW, 1, z0]);
    const Q = (x, y0, y1, a, b) => [[x, y0, a], [x, y1, a], [x, y1, b], [x, y0, b]];
    face(d, cam, Q(XW - 0.01, 0, 2.15, z0 - 0.08, z1 + 0.08), d.shade('#8a8480', nm, dist));
    face(d, cam, Q(XW - 0.02, 0.02, 2.08, z0, z1), d.shade(doorC[i], nm, dist));
    if (i < 2) {
      face(d, cam, Q(XW - 0.025, 0.95, 1.0, z0 + 0.08, z1 - 0.08), d.shade(scale(doorC[i], 0.8), nm, dist));
      face(d, cam, Q(XW - 0.025, 1.7, 1.73, z0 + 0.08, z1 - 0.08), d.shade(scale(doorC[i], 0.8), nm, dist));
      face(d, cam, Q(XW - 0.03, 0.55, 0.62, z0 + 0.3, z1 - 0.3), d.shade('#b9b4ae', nm, dist));
    }
    const h = cam.P([XW - 0.06, 1.0, z1 - 0.12]);
    const h2 = cam.P([XW - 0.06, 1.0, z1 - 0.3]);
    d.line(h[0], h[1], h2[0], h2[1], d.shade('#d8d4cc', nm, dist), Math.max(1, cam.px([XW, 1, z1]) * 0.03));
    const ph = cam.P([XW - 0.03, 1.5, (z0 + z1) / 2]);
    d.circle(ph[0], ph[1], Math.max(0.8, cam.px([XW, 1.5, z0]) * 0.012), '#222');
    // 문패(빈 판)·인터폰
    face(d, cam, Q(XW - 0.02, 1.45, 1.6, z1 + 0.18, z1 + 0.45), d.shade('#f2efe6', nm, dist));
    face(d, cam, Q(XW - 0.02, 1.2, 1.36, z1 + 0.22, z1 + 0.34), d.shade('#cfcac2', nm, dist));
    // 부엌 창(방범 격자)
    face(d, cam, Q(XW - 0.01, 1.1, 1.85, z1 + 0.7, z1 + 1.8), d.shade('#b8c6d0', nm, dist));
    const gr = new Lines(d, d.shade('#7a7470', nm, dist));
    for (let k = 0; k <= 6; k++) gr.add3(cam, [XW - 0.04, 1.1, z1 + 0.7 + k * 0.183], [XW - 0.04, 1.85, z1 + 0.7 + k * 0.183], 0.018);
    gr.flush();
    // 계량기 함
    face(d, cam, Q(XW - 0.01, 0.25, 2.0, z1 + 2.2, z1 + 2.9), d.shade('#c9c4bc', nm, dist));
    seg3(d, cam, [XW - 0.02, 0.25, z1 + 2.55], [XW - 0.02, 2.0, z1 + 2.55], d.shade('#9a948c', nm, dist), 0.01);
  }
  // 천장 조명
  for (let z = 3.6; z < ZE; z += 6) {
    box(d, cam, { x: [0.0, 0.36], y: [HT - 0.08, HT], z: [z - 0.18, z + 0.18], col: '#f2efe6', emit: { bottom: '#fff4dc' } });
    const c = cam.P([0.18, HT - 0.1, z]);
    const s = cam.px([0.18, HT, z]);
    glow(d, c[0], c[1] + s * 0.1, s * 1.4, '#ffe8c0', 0.55, s * 0.7);
    groundGlow(d, cam, 0.2, z, 1.2, '#ffe6c0', 0.25);
  }
  // 난간벽 + 기둥 + 처마보
  const nP = [1, 0, 0];
  box(d, cam, { x: [XP - 0.15, XP], y: [0, 1.15], z: [0, ZE], col: { right: '#e6dccc', top: '#cfc6b8' } });
  seg3(d, cam, [XP + 0.06, 1.2, 0.3], [XP + 0.06, 1.2, ZE], d.G('#8a8078', 6, 0.4), 0.04);
  box(d, cam, { x: [XP - 0.25, XP + 0.05], y: [HT - 0.4, HT], z: [0, ZE], col: { right: '#d8ccbc', bottom: '#9a8e88' } });
  for (const c of [29, 23, 17, 11, 5]) box(d, cam, { x: [XP - 0.3, XP + 0.18], y: [0, HT], z: [c - 0.35, c + 0.35], col: { right: '#e2d6c4', front: '#cfc2b0', back: '#cfc2b0' } });
  d.rect(0, 0, W, H, d.lin([[0, '#ffc080', 0.14], [0.5, '#ff9a70', 0.04], [1, '#3a2848', 0.24]], 0, 0, 0, H));
  return d;
}

// ---------------------------------------------------------------------------
// 장면: 언덕 위 신사 돌계단(노을)
// ---------------------------------------------------------------------------

function sceneShrineSteps(id, t) {
  const d = new Doc(id, t, 9910);
  const r = d.r;
  const cam = camera({ hy: 640, f: 760, eye: 1.5, x0: -1.4 });
  const N = 30;
  const RISE = 0.21;
  const RUN = 0.42;
  const HW = 1.3;
  const T = yawT([0.2, 0, 3.0], 0.42);
  const topY = N * RISE;
  const topZ = N * RUN;
  const cl = t.cloud;
  const lx = 0.6;
  const stone = '#b8b0a0';

  skyRect(d, t.sky, 0, 760);
  const tc = cam.P(T([0, topY + 3, topZ + 2]));
  glow(d, tc[0] + 80, tc[1] + 30, 560, '#ffd9a0', 0.8, 320);
  cumulus(d, { x: tc[0] + 120, y: tc[1] - 30, w: 420, h: 140, c: cl, lx: 0, blur: 2.2 });
  streakCloud(d, tc[0] - 60, tc[1] - 170, 500, 30, cl.mid, 0.55, 5);
  // 신사 뒤 숲(실루엣)
  {
    const c = cam.P(T([0, topY, topZ + 14]));
    const s = cam.px(T([0, topY, topZ + 14]));
    foliage(d, c[0] - s * 7, c[1] - s * 4, s * 7, s * 4.5, { dark: '#3a2f48', mid: '#4a3a52', light: '#6a4a5a' }, { count: 30, blur: 1.5, lx });
    foliage(d, c[0] + s * 9, c[1] - s * 3, s * 6, s * 3.6, { dark: '#3a2f48', mid: '#4a3a52', light: '#6a4a5a' }, { count: 24, blur: 1.5, lx });
  }
  // 신사 지붕(도리이 너머)
  {
    const T2 = (p) => T([p[0], p[1], p[2] + topZ + 7]);
    T2.R = T.R;
    box(d, cam, { x: [-2.6, 2.6], y: [topY, topY + 2.6], z: [0, 3], T: T2, col: '#8a6a4e' });
    const roof = [[-3.6, topY + 2.4, -0.8], [3.6, topY + 2.4, -0.8], [2.4, topY + 4.0, 1.4], [-2.4, topY + 4.0, 1.4]].map(T2);
    const rp = cam.poly(roof);
    if (rp) d.poly(rp, d.G('#4a4248', 15, 0.6));
  }
  // 계단 양옆 언덕 경사면(덤불 바탕)
  {
    const slope = (x0, x1) => [[x0, 0, -2], [x1, 0, -2], [x1, topY, topZ + 2], [x0, topY, topZ + 2]].map(T);
    const g1 = d.G('#3e5a3a', 10, 0.3);
    const g2 = d.G('#2e4430', 4, 0.2);
    face(d, cam, slope(-24, -HW - 0.3), d.lin([[0, g1], [1, g2]], 0, 400, 0, 900));
    face(d, cam, slope(HW + 0.3, 24), d.lin([[0, g1], [1, g2]], 0, 400, 0, 900));
    face(d, cam, [[-30, 0, -1], [30, 0, -1], [30, 0, 3.2], [-30, 0, 3.2]], d.G('#6a5e4e', 3, 0.4));
  }
  // 꼭대기 참배길
  face(d, cam, [[-HW - 0.6, topY, topZ], [HW + 0.6, topY, topZ], [HW + 0.6, topY, topZ + 7], [-HW - 0.6, topY, topZ + 7]].map(T), d.G('#c9bfa8', 16, 0.8));
  // 도리이
  {
    const T3 = (p) => T([p[0], p[1], p[2] + topZ + 1.2]);
    T3.R = T.R;
    torii(d, cam, T3, { y0: topY, h: 4.4, w: 1.6 });
  }
  // 계단 + 양옆 수풀(거리순)
  const items = [];
  for (let i = 0; i < N; i++) items.push({ k: 'step', i, dist: cam.dist(T([0, i * RISE, i * RUN])) });
  for (let i = 0; i < 18; i++) {
    const side = i % 2 ? 1 : -1;
    const z = r.range(0, topZ + 1);
    const x = side * (HW + r.range(1.0, 3.4));
    items.push({ k: 'bush', p: T([x, (z / RUN) * RISE + 0.6, z]), sz: r.range(1.1, 1.9), dist: cam.dist(T([x, 0, z])) + 0.5 });
  }
  items.sort((a, b) => b.dist - a.dist);
  const mossC = '#7a8a4a';
  for (const it of items) {
    if (it.k === 'step') {
      const i = it.i;
      box(d, cam, { x: [-HW, HW], y: [0, (i + 1) * RISE], z: [i * RUN, (i + 1) * RUN], T, col: { top: '#d2c8b4', front: stone, side: scale(stone, 0.9) } });
      for (const s of [-1, 1]) box(d, cam, { x: s < 0 ? [-HW - 0.3, -HW] : [HW, HW + 0.3], y: [0, (i + 1) * RISE + 0.25], z: [i * RUN, (i + 1) * RUN], T, col: { top: '#c2b8a2', side: scale(stone, 0.85), front: scale(stone, 0.92) } });
      if (r.chance(0.35)) {
        const x = r.range(-HW, HW - 0.5);
        face(d, cam, [[x, (i + 1) * RISE + 0.002, i * RUN + 0.05], [x + 0.5, (i + 1) * RISE + 0.002, i * RUN + 0.05], [x + 0.5, (i + 1) * RISE + 0.002, (i + 1) * RUN - 0.05], [x, (i + 1) * RISE + 0.002, (i + 1) * RUN - 0.05]].map(T), d.G(mossC, it.dist, 0.6), { opacity: 0.5 });
      }
    } else {
      const c = cam.P(it.p);
      const s = cam.px(it.p);
      foliage(d, c[0], c[1], s * it.sz * 1.4, s * it.sz, leaves(d, it.dist, 0.4), { lx, count: 16, size: 0.85 });
    }
  }
  // 고양이 자리(햇볕 드는 평평한 돌)
  {
    const T4 = (p) => T([p[0] - HW - 1.1, p[1] + 9 * RISE + 0.25, p[2] + 9 * RUN]);
    T4.R = T.R;
    box(d, cam, { x: [-0.55, 0.55], y: [0, 0.22], z: [-0.4, 0.4], T: T4, col: { top: '#d8ccb4', side: '#a59c8a' } });
    const c = cam.P(T4([0, 0.23, 0]));
    glow(d, c[0], c[1], cam.px(T4([0, 0, 0])) * 0.8, '#ffd9a0', 0.55, cam.px(T4([0, 0, 0])) * 0.3);
  }
  // 석등(아래 양쪽)
  for (const s of [-1, 1]) {
    const L = yawT(T([s * (HW + 1.0), 0, 0.9]), 0.42);
    stoneLantern(d, cam, L, { col: '#aaa494' });
  }
  // 큰 나무(좌상단·우상단 프레이밍)
  const fl = leaves(d, 0, 0.2);
  d.rect(40, 0, 46, 900, d.G('#3a2e28', 0, 0.2));
  d.rect(1530, 0, 40, 900, d.G('#3a2e28', 0, 0.2));
  foliage(d, 170, 50, 420, 210, fl, { lx, ly: 0.2, count: 64, blur: 0.8 });
  foliage(d, 1460, 40, 340, 170, fl, { lx: -0.2, ly: 0.3, count: 50, blur: 0.8 });
  foliage(d, 30, 430, 150, 210, fl, { lx, count: 30, blur: 2 });
  // 빛줄기(오른쪽 위에서)
  d.g({ opacity: 0.18, filter: d.blur(10) }, () => {
    d.poly([[1350, 120], [1500, 120], [700, 900], [420, 900]], '#ffe2a8');
    d.poly([[1200, 200], [1280, 200], [880, 900], [760, 900]], '#ffe2a8');
  });
  d.rect(0, 0, W, H, d.lin([[0, '#3a2440', 0.18], [0.5, '#ffb070', 0.05], [1, '#2a1a30', 0.3]], 0, 0, 0, H));
  return d;
}

// ---------------------------------------------------------------------------
// 장면: 불꽃놀이가 보이는 신사 언덕(밤)
// ---------------------------------------------------------------------------

function sceneShrineNight(id, t) {
  const d = new Doc(id, t, 9911);
  const r = d.r;
  const cam = camera({ hy: 600, f: 760, eye: 1.5, x0: 0 });
  const hy = 600;
  skyRect(d, t.sky, 0, hy + 40);
  stars(d, 170, hy - 60, '#ffffff', 21);
  glow(d, 800, hy, 1000, '#9a6aa0', 0.5, 180);
  streakCloud(d, 1100, 200, 600, 30, t.cloud.lit, 0.35, 6);
  // 먼 산
  ridge(d, hy - 4, 40, 0.003, '#2a2c5c', 99, hy + 20);
  // 아래 마을 불빛 + 강 + 축제 불빛 줄
  d.rect(0, hy - 6, W, 140, d.lin([[0, '#2c2c5c'], [1, '#1e2048']], 0, hy, 0, hy + 120));
  const town = new Lines(d, '#ffd98a', { opacity: 0.85 });
  const town2 = new Lines(d, '#cfe0ff', { opacity: 0.7 });
  for (let i = 0; i < 220; i++) {
    const y = hy + Math.pow(r(), 1.3) * 100;
    const x = r.range(0, W);
    (r.chance(0.65) ? town : town2).add(x, y, x + r.range(1, 3), y, 1.6);
  }
  town.flush();
  town2.flush();
  d.path(`M-20 ${hy + 52}C300 ${hy + 30} 600 ${hy + 70} 900 ${hy + 44}S1400 ${hy + 30} 1620 ${hy + 50}`, { stroke: '#3e4a86', 'stroke-width': 10, fill: 'none', opacity: 0.8 });
  for (let i = 0; i < 60; i++) {
    const x = r.range(380, 1250);
    const y = hy + 40 + Math.sin(x / 120) * 8 + r.range(-3, 3);
    glow(d, x, y, r.range(5, 10), r.pick(['#ffc46a', '#ff9a7a', '#ffd98a']), 0.9);
  }
  // 언덕 땅
  d.path(`M-20 900L-20 ${hy + 70}C300 ${hy + 60} 600 ${hy + 92} 900 ${hy + 86}S1400 ${hy + 70} 1620 ${hy + 64}L1620 900Z`, { fill: d.lin([[0, '#2a3a58'], [1, '#18203a']], 0, hy + 60, 0, 900) });
  // 나무 울타리
  {
    const fc = '#5a4648';
    const fn = new Lines(d, fc);
    for (let x = 60; x < 1560; x += 90) {
      const y = hy + 80 + Math.sin(x / 300) * 6;
      fn.add(x, y + 50, x, y - 18, 7);
    }
    fn.add(40, hy + 66, 1580, hy + 60, 6);
    fn.add(40, hy + 96, 1580, hy + 92, 5);
    fn.flush();
  }
  // 왼쪽: 삼나무와 도리이
  d.g({}, () => {
    for (const [x, w] of [[20, 70], [170, 50], [300, 40]]) {
      d.rect(x, 0, w, hy + 120, '#1a1a34');
      d.rect(x + w * 0.65, 0, w * 0.35, hy + 120, '#2a2848');
    }
  });
  foliage(d, 160, 40, 360, 200, { dark: '#12142c', mid: '#1c2040', light: '#2e3460' }, { count: 50, lx: 0.6 });
  {
    const T = yawT([-8.0, 0, 12.5], 0.4);
    torii(d, cam, T, { w: 1.6, h: 4.4, red: '#c8483a', lit: '#d8604e' });
    const c = cam.P([-8.2, 2.4, 12.5]);
    glow(d, c[0], c[1], 220, '#ffb070', 0.3);
    stoneLantern(d, cam, yawT([-5.6, 0, 9.0], 0.5), { lit: true, col: '#8a8aa0' });
  }
  // 오른쪽: 석등(불 켜짐)과 큰 나무 가지
  stoneLantern(d, cam, yawT([2.75, 0, 3.7], -0.35), { lit: true, col: '#9090a8' });
  {
    const c = cam.P([2.75, 0, 3.7]);
    glow(d, c[0], c[1] - 10, 260, '#ffb870', 0.28, 90);
  }
  foliage(d, 1440, 30, 340, 190, { dark: '#12142c', mid: '#1c2040', light: '#343a6a' }, { count: 44, lx: -0.6 });
  d.rect(1520, 0, 40, 700, '#1a1a34');
  // 반딧불
  for (let i = 0; i < 9; i++) {
    const x = r.chance(0.5) ? r.range(100, 420) : r.range(1180, 1520);
    const y = r.range(hy - 60, hy + 140);
    glow(d, x, y, 9, '#d8ff8a', 0.85);
  }
  d.rect(0, 0, W, H, d.lin([[0, '#000010', 0.1], [0.6, '#000010', 0], [1, '#000010', 0.25]], 0, 0, 0, H));
  return d;
}

// ---------------------------------------------------------------------------
// 장면: 여름 축제 노점 거리(밤, 제등)
// ---------------------------------------------------------------------------

function sceneFestival(id, t) {
  const d = new Doc(id, t, 1212);
  const r = d.r;
  const cam = camera({ hy: 430, f: 720, eye: 1.5, x0: 0 });
  skyRect(d, t.sky, 0, 500);
  stars(d, 50, 280, '#ffffff', 31);
  glow(d, 800, 440, 760, '#ff9a6a', 0.45, 200);
  // 신사 숲 실루엣
  ridge(d, 395, 70, 0.006, '#1a1c3a', 71, 470);
  // 바닥(참배길)
  face(d, cam, [[-3.6, 0, 0.5], [3.6, 0, 0.5], [3.6, 0, 90], [-3.6, 0, 90]], d.lin([[0, '#c88a5a'], [0.3, '#8a5a50'], [1, '#3a2a44']], 0, 430, 0, 900));
  face(d, cam, [[-1.0, 0.002, 0.5], [1.0, 0.002, 0.5], [1.0, 0.002, 90], [-1.0, 0.002, 90]], '#e0a070', { opacity: 0.25 });
  // 도리이(멀리, 제등빛)
  torii(d, cam, yawT([0, 0, 64], 0), { w: 2.3, h: 5.6, red: '#c8483a', lit: '#e0604a' });
  {
    const c = cam.P([0, 3, 64]);
    glow(d, c[0], c[1], 180, '#ffb070', 0.35);
  }
  // 노점(먼 곳부터)
  const stalls = [];
  for (const side of [-1, 1]) for (let z = 2.2; z < 56; z += 3.5) stalls.push({ side, z0: z, z1: z + 3.2, val: r.pick([['#d8403a', '#f4f0e8'], ['#2f5fb0', '#f4f0e8'], ['#e8b030', '#d8403a'], ['#e870a0', '#f4f0e8'], ['#3a8a5a', '#f4e8c0']]) });
  stalls.sort((a, b) => b.z0 - a.z0);
  const goods = ['#f2d04a', '#e2524a', '#4ab0e0', '#f4f0e8', '#8ad060', '#f08ab0', '#ff9a40'];
  for (const st of stalls) {
    const s = st.side;
    const X = s * 3.6;
    const nm = [-s, 0, 0];
    const dist = cam.dist([X, 1.5, (st.z0 + st.z1) / 2]);
    const near = dist < 26;
    const Q = (x, y0, y1, a, b) => [[x, y0, a], [x, y1, a], [x, y1, b], [x, y0, b]];
    // 안쪽(따뜻한 빛)
    face(d, cam, Q(s * 6, 0, 2.4, st.z0, st.z1), mix('#ffcf8a', '#a86a50', Math.min(1, dist / 60)));
    face(d, cam, [[X, 2.45, st.z1], [s * 6.2, 2.75, st.z1], [s * 6.2, 0, st.z1], [X, 0, st.z1]], mix('#6a3a4a', '#2a2040', Math.min(1, dist / 50)));
    // 지붕 아랫면
    face(d, cam, [[X - s * 0.2, 2.45, st.z0], [s * 6.2, 2.8, st.z0], [s * 6.2, 2.8, st.z1], [X - s * 0.2, 2.45, st.z1]], mix('#e0a070', '#5a3a50', Math.min(1, dist / 40)));
    // 가판대
    face(d, cam, Q(X, 0, 0.95, st.z0 + 0.1, st.z1 - 0.1), mix(st.val[0], '#2a1a30', Math.min(0.8, dist / 60)));
    if (near) {
      for (let k = 0; k < 7; k++) {
        const z = lerp(st.z0 + 0.4, st.z1 - 0.4, k / 6);
        const c = cam.P([X + s * 0.3, 1.05, z]);
        const ps = cam.px([X, 1.05, z]);
        d.ellipse(c[0], c[1], ps * 0.14, ps * 0.1, r.pick(goods));
      }
      // 걸린 상품(가면/풍선 등 — 동그라미 무늬)
      for (let k = 0; k < 4; k++) {
        const z = lerp(st.z0 + 0.6, st.z1 - 0.6, k / 3);
        const c = cam.P([s * 4.8, 1.9, z]);
        d.circle(c[0], c[1], cam.px([s * 4.8, 1.9, z]) * 0.16, r.pick(goods));
      }
    }
    // 앞 휘장(무늬: 줄)
    const parts = near ? 8 : 2;
    for (let k = 0; k < parts; k++) {
      const a = lerp(st.z0, st.z1, k / parts);
      const b = lerp(st.z0, st.z1, (k + 1) / parts);
      face(d, cam, Q(X - s * 0.2, 2.05, 2.5, a, b), mix(st.val[k % 2], '#2a1a30', Math.min(0.7, dist / 70)));
    }
    // 전구
    const bulb = cam.P([X - s * 0.1, 2.0, (st.z0 + st.z1) / 2]);
    glow(d, bulb[0], bulb[1], cam.px([X, 2, st.z0]) * 1.6, '#ffd98a', 0.7);
    d.circle(bulb[0], bulb[1], Math.max(1.2, cam.px([X, 2, st.z0]) * 0.07), '#fff8e0');
  }
  // 군중(흐리게)
  const crowd = [];
  for (let i = 0; i < 30; i++) {
    const side = r.chance(0.5) ? -1 : 1;
    const z = r.range(6, 50);
    const x = i < 8 ? r.range(-1.6, 1.6) : side * r.range(2.0, 3.0);
    if (i < 8 && z < 22) continue;
    crowd.push([x, z]);
  }
  crowd.sort((a, b) => b[1] - a[1]);
  d.g({ filter: d.blur(1.6) }, () => {
    for (const [x, z] of crowd) {
      const c = cam.P([x, 0, z]);
      const s = cam.px([x, 0, z]);
      person(d, c[0], c[1], s * r.range(1.45, 1.75), mix('#2a1e3a', '#4a3050', r()), r);
    }
  });
  // 제등 줄
  const wireC = '#1a1220';
  for (const side of [-1, 1]) {
    const X = side * 3.35;
    const posts = [];
    for (let z = 1.6; z < 60; z += 8) posts.push(z);
    for (const pz of posts) {
      const b = cam.P([X, 0, pz]);
      const tp = cam.P([X, 3.8, pz]);
      d.line(b[0], b[1], tp[0], tp[1], '#2a1a24', Math.max(1, cam.px([X, 0, pz]) * 0.08));
    }
    for (let i = 0; i < posts.length - 1; i++) wire(d, cam.P([X, 3.6, posts[i]]), cam.P([X, 3.6, posts[i + 1]]), cam.px([X, 3.6, posts[i]]) * 0.15, wireC, 1.2);
    const lan = [];
    for (let z = 2.4; z < 58; z += 1.6) lan.push(z);
    for (const z of lan.reverse()) {
      const c = cam.P([X, 3.25, z]);
      const s = cam.px([X, 3.25, z]) * 0.55;
      chochin(d, c[0], c[1], s, { color: (Math.round(z / 1.6) % 3 === 0) ? '#f4efe4' : '#e4473a', glow: 0.55 });
    }
  }
  // 앞쪽 가로지르는 제등 줄(가운데는 비움)
  for (const z of [9, 4.5]) {
    const a = cam.P([-3.35, 3.6, z]);
    const b = cam.P([3.35, 3.6, z]);
    wire(d, a, b, cam.px([0, 3.6, z]) * 0.25, wireC, 1.4);
    for (const x of [-2.6, -1.9, 1.9, 2.6]) {
      const c = cam.P([x, 3.2 - (1 - (x / 3.35) ** 2) * 0.12, z]);
      chochin(d, c[0], c[1], cam.px([x, 3.2, z]) * 0.55, { color: '#e4473a', glow: 0.5 });
    }
  }
  d.rect(0, 0, W, H, d.lin([[0, '#0a0820', 0.15], [0.55, '#ff8a50', 0.05], [1, '#1a0e28', 0.3]], 0, 0, 0, H));
  return d;
}

// ---------------------------------------------------------------------------
// 장면: 타이틀 — 초여름 하늘과 학교가 보이는 언덕(제목 글자는 HTML 이 얹음)
// ---------------------------------------------------------------------------

function sceneTitle(id, t) {
  const d = new Doc(id, t, 1001);
  const r = d.r;
  const cl = t.cloud;
  skyRect(d, [[0, '#1c64c8'], [0.4, '#3f8ee0'], [0.75, '#94c8f2'], [1, '#e4f4fc']], 0, 640);
  d.rect(0, 600, W, 300, '#cfe4f2');
  glow(d, 110, 70, 700, '#ffffff', 0.6);
  glow(d, 110, 70, 90, '#ffffff', 0.95);
  // 렌즈 플레어
  for (const [x, y, rr, op] of [[420, 260, 26, 0.18], [560, 360, 12, 0.22], [760, 480, 40, 0.1]]) d.circle(x, y, rr, '#ffffff', { opacity: op });
  // 적란운(뭉게구름 탑)
  cumulus(d, { x: 1120, y: 540, w: 820, h: 300, c: cl, lx: -0.7, blur: 2 });
  cumulus(d, { x: 1150, y: 330, w: 460, h: 260, c: cl, lx: -0.7, blur: 2, pow: 1.2 });
  cumulus(d, { x: 1170, y: 140, w: 300, h: 130, c: cl, lx: -0.7, blur: 2, pow: 1.2 });
  cumulus(d, { x: 230, y: 430, w: 380, h: 110, c: cl, lx: -0.7, blur: 2.4 });
  streakCloud(d, 560, 160, 520, 26, '#ffffff', 0.5, 5);
  // 먼 산과 마을
  ridge(d, 560, 44, 0.004, '#8fb2d2', 13, 760);
  ridge(d, 600, 18, 0.006, '#a7c4b0', 17, 760);
  // 언덕
  d.path('M-20 900L-20 700C300 650 700 560 1000 525S1400 500 1620 505L1620 900Z', { fill: d.lin([[0, '#9fd068'], [0.35, '#6eaa48'], [1, '#3f7a34']], 0, 500, 0, 900) });
  // 바람에 눕는 풀 결
  const gs = new Lines(d, '#c4e88a', { opacity: 0.55 });
  for (let i = 0; i < 90; i++) {
    const x = r.range(0, W);
    const yTop = 700 - (x / W) * 200;
    const y = r.range(yTop + 10, 900);
    const len = 10 + (y - yTop) * 0.12;
    gs.add(x, y, x + len, y - len * 0.25, 1 + (y - yTop) * 0.006);
  }
  gs.flush();
  // 학교(언덕 위 오른쪽)
  {
    const by = 520;
    d.g({ filter: d.blur(0.6) }, () => {
      d.rect(880, by - 58, 160, 66, '#e9e6e0');
      d.path(`M876 ${by - 58}Q960 ${by - 96} 1044 ${by - 58}Z`, { fill: '#5f7a8a' });
      d.rect(1040, by - 128, 500, 136, '#f4f2ec');
      d.rect(1040, by - 132, 500, 8, '#c9c6c0');
      for (let f = 0; f < 3; f++) {
        d.rect(1052, by - 116 + f * 40, 476, 18, '#8fb4d0');
        for (let x = 1052; x < 1530; x += 22) d.rect(x, by - 116 + f * 40, 3, 18, '#e6e3dc');
      }
      d.rect(1262, by - 186, 76, 64, '#f4f2ec');
      d.poly([[1254, by - 186], [1300, by - 214], [1346, by - 186]], '#5f7a8a');
      d.circle(1300, by - 160, 19, '#6a7078');
      d.circle(1300, by - 160, 16, '#fbfaf6');
      d.line(1300, by - 160, 1301, by - 172, '#333', 1.6);
      d.line(1300, by - 160, 1310, by - 157, '#333', 2);
      // 그늘면
      d.rect(1500, by - 128, 40, 136, '#d9dde4', { opacity: 0.8 });
    });
    const fn = new Lines(d, '#7a8a90');
    fn.add(860, by + 8, 1560, by - 2, 2);
    for (let x = 860; x < 1560; x += 14) fn.add(x, by + 8 - (x - 860) * 0.014, x, by - 8 - (x - 860) * 0.014, 1.2);
    fn.flush();
    foliage(d, 840, by - 20, 70, 40, leaves(d, 60), { count: 10, lx: -0.6 });
    foliage(d, 1580, by - 40, 60, 60, leaves(d, 60), { count: 10, lx: -0.6 });
    foliage(d, 1000, by + 6, 120, 22, leaves(d, 60), { count: 10, lx: -0.6 });
  }
  // 언덕길과 전봇대
  d.path('M560 910C640 800 820 700 1000 600S1140 540 1180 522', { stroke: '#e6dcc2', 'stroke-width': 26, fill: 'none', opacity: 0.85 });
  {
    const tops = [];
    for (const [x, y, h] of [[1095, 548, 70], [930, 616, 120], [690, 740, 230]]) {
      d.rect(x - h * 0.025, y - h, h * 0.05, h, '#5a5a5e');
      d.rect(x - h * 0.12, y - h * 0.93, h * 0.24, h * 0.02, '#4a4a4e');
      tops.push([x, y - h * 0.92]);
    }
    for (let i = 0; i < tops.length - 1; i++) {
      for (const dy of [0, 6]) wire(d, [tops[i][0], tops[i][1] + dy], [tops[i + 1][0], tops[i + 1][1] + dy * 2], 8, '#3a3a44', 1.2);
    }
    for (const dy of [0, 10]) wire(d, [tops[2][0], tops[2][1] + dy], [-20, 560 + dy], 30, '#3a3a44', 1.6);
  }
  // 왼쪽 큰 나무(언덕 위)
  {
    d.poly([[250, 720], [300, 720], [292, 430], [262, 430]], '#5a4434');
    const br = new Lines(d, '#5a4434');
    br.add(275, 470, 180, 360, 14);
    br.add(280, 450, 380, 340, 12);
    br.flush();
    const lv = { dark: '#2e5a36', mid: '#4f8a44', light: '#9acd62' };
    foliage(d, 270, 300, 300, 190, lv, { count: 70, lx: -0.6 });
  }
  // 전경 잎/풀(초점 밖)
  foliage(d, 30, 30, 200, 120, { dark: '#2a4a2e', mid: '#3f7040', light: '#7ab052' }, { blur: 7, count: 24 });
  d.g({ filter: d.blur(3) }, () => {
    for (let i = 0; i < 18; i++) {
      const x = r.range(-20, 1620);
      const h = r.range(60, 140);
      d.path(`M${n(x)} 910q${n(r.range(-10, 30))} ${n(-h * 0.6)} ${n(r.range(10, 50))} ${n(-h)}`, { stroke: r.pick(['#3f7a34', '#5a9a40']), 'stroke-width': r.range(4, 8), fill: 'none' });
    }
  });
  // 새
  const bd = new Lines(d, '#3a4a6a');
  for (const [x, y, s] of [[760, 230, 9], [800, 250, 7], [735, 262, 6]]) {
    bd.add(x - s, y - s * 0.4, x, y, 1.6);
    bd.add(x, y, x + s, y - s * 0.4, 1.6);
  }
  bd.flush();
  d.rect(0, 0, W, H, d.lin([[0, '#ffffff', 0.1], [0.5, '#ffffff', 0], [1, '#1a3a2a', 0.12]], 0, 0, 0, H));
  return d;
}

// ---------------------------------------------------------------------------
// 등록 및 출력
// ---------------------------------------------------------------------------

const SCENES = {
  title: () => sceneTitle('title', TOD.day),
  road_morning: () => sceneRoad('road_morning', TOD.morning),
  road_evening: () => sceneRoad('road_evening', TOD.evening),
  road_rain: () => sceneRoad('road_rain', TOD.rain),
  road_night: () => sceneRoad('road_night', TOD.night),
  classroom_day: () => sceneClassroom('classroom_day', { ...TOD.day, amb: [0.93, 0.91, 0.9], sun: [0.3, 0.28, 0.22], s: norm([-0.6, 0.75, 0.25]), hazeD: 400, flat: 0.5 }),
  classroom_evening: () => sceneClassroom('classroom_evening', { ...TOD.evening, amb: [0.54, 0.42, 0.54], sun: [0.7, 0.42, 0.2], s: norm([-1, 0.32, 0.22]), hazeD: 300, flat: 0.4 }),
  hallway: () => sceneHallway('hallway', { ...TOD.day, amb: [0.82, 0.82, 0.86], sun: [0.25, 0.23, 0.18], s: norm([-0.5, 0.75, -0.25]), hazeD: 160, flat: 0.5 }),
  shoe_lockers: () => sceneShoeLockers('shoe_lockers', { ...TOD.afternoon, amb: [0.7, 0.66, 0.68], sun: [0.4, 0.3, 0.18], s: norm([0.3, 0.32, 1]), hazeD: 200 }),
  shoe_lockers_rain: () => sceneShoeLockers('shoe_lockers_rain', { ...TOD.rain, amb: [0.72, 0.74, 0.8], hazeD: 120 }),
  courtyard: () => sceneCourtyard('courtyard', { ...TOD.day, s: norm([0.3, 0.8, -0.5]) }),
  shotengai: () => sceneShotengai('shotengai', { ...TOD.afternoon, s: norm([0.3, 0.6, 0.6]) }),
  riverbank_evening: () => sceneRiverbank('riverbank_evening', { ...TOD.evening, s: norm([-0.9, 0.2, 0.4]), hazeD: 260 }),
  station_morning: () => sceneStation('station_morning', { ...TOD.morning, s: norm([0.6, 0.7, 0.25]) }),
  apartment_door: () => sceneApartment('apartment_door', { ...TOD.evening, amb: [0.6, 0.5, 0.6], sun: [0.4, 0.25, 0.12], s: norm([-1, 0.28, 0.3]), hazeD: 300 }),
  shrine_steps: () => sceneShrineSteps('shrine_steps', { ...TOD.evening, s: norm([0.5, 0.3, 0.8]), hazeD: 200 }),
  festival_street: () => sceneFestival('festival_street', TOD.night),
  riverbank_night: () => sceneRiverbank('riverbank_night', { ...TOD.night, hazeD: 260 }),
  shrine_night: () => sceneShrineNight('shrine_night', TOD.night),
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
