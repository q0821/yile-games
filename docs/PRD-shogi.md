# PRD — 將棋（日本將棋）

新棋類。AI + 規則重用 Fairy-Stockfish + ffish（已驗證支援 'shogi'）。最大新工在 UI：9×9 格盤、
漢字駒、**升變**、**打入（持駒）**，以及一個**規則說明**入口（多數使用者不熟將棋）。

## 引擎/規則（已探明）
- ffish/Fairy-Stockfish variant `shogi`。起手 FEN：`lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL[] w - - 0 1`。
- 記法：file `a–i` + rank `1–9`（如 `a3a4`）；**打入** `P*5e`（駒*格）；**升變** 著法尾綴 `+`。
- **持駒**在 FEN 的 `[...]` 段。`legalMoves()` 會列出移動 + 可升變版本 + 可打入的手。
- AI：重用引擎 analyze/bestMove，但要設 `UCI_Variant=shogi`（見架構）。座標方向用 legalMoves 實測校正。

## 規則摘要（也作「規則說明」內容）
- 9×9，駒在格子內。雙方共用駒色，以**朝向**區分（對方駒上下顛倒）。
- 駒：王/玉(K)、飛(R)、角(B)、金(G)、銀(S)、桂(N)、香(L)、步(P)。
  升變：飛→龍、角→馬、銀/桂/香/步→各成駒（敵陣三排內可升；步/桂/香到底排強制升）。
- **打入**：吃到的對方駒翻為己方、收入持駒，之後可花一手「打」回盤上任一空格（不可升、二步/打步詰等限制由引擎處理）。
- 目標：將死對方王。

## UI 元件
- **9×9 格盤**（shogi-ui）：暖色盤、漢字楔形駒（己方正向、對方 180° 倒置；升變駒紅字）。
- **持駒區**：盤上、盤下各一排，顯示雙方俘獲駒與數量；點選持駒進入「打入」狀態。
- **移動／打入輸入**：點盤上駒→合法目的；或點持駒→合法落點（高亮）→打入。
- **升變提示**：走入敵陣且可選升變時，跳「成る／不成」小選擇（強制升變自動）。
- **規則說明按鈕**：開啟 modal，圖文說明駒走法、升變、打入、目標（重用既有 modal 樣式）。
- AI 思考延遲＋讀取、最後手標記、結束畫面（共用 .board-end）、移動動畫。

## 架構
- **引擎多變體**：把 xiangqi-engine 的變體參數化（bestMove/analyze 接 `variant`，每次 `setoption UCI_Variant` + ucinewgame；預設 xiangqi 保持相容）。或抽 shared engine。將棋傳 `shogi`。
- **shogi-game.js**：自管 shogi ffish board（重用 ffish 工廠）。提供 fen、legalMoves、push、isGameOver、result、isCheck、持駒解析、fen→格陣（含升變/朝向）、座標 ↔ UCI、splitMove（含打入/升變記法）、可升變判斷、合法落點。
- **shogi-ui.js**：9×9 盤 + 漢字駒 + 持駒區渲染（最後手、選取、合法點、打入候選）。
- **shogi-mode.js**：控制器（移動/打入/升變、AI、持駒、結束畫面、規則說明）。
- index.html `#shogiScreen` + 規則說明 modal + 首頁入口；main.js `#shogi` 路由 + HOME_ITEMS。

## Preflight（適用項）
- **座標（新踩雷點）**：將棋 file/rank 與打入/升變記法都新 → 集中 square↔cell 映射、用 legalMoves 實測校正，禁固定 slice。
- **引擎變體**：參數化勿破壞象棋（預設 xiangqi）；切換 variant 後 ucinewgame 隔離。
- **持駒/升變/打入**：FEN `[...]` 解析；legalMoves 含升變雙版本與打入；UI 三個新互動都要對。
- **規則說明**：對不熟玩家必備，明確列入。
- 效能：引擎 movetime 限制；無 NNUE 用古典評估（休閒夠）。
- 無 Emoji；漢字用系統字型；結束畫面一致；移動動畫含分頁背景保險。
- 授權：引擎 Fairy-Stockfish（GPL-3）已標注；將棋無額外題庫/資料。

## 階段
1. **引擎多變體 + shogi-game + 渲染 + 規則說明**：盤/持駒/座標/駒/升變打入 helper；9×9 盤 + 漢字駒 + 持駒區渲染一個局面；規則說明 modal。
2. **互動**：移動 + 升變提示 + 打入（持駒選取→合法落點），人機可下、將死判定。
3. **整合 + 打磨**：首頁/路由、AI 思考延遲、結束畫面、最後手、移動動畫、CHANGELOG。

每階段 dev 實機驗證；完成跑測試後 commit。
