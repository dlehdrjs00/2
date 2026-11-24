/**
 * 플레이 중 자동 저장 실패(용량 초과 등) 안내와 회복
 *
 * - 쓰기 실패는 Storage.prototype.setItem 이 QuotaExceededError 를 던지게 바꿔(켜고 끌 수 있게) 만들고,
 *   실제로 localStorage 를 용량 한계까지 채워 진짜 용량 초과도 만든다.
 * - 'flap' 은 가득 찬 저장소에서 기록이 상한에 닿은 경우를 흉내 낸다: 자동 저장은 두 번에 한 번만 들어가고
 *   (짧아진 값은 덮어써진다), 여유 공간을 재는 임시 키(__vn_room__)는 늘 실패한다.
 * - 알림은 MutationObserver 로 토스트가 붙는 횟수를 센다(data-kind: autosave-tab-only / autosave-recovered).
 * - 상태 표시 .autosave-chip · debugInfo().autoSave('none' | 'ok' | 'tab-only') · localStorage 의 자동 저장(ashita.save.auto)을 함께 본다.
 * 세 프로젝트(desktop·phone-landscape·phone-se-landscape)에서 돈다. 키보드 조작만 desktop 에서.
 */
import { expect, test, type Page } from '@playwright/test';
import { advanceOne, advanceToStop, boot, continueAt, info, newGame, openMenu, readSlot, toTitle, waitChoicesArmed, waitSettled } from './helpers';

const FAILED = '새로고침하거나 탭을 닫으면 최근 진행이 사라질 수 있어요';
const RECOVERED = '다시 브라우저에 남겼어요';

type Box = { left: number; top: number; right: number; bottom: number; width: number; height: number };
const overlap = (a: Box, b: Box) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;

type FailMode = 'off' | 'all' | 'flap';

/** setItem 실패 스위치(이 문서에만. 새로고침하면 사라진다)와 자동 저장 알림 세기 */
async function instrument(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __fail: FailMode; __autoWrites: number; __toasts: Array<{ kind: string; role: string; text: string }> };
    w.__fail = 'off';
    w.__autoWrites = 0;
    w.__toasts = [];
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (this: Storage, k: string, v: string) {
      if (w.__fail !== 'off' && this === window.localStorage) {
        const quota = new DOMException('The quota has been exceeded.', 'QuotaExceededError');
        if (w.__fail === 'all' || k === '__vn_room__') throw quota;
        if (k === 'ashita.save.auto' && w.__autoWrites++ % 2 === 0) throw quota;
      }
      return orig.call(this, k, v);
    };
    new MutationObserver((recs) => {
      for (const r of recs)
        for (const n of r.addedNodes) {
          if (!(n instanceof HTMLElement) || !n.classList.contains('toast')) continue;
          w.__toasts.push({ kind: n.dataset.kind ?? '', role: n.getAttribute('role') ?? '', text: n.textContent ?? '' });
        }
    }).observe(document.getElementById('vn')!, { childList: true });
  });
}

const setFail = (page: Page, on: boolean | 'flap') => {
  const mode: FailMode = on === 'flap' ? 'flap' : on ? 'all' : 'off';
  return page.evaluate((v) => ((window as unknown as { __fail: FailMode }).__fail = v), mode);
};
const toasts = (page: Page) =>
  page.evaluate(() => (window as unknown as { __toasts: Array<{ kind: string; role: string; text: string }> }).__toasts);
const countKind = async (page: Page, kind: string) => (await toasts(page)).filter((t) => t.kind === kind).length;
const autoStep = async (page: Page) => (await readSlot(page, 'auto'))?.state.stepId ?? null;
const chip = (page: Page) => page.locator('.autosave-chip');

/** 대사(say) 한 줄 진행. 선택지에 닿으면 첫 선택지를 고른다(자동 저장은 대사·카드·선택지마다 쓴다) */
async function step(page: Page) {
  const i = await info(page);
  if (i.frame === 'choice') {
    await waitChoicesArmed(page);
    await page.locator('.choice').first().click();
    await expect.poll(async () => (await info(page)).step).not.toBe(i.step);
    await waitSettled(page);
    return;
  }
  await advanceOne(page);
}

