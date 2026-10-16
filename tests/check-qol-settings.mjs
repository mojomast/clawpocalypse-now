import assert from 'node:assert/strict';
import { createOptions, DEFAULTS, OPTION_META } from '../options.js';

// The exact default record required by the QoL roadmap.
const EXPECTED = {
  reducedFlash: false, reducedMotion: false, subtitleScale: 1, textSpeed: 1,
  colourSafe: false, holdToAdvance: false, screenShake: true, padDeadzone: 0.25, padPreset: 'classic',
};

function stubValue(name, value) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, name);
  const desc = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  return () => { if (had || desc) Object.defineProperty(globalThis, name, desc); else delete globalThis[name]; };
}
function memStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  const store = {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: k => { map.delete(k); },
  };
  return { store, map };
}
const reduce = () => ({ matches: true });
const noReduce = () => ({ matches: false });

// 1. Hard acceptance: no stored prefs and no OS matchMedia => exactly DEFAULTS.
{
  const restore = [stubValue('matchMedia', noReduce), stubValue('localStorage', memStorage().store)];
  try {
    const api = createOptions();
    assert.deepEqual(api.values, EXPECTED, 'no OS preference must deep-equal DEFAULTS');
    assert.deepEqual(DEFAULTS, EXPECTED, 'DEFAULTS is the roadmap default record');
    assert.equal(api.screenShake, true);
    assert.equal(api.shakeEnabled, true, 'shakeEnabled aliases screenShake');
    assert.equal(api.shakeScale, 1, 'default shake is undamped');
  } finally { restore.reverse().forEach(fn => fn()); }
}

// 2. No stored prefs + OS reduce => seeds flash+motion; motion suppresses shake.
{
  const restore = [stubValue('matchMedia', reduce), stubValue('localStorage', memStorage().store)];
  try {
    const api = createOptions();
    assert.equal(api.reducedFlash, true, 'OS reduce seeds reducedFlash (conservative, not a safety guarantee)');
    assert.equal(api.reducedMotion, true, 'OS reduce seeds reducedMotion');
    assert.equal(api.shakeScale, 0, 'reducedMotion (master motion policy) suppresses shake');
    assert.equal(api.motionScale, 0, 'reducedMotion snaps the camera');
    assert.equal(api.screenShake, true, 'OS seeding does not touch screen shake');
  } finally { restore.reverse().forEach(fn => fn()); }
}

// 2b. reducedFlash ALONE (motion off) still damps shake to a third, independent of motion.
{
  const restore = stubValue('localStorage', memStorage().store);
  try {
    const api = createOptions();
    api.set('reducedMotion', false);
    api.set('reducedFlash', true);
    assert.equal(api.shakeScale, 0.33, 'reducedFlash alone damps shake to a third');
    api.set('reducedMotion', true);
    assert.equal(api.shakeScale, 0, 'turning on reducedMotion then suppresses shake without changing reducedFlash');
    assert.equal(api.reducedFlash, true, 'reducedMotion does not flip reducedFlash');
    api.set('reducedMotion', false);
    assert.equal(api.shakeScale, 0.33, 'reducedFlash still damps after motion is turned back off');
  } finally { restore(); }
}

// 3. An explicit stored false must beat the OS reduce hint.
{
  const { store } = memStorage({ 'pp.options': JSON.stringify({ reducedMotion: false, reducedFlash: false }) });
  const restore = [stubValue('matchMedia', reduce), stubValue('localStorage', store)];
  try {
    const api = createOptions();
    assert.equal(api.reducedFlash, false, 'stored false wins over OS reduce');
    assert.equal(api.reducedMotion, false, 'stored false wins over OS reduce');
    assert.equal(api.shakeScale, 1);
    assert.equal(api.motionScale, 1);
  } finally { restore.reverse().forEach(fn => fn()); }
}

// 4. Partial stored prefs: only the missing key is seeded.
{
  const { store } = memStorage({ 'pp.options': JSON.stringify({ reducedFlash: false }) });
  const restore = [stubValue('matchMedia', reduce), stubValue('localStorage', store)];
  try {
    const api = createOptions();
    assert.equal(api.reducedFlash, false, 'explicit reducedFlash=false stays false');
    assert.equal(api.reducedMotion, true, 'missing reducedMotion seeds from the OS');
    assert.equal(api.shakeScale, 0, 'seeded reducedMotion suppresses shake even though flash is off');
  } finally { restore.reverse().forEach(fn => fn()); }
}

