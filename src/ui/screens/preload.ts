/**
 * 그림 미리 불러오기(백그라운드)
 *
 * - 대기열은 두 단계다.
 *   가까운 묶음(near): 지금 위치에서 곧 쓸 그림. game.ts 가 스텝마다 '지금 위치에서의 거리' 순으로 다시 세운다.
 *     이 묶음을 받는 동안에는 다른 그림을 새로 시작하지 않는다(느린 망에서 곧 볼 CG·배경이 전체 대기열에 밀리지 않게).
 *   나머지(bulk): 지금·다음 장면의 나머지 그림(앞) → 게임 전체 그림(뒤). 가까운 묶음이 비었을 때만 받는다.
 *     가까운 묶음이 새로 들어오면 바로 시작할 수 있게, 나머지는 동시에 (최대 - 1)개까지만 받는다.
 * - 동시에 3개(데이터 절약 모드·2G/3G 로 보이는 연결은 2개)까지, fetchPriority 'low' 로 받는다.
 *   'low' 는 요청을 '시작하는 순서'에만 듣고, 이미 받는 중인 요청끼리 대역폭을 나누는 데에는 효과가 없다. 그래서
 *   지금 무대가 받는 그림(장면 진입·이어하기·새 CG)이 있으면 그 그림을 다 받을 때까지 새 요청을 시작하지 않는다(hold).
 *   붙잡는 시간은 그림마다 '처음 붙잡은 때부터' 센다(스텝마다 다시 붙잡아도 늘지 않는다). 무대에서 빠진 그림은 놓아 준다.
 * - 받는 데 FETCH_SLOT_MS 넘게 걸리는 미리 불러오기(멈춘 연결)는 자리만 비운다(요청은 그대로 두고, 다 받으면 받은 것으로 친다).
 * - 바로 몇 줄 뒤에 처음 쓰는 그림(plan 의 decode)은 받은 뒤 해독(decode)까지 해 둔다. 무대(stage.ts)는 처음 쓰는 그림을
 *   해독한 뒤에야 대사를 그리므로(present → stage.ready) 미리 해독해 두면 그 줄에서 해독을 기다리지 않는다. 브라우저의 해독
 *   캐시는 같은 주소의 새 Image 가 함께 쓴다(Chromium 에서 받기만 한 그림 20~100ms → 미리 해독한 그림 0~5ms, 20초·다른 그림
 *   30장 뒤에도 유지). 해독 캐시는 크기 상한이 있어(그림 한 장 해독본 약 8MB) 가까운 묶음 전부가 아니라 몇 줄 안의 그림만
 *   해독한다(먼저 해독한 급한 그림이 나중 그림에 밀려 지워지지 않게). 해독은 한 번에 하나씩.
 *   해독한 Image 는 최근 것 몇 개만 붙잡아 둔다(메모리 캐시에서 빠져 무대가 다시 받지 않게).
 * - 장면 그림은 대본(배경·등장·표정 변화·CG)을 앞에서부터 훑어 계산한다. 조건 분기는 양쪽 다 받는다.
 *   아직 고르지 않은 선택지가 앞에 없으면 같은 장면 안의 goto(앞으로 가는 것)를 따라가, 고른 갈래 뒤에 놓인 다른 갈래의
 *   그림(가지 않을 갈래의 CG 등)을 받지 않는다. 선택지 뒤의 그림은 어느 갈래에서 쓰일지 모르므로 branch 로 표시한다.
 */
import type { CharId, CharState, StageState, Story } from '../../engine/types';

export interface PreloadResolver {
  bgUrl(id: string): string | null;
  spriteUrl(char: CharId, s: CharState): string | null;
  cgUrl?(id: string): string | null;
}

export type PreloadKind = 'bg' | 'cg' | 'sprite';

/** 장면 그림 하나: 주소·종류·처음 쓰이는 곳까지의 블로킹 스텝(대사·카드·선택지) 수 */
export interface PreloadItem {
  url: string;
  kind: PreloadKind;
  at: number;
  /** 아직 고르지 않은 선택지 뒤에서 처음 쓰인다(고르는 갈래에 따라 쓰이지 않을 수 있다) */
  branch?: boolean;
}

