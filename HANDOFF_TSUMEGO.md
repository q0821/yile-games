# Handoff：死活練習模式（Tsumego）+ 首頁

這份文件記錄「在 gogame 加入死活練習模式」的所有討論決定與實作藍圖，
讓開發可以在本地接續。撰於 commit `21a766d` 之後。

> **實作結果現況（2026-06-05 校正）：**
> - 死活模式與二選一首頁**均已出貨**。
> - **題庫規模超出原訂「50 題 MVP」**：實際匯入趙治勳死活百科全集，
>   入門 1,083 / 中級 1,595 / 進階 1,230（共約 3,908 題），分三級載入，進度存 localStorage。
> - **正解判定維持「只判第一手關鍵點」**（如下方決定）。**但 2026-06-05 補上 S7「試著走完」**：
>   解對第一手後可 opt-in 對 KataGo 在局部走完攻防，持續顯示領地覆蓋層（不下二元判定）。
> - 錯題複習/統計/隨機/只練未解（S2+S3）、emoji→CSS 棋子（S4）、設定白話化（S5）均已出貨。
> - **目前仍缺**（已知天花板，列入 `SPEC_IMPROVEMENTS.md`）：題目目標文字（做活/殺棋）未顯示
>   （題庫無此欄位）、無逐手變化樹文字解說、無成就回饋。

---

## 背景與目標

使用者要把這個 app 從「純對弈」變成**有系統地提升自己棋力**的學習工具。
核心結論：**死活（tsumego）是業餘進步最快、CP 值最高的訓練**，且不依賴引擎。
（AI 引擎 GnuGo 約 5–6 級且 `score()` 失效，無法做精準評估——已在先前版本把
所有靠 AI 評估的功能移除，AI 現在只當對手。）

---

## 已拍板的決定（不要再改方向，除非使用者明說）

| 項目 | 決定 |
|------|------|
| 題庫來源 | **sanderland/tsumego**（GitHub，**MIT 授權**） |
| 題庫格式 | **JSON**（非 SGF），見下方格式說明 |
| 正解判定 | **方案 a**：照題庫的 `SOL`（關鍵手）判定第一手是否正確。量夠，不需退方案 b |
| 判定範圍 | **只判第一手關鍵點（vital point）**，不走完整攻防。使用者已接受此天花板 |
| 分級 | **靠資料夾名**（1a Beginner / 1b Intermediate / 1c Advanced），不靠 JSON 的 `C` 欄（標示不一致） |
| 取題 | 沿用題庫**自己的資料夾分類與檔案順序**（由易到難），各級取一批 |
| 規模 | 先 **50 題**最小可行版（入門為主，例如入門 25 + 中級 15 + 進階 10，可自行調整） |
| 模式選擇 | **方案①**：開頭一個「二選一首頁」（🆚 對弈 / 🧩 死活練習），可擴充成功能選單 |
| 開發順序 | **方案 A**：先做死活模式本身（階段 1），首頁最後做（階段 2） |
| 授權義務 | 把題庫檔放進 repo 時，**一併保留原 repo 的 LICENSE**（MIT 署名要求）。使用者已同意 |

---

## 題庫格式（已用三筆真實樣本確認）

題庫連結：
- 主頁 https://github.com/sanderland/tsumego
- 題目 https://github.com/sanderland/tsumego/tree/master/problems
- 授權 https://github.com/sanderland/tsumego/blob/master/LICENSE

每題是一個 JSON。三筆真實樣本：

