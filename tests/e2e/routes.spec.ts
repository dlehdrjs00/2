/**
 * 세 히로인(아카네·히나·히든 코하루)의 축제 쪽 엔딩까지 실제 화면으로 플레이. 휴대폰 프로젝트에서는 모든 대사의 잘림도 확인.
 * 공통 선택은 미발견 흐름 7회(초반 c3·c4·c6·c7, 옛 후반 c8·c9·c10), 발견 흐름 10회(초반 넷 + 에피소드 여섯 e1f·e2f·e3f).
 * 루트 안의 결말 갈래(o4.fork·t4.fork·k4.fork)는 첫 옵션 f(축제). 기대값은 계약 규칙(코하루 계약 0절, 여덟 엔딩 계약 5절)으로 직접 계산했다:
 *  - a×7: 초반 osana 2+2+2+3=9, tenko 0 → 차 9 > 1 미해금 → e1_ice3 → 후반 a×3(+3) → 18/0 → osana → 갈래 f → 「내일도, 그다음 날도」
 *  - b×7: 대칭 → 0/18 → tenko → 갈래 f → 「처음으로 함께 찍힌 사진」
 *  - c,c,c,c + k×6: 초반 함께 4회 → 4/4 → 차 0 해금(koharu 4) → 에피소드 k×6(+0.5씩) → 4/4/7 → koharu → 갈래 f → 「일요일은 둘이서」
 * 추억 앨범의 총 장수는 관람 전 숨김 CG 12장(kh_* 6장, 코하루가 그려진·히든 루트 6장)을 빼고 센다(14).
 * 코하루 축제 엔딩에서는 숨김 9장(kh_* 6 + 넷 판 에피소드 3)을 보므로 9 / 23.
 * 미해금 플레이(a×7·b×7)를 마친 타이틀에는 코하루·네 사람 엔딩 배지가 없다(아카네·히나 축제·일상 4개).
 * 긴 진행 동안 무대 해독 캐시(src/ui/image-cache.ts)가 상한(8장·12Mi 픽셀)을 넘겨 쌓이지 않는지도 대사마다 본다.
 * 해독 중인 그림·화면에 붙은 CG 는 상한 밖이고, 해독 직후 정리 사이에 화면에서 떨어진 CG 한 장만큼의 여유를 둔다.
 */
import { expect, test } from '@playwright/test';
import { boot, expectCssImages, info, newGame, playToEnding, readEndingsAll, readGlobal, type Info } from './helpers';

/** 이 크기(배경·CG 1920x1080)의 그림 한 장 */
const ONE_IMAGE_PX = 1920 * 1080;

