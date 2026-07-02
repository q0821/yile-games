# 音訊系統、APP icon、功能一致化與質感精修 — 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 依 `docs/PRD-audio-visual-parity.md`（規格唯一來源）完成六棋音效/語音/BGM、全域音訊設定、APP icon、三棋 AI 建議、版面一致化、safe-area、禁著點回饋、終局邊界修正與質感精修。

**Architecture:** 新增零依賴單例 `audio-manager.js`（SFX/語音 WebAudio buffer＋BGM `<audio>` 輪播），素材由 ElevenLabs skills 生成放 `public/sounds|music/`；引擎請求經序列化佇列後三棋加建議走法；版面以「mode-header→資訊列→棋盤→狀態列→常駐功能列」統一。

**Tech Stack:** Vanilla JS（ES modules）、Vite、Jest、Canvas 2D。**禁止引入新 runtime 依賴**（不用 Howler）。

## Global Constraints（每個任務隱含適用）

- UI 文字一律繁體中文；**UI 不加 Emoji**
- git commit 訊息不提及 AI/Claude/codex
- 視覺維持宣紙水墨風（CSS 變數見 style.css `:root`）；動效尊重 `prefers-reduced-motion`
- localStorage 命名慣例：`<域>-settings-v1`（音訊用 `audio-settings-v1`）
- 每個任務完成 `npx jest` 必須全綠（現有 218 tests 不可壞）
- 不修改 `dist/`、`ios/App/App/public/`（build 產物）；`node_modules` 不動
- 檔案風格跟隨現有 codebase（無框架、模組作用域狀態、繁中註解）
- 中文與英文字元之間加半形空白

---

## Phase P1：音訊系統

### Task 1: 生成音效與語音素材

**Files:** Create: `public/sounds/*.mp3`（15 檔）、`public/licenses/audio-credits.txt`

用 ElevenLabs sound-effects skill 生成（每個生成 2 個候選，聽感挑一）：

| 檔名 | 生成 prompt 要點 | 時長 |
|---|---|---|
| stone-place.mp3 | glass/slate go stone placed crisply on kaya wood board, single sharp click | ~0.5s |
| stone-capture.mp3 | several go stones scooped off wooden board, soft clatter | ~1s |
| othello-flip.mp3 | plastic disc placed then several discs flipping in quick succession | ~1s |
| wood-place.mp3 | heavy wooden xiangqi piece slapped firmly onto wooden board | ~0.5s |
| wood-capture.mp3 | wooden piece knocking another piece off, two-hit clack | ~0.8s |
| shogi-place.mp3 | shogi koma snapped onto kaya board with fingertip, sharp resonant click | ~0.5s |
| shogi-capture.mp3 | wooden shogi piece picked and dropped onto komadai tray | ~0.8s |
| chess-place.mp3 | weighted wooden chess piece placed gently on board | ~0.5s |
| chess-capture.mp3 | chess piece capturing, brief wooden knock | ~0.8s |
| pass.mp3 | soft short airy whoosh, gentle notification | ~0.6s |
| game-win.mp3 | short warm guzheng/koto flourish, uplifting | ~2s |
| game-lose.mp3 | short low string phrase, subdued but not harsh | ~2s |
| game-draw.mp3 | neutral single chime | ~1.5s |
| invalid-move.mp3 | short muted double-tap thud, gentle error cue | ~0.4s |

語音用 text-to-speech skill（沉穩男聲，各語言原生發音）：`voice-xiangqi-check.mp3`「將軍！」、`voice-xiangqi-mate.mp3`「絕殺！」（中文）；`voice-shogi-check.mp3`「王手！」、`voice-shogi-mate.mp3`「詰み！」（日文）；`voice-chess-check.mp3` "Check!"、`voice-chess-mate.mp3` "Checkmate!"（英文）。

- [ ] 生成 14 個音效（每檔 mp3 44.1kHz mono，目標 ≤50KB；過大用 ffmpeg 轉 96kbps mono）
- [ ] 生成 6 個語音檔
- [ ] 寫 `public/licenses/audio-credits.txt`（ElevenLabs 生成、日期、用途）
- [ ] Commit: `新增全棋種音效與語音素材`

### Task 2: 生成背景音樂

**Files:** Create: `public/music/bgm-1.mp3`、`bgm-2.mp3`（可選 bgm-3）、credits 併入 audio-credits.txt

