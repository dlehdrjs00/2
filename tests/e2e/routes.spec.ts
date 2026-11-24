/**
 * 두 히로인의 엔딩까지 실제 화면으로 플레이. 휴대폰 프로젝트에서는 모든 대사의 잘림도 확인.
 * 긴 진행 동안 무대 해독 캐시(src/ui/image-cache.ts)가 상한(8장·12Mi 픽셀)을 넘겨 쌓이지 않는지도 대사마다 본다.
 * 해독 중인 그림·화면에 붙은 CG 는 상한 밖이고, 해독 직후 정리 사이에 화면에서 떨어진 CG 한 장만큼의 여유를 둔다.
 */
import { expect, test } from '@playwright/test';
import { boot, expectCssImages, info, newGame, playToEnding, type Info } from './helpers';

/** 이 크기(배경·CG 1920x1080)의 그림 한 장 */
const ONE_IMAGE_PX = 1920 * 1080;

for (const [route, picks] of [
  ['osana', ['a', 'a', 'a', 'a']],
  ['tenko', ['b', 'b', 'b', 'b']],
] as const) {
  test(`${route} 엔딩까지 도달하고 엔딩 기록이 남는다`, async ({ page }) => {
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
    await expect(page.locator('.ending-screen [data-action=to-title]')).toBeVisible();
    // 엔딩 배경과 폴라로이드 사진(CG 또는 미니 무대 배경)이 빌드에서도 실제 그림으로 받아진다
    await expectCssImages(page, '.ending-screen .end-bg');
    await expectCssImages(page, '.ending-screen .polaroid .mini');
    await page.locator('.ending-screen [data-action=to-title]').click();
    await expect(page.locator(`.title-screen [data-ending=${route}]`)).toHaveAttribute('data-reached', '1');
    // 엔딩 후 자동 저장은 비워져 이어하기 비활성
    await expect(page.locator('[data-action=continue]')).toBeDisabled();
    // 새 게임에서 이전 루트 상태가 남지 않음
    await newGame(page);
    const fresh = await info(page);
    expect(fresh.route).toBeNull();
    expect(fresh.points).toEqual({ osana: 0, tenko: 0 });
    expect(fresh.lastHeroine).toBeNull();
    expect(fresh.readCount).toBeGreaterThan(50); // 읽은 대사 기록은 유지
  });
}
