# 象棋覆盤 + 數據式評估 — 實作計畫

對齊圍棋覆盤（main.js enterReview/reviewGo/analyzeReview + review.js）。引擎用 Fairy-Stockfish。

## Preflight（適用項）
- **著法解析**：PV 變化線含 rank-10 著法 → 一律用 `Game.splitMove`，禁用固定 slice。
- **效能**：分析整局 = (N+1) 個局面 × movetime；on-demand（按鈕觸發）+ 進度顯示，不自動跑。
- **引擎狀態**：分析用滿血（`UCI_LimitStrength=false`）；對弈 bestMove 每次設回 true，互不污染。ucinewgame 隔離。
- **一致性**：UX 比照圍棋（滑桿 / 上下手 / 分析本局 / 優勢曲線可點跳手）。
- 無 Emoji；GPL 引擎已標授權。

## 階段 1：引擎 analyze + 資料層（純邏輯，可瀏覽器驗證）
- xiangqi-engine：`analyze({fen, movetimeMs})` → `{cp, mate, pv, bestmove}`（滿血、stm 視角）。
- xiangqi-game：`moveStackList()`、`fensForMoves(moves)`、`gridFromFen(fen)`（piecesGrid 改用之）。
- 失分數學：loss_i = cp_i + cp_{i+1}（negamax 連續局面）；紅方視角 redCp_k = k 偶 ? cp_k : -cp_k。
- 分類：佳著/正常/小失誤/失誤/大失誤（centipawn 門檻，可調）。
**狀態**：進行中

## 階段 2：覆盤 UI（逐手切換）
- 結束畫面加「覆盤」按鈕 → 進入 review；board 改畫第 k 手局面（drawXiangqi 帶 grid + lastMove）。
- 控制列：滑桿 + 最初/上一手/下一手/最新 + 分析本局（進度）+ 退出覆盤。
- 每手評語：評估分（紅方視角）+ 失分分類 + 最佳手。
**狀態**：未開始

## 階段 3：優勢曲線 + 最佳手變化預想圖
- canvas 畫評估曲線（紅優正、黑優負），點擊跳手。
- 在盤上畫「最佳手 + PV 後續」預想（箭頭/序號），解釋為什麼最佳手較好。
**狀態**：未開始

完成後刪本檔。每階段 dev 實機驗證。