- [ ] 用 music skill 生成 2 首古琴/環境氛圍器樂（各 2-3 分鐘、無人聲、平靜對弈氛圍；prompt 例：calm guqin and soft ambient pads, meditative, sparse, for board game concentration, no percussion climax）
- [ ] 128kbps 立體聲或 96kbps mono 取捨，總量 ≤8MB；記錄實際大小
- [ ] Commit: `新增背景音樂素材`

### Task 3: audio-manager.js（TDD）

**Files:** Create: `audio-manager.js`、`tests/audio-manager.test.js`

**Interfaces（Produces，後續任務全依賴這組簽名）：**

```js
// audio-manager.js — 零依賴單例
export const AudioSettings = {
  get(),                    // -> { sfxOn:true, sfxVolume:0.8, musicOn:false, musicVolume:0.5 }（預設）
  set(patch),               // 淺合併、寫 localStorage 'audio-settings-v1'、廣播 'audio-settings-changed' CustomEvent、即時生效
};
export function initAudio();          // 掛 document 一次性 pointerdown/touchstart/keydown -> resume AudioContext、標記 unlocked、若 musicOn 則 startMusic()
export async function loadSfxPack(game); // 'go'|'gomoku'|'othello'|'xiangqi'|'shogi'|'chess'|'common' -> fetch+decodeAudioData 快取；失敗靜默
export function playSfx(name);        // 未解鎖/關閉/未載入 -> 靜默 no-op；圍棋四音（place/capture/pass/gameend）載入失敗時 fallback 呼叫 sound.js 合成
export function playVoice(name);      // 同 SFX 通道與開關；同名播放中不重複觸發（節流）
export function startMusic();         // <audio> 輪播 bgm-*.mp3，隨機起始、曲間 2.5s crossfade（雙 <audio> 交替）、play() rejection 捕捉
export function stopMusic();
export function _setBackendForTest(backend); // 注入 mock（AudioContext 工廠、Audio 工廠、fetch）
```

背景處理：`visibilitychange`（hidden→pause）＋`pagehide` 暫停 BGM；回前景只在 `musicOn && 先前正在播` 時恢復。

- [ ] 寫失敗測試：預設值、set 合併與持久化、廣播事件、sfxOn=false 時 playSfx 不呼叫 backend、未解鎖丟棄、音量套用到 GainNode/audio.volume、musicOn set(false) 停播、損壞 localStorage 回預設
- [ ] `npx jest tests/audio-manager.test.js` 確認 FAIL
- [ ] 實作 audio-manager.js 至測試全綠
- [ ] `npx jest` 全綠
- [ ] Commit: `新增全域音訊管理模組 audio-manager`

### Task 4: 全域音訊設定 UI

**Files:** Modify: `index.html`（首頁＋六棋設定區）、`style.css`、`main.js`（首頁入口接線）

- [ ] 首頁 header 加「設定」按鈕開 modal（沿用 `.modal-overlay` 樣式）：音效開關＋音量 slider（0-100）、音樂開關＋音量 slider，讀寫 `AudioSettings`
- [ ] 六棋各自設定區（圍棋 goSettingsModal、象/將/西洋棋 modal、五子/黑白棋設定區）嵌同一份音訊控制（抽共用 render 函式 `renderAudioControls(container)` 放 audio-manager.js 或新 `audio-settings-ui.js`，勿六份複製貼上）
- [ ] 任一處變更即時生效且互相同步（監聽 `audio-settings-changed` 刷新 UI）
- [ ] `main.js` app 啟動呼叫 `initAudio()`
- [ ] Commit: `新增全域音訊設定介面`

### Task 5: 六棋音效接線

**Files:** Modify: `main.js`（圍棋）、`tsumego-mode.js`、`gomoku-mode.js`、`othello-mode.js`、`xiangqi-mode.js`、`shogi-mode.js`、`chess-mode.js`、`xiangqi-puzzle-mode.js`

對照表（進入各棋畫面時 `loadSfxPack(game)`＋`loadSfxPack('common')`）：

| 事件 | 圍棋/死活 | 五子棋 | 黑白棋 | 象棋/殘局 | 將棋 | 西洋棋 |
|---|---|---|---|---|---|---|
| 落子 | stone-place | stone-place | othello-flip | wood-place | shogi-place | chess-place |
| 吃子/提子 | stone-capture | — | （翻子併落子音） | wood-capture | shogi-capture | chess-capture |
| 虛手 | pass | — | pass（無合法手） | — | — | — |
| 終局 | game-win/lose/draw（依玩家勝負；PvP 用 game-win） | 同左 | 同左 | 同左 | 同左 | 同左 |
| 將軍 | — | — | — | voice-xiangqi-check | voice-shogi-check | voice-chess-check |
| 將死 | — | — | — | voice-xiangqi-mate | voice-shogi-mate | voice-chess-mate |

