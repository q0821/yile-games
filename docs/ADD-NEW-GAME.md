# 新增棋類流程（開發 runbook）

> 整理自 2026-06 連續導入 **象棋 / 象棋殘局 / 黑白棋 / 五子棋 / 日本將棋** 的實作經驗，
> 給之後要再加一種棋（或維護既有棋）的人。目標：新棋上線快、版面與其他棋一致、少踩雷。

弈樂是 vanilla JS + Vite 的多棋類 SPA，以 `location.hash` 為單一路由。每種棋自成一組模組、
共用一套版面語言與資產。下面分「決策 → 檔案 → 接線 → 座標/記法 → 共用資產 → 版面一致性 →
驗收 → 踩雷」八段。

---

## 1. 先決策：引擎要重用還是自製？

| 類型 | 規則／AI 來源 | 範例 | 適用 |
|---|---|---|---|
| **A. 重用 Fairy-Stockfish + ffish** | 同一份多變體 WASM（`/engine/xiangqi/`） | 象棋、日本將棋 | 引擎已支援的變體（`ff.variants()` 可查：xiangqi、shogi…） |
| **B. 自製規則 + 自製 AI** | 純 JS 規則 + 啟發式/alpha-beta | 五子棋、黑白棋 | 引擎沒有、或規則簡單自己寫更省事 |

A 型最大工通常在 **UI 與互動**（盤型、特殊著法如將棋升變/打入），規則與合法手交給 ffish；
B 型則規則、AI 都要自己寫。先確認型別再開工，會少走很多冤枉路。

判斷 A 型是否支援：用 Node 跑 ffish（見第 4 段的 `wasmBinary` 技巧）`ff.variants().includes('xxx')`。

---

## 2. 檔案結構（每種棋一組）

以 `<game>` 為前綴。各檔職責固定、彼此低耦合：

| 檔 | 職責 | A 型 | B 型 |
|---|---|---|---|
| `<game>-game.js` | 棋規封裝 + **座標映射唯一來源** + FEN/盤面→格陣解析 | 封裝 ffish | — |
| `<game>-rules.js` | 自製規則（合法手、勝負判定） | — | 自製 |
| `<game>-ui.js` | canvas 盤面渲染（**純畫圖、無狀態**）：resize + draw + 高亮 + 動畫 | ✓ | ✓ |
| `<game>-mode.js` | 控制器：狀態、事件、render、AI、設定、結束畫面、悔棋 | ✓ | ✓ |
| `<game>-engine.js` | AI（Fairy-Stockfish 薄包裝，帶 `variant`） | ✓ | — |
| `<game>-ai.js` | 自製 AI | — | ✓ |

- **A 型引擎共用**：不要每種棋各存一份 WASM。`<game>-engine.js` 委派給 `xiangqi-engine.js`
  的共用單例，只是帶不同 `variant`（見 `shogi-engine.js`）。`<game>-game.js` 的 `locateFile`
  也直接指 `/engine/xiangqi/ffish.wasm`（多變體單檔）。
- **棋子繪製共用**：圍棋/五子棋/黑白棋的立體棋子都走 `stone.js` 的 `drawStonePixel(ctx,x,y,r,black)`
  （柔邊投影＋三段暖漸層＋高光）。要改棋子外觀改這一處、三邊同步。漢字駒（象棋/將棋）則各自畫。

---

## 3. 接線清單（每加一種棋都要碰這幾處）

1. **`index.html`** — 新增 `#<game>Screen` 區塊。用**單欄置中**版面語言（見第 6 段），
   含 `mode-header`（回首頁＋標題）、設定、`board-wrap`＋canvas、狀態列、功能列。
   需要規則說明就加一個 `modal-overlay` modal（沿用 `.changelog-modal` 可捲動容器）。
2. **`main.js`** — 四個點：
   - `import { enter<Game>Mode } from './<game>-mode.js';`
   - `HOME_ITEMS` 加一筆 `{ id, title, desc, hash: '#<game>' }`（順序＝首頁排序）。
   - `showScreen()` 加一行 `document.getElementById('<game>Screen').style.display = name === '<game>' ? 'flex' : 'none';`
   - `applyRoute()` 加一個 `else if (hash === '#<game>') { showScreen('<game>'); enter<Game>Mode(); }`
3. **`style.css`** — 盡量沿用既有 class（見第 6 段）；只加該棋專屬樣式。
4. **`public/CHANGELOG.md`** — **同一個 commit** 補使用者可見的「新增 XX 棋」條目（含玩法、AI、特殊功能）。
5. **「關於與授權」彈窗**（`index.html` 的 `#aboutModal`）— 用到新第三方引擎/題庫**一定要標注授權**。
   重用既有引擎（如 Fairy-Stockfish 同時供象棋＋將棋）就把該段文字改成「共用」。
6. **設定持久化** — `localStorage` key 用 `<game>-settings-v1`，存 mode/難度/執子等。

---

## 4. 座標與記法（最容易出錯，務必實測校正）

**鐵律：座標 row/col ↔ 棋盤 square 的映射只放一個地方（`<game>-game.js`），且用引擎/規則的
`legalMoves()` 實測校正，不要憑直覺寫死 slice。** 動這段一定肉眼驗 row/col 沒對調。

