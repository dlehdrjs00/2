/**
 * 저장소와 화면이 어긋나지 않는지: 다른 탭의 기록·자동 저장 변경, [이어하기] 시점 확인, 손상·이상한 저장 데이터,
 * 브라우저 저장소를 쓸 수 없을 때의 안내, 낮은 화면의 저장 카드 썸네일 비율.
 * 화면 크기를 직접 바꾸거나 두 탭을 여는 검사라 desktop 프로젝트에서만 돈다.
 */
import { expect, test, type Page } from '@playwright/test';
import { advanceOne, boot, info, newGame, readGlobal, readSlot, toTitle, waitSettled } from './helpers';

test.beforeEach(async ({}, ti) => {
  test.skip(ti.project.name !== 'desktop', '두 탭·뷰포트를 직접 다루는 검사(desktop 프로젝트에서만)');
});

type Box = { left: number; top: number; right: number; bottom: number; width: number; height: number };
const overlap = (a: Box, b: Box) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;

const activeAction = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.action ?? null);

test('다른 탭이 엔딩·본 CG·자동 저장을 바꾸면 떠 있는 타이틀(배지·앨범 수·[이어하기])이 새로고침 없이 맞춰진다', async ({ page, context }) => {
  await boot(page);
  await newGame(page);
  await advanceOne(page);
  await toTitle(page);
  await expect(page.locator('[data-action=continue]')).toBeEnabled();
  await expect(page.locator('#vn-album-count')).toContainText('0 / 11');
  await expect(page.locator('.title-foot [data-ending=osana]')).toHaveAttribute('data-reached', '0');

  // 다른 탭(같은 저장소)에서 아카네 엔딩과 CG 3장을 보고, 엔딩으로 자동 저장이 지워졌다
  const other = await context.newPage();
  await other.goto('./');
  await other.evaluate(() => {
    const g = JSON.parse(localStorage.getItem('ashita.global') ?? '{"schema":1,"read":[],"endings":[]}');
    g.endings = [...new Set([...(g.endings ?? []), 'osana'])];
    g.cgs = ['rain_osana', 'door_osana', 'homeward_osana'];
    localStorage.setItem('ashita.global', JSON.stringify(g));
    localStorage.removeItem('ashita.save.auto');
  });
  await expect(page.locator('.title-foot [data-ending=osana]')).toHaveAttribute('data-reached', '1');
  await expect(page.locator('#vn-album-count')).toContainText('3 / 11');
  await expect(page.locator('[data-action=continue]')).toBeDisabled();
  expect((await info(page)).mode).toBe('title');

  // 키보드로 앨범을 연 채로 다른 탭이 또 기록을 바꿔 아래 타이틀이 다시 그려져도,
  // 닫으면 포커스는 (새로 그려진) [추억 앨범]으로 돌아오고 수는 앨범과 같다
  await page.locator('[data-action=album]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-panel=album] .panel-body')).toHaveAttribute('data-seen', '3');
  await other.evaluate(() => {
    const g = JSON.parse(localStorage.getItem('ashita.global')!);
    g.cgs = [...g.cgs, 'cats_tenko'];
    localStorage.setItem('ashita.global', JSON.stringify(g));
  });
  await expect(page.locator('#vn-album-count')).toContainText('4 / 11');
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await info(page)).overlays).toBe(0);
  await expect.poll(() => activeAction(page)).toBe('album');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-panel=album] .panel-body')).toHaveAttribute('data-seen', '4');
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await info(page)).overlays).toBe(0);
  await expect(page.locator('#vn-album-count')).toContainText('4 / 11');
  await other.close();
});

