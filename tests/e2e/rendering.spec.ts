/**
 * 렌더링 방식(src/ui/render-profile.ts → #vn[data-render])과 인물 톤 보정(play.css·performance.css)
 *
 * - Apple 터치 기기(apple-touch): 흐림·큰 그림자를 빼도 입력·회전·저장이 그대로이고, 타이틀 주 버튼이 읽힌다
 * - 인물 filter: 표준은 톤 보정 + drop-shadow, apple-touch 는 같은 톤 보정에서 drop-shadow 만 없다
 *   (실제 장면: 노을 교실 c7_friday 의 대사·비화자·선택지, 밤 축제 o5_festival·t5_festival·k6 의 유카타 —
 *    data-look yukata_* 밝기 규칙은 히든 히로인 코하루에게도 같다)
 * - iPadOS 데스크톱 모드(맥 UA + 터치)도 apple-touch, 맥 Safari(터치 없음)는 standard (WebKit 에서만)
 * - 햇살(.sunwash)과 배경 교체: 막(.veil) 뒤에서 한 번에 바뀌는 배경(stage.ts setBgInstant)은 햇살도 전환 없이 같은 순간에
 *   바뀌어 막이 걷힌 검은 화면에 잔상이 없고(e3f.010), 막이 걷힐 때는 이미 켜져 있다(e3f.175 → e3f.090).
 *   막 없는 크로스페이드 암전(e3t.070)은 햇살이 0.6초 전환으로 검은 배경과 함께 줄어든다(첫 프레임에 툭 꺼지지 않음)
 * 실제 iPad 의 GPU·메모리·발열 성능 검증은 아니다(Linux WebKit 흉내).
 */
import { writeFile } from 'node:fs/promises';
import { devices, expect, test, type Page } from '@playwright/test';
import { STORY } from '../../src/story';
import { advance, choose, cloneState, newGameState, settle, type StageEvent, type StepResult } from '../../src/engine/runner';
import { SaveManager } from '../../src/engine/save';
import { MemoryStore } from '../../src/engine/storage';
import type { GameState } from '../../src/engine/types';
import { continueFromTitle, freshBoot, settled, vi } from './eight-helpers';
import {
  advanceOne,
  boot,
  continueAt,
  EARLY_CHOICES,
  info,
  LATE_CHOICES_MET,
  LATE_CHOICES_UNMET,
  newGame,
  tapStage,
  toTitle,
  waitChoicesArmed,
  waitSettled,
} from './helpers';

const isApple = async (page: Page) => (await page.locator('#vn').getAttribute('data-render')) === 'apple-touch';

