# 首頁選棋卡片改版：水墨圖直式卡片 + 露邊可捲動卡片列

日期：2026-07-03
狀態：設計已確認，待寫實作計畫

## 目標

把首頁選棋畫面從「純文字卡片格狀排列（grid）」改為「直式卡片、露邊可左右捲動的卡片列」，每張卡加水墨渲染插畫背景圖，讓「選棋」從清單感升級為畫廊感，與全站 water-ink 美術風一致。

## 背景與現況

- 首頁由 `main.js` 的 `renderHome()` 動態產生：`#homeMenu` 內每項一顆 `.home-card`（`<button>`），含 `.home-card-title`（金字棋名）、`.home-card-desc`（兩行對句，於首個逗號/頓號斷行）、可選 `.home-card-hint`（印章色提示，如「已解 12 題」「有對局可續弈」）。
- 樣式在 `style.css`：`.home-menu` 為 grid（桌機 4 欄、≤700px 2 欄、≤430px 1 欄）；`.home-card` 為墨色卡片底、min-height 120px、hover 上浮金框。
- `HOME_ITEMS` 陣列定義 8 個項目（play / tsumego / xiangqi / xqpuzzle / shogi / gomoku / othello / chess），其中 5 項標 `webOnly: true`，iOS build（`__IOS_STORE__`）以 `.filter()` 過濾為 3 項（play / gomoku / othello）。見 `docs`／記憶 `ios-gpl-slim-build`。

## 已確認的設計決策

| 項目 | 決定 |
|---|---|
| 切換形式 | 露邊可捲動卡片列（非整頁單張輪播）。手機露約 1.3 張，桌機露 3–4 張放大版，吸附對齊 |
| 圖風格 | 水墨渲染插畫（宣紙底、大量留白、無人物、無 Emoji） |
| 卡片文字 | 保留現狀：標題 + 對句 + 提示，疊在圖底漸層遮罩上 |
| 實作路線 | 純 CSS scroll-snap（桌機補左右箭頭鈕），不用 JS 自訂輪播 |
| 範圍 | 只動首頁選棋卡片；不改各棋種內頁與 mode header |

## 設計細節

### 1. 版面與互動

- `.home-menu`：由 grid 改為橫向 flex + `overflow-x: auto` + `scroll-snap-type: x mandatory`；卡片 `scroll-snap-align: center`（或 start）。
- 露邊：容器左右保留 padding，讓下一張露出一角，暗示可滑。手機一次露約 1.3 張，桌機卡片放大、一次露 3–4 張。
- 桌機左右各一顆低調箭頭鈕，`@media (hover: hover)` 才顯示；點擊以「一張卡寬」為單位 `scrollBy`；捲到端點時該側箭頭淡出/停用。
- 卡片數少（iOS 3 張）在桌機寬度塞得下時，靠 `justify-content` 自然置中、不出現滾動；手機仍可滑。同一套 CSS 涵蓋 8 張與 3 張兩情境，無需平台分支。
- 隱藏原生捲軸（美觀），但保留鍵盤與滑鼠可捲。

### 2. 卡片視覺

- 直式，比例 `aspect-ratio: 3 / 4`。
- 圖層鋪滿 `object-fit: cover`（或 `background-size: cover`）。
- 底部遮罩：`linear-gradient(to top, rgba(<墨>,0.82), transparent 55%)` 壓住文字區，確保標題/對句/提示可讀。
- 文字沿用現有色階（金字標題、對句 dim、提示印章色），必要時因疊在圖上而略提高對比/加淡陰影。
- 沿用現有 hover（上浮 + 金框），圖層再加極輕放大 `scale(1.03)` 增動感；`prefers-reduced-motion` 時關閉吸附平滑與圖片放大。

### 3. 水墨圖生成（gpt-image-bridge skill）

- 8 張直式水墨插畫，統一 prompt 基底：宣紙質感底、大量留白、水墨暈染、無人物、無文字、無 Emoji、直式構圖。各棋一意象：
  - 圍棋對弈：墨暈棋盤一角、黑白子散落
  - 死活練習：局部棋形、生死一子
  - 象棋對弈：楚河漢界、朱墨對峙
  - 象棋殘局：殘破古譜、一子殺機
  - 日本將棋：和風木駒、淡墨
  - 五子棋：連珠斜陣
  - 黑白棋：黑白翻覆、一夾乾坤
  - 西洋棋：城堡對壘
- 生成後降尺寸並轉 webp（約 800px 寬），存 `public/img/cards/<id>.webp`。
- iOS 只用 go/gomoku/othello 3 張；`scripts/strip-ios-assets.mjs` 加入移除另 5 張 web-only 卡片圖，保持精簡包乾淨（並納入既有的合規 grep 之外的清單）。

### 4. 程式改動

- `HOME_ITEMS`：每項新增 `img` 欄位（對應 `img/cards/<id>.webp`）。
- `renderHome()`：卡片 DOM 加底層圖層（`.home-card-bg`，裝飾性）+ 遮罩層，文字層疊於其上。既有的點擊導頁、`homeItemHint()` 邏輯不動。
- `style.css`：改寫 `.home-menu`（scroll-snap 容器）與 `.home-card`（直式 + 圖層 + 遮罩）；新增箭頭鈕樣式與 reduced-motion 分支。

### 5. 無障礙

- 卡片仍為 `<button>`，Tab 順序與鍵盤啟用不變。
- scroll 容器為真實原生滾動，方向鍵/滾輪天然可用。
- 背景圖為裝飾性：用 CSS background 或 `aria-hidden` 的 `<img alt="">`，不進無障礙樹；棋名語意由按鈕文字提供。
- 桌機箭頭鈕加 `aria-label`（如「上一組」「下一組」）。
- 尊重 `prefers-reduced-motion`：關閉平滑吸附與圖片放大。

### 6. PWA / 快取

- 卡片圖走 runtime cache（首次造訪由 `sw.js` fetch handler 自然補上）。
- **不**加入 `sw.js` 的 `PRECACHE_ASSETS`，避免離線安裝變重（沿用現有「預快取只列必定存在的穩定核心路徑」原則）。

## 範圍界線（YAGNI）

- 只重做首頁選棋卡片。
- 不改各棋種內頁、mode header、對弈畫面。
- 不加圓點指示器（8 張棋幫助有限、佔空間）。
- 不引入 JS 輪播函式庫。

## 驗證

- 網頁版：8 張卡片可滑、吸附、桌機箭頭可用、文字在圖上清晰；桌機/平板/手機三斷點皆無破版。
- iOS 版（`npm run build:ios`）：只出現 3 張卡片、對應 3 張圖；`strip-ios-assets.mjs` 移除另 5 張 web-only 卡片圖後仍通過合規驗證。
- `prefers-reduced-motion` 下無不當動畫。
- 既有 jest 測試不受影響（本次為純前端版面/樣式改動）。
