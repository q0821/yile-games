# 引擎升級計畫：GnuGo → KataGo（瀏覽器內 / 純前端）

撰於 2026-06-05。決策：採「路 B」——用 KataGo 取代 GnuGo，維持**純前端、免後端**。

## 為什麼（根因）

本專案多項功能被移除或受限，幾乎同源於**GnuGo 太弱（約 5–6 級）＋ 此 WASM build 的 `score()` 失效**：
失目評分、形勢曲線、AI 覆盤分析、新手引導、讓子（S6 暫緩）、死活後續手判定（S7 風險）。
換上能給**可靠勝率／領地／每手評估**的 KataGo，等於一次性誠實地解開這一整票。

## 可行性（已查證，2026-06）

- **KataGo → ONNX 已是成熟路徑**：`kaya-go/kaya`（HuggingFace）提供 KataGo 轉 ONNX，含 `fp32 / fp16 / uint8`（uint8 約小 4 倍）。
  - 輸入：`bin_input [1,22,19,19]`（22 個棋盤特徵平面）＋ `global_input [1,19]`。
  - 輸出：`policy`（著手機率）、`value`（勝率）、`ownership`（領地）、`scoring`…＝著手＋誠實形勢。
  - 以 `onnxruntime-web` 載入（`InferenceSession.create`），後端可選 **WebGPU（快 3–10×）/ WASM（fallback）**。
  - ⚠️ kaya 只放 **b28c512 大網路（數百 MB，手機不可行）** → 我們需自備**小網路**（b6/b10/b18）。
- **Web KaTrain（`Sir-Teo/web-katrain`，2026-01-27 開源）**：瀏覽器內 KataGo 分析（TF.js + WebGPU/WASM），
  作者稱「在 iPhone 上跑得不錯」→ 活生生的可行案例與可參考的特徵編碼/推論寫法。

## 架構（目標）

```
主執行緒 (UI)  ──postMessage──▶  Web Worker
                                  ├─ onnxruntime-web（WebGPU 主、WASM fallback）
                                  ├─ 小 KataGo 網路（uint8 ONNX，放 public/，靜態快取）
                                  ├─ JS 特徵編碼（22 bin planes + 19 global）  ← 最關鍵
                                  └─ 著手：raw policy（+ 可選輕量 MCTS/playout）
回傳：bestMove、winrate、ownership（領地）、每手失分 → 復活分析類功能、強對手、讓子
```

## 主要風險 / 難點（依風險排序）

1. **特徵編碼忠實度**（最關鍵）：必須**逐平面**比照 KataGo 的 `bin_input`/`global_input` 定義，
   差一點輸出就是垃圾。對策：對照 KataGo `nninputs.cpp` 規格，或移植 web-katrain 的編碼，
   並用「已知盤面 → 比對 KataGo 桌面版同盤面的 policy/value」驗證。
2. **行動裝置：模型大小 × 推論速度 × 記憶體**：用**小網路 + uint8**、優先 WebGPU。需實測 iPhone。
3. **模型取得/轉檔**：kaya 只有 b28；要拿小網路（KataGo 釋出的 b6/b10/b18 checkpoint）跑 pytorch→onnx 匯出，
   或找現成小 ONNX。模型檔不宜進 git（大）；考慮放 CDN / release asset，執行時下載並快取。
4. **棋力來源**：KataGo 強在「網路 + MCTS」。先用 **raw policy + value**（已是強業餘、且勝率/領地可靠），
   之後再視效能加輕量搜尋。
5. **授權**：KataGo 程式碼 MIT；網路權重有其釋出條款 → 使用前確認可再散布。

## Spike（先做、可量化，再決定要不要做全套）

> 目標：用**最小可行**證明「小 KataGo 網路能在手機瀏覽器跑得夠快、編碼正確」。

- **S-1 取得模型**：選一個小網路（建議先 b18c384 或更小 b10c128），轉 uint8 ONNX，放 `public/`（或 CDN）。
- **S-2 最小推論 worker**：onnxruntime-web 載入該 ONNX，對單一盤面跑一次 `session.run`。
  量測：**模型下載大小、初始化時間、單次推論時間（WebGPU vs WASM）、記憶體**——桌機 + **真 iPhone**。
