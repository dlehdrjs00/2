/** 오디오 파일이 없거나 Web Audio 를 쓸 수 없어도 게임이 진행되는지 */
import { expect, test } from '@playwright/test';
import { advanceOne, boot, info, newGame } from './helpers';

test.beforeEach(async ({}, ti) => {
  test.skip(ti.project.name !== 'desktop', '데스크톱에서 확인');
});

test('음원 요청이 모두 실패해도 진행된다', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(/\.mp3$/, (r) => r.fulfill({ status: 404, body: 'not found' }));
  await boot(page, { textSpeed: 10, bgmVolume: 80, sfxVolume: 80 });
  await newGame(page);
  for (let i = 0; i < 5; i++) await advanceOne(page);
  expect((await info(page)).mode).toBe('play');
  expect(errors).toEqual([]);
});

test('Web Audio 가 없는 브라우저에서도 진행된다', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    // @ts-expect-error 테스트용으로 제거
    delete window.AudioContext;
    // @ts-expect-error 테스트용으로 제거
    delete window.webkitAudioContext;
  });
  await boot(page);
  await newGame(page);
  for (let i = 0; i < 5; i++) await advanceOne(page);
  expect((await info(page)).mode).toBe('play');
  expect(errors).toEqual([]);
});
