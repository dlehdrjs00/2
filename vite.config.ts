import { defineConfig } from 'vite';

// base './' : 어느 경로(GitHub Pages 하위 경로, 정적 호스팅, 파일 공유 미리보기)에 올려도 동작하도록 상대 경로로 빌드
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 800,
  },
  server: { port: 5173 },
  preview: { port: 4173 },
});
