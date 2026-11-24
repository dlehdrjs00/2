/** Bounded decoded-image retention. The browser's HTTP cache still holds evicted files. */
interface Entry {
  img: HTMLImageElement;
  done: Promise<boolean>;
  settled: boolean;
}

export class DecodedImageCache {
  private entries = new Map<string, Entry>();
  constructor(private maxImages = 8, private maxPixels = 12 * 1024 * 1024) {}

  decode(url: string): Promise<boolean> {
    const hit = this.entries.get(url);
    if (hit) {
      this.entries.delete(url);
      this.entries.set(url, hit);
      return hit.done;
    }
    const img = new Image();
    img.decoding = 'async';
    const loaded = new Promise<boolean>((resolve) => {
      img.addEventListener('load', () => resolve(true), { once: true });
      img.addEventListener('error', () => resolve(false), { once: true });
    });
    img.src = url;
    const done = typeof img.decode === 'function' ? img.decode().then(() => true, () => loaded) : loaded;
    const entry: Entry = { img, done, settled: false };
    this.entries.set(url, entry);
    void done.then(() => {
      entry.settled = true;
      this.trim(url);
    });
    return done;
  }

  settled(url: string): boolean { return this.entries.get(url)?.settled ?? false; }
  image(url: string): HTMLImageElement | null { return this.entries.get(url)?.img ?? null; }

  /**
   * count·pixels: 보관 중인 수와 해독이 끝난 것의 픽셀 합(퇴출 판단에 쓰는 값). pending: 그중 해독 중,
   * attached·attachedPixels: 그중 화면에 붙어 있어 퇴출하지 않는 것(CG). maxImages·maxPixels: 상한
   */
  get stats(): { count: number; pixels: number; pending: number; attached: number; attachedPixels: number; maxImages: number; maxPixels: number } {
    let pixels = 0;
    let pending = 0;
    let attached = 0;
    let attachedPixels = 0;
    for (const { img, settled } of this.entries.values()) {
      if (!settled) {
        pending++;
        continue;
      }
      const px = img.naturalWidth * img.naturalHeight;
      pixels += px;
      if (img.isConnected) {
        attached++;
        attachedPixels += px;
      }
    }
    return { count: this.entries.size, pixels, pending, attached, attachedPixels, maxImages: this.maxImages, maxPixels: this.maxPixels };
  }

  private trim(justDecoded: string): void {
    let { count, pixels } = this.stats;
    for (const [url, e] of this.entries) {
      if (count <= this.maxImages && pixels <= this.maxPixels) break;
      // Never detach a visible CG or discard a pending decode. A single large image is allowed.
      if (!e.settled || e.img.isConnected || url === justDecoded) continue;
      this.entries.delete(url);
      count--;
      pixels -= e.img.naturalWidth * e.img.naturalHeight;
      // Do not clear src: a fade/consumer may still hold this element.
    }
  }
}
