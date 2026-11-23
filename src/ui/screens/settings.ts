/**
 * 설정 본문(docs/UI_DESIGN.md 6.11)
 *
 * .panel-body.cfg (스크롤은 이 요소 하나 — 테스트 훅)
 *   .tabs[role=tablist][aria-orientation=vertical] > button.tab[data-cfg]  글자·대사창 / 소리 / 화면·조작
 *   .cfg-pane[role=tabpanel][data-cfgpanel] × 3 (모두 DOM 에 두고 hidden 만 바꾼다)
 *     글자·대사창: 글자 속도 · 자동 진행 속도 · 대사창 불투명도 · 글자 크기(radiogroup) + 미리보기
 *     소리: 배경음 · 효과음(손을 떼면 효과음을 낸다)
 *     화면·조작: 전체화면 · 빛망울 효과 스위치 · 키 안내 · 안내 문구
 * .panel-foot: '바꾼 설정은 바로 저장돼요.' · 기본값으로 · 닫기(.btn.primary)
 *
 * 미리보기는 작은 무대(교실 + 히나) 위에 실제 TextBox 를 축소해 붙인다. 글자 속도를 바꾸면 예시 문장을
 * 처음부터 다시 타자하고, 다 쓰면 자동 진행 속도만큼 쉬고 반복한다. 스크린리더는 읽지 않는다(aria-hidden, live 없음).
 */
import { autoDelayMs, charsPerSecond, textScaleFactor, type Settings } from '../../engine/settings';
import { button, el } from '../dom';
import { ico, type IconName } from '../icons';
import { TextBox } from '../textbox';
import type { SheetView } from './sheet';

export type CfgCat = 'text' | 'sound' | 'screen';

export interface SettingsOptions {
  get(): Settings;
  /** 값을 바꾸고 저장·적용한다 */
  set<K extends keyof Settings>(key: K, value: Settings[K]): void;
  /** 기본값으로 되돌린다(저장·적용 포함) */
  reset(): void;
  /** 효과음 음량 확인용 */
  sfxSample(): void;
  lastCat: CfgCat | null;
  setLastCat(c: CfgCat): void;
  /** 미리보기 무대 */
  previewBg: string | null;
  previewSprite: string | null;
  previewName: string;
  /** 전체화면 줄을 보여 줄지(앱·브라우저 전체화면이면 숨김) */
  fullscreen: { show: boolean; isOn(): boolean; toggle(): Promise<void> };
  close(): void;
}

const SAMPLE = '이 정도 속도면 읽기 편해? 천천히 골라 봐.';

interface RangeDef {
  key: 'textSpeed' | 'autoSpeed' | 'windowOpacity' | 'bgmVolume' | 'sfxVolume';
  label: string;
  min: number;
  max: number;
  fmt(v: number): string;
  scale: [string, string];
}

const RANGES: Record<string, RangeDef> = {
  textSpeed: { key: 'textSpeed', label: '글자 속도', min: 1, max: 10, fmt: (v) => (v >= 10 ? '즉시' : String(v)), scale: ['느리게', '즉시'] },
  autoSpeed: { key: 'autoSpeed', label: '자동 진행 속도', min: 1, max: 10, fmt: (v) => String(v), scale: ['여유 있게', '빠르게'] },
  windowOpacity: { key: 'windowOpacity', label: '대사창 불투명도', min: 40, max: 100, fmt: (v) => `${v}%`, scale: ['투명하게', '선명하게'] },
  bgmVolume: { key: 'bgmVolume', label: '배경음 음량', min: 0, max: 100, fmt: (v) => (v <= 0 ? '끔' : String(v)), scale: ['작게', '크게'] },
  sfxVolume: { key: 'sfxVolume', label: '효과음 음량', min: 0, max: 100, fmt: (v) => (v <= 0 ? '끔' : String(v)), scale: ['작게', '크게'] },
};

const SCALE_LABELS = ['보통', '크게', '더 크게'];

