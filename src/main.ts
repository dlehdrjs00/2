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
import { CGS, CG_ORDER, ENDING_CG, KEY_VISUAL } from './story/cg';
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
  bgThumbUrl: (id) => {
    const a = BACKGROUNDS[id as BgId];
    return a?.thumb ? url(a.thumb) : null;
  },
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
  // 미리 불러오기 전체 목록. 타이틀 배경(title)은 키 비주얼이 있으면 어디에도 쓰이지 않으므로 받지 않는다
  allImageUrls: () => [
    ...Object.entries(BACKGROUNDS)
      .filter(([id]) => !(id === 'title' && KEY_VISUAL.src))
      .map(([, b]) => b.src)
      .filter((s): s is string => !!s)
      .map(url),
    ...allSpritePaths().map(url),
  ],
  cgUrl: (id) => {
    const a = (CGS as Record<string, { src: string } | undefined>)[id];
    return a ? url(a.src) : null;
  },
  cgThumbUrl: (id) => {
    const a = (CGS as Record<string, { thumb: string } | undefined>)[id];
    return a ? url(a.thumb) : null;
  },
  endingCg: (heroine) => ENDING_CG[heroine] ?? null,
  // 추억 앨범: CG_ORDER 순서, 제목·루트는 매니페스트(CGS) 그대로
  cgCatalog: CG_ORDER.map((id) => ({ id, title: CGS[id].title, route: CGS[id].route })),
  // 타이틀: 두 히로인이 함께 그려진 키 비주얼(없으면 배경 + 스프라이트 두 장)
  titleVisual: KEY_VISUAL.src ? url(KEY_VISUAL.src) : null,
  titleVisualThumb: KEY_VISUAL.thumb ? url(KEY_VISUAL.thumb) : null,
  titleSprites: [
    { char: 'osana', outfit: 'uniform', hair: 'default', expr: 'smile' },
    { char: 'tenko', outfit: 'uniform', hair: 'default', expr: 'smile' },
  ],
  placeholderNote: placeholderNote(),
};

/** 타이틀 버전 알약에 붙일 '아직 임시인 것' 안내. 최종 에셋으로 바꾸면(placeholder: false) 자동으로 빠진다 */
function placeholderNote(): string | null {
  const parts: string[] = [];
  if (Object.values(SPRITE_SETS).some((s) => s.placeholder)) parts.push('인물');
  if (Object.values(CGS).some((c) => c.placeholder)) parts.push('CG');
  if (Object.values(BACKGROUNDS).some((b) => b.placeholder)) parts.push('배경');
  if ([...Object.values(BGM), ...Object.values(SFX)].some((a) => a.placeholder)) parts.push('음악');
  return parts.length ? `임시 ${parts.join('·')}` : null;
}

const mount = document.getElementById('app')!;
const game = new Game(mount, content, openStore());
game.start();

if (new URLSearchParams(location.search).has('debug')) {
  (window as unknown as { __vn: unknown }).__vn = { info: () => game.debugInfo() };
}
