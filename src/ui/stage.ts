/**
 * 무대 렌더러: 배경, 캐릭터, 화면 효과, 햇살·빛망울, 장소 표시, 날짜 카드(일력), 선택지 베일, 숨기기 안내
 *
 * - 배경·스프라이트는 바꿀 그림을 먼저 해독(img.decode, 최대 1.2초)한 뒤 보여 준다.
 *   그림이 늦게 튀어나오거나 크로스페이드 도중 빈 화면이 끼지 않게 한다. 해독이 늦거나 실패해도 1.2초 뒤에는 진행한다.
 * - 배경 톤(낮·노을·밤)은 에셋 매니페스트(BACKGROUNDS[id].tone)로 정하고, 그림이 실제로 바뀌는 순간
 *   onBackdrop(url, color, tone) 으로 알린다(화면 팀이 #vn[data-tone] 을 갱신). 무대 자신도 data-tone 을 가진다.
 * - 빛망울(.motes)은 레이어 하나를 두고 화면 종류에 따라 개수를 바꾼다(대사 9 · 날짜 카드 16).
 *   설정 particles 를 끄면(setParticles(false)) 비운다. prefers-reduced-motion 이면 CSS 가 멈춘다.
 * - 날짜 카드는 .stage > .card 로 범위를 좁힌다(대화 기록 항목 .card 와 이름이 겹치던 결함, UI_DESIGN 부록 A).
 */
import type { BgFx, BgId, CgId, CharId, CharState, StageState } from '../engine/types';
import { BACKGROUNDS, type BgTone } from '../story/assets';
import { CGS } from '../story/cg';
import { DATES } from '../story/config';
import { el } from './dom';

export type { BgTone };

export interface StageResolver {
  bgUrl(id: BgId): string | null;
  bgColor(id: BgId): string | null;
  spriteUrl(char: CharId, s: CharState): string | null;
  charLabel(char: CharId): string;
  /** 선택: 배경 톤. 없으면 에셋 매니페스트(BACKGROUNDS[id].tone, 기본 낮)로 정한다 */
  bgTone?(id: BgId): BgTone;
  /** 선택: 이벤트 CG 주소. 없으면 매니페스트(story/cg.ts CGS[id].src)를 문서 기준으로 쓴다 */
  cgUrl?(id: CgId): string | null;
}

const DUR = { fade: 550, veil: 380, char: 350, card: 500, cg: 550 };
/** 그림 해독을 기다리는 최대 시간 */
const DECODE_MAX_MS = 1200;
/** 빛망울 개수 상한(명세 8장): 대사 9, 날짜 카드 16 */
const MOTE_COUNT = { play: 9, card: 16 } as const;
const WEEKDAYS = ['월', '화', '수', '목', '금'] as const;
const DATE_RE = /^(\d{1,2})월 (\d{1,2})일 ([월화수목금토일])요일$/;
const DATE_PREFIX_RE = /^(\d{1,2})월 \d{1,2}일/;

// ---------------------------------------------------------------------------
// 그림 해독(같은 주소는 한 번만, 해독한 Image 를 붙잡아 두어 다시 쓸 때 즉시 그려지게)
// ---------------------------------------------------------------------------

const decodeCache = new Map<string, { img: HTMLImageElement; done: Promise<boolean> }>();

/** 해독 결과: 성공 true, 실패(파일 없음·손상) false */
function decodeOnce(url: string): Promise<boolean> {
  let hit = decodeCache.get(url);
  if (!hit) {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    const done =
      typeof img.decode === 'function'
        ? img.decode().then(
            () => true,
            () => false,
          )
        : new Promise<boolean>((resolve) => {
            img.onload = () => resolve(true);
            img.onerror = () => resolve(false);
          });
    hit = { img, done };
    decodeCache.set(url, hit);
  }
  return hit.done;
}

/** 그림이 해독될 때까지(최대 ms). 실패하거나 늦어도 resolve 한다 */
export function whenImageReady(url: string | null, ms = DECODE_MAX_MS): Promise<void> {
  if (!url) return Promise.resolve();
  return Promise.race([decodeOnce(url).then(() => undefined), new Promise<void>((resolve) => setTimeout(resolve, ms))]);
}