async function press(page: Page, selector: string) {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`${selector} not visible`);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  if (test.info().project.use.hasTouch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

async function continueFromTitle(page: Page) {
  await page.locator('[data-action=continue]').click();
  const changed = page.locator('[data-panel=confirm] [data-action=ok]');
  if (await changed.isVisible().catch(() => false)) await changed.click();
  await expect(page.locator('#vn')).toHaveAttribute('data-mode', 'play');
  await waitSettled(page);
}

async function reloadToTitle(page: Page) {
  await page.reload();
  await expect(page.locator('#vn')).toHaveAttribute('data-mode', 'title');
}

test('정상 저장 → 쓰기 실패 → 진행: 알림 한 번·상태 표시, 같은 탭은 최신 위치, 새로고침하면 이전 위치(영구 저장본은 그대로)', async ({ page }) => {
  await boot(page);
  await newGame(page);
  await instrument(page);
  await advanceOne(page);
  await advanceOne(page);
  const s1 = (await info(page)).step!;
  expect(await autoStep(page)).toBe(s1);
  expect((await info(page)).autoSave).toBe('ok');
  await expect(chip(page)).toBeHidden();

  await setFail(page, true);
  for (let i = 0; i < 3; i++) await step(page);
  const s2 = (await info(page)).step!;
  expect(s2).not.toBe(s1);
  await expect(chip(page)).toBeVisible();
  expect((await info(page)).autoSave).toBe('tab-only');
  const alerts = (await toasts(page)).filter((t) => t.kind === 'autosave-tab-only');
  expect(alerts, '쓰기 실패 알림은 한 번만').toHaveLength(1);
  expect(alerts[0].text).toContain(FAILED);
  expect(alerts[0].role).toBe('alert');
  expect(await autoStep(page), '브라우저 저장소의 자동 저장은 지우지도 바꾸지도 않는다').toBe(s1);

  // 같은 탭: 타이틀의 [이어하기]는 이 탭에만 있는 최신 위치(S2)
  await openMenu(page);
  await page.locator('[data-panel=menu] [data-action=title]').click();
  await expect(page.locator('[data-panel=confirm] .dialog-msg')).toContainText('이 탭에만');
  await page.locator('[data-panel=confirm] [data-action=ok]').click();
  await expect(page.locator('#vn')).toHaveAttribute('data-mode', 'title');
  await expect(page.locator('[data-action=continue] .tab-only')).toContainText('이 탭에만');
  // 표시가 [이어하기] 버튼 밖으로 넘치지 않는다
  const fit = await page.locator('[data-action=continue]').evaluate((b) => {
    const r = b.getBoundingClientRect();
    const t = b.querySelector('.tab-only')!.getBoundingClientRect();
    return { over: b.scrollWidth - b.clientWidth, inside: t.left >= r.left - 0.5 && t.right <= r.right + 0.5 };
  });
  expect(fit.over).toBeLessThanOrEqual(1);
  expect(fit.inside).toBe(true);
  await page.screenshot({ path: test.info().outputPath('title-tab-only.png') });
  await continueFromTitle(page);
  expect((await info(page)).step).toBe(s2);
  expect((await info(page)).autoSave).toBe('tab-only');
  await expect(chip(page)).toBeVisible();
  expect(await countKind(page, 'autosave-tab-only'), '이어해도 같은 상태면 다시 알리지 않는다').toBe(1);
  expect(await autoStep(page)).toBe(s1);

  // 새로고침: 이 탭의 메모리는 사라지고 브라우저에 남은 이전 위치(S1)로
  await reloadToTitle(page);
  expect(await autoStep(page)).toBe(s1);
  await expect(page.locator('[data-action=continue] .tab-only')).toHaveCount(0);
  await continueFromTitle(page);
  expect((await info(page)).step).toBe(s1);
  expect((await info(page)).autoSave).toBe('ok');
  await expect(chip(page)).toBeHidden();
});

test('저장 기능이 회복되면: 회복 알림 한 번, 상태 표시가 사라지고 최신 위치가 실제로 저장되어 새로고침 뒤에도 이어진다', async ({ page }) => {
  await boot(page);
  await newGame(page);
  await instrument(page);
  await advanceOne(page);
  const s1 = (await info(page)).step!;
  await setFail(page, true);
  await step(page);
  await step(page);
  await expect(chip(page)).toBeVisible();
  expect(await autoStep(page)).toBe(s1);

  await setFail(page, false);
  await step(page);
  const s3 = (await info(page)).step!;
  expect((await info(page)).autoSave).toBe('ok');
  await expect(chip(page)).toBeHidden();
  const rec = (await toasts(page)).filter((t) => t.kind === 'autosave-recovered');
  expect(rec, '회복 알림은 한 번').toHaveLength(1);
  expect(rec[0].text).toContain(RECOVERED);
  expect(await autoStep(page), '회복한 순간의 위치가 브라우저 저장소에 들어간다').toBe(s3);
  // 이어서 진행해도 더 알리지 않는다
  await step(page);
  const s4 = (await info(page)).step!;
  expect(await countKind(page, 'autosave-recovered')).toBe(1);
  expect(await countKind(page, 'autosave-tab-only')).toBe(1);

  await reloadToTitle(page);
  expect(await autoStep(page)).toBe(s4);
  await continueFromTitle(page);
  expect((await info(page)).step).toBe(s4);
});

test("칸마다 따로: 실패 중 저장한 수동 칸은 회복 뒤에도 '이 탭에만'이고, 영구 저장된 다른 칸의 안내에는 '사라져요'가 없다", async ({ page }) => {
  await boot(page);
  await newGame(page);
  await instrument(page);
  await advanceOne(page);
  await setFail(page, true);
  await step(page);
  await expect(chip(page)).toBeVisible();

  const at3 = (await info(page)).step!;
  await openMenu(page);
  await page.locator('[data-panel=menu] [data-action=save]').click();
  await expect(page.locator('[data-panel=save] .panel-hint.warn')).toContainText('자동 저장이 이 탭에만 있어요');
  await page.locator('[data-panel=save] .slot[data-slot="3"]').click();
  await expect(page.locator('.toast')).toContainText('용량이 부족해 이 탭에만 저장됐어요');
  await expect(page.locator('.toast')).toContainText('새로고침하거나 탭을 닫으면 사라져요');
  await expect(page.locator('[data-panel=save] .slot[data-slot="3"] .slot-tabonly')).toHaveText('이 탭에만');
  expect(await page.locator('[data-panel=save] .slot[data-slot="3"]').getAttribute('aria-label')).toContain('이 탭에만 저장돼 있어');
  expect(await readSlot(page, '3')).toBeNull();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await info(page)).overlays).toBe(0);
  await page.waitForTimeout(300);

  // 회복: 자동 저장 상태 표시는 걷히지만 3번 칸은 여전히 이 탭에만
  await setFail(page, false);
  await step(page);
  expect((await info(page)).autoSave).toBe('ok');
  await expect(chip(page)).toBeHidden();
  await openMenu(page);
  await page.locator('[data-panel=menu] [data-action=save]').click();
  await expect(page.locator('[data-panel=save] .slot[data-slot="3"] .slot-tabonly')).toHaveText('이 탭에만');
  await expect(page.locator('[data-panel=save] .panel-hint.warn')).toContainText("'이 탭에만' 칸은");
  await expect(page.locator('[data-panel=save] .panel-hint')).not.toContainText('자동 저장이 이 탭에만');
  // 영구 저장에 성공한 다른 칸: 안내에 '사라져요'가 없고 배지도 없다(예전에는 전역 기준이라 '이 탭을 닫으면 사라져요'가 붙었다)
  await page.locator('[data-panel=save] .slot[data-slot="4"]').click();
  await expect(page.locator('.toast')).toHaveText('슬롯 4에 저장했어요');
  await expect(page.locator('[data-panel=save] .slot[data-slot="4"] .slot-tabonly')).toHaveCount(0);
  expect((await readSlot(page, '4'))?.state.stepId).toBe((await info(page)).step);
  // 자동·퀵 쪽: 자동 저장 칸은 영구(배지 없음)
  await page.locator('[data-panel=save] .rail [data-page=q]').click();
  await expect(page.locator('[data-panel=save] .slot[data-slot="auto"]')).toBeVisible();
  await expect(page.locator('[data-panel=save] .slot[data-slot="auto"] .slot-tabonly')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await info(page)).overlays).toBe(0);
  await page.waitForTimeout(300);
  // 퀵저장도 그 칸 기준
  await page.locator('.qbar [data-q=qsave]').evaluate((b) => (b as HTMLButtonElement).click());
  await expect(page.locator('.toast')).toHaveText('퀵저장했어요');
  await page.waitForTimeout(300);
  // 3번 칸은 같은 탭에서 불러올 수 있다(이 탭에만 있는 새 값 = 저장한 위치). 새로고침하면 없다
  await openMenu(page);
  await page.locator('[data-panel=menu] [data-action=load]').click();
  await page.locator('[data-panel=load] .rail [data-page="1"]').click();
  await expect(page.locator('[data-panel=load] .slot[data-slot="3"] .slot-tabonly')).toHaveText('이 탭에만');
  await page.locator('[data-panel=load] .slot[data-slot="3"]').click();
  const ok = page.locator('[data-panel=confirm] [data-action=ok]');
  if (await ok.isVisible().catch(() => false)) await ok.click();
  await expect.poll(async () => (await info(page)).overlays).toBe(0);
  await waitSettled(page);
  expect((await info(page)).step, '같은 탭에서는 이 탭에만 있는 3번 칸(저장한 위치)을 불러온다').toBe(at3);
  await reloadToTitle(page);
  expect(await readSlot(page, '3')).toBeNull();
  await page.locator('[data-action=load]').click();
  await page.locator('[data-panel=load] .rail [data-page="1"]').click();
  await expect(page.locator('[data-panel=load] .slot[data-slot="3"]')).toBeDisabled();
});

