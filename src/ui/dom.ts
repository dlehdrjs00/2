/** 작은 DOM 도우미 */
import { attachJosa } from '../engine/text';

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function button(text: string, className = 'btn', onClick?: (ev: MouseEvent) => void): HTMLButtonElement {
  const b = el('button', className, text);
  b.type = 'button';
  if (onClick) {
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      onClick(ev);
      // 마우스/터치로 누른 버튼은 포커스를 놓아, 이후 스페이스/엔터가 버튼을 다시 누르지 않게 한다
      if (ev.detail > 0) b.blur();
    });
  }
  return b;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** 저장 카드용 날짜: 같은 해면 `MM.DD HH:mm`, 다른 해면 `YYYY.MM.DD HH:mm` */
export function formatSlotDate(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const md = `${pad2(d.getMonth() + 1)}.${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  return d.getFullYear() === now.getFullYear() ? md : `${d.getFullYear()}.${md}`;
}

/** 숫자 끝자리의 한국어 읽기(조사 고르기용). 0 은 10·20·30 의 '십' */
const DIGIT_READ: Record<string, string> = { '0': '십', '1': '일', '2': '이', '3': '삼', '4': '사', '5': '오', '6': '육', '7': '칠', '8': '팔', '9': '구' };

/** 단어 뒤에 받침에 맞는 조사를 붙인다. '슬롯 2' + '을' → '슬롯 2를' 처럼 숫자로 끝나는 말도 맞춘다 */
export function withJosa(word: string, josa: string): string {
  const last = word.trim().slice(-1);
  const read = DIGIT_READ[last];
  if (!read) return attachJosa(word, josa);
  // 숫자의 읽는 소리로 조사를 고르고, 단어 자체는 그대로 둔다
  return word + attachJosa(read, josa).slice(read.length);
}
