# Preflight Checklist：音訊系統、APP icon、功能一致化與質感精修

> 依 `~/.claude/skills/preflight-feature/SKILL.md` 產出。開工前（P1 動工前）跑一輪，完工後（P4 結束、總驗證前）同一份再跑一輪，未打勾項目連同證據（測試輸出／程式碼行號／實機截圖）回報。
> 規格唯一來源：`docs/PRD-audio-visual-parity.md`；任務拆解：`docs/PLAN-audio-visual-parity.md`。

## Step 1：Feature 屬性

- [ ] 新增前端模組／檔案（`audio-manager.js` 等）
- [ ] 讀寫 localStorage（`audio-settings-v1`）
- [ ] 前台使用者操作（設定 modal、按鈕、slider）
- [ ] 效能敏感（音檔預載、Canvas 動畫、AudioBuffer 記憶體）
- [ ] 無障礙相關（動效、按鈕、純音訊提示）
- [ ] 多語系（三棋種語音固定語言）
- [ ] iOS 平台特有限制（WKWebView 音訊解鎖、內嵌 HTTP server、COOP/COEP）
- [ ] 快取／Service Worker（`public/sw.js`）
- [ ] APP 體積／資產打包
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

- [ ] AudioContext 的 `resume()` 是否在 `pointerdown`/`touchstart`/`keydown` handler 內**同步**呼叫（不要先 `await` 別的 promise 才呼叫），否則 iOS 會判定不是使用者手勢觸發而拒絕解鎖
- [ ] 所有 `<audio>.play()` 呼叫都接 `.catch()`（PRD § 3.3 明訂），尤其 BGM crossfade 雙 `<audio>` 交替播放時兩邊都要包
- [ ] `visibilitychange` 在 iOS WKWebView 不完全可靠，是否真的雙掛 `pagehide` 並在 iOS 實機測過鎖屏／切 App 兩種情境都會觸發暫停
- [ ] 電話／Siri 等系統事件搶走音訊焦點造成 AudioContext 進入 `interrupted` 狀態時，回前景是否需要重新 `resume()`（PRD 未明講，屬 known unknown，需開工前決定要不要處理）
- [ ] COEP `require-corp`（`vite.config.js:1-9`、`ios/App/App/AppDelegate.swift:98-100`）環境下，音檔 fetch／`decodeAudioData` 需在 **iOS 實機**（非僅桌機 Safari）驗證不被擋
- [ ] iOS 內嵌 server（`AppDelegate.swift` `LocalServer.serve`，第 102-104 行）目前只手動修正 `.wasm`／`.js` 的 Content-Type；確認 GCDWebServer 內建 MIME 表對 `.mp3` 是否正確回 `audio/mpeg`，若回 `application/octet-stream` 需比照補一條規則
- [ ] `<audio>` 若觸發 Range request（seek／preload metadata，BGM 檔案較大更容易），確認 `GCDWebServerFileResponse` 的 byteRange 路徑（`AppDelegate.swift:91-92`）跑得通

## 4. 資產載入失敗 fail-soft

- [ ] `loadSfxPack` fetch 失敗（404／離線／CORS）整包吞掉不 throw，不中斷遊戲流程
- [ ] `decodeAudioData` 對壞檔／空檔（如生成失敗留下 0 byte mp3）也走 fail-soft，不是印出 console error 後中斷該包其餘音效的載入
- [ ] 圍棋四音 fallback 到 `sound.js` 合成的判定時機（載入失敗當下 vs 播放當下才發現沒 buffer）是否一致，避免「載入失敗但播放時又嘗試存取 undefined buffer」拋錯
- [ ] 其餘棋種（無合成 fallback）在「從未載入成功」與「載入中」兩種狀態下，`playSfx`／`playVoice` 都正確 no-op，不讓呼叫端（落子後續處理）因此拋例外
- [ ] BGM `<audio>` 的 `error` event 是否捕捉，避免 crossfade 邏輯卡在等待永遠不會 fire 的 loaded 事件
- [ ] APP icon 各尺寸（Task 7）若某一尺寸生成／轉檔失敗，是否有驗證步驟避免出現「部分尺寸還是舊圖」的不一致狀態