test('상태 표시를 누르면 설명이 열리고 대사는 넘어가지 않으며, [지금 다시 저장]은 실패하면 알리고 회복되면 저장한다', async ({ page }, ti) => {
  await boot(page);
  await newGame(page);
  await instrument(page);
  await advanceOne(page);
  const kept = (await info(page)).step!;
  await setFail(page, true);
  await step(page);
  await step(page);
  await expect(chip(page)).toBeVisible();
  const box = (await chip(page).boundingBox())!;
  expect(Math.min(box.width, box.height), '터치 대상 44px 이상').toBeGreaterThanOrEqual(44);
  await page.waitForTimeout(500);
  const at = (await info(page)).step;

  await press(page, '.autosave-chip');
  const msg = page.locator('[data-panel=confirm] .dialog-msg');
  await expect(msg).toContainText('자동 저장이 이 탭에만 있어요');
  await expect(msg).toContainText(FAILED);
  await expect(msg).toContainText('새로고침하면 그 위치로 돌아가요');
  await expect(msg).toContainText('지금 다시 저장');
  expect((await info(page)).step, '누른 입력이 대사 진행으로 새지 않는다').toBe(at);
  await page.locator('[data-panel=confirm] [data-action=cancel]').click();
  await expect.poll(async () => (await info(page)).overlays).toBe(0);
  await page.waitForTimeout(400);
  expect((await info(page)).step).toBe(at);

  // 아직 실패 중: [지금 다시 저장] → 다시 실패 안내, 상태 그대로(경고는 다시 띄우지 않음)
  await press(page, '.autosave-chip');
  await page.locator('[data-panel=confirm] [data-action=ok]').click();
  await expect(page.locator('.toast[data-kind=autosave-retry-failed]')).toBeVisible();
  expect((await info(page)).autoSave).toBe('tab-only');
  expect(await countKind(page, 'autosave-tab-only')).toBe(1);
  expect(await autoStep(page)).toBe(kept);
  await page.waitForTimeout(400);

  // 회복된 뒤 [지금 다시 저장] → 지금 위치가 저장되고 상태 표시가 걷힌다(대사는 그대로)
  await setFail(page, false);
  await press(page, '.autosave-chip');
  await page.locator('[data-panel=confirm] [data-action=ok]').click();
  await expect(page.locator('.toast[data-kind=autosave-recovered]')).toContainText(RECOVERED);
  await expect(chip(page)).toBeHidden();
  expect((await info(page)).autoSave).toBe('ok');
  expect((await info(page)).step).toBe(at);
  expect(await autoStep(page)).toBe(at);

  if (ti.project.name === 'desktop') {
    // 키보드: 상태 표시에 포커스하고 Enter → 설명, Esc → 닫힘. 대사는 그대로
    await setFail(page, true);
    await step(page);
    await expect(chip(page)).toBeVisible();
    await page.waitForTimeout(500);
    const k = (await info(page)).step;
    await chip(page).focus();
    await page.keyboard.press('Enter');
    await expect(msg).toContainText('자동 저장이 이 탭에만 있어요');
    expect((await info(page)).step).toBe(k);
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await info(page)).overlays).toBe(0);
    expect((await info(page)).step).toBe(k);
  }
});