// 4b. No OS preference + a partial stored record: missing keys keep DEFAULTS (not false).
{
  const { store } = memStorage({ 'pp.options': JSON.stringify({ reducedFlash: true }) });
  const restore = [stubValue('matchMedia', noReduce), stubValue('localStorage', store)];
  try {
    const api = createOptions();
    assert.equal(api.reducedFlash, true);
    assert.equal(api.screenShake, true, 'missing screenShake must keep its true default');
    assert.equal(api.reducedMotion, false);
    assert.equal(api.padPreset, 'classic');
  } finally { restore.reverse().forEach(fn => fn()); }
}

// 5. Explicit STRING options validate against OPTION_META.options.
{
  const restore = stubValue('localStorage', memStorage().store);
  try {
    const api = createOptions();
    assert.deepEqual(OPTION_META.padPreset.options, ['classic', 'alternate']);
    assert.equal(api.set('padPreset', 'bogus'), 'classic', 'unknown preset is rejected');
    assert.equal(api.get('padPreset'), 'classic');
    assert.equal(api.set('padPreset', 'alternate'), 'alternate', 'valid preset accepted');
    assert.equal(api.get('padPreset'), 'alternate');
    assert.equal(api.set('padPreset', 7), 'classic', 'non-string falls back to default');
  } finally { restore(); }
}

// 6. Number options clamp to their meta bounds.
{
  const restore = stubValue('localStorage', memStorage().store);
  try {
    const api = createOptions();
    assert.equal(api.set('padDeadzone', 9), 0.5, 'high deadzone clamps to 0.5');
    assert.equal(api.set('padDeadzone', 0), 0.1, 'low deadzone clamps to 0.1');
    assert.equal(api.set('subtitleScale', 99), 1.6, 'subtitle clamps to max');
  } finally { restore(); }
}

// 7. screenShake is independent of reducedFlash.
{
  const restore = stubValue('localStorage', memStorage().store);
  try {
    const api = createOptions();
    api.set('reducedFlash', false);
    api.set('screenShake', false);
    assert.equal(api.shakeScale, 0, 'screenShake off => no shake');
    assert.equal(api.reducedFlash, false, 'screenShake off does not flip reducedFlash');
    api.set('reducedFlash', true);
    assert.equal(api.shakeScale, 0, 'screenShake off wins over reducedFlash');
    api.set('screenShake', true);
    assert.equal(api.shakeScale, 0.33, 'screenShake on + reducedFlash => damped');
    api.set('reducedFlash', false);
    assert.equal(api.shakeScale, 1, 'defaults => full shake');
  } finally { restore(); }
}

// 8. reset() restores DEFAULTS; onChange fires and unsubscribes.
{
  const restore = stubValue('localStorage', memStorage().store);
  try {
    const api = createOptions();
    api.set('screenShake', false);
    api.set('padPreset', 'alternate');
    api.reset();
    assert.deepEqual(api.values, EXPECTED, 'reset restores DEFAULTS');

    const calls = [];
    const off = api.onChange((k, v) => calls.push([k, v]));
    api.set('padPreset', 'alternate');
    assert.deepEqual(calls, [['padPreset', 'alternate']], 'listener fired on set');
    off();
    api.set('padPreset', 'classic');
    assert.equal(calls.length, 1, 'unsubscribe stops further calls');

    // reset() must notify listeners for the values it changes, so mirrored flags
    // (pause -> fx.shakeEnabled) cannot go stale.
    const resetCalls = [];
    const off2 = api.onChange((k, v) => resetCalls.push([k, v]));
    api.set('screenShake', false);
    api.set('reducedMotion', true);
    resetCalls.length = 0;
    api.reset();
    assert.deepEqual(resetCalls.map(c => c[0]).sort(), ['reducedMotion', 'screenShake'], 'reset notifies only changed keys');
    off2();
    api.set('screenShake', false);
    const seen = resetCalls.length;
    api.reset();
    assert.equal(resetCalls.length, seen, 'unsubscribe stops reset notifications');
  } finally { restore(); }
}

// 9. localStorage that throws on access still degrades to memory.
{
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'localStorage');
  const desc = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });
  try {
    const api = createOptions();
    assert.deepEqual(api.values, EXPECTED, 'blocked storage still yields DEFAULTS');
    assert.equal(api.set('padDeadzone', 0.4), 0.4, 'writes still land in memory');
    assert.equal(api.get('padDeadzone'), 0.4);
  } finally {
    if (had || desc) Object.defineProperty(globalThis, 'localStorage', desc);
    else delete globalThis.localStorage;
  }
}

console.log('check-qol-settings: OK');
