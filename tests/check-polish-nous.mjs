// Pure installation + production solve/secondary replay. No screenshot writes.
// --poses-only is useful while the independent cable solver is being integrated.
import assert from 'node:assert/strict';
import { installNousPolish, nousReachFor } from '../hero-polish-nous.js';
import { POSES, HERO_MOVES, HERO_CHAIN, MECHANICS, solve, apply, applySecondary, secondaryInputs, FOOT_Y } from '../rig.js';
import { HERO_RIGS } from '../hero-rigs.js';
import { HERO_SUPPORT } from '../hero-support.js';
import { createSecondary } from '../secondary.js';

const prefix = 'nous_girl_', name = n => prefix + n;
const original = structuredClone(POSES), trial = structuredClone(POSES), refs = { ...trial };
assert.equal(installNousPolish(trial), trial);
for (const key of Object.keys(original)) if (!key.startsWith(prefix)) {
  assert.equal(trial[key], refs[key], `${key}: foreign object replaced`);
  assert.deepEqual(trial[key], original[key], `${key}: foreign pose mutated`);
}
const installed = structuredClone(trial);
installNousPolish(trial);
assert.deepEqual(trial, installed, 'install must be value-idempotent');
const empty = {};
installNousPolish(empty);
assert.ok(Object.keys(empty).every(key => key.startsWith(prefix)));
for (const [key, value] of Object.entries(empty)) assert.deepEqual(value, trial[key], `${key}: install depends on previous pose data`);
assert.notEqual(POSES[name('idle')], POSES[name('idleA')], 'no aliasing mutable pose objects');

const states = ['idle', 'idleA', 'idleB', 'idleC', 'walk1', 'walk2', 'walk3', 'walk4', 'run1', 'run2', 'run3', 'run4',
  'jump', 'turn', 'taunt', 'victory', 'flinch', 'stagger', 'knockdownAir', 'down', 'downB', 'wake', 'grabHold', 'grabbed'];
const moves = [...new Set([...Object.keys(HERO_MOVES.nous_girl), ...HERO_CHAIN.nous_girl, ...MECHANICS,
  'roll', 'bassDrop', 'kick', 'jumpKick', 'knee', 'kneeFinal', 'kick_knee', 'kick_kneeFinal', 'laneThrow', 'screenThrow'])];
const phases = ['wind', 'active', 'follow', 'recover'];
const keys = new Set(['torso', 'head', 'uarm', 'farm', 'uarm_b', 'farm_b', 'thigh', 'shin', 'thigh_b', 'shin_b', 'weapon', 'tw', 'dx', 'dy']);
const inventory = [...states, ...moves.flatMap(move => phases.map(phase => `${move}_${phase}`))];
for (const short of inventory) {
  const p = POSES[name(short)];
  assert.ok(p, `missing ${short}`);
  for (const [key, value] of Object.entries(p)) {
    if (key === '__twoHand') { assert.ok(['off', 'free', 'optional', 'required'].includes(value)); continue; }
    if (key === '__variants') { assert.equal(typeof value, 'object'); continue; }
    assert.ok(keys.has(key), `${short}: unsupported channel ${key}`);
    assert.ok(Number.isFinite(value), `${short}.${key}: nonfinite`);
  }
}
assert.ok(POSES[name('idleB')].tw > 0 && POSES[name('idleC')].tw < 0, 'idle transfers support');
for (let i = 1; i <= 4; i++) {
  const run = POSES[name(`run${i}`)], walk = POSES[name(`walk${i}`)];
  assert.ok(run.torso > walk.torso + 5 && run.farm < walk.farm - 25, 'run leans and tucks cable grip');
}
for (const move of moves) {
  const p = phases.map(phase => POSES[name(`${move}_${phase}`)]);
  assert.notDeepEqual(p[0], p[1], `${move}: anticipation absent`);
  assert.notDeepEqual(p[1], p[2], `${move}: follow-through absent`);
  assert.notDeepEqual(p[2], p[3], `${move}: recovery absent`);
}
assert.ok(POSES[name('whipA_active')].tw * POSES[name('whipB_active')].tw < 0, 'lashes need opposing hip rotation');
assert.ok(POSES[name('backAttack_active')].uarm > 45, 'back elbow must travel rearward');
assert.notDeepEqual(POSES[name('bassDrop_active')], POSES[name('kick_active')]);
assert.notDeepEqual(POSES[name('grab_active')], POSES[name('knee_active')]);
assert.notDeepEqual(POSES[name('knee_active')], POSES[name('kneeFinal_active')]);
assert.notDeepEqual(POSES[name('laneThrow_active')], POSES[name('screenThrow_active')]);
const cable = [[20, 0], [-10, 30], [190, 2], [160, 10]];
assert.deepEqual(nousReachFor(name('whipA_active'), cable), { kind: 'cable', forward: 133, back: -7, scale: .7 });
assert.ok(Object.isFrozen(nousReachFor(name('whipB_active'), cable)));
assert.equal(nousReachFor(name('whipA_active'), cable, 1).forward, 190);
for (const invalid of [undefined, [], [[0, 0]], [[0, NaN], [2, 3]], [[0, 0], [Infinity, 1]]]) {
  assert.equal(nousReachFor(name('whipA_active'), invalid), null);
}
for (const n of ['wave_active', 'bassDrop_active', 'whipA_wind', 'whipB_follow']) assert.equal(nousReachFor(name(n)), null);
assert.equal(nousReachFor('teknium_whipA_active'), null);

