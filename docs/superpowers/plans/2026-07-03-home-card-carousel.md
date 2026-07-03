# 首頁選棋卡片改版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把首頁選棋畫面改成直式水墨圖卡片、露邊可左右捲動的 scroll-snap 卡片列。

**Architecture:** 純 CSS scroll-snap 橫向容器（`#homeMenu`）＋每張 `.home-card` 疊「背景圖層 + 底部漸層遮罩 + 文字層」；桌機加漸進增強的左右箭頭鈕。8 張水墨插畫用 gpt-image-bridge 生成、轉 webp 放 `public/img/cards/`。iOS 精簡版沿用既有 `__IOS_STORE__` 機制只用 3 張，其餘 5 張由 `strip-ios-assets.mjs` 移除。

**Tech Stack:** 原生 JS（無框架）、Vite 8、CSS scroll-snap、gpt-image-bridge（codex/gpt-image-2）、cwebp、既有 PWA service worker。

## Global Constraints

- UI 一律不加 Emoji。
- 生成含人物圖用亞洲（台灣）面孔——本案圖皆無人物，不適用，但 prompt 明確標 no people。
- 中英文字之間加半形空白。
- git commit 訊息用繁中、**絕不**加 Claude 相關尾註（Co-Authored-By / Generated with 等）。
- iOS build（`npm run build:ios`）產物**不得**含 GPL 引擎特徵；`strip-ios-assets.mjs` 的 grep 合規驗證必須通過（非零退出即失敗）。
- 卡片圖走 runtime cache，**不**加入 `sw.js` 的 `PRECACHE_ASSETS`。
- 只動首頁選棋卡片；不改各棋種內頁、mode header、對弈畫面。
- 圖底遮罩須確保標題/對句/提示字可讀（可讀性優先於圖）。
- 尊重 `prefers-reduced-motion`。

---

## 檔案結構

- 新增：`public/img/cards/{play,tsumego,xiangqi,xqpuzzle,shogi,gomoku,othello,chess}.webp` — 8 張直式水墨卡片圖。
- 修改：`main.js` — `HOME_ITEMS` 加 `img` 欄位；`renderHome()` 產生分層卡片 DOM；桌機箭頭鈕的初始化與捲動邏輯。
- 修改：`index.html` — `#homeMenu` 外層加箭頭鈕容器（或由 JS 動態插入，本計畫採 JS 插入以集中邏輯）。
- 修改：`style.css` — `.home-menu` 改 scroll-snap 容器；`.home-card` 改直式分層；新增 `.home-card-bg`/`.home-card-body`/箭頭鈕樣式與 reduced-motion 分支；改寫既有 grid 斷點。
- 修改：`scripts/strip-ios-assets.mjs` — TARGETS 加入 5 張 web-only 卡片圖。

---

## Task 1: 生成 8 張水墨卡片圖並轉 webp

**Files:**
- Create: `public/img/cards/play.webp`, `tsumego.webp`, `xiangqi.webp`, `xqpuzzle.webp`, `shogi.webp`, `gomoku.webp`, `othello.webp`, `chess.webp`

**Interfaces:**
- Produces: 8 個 webp 檔，路徑 `img/cards/<id>.webp`（id 對齊 `HOME_ITEMS` 的 id），供 Task 2 引用。

共用風格基底（每個 prompt 前綴）：

```
Traditional Chinese ink-wash painting (shuimo / sumi-e) on aged xuan rice-paper texture, vertical portrait composition, generous negative space in the upper area, soft ink bleed and tonal gradients, muted warm paper tone with black and grey ink plus subtle sepia accents, elegant and minimal, no text, no letters, no numerals, no people, no signature, no seal text. Subject anchored in the lower-center. Subject:
```

各棋 subject（接在基底後）：

- play：`a corner of a Go board with scattered black and white Go stones forming a loose shape, faint wood-grain lines in ink.`
- tsumego：`a tight cluster of black and white Go stones in one corner forming a life-and-death shape, tension of a single decisive stone.`
- xiangqi：`round Chinese-chess game discs in red and black ink, facing off across a dividing river line, carved marks implied but not legible.`
- xqpuzzle：`a sparse Chinese-chess endgame, only a few round discs left near a besieged position, worn ancient manual mood, a sense of a decisive killing move.`
- shogi：`Japanese shogi pentagonal wooden pieces (koma) in wood tone with faint ink, arranged on a board corner, calm wabi-sabi mood.`
- gomoku：`black and white stones forming a diagonal line of five in a row on a grid, momentum of connection.`
- othello：`black and white discs on a grid with a cluster mid-flip between black and white, contrast of reversal.`
- chess：`silhouettes of Western chess pieces in ink, two opposing armies, a rook/castle and a king suggested, facing each other.`

