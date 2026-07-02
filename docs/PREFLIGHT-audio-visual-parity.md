# Preflight Checklist：音訊系統、APP icon、功能一致化與質感精修

> 依 `~/.claude/skills/preflight-feature/SKILL.md` 產出。開工前（P1 動工前）跑一輪，完工後（P4 結束、總驗證前）同一份再跑一輪，未打勾項目連同證據（測試輸出／程式碼行號／實機截圖）回報。
> 規格唯一來源：`docs/PRD-audio-visual-parity.md`；任務拆解：`docs/PLAN-audio-visual-parity.md`。

## Step 1：Feature 屬性

- [x] 新增前端模組／檔案（`audio-manager.js` 等）
- [x] 讀寫 localStorage（`audio-settings-v1`）
- [x] 前台使用者操作（設定 modal、按鈕、slider）
- [x] 效能敏感（音檔預載、Canvas 動畫、AudioBuffer 記憶體）
- [x] 無障礙相關（動效、按鈕、純音訊提示）
- [x] 多語系（三棋種語音固定語言）
- [x] iOS 平台特有限制（WKWebView 音訊解鎖、內嵌 HTTP server、COOP/COEP）
- [x] 快取／Service Worker（`public/sw.js`）
- [x] APP 體積／資產打包
- 不涉及：DB schema、個資／金錢、Filament 後台、對外傳遞（email/webhook）、跨 service 副作用、時區、SSRF、新第三方 runtime 套件（PRD／PLAN 明訂禁止引入 Howler）

## Step 1.5：Non-scope（本輪 preflight 明確不查）

- 深色模式（PRD § 2 已排除，獨立後續階段）
- 五子棋／黑白棋 AI 建議與覆盤（PRD § 2 已排除）
- 斜視角／3D 棋盤（PRD § 2 已排除）
- 線上對戰（既有決策）
- 後端／DB／權限模型（本 feature 全在前端＋iOS 殼層，無伺服器端邏輯）
- Xcode 簽署／打包流程本身（`scripts/ios-deploy.sh` 等既有機制，非本次改動範圍）

## Step 2：套用的通用段落（skill A–J）

| 段落 | 適用性 | 說明 |
|---|---|---|
| A. Schema | 不適用 | 無 DB migration |
| B. 業務規則 enforcement | **適用** | 音訊設定邏輯、引擎序列化佇列、圍棋終局邊界修正屬狀態機規則，需正例＋反例測試 |
| C. 個資／金錢／權限 | 不適用 | 無使用者帳號／金流 |
| D. Filament Action | 不適用 | 無後台 |
| E. 前台 form/endpoint | 部分適用 | 設定 modal 屬前台表單概念，CSRF／mass assignment 不適用（無伺服器），但「錯誤訊息友善、狀態不可雙重觸發」原則適用（toast 文案、按鈕停用條件） |
| F. 對外傳遞 | 不適用 | 無 email/webhook |
| G. 跨 service | 不適用 | ElevenLabs 呼叫僅發生於素材生成階段（開發時），非 App 執行期 |
| H. 時區／日期 | 不適用 | 無日期邏輯 |
| I. SSRF | 不適用 | 無 user-controlled URL fetch |
| J. 第三方套件 | **適用（反向確認）** | 明確禁止引入 Howler；確認 Task 3 / Task 10 沒有為了圖方便偷偷加 npm 音訊套件 |

以下為使用者指定的橫向 concern，逐條可勾選，並附程式碼／文件依據。

---

## 3. iOS WKWebView 音訊限制

