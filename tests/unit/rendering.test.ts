import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DecodedImageCache } from '../../src/ui/image-cache';
import { renderProfile, usesAppleTouchRenderer } from '../../src/ui/render-profile';
import type { ChoiceStep, GameState, Story } from '../../src/engine/types';
import { STORY } from '../../src/story';
import { advance, choose, newGameState, settle, visibleOptions, type StepResult } from '../../src/engine/runner';
import { heroineUnlocked, nearbyImages, sceneImages, unlockFlags, type PreloadResolver } from '../../src/ui/screens/preload';
import { BACKGROUNDS, SPRITE_SETS, spritePath } from '../../src/story/assets';
import { CGS } from '../../src/story/cg';
import { bg as bgStep, cg as cgStep, choice, decideRoute, ending, isFlag, jump, mono, not, opt, routeBranch, scene as sceneDef, show, unlock, when } from '../../src/engine/dsl';

afterEach(() => vi.unstubAllGlobals());

describe('Apple touch renderer', () => {
  it('recognizes both iPad UA modes and leaves Android/desktop alone', () => {
    const n = (userAgent: string, platform: string, maxTouchPoints: number) => ({ userAgent, platform, maxTouchPoints });
    expect(usesAppleTouchRenderer(n('iPad Safari', 'iPad', 5))).toBe(true);
    expect(usesAppleTouchRenderer(n('Macintosh Safari', 'MacIntel', 5))).toBe(true);
    expect(usesAppleTouchRenderer(n('iPhone Safari', 'iPhone', 5))).toBe(true);
    expect(usesAppleTouchRenderer(n('Macintosh Safari', 'MacIntel', 0))).toBe(false);
    expect(usesAppleTouchRenderer(n('Android Chrome', 'Linux armv8l', 5))).toBe(false);
    expect(usesAppleTouchRenderer(n('Windows Chrome', 'Win32', 10))).toBe(false);
  });
  it('falls back to standard without navigator (prerender, tests)', () => {
    vi.stubGlobal('navigator', undefined);
    expect(renderProfile()).toBe('standard');
  });
  it('uses the live navigator (iPadOS desktop mode)', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari', platform: 'MacIntel', maxTouchPoints: 5 });
    expect(renderProfile()).toBe('apple-touch');
  });
});

