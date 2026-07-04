# App Privacy 問卷答案（App Store Connect > App 隱私權）

結論：**Data Not Collected（不蒐集資料）**——全部問題選「否」。

依據（有人問起時的說明）：

| 檢查點 | 狀態 |
|---|---|
| 使用者帳號 | 無帳號系統 |
| 分析 / 追蹤 SDK | iOS App 內無任何分析工具（Cloudflare 流量統計只在網頁版，App 走內嵌 localhost server，不載入） |
| 廣告 | 無 |
| 對局紀錄 / 設定 / 解鎖狀態 | 只存裝置 localStorage，不上傳 |
| IAP | 由 Apple StoreKit 處理；付款資料開發者不經手。Apple 自身的交易處理不算開發者的資料蒐集 |
| 第三方 SDK | Capacitor 與 @capgo/native-purchases 皆不回傳資料至第三方伺服器 |
| 網路連線 | App 除商店 API（Apple 網域）外不連外部伺服器 |

操作：App Store Connect → App 隱私權 → 「開始」→「您或您的第三方合作夥伴是否會從此 App 蒐集資料？」選 **否** → 儲存發佈。