- [ ] **Step 1: 建立輸出目錄與暫存目錄**

Run:
```bash
mkdir -p /Users/hd/WORK/case/gogame/gogame-src/public/img/cards
mkdir -p /private/tmp/claude-501/-Users-hd-WORK-case-gogame-gogame-src/1f36b7c2-3e4b-4a68-84f6-e9ac8d0e1ece/scratchpad/cards-png
```

- [ ] **Step 2: 逐張生成 PNG（8 次，各設 timeout ≥ 240000ms）**

對每個 id 執行（以 play 為例，其餘替換 id 與 subject）：
```bash
~/.claude/skills/gpt-image-bridge/bin/gpt-image-2 \
"<風格基底> <該 id 的 subject>" \
"/private/tmp/claude-501/-Users-hd-WORK-case-gogame-gogame-src/1f36b7c2-3e4b-4a68-84f6-e9ac8d0e1ece/scratchpad/cards-png/play.png" \
--size 1024x1536
```
Expected: stdout 印出 PNG 絕對路徑。生成後 `Read` 該 PNG 檢視構圖、留白、確認無文字/無人物；不滿意就調 subject 重生。

- [ ] **Step 3: 轉 webp（降到 800px 寬、q80）存入 public/img/cards/**

Run（對 8 個 id）：
```bash
cd /Users/hd/WORK/case/gogame/gogame-src
for id in play tsumego xiangqi xqpuzzle shogi gomoku othello chess; do
  cwebp -q 80 -resize 800 0 \
    "/private/tmp/claude-501/-Users-hd-WORK-case-gogame-gogame-src/1f36b7c2-3e4b-4a68-84f6-e9ac8d0e1ece/scratchpad/cards-png/$id.png" \
    -o "public/img/cards/$id.webp"
done
```
Expected: 8 個 webp 產生，每檔約 30–120KB。

- [ ] **Step 4: 驗證檔案齊全與尺寸合理**

Run:
```bash
cd /Users/hd/WORK/case/gogame/gogame-src
ls -la public/img/cards/*.webp | wc -l    # 應為 8
for f in public/img/cards/*.webp; do printf "%s " "$f"; magick identify -format "%wx%h %B bytes\n" "$f"; done
```
Expected: 8 檔，寬 800、單檔 < 200KB。

- [ ] **Step 5: Commit**

```bash
cd /Users/hd/WORK/case/gogame/gogame-src
git add public/img/cards/*.webp
git commit -m "新增首頁八棋種水墨卡片背景圖（webp）"
```

---

## Task 2: HOME_ITEMS 加 img 欄位、renderHome 產生分層卡片

**Files:**
- Modify: `main.js`（`HOME_ITEMS` 定義處；`renderHome()` 函式）

**Interfaces:**
- Consumes: Task 1 的 `public/img/cards/<id>.webp`。
- Produces: 每張 `.home-card` 內含 `.home-card-bg`（背景圖層，`aria-hidden`）與 `.home-card-body`（文字層，含既有 title/desc/hint），供 Task 3 樣式套用。

- [ ] **Step 1: HOME_ITEMS 每項加 img 欄位**

把 `HOME_ITEMS` 陣列每個物件加 `img: 'img/cards/<id>.webp'`（id 用該項既有 id）。例如：
```js
const HOME_ITEMS = [
  { id: 'play',    title: '圍棋對弈', desc: '黑白手談，方圓論天地', hash: '#play',    img: 'img/cards/play.webp' },
  { id: 'tsumego', title: '死活練習', desc: '方寸之間，一子定生死', hash: '#tsumego', img: 'img/cards/tsumego.webp', webOnly: true },
  { id: 'xiangqi', title: '象棋對弈', desc: '楚河漢界，車馬論英雄', hash: '#xiangqi', img: 'img/cards/xiangqi.webp', webOnly: true },
  { id: 'xqpuzzle',title: '象棋殘局', desc: '古譜殘局，絕處覓殺機', hash: '#xqpuzzle', img: 'img/cards/xqpuzzle.webp', webOnly: true },
  { id: 'shogi',   title: '日本將棋', desc: '升變打入，俘子再成軍', hash: '#shogi',   img: 'img/cards/shogi.webp', webOnly: true },
  { id: 'gomoku',  title: '五子棋',   desc: '縱橫連珠，先連者為王', hash: '#gomoku',  img: 'img/cards/gomoku.webp' },
  { id: 'othello', title: '黑白棋',   desc: '黑白翻覆，一夾定乾坤', hash: '#othello', img: 'img/cards/othello.webp' },
  { id: 'chess',   title: '西洋棋',   desc: '兩軍對壘，將死擒敵王', hash: '#chess',   img: 'img/cards/chess.webp', webOnly: true },
].filter(item => !(IOS_STORE && item.webOnly));
```

- [ ] **Step 2: 改寫 renderHome() 產生分層 DOM**

把 `renderHome()` 的卡片組裝改成：背景圖層 + body 包住 title/desc/hint。完整替換函式主體迴圈：
```js
function renderHome() {
  const menu = document.getElementById('homeMenu');
  menu.innerHTML = '';
  for (const item of HOME_ITEMS) {
    const card = document.createElement('button');
    card.className = 'home-card';
    card.type = 'button';

    // 背景水墨圖層（裝飾性，不進無障礙樹）
    const bg = document.createElement('span');
    bg.className = 'home-card-bg';
    bg.setAttribute('aria-hidden', 'true');
    if (item.img) bg.style.backgroundImage = `url("${item.img}")`;
    card.appendChild(bg);

    // 文字層（疊在圖與遮罩之上）
    const body = document.createElement('span');
    body.className = 'home-card-body';

    const title = document.createElement('span');
    title.className = 'home-card-title';
    title.textContent = item.title;
    body.appendChild(title);

    const desc = document.createElement('span');
    desc.className = 'home-card-desc';
    const parts = item.desc.split(/[，、]/);
    if (parts.length === 2) {
      const top = document.createElement('span'); top.textContent = parts[0];
      const bottom = document.createElement('span'); bottom.textContent = parts[1];
      desc.append(top, bottom);
    } else {
      desc.textContent = item.desc;
    }
    body.appendChild(desc);

    const hint = homeItemHint(item.id);
    if (hint) {
      const tag = document.createElement('span');
      tag.className = 'home-card-hint';
      tag.textContent = hint;
      body.appendChild(tag);
    }

    card.appendChild(body);
    card.addEventListener('click', () => { location.hash = item.hash; });
    menu.appendChild(card);
  }
}
```

- [ ] **Step 3: build 並確認無錯**

Run:
```bash
cd /Users/hd/WORK/case/gogame/gogame-src && npm run build 2>&1 | tail -5
```
Expected: `✓ built`，無錯誤。

- [ ] **Step 4: jest 回歸**

Run:
```bash
cd /Users/hd/WORK/case/gogame/gogame-src && npm test 2>&1 | tail -5
```
Expected: 299 passed（renderHome 不在 jest 覆蓋內，應不受影響）。

- [ ] **Step 5: Commit**

```bash
cd /Users/hd/WORK/case/gogame/gogame-src
git add main.js
git commit -m "首頁卡片：HOME_ITEMS 加圖欄位，renderHome 產生圖層＋文字層分層結構"
```

---

## Task 3: style.css 改成 scroll-snap 直式卡片列

**Files:**
- Modify: `style.css`（`.home-screen`、`.home-menu`、`.home-card` 及其子項、斷點區塊）

**Interfaces:**
- Consumes: Task 2 產生的 `.home-card-bg` / `.home-card-body` 結構。
- Produces: 橫向 scroll-snap 版面，供 Task 4 的箭頭鈕捲動。

- [ ] **Step 1: 放寬 home-screen 寬度、改 menu 為橫向 scroll-snap 容器**

替換 `.home-screen` 的 `max-width` 與整段 `.home-menu`：
```css
.home-screen {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  max-width: 1040px;      /* 放寬以容納放大的直式卡片列 */
  padding: 12px 16px 20px;
  gap: 16px;
}

