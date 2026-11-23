/** 작은 DOM 도우미 */
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

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
