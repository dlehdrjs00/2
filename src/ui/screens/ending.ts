/**
 * 엔딩 화면(docs/UI_DESIGN.md 6.15)
 *
 * 흐린 마지막 배경 + 남색 베일 → (축제 쪽 결말만) 불꽃 3개 · 금분홍 빛망울 → 왼쪽 폴라로이드(엔딩 CG, 없으면 엔딩 직전 무대로
 * 그린 미니 무대) + 오른쪽 제목 묶음(엔딩 배지 · 「제목」 · ✦── · 진행 메달 · 타이틀로).
 * - .ending-screen[data-ending][data-route][data-kind] 와 [data-action=to-title] 은 테스트 훅이다.
 * - 'END' 영문 대신 '아카네 · 축제 엔딩' 배지를 쓴다(같은 루트의 두 결말을 갈래 이름으로 구별. 히든 루트는 '네 사람').
 * - 색은 루트 색(ROUTE_COLORS), 제목·그림은 엔딩 id 로 고른다(game.ts).
 * - 진행 메달: 보이는 루트마다 하나(reveal.ts endingMedals), 메달 안 별 두 개가 축제·일상 결말의 도달 표시
 *   (.pip[data-ending][data-reached]). '엔딩 n / 보이는 엔딩 수'(처음 4, 코하루 엔딩을 본 뒤 6, 네 사람 엔딩을 본 뒤 8 —
 *   네 사람 엔딩을 본 플레이어에게는 코하루 메달도 보인다).
 * - 폴라로이드 캡션은 game.ts 가 dates.ts endingDate·captionText 로 만든다(그 그림이 뜬 장면의 날짜·장소).
 */
import type { EndingId, EndingKind, RouteId } from '../../engine/types';
import { button, cssUrl, el } from '../dom';
import { ico } from '../icons';
import { ENDING_KIND_NAMES, routeColors } from './common';
import { buildMotes } from './fx';

export interface EndingMedal {
  route: RouteId;
  /** 루트 이름('아카네', '네 사람') */
  name: string;
  /** 그 루트의 엔딩을 하나라도 도달했다(지금 엔딩 포함) */
  reached: boolean;
  /** 그 루트의 보이는 결말(축제 → 일상). title 은 도달한 것만 보여 준다 */
  endings: Array<{ id: EndingId; kind: EndingKind; reached: boolean; title: string }>;
}

export interface EndingOptions {
  id: EndingId;
  /** 엔딩이 속한 루트(색). 히든 루트는 'group' */
  route: RouteId;
  /** 축제 쪽 / 일상 쪽 */
  kind: EndingKind;
  /** 배지에 쓸 루트 이름('아카네', 히든 루트는 '네 사람') */
  name: string;
  title: string;
  bgUrl: string | null;
  bgColor: string | null;
  /** 폴라로이드 안 사진(미니 무대) */
  photo: HTMLElement;
  caption: string;
  medals: EndingMedal[];
  /** 도달한 엔딩 수 / 보이는 엔딩 수 */
  got: number;
  total: number;
  onTitle(): void;
}

/** 불꽃 고리 자리(가로 %, 세로 %, 크기 vh, 색, 시작 지연) */
const FIREWORKS: ReadonlyArray<[string, string, string, string, string]> = [
  ['12%', '16%', '22vh', '#ffd0e0', '-1.2s'],
  ['48%', '10%', '15vh', '#a2d4f6', '-2.6s'],
  ['84%', '18%', '20vh', '#ffe3a1', '-0.4s'],
];

export function buildEnding(o: EndingOptions): HTMLElement {
  const scr = el('div', 'ending-screen');
  scr.dataset.noadvance = '';
  scr.dataset.ending = o.id;
  scr.dataset.route = o.route;
  scr.dataset.kind = o.kind;
  const tone = routeColors(o.route);
  scr.style.setProperty('--c1', tone.c1);
  scr.style.setProperty('--c2', tone.c2);

  const bg = el('div', 'end-bg');
  if (o.bgUrl) bg.style.setProperty('--bg', cssUrl(o.bgUrl));
  if (o.bgColor) bg.style.backgroundColor = o.bgColor;
  scr.append(bg);
  // 불꽃은 축제 쪽 결말에만(일상 쪽은 하굣길·교실·등굣길이라 불꽃이 없다). 불꽃·빛망울은 늘 만들고, 설정에서 끄면
  // CSS([data-particles='0'])가 숨긴다
  if (o.kind === 'festival') {
    for (const [x, y, s, c, dl] of FIREWORKS) {
      const f = el('span', 'firework');
      f.setAttribute('aria-hidden', 'true');
      f.style.cssText = `--x:${x};--y:${y};--s:${s};--c:${c};--dl:${dl}`;
      scr.append(f);
    }
  }
  scr.append(buildMotes(22, { night: true, seed: 5 }));

  const layout = el('div', 'ending-layout');
  const pol = el('figure', 'polaroid');
  pol.append(o.photo, el('figcaption', '', o.caption));

  const inner = el('div', 'ending-inner');
  const kicker = el('div', 'end-kicker', `${o.name} · ${ENDING_KIND_NAMES[o.kind] ?? o.kind} 엔딩`);
  const title = el('h2', 'ending-title', `「${o.title}」`);
  const line = el('div', 'end-line');
  line.setAttribute('aria-hidden', 'true');
  line.append(ico('star'));

  const progress = el('div', 'end-progress');
  for (const m of o.medals) {
    const medal = el('span', `medal${m.reached ? ' got' : ''}`);
    medal.dataset.route = m.route;
    medal.append(el('span', 'mn', m.name));
    const pips = el('span', 'pips');
    for (const e of m.endings) {
      const pip = el('span', 'pip');
      pip.dataset.ending = e.id;
      pip.dataset.reached = e.reached ? '1' : '0';
      pip.append(el('span', 'sr-only', e.reached ? ` ${ENDING_KIND_NAMES[e.kind] ?? e.kind} 「${e.title}」` : ' 아직 보지 못한 엔딩'));
      pip.title = e.reached ? `${ENDING_KIND_NAMES[e.kind] ?? e.kind} · 「${e.title}」` : '아직 보지 못한 엔딩';
      pips.append(pip);
    }
    medal.append(pips);
    if (m.reached) {
      const c = routeColors(m.route);
      medal.style.setProperty('--c1', c.c1);
      medal.style.setProperty('--c2', c.c2);
    } else medal.title = '아직 보지 못한 엔딩';
    progress.append(medal);
  }
  const rest = o.got < o.total ? '다른 이야기도 기다리고 있어요' : '모든 이야기를 함께해 줘서 고마워요';
  progress.append(el('span', 'end-count', `엔딩 ${o.got} / ${o.total} · ${rest}`));

  const back = button('', 'btn primary', () => o.onTitle());
  back.dataset.action = 'to-title';
  back.append(ico('home'), '타이틀로');

  inner.append(kicker, title, line, progress, back);
  layout.append(pol, inner);
  scr.append(layout);
  return scr;
}
