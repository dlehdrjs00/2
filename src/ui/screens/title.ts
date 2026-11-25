/**
 * 타이틀 화면(docs/UI_DESIGN.md 6.14)
 *
 * 아래부터: 배경(title) → 햇빛·빛줄기 → 왼쪽 흰 베일 → 두 히로인 → 빛망울 → 왼쪽 열(로고·부제·세로 메뉴·엔딩 배지) → 버전 알약
 * - 메뉴 버튼은 .btn 클래스와 data-action(new/continue/load/album/settings)을 유지한다(테스트 훅).
 * - [이어하기] 옆에 자동 저장 위치의 날짜, [추억 앨범] 옆에 모은 수를 작게 보여 준다(aria-describedby).
 *   자동 저장이 이 탭에만 있으면 날짜 자리에 주황 '이 탭에만'(.sub > .tab-only)을 둔다(날짜는 읽어 줄 글자·title 로).
 * - [추억 앨범]·[설정]은 .half: 낮은 화면(높이 540px 이하)에서는 한 줄에 반씩 나란히 놓인다(screens.css).
 * - 히로인 위치는 .title-heroines .akane/.hina 클래스로만 잡는다(일러스트를 바꾸면 CSS 두 값만 조정).
 * - 키 비주얼(.kv)은 배경 대신 .title-art 두 겹으로 그린다: 작은 그림(.art-lo, 흐림)을 먼저 깔고,
 *   원본은 내려받아 해독이 끝난 뒤에야 .art-hi 에 넣어 페이드로 띄운다(.kv-ready). 느린 망에서 원본이
 *   위에서부터 반쯤 그려진 채 오래 보이지 않게. 한 번 해독한 원본은 다시 그릴 때 연출 없이 바로 보인다.
 */
import type { EndingId, HeroineId } from '../../engine/types';
import { button, cssUrl, el } from '../dom';
import { HEROINE_COLORS } from './common';
import { buildMotes } from './fx';
import { prefersDataSaving } from './preload';

export interface TitleEnding {
  id: EndingId;
  heroine: HeroineId;
  name: string;
  reached: boolean;
  /** 본 엔딩이면 엔딩 제목 */
  title: string;
}