test('실패가 이어지는 동안 12줄을 진행해도 알림은 한 번이고 상태 표시는 계속 보인다', async ({ page }) => {
  await boot(page);
  await newGame(page);
  await instrument(page);
  await advanceOne(page);
  await setFail(page, true);
  for (let i = 0; i < 12; i++) {
    await step(page);
    await expect(chip(page)).toBeVisible();
  }
  const all = (await toasts(page)).filter((t) => t.kind.startsWith('autosave'));
  expect(all.map((t) => t.kind)).toEqual(['autosave-tab-only']);
  expect((await info(page)).autoSave).toBe('tab-only');
});

test('실제 용량 초과: 저장 공간을 가득 채우면 알리고, 새로고침해도 이전 위치를 불러오며, 공간을 비우면 최신 위치가 저장된다', async ({ page }) => {
  await boot(page);
  await newGame(page);
  await instrument(page);
  await advanceOne(page);
  const s1 = (await info(page)).step!;
  expect(await autoStep(page)).toBe(s1);
  // localStorage 를 용량 한계까지(1글자도 더 못 쓸 때까지) 채운다
  const filled = await page.evaluate(() => {
    let chunk = 'x'.repeat(1 << 20);
    let n = 0;
    while (chunk.length > 0) {
      try {
        localStorage.setItem(`__fill_${n}`, chunk);
        n++;
      } catch {
        chunk = chunk.slice(0, Math.floor(chunk.length / 2));
      }
    }
    return n;
  });
  expect(filled).toBeGreaterThan(0);
  await step(page);
  await step(page);
  const s2 = (await info(page)).step!;
  expect((await info(page)).autoSave).toBe('tab-only');
  await expect(chip(page)).toBeVisible();
  expect(await countKind(page, 'autosave-tab-only')).toBe(1);
  expect(await autoStep(page)).toBe(s1);

  // 가득 찬 채로 새로고침: 시험 쓰기가 실패해도 브라우저 저장소를 읽어 이전 위치(S1)로 이어 간다
  await reloadToTitle(page);
  await expect(page.locator('[data-action=continue]')).toBeEnabled();
  await continueFromTitle(page);
  expect((await info(page)).step).toBe(s1);
  expect(s2).not.toBe(s1);
  // 같은 크기의 값으로 같은 칸을 덮어쓰는 것은 가득 차 있어도 될 수 있다(이어하기 직후의 자동 저장).
  // 한 줄 진행해 기록이 늘면 다시 실패하고, 새 페이지에서 처음 바뀐 상태이므로 다시 알린다
  await advanceOne(page);
  await expect.poll(async () => (await info(page)).autoSave).toBe('tab-only');
  await expect(chip(page)).toBeVisible();
  await expect(page.locator('.toast[data-kind=autosave-tab-only]')).toContainText(FAILED);
  expect(await autoStep(page)).toBe(s1);

  // 공간을 비우고 한 줄 진행 → 회복, 최신 위치가 저장된다
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) if (k.startsWith('__fill_')) localStorage.removeItem(k);
  });
  await advanceOne(page);
  const s3 = (await info(page)).step!;
  await expect(page.locator('.toast[data-kind=autosave-recovered]')).toContainText(RECOVERED);
  expect((await info(page)).autoSave).toBe('ok');
  expect(await autoStep(page)).toBe(s3);
  await reloadToTitle(page);
  await continueFromTitle(page);
  expect((await info(page)).step).toBe(s3);
});

