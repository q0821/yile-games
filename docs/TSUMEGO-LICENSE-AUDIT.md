# 死活題庫來源與授權盤點

查核日期：2026-09-22。範圍為本機 public/tsumego 三個 JSON、轉檔腳本及上游公開資料，沒有宣稱目前正式站部署與本機相同。本文件是授權證據盤點，並非侵權成立與否的法律認定。

## 結論
現有 3,908 題不能僅憑上游 MIT 形式的程式授權，就標示為已確認可自由散布的題庫。現有證據不足以確認原題作者至上游再至本專案的授權鏈；這不等同已證實每題侵權。上游程式 LICENSE 與 CONTRIBUTORS 可取得，是已知陽性；缺口在原題集的個別權利人許可。

舊 HANDOFF_TSUMEGO.md 稱全部為趙治勳全集不準確。依本機每題 id，共 20 個題集子目錄；趙治勳三組合計 2,539 題，其餘 1,369 題來自其他題集。分類沿用原始識別名稱，不以譯名猜測出版社或權利人。

## 逐題集盤點

| 級別 | 原始題集識別 | 題數 | 授權狀態 |
|---|---|---:|---|
| beginner | Cho Chikun Encyclopedia Life And Death - Elementary | 900 | 待取得原題權利人授權證據 |
| beginner | Fujisawa Shuuko - Collection Or Original Tsumego - Elementary | 40 | 待取得原題權利人授權證據 |
| beginner | Ishigure Ikuro 123 Basic Tsumego | 123 | 待取得原題權利人授權證據 |
| beginner | Yamada Kimio - Basic Tsumego  | 20 | 待取得原題權利人授權證據 |
| intermediate | Cho Chikun Encyclopedia Life And Death - Intermediate | 857 | 待取得原題權利人授權證據 |
| intermediate | Fujisawa Shuuko - Collection Of Original Tsumego - Intermediate | 39 | 待取得原題權利人授權證據 |
| intermediate | Ishida Akira Tsumego Masterpiece Kyu Level | 53 | 待取得原題權利人授權證據 |
| intermediate | Maeda Nobuaki Newly Selected Tsumego 100 Problems For 1-8k | 100 | 待取得原題權利人授權證據 |
| intermediate | Maeda Tsumego Collection - 1k-5k | 210 | 待取得原題權利人授權證據 |
| intermediate | Maeda Tsumego Collection - 10k-5k | 225 | 待取得原題權利人授權證據 |
| intermediate | Yamada Kimio - High Speed Attack Tsumego  | 111 | 待取得原題權利人授權證據 |
| advanced | Cho Chikun Encyclopedia Life And Death - Advanced | 782 | 待取得原題權利人授權證據 |
| advanced | Fujisawa Shuuko - Collection Or Original Tsumego - Advanced | 60 | 待取得原題權利人授權證據 |
| advanced | Fujisawa Shuuko - Collection Or Original Tsumego - High Dan | 23 | 待取得原題權利人授權證據 |
| advanced | Ishida Akira Tsumego Masterpiece Dan Level | 50 | 待取得原題權利人授權證據 |
| advanced | Ishida Akira Tsumego Masterpiece High Dan Level | 14 | 待取得原題權利人授權證據 |
| advanced | Ishida Akira Tsumego Masterpiece Pro Level | 3 | 待取得原題權利人授權證據 |
| advanced | Ishigure Ikuro - Challenging Shodan Tsumego | 40 | 待取得原題權利人授權證據 |
| advanced | Maeda Tsumego Collection - 1k-1d | 150 | 待取得原題權利人授權證據 |
| advanced | Yamada Kimio - Road To 3 Dan  | 108 | 待取得原題權利人授權證據 |

## 授權鏈與來源

