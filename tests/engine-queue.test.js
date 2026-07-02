// engine-queue.test.js — xiangqi-engine.js 引擎請求序列化佇列的行為測試。
//
// xiangqi-engine.js 是象棋／將棋／西洋棋共用的單一 UCI process（全域 `_tap` 與 waiter）。
// 對弈（bestMove）、覆盤（analyze）、建議走法（hint）若並發呼叫會互搶輸出，導致結果錯亂。
// 這裡用 mock Stockfish 引擎（注入 `ctx.Stockfish`，沿用 xiangqi-engine.js 既有的
// `window.Stockfish` 判斷式作為測試注入點，不需替來源檔案另開測試專用 API）驗證：
//   1. 並發兩個請求依序執行、指令不交錯
//   2. hint() 取消後結果丟棄（reject，不是拿到真的著法）
//   3. 佇列中某請求丟錯不會卡死後續請求
//   4. hint() 對「一般手」與「將棋打入」的著法解析
const { sandboxWithXiangqiEngine } = require('./helpers');

/**
 * 建一個可控制的 mock Stockfish 引擎：'uci'／'isready' 自動回覆（handshake 雜訊不用手動驅動），
 * 'go ...' 需測試手動 emit('bestmove ...') 才會有回應——藉此觀察「go」指令送出的先後順序，
 * 驗證併發請求是否真的被序列化（而非同時送出、互搶輸出）。
 */
function createMockStockfish() {
  const sent = [];
  let listener = null;
  const engine = {
    addMessageListener(fn) { listener = fn; },
    postMessage(cmd) {
      sent.push(cmd);
      if (cmd === 'uci') Promise.resolve().then(() => listener('uciok'));
      else if (cmd === 'isready') Promise.resolve().then(() => listener('readyok'));
    }
  };
  return {
    factory: () => Promise.resolve(engine),
    sent,
    emit(line) { listener(line); }
  };
}

/** 排乾目前所有待處理的 microtask 鏈（一個 macrotask tick 足夠，因為 handshake 全走 Promise）。 */
function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('引擎請求序列化：並發不交錯', () => {
  test('並發兩個 bestMove，指令依序送出，不交錯', async () => {
    const ctx = sandboxWithXiangqiEngine();
    const mock = createMockStockfish();
    ctx.Stockfish = mock.factory;

    const p1 = ctx.bestMove({ fen: 'FEN_A', level: 5, movetimeMs: 100 });
    const p2 = ctx.bestMove({ fen: 'FEN_B', level: 5, movetimeMs: 100 });

    await tick();
    // 只有第一個請求應該已經送出 position/go；第二個請求應該還在佇列裡沒開始
    expect(mock.sent.some((c) => c.includes('position fen FEN_A'))).toBe(true);
    expect(mock.sent.some((c) => c.includes('position fen FEN_B'))).toBe(false);
    expect(mock.sent.filter((c) => c.startsWith('go ')).length).toBe(1);

    mock.emit('bestmove h2e2');
    const mv1 = await p1;
    expect(mv1).toBe('h2e2');

    await tick();
    // 第一個請求完成後，第二個請求才開始送出指令
    expect(mock.sent.some((c) => c.includes('position fen FEN_B'))).toBe(true);
    expect(mock.sent.filter((c) => c.startsWith('go ')).length).toBe(2);

    mock.emit('bestmove e2e4');
    const mv2 = await p2;
    expect(mv2).toBe('e2e4');
  }, 20000); // 滿載並行時 vm sandbox 初始化偶發吃掉預設 5s，放寬避免 flake
});

describe('hint() 取消語意', () => {
  test('取消後 promise 被丟棄（reject），不會拿到真正的著法', async () => {
    const ctx = sandboxWithXiangqiEngine();
    const mock = createMockStockfish();
    ctx.Stockfish = mock.factory;

    const { promise, cancel } = ctx.hint({ fen: 'FEN_C', variant: 'xiangqi', movetime: 100 });
    await tick();
    cancel();
    mock.emit('bestmove h2e2'); // 引擎仍照常回應；取消只影響呼叫方拿到的 promise
    await expect(promise).rejects.toMatchObject({ cancelled: true });
  });

  test('取消不會卡死佇列，後續請求仍正常執行', async () => {
    const ctx = sandboxWithXiangqiEngine();
    const mock = createMockStockfish();
    ctx.Stockfish = mock.factory;

    const { promise: p1, cancel } = ctx.hint({ fen: 'FEN_D', movetime: 100 });
    await tick();
    cancel();
    mock.emit('bestmove h2e2');
    await expect(p1).rejects.toMatchObject({ cancelled: true });

    await tick();
    const p2 = ctx.bestMove({ fen: 'FEN_E', level: 5, movetimeMs: 100 });
    await tick();
    mock.emit('bestmove e2e4');
    await expect(p2).resolves.toBe('e2e4');
  });
});

