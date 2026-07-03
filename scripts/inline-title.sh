#!/usr/bin/env bash
# 將 public/img/title-ink.webp 內嵌成 base64，更新 style.css 末尾的 h1.brush-title 規則。
# 用途：換了毛筆標題圖後重跑此腳本。
set -euo pipefail
cd "$(dirname "$0")/.."
IMG=public/img/title-ink.webp
[ -f "$IMG" ] || { echo "找不到 $IMG"; exit 1; }
# base64：macOS(BSD) 不支援 GNU 的 -w0；用 stdin + tr 去換行，跨平台皆單行輸出
b64=$(base64 < "$IMG" | tr -d '\n')
# 砍掉舊的內嵌區塊（從標記行到檔尾），再重新附加
python3 - "$b64" <<'PY'
import sys,re
b64=sys.argv[1]
css=open('style.css',encoding='utf-8').read()
marker='/* ===== 毛筆標題（base64 內嵌） ====='
i=css.find(marker)
if i!=-1: css=css[:i].rstrip()+'\n'
block=f'''
/* ===== 毛筆標題（base64 內嵌） =====
   外部圖片請求曾被 CDN 快取成 HTML 導致標題消失；data URI 隨 style.css 送達、
   不發額外請求、CDN 碰不到，標題永遠在且是毛筆字。更新圖後重跑 scripts/inline-title.sh。 */
h1.brush-title {{
  box-sizing: content-box;              /* width/aspect 定義內容框，padding 再往下推整張圖 */
  width: clamp(160px, 42vw, 240px);
  aspect-ratio: 1327 / 816;
  height: auto;
  padding-top: var(--safe-top);         /* 閃開動態島/瀏海 */
  text-indent: -9999px;
  overflow: hidden;
  white-space: nowrap;
  text-shadow: none;
  background: url('data:image/webp;base64,{b64}') center/contain no-repeat;
  background-origin: content-box;        /* 圖只畫在內容框（padding 之下），不侵入安全區 */
}}
h1.brush-title::after {{ display: none; }}
'''
open('style.css','w',encoding='utf-8').write(css+block)
print('style.css updated')
PY