```json
// 入門（一手做活）
{"AB": ["eb","fb","bc","cc","dc","be"], "AW": ["da","ab","bb","cb","db"],
 "SZ": "19", "C": "Black to play: Elementary", "SOL": [["B","ba","Correct.",""]]}

// 進階（右上角）
{"AB": ["qa","ob","nb","nc","od","oe","of","pf","qf","rf","sf","se"],
 "AW": ["ra","qc","pc","oc","pd","pe","qe","re","rd"],
 "SZ": "19", "C": "Black to play", "SOL": [["B","rb","",""]]}

// 進階（左下角）
{"AB": ["br","cr","cq","dp","do","eq","fq"],
 "AW": ["hq","gp","fp","eo","en","cm","dn","co","cp","bp","bq","gr"],
 "SZ": "19", "C": "Black to play", "SOL": [["B","ds","",""]]}
```

### 欄位說明
- `AB` / `AW`：預先擺好的黑子 / 白子，座標是 **SGF 字母制**（`"ba"` = 第 1 列第 2 行；
  SGF 慣例第一字母是 column、第二字母是 row，皆從 `a` 起算）。
- `SZ`：棋盤大小（字串，多為 `"19"`）。
- `C`：說明文字（有的含難度 "Elementary"，有的沒有 → **難度不要靠這欄，靠資料夾**）。
- `SOL`：正解，陣列。每列 `[顏色, 座標, 註解, ""]`。
  - **三筆樣本都只有「一手」** → 確認是「只記關鍵手」格式。
  - 判定**只需前兩欄**（顏色 + 座標）；後兩欄是可選顯示文字。
  - **保險寫法**：比對 `SOL` 裡所有列，命中任一個算對（未來相容多正解題）。

### ⚠️ 座標轉換要小心
現有 `gnugo-service.js` 已有 SGF 字母 ↔ `[row, col]` 轉換邏輯
（`LETTERS = 'abcdefghijklmnopqrs'`、`moveToSgfCoord`、`parseMoveFromSgfResponse`）。
**務必沿用同一套慣例**，並用題庫樣本驗證：把 `AB`/`AW` 擺到盤上畫出來，
肉眼確認位置正確（特別是 row/col 順序別搞反——這是最容易出錯的地方）。

---

## 實作藍圖

### 階段 0：題庫進場（使用者已在本地做 / 或開發者搬）
- 在 repo 開 `tsumego-source/`（或 `public/tsumego/`），放選定的 JSON。
- 一併放原 repo 的 `LICENSE`（MIT 署名）。
- 入門/中級/進階各一批，湊 50 題。

### 階段 1：死活模式本身
建議檔案結構（沿用現有 vanilla JS + Vite 風格，不要引入框架）：

1. **轉檔/打包**：寫個 build 階段腳本（或手動）把選定 JSON 整理成一份
   `public/tsumego/problems.json`，結構建議：
   ```json
   {
     "beginner":     [ { "AB":[...], "AW":[...], "size":19, "answers":[["B","ba"]], "desc":"..." }, ... ],
     "intermediate": [ ... ],
     "advanced":     [ ... ]
   }
   ```
   （把 `SOL` 精簡成 `answers`，只留顏色+座標；難度由所屬陣列決定。）

2. **`tsumego.js`（新模組，純邏輯，可測試）**：
   - `parseProblem(raw)` → 統一內部格式（盤面陣列 + 該下方 + answers）
   - `buildBoardFromProblem(problem)` → 用 `AB`/`AW` 產生 `board` 二維陣列（重用 `rules.js` 的 `createBoard`）
   - `checkAnswer(problem, row, col)` → 比對 answers，回傳 `correct` / `wrong`
   - `sgfCoordToRowCol(s)` / 反向 → **沿用 gnugo-service 的字母慣例**
   - 這幾個純函數要寫 Jest 測試（仿 `tests/` 既有 sandbox 模式，用 `tests/helpers.js`）

3. **死活畫面（畫盤重用 `ui.js` 的 `drawBoard`/`drawStone`）**：
   - 擺出題目盤面、標示「黑先/白先」、難度、題號（第 N / 50 題）
   - 玩家點一手 → `checkAnswer`：
     - ✅ 正解 → 顯示「正解！」+ 標記，提供「下一題」
     - ❌ 非正解 → 顯示「再試試」，可「看答案」（在 answers 點上畫提示）
   - 操作鈕：上一題 / 下一題 / 重做 / 看答案 / 回首頁
   - 分級選單（Beginner / Intermediate / Advanced，沿用題庫順序）

