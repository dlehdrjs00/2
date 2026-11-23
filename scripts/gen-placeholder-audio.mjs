#!/usr/bin/env node
/**
 * PLACEHOLDER 오디오 생성기 — 《내일도 같이 갈래?》
 *
 * 최종 음악·효과음이 나오기 전까지 쓰는 교체 가능한 임시 BGM/SFX 를 코드로 합성한다.
 * 외부 음원·샘플·사운드폰트를 쓰지 않는다. 모든 소리는 오실레이터·노이즈·엔벌로프·필터와
 * Karplus-Strong 현 모델(하프·기타·피치카토·샤미센)로 만든다. 시드 난수라 매번 같은 결과가 나온다.
 *
 *   node scripts/gen-placeholder-audio.mjs                       # 전체 생성
 *   node scripts/gen-placeholder-audio.mjs bgm_daily sfx_cat     # 일부만 생성
 *   node scripts/gen-placeholder-audio.mjs --preview=DIR         # DIR 에 파형 PNG 도 저장
 *   node scripts/gen-placeholder-audio.mjs bgm_heart --stems     # 악기(버스)별 음량만 출력(파일 안 씀)
 *
 * 필요: playwright(Chromium 의 OfflineAudioContext 로 합성), ffmpeg(libmp3lame)
 *       FFMPEG / FFPROBE 환경변수로 실행 파일 경로를 바꿀 수 있다(기본 /usr/bin/ffmpeg, /usr/bin/ffprobe).
 *
 * 출력: public/assets/placeholder/audio/{id}.mp3 — 파일명은 src/story/assets.ts 의 BGM/SFX src 기준.
 * 규격: 44.1kHz.
 *   BGM  스테레오 112kbps CBR. 마디 단위 길이(24~40초)이고, 곡 끝에서 넘친 잔향을 곡 앞부분에 겹쳐
 *        넣어(원형 버퍼) node.loop=true 로 돌려도 이음매가 없다. RMS ≈ -20 dBFS, 피크 ≤ -1 dBFS.
 *   SFX  모노 96kbps. 피크 ≤ -1 dBFS(기본 -3 dBFS 근처로 맞춤).
 * 처리 순서: Chromium 페이지에서 합성 → Float32 PCM 을 Node 로 가져옴 → 루프 접기·음량 맞춤·리미터
 *           → 임시 WAV → ffmpeg 로 MP3 → MP3 를 다시 디코드해 피크/RMS/길이 검사(넘치면 다시 인코딩)
 *           → 임시 WAV 삭제 → Chromium decodeAudioData 로 길이(갭리스) 확인.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'public', 'assets', 'placeholder', 'audio');
const FFMPEG = process.env.FFMPEG || '/usr/bin/ffmpeg';
const FFPROBE = process.env.FFPROBE || '/usr/bin/ffprobe';
const SR = 44100;
const BGM_KBPS = 112;
const SFX_KBPS = 96;
const BGM_RMS_DB = -20;
const PEAK_LIMIT_DB = -1; // 최종 MP3 디코드 기준 상한
const TOTAL_BUDGET = 3.5 * 1024 * 1024;

/** 생성 목록. kind: bgm(스테레오 루프) / sfx(모노). SFX 는 peakDb(피크 목표) 또는 rmsDb(지속음) 로 음량을 맞춘다 */
const SPECS = {
  bgm_title: { kind: 'bgm' },
  bgm_daily: { kind: 'bgm' },
  bgm_heart: { kind: 'bgm' },
  bgm_evening: { kind: 'bgm' },
  bgm_festival: { kind: 'bgm' },
  bgm_confession: { kind: 'bgm' },
  sfx_select: { kind: 'sfx', peakDb: -4 },
  sfx_bell: { kind: 'sfx', peakDb: -3 },
  sfx_door: { kind: 'sfx', peakDb: -3 },
  sfx_rain: { kind: 'sfx', rmsDb: -24, peakDb: -6 },
  sfx_camera: { kind: 'sfx', peakDb: -3 },
  sfx_firework: { kind: 'sfx', peakDb: -2 },
  sfx_message: { kind: 'sfx', peakDb: -4 },
  sfx_sparkle: { kind: 'sfx', peakDb: -4 },
  sfx_footsteps: { kind: 'sfx', peakDb: -3 },
  sfx_cat: { kind: 'sfx', peakDb: -3 },
};

