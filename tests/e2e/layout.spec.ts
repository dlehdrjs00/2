/**
 * 화면 배치 회귀 검사: 낮은 가로 화면의 선택지·대사창 넘침, 토스트 위치, 저장 슬롯 삭제 버튼,
 * 설정 슬라이더 스크롤, 스크린리더 알림 범위.
 * 뷰포트를 테스트 안에서 직접 정하므로 desktop 프로젝트에서만 돈다(같은 검사를 세 번 반복하지 않게).
 */
import { expect, test, type Page } from '@playwright/test';
import { LINE_MAX_CHARS, OPTION_MAX_CHARS } from '../../src/engine/validate';
import { advanceToStop, boot, info, newGame, openMenu, waitChoicesArmed, waitSettled } from './helpers';

test.beforeEach(async ({}, ti) => {
  test.skip(ti.project.name !== 'desktop', '뷰포트를 직접 정하는 배치 검사(desktop 프로젝트에서만)');
});

type Box = { left: number; top: number; right: number; bottom: number };
const overlap = (a: Box, b: Box) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;

/** 실제 대본 문장과 비슷한 어절 길이의 한국어 문단(길이 한도 검사용) */
const PARA =
  '방과 후 교실에는 아무도 남아 있지 않았다. 창문 너머로 운동부의 구령이 들려오고, 칠판에는 지우다 만 수식이 희미하게 남아 있었다. ' +
  '나는 가방을 메고 복도로 나섰다. 계단을 내려가자 신발장 앞에서 누군가 기다리고 있었다. “늦었잖아.” 익숙한 목소리였다.';

