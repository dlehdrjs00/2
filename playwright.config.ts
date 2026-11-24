import { defineConfig, devices } from '@playwright/test';

/**
 * E2E: 프로덕션 빌드(vite preview)를 대상으로 실행.
 * Chromium PC/Android 크기 + WebKit iPad 크기. 실제 iOS/Android 기기 성능 검증은 아님.
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
    // WebKit + iPad 기기 설정(옛 iPad UA 라 #vn[data-render='apple-touch']). 두 엔딩·저장·렌더링·자동 저장 실패 안내를 본다.
    // 다른 스펙은 CDP(Chromium 전용) 입력이나 데스크톱·휴대폰 전용 검사가 많아 넣지 않았다(CDP 검사는 WebKit 에서 건너뜀)
    {
      name: 'ipad-webkit',
      testMatch: /(?:routes|saveload|rendering|autosave)\.spec\.ts/,
      use: { ...devices['iPad (gen 7) landscape'], browserName: 'webkit' },
    },
  ],
});