/** 계산된 filter 에서 drop-shadow(…) 를 뺀 색 보정 부분과 그림자 유무 */
function splitFilter(filter: string): { color: string; shadow: boolean } {
  const shadow = /drop-shadow\(/.test(filter);
  const color = filter
    .replace(/drop-shadow\((?:[^()]|\([^()]*\))*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return { color: color || 'none', shadow };
}

type Char = 'osana' | 'tenko' | 'koharu';

/** 무대 인물(.stage img.char)의 data-look·dim·계산 filter. char: osana / tenko / koharu */
async function charFilter(page: Page, char: Char) {
  const el = page.locator(`.stage img.char[src*="/char/${char}/"]:not(.leaving)`);
  await expect(el).toHaveCount(1);
  await expect(el).not.toHaveClass(/entering/);
  return el.evaluate((e) => ({
    look: e.getAttribute('data-look'),
    dim: e.classList.contains('dim'),
    tone: e.closest('.stage')?.getAttribute('data-tone') ?? null,
    filter: getComputedStyle(e).filter,
  }));
}

/** 표준이면 그림자 있음, apple-touch 면 없음. 색 보정은 둘 다 expected */
async function expectTone(page: Page, char: Char, expected: string, state: { dim: boolean; look?: string; tone: string }) {
  const f = await charFilter(page, char);
  const label = `${char} ${JSON.stringify(f)}`;
  expect(f.tone, label).toBe(state.tone);
  expect(f.dim, label).toBe(state.dim);
  if (state.look) expect(f.look, label).toBe(state.look);
  const { color, shadow } = splitFilter(f.filter);
  expect(color, label).toBe(expected);
  expect(shadow, label).toBe(!(await isApple(page)));
}

async function advanceTo(page: Page, stepId: string) {
  for (let i = 0; i < 20 && (await info(page)).step !== stepId; i++) await advanceOne(page);
  expect((await info(page)).step).toBe(stepId);
}

test('render profile preserves touch input, rotation, and saved progress', async ({ page }, ti) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await boot(page);
  await expect(page.locator('#vn')).toHaveAttribute('data-render', ti.project.name === 'ipad-webkit' ? 'apple-touch' : 'standard');
  // 타이틀 [새 게임](주 버튼)은 어느 렌더링에서도 그라데이션 바탕 + 흰 글자(흰 바탕에 흰 글자가 되지 않게)
  const primary = await page.locator('.title-menu [data-action=new]').evaluate((e) => {
    const s = getComputedStyle(e);
    return { image: s.backgroundImage, color: s.color, bg: s.backgroundColor };
  });
  expect(primary.image, JSON.stringify(primary)).toContain('gradient');
  expect(primary.color).toBe('rgb(255, 255, 255)');
  // 다른 메뉴 버튼은 밝은 바탕 + 어두운 글자
  const other = await page.locator('.title-menu .btn:not(.primary):not(:disabled)').first().evaluate((e) => getComputedStyle(e).color);
  expect(other).not.toBe('rgb(255, 255, 255)');
  await newGame(page);
  for (let n = 0; n < 6; n++) await advanceOne(page);
  const before = (await info(page)).step;
  const original = page.viewportSize()!;
  if (ti.project.name === 'ipad-webkit') {
    const effects = await page.locator('.textbox').evaluate(e => ({
      blur: getComputedStyle(e).getPropertyValue('backdrop-filter'),
      prefixed: getComputedStyle(e).getPropertyValue('-webkit-backdrop-filter'),
    }));
    expect([effects.blur, effects.prefixed].every(v => !v || v === 'none')).toBe(true);
    await expect(page.locator('.backdrop')).toHaveCSS('filter', 'none');
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect.poll(async () => (await info(page)).step).toBe(before);
    await page.setViewportSize(original);
  }
  await page.screenshot({ path: test.info().outputPath('game.png') });
  await page.reload();
  await page.locator('[data-action=continue]').click();
  await waitSettled(page);
  expect((await info(page)).step).toBe(before);
  await advanceOne(page);
  expect((await info(page)).step).not.toBe(before);
  expect(errors).toEqual([]);
});

test('노을 교실(c7_friday): 대사 중·비화자·선택지 모두 표준과 같은 톤 보정, apple-touch 는 그림자만 없다', async ({ page }) => {
  await boot(page);
  // c7.010 의 자동 저장 무대(장면 첫머리의 bg·show 를 마친 상태) 그대로 이어서 실제 대본을 진행한다
  await continueAt(page, {
    sceneId: 'c7_friday',
    stepId: 'c7.010',
    stage: {
      bg: 'classroom_evening',
      bgm: 'evening',
      chars: {
        osana: { pos: 'left', expr: 'neutral', outfit: 'uniform', hair: 'default' },
        tenko: { pos: 'right', expr: 'smile', outfit: 'uniform', hair: 'default' },
      },
      order: ['osana', 'tenko'],
      cg: null,
    },
  });
  const say = 'sepia(0.08) brightness(0.97)';
  const faded = 'sepia(0.08) brightness(0.88) saturate(0.78) contrast(0.95)';
  // c7.020: 전학생 대사 → 소꿉친구는 비화자(바램)
  await advanceTo(page, 'c7.020');
  await expectTone(page, 'tenko', say, { dim: false, tone: 'evening' });
  await expectTone(page, 'osana', faded, { dim: true, tone: 'evening' });
  // c7.030: 독백(말하는 인물 없음) → 둘 다 바래지 않는다
  await advanceTo(page, 'c7.030');
  await expectTone(page, 'osana', say, { dim: false, tone: 'evening' });
  await expectTone(page, 'tenko', say, { dim: false, tone: 'evening' });
  // c7.ch: 노을 선택지 → 둘 다 바램(예전 apple-touch 는 여기서 표준 규칙이 이겨 큰 그림자가 되살아났다)
  await advanceOne(page);
  expect((await info(page)).frame).toBe('choice');
  await waitChoicesArmed(page);
  await expectTone(page, 'osana', faded, { dim: false, tone: 'evening' });
  await expectTone(page, 'tenko', faded, { dim: false, tone: 'evening' });
  await page.screenshot({ path: test.info().outputPath('evening-choice.png') });
});

for (const [char, scene, from, steps, look] of [
  ['osana', 'o5_festival', 'o5.020', ['o5.030', 'o5.036'], 'yukata_default'],
  ['tenko', 't5_festival', 't5.020', ['t5.030', 't5.040'], 'yukata_ponytail'],
  // 코하루: 축제 거리 끝 마지막 등롱길(kh_lantern_lane, 밤)로 옮겨 유카타로 다시 등장(k6.070 → k6.080), 주인공 대사 중(k6.090)
  ['koharu', 'k6', 'k6.070', ['k6.080', 'k6.090'], 'yukata_default'],
] as const) {
  test(`밤 축제(${scene}): 유카타 ${char} 은 대사 중·혼자 있는 비화자 모두 밝기 1.04`, async ({ page }) => {
    await boot(page);
    // 축제 거리 배경이 붙은 뒤의 첫 줄에서 이어, 대본의 show(유카타 등장)부터 실제로 진행한다
    await continueAt(page, {
      sceneId: scene,
      stepId: from,
      route: char,
      stage: { bg: 'festival_street', bgm: 'festival', chars: {}, order: [], cg: null },
    });
    // 대본의 밤 장면은 히로인이 늘 혼자라 바래는 상태(dim)가 없다: 독백·주인공 대사 중에도 1.04
    for (const step of steps) {
      await advanceTo(page, step);
      await expectTone(page, char, 'brightness(1.04) saturate(0.98)', { dim: false, look, tone: 'night' });
    }
    await page.screenshot({ path: test.info().outputPath(`yukata-${char}.png`) });
  });
}

test('밤 두 사람(대본에 없는 구성): 유카타 비화자·선택지 0.98, 교복은 밤 톤 그대로(apple-touch 는 그림자만 없음)', async ({ page }) => {
  // 지금 대본의 밤 장면은 유카타 한 명뿐이고 밤 선택지도 없다. 저장 데이터로 무대를 구성해(게임이 그 무대를 그린다)
  // 비화자·선택지·교복 밤 톤 규칙을 확인한다
  const night = (outfit: 'uniform' | 'yukata') => ({
    bg: 'festival_street',
    bgm: null,
    chars: {
      osana: { pos: 'left', expr: 'smile', outfit, hair: 'default' },
      tenko: { pos: 'right', expr: 'smile', outfit, hair: 'ponytail' },
    },
    order: ['osana', 'tenko'],
    cg: null,
  });
  await boot(page);
  // o5.040: 소꿉친구 대사 → 전학생은 비화자
  await continueAt(page, { sceneId: 'o5_festival', stepId: 'o5.040', route: 'osana', stage: night('yukata') });
  await expectTone(page, 'osana', 'brightness(1.04) saturate(0.98)', { dim: false, look: 'yukata_default', tone: 'night' });
  await expectTone(page, 'tenko', 'brightness(0.98) saturate(0.92)', { dim: true, look: 'yukata_ponytail', tone: 'night' });
  // 선택지(c3.ch)를 밤 무대로: 둘 다 0.98
  await toTitle(page);
  await continueAt(page, { sceneId: 'c3_break', stepId: 'c3.ch', stage: night('yukata') });
  expect((await info(page)).frame).toBe('choice');
  await expectTone(page, 'osana', 'brightness(0.98) saturate(0.92)', { dim: false, tone: 'night' });
  await expectTone(page, 'tenko', 'brightness(0.98) saturate(0.92)', { dim: false, tone: 'night' });
  // 교복(비유카타) 밤: 표준 밤 톤 보정. apple-touch 는 drop-shadow 만 없다
  await toTitle(page);
  await continueAt(page, { sceneId: 'o5_festival', stepId: 'o5.040', route: 'osana', stage: night('uniform') });
  await expectTone(page, 'osana', 'brightness(0.86) saturate(0.88) contrast(0.98)', { dim: false, look: 'uniform_default', tone: 'night' });
  await expectTone(page, 'tenko', 'brightness(0.78) saturate(0.7) contrast(0.95)', { dim: true, look: 'uniform_ponytail', tone: 'night' });
});

test('WebKit: iPadOS 데스크톱 모드(맥 UA + 터치)는 apple-touch, 맥 Safari(터치 없음)는 standard', async ({ browser, browserName }) => {
  test.skip(browserName !== 'webkit', 'Safari 식 UA·navigator 판별은 WebKit 에서 확인');
  // Playwright WebKit(Linux)은 navigator.platform 이 Linux·maxTouchPoints 가 0 이라, iPadOS 13+ 기본값(데스크톱 웹사이트 모드)을
  // 흉내 내려면 맥 UA 에 platform·maxTouchPoints 를 덮어쓴다(실제 iPad 에서 확인한 것은 아니다)
  const macUa = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
  const cases = [
    { name: 'iPadOS 데스크톱 모드', touchPoints: 5, expected: 'apple-touch', use: { ...devices['iPad (gen 7) landscape'], userAgent: macUa } },
    { name: '맥 Safari', touchPoints: 0, expected: 'standard', use: { viewport: { width: 1280, height: 720 }, userAgent: macUa } },
  ];
  for (const c of cases) {
    const ctx = await browser.newContext({ ...c.use, baseURL: test.info().project.use.baseURL });
    try {
      await ctx.addInitScript((tp) => {
        Object.defineProperty(Navigator.prototype, 'platform', { configurable: true, get: () => 'MacIntel' });
        Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { configurable: true, get: () => tp });
      }, c.touchPoints);
      const p = await ctx.newPage();
      await p.goto('./?debug');
      const seen = await p.evaluate(() => ({ ua: navigator.userAgent, platform: navigator.platform, touch: navigator.maxTouchPoints }));
      expect(seen.ua, c.name).toContain('Macintosh');
      expect(seen.platform, c.name).toBe('MacIntel');
      expect(seen.touch, c.name).toBe(c.touchPoints);
      await expect(p.locator('#vn'), c.name).toHaveAttribute('data-render', c.expected);
    } finally {
      await ctx.close();
    }
  }
});

// ---------------------------------------------------------------------------
// 햇살(.sunwash)과 배경 교체
// ---------------------------------------------------------------------------

/**
 * 실제 대본·실행기(src/engine/runner)로 picks 대로 진행해, target 줄 바로 앞 블로킹 프레임(대사·카드)의 상태를
 * 자동 저장 원문(SaveManager 가 쓰는 그대로)으로 만든다. 이어하기 후 한 번 넘기면 target 줄의 연출(events)이 실제로 돈다.
 */
function autoSaveBefore(target: string, picks: Readonly<Record<string, string>>): { raw: string; prev: string; events: StageEvent[] } {
  const st = newGameState(STORY);
  let r: StepResult | null = settle(STORY, st);
  let prev: { state: GameState; id: string; t: string } | null = null;
  for (let guard = 0; r && guard < 20_000; guard++) {
    const step = r.step;
    if (step.id === target) {
      if (!prev || (prev.t !== 'say' && prev.t !== 'card')) throw new Error(`${target} 직전이 대사·카드가 아님: ${prev?.t}/${prev?.id}`);
      const store = new MemoryStore(true);
      const saves = new SaveManager(store, STORY, { hasBg: () => true, hasSprite: () => true, hasBgm: () => true });
      saves.write('auto', prev.state, { sceneTitle: STORY.scenes[prev.state.sceneId].title, text: '', route: prev.state.route });
      return { raw: store.get(saves.slotKey('auto'))!, prev: prev.id, events: r.events };
    }
    if (step.t === 'ending') break;
    prev = { state: cloneState(st), id: step.id, t: step.t };
    if (step.t === 'choice') {
      const pick = picks[step.id];
      if (!pick) throw new Error(`고를 옵션이 없음: ${step.id}`);
      r = choose(STORY, st, pick);
    } else r = advance(STORY, st);
  }
  throw new Error(`대본에서 ${target} 에 닿지 못함`);
}

/** 코하루를 만나는 흐름(초반 넷 모두 '함께' c → kh.met, 후반 여섯은 a). e3_rain4(e3f.*)를 지난다 */
const MET_PICKS = Object.fromEntries([...EARLY_CHOICES.map((c) => [c, 'c']), ...LATE_CHOICES_MET.map((c) => [c, 'a'])]);
/** 만나지 않는 흐름(초반·후반 모두 a). e3_rain3(e3t.*)를 지난다 */
const UNMET_PICKS = Object.fromEntries([...EARLY_CHOICES, ...LATE_CHOICES_UNMET].map((c) => [c, 'a']));
const bgEvents = (events: StageEvent[]) => events.filter((e) => e.kind === 'bg');

interface SunSample {
  /** 기록 시작부터 ms */
  t: number;
  /** raf: 화면 프레임, mut: 배경 레이어·무대 톤이 바뀐 순간(DOM 변경 직후, 그리기 전), start·end: 기록 시작·끝, now: 테스트가 읽은 순간 */
  src: 'raf' | 'mut' | 'start' | 'end' | 'now';
  step: string | null;
  /** 막(.stage > .veil) 계산 opacity 와 on 클래스 */
  veil: number;
  veilOn: boolean;
  /** 햇살(.stage > .sunwash) 계산 opacity */
  sun: number;
  /** 맨 앞 배경(.chars 바로 앞 .bg-layer — stage.ts raiseBg)의 data-bg·on·계산 opacity */
  front: string | null;
  frontOn: boolean;
  frontOp: number;
  tone: string | null;
}
/** 햇살의 opacity 전환 사건(transitionrun·start·end·cancel) */
interface SunEvent {
  t: number;
  type: string;
  step: string | null;
}
interface SunProbe {
  /** 지금 표본(기록 중이면 기록에도 남긴다) */
  now: () => SunSample;
  start: () => void;
  stop: () => { samples: SunSample[]; events: SunEvent[] };
}

/**
 * 페이지 안 햇살 관찰기(window.__sun). start 뒤로 rAF 마다, 그리고 배경 레이어·무대 톤이 바뀐 순간(MutationObserver)마다
 * 막·햇살·맨 앞 배경을 표본으로 남기고, 햇살 opacity 전환 사건을 기록한다. 바뀐 순간의 표본은 rAF 가 성긴 엔진(WebKit)에서도
 * '검은 배경이 맨 앞이 된 그때'의 햇살 값을 놓치지 않게 한다(계산 스타일을 읽을 뿐 무대는 건드리지 않는다)
 */
async function installSunProbe(page: Page) {
  await page.evaluate(() => {
    const vn = document.getElementById('vn');
    const stage = vn?.querySelector<HTMLElement>('.stage');
    const sun = stage?.querySelector<HTMLElement>(':scope > .sunwash');
    const veil = stage?.querySelector<HTMLElement>(':scope > .veil');
    const chars = stage?.querySelector<HTMLElement>(':scope > .chars');
    if (!vn || !stage || !sun || !veil || !chars) throw new Error('무대 요소(.stage > .sunwash·.veil·.chars)를 찾지 못함');
    const op = (e: Element) => Number(getComputedStyle(e).opacity);
    let t0 = performance.now();
    const snap = (src: SunSample['src']): SunSample => {
      const f = chars.previousElementSibling as HTMLElement | null;
      const bg = f?.classList.contains('bg-layer') ? f : null;
      return {
        t: Math.round(performance.now() - t0),
        src,
        step: vn.dataset.step ?? null,
        veil: op(veil),
        veilOn: veil.classList.contains('on'),
        sun: op(sun),
        front: bg?.dataset.bg ?? null,
        frontOn: !!bg?.classList.contains('on'),
        frontOp: bg ? op(bg) : 0,
        tone: stage.dataset.tone ?? null,
      };
    };
    let rec: { samples: SunSample[]; events: SunEvent[]; on: boolean; mo: MutationObserver } | null = null;
    const types = ['transitionrun', 'transitionstart', 'transitionend', 'transitioncancel'];
    for (const ty of types) {
      sun.addEventListener(ty, (e) => {
        const te = e as TransitionEvent;
        if (rec?.on && te.target === sun && te.propertyName === 'opacity') {
          rec.events.push({ t: Math.round(performance.now() - t0), type: e.type, step: vn.dataset.step ?? null });
        }
      });
    }
    const probe: SunProbe = {
      now: () => {
        const s = snap('now');
        if (rec?.on) rec.samples.push(s);
        return s;
      },
      start: () => {
        if (rec?.on) throw new Error('햇살 관찰기가 이미 돌고 있음');
        t0 = performance.now();
        const samples: SunSample[] = [snap('start')];
        const mo = new MutationObserver((list) => {
          if (list.some((m) => m.target === stage || (m.target as Element).classList?.contains('bg-layer'))) samples.push(snap('mut'));
        });
        mo.observe(stage, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-bg', 'data-tone'] });
        const cur = { samples, events: [] as SunEvent[], on: true, mo };
        rec = cur;
        const tick = () => {
          if (!cur.on) return;
          samples.push(snap('raf'));
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },
      stop: () => {
        if (!rec?.on) throw new Error('햇살 관찰기가 돌고 있지 않음');
        rec.on = false;
        rec.mo.disconnect();
        rec.samples.push(snap('end'));
        return { samples: rec.samples, events: rec.events };
      },
    };
    (window as unknown as { __sun: SunProbe }).__sun = probe;
  });
}

const sunSnap = (page: Page) => page.evaluate(() => (window as unknown as { __sun: SunProbe }).__sun.now());
const sunStart = (page: Page) => page.evaluate(() => (window as unknown as { __sun: SunProbe }).__sun.start());
/** 기록을 멈추고 돌려준다(실패 분석용으로 시험 출력 폴더에도 남긴다) */
async function sunStop(page: Page, name: string) {
  const r = await page.evaluate(() => (window as unknown as { __sun: SunProbe }).__sun.stop());
  const file = test.info().outputPath(name);
  await writeFile(file, JSON.stringify(r, null, 1));
  await test.info().attach(name, { path: file, contentType: 'application/json' });
  return r;
}
/** 실패 메시지용 표본 요약(시각·출처, 맨 앞 배경=opacity, 막, 햇살) */
const brief = (xs: SunSample[]) =>
  xs
    .slice(0, 80)
    .map((s) => `${s.t}${s.src[0]} ${s.front ?? '-'}${s.frontOn ? '' : '(off)'}=${s.frontOp.toFixed(2)} 막${s.veil.toFixed(2)}${s.veilOn ? '+' : ''} 햇살${s.sun.toFixed(2)}`)
    .join(' | ');
/**
 * 그 표본에서 막이 무대를 덮고 있었는지: 막에 on 이 붙어 있거나(걷기 전) 계산 opacity 가 0.5 이상(걷는 중).
 * opacity 만으로 보지 않는 까닭: 병렬 부하로 WebKit 이 초당 몇 프레임만 그리면 전환 시각이 프레임 때만 나아가서,
 * 막이 켜진 뒤 첫 프레임 전에 배경이 바뀌는 순간에는 계산 opacity 가 아직 0 으로 읽혔다(그 화면에는 막도 잔상도 없다)
 */
const covered = (s: SunSample) => s.veilOn || s.veil >= 0.5;
/**
 * 지금 무대가 cond 를 만족할 때까지(실패하면 마지막 상태를 보여 준다). 기록 중이면 읽은 표본도 기록에 남는다:
 * 부하로 WebKit 이 프레임을 드물게 그리면 rAF 표본만으로는 전환 끝(완전히 검어짐)을 못 볼 수 있다
 */
async function waitSun(page: Page, label: string, cond: (s: SunSample) => boolean) {
  await expect
    .poll(
      async () => {
        const s = await sunSnap(page);
        return cond(s) ? 'ok' : JSON.stringify(s);
      },
      { message: label, timeout: 10_000 },
    )
    .toBe('ok');
}

/**
 * 무대를 한 번 눌러 다음 줄로 넘기고 연출이 끝날 때까지 기다린다. 연출 중의 두 번째 누름은 막·그림 기다림을 줄이므로(hurry)
 * 줄이 넘어가지 않았을 때(입력 잠금 등)만 4초 뒤에 다시 누른다(helpers.advanceOne 은 30ms 마다 다시 누른다)
 */
async function advanceOnce(page: Page): Promise<string | null> {
  const before = (await vi(page)).step;
  for (let k = 0; k < 3; k++) {
    await tapStage(page);
    const moved = await page
      .waitForFunction((s) => (window as unknown as { __vn: { info: () => { step: string | null } } }).__vn.info().step !== s, before, {
        timeout: 4000,
        polling: 25,
      })
      .then(
        () => true,
        () => false,
      );
    if (moved) {
      await settled(page);
      return (await vi(page)).step;
    }
  }
  throw new Error(`진행되지 않음: ${before}`);
}

test.describe('햇살(.sunwash)과 즉시·크로스페이드 배경 교체', () => {
  // 시간(ms) 대신 사건(전환 사건·표본 순서)과 문턱값으로 판정한다(병렬 부하·WebKit 의 성긴 rAF 에서도 같은 결론이 나게).
  // 결과는 Linux Chromium·WebKit 흉내이며 실제 기기 확인은 아니다
  test('막 덮인 암전(e3f.010): 햇살은 막 뒤에서 전환 없이 꺼져 걷힌 검은 화면에 남지 않고, 볕 드는 흰 막(e3f.175 → e3f.090) 뒤에서 다시 켜진다', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const rain = autoSaveBefore('e3f.010', MET_PICKS);
    expect(bgEvents(rain.events), 'e3f.010 은 검은 막(black) 뒤에서 그림 없는 암전으로 바뀐다').toEqual([{ kind: 'bg', bg: 'black', fx: 'black' }]);
    const lit = autoSaveBefore('e3f.090', MET_PICKS);
    expect(bgEvents(lit.events), 'e3f.090 은 흰 막(white) 뒤에서 볕 든 처마 배경으로 바뀐다').toEqual([{ kind: 'bg', bg: 'bg_after_rain', fx: 'white' }]);

    await freshBoot(page, { slots: { auto: rain.raw } });
    await continueFromTitle(page);
    expect((await vi(page)).step).toBe(rain.prev);
    await installSunProbe(page);
    // 시작: 그림 있는 낮 배경이 맨 앞이고 햇살이 켜져 있다(이어하기 직후의 전환이 끝날 때까지 기다림)
    await waitSun(page, `${rain.prev}: 낮 배경 + 햇살 켜짐`, (s) => !!s.front && s.front !== 'black' && s.frontOn && s.frontOp >= 0.99 && s.sun >= 0.95 && s.veil < 0.05);
    await page.waitForTimeout(300);

    // (1) 넘기기: 검은 막 → (막 뒤) 암전 → 막 걷힘
    await sunStart(page);
    expect(await advanceOnce(page)).toBe('e3f.010');
    await page.waitForTimeout(250);
    const r1 = await sunStop(page, 'sunwash-e3f010.json');
    const i0 = r1.samples.findIndex((s) => s.front === 'black' && s.frontOn);
    expect(i0, `검은 배경이 맨 앞이 되지 않음: ${brief(r1.samples)}`).toBeGreaterThanOrEqual(0);
    expect(covered(r1.samples[i0]), `검은 배경은 막이 덮인 동안 붙는다: ${brief(r1.samples)}`).toBe(true);
    const lifted = r1.samples.slice(i0).filter((s) => s.front === 'black' && s.veil < 0.2);
    expect(lifted.length, `막이 걷힌 뒤의 표본이 없음: ${brief(r1.samples)}`).toBeGreaterThan(0);
    // 수정 전: 햇살이 0.6초 페이드로 남아 막(약 0.35초)이 걷힌 검은 화면 오른쪽 위에 약 0.3초 비쳤다(최대 약 0.48)
    expect(
      lifted.filter((s) => s.sun > 0.05),
      `막이 걷힌 검은 화면에 햇살 잔상: ${brief(r1.samples)}`,
    ).toEqual([]);
    expect(
      r1.events.filter((e) => e.type === 'transitionrun' || e.type === 'transitionstart'),
      `막 뒤 즉시 교체(setBgInstant)인데 햇살 opacity 전환이 생김: ${brief(r1.samples)}`,
    ).toEqual([]);

    // (3) 쏟아지는 동안(암전 그대로) 줄을 넘겨 볕이 드는 줄 직전까지 → 흰 막 뒤에서 처마 배경 + 햇살 다시 켜짐
    for (let k = 0; k < 12 && (await vi(page)).step !== lit.prev; k++) await advanceOnce(page);
    expect((await vi(page)).step).toBe(lit.prev);
    await waitSun(page, `${lit.prev}: 암전 + 햇살 꺼짐`, (s) => s.front === 'black' && s.frontOn && s.sun <= 0.05 && s.veil < 0.05);
    await page.waitForTimeout(300);
    await sunStart(page);
    expect(await advanceOnce(page)).toBe('e3f.090');
    await page.waitForTimeout(250);
    const r3 = await sunStop(page, 'sunwash-e3f090.json');
    const j0 = r3.samples.findIndex((s) => s.front === 'bg_after_rain' && s.frontOn);
    expect(j0, `처마 배경이 맨 앞이 되지 않음: ${brief(r3.samples)}`).toBeGreaterThanOrEqual(0);
    expect(covered(r3.samples[j0]), `처마 배경은 흰 막이 덮인 동안 붙는다: ${brief(r3.samples)}`).toBe(true);
    const open = r3.samples.slice(j0).filter((s) => s.front === 'bg_after_rain' && s.veil < 0.2);
    expect(open.length, `막이 걷힌 뒤의 표본이 없음: ${brief(r3.samples)}`).toBeGreaterThan(0);
    expect(
      open.filter((s) => s.sun < 0.9),
      `막이 걷혔는데 햇살이 아직 덜 켜짐(막 뒤에서 같은 순간에 켜져야 함): ${brief(r3.samples)}`,
    ).toEqual([]);
    expect(r3.samples[r3.samples.length - 1].sun, `끝값: ${brief(r3.samples)}`).toBeGreaterThanOrEqual(0.95);
    expect(
      r3.events.filter((e) => e.type === 'transitionrun' || e.type === 'transitionstart'),
      `막 뒤 즉시 교체(setBgInstant)인데 햇살 opacity 전환이 생김: ${brief(r3.samples)}`,
    ).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('크로스페이드 암전(e3t.070, 미발견): 햇살은 첫 프레임에 툭 꺼지지 않고 0.6초 전환으로 검은 배경과 함께 줄어든다', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const rain = autoSaveBefore('e3t.070', UNMET_PICKS);
    expect(bgEvents(rain.events), 'e3t.070 은 막 없이 크로스페이드(fade)로 그림 없는 암전이 된다').toEqual([{ kind: 'bg', bg: 'black', fx: 'fade' }]);

    await freshBoot(page, { slots: { auto: rain.raw } });
    await continueFromTitle(page);
    expect((await vi(page)).step).toBe(rain.prev);
    await installSunProbe(page);
    await waitSun(page, `${rain.prev}: 낮 배경 + 햇살 켜짐`, (s) => !!s.front && s.front !== 'black' && s.frontOn && s.frontOp >= 0.99 && s.sun >= 0.95 && s.veil < 0.05);
    await page.waitForTimeout(300);

    await sunStart(page);
    expect(await advanceOnce(page)).toBe('e3t.070');
    // 햇살 전환(0.6초)과 검은 배경 페이드(0.55초)가 끝날 때까지
    await waitSun(page, 'e3t.070: 완전히 검어지고 햇살 꺼짐', (s) => s.front === 'black' && s.frontOp >= 0.99 && s.sun <= 0.05);
    await page.waitForTimeout(100);
    const r2 = await sunStop(page, 'sunwash-e3t070.json');
    const k0 = r2.samples.findIndex((s) => s.front === 'black' && s.frontOn);
    expect(k0, `검은 배경이 맨 앞이 되지 않음: ${brief(r2.samples)}`).toBeGreaterThanOrEqual(0);
    expect(r2.samples.filter((s) => s.veilOn), '크로스페이드 암전에는 막이 없다').toEqual([]);
    // 36cdd35 판(검은 배경 규칙에 transition: none)은 여기서 햇살이 0 으로 툭 꺼졌다
    expect(r2.samples[k0].sun, `검은 배경이 맨 앞이 된 첫 표본에서 햇살은 아직 켜져 있다: ${brief(r2.samples)}`).toBeGreaterThanOrEqual(0.9);
    expect(
      r2.events.filter((e) => e.type === 'transitionrun').length,
      `햇살 opacity 전환이 돌아야 한다(검은 배경과 함께 줄어듦): ${brief(r2.samples)}`,
    ).toBeGreaterThan(0);
    const dark = r2.samples.slice(k0).filter((s) => s.front === 'black' && s.frontOp >= 0.99);
    expect(dark.length, `완전히 검어진 표본이 없음: ${brief(r2.samples)}`).toBeGreaterThan(0);
    expect(dark.some((s) => s.sun <= 0.05), `완전히 검어진 뒤 햇살이 꺼지지 않음: ${brief(r2.samples)}`).toBe(true);
    expect(errors).toEqual([]);
  });
});