async function relayoutTo(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await expect.poll(() => page.evaluate(() => [innerWidth, innerHeight].join('x'))).toBe(`${width}x${height}`);
  // resize → 배치 다시 계산 → ResizeObserver(대사창) 반영까지 두 프레임
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

async function rects(page: Page, selector: string): Promise<Box[]> {
  return page.locator(selector).evaluateAll((els) =>
    els.map((e) => {
      const b = e.getBoundingClientRect();
      return { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
    }),
  );
}

test('낮은 가로 화면: 두 줄·3개 선택지도 버튼 밖으로 넘치지 않고 HUD·대사창과 겹치지 않으며 스크롤 없이 보인다', async ({ page }) => {
  await page.setViewportSize({ width: 740, height: 320 });
  await boot(page);
  await newGame(page);
  const c = await advanceToStop(page);
  expect(c.frame).toBe('choice');
  await waitChoicesArmed(page);

  const long = '히나에게 우산을 빌려주고 아카네의 우산에 같이 들어가서 집까지 걸어간다'.slice(0, OPTION_MAX_CHARS);
  const setChoices = (texts: string[]) =>
    page.evaluate((texts) => {
      const box = document.querySelector('.choices')!;
      const btns = [...box.querySelectorAll<HTMLButtonElement>('.choice')];
      while (btns.length < texts.length) {
        const b = btns[0].cloneNode(true) as HTMLButtonElement;
        b.dataset.option = `x${btns.length}`;
        box.append(b);
        btns.push(b);
      }
      btns.forEach((b, i) => {
        if (i < texts.length) b.textContent = texts[i];
        else b.remove();
      });
    }, texts);

  const shapes: Array<[string, string[]]> = [
    ['두 줄 문구 2개', [long, long]],
    ['선택지 3개(긴 문구 포함)', [long, '추천보다 먼저 히나의 취향을 묻는다', '아무 말도 하지 않는다']],
  ];
  // 지원 화면: 아이폰 SE 가로, 휴대폰 가로(브라우저 UI 포함), 안드로이드 크롬 주소창 표시, 360dp 폰 크롬 가로
  const sizes: Array<[number, number]> = [
    [667, 375],
    [740, 320],
    [740, 280],
    [692, 280],
  ];
  for (const [name, texts] of shapes) {
    await setChoices(texts);
    for (const [w, h] of sizes) {
      await relayoutTo(page, w, h);
      const where = `${name} @${w}x${h}`;
      const list = (await rects(page, '.choices'))[0];
      const btns = await rects(page, '.choice');
      const hud = await rects(page, '.hud button');
      const tb = (await rects(page, '.textbox'))[0];
      expect(btns.length, where).toBe(texts.length);
      // 버튼 높이가 글자를 다 담는다(flex 축소로 글자가 버튼 밖으로 삐져나오던 문제)
      const clipped = await page.locator('.choice').evaluateAll((els) => els.map((e) => e.scrollHeight - e.clientHeight));
      for (const d of clipped) expect(d, `${where}: 버튼 글자 넘침`).toBeLessThanOrEqual(1);
      for (const [i, b] of btns.entries()) {
        expect(b.bottom - b.top, where).toBeGreaterThanOrEqual(44);
        for (const hb of hud) expect(overlap(b, hb), `${where}: ${i + 1}번이 HUD 와 겹침`).toBe(false);
        expect(overlap(b, tb), `${where}: ${i + 1}번이 대사창과 겹침`).toBe(false);
        // 스크롤 없이 목록 안에 다 보인다
        expect(b.top, where).toBeGreaterThanOrEqual(list.top - 0.5);
        expect(b.bottom, where).toBeLessThanOrEqual(list.bottom + 0.5);
        // 버튼 가운데를 누르면 그 버튼이 눌린다(HUD 등에 가리지 않음)
        const hit = await page.evaluate(
          ([x, y]) => {
            const e = document.elementFromPoint(x, y);
            const btn = e?.closest('.choice');
            return btn ? [...document.querySelectorAll('.choice')].indexOf(btn) : -1;
          },
          [(b.left + b.right) / 2, (b.top + b.bottom) / 2],
        );
        expect(hit, where).toBe(i);
      }
    }
  }
  // 고른 화면에서도 진행 상태는 그대로(배치만 바뀜)
  expect((await info(page)).step).toBe(c.step);
});

test('대사창: 기본 3줄을 넘는 문장은 넘침으로 잡히고, 대사창이 위로 늘어나 글자가 잘리지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 740, height: 320 });
  await boot(page);
  await newGame(page);
  const put = (s: string) =>
    page.evaluate((s) => {
      const t = document.querySelector('.textbox .text')!;
      (t.firstChild as Text).data = s;
      t.querySelector('.hidden-char')!.textContent = '';
    }, s);
  const measure = () =>
    page.evaluate(() => {
      const tb = document.querySelector<HTMLElement>('.textbox')!;
      const cs = getComputedStyle(tb);
      const b = tb.getBoundingClientRect();
      const t = tb.querySelector('.text')!.getBoundingClientRect();
      const hud = [...document.querySelectorAll('.hud button')].map((e) => e.getBoundingClientRect());
      const hudBottom = Math.max(...hud.map((r) => r.bottom));
      const hudTop = Math.min(...hud.map((r) => r.top));
      const stageTop = document.querySelector('.stage')!.getBoundingClientRect().top;
      return { top: b.top, innerBottom: b.bottom - parseFloat(cs.borderBottomWidth), textBottom: t.bottom, hudBottom, hudTop, stageTop, vh: innerHeight };
    });
  const full = PARA.repeat(2);
  for (const [w, h] of [
    [740, 320],
    [667, 375],
  ] as const) {
    await relayoutTo(page, w, h);
    // 검증기가 허용하는 가장 긴 문장(LINE_MAX_CHARS)은 기본 3줄 안에 들어간다
    await put(full.slice(0, LINE_MAX_CHARS).trimEnd());
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const base = await measure();
    expect((await info(page)).textOverflow, `${w}x${h}: ${LINE_MAX_CHARS}자`).toBe(false);
    // 한 줄 넘게 긴 문장: 넘침으로 잡히고(예전 판정은 아래 여백만큼 느슨해 4번째 줄을 놓쳤다), 대사창이 위로 늘어나 잘리지 않음
    await put(full.slice(0, LINE_MAX_CHARS + 40).trimEnd());
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const grown = await measure();
    expect((await info(page)).textOverflow, `${w}x${h}: ${LINE_MAX_CHARS + 40}자`).toBe(true);
    expect(grown.top, `${w}x${h}: 대사창이 위로 늘어남`).toBeLessThan(base.top - 10);
    expect(grown.textBottom, `${w}x${h}: 글자가 대사창 안`).toBeLessThanOrEqual(grown.innerBottom + 0.5);
    expect(grown.textBottom).toBeLessThanOrEqual(grown.vh);
    // 빠른 메뉴 탭은 대사창 위 테두리에 붙어 함께 올라간다: 탭 아랫변 = 대사창 윗변(소수점 오차 0.5px 허용)
    expect(grown.top, `${w}x${h}: 빠른 메뉴 탭은 덮지 않음`).toBeGreaterThanOrEqual(grown.hudBottom - 0.5);
    expect(grown.hudTop, `${w}x${h}: 빠른 메뉴 탭이 무대 위로 밀려나지 않음`).toBeGreaterThanOrEqual(grown.stageTop);
    // 짧은 문장으로 돌아오면 원래 크기
    await put('짧은 문장.');
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    expect((await measure()).top).toBeCloseTo(base.top, 0);
    expect((await info(page)).textOverflow).toBe(false);
  }
});

test('토스트는 대사창 글자와 선택지를 가리지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 740, height: 320 });
  await boot(page);
  await newGame(page);
  // 처음 보는 대사에서 건너뛰기 → 안내 토스트
  await page.locator('.hud button', { hasText: '스킵' }).click();
  await expect(page.locator('.toast')).toContainText('처음 보는');
  let toast = (await rects(page, '.toast'))[0];
  expect(overlap(toast, (await rects(page, '.textbox'))[0]), '대사 중 토스트가 대사창을 가림').toBe(false);
  for (const hb of await rects(page, '.hud button')) expect(overlap(toast, hb)).toBe(false);

  const c = await advanceToStop(page);
  expect(c.frame).toBe('choice');
  await waitChoicesArmed(page);
  for (const [w, h] of [
    [740, 320],
    [667, 375],
    [740, 280],
  ] as const) {
    await relayoutTo(page, w, h);
    await page.keyboard.press('s');
    await expect(page.locator('.toast')).toContainText('선택지');
    toast = (await rects(page, '.toast'))[0];
    for (const b of await rects(page, '.choice')) expect(overlap(toast, b), `${w}x${h}: 토스트가 선택지를 가림`).toBe(false);
    for (const hb of await rects(page, '.hud button')) expect(overlap(toast, hb)).toBe(false);
    // 질문 문구(대사창 글자)도 가리지 않음
    const line = await page.locator('.textbox .text').evaluate((e) => {
      const r = document.createRange();
      r.selectNodeContents(e);
      const b = r.getBoundingClientRect();
      return { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
    });
    expect(overlap(toast, line), `${w}x${h}: 토스트가 질문 문구를 가림`).toBe(false);
  }
  expect((await info(page)).skip).toBe(false);
});

test('저장 슬롯: 삭제 버튼 밑에 날짜·장면·루트 글자가 깔리지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 667, height: 375 });
  await boot(page);
  await newGame(page);
  await openMenu(page);
  await page.locator('[data-panel=menu] [data-action=save]').click();
  await page.locator('[data-panel=save] .slot[data-slot="1"]').click();
  await expect(page.locator('.toast')).toContainText('저장했어요');
  // 루트가 정해진 저장처럼 요약을 바꿔 두 슬롯에 둔다(메타 줄이 가장 길어지는 경우)
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('ashita.save.1')!);
    raw.summary = { ...raw.summary, route: 'osana', sceneTitle: '첫 불꽃이 터지기 전에', text: '한 줄 요약' };
    localStorage.setItem('ashita.save.1', JSON.stringify(raw));
    raw.summary = { ...raw.summary, route: 'tenko', sceneTitle: '이름 외우기 수첩' };
    localStorage.setItem('ashita.save.2', JSON.stringify(raw));
  });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await info(page)).overlays).toBe(0);
  for (const [w, h] of [
    [667, 375],
    [740, 360],
    [844, 390],
  ] as const) {
    await relayoutTo(page, w, h);
    await openMenu(page);
    await page.locator('[data-panel=menu] [data-action=load]').click();
    await expect(page.locator('[data-panel=load] .slot-del')).toHaveCount(2);
    const hidden = await page.locator('[data-panel=load] .slot-wrap').evaluateAll((wraps) =>
      wraps.map((wrap) => {
        const del = wrap.querySelector('.slot-del');
        if (!del) return '';
        const d = del.getBoundingClientRect();
        let s = '';
        for (const el of wrap.querySelectorAll('.slot-name, .slot-meta, .slot-text')) {
          const tn = el.firstChild as Text | null;
          if (!tn) continue;
          const r = document.createRange();
          for (let i = 0; i < tn.length; i++) {
            r.setStart(tn, i);
            r.setEnd(tn, i + 1);
            for (const c of r.getClientRects()) if (c.right > d.left && c.left < d.right && c.bottom > d.top && c.top < d.bottom) s += tn.data[i];
          }
        }
        return s.trim();
      }),
    );
    expect(hidden.filter(Boolean), `${w}x${h}: 삭제 버튼에 가린 글자`).toEqual([]);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await info(page)).overlays).toBe(0);
  }
});

