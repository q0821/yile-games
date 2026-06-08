# PRD — 象棋殘局（殘局練習）

象棋的「死活練習」：給一個殘局（FEN），玩家執先手方求殺/求勝，引擎執防守方走到底並判定成敗。
重用象棋的引擎（Fairy-Stockfish）、棋盤渲染（xiangqi-ui）、座標/著法工具。文化感強（江湖殘局、古譜）。

## 題庫（已搜尋確認）
- 來源：[棋弈江湖 / dffge552/xiangqi-pwa-offline](https://github.com/dffge552/xiangqi-pwa-offline)，**MIT 授權**。
- 每題格式 `{ fen, name, ... }`；FEN 為標準象棋 FEN（已驗證可直接載入我們的 ffish，正常產生合法手）。
- **題庫只有盤面、沒附解法** → 不需要：解法/對手/裁判全由我們的引擎擔任。
- 精選收錄（先做、~230KB，別整包 4.7MB）：基本殺法、江湖殘局、夢入神機、適情雅趣。
- 古譜本身屬公共領域；JSON 編纂為 dffge552 MIT → 在「關於與授權」標注。

## 玩法與判定（引擎當解答+對手+裁判）
- 載入題目 → 分析起始局面定**目標**：引擎評估若該方勝勢（mate / eval ≥ 勝勢門檻）→「求殺取勝」；
  接近和 →「守和不敗」。（多數殘局為求勝。）
- 玩家走子（先手方）→
  - 若已將死對方（對方無合法手且被將）→ **解出！**
  - 否則分析新局面（換玩家視角的評估）：求勝題若評估掉出勝勢門檻 →「這手丟了勝勢」（可重試/悔回）；
    守和題若掉到敗勢 → 失敗。
  - 否則引擎走防守方最佳手，繼續。
- 每手玩家走後做一次引擎評估（movetime ~400ms，以「思考中」遮蓋）。
- 提示：引擎最佳手（高亮/箭頭，重用覆盤 PV 概念）。

## 架構
- **題庫**：建置時把精選 JSON 合併瘦身成 `public/xiangqi-puzzles/<cat>.json`（只留 fen/name），延遲載入。
- **xiangqi-game**：新增 `newRawBoard(fen)` 回傳獨立 ffish Board（殘局模式自管，**不碰對弈模式的單例 _board，避免互相污染**）；
  重用已匯出的 splitMove / squareToRC / rcToSquare / gridFromFen。
- **xiangqi-engine**：直接重用 analyze({fen})（無狀態、吃 FEN）與 bestMove。
- **xiangqi-puzzle-mode.js**：殘局控制器（選題、載 FEN、玩家走子→引擎防守→判定、提示、進度）。
- **xiangqi-puzzle-progress.js**：localStorage 進度（已解題、key `xiangqi_puzzle_progress`，與對弈分開）。
- index.html `#xiangqiPuzzleScreen` + 首頁入口；main.js `#xqpuzzle` 路由 + HOME_ITEMS。
- 渲染重用 xiangqi-ui 的 drawXiangqi（盤、棋子、最後手、將軍高亮、提示箭頭）。

## Preflight（適用項）
- **授權**：第三方題庫（MIT）→ 同 commit 更新「關於與授權」+ 記錄（依專案習慣）。
- **FEN 相容**：已驗證 ffish 接受；解析/著法一律用 splitMove（rank-10）。
- **單例衝突**：殘局模式用獨立 ffish board，不污染對弈模式。
- **效能**：每手一次引擎評估（限 movetime）；題庫延遲載入、精選不整包。
- **判定門檻**：勝勢/和棋門檻沿用覆盤 cp 尺度（可調），mate 直接判解出。
- **進度**：localStorage，獨立 key。
- 無 Emoji；系統宋體；移動動畫重用且有分頁背景保險。
- 不適用：DB、個資金錢、SSRF、對外傳遞。

## 階段
1. **題庫 + 判定核心**：vendor 精選 JSON + 瘦身腳本；newRawBoard；目標偵測 + 判定邏輯（純函式盡量、瀏覽器驗證引擎判定）。
2. **殘局 UI + 流程**：殘局 screen、分類選單、上一題/下一題/隨機/重置、玩家走子→引擎防守→成敗提示、提示按鈕、首頁入口 + 路由。
3. **打磨**：進度記錄（已解標記/統計）、移動動畫、提示 PV 箭頭、關於授權標注、CHANGELOG。

每階段 dev 實機驗證；完成跑測試後 commit。