/** 붙잡은 무대 그림 하나 */
interface HeldImage {
  /** 다 받았는지 지켜보는 Image */
  img: HTMLImageElement;
  /** 처음 붙잡은 시각(performance.now) */
  since: number;
  /** 마감 시각: 처음 붙잡은 시각 + 그 그림을 붙잡은 hold 들의 ms 중 가장 긴 것 */
  until: number;
  /** 마감에 걸리면 다시 붙잡지 않는다(gaveUp) */
  giveUp: boolean;
}

interface NetworkInfo {
  saveData?: boolean;
  effectiveType?: string;
}

function connection(): NetworkInfo | null {
  try {
    return (globalThis.navigator as (Navigator & { connection?: NetworkInfo }) | undefined)?.connection ?? null;
  } catch {
    return null;
  }
}

/** 사용자가 데이터 절약 모드를 켰다(게임 전체 그림을 미리 받지 않는다) */
export function prefersDataSaving(): boolean {
  return connection()?.saveData === true;
}

/** 동시에 받을 그림 수: 데이터 절약 모드이거나 느린 연결(slow-2g·2g·3g)이면 2, 아니면 3 */
export function preloadConcurrency(): number {
  const c = connection();
  if (c?.saveData) return 2;
  return /^(slow-2g|2g|3g)$/.test(c?.effectiveType ?? '') ? 2 : 3;
}

/**
 * 무대 그림 하나를 붙잡는 최대 시간(처음 붙잡은 때부터. 그 뒤에는 미리 불러오기를 다시 시작하고, 같은 그림으로 다시 붙잡지 않는다).
 * 스텝마다 다시 붙잡아도 늘지 않는다(멈춘 요청 하나가 있어도 한 줄씩 넘기는 동안 미리 불러오기가 끝없이 멈추지 않게).
 */
export const HOLD_MAX_MS = 20000;
/**
 * 미리 불러오기 한 장이 자리(동시 받기 수)를 차지하는 최대 시간. 넘으면 자리만 비운다(요청은 그대로 두고, 늦게라도 다 받으면
 * 받은 것으로 친다. 다시 요청하지 않음). 응답 없이 멈춘 가까운 묶음 요청 하나가 나머지 대기열을 영영 막지 않게.
 * 느린 망(2G 수준)에서 큰 CG 한 장이 정상적으로 이만큼 걸릴 수 있어 넉넉히 잡는다(그래도 그 요청은 끊지 않는다).
 */
const FETCH_SLOT_MS = 30000;
/** 미리 해독한 Image 를 붙잡아 두는 수(최근 것부터) */
const HOT_MAX = 8;

export class ImagePreloader {
  /** 가까운 묶음(이 순서대로) */
  private near: string[] = [];
  /** 나머지(이 순서대로) */
  private bulk: string[] = [];
  /** 받기 시작했거나 다 받은 그림 */
  private started = new Set<string>();
  /** 다 받은(또는 받지 못한) 그림. 무대 그림 기다리기(hold)와 미리 해독이 본다 */
  private settled = new Set<string>();
  private activeNear = 0;
  private activeBulk = 0;
  private readonly max: number;
  /** 무대가 받는 중이라 다 받을 때까지 새 요청을 미루는 그림(주소 → 지켜보는 Image·마감) */
  private holding = new Map<string, HeldImage>();
  /** 기다리다 상한에 걸린 그림(다시 붙잡지 않는다) */
  private gaveUp = new Set<string>();
  private holdTimer: ReturnType<typeof setTimeout> | null = null;
  /** holdTimer 가 울릴 시각(가장 이른 마감) */
  private holdTimerAt = 0;
  /** 붙잡은 그림이 있는 상태인지(다 풀리는 순간 미리 불러오기를 잇는다) */
  private holdActive = false;
  /** hold 가 돌려준 약속: 그 호출의 그림이 모두 붙잡힘에서 빠지면(받음·상한·놓아 줌) 부른다 */
  private holdWaiters: Array<{ urls: string[]; resolve: () => void }> = [];
  /** pauseUntil 로 멈춘 수(0 보다 크면 새 받기·해독을 시작하지 않는다) */
  private paused = 0;
  /** 받는 대로 해독할 그림(plan 의 decode) */
  private wantDecode = new Set<string>();
  /** 해독 차례를 기다리는 그림(이미 받은 것) */
  private decodeQueue: string[] = [];
  /** 해독을 시작한 그림 */
  private decodeStarted = new Set<string>();
  private decoding = 0;
  /** 해독한 Image(넣은 순서 = 오래된 것부터) */
  private hot = new Map<string, HTMLImageElement>();
  private readonly canDecode: boolean;

