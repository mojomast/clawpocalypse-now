// Exercise recovery history, not independently solved pose-table snapshots.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { createAnim } from '../anim.js';
import { createFootLocks } from '../foot-lock.js';
import { createRig, solve, idleVariantAt, POSES, soleGround } from '../rig.js';
import { createState, damagePlayer } from '../logic.js';
import { createCombat, combatStep } from '../combat.js';

// Pose selection does not decode images; leave the real selector unmodified.
const originalImage = globalThis.Image;
globalThis.Image = class { set src(value) {} };
const rig = createRig();
if (originalImage === undefined) delete globalThis.Image;
else globalThis.Image = originalImage;

const heroes = ['nous_girl', 'teknium', 'turbofit'];
const scale = .7, rows = [], failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };
const point = (solution, part) => solution.M[part].slice(4);
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) * scale;
const solveDrawing = (hero, drawing) => solve(hero, drawing, {
  poseName: drawing.__pose, animated: true,
  footTargets: drawing.__footTargets, rootDy: drawing.__rootDy,
});

for (const hero of heroes) for (const hz of [30, 60, 144]) for (const flip of [false, true]) for (const blink of [false, true]) {
  const dt = 1 / hz, anim = createAnim(), locks = createFootLocks();
  const referenceAnim = createAnim(), referenceLocks = createFootLocks();
  const state = createState();
  Object.assign(state, { hero, selectedHero: hero, hpMode: true, coopSecondary: true, ninjas: [], holdWave: true });
  Object.assign(state.player, { x: 500, y: 410, z: 0 });
  createCombat(state);
  Object.assign(state.combat, { facing: flip ? -1 : 1, moving: false });
  const origin = { x: state.player.x, y: state.player.y + state.player.r - 63, flip, scale };
  // The standing control plants once at authored rest, then breathes over those
  // fixed feet. Recreating locks every frame is NOT a stationary idle control:
  // it makes its feet skate >2px with breathing even without any knockdown.
  referenceLocks.place(hero, hero, referenceAnim.step(hero, `${hero}_idleA`, { phase: null }, dt, 0), { ...origin, dt });
  const label = `${hero}/${hz}/${flip ? 'left' : 'right'}/${blink ? 'game-blink' : 'every-frame'}`;
  // Align the start of recovery with idleA's clock window, including the hero's
  // normal idle offset. This leaves a full three seconds without an idle-variant
  // change obscuring the recovery regression; breathing remains live.
  let clockStart = 0;
  while (idleVariantAt(hero, clockStart) !== `${hero}_idleA`) clockStart += 3.4;
  let t = clockStart - .7;
  let previous, idleStart = null, maxRootStep = 0, maxHipStep = 0, maxAnkleStep = 0;
  let maxGroundError = 0, maxSettledHipError = 0, maxSettledAnkleError = 0;
  let maxAnchorStep = 0, maxSettledAnchorStep = 0, maxPlantedTargetDrift = 0, previousAnchors, frozenFrames = 0;
  const seen = new Set(), samples = [];
  const render = () => {
    const name = rig.playerPose(state, t);
    const drawing = anim.step(hero, name, { phase: null, walkT: null, walkRate: 8 }, dt, t);
    const placed = locks.place(hero, hero, drawing, { ...origin, dt });
    const solution = solveDrawing(hero, placed);
    return { name, drawing, placed, solution };
  };
  render();
  assert.equal(damagePlayer(state, 12, { knockdown: true, x: state.player.x + 100 }), 12);
  assert.equal(state.hp, 88);
  assert.equal(state.playerDown, .7);
  for (let frame = 0; frame < Math.ceil(hz * 3.72); frame++) {
    combatStep(state, dt);
    // update() reduces invulnerability after combatStep; game.js skips the
    // entire animation/foot-lock/draw path on alternate invulnerability bands.
    state.invuln = Math.max(0, state.invuln - dt);
    t += dt;
    if (!state.playerDown && idleStart === null) idleStart = t;
    if (blink && state.invuln > 0 && Math.floor(state.invuln * 10) % 2) continue;
    const referenceDrawing = referenceAnim.step(hero, `${hero}_idleA`, { phase: null }, dt, t);
    const reference = solveDrawing(hero, referenceLocks.place(hero, hero, referenceDrawing, { ...origin, dt }));
    const current = render(), { name, placed, solution } = current;
    seen.add(name.slice(hero.length + 1));
    const age = idleStart === null ? -1 : t - idleStart;
    if (previous && age >= 0) {
      maxRootStep = Math.max(maxRootStep, Math.abs(solution.M.torso[5] - previous.solution.M.torso[5]) * scale);
      maxHipStep = Math.max(maxHipStep, ...['thigh', 'thigh_b'].map(part => distance(point(solution, part), point(previous.solution, part))));
      maxAnkleStep = Math.max(maxAnkleStep, ...['foot', 'foot_b'].map(part => distance(point(solution, part), point(previous.solution, part))));
    }
    if (age >= 0) {
      for (const side of solution.contacts) maxGroundError = Math.max(maxGroundError, solution.ground[side].error * scale);
      for (const side of ['front', 'back']) {
        const target = placed.__footTargets[side], before = previous?.placed.__footTargets[side];
        if (target && before && Math.abs(target[1] - soleGround(hero)) < 1e-8 && Math.abs(before[1] - soleGround(hero)) < 1e-8) {
          maxPlantedTargetDrift = Math.max(maxPlantedTargetDrift, Math.abs(target[0] + (placed.dx || 0) - before[0] - (previous.placed.dx || 0)) * scale);
        }
      }
      const anchors = { ...locks.tracks.get(hero).anchors };
      if (previousAnchors) for (const side of Object.keys(anchors)) {
        if (previousAnchors[side] !== undefined) {
          const step = Math.abs(anchors[side] - previousAnchors[side]);
          maxAnchorStep = Math.max(maxAnchorStep, step);
          if (age >= 1) maxSettledAnchorStep = Math.max(maxSettledAnchorStep, step);
        }
      }
      previousAnchors = anchors;
    }
    if (age >= 1) {
      // Continuously animated idle with no recovery history, at the same breath
      // phase; its ankle targets remain those of the settled static rest pose.
      const hipError = Math.max(...['thigh', 'thigh_b'].map(part => distance(point(solution, part), point(reference, part))));
      const ankleError = Math.max(...['foot', 'foot_b'].map(part => distance(point(solution, part), point(reference, part))));
      maxSettledHipError = Math.max(maxSettledHipError, hipError);
      maxSettledAnkleError = Math.max(maxSettledAnkleError, ankleError);
    }
    // A paused recovery must freeze BOTH the timeline and world-lock result.
    if (age >= 0 && age < .3) {
      const before = solveDrawing(hero, placed);
      for (let stop = 0; stop < 3; stop++) {
        const frozen = anim.step(hero, name, { phase: null }, 0, t + stop + 10);
        const contact = locks.place(hero, hero, frozen, { ...origin, dt: 0 });
        check(JSON.stringify(solveDrawing(hero, contact).M) === JSON.stringify(before.M), `${label}: recovery hit-stop moved the rig`);
        frozenFrames++;
      }
    }
    if (frame === 0 || (age >= 0 && (!samples.length || age - samples.at(-1).idleAge >= .45))) {
      samples.push({ frame, time: +(t - clockStart + .7).toFixed(6), idleAge: +age.toFixed(6), name,
        rootY: solution.M.torso[5] * scale, hips: ['thigh', 'thigh_b'].map(part => point(solution, part).map(v => v * scale)),
        ankles: ['foot', 'foot_b'].map(part => point(solution, part).map(v => v * scale)) });
    }
    previous = current;
  }
  check(seen.has('down') && seen.has('wake') && seen.has('idleA'), `${label}: did not exercise down → wake → idleA`);
  check(t - idleStart >= 3 - dt, `${label}: stationary idle was not sustained for three seconds`);
  check(state.player.x === origin.x && state.combat.phase === 'idle' && !state.playerDown, `${label}: simulation did not recover stationary`);
  check(maxSettledHipError <= 1, `${label}: settled hip differs from standing idle by ${maxSettledHipError.toFixed(3)}px`);
  check(maxSettledAnkleError <= 1, `${label}: settled ankle differs from standing idle by ${maxSettledAnkleError.toFixed(3)}px`);
  check(maxGroundError <= .75, `${label}: idle support error ${maxGroundError.toFixed(3)}px`);
  const rootRate = hero === 'nous_girl' ? 450 : 240;
  check(maxRootStep <= rootRate * scale * dt + .5, `${label}: root teleported ${maxRootStep.toFixed(3)}px in one frame`);
  // The deliberate 0.2s lifted replant can travel faster than the pelvis, but
  // must remain frame-rate continuous rather than snap to the standing foot.
  check(maxAnkleStep <= 500 * dt + 1, `${label}: ankle teleported ${maxAnkleStep.toFixed(3)}px in one frame`);
  check(maxSettledAnchorStep <= 1e-8, `${label}: settled support anchor drifted ${maxSettledAnchorStep.toFixed(3)}px`);
  check(maxPlantedTargetDrift <= 1e-8, `${label}: planted support target drifted ${maxPlantedTargetDrift.toFixed(3)}px`);
  rows.push({ hero, hz, flip, blink, maxRootStep, maxHipStep, maxAnkleStep, maxGroundError, maxSettledHipError, maxSettledAnkleError, maxAnchorStep, maxSettledAnchorStep, maxPlantedTargetDrift, frozenFrames, samples });
}

