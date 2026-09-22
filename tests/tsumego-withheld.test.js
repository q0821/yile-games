const fs = require('node:fs');
const vm = require('node:vm');
const { sandboxWithMainLifecycle } = require('./helpers');

test('死活路由顯示練習畫面，既有舊題庫進度不變', () => {
  const original = '{"legacy":"preserve"}';
  const app = sandboxWithMainLifecycle({ hash: '#tsumego', storage: { gogame_tsumego_progress: original } });
  expect(app.elements.tsumegoScreen.style.display).toBe('flex');
  expect(app.localStorage.getItem('gogame_tsumego_progress')).toBe(original);
});
test('新版 Service Worker 在查快取與網路前拒絕題庫，但正常資源仍可讀快取', async () => {
  const handlers = {};
  const cached = new Response('known-cache');
  const caches = { match: jest.fn(async () => cached) };
  const fetch = jest.fn();
  vm.runInNewContext(fs.readFileSync('public/sw.js', 'utf8'), {
    self: { location: { origin: 'https://example.test' }, addEventListener: (key, fn) => { handlers[key] = fn; } },
    URL, Response, Promise, caches, fetch,
  });
  async function request(path) {
    let promise;
    handlers.fetch({ request: { method: 'GET', url: `https://example.test${path}` }, respondWith(p) { promise = p; } });
    return promise;
  }
  // 已知陽性，先確認快取探針確實收到一般資源。
  expect(await (await request('/img/cards/play.webp')).text()).toBe('known-cache');
  expect(caches.match).toHaveBeenCalledTimes(1);
  for (const path of ['/tsumego/index.json', '/tsumego/beginner.json?old=1', '/tsumego/intermediate.json', '/tsumego/advanced.json', '/%74sumego/beginner.json']) {
    expect((await request(path)).status).toBe(410);
  }
  expect(caches.match).toHaveBeenCalledTimes(1);
  expect(fetch).not.toHaveBeenCalled();
});
