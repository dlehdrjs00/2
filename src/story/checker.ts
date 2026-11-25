/** 스토리 검증기에 넘길 에셋 존재 확인기 (매니페스트 기준) */
import type { AssetChecker } from '../engine/validate';
import type { BgId, BgmId, CgId, CharId, Expr, Hair, Outfit, SfxId } from '../engine/types';
import { BACKGROUNDS, BGM, SFX, allSpritePaths, spritePath } from './assets';
import { SPEAKER_NAMES } from './config';
import { CGS, KEY_VISUAL } from './cg';

/**
 * 대본이 실제로 쓰는 에셋만 검사한다(validateStory 가 스텝·무대 상태마다 묻는다).
 * 히로인·의상·배경·CG 는 매니페스트(assets.ts SPRITE_SETS·BACKGROUNDS, cg.ts CGS)에 등록된 것만 받아들인다.
 */
export function manifestChecker(fileExists?: (publicPath: string) => boolean): AssetChecker {
  const ok = (p: string | undefined | null) => !!p && (!fileExists || fileExists(p));
  return {
    hasBg: (bg) => {
      const a = BACKGROUNDS[bg as BgId];
      if (!a) return false;
      // 썸네일(저장 칸 미니 무대용)이 매니페스트에 있으면 그 파일도 있어야 한다
      return a.src ? ok(a.src) && (!a.thumb || ok(a.thumb)) : !!a.color;
    },
    hasSprite: (char, outfit, hair, expr) => ok(spritePath(char as CharId, outfit as Outfit, hair as Hair, expr as Expr)),
    hasBgm: (id) => ok(BGM[id as BgmId]?.src),
    hasSfx: (id) => ok(SFX[id as SfxId]?.src),
    // 썸네일은 저장 칸·추억 앨범이 쓴다(히든 CG 도 관람 뒤 앨범에 나오므로 같이 검사)
    hasCg: (id) => {
      const a = CGS[id as CgId];
      return !!a && ok(a.src) && ok(a.thumb);
    },
    speakers: Object.keys(SPEAKER_NAMES),
  };
}

/**
 * 매니페스트에 등록된 모든 파일 경로(public/ 기준, 중복 없음).
 * 대본이 아직 쓰지 않는 표정·의상 조합, CG 썸네일, 키 비주얼까지 포함한다.
 */
export function manifestPaths(): string[] {
  const out = new Set<string>();
  const add = (p: string | undefined) => {
    if (p) out.add(p);
  };
  for (const a of Object.values(BACKGROUNDS)) {
    add(a.src);
    add(a.thumb);
  }
  for (const p of allSpritePaths()) add(p);
  for (const a of Object.values(CGS)) {
    add(a.src);
    add(a.thumb);
  }
  add(KEY_VISUAL.src);
  add(KEY_VISUAL.thumb);
  for (const a of Object.values(BGM)) add(a.src);
  for (const a of Object.values(SFX)) add(a.src);
  return [...out];
}

/** 매니페스트에 있는데 파일이 없는 경로(대본이 쓰는지와 상관없이 전부 검사) */
export function missingManifestFiles(fileExists: (publicPath: string) => boolean): string[] {
  return manifestPaths().filter((p) => !fileExists(p));
}
