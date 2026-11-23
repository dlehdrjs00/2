/**
 * 추억 앨범(이벤트 CG 갤러리, docs/UI_DESIGN.md 6.17) — 타이틀 시스템 시트의 탭 하나 + 전체 화면 감상(뷰어)
 *
 * 앨범 본문
 *   .panel-body.album[data-seen][data-total]
 *     .album-sum                      모은 추억 n / 11 + 진행 막대 + 한 줄 안내
 *     section.album-group[data-route] 히로인별 묶음(CGS[id].route, 공통 CG 는 '공통' 묶음)
 *       .album-head                   이름 알약(인물 색) + n / m + 장식선
 *       ul.album-grid > li > button.cg-card[data-cg][data-seen]
 *         본 칸   : .cg-photo > img(작은 그림) + .cg-cap(제목). 누르면 뷰어
 *         잠긴 칸 : .locked[aria-disabled=true], .cg-photo(사선 무늬 + 자물쇠) + .cg-cap('???')
 *   .panel-hint                       안내 + 모은 수
 *   열 때 앞쪽 묶음이 모두 잠겨 있고 뒤쪽 묶음에 본 칸이 있으면, 본문을 첫 '본 칸이 있는 묶음'까지 스크롤해 둔다(shown).
 *
 * 뷰어(.overlay.viewer > .viewer[role=dialog][data-panel=viewer][data-cg])
 *   .vw-stage(그림 밖 빈 곳 = 닫기, 그림 = 글자·버튼 숨기기) > .vw-frame(같은 그림을 흐린 바탕 + contain 원본)
 *   .vw-close · .vw-nav.prev/.next · .vw-cap(인물·제목·몇 번째)
 *   ←/→ · PageUp/PageDown · Home/End · 화면 좌우 버튼 · 스와이프로 '본 그림' 사이를 오가고(끝에서 처음으로 돈다),
 *   Esc(게임의 오버레이 스택이 닫음) · 닫기 · 빈 곳 클릭으로 닫는다. 그림은 해독한 뒤 페이드로 바뀐다.
 *   그림을 누르거나 H 를 누르면 글자·버튼을 숨기고, 숨긴 동안에는 아무 클릭·키(화살표·Esc 제외)나 다시 보이게 한다.
 *
 * 입력 안전: 클릭은 모두 여기서 전파를 멈추고(오버레이도 [data-noadvance]), 키는 game.ts 가 맨 위 오버레이의 onKey 로만 넘긴다.
 */
import type { HeroineId } from '../../engine/types';
import { HEROINES } from '../../engine/types';
import { cssUrl, el } from '../dom';
import { ico } from '../icons';
import { HEROINE_COLORS, prefersReducedMotion } from './common';
import type { SheetView } from './sheet';

export interface AlbumEntry {
  id: string;
  title: string;
  /** 어느 히로인 루트의 장면인지(공통이면 null) */
  route: HeroineId | null;
}

export interface AlbumItem extends AlbumEntry {
  seen: boolean;
}

export interface AlbumGroup {
  route: HeroineId | null;
  items: AlbumItem[];
  seen: number;
}

export interface AlbumModel {
  groups: AlbumGroup[];
  seen: number;
  total: number;
  /** 감상할 수 있는(본) 그림 id. 화면에 놓인 순서(묶음 순서 → 목록 순서) */
  order: string[];
}

/**
 * 앨범 목록 모델. catalog 순서(CG_ORDER)를 지키며 히로인 순서대로 묶고, 공통(또는 알 수 없는 루트) 묶음은 맨 뒤.
 * seen 에 있는 알 수 없는 id(예전 기록·이름이 바뀐 CG)는 세지 않는다.
 */
export function albumModel(catalog: readonly AlbumEntry[], seen: Iterable<string>, routes: readonly HeroineId[] = HEROINES): AlbumModel {
  const have = new Set(seen);
  const keyOf = (r: HeroineId | null) => (r !== null && routes.includes(r) ? r : null);
  const keys: Array<HeroineId | null> = [...routes, null];
  const groups = keys
    .map((route) => {
      const items = catalog.filter((c) => keyOf(c.route) === route).map((c) => ({ ...c, seen: have.has(c.id) }));
      return { route, items, seen: items.filter((i) => i.seen).length };
    })
    .filter((g) => g.items.length > 0);
  const order = groups.flatMap((g) => g.items.filter((i) => i.seen).map((i) => i.id));
  return { groups, seen: order.length, total: catalog.length, order };
}