// Evaluate the actual articulated rig, including intermediate poses: joint data
// alone cannot catch a foot hull penetrating the floor or a detached plug.
const T = HERO_RIGS.nous_girl, support = HERO_SUPPORT.nous_girl;
const DEFAULT_REACH = 74.4 / .7; // current whipA/B combat box, in canonical rig pixels
const reachBudgets = [95, DEFAULT_REACH, 140];
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
// drawRope draws each link from -0.6 to length+0.6 with a 4px-high sprite.
// Inspect its actual rotated rectangle, as well as the free plug's sprite hull:
// centerline-only checks miss both kinds of visible overhang.
function assertActiveCable(sol, budget, label) {
  const pts = sol.ropes.cable, part = T.cable, end = T.cable_end;
  assert.equal(pts.length, part.segs + 1, `${label}: cable segment count`);
  const corners = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], len = distance(a, b);
    assert.ok(len <= part.lash / part.segs + .05, `${label}: cable link ${i} exceeds ${part.lash / part.segs} rig px (${len})`);
    if (len < .01) continue;
    const dx = (b[0] - a[0]) / len, dy = (b[1] - a[1]) / len;
    for (const u of [-.6, len + .6]) for (const v of [-part.h / 2, part.h / 2])
      corners.push([a[0] + dx * u - dy * v, a[1] + dy * u + dx * v]);
  }
  for (const x of [0, end.w]) for (const y of [0, end.h])
    corners.push(apply(sol.M.cable_end, x - end.px, y - end.py));
  const held = T.weapon;
  for (const x of [0, held.w]) for (const y of [0, held.h])
    corners.push(apply(sol.M.weapon, x - held.px, y - held.py));
  for (const [x] of corners) assert.ok(x <= budget + 1e-5 && x >= -budget - 1e-5,
    `${label}: rendered cable/plug at ${x.toFixed(3)} escapes ±${budget.toFixed(3)} rig px`);
  const eye = apply(sol.M.cable_end, end.tip[0] - end.px, end.tip[1] - end.py);
  assert.ok(distance(eye, pts.at(-1)) < 1e-7, `${label}: free plug detached`);
  const span = Math.max(...pts.map(p => p[1])) - Math.min(...pts.map(p => p[1]));
  const contour = pts.slice(1).reduce((sum, p, i) => sum + distance(p, pts[i]), 0);
  const outward = Math.max(...pts.map(p => p[0])) - pts[0][0];
  assert.ok(outward >= 14, `${label}: contact cable collapsed into grip (outward ${outward.toFixed(3)})`);
  assert.ok(span >= 2, `${label}: contact cable lost vertical motion (${span})`);
  assert.ok(contour > distance(pts[0], pts.at(-1)) + .08, `${label}: contact cable became a straight ray`);
}
let checked = 0, maxFootY = -Infinity, maxWeaponY = -Infinity, maxGripError = 0;
function geometry(short, angles) {
  const s = solve('nous_girl', angles, { poseName: name(short), animated: true });
  for (const [slot, m] of Object.entries(s.M)) assert.ok(m.every(Number.isFinite), `${short}: ${slot} nonfinite matrix`);
  for (const slot of ['uarm', 'farm', 'hand', 'hand_b']) assert.deepEqual(s.S[slot], [1, 1], `${short}: hand/arm art squashed`);
  for (const slot of ['foot', 'foot_b', 'weapon']) {
    const part = T[slot];
    for (const [x, y] of support[slot === 'foot_b' ? 'foot' : slot]) {
      const py = apply(s.M[slot], x - part.px, y - part.py)[1];
      assert.ok(py <= FOOT_Y + (slot === 'weapon' ? 2 : 1), `${short}: ${slot} floor ${py}`);
      if (slot === 'weapon') maxWeaponY = Math.max(maxWeaponY, py);
      else maxFootY = Math.max(maxFootY, py);
    }
  }
  const grip = apply(s.M.hand, T.hand.grip[0] - T.hand.px, T.hand.grip[1] - T.hand.py);
  const err = Math.hypot(grip[0] - s.M.weapon[4], grip[1] - s.M.weapon[5]);
  assert.ok(err <= 1, `${short}: grip detached`);
  maxGripError = Math.max(maxGripError, err);
  assert.deepEqual(s.M.hand_front, s.M.hand, `${short}: grip front detached`);
  checked++;
  return s;
}
for (const short of inventory) geometry(short, POSES[name(short)]);
for (const short of ['kick_knee_active', 'kick_kneeFinal_active']) {
  const s = geometry(short, POSES[name(short)]);
  assert.deepEqual(s.contacts, ['back'], `${short}: raised knee must not plant its foot`);
  assert.ok(s.M.shin[5] < s.M.shin_b[5] - 12, `${short}: striking knee did not lift`);
}
const hullY = (s, slot) => (support[slot] || support[slot.replace(/_b$/, '')]).map(([x, y]) =>
  apply(s.M[slot], x - s.parts[slot].px, y - s.parts[slot].py)[1]);
