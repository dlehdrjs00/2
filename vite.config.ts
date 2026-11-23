/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

// base './' : 어느 경로(GitHub Pages 하위 경로, 정적 호스팅, 파일 공유 미리보기)에 올려도 동작하도록 상대 경로로 빌드
// JS/CSS 는 기본값대로 assets/[name]-[hash].* 로 나와 배포마다 캐시가 갈린다.
// public/ 아래 파일(에셋·아이콘·매니페스트)은 이름 그대로 복사된다(해시 없음).
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 800,
  },
  server: { port: 5173 },
  preview: { port: 4173 },
  // `npm test`(vitest run)는 단위 테스트만. tests/e2e/*.spec.ts 는 Playwright 전용(npm run test:e2e)
  test: {
    exclude: ['**/node_modules/**', '**/.git/**', '**/dist/**', 'tests/e2e/**'],
  },
});