- [x] AudioContext 的 `resume()` 是否在 `pointerdown`/`touchstart`/`keydown` handler 內**同步**呼叫（不要先 `await` 別的 promise 才呼叫），否則 iOS 會判定不是使用者手勢觸發而拒絕解鎖 — `audio-manager.js:159-169` `handleUnlockGesture` 同步呼叫 `ctx.resume()`，promise 僅事後 `.catch()`
- [x] 所有 `<audio>.play()` 呼叫都接 `.catch()`（PRD § 3.3 明訂），尤其 BGM crossfade 雙 `<audio>` 交替播放時兩邊都要包 — `audio-manager.js:308-313` `safePlay()`，`playNextTrack`/`crossfadeToNext`/`resumeMusicPlayback` 全走同一路徑
- [ ] `visibilitychange` 在 iOS WKWebView 不完全可靠，是否真的雙掛 `pagehide` 並在 iOS 實機測過鎖屏／切 App 兩種情境都會觸發暫停 — 程式碼面 `visibilitychange`＋`pagehide` 雙掛正確（`audio-manager.js:186-194,202-203`），但**無 iOS 實機測試紀錄**，需人工補測
- [ ] 電話／Siri 等系統事件搶走音訊焦點造成 AudioContext 進入 `interrupted` 狀態時，回前景是否需要重新 `resume()`（PRD 未明講，屬 known unknown，需開工前決定要不要處理）— **未決策也未實作**：`handleVisibilityVisible`（`audio-manager.js:180-184`）只 resume `<audio>`，未重呼叫 `ctx.resume()`，來電/Siri 中斷後 SFX／語音會靜默卡在 `suspended`
- [ ] COEP `require-corp`（`vite.config.js:1-9`、`ios/App/App/AppDelegate.swift:98-100`）環境下，音檔 fetch／`decodeAudioData` 需在 **iOS 實機**（非僅桌機 Safari）驗證不被擋 — AppDelegate 已設對應 header，程式碼面就緒；但 COEP 下實際 fetch 是否成功**無法從原始碼判定**，需 iOS 實機驗證，目前無測試紀錄
- [x] iOS 內嵌 server（`AppDelegate.swift` `LocalServer.serve`，第 102-104 行）目前只手動修正 `.wasm`／`.js` 的 Content-Type；確認 GCDWebServer 內建 MIME 表對 `.mp3` 是否正確回 `audio/mpeg`，若回 `application/octet-stream` 需比照補一條規則 — `AppDelegate.swift:102-104` 只覆寫 `.wasm`/`.js`；`.mp3` 落到 GCDWebServer 內建 UTType 對映，程式碼層確認會正確回 `audio/mpeg`
- [x] `<audio>` 若觸發 Range request（seek／preload metadata，BGM 檔案較大更容易），確認 `GCDWebServerFileResponse` 的 byteRange 路徑（`AppDelegate.swift:91-92`）跑得通 — `AppDelegate.swift:91-95` `request.hasByteRange()` 已分流到 `GCDWebServerFileResponse(file:byteRange:)`

## 4. 資產載入失敗 fail-soft

- [x] `loadSfxPack` fetch 失敗（404／離線／CORS）整包吞掉不 throw，不中斷遊戲流程 — `audio-manager.js:223-243` 外層 try/catch＋每檔獨立 catch，單檔失敗不影響其他檔、函式不 throw
- [x] `decodeAudioData` 對壞檔／空檔（如生成失敗留下 0 byte mp3）也走 fail-soft，不是印出 console error 後中斷該包其餘音效的載入 — `audio-manager.js:210-221,241` `decodeAudio` 包 Promise+try/catch，壞檔被逐檔 catch 吞掉
- [x] 圍棋四音 fallback 到 `sound.js` 合成的判定時機（載入失敗當下 vs 播放時才發現沒 buffer）是否一致，避免「載入失敗但播放時又嘗試存取 undefined buffer」拋錯 — `audio-manager.js:254-265` 只有播放時單一判定點（`sfxBuffers.get` 落空即走 fallback），無第二個判定時機、不會不一致
- [x] 其餘棋種（無合成 fallback）在「從未載入成功」與「載入中」兩種狀態下，`playSfx`／`playVoice` 都正確 no-op，不讓呼叫端（落子後續處理）因此拋例外 — `audio-manager.js:254-265,267-281` 開頭 gate＋`!buffer` 即 return，兩種狀態一律 no-op
- [ ] BGM `<audio>` 的 `error` event 是否捕捉，避免 crossfade 邏輯卡在等待永遠不會 fire 的 loaded 事件 — **未捕捉**：`attachTrackWatchers`（`audio-manager.js:316-339`）只掛 `timeupdate`／`ended`，全檔無 `error` listener，中途載入/解碼失敗會讓 crossfade／換曲邏輯卡住
- [ ] APP icon 各尺寸（Task 7）若某一尺寸生成／轉檔失敗，是否有驗證步驟避免出現「部分尺寸還是舊圖」的不一致狀態 — 無腳本化驗證，僅人工目視；commit f3dc46c 沒有留下逐尺寸比對紀錄

