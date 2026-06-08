# 象棋上線：cross-origin isolation 部署設定

象棋 AI 引擎（fairy-stockfish-nnue.wasm）是 **pthread 多執行緒 WASM**，需要頁面
**cross-origin isolated** 才能使用 `SharedArrayBuffer`。否則 `crossOriginIsolated`
為 false，引擎載入時會丟錯（圍棋／五子棋／死活不受影響）。

達成方式：在回應加兩個標頭

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

> 用 `require-corp`（非 `credentialless`）是因為全瀏覽器支援（含 iOS Safari）。
> 前提：站上**已移除所有跨來源子資源**（字型改用系統內建宋體），所以 require-corp
> 不會擋到任何東西。日後若再加跨來源 `<img>`/`<script>`/字型，需讓對方送 CORP，
> 或加 `crossorigin` 屬性，否則會被擋。

## 部署架構

`Cloudflare（proxied）→ Zeabur → Caddy 靜態（vite dist）`

`cf-cache-status: DYNAMIC`（HTML 未被 CF 快取），origin 標頭會穿透。

## 設定方式（擇一；建議 A）

### A. Cloudflare Transform Rule（推薦，最快、不需重 build）

1. Cloudflare Dashboard → 網域 `jackie-yeh.com`
2. Rules → Transform Rules → **Modify Response Header** → Create rule
3. Rule name：`yile COOP/COEP for xiangqi`
4. When incoming requests match：`Hostname` `equals` `yile.jackie-yeh.com`
5. Then → Set static：
   - `Cross-Origin-Opener-Policy` = `same-origin`
   - `Cross-Origin-Embedder-Policy` = `require-corp`
6. Deploy

### B. Origin（Caddy）——若想版控設定

Zeabur 靜態服務用 Caddy。若要在 origin 設，需提供自訂 Caddy 設定加：
```
header {
  Cross-Origin-Opener-Policy "same-origin"
  Cross-Origin-Embedder-Policy "require-corp"
}
```
（Zeabur zbpack 靜態是否吃自訂 Caddyfile 需先確認；不確定就走 A。）

## 驗證

```sh
curl -sI https://yile.jackie-yeh.com/ | grep -i cross-origin
# 應看到 same-origin 與 require-corp
```

瀏覽器開 `https://yile.jackie-yeh.com/#xiangqi`：

- DevTools Console 跑 `crossOriginIsolated` 應為 `true`
- 點進象棋、走一手，AI 會回手即成功
- 順手回歸測試：圍棋（KataGo）仍可載入對弈（同源 WASM，不受影響，但值得一看）
