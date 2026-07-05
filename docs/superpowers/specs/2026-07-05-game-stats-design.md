# 累計戰績（對電腦）設計 — 2026-07-05

狀態：已與使用者確認設計（記錄範圍、統計維度、顯示位置三項決策見下），進入實作。

## 2026-07-05 決策反轉：移除難度維度

功能完成後（未上線、零使用者資料）重新檢視，判定「分難度存」是過度設計：顯示層本來就跨難度彙總，
分難度明細從未也不打算被使用者看到；而為了「難度取本局對戰當下的等級」這件事，圍棋額外掛了
`_levelBeforeResult` 快照時序機制（象棋/西洋棋則靠呼叫順序判斷 autoLevel）。維度本身的成本已超過其
價值（YAGNI）。因為功能尚未 push、沒有真實使用者資料需要相容，是零成本簡化的時機——之後才決定要分
難度分析，重加即可，不需要現在為假設性需求付維護成本。以下內容已改寫為簡化後的單一結構。

## 目標

七種對弈棋（圍棋、五子棋、連六棋、黑白棋、象棋、將棋、西洋棋）記錄**對電腦（pvc）**的累計勝敗和，
並在**終局結束卡片**上顯示一行「對電腦累計 N 勝 N 敗 N 和」。

## 已確認的三項決策

1. **只記 pvc**：pvp（同機雙人）不記任何資料。
2. **每棋一組累計，不分難度**：資料以「棋種」為單位存 `{ w, l, d }`（原規劃分難度儲存，2026-07-05 已反轉移除，見上）。
3. **只在結束卡片顯示**：不做首頁總覽、不做各棋選單入口（YAGNI，之後要加再說）。

## 非目標

- 死活練習、象棋殘局不納入（已有各自的進度系統，性質是解題非對弈）。
- 不做連勝紀錄、勝率頁、雲端同步、防作弊（悔棋翻盤、中離不記敗——單機自娛不防自欺）。

## 資料層：新模組 `stats.js`

照 `tsumego-progress.js` 的既有模式：純函式 reducer 不碰 localStorage，`loadStats()`/`saveStats()` 是薄 I/O 包裝。

```
localStorage key: 'gogame_stats'
結構：
{
  [gameId]: { w, l, d }  // 'go'|'gomoku'|'connect6'|'othello'|'xiangqi'|'shogi'|'chess'
}
```

### API

- `emptyStats()` → `{}`
- `recordGame(stats, gameId, outcome)` → 回傳新 stats（不可變更新）。
  - `outcome`：一律**人類視角**的 `'win' | 'loss' | 'draw'`；非法值不記錄（防禦性忽略，不拋錯）。
- `totals(stats, gameId)` → `{ w, l, d }`（直接取值＋normalize；查無棋種回全 0）。
- `formatRecord(totalsObj)` → 顯示字串：
  - 一般：「對電腦累計 12 勝 8 敗 1 和」；為 0 的項省略（如「對電腦累計 3 勝」）；
  - 全 0（不該被呼叫到，防禦）回空字串。
- `loadStats()` / `saveStats(stats)`：localStorage I/O，read 損毀時回 `emptyStats()`；讀到舊版分難度巢狀結構視為損毀資料退化處理（normalize 保底為 0，不 migrate，見上方決策反轉說明）。

## 記錄規則

| 情境 | 行為 |
|---|---|
| pvc 終局（勝/敗/和） | 記錄 |
| pvc 認輸 | 記一敗 |
| pvp 任何結果 | 不記 |
| 中途離開／直接開新局 | 不記 |
| 悔棋後翻盤 | 照最終終局記（已知限制，接受） |

**掛點原則**：每棋只在「終局發生的那一刻」記一次——象棋/將棋/西洋棋掛 `onGameOver()`（已保證單次觸發，覆盤重顯結束卡不會重播）；圍棋掛 `main.js` 的 `endGame()`（含認輸/數子/中盤勝，`outcome` 參數已存在）；五子棋/連六/黑白棋掛終局音效觸發點（同為單次）。**嚴禁掛在 `showEnd()`**（它會被覆盤流程重複呼叫）。

## 顯示層

- 七棋結束卡片（`.board-end` 系列 / 圍棋 modal）副標下加一行小字（新 class `board-end-stats`，樣式：小號、`--text-muted` 色系，與現有卡片風格一致、無 Emoji）。
- pvc 顯示 `formatRecord(totals(stats, gameId))`（含剛結束這一局）；pvp 該行不出現（元素不渲染，非空字串佔位）。
- 各 mode 整合為終局點 2–4 行：`recordGame` → `saveStats` → 塞字串進卡片元素。

## 測試

- `tests/stats.test.js`：reducer 全覆蓋——記錄三種 outcome、不可變性、totals 直接取值、未知棋種/非法 outcome 容錯、舊版分難度巢狀資料讀入不爆炸、formatRecord 各種省略組合、load 損毀資料容錯。
- 七棋掛點以實玩 smoke 驗證（Playwright 或手動：pvc 下到終局看卡片行、pvp 確認不顯示）。

## 隱私與相容

- 純本機 localStorage，不新增任何網路請求；與 App Store「不蒐集資料」標示、離線承諾相容。
- iOS 精簡版（`__IOS_STORE__`）只含圍棋系四棋，掛點程式碼在被排除的 mode 檔內，不影響精簡版 build。
