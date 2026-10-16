// Checks for the v2 hero rigs (Teknium, Nous Girl, TurboFit): separate feet and hands, grip
// pairs, two-hand grips, pose variants and secondary motion. AUDIT.md section 4.2, items 1-9.
// Run: node tests/check-hero-v2.mjs (no browser, no build step, no npm dependencies).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import '../don.js';
import { HERO_RIGS } from '../hero-rigs.js';
import { HERO_SUPPORT } from '../hero-support.js';
import { POSES, HERO_MOVES, MECHANICS, FOOT_Y, WRIST, HOLD, V2, solve, apply, createRig,
  heroSecondary, secondaryInputs } from '../rig.js';
import { createSecondary } from '../secondary.js';

const heroes = ['teknium', 'nous_girl', 'turbofit'];
assert.deepEqual(Object.keys(V2).sort(), [...heroes].sort(), 'exactly these heroes use the v2 rig');
const deg = m => Math.atan2(m[1], m[0]) * 180 / Math.PI;
const wrap = a => ((a + 180) % 360 + 360) % 360 - 180;
const states = ['idle', 'idleA', 'idleB', 'idleC', 'walk1', 'walk2', 'walk3', 'walk4', 'run1', 'run2', 'run3', 'run4',
  'turn', 'jump', 'taunt', 'victory', 'flinch', 'stagger', 'knockdownAir', 'down', 'downB', 'wake', 'grabHold', 'grabbed'];
// Include authored aliases too: the old move-list-only inventory missed the
// playable second TurboFit chain hit (axeB) and presentation-specific actions.
const reachable = h => [...new Set([...Object.keys(POSES).filter(p => p.startsWith(h + '_')),
  ...[...states, ...[...Object.keys(HERO_MOVES[h] || {}), ...MECHANICS]
    .flatMap(m => ['wind', 'active', 'recover', 'follow'].map(p => `${m}_${p}`))].map(p => `${h}_${p}`)])].filter(p => POSES[p]);
const stats = {};

