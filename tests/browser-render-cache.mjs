#!/usr/bin/env node
// Side-by-side equivalence + headless timing diagnostic for the opt-in tint
// cache (roadmap item 10). The reference is the SHIPPED cache-OFF path.
//
// GATES (hard, exit 1 on failure):
//   - protected-kind identity: kinds in PROTECTED must be byte-identical cache-on
//     vs cache-off (rig.js never caches them);
//   - the cache-off vs cache-off control must be deterministic (0 diffs);
//   - the default path (no ?rigCache=1) must stay disabled with 0 bakes.
// Non-protected kinds (nous_girl, teknium, enemy rigs) are reported as an
// INFORMATIONAL experimental comparison only: their cache-on pixels are allowed
// to differ and this is not a failure. The cache stays DEFAULT OFF.
//
// Usage: node tests/browser-render-cache.mjs
// Requires a static server at GAME_URL (default http://127.0.0.1:48791/index.html)
// and Chromium. Writes evidence JSON to /tmp/opencode/gameplay-qol-performance/runtime/.
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { HEROES } from '../heroes.js';
import { ENEMY_RIGS } from '../enemy-rigs.js';
import '../don.js'; // registers don_piedro (the eighth hero) into the rig
import { POSES, HERO_MOVES, V2 } from '../rig.js';

const BASE_URL = process.env.GAME_URL || 'http://127.0.0.1:48791/index.html?coach=0&rigCache=1';
const CHROMIUM = process.env.CHROMIUM_PATH || process.env.CHROMIUM || '/snap/bin/chromium';

// Server lifetime: use the EXTERNAL server when the base origin is up; otherwise spawn
// our OWN server on a PRIVATE loopback port and kill ONLY that child PID on exit.
// Never pkill by port/name: another workstream may own the shared 48791 server.
async function httpUp(o) { try { const r = await fetch(o + '/index.html', { method: 'HEAD' }); return r.ok; } catch { return false; } }
function stopOwnServer() { if (!server) return; try { server.kill('SIGTERM'); } catch { /* ignore */ } server = null; }
let server = null;
let origin = new URL(BASE_URL).origin;
if (!(await httpUp(origin))) {
  const sharedPort = new URL(BASE_URL).port || '80';
  const candidates = [];
  for (let i = 0; i < 5; i++) candidates.push(20000 + ((process.pid + i * 131) % 20000));
  for (const port of candidates) {
    if (String(port) === sharedPort) continue;
    const child = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: new URL('..', import.meta.url), stdio: 'ignore' });
    const own = `http://127.0.0.1:${port}`;
    let up = false;
    for (let i = 0; i < 40; i++) { if (await httpUp(own)) { up = true; break; } await new Promise(r => setTimeout(r, 150)); }
    if (up) { server = child; origin = own; break; }
    try { child.kill('SIGTERM'); } catch { /* ignore */ }
  }
  if (!server) throw new Error('no static server: shared origin down and own spawn failed at ' + origin);
}
const TARGET_URL = BASE_URL.replace(new URL(BASE_URL).origin, origin);
const EVIDENCE = '/tmp/opencode/gameplay-qol-performance/runtime';
const SIZE = 360;
// Protected render contract (must match PROTECTED_RIGS in rig.js).
const PROTECTED = new Set(['turtle_purple', 'turtle_blue', 'turtle_red', 'turtle_orange', 'don_piedro', 'turbofit']);
const HERO_IDS = HEROES.map(h => h.id);
const ENEMY_IDS = Object.keys(ENEMY_RIGS);
const READY_IDS = [...HERO_IDS, ...ENEMY_IDS];

