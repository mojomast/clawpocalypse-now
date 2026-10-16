// tests/check-qol.mjs — aggregator for the QoL unit checks.
//
// The three modules below each run their own top-level assertions and log a
// summary line; importing them in sequence runs the whole QoL unit suite:
//   - check-qol-settings.mjs  options store: defaults, OS seeding, validation,
//                             reset, listeners, storage fallback.
//   - check-qol-input.mjs     pause menu descriptors/pagination/layout, keyboard
//                             navigation, tutorial-replay callback, difficulty,
//                             move-list hints and gamepad deadzone/preset.
//   - check-qol-effects.mjs   effects-safe gates, fx/impacts caps, off-screen
//                             stacking + colour-safe cues, HUD readability,
//                             boss/events flash gating and the co-op countdown.
//
// Run: node tests/check-qol.mjs
import assert from 'node:assert/strict';

await import('./check-qol-settings.mjs');
await import('./check-qol-input.mjs');
await import('./check-qol-effects.mjs');

assert.ok(true);
console.log('check-qol: OK (settings + input + effects)');
