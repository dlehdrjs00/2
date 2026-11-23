/**
 * 화면 장식: 빛망울(.motes)과 미니 무대(저장 썸네일·엔딩 폴라로이드).
 *
 * - 빛망울은 transform·opacity 만 움직이고 개수에 상한을 둔다(타이틀 26, 엔딩 22 — docs/UI_DESIGN.md 8장).
 *   설정 '빛망울 효과'를 끄면 만들지 않는다(#vn[data-particles='0'] 이면 CSS 도 숨긴다).
 * - 미니 무대는 저장 데이터의 무대 상태(배경·인물·겹침 순서)로 그린다. 캔버스 캡처나 이미지 저장이 필요 없고,
 *   일러스트를 바꾸면 썸네일도 자동으로 새 그림이 된다. 무대 정보가 없는 저장(손상·구버전)은 배경색만 칠한다.
 */
import type { CharId, CharState, StageState } from '../../engine/types';
import { el } from '../dom';
import { fillMotes, type MoteOptions } from '../stage';

/** 빛망울 레이어(무대와 같은 배치 공식 — stage.ts fillMotes). n 은 상한 안에서 */
export function buildMotes(n: number, o: MoteOptions = {}): HTMLElement {
  const box = el('div', 'motes');
  box.setAttribute('aria-hidden', 'true');
  fillMotes(box, n, o);
  return box;
}

export interface MiniResolver {
  bgUrl(id: string): string | null;
  bgColor(id: string): string | null;
  spriteUrl(char: CharId, s: CharState): string | null;
}

/** 인물 위치 → 무대 가로 위치(%). 실제 무대(.char.pos-*)와 같은 값 */
const POS_LEFT: Record<string, string> = { left: '27%', center: '50%', right: '73%' };

/**
 * 미니 무대 span. cls 는 'slot-thumb'(저장 카드) 또는 'mini'(폴라로이드).
 * 그림은 lazy 로 불러온다(화면에 보이는 카드만 내려받음).
 */
export function miniStage(cls: string, stage: StageState | undefined, r: MiniResolver): HTMLSpanElement {
  const box = el('span', cls);
  if (!stage) return box;
  const url = r.bgUrl(stage.bg);
  const color = r.bgColor(stage.bg);
  if (url) box.style.setProperty('--bg', `url("${url}")`);
  if (color) box.style.backgroundColor = color;
  const order = Array.isArray(stage.order) ? stage.order : [];
  for (const c of order) {
    const s = stage.chars?.[c];
    if (!s) continue;
    const src = r.spriteUrl(c, s);
    if (!src) continue;
    const img = el('img');
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.draggable = false;
    img.src = src;
    img.style.left = POS_LEFT[s.pos] ?? '50%';
    img.addEventListener('error', () => img.remove());
    box.append(img);
  }
  return box;
}
