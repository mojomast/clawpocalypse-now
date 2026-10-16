import assert from 'node:assert/strict';
import { createState } from '../logic.js';
import { createAssist } from '../assist.js';

const s = createState(), assist = createAssist();
assist.step(s, 0);
s.super = 97;
assert.equal(assist.grantTeamLink(s, 6), 3);
assert.equal(s.super, 100);
assert.deepEqual(assist.linkCue && assist.linkCue.amount, 3);
assert.equal(assist.stats.teamLinkCredit, 3);
assert.equal(assist.grantTeamLink(s, 6), 0);
assert.equal(assist.stats.teamLinks, 1);
// A new stage clears the old credit banner, even when the previous stage's
// banner had time remaining and the existing shared meter carries forward.
s.wave++;
assist.step(s, 0);
assert.equal(assist.linkCue, null);
assert.equal(s.super, 100);
assert.equal(assist.grantTeamLink(s, 1), 0);
s.super = 90;
assert.equal(assist.grantTeamLink(s, 6), 6);
s.level = 1;
assist.step(s, 0);
assert.equal(assist.linkCue, null);
s.super = 0;
assist.grantTeamLink(s, 6);
const next = createState();
assist.step(next, 0);
assert.equal(assist.linkCue, null, 'new run has no old credit cue');
assert.equal(next.super, 0);
// Existing solo TEAM UP contract: fixed expected values, independent of the
// new co-op callback. One hp-drop +4, KO +8, ordinary hurt +6, hpHit/special
// cost +0; the Nous assist consumes 100 and its strike cannot refill itself.
const solo = createState(), foe = { kind: 'brawler', x: 70, y: 380, hp: 10, maxHp: 10, dead: false };
solo.ninjas = [foe];
const soloAssist = createAssist(); soloAssist.step(solo, 0);
foe.hp = 9; soloAssist.step(solo, 0.01); assert.equal(solo.super, 4);
foe.hp = 0; foe.dead = true; soloAssist.step(solo, 0.01); assert.equal(solo.super, 12);
solo.hp = 90; soloAssist.step(solo, 0.01); assert.equal(solo.super, 18);
solo.hp = 85; solo.hpHit = 1; soloAssist.step(solo, 0.01); assert.equal(solo.super, 18);
const strikeTarget = { kind: 'brawler', x: 75, y: 380, hp: 30, maxHp: 30, dead: false };
solo.ninjas = [strikeTarget]; soloAssist.step(solo, 0);
solo.super = 100;
assert.equal(soloAssist.press(solo), true);
assert.equal(solo.super, 0);
soloAssist.step(solo, 1.2);
assert.ok(strikeTarget.hp < 30, 'the real assist strike landed');
soloAssist.step(solo, 0);
assert.equal(solo.super, 0, 'the assist strike never refills TEAM UP');
assert.equal(soloAssist.stats.teamLinks, 0, 'solo earns no link credit');
soloAssist.step(createState(), 0);
assert.equal(soloAssist.stats.fired, 1, 'legacy fired counter remains instance lifetime');
assert.equal(soloAssist.stats.teamLinks, 0);
assist.step(s, 1.61);
assert.equal(assist.linkCue, null, 'quiet HUD credit cue expires on simulation time');

// A defined empty usablePads list means the lifecycle gate suspended held L3;
// it must not fall through to the raw browser pad and trigger a cut-in.
const held = { buttons: Array.from({ length: 11 }, (_, i) => ({ pressed: i === 10, value: i === 10 ? 1 : 0 })) };
const oldWindow = globalThis.window, oldNavigator = globalThis.navigator;
try {
  globalThis.window = { __ppGamepad: { usablePads: [] } };
  Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => [held] }, configurable: true });
  assist.step(s, 0.01);
  assert.equal(assist.stats.fired, 0, 'a held but gated L3 does not fire');
  s.super = 100;
  window.__ppGamepad.usablePads = [held];
  assist.step(s, 0.01);
  assert.equal(assist.stats.fired, 1, 'a newly usable held L3 is observed');
} finally {
  if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
  if (oldNavigator === undefined) delete globalThis.navigator; else Object.defineProperty(globalThis, 'navigator', { value: oldNavigator, configurable: true });
}
console.log('teamwork assist: actual capped credit, finite cue, and usablePads gate OK');