describe('enqueue()：佇列中錯誤不卡死後續', () => {
  test('前一個任務丟錯，後續任務仍依序執行', async () => {
    const ctx = sandboxWithXiangqiEngine();
    const order = [];
    const p1 = ctx.enqueue(async () => { order.push('start-1'); throw new Error('boom'); });
    const p2 = ctx.enqueue(async () => { order.push('start-2'); return 'ok-2'; });
    const p3 = ctx.enqueue(async () => { order.push('start-3'); return 'ok-3'; });

    await expect(p1).rejects.toThrow('boom');
    await expect(p2).resolves.toBe('ok-2');
    await expect(p3).resolves.toBe('ok-3');
    expect(order).toEqual(['start-1', 'start-2', 'start-3']);
  });

  test('第二個任務要等第一個任務真正完成才開始（序列化，不並發）', async () => {
    const ctx = sandboxWithXiangqiEngine();
    let resolveFirst;
    const started = [];
    const p1 = ctx.enqueue(() => new Promise((resolve) => {
      started.push(1);
      resolveFirst = resolve;
    }));
    const p2 = ctx.enqueue(() => { started.push(2); return 'done'; });

    await tick();
    expect(started).toEqual([1]); // 第二個任務尚未開始

    resolveFirst();
    await p1;
    await tick();
    expect(started).toEqual([1, 2]);
    await expect(p2).resolves.toBe('done');
  });
});

describe('hint() 著法解析', () => {
  test('一般手：from/to 為座標字串，isDrop=false', async () => {
    const ctx = sandboxWithXiangqiEngine();
    const mock = createMockStockfish();
    ctx.Stockfish = mock.factory;

    const { promise } = ctx.hint({ fen: 'FEN_F', variant: 'xiangqi', movetime: 100 });
    await tick();
    mock.emit('bestmove h2e2');
    const result = await promise;
    expect(result).toEqual({ move: 'h2e2', from: 'h2', to: 'e2', isDrop: false });
  });

  test('象棋 rank 10 三字元 square：b3b10 與 b10c8 不可用固定 slice 拆解', async () => {
    const ctx = sandboxWithXiangqiEngine();
    const mock = createMockStockfish();
    ctx.Stockfish = mock.factory;

    const { promise: p1 } = ctx.hint({ fen: 'FEN_R10A', variant: 'xiangqi', movetime: 100 });
    await tick();
    mock.emit('bestmove b3b10'); // 炮打馬：目的格在 rank 10（3 字元 square）
    expect(await p1).toEqual({ move: 'b3b10', from: 'b3', to: 'b10', isDrop: false });

    const { promise: p2 } = ctx.hint({ fen: 'FEN_R10B', variant: 'xiangqi', movetime: 100 });
    await tick();
    mock.emit('bestmove b10c8'); // 起點在 rank 10（整串 5 字元）
    expect(await p2).toEqual({ move: 'b10c8', from: 'b10', to: 'c8', isDrop: false });
  });

  test('西洋棋升變（e7e8q）：尾碼不影響 from/to 拆解', async () => {
    const ctx = sandboxWithXiangqiEngine();
    const mock = createMockStockfish();
    ctx.Stockfish = mock.factory;

    const { promise } = ctx.hint({ fen: 'FEN_PROMO', variant: 'chess', movetime: 100 });
    await tick();
    mock.emit('bestmove e7e8q');
    expect(await promise).toEqual({ move: 'e7e8q', from: 'e7', to: 'e8', isDrop: false });
  });

  test('將棋打入（如 P@5e）：isDrop=true、from=null、move 帶原始字串，to 正規化為專案座標慣例（字母+數字）', async () => {
    const ctx = sandboxWithXiangqiEngine();
    const mock = createMockStockfish();
    ctx.Stockfish = mock.factory;

    const { promise } = ctx.hint({ fen: 'FEN_G', variant: 'shogi', movetime: 100 });
    await tick();
    mock.emit('bestmove P@5e');
    const result = await promise;
    // 引擎回傳的打入著法是「數字+字母」序（5e），但 shogi-game.js 的 squareToRC() 期望
    // 專案唯一座標慣例「字母+數字」（e5，見 shogi-game.js 開頭「記法三型」註解）；
    // splitHintMove 需正規化，否則 hint 高亮會因 col=-1/row=NaN 而顯示不出來。
    expect(result).toEqual({ move: 'P@5e', from: null, to: 'e5', isDrop: true });
  });

  test('將棋打入若引擎已用「字母+數字」序（如 P@e5）回傳，維持原樣不誤轉', async () => {
    const ctx = sandboxWithXiangqiEngine();
    const mock = createMockStockfish();
    ctx.Stockfish = mock.factory;

    const { promise } = ctx.hint({ fen: 'FEN_H', variant: 'shogi', movetime: 100 });
    await tick();
    mock.emit('bestmove P@e5');
    const result = await promise;
    expect(result).toEqual({ move: 'P@e5', from: null, to: 'e5', isDrop: true });
  });
});
