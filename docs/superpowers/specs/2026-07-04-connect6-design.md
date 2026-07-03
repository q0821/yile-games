# 連六棋（Connect6）設計文件

- 日期：2026-07-04
- 狀態：已與使用者逐段確認，待實作
- 背景：弈樂（gogame）新增棋種，用現成圍棋棋具（19 路盤＋黑白子）可玩、規則/AI 全自寫、零第三方 GPL，與 iOS 精簡版方向相容（填補拔掉 5 種 GPL 棋後的空缺）。

## 1. 目標與範圍

新增「連六棋」棋種到弈樂，Web / Android / iOS 三版皆可玩。

**V1 範圍**：
- 標準連六棋規則（19 路盤、每手兩子、先連六者勝）。
- 對局模式：人機（pvc）＋ 雙人同機（pvp）。
- AI：貪婪雙落子（B1），沿用五子棋 1–3 級難度。
- 悔棋：以整回合為單位。
- 回合內修正：點擊即落子，第二子未落前可點回第一子收回。
- 封面圖：水墨風 800×1200 webp。

**V1 明確不做**：
- AI 建議（提示下一手）。
- 覆盤（review）。
- AI 的完整成對搜尋 / 雙威脅窮舉防守（留給 V2）。

## 2. 規則

- **盤面**：19×19 交叉點（同圍棋盤）。
- **回合結構（標準）**：黑方整局第一個回合只下 **1 子**；之後雙方每回合各下 **2 子**。此「每手兩子」自然抵銷先行優勢，不需五子棋式禁手。
- **勝負**：任一方先在橫、直、兩斜任一方向連成 **6 子（含以上，長連/overline 也算贏）** 即勝。
- **和局**：棋盤下滿仍無六連則和。
- **落子限制**：只能下在空點，不可提子、無自殺規則（單純佔點連子遊戲）。

## 3. 架構與模組

沿用弈樂「每種棋自成一組 `X-mode/rules/ui/ai.js`」慣例（取向 A1：複製骨架），五子棋既有程式碼**完全不動**，僅 import 其純函式重用。

### 3.1 新增模組

| 檔案 | 職責 | 重用 |
|------|------|------|
| `connect6-rules.js` | `SIZE=19`、`WIN_LEN=6`；`checkWin` 判「≥6 連」 | `newBoard`/`canPlace`/`isBoardFull` import 自 `gomoku-rules.js`（已吃 size 參數） |
| `connect6-ai.js` | `bestTurn(board,size,player,level,quota)` → `[m1,m2]`（quota=1 回 `[m1]`） | import `dirCount`/`candidates` 自 `gomoku-ai.js`；自寫 6 門檻的 `patternValue`/`placeScore` |
| `connect6-mode.js` | 回合狀態機、落子/收回、悔棋、pvc/pvp、AI 驅動、螢幕生命週期 | 比照 `gomoku-mode.js` 結構 |
| `connect6-ui.js` | 19 路盤渲染、hover、「本回合還剩 N 子」提示、結束連線 highlight | 比照 `gomoku-ui.js` |

### 3.2 修改的檔案

- **`main.js`**：
  - 註冊表新增一列（**無 `webOnly`**）：
    `{ id:'connect6', title:'連六棋', desc:'雙落連橫，六子成龍', hash:'#connect6', img:'img/cards/connect6.webp' }`
  - `import { enterConnect6Mode } from './connect6-mode.js'`。
  - 螢幕切換：`connect6Screen` 的 display 切換（比照 `gomokuScreen`）。
  - hash 路由：`#connect6` → 進入連六棋模式。
- **`index.html`**：新增 `connect6Screen` div（clone `gomokuScreen` 結構，id 前綴改 `connect6`）。
- **`public/img/cards/connect6.webp`**：封面圖（§7）。
- **iOS strip**：不需改。`strip-ios-assets.mjs` 只移除 engine/xiangqi/tsumego，連六棋自寫零 GPL、不掛 `webOnly`，三版自動納入。
- **cache-bust**：改動 CSS/JS 後推進 `public/version.json` 與 `public/sw.js` 版號，確保使用者抓到新版。

## 4. 回合狀態機與資料流（`connect6-mode.js`）

### 4.1 狀態

```
board(19×19), currentPlayer, quota(1 或 2), stonesPlaced(0..quota),
pendingStone({r,c}|null 本回合可收回的第一子),
history(每回合快照堆疊), gameMode('pvc'|'pvp'), playerColor, aiLevel, gameOver
```

### 4.2 玩家於自己回合點擊 (r,c)

1. 若 `(r,c)` 正是 `pendingStone` → 收回（移子、`stonesPlaced--`、`pendingStone=null`），結束。
2. 若該點不可下（非空點）→ 忽略。
3. 落子、`stonesPlaced++`；每次落子後都 `checkWin`（第一子就可能補成六）。
4. 若 `stonesPlaced < quota` → 記 `pendingStone=(r,c)`，等第二子（UI 提示「還剩 N 子」）。
5. 若 `stonesPlaced === quota` → **提交回合**：推快照進 `history`、清 `pendingStone`、換手、`quota` 重設為 2、`stonesPlaced=0`；若 pvc 且輪到 AI → 觸發 AI 回合。

### 4.3 quota 規則

