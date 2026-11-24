/**
 * 빠른 메뉴 탭(.qbar): 대사창 위 테두리 오른쪽에 붙은 유리 탭(docs/UI_DESIGN.md 6.4)
 *
 * DOM
 *   .qbar[data-noadvance][role=toolbar]
 *     .hud[data-noadvance]   기록·자동·스킵·메뉴 (테스트 훅 '.hud button' 4개, 글자 '자동' '스킵' '기록' '메뉴')
 *     .qbar-extra            퀵저장·퀵로드·숨기기·설정 (폭이 좁으면 CSS 가 숨김 — 메뉴 안과 단축키로 쓸 수 있음)
 *   두 묶음은 display: contents 로 한 줄에 섞고, 버튼의 data-q 로 CSS order 를 정한다.
 *
 * - 위치·모양은 styles/play.css 가 배치 변수(--hy --hr --btn --tb-grow, #vn[data-qm])로 잡는다.
 *   화면 팀이 el 을 #vn 루트에 붙이고 모드에 따라 보이기·숨기기만 한다.
 * - 새 버튼 글자(퀵저장·퀵로드·숨기기·설정)는 '자동' '스킵' '기록' '메뉴' 를 포함하지 않는다(hasText 부분 일치 충돌 없음).
 * - 탭 폭을 부모의 --qbw 로 알려 이름표 탭이 빠른 메뉴 탭과 겹치지 않게 최대 폭을 줄인다.
 */
import { button, el } from './dom';

export interface QuickBarHandlers {
  log(): void;
  auto(): void;
  skip(): void;
  qsave(): void;
  qload(): void;
  hide(): void;
  settings(): void;
  menu(): void;
}

export interface QuickBar {
  el: HTMLElement;
  setAuto(on: boolean): void;
  setSkip(on: boolean): void;
  /**
   * 탭 글자(기록·자동·스킵·메뉴·퀵저장·퀵로드·숨기기·설정)의 글꼴 조각을 미리 받는다. 탭은 대사 화면에서만 배치되므로
   * (타이틀에서는 받지 않음) 타이틀 키 비주얼이 그려진 뒤 부르면 첫 장면에서 탭 글자가 대체 글꼴로 보이거나
   * 첫 장면 그림과 대역폭을 나누지 않는다. 글꼴 API 가 없으면 아무것도 하지 않는다.
   */
  preloadFont(): void;
}

type QuickKey = keyof QuickBarHandlers;

interface QuickDef {
  key: QuickKey;
  /** data-q 값(CSS 순서·아이콘). 설정은 명세의 data-q="config" */
  q: string;
  label: string;
  title: string;
  /** 보이는 글자와 다른 접근 이름이 필요할 때 */
  aria?: string;
  icon: string;
  group: 'hud' | 'extra';
  toggle?: boolean;
}

/** 표시 순서는 CSS order(기록 1, 자동 2, 스킵 3, 퀵저장 5, 퀵로드 6, 숨기기 8, 설정 9, 메뉴 10) */
const DEFS: readonly QuickDef[] = [
  { key: 'log', q: 'log', label: '기록', title: '대화 기록 (L)', icon: '--i-log', group: 'hud' },
  { key: 'auto', q: 'auto', label: '자동', title: '자동 진행 (A)', icon: '--i-auto', group: 'hud', toggle: true },
  { key: 'skip', q: 'skip', label: '스킵', title: '읽은 대사 건너뛰기 (S)', icon: '--i-skip', group: 'hud', toggle: true },
  { key: 'menu', q: 'menu', label: '메뉴', title: '메뉴 (Esc)', icon: '--i-menu', group: 'hud' },
  { key: 'qsave', q: 'qsave', label: '퀵저장', title: '빠른 저장 (F5)', aria: '빠른 저장', icon: '--i-qsave', group: 'extra' },
  { key: 'qload', q: 'qload', label: '퀵로드', title: '빠른 불러오기 (F9)', aria: '빠른 불러오기', icon: '--i-qload', group: 'extra' },
  { key: 'hide', q: 'hide', label: '숨기기', title: '대사창 숨기기 (H)', aria: '대사창 숨기기', icon: '--i-hide', group: 'extra' },
  { key: 'settings', q: 'config', label: '설정', title: '설정', icon: '--i-config', group: 'extra' },
];

export function createQuickBar(h: QuickBarHandlers): QuickBar {
  const bar = el('div', 'qbar');
  // 처음에는 숨긴 채로 만든다(게임이 대사 화면에서만 보인다). 문서에 붙자마자 한 번 배치될 때 탭 글자
  // (기록·스킵·퀵저장·숨기기…)의 글꼴 조각까지 타이틀에서 받아 키 비주얼과 대역폭을 나누지 않게
  bar.style.display = 'none';
  bar.dataset.noadvance = '';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', '빠른 메뉴');
  const hud = el('div', 'hud');
  hud.dataset.noadvance = '';
  const extra = el('div', 'qbar-extra');
  const buttons = {} as Record<QuickKey, HTMLButtonElement>;

  for (const d of DEFS) {
    // button(): 클릭 전파를 막고, 마우스·터치로 누른 뒤에는 포커스를 놓는다(스페이스·엔터가 다시 누르지 않게)
    const b = button('', 'hud-btn', () => h[d.key]());
    b.dataset.q = d.q;
    b.title = d.title;
    if (d.aria) b.setAttribute('aria-label', d.aria);
    if (d.toggle) b.setAttribute('aria-pressed', 'false');
    const ico = el('span', 'ico');
    ico.setAttribute('aria-hidden', 'true');
    ico.style.setProperty('--i', `var(${d.icon})`);
    b.append(ico, d.label);
    buttons[d.key] = b;
    (d.group === 'hud' ? hud : extra).append(b);
  }
  bar.append(hud, extra);

  // 탭 폭을 부모(#vn)에 알려 이름표 탭의 최대 폭을 정한다(styles/play.css .textbox .name)
  if (typeof ResizeObserver === 'function') {
    let last = -1;
    const ro = new ResizeObserver(() => {
      const host = bar.parentElement;
      if (!host) return;
      const w = Math.round(bar.offsetWidth);
      if (w === last) return;
      last = w;
      if (w > 0) host.style.setProperty('--qbw', `${w}px`);
      else host.style.removeProperty('--qbw');
    });
    ro.observe(bar);
  }

  const press = (b: HTMLButtonElement, on: boolean) => b.setAttribute('aria-pressed', String(on));
  return {
    el: bar,
    setAuto: (on) => press(buttons.auto, on),
    setSkip: (on) => press(buttons.skip, on),
    preloadFont() {
      try {
        // 굵기·크기·글꼴 목록은 CSS(play.css .qbar button)가 정한 그대로 읽는다(숨겨 둔 상태에서도 계산된다)
        const cs = getComputedStyle(buttons.log);
        const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        void document.fonts?.load(font, DEFS.map((d) => d.label).join('')).catch(() => undefined);
      } catch {
        /* 글꼴 API 없음: 무시 */
      }
    },
  };
}
