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
    const legacy = '{"legacy":"preserve-me"}';
    await page.goto(`${base}/#home`);
    await page.evaluate(value => localStorage.setItem('gogame_tsumego_progress', value), legacy);
    await page.goto(`${base}/#learn`);
    await page.getByRole('button', { name: '1 口氣', exact: true }).click();
    assert.match(await page.locator('#learnFeedback').innerText(), /再數一次/);
    await page.getByRole('button', { name: '看解說', exact: true }).click();
    assert.match(await page.locator('#learnSummary').innerText(), /0／21/);
    await page.reload();
    await page.getByRole('button', { name: '4 口氣', exact: true }).click();
    assert.match(await page.locator('#learnFeedback').innerText(), /跟著解答完成/);
    assert.match(await page.locator('#learnSummary').innerText(), /0／21/);
    await page.getByRole('button', { name: '1. 數氣', exact: true }).click();
    for (const [i, answer] of [4, 3, 2, 6].entries()) {
      const choice = page.getByRole('button', { name: `${answer} 口氣`, exact: true });
      await choice.focus(); await page.keyboard.press('Enter');
      assert.match(await page.locator('#learnFeedback').innerText(), /答對了/);
      await page.getByRole('button', { name: i === 3 ? '下一個主題' : '下一題', exact: true }).click();
    }
    const sequences = [
      ['D3', 'B5', 'D4', 'D5'], ['D3', 'B5', 'D4', 'D5'],
      ['C3', 'B3', 'B5'], ['C3', 'B3', 'B5'], ['D4', 'A4', 'A4'],
    ];
    // 吃子題先答錯再答對，確認已解與待複習分開。
    await page.locator('#learnBoard').getByRole('button', { name: /^E1，/ }).click();
    for (const [kind, answers] of sequences.entries()) {
      for (const [i, coord] of answers.entries()) {
        await page.locator('#learnBoard').getByRole('button', { name: new RegExp(`^${coord}，`) }).click();
        assert.match(await page.locator('#learnFeedback').innerText(), /答對了/);
        if (kind === sequences.length - 1 && i === answers.length - 1) break;
        await page.getByRole('button', { name: i === answers.length - 1 ? '下一個主題' : '下一題', exact: true }).click();
      }
    }
    assert.match(await page.locator('#learnSummary').innerText(), /21／21 題，待複習 1 題/);
    await page.reload();
    await page.getByRole('heading', { name: '黑先，用吃子救出目標黑棋' }).waitFor();
    assert.match(await page.locator('#learnProgress').innerText(), /第 3 題/);
    assert.match(await page.locator('#learnSummary').innerText(), /21／21 題，待複習 1 題/);
    await page.getByRole('button', { name: '複習錯題（1）', exact: true }).click();
    await page.locator('#learnBoard').getByRole('button', { name: /^D3，/ }).click();
    await page.getByRole('button', { name: '完成本輪複習', exact: true }).click();
    await page.getByRole('heading', { name: '目前沒有待複習的題目' }).waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem('gogame_tsumego_progress')), legacy);
    await page.getByRole('button', { name: '全部練習', exact: true }).click();
    await page.getByRole('button', { name: '5. 阻止直接連接', exact: true }).click();
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
    console.log('PASS：21 題、進度還原、錯題複習、提示不計分、舊進度保留、鍵盤、三種寬度、新手設定、AI 落子、存檔還原、讓子覆盤分支；無模型下載或頁面例外。');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