/** 그림을 쓸 수 있는지(해독 성공). 최대 ms 안에 끝나지 않으면 일단 true(늦게라도 그려지게) */
function imageUsable(url: string, ms = DECODE_MAX_MS): Promise<boolean> {
  return Promise.race([decodeOnce(url), new Promise<boolean>((resolve) => setTimeout(() => resolve(true), ms))]);
}

// ---------------------------------------------------------------------------
// 빛망울
// ---------------------------------------------------------------------------

export interface MoteOptions {
  /** 밤 색(금·분홍·하늘) */
  night?: boolean;
  /** 노을 색(살구·분홍·금) */
  evening?: boolean;
  /** 옅게: 위쪽 55% 안에, 작고 투명하게(대사 화면) */
  soft?: boolean;
  /** 같은 화면은 늘 같은 배치가 되게 하는 씨앗 */
  seed?: number;
}

/** 결정적 난수(스크린샷이 매번 같게) */
function rng(seed: number): () => number {
  let x = (seed * 9301 + 49297) % 233280;
  return () => {
    x = (x * 9301 + 49297) % 233280;
    return x / 233280;
  };
}

/**
 * 빛망울 n 개를 container 에 채운다(transform·opacity 애니메이션만, styles/play.css .motes).
 * 타이틀(26)·엔딩(22)에서도 쓸 수 있게 내보낸다.
 */
export function fillMotes(container: HTMLElement, n: number, opts: MoteOptions = {}): void {
  const r = rng(opts.seed ?? 1);
  const colors = opts.night
    ? ['rgba(255,227,161,.6)', 'rgba(255,190,215,.55)', 'rgba(170,210,255,.55)']
    : opts.evening
      ? ['rgba(255,214,170,.6)', 'rgba(255,196,214,.55)', 'rgba(255,236,190,.6)']
      : ['rgba(200,232,255,.6)', 'rgba(255,214,230,.55)', 'rgba(255,240,200,.6)'];
  const soft = !!opts.soft;
  const frag = document.createDocumentFragment();
  for (let k = 0; k < n; k++) {
    const i = document.createElement('i');
    const glint = r() < (opts.night ? 0.4 : 0.28);
    const size = glint ? 6 + r() * 10 : (soft ? 10 : 8) + r() * (soft ? 26 : 34);
    if (glint) i.className = 'glint';
    const v: Record<string, string> = {
      '--x': `${(r() * 100).toFixed(1)}%`,
      '--y': `${(soft ? r() * 55 : r() * 92).toFixed(1)}%`,
      '--s': `${size.toFixed(0)}px`,
      '--o': (soft ? 0.25 + r() * 0.35 : 0.35 + r() * 0.5).toFixed(2),
      '--b': `${(glint ? 0 : r() * 2.5).toFixed(1)}px`,
      '--c': colors[k % 3],
      '--d': `${(8 + r() * 10).toFixed(1)}s`,
      '--dl': `${(-r() * 10).toFixed(1)}s`,
      '--dx': `${(r() * 30 - 15).toFixed(0)}px`,
    };
    for (const [key, val] of Object.entries(v)) i.style.setProperty(key, val);
    frag.append(i);
  }
  container.replaceChildren(frag);
}

/** 문서 기준 절대 주소. CSS 사용자 정의 속성(--bg 등)에 url() 을 넣을 때 쓴다(상대 주소는 CSS 파일 기준으로 풀림) */
export function absoluteUrl(url: string): string {
  try {
    return new URL(url, document.baseURI).href;
  } catch {
    return url;
  }
}

/** 배경 id → 톤(매니페스트 기준, 기본 낮) */
export function toneOfBg(id: string | undefined): BgTone {
  if (!id) return 'day';
  return (BACKGROUNDS as Record<string, { tone?: BgTone } | undefined>)[id]?.tone ?? 'day';
}

/** 일력 머리띠의 날씨 아이콘: 비 배경은 비, 밤·축제는 달, 그 밖은 해 */
function weatherOf(id: string | undefined, tone: BgTone): 'sun' | 'rain' | 'moon' {
  if (id && /_rain$/.test(id)) return 'rain';
  if (tone === 'night' || (id && (/night/.test(id) || /^festival/.test(id)))) return 'moon';
  return 'sun';
}

