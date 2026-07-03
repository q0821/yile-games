import { defineConfig } from 'vite';

// 象棋引擎（fairy-stockfish-nnue.wasm）是 pthread 多執行緒 build，需頁面 cross-origin
// isolated 才能用 SharedArrayBuffer。已移除所有跨來源子資源（改用系統內建宋體），
// 故 COEP 用 require-corp（全瀏覽器支援，含 iOS Safari）。dev 與 preview 都套用。
// 正式部署（Cloudflare）需設相同回應標頭，見 DEPLOY-XIANGQI.md。
const crossOriginIsolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

// iOS App Store build（`vite build --mode ios`）：因 Fairy-Stockfish / ffish 為 GPL-3.0，
// 與 Apple 散布條款相衝突，故 iOS 版拔掉象棋/將棋/西洋棋/象棋殘局（GPL）與死活練習（UX）。
// __IOS_STORE__ 為編譯期常數，被排除模組在 main.js 以 `if (!__IOS_STORE__) import(...)` 守衛，
// esbuild transform 期即 DCE 掉整段 → 對應 chunk 不生成、GPL 碼不進包。見 scripts/strip-ios-assets.mjs。
export default defineConfig(({ mode }) => {
  const isIOS = mode === 'ios';
  return {
    publicDir: 'public',
    define: {
      __IOS_STORE__: JSON.stringify(isIOS),
    },
    // KataGo 引擎的 worker 用 ES module（new Worker(new URL('./worker.ts', import.meta.url), {type:'module'})）
    worker: { format: 'es' },
    server: { headers: crossOriginIsolationHeaders },
    preview: { headers: crossOriginIsolationHeaders },
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      rollupOptions: {
        // 多頁：主程式 + KataGo spike + 象棋引擎 spike 測試頁。
        // iOS 版只出主程式：spike 頁是開發測試用，且 xiangqi-spike 會載入 GPL 引擎。
        input: isIOS
          ? { main: 'index.html' }
          : {
              main: 'index.html',
              'katago-spike': 'katago-spike.html',
              'xiangqi-spike': 'xiangqi-spike.html',
              'ios-spike': 'ios-spike.html',
            },
        external: [],
      },
    },
  };
});
