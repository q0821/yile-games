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
- 既有 `sound.js`（WebAudio 合成）退役，圍棋改接 audio-manager；合成程式碼可保留作 fallback（音檔載入失敗時）

### 3.3 相容性注意

- iOS WKWebView：AudioContext 需 user gesture 解鎖；BGM `<audio>` 自動播放同樣受限，一律在手勢後啟動
- 切到背景/回前景：`visibilitychange` 時暫停/恢復 BGM
- 音檔經內嵌 HTTP server（localhost:3333）服務，COOP/COEP header 已涵蓋同源資產，無額外 CORP 問題

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

格式：mp3、44.1kHz mono，每檔目標 ≤50KB，放 `public/sounds/`。

### 4.2 語音（text-to-speech skill / ElevenLabs）

| 檔名 | 內容 | 語言 |
|---|---|---|
| xiangqi-check / xiangqi-mate | 「將軍！」／「絕殺！」 | 中文 |
| shogi-check / shogi-mate | 「王手！」／「詰み！」 | 日文 |
| chess-check / chess-mate | "Check!" ／ "Checkmate!" | 英文 |

觸發點：三棋的 mode 層已有將軍/王手偵測（狀態提示條），在同一處接語音。

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

## 6. AI 建議（象棋／將棋／西洋棋）

- 常駐功能列新增「建議走法」按鈕，行為對齊圍棋既有的 `requestMoveHint`
- 實作：呼叫既有 Fairy-Stockfish 引擎（xiangqi-engine 共用單例）搜一手 bestmove，於棋盤 canvas overlay 畫 from→to 箭頭，下一手落子或按鈕再按時清除
- 思考中沿用既有 spinner；與 AI 對弈回合互斥（AI 思考中停用按鈕）
- 難度：建議走法固定用較高強度（不吃 adaptive difficulty 的削弱設定），因為目的是「教學」

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

各棋調整：

- **象棋/將棋/西洋棋**：補資訊列（回合、手數、被吃子；將棋持駒列既有保留）；「覆盤檢討」從終局卡片移到常駐功能列（行為對齊圍棋：對局中可入覆盤）；新增「AI 建議」按鈕
- **圍棋**：header 改用統一 `mode-header` 結構（含設定鈕），既有資訊列/功能列保留並套統一樣式
- **五子棋/黑白棋**：套統一資訊列＋功能列樣式；功能只有「悔棋、重新開始」（無 AI 建議/覆盤/認輸），設定從內嵌精簡列改為與其他棋一致的設定 modal
- 按鈕命名、順序、圖示風格、間距全站統一；`docs/ADD-NEW-GAME.md` 的版面規範章節同步更新

## 8. 質感精修（維持宣紙水墨風）

- **棋盤**：木紋/紙紋質感（canvas 繪製或 webp 疊圖）、畫出棋盤側面厚度＋桌面投影（營造實木棋盤感）、周圍 vignette
- **棋子**：圍棋子光澤與投影微調（stone.js）；象棋/將棋棋子加淺浮雕/圓木子底質感；西洋棋 glyph 陰影
- **落子回饋**：落子 scale-in 動畫、最後一手標記美化、吃子淡出
- **UI**：按鈕/modal/狀態列層次、間距、按壓回饋統一打磨（與第 7 節一起做）
- **過場**：畫面切換、面板開合細膩動效；全部尊重 `prefers-reduced-motion`
- Canvas 動畫僅在事件觸發時 requestAnimationFrame，平時維持靜態繪製（省電）

## 9. 測試與驗證

- Jest：audio-manager 設定邏輯（預設值、讀寫、邊界）、版面調整不破壞各 mode 既有測試
- 手動驗證：六棋逐一過音效/語音觸發點、全域設定即時生效、BGM 輪播與背景暫停
- iOS 實機：AudioContext 解鎖、BGM 背景行為、icon 顯示、體積增幅確認
- 質感精修後跑視覺回顧（手機/平板/桌機三斷點）

## 10. 實作階段與執行方式

| 階段 | 內容 | 執行 |
|---|---|---|
| P1 | audio-manager＋素材生成（音效/語音/BGM）＋六棋接線＋全域設定 UI | 素材生成與接線交 subagent（Sonnet），Fable 5 整合把關 |
| P2 | APP icon 生成與全平台替換 | subagent（Sonnet） |
| P3 | AI 建議（三棋）＋版面一致化 | subagent（Sonnet） |
| P4 | 質感精修 | subagent（Sonnet）＋視覺 review |
| 後續 | 深色模式（另立 PRD） | — |

- Spec 與實作計畫均經 codex 對抗式審查後才動工
- 實作前以 preflight-feature 產自查 checklist，完工後同一份自查

## 11. 風險

| 風險 | 緩解 |
|---|---|
| ElevenLabs 生成音效質感不合預期（如落子聲不像棋子） | 每個音效生成 2-3 個候選挑選；不合格者退回用 WebAudio 合成 fallback |
| BGM 體積推高 APP 大小 | 控制在 2-3 首、128kbps mono/立體聲取捨；必要時降為 2 首 |
| iOS 音訊自動播放限制導致 BGM 不響 | 一律在 user gesture 後啟動；實機驗證列入 P1 驗收 |
| 版面重排破壞既有互動（六棋各自的事件綁定） | 逐棋改、逐棋驗證；Jest 既有測試全綠為前提 |
| 語音在快速連將時重疊吵雜 | 同名語音節流（播放中不重複觸發） |
