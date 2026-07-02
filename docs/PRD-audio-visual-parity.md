# PRD：音訊系統、APP icon、功能一致化與質感精修

日期：2026-07-02
狀態：設計定案，待實作計畫

## 1. 背景與目標

本專案（弈樂）是個人棋力訓練工具，含六種棋（圍棋、五子棋、黑白棋、象棋、將棋、西洋棋）＋死活/殘局練習，以 Capacitor 包成 iOS APP。本批優化目標：

1. 全棋種音效（目前只有圍棋有 WebAudio 合成音效）
2. 背景音樂（目前完全沒有）
3. 象棋「將軍」等關鍵事件語音
4. 全域音訊設定（開關＋音量，跨棋種共用）
5. 正式 APP icon（目前是 Capacitor 預設藍 X）
6. AI 建議功能補齊到象棋/將棋/西洋棋（覆盤四棋已有）
7. 六棋版面一致化（向圍棋的「資訊列＋常駐功能列」看齊）
8. 畫面質感精修（維持宣紙水墨風）
9. iOS safe-area 修正（動態島/瀏海壓住標題）
10. 圍棋禁著點回饋（點了沒反應像當機）

## 2. 範圍界定

**不做（Out of scope）：**

- 深色模式 → 獨立後續階段（工程量大：全站 CSS 變數＋六套 Canvas 繪圖）
- 五子棋、黑白棋的 AI 建議與覆盤（使用者明確不需要）
- 斜視角/3D 棋盤 → 維持正上方視角（可玩性與讀形精確度優先），立體感由光影質感營造
- 線上對戰（既有決策，見 TODOS.md）

## 3. 音訊系統

### 3.1 架構：新模組 `audio-manager.js`

單例、零依賴（不引入 Howler），符合專案 vanilla JS 風格。三通道：

| 通道 | 實作 | 用途 |
|---|---|---|
| SFX | WebAudio `decodeAudioData` 預載 buffer | 落子、吃子等低延遲音效 |
| 語音 | 同 SFX 通道（跟隨音效開關） | 將軍/王手/Check 等 |
| BGM | `<audio>` 元素串流 | 2-3 首輪播＋crossfade |

API（暫定）：

```js
initAudio()                    // 首次 user gesture 時 resume AudioContext（iOS 限制）
loadSfxPack(game)              // 進入棋種畫面時 lazy load 該棋種音效包
playSfx(name) / playVoice(name)
startMusic() / stopMusic()
getAudioSettings() / setAudioSettings(patch)   // 變更即時生效並廣播
```

### 3.2 全域設定

- localStorage key：`audio-settings-v1`
- Schema：`{ sfxOn: bool, sfxVolume: 0..1, musicOn: bool, musicVolume: 0..1 }`
- 預設：**音效開（0.8）、音樂關（0.5）**——音樂偏好分歧大，讓使用者主動開
- 入口：首頁設定入口＋六棋各自設定區嵌同一份音訊控制，讀寫同一 key
- **Fallback 政策**：音檔載入失敗一律 fail-soft 靜音（不噴錯、不擋遊戲）；僅圍棋既有四種合成音（place/capture/pass/gameend）保留 `sound.js` 合成作 fallback——其餘棋種的音效（木子、駒音、翻子、語音）**沒有**合成版可退，失敗即靜音

### 3.3 相容性注意

- **解鎖手勢明確定義**：app 啟動時在 `document` 掛一次性 `pointerdown`/`touchstart`/`keydown` 監聽（`{ once: true }` 語意），觸發時 `AudioContext.resume()` 並標記 unlocked；BGM 只在 unlocked 之後才嘗試 `play()`。所有 `<audio>.play()` 的 promise rejection 一律捕捉（fail-soft），解鎖前的 `playSfx` 呼叫直接丟棄不排隊
- **背景/前景**：同時監聽 `visibilitychange` 與 `pagehide`（iOS WKWebView 上 `visibilitychange` 不完全可靠）暫停 BGM；回前景**不自動恢復**，除非 `musicOn === true` 且暫停前正在播放。iOS 實機的背景暫停/恢復行為列入 P1 驗收必測項
- **Header 環境差異**：COOP/COEP 在 iOS 由內嵌 server（AppDelegate 全 response 蓋 header）處理、dev/preview 由 vite.config.js 處理、正式 web 部署由 hosting 設定處理——音檔皆為同源靜態資產，三個環境都不需額外 CORP 設定，但不可將三者混為一談

