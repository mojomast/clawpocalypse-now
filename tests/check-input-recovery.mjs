import assert from 'node:assert/strict';
import { BTN, createGamepad } from '../gamepad.js';

const neutral = (index, id = `pad-${index}`) => ({ index, id, connected: true, axes: [0, 0], buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })) });
const active = (index, buttons = [], axes = [0, 0], id) => {
  const p = neutral(index, id);
  p.axes = axes;
  for (const i of buttons) p.buttons[i] = { pressed: true, value: 1 };
  return p;
};
let pads = [];
const events = [];
const gp = createGamepad({ getPads: () => pads.map(p => p && { ...p, buttons: p.buttons.map(b => ({ ...b })), axes: [...p.axes] }), emit: (type, code) => events.push(`${type}:${code}`) });
const poll = (mode = 'play') => { events.length = 0; gp.poll(1 / 60, mode); return [...events]; };
const masked = p => !p || (p.axes.every(a => a === 0) && p.buttons.every(b => !b.pressed && !b.value));

// Initial connection is usable; a held Y and stick continue through ordinary
// mode changes unless the explicit recovery gate is requested.
pads = [active(0, [BTN.Y], [0.9, 0])];
assert.deepEqual(poll(), ['keydown:ArrowRight', 'keydown:Space']);
assert.equal(gp.usablePads.length, 1);
assert.equal(gp.usablePads[0].id, 'pad-0');
gp.releaseAll();
assert.deepEqual(poll(), ['keydown:ArrowRight']);

// Ordinary mode navigation must retain select actions without a recovery gate.
const navEvents = [];
let navPads = [neutral(0)];
const nav = createGamepad({ getPads: () => navPads, emit: (type, code) => navEvents.push(`${type}:${code}`) });
const navPoll = mode => { navEvents.length = 0; nav.poll(1 / 60, mode); return [...navEvents]; };
navPoll('title');
navPads = [active(0, [BTN.Y])];
assert.deepEqual(navPoll('select'), ['keydown:KeyR', 'keyup:KeyR']);
navPads = [neutral(0)]; navPoll('pause');
navPads = [active(0, [BTN.BACK])];
assert.deepEqual(navPoll('select'), ['keydown:KeyM', 'keyup:KeyM']);

// Suspension releases held keys and does not accept neutral observations made
// while hidden. All buttons, including non-synthetic L3/R3, remain masked.
gp.suspendInput();
pads = [neutral(0)];
assert.deepEqual(poll(), []);
pads = [active(0, [BTN.Y, BTN.START, BTN.L3, BTN.R3], [0.9, 0])];
assert.deepEqual(poll(), []);
assert.deepEqual(gp.held, []);
assert.ok(masked(gp.usablePads[0]));
assert.equal(gp.pad2, null);
gp.resumeInput();
for (let i = 0; i < 3; i++) {
  assert.deepEqual(poll(), [], 'held controls stay blocked after resume');
  assert.ok(masked(gp.usablePads[0]));
}
gp.requireNeutral(); // repeated latch must not open the gate
assert.deepEqual(poll(), []);
pads = [neutral(0)];
assert.deepEqual(poll(), []);
assert.ok(masked(gp.usablePads[0]), 'neutral transition remains masked');
pads = [active(0, [BTN.Y], [0.9, 0])];
assert.deepEqual(poll(), ['keydown:ArrowRight', 'keydown:Space']);
assert.deepEqual(poll(), [], 'no duplicate edge on a held button');

// START cannot re-pause after a return; a genuinely new press can.
pads = [active(0, [BTN.START])];
assert.ok(poll().includes('keydown:Escape'));
gp.requireNeutral();
assert.deepEqual(poll(), []);
assert.deepEqual(poll(), []);
pads = [neutral(0)]; poll();
pads = [active(0, [BTN.START])];
assert.ok(poll().includes('keydown:Escape'));

