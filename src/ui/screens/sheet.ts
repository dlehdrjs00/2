/**
 * 시스템 시트(docs/UI_DESIGN.md 6.9): 저장하기·불러오기·설정·대화 기록을 한 오버레이 안의 탭으로 오간다.
 *
 * .panel.sys[role=dialog][data-panel=<탭>]
 *   .panel-head: h2.sr-only(화면 이름) · .head-star · .sys-tabs[role=tablist] · 빈칸 · .btn.close
 *   .panel-body[role=tabpanel]  (탭마다 .sl / .cfg / .log)
 *   .panel-hint 또는 .panel-foot (탭마다)
 *
 * - 탭을 바꿔도 오버레이는 하나다. 같은 패널의 본문만 다시 그리고 data-panel 을 바꾼다
 *   (Esc 한 번에 닫히고, inert·포커스 복귀 로직이 그대로 유지된다).
 * - 탭은 ←/→/Home/End 로 옮겨 다닌다(선택된 탭만 Tab 순서에 들어간다).
 */
import { el } from '../dom';
import { ico, type IconName } from '../icons';

export type SheetTab = 'save' | 'load' | 'settings' | 'log';

export const SHEET_LABEL: Record<SheetTab, string> = {
  save: '저장하기',
  load: '불러오기',
  settings: '설정',
  log: '대화 기록',
};

const SHEET_ICON: Record<SheetTab, IconName> = { save: 'qsave', load: 'qload', settings: 'config', log: 'log' };

/** 탭 하나의 본문 */
export interface SheetView {
  /** .panel-body */
  body: HTMLElement;
  /** 본문 아래 줄(.panel-hint / .panel-foot) */
  after?: HTMLElement;
  /** 저장 목록 다시 그리기 등(확인창이 닫힌 뒤 부른다) */
  refresh?(): void;
  /** 타이머 정리 등(탭을 바꾸거나 닫을 때) */
  dispose?(): void;
  /** 문서에 붙은 직후(스크롤 위치 등) */
  shown?(): void;
}

export interface SheetPanel extends HTMLElement {
  refresh?: () => void;
  dispose?: () => void;
}

export interface SheetOptions {
  tabs: SheetTab[];
  initial: SheetTab;
  render(tab: SheetTab): SheetView;
  close(): void;
  /** 탭이 바뀐 뒤(처음 그릴 때 제외): 입력 잠금·inert 갱신 */
  switched(tab: SheetTab): void;
}

export interface Sheet {
  panel: SheetPanel;
  select(tab: SheetTab, focusTab?: boolean): void;
  current(): SheetTab;
  view(): SheetView | null;
}

let seq = 0;

export function buildSheet(o: SheetOptions): Sheet {
  const uid = `vn-sheet-${++seq}`;
  const p = el('div', 'panel sys') as SheetPanel;
  p.setAttribute('role', 'dialog');
  p.setAttribute('aria-modal', 'true');

  const head = el('div', 'panel-head');
  const h2 = el('h2', 'sr-only');
  const star = el('span', 'head-star');
  star.setAttribute('aria-hidden', 'true');
  const tablist = el('div', 'sys-tabs');
  tablist.setAttribute('role', 'tablist');
  tablist.setAttribute('aria-label', '시스템 화면');
  const tabBtns = new Map<SheetTab, HTMLButtonElement>();
  for (const t of o.tabs) {
    const b = el('button');
    b.type = 'button';
    b.id = `${uid}-tab-${t}`;
    b.dataset.tab = t;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-controls', `${uid}-body`);
    b.append(ico(SHEET_ICON[t]), SHEET_LABEL[t]);
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      select(t);
      if (ev.detail > 0) b.blur();
    });
    tabBtns.set(t, b);
    tablist.append(b);
  }
  tablist.addEventListener('keydown', (ev) => {
    const i = o.tabs.indexOf(cur);
    let next = -1;
    if (ev.key === 'ArrowRight') next = (i + 1) % o.tabs.length;
    else if (ev.key === 'ArrowLeft') next = (i - 1 + o.tabs.length) % o.tabs.length;
    else if (ev.key === 'Home') next = 0;
    else if (ev.key === 'End') next = o.tabs.length - 1;
    if (next < 0) return;
    ev.preventDefault();
    select(o.tabs[next], true);
  });

  const close = el('button', 'btn close');
  close.type = 'button';
  close.dataset.action = 'close';
  close.setAttribute('aria-label', '닫기');
  close.append(ico('close'), el('span', 'lbl', '닫기'));
  close.addEventListener('click', (ev) => {
    ev.stopPropagation();
    o.close();
  });
  head.append(h2, star, tablist, el('span', 'grow'), close);
  p.append(head);

  let cur: SheetTab = o.initial;
  let view: SheetView | null = null;
  let first = true;

  function select(t: SheetTab, focusTab = false) {
    if (view && t === cur) return;
    view?.dispose?.();
    view?.body.remove();
    view?.after?.remove();
    cur = t;
    const v = o.render(t);
    v.body.id = `${uid}-body`;
    v.body.setAttribute('role', 'tabpanel');
    v.body.setAttribute('aria-labelledby', `${uid}-tab-${t}`);
    if (!first) v.body.classList.add('enter');
    p.append(v.body);
    if (v.after) p.append(v.after);
    for (const [k, b] of tabBtns) {
      const on = k === t;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
      // 시트를 열 때 포커스는 선택된 탭에(오버레이가 [data-autofocus] 를 먼저 찾는다)
      if (on) b.dataset.autofocus = '';
      else delete b.dataset.autofocus;
    }
    h2.textContent = SHEET_LABEL[t];
    p.setAttribute('aria-label', SHEET_LABEL[t]);
    p.dataset.panel = t;
    view = v;
    if (focusTab) tabBtns.get(t)?.focus({ preventScroll: true });
    if (first) {
      // 처음엔 패널이 아직 문서에 없다: 붙은 다음 프레임에 shown
      first = false;
      requestAnimationFrame(() => {
        if (view === v) v.shown?.();
      });
    } else {
      v.shown?.();
      o.switched(t);
    }
  }

  select(o.initial);
  p.refresh = () => view?.refresh?.();
  p.dispose = () => view?.dispose?.();
  return { panel: p, select, current: () => cur, view: () => view };
}