// Ordinary stance anchors must stay locked: the recovery repair is not a
// blanket reset of every double-support frame (small actor shifts expose that).
for (const hero of heroes) {
  const anim = createAnim(), locks = createFootLocks(), dt = 1 / 60;
  let expected;
  for (let frame = 0; frame < 60; frame++) {
    const drawing = anim.step(hero, `${hero}_idleA`, {}, dt, frame * dt);
    locks.place(hero, hero, drawing, { x: 500 + Math.sin(frame * .1) * .2, y: 300, scale, dt });
    const anchors = { ...locks.tracks.get(hero).anchors };
    expected ||= anchors;
    check(JSON.stringify(anchors) === JSON.stringify(expected), `${hero}: ordinary idle anchors were released or dragged`);
  }
}

// A newly active drawing still commits on the first zero-dt contact frame,
// then the complete foot-locked solve remains frozen throughout hit-stop.
for (const hero of heroes) for (const flip of [false, true]) {
  const anim = createAnim(), locks = createFootLocks(), dt = 1 / 60;
  const origin = { x: 500, y: 300, scale, flip };
  for (let frame = 0; frame < 12; frame++) {
    const drawing = anim.step(hero, `${hero}_kick_wind`, { phase: 'wind', dur: .2 }, dt, frame * dt);
    locks.place(hero, hero, drawing, { ...origin, dt });
  }
  const name = `${hero}_kick_active`;
  const active = anim.step(hero, name, { phase: 'active', dur: .13 }, 0, .2);
  const placed = locks.place(hero, hero, active, { ...origin, dt: 0 });
  check(placed.__pose === name && placed.uarm === POSES[name].uarm, `${hero}: first hit-stop frame retained the wind-up`);
  const frozenMatrices = JSON.stringify(solveDrawing(hero, placed).M);
  for (let stop = 0; stop < 8; stop++) {
    const drawing = anim.step(hero, name, { phase: 'active', dur: .13 }, 0, stop + 1);
    const repeated = locks.place(hero, hero, drawing, { ...origin, dt: 0 });
    check(JSON.stringify(solveDrawing(hero, repeated).M) === frozenMatrices, `${hero}: active hit-stop foot locks drifted`);
  }
}

if (process.env.POLISH_RECOVERY_REPORT) await writeFile(process.env.POLISH_RECOVERY_REPORT, JSON.stringify({ rows, failures: [...new Set(failures)] }, null, 2));
assert.equal(failures.length, 0, [...new Set(failures)].join('\n'));
console.table(heroes.map(hero => {
  const cases = rows.filter(row => row.hero === hero);
  const max = key => +Math.max(...cases.map(row => row[key])).toFixed(6);
  return { hero, cases: cases.length, hipErrorPx: max('maxSettledHipError'), ankleErrorPx: max('maxSettledAnkleError'),
    supportErrorPx: max('maxGroundError'), plantedDriftPx: max('maxPlantedTargetDrift') };
}));
console.log('Recovery: 36 real-damage → production pose-selector → animation → foot-lock → solve paths; three stationary seconds, live breathing, both facings, with/without game invulnerability blinking, frozen recovery/contact, ordinary anchors retained.');