/* 橫向 scroll-snap 卡片列：手機露約 1.3 張、桌機露 3–4 張 */
.home-menu {
  display: flex;
  gap: 16px;
  width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  scroll-snap-type: x mandatory;
  scroll-padding: 0 16px;
  padding: 4px 4px 12px;
  scrollbar-width: none;               /* Firefox 隱藏捲軸 */
  -webkit-overflow-scrolling: touch;
  justify-content: flex-start;
}
.home-menu::-webkit-scrollbar { display: none; }  /* WebKit 隱藏捲軸 */
/* 卡片數少（iOS 3 張）在桌機塞得下時置中不留左偏 */
@media (min-width: 900px) {
  .home-menu { justify-content: safe center; }
}
```

- [ ] **Step 2: 改寫 .home-card 為直式分層卡片**

替換整段 `.home-card` 與 hover/active，並新增 bg/body/scrim：
```css
.home-card {
  position: relative;
  flex: 0 0 auto;
  width: 240px;                 /* 桌機放大版基準寬 */
  aspect-ratio: 3 / 4;
  min-height: 0;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;    /* 文字沉底 */
  text-align: left;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
  scroll-snap-align: center;
  background: var(--bg-card);
  transition: border-color var(--transition), box-shadow var(--transition), transform var(--transition);
}
.home-card-bg {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
  z-index: 0;
  transition: transform var(--transition);
}
.home-card-body {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: 16px 16px 18px;
  /* 底部深到透遮罩：壓住文字、確保可讀 */
  background: linear-gradient(to top, rgba(28,20,10,0.86) 0%, rgba(28,20,10,0.62) 32%, transparent 78%);
}
@media (hover: hover) {
  .home-card:hover {
    border-color: var(--gold);
    box-shadow: 0 12px 34px rgba(60,46,24,0.28);
    transform: translateY(-3px);
  }
  .home-card:hover .home-card-bg { transform: scale(1.04); }
}
.home-card:active { transform: translateY(-1px) scale(0.99); }
```

- [ ] **Step 3: 調整卡片內文字色階（疊在圖上提高對比）**

替換 title/desc/hint：
```css
.home-card-title {
  font-size: 22px;
  font-weight: 900;
  color: #f4e4bd;                 /* 亮金，疊深色遮罩上清晰 */
  letter-spacing: 2px;
  white-space: nowrap;
  text-shadow: 0 1px 3px rgba(0,0,0,0.55);
}
.home-card-desc {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  font-size: 13px;
  color: rgba(244,228,189,0.82);
  letter-spacing: 1px;
  line-height: 1.55;
  text-shadow: 0 1px 2px rgba(0,0,0,0.5);
}
.home-card-desc span { white-space: nowrap; }
.home-card-hint {
  margin-top: 6px;
  font-size: 12px;
  color: #ffd9a8;
  font-weight: 600;
  letter-spacing: 1px;
  text-shadow: 0 1px 2px rgba(0,0,0,0.5);
}
```

- [ ] **Step 4: 響應式與 reduced-motion**

替換舊的 `@media (max-width:700px)` / `(max-width:430px)` grid 斷點為卡寬調整，並加 reduced-motion：
```css
/* 平板：卡片略縮 */
@media (max-width: 820px) {
  .home-card { width: 210px; }
}
/* 手機：露約 1.3 張（卡寬約視窗 72%）*/
@media (max-width: 560px) {
  .home-card { width: 72vw; max-width: 300px; }
  .home-menu { scroll-padding: 0 16px; }
}
@media (prefers-reduced-motion: reduce) {
  .home-menu { scroll-behavior: auto; }
  .home-card, .home-card-bg { transition: none; }
  .home-card:hover .home-card-bg { transform: none; }
}
```

- [ ] **Step 5: 瀏覽器目視驗證三斷點**

Run（背景啟動 dev server）：
```bash
cd /Users/hd/WORK/case/gogame/gogame-src && npm run dev
```
用 claude-in-chrome 或手動開 `http://localhost:5173`，檢查：桌機露 3–4 張放大卡、可左右捲吸附；平板；手機露約 1.3 張。逐項確認：圖鋪滿、底部遮罩讓標題/對句/提示清晰、hover 上浮。列出「已比對項目清單」（紋理、圓角、陰影、間距、文字對比）。

