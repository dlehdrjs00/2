/**
 * 여덟 엔딩 E2E(eight-endings.spec.ts) 전용 도우미.
 *
 * helpers.ts·koharu-helpers.ts 는 다른 작업이 함께 고칠 수 있어 기대지 않고, 이 스펙에 필요한 것만 따로 둔다
 * (koharu-helpers.ts 의 방식을 그대로 옮기고 여덟 엔딩용 관찰을 더했다).
 * - 각 테스트는 빈 저장소에서 시작한다(freshBoot: 첫 문서에서만 localStorage 를 비우고, 필요하면 읽음 기록·저장을 넣는다).
 * - 긴 진행은 '읽은 대사 건너뛰기'(S 키)로 빠르게 간다. 대본의 대사·카드 id 를 읽음 기록(ashita.global.read)에 미리 넣고,
 *   읽은 줄에서 S 를 누른다. 건너뛰기는 선택지·처음 보는 줄·엔딩에서 스스로 멈추므로, 직접 볼 줄은 읽음 기록에서 뺀다.
 *   선택은 늘 화면의 선택지 버튼을 눌러서 한다. 건너뛰기 중에는 효과음이 나지 않는다(game.ts applyEvents).
 * - 화면에 나온 프레임(스텝 id·장면·루트·점수)을 페이지 안에서 기록한다(watchSteps: 줄마다 쓰는 자동 저장을 가로챔).
 *   건너뛰기로 지나가는 줄도 빠짐없이 잡힌다.
 */
import { expect, test, type Page } from '@playwright/test';
import { STORY } from '../../src/story';

export type Hid = 'osana' | 'tenko' | 'koharu';
export type Pts = Record<Hid, number>;

/** window.__vn.info() (src/ui/game.ts debugInfo) 중 이 스펙이 쓰는 값 */
export interface VInfo {
  mode: string;
  step: string | null;
  frame: string | null;
  route: string | null;
  points: Pts | null;
  lastHeroine: string | null;
  auto: boolean;
  skip: boolean;
  overlays: number;
  bg: string | null;
  bgm: string | null;
  typing: boolean;
  transitioning: boolean;
  readCount: number;
  sheet: string | null;
  autoSave: 'none' | 'ok' | 'tab-only' | 'low-space';
}

export const DEFAULT_SETTINGS = { textSpeed: 10, autoSpeed: 10, bgmVolume: 0, sfxVolume: 0 };

/** 코하루 이름(이름·성)이 나오면 안 되는 곳을 볼 때 */
export const KOHARU_NAMES = /코하루|나루세/;
/**
 * 코하루가 그려진 그림 주소: 코하루 스프라이트, kh_ 배경·CG, 여덟 엔딩 확장의 코하루가 그려진 CG 6장(계약 9절)과 그 썸네일.
 * public/ 의 그림은 해시 없이 그대로 서빙되므로 폴더까지 본다
 */
export const KOHARU_DRAWN_ASSET =
  /assets\/char\/koharu\/|assets\/(?:bg|cg)\/(?:thumb\/)?(?:kh_|group_ice_four|group_frog|group_rain|end_koharu_coin|end_group_)/;
/** 히든 루트 전용 그림(end_group_*) */
export const END_GROUP_ASSET = /assets\/cg\/(?:thumb\/)?end_group_/;

/** 관람 전에는 앨범에 나타나지 않는 CG(cg.ts hidden) — 이 스펙의 기대값 계산용 */
export const HIDDEN_CGS = new Set([
  'kh_meet',
  'kh_draw',
  'group_ice_four',
  'group_frog',
  'group_rain',
  'kh_relay',
  'kh_confession',
  'kh_home',
  'kh_date',
  'end_koharu_coin',
  'end_group_fireworks',
  'end_group_morning',
]);
/** 처음부터 앨범에 잠긴 칸으로 보이는 CG 수(26장 중 숨김 12장을 뺀 14장) */
export const VISIBLE_CGS = 14;

export async function vi(page: Page): Promise<VInfo> {
  return page.evaluate(() => (window as unknown as { __vn: { info: () => VInfo } }).__vn.info());
}

// ---------------------------------------------------------------------------
// 대본에서 id 고르기
// ---------------------------------------------------------------------------

const isLine = (s: { t: string }) => s.t === 'say' || s.t === 'card';