/** 날짜 문구가 config.DATES 의 몇 주 차·몇 번째 날인지(공통 d1~d5 = 1주 차, 루트 r1~r5 = 2주 차) */
function weekOf(main: string): { week: number; day: number } | null {
  for (const [key, value] of Object.entries(DATES)) {
    if (value !== main) continue;
    const m = /^([dr])([1-5])$/.exec(key);
    if (m) return { week: m[1] === 'd' ? 1 : 2, day: Number(m[2]) - 1 };
  }
  return null;
}

type CharImg = HTMLImageElement;

export class StageView {
  readonly el: HTMLElement;
  private bgLayers: [HTMLElement, HTMLElement];
  private activeBg = 0;
  /** 마지막으로 요청한 배경(해독을 기다리는 중이어도 이 값) */
  private bgId: BgId | undefined;
  private bgToken = 0;
  /** 마지막 배경 요청이 화면에 나타날 준비가 되면 풀리는 약속 */
  private bgReady: Promise<void> = Promise.resolve();
  private bgFadeTimer: ReturnType<typeof setTimeout> | null = null;
  private tone: BgTone = 'day';
  private charsEl: HTMLElement;
  private chars = new Map<CharId, CharImg>();
  private charTokens = new Map<CharId, number>();
  private sunwash: HTMLElement;
  private motes: HTMLElement;
  private motesKey = '';
  private particles = true;
  /** 이벤트 CG(캐릭터 앞, 대사창 뒤 — 무대 가득) */
  private cgLayer: HTMLElement;
  private cgId: CgId | null = null;
  private cgToken = 0;
  private choiceVeil: HTMLElement;
  private veil: HTMLElement;
  private placeChip: HTMLElement;
  private placeTimer: ReturnType<typeof setTimeout> | null = null;
  private cardEl: HTMLElement;
  private hideHint: HTMLElement;
  private hurryFns = new Set<() => void>();
  /** 배경이 실제로 바뀐 순간(해독 뒤) 알린다: 레터박스 그림·색과 톤(화면 팀이 #vn[data-tone] 갱신) */
  onBackdrop: (url: string | null, color: string | null, tone: BgTone) => void = () => undefined;

  constructor(private resolver: StageResolver) {
    this.bgLayers = [el('div', 'bg-layer'), el('div', 'bg-layer')];
    this.charsEl = el('div', 'chars');
    this.sunwash = el('div', 'sunwash');
    this.motes = el('div', 'motes');
    this.motes.setAttribute('aria-hidden', 'true');
    this.cgLayer = el('div', 'cg-layer');
    this.cgLayer.setAttribute('aria-hidden', 'true');
    this.choiceVeil = el('div', 'choice-veil');
    this.veil = el('div', 'veil');
    this.placeChip = el('div', 'place-chip');
    this.cardEl = el('div', 'card');
    this.hideHint = el('div', 'hide-hint');
    this.hideHint.setAttribute('role', 'status');
    const eye = el('span', 'ico');
    eye.setAttribute('aria-hidden', 'true');
    this.hideHint.append(eye, '화면을 누르면 대사창이 돌아와요');
    this.el = el('div', 'stage');
    this.el.dataset.tone = this.tone;
    this.el.append(
      ...this.bgLayers,
      this.charsEl,
      this.sunwash,
      this.motes,
      this.cgLayer,
      this.choiceVeil,
      this.placeChip,
      this.cardEl,
      this.hideHint,
      this.veil,
    );
    this.renderMotes();
  }

  /** 진행 중인 연출 대기를 즉시 끝낸다 */
  hurry(): void {
    for (const f of [...this.hurryFns]) f();
  }

  wait(ms: number): Promise<void> {
    if (ms <= 0) return Promise.resolve();
    return this.waitFor(null, ms);
  }