test('처음부터 브라우저 저장소를 쓸 수 없으면: 타이틀 안내 뒤 플레이 첫 진입에 짧게 한 번, 상태 표시는 계속, 설명에는 [지금 다시 저장]이 없다', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new Error('denied');
      },
    });
  });
  await page.goto('./?debug');
  await expect(page.locator('#vn')).toHaveAttribute('data-mode', 'title');
  await expect(page.locator('.toast')).toContainText('이 탭에만');
  await instrument(page);
  await newGame(page);
  await expect(chip(page)).toBeVisible();
  expect((await info(page)).autoSave).toBe('tab-only');
  const first = (await toasts(page)).filter((t) => t.kind === 'autosave-tab-only');
  expect(first).toHaveLength(1);
  expect(first[0].text).toContain('새로고침하거나 탭을 닫으면 사라져요');
  for (let i = 0; i < 4; i++) await step(page);
  await toTitle(page);
  await expect(page.locator('[data-action=continue] .tab-only')).toContainText('이 탭에만');
  await continueFromTitle(page);
  await step(page);
  expect(await countKind(page, 'autosave-tab-only'), '같은 페이지에서는 다시 알리지 않는다').toBe(1);
  await expect(chip(page)).toBeVisible();
  await page.waitForTimeout(400);
  const at = (await info(page)).step;
  await press(page, '.autosave-chip');
  await expect(page.locator('[data-panel=confirm] .dialog-msg')).toContainText('저장이 이 탭에만 있어요');
  await expect(page.locator('[data-panel=confirm] [data-action=cancel]')).toHaveCount(0);
  await expect(page.locator('[data-panel=confirm] [data-action=ok]')).toHaveText('확인');
  await page.locator('[data-panel=confirm] [data-action=ok]').click();
  await expect.poll(async () => (await info(page)).overlays).toBe(0);
  expect((await info(page)).step).toBe(at);
});

/** 화면 크기를 바꾸고 배치가 다시 계산될 때까지. 휴대폰 세로면 세로 안내를 넘겨 세로 대체 배치로 */
async function resizeTo(page: Page, w: number, h: number) {
  await page.setViewportSize({ width: w, height: h });
  await expect.poll(() => page.evaluate(() => [innerWidth, innerHeight].join('x'))).toBe(`${w}x${h}`);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const keep = page.locator('[data-action=keep-portrait]');
  if (await keep.isVisible().catch(() => false)) await keep.click();
  await expect(page.locator('.rotate')).toBeHidden();
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

/** 상태 표시가 장소 표시·이름표·빠른 메뉴·선택지·토스트와 겹치지 않는지(보이는 것끼리) */
async function expectChipClear(page: Page, label: string, chipText = '이 탭에만') {
  const r = await page.evaluate(() => {
    const box = (e: Element) => e.getBoundingClientRect().toJSON() as Box;
    const shown = (e: Element) => {
      const cs = getComputedStyle(e);
      return e.getClientRects().length > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
    };
    const chip = document.querySelector('.autosave-chip')!;
    const lbl = chip.querySelector<HTMLElement>('.lbl')!;
    const name = document.querySelector('.vn > .textbox .name');
    const place = document.querySelector('.place-chip');
    return {
      chip: shown(chip) ? box(chip) : null,
      /** 글자가 말줄임으로 잘렸는지 */
      cut: lbl.scrollWidth > lbl.clientWidth + 1,
      text: lbl.innerText,
      name: name && shown(name) && name.textContent ? box(name) : null,
      place: place && shown(place) ? box(place) : null,
      qbar: [...document.querySelectorAll('.qbar button')].filter(shown).map(box),
      choices: [...document.querySelectorAll('.choices.on .choice')].filter(shown).map(box),
      toast: [...document.querySelectorAll('.toast')].filter(shown).map(box),
      vw: innerWidth,
      vh: innerHeight,
    };
  });
  expect(r.chip, `${label}: 상태 표시가 보임`).not.toBeNull();
  const c = r.chip!;
  expect(c.height, `${label}: 높이 44px 이상`).toBeGreaterThanOrEqual(44);
  expect(r.cut, `${label}: 글자가 잘림(${r.text})`).toBe(false);
  expect(r.text).toContain(chipText);
  expect(c.left >= -0.5 && c.top >= -0.5 && c.right <= r.vw + 0.5 && c.bottom <= r.vh + 0.5, `${label}: 화면 안`).toBe(true);
  if (r.name) expect(overlap(c, r.name), `${label}: 이름표와 겹침`).toBe(false);
  if (r.place) expect(overlap(c, r.place), `${label}: 장소 표시와 겹침`).toBe(false);
  for (const q of r.qbar) expect(overlap(c, q), `${label}: 빠른 메뉴와 겹침`).toBe(false);
  for (const ch of r.choices) expect(overlap(c, ch), `${label}: 선택지와 겹침`).toBe(false);
  for (const t of r.toast) expect(overlap(c, t), `${label}: 토스트와 겹침`).toBe(false);
  return r;
}

test('상태 표시는 장소 표시·이름표·빠른 메뉴·선택지·토스트와 겹치지 않는다(가로 세 화면 + 세로 배치)', async ({ page }, ti) => {
  await boot(page);
  await newGame(page);
  await instrument(page);
  await setFail(page, true);
  await advanceOne(page);
  await expect(chip(page)).toBeVisible();
  const sizes: Array<[number, number]> =
    ti.project.name === 'desktop'
      ? [
          [1280, 720],
          [844, 390],
          [667, 375],
          [390, 844],
        ]
      : [[page.viewportSize()!.width, page.viewportSize()!.height], [page.viewportSize()!.height, page.viewportSize()!.width]];
  const land = page.viewportSize()!;
  for (const [w, h] of sizes) {
    await resizeTo(page, w, h);
    const lay = await page.locator('#vn').getAttribute('data-layout');
    const label = `${w}x${h} ${lay}`;
    // 대사: 이름표가 있는 줄까지 진행하고, 장소 표시는 아주 긴 문구로 띄워 본다(최대 폭이 상태 표시 앞에서 멈춘다)
    for (let g = 0; g < 30 && !(await page.locator('.vn > .textbox .name').textContent()); g++) await step(page);
    await page.evaluate(() => {
      const p = document.querySelector('.place-chip')!;
      const where = p.querySelector('.pc-where');
      if (where) where.textContent = '아주 아주 긴 장소 이름이 들어간 장소 표시 '.repeat(4);
      p.classList.add('on');
    });
    await page.waitForTimeout(550);
    await expectChipClear(page, `${label} 대사`);
    // 토스트가 떠도 상태 표시 아래로(대사)
    await page.keyboard.press('F5');
    await expect(page.locator('.toast')).toBeVisible();
    await expectChipClear(page, `${label} 대사+토스트`);
    await page.screenshot({ path: test.info().outputPath(`chip-say-${w}x${h}.png`) });
    await page.evaluate(() => document.querySelector('.place-chip')!.classList.remove('on'));
  }
  // 선택지: 탭 띠(빠른 메뉴 왼쪽)로 옮겨 선택지 목록과 겹치지 않는다
  await resizeTo(page, land.width, land.height);
  const c = await advanceToStop(page);
  expect(c.frame).toBe('choice');
  await waitChoicesArmed(page);
  for (const [w, h] of sizes) {
    await resizeTo(page, w, h);
    const lay = await page.locator('#vn').getAttribute('data-layout');
    await expectChipClear(page, `${w}x${h} ${lay} 선택지`);
    await page.screenshot({ path: test.info().outputPath(`chip-choice-${w}x${h}.png`) });
  }
  // 대사창 숨기기(H) 중에는 감춘다
  await resizeTo(page, land.width, land.height);
  await page.locator('#vn').evaluate((e) => (e.dataset.hidewin = '1'));
  await expect(chip(page)).toHaveCSS('opacity', '0');
  await page.locator('#vn').evaluate((e) => delete e.dataset.hidewin);
});

test('날짜 카드 동안에도 상태 표시는 일력·빠른 메뉴와 겹치지 않는다', async ({ page }, ti) => {
  await boot(page);
  await instrument(page);
  await continueAt(page, { sceneId: 'c5_gym', stepId: 'c5.010' });
  expect((await info(page)).frame).toBe('card');
  // 실패를 켜고 타이틀을 오가면(떠날 때·이어할 때 자동 저장) 카드 화면에서 이 탭에만 상태가 된다
  await setFail(page, true);
  await toTitle(page);
  await continueFromTitle(page);
  expect((await info(page)).frame).toBe('card');
  await expect(chip(page)).toBeVisible();
  await expect(page.locator('.stage > .card.on')).toBeVisible();
  const sizes: Array<[number, number]> =
    ti.project.name === 'desktop'
      ? [
          [1280, 720],
          [844, 390],
          [667, 375],
          [390, 844],
        ]
      : [[page.viewportSize()!.width, page.viewportSize()!.height]];
  for (const [w, h] of sizes) {
    await page.setViewportSize({ width: w, height: h });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => {
      const box = (e: Element) => e.getBoundingClientRect().toJSON() as Box;
      const card = document.querySelector('.stage > .card.on')!;
      return {
        chip: box(document.querySelector('.autosave-chip')!),
        parts: [...card.querySelectorAll(':scope > .card-kicker, :scope > .cal, :scope > .week')]
          .filter((e) => e.getClientRects().length && getComputedStyle(e).display !== 'none')
          .map(box),
        qbar: [...document.querySelectorAll('.qbar button')].filter((e) => e.getClientRects().length).map(box),
      };
    });
    expect(r.parts.length, `${w}x${h}: 일력이 보임`).toBeGreaterThan(0);
    for (const p of r.parts) expect(overlap(r.chip, p), `${w}x${h}: 일력과 겹침`).toBe(false);
    for (const q of r.qbar) expect(overlap(r.chip, q), `${w}x${h}: 빠른 메뉴와 겹침`).toBe(false);
    await page.screenshot({ path: test.info().outputPath(`chip-card-${w}x${h}.png`) });
  }
});

