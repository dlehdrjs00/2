/**
 * 대화 기록 본문(docs/UI_DESIGN.md 6.12)
 *
 * .panel-body.log > .log-list > .log-item.is-<say|mono|card|choice>(.k-<화자>)(.now)
 *   이름 .log-name(인물 색은 .k-osana/.k-tenko/.k-me, 그 밖은 npc 색) + 본문 .log-text
 *   - 독백: 본문만, 왼쪽 하늘 선 / 날짜 카드: 가운데 구분선 / 선택: '선택' 배지가 붙은 분홍 알약
 *   - 색만이 아니라 모양으로도 구분한다(접근성).
 * 클래스 접두를 is- 로 둬서 무대 카드(.stage > .card)·선택지(.choice) 스타일과 섞이지 않는다(부록 A).
 */
import type { LogEntry } from '../../engine/types';
import { el } from '../dom';
import type { SheetView } from './sheet';

export interface LogOptions {
  entries: readonly LogEntry[];
  /** 표시 이름 → 화자 id(이름표 색). 모르면 null */
  speakerOf(name: string): string | null;
}

export function buildLog(o: LogOptions): SheetView {
  const body = el('div', 'panel-body log');
  body.tabIndex = 0; // 키보드로 스크롤할 수 있게
  const list = el('div', 'log-list');
  if (!o.entries.length) list.append(el('div', 'log-empty', '아직 기록이 없어요.'));
  o.entries.forEach((e, i) => {
    const item = el('div', `log-item is-${e.kind}`);
    if (e.kind === 'say' && e.name) {
      const who = o.speakerOf(e.name);
      item.classList.add(`k-${who ?? 'npc'}`);
      item.append(el('span', 'log-name', e.name));
    }
    // 선택 항목의 '▶ ' 접두는 표시할 때만 뗀다(저장된 문구는 그대로)
    const text = e.kind === 'choice' ? e.text.replace(/^▶\s*/, '') : e.text;
    item.append(el('span', 'log-text', text));
    if (i === o.entries.length - 1) item.classList.add('now');
    list.append(item);
  });
  body.append(list);
  return {
    body,
    shown() {
      body.scrollTop = body.scrollHeight;
    },
  };
}
