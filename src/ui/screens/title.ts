/**
 * 타이틀 화면(docs/UI_DESIGN.md 6.14)
 *
 * 아래부터: 배경(title) → 햇빛·빛줄기 → 왼쪽 흰 베일 → 두 히로인 → 빛망울 → 왼쪽 열(로고·부제·세로 메뉴·엔딩 배지) → 버전 알약
 * - 메뉴 버튼은 .btn 클래스와 data-action(new/continue/load/settings)을 유지한다(테스트 훅).
 * - [이어하기] 옆에 자동 저장 위치의 날짜를 작게 보여 준다(aria-describedby).
 * - 히로인 위치는 .title-heroines .akane/.hina 클래스로만 잡는다(일러스트를 바꾸면 CSS 두 값만 조정).
 */
import type { EndingId, HeroineId } from '../../engine/types';
import { button, cssUrl, el } from '../dom';
import { HEROINE_COLORS } from './common';
import { buildMotes } from './fx';

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
  /** 왼쪽(뒤)부터 두 히로인 그림 */
  heroines: Array<{ char: HeroineId; url: string | null }>;
  hasAuto: boolean;
  /** 자동 저장 위치의 날짜('7월 10일'). 모르면 빈 문자열 */
  autoDate: string;
  endings: TitleEnding[];
  version: string;
  onNew(): void;
  onContinue(): void;
  onLoad(): void;
  onSettings(): void;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

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
  if (o.bgUrl) scr.style.setProperty('--bg', cssUrl(o.bgUrl));

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
  if (o.hasAuto && o.autoDate) {
    const d = el('span', 'sub', o.autoDate);
    d.id = 'vn-continue-date';
    bCont.append(d);
    // 이름은 '이어하기', 날짜는 설명으로 읽힌다(두 번 읽히지 않게)
    bCont.setAttribute('aria-label', '이어하기');
    bCont.setAttribute('aria-describedby', d.id);
  }
  const bLoad = button('불러오기', 'btn', () => o.onLoad());
  bLoad.dataset.action = 'load';
  const bSet = button('설정', 'btn', () => o.onSettings());
  bSet.dataset.action = 'settings';
  menu.append(bNew, bCont, bLoad, bSet);

  const foot = el('div', 'title-foot');
  foot.setAttribute('aria-label', '엔딩');
  for (const e of o.endings) {
    const b = el('span', `badge${e.reached ? ' got' : ''}`, `${e.name} 엔딩`);
    b.dataset.ending = e.id;
    b.dataset.reached = e.reached ? '1' : '0';
    b.title = e.reached ? `「${e.title}」` : '아직 보지 못한 엔딩';
    if (e.reached) b.style.setProperty('--c', HEROINE_COLORS[e.heroine].c1);
    foot.append(b);
  }

  left.append(logo(o.title), sub, menu, foot);
  scr.append(el('div', 'sunlight'), el('div', 'leftveil'), heroines);
  // 빛망울은 늘 만들고, 설정에서 끄면 CSS([data-particles='0'] .motes)가 숨긴다
  scr.append(buildMotes(26, { seed: 3 }));
  scr.append(left, el('span', 'ver', o.version));
  return scr;
}