4. **進度記錄（localStorage，可選但建議）**：
   - 記哪些題解過、正確率，key 例如 `gogame_tsumego_progress`
   - 與對弈的 `gogame_state` 分開存

### 階段 2：首頁（最後做）
- 一個**可擴充的功能選單**（不要寫死兩個按鈕，用陣列渲染），目前兩項：
  `🆚 對弈` / `🧩 死活練習`，未來可加打譜、統計等。
- **改啟動流程**：目前 `main.js` 結尾 `if (!loadGame()) startNewGame();` 會直接進對弈。
  要改成：app 打開先顯示首頁；選「對弈」才走現有對弈初始化、選「死活」才進死活模式。
  （注意 `loadGame()` 的自動恢復對局邏輯要保留，但只在進入對弈模式時觸發。）
- 各模式加「← 回首頁」。
- 首頁可考慮記住「有沒有未完成的對局」做提示，但不是必須。

---

## 現有程式碼可重用的點（重要，避免重造輪子）

| 需求 | 重用什麼 | 位置 |
|------|---------|------|
| 建空盤 | `createBoard(size)` | `rules.js` |
| 落子合法性/提子 | `tryPlaceStone` | `rules.js` |
| 算氣（看死活） | `getGroup` | `rules.js` |
| 畫盤、畫子 | `drawBoard` / `drawStone` / `resizeCanvas` | `ui.js` |
| SGF 字母座標轉換 | `LETTERS`, `moveToSgfCoord`, `parseMoveFromSgfResponse` | `gnugo-service.js` |
| 測試 sandbox（vm + babel 載入 ES module） | `sandboxWithRules` 等 | `tests/helpers.js` |
| app 狀態/事件結構參考 | `app` context 物件 | `main.js` |

測試慣例：`tests/*.test.js`，用 `require('./helpers')` 的 sandbox，
存取 `GoRules.xxx` 等（不要在測試裡直接 `import`，會被 jest 擋）。

---

## 目前 app 狀態（接手前的基準）

- 對弈：人機（GnuGo）/ 人人，9/13/19 路，中/日規則，計時器
- AI 回手有 1–3 秒擬人停頓
- 覆盤：純逐手回看（已移除 AI 分析）
- 保留的輔助：顯示氣數、實戰即時提醒（叫吃警告）、吃子提示
- 已移除：覆盤 AI 分析、新手引導、形勢曲線（都因 GnuGo 不可靠而砍）
- 頁尾版本號可點開看 `CHANGELOG.md`
- 測試：`npm test`（jest），目前 97 passed
- build：`npm run build`（先 `generate-version.js` 再 vite）

---

## 動工前務必先驗證的未知數

1. **座標轉換正確性**：用三筆樣本把 `AB`/`AW` 畫上盤，肉眼確認 row/col 沒反。
2. **答案座標**：`SOL` 的座標用同一套轉換後，落點要落在「題目要求做活/殺的關鍵處」。
3. **題庫實際檔名/結構**：clone 下來看 `problems/` 底下確切的檔名規則與是否每題一檔。
4. **9 路題有沒有**：若使用者主要練 9 路，確認題庫各級有沒有 9 路題（樣本都是 19 路）。

---

## 給接手者的第一步建議

1. clone 題庫，看 `problems/1a. Tsumego Beginner/` 實際長相，挑前 ~25 題。
2. 寫 `tsumego.js` 的純函數 + 測試，先把「擺盤 + 判定 + 座標轉換」跑通（不碰 UI）。
3. 用一筆樣本做最小畫面：擺出來、點一手、判對錯。對了再擴充分級/導覽。
4. 最後做首頁、改啟動流程。
