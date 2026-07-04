// sgf.js buildSGF 特性測試（既有行為固定下來，防匯出格式回歸）。
// 座標慣例：SGF 第一字母 = column(y)、第二字母 = row(x)；player 1=B、2=W。
const { sandboxWithSgf } = require('./helpers');

let buildSGF;
beforeAll(() => {
  buildSGF = sandboxWithSgf().buildSGF;
});

test('基本對局：header 帶棋盤大小與貼目，黑白交替、座標軸序正確', () => {
  const moves = [
    { x: 2, y: 3, player: 1 }, // 黑：row2 col3 → dc
    { x: 4, y: 5, player: 2 }, // 白：row4 col5 → fe
  ];
  expect(buildSGF(moves, 19, 7.5)).toBe('(;GM[1]FF[4]SZ[19]KM[7.5];B[dc];W[fe])');
});

test('虛手輸出為空座標', () => {
  const moves = [
    { x: 0, y: 0, player: 1 },
    { pass: true, player: 2 },
  ];
  expect(buildSGF(moves, 9, 6.5)).toBe('(;GM[1]FF[4]SZ[9]KM[6.5];B[aa];W[])');
});

test('讓子局輸出 HA[n]AB[...] 前置（白先）', () => {
  const handicap = [[3, 3], [15, 15]]; // [row, col]
  const moves = [{ x: 2, y: 16, player: 2 }];
  expect(buildSGF(moves, 19, 0.5, handicap))
    .toBe('(;GM[1]FF[4]SZ[19]KM[0.5]HA[2]AB[dd][pp];W[qc])');
});

test('無讓子（空陣列）不輸出 HA/AB', () => {
  expect(buildSGF([], 13, 7.5, [])).toBe('(;GM[1]FF[4]SZ[13]KM[7.5])');
});