## 5. localStorage 損壞

- [x] `audio-settings-v1` 讀取比照既有慣例（`gomoku-mode.js:50-58` 模式）：try/catch 包 `JSON.parse` **且**逐欄位型別／範圍驗證（`sfxVolume`／`musicVolume` 需 `0..1` 數字、`sfxOn`／`musicOn` 需 boolean），不是「parse 成功就整包信任」 — `audio-manager.js:85-104`，`isValidUnitVolume` 範圍檢查＋逐欄位 `typeof` 檢查
- [x] PRD Task 3 列的「損壞 localStorage 回預設」測項，需涵蓋「parse 成功但欄位型別／範圍錯誤」（如 `sfxVolume: "abc"` 或 `2.5`），不是只測「parse 失敗（非合法 JSON）」 — `tests/audio-manager.test.js:91-149`，涵蓋 parse 失敗、型別錯、`test.each` 涵蓋 2.5/-1/null、邊界 0/1
- [x] `localStorage.setItem` 寫入失敗（iOS 無痕模式／容量滿）比照既有慣例（`main.js:401`、`main.js:919`）try/catch 吞掉，`AudioSettings.set()` 寫入失敗時畫面仍即時生效，不因此整個操作中斷 — `audio-manager.js:132-138`，`setItem` 獨立 try/catch，套用到後端與廣播不受影響
- [x] 跨分頁／多 WebView 情境：`set()` 廣播的 `audio-settings-changed` 只在同分頁生效（CustomEvent），確認這是刻意決策（單一 WebView 情境下不需要 `storage` event 跨分頁同步）而非遺漏 — `audio-manager.js:111-115`；單頁 App、無多分頁需求，屬合理刻意決策

## 6. 效能（音檔預載時機／記憶體）

- [x] `loadSfxPack(game)` 是「進入該棋種畫面」才 lazy load，確認沒有在 `initAudio()` 或首頁就把六包全部預載 — 各 `enterXxxMode()` 進場時才呼叫（如 `xiangqi-mode.js:706-707`），`initAudio()`／首頁不預載
- [ ] 切換棋種畫面時，先前棋種的 AudioBuffer 是否釋放，還是永久快取；六棋＋common 全部玩過一輪後常駐記憶體大小是否評估過（decodeAudioData 後是未壓縮 PCM，體積遠大於原始 mp3） — **未釋放**：`sfxBuffers`／`loadedPacks`（`audio-manager.js:68-69`）只增不減，且無任何評估記錄留存於文件（實測 20 個 mp3 共約 224KB，解碼後影響應可控，但未走過評估這一步）
- [x] 確認 BGM 走 `<audio>` 串流（非 decodeAudioData），沒有誤用 WebAudio buffer 路徑把 6-10MB 音樂檔整個載進記憶體 — `audio-manager.js:343-359` BGM 走 `backend.createAudio()`（`<audio>` 元素），`decodeAudioData` 只用於 SFX／語音
- [x] Canvas 動畫「僅事件觸發時 requestAnimationFrame」（PRD § 8）：質感精修（Task 14）新增的木紋／紙紋繪製若用 procedural noise 現算而非快取成 offscreen canvas，逐幀重算是否會拖低幀率；落子動畫是否會被誤寫成常駐 rAF loop — `board-texture.js:29-60` 木紋一次繪進 offscreen canvas 並以尺寸 key 快取，逐幀僅 `drawImage`；rAF 僅動畫觸發、自行終止
- [ ] 音效觸發密集情境（覆盤快速操作、AI 連續思考完立即下一手）下，`playSfx` 是否有防止同一音效瞬間疊播爆音的機制 — **無防疊播**：`playSfx`（`audio-manager.js:254-265`）每次呼叫無條件新建 BufferSource；僅 `playVoice` 有 `voicePlaying` Set 節流，`playSfx` 密集觸發會疊音

