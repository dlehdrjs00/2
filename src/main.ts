/// <reference types="vite/client" />
/**
 * 진입점: 스토리 데이터 + 에셋 매니페스트 + 설정을 엔진 UI 에 연결한다.
 */
import './ui/styles.css';
import type { BgId, BgmId, CharId, Expr, Hair, Outfit, SfxId } from './engine/types';
import { Game, type GameContent } from './ui/game';
import { openStore } from './engine/storage';
import { STORY } from './story';
import { BACKGROUNDS, BGM, SFX, SPRITE_SETS, allSpritePaths, spritePath } from './story/assets';
import { BUILD_LABEL, GAME_SUBTITLE, GAME_TITLE, NAMES, SPEAKER_NAMES, TEXT_VARS } from './story/config';

const BASE = import.meta.env.BASE_URL;
const url = (p: string) => BASE + p;

const content: GameContent = {
  story: STORY,
  vars: TEXT_VARS,
  speakerNames: SPEAKER_NAMES,
  heroineNames: { osana: NAMES.osana.given, tenko: NAMES.tenko.given },
  title: GAME_TITLE,
  subtitle: GAME_SUBTITLE,
  buildLabel: BUILD_LABEL,
  bgUrl: (id) => {
    const a = BACKGROUNDS[id as BgId];
    return a?.src ? url(a.src) : null;
  },
  bgColor: (id) => BACKGROUNDS[id as BgId]?.color ?? null,
  spriteUrl: (char, outfit, hair, expr) => {
    const p = spritePath(char, outfit as Outfit, hair as Hair, expr as Expr);
    return p ? url(p) : null;
  },
  bgmSrc: (id) => {
    const a = BGM[id as BgmId];
    return a ? { src: url(a.src), gain: a.gain } : null;
  },
  sfxSrc: (id) => {
    const a = SFX[id as SfxId];
    return a ? { src: url(a.src), gain: a.gain } : null;
  },
  hasBg: (id) => id in BACKGROUNDS,
  hasSprite: (char, outfit, hair, expr) => spritePath(char as CharId, outfit as Outfit, hair as Hair, expr as Expr) !== null,
  hasBgm: (id) => id in BGM,
  allImageUrls: () => [
    ...Object.values(BACKGROUNDS)
      .map((b) => b.src)
      .filter((s): s is string => !!s)
      .map(url),
    ...allSpritePaths().map(url),
  ],
  titleSprites: [
    { char: 'osana', outfit: 'uniform', hair: 'default', expr: 'smile' },
    { char: 'tenko', outfit: 'uniform', hair: 'default', expr: 'smile' },
  ],
  usesPlaceholders:
    Object.values(SPRITE_SETS).some((s) => s.placeholder) ||
    Object.values(BACKGROUNDS).some((b) => b.placeholder) ||
    Object.values(BGM).some((b) => b.placeholder),
};

const mount = document.getElementById('app')!;
const game = new Game(mount, content, openStore());
game.start();

if (new URLSearchParams(location.search).has('debug')) {
  (window as unknown as { __vn: unknown }).__vn = { info: () => game.debugInfo() };
}
