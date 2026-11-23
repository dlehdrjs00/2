/** 스토리 검증기에 넘길 에셋 존재 확인기 (매니페스트 기준) */
import type { AssetChecker } from '../engine/validate';
import type { BgId, BgmId, CharId, Expr, Hair, Outfit, SfxId } from '../engine/types';
import { BACKGROUNDS, BGM, SFX, spritePath } from './assets';
import { SPEAKER_NAMES } from './config';

export function manifestChecker(fileExists?: (publicPath: string) => boolean): AssetChecker {
  const ok = (p: string | undefined | null) => !!p && (!fileExists || fileExists(p));
  return {
    hasBg: (bg) => {
      const a = BACKGROUNDS[bg as BgId];
      if (!a) return false;
      return a.src ? ok(a.src) : !!a.color;
    },
    hasSprite: (char, outfit, hair, expr) => ok(spritePath(char as CharId, outfit as Outfit, hair as Hair, expr as Expr)),
    hasBgm: (id) => ok(BGM[id as BgmId]?.src),
    hasSfx: (id) => ok(SFX[id as SfxId]?.src),
    speakers: Object.keys(SPEAKER_NAMES),
  };
}
