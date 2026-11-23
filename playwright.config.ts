import { defineConfig } from '@playwright/test';

/**
 * E2E: 프로덕션 빌드(vite preview)를 대상으로 실행.
 * Chromium 만 설치된 환경이라 모바일은 Chromium 모바일 에뮬레이션(터치·뷰포트)으로 확인한다.
 * 실제 iOS Safari / Android Chrome 기기 검증은 아님.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 180_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: 2,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173/',
    trace: 'off',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npx vite preview --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173/',
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 720 } } },
    {
      name: 'phone-landscape',
      use: { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    },
    {
      name: 'phone-se-landscape',
      use: { viewport: { width: 667, height: 375 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    },
  ],
});
