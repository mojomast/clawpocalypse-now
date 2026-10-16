import assert from 'node:assert/strict';
import { guardedStore, createCheckpoint, SAVE_VERSION } from '../save.js';
import { createShop } from '../shop.js';
import { createState } from '../logic.js';

// --- guardedStore: read success from base when memory is empty ---
{
  const base = { get(k) { return 'persisted:' + k; }, set() {}, remove() {} };
  const st = guardedStore(base);
  assert.equal(st.get('alpha'), 'persisted:alpha', 'read success falls back to base');
}

// --- guardedStore: write failure leaves memory authoritative ---
{
  const base = { get() { return 'stale'; }, set() { throw new Error('write fail'); }, remove() { throw new Error('remove fail'); } };
  const st = guardedStore(base);
  st.set('k', 'memory-value');
  assert.equal(st.get('k'), 'memory-value', 'memory authoritative after base.set throws');
}

// --- guardedStore: remove stores a tombstone null ---
{
  const base = { get() { return 'stale'; }, set() {}, remove() { throw new Error('remove fail'); } };
  const st = guardedStore(base);
  st.set('k', 'v');
  st.remove('k');
  assert.equal(st.get('k'), null, 'remove leaves a null tombstone');
  assert.equal(st.get('other'), 'stale', 'other keys still read from base');
}

// --- guardedStore: valid fallback when no base supplied / base.get throws ---
{
  const st = guardedStore(null);
  assert.equal(st.get('missing'), null, 'missing returns null');
  st.set('k', 'v');
  assert.equal(st.get('k'), 'v', 'memory survives when storage unavailable');
  const st2 = guardedStore({ get() { throw new Error('boom'); }, set() {}, remove() {} });
  assert.equal(st2.get('x'), null, 'base.get throw is treated as null');
}

// --- shop: fresh owner reset + persistent defaults ---
{
  const shop = createShop({});
  const s = createState();
  shop.stepWorld(s);
  assert.equal(s.coins, 0, 'coins default to 0');
  assert.deepEqual(s.shopBuys, { hp: 0, dmg: 0, life: 0, meter: 0, ammo: 0 }, 'shopBuys normalized');
  assert.equal(s.dmgMult, 1, 'dmgMult default');
  assert.equal(s.superStart, 0, 'superStart default');
  assert.equal(s.weaponLevel, 1, 'weaponLevel default');
  assert.equal(s.maxHp, 100, 'maxHp default');
}

// --- shop: restored values preserved across ensure ---
{
  const shop = createShop({});
  const s = createState();
  s.coins = 50;
  s.maxHp = 140;
  s.shopBuys = { hp: 2, dmg: 1, life: 0, meter: 0, ammo: 1 };
  s.dmgMult = 1.15;
  s.weaponLevel = 3;
  s.superStart = 0;
  shop.stepWorld(s);
  assert.equal(s.maxHp, 140, 'maxHp preserved');
  assert.equal(s.dmgMult, 1.15, 'dmgMult preserved');
  assert.equal(s.weaponLevel, 3, 'weaponLevel preserved');
  assert.deepEqual(s.shopBuys, { hp: 2, dmg: 1, life: 0, meter: 0, ammo: 1 }, 'shopBuys preserved');
  assert.equal(s.coins, 50, 'coins preserved');
}

// --- shop: resumed purchase pricing + limits after restore ---
{
  const shop = createShop({});
  const s = createState();
  s.hpMode = true;
  const saved = { v: SAVE_VERSION, wave: 2, hero: 'teknium', difficulty: 'normal',
    coins: 100, maxHp: 140, shopBuys: { hp: 2, dmg: 1, life: 0, meter: 1, ammo: 0 },
    dmgMult: 1.15, weaponLevel: 1, superStart: 50, lives: 3, score: 100 };
  const checkpoint = createCheckpoint({ store: { get() { return JSON.stringify(saved); }, set() {} } });
  assert.equal(checkpoint.arm(), true);
  assert.equal(checkpoint.resume(s), true);
  shop.stepWorld(s); // resume -> stepWorld initializes owner and trackers
  assert.equal(s.dmgMult, 1.15);
  assert.equal(s.superStart, 50);
  assert.equal(shop.open(s), true, 'shop opens');
  assert.equal(shop.price(s, 'hp'), 22, 'third hp purchase prices correctly');
  assert.equal(shop.buy(0), true, 'hp purchase succeeds');
  assert.equal(s.shopBuys.hp, 3, 'buy count increments');
  assert.equal(s.maxHp, 160, 'maxHp increases on hp buy');
  assert.equal(s.coins, 78, 'coins deducted by price');
  assert.equal(shop.buy(0), false, 'maxed item is blocked');
  shop.leave();
  const fresh = createState();
  shop.stepWorld(fresh);
  assert.equal(fresh.dmgMult, 1, 'same shop instance resets defaults for a genuinely fresh run');
  assert.equal(fresh.superStart, 0);
  assert.equal(fresh.shopBuys.hp, 0);
  assert.equal(fresh.maxHp, 100);
}

// Default localStorage adapter also respects write failures and deletion tombstones.
{
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    const disk = new Map([['k', 'old']]);
    let failWrites = true;
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
      getItem(k) { return disk.get(k) ?? null; },
      setItem(k, v) { if (failWrites) throw new Error('quota'); disk.set(k, v); },
      removeItem(k) { if (failWrites) throw new Error('quota'); disk.delete(k); },
    } });
    const store = guardedStore();
    assert.equal(store.get('k'), 'old');
    store.set('k', 'new'); assert.equal(store.get('k'), 'new');
    store.remove('k'); assert.equal(store.get('k'), null);
    assert.equal(disk.get('k'), 'old', 'failed persistence remains stale on disk, not in-session');
    failWrites = false;
    store.set('k', 'latest'); assert.equal(disk.get('k'), 'latest');
    store.remove('k'); assert.equal(disk.has('k'), false);
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  }
}

console.log('check-audit-state-save: OK');