/** 장면 id → 그 장면의 대사·카드 id(대본 순서) */
export function sceneLines(sceneId: string): string[] {
  const sc = STORY.scenes[sceneId];
  if (!sc) throw new Error(`장면 없음: ${sceneId}`);
  return sc.steps.filter(isLine).map((s) => s.id);
}

/** 대본의 모든 대사·카드 id(건너뛰기용 읽음 기록). exclude 가 참인 장면·줄은 뺀다 */
export function lineIds(exclude: (sceneId: string, stepId: string) => boolean = () => false): string[] {
  const out: string[] = [];
  for (const sc of Object.values(STORY.scenes)) {
    for (const s of sc.steps) if (isLine(s) && !exclude(sc.id, s.id)) out.push(s.id);
  }
  return out;
}

/** 스텝 id → 장면 id */
const OWNER = (() => {
  const m = new Map<string, string>();
  for (const sc of Object.values(STORY.scenes)) for (const s of sc.steps) m.set(s.id, sc.id);
  return m;
})();
export const sceneOf = (stepId: string | null | undefined) => (stepId ? OWNER.get(stepId) ?? null : null);

/** 장면 안에서 그 CG 를 띄우는 cg 스텝 바로 뒤의 첫 대사·카드 id(그 줄에서 CG 가 화면에 떠 있다) */
export function lineAfterCg(cgId: string): string {
  for (const sc of Object.values(STORY.scenes)) {
    const i = sc.steps.findIndex((s) => s.t === 'cg' && (s as { cg: string | null }).cg === cgId);
    if (i < 0) continue;
    const next = sc.steps.slice(i + 1).find(isLine);
    if (next) return next.id;
  }
  throw new Error(`CG 뒤 줄 없음: ${cgId}`);
}

/** 선택지 스텝 바로 앞의 대사·카드 n 줄(그 선택지 직전에서 멈추게 할 때) */
export function linesBefore(stepId: string, n: number): string[] {
  const sc = STORY.scenes[sceneOf(stepId) ?? ''];
  if (!sc) throw new Error(`스텝 없음: ${stepId}`);
  const i = sc.steps.findIndex((s) => s.id === stepId);
  return sc.steps.slice(0, i).filter(isLine).slice(-n).map((s) => s.id);
}