test('저장이 성공·실패를 오가도(가득 찬 저장소에서 기록이 상한에 닿은 경우) 경고는 한 번이고, 상태 표시는 실제 저장 여부를 따르며, 여유 공간이 생기면 회복을 한 번 알린다', async ({ page }) => {
  await boot(page);
  await newGame(page);
  await instrument(page);
  await advanceOne(page);
  expect((await info(page)).autoSave).toBe('ok');
  await setFail(page, 'flap');
  const rows: Array<{ step: string | null; autoSave: string; saved: boolean; chip: boolean; state: string | null; label: string }> = [];
  for (let i = 0; i < 12; i++) {
    await step(page);
    const inf = await info(page);
    rows.push({
      step: inf.step,
      autoSave: inf.autoSave,
      saved: (await autoStep(page)) === inf.step,
      chip: await chip(page).isVisible(),
      state: await chip(page).getAttribute('data-state'),
      label: (await chip(page).locator('.lbl').textContent()) ?? '',
    });
  }
  // 알림: 문제 구간이 시작할 때 한 번뿐(성공·실패가 번갈아도 경고·회복을 되풀이하지 않는다)
  expect((await toasts(page)).filter((t) => t.kind.startsWith('autosave')).map((t) => t.kind)).toEqual(['autosave-tab-only']);
  for (const [i, r] of rows.entries()) {
    expect(r.chip, `${i}: 상태 표시가 계속 보임`).toBe(true);
    // 저장된 줄은 low-space(저장됨·공간 부족), 못 한 줄은 tab-only(이 탭에만). 브라우저의 자동 저장 위치와 맞는다
    expect(r.autoSave, `${i}: ${r.step}`).toBe(r.saved ? 'low-space' : 'tab-only');
    expect(r.state, `${i}`).toBe(r.autoSave);
    expect(r.label, `${i}`).toContain(r.saved ? '공간 부족' : '이 탭에만');
  }
  expect([...new Set(rows.map((r) => r.autoSave))].sort()).toEqual(['low-space', 'tab-only']);

  // 저장된 상태(low-space)의 상태 표시('공간 부족 · 저장됨')도 다른 요소와 겹치거나 잘리지 않고, 설명을 열면 '저장됐지만 공간 부족'을 알린다
  if ((await info(page)).autoSave !== 'low-space') await step(page);
  expect((await info(page)).autoSave).toBe('low-space');
  await page.waitForTimeout(400);
  if ((await info(page)).frame === 'say') await expectChipClear(page, 'low-space', '공간 부족');
  await page.screenshot({ path: test.info().outputPath('chip-low-space.png') });
  await press(page, '.autosave-chip');
  const msg = page.locator('[data-panel=confirm] .dialog-msg');
  await expect(msg).toContainText('저장 공간이 거의 없어요');
  await expect(msg).toContainText('새로고침해도 여기서 이어 갈 수 있어요');
  await expect(msg).toContainText('최근 진행이 사라질 수 있어요');
  await page.locator('[data-panel=confirm] [data-action=cancel]').click();
  await expect.poll(async () => (await info(page)).overlays).toBe(0);
  await page.waitForTimeout(400);

  // 공간이 생기면(쓰기·여유 공간 재기 모두 성공) 다음 자동 저장에서 회복 한 번
  await setFail(page, false);
  await step(page);
  const s = (await info(page)).step;
  expect((await info(page)).autoSave).toBe('ok');
  await expect(chip(page)).toBeHidden();
  expect(await autoStep(page)).toBe(s);
  await step(page);
  await step(page);
  expect((await toasts(page)).filter((t) => t.kind.startsWith('autosave')).map((t) => t.kind)).toEqual([
    'autosave-tab-only',
    'autosave-recovered',
  ]);
  expect(await page.evaluate(() => localStorage.getItem('__vn_room__')), '여유 공간을 재는 임시 키는 남기지 않는다').toBeNull();
});