## 5. localStorage 損壞

- [ ] `audio-settings-v1` 讀取比照既有慣例（`gomoku-mode.js:50-58` 模式）：try/catch 包 `JSON.parse` **且**逐欄位型別／範圍驗證（`sfxVolume`／`musicVolume` 需 `0..1` 數字、`sfxOn`／`musicOn` 需 boolean），不是「parse 成功就整包信任」
- [ ] PRD Task 3 列的「損壞 localStorage 回預設」測項，需涵蓋「parse 成功但欄位型別／範圍錯誤」（如 `sfxVolume: "abc"` 或 `2.5`），不是只測「parse 失敗（非合法 JSON）」
- [ ] `localStorage.setItem` 寫入失敗（iOS 無痕模式／容量滿）比照既有慣例（`main.js:401`、`main.js:919`）try/catch 吞掉，`AudioSettings.set()` 寫入失敗時畫面仍即時生效，不因此整個操作中斷
- [ ] 跨分頁／多 WebView 情境：`set()` 廣播的 `audio-settings-changed` 只在同分頁生效（CustomEvent），確認這是刻意決策（單一 WebView 情境下不需要 `storage` event 跨分頁同步）而非遺漏

## 6. 效能（音檔預載時機／記憶體）

- [ ] `loadSfxPack(game)` 是「進入該棋種畫面」才 lazy load，確認沒有在 `initAudio()` 或首頁就把六包全部預載
- [ ] 切換棋種畫面時，先前棋種的 AudioBuffer 是否釋放，還是永久快取；六棋＋common 全部玩過一輪後常駐記憶體大小是否評估過（decodeAudioData 後是未壓縮 PCM，體積遠大於原始 mp3）
- [ ] 確認 BGM 走 `<audio>` 串流（非 decodeAudioData），沒有誤用 WebAudio buffer 路徑把 6-10MB 音樂檔整個載進記憶體
- [ ] Canvas 動畫「僅事件觸發時 requestAnimationFrame」（PRD § 8）：質感精修（Task 14）新增的木紋／紙紋繪製若用 procedural noise 現算而非快取成 offscreen canvas，逐幀重算是否會拖低幀率；落子動畫是否會被誤寫成常駐 rAF loop
- [ ] 音效觸發密集情境（覆盤快速操作、AI 連續思考完立即下一手）下，`playSfx` 是否有防止同一音效瞬間疊播爆音的機制

## 7. 無障礙（prefers-reduced-motion、按鈕 aria）

- [ ] 目前全站只有 `ink-fx.js` 尊重 `prefers-reduced-motion`（已 grep 確認），PRD § 8 要求「過場、落子動畫全部尊重」——質感精修（Task 14）新增的所有動畫（落子 scale-in、吃子淡出、面板開合等）是否都補上對應媒體查詢降級，而不是只有既有那一處
- [ ] 新增按鈕（AI 建議、統一常駐功能列圖示化按鈕、設定 modal 音效／音樂開關與 slider）是否有 `aria-label`／開關類 `aria-pressed`／音量控制優先用原生 `<input type="range">`（若改自製 slider 需補 aria）
- [ ] 禁著點回饋三件套（紅色 X 閃現＋`showToast`＋提示音，PRD § 8.1）是否三者都到位而非只做了視覺（分工到不同 task 容易漏接一件，需交叉確認）
- [ ] `playVoice`（將軍／王手／Check 語音）對聽障使用者等同無提示，確認既有 `flashCheck` 視覺提示不受此次改動影響（語音是附加，不是取代視覺提示）
- [ ] 質感精修加深棋盤木紋／棋子光影後，棋子與盤面在深色區域邊緣的對比是否仍可辨識

