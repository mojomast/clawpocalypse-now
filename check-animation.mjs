import assert from 'node:assert/strict';
import { createAnim } from './anim.js';
import { POSES, createRig, solve, apply, SOLES, V2 } from './rig.js';
import { HEROES } from './heroes.js';
import { HERO_RIGS } from './hero-rigs.js';
import { createFootLocks } from './foot-lock.js';
import './don.js';

// Selection is pure; images are exercised separately by check-rigs and the
// browser smoke test, not replaced there with this no-op loader.
globalThis.Image = class { set src(value) {} };
const rig = createRig();
let samples = 0;
for (const { id: hero } of HEROES) {
  const state = { selectedHero: hero, combat: { phase: 'idle', walkT: 0, moving: true, running: true } };
  assert.equal(rig.playerPose(state, 0), `${hero}_run1`);
  state.hurtT = 0.2;
  assert.equal(rig.playerPose(state, 0), `${hero}_flinch`);
  state.playerDown = 0.7;
  assert.equal(rig.playerPose(state, 0), `${hero}_down`);
  state.playerDown = 0.1;
  assert.equal(rig.playerPose(state, 0), `${hero}_wake`);
  state.playerDown = state.hurtT = 0;
  state.combat.grab = {};
  state.combat.attack = { name: 'grabThrow' }; state.combat.phase = 'active';
  assert.equal(rig.playerPose(state, 0), `${hero}_grabThrow_active`, 'grab hold must not hide a throw');

  const anim = createAnim(); let t = 0;
  const step = (name, phase, dur, heavy = true) => anim.step(hero, name, { phase, dur, heavy }, 1 / 60, t += 1 / 60);
  const moves = Object.keys(POSES).filter(k => k.startsWith(hero + '_') && k.endsWith('_wind') && POSES[k.replace(/_wind$/, '_active')] && POSES[k.replace(/_wind$/, '_recover')]);
  for (const wind of moves) {
    anim.forget(hero);
    step(`${hero}_idleA`, null, 0.2);
    for (let i = 0; i < 12; i++) step(wind, 'wind', 0.2);
    let strike;
    for (let i = 0; i < 8; i++) strike = step(wind.replace(/_wind$/, '_active'), 'active', 0.13);
    const rec = wind.replace(/_wind$/, '_recover');
    if (POSES[wind.replace(/_wind$/, '_follow')]) {
      for (let i = 0; i < 2; i++) {
        const hold = step(rec, 'rec', 0.3);
        for (const k of ['torso', 'head', 'uarm', 'farm', 'weapon']) assert.equal(hold[k], strike[k], `${rec}: impact hold ${i + 1}.${k}`);
      }
    }
    let last;
    for (let i = 0; i < 60; i++) {
      last = step(rec, 'rec', 0.3);
      for (const [key, value] of Object.entries(last)) if (!key.startsWith('__')) assert.ok(Number.isFinite(value), `${rec}.${key} finite`);
      samples++;
    }
    for (const k of ['torso', 'head', 'uarm', 'farm', 'weapon']) assert.ok(Math.abs(last[k] - (POSES[rec][k] || 0)) < 0.01, `${rec}.${k}: completed recovery`);
    const frozen = structuredClone(last);
    assert.deepEqual(anim.step(hero, `${hero}_idleA`, {}, 0, t + 10), frozen, 'hit stop must freeze the drawing');
  }
}
assert.notEqual(POSES.don_piedro_idleA, POSES.turtle_blue_idleA, 'Don must not alias another hero');
assert.notDeepEqual(POSES.don_piedro_idleA, POSES.turtle_blue_idleA, 'Don needs his own stance');
console.log(`Animation checks passed: ${HEROES.length} heroes, ${samples} recovery samples, state selection, exact impact holds, hit-stop freeze.`);

let contacts = 0, maxDrift = 0, toeOffs = 0;
for (const { id: hero } of HEROES) for (const flip of [false, true]) for (const running of [false, true]) {
  const locks = createFootLocks(), anim = createAnim();
  let x = 200;
  const speed = running ? 385 : 220, stride = running ? 64 : 46;
  for (let frame = 0; frame < 120; frame++) {
    x += (flip ? -1 : 1) * speed / 60;
    const walkT = (frame + 1) * speed / 60 / (stride * 4);
    const name = `${hero}_${running ? 'run' : 'walk'}${Math.floor(walkT * 8) % 4 + 1}`;
    const drawing = anim.step(hero, name, { walkT, walkRate: 8 }, 1 / 60, frame / 60);
    const pose = locks.place(hero, hero, drawing, { x, y: 0, flip, scale: 0.7 });
    const sol = solve(hero, pose, { poseName: name, animated: true, footTargets: pose.__footTargets, rootDy: pose.__rootDy });
    for (const side of sol.contacts) {
      assert.ok(pose.__footTargets[side], `${name}: ordinary gait should not release its support anchor`);
      const n = side === 'front' ? 'shin' : 'shin_b', part = HERO_RIGS[hero][n], scale = sol.S[n];
      const point = SOLES[hero][V2[hero] ? 0 : sol.ground[side].contactIndex];
      let q = apply(sol.M[n], (point[0] - part.px) * scale[0], (point[1] - part.py) * scale[1]);
      let expected = locks.tracks.get(hero).anchors[side];
      if (V2[hero]) {
        assert.ok(!sol.ground[side].toeOff, `${name}: planted support fell back to a toe pivot`);
        const fn = side === 'front' ? 'foot' : 'foot_b', f = HERO_RIGS[hero][fn];
        const heel = apply(sol.M[fn], f.sole[0] - f.px, f.sole[1] - f.py);
        const toe = apply(sol.M[fn], f.sole[2] - f.px, f.sole[3] - f.py);
        assert.ok(Math.abs(heel[1] - toe[1]) < .1, `${name}: planted sole is not flat`);
      }
      const worldX = x + (flip ? -1 : 1) * 0.7 * q[0];
      const drift = Math.abs(worldX - expected);
      assert.ok(drift <= 1, `${name}: support foot skated ${drift}px`);
      maxDrift = Math.max(maxDrift, drift); contacts++;
    }
  }
}
console.log(`World contacts passed: ${contacts} walking/running supports (${toeOffs} v2 toe-offs), both facings; maximum X drift ${maxDrift.toFixed(4)}px.`);

for (const { id: hero } of HEROES) {
  const locks = createFootLocks(), anim = createAnim();
  let time = 0, previous;
  for (const state of ['idleA', 'down', 'wake', 'idleA']) for (let frame = 0; frame < 30; frame++) {
    const name = `${hero}_${state}`;
    const pose = locks.place(hero, hero, anim.step(hero, name, {}, 1 / 60, time += 1 / 60), { x: 0, y: 0 });
    const sol = solve(hero, pose, { poseName: name, animated: true, footTargets: pose.__footTargets, rootDy: pose.__rootDy });
    if (previous) assert.ok(Math.abs(sol.M.torso[5] - previous.M.torso[5]) <= 7.51, `${name}: get-up root snapped`);
    if (sol.ground) assert.ok(sol.ground.residual <= 1, `${name}: recovery lost floor contact`);
    previous = sol;
  }
}
console.log('Down/get-up transitions passed: no root teleport, reachable support contacts.');