for (const h of heroes) {
  const T = HERO_RIGS[h], st = stats[h] = { poses: 0, planted: 0, maxTilt: 0, twoHand: 0, maxWeaponY: -Infinity, toeOff: 0 };
  for (const p of reachable(h)) for (const flip of [false, true]) {
    const label = `${h} ${p} ${flip ? 'left' : 'right'}`;
    const s = solve(h, POSES[p], { poseName: p, animated: true });
    st.poses++;
    // 1. flat sole: a planted foot's heel->toe line is level (toe-off frames pivot on the toe)
    for (const side of s.contacts) {
      const n = side === 'front' ? 'foot' : 'foot_b', f = T[n];
      const heel = apply(s.M[n], f.sole[0] - f.px, f.sole[1] - f.py), toe = apply(s.M[n], f.sole[2] - f.px, f.sole[3] - f.py);
      assert.ok(!s.ground[side]?.toeOff, `${label}: a grounded support must not fall back to its toe`);
      const tilt = Math.abs(wrap(Math.atan2(toe[1] - heel[1], toe[0] - heel[0]) * 180 / Math.PI));
      assert.ok(tilt <= 5, `${label}: planted ${n} tilted ${tilt.toFixed(1)} deg`);
      st.maxTilt = Math.max(st.maxTilt, tilt); st.planted++;
    }
    // every foot stays out of the floor
    for (const n of ['foot', 'foot_b']) {
      const f = T[n];
      for (const [u, v] of HERO_SUPPORT[h].foot) assert.ok(apply(s.M[n], u - f.px, v - f.py)[1] <= FOOT_Y + 1, `${label}: ${n} through the floor`);
    }
    // 2. weapon above the floor (alpha hull, 2 px tolerance)
    let wy = -Infinity;
    for (const [u, v] of HERO_SUPPORT[h].weapon) wy = Math.max(wy, apply(s.M.weapon, u - T.weapon.px, v - T.weapon.py)[1]);
    assert.ok(wy <= FOOT_Y + 2, `${label}: weapon ${wy.toFixed(1)} below the floor`);
    st.maxWeaponY = Math.max(st.maxWeaponY, wy);
    // wrist limits: the gripping hand stays in its window; free hands within +/-70 deg
    const wristRel = wrap(deg(s.M.hand) - deg(s.M.farm) + HOLD[h]);
    assert.ok(Math.abs(wrap(wristRel - WRIST[h].c)) <= WRIST[h].hw + 1e-6, `${label}: wrist ${wristRel.toFixed(1)} outside c=${WRIST[h].c} hw=${WRIST[h].hw}`);
    if (!s.twoHand) assert.ok(Math.abs(wrap(deg(s.M.hand_b) - deg(s.M.farm_b))) <= 70, `${label}: free hand bent past 70 deg`);
    // 3. grip coincidence and layer order
    const hand = T.hand, w = T.weapon;
    const gp = apply(s.M.hand, hand.grip[0] - hand.px, hand.grip[1] - hand.py), wp = apply(s.M.weapon, 0, 0);
    assert.ok(Math.hypot(gp[0] - wp[0], gp[1] - wp[1]) <= 1, `${label}: weapon grip off the hand's grip point`);
    const rodDir = deg(s.M.hand) + (hand.axis || 0), tipDir = deg(s.M.weapon) + Math.atan2(w.tip[1] - w.py, w.tip[0] - w.px) * 180 / Math.PI;
    assert.ok(Math.abs(wrap(rodDir - tipDir)) <= 1, `${label}: weapon not along the grip rod`);
    const o = s.order, i = n => o.indexOf(n);
    assert.ok(i('hand') < i('weapon') && i('weapon') < i('hand_front'), `${label}: grip_back < weapon < grip_front`);
    assert.ok(s.M.hand_front.every((v, k) => Math.abs(v - s.M.hand[k]) < 1e-9), `${label}: grip_front not registered on grip_back`);
    // 4. two-hand grip
    if (s.twoHand) {
      st.twoHand++;
      const far = s.parts.hand_b;
      assert.equal(s.variants.hand_b, 'grip_far', `${label}: two-hand without the far grip hand`);
      const fp = apply(s.M.hand_b, far.grip[0] - far.px, far.grip[1] - far.py), g2 = apply(s.M.weapon, w.grip2[0] - w.px, w.grip2[1] - w.py);
      assert.ok(Math.hypot(fp[0] - g2[0], fp[1] - g2[1]) <= 2, `${label}: far hand ${Math.hypot(fp[0] - g2[0], fp[1] - g2[1]).toFixed(2)}px off grip2`);
      const sh = [s.M.uarm_b[4], s.M.uarm_b[5]], wr = [s.M.hand_b[4], s.M.hand_b[5]];
      const reach = Math.hypot(T.farm_b.ax - T.uarm_b.px, T.farm_b.ay - T.uarm_b.py) + Math.hypot(T.hand_b.ax - T.farm_b.px, T.hand_b.ay - T.farm_b.py);
      assert.ok(Math.hypot(wr[0] - sh[0], wr[1] - sh[1]) <= 0.98 * reach + 1e-6, `${label}: far arm overstretched`);
      assert.ok(i('farm_b') > i('torso') && (o.includes('hand_front_b') ? i('hand_b') < i('weapon') && i('weapon') < i('hand_front_b') : i('hand_b') > i('weapon')), `${label}: two-hand layer order`);
    }
    // 5a. variants register on the default part's pivot (same slot origin, sane pivot)
    for (const [slot, v] of Object.entries(s.variants)) {
      const part = s.parts[slot], base = T[slot];
      assert.equal(part.file, base.variants[v].file, `${label}: ${slot}@${v} file`);
      assert.ok(part.px >= 0 && part.px <= part.w && part.py >= 0 && part.py <= part.h, `${label}: ${slot}@${v} pivot outside its art`);
      if (slot === 'head' || slot === 'torso') assert.ok(Math.abs((part.h - part.py) - (base.h - base.py)) <= 1, `${label}: ${slot}@${v} pivot height differs from default`);
    }
    if (/_(turn|taunt|victory)$/.test(p)) assert.equal(s.variants.head, 'front', `${label}: front head variant`);
  }
  if (h === 'turbofit') assert.ok(st.twoHand >= 20, `turbofit: two-hand grips only in ${st.twoHand} frames`);
  else assert.equal(st.twoHand, 0, `${h}: unexpected two-hand grip`);
}
console.log('v2 pose checks OK:', heroes.map(h => `${h} ${stats[h].poses} frames, ${stats[h].planted} flat planted feet (max tilt ${stats[h].maxTilt.toFixed(2)} deg, ${stats[h].toeOff} toe-offs), lowest weapon y ${stats[h].maxWeaponY.toFixed(1)}, ${stats[h].twoHand} two-hand`).join('; '));