/** CSS 파일에서 '선택자 목록 → filter 값' 규칙(인물 .char 에 거는 것만)을 파일 순서대로 */
function charFilterRules(file: string): Array<{ selectors: string[]; filter: string }> {
  const css = readFileSync(new URL(`../../src/ui/styles/${file}`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const out: Array<{ selectors: string[]; filter: string }> = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = m[1].split(',').map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const filter = /(?:^|;)\s*filter:\s*([^;]+)/.exec(m[2])?.[1].replace(/\s+/g, ' ').trim();
    if (filter && selectors.some((x) => /\.char\b/.test(x))) out.push({ selectors, filter });
  }
  return out;
}

describe('Apple touch sprite filters (performance.css) mirror the standard tone rules (play.css)', () => {
  const APPLE = ".vn[data-render='apple-touch']";
  /** 표준 선택자 → apple-touch 선택자(#vn 에 붙는 속성은 같은 요소에 합친다) */
  const mirror = (sel: string) => (sel.startsWith('.vn[') ? APPLE + sel.slice(3) : `${APPLE} ${sel}`);
  /** drop-shadow(…) 만 뺀 값(남는 것이 없으면 none) */
  const withoutShadow = (f: string) => f.replace(/\s*drop-shadow\((?:[^()]|\([^()]*\))*\)/g, '').trim() || 'none';
  const standard = charFilterRules('play.css');
  const apple = charFilterRules('performance.css');

  it('has one shadow-free rule per standard rule, in the same order, with the same colour correction', () => {
    expect(standard.length).toBeGreaterThanOrEqual(8);
    expect(apple.map((r) => r.selectors)).toEqual(standard.map((r) => r.selectors.map(mirror)));
    expect(apple.map((r) => r.filter)).toEqual(standard.map((r) => withoutShadow(r.filter)));
    for (const r of apple) expect(r.filter).not.toContain('drop-shadow');
  });
  it('night yukata and tone rules are keyed by look/tone only (no per-character selector), so they also cover koharu', () => {
    for (const r of [...standard, ...apple]) for (const sel of r.selectors) expect(sel).not.toMatch(/osana|tenko|koharu|akane|hina/);
    expect(SPRITE_SETS.koharu.looks.map((l) => `${l.outfit}_${l.hair}`)).toEqual(['uniform_default', 'casual_default', 'yukata_default']);
    // 같은 비율이라 무대 배치(높이 기준)·해독 캐시 픽셀 예산이 다른 인물과 같다
    expect(SPRITE_SETS.koharu.aspect).toBeCloseTo(SPRITE_SETS.osana.aspect, 6);
  });
  it('keeps the night yukata values on both renderers (1.04 / inactive and choice 0.98)', () => {
    const yukata = (rules: typeof standard) => rules.filter((r) => r.selectors.some((x) => x.includes("data-look^='yukata_'"))).map((r) => r.filter);
    expect(yukata(standard).map(withoutShadow)).toEqual(['brightness(1.04) saturate(0.98)', 'brightness(0.98) saturate(0.92)']);
    expect(yukata(apple)).toEqual(['brightness(1.04) saturate(0.98)', 'brightness(0.98) saturate(0.92)']);
  });
});

class FakeImage extends EventTarget {
  naturalWidth = 100;
  naturalHeight = 100;
  isConnected = false;
  src = '';
  decoding = '';
  decode() { return Promise.resolve(); }
}

describe('decoded image retention', () => {
  it('caps repeated playthrough retention and reloads evicted images', async () => {
    vi.stubGlobal('Image', FakeImage);
    const cache = new DecodedImageCache(3);
    for (let i = 0; i < 100; i++) await cache.decode(`image-${i}`);
    expect(cache.stats.count).toBe(3);
    expect(cache.image('image-0')).toBeNull();
    expect(await cache.decode('image-0')).toBe(true);
    expect(cache.stats.count).toBe(3);
  });
  it('retains recently reused expressions', async () => {
    vi.stubGlobal('Image', FakeImage);
    const cache = new DecodedImageCache(2);
    await cache.decode('smile');
    await cache.decode('sad');
    const same = cache.image('smile');
    await cache.decode('smile');
    await cache.decode('shy');
    expect(cache.image('sad')).toBeNull();
    expect(cache.image('smile')).toBe(same);
  });
  it('also bounds decoded pixels, not only compressed file count', async () => {
    vi.stubGlobal('Image', FakeImage);
    const cache = new DecodedImageCache(20, 25_000);
    for (let i = 0; i < 10; i++) await cache.decode(`bg-${i}`);
    expect(cache.stats.pixels).toBe(20_000);
    expect(cache.stats.count).toBe(2);
  });
  it('with the default budget, real-size art is bounded by pixels first (backgrounds 6, sprites 5)', async () => {
    class SizedImage extends FakeImage {
      constructor() {
        super();
        this.naturalWidth = 0;
      }
      override decode() {
        const [w, h] = this.src.startsWith('bg') ? [1920, 1080] : [1200, 1800];
        this.naturalWidth = w;
        this.naturalHeight = h;
        return Promise.resolve();
      }
    }
    vi.stubGlobal('Image', SizedImage);
    const bgs = new DecodedImageCache();
    for (let i = 0; i < 10; i++) await bgs.decode(`bg-${i}`);
    expect(bgs.stats.count).toBe(6);
    expect(bgs.stats.pixels).toBeLessThanOrEqual(bgs.stats.maxPixels);
    const sprites = new DecodedImageCache();
    for (let i = 0; i < 10; i++) await sprites.decode(`sprite-${i}`);
    expect(sprites.stats.count).toBe(5);
    expect(sprites.stats).toMatchObject({ pending: 0, attached: 0, maxImages: 8, maxPixels: 12 * 1024 * 1024 });
  });
  it('does not detach or clear a visible CG when evicting', async () => {
    vi.stubGlobal('Image', FakeImage);
    const cache = new DecodedImageCache(2);
    await cache.decode('cg');
    const cg = cache.image('cg')!;
    Object.defineProperty(cg, 'isConnected', { value: true });
    await cache.decode('one');
    await cache.decode('two');
    expect(cache.image('cg')).toBe(cg);
    expect(cg.src).toBe('cg');
    expect(cache.image('one')).toBeNull();
    expect(cache.stats).toMatchObject({ count: 2, attached: 1, attachedPixels: 10_000 });
  });
  it('keeps pending requests reusable and trims once they settle', async () => {
    let resolve!: () => void;
    class PendingImage extends FakeImage {
      override decode() { return this.src === 'pending' ? new Promise<void>(r => resolve = r) : Promise.resolve(); }
    }
    vi.stubGlobal('Image', PendingImage);
    const cache = new DecodedImageCache(2);
    const pending = cache.decode('pending');
    for (let i = 0; i < 8; i++) await cache.decode(`other-${i}`);
    expect(cache.decode('pending')).toBe(pending);
    resolve();
    expect(await pending).toBe(true);
    expect(cache.stats.count).toBeLessThanOrEqual(2);
  });
  it('falls back to load after decode rejection and resolves broken images', async () => {
    class FallbackImage extends FakeImage {
      override decode() {
        queueMicrotask(() => this.dispatchEvent(new Event(this.src === 'broken' ? 'error' : 'load')));
        return Promise.reject(new Error('decode unavailable'));
      }
    }
    vi.stubGlobal('Image', FallbackImage);
    const cache = new DecodedImageCache();
    expect(await cache.decode('svg')).toBe(true);
    expect(await cache.decode('broken')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 근접 장면 미리 불러오기(screens/preload.ts nearbyImages·sceneImages)와 선택지의 '보이는 옵션'
// 히든 히로인(코하루)이 해금되지 않은 플레이에서는 코하루 전용 그림(스프라이트·kh_* CG·kh_* 배경)을 미리 받지 않고,
// 해금된 플레이에서는 쓰기 전에 미리 받는다.
// ---------------------------------------------------------------------------

const resolver: PreloadResolver = {
  bgUrl: (id) => (BACKGROUNDS as Record<string, { src?: string }>)[id]?.src ?? null,
  spriteUrl: (c, s) => spritePath(c, s.outfit, s.hair, s.expr),
  cgUrl: (id) => (CGS as Record<string, { src: string } | undefined>)[id]?.src ?? null,
};
const KOHARU_ART = /assets\/char\/koharu\/|assets\/(?:cg|bg)\/kh_/;
const EARLY = ['c3.ch', 'c4.ch', 'c6.ch', 'c7.ch'];

/** 지금 무대가 쓰는 그림 */
function stageUrls(st: GameState): string[] {
  const out: Array<string | null> = [resolver.bgUrl(st.stage.bg)];
  for (const c of st.stage.order) {
    const s = st.stage.chars[c];
    if (s) out.push(resolver.spriteUrl(c, s));
  }
  if (st.stage.cg) out.push(resolver.cgUrl!(st.stage.cg));
  return out.filter((u): u is string => !!u);
}

/**
 * picks(초반 4 + 후반 3) 대로 끝까지 플레이하며 블로킹 스텝마다 nearbyImages 를 부른다(game.ts present 와 같은 때).
 * 돌려주는 값: 미리 받으려 한 코하루 그림, 무대에 처음 나왔는데 그 전에 계획에 없던 그림(첫 화면 제외), 해금 여부, 엔딩
 */
function playAndPlan(picks: string[]) {
  const st = newGameState(STORY);
  let res: StepResult | null = settle(STORY, st);
  let pi = 0;
  let n = 0;
  const planned = new Set<string>();
  const koharu = new Set<string>();
  const unplanned: string[] = [];
  while (res && res.step.t !== 'ending' && n++ < 5000) {
    if (n > 2) for (const u of stageUrls(st)) if (!planned.has(u)) unplanned.push(`${st.stepId} ${u}`);
    for (const u of stageUrls(st)) planned.add(u);
    for (const it of nearbyImages(STORY, st.sceneId, st.stepId, st.stage, st, resolver)) {
      planned.add(it.url);
      if (KOHARU_ART.test(it.url)) koharu.add(it.url);
    }
    if (res.step.t === 'choice') {
      const shown = visibleOptions(st, res.step as ChoiceStep).map((o) => o.id);
      expect(shown, `${res.step.id} 보이는 옵션 수`).toHaveLength(3);
      const want = picks[pi++];
      res = choose(STORY, st, shown.includes(want) ? want : shown[shown.length - 1]);
    } else res = advance(STORY, st);
  }
  const end = res?.step.t === 'ending' ? res.step.ending : null;
  return { koharu, unplanned, met: st.flags['kh.met'] === true, end };
}

const combos = (n: number, opts: string[]): string[][] =>
  n === 0 ? [[]] : combos(n - 1, opts).flatMap((c) => opts.map((o) => [...c, o]));

describe('근접 장면 미리 불러오기: 히든 히로인 해금 여부를 지금 상태로 판정', () => {
  it('초반 81조합 전부(후반 a,b,c 와 c,c,c): 해금되지 않은 플레이는 코하루 그림을 한 장도 미리 받지 않고, 해금된 플레이는 쓰기 전에 받는다', () => {
    let metCount = 0;
    for (const early of combos(4, ['a', 'b', 'c'])) {
      for (const late of [['a', 'b', 'k'], ['c', 'c', 'c'], ['k', 'k', 'k']]) {
        const r = playAndPlan([...early, ...late]);
        if (!r.met) {
          expect([...r.koharu], `미해금 ${early.join('')} 후반 ${late.join('')}`).toEqual([]);
          expect(r.end).not.toBe('koharu');
        } else {
          if (late[0] === 'a') metCount++;
          expect(r.koharu.size, `해금 ${early.join('')}`).toBeGreaterThan(0);
        }
        // 무대에 나온 그림은 모두 그 전에 미리 받기 계획에 있었다(해금·미해금 모두)
        expect(r.unplanned, `${early.join('')}${late.join('')}`).toEqual([]);
        if (late.join('') === 'kkk' && r.met) expect(r.end).toBe('koharu');
      }
    }
    expect(metCount).toBe(25);
  });

  it('c7 선택지가 떠 있을 때는 해금 판정 전이라 복도 첫 만남(kh_meet)을 받지 않고, 해금되는 선택을 고른 뒤에는 받는다', () => {
    const st = newGameState(STORY);
    let res: StepResult | null = settle(STORY, st);
    const picks: Record<string, string> = { 'c3.ch': 'c', 'c4.ch': 'c', 'c6.ch': 'c', 'c7.ch': 'c' };
    while (res && !(res.step.t === 'choice' && res.step.id === 'c7.ch')) {
      res = res.step.t === 'choice' ? choose(STORY, st, picks[res.step.id]) : advance(STORY, st);
    }
    const atChoice = nearbyImages(STORY, st.sceneId, st.stepId, st.stage, st, resolver).map((i) => i.url);
    expect(atChoice.filter((u) => KOHARU_ART.test(u))).toEqual([]);
    res = choose(STORY, st, 'c');
    const after = nearbyImages(STORY, st.sceneId, st.stepId, st.stage, st, resolver);
    const meet = after.find((i) => i.url === 'assets/cg/kh_meet.webp');
    expect(meet).toBeTruthy();
    expect(meet!.branch).toBeFalsy();
    // 해금 판정(unlock)은 아직 실행 전이지만, 고른 뒤의 점수로 같은 판정을 미리 한다
    expect(st.flags['kh.met']).toBeUndefined();
  });

  it('루트 분기: c10 선택지에서 해금 플레이는 세 갈래(o1·t1·k1), 미해금 플레이는 두 갈래만 다음 장면으로 본다', () => {
    const reach = (early: string[]) => {
      const st = newGameState(STORY);
      let res: StepResult | null = settle(STORY, st);
      const picks: Record<string, string> = Object.fromEntries(EARLY.map((id, i) => [id, early[i]]));
      while (res && !(res.step.t === 'choice' && res.step.id === 'c10.ch')) {
        if (res.step.t === 'choice') {
          const shown = visibleOptions(st, res.step).map((o) => o.id);
          res = choose(STORY, st, picks[res.step.id] ?? shown[0]);
        } else res = advance(STORY, st);
      }
      const scene = STORY.scenes[st.sceneId];
      const idx = scene.steps.findIndex((s) => s.id === st.stepId);
      return sceneImages(STORY, st.sceneId, st.stage, resolver, null, idx + 1, true, st);
    };
    expect(reach(['c', 'c', 'c', 'c']).next.sort()).toEqual(['k1', 'o1_shop', 't1_cats']);
    expect(reach(['a', 'a', 'a', 'a']).next.sort()).toEqual(['o1_shop', 't1_cats']);
  });

  it('해금 플래그 찾기: 이야기의 unlock 스텝(koharu → kh.met)', () => {
    const flags = unlockFlags(STORY);
    expect(flags.get('koharu')).toBe('kh.met');
    expect(heroineUnlocked(flags, { points: { osana: 0, tenko: 0, koharu: 0 }, flags: {}, choices: {}, route: null }, 'koharu')).toBe(false);
    expect(heroineUnlocked(flags, { points: { osana: 0, tenko: 0, koharu: 0 }, flags: { 'kh.met': true }, choices: {}, route: null }, 'koharu')).toBe(true);
    expect(heroineUnlocked(flags, { points: { osana: 0, tenko: 0, koharu: 0 }, flags: {}, choices: {}, route: 'koharu' }, 'koharu')).toBe(true);
  });
});

describe('sceneImages: 갈래 판정(작은 대본)', () => {
  /** 선택(점수) → 해금 판정 → 해금 갈래에서만 코하루 → 보이는 옵션 → 루트 분기 */
  function tiny(): Story {
    const s1 = sceneDef({ id: 's1', title: 'a', route: 'common', part: 'main' }, [
      bgStep('hallway'),
      choice('q1', undefined, [
        opt('a', 'A', { heroine: 'osana', points: 2 }),
        opt('b', 'B', { heroine: 'tenko', points: 2, goto: 'q1.b' }),
      ]),
      mono('s1.a', 'a'),
      jump('s2'),
      { t: 'label', id: 'q1.b' },
      mono('s1.b', 'b'),
      jump('s2'),
    ]);
    const s2 = sceneDef({ id: 's2', title: 'b', route: 'common', part: 'main' }, [
      unlock('koharu', ['osana', 'tenko'], 1, 'kh.met'),
      when(not(isFlag('kh.met')), 's2.road'),
      cgStep('kh_meet'),
      show('koharu', { outfit: 'casual', expr: 'smile' }),
      mono('s2.meet', '만남'),
      { t: 'label', id: 's2.road' },
      bgStep('road_evening'),
      choice('q2', undefined, [
        opt('a', 'A', { heroine: 'osana' }),
        opt('k', 'K', { heroine: 'koharu', visibleIf: isFlag('kh.met'), goto: 'q2.k' }),
        opt('c', 'C', { visibleIf: not(isFlag('kh.met')) }),
      ]),
      mono('s2.a', 'a'),
      { t: 'goto', id: 's2.g', to: 's2.end' },
      { t: 'label', id: 'q2.k' },
      show('koharu', { outfit: 'uniform', expr: 'smile' }),
      mono('s2.k', 'k'),
      { t: 'label', id: 's2.end' },
      decideRoute(['q1', 'q2'], { koharu: 'kh.met' }),
      routeBranch({ osana: 'ro', tenko: 'rt', koharu: 'rk' }),
    ]);
    const end = (id: string, h: 'osana' | 'tenko' | 'koharu', art: string) =>
      sceneDef({ id, title: id, route: h, part: 'main' }, [bgStep(art as never), mono(`${id}.1`, id), ending(`${id}.e`, h)]);
    return {
      version: 't',
      start: 's1',
      scenes: { s1, s2, ro: end('ro', 'osana', 'road_morning'), rt: end('rt', 'tenko', 'shrine_steps'), rk: end('rk', 'koharu', 'kh_stationery') },
      endings: {
        osana: { id: 'osana', heroine: 'osana', title: 'o' },
        tenko: { id: 'tenko', heroine: 'tenko', title: 't' },
        koharu: { id: 'koharu', heroine: 'koharu', title: 'k' },
      },
    };
  }
  const known = (over: Partial<GameState> = {}) => ({ points: { osana: 0, tenko: 0, koharu: 0 }, flags: {}, choices: {}, route: null, ...over });

  it('지금 상태로 해금이 확정되면(점수 차 ≤ 1) 해금 갈래의 그림을, 아니면 건너뛴 길의 그림만', () => {
    const story = tiny();
    const met = sceneImages(story, 's2', null, resolver, null, 0, false, known({ points: { osana: 2, tenko: 2, koharu: 0 } }));
    expect(met.urls).toContain('assets/cg/kh_meet.webp');
    expect(met.urls.some((u) => u.includes('char/koharu/casual_default_smile'))).toBe(true);
    // 해금 플레이: k 갈래만 보이고 c 는 없다 → 코하루 교복 그림(갈래), 루트는 세 갈래
    expect(met.urls.some((u) => u.includes('char/koharu/uniform_default_smile'))).toBe(true);
    expect(met.next.sort()).toEqual(['rk', 'ro', 'rt']);
    const unmet = sceneImages(story, 's2', null, resolver, null, 0, false, known({ points: { osana: 4, tenko: 0, koharu: 0 } }));
    expect(unmet.urls.filter((u) => KOHARU_ART.test(u))).toEqual([]);
    expect(unmet.next.sort()).toEqual(['ro', 'rt']);
  });

  it('아직 고르지 않은 선택지 뒤의 해금 판정은 "해금 안 됨"으로 본다(고를 갈래의 점수를 미리 셈하지 않는다)', () => {
    const story = tiny();
    // q1 이 떠 있는 상태(0:0). 어느 쪽을 골라도 2:0 이라 실제로도 미해금이지만, 판정 자체를 하지 않는다
    const items = nearbyImages(story, 's1', 'q1', null, known(), resolver);
    expect(items.map((i) => i.url).filter((u) => KOHARU_ART.test(u))).toEqual([]);
    // 이미 해금된 플래그가 있으면 그대로 따른다
    const metAlready = nearbyImages(story, 's1', 'q1', null, known({ flags: { 'kh.met': true } }), resolver);
    expect(metAlready.map((i) => i.url)).toContain('assets/cg/kh_meet.webp');
    expect(metAlready.find((i) => i.url === 'assets/cg/kh_meet.webp')!.branch).toBe(true);
  });

  it('루트가 정해지면(지금 상태로 결정 가능하면) 그 루트 장면만 다음 장면으로 본다', () => {
    const story = tiny();
    // q2 에서 k 를 고른 뒤(해금, 코하루 최고점)
    const st = known({ points: { osana: 2, tenko: 2, koharu: 3 }, flags: { 'kh.met': true }, choices: { q1: 'a', q2: 'k' } });
    const idx = story.scenes.s2.steps.findIndex((s) => s.id === 's2.k');
    const r = sceneImages(story, 's2', null, resolver, null, idx + 1, false, st);
    expect(r.next).toEqual(['rk']);
    expect(r.nextKnown.rk.route).toBe('koharu');
    const items = nearbyImages(story, 's2', 's2.k', null, st, resolver).map((i) => i.url);
    expect(items).toContain('assets/bg/kh_stationery.webp');
    expect(items).not.toContain('assets/bg/shrine_steps.webp');
  });
});
