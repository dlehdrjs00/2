/**
 * 오디오 관리자 (Web Audio).
 *  - 브라우저 자동재생 제한: 첫 사용자 입력에서 unlock() 해야 소리가 난다. 그 전의 음악 요청은 기억해 두었다가 재생.
 *  - 파일이 없거나 디코딩에 실패해도 예외를 밖으로 던지지 않는다(게임 진행 우선).
 *  - Web Audio 를 쓸 수 없는 환경이면 조용히 무음으로 동작.
 *  - 음량이 0 이면 그 파일을 내려받지 않는다(느린 모바일 망에서 그림과 대역폭을 다투지 않게).
 *    배경음은 어떤 곡을 틀어야 하는지만 기억해 두었다가, 음량을 올리는 순간 그 곡부터 받아 튼다.
 */
export interface AudioSource {
  src: string;
  gain?: number;
}

type Ctx = AudioContext;

export class AudioManager {
  private ctx: Ctx | null = null;
  private bgmBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  /** deferred: 배경음 음량이 0 이라 받지 않고 미뤄 둔 곡(음량을 올리면 그때 받아 튼다) */
  private current: { id: string; src: AudioBufferSourceNode | null; gain: GainNode | null; deferred?: boolean } | null = null;
  private wantedBgm: string | null = null;
  private bgmVol = 0.6;
  private sfxVol = 0.7;
  private unlocked = false;
  private failed = new Set<string>();
  private warned = false;
  private sfxCooldown = new Map<string, number>();

