/**
 * 렌더링 방식(src/ui/render-profile.ts → #vn[data-render])과 인물 톤 보정(play.css·performance.css)
 *
 * - Apple 터치 기기(apple-touch): 흐림·큰 그림자를 빼도 입력·회전·저장이 그대로이고, 타이틀 주 버튼이 읽힌다
 * - 인물 filter: 표준은 톤 보정 + drop-shadow, apple-touch 는 같은 톤 보정에서 drop-shadow 만 없다
 *   (실제 장면: 노을 교실 c7_friday 의 대사·비화자·선택지, 밤 축제 o5_festival·t5_festival 의 유카타)
 * - iPadOS 데스크톱 모드(맥 UA + 터치)도 apple-touch, 맥 Safari(터치 없음)는 standard (WebKit 에서만)
 * 실제 iPad 의 GPU·메모리·발열 성능 검증은 아니다(Linux WebKit 흉내).
 */
import { devices, expect, test, type Page } from '@playwright/test';
import { advanceOne, boot, continueAt, info, newGame, toTitle, waitChoicesArmed, waitSettled } from './helpers';

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

/** 무대 인물(.stage img.char)의 data-look·dim·계산 filter. char: osana / tenko */
async function charFilter(page: Page, char: 'osana' | 'tenko') {
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
async function expectTone(page: Page, char: 'osana' | 'tenko', expected: string, state: { dim: boolean; look?: string; tone: string }) {
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
