/**
 * 코하루 루트 E2E(koharu.spec.ts) 전용 도우미.
 *
 * helpers.ts 는 다른 작업에서 바뀔 수 있어(선택 횟수·Info 형식 등) 여기서는 기대지 않고 필요한 것만 따로 둔다.
 * - 각 테스트는 빈 저장소에서 시작한다(freshBoot: 첫 문서에서만 localStorage 를 비우고, 필요하면 읽음 기록·저장을 넣는다).
 * - 긴 진행은 '읽은 대사 건너뛰기'로 빠르게 간다: 대본의 대사·카드 id 를 읽음 기록(ashita.global.read)에 미리 넣고,
 *   읽은 줄에서는 건너뛰기(S)를 켠다. 건너뛰기는 선택지·처음 보는 줄에서 스스로 멈추므로, 직접 보고 싶은 장면은
 *   읽음 기록에서 빼 둔다(그 장면은 무대를 눌러 한 줄씩 넘긴다). 건너뛰기 중에는 효과음이 나지 않는다(game.ts applyEvents).
 */
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { STORY } from '../../src/story';

export type Hid = 'osana' | 'tenko' | 'koharu';

/** window.__vn.info() (src/ui/game.ts debugInfo) 중 이 스펙이 쓰는 값 */
export interface KInfo {
  mode: string;
  step: string | null;
  frame: string | null;
  route: string | null;
  points: Record<Hid, number> | null;
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

/** 이름(코하루·나루세)이 화면에 나오면 안 되는 곳을 볼 때 쓰는 패턴 */
export const KOHARU_NAMES = /코하루|나루세/;
/**
 * 코하루가 그려진 CG 중 kh_ 접두가 아닌 것과 히든 루트 전용 CG(계약 6.5·9절). kh_* 와 함께 미발견 플레이에서는
 * 칸·제목·요청 어디에도 나오면 안 된다. end_group_* 는 route 가 group 으로 정해지기 전에는 요청하지 않는다.
 */
export const KOHARU_DRAWN_CGS = ['group_ice_four', 'group_frog', 'group_rain', 'end_koharu_coin', 'end_group_fireworks', 'end_group_morning'] as const;
/** 관람 전 숨김 CG 12장(CG_ORDER 순서): kh_* 6장 + 위 6장 */
export const HIDDEN_CGS = [
  'kh_meet', 'kh_draw', 'group_ice_four', 'group_frog', 'group_rain',
  'kh_relay', 'kh_confession', 'kh_home', 'kh_date', 'end_koharu_coin', 'end_group_fireworks', 'end_group_morning',
] as const;
/** CG id 가 숨김(코하루 흔적·히든 루트) 그림인가 */
export const isHiddenCg = (id: string) => id.startsWith('kh_') || (KOHARU_DRAWN_CGS as readonly string[]).includes(id);
/**
 * 미해금 플레이에서 받으면 안 되는 그림 주소(코하루 스프라이트, kh_ 배경·CG, 위 6장, 그 썸네일).
 * 빌드 해시 이름과 섞이지 않게 폴더까지 본다(group_ice_three 는 미발견 판 그림이라 해당하지 않는다)
 */
export const KOHARU_ASSET =
  /assets\/char\/koharu\/|assets\/(?:bg|cg)\/(?:thumb\/)?(?:kh_|(?:group_ice_four|group_frog|group_rain|end_koharu_coin|end_group_fireworks|end_group_morning)\.)/;
/** 히든 루트 전용 그림 주소(end_group_*): route 가 group 이 아닌 플레이에서는 요청하지 않는다 */
export const GROUP_ASSET = /assets\/cg\/(?:thumb\/)?end_group_/;
/** 앨범·타이틀 마크업에 미발견 플레이어에게 드러나면 안 되는 흔적(그림 id·루트 키·이름) */
export const HIDDEN_MARKUP = /kh_|koharu|group_ice_four|group_frog|group_rain|end_koharu_coin|end_group_|data-route="group"|네 사람/;

export async function kinfo(page: Page): Promise<KInfo> {
  return page.evaluate(() => (window as unknown as { __vn: { info: () => KInfo } }).__vn.info());
}

/** 장면 id → 그 장면의 대사·카드 id(대본 순서) */
export function sceneLines(sceneId: string): string[] {
  const sc = STORY.scenes[sceneId];
  if (!sc) throw new Error(`장면 없음: ${sceneId}`);
  return sc.steps.filter((s) => s.t === 'say' || s.t === 'card').map((s) => s.id);
}

/** 대본의 모든 대사·카드 id(건너뛰기용 읽음 기록). exclude 가 참인 장면·줄은 뺀다 */
export function lineIds(exclude: (sceneId: string, stepId: string) => boolean = () => false): string[] {
  const out: string[] = [];
  for (const sc of Object.values(STORY.scenes)) {
    for (const s of sc.steps) if ((s.t === 'say' || s.t === 'card') && !exclude(sc.id, s.id)) out.push(s.id);
  }
  return out;
}

export interface FreshOptions {
  /** 읽음 기록(건너뛰기 대상) */
  read?: string[];
  cgs?: string[];
  endings?: string[];
  /** 저장 칸 → 원문 JSON(localStorage 'ashita.save.<칸>') */
  slots?: Record<string, string>;
  /** 그 밖의 localStorage 키 → 원문(예: 옛 빌드가 쓴 'ashita.global.ext') */
  raw?: Record<string, string>;
  settings?: Record<string, number>;
}

/**
 * 빈 저장소로 게임을 연다. 첫 문서에서만(sessionStorage 표시) localStorage 를 비우고 기록·저장을 넣는다.
 * 새로고침·다시 열기에서는 건드리지 않는다(저장 왕복을 볼 수 있게). 설정(글자 즉시 표시 등)은 매번 넣는다.
 */
export async function freshBoot(page: Page, o: FreshOptions = {}) {
  await page.addInitScript((o) => {
    try {
      if (sessionStorage.getItem('kh-fresh')) return;
      sessionStorage.setItem('kh-fresh', '1');
      localStorage.clear();
      if (o.read || o.cgs || o.endings) {
        localStorage.setItem('ashita.global', JSON.stringify({ schema: 1, read: o.read ?? [], endings: o.endings ?? [], cgs: o.cgs ?? [] }));
      }
      for (const [k, v] of Object.entries(o.slots ?? {})) localStorage.setItem(`ashita.save.${k}`, v);
      for (const [k, v] of Object.entries(o.raw ?? {})) localStorage.setItem(k, v);
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

/** 연출(암전 등)이 끝나 블로킹 프레임이 표시될 때까지 */
export async function settled(page: Page, timeout = 20_000) {
  await page.waitForFunction(
    () => {
      const i = (window as unknown as { __vn: { info: () => KInfo } }).__vn.info();
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

/** 요소 가운데(또는 무대의 rx·ry 비율 자리)를 누른다. 터치 프로젝트는 탭 */
export async function press(page: Page, x: number, y: number) {
  if (test.info().project.use.hasTouch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

export async function tapStage(page: Page) {
  const box = await page.locator('.stage').boundingBox();
  if (!box) throw new Error('stage not visible');
  await press(page, box.x + box.width * 0.5, box.y + box.height * 0.35);
}

/** 대사 한 줄 진행(무대를 눌러 다음 프레임이 표시될 때까지) */
export async function line(page: Page): Promise<KInfo> {
  const before = await kinfo(page);
  if (before.mode !== 'play' || before.frame === 'choice' || before.frame === 'ending') {
    throw new Error(`대사가 아님: ${before.mode}/${before.frame}/${before.step}`);
  }
  for (let t = 0; t < 40; t++) {
    await tapStage(page);
    const moved = await page
      .waitForFunction(
        (s) => {
          const i = (window as unknown as { __vn: { info: () => KInfo } }).__vn.info();
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
      return kinfo(page);
    }
  }
  throw new Error(`진행되지 않음: ${before.step}`);
}

/** 보이는 선택지 옵션 id(화면 순서) */
export async function visibleOptions(page: Page): Promise<string[]> {
  await expect(page.locator('.choices.on')).toHaveAttribute('data-armed', '1');
  return page.locator('.choices.on .choice').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.option ?? ''));
}

/** 선택지에서 고른다(등장 연출이 끝나 누를 수 있게 된 뒤). 고르기 전 보이던 옵션을 돌려준다 */
export async function choose(page: Page, optionId: string): Promise<string[]> {
  const before = await kinfo(page);
  expect(before.frame, `선택지가 아님: ${before.step}`).toBe('choice');
  const shown = await visibleOptions(page);
  expect(shown, `${before.step} 에 ${optionId} 옵션이 없음`).toContain(optionId);
  await page.locator(`.choices.on .choice[data-option="${optionId}"]`).click();
  await page.waitForFunction(
    (s) => (window as unknown as { __vn: { info: () => KInfo } }).__vn.info().step !== s,
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
  stopAt?: (i: KInfo) => boolean;
  /** 선택지마다(고르기 전). options: 보이는 옵션 id */
  onChoice?: (i: KInfo, options: string[]) => Promise<void> | void;
  /** 한 줄씩 넘기는 대사마다(넘기기 전) */
  onLine?: (i: KInfo) => Promise<void> | void;
}

export interface RunResult {
  info: KInfo;
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
  for (let guard = 0; guard < 4000; guard++) {
    const i = await kinfo(page);
    if (i.mode === 'ending') return { info: i, choices, steps };
    if (i.mode !== 'play') throw new Error(`플레이 중이 아님: ${i.mode}`);
    if (o.stopAt?.(i)) return { info: i, choices, steps };
    if (i.frame === 'ending') {
      await page.waitForFunction(() => (window as unknown as { __vn: { info: () => KInfo } }).__vn.info().mode === 'ending', undefined, {
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
          const v = (window as unknown as { __vn: { info: () => KInfo } }).__vn.info();
          return !v.skip && (v.mode !== 'play' || (!v.typing && !v.transitioning));
        },
        undefined,
        { timeout: 60_000, polling: 50 },
      );
      continue;
    }
    steps.push(i.step!);
    await o.onLine?.(i);
    await line(page);
  }
  throw new Error('너무 깁니다');
}

export async function openMenu(page: Page) {
  await page.locator('.hud button', { hasText: '메뉴' }).click();
  await expect(page.locator('[data-panel=menu]')).toBeVisible();
}

/** 시트·메뉴를 모두 닫고 짧은 입력 잠금이 풀릴 때까지 */
export async function closeOverlays(page: Page) {
  for (let k = 0; k < 4 && (await kinfo(page)).overlays > 0; k++) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(120);
  }
  await expect.poll(async () => (await kinfo(page)).overlays).toBe(0);
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
  await page.locator(`[data-panel=save] .slot[data-slot="${slot}"]`).click();
  const ok = page.locator('[data-panel=confirm] [data-action=ok]');
  if (await ok.isVisible().catch(() => false)) await ok.click();
  await expect(page.locator(`[data-panel=save] .slot[data-slot="${slot}"] .slot-meta`)).toBeVisible();
  await closeOverlays(page);
}

/** 플레이 중이면 메뉴 → 불러오기, 타이틀이면 [불러오기] → 칸 → (확인) */
export async function loadFrom(page: Page, slot: string) {
  const i = await kinfo(page);
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
  await expect.poll(async () => (await kinfo(page)).overlays).toBe(0);
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
  await expect.poll(async () => (await kinfo(page)).overlays).toBe(0);
  await settled(page);
}

/** localStorage 의 저장 칸 JSON */
export async function readSlotJson(page: Page, slot: string): Promise<{
  schema: number;
  summary: { sceneTitle: string; text: string; route: string | null };
  state: { sceneId: string; stepId: string; points: Record<string, number>; flags: Record<string, unknown>; choices: Record<string, string>; route: string | null };
} | null> {
  return page.evaluate((k) => {
    const raw = localStorage.getItem(k);
    return raw ? JSON.parse(raw) : null;
  }, `ashita.save.${slot}`);
}

/**
 * 전역 기록(읽은 대사·본 CG 는 ashita.global, 엔딩은 세 키 ashita.global·.ext·.v2 의 합집합 — 게임이 읽는 그대로, 계약 6.4).
 * endingsMain 은 ashita.global 의 엔딩만
 */
export async function readGlobalRec(page: Page): Promise<{ read: string[]; endings: string[]; endingsMain: string[]; cgs: string[] }> {
  return page.evaluate(() => {
    const parse = (k: string) => {
      try {
        return JSON.parse(localStorage.getItem(k) ?? '{}') ?? {};
      } catch {
        return {};
      }
    };
    const g = parse('ashita.global');
    const endings: string[] = [];
    for (const k of ['ashita.global', 'ashita.global.ext', 'ashita.global.v2']) {
      const v = parse(k);
      for (const e of Array.isArray(v.endings) ? v.endings : []) if (!endings.includes(e)) endings.push(e);
    }
    return { read: g.read ?? [], endings, endingsMain: g.endings ?? [], cgs: g.cgs ?? [] };
  });
}

/** 897ae1f(SAVE_SCHEMA 3) 빌드가 실제로 쓴 저장 원문 고정 자료(tests/unit/fixtures/v3-saves.897ae1f.json, 계약 13절) */
export interface V3Save {
  name: string;
  /** 만든 방법(사람이 읽는 설명) */
  how: string;
  picks: string;
  sceneId: string;
  stepId: string;
  route: string | null;
  points: Record<Hid, number>;
  met: boolean;
  /** 같은 상태를 897ae1f 로 끝까지 진행한 결과 */
  old: { finalRoute: string; ending: string; finalPoints: Record<Hid, number> };
  /** localStorage 'ashita.save.<칸>' 값(JSON.stringify 하면 897ae1f 가 쓴 원문 그대로) */
  save: { schema: number; state: { sceneId: string; stepId: string; flags: Record<string, unknown> } } & Record<string, unknown>;
}
export interface V3Fixture {
  saves: V3Save[];
  /** 같은 빌드가 세 엔딩·CG 17장을 기록한 뒤 쓴 ashita.global·ashita.global.ext 원문(객체) */
  global: Record<string, unknown>;
}
let v3Cache: V3Fixture | null = null;
export function v3Fixture(): V3Fixture {
  v3Cache ??= JSON.parse(readFileSync(new URL('../unit/fixtures/v3-saves.897ae1f.json', import.meta.url), 'utf8')) as V3Fixture;
  return v3Cache;
}
export function v3Save(name: string): V3Save {
  const e = v3Fixture().saves.find((x) => x.name === name);
  if (!e) throw new Error(`897ae1f 저장 견본 없음: ${name}`);
  return e;
}
/** 897ae1f 저장 원문(localStorage 값 문자열) */
export const v3Raw = (name: string) => JSON.stringify(v3Save(name).save);

/**
 * 원하는 위치(장면·스텝)에서 [이어하기]로 시작한다. 새 게임의 자동 저장(지금 빌드의 스키마 4)을 받아 위치·점수·플래그·선택·루트·무대를 바꿔 넣는다.
 * (helpers.ts continueAt 과 같은 방식에 점수·플래그·선택을 더했다)
 */
export async function continueAtState(
  page: Page,
  at: {
    sceneId: string;
    stepId: string;
    route?: string | null;
    points?: Partial<Record<Hid, number>>;
    flags?: Record<string, boolean | number | string>;
    choices?: Record<string, string>;
    stage?: Record<string, unknown>;
  },
) {
  await newGame(page);
  await toTitle(page);
  await page.evaluate((at) => {
    const d = JSON.parse(localStorage.getItem('ashita.save.auto')!);
    d.state.sceneId = at.sceneId;
    d.state.stepId = at.stepId;
    d.state.route = at.route ?? null;
    d.state.points = { osana: 0, tenko: 0, koharu: 0, ...(at.points ?? {}) };
    d.state.flags = { ...(at.flags ?? {}) };
    d.state.choices = { ...(at.choices ?? {}) };
    d.state.stage = at.stage ?? { bg: 'black', bgm: null, chars: {}, order: [], cg: null };
    delete d.state.sceneEntry;
    const raw = JSON.stringify(d);
    localStorage.setItem('ashita.save.auto', raw);
    // 같은 탭의 쓰기에는 storage 알림이 오지 않으므로 다른 탭이 쓴 것처럼 알려 타이틀을 맞춘다(helpers.ts continueAt 과 같다)
    window.dispatchEvent(new StorageEvent('storage', { key: 'ashita.save.auto', newValue: raw, storageArea: localStorage }));
  }, at);
  await continueFromTitle(page);
  await expect.poll(async () => (await kinfo(page)).step).toBe(at.stepId);
}

/**
 * 화면(#vn 글자·대사창·선택지·document.title)에 코하루 이름이 나온 순간을 기록한다(페이지 안 MutationObserver, 새 문서마다 다시 건다).
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
  return page.evaluate(() => (window as unknown as { __nameHits: Array<{ where: string; text: string; step: string | null }> }).__nameHits ?? []);
}

/**
 * 화면에 나온 프레임 id 순서를 페이지 안에서 기록한다(rAF 마다 지금 프레임을 보고, 바뀌었을 때만 덧붙인다).
 * 건너뛰기로 지나가는 줄도 한 줄에 55ms 이상 머물러 대개 잡히지만, 장면 순서 확인처럼 '여러 줄 중 하나라도' 보는 데 쓴다.
 */
export async function watchSteps(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __seen: string[] };
    w.__seen = [];
    const tick = () => {
      try {
        const s = (window as unknown as { __vn?: { info: () => { step: string | null } } }).__vn?.info().step ?? null;
        if (s && w.__seen[w.__seen.length - 1] !== s) w.__seen.push(s);
      } catch {
        /* ignore */
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

export async function seenSteps(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __seen?: string[] }).__seen ?? []);
}

/** 프레임 id 목록 → 장면 id 순서(연속 중복 제거) */
export function scenesOf(steps: readonly string[]): string[] {
  const owner = new Map<string, string>();
  for (const sc of Object.values(STORY.scenes)) for (const s of sc.steps) owner.set(s.id, sc.id);
  const out: string[] = [];
  for (const id of steps) {
    const sc = owner.get(id);
    if (sc && out[out.length - 1] !== sc) out.push(sc);
  }
  return out;
}

/**
 * 효과음 재생 관찰(페이지 안, watchSteps 뒤에 건다). fetch 로 받은 오디오와 디코드 결과를 이어,
 * 오디오 첫 요청(fetch: 재생 요청 순간에 동기로 일어남)과 버퍼 재생(AudioBufferSourceNode.start)이 일어난 순간의
 * 프레임 id 와 '그 전에 화면에 나온 프레임 id'(watchSteps 기록)를 남긴다.
 * Web Audio 가 없으면 아무것도 걸지 않는다(available = false).
 */
export async function watchSfx(page: Page) {
  await page.addInitScript(() => {
    type Rec = { kind: 'fetch' | 'start'; url: string; step: string | null; shown: string[] };
    const w = window as unknown as { __sfx: { available: boolean; log: Rec[] }; __seen?: string[] };
    w.__sfx = { available: false, log: [] };
    const cur = () => {
      try {
        return (window as unknown as { __vn?: { info: () => { step: string | null } } }).__vn?.info().step ?? null;
      } catch {
        return null;
      }
    };
    const shown = () => [...(w.__seen ?? [])];
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
      if (/\.(mp3|ogg|m4a|wav)(\?|$)/.test(url)) w.__sfx.log.push({ kind: 'fetch', url, step: cur(), shown: shown() });
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
      if (url) w.__sfx.log.push({ kind: 'start', url, step: cur(), shown: shown() });
      return origStart.apply(this, a);
    };
  });
}

export async function sfxLog(page: Page) {
  return page.evaluate(() => {
    const s = (window as unknown as { __sfx?: { available: boolean; log: Array<{ kind: string; url: string; step: string | null; shown: string[] }> } }).__sfx;
    return s ?? { available: false, log: [] };
  });
}

/** 타이틀 화면의 앨범 개수 글자('모은 추억 x / y')에서 [x, y] */
export async function titleAlbumCount(page: Page): Promise<[number, number]> {
  const t = (await page.locator('#vn-album-count').textContent()) ?? '';
  const m = t.match(/(\d+)\s*\/\s*(\d+)/);
  if (!m) throw new Error(`앨범 개수 글자를 읽지 못함: ${t}`);
  return [Number(m[1]), Number(m[2])];
}

export async function openAlbum(page: Page) {
  await page.locator('.title-menu [data-action=album]').click();
  await expect(page.locator('[data-panel=album]')).toBeVisible();
  await expect.poll(async () => (await kinfo(page)).sheet).toBe('album');
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
