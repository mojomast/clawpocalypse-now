import assert from 'node:assert/strict';
import { createAnim } from '../anim.js';
import { POSES } from '../rig.js';
let contacts = 0;
for (const hero of ['teknium', 'nous_girl', 'turbofit']) {
  for (const name of Object.keys(POSES).filter(n => n.startsWith(hero + '_') && n.endsWith('_active'))) {
    for (const hz of [30, 60, 120, 144]) for (const atStop of [false, true]) {
      const anim = createAnim(), dt = 1 / hz;
      const wind = name.replace(/_active$/, '_wind');
      anim.step(hero, hero + '_idleA', {}, dt, 0);
      for (let f = 1; f <= 12; f++) anim.step(hero, wind, { phase: 'wind', dur: .12 }, dt, f * dt);
      const pose = anim.step(hero, name, { phase: 'active', dur: .13, heavy: true }, atStop ? 0 : dt, 13 * dt);
      for (const channel of ['torso', 'uarm', 'farm', 'uarm_b', 'farm_b', 'weapon']) assert.ok(Math.abs(pose[channel] - (POSES[name][channel] || 0)) < 1e-10, `${name}@${hz}: ${channel} not at contact drawing when damage becomes eligible`);
      const frozen = structuredClone(pose);
      for (let f = 0; f < 8; f++) assert.deepEqual(anim.step(hero, name, { phase: 'active', dur: .13, heavy: true }, 0, 2 + f), frozen, `${name}: hit-stop drift`);
      contacts++;
    }
  }
}
console.log(`Contact timing: ${contacts} first-active/frozen drawings at 30/60/120/144Hz, including phase changes during hit-stop.`);
