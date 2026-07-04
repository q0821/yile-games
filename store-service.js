// store-service.js — App 內購買（完整版一次性解鎖）薄封裝。
//
// 使用 @capgo/native-purchases（原生 StoreKit 2 / Play Billing，免後端、免第三方帳號）。
// 僅在 Capacitor 原生環境啟用；Web 版一律回報商店不可用，UI 顯示「完整版於 App 內購買」。
// plugin 以動態 import 載入：web bundle 只多一個小 chunk、且永不執行原生呼叫。
//
// 權益真相來源是商店（getPurchases onlyCurrentEntitlements），localStorage 的 premium 旗標
// 只是快取：啟動時 syncEntitlements() 校正（含退款回收）；查詢失敗（離線）時不動旗標，
// 避免把付費使用者誤降級。

import { setPremium, ownsProduct } from './entitlements.js';

// App Store Connect 需建立同 ID 的「非消耗型」商品（Non-Consumable）。
export const FULL_VERSION_PRODUCT_ID = 'com.yilegames.app.full';

function isNative() {
  const c = typeof window !== 'undefined' ? window.Capacitor : null;
  return !!(c && typeof c.isNativePlatform === 'function' && c.isNativePlatform());
}

async function loadPlugin() {
  const mod = await import('@capgo/native-purchases');
  return { NativePurchases: mod.NativePurchases, PURCHASE_TYPE: mod.PURCHASE_TYPE };
}

/** 目前環境是否可購買（原生 App 內才會 true）。 */
export function storeAvailable() {
  return isNative();
}

/** 啟動時校正 premium 旗標：以商店目前有效權益為準；查詢失敗維持現狀。 */
export async function syncEntitlements() {
  if (!isNative()) return;
  try {
    const { NativePurchases, PURCHASE_TYPE } = await loadPlugin();
    const { isBillingSupported } = await NativePurchases.isBillingSupported();
    if (!isBillingSupported) return;
    const { purchases } = await NativePurchases.getPurchases({
      productType: PURCHASE_TYPE.INAPP,
      onlyCurrentEntitlements: true,
    });
    setPremium(localStorage, ownsProduct(purchases, FULL_VERSION_PRODUCT_ID));
  } catch (err) {
    console.warn('[store] 權益同步失敗（離線或商店暫不可用），維持現有旗標', err);
  }
}

/** 取完整版的商店顯示價格（如「NT$90」）；不可用時回 null。 */
export async function getFullVersionPrice() {
  if (!isNative()) return null;
  try {
    const { NativePurchases, PURCHASE_TYPE } = await loadPlugin();
    const { product } = await NativePurchases.getProduct({
      productIdentifier: FULL_VERSION_PRODUCT_ID,
      productType: PURCHASE_TYPE.INAPP,
    });
    return product?.priceString || null;
  } catch (_) {
    return null;
  }
}

/**
 * 購買完整版。回傳 { ok:true } 或 { ok:false, cancelled?:true, message }。
 * 成功即寫入 premium 旗標（gating 讀旗標，功能立即解鎖，毋需重啟）。
 */
export async function purchaseFullVersion() {
  if (!isNative()) return { ok: false, message: '請在 App 內購買' };
  try {
    const { NativePurchases, PURCHASE_TYPE } = await loadPlugin();
    await NativePurchases.purchaseProduct({
      productIdentifier: FULL_VERSION_PRODUCT_ID,
      productType: PURCHASE_TYPE.INAPP,
      quantity: 1,
    });
    setPremium(localStorage, true);
    return { ok: true };
  } catch (err) {
    const msg = (err && err.message) ? err.message : String(err);
    // StoreKit 使用者取消：訊息含 cancel 字樣（各平台文案不一，寬鬆比對）
    if (/cancel/i.test(msg)) return { ok: false, cancelled: true, message: '已取消購買' };
    return { ok: false, message: msg };
  }
}

/** 恢復購買（換機/重裝）。回傳 { owned:boolean, message }。 */
export async function restoreFullVersion() {
  if (!isNative()) return { owned: false, message: '請在 App 內操作' };
  try {
    const { NativePurchases, PURCHASE_TYPE } = await loadPlugin();
    await NativePurchases.restorePurchases();
    const { purchases } = await NativePurchases.getPurchases({
      productType: PURCHASE_TYPE.INAPP,
      onlyCurrentEntitlements: true,
    });
    const owned = ownsProduct(purchases, FULL_VERSION_PRODUCT_ID);
    setPremium(localStorage, owned);
    return { owned, message: owned ? '已恢復完整版，感謝支持！' : '找不到這個 Apple 帳號的購買紀錄' };
  } catch (err) {
    return { owned: false, message: (err && err.message) ? err.message : String(err) };
  }
}