## 4. 音訊素材（以既有 skills 生成）

### 4.1 音效（sound-effects skill / ElevenLabs）

| 檔名 | 描述 | 使用棋種 |
|---|---|---|
| stone-place | 玻璃/蛤碁石落榧木盤，清脆 | 圍棋、五子棋、死活 |
| stone-capture | 提子（多子離盤窸窣） | 圍棋 |
| othello-flip | 落子＋翻子連聲 | 黑白棋 |
| wood-place | 木質棋子拍擊棋盤，厚實 | 象棋、殘局 |
| wood-capture | 木子碰撞吃子 | 象棋 |
| shogi-place | 將棋駒斜面拍盤（駒音） | 將棋 |
| shogi-capture | 吃子入駒台 | 將棋 |
| chess-place | 木子輕放 | 西洋棋 |
| chess-capture | 吃子 | 西洋棋 |
| pass | 虛手（輕柔提示） | 圍棋 |
| game-win / game-lose / game-draw | 終局（含五子棋/黑白棋/解題） | 全部 |
| invalid-move | 短促錯誤提示（禁著點/無效點擊） | 全部 |

格式：mp3、44.1kHz mono，每檔目標 ≤50KB，放 `public/sounds/`。

### 4.2 語音（text-to-speech skill / ElevenLabs）

| 檔名 | 內容 | 語言 |
|---|---|---|
| xiangqi-check / xiangqi-mate | 「將軍！」／「絕殺！」 | 中文 |
| shogi-check / shogi-mate | 「王手！」／「詰み！」 | 日文 |
| chess-check / chess-mate | "Check!" ／ "Checkmate!" | 英文 |

觸發點（依實際程式流程，兩處分開接）：

- **將軍**：接在各 mode 既有的將軍偵測/提示條路徑（`flashCheck` 等）
- **將死**：現有流程 `gameOver` 時直接走終局處理、**不會經過**將軍提示路徑，所以 mate 語音接在終局處理（`showEnd`）內，依終局原因（ffish 的 checkmate 判定/終局 reason）觸發；認輸、和局、逾時不播 mate 語音
- **節流**：同一語音播放中不重複觸發（快速連將不疊音）

### 4.3 背景音樂（music skill / ElevenLabs Music）

- 2-3 首古琴/環境氛圍風器樂曲，各 2-3 分鐘，全棋種共用
- 隨機輪播、曲間 crossfade（2-3 秒淡入淡出）
- 放 `public/music/`，APP 體積預估 +6-10MB
- 授權：ElevenLabs 生成內容依方案授權可商用；於 `public/licenses/` 補註記

## 5. APP icon

- 設計方向：「弈」字書法＋朱砂印章風（呼應 APP 名「弈樂」與宣紙水墨視覺）
- 以圖片生成 skill 產 1024×1024 主圖，需在小尺寸（60×60）下仍可辨識——書法字置中放大、背景簡潔
- 更新目標：
  - `ios/App/App/Assets.xcassets/AppIcon.appiconset/`（single-size 格式，換掉 AppIcon-512@2x.png）
  - `public/icon-512.png`、`public/icon-192.png`、`public/apple-touch-icon.png`、`public/favicon.ico`、`public/icon.svg`（或改為 PNG 引用）
  - `public/manifest.json` icons 欄位核對
- 驗收：Xcode asset catalog 實際 build 確認（不是換一張 PNG 就算完成）；主畫面、設定 app、Spotlight 三種尺寸目視檢查

## 6. AI 建議（象棋／將棋／西洋棋）

- 常駐功能列新增「建議走法」按鈕，行為對齊圍棋既有的 `requestMoveHint`
- **引擎併發（關鍵設計）**：`xiangqi-engine.js` 是三棋共用的**單一 UCI process**（全域 `_tap` 與 waiter），對弈 AI（`bestMove`）、覆盤分析（`analyze`）、建議走法若並發會互搶輸出。所有引擎請求一律經**序列化佇列**（一次一個、支援取消），建議走法排入同一佇列
- **按鈕停用條件**（不只 AI 思考中）：`aiBusy`、`reviewAnalyzing`、覆盤模式中、升變對話框開啟中、終局後；回覆抵達時若局面已變（FEN 不符）則丟棄結果不畫
- **建議的呈現（逐棋不同，不能一套通用）**：
  - 象棋：重用既有 `view.pv` 箭頭繪製
  - 西洋棋：新增 from→to 箭頭 overlay（現無 pv 支援）
  - 將棋：一般手畫箭頭；**打入（drop）沒有起點**，改為「目的地高亮＋持駒列對應駒高亮」
  - 清除時機：下一手落子、再按一次按鈕、或悔棋時
