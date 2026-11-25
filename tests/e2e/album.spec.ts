/**
 * 추억 앨범(타이틀 시트의 이벤트 CG 갤러리)과 감상 화면(뷰어).
 * - 처음엔 0 / 11, 모든 칸 잠김. 잠긴 칸은 눌러도 열리지 않는다. 11 은 일반 CG 수(히든 kh_* 6장은 관람 전 칸·총 장수에 없음).
 * - 히든 CG 는 본 한 장씩만 칸·총 장수·제목에 나타나고, 코하루 묶음은 보일 칸이 있을 때만 생긴다(공통 kh_meet·kh_draw 는 공통 묶음).
 * - 전역 기록(ashita.global 의 cgs)에 있는 CG 만 열리고, 새 게임을 해도 남는다.
 * - 실제 진행에서 본 CG 는 기록된다(보통 진행·건너뛰기 중·불러오기 직후).
 * - 감상: ←/→·좌우 버튼·스와이프로 '본 그림' 사이를 오가고 Esc·닫기·빈 곳으로 닫힌다. 입력은 뒤의 타이틀·시트로 새지 않고,
 *   닫으면 포커스가 연 칸 → [추억 앨범]으로 돌아간다.
 * - 배치: 1280×720·844×390·667×375(프로젝트), 세로 390×844 에서 잘림·겹침·가로 스크롤이 없다.
 */
import { expect, test, type Page } from '@playwright/test';
import { CG_ORDER, CGS } from '../../src/story/cg';
import { STORY } from '../../src/story';
import { advanceOne, advanceToStop, boot, info, newGame, openMenu, pick, readGlobal, requireCdp, toTitle, waitSettled } from './helpers';

type Box = { left: number; top: number; right: number; bottom: number; width: number; height: number };

/**
 * 관람 전에 보이는 총 장수: 계약(3·4절)상 일반 CG 11장. CG_ORDER.length(히든 포함 17)는 쓰지 않는다.
 * 히든 CG 를 하나 볼 때마다 총 장수에 한 장씩 더해진다.
 */
const BASE_TOTAL = 11;
const HIDDEN_CGS = ['kh_meet', 'kh_draw', 'kh_relay', 'kh_confession', 'kh_home', 'kh_date'];
const overlap = (a: Box, b: Box) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;

/** 전역 기록에 본 CG 를 넣고(처음 한 번만) 게임을 연다 */
async function bootWithCgs(page: Page, cgs: string[], extra: { endings?: string[]; read?: string[] } = {}) {
  await page.addInitScript(
    ([cgs, extra]) => {
      if (sessionStorage.getItem('album-seeded')) return;
      sessionStorage.setItem('album-seeded', '1');
      localStorage.setItem('ashita.global', JSON.stringify({ schema: 1, read: extra.read ?? [], endings: extra.endings ?? [], cgs }));
    },
    [cgs, extra] as const,
  );
  await boot(page);
}

async function openAlbum(page: Page) {
  await page.locator('.title-menu [data-action=album]').click();
  await expect(page.locator('[data-panel=album]')).toBeVisible();
  await expect.poll(async () => (await info(page)).sheet).toBe('album');
}

/** 화면에 보이는 요소들의 사각형 */
async function boxes(page: Page, selector: string): Promise<Box[]> {
  return page.locator(selector).evaluateAll((els) =>
    els
      .filter((e) => {
        const cs = getComputedStyle(e);
        return cs.display !== 'none' && cs.visibility !== 'hidden' && e.getClientRects().length > 0;
      })
      .map((e) => e.getBoundingClientRect().toJSON()),
  );
}

/** 문서·시트 본문에 가로 스크롤이 없고, 앨범의 보이는 글자는 16px 이상, 조작 요소는 44px 이상 */
async function expectAlbumLayout(page: Page, where: string) {
  const vp = page.viewportSize()!;
  const r = await page.evaluate(() => {
    const body = document.querySelector<HTMLElement>('[data-panel=album] .panel-body')!;
    const small: string[] = [];
    for (const e of document.querySelectorAll<HTMLElement>('[data-panel=album] *')) {
      if (!e.childNodes.length || ![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim())) continue;
      if (e.closest('.sr-only') || !e.getClientRects().length) continue;
      const fs = parseFloat(getComputedStyle(e).fontSize);
      if (fs < 15.5) small.push(`${e.className}:${fs}`);
    }
    return {
      docOverflow: document.scrollingElement!.scrollWidth - innerWidth,
      bodyOverflow: body.scrollWidth - body.clientWidth,
      body: body.getBoundingClientRect().toJSON(),
      small,
    };
  });
  expect(r.docOverflow, `${where}: 문서 가로 스크롤`).toBeLessThanOrEqual(0);
  expect(r.bodyOverflow, `${where}: 앨범 본문 가로 스크롤`).toBeLessThanOrEqual(1);
  expect(r.small, `${where}: 16px 미만 글자`).toEqual([]);
  for (const b of await boxes(page, '[data-panel=album] .cg-card')) {
    expect(b.left, `${where}: 칸이 본문 왼쪽 밖`).toBeGreaterThanOrEqual(r.body.left - 0.5);
    expect(b.right, `${where}: 칸이 본문 오른쪽 밖`).toBeLessThanOrEqual(r.body.right + 0.5);
    expect(Math.min(b.width, b.height), `${where}: 칸 터치 영역`).toBeGreaterThanOrEqual(44);
  }
  for (const b of await boxes(page, '[data-panel=album] .panel-head button')) {
    expect(Math.min(b.width, b.height), `${where}: 탭·닫기 터치 영역`).toBeGreaterThanOrEqual(44 - 0.01);
    expect(b.left).toBeGreaterThanOrEqual(-0.5);
    expect(b.right).toBeLessThanOrEqual(vp.width + 0.5);
  }
}

