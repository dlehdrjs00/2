/**
 * 무대 렌더러: 배경, 캐릭터, 화면 효과, 햇살·빛망울, 장소 표시, 날짜 카드(일력), 선택지 베일, 숨기기 안내
 *
 * - 배경·스프라이트·이벤트 CG 는 바꿀 그림을 먼저 해독(img.decode)한 뒤에만 보여 준다. 느린 네트워크에서
 *   덜 받은 그림(위에서부터 띠 모양으로 그려지는 그림)이 무대에 붙지 않게, 해독이 끝날 때까지는 앞 그림을 그대로 둔다
 *   (새 인물은 .entering 으로 숨긴 채, 표정 교체는 이전 그림, 배경은 이전 배경, CG 는 무대 그대로).
 *   해독에 실패한 그림(파일 없음·손상)은 배경·인물은 그대로 붙이고(오류 처리는 각자), CG 는 띄우지 않는다.
 * - 새 배경을 기다리는 동안(bgPending)에는 장면이 섞여 보이지 않게, 그동안 들어온 인물 교체(나가기·들어오기·표정)와
 *   장소 표시를 새 배경이 실제로 붙는 순간(크로스페이드 시작)까지 미룬다. 장소 표시의 3.2초 자동 숨김도 그때부터,
 *   같은 묶음의 인물·CG 그림이 아직이면 그 그림이 붙을 때부터 센다(느린 망에서 대사보다 먼저 꺼지지 않게).
 *   새 배경도 같은 묶음(applyVisual 한 번)의 인물 그림이 해독될 때까지 기다렸다 함께 붙는다(작은 배경만 먼저 붙어
 *   '새 배경 + 인물 없음'이 앞 대사 아래 남지 않게). 배경 요청부터 8초(BG_HOLD_MAX_MS)가 지나면 받는 중인 그대로 붙인다
 *   (배경 요청이 멈춰도 무대가 앞 장면에 고정되지 않게).
 * - 불러오기·타이틀처럼 무대를 새로 그리면 무대 세대(gen)를 올린다. 앞 세대의 막 연출(veilOut·flash)은 새 무대를
 *   건드리지 않고 끝나고, 앞 세대에서 미뤄 둔 퇴장은 불러온 배경이 붙을 때 연출 없이 빠진다.
 * - CG 는 해독에 쓴 <img> 를 그대로 .cg-layer 안에 붙이고, 페이드 전에 거의 투명하게(.prime) 두 프레임 그려 래스터를
 *   끝내 둔다. 투명도 0 에서 바로 페이드하면 래스터가 느린 환경(GPU 없는 소프트웨어 래스터)에서 페이드가 빈 레이어로
 *   흘러가고 그림이 0.3~1.1초 뒤 툭 튀어나왔다(배경·인물·CG 가 함께 바뀌는 c6.a20 등).
 * - 화면 팀이 대사를 그리기 전에 무대 준비를 기다릴 수 있게 ready(ms) 를 둔다(최대 ms, 누르면 hurry 로 즉시 끝).
 *   ready() 는 마지막 ready() 뒤에 들어온 그림 요청만 기다리고, 시간 초과·누름으로 넘긴 그림은 그 해독이 끝날 때까지
 *   다시 기다리지 않는다(끝난 뒤 해독 캐시에서 퇴출돼 다시 해독하게 되면 평소처럼 기다린다).
 *   1.2초가 넘게 기다리면 무대 가운데에 '불러오는 중' 알약을 띄운다(켜면 최소 0.4초). 암전 막(veilOut)도 같은 방식으로 기다린다.
 * - 이벤트 CG 가 떠 있는 동안 무대에 data-cg 를 단다(styles/play.css 가 대사창·빠른 메뉴 유리를 옅게 해 그림이 비치게).
 *   #vn[data-cgfit=low](layout.ts: 탭 띠가 무대 높이의 66% 보다 위)이면 CG 마다 정한 확대·위치로 얼굴·동작을 탭 위로 올린다.
 * - 배경 톤(낮·노을·밤)은 에셋 매니페스트(BACKGROUNDS[id].tone)로 정하고, 그림이 실제로 바뀌는 순간
 *   onBackdrop(url, color, tone) 으로 알린다(화면 팀이 #vn[data-tone] 을 갱신). 무대 자신도 data-tone 을 가진다.
 * - 빛망울(.motes)은 레이어 하나를 두고 화면 종류에 따라 개수를 바꾼다(대사 9 · 날짜 카드 16).
 *   설정 particles 를 끄면(setParticles(false)) 비운다. prefers-reduced-motion 이면 CSS 가 멈춘다.
 * - 날짜 카드는 .stage > .card 로 범위를 좁힌다(대화 기록 항목 .card 와 이름이 겹치던 결함, UI_DESIGN 부록 A).
 *   카드는 다음 배경(bgAfterCard → showCard 의 nextBg)을 흐려 그리고 그 배경의 톤을 따른다(.card[data-tone]).
 *   무대가 낮으면 카드 묶음이 무대를 넘지 않게 실제 높이를 재서 압축 단계(.card[data-fit] 0~4)를 고른다.
 */
import type { BgFx, BgId, CgId, CharId, CharState, StageState, Step } from '../engine/types';
import { BACKGROUNDS, type BgTone, type BgWeather } from '../story/assets';
import { CGS } from '../story/cg';
import { DATES } from '../story/config';
import { el } from './dom';
import { DecodedImageCache } from './image-cache';

export type { BgTone };

export interface StageResolver {
  bgUrl(id: BgId): string | null;
  bgColor(id: BgId): string | null;
  spriteUrl(char: CharId, s: CharState): string | null;
  charLabel(char: CharId): string;
  /** 선택: 배경 톤. 없으면 에셋 매니페스트(BACKGROUNDS[id].tone, 기본 낮)로 정한다 */
  bgTone?(id: BgId): BgTone;
  /** 선택: 이벤트 CG 주소. 없으면 매니페스트(story/cg.ts CGS[id].src)를 문서 기준으로 쓴다 */
  cgUrl?(id: CgId): string | null;
}

const DUR = { fade: 550, veil: 380, char: 350, card: 500, cg: 550 };
/** 그림 해독을 이 시간 넘게 기다리면 '불러오는 중' 표시를 띄운다(보통 네트워크에서는 보이지 않음) */
const DECODE_MAX_MS = 1200;
/** 암전 막 뒤에서 새 무대 그림을 기다리는 최대 시간(누르면 바로 걷힌다) */
const VEIL_WAIT_MS = 8000;
/** ready() 기본 대기 상한 */
const READY_MAX_MS = 8000;
/**
 * 새 배경(과 같은 묶음의 인물 그림)을 기다리며 앞 장면을 붙잡아 두는 최대 시간(배경 요청부터).
 * 지나면 받는 중인 배경을 그대로 붙이고(바탕색 + 받는 대로 그려짐) 미뤄 둔 인물 교체·장소 표시를 푼다.
 * 배경 요청이 응답 없이 멈추면 무대가 앞 장면에 고정된 채 새 장면 대사가 흘러가던 것을 막는다(막 경로의 VEIL_WAIT_MS 와 같은 값).
 */
const BG_HOLD_MAX_MS = 8000;
/** '불러오는 중' 알약을 한 번 켜면 이만큼은 보인다(켜진 지 0.1초 만에 꺼져 반쯤 보였다 사라지는 깜빡임 방지) */
const LOADING_MIN_MS = 400;
/** 연출 없이(animate=false) 그리라는 그림이 이보다 늦게 준비되면 툭 튀어나오지 않게 페이드로 보인다 */
const LATE_MS = 150;
/** 장소 표시가 떠 있는 시간(명세 7장 '3.2s 뒤 퇴장') */
const PLACE_MS = 3200;
/** CG 예열(거의 투명하게 두 프레임 그리기)의 최대 시간(숨은 탭처럼 프레임이 멈춘 경우) */
const PRIME_MAX_MS = 1500;
/** 빛망울 개수 상한(명세 8장): 대사 9, 날짜 카드 16 */
const MOTE_COUNT = { play: 9, card: 16 } as const;
const WEEKDAYS = ['월', '화', '수', '목', '금'] as const;
const DATE_RE = /^(\d{1,2})월 (\d{1,2})일 ([월화수목금토일])요일$/;
const DATE_PREFIX_RE = /^(\d{1,2})월 \d{1,2}일/;
/**
 * 날짜 카드 압축 단계(styles/play.css .stage > .card[data-fit]). 무대가 낮으면(세로 대체 배치, 740×280 등)
 * 카드 묶음(주 차 알약·일력·주간 점)이 무대 높이를 넘지 않게 한 단계씩 줄인다.
 * 0 그대로 · 1 숫자·간격 축소 · 2 주간 점을 일력 장식선 안으로 · 3 주 차 알약 숨김·머리띠 축소 · 4 장식선 숨김·최소 크기
 */
