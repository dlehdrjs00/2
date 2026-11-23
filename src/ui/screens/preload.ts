/**
 * 그림 미리 불러오기(백그라운드)
 *
 * - 순서: 첫 장면 → (플레이 중) 지금 장면과 바로 다음 장면 → 나머지 전부.
 * - 동시에 3개까지만 받고, fetchPriority 'low' 로 화면에 지금 필요한 그림의 내려받기를 방해하지 않는다.
 * - 장면 그림은 대본(배경·등장·표정 변화)을 앞에서부터 훑어 계산한다. 조건 분기는 양쪽 다 받는다.
 */
import type { CharId, CharState, StageState, Story } from '../../engine/types';

export interface PreloadResolver {
  bgUrl(id: string): string | null;
  spriteUrl(char: CharId, s: CharState): string | null;
  cgUrl?(id: string): string | null;
}

const MAX_ACTIVE = 3;

export class ImagePreloader {
  private queue: string[] = [];
  private seen = new Set<string>();
  private active = 0;

  /** 대기열에 넣는다. front 면 아직 시작하지 않은 다른 그림보다 앞에(주어진 순서대로) */
  add(urls: Iterable<string>, front = false): void {
    const fresh: string[] = [];
    for (const u of urls) {
      if (!u) continue;
      if (this.seen.has(u)) {
        // 이미 대기 중이면 앞으로 당긴다(받는 중·받은 그림은 그대로)
        if (front) {
          const i = this.queue.indexOf(u);
          if (i >= 0) {
            this.queue.splice(i, 1);
            fresh.push(u);
          }
        }
        continue;
      }
      this.seen.add(u);
      fresh.push(u);
    }
    if (front) this.queue.unshift(...fresh);
    else this.queue.push(...fresh);
    this.pump();
  }

  private pump() {
    while (this.active < MAX_ACTIVE && this.queue.length) {
      const url = this.queue.shift()!;
      this.active++;
      const img = new Image();
      img.decoding = 'async';
      (img as HTMLImageElement & { fetchPriority?: string }).fetchPriority = 'low';
      img.setAttribute('fetchpriority', 'low');
      let finished = false;
      const done = () => {
        if (finished) return;
        finished = true;
        this.active--;
        this.pump();
      };
      img.onload = done;
      img.onerror = done;
      img.src = url;
    }
  }
}

/**
 * 장면 하나가 쓰는 그림 주소와 이어지는 장면 id.
 * start: 장면에 들어갈 때의 무대(모르면 빈 무대). route: 확정 루트(분기 장면을 하나로 좁힌다)
 */
export function sceneImages(
  story: Story,
  sceneId: string,
  start: StageState | null,
  r: PreloadResolver,
  route: string | null,
): { urls: string[]; next: string[]; end: StageState } {
  const scene = story.scenes[sceneId];
  const chars: Partial<Record<CharId, CharState>> = {};
  for (const [c, s] of Object.entries(start?.chars ?? {})) if (s) chars[c as CharId] = { ...s };
  const end: StageState = { bg: start?.bg ?? 'black', chars, order: [...(start?.order ?? [])], bgm: start?.bgm ?? null };
  const urls: string[] = [];
  const next: string[] = [];
  if (!scene) return { urls, next, end };
  const push = (u: string | null) => {
    if (u && !urls.includes(u)) urls.push(u);
  };
  for (const step of scene.steps) {
    switch (step.t) {
      case 'bg':
        end.bg = step.bg;
        push(r.bgUrl(step.bg));
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
        push(r.spriteUrl(step.char, s));
        break;
      }
      case 'say': {
        if (step.expr && (step.who === 'osana' || step.who === 'tenko')) {
          const s = chars[step.who];
          if (s) {
            s.expr = step.expr;
            push(r.spriteUrl(step.who, s));
          }
        }
        break;
      }
      case 'hide': {
        const targets = step.char === 'all' ? [...end.order] : [step.char];
        for (const c of targets) delete chars[c];
        end.order = end.order.filter((c) => !targets.includes(c));
        break;
      }
      case 'cg':
        if (step.cg) push(r.cgUrl?.(step.cg) ?? null);
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
  return { urls, next, end };
}