  constructor(max = preloadConcurrency()) {
    this.max = Math.max(1, Math.floor(max));
    this.canDecode = typeof HTMLImageElement !== 'undefined' && typeof HTMLImageElement.prototype.decode === 'function';
  }

  /** 나머지 대기열에 넣는다. front 면 아직 시작하지 않은 나머지 그림보다 앞에(주어진 순서대로) */
  add(urls: Iterable<string>, front = false): void {
    const fresh: string[] = [];
    const queued = new Set([...this.near, ...this.bulk]);
    for (const u of urls) {
      if (!u || this.started.has(u) || fresh.includes(u)) continue;
      if (queued.has(u)) {
        // 이미 대기 중이면(가까운 묶음에 있으면 그대로) front 일 때만 앞으로 당긴다
        if (!front || this.near.includes(u)) continue;
        this.bulk.splice(this.bulk.indexOf(u), 1);
      }
      fresh.push(u);
    }
    if (front) this.bulk.unshift(...fresh);
    else this.bulk.push(...fresh);
    this.pump();
  }

  /**
   * 대기열을 지금 위치 기준으로 다시 세운다. near: 가까운 묶음(바로 받는다), soon: 곧 쓸 그림(나머지 맨 앞).
   * 둘 다 주어진 순서(급한 것부터)대로. 앞서 가까운 묶음이었다가 빠진 그림은 soon 바로 뒤로 옮긴다.
   * decode: 받은 뒤 해독까지 해 둘 그림(급한 것부터. 이미 받은 그림 — 나머지로 먼저 받은 것 포함 — 은 해독만 한다).
   */
  plan(near: Iterable<string>, soon: Iterable<string> = [], decode: Iterable<string> = []): void {
    const picked = new Set<string>();
    const take = (urls: Iterable<string>) => {
      const out: string[] = [];
      for (const u of urls) {
        if (!u || this.started.has(u) || picked.has(u)) continue;
        picked.add(u);
        out.push(u);
      }
      return out;
    };
    for (const u of decode) if (u) this.markDecode(u);
    const n = take(near);
    const s = take(soon);
    const leftover = this.near.filter((u) => !picked.has(u));
    const rest = this.bulk.filter((u) => !picked.has(u));
    this.near = n;
    this.bulk = [...s, ...leftover, ...rest];
    this.pump();
  }