for (const [route, picks, album, title, total] of [
  // album: 엔딩 뒤 타이틀의 '모은 추억 n / 전체'(전체 = 일반 14 + 관람한 숨김 CG), total: 엔딩 화면 분모(보이는 엔딩 수)
  ['osana', ['a', 'a', 'a', 'a', 'a', 'a', 'a'], '6 / 14', '「내일도, 그다음 날도」', 4], // rain_osana·group_ice_three·door·ramune·fireworks·homeward
  ['tenko', ['b', 'b', 'b', 'b', 'b', 'b', 'b'], '7 / 14', '「처음으로 함께 찍힌 사진」', 4], // rain_tenko·group_ice_three·cats·bench·selfie·shutter·polaroid
  // 우산 CG 없음(c6 함께), kh_meet·draw·group_ice_four·group_frog·group_rain·relay·confession·home·date
  ['koharu', ['c', 'c', 'c', 'c', 'k', 'k', 'k', 'k', 'k', 'k'], '9 / 23', '「일요일은 둘이서」', 6],
] as const) {
  test(`${route} 엔딩(축제 쪽)까지 도달하고 엔딩 기록이 남는다`, async ({ page }) => {
    test.setTimeout(600_000); // 공통 에피소드(빙수집·종이개구리·처마)와 결말 갈래가 들어가 한 바퀴가 길어졌다(모든 대사를 한 줄씩 누른다)
    await boot(page);
    await newGame(page);
    const overflowAt: string[] = [];
    const over: Array<{ step: string | null; decode: Info['decode'] }> = [];
    let peak = { kept: 0, keptPx: 0, count: 0, hot: 0, attached: 0 };
    let says = 0;
    const end = await playToEnding(page, [...picks], async (i) => {
      if (i.textOverflow) overflowAt.push(i.step!);
      says++;
      const d = i.decode;
      // 퇴출 대상(해독이 끝났고 화면에 붙지 않은 것)의 수·픽셀
      const kept = d.count - d.pending - d.attached;
      const keptPx = d.pixels - d.attachedPixels;
      peak = {
        kept: Math.max(peak.kept, kept),
        keptPx: Math.max(peak.keptPx, keptPx),
        count: Math.max(peak.count, d.count),
        hot: Math.max(peak.hot, i.preload.decoded),
        attached: Math.max(peak.attached, d.attached),
      };
      if (kept > d.maxImages || keptPx > d.maxPixels + ONE_IMAGE_PX) over.push({ step: i.step, decode: d });
    });
    expect(end.mode).toBe('ending');
    expect(overflowAt, '대사창을 넘친 대사').toEqual([]);
    test.info().annotations.push({ type: 'decode-cache', description: `대사 ${says}줄, 최대 보관 ${JSON.stringify(peak)}` });
    expect(says).toBeGreaterThan(100);
    expect(over, '해독 캐시 상한을 넘긴 순간').toEqual([]);
    // CG 가 떠 있는 줄에서는 해독에 쓴 바로 그 Image 가 화면에 붙어 있다(그래서 퇴출 대상에서 빠진다. stage.ts paintCg)
    expect(peak.attached, '화면에 붙은 해독 캐시 그림(CG)').toBeGreaterThanOrEqual(1);
    // 미리 불러오기가 따로 붙잡는 해독본: 기본 8장, Apple 터치 기기 4장(game.ts APPLE_PRELOAD_HOT_MAX)
    expect(peak.hot).toBeLessThanOrEqual((await page.locator('#vn').getAttribute('data-render')) === 'apple-touch' ? 4 : 8);
    await expect(page.locator('.ending-screen')).toHaveAttribute('data-ending', route);
    await expect(page.locator('.ending-screen')).toHaveAttribute('data-route', route);
    await expect(page.locator('.ending-screen')).toHaveAttribute('data-kind', 'festival');
    await expect(page.locator('.ending-screen .ending-title')).toHaveText(title);
    await expect(page.locator('.ending-screen .end-count')).toContainText(`엔딩 1 / ${total}`);
    // 메달: 보이는 루트마다 하나, 그 안 별 두 개(축제·일상). 이번 엔딩의 별만 켜진다
    await expect(page.locator('.ending-screen .medal')).toHaveCount(total / 2);
    await expect(page.locator('.ending-screen .pip')).toHaveCount(total);
    await expect(page.locator(`.ending-screen .pip[data-ending=${route}]`)).toHaveAttribute('data-reached', '1');
    await expect(page.locator(`.ending-screen .pip[data-ending=${route}_daily]`)).toHaveAttribute('data-reached', '0');
    // 축제 쪽 결말에만 불꽃 고리
    expect(await page.locator('.ending-screen .firework').count()).toBeGreaterThan(0);
    await expect(page.locator('.ending-screen [data-action=to-title]')).toBeVisible();
    // 엔딩 배경과 폴라로이드 사진(CG 또는 미니 무대 배경)이 빌드에서도 실제 그림으로 받아진다
    await expectCssImages(page, '.ending-screen .end-bg');
    await expectCssImages(page, '.ending-screen .polaroid .mini');
    await page.locator('.ending-screen [data-action=to-title]').click();
    await expect(page.locator(`.title-screen [data-ending=${route}]`)).toHaveAttribute('data-reached', '1');
    expect((await readGlobal(page)).endings).toEqual([route]);
    // 엔딩은 전역 기록 세 키 모두에 적힌다(옛 빌드가 앞의 두 키를 덮어써도 v2 키가 지킨다, 계약 6.4)
    const all = await readEndingsAll(page);
    expect(all.union).toEqual([route]);
    for (const k of ['ashita.global', 'ashita.global.ext', 'ashita.global.v2']) expect(all.byKey[k], k).toEqual([route]);
    // 코하루 배지(축제·일상 둘)는 그 루트 엔딩에 도달한 뒤에만 있다(아카네·히나 축제·일상 배지는 늘 있음). 네 사람 배지는 없다
    await expect(page.locator('.title-screen .badge[data-ending=koharu]')).toHaveCount(route === 'koharu' ? 1 : 0);
    await expect(page.locator('.title-screen .badge[data-ending=koharu_daily]')).toHaveCount(route === 'koharu' ? 1 : 0);
    await expect(page.locator('.title-screen .badge[data-ending^=group]')).toHaveCount(0);
    for (const h of ['osana', 'osana_daily', 'tenko', 'tenko_daily']) await expect(page.locator(`.title-screen .badge[data-ending=${h}]`)).toHaveCount(1);
    await expect(page.locator(`.title-screen .badge[data-ending=${route}]`)).toHaveAttribute('data-reached', '1');
    await expect(page.locator('.title-screen .badge[data-reached="1"]')).toHaveCount(1);
    await expect(page.locator('#vn-album-count')).toHaveText(`모은 추억 ${album}`);
    // 엔딩 후 자동 저장은 비워져 이어하기 비활성
    await expect(page.locator('[data-action=continue]')).toBeDisabled();
    // 새 게임에서 이전 루트 상태가 남지 않음
    await newGame(page);
    const fresh = await info(page);
    expect(fresh.route).toBeNull();
    expect(fresh.points).toEqual({ osana: 0, tenko: 0, koharu: 0 });
    expect(fresh.lastHeroine).toBeNull();
    expect(fresh.readCount).toBeGreaterThan(50); // 읽은 대사 기록은 유지
  });
}