test('[이어하기]: 누른 시점의 자동 저장이 보이던 것과 다르면 다시 그려 묻고, 비어 있으면 버튼을 끈다', async ({ page }) => {
  await boot(page);
  await newGame(page);
  await advanceOne(page);
  await toTitle(page);
  const shown = await page.locator('#vn-continue-date').textContent();
  expect(shown).toBeTruthy();
  // 이 탭이 모르는 사이(같은 탭의 쓰기에는 storage 알림이 오지 않는다) 자동 저장이 다른 날짜 위치로 바뀐다
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('ashita.save.auto')!);
    d.state.sceneId = 'c4_lunch';
    d.state.stepId = 'c4.010';
    d.state.stage = { bg: 'black', bgm: null, chars: {}, order: [], cg: null };
    delete d.state.sceneEntry;
    localStorage.setItem('ashita.save.auto', JSON.stringify(d));
  });
  await page.locator('[data-action=continue]').click();
  await expect(page.locator('[data-panel=confirm] .dialog-msg')).toContainText('자동 저장이 바뀌었어요');
  const now = await page.locator('#vn-continue-date').textContent();
  expect(now, '확인창 아래 타이틀의 날짜도 새 위치로').not.toBe(shown);
  await expect(page.locator('[data-panel=confirm] .dialog-msg')).toContainText(now!);
  // Esc = 취소: 타이틀에 그대로
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await info(page)).overlays).toBe(0);
  expect((await info(page)).mode).toBe('title');
  // 이제 보이는 날짜와 같으므로 바로 이어 간다
  await page.waitForTimeout(600);
  await page.locator('[data-action=continue]').click();
  await expect(page.locator('#vn')).toHaveAttribute('data-mode', 'play');
  await waitSettled(page);
  expect((await info(page)).step).toBe('c4.010');

  // 자동 저장이 사라졌으면 '비어 있어요'만 띄우지 않고 이유를 알리며 버튼을 끈다
  await toTitle(page);
  await expect(page.locator('[data-action=continue]')).toBeEnabled();
  await page.evaluate(() => localStorage.removeItem('ashita.save.auto'));
  await page.locator('[data-action=continue]').click();
  await expect(page.locator('.toast')).toContainText('자동 저장이 없어요');
  await expect(page.locator('[data-action=continue]')).toBeDisabled();
  expect((await info(page)).mode).toBe('title');
});

test('저장 데이터의 모르는 CG id 는 불러올 때 버리고, 전역 기록(추억 앨범)·자동 저장에 남기지 않는다', async ({ page }) => {
  await boot(page);
  await newGame(page);
  await advanceOne(page);
  await toTitle(page);
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('ashita.save.auto')!);
    d.state.stage.cg = 'no_such_cg';
    localStorage.setItem('ashita.save.auto', JSON.stringify(d));
  });
  await page.locator('[data-action=continue]').click();
  await expect(page.locator('#vn')).toHaveAttribute('data-mode', 'play');
  await waitSettled(page);
  await advanceOne(page);
  await page.evaluate(() => new Promise((r) => setTimeout(r, 500)));
  expect((await readGlobal(page)).cgs ?? []).not.toContain('no_such_cg');
  const auto = (await readSlot(page, 'auto')) as unknown as { state: { stage: { cg?: string | null } } };
  expect(auto.state.stage.cg ?? null).toBeNull();
});

test('불러오기: 저장 시각을 읽을 수 없는 칸은 \'가장 최근\'으로 뽑히지 않고, 빈 정보는 이상하게 읽히지 않는다', async ({ page }) => {
  await boot(page);
  await newGame(page);
  await toTitle(page);
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('ashita.save.auto')!);
    localStorage.setItem('ashita.save.1', JSON.stringify({ ...d, savedAt: new Date(Date.now() + 60_000).toISOString() }));
    localStorage.setItem('ashita.save.5', JSON.stringify({ ...d, savedAt: 'garbage', summary: null }));
  });
  await page.locator('[data-action=load]').click();
  const s1 = page.locator('[data-panel=load] .slot[data-slot="1"]');
  const s5 = page.locator('[data-panel=load] .slot[data-slot="5"]');
  await expect(s5).toBeVisible();
  await expect(s1).toHaveClass(/latest/);
  await expect(s5).not.toHaveClass(/latest/);
  await expect(s5.locator('.slot-meta')).toHaveText('날짜 모름');
  const label = (await s5.getAttribute('aria-label')) ?? '';
  expect(label).toMatch(/^슬롯 5/);
  expect(label).not.toMatch(/, \.|: 슬롯 5/);
  // 정보 줄 높이는 정상 칸과 같다(썸네일만 커지지 않음)
  const h = await page.evaluate(() =>
    ['1', '5'].map((s) => document.querySelector(`[data-panel=load] .slot[data-slot="${s}"] .slot-thumb`)!.getBoundingClientRect().height),
  );
  expect(Math.abs(h[0] - h[1])).toBeLessThanOrEqual(1);
});

test('자동 저장이 손상됐을 때 안내는 최근 수동 저장에서 \'이어서 할 수 있어요\'라고 알린다', async ({ page }) => {
  await boot(page);
  await newGame(page);
  await toTitle(page);
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('ashita.save.auto')!);
    localStorage.setItem('ashita.save.2', JSON.stringify(d));
    localStorage.setItem('ashita.save.auto', '{"schema":2,"game":"ashita-mo-issho","state":{oops');
  });
  await page.locator('[data-action=continue]').click();
  await expect(page.locator('[data-panel=confirm] .dialog-msg')).toContainText('수동 저장(슬롯 2)에서 이어서 할 수 있어요.');
  await page.locator('[data-panel=confirm] [data-action=cancel]').click();
});