## 7. 無障礙（prefers-reduced-motion、按鈕 aria）

- [x] 目前全站只有 `ink-fx.js` 尊重 `prefers-reduced-motion`（已 grep 確認），PRD § 8 要求「過場、落子動畫全部尊重」——質感精修（Task 14）新增的所有動畫（落子 scale-in、吃子淡出、面板開合等）是否都補上對應媒體查詢降級，而不是只有既有那一處 — `motion.js` 共用 `prefersReducedMotion`，`ui.js`／`gomoku-ui.js`／`chess-mode.js`／`othello-mode.js`／`shogi-mode.js`／`ink-fx.js` 均引用；`style.css:1580-1587` 另有萬用媒體查詢
- [ ] 新增按鈕（AI 建議、統一常駐功能列圖示化按鈕、設定 modal 音效／音樂開關與 slider）是否有 `aria-label`／開關類 `aria-pressed`／音量控制優先用原生 `<input type="range">`（若改自製 slider 需補 aria） — 音量滑桿正確用原生 `<input type=range>` 且有 `aria-label`（`audio-settings-ui.js:64`）；**但音效／背景音樂開關 checkbox 缺 accessible name**（`audio-settings-ui.js:29-45` `buildToggleRow`：標籤文字是 checkbox 外的 sibling `<span>`，無 `for`／`aria-labelledby`／`aria-label`）
- [x] 禁著點回饋三件套（紅色 X 閃現＋`showToast`＋提示音，PRD § 8.1）是否三者都到位而非只做了視覺（分工到不同 task 容易漏接一件，需交叉確認） — `main.js:322-326` 落子失敗同時觸發 `flashInvalid`＋`showToast`＋`playSfx('invalid-move')`；Playwright 煙煙測試中實測點擊已有子處，toast「此處已有棋子」（role=status, aria-live=assertive）確實出現
- [x] `playVoice`（將軍／王手／Check 語音）對聽障使用者等同無提示，確認既有 `flashCheck` 視覺提示不受此次改動影響（語音是附加，不是取代視覺提示） — `chess-mode.js:159-165`／`shogi-mode.js:197-202`／`xiangqi-mode.js:161-166`，`playVoice` 為附加呼叫，既有視覺提示邏輯原樣保留
- [x] 質感精修加深棋盤木紋／棋子光影後，棋子與盤面在深色區域邊緣的對比是否仍可辨識 — `board-texture.js` 紋理 alpha 僅 0.05-0.13、棋子底色未變，程式碼面無對比退化跡象；仍建議正式環境實機目視複查（主觀項）

## 8. i18n（三語語音檔名）

- [x] 語音檔名與棋種模組內部 `game` identifier 是否對得上（Task 5 對照表：`'xiangqi'`／`'shogi'`／`'chess'` 等字串需與 `loadSfxPack(game)` 呼叫處實際傳入值逐一核對，不要憑印象假設命名一致） — `audio-manager.js:18-26` `GAME_SFX_FILES` 與全部 8 個呼叫點逐一核對，命名一致
- [x] 三棋種語音固定語言（象棋中文／將棋日文／西洋棋英文，PRD § 4.2）是刻意決策而非遺漏——若日後 UI 語言與棋種語音需求分離（例：英文介面使用者玩象棋，語音仍中文）需在 commit message 或文件註記這是設計選擇，避免被誤判為 bug — PRD § 4.2 與本文件皆已明載為刻意決策
- [x] `public/licenses/audio-credits.txt`（Task 1）是否記錄每個語音檔的語言／發音設定，供之後補發音或換語言時查對 — 「二、語音」段落逐檔記錄語言／發音設定
- [x] 新增 UI 文字（設定 modal、`showToast('再虛手一次將進入數目')` 等）全繁體中文，且中文與英文／數字間補半形空白（CLAUDE.md 與 PLAN Global Constraints 皆要求） — 抽查 `main.js`／`audio-settings-ui.js` 新增字串皆繁中，中英/數字間有半形空白

