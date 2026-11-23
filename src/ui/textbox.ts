/** 대사창: 이름표 + 글자 순차 표시(타자기 효과) */
import { el } from './dom';

export class TextBox {
  readonly el: HTMLElement;
  private nameEl: HTMLElement;
  private textEl: HTMLElement;
  private shown: Text;
  private hidden: HTMLSpanElement;
  private full = '';
  private n = 0;
  private raf = 0;
  private startAt = 0;
  private cps = 40;
  private typing = false;
  onDone: () => void = () => undefined;

  constructor() {
    this.el = el('div', 'textbox hidden');
    this.el.setAttribute('role', 'log');
    this.nameEl = el('div', 'name');
    this.textEl = el('div', 'text');
    this.shown = document.createTextNode('');
    this.hidden = el('span', 'hidden-char');
    this.hidden.setAttribute('aria-hidden', 'true');
    this.textEl.append(this.shown, this.hidden);
    this.el.append(this.nameEl, this.textEl, el('div', 'next'));
  }

  get isTyping(): boolean {
    return this.typing;
  }

  get text(): string {
    return this.full;
  }

  setVisible(v: boolean): void {
    this.el.classList.toggle('hidden', !v);
  }

  /**
   * @param cps 초당 글자 수. Infinity 면 즉시 표시
   */
  show(name: string | null, color: string, text: string, mono: boolean, cps: number): void {
    cancelAnimationFrame(this.raf);
    this.nameEl.textContent = name ?? '';
    this.el.style.setProperty('--name-color', color);
    this.el.classList.toggle('mono', mono);
    this.full = text;
    this.cps = cps;
    this.setVisible(true);
    // 숨긴 부분도 자리를 차지하게 해서 글자가 나타나는 동안 줄바꿈 위치가 흔들리지 않게 한다
    if (!Number.isFinite(cps) || cps <= 0) {
      this.finish();
      return;
    }
    this.n = 0;
    this.typing = true;
    this.el.classList.remove('done');
    this.el.dataset.typing = '1';
    this.paint();
    this.startAt = performance.now();
    const tick = (now: number) => {
      if (!this.typing) return;
      const target = Math.min(this.full.length, Math.floor(((now - this.startAt) / 1000) * this.cps) + 1);
      if (target !== this.n) {
        this.n = target;
        this.paint();
      }
      if (this.n >= this.full.length) this.finish();
      else this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  /** 문장 고정 표시(선택지 안내 등). 타자 효과 없음 */
  showStatic(name: string | null, color: string, text: string, mono: boolean): void {
    this.show(name, color, text, mono, Infinity);
  }

  /** 지금 문장을 즉시 완성 */
  complete(): void {
    if (!this.typing) return;
    this.finish();
  }

  private finish() {
    cancelAnimationFrame(this.raf);
    this.typing = false;
    this.n = this.full.length;
    this.paint();
    this.el.classList.add('done');
    this.el.dataset.typing = '0';
    this.onDone();
  }

  private paint() {
    this.shown.data = this.full.slice(0, this.n);
    this.hidden.textContent = this.full.slice(this.n);
  }

  clear(): void {
    cancelAnimationFrame(this.raf);
    this.typing = false;
    this.full = '';
    this.n = 0;
    this.paint();
    this.nameEl.textContent = '';
    this.el.classList.remove('done');
    this.el.dataset.typing = '0';
  }

  /** 대사창이 내용을 다 담고 있는지(검증용) */
  overflowing(): boolean {
    return this.textEl.scrollHeight > this.el.clientHeight + 2;
  }
}