/** 첫 장면부터의 장면 순서(연속 중복 제거) */
export function scenesOf(steps: readonly string[]): string[] {
  const out: string[] = [];
  for (const id of steps) {
    const sc = OWNER.get(id);
    if (sc && out[out.length - 1] !== sc) out.push(sc);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 시작·진행
// ---------------------------------------------------------------------------

export interface FreshOptions {
  /** 읽음 기록(건너뛰기 대상) */
  read?: string[];
  cgs?: string[];
  endings?: string[];
  /** 저장 칸 → 원문 JSON(localStorage 'ashita.save.<칸>') */
  slots?: Record<string, string>;
  /** 그대로 넣을 저장소 키 → 원문(옛 빌드의 전역 기록 등). read/cgs/endings 보다 나중에 넣는다 */
  raw?: Record<string, string>;
  settings?: Record<string, number>;
}

/**
 * 빈 저장소로 게임을 연다. 첫 문서에서만(sessionStorage 표시) localStorage 를 비우고 기록·저장을 넣는다.
 * 새로고침에서는 건드리지 않는다(저장 왕복을 볼 수 있게). 설정(글자 즉시 표시 등)은 매번 넣는다.
 */
export async function freshBoot(page: Page, o: FreshOptions = {}) {
  await page.addInitScript((o) => {
    try {
      if (sessionStorage.getItem('eight-fresh')) return;
      sessionStorage.setItem('eight-fresh', '1');
      localStorage.clear();
      if (o.read || o.cgs || o.endings) {
        localStorage.setItem('ashita.global', JSON.stringify({ schema: 1, read: o.read ?? [], endings: o.endings ?? [], cgs: o.cgs ?? [] }));
      }
      for (const [k, v] of Object.entries(o.raw ?? {})) localStorage.setItem(k, v);
      for (const [k, v] of Object.entries(o.slots ?? {})) localStorage.setItem(`ashita.save.${k}`, v);
    } catch {
      /* ignore */
    }
  }, o);
  await page.addInitScript((s) => {
    try {
      const cur = JSON.parse(localStorage.getItem('ashita.settings') || '{}');
      localStorage.setItem('ashita.settings', JSON.stringify({ ...cur, ...s }));
    } catch {
      /* ignore */
    }
  }, o.settings ?? DEFAULT_SETTINGS);
  await page.goto('./?debug');
  await expect(page.locator('#vn')).toHaveAttribute('data-mode', 'title');
}

/** 새로고침(저장소는 그대로)하고 타이틀까지 */
export async function reload(page: Page) {
  await page.reload();
  await expect(page.locator('#vn')).toHaveAttribute('data-mode', 'title');
}

/** 연출(암전 등)이 끝나 블로킹 프레임이 표시될 때까지 */
export async function settled(page: Page, timeout = 20_000) {
  await page.waitForFunction(
    () => {
      const i = (window as unknown as { __vn: { info: () => VInfo } }).__vn.info();
      return i.mode !== 'play' || (i.step !== null && !i.typing && !i.transitioning);
    },
    undefined,
    { timeout, polling: 30 },
  );
}

export async function newGame(page: Page) {
  await page.locator('[data-action=new]').click();
  const confirm = page.locator('[data-panel=confirm] [data-action=ok]');
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await expect(page.locator('#vn')).toHaveAttribute('data-mode', 'play');
  await settled(page);
}

export async function press(page: Page, x: number, y: number) {
  if (test.info().project.use.hasTouch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

/** 무대 빈 곳을 누른다(터치 프로젝트는 탭) */
export async function tapStage(page: Page) {
  const box = await page.locator('.stage').boundingBox();
  if (!box) throw new Error('stage not visible');
  await press(page, box.x + box.width * 0.5, box.y + box.height * 0.35);
}

/** 대사 한 줄 진행(무대를 눌러 다음 프레임이 표시될 때까지) */
export async function line(page: Page): Promise<VInfo> {
  const before = await vi(page);
  if (before.mode !== 'play' || before.frame === 'choice' || before.frame === 'ending') {
    throw new Error(`대사가 아님: ${before.mode}/${before.frame}/${before.step}`);
  }
  for (let t = 0; t < 40; t++) {
    await tapStage(page);
    const moved = await page
      .waitForFunction(
        (s) => {
          const i = (window as unknown as { __vn: { info: () => VInfo } }).__vn.info();
          return i.step !== s || i.mode !== 'play';
        },
        before.step,
        { timeout: t < 4 ? 350 : 1200, polling: 25 },
      )
      .then(
        () => true,
        () => false,
      );
    if (moved) {
      await settled(page);
      return vi(page);
    }
  }
  throw new Error(`진행되지 않음: ${before.step}`);
}

/** 보이는 선택지 옵션 id(화면 순서). 등장 연출이 끝나 누를 수 있게 된 뒤에 읽는다 */
export async function visibleOptions(page: Page): Promise<string[]> {
  await expect(page.locator('.choices.on')).toHaveAttribute('data-armed', '1');
  return page.locator('.choices.on .choice').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.option ?? ''));
}

/** 선택지 버튼을 눌러 고른다. 고르기 전 보이던 옵션을 돌려준다 */
export async function choose(page: Page, optionId: string): Promise<string[]> {
  const before = await vi(page);
  expect(before.frame, `선택지가 아님: ${before.step}`).toBe('choice');
  const shown = await visibleOptions(page);
  expect(shown, `${before.step} 에 ${optionId} 옵션이 없음`).toContain(optionId);
  await page.locator(`.choices.on .choice[data-option="${optionId}"]`).click();
  await page.waitForFunction(
    (s) => (window as unknown as { __vn: { info: () => VInfo } }).__vn.info().step !== s,
    before.step,
    { timeout: 10_000, polling: 25 },
  );
  await settled(page);
  return shown;
}

export interface RunOptions {
  /** 읽음 기록에 넣은 줄(이 줄에서는 건너뛰기를 켠다). 없으면 모두 한 줄씩 누른다 */
  read?: ReadonlySet<string>;
  /** 참이면 그 프레임에서 멈춘다(건너뛰기로 지나가는 줄에서는 볼 수 없으니 읽지 않은 줄로 고른다) */
  stopAt?: (i: VInfo) => boolean;
  /** 선택지마다(고르기 전). options: 보이는 옵션 id */
  onChoice?: (i: VInfo, options: string[]) => Promise<void> | void;
  /** 한 줄씩 넘기는 대사마다(넘기기 전) */
  onLine?: (i: VInfo) => Promise<void> | void;
}

export interface RunResult {
  info: VInfo;
  /** 선택지별 보이던 옵션 */
  choices: Array<{ step: string; options: string[]; picked: string }>;
  /** 한 줄씩 넘긴(건너뛰기가 아닌) 프레임 id 순서 */
  steps: string[];
}

/**
 * picks 순서대로 선택지를 고르며 진행한다. 엔딩 화면, stopAt, 또는 picks 를 다 쓴 뒤의 선택지에서 멈춘다.
 * read 에 든 줄에서는 건너뛰기(S)로 빠르게 간다.
 */
export async function run(page: Page, picks: readonly string[], o: RunOptions = {}): Promise<RunResult> {
  const choices: RunResult['choices'] = [];
  const steps: string[] = [];
  let n = 0;
  for (let guard = 0; guard < 6000; guard++) {
    const i = await vi(page);
    if (i.mode === 'ending') return { info: i, choices, steps };
    if (i.mode !== 'play') throw new Error(`플레이 중이 아님: ${i.mode}`);
    if (o.stopAt?.(i)) return { info: i, choices, steps };
    if (i.frame === 'ending') {
      await page.waitForFunction(() => (window as unknown as { __vn: { info: () => VInfo } }).__vn.info().mode === 'ending', undefined, {
        timeout: 15_000,
      });
      continue;
    }
    if (i.frame === 'choice') {
      if (n >= picks.length) return { info: i, choices, steps };
      const options = await visibleOptions(page);
      await o.onChoice?.(i, options);
      const picked = picks[n++];
      await choose(page, picked);
      choices.push({ step: i.step!, options, picked });
      continue;
    }
    if (o.read?.has(i.step!) && !i.skip) {
      await page.keyboard.press('s');
      await page.waitForFunction(
        () => {
          const v = (window as unknown as { __vn: { info: () => VInfo } }).__vn.info();
          return !v.skip && (v.mode !== 'play' || (!v.typing && !v.transitioning));
        },
        undefined,
        { timeout: 90_000, polling: 50 },
      );
      continue;
    }
    steps.push(i.step!);
    await o.onLine?.(i);
    await line(page);
  }
  throw new Error('너무 깁니다');
}

// ---------------------------------------------------------------------------
// 메뉴·저장
// ---------------------------------------------------------------------------

export async function openMenu(page: Page) {
  await page.locator('.hud button', { hasText: '메뉴' }).click();
  await expect(page.locator('[data-panel=menu]')).toBeVisible();
}

/** 시트·메뉴를 모두 닫고 짧은 입력 잠금이 풀릴 때까지 */
export async function closeOverlays(page: Page) {
  for (let k = 0; k < 4 && (await vi(page)).overlays > 0; k++) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(120);
  }
  await expect.poll(async () => (await vi(page)).overlays).toBe(0);
  await page.waitForTimeout(300);
}

/** 메뉴 → 타이틀로 → 확인 */
export async function toTitle(page: Page) {
  await openMenu(page);
  await page.locator('[data-panel=menu] [data-action=title]').click();
  await page.locator('[data-panel=confirm] [data-action=ok]').click();
  await expect(page.locator('#vn')).toHaveAttribute('data-mode', 'title');
}

/** 타이틀 [이어하기] */
export async function continueFromTitle(page: Page) {
  await page.locator('[data-action=continue]').click();
  const changed = page.locator('[data-panel=confirm] [data-action=ok]');
  if (await changed.isVisible().catch(() => false)) await changed.click();
  await expect(page.locator('#vn')).toHaveAttribute('data-mode', 'play');
  await settled(page);
}

/** 메뉴 → 저장 → 칸(덮어쓰기 확인 포함) → 닫기 */
export async function saveTo(page: Page, slot: string) {
  await openMenu(page);
  await page.locator('[data-panel=menu] [data-action=save]').click();
  const card = page.locator(`[data-panel=save] .slot[data-slot="${slot}"]`);
  // 저장 시트는 마지막으로 본 쪽(예: 퀵 칸을 불러온 뒤면 '자동·퀵')으로 열리므로 칸이 있는 쪽으로 옮긴다
  await expect(page.locator('[data-panel=save] .slot').first()).toBeVisible();
  if (!(await card.isVisible().catch(() => false))) {
    const pageNo = slot === 'auto' || slot === 'quick' ? 'q' : String(Math.ceil(Number(slot) / 6));
    await page.locator(`[data-panel=save] .rail [data-page="${pageNo}"]`).click();
  }
  await card.click();
  const ok = page.locator('[data-panel=confirm] [data-action=ok]');
  if (await ok.isVisible().catch(() => false)) await ok.click();
  await expect(page.locator(`[data-panel=save] .slot[data-slot="${slot}"] .slot-meta`)).toBeVisible();
  await closeOverlays(page);
}

/** 플레이 중이면 메뉴 → 불러오기, 타이틀이면 [불러오기] → 칸 → (확인) */
export async function loadFrom(page: Page, slot: string) {
  const i = await vi(page);
  if (i.mode === 'play') {
    await openMenu(page);
    await page.locator('[data-panel=menu] [data-action=load]').click();
  } else {
    await page.locator('.title-menu [data-action=load]').click();
  }
  const card = page.locator(`[data-panel=load] .slot[data-slot="${slot}"]`);
  if (!(await card.isVisible().catch(() => false))) {
    const pageNo = slot === 'auto' || slot === 'quick' ? 'q' : String(Math.ceil(Number(slot) / 6));
    await page.locator(`[data-panel=load] .rail [data-page="${pageNo}"]`).click();
  }
  await card.click();
  const ok = page.locator('[data-panel=confirm] [data-action=ok]');
  if (await ok.isVisible().catch(() => false)) await ok.click();
  await expect(page.locator('#vn')).toHaveAttribute('data-mode', 'play');
  await expect.poll(async () => (await vi(page)).overlays).toBe(0);
  await settled(page);
}

/** 빠른 메뉴의 퀵저장·퀵로드(작은 화면에서 접혀 있어도 누를 수 있게 버튼을 직접 누른다) */
export async function quickSave(page: Page) {
  await page.locator('.qbar [data-q=qsave]').evaluate((b) => (b as HTMLButtonElement).click());
  await expect(page.locator('.toast').last()).toContainText('퀵저장했어요');
}

export async function quickLoad(page: Page) {
  await page.locator('.qbar [data-q=qload]').evaluate((b) => (b as HTMLButtonElement).click());
  const ok = page.locator('[data-panel=confirm] [data-action=ok]');
  await expect(ok).toBeVisible();
  await ok.click();
  await expect.poll(async () => (await vi(page)).overlays).toBe(0);
  await settled(page);
}

export interface SlotJson {
  schema: number;
  summary: { sceneTitle: string; text: string; route: string | null };
  state: {
    sceneId: string;
    stepId: string;
    points: Record<string, number>;
    flags: Record<string, unknown>;
    choices: Record<string, string>;
    route: string | null;
    stage: { cg: string | null };
  };
}

/** localStorage 의 저장 칸 JSON */
export async function readSlotJson(page: Page, slot: string): Promise<SlotJson | null> {
  return page.evaluate((k) => {
    const raw = localStorage.getItem(k);
    return raw ? JSON.parse(raw) : null;
  }, `ashita.save.${slot}`);
}

export interface GlobalAll {
  /** ashita.global 의 읽은 대사·본 CG(순서 그대로) */
  read: string[];
  cgs: string[];
  /** 세 키(ashita.global · .ext · .v2) 엔딩의 합집합(게임이 읽는 방식, save.ts readGlobal) */
  endings: string[];
  /** 키별 엔딩(없으면 null) */
  byKey: { global: string[] | null; ext: string[] | null; v2: string[] | null };
}

/** 전역 기록(읽은 대사·엔딩·본 CG). 엔딩은 세 키의 합집합 */
export async function readGlobalAll(page: Page): Promise<GlobalAll> {
  return page.evaluate(() => {
    const get = (k: string) => {
      try {
        const v = localStorage.getItem(k);
        return v ? JSON.parse(v) : null;
      } catch {
        return null;
      }
    };
    const g = get('ashita.global');
    const ext = get('ashita.global.ext');
    const v2 = get('ashita.global.v2');
    const byKey = {
      global: Array.isArray(g?.endings) ? (g.endings as string[]) : null,
      ext: Array.isArray(ext?.endings) ? (ext.endings as string[]) : null,
      v2: Array.isArray(v2?.endings) ? (v2.endings as string[]) : null,
    };
    const endings = [...new Set([...(byKey.global ?? []), ...(byKey.ext ?? []), ...(byKey.v2 ?? [])])];
    return { read: g?.read ?? [], cgs: g?.cgs ?? [], endings, byKey };
  });
}

// ---------------------------------------------------------------------------
// 관찰(페이지 안 기록)
// ---------------------------------------------------------------------------

/** 그림 요청 주소 중 re 에 맞는 것을 모은다(page.on('request')) */
export function watchRequests(page: Page, re: RegExp): string[] {
  const out: string[] = [];
  page.on('request', (req) => {
    if (re.test(req.url())) out.push(req.url());
  });
  return out;
}

/**
 * 화면(#vn 글자·aria-label·title·alt)·document.title 에 코하루 이름이 나온 순간을 기록한다(MutationObserver, 새 문서마다 다시 건다).
 * 건너뛰기로 빨리 지나가는 줄도 DOM 에는 한 번씩 그려지므로 놓치지 않는다.
 */
export async function watchNames(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __nameHits: Array<{ where: string; text: string; step: string | null }> };
    w.__nameHits = [];
    const re = /코하루|나루세/;
    const step = () => {
      try {
        return (window as unknown as { __vn?: { info: () => { step: string | null } } }).__vn?.info().step ?? null;
      } catch {
        return null;
      }
    };
    const check = () => {
      if (w.__nameHits.length > 30) return;
      if (re.test(document.title)) w.__nameHits.push({ where: 'document.title', text: document.title, step: step() });
      const vn = document.getElementById('vn');
      if (!vn) return;
      const t = vn.textContent ?? '';
      const m = t.match(/.{0,30}(코하루|나루세).{0,30}/);
      if (m) w.__nameHits.push({ where: '#vn 글자', text: m[0], step: step() });
      for (const e of vn.querySelectorAll('[aria-label],[title],[alt]')) {
        for (const a of ['aria-label', 'title', 'alt']) {
          const v = e.getAttribute(a);
          if (v && re.test(v)) w.__nameHits.push({ where: `${e.tagName.toLowerCase()}.${(e as HTMLElement).className}[${a}]`, text: v, step: step() });
        }
      }
    };
    const start = () => {
      new MutationObserver(check).observe(document.documentElement, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['aria-label', 'title', 'alt'],
      });
      check();
    };
    if (document.documentElement) start();
    else document.addEventListener('DOMContentLoaded', start);
  });
}

