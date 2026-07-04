// entitlements：完整版旗標 + 每日免費額度（跨日重置）。storage 注入、純邏輯可測。
const { sandboxWithEntitlements } = require('./helpers');

let E;
beforeAll(() => {
  E = sandboxWithEntitlements();
});

function makeStorage() {
  const store = {};
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
}

describe('premium 旗標', () => {
  test('預設不是完整版', () => {
    expect(E.isPremium(makeStorage())).toBe(false);
  });
  test('setPremium(true) 後為完整版，setPremium(false) 可關回', () => {
    const s = makeStorage();
    E.setPremium(s, true);
    expect(E.isPremium(s)).toBe(true);
    E.setPremium(s, false);
    expect(E.isPremium(s)).toBe(false);
  });
});

describe('每日免費額度', () => {
  test('沒用過時剩餘 = 上限', () => {
    expect(E.remainingQuota(makeStorage(), 'analysis', 1, '2026-07-04')).toBe(1);
  });
  test('consume 之後剩餘遞減、歸零後不再為正', () => {
    const s = makeStorage();
    E.consumeQuota(s, 'analysis', '2026-07-04');
    expect(E.remainingQuota(s, 'analysis', 1, '2026-07-04')).toBe(0);
    E.consumeQuota(s, 'analysis', '2026-07-04');
    expect(E.remainingQuota(s, 'analysis', 1, '2026-07-04')).toBe(0);
  });
  test('跨日重置：換一天剩餘回到上限', () => {
    const s = makeStorage();
    E.consumeQuota(s, 'analysis', '2026-07-04');
    expect(E.remainingQuota(s, 'analysis', 1, '2026-07-05')).toBe(1);
  });
  test('不同功能的額度各自獨立', () => {
    const s = makeStorage();
    E.consumeQuota(s, 'analysis', '2026-07-04');
    expect(E.remainingQuota(s, 'estimate', 1, '2026-07-04')).toBe(1);
  });
  test('storage 內容毀損時視為未使用（不炸）', () => {
    const s = makeStorage();
    s.setItem('gogame_quota_analysis', '{not json');
    expect(E.remainingQuota(s, 'analysis', 1, '2026-07-04')).toBe(1);
  });
});

describe('ownsProduct（從商店權益清單判斷是否擁有商品）', () => {
  test('清單含該商品（productId 欄位）→ true', () => {
    expect(E.ownsProduct([{ productId: 'com.yilegames.app.full' }], 'com.yilegames.app.full')).toBe(true);
  });
  test('清單含該商品（productIdentifier 欄位，plugin 兩種欄位名都出現過）→ true', () => {
    expect(E.ownsProduct([{ productIdentifier: 'com.yilegames.app.full' }], 'com.yilegames.app.full')).toBe(true);
  });
  test('purchaseState 明確非 PURCHASED 的項目不算擁有', () => {
    expect(E.ownsProduct([{ productId: 'com.yilegames.app.full', purchaseState: 'PENDING' }], 'com.yilegames.app.full')).toBe(false);
  });
  test('空清單 / null / 不含該商品 → false', () => {
    expect(E.ownsProduct([], 'com.yilegames.app.full')).toBe(false);
    expect(E.ownsProduct(null, 'com.yilegames.app.full')).toBe(false);
    expect(E.ownsProduct([{ productId: 'other' }], 'com.yilegames.app.full')).toBe(false);
  });
});