for (const short of ['bassDrop_active', 'bassDrop_follow', 'roll_wind', 'roll_active', 'roll_follow', 'dodgeRoll_active']) {
  const s = geometry(short, POSES[name(short)]);
  const body = Object.entries(s.parts).filter(([, p]) => ['body', 'torso', 'hand', 'foot'].includes(p.role)).map(([slot]) => slot);
  const bottom = Math.max(...body.flatMap(slot => hullY(s, slot)));
  assert.ok(bottom >= FOOT_Y - 1.5 && bottom <= FOOT_Y + 1, `${short}: floating or penetrating support ${bottom}`);
  for (const slot of [...body, 'weapon']) assert.ok(Math.max(...hullY(s, slot)) <= FOOT_Y + 1, `${short}: ${slot} through floor`);
  if (short.startsWith('bassDrop')) {
    for (const slot of ['foot', 'foot_b']) assert.ok(Math.max(...hullY(s, slot)) >= FOOT_Y - 2, `${short}: ${slot} fails to land`);
  }
  if (short.endsWith('Roll_active') || short === 'roll_active') {
    assert.ok(Math.max(...hullY(s, 'torso')) >= 70, `${short}: roll body too high`);
    assert.ok(Math.max(...hullY(s, 'thigh')) >= FOOT_Y - 1.5, `${short}: curled leg not supporting roll`);
  }
}
for (const move of moves) for (let p = 0; p < phases.length - 1; p++) {
  const a = POSES[name(`${move}_${phases[p]}`)], b = POSES[name(`${move}_${phases[p + 1]}`)];
  for (let step = 1; step < 8; step++) {
    const t = step / 8, mix = Object.fromEntries([...keys].map(k => [k, a[k] + (b[k] - a[k]) * t]));
    geometry(`${move}_${phases[p + 1]}`, mix);
  }
}
console.log(`Nous poses OK: ${inventory.length} keys; ${checked} production solves; foot maxY=${maxFootY.toFixed(3)}, weapon maxY=${maxWeaponY.toFixed(3)}, grip error=${maxGripError.toExponential(2)}`);