## 9. APP 體積

- [x] BGM 預算上限 8MB（PRD 風險表），Task 2 完工後是否**實際量測**並記錄檔案大小，不是憑生成時的估算；超標時是否已備妥「降為 2 首」或降 bitrate 的退路 — `audio-credits.txt` 記錄約 2.4MB/2.6MB，與 `stat` 實測（2,400,802／2,560,462 bytes）吻合，屬實測非估算，總計約 5MB＜8MB 預算
- [ ] 音效 14 檔＋語音 6 檔（單檔目標 ≤50KB）加總對 APP 體積的累計影響是否也一併記錄，與 BGM、icon 資產一起算入 iOS ipa 總增幅 — 實測 20 檔共約 224KB、單檔皆 ≤25KB 符合規格，但**加總影響未寫入任何文件**，純文件缺口
- [x] `ios/App/App/public/`（build 產物同步流程）是否確實同步 `public/sounds/`、`public/music/` 新目錄——PLAN 明訂不可手動改該目錄，需確認既有 sync 腳本/流程不是靠寫死的檔案清單而漏掉新目錄 — `scripts/ios-deploy.sh` 整目錄複製鏈（`public`→`dist`→`cap copy ios`），非寫死清單
- [ ] 新增 6-10MB 音樂後，App Store 上傳體積是否跨過任何門檻（如 cellular download 限制），若目前總體積已接近門檻需特別確認 — **無評估紀錄**，PREFLIGHT 原文此題目前仍是未關閉的問句

## 10. 快取（`public/sw.js`，歷史上發生過 SW 快取吃舊檔的回歸）

> 歷史回歸提醒：`818e7fd`（SW 永遠無法更新導致標題圖被舊 SW 漏接）、`4375138`（CDN 將標題圖快取成 HTML 導致毛筆字消失）、`cf4fa8b`（cache-busting 根治）、`b7be960`（修正 SW 快取最新 app shell）。本次新增大量新資產類型（mp3），不能想當然爾沿用「反正每次部署 CACHE_NAME 都變」的樂觀假設，需逐條驗證。