A 型用 ffish 校正的標準作法（Node 下 ffish-es6 用 fetch 載 wasm 會失敗，改餵 buffer）：
```js
import Module from 'ffish-es6'; import fs from 'fs';
const ff = await Module({ wasmBinary: fs.readFileSync('node_modules/ffish-es6/ffish.wasm') });
const b = new ff.Board('shogi');
console.log(b.fen(), b.legalMoves());   // 拿起手局面的合法手反推 file/rank 方向
```
寫任何 UI 前先把座標、記法全部釘死。已知各棋的雷：
- **象棋**：rank 1–10，rank 10 的 square 是 3 字元（`b10`），著法可能 5 字元（`b10c8`），
  不能固定 `slice(0,2)/slice(2,4)`。
- **將棋**：`rank = 9 − row`；**打入記法是 `S@a1`**（駒`@`格、駒字大寫），不是 `P*5e`；
  升變尾綴 `+`（`e7e8+`，同時有 `e7e8` 與 `e7e8+` = 可選升變、只有 `+` 版 = 強制）；
  盤上升變駒 FEN 用 `+P` 前綴。詳見 `shogi-game.js` 註解。

---

## 5. 引擎多變體（A 型）

Fairy-Stockfish 同一份 `stockfish.wasm` 支援多變體。`xiangqi-engine.js` 已參數化：
`bestMove/analyze` 接 `variant`（預設 `xiangqi`），每次求手前 `setoption UCI_Variant value <v>`
+ `ucinewgame` 隔離，所以單例引擎可同時服務多棋、互不污染。新棋只要：
```js
// <game>-engine.js
import * as Engine from './xiangqi-engine.js';
export const ensureReady = Engine.ensureReady, reset = Engine.reset, isReady = Engine.isReady;
export function bestMove(o){ return Engine.bestMove({ ...o, variant: '<variant>' }); }
```
難度用 `UCI_Elo`（引擎自我降棋力），比限時平滑。無 NNUE 權重 → 古典評估，休閒夠用。

---

## 6. 共用資產與版面一致性（重要）

**所有棋的版面語言要一致**（2026-06-09 已把圍棋從三欄改成跟其他棋一致的單欄；2026-07 六棋資訊列與
常駐功能列再做一次「版面一致化」，見 `docs/PRD-audio-visual-parity.md` §7）。標準結構（六棋一體適用）：
```
mode-header（回首頁 │ 標題 │ 設定鈕，開 modal）
資訊列 .game-infobar（回合徽章 │ 逐棋欄位，永遠可見）
board-wrap（position:relative；內含 canvas + AI 思考/結束/數目 覆蓋）
狀態列（.gomoku-status / .go-status）
功能列（.gomoku-controls / .go-controls）——對弈中會用的功能一律放這、永遠可見
```
設定一律收進「設定」鈕開的 `.go-settings-modal`（沿用 `.changelog-modal` 可捲動容器），**不要**用內嵌精簡列
（五子棋/黑白棋 2026-07 前的 `.gomoku-settings` 內嵌列已改成 modal；`.gomoku-settings` class 目前僅
象棋殘局 `#xqpScreen` 這類非六棋主線畫面在用，新棋不要再用這個內嵌模式）。

**資訊列 `.game-infobar` 逐棋欄位慣例**（不套單一模板，依棋種既有能力決定，見 PRD §7 表）：
- 共同：`.turn-badge`（回合徽章，`black`/`white`/`red` 三色 class 對應棋子顏色；先手/後手類棋種借用
  `black`=先、`white`=後）＋ `.info-item`（其餘欄位，數字包 `<span>` 讓 CSS 加粗）。
- 有「吃子」概念的棋種（象棋/西洋棋）：回合徽章＋手數＋雙方被吃子摘要（依開局標準子力數與目前 FEN
  比對算損失，見 `xiangqi-mode.js`/`chess-mode.js` 的 `capturedCounts()`，不需要引擎額外介面）。
- 有「持駒」的棋種（將棋）：回合徽章＋手數，持駒維持既有獨立駒台列、**不**塞進資訊列。
- 純落子無吃子概念（五子棋）：回合徽章＋手數。
- 子數制（黑白棋）：回合徽章＋雙方子數（原本擠在狀態文字裡，移入資訊列，狀態文字只留回合/結果）。
- 圍棋沿用既有回合＋提子＋手數＋計時，只套 `.game-infobar` 統一樣式、內容不變。

**常駐功能列按鈕順序**（六棋統一，但按鈕依棋種既有能力顯示，沒有的功能不新做）：
`悔棋 │ AI建議 │ 認輸 │ 重新開始 │ 覆盤 │ 匯出`。認輸與匯出目前僅圍棋有（SGF）。三棋（象/將/西洋）的
「覆盤」按鈕常駐在功能列、**終局前 `disabled`**（`title="終局後可用"`），不要放在終局卡片裡（那樣對弈中
完全找不到、且終局卡片重開新局後按鈕就消失）。棋種特有的額外功能（如將棋「規則說明」）附加在標準順序
最後，不佔標準欄位。