// ===========================================================================
// 브라우저(Chromium) 안에서 실행되는 합성 라이브러리.
// page.evaluate 로 함수 소스째 넘기므로 바깥 변수를 참조하면 안 된다.
// ===========================================================================
function browserLib() {
  const SR = 44100;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------------------------------------------------------------- 음이름·화음
  const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const acc = (a) => (a === '#' ? 1 : a === 'b' ? -1 : 0);
  function midi(name) {
    const m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
    if (!m) throw new Error('bad note ' + name);
    return 12 * (Number(m[3]) + 1) + PC[m[1]] + acc(m[2]);
  }
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  /** "E5/1.5 r/.5 G5/1" → 음표 목록(단위: 박) */
  function seq(str, start = 0) {
    const notes = [];
    let t = start;
    for (const tok of str.trim().split(/\s+/)) {
      const [p, d] = tok.split('/');
      const dur = Number(d);
      if (!(dur > 0)) throw new Error('bad token ' + tok);
      if (p !== 'r') notes.push({ m: midi(p), t, d: dur });
      t += dur;
    }
    return { notes, end: t };
  }

  const QUAL = {
    '': [0, 4, 7],
    m: [0, 3, 7],
    5: [0, 7],
    7: [0, 4, 7, 10],
    maj7: [0, 4, 7, 11],
    m7: [0, 3, 7, 10],
    sus4: [0, 5, 7],
    sus2: [0, 2, 7],
    '7sus4': [0, 5, 7, 10],
    add9: [0, 4, 7, 14],
    6: [0, 4, 7, 9],
    dim: [0, 3, 6],
  };
  function chord(sym) {
    const m = /^([A-G])(#|b)?([^/]*)(?:\/([A-G])(#|b)?)?$/.exec(sym);
    if (!m || !(m[3] in QUAL)) throw new Error('bad chord ' + sym);
    const root = (PC[m[1]] + acc(m[2]) + 12) % 12;
    const ivs = QUAL[m[3]];
    const bass = m[4] ? (PC[m[4]] + acc(m[5]) + 12) % 12 : root;
    return { sym, root, bass, ivs, pcs: ivs.map((i) => (root + i) % 12) };
  }
  /** pc 를 가진 lo 이상의 가장 낮은 음 */
  function lowest(pc, lo) {
    let m = lo;
    while (((m % 12) + 12) % 12 !== pc) m++;
    return m;
  }
  /** 화음의 모든 자리바꿈(밀집 배치) 중 [lo,hi] 안에 드는 것 */
  function voicings(ch, lo, hi) {
    const pcs = [...new Set(ch.pcs)];
    const res = [];
    for (let k = 0; k < pcs.length; k++) {
      const order = pcs.slice(k).concat(pcs.slice(0, k));
      const v = [lowest(order[0], lo)];
      for (let j = 1; j < order.length; j++) {
        let m = v[j - 1] + 1;
        while (m % 12 !== order[j]) m++;
        v.push(m);
      }
      if (v[v.length - 1] <= hi) res.push(v);
    }
    return res.length ? res : [pcs.map((p) => lowest(p, lo)).sort((a, b) => a - b)];
  }
  const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  /** 직전 배치와 가장 가깝고 반음 충돌이 적은 배치 고르기(간단한 성부 진행) */
  function voiceLead(ch, prev, lo, hi) {
    let best = null;
    let bc = Infinity;
    for (const v of voicings(ch, lo, hi)) {
      let c = Math.abs(avg(v) - (lo + hi) / 2) * 0.35;
      if (prev) for (const x of v) c += Math.min(...prev.map((p) => Math.abs(p - x))) * 0.6;
      for (let i = 1; i < v.length; i++) if (v[i] - v[i - 1] === 1) c += 3;
      if (c < bc) {
        bc = c;
        best = v;
      }
    }
    return best;
  }

  // ---------------------------------------------------------------- 곡(렌더 컨텍스트)
  class Song {
    constructor(o) {
      this.bpm = o.bpm ?? 120;
      this.bpb = o.beatsPerBar ?? 4;
      this.bars = o.bars ?? 1;
      this.spb = 60 / this.bpm;
      this.loop = o.loop !== false;
      this.L = o.duration ?? this.bars * this.bpb * this.spb;
      this.tail = o.tail ?? (this.loop ? 5 : 0);
      this.channels = o.channels ?? 2;
      this.stems = !!o.stems;
      this.ctx = new OfflineAudioContext(this.stems ? 16 : this.channels, Math.ceil((this.L + this.tail) * SR), SR);
      this.rand = mulberry32(o.seed ?? 1);
      this.human = o.human ?? 0.006;
      this.busNames = [];
      this.cache = new Map();
      const ctx = this.ctx;
      this.master = ctx.createGain();
      if (this.stems) {
        // 분석용: 버스마다 따로 채널에 담는다(잔향 제외, 모노)
        this.merger = ctx.createChannelMerger(16);
        this.merger.connect(ctx.destination);
      } else this.master.connect(ctx.destination);
      this.noise = this.makeNoise(4);
      if (o.reverb !== null) {
        const rv = o.reverb ?? {};
        this.rev = ctx.createConvolver();
        this.rev.buffer = this.makeIR(rv.sec ?? 2.2, rv.damp ?? 0.35, rv.pre ?? 0.015);
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = rv.hp ?? 200;
        const ret = ctx.createGain();
        ret.gain.value = rv.gain ?? 1;
        this.rev.connect(hp).connect(ret);
        ret.connect(this.master);
      }
    }
    /** 박 → 초(사람 연주처럼 살짝 흔들림). 루프 곡은 원형으로 접는다 */
    T(beat, j = 1) {
      let t = beat * this.spb + (this.rand() * 2 - 1) * this.human * j;
      if (this.loop) t = ((t % this.L) + this.L) % this.L;
      else t = Math.max(0, t);
      return t;
    }
    D(beats) {
      return beats * this.spb;
    }
    v(vel, amt = 0.1) {
      return vel * (1 + (this.rand() * 2 - 1) * amt);
    }
    prog(list) {
      const segs = [];
      let t = 0;
      for (const it of list) {
        const [sym, d] = Array.isArray(it) ? it : [it, this.bpb];
        segs.push({ ch: chord(sym), t, d });
        t += d;
      }
      if (this.loop && Math.abs(t - this.bars * this.bpb) > 1e-6) throw new Error(`progression length ${t} != ${this.bars * this.bpb}`);
      return segs;
    }
    melody(str) {
      const s = seq(str);
      if (this.loop && Math.abs(s.end - this.bars * this.bpb) > 1e-6) throw new Error(`melody length ${s.end} != ${this.bars * this.bpb}`);
      return s.notes;
    }
    chordAt(segs, beat) {
      let cur = segs[0];
      for (const s of segs) if (s.t <= beat + 1e-9) cur = s;
      return cur;
    }
    bus(name, { gain = 1, pan = 0, rev = 0.2, eq = [] } = {}) {
      const ctx = this.ctx;
      this.busNames.push(name);
      const input = ctx.createGain();
      input.gain.value = gain;
      let node = input;
      for (const f of eq) {
        const b = ctx.createBiquadFilter();
        b.type = f.type;
        b.frequency.value = f.f;
        if (f.q != null) b.Q.value = f.q;
        if (f.g != null) b.gain.value = f.g;
        node.connect(b);
        node = b;
      }
      if (this.channels === 2 && pan) {
        const p = ctx.createStereoPanner();
        p.pan.value = pan;
        node.connect(p);
        node = p;
      }
      if (this.stems) {
        node.connect(this.merger, 0, this.busNames.length - 1);
        return input;
      }
      node.connect(this.master);
      if (this.rev && rev > 0) {
        const s = ctx.createGain();
        s.gain.value = rev;
        node.connect(s).connect(this.rev);
      }
      return input;
    }
    makeNoise(sec) {
      const len = Math.floor(sec * SR);
      const buf = this.ctx.createBuffer(1, len, SR);
      const d = buf.getChannelData(0);
      const r = mulberry32(777);
      for (let i = 0; i < len; i++) d[i] = r() * 2 - 1;
      return buf;
    }
    noiseSrc(t, dur) {
      const s = this.ctx.createBufferSource();
      s.buffer = this.noise;
      s.loop = true;
      s.start(t, this.rand() * (this.noise.duration - 0.05));
      s.stop(t + dur);
      return s;
    }
    /** 지수 감쇠 노이즈 + 시간에 따라 어두워지는 저역통과 = 간단한 홀 잔향 */
    makeIR(sec, damp, pre) {
      const len = Math.floor(sec * SR);
      const nch = this.channels;
      const buf = this.ctx.createBuffer(nch, len, SR);
      for (let c = 0; c < nch; c++) {
        const d = buf.getChannelData(c);
        const r = mulberry32(1234 + c * 77);
        const preN = Math.floor(pre * SR);
        let lp = 0;
        for (let i = preN; i < len; i++) {
          const t = (i - preN) / SR;
          const env = Math.exp((-6.9 * t) / sec) * (1 - i / len);
          const a = clamp(0.85 * Math.exp(-t / (sec * damp)), 0.04, 0.85);
          lp += a * (r() * 2 - 1 - lp);
          d[i] = lp * env;
        }
        for (let k = 0; k < 10; k++) {
          const i = preN + Math.floor((0.003 + r() * 0.07) * SR);
          d[i] += (r() - 0.5) * 0.9 * (1 - k / 12);
        }
      }
      return buf;
    }
    wave(key, harm) {
      const k = 'wave:' + key;
      if (!this.cache.has(k)) {
        const real = new Float32Array(harm.length);
        const imag = Float32Array.from(harm);
        this.cache.set(k, this.ctx.createPeriodicWave(real, imag));
      }
      return this.cache.get(k);
    }
    async render() {
      const buf = await this.ctx.startRendering();
      if (this.stems) {
        const n = buf.length;
        const mix = new Float32Array(n);
        const stems = this.busNames.map((name, k) => {
          const d = buf.getChannelData(k);
          let pk = 0;
          for (let i = 0; i < n; i++) {
            mix[i] += d[i];
            pk = Math.max(pk, Math.abs(d[i]));
          }
          return { name, rmsA: aWeightedRms(d), peak: pk };
        });
        return { stems, mixRmsA: aWeightedRms(mix) };
      }
      const channels = [];
      for (let c = 0; c < buf.numberOfChannels; c++) channels.push(f32ToB64(buf.getChannelData(c)));
      return { sr: buf.sampleRate, loopSamples: this.loop ? Math.round(this.L * SR) : 0, length: buf.length, channels, buses: this.busNames };
    }
  }

  /** A 가중 RMS(작은 음량에서 사람이 느끼는 크기에 가깝게: 저역을 크게 깎는다) */
  function aWeightedRms(x) {
    const fs = SR;
    const k = 2 * fs;
    const w = (f) => 2 * Math.PI * f;
    const secs = [['hp', w(20.6)], ['hp', w(20.6)], ['hp', w(107.7)], ['hp', w(737.9)], ['lp', w(12194)], ['lp', w(12194)]].map(([t, wc]) => {
      const a0 = k + wc;
      const a1 = (wc - k) / a0;
      return t === 'hp' ? { b0: k / a0, b1: -k / a0, a1 } : { b0: 1 / a0, b1: 1 / a0, a1 };
    });
    const run = (sig) => {
      let y = sig;
      for (const s of secs) {
        const out = new Float32Array(y.length);
        let x1 = 0;
        let y1 = 0;
        for (let i = 0; i < y.length; i++) {
          const v = s.b0 * y[i] + s.b1 * x1 - s.a1 * y1;
          x1 = y[i];
          y1 = v;
          out[i] = v;
        }
        y = out;
      }
      return y;
    };
    // 1kHz 에서 0dB 로 정규화
    const tn = 8192;
    const sine = new Float32Array(tn);
    for (let i = 0; i < tn; i++) sine[i] = Math.sin((2 * Math.PI * 1000 * i) / fs);
    const ref = run(sine);
    let rs = 0;
    for (let i = tn / 2; i < tn; i++) rs += ref[i] * ref[i];
    const norm = Math.sqrt(0.5 / (rs / (tn / 2)));
    const y = run(x);
    let s2 = 0;
    for (let i = 0; i < y.length; i++) s2 += y[i] * y[i];
    return Math.sqrt(s2 / y.length) * norm;
  }

  function f32ToB64(f32) {
    const u8 = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength);
    let s = '';
    const CH = 0x8000;
    for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
    return btoa(s);
  }

  function biq(S, type, f, q, gain) {
    const b = S.ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    if (q != null) b.Q.value = q;
    if (gain != null) b.gain.value = gain;
    return b;
  }
  /** 0 → peak(선형) → 지수 감쇠 */
  function hitEnv(param, t, peak, att, tau, hold = 0) {
    param.setValueAtTime(0, t);
    param.linearRampToValueAtTime(peak, t + att);
    param.setTargetAtTime(0, t + att + hold, tau);
    return t + att + hold + tau * 8;
  }
  /** 매끄러운 곡선(코사인 보간) 점 목록 → Float32Array */
  function curve(points, n = 256) {
    const out = new Float32Array(n);
    const T = points[points.length - 1][0];
    for (let i = 0; i < n; i++) {
      const t = (i / (n - 1)) * T;
      let k = 0;
      while (k < points.length - 2 && points[k + 1][0] < t) k++;
      const [t0, v0] = points[k];
      const [t1, v1] = points[k + 1];
      const u = t1 > t0 ? clamp((t - t0) / (t1 - t0), 0, 1) : 1;
      out[i] = v0 + (v1 - v0) * (0.5 - 0.5 * Math.cos(Math.PI * u));
    }
    return out;
  }

  // ---------------------------------------------------------------- 악기
  /** 가산 합성 피아노: 약간의 비조화성, 2단 감쇠, 높은 배음일수록 빨리 사라짐, 이중 현 맥놀이, 해머 노이즈 */
  function piano(S, dest, t, m, dur, vel = 0.6, o = {}) {
    const ctx = S.ctx;
    const f0 = mtof(m);
    const bright = clamp(o.bright ?? 0.3 + 0.6 * vel, 0.05, 1);
    const out = ctx.createGain();
    const lp = biq(S, 'lowpass', 1000, 0.35);
    lp.frequency.setValueAtTime(Math.min(16000, 900 + f0 * (3 + 8 * bright)), t);
    lp.frequency.setTargetAtTime(Math.min(10000, 800 + f0 * (3 + 5 * bright)), t + 0.02, 0.6);
    out.connect(lp).connect(dest);
    const sus = clamp(Math.pow(2, -(m - 60) / 18), 0.3, 3) * (o.sustain ?? 1);
    const off = t + Math.max(0.06, dur);
    const relTau = o.rel ?? (m < 48 ? 0.18 : 0.11);
    const N = Math.max(1, Math.min(12, Math.floor(12000 / f0)));
    for (let n = 1; n <= N; n++) {
      const fn = n * f0 * Math.sqrt(1 + 0.0003 * n * n);
      const amp = 0.1 * vel * Math.pow(n, -1.1) * Math.pow(bright, 0.55 * (n - 1)) * (n === 2 ? 0.8 : 1);
      const tauS = 0.2 / (1 + 0.25 * (n - 1));
      const tauL = (2.6 * sus) / (1 + 0.55 * (n - 1));
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(amp, t + 0.0025);
      g.gain.setTargetAtTime(amp * 0.38, t + 0.0025, tauS);
      const t2 = t + 0.0025 + tauS * 1.5;
      if (off > t2) g.gain.setTargetAtTime(0, t2, tauL);
      g.gain.setTargetAtTime(0, Math.max(off, t + 0.003), relTau);
      const end = Math.min(off + relTau * 8, t + 0.01 + tauL * 7);
      g.connect(out);
      const o1 = ctx.createOscillator();
      o1.frequency.value = fn;
      o1.connect(g);
      o1.start(t);
      o1.stop(end);
      if (n <= 3) {
        const o2 = ctx.createOscillator();
        o2.frequency.value = fn;
        o2.detune.value = (n === 1 ? 1.1 : 0.8) * (S.rand() < 0.5 ? 1 : -1);
        const g2 = ctx.createGain();
        g2.gain.value = 0.45;
        o2.connect(g2).connect(g);
        o2.start(t);
        o2.stop(end);
      }
    }
    // 해머
    const nz = S.noiseSrc(t, 0.06);
    const bp = biq(S, 'bandpass', Math.min(4500, f0 * 3), 0.9);
    const ng = ctx.createGain();
    hitEnv(ng.gain, t, 0.035 * vel * bright, 0.001, 0.006);
    nz.connect(bp).connect(ng).connect(out);
  }

  /** FM 일렉트릭 피아노(로즈풍) */
  function epiano(S, dest, t, m, dur, vel = 0.5, o = {}) {
    const ctx = S.ctx;
    const f = mtof(m);
    const car = ctx.createOscillator();
    car.frequency.value = f;
    const mod = ctx.createOscillator();
    mod.frequency.value = f;
    const modG = ctx.createGain();
    modG.gain.setValueAtTime(f * (0.6 + 1.6 * vel), t);
    modG.gain.setTargetAtTime(f * 0.18, t, 0.4);
    mod.connect(modG).connect(car.frequency);
    const tine = ctx.createOscillator();
    tine.frequency.value = f * 14;
    const tineG = ctx.createGain();
    tineG.gain.setValueAtTime(f * 0.9 * vel, t);
    tineG.gain.setTargetAtTime(0, t, 0.025);
    tine.connect(tineG).connect(car.frequency);
    const amp = ctx.createGain();
    const a = 0.16 * vel;
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(a, t + 0.004);
    amp.gain.setTargetAtTime(a * 0.6, t + 0.004, 0.45);
    const off = t + Math.max(dur, 0.02);
    if (off > t + 0.8) amp.gain.setTargetAtTime(0, t + 0.8, 3.2);
    amp.gain.setTargetAtTime(0, off, o.rel ?? 0.22);
    car.connect(amp).connect(dest);
    const end = off + (o.rel ?? 0.22) * 8;
    for (const x of [car, mod, tine]) {
      x.start(t);
      x.stop(end);
    }
  }

  /** 플루트 / 시노부에(일본 피리): 배음이 적은 파형 + 숨소리 노이즈 + 늦게 들어오는 비브라토 + (선택) 꾸밈음·음 끌어올리기 */
  function flute(S, dest, t, m, dur, vel = 0.6, o = {}) {
    const ctx = S.ctx;
    const f = mtof(m);
    const osc = ctx.createOscillator();
    osc.setPeriodicWave(S.wave(o.wave ?? 'flute', o.harm ?? [0, 1, 0.3, 0.11, 0.05, 0.022, 0.01]));
    const p = osc.frequency;
    if (o.grace != null) {
      p.setValueAtTime(mtof(o.grace), t);
      p.setValueAtTime(f, t + (o.graceLen ?? 0.055));
    } else if (o.scoop) {
      p.setValueAtTime(f * Math.pow(2, -o.scoop / 1200), t);
      p.exponentialRampToValueAtTime(f, t + 0.08);
    } else p.setValueAtTime(f, t);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = o.vibRate ?? 5.0;
    const lg = ctx.createGain();
    const depth = f * (o.vib ?? 0.005);
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(0, t + 0.18);
    lg.gain.linearRampToValueAtTime(depth, t + 0.6);
    lfo.connect(lg).connect(p);
    const att = o.att ?? 0.045;
    const rel = o.rel ?? 0.07;
    const a = 0.2 * vel;
    const off = t + Math.max(dur, att + 0.01);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(a, t + att);
    if (dur > 0.5) amp.gain.linearRampToValueAtTime(a * 1.1, t + dur * 0.7);
    amp.gain.setTargetAtTime(0, off, rel);
    const lp = biq(S, 'lowpass', Math.min(12000, f * 6), 0.5);
    osc.connect(amp).connect(lp).connect(dest);
    const end = off + rel * 7;
    osc.start(t);
    osc.stop(end);
    lfo.start(t);
    lfo.stop(end);
    // 숨소리
    const b = o.breath ?? 0.12;
    const nz = S.noiseSrc(t, end - t);
    const bp = biq(S, 'bandpass', Math.min(9000, f * 2), 1.3);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0, t);
    ng.gain.linearRampToValueAtTime(a * b * 2.4, t + 0.018);
    ng.gain.setTargetAtTime(a * b, t + 0.018, 0.05);
    ng.gain.setTargetAtTime(0, off, rel);
    nz.connect(bp).connect(ng).connect(dest);
  }

  /** 현악 패드: 살짝 어긋난 톱니파 2개씩 + 저역통과 + 느린 어택 */
  function pad(S, dest, t, notes, dur, vel = 0.5, o = {}) {
    const ctx = S.ctx;
    const att = o.att ?? 0.6;
    const rel = o.rel ?? 1.0;
    const g = ctx.createGain();
    const a = 0.05 * vel;
    const off = t + Math.max(dur, att + 0.01);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(a, t + att);
    g.gain.setValueAtTime(a, off);
    g.gain.setTargetAtTime(0, off, rel / 3);
    const lp = biq(S, 'lowpass', o.cutoff ?? 1500, 0.5);
    g.connect(lp).connect(dest);
    const end = off + rel * 2.6;
    for (const m of notes) {
      const f = mtof(m);
      for (const d of o.detunes ?? [-7, 6]) {
        const os = ctx.createOscillator();
        os.type = o.type ?? 'sawtooth';
        os.frequency.value = f;
        os.detune.value = d + (S.rand() - 0.5) * 3;
        os.connect(g);
        os.start(t);
        os.stop(end);
      }
    }
  }

  /** 부드러운 베이스(삼각파+사인) */
  function bass(S, dest, t, m, dur, vel = 0.6, o = {}) {
    const ctx = S.ctx;
    const f = mtof(m);
    const g = ctx.createGain();
    const a = 0.22 * vel;
    const att = o.att ?? 0.012;
    const off = t + Math.max(dur, att + 0.01);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(a, t + att);
    g.gain.setTargetAtTime(a * (o.sus ?? 0.55), t + att, o.dec ?? 0.4);
    g.gain.setTargetAtTime(0, off, o.rel ?? 0.09);
    const cut = o.cutoff ?? 650;
    const lp = biq(S, 'lowpass', cut, 0.6);
    lp.frequency.setValueAtTime(cut * 1.6, t);
    lp.frequency.setTargetAtTime(cut, t, 0.15);
    g.connect(lp).connect(dest);
    const end = off + (o.rel ?? 0.09) * 8;
    for (const [type, k] of [['triangle', 1], ['sine', 0.8]]) {
      const os = ctx.createOscillator();
      os.type = type;
      os.frequency.value = f;
      const kg = ctx.createGain();
      kg.gain.value = k;
      os.connect(kg).connect(g);
      os.start(t);
      os.stop(end);
    }
  }

  /** Karplus-Strong 현(분수 지연 올패스로 정확히 조율). 버퍼는 음높이·설정별로 캐시 */
  function ks(S, m, o) {
    const key = `ks:${m}|${o.t60}|${o.bright}|${o.pos}|${o.dur}|${o.S}`;
    if (S.cache.has(key)) return S.cache.get(key);
    const f = mtof(m);
    const period = SR / f;
    const Sx = o.S ?? 0.5;
    const N = Math.floor(period - Sx);
    const frac = period - Sx - N;
    const C = (1 - frac) / (1 + frac);
    const len = Math.floor((o.dur ?? 2) * SR);
    const out = new Float32Array(len);
    const dl = new Float32Array(N);
    const r = mulberry32(9001 + m * 31);
    const a = clamp(o.bright ?? 0.5, 0.02, 1);
    let lpS = 0;
    let mean = 0;
    for (let i = 0; i < N; i++) {
      lpS += a * (r() * 2 - 1 - lpS);
      dl[i] = lpS;
      mean += lpS;
    }
    mean /= N;
    for (let i = 0; i < N; i++) dl[i] -= mean;
    if (o.pos) {
      const P = Math.max(1, Math.round(o.pos * N));
      const tmp = Float32Array.from(dl);
      for (let i = 0; i < N; i++) dl[i] = tmp[i] - tmp[(i + P) % N];
    }
    let pk = 1e-9;
    for (let i = 0; i < N; i++) pk = Math.max(pk, Math.abs(dl[i]));
    for (let i = 0; i < N; i++) dl[i] /= pk;
    const g = Math.pow(10, -3 / ((o.t60 ?? 2) * f));
    let idx = 0;
    let prev = 0;
    let apX = 0;
    let apY = 0;
    for (let n = 0; n < len; n++) {
      const x = dl[idx];
      out[n] = x;
      const l = g * ((1 - Sx) * x + Sx * prev);
      prev = x;
      const ap = C * l + apX - C * apY;
      apX = l;
      apY = ap;
      dl[idx] = ap;
      if (++idx === N) idx = 0;
    }
    const fade = Math.min(len, Math.floor(0.03 * SR));
    for (let i = 0; i < fade; i++) out[len - 1 - i] *= i / fade;
    const buf = S.ctx.createBuffer(1, len, SR);
    buf.copyToChannel(out, 0);
    S.cache.set(key, buf);
    return buf;
  }
  function pluck(S, dest, t, m, dur, vel, o) {
    const buf = ks(S, m, o);
    const src = S.ctx.createBufferSource();
    src.buffer = buf;
    const g = S.ctx.createGain();
    g.gain.setValueAtTime((o.gain ?? 0.3) * vel, t);
    let end = t + buf.duration;
    if (dur != null && o.damp) {
      g.gain.setTargetAtTime(0, t + dur, o.damp);
      end = Math.min(end, t + dur + o.damp * 8);
    }
    src.connect(g).connect(dest);
    src.start(t);
    src.stop(end);
  }

  /** 마림바: 기음 + 4배·10배 배음(조율된 건반), 말렛 노이즈 */
  function marimba(S, dest, t, m, vel = 0.6, o = {}) {
    const ctx = S.ctx;
    const f = mtof(m);
    const tau = clamp(0.42 * Math.pow(2, -(m - 60) / 24), 0.12, 1.0) * (o.decay ?? 1);
    const parts = [
      [1, 1, tau],
      [4.0, 0.16 + 0.12 * vel, tau * 0.14],
      [9.9, 0.04, 0.012],
    ];
    for (const [r, amp, tt] of parts) {
      const fr = f * r;
      if (fr > 16000) continue;
      const os = ctx.createOscillator();
      os.frequency.value = fr;
      const g = ctx.createGain();
      const end = hitEnv(g.gain, t, 0.25 * vel * amp, 0.0015, tt);
      os.connect(g).connect(dest);
      os.start(t);
      os.stop(end);
    }
    const nz = S.noiseSrc(t, 0.04);
    const bp = biq(S, 'bandpass', Math.min(6000, f * 2.5), 1.2);
    const ng = ctx.createGain();
    hitEnv(ng.gain, t, 0.05 * vel, 0.001, 0.004);
    nz.connect(bp).connect(ng).connect(dest);
  }

  /** 종·글로켄·첼레스타류: [배율, 크기, 감쇠τ] 목록 */
  function bell(S, dest, t, m, vel, parts, o = {}) {
    const ctx = S.ctx;
    const f = o.freq ?? mtof(m);
    const att = o.att ?? 0.002;
    for (const [r, amp, tau] of parts) {
      const fr = f * r;
      if (fr > 18000) continue;
      const os = ctx.createOscillator();
      os.frequency.value = fr;
      if (o.detune) os.detune.value = (S.rand() - 0.5) * o.detune;
      const g = ctx.createGain();
      const tt = tau * (o.decay ?? 1);
      const end = hitEnv(g.gain, t, (o.amp ?? 0.15) * vel * amp, att, tt);
      os.connect(g).connect(dest);
      os.start(t);
      os.stop(end);
    }
  }
  const GLOCK = [
    [1, 1, 0.9],
    [2.76, 0.32, 0.22],
    [5.4, 0.15, 0.08],
    [8.93, 0.07, 0.035],
  ];
  const CELESTA = [
    [1, 1, 0.75],
    [2, 0.18, 0.35],
    [3, 0.06, 0.18],
    [4.07, 0.1, 0.1],
  ];

  /** 음높이가 떨어지는 북 소리 */
  function drumTone(S, dest, t, vel, o) {
    const ctx = S.ctx;
    const os = ctx.createOscillator();
    os.type = o.type ?? 'sine';
    os.frequency.setValueAtTime(o.f0, t);
    os.frequency.exponentialRampToValueAtTime(o.f1 ?? o.f0 * 0.999, t + (o.pd ?? 0.05));
    const g = ctx.createGain();
    const end = hitEnv(g.gain, t, (o.amp ?? 0.5) * vel, o.att ?? 0.002, o.tau ?? 0.1, o.hold ?? 0);
    os.connect(g).connect(dest);
    os.start(t);
    os.stop(end);
  }
  /** 필터 거친 노이즈 타격 */
  function noiseHit(S, dest, t, vel, o) {
    const ctx = S.ctx;
    const tau = o.tau ?? 0.03;
    const att = o.att ?? 0.001;
    const hold = o.hold ?? 0;
    const src = S.noiseSrc(t, att + hold + tau * 8);
    let node = src;
    for (const [type, f, q] of o.filters ?? [['highpass', 5000, 0.7]]) {
      const b = biq(S, type, f, q);
      node.connect(b);
      node = b;
    }
    const g = ctx.createGain();
    hitEnv(g.gain, t, (o.amp ?? 0.3) * vel, att, tau, hold);
    node.connect(g).connect(dest);
  }

  // ===================================================================== BGM
  const TRACKS = {};

  // ---- 타이틀: G장조 3/4, 96BPM, 16마디(30초). 하프 분산화음 + 플루트 + 현 패드 + 글로켄 + 바람
  TRACKS.bgm_title = (opt) => {
    const S = new Song({ bpm: 96, beatsPerBar: 3, bars: 16, seed: 11, reverb: { sec: 2.8, damp: 0.38 }, ...opt });
    const P = S.prog([
      'G', 'D/F#', 'Em7', 'Bm/D', 'Cmaj7', 'G/B', 'Am7', ['D7sus4', 2], ['D7', 1],
      'Cmaj7', 'D/C', 'Bm7', 'Em7', 'Am7', 'Bm7', 'Cmaj7', ['D7sus4', 2], ['D7', 1],
    ]);
    const mel = S.melody(`
      D5/1.5 G5/.5 A5/.5 B5/.5   A5/2 F#5/1   G5/1.5 E5/.5 D5/.5 E5/.5   D5/3
      E5/1.5 G5/.5 C6/.5 B5/.5   B5/2 G5/1    A5/1.5 G5/.5 E5/.5 G5/.5   A5/2 r/.5 D5/.5
      G5/1.5 E5/.5 G5/.5 C6/.5   D6/1.5 C6/.5 B5/.5 A5/.5   B5/2 F#5/1   G5/1.5 F#5/.5 E5/.5 D5/.5
      E5/1.5 A5/.5 B5/.5 C6/.5   D6/2 B5/1    C6/1 B5/1 G5/1   A5/1.5 G5/.5 F#5/1`);
    const fl = S.bus('flute', { gain: 1.0, pan: 0.1, rev: 0.34 });
    const hp = S.bus('harp', { gain: 1.85, pan: -0.18, rev: 0.3, eq: [{ type: 'highpass', f: 70 }, { type: 'lowpass', f: 6000 }] });
    const pd = S.bus('pad', { gain: 0.94, rev: 0.5 });
    const bs = S.bus('bass', { gain: 0.93, rev: 0.05 });
    const gl = S.bus('glock', { gain: 0.6, pan: 0.32, rev: 0.6 });
    const wd = S.bus('wind', { gain: 0.55, rev: 0.25 });
    const HARP = { t60: 3, bright: 0.3, S: 0.5, pos: 0.27, dur: 3.4, gain: 0.32 };

    for (const n of mel) {
      const strong = n.t % 3 === 0;
      const phraseB = n.t >= 24;
      flute(S, fl, S.T(n.t), n.m, S.D(n.d) * 0.95, S.v((strong ? 0.74 : 0.62) + (phraseB ? 0.05 : 0)), { scoop: n.d >= 1.5 ? 25 : 0, vib: 0.0045 });
    }
    let prev = null;
    let prevPad = null;
    for (const seg of P) {
      const ch = seg.ch;
      const b = lowest(ch.bass, 40);
      const v = voiceLead(ch, prev, 55, 74);
      prev = v;
      const up = v.length >= 4 ? v : [...v, v[0] + 12];
      for (let e = 0; e < seg.d * 2; e++) {
        const beat = seg.t + e * 0.5;
        const pos = Math.round((beat % 3) * 2);
        const k = e === 0 ? 0 : [0, 1, 2, 3, 4, 3][pos];
        const m = k === 0 ? b : up[k - 1];
        pluck(S, hp, S.T(beat), m, null, S.v(k === 0 ? 0.8 : pos === 3 ? 0.55 : 0.45), HARP);
      }
      const phraseB = seg.t >= 24;
      const pv = voiceLead(ch, prevPad, 52, 71);
      prevPad = pv;
      pad(S, pd, S.T(seg.t, 0), pv, S.D(seg.d), phraseB ? 0.75 : 0.5, { att: 0.7, rel: 1.4, cutoff: phraseB ? 1700 : 1100 });
      bass(S, bs, S.T(seg.t, 0), b, S.D(seg.d) - 0.05, 0.5, { att: 0.05, sus: 0.7, dec: 0.8, cutoff: 400 });
    }
    // 프레이즈 끝(4·8·12·16마디)에 글로켄 반짝
    for (const bar of [3, 7, 11, 15]) {
      const at = bar * 3 + 1;
      const ch = S.chordAt(P, at).ch;
      const tones = voicings(ch, 79, 100)[0];
      [0, 1, 2, 3].forEach((i) => {
        const m = i < tones.length ? tones[i] : tones[0] + 12;
        bell(S, gl, S.T(at + i * 0.5), m, S.v(0.55 - i * 0.06), GLOCK, { amp: 0.15 });
      });
    }
    // 초여름 바람: 루프 안에서 두 번 부풀었다 잦아드는 노이즈(루프 경계에서는 0)
    const L = S.L;
    const wn = S.noiseSrc(0, L);
    const wbp = biq(S, 'bandpass', 700, 0.7);
    const wlp = biq(S, 'lowpass', 2500, 0.5);
    const wg = S.ctx.createGain();
    const n = 512;
    const ga = new Float32Array(n);
    const fa = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = i / (n - 1);
      ga[i] = 0.25 * Math.pow(Math.sin(Math.PI * 2 * x), 2) * (0.8 + 0.2 * Math.sin(Math.PI * 14 * x));
      fa[i] = 600 + 450 * Math.sin(Math.PI * 4 * x + 0.5) + 150 * Math.sin(Math.PI * 22 * x);
    }
    wg.gain.setValueCurveAtTime(ga, 0, L);
    wbp.frequency.setValueCurveAtTime(fa, 0, L);
    wn.connect(wbp).connect(wlp).connect(wg).connect(wd);
    return S;
  };

  // ---- 일상: C장조 4/4, 120BPM, 16마디(32초). 마림바 멜로디 + 피치카토 베이스·화음 + 셰이커
  TRACKS.bgm_daily = (opt) => {
    const S = new Song({ bpm: 120, bars: 16, seed: 22, reverb: { sec: 1.6, damp: 0.3 }, human: 0.005, ...opt });
    const P = S.prog([
      'C', 'Am', 'F', 'G', 'C', 'Am', 'Dm7', 'G7',
      'F', 'G', 'Em7', 'Am', 'Fmaj7', ['Em7', 2], ['A7', 2], ['Dm7', 2], ['G7', 2], ['C', 2], ['G7', 2],
    ]);
    const mel = S.melody(`
      E5/.5 G5/.5 C6/.5 G5/.5 A5/.5 G5/.5 E5/1      C5/.5 E5/.5 A5/.5 E5/.5 G5/1 E5/1
      F5/.5 A5/.5 C6/.5 D6/.5 C6/1 A5/1             B5/.5 A5/.5 G5/.5 F5/.5 D5/1 r/1
      E5/.5 G5/.5 C6/.5 G5/.5 A5/.5 G5/.5 E5/.5 C5/.5   E5/.5 D5/.5 C5/.5 E5/.5 A5/1 G5/1
      F5/.5 E5/.5 D5/.5 F5/.5 A5/1 C6/1             B5/.5 C6/.5 D6/.5 B5/.5 G5/1 r/1
      C6/1.5 A5/.5 C6/.5 D6/.5 C6/1                 B5/1.5 G5/.5 B5/.5 D6/.5 B5/1
      G5/.5 A5/.5 B5/.5 G5/.5 E5/1 D5/1             C5/.5 D5/.5 E5/.5 G5/.5 A5/2
      A5/.5 G5/.5 F5/.5 E5/.5 F5/.5 A5/.5 C6/1      B5/.5 G5/.5 E5/1 C#6/.5 A5/.5 E5/1
      D6/.5 C6/.5 A5/.5 F5/.5 B5/.5 G5/.5 F5/.5 D5/.5   C6/1 r/1 G4/.5 A4/.5 B4/.5 D5/.5`);
    const mb = S.bus('marimba', { gain: 1.0, pan: 0.12, rev: 0.22 });
    const pzL = S.bus('pizzBass', { gain: 1.04, pan: -0.05, rev: 0.12, eq: [{ type: 'lowpass', f: 2200 }, { type: 'peaking', f: 180, q: 1, g: 3 }] });
    const pzH = S.bus('pizzChord', { gain: 1.9, pan: -0.38, rev: 0.25, eq: [{ type: 'highpass', f: 200 }, { type: 'lowpass', f: 4200 }] });
    const sh = S.bus('shaker', { gain: 1.25, pan: 0.42, rev: 0.08 });
    const kk = S.bus('kick', { gain: 0.89, rev: 0.02, eq: [{ type: 'lowpass', f: 900 }] });
    const wb = S.bus('wood', { gain: 0.75, pan: -0.25, rev: 0.18 });
    const gl = S.bus('glock', { gain: 0.52, pan: 0.3, rev: 0.4 });
    const pd = S.bus('pad', { gain: 0.7, rev: 0.4 });
    const PZL = { t60: 0.7, bright: 0.22, S: 0.5, pos: 0.2, dur: 1.2, gain: 0.55, damp: 0.09 };
    const PZH = { t60: 0.45, bright: 0.3, S: 0.5, pos: 0.15, dur: 0.8, gain: 0.26, damp: 0.07 };

    for (const n of mel) {
      const onBeat = Math.abs(n.t - Math.round(n.t)) < 1e-6;
      const downbeat = n.t % 4 === 0;
      const vel = downbeat ? 0.85 : onBeat ? 0.72 : 0.6;
      if (n.d >= 1.5) {
        // 긴 음은 마림바 트레몰로(롤)
        const step = 1 / 6;
        for (let x = 0; x < n.d - 0.2; x += step) marimba(S, mb, S.T(n.t + x, 0.5), n.m, S.v(x === 0 ? vel : 0.42 - x * 0.04, 0.12));
      } else marimba(S, mb, S.T(n.t), n.m, S.v(vel));
      if (n.t >= 32 && onBeat) bell(S, gl, S.T(n.t), n.m + 12, S.v(0.5), GLOCK, { amp: 0.12 });
    }
    let prev = null;
    P.forEach((seg, i) => {
      const ch = seg.ch;
      const root = lowest(ch.bass, 36);
      const fifth = root + 7;
      const D = (x) => S.D(x);
      pluck(S, pzL, S.T(seg.t), root, D(0.7), S.v(0.85), PZL);
      if (seg.d === 4) {
        pluck(S, pzL, S.T(seg.t + 2), fifth > 50 ? fifth - 12 : fifth, D(0.7), S.v(0.7), PZL);
        const bar = Math.floor(seg.t / 4);
        if (bar % 2 === 1) {
          const next = P[(i + 1) % P.length].ch;
          const nr = lowest(next.bass, 36);
          pluck(S, pzL, S.T(seg.t + 3.5), nr + (nr > root ? -1 : 1) * (Math.abs(nr - root) > 2 ? 2 : 1), D(0.4), S.v(0.55), PZL);
        }
      } else pluck(S, pzL, S.T(seg.t + 1), fifth > 50 ? fifth - 12 : fifth, D(0.5), S.v(0.6), PZL);
      const v = voiceLead(ch, prev, 60, 76);
      prev = v;
      // 뒷박 화음(2·4박)
      for (let b = 0; b < seg.d; b++) {
        const beat = seg.t + b;
        const inBar = beat % 4;
        if (inBar === 1 || inBar === 3) {
          v.forEach((m, j) => pluck(S, pzH, S.T(beat) + j * 0.006, m, D(0.35), S.v(0.62), PZH));
        }
        if (inBar === 3 && Math.floor(beat / 4) % 2 === 0) v.forEach((m, j) => pluck(S, pzH, S.T(beat + 0.5) + j * 0.006, m, D(0.3), S.v(0.45), PZH));
      }
      if (seg.t >= 32) pad(S, pd, S.T(seg.t, 0), voiceLead(ch, null, 55, 72), D(seg.d), 0.6, { att: 0.3, rel: 0.8, cutoff: 1500 });
    });
    for (let b = 0; b < 64; b += 0.5) {
      const off = b % 1 !== 0;
      noiseHit(S, sh, S.T(b, 0.6), S.v(off ? 0.55 : 0.32, 0.15), { filters: [['highpass', 5200, 0.7], ['lowpass', 11000, 0.5]], att: 0.012, tau: 0.03, amp: 0.3 });
      if (b % 2 === 0) drumTone(S, kk, S.T(b, 0.3), S.v(b % 4 === 0 ? 0.75 : 0.55), { f0: 120, f1: 48, pd: 0.07, tau: 0.09, amp: 0.7 });
    }
    for (let bar = 1; bar < 16; bar += 2) {
      for (const [x, vv, f] of [[3, 0.6, 1250], [3.5, 0.5, 940]]) {
        const t = S.T(bar * 4 + x);
        drumTone(S, wb, t, S.v(vv), { f0: f, f1: f * 0.97, pd: 0.01, tau: 0.018, amp: 0.5 });
        noiseHit(S, wb, t, S.v(vv), { filters: [['bandpass', f * 1.8, 6]], tau: 0.01, amp: 0.25 });
      }
    }
    return S;
  };

  // ---- 설렘: F장조 4/4, 66BPM, 8마디(29초). 왕도 진행 IV–V–iii–vi. 일렉 피아노 + 플루트/첼레스타 + 패드 + 두근 박동
  TRACKS.bgm_heart = (opt) => {
    const S = new Song({ bpm: 66, bars: 8, seed: 33, reverb: { sec: 3.0, damp: 0.36 }, ...opt });
    const P = S.prog(['Bbmaj7', 'C', 'Am7', 'Dm7', 'Gm7', 'Am7', ['Bbmaj7', 2], ['C', 2], ['Fsus4', 2], ['F', 2]]);
    const mel = S.melody(`
      D5/.5 F5/.5 A5/2 G5/.5 F5/.5     G5/1.5 A5/.5 G5/1 E5/1
      E5/.5 G5/.5 C6/2 A5/1            A5/1.5 G5/.5 F5/2
      D5/.5 F5/.5 Bb5/2 A5/.5 G5/.5    A5/1.5 G5/.5 E5/1 C5/1
      D5/1 F5/1 E5/1 G5/1              C6/1 Bb5/1 A5/2`);
    const fl = S.bus('flute', { gain: 0.9, pan: 0.08, rev: 0.38 });
    const ce = S.bus('celesta', { gain: 1.0, pan: 0.22, rev: 0.5 });
    const ep = S.bus('epiano', { gain: 1.37, pan: -0.15, rev: 0.3, eq: [{ type: 'lowpass', f: 5000 }] });
    const pd = S.bus('pad', { gain: 0.79, rev: 0.55 });
    const bs = S.bus('bass', { gain: 0.96, rev: 0.05 });
    const hb = S.bus('heartbeat', { gain: 0.42, rev: 0.05, eq: [{ type: 'highpass', f: 45 }, { type: 'lowpass', f: 600 }] });
    const gl = S.bus('glock', { gain: 0.63, pan: 0.35, rev: 0.6 });

    for (const n of mel) {
      const vel = S.v(n.d >= 2 ? 0.7 : 0.6);
      flute(S, fl, S.T(n.t), n.m, S.D(n.d) * 0.96, vel, { breath: 0.16, vib: 0.004, att: 0.06, rel: 0.12 });
      bell(S, ce, S.T(n.t, 0.3), n.m + 12, S.v(0.5), CELESTA, { amp: 0.13 });
    }
    let prev = null;
    let prevPad = null;
    for (const seg of P) {
      const ch = seg.ch;
      const v = voiceLead(ch, prev, 53, 70);
      prev = v;
      const hits = seg.d === 4 ? [[0, 1.5, 0.62], [1.5, 1, 0.48], [3, 1, 0.5]] : [[0, 1.5, 0.6], [1.5, 0.5, 0.45]];
      for (const [x, d, vv] of hits) v.forEach((m, j) => epiano(S, ep, S.T(seg.t + x) + j * 0.012, m, S.D(d) - 0.04, S.v(vv)));
      const r = lowest(ch.bass, 38);
      if (seg.d === 4) {
        bass(S, bs, S.T(seg.t), r, S.D(2.4), 0.7);
        bass(S, bs, S.T(seg.t + 2.5), r, S.D(0.45), 0.5);
        bass(S, bs, S.T(seg.t + 3), r + 7 > 52 ? r - 5 : r + 7, S.D(0.9), 0.55);
      } else bass(S, bs, S.T(seg.t), r, S.D(1.9), 0.65);
      const pv = voiceLead(ch, prevPad, 57, 74);
      prevPad = pv;
      pad(S, pd, S.T(seg.t, 0), pv, S.D(seg.d), seg.t >= 16 ? 0.7 : 0.5, { att: 0.9, rel: 1.6, cutoff: 1300 });
    }
    // 두근(lub-dub): 매 2박
    for (let b = 0; b < 32; b += 2) {
      drumTone(S, hb, S.T(b, 0), 0.8, { f0: 110, f1: 62, pd: 0.06, tau: 0.06, amp: 0.8 });
      drumTone(S, hb, S.T(b + 0.42, 0), 0.5, { f0: 100, f1: 58, pd: 0.06, tau: 0.05, amp: 0.8 });
    }
    // 4마디 끝·8마디 끝 글로켄 상행
    for (const [at, cnt] of [[14.5, 4], [29.5, 6]]) {
      const ch = S.chordAt(P, at).ch;
      const tones = voicings(ch, 77, 100)[0];
      for (let i = 0; i < cnt; i++) {
        const m = tones[i % tones.length] + 12 * Math.floor(i / tones.length);
        bell(S, gl, S.T(at + i * 0.25), m, S.v(0.5 - i * 0.04), GLOCK, { amp: 0.15 });
      }
    }
    return S;
  };

  // ---- 노을: C장조/가단조 4/4, 64BPM, 8마디(30초). 나일론 기타 분산화음 + 피아노 멜로디 + 현 패드
  TRACKS.bgm_evening = (opt) => {
    const S = new Song({ bpm: 64, bars: 8, seed: 44, reverb: { sec: 2.6, damp: 0.3 }, ...opt });
    const P = S.prog(['Fmaj7', 'G', 'Em7', 'Am7', 'Dm7', ['G7sus4', 2], ['G7', 2], ['Cmaj7', 2], ['Am7', 2], ['Dm7', 2], ['E7sus4', 1], ['E7', 1]]);
    const mel = S.melody(`
      A5/1.5 G5/.5 E5/1 C5/1        D5/1.5 E5/.5 D5/1 B4/1
      E5/.5 G5/.5 B5/2 A5/.5 G5/.5  A5/2 G5/1 E5/1
      F5/1.5 E5/.5 D5/1 A4/1        C5/1.5 D5/.5 B4/2
      G5/1 E5/1 A5/1.5 C6/.5        D6/1.5 C6/.5 B5/1 G#5/1`);
    const pn = S.bus('piano', { gain: 1.0, pan: 0.12, rev: 0.32 });
    const gt = S.bus('guitar', { gain: 0.51, pan: -0.22, rev: 0.25, eq: [{ type: 'peaking', f: 220, q: 1.2, g: 3 }, { type: 'lowpass', f: 5200 }, { type: 'highpass', f: 70 }] });
    const pd = S.bus('pad', { gain: 0.23, rev: 0.55 });
    const bs = S.bus('bass', { gain: 0.35, rev: 0.05 });
    const GT = { t60: 2.4, bright: 0.36, S: 0.5, pos: 0.13, dur: 3, gain: 0.34, damp: 0.12 };

    for (const n of mel) {
      const vel = S.v(n.d >= 1.5 ? 0.6 : 0.52);
      piano(S, pn, S.T(n.t), n.m, S.D(n.d) + 0.25, vel);
    }
    let prev = null;
    let prevPad = null;
    for (const seg of P) {
      const ch = seg.ch;
      const b = lowest(ch.bass, 40);
      const v = voiceLead(ch, prev, 52, 71);
      prev = v;
      const up = v.length >= 4 ? v : [...v, v[0] + 12];
      const pat = [0, 2, 3, 4, 3, 2, 1, 2];
      const segEnd = S.D(seg.d) + 0.1;
      for (let e = 0; e < seg.d * 2; e++) {
        const beat = seg.t + e * 0.5;
        const pos = Math.round((beat % 4) * 2);
        const k = e === 0 ? 0 : pat[pos] || 1;
        const m = k === 0 ? b : up[k - 1];
        pluck(S, gt, S.T(beat), m, segEnd - e * S.D(0.5), S.v(k === 0 ? 0.85 : 0.55), GT);
      }
      bass(S, bs, S.T(seg.t, 0), lowest(ch.bass, 36), S.D(seg.d) - 0.05, 0.6, { att: 0.04, sus: 0.7, dec: 1.0, cutoff: 380 });
      const pv = voiceLead(ch, prevPad, 55, 72);
      prevPad = pv;
      pad(S, pd, S.T(seg.t, 0), pv, S.D(seg.d), seg.t >= 16 ? 0.7 : 0.5, { att: 1.0, rel: 1.6, cutoff: 1150 });
    }
    return S;
  };

  // ---- 축제: D 요나누키(요 음계 D E G A B) 4/4, 132BPM, 16마디(29초). 시노부에 + 샤미센 + 고토 + 큰북·시메다이코·징
  TRACKS.bgm_festival = (opt) => {
    const S = new Song({ bpm: 132, bars: 16, seed: 55, reverb: { sec: 1.9, damp: 0.3 }, human: 0.004, ...opt });
    const P = S.prog(['D5', 'A5', 'D5', 'G5', 'E5', 'A5', 'D5', 'A5', 'D5', 'G5', 'D5', 'E5', 'A5', 'G5', 'E5', ['A5', 2], ['D5', 2]]);
    const mel = S.melody(`
      A5/.5 B5/.5 D6/1 B5/.5 A5/.5 B5/1      A5/.5 G5/.5 E5/.5 G5/.5 A5/2
      D6/.5 E6/.5 D6/.5 B5/.5 A5/.5 B5/.5 D6/1   B5/.5 A5/.5 G5/.5 E5/.5 D5/2
      E5/.5 G5/.5 A5/1 G5/.5 E5/.5 D5/1      E5/.5 G5/.5 A5/.5 B5/.5 A5/2
      D6/1 B5/.5 D6/.5 E6/1 D6/1             B5/.5 A5/.5 B5/.5 D6/.5 A5/2
      D6/.5 D6/.5 E6/.5 D6/.5 B5/1 A5/1      B5/.5 D6/.5 E6/.5 G6/.5 E6/2
      D6/.5 E6/.5 D6/.5 B5/.5 A5/.5 G5/.5 A5/1   B5/.5 A5/.5 G5/.5 E5/.5 G5/2
      A5/.5 B5/.5 D6/.5 B5/.5 A5/.5 G5/.5 E5/1   G5/.5 A5/.5 B5/.5 D6/.5 E6/2
      D6/.5 B5/.5 A5/.5 B5/.5 G5/.5 E5/.5 G5/1   E5/.5 G5/.5 A5/.5 B5/.5 D6/2`);
    const YO = [2, 4, 7, 9, 11];
    const upper = (m) => {
      let x = m + 1;
      while (!YO.includes(x % 12)) x++;
      return x;
    };
    const fue = S.bus('shinobue', { gain: 0.9, pan: 0.1, rev: 0.28, eq: [{ type: 'peaking', f: 2500, q: 1, g: -2 }] });
    const sm = S.bus('shamisen', { gain: 1.7, pan: -0.3, rev: 0.18, eq: [{ type: 'highpass', f: 120 }, { type: 'peaking', f: 2200, q: 1.2, g: 2 }, { type: 'lowpass', f: 7000 }] });
    const ko = S.bus('koto', { gain: 1.6, pan: 0.3, rev: 0.3, eq: [{ type: 'highpass', f: 150 }] });
    const tk = S.bus('taiko', { gain: 1.0, rev: 0.18, eq: [{ type: 'highpass', f: 55, q: 0.7 }, { type: 'lowpass', f: 3000 }] });
    const shm = S.bus('shime', { gain: 0.9, pan: -0.15, rev: 0.1 });
    const kn = S.bus('kane', { gain: 0.58, pan: 0.28, rev: 0.12 });
    const SHAM = { t60: 0.8, bright: 0.9, S: 0.25, pos: 0.07, dur: 1.3, gain: 0.32, damp: 0.08 };
    const KOTO = { t60: 1.8, bright: 0.6, S: 0.4, pos: 0.12, dur: 2.2, gain: 0.3 };
    const KANE = [
      [1, 1, 0.2],
      [1.47, 0.7, 0.16],
      [2.09, 0.5, 0.12],
      [2.56, 0.35, 0.09],
      [3.23, 0.25, 0.06],
      [4.1, 0.15, 0.04],
    ];

    let gi = 0;
    for (const n of mel) {
      const long = n.d >= 1;
      const o = { breath: 0.26, vib: long ? 0.007 : 0.002, vibRate: 6.3, att: 0.022, rel: 0.045, harm: [0, 1, 0.22, 0.09, 0.03, 0.012] };
      if (long && gi++ % 2 === 0) o.grace = upper(n.m);
      else if (long) o.scoop = 45;
      flute(S, fue, S.T(n.t), n.m, S.D(n.d) * 0.88, S.v(n.t % 1 === 0 ? 0.72 : 0.6), o);
    }
    P.forEach((seg) => {
      const r = lowest(seg.ch.root, 50);
      const f5 = r + 7;
      const pat = seg.d === 4 ? [[0, r, 0.9], [1, r + 12, 0.6], [1.5, f5, 0.55], [2, r, 0.8], [3, r + 12, 0.6], [3.5, f5, 0.6]] : [[0, r, 0.9], [1, r + 12, 0.6], [1.5, f5, 0.55]];
      for (const [x, m, vv] of pat) pluck(S, sm, S.T(seg.t + x), m, S.D(0.45), S.v(vv), SHAM);
      if (seg.t % 8 === 0 || seg.d === 2) [r + 12, r + 19, r + 24].forEach((m, j) => pluck(S, ko, S.T(seg.t) + j * 0.045, m, null, S.v(0.6), KOTO));
    });
    const don = (b, vel) => {
      const t = S.T(b, 0.5);
      drumTone(S, tk, t, vel, { f0: 150, f1: 78, pd: 0.08, tau: 0.15, amp: 0.55 });
      drumTone(S, tk, t, vel, { f0: 240, f1: 165, pd: 0.04, tau: 0.06, amp: 0.3 });
      noiseHit(S, tk, t, vel, { filters: [['lowpass', 900, 0.7]], tau: 0.045, amp: 0.4 });
    };
    const ka = (b, vel) => {
      const t = S.T(b, 0.5);
      drumTone(S, tk, t, vel, { f0: 1100, f1: 900, pd: 0.01, tau: 0.012, amp: 0.18 });
      noiseHit(S, tk, t, vel, { filters: [['bandpass', 2400, 2.5]], tau: 0.012, amp: 0.25 });
    };
    for (let bar = 0; bar < 16; bar++) {
      const B = bar * 4;
      if (bar % 4 === 3) [[0, 1], [1, 0.7], [2, 0.8], [2.5, 0.65], [3, 0.85], [3.5, 0.95]].forEach(([x, v]) => don(B + x, v));
      else {
        [[0, 1], [2, 0.75], [2.5, 0.5]].forEach(([x, v]) => don(B + x, v));
        [[1, 0.5], [3, 0.55], [3.5, 0.4]].forEach(([x, v]) => ka(B + x, v));
      }
      for (const x of [0, 0.5, 1, 1.25, 1.5, 2, 2.5, 3, 3.25, 3.5, 3.75]) {
        const vv = x % 1 === 0 ? 0.8 : x % 0.5 === 0 ? 0.5 : 0.32;
        const t = S.T(B + x, 0.5);
        drumTone(S, shm, t, S.v(vv), { f0: 560, f1: 400, pd: 0.02, tau: 0.04, amp: 0.35 });
        noiseHit(S, shm, t, S.v(vv), { filters: [['bandpass', 1900, 1.4]], tau: 0.018, amp: 0.3 });
      }
      for (let x = 0; x < 4; x++) {
        bell(S, kn, S.T(B + x, 0.4), 0, S.v(x % 2 === 0 ? 0.6 : 0.42), KANE, { freq: 1240, amp: 0.1, decay: 0.9 });
        bell(S, kn, S.T(B + x + 0.5, 0.4), 0, S.v(0.3), KANE, { freq: 1240, amp: 0.1, decay: 0.16 });
        bell(S, kn, S.T(B + x + 0.75, 0.4), 0, S.v(0.25), KANE, { freq: 1240, amp: 0.1, decay: 0.16 });
      }
    }
    return S;
  };

  // ---- 고백: E장조 4/4, 64BPM, 8마디(30초). 피아노(왼손 분산화음 + 오른손 멜로디) + 아주 옅은 현
  TRACKS.bgm_confession = (opt) => {
    const S = new Song({ bpm: 64, bars: 8, seed: 66, reverb: { sec: 3.2, damp: 0.42 }, ...opt });
    const P = S.prog(['E', 'B/D#', 'C#m7', 'G#m7', 'Amaj7', 'E/G#', 'F#m7', ['B7sus4', 2], ['B7', 2]]);
    const mel = S.melody(`
      B5/1.5 G#5/.5 E5/1 F#5/.5 G#5/.5     F#5/1.5 D#5/.5 B4/2
      E5/.5 G#5/.5 C#6/2 B5/1              D#6/1.5 C#6/.5 B5/1 F#5/1
      E5/.5 A5/.5 C#6/2 B5/.5 A5/.5        G#5/1.5 B5/.5 E6/2
      C#6/1.5 B5/.5 A5/1 F#5/1             E5/1.5 F#5/.5 D#5/1 F#5/.5 A5/.5`);
    const rh = S.bus('pianoRH', { gain: 1.0, pan: 0.12, rev: 0.36 });
    const lh = S.bus('pianoLH', { gain: 1.36, pan: -0.12, rev: 0.36 });
    const st = S.bus('strings', { gain: 0.29, rev: 0.6 });
    for (const n of mel) {
      const bar = Math.floor(n.t / 4);
      const vel = S.v((n.d >= 1.5 ? 0.62 : 0.54) + (bar === 5 ? 0.06 : 0), 0.06);
      piano(S, rh, S.T(n.t), n.m, S.D(n.d) + 0.35, vel, { sustain: 1.1, bright: 0.72 });
    }
    let prev = null;
    for (const seg of P) {
      const ch = seg.ch;
      const b = lowest(ch.bass, 36);
      const v = voiceLead(ch, prev, Math.max(52, b + 5), 71);
      prev = v;
      const up = v.length >= 4 ? v : [...v, v[0] + 12];
      const pat = [0, 1, 2, 3, 4, 3, 2, 1];
      const pedalEnd = S.D(seg.d) + 0.2;
      for (let e = 0; e < seg.d * 2; e++) {
        const beat = seg.t + e * 0.5;
        const pos = Math.round((beat % 4) * 2);
        const k = e === 0 ? 0 : pat[pos] || 1;
        const m = k === 0 ? b : up[k - 1];
        piano(S, lh, S.T(beat), m, pedalEnd - e * S.D(0.5), S.v(k === 0 ? 0.5 : 0.36, 0.08), { bright: 0.35 });
      }
      pad(S, st, S.T(seg.t, 0), voiceLead(ch, null, 59, 76), S.D(seg.d), seg.t >= 16 ? 0.6 : 0.28, { att: 1.2, rel: 1.8, cutoff: 1400, detunes: [-5, 5] });
    }
    return S;
  };

  // ===================================================================== SFX (모노)
  const sfx = (duration, seed, reverb, opt) => new Song({ loop: false, channels: 1, duration, seed, reverb, ...opt });

  TRACKS.sfx_select = (opt) => {
    const S = sfx(0.42, 101, { sec: 0.5, damp: 0.3 }, opt);
    const b = S.bus('blip', { gain: 1, rev: 0.12 });
    [[0.004, 88, 0.07, 0.8], [0.058, 95, 0.12, 1]].forEach(([t, m, tau, vel]) => {
      bell(S, b, t, m, vel, [[1, 1, tau], [2, 0.18, tau * 0.5], [3, 0.08, tau * 0.3]], { amp: 0.4, att: 0.003 });
    });
    return S;
  };

  TRACKS.sfx_bell = (opt) => {
    // 학교 차임: 미–도–레–솔(낮은)
    const S = sfx(6.0, 102, { sec: 2.0, damp: 0.4, hp: 250 }, opt);
    const b = S.bus('chime', { gain: 1, rev: 0.32, eq: [{ type: 'highpass', f: 260, q: 0.7 }, { type: 'peaking', f: 2300, q: 0.8, g: 3 }, { type: 'lowpass', f: 6500, q: 0.6 }] });
    const trem = S.ctx.createGain();
    trem.gain.value = 0.88;
    const lfo = S.ctx.createOscillator();
    lfo.frequency.value = 4.6;
    const lg = S.ctx.createGain();
    lg.gain.value = 0.12;
    lfo.connect(lg).connect(trem.gain);
    lfo.start(0);
    lfo.stop(6);
    trem.connect(b);
    const CHIME = [
      [1, 1, 1.5],
      [2.0, 0.32, 0.8],
      [3.0, 0.1, 0.4],
      [4.16, 0.12, 0.22],
      [5.43, 0.07, 0.12],
      [6.8, 0.04, 0.06],
    ];
    ['E5', 'C5', 'D5', 'G4'].forEach((n, i) => {
      const t = 0.01 + i * 0.85;
      bell(S, trem, t, midi(n), i === 3 ? 0.95 : 0.85, CHIME, { amp: 0.3, att: 0.004, decay: i === 3 ? 1.25 : 1 });
      noiseHit(S, trem, t, 0.6, { filters: [['bandpass', 3200, 2]], tau: 0.01, amp: 0.15 });
    });
    S.master.gain.setValueAtTime(1, 5.3);
    S.master.gain.linearRampToValueAtTime(0, 6.0);
    return S;
  };

  TRACKS.sfx_door = (opt) => {
    // 교실 미닫이문: 바퀴가 레일을 구르는 드르륵 + 끝에서 문틀에 닿는 탁
    const S = sfx(1.4, 103, { sec: 0.45, damp: 0.25 }, opt);
    const b = S.bus('door', { gain: 1, rev: 0.18 });
    const ctx = S.ctx;
    const r = mulberry32(5);
    const slideEnd = 0.74;
    const n = 600;
    const env = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = (i / (n - 1)) * slideEnd;
      const e = Math.min(1, t / 0.06) * (t > slideEnd - 0.08 ? Math.max(0.35, (slideEnd - t) / 0.08) : 1) * (0.75 + 0.35 * (t / slideEnd));
      const rough = 0.55 + 0.45 * Math.abs(Math.sin(t * 2 * Math.PI * 34 + r() * 0.6)) + (r() < 0.04 ? 0.6 : 0);
      env[i] = e * rough;
    }
    const roll = S.noiseSrc(0, slideEnd + 0.02);
    const rb = biq(S, 'bandpass', 650, 0.9);
    const rg = ctx.createGain();
    rg.gain.setValueCurveAtTime(env.map((x) => x * 1.3), 0, slideEnd);
    roll.connect(rb).connect(rg).connect(b);
    const rum = S.noiseSrc(0, slideEnd + 0.02);
    const rl = biq(S, 'lowpass', 200, 0.8);
    const rmg = ctx.createGain();
    rmg.gain.setValueCurveAtTime(env.map((x) => x * 2.0), 0, slideEnd);
    rum.connect(rl).connect(rmg).connect(b);
    const gl = S.noiseSrc(0, slideEnd + 0.02);
    const gb = biq(S, 'bandpass', 3300, 4);
    const gg = ctx.createGain();
    gg.gain.setValueCurveAtTime(env.map((x) => x * x * 0.25), 0, slideEnd);
    gl.connect(gb).connect(gg).connect(b);
    // 레일 이음매 딸깍
    for (const t of [0.16, 0.33, 0.5, 0.64]) noiseHit(S, b, t, 0.5, { filters: [['bandpass', 1500, 3]], tau: 0.006, amp: 0.7 });
    // 문틀에 닿는 소리
    const hit = slideEnd + 0.01;
    drumTone(S, b, hit, 0.7, { f0: 150, f1: 85, pd: 0.05, tau: 0.06, amp: 1.0 });
    noiseHit(S, b, hit, 0.7, { filters: [['bandpass', 420, 5]], tau: 0.06, amp: 1.2 });
    noiseHit(S, b, hit, 0.7, { filters: [['bandpass', 1250, 5]], tau: 0.035, amp: 0.6 });
    noiseHit(S, b, hit + 0.004, 0.8, { filters: [['bandpass', 4200, 3]], tau: 0.05, amp: 0.12, hold: 0.04 });
    drumTone(S, b, hit + 0.09, 0.35, { f0: 140, f1: 90, pd: 0.04, tau: 0.04, amp: 0.6 });
    return S;
  };

  TRACKS.sfx_rain = (opt) => {
    // 소나기 3.6초: 넓은 쏴아 + 잔물방울, 앞뒤 페이드
    const D = 3.6;
    const S = sfx(D, 104, { sec: 0.9, damp: 0.3 }, opt);
    const b = S.bus('rain', { gain: 1, rev: 0.2 });
    const ctx = S.ctx;
    const bed = S.noiseSrc(0, D);
    const h = biq(S, 'highpass', 500, 0.6);
    const l = biq(S, 'lowpass', 7500, 0.6);
    const bg = ctx.createGain();
    bg.gain.value = 0.35;
    bed.connect(h).connect(l).connect(bg).connect(b);
    const bed2 = S.noiseSrc(0, D);
    const bp2 = biq(S, 'bandpass', 1800, 0.6);
    const bg2 = ctx.createGain();
    const n = 128;
    const mod = new Float32Array(n);
    const rr = mulberry32(44);
    let w = 0.5;
    for (let i = 0; i < n; i++) {
      w += (rr() - 0.5) * 0.25;
      w = clamp(w, 0.2, 0.9);
      mod[i] = 0.3 * w;
    }
    bg2.gain.setValueCurveAtTime(mod, 0, D);
    bed2.connect(bp2).connect(bg2).connect(b);
    const rum = S.noiseSrc(0, D);
    const rl = biq(S, 'lowpass', 180, 0.7);
    const rg = ctx.createGain();
    rg.gain.value = 0.35;
    rum.connect(rl).connect(rg).connect(b);
    const r = mulberry32(99);
    for (let i = 0; i < 260; i++) {
      const t = r() * (D - 0.05);
      const f = 1800 + r() * 3600;
      const a = 0.04 + Math.pow(r(), 3) * 0.3;
      const os = ctx.createOscillator();
      os.frequency.setValueAtTime(f, t);
      os.frequency.exponentialRampToValueAtTime(f * 0.7, t + 0.015);
      const g = ctx.createGain();
      const end = hitEnv(g.gain, t, a, 0.0008, 0.003 + r() * 0.004);
      os.connect(g).connect(b);
      os.start(t);
      os.stop(end);
      if (r() < 0.35) noiseHit(S, b, t, 1, { filters: [['bandpass', 900 + r() * 1500, 2]], tau: 0.004, amp: a * 0.8 });
    }
    S.master.gain.setValueAtTime(0, 0);
    S.master.gain.linearRampToValueAtTime(1, 0.7);
    S.master.gain.setValueAtTime(1, D - 0.9);
    S.master.gain.linearRampToValueAtTime(0, D);
    return S;
  };

  TRACKS.sfx_camera = (opt) => {
    // 즉석카메라: 버튼 딸깍 → 셔터 찰칵 → 필름 배출 모터 지이잉 → 딸깍
    const S = sfx(1.4, 105, { sec: 0.35, damp: 0.25 }, opt);
    const b = S.bus('cam', { gain: 1, rev: 0.12 });
    const ctx = S.ctx;
    noiseHit(S, b, 0.005, 0.5, { filters: [['highpass', 2500, 0.7]], tau: 0.003, amp: 0.5 });
    drumTone(S, b, 0.005, 0.4, { f0: 2600, tau: 0.008, amp: 0.15 });
    noiseHit(S, b, 0.06, 1, { filters: [['bandpass', 3400, 1.8]], tau: 0.007, amp: 1.0 });
    drumTone(S, b, 0.06, 1, { f0: 320, f1: 170, pd: 0.02, tau: 0.018, amp: 0.6 });
    noiseHit(S, b, 0.105, 0.9, { filters: [['bandpass', 5200, 1.5]], tau: 0.012, amp: 0.8 });
    drumTone(S, b, 0.105, 0.6, { f0: 4100, tau: 0.02, amp: 0.12 });
    drumTone(S, b, 0.105, 0.6, { f0: 240, f1: 150, pd: 0.02, tau: 0.02, amp: 0.4 });
    // 모터
    const t0 = 0.3;
    const t1 = 1.12;
    const mo = ctx.createOscillator();
    mo.type = 'sawtooth';
    mo.frequency.setValueAtTime(110, t0);
    mo.frequency.linearRampToValueAtTime(165, t0 + 0.08);
    mo.frequency.linearRampToValueAtTime(172, t1 - 0.1);
    mo.frequency.linearRampToValueAtTime(100, t1);
    const wob = ctx.createOscillator();
    wob.frequency.value = 13;
    const wg = ctx.createGain();
    wg.gain.value = 5;
    wob.connect(wg).connect(mo.frequency);
    const mbp = biq(S, 'bandpass', 1300, 1.1);
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(0, t0);
    mg.gain.linearRampToValueAtTime(0.6, t0 + 0.05);
    mg.gain.setValueAtTime(0.6, t1 - 0.1);
    mg.gain.linearRampToValueAtTime(0, t1);
    mo.connect(mbp).connect(mg).connect(b);
    mo.start(t0);
    mo.stop(t1 + 0.01);
    wob.start(t0);
    wob.stop(t1 + 0.01);
    const gear = S.noiseSrc(t0, t1 - t0);
    const gbp = biq(S, 'bandpass', 2600, 2.5);
    const am = ctx.createGain();
    am.gain.value = 0;
    const amo = ctx.createOscillator();
    amo.type = 'square';
    amo.frequency.value = 78;
    const amg = ctx.createGain();
    amg.gain.value = 0.5;
    amo.connect(amg).connect(am.gain);
    const gg = ctx.createGain();
    gg.gain.setValueAtTime(0, t0);
    gg.gain.linearRampToValueAtTime(0.4, t0 + 0.05);
    gg.gain.setValueAtTime(0.4, t1 - 0.1);
    gg.gain.linearRampToValueAtTime(0, t1);
    gear.connect(gbp).connect(am).connect(gg).connect(b);
    amo.start(t0);
    amo.stop(t1);
    noiseHit(S, b, 1.16, 0.6, { filters: [['bandpass', 2800, 2]], tau: 0.006, amp: 0.55 });
    drumTone(S, b, 1.16, 0.5, { f0: 260, f1: 180, pd: 0.02, tau: 0.015, amp: 0.3 });
    return S;
  };

  TRACKS.sfx_firework = (opt) => {
    // 휘이익(올라감) → 펑 → 메아리와 타닥타닥
    const D = 4.4;
    const S = sfx(D, 106, { sec: 2.6, damp: 0.3, hp: 120 }, opt);
    const ctx = S.ctx;
    const wb = S.bus('whistle', { gain: 0.75, rev: 0.25 });
    const bb = S.bus('boom', { gain: 1, rev: 0.35 });
    const cb = S.bus('crackle', { gain: 0.6, rev: 0.4 });
    const echo = ctx.createDelay(1);
    echo.delayTime.value = 0.42;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const el = biq(S, 'lowpass', 1400, 0.6);
    bb.connect(echo);
    echo.connect(el).connect(fb).connect(echo);
    const eo = ctx.createGain();
    eo.gain.value = 0.45;
    el.connect(eo).connect(S.master);
    const w0 = 0.02;
    const w1 = 1.3;
    const os = ctx.createOscillator();
    os.frequency.setValueAtTime(700, w0);
    os.frequency.exponentialRampToValueAtTime(2300, w1);
    const vib = ctx.createOscillator();
    vib.frequency.value = 9;
    const vg = ctx.createGain();
    vg.gain.setValueAtTime(0, w0);
    vg.gain.linearRampToValueAtTime(40, w1);
    vib.connect(vg).connect(os.frequency);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0, w0);
    og.gain.linearRampToValueAtTime(0.22, w0 + 0.2);
    og.gain.linearRampToValueAtTime(0.28, w1 - 0.25);
    og.gain.linearRampToValueAtTime(0, w1);
    os.connect(og).connect(wb);
    os.start(w0);
    os.stop(w1 + 0.01);
    vib.start(w0);
    vib.stop(w1 + 0.01);
    const hiss = S.noiseSrc(w0, w1 - w0);
    const hb = biq(S, 'bandpass', 700, 5);
    hb.frequency.setValueAtTime(700, w0);
    hb.frequency.exponentialRampToValueAtTime(2300, w1);
    const hg = ctx.createGain();
    hg.gain.setValueAtTime(0, w0);
    hg.gain.linearRampToValueAtTime(0.25, w0 + 0.15);
    hg.gain.linearRampToValueAtTime(0, w1);
    hiss.connect(hb).connect(hg).connect(wb);
    noiseHit(S, wb, w0, 1, { filters: [['lowpass', 1200, 0.7]], att: 0.02, tau: 0.12, amp: 0.25 });
    // 펑
    const tb = 1.45;
    drumTone(S, bb, tb, 1, { f0: 85, f1: 32, pd: 0.3, tau: 0.32, amp: 1.0, att: 0.003 });
    noiseHit(S, bb, tb, 1, { filters: [['lowpass', 900, 0.7]], att: 0.004, tau: 0.3, amp: 1.1 });
    noiseHit(S, bb, tb, 1, { filters: [['bandpass', 2300, 0.9]], att: 0.002, tau: 0.05, amp: 0.55 });
    // 타닥타닥
    const r = mulberry32(31);
    for (let i = 0; i < 80; i++) {
      const u = Math.pow(r(), 1.6);
      const t = tb + 0.18 + u * 2.3;
      const a = (0.08 + r() * 0.3) * (1 - u * 0.7);
      noiseHit(S, cb, t, 1, { filters: [['highpass', 2500 + r() * 3000, 0.8]], tau: 0.002 + r() * 0.004, amp: a });
    }
    S.master.gain.setValueAtTime(1, D - 0.5);
    S.master.gain.linearRampToValueAtTime(0, D);
    return S;
  };

  TRACKS.sfx_message = (opt) => {
    const S = sfx(0.9, 107, { sec: 0.6, damp: 0.3 }, opt);
    const b = S.bus('msg', { gain: 1, rev: 0.15 });
    [[0.005, 88, 0.12], [0.095, 92, 0.12], [0.185, 95, 0.3]].forEach(([t, m, tau]) => {
      bell(S, b, t, m, 1, [[1, 1, tau], [2, 0.2, tau * 0.5], [3, 0.1, tau * 0.3], [4.2, 0.05, 0.02]], { amp: 0.35, att: 0.003 });
    });
    return S;
  };

  TRACKS.sfx_sparkle = (opt) => {
    const S = sfx(1.7, 108, { sec: 1.6, damp: 0.45 }, opt);
    const b = S.bus('sparkle', { gain: 1, rev: 0.45 });
    const ctx = S.ctx;
    const notes = ['E6', 'F#6', 'G#6', 'B6', 'C#7', 'E7', 'F#7', 'G#7', 'B7'].map(midi);
    notes.forEach((m, i) => bell(S, b, 0.01 + i * 0.032, m, 0.55 + i * 0.05, GLOCK, { amp: 0.16, decay: 0.8 - i * 0.05 }));
    [[0.42, 'B7'], [0.58, 'E7'], [0.72, 'G#7']].forEach(([t, n]) => bell(S, b, t, midi(n), 0.4, GLOCK, { amp: 0.14, decay: 0.6 }));
    const sh = S.noiseSrc(0, 1.2);
    const hp = biq(S, 'highpass', 7500, 0.7);
    const am = ctx.createGain();
    am.gain.value = 0.5;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 23;
    const lg = ctx.createGain();
    lg.gain.value = 0.5;
    lfo.connect(lg).connect(am.gain);
    lfo.start(0);
    lfo.stop(1.2);
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0, 0);
    sg.gain.linearRampToValueAtTime(0.12, 0.25);
    sg.gain.linearRampToValueAtTime(0, 1.1);
    sh.connect(hp).connect(am).connect(sg).connect(b);
    const sw = ctx.createOscillator();
    sw.frequency.setValueAtTime(1300, 0);
    sw.frequency.exponentialRampToValueAtTime(5200, 0.28);
    const swg = ctx.createGain();
    swg.gain.setValueAtTime(0, 0);
    swg.gain.linearRampToValueAtTime(0.05, 0.05);
    swg.gain.linearRampToValueAtTime(0, 0.3);
    sw.connect(swg).connect(b);
    sw.start(0);
    sw.stop(0.31);
    return S;
  };

  TRACKS.sfx_footsteps = (opt) => {
    // 달려오는 발소리: 멀리서(작고 어둡게) → 가까이(크고 밝게), 마지막에 멈춰 서며 끌림
    const S = sfx(2.5, 109, { sec: 0.6, damp: 0.3 }, opt);
    const ctx = S.ctx;
    const b = S.bus('steps', { gain: 1, rev: 0.16 });
    const lp = biq(S, 'lowpass', 1500, 0.6);
    lp.frequency.setValueAtTime(1300, 0);
    lp.frequency.exponentialRampToValueAtTime(7000, 1.9);
    lp.connect(b);
    const r = mulberry32(17);
    const steps = 9;
    for (let k = 0; k < steps; k++) {
      const t = 0.03 + k * 0.205 + (r() - 0.5) * 0.02;
      const x = k / (steps - 1);
      const L = 0.22 + 0.78 * Math.pow(x, 1.3);
      const foot = k % 2 === 0 ? 1 : 0.92;
      drumTone(S, lp, t, L, { f0: 125 * foot, f1: 58, pd: 0.03, tau: 0.032, amp: 0.95 });
      noiseHit(S, lp, t, L, { filters: [['bandpass', 1700 * foot, 1.2]], tau: 0.012, amp: 0.55 });
      noiseHit(S, lp, t + 0.028, L, { filters: [['bandpass', 2600, 1.5]], tau: 0.008, amp: 0.3 });
      if (k === steps - 1) {
        drumTone(S, lp, t + 0.12, 1, { f0: 110, f1: 55, pd: 0.03, tau: 0.04, amp: 0.8 });
        noiseHit(S, lp, t + 0.12, 1, { filters: [['bandpass', 1500, 0.9]], att: 0.01, hold: 0.08, tau: 0.05, amp: 0.25 });
      }
    }
    return S;
  };

  TRACKS.sfx_cat = (opt) => {
    // '냐-': 성대 펄스(배음이 많은 파형) + 3개 포먼트(n → ya → a → 약간 닫힘) + 피치 곡선
    const D = 0.9;
    const S = sfx(D, 110, { sec: 0.4, damp: 0.3 }, opt);
    const ctx = S.ctx;
    const b = S.bus('cat', { gain: 1, rev: 0.1 });
    const harm = [0];
    for (let k = 1; k <= 40; k++) harm.push(Math.pow(k, -0.9));
    const src = ctx.createOscillator();
    src.setPeriodicWave(S.wave('glottal', harm));
    const T = 0.84;
    src.frequency.setValueCurveAtTime(curve([[0, 430], [0.06, 520], [0.17, 700], [0.32, 790], [0.5, 720], [0.7, 540], [T, 440]]), 0, T);
    const vib = ctx.createOscillator();
    vib.frequency.value = 7;
    const vg = ctx.createGain();
    vg.gain.value = 9;
    vib.connect(vg).connect(src.detune);
    const amp = ctx.createGain();
    amp.gain.setValueCurveAtTime(curve([[0, 0], [0.03, 0.3], [0.08, 0.35], [0.16, 1], [0.45, 0.9], [0.68, 0.45], [T, 0]]), 0, T);
    src.connect(amp);
    const form = [
      [[[0, 320], [0.07, 360], [0.17, 1050], [0.55, 980], [T, 650]], 7, 1.0],
      [[[0, 1700], [0.07, 2600], [0.18, 1850], [0.55, 1750], [T, 1350]], 9, 0.55],
      [[[0, 3200], [0.07, 3600], [0.18, 3300], [T, 3000]], 11, 0.25],
    ];
    for (const [pts, q, g] of form) {
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = q;
      f.frequency.setValueCurveAtTime(curve(pts), 0, T);
      const fg = ctx.createGain();
      fg.gain.value = g;
      amp.connect(f).connect(fg).connect(b);
    }
    // 'n' 비음
    const nl = biq(S, 'lowpass', 700, 0.7);
    const ng = ctx.createGain();
    ng.gain.setValueCurveAtTime(curve([[0, 0], [0.03, 0.12], [0.09, 0.1], [0.16, 0], [T, 0]]), 0, T);
    src.connect(nl).connect(ng).connect(b);
    const br = S.noiseSrc(0, T);
    const bbp = biq(S, 'bandpass', 2500, 1);
    const bg = ctx.createGain();
    bg.gain.setValueCurveAtTime(curve([[0, 0], [0.15, 0.025], [0.6, 0.02], [T, 0]]), 0, T);
    br.connect(bbp).connect(bg).connect(b);
    src.start(0);
    src.stop(T + 0.01);
    vib.start(0.25);
    vib.stop(T + 0.01);
    return S;
  };

  globalThis.__PH_AUDIO = {
    ids: Object.keys(TRACKS),
    async render(id, opt = {}) {
      const make = TRACKS[id];
      if (!make) throw new Error('unknown track ' + id);
      const S = make(opt);
      return S.render();
    },
    async decodeLength(b64) {
      const bin = atob(b64);
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const ctx = new OfflineAudioContext(1, 1, SR);
      const buf = await ctx.decodeAudioData(u8.buffer);
      return { length: buf.length, sampleRate: buf.sampleRate };
    },
  };
}