- **S-3 特徵編碼驗證**：對一個已知盤面正確產生 22+19 輸入，檢查 policy 最高手合理（sanity check），
  並與 KataGo 桌面版同盤面比對 value/policy。
- **決策閘**：若手機單手推論 < ~1–2s、模型可接受大小、編碼驗證通過 → 綠燈做全套；
  否則改更小網路 / 只用 WASM / 或暫緩。

## 全套整合（spike 綠燈後，多階段）

1. `katago-service.js`（對應現有 `gnugo-service.js` 介面：genmove / analyze）+ worker。
2. 對弈：用 KataGo 當對手（可調強度＝搜尋量/加噪），**讓子**（S6）變得有意義。
3. 誠實復活：覆盤每手失分（policy/winrate 落差）、形勢曲線（winrate/ownership）、領地圖。
4. 死活 S7：用強引擎當防守方，判定可靠。
5. 視情況保留 GnuGo 當「輕量/離線 fallback」或直接淘汰。

## 工作量

- Spike：約 1–2 個工作階段（瓶頸在取得小網路 + 寫對特徵編碼）。
- 全套：多階段、跨多個工作階段。

## 更新（2026-06-05 web-katrain 原始碼調查 → 改用「重用」策略）

調查 `Sir-Teo/web-katrain`（**MIT 授權**）後，結論大幅降低風險：它已是一套**完整、框架無關（跑在 Web Worker）**
的瀏覽器 KataGo 引擎，`src/engine/katago/` 內含我們最需要的全部零件：

| 檔案 | 作用 | 對我們的意義 |
|---|---|---|
| `featuresV7.ts` / `featuresV7Fast.ts` | KataGo 輸入特徵編碼（22+global 平面） | **最痛的風險①直接解決**（不必自己逐平面比照） |
| `binModelParser.ts` | 直接解析 KataGo 原生 `.bin.gz` 權重 | **不需 ONNX 轉檔**（風險③消失） |
| `loadModelV8 / modelV8 / evalV8` | 用 TensorFlow.js 建模與推論 | 直接重用 |
| `analyzeMcts.ts` / `searchParams.ts` | 輕量 MCTS / 搜尋參數（可調強度） | 對手強度、讓子可用 |
| `backendFallback.ts` | WebGPU → WASM → CPU 後端 fallback | 行動裝置相容 |
| `worker.ts` | 推論 Worker | 直接重用 |

**策略改為「重用 web-katrain 引擎模組」**（vendor 進來，或當依賴），而非自己寫 ONNX 編碼：
- 路線從「ONNX + 自寫特徵編碼」改成「**`.bin.gz` + TF.js（web-katrain 引擎）**」。
- 我們的 app 是 vanilla JS + Vite；Vite 原生支援 TS，可直接 import 該 TS 引擎模組（引擎不依賴 React）。

**剩下的真實未知（spike 要量）：**
1. **模型大小 × 行動裝置效能**：web-katrain 預設「tiny 測試網路」（很弱、開得快）；實用是 b18c384（**~96MB，手機太大**）。
   我們要找**中間的小網路**（b6c96 / b10c128，KataGo 有釋出），量它在 iPhone 的下載大小與每手秒數。**無公開手機數據 → 必須實測。**
2. **把 TS 引擎整進我們的 Vite 專案**（建置設定、Worker 打包）。

**修正後的 spike：** vendor web-katrain 的 `engine/katago/` + 選一個小網路 → 做一頁會把
「後端(WebGPU/WASM)、模型大小、初始化時間、單手推論時間」**顯示在畫面上**的測試頁 → 部署 → **你用 iPhone 實測** → 過決策閘。

## 相關連結

- KataGo：https://github.com/lightvector/KataGo
- kaya（KataGo→ONNX）：https://huggingface.co/kaya-go/kaya
- Web KaTrain（參考實作）：https://github.com/Sir-Teo/web-katrain
- onnxruntime Web 文件：https://onnxruntime.ai/docs/tutorials/web/