- 思考中沿用既有 spinner；難度固定用較高強度（不吃 adaptive difficulty 的削弱設定），目的為「教學」

## 7. 版面一致化

統一版面規範（由上而下），六棋一體適用：

```
mode-header（回首頁＋標題＋設定鈕）
資訊列（回合徽章｜手數｜吃子/持駒摘要）
board-wrap（canvas＋overlay＋board-end 結束卡片）
狀態列（輪到誰/思考中 spinner/將軍提示）
常駐功能列（悔棋｜AI建議｜認輸｜重新開始｜覆盤｜匯出）
```

常駐功能列統一「順序與樣式」，但按鈕**依棋種既有能力顯示**：認輸與匯出目前僅圍棋有（SGF），不為象棋/將棋/西洋棋新做 PGN/KIF 匯出或認輸功能（如日後需要另立需求）。

資訊列欄位**逐棋定義**（不套單一模板）：

| 棋種 | 資訊列欄位 |
|---|---|
| 圍棋 | 回合徽章、雙方提子、手數、計時（既有，套統一樣式） |
| 象棋/西洋棋 | 回合徽章、手數、雙方被吃子摘要 |
| 將棋 | 回合徽章、手數（持駒維持既有獨立駒台列，不塞進資訊列） |
| 五子棋 | 回合徽章、手數 |
| 黑白棋 | 回合徽章、雙方子數（從狀態文字移入資訊列） |

各棋調整：

- **象棋/將棋/西洋棋**：補資訊列；「覆盤檢討」按鈕**移到常駐功能列但終局前 disabled**（位置與圍棋一致；不做「對局中進覆盤」——那需要暫停 AI、返回對局等狀態管理，成本效益不划算，行為維持終局後進入）；新增「AI 建議」按鈕
- **圍棋**：header 改用統一 `mode-header` 結構（含設定鈕），既有資訊列/功能列保留並套統一樣式
- **五子棋/黑白棋**：套統一資訊列＋功能列樣式；功能只有「悔棋、重新開始」（無 AI 建議/覆盤/認輸），設定從內嵌精簡列改為與其他棋一致的設定 modal
- 按鈕命名、順序、圖示風格、間距全站統一；`docs/ADD-NEW-GAME.md` 的版面規範章節同步更新

### 7.1 iOS safe-area（動態島/瀏海遮擋修正）

現況：viewport meta 無 `viewport-fit=cover`、全站 CSS 無任何 `env(safe-area-inset-*)`，實機上動態島直接壓住 `mode-header` 標題。修正：

- `index.html` viewport 加 `viewport-fit=cover`
- 全站頂層容器（首頁 header 與各棋 `mode-header`）套 `padding-top: env(safe-area-inset-top)`；左右與底部也一併處理（橫向持機與 home indicator）：`env(safe-area-inset-left/right/bottom)`
- 統一以 CSS 變數收斂（如 `--safe-top: env(safe-area-inset-top, 0px)`），避免六個畫面各寫各的
- 驗收：動態島機型（iPhone 15/16 系列）與瀏海機型實機/模擬器逐畫面檢查，直向＋橫向

## 8. 質感精修（維持宣紙水墨風）

- **棋盤**：木紋/紙紋質感（canvas 繪製或 webp 疊圖）、畫出棋盤側面厚度＋桌面投影（營造實木棋盤感）、周圍 vignette
- **棋子**：圍棋子光澤與投影微調（stone.js）；象棋/將棋棋子加淺浮雕/圓木子底質感；西洋棋 glyph 陰影
- **落子回饋**：落子 scale-in 動畫、最後一手標記美化、吃子淡出
- **UI**：按鈕/modal/狀態列層次、間距、按壓回饋統一打磨（與第 7 節一起做）
- **過場**：畫面切換、面板開合細膩動效；全部尊重 `prefers-reduced-motion`
- Canvas 動畫僅在事件觸發時 requestAnimationFrame，平時維持靜態繪製（省電）

### 8.1 圍棋禁著點回饋（點了沒反應像當機）

