/**
 * 게임 화면 컨트롤러.
 *
 * 입력 안전 장치 요약
 *  - 대사 진행은 #vn 루트의 click / 키보드에서만 일어난다. 메뉴·선택지·HUD·타이틀은 모두 [data-noadvance] 라서
 *    그 위의 입력은 대사 진행으로 전달되지 않는다.
 *  - 오버레이(메뉴 등)가 열려 있거나 세로 화면 안내가 떠 있으면 진행·자동 진행·건너뛰기가 모두 멈춘다.
 *  - 오버레이를 닫은 직후, 선택지를 고른 직후, 이어하기·새 게임 직후, 건너뛰기가 스스로 멈춘 직후에는
 *    짧은 입력 잠금(inputLockUntil)으로 중복 입력을 흡수한다(대사 진행과 선택지 모두에 적용).
 *  - 화면이 바뀐 직후(오버레이 열기·닫기, 모드 전환, 슬롯 목록 갱신) 같은 자리에 들어온 두 번째 클릭
 *    (더블클릭·더블탭의 나머지)은 루트의 캡처 단계에서 흡수한다(uiLockUntil). 키보드 활성화는 막지 않는다.
 *  - 선택지는 나타나는 연출이 끝나고 잠깐 뒤에야 누를 수 있다(choicesArmedAt). 준비 전에 누르기 시작한 클릭도 무시한다.
 *  - 선택지는 한 번 누르면 잠긴다(choiceLocked). 실행기(choose)도 선택지가 아닌 위치에서는 아무것도 하지 않는다.
 *  - 오버레이가 열려 있으면 그 밖의 화면은 inert 로 막아 Tab·Enter 로 아래 버튼을 누를 수 없다.
 *  - 키 자동 반복(e.repeat)은 모두 무시한다(메뉴 깜빡임, 자동/건너뛰기 토글 반복, 확인창 즉시 확정 방지).
 */
