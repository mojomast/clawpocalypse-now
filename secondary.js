// Secondary motion for v2 hero rigs: damped angular springs (hair locks, jacket hem tails)
// and a Verlet rope (Nous Girl's audio cable). Pure functions plus a small per-actor state
// store; rig.js calls them after the body is solved. No build step, no globals.
//
// Space: "rig space" is the right-facing rig before the caller's flip/scale. Dynamics run in an
// inertial frame I = [sign * screenX / scale, screenY / scale] so walking, running, jumping and
// knock-backs swing the hair/cable, while the per-actor facing flip mirrors the state instead of
// snapping it. A fixed 1/120 s substep keeps 30, 60 and 144 Hz drawings consistent; dt = 0
// (hit-stop, pause) freezes everything.
const H = 1 / 120;
const RAD = Math.PI / 180;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

export const SPRING_DEFAULT = { k: 150, c: 13, gain: 0.12, range: [-70, 70], bias: 0 };

// Where a spring segment hangs with no motion: straight down in the world (plus bias),
// limited by its range relative to the parent part.
export function restWorld(spec, parentDeg) {
  const [lo, hi] = spec.range || SPRING_DEFAULT.range;
  return parentDeg + clamp((spec.bias || 0) - parentDeg, lo, hi);
}

// Rope at rest: hangs from `start` in `n` links of `len`, then lies along the floor behind.
export function restRope(start, n, len, floorY) {
  const pts = [start.slice()];
  let [x, y] = start;
  for (let i = 0; i < n; i++) {
    if (y + len <= floorY - 1) y += len;
    else { const drop = Math.max(0, floorY - 1 - y); y += drop; x -= Math.sqrt(Math.max(0, len * len - drop * drop)); }
    pts.push([x, y]);
  }
  return pts;
}