export async function nameHits(page: Page) {
  return page.evaluate(() => (window as unknown as { __nameHits?: Array<{ where: string; text: string; step: string | null }> }).__nameHits ?? []);
}

export interface Seen {
  /** 스텝 id */
  s: string;
  /** 장면 id(자동 저장의 sceneId) */
  sc: string;
  /** 그 프레임의 확정 루트 */
  r: string | null;
  /** 점수 */
  p: Pts | null;
  /** performance.now() */
  t: number;
}

/**
 * 화면에 나온 프레임(스텝 id·장면·루트·점수) 순서를 페이지 안에서 기록한다. 게임은 대사·카드·선택지를 그릴 때마다
 * 자동 저장(localStorage 'ashita.save.auto')을 쓰므로(game.ts present → autosave), 그 쓰기를 가로채 상태를 읽는다
 * (rAF 표본과 달리 부하가 커도 건너뛰기로 지나간 줄을 놓치지 않는다). 엔딩 프레임은 자동 저장을 쓰지 않으므로 기록에 없다.
 * 무대의 CG(.stage[data-cg])가 바뀐 순간도 함께 기록한다(cgLog: 띄운 CG id·시각·그때 프레임).
 */
export async function watchSteps(page: Page) {
  await page.addInitScript(() => {
    type I = { step: string | null };
    const w = window as unknown as {
      __seen: Array<{ s: string; sc: string; r: string | null; p: Record<string, number> | null; t: number }>;
      __cgLog: Array<{ cg: string | null; t: number; step: string | null }>;
    };
    w.__seen = [];
    w.__cgLog = [];
    const origSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function (this: Storage, key: string, value: string) {
      if (key === 'ashita.save.auto') {
        try {
          const st = JSON.parse(value).state;
          if (st?.stepId && w.__seen[w.__seen.length - 1]?.s !== st.stepId) {
            w.__seen.push({ s: st.stepId, sc: st.sceneId, r: st.route ?? null, p: st.points ?? null, t: performance.now() });
          }
        } catch {
          /* ignore */
        }
      }
      return origSet.call(this, key, value);
    };
    let lastCg: string | null = null;
    const cgNow = () => document.querySelector<HTMLElement>('#vn .stage')?.dataset.cg ?? null;
    const onMut = () => {
      const c = cgNow();
      if (c !== lastCg) {
        lastCg = c;
        let step: string | null = null;
        try {
          step = (window as unknown as { __vn?: { info: () => I } }).__vn?.info().step ?? null;
        } catch {
          /* ignore */
        }
        w.__cgLog.push({ cg: c, t: performance.now(), step });
      }
    };
    const start = () => new MutationObserver(onMut).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['data-cg'] });
    if (document.documentElement) start();
    else document.addEventListener('DOMContentLoaded', start);
  });
}

