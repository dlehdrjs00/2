/**
 * 엔딩 화면(docs/UI_DESIGN.md 6.15)
 *
 * 흐린 마지막 배경 + 남색 베일 → 불꽃 3개·금분홍 빛망울 → 왼쪽 폴라로이드(엔딩 직전 무대로 그린 미니 무대) +
 * 오른쪽 제목 묶음(엔딩 배지 · 「제목」 · ✦── · 진행 메달 · 타이틀로).
 * - .ending-screen[data-ending] 과 [data-action=to-title] 은 테스트 훅이다.
 * - 'END' 영문 대신 '아카네 엔딩' 배지를 쓴다.
 */
import type { EndingId, HeroineId } from '../../engine/types';
import { button, cssUrl, el } from '../dom';
import { ico } from '../icons';
import { HEROINE_COLORS } from './common';
import { buildMotes } from './fx';

export interface EndingOptions {
  id: EndingId;
  heroine: HeroineId;
  heroineName: string;
  title: string;
  bgUrl: string | null;
  bgColor: string | null;
  /** 폴라로이드 안 사진(미니 무대) */
  photo: HTMLElement;
  caption: string;
  medals: Array<{ heroine: HeroineId; name: string; reached: boolean }>;
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
  const tone = HEROINE_COLORS[o.heroine];
  scr.style.setProperty('--c1', tone.c1);
  scr.style.setProperty('--c2', tone.c2);

  const bg = el('div', 'end-bg');
  if (o.bgUrl) bg.style.setProperty('--bg', cssUrl(o.bgUrl));
  if (o.bgColor) bg.style.backgroundColor = o.bgColor;
  scr.append(bg);
  // 불꽃·빛망울은 늘 만들고, 설정에서 끄면 CSS([data-particles='0'])가 숨긴다
  for (const [x, y, s, c, dl] of FIREWORKS) {
    const f = el('span', 'firework');
    f.setAttribute('aria-hidden', 'true');
    f.style.cssText = `--x:${x};--y:${y};--s:${s};--c:${c};--dl:${dl}`;
    scr.append(f);
  }
  scr.append(buildMotes(22, { night: true, seed: 5 }));

  const layout = el('div', 'ending-layout');
  const pol = el('figure', 'polaroid');
  pol.append(o.photo, el('figcaption', '', o.caption));

  const inner = el('div', 'ending-inner');
  const kicker = el('div', 'end-kicker', `${o.heroineName} 엔딩`);
  const title = el('h2', 'ending-title', `「${o.title}」`);
  const line = el('div', 'end-line');
  line.setAttribute('aria-hidden', 'true');
  line.append(ico('star'));

  const progress = el('div', 'end-progress');
  const got = o.medals.filter((m) => m.reached).length;
  for (const m of o.medals) {
    const medal = el('span', `medal${m.reached ? ' got' : ''}`, m.name);
    if (m.reached) {
      const c = HEROINE_COLORS[m.heroine];
      medal.style.setProperty('--c1', c.c1);
      medal.style.setProperty('--c2', c.c2);
    } else medal.title = '아직 보지 못한 엔딩';
    progress.append(medal);
  }
  const rest = got < o.medals.length ? '다른 이야기도 기다리고 있어요' : '모든 이야기를 함께해 줘서 고마워요';
  progress.append(el('span', 'end-count', `엔딩 ${got} / ${o.medals.length} · ${rest}`));

  const back = button('', 'btn primary', () => o.onTitle());
  back.dataset.action = 'to-title';
  back.append(ico('home'), '타이틀로');

  inner.append(kicker, title, line, progress, back);
  layout.append(pol, inner);
  scr.append(layout);
  return scr;
}
