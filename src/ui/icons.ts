/**
 * 아이콘: 이름 → CSS 마스크 변수(--i-*). 그림은 tokens.css 의 24×24 선 아이콘(data URI)이고,
 * 마스크라서 글자색(currentColor)을 따른다. 버튼 textContent 에는 영향이 없다(aria-hidden).
 */
import { el } from './dom';

export type IconName =
  | 'qsave'
  | 'qload'
  | 'auto'
  | 'skip'
  | 'log'
  | 'config'
  | 'menu'
  | 'close'
  | 'trash'
  | 'sun'
  | 'moon'
  | 'star'
  | 'text'
  | 'sound'
  | 'screen'
  | 'home'
  | 'full'
  | 'eye'
  | 'hide'
  | 'rain'
  | 'play';

/** 마스크 변수 값(인라인 style 의 --i 에 넣는다) */
export function iconVar(name: IconName): string {
  return `var(--i-${name})`;
}

/** 장식 아이콘 span(.ico, aria-hidden) */
export function ico(name?: IconName, extraClass = ''): HTMLSpanElement {
  const s = el('span', extraClass ? `ico ${extraClass}` : 'ico');
  s.setAttribute('aria-hidden', 'true');
  if (name) s.style.setProperty('--i', iconVar(name));
  return s;
}
