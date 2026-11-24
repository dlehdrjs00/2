/**
 * 에셋 목록 문서 생성: 매니페스트 → docs/ASSETS.md
 *   npm run export-assets   (npm run docs 가 대본 문서와 함께 부른다)
 *
 * 출력 내용
 *  - 분류별 상태(최종/임시), 파일 존재 여부·크기·픽셀 크기(WebP 머리글·SVG viewBox 를 직접 읽음)
 *  - 이벤트 CG: src/story/cg.ts 의 CGS·KEY_VISUAL·ENDING_CG 와, 대본에서 CG 가 떠 있는 구간
 *  - 스프라이트 배치 규칙: src/ui/styles/play.css·screens.css·src/ui/stage.ts 의 실제 값을 생성할 때 읽고,
 *    대사창이 덮는 범위는 src/ui/layout.ts computeLayout 으로 계산한다(문서에 숫자를 손으로 적지 않는다)
 *  - 배경 사양(최종 WebP·썸네일·레터박스), 남은 임시 에셋(음악·효과음)의 교체 사양, scripts/import-art.py 사용법(옵션은 스크립트에서 읽음)
 *  - 문장 속 상태(최종/임시)는 매니페스트의 placeholder 로 정한다(배경을 다시 임시로 돌리면 문장도 따라 바뀐다)
 */
import { closeSync, existsSync, openSync, readFileSync, readSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BACKGROUNDS, BGM, SFX, SPRITE_SETS, spriteFile } from '../src/story/assets';
import { CGS, CG_ORDER, ENDING_CG, KEY_VISUAL } from '../src/story/cg';
import { NAMES, TEXT_VARS } from '../src/story/config';
import { STORY, SCENE_ORDER } from '../src/story';
import { resolveText } from '../src/engine/text';
import { computeLayout } from '../src/ui/layout';
import { TEXT_SCALES } from '../src/engine/settings';
import type { CgId, Step } from '../src/engine/types';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out: string[] = [];
const w = (s = '') => out.push(s);
const t = (s: string) => resolveText(s, TEXT_VARS);
const H = { osana: NAMES.osana.given, tenko: NAMES.tenko.given } as const;
const EXPR_KO: Record<string, string> = { neutral: '기본', smile: '웃음', fluster: '당황', shy: '부끄러움', pout: '삐짐', sad: '쓸쓸' };
const TONE_KO: Record<string, string> = { day: '낮', evening: '노을', night: '밤' };
const FINAL = '🟢 최종';
const TEMP = '🟡 임시';

// ---------------------------------------------------------------------------
// 파일 정보
// ---------------------------------------------------------------------------

const pub = (p: string) => resolve(root, 'public', p);

function kbText(bytes: number): string {
  const kb = bytes / 1024;
  if (kb >= 1024) return `${(kb / 1024).toFixed(2)}MB`;
  return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)}KB`;
}

function head(abs: string, n: number): Buffer {
  const fd = openSync(abs, 'r');
  try {
    const b = Buffer.alloc(n);
    const len = readSync(fd, b, 0, n, 0);
    return b.subarray(0, len);
  } finally {
    closeSync(fd);
  }
}

/** WebP 머리글(VP8X / VP8L / VP8)에서 픽셀 크기를 읽는다 */
function webpSize(b: Buffer): [number, number] | null {
  if (b.length < 30 || b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') return null;
  const cc = b.toString('ascii', 12, 16);
  if (cc === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  if (cc === 'VP8L') {
    const v = b.readUInt32LE(21);
    return [1 + (v & 0x3fff), 1 + ((v >>> 14) & 0x3fff)];
  }
  if (cc === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  return null;
}

/** SVG 의 viewBox 크기 */
function svgSize(b: Buffer): [number, number] | null {
  const m = /viewBox="\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)\s*"/.exec(b.toString('utf8'));
  return m ? [Number(m[1]), Number(m[2])] : null;
}

interface FileInfo {
  ok: boolean;
  mark: string;
  bytes: number;
  size: string;
  dim: string;
}

function fileInfo(p?: string): FileInfo {
  if (!p) return { ok: false, mark: '—', bytes: 0, size: '', dim: '' };
  const abs = pub(p);
  if (!existsSync(abs)) return { ok: false, mark: '❌ 없음', bytes: 0, size: '', dim: '' };
  const bytes = statSync(abs).size;
  let d: [number, number] | null = null;
  if (p.endsWith('.webp')) d = webpSize(head(abs, 32));
  else if (p.endsWith('.svg')) d = svgSize(head(abs, 600));
  return { ok: true, mark: '✅', bytes, size: kbText(bytes), dim: d ? `${d[0]}×${d[1]}${p.endsWith('.svg') ? ' (viewBox)' : ''}` : '' };
}

function dirBytes(abs: string): { n: number; bytes: number } {
  let n = 0;
  let bytes = 0;
  if (!existsSync(abs)) return { n, bytes };
  for (const e of readdirSync(abs, { withFileTypes: true })) {
    const p = join(abs, e.name);
    if (e.isDirectory()) {
      const r = dirBytes(p);
      n += r.n;
      bytes += r.bytes;
    } else if (e.isFile()) {
      n += 1;
      bytes += statSync(p).size;
    }
  }
  return { n, bytes };
}

// ---------------------------------------------------------------------------
// 소스에서 실제 값 읽기(배치 규칙·import-art 옵션)
// ---------------------------------------------------------------------------

function src(rel: string): string {
  return readFileSync(resolve(root, rel), 'utf8');
}

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split('\n').length;
}

/** CSS 사용자 정의 속성의 모든 선언(첫 번째가 기본값) */
function cssVarDecls(css: string, name: string): Array<{ value: string; line: number }> {
  const re = new RegExp(`${name.replace(/[-]/g, '\\-')}\\s*:\\s*([^;]+);`, 'g');
  const found: Array<{ value: string; line: number }> = [];
  for (let m = re.exec(css); m; m = re.exec(css)) found.push({ value: m[1].trim(), line: lineOf(css, m.index) });
  return found;
}

/** 선택자 블록 안의 속성 값 */
function cssProp(css: string, selector: string, prop: string): string | null {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?:^|[\\s,}])${esc}\\s*(?:,[^{]*)?\\{([^}]*)\\}`, 'm');
  const m = re.exec(css);
  if (!m) return null;
  const p = new RegExp(`(?:^|[;{\\s])${prop}\\s*:\\s*([^;]+);`).exec(m[1]);
  return p ? p[1].trim() : null;
}

const pct = (v: string | null): number => {
  const m = v ? /^(-?[\d.]+)%$/.exec(v) : null;
  if (!m) throw new Error(`퍼센트 값을 읽지 못함: ${v}`);
  return Number(m[1]);
};
const fx = (n: number, d = 1) => (Math.round(n * 10 ** d) / 10 ** d).toFixed(d).replace(/\.0+$/, '');