export async function seen(page: Page): Promise<Seen[]> {
  return page.evaluate(() => (window as unknown as { __seen?: Seen[] }).__seen ?? []);
}

export async function cgLog(page: Page): Promise<Array<{ cg: string | null; t: number; step: string | null }>> {
  return page.evaluate(() => (window as unknown as { __cgLog?: Array<{ cg: string | null; t: number; step: string | null }> }).__cgLog ?? []);
}

/** 기록된 프레임 중 처음으로 루트가 정해진 프레임 */
export function firstRouted(list: readonly Seen[]): Seen | null {
  return list.find((x) => x.r !== null) ?? null;
}

export interface SfxRec {
  kind: 'fetch' | 'start';
  url: string;
  step: string | null;
  /** 그 전에 화면에 나온 프레임 id(watchSteps 기록) */
  shown: string[];
  /** performance.now() */
  t: number;
}

/**
 * 효과음 재생 관찰(페이지 안, watchSteps 뒤에 건다). fetch 로 받은 오디오와 디코드 결과를 이어,
 * 오디오 첫 요청(fetch: 재생 요청 순간에 동기로 일어남)과 버퍼 재생(AudioBufferSourceNode.start)이 일어난 순간의
 * 프레임 id·시각과 '그 전에 화면에 나온 프레임 id'를 남긴다. Web Audio 가 없으면 아무것도 걸지 않는다(available = false).
 */