/** n 개 사이에서 i 에서 d 만큼 옮긴 자리(끝에서 처음으로 돈다) */
export function wrapIndex(n: number, i: number, d: number): number {
  if (n <= 0) return 0;
  return (((i + d) % n) + n) % n;
}

// ===========================================================================
// 앨범 본문(시트 탭)
// ===========================================================================

export interface AlbumOptions {
  catalog: readonly AlbumEntry[];
  seen: readonly string[];
  heroineName(h: HeroineId): string;
  thumbUrl(id: string): string | null;
  /** 본 그림을 눌렀을 때: order(본 그림, 화면 순서)의 start 번째부터 감상 */
  view(order: string[], start: number): void;
}

export interface AlbumView extends SheetView {
  /** 감상을 마친 뒤: 마지막으로 본 칸을 보이게 하고, 포커스가 앨범 칸으로 돌아와 있으면 그 칸으로 옮긴다 */
  reveal(id: string): void;
}

const NOTE_EMPTY = '이야기 속 특별한 순간을 만나면 여기에 한 장씩 모여요.';
const NOTE_SOME = '모은 추억은 새 게임을 해도 그대로 남아요.';
const NOTE_ALL = '모든 추억을 모았어요. 함께해 줘서 고마워요!';
/** 앨범을 열 때 첫 '본 칸이 있는 묶음'으로 옮기면 그 묶음 머리줄 위에 남길 여백(px) */
const ALBUM_SCROLL_MARGIN = 8;

export function groupLabel(route: HeroineId | null, name: (h: HeroineId) => string): string {
  return route ? name(route) : '공통';
}

export function buildAlbum(o: AlbumOptions): AlbumView {
  const model = albumModel(o.catalog, o.seen);
  const body = el('div', 'panel-body album');
  body.dataset.seen = String(model.seen);
  body.dataset.total = String(model.total);

  // 모은 수 + 진행 막대 + 한 줄 안내
  const sum = el('div', 'album-sum');
  const lab = el('span', 'album-lab', '모은 추억');
  const count = el('span', 'album-total');
  count.append(el('b', '', String(model.seen)), ` / ${model.total}`);
  const bar = el('span', 'album-bar');
  bar.setAttribute('role', 'progressbar');
  bar.setAttribute('aria-label', '모은 추억');
  bar.setAttribute('aria-valuemin', '0');
  bar.setAttribute('aria-valuemax', String(model.total));
  bar.setAttribute('aria-valuenow', String(model.seen));
  bar.setAttribute('aria-valuetext', `${model.total}장 중 ${model.seen}장`);
  const fill = el('span', 'album-fill');
  fill.style.setProperty('--p', `${model.total ? (model.seen / model.total) * 100 : 0}%`);
  bar.append(fill);
  const note = el('span', 'album-note', model.seen === 0 ? NOTE_EMPTY : model.seen >= model.total ? NOTE_ALL : NOTE_SOME);
  sum.append(lab, count, bar, note);
  if (model.total > 0 && model.seen >= model.total) sum.classList.add('complete');
  body.append(sum);

  const cards = new Map<string, HTMLButtonElement>();
  const sections: HTMLElement[] = [];
  for (const g of model.groups) {
    const sec = el('section', 'album-group');
    sections.push(sec);
    sec.dataset.route = g.route ?? 'common';
    const colors = g.route ? HEROINE_COLORS[g.route] : { c1: 'var(--npc-1)', c2: 'var(--npc-2)' };
    sec.style.setProperty('--c1', colors.c1);
    sec.style.setProperty('--c2', colors.c2);
    const name = groupLabel(g.route, o.heroineName);
    const head = el('div', 'album-head');
    const h3 = el('h3', 'album-name', name);
    const gc = el('span', 'album-count', `${g.seen} / ${g.items.length}`);
    gc.setAttribute('aria-label', `${g.items.length}장 중 ${g.seen}장`);
    const rule = el('span', 'album-rule');
    rule.setAttribute('aria-hidden', 'true');
    head.append(h3, gc, rule);
    const grid = el('ul', 'album-grid');
    grid.setAttribute('aria-label', `${name} 추억`);
    g.items.forEach((item) => {
      const li = el('li', 'album-item');
      const card = buildCard(item, o, model);
      cards.set(item.id, card);
      li.append(card);
      grid.append(li);
    });
    sec.append(head, grid);
    body.append(sec);
  }

  const hint = el('div', 'panel-hint album-hint');
  const pageno = el('span', 'pageno', `${model.seen} / ${model.total}장`);
  hint.append(
    ico('star'),
    el('span', 'hint-text', '본 장면을 누르면 크게 볼 수 있어요. 크게 볼 때는 ←/→·스와이프로 넘기고, 그림을 누르면 글자를 숨겨요.'),
    el('span', 'grow'),
    pageno,
  );

  return {
    body,
    after: hint,
    shown() {
      // 앞쪽 묶음을 하나도 보지 못했고 뒤쪽 묶음에 본 칸이 있으면(예: 히나 루트만 끝냄), 처음 보이는 곳을
      // 첫 '본 칸이 있는 묶음'으로 옮긴다. 낮은 화면에서 잠긴 묶음만 보여 '전부 잠김'처럼 보이지 않게. 묶음 순서는 그대로.
      const first = model.groups.findIndex((g) => g.seen > 0);
      if (first <= 0 || body.scrollHeight <= body.clientHeight + 1) return;
      const top = sections[first].getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop;
      body.scrollTo({ top: Math.max(0, top - ALBUM_SCROLL_MARGIN), behavior: 'instant' as ScrollBehavior });
    },
    reveal(id: string) {
      const c = cards.get(id);
      if (!c) return;
      c.scrollIntoView({ block: 'nearest' });
      const a = document.activeElement;
      // 키보드로 연 경우(게임이 포커스를 앨범 칸으로 돌려준 경우)에만 마지막으로 본 칸으로 옮긴다
      if (a instanceof HTMLElement && a !== c && a.classList.contains('cg-card') && body.contains(a)) c.focus({ preventScroll: true });
    },
  };
}

