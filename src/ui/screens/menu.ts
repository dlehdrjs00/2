/**
 * 작은 유리 카드: 게임 메뉴와 확인창(docs/UI_DESIGN.md 6.13)
 *
 * 메뉴 [data-panel=menu]
 *   머리줄 '✦ 메뉴' + ✕ → 3열 아이콘 타일(저장하기·불러오기·대화 기록·설정·전체화면·타이틀로) → '▶ 게임으로 돌아가기'
 *   data-action(save/load/log/settings/fullscreen/title/resume, close)은 테스트 훅이다.
 * 확인창 [data-panel=confirm]
 *   .dialog-msg 에 메시지 전체를 담는다(테스트가 문구를 여기서 찾는다). 첫 줄은 strong.lead(제목처럼),
 *   나머지는 본문, 보충 줄은 small. 오른쪽 아래 취소·확인(data-action=cancel/ok, data-autofocus).
 */
import { button, el } from '../dom';
import { ico, type IconName } from '../icons';

export interface MenuItem {
  action: string;
  label: string;
  icon: IconName;
  run(): void;
}

function smallPanel(name: string, panel: string): HTMLElement {
  const p = el('div', `panel small${panel === 'menu' ? ' menu' : ''}`);
  p.setAttribute('role', 'dialog');
  p.setAttribute('aria-modal', 'true');
  p.setAttribute('aria-label', name);
  p.dataset.panel = panel;
  return p;
}

export function buildMenu(items: MenuItem[], resume: () => void, close: () => void): HTMLElement {
  const p = smallPanel('메뉴', 'menu');
  const head = el('div', 'panel-head');
  const x = button('', 'btn icon', close);
  x.setAttribute('aria-label', '닫기');
  x.dataset.action = 'close';
  x.append(ico('close'));
  head.append(el('h2', '', '메뉴'), x);

  const list = el('div', 'menu-list');
  list.classList.add(`n${items.length}`);
  items.forEach((it, i) => {
    const b = button('', 'btn', () => it.run());
    b.dataset.action = it.action;
    b.append(ico(it.icon), it.label);
    if (i === 0) b.dataset.autofocus = '';
    list.append(b);
  });
  const back = button('', 'btn primary wide', resume);
  back.dataset.action = 'resume';
  back.append(ico('play'), '게임으로 돌아가기');
  list.append(back);
  p.append(head, list);
  return p;
}

/** 확인창 문구: 문자열이면 첫 줄이 질문(lead), 3줄 이상이면 마지막 줄이 보충(small) */
export type AskMessage = string | { lead: string; body?: string; note?: string };

export interface AskOptions {
  ok: string;
  cancel: string;
  danger?: boolean;
}

function normalize(m: AskMessage): { lead: string; body: string; note: string } {
  if (typeof m !== 'string') return { lead: m.lead, body: m.body ?? '', note: m.note ?? '' };
  const lines = m.split('\n');
  const lead = lines.shift() ?? '';
  const note = lines.length >= 2 ? lines.pop()! : '';
  return { lead, body: lines.join('\n'), note };
}

export function buildConfirm(message: AskMessage, o: AskOptions, answer: (yes: boolean) => void): HTMLElement {
  const p = smallPanel('확인', 'confirm');
  p.classList.add('confirm');
  const h = el('h2', 'sr-only', '확인');
  const m = normalize(message);
  const msg = el('p', 'dialog-msg');
  msg.id = `vn-dialog-msg-${Math.random().toString(36).slice(2, 8)}`;
  msg.append(el('strong', 'lead', m.lead));
  if (m.body) msg.append(m.body);
  if (m.note) msg.append(el('small', '', m.note));
  p.setAttribute('aria-describedby', msg.id);

  const foot = el('div', 'panel-foot');
  const cancel = button(o.cancel, 'btn', () => answer(false));
  cancel.dataset.action = 'cancel';
  const ok = button(o.ok, o.danger ? 'btn danger' : 'btn primary', () => answer(true));
  ok.dataset.action = 'ok';
  // 기본 버튼에 포커스(Enter = 확인). 삭제처럼 되돌릴 수 없는 확인창은 실수로 확정되지 않게 취소에 둔다
  (o.danger ? cancel : ok).dataset.autofocus = '';
  foot.append(cancel, ok);
  p.append(h, msg, foot);
  return p;
}
