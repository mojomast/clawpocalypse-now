// Geometry regression checks for every published hero pose and in-between frame.
// Run: node tests/check-rigs.mjs (no browser or build step required).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { HEROES as roster } from '../heroes.js';
import { HERO_RIGS } from '../hero-rigs.js';
import '../don.js';
import { POSES, HERO_MOVES, HEROES, SOLES, SKIRTED, AIR_POSE, FOOT_Y, WRIST,
  solve, apply, createRig } from '../rig.js';

const ids = roster.map(h => h.id);
assert.equal(ids.length, 8, 'expected the complete eight-hero roster');
assert.deepEqual([...HEROES].sort(), [...ids].sort(), 'rig registrations must match roster');
// Independently audited heel/toe pixels from the cutout art. Changing soles or
// the game-space ground line requires visual/art validation, not a silent update.
assert.equal(FOOT_Y, 90, 'game feet 63px at rig scale 0.7 must map to 90 rig px');
const expectedSoles = {
  turtle_purple: [[10, 72], [33, 72]], turtle_blue: [[13, 57], [35, 57]],
  turtle_red: [[11, 67], [33, 67]], turtle_orange: [[14, 65], [41, 65]],
  nous_girl: [[5, 60], [22, 60]], teknium: [[2, 55], [27, 55]],
  turbofit: [[3, 56], [31, 56]], don_piedro: [[5, 48], [41, 48]],
};
const near = (a, b, context, tolerance = 1) => {
  assert.ok(Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tolerance,
    `${context}: ${a} vs ${b} (limit ${tolerance})`);
};
const wrap = a => ((a + 180) % 360 + 360) % 360 - 180;
const generic = ['idle', 'idleA', 'idleB', 'idleC', 'walk1', 'walk2', 'walk3', 'walk4',
  'turn', 'jump', 'hurt', 'flinch', 'stagger', 'down', 'wake', 'taunt', 'victory'];
let cases = 0, attachments = 0, grounded = 0, weapons = 0;

