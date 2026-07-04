// entitlements.js — 完整版（premium）旗標與每日免費額度（純邏輯、storage 注入）。
//
// 商業模式：freemium。核心對弈全部免費；進階功能（AI 覆盤分析吃到飽、形勢判斷、
// 手動選級、SGF 匯出）由「完整版」一次性解鎖。完整版旗標目前存 localStorage，
// 之後接上商店 IAP（購買/恢復購買成功 → setPremium(true)）；在那之前旗標僅供
// 開發測試用，正式版不會有 UI 直接開啟它。
//
// 每日額度：讓免費使用者每天可試用 N 次進階功能。存 JSON {date, used}，跨日自動重置。
// 日期字串由呼叫端傳入（方便測試；格式如 '2026-07-04'）。

const PREMIUM_KEY = 'gogame_premium';
const QUOTA_PREFIX = 'gogame_quota_';

export function isPremium(storage) {
  try { return storage.getItem(PREMIUM_KEY) === '1'; } catch (_) { return false; }
}

export function setPremium(storage, on) {
  try { storage.setItem(PREMIUM_KEY, on ? '1' : '0'); } catch (_) {}
}

function readQuota(storage, name, today) {
  try {
    const raw = storage.getItem(QUOTA_PREFIX + name);
    if (!raw) return { date: today, used: 0 };
    const q = JSON.parse(raw);
    if (!q || q.date !== today || !Number.isFinite(q.used)) return { date: today, used: 0 };
    return q;
  } catch (_) {
    return { date: today, used: 0 };
  }
}

/** 今日剩餘可用次數（最少 0）。 */
export function remainingQuota(storage, name, limit, today) {
  return Math.max(0, limit - readQuota(storage, name, today).used);
}

/**
 * 從商店權益清單判斷是否擁有某商品（IAP 啟動校正／恢復購買用）。
 * plugin 的交易物件欄位名在 iOS/Android 間不一致（productId vs productIdentifier），兩者皆認。
 * purchaseState 存在且非 'PURCHASED'（如 Android 的 PENDING）不算擁有；iOS currentEntitlements
 * 通常無此欄位，視為有效。
 */
export function ownsProduct(purchases, productId) {
  if (!Array.isArray(purchases)) return false;
  return purchases.some((p) => {
    if (!p) return false;
    const id = p.productId ?? p.productIdentifier;
    if (id !== productId) return false;
    return p.purchaseState == null || p.purchaseState === 'PURCHASED';
  });
}

/** 記一次使用（跨日自動歸零重計）。 */
export function consumeQuota(storage, name, today) {
  const q = readQuota(storage, name, today);
  try {
    storage.setItem(QUOTA_PREFIX + name, JSON.stringify({ date: today, used: q.used + 1 }));
  } catch (_) {}
}
