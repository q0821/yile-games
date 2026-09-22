import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

// 原始資料留供授權盤點；只移除 Vite 本次複製到輸出目錄的副本。
export function withholdTsumego() {
  let root;
  let isIOS;
  function deny(server) {
    server.middlewares.use((req, res, next) => {
      let pathname;
      try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
      catch { res.statusCode = 400; res.end(); return; }
      if (!/(^|\/)tsumego(?:\/|$)/.test(pathname)) return next();
      res.statusCode = 410;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify({ available: false, message: '死活題庫暫停提供，請使用圍棋入門練習。' }));
    });
  }
  return {
    name: 'withhold-unverified-tsumego',
    configResolved(config) { root = config.root; isIOS = config.mode === 'ios'; },
    configureServer: deny,
    configurePreviewServer: deny,
    writeBundle(options) {
      if (!options.dir) throw new Error('題庫排除需要明確的建置輸出目錄');
      const dir = resolve(root, options.dir);
      if (dir === resolve(root) || dir === resolve(root, 'public')) {
        throw new Error('不可將建置輸出設為來源目錄');
      }
      rmSync(resolve(dir, 'tsumego'), { recursive: true, force: true });
      if (isIOS) rmSync(resolve(dir, 'go-problems'), { recursive: true, force: true });
    },
  };
}