function buildCard(item: AlbumItem, o: AlbumOptions, model: AlbumModel): HTMLButtonElement {
  const b = el('button', 'cg-card');
  b.type = 'button';
  b.dataset.cg = item.id;
  b.dataset.seen = item.seen ? '1' : '0';
  const photo = el('span', 'cg-photo');
  photo.setAttribute('aria-hidden', 'true');
  const cap = el('span', 'cg-cap', item.seen ? item.title : '???');
  cap.setAttribute('aria-hidden', 'true');
  b.append(photo, cap);
  if (item.seen) {
    const url = o.thumbUrl(item.id);
    if (url) {
      const img = el('img');
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.draggable = false;
      img.addEventListener('load', () => img.classList.add('in'));
      img.addEventListener('error', () => img.remove());
      img.src = url;
      if (img.complete && img.naturalWidth > 0) img.classList.add('in');
      photo.append(img);
    }
    b.setAttribute('aria-label', `${item.title} — 크게 보기`);
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      o.view(model.order, Math.max(0, model.order.indexOf(item.id)));
    });
  } else {
    b.classList.add('locked');
    b.setAttribute('aria-disabled', 'true');
    b.setAttribute('aria-label', '아직 보지 못한 추억');
    b.title = '아직 보지 못한 추억이에요';
    photo.append(ico('lock'));
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      // 잠긴 칸: 자물쇠만 살짝 흔든다(아무것도 열지 않음)
      b.classList.remove('nudge');
      void b.offsetWidth;
      b.classList.add('nudge');
      if (ev.detail > 0) b.blur();
    });
  }
  return b;
}

// ===========================================================================
// 뷰어(전체 화면 감상)
// ===========================================================================

export interface ViewerOptions {
  /** 감상할 그림(본 그림만, 화면 순서) */
  items: AlbumEntry[];
  start: number;
  /** 원본 */
  url(id: string): string | null;
  /** 작은 그림(흐린 바탕용 — 이미 받아 둔 것이라 바로 그려진다) */
  thumbUrl(id: string): string | null;
  heroineName(h: HeroineId): string;
  close(): void;
}

export interface ViewerPanel extends HTMLElement {
  /** 게임의 키 처리(onKey)가 맨 위 오버레이에 먼저 넘긴다. 처리했으면 true */
  onKey?(e: KeyboardEvent): boolean;
  dispose?(): void;
  /** 지금 보고 있는 그림 id */
  current?(): string;
}

/** 이 거리(px) 이상 가로로 밀면 스와이프 */
const SWIPE_MIN = 48;
const FADE_MS = 380;