- [ ] 圍棋：`GoSound.playSound('place')` 等呼叫點改 `playSfx('stone-place')`（main.js:308-309、345 等處）；sound.js 保留供 fallback
- [ ] 語音觸發點依 PRD §4.2：check 接 flashCheck 路徑、mate 接 showEnd 依終局原因（ffish checkmate 判定；認輸/和局/逾時不播）
- [ ] 三棋 AI 落子也要有音（AI move 套用處）
- [ ] `npx jest` 全綠；`npx vite` 手動煙霧測試六棋（記錄於 commit message body）
- [ ] Commit: `六棋接上音效與將軍語音`

### Task 6: BGM 接線

**Files:** Modify: `main.js`

- [ ] 解鎖後若 `musicOn` 自動 startMusic；設定切換即時起停（audio-manager 內建，確認接妥）
- [ ] Commit: `接上背景音樂輪播`

## Phase P2：APP icon（可與其他 Phase 並行）

### Task 7: icon 生成與替換

**Files:** Modify: `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`、`public/icon-512.png`、`public/icon-192.png`、`public/apple-touch-icon.png`、`public/favicon.ico`、`public/icon.svg`（若替換不了則改 manifest/html 引用 png）、核對 `public/manifest.json`、`index.html` icon links

- [ ] 用 gpt-image-bridge skill 生成 1024×1024：書法「弈」字置中（占畫面 60%）、宣紙米色底、右下小朱砂印章、簡潔、小尺寸可辨識、無漸層雜訊、方形滿版（iOS 自動裁圓角）
- [ ] `sips -z` 產各尺寸；favicon 用 `sips`+`iconutil` 或線上格式轉 ico（32×32）
- [ ] iOS：確認 Contents.json single-size 格式吃到新圖
- [ ] Commit: `更換 APP icon 為弈字書法印章設計`

## Phase P3：AI 建議＋版面一致化＋修正

### Task 8: 引擎序列化佇列（TDD、P3 前置）

**Files:** Modify: `xiangqi-engine.js`；Create: `tests/engine-queue.test.js`

**Produces:** `Engine.enqueue(fn)`——所有 `bestMove`/`analyze`/新的 `hint` 內部經單一 promise chain 序列化；`Engine.hint({fen, variant, movetime}) -> Promise<{move, from, to, isDrop}>`，附 `token` 取消語意：呼叫方持 `{cancel()}`，取消後結果丟棄。

- [ ] 寫失敗測試（mock engine process）：並發兩請求依序執行不交錯、取消後 resolve 被忽略、queue 中錯誤不卡死後續
- [ ] 實作佇列；既有 bestMove/analyze 改走佇列（外部 API 不變，xiangqi/shogi/chess/review 呼叫處不用改）
- [ ] `npx jest` 全綠
- [ ] Commit: `引擎請求序列化佇列，防止建議、覆盤、對弈並發互搶`

### Task 9: 三棋「建議走法」

**Files:** Modify: `index.html`（三棋功能列加按鈕）、`xiangqi-mode.js`、`shogi-mode.js`、`chess-mode.js`、`xiangqi-ui.js`（重用 pv 箭頭）、`chess-ui.js`（新增箭頭 overlay）、`shogi-ui.js`（箭頭＋打入高亮）

- [ ] 按鈕停用條件：`aiBusy || reviewAnalyzing || 覆盤中 || 升變對話框開啟 || gameOver`
- [ ] 按下：spinner → `Engine.hint(...)`（高強度固定 movetime ~1500ms，不吃 adaptive 削弱）→ 呈現：象棋 pv 箭頭／西洋棋新箭頭／將棋一般手箭頭、打入=目的地高亮＋持駒列對應駒高亮
- [ ] 回覆時 FEN 已變則丟棄；清除時機：落子、再按、悔棋
- [ ] `npx jest` 全綠＋瀏覽器煙霧測試三棋 hint
- [ ] Commit: `象棋、將棋、西洋棋新增建議走法`

### Task 10: 版面一致化

**Files:** Modify: `index.html`、`style.css`、`main.js`、`gomoku-mode.js`、`othello-mode.js`、三棋 mode、`docs/ADD-NEW-GAME.md`

