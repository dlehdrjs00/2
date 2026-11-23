/** 사용자 설정 (브라우저 로컬 저장소) */
import type { KeyValueStore } from './storage';
import { KEY_PREFIX } from './save';

export interface Settings {
  /** 글자 표시 속도 1~10 (10 = 즉시) */
  textSpeed: number;
  /** 자동 진행 속도 1~10 (클수록 빠름) */
  autoSpeed: number;
  /** 음량 0~100 */
  bgmVolume: number;
  sfxVolume: number;
  /** 대사창 불투명도 30~100 */
  windowOpacity: number;
}

export const DEFAULT_SETTINGS: Settings = {
  textSpeed: 6,
  autoSpeed: 5,
  bgmVolume: 60,
  sfxVolume: 70,
  windowOpacity: 82,
};

const RANGES: Record<keyof Settings, [number, number]> = {
  textSpeed: [1, 10],
  autoSpeed: [1, 10],
  bgmVolume: [0, 100],
  sfxVolume: [0, 100],
  windowOpacity: [30, 100],
};

const KEY = `${KEY_PREFIX}settings`;

export function sanitizeSettings(v: unknown): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS };
  if (typeof v !== 'object' || v === null) return out;
  for (const k of Object.keys(RANGES) as (keyof Settings)[]) {
    const n = Number((v as Record<string, unknown>)[k]);
    if (Number.isFinite(n)) {
      const [lo, hi] = RANGES[k];
      out[k] = Math.round(Math.min(hi, Math.max(lo, n)));
    }
  }
  return out;
}

export function loadSettings(store: KeyValueStore): Settings {
  const raw = store.get(KEY);
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    return sanitizeSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(store: KeyValueStore, s: Settings): void {
  store.set(KEY, JSON.stringify({ schema: 1, ...s }));
}

/** 초당 글자 수. Infinity = 즉시 표시 */
export function charsPerSecond(level: number): number {
  const table = [10, 16, 22, 30, 38, 48, 60, 78, 110, Infinity];
  return table[Math.min(10, Math.max(1, level)) - 1];
}

/** 자동 진행 대기 시간(ms): 문장 길이에 비례 */
export function autoDelayMs(level: number, textLength: number): number {
  const l = Math.min(10, Math.max(1, level));
  const base = 1700 - l * 110; // 1590 ~ 600
  const perChar = 62 - l * 4.5; // 57.5 ~ 17
  return Math.round(base + perChar * textLength);
}