export function buildViewer(o: ViewerOptions): ViewerPanel {
  const n = o.items.length;
  let index = Math.min(Math.max(0, o.start), Math.max(0, n - 1));
  let ui = true;
  let token = 0;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const later = (fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
  };

  const p = el('div', 'viewer') as ViewerPanel;
  p.dataset.panel = 'viewer';
  p.dataset.ui = 'on';
  p.setAttribute('role', 'dialog');
  p.setAttribute('aria-modal', 'true');
  p.setAttribute('aria-label', '추억 보기');
  p.classList.toggle('single', n <= 1);

  const stage = el('div', 'vw-stage');
  stage.tabIndex = -1;
  // 열면 포커스는 그림 영역에(버튼에 두면 Enter 가 바로 닫기·넘기기를 누른다)
  stage.dataset.autofocus = '';

  const close = el('button', 'btn close vw-close');
  close.type = 'button';
  close.dataset.action = 'close';
  close.setAttribute('aria-label', '닫기');
  close.append(ico('close'), el('span', 'lbl', '닫기'));
  close.addEventListener('click', (ev) => {
    ev.stopPropagation();
    o.close();
  });

  const nav = (dir: -1 | 1) => {
    const b = el('button', `vw-nav ${dir < 0 ? 'prev' : 'next'}`);
    b.type = 'button';
    b.dataset.action = dir < 0 ? 'prev' : 'next';
    b.setAttribute('aria-label', dir < 0 ? '이전 추억' : '다음 추억');
    b.title = dir < 0 ? '이전(←)' : '다음(→)';
    b.append(ico(dir < 0 ? 'prev' : 'next'));
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      go(dir);
    });
    return b;
  };
  const prev = nav(-1);
  const next = nav(1);

  const cap = el('div', 'vw-cap');
  cap.setAttribute('aria-live', 'polite');
  const who = el('span', 'vw-who');
  const title = el('span', 'vw-title');
  const num = el('span', 'vw-count');
  cap.append(who, title, num);

  p.append(stage, prev, next, close, cap);

  function setUi(on: boolean) {
    if (ui === on) return;
    ui = on;
    p.dataset.ui = on ? 'on' : 'off';
    // 숨긴 버튼에 포커스가 남지 않게
    if (!on && document.activeElement instanceof HTMLElement && p.contains(document.activeElement) && document.activeElement !== stage) {
      stage.focus({ preventScroll: true });
    }
  }

  /** 그림이 실제로 그려진 사각형(object-fit: contain) */
  function imageRect(img: HTMLImageElement | null): DOMRect | null {
    if (!img || !img.naturalWidth || !img.naturalHeight) return null;
    const r = img.getBoundingClientRect();
    const s = Math.min(r.width / img.naturalWidth, r.height / img.naturalHeight);
    const w = img.naturalWidth * s;
    const h = img.naturalHeight * s;
    return new DOMRect(r.left + (r.width - w) / 2, r.top + (r.height - h) / 2, w, h);
  }

  function frameOf(i: number): HTMLElement {
    const item = o.items[i];
    const f = el('div', 'vw-frame');
    f.dataset.cg = item.id;
    const bg = el('div', 'vw-bg');
    const t = o.thumbUrl(item.id) ?? o.url(item.id);
    if (t) bg.style.backgroundImage = cssUrl(t);
    const img = el('img', 'vw-img');
    img.alt = item.title;
    img.decoding = 'async';
    img.draggable = false;
    f.append(bg, img);
    return f;
  }

  function show(i: number, first: boolean) {
    if (!n) return;
    index = i;
    const item = o.items[i];
    const my = ++token;
    p.dataset.cg = item.id;
    who.textContent = item.route ? o.heroineName(item.route) : '공통';
    const colors = item.route ? HEROINE_COLORS[item.route] : { c1: 'var(--npc-1)', c2: 'var(--npc-2)' };
    who.style.setProperty('--c1', colors.c1);
    who.style.setProperty('--c2', colors.c2);
    title.textContent = item.title;
    num.textContent = `${i + 1} / ${n}`;
    num.setAttribute('aria-label', `${n}장 중 ${i + 1}번째`);

    const f = frameOf(i);
    const img = f.querySelector('img') as HTMLImageElement;
    const old = Array.from(stage.querySelectorAll<HTMLElement>('.vw-frame'));
    // 처음 열 때는 흐린 바탕(작은 그림)을 바로 보여 주고 원본만 해독 뒤 떠오르게, 넘길 때는 새 장 전체를 해독 뒤 겹쳐 떠오르게
    if (first) f.classList.add('on');
    stage.append(f);
    const url = o.url(item.id);
    const reveal = () => {
      if (my !== token) return;
      img.classList.add('in');
      f.classList.add('on');
      const ms = prefersReducedMotion() ? 0 : FADE_MS;
      later(() => {
        for (const x of old) x.remove();
        // 빠르게 넘겨 쌓인 앞 장들도 정리
        for (const x of Array.from(stage.querySelectorAll<HTMLElement>('.vw-frame'))) if (x !== f && my === token) x.remove();
      }, ms + 40);
      prefetch(i);
    };
    if (!url) {
      f.classList.add('broken');
      reveal();
      return;
    }
    img.src = url;
    const done = typeof img.decode === 'function' ? img.decode() : new Promise<void>((res, rej) => ((img.onload = () => res()), (img.onerror = rej)));
    done.then(reveal, () => {
      if (my !== token) return;
      img.remove();
      f.classList.add('broken');
      reveal();
    });
  }

  /** 다음·이전 원본을 미리 받아 둔다 */
  function prefetch(i: number) {
    if (n < 2) return;
    for (const d of [1, -1]) {
      const u = o.url(o.items[wrapIndex(n, i, d)].id);
      if (!u) continue;
      const im = new Image();
      im.decoding = 'async';
      im.src = u;
    }
  }

  function go(d: number) {
    if (n < 2) return;
    show(wrapIndex(n, index, d), false);
  }

  // ---- 포인터: 스와이프 · 그림 누르기(숨기기) · 빈 곳 누르기(닫기) ----------------------
  let down: { x: number; y: number; id: number } | null = null;
  let swipedAt = -Infinity;
  stage.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    down = { x: e.clientX, y: e.clientY, id: e.pointerId };
  });
  stage.addEventListener('pointerup', (e) => {
    const d = down;
    down = null;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) >= SWIPE_MIN && Math.abs(dx) > Math.abs(dy) * 1.4) {
      swipedAt = performance.now();
      if (!ui) setUi(true);
      go(dx < 0 ? 1 : -1);
    }
  });
  stage.addEventListener('pointercancel', () => {
    down = null;
  });
  stage.addEventListener('click', (e) => {
    e.stopPropagation();
    // 스와이프 끝에 따라오는 클릭(마우스로 끈 경우)은 무시
    if (performance.now() - swipedAt < 400) return;
    if (!ui) {
      setUi(true);
      return;
    }
    // 지금 보이는 장(새 장이 아직 해독 중이면 그 아래 앞 장)
    const frames = Array.from(stage.querySelectorAll<HTMLElement>('.vw-frame.on'));
    const top = frames[frames.length - 1];
    if (!top || top.classList.contains('broken')) {
      if (top) o.close();
      return;
    }
    const r = imageRect(top.querySelector<HTMLImageElement>('img.vw-img.in'));
    if (!r) return; // 원본을 해독하는 중(사각형을 모름): 아무것도 하지 않는다
    if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) setUi(false);
    else o.close();
  });
  // 오른쪽 클릭: 상용 VN 관례대로 글자·버튼 숨기기 토글
  stage.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    setUi(!ui);
  });

  p.onKey = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    const k = e.key;
    if (k === 'Escape') return false;
    // 숨긴 동안 Tab 은 먼저 버튼들을 다시 보이게 한다(보이지 않는 버튼으로 포커스가 갈 곳이 없으므로)
    if (k === 'Tab') {
      if (ui) return false;
      e.preventDefault();
      setUi(true);
      return true;
    }
    const onButton = (e.target as HTMLElement | null)?.tagName === 'BUTTON';
    if (k === 'ArrowLeft' || k === 'PageUp') {
      e.preventDefault();
      go(-1);
      return true;
    }
    if (k === 'ArrowRight' || k === 'PageDown') {
      e.preventDefault();
      go(1);
      return true;
    }
    if (k === 'Home' || k === 'End') {
      e.preventDefault();
      if (n > 1) {
        const to = k === 'Home' ? 0 : n - 1;
        if (to !== index) show(to, false);
      }
      return true;
    }
    if (!ui) {
      if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'NumLock', 'ScrollLock', 'Fn', 'OS'].includes(k)) return false;
      e.preventDefault();
      setUi(true);
      return true;
    }
    if (k === 'h' || k === 'H') {
      e.preventDefault();
      setUi(false);
      return true;
    }
    // 그림 영역에 포커스가 있을 때 Enter·Space 는 다음 그림(버튼 위에서는 버튼 기본 동작)
    if ((k === 'Enter' || k === ' ') && !onButton) {
      e.preventDefault();
      go(1);
      return true;
    }
    return false;
  };
  p.dispose = () => {
    token++;
    for (const t of timers) clearTimeout(t);
    timers.clear();
  };
  p.current = () => o.items[index]?.id ?? '';

  show(index, true);
  return p;
}
