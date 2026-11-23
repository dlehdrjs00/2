/** 동점 처리와 루트 확정 */
import { expect, test } from '@playwright/test';
import { advanceOne, advanceToStop, boot, info, newGame, pick } from './helpers';

test.beforeEach(async ({}, ti) => {
  test.skip(ti.project.name !== 'desktop', '분기 규칙은 데스크톱에서만 확인');
});

for (const [picks, expected] of [
  [['a', 'b', 'a', 'b'], 'tenko'],
  [['b', 'a', 'b', 'a'], 'osana'],
  [['a', 'a', 'b', 'b'], 'tenko'],
  [['b', 'b', 'a', 'a'], 'osana'],
  [['a', 'a', 'a', 'b'], 'osana'],
] as const) {
  test(`선택 ${picks.join('')} → ${expected} 루트`, async ({ page }) => {
    await boot(page);
    await newGame(page);
    for (const p of picks) {
      const i = await advanceToStop(page);
      expect(i.frame).toBe('choice');
      expect(i.route).toBeNull();
      await pick(page, p);
    }
    // 선택지 4의 반응 대사를 지나 루트가 확정될 때까지 진행
    for (let g = 0; g < 80 && (await info(page)).route === null; g++) await advanceOne(page);
    expect((await info(page)).route).toBe(expected);
    const i = await info(page);
    const tie = i.points!.osana === i.points!.tenko;
    if (tie) expect(i.lastHeroine).toBe(expected);
    // 루트 진입 후 첫 장면 접두사 확인(o* / t*)
    expect(i.step!.startsWith(expected === 'osana' ? 'o' : 't')).toBe(true);
  });
}
