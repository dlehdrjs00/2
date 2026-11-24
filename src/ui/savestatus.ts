/**
 * 자동 저장 상태 기계·상태 표시·안내 문구(docs/UI_DESIGN.md 6.21)
 *
 * 상태(AutoSaveTracker.status → game.ts #vn[data-autosave], debugInfo().autoSave)
 *   none      : 자동 저장이 없거나 이 탭에서 아직 쓰지 않았다(엔딩으로 지운 뒤 포함)
 *   ok        : 마지막 자동 저장이 브라우저 저장소에 들어갔고, 저장 문제가 없다(또는 풀렸다)
 *   tab-only  : 마지막 자동 저장이 이 탭 메모리에만 있다(용량 초과 등으로 쓰기 실패, 또는 브라우저 저장소를 쓸 수 없음)
 *   low-space : 쓰기 실패 뒤, 마지막 자동 저장은 브라우저 저장소에 들어갔지만(새로고침해도 이 위치) 남은 공간이 거의 없다
 *               (가득 찬 저장소에서도 같은 칸을 더 짧은 값으로 덮어쓰는 것은 성공한다. 기록이 상한(LOG_LIMIT)에 닿으면
 *               자동 저장 크기가 줄마다 오르내려 성공·실패가 번갈아 난다)
 * 판단은 자동 저장 칸('auto')만 본다(SaveManager.saveSlot → slotPersisted('auto')). 다른 칸이나 전역 기록(읽은 대사 등)이
 * 이 탭에만 있어도 이 상태는 바뀌지 않는다.
 *
 * 알림(토스트)은 '문제 구간'이 시작하고 끝날 때만:
 *   - ok·none → tab-only: 경고(failed, role=alert, 7초). 브라우저 저장소를 처음부터 쓸 수 없으면 memoryOnly(페이지마다 한 번)
 *   - tab-only·low-space → ok: 회복(recovered). 쓰기 하나의 성공으로는 정하지 않고, 여유 공간(AUTOSAVE_HEADROOM 글자)을
 *     실제로 써 볼 수 있을 때만 ok 로 본다(히스테리시스). 그 전까지는 low-space(조용히, 상태 표시만 바뀐다)
 *   - tab-only ↔ low-space: 알리지 않는다(같은 문제 구간 안. 상태 표시의 글자만 바뀐다)
 *   - 회복 알림은 AUTOSAVE_REPEAT_MS 안에 다시 띄우지 않는다(안전장치. 그 사이 상태 표시는 그대로 바뀐다).
 *     경고(failed)는 제한하지 않는다: 진행을 잃을 수 있다는 알림이 '회복' 직후라는 이유로 빠지면 안 된다
 *   - → none(엔딩으로 자동 저장을 지움 등): 조용히 걷는다
 * tab-only·low-space 동안은 상태 표시(.autosave-chip)가 계속 보인다. [지금 다시 저장](사용자가 누름)은 이 제한과 상관없이
 * 결과를 늘 알린다(game.ts retryAutosave).
 *
 * DOM: button.autosave-chip[data-noadvance][aria-haspopup=dialog][data-state] > span.ico(경고) + span.lbl(+ span.lbl-x)
 *   #vn 루트에 붙고, 보이고 숨기는 것과 위치는 styles/play.css 12절이 #vn[data-autosave][data-frame][data-layout][data-aschip] 로 정한다.
 *   알약 폭은 --asw 로 #vn 에 알려(ResizeObserver) 같은 줄의 장소 표시가 알약 밑으로 늘어나지 않게 한다.
 */
import { button, el } from './dom';
import { ico } from './icons';

export type AutoSaveStatus = 'none' | 'ok' | 'tab-only' | 'low-space';
/** 상태 표시가 보이는 상태 */
export const isAutoSaveWarn = (s: AutoSaveStatus): s is 'tab-only' | 'low-space' => s === 'tab-only' || s === 'low-space';

