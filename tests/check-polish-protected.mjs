// Exact legacy pose, solve, timeline and source-PNG invariants against PR #3.
// Browser RGBA hashes complement this: node tools/capture-polish.mjs protected.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const recording = process.argv.includes('--record');
const root = resolve(import.meta.dirname, '..');
const source = recording ? resolve(process.env.BASELINE_ROOT || '/tmp/opencode/hero-polish-baseline') : root;
const load = p => import(pathToFileURL(resolve(source, p)));
await load('don.js');
const { POSES, solve } = await load('rig.js');
const { HERO_RIGS } = await load('hero-rigs.js');
const { createAnim } = await load('anim.js');
const ids = ['turtle_purple', 'turtle_blue', 'turtle_red', 'turtle_orange', 'don_piedro'];
const digest = x => createHash('sha256').update(typeof x === 'string' || Buffer.isBuffer(x) ? x : JSON.stringify(x)).digest('hex');
const result = {};
for (const hero of ids) {
  const poses = Object.keys(POSES).filter(p => p.startsWith(hero + '_'));
  const assets = {};
  for (const file of new Set(Object.values(HERO_RIGS[hero]).map(p => p.file))) assets[file] = digest(await readFile(resolve(source, 'assets/heroes', hero, file)));
  const samples = {};
  for (const name of poses) {
    const anim = createAnim();
    anim.step(hero, hero + '_idleA', {}, 1 / 60, 0);
    const frames = [];
    for (let f = 1; f <= 12; f++) {
      const phase = /_active$/.test(name) ? 'active' : /_wind$/.test(name) ? 'wind' : /_recover$/.test(name) ? 'rec' : null;
      const info = { phase, dur: .2, heavy: true, walkT: /_(walk|run)[1-4]$/.test(name) ? f / 60 : null };
      const p = anim.step(hero, name, info, 1 / 60, f / 60);
      frames.push({ p, sol: solve(hero, p, { poseName: name, animated: true }) });
    }
    samples[name] = digest({ authored: POSES[name], static: solve(hero, POSES[name], { poseName: name, animated: true }), frames });
  }
  result[hero] = { rig: digest(HERO_RIGS[hero]), assets, samples };
}
const file = resolve(root, 'evidence/hero-animation-polish/before/protected-source.json');
if (recording) {
  await mkdir(resolve(file, '..'), { recursive: true });
  await writeFile(file, JSON.stringify(result, null, 2), { flag: 'wx' });
  console.log('Saved protected source/animation fixture from', source);
} else {
  assert.deepEqual(result, JSON.parse(await readFile(file)), 'A protected hero asset, rig, pose, animation or solve changed');
  console.log('Protected heroes unchanged: assets, rig metadata, every pose and 12 transition frames per pose.');
}
