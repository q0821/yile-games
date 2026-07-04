// sgf-export：iOS WKWebView 不支援 blob+<a download> 下載（點了靜默失敗），
// 改為 Web Share（files）優先、blob 下載 fallback。deps 可注入以便測試。
const { sandboxWithSgfExport } = require('./helpers');

let shareOrDownloadSgf;
beforeAll(() => {
  const ctx = sandboxWithSgfExport();
  shareOrDownloadSgf = ctx.shareOrDownloadSgf;
});

const SGF = '(;GM[1]FF[4]SZ[9]KM[7.5];B[aa])';

function makeNav({ canShare = () => true, share = async () => {} } = {}) {
  const calls = { share: [] };
  return {
    nav: {
      canShare,
      share: async (data) => { calls.share.push(data); return share(data); },
    },
    calls,
  };
}

test('支援 files 分享時走 share，回傳 shared', async () => {
  const { nav, calls } = makeNav();
  const download = jest.fn();
  const result = await shareOrDownloadSgf(SGF, 'game.sgf', { nav, download });
  expect(result).toBe('shared');
  expect(download).not.toHaveBeenCalled();
  expect(calls.share).toHaveLength(1);
  const files = calls.share[0].files;
  expect(files).toHaveLength(1);
  expect(files[0].name).toBe('game.sgf');
});

test('canShare 回 false 時 fallback 下載，回傳 downloaded', async () => {
  const { nav } = makeNav({ canShare: () => false });
  const download = jest.fn();
  const result = await shareOrDownloadSgf(SGF, 'game.sgf', { nav, download });
  expect(result).toBe('downloaded');
  expect(download).toHaveBeenCalledWith(SGF, 'game.sgf');
});

test('使用者取消分享（AbortError）不 fallback，回傳 cancelled', async () => {
  const abort = new Error('cancel');
  abort.name = 'AbortError';
  const { nav } = makeNav({ share: async () => { throw abort; } });
  const download = jest.fn();
  const result = await shareOrDownloadSgf(SGF, 'game.sgf', { nav, download });
  expect(result).toBe('cancelled');
  expect(download).not.toHaveBeenCalled();
});

test('share 失敗（非取消）時 fallback 下載', async () => {
  const { nav } = makeNav({ share: async () => { throw new Error('boom'); } });
  const download = jest.fn();
  const result = await shareOrDownloadSgf(SGF, 'game.sgf', { nav, download });
  expect(result).toBe('downloaded');
  expect(download).toHaveBeenCalled();
});

test('無 navigator（或無 share 能力）時直接下載', async () => {
  const download = jest.fn();
  const result = await shareOrDownloadSgf(SGF, 'game.sgf', { nav: undefined, download });
  expect(result).toBe('downloaded');
  expect(download).toHaveBeenCalled();
});