- [x] **確認 Task 2／5／6 沒有把 `public/sounds/*.mp3`、`public/music/*.mp3` 加進 `PRECACHE_ASSETS`**（`sw.js:3-14`）。PRD 設計是 lazy load，理應不預載；但 `cache.addAll()`（`sw.js:40`）是 all-or-nothing，若刻意或誤加且其中一檔 404／逾時，會讓整個 SW install 失敗（不是「這幾個新檔案沒快取」，而是「SW 完全裝不上去」） — 已用 `grep -n "mp3\|sounds\|music" public/sw.js` 確認 **0 命中**；`PRECACHE_ASSETS`（`sw.js:3-14`）只有 `index.html`／`rules.js`／`game-state.js`／`ui.js`／`manifest.json`／icon／`version.json`，BGM 與音效皆不在預快取清單
- [ ] 新增的 `audio-manager.js`（及若拆出的 `audio-settings-ui.js`）是否需要加進 `shouldRefreshFirst`（`sw.js:24-36`）清單？目前該清單只有 `ui.js`／`game-state.js`／`rules.js`／`manifest.json`／`index.html`／`sw.js` 六項，其餘 JS（含 `main.js` 本身）都落在純 cache-first 尾端（`sw.js:79-90`）——需確認這個既有落差是否也套用在新檔案上是可接受的（因為 `CACHE_NAME` 隨 commit 變動、每次部署整包重建，理論上沒問題，但要跟上述歷史回歸放一起交叉檢查，不能只憑理論推論） — 未加入，且落差是否可接受未有明確結論；**額外發現**：`shouldRefreshFirst`／`PRECACHE_ASSETS` 引用的 `./rules.js`／`./game-state.js`／`./ui.js` 等裸路徑，在 Vite 遷移（commit 1452dd2）後正式 build 只會產出 `dist/assets/main-*.js`，這些條目在正式環境已 404，整個 precache 機制疑似已失效（非本批引入，但本批新增資產也受影響，值得另開票）
- [x] `generate-version.js:56` 的 `?v=` cache-busting 正則只重寫「HTML 中原本就帶 `?v=` 的資產參照」——若新增對 `audio-manager.js` 的 `<script>`／動態 import，確認是否也依既有慣例帶了 `?v=` query（與 `ui.js`／`rules.js` 一致），否則該檔不受版本控制、純靠 SW cache 名稱輪替 — `audio-manager.js`／`audio-settings-ui.js` 皆為 ES module `import`，經 Vite 打進內容雜湊 bundle，非獨立 `<script>` tag，無 `?v=` 漏網對象
- [x] 部署流程（Zeabur／Cloudflare Pages）是否每個環境都會跑 `generate-version.js`（`CACHE_NAME` 靠這支腳本注入才會隨 commit 變動）——若日後單獨覆蓋某個 mp3（例如重新生成失敗的音效）卻沒跑過這支腳本，`CACHE_NAME` 不變，舊裝置會卡舊音檔 — `package.json:6`（`build` script 內含 `generate-version.js && vite build`）、`Dockerfile`（`npm run build`）、`scripts/ios-deploy.sh` 三個部署路徑皆會跑
- [ ] iOS App 內嵌 server（`AppDelegate.swift:101` `cacheControlMaxAge = 0`）完全不快取，這條路徑不受 `sw.js` 影響——確認 Capacitor iOS 是否真的略過 Service Worker 註冊，不要把「iOS App 內嵌 server 的新鮮度」與「Web 版 SW 快取」的驗收混為一談（對應 PRD § 3.3 最後一句提醒） — `main.js:1189-1204`：SW 略過僅靠 `_isLocalDev`（hostname 為 `localhost`/`127.0.0.1`/`[::1]`）判斷，因 `capacitor.config.json` 設 `server.url: "http://localhost:3333"` 而剛好命中、SW 確實被略過，但**這是巧合性防護，不是明確的 Capacitor/iOS 平台判斷**，建議補一個顯式條件並找機會實機確認

## 11. 測試盲區

