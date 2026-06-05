import { defineConfig } from 'vite';

export default defineConfig({
  publicDir: 'public',
  // KataGo 引擎的 worker 用 ES module（new Worker(new URL('./worker.ts', import.meta.url), {type:'module'})）
  worker: { format: 'es' },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      // 多頁：主程式 + KataGo spike 測試頁
      input: {
        main: 'index.html',
        'katago-spike': 'katago-spike.html',
      },
      external: [],
    },
  },
});
