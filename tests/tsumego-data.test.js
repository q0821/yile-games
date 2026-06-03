/**
 * 成品資料回歸測試：用真正的 parseProblem / buildBoardFromProblem 驗證
 * public/tsumego/ 下每一題出貨資料的座標一致性。
 * （資料由 build-tsumego.js 產生；此測試自給自足，不依賴外部題庫。）
 */
const fs = require('fs');
const path = require('path');
const { sandboxWithTsumego } = require('./helpers');

const EMPTY = 0;
const TSUMEGO_DIR = path.join(__dirname, '..', 'public', 'tsumego');

let ctx;
beforeAll(() => {
  ctx = sandboxWithTsumego();
});

function loadIndex() {
  return JSON.parse(fs.readFileSync(path.join(TSUMEGO_DIR, 'index.json'), 'utf8'));
}
function loadLevel(file) {
  return JSON.parse(fs.readFileSync(path.join(TSUMEGO_DIR, file), 'utf8'));
}

describe('tsumego 成品資料', () => {
  test('index.json 含三級且 count 與檔案題數一致', () => {
    const index = loadIndex();
    expect(index.levels.map(l => l.id)).toEqual(['beginner', 'intermediate', 'advanced']);
    for (const lv of index.levels) {
      expect(loadLevel(lv.file)).toHaveLength(lv.count);
    }
  });

  test('每題正解點都在盤內、且落在空交叉點（座標慣例一致）', () => {
    const index = loadIndex();
    for (const lv of index.levels) {
      for (const raw of loadLevel(lv.file)) {
        const problem = ctx.parseProblem(raw);
        const board = ctx.buildBoardFromProblem(problem);
        expect(problem.toPlay === 'B' || problem.toPlay === 'W').toBe(true);
        expect(problem.answers.length).toBeGreaterThan(0);
        for (const a of problem.answers) {
          expect(a.row).toBeGreaterThanOrEqual(0);
          expect(a.row).toBeLessThan(problem.size);
          expect(a.col).toBeGreaterThanOrEqual(0);
          expect(a.col).toBeLessThan(problem.size);
          // 正解一定要能落子（空點）
          expect(board[a.row][a.col]).toBe(EMPTY);
        }
      }
    }
  });
});
