// effects-safe.js — guarded, read-only gates for the three INDEPENDENT access
// needs this pass touches: flash dampening (`reducedFlash`), camera motion
// (`reducedMotion`) and screen shake (`shakeEnabled`/`shakeScale`), plus the
// shape-cue switch (`colourSafe`).
//
// CONTRACT: "off = unchanged, on = dampened".
//   - With every relevant option at its default (nothing selected, no OS
//     reduced-motion request) these helpers return the caller's base value
//     verbatim, so the rendered output stays byte-identical to the pre-QoL build.
//   - Turning an option on only ever REDUCES or damps a value. There is no
//     arbitrary "normal-mode" alpha cap anywhere: the defaults are untouched and
//     the on-state multiplies by a fixed factor (see FLASH_FACTOR).
//
// Flashes, motion and shake are NOT aliased: reducedFlash, reducedMotion and
// shakeEnabled are separate needs and are read through separate getters.
//
// DISCLAIMER: this is a comfort control, NOT a photosensitivity safety guarantee
// and NOT a claim of WCAG conformance. Damping one flash's peak alpha says
// nothing about the combined temporal sequence of flashes produced across
// modules; a real photosensitivity (WCAG 2.3.1) assessment would require
// modelling that combined sequence, which is out of scope for this pass.
//
// Every getter is wrapped in try/catch so a missing/renamed option falls back to
// the pre-QoL default (false / true / 1 / base).
import { OPTIONS } from './options-live.js';

export const FLASH_FACTOR = 0.25;

export function reducedFlash() {
  try { return !!(OPTIONS && OPTIONS.reducedFlash); } catch { return false; }
}

export function reducedMotion() {
  try { return !!(OPTIONS && OPTIONS.reducedMotion); } catch { return false; }
}

// Shake is its own need. options.js may or may not expose the `shakeEnabled`
// getter yet (a sibling worker owns that file), so treat anything other than an
// explicit `false` as enabled.
export function shakeEnabled() {
  try { return OPTIONS.shakeEnabled !== false; } catch { return true; }
}

// Shake magnitude multiplier. options.js folds BOTH independent needs in:
// screenShake (its own toggle) off => 0, reducedMotion (master motion policy) =>
// 0, and reducedFlash alone => 0.33. Defaults (all off) => 1.
export function shakeScale() {
  try {
    const v = OPTIONS && OPTIONS.shakeScale;
    return (typeof v === 'number' && Number.isFinite(v)) ? v : 1;
  } catch { return 1; }
}

// Damp a flash/screen-fill alpha only when reducedFlash is on.
export function flashAlpha(base, factor = FLASH_FACTOR) {
  try { return reducedFlash() ? base * factor : base; } catch { return base; }
}

// Shape-cue gate for the colour-safe telegraph work. Kept here so draw modules
// read one guarded source instead of importing option getters directly.
export function colourSafe() {
  try { return !!(OPTIONS && OPTIONS.colourSafe); } catch { return false; }
}