const CARD_FIT_MAX = 4;
/** 일력의 −1.5° 기울임으로 늘어나는 높이 비율(sin 1.5° ≈ 0.026) + 반올림 여유 */
const CAL_TILT = 0.027;
/** 카드 묶음 위아래에 남길 최소 틈(글자 크기 배수) */
const CARD_SPARE_FS = 1;

// ---------------------------------------------------------------------------
// 그림 해독(최근 주소의 Image만 제한적으로 보관하고, 퇴출된 그림은 필요할 때 다시 해독).
// 상한은 image-cache.ts 기본값: 8장 또는 해독 픽셀 12Mi(약 48MiB). 지금 그림(배경·CG 1920x1080, 인물 1200x1800)으로는
// 픽셀 상한이 먼저 걸려 5~6장이다. 해독 중인 그림·화면에 붙은 CG·방금 해독한 한 장은 퇴출하지 않는다. 모든 기기에 적용
// ---------------------------------------------------------------------------

const decodeCache = new DecodedImageCache();

/**
 * 해독 결과: 성공 true, 실패(파일 없음·손상) false. 시간 상한 없이 해독(또는 실패)이 끝나야 풀린다.
 * decode() 가 거절돼도 그림 자체는 받아졌으면(load 이벤트) 성공으로 본다(일부 브라우저가 SVG·큰 그림의 decode 를 거절).
 */
function decodeOnce(url: string): Promise<boolean> {
  return decodeCache.decode(url);
}

/** 해독(또는 실패)이 끝난 주소인지. 요청한 적 없는 주소는 false */
function decodeSettled(url: string): boolean {
  return decodeCache.settled(url);
}