- [x] `jest.config.js` 的 `testEnvironment: 'node'`（非 jsdom）——audio-manager 測試完全依賴 PRD Task 3 設計的可注入 backend（`_setBackendForTest`），確認斷言是「backend 方法真的被呼叫／沒被呼叫」而非只斷言「沒有 throw」，避免假陽性 — `tests/audio-manager.test.js` 絕大多數斷言為 `toHaveBeenCalled(With/Times)` 打在 mock backend 方法上，僅少數輔以 `not.toThrow`（同測試另有實質斷言，非唯一斷言）
- [ ] iOS 實機專屬行為（AudioContext 解鎖、背景暫停恢復、來電中斷、BGM 背景行為）無法被 Jest 或桌面瀏覽器 Playwright 覆蓋——PRD § 9 已列為手動驗證項，但 Task 5／6 的完工 checklist 只寫「`npx jest` 全綠＋vite 煙霧測試」，沒有強制 iOS 實機這一步；確認執行計畫真的排了實機測試時段，不是「Jest 全綠」就視為完工 — 全 `docs/` 無實機測試排程或執行紀錄，需手動補排
- [ ] 引擎序列化佇列（Task 8）測試用 mock engine process——真實 Fairy-Stockfish WASM 在建議走法（hint）與對弈 AI（bestMove）真正併發時的行為（尤其 iOS 多執行緒／SharedArrayBuffer 環境）是否有煙霧測試涵蓋，還是只驗證了單元測試層級的呼叫順序，未涵蓋原始 bug 情境（互搶輸出） — `tests/engine-queue.test.js` 全走 mock engine（`createMockStockfish`），無真實併發（hint＋覆盤＋對弈同時觸發）的整合層級測試
- [ ] 圍棋禁著點回饋（Task 12）與終局邊界修正（Task 13）的失敗測試是否涵蓋「取消數目→虛手一次→改為正常落子（非虛手）」的混合情境，不是只測「取消數目→連續虛手兩次」單一路徑 — `tests/game-state.test.js:281-292` 測到「取消數目→單次虛手→`endedByDoublePass:false`」即止，未接續驗證「改為正常落子」這一段
- [ ] `prefers-reduced-motion` 沒有自動化測試手段（CSS media query 在 node 環境測不到）——是否至少有手動 checklist（DevTools 模擬 `prefers-reduced-motion: reduce`）覆蓋 Task 14 所有新動畫，而非只驗證 `ink-fx.js` 既有那處 — 無逐動畫的手動 checklist 紀錄
- [ ] 六棋版面一致化（Task 10）跨很多檔案，`npx jest` 綠燈只保證既有單元測試沒壞，不保證「按鈕順序／資訊列欄位」符合 PRD § 7 表格——是否有逐棋截圖比對或至少人工核對表格逐項打勾的步驟 — 無逐棋截圖比對或表格核對紀錄留存於文件（本次自查已用 Playwright 對六棋逐一截圖驗證資訊列，但未沉澱為正式文件）
- [ ] APP icon（Task 7）「Xcode asset catalog 實際 build 確認」這一步是否真的排進驗收，而非只是把 PNG 複製進資料夾就視為完成（PRD 已明講這個陷阱，此處是再次確認沒被跳過） — 與 4.6 同一缺口：無腳本化或人工紀錄證明有實際跑過 Xcode build 逐尺寸核對，見 4.6

---

## 反例提醒（沿用 skill 反例）

- 不要把本清單當「全清單一律跑」——上表已依 feature 屬性挑出適用段落，A／C／D／F／G／H／I 已標「不適用」並附理由，不用重新逐條論證
- 完工自查時第一個問題是「有沒有越界做了 Non-scope 的事」（深色模式／五子棋黑白棋 AI／3D 棋盤／線上對戰）
- 完工 review 不可略過——iOS 實機驗證與 SW 快取交叉檢查是本文件最容易被跳過、也最容易造成回歸的兩段

## 自查結果 (2026-07-02)

**範圍**：`git diff 08caf1d..HEAD`（commits bbc145e..1aa14b6，音訊系統／APP icon／功能一致化／質感精修全批）。
**統計**：Step 1 屬性標記 9/9 適用；第 3–11 節共 47 條，29 條通過、0 條 N/A、**18 條未通過**（其中 3 條屬「程式碼面已確認、但仍需 iOS 實機才能最終驗收」，不算程式碼缺陷）。

Non-scope 檢查：未發現深色模式／五子棋或黑白棋 AI 提示／3D 棋盤／線上對戰的越界改動。

### 未通過項與建議修法

**A. 需要人工／iOS 實機驗證（程式碼面已就緒，非缺陷）**
1. §3 `visibilitychange`／`pagehide` 鎖屏切 App 情境 — 補排 iOS 實機測試時段，涵蓋鎖屏、切換 App 兩種情境各測一次。
2. §3 COEP `require-corp` 下音檔 fetch／decodeAudioData — 同上，需在 iOS 實機（非桌機 Safari）驗證。
3. §11 iOS 實機專屬行為整體 — `docs/PLAN-audio-visual-parity.md` 應補一個「iOS 實機驗收」段落並記錄執行時間，不能讓「`npx jest` 全綠」代表完工。

