// Accessibility options.
//
// Small, explicit values with guarded persistence (Orbit's sandbox blocks storage, so
// the store degrades to memory). Defaults reproduce today's behaviour exactly: with
// nothing toggled the game must be byte-for-byte as it was, which is why every hook
// reads these through a getter rather than a baked-in branch.
export const DEFAULTS = {
  reducedFlash: false,    // dampen screen shake, hit flashes and the glitch/pulse effects
  reducedMotion: false,   // no camera pans or idle drift; things cut instead of gliding
  subtitleScale: 1,       // dialogue and bark text size multiplier
  textSpeed: 1,           // typewriter speed multiplier (0.5 = half speed, twice as long)
  colourSafe: false,      // telegraphs add a shape cue, not just a colour change
  holdToAdvance: false,   // dialogue only advances on a press, never on a timer
  screenShake: true,      // camera shake on impacts (independent of flash/motion)
  padDeadzone: 0.25,      // left-stick deadzone
  padPreset: 'classic',   // 'classic' | 'alternate' (single-press dash)
};

export const OPTION_META = {
  reducedFlash: { label: 'Reduced flash', note: 'Softer shake, dimmer hit flashes' },
  reducedMotion: { label: 'Reduced motion', note: 'Camera cuts instead of panning' },
  subtitleScale: { label: 'Subtitle size', min: 0.8, max: 1.6, step: 0.1 },
  textSpeed: { label: 'Text speed', min: 0.5, max: 2, step: 0.25 },
  colourSafe: { label: 'Colour-safe cues', note: 'Telegraphs get a shape, not just a colour' },
  holdToAdvance: { label: 'Hold to advance', note: 'Dialogue waits for you' },
  screenShake: { label: 'Screen shake', note: 'Camera shake on impacts (independent of flash/motion)' },
  padDeadzone: { label: 'Pad deadzone', min: 0.1, max: 0.5, step: 0.05 },
  padPreset: { label: 'Pad preset', options: ['classic', 'alternate'], note: 'alternate: P1 pad single-press dash' },
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const sanitise = raw => {
  const out = { ...DEFAULTS };
  if (!raw || typeof raw !== 'object') return out;
  for (const key of Object.keys(DEFAULTS)) {
    const v = raw[key];
    if (typeof DEFAULTS[key] === 'boolean') { if (v !== undefined) out[key] = !!v; }
    else if (typeof DEFAULTS[key] === 'string') {
      const meta = OPTION_META[key] || {};
      if (Array.isArray(meta.options) && meta.options.includes(v)) out[key] = v;
    } else if (typeof DEFAULTS[key] === 'number' && Number.isFinite(v)) {
      const meta = OPTION_META[key] || {};
      out[key] = clamp(v, meta.min != null ? meta.min : 0, meta.max != null ? meta.max : 4);
    }
  }
  return out;
};

// OS preference for reduced motion. Absent in Node and often blocked in the Orbit
// sandbox, so every access is guarded and a missing matchMedia is simply "no".
function prefersReducedMotion() {
  try {
    return !!(globalThis.matchMedia && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch (_) { return false; }
}
const hasStored = (raw, key) => !!(raw && typeof raw === 'object' && raw[key] !== undefined);

export function createOptions() {
  const KEY = 'pp.options';
  // The live values are held in this module so game code can read them without a
  // dependency chain, and so a test can drive them directly.
  const values = { ...DEFAULTS };
  const raw = readRaw();
  Object.assign(values, sanitise(raw));
  // Seed from the OS only when the player has never saved an explicit choice. A
  // stored false is a deliberate preference and must survive an OS reduce hint.
  // reducedFlash is seeded conservatively from the same motion preference: the OS
  // asked for less motion, so softer flashing is the kind default — but this is a
  // comfort default, NOT a photosensitivity or WCAG safety guarantee.
  if (prefersReducedMotion()) {
    if (!hasStored(raw, 'reducedFlash')) values.reducedFlash = true;
    if (!hasStored(raw, 'reducedMotion')) values.reducedMotion = true;
  }
  let listeners = [];

  function readRaw() {
    try {
      const raw = globalThis.localStorage && globalThis.localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }               // sandboxed origin: memory only
  }
  function persist() {
    try { if (globalThis.localStorage) globalThis.localStorage.setItem(KEY, JSON.stringify(values)); } catch { /* memory only */ }
  }
  function set(key, v) {
    if (!(key in DEFAULTS)) return values[key];
    const next = sanitise({ ...values, [key]: v })[key];
    if (values[key] === next) return next;
    values[key] = next;
    persist();
    for (const fn of listeners) { try { fn(key, next); } catch { /* a listener must not break the game */ } }
    return next;
  }
  function toggle(key) {
    if (typeof DEFAULTS[key] !== 'boolean') return values[key];
    return set(key, !values[key]);
  }
  function reset() {
    // Notify listeners for every value that actually changed, so mirrored flags
    // (e.g. the pause -> fx.shakeEnabled bridge) cannot go stale after a reset.
    for (const k of Object.keys(DEFAULTS)) {
      const next = DEFAULTS[k];
      if (values[k] === next) continue;
      values[k] = next;
      for (const fn of listeners) { try { fn(k, next); } catch { /* a listener must not break the game */ } }
    }
    persist();
  }
  function onChange(fn) { listeners.push(fn); return () => { listeners = listeners.filter(f => f !== fn); }; }

  // Shorthands the rest of the game reads. Each one is a plain getter so a toggle
  // takes effect on the next frame with no re-plumbing.
  const api = {
    values,
    get: key => values[key],
    set, toggle, reset, onChange,
    get reducedFlash() { return values.reducedFlash; },
    get reducedMotion() { return values.reducedMotion; },
    get subtitleScale() { return values.subtitleScale; },
    get textSpeed() { return values.textSpeed; },
    get colourSafe() { return values.colourSafe; },
    get holdToAdvance() { return values.holdToAdvance; },
    get screenShake() { return values.screenShake; },
    // Alias: unowned modules (arcade/screens via window.__ppFx) read OPTIONS.shakeEnabled.
    get shakeEnabled() { return values.screenShake; },
    get padDeadzone() { return values.padDeadzone; },
    get padPreset() { return values.padPreset; },
    // Screen-shake multiplier. Two independent needs can suppress/dampen it,
    // and neither is aliased to the other:
    //   - screenShake (its own toggle) === false -> hard off;
    //   - reducedMotion (master motion policy) -> off, so a player who turns off
    //     flashing but not motion still gets no camera shake;
    //   - reducedFlash alone -> damped to a third (juice kept, smaller).
    // Defaults (all off) => 1.
    get shakeScale() {
      if (!values.screenShake) return 0;
      if (values.reducedMotion) return 0;
      return values.reducedFlash ? 0.33 : 1;
    },
    // Camera ease multiplier: reduced motion snaps instead of gliding.
    get motionScale() { return values.reducedMotion ? 0 : 1; },
    // A typewriter rate adjusted for text speed (never faster than 4x, never zero).
    typeRate: base => Math.max(4, (Number(base) || 46) * values.textSpeed),
    // Dialogue text size.
    fontFor: (size, family = 'monospace') => `${Math.round(size * values.subtitleScale)}px ${family}`,
    // Hold-to-advance or timer: how long a line is allowed to sit before it moves on.
    holdFor: (line, baseHold) => (values.holdToAdvance ? Infinity : baseHold),
    meta: OPTION_META,
  };
  if (typeof window !== 'undefined') window.__ppOptions = api;
  return api;
}
