# 累計戰績（對電腦）設計 — 2026-07-05

狀態：已與使用者確認設計（記錄範圍、統計維度、顯示位置三項決策見下），進入實作。

## 目標

七種對弈棋（圍棋、五子棋、連六棋、黑白棋、象棋、將棋、西洋棋）記錄**對電腦（pvc）**的累計勝敗和，
並在**終局結束卡片**上顯示一行「對電腦累計 N 勝 N 敗 N 和」。

## 已確認的三項決策

1. **只記 pvc**：pvp（同機雙人）不記任何資料。
2. **分難度存、彙總顯示**：資料以「棋種 × 難度」細粒度儲存，顯示層跨難度彙總；日後要看分難度明細不需 migrate。
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
  [gameId]: {                     // 'go'|'gomoku'|'connect6'|'othello'|'xiangqi'|'shogi'|'chess'
    [difficultyKey]: { w, l, d }  // 難度字串，各棋自報（見下）
  }
}
```

### API

- `emptyStats()` → `{}`
- `recordGame(stats, gameId, difficulty, outcome)` → 回傳新 stats（不可變更新）。
  - `outcome`：一律**人類視角**的 `'win' | 'loss' | 'draw'`；非法值不記錄（防禦性忽略，不拋錯）。
  - `difficulty`：字串；空/undefined 時記入 `'unknown'`（容錯，不應發生）。
- `totals(stats, gameId)` → `{ w, l, d }`（跨難度加總；查無棋種回全 0）。
- `formatRecord(totalsObj)` → 顯示字串：
  - 一般：「對電腦累計 12 勝 8 敗 1 和」；為 0 的項省略（如「對電腦累計 3 勝」）；
  - 全 0（不該被呼叫到，防禦）回空字串。
- `loadStats()` / `saveStats(stats)`：localStorage I/O，read 損毀時回 `emptyStats()`。

### difficulty key 慣例

- 五子棋/連六/黑白棋/象棋/將棋/西洋棋：`'L1'`–`'L3'`（取**終局當下**實際等級；象棋/西洋棋自動難度模式取自適應階梯當下等級，不是設定頁的手動值）。
- 圍棋：`'L1'`–`'L13'`（同樣取終局當下 aiLevel，auto/manual 都一樣記實際等級）。

## 記錄規則

| 情境 | 行為 |
|---|---|
| pvc 終局（勝/敗/和） | 記錄，難度取終局當下等級 |
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

- `tests/stats.test.js`：reducer 全覆蓋——記錄三種 outcome、不可變性、多難度彙總、未知棋種/非法 outcome 容錯、formatRecord 各種省略組合、load 損毀資料容錯。
- 七棋掛點以實玩 smoke 驗證（Playwright 或手動：pvc 下到終局看卡片行、pvp 確認不顯示）。

## 隱私與相容

- 純本機 localStorage，不新增任何網路請求；與 App Store「不蒐集資料」標示、離線承諾相容。
- iOS 精簡版（`__IOS_STORE__`）只含圍棋系四棋，掛點程式碼在被排除的 mode 檔內，不影響精簡版 build。
