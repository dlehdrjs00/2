import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DecodedImageCache } from '../../src/ui/image-cache';
import { renderProfile, usesAppleTouchRenderer } from '../../src/ui/render-profile';

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
