// tools/playtest-report.mjs — turn a captured window.__ppPerf.export() JSON into a
// short human-readable playtest report. Pure formatting; reads one file, writes to
// stdout. No game, no browser, no network.
//
//   node tools/playtest-report.mjs path/to/capture.json
//
// Accepted inputs: a raw export() object, a { snapshot, exported } wrapper (as
// written by tests/browser-runtime.mjs), or an array of such objects.
import { readFile } from 'node:fs/promises';

const path = process.argv[2];
if (!path) { console.error('usage: node tools/playtest-report.mjs <capture.json>'); process.exit(2); }
const raw = JSON.parse(await readFile(path, 'utf8'));
const captures = Array.isArray(raw) ? raw : [raw];

const ms = v => `${Number(v).toFixed(2)} ms`;
const line = (k, v) => `${k.padEnd(22)} ${v}`;

for (const c of captures) {
  const s = c.snapshot || c;
  const title = c.scenario || c.url || c.at || 'capture';
  console.log('='.repeat(64));
  console.log(`PLAYTEST REPORT — ${title}`);
  if (c.caveat) console.log(c.caveat);
  console.log('-'.repeat(64));
  console.log(line('frames', s.frames ?? 0));
  console.log(line('fps (from mean gap)', s.fps ?? 0));
  const f = s.frameMs || {};
  console.log(line('frame p50 / p95 / p99', `${ms(f.p50 || 0)} / ${ms(f.p95 || 0)} / ${ms(f.p99 || 0)}`));
  console.log(line('frame min / max / mean', `${ms(f.min || 0)} / ${ms(f.max || 0)} / ${ms(f.mean || 0)}`));
  console.log(line('sim mean', ms(s.simMs || 0)));
  console.log(line('render mean', ms(s.renderMs || 0)));
  console.log(line('substeps total/max', `${s.substeps ? s.substeps.total : 0} / ${s.substeps ? s.substeps.perFrameMax : 0}`));
  console.log(line('dropped time', ms(s.droppedMs || 0)));
  const k = s.counters || {};
  console.log('-'.repeat(64));
  console.log('counters (P1 only; P2 is not instrumented)');
  console.log(line('  P1 attack starts', k.p1AttackStarts || 0));
  console.log(line('  P1 landed attacks', k.p1LandedAttacks || 0));
  console.log(line('  P1 damage events', k.p1DamageEvents || 0));
  console.log(line('  P1 score events', k.p1ScoreEvents || 0));
  console.log(line('  continues', k.continues || 0));
  const heroes = k.p1AttackStartsByHero || {};
  const heroList = Object.keys(heroes).map(h => `${h}=${heroes[h]}`).join(', ') || '-';
  console.log(line('  P1 attack starts by hero', heroList));
  const enc = k.encounterMsByLevel || {};
  const encList = Object.keys(enc).map(l => `L${l}=${(enc[l] / 1000).toFixed(1)}s`).join(', ') || '-';
  console.log(line('  encounter time', encList));
  console.log('='.repeat(64));
}