test('스크린리더: 게임 전체가 아니라 대사창 문장만 한 번씩 알리고, 타자 효과 글자는 읽지 않는다', async ({ page }) => {
  await boot(page, { textSpeed: 6, autoSpeed: 10, bgmVolume: 0, sfxVolume: 0 });
  expect(await page.locator('#app').getAttribute('aria-live')).toBeNull();
  await expect(page.locator('.textbox')).not.toHaveAttribute('role', 'log');
  await expect(page.locator('.textbox .text')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('[aria-live]')).toHaveCount(1);
  await page.evaluate(() => {
    const w = window as unknown as { __live: string[]; __typed: number };
    w.__live = [];
    w.__typed = 0;
    const live = document.querySelector('[aria-live]')!;
    new MutationObserver(() => w.__live.push(live.textContent ?? '')).observe(live, { childList: true, characterData: true, subtree: true });
    new MutationObserver(() => w.__typed++).observe(document.querySelector('.textbox .text')!, { characterData: true, subtree: true, childList: true });
  });
  await page.locator('[data-action=new]').click();
  const confirm = page.locator('[data-panel=confirm] [data-action=ok]');
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await expect(page.locator('#vn')).toHaveAttribute('data-mode', 'play');
  await waitSettled(page);
  const r = await page.evaluate(() => {
    const w = window as unknown as { __live: string[]; __typed: number };
    return { live: w.__live.filter(Boolean), typed: w.__typed, text: document.querySelector('.textbox .text')!.textContent };
  });
  expect(r.typed, '타자 효과로 보이는 글자는 여러 번 바뀐다').toBeGreaterThan(5);
  // 알림은 문장 전체 한 번(글자 단위로 쌓이지 않음)
  expect(r.live).toHaveLength(1);
  expect(r.live[0]).toContain(r.text!);
});

test.describe('터치 화면', () => {
  test.use({ viewport: { width: 740, height: 320 }, hasTouch: true, isMobile: true });

  test('설정: 슬라이더 위에서 세로로 밀어도 패널이 스크롤된다', async ({ page }) => {
    await boot(page);
    await page.locator('.title-menu [data-action=settings]').click();
    const body = page.locator('[data-panel=settings] .panel-body');
    await expect(body).toBeVisible();
    const { scrollable } = await body.evaluate((b) => ({ scrollable: b.scrollHeight > b.clientHeight + 4 }));
    test.skip(!scrollable, '이 화면에서는 설정이 스크롤 없이 다 보임');
    const slider = (await page.locator('[data-panel=settings] input[type=range]').first().boundingBox())!;
    const x = slider.x + slider.width / 2;
    const y0 = slider.y + slider.height / 2;
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
    for (let i = 1; i <= 15; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 - i * 5 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(() => body.evaluate((b) => b.scrollTop)).toBeGreaterThan(20);
  });
});
