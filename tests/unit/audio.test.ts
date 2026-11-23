/**
 * 오디오 관리자: 음량 0 이면 음악·효과음 파일을 내려받지 않는다(느린 모바일 망에서 그림과 대역폭을 다투지 않게).
 * Web Audio 는 Node 에 없으므로 필요한 만큼만 흉내 낸 가짜 AudioContext 와 fetch 로 확인한다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioManager } from '../../src/engine/audio';

class FakeParam {
  value = 1;
  setTargetAtTime(v: number) {
    this.value = v;
  }
  setValueAtTime(v: number) {
    this.value = v;
  }
  linearRampToValueAtTime(v: number) {
    this.value = v;
  }
  cancelScheduledValues() {}
}

class FakeNode {
  gain = new FakeParam();
  buffer: unknown = null;
  loop = false;
  connect<T>(n: T): T {
    return n;
  }
  start() {
    started.push(this);
  }
  stop() {}
}

let started: FakeNode[] = [];

class FakeAudioContext {
  state = 'running';
  currentTime = 0;
  destination = {};
  createGain() {
    return new FakeNode();
  }
  createBufferSource() {
    return new FakeNode();
  }
  resume() {
    return Promise.resolve();
  }
  suspend() {
    return Promise.resolve();
  }
  decodeAudioData(_data: ArrayBuffer, ok: (b: unknown) => void) {
    const buf = { duration: 1 };
    ok(buf);
    return Promise.resolve(buf);
  }
}

const BGM: Record<string, string> = { daily: 'bgm_daily.mp3', heart: 'bgm_heart.mp3' };
const SFX: Record<string, string> = { bell: 'sfx_bell.mp3', door: 'sfx_door.mp3' };

let fetched: string[] = [];

function make(bgmVol: number, sfxVol: number) {
  const a = new AudioManager(
    (id) => (BGM[id] ? { src: BGM[id] } : null),
    (id) => (SFX[id] ? { src: SFX[id] } : null),
    '',
  );
  a.setVolumes(bgmVol, sfxVol);
  a.unlock();
  return a;
}

/** 내려받기·디코딩(프로미스 몇 단계)이 끝나기를 기다린다 */
const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

beforeEach(() => {
  fetched = [];
  started = [];
  vi.stubGlobal('AudioContext', FakeAudioContext);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      fetched.push(url);
      return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(8) };
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('오디오: 음량 0 이면 내려받지 않는다', () => {
  it('배경음·효과음 음량이 0 이면 곡과 효과음 파일을 하나도 받지 않는다', async () => {
    const a = make(0, 0);
    expect(a.isUnlocked).toBe(true);
    a.playBgm('daily');
    a.playSfx('bell');
    a.playSfx('door');
    a.playBgm('heart');
    await flush();
    expect(fetched).toEqual([]);
    expect(started).toHaveLength(0);
  });

  it('배경음 음량을 0 에서 올리면 그때 지금 틀어야 할 곡만 받아서 튼다', async () => {
    const a = make(0, 70);
    a.playBgm('daily');
    a.playBgm('heart'); // 음량 0 인 동안 곡이 바뀌어도 받지 않는다
    await flush();
    expect(fetched).toEqual([]);
    a.setVolumes(50, 70);
    await flush();
    expect(fetched).toEqual(['bgm_heart.mp3']);
    expect(started).toHaveLength(1);
    expect(started[0].loop).toBe(true);
    // 다시 같은 곡을 요청해도 새로 받거나 겹쳐 틀지 않는다
    a.playBgm('heart');
    a.setVolumes(60, 70);
    await flush();
    expect(fetched).toEqual(['bgm_heart.mp3']);
    expect(started).toHaveLength(1);
  });

  it('음량 0 인 동안 음악이 멈추면(null) 음량을 올려도 아무것도 받지 않는다', async () => {
    const a = make(0, 0);
    a.playBgm('daily');
    a.playBgm(null);
    a.setVolumes(80, 80);
    await flush();
    expect(fetched).toEqual([]);
  });

  it('음량이 있으면 평소처럼 받는다(효과음 음량 0 은 효과음만 막는다)', async () => {
    const a = make(60, 0);
    a.playBgm('daily');
    a.playSfx('bell');
    await flush();
    expect(fetched).toEqual(['bgm_daily.mp3']);
    a.setVolumes(60, 40);
    a.playSfx('bell');
    await flush();
    expect(fetched).toEqual(['bgm_daily.mp3', 'sfx_bell.mp3']);
  });

  it('잠금 해제(첫 입력) 전에 요청한 곡도 음량 0 이면 해제 시점에 받지 않는다', async () => {
    const a = new AudioManager(
      (id) => (BGM[id] ? { src: BGM[id] } : null),
      (id) => (SFX[id] ? { src: SFX[id] } : null),
      '',
    );
    a.setVolumes(0, 0);
    a.playBgm('daily');
    a.unlock();
    await flush();
    expect(fetched).toEqual([]);
    a.setVolumes(30, 0);
    await flush();
    expect(fetched).toEqual(['bgm_daily.mp3']);
  });
});
