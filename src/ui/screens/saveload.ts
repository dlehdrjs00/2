/**
 * 저장·불러오기 본문(docs/UI_DESIGN.md 6.10)
 *
 * .panel-body.sl
 *   nav.rail[aria-label=쪽]  자동·퀵 / 1~5쪽(쪽당 6칸 = 수동 30칸), 지금 쪽은 aria-current=page
 *   .slots                  카드 3×2(넓은 화면) / 가로형 2×3(낮은 화면) / 1×6(좁은 화면)
 * .panel-hint               안내 + 쪽 번호
 *
 * 카드: .slot-wrap > button.slot[data-slot](.latest .empty .can-save .broken) + .slot-del
 *   썸네일은 저장된 무대 상태로 그린 미니 무대, 왼쪽 위 .slot-no(01·자동·퀵), 루트 배지 .slot-route
 *   정보: .slot-line1(.slot-r? .slot-name .slot-meta) + .slot-text
 *         '장면 처음부터' 복구 저장(SlotPeek.recover)은 .slot.recover, 발췌 줄이 .slot-line2(.slot-recover 배지 + .slot-text)
 *         이 탭 메모리에만 있는 칸(SaveManager.slotPersisted 가 false)은 .slot.tab-only, 발췌 줄 앞에 .slot-tabonly 배지 '이 탭에만'.
 *         칸마다 따로 판단한다(다른 칸·자동 저장의 상태와 섞지 않음)
 * 안내 줄(.panel-hint): 브라우저 저장소를 쓸 수 없음 > 자동 저장이 이 탭에만 > 이 쪽에 '이 탭에만' 칸이 있음 > 평소 안내.
 *   앞의 셋은 .warn 이고, 낮은 화면(높이 540px 이하)에서도 보인다(평소 안내는 숨김)
 * 테스트 훅: .slot[data-slot], .slot-wrap > .slot + .slot-del, .slot-meta, .slot-name, .slot-text, .broken, 빈 칸 disabled(불러오기)
 */
import { MANUAL_SLOTS, type SaveManager, type SlotId, type SlotPeek } from '../../engine/save';
import type { HeroineId, StageState } from '../../engine/types';
import { el, formatSlotDate } from '../dom';
import { ico } from '../icons';
import { ROUTE_COLORS, routeName } from './common';
import type { SheetView } from './sheet';

export type SlotPage = 'q' | 1 | 2 | 3 | 4 | 5;
export const PAGE_SIZE = 6;
export const PAGES = Math.ceil(MANUAL_SLOTS / PAGE_SIZE) as 5;

export interface SaveLoadOptions {
  kind: 'save' | 'load';
  saves: SaveManager;
  /** 이번 세션에서 마지막으로 본 쪽(메모리) */
  lastPage: SlotPage | null;
  setLastPage(p: SlotPage): void;
  /** 지금 저장할 수 있는지(플레이 중) */
  canSave: boolean;
  slotName(slot: SlotId): string;
  heroineName(h: HeroineId): string;
  /** 저장 시각만 빠르게(가장 최근 카드 표시용) */
  savedAt(slot: SlotId): string | null;
  thumb(stage: StageState | undefined): HTMLElement;
  onSave(slot: SlotId, filled: boolean): void;
  onLoad(slot: SlotId): void;
  onDelete(slot: SlotId): void;
}

export interface SaveLoadView extends SheetView {
  /** 방금 저장한 카드의 분홍 테를 한 번 빛낸다 */
  pulse(slot: SlotId): void;
}

export function pageSlots(page: SlotPage): SlotId[] {
  if (page === 'q') return ['auto', 'quick'];
  const out: SlotId[] = [];
  for (let i = (page - 1) * PAGE_SIZE + 1; i <= Math.min(MANUAL_SLOTS, page * PAGE_SIZE); i++) out.push(String(i) as SlotId);
  return out;
}

export function pageOf(slot: SlotId): SlotPage {
  if (slot === 'auto' || slot === 'quick') return 'q';
  return Math.min(PAGES, Math.max(1, Math.ceil(Number(slot) / PAGE_SIZE))) as SlotPage;
}

/**
 * 처음 열 때 보이는 쪽: 이번 세션에서 마지막으로 본 쪽 → 없으면 1쪽.
 * 단, 불러오기에서 1~5쪽이 모두 비어 있고 자동·퀵에 저장이 있으면 자동·퀵 쪽.
 */
