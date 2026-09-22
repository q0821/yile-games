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

`public/tsumego/index.json` 與 `build-tsumego.js` 目前直接寫入 `license: MIT`，無法區分程式與題目內容。這次盤點未改寫原題庫或該標示；後續在取得授權或替換題庫時，應同步改為逐來源授權紀錄，避免再次由 repo 的授權名稱推論題目授權。

## 建議與待辦

- 本次新增基礎練習採自行編寫題目，來源、目標及解答依據記在程式資料中。
- 現有題庫尚未刪除、替換、下架或修改線上狀態。發布下一版前，由專案負責人決定暫停散布、取得原權利人許可或替換。
- 若選 Go Game Guru，先釐清實際商業用途並取得必要許可，再支援完整解答樹；不能直接把其多手解答當並列第一手答案。
- 若選古典題集，先指定原典與可用版本，補來源檔、權利狀態、數位轉錄條件與答案校驗後才匯入。
- 發信或公開詢問作者尚未執行，需要另行授權。


## 本機盤點指紋

以下 SHA-256 用於辨識本次盤點的檔案，不表示授權已確認。

- `public/tsumego/beginner.json`：`7cc0572b7b2cdb22b8808bfd59d07e4c47fc98933d0ddd36257ab2a61c580b3e`
- `public/tsumego/intermediate.json`：`7c567d04198a17ac4af0efd71aab345c2fafaf9de254392cfc89106e022bec4b`
- `public/tsumego/advanced.json`：`fa252217f17d3b11ed5411d4e0eaa8baa2091fedfac70fd5675ec0614e11b9ab`
