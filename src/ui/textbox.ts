/** 대사창: 이름표 + 글자 순차 표시(타자기 효과) */
import { el } from './dom';

/**
 * 스크린리더 안내 지연(ms). 같은 문장이 연달아 나와도 다시 읽히도록 먼저 비우고 잠시 뒤 채운다.
 * 즉시 표시(건너뛰기·불러오기·선택지 안내)는 더 길게 기다려, 건너뛰기 중에는 멈춘 곳의 문장만 읽게 한다
 * (건너뛰기 간격 55ms 보다 충분히 길게).
 */
const ANNOUNCE_DELAY_MS = 80;
const ANNOUNCE_INSTANT_DELAY_MS = 250;
/** 넘침 판정 허용 오차(px): 소수점 배치 반올림 */
const OVERFLOW_EPS = 0.5;

export class TextBox {
  readonly el: HTMLElement;
  private nameEl: HTMLElement;
  private textEl: HTMLElement;
  private shown: Text;
  private hidden: HTMLSpanElement;
  /** 스크린리더용 문장 전체(시각적으로 숨김). 타자 효과로 바뀌는 글자는 읽지 않고 문장마다 한 번만 알린다 */
  private live: HTMLElement;
  private announceTimer: ReturnType<typeof setTimeout> | null = null;
  private full = '';
  private n = 0;
  private raf = 0;
  private startAt = 0;
  private cps = 40;
  private typing = false;
  /** 기본 높이(3줄)를 넘는 문장 때문에 대사창을 위로 늘린 양(px) */
  private grow = 0;
  onDone: () => void = () => undefined;

  constructor() {
    this.el = el('div', 'textbox hidden');
    // 보이는 이름표·글자는 매 프레임 바뀌므로 보조기기에서 숨기고, 문장 전체는 아래 live 영역으로만 전한다
    this.nameEl = el('div', 'name');
    this.nameEl.setAttribute('aria-hidden', 'true');
    this.textEl = el('div', 'text');
    this.textEl.setAttribute('aria-hidden', 'true');
    this.shown = document.createTextNode('');
    this.hidden = el('span', 'hidden-char');
    this.hidden.setAttribute('aria-hidden', 'true');
    this.textEl.append(this.shown, this.hidden);
    this.live = el('div', 'sr-only');
    this.live.setAttribute('aria-live', 'polite');
    this.live.setAttribute('aria-atomic', 'true');
    this.el.append(this.nameEl, this.textEl, el('div', 'next'), this.live);
    // 화면 크기·글자 크기가 바뀌면 넘침 안전장치를 다시 맞춘다
    if (typeof ResizeObserver === 'function') {
      const ro = new ResizeObserver(() => this.fit());
      ro.observe(this.el);
      ro.observe(this.textEl);
    }
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
    const instant = !Number.isFinite(cps) || cps <= 0;
    this.announce(name && !mono ? `${name}: ${text}` : text, instant);
    // 숨긴 부분도 자리를 차지하게 해서 글자가 나타나는 동안 줄바꿈 위치가 흔들리지 않게 한다
    if (instant) {
      this.finish();
      this.fit();
      return;
    }
    this.n = 0;
    this.typing = true;
    this.el.classList.remove('done');
    this.el.dataset.typing = '1';
    this.paint();
    this.fit();
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

  /**
   * 대사창 밖에 보이는 문구(시간 경과 카드 등)를 스크린리더에 문장 단위로 알린다.
   * 빈 문자열이면 알림을 비운다.
   */
  announce(text: string, instant = true): void {
    if (this.announceTimer) clearTimeout(this.announceTimer);
    this.announceTimer = null;
    this.live.textContent = '';
    if (!text) return;
    this.announceTimer = setTimeout(
      () => {
        this.announceTimer = null;
        this.live.textContent = text;
      },
      instant ? ANNOUNCE_INSTANT_DELAY_MS : ANNOUNCE_DELAY_MS,
    );
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
    this.announce('');
    this.fit();
  }

  /**
   * 글자 아래끝이 대사창 안쪽(아래 여백 위) 경계를 몇 px 넘는지. 음수면 남는 공간.
   * 숨긴 글자도 자리를 차지하므로 타자 효과 도중에도 문장 전체 기준이다.
   */
  private overflowPx(): number {
    const cs = getComputedStyle(this.el);
    const box = this.el.getBoundingClientRect();
    const contentBottom = box.bottom - (parseFloat(cs.borderBottomWidth) || 0) - (parseFloat(cs.paddingBottom) || 0);
    return this.textEl.getBoundingClientRect().bottom - contentBottom;
  }

  /**
   * 넘침 안전장치: 기본 높이(3줄)를 넘는 문장은 잘리지 않게 넘친 만큼 대사창을 위로 늘린다.
   * 늘릴 수 있는 한도는 HUD 줄 아래까지. 넘침이 없으면 원래 높이로 돌아간다.
   */
  private fit(): void {
    if (!this.el.isConnected) return;
    // 기본 높이 기준 넘침(지금 늘린 양과 무관). 정수 px 로 늘려 ResizeObserver 재호출 때 값이 흔들리지 않게 한다
    const base = this.overflowPx() + this.grow;
    const next = this.full ? Math.max(0, Math.min(Math.ceil(base - OVERFLOW_EPS), Math.floor(this.maxGrow()))) : 0;
    if (next === this.grow) return;
    this.grow = next;
    if (next > 0) this.el.style.setProperty('--tb-grow', `${next}px`);
    else this.el.style.removeProperty('--tb-grow');
  }

  private maxGrow(): number {
    const cs = getComputedStyle(this.el);
    const v = (k: string) => parseFloat(cs.getPropertyValue(k));
    const room = v('--ty') - (v('--hy') + v('--btn') + 8);
    return Number.isFinite(room) ? Math.max(0, room) : this.el.offsetHeight;
  }

  /**
   * 문장이 대사창 기본 크기(3줄)를 넘치는지(검증용). 안전장치로 대사창을 늘려 잘리지 않은 경우도 넘침으로 본다.
   * 아래 여백 위 글자 영역 기준이라 '한 줄 더' 넘친 경우도 잡는다.
   */
  overflowing(): boolean {
    return this.overflowPx() + this.grow > OVERFLOW_EPS;
  }
}