// ===========================================================================
// Node 쪽: 후처리(루프 접기·음량·리미터), WAV/MP3, 검사
// ===========================================================================
const dbToLin = (db) => Math.pow(10, db / 20);
const linToDb = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity);

function f32FromB64(s) {
  const b = Buffer.from(s, 'base64');
  return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
}
function peakOf(chs) {
  let p = 0;
  for (const c of chs) for (let i = 0; i < c.length; i++) p = Math.max(p, Math.abs(c[i]));
  return p;
}
function rmsOf(chs) {
  let s = 0;
  let n = 0;
  for (const c of chs) {
    for (let i = 0; i < c.length; i++) s += c[i] * c[i];
    n += c.length;
  }
  return Math.sqrt(s / Math.max(1, n));
}
function scale(chs, g) {
  for (const c of chs) for (let i = 0; i < c.length; i++) c[i] *= g;
}

/** 원형 버퍼: 루프 길이를 넘친 잔향을 앞으로 접어 넣는다 */
function wrapLoop(chs, loopN) {
  return chs.map((c) => {
    const out = new Float32Array(loopN);
    for (let i = 0; i < c.length; i++) out[i % loopN] += c[i];
    return out;
  });
}

/**
 * 룩어헤드 피크 리미터(스테레오 연동). 게인은 "앞으로 LA 샘플 최소값" → 릴리스 → LA 길이 상자 평균으로 만들어
 * 어떤 샘플에서도 ceiling 을 넘지 않는다. circular=true 면 루프 경계를 이어서 처리한다.
 */