const playCss = src('src/ui/styles/play.css');
const screensCss = src('src/ui/styles/screens.css');
const stageTs = src('src/ui/stage.ts');

const charBottomDecls = cssVarDecls(playCss, '--char-bottom');
const charHeightDecls = cssVarDecls(playCss, '--char-height');
if (!charBottomDecls.length || !charHeightDecls.length) throw new Error('play.css 에서 --char-bottom / --char-height 를 찾지 못함');
const charBottom = pct(charBottomDecls[0].value);
const charHeight = pct(charHeightDecls[0].value);
const posLeft = {
  left: cssProp(playCss, '.char.pos-left', 'left'),
  center: cssProp(playCss, '.char.pos-center', 'left'),
  right: cssProp(playCss, '.char.pos-right', 'left'),
};
const enterTranslate = cssProp(playCss, '.char.entering', 'translate');
const thumbBottom = cssProp(screensCss, '.slot-thumb img', 'bottom');
const thumbHeight = cssProp(screensCss, '.slot-thumb img', 'height');
const durMatch = /const DUR = \{([^}]*)\}/.exec(stageTs);
const DUR: Record<string, number> = {};
if (durMatch) for (const m of durMatch[1].matchAll(/(\w+):\s*(\d+)/g)) DUR[m[1]] = Number(m[2]);

// import-art.py
const importPy = src('scripts/import-art.py');
/** 모듈 최상위 상수(`A = 1`, `A, B = 1, 2` 꼴)를 이름 → 값 문자열로 */
const PY_CONSTS = new Map<string, string>();
for (const m of importPy.matchAll(/^([A-Z][A-Z0-9_]*(?:\s*,\s*[A-Z][A-Z0-9_]*)*)\s*=\s*([^#\n]+)/gm)) {
  const names = m[1].split(',').map((x) => x.trim());
  const values = names.length > 1 ? m[2].split(',').map((x) => x.trim()) : [m[2].trim()];
  names.forEach((n, i) => values[i] !== undefined && PY_CONSTS.set(n, values[i]));
}
const pyConst = (name: string): string => {
  const v = PY_CONSTS.get(name);
  if (v === undefined) throw new Error(`scripts/import-art.py 에서 ${name} 를 찾지 못함`);
  return v;
};
/** 게임에 넣는 스프라이트 저장 크기(작업 캔버스 2:3 을 SPRITE_OUT_H 로 같은 비율 축소) */
const SPRITE_OUT = (() => {
  const w = Number(pyConst('SPRITE_W'));
  const h = Number(pyConst('SPRITE_H'));
  const oh = Math.min(Number(pyConst('SPRITE_OUT_H')), h);
  return { w: Math.round((w * oh) / h), h: oh };
})();
const pyCgIds = [...(/CG_IDS\s*=\s*\(([^)]*)\)/s.exec(importPy)?.[1] ?? '').matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]);
/** 호출 인자 문자열에서 키워드 인자 값(괄호 안 쉼표는 건너뜀) */
function pyArg(args: string, key: string): string | null {
  const i = args.search(new RegExp(`\\b${key}=`));
  if (i < 0) return null;
  let depth = 0;
  let j = i + key.length + 1;
  const start = j;
  for (; j < args.length; j++) {
    const ch = args[j];
    if (ch === '(') depth++;
    else if (ch === ')') {
      if (depth === 0) break;
      depth--;
    } else if (ch === ',' && depth === 0) break;
  }
  return args.slice(start, j).trim();
}
const pyOptions: Array<{ flags: string[]; help: string }> = [];
for (const m of importPy.matchAll(/ap\.add_argument\(([^\n]*)\)\s*$/gm)) {
  const args = m[1];
  const flags = [...args.matchAll(/'(-{1,2}[\w-]+)'/g)].map((x) => x[1]);
  let help = (/help=f?'([^']*)'/.exec(args)?.[1] ?? '').replace('{DEFAULT_SRC}', 'art-inbox/').replace('{DEFAULT_OUT}', 'public/assets/').replace('{SPRITE_QUALITY}', pyConst('SPRITE_QUALITY'));
  const choices = /choices=\(([^)]*)\)/.exec(args)?.[1];
  if (choices) help += ` — ${[...choices.matchAll(/'([^']+)'/g)].map((x) => `\`${x[1]}\``).join(' 또는 ')}`;
  const def = pyArg(args, 'default');
  if (def && !help.includes('기본')) help += ` (기본 \`${def.replace(/os\.cpu_count\(\) or 1/, 'CPU 수')}\`)`;
  pyOptions.push({ flags, help });
}

const aspect = SPRITE_SETS.osana.aspect;
const spriteTop = 100 - charBottom - charHeight; // 무대 위끝에서 그림 위끝까지(무대 높이 %)
const hiddenBelow = Math.max(0, -charBottom) / charHeight; // 그림 중 무대 아래로 잘리는 비율
const spriteWidthOfStageW = (charHeight * aspect * 9) / 16; // 무대 폭 대비 %
const HEAD_MARGIN = Number(pyConst('HEAD_MARGIN')) * 100; // import-art.py HEAD_MARGIN(머리 위 여백 비율)
const headTop = spriteTop + (charHeight * HEAD_MARGIN) / 100;

// ---------------------------------------------------------------------------
// 대본에서 쓰는 에셋 · CG 표시 구간
// ---------------------------------------------------------------------------

const used = { bg: new Set<string>(), bgm: new Set<string>(), sfx: new Set<string>() };
for (const s of Object.values(STORY.scenes)) {
  for (const st of s.steps as Step[]) {
    if (st.t === 'bg') used.bg.add(st.bg);
    if (st.t === 'bgm' && st.track) used.bgm.add(st.track);
    if (st.t === 'sfx') used.sfx.add(st.sound);
  }
}
const storyBgCount = [...used.bg].filter((id) => BACKGROUNDS[id as keyof typeof BACKGROUNDS]?.src).length;

interface CgUse {
  scene: string;
  sceneTitle: string;
  first: string | null;
  last: string | null;
  lines: number;
  until: string;
}
const cgUses = new Map<CgId, CgUse[]>();
for (const id of SCENE_ORDER) {
  const s = STORY.scenes[id];
  s.steps.forEach((st, i) => {
    if (st.t !== 'cg' || !st.cg) return;
    const u: CgUse = { scene: s.id, sceneTitle: t(s.title), first: null, last: null, lines: 0, until: '장면 끝' };
    for (let j = i + 1; j < s.steps.length; j++) {
      const n = s.steps[j];
      if (n.t === 'say' || n.t === 'card') {
        u.first ??= n.id;
        u.last = n.id;
        u.lines += 1;
        continue;
      }
      if (n.t === 'cg') {
        u.until = n.cg ? `다음 CG(\`${n.cg}\`)로 교체` : 'CG 걷기 명령';
        break;
      }
      if (n.t === 'bg') {
        u.until = '배경 전환(자동으로 걷힘)';
        break;
      }
      if (n.t === 'goto') {
        u.until = `\`${n.to}\` 로 이동 뒤 걷힘`;
        break;
      }
      if (n.t === 'jump') {
        u.until = `다음 장면 \`${n.scene}\` 의 배경 전환`;
        break;
      }
      if (n.t === 'ending') {
        u.until = '엔딩';
        break;
      }
    }
    const list = cgUses.get(st.cg) ?? [];
    list.push(u);
    cgUses.set(st.cg, list);
  });
}