/** 타이틀 버튼 5개가 화면 안에 있고 서로·엔딩 배지와 겹치지 않으며 44px 이상 */
async function expectTitleMenu(page: Page, where: string) {
  const vp = page.viewportSize()!;
  const btns = await boxes(page, '.title-menu .btn');
  expect(btns.length, where).toBe(5);
  const badges = await boxes(page, '.title-foot .badge');
  for (const [i, b] of btns.entries()) {
    expect(b.height, `${where}: 버튼 높이`).toBeGreaterThanOrEqual(44 - 0.01);
    expect(b.left >= -0.5 && b.top >= -0.5 && b.right <= vp.width + 0.5 && b.bottom <= vp.height + 0.5, `${where}: 버튼 ${i + 1} 화면 밖`).toBe(true);
    for (const [j, c] of btns.entries()) if (j > i) expect(overlap(b, c), `${where}: 버튼 ${i + 1}·${j + 1} 겹침`).toBe(false);
    for (const g of badges) expect(overlap(b, g), `${where}: 버튼 ${i + 1}이 엔딩 배지와 겹침`).toBe(false);
  }
  // 버튼 글자가 버튼 밖으로 넘치지 않음(반 폭 [추억 앨범]·[설정] 포함)
  const clipped = await page.locator('.title-menu .btn').evaluateAll((els) => els.map((e) => e.scrollWidth - e.clientWidth));
  for (const d of clipped) expect(d, `${where}: 버튼 글자 넘침`).toBeLessThanOrEqual(1);
}

test('추억 앨범: 처음엔 0 / 11 이고 모든 칸이 잠겨 있으며, 잠긴 칸은 눌러도 열리지 않는다', async ({ page }) => {
  await boot(page);
  await expectTitleMenu(page, '타이틀');
  const btn = page.locator('.title-menu [data-action=album]');
  await expect(btn).toHaveAttribute('aria-describedby', 'vn-album-count');
  await expect(page.locator('#vn-album-count')).toHaveText(`모은 추억 0 / ${BASE_TOTAL}`);
  await openAlbum(page);

  const album = page.locator('[data-panel=album]');
  await expect(album).toHaveAttribute('role', 'dialog');
  await expect(album).toHaveAttribute('aria-label', '추억 앨범');
  // 타이틀 시트 탭: 불러오기·추억 앨범·설정
  await expect(album.locator('.sys-tabs [role=tab]')).toHaveText(['불러오기', '추억 앨범', '설정']);
  await expect(album.locator('.album-total')).toHaveText(`0 / ${BASE_TOTAL}`);
  await expect(album.locator('.album-bar')).toHaveAttribute('aria-valuenow', '0');
  // 루트별 묶음(아카네 → 히나), 각 묶음 안은 CG_ORDER 순서, 모두 잠김. 히든 CG(코하루·공통 kh_*)는 빈칸도 없다
  await expect(album.locator('.album-group')).toHaveCount(2);
  await expect(album.locator('.cg-card[data-cg^="kh_"]')).toHaveCount(0);
  expect(await album.locator('.album-group').evaluateAll((g) => g.map((e) => (e as HTMLElement).dataset.route))).toEqual(['osana', 'tenko']);
  for (const route of ['osana', 'tenko'] as const) {
    const ids = CG_ORDER.filter((id) => CGS[id].route === route);
    const cards = album.locator(`.album-group[data-route=${route}] .cg-card`);
    expect(await cards.evaluateAll((cs) => cs.map((c) => (c as HTMLElement).dataset.cg))).toEqual(ids);
    await expect(album.locator(`.album-group[data-route=${route}] .album-count`)).toHaveText(`0 / ${ids.length}`);
  }
  const cards = album.locator('.cg-card');
  await expect(cards).toHaveCount(BASE_TOTAL);
  await expect(album.locator('.cg-card[data-seen="1"]')).toHaveCount(0);
  await expect(album.locator('.cg-card[aria-disabled=true]')).toHaveCount(BASE_TOTAL);
  await expect(album.locator('.cg-card .cg-photo img')).toHaveCount(0);
  for (const t of await album.locator('.cg-cap').allTextContents()) expect(t).toBe('???');
  await expectAlbumLayout(page, '빈 앨범');

  // 잠긴 칸을 눌러도 감상 화면이 열리지 않고, 타이틀도 그대로(aria-disabled 라 Playwright 는 '비활성'으로 보므로 강제로 누른다)
  await cards.first().click({ force: true });
  await page.waitForTimeout(300);
  await expect(page.locator('[data-panel=viewer]')).toHaveCount(0);
  const i = await info(page);
  expect(i.mode).toBe('title');
  expect(i.overlays).toBe(1);

  // Esc → 닫히고 포커스는 [추억 앨범]으로
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await info(page)).overlays).toBe(0);
  await expect(btn).toBeFocused();
});

