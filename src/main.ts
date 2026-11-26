/// <reference types="vite/client" />
/**
 * 진입점: 스토리 데이터 + 에셋 매니페스트 + 설정을 엔진 UI 에 연결한다.
 */
import './ui/styles.css';
import type { BgId, BgmId, CharId, Expr, Hair, HeroineId, Outfit, SfxId } from './engine/types';
import { HIDDEN_HEROINES } from './engine/types';
import { Game, type GameContent } from './ui/game';
import { openStore } from './engine/storage';
import { STORY } from './story';
import { BACKGROUNDS, BGM, SFX, SPRITE_SETS, allSpritePaths, spriteFile, spritePath } from './story/assets';
import { CGS, CG_ORDER, ENDING_CG, KEY_VISUAL } from './story/cg';
import { BUILD_LABEL, GAME_SUBTITLE, GAME_TITLE, NAMES, SPEAKER_NAMES, TEXT_VARS } from './story/config';

const BASE = import.meta.env.BASE_URL;
const url = (p: string) => BASE + p;

/**
 * 히든 히로인 전용 배경의 id 접두(에셋 계약: 코하루 전용 배경·CG 는 'kh_'). 그 인물 스프라이트와 함께
 * 해금되지 않은 플레이·타이틀의 '게임 전체 그림' 미리 받기에서 뺀다(hiddenImageUrls 로 해금 뒤에만 받는다)
 */
const HIDDEN_BG_PREFIX: Partial<Record<HeroineId, string>> = { koharu: 'kh_' };

/** 그 히든 히로인 전용 그림(public/ 기준 경로): 스프라이트 전부 + 전용 배경 */
function hiddenImagePaths(h: HeroineId): string[] {
  const out: string[] = [];
  const set = SPRITE_SETS[h];
  if (set) for (const look of set.looks) for (const e of set.expressions) out.push(spriteFile(set, look.outfit, look.hair, e));
  const prefix = HIDDEN_BG_PREFIX[h];
  if (prefix) {
    for (const [id, b] of Object.entries(BACKGROUNDS)) if (id.startsWith(prefix) && b.src) out.push(b.src);
  }
  return out;
}
const HIDDEN_PATHS = new Set(HIDDEN_HEROINES.flatMap(hiddenImagePaths));

const content: GameContent = {
  story: STORY,
  vars: TEXT_VARS,
  speakerNames: SPEAKER_NAMES,
  heroineNames: { osana: NAMES.osana.given, tenko: NAMES.tenko.given, koharu: NAMES.koharu.given },
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
  // 미리 불러오기 전체 목록. 타이틀 배경(title)은 키 비주얼이 있으면 어디에도 쓰이지 않으므로 받지 않는다.
  // 히든 히로인 전용 그림은 빼고(해금 전 플레이·타이틀에서 받지 않음), 해금된 플레이에서 hiddenImageUrls 로 더한다
  allImageUrls: () =>
    [
      ...Object.entries(BACKGROUNDS)
        .filter(([id]) => !(id === 'title' && KEY_VISUAL.src))
        .map(([, b]) => b.src)
        .filter((s): s is string => !!s),
      ...allSpritePaths(),
    ]
      .filter((p) => !HIDDEN_PATHS.has(p))
      .map(url),
  hiddenImageUrls: (h) => hiddenImagePaths(h).map(url),
  cgUrl: (id) => {
    const a = (CGS as Record<string, { src: string } | undefined>)[id];
    return a ? url(a.src) : null;
  },
  cgThumbUrl: (id) => {
    const a = (CGS as Record<string, { thumb: string } | undefined>)[id];
    return a ? url(a.thumb) : null;
  },
  endingCg: (ending) => ENDING_CG[ending] ?? null,
  // 추억 앨범: CG_ORDER 순서, 제목·루트·hidden 은 매니페스트(CGS) 그대로(hidden 은 본 뒤에만 앨범에 보인다)
  cgCatalog: CG_ORDER.map((id) => ({ id, title: CGS[id].title, route: CGS[id].route, hidden: CGS[id].hidden === true })),
  // 타이틀: 두 히로인이 함께 그려진 키 비주얼(없으면 배경 + 스프라이트 두 장). 히든 히로인은 타이틀에 넣지 않는다
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