  /**
   * 지금 무대가 쓰는 그림(urls)을 다 받을 때까지(그림마다 처음 붙잡은 때부터 최대 ms) 미리 불러오기의 새 요청(받기·해독)을
   * 시작하지 않는다. 이미 받은 그림이면 아무것도 붙잡지 않는다. 무대가 같은 주소를 받는 중이면 브라우저가 한 요청으로 합친다
   * (지켜보는 Image 가 따로 내려받지 않는다). 아직 아무도 받지 않는 주소면 지켜보는 Image 가 받기 시작한다
   * (타이틀에서 첫 화면 그림을 먼저 받을 때). 이미 받는 중인 미리 불러오기는 그대로 둔다.
   * - 이미 붙잡은 그림을 다시 붙잡아도 마감은 '처음 붙잡은 때 + ms' 를 넘지 않는다(present 가 스텝마다 부르므로, 늘리면
   *   멈춘 요청 하나에 상한이 '마지막 스텝부터 ms' 가 되어 미리 불러오기가 끝없이 멈췄다). 새 그림이 없으면 마감도 그대로다.
   * - only: urls 가 '지금 무대 그림 전부'다. 붙잡고 있던 그림 중 urls 에 없는 것(무대에서 걷힌 CG, 타이틀에서 붙잡은
   *   [이어하기] 위치 그림을 새 게임에서는 쓰지 않을 때 등)은 놓아 준다(지켜보는 Image 만 받던 것이면 받기를 거둔다).
   * - giveUp: 마감에 걸린 그림을 다시 붙잡지 않는다(기본). false 면 마감에 걸려도 다음 hold 에서 다시 붙잡는다
   *   (타이틀의 첫 화면 기다림 상한은 '글꼴·나머지 미리 불러오기를 시작할 때'일 뿐, 그 화면에 들어가면 다시 붙잡는다).
   * 돌려주는 약속은 이 호출의 그림이 모두 붙잡힘에서 빠지면(받음·마감·놓아 줌) 풀린다.
   */
  hold(urls: Iterable<string>, ms = HOLD_MAX_MS, opts: { only?: boolean; giveUp?: boolean } = {}): Promise<void> {
    if (typeof Image === 'undefined') return Promise.resolve();
    const giveUp = opts.giveUp ?? true;
    const now = performance.now();
    const mine: string[] = [];
    for (const u of urls) {
      if (!u || mine.includes(u)) continue;
      const held = this.holding.get(u);
      if (held) {
        // 다시 붙잡음: 마감은 처음 붙잡은 때 기준(더 긴 ms 를 주면 그만큼까지만 늘린다)
        held.until = Math.max(held.until, held.since + ms);
        if (giveUp) held.giveUp = true;
        mine.push(u);
        continue;
      }
      if (this.settled.has(u) || this.gaveUp.has(u)) continue;
      const img = new Image();
      img.decoding = 'async';
      const done = () => {
        img.onload = img.onerror = null;
        this.settled.add(u);
        if (this.holding.get(u)?.img !== img) return;
        this.holding.delete(u);
        this.holdChanged();
      };
      img.onload = done;
      img.onerror = done;
      img.src = u;
      // 메모리 캐시에 있는 그림(이 문서에서 이미 받은 그림)은 곧바로 complete
      if (img.complete) {
        img.onload = img.onerror = null;
        this.settled.add(u);
        continue;
      }
      this.holding.set(u, { img, since: now, until: now + ms, giveUp });
      mine.push(u);
    }
    if (opts.only) {
      for (const [u, h] of [...this.holding]) if (!mine.includes(u)) this.letGo(u, h);
    }
    const waiting = mine.length ? new Promise<void>((resolve) => this.holdWaiters.push({ urls: mine, resolve })) : Promise.resolve();
    this.holdChanged();
    return waiting;
  }

  /** 붙잡은 그림 하나를 놓아 준다(무대에서 빠짐). 지켜보는 Image 만 받던 그림이면 브라우저가 받기를 거둔다 */
  private letGo(u: string, h: HeldImage) {
    this.holding.delete(u);
    h.img.onload = h.img.onerror = null;
    h.img.removeAttribute('src');
  }

  /**
   * p 가 끝날 때까지 새 받기·해독을 시작하지 않는다(무대가 그림을 해독하며 대사를 기다리는 동안. 이미 시작한 것은 그대로).
   * 해독은 같은 때 요청된 것끼리 한꺼번에 끝나서, 미리 해독이 끼면 무대 쪽 해독도 그만큼 늦어진다.
   */
  pauseUntil(p: Promise<unknown>): void {
    this.paused++;
    const resume = () => {
      this.paused--;
      this.pump();
    };
    p.then(resume, resume);
  }

  /** 아직 받기 시작하지 않은 그림 수(테스트·디버그용). held: 무대 그림을 기다리는 중, decoded: 미리 해독해 붙잡아 둔 그림 */
  get pending(): { near: number; bulk: number; active: number; held: number; decoded: number } {
    return { near: this.near.length, bulk: this.bulk.length, active: this.activeNear + this.activeBulk, held: this.holding.size, decoded: this.hot.size };
  }

