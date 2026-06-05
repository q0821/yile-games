# S7 死活後續手 play-out — Preflight Checklist（feature-specific）

> 由 `preflight-feature` skill 產出。開工前 review 一輪，完工後同一份再 review 一輪。
> preflight 模板偏後端（Laravel/Filament），這裡只列「本純前端 feature 真正適用」的橫向 concern；
> 不適用段落（schema/個資金錢/SSRF/寄信/第三方套件）於文末標明「不適用」原因。

## 決策（已與使用者確認）

- **判定方式**：不下二元成功/失敗硬判。解對第一手後 opt-in 繼續對 KataGo 在局部走完，
  畫面持續顯示 KataGo 勝率 + ownership 覆蓋層（重用 2c-2）。結果＝引擎誠實估計。
- **對手**：玩家走解題方，KataGo 當對手，落子限制在 viewport 局部範圍。
- **理由**：繞開「目標棋串識別」「純規則兩眼/雙活偵測」兩個高誤判風險；符合本專案誠實原則
  （形勢曲線/S10 同一條紅線：不可靠的硬判定比不判更糟）。

## 適用 checklist

### 座標轉換忠實度（本專案最易錯，列為第一）
- [ ] KataGo `ownership` flat index 確認為 `row*size+col`（已從 featuresV7 `pos=y*SIZE+x`、y=outer=our row 坐實，與 ui.js 2c-2 一致）
- [ ] KataGo `moves[].x/.y` 為 web 座標（x=col、y=row）→ 本專案 `row=m.y, col=m.x`（與 katago-service.genmove 一致）
- [ ] **真實角落題肉眼複驗**：ownership 上色與棋子方位沒反、AI 落子落在合理局部（記憶教訓：動座標必用真實題庫 ASCII/截圖驗 row/col）

### 業務規則 enforcement（play-out 狀態機）
- [ ] play-out 新增 `playout` 狀態，**不破壞**既有 `playing/correct/wrong/revealed` 流程
- [ ] 切題/重做/上下題（showProblem/redo/go）一律重置 play-out 狀態（playoutOn、history、ko、ownership、aiBusy）
- [ ] AI 思考中（aiBusy）期間鎖住玩家落子，避免 race（雙落子 / 狀態錯亂）
- [ ] 落子一律走 `rules.js tryPlaceStone`（提子、自殺、劫 由規則處理，非自行判斷）
- [ ] play-out 有 ply 上限（防無限對走）與 AI pass 收手條件
- [ ] 進入 play-out 前快照盤面，退出時可還原到「解對第一手」的乾淨盤

### 前台互動 / 載入 UX
- [ ] 首次 play-out 觸發模型下載（~3.8MB）→ `onStatus` 接到 setStatusMsg 顯示「AI 載入中…」
- [ ] `ensureReady`/analyze 失敗（網路）→ 退出 play-out、顯示「AI 載入失敗，稍後再試」，不 crash
- [ ] play-out 只在 `status==='correct'`（已解對）後 opt-in 出現，按鈕語意清楚（試著走完 / 停手）
- [ ] 不加裝飾 Emoji（CLAUDE.md）；⚫⚪ 顏色指示保留

### 跨「service」副作用（KataGo Web Worker 推論）
- [ ] visits/maxTimeMs 設定夠低，iPhone 單手 < ~0.5s（spike：低 visits <0.3s）
- [ ] play-out 的 analyze 與純對弈/覆盤共用同一 client，不互相干擾（同一 _client 單例，序列化呼叫）
- [ ] 切題/退出 play-out 後，舊的 analyze 回來時用 `playoutOn` guard 丟棄（避免畫到已換的題）

### 測試
- [ ] 新增的純函數（local move 過濾、synthState 組裝）盡量抽純函數加 Jest；狀態機/DOM 部分手動驗
- [ ] `npm test` 既有測試不被破壞

## 不適用段落（明說原因，避免「壓根沒想到」）

- **A. schema / DB**：無 DB，進度仍存 localStorage，本 feature 不改其結構。
- **C. 個資 / 金錢 / 權限**：無使用者個資、無金錢、無權限分級。
- **F. 對外傳遞（mail/webhook）**：純前端，無對外傳遞。
- **H. 時區 / 日期**：不碰 todayStr 以外邏輯；本 feature 不涉日期計算。
- **I. SSRF / URL fetch**：模型 URL 為自家 public/ 靜態資源，非 user-controlled。
- **J. 第三方套件**：KataGo 引擎（web-katrain, MIT）先前已 vendor，本 feature 不新增依賴。

## 完工自查（2026-06-05，第二輪 review）

- ✅ 座標：用真實題庫 inter#60 headless 跑完整 play-out，印出 board vs ownership **逐格對齊 ASCII**，
  確認 row/col 未反（r2 `O X X O O X` 對上 `w B B w w B`）。ownership index `row*size+col` 與 featuresV7 源碼一致。
- ✅ region 過濾：6 ply play-out 中 AI 落子全在 viewport 內（0 例外）。
- ✅ 規則：提子（ply2/3/4 分別提 1/4/1）、合法性、黑白交替、pass 收手全正常（走 `tryPlaceStone`）。
- ✅ 狀態機：playout 新增不破壞既有；切題/重做/看答案/停手皆重置 play-out（seq guard 丟棄在途 analyze）。
- ✅ 載入 UX：`onStatus`→狀態列；analyze 失敗 try/catch 收手不 crash。模型 WebGPU 載入正常。
- ✅ 誠實修正：原設計要顯示 winrate，實測發現整盤勝率被空盤主導會誤導（黑解對顯示黑 3%），
  改為**只顯示逐點 ownership 覆蓋層、不顯示任何聚合數字/二元判定**（符合專案誠實紅線）。
- ✅ build 綠、`npm test` 139 passed、無 console error。
- ⚠️ 未做：前景分頁的「真人點擊→截圖」目視（MCP screenshot 工具當下有 bug、分頁在背景無佈局）；
  以 headless ASCII 對齊 + 邏輯整合測試替代，DOM 膠合層為簡單 wiring，build 已型別把關。