export async function watchSfx(page: Page) {
  await page.addInitScript(() => {
    type Rec = { kind: 'fetch' | 'start'; url: string; step: string | null; shown: string[]; t: number };
    const w = window as unknown as { __sfx: { available: boolean; log: Rec[] }; __seen?: Array<{ s: string }> };
    w.__sfx = { available: false, log: [] };
    const cur = () => {
      try {
        return (window as unknown as { __vn?: { info: () => { step: string | null } } }).__vn?.info().step ?? null;
      } catch {
        return null;
      }
    };
    const shown = () => (w.__seen ?? []).map((x) => x.s);
    const AC =
      (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC || typeof AudioBufferSourceNode === 'undefined') return;
    w.__sfx.available = true;
    const dataUrl = new WeakMap<ArrayBuffer, string>();
    const bufUrl = new WeakMap<AudioBuffer, string>();
    const origFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (/\.(mp3|ogg|m4a|wav)(\?|$)/.test(url)) w.__sfx.log.push({ kind: 'fetch', url, step: cur(), shown: shown(), t: performance.now() });
      const res = await origFetch(input, init);
      const ab = res.arrayBuffer.bind(res);
      res.arrayBuffer = async () => {
        const b = await ab();
        dataUrl.set(b, url);
        return b;
      };
      return res;
    };
    const proto = ((window as unknown as { BaseAudioContext?: typeof BaseAudioContext }).BaseAudioContext ?? AC).prototype as BaseAudioContext;
    const origDecode = proto.decodeAudioData;
    proto.decodeAudioData = function (this: BaseAudioContext, data: ArrayBuffer, ok?: DecodeSuccessCallback | null, err?: DecodeErrorCallback | null) {
      const url = dataUrl.get(data);
      const wrapOk = (b: AudioBuffer) => {
        if (url) bufUrl.set(b, url);
        ok?.(b);
      };
      const r = origDecode.call(this, data, wrapOk, err ?? undefined) as unknown;
      if (r && typeof (r as Promise<AudioBuffer>).then === 'function') {
        return (r as Promise<AudioBuffer>).then((b) => {
          if (url) bufUrl.set(b, url);
          return b;
        });
      }
      return r as Promise<AudioBuffer>;
    } as typeof proto.decodeAudioData;
    const origStart = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (this: AudioBufferSourceNode, ...a: Parameters<AudioBufferSourceNode['start']>) {
      const url = this.buffer ? bufUrl.get(this.buffer) : undefined;
      if (url) w.__sfx.log.push({ kind: 'start', url, step: cur(), shown: shown(), t: performance.now() });
      return origStart.apply(this, a);
    };
  });
}