export interface TitleOptions {
  title: string;
  subtitle: string;
  bgUrl: string | null;
  /** 배경이 두 히로인이 그려진 키 비주얼이면 true(개별 스프라이트를 겹치지 않는다) */
  keyVisual?: boolean;
  /** 키 비주얼의 작은 그림(원본을 받는 동안 흐리게 깔아 둔다) */
  bgThumbUrl?: string | null;
  /** 키 비주얼 원본이 그려질 준비가 됐을 때(받기 실패 포함) 한 번 */
  onArtReady?(): void;
  /** 왼쪽(뒤)부터 두 히로인 그림 */
  heroines: Array<{ char: HeroineId; url: string | null }>;
  hasAuto: boolean;
  /** 자동 저장 위치의 날짜('7월 10일'). 모르면 빈 문자열 */
  autoDate: string;
  /** 자동 저장이 이 탭 메모리에만 있음(브라우저 저장소에 쓰지 못함). [이어하기]는 그 최신 진행을 불러온다 */
  autoTabOnly?: boolean;
  endings: TitleEnding[];
  version: string;
  /** 추억 앨범(이벤트 CG 갤러리)에 모은 수. null 이면 [추억 앨범]을 두지 않는다 */
  album?: { seen: number; total: number } | null;
  onNew(): void;
  onContinue(): void;
  onLoad(): void;
  onAlbum?(): void;
  onSettings(): void;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 이미 해독을 마친 키 비주얼 원본(다시 그릴 때 페이드 없이 바로 보인다) */
const decodedArt = new Set<string>();

/**
 * 받는 중인 키 비주얼 원본. 같은 주소는 한 번만 받고(타이틀을 다시 그려도 이어서), 타이틀을 떠나면
 * cancelTitleArt() 로 그만 받는다(느린 망에서 게임 그림과 대역폭을 나누지 않게. 다시 타이틀로 오면 새로 받는다).
 */
let artLoad: { url: string; img: HTMLImageElement; done: Promise<boolean>; cancel(): void } | null = null;

/** 원본을 내려받아 해독까지 마친다. 해독했으면 true, 받기 실패·취소면 false(그래도 끝난 것으로 본다) */
function loadArt(url: string): Promise<boolean> {
  if (artLoad?.url === url) return artLoad.done;
  const img = new Image();
  img.decoding = 'async';
  let settle: (ok: boolean) => void = () => undefined;
  const done = new Promise<boolean>((resolve) => {
    let settled = false;
    settle = (ok: boolean) => {
      if (settled) return;
      settled = true;
      if (artLoad?.img === img) artLoad = null;
      resolve(ok);
    };
  });
  const cur = {
    url,
    img,
    done,
    cancel() {
      settle(false);
      // 주소를 비우면 브라우저가 받던 요청을 거둔다(이 그림을 쓰는 다른 곳이 없을 때)
      img.removeAttribute('src');
      img.src = '';
    },
  };
  artLoad = cur;
  img.onerror = () => settle(false);
  img.src = url;
  if (typeof img.decode === 'function') {
    img.decode().then(
      () => settle(true),
      () => {
        if (img.complete && img.naturalWidth > 0) settle(true);
        else img.onload = () => settle(true);
      },
    );
  } else img.onload = () => settle(true);
  return done;
}

/** 타이틀을 떠날 때: 아직 받는 중인 키 비주얼 원본을 그만 받는다 */
export function cancelTitleArt(): void {
  artLoad?.cancel();
}

/**
 * 키 비주얼 두 겹: 작은 그림(흐림) → 원본(해독 뒤 페이드). 원본이 준비되면 scr 에 .kv-ready 를 붙이고 ready() 를 부른다.
 * 받기에 실패하면 원본을 CSS 배경으로 바로 걸어 둔다(브라우저가 다시 시도하거나, 그래도 없으면 흐린 작은 그림이 남는다).
 * 데이터 절약 모드(navigator.connection.saveData)에서는 원본을 받지 않고 작은 그림만 쓴다(.kv-lite, 곧바로 ready).
 * 이 문서에서 이미 해독한 원본이 있으면 그것을 그대로 쓴다.
 */
function keyVisualArt(scr: HTMLElement, url: string, thumb: string | null, ready: () => void): HTMLElement {
  const art = el('div', 'title-art');
  art.setAttribute('aria-hidden', 'true');
  const lo = el('div', 'art-lo');
  if (thumb) lo.style.setProperty('--bg', cssUrl(thumb));
  const hi = el('div', 'art-hi');
  art.append(lo, hi);
  const show = (instant: boolean) => {
    hi.style.setProperty('--bg', cssUrl(url));
    scr.classList.add('kv-ready');
    if (instant) scr.classList.add('kv-instant');
    ready();
  };
  if (decodedArt.has(url)) show(true);
  else if (thumb && prefersDataSaving()) {
    // 데이터 절약 모드: 원본(약 300KB)은 받지 않고 작은 그림(약 30KB)만 흐림 없이 깐다(.kv-lite). 기다릴 원본이 없으니
    // 미뤄 둔 첫 화면 그림·글꼴 받기를 곧바로 시작한다
    scr.classList.add('kv-lite');
    ready();
  } else {
    void loadArt(url).then((ok) => {
      // 타이틀을 떠나 취소된 경우(이 화면이 이미 문서에 없음)에는 아무것도 하지 않는다
      if (!scr.isConnected && !ok) return;
      if (ok) decodedArt.add(url);
      show(false);
    });
  }
  return art;
}

/** 로고 뒤 비행기구름(흰 선 두 줄 + 종이비행기) */
function contrail(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'contrail');
  svg.setAttribute('viewBox', '0 0 400 120');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  // 같은 문서에 그라데이션 id 가 겹치지 않게(타이틀을 다시 그려도 하나만 있음)
  svg.innerHTML =
    '<defs><linearGradient id="vn-contrail" x1="0" x2="1">' +
    '<stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.55" stop-color="#fff" stop-opacity="0.85"/><stop offset="1" stop-color="#fff"/>' +
    '</linearGradient></defs>' +
    '<path d="M-10 112 C 110 104, 250 74, 380 16" stroke="url(#vn-contrail)" stroke-width="6" fill="none" stroke-linecap="round"/>' +
    '<path d="M-10 120 C 110 112, 250 82, 378 24" stroke="url(#vn-contrail)" stroke-width="2" fill="none" stroke-linecap="round" opacity=".6"/>' +
    '<path d="M398 4 L372 13 L381 17 L384 27 Z" fill="#fff" stroke="#9fd3f6" stroke-width="1.5" stroke-linejoin="round"/>';
  return svg;
}

/** 로고: 1줄(첫 어절, 분홍) + 2줄(나머지, 하늘 · 끝의 '?'만 분홍) */
function logo(title: string): HTMLElement {
  const h = el('h1', 'logo');
  h.setAttribute('aria-label', title);
  const sp = title.indexOf(' ');
  const first = sp > 0 ? title.slice(0, sp) : title;
  const rest = sp > 0 ? title.slice(sp + 1) : '';
  const l1 = el('span', 'l1', first);
  l1.dataset.text = first;
  l1.setAttribute('aria-hidden', 'true');
  h.append(contrail(), l1);
  if (rest) {
    const l2 = el('span', 'l2');
    l2.dataset.text = rest;
    l2.setAttribute('aria-hidden', 'true');
    const q = /[?？!！]$/.exec(rest);
    if (q) l2.append(rest.slice(0, -1), el('span', 'q', q[0]));
    else l2.textContent = rest;
    h.append(l2);
  } else l1.classList.add('solo');
  return h;
}