// Extreme poses mirrored from tests/check-rig-pixels.mjs, plus one wind/active/
// recover per hero, plus the v2 special states.
const extreme = {
  turtle_purple: ['vaultKick_active'], turtle_blue: ['slashSpin_active'], turtle_red: ['upper_active'],
  turtle_orange: ['slide_active', 'nunchakuSpin_active'], teknium: ['dash_active'],
  turbofit: ['axeHeavy_active', 'headbang_active'], nous_girl: ['roll_active', 'bassDrop_active'],
  don_piedro: ['slashSpin_active'],
};
const poses = [];
for (const { id: hero } of HEROES) {
  const names = [`${hero}_idleA`, `${hero}_walk1`, `${hero}_run2`, `${hero}_jump`, `${hero}_turn`, `${hero}_down`,
    ...(extreme[hero] || []).map(name => `${hero}_${name}`)];
  const [move] = Object.keys(HERO_MOVES[hero] || {});
  if (move) names.push(`${hero}_${move}_wind`, `${hero}_${move}_active`, `${hero}_${move}_recover`);
  if (V2[hero]) for (const state of ['axeB_active', 'hook_active', 'kick_active', 'jumpKick_active', 'kick_knee_active', 'kick_kneeFinal_active', 'grabThrow_active', 'screenThrow_active'])
    if (POSES[`${hero}_${state}`]) names.push(`${hero}_${state}`);
  for (const name of names) {
    if (!POSES[name]) throw Error(`missing expected pose ${name}`);
    poses.push({ hero, pose: name });
  }
}
// At least two extra tints: a palette-style string and a caller ctx.filter boss tint.
const tints = [
  { name: 'default', tint: 'none', filter: 'none' },
  { name: 'palette', tint: 'hue-rotate(90deg) saturate(1.2)', filter: 'none' },
  { name: 'boss-caller-filter', tint: 'none', filter: 'hue-rotate(250deg) saturate(1.3) brightness(0.9)' },
];
// Informational only: non-protected enemy kinds, cache-on pixels are allowed to
// differ and are reported separately from the protected identity gate.
const enemyPoses = [];
for (const kind of ENEMY_IDS) {
  const names = [`${kind}_idleA`, 'walk1', 'flinch', 'down'];
  const wind = Object.keys(POSES).find(p => p.startsWith(kind + '_') && p.endsWith('_wind'));
  if (wind) names.push(wind, wind.replace(/_wind$/, '_active'), wind.replace(/_wind$/, '_recover'));
  for (const name of names) if (POSES[name]) enemyPoses.push({ hero: kind, pose: name });
}
const cases = [];
for (const { hero, pose } of poses) for (const flip of [false, true]) for (const t of tints)
  cases.push({ hero, pose, flip, tint: t.tint, filter: t.filter, tintName: t.name, group: 'hero', protected: PROTECTED.has(hero) });
for (const { hero, pose } of enemyPoses) for (const flip of [false, true]) for (const t of tints)
  cases.push({ hero, pose, flip, tint: t.tint, filter: t.filter, tintName: t.name, group: 'enemy', protected: false });