// ---------------------------------------------------------------------------
// 대사창이 덮는 범위(src/ui/layout.ts)
// ---------------------------------------------------------------------------

const VIEWPORTS: Array<[string, number, number]> = [
  ['데스크톱 1920×1080', 1920, 1080],
  ['데스크톱 1280×720 (E2E desktop)', 1280, 720],
  ['휴대폰 가로 844×390 (E2E phone-landscape)', 844, 390],
  ['휴대폰 가로 667×375 (E2E phone-se-landscape)', 667, 375],
];
const maxScale = TEXT_SCALES[TEXT_SCALES.length - 1];
function cover(vw: number, vh: number, scale: number) {
  const L = computeLayout(vw, vh, { t: 0, r: 0, b: 0, l: 0 }, { textScale: scale });
  const bottom = L.sy + L.sh;
  return {
    stage: `${Math.round(L.sw)}×${Math.round(L.sh)}`,
    box: ((bottom - L.ty) / L.sh) * 100,
    band: ((bottom - L.hy) / L.sh) * 100,
  };
}
/** 무대 위에서 y% 지점이 스프라이트 캔버스의 몇 % 높이인가 */
const toSpriteY = (stageY: number) => ((stageY - spriteTop) / charHeight) * 100;
const worst = Math.max(...VIEWPORTS.map(([, vw, vh]) => cover(vw, vh, maxScale).band));
const worstDefault = Math.max(...VIEWPORTS.map(([, vw, vh]) => cover(vw, vh, 1).band));

// ---------------------------------------------------------------------------
// 집계
// ---------------------------------------------------------------------------

const spriteFiles = Object.values(SPRITE_SETS).flatMap((set) => set.looks.flatMap((l) => set.expressions.map((e) => spriteFile(set, l.outfit, l.hair, e))));
const sum = (ps: string[]) => ps.map((p) => fileInfo(p)).reduce((a, f) => ({ n: a.n + (f.ok ? 1 : 0), bytes: a.bytes + f.bytes }), { n: 0, bytes: 0 });
const status = (flags: boolean[]) => (flags.every((p) => !p) ? FINAL : flags.every((p) => p) ? TEMP : '🟠 일부 임시');
const bgEntries = Object.entries(BACKGROUNDS).filter(([, a]) => a.src);
const bgFinal = bgEntries.every(([, a]) => !a.placeholder);
const bgThumbs = bgEntries.map(([, a]) => a.thumb).filter((p): p is string => !!p);
/** 배경 파일이 든 폴더(매니페스트의 src·thumb 경로에서) */
const bgDirs = [...new Set([...bgEntries.map(([, a]) => a.src!), ...bgThumbs].map((p) => p.slice(0, p.lastIndexOf('/') + 1)))];
const cgList = CG_ORDER.map((id) => CGS[id]);

const rows = [
  {
    kind: '캐릭터 스프라이트',
    count: `${spriteFiles.length}장 (${Object.entries(SPRITE_SETS).map(([c, s]) => `${H[c as 'osana' | 'tenko']} ${s.looks.length * s.expressions.length}`).join(' · ')})`,
    st: status(Object.values(SPRITE_SETS).map((s) => s.placeholder)),
    what: '사용자가 준 최종 일러스트 → WebP 변환',
    where: Object.values(SPRITE_SETS).map((s) => `\`public/${s.dir}/\``).join(' '),
    total: sum(spriteFiles),
  },
  {
    kind: '이벤트 CG',
    count: `${cgList.length}장 + 썸네일 ${cgList.length}장`,
    st: status(cgList.map((c) => c.placeholder)),
    what: '사용자가 준 최종 일러스트 → WebP 변환',
    where: '`public/assets/cg/`, `public/assets/cg/thumb/`',
    total: sum(cgList.flatMap((c) => [c.src, c.thumb])),
  },
  {
    kind: '타이틀 키 비주얼',
    count: '1장 + 썸네일 1장',
    st: status([KEY_VISUAL.placeholder]),
    what: '사용자가 준 최종 일러스트 → WebP 변환',
    where: `\`public/${KEY_VISUAL.src}\``,
    total: sum([KEY_VISUAL.src, KEY_VISUAL.thumb]),
  },
  {
    kind: '배경',
    count: `${bgEntries.length}종 (대본 ${storyBgCount} + 타이틀 대체 1)${bgThumbs.length ? ` + 썸네일 ${bgThumbs.length}장` : ''} + 단색 1`,
    st: status(bgEntries.map(([, a]) => a.placeholder)),
    what: bgFinal
      ? '사용자가 준 상세 배경 WebP(이미지 생성 도구로 제작, 기록 `docs/BACKGROUND_PROMPTS.md`)'
      : '코드로 그린 임시 SVG(`scripts/art/backgrounds.mjs`)',
    where: bgDirs.map((d) => `\`public/${d}\``).join(', '),
    total: sum([...bgEntries.map(([, a]) => a.src!), ...bgThumbs]),
  },
  {
    kind: '음악(BGM)',
    count: `${Object.keys(BGM).length}곡`,
    st: status(Object.values(BGM).map((a) => a.placeholder)),
    what: '코드로 합성한 임시 음원(`scripts/gen-placeholder-audio.mjs`)',
    where: '`public/assets/placeholder/audio/bgm_*.mp3`',
    total: sum(Object.values(BGM).map((a) => a.src)),
  },
  {
    kind: '효과음(SFX)',
    count: `${Object.keys(SFX).length}종`,
    st: status(Object.values(SFX).map((a) => a.placeholder)),
    what: '코드로 합성한 임시 음원(`scripts/gen-placeholder-audio.mjs`)',
    where: '`public/assets/placeholder/audio/sfx_*.mp3`',
    total: sum(Object.values(SFX).map((a) => a.src)),
  },
];

/** src/main.ts placeholderNote() 와 같은 규칙(타이틀 버전 알약 뒤에 붙는 안내) */
function placeholderNote(): string | null {
  const parts: string[] = [];
  if (Object.values(SPRITE_SETS).some((s) => s.placeholder)) parts.push('인물');
  if (Object.values(CGS).some((c) => c.placeholder)) parts.push('CG');
  if (Object.values(BACKGROUNDS).some((b) => b.placeholder)) parts.push('배경');
  if ([...Object.values(BGM), ...Object.values(SFX)].some((a) => a.placeholder)) parts.push('음악');
  return parts.length ? `임시 ${parts.join('·')}` : null;
}

// ===========================================================================
// 문서
// ===========================================================================