function limit(chs, ceilDb, { lookMs = 4, relMs = 150, circular = false } = {}) {
  const ceil = dbToLin(ceilDb);
  const n = chs[0].length;
  const LA = Math.max(1, Math.round(lookMs * 1e-3 * SR));
  const tg = new Float32Array(n);
  let any = false;
  for (let i = 0; i < n; i++) {
    let p = 0;
    for (const c of chs) p = Math.max(p, Math.abs(c[i]));
    tg[i] = p > ceil ? ceil / p : 1;
    if (tg[i] < 1) any = true;
  }
  if (!any) return 0;
  const at = (i) => (circular ? tg[((i % n) + n) % n] : i < n ? tg[i] : 1);
  const h = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let m = 1;
    for (let k = 0; k <= LA; k++) m = Math.min(m, at(i + k));
    h[i] = m;
  }
  const rel = Math.exp(-1 / (relMs * 1e-3 * SR));
  const h2 = new Float32Array(n);
  let st = 1;
  for (let pass = 0; pass < (circular ? 2 : 1); pass++) {
    for (let i = 0; i < n; i++) {
      st = Math.min(h[i], 1 - (1 - st) * rel);
      h2[i] = st;
    }
  }
  const g = new Float32Array(n);
  let sum = 0;
  const get = (i) => (circular ? h2[((i % n) + n) % n] : i >= 0 ? h2[i] : 1);
  for (let k = -LA + 1; k <= 0; k++) sum += get(k);
  let minG = 1;
  for (let i = 0; i < n; i++) {
    g[i] = sum / LA;
    minG = Math.min(minG, g[i]);
    sum += get(i + 1) - get(i - LA + 1);
  }
  for (const c of chs) for (let i = 0; i < n; i++) c[i] *= g[i];
  // 부동소수 오차 안전장치
  for (const c of chs) for (let i = 0; i < n; i++) if (Math.abs(c[i]) > ceil) c[i] = Math.sign(c[i]) * ceil;
  return linToDb(minG);
}

