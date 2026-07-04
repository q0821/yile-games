// sgf-export.js — 把 SGF 字串交到使用者手上。
//
// iOS WKWebView（Capacitor）不支援 blob + <a download> 觸發下載，點了會靜默失敗，
// 所以優先走 Web Share Level 2（navigator.share({ files })，iOS 會開系統分享面板，
// 可存到「檔案」或傳給其他 app）；不支援時才 fallback 回瀏覽器下載。
//
// mime 用 text/plain：Web Share 對可分享的檔案型別有白名單，自訂型別
// （application/x-go-sgf）在部分平台會被 canShare 拒絕；SGF 應用皆認副檔名。

function domDownload(sgf, filename) {
  const blob = new Blob([sgf], { type: 'application/x-go-sgf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * 分享或下載 SGF。回傳 'shared' | 'cancelled' | 'downloaded'。
 * deps.nav / deps.download 可注入（測試用）；預設用全域 navigator 與 DOM 下載。
 */
export async function shareOrDownloadSgf(sgf, filename, deps = {}) {
  const nav = 'nav' in deps ? deps.nav : (typeof navigator !== 'undefined' ? navigator : undefined);
  const download = deps.download || domDownload;

  if (nav && typeof nav.canShare === 'function' && typeof nav.share === 'function') {
    const file = new File([sgf], filename, { type: 'text/plain' });
    if (nav.canShare({ files: [file] })) {
      try {
        await nav.share({ files: [file] });
        return 'shared';
      } catch (err) {
        if (err && err.name === 'AbortError') return 'cancelled';
        // 分享面板開失敗（非使用者取消）→ 退回下載
      }
    }
  }
  download(sgf, filename);
  return 'downloaded';
}