export async function sfxLog(page: Page): Promise<{ available: boolean; log: SfxRec[] }> {
  return page.evaluate(() => {
    const s = (window as unknown as { __sfx?: { available: boolean; log: SfxRec[] } }).__sfx;
    return s ?? { available: false, log: [] };
  });
}

// ---------------------------------------------------------------------------
// 타이틀·앨범·대화 기록
// ---------------------------------------------------------------------------

/** 타이틀 화면의 앨범 개수 글자('모은 추억 x / y')에서 [x, y] */
export async function titleAlbumCount(page: Page): Promise<[number, number]> {
  const t = (await page.locator('#vn-album-count').textContent()) ?? '';
  const m = t.match(/(\d+)\s*\/\s*(\d+)/);
  if (!m) throw new Error(`앨범 개수 글자를 읽지 못함: ${t}`);
  return [Number(m[1]), Number(m[2])];
}

export interface Badge {
  route: string;
  ending: string;
  reached: boolean;
  /** 보이는 글자(읽기 전용 sr-only 제외) */
  text: string;
  title: string;
}

/** 타이틀 엔딩 배지(.title-foot > .end-pair[data-route] > .badge[data-ending][data-reached]) */
export async function titleBadges(page: Page): Promise<Badge[]> {
  return page.locator('.title-screen .title-foot .badge').evaluateAll((els) =>
    els.map((b) => {
      const clone = b.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('.sr-only').forEach((x) => x.remove());
      return {
        route: (b.closest('.end-pair') as HTMLElement | null)?.dataset.route ?? '',
        ending: (b as HTMLElement).dataset.ending ?? '',
        reached: (b as HTMLElement).dataset.reached === '1',
        text: (clone.textContent ?? '').replace(/\s+/g, ' ').trim(),
        title: b.getAttribute('title') ?? '',
      };
    }),
  );
}