  /** 붙잡은 그림이 바뀐 뒤: 다 끝난 약속을 풀고, 가장 이른 마감에 타이머를 맞추고, 다 풀렸으면 미리 불러오기를 잇는다 */
  private holdChanged() {
    if (this.holdWaiters.length) {
      const ready = this.holdWaiters.filter((w) => !w.urls.some((u) => this.holding.has(u)));
      if (ready.length) {
        this.holdWaiters = this.holdWaiters.filter((w) => !ready.includes(w));
        for (const w of ready) w.resolve();
      }
    }
    let next = Infinity;
    for (const h of this.holding.values()) next = Math.min(next, h.until);
    if (next === Infinity) {
      if (this.holdTimer) clearTimeout(this.holdTimer);
      this.holdTimer = null;
      // 붙잡고 있다가 다 풀렸을 때만 잇는다(아무것도 붙잡지 않은 hold 는 대기열을 건드리지 않는다: present 가 곧 다시 세운다)
      if (this.holdActive) {
        this.holdActive = false;
        this.pump();
      }
      return;
    }
    this.holdActive = true;
    if (this.holdTimer && this.holdTimerAt === next) return;
    if (this.holdTimer) clearTimeout(this.holdTimer);
    this.holdTimerAt = next;
    this.holdTimer = setTimeout(() => this.expireHolds(), Math.max(0, next - performance.now()));
  }

  /** 마감이 지난 그림을 붙잡힘에서 뺀다(무대 그림은 다시 붙잡지 않는다). 지켜보는 Image 는 계속 받는다 */
  private expireHolds() {
    this.holdTimer = null;
    const now = performance.now();
    for (const [u, h] of [...this.holding]) {
      if (h.until > now + 1) continue;
      this.holding.delete(u);
      if (h.giveUp) this.gaveUp.add(u);
    }
    this.holdChanged();
  }

  private pump() {
    // 무대 그림을 받거나(hold) 해독하며 기다리는 동안(pauseUntil)에는 받기도 해독도 새로 시작하지 않는다
    if (this.holding.size || this.paused) return;
    while (this.decoding < 1 && this.decodeQueue.length) this.decode(this.decodeQueue.shift()!);
    while (this.activeNear + this.activeBulk < this.max) {
      const url = this.near.shift();
      if (url !== undefined) {
        if (!this.started.has(url)) this.fetch(url, true);
        continue;
      }
      // 가까운 묶음을 받는 중에는 나머지를 새로 시작하지 않는다. 나머지는 한 자리를 남겨 둔다
      if (this.activeNear > 0 || this.activeBulk >= Math.max(1, this.max - 1)) break;
      const next = this.bulk.shift();
      if (next === undefined) break;
      if (!this.started.has(next)) this.fetch(next, false);
    }
  }

  private fetch(url: string, near: boolean) {
    this.started.add(url);
    if (near) this.activeNear++;
    else this.activeBulk++;
    const img = new Image();
    img.decoding = 'async';
    (img as HTMLImageElement & { fetchPriority?: string }).fetchPriority = 'low';
    img.setAttribute('fetchpriority', 'low');
    let finished = false;
    let slot = true;
    /** 동시 받기 자리를 비운다(한 번만) */
    const free = () => {
      if (!slot) return;
      slot = false;
      if (near) this.activeNear--;
      else this.activeBulk--;
    };
    // 응답 없이 멈춘 요청이 자리를 영영 차지하지 않게(가까운 묶음이면 나머지 대기열 전체를 막는다): 자리만 비운다
    const slotTimer = setTimeout(() => {
      free();
      this.pump();
    }, FETCH_SLOT_MS);
    const done = (ok: boolean) => {
      if (finished) return;
      finished = true;
      clearTimeout(slotTimer);
      free();
      this.settled.add(url);
      if (ok && this.wantDecode.has(url)) this.queueDecode(url);
      else this.wantDecode.delete(url);
      this.pump();
    };
    img.onload = () => done(true);
    img.onerror = () => done(false);
    img.src = url;
  }

  /** 곧 쓸 그림: 받은 뒤 해독한다(이미 받았으면 바로 해독 차례에 넣는다) */
  private markDecode(url: string) {
    if (!this.canDecode || this.decodeStarted.has(url)) return;
    this.wantDecode.add(url);
    if (this.settled.has(url)) this.queueDecode(url);
  }

  private queueDecode(url: string) {
    this.wantDecode.delete(url);
    if (this.decodeStarted.has(url)) return;
    this.decodeStarted.add(url);
    this.decodeQueue.push(url);
  }

  private decode(url: string) {
    this.decoding++;
    // 받은 그림이라 메모리 캐시에서 곧바로 붙는다(새로 내려받지 않음)
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    const finish = () => {
      this.decoding--;
      this.pump();
    };
    img.decode().then(
      () => {
        this.hot.delete(url);
        this.hot.set(url, img);
        if (this.hot.size > HOT_MAX) this.hot.delete(this.hot.keys().next().value!);
        finish();
      },
      finish,
    );
  }
}