/** decodeOnce 가 해독에 쓴 Image(같은 주소를 그대로 화면에 붙이면 해독 결과를 다시 쓴다) */
function decodedImage(url: string): HTMLImageElement | null {
  return decodeCache.image(url);
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * n 프레임이 그려진 뒤(requestAnimationFrame n 번). 브라우저는 앞 프레임의 래스터가 끝나야 다음 프레임을 돌리므로
 * 무거운 그림을 붙인 뒤 기다리면 그 래스터를 기다리는 셈이 된다. 프레임이 멈춘(숨은 탭) 경우를 위해 maxMs 에서 끝낸다.
 */
function afterFrames(n: number, maxMs: number): Promise<void> {
  return new Promise((resolve) => {
    let left = n;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(cap);
      resolve();
    };
    const cap = setTimeout(finish, maxMs);
    if (typeof requestAnimationFrame !== 'function') return finish();
    const tick = () => {
      if (--left <= 0) finish();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

// ---------------------------------------------------------------------------
// 빛망울
// ---------------------------------------------------------------------------

export interface MoteOptions {
  /** 밤 색(금·분홍·하늘) */
  night?: boolean;
  /** 노을 색(살구·분홍·금) */
  evening?: boolean;
  /** 옅게: 위쪽 55% 안에, 작고 투명하게(대사 화면) */
  soft?: boolean;
  /** 같은 화면은 늘 같은 배치가 되게 하는 씨앗 */
  seed?: number;
}

/** 결정적 난수(스크린샷이 매번 같게) */
function rng(seed: number): () => number {
  let x = (seed * 9301 + 49297) % 233280;
  return () => {
    x = (x * 9301 + 49297) % 233280;
    return x / 233280;
  };
}

/**
 * 빛망울 n 개를 container 에 채운다(transform·opacity 애니메이션만, styles/play.css .motes).
 * 타이틀(26)·엔딩(22)에서도 쓸 수 있게 내보낸다.
 */
export function fillMotes(container: HTMLElement, n: number, opts: MoteOptions = {}): void {
  const r = rng(opts.seed ?? 1);
  const colors = opts.night
    ? ['rgba(255,227,161,.6)', 'rgba(255,190,215,.55)', 'rgba(170,210,255,.55)']
    : opts.evening
      ? ['rgba(255,214,170,.6)', 'rgba(255,196,214,.55)', 'rgba(255,236,190,.6)']
      : ['rgba(200,232,255,.6)', 'rgba(255,214,230,.55)', 'rgba(255,240,200,.6)'];
  const soft = !!opts.soft;
  const frag = document.createDocumentFragment();
  for (let k = 0; k < n; k++) {
    const i = document.createElement('i');
    const glint = r() < (opts.night ? 0.4 : 0.28);
    const size = glint ? 6 + r() * 10 : (soft ? 10 : 8) + r() * (soft ? 26 : 34);
    if (glint) i.className = 'glint';
    const v: Record<string, string> = {
      '--x': `${(r() * 100).toFixed(1)}%`,
      '--y': `${(soft ? r() * 55 : r() * 92).toFixed(1)}%`,
      '--s': `${size.toFixed(0)}px`,
      '--o': (soft ? 0.25 + r() * 0.35 : 0.35 + r() * 0.5).toFixed(2),
      '--b': `${(glint ? 0 : r() * 2.5).toFixed(1)}px`,
      '--c': colors[k % 3],
      '--d': `${(8 + r() * 10).toFixed(1)}s`,
      '--dl': `${(-r() * 10).toFixed(1)}s`,
      '--dx': `${(r() * 30 - 15).toFixed(0)}px`,
    };
    for (const [key, val] of Object.entries(v)) i.style.setProperty(key, val);
    frag.append(i);
  }
  container.replaceChildren(frag);
}

/** 문서 기준 절대 주소. CSS 사용자 정의 속성(--bg 등)에 url() 을 넣을 때 쓴다(상대 주소는 CSS 파일 기준으로 풀림) */
export function absoluteUrl(url: string): string {
  try {
    return new URL(url, document.baseURI).href;
  } catch {
    return url;
  }
}

/** 배경 id → 톤(매니페스트 기준, 기본 낮) */
export function toneOfBg(id: string | undefined): BgTone {
  if (!id) return 'day';
  return (BACKGROUNDS as Record<string, { tone?: BgTone } | undefined>)[id]?.tone ?? 'day';
}

/**
 * 일력 머리띠의 날씨 아이콘. 매니페스트에 날씨(BACKGROUNDS[id].weather)가 있으면 그것을 먼저 쓴다
 * (bg_after_rain 처럼 이름은 _rain 이지만 비가 그친 그림). 없으면 비 배경(_rain)은 비, 밤·축제는 달, 그 밖은 해
 */
export function weatherOf(id: string | undefined, tone: BgTone): BgWeather {
  const set = id ? (BACKGROUNDS as Record<string, { weather?: BgWeather } | undefined>)[id]?.weather : undefined;
  if (set) return set;
  if (id && /_rain$/.test(id)) return 'rain';
  if (tone === 'night' || (id && (/night/.test(id) || /^festival/.test(id)))) return 'moon';
  return 'sun';
}

/** 카드 뒤에서 멈추는 스텝: 화면에 무언가를 보여 주며 입력을 기다리거나, 다른 곳으로 이동한다 */
const CARD_LOOKAHEAD_STOP = new Set<Step['t']>(['say', 'card', 'choice', 'ending', 'goto', 'jump', 'if', 'decideRoute', 'routeBranch']);

/**
 * 날짜 카드 다음에 나올 배경. 카드 스텝 바로 뒤부터 다음 대사·카드·선택지·엔딩이나 이동(goto·jump·if·분기) 전까지의
 * 첫 bg 명령을 찾는다. 대본은 흔히 카드 앞에서 암전(bg black)을 걸고 카드 뒤에서 새 장면 배경을 깔기 때문에,
 * 카드는 '지금 배경'이 아니라 이 배경을 흐려서 그려야 한다(명세 6.8). 없으면 undefined(카드는 지금 배경을 쓴다).
 * 화면 팀(game.ts present 의 card 단계)이 StageView.showCard 의 nextBg 로 넘긴다.
 */
export function bgAfterCard(steps: readonly Step[] | undefined, cardId: string): BgId | undefined {
  if (!steps) return undefined;
  const at = steps.findIndex((s) => s.id === cardId);
  if (at < 0) return undefined;
  for (let k = at + 1; k < steps.length; k++) {
    const s = steps[k];
    if (s.t === 'bg') return s.bg;
    if (CARD_LOOKAHEAD_STOP.has(s.t)) return undefined;
  }
  return undefined;
}

/** 날짜 문구가 config.DATES 의 몇 주 차·몇 번째 날인지(공통 d1~d5 = 1주 차, 루트 r1~r5 = 2주 차) */
function weekOf(main: string): { week: number; day: number } | null {
  for (const [key, value] of Object.entries(DATES)) {
    if (value !== main) continue;
    const m = /^([dr])([1-5])$/.exec(key);
    if (m) return { week: m[1] === 'd' ? 1 : 2, day: Number(m[2]) - 1 };
  }
  return null;
}

/**
 * 월~금 점. 지난 날 past(하늘), 오늘 now(분홍 + 후광).
 * labels 면 요일 글자 아래 점(카드 아래 .week 알약), 아니면 점만(일력 장식선 안 .cal-dots)
 */
function weekDots(cls: string, today: number, labels: boolean): HTMLElement {
  const w = el(labels ? 'div' : 'span', cls);
  w.setAttribute('aria-hidden', 'true');
  WEEKDAYS.forEach((d, i) => {
    const state = i < today ? 'past' : i === today ? 'now' : '';
    w.append(labels ? el('span', state, d) : el('i', state));
  });
  return w;
}

/**
 * 일력 부제. ' · ' 로 나뉜 부분('8월 8일 토요일 · 아사히 강 여름 축제')은 덩어리째 줄을 바꾼다
 * ('아사히 / 강 여름 축제'처럼 낱말 중간에서 끊기지 않게). 구분점은 따로 둔 .cal-sub-sep 이라,
 * 한 줄에 다 들어가지 않으면(fitSubLine 이 data-wrap 을 닮) 덩어리마다 한 줄씩 놓고 점은 화면에서만 감춘다
 * (줄 끝에 '·' 가 홀로 남지 않게). 읽는 글자(textContent)는 원문 그대로다.
 */
function subLine(sub: string): HTMLElement {
  const line = el('div', 'cal-sub');
  sub.split(' · ').forEach((p, i) => {
    if (i > 0) line.append(' ', el('span', 'cal-sub-sep', '·'), ' ');
    line.append(el('span', 'cal-sub-part', p));
  });
  return line;
}

/** 부제 덩어리가 여러 줄로 나뉘었는지 재서 data-wrap 을 단다(늘 '한 줄' 상태에서 재므로 단 뒤에 흔들리지 않는다) */
function fitSubLine(line: HTMLElement | null): void {
  if (!line) return;
  const parts = line.querySelectorAll<HTMLElement>(':scope > .cal-sub-part');
  delete line.dataset.wrap;
  if (parts.length < 2) return;
  const top = parts[0].offsetTop;
  for (const p of parts) {
    if (Math.abs(p.offsetTop - top) > 1) {
      line.dataset.wrap = '1';
      return;
    }
  }
}

type CharImg = HTMLImageElement;

export class StageView {
  readonly el: HTMLElement;
  private bgLayers: [HTMLElement, HTMLElement];
  private activeBg = 0;
  /** 마지막으로 요청한 배경(해독을 기다리는 중이어도 이 값) */
  private bgId: BgId | undefined;
  private bgToken = 0;
  /** 해독을 기다리는 배경 적용 함수(암전 막을 걷어야 하는데 아직이면 flushBg 가 바로 그린다) */
  private bgPending: (() => void) | null = null;
  /** 대기 중인 배경이 실제로 붙으면(해독 뒤, 또는 막을 걷으며 flushBg) 풀리는 약속. 그사이 새 요청이 오면 마지막 요청을 기다린다 */
  private bgShown: { promise: Promise<void>; resolve: () => void } | null = null;
  /** 대기 중인 배경을 BG_HOLD_MAX_MS 뒤 그대로 붙이는 타이머 */
  private bgHoldTimer: ReturnType<typeof setTimeout> | null = null;
  private bgFadeTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * 무대 세대: 불러오기(renderSnapshot)·비우기(clearAll)·막 즉시 걷기(clearVeilInstant)마다 올린다.
   * 앞 세대의 막 연출(veilOut·flash)이 새 무대의 배경을 해독 전에 붙이거나(flushBg) 새 무대를 기다리지 않게,
   * 앞 세대에서 미뤄 둔 퇴장이 불러온 무대 위에서 페이드하지 않게 한다.
   */
  private gen = 0;
  /**
   * 아직 어떤 ready() 도 기다리지 않은 그림 준비(배경·CG 는 마지막 요청, 인물은 인물마다 마지막 요청).
   * ready() 는 이것만 기다리고 비운다: 앞 줄에서 이미 상한까지 기다렸거나 누름으로 넘긴 그림을 다음 줄에서 또 기다리지 않게.
   * urls 는 그 요청이 해독을 기다리는 그림(ready() 가 포기할 때 givenUp 에 넣는다). giveUp 은 포기할 때 부른다.
   */
  private fresh = new Map<string, { promise: Promise<unknown>; urls: string[]; giveUp?: () => void }>();
  /**
   * ready() 가 기다리다 포기한(시간 초과·누름) 그림 주소. 아직 해독 전이면 다음 요청에서 다시 기다리지 않는다.
   * 해독이 끝나면 지운다: 해독 캐시(image-cache.ts)는 최근 몇 장만 보관하므로, 나중에 퇴출된 뒤 같은 그림이 다시 나오면
   * 다시 해독하는 동안은 평소처럼 기다려야 한다(지우지 않으면 대사가 앞 그림 위에 먼저 나온다)
   */
  private givenUp = new Set<string>();
  /**
   * 같은 묶음(applyVisual·renderSnapshot 한 번처럼 한 동기 흐름)에서 요청된 인물 그림 해독. 같은 묶음의 새 배경은
   * 이것까지 해독된 뒤 함께 붙는다(작은 배경 그림만 먼저 붙어 '새 배경 + 인물 없음' 무대가 앞 대사 아래 남지 않게)
   */
  private batch: Promise<unknown>[] | null = null;
  private tone: BgTone = 'day';
  private charsEl: HTMLElement;
  private chars = new Map<CharId, CharImg>();
  private charTokens = new Map<CharId, number>();
  /** 인물별로 붙기를 기다리는 새 그림(해독·배경 대기 뒤 붙으면 지운다). 장소 표시의 3.2초를 언제부터 셀지 정한다 */
  private charReady = new Map<CharId, Promise<void>>();
  /** 마지막 CG 요청이 켜지거나(예열 포함) 실패로 끝나면 풀리는 약속 */
  private cgReady: Promise<void> = Promise.resolve();
  /** '불러오는 중' 알약과, 그것을 띄워 달라는 대기 수 */
  private loadingEl: HTMLElement;
  private loadingWaits = 0;
  private loadingOnAt = 0;
  private loadingOffTimer: ReturnType<typeof setTimeout> | null = null;
  private sunwash: HTMLElement;
  private motes: HTMLElement;
  private motesKey = '';
  private particles = true;
  /** 이벤트 CG(캐릭터 앞, 대사창 뒤 — 무대 가득) */
  private cgLayer: HTMLElement;
  private cgId: CgId | null = null;
  private cgToken = 0;
  private choiceVeil: HTMLElement;
  private veil: HTMLElement;
  private placeChip: HTMLElement;
  private placeTimer: ReturnType<typeof setTimeout> | null = null;
  /** 새 배경을 기다리는 동안 받은 장소 표시 글(배경이 붙을 때 띄운다) */
  private placeQueued: string | null = null;
  /** 장소 표시마다 늘린다(앞선 표시의 늦은 숨김 타이머가 새 표시를 걷지 않게) */
  private placeToken = 0;
  private cardEl: HTMLElement;
  /** 날짜 카드의 톤(카드가 그리는 배경 기준. 다음 배경을 받으면 그 배경의 톤) */
  private cardTone: BgTone = 'day';
  /** 무대 크기·일력 크기가 바뀌면 카드 압축 단계를 다시 고른다 */
  private cardFitObserver: ResizeObserver | null = null;
  private cardFitFrame = 0;
  private hideHint: HTMLElement;
  private hurryFns = new Set<() => void>();
  /** 배경이 실제로 바뀐 순간(해독 뒤) 알린다: 레터박스 그림·색과 톤(화면 팀이 #vn[data-tone] 갱신) */
  onBackdrop: (url: string | null, color: string | null, tone: BgTone) => void = () => undefined;

  constructor(private resolver: StageResolver) {
    this.bgLayers = [el('div', 'bg-layer'), el('div', 'bg-layer')];
    this.charsEl = el('div', 'chars');
    this.sunwash = el('div', 'sunwash');
    this.motes = el('div', 'motes');
    this.motes.setAttribute('aria-hidden', 'true');
    this.cgLayer = el('div', 'cg-layer');
    this.cgLayer.setAttribute('aria-hidden', 'true');
    this.choiceVeil = el('div', 'choice-veil');
    this.veil = el('div', 'veil');
    this.placeChip = el('div', 'place-chip');
    this.cardEl = el('div', 'card');
    this.hideHint = el('div', 'hide-hint');
    this.hideHint.setAttribute('role', 'status');
    const eye = el('span', 'ico');
    eye.setAttribute('aria-hidden', 'true');
    this.hideHint.append(eye, '화면을 누르면 대사창이 돌아와요');
    // 그림을 오래 기다릴 때(느린 네트워크) 무대 가운데에 뜨는 알약. 암전 막 위에도 보이게 맨 뒤에 둔다
    this.loadingEl = el('div', 'stage-loading');
    this.loadingEl.setAttribute('role', 'status');
    const spin = el('span', 'ico');
    spin.setAttribute('aria-hidden', 'true');
    this.loadingEl.append(spin, el('span', 'sl-text', '그림을 불러오는 중…'));
    this.el = el('div', 'stage');
    this.el.dataset.tone = this.tone;
    this.el.append(
      ...this.bgLayers,
      this.charsEl,
      this.sunwash,
      this.motes,
      this.cgLayer,
      this.choiceVeil,
      this.placeChip,
      this.cardEl,
      this.hideHint,
      this.veil,
      this.loadingEl,
    );
    this.renderMotes();
    // 카드 압축 단계: 무대 크기(화면 회전·주소창), 글자 크기 설정, 늦게 도착한 글꼴 조각이 카드 높이를 바꾼다.
    // ResizeObserver 콜백 안에서 배치를 바꾸면 'ResizeObserver loop' 경고가 나므로 다음 프레임으로 미룬다.
    if (typeof ResizeObserver !== 'undefined') {
      this.cardFitObserver = new ResizeObserver(() => this.scheduleCardFit());
      this.cardFitObserver.observe(this.cardEl);
    }
    if (typeof document !== 'undefined') document.fonts?.addEventListener?.('loadingdone', () => this.scheduleCardFit());
  }

  /** 진행 중인 연출 대기를 즉시 끝낸다 */
  hurry(): void {
    for (const f of [...this.hurryFns]) f();
  }

  wait(ms: number): Promise<void> {
    if (ms <= 0) return Promise.resolve();
    return this.waitFor(null, ms).then(() => undefined);
  }

  /** p 가 끝나거나(done), ms 가 지나거나(timeout), hurry() 가 불릴 때까지(hurry). 끝난 까닭을 돌려준다 */
  private waitFor(p: Promise<unknown> | null, ms: number): Promise<'done' | 'timeout' | 'hurry'> {
    return new Promise((resolve) => {
      let done = false;
      const finish = (why: 'done' | 'timeout' | 'hurry') => {
        if (done) return;
        done = true;
        clearTimeout(t);
        this.hurryFns.delete(onHurry);
        resolve(why);
      };
      const onHurry = () => finish('hurry');
      const t = setTimeout(() => finish('timeout'), ms);
      this.hurryFns.add(onHurry);
      p?.then(
        () => finish('done'),
        () => finish('done'),
      );
    });
  }

  // =========================================================================
  // 배경
  // =========================================================================

  private paintBg(layer: HTMLElement, id: BgId) {
    const url = this.resolver.bgUrl(id);
    const color = this.resolver.bgColor(id);
    layer.style.backgroundImage = url ? `url("${url}")` : 'none';
    layer.style.backgroundColor = color ?? '#08070c';
    layer.dataset.bg = id;
  }

  private toneOf(id: BgId): BgTone {
    return this.resolver.bgTone?.(id) ?? toneOfBg(id);
  }

  /** 배경이 화면에 나타난 순간: 톤·레터박스·빛망울을 맞춘다. 그림 없는 검은 화면은 앞 톤을 유지한다(암전 중 창 색 깜빡임 방지) */
  private shown(id: BgId) {
    if (this.resolver.bgUrl(id)) this.tone = this.toneOf(id);
    this.el.dataset.tone = this.tone;
    this.renderMotes();
    this.onBackdrop(this.resolver.bgUrl(id), this.resolver.bgColor(id), this.tone);
  }

  /**
   * 같은 묶음의 그림 해독 목록(없으면 새로 연다). 동기 흐름이 끝나면(마이크로태스크) 닫힌다. 배경 요청은 닫힌 뒤에
   * 목록을 읽으므로 대본에서 show 가 bg 보다 앞에 와도 같은 묶음이면 함께 기다린다.
   */
  private batchDecodes(): Promise<unknown>[] {
    if (!this.batch) {
      const b: Promise<unknown>[] = [];
      this.batch = b;
      queueMicrotask(() => {
        if (this.batch === b) this.batch = null;
      });
    }
    return this.batch;
  }

  /**
   * 배경 요청 공통: 그림 해독이 끝난 뒤 apply(덜 받은 그림을 붙이지 않는다. 그동안은 이전 배경이 그대로 보인다).
   * 같은 묶음의 인물 그림이 아직이면 그 해독까지 기다렸다가 함께 붙는다(장면이 섞여 보이지 않게).
   * BG_HOLD_MAX_MS 가 지나도 아직이면 받는 중인 그대로 붙인다(앞 장면에 무대가 고정되지 않게).
   * 그사이 새 요청이 오면 버린다. 배경이 바뀌면 이전 장소 표시는 걷는다(같은 묶음의 place 가 뒤따르면 다시 뜬다).
   */
  private requestBg(id: BgId, apply: () => void) {
    const token = ++this.bgToken;
    if (id !== this.bgId) this.hidePlace();
    this.bgId = id;
    const url = this.resolver.bgUrl(id);
    const run = () => {
      if (token !== this.bgToken || this.bgPending !== run) return;
      this.bgPending = null;
      this.clearBgHold();
      apply();
      // 새 배경이 붙은 지금: 미뤄 둔 장소 표시를 띄우고, 미뤄 둔 인물 교체(whenBgShown)를 풀어 크로스페이드와 함께 바뀌게
      const place = this.placeQueued;
      this.placeQueued = null;
      if (place !== null) this.renderPlace(place);
      const shown = this.bgShown;
      this.bgShown = null;
      shown?.resolve();
    };
    this.bgPending = run;
    this.clearBgHold();
    this.bgHoldTimer = setTimeout(() => {
      this.bgHoldTimer = null;
      if (token === this.bgToken) this.flushBg();
    }, BG_HOLD_MAX_MS);
    const own: Promise<unknown> = url ? decodeOnce(url) : Promise.resolve();
    // 기다리다 포기한 적이 있는 그림(아직 받는 중)이면 대사(ready)는 다시 기다리지 않는다. 무대는 해독(또는 상한) 뒤에 붙인다
    const given = !!url && this.givenUp.has(url);
    const batch = this.batchDecodes();
    // 이 배경을 기다리던 ready() 가 시간 초과·누름으로 끝나면(대사가 먼저 그려짐) 같은 묶음 인물은 더 기다리지 않고
    // 배경 자신의 해독만 기다린다(누른 뒤에는 그림이 준비되는 대로 붙는다)
    let release!: () => void;
    const released = new Promise<void>((r) => (release = r));
    void Promise.resolve()
      .then(() => Promise.race([Promise.all([own, ...batch]), released.then(() => own)]))
      .then(run, run);
    // ready() 는 이 배경이 실제로 붙을 때까지 기다린다(같은 묶음 인물 그림 포함, 최대 BG_HOLD_MAX_MS)
    const shown = this.whenBgShown()!;
    this.fresh.set('bg', { promise: given ? Promise.resolve() : shown, urls: url && !given ? [url] : [], giveUp: release });
  }

  private clearBgHold() {
    if (this.bgHoldTimer) clearTimeout(this.bgHoldTimer);
    this.bgHoldTimer = null;
  }

  /** 해독을 기다리는 배경을 지금 붙인다(암전 막을 걷는데 아직 받는 중이면, 앞 장면 배경보다 받는 중인 새 배경이 낫다) */
  private flushBg() {
    this.bgPending?.();
  }

  /**
   * 대기 중인 배경이 화면에 붙을 때까지(없으면 null). 새 장면 인물이 앞 장면 배경 위에 먼저 붙지 않게
   * showChar·hideChar 가 이것을 기다린다. 해독이 끝나거나, 막을 걷으며·BG_HOLD_MAX_MS 가 지나 flushBg 로 붙이면 풀린다.
   */
  private whenBgShown(): Promise<void> | null {
    if (!this.bgPending) return null;
    if (!this.bgShown) {
      let resolve!: () => void;
      const promise = new Promise<void>((r) => (resolve = r));
      this.bgShown = { promise, resolve };
    }
    return this.bgShown.promise;
  }

  /**
   * 두 배경 레이어 중 layer 를 위로(문서 순서로 인물 레이어 바로 앞). z-index 를 쓰면 인물보다 위에 그려지므로
   * 순서만 바꾼다.
   */
  private raiseBg(layer: HTMLElement) {
    if (layer.nextElementSibling !== this.charsEl) this.el.insertBefore(layer, this.charsEl);
  }

  /**
   * 숨기기 안내 알약과 장소 표시 알약을 둘 곳. null 이면 무대 안(기본). 세로 배치(below)는 무대가 낮아(390×844 에서
   * 약 220px) 알약이 인물을 가리므로 게임 루트(#vn)로 옮긴다(무대는 contain: paint 라 무대 밖으로는 못 나간다).
   * 숨기기 안내는 비어 있는 대사창 자리에, 장소 표시는 무대 바로 위 빈 곳에 띄운다(styles/play.css).
   */
  placeHintIn(host: HTMLElement | null): void {
    const target = host ?? this.el;
    if (this.hideHint.parentElement !== target) target.append(this.hideHint);
    if (this.placeChip.parentElement !== target) {
      // 무대 안에서는 원래 자리(선택지 베일 뒤, 날짜 카드 앞)로 되돌린다
      if (!host) this.el.insertBefore(this.placeChip, this.cardEl);
      else if (host === this.el.parentElement) this.el.after(this.placeChip);
      else host.append(this.placeChip);
    }
  }

  currentBg(): string | undefined {
    return this.bgId;
  }

  /** 테스트·디버그용: 해독 캐시(모든 무대가 함께 쓰는 decodeCache) 보관 상태와 기다리다 포기한 그림 수 */
  decodeStats() {
    return { ...decodeCache.stats, givenUp: this.givenUp.size };
  }

  /** 지금 톤(배경이 실제로 바뀐 뒤의 값) */
  currentTone(): BgTone {
    return this.tone;
  }

  setBgInstant(id: BgId): void {
    this.requestBg(id, () => {
      if (this.bgFadeTimer) clearTimeout(this.bgFadeTimer);
      this.bgFadeTimer = null;
      const front = this.bgLayers[this.activeBg];
      const back = this.bgLayers[1 - this.activeBg];
      this.paintBg(front, id);
      this.raiseBg(front);
      withoutTransition([front, back], () => {
        front.classList.add('on');
        back.classList.remove('on');
      });
      this.shown(id);
    });
  }

  /** 크로스페이드(새 그림을 해독한 뒤 시작) */
  fadeBg(id: BgId): void {
    if (this.bgId === id) return;
    this.requestBg(id, () => {
      if (this.bgFadeTimer) clearTimeout(this.bgFadeTimer);
      const next = this.bgLayers[1 - this.activeBg];
      const prev = this.bgLayers[this.activeBg];
      // 앞선 크로스페이드가 끝나기 전이면 뒤 레이어가 아직 보이는 상태일 수 있다: 투명에서 다시 시작
      withoutTransition([next], () => next.classList.remove('on'));
      this.paintBg(next, id);
      this.raiseBg(next);
      void next.offsetWidth;
      next.classList.add('on');
      this.activeBg = 1 - this.activeBg;
      this.shown(id);
      this.bgFadeTimer = setTimeout(() => {
        this.bgFadeTimer = null;
        if (this.bgLayers[this.activeBg] === next) prev.classList.remove('on');
      }, DUR.fade + 50);
    });
  }

  async veilIn(kind: Exclude<BgFx, 'fade' | 'cut'>): Promise<void> {
    this.veil.className = `veil ${kind}`;
    void this.veil.offsetWidth;
    this.veil.classList.add('on');
    await this.wait(DUR.veil);
  }

  /**
   * 막 뒤에서 바꾼 무대(배경·인물·CG)가 해독될 때까지 기다렸다가 걷는다(최대 8초, 1.2초가 넘으면 '불러오는 중',
   * 누르면 hurry 로 바로). 그때까지 배경이 덜 받아졌으면 받는 중인 새 배경을 붙이고 걷는다.
   * 기다리는 사이 무대를 새로 그렸으면(불러오기·타이틀: 세대가 바뀜) 아무것도 하지 않고 끝낸다. 그때 bgPending 은
   * 불러온 장면의 배경이라, 여기서 flushBg 하면 그 배경이 해독 전에 붙고 미뤄 둔 인물 교체까지 함께 풀렸다.
   * gen: 막을 친 세대(flash 가 넘긴다. 없으면 지금)
   */
  async veilOut(gen = this.gen): Promise<void> {
    if (gen !== this.gen) return;
    await this.ready(VEIL_WAIT_MS);
    if (gen !== this.gen) return;
    this.flushBg();
    this.veil.classList.remove('on');
    await this.wait(DUR.veil);
  }

  /**
   * 아직 기다리지 않은 배경·인물·이벤트 CG 그림 요청(마지막 ready() 뒤의 요청 = 보통 이번 스텝이 바꾼 그림)이 모두
   * 붙을 준비가 될 때까지 기다린다. 최대 ms, hurry() 가 불리면 바로 끝난다.
   * 앞선 ready() 가 이미 기다린 요청은 다시 기다리지 않는다. 상한(8초)까지 기다렸거나 hurry 로 끝나면 그때 아직 해독 전이던
   * 그림은 '포기함'으로 두어, 같은 그림을 다시 요청해도 기다리지 않는다(멈춘 그림 하나 때문에 뒤의 줄마다 8초씩 서지 않게).
   * 1.2초 넘게 걸리면 무대 가운데에 '그림을 불러오는 중…' 알약을 띄운다(끝나면 걷음).
   * 화면 팀용: 장면 진입·이어하기·CG 가 바뀌는 스텝에서 대사를 그리기 전에 await 하면 대사가 그림보다 먼저 나오지 않는다
   * (이 동안 transitioning 으로 두어 클릭이 hurry 가 되게). 다 준비됐으면 true, 시간 초과·hurry 면 false.
   */
  async ready(ms = READY_MAX_MS): Promise<boolean> {
    const waits = [...this.fresh.values()];
    this.fresh.clear();
    const gen = this.gen;
    let settled = false;
    const all = Promise.all(waits.map((w) => w.promise.catch(() => undefined))).then(() => {
      settled = true;
    });
    let shown = false;
    const timer = setTimeout(() => {
      if (settled) return;
      shown = true;
      this.setLoading(+1);
    }, DECODE_MAX_MS);
    const why = await this.waitFor(all, ms);
    clearTimeout(timer);
    if (shown) this.setLoading(-1);
    // 포기는 누름(hurry)이나 상한(READY_MAX_MS 이상)까지 기다린 시간 초과만. 짧게 잡은 기다림(화면 팀의 표정 줄 등)이
    // 끝난 것은 포기가 아니다(뒤에 그 그림이 새로 등장하는 줄은 끝까지 기다린다). 불러오기·타이틀 이동이 끝낸 기다림
    // (세대가 바뀜)도 사용자가 그림을 포기한 것이 아니므로 표시하지 않는다
    if (!settled && gen === this.gen && (why === 'hurry' || ms >= READY_MAX_MS)) {
      for (const w of waits) {
        for (const u of w.urls) {
          if (decodeSettled(u) || this.givenUp.has(u)) continue;
          this.givenUp.add(u);
          // 같은 해독(진행 중이면 그 약속)이 끝나면 포기 표시를 지운다
          void decodeOnce(u).then(() => this.givenUp.delete(u));
        }
        w.giveUp?.();
      }
    }
    return settled;
  }

  private setLoading(delta: number) {
    this.loadingWaits = Math.max(0, this.loadingWaits + delta);
    const pill = this.loadingEl;
    if (this.loadingWaits > 0) {
      if (this.loadingOffTimer) clearTimeout(this.loadingOffTimer);
      this.loadingOffTimer = null;
      if (!pill.classList.contains('on')) {
        this.loadingOnAt = now();
        pill.classList.add('on');
      }
      return;
    }
    if (!pill.classList.contains('on') || this.loadingOffTimer) return;
    // 켜진 지 얼마 안 됐으면 LOADING_MIN_MS 까지 두었다가 걷는다
    const left = LOADING_MIN_MS - (now() - this.loadingOnAt);
    if (left <= 0) {
      pill.classList.remove('on');
      return;
    }
    this.loadingOffTimer = setTimeout(() => {
      this.loadingOffTimer = null;
      if (this.loadingWaits === 0) pill.classList.remove('on');
    }, left);
  }

  clearVeilInstant(): void {
    this.gen++;
    withoutTransition([this.veil], () => this.veil.classList.remove('on'));
  }

  // =========================================================================
  // 캐릭터
  // =========================================================================

  showChar(char: CharId, s: CharState, animate: boolean): void {
    const url = this.resolver.spriteUrl(char, s);
    let img = this.chars.get(char);
    if (!img) {
      const n = document.createElement('img');
      n.className = 'char entering';
      n.alt = '';
      n.setAttribute('aria-label', this.resolver.charLabel(char));
      n.addEventListener('error', () => (n.style.visibility = 'hidden'));
      n.addEventListener('load', () => (n.style.visibility = ''));
      n.draggable = false;
      n.decoding = 'async';
      this.chars.set(char, n);
      this.charsEl.append(n);
      img = n;
    }
    const target = img;
    target.classList.remove('leaving');

    const token = (this.charTokens.get(char) ?? 0) + 1;
    this.charTokens.set(char, token);
    const started = now();
    const apply = () => {
      if (this.charTokens.get(char) !== token || this.chars.get(char) !== target) return;
      this.charReady.delete(char);
      // 자리·표정 표식도 그림과 함께 바꾼다(새 배경을 기다리는 동안 앞 장면 배경 위에서 자리를 옮기지 않게)
      target.dataset.expr = s.expr;
      target.dataset.look = `${s.outfit}_${s.hair}`;
      for (const p of ['left', 'center', 'right'] as const) target.classList.toggle(`pos-${p}`, s.pos === p);
      if (url && target.getAttribute('src') !== url) target.src = url;
      // 연출 없이 그리라는 등장(불러오기·건너뛰기)이라도 그림이 늦게 준비됐으면 툭 튀어나오지 않게 페이드로
      if (target.classList.contains('entering')) this.revealChar(target, animate || now() - started > LATE_MS);
    };
    // 같은 그림이면 바로, 새 그림(표정·옷 교체 포함)은 해독이 끝난 뒤에만 바꿔 끼운다. 그때까지 새 인물은 .entering
    // 으로 숨기고, 이미 보이는 인물은 이전 그림을 유지한다(느린 네트워크에서 위쪽만 그려진 그림이 뜨지 않게).
    // 새 배경이 아직 해독 중이면(같은 묶음의 장면 전환) 그 배경이 붙을 때까지 더 기다린다: 새 장면 인물이
    // 앞 장면 배경 위에 먼저 붙지 않고 배경 크로스페이드와 같은 순간에 바뀐다. 배경 여부는 그림 해독이 끝난
    // 시점에 본다(대본에서 show 가 bg 보다 앞에 와도 같은 묶음이면 기다린다).
    // ready() 쪽 기다림은 이 그림의 해독뿐이다. 같은 묶음의 새 배경은 배경 요청이 따로 기다리고(fresh 'bg'),
    // 앞 줄에서 이미 기다렸거나 포기한 배경은 다시 기다리지 않는다(그림은 배경이 붙을 때 함께 바뀐다)
    const key = `char:${char}`;
    const same = !url || target.getAttribute('src') === url;
    if (same && !this.bgPending) {
      this.charReady.delete(char);
      this.fresh.delete(key);
      apply();
      return;
    }
    const decoded: Promise<unknown> = same ? Promise.resolve() : decodeOnce(url!);
    // 기다리다 포기한 적이 있는 그림(아직 받는 중)은 대사·같은 묶음 배경이 다시 기다리지 않는다(받는 대로 붙는다)
    const waitDecode = !same && !this.givenUp.has(url!);
    if (waitDecode) this.batchDecodes().push(decoded);
    this.charReady.set(char, decoded.then(() => this.whenBgShown()).then(apply));
    this.fresh.set(key, { promise: waitDecode ? decoded : Promise.resolve(), urls: waitDecode ? [url!] : [] });
  }

  private revealChar(img: CharImg, animate: boolean) {
    if (!animate) {
      withoutTransition([img], () => img.classList.remove('entering'));
      return;
    }
    void img.offsetWidth;
    requestAnimationFrame(() => img.classList.remove('entering'));
  }

  hideChar(char: CharId, animate: boolean): void {
    const img = this.chars.get(char);
    if (!img) return;
    this.chars.delete(char);
    this.charTokens.delete(char);
    this.charReady.delete(char);
    this.fresh.delete(`char:${char}`);
    const gen = this.gen;
    const leave = () => {
      // 기다리는 사이 무대를 새로 그렸으면(불러오기·타이틀) 불러온 배경 위에서 페이드하지 않고 그 배경과 함께 바로 뺀다
      if (!animate || gen !== this.gen) {
        img.remove();
        return;
      }
      img.classList.add('leaving');
      setTimeout(() => img.remove(), DUR.char + 50);
    };
    // 장면 전환(hide → bg → show)에서 새 배경이 아직 해독 중이면, 앞 장면 인물은 앞 배경과 함께 그대로 두었다가
    // 새 배경이 붙을 때 내보낸다(그동안 화면은 앞 장면 그대로 + '불러오는 중'). 대본은 hide 를 bg 보다 먼저 쓰므로
    // 같은 묶음의 배경 요청을 볼 수 있게 한 박자(마이크로태스크) 뒤에 판단한다. 화면이 그려지기 전이라 깜빡임은 없다.
    void Promise.resolve()
      .then(() => this.whenBgShown())
      .then(leave);
  }

  /** 두 명 이상일 때 말하지 않는 히로인을 살짝 바래게 */
  setSpeaker(char: CharId | null): void {
    const multi = this.chars.size > 1;
    for (const [c, img] of this.chars) img.classList.toggle('dim', multi && char !== null && c !== char);
  }

  /**
   * 무대 인물의 스크린리더 이름을 바꾼다. 이름을 밝히기 전 익명 이름표('여학생')로 말하는 동안
   * 그림의 aria-label 이 실제 이름을 먼저 읽어 주지 않게 한다(label 이 null 이면 원래 이름).
   */
  setCharLabel(char: CharId, label: string | null): void {
    this.chars.get(char)?.setAttribute('aria-label', label ?? this.resolver.charLabel(char));
  }

  renderSnapshot(stage: StageState): void {
    this.gen++;
    this.setBgInstant(stage.bg);
    for (const c of [...this.chars.keys()]) if (!stage.chars[c]) this.hideChar(c, false);
    for (const c of stage.order) {
      const s = stage.chars[c];
      if (s) this.showChar(c, s, false);
    }
    // 겹침 순서
    for (const c of stage.order) {
      const img = this.chars.get(c);
      if (img) this.charsEl.append(img);
    }
    this.showCg(stage.cg ?? null, false);
    this.clearVeilInstant();
    this.hideCard(false);
    this.hidePlace();
  }

  clearAll(): void {
    this.gen++;
    for (const c of [...this.chars.keys()]) this.hideChar(c, false);
    this.showCg(null, false);
    this.setBgInstant('black');
    this.hideCard(false);
    this.hidePlace();
    this.clearVeilInstant();
  }

  shake(): void {
    this.el.classList.remove('shake');
    void this.el.offsetWidth;
    this.el.classList.add('shake');
    setTimeout(() => this.el.classList.remove('shake'), 500);
  }

  /** 번쩍임. 흰 막을 치는 사이 무대를 새로 그렸으면(불러오기·타이틀) 새 무대를 기다리거나 막을 걷지 않고 끝낸다 */
  async flash(): Promise<void> {
    const gen = this.gen;
    await this.veilIn('white');
    await this.veilOut(gen);
  }

  // =========================================================================
  // 이벤트 CG
  // =========================================================================

  private cgUrlOf(id: CgId): string | null {
    if (this.resolver.cgUrl) return this.resolver.cgUrl(id);
    const src = (CGS as Record<string, { src: string } | undefined>)[id]?.src;
    return src ? absoluteUrl(src) : null;
  }

  /**
   * 이벤트 CG 를 무대 가득(캐릭터 앞, 대사창 뒤) 보여 주거나(null 이면) 걷는다. 그림 해독이 끝난 뒤에만 켠다(0.55s 페이드).
   * 해독 전에는 무대(배경·인물)를 그대로 두고, 그림 파일이 없거나 깨졌으면 끝내 켜지 않는다(덜 받은 그림·단색 화면 방지).
   * 켜져 있는 동안 무대에 data-cg(=id)를 단다(대사창·빠른 메뉴 유리를 옅게, 낮은 화면의 CG 별 구도).
   */
  showCg(id: CgId | null, animate: boolean): void {
    if (id === this.cgId) return;
    this.cgId = id;
    const token = ++this.cgToken;
    const layer = this.cgLayer;
    const set = (on: boolean, fade = animate) => {
      if (on && id) this.el.dataset.cg = id;
      else delete this.el.dataset.cg;
      // 예열(.prime, 거의 투명)에서 켜면 그 불투명도(0.004)에서 페이드가 이어진다
      if (fade) {
        void layer.offsetWidth;
        layer.classList.toggle('on', on);
        layer.classList.remove('prime');
      } else
        withoutTransition([layer], () => {
          layer.classList.toggle('on', on);
          layer.classList.remove('prime');
        });
    };
    if (!id) {
      this.cgReady = Promise.resolve();
      this.fresh.delete('cg');
      set(false);
      delete layer.dataset.cg;
      return;
    }
    const url = this.cgUrlOf(id);
    if (!url) {
      this.cgReady = Promise.resolve();
      this.fresh.delete('cg');
      set(false);
      return;
    }
    const started = now();
    // 같은 묶음의 새 배경은 CG 를 기다리지 않는다(CG 는 무대 위를 덮으며 따로 페이드로 켜진다. 큰 그림 하나 때문에
    // 배경·인물 교체까지 상한만큼 서 있지 않게)
    const decoded = decodeOnce(url);
    // 기다리다 포기한 적이 있는 그림(아직 받는 중)은 대사가 다시 기다리지 않는다(받는 대로 켠다)
    const waitDecode = !this.givenUp.has(url);
    this.cgReady = decoded.then(async (ok) => {
      if (token !== this.cgToken) return;
      if (!ok) {
        set(false);
        return;
      }
      // 늦음 판정은 해독이 끝난 지금 한다(예열에 드는 시간은 넣지 않는다)
      const fade = animate || now() - started > LATE_MS;
      this.paintCg(url);
      layer.dataset.cg = id;
      // 예열: 꺼져 있던 레이어를 페이드로 켤 때는 먼저 거의 투명하게(0.004) 두 프레임 그려, 페이드를 시작하기 전에 그림을 래스터해 둔다.
      // 투명도 0 에서 바로 페이드를 시작하면 브라우저가 그 레이어의 래스터를 기다리지 않고 애니메이션을 돌려,
      // 그림 래스터가 느린 환경(GPU 없는 소프트웨어 래스터: 1920×1080 한 장에 0.3~1.1초)에서는 페이드 시간이
      // 빈 레이어로 지나가고 그림이 중간에 툭 튀어나왔다. 이 약속(cgReady)이 풀린 뒤 대사를 그리므로 대사도 페이드와 함께 나온다.
      // 연출 없이 켜는 CG(불러오기·건너뛰기, 늦지 않음)는 예열 없이 이 자리에서 켠다: 애니메이션이 없으니 래스터가 끝난
      // 프레임부터 보이고, 예열하면 그 두 프레임(느린 래스터에서 약 0.24초) 동안 CG 없는 배경만 보이다가 늦음 판정으로 페이드했다.
      if (fade && !layer.classList.contains('on')) {
        layer.classList.add('prime');
        await afterFrames(2, PRIME_MAX_MS);
        if (token !== this.cgToken) return;
      }
      // 연출 없이 켜라는 CG(불러오기·건너뛰기)라도 늦게 준비됐으면 페이드로
      set(true, fade);
    });
    this.fresh.set('cg', { promise: waitDecode ? this.cgReady : Promise.resolve(), urls: waitDecode ? [url] : [] });
  }

  /**
   * CG 그림을 레이어에 붙인다. 해독(decodeOnce)에 쓴 <img> 를 그대로 붙인다(명세상 decode() 가 끝난 그 요소를
   * 붙이면 다음 프레임에 해독 지연 없이 그려진다. CSS background-image 는 그 보장이 없다). decoding='sync' 라
   * 레이어가 보이는 동안(예열·CG 교체)에는 래스터가 끝난 프레임부터 보인다(빈 레이어·앞 그림이 잠깐 비는 일 없음).
   * 구도는 object-fit: cover, 낮은 화면의 CG 별 확대는 styles/play.css 의 transform 이 맡는다.
   */
  private paintCg(url: string) {
    const layer = this.cgLayer;
    let img = decodedImage(url);
    if (!img) {
      img = new Image();
      img.src = url;
    }
    img.className = 'cg-img';
    img.alt = '';
    img.draggable = false;
    // 이미 해독한 그림이라 동기 해독에 드는 비용이 없다: 래스터가 그림을 빼고 먼저 그리지 않게
    img.decoding = 'sync';
    if (layer.firstElementChild !== img || layer.childElementCount !== 1) layer.replaceChildren(img);
  }

  /** 지금 보이는(또는 해독 중인) 이벤트 CG */
  currentCg(): CgId | null {
    return this.cgId;
  }

  // =========================================================================
  // 빛망울
  // =========================================================================

  /** 설정 '빛망울 효과'. 끄면 빛망울을 비운다(화면 팀이 설정을 읽어 부른다) */
  setParticles(on: boolean): void {
    this.particles = on;
    this.el.dataset.particles = on ? '1' : '0';
    this.renderMotes();
  }

  /** 대사 화면이면 위쪽에 옅게 9개, 날짜 카드면 카드 안에 16개. 톤에 맞춘 색(카드 동안은 카드 톤) */
  private renderMotes() {
    const card = this.cardEl.classList.contains('on');
    const tone = card ? this.cardTone : this.tone;
    const key = `${card ? 'card' : 'play'}:${tone}:${this.particles ? 1 : 0}`;
    if (key === this.motesKey) return;
    this.motesKey = key;
    // 카드 동안은 카드 안(흐린 배경 위, 일력 아래)으로 옮긴다
    if (card) this.cardEl.insertBefore(this.motes, this.cardEl.children[1] ?? null);
    else if (this.motes.parentElement !== this.el) this.el.insertBefore(this.motes, this.cgLayer);
    this.motes.dataset.kind = card ? 'card' : 'play';
    if (!this.particles) {
      this.motes.replaceChildren();
      return;
    }
    fillMotes(this.motes, card ? MOTE_COUNT.card : MOTE_COUNT.play, {
      night: tone === 'night',
      evening: tone === 'evening',
      soft: !card,
      seed: card ? 7 : 11,
    });
  }

  // =========================================================================
  // 장소 표시
  // =========================================================================

  /**
   * '7월 10일 금요일 · 방과 후 교실' 처럼 ' · ' 가 있으면 앞부분(날짜·때)과 장소를 구분선으로 나눈다.
   * 새 배경이 아직 해독 중이면(장면 전환) 글만 맡아 두었다가 배경이 실제로 붙을 때 띄운다(앞 장면 배경 위에
   * 새 장소가 먼저 뜨고, 그림을 기다리는 사이 3.2초가 지나 대사가 나올 때는 이미 사라지던 결함).
   */
  showPlace(text: string): void {
    if (this.bgPending) {
      this.hidePlace();
      this.placeQueued = text;
      return;
    }
    this.renderPlace(text);
  }

  private renderPlace(text: string): void {
    const ico = el('span', 'ico');
    ico.setAttribute('aria-hidden', 'true');
    // 비 오는 배경이면 날짜 카드와 같은 비 아이콘(해·달은 톤 CSS 가 고른다)
    if (this.bgId && weatherOf(this.bgId, toneOfBg(this.bgId)) === 'rain') ico.dataset.wx = 'rain';
    const cut = text.indexOf(' · ');
    if (cut > 0) {
      // 구분선은 1px 막대로 그리고, 글자로 읽을 때는 ' · ' 가 그대로 남게 숨긴 글자를 넣는다
      const sep = el('span', 'sep');
      sep.append(el('span', 'sr-only', ' · '));
      this.placeChip.replaceChildren(ico, el('span', 'pc-when', text.slice(0, cut)), sep, el('span', 'pc-where', text.slice(cut + 3)));
    } else this.placeChip.replaceChildren(ico, el('span', 'pc-where', text));
    // 다시 나타날 때 들어오는 연출을 처음부터
    this.placeChip.classList.remove('on');
    void this.placeChip.offsetWidth;
    this.placeChip.classList.add('on');
    if (this.placeTimer) clearTimeout(this.placeTimer);
    this.placeTimer = null;
    // 3.2초는 같은 묶음의 인물·CG 그림이 붙은 뒤부터 센다(화면 팀은 그 그림을 기다려 대사를 그린다. 최대 READY_MAX_MS).
    // 이미 받은 그림이면 마이크로태스크 안에 풀려 곧바로 센다
    const token = ++this.placeToken;
    let armed = false;
    const arm = () => {
      if (armed || token !== this.placeToken) return;
      armed = true;
      clearTimeout(cap);
      this.placeTimer = setTimeout(() => this.hidePlace(), PLACE_MS);
    };
    const cap = setTimeout(arm, READY_MAX_MS);
    void Promise.all([this.cgReady, ...this.charReady.values()]).then(arm, arm);
  }

  hidePlace(): void {
    this.placeToken++;
    this.placeQueued = null;
    this.placeChip.classList.remove('on');
    if (this.placeTimer) clearTimeout(this.placeTimer);
    this.placeTimer = null;
  }

  // =========================================================================
  // 날짜 카드(일력)
  // =========================================================================

  /**
   * main 이 'M월 D일 X요일' 이면 달·날짜·요일로 나눠 일력 한 장으로 그리고, 아니면(.text-only) 문장 한 덩어리.
   * 주 차 배지와 월~금 점은 config.DATES(d1~d5 = 1주 차, r1~r5 = 2주 차)와 같은 날짜일 때만 붙인다.
   *
   * nextBg(선택): 카드 뒤에 깔릴 배경(bgAfterCard). 주면 카드의 흐린 배경·날씨 아이콘·톤(밤이면 남색 베일)을 그 배경으로 정한다.
   * 주지 않으면 지금 배경을 쓴다. 쓸 배경이 그림 없는 색(암전 black·white)이면 탁한 회색 대신 하늘(밤 톤이면 밤하늘)
   * 그라데이션을 깐다.
   */
  showCard(main: string, sub: string | undefined, animate: boolean, nextBg?: BgId | null): void {
    const bgId = nextBg ?? this.bgId;
    const url = bgId ? this.resolver.bgUrl(bgId) : null;
    // 다음 배경이 그림이면 그 톤, 아니면(암전 등) 지금 톤을 잇는다
    const tone: BgTone = nextBg && url ? this.toneOf(nextBg) : this.tone;
    this.cardTone = tone;
    this.cardEl.dataset.tone = tone;
    const bg = el('div', url ? 'card-bg' : 'card-bg plain');
    // 사용자 정의 속성 안의 상대 url() 은 CSS 파일 기준으로 풀리므로(빌드는 base './') 문서 기준 절대 주소로 넣는다
    bg.style.setProperty('--bg', url ? `url("${absoluteUrl(url)}")` : 'none');
    const color = url && bgId ? this.resolver.bgColor(bgId) : null;
    if (color) bg.style.backgroundColor = color;

    const parts: HTMLElement[] = [bg];
    const date = DATE_RE.exec(main);
    const wk = date ? weekOf(main) : null;
    if (wk) parts.push(el('div', 'card-kicker', `${wk.week}주 차`));

    const cal = el('div', date ? 'cal' : 'cal text-only');
    const head = el('div', 'cal-head');
    // 날짜 형식이 아닌 카드('몇 주 뒤, 여름방학')는 부제의 날짜에서 달만 머리띠에 쓴다
    const subDate = DATE_PREFIX_RE.exec(sub ?? '');
    const month = date ? `${date[1]}월` : subDate ? `${subDate[1]}월` : '';
    const wx = el('span', 'ico');
    wx.dataset.wx = weatherOf(url ? bgId : undefined, tone);
    wx.setAttribute('aria-hidden', 'true');
    head.append(el('span', 'cal-month', month), wx);
    const body = el('div', 'cal-body');
    if (date) {
      const dow = el('div', 'cal-dow', `${date[3]}요일`);
      dow.dataset.dow = date[3];
      body.append(el('div', 'cal-day', date[2]), dow);
    } else body.append(el('div', 'cal-day', main));
    if (sub || wk) {
      // ──✦── 장식선. 무대가 낮아 주간 점 알약을 뺄 때(data-fit ≥ 2)는 별 대신 월~금 점이 이 선 가운데에 들어간다
      const line = el('div', 'cal-line');
      const star = el('span', 'ico');
      line.append(star);
      if (wk) line.append(weekDots('cal-dots', wk.day, false));
      line.setAttribute('aria-hidden', 'true');
      body.append(line);
    }
    if (sub) body.append(subLine(sub));
    cal.append(head, body);
    parts.push(cal);

    if (wk) parts.push(weekDots('week', wk.day, true));

    this.cardEl.replaceChildren(...parts);
    this.cardEl.classList.toggle('instant', !animate);
    if (animate) {
      void this.cardEl.offsetWidth;
      this.cardEl.classList.add('on');
    } else withoutTransition([this.cardEl], () => this.cardEl.classList.add('on'));
    this.motesKey = '';
    this.renderMotes();
    // 일력의 크기는 글자 크기 설정·글꼴 도착에 따라 바뀐다: 일력도 지켜본다
    this.cardFitObserver?.disconnect();
    this.cardFitObserver?.observe(this.cardEl);
    this.cardFitObserver?.observe(cal);
    this.fitCard();
  }

  private scheduleCardFit() {
    if (this.cardFitFrame || typeof requestAnimationFrame === 'undefined') return;
    this.cardFitFrame = requestAnimationFrame(() => {
      this.cardFitFrame = 0;
      this.fitCard();
    });
  }

  /**
   * 카드 묶음(주 차 알약·일력·주간 점)이 카드의 내용 상자(무대 높이 − 위 여백 − 아래 여백·빠른 메뉴 캡슐)에
   * 들어가는 가장 낮은 압축 단계를 고른다. 무대의 contain: paint 때문에 넘친 부분은 잘리고, 아래로 넘치면
   * 오른쪽 아래 빠른 메뉴 캡슐과 겹친다. 배치가 없으면(숨김·jsdom) 0 단계로 둔다.
   */
  private fitCard() {
    const card = this.cardEl;
    const cal = card.querySelector<HTMLElement>(':scope > .cal');
    if (!cal) return;
    const sub = cal.querySelector<HTMLElement>('.cal-sub');
    for (let fit = 0; fit <= CARD_FIT_MAX; fit++) {
      card.dataset.fit = String(fit);
      // 단계마다 글자 크기가 달라 부제 줄바꿈(구분점 감춤)도 다시 정한다
      fitSubLine(sub);
      const cs = getComputedStyle(card);
      const avail = card.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
      if (!(avail > 0)) {
        card.dataset.fit = '0';
        return;
      }
      const kids = [...card.children].filter(
        (k): k is HTMLElement => k instanceof HTMLElement && !k.classList.contains('card-bg') && !k.classList.contains('motes') && k.offsetHeight > 0,
      );
      const gap = parseFloat(cs.rowGap) || 0;
      // 빠른 메뉴 캡슐·무대 끝에 바짝 붙지 않게 숨 쉴 틈(fs × 1)을 남긴다
      const spare = (parseFloat(cs.getPropertyValue('--fs')) || 16) * CARD_SPARE_FS;
      const total = kids.reduce((s, k) => s + k.offsetHeight, 0) + gap * Math.max(0, kids.length - 1) + Math.ceil(cal.offsetWidth * CAL_TILT);
      if (total + spare <= avail || fit === CARD_FIT_MAX) return;
    }
  }

  hideCard(animate: boolean): void {
    if (!this.cardEl.classList.contains('on')) return;
    if (animate) this.cardEl.classList.remove('on');
    else withoutTransition([this.cardEl], () => this.cardEl.classList.remove('on'));
    this.renderMotes();
  }

  get cardVisible(): boolean {
    return this.cardEl.classList.contains('on');
  }
}

function withoutTransition(els: HTMLElement[], fn: () => void) {
  for (const e of els) e.style.transition = 'none';
  fn();
  for (const e of els) void e.offsetWidth;
  for (const e of els) e.style.transition = '';
}