/** localStorage 를 다른 키(__fill_N)로 1글자도 더 못 쓸 때까지 채운다(같은 origin 의 다른 앱이 공간을 다 쓴 상황) */
const fillUp = (page: Page) =>
  page.evaluate(() => {
    let chunk = 'x'.repeat(1 << 20);
    let n = 0;
    while (localStorage.getItem(`__fill_${n}`) !== null) n++;
    while (chunk.length > 0) {
      try {
        localStorage.setItem(`__fill_${n}`, chunk);
        n++;
      } catch {
        chunk = chunk.slice(0, Math.floor(chunk.length / 2));
      }
    }
  });

test('실제 용량 초과 + 기록 상한(120줄): 저장 공간이 꽉 찬 채 30줄을 진행해도 경고는 한 번, 회복 알림은 공간을 비운 뒤에만', async ({ page }, ti) => {
  test.skip(ti.project.name !== 'desktop', '저장소 동작은 화면 크기와 상관없어 desktop 에서만');
  await boot(page);
  await newGame(page);
  await advanceOne(page);
  await toTitle(page);
  // 자동 저장의 기록을 상한(120줄, 10~90자)까지 채운다: 이후 한 줄마다 가장 오래된 줄이 빠져 크기가 오르내린다
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('ashita.save.auto')!);
    let seed = 12345;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    d.state.log = Array.from({ length: 120 }, (_, i) => ({ id: `old.${i}`, name: '아카네', text: '가'.repeat(10 + Math.floor(rnd() * 80)), kind: 'say' }));
    localStorage.setItem('ashita.save.auto', JSON.stringify(d));
  });
  await reloadToTitle(page);
  await continueFromTitle(page);
  await instrument(page);
  expect((await info(page)).autoSave).toBe('ok');
  const seen: string[] = [];
  for (let i = 0; i < 30; i++) {
    // 다른 앱이 남는 공간을 곧바로 다시 채운다: 자동 저장은 크기가 줄어든 줄만 덮어써지고(브라우저는 늘어나는 만큼만 따진다)
    // 늘어난 줄은 실패한다. 기록이 상한이라 줄마다 크기가 오르내려 성공·실패가 번갈아 난다
    await fillUp(page);
    await step(page);
    const inf = await info(page);
    if (inf.mode !== 'play') break;
    seen.push(inf.autoSave);
    // 상태는 실제 저장 여부를 따른다: 브라우저의 자동 저장이 지금 위치면 ok/low-space, 아니면 tab-only
    const saved = (await autoStep(page)) === inf.step;
    expect(inf.autoSave === 'tab-only', `${i}: ${inf.step} ${inf.autoSave}`).toBe(!saved);
  }
  const kinds = (await toasts(page)).filter((t) => t.kind.startsWith('autosave')).map((t) => t.kind);
  test.info().annotations.push({ type: 'states', description: seen.join(' ') });
  // 덮어쓰기가 성공·실패를 오가는 상황이 실제로 생겼는지(아니면 이 검사가 아무것도 보지 않은 것)
  expect(seen).toContain('tab-only');
  expect(kinds, seen.join(' ')).toEqual(['autosave-tab-only']);
  expect(seen).toContain('low-space');
  await expect(chip(page)).toBeVisible();

  // 공간을 비우면 회복 한 번, 최신 위치가 새로고침 뒤에도 이어진다
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) if (k.startsWith('__fill_')) localStorage.removeItem(k);
  });
  await step(page);
  const s = (await info(page)).step!;
  expect((await info(page)).autoSave).toBe('ok');
  await expect(chip(page)).toBeHidden();
  expect((await toasts(page)).filter((t) => t.kind.startsWith('autosave')).map((t) => t.kind)).toEqual([
    'autosave-tab-only',
    'autosave-recovered',
  ]);
  expect(await autoStep(page)).toBe(s);
  await reloadToTitle(page);
  await continueFromTitle(page);
  expect((await info(page)).step).toBe(s);
});