/**
 * 장면 하나가 쓰는 그림 주소와 이어지는 장면 id.
 * start: 훑기 시작할 때의 무대(모르면 빈 무대). route: 확정 루트(분기 장면을 하나로 좁힌다).
 * from: 훑기 시작할 스텝 위치(지금 위치 다음부터 볼 때. start 는 그 위치의 무대).
 * pastChoice: 훑기 시작하는 곳이 아직 고르지 않은 선택지 바로 뒤다(지금 선택지가 떠 있음).
 * items 의 at 은 from 부터 그 그림이 처음 쓰이는 곳까지의 블로킹 스텝 수, steps 는 장면 끝까지의 블로킹 스텝 수.
 * 고르지 않은 선택지를 지나기 전에는 goto 를 따라간다(앞으로 가는 것만. 고른 갈래에서 다른 갈래를 건너뛴다).
 * 선택지를 지난 뒤에는 모든 갈래를 차례로 훑는다(goto 를 따르지 않음).
 */
export function sceneImages(
  story: Story,
  sceneId: string,
  start: StageState | null,
  r: PreloadResolver,
  route: string | null,
  from = 0,
  pastChoice = false,
): { urls: string[]; items: PreloadItem[]; next: string[]; end: StageState; steps: number } {
  const scene = story.scenes[sceneId];
  const chars: Partial<Record<CharId, CharState>> = {};
  for (const [c, s] of Object.entries(start?.chars ?? {})) if (s) chars[c as CharId] = { ...s };
  const end: StageState = { bg: start?.bg ?? 'black', chars, order: [...(start?.order ?? [])], bgm: start?.bgm ?? null };
  const urls: string[] = [];
  const items: PreloadItem[] = [];
  const next: string[] = [];
  let at = 0;
  let branching = pastChoice;
  if (!scene) return { urls, items, next, end, steps: 0 };
  const push = (u: string | null, kind: PreloadKind) => {
    if (u && !urls.includes(u)) {
      urls.push(u);
      items.push(branching ? { url: u, kind, at, branch: true } : { url: u, kind, at });
    }
  };
  for (let i = Math.max(0, from); i < scene.steps.length; i++) {
    const step = scene.steps[i];
    switch (step.t) {
      case 'bg':
        end.bg = step.bg;
        push(r.bgUrl(step.bg), 'bg');
        break;
      case 'show': {
        const prev = chars[step.char];
        const s: CharState = {
          pos: step.pos ?? prev?.pos ?? 'center',
          expr: step.expr ?? prev?.expr ?? 'neutral',
          outfit: step.outfit ?? prev?.outfit ?? 'uniform',
          hair: step.hair ?? prev?.hair ?? 'default',
        };
        chars[step.char] = s;
        if (!end.order.includes(step.char)) end.order.push(step.char);
        push(r.spriteUrl(step.char, s), 'sprite');
        break;
      }
      case 'say': {
        if (step.expr && (step.who === 'osana' || step.who === 'tenko')) {
          const s = chars[step.who];
          if (s) {
            s.expr = step.expr;
            push(r.spriteUrl(step.who, s), 'sprite');
          }
        }
        at++;
        break;
      }
      case 'card':
        at++;
        break;
      case 'choice':
        at++;
        branching = true;
        break;
      case 'goto': {
        if (branching) break;
        const j = scene.steps.findIndex((s) => s.id === step.to);
        if (j > i) i = j - 1;
        break;
      }
      case 'hide': {
        const targets = step.char === 'all' ? [...end.order] : [step.char];
        for (const c of targets) delete chars[c];
        end.order = end.order.filter((c) => !targets.includes(c));
        break;
      }
      case 'cg':
        if (step.cg) push(r.cgUrl?.(step.cg) ?? null, 'cg');
        break;
      case 'jump':
        if (!next.includes(step.scene)) next.push(step.scene);
        break;
      case 'routeBranch':
        for (const [h, id] of Object.entries(step.scenes)) if ((!route || route === h) && !next.includes(id)) next.push(id);
        break;
      default:
        break;
    }
  }
  return { urls, items, next, end, steps: at };
}
