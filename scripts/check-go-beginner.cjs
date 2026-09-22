// 本機網頁完整流程：node scripts/check-go-beginner.cjs [base URL]
const { chromium } = require('playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    const modelRequests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (request.url().includes('katago-small')) modelRequests.push(request.url()); });
    const base = process.argv[2] || 'http://127.0.0.1:5173';
    await page.goto(`${base}/#learn`);
    await page.getByRole('button', { name: '1 口氣', exact: true }).click();
    assert.match(await page.locator('#learnFeedback').innerText(), /再數一次/);
    await page.getByRole('button', { name: '看解說', exact: true }).click();
    assert.match(await page.locator('#learnSummary').innerText(), /0／12/);
    await page.getByRole('button', { name: '再做一次', exact: true }).click();
    for (const [i, answer] of [4, 3, 2, 6].entries()) {
      const choice = page.getByRole('button', { name: `${answer} 口氣`, exact: true });
      await choice.focus(); await page.keyboard.press('Enter');
      assert.match(await page.locator('#learnFeedback').innerText(), /答對了/);
      await page.getByRole('button', { name: i === 3 ? '下一個主題' : '下一題', exact: true }).click();
    }
    for (const kind of ['capture', 'escape']) {
      for (const [i, coord] of ['D3', 'B5', 'D4', 'D5'].entries()) {
        await page.locator('#learnBoard').getByRole('button', { name: new RegExp(`^${coord}，`) }).click();
        assert.match(await page.locator('#learnFeedback').innerText(), /答對了/);
        if (kind === 'escape' && i === 3) break;
        await page.getByRole('button', { name: i === 3 ? '下一個主題' : '下一題', exact: true }).click();
      }
    }
    assert.match(await page.locator('#learnSummary').innerText(), /十二題/);
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: `/tmp/gogame-learn-${width}.png`, fullPage: true });
    }
    await page.getByRole('link', { name: '到圍棋對弈，試試「新手設定」' }).click();
    await page.getByRole('button', { name: '新手設定', exact: true }).click();
    assert.equal(await page.locator('#boardSize').inputValue(), '9');
    assert.equal(await page.locator('#handicap').inputValue(), '4');
    assert.equal(await page.locator('#goBeginnerMode').isChecked(), true);
    assert.equal(await page.locator('#timerToggle').isChecked(), false);
    await page.getByRole('button', { name: '開始新遊戲', exact: true }).click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('gogame_state'))?.moveHistory.length === 1);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('gogame_state')));
    assert.equal(saved.beginnerMode, true);
    assert.equal(saved.handicap, 4);
    assert.equal(saved.currentPlayer, 1);
    assert.equal(saved.board.flat().filter(v => v === 1).length, 4);
    await page.reload();
    await page.locator('#goBeginnerBadge').waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('gogame_state')).beginnerMode), true);
    // 經畫面操作認輸、覆盤及分支，不能以直接呼叫規則函式取代路徑。
    page.on('dialog', dialog => dialog.accept());
    await page.locator('#goControls').getByRole('button', { name: '認輸', exact: true }).click();
    await page.locator('#modalReviewBtn').click();
    await page.locator('#reviewBar').getByRole('button', { name: '最初', exact: true }).click();
    await page.getByRole('button', { name: '從這手換個下法重練', exact: true }).click();
    // 分支從第零手開始，四顆讓子仍在盤上，並由白方先行。
    assert.equal(await page.evaluate(() => window.moveHistory.length), 0);
    const canvas = page.locator('#board');
    const bounds = await canvas.boundingBox();
    await canvas.click({ position: { x: bounds.width * 74 / 668, y: bounds.height * 74 / 668 } });
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('gogame_state'))?.moveHistory[0]?.player === 2);
    const active = await page.evaluate(() => JSON.parse(localStorage.getItem('gogame_state')));
    assert.equal(active.handicap, 4);
    assert.equal(active.beginnerMode, true);
    assert.equal(active.board[2][2], 1);
    assert.equal(active.board[2][6], 1);
    assert.equal(active.board[6][2], 1);
    assert.equal(active.board[6][6], 1);
    assert.equal(active.moveHistory[0].player, 2);
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('gogame_state'))?.moveHistory.length === 2);
    assert.equal(modelRequests.length, 0);
    assert.deepEqual(errors, []);
    console.log('PASS：12 題、錯答／解說、鍵盤、三種寬度、新手設定、AI 落子、存檔還原、讓子覆盤分支；無模型下載或頁面例外。');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