import type { CharId, EndingId, GameState, HeroineId, SayStep, StageState, Story } from '../engine/types';
import { advance, choose, findStep, newGameState, pushLog, settle, StoryError, type StageEvent, type StepResult } from '../engine/runner';
import { MANUAL_SLOTS, SaveManager, type LoadResult, type SaveSummary, type SlotId } from '../engine/save';
import { autoDelayMs, charsPerSecond, DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from '../engine/settings';
import type { KeyValueStore } from '../engine/storage';
import { AudioManager } from '../engine/audio';
import { resolveText } from '../engine/text';
import { applyLayout, computeLayout, isPhonePortrait, measureSafeArea } from './layout';
import { StageView } from './stage';
import { TextBox } from './textbox';
import { button, el, formatDate } from './dom';

export interface GameContent {
  story: Story;
  vars: Readonly<Record<string, string>>;
  speakerNames: Record<string, string>;
  heroineNames: Record<HeroineId, string>;
  title: string;
  subtitle: string;
  buildLabel: string;
  bgUrl(id: string): string | null;
  bgColor(id: string): string | null;
  spriteUrl(char: CharId, outfit: string, hair: string, expr: string): string | null;
  bgmSrc(id: string): { src: string; gain?: number } | null;
  sfxSrc(id: string): { src: string; gain?: number } | null;
  hasBg(id: string): boolean;
  hasSprite(char: string, outfit: string, hair: string, expr: string): boolean;
  hasBgm(id: string): boolean;
  allImageUrls(): string[];
  titleSprites: Array<{ char: CharId; outfit: string; hair: string; expr: string }>;
  usesPlaceholders: boolean;
}

type Mode = 'boot' | 'title' | 'play' | 'ending';

/** 화면이 바뀐 뒤 같은 자리 두 번째 클릭을 흡수하는 시간 */
const UI_LOCK_MS = 400;
/** 두 클릭을 '더블클릭·더블탭'으로 볼 최대 간격 */
const ECHO_MS = 500;
/** 이어하기·새 게임 직후 대사 진행·선택 잠금 */
const START_LOCK_MS = 400;
/** 건너뛰기가 스스로 멈춘 직후 잠금(반사적인 '정지' 클릭이 처음 보는 대사를 넘기지 않게) */
const SKIP_STOP_LOCK_MS = 300;
/** 선택지 준비 시간: 첫 버튼 등장 연출(0.35s) + 여유. 버튼마다 등장 지연(0.07s)만큼 더한다 */
const CHOICE_ARM_MS = 500;
const CHOICE_ARM_STAGGER_MS = 70;
const CHOICE_ARM_REDUCED_MS = 350;

const NAME_COLORS: Record<string, string> = {
  osana: 'var(--osana)',
  tenko: 'var(--tenko)',
  me: 'var(--me)',
};

export class Game {
  readonly root: HTMLElement;
  private c: GameContent;
  private story: Story;
  private saves: SaveManager;
  private store: KeyValueStore;
  private settings: Settings;
  private audio: AudioManager;
  private stage: StageView;
  private textbox: TextBox;
  private hud: HTMLElement;
  private choicesEl: HTMLElement;
  private backdrop: HTMLElement;
  private overlayRoot: HTMLElement;
  private rotateEl: HTMLElement;
  private safeProbe: HTMLElement;
  private screenEl: HTMLElement | null = null;
  private toastEl: HTMLElement | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  private state: GameState | null = null;
  private current: StepResult | null = null;
  private mode: Mode = 'boot';
  private overlays: Array<{ el: HTMLElement; close: () => void; dismissable: boolean }> = [];
  private auto = false;
  private skip = false;
  private autoTimer: ReturnType<typeof setTimeout> | null = null;
  private skipTimer: ReturnType<typeof setTimeout> | null = null;
  private inputLockUntil = 0;
  private uiLockUntil = 0;
  private lastClick: { t: number; x: number; y: number } | null = null;
  private lastPointerType = 'mouse';
  private choiceLocked = false;
  private choicesArmedAt = 0;
  private choicePointerDownAt = -Infinity;
  private armTimer: ReturnType<typeof setTimeout> | null = null;
  private lastLayoutSize: { vw: number; vh: number } | null = null;
  /** 마지막으로 요청한 배경음(테스트·디버그용) */
  private bgmRequested: string | null = null;
  private transitioning = false;
  private presentToken = 0;
  private rotateDismissed = false;
  private rotateShown = false;
  private hudButtons: Record<'auto' | 'skip' | 'log' | 'menu', HTMLButtonElement>;
  private lastWheel = 0;

  constructor(mount: HTMLElement, content: GameContent, store: KeyValueStore) {
    this.c = content;
    this.story = content.story;
    this.store = store;
    this.saves = new SaveManager(store, content.story, {
      hasBg: content.hasBg,
      hasSprite: content.hasSprite,
      hasBgm: content.hasBgm,
    });
    this.settings = loadSettings(store);
    this.audio = new AudioManager(content.bgmSrc, content.sfxSrc, '');
    this.audio.setVolumes(this.settings.bgmVolume, this.settings.sfxVolume);

    this.root = el('div', 'vn');
    this.root.id = 'vn';
    this.backdrop = el('div', 'backdrop');
    this.stage = new StageView({
      bgUrl: (id) => content.bgUrl(id),
      bgColor: (id) => content.bgColor(id),
      spriteUrl: (char, s) => content.spriteUrl(char, s.outfit, s.hair, s.expr),
      charLabel: (char) => content.heroineNames[char],
    });
    this.stage.onBackdrop = (url, color) => {
      this.backdrop.style.backgroundImage = url ? `url("${url}")` : 'none';
      this.backdrop.style.backgroundColor = color ?? '#0f0c14';
    };
    this.textbox = new TextBox();
    this.textbox.onDone = () => this.onTypingDone();

    this.hud = el('div', 'hud');
    this.hud.dataset.noadvance = '';
    this.hudButtons = {
      auto: button('자동', 'hud-btn', () => this.toggleAuto()),
      skip: button('스킵', 'hud-btn', () => this.toggleSkip()),
      log: button('기록', 'hud-btn', () => this.openLog()),
      menu: button('메뉴', 'hud-btn', () => this.openMenu()),
    };
    this.hudButtons.auto.setAttribute('aria-pressed', 'false');
    this.hudButtons.skip.setAttribute('aria-pressed', 'false');
    this.hudButtons.auto.title = '자동 진행 (A)';
    this.hudButtons.skip.title = '읽은 대사 건너뛰기 (S)';
    this.hudButtons.log.title = '대화 기록 (L)';
    this.hudButtons.menu.title = '메뉴 (Esc)';
    this.hud.append(...Object.values(this.hudButtons));

    this.choicesEl = el('div', 'choices');
    this.choicesEl.dataset.noadvance = '';
    this.choicesEl.setAttribute('role', 'group');
    this.choicesEl.setAttribute('aria-label', '선택지');

    this.overlayRoot = el('div', 'overlay-root');
    this.rotateEl = this.buildRotate();
    this.safeProbe = el('div');
    this.safeProbe.style.cssText =
      'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';

    this.root.append(this.backdrop, this.stage.el, this.textbox.el, this.choicesEl, this.hud, this.overlayRoot, this.rotateEl, this.safeProbe);
    mount.append(this.root);

    this.applyWindowOpacity();
    this.bindInput();
    this.relayout();
    this.setMode('boot');
  }

  // =========================================================================
  // 시작
  // =========================================================================

  start(): void {
    this.showTitle();
    if (!this.saves.persistent) this.toast('브라우저 저장소를 쓸 수 없어 저장이 이 탭에서만 유지돼요.', 5000);
    // 이미지 미리 불러오기(백그라운드)
    setTimeout(() => {
      for (const url of this.c.allImageUrls()) {
        const img = new Image();
        img.decoding = 'async';
        img.src = url;
      }
    }, 300);
  }

  private setMode(m: Mode) {
    this.lockUi();
    this.mode = m;
    this.root.dataset.mode = m;
    const playing = m === 'play';
    this.hud.style.display = playing ? '' : 'none';
    if (!playing) {
      this.stopAuto();
      this.setSkip(false, true);
      this.hideChoices();
    }
  }

  // =========================================================================
  // 입력
  // =========================================================================

  private bindInput() {
    // 브라우저 자동재생 제한 해제: 어떤 버튼을 누르든(전파가 멈춘 버튼 포함) 첫 입력에서 오디오를 깨운다
    const unlock = () => this.audio.unlock();
    for (const type of ['pointerup', 'click', 'keydown', 'touchend'] as const) {
      this.root.addEventListener(type, unlock, { capture: true, passive: true });
    }
    this.root.addEventListener(
      'pointerdown',
      (e) => {
        this.lastPointerType = e.pointerType || 'mouse';
      },
      { capture: true, passive: true },
    );
    // 화면이 바뀐 직후 같은 자리에 들어온 두 번째 클릭(더블클릭·더블탭의 나머지)은
    // 새로 나타난 버튼·슬롯·배경에 닿기 전에 흡수한다. 키보드 활성화(detail 0)는 그대로 통과.
    // 시각은 처리 시각이 아니라 입력이 일어난 시각(e.timeStamp)으로 본다: 첫 입력의 화면 전환으로
    // 메인 스레드가 바빠 두 번째 입력이 늦게 처리돼도 '빠른 두 번 누르기'로 판정되게.
    this.root.addEventListener(
      'click',
      (e) => {
        if (e.detail === 0) return;
        const now = eventTime(e);
        const prev = this.lastClick;
        this.lastClick = { t: now, x: e.clientX, y: e.clientY };
        if (now >= this.uiLockUntil) return;
        // 마우스 더블클릭은 거의 같은 점(OS 허용 오차 수 px), 손가락 더블탭은 조금 더 벌어진다
        const radius = this.lastPointerType === 'mouse' ? 8 : 32;
        const near = prev !== null && now - prev.t < ECHO_MS && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) <= radius;
        if (e.detail > 1 || near) {
          e.stopPropagation();
          e.preventDefault();
        }
      },
      { capture: true },
    );
    this.choicesEl.addEventListener(
      'pointerdown',
      (e) => {
        this.choicePointerDownAt = eventTime(e);
      },
      { capture: true, passive: true },
    );
    this.root.addEventListener('click', (e) => {
      const t = e.target as Element | null;
      if (t && t.closest('[data-noadvance]')) return;
      this.requestAdvance(eventTime(e));
    });

    window.addEventListener('keydown', (e) => this.onKey(e));

    this.root.addEventListener(
      'wheel',
      (e) => {
        if (this.mode !== 'play' || this.overlays.length || this.rotateShown) return;
        const t = e.target as Element | null;
        if (t && t.closest('[data-noadvance]')) return;
        const now = performance.now();
        if (now - this.lastWheel < 400) return;
        this.lastWheel = now;
        if (e.deltaY < -10) this.openLog();
      },
      { passive: true },
    );

    const relayout = () => this.relayout();
    window.addEventListener('resize', relayout);
    window.addEventListener('orientationchange', () => setTimeout(relayout, 120));
    window.visualViewport?.addEventListener('resize', relayout);

    const persist = () => this.persistNow();
    window.addEventListener('pagehide', persist);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        persist();
        this.clearAutoTimer();
      } else this.scheduleAuto();
    });

    document.addEventListener('fullscreenchange', () => setTimeout(relayout, 50));
  }

  private onKey(e: KeyboardEvent) {
    if (e.isComposing) return;
    // 키를 누르고 있을 때의 자동 반복은 모두 무시한다.
    // (Esc 반복으로 메뉴가 열렸다 닫혔다, A/S 반복으로 토글 반복, Enter 반복이 방금 열린 확인창의 기본 버튼을 누르는 일 방지)
    if (e.repeat) {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') e.preventDefault();
      return;
    }
    const t = e.target as HTMLElement | null;
    const tag = t?.tagName;
    if (e.key === 'Escape') {
      e.preventDefault();
      const top = this.overlays[this.overlays.length - 1];
      if (top) {
        if (top.dismissable) top.close();
      } else if (this.mode === 'play' && !this.rotateShown) this.openMenu();
      return;
    }
    if (this.mode !== 'play' || this.overlays.length || this.rotateShown) return;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // 포커스된 버튼은 브라우저 기본 동작(클릭)에 맡긴다 → 중복 실행 방지
    if (tag === 'BUTTON' && (e.key === 'Enter' || e.key === ' ')) return;

    const cur = this.current;
    if (cur?.step.t === 'choice') {
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= cur.step.options.length && !e.repeat) {
        e.preventDefault();
        const btn = this.choicesEl.querySelectorAll<HTMLButtonElement>('.choice')[n - 1];
        if (btn) this.pickChoice(cur.step.options[n - 1].id, btn, eventTime(e));
      }
      return;
    }
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight' || e.key === 'PageDown') {
      e.preventDefault();
      if (e.repeat) return;
      this.audio.unlock();
      this.requestAdvance(eventTime(e));
    } else if (e.key === 'a' || e.key === 'A') this.toggleAuto();
    else if (e.key === 's' || e.key === 'S') this.toggleSkip();
    else if (e.key === 'l' || e.key === 'L' || e.key === 'ArrowUp') this.openLog();
  }

  private get blocked(): boolean {
    return this.mode !== 'play' || this.overlays.length > 0 || this.rotateShown || document.hidden;
  }

  /** 클릭·터치·키보드로 대사를 진행하려 할 때. at: 입력이 일어난 시각 */
  private requestAdvance(at = performance.now()) {
    if (this.blocked) return;
    if (at < this.inputLockUntil) return;
    if (this.skip) {
      this.setSkip(false);
      return;
    }
    const cur = this.current;
    if (!cur) return;
    if (this.transitioning) {
      this.stage.hurry();
      return;
    }
    if (cur.step.t === 'say' && this.textbox.isTyping) {
      this.textbox.complete();
      return;
    }
    if (cur.step.t === 'say' || cur.step.t === 'card') this.doAdvance();
  }

  // =========================================================================
  // 진행
  // =========================================================================

  private doAdvance() {
    const cur = this.current;
    const state = this.state;
    if (!cur || !state || (cur.step.t !== 'say' && cur.step.t !== 'card')) return;
    this.clearAutoTimer();
    this.saves.markRead(cur.step.id);
    let res: StepResult | null;
    try {
      res = advance(this.story, state);
    } catch (e) {
      this.storyFailure(e);
      return;
    }
    if (res) void this.present(res, {});
  }

  /** at: 입력이 일어난 시각 */
  private pickChoice(optionId: string, btn: HTMLButtonElement, at = performance.now()) {
    this.audio.unlock();
    if (this.choiceLocked || this.blocked) return;
    // 선택지가 아직 다 나타나지 않았거나(준비 시간), 화면 전환 직후 잠금 중이면 무시한다
    if (at < Math.max(this.inputLockUntil, this.choicesArmedAt)) return;
    const cur = this.current;
    const state = this.state;
    if (!cur || !state || cur.step.t !== 'choice') return;
    const option = cur.step.options.find((o) => o.id === optionId);
    if (!option) return;
    this.choiceLocked = true;
    this.choicesEl.classList.add('locked');
    btn.classList.add('picked');
    this.choicesEl.querySelectorAll('button').forEach((b) => ((b as HTMLButtonElement).disabled = true));
    this.audio.playSfx('select');
    pushLog(state, { id: `${cur.step.id}:${option.id}`, name: null, text: `▶ ${this.t(option.text)}`, kind: 'choice' });
    let res: StepResult | null;
    try {
      res = choose(this.story, state, optionId);
    } catch (e) {
      this.storyFailure(e);
      return;
    }
    if (!res) {
      this.choiceLocked = false;
      return;
    }
    this.inputLockUntil = performance.now() + 450;
    const token = ++this.presentToken;
    setTimeout(() => {
      if (token !== this.presentToken) return;
      this.hideChoices();
      void this.present(res!, {});
    }, 200);
  }

  /** 블로킹 스텝 하나를 화면에 표시 */
  private async present(res: StepResult, opts: { fromLoad?: boolean }) {
    const token = ++this.presentToken;
    const state = this.state!;
    this.current = res;
    // 표시 중인 스텝과 선택지 DOM 이 어긋나지 않게: 선택지가 아니면 남은 선택지를 항상 지운다
    if (res.step.t !== 'choice') this.hideChoices();
    // 건너뛰기는 읽은 대사만: 처음 보는 대사·선택지·엔딩에 닿으면 '그리기 전에' 멈춰서
    // 타자 효과·효과음·장소 표시·암전 연출을 정상으로 보여 준다
    if (this.skip) {
      const t = res.step.t;
      const unread = (t === 'say' || t === 'card') && !this.saves.isRead(res.step.id);
      if (unread || t === 'choice' || t === 'ending') {
        this.setSkip(false, true);
        if (unread) this.toast('처음 보는 대사에서 건너뛰기를 멈췄어요.');
        this.inputLockUntil = Math.max(this.inputLockUntil, performance.now() + SKIP_STOP_LOCK_MS);
      }
    }
    this.clearAutoTimer();
    this.root.dataset.frame = res.step.t;
    this.root.dataset.step = res.step.id;
    this.textbox.el.dataset.step = res.step.id;
    const instant = this.skip || !!opts.fromLoad;

    if (opts.fromLoad) {
      this.stage.renderSnapshot(state.stage);
      this.playBgm(state.stage.bgm);
    } else {
      await this.applyEvents(res.events, instant, token);
      if (token !== this.presentToken) return;
    }

    const step = res.step;
    if (step.t !== 'card') this.stage.hideCard(!instant);

    switch (step.t) {
      case 'say': {
        const info = this.speaker(step);
        const text = this.t(step.text);
        this.stage.setSpeaker(info.char);
        pushLog(state, { id: step.id, name: info.name, text, kind: info.mono ? 'mono' : 'say' });
        this.autosave();
        const cps = instant ? Infinity : charsPerSecond(this.settings.textSpeed);
        this.textbox.show(info.name, info.color, text, info.mono, cps);
        break;
      }
      case 'card': {
        this.textbox.setVisible(false);
        this.textbox.clear();
        const main = this.t(step.text);
        const sub = step.sub ? this.t(step.sub) : undefined;
        pushLog(state, { id: step.id, name: null, text: sub ? `${main} · ${sub}` : main, kind: 'card' });
        this.autosave();
        this.stage.showCard(main, sub, !instant);
        this.onTypingDone();
        break;
      }
      case 'choice': {
        this.setSkip(false, true);
        this.choiceLocked = false;
        this.stage.setSpeaker(null);
        if (step.prompt) this.textbox.showStatic(null, '', this.t(step.prompt), true);
        this.autosave();
        this.renderChoices(step.options.map((o) => ({ id: o.id, text: this.t(o.text) })));
        break;
      }
      case 'ending': {
        this.stopAuto();
        this.setSkip(false, true);
        state.endedWith = step.ending;
        this.saves.markEnding(step.ending);
        this.saves.remove('auto');
        this.textbox.setVisible(false);
        this.showEnding(step.ending);
        break;
      }
    }
  }

  /** token: 연출 도중 불러오기·타이틀 이동 등으로 다른 표시가 시작되면 남은 연출을 버리기 위한 표식 */
  private async applyEvents(events: StageEvent[], instant: boolean, token: number) {
    for (const e of events) {
      if (e.kind === 'bgm') this.playBgm(e.track);
      else if (e.kind === 'sfx' && !this.skip) this.audio.playSfx(e.sound);
    }
    const veil = !instant ? events.find((e) => e.kind === 'bg' && (e.fx === 'black' || e.fx === 'white')) : undefined;
    if (veil && veil.kind === 'bg') {
      this.transitioning = true;
      try {
        this.textbox.setVisible(false);
        this.stage.hidePlace();
        await this.stage.veilIn(veil.fx === 'white' ? 'white' : 'black');
        if (token !== this.presentToken) return;
        this.applyVisual(events, true);
        this.stage.hideCard(false);
        await this.stage.veilOut();
      } finally {
        if (token === this.presentToken) this.transitioning = false;
      }
      return;
    }
    this.applyVisual(events, instant);
    if (!instant && events.some((e) => e.kind === 'fx' && e.fx === 'flash')) {
      this.transitioning = true;
      try {
        await this.stage.flash();
      } finally {
        if (token === this.presentToken) this.transitioning = false;
      }
    }
  }

  private applyVisual(events: StageEvent[], instant: boolean) {
    for (const e of events) {
      switch (e.kind) {
        case 'bg':
          if (instant || e.fx === 'cut') this.stage.setBgInstant(e.bg);
          else this.stage.fadeBg(e.bg);
          break;
        case 'show':
          this.stage.showChar(e.char, e.state, !instant);
          break;
        case 'hide':
          this.stage.hideChar(e.char, !instant);
          break;
        case 'place':
          if (!this.skip) this.stage.showPlace(this.t(e.text));
          break;
        case 'fx':
          if (e.fx === 'shake' && !instant) this.stage.shake();
          break;
        default:
          break;
      }
    }
  }

  private onTypingDone() {
    if (this.skip) this.scheduleSkip();
    else this.scheduleAuto();
  }

  // =========================================================================
  // 자동 진행 / 건너뛰기
  // =========================================================================

  private toggleAuto() {
    if (this.mode !== 'play') return;
    this.auto = !this.auto;
    if (this.auto && this.skip) this.setSkip(false, true);
    this.syncHud();
    if (this.auto) this.scheduleAuto();
    else this.clearAutoTimer();
  }

  private stopAuto() {
    this.auto = false;
    this.clearAutoTimer();
    this.syncHud();
  }

  private clearAutoTimer() {
    if (this.autoTimer) clearTimeout(this.autoTimer);
    this.autoTimer = null;
  }

  private scheduleAuto() {
    this.clearAutoTimer();
    if (!this.auto || this.blocked || this.skip) return;
    const cur = this.current;
    if (!cur || (cur.step.t !== 'say' && cur.step.t !== 'card')) return; // 선택지·엔딩에서는 멈춤
    if (this.textbox.isTyping || this.transitioning) return;
    const len = cur.step.t === 'say' ? this.textbox.text.length : 24;
    this.autoTimer = setTimeout(() => {
      this.autoTimer = null;
      if (!this.auto || this.blocked || this.skip || this.current !== cur || this.textbox.isTyping) return;
      this.doAdvance();
    }, autoDelayMs(this.settings.autoSpeed, len));
  }

  private toggleSkip() {
    if (this.mode !== 'play') return;
    this.setSkip(!this.skip);
  }

  private setSkip(on: boolean, silent = false) {
    if (on) {
      if (this.blocked) return;
      const cur = this.current;
      if (!cur || cur.step.t === 'choice' || cur.step.t === 'ending') {
        if (!silent) this.toast('선택지에서는 건너뛸 수 없어요.');
        return;
      }
      // 현재 문장이 처음 읽는 문장이면 시작하지 않는다
      if (!this.saves.isRead(cur.step.id)) {
        if (!silent) this.toast('처음 보는 대사는 건너뛸 수 없어요.');
        return;
      }
      this.skip = true;
      this.clearAutoTimer();
      this.syncHud();
      if (this.textbox.isTyping) this.textbox.complete();
      else this.scheduleSkip();
      return;
    }
    const was = this.skip;
    this.skip = false;
    if (this.skipTimer) clearTimeout(this.skipTimer);
    this.skipTimer = null;
    this.syncHud();
    if (was) this.scheduleAuto();
  }

  private scheduleSkip() {
    if (this.skipTimer) clearTimeout(this.skipTimer);
    this.skipTimer = setTimeout(() => this.skipStep(), 55);
  }

  private skipStep() {
    this.skipTimer = null;
    if (!this.skip) return;
    if (this.blocked) {
      this.setSkip(false, true);
      return;
    }
    const cur = this.current;
    if (!cur || (cur.step.t !== 'say' && cur.step.t !== 'card')) {
      this.setSkip(false, true);
      return;
    }
    if (this.transitioning) {
      this.scheduleSkip();
      return;
    }
    if (!this.saves.isRead(cur.step.id)) {
      // 안전장치(보통은 present 에서 미리 멈춘다)
      this.setSkip(false, true);
      this.toast('처음 보는 대사에서 건너뛰기를 멈췄어요.');
      this.inputLockUntil = Math.max(this.inputLockUntil, performance.now() + SKIP_STOP_LOCK_MS);
      return;
    }
    this.doAdvance();
  }

  private syncHud() {
    this.hudButtons.auto.setAttribute('aria-pressed', String(this.auto));
    this.hudButtons.skip.setAttribute('aria-pressed', String(this.skip));
    this.root.dataset.auto = this.auto ? '1' : '0';
    this.root.dataset.skip = this.skip ? '1' : '0';
  }

  // =========================================================================
  // 선택지
  // =========================================================================

  private renderChoices(options: Array<{ id: string; text: string }>) {
    this.choicesEl.replaceChildren();
    this.choicesEl.classList.remove('locked');
    // 준비 시간: 등장 연출이 끝나기 전(아직 반투명할 때) 들어온 연타·더블탭이 보지 못한 선택지를 고르지 않게
    const arm = prefersReducedMotion() ? CHOICE_ARM_REDUCED_MS : CHOICE_ARM_MS + CHOICE_ARM_STAGGER_MS * Math.max(0, options.length - 1);
    this.choicesArmedAt = performance.now() + arm;
    this.choicesEl.dataset.armed = '0';
    if (this.armTimer) clearTimeout(this.armTimer);
    this.armTimer = setTimeout(() => {
      this.armTimer = null;
      this.choicesEl.dataset.armed = '1';
    }, arm);
    options.forEach((o, i) => {
      const b = el('button', 'choice', o.text);
      b.type = 'button';
      b.dataset.option = o.id;
      b.setAttribute('aria-keyshortcuts', String(i + 1));
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        // 준비되기 전에 누르기 시작한 클릭(누른 채로 선택지가 나타난 경우 포함)은 무시한다.
        // pointerdown 없이 오는 클릭(보조 기기 등)은 오래된 기록으로 막히지 않게 최근 것만 본다.
        const at = eventTime(ev);
        const downAt = this.choicePointerDownAt;
        if (ev.detail > 0 && downAt < this.choicesArmedAt && at - downAt < 1500) return;
        this.pickChoice(o.id, b, at);
      });
      this.choicesEl.append(b);
    });
    this.choicesEl.classList.add('on');
  }

  private hideChoices() {
    if (this.armTimer) clearTimeout(this.armTimer);
    this.armTimer = null;
    delete this.choicesEl.dataset.armed;
    this.choicesEl.classList.remove('on', 'locked');
    this.choicesEl.replaceChildren();
  }

  // =========================================================================
  // 새 게임 / 불러오기 / 저장
  // =========================================================================

  private beginNewGame() {
    this.presentToken++;
    this.transitioning = false;
    this.stage.hurry();
    this.hideChoices();
    this.choiceLocked = false;
    this.closeAllOverlays();
    // [새 게임]·확인창 더블클릭의 두 번째 입력이 첫 대사를 넘기지 않게
    this.inputLockUntil = performance.now() + START_LOCK_MS;
    this.state = newGameState(this.story);
    this.current = null;
    this.stage.clearAll();
    this.textbox.clear();
    this.textbox.setVisible(false);
    this.hideScreen();
    this.setMode('play');
    this.auto = false;
    this.syncHud();
    let res: StepResult;
    try {
      res = settle(this.story, this.state);
    } catch (e) {
      this.storyFailure(e);
      return;
    }
    void this.present(res, {});
  }

  private startFromState(state: GameState) {
    this.presentToken++;
    this.transitioning = false;
    this.stage.hurry();
    // 이전 화면의 선택지가 남지 않게(선택지 표시 중·선택 직후 200ms 구간에 불러온 경우 포함). 복구 연출 동안에도 보이지 않게 즉시 지운다
    this.hideChoices();
    this.choiceLocked = false;
    this.closeAllOverlays();
    // [이어하기]·슬롯 더블클릭의 두 번째 입력이 복원된 대사를 넘기거나 선택지를 고르지 않게
    this.inputLockUntil = performance.now() + START_LOCK_MS;
    this.state = state;
    this.current = null;
    this.hideScreen();
    this.textbox.clear();
    this.setMode('play');
    this.auto = false;
    this.syncHud();
    // settle 이 무대 상태를 바꾸기 전의 무대(정확한 위치면 저장 시점, 장면 처음부터 복구면 장면 진입 시점)
    const entry = JSON.parse(JSON.stringify(state.stage)) as StageState;
    let res: StepResult;
    try {
      res = settle(this.story, state);
    } catch (e) {
      this.storyFailure(e);
      return;
    }
    // 정확한 위치면 저장된 무대 스냅샷을 그대로 그리고,
    // 장면 처음부터 복구하는 경우엔 장면 진입 시점 무대에서 장면 앞부분의 연출 명령으로 무대를 다시 만든다.
    // 배경음도 그 시점 곡으로 맞춘다(bgm 지시 없이 앞 장면 곡을 이어받는 장면에서 타이틀 곡이 계속 나오지 않게).
    const exact = res.events.length === 0 || res.events.every((ev) => ev.kind === 'show' && !ev.entering);
    this.stage.renderSnapshot(entry);
    this.playBgm(entry.bgm);
    void this.present(res, { fromLoad: exact });
  }

  /** 슬롯 불러오기 결과 처리(손상·비호환 안내 포함) */
  private handleLoadResult(slot: SlotId, r: LoadResult) {
    const slotName = slot === 'auto' ? '자동 저장' : `슬롯 ${slot}`;
    if (r.status === 'empty') {
      this.toast(`${slotName}이 비어 있어요.`);
      return;
    }
    if (r.status === 'ok') {
      this.startFromState(r.data.state);
      // 일부 정보(배경·캐릭터 그림 등)를 복원하지 못했다면 그 이유를 함께 알린다(아무 설명 없이 검은 화면이 되지 않게)
      const notes = loadNotes(r);
      if (notes.length) this.toast(`${slotName}을 불러왔어요 · ${notes.join(' · ')}`, 5000);
      else this.toast(`${slotName}을 불러왔어요.`, 1600);
      return;
    }
    if (r.status === 'recoverable') {
      void this.ask(r.message, { ok: '장면 처음부터', cancel: '취소' }).then((yes) => {
        if (!yes) return;
        this.startFromState(r.data.state);
        const notes = loadNotes(r);
        if (notes.length) this.toast(notes.join(' · '), 5000);
      });
      return;
    }
    const latest = slot === 'auto' ? this.saves.latestManual() : null;
    const hint = latest ? `\n수동 저장(슬롯 ${latest})에서 이어 할 수 있어요.` : '';
    void this.ask(`${slotName}: ${r.message}${hint}\n이 저장 데이터를 삭제할까요?`, { ok: '삭제', cancel: '닫기', danger: true }).then(
      (yes) => {
        if (yes) {
          this.saves.remove(slot);
          this.toast(`${slotName}을 삭제했어요.`);
          this.refreshTopOverlay();
          if (this.mode === 'title') this.showTitle();
        }
      },
    );
  }

  /**
   * 저장 카드 요약. 화면에 표시 중인 스텝(this.current)이 아니라 상태가 가리키는 실제 위치를 기준으로 만든다.
   * (선택 직후 200ms 연출 구간에는 상태가 이미 다음 대사로 넘어가 있어서, current 기준이면 '[선택지]'로 잘못 남는다)
   */
  private summary(): SaveSummary {
    const state = this.state!;
    const scene = this.story.scenes[state.sceneId];
    const step = this.stateStep() ?? this.current?.step;
    let text = '';
    if (step?.t === 'say' || step?.t === 'card') text = this.t(step.text);
    else if (step?.t === 'choice') text = step.prompt ? `[선택지] ${this.t(step.prompt)}` : '[선택지]';
    if (text.length > 64) text = `${text.slice(0, 63)}…`;
    return { sceneTitle: scene ? this.t(scene.title) : '', text, route: state.route };
  }

  /** 상태(sceneId, stepId)가 가리키는 스텝 */
  private stateStep() {
    const state = this.state;
    if (!state) return null;
    const loc = findStep(this.story, state.sceneId, state.stepId);
    return loc ? loc.scene.steps[loc.index] : null;
  }

  private autosave() {
    if (!this.state || this.mode !== 'play') return;
    this.saves.write('auto', this.state, this.summary());
  }

  private persistNow() {
    if (this.mode === 'play' && this.state && this.current) {
      // 선택 결과가 곧바로 엔딩인 경우(200ms 연출 구간)에도 엔딩 위치를 자동 저장으로 남기지 않는다
      const t = this.stateStep()?.t ?? this.current.step.t;
      if (t !== 'ending') this.autosave();
    }
    this.saves.flushGlobal();
  }

  // =========================================================================
  // 타이틀 / 엔딩
  // =========================================================================

  private hideScreen() {
    this.screenEl?.remove();
    this.screenEl = null;
  }

  private showTitle() {
    this.presentToken++;
    this.transitioning = false;
    this.stage.hurry();
    this.closeAllOverlays();
    this.hideScreen();
    this.setMode('title');
    this.state = null;
    this.current = null;
    this.root.dataset.frame = 'none';
    this.root.dataset.step = '';
    this.textbox.setVisible(false);
    this.stage.clearAll();
    this.stage.setBgInstant('title');
    this.playBgm('title');

    const scr = el('div', 'title-screen');
    scr.dataset.noadvance = '';
    const bgUrl = this.c.bgUrl('title');
    if (bgUrl) scr.style.backgroundImage = `url("${bgUrl}")`;

    // 히로인 그림(장식)
    const sprites = el('div', 'title-sprites');
    sprites.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden';
    this.c.titleSprites.forEach((s, i) => {
      const url = this.c.spriteUrl(s.char, s.outfit, s.hair, s.expr);
      if (!url) return;
      const img = document.createElement('img');
      img.src = url;
      img.alt = '';
      img.style.cssText = `position:absolute;bottom:0;height:88%;${i === 0 ? 'left:-2%' : 'right:-2%'};opacity:.92;filter:drop-shadow(0 8px 24px rgba(40,10,40,.45))`;
      sprites.append(img);
    });

    const inner = el('div', 'title-inner');
    const logo = el('h1', 'title-logo', this.c.title);
    const sub = el('p', 'title-sub', this.c.subtitle);
    const menu = el('div', 'title-menu');
    const hasAuto = this.saves.exists('auto');
    const bNew = button('새 게임', 'btn primary', () => this.onNewGame());
    const bCont = button('이어하기', 'btn', () => this.handleLoadResult('auto', this.saves.load('auto')));
    bCont.disabled = !hasAuto;
    bNew.dataset.action = 'new';
    bCont.dataset.action = 'continue';
    const bLoad = button('불러오기', 'btn', () => this.openSaveLoad('load'));
    bLoad.dataset.action = 'load';
    const bSet = button('설정', 'btn', () => this.openSettings());
    bSet.dataset.action = 'settings';
    menu.append(bNew, bCont, bLoad, bSet);

    const foot = el('div', 'title-foot');
    const reached = new Set(this.saves.endingsReached());
    for (const e of Object.values(this.story.endings)) {
      const got = reached.has(e.id);
      const b = el('span', `badge${got ? ' got' : ''}`, `${got ? '★' : '☆'} ${this.c.heroineNames[e.heroine]} 엔딩`);
      b.title = got ? this.t(e.title) : '아직 보지 못한 엔딩';
      b.dataset.ending = e.id;
      b.dataset.reached = got ? '1' : '0';
      foot.append(b);
    }
    const ver = el('span', '', this.c.buildLabel);
    foot.append(ver);
    if (this.c.usesPlaceholders) foot.append(el('span', '', '※ 그림·음악은 개발용 임시 에셋'));

    inner.append(logo, sub, menu, foot);
    scr.append(sprites, inner);
    this.root.insertBefore(scr, this.overlayRoot);
    this.screenEl = scr;
  }

  private onNewGame() {
    if (this.saves.exists('auto')) {
      void this.ask('처음부터 시작할까요?\n자동 저장은 새 진행으로 덮어써져요. (수동 저장과 읽은 대사 기록은 유지돼요)', {
        ok: '새 게임',
        cancel: '취소',
      }).then((yes) => yes && this.beginNewGame());
    } else this.beginNewGame();
  }

  private showEnding(id: EndingId) {
    this.setMode('ending');
    this.hideScreen();
    const def = this.story.endings[id];
    const reached = new Set(this.saves.endingsReached());
    const scr = el('div', 'ending-screen');
    scr.dataset.noadvance = '';
    scr.dataset.ending = id;
    const inner = el('div', 'ending-inner');
    inner.append(
      el('div', 'ending-end', 'END'),
      el('h2', 'ending-title', `「${this.t(def.title)}」`),
      el('div', 'ending-who', `${this.c.heroineNames[def.heroine]} 엔딩에 도달했어요`),
    );
    const list = el('div', 'ending-list');
    for (const e of Object.values(this.story.endings)) {
      const got = reached.has(e.id);
      list.append(el('span', `badge${got ? ' got' : ''}`, `${got ? '★' : '☆'} ${this.c.heroineNames[e.heroine]} 엔딩`));
    }
    inner.append(list, el('div', 'ending-who', `엔딩 ${reached.size} / ${Object.keys(this.story.endings).length}`));
    const back = button('타이틀로', 'btn primary', () => this.showTitle());
    back.dataset.action = 'to-title';
    inner.append(back);
    scr.append(inner);
    this.root.insertBefore(scr, this.overlayRoot);
    this.screenEl = scr;
  }

  // =========================================================================
  // 오버레이
  // =========================================================================

  private openOverlay(build: (close: () => void) => HTMLElement, dismissable = true): () => void {
    this.clearAutoTimer();
    if (this.skip) this.setSkip(false, true);
    this.lockUi();
    // 키보드로 연 경우에만 닫을 때 원래 버튼으로 포커스를 돌려준다(마우스로 연 HUD 버튼에 포커스가 남으면 Space/Enter 가 대사 대신 버튼을 누름)
    const opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    const restoreTo = opener && isFocusVisible(opener) ? opener : null;
    const ov = el('div', 'overlay');
    ov.dataset.noadvance = '';
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      ov.remove();
      this.overlays = this.overlays.filter((o) => o.el !== ov);
      this.root.dataset.overlay = String(this.overlays.length);
      this.inputLockUntil = performance.now() + 250;
      this.lockUi();
      this.syncInert();
      if (restoreTo && restoreTo.isConnected && !restoreTo.closest('[inert]')) restoreTo.focus({ preventScroll: true });
      if (!this.overlays.length) this.scheduleAuto();
    };
    const panel = build(close);
    ov.append(panel);
    // 배경을 눌러 닫기: 누른 곳과 뗀 곳이 모두 배경일 때만(기록 글자를 드래그해 패널 밖에서 떼도 닫히지 않게).
    // 터치 탭도 같은 위치의 호환 mousedown/mouseup 이 오므로 그대로 동작한다.
    let downOnBackdrop = false;
    let upOnBackdrop = false;
    ov.addEventListener('mousedown', (e) => {
      downOnBackdrop = e.target === ov;
    });
    ov.addEventListener('mouseup', (e) => {
      upOnBackdrop = e.target === ov;
    });
    ov.addEventListener('click', (e) => {
      e.stopPropagation();
      const fromBackdrop = downOnBackdrop && upOnBackdrop;
      downOnBackdrop = upOnBackdrop = false;
      if (e.target === ov && fromBackdrop && dismissable) close();
    });
    this.overlays.push({ el: ov, close, dismissable });
    this.overlayRoot.append(ov);
    this.root.dataset.overlay = String(this.overlays.length);
    this.syncInert();
    // 선택자 목록은 우선순위가 아니라 문서 순서로 고르므로 data-autofocus 를 먼저 따로 찾는다
    const focusable =
      panel.querySelector<HTMLElement>('[data-autofocus]') ?? panel.querySelector<HTMLElement>('button:not([disabled]), .btn');
    focusable?.focus({ preventScroll: true });
    return close;
  }

  /**
   * 모달 처리: 오버레이가 열려 있으면 맨 위 오버레이만 조작할 수 있게 나머지(무대·HUD·타이틀·아래 오버레이)를 inert 로 둔다.
   * Tab 으로 아래 버튼에 가서 Enter 로 패널·확인창을 겹쳐 여는 일을 막는다. 세로 안내와 토스트는 제외.
   */
  private syncInert() {
    const top = this.overlays[this.overlays.length - 1]?.el ?? null;
    for (const child of Array.from(this.root.children)) {
      if (!(child instanceof HTMLElement)) continue;
      if (child === this.overlayRoot || child === this.rotateEl || child === this.safeProbe || child.classList.contains('toast')) continue;
      child.inert = top !== null;
    }
    for (const o of this.overlays) o.el.inert = o.el !== top;
  }

  private closeAllOverlays() {
    for (const o of [...this.overlays]) o.close();
  }

  /** 화면이 바뀌었음을 표시: 잠시 동안 같은 자리 두 번째 클릭을 흡수한다 */
  private lockUi(ms = UI_LOCK_MS) {
    this.uiLockUntil = Math.max(this.uiLockUntil, performance.now() + ms);
  }

  private playBgm(id: string | null) {
    this.bgmRequested = id;
    this.audio.playBgm(id);
  }

  private refreshTopOverlay() {
    // 확인 대화상자 아래에 있는 저장/불러오기 패널을 다시 그린다
    this.lockUi();
    for (const o of this.overlays) {
      const panel = o.el.querySelector('.panel') as (HTMLElement & { refresh?: () => void }) | null;
      panel?.refresh?.();
    }
  }

  private panel(title: string, onClose: () => void, small = false) {
    const p = el('div', `panel${small ? ' small' : ''}`);
    p.setAttribute('role', 'dialog');
    p.setAttribute('aria-modal', 'true');
    p.setAttribute('aria-label', title);
    const head = el('div', 'panel-head');
    head.append(el('h2', '', title));
    const x = button('✕', 'btn icon', onClose);
    x.setAttribute('aria-label', '닫기');
    x.dataset.action = 'close';
    head.append(x);
    const body = el('div', 'panel-body');
    p.append(head, body);
    return { p, body };
  }

  private openMenu() {
    if (this.mode !== 'play' || this.overlays.length) return;
    this.openOverlay((close) => {
      const { p, body } = this.panel('메뉴', close);
      p.dataset.panel = 'menu';
      const list = el('div', 'menu-list');
      const items: Array<[string, string, () => void]> = [
        ['저장하기', 'save', () => this.openSaveLoad('save')],
        ['불러오기', 'load', () => this.openSaveLoad('load')],
        ['대화 기록', 'log', () => this.openLog()],
        ['설정', 'settings', () => this.openSettings()],
      ];
      if (fullscreenSupported()) items.push([isFullscreen() ? '전체화면 끄기' : '전체화면', 'fullscreen', () => void toggleFullscreen(close)]);
      items.push(['타이틀로', 'title', () => this.confirmToTitle()]);
      items.push(['게임으로 돌아가기', 'resume', close]);
      for (const [label, action, fn] of items) {
        const b = button(label, action === 'resume' ? 'btn primary' : 'btn', fn);
        b.dataset.action = action;
        list.append(b);
      }
      body.append(list);
      return p;
    });
  }

  private confirmToTitle() {
    void this.ask('타이틀로 돌아갈까요?\n지금 위치는 자동 저장되어 있어 [이어하기]로 돌아올 수 있어요.', { ok: '타이틀로', cancel: '취소' }).then(
      (yes) => {
        if (!yes) return;
        this.persistNow();
        this.showTitle();
      },
    );
  }

  private openSaveLoad(kind: 'save' | 'load') {
    this.openOverlay((close) => {
      const { p, body } = this.panel(kind === 'save' ? '저장하기' : '불러오기', close);
      p.dataset.panel = kind;
      const grid = el('div', 'slots');
      body.append(grid);
      const render = () => {
        grid.replaceChildren();
        const slots: SlotId[] = kind === 'load' ? ['auto'] : [];
        for (let i = 1; i <= MANUAL_SLOTS; i++) slots.push(String(i) as SlotId);
        for (const slot of slots) grid.append(this.slotCard(kind, slot, rerender));
      };
      // 다시 그린 직후 같은 자리 두 번째 클릭(예: 삭제 확인 더블클릭)이 새로 그려진 다른 슬롯에 닿지 않게
      const rerender = () => {
        this.lockUi();
        render();
        this.syncInert();
      };
      render();
      (p as HTMLElement & { refresh?: () => void }).refresh = rerender;
      const note = el('p', 'setting-note', kind === 'save' ? '슬롯을 누르면 지금 위치를 저장해요. 자동 저장은 대사가 바뀔 때마다 따로 기록돼요.' : '불러올 슬롯을 고르세요.');
      body.append(note);
      return p;
    });
  }

  private slotCard(kind: 'save' | 'load', slot: SlotId, rerender: () => void): HTMLElement {
    const wrap = el('div', 'slot-wrap');
    const info = this.saves.peek(slot);
    const name = slot === 'auto' ? '자동 저장' : `슬롯 ${slot}`;
    const card = el('button', 'slot');
    card.type = 'button';
    card.dataset.slot = slot;
    card.append(el('span', 'slot-name', name));
    if (info.empty) {
      card.append(el('span', 'slot-text', '— 비어 있음 —'));
      if (kind === 'load') card.disabled = true;
    } else if (info.broken) {
      card.classList.add('broken');
      card.append(el('span', 'slot-text', '읽을 수 없는 저장 데이터'));
    } else {
      const route = info.summary?.route ? ` · ${this.c.heroineNames[info.summary.route]} 루트` : '';
      card.append(el('span', 'slot-meta', `${formatDate(info.savedAt ?? '')} · ${info.summary?.sceneTitle ?? ''}${route}`));
      card.append(el('span', 'slot-text', info.summary?.text ?? ''));
    }
    card.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (kind === 'save') {
        if (!this.state || this.mode !== 'play') return;
        const doSave = () => {
          const ok = this.saves.write(slot, this.state!, this.summary());
          this.toast(ok ? `${name}에 저장했어요.` : '저장 공간이 부족해 이 탭에서만 저장됐어요.');
          rerender();
        };
        if (!info.empty) void this.ask(`${name}에 덮어쓸까요?`, { ok: '덮어쓰기', cancel: '취소' }).then((y) => y && doSave());
        else doSave();
      } else {
        const r = this.saves.load(slot);
        const confirmMsg = r.status === 'ok' ? this.loadConfirmMessage(slot, name) : null;
        if (confirmMsg) {
          void this.ask(confirmMsg, { ok: '불러오기', cancel: '취소' }).then((y) => y && this.handleLoadResult(slot, this.saves.load(slot)));
        } else this.handleLoadResult(slot, r);
      }
    });
    wrap.append(card);
    if (!info.empty && slot !== 'auto') {
      const del = button('🗑', 'slot-del', () => {
        void this.ask(`${name}을 삭제할까요?`, { ok: '삭제', cancel: '취소', danger: true }).then((y) => {
          if (y) {
            this.saves.remove(slot);
            rerender();
          }
        });
      });
      del.setAttribute('aria-label', `${name} 삭제`);
      wrap.append(del);
    }
    return wrap;
  }

  /**
   * 불러오기 확인 문구(필요 없으면 null). 불러오면 곧바로 자동 저장이 불러온 위치로 바뀌므로 그 사실을 그대로 알린다.
   * 타이틀에서도 [이어하기]용 자동 저장이 있으면 덮어쓰기 전에 확인한다.
   */
  private loadConfirmMessage(slot: SlotId, name: string): string | null {
    if (this.mode === 'play') {
      if (slot === 'auto') return `${name}을 불러올까요?\n마지막으로 자동 저장된 위치로 돌아가요.`;
      return `${name}을 불러올까요?\n지금 위치는 따로 남지 않고 자동 저장도 불러온 위치로 바뀌어요.\n필요하면 먼저 빈 슬롯에 저장하세요.`;
    }
    if (slot !== 'auto' && this.saves.exists('auto')) {
      return `${name}을 불러올까요?\n[이어하기]의 자동 저장이 불러온 위치로 바뀌어요.`;
    }
    return null;
  }

  private openSettings() {
    this.openOverlay((close) => {
      const { p, body } = this.panel('설정', close);
      p.dataset.panel = 'settings';
      const rows: Array<[keyof Settings, string, number, number, (v: number) => string]> = [
        ['textSpeed', '글자 속도', 1, 10, (v) => (v >= 10 ? '즉시' : String(v))],
        ['autoSpeed', '자동 진행 속도', 1, 10, (v) => String(v)],
        ['bgmVolume', '배경음 음량', 0, 100, (v) => String(v)],
        ['sfxVolume', '효과음 음량', 0, 100, (v) => String(v)],
        ['windowOpacity', '대사창 불투명도', 30, 100, (v) => `${v}%`],
      ];
      const inputs: HTMLInputElement[] = [];
      for (const [key, label, min, max, fmt] of rows) {
        const row = el('div', 'setting');
        const id = `set-${key}`;
        const lab = el('label', '', label);
        lab.htmlFor = id;
        const input = el('input');
        input.type = 'range';
        input.id = id;
        input.min = String(min);
        input.max = String(max);
        input.step = '1';
        input.value = String(this.settings[key]);
        input.dataset.setting = key;
        const out = el('output', '', fmt(this.settings[key]));
        input.addEventListener('input', () => {
          this.settings[key] = Number(input.value);
          out.textContent = fmt(this.settings[key]);
          this.applySettings();
        });
        input.addEventListener('change', () => {
          if (key === 'sfxVolume') this.audio.playSfx('select');
        });
        inputs.push(input);
        row.append(lab, input, out);
        body.append(row);
      }
      body.append(
        el(
          'p',
          'setting-note',
          '건너뛰기는 이미 읽은 대사에서만 동작하고, 처음 보는 대사·선택지에서 멈춰요. 자동 진행도 선택지에서는 기다려요.\n' +
            '키보드: Enter/Space 진행 · A 자동 · S 건너뛰기 · L 기록 · Esc 메뉴 · 1~3 선택지',
        ),
      );
      const foot = el('div', 'panel-foot');
      const reset = button('기본값으로', 'btn', () => {
        this.settings = { ...DEFAULT_SETTINGS };
        this.applySettings();
        for (const i of inputs) {
          i.value = String(this.settings[i.dataset.setting as keyof Settings]);
          i.dispatchEvent(new Event('input'));
        }
      });
      foot.append(reset, button('닫기', 'btn primary', close));
      p.append(foot);
      return p;
    });
  }

  private applySettings() {
    saveSettings(this.store, this.settings);
    this.audio.setVolumes(this.settings.bgmVolume, this.settings.sfxVolume);
    this.applyWindowOpacity();
  }

  private applyWindowOpacity() {
    this.root.style.setProperty('--win-alpha', String(this.settings.windowOpacity / 100));
  }

  private openLog() {
    if (this.mode !== 'play' || this.overlays.length || !this.state) return;
    const state = this.state;
    this.openOverlay((close) => {
      const { p, body } = this.panel('대화 기록', close);
      p.dataset.panel = 'log';
      const list = el('div', 'log-list');
      if (!state.log.length) list.append(el('div', 'log-empty', '아직 기록이 없어요.'));
      for (const e of state.log) {
        const item = el('div', `log-item ${e.kind}`);
        if (e.name) {
          const n = el('span', 'log-name', e.name);
          const who = Object.entries(this.c.speakerNames).find(([, v]) => v === e.name)?.[0];
          if (who && NAME_COLORS[who]) n.style.setProperty('--name-color', NAME_COLORS[who]);
          item.append(n);
        }
        item.append(document.createTextNode(e.text));
        list.append(item);
      }
      body.append(list);
      requestAnimationFrame(() => (body.scrollTop = body.scrollHeight));
      return p;
    });
  }

  /** 확인 대화상자 */
  ask(message: string, o: { ok: string; cancel: string; danger?: boolean }): Promise<boolean> {
    return new Promise((resolve) => {
      let answered = false;
      const done = (v: boolean, close: () => void) => {
        if (answered) return;
        answered = true;
        close();
        resolve(v);
      };
      this.openOverlay((close) => {
        const { p, body } = this.panel('확인', () => done(false, close), true);
        p.dataset.panel = 'confirm';
        body.append(el('p', 'dialog-msg', message));
        const foot = el('div', 'panel-foot');
        const cancel = button(o.cancel, 'btn', () => done(false, close));
        cancel.dataset.action = 'cancel';
        const ok = button(o.ok, o.danger ? 'btn danger' : 'btn primary', () => done(true, close));
        ok.dataset.action = 'ok';
        // 기본 버튼에 포커스(Enter = 확인). 삭제처럼 되돌릴 수 없는 확인창은 실수로 확정되지 않게 취소에 둔다
        (o.danger ? cancel : ok).dataset.autofocus = '';
        foot.append(cancel, ok);
        p.append(foot);
        return p;
      }, false);
    });
  }

  toast(msg: string, ms = 2200): void {
    this.toastEl?.remove();
    if (this.toastTimer) clearTimeout(this.toastTimer);
    const t = el('div', 'toast', msg);
    t.setAttribute('role', 'status');
    this.root.append(t);
    this.toastEl = t;
    this.toastTimer = setTimeout(() => {
      t.remove();
      if (this.toastEl === t) this.toastEl = null;
    }, ms);
  }

  // =========================================================================
  // 화면 배치 / 세로 안내
  // =========================================================================

  private buildRotate(): HTMLElement {
    const r = el('div', 'rotate');
    r.dataset.noadvance = '';
    r.setAttribute('role', 'alertdialog');
    r.append(
      el('div', 'phone'),
      el('p', '', '휴대폰을 가로로 돌려 주세요'),
      el('small', '', '가로 화면에 맞춰 만든 게임이에요. 진행 상황은 그대로 유지돼요.'),
    );
    const keep = button('세로 화면으로 계속하기', 'btn', () => {
      this.rotateDismissed = true;
      this.relayout();
    });
    keep.dataset.action = 'keep-portrait';
    r.append(keep);
    return r;
  }

  relayout(): void {
    const vv = window.visualViewport;
    // 두 손가락 확대 중에는 visualViewport 가 '확대된 보이는 영역' 크기를 돌려준다.
    // 그대로 쓰면 무대가 작게 다시 계산되어 글자가 잘리고 보이는 영역 밖으로 밀려나므로,
    // 배율을 곱해 확대 전(레이아웃 뷰포트) 크기로 계산한다. (iOS Safari 는 확대 중 innerWidth 도 줄어들어 대신 쓸 수 없다)
    // 배율이 1이면 지금처럼 주소창·툴바 변화를 그대로 반영한다.
    const scale = vv && vv.scale > 0 ? vv.scale : 1;
    const zoomed = Math.abs(scale - 1) > 0.01;
    const vw = Math.round(vv ? vv.width * scale : window.innerWidth);
    const vh = Math.round(vv ? vv.height * scale : window.innerHeight);
    const last = this.lastLayoutSize;
    // 확대·이동 중 연달아 오는 resize 의 1~2px 반올림 차이로 배치가 흔들리지 않게 한다
    const jitter = zoomed && last !== null && Math.abs(vw - last.vw) <= 2 && Math.abs(vh - last.vh) <= 2;
    if (!jitter) {
      this.lastLayoutSize = { vw, vh };
      const L = computeLayout(vw, vh, measureSafeArea(this.safeProbe));
      applyLayout(this.root, L);
    }
    const showRotate = isPhonePortrait(vw, vh) && !this.rotateDismissed;
    if (showRotate !== this.rotateShown) {
      this.rotateShown = showRotate;
      this.rotateEl.classList.toggle('on', showRotate);
      this.root.dataset.rotate = showRotate ? '1' : '0';
      if (showRotate) {
        this.clearAutoTimer();
        if (this.skip) this.setSkip(false, true);
      } else {
        this.inputLockUntil = performance.now() + 300;
        this.scheduleAuto();
      }
    }
  }

  // =========================================================================
  // 유틸
  // =========================================================================

  private t(s: string): string {
    return resolveText(s, this.c.vars);
  }

  private speaker(step: SayStep): { name: string | null; color: string; mono: boolean; char: CharId | null } {
    if (step.who === null) return { name: null, color: '', mono: true, char: null };
    const name = step.label ? this.t(step.label) : this.c.speakerNames[step.who] ?? step.who;
    const char = step.who === 'osana' || step.who === 'tenko' ? step.who : null;
    return { name, color: NAME_COLORS[step.who] ?? 'var(--npc)', mono: false, char };
  }

  private storyFailure(e: unknown) {
    console.error(e);
    const msg = e instanceof StoryError ? e.message : String(e);
    void this.ask(`스토리 데이터를 진행하는 중 문제가 생겼어요.\n(${msg})\n타이틀로 돌아갈게요.`, { ok: '타이틀로', cancel: '닫기' }).then(() =>
      this.showTitle(),
    );
  }

  /** 테스트·디버그용 읽기 전용 정보 */
  debugInfo() {
    return {
      mode: this.mode,
      step: this.current?.step.id ?? null,
      frame: this.current?.step.t ?? null,
      route: this.state?.route ?? null,
      points: this.state ? { ...this.state.points } : null,
      lastHeroine: this.state?.lastHeroine ?? null,
      auto: this.auto,
      skip: this.skip,
      overlays: this.overlays.length,
      bg: this.stage.currentBg() ?? null,
      bgm: this.bgmRequested,
      typing: this.textbox.isTyping,
      textOverflow: this.textbox.overflowing(),
      readCount: this.saves.readCount(),
    };
  }
}