/** 안내 문구(테스트·문서가 같은 문구를 본다) */
export const AUTOSAVE_TEXT = {
  /** 상태 표시 글자: [좁은 탭 띠에서도 남는 앞부분, 넓으면 붙는 부분(.lbl-x)] */
  chip: { 'tab-only': ['이 탭에만', ' 저장됨'], 'low-space': ['공간 부족', ' · 저장됨'] },
  chipTitle: {
    'tab-only': '자동 저장을 브라우저에 쓰지 못해 이 탭에만 있어요. 눌러서 자세히 보기',
    'low-space': '지금 위치는 브라우저에 저장됐지만 저장 공간이 거의 없어요. 눌러서 자세히 보기',
  },
  /** 영구 → 이 탭에만(브라우저 저장소 쓰기 실패) */
  failed:
    '자동 저장을 브라우저에 쓰지 못했어요(저장 공간 부족 등). 지금부터의 진행은 이 탭에만 남아, 새로고침하거나 탭을 닫으면 최근 진행이 사라질 수 있어요.',
  /** 처음부터 브라우저 저장소를 쓸 수 없는 경우의 플레이 첫 진입(타이틀에서 이미 한 번 알렸으므로 짧게, 페이지마다 한 번) */
  memoryOnly: '브라우저 저장소를 쓸 수 없어 진행이 이 탭에만 남아요 · 새로고침하거나 탭을 닫으면 사라져요',
  /** 이 탭에만·공간 부족 → 영구(다시 저장에 성공하고 여유 공간도 있음) */
  recovered: '자동 저장을 다시 브라우저에 남겼어요 · 새로고침해도 지금 위치부터 이어 갈 수 있어요',
  /** [지금 다시 저장]: 저장은 됐지만 여유 공간이 거의 없음 */
  retryLow: '지금 위치를 브라우저에 저장했어요 · 저장 공간이 거의 없어 다음 자동 저장이 다시 실패할 수 있어요',
  /** [지금 다시 저장]을 눌렀지만 여전히 실패 */
  retryFailed: '아직 브라우저에 저장하지 못했어요 · 저장 공간을 확보한 뒤 다시 눌러 주세요',
} as const;

/** 알림 시간(ms): 경고는 평소 토스트(2.2초)보다 길게 */
export const AUTOSAVE_ALERT_MS = 7000;
export const AUTOSAVE_NOTE_MS = 5000;
/**
 * 회복으로 볼 여유 공간(글자 수, UTF-16 기준). 자동 저장 한 벌은 회차 끝까지 약 1.2만 자이고, 기록이 상한에 닿은 뒤
 * 줄마다 ±200자, 60줄 사이에 최대 약 500자 오르내린다(실제 대본으로 잰 값). 전역 기록은 줄마다 약 10자 는다.
 * 이만큼 비어 있으면 오르내림으로 곧바로 다시 실패하지 않는다. 쓰지 않는 저장 칸 하나를 지우면 대개 이보다 많이 빈다.
 */
export const AUTOSAVE_HEADROOM = 4096;
/** 회복 알림을 다시 띄우기 전 최소 간격(ms). 경고(failed)에는 쓰지 않는다 */
export const AUTOSAVE_REPEAT_MS = 60_000;

export type AutoSaveNotice = 'failed' | 'memoryOnly' | 'recovered';

/** 자동 저장 한 번의 결과 */
export interface AutoSaveWrite {
  /** 자동 저장 칸이 브라우저 저장소에 들어갔는가(SaveManager.saveSlot === 'persisted') */
  persisted: boolean;
  /** 브라우저 저장소를 쓰는 저장소인가(false: 처음부터 쓸 수 없음. SaveManager.canPersist) */
  canPersist: boolean;
  /** 여유 공간이 AUTOSAVE_HEADROOM 만큼 있는가. 문제 구간 안에서 저장에 성공했을 때만 부른다(임시 키 쓰기) */
  hasRoom: () => boolean;
}

export interface AutoSaveChange {
  status: AutoSaveStatus;
  /** 상태가 바뀌었는가(상태 표시·저장 시트를 다시 그릴지) */
  changed: boolean;
  /** 띄울 알림(없으면 null). 같은 상태가 이어지거나 반복 제한에 걸리면 null */
  notice: AutoSaveNotice | null;
}

/**
 * 자동 저장 상태 기계(DOM 없음. tests/unit/storage.test.ts 가 실제 대본·용량 초과 흉내 저장소로 검사한다).
 * game.ts 는 자동 저장마다 saved() 를, 자동 저장을 지우면 cleared() 를 부르고 돌려받은 상태·알림을 화면에 옮긴다.
 */
export class AutoSaveTracker {
  status: AutoSaveStatus = 'none';
  private memoryNoticeShown = false;
  private lastRecovered: number | undefined;

  constructor(
    private now: () => number = () => Date.now(),
    private repeatMs = AUTOSAVE_REPEAT_MS,
  ) {}

  saved(w: AutoSaveWrite): AutoSaveChange {
    let next: AutoSaveStatus;
    if (!w.persisted) next = 'tab-only';
    else if (!isAutoSaveWarn(this.status)) next = 'ok';
    // 문제 구간 안에서의 성공: 여유 공간이 있어야 회복. 없으면 '저장됐지만 공간 부족'(곧 다시 실패할 수 있음)
    else next = w.hasRoom() ? 'ok' : 'low-space';
    return this.move(next, w.canPersist);
  }