test('추억 앨범: 전역 기록에 본 CG 만 열리고(모르는 id 는 무시), 새 게임을 해도 그대로다', async ({ page }, ti) => {
  test.skip(ti.project.name !== 'desktop', '전역 기록 확인은 데스크톱에서(배치는 다른 테스트가 세 크기 모두 본다)');
  await bootWithCgs(page, ['rain_tenko', 'fireworks_osana', 'renamed_cg_xyz', 'rain_tenko']);
  await expect(page.locator('#vn-album-count')).toHaveText(`모은 추억 2 / ${BASE_TOTAL}`);
  await openAlbum(page);
  const album = page.locator('[data-panel=album]');
  await expect(album.locator('.album-total')).toHaveText(`2 / ${BASE_TOTAL}`);
  await expect(album.locator('.cg-card[data-seen="1"]')).toHaveCount(2);
  for (const id of ['rain_tenko', 'fireworks_osana']) {
    const card = album.locator(`.cg-card[data-cg=${id}]`);
    await expect(card).toHaveAttribute('data-seen', '1');
    await expect(card).not.toHaveAttribute('aria-disabled', 'true');
    await expect(card.locator('.cg-cap')).toHaveText(CGS[id as keyof typeof CGS].title);
    // 썸네일은 실제 그림(빌드 경로가 맞음)
    const src = await card.locator('.cg-photo img').getAttribute('src');
    const res = await page.request.get(new URL(src!, page.url()).href);
    expect(res.headers()['content-type'] ?? '').toMatch(/^image\//);
  }
  await expect(album.locator('.album-group[data-route=osana] .album-count')).toHaveText('1 / 5');
  await expect(album.locator('.album-group[data-route=tenko] .album-count')).toHaveText('1 / 6');
  await page.keyboard.press('Escape');

  // 새 게임 → 타이틀: 앨범 기록은 남는다
  await newGame(page);
  await toTitle(page);
  await expect(page.locator('#vn-album-count')).toHaveText(`모은 추억 2 / ${BASE_TOTAL}`);
  // 플레이 중 메뉴·시트에는 앨범이 없다
  await page.locator('[data-action=continue]').click();
  await waitSettled(page);
  await openMenu(page);
  await expect(page.locator('[data-panel=menu] [data-action=album]')).toHaveCount(0);
  await page.locator('[data-panel=menu] [data-action=load]').click();
  await expect(page.locator('[data-panel=load] .sys-tabs [data-tab=album]')).toHaveCount(0);
});

test('추억 앨범: 진행 중 본 CG 는 보통 진행·건너뛰기 중·불러오기 직후 모두 기록되어 타이틀 앨범에 열린다', async ({ page }, ti) => {
  test.skip(ti.project.name !== 'desktop', '긴 진행은 데스크톱에서');
  test.setTimeout(240_000);
  // 전역 기록에서 CG 하나를 지우고 새로 연다. 열려 있는 탭은 떠날 때(pagehide) 메모리 기록을 다시 쓰므로,
  // 새 문서의 페이지 스크립트보다 먼저(초기화 스크립트에서) 지운다
  await page.addInitScript(() => {
    const id = sessionStorage.getItem('drop-cg');
    if (!id) return;
    sessionStorage.removeItem('drop-cg');
    const g = JSON.parse(localStorage.getItem('ashita.global') || '{}');
    g.cgs = (g.cgs || []).filter((x: string) => x !== id);
    localStorage.setItem('ashita.global', JSON.stringify(g));
  });
  const reloadWithout = async (id: string) => {
    await page.evaluate((id) => sessionStorage.setItem('drop-cg', id), id);
    await page.reload();
    await expect(page.locator('#vn')).toHaveAttribute('data-mode', 'title');
    expect((await readGlobal(page)).cgs ?? []).not.toContain(id);
    await expect(page.locator('#vn-album-count')).toHaveText(`모은 추억 0 / ${BASE_TOTAL}`);
  };
  const cgShown = () => page.locator('.stage .cg-layer.on').getAttribute('data-cg');

  await boot(page);
  await newGame(page);
  // 공통 c3·c4 는 아카네, c6 소나기에서 히나와 우산을 함께 쓴다(rain_tenko)
  for (const opt of ['a', 'a']) {
    await advanceToStop(page);
    await pick(page, opt);
  }
  const c6 = await advanceToStop(page);
  expect(c6.step).toBe('c6.ch');
  await page.keyboard.press('F5'); // 소나기 선택지에서 퀵저장
  await expect(page.locator('.toast')).toContainText('퀵저장했어요');
  await pick(page, 'b');
  // 1) 보통 진행: CG 가 뜨는 대사(c6.b30)까지
  for (let k = 0; k < 10 && (await info(page)).step !== 'c6.b30'; k++) await advanceOne(page);
  expect((await info(page)).step).toBe('c6.b30');
  await expect.poll(cgShown).toBe('rain_tenko');
  expect((await readGlobal(page)).cgs).toContain('rain_tenko');
  // CG 가 떠 있는 자리를 슬롯 1에 저장(불러오기 직후 확인용)
  await openMenu(page);
  await page.locator('[data-panel=menu] [data-action=save]').click();
  await page.locator('[data-panel=save] .slot[data-slot="1"]').click();
  await expect(page.locator('.toast')).toContainText('슬롯 1에 저장했어요');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await info(page)).overlays).toBe(0);
  // CG 가 걷히는 대사(c6.j10)까지 읽어 둔다(뒤의 건너뛰기가 CG 장면을 지나가게)
  for (let k = 0; k < 10 && (await info(page)).step !== 'c6.j10'; k++) await advanceOne(page);
  expect((await info(page)).step).toBe('c6.j10');
  await toTitle(page); // 타이틀로 가며 읽은 대사 기록도 저장된다

  await page.locator('.title-menu [data-action=album]').click();
  await expect(page.locator('[data-panel=album] .cg-card[data-cg=rain_tenko]')).toHaveAttribute('data-seen', '1');
  await expect(page.locator('[data-panel=album] .album-total')).toHaveText(`1 / ${BASE_TOTAL}`);
  await page.keyboard.press('Escape');

  // 2) 건너뛰기 중: 기록에서 지우고 다시 연 뒤, 퀵저장(선택지)에서 b → 읽은 대사를 건너뛰며 CG 장면을 지난다
  await reloadWithout('rain_tenko');
  await page.locator('.title-menu [data-action=load]').click();
  await page.locator('[data-panel=load] .rail [data-page=q]').click();
  await page.locator('[data-panel=load] .slot[data-slot=quick]').click();
  const ok = page.locator('[data-panel=confirm] [data-action=ok]');
  if (await ok.isVisible().catch(() => false)) await ok.click();
  await expect(page.locator('#vn')).toHaveAttribute('data-mode', 'play');
  await waitSettled(page);
  expect((await info(page)).step).toBe('c6.ch');
  await pick(page, 'b');
  await page.keyboard.press('s');
  // 처음 보는 대사(c6.j10: 앞에서 화면에 띄우기만 하고 넘기지 않아 읽음 기록이 없다)에서 멈춘다.
  // 그 사이 CG 장면(c6.b30)을 지나며 기록됐어야 한다. (b 의 다음 줄은 c6.j25 — c6.j20 은 a 전용이라 b·c 로는 가지 않는다)
  await expect.poll(async () => (await info(page)).skip, { timeout: 15_000 }).toBe(false);
  await waitSettled(page);
  expect((await info(page)).step).toBe('c6.j10');
  expect((await readGlobal(page)).cgs).toContain('rain_tenko');

  // 3) 불러오기 직후: 다시 지우고 새로 연 뒤 CG 가 떠 있는 슬롯 1을 불러온다
  await toTitle(page);
  await reloadWithout('rain_tenko');
  await page.locator('.title-menu [data-action=load]').click();
  await page.locator('[data-panel=load] .rail [data-page="1"]').click();
  await page.locator('[data-panel=load] .slot[data-slot="1"]').click();
  if (await ok.isVisible().catch(() => false)) await ok.click();
  await expect(page.locator('#vn')).toHaveAttribute('data-mode', 'play');
  await waitSettled(page);
  expect((await info(page)).step).toBe('c6.b30');
  await expect.poll(cgShown).toBe('rain_tenko');
  expect((await readGlobal(page)).cgs).toContain('rain_tenko');
  await toTitle(page);
  await expect(page.locator('#vn-album-count')).toHaveText(`모은 추억 1 / ${BASE_TOTAL}`);
});

