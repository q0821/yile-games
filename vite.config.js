import { defineConfig } from 'vite';

// 象棋引擎（fairy-stockfish-nnue.wasm）是 pthread 多執行緒 build，需頁面 cross-origin
// isolated 才能用 SharedArrayBuffer。COEP 用 credentialless（非 require-corp）以免擋掉
// 主站的 Google Fonts 等無 CORP 標頭的跨來源資源。dev 與 preview 都套用。
const crossOriginIsolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
};

export default defineConfig({
  publicDir: 'public',
  // KataGo 引擎的 worker 用 ES module（new Worker(new URL('./worker.ts', import.meta.url), {type:'module'})）
  worker: { format: 'es' },
  server: { headers: crossOriginIsolationHeaders },
  preview: { headers: crossOriginIsolationHeaders },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      // 多頁：主程式 + KataGo spike + 象棋引擎 spike 測試頁
      input: {
        main: 'index.html',
        'katago-spike': 'katago-spike.html',
        'xiangqi-spike': 'xiangqi-spike.html',
      },
      external: [],
    },
  },
});
