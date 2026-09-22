// 完整網頁流程：node scripts/check-ggg.cjs [preview URL]
const { chromium } = require('playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const base = process.argv[2] || 'http://127.0.0.1:4175';
const key = 'gogame_ggg_progress_v1';

(async () => {
  const { loadProblem, solutionPath, coordinate } = await import('../ggg-problem.js');
  const { sgfMove } = await import('../sgf-tree.js');
  const dir = 'public/go-problems/ggg/';
  const manifest = JSON.parse(fs.readFileSync(dir + 'index.json'));
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 900 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    const page = await context.newPage();
    const errors = [], models = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', r => { if (r.url().includes('katago-small')) models.push(r.url()); });
    await page.goto(base + '/#home');
    await page.evaluate(() => localStorage.setItem('gogame_tsumego_progress', 'keep-old-progress'));
    await page.getByRole('button', { name: /死活練習/ }).click();
    await page.locator('#gggSelect').waitFor();
    assert.equal(await page.locator('#gggSelect option').count(), 140);
    const move = async coord => {
      const cell = page.locator('#gggBoard').getByRole('button', { name: new RegExp(`^${coord}，`) });
      await cell.focus(); await page.keyboard.press('Enter');
    };
    await move('S1');
    assert.match(await page.locator('#gggFeedback').innerText(), /尚未走到/);
    assert.match(await page.locator('#gggStats').innerText(), /0／140/);
    await move('O1');
    assert.match(await page.locator('#gggFeedback').innerText(), /本次解答變化完成/);
    assert.match(await page.locator('#gggStats').innerText(), /1／140/);
    await page.getByRole('button', { name: '看解答', exact: true }).click();
    await page.getByRole('button', { name: '示範下一手', exact: true }).click();
    await page.getByRole('button', { name: '示範下一手', exact: true }).click();
    assert.ok(await page.locator('#gggBranches button').count() >= 2);
    await page.getByRole('button', { name: /變化.*黑 Q1/ }).click();
    assert.match(await page.locator('#gggComment').innerText(), /also correct/i);
    await page.getByRole('button', { name: '上一手', exact: true }).click();
    assert.ok(await page.locator('#gggBranches button').count() >= 2);
    await page.getByRole('button', { name: '全部題目', exact: true }).click();
    await page.locator('#gggBoard').waitFor();
    await move('S3');
    assert.match(await page.locator('#gggFeedback').innerText(), /參考變化/);
    await page.getByRole('button', { name: '查看本次變化', exact: true }).click();
    assert.match(await page.locator('#gggTitle').innerText(), /查看原譜/);
    await page.getByRole('button', { name: '複習錯題', exact: true }).click();
    await page.locator('#gggBoard').waitFor();
    await move('S1'); await move('Q1');
    await page.getByRole('button', { name: '下一題', exact: true }).click();
    await page.getByText('目前沒有待複習的題目。', { exact: true }).waitFor();
    await page.getByRole('button', { name: '返回全部題目', exact: true }).click();

    // 每題實際透過選單與棋盤作答，不從瀏覽器直接呼叫規則函式。
    for (const meta of manifest.problems) {
      await page.locator('#gggSelect').selectOption(meta.id);
      await page.locator('#gggTitle').filter({ hasText: new RegExp(`第 ${Number(meta.id.split('-').at(-1))} 題$`) }).waitFor();
      const p = loadProblem(fs.readFileSync(dir + meta.file, 'utf8'), meta.id);
      for (const id of solutionPath(p).slice(1)) {
        const m = sgfMove(p.nodes[id], p.size);
        if (m.color !== p.player) continue;
        if (m.point) await move(coordinate(m.point, p.size));
        else await page.getByRole('button', { name: '虛手', exact: true }).click();
      }
      assert.match(await page.locator('#gggFeedback').innerText(), /本次解答變化完成/);
    }
    assert.match(await page.locator('#gggStats').innerText(), /140／140/);
    await page.reload();
    await page.locator('#gggTitle').filter({ hasText: '第 140 題' }).waitFor();
    assert.match(await page.locator('#gggStats').innerText(), /140／140/);
    assert.equal(await page.evaluate(() => localStorage.getItem('gogame_tsumego_progress')), 'keep-old-progress');
    await page.locator('#gggSelect').selectOption('ggg-easy-01');
    await page.locator('#gggTitle').filter({ hasText: '第 1 題' }).waitFor();
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: `/tmp/gogame-ggg-${width}.png`, fullPage: true });
    }
    assert.deepEqual(errors, []); assert.deepEqual(models, []);

    const fresh = async () => {
      const c = await browser.newContext({ serviceWorkers: 'block' });
      return { c, p: await c.newPage() };
    };
    const hint = await fresh();
    await hint.p.goto(base + '/#tsumego');
    await hint.p.getByRole('button', { name: '看解答', exact: true }).click();
    await hint.p.reload();
    for (const coord of ['S1', 'O1']) await hint.p.locator('#gggBoard').getByRole('button', { name: new RegExp(`^${coord}，`) }).click();
    assert.match(await hint.p.locator('#gggFeedback').innerText(), /不列入自行完成/);
    assert.match(await hint.p.locator('#gggStats').innerText(), /0／140/);
    await hint.c.close();

    for (const target of ['index.json', 'ggg-easy-01.sgf']) {
      const retry = await fresh();
      await retry.p.route(`**/go-problems/ggg/${target}`, r => r.fulfill({ status: 503, body: 'Unavailable' }));
      await retry.p.goto(base + '/#tsumego');
      await retry.p.getByText('題目載入失敗，請確認網路後重試。', { exact: true }).waitFor();
      await retry.p.unroute(`**/go-problems/ggg/${target}`);
      await retry.p.getByRole('button', { name: '重新載入', exact: true }).click();
      await retry.p.locator('#gggBoard').waitFor();
      await retry.c.close();
    }
    const stale = await fresh();
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await stale.p.route('**/go-problems/ggg/index.json', async r => { await gate; await r.continue(); });
    const request = stale.p.waitForRequest('**/go-problems/ggg/index.json');
    await stale.p.goto(base + '/#tsumego'); await request;
    await stale.p.locator('#tsumegoScreen').getByRole('link', { name: '回首頁', exact: true }).click();
    await stale.p.locator('#tsumegoScreen').waitFor({ state: 'hidden' });
    const response = stale.p.waitForResponse('**/go-problems/ggg/index.json');
    release(); await response;
    assert.equal(await stale.p.locator('#tsumegoScreen').isVisible(), false);
    await stale.p.getByRole('button', { name: /死活練習/ }).click();
    await stale.p.locator('#gggBoard').waitFor();
    await stale.c.close();

    for (const mode of ['corrupt', 'blocked']) {
      const store = await fresh();
      await store.p.addInitScript(({ key, mode }) => {
        if (mode === 'corrupt') localStorage.setItem(key, 'bad-json');
        else Storage.prototype.setItem = function () { throw new Error('test storage unavailable'); };
      }, { key, mode });
      await store.p.goto(base + '/#tsumego');
      await store.p.locator('.ggg-warning').waitFor();
      if (mode === 'corrupt') assert.equal(await store.p.evaluate(key => localStorage.getItem(key), key), 'bad-json');
      await store.c.close();
    }
    console.log('PASS：140 題完整 UI 作答、原譜分支、錯題複習、提示不計分、重載保留進度、舊進度不變、載入重試、過期請求、儲存錯誤、鍵盤與三種寬度；無模型下載或頁面例外。');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