for (const kind of ids) {
  const table = HERO_RIGS[kind], soles = SOLES[kind];
  assert.ok(table?.torso && table.shin && table.shin_b && soles?.length >= 2, `${kind}: missing art geometry/soles`);
  assert.deepEqual(soles, expectedSoles[kind], `${kind}: sole art anchor changed without review`);
  for (const filename of new Set(Object.values(table).map(p => p.file))) {
    const data = readFileSync(new URL(`../assets/heroes/${kind}/${filename}`, import.meta.url));
    assert.equal(data.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${kind}/${filename}: invalid PNG`);
    assert.ok(data.readUInt32BE(16) > 0 && data.readUInt32BE(20) > 0, `${kind}/${filename}: empty art`);
    let transparentPalette = false;
    for (let offset = 8; offset + 12 <= data.length;) {
      const size = data.readUInt32BE(offset), end = offset + 12 + size;
      assert.ok(end <= data.length, `${kind}/${filename}: invalid PNG chunk`);
      if (data.toString('ascii', offset + 4, offset + 8) === 'tRNS') transparentPalette = true;
      offset = end;
    }
    assert.ok([4, 6].includes(data[25]) || transparentPalette, `${kind}/${filename}: missing alpha channel`);
  }
  const named = Object.keys(POSES).filter(p => p.startsWith(`${kind}_`));
  assert.ok(named.length > 30, `${kind}: too few named poses (${named.length})`);
  for (const [move] of Object.entries(HERO_MOVES[kind] || {})) {
    for (const phase of ['wind', 'active', 'recover', 'follow'])
      assert.ok(POSES[`${kind}_${move}_${phase}`], `${kind}: ${move} missing ${phase}`);
  }
  for (const state of ['run1', 'run2', 'run3', 'run4', 'flinch']) assert.ok(POSES[`${kind}_${state}`], `${kind}: missing ${state}`);
  assert.ok(POSES.hurt && ['walk1', 'walk2', 'walk3', 'walk4'].every(w => POSES[w]), `${kind}: shared hurt/walk fallback missing`);
  const frames = [...new Set([...named, ...generic.filter(p => POSES[p])])].map(name => ({ name, angles: POSES[name] }));
  // Real-time blends need the same geometry invariants as authored keyframes.
  const transitions = [
    [`${kind}_idleA`, `${kind}_walk1`], [`${kind}_walk4`, 'hurt'],
    ['hurt', `${kind}_idleA`], [`${kind}_jump`, `${kind}_idleA`],
  ];
  for (const [move, [wind, active]] of Object.entries(HERO_MOVES[kind] || {})) {
    transitions.push([`${kind}_${move}_wind`, `${kind}_${move}_active`]);
    transitions.push([`${kind}_${move}_active`, `${kind}_${move}_recover`]);
  }
  for (const [from, to] of transitions) {
    const a = POSES[from], b = POSES[to];
    assert.ok(a && b, `${kind}: unavailable blend ${from} -> ${to}`);
    for (const fraction of [0.25, 0.5, 0.75]) {
      const angles = Object.fromEntries(new Set([...Object.keys(a), ...Object.keys(b)])
        .values().map(k => [k, (a[k] || 0) * (1 - fraction) + (b[k] || 0) * fraction]));
      frames.push({ name: to, angles });
    }
  }
  for (const { name, angles } of frames) for (const flip of [false, true]) {
    const label = `${kind} ${name} ${flip ? 'left' : 'right'}`;
    const sol = solve(kind, angles, { poseName: name, animated: true });
    for (const joint of ['farm', 'farm_b']) assert.ok(sol.angles[joint] >= -150 && sol.angles[joint] <= 0, `${label}: elbow hyperextension ${joint}`);
    for (const joint of ['shin', 'shin_b']) assert.ok(sol.angles[joint] >= 0 && sol.angles[joint] <= 145, `${label}: knee hyperextension ${joint}`);
    const drawOrder = sol.order;
    assert.equal(new Set(drawOrder).size, drawOrder.length, `${label}: duplicate layer`);
    for (const partName of ['torso', 'head', 'uarm', 'farm', 'uarm_b', 'farm_b', 'thigh', 'shin', 'thigh_b', 'shin_b'])
      assert.ok(drawOrder.includes(partName), `${label}: absent ${partName}`);
    const index = n => drawOrder.indexOf(n);
    for (const [child, p] of Object.entries(table)) {
      if (!drawOrder.includes(child) || !p.parent) continue;
      assert.ok(index(p.parent) >= 0, `${label}: parent ${p.parent} missing`);
      if ((p.back || (SKIRTED.has(kind) && child === 'thigh')) && p.parent === 'torso') assert.ok(index(child) < index('torso'), `${label}: far/skirt limb must be behind torso`);
      else if (p.parent !== 'uarm_b' && p.parent !== 'thigh_b') assert.ok(index(p.parent) < index(child), `${label}: ${child} drawn under parent ${p.parent}`);
      // The parent's attach pixel and child's pivot must coincide after scales,
      // twist, optional root displacement and facing. Deliberately calculate
      // attachment from manifest coordinates rather than child matrix.
      const parent = table[p.parent], ps = sol.S[p.parent];
      const shoulderShift = p.parent === 'torso' ? (child === 'uarm' ? 3.5 : child === 'uarm_b' ? -3 : child === 'thigh' ? 1.5 : child === 'thigh_b' ? -1.5 : child === 'head' ? 1.5 : 0) * (angles.tw || 0) : 0;
      const expected = apply(sol.M[p.parent], (p.ax + shoulderShift - parent.px) * ps[0], (p.ay - parent.py) * ps[1]);
      const actual = apply(sol.M[child], 0, 0);
      const facing = q => [flip ? -q[0] : q[0], q[1]];
      const e = facing(expected), a = facing(actual);
      near(Math.hypot(e[0] - a[0], e[1] - a[1]), 0, `${label}: ${child} detached`);
      attachments++;
    }
    if (SKIRTED.has(kind)) assert.ok(index('thigh') < index('torso') && index('shin') < index('torso'), `${label}: coat must occlude legs`);
    else assert.ok(index('torso') < index('thigh'), `${label}: near leg should cover torso`);
    if (drawOrder.includes('weapon')) {
      const weapon = table.weapon, parent = weapon.parent;
      assert.equal(index('weapon'), index(parent) + 1, `${label}: weapon must follow gripping hand`);
      const pm = sol.M[parent], wm = sol.M.weapon;
      const relative = wrap((Math.atan2(wm[1], wm[0]) - Math.atan2(pm[1], pm[0])) * 180 / Math.PI);
      const raw = (angles.weapon || 0) + (weapon.grip || 0), wrist = WRIST[kind];
      const expected = wrist ? wrist.c + wrist.hw * Math.tanh(wrap(raw - wrist.c) / wrist.hw) : raw;
      if (wrist) assert.ok(Math.abs(wrap(relative - wrist.c)) <= wrist.hw + 0.001, `${label}: impossible wrist bend`);
      near(wrap(relative - expected), 0, `${label}: weapon direction`, 0.001);
      // Independent art-axis check, not merely a repeat of wristAngle(). These
      // local vectors point handle -> blade/bowl/axe body in the source PNG.
      // Double-ended staff and flexible cable/nunchaku intentionally have no tip.
      const axes = { turtle_blue: [0, -82], teknium: [54, 0], turbofit: [-30, 70], don_piedro: [0, -98] };
      if (axes[kind]) {
        const hand = apply(pm, (weapon.ax - table[parent].px) * sol.S[parent][0], (weapon.ay - table[parent].py) * sol.S[parent][1]);
        const elbow = apply(pm, 0, 0), origin = apply(wm, 0, 0);
        const tip = apply(wm, axes[kind][0] * sol.S.weapon[0], axes[kind][1] * sol.S.weapon[1]);
        const dot = (hand[0] - elbow[0]) * (tip[0] - origin[0]) + (hand[1] - elbow[1]) * (tip[1] - origin[1]);
        assert.ok(dot >= -0.001, `${label}: weapon points backward through the gripping forearm`);
      }
      weapons++;
    } else if (kind !== 'turtle_red' && kind !== 'turtle_orange') {
      assert.fail(`${label}: weapon missing`);
    }
    // Air poses deliberately retain idle lift. Standing poses must keep at least
    // one actual heel/toe on the ground, not just position a guessed bounding box.
    if (sol.contacts.length) {
      const values = ['shin', 'shin_b'].flatMap(n => soles.map(([x, y]) => {
        const p = table[n], s = sol.S[n];
        return apply(sol.M[n], (x - p.px) * s[0], (y - p.py) * s[1])[1];
      }));
      near(Math.max(...values), FOOT_Y, `${label}: support foot floated/penetrated`, 1);
      for (const side of sol.contacts) {
        const n = side === 'front' ? 'shin' : 'shin_b', p = table[n], sc = sol.S[n];
        const ys = soles.map(([x, y]) => apply(sol.M[n], (x - p.px) * sc[0], (y - p.py) * sc[1])[1]);
        near(Math.max(...ys), FOOT_Y, `${label}: ${side} planted foot left ground`, 1);
      }
      grounded++;
    }
    cases++;
  }
}
console.log(`rig geometry OK: ${cases} frames, ${attachments} attached joints, ${weapons} weapon grips, ${grounded} grounded facings`);

// Trace the actual production draw path as well: a solve-only test cannot notice
// a regression that stops draw() applying the requested facing or stops rendering.
const originalImage = globalThis.Image;
try {
  globalThis.Image = class {
    set src(path) { this.path = path; this.onload?.(); }
  };
  const rig = createRig();
  for (const kind of ids) for (const flip of [false, true]) {
    const calls = [];
    const ctx = {
      filter: 'none', globalAlpha: 1,
      save() { calls.push(['save']); }, restore() { calls.push(['restore']); },
      translate(...v) { calls.push(['translate', ...v]); },
      scale(...v) { calls.push(['scale', ...v]); },
      transform(...v) { calls.push(['transform', ...v]); },
      drawImage(...v) { calls.push(['drawImage', ...v]); },
    };
    const pose = { ...POSES[`${kind}_idleA`], __pose: `${kind}_idleA` };
    assert.equal(rig.draw(ctx, kind, pose, 91, 108, flip, 0.85), true, `${kind}: unable to draw`);
    assert.deepEqual(calls[1], ['translate', 91, 108], `${kind}: root misplaced`);
    assert.deepEqual(calls[2], ['scale', flip ? -1 : 0.85, flip ? 1 : 0.85], `${kind}: facing/scale incorrect`);
    const drawnFiles = calls.filter(c => c[0] === 'drawImage').map(c => c[1].path);
    const expectedFiles = solve(kind, pose, { poseName: pose.__pose, animated: true }).order.map(n => `assets/heroes/${kind}/${HERO_RIGS[kind][n].file}`);
    assert.deepEqual(drawnFiles, expectedFiles, `${kind}: production art draw order differs from solved layer order`);
  }
} finally { globalThis.Image = originalImage; }
console.log('production draw OK: eight heroes × both facings');

const manifest = JSON.parse(readFileSync(new URL('../before/manifest.json', import.meta.url), 'utf8'));
assert.deepEqual(manifest.map(m => m.hero).sort(), [...ids].sort(), 'baseline hero coverage');
for (const entry of manifest) {
  const names = Object.keys(POSES).filter(name => name.startsWith(`${entry.hero}_`));
  assert.deepEqual([...entry.assets].sort(), [...new Set(Object.values(HERO_RIGS[entry.hero]).map(p => p.file))].sort(), `${entry.hero}: baseline asset coverage`);
  assert.equal(new Set(entry.poses).size, entry.poses.length, `${entry.hero}: duplicate contact sheet pose`);
  // New authored states must not require rewriting the original baseline.
  for (const name of entry.poses.filter(name => name.startsWith(`${entry.hero}_`))) assert.ok(names.includes(name), `${entry.hero}: original pose removed: ${name}`);
  assert.ok(entry.poses.includes('hurt'), `${entry.hero}: shared hurt state omitted`);
  assert.ok(entry.absent?.includes(`${entry.hero}_run`), `${entry.hero}: absent run must be reported`);
  assert.ok(entry.sharedFallbacks?.some(item => item.requested === `${entry.hero}_hurt` && item.drawn === 'hurt'), `${entry.hero}: shared hurt fallback must be explicit`);
  for (const walk of ['walk1', 'walk2', 'walk3', 'walk4'])
    assert.ok(entry.poses.includes(POSES[`${entry.hero}_${walk}`] ? `${entry.hero}_${walk}` : walk), `${entry.hero}: locomotion ${walk} omitted`);
  assert.deepEqual(entry.facings, ['right', 'left'], `${entry.hero}: baseline must capture both facings`);
  const png = readFileSync(new URL(`../before/${entry.hero}.png`, import.meta.url));
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${entry.hero}: missing PNG`);
  assert.ok(png.length > 100_000, `${entry.hero}: implausibly blank contact sheet`);
  assert.match(entry.sha256 || '', /^[a-f0-9]{64}$/, `${entry.hero}: baseline needs immutable checksum`);
  assert.equal(createHash('sha256').update(png).digest('hex'), entry.sha256, `${entry.hero}: baseline changed`);
}
console.log('baseline manifest OK: all named hero poses and both facings');
