const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const base = process.argv[2] || 'http://127.0.0.1:4175';
const key = 'gogame_learn_progress_v1';
(async () => {
  // 已知陽性確認檢查的是實際產物目錄，再檢查題庫不存在。
  assert.ok(fs.existsSync('dist/index.html'));
  assert.ok(fs.existsSync('dist/img/cards/play.webp'));
  assert.equal(fs.existsSync('dist/tsumego'), false);
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}/#home`);
    assert.equal(await page.locator('#homePremiumEntry').isVisible(), false);
    await page.evaluate(key => localStorage.setItem(key, '{corrupt'), key);
    await page.goto(`${base}/#learn`);
    await page.locator('#learnStorage').waitFor({ state: 'visible' });
    assert.match(await page.locator('#learnStorage').innerText(), /無法讀取/);
    await page.getByRole('button', { name: '4 口氣', exact: true }).click();
    assert.equal(await page.evaluate(key => localStorage.getItem(key), key), '{corrupt');
    await page.getByRole('button', { name: '複習錯題（0）' }).click();
    await page.getByRole('heading', { name: '目前沒有待複習的題目' }).waitFor();
    await page.getByRole('button', { name: '全部練習', exact: true }).click();
    assert.deepEqual(errors, []);
    await context.close();

    const blocked = await browser.newContext();
    await blocked.addInitScript(key => {
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function(name, value) {
        if (name === key) throw new DOMException('test quota', 'QuotaExceededError');
        return set.call(this, name, value);
      };
    }, key);
    const b = await blocked.newPage();
    await b.goto(`${base}/#learn`);
    await b.getByRole('button', { name: '1 口氣', exact: true }).click();
    assert.match(await b.locator('#learnStorage').innerText(), /無法儲存/);
    await b.getByRole('button', { name: '4 口氣', exact: true }).click();
    assert.match(await b.locator('#learnSummary').innerText(), /1／21/);
    assert.equal(await b.evaluate(key => localStorage.getItem(key), key), null);
    await b.reload();
    await b.getByRole('button', { name: '1 口氣', exact: true }).waitFor();
    assert.match(await b.locator('#learnSummary').innerText(), /0／21/);
    await blocked.close();

    // 獨立空白頁載入真實 SW，不觸發 main.js 的本機開發環境 unregister。
    const swContext = await browser.newContext();
    await swContext.route('**/sw-probe.html', route => route.fulfill({ contentType: 'text/html', body: '<title>Service Worker probe</title>' }));
    const swPage = await swContext.newPage();
    await swPage.goto(`${base}/sw-probe.html`);
    for (const path of ['index.json', 'beginner.json', 'intermediate.json', 'advanced.json']) {
      assert.equal((await swContext.request.get(`${base}/tsumego/${path}`)).status(), 410);
    }
    assert.equal((await swContext.request.get(`${base}/manifest.json`)).status(), 200);
    await swPage.evaluate(async () => {
      await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
      const cache = await caches.open('gogame-probe-old');
      await cache.put('/known-cache.txt', new Response('known-positive'));
      await cache.put('/tsumego/beginner.json', new Response('["old-test-fixture"]'));
    });
    await swContext.setOffline(true);
    const actual = await swPage.evaluate(async () => ({
      positive: await (await fetch('/known-cache.txt')).text(),
      denied: (await fetch('/tsumego/beginner.json')).status,
    }));
    assert.deepEqual(actual, { positive: 'known-positive', denied: 410 });
    await swContext.close();
    console.log('PASS：建置排除、原題 URL 阻擋、舊快取離線阻擋、正常快取陽性、損壞進度保留、儲存失敗顯示、空錯題、網頁無購買入口。');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