現況：落子失敗時 `placeStone` 只 `return false`（main.js:295），且 `GameState.applyMove` 連失敗原因都不回傳（game-state.js:216 `{ ok: false }`）——點到禁著點畫面零回饋，使用者以為 app 卡住。修正：

- `applyMove` 失敗時回傳原因：`occupied`（已有子）、`suicide`（自殺手）、`ko`（打劫禁著）
- 落子失敗的即時回饋三件套：該交叉點**閃現紅色 X 標記**（約 600ms）＋ 既有 `showToast` 顯示原因文字（「此處為打劫禁著點」等）＋ 短促錯誤提示音（併入音效系統，跟隨 sfxOn）
- 劫爭進行中：劫的禁著點**常駐畫小標記**（下一手解消），不做全盤禁著點掃描標示（視覺太吵）
- 其他棋種順手檢查：象棋/將棋/西洋棋點不合法目標時已有「取消選取」回饋，維持現狀；五子棋/黑白棋點無效格若也是無聲失敗，套同樣 toast＋提示音模式（黑白棋「無合法手需 pass」情境既有處理保留）

### 8.2 圍棋終局判定邊界修正（已重現的 bug）

- **Bug**：`cancelScoring()`（game-state.js:307）未重置 `passCount`——雙虛手進數目後按「取消數目」返回對局，之後只虛手**一次**（passCount 2→3）就立刻又被判終局。已在瀏覽器實測重現（取消後單次虛手，數目面板立刻重開）。
- **修法**：`cancelScoring()` 重置 `current.passCount = 0` ＋ 補單元測試（取消數目後需重新累積兩次連續虛手才終局）
- **順帶 UX 預警**：任一方虛手後（passCount=1 時）toast 預告「再虛手一次將進入數目」——成本一行，消除「不小心連按兩次虛手直接進數目」的突兀感（PvC 中 AI 虛手已有既有提示，維持）

## 9. 測試與驗證

- Jest：audio-manager 設定邏輯（預設值、讀寫、邊界）、版面調整不破壞各 mode 既有測試
- **測試可行性設計**：audio-manager 把音訊後端（AudioContext、`<audio>` 元素）設計為可注入介面，Jest 以 mock backend 測「設定變更 → 對後端的呼叫」（音量套用、開關停播、解鎖前丟棄、play() rejection 不外洩），不假裝能在 jsdom 裡測真實聲音
- 手動驗證：六棋逐一過音效/語音觸發點、全域設定即時生效、BGM 輪播與背景暫停
- iOS 實機：AudioContext 解鎖、BGM 背景行為、icon 顯示、體積增幅確認
- 質感精修後跑視覺回顧（手機/平板/桌機三斷點）

## 10. 實作階段與執行方式

| 階段 | 內容 | 執行 |
|---|---|---|
| P1 | audio-manager＋素材生成（音效/語音/BGM）＋六棋接線＋全域設定 UI | 素材生成與接線交 subagent（Sonnet），Fable 5 整合把關 |
| P2 | APP icon 生成與全平台替換 | subagent（Sonnet） |
| P3 | AI 建議（三棋）＋版面一致化＋iOS safe-area＋圍棋禁著點回饋＋圍棋終局判定邊界修正（§8.2） | subagent（Sonnet） |
| P4 | 質感精修 | subagent（Sonnet）＋視覺 review |
| 後續 | 深色模式（另立 PRD） | — |

- Spec 與實作計畫均經 codex 對抗式審查後才動工
- 實作前以 preflight-feature 產自查 checklist，完工後同一份自查

## 11. 風險

| 風險 | 緩解 |
|---|---|
| ElevenLabs 生成音效質感不合預期（如落子聲不像棋子） | 每個音效生成 2-3 個候選挑選；不合格者退回用 WebAudio 合成 fallback |
| BGM 體積推高 APP 大小 | 音樂總量預算上限 8MB；128kbps mono/立體聲取捨；必要時降為 2 首；P1 驗收時實測 bundle 增幅並記錄 |
| 引擎單例被建議/覆盤/對弈並發互搶 | 引擎請求序列化佇列＋取消機制（見 §6），實作為 P3 前置任務 |
| iOS 音訊自動播放限制導致 BGM 不響 | 一律在 user gesture 後啟動；實機驗證列入 P1 驗收 |
| 版面重排破壞既有互動（六棋各自的事件綁定） | 逐棋改、逐棋驗證；Jest 既有測試全綠為前提 |
| 語音在快速連將時重疊吵雜 | 同名語音節流（播放中不重複觸發） |