1. 本機 build-tsumego.js 從 sanderland/tsumego 的 1a、1b、1c 目錄匯入，保留棋形、說明、第一手答案；因此不是只散布程式碼。
2. 本機 public/licenses/tsumego-LICENSE.txt 與上游 LICENSE 開頭均以 Code 描述著作權，內文授權對象為 Software。不能據此替上游推定已取得第三方題目的權利。
3. [上游 CONTRIBUTORS](https://raw.githubusercontent.com/sanderland/tsumego/master/CONTRIBUTORS) 感謝原題作者及 TsumegoDojo 蒐集檔案，沒有在該檔列出個別題集授權條件。[上游 LICENSE](https://raw.githubusercontent.com/sanderland/tsumego/master/LICENSE) 與 [README](https://github.com/sanderland/tsumego) 已查閱。
4. [Tasuki FAQ](https://tsumego.tasuki.org/faq/) 對合法性未提供授權保證，且稱只發布棋形、不發布答案。它是替代來源調查對象，尚未證實是本機全部題目的直接上游，不能拿它當本機題庫的授權證書。
5. 本機 tsumego-source 目錄無來源檔，build-tsumego.js 預設 ../tsumego 也不存在；缺少當次匯入的上游 commit 與逐題授權憑證。對空目錄執行 git remote 會向上找到本專案 repo，不能當成來源 repo。

## 替代方案

| 方案 | 已確認資訊 | 使用前條件與取捨 |
|---|---|---|
| 本次自行編寫的基礎題 | 由圍棋規則設計小局面與中文解說，不轉錄現有題庫 | 先做少量並用規則逐題驗證；適合零基礎，不能宣稱等同完整死活題庫 |
| [Go Game Guru](https://github.com/gogameguru/go-problems) | 作者官方 repo 提供題目與詳細解答；[LICENSE](https://raw.githubusercontent.com/gogameguru/go-problems/master/LICENSE) 為 CC BY-NC-SA 4.0 | 需署名、附授權、標示改作並遵循相同方式分享；非商業限制需依實際網站營運判斷。免費不自動等於非商業，若有廣告或商業導流，優先取得另行書面許可 |
| [Reasoning Gym 一手吃子生成器](https://raw.githubusercontent.com/open-thought/reasoning-gym/main/reasoning_gym/games/tsumego.py) | 程式以種子生成棋形，官方 [LICENSE](https://raw.githubusercontent.com/open-thought/reasoning-gym/main/LICENSE) 為 Apache 2.0 | 可評估依該授權使用／改作程式，保留授權與變更聲明；不是人工編選完整死活題庫，仍需檢查生成局面與答案。本次只調查，沒有匯入其程式或題目 |
| 古典題集 | Tasuki 有古典題集入口，但 FAQ 不是可再散布的明確授權 | 查原典年代與適用地法律，分開處理現代解說、編排與數位轉錄授權；不能整包複製後直接標為公有領域 |
| [GoTools](https://lie.math.brocku.ca/GoTools/index.php?content=extra_probs) | 作者提供研究用途的電腦生成題庫 | 有用途及轉交限制，不當成可直接置入公開網站的替代品 |

CC 條件依 [Creative Commons 官方說明](https://creativecommons.org/licenses/by-nc-sa/4.0/) 查核。SA 義務針對改作內容，不在此推論必須開放整個網站程式碼。

## 既有標示的缺口

`public/tsumego/index.json` 與 `build-tsumego.js` 初次盤點時直接寫入 `license: MIT`，無法區分程式與題目內容。初次盤點未改寫原題庫或該標示；第二階段已修正索引，後續取得授權或替換題庫時，仍應建立逐來源授權紀錄，避免再次由 repo 的授權名稱推論題目授權。

## 建議與待辦

- 本次新增基礎練習採自行編寫題目，來源、目標及解答依據記在程式資料中。
- 初次盤點未刪除、替換或下架題庫。第二階段已依使用者同意在本機暫停提供，正式站尚未部署。
- 若選 Go Game Guru，先釐清實際商業用途並取得必要許可，再支援完整解答樹；不能直接把其多手解答當並列第一手答案。
- 若選古典題集，先指定原典與可用版本，補來源檔、權利狀態、數位轉錄條件與答案校驗後才匯入。
- 發信或公開詢問作者尚未執行，需要另行授權。


## 本機盤點指紋

以下 SHA-256 用於辨識本次盤點的檔案，不表示授權已確認。

- `public/tsumego/beginner.json`：`7cc0572b7b2cdb22b8808bfd59d07e4c47fc98933d0ddd36257ab2a61c580b3e`
- `public/tsumego/intermediate.json`：`7c567d04198a17ac4af0efd71aab345c2fafaf9de254392cfc89106e022bec4b`
- `public/tsumego/advanced.json`：`fa252217f17d3b11ed5411d4e0eaa8baa2091fedfac70fd5675ec0614e11b9ab`

## 第二次網路搜尋（2026-09-22）

依使用者要求重新搜尋 CC0、CC BY、CC BY-SA、原創題庫、作者官方 repo 與網站使用條款。搜尋結果中的「免費下載」及第三方重新標示的 MIT 均未視為內容授權。本輪未匯入任何外部題目或生成器。

| 候選 | 第一手證據 | 採用判斷與整合成本 |
|---|---|---|
| Go Game Guru | 再查 [作者 repo](https://github.com/gogameguru/go-problems) 與 [CC BY-NC-SA 4.0 全文](https://raw.githubusercontent.com/gogameguru/go-problems/master/LICENSE)，提供分級及詳細解答 | 完整題庫候選中優先考慮；需確認非商業用途符合條件，或另取許可。工程需解析 SGF 變化樹、翻譯解說與保留署名，不能沿用只判第一手的匯入方式 |
| Learn to Play Go Already! | [作者網站](https://www.learn-go.net/) 明示整個專案 CC BY-NC 4.0，有規則、切斷、征子、倒撲等互動課程 | 新找到的入門教材候選，仍受非商業限制；屬完整課程，需挑出題目、核對格式並翻譯，不是可直接替換的 JSON 題庫 |
| Reasoning Gym | 再查 [生成器原始碼](https://raw.githubusercontent.com/open-thought/reasoning-gym/main/reasoning_gym/games/tsumego.py) 與 [Apache 2.0 授權](https://raw.githubusercontent.com/open-thought/reasoning-gym/main/LICENSE) | 可評估依授權改作一手吃子生成程式；程式仍列多步題為待辦。工程需獨立驗證局面、答案與教學難度，不能當完整死活題庫 |
| Zero Problem | [作者使用說明](https://colonq.github.io/zero-problem/Htmls/user_guide.html) 明示原始碼 CC0，從棋譜透過 Leela Zero 產生題目；相依工具有各自授權 | 新找到的自有棋譜出題工具候選。輸入棋譜仍須有權使用，不會自動解除來源內容權利。輸出是 HTML 與 AI 估計變化，需人工挑題及轉換；不直接導入目前瀏覽器架構 |
| Wikibooks 法文死活頁 | [題目頁](https://fr.wikibooks.org/wiki/Jeu_de_go/Tsumego_1) 頁尾標示 CC BY-SA；圖像與模板可能另有條件 | 新找到的小量教材候選，待逐頁核對修訂作者、圖像授權及解答。頁面表格抽取未呈現完整棋盤，尚不能確認可匯入題數或完整解答，不當現成大題庫 |
| 101 圍棋 | [官方使用者協議](https://doc.101weiqi.com/jianjie/yonghuxieyi/) 第三節要求站外轉載取得原作者授權，另限制未獲許可的抓取與複製 | 不抓取匯入；需取得對應授權，平台免費使用不代表可搬到自己的網站 |
| GoTools | 再查 [作者條款](https://lie.math.brocku.ca/GoTools/index.php?content=extra_probs)，40,000 題供研究，限制轉交與公開傳輸 | 不作公開網頁題庫替代品，除非取得作者另行書面許可 |
| frank_go、baduk-study-material 等整理庫 | [frank_go 來源表](https://github.com/akitaonrails/frank_go/blob/main/data/SOURCES.md) 仍引用 Tasuki 與 Go Game Guru；[baduk-study-material 授權說明](https://raw.githubusercontent.com/benjaminmantle/baduk-study-material/master/LICENSE.md) 有不同來源權利狀態 | 可當搜尋索引，不能因另一個專案已收錄，就推定本專案獲授權。原上游問題並未因此消失 |

本輪 u-go.net 與 Sensei's Library 授權頁無法透過查詢工具讀取，不對其授權下結論。Wikimedia Commons 個別圖檔頁亦未成功讀取，不以搜尋摘要當授權證據。

建議仍是先用自行編寫且可驗證的入門課程。若要快速補完整死活解答，優先釐清 Go Game Guru 的使用條件；若需要大量可控難度的吃子題，可另評估生成器。這次沒有找到已完成來源與解答驗證、可直接整包商用匯入的大型題庫；不表示網路上不存在。

## 第二階段本機處理

使用者同意繼續後，舊入口改為暫停說明，Vite 建置移除本次產生的題庫副本，開發與預覽伺服器、新版 Service Worker 阻擋題庫請求。原題 JSON 不刪除、舊進度不修改。索引與轉檔腳本改為內容授權未確認，不再直接標示題庫 MIT；上游程式授權另記。

此狀態只代表本機與後續新版建置。尚未推送或部署，不能宣稱正式站已下架；舊 Git 紀錄、既有部署預覽網址及未更新的離線版本仍可能保有副本，並非本次本機變更可以回收。


## 非商業用途確認與優先候選

2026-09-22 使用者明確確認：網頁死活練習維持免費、無廣告，定位為獨立的學習功能，不以推廣付費 App 或其他付費服務為目的。iOS App 不含死活題目。

依 [CC BY-NC-SA 4.0 第 1(k) 節](https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode.en) 所定義的用途判準，以這項營運前提採用 Go Game Guru 是合理方向，不再把「另有付費 iOS App」當成排除理由。此為依使用者提供用途與條款作出的判斷，不是對未來任何營運方式的保證，也不適用於原本授權未確認的 3,908 題。

已即時取得 [作者官方 Git tree](https://api.github.com/repos/gogameguru/go-problems/git/trees/eee12b2e39d59dbe81a8b9eaa7d4f103978d9224?recursive=1)，回應未截斷。固定提交 SHA 為 `eee12b2e39d59dbe81a8b9eaa7d4f103978d9224`，對應樹 SHA 為 `56a6b8810c76cc620eb056d6c2906d9859c62815`（第三階段核對提交資料後更正，前版誤將提交 SHA 寫成樹 SHA）：

- easy：140 個 SGF。
- intermediate：140 個 SGF。
- hard：140 個 SGF。
- other：2 個 SGF。
- templates：1 個 SGF，不算練習題。

因此可先以正式分級的 420 題為替代候選，不把「全部 423 個 SGF 檔」誤報成題數。只下載一題到系統暫存目錄檢查格式，未加入網站題庫。[第一題](https://raw.githubusercontent.com/gogameguru/go-problems/eee12b2e39d59dbe81a8b9eaa7d4f103978d9224/weekly-go-problems/easy/ggg-easy-01.sgf) 已包含多手、錯誤分支、兩種正確終點與解說；將所有 B 節點當作第一手正解會錯判。

後續匯入應保留作者與來源連結、授權全文及免責聲明，標示轉檔、翻譯等修改，翻譯／改作內容採相容的相同授權，不額外限制讀者依授權再利用。SA 適用於改作內容，不在此推論整個網站程式必須改授權。若未來開始收費、放廣告或改成商業導購，重新評估用途或取得另行許可。

建議下一批先整合 easy 的 140 題，驗證完整 SGF 變化樹與題目目標，再擴充剩餘 280 題。此整合尚未實作，本輪先完成原創課程、進度與舊題庫暫停提供。

## 第三階段：Go Game Guru 入門題整合（2026-09-22）

已將上述固定提交的 easy 140 題匯入 `public/go-problems/ggg/`，原始 SGF、LICENSE 與 README 保持原樣；`index.json` 保存每題上游路徑及 SHA-256，`NOTICE.md` 說明作者、用途、修改範圍與授權。前述「尚未匯入」為第二階段時間點，第三階段以本節為準。

完整解析 5,566 個節點並驗證全部分支落子合法。原譜含沒有正解標記的參考分支，不能據此宣稱錯誤；畫面只在走到作者 Correct／Also correct 標記時計為「本次解答變化完成」。自動應手優先使用通往該標記的分支，其餘原譜均可逐手查看，不宣稱已涵蓋所有可能應手或經職業棋手重新審題。

英文解說尚未翻譯，避免把未校對譯文當成作者說明。iOS 網頁建置不包含這批題庫資料與程式。舊 3,908 題維持停用，來源 JSON 與舊本機進度保留。中高階 280 題不在本次整合範圍。

本機驗證及後續限制見 [整合驗收紀錄](PRD-go-game-guru.md)。第二階段已提交推送 `eeda78e7cec1d0c28cef845be01f9c27d6cd2789`；第三階段完成後依使用者授權提交推送。推送與正式部署須分開查核。
