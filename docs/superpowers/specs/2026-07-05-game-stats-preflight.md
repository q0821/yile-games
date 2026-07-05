# 累計戰績 Preflight Checklist（feature-specific）

> 開工前 review 一輪，完工後同一份再 review 一輪（implementer 自查＋驗收核對）。
> 模板中 Laravel/Filament 相關段落（A schema、D Filament、E form、F 對外傳遞、G 跨 service、H 時區、I SSRF、J 套件）皆**不適用**：本 feature 純前端 localStorage、無網路、無日期運算、無新依賴。

## Non-scope（明確不做，越界即退回）

- 不記 pvp、不做首頁總覽、不做連勝/勝率頁、不做雲端同步、不做防作弊。
- 不動死活練習與象棋殘局的既有進度系統。
- 不動任何遊戲邏輯、終局判定、AI、覆盤流程。
- 不改既有 localStorage key（`gogame_state`、`gogame_tsumego_progress` 等）的結構。
- 不順手重構 mode 檔的其他部分。

## B. 業務規則 enforcement（適用）

- [ ] 記錄規則封裝在 `stats.js` reducer，mode 檔只負責在終局點呼叫（規則不散落七處）。
- [ ] 每條規則有正例＋反例測試：三種 outcome 記錄（正）、pvp 不記（反）、非法 outcome 不記（反）、未知棋種容錯（反）。
- [ ] **單次記錄保證**：掛點在單次觸發的終局函式（`onGameOver` / `endGame` / 終局音效點），嚴禁掛 `showEnd()`（覆盤會重複呼叫）。完工自查：每棋追一次「覆盤後退出重顯結束卡」路徑，確認不重記。
- [ ] reducer 不可變更新（回傳新物件），有測試斷言原物件未被改動。

## C. 資料寫入/讀取（適用，非個資）

- [ ] 內容僅勝敗計數，無個資、無識別碼 → App Store 隱私標示不需變動；不新增任何網路請求。
- [ ] `loadStats()` 對損毀 JSON / 非物件值容錯，回 `emptyStats()`，不拋錯不白屏。
- [ ] 顯示一律 `textContent`（不用 innerHTML），字串全部自產仍守慣例。
- [ ] localStorage 寫入只在終局發生一次，不在繪製迴圈內。

## 本 codebase 特有 check

- [ ] key 命名循 `gogame_*` 慣例（`gogame_stats`）。
- [ ] `__IOS_STORE__` 精簡版 build 驗證：被排除棋種的掛點在其 mode 檔內，`vite build --mode ios` 不得報錯。
- [ ] 結束卡片新行沿用既有設計 token（`--text-muted` 色系、無 Emoji、系統字體 stack）。
- [ ] 新模組檔頭註解交代呼叫端契約（照 tsumego-progress.js 風格）。
- [ ] 全部棋種難度 key 格式一致（`L1`…），象棋/西洋棋自動難度取階梯當下等級。