test('감상: 키보드로 열어 →/← 로 본 그림 사이를 돌고, Esc 로 닫으면 포커스가 칸 → [추억 앨범]으로 돌아오며 입력이 뒤로 새지 않는다', async ({ page }, ti) => {
  test.skip(ti.project.name !== 'desktop', '키보드 감상은 데스크톱에서');
  const seen = ['rain_osana', 'ramune_osana', 'bench_tenko'];
  await bootWithCgs(page, seen);
  // 타이틀에서 키보드로 [추억 앨범]
  await page.locator('.title-menu [data-action=album]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-panel=album]')).toBeVisible();
  const first = page.locator('[data-panel=album] .cg-card[data-cg=rain_osana]');
  await first.focus();
  await page.keyboard.press('Enter');

  const viewer = page.locator('[data-panel=viewer]');
  await expect(viewer).toBeVisible();
  await expect(viewer).toHaveAttribute('role', 'dialog');
  await expect(viewer).toHaveAttribute('aria-modal', 'true');
  await expect(viewer).toHaveAttribute('aria-label', '추억 보기');
  await expect(viewer).toHaveAttribute('data-cg', 'rain_osana');
  await expect(viewer.locator('.vw-title')).toHaveText(CGS.rain_osana.title);
  await expect(viewer.locator('.vw-count')).toHaveText('1 / 3');
  // 원본을 해독한 뒤 페이드인(같은 그림이 흐린 바탕)
  await expect(viewer.locator('.vw-frame.on .vw-img.in')).toHaveCount(1);
  const img = viewer.locator('.vw-frame.on .vw-img.in');
  expect(await img.evaluate((e) => (e as HTMLImageElement).naturalWidth)).toBeGreaterThan(1000);
  expect(await img.evaluate((e) => getComputedStyle(e).objectFit)).toBe('contain');
  // 레터박스: 표준 렌더링은 같은 그림을 흐려 깔고, Apple 터치 기기(performance.css)는 흐림·그림 없이 밝은 바탕만
  const appleTouch = (await page.locator('#vn').getAttribute('data-render')) === 'apple-touch';
  const vwBg = await viewer.locator('.vw-frame.on .vw-bg').evaluate((e) => ({ filter: getComputedStyle(e).filter, image: getComputedStyle(e).backgroundImage }));
  if (appleTouch) expect(vwBg).toEqual({ filter: 'none', image: 'none' });
  else expect(vwBg.filter).toContain('blur');
  let i = await info(page);
  expect(i.overlays).toBe(2); // 앨범 시트 + 감상
  expect(i.sheet).toBe('album');
  // 뒤의 타이틀·시트는 inert
  expect(await page.evaluate(() => [(document.querySelector('.title-screen') as HTMLElement).inert, (document.querySelector('.overlay.sys') as HTMLElement).inert])).toEqual([true, true]);

  // → → → (끝에서 처음으로 돈다) ←
  const order = ['rain_osana', 'ramune_osana', 'bench_tenko']; // 화면 순서: 아카네 묶음 → 히나 묶음
  for (const k of [1, 2, 0]) {
    await page.keyboard.press('ArrowRight');
    await expect(viewer).toHaveAttribute('data-cg', order[k]);
    await expect(viewer.locator('.vw-count')).toHaveText(`${k + 1} / 3`);
  }
  await page.keyboard.press('ArrowLeft');
  await expect(viewer).toHaveAttribute('data-cg', 'bench_tenko');
  await expect(viewer.locator('.vw-title')).toHaveText(CGS.bench_tenko.title);
  // 화면 오른쪽 버튼
  await viewer.locator('.vw-nav.next').click();
  await expect(viewer).toHaveAttribute('data-cg', 'rain_osana');
  await viewer.locator('.vw-nav.prev').click();
  await expect(viewer).toHaveAttribute('data-cg', 'bench_tenko');
  await expect(viewer.locator('.vw-frame.on .vw-img.in').last()).toBeVisible();

  // 그림을 누르면 글자·버튼 숨김, 아무 키나 누르면 다시 보임(진행·닫기 없음)
  await page.waitForTimeout(450);
  await page.mouse.click(640, 300);
  await expect(viewer).toHaveAttribute('data-ui', 'off');
  await expect(viewer.locator('.vw-cap')).toBeHidden();
  await page.keyboard.press('x');
  await expect(viewer).toHaveAttribute('data-ui', 'on');
  // 타이틀에 새는 입력이 없어야 하는 키들(대사 진행·숨기기·자동·건너뛰기·퀵로드 등)
  for (const k of ['Enter', ' ', 'a', 's', 'l', 'F9', '1']) await page.keyboard.press(k);
  await expect(viewer).toHaveAttribute('data-ui', 'on');
  i = await info(page);
  expect(i.mode).toBe('title');
  expect(i.overlays).toBe(2);
  expect(i.step).toBeNull();
  await expect(page.locator('[data-panel=confirm]')).toHaveCount(0);

  // Esc: 감상만 닫히고 앨범은 그대로. 키보드로 열었으니 포커스는 마지막으로 본 그림의 칸
  const last = await viewer.getAttribute('data-cg');
  await page.keyboard.press('Escape');
  await expect(viewer).toHaveCount(0);
  await expect.poll(async () => (await info(page)).overlays).toBe(1);
  await expect(page.locator('[data-panel=album]')).toBeVisible();
  await expect(page.locator(`[data-panel=album] .cg-card[data-cg=${last}]`)).toBeFocused();
  // Esc: 앨범도 닫히고 [추억 앨범]으로
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await info(page)).overlays).toBe(0);
  await expect(page.locator('.title-menu [data-action=album]')).toBeFocused();
  i = await info(page);
  expect(i.mode).toBe('title');
  expect(i.step).toBeNull();
});