w('# 에셋 목록과 교체 규격');
w();
w('> `npm run export-assets`(또는 `npm run docs`)로 자동 생성한다. 직접 고치지 말고 `scripts/export-assets.ts` 나 매니페스트(`src/story/assets.ts`, `src/story/cg.ts`)를 고친 뒤 다시 생성할 것.');
w('> 파일 존재 여부·크기·픽셀 크기와 배치 수치(CSS·레이아웃 계산)는 생성 시점의 실제 파일·코드에서 읽은 값이다.');
w();
w('## 한눈에 보기');
w();
w('| 분류 | 수량 | 상태 | 현재 연결된 것 | 위치 | 파일 | 용량 |');
w('|---|---|---|---|---|---|---|');
for (const r of rows) w(`| ${r.kind} | ${r.count} | ${r.st} | ${r.what} | ${r.where} | ${r.total.n}개 | ${kbText(r.total.bytes)} |`);
w();
const allImages = [...spriteFiles, ...cgList.flatMap((c) => [c.src]), KEY_VISUAL.src, ...bgEntries.map(([, a]) => a.src!)];
w(`- 인물·CG·키 비주얼은 **사용자가 준 최종 일러스트**를 \`scripts/import-art.py\` 로 변환해 넣은 것이다(원본은 \`art-inbox/\`, 저장소에 넣지 않음).`);
{
  const temp = [
    ...(bgFinal ? [] : [['배경', '#배경--임시-svg']]),
    ['음악', '#음악bgm--임시-합성음'],
    ['효과음', '#효과음sfx--임시-합성음'],
  ];
  if (bgFinal) w('- 배경은 **사용자가 준 상세 배경**(1920×1080 WebP)이다. 사양·썸네일·레터박스는 아래 [배경](#배경--최종) 절.');
  w(`- ${temp.map(([k]) => k).join('·')}은 아직 **개발용 임시 에셋**이다. 교체 사양은 아래 ${temp.map(([k, a]) => `[${k}](${a})`).join(' · ')} 절.`);
}
const note = placeholderNote();
w(`- 타이틀 화면 버전 표시 뒤에는 ${note ? `지금 「${note}」 안내가 붙는다` : '임시 안내가 붙지 않는다(모두 최종)'}. 해당 분류의 \`placeholder\` 가 모두 \`false\` 가 되면 자동으로 빠진다(\`src/main.ts\` placeholderNote).`);
w(
  `- 그림은 지금 위치에서 가까운 그림부터 미리 받는다(\`src/ui/screens/preload.ts\`, 동시에 3개, 데이터 절약 모드·느린 연결은 2개). 표준 렌더링은 그 뒤 게임 전체 그림도 백그라운드로 받고, **데이터 절약 모드와 Apple 터치 기기**(iPad·iPhone, \`src/ui/render-profile.ts\`)는 지금 장면과 다음 장면 그림만 받는다. 현재 그림 전체 ${kbText(sum(allImages).bytes)}(썸네일 제외) — 교체할 때 용량 예산을 지킬 것.`,
);
w();

// ---- 교체 방법 ----
w('## 교체 방법(공통)');
w();
w('1. 최종 파일을 `public/assets/` 아래 **새 폴더**에 넣는다(예: `public/assets/bg/classroom_day.webp`, `public/assets/audio/bgm_daily.mp3`). `placeholder/` 폴더와 섞지 않는다.');
w('2. 매니페스트에서 경로를 바꾸고 `placeholder: false` 로 바꾼다.');
w('   - 배경·음악·효과음: `src/story/assets.ts` 의 `BACKGROUNDS` / `BGM` / `SFX` 항목별 `src`. 배경은 `tone` 을 그림의 시간대에 맞게 유지한다.');
w('     예: `classroom_day: { src: \'assets/bg/classroom_day.webp\', placeholder: false, desc: \'2학년 3반 교실(낮, 창가)\' },`');
w('   - 캐릭터: `SPRITE_SETS.<캐릭터>.dir` 과 `ext`(파일명 규칙 `${outfit}_${hair}_${expr}.${ext}` 유지). 그림 자체를 바꿀 때는 아래 [그림 교체 파이프라인](#그림-교체-파이프라인-scriptsimport-artpy)을 쓴다.');
w('   - 이벤트 CG·키 비주얼: `src/story/cg.ts`(경로는 `assets/cg/{id}.webp`, 썸네일 `assets/cg/thumb/{id}.webp` 고정).');
w('   - 배경 썸네일: `python3 scripts/bg-thumbs.py` 가 `public/assets/bg/*.webp` 에서 480×270 썸네일(`public/assets/bg/thumb/`)을 만든다. 매니페스트의 `thumb` 경로와 맞출 것.');
w('3. `npm run validate` — 매니페스트가 가리키는 파일(배경 썸네일 포함)이 없으면 오류로 알려 준다.');
w('4. `npm run docs` — 이 문서와 대본 문서를 다시 만든다.');
w('5. `npm run dev` 로 띄워 데스크톱·휴대폰 가로 화면에서 확인한다(주소 끝에 `?debug` 를 붙이면 콘솔에서 `window.__vn.info()` 로 상태 조회).');
w();
w('**라이선스 조건(배경·음악·효과음 공통):** 직접 제작했거나, 상업적 이용·수정·웹 배포가 허용된 라이선스의 소재만 쓴다. 출처 표기 의무가 있으면 게임 안 크레딧에도 넣는다.');
w('넣을 때마다 아래 [출처 기록](#출처-기록)에 작가/출처·라이선스·주소·확인한 날짜를 적는다. 생성형 도구로 만든 소재는 그 서비스 약관이 상업 이용을 허용하는지 확인한다.');
w();