// P2 direct-read state and the Gamepad-shaped published array are both gated.
pads = [neutral(0), active(1, [BTN.START, BTN.Y, BTN.L3, BTN.R3], [0.9, 0])];
assert.deepEqual(poll(), []);
assert.equal(gp.pad2.buttons[BTN.Y], true, 'initial P2 connect works');
gp.requireNeutral();
for (let i = 0; i < 2; i++) {
  assert.deepEqual(poll(), []);
  assert.equal(gp.pad2, null);
  assert.ok(masked(gp.usablePads[1]));
  if (i) assert.equal(gp.usablePads[0].index, 0, 'neutral P1 remains available');
}
pads = [neutral(0), neutral(1)]; poll();
pads = [neutral(0), active(1, [BTN.Y, BTN.R3], [0.8, 0])]; poll();
assert.equal(gp.pad2.buttons[BTN.Y], true);
assert.equal(gp.usablePads[1].buttons[BTN.R3].pressed, true);

// Disconnection follows the slot/id, not object reference. A held reconnect
// (including a replaced id at the same index) must see a neutral frame first.
pads = [active(0, [BTN.Y], [0.8, 0]), neutral(1)]; poll();
pads = [null, neutral(1)]; poll();
pads = [active(0, [BTN.Y, BTN.L3], [0.8, 0]), neutral(1)];
assert.deepEqual(poll(), []);
assert.ok(masked(gp.usablePads[0]));
pads = [neutral(0), neutral(1)]; poll();
pads = [active(0, [BTN.Y], [0.8, 0]), neutral(1)];
assert.deepEqual(poll(), ['keydown:ArrowRight', 'keydown:Space']);
pads = [active(0, [BTN.Y], [0.8, 0], 'replacement'), neutral(1)];
assert.deepEqual(poll(), ['keyup:ArrowRight', 'keyup:Space']);
assert.ok(masked(gp.usablePads[0]));

// Dropping P1 must not promote an already-held P2 into synthetic P1 input.
pads = [active(0, [BTN.Y]), active(1, [BTN.Y])]; gp.requireNeutral(); poll();
pads = [neutral(0), neutral(1)]; poll();
pads = [active(0, [BTN.Y]), active(1, [BTN.Y])]; poll();
pads = [null, active(1, [BTN.Y])];
assert.ok(!poll().includes('keydown:Space'), 'P2 held through P1 disconnect is gated');
assert.ok(masked(gp.usablePads[1]), 'promoted P2 raw controls are masked');
pads = [null, neutral(1)]; poll();
pads = [null, active(1, [BTN.Y])];
assert.ok(poll().includes('keydown:Space'), 'fresh press after promotion is usable');

// A browser disconnect event can precede the next poll. It must immediately
// release synthetic keys and keep the same slot gated on a held reconnect.
pads = [neutral(0), neutral(1)]; poll();
pads = [active(0, [BTN.Y]), neutral(1)]; poll();
gp.disconnect({ index: 0, id: 'replacement' });
assert.deepEqual(gp.held, []);
assert.deepEqual(gp.usablePads, []);
pads = [active(0, [BTN.Y, BTN.R3]), neutral(1)];
assert.deepEqual(poll(), []);
pads = [neutral(0), neutral(1)]; poll();
pads = [active(0, [BTN.Y]), neutral(1)];
assert.deepEqual(poll(), ['keydown:Space']);

// A blocked P1 never promotes the physical P2 to P1 synthetic keys.
gp.requireNeutral();
pads = [active(0, [BTN.START]), active(1, [BTN.Y])];
assert.deepEqual(poll(), []);
assert.equal(gp.pad2, null);
pads = [active(0, [BTN.START]), neutral(1)]; poll();
pads = [active(0, [BTN.START]), active(1, [BTN.Y])];
assert.deepEqual(poll(), []);
assert.equal(gp.pad2.buttons[BTN.Y], true);
assert.ok(masked(gp.usablePads[0]));

