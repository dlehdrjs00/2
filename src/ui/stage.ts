/** 무대 렌더러: 배경, 캐릭터, 화면 효과, 장소 표시, 시간 경과 카드 */
import type { BgFx, BgId, CharId, CharState, StageState } from '../engine/types';
import { el } from './dom';

export interface StageResolver {
  bgUrl(id: BgId): string | null;
  bgColor(id: BgId): string | null;
  spriteUrl(char: CharId, s: CharState): string | null;
  charLabel(char: CharId): string;
}

const DUR = { fade: 550, veil: 380, char: 350, card: 500 };

export class StageView {
  readonly el: HTMLElement;
  private bgLayers: [HTMLElement, HTMLElement];
  private activeBg = 0;
  private charsEl: HTMLElement;
  private chars = new Map<CharId, HTMLImageElement>();
  private veil: HTMLElement;
  private placeChip: HTMLElement;
  private placeTimer: ReturnType<typeof setTimeout> | null = null;
  private cardEl: HTMLElement;
  private hurryFns = new Set<() => void>();
  onBackdrop: (url: string | null, color: string | null) => void = () => undefined;

  constructor(private resolver: StageResolver) {
    this.bgLayers = [el('div', 'bg-layer'), el('div', 'bg-layer')];
    this.charsEl = el('div', 'chars');
    this.veil = el('div', 'veil');
    this.placeChip = el('div', 'place-chip');
    this.cardEl = el('div', 'card');
    this.cardEl.append(el('div', 'card-main'), el('div', 'card-line'), el('div', 'card-sub'));
    this.el = el('div', 'stage');
    this.el.append(...this.bgLayers, this.charsEl, this.placeChip, this.cardEl, this.veil);
  }

  /** 진행 중인 연출 대기를 즉시 끝낸다 */
  hurry(): void {
    for (const f of [...this.hurryFns]) f();
  }

  wait(ms: number): Promise<void> {
    if (ms <= 0) return Promise.resolve();
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
    });
  }

  private paintBg(layer: HTMLElement, id: BgId) {
    const url = this.resolver.bgUrl(id);
    const color = this.resolver.bgColor(id);
    layer.style.backgroundImage = url ? `url("${url}")` : 'none';
    layer.style.backgroundColor = color ?? '#08070c';
    layer.dataset.bg = id;
    this.onBackdrop(url, color);
  }

  currentBg(): string | undefined {
    return this.bgLayers[this.activeBg].dataset.bg;
  }

  setBgInstant(id: BgId): void {
    const front = this.bgLayers[this.activeBg];
    const back = this.bgLayers[1 - this.activeBg];
    this.paintBg(front, id);
    withoutTransition([front, back], () => {
      front.classList.add('on');
      back.classList.remove('on');
    });
  }

  /** 크로스페이드 */
  fadeBg(id: BgId): void {
    if (this.currentBg() === id) return;
    const next = this.bgLayers[1 - this.activeBg];
    const prev = this.bgLayers[this.activeBg];
    this.paintBg(next, id);
    next.style.zIndex = '1';
    prev.style.zIndex = '0';
    void next.offsetWidth;
    next.classList.add('on');
    this.activeBg = 1 - this.activeBg;
    setTimeout(() => {
      if (this.bgLayers[this.activeBg] === next) prev.classList.remove('on');
    }, DUR.fade + 50);
  }

  async veilIn(kind: Exclude<BgFx, 'fade' | 'cut'>): Promise<void> {
    this.veil.className = `veil ${kind}`;
    void this.veil.offsetWidth;
    this.veil.classList.add('on');
    await this.wait(DUR.veil);
  }

  async veilOut(): Promise<void> {
    this.veil.classList.remove('on');
    await this.wait(DUR.veil);
  }

  clearVeilInstant(): void {
    withoutTransition([this.veil], () => this.veil.classList.remove('on'));
  }

  showChar(char: CharId, s: CharState, animate: boolean): void {
    const url = this.resolver.spriteUrl(char, s);
    let img = this.chars.get(char);
    const isNew = !img;
    if (!img) {
      img = document.createElement('img');
      img.className = 'char';
      img.alt = '';
      img.setAttribute('aria-label', this.resolver.charLabel(char));
      img.addEventListener('error', () => (img!.style.visibility = 'hidden'));
      img.addEventListener('load', () => (img!.style.visibility = ''));
      img.draggable = false;
      img.decoding = 'async';
      this.chars.set(char, img);
      this.charsEl.append(img);
    }
    img.classList.remove('leaving');
    img.dataset.expr = s.expr;
    img.dataset.look = `${s.outfit}_${s.hair}`;
    if (url && img.getAttribute('src') !== url) img.src = url;
    for (const p of ['left', 'center', 'right'] as const) img.classList.toggle(`pos-${p}`, s.pos === p);
    if (isNew && animate) {
      img.classList.add('entering');
      void img.offsetWidth;
      requestAnimationFrame(() => img!.classList.remove('entering'));
    } else if (isNew) {
      withoutTransition([img], () => img!.classList.remove('entering'));
    }
  }

  hideChar(char: CharId, animate: boolean): void {
    const img = this.chars.get(char);
    if (!img) return;
    this.chars.delete(char);
    if (!animate) {
      img.remove();
      return;
    }
    img.classList.add('leaving');
    setTimeout(() => img.remove(), DUR.char + 50);
  }

  /** 두 명 이상일 때 말하지 않는 히로인을 살짝 어둡게 */
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
    this.clearVeilInstant();
    this.hideCard(false);
    this.hidePlace();
  }

  clearAll(): void {
    for (const c of [...this.chars.keys()]) this.hideChar(c, false);
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

  showPlace(text: string): void {
    this.placeChip.textContent = text;
    this.placeChip.classList.add('on');
    if (this.placeTimer) clearTimeout(this.placeTimer);
    this.placeTimer = setTimeout(() => this.hidePlace(), 3200);
  }

  hidePlace(): void {
    this.placeChip.classList.remove('on');
    if (this.placeTimer) clearTimeout(this.placeTimer);
    this.placeTimer = null;
  }

  showCard(main: string, sub: string | undefined, animate: boolean): void {
    (this.cardEl.children[0] as HTMLElement).textContent = main;
    (this.cardEl.children[2] as HTMLElement).textContent = sub ?? '';
    (this.cardEl.children[1] as HTMLElement).style.display = sub ? '' : 'none';
    if (animate) {
      void this.cardEl.offsetWidth;
      this.cardEl.classList.add('on');
    } else withoutTransition([this.cardEl], () => this.cardEl.classList.add('on'));
  }

  hideCard(animate: boolean): void {
    if (!this.cardEl.classList.contains('on')) return;
    if (animate) this.cardEl.classList.remove('on');
    else withoutTransition([this.cardEl], () => this.cardEl.classList.remove('on'));
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
