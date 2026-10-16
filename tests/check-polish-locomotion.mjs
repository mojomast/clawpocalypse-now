// Freeze the complete protected-hero timeline -> world-foot-lock -> solve path.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const recording = process.argv.includes('--record');
const root = resolve(import.meta.dirname, '..');
const source = recording ? resolve(process.env.BASELINE_ROOT || '/tmp/opencode/hero-polish-baseline') : root;
const load = p => import(pathToFileURL(resolve(source, p)));
await load('don.js');
const { createAnim } = await load('anim.js'), { createFootLocks } = await load('foot-lock.js'), { solve } = await load('rig.js');
const result = {};
for (const hero of ['turtle_purple', 'turtle_blue', 'turtle_red', 'turtle_orange', 'don_piedro']) {
  result[hero] = {};
  for (const hz of [30, 60, 144]) for (const flip of [false, true]) {
    const anim = createAnim(), locks = createFootLocks(), hash = createHash('sha256');
    let x = 200;
    for (let f = 0; f < hz * 4; f++) {
      const t = f / hz, run = t >= 1.5, moving = t > .2 && t < 2.8;
      const speed = run ? 385 : 220;
      if (moving) x += (flip ? -1 : 1) * speed / hz;
      const walkT = t * speed / ((run ? 64 : 46) * 4);
      const state = moving ? `${run ? 'run' : 'walk'}${Math.floor(walkT * 8) % 4 + 1}` : t < 3 ? 'idleA' : t < 3.4 ? 'down' : t < 3.7 ? 'wake' : 'idleA';
      const name = `${hero}_${state}`, drawing = anim.step(hero, name, { walkT: moving ? walkT : null, walkRate: 8 }, 1 / hz, t);
      const pose = locks.place(hero, hero, drawing, { x, y: 0, flip, scale: .7, dt: 1 / hz });
      hash.update(JSON.stringify({ pose, sol: solve(hero, pose, { poseName: name, animated: true, footTargets: pose.__footTargets, rootDy: pose.__rootDy }) }));
    }
    result[hero][`${hz}:${flip}`] = hash.digest('hex');
  }
}
const file = resolve(root, 'evidence/hero-animation-polish/before/protected-locomotion.json');
if (recording) await writeFile(file, JSON.stringify(result, null, 2), { flag: 'wx' });
else assert.deepEqual(result, JSON.parse(await readFile(file)), 'Protected complete locomotion/recovery rendering transforms changed');
console.log('Protected full locomotion/recovery: exact at 30/60/144Hz, both facings.');