test('경고가 떠 있을 때 상태 표시를 눌러 설명을 열면 경고 토스트는 걷혀 설명창 버튼을 가리지 않는다', async ({ page }) => {
  await boot(page);
  await newGame(page);
  await instrument(page);
  await advanceOne(page);
  await setFail(page, true);
  await step(page);
  await expect(page.locator('.toast[data-kind=autosave-tab-only]')).toBeVisible();
  await page.waitForTimeout(400);
  await press(page, '.autosave-chip');
  await expect(page.locator('[data-panel=confirm] .dialog-msg')).toContainText('자동 저장이 이 탭에만 있어요');
  // 곧바로 잰다(경고는 7초 뒤 저절로 사라지므로 기다리며 다시 보는 단언은 쓰지 않는다)
  const r = await page.evaluate(() => {
    const box = (e: Element) => e.getBoundingClientRect().toJSON() as Box;
    return {
      buttons: [...document.querySelectorAll('[data-panel=confirm] .dialog-foot button, [data-panel=confirm] [data-action]')].map(box),
      toasts: [...document.querySelectorAll('.toast')].map(box),
      vh: innerHeight,
    };
  });
  expect(r.toasts, '설명창을 열면 떠 있던 자동 저장 경고를 걷는다').toHaveLength(0);
  expect(r.buttons.length).toBeGreaterThanOrEqual(2);
  for (const b of r.buttons) {
    expect(b.bottom, '설명창 버튼이 화면 안').toBeLessThanOrEqual(r.vh + 0.5);
    for (const t of r.toasts) expect(overlap(b, t), '토스트가 설명창 버튼을 가림').toBe(false);
  }
  await page.screenshot({ path: test.info().outputPath('dialog-no-toast.png') });
  // [지금 다시 저장] 실패 안내는 설명창이 닫힌 뒤에 뜬다
  await page.locator('[data-panel=confirm] [data-action=ok]').click();
  await expect(page.locator('.toast[data-kind=autosave-retry-failed]')).toBeVisible();
  await expect(page.locator('[data-panel=confirm]')).toHaveCount(0);
});

test('세로 배치: 상태 표시는 장소 표시 위 줄에 있어 장소명을 자르지 않는다', async ({ page }) => {
  await boot(page);
  await newGame(page);
  await instrument(page);
  await setFail(page, true);
  await advanceOne(page);
  await expect(chip(page)).toBeVisible();
  const measure = () =>
    page.evaluate(() => {
      const p = document.querySelector('.place-chip')!;
      p.classList.add('on');
      const where = p.querySelector<HTMLElement>('.pc-where');
      const c = document.querySelector('.autosave-chip')!.getBoundingClientRect().toJSON() as Box;
      return {
        layout: document.getElementById('vn')!.dataset.layout,
        row: document.getElementById('vn')!.dataset.aschip,
        text: p.textContent,
        where: where ? { client: where.clientWidth, scroll: where.scrollWidth } : null,
        place: p.getBoundingClientRect().toJSON() as Box,
        chip: c,
        stageTop: parseFloat(getComputedStyle(document.getElementById('vn')!).getPropertyValue('--sy')),
      };
    });
  for (const [w, h] of [
    [390, 844],
    [375, 667],
    [360, 640],
  ] as const) {
    await resizeTo(page, w, h);
    await page.waitForTimeout(550);
    const m = await measure();
    expect(m.layout).toBe('below');
    expect(m.where, `${w}x${h}: 장소명`).not.toBeNull();
    expect(m.where!.scroll, `${w}x${h}: 장소명이 잘림(${m.text})`).toBeLessThanOrEqual(m.where!.client + 1);
    expect(overlap(m.chip, m.place), `${w}x${h}: 장소 표시와 겹침`).toBe(false);
    expect(m.row, `${w}x${h}`).toBe('above');
    expect(m.chip.bottom, `${w}x${h}: 상태 표시가 장소 표시 위`).toBeLessThanOrEqual(m.place.top + 0.5);
    expect(m.chip.top).toBeGreaterThanOrEqual(-0.5);
    expect(m.place.bottom, `${w}x${h}: 장소 표시는 무대 위 여백에`).toBeLessThanOrEqual(m.stageTop + 0.5);
    await page.screenshot({ path: test.info().outputPath(`portrait-${w}x${h}.png`) });
  }
});