  constructor(
    private resolveBgm: (id: string) => AudioSource | null,
    private resolveSfx: (id: string) => AudioSource | null,
    private baseUrl: string,
  ) {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (!this.ctx) return;
        if (document.hidden) void this.ctx.suspend().catch(() => undefined);
        else if (this.unlocked) void this.ctx.resume().catch(() => undefined);
      });
    }
  }

  /** 사용자 입력 핸들러 안에서 호출 */
  unlock(): void {
    try {
      if (!this.ctx) {
        const AC: typeof AudioContext | undefined =
          (globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ??
          (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.bgmBus = this.ctx.createGain();
        this.sfxBus = this.ctx.createGain();
        this.bgmBus.gain.value = this.bgmVol;
        this.sfxBus.gain.value = this.sfxVol;
        this.bgmBus.connect(this.ctx.destination);
        this.sfxBus.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
      if (!this.unlocked) {
        this.unlocked = true;
        if (this.wantedBgm && (!this.current || this.current.id !== this.wantedBgm)) this.startBgm(this.wantedBgm);
      }
    } catch (e) {
      this.warn('오디오를 초기화하지 못했어요', e);
      this.ctx = null;
    }
  }

  get isUnlocked(): boolean {
    return this.unlocked && !!this.ctx;
  }

  setVolumes(bgm0to100: number, sfx0to100: number): void {
    this.bgmVol = curve(bgm0to100);
    this.sfxVol = curve(sfx0to100);
    if (this.ctx && this.bgmBus && this.sfxBus) {
      const t = this.ctx.currentTime;
      this.bgmBus.gain.setTargetAtTime(this.bgmVol, t, 0.05);
      this.sfxBus.gain.setTargetAtTime(this.sfxVol, t, 0.05);
    }
    // 음량 0 이라 미뤄 둔 곡: 음량을 올리면 이제 받아서 튼다
    if (this.bgmVol > 0 && this.current?.deferred && this.isUnlocked) {
      const id = this.current.id;
      this.current = null;
      this.startBgm(id);
    }
  }

  /** null = 정지 */
  playBgm(id: string | null): void {
    this.wantedBgm = id;
    if (!this.isUnlocked) return;
    if (this.current?.id === id) return;
    if (id === null) {
      this.stopCurrent(1.0);
      return;
    }
    this.startBgm(id);
  }

  playSfx(id: string): void {
    if (!this.isUnlocked || !this.ctx || !this.sfxBus) return;
    if (this.sfxVol === 0) return; // 들리지 않는 소리는 내려받지도 않는다
    const now = performance.now();
    if ((this.sfxCooldown.get(id) ?? 0) > now) return; // 빠른 연속 입력 시 겹침 방지
    this.sfxCooldown.set(id, now + 60);
    const src = this.resolveSfx(id);
    if (!src) return;
    void this.getBuffer(src.src).then((buf) => {
      if (!buf || !this.ctx || !this.sfxBus) return;
      try {
        const node = this.ctx.createBufferSource();
        node.buffer = buf;
        const g = this.ctx.createGain();
        g.gain.value = src.gain ?? 1;
        node.connect(g).connect(this.sfxBus);
        node.start();
      } catch (e) {
        this.warn('효과음 재생 실패', e);
      }
    });
  }

  /** 미리 불러오기(실패해도 무시) */
  preload(paths: string[]): void {
    if (!this.ctx) return;
    for (const p of paths) void this.getBuffer(p);
  }

  private startBgm(id: string) {
    const src = this.resolveBgm(id);
    this.stopCurrent(0.9);
    if (!src || !this.ctx) {
      this.current = { id, src: null, gain: null };
      return;
    }
    if (this.bgmVol === 0) {
      // 들리지 않으니 받지 않는다. 어떤 곡인지만 기억(같은 곡 재요청은 playBgm 이 걸러 준다)
      this.current = { id, src: null, gain: null, deferred: true };
      return;
    }
    const token = { id, src: null as AudioBufferSourceNode | null, gain: null as GainNode | null };
    this.current = token;
    void this.getBuffer(src.src).then((buf) => {
      if (!buf || !this.ctx || !this.bgmBus || this.current !== token) return;
      try {
        const node = this.ctx.createBufferSource();
        node.buffer = buf;
        node.loop = true;
        const g = this.ctx.createGain();
        const t = this.ctx.currentTime;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(src.gain ?? 1, t + 1.2);
        node.connect(g).connect(this.bgmBus);
        node.start();
        token.src = node;
        token.gain = g;
      } catch (e) {
        this.warn('음악 재생 실패', e);
      }
    });
  }

  private stopCurrent(fadeSec: number) {
    const cur = this.current;
    this.current = null;
    if (!cur || !cur.src || !cur.gain || !this.ctx) return;
    try {
      const t = this.ctx.currentTime;
      cur.gain.gain.cancelScheduledValues(t);
      cur.gain.gain.setValueAtTime(cur.gain.gain.value, t);
      cur.gain.gain.linearRampToValueAtTime(0, t + fadeSec);
      cur.src.stop(t + fadeSec + 0.05);
    } catch {
      /* 이미 정지됨 */
    }
  }

  private getBuffer(path: string): Promise<AudioBuffer | null> {
    if (this.failed.has(path)) return Promise.resolve(null);
    let p = this.buffers.get(path);
    if (!p) {
      p = (async () => {
        try {
          if (!this.ctx) return null;
          const res = await fetch(this.baseUrl + path);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.arrayBuffer();
          return await new Promise<AudioBuffer>((resolve, reject) => {
            // 구형 Safari 는 콜백형만 지원
            const r = this.ctx!.decodeAudioData(data, resolve, reject) as unknown;
            if (r && typeof (r as Promise<AudioBuffer>).then === 'function') (r as Promise<AudioBuffer>).then(resolve, reject);
          });
        } catch (e) {
          this.failed.add(path);
          this.warn(`오디오 파일을 불러오지 못했어요: ${path}`, e);
          return null;
        }
      })();
      this.buffers.set(path, p);
    }
    return p;
  }

  private warn(msg: string, e: unknown) {
    if (!this.warned) {
      console.warn(`[audio] ${msg}`, e);
      this.warned = true;
    }
  }
}

/** 0~100 → 0~1, 사람 귀에 맞춘 곡선 */
function curve(v: number): number {
  const x = Math.min(100, Math.max(0, v)) / 100;
  return x * x;
}