const browser = await chromium.launch({ headless: true, executablePath: CHROMIUM, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(TARGET_URL, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => !!window.__ppRig && !!window.__ppTintCache, null, { timeout: 30000 });
  // Wait until every rendered rig's torso art is decoded.
  await page.waitForFunction(ids => ids.every(id => window.__ppRig.ready(id)), READY_IDS, { timeout: 30000 });
  await page.waitForTimeout(600);

  // Timing uses NON-protected kinds, otherwise rig.js correctly bypasses the
  // cache for protected kinds and the off/on comparison would be meaningless.
  const BENCH_IDS = ['nous_girl', 'teknium', ...ENEMY_IDS];

  const result = await page.evaluate(({ cases, size, benchIds }) => {
    const rig = window.__ppRig;
    const A = document.createElement('canvas'), B = document.createElement('canvas');
    A.width = A.height = B.width = B.height = size;
    const ca = A.getContext('2d', { willReadFrequently: true });
    const cb = B.getContext('2d', { willReadFrequently: true });
    const draw = (ctx, c, cacheOn) => {
      rig.setTintCache(cacheOn);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, size, size);
      ctx.filter = c.filter || 'none';
      rig.draw(ctx, c.hero, c.pose, size / 2, size * 0.74, c.flip, 1.4, null, 1 / 60, c.tint);
      ctx.filter = 'none';
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    };
    // Equivalence: cache OFF reference vs cache ON.
    const diffs = [];
    for (const c of cases) {
      draw(ca, c, false);
      const da = ca.getImageData(0, 0, size, size).data;
      draw(cb, c, true);
      const db = cb.getImageData(0, 0, size, size).data;
      let count = 0, first = -1, maxDelta = 0;
      for (let i = 0; i < da.length; i++) {
        const d = Math.abs(da[i] - db[i]);
        if (d) { if (first < 0) first = i; count++; if (d > maxDelta) maxDelta = d; }
      }
      if (count) diffs.push({ hero: c.hero, group: c.group, pose: c.pose, flip: c.flip, tint: c.tintName, protected: c.protected,
        diffBytes: count, firstByte: first, firstPixel: first < 0 ? null : [Math.floor(first / 4) % size, Math.floor(first / 4 / size), first % 4], maxDelta });
    }

    // Control: the SAME cache-off draw twice must be identical, proving the
    // harness/rig deterministic draw does not itself introduce differences.
    const controlCases = cases.filter(c => /_idleA$/.test(c.pose));
    let controlDiffs = 0;
    for (const c of controlCases) {
      draw(ca, c, false);
      const da = ca.getImageData(0, 0, size, size).data;
      draw(cb, c, false);
      const db = cb.getImageData(0, 0, size, size).data;
      for (let i = 0; i < da.length; i++) if (da[i] !== db[i]) { controlDiffs++; break; }
    }

    // --- timing diagnostic: many tinted actors, cache off vs on -------------
    const scene = (ctx, actors, tint, cacheOn) => {
      rig.setTintCache(cacheOn);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      for (let i = 0; i < actors; i++) {
        const kind = benchIds[i % benchIds.length];
        ctx.save();
        ctx.translate(0, 0);
        rig.draw(ctx, kind, i % 2 ? 'walk1' : `${kind}_idleA`, 40 + (i * 47) % 880, 300 + (i % 3) * 60, i % 2 === 1, 1.2, null, 1 / 60, tint);
        ctx.restore();
      }
    };
    const bench = (actors, tint, iterations) => {
      const canvas = document.createElement('canvas'); canvas.width = 960; canvas.height = 540;
      const ctx = canvas.getContext('2d');
      for (let w = 0; w < 4; w++) { scene(ctx, actors, tint, false); scene(ctx, actors, tint, true); }
      const off = (() => { const t = performance.now(); for (let i = 0; i < iterations; i++) scene(ctx, actors, tint, false); return performance.now() - t; })();
      const on = (() => { const t = performance.now(); for (let i = 0; i < iterations; i++) scene(ctx, actors, tint, true); return performance.now() - t; })();
      const actorDraws = actors * iterations;
      return { actors, iterations, offMs: off, onMs: on, offMsPerActor: off / actorDraws, onMsPerActor: on / actorDraws, ratio: on / off };
    };
    const timing = {
      small: bench(8, 'hue-rotate(90deg) saturate(1.2)', 60),
      large: bench(24, 'hue-rotate(90deg) saturate(1.2)', 40),
    };
    const cacheStats = { ...rig.cacheStats };
    rig.setTintCache(false);
    return { cases: cases.length, controlCases: controlCases.length, controlDiffs, diffs, timing, cache: cacheStats };
  }, { cases, size: SIZE, benchIds: BENCH_IDS });

  // Default-state regression: without ?rigCache=1 the cache must stay disabled
  // and bake nothing, i.e. the shipped render path is untouched.
  const defaultUrl = (() => { const u = new URL(TARGET_URL); u.searchParams.delete('rigCache'); return u.toString(); })();
  const page2 = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page2.goto(defaultUrl, { waitUntil: 'load', timeout: 60000 });
  await page2.waitForFunction(() => !!window.__ppRig && !!window.__ppTintCache, null, { timeout: 30000 });
  await page2.waitForFunction(ids => ids.every(id => window.__ppRig.ready(id)), READY_IDS, { timeout: 30000 });
  const defaultState = await page2.evaluate(() => {
    const rig = window.__ppRig, cache = window.__ppTintCache;
    const before = { enabled: cache.enabled, bakes: cache.stats.bakes, entries: cache.stats.entries };
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 200;
    const ctx = canvas.getContext('2d');
    rig.draw(ctx, 'turtle_purple', 'turtle_purple_idleA', 100, 150, false, 1.2, null, 1 / 60, 'hue-rotate(90deg) saturate(1.2)');
    const after = { enabled: cache.enabled, bakes: cache.stats.bakes, entries: cache.stats.entries };
    return { before, after };
  });
  await page2.close();
  const defaultOk = !defaultState.after.enabled && defaultState.after.bakes === 0 && defaultState.after.entries === 0;

  await mkdir(EVIDENCE, { recursive: true });
  const protectedDiffs = result.diffs.filter(d => d.protected);
  const infoDiffs = result.diffs.filter(d => !d.protected);
  const protectedCases = cases.filter(c => c.protected).length;
  const infoCases = cases.filter(c => !c.protected).length;
  const protectedIdentityPass = protectedDiffs.length === 0;
  const evidence = {
    generatedAt: new Date().toISOString(),
    harness: 'tests/browser-render-cache.mjs',
    url: TARGET_URL, chromium: CHROMIUM, headless: true,
    canvas: `${SIZE}x${SIZE}`,
    caveat: 'Headless software-raster diagnostic, not device FPS. Absolute timings are not representative of target hardware; only the off/on ratio within this harness is meaningful.',
    cacheState: 'opt-in experimental, DEFAULT OFF (?rigCache=1 to enable)',
    protectedHeroes: [...PROTECTED],
    protectedIdentityPass,
    defaultPath: { url: defaultUrl, cacheState: defaultState, disabledAndNoBakes: defaultOk },
    totals: {
      cases: result.cases, controlCases: result.controlCases, controlDiffCases: result.controlDiffs,
      protectedCases, protectedDiffCases: protectedDiffs.length,
      nonProtectedCases: infoCases, nonProtectedDiffCases: infoDiffs.length,
    },
    protectedIdentity: { cases: protectedCases, identical: protectedCases - protectedDiffs.length, diffCases: protectedDiffs.length, pass: protectedIdentityPass },
    // Informational only: these are NOT a gate.
    experimentalComparison: { cases: infoCases, diffCases: infoDiffs.length, examples: infoDiffs.slice(0, 40) },
    protectedDiffs, nonProtectedDiffs: infoDiffs,
    cacheStats: result.cache,
    timing: result.timing,
  };
  await writeFile(resolve(EVIDENCE, 'render-cache.json'), JSON.stringify(evidence, null, 2));

  console.log(`default path (no ?rigCache): enabled=${defaultState.after.enabled} bakes=${defaultState.after.bakes} entries=${defaultState.after.entries} -> ${defaultOk ? 'OK (off, no bakes)' : 'UNEXPECTED'}`);
  console.log(`control (cache-off vs cache-off): ${result.controlCases} cases, ${result.controlDiffs} differing (must be 0)`);
  console.log(`PROTECTED IDENTITY: ${protectedIdentityPass ? 'PASS' : 'FAIL'} — ${protectedCases - protectedDiffs.length}/${protectedCases} protected cases byte-identical (cache-on vs cache-off).`);
  for (const d of protectedDiffs.slice(0, 20))
    console.log(`  PROTECTED-DIFF ${d.hero} ${d.pose} ${d.flip ? 'left' : 'right'} ${d.tint}: ${d.diffBytes} bytes differ, first at pixel ${d.firstPixel}, maxDelta=${d.maxDelta}`);
  console.log(`EXPERIMENTAL COMPARISON (informational, not a gate): ${infoDiffs.length}/${infoCases} non-protected cases differ.`);
  for (const d of infoDiffs.slice(0, 10))
    console.log(`  ${d.group} ${d.hero} ${d.pose} ${d.flip ? 'left' : 'right'} ${d.tint}: ${d.diffBytes} bytes differ, first at pixel ${d.firstPixel}, maxDelta=${d.maxDelta}`);
  if (infoDiffs.length > 10) console.log(`  … ${infoDiffs.length - 10} more in ${EVIDENCE}/render-cache.json`);
  for (const [label, t] of Object.entries(result.timing))
    console.log(`timing[${label}] ${t.actors} actors x${t.iterations}: off ${t.offMs.toFixed(1)}ms (${t.offMsPerActor.toFixed(3)}ms/draw) -> on ${t.onMs.toFixed(1)}ms (${t.onMsPerActor.toFixed(3)}ms/draw), ratio ${t.ratio.toFixed(3)} [headless software-raster diagnostic, not device FPS]`);
  console.log(`cache stats: ${JSON.stringify(result.cache)}`);
  console.log(`evidence: ${EVIDENCE}/render-cache.json`);

  if (!defaultOk) {
    console.log('RESULT: FAIL — the default (no ?rigCache) path enabled or baked the cache.');
    process.exitCode = 1;
  } else if (result.controlDiffs > 0) {
    console.log(`RESULT: FAIL — the cache-off control itself differs in ${result.controlDiffs} case(s); the harness is not deterministic.`);
    process.exitCode = 1;
  } else if (!protectedIdentityPass) {
    console.log(`RESULT: FAIL — protected identity broke in ${protectedDiffs.length} case(s); keep the cache DEFAULT OFF.`);
    process.exitCode = 1;
  } else {
    console.log('RESULT: PASS — protected-kind identity holds byte-for-byte. Non-protected differences are informational; the cache stays OPT-IN EXPERIMENTAL (default off).');
  }
} finally { await browser.close(); stopOwnServer(); /* own child PID only; an external server is never touched */ }