- [ ] **Step 6: Commit**

```bash
cd /Users/hd/WORK/case/gogame/gogame-src
git add style.css
git commit -m "首頁卡片：改為直式水墨圖 scroll-snap 卡片列，含底部遮罩與 reduced-motion"
```

---

## Task 4: 桌機左右箭頭鈕（漸進增強）

**Files:**
- Modify: `main.js`（新增箭頭初始化函式，於首頁渲染後呼叫）
- Modify: `style.css`（箭頭鈕樣式）

**Interfaces:**
- Consumes: `#homeMenu` scroll 容器（Task 3）。
- Produces: 兩顆 `.home-nav-arrow`（prev/next），以一張卡寬 `scrollBy`，端點時淡出。

- [ ] **Step 1: JS 建立箭頭鈕與捲動邏輯**

在 `main.js` 的 `renderHome()` 之後新增，並於 `applyRoute` 進首頁時（`showScreen('home'); renderHome();`）呼叫一次 `initHomeArrows()`（用 flag 避免重複綁定）：
```js
let homeArrowsInited = false;
function initHomeArrows() {
  if (homeArrowsInited) return;
  const menu = document.getElementById('homeMenu');
  if (!menu || !menu.parentElement) return;
  homeArrowsInited = true;

  const mk = (dir, label) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `home-nav-arrow home-nav-${dir}`;
    b.setAttribute('aria-label', label);
    b.innerHTML = dir === 'prev'
      ? '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>'
      : '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>';
    b.addEventListener('click', () => {
      const card = menu.querySelector('.home-card');
      const step = card ? card.getBoundingClientRect().width + 16 : menu.clientWidth * 0.8;
      menu.scrollBy({ left: dir === 'prev' ? -step : step, behavior: 'smooth' });
    });
    return b;
  };

  const wrap = menu.parentElement;      // .home-screen
  const prev = mk('prev', '上一組棋');
  const next = mk('next', '下一組棋');
  wrap.appendChild(prev);
  wrap.appendChild(next);

  const update = () => {
    const atStart = menu.scrollLeft <= 2;
    const atEnd = menu.scrollLeft + menu.clientWidth >= menu.scrollWidth - 2;
    const overflowing = menu.scrollWidth > menu.clientWidth + 4;
    prev.classList.toggle('is-hidden', !overflowing || atStart);
    next.classList.toggle('is-hidden', !overflowing || atEnd);
  };
  menu.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  update();
}
```
並在 `applyRoute` 的 home 分支呼叫（找到 `showScreen('home'); renderHome();` 後加 `initHomeArrows();`），以及在 `renderHome()` 末尾若已初始化則呼叫一次 update（可用自訂事件或直接於 `initHomeArrows` 內 `requestAnimationFrame(update)`）。最小作法：`renderHome()` 末尾加 `if (homeArrowsInited) requestAnimationFrame(() => document.getElementById('homeMenu')?.dispatchEvent(new Event('scroll')));`。

