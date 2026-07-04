// canvas-dpr 特性測試：HiDPI 設定的核心不變量（內部尺寸 = CSS × dpr、dpr 上限 2、
// offscreen ctx 預先 scale）。這些不變量壞掉的症狀是「棋盤模糊」或「盤面縮到左上角」。
const { sandboxWithCanvasDpr } = require('./helpers');

let ctx;
beforeAll(() => {
  ctx = sandboxWithCanvasDpr();
});

function fakeCanvas() {
  return { style: {}, width: 0, height: 0 };
}

describe('hidpiScale', () => {
  test('一般螢幕回 1', () => {
    ctx.devicePixelRatio = 1;
    expect(ctx.hidpiScale()).toBe(1);
  });
  test('3x 螢幕封頂在 2（省記憶體/功耗，與 chess/shogi UI 既有做法一致）', () => {
    ctx.devicePixelRatio = 3;
    expect(ctx.hidpiScale()).toBe(2);
  });
  test('devicePixelRatio 缺值時回 1', () => {
    ctx.devicePixelRatio = undefined;
    expect(ctx.hidpiScale()).toBe(1);
  });
});

describe('setupHiDPICanvas', () => {
  test('內部解析度 × dpr、CSS 尺寸維持邏輯像素', () => {
    ctx.devicePixelRatio = 2;
    const c = fakeCanvas();
    const dpr = ctx.setupHiDPICanvas(c, 590, 590);
    expect(dpr).toBe(2);
    expect(c.width).toBe(1180);
    expect(c.height).toBe(1180);
    expect(c.style.width).toBe('590px');
    expect(c.style.height).toBe('590px');
  });
  test('非整數乘積四捨五入', () => {
    ctx.devicePixelRatio = 1.5;
    const c = fakeCanvas();
    ctx.setupHiDPICanvas(c, 333, 333);
    expect(c.width).toBe(Math.round(333 * 1.5));
  });
});

describe('makeHiDPIOffscreen', () => {
  test('offscreen 為裝置解析度且 ctx 已預先 scale(dpr)（背景快取以 CSS 座標作畫的前提）', () => {
    ctx.devicePixelRatio = 2;
    const scales = [];
    ctx.document = {
      createElement: () => ({
        style: {},
        getContext: () => ({ scale: (a, b) => scales.push([a, b]) }),
      }),
    };
    const { off } = ctx.makeHiDPIOffscreen(400, 300);
    expect(off.width).toBe(800);
    expect(off.height).toBe(600);
    expect(scales).toEqual([[2, 2]]);
  });
});
