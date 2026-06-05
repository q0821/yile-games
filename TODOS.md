# TODOS

## 線上對戰（Phase 11）—— ✖ 不做（2026-06-06 使用者決定）

本檔原本整份是「線上對人對戰（Firebase）」的待辦。**使用者明確決定不做線上對戰**：
線上對弈已有許多成熟平台，本專案定位是「個人棋力訓練工具」，不重做這塊。

連帶放棄（這些原本都是為線上對戰鋪路）：

- Firebase 大廳/房間/對局轉換、安全規則、並發落子 transaction、計時同步、觀戰
- 架構重構：command/event 抽象層、消除 dual-state、把 DOM 操作全收斂到 ui.js
  （原因是「god-object 架構撐不過 Firebase 整合」——既然不整合 Firebase，這些重構失去主要動機）
- Ranked matchmaking、in-game chat（皆屬線上功能）

> 若日後改變心意，git 歷史與本檔上一版仍可查到原始拆解。

## 可能的未來小項（非線上）

- **棋譜分享（S14）**：SGF 已可匯出，可再加「分享連結／觀摩」。優先級低。
- 其餘待辦見 `SPEC_IMPROVEMENTS.md`（該檔為現行主要規劃來源）。
