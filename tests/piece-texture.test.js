// piece-texture 測試：posHash01 的確定性雜湊、engraveText 的陰刻三層畫法與 NaN 防護、
// paintPieceGrain（棋面木紋）的確定性——同 seed 兩次呼叫要產生完全相同的 ctx 呼叫序列，
// 不同 seed 則要不同（禁止 Math.random 混進來）。
//
// piece-texture.js 是無 import 的純函式模組，這裡不比照 helpers.js 的 sandboxWithXxx
// （那組是給有互相 import 的模組共用的 vm loader），改用最小化的本地 loader：直接把來源檔
// 用 babel 轉成 CJS 後在本檔 require，避免動到既有的 tests/helpers.js。
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const babel = require('@babel/core');

function loadPieceTexture() {
  const filePath = path.join(__dirname, '..', 'piece-texture.js');
  const code = fs.readFileSync(filePath, 'utf8');
  const { code: cjs } = babel.transformSync(code, {
    presets: [['@babel/preset-env', { targets: { node: 'current' }, modules: 'commonjs' }]],
    babelrc: false,
    configFile: false,
    filename: filePath,
  });
  const mod = { exports: {} };
  const context = vm.createContext({ module: mod, exports: mod.exports, require, Math });
  vm.runInContext(cjs, context, { filename: filePath });
  return mod.exports;
}

const { posHash01, engraveText, paintPieceGrain } = loadPieceTexture();

/** 記錄 ctx 方法呼叫與屬性賦值的簡易 mock（順序即呼叫序列，供確定性比對）。 */
function createMockCtx() {
  const log = [];
  const methods = [
    'save', 'restore', 'beginPath', 'moveTo', 'lineTo', 'quadraticCurveTo',
    'arc', 'stroke', 'fill', 'fillText', 'fillRect', 'clip',
  ];
  const target = {};
  for (const m of methods) {
    target[m] = (...args) => log.push({ op: m, args });
  }
  const ctx = new Proxy(target, {
    set(t, prop, value) {
      log.push({ op: 'set', prop, value });
      t[prop] = value;
      return true;
    },
  });
  return { ctx, log };
}

describe('posHash01', () => {
  test('同座標多次呼叫結果一致（確定性）', () => {
    expect(posHash01(3, 7)).toBe(posHash01(3, 7));
    expect(posHash01(120.5, -40.25)).toBe(posHash01(120.5, -40.25));
  });

  test('值域落在 [0,1)', () => {
    const samples = [[0, 0], [1, 1], [12.9898, 78.233], [-50, 300], [999, -999]];
    for (const [x, y] of samples) {
      const v = posHash01(x, y);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  test('不同座標通常給出不同值', () => {
    expect(posHash01(1, 1)).not.toBe(posHash01(2, 2));
  });
});

describe('engraveText', () => {
  test('正常輸入畫 3 次 fillText（亮邊/刻痕/主字）', () => {
    const { ctx, log } = createMockCtx();
    engraveText(ctx, '將', 50, 60, 24, { ink: '#222', font: 'serif' });
    const fillTexts = log.filter((e) => e.op === 'fillText');
    expect(fillTexts).toHaveLength(3);
    // 主字置中（無偏移）、亮邊向下、刻痕向上
    expect(fillTexts[0].args).toEqual(['將', 50, 60 + 24 * 0.045]);
    expect(fillTexts[1].args).toEqual(['將', 50, 60 - 24 * 0.03]);
    expect(fillTexts[2].args).toEqual(['將', 50, 60]);
  });

  test('save/restore 成對，且主字用 opts.ink', () => {
    const { ctx, log } = createMockCtx();
    engraveText(ctx, '帥', 0, 0, 20, { ink: 'rgba(1,2,3,1)', font: 'serif' });
    expect(log.filter((e) => e.op === 'save')).toHaveLength(1);
    expect(log.filter((e) => e.op === 'restore')).toHaveLength(1);
    const fillStyleSets = log.filter((e) => e.op === 'set' && e.prop === 'fillStyle');
    expect(fillStyleSets[fillStyleSets.length - 1].value).toBe('rgba(1,2,3,1)');
  });

  test.each([
    [NaN, 10, 24], [10, NaN, 24], [10, 10, NaN], [10, 10, 0], [10, 10, -5],
  ])('非有限輸入 (%p,%p,%p) 不畫任何東西', (x, y, fontPx) => {
    const { ctx, log } = createMockCtx();
    engraveText(ctx, '兵', x, y, fontPx, { ink: '#000', font: 'serif' });
    expect(log).toHaveLength(0);
  });
});

describe('paintPieceGrain', () => {
  test('ring：同 seed 兩次呼叫產生完全相同的 ctx 呼叫序列', () => {
    const a = createMockCtx();
    const b = createMockCtx();
    paintPieceGrain(a.ctx, 'ring', 0.37, { x: 100, y: 100, r: 20 });
    paintPieceGrain(b.ctx, 'ring', 0.37, { x: 100, y: 100, r: 20 });
    expect(a.log).toEqual(b.log);
    expect(a.log.length).toBeGreaterThan(0);
  });

  test('ring：不同 seed 產生不同序列', () => {
    const a = createMockCtx();
    const b = createMockCtx();
    paintPieceGrain(a.ctx, 'ring', 0.1, { x: 100, y: 100, r: 20 });
    paintPieceGrain(b.ctx, 'ring', 0.9, { x: 100, y: 100, r: 20 });
    expect(a.log).not.toEqual(b.log);
  });

  test('straight：同 seed 兩次呼叫產生完全相同的 ctx 呼叫序列', () => {
    const a = createMockCtx();
    const b = createMockCtx();
    paintPieceGrain(a.ctx, 'straight', 0.62, { w: 12, h: 14 });
    paintPieceGrain(b.ctx, 'straight', 0.62, { w: 12, h: 14 });
    expect(a.log).toEqual(b.log);
    expect(a.log.length).toBeGreaterThan(0);
  });

  test('straight：不同 seed 產生不同序列', () => {
    const a = createMockCtx();
    const b = createMockCtx();
    paintPieceGrain(a.ctx, 'straight', 0.2, { w: 12, h: 14 });
    paintPieceGrain(b.ctx, 'straight', 0.8, { w: 12, h: 14 });
    expect(a.log).not.toEqual(b.log);
  });

  test('未知 kind 或缺 dims 不畫任何東西（僅 save/restore）', () => {
    const { ctx, log } = createMockCtx();
    paintPieceGrain(ctx, 'unknown', 0.5, { x: 1, y: 1, r: 1 });
    expect(log).toEqual([{ op: 'save', args: [] }, { op: 'restore', args: [] }]);
  });
});
