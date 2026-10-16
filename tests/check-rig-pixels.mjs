#!/usr/bin/env node
// Rasterized seam audit. Run: node tests/check-rig-pixels.mjs
// Add --strict-overlap to fail on every >6px raw alpha intersection, including
// the source art's intentional shoulder/hip/coat occlusion.
// Requires the project's Playwright dev dependency and a Chromium installation.
// Matrices/scales come from production solve(); seam measurements come ONLY from
// decoded PNG alpha, never from the manifest's coincident attachment coordinates.
// Scope: local pairwise alpha separation. Zero measured separation proves that
// the two solid masks touch/intersect somewhere in the 14px joint neighborhood;
// it does NOT prove that every exposed contour is seamless after other sprites
// occlude them. Similarly, deep raw overlap is common for cutout art whose
// torso/coat intentionally covers the limb root; inspect unusual-vs-idle cases
// and the supplied crops before moving pivots or changing art.
import { readFile, mkdir, writeFile, readdir, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { HEROES as roster } from '../heroes.js';
import { HERO_RIGS } from '../hero-rigs.js';
import '../don.js';
import { POSES, HERO_MOVES, solve, apply, V2 } from '../rig.js';

const root = resolve(import.meta.dirname, '..');
const output = '/tmp/opencode/rig-pixel-seams';
const radius = 14; // in native rig pixels; excludes unrelated artwork away from the articulation
const alphaCutoff = 64; // antialias fringes must not count as a connected limb
const gapLimit = 1;
const deepLimit = 6; // raw penetration of *both* opaque silhouettes, in rig pixels
const excessLimit = 2; // increase over this same hero/joint's idle art, not a replacement for deepLimit
const joints = [
  ['neck', 'torso', 'head'],
  ['shoulder', 'torso', 'uarm'], ['shoulder_back', 'torso', 'uarm_b'],
  ['elbow', 'uarm', 'farm'], ['elbow_back', 'uarm_b', 'farm_b'],
  ['hip', 'torso', 'thigh'], ['hip_back', 'torso', 'thigh_b'],
  ['knee', 'thigh', 'shin'], ['knee_back', 'thigh_b', 'shin_b'],
];
// v2 rigs (separate hands and feet) also need sealed wrists and ankles.
const v2Joints = [
  ['wrist', 'farm', 'hand'], ['wrist_back', 'farm_b', 'hand_b'],
  ['ankle', 'shin', 'foot'], ['ankle_back', 'shin_b', 'foot_b'],
];
const extreme = {
  turtle_purple: ['vaultKick_active'], turtle_blue: ['slashSpin_active'], turtle_red: ['upper_active'],
  turtle_orange: ['slide_active', 'nunchakuSpin_active'], teknium: ['dash_active'],
  turbofit: ['axeHeavy_active', 'headbang_active'], nous_girl: ['roll_active', 'bassDrop_active'],
  don_piedro: ['slashSpin_active'],
};
const cases = [];
for (const { id: hero } of roster) {
  const poseNames = [`${hero}_idleA`, `${hero}_walk1`, `${hero}_walk3`, `${hero}_run2`,
    `${hero}_jump`, `${hero}_turn`, `${hero}_down`, ...(extreme[hero] || []).map(name => `${hero}_${name}`)];
  for (const [move] of Object.entries(HERO_MOVES[hero] || {}).slice(0, 2)) {
    poseNames.push(`${hero}_${move}_wind`, `${hero}_${move}_active`, `${hero}_${move}_recover`);
  }
  for (const pose of poseNames) {
    if (!POSES[pose]) throw Error(`missing expected pose ${pose}`);
    for (const flip of [false, true]) {
      const sol = solve(hero, POSES[pose], { poseName: pose, animated: true });
      for (const [joint, parent, child] of [...joints, ...(V2[hero] ? v2Joints : [])]) {
        // Center the measurement near the anatomical joint, but do not use its
        // coordinate to decide whether either image actually has opaque pixels.
        // v2 rigs draw pose variants (front head/torso, open/far hands): use the drawn part.
        const center = apply(sol.M[child], 0, 0);
        const partOf = n => (sol.parts && sol.parts[n]) || HERO_RIGS[hero][n];
        cases.push({ hero, pose, facing: flip ? 'left' : 'right', joint, parent, child,
          ppart: partOf(parent), cpart: partOf(child),
          center, pm: sol.M[parent], ps: sol.S[parent], cm: sol.M[child], cs: sol.S[child] });
      }
    }
  }
}
if (roster.length !== 8) throw Error(`expected eight hero rigs, found ${roster.length}`);

const browser = await chromium.launch({ headless: true,
  executablePath: process.env.CHROMIUM || '/snap/bin/chromium',
  args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const page = await browser.newPage();
  const results = [];
  for (const { id: hero } of roster) {
    const table = HERO_RIGS[hero];
    const images = {};
    for (const file of new Set(Object.values(table).flatMap(p => [p.file, ...Object.values(p.variants || {}).map(v => v.file)])))
      images[file] = `data:image/png;base64,${(await readFile(resolve(root, 'assets/heroes', hero, file))).toString('base64')}`;
    const measured = await page.evaluate(async ({ table, images, cases, radius, alphaCutoff, deepLimit }) => {
      const decoded = {};
      for (const [name, src] of Object.entries(images)) {
        const img = new Image(); img.src = src; await img.decode(); decoded[name] = img;
        const listed = Object.values(table).flatMap(p => [p, ...Object.values(p.variants || {})]).find(p => p.file === name);
        if (img.naturalWidth !== listed.w)
          throw Error(`${name}: image dimensions differ from production manifest`);
      }
      const scale = 2, side = radius * 2 * scale + 1, mid = radius * scale;
      const canvases = [document.createElement('canvas'), document.createElement('canvas')];
      for (const canvas of canvases) { canvas.width = side; canvas.height = side; }
      const contexts = canvases.map(c => c.getContext('2d', { willReadFrequently: true }));
      function maskFor(part, matrix, partScale, center, facing, index) {
        const ctx = contexts[index], canvas = canvases[index];
        ctx.clearRect(0, 0, side, side);
        ctx.save();
        ctx.setTransform(scale * (facing === 'left' ? -1 : 1), 0, 0, scale, mid, mid);
        ctx.translate(-center[0], -center[1]);
        ctx.transform(...matrix); ctx.scale(...partScale);
        ctx.drawImage(decoded[part.file], -part.px, -part.py);
        ctx.restore();
        const rgba = ctx.getImageData(0, 0, side, side).data;
        const points = [];
        const mask = new Uint8Array(side * side);
        for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
          if ((x - mid) ** 2 + (y - mid) ** 2 > mid ** 2) continue;
          const i = y * side + x;
          if (rgba[i * 4 + 3] >= alphaCutoff) { mask[i] = 1; points.push([x, y]); }
        }
        return { points, mask };
      }
      // Positive control: moving an actual child sprite far from its parent
      // must produce no solid child pixels in this joint window. This guards
      // against a vacuous "no gaps" result from matrix/pixel plumbing errors.
      const probe = cases[0];
      const displaced = probe.cm.slice(); displaced[4] += 4 * radius;
      if (maskFor(probe.cpart, displaced, probe.cs, probe.center, probe.facing, 1).points.length)
        throw Error(`${probe.hero}: displaced child remained inside the alpha joint window`);
      const out = [];
      for (const c of cases) {
        const a = maskFor(c.ppart, c.pm, c.ps, c.center, c.facing, 0);
        const b = maskFor(c.cpart, c.cm, c.cs, c.center, c.facing, 1);
        let gap = Infinity, common = 0, maxDepth = 0;
        // Minimum distance between *solid pixels* (subtract one pixel's width).
        // This distinguishes touching boundaries from a one-pixel clear seam.
        if (a.points.some(([x, y]) => b.mask[y * side + x])) gap = 0;
        else for (const [x, y] of a.points) for (const [u, v] of b.points) {
          const d = Math.hypot(x - u, y - v);
          if (d < gap) gap = d;
        }
        gap = a.points.length && b.points.length ? Math.max(0, (gap - 1) / scale) : Infinity;
        // A deep overlap has a pixel buried in BOTH silhouettes. Merely sharing
        // several pixels along an edge is not classified as a deep penetration.
        // Two-pass 8-neighbour Euclidean chamfer distance to the boundary of
        // the actual intersection. Unlike a fixed-radius probe this reports
        // degrees of penetration beyond the failure threshold as well.
        const distance = new Float32Array(side * side);
        for (let i = 0; i < distance.length; i++) {
          if (a.mask[i] && b.mask[i]) { distance[i] = side; common++; }
        }
        const diagonal = Math.SQRT2;
        for (let y = 1; y < side; y++) for (let x = 1; x < side - 1; x++) {
          const i = y * side + x; if (!distance[i]) continue;
          distance[i] = Math.min(distance[i], distance[i - 1] + 1,
            distance[i - side] + 1, distance[i - side - 1] + diagonal,
            distance[i - side + 1] + diagonal);
        }
        for (let y = side - 2; y >= 0; y--) for (let x = side - 2; x >= 1; x--) {
          const i = y * side + x; if (!distance[i]) continue;
          distance[i] = Math.min(distance[i], distance[i + 1] + 1,
            distance[i + side] + 1, distance[i + side - 1] + diagonal,
            distance[i + side + 1] + diagonal);
          maxDepth = Math.max(maxDepth, distance[i] / scale);
        }
        out.push({ ...c, gap: Number.isFinite(gap) ? Math.round(gap * 100) / 100 : null,
          depth: Math.round(maxDepth * 100) / 100, sharedPixels: common, opaquePixels: [a.points.length, b.points.length],
          // Diagnostic image: parent red, child cyan, intersection white.
          crop: gap > 1 || maxDepth > deepLimit ? (() => {
            const canvas = document.createElement('canvas'); canvas.width = side; canvas.height = side;
            const ctx = canvas.getContext('2d'), data = ctx.createImageData(side, side);
            for (let i = 0; i < side * side; i++) {
              const p = a.mask[i], q = b.mask[i]; if (!p && !q) continue;
              data.data.set([p ? 255 : 0, p && q ? 255 : 0, q ? 255 : 0, 255], i * 4);
            }
            ctx.putImageData(data, 0, 0);
            ctx.fillStyle = '#ffff00'; ctx.fillRect(mid - 1, mid - 1, 3, 3);
            return canvas.toDataURL('image/png').split(',')[1];
          })() : null });
      }
      return out;
    }, { table, images, cases: cases.filter(c => c.hero === hero), radius, alphaCutoff, deepLimit });
    results.push(...measured);
    console.log(`${hero}: ${measured.length} alpha joints sampled`);
  }
  const gaps = results.filter(c => c.gap === null || c.gap > gapLimit);
  const overlaps = results.filter(c => c.depth > deepLimit);
  // Deep intersections alone are expected where the art deliberately tucks a
  // limb beneath the torso/skirt. Retain every raw >6px finding, and separately
  // identify poses whose burial INCREASES relative to that hero's neutral art.
  const idleDepth = new Map(results.filter(c => c.pose === `${c.hero}_idleA`)
    .map(c => [`${c.hero}/${c.facing}/${c.joint}`, c.depth]));
  for (const c of overlaps) c.excessOverIdle = Math.round((c.depth - idleDepth.get(`${c.hero}/${c.facing}/${c.joint}`)) * 100) / 100;
  const unusualOverlaps = overlaps.filter(c => c.excessOverIdle > excessLimit);
  await mkdir(output, { recursive: true });
  for (const name of await readdir(output)) if (/^\d{3}-.*\.png$/.test(name)) await unlink(resolve(output, name));
  const representatives = [...new Set(overlaps.map(c => c.hero))].map(hero =>
    overlaps.filter(c => c.hero === hero).sort((a, b) => b.depth - a.depth)[0]);
  // Favor disconnections and changing seams over thousands of stable, intentional
  // overlaps, then include one high-overlap sample from EACH hero.
  for (const [i, item] of [...new Set([...gaps, ...unusualOverlaps, ...representatives, ...overlaps])].entries()) {
    if (i >= 60) break;
    const file = `${String(i + 1).padStart(3, '0')}-${item.hero}-${item.pose}-${item.facing}-${item.joint}.png`;
    await writeFile(resolve(output, file), Buffer.from(item.crop, 'base64'));
    item.cropFile = file;
  }
  await writeFile(resolve(output, 'report.json'), JSON.stringify({ settings: { radius, alphaCutoff, gapLimit, deepLimit, excessLimit },
    samples: results.length, gaps: gaps.map(({ crop, ...rest }) => rest),
    unusualOverlaps: unusualOverlaps.map(({ crop, ...rest }) => rest),
    overlaps: overlaps.map(({ crop, ...rest }) => rest) }, null, 2));
  const display = (label, list) => {
    console.log(`${label}: ${list.length}`);
    for (const c of list.slice(0, 25)) console.log(`  ${c.hero} ${c.pose} ${c.facing} ${c.joint}: gap=${c.gap ?? 'no opaque pixel'}px overlap-depth=${c.depth}px shared=${c.sharedPixels} crop=${c.cropFile || 'see report'}`);
    if (list.length > 25) console.log(`  … ${list.length - 25} more in ${output}/report.json`);
  };
  display('DISCONNECTION (>1px)', gaps);
  display('UNUSUAL OVERLAP (>6px AND >2px deeper than own idle)', unusualOverlaps);
  display('RAW DEEP OVERLAP (>6px, includes intended joint occlusion)', overlaps);
  console.log('NOTE: zero pairwise alpha gaps does not rule out every visible contour seam; raw overlap includes intentional torso/skirt layering.');
  console.log(`${results.length} actual-alpha joint samples; report and diagnostic crops: ${output}`);
  // Raw overlap is a diagnostic, not proof of a visible seam defect. Keep the
  // original strict audit available explicitly; do not delete or hide findings.
  if (gaps.length || (process.argv.includes('--strict-overlap') && overlaps.length)) process.exitCode = 1;
} finally { await browser.close(); }