// Diagonal components below the raw deadzone still map to directions: neither
// P1 nor P2 may clear its latch until the mapped stick is genuinely neutral.
let diagonalPads = [active(0, [], [0.21, 0.21]), active(1, [], [0.21, 0.21])];
const diagonalEvents = [];
const diagonal = createGamepad({ getPads: () => diagonalPads, emit: (type, code) => diagonalEvents.push(`${type}:${code}`) });
const diagonalPoll = () => { diagonalEvents.length = 0; diagonal.poll(1 / 60, 'play'); return [...diagonalEvents]; };
assert.deepEqual(diagonalPoll(), ['keydown:ArrowRight', 'keydown:ArrowDown']);
assert.equal(diagonal.pad2.dirs.right, true);
assert.equal(diagonal.pad2.dirs.down, true);
diagonal.requireNeutral();
for (let i = 0; i < 3; i++) {
  assert.deepEqual(diagonalPoll(), [], 'held P1 diagonal remains blocked');
  assert.ok(masked(diagonal.usablePads[0]));
  assert.ok(masked(diagonal.usablePads[1]));
  assert.equal(diagonal.pad2, null, 'held P2 diagonal remains blocked');
}
diagonal.requireNeutral();
assert.deepEqual(diagonalPoll(), [], 'repeated latch does not clear held diagonals');
diagonalPads = [neutral(0), active(1, [], [0.21, 0.21])];
assert.deepEqual(diagonalPoll(), []);
assert.equal(diagonal.pad2, null);
diagonalPads = [active(0, [], [0.21, 0.21]), active(1, [], [0.21, 0.21])];
assert.deepEqual(diagonalPoll(), ['keydown:ArrowRight', 'keydown:ArrowDown'], 'fresh P1 diagonal moves');
assert.equal(diagonal.pad2, null, 'P2 held throughout stays blocked');
diagonalPads = [active(0, [], [0.21, 0.21]), neutral(1)];
assert.deepEqual(diagonalPoll(), []);
assert.equal(diagonal.pad2, null, 'P2 neutral sample stays masked');
diagonalPads = [active(0, [], [0.21, 0.21]), active(1, [], [0.21, 0.21])];
assert.deepEqual(diagonalPoll(), []);
assert.equal(diagonal.pad2.dirs.right, true, 'fresh P2 diagonal moves');
assert.equal(diagonal.pad2.dirs.down, true);

// Unmapped axes also hold the gate when deliberately moved, but small analog
// drift on those axes must not prevent a later fresh mapped press.
let extraAxisPads = [active(0, [], [0, 0, 0.4])];
const extraAxis = createGamepad({ getPads: () => extraAxisPads, emit: () => {} });
extraAxis.requireNeutral();
extraAxis.poll();
assert.ok(masked(extraAxis.usablePads[0]));
extraAxisPads = [active(0, [], [0, 0, 0.1])];
extraAxis.poll();
assert.ok(masked(extraAxis.usablePads[0]));
extraAxisPads = [active(0, [BTN.Y], [0, 0, 0.1])];
extraAxis.poll();
assert.equal(extraAxis.usablePads[0].buttons[BTN.Y].pressed, true);

// Browser Gamepad properties are prototype getters, not enumerable own fields.
const fields = { index: 2, id: 'native-like', connected: true, timestamp: 1234, mapping: 'standard', axes: [0.7, 0, 0.8], buttons: active(2, [BTN.L3]).buttons };
const nativeLike = Object.create(Object.defineProperties({}, Object.fromEntries(
  Object.keys(fields).map(key => [key, { get: () => fields[key], enumerable: true }])
)));
const native = createGamepad({ getPads: () => [nativeLike], emit: () => {} });
native.requireNeutral();
native.poll();
assert.deepEqual(Object.keys(native.usablePads[0]).sort(), Object.keys(fields).sort());
for (const key of ['index', 'id', 'connected', 'timestamp', 'mapping']) assert.equal(native.usablePads[0][key], fields[key]);
assert.ok(masked(native.usablePads[0]));
assert.deepEqual(native.usablePads[0].axes, [0, 0, 0]);
assert.equal(native.usablePads[0].buttons.length, 16);

console.log('check-input-recovery: OK');