const CATS: Array<{ id: CfgCat; label: string; icon: IconName }> = [
  { id: 'text', label: '글자·대사창', icon: 'text' },
  { id: 'sound', label: '소리', icon: 'sound' },
  { id: 'screen', label: '화면·조작', icon: 'screen' },
];

const KEYS: Array<[string, string]> = [
  ['Enter / Space / 클릭', '다음 대사'],
  ['A', '자동 진행'],
  ['S', '읽은 대사 건너뛰기'],
  ['L / 휠 위로', '대화 기록'],
  ['F5', '퀵저장'],
  ['F9', '퀵로드'],
  ['H', '대사창 숨기기'],
  ['Esc', '메뉴'],
  ['1 ~ 3', '선택지 고르기'],
];

let seq = 0;

export function buildSettings(o: SettingsOptions): SheetView {
  const uid = `vn-cfg-${++seq}`;
  const body = el('div', 'panel-body cfg');
  const syncers: Array<() => void> = [];
  let previewRestart: () => void = () => undefined;

  // ---- 분류 탭 ----
  const tabs = el('div', 'tabs');
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-orientation', 'vertical');
  tabs.setAttribute('aria-label', '설정 분류');
  const tabBtns = new Map<CfgCat, HTMLButtonElement>();
  const panes = new Map<CfgCat, HTMLElement>();
  let cat: CfgCat = o.lastCat ?? 'text';

  function selectCat(c: CfgCat, focus = false) {
    cat = c;
    o.setLastCat(c);
    for (const [k, b] of tabBtns) {
      const on = k === c;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
    }
    for (const [k, p] of panes) p.hidden = k !== c;
    if (focus) tabBtns.get(c)?.focus({ preventScroll: true });
    body.scrollTop = 0;
  }

  for (const c of CATS) {
    const b = el('button', 'tab');
    b.type = 'button';
    b.id = `${uid}-tab-${c.id}`;
    b.dataset.cfg = c.id;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-controls', `${uid}-pane-${c.id}`);
    b.append(ico(c.icon), c.label);
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      selectCat(c.id);
      if (ev.detail > 0) b.blur();
    });
    tabBtns.set(c.id, b);
    tabs.append(b);
  }
  tabs.addEventListener('keydown', (ev) => {
    const i = CATS.findIndex((c) => c.id === cat);
    let next = -1;
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowRight') next = (i + 1) % CATS.length;
    else if (ev.key === 'ArrowUp' || ev.key === 'ArrowLeft') next = (i - 1 + CATS.length) % CATS.length;
    else if (ev.key === 'Home') next = 0;
    else if (ev.key === 'End') next = CATS.length - 1;
    if (next < 0) return;
    ev.preventDefault();
    selectCat(CATS[next].id, true);
  });
  body.append(tabs);

  function pane(c: CfgCat, extra = ''): HTMLElement {
    const p = el('div', `cfg-pane${extra ? ` ${extra}` : ''}`);
    p.id = `${uid}-pane-${c}`;
    p.dataset.cfgpanel = c;
    p.setAttribute('role', 'tabpanel');
    p.setAttribute('aria-labelledby', `${uid}-tab-${c}`);
    panes.set(c, p);
    body.append(p);
    return p;
  }

  // ---- 슬라이더 줄 ----
  function rangeRow(def: RangeDef): HTMLElement {
    const row = el('div', 'setting');
    const id = `${uid}-${def.key}`;
    const lab = el('label', '', def.label);
    lab.htmlFor = id;
    const input = el('input');
    input.type = 'range';
    input.id = id;
    input.min = String(def.min);
    input.max = String(def.max);
    input.step = '1';
    input.dataset.setting = def.key;
    const out = el('output');
    out.htmlFor.add(id);
    const scale = el('span', 'scale');
    scale.setAttribute('aria-hidden', 'true');
    scale.append(el('span', '', def.scale[0]), el('span', '', def.scale[1]));
    const paint = () => {
      const v = Number(input.value);
      out.textContent = def.fmt(v);
      input.style.setProperty('--p', `${((v - def.min) / (def.max - def.min)) * 100}%`);
      input.setAttribute('aria-valuetext', def.fmt(v));
    };
    const sync = () => {
      input.value = String(o.get()[def.key]);
      paint();
    };
    input.addEventListener('input', () => {
      o.set(def.key, Number(input.value));
      paint();
      if (def.key === 'textSpeed' || def.key === 'autoSpeed') previewRestart();
    });
    if (def.key === 'sfxVolume') input.addEventListener('change', () => o.sfxSample());
    sync();
    syncers.push(sync);
    row.append(lab, input, out, scale);
    return row;
  }

  // ---- 글자 크기(radiogroup) ----
  function scaleRow(): HTMLElement {
    const row = el('div', 'setting choose');
    const labId = `${uid}-scale-lab`;
    const lab = el('span', 'lab', '글자 크기');
    lab.id = labId;
    const seg = el('div', 'seg');
    seg.setAttribute('role', 'radiogroup');
    seg.setAttribute('aria-labelledby', labId);
    seg.dataset.setting = 'textScale';
    const radios: HTMLButtonElement[] = [];
    const sync = () => {
      const cur = o.get().textScale;
      radios.forEach((r, i) => {
        r.setAttribute('aria-checked', String(i === cur));
        r.tabIndex = i === cur ? 0 : -1;
      });
    };
    const choose = (i: number, focus = false) => {
      o.set('textScale', i);
      sync();
      if (focus) radios[i].focus({ preventScroll: true });
      previewScale();
    };
    SCALE_LABELS.forEach((t, i) => {
      const r = el('button', '', t);
      r.type = 'button';
      r.setAttribute('role', 'radio');
      r.addEventListener('click', (ev) => {
        ev.stopPropagation();
        choose(i);
        if (ev.detail > 0) r.blur();
      });
      radios.push(r);
      seg.append(r);
    });
    seg.addEventListener('keydown', (ev) => {
      const cur = o.get().textScale;
      let next = -1;
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') next = Math.min(2, cur + 1);
      else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') next = Math.max(0, cur - 1);
      if (next < 0) return;
      ev.preventDefault();
      choose(next, true);
    });
    sync();
    syncers.push(sync);
    row.append(lab, seg);
    return row;
  }

  // ---- 스위치 ----
  function toggleRow(label: string, hint: string, key: string, isOn: () => boolean, onChange: (on: boolean) => void): HTMLElement {
    const row = el('div', 'setting toggle');
    const id = `${uid}-${key}`;
    const lab = el('label');
    lab.htmlFor = id;
    lab.append(label);
    if (hint) lab.append(el('span', 'hint', hint));
    const sw = el('span', 'switch');
    const input = el('input');
    input.type = 'checkbox';
    input.id = id;
    input.setAttribute('role', 'switch');
    input.dataset.setting = key;
    const sync = () => {
      input.checked = isOn();
    };
    input.addEventListener('change', () => onChange(input.checked));
    input.addEventListener('click', (ev) => ev.stopPropagation());
    sync();
    syncers.push(sync);
    sw.append(input, el('span'));
    sw.lastElementChild!.setAttribute('aria-hidden', 'true');
    row.append(lab, sw);
    return row;
  }

  // ---- 글자·대사창 ----
  const pText = pane('text');
  const rowsText = el('div', 'cfg-rows');
  rowsText.append(rangeRow(RANGES.textSpeed), rangeRow(RANGES.autoSpeed), rangeRow(RANGES.windowOpacity), scaleRow());

  const preview = el('div', 'preview');
  preview.setAttribute('aria-hidden', 'true');
  const cap = el('div', 'preview-cap');
  cap.append(ico('play'), '미리보기 · 지금 설정으로 글자가 나와요');
  const pstage = el('div', 'preview-stage');
  if (o.previewBg) pstage.style.setProperty('--bg', `url("${o.previewBg}")`);
  if (o.previewSprite) {
    const img = el('img');
    img.alt = '';
    img.draggable = false;
    img.src = o.previewSprite;
    pstage.append(img);
  }
  const tb = new TextBox({ live: false });
  pstage.append(tb.el);
  preview.append(cap, pstage);
  pText.append(rowsText, preview);

  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  const previewScale = () => pstage.style.setProperty('--pv-scale', String(textScaleFactor(o.get().textScale)));
  const run = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (disposed || !tb.el.isConnected) return;
    tb.show(o.previewName, 'tenko', SAMPLE, false, charsPerSecond(o.get().textSpeed));
  };
  tb.onDone = () => {
    if (disposed) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(run, Math.max(1200, autoDelayMs(o.get().autoSpeed, SAMPLE.length)));
  };
  previewRestart = run;
  previewScale();

  // ---- 소리 ----
  const pSound = pane('sound', 'solo');
  const rowsSound = el('div', 'cfg-rows');
  rowsSound.append(rangeRow(RANGES.bgmVolume), rangeRow(RANGES.sfxVolume));
  pSound.append(rowsSound);

  // ---- 화면·조작 ----
  const pScreen = pane('screen');
  const rowsScreen = el('div', 'cfg-rows');
  if (o.fullscreen.show) {
    const fsRow = toggleRow(
      '전체화면',
      '주소창 없이 화면을 꽉 채워요',
      'fullscreen',
      () => o.fullscreen.isOn(),
      () => void o.fullscreen.toggle().then(() => setTimeout(syncAll, 80)),
    );
    rowsScreen.append(fsRow);
  }
  rowsScreen.append(
    toggleRow(
      '빛망울 효과',
      '타이틀·날짜 카드·엔딩의 빛망울과 반짝임',
      'particles',
      () => o.get().particles === 1,
      (on) => o.set('particles', on ? 1 : 0),
    ),
  );
  rowsScreen.append(
    el(
      'p',
      'setting-note',
      '건너뛰기는 이미 읽은 대사에서만 동작하고, 처음 보는 대사·선택지에서 멈춰요. 자동 진행도 선택지에서는 기다려요.',
    ),
  );
  const keys = el('div', 'keys');
  keys.setAttribute('role', 'list');
  keys.setAttribute('aria-label', '키보드 조작');
  for (const [k, what] of KEYS) {
    const item = el('div', 'key-item');
    item.setAttribute('role', 'listitem');
    const kbd = el('span', 'kbd-group');
    k.split(' / ').forEach((part, i) => {
      if (i) kbd.append(' ');
      kbd.append(el('kbd', '', part));
    });
    item.append(kbd, el('span', '', what));
    keys.append(item);
  }
  const keysBox = el('div', 'keys-box');
  keysBox.append(el('div', 'keys-cap', '키보드'), keys);
  pScreen.append(rowsScreen, keysBox);

  // ---- 바닥줄 ----
  const foot = el('div', 'panel-foot');
  const reset = button('기본값으로', 'btn', () => {
    o.reset();
    syncAll();
    previewScale();
    run();
  });
  reset.dataset.action = 'reset';
  const closeBtn = button('닫기', 'btn primary', () => o.close());
  closeBtn.dataset.action = 'close-settings';
  foot.append(el('span', 'note', '바꾼 설정은 바로 저장돼요.'), reset, closeBtn);

  function syncAll() {
    for (const s of syncers) s();
  }

  const onFs = () => setTimeout(syncAll, 50);
  document.addEventListener('fullscreenchange', onFs);

  selectCat(cat);

  return {
    body,
    after: foot,
    shown() {
      run();
    },
    dispose() {
      disposed = true;
      if (timer) clearTimeout(timer);
      timer = null;
      tb.onDone = () => undefined;
      tb.clear();
      document.removeEventListener('fullscreenchange', onFs);
    },
  };
}