/**
 * 입력이 실제로 일어난 시각(performance.now() 와 같은 기준). 메인 스레드가 바빠 늦게 처리된 입력도 제때로 판정한다.
 * timeStamp 가 다른 기준(예전 브라우저의 epoch 값)이거나 이상하면 처리 시각을 쓴다.
 */
function eventTime(e: Event): number {
  const now = performance.now();
  const t = e.timeStamp;
  return Number.isFinite(t) && t > 0 && t <= now + 50 && now - t < 5000 ? t : now;
}

/** 불러오기 결과에 붙은 복원 안내(같은 문구는 한 번만) */
function loadNotes(r: LoadResult): string[] {
  const n = (r as { notes?: unknown }).notes;
  if (!Array.isArray(n)) return [];
  return [...new Set(n.filter((x): x is string => typeof x === 'string' && x.length > 0))];
}

function prefersReducedMotion(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function isFocusVisible(e: HTMLElement): boolean {
  try {
    return e.matches(':focus-visible');
  } catch {
    return false;
  }
}

function fullscreenSupported(): boolean {
  const d = document as Document & { webkitFullscreenEnabled?: boolean };
  return !!(d.fullscreenEnabled || d.webkitFullscreenEnabled);
}
function isFullscreen(): boolean {
  const d = document as Document & { webkitFullscreenElement?: Element };
  return !!(document.fullscreenElement || d.webkitFullscreenElement);
}
async function toggleFullscreen(close: () => void) {
  close();
  try {
    const d = document as Document & { webkitExitFullscreen?: () => void };
    const de = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
    if (isFullscreen()) {
      if (document.exitFullscreen) await document.exitFullscreen();
      else d.webkitExitFullscreen?.();
    } else if (de.requestFullscreen) await de.requestFullscreen({ navigationUI: 'hide' });
    else de.webkitRequestFullscreen?.();
  } catch {
    /* 지원하지 않거나 거부됨: 무시 */
  }
}
