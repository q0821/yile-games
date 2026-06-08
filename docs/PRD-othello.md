# PRD — 黑白棋（Othello / 翻轉棋）

新棋類，純策略、零運氣、自製 AI（不需 WASM 引擎）。架構比照 gomoku，套用象棋那輪的 UX 標準
（一致結束畫面、AI 思考延遲+讀取、悔棋、移動回饋）。黑白圓子沿用圍棋/五子棋棋子視覺。

## 規則（標準 Othello）
- 8×8 盤，棋子落在**格子內**（非交叉點）。起手中央 4 子斜放：d4 白、e4 黑、d5 黑、e5 白。黑先。
- 落子必須**夾住**：新子與己方既有子之間，沿 8 方向夾住一段連續對方子 → 那些子全翻成己方色。
- 只有「至少能翻 1 子」才是合法手。
- 無合法手則**跳過（pass）**並提示；雙方皆無合法手（或盤滿）即終局。
- 子多者勝；同數和局。

## AI（自製啟發式）
- minimax + alpha-beta + 位置權重評估（角最重要、X/C 位危險）+ 機動性（合法手數）。
- 終盤（剩 ~10-12 空格）可精確求解。
- 難度三段：簡單（淺層+隨機弱化）、普通（depth ~4 位置分）、困難（depth ~6-8 + 機動性/角）。
- rng 可注入（測試可重現）。

## 架構（比照 gomoku/xiangqi，模組自管）
- `othello-rules.js`：createBoard、legalMoves、flips(move)、applyMove、hasLegalMove、isGameOver、score。純邏輯、可單元測試。
- `othello-ai.js`：bestMove(board, player, level, rng)。純邏輯、可單元測試。
- `othello-ui.js`：canvas 8×8 暖色盤 + 黑白立體棋子（沿用棋子質感）；合法點提示、最後手、翻子動畫（Phase 3）。
- `othello-mode.js`：點格落子→翻子→AI 回應；設定（pvc/pvp、執子、難度）；結束畫面（共用 .board-end）；悔棋；pass 處理。
- index.html `#othelloScreen` + 首頁入口；main.js `#othello` 路由 + HOME_ITEMS。
- tests/othello.test.js：規則 + AI 單元測試。

## Preflight（適用項）
- **座標**：格子制（disc 在格中心），與圍棋/象棋的交叉點制不同 → 新的 board 渲染與點擊映射，集中座標換算、肉眼驗證 row/col。
- **規則正確性**：8 方向夾翻、合法手=至少翻 1、pass、雙 pass 終局、終局計分 → 全部單元測試（含邊角 case）。
- **AI**：角優先（避免送角）、X/C 位懲罰；難度分段；rng 注入測試。
- **UX 一致**：結束卡片共用 .board-end；AI 思考延遲 1–3 秒 + spinner；悔棋；無 Emoji；系統宋體。
- **效能**：AI minimax 放 setTimeout/非阻塞，困難難度深度別爆（alpha-beta + 限深）。
- 不適用：DB、個資金錢、SSRF、對外傳遞、第三方引擎授權（純自製）。

## 美學決定
- 盤面用**暖色宣紙/木質 + 細格線**（非經典綠氈），維持水墨主題；黑白圓子沿用 Go/Gomoku 立體棋子質感。

## 階段
1. **規則 + AI + 測試**（純邏輯）。
2. **UI + 控制器 + 整合**：可人機/雙人對弈、合法點提示、pass、結束畫面。
3. **打磨**：翻子動畫、AI 思考延遲+spinner、悔棋、難度微調。

每階段 dev 實機驗證；完成跑測試後 commit（含 CHANGELOG）。
