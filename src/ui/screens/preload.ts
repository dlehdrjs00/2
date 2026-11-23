/**
 * 그림 미리 불러오기(백그라운드)
 *
 * - 대기열은 두 단계다.
 *   가까운 묶음(near): 지금 위치에서 곧 쓸 그림. game.ts 가 스텝마다 '지금 위치에서의 거리' 순으로 다시 세운다.
 *     이 묶음을 받는 동안에는 다른 그림을 새로 시작하지 않는다(느린 망에서 곧 볼 CG·배경이 전체 대기열에 밀리지 않게).
 *   나머지(bulk): 지금·다음 장면의 나머지 그림(앞) → 게임 전체 그림(뒤). 가까운 묶음이 비었을 때만 받는다.
 *     가까운 묶음이 새로 들어오면 바로 시작할 수 있게, 나머지는 동시에 (최대 - 1)개까지만 받는다.
 * - 동시에 3개(데이터 절약 모드·2G/3G 로 보이는 연결은 2개)까지, fetchPriority 'low' 로
 *   화면에 지금 필요한 그림(무대가 직접 받는 그림)의 내려받기를 방해하지 않는다.
 * - 장면 그림은 대본(배경·등장·표정 변화·CG)을 앞에서부터 훑어 계산한다. 조건 분기는 양쪽 다 받는다.
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

export class ImagePreloader {
  /** 가까운 묶음(이 순서대로) */
  private near: string[] = [];
  /** 나머지(이 순서대로) */
  private bulk: string[] = [];
  /** 받기 시작했거나 다 받은 그림 */
  private started = new Set<string>();
  private activeNear = 0;
  private activeBulk = 0;
  private readonly max: number;

  constructor(max = preloadConcurrency()) {
    this.max = Math.max(1, Math.floor(max));
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
   */
  plan(near: Iterable<string>, soon: Iterable<string> = []): void {
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
    const n = take(near);
    const s = take(soon);
    const leftover = this.near.filter((u) => !picked.has(u));
    const rest = this.bulk.filter((u) => !picked.has(u));
    this.near = n;
    this.bulk = [...s, ...leftover, ...rest];
    this.pump();
  }

  /** 아직 받기 시작하지 않은 그림 수(테스트·디버그용) */
  get pending(): { near: number; bulk: number; active: number } {
    return { near: this.near.length, bulk: this.bulk.length, active: this.activeNear + this.activeBulk };
  }

  private pump() {
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
    const done = () => {
      if (finished) return;
      finished = true;
      if (near) this.activeNear--;
      else this.activeBulk--;
      this.pump();
    };
    img.onload = done;
    img.onerror = done;
    img.src = url;
  }
}

/**
 * 장면 하나가 쓰는 그림 주소와 이어지는 장면 id.
 * start: 훑기 시작할 때의 무대(모르면 빈 무대). route: 확정 루트(분기 장면을 하나로 좁힌다).
 * from: 훑기 시작할 스텝 위치(지금 위치 다음부터 볼 때. start 는 그 위치의 무대).
 * items 의 at 은 from 부터 그 그림이 처음 쓰이는 곳까지의 블로킹 스텝 수, steps 는 장면 끝까지의 블로킹 스텝 수.
 */
export function sceneImages(
  story: Story,
  sceneId: string,
  start: StageState | null,
  r: PreloadResolver,
  route: string | null,
  from = 0,
): { urls: string[]; items: PreloadItem[]; next: string[]; end: StageState; steps: number } {
  const scene = story.scenes[sceneId];
  const chars: Partial<Record<CharId, CharState>> = {};
  for (const [c, s] of Object.entries(start?.chars ?? {})) if (s) chars[c as CharId] = { ...s };
  const end: StageState = { bg: start?.bg ?? 'black', chars, order: [...(start?.order ?? [])], bgm: start?.bgm ?? null };
  const urls: string[] = [];
  const items: PreloadItem[] = [];
  const next: string[] = [];
  let at = 0;
  if (!scene) return { urls, items, next, end, steps: 0 };
  const push = (u: string | null, kind: PreloadKind) => {
    if (u && !urls.includes(u)) {
      urls.push(u);
      items.push({ url: u, kind, at });
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
      case 'choice':
        at++;
        break;
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