## 8. i18n（三語語音檔名）

- [ ] 語音檔名與棋種模組內部 `game` identifier 是否對得上（Task 5 對照表：`'xiangqi'`／`'shogi'`／`'chess'` 等字串需與 `loadSfxPack(game)` 呼叫處實際傳入值逐一核對，不要憑印象假設命名一致）
- [ ] 三棋種語音固定語言（象棋中文／將棋日文／西洋棋英文，PRD § 4.2）是刻意決策而非遺漏——若日後 UI 語言與棋種語音需求分離（例：英文介面使用者玩象棋，語音仍中文）需在 commit message 或文件註記這是設計選擇，避免被誤判為 bug
- [ ] `public/licenses/audio-credits.txt`（Task 1）是否記錄每個語音檔的語言／發音設定，供之後補發音或換語言時查對
- [ ] 新增 UI 文字（設定 modal、`showToast('再虛手一次將進入數目')` 等）全繁體中文，且中文與英文／數字間補半形空白（CLAUDE.md 與 PLAN Global Constraints 皆要求）

## 9. APP 體積

- [ ] BGM 預算上限 8MB（PRD 風險表），Task 2 完工後是否**實際量測**並記錄檔案大小，不是憑生成時的估算；超標時是否已備妥「降為 2 首」或降 bitrate 的退路
- [ ] 音效 14 檔＋語音 6 檔（單檔目標 ≤50KB）加總對 APP 體積的累計影響是否也一併記錄，與 BGM、icon 資產一起算入 iOS ipa 總增幅
- [ ] `ios/App/App/public/`（build 產物同步流程）是否確實同步 `public/sounds/`、`public/music/` 新目錄——PLAN 明訂不可手動改該目錄，需確認既有 sync 腳本/流程不是靠寫死的檔案清單而漏掉新目錄
- [ ] 新增 6-10MB 音樂後，App Store 上傳體積是否跨過任何門檻（如 cellular download 限制），若目前總體積已接近門檻需特別確認

## 10. 快取（`public/sw.js`，歷史上發生過 SW 快取吃舊檔的回歸）

> 歷史回歸提醒：`818e7fd`（SW 永遠無法更新導致標題圖被舊 SW 漏接）、`4375138`（CDN 將標題圖快取成 HTML 導致毛筆字消失）、`cf4fa8b`（cache-busting 根治）、`b7be960`（修正 SW 快取最新 app shell）。本次新增大量新資產類型（mp3），不能想當然爾沿用「反正每次部署 CACHE_NAME 都變」的樂觀假設，需逐條驗證。

- [ ] **確認 Task 2／5／6 沒有把 `public/sounds/*.mp3`、`public/music/*.mp3` 加進 `PRECACHE_ASSETS`**（`sw.js:3-14`）。PRD 設計是 lazy load，理應不預載；但 `cache.addAll()`（`sw.js:40`）是 all-or-nothing，若刻意或誤加且其中一檔 404／逾時，會讓整個 SW install 失敗（不是「這幾個新檔案沒快取」，而是「SW 完全裝不上去」）
- [ ] 新增的 `audio-manager.js`（及若拆出的 `audio-settings-ui.js`）是否需要加進 `shouldRefreshFirst`（`sw.js:24-36`）清單？目前該清單只有 `ui.js`／`game-state.js`／`rules.js`／`manifest.json`／`index.html`／`sw.js` 六項，其餘 JS（含 `main.js` 本身）都落在純 cache-first 尾端（`sw.js:79-90`）——需確認這個既有落差是否也套用在新檔案上是可接受的（因為 `CACHE_NAME` 隨 commit 變動、每次部署整包重建，理論上沒問題，但要跟上述歷史回歸放一起交叉檢查，不能只憑理論推論）
- [ ] `generate-version.js:56` 的 `?v=` cache-busting 正則只重寫「HTML 中原本就帶 `?v=` 的資產參照」——若新增對 `audio-manager.js` 的 `<script>`／動態 import，確認是否也依既有慣例帶了 `?v=` query（與 `ui.js`／`rules.js` 一致），否則該檔不受版本控制、純靠 SW cache 名稱輪替
- [ ] 部署流程（Zeabur／Cloudflare Pages）是否每個環境都會跑 `generate-version.js`（`CACHE_NAME` 靠這支腳本注入才會隨 commit 變動）——若日後單獨覆蓋某個 mp3（例如重新生成失敗的音效）卻沒跑過這支腳本，`CACHE_NAME` 不變，舊裝置會卡舊音檔
- [ ] iOS App 內嵌 server（`AppDelegate.swift:101` `cacheControlMaxAge = 0`）完全不快取，這條路徑不受 `sw.js` 影響——確認 Capacitor iOS 是否真的略過 Service Worker 註冊，不要把「iOS App 內嵌 server 的新鮮度」與「Web 版 SW 快取」的驗收混為一談（對應 PRD § 3.3 最後一句提醒）