export async function openAlbum(page: Page) {
  await page.locator('.title-menu [data-action=album]').click();
  await expect(page.locator('[data-panel=album]')).toBeVisible();
  await expect.poll(async () => (await vi(page)).sheet).toBe('album');
}

/** 앨범 시트에서 본 것: 묶음 순서, 묶음별 칸 id·본 칸, 총 장수 글자, 썸네일 주소, 글자 전체 */
export async function albumSnapshot(page: Page) {
  return page.locator('[data-panel=album]').evaluate((root) => {
    const groups = [...root.querySelectorAll<HTMLElement>('.album-group')].map((g) => ({
      route: g.dataset.route ?? '',
      cards: [...g.querySelectorAll<HTMLElement>('.cg-card')].map((c) => c.dataset.cg ?? ''),
      seen: [...g.querySelectorAll<HTMLElement>('.cg-card[data-seen="1"]')].map((c) => c.dataset.cg ?? ''),
      count: g.querySelector('.album-count')?.textContent ?? '',
    }));
    return {
      groups,
      total: root.querySelector('.album-total')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      imgs: [...root.querySelectorAll('img')].map((i) => i.getAttribute('src') ?? ''),
      text: root.textContent ?? '',
      html: root.innerHTML,
    };
  });
}

/** 대화 기록을 열어 이름표·본문·이름 색 클래스를 읽고 닫는다 */
export async function readLog(page: Page): Promise<Array<{ name: string; text: string; k: string }>> {
  await page.locator('.hud button', { hasText: '기록' }).click();
  await expect(page.locator('[data-panel=log]')).toBeVisible();
  const items = await page.locator('[data-panel=log] .log-item').evaluateAll((els) =>
    els.map((e) => ({
      name: e.querySelector('.log-name')?.textContent ?? '',
      text: e.querySelector('.log-text')?.textContent ?? '',
      k: [...e.classList].find((c) => c.startsWith('k-')) ?? '',
    })),
  );
  await closeOverlays(page);
  return items;
}

/** 지금 대사창의 이름표 글자와 화자 표시(data-who) */
export async function nameTag(page: Page): Promise<{ name: string; who: string | null }> {
  return page.evaluate(() => {
    const tb = document.querySelector<HTMLElement>('#vn > .textbox');
    return { name: tb?.querySelector('.name')?.textContent ?? '', who: tb?.dataset.who ?? null };
  });
}

/** 점수 문자열 'A/H/K' */
export const pts = (p: Pts | null | undefined) => (p ? `${p.osana}/${p.tenko}/${p.koharu}` : 'null');