// ---- 캐릭터 ----
w('## 캐릭터 스프라이트 — 최종');
w();
w(`- 규격: 원본(다시 그릴 때의 기준) **${pyConst('SPRITE_W')}×${pyConst('SPRITE_H')}(2:3)**, 머리 위 여백 약 ${HEAD_MARGIN}%(import-art 가 2~10% 를 벗어나면 경고), 그림 아래 끝이 캔버스 바닥에 닿는 반신.`);
w(`- 게임 파일: import-art 가 원본 캔버스 전체를 같은 비율로 줄여 **WebP RGBA ${SPRITE_OUT.w}×${SPRITE_OUT.h}**(품질 ${pyConst('SPRITE_QUALITY')})로 저장한다. 화면에서 스프라이트는 무대 높이의 ${fx(charHeight)}%(1080p 화면이면 약 ${Math.round((1080 * charHeight) / 100)}px)로 그려져 이 크기로 충분하고, 느린 망에서 받는 양이 줄어든다. 파일당 ${pyConst('SPRITE_BUDGET_KB')}KB 이하(넘으면 import-art 가 경고).`);
w('- 같은 의상·헤어 묶음 안에서는 표정만 달라야 한다(실루엣·위치가 같아야 표정 교체 때 흔들리지 않음). import-art 가 묶음 단위로 같은 변환을 적용하고 실루엣 bbox 차이를 경고한다.');
w('- 등장하는 조합은 `src/story/assets.ts` 의 `looks`. 없는 조합을 대본에서 부르면 `npm run validate` 가 오류를 낸다.');
w();
w('### 화면 배치 규칙');
w();
w(`생성 시점의 \`src/ui/styles/play.css\`·\`screens.css\`·\`src/ui/stage.ts\` 에서 읽은 값이다. 모든 퍼센트는 **무대(16:9) 기준**이다.`);
w();
w('| 항목 | 값 | 출처 |');
w('|---|---|---|');
w(`| 인물 높이 \`--char-height\` | 무대 높이의 **${fx(charHeight)}%** (폭은 비율대로 자동: 무대 폭의 약 ${fx(spriteWidthOfStageW)}%) | play.css ${charHeightDecls[0].line}행 \`.stage\` |`);
w(`| 아래 여백 \`--char-bottom\` | **${charBottomDecls[0].value}** → 그림 아래 끝이 무대 아래 끝보다 무대 높이의 ${fx(Math.abs(charBottom))}% ${charBottom < 0 ? '아래' : '위'} | play.css ${charBottomDecls[0].line}행 \`.stage\` |`);
w(`| 그림 위끝 | 무대 위에서 ${fx(spriteTop)}% (머리 꼭대기는 여백 ${HEAD_MARGIN}% 기준 약 ${fx(headTop)}%) | 계산 |`);
w(`| 무대 밖으로 잘리는 부분 | 캔버스 아래쪽 ${fx(hiddenBelow * 100)}% (보이는 것은 위쪽 ${fx(100 - hiddenBelow * 100)}%) | 계산 |`);
w(`| 가로 위치(그림 가운데) | 왼쪽 ${posLeft.left} · 가운데 ${posLeft.center} · 오른쪽 ${posLeft.right} (\`translateX(-50%)\`) | play.css \`.char.pos-*\` |`);
w(`| 등장·퇴장 | 아래 ${enterTranslate?.split(/\s+/)[1] ?? '?'} 에서 제자리로 + 페이드 ${DUR.char ?? '?'}ms. 말하지 않는 인물은 어둡게가 아니라 바래게(\`.char.dim\`) | play.css \`.char.entering\`, stage.ts \`DUR\` |`);
w(`| 저장 칸·미니 무대 썸네일 | bottom ${thumbBottom} · height ${thumbHeight} (본 무대와 별도 값) | screens.css \`.slot-thumb img\` |`);
w();
if (charBottomDecls.length > 1 || charHeightDecls.length > 1) {
  w('> 참고: 위 기본값 말고도 다음 선언이 있다(미디어 쿼리 등):');
  for (const d of charHeightDecls.slice(1)) w(`> - \`--char-height: ${d.value}\` (play.css ${d.line}행)`);
  for (const d of charBottomDecls.slice(1)) w(`> - \`--char-bottom: ${d.value}\` (play.css ${d.line}행)`);
  w();
}
w(`**대사창이 덮는 범위**(\`src/ui/layout.ts\` computeLayout 계산). 대사창 위로 이름표·빠른 메뉴 탭 띠가 붙는다. 글자 크기 설정 '더 크게'(×${maxScale})이면 대사창이 커진다.`);
w();
w('| 화면 | 무대 | 대사창(아래에서) | 탭 띠 위끝까지(아래에서) | 같은 높이 = 스프라이트 캔버스 위에서 | 글자 더 크게일 때 탭 띠 위끝 |');
w('|---|---|---|---|---|---|');
for (const [name, vw, vh] of VIEWPORTS) {
  const c = cover(vw, vh, 1);
  const big = cover(vw, vh, maxScale);
  w(`| ${name} | ${c.stage} | ${fx(c.box)}% | ${fx(c.band)}% | ${fx(toSpriteY(100 - c.band))}% | ${fx(big.band)}% (캔버스 ${fx(toSpriteY(100 - big.band))}%) |`);
}
w();
w(`→ **얼굴과 표정이 읽혀야 하는 부분은 스프라이트 캔버스 위쪽 약 ${fx(Math.floor(toSpriteY(100 - worstDefault)))}% 안**(기본 글자, 가장 낮은 휴대폰 화면 기준)에 있어야 대사창·탭에 가리지 않는다. 글자 '더 크게'까지 고려하면 약 ${fx(Math.floor(toSpriteY(100 - worst)))}%.`);
w();
for (const [char, set] of Object.entries(SPRITE_SETS)) {
  const who = char === 'osana' ? `${H.osana}(소꿉친구)` : `${H.tenko}(전학생)`;
  w(`### ${who} — ${set.placeholder ? TEMP : FINAL} (\`public/${set.dir}/\`)`);
  w();
  w('| 의상/헤어 | 표정 | 파일 | 상태 | 픽셀 | 크기 |');
  w('|---|---|---|---|---|---|');
  for (const look of set.looks) {
    for (const e of set.expressions) {
      const p = spriteFile(set, look.outfit, look.hair, e);
      const f = fileInfo(p);
      w(`| ${look.desc} | ${EXPR_KO[e]}(${e}) | \`${p.split('/').pop()}\` | ${f.mark} | ${f.dim} | ${f.size} |`);
    }
  }
  w();
}