function master(raw, spec, ceilDb, rmsAdj = 0) {
  let chs = raw.map((c) => Float32Array.from(c));
  let gr = 0;
  if (spec.kind === 'bgm') {
    chs = wrapLoop(chs, spec.loopSamples);
    for (let it = 0; it < 4; it++) {
      const rms = rmsOf(chs);
      scale(chs, dbToLin(BGM_RMS_DB + rmsAdj - linToDb(rms)));
      gr = limit(chs, ceilDb, { circular: true });
      if (Math.abs(linToDb(rmsOf(chs)) - BGM_RMS_DB - rmsAdj) < 0.1) break;
    }
  } else {
    const n = chs[0].length;
    const fade = Math.floor(0.03 * SR);
    for (const c of chs) for (let i = 0; i < fade; i++) c[n - 1 - i] *= i / fade;
    let g = dbToLin(spec.peakDb) / peakOf(chs);
    if (spec.rmsDb != null) g = Math.min(g, dbToLin(spec.rmsDb) / rmsOf(chs));
    scale(chs, g);
    gr = limit(chs, Math.min(ceilDb, spec.peakDb), { circular: false });
  }
  return { chs, gr };
}

function wavF32(chs) {
  const nch = chs.length;
  const n = chs[0].length;
  const data = n * nch * 4;
  const b = Buffer.alloc(44 + data);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + data, 4);
  b.write('WAVE', 8);
  b.write('fmt ', 12);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(3, 20);
  b.writeUInt16LE(nch, 22);
  b.writeUInt32LE(SR, 24);
  b.writeUInt32LE(SR * nch * 4, 28);
  b.writeUInt16LE(nch * 4, 32);
  b.writeUInt16LE(32, 34);
  b.write('data', 36);
  b.writeUInt32LE(data, 40);
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < nch; c++, o += 4) b.writeFloatLE(chs[c][i], o);
  return b;
}