可直接沿用的 class：`.gomoku-screen`/`.go-screen`(單欄置中)、`.board-wrap`、`.board-end`(結束畫面)、
`.control-group`、`.game-infobar`(資訊列)、`.gomoku-controls`、`.modal-overlay`/`.changelog-modal`/
`.go-settings-modal`(設定 modal)、`.xiangqi-statusrow`/`.xiangqi-spinner`(思考點)、`stone.js`(立體棋子)。

**幾條硬原則：**
- **對弈中功能不要收進選單/sidebar**（虛手、悔棋、認輸、數目、提示…常駐功能列）。圍棋舊版把這些
  塞進漢堡選單被打槍，已移除 sidebar、改設定進 modal、功能列常駐。
- **桌機手機同一套響應式單欄**，別再做桌機/手機兩份重複的資訊列＋按鈕。
- 全域有 `select, button { width: 100% }`：功能列若要一排多顆，button 要 `width:auto` + 設 `flex-basis`，
  否則每顆撐滿一行（見 `.go-controls button` / `.gomoku-controls button`）。
- **canvas 尺寸**：盤面內部解析度別大於容器顯示寬，否則被 CSS 縮放、**點擊座標會錯位**。
  以容器寬度（≤ 約 668）與視窗高度求 size（見 `ui.js resizeCanvas`）。
- **無 Emoji**；CJK 棋子用系統宋體 stack（canvas 吃不到 CSS 變數，字型 stack 要重複一份）。
- 移動動畫要含「分頁背景 rAF 暫停」的 `setTimeout` 保險，避免切分頁卡死走子流程。

---

## 7. 驗收清單（每階段 dev 實機驗證、完成跑測試才 commit）

- [ ] `npx vite build` 通過、`npx jest` 全綠。
- [ ] 瀏覽器實機：盤面渲染/朝向、選子＋合法手、走子＋動畫、AI 應手、結束畫面、悔棋、規則說明 modal。
- [ ] 特殊互動逐一驗（如將棋升變對話框、打入落點、二步 nifu）；A 型可先用 Node 把純函式對 ffish 契約跑過。
- [ ] **落子座標準確**（點哪下哪，尤其改過 canvas 尺寸後）。
- [ ] Console 無 error。
- [ ] A 型上線前確認正式環境（Cloudflare/Zeabur）有 **COOP/COEP**（`same-origin` + `require-corp`/`credentialless`），
      否則 `SharedArrayBuffer` 不可用、多執行緒引擎起不來。
- [ ] CHANGELOG（`public/`）+ 關於授權 已更新（同 commit）。
- [ ] commit 訊息**不含 Claude 字樣**。

---

## 8. 踩過的雷

- **dev 改 CSS/JS 沒生效**：`index.html` 對 `style.css` 用固定 `?v=` query 且有 Service Worker →
  瀏覽器服務舊檔，版面看似壞掉。**硬重載（Cmd+Shift+R）** 或清 SW/cache。徵兆：JS 量
  `[...document.styleSheets].flatMap(s=>[...s.cssRules]).filter(r=>r.selectorText==='.新class').length` 回 0。
- **背景 dev server** 要用 `run_in_background`/`nohup … & disown`，否則隨 shell 結束被收掉。
- **瀏覽器自動化改 `<select>`**：`form_input` 設值不會觸發 `change` 事件 → 綁在 change 的邏輯（如切模式重開局）
  不會跑。需要時用 JS `el.dispatchEvent(new Event('change',{bubbles:true}))`。
- **部署**：push 到 GitHub ≠ 上線。Zeabur 走 git 觸發，要去 dashboard 確認/Redeploy；`npm ci` 偶發網路錯誤、重試即可。
  上線後查 content-type、清 SW 再驗。
- **macOS shell**：避免 bash 3.2 雷；`sed -i` 要帶 `''`。

---

## 9. 現有棋對照

| 棋 | hash | 型 | 主要檔 | 備註 |
|---|---|---|---|---|
| 圍棋 | `#play` | B（KataGo 推論） | `ui.js` `game-state.js` `ai-controller.js` `katago-service.js` `main.js` … | 單欄版面、設定進 modal、功能列常駐 |
| 死活練習 | `#tsumego` | 題庫 | `tsumego-*.js` | 動座標邏輯要肉眼驗 row/col |
| 象棋 | `#xiangqi` | A（Fairy-Stockfish） | `xiangqi-game/ui/mode/engine.js` `xiangqi-review.js` | 含覆盤；rank 1–10 雷 |
| 象棋殘局 | `#xqpuzzle` | A | `xiangqi-puzzle-*.js` | 題庫取自棋弈江湖（MIT） |
| 五子棋 | `#gomoku` | B | `gomoku-ai/mode/rules/ui.js` | 棋子用 `stone.js` |
| 黑白棋 | `#othello` | B | `othello-ai/mode/rules/ui.js` | 棋子用 `stone.js`、翻子動畫 |
| 日本將棋 | `#shogi` | A（共用引擎 variant=shogi） | `shogi-game/ui/mode/engine.js` | 升變/打入/持駒/規則說明 |