// ---- 이벤트 CG ----
w('## 이벤트 CG — 최종');
w();
w(`- 규격: **WebP ${pyConst('CG_W')}×${pyConst('CG_H')}(16:9, 배경 포함 완성 그림)**, 썸네일 ${pyConst('THUMB_W')}×${pyConst('THUMB_H')}(\`assets/cg/thumb/\`, 저장 화면·추억 앨범 목록용). 매니페스트는 \`src/story/cg.ts\`.`);
w(`- 표시: 대본의 \`cg(id)\` 명령. 무대 가득(\`background-size: cover\`) — 인물·햇살·빛망울 **앞**, 대사창 **뒤**. 그림을 해독한 뒤 ${DUR.cg ?? '?'}ms 크로스페이드.`);
w('- 걷힘: `cg(null)` 또는 **`bg` 명령(배경 전환)이 오면 자동으로 걷힌다**(`src/engine/runner.ts`). 저장·불러오기 때 떠 있던 CG 도 복원된다(`state.stage.cg`).');
w('- 한 번 본 CG 는 전역 기록(`src/engine/save.ts` GlobalRecord `cgs`, `markCg`)에 남아 타이틀의 추억 앨범에서 다시 볼 수 있다. 앨범 표시 순서는 아래 표 순서(`CG_ORDER`).');
w(`- 대사창이 아래쪽을 덮으므로(위 표: 기본 ${fx(Math.min(...VIEWPORTS.map(([, vw, vh]) => cover(vw, vh, 1).band)))}~${fx(worstDefault)}%) 얼굴·중요한 손짓은 화면 위쪽 약 ${fx(Math.floor(100 - worstDefault))}% 안에 두는 것이 좋다.`);
w();
w('| 순서 | id | 앨범 제목 | 루트 | 대본 위치(cg.ts desc) | 화면에 떠 있는 구간 | 파일 | 픽셀 | 크기 | 썸네일 |');
w('|---|---|---|---|---|---|---|---|---|---|');
CG_ORDER.forEach((id, i) => {
  const c = CGS[id];
  const f = fileInfo(c.src);
  const th = fileInfo(c.thumb);
  const uses = cgUses.get(id) ?? [];
  const span = uses.length
    ? uses
        .map((u) => `\`${u.scene}\` ${!u.first ? '대사 없음' : u.first === u.last ? `\`${u.first}\` 1문장` : `\`${u.first}\`~\`${u.last}\` ${u.lines}문장`} → ${u.until}`)
        .join('<br>')
    : '⚠ 대본에서 쓰지 않음';
  const route = c.route ? `${H[c.route]}${uses.some((u) => STORY.scenes[u.scene].route === 'common') ? '(공통 선택)' : ''}` : '공통';
  w(`| ${i + 1} | \`${id}\` | ${c.title} | ${route} | ${c.desc} | ${span} | \`${c.src.split('/').pop()}\` ${f.mark} | ${f.dim} | ${f.size} | ${th.mark} ${th.dim} ${th.size} |`);
});
w();
w('### 타이틀 키 비주얼');
w();
{
  const f = fileInfo(KEY_VISUAL.src);
  const th = fileInfo(KEY_VISUAL.thumb);
  w(`- ${KEY_VISUAL.desc}`);
  w(`- 파일 \`${KEY_VISUAL.src}\` ${f.mark} ${f.dim} ${f.size} · 썸네일 \`${KEY_VISUAL.thumb}\` ${th.mark} ${th.dim} ${th.size} · ${KEY_VISUAL.placeholder ? TEMP : FINAL}`);
  w('- 타이틀 화면 전체 배경으로 깔리고(왼쪽 열에 로고·메뉴), 키 비주얼이 없을 때만 `title` 배경 + 스프라이트 두 장으로 대신 그린다(`src/main.ts` titleVisual·titleSprites).');
}
w();
w('### 엔딩 폴라로이드(`ENDING_CG`)');
w();
w('엔딩 화면 왼쪽 폴라로이드 안에 넣는 대표 CG.');
w();
for (const [heroine, id] of Object.entries(ENDING_CG)) {
  w(`- ${H[heroine as 'osana' | 'tenko']} 엔딩 → \`${id}\` 「${CGS[id].title}」 (${CGS[id].desc})`);
}
w();

// ---- 배경 ----
if (bgFinal) {
  w('## 배경 — 최종');
  w();
  w('현재는 **사용자가 준 상세 배경**(이미지 생성 도구로 제작, 1920×1080 WebP)이다. 제작 프롬프트는 `docs/BACKGROUND_PROMPTS.md`, 같은 장소의 시간대·날씨 변형은 같은 구도를 따른다.');
  w('예전 임시 SVG 생성기 `scripts/art/backgrounds.mjs`(`npm run gen:art`)는 남아 있지만 **최종 배경으로 교체돼 쓰지 않는다**(만든 SVG 는 저장소에 두지 않는다).');
  w();
  w('**다시 바꿀 때의 사양:**');
} else {
  w('## 배경 — 임시 SVG');
  w();
  w('현재는 `scripts/art/backgrounds.mjs` 가 코드로 그린 SVG(viewBox 1600×900)다. **최종 교체 사양:**');
}
w();
w('| 항목 | 사양 |');
w('|---|---|');
w('| 형식 | **WebP**(권장, 품질 80~85) 또는 JPEG. 투명 불필요 |');
w('| 해상도 | **1920×1080(16:9)** 권장. 무대가 늘 16:9 라 그대로면 잘리지 않는다. 비율이 다르면 가운데 기준으로 잘린다(`background-size: cover`) |');
w('| 용량 | 파일당 800KB 이하(표준 렌더링은 게임 전체 그림을 백그라운드로 미리 받으므로 휴대폰 데이터 고려) |');
w('| 썸네일 | 480×270 WebP(`public/assets/bg/thumb/`, 매니페스트 `thumb`). 저장 칸(한 쪽 6칸)·엔딩 폴라로이드의 미니 무대가 원본 대신 쓴다(칸마다 원본을 해독하지 않게). 원본을 바꾸면 `python3 scripts/bg-thumbs.py` 로 다시 만든다(`--check` 는 빠졌거나 오래된 것만 알림) |');
w(`| 구도 | 인물이 무대 폭 ${posLeft.left}·${posLeft.center}·${posLeft.right} 자리에 서고, 아래쪽 약 ${fx(Math.floor(Math.min(...VIEWPORTS.map(([, vw, vh]) => cover(vw, vh, 1).band))))}~${fx(Math.ceil(worstDefault))}%는 대사창·탭이 반투명하게 덮는다. 사람·글자 없는 빈 장소 그림 |`);
w('| 톤 | 아래 표의 시간대(낮/노을/밤)에 맞춘다. `tone` 값이 UI 유리 색(밤 = 남색 유리)과 장소 표시 아이콘(해/달)을 고른다. 비 배경은 id 의 `_rain` 으로 판별 |');
w('| 레터박스 | 무대 밖 여백은 표준 렌더링에서는 같은 배경을 흐려 채운다(`.backdrop`). Apple 터치 기기는 흐림 대신 톤별(낮·노을·밤) 그라데이션, 암전은 그 색(`src/ui/styles/performance.css`). 따로 만들 그림 없음 |');
w('| 화풍 | 캐릭터·CG 와 어울리는 밝은 애니메이션 배경 화풍(초여름, 맑은 하늘빛) |');
w();
w('| id | 설명 | 톤 | 대본 사용 | 현재 파일 | 상태 | 픽셀 | 크기 | 썸네일 |');
w('|---|---|---|---|---|---|---|---|---|');
for (const [id, a] of Object.entries(BACKGROUNDS)) {
  const f = fileInfo(a.src);
  const th = a.thumb ? fileInfo(a.thumb) : null;
  const tone = a.src ? TONE_KO[a.tone ?? 'day'] + (id.includes('_rain') ? '·비' : '') : '-';
  const use = id === 'title' ? `타이틀 대체${KEY_VISUAL.src ? '(키 비주얼이 없을 때만)' : ''}` : used.bg.has(id) ? '○' : '-';
  w(`| \`${id}\` | ${a.desc} | ${tone} | ${use} | ${a.src ? `\`${a.src}\`` : `단색 ${a.color}`} | ${a.src ? (a.placeholder ? TEMP : FINAL) : '-'} | ${f.dim} | ${f.size} | ${th ? `${th.mark} ${th.dim} ${th.size}` : '-'} |`);
}
w();

// ---- 음악 ----
w('## 음악(BGM) — 임시 합성음');
w();
w('현재는 `scripts/gen-placeholder-audio.mjs` 가 외부 음원 없이 합성한 MP3(44.1kHz 스테레오 112kbps, 24~40초 루프)다. **최종 교체 사양:**');
w();
w('| 항목 | 사양 |');
w('|---|---|');
w('| 형식 | **MP3**(128~192kbps) 또는 **M4A/AAC**, 44.1kHz 스테레오. Ogg 만 쓰면 일부 iOS 에서 재생되지 않을 수 있다 |');
w('| 루프 | **필수.** `src/engine/audio.ts` 가 파일 전체를 디코드해 처음~끝을 그대로 반복한다(`loop = true`, 루프 지점 지정 없음). 끝과 처음이 이어지게 만들고 앞뒤 무음을 넣지 않는다. 길이 1~2분 권장 |');
w('| 전환 | 새 곡은 1.2초 페이드 인, 바뀌는 곡은 0.9초 페이드 아웃(코드가 처리 — 파일에 페이드 넣지 않음) |');
w('| 음량 | 피크 -1dBFS 이하, 곡끼리 체감 음량을 맞춘다(임시 음원은 RMS 약 -20dBFS). 그래도 튀면 `assets.ts` 항목의 `gain`(0~1)으로 곡별 보정. 플레이어 음량 설정(기본 BGM 60 · 효과음 70)이 그 위에 곱해진다 |');
w('| 라이선스 | 직접 제작 또는 상업 이용 가능 라이선스만, 출처 기록([교체 방법](#교체-방법공통) 참고) |');
w();
w('| id | 분위기 | 대본 사용 | 현재 파일 | 상태 | 크기 |');
w('|---|---|---|---|---|---|');
for (const [id, a] of Object.entries(BGM)) {
  const f = fileInfo(a.src);
  w(`| \`${id}\` | ${a.desc} | ${id === 'title' ? '타이틀' : used.bgm.has(id) ? '○' : '-'} | \`${a.src}\` | ${a.placeholder ? TEMP : FINAL} ${f.mark} | ${f.size} |`);
}
w();

