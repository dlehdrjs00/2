/** 두 히로인의 엔딩까지 실제 화면으로 플레이. 휴대폰 프로젝트에서는 모든 대사의 잘림도 확인 */
import { expect, test } from '@playwright/test';
import { boot, expectCssImages, info, newGame, playToEnding } from './helpers';

for (const [route, picks] of [
  ['osana', ['a', 'a', 'a', 'a']],
  ['tenko', ['b', 'b', 'b', 'b']],
] as const) {
  test(`${route} 엔딩까지 도달하고 엔딩 기록이 남는다`, async ({ page }) => {
    await boot(page);
    await newGame(page);
    const overflowAt: string[] = [];
    const end = await playToEnding(page, [...picks], async (i) => {
      if (i.textOverflow) overflowAt.push(i.step!);
    });
    expect(end.mode).toBe('ending');
    expect(overflowAt, '대사창을 넘친 대사').toEqual([]);
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
