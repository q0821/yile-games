# Vendored: Fairy-Stockfish (WASM) — 象棋引擎

- **套件**：`fairy-stockfish-nnue.wasm`
- **版本**：1.1.11
- **來源**：https://github.com/fairy-stockfish/fairy-stockfish.wasm
- **上游引擎**：https://github.com/fairy-stockfish/Fairy-Stockfish
- **授權**：GPL-3.0（作者 Fabian Fichter）。本專案為開源，符合 GPL；請於「關於與授權」彈窗標注。

## 檔案

| 檔 | 說明 |
|---|---|
| `stockfish.js` | Emscripten 工廠，全域 `Stockfish`；用 `document.currentScript.src` 自動定位 sibling |
| `stockfish.wasm` | 引擎本體（約 1.6MB），WASM SIMD |
| `stockfish.worker.js` | pthread worker（多執行緒 build） |

## 重點限制

- 多執行緒 build → 頁面必須 **cross-origin isolated**（`COOP: same-origin` + `COEP`），否則
  `SharedArrayBuffer` 不可用、引擎起不來。本專案於 `vite.config.js` 設定（COEP 用
  `credentialless` 以免擋掉 Google Fonts）。**正式部署（Zeabur）需另外設定相同回應標頭。**
- 尚未載入 NNUE 權重 → 使用古典評估，棋力偏弱（spike 階段足夠）。日後接 NNUE：
  `FS.writeFile('/xiangqi.nnue', buf)` → `setoption name EvalFile value /xiangqi.nnue`。

## 更新方式

```sh
curl -s "https://registry.npmjs.org/fairy-stockfish-nnue.wasm/latest" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['dist']['tarball'])" \
  | xargs curl -s -o /tmp/fsf.tgz
tar xzf /tmp/fsf.tgz -C /tmp
cp /tmp/package/stockfish.{js,wasm,worker.js} public/engine/xiangqi/
```
