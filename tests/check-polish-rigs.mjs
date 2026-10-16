// Production-path rig polish checks. No expected-image regeneration or writes.
// node tests/check-polish-rigs.mjs [--gait-only] [--hero=teknium|turbofit]
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import '../don.js';
import { POSES, HERO_CHAIN, HERO_KICK, MECHANICS, solve, apply, FOOT_Y } from '../rig.js';
import { HERO_RIGS } from '../hero-rigs.js';
import { HERO_SUPPORT } from '../hero-support.js';
import { HERO_MOVES_COMBAT } from '../hero-moves.js';
import { createAnim } from '../anim.js';
import { createFootLocks } from '../foot-lock.js';

const selected = process.argv.find(arg => arg.startsWith('--hero='))?.slice(7);
assert.ok(!selected || ['teknium', 'turbofit'].includes(selected), 'unknown polish hero');
const heroes = selected ? [selected] : ['teknium', 'turbofit'];
const source = new URL('../assets/heroes/', import.meta.url);
const deg = m => Math.atan2(m[1], m[0]) * 180 / Math.PI;
const frames = { supports: 0, transitions: 0, named: 0, maxRootVelocity: 0, maxDrift: 0, maxGuard: 0 };
function floor(hero, sol, label) {
  const T = HERO_RIGS[hero];
  for (const slot of ['foot', 'foot_b', 'weapon']) {
    const p = sol.parts[slot], hull = HERO_SUPPORT[hero][slot.replace(/_b$/, '')];
    for (const [x, y] of hull) {
      const point = apply(sol.M[slot], x - p.px, y - p.py);
      assert.ok(point[1] <= FOOT_Y + (slot === 'weapon' ? 2 : 1), `${label}: ${slot} below floor at ${point[1]}`);
    }
  }
  assert.equal(sol.S.uarm[0], 1, `${label}: never stretch an arm to simulate foreshortening`);
  assert.equal(sol.S.farm[0], 1);
  assert.equal(sol.S.thigh[1], 1);
  assert.equal(sol.S.shin[1], 1);
  assert.ok(T.foot.sole, `${hero}: real ankle/sole metadata`);
}

// Exact old 22-event fixture, slower strip conditions, and rate-independent
// replay. Count unexpected toe fallback rather than excluding it from flatness.
for (const hero of heroes) for (const flip of [false, true]) for (const hz of [30, 60, 144]) {
  for (const [kind, speed, scale, step] of [['run', 385, 0.7, 64], ['run', 280, 1, 64], ['walk', 220, 0.7, 46]]) {
    const anim = createAnim(), locks = createFootLocks(), dt = 1 / hz;
    let x = 200, lastRoot;
    for (let f = 0; f < 2 * hz; f++) {
      x += (flip ? -1 : 1) * speed * dt;
      const walkT = (f + 1) * speed * dt / (step * 4), name = `${hero}_${kind}${Math.floor(walkT * 8) % 4 + 1}`;
      const drawing = anim.step('actor', name, { walkT, walkRate: 8 }, dt, f * dt);
      const p = locks.place('actor', hero, drawing, { x, y: 0, flip, scale, dt });
      const sol = solve(hero, p, { poseName: name, animated: true, footTargets: p.__footTargets, rootDy: p.__rootDy });
      const label = `${name} ${flip ? 'L' : 'R'} ${hz}Hz frame${f} speed${speed}/${scale}`;
      floor(hero, sol, label);
      if (lastRoot != null) {
        const velocity = Math.abs(sol.M.torso[5] - lastRoot) / dt;
        frames.maxRootVelocity = Math.max(frames.maxRootVelocity, velocity);
        assert.ok(velocity <= 300, `${label}: support-exchange pelvis pop ${velocity} rig px/s`);
      }
      lastRoot = sol.M.torso[5];
      for (const side of sol.contacts) {
        frames.supports++;
        assert.ok(p.__footTargets[side], `${label}: ordinary support released`);
        assert.equal(sol.ground[side].toeOff, false, `${label}: unrequested toe fallback`);
        assert.ok(sol.ground[side].error < 0.01, `${label}: unreachable flat ankle`);
        const foot = side === 'front' ? 'foot' : 'foot_b';
        assert.ok(Math.abs(deg(sol.M[foot])) < 0.01, `${label}: planted shoe not flat`);
        const ankle = apply(sol.M[foot], 0, 0), world = x + (flip ? -1 : 1) * scale * ankle[0];
        const drift = Math.abs(world - locks.tracks.get('actor').anchors[side]);
        frames.maxDrift = Math.max(frames.maxDrift, drift);
        assert.ok(drift < 0.02, `${label}: anchor drift ${drift}`);
      }
      if (f === Math.floor(hz / 2)) {
        const frozen = locks.place('actor', hero, drawing, { x, y: 0, flip, scale, dt: 0 });
        assert.deepEqual(frozen.__footTargets, p.__footTargets, `${label}: hit-stop moved contacts`);
        assert.equal(locks.tracks.get('actor').rootDy, sol.M.torso[5], `${label}: hit-stop moved root`);
      }
    }
  }
}
console.log('Polish gait:', frames.supports, 'supports; zero toe fallback/releases; max root velocity', frames.maxRootVelocity.toFixed(3), 'rig px/s; drift', frames.maxDrift.toFixed(6));

