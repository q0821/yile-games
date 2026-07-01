import { defineConfig } from 'vite';

// 象棋引擎（fairy-stockfish-nnue.wasm）是 pthread 多執行緒 build，需頁面 cross-origin
// isolated 才能用 SharedArrayBuffer。已移除所有跨來源子資源（改用系統內建宋體），
// 故 COEP 用 require-corp（全瀏覽器支援，含 iOS Safari）。dev 與 preview 都套用。
// 正式部署（Cloudflare）需設相同回應標頭，見 DEPLOY-XIANGQI.md。
const crossOriginIsolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
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
        'ios-spike': 'ios-spike.html',
      },
      external: [],
    },
  },
});