// 5b. variant hysteresis through the production draw path at 30/60/144 Hz: a pose that flips
// between turn and idle every frame must not swap the head art more than once per 50 ms.
{
  const originalImage = globalThis.Image;
  globalThis.Image = class { set src(p) { this.path = p; this.onload?.(); } };
  try {
    const rig = createRig();
    for (const h of heroes) for (const hz of [30, 60, 144]) {
      const files = [], ctx = { filter: 'none', globalAlpha: 1, save() {}, restore() {}, translate() {}, scale() {}, rotate() {}, transform() {},
        drawImage(img) { if (/_head(_front)?\.png$/.test(img.path)) files.push(img.path); } };
      const actor = `${h}:hysteresis${hz}`, dt = 1 / hz, swaps = [];
      for (let f = 0; f < hz; f++) {
        const name = f % 2 ? `${h}_turn` : `${h}_idleA`;
        rig.draw(ctx, h, { ...POSES[name], __pose: name, __actor: actor, __dt: dt }, 100, 100, false, 0.7, null, dt);
        if (files.length > 1 && files.at(-1) !== files.at(-2)) swaps.push(f * dt);
      }
      for (let k = 1; k < swaps.length; k++) assert.ok(swaps[k] - swaps[k - 1] >= 0.05 - 1e-9, `${h} ${hz}Hz: head variant swapped twice within 50 ms`);
      heroSecondary.forget(actor);
    }
  } finally { globalThis.Image = originalImage; }
  console.log('variant hysteresis OK: head swaps >= 50 ms apart at 30/60/144 Hz');
}

// 6. mirror asymmetry: parts flagged asymmetric in SLICE.json need a _mirror part; none of the
// v2 parts carries one-sided markings (TurboFit's band is worn on both wrists in the design).
for (const h of heroes) {
  const spec = JSON.parse(readFileSync(new URL(`../assets/heroes/${h}/src/SLICE.json`, import.meta.url)));
  for (const [name, p] of Object.entries(spec.parts)) if (p.asymmetric) assert.ok(spec.parts[`${name}_mirror`], `${h}: ${name} is asymmetric without ${name}_mirror`);
}
console.log('mirror flags OK');

// 7. secondary-chain stability: the same motion replayed at 30, 60 and 144 Hz
{
  const sample = (h, t) => {
    const name = `${h}_${['walk1', 'walk2', 'walk3', 'walk4'][Math.floor(t * 8) % 4]}`;
    const sol = solve(h, POSES[name], { poseName: name, animated: true });
    return { sol, x: 200 + 260 * Math.min(t, 1.2) + (t > 1.2 ? 0 : 0), y: 300 - (t > 0.6 && t < 0.9 ? 60 * Math.sin((t - 0.6) / 0.3 * Math.PI) : 0) };
  };
  for (const h of heroes) {
    const finals = [];
    for (const hz of [30, 60, 144]) {
      const sec = createSecondary(); let out;
      const frames = Math.round(2 * hz);
      for (let f = 1; f <= frames; f++) {
        const t = f / hz, { sol, x, y } = sample(h, Math.min(t, 1.5));
        out = sec.step('a', secondaryInputs(h, sol), { x, y, flip: false, scale: 0.7, dt: 1 / hz });
        for (const [slot, a] of Object.entries(out.springs)) {
          assert.ok(Number.isFinite(a), `${h} ${hz}Hz: ${slot} NaN`);
          const parentDeg = secondaryInputs(h, sol).springs[slot].parentDeg, [lo, hi] = HERO_RIGS[h][slot].range;
          assert.ok(a - parentDeg >= lo - 1e-6 && a - parentDeg <= hi + 1e-6, `${h} ${hz}Hz: ${slot} beyond its range`);
        }
        for (const pts of Object.values(out.ropes)) for (const p of pts) assert.ok(Number.isFinite(p[0]) && p[1] <= FOOT_Y, `${h} ${hz}Hz: rope NaN or under the floor`);
      }
      // hit-stop: dt = 0 freezes the chain exactly
      const { sol } = sample(h, 1.5);
      const frozen = sec.step('a', secondaryInputs(h, sol), { x: 590, y: 300, flip: false, scale: 0.7, dt: 0 });
      assert.deepEqual(frozen.springs, out.springs, `${h}: hit-stop moved a spring`);
      finals.push(out);
    }
    for (const slot of Object.keys(finals[0].springs)) {
      const v = finals.map(f => f.springs[slot]);
      assert.ok(Math.max(...v) - Math.min(...v) <= 3, `${h}: ${slot} differs by ${(Math.max(...v) - Math.min(...v)).toFixed(2)} deg across 30/60/144 Hz`);
    }
  }
  console.log('secondary chains OK: 30/60/144 Hz agree within 3 deg, ranges held, no NaN, frozen at dt=0');
}