// ---- 효과음 ----
w('## 효과음(SFX) — 임시 합성음');
w();
w('| 항목 | 사양 |');
w('|---|---|');
w('| 형식 | MP3/M4A 모노 96~128kbps, 44.1kHz |');
w('| 길이·재생 | 한 번만 재생(루프 없음). 앞쪽 무음 없이 바로 시작, 0.2~4초(소나기 `rain` 은 수 초). 같은 소리를 60ms 안에 다시 부르면 무시한다 |');
w('| 음량 | 피크 -1dBFS 이하(임시 음원은 -3dBFS 근처). 선택음(`select`)처럼 자주 나는 소리는 작게 |');
w('| 라이선스 | 직접 녹음·제작 또는 상업 이용 가능 라이선스만, 출처 기록 |');
w();
w('| id | 설명 | 사용 | 현재 파일 | 상태 | 크기 |');
w('|---|---|---|---|---|---|');
for (const [id, a] of Object.entries(SFX)) {
  const f = fileInfo(a.src);
  w(`| \`${id}\` | ${a.desc} | ${id === 'select' ? 'UI' : used.sfx.has(id) ? '○' : '-'} | \`${a.src}\` | ${a.placeholder ? TEMP : FINAL} ${f.mark} | ${f.size} |`);
}
w();

// ---- import-art ----
w('## 그림 교체 파이프라인 (`scripts/import-art.py`)');
w();
w('캐릭터 스프라이트·이벤트 CG·키 비주얼을 다시 받았을 때 쓰는 변환 스크립트. 필요: Python 3 + Pillow + numpy.');
w();
w('**입력**(기본 `art-inbox/` — `.gitignore` 대상이라 원본은 저장소에 들어가지 않는다)');
w();
w('```');
w('art-inbox/char/osana/{outfit}_{hair}_{expr}.png    예: art-inbox/char/osana/uniform_default_smile.png');
w('art-inbox/char/tenko/{outfit}_{hair}_{expr}.png    예: art-inbox/char/tenko/yukata_ponytail_shy.png');
w('art-inbox/cg/{id}.png                              예: art-inbox/cg/rain_osana.png, art-inbox/cg/kv.png');
w('```');
w();
w('- 확장자는 png·webp·jpg(jpeg). 같은 이름이 여럿이면 png > webp > jpg 순으로 하나만 쓴다.');
w(`- 표정(expr): ${Object.keys(EXPR_KO).map((e) => `\`${e}\``).join(' ')}. 의상·헤어 조합은 \`src/story/assets.ts\` 의 \`looks\`.`);
w(`- CG id: ${pyCgIds.map((id) => `\`${id}\``).join(' ')} (\`kv\` = 타이틀 키 비주얼).`);
{
  const want = ['kv', ...CG_ORDER].sort();
  const have = [...pyCgIds].sort();
  if (want.join() !== have.join()) {
    w(`- ⚠ import-art.py 의 CG_IDS 가 \`src/story/cg.ts\` 와 다르다: cg.ts 에만 있음 [${want.filter((x) => !have.includes(x)).join(', ')}], 스크립트에만 있음 [${have.filter((x) => !want.includes(x)).join(', ')}]`);
  }
}
w('- 예전 안내대로 `art-inbox/{osana,tenko}/` 에 넣어도, `char/` 폴더가 없으면 그 폴더를 대신 읽는다(알림 표시).');
w('- 원본은 신뢰하지 않는 데이터로 다룬다: PNG/WebP/JPEG 로만 열고, 심볼릭 링크는 읽지 않으며, 5천만 화소를 넘는 이미지는 거부한다.');
w();
w('**출력**');
w();
w('```');
w(`public/assets/char/{osana,tenko}/{outfit}_{hair}_{expr}.webp   ${SPRITE_OUT.w}x${SPRITE_OUT.h} RGBA (작업 캔버스 ${pyConst('SPRITE_W')}x${pyConst('SPRITE_H')})`);
w(`public/assets/cg/{id}.webp                                     ${pyConst('CG_W')}x${pyConst('CG_H')}`);
w(`public/assets/cg/thumb/{id}.webp                               ${pyConst('THUMB_W')}x${pyConst('THUMB_H')}`);
w('```');
w();
w('**처리 내용**');
w();
w('- 스프라이트: ① 불투명 원본이면 가장자리와 이어진 단색 배경을 지운다(크로마키 초록 같은 채도 높은 색이면 팔·머리카락 사이의 닫힌 틈도 지우고, 흰색 등 무채색이면 닫힌 틈은 남기고 경고). ② 가장자리 번짐(halo) 색 보정(알파·실루엣은 그대로). ③ 1600×2400 이 아니면 묶음(같은 의상·헤어) 전체에 같은 변환으로 2:3 캔버스·머리 위 5%·가로 가운데에 맞춤. ④ 캔버스 전체를 같은 비율로 줄여(기본 세로 1800px, `--sprite-height`) WebP 저장. ⑤ 묶음 안 실루엣 bbox 가 다르면 경고(표정 교체 시 흔들림).');
w('- CG: 투명 부분은 검은색 위에 합성, 16:9 가 아니면 가운데를 잘라 맞춤, 원본이 작아 확대되면 경고, 썸네일 함께 생성.');
w('- 파일은 임시 파일에 쓴 뒤 이름을 바꿔 넣는다(중간에 멈춰도 반쯤 쓴 파일이 남지 않음).');
w();
w('**옵션**(스크립트에서 읽은 목록)');
w();
w('| 옵션 | 설명 |');
w('|---|---|');
for (const o of pyOptions) w(`| ${o.flags.map((f) => `\`${f}\``).join(', ')} | ${o.help.replace(/\|/g, '\\|')} |`);
w();
w('**종료 코드:** 0 성공 · 1 오류가 있거나 처리할 파일이 없음, `--strict` 이면 경고·알림이 하나라도 있을 때 · 2 입력 폴더 없음.');
w();
w('**순서 예**');
w();
w('```bash');
w('python3 scripts/import-art.py --dry-run --strict   # 쓰지 않고 검사만(크기는 메모리 인코딩으로 계산)');
w('python3 scripts/import-art.py                      # art-inbox/ → public/assets/ 변환');
w('python3 scripts/import-art.py --only cg            # CG·키 비주얼만');
w('python3 scripts/import-art.py --src ~/받은그림 --only char   # 다른 폴더에서 스프라이트만');
w('npm run validate && npm run docs                   # 연결 확인, 문서 갱신');
w('```');
w();
w('새 의상·헤어 조합이나 새 CG 를 추가할 때는 `src/engine/types.ts`(타입), `src/story/assets.ts` 또는 `src/story/cg.ts`(매니페스트), `scripts/import-art.py` 의 `KNOWN_LOOKS`·`CG_IDS`(검사용)를 함께 고친다. 스크립트는 목록에 없는 조합·id 도 변환은 하되 알림을 남긴다.');
w();

