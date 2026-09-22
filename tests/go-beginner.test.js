const { sandboxWithGameState } = require('./helpers');
const createSandbox = () => ({ localRequire: sandboxWithGameState().localRequire });

function setup() {
  const { localRequire } = createSandbox();
  return { ...localRequire('./rules.js'), ...localRequire('./go-beginner.js') };
}

test('陪練不下劫點、不改動原盤面', () => {
  const r = setup();
  const board = r.createBoard(5);
  const state = { board, size: 5, currentPlayer: 2, koPoint: [2, 2], moveHistory: [] };
  for (const random of [0, 0.25, 0.8, 0.999]) {
    const m = r.beginnerMove(state, () => random);
    expect(m.pass).not.toBe(true);
    expect(r.tryPlaceStone(board, 5, m.x, m.y, 2, state.koPoint).valid).toBe(true);
  }
  expect(board.flat().every(v => v === 0)).toBe(true);
});

test('沒有可用空點與對手收手後都能虛手', () => {
  const r = setup();
  expect(r.beginnerMove({ board: Array.from({ length: 5 }, () => Array(5).fill(2)), size: 5, currentPlayer: 2, moveHistory: [] })).toEqual({ pass: true });
  expect(r.beginnerMove({ board: r.createBoard(5), size: 5, currentPlayer: 2, moveHistory: [{ pass: true }] })).toEqual({ pass: true });
});

test('基本戰術分支能吃到只剩一口氣的棋', () => {
  const r = setup();
  const board = r.createBoard(5);
  board[0][0] = 1;
  board[1][0] = 2;
  const move = r.beginnerMove({ board, size: 5, currentPlayer: 2, moveHistory: [] }, () => 0);
  expect(move).toEqual({ x: 0, y: 1 });
});

test('陪練不填四周都是己方棋子的空點', () => {
  const r = setup();
  const board = r.createBoard(5);
  for (const [x,y] of [[1,2],[2,1],[2,3],[3,2]]) board[x][y] = 2;
  for (let i = 0; i < 100; i++) {
    expect(r.beginnerMove({ board, size: 5, currentPlayer: 2, moveHistory: [] }, () => i / 100)).not.toEqual({ x: 2, y: 2 });
  }
});

test('陪練模式跨存檔保留，舊存檔預設一般模式', () => {
  const { localRequire } = createSandbox();
  const s = localRequire('./game-state.js');
  s.startGame({ size: 9, beginnerMode: true });
  const snapshot = s.getSnapshot();
  expect(snapshot.beginnerMode).toBe(true);
  s.restoreSnapshot(snapshot);
  expect(s.getState().beginnerMode).toBe(true);
  delete snapshot.beginnerMode;
  s.restoreSnapshot(snapshot);
  expect(s.getState().beginnerMode).toBe(false);
});