export function createSecondary() {
  const actors = new Map();
  function state(key) {
    let s = actors.get(key);
    if (!s) { s = { springs: {}, ropes: {}, acc: 0, sign: null, variants: {} }; actors.set(key, s); }
    return s;
  }
  // inputs: springs { slot: { parentDeg, attach:[x,y] (rig space), spec } }
  //         ropes   { slot: { start:[x,y], n, len, floorY, lash: null | points[] , k } }
  //         view    { x, y, flip, scale, dt }
  // returns { springs: { slot: worldDeg }, ropes: { slot: points (rig space) } }
  function step(key, inputs, view) {
    const s = state(key), sign = view.flip ? -1 : 1, sc = view.scale || 1;
    const toI = p => [sign * view.x / sc + p[0], view.y / sc + p[1]];
    const fromI = p => [p[0] - sign * view.x / sc, p[1] - view.y / sc];
    if (s.sign !== null && s.sign !== sign) {
      // facing flipped: mirror the remembered state so hair keeps its screen direction
      for (const sp of Object.values(s.springs)) { sp.phi = -sp.phi; sp.omega = -sp.omega; sp.q = null; sp.v = null; }
      for (const r of Object.values(s.ropes)) r.pts = null;
    }
    s.sign = sign;
    const dt = Math.max(0, Math.min(0.1, view.dt ?? 1 / 60));
    s.acc += dt;
    let steps = 0;
    while (s.acc >= H - 1e-9 && steps < 24) { s.acc -= H; steps++; }
    if (steps >= 24) s.acc = 0;
    const out = { springs: {}, ropes: {} };
    for (const [slot, inp] of Object.entries(inputs.springs || {})) {
      const spec = { ...SPRING_DEFAULT, ...inp.spec };
      const [lo, hi] = spec.range;
      let sp = s.springs[slot];
      const q = toI(inp.attach);
      if (!sp) sp = s.springs[slot] = { phi: restWorld(spec, inp.parentDeg) * RAD, omega: 0, q, v: [0, 0] };
      if (dt > 0) {
        const v = sp.q ? [(q[0] - sp.q[0]) / dt, (q[1] - sp.q[1]) / dt] : [0, 0];
        let a = sp.v ? [(v[0] - sp.v[0]) / dt, (v[1] - sp.v[1]) / dt] : [0, 0];
        if (!sp.q || Math.hypot(q[0] - sp.q[0], q[1] - sp.q[1]) > 120) a = [0, 0]; // teleport/respawn
        const am = Math.hypot(a[0], a[1]), cap = 6000;
        if (am > cap) a = [a[0] * cap / am, a[1] * cap / am];
        const r = Math.max(4, (spec.length || 20) / 2), target = (spec.bias || 0) * RAD;
        for (let i = 0; i < steps; i++) {
          const t = [-Math.cos(sp.phi), -Math.sin(sp.phi)];
          const alpha = -spec.k * (sp.phi - target) - spec.c * sp.omega - spec.gain * (a[0] * t[0] + a[1] * t[1]) / r;
          sp.omega += alpha * H; sp.phi += sp.omega * H;
          const rel = sp.phi / RAD - inp.parentDeg;
          if (rel < lo || rel > hi) { sp.phi = (inp.parentDeg + clamp(rel, lo, hi)) * RAD; sp.omega *= -0.2; }
        }
        sp.q = q; sp.v = v;
      }
      const rel = sp.phi / RAD - inp.parentDeg;
      out.springs[slot] = inp.parentDeg + clamp(rel, lo, hi);
    }
    for (const [slot, inp] of Object.entries(inputs.ropes || {})) {
      let r = s.ropes[slot];
      const start = toI(inp.start), floor = view.y / sc + inp.floorY;
      if (!r || !r.pts || r.pts.length !== inp.n + 1 || Math.hypot(start[0] - r.pts[0][0], start[1] - r.pts[0][1]) > 160) {
        const rest = restRope(inp.start, inp.n, inp.len, inp.floorY).map(toI);
        r = s.ropes[slot] = { pts: rest, prev: rest.map(p => p.slice()) };
      }
      if (dt > 0) {
        const lashI = inp.lash ? inp.lash.map(toI) : null, k = inp.k || 0;
        for (let i = 0; i < steps; i++) {
          r.pts[0] = start.slice(); r.prev[0] = start.slice();
          for (let j = 1; j < r.pts.length; j++) {
            const p = r.pts[j], o = r.prev[j];
            const vx = (p[0] - o[0]) * 0.985, vy = (p[1] - o[1]) * 0.985;
            r.prev[j] = p.slice();
            p[0] += vx; p[1] += vy + 900 * H * H;
            if (lashI) { p[0] += (lashI[j][0] - p[0]) * k * 0.35; p[1] += (lashI[j][1] - p[1]) * k * 0.35; }
          }
          const len = lashI ? inp.len + (inp.lashLen / inp.n - inp.len) * k : inp.len;
          for (let it = 0; it < 6; it++) {
            for (let j = 1; j < r.pts.length; j++) {
              const a = r.pts[j - 1], b = r.pts[j];
              const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1e-6, e = (d - len) / d;
              if (j === 1) { b[0] -= dx * e; b[1] -= dy * e; }
              else { a[0] += dx * e * 0.5; a[1] += dy * e * 0.5; b[0] -= dx * e * 0.5; b[1] -= dy * e * 0.5; }
            }
            for (let j = 1; j < r.pts.length; j++) if (r.pts[j][1] > floor - 1) r.pts[j][1] = floor - 1;
          }
        }
      }
      // frames shorter than a substep still see the current root and floor
      r.pts[0] = start.slice();
      for (let j = 1; j < r.pts.length; j++) if (r.pts[j][1] > floor - 1) r.pts[j][1] = floor - 1;
      out.ropes[slot] = r.pts.map(fromI);
    }
    return out;
  }
  return { step, forget: key => actors.delete(key), state, actors };
}