test('감상: 마우스·터치로 열고 넘기며, 닫기·그림 밖 빈 곳으로 닫힌다(클릭이 뒤로 새지 않음)', async ({ page }, ti) => {
  const touch = !!ti.project.use.hasTouch;
  await bootWithCgs(page, ['door_osana', 'homeward_osana', 'cats_tenko', 'shutter_tenko']);
  await openAlbum(page);
  await expectAlbumLayout(page, `몇 장 연 앨범 ${ti.project.name}`);
  const card = page.locator('[data-panel=album] .cg-card[data-cg=homeward_osana]');
  await card.click();
  const viewer = page.locator('[data-panel=viewer]');
  await expect(viewer).toHaveAttribute('data-cg', 'homeward_osana');
  await expect(viewer.locator('.vw-frame.on .vw-img.in')).toHaveCount(1);
  const vp = page.viewportSize()!;
  // 버튼·캡션: 화면 안, 서로 겹치지 않음, 44px 이상
  const ui = await boxes(page, '[data-panel=viewer] .vw-close, [data-panel=viewer] .vw-nav, [data-panel=viewer] .vw-cap');
  expect(ui.length).toBe(4);
  for (const [k, b] of ui.entries()) {
    expect(b.left >= -0.5 && b.top >= -0.5 && b.right <= vp.width + 0.5 && b.bottom <= vp.height + 0.5, `감상 UI ${k} 화면 안`).toBe(true);
    expect(Math.min(b.width, b.height)).toBeGreaterThanOrEqual(40);
    for (const [j, c] of ui.entries()) if (j > k) expect(overlap(b, c), `감상 UI ${k}·${j} 겹침`).toBe(false);
  }

  // 넘기기: 터치는 스와이프, 마우스는 끌기(왼쪽으로 밀면 다음)
  const swipe = async (dx: number) => {
    const y = vp.height / 2;
    const x0 = vp.width / 2 - dx / 2;
    if (touch) {
      requireCdp(page);
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] });
      for (let s = 1; s <= 6; s++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (dx * s) / 6, y }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.detach();
    } else {
      await page.mouse.move(x0, y);
      await page.mouse.down();
      await page.mouse.move(x0 + dx, y, { steps: 6 });
      await page.mouse.up();
    }
  };
  await swipe(-160);
  await expect(viewer).toHaveAttribute('data-cg', 'cats_tenko');
  await expect(viewer).toHaveAttribute('data-ui', 'on'); // 스와이프 끝 클릭은 숨기기로 새지 않음
  await swipe(160);
  await expect(viewer).toHaveAttribute('data-cg', 'homeward_osana');
  await expect(viewer.locator('.vw-frame.on .vw-img.in').last()).toBeVisible();
  // 터치 에뮬레이션은 직전 터치가 끝나고 0.5초 안의 탭을 '두 번 탭' 후보로 보고 click 을 보내지 않는다: 충분히 띄운다
  await page.waitForTimeout(touch ? 1000 : 450);

  // 그림 밖 빈 곳(흐린 바탕): 16:9 보다 넓거나 좁은 화면에서만 생긴다
  const rect = await viewer.locator('.vw-frame.on .vw-img.in').last().evaluate((e) => {
    const img = e as HTMLImageElement;
    const r = img.getBoundingClientRect();
    const s = Math.min(r.width / img.naturalWidth, r.height / img.naturalHeight);
    return { w: img.naturalWidth * s, h: img.naturalHeight * s, W: r.width, H: r.height };
  });
  const tapAt = async (x: number, y: number) => (touch ? page.touchscreen.tap(x, y) : page.mouse.click(x, y));
  const sideGap = (rect.W - rect.w) / 2;
  if (sideGap > 30) {
    await tapAt(sideGap / 2, vp.height * 0.2);
  } else {
    await viewer.locator('.vw-close').click();
  }
  await expect(viewer).toHaveCount(0);
  await expect.poll(async () => (await info(page)).overlays).toBe(1);
  await expect(page.locator('[data-panel=album]')).toBeVisible();
  // 닫기 버튼으로 앨범도 닫는다: 타이틀은 그대로(뒤의 [새 게임] 등이 눌리지 않음)
  await page.waitForTimeout(450);
  await page.locator('[data-panel=album] .panel-head .close').click();
  await expect.poll(async () => (await info(page)).overlays).toBe(0);
  const i = await info(page);
  expect(i.mode).toBe('title');
  expect(i.step).toBeNull();
  await expect(page.locator('.title-menu [data-action=album]')).toBeFocused();
});