// 8. proportions (rig px, idle): head with hair / height, shoulder->fist / torso, hip->sole / torso
for (const h of heroes) {
  const T = HERO_RIGS[h], s = solve(h, POSES[`${h}_idleA`], { poseName: `${h}_idleA`, animated: true });
  let top = Infinity, chin = -Infinity;
  for (const n of ['head', 'hair_front']) if (T[n]) for (const [u, v] of HERO_SUPPORT[h][n]) {
    const y = apply(s.M[n], u - T[n].px, v - T[n].py)[1]; top = Math.min(top, y); if (n === 'head') chin = Math.max(chin, y);
  }
  const len = (p, j) => Math.hypot(j[0] - p.px, j[1] - p.py);
  const H = FOOT_Y - top, head = (chin - top) / H;
  const arm = (len(T.uarm, T.uarm.joint) + len(T.farm, T.farm.joint) + T.hand.h - T.hand.py) / T.torso.h;
  const leg = (len(T.thigh, T.thigh.joint) + len(T.shin, T.shin.joint) + T.foot.sole[1] - T.foot.py) / T.torso.h;
  assert.ok(head >= 0.24 && head <= (h === 'turbofit' ? 0.28 : 0.29), `${h}: head/height ${head.toFixed(3)}`);
  assert.ok(arm >= 1.25 && arm <= 1.5, `${h}: arm/torso ${arm.toFixed(3)}`);
  assert.ok(leg >= 1.25 && leg <= 1.45, `${h}: leg/torso ${leg.toFixed(3)}`);
  console.log(`proportions OK: ${h} height ${H.toFixed(1)} px, head ${head.toFixed(3)}, arm ${arm.toFixed(3)}, leg ${leg.toFixed(3)}`);
}

// 9. alpha edges and magenta spill in every v2 PNG (8-bit RGBA, decoded here without deps)
function decodePNG(buf) {
  let o = 8, w, h, ct, idat = [];
  while (o < buf.length) {
    const n = buf.readUInt32BE(o), type = buf.toString('ascii', o + 4, o + 8), d = buf.subarray(o + 8, o + 8 + n);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9]; assert.equal(d[8], 8, 'bit depth'); assert.equal(d[12], 0, 'interlace'); }
    if (type === 'IDAT') idat.push(d);
    o += 12 + n;
  }
  assert.equal(ct, 6, 'v2 parts are RGBA');
  const raw = inflateSync(Buffer.concat(idat)), bpp = 4, stride = w * bpp, out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0, b = y ? out[(y - 1) * stride + x] : 0, c = x >= bpp && y ? out[(y - 1) * stride + x - bpp] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f];
      out[y * stride + x] = (line[x] + pred) & 255;
    }
  }
  return { w, h, data: out };
}
let pngs = 0;
for (const h of heroes) {
  const files = new Set(Object.values(HERO_RIGS[h]).flatMap(p => [p.file, ...Object.values(p.variants || {}).map(v => v.file)]));
  for (const file of files) {
    const { w, h: hh, data } = decodePNG(readFileSync(new URL(`../assets/heroes/${h}/${file}`, import.meta.url)));
    let visible = 0, partial = 0, magenta = 0;
    for (let k = 0; k < w * hh; k++) {
      const [r, g, b, a] = data.subarray(k * 4, k * 4 + 4);
      if (!a) continue; visible++; if (a < 255) partial++;
      if (r > 150 && b > 150 && g < 80) magenta++;
    }
    assert.equal(magenta, 0, `${h}/${file}: ${magenta} magenta fringe pixels`);
    assert.ok(partial / visible >= 0.02, `${h}/${file}: hard 1-bit alpha edge`);
    pngs++;
  }
}
console.log(`alpha/magenta OK: ${pngs} v2 PNGs have antialiased edges and no magenta spill`);