- [ ] **Step 2: 箭頭鈕樣式（僅 hover 裝置顯示）**

`style.css` 新增：
```css
.home-nav-arrow {
  display: none;
}
@media (hover: hover) and (min-width: 900px) {
  .home-screen { position: relative; }
  .home-nav-arrow {
    display: flex;
    align-items: center;
    justify-content: center;
    position: absolute;
    top: calc(50% + 8px);
    transform: translateY(-50%);
    width: 44px;
    height: 44px;
    padding: 0;
    border-radius: 50%;
    border: 1px solid var(--border-hl);
    background: rgba(250,246,234,0.92);
    color: var(--gold-dim);
    box-shadow: 0 6px 18px rgba(60,46,24,0.22);
    cursor: pointer;
    z-index: 3;
    transition: opacity var(--transition), background var(--transition), transform var(--transition);
  }
  .home-nav-arrow:hover { background: #fff; transform: translateY(-50%) scale(1.06); }
  .home-nav-prev { left: -6px; }
  .home-nav-next { right: -6px; }
  .home-nav-arrow.is-hidden { opacity: 0; pointer-events: none; }
}
@media (prefers-reduced-motion: reduce) {
  .home-nav-arrow { transition: opacity var(--transition); }
}
```

- [ ] **Step 3: build + 桌機目視驗證**

Run:
```bash
cd /Users/hd/WORK/case/gogame/gogame-src && npm run build 2>&1 | tail -3
```
dev 開瀏覽器（桌機寬度）：箭頭顯示、點擊捲一張卡、捲到頭/尾對應箭頭淡出；iOS 版 3 張塞得下時箭頭應隱藏（不 overflow）。鍵盤 Tab 能聚焦箭頭、Enter 可捲。

- [ ] **Step 4: Commit**

```bash
cd /Users/hd/WORK/case/gogame/gogame-src
git add main.js style.css
git commit -m "首頁卡片：桌機左右箭頭鈕（漸進增強，端點淡出、可鍵盤操作）"
```

---

