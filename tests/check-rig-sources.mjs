// Source-of-truth sync: hero-rigs.js must be exactly what tools/gen-hero-rigs.mjs makes from
// assets/heroes/MANIFEST.md, and every sliced part must still hash to what its SLICE.json recorded.
// Run: node tests/check-rig-sources.mjs (pure Node; never runs the Python slicer).
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parse, emit } from '../tools/gen-hero-rigs.mjs';

const root = new URL('../', import.meta.url);
const manifest = readFileSync(new URL('assets/heroes/MANIFEST.md', root), 'utf8');
const generated = emit(parse(manifest));
assert.equal(readFileSync(new URL('hero-rigs.js', root), 'utf8'), generated,
  'hero-rigs.js differs from assets/heroes/MANIFEST.md: run node tools/gen-hero-rigs.mjs');
let hashed = 0, sliced = [];
for (const hero of readdirSync(new URL('assets/heroes/', root))) {
  const spec = new URL(`assets/heroes/${hero}/src/SLICE.json`, root);
  if (!existsSync(spec)) continue;
  const { outputs } = JSON.parse(readFileSync(spec, 'utf8'));
  assert.ok(outputs?.sha256, `${hero}: SLICE.json has no recorded outputs (run the slicer with --write)`);
  for (const [file, sum] of Object.entries(outputs.sha256)) {
    const data = readFileSync(new URL(`assets/heroes/${hero}/${file}`, root));
    assert.equal(createHash('sha256').update(data).digest('hex'), sum, `${hero}/${file}: edited after slicing (re-slice instead)`);
    hashed++;
  }
  for (const [sheet, sum] of Object.entries(outputs.inputs || {})) {
    const file = JSON.parse(readFileSync(spec, 'utf8')).sheets[sheet].file;
    const data = readFileSync(new URL(`assets/heroes/${hero}/src/${file}`, root));
    assert.equal(createHash('sha256').update(data).digest('hex'), sum, `${hero}/src/${file}: source sheet changed since slicing`);
  }
  sliced.push(hero);
}
console.log(`rig sources OK: hero-rigs.js matches MANIFEST.md; ${hashed} sliced parts match SLICE.json (${sliced.join(', ') || 'no sliced heroes yet'})`);