// A cadence change must not reset the anchor or use the new support endpoint
// as an instantaneous pelvis height. Keep phase continuous across the switch.
for (const hero of heroes) for (const flip of [false, true]) {
  const anim = createAnim(), locks = createFootLocks(); let x = 200, walkT = 0, previous;
  for (let f = 0; f < 180; f++) {
    const run = f >= 60 && f < 120, speed = run ? 385 : 220;
    x += (flip ? -1 : 1) * speed / 60; walkT += speed / 60 / ((run ? 64 : 46) * 4);
    const name = `${hero}_${run ? 'run' : 'walk'}${Math.floor(walkT * 8) % 4 + 1}`;
    const p = locks.place('cadence', hero, anim.step('cadence', name, { walkT, walkRate: 8 }, 1 / 60, f / 60), { x, y: 0, flip, scale: 0.7, dt: 1 / 60 });
    const sol = solve(hero, p, { poseName: name, animated: true, footTargets: p.__footTargets, rootDy: p.__rootDy });
    if (previous != null) assert.ok(Math.abs(sol.M.torso[5] - previous) <= 5, `${hero} walk/run pelvis discontinuity at ${f}`);
    previous = sol.M.torso[5];
    for (const side of sol.contacts) assert.ok(p.__footTargets[side] && sol.ground[side].error < 0.01, `${hero} cadence change released support at ${f}`);
  }
}