test('브라우저 저장소를 쓸 수 없으면: 낮은 타이틀의 안내가 배지를 가리지 않고, 저장할 때마다 이 탭에서만 남는다고 알린다', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new Error('denied');
      },
    });
  });
  await page.goto('./?debug');
  await expect(page.locator('#vn')).toHaveAttribute('data-mode', 'title');
  await expect(page.locator('.toast')).toContainText('이 탭에서만');
  for (const [w, h] of [
    [667, 375],
    [844, 390],
    [1280, 720],
  ] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const r = await page.evaluate(() => ({
      toast: document.querySelector('.toast')!.getBoundingClientRect().toJSON(),
      others: [...document.querySelectorAll('.title-foot .badge, .title-screen .ver, .title-menu .btn, .logo')]
        .filter((e) => e.getClientRects().length)
        .map((e) => e.getBoundingClientRect().toJSON()),
    }));
    for (const o of r.others) expect(overlap(r.toast, o), `${w}x${h}: 토스트가 타이틀 요소를 가림`).toBe(false);
    expect(r.toast.right, `${w}x${h}`).toBeLessThanOrEqual(w + 0.5);
  }
  await page.locator('[data-action=new]').click();
  await expect(page.locator('#vn')).toHaveAttribute('data-mode', 'play');
  await waitSettled(page);
  await page.keyboard.press('F5');
  await expect(page.locator('.toast')).toContainText('퀵저장했어요 · 이 탭을 닫으면 사라져요');
  await page.keyboard.press('Escape');
  await page.locator('[data-panel=menu] [data-action=save]').click();
  await expect(page.locator('[data-panel=save] .panel-hint.warn')).toContainText('이 탭을 닫거나 새로고침하면 저장이 사라져요');
  await page.locator('[data-panel=save] .slot[data-slot="1"]').click();
  await expect(page.locator('.toast')).toContainText('슬롯 1에 저장했어요 · 이 탭을 닫으면 사라져요');
});

test('낮은 화면의 저장 카드 썸네일은 진짜 16:9 이고 카드 안에 들어간다(CG·양옆 인물이 잘리지 않게)', async ({ page }) => {
  await boot(page);
  await newGame(page);
  await toTitle(page);
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('ashita.save.auto')!);
    const put = (slot: string, stage: object) => localStorage.setItem(`ashita.save.${slot}`, JSON.stringify({ ...d, state: { ...d.state, stage } }));
    const ch = (pos: string) => ({ pos, expr: 'smile', outfit: 'uniform', hair: 'default' });
    put('1', { bg: 'classroom_day', bgm: null, chars: { osana: ch('left'), tenko: ch('right') }, order: ['osana', 'tenko'], cg: null });
    put('2', { bg: 'classroom_day', bgm: null, chars: {}, order: [], cg: 'selfie_tenko' });
  });
  for (const [w, h] of [
    [667, 375],
    [844, 390],
    [560, 700],
  ] as const) {
    await page.setViewportSize({ width: w, height: h });
    if (!(await page.locator('[data-panel=load]').isVisible())) await page.locator('[data-action=load]').click();
    await expect(page.locator('[data-panel=load] .slot[data-slot="2"]')).toBeVisible();
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const r = await page.evaluate(() =>
      [...document.querySelectorAll('[data-panel=load] .slot:not(.empty)')].map((b) => {
        const t = b.querySelector('.slot-thumb')!.getBoundingClientRect();
        const c = b.getBoundingClientRect();
        return { ratio: t.width / t.height, inside: t.top >= c.top - 0.5 && t.bottom <= c.bottom + 0.5 && t.left >= c.left - 0.5, w: t.width };
      }),
    );
    expect(r.length, `${w}x${h}`).toBeGreaterThanOrEqual(2);
    for (const x of r) {
      expect(x.ratio, `${w}x${h}: 썸네일 비율`).toBeGreaterThan(1.7);
      expect(x.ratio, `${w}x${h}: 썸네일 비율`).toBeLessThan(1.86);
      expect(x.inside, `${w}x${h}: 썸네일이 카드 밖`).toBe(true);
      expect(x.w, `${w}x${h}: 썸네일 폭`).toBeGreaterThanOrEqual(80);
    }
  }
});