- [ ] 統一結構：mode-header（回首頁＋標題＋設定鈕）→ 資訊列 → board-wrap → 狀態列 → 常駐功能列；資訊列欄位依 PRD §7 表（黑白棋子數移入資訊列；將棋持駒列不動）
- [ ] 三棋「覆盤檢討」移入常駐功能列、終局前 `disabled`（終局卡片內的按鈕移除）
- [ ] 圍棋 header 換統一 mode-header；五子/黑白設定改 modal（沿用三棋樣式）
- [ ] 按鈕順序統一：悔棋｜AI建議｜（認輸）｜重新開始｜（覆盤）｜（匯出）——括號=該棋有才顯示
- [ ] `docs/ADD-NEW-GAME.md` 版面規範章節同步更新
- [ ] `npx jest` 全綠＋六棋煙霧測試（每棋開一局、下一手、悔棋、開關設定）
- [ ] Commit: `六棋版面一致化：統一資訊列與常駐功能列`

### Task 11: iOS safe-area

**Files:** Modify: `index.html`（viewport meta）、`style.css`

- [ ] viewport 加 `viewport-fit=cover`；`:root` 加 `--safe-top/right/bottom/left: env(safe-area-inset-*, 0px)`
- [ ] 首頁 header 與 `.mode-header` 套 `padding-top: var(--safe-top)`；body/主容器處理左右與底部
- [ ] 瀏覽器 DevTools iPhone 15 Pro 模擬直橫向檢查六棋＋首頁
- [ ] Commit: `修正動態島與瀏海遮擋：加入 safe-area 支援`

### Task 12: 圍棋禁著點回饋（TDD）

**Files:** Modify: `rules.js` 或 `game-state.js`（回傳原因）、`main.js`、`ui.js`（紅 X 閃現＋劫點標記）、`tests/` 對應測試

- [ ] `applyMove` 失敗回傳 `{ ok:false, reason:'occupied'|'suicide'|'ko' }`（先寫失敗測試）
- [ ] `placeStone` 失敗時：該點紅 X 閃現 600ms＋`showToast` 原因文字（「此處已有棋子」「禁著點：自殺手」「打劫禁著點，需先在他處下一手」）＋`playSfx('invalid-move')`
- [ ] 劫爭中：劫禁著點常駐小標記（下一手解消）
- [ ] 順手盤查五子棋/黑白棋無效點擊：無聲失敗者套 toast＋invalid-move
- [ ] `npx jest` 全綠
- [ ] Commit: `圍棋禁著點與無效點擊即時回饋`

### Task 13: 終局邊界修正（TDD）

**Files:** Modify: `game-state.js:307`、`main.js`（doPass 預警）、`tests/game-state.test.js`（或既有測試檔）

- [ ] 失敗測試：`beginScoring→cancelScoring→applyPass` 一次不應 `endedByDoublePass`
- [ ] `cancelScoring()` 加 `current.passCount = 0;`
- [ ] `doPass` 在 `result.endedByDoublePass===false && passCount===1` 時 `showToast('再虛手一次將進入數目')`（PvC AI 虛手既有提示保留）
- [ ] `npx jest` 全綠
- [ ] Commit: `修正取消數目後單次虛手即終局；虛手預警提示`

## Phase P4：質感精修

### Task 14: 棋盤棋子與 UI 打磨

**Files:** Modify: `ui.js`、`stone.js`、`gomoku-ui.js`、`othello-ui.js`、`xiangqi-ui.js`、`shogi-ui.js`、`chess-ui.js`、`style.css`

- [ ] 棋盤：canvas 繪製細木紋/紙紋（低對比 procedural 紋理或既有 webp 疊圖）＋盤側厚度立面＋桌面投影＋外圍 vignette
- [ ] 棋子：stone.js 光澤/投影微調；象/將棋子淺浮雕（內陰影＋邊緣高光）；西洋棋 glyph 加投影
- [ ] 落子 scale-in 動畫（requestAnimationFrame 僅事件觸發）、最後一手標記美化、吃子淡出
- [ ] 按鈕/modal/狀態列層次間距與按壓回饋統一；過場動效；`prefers-reduced-motion` 全部停用動畫
- [ ] 三斷點（375/768/1280）截圖目視檢查六棋
- [ ] `npx jest` 全綠
- [ ] Commit: `畫面質感精修：棋盤棋子光影與介面打磨`

## 總驗證（對應 PRD §9）

- [ ] `npx jest` 全綠
- [ ] Playwright 煙霧：六棋各開局落子、音效觸發（spy AudioContext）、全域設定同步、PvP 雙虛手終局、取消數目後續弈
- [ ] preflight checklist 自查（`docs/PREFLIGHT-audio-visual-parity.md`）
- [ ] codex review 最終 diff
- [ ] `CHANGELOG.md` 更新＋最終 commit