整局第一個回合（黑方）`quota=1`，其餘一律 `2`。判定：`history.length === 0 && currentPlayer === BLACK` → quota=1。

### 4.4 回合 guard（防呆）

pvc 模式只有「輪到玩家」才允許手動落子（記取圍棋出錯時點棋盤幫 AI 下子的教訓，比照 `gomoku-mode.js:169`）。AI 忙碌（`aiBusy`）時忽略點擊。

### 4.5 悔棋（整回合）

只在「回合之間」可按（回合進行中改第一子用 4.2 步驟 1 的收回）。history 每個 entry 記「本回合放了哪幾點（1–2 個）＋ 是誰下的」。
- **pvp**：pop 一個回合快照，清掉那 1–2 顆子。
- **pvc**：pop 兩個回合快照（AI 回合 + 玩家回合），回到「輪玩家下」的乾淨局面。若 history 不足兩回合（例如玩家執白、AI 先手只有一回合），則 pop 到能讓玩家落子的最近狀態。

## 5. AI（V1，B1 貪婪雙落子）

`bestTurn(board, size, player, level, quota)`：

```
選第 1 子：
  a. 致勝點：存在某空點放 player 後成 ≥6 連 → 直接選它
  b. 必擋點：對手若下一手能成 6 連（已有活五，或開放活四/雙威脅）→ 選最該擋的點
  c. 否則：placeScore（attack + defend）最高點
放第 1 子到工作副本
選第 2 子：更新後盤面重算 a→b→c，取最佳且 ≠ 第 1 子
回傳 [m1, m2]（quota=1 時只回 [m1]）
```

**重用**：`dirCount`、`candidates` import 自 `gomoku-ai.js`；`patternValue`/`placeScore` 自寫，致勝門檻 5→6。

**難度分級（沿用 aiLevel 1–3）**：
- Lv1 易：候選點少、只做 a/c、加隨機擾動。
- Lv2 中：完整 a→b→c。
- Lv3 難：a→b→c ＋ 對手一手回應預看（比照 `gomoku-ai.js` level 預看）。

**守法校正**：連六棋對手一次落兩子，`defend` 權重對「6 門檻下的開放活四型態」給高分，讓貪婪選點傾向防守；V1 用啟發式近似，不保證擋掉所有雙威脅（V2 成對搜尋才根治）。

## 6. UI（`connect6-ui.js` + `connect6Screen`）

- 19 路棋盤（格點間距比五子棋 15 路縮小，沿用棋盤繪製邏輯改 SIZE）。
- 頂部 mode-header：返回鍵、靜音鍵（現有快捷靜音會自動掃到，`main.js:1201`）、回合徽章。
- **回合進度提示**：回合徽章旁顯示「黑方 · 還剩 1 子」/「白方 · 還剩 2 子」——連六棋 UI 與五子棋最大差別。
- 落子後第一子以正常實心顯示（可點它收回），不做半透明暗放。
- hover 預覽落點；`pendingStone` 上給「收回」提示。
- 底部控制列：悔棋鍵、新局鍵。
- 設定面板（比照五子棋）：對局模式（人機/雙人）、AI 難度（易/中/難）、玩家執黑或執白（pvc 時）。
- 結束卡片（`board-end-card`）：顯示勝方與連成的六子連線 highlight。

## 7. 封面圖

- 工具：`gpt-image-bridge` skill。
- 尺寸：**800×1200** webp（與現有卡片一致），直式。
- 風格：宣紙暖色底、水墨質地、留白，與 `gomoku.webp`/`play.webp` 同調。
- 主體：19 路木紋棋盤俯視，黑白子交錯，一條黑子連成六顆為視覺焦點，旁有白子佈防。
- 亞洲美學、無文字、無 emoji、無邊框浮水印。
- 產出 → 轉 webp（60–90k）→ `public/img/cards/connect6.webp`。
- 需使用者確認滿意；不理想則重生 prompt。封面獨立於棋邏輯，最後落檔即可（卡片自動渲染）。

## 8. 測試（Jest，`tests/connect6.test.js`）

**規則層**：
- `checkWin` 偵測恰好 6 連判勝；7 連（長連）也判勝；只有 5 連不誤判；橫/直/兩斜都測。

**回合狀態機**：
- 整局第一回合黑方 quota=1；之後 quota=2。
- 放第一子後點同一點可收回。
- 放滿 quota 才換手。

**悔棋**：
- pvp pop 一回合、正確清 1–2 子。
- pvc pop 兩回合，回到輪玩家下。

**AI（`bestTurn`）**：
- 一般回合回 2 子、首回合回 1 子。
- 存在致勝點時選它（成 6）。
- 對手已成活五、下一手能六時 AI 會擋。

**不在 V1 測試範圍**：雙威脅完整防守、AI 建議、覆盤。

## 9. 驗收標準

- 首頁出現「連六棋」卡片，點入可進入 19 路盤。
- 黑方首手下 1 子、之後每手 2 子，先連六者勝，能正常判勝/判和。
- pvc 對局中 AI 會下兩子、會取勝、會擋明顯威脅。
- 悔棋依整回合正確回退。
- Jest 測試全綠。
- iOS build（`--mode ios`）不誤刪連六棋資產、連六棋卡片仍在。