// ---- 출처 ----
w('## 출처 기록');
w();
w('| 분류 | 출처 | 라이선스·조건 | 비고 |');
w('|---|---|---|---|');
w('| 캐릭터 스프라이트·이벤트 CG·키 비주얼 | 사용자 제공 최종 일러스트 | 사용자 제공(이 게임에 사용) | 제작 프롬프트 `docs/ART_PROMPTS.md`, 변환 `scripts/import-art.py` |');
if (bgFinal) {
  w('| 배경 | 사용자가 준 묶음(이미지 생성 도구로 제작, 2026-11-24). 도구명·버전은 받은 기록에 없음 | 사용자 제공(이 게임에 사용). 생성 서비스의 이용 조건(상업 이용·웹 배포 허용)은 기록에 없어 **확인 필요** | 제작 프롬프트 `docs/BACKGROUND_PROMPTS.md`(앞 3장은 요약만 남음), 썸네일 `scripts/bg-thumbs.py` |');
} else {
  w('| 배경(임시) | 이 저장소의 `scripts/art/backgrounds.mjs` 가 코드로 생성 | 외부 소재 없음 | 최종 교체 대상 |');
}
w('| 음악·효과음(임시) | 이 저장소의 `scripts/gen-placeholder-audio.mjs` 가 합성 | 외부 음원·샘플 없음 | 최종 교체 대상 |');
w('| 글꼴 | `@fontsource/gowun-batang`, `@fontsource/gowun-dodum`, `@fontsource/jua`, `pretendard` (npm) | SIL Open Font License 1.1 | `package.json` dependencies |');
w(
  '| 글꼴 타이틀 조각 `src/ui/styles/fonts/jua-title.woff2`, `gowun-batang-700-title.woff2` | google/fonts 의 OFL TTF(`ofl/jua/Jua-Regular.ttf`, `ofl/gowunbatang/GowunBatang-Bold.ttf`)에서 로고·부제 글자만 뽑은 부분 글꼴(pyftsubset) | SIL Open Font License 1.1(원본과 같음). 이름 표(저작권·OFL 안내)는 원본 그대로 둔다 | 타이틀이 받는 글꼴을 줄이려는 파생 파일(UI_DESIGN 4장). `GAME_TITLE`·`GAME_SUBTITLE`(src/story/config.ts)을 바꾸면 `tokens.css` 주석의 명령으로 다시 만들고 `unicode-range` 를 맞춘다(`tests/unit/layout.test.ts` 가 검사) |',
);
w();
w(`최종 ${bgFinal ? '' : '배경·'}음악·효과음을 넣으면 이 표에 한 줄씩 더한다(예: \`| 음악 bgm_daily | ○○ 작곡가 직접 제작 | 상업 이용·수정 허락(계약서 날짜) | 2026-xx-xx 확인 |\`). 이 표는 \`scripts/export-assets.ts\` 안에 있다.`);
w();

// ---- 기타 ----
w('## 아직 없는(선택) 에셋과 정리 대상');
w();
w(`- ${H.osana} 잠옷·마스크 차림 스프라이트: 없음. 감기 문병 장면(o2)은 이벤트 CG \`door_osana\` 와 서술로 처리한다.`);
w('- 주인공 그림: 기획상 없음(CG 에서도 얼굴을 보이지 않게 그림).');
w('- 사복: 본편 일정을 방과 후 중심으로 짜서 필요 없음.');
{
  const old = dirBytes(pub('assets/placeholder/char'));
  const referenced = Object.values(SPRITE_SETS).some((s) => s.dir.startsWith('assets/placeholder/char'));
  if (old.n && !referenced) {
    w(`- \`public/assets/placeholder/char/\`(예전 임시 SVG 스프라이트 ${old.n}개, ${kbText(old.bytes)})는 더 이상 연결되지 않지만 빌드에 그대로 복사된다. 필요 없으면 지워도 된다(\`npm run gen:art\` 로 다시 만들 수 있음).`);
  }
}
{
  const old = dirBytes(pub('assets/placeholder/bg'));
  const referenced = bgEntries.some(([, a]) => a.src!.startsWith('assets/placeholder/bg'));
  if (old.n && !referenced) {
    w(`- \`public/assets/placeholder/bg/\`(예전 임시 SVG 배경 ${old.n}개, ${kbText(old.bytes)})는 더 이상 연결되지 않지만 빌드에 그대로 복사된다. 지워도 된다.`);
  } else if (!referenced) {
    w('- 예전 임시 SVG 배경(`public/assets/placeholder/bg/`)은 최종 배경으로 바꾸며 지웠다. `npm run gen:art` 는 `scripts/art/backgrounds.mjs` 로 그 폴더를 다시 만들므로, 실행했다면 만든 뒤 지운다(게임은 쓰지 않고 빌드에 복사돼 배포된다).');
  }
}

writeFileSync(resolve(root, 'docs/ASSETS.md'), out.join('\n') + '\n');
console.log(`docs/ASSETS.md 생성 (${out.length}줄)`);