## Task 5: iOS 剝除 5 張 web-only 卡片圖並驗證合規

**Files:**
- Modify: `scripts/strip-ios-assets.mjs`（`TARGETS` 陣列）

**Interfaces:**
- Consumes: Task 1 的卡片圖、既有 `__IOS_STORE__` 過濾（iOS 只用 play/gomoku/othello）。
- Produces: iOS dist 只含 3 張卡片圖，合規 grep 仍通過。

- [ ] **Step 1: TARGETS 加入 5 張 web-only 卡片圖**

在 `scripts/strip-ios-assets.mjs` 的 `TARGETS` 陣列末尾加入：
```js
  'img/cards/tsumego.webp',
  'img/cards/xiangqi.webp',
  'img/cards/xqpuzzle.webp',
  'img/cards/shogi.webp',
  'img/cards/chess.webp',
```

- [ ] **Step 2: 跑 iOS build**

Run:
```bash
cd /Users/hd/WORK/case/gogame/gogame-src && npm run build:ios 2>&1 | tail -15
```
Expected: 印出移除項目（含 5 張卡片圖）、`✓ 合規驗證通過`。

- [ ] **Step 3: 驗證 iOS dist 只剩 3 張卡片圖**

Run:
```bash
cd /Users/hd/WORK/case/gogame/gogame-src && ls dist/img/cards/
```
Expected: 只有 `gomoku.webp othello.webp play.webp`。

- [ ] **Step 4: 還原 web dist（避免留下精簡包）**

Run:
```bash
cd /Users/hd/WORK/case/gogame/gogame-src && npm run build >/dev/null 2>&1 && ls dist/img/cards/ | wc -l
```
Expected: 8。

- [ ] **Step 5: Commit**

```bash
cd /Users/hd/WORK/case/gogame/gogame-src
git add scripts/strip-ios-assets.mjs
git commit -m "iOS build：剝除 5 張 web-only 水墨卡片圖，保持精簡包"
```

---

## Task 6: 全面驗證與版本戳記

**Files:**
- （視情況）Modify: 版本戳記由 `generate-version.js` 於 build 自動處理，無需手改。

- [ ] **Step 1: 兩種 build + jest 全綠**

Run:
```bash
cd /Users/hd/WORK/case/gogame/gogame-src
npm run build:ios 2>&1 | tail -3
npm run build 2>&1 | tail -3
npm test 2>&1 | tail -3
```
Expected: 兩 build 皆 `✓`，iOS 合規通過；jest 299 passed。

- [ ] **Step 2: 三斷點 + reduced-motion 目視**

dev 開瀏覽器逐項確認並列「已比對項目清單」：
- 桌機：3–4 張放大卡、箭頭、吸附捲動、文字對比。
- 平板 / 手機：露邊比例、可滑、無破版。
- 開系統「減少動態」→ 吸附與圖片放大關閉。
- iOS 版（`build:ios` 後）首頁只 3 張卡、對應 3 張圖、無箭頭 overflow。

- [ ] **Step 3: 硬重整提醒**

因改了 CSS/JS，於回報時提醒使用者：卡片圖或版面沒更新請「強制重整」（或確認 SW 已更新版號）。

---

## Self-Review（撰寫後自查結果）

- **Spec coverage**：版面互動（T3）、卡片視覺/遮罩（T3）、水墨圖生成（T1）、程式改動 HOME_ITEMS/renderHome（T2）、無障礙 aria-hidden 圖層/箭頭 aria-label/reduced-motion（T2/T3/T4）、PWA runtime cache（無需改 sw.js，T6 驗證涵蓋）、iOS strip（T5）、範圍界線（僅首頁）——皆有對應任務。
- **Placeholder scan**：無 TBD/TODO；每個改動步驟均附實際程式碼與指令。
- **Type/命名一致**：`.home-card-bg` / `.home-card-body` / `.home-card-title|desc|hint` / `.home-nav-arrow(.home-nav-prev|next)` / `initHomeArrows()` / `homeArrowsInited` 於各任務一致；`HOME_ITEMS` 的 `img` 欄位路徑與 Task 1 檔名一致；iOS strip 的 5 個 id 對齊 `webOnly` 項。
- **PWA note**：SW fetch handler 預設分支已對 same-origin GET 做 runtime cache（cache-first），卡片圖首次造訪自動快取，無需改 `sw.js`、亦不進 `PRECACHE_ASSETS`——符合 spec。