  /** 자동 저장을 지웠다(엔딩·삭제): 잃을 진행이 없으므로 조용히 none */
  cleared(): AutoSaveChange {
    const changed = this.status !== 'none';
    this.status = 'none';
    return { status: 'none', changed, notice: null };
  }

  private move(next: AutoSaveStatus, canPersist: boolean): AutoSaveChange {
    const prev = this.status;
    if (prev === next) return { status: next, changed: false, notice: null };
    this.status = next;
    let notice: AutoSaveNotice | null = null;
    if (next === 'tab-only' && !isAutoSaveWarn(prev)) {
      // 경고는 반복 제한 없이 늘 띄운다(문제 구간의 시작마다 한 번. 히스테리시스로 구간 안의 성공·실패 반복은 알리지 않는다)
      if (canPersist) notice = 'failed';
      else if (!this.memoryNoticeShown) {
        this.memoryNoticeShown = true;
        notice = 'memoryOnly';
      }
    } else if (next === 'ok' && isAutoSaveWarn(prev)) notice = this.allow('recovered');
    return { status: next, changed: true, notice };
  }

  private allow(kind: 'recovered'): AutoSaveNotice | null {
    const t = this.now();
    if (this.lastRecovered !== undefined && t - this.lastRecovered < this.repeatMs) return null;
    this.lastRecovered = t;
    return kind;
  }
}

/**
 * 세로 배치(below)에서 상태 표시를 둘 줄. 무대 위 여백에 장소 표시 줄 위로 한 줄 더 들어가면 'above'
 * (장소 표시는 폭을 줄이지 않는다), 모자라면 'under'(장소 표시 줄 바로 아래, 무대 위끝 오른쪽). styles/play.css 12절.
 * top = 무대 위끝(sy), safeTop = 안전 영역 위, fs = 대사 글자 크기, btn = 탭 띠 높이(알약 높이)
 */
export function autosaveChipRow(sy: number, safeTop: number, fs: number, btn: number): 'above' | 'under' {
  const place = 2.3 * Math.max(16, fs * 0.72); // 장소 표시 높이(play.css 3절: 글자 max(16px, fs×0.72) × 2.3em)
  const placeTop = Math.max(safeTop + 8, sy - 8 - place);
  return placeTop - 8 - btn >= safeTop + 8 ? 'above' : 'under';
}

export function createAutosaveChip(onOpen: () => void): HTMLButtonElement {
  // button(): 클릭 전파를 막고(대사 진행으로 새지 않게), 마우스·터치로 누른 뒤에는 포커스를 놓는다
  const b = button('', 'autosave-chip', () => onOpen());
  b.dataset.noadvance = '';
  b.setAttribute('aria-haspopup', 'dialog');
  setAutosaveChip(b, 'tab-only');
  // 알약 폭을 부모(#vn)에 알려 같은 줄의 장소 표시 최대 폭을 줄인다(styles/play.css 12절). 숨겨져 있으면(폭 0) 지운다
  if (typeof ResizeObserver === 'function') {
    let last = -1;
    const ro = new ResizeObserver(() => {
      const host = b.parentElement;
      if (!host) return;
      const w = Math.round(b.offsetWidth);
      if (w === last) return;
      last = w;
      if (w > 0) host.style.setProperty('--asw', `${w}px`);
      else host.style.removeProperty('--asw');
    });
    ro.observe(b);
  }
  return b;
}

/** 상태 표시의 글자·접근 이름을 상태에 맞춘다(보이고 숨기는 것은 CSS) */
export function setAutosaveChip(b: HTMLButtonElement, status: AutoSaveStatus): void {
  const s = status === 'low-space' ? 'low-space' : 'tab-only';
  if (b.dataset.state === s) return;
  b.dataset.state = s;
  const [head, tail] = AUTOSAVE_TEXT.chip[s];
  b.title = AUTOSAVE_TEXT.chipTitle[s];
  // 접근 이름은 보이는 글자로 시작한다(좁은 탭 띠에서 뒷부분(.lbl-x)을 숨겨도 같다)
  b.setAttribute('aria-label', `${head}${tail} (자동 저장 안내)`);
  // 좁은 탭 띠(선택지 동안 + 빠른 메뉴 compact 단계)에서는 뒷부분(.lbl-x)을 숨겨 앞부분이 잘리지 않게 한다(play.css 12절)
  const lbl = el('span', 'lbl', head);
  lbl.append(el('span', 'lbl-x', tail));
  b.replaceChildren(ico('warn'), lbl);
}
