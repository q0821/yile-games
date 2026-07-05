# 決策紀錄 — IAP 不採用 RevenueCat，維持直連 StoreKit 2

日期：2026-07-05
狀態：**已決策**（維持現況 `@capgo/native-purchases` 直連方案）
重新評估觸發條件見文末。

## 結論

弈樂的內購（單一非消耗型買斷 `com.yilegames.app.full`，NT$90）**維持 `store-service.js` 現行的 `@capgo/native-purchases` 直連 StoreKit 2 / Play Billing 方案**，不引入 RevenueCat。

## 背景認知（避免誤解）

- RevenueCat **不是金流**：收款仍是 Apple IAP / Google Play Billing，Apple 抽成（15% / 30%）不變，「數位內容必須走 IAP」的審核紅線也不變。
- 它是 IAP 之上的管理層：統一 SDK、雲端收據驗證、權益集中管理、訂閱分析、webhook、付費牆 A/B 測試。
- 技術上可接：官方 Capacitor plugin `@revenuecat/purchases-capacitor`（前身即 CapGo plugin，移交 RevenueCat 官方維護），與現用套件系出同門，遷移可吃既有 StoreKit 交易，不會弄丟已付費使用者。
- 定價（2026-07 查證）：月追蹤營收（MTR）**US$2,500 以下免費**，超過約 1%（Starter 0.99% / Pro 1.2%），以 **Apple 抽成前毛額**計。NT$90 買斷制月營收約 NT$8 萬以下都在免費區。

## 不採用的三個理由（與 App 既有承諾相撞）

1. **零資料蒐集的隱私標示**：RevenueCat 會產生匿名裝置 user ID、收據經其伺服器。接入後 App Store「App 隱私」不能再申報「不蒐集資料」，需申報識別碼與購買紀錄。為用不到的功能弄髒隱私聲明，不值。
2. **離線可用承諾**：現行權益查詢直接問裝置端 StoreKit（`getPurchases` onlyCurrentEntitlements），離線靠本機快取。RevenueCat 權益真相在雲端，多一層網路依賴與第三方故障點。
3. **需求複雜度不匹配**：RevenueCat 價值集中在訂閱制（續訂、退款、跨平臺同步、付費牆實驗、報表）。單一買斷商品用直連方案是最短路徑：免帳號、免後端、零額外抽成。

## 何時重新評估

- 改做**訂閱制**（例如 AI 對弈月費）。
- 需要**跨平臺權益同步**（iOS 買、Android 也解鎖；需自建帳號＋中介服務）。
- 需要付費牆 A/B 測試或營收儀表板。

## 參考

- https://www.revenuecat.com/pricing/
- https://github.com/RevenueCat/purchases-capacitor
- https://www.revenuecat.com/docs/getting-started/installation/capacitor
- 相關程式：`store-service.js`（權益真相在商店、本機旗標僅快取的設計說明見檔頭註解）、`entitlements.js`