export function buildTitle(o: TitleOptions): HTMLElement {
  const scr = el('div', `title-screen${o.keyVisual ? ' kv' : ''}`);
  scr.dataset.noadvance = '';
  const art = o.keyVisual && o.bgUrl ? keyVisualArt(scr, o.bgUrl, o.bgThumbUrl ?? null, () => o.onArtReady?.()) : null;
  if (o.bgUrl && !art) scr.style.setProperty('--bg', cssUrl(o.bgUrl));

  const heroines = el('div', 'title-heroines');
  heroines.setAttribute('aria-hidden', 'true');
  o.heroines.forEach((h, i) => {
    if (!h.url) return;
    const img = el('img', i === 0 ? 'akane' : 'hina');
    img.alt = '';
    img.draggable = false;
    img.decoding = 'async';
    img.src = h.url;
    heroines.append(img);
  });

  const left = el('div', 'title-left');
  const sub = el('p', 'title-sub', o.subtitle.replace(/^[\s—–-]+|[\s—–-]+$/g, ''));

  const menu = el('div', 'title-menu');
  const bNew = button('새 게임', 'btn primary', () => o.onNew());
  bNew.dataset.action = 'new';
  const bCont = button('이어하기', 'btn', () => o.onContinue());
  bCont.dataset.action = 'continue';
  bCont.disabled = !o.hasAuto;
  const tabOnly = o.hasAuto && !!o.autoTabOnly;
  if (o.hasAuto && (o.autoDate || tabOnly)) {
    const d = el('span', 'sub', tabOnly ? undefined : o.autoDate);
    d.id = 'vn-continue-date';
    if (tabOnly) {
      // 이 탭에만 있는 진행(새로고침하면 브라우저에 남은 이전 위치로 돌아간다): 날짜 자리에 작은 주황 표시.
      // 좁은 메뉴(232px)에 날짜와 함께 넣으면 버튼 밖으로 넘쳐 날짜는 읽어 줄 글자·title 로만 둔다
      if (o.autoDate) d.append(el('span', 'sr-only', `${o.autoDate} · `));
      d.append(el('span', 'tab-only', '이 탭에만'));
      bCont.classList.add('tab-only');
      bCont.title = `${o.autoDate ? `${o.autoDate} · ` : ''}이 탭에만 저장된 최신 진행이에요. 새로고침하거나 탭을 닫으면 사라질 수 있어요.`;
    }
    bCont.append(d);
    // 이름은 '이어하기', 날짜는 설명으로 읽힌다(두 번 읽히지 않게)
    bCont.setAttribute('aria-label', '이어하기');
    bCont.setAttribute('aria-describedby', d.id);
  }
  const bLoad = button('불러오기', 'btn', () => o.onLoad());
  bLoad.dataset.action = 'load';
  const bSet = button('설정', 'btn half', () => o.onSettings());
  bSet.dataset.action = 'settings';
  menu.append(bNew, bCont, bLoad);
  if (o.album) {
    const bAlb = button('추억 앨범', 'btn half', () => o.onAlbum?.());
    bAlb.dataset.action = 'album';
    const c = el('span', 'sub');
    c.id = 'vn-album-count';
    c.append(el('span', 'sr-only', '모은 추억 '), `${o.album.seen} / ${o.album.total}`);
    bAlb.append(c);
    bAlb.setAttribute('aria-label', '추억 앨범');
    bAlb.setAttribute('aria-describedby', c.id);
    menu.append(bAlb);
  } else bSet.classList.remove('half');
  menu.append(bSet);

  const foot = el('div', 'title-foot');
  foot.setAttribute('aria-label', '엔딩');
  // 배지 수(screens.css: 3개면 좁은 가로 화면에서 '엔딩' 글자를 보이지 않게 줄여 한 줄에 둔다. 읽기는 그대로 'OO 엔딩')
  foot.dataset.n = String(o.endings.length);
  for (const e of o.endings) {
    const b = el('span', `badge${e.reached ? ' got' : ''}`);
    b.append(e.name, el('span', 'bw', ' 엔딩'));
    b.dataset.ending = e.id;
    b.dataset.reached = e.reached ? '1' : '0';
    b.title = e.reached ? `「${e.title}」` : '아직 보지 못한 엔딩';
    if (e.reached) b.style.setProperty('--c', HEROINE_COLORS[e.heroine].c1);
    foot.append(b);
  }

  left.append(logo(o.title), sub, menu, foot);
  if (art) scr.append(art);
  scr.append(el('div', 'sunlight'), el('div', 'leftveil'), heroines);
  // 빛망울은 늘 만들고, 설정에서 끄면 CSS([data-particles='0'] .motes)가 숨긴다
  scr.append(buildMotes(26, { seed: 3 }));
  scr.append(left, el('span', 'ver', o.version));
  return scr;
}