  /** p 가 끝나거나, ms 가 지나거나, hurry() 가 불릴 때까지 */
  private waitFor(p: Promise<unknown> | null, ms: number): Promise<void> {
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(t);
        this.hurryFns.delete(finish);
        resolve();
      };
      const t = setTimeout(finish, ms);
      this.hurryFns.add(finish);
      p?.then(finish, finish);
    });
  }

  // =========================================================================
  // 배경
  // =========================================================================

  private paintBg(layer: HTMLElement, id: BgId) {
    const url = this.resolver.bgUrl(id);
    const color = this.resolver.bgColor(id);
    layer.style.backgroundImage = url ? `url("${url}")` : 'none';
    layer.style.backgroundColor = color ?? '#08070c';
    layer.dataset.bg = id;
  }

  private toneOf(id: BgId): BgTone {
    return this.resolver.bgTone?.(id) ?? toneOfBg(id);
  }

  /** 배경이 화면에 나타난 순간: 톤·레터박스·빛망울을 맞춘다. 그림 없는 검은 화면은 앞 톤을 유지한다(암전 중 창 색 깜빡임 방지) */
  private shown(id: BgId) {
    if (this.resolver.bgUrl(id)) this.tone = this.toneOf(id);
    this.el.dataset.tone = this.tone;
    this.renderMotes();
    this.onBackdrop(this.resolver.bgUrl(id), this.resolver.bgColor(id), this.tone);
  }

  /** 배경 요청 공통: 해독을 기다린 뒤(최대 1.2초) apply. 그사이 새 요청이 오면 버린다 */
  private requestBg(id: BgId, apply: () => void) {
    const token = ++this.bgToken;
    this.bgId = id;
    const ready = whenImageReady(this.resolver.bgUrl(id));
    this.bgReady = ready;
    void ready.then(() => {
      if (token === this.bgToken) apply();
    });
  }

  /**
   * 두 배경 레이어 중 layer 를 위로(문서 순서로 인물 레이어 바로 앞). z-index 를 쓰면 인물보다 위에 그려지므로
   * 순서만 바꾼다.
   */
  private raiseBg(layer: HTMLElement) {
    if (layer.nextElementSibling !== this.charsEl) this.el.insertBefore(layer, this.charsEl);
  }

  currentBg(): string | undefined {
    return this.bgId;
  }

  /** 지금 톤(배경이 실제로 바뀐 뒤의 값) */
  currentTone(): BgTone {
    return this.tone;
  }

  setBgInstant(id: BgId): void {
    this.requestBg(id, () => {
      if (this.bgFadeTimer) clearTimeout(this.bgFadeTimer);
      this.bgFadeTimer = null;
      const front = this.bgLayers[this.activeBg];
      const back = this.bgLayers[1 - this.activeBg];
      this.paintBg(front, id);
      this.raiseBg(front);
      withoutTransition([front, back], () => {
        front.classList.add('on');
        back.classList.remove('on');
      });
      this.shown(id);
    });
  }

  /** 크로스페이드(새 그림을 해독한 뒤 시작) */
  fadeBg(id: BgId): void {
    if (this.bgId === id) return;
    this.requestBg(id, () => {
      if (this.bgFadeTimer) clearTimeout(this.bgFadeTimer);
      const next = this.bgLayers[1 - this.activeBg];
      const prev = this.bgLayers[this.activeBg];
      // 앞선 크로스페이드가 끝나기 전이면 뒤 레이어가 아직 보이는 상태일 수 있다: 투명에서 다시 시작
      withoutTransition([next], () => next.classList.remove('on'));
      this.paintBg(next, id);
      this.raiseBg(next);
      void next.offsetWidth;
      next.classList.add('on');
      this.activeBg = 1 - this.activeBg;
      this.shown(id);
      this.bgFadeTimer = setTimeout(() => {
        this.bgFadeTimer = null;
        if (this.bgLayers[this.activeBg] === next) prev.classList.remove('on');
      }, DUR.fade + 50);
    });
  }

  async veilIn(kind: Exclude<BgFx, 'fade' | 'cut'>): Promise<void> {
    this.veil.className = `veil ${kind}`;
    void this.veil.offsetWidth;
    this.veil.classList.add('on');
    await this.wait(DUR.veil);
  }

  /** 막 뒤에서 바꾼 배경이 해독될 때까지(최대 1.2초) 기다렸다가 걷는다 */
  async veilOut(): Promise<void> {
    await this.waitFor(this.bgReady, DECODE_MAX_MS);
    this.veil.classList.remove('on');
    await this.wait(DUR.veil);
  }

  clearVeilInstant(): void {
    withoutTransition([this.veil], () => this.veil.classList.remove('on'));
  }

  // =========================================================================
  // 캐릭터
  // =========================================================================

  showChar(char: CharId, s: CharState, animate: boolean): void {
    const url = this.resolver.spriteUrl(char, s);
    let img = this.chars.get(char);
    if (!img) {
      const n = document.createElement('img');
      n.className = 'char entering';
      n.alt = '';
      n.setAttribute('aria-label', this.resolver.charLabel(char));
      n.addEventListener('error', () => (n.style.visibility = 'hidden'));
      n.addEventListener('load', () => (n.style.visibility = ''));
      n.draggable = false;
      n.decoding = 'async';
      this.chars.set(char, n);
      this.charsEl.append(n);
      img = n;
    }
    const target = img;
    target.classList.remove('leaving');
    target.dataset.expr = s.expr;
    target.dataset.look = `${s.outfit}_${s.hair}`;
    for (const p of ['left', 'center', 'right'] as const) target.classList.toggle(`pos-${p}`, s.pos === p);

    const token = (this.charTokens.get(char) ?? 0) + 1;
    this.charTokens.set(char, token);
    const apply = () => {
      if (this.charTokens.get(char) !== token || this.chars.get(char) !== target) return;
      if (url && target.getAttribute('src') !== url) target.src = url;
      if (target.classList.contains('entering')) this.revealChar(target, animate);
    };
    // 같은 그림이면 바로, 새 그림(표정·옷 교체 포함)은 해독한 뒤 바꿔 끼워 빈 프레임·늦은 등장을 막는다
    if (!url || target.getAttribute('src') === url) apply();
    else void whenImageReady(url).then(apply);
  }

  private revealChar(img: CharImg, animate: boolean) {
    if (!animate) {
      withoutTransition([img], () => img.classList.remove('entering'));
      return;
    }
    void img.offsetWidth;
    requestAnimationFrame(() => img.classList.remove('entering'));
  }

  hideChar(char: CharId, animate: boolean): void {
    const img = this.chars.get(char);
    if (!img) return;
    this.chars.delete(char);
    this.charTokens.delete(char);
    if (!animate) {
      img.remove();
      return;
    }
    img.classList.add('leaving');
    setTimeout(() => img.remove(), DUR.char + 50);
  }

  /** 두 명 이상일 때 말하지 않는 히로인을 살짝 바래게 */
  setSpeaker(char: CharId | null): void {
    const multi = this.chars.size > 1;
    for (const [c, img] of this.chars) img.classList.toggle('dim', multi && char !== null && c !== char);
  }

  renderSnapshot(stage: StageState): void {
    this.setBgInstant(stage.bg);
    for (const c of [...this.chars.keys()]) if (!stage.chars[c]) this.hideChar(c, false);
    for (const c of stage.order) {
      const s = stage.chars[c];
      if (s) this.showChar(c, s, false);
    }
    // 겹침 순서
    for (const c of stage.order) {
      const img = this.chars.get(c);
      if (img) this.charsEl.append(img);
    }
    this.showCg(stage.cg ?? null, false);
    this.clearVeilInstant();
    this.hideCard(false);
    this.hidePlace();
  }

  clearAll(): void {
    for (const c of [...this.chars.keys()]) this.hideChar(c, false);
    this.showCg(null, false);
    this.setBgInstant('black');
    this.hideCard(false);
    this.hidePlace();
    this.clearVeilInstant();
  }

  shake(): void {
    this.el.classList.remove('shake');
    void this.el.offsetWidth;
    this.el.classList.add('shake');
    setTimeout(() => this.el.classList.remove('shake'), 500);
  }

  async flash(): Promise<void> {
    await this.veilIn('white');
    await this.veilOut();
  }

  // =========================================================================
  // 이벤트 CG
  // =========================================================================

  private cgUrlOf(id: CgId): string | null {
    if (this.resolver.cgUrl) return this.resolver.cgUrl(id);
    const src = (CGS as Record<string, { src: string } | undefined>)[id]?.src;
    return src ? absoluteUrl(src) : null;
  }

  /**
   * 이벤트 CG 를 무대 가득(캐릭터 앞, 대사창 뒤) 보여 주거나(null 이면) 걷는다. 해독한 뒤 0.55s 페이드.
   * 그림 파일이 없거나 깨졌으면 보여 주지 않는다(무대가 그대로 보임).
   */
  showCg(id: CgId | null, animate: boolean): void {
    if (id === this.cgId) return;
    this.cgId = id;
    const token = ++this.cgToken;
    const layer = this.cgLayer;
    const set = (on: boolean) => {
      if (animate) {
        void layer.offsetWidth;
        layer.classList.toggle('on', on);
      } else withoutTransition([layer], () => layer.classList.toggle('on', on));
    };
    if (!id) {
      set(false);
      delete layer.dataset.cg;
      return;
    }
    const url = this.cgUrlOf(id);
    if (!url) {
      set(false);
      return;
    }
    void imageUsable(url).then((ok) => {
      if (token !== this.cgToken) return;
      if (!ok) {
        set(false);
        return;
      }
      layer.style.backgroundImage = `url("${url}")`;
      layer.dataset.cg = id;
      set(true);
    });
  }

  /** 지금 보이는(또는 해독 중인) 이벤트 CG */
  currentCg(): CgId | null {
    return this.cgId;
  }

  // =========================================================================
  // 빛망울
  // =========================================================================

  /** 설정 '빛망울 효과'. 끄면 빛망울을 비운다(화면 팀이 설정을 읽어 부른다) */
  setParticles(on: boolean): void {
    this.particles = on;
    this.el.dataset.particles = on ? '1' : '0';
    this.renderMotes();
  }

  /** 대사 화면이면 위쪽에 옅게 9개, 날짜 카드면 카드 안에 16개. 톤에 맞춘 색 */
  private renderMotes() {
    const card = this.cardEl.classList.contains('on');
    const key = `${card ? 'card' : 'play'}:${this.tone}:${this.particles ? 1 : 0}`;
    if (key === this.motesKey) return;
    this.motesKey = key;
    // 카드 동안은 카드 안(흐린 배경 위, 일력 아래)으로 옮긴다
    if (card) this.cardEl.insertBefore(this.motes, this.cardEl.children[1] ?? null);
    else if (this.motes.parentElement !== this.el) this.el.insertBefore(this.motes, this.cgLayer);
    this.motes.dataset.kind = card ? 'card' : 'play';
    if (!this.particles) {
      this.motes.replaceChildren();
      return;
    }
    fillMotes(this.motes, card ? MOTE_COUNT.card : MOTE_COUNT.play, {
      night: this.tone === 'night',
      evening: this.tone === 'evening',
      soft: !card,
      seed: card ? 7 : 11,
    });
  }

  // =========================================================================
  // 장소 표시
  // =========================================================================

  /** '7월 10일 금요일 · 방과 후 교실' 처럼 ' · ' 가 있으면 앞부분(날짜·때)과 장소를 구분선으로 나눈다 */
  showPlace(text: string): void {
    const ico = el('span', 'ico');
    ico.setAttribute('aria-hidden', 'true');
    const cut = text.indexOf(' · ');
    if (cut > 0) {
      // 구분선은 1px 막대로 그리고, 글자로 읽을 때는 ' · ' 가 그대로 남게 숨긴 글자를 넣는다
      const sep = el('span', 'sep');
      sep.append(el('span', 'sr-only', ' · '));
      this.placeChip.replaceChildren(ico, el('span', 'pc-when', text.slice(0, cut)), sep, el('span', 'pc-where', text.slice(cut + 3)));
    } else this.placeChip.replaceChildren(ico, el('span', 'pc-where', text));
    // 다시 나타날 때 들어오는 연출을 처음부터
    this.placeChip.classList.remove('on');
    void this.placeChip.offsetWidth;
    this.placeChip.classList.add('on');
    if (this.placeTimer) clearTimeout(this.placeTimer);
    this.placeTimer = setTimeout(() => this.hidePlace(), 3200);
  }

  hidePlace(): void {
    this.placeChip.classList.remove('on');
    if (this.placeTimer) clearTimeout(this.placeTimer);
    this.placeTimer = null;
  }

  // =========================================================================
  // 날짜 카드(일력)
  // =========================================================================

  /**
   * main 이 'M월 D일 X요일' 이면 달·날짜·요일로 나눠 일력 한 장으로 그리고, 아니면(.text-only) 문장 한 덩어리.
   * 주 차 배지와 월~금 점은 config.DATES(d1~d5 = 1주 차, r1~r5 = 2주 차)와 같은 날짜일 때만 붙인다.
   */
  showCard(main: string, sub: string | undefined, animate: boolean): void {
    const bgId = this.bgId;
    const bg = el('div', 'card-bg');
    const url = bgId ? this.resolver.bgUrl(bgId) : null;
    const color = bgId ? this.resolver.bgColor(bgId) : null;
    // 사용자 정의 속성 안의 상대 url() 은 CSS 파일 기준으로 풀리므로(빌드는 base './') 문서 기준 절대 주소로 넣는다
    bg.style.setProperty('--bg', url ? `url("${absoluteUrl(url)}")` : 'none');
    if (color) bg.style.backgroundColor = color;

    const parts: HTMLElement[] = [bg];
    const date = DATE_RE.exec(main);
    const wk = date ? weekOf(main) : null;
    if (wk) parts.push(el('div', 'card-kicker', `${wk.week}주 차`));

    const cal = el('div', date ? 'cal' : 'cal text-only');
    const head = el('div', 'cal-head');
    // 날짜 형식이 아닌 카드('몇 주 뒤, 여름방학')는 부제의 날짜에서 달만 머리띠에 쓴다
    const subDate = DATE_PREFIX_RE.exec(sub ?? '');
    const month = date ? `${date[1]}월` : subDate ? `${subDate[1]}월` : '';
    const wx = el('span', 'ico');
    wx.dataset.wx = weatherOf(bgId, this.tone);
    wx.setAttribute('aria-hidden', 'true');
    head.append(el('span', 'cal-month', month), wx);
    const body = el('div', 'cal-body');
    if (date) {
      const dow = el('div', 'cal-dow', `${date[3]}요일`);
      dow.dataset.dow = date[3];
      body.append(el('div', 'cal-day', date[2]), dow);
    } else body.append(el('div', 'cal-day', main));
    if (sub) {
      const line = el('div', 'cal-line');
      const star = el('span', 'ico');
      star.setAttribute('aria-hidden', 'true');
      line.append(star);
      line.setAttribute('aria-hidden', 'true');
      body.append(line, el('div', 'cal-sub', sub));
    }
    cal.append(head, body);
    parts.push(cal);

    if (wk) {
      const week = el('div', 'week');
      week.setAttribute('aria-hidden', 'true');
      WEEKDAYS.forEach((d, i) => week.append(el('span', i < wk.day ? 'past' : i === wk.day ? 'now' : '', d)));
      parts.push(week);
    }

    this.cardEl.replaceChildren(...parts);
    this.cardEl.classList.toggle('instant', !animate);
    if (animate) {
      void this.cardEl.offsetWidth;
      this.cardEl.classList.add('on');
    } else withoutTransition([this.cardEl], () => this.cardEl.classList.add('on'));
    this.motesKey = '';
    this.renderMotes();
  }

  hideCard(animate: boolean): void {
    if (!this.cardEl.classList.contains('on')) return;
    if (animate) this.cardEl.classList.remove('on');
    else withoutTransition([this.cardEl], () => this.cardEl.classList.remove('on'));
    this.renderMotes();
  }

  get cardVisible(): boolean {
    return this.cardEl.classList.contains('on');
  }
}

function withoutTransition(els: HTMLElement[], fn: () => void) {
  for (const e of els) e.style.transition = 'none';
  fn();
  for (const e of els) void e.offsetWidth;
  for (const e of els) e.style.transition = '';
}