test('추억 앨범: 세로 화면(390×844)과 낮은 타이틀 화면에서도 버튼·칸·감상 화면이 잘리거나 겹치지 않는다', async ({ page }, ti) => {
  test.skip(ti.project.name !== 'desktop', '크기를 직접 바꾸는 배치 검사(desktop 프로젝트에서만)');
  await bootWithCgs(page, ['rain_osana', 'cats_tenko', 'polaroid_tenko'], { endings: ['osana'] });
  for (const [w, h] of [
    [1024, 768],
    [960, 541],
    [740, 360],
    [740, 320],
  ] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(150);
    await expectTitleMenu(page, `타이틀 ${w}x${h}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  // 세로 안내는 터치 화면에서만 뜬다(데스크톱 프로젝트는 바로 세로 대체 배치)
  const keep = page.locator('[data-action=keep-portrait]');
  if (await keep.isVisible()) await keep.click();
  await expect(page.locator('.rotate')).toBeHidden();
  await expectTitleMenu(page, '타이틀 390x844');
  // 세로 타이틀의 키 비주얼: 두 히로인 얼굴(그림 가로 약 0.48~0.75)이 함께 화면 안에 들어온다(cover 면 1/4 만 보여 히나가 잘렸다)
  await expect(page.locator('.title-screen.kv-ready')).toHaveCount(1);
  const span = await page.locator('.title-art .art-hi').evaluate((e) => {
    const r = e.getBoundingClientRect();
    const cs = getComputedStyle(e);
    const [, sh] = cs.backgroundSize.split(' ');
    const h = sh.endsWith('%') ? (r.height * parseFloat(sh)) / 100 : r.height;
    const w = (h * 16) / 9;
    const off = ((r.width - w) * parseFloat(cs.backgroundPositionX)) / 100;
    return [-off / w, (r.width - off) / w];
  });
  expect(span[0], '세로 타이틀: 그림 왼쪽 끝(아카네 얼굴)').toBeLessThanOrEqual(0.48);
  expect(span[1], '세로 타이틀: 그림 오른쪽 끝(히나 얼굴)').toBeGreaterThanOrEqual(0.75);
  await openAlbum(page);
  await expectAlbumLayout(page, '앨범 390x844');
  await page.locator('[data-panel=album] .cg-card[data-cg=cats_tenko]').click();
  const viewer = page.locator('[data-panel=viewer]');
  await expect(viewer.locator('.vw-frame.on .vw-img.in')).toHaveCount(1);
  const ui = await boxes(page, '[data-panel=viewer] .vw-close, [data-panel=viewer] .vw-nav, [data-panel=viewer] .vw-cap');
  for (const [k, b] of ui.entries()) {
    expect(b.left >= -0.5 && b.top >= -0.5 && b.right <= 390.5 && b.bottom <= 844.5, `세로 감상 UI ${k} 화면 안`).toBe(true);
    for (const [j, c] of ui.entries()) if (j > k) expect(overlap(b, c), `세로 감상 UI ${k}·${j} 겹침`).toBe(false);
  }
  // 세로에서는 좌우 버튼이 그림을 가리지 않게 아래 줄(캡션 양옆)에 있다
  const pic = await viewer.locator('.vw-frame.on .vw-img.in').evaluate((e) => {
    const img = e as HTMLImageElement;
    const r = img.getBoundingClientRect();
    const s = Math.min(r.width / img.naturalWidth, r.height / img.naturalHeight);
    const h = img.naturalHeight * s;
    return { top: r.top + (r.height - h) / 2, bottom: r.top + (r.height + h) / 2 };
  });
  for (const b of await boxes(page, '[data-panel=viewer] .vw-nav')) expect(b.top, '좌우 버튼이 그림 위').toBeGreaterThanOrEqual(pic.bottom);
  // 그림 아래 빈 곳(흐린 바탕)을 누르면 닫힌다. 연 직후(0.5초 안) 같은 자리 클릭은 게임이 더블클릭의 나머지로 흡수하므로
  // (세로 1열 앨범에서는 방금 누른 칸과 같은 자리일 수 있다) 충분히 띄운다
  await page.waitForTimeout(600);
  await page.mouse.click(195, Math.round((pic.bottom + 844) / 2) - 60);
  await expect(viewer).toHaveCount(0);
  await expect.poll(async () => (await info(page)).overlays).toBe(1);
});

test('추억 앨범: 앞 묶음(아카네)은 하나도 못 보고 히나 묶음만 모았으면, 열 때 히나 묶음이 보이는 곳에 있다', async ({ page }) => {
  await bootWithCgs(page, ['rain_tenko', 'cats_tenko', 'bench_tenko', 'selfie_tenko', 'shutter_tenko', 'polaroid_tenko'], { endings: ['tenko'] });
  await openAlbum(page);
  await expect(page.locator('[data-panel=album] .panel-body')).toHaveAttribute('data-seen', '6');
  // 히나 묶음의 첫 칸(본 칸)이 본문의 보이는 영역 안에 있다(낮은 화면에서는 그 묶음까지 스크롤돼 있다)
  const firstSeenVisible = () =>
    page.evaluate(() => {
      const b = document.querySelector('[data-panel=album] .panel-body')!.getBoundingClientRect();
      const c = document.querySelector('[data-panel=album] .album-group[data-route=tenko] .cg-card[data-seen="1"]')!.getBoundingClientRect();
      return c.top >= b.top - 0.5 && c.bottom <= b.bottom + 0.5;
    });
  await expect.poll(firstSeenVisible).toBe(true);
  // 묶음 순서는 그대로(아카네가 먼저)
  expect(await page.locator('[data-panel=album] .album-group').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.route))).toEqual([
    'osana',
    'tenko',
  ]);
  // 앞 묶음에 본 칸이 하나라도 있으면 맨 위(모은 수)부터 보인다
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await info(page)).overlays).toBe(0);
  await page.evaluate(() => {
    const g = JSON.parse(localStorage.getItem('ashita.global')!);
    g.cgs.push('rain_osana');
    localStorage.setItem('ashita.global', JSON.stringify(g));
  });
  await page.waitForTimeout(600);
  await openAlbum(page);
  await expect(page.locator('[data-panel=album] .panel-body')).toHaveAttribute('data-seen', '7');
  await page.waitForTimeout(100);
  expect(await page.locator('[data-panel=album] .panel-body').evaluate((e) => e.scrollTop)).toBe(0);
});

test('대본의 이벤트 CG 는 모두 추억 앨범 목록(CG_ORDER)에 있고, 히든은 코하루 6장뿐이다', async () => {
  const used = new Set<string>();
  for (const s of Object.values(STORY.scenes)) for (const st of s.steps) if (st.t === 'cg' && st.cg) used.add(st.cg);
  expect([...used].sort()).toEqual([...CG_ORDER].sort());
  expect(CG_ORDER.filter((id) => CGS[id].hidden)).toEqual(HIDDEN_CGS);
  expect(CG_ORDER.filter((id) => !CGS[id].hidden).length).toBe(BASE_TOTAL);
});

test('추억 앨범: 히든 CG 는 본 것만 칸·총 장수·제목에 나타나고, 코하루 묶음은 보일 칸이 있을 때만 생긴다', async ({ page }, ti) => {
  test.skip(ti.project.name !== 'desktop', '전역 기록 확인은 데스크톱에서');
  // 공통 kh_meet(route null) + 코하루 kh_relay + 일반 rain_osana 를 봤다 → 총 11 + 2 = 13
  await bootWithCgs(page, ['kh_meet', 'kh_relay', 'rain_osana']);
  await expect(page.locator('#vn-album-count')).toHaveText(`모은 추억 3 / ${BASE_TOTAL + 2}`);
  await openAlbum(page);
  const album = page.locator('[data-panel=album]');
  await expect(album.locator('.album-total')).toHaveText(`3 / ${BASE_TOTAL + 2}`);
  // 본 히든 두 장만 칸이 있고(제목·썸네일), 보지 않은 kh_* 는 빈칸도 없다
  expect(await album.locator('.cg-card[data-cg^="kh_"]').evaluateAll((cs) => cs.map((c) => (c as HTMLElement).dataset.cg).sort())).toEqual(['kh_meet', 'kh_relay']);
  for (const id of ['kh_meet', 'kh_relay'] as const) {
    const card = album.locator(`.cg-card[data-cg=${id}]`);
    await expect(card).toHaveAttribute('data-seen', '1');
    await expect(card.locator('.cg-cap')).toHaveText(CGS[id].title);
    await expect(card.locator('.cg-photo img')).toHaveCount(1);
  }
  // 코하루 묶음: 본 kh_relay 한 장뿐(1 / 1). kh_meet 은 공통 묶음
  await expect(album.locator('.album-group[data-route=koharu] .cg-card')).toHaveCount(1);
  await expect(album.locator('.album-group[data-route=koharu] .album-count')).toHaveText('1 / 1');
  await expect(album.locator('.album-group[data-route=common] .cg-card[data-cg=kh_meet]')).toHaveCount(1);
  // 일반 묶음의 칸 수는 그대로(아카네 5·히나 6)
  await expect(album.locator('.album-group[data-route=osana] .album-count')).toHaveText('1 / 5');
  await expect(album.locator('.album-group[data-route=tenko] .album-count')).toHaveText('0 / 6');
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await info(page)).overlays).toBe(0);
  // 코하루 엔딩 배지는 엔딩에 도달하기 전에는 없다(CG 를 봤어도)
  await expect(page.locator('.title-screen .badge[data-ending=koharu]')).toHaveCount(0);
});