**B. 真實程式碼缺口（建議修法，未動手改）**
4. §3 電話／Siri 搶走音訊焦點回前景後未重新 `resume() AudioContext` — `audio-manager.js:180-184` `handleVisibilityVisible` 補一段：`musicOn` 之外，若 `ctx?.state === 'suspended'` 也呼叫 `ctx.resume()`。
5. §4 BGM `<audio>` 無 `error` event 監聽 — `attachTrackWatchers`（`audio-manager.js:316-339`）補掛 `el.addEventListener('error', ...)`，失敗時比照 `ended` 路徑改用 `playNextTrack()` 補救，避免 crossfade 永久卡住。
6. §6 `playSfx` 無防疊播機制 — 比照 `playVoice` 的 `voicePlaying` Set 節流模式，替 `playSfx` 加同名／同時間窗節流（例如 100ms 內同名不重播）。
7. §7 設定 modal 音效／背景音樂開關 checkbox 缺 accessible name — `audio-settings-ui.js:29-45` `buildToggleRow` 的 `<input type=checkbox>` 補 `aria-label`（或把可見文字 `<span>` 併入 `<label>` 內）。
8. §10 SW 略過註冊僅靠 `_isLocalDev` hostname 巧合命中 `localhost:3333` — `main.js:1189-1204` 建議改用明確條件（如偵測 `window.Capacitor` 或 `capacitor://` scheme），避免未來內嵌 server 埠號／host 一改就悄悄失效。額外發現：`public/sw.js` 的 `PRECACHE_ASSETS`／`shouldRefreshFirst` 引用的裸檔名路徑（`./rules.js` 等）在 Vite build 產物中不存在，precache 機制疑似整批失效，建議另開票排查（非本批引入）。
9. §11 引擎序列化佇列（Task 8）只有 mock engine 單元測試，缺真實 Fairy-Stockfish WASM 併發（hint／覆盤／對弈同時觸發）的整合層級驗證 — 建議至少手動用 Playwright 對真實引擎跑一次「建議走法途中立即悔棋再建議」之類的併發情境，確認輸出不互搶。

**C. 文件／流程缺口（不影響程式行為，補記錄即可）**
10. §4／§11 APP icon 各尺寸生成失敗缺驗證步驟，也未排進 Xcode asset catalog 實際 build 確認 — 建議在 `scripts/ios-deploy.sh` 或 README 補一段「Xcode asset catalog build 後逐尺寸目視」的勾選步驟。
11. §6 AudioBuffer 切換棋種未釋放、無常駐記憶體評估紀錄 — 補一次量測（六棋＋common 全玩過一輪後 `performance.memory` 或 Chrome DevTools Memory 快照），寫進 `docs/PRD-audio-visual-parity.md` 風險表。
12. §9 音效＋語音加總體積、App Store 上傳門檻評估 — 補一行記錄（實測約 224KB，遠低於門檻），關閉 PREFLIGHT 原文兩個問句。
13. §11 圍棋「取消數目→虛手一次→改為正常落子」混合情境測試只做一半 — `tests/game-state.test.js:281-292` 之後補一段 `applyMove` 呼叫與斷言，驗證能正常落子且不誤判終局。
14. §11 `prefers-reduced-motion` 與六棋版面一致化缺逐項人工核對紀錄 — 建議各補一份簡短 checklist（可用本次 Playwright 截圖為底稿）存進 `docs/`。

### 三項重點指定驗證結果

- **sw.js `PRECACHE_ASSETS` 是否誤加音檔**：`grep -n "mp3\|sounds\|music" public/sw.js` 結果為 0 命中，`PRECACHE_ASSETS`（`sw.js:3-14`）未包含任何 `public/sounds/*.mp3`／`public/music/*.mp3` — **通過**。
- **audio-manager 逐欄位驗證存在且有測試**：`audio-manager.js:85-104`（`isValidUnitVolume` ＋逐欄位 `typeof`）＋`tests/audio-manager.test.js:91-149`（涵蓋 parse 失敗、型別錯、範圍外、邊界值）— **通過**。
- **BGM 不在預快取**：同第一項，`PRECACHE_ASSETS` 無 `bgm-*.mp3` 條目；BGM 走 `loadSfxPack`／`startMusic` 於進入棋種畫面後才 lazy 建立 `<audio>` 元素播放，非 SW 預快取 — **通過**。
