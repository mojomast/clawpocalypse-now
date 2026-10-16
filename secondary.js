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

// Authored slack equilibrium: the cable drops from the fist and trails back in an open
// whip hook (free jack behind the hand), never closing into a ring beside the fist and
// never a taut plumb line to the floor.
export function restRope(start, n, len, floorY) {
  const pts = [start.slice()];
  let [x, y] = start;
  for (let i = 0; i < n; i++) {
    const a = (8 - 118 * Math.pow(i / Math.max(1, n - 1), 1.25)) * RAD;
    x += Math.sin(a) * len;
    y = Math.min(Math.max(start[1], floorY - 1), y + Math.cos(a) * len);
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
  //         ropes   { slot: { start:[x,y], n, len, floorY, lash: null | points[], k,
    //                          contact?: boolean, forwardMax?: rig-space X, padding, segmentPadding } }
  //         view    { x, y, flip, scale, dt, commitContact?: boolean }
  // Explicit commitContact permits only the contact rope transaction at zero dt.
  // returns { springs: { slot: worldDeg }, ropes: { slot: points (rig space) } }
  function step(key, inputs, view) {
    const s = state(key), sign = view.flip ? -1 : 1, sc = view.scale || 1;
    const toI = p => [sign * view.x / sc + p[0], view.y / sc + p[1]];
    const fromI = p => [p[0] - sign * view.x / sc, p[1] - view.y / sc];
    // Explicit contact-only transaction: no spring, clock, facing or variant
    // bookkeeping. Safe on a fresh actor too; spring output is read-only rest.
    if (view.dt === 0 && view.commitContact === true && Object.values(inputs.ropes || {}).some(inp => inp.contact && inp.lash)) {
      const springs = Object.values(s.ropes)[0]?.springOutput || Object.fromEntries(Object.entries(inputs.springs || {}).map(([slot, inp]) => {
        const sp = s.springs[slot], spec = { ...SPRING_DEFAULT, ...inp.spec }, [lo, hi] = spec.range;
        return [slot, sp ? inp.parentDeg + clamp(sp.phi / RAD - inp.parentDeg, lo, hi) : restWorld(spec, inp.parentDeg)];
      }));
      const ropes = {};
      for (const [slot, inp] of Object.entries(inputs.ropes || {})) {
        if (inp.contact && inp.lash && !s.ropes[slot]?.contactCommitted) {
          const pts = inp.lash.map(p => p.slice()), len = inp.len + (inp.lashLen / inp.n - inp.len) * clamp(inp.k || 0, 0, 1);
          pts[0] = inp.start.slice();
          for (let j = 1; j < pts.length; j++) {
            const a = pts[j - 1], b = pts[j];
            b[1] = Math.min(b[1], Math.max(inp.start[1], inp.floorY - 1));
            if (inp.forwardMax != null) b[0] = Math.min(b[0], inp.forwardMax - (j === pts.length - 1 ? inp.padding || 0 : inp.segmentPadding || 0));
            const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy);
            if (d > len) { b[0] = a[0] + dx * len / d; b[1] = a[1] + dy * len / d; }
          }
          const r = s.ropes[slot] ||= {};
          r.pts = pts.map(toI); r.prev = r.pts.map(p => p.slice());
          r.sign = sign; r.extension = clamp(inp.k || 0, 0, 1);
          r.forwardMax = inp.forwardMax; r.output = pts; r.springOutput = { ...springs }; r.contactCommitted = true;
        }
        if (s.ropes[slot]?.output) ropes[slot] = s.ropes[slot].output.map(p => p.slice());
      }
      return { springs: { ...springs }, ropes };
    }
    // Rope actors own a frozen output snapshot. Do this before facing, accumulator or
    // spring bookkeeping, including when a turn/root change arrives during hit-stop.
    const frozen = Object.values(s.ropes)[0];
    if (view.dt === 0 && frozen?.springOutput) return {
      springs: { ...frozen.springOutput },
      ropes: Object.fromEntries(Object.entries(s.ropes).map(([slot, r]) => [slot, r.output.map(p => p.slice())]))
    };
    if (s.sign !== null && s.sign !== sign) {
      // facing flipped: mirror the remembered state so hair keeps its screen direction
      for (const sp of Object.values(s.springs)) { sp.phi = -sp.phi; sp.omega = -sp.omega; sp.q = null; sp.v = null; }
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
      // Transform both Verlet samples: preserve screen-space position and velocity on
      // a live turn, without replacing the cable with its rest silhouette.
      if (r && r.sign !== sign && dt > 0) {
        for (const pts of [r.pts, r.prev]) for (const p of pts) p[0] = -p[0];
        r.sign = sign;
      }
      if (!r || !r.pts || r.pts.length !== inp.n + 1 || Math.hypot(start[0] - r.pts[0][0], start[1] - r.pts[0][1]) > 160) {
        const rest = restRope(inp.start, inp.n, inp.len, inp.floorY).map(toI);
        r = s.ropes[slot] = { pts: rest, prev: rest.map(p => p.slice()), sign, extension: 0 };
      }
      if (dt > 0) {
        const lashI = inp.lash ? inp.lash.map(toI) : null, k = clamp(inp.k || 0, 0, 1);
        if (inp.forwardMax != null) r.forwardMax = inp.forwardMax;
        else if (r.extension < 0.01) r.forwardMax = null;
        const forward = r.forwardMax == null ? Infinity : sign * view.x / sc + r.forwardMax;
        const slack = restRope(inp.start, inp.n, inp.len, inp.floorY).map(toI);
        const ceiling = Math.max(start[1], floor - 1);
        // A one-way final projection is a proof of the maximum-link bound: later
        // links never move earlier ones. Floor projection precedes the length cap.
        const bound = len => {
          r.pts[0] = start.slice();
          for (let j = 1; j < r.pts.length; j++) {
            const a = r.pts[j - 1], b = r.pts[j];
            b[1] = Math.min(b[1], ceiling);
            b[0] = Math.min(b[0], forward - (j === r.pts.length - 1 ? inp.padding || 0 : inp.segmentPadding || 0));
            const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy);
            if (d > len) { b[0] = a[0] + dx * len / d; b[1] = a[1] + dy * len / d; }
          }
        };
        if (inp.contact && lashI) {
          // The body has committed its contact drawing. Commit the bounded cable
          // in the same frame, even below H; damage reach must not depend on the
          // number of fixed steps since wind-up. Plain dt=0 still freezes exactly.
          r.extension = k;
          r.pts = lashI.map(p => p.slice());
          bound(inp.len + (inp.lashLen / inp.n - inp.len) * k);
          // Do not turn the wind→contact snap into a Verlet impulse on release.
          // Recovery's target forces provide follow-through from this held shape.
          r.prev = r.pts.map(p => p.slice());
          r.contactCommitted = true;
        } else r.contactCommitted = false;
        for (let i = 0; i < (inp.contact && lashI ? 0 : steps); i++) {
          r.extension += (k - r.extension) * (1 - Math.exp(-H / (k > r.extension ? 0.025 : 0.11)));
          r.pts[0] = start.slice(); r.prev[0] = start.slice();
          for (let j = 1; j < r.pts.length; j++) {
            const p = r.pts[j], o = r.prev[j];
            const vx = (p[0] - o[0]) * 0.92, vy = (p[1] - o[1]) * 0.92;
            r.prev[j] = p.slice();
            const target = lashI ? slack[j].map((v, axis) => v + (lashI[j][axis] - v) * k) : slack[j];
            p[0] += vx + (target[0] - p[0]) * 0.075;
            p[1] += vy + (target[1] - p[1]) * 0.075 + 120 * H * H * (1 - k);
          }
          const len = inp.len + (inp.lashLen / inp.n - inp.len) * r.extension;
          for (let it = 0; it < 6; it++) {
            for (let j = 1; j < r.pts.length; j++) {
              const a = r.pts[j - 1], b = r.pts[j];
              const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1e-6, e = Math.max(0, d - len) / d;
              if (j === 1) { b[0] -= dx * e; b[1] -= dy * e; }
              else { a[0] += dx * e * 0.5; a[1] += dy * e * 0.5; b[0] -= dx * e * 0.5; b[1] -= dy * e * 0.5; }
            }
            for (let j = 1; j < r.pts.length; j++) if (r.pts[j][1] > floor - 1) r.pts[j][1] = floor - 1;
          }
          bound(len);
        }
        bound(inp.len + (inp.lashLen / inp.n - inp.len) * r.extension);
      }
      out.ropes[slot] = r.pts.map(fromI);
      r.output = out.ropes[slot].map(p => p.slice());
      r.springOutput = { ...out.springs };
    }
    return out;
  }
  return { step, forget: key => actors.delete(key), state, actors };
}