function encode(wav, mp3, nch, kbps) {
  execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-i', wav, '-map_metadata', '-1', '-id3v2_version', '0', '-write_xing', '1',
    '-c:a', 'libmp3lame', '-b:a', `${kbps}k`, '-ar', String(SR), '-ac', String(nch), mp3]);
}
function decode(mp3, nch) {
  const out = execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-i', mp3, '-f', 'f32le', '-ac', String(nch), '-ar', String(SR), 'pipe:1'], { maxBuffer: 1 << 30 });
  const all = new Float32Array(out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength));
  const n = all.length / nch;
  const chs = Array.from({ length: nch }, () => new Float32Array(n));
  for (let i = 0; i < n; i++) for (let c = 0; c < nch; c++) chs[c][i] = all[i * nch + c];
  return chs;
}
function probe(mp3) {
  const j = JSON.parse(execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration,bit_rate:stream=channels,sample_rate,bit_rate,codec_name', '-of', 'json', mp3]).toString());
  const s = j.streams[0];
  return { codec: s.codec_name, channels: s.channels, sampleRate: Number(s.sample_rate), bitRate: Number(s.bit_rate || j.format.bit_rate), duration: Number(j.format.duration) };
}
/** 루프 이음매: 끝→처음 한 샘플 차이를 곡 전체 평균 기울기와 비교 */
function seamRatio(chs) {
  let worst = 0;
  for (const c of chs) {
    const n = c.length;
    let s = 0;
    for (let i = 1; i < n; i++) s += Math.abs(c[i] - c[i - 1]);
    const mean = s / (n - 1);
    worst = Math.max(worst, Math.abs(c[0] - c[n - 1]) / Math.max(1e-9, mean));
  }
  return worst;
}

function fmtKB(n) {
  return (n / 1024).toFixed(1) + ' KB';
}

async function main() {
  const args = process.argv.slice(2);
  const stems = args.includes('--stems');
  const previewArg = args.find((a) => a.startsWith('--preview='));
  const previewDir = previewArg ? previewArg.slice('--preview='.length) : null;
  const ids = args.filter((a) => !a.startsWith('--'));
  const list = ids.length ? ids : Object.keys(SPECS);
  for (const id of list) if (!SPECS[id]) throw new Error(`알 수 없는 id: ${id} (가능: ${Object.keys(SPECS).join(', ')})`);
  if (!existsSync(FFMPEG)) throw new Error(`ffmpeg 를 찾을 수 없음: ${FFMPEG} (FFMPEG 환경변수로 지정)`);
  mkdirSync(OUT_DIR, { recursive: true });
  if (previewDir) mkdirSync(previewDir, { recursive: true });
  const tmp = mkdtempSync(join(tmpdir(), 'ph-audio-'));
  const browser = await chromium.launch();
  const rows = [];
  try {
    const page = await browser.newPage();
    await page.evaluate(browserLib);
    for (const id of list) {
      const spec = { ...SPECS[id] };
      const t0 = Date.now();
      if (stems) {
        const r = await page.evaluate(([i]) => globalThis.__PH_AUDIO.render(i, { stems: true }), [id]);
        const ref = linToDb(r.mixRmsA);
        console.log(`\n${id}  (잔향 뺀 전체 믹스 기준, A 가중 RMS / 피크 상대 dB)`);
        for (const st of r.stems) console.log(`  ${st.name.padEnd(12)} ${(linToDb(st.rmsA) - ref).toFixed(1).padStart(6)} dB(A)   peak ${(linToDb(st.peak) - ref).toFixed(1).padStart(6)} dB`);
        continue;
      }
      const r = await page.evaluate(([i]) => globalThis.__PH_AUDIO.render(i, {}), [id]);
      const raw = r.channels.map(f32FromB64);
      spec.loopSamples = r.loopSamples;
      const nch = spec.kind === 'bgm' ? 2 : 1;
      const kbps = spec.kind === 'bgm' ? BGM_KBPS : SFX_KBPS;
      const wav = join(tmp, `${id}.wav`);
      const mp3 = join(OUT_DIR, `${id}.mp3`);
      let ceil = -1.5;
      let rmsAdj = 0;
      let st = null;
      for (let attempt = 0; attempt < 6; attempt++) {
        const { chs, gr } = master(raw, spec, ceil, rmsAdj);
        writeFileSync(wav, wavF32(chs));
        encode(wav, mp3, nch, kbps);
        unlinkSync(wav);
        const dec = decode(mp3, nch);
        st = { peak: linToDb(peakOf(dec)), rms: linToDb(rmsOf(dec)), samples: dec[0].length, expect: chs[0].length, gr, seam: spec.kind === 'bgm' ? seamRatio(dec) : null };
        // MP3 는 고역을 조금 깎아 RMS 가 0.3~0.5dB 낮아지고, 피크는 조금 넘칠 수 있다 → 보정 후 다시 인코딩
        const rmsOff = spec.kind === 'bgm' ? BGM_RMS_DB - st.rms : 0;
        const peakOk = st.peak <= PEAK_LIMIT_DB - 0.05;
        if (peakOk && Math.abs(rmsOff) <= 0.2) break;
        if (!peakOk) ceil -= st.peak - PEAK_LIMIT_DB + 0.15;
        if (Math.abs(rmsOff) > 0.2) rmsAdj += rmsOff;
      }
      const pr = probe(mp3);
      const size = statSync(mp3).size;
      rows.push({ id, kind: spec.kind, ...pr, size, ...st, ms: Date.now() - t0 });
      console.log(`${id.padEnd(15)} ${pr.duration.toFixed(2).padStart(6)}s ${pr.channels}ch ${(pr.bitRate / 1000).toFixed(0)}kbps ${fmtKB(size).padStart(9)}  peak ${st.peak.toFixed(2)} dBFS  RMS ${st.rms.toFixed(1)} dBFS  limiter ${st.gr.toFixed(1)} dB${st.seam != null ? `  seam ${st.seam.toFixed(2)}` : ''}  samples ${st.samples}/${st.expect}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
      if (previewDir) {
        const png = join(previewDir, `wave_${id}.png`);
        execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-i', mp3, '-filter_complex', `showwavespic=s=1200x${nch === 2 ? 260 : 160}:split_channels=1:colors=0x2f6fd0|0xd0602f`, '-frames:v', '1', png]);
      }
    }
    if (!stems && rows.length) {
      // Chromium decodeAudioData 로 길이 확인(갭리스 처리 여부 = 루프 이음매에 무음이 끼는지)
      for (const row of rows) {
        const b64 = readFileSync(join(OUT_DIR, `${row.id}.mp3`)).toString('base64');
        const d = await page.evaluate(([b]) => globalThis.__PH_AUDIO.decodeLength(b), [b64]);
        row.chromeSamples = d.length;
      }
      const bad = rows.filter((r) => r.kind === 'bgm' && r.chromeSamples !== r.expect);
      console.log('\nChromium decodeAudioData 길이: ' + rows.map((r) => `${r.id}=${r.chromeSamples - r.expect >= 0 ? '+' : ''}${r.chromeSamples - r.expect}`).join(' '));
      if (bad.length) console.log('  (0 이 아니면 그 브라우저에서 루프 이음매에 인코더 지연만큼 틈이 생길 수 있음)');
    }
  } finally {
    await browser.close();
    rmSync(tmp, { recursive: true, force: true });
  }
  if (!stems) {
    const all = Object.keys(SPECS).map((id) => join(OUT_DIR, `${id}.mp3`)).filter(existsSync);
    const total = all.reduce((s, f) => s + statSync(f).size, 0);
    console.log(`\n합계 ${all.length}개 ${(total / 1024 / 1024).toFixed(2)} MB (한도 ${(TOTAL_BUDGET / 1024 / 1024).toFixed(1)} MB)`);
    if (total > TOTAL_BUDGET) {
      console.error('용량 한도 초과');
      process.exitCode = 1;
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