if (!process.argv.includes('--gait-only')) {
  // All named keys include the historical 8/16 guard offenders and synthetic
  // aliases. Actual choreography below separately includes chain-only axeB.
  for (const hero of heroes) {
    for (const name of Object.keys(POSES).filter(n => n.startsWith(hero + '_'))) {
      const sol = solve(hero, POSES[name], { poseName: name, animated: true });
      floor(hero, sol, name); frames.named++;
      assert.ok(Math.abs(sol.guard.wrist) <= 0.01 && Math.abs(sol.guard.elbow) <= 0.01,
        `${name}: authored key still requires floor guard ${JSON.stringify(sol.guard)}`);
      if (sol.handPolicy === 'required') {
        assert.equal(sol.twoHand, true, `${name}: authored supported strike lost its second grip`);
        const far = sol.parts.hand_b, weapon = sol.parts.weapon;
        const gp = apply(sol.M.hand_b, far.grip[0] - far.px, far.grip[1] - far.py);
        const target = apply(sol.M.weapon, weapon.grip2[0] - weapon.px, weapon.grip2[1] - weapon.py);
        assert.ok(Math.hypot(gp[0] - target[0], gp[1] - target[1]) <= 2, `${name}: far grip is disconnected`);
        assert.ok(sol.order.indexOf('uarm_b') > sol.order.indexOf('torso'), `${name}: supported upper arm hidden behind vest`);
      }
    }
    const combat = Object.values(HERO_MOVES_COMBAT[hero] || {});
    const moves = new Set([...HERO_CHAIN[hero], HERO_KICK[hero], ...MECHANICS, ...combat.map(m => m.name)]);
    for (const action of ['kick', 'jumpKick', 'kick_knee', 'kick_kneeFinal', 'dashTravel']) moves.add(action);
    if (hero === 'turbofit') assert.ok(moves.has('axeB'), 'actual second chain strike must be covered');
    for (const move of moves) {
      if (!POSES[`${hero}_${move}_active`]) continue;
      const timing = combat.find(m => m.name === move) || { wind: 0.16, active: 0.13, rec: 0.32 };
      for (const hz of [30, 60, 144]) for (const flip of [false, true]) {
        const anim = createAnim(), locks = createFootLocks(), dt = 1 / hz;
        let frame = 0;
        const sequence = [['idleA', undefined, 0.2], [move + '_wind', 'wind', timing.wind],
          [move + '_active', 'active', timing.active], [move + '_recover', 'rec', timing.rec], ['idleA', undefined, 0.3]];
        for (const [state, phase, time] of sequence) for (let i = 0; i < Math.ceil(time * hz); i++) {
          const name = `${hero}_${state}`, p = locks.place('actor', hero,
            anim.step('actor', name, { phase, dur: time, heavy: true }, dt, frame++ * dt), { x: 200, y: 0, flip, scale: 0.7, dt });
          const sol = solve(hero, p, { poseName: name, animated: true, footTargets: p.__footTargets, rootDy: p.__rootDy });
          const label = `${name} ${hz}Hz frame${frame}`;
          floor(hero, sol, label); frames.transitions++;
          if (sol.handPolicy === 'required') assert.equal(sol.twoHand, true, `${label}: required support disappears during interpolation`);
          frames.maxGuard = Math.max(frames.maxGuard, Math.abs(sol.guard.wrist));
          assert.ok(Math.abs(sol.guard.wrist) <= 8 && Math.abs(sol.guard.elbow) <= 8,
            `${label}: transition relies on a large guard ${JSON.stringify(sol.guard)}`);
        }
      }
    }
    for (const hz of [30, 60, 144]) for (const flip of [false, true]) {
      const anim = createAnim(), locks = createFootLocks(), dt = 1 / hz; let frame = 0;
      for (const state of ['idleA', 'flinch', 'stagger', 'knockdownAir', 'down', 'downB', 'wake', 'idleA']) {
        for (let i = 0; i < Math.ceil(0.3 * hz); i++) {
          const name = `${hero}_${state}`, drawing = anim.step('reaction', name, {}, dt, frame++ * dt);
          const p = locks.place('reaction', hero, drawing, { x: 200, y: 0, flip, scale: 0.7, dt });
          const sol = solve(hero, p, { poseName: name, animated: true, footTargets: p.__footTargets, rootDy: p.__rootDy });
          floor(hero, sol, `${name} reaction ${hz}Hz frame${frame}`); frames.transitions++;
          assert.ok(Math.abs(sol.guard.wrist) <= 8 && Math.abs(sol.guard.elbow) <= 8,
            `${name}: reaction transition guard ${JSON.stringify(sol.guard)}`);
        }
      }
    }
  }
  if (heroes.includes('teknium')) {
    const blade = solve('teknium', POSES.teknium_bladeB_active, { poseName: 'teknium_bladeB_active', animated: true });
    const w = HERO_RIGS.teknium.weapon, tip = apply(blade.M.weapon, w.tip[0] - w.px, w.tip[1] - w.py);
    assert.ok(tip[0] > blade.M.weapon[4] + 35, 'Teknium bladeB must strike forward, not behind the actor');
    const open = solve('teknium', POSES.teknium_grab_active, { poseName: 'teknium_grab_active', animated: true });
    const fist = solve('teknium', POSES.teknium_idleA, { poseName: 'teknium_idleA', animated: true });
    assert.equal(open.variants.hand_b, 'open', 'reaching hand must use the existing open drawing');
    assert.notEqual(open.parts.hand_b.file, fist.parts.hand_b.file, 'open/fist must be visibly different source art');
  }
  if (heroes.includes('turbofit')) {
    const closed = solve('turbofit', POSES.turbofit_axeHeavy_active, { poseName: 'turbofit_axeHeavy_active', animated: true });
    const open = solve('turbofit', POSES.turbofit_grab_active, { poseName: 'turbofit_grab_active', animated: true });
    assert.equal(closed.variants.hand_b, 'grip_far');
    assert.equal(open.twoHand, false, 'a reaching hand must release the guitar');
    assert.notEqual(closed.parts.hand_b.file, open.parts.hand_b.file, 'closed and open far hands require distinct actual drawings');
    assert.deepEqual([closed.parts.hand_b.w, closed.parts.hand_b.h], [12, 19], 'closed source grip replaces the old 15x24 open palm');
  }

  // Decode the actual RGBA sprites; coincident joint coordinates cannot make
  // these assertions pass. Alpha <128 is not solid anatomy.
  const images = new Map();
  function image(hero, file) {
    const key = hero + '/' + file;
    if (images.has(key)) return images.get(key);
    const data = readFileSync(new URL(key, source)); let offset = 8, width, height; const chunks = [];
    while (offset < data.length) {
      const len = data.readUInt32BE(offset), type = data.toString('ascii', offset + 4, offset + 8), bytes = data.subarray(offset + 8, offset + 8 + len);
      if (type === 'IHDR') { width = bytes.readUInt32BE(0); height = bytes.readUInt32BE(4); assert.equal(bytes[8], 8); assert.equal(bytes[9], 6); }
      if (type === 'IDAT') chunks.push(bytes); offset += len + 12;
    }
    const raw = inflateSync(Buffer.concat(chunks)), stride = width * 4, pixels = Buffer.alloc(height * stride);
    for (let y = 0; y < height; y++) for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? pixels[y * stride + x - 4] : 0, b = y ? pixels[(y - 1) * stride + x] : 0, c = y && x >= 4 ? pixels[(y - 1) * stride + x - 4] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const predictor = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][raw[y * (stride + 1)]];
      pixels[y * stride + x] = (raw[y * (stride + 1) + x + 1] + predictor) & 255;
    }
    const result = { width, height, pixels }; images.set(key, result); return result;
  }
  function opaque(hero, sol, slot, x, y) {
    const p = sol.parts[slot], m = sol.M[slot], s = sol.S[slot];
    const dx = x - m[4], dy = y - m[5], det = m[0] * m[3] - m[1] * m[2];
    const u = Math.floor((m[3] * dx - m[2] * dy) / det / s[0] + p.px), v = Math.floor((-m[1] * dx + m[0] * dy) / det / s[1] + p.py);
    const im = image(hero, p.file);
    return u >= 0 && v >= 0 && u < im.width && v < im.height && im.pixels[(v * im.width + u) * 4 + 3] >= 128;
  }
  let seams = 0;
  for (const hero of heroes) for (const state of ['idleA', 'idleB', 'run2', ...HERO_CHAIN[hero].flatMap(m => [m + '_wind', m + '_active', m + '_follow'])]) {
    const name = `${hero}_${state}`, sol = solve(hero, POSES[name], { poseName: name, animated: true });
    for (const [parent, child] of [['uarm', 'farm'], ['uarm_b', 'farm_b'], ['farm', 'hand'], ['farm_b', 'hand_b']]) {
      const [cx, cy] = apply(sol.M[child], 0, 0), masks = [[], []];
      for (let dy = -9; dy <= 9; dy += 0.5) for (let dx = -9; dx <= 9; dx += 0.5) {
        for (const [i, part] of [parent, child].entries()) if (opaque(hero, sol, part, cx + dx, cy + dy)) masks[i].push([dx, dy]);
      }
      let gap = Infinity;
      for (const p of masks[0]) for (const q of masks[1]) { gap = Math.min(gap, Math.hypot(p[0] - q[0], p[1] - q[1])); if (gap === 0) break; }
      assert.ok(gap <= 1.5, `${name}: opaque ${parent}/${child} gap ${gap} (joint coordinates alone are insufficient)`); seams++;
    }
  }
  // Visibility after ALL later opaque sprites, not merely overlap with the
  // immediate parent. An intact but fully buried forearm is not a readable arm.
  const visible = [];
  for (const hero of heroes) {
    const state = hero === 'teknium' ? 'idleA' : 'axeHeavy_active', name = `${hero}_${state}`;
    const sol = solve(hero, POSES[name], { poseName: name, animated: true });
    const slot = 'farm_b', p = sol.parts[slot], im = image(hero, p.file), later = sol.order.slice(sol.order.indexOf(slot) + 1);
    let total = 0, shown = 0;
    for (let y = 0; y < im.height; y++) for (let x = 0; x < im.width; x++) {
      if (im.pixels[(y * im.width + x) * 4 + 3] < 128) continue;
      total++;
      const q = apply(sol.M[slot], (x + 0.5 - p.px) * sol.S[slot][0], (y + 0.5 - p.py) * sol.S[slot][1]);
      if (!later.some(n => opaque(hero, sol, n, ...q))) shown++;
    }
    assert.ok(total > 20 && shown / total >= 0.15, `${name}: far forearm buried (${shown}/${total} opaque pixels visible)`);
    visible.push(`${name} ${(shown / total * 100).toFixed(1)}%`);
  }
  console.log('Polish authored keys:', frames.named, '; transition frames:', frames.transitions, '; max guard:', frames.maxGuard.toFixed(2), '; opaque arm seams:', seams, '; visible far arms:', visible.join(', '));
}