## 11. 測試盲區

- [ ] `jest.config.js` 的 `testEnvironment: 'node'`（非 jsdom）——audio-manager 測試完全依賴 PRD Task 3 設計的可注入 backend（`_setBackendForTest`），確認斷言是「backend 方法真的被呼叫／沒被呼叫」而非只斷言「沒有 throw」，避免假陽性
- [ ] iOS 實機專屬行為（AudioContext 解鎖、背景暫停恢復、來電中斷、BGM 背景行為）無法被 Jest 或桌面瀏覽器 Playwright 覆蓋——PRD § 9 已列為手動驗證項，但 Task 5／6 的完工 checklist 只寫「`npx jest` 全綠＋vite 煙霧測試」，沒有強制 iOS 實機這一步；確認執行計畫真的排了實機測試時段，不是「Jest 全綠」就視為完工
- [ ] 引擎序列化佇列（Task 8）測試用 mock engine process——真實 Fairy-Stockfish WASM 在建議走法（hint）與對弈 AI（bestMove）真正併發時的行為（尤其 iOS 多執行緒／SharedArrayBuffer 環境）是否有煙霧測試涵蓋，還是只驗證了單元測試層級的呼叫順序，未涵蓋原始 bug 情境（互搶輸出）
- [ ] 圍棋禁著點回饋（Task 12）與終局邊界修正（Task 13）的失敗測試是否涵蓋「取消數目→虛手一次→改為正常落子（非虛手）」的混合情境，不是只測「取消數目→連續虛手兩次」單一路徑
- [ ] `prefers-reduced-motion` 沒有自動化測試手段（CSS media query 在 node 環境測不到）——是否至少有手動 checklist（DevTools 模擬 `prefers-reduced-motion: reduce`）覆蓋 Task 14 所有新動畫，而非只驗證 `ink-fx.js` 既有那處
- [ ] 六棋版面一致化（Task 10）跨很多檔案，`npx jest` 綠燈只保證既有單元測試沒壞，不保證「按鈕順序／資訊列欄位」符合 PRD § 7 表格——是否有逐棋截圖比對或至少人工核對表格逐項打勾的步驟
- [ ] APP icon（Task 7）「Xcode asset catalog 實際 build 確認」這一步是否真的排進驗收，而非只是把 PNG 複製進資料夾就視為完成（PRD 已明講這個陷阱，此處是再次確認沒被跳過）

---

## 反例提醒（沿用 skill 反例）

- 不要把本清單當「全清單一律跑」——上表已依 feature 屬性挑出適用段落，A／C／D／F／G／H／I 已標「不適用」並附理由，不用重新逐條論證
- 完工自查時第一個問題是「有沒有越界做了 Non-scope 的事」（深色模式／五子棋黑白棋 AI／3D 棋盤／線上對戰）
- 完工 review 不可略過——iOS 實機驗證與 SW 快取交叉檢查是本文件最容易被跳過、也最容易造成回歸的兩段