if (!process.argv.includes('--poses-only')) {
  // Reach is an actor-local rig-space budget. Check the static path with and
  // without __phase/metadata; both are used by callers outside the live renderer.
  for (const move of ['whipA', 'whipB']) for (const budget of reachBudgets) for (const metadata of [false, true]) {
    const short = `${move}_active`, pose = { ...POSES[name(short)] };
    if (metadata) Object.assign(pose, { __phase: 'active', __pt: 0 });
    pose.__reach = budget;
    const sol = solve('nous_girl', pose, { poseName: name(short), animated: true });
    assert.equal(sol.angles.__reach, budget, `${short}: solve discarded canonical reach`);
    assertActiveCable(sol, budget, `${short} static ${budget} ${metadata ? 'metadata' : 'bare'}`);
  }
  // A missing reach still uses the combat-box default, never the old 133px lash.
  for (const move of ['whipA', 'whipB']) {
    const short = `${move}_active`;
    for (const metadata of [false, true]) {
      const pose = { ...POSES[name(short)], ...(metadata ? { __phase: 'active' } : {}) };
      assertActiveCable(solve('nous_girl', pose, { poseName: name(short), animated: true }), DEFAULT_REACH,
        `${short} default static ${metadata ? 'metadata' : 'bare'}`);
    }
  }

  let maxRatio = 0;
  for (const hz of [30, 60, 144]) {
    const sec = createSecondary();
    // Reflection uses opposite actor travel. Outputs are canonical rig-space;
    // equality here becomes reflection when the renderer applies facing.
    for (let f = 0; f < hz * 3; f++) {
      const sequence = ['idleA', 'whipA_wind', 'whipA_active', 'whipA_follow', 'whipA_recover',
        'whipB_wind', 'whipB_active', 'whipB_follow', 'bassDrop_active', 'dodgeRoll_active', 'idleA'];
      const short = sequence[Math.min(sequence.length - 1, Math.floor(f / hz * 4))];
      const phase = short.endsWith('_active') ? 'active' : short.endsWith('_recover') ? 'rec' : null;
      const s = solve('nous_girl', { ...POSES[name(short)], __phase: phase, __pt: 0, __reach: DEFAULT_REACH }, { poseName: name(short), animated: true });
      const input = secondaryInputs('nous_girl', s), x = 200 + Math.min(f / hz, 2) * 80;
      const view = { x, y: 300, flip: false, scale: .7, dt: 1 / hz };
      const right = sec.step('right', input, view);
      const left = sec.step('left', input, { ...view, x: -x, flip: true });
      for (const [slot, pts] of Object.entries(right.ropes)) {
        const inp = input.ropes[slot];
        // Production cable retracts over time, so the instantaneous target k
        // is not its current physical length. Check the actual extension state
        // and the absolute manifest cap independently.
        const extension = sec.state('right').ropes[slot].extension ?? (inp.lash ? inp.k || 0 : 0);
        assert.ok(extension >= 0 && extension <= 1, 'extension outside physical range');
        const allowed = inp.len + (inp.lashLen / inp.n - inp.len) * extension;
        if (f === hz * 3 - 1) assert.ok(allowed < inp.len + .1, 'cable did not retract after settling');
        for (let i = 0; i < pts.length; i++) {
          assert.ok(pts[i].every(Number.isFinite), `${hz}Hz: nonfinite rope`);
          assert.ok(pts[i][1] <= inp.floorY + 1e-7, `${hz}Hz: cable below floor`);
          assert.ok(Math.hypot(pts[i][0] - left.ropes[slot][i][0], pts[i][1] - left.ropes[slot][i][1]) < 1e-7, 'fresh mirror mismatch');
          if (i) {
            const len = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
            maxRatio = Math.max(maxRatio, len / allowed);
            assert.ok(len <= Math.max(inp.len, inp.lashLen / inp.n) + .05, 'link exceeds absolute manifest length');
            assert.ok(len <= allowed + .05, `${hz}Hz ${short}: link ${i} length ${len.toFixed(4)} > ${allowed.toFixed(4)}`);
          }
        }
        assert.ok(Math.hypot(pts[0][0] - inp.start[0], pts[0][1] - inp.start[1]) < 1e-7, 'cable root detached');
      }
      if (short === 'whipA_active' || short === 'whipB_active') {
        applySecondary('nous_girl', s, right);
        assertActiveCable(s, DEFAULT_REACH, `${hz}Hz ${short} live right`);
        const reflected = solve('nous_girl', { ...POSES[name(short)], __phase: phase, __reach: DEFAULT_REACH }, { poseName: name(short), animated: true });
        applySecondary('nous_girl', reflected, left);
        assertActiveCable(reflected, DEFAULT_REACH, `${hz}Hz ${short} live left`);
      }
      const history = structuredClone(sec.state('right'));
      for (let stop = 0; stop < 3; stop++) assert.deepEqual(sec.step('right', input, { ...view, dt: 0 }), right, 'dt0 output changed');
      assert.deepEqual(sec.state('right'), history, 'dt0 changed Verlet/spring history');
    }
  }
  console.log(`Nous cable OK: production replay at 30/60/144 Hz; max link ratio ${maxRatio.toFixed(6)}; exact dt0 history freeze; fresh reflection equality`);

  // An impact cannot depend on how many Verlet substeps happened to fit before
  // the first active draw. Test a sub-substep commit as well as all render rates.
  for (const move of ['whipA', 'whipB']) {
    let reference;
    for (const dt of [1 / 30, 1 / 60, 1 / 144, 1e-6]) {
      const sec = createSecondary(), view = { x: 200, y: 300, flip: false, scale: .7, dt };
      const idle = solve('nous_girl', POSES[name('idleA')], { poseName: name('idleA'), animated: true });
      sec.step('contact', secondaryInputs('nous_girl', idle), view);
      const short = move + '_active';
      const s = solve('nous_girl', { ...POSES[name(short)], __phase: 'active', __pt: dt, __reach: DEFAULT_REACH }, { poseName: name(short), animated: true });
      const input = secondaryInputs('nous_girl', s);
      assert.equal(input.ropes.cable.contact, true, 'active contact metadata absent');
      const contact = sec.step('contact', input, view);
      reference ||= contact.ropes.cable;
      contact.ropes.cable.forEach((p, i) => assert.ok(Math.hypot(p[0] - reference[i][0], p[1] - reference[i][1]) < 1e-7, `${move}: first contact depends on dt`));
      applySecondary('nous_girl', s, contact);
      assertActiveCable(s, DEFAULT_REACH, `${move} ${dt}s first contact`);
      const end = T.cable_end;
      const eye = apply(s.M.cable_end, end.tip[0] - end.px, end.tip[1] - end.py);
      const tip = s.ropes.cable.at(-1);
      assert.ok(Math.hypot(eye[0] - tip[0], eye[1] - tip[1]) < 1e-7, 'free plug detached');
      for (const x of [0, end.w]) for (const y of [0, end.h]) assert.ok(apply(s.M.cable_end, x - end.px, y - end.py)[1] <= FOOT_Y + 1, 'free plug crosses floor');
      const snapshot = structuredClone(sec.state('contact'));
      assert.deepEqual(sec.step('contact', input, { ...view, dt: 0, x: 900, y: 200, flip: true }), contact, 'zero-dt turn reset cable');
      assert.deepEqual(sec.state('contact'), snapshot, 'zero-dt turn mutated history');
    }
    console.log(`${move}: first-contact rope identical at 30/60/144 Hz and 1us; measured forward reach ${nousReachFor(name(move + '_active'), reference).forward.toFixed(3)} world px`);
  }

  // Hit-stop may explicitly commit one authored contact drawing while leaving
  // spring integration and the fixed-step accumulator untouched. Ordinary dt0
  // remains a strict freeze, including after contact and after a facing change.
  for (const move of ['whipA', 'whipB']) for (const budget of reachBudgets) for (const flip of [false, true]) {
    const short = `${move}_active`, actor = 'commit', view = { x: flip ? -200 : 200, y: 300, flip, scale: .7 };
    const wind = solve('nous_girl', POSES[name(`${move}_wind`)], { poseName: name(`${move}_wind`), animated: true });
    const active = solve('nous_girl', { ...POSES[name(short)], __phase: 'active', __reach: budget }, { poseName: name(short), animated: true });
    const input = secondaryInputs('nous_girl', active), sec = createSecondary(), live = createSecondary();
    sec.step(actor, secondaryInputs('nous_girl', wind), { ...view, dt: 1 / 60 });
    live.step(actor, secondaryInputs('nous_girl', wind), { ...view, dt: 1 / 60 });
    const before = structuredClone(sec.state(actor));
    const frozen = sec.step(actor, input, { ...view, dt: 0 });
    assert.deepEqual(sec.state(actor), before, `${short}: plain dt0 changed wind history`);
    const committed = sec.step(actor, input, { ...view, dt: 0, commitContact: true });
    assert.notDeepEqual(committed.ropes.cable, frozen.ropes.cable, `${short}: dt0 contact not committed`);
    assert.deepEqual(sec.state(actor).springs, before.springs, `${short}: dt0 commit integrated springs`);
    assert.equal(sec.state(actor).acc, before.acc, `${short}: dt0 commit advanced accumulator`);
    const snap = structuredClone(sec.state(actor));
    assert.deepEqual(sec.step(actor, input, { ...view, dt: 0, commitContact: true }), committed, `${short}: repeated contact commit differs`);
    assert.deepEqual(sec.state(actor), snap, `${short}: repeated contact commit changed state`);
    assert.deepEqual(sec.step(actor, input, { ...view, dt: 0, x: 777, flip: !flip, commitContact: true }), committed,
      `${short}: repeated dt0 contact did not retain its one-shot snapshot`);
    assert.deepEqual(sec.state(actor), snap, `${short}: repeated dt0 contact changed history after a view change`);
    assert.deepEqual(sec.step(actor, input, { ...view, dt: 0, x: 777, flip: !flip }), committed, `${short}: plain dt0 lost committed snapshot`);
    assert.deepEqual(sec.state(actor), snap, `${short}: plain dt0 changed committed history`);
    const positive = live.step(actor, input, { ...view, dt: 1 / 60 });
    positive.ropes.cable.forEach((p, i) => assert.ok(distance(p, committed.ropes.cable[i]) < 1e-7,
      `${short}: dt0 contact differs from positive-dt contact at point ${i}`));
    for (const [label, output] of [['zero-dt', committed], ['positive-dt', positive]]) {
      const render = solve('nous_girl', { ...POSES[name(short)], __phase: 'active', __reach: budget }, { poseName: name(short), animated: true });
      applySecondary('nous_girl', render, output);
      assertActiveCable(render, budget, `${short} ${label} ${budget} facing ${flip ? 'left' : 'right'}`);
    }
  }
  // The new contact option is rope-specific; spring-only actors retain dt0 freeze.
  const springOnly = createSecondary(), other = solve('teknium', POSES.teknium_idleA, { poseName: 'teknium_idleA', animated: true });
  const otherInput = secondaryInputs('teknium', other), otherView = { x: 200, y: 300, flip: false, scale: .7 };
  springOnly.step('other', otherInput, { ...otherView, dt: 1 / 60 });
  const otherHistory = structuredClone(springOnly.state('other'));
  const otherFreeze = springOnly.step('other', otherInput, { ...otherView, dt: 0 });
  assert.deepEqual(springOnly.step('other', otherInput, { ...otherView, dt: 0, commitContact: true }), otherFreeze, 'spring-only contact changed dt0 output');
  assert.deepEqual(springOnly.state('other'), otherHistory, 'spring-only contact changed dt0 state');
  // A fresh contact draw can initialize only its rope, without manufacturing
  // elapsed spring time; recovery remembers the supplied reach until settled.
  for (const budget of reachBudgets) {
    const sec = createSecondary(), view = { x: 200, y: 300, flip: false, scale: .7 };
    const active = solve('nous_girl', { ...POSES[name('whipA_active')], __phase: 'active', __reach: budget }, { poseName: name('whipA_active'), animated: true });
    const committed = sec.step('fresh', secondaryInputs('nous_girl', active), { ...view, dt: 0, commitContact: true });
    assert.deepEqual(sec.state('fresh').springs, {}, 'fresh contact wrote spring history');
    assert.equal(sec.state('fresh').acc, 0, 'fresh contact advanced clock');
    assert.equal(sec.state('fresh').sign, null, 'fresh contact changed spring-facing bookkeeping');
    applySecondary('nous_girl', active, committed);
    assertActiveCable(active, budget, `fresh contact ${budget}`);
    const recovery = solve('nous_girl', { ...POSES[name('whipA_recover')], __phase: 'rec', __pt: .04 }, { poseName: name('whipA_recover'), animated: true });
    sec.step('fresh', secondaryInputs('nous_girl', recovery), { ...view, dt: 1 / 60 });
    assert.equal(sec.state('fresh').ropes.cable.forwardMax, budget, 'recovery discarded the attack reach budget');
    assert.equal(sec.state('fresh').ropes.cable.contactCommitted, false, 'recovery did not rearm the next contact transaction');
  }
  console.log('Nous reach/contact OK: static and live rendered hulls at default/custom budgets, both facings; dt0 contact and spring freeze');
}