export function initialPage(kind: 'save' | 'load', saves: SaveManager, last: SlotPage | null): SlotPage {
  if (kind === 'load') {
    let manual = false;
    for (let i = 1; i <= MANUAL_SLOTS && !manual; i++) manual = saves.exists(String(i) as SlotId);
    if (!manual && (saves.exists('auto') || saves.exists('quick'))) return 'q';
  }
  return last ?? 1;
}

const slotNo = (slot: SlotId) => (slot === 'auto' ? '자동' : slot === 'quick' ? '퀵' : slot.padStart(2, '0'));

export function buildSaveLoad(o: SaveLoadOptions): SaveLoadView {
  const body = el('div', 'panel-body sl');
  const rail = el('nav', 'rail');
  rail.setAttribute('aria-label', '쪽');
  const grid = el('div', 'slots');
  body.append(rail, grid);

  const hint = el('div', 'panel-hint');
  const hintText = el('span', 'hint-text');
  const pageno = el('span', 'pageno');
  hint.append(ico('star'), hintText, el('span', 'grow'), pageno);

  let page = initialPage(o.kind, o.saves, o.lastPage);
  /** 지금 쪽에서 '이 탭에만' 배지를 단 칸(render 마다 다시 센다) */
  const tabOnlyShown = new Set<SlotId>();
  const railBtns = new Map<SlotPage, HTMLButtonElement>();
  const pages: SlotPage[] = ['q', 1, 2, 3, 4, 5];
  for (const pg of pages) {
    const b = el('button');
    b.type = 'button';
    b.dataset.page = String(pg);
    if (pg === 'q') {
      b.append(el('span', 'q', '자동·퀵'));
      b.setAttribute('aria-label', '자동 저장·퀵저장 쪽');
    } else {
      b.textContent = String(pg);
      b.setAttribute('aria-label', `${pg}쪽`);
    }
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (page !== pg) {
        page = pg;
        o.setLastPage(pg);
        render();
      }
      if (ev.detail > 0) b.blur();
    });
    railBtns.set(pg, b);
    rail.append(b);
  }

  /** 가장 최근 저장 칸(분홍 테). 저장 화면은 자동 저장을 빼고 고른다. 날짜로 읽을 수 없는 저장 시각은 건너뛴다 */
  function latestSlot(): SlotId | null {
    const cands: SlotId[] = ['quick'];
    if (o.kind === 'load') cands.push('auto');
    for (let i = 1; i <= MANUAL_SLOTS; i++) cands.push(String(i) as SlotId);
    let best: { slot: SlotId; at: number } | null = null;
    for (const s of cands) {
      const raw = o.savedAt(s);
      const at = raw ? Date.parse(raw) : NaN;
      if (!Number.isNaN(at) && (!best || at > best.at)) best = { slot: s, at };
    }
    return best?.slot ?? null;
  }

  function card(slot: SlotId, latest: SlotId | null): HTMLElement {
    const wrap = el('div', 'slot-wrap');
    const info: SlotPeek = o.saves.peek(slot);
    /** 이 칸만 본다: 읽을 수 있는 내용이 있고 브라우저 저장소에 들어가 있지 않음 */
    const tabOnly = !info.empty && !info.broken && !o.saves.slotPersisted(slot);
    if (tabOnly) tabOnlyShown.add(slot);
    const name = o.slotName(slot);
    const b = el('button', 'slot');
    b.type = 'button';
    b.dataset.slot = slot;
    const no = el('span', `slot-no${slot === 'auto' || slot === 'quick' ? ' wide' : ''}`, slotNo(slot));
    no.setAttribute('aria-hidden', 'true');
    const line1 = el('span', 'slot-line1');
    const infoEl = el('span', 'slot-info');
    let label = name;

    if (info.empty) {
      wrap.classList.add('is-empty');
      b.classList.add('empty');
      const thumb = el('span', 'slot-thumb');
      const saveHere = o.kind === 'save' && o.canSave && slot !== 'auto';
      if (saveHere) {
        b.classList.add('can-save');
        thumb.dataset.empty = '＋ 여기에 저장';
        line1.append(el('span', 'slot-name', '여기에 저장'));
        infoEl.append(line1, el('span', 'slot-text', '비어 있는 칸'));
        label = `${name}: 비어 있음, 여기에 저장`;
      } else {
        thumb.dataset.empty = '비어 있음';
        line1.append(el('span', 'slot-name', slot === 'auto' ? '자동 저장 없음' : slot === 'quick' ? '퀵저장 없음' : '비어 있음'));
        infoEl.append(line1, el('span', 'slot-text', slot === 'quick' ? '빠른 메뉴 [퀵저장]·F5' : '아직 저장하지 않은 칸'));
        b.disabled = true;
        label = `${name}: 비어 있음`;
      }
      thumb.append(no);
      b.append(thumb, infoEl);
    } else if (info.broken) {
      b.classList.add('broken');
      const thumb = el('span', 'slot-thumb');
      thumb.dataset.empty = '!';
      thumb.append(no);
      line1.append(el('span', 'slot-name', name));
      infoEl.append(line1, el('span', 'slot-text', '읽을 수 없는 저장 데이터'));
      b.append(thumb, infoEl);
      label = `${name}: 읽을 수 없는 저장 데이터`;
    } else {
      const s = info.summary;
      const thumb = o.thumb(info.stage);
      thumb.append(no);
      const route = s?.route ?? null;
      if (route) {
        // 히든 루트('group')는 '네 사람 루트'와 고유 색(ROUTE_COLORS). 모르는 값이면 공통 색으로 둔다(TypeError 방지)
        const rName = routeName(route, o.heroineName);
        const rColor = (ROUTE_COLORS[route] ?? ROUTE_COLORS.group).c1;
        const r = el('span', 'slot-route', `${rName} 루트`);
        r.style.setProperty('--r', rColor);
        thumb.append(r);
        const dot = el('span', 'slot-r');
        dot.style.setProperty('--r', rColor);
        dot.title = `${rName} 루트`;
        line1.append(dot);
      }
      const date = formatSlotDate(info.savedAt ?? '');
      const title = s?.sceneTitle || name;
      const text = s?.text ?? '';
      // 저장 시각·발췌를 읽을 수 없어도(일부 손상) 정보 줄 높이는 그대로 둔다(썸네일만 커지지 않게)
      line1.append(el('span', 'slot-name', title), el('span', 'slot-meta', date || '날짜 모름'));
      const textEl = el('span', 'slot-text', text || '\u00a0');
      const badges: HTMLElement[] = [];
      if (tabOnly) {
        // 브라우저 저장소에 쓰지 못해 이 탭 메모리에만 있는 칸(새로고침하면 브라우저에 남은 이전 내용으로 돌아간다)
        const badge = el('span', 'slot-tabonly', '이 탭에만');
        badge.title = '브라우저에 저장하지 못해 이 탭에만 있어요. 새로고침하거나 탭을 닫으면 사라져요';
        badges.push(badge);
      }
      if (info.recover) {
        // 저장한 문장이 대본에서 바뀌어 '장면 처음부터' 이어지는 저장
        const badge = el('span', 'slot-recover', '장면 처음부터');
        badge.title = '저장한 문장이 바뀌어 이 장면 처음부터 이어져요';
        badges.push(badge);
      }
      if (badges.length) {
        // 발췌 앞에 작은 배지(같은 줄, 정보 줄 높이 그대로)
        const row = el('span', 'slot-line2');
        row.append(...badges, textEl);
        infoEl.append(line1, row);
      } else infoEl.append(line1, textEl);
      b.append(thumb, infoEl);
      if (slot === latest) b.classList.add('latest');
      if (info.recover) b.classList.add('recover');
      if (tabOnly) b.classList.add('tab-only');
      // 읽어 줄 이름: 빈 구절은 빼고 이어 붙인다('슬롯 5: 슬롯 5, . ' 처럼 읽히지 않게)
      const what = [title !== name ? title : '', route ? `${routeName(route, o.heroineName)} 루트` : ''].filter(Boolean).join(' · ');
      const recoverNote = info.recover ? ' 저장한 문장이 바뀌어 장면 처음부터 이어져요.' : '';
      const tabNote = tabOnly ? ' 이 탭에만 저장돼 있어 새로고침하거나 탭을 닫으면 사라져요.' : '';
      label = `${name}${what ? `: ${what}` : ''}${date ? `, ${date}` : ''}.${tabNote}${recoverNote}${text ? ` ${text}` : ''}`;
    }
    b.setAttribute('aria-label', label);

    if (o.kind === 'save' && slot === 'auto') {
      // 자동 저장 칸에는 직접 저장하지 않는다(대사가 바뀔 때마다 자동으로 기록)
      b.disabled = true;
      b.title = '자동 저장은 대사가 바뀔 때마다 기록돼요';
    }
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (o.kind === 'save') o.onSave(slot, !info.empty);
      else o.onLoad(slot);
    });
    wrap.append(b);

    if (!info.empty && slot !== 'auto') {
      const del = el('button', 'slot-del');
      del.type = 'button';
      del.setAttribute('aria-label', `${name} 삭제`);
      del.title = '삭제';
      del.append(ico('trash'));
      del.addEventListener('click', (ev) => {
        ev.stopPropagation();
        o.onDelete(slot);
        if (ev.detail > 0) del.blur();
      });
      wrap.append(del);
    }
    return wrap;
  }

  function render() {
    for (const [pg, b] of railBtns) {
      if (pg === page) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    }
    const latest = latestSlot();
    tabOnlyShown.clear();
    grid.replaceChildren(...pageSlots(page).map((s) => card(s, latest)));
    grid.classList.toggle('q', page === 'q');
    const autoTabOnly = o.saves.exists('auto') && !o.saves.slotPersisted('auto');
    /** 이 쪽에 '이 탭에만' 배지를 단 칸이 있음(배지와 같은 판단) */
    const pageTabOnly = tabOnlyShown.size > 0;
    hint.classList.remove('warn');
    if (!o.saves.canPersist) {
      // 브라우저 저장소를 쓸 수 없음(사생활 보호 모드 등): 저장은 이 탭의 메모리에만 남는다
      hint.classList.add('warn');
      hintText.textContent = '지금은 브라우저 저장소를 쓸 수 없어, 이 탭을 닫거나 새로고침하면 저장이 사라져요.';
      pageno.textContent = page === 'q' ? '자동·퀵' : `${page} / ${PAGES}쪽`;
    } else if (autoTabOnly) {
      // 자동 저장만의 판단(다른 칸 상태와 섞지 않음). 시트를 열어도 위험이 보이게
      hint.classList.add('warn');
      hintText.textContent = '자동 저장이 이 탭에만 있어요. 새로고침하거나 탭을 닫으면 최근 진행이 사라질 수 있어요.';
      pageno.textContent = page === 'q' ? '자동·퀵' : `${page} / ${PAGES}쪽`;
    } else if (pageTabOnly) {
      hint.classList.add('warn');
      hintText.textContent = "'이 탭에만' 칸은 브라우저에 저장하지 못한 칸이에요. 새로고침하거나 탭을 닫으면 사라져요.";
      pageno.textContent = page === 'q' ? '자동·퀵' : `${page} / ${PAGES}쪽`;
    } else if (page === 'q') {
      hintText.textContent =
        o.kind === 'save'
          ? '퀵저장 칸에 저장할 수 있어요. 자동 저장은 대사가 바뀔 때마다 따로 기록돼요.'
          : '자동 저장은 대사가 바뀔 때마다, 퀵저장은 빠른 메뉴의 [퀵저장]·F5 로 기록돼요.';
      pageno.textContent = '자동·퀵';
    } else {
      hintText.textContent =
        o.kind === 'save'
          ? '칸을 누르면 지금 장면을 저장해요. 자동 저장과 퀵저장은 [자동·퀵] 쪽에 있어요.'
          : '불러올 칸을 고르세요. 자동 저장과 퀵저장은 [자동·퀵] 쪽에 있어요.';
      pageno.textContent = `${page} / ${PAGES}쪽`;
    }
  }

  render();
  return {
    body,
    after: hint,
    refresh: render,
    pulse(slot: SlotId) {
      if (pageOf(slot) !== page) return;
      const c = grid.querySelector<HTMLElement>(`.slot[data-slot="${slot}"]`);
      if (!c) return;
      c.classList.remove('saved');
      void c.offsetWidth;
      c.classList.add('saved');
      setTimeout(() => c.classList.remove('saved'), 900);
    },
  };
}
