// Pure hero geometry, shared by production drawing and numerical regression tests.
// Coordinates are rig pixels, before the caller's whole-character scale and mirror.
// A limb's length is measured between its *rendered* attachment pixels, never from
// the image bounding box. In particular, the parent's effective torso scale (including
// twist) must be passed to attachPoint; its unmodified PART_SCALE is insufficient.
// Integration in rig.js solve (hero branch only, AFTER anim.step blends angles):
//   1. constrainHeroAngles(A, { airborne: !contacts.length }); leave enemies alone.
//   2. Build torso M/S with effective twist scale FIRST, then use attachPoint(M.torso,
//      S.torso, torsoPart, thighPart, [twistShoulderOrHipShift, 0]). Derive both
//      limbVectors from S.thigh/S.shin and a chosen actual sole heel/toe pixel.
//   3. Resolve contacts from poseName and A.__gait (or caller's explicit stance
//      metadata); supply optional world-locked targets converted to local rig px.
//      pass parentAngle=A.torso; plantFeet returns both thigh/shin angles and dy.
//   4. Rebuild matrices using those angles and translate all M by result.dy;
//      ignore A.dy for planted poses (it is posture, not permission to float).
//      Keep the other leg's authored angles on single-support frames. Never run
//      the old lowest-sole grounding shift on these planted matrices.
//   5. A single rigid shin/foot cannot constrain heel AND toe and remain flat
//      through arbitrary rotations. Choose the lower visible sole endpoint as
//      the contact landmark; a separate ankle would be needed for a flat foot.
// World-space X locking requires caller-held anchors (and origin/flip/scale),
// not a stateless solver. A double-contact pose can be geometrically infeasible;
// inspect residual and release the non-dominant foot rather than stretch bones.
const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const finite = (x, fallback = 0) => Number.isFinite(x) ? x : fallback;
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function transformPoint(m, x, y) {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

export function attachPoint(parentMatrix, parentScale, parent, child, shift = [0, 0]) {
  return transformPoint(parentMatrix,
    (child.ax + shift[0] - parent.px) * parentScale[0],
    (child.ay + shift[1] - parent.py) * parentScale[1]);
}

// The signed, relative joint channels: front/far elbows fold toward the body
// (negative), knees fold forward (positive). Follow-through belongs in the
// shoulder/hip, not hyperextension of an elbow or knee, even while airborne.
export const HERO_JOINT_LIMITS = Object.freeze({
  farm: [-150, 0], farm_b: [-150, 0],
  shin: [0, 145], shin_b: [0, 145],
  thigh: [-100, 85], thigh_b: [-100, 85],
});

export function constrainHeroAngles(angles, { airborne = false, limits = HERO_JOINT_LIMITS } = {}) {
  const result = { ...angles };
  for (const [joint, [min, max]] of Object.entries(limits)) {
    result[joint] = clamp(finite(result[joint]), min, max);
  }
  return result;
}

// Each segment rotates rigidly. upperVector is pivot -> lower attachment in
// upper-image pixels after its draw scale; lowerVector is lower pivot -> desired
// heel/toe contact in lower-image pixels after its draw scale. The torso matrix
// is rotation+translation; part draw scales do NOT multiply rotation matrices.
export function limbVectors(upper, lower, upperScale, lowerScale, endpoint) {
  return {
    upper: [(lower.ax - upper.px) * upperScale[0], (lower.ay - upper.py) * upperScale[1]],
    lower: [(endpoint[0] - lower.px) * lowerScale[0], (endpoint[1] - lower.py) * lowerScale[1]],
  };
}

export function limbEndpoint(root, vectors, upperAngle, jointAngle, parentAngle = 0) {
  const a = (finite(parentAngle) + finite(upperAngle)) * RAD;
  const b = (finite(parentAngle) + finite(upperAngle) + finite(jointAngle)) * RAD;
  const [u, v] = [vectors.upper, vectors.lower];
  return [root[0] + u[0] * Math.cos(a) - u[1] * Math.sin(a) + v[0] * Math.cos(b) - v[1] * Math.sin(b),
    root[1] + u[0] * Math.sin(a) + u[1] * Math.cos(a) + v[0] * Math.sin(b) + v[1] * Math.cos(b)];
}

// Analytical two-bone inverse kinematics, with constrained signed angles. The
// joint limit is applied *before* calculating the upper angle: merely clamping
// the result afterwards would produce a foot that no longer touches its target.
// Return error/reachable rather than secretly stretching a segment to an
// impossible target. A caller may lower the hips or release the swing foot.
export function solveTwoBone({ root, target, vectors, parentAngle = 0,
  upperLimits = [-100, 85], jointLimits = [0, 145], preferred = [0, 0], bendSign = 1 }) {
  const u = vectors.upper, v = vectors.lower;
  const l1 = Math.hypot(...u), l2 = Math.hypot(...v);
  if (!(l1 > 0 && l2 > 0)) throw new RangeError('two-bone segments require nonzero rendered lengths');
  const aim = [finite(target[0], root[0]), finite(target[1], root[1])];
  const dx = aim[0] - root[0], dy = aim[1] - root[1], d = Math.hypot(dx, dy);
  const alpha = Math.atan2(u[1], u[0]), beta = Math.atan2(v[1], v[0]);
  const bend = Math.acos(clamp((d * d - l1 * l1 - l2 * l2) / (2 * l1 * l2), -1, 1));
  // The displayed joint angle differs from the angle between bone vectors if
  // the shin artwork's sole is offset sideways from its knee pivot.
  const branches = [bendSign < 0 ? -1 : 1, bendSign < 0 ? 1 : -1];
  let best;
  for (const sign of branches) {
    const idealJoint = (sign * bend + alpha - beta) * DEG;
    // Equivalent angles may differ by a full turn; choose the one nearest the
    // authored knee rather than snapping during a straight-leg transition.
    const around = idealJoint + 360 * Math.round((preferred[1] - idealJoint) / 360);
    for (const joint of [around, jointLimits[0], jointLimits[1]]) {
      const j = clamp(joint, ...jointLimits);
      const phi = j * RAD + beta - alpha;
      const reach = Math.hypot(l1 + l2 * Math.cos(phi), l2 * Math.sin(phi));
      const orient = Math.atan2(l2 * Math.sin(phi), l1 + l2 * Math.cos(phi));
      const rawUpper = (Math.atan2(dy, dx) - orient - alpha) * DEG - parentAngle;
      const upper = clamp(rawUpper + 360 * Math.round((preferred[0] - rawUpper) / 360), ...upperLimits);
      const point = limbEndpoint(root, vectors, upper, j, parentAngle);
      const error = distance(point, aim);
      const score = error * error * 100 + Math.pow((j - preferred[1]) * 0.022, 2) +
        Math.pow((upper - preferred[0]) * 0.009, 2) + (sign !== branches[0] ? 0.1 : 0);
      if (!best || score < best.score) best = { upper, joint: j, point, error, score, reach };
    }
  }
  return { ...best, reachable: best.error < 0.75, lengths: [l1, l2] };
}

// Pose/contact classification is deliberately explicit and overrideable. A
// gait cycle 0..4 alternates the supporting leg by half-cycle. During a kick
// the raised near leg is never mistaken for a second planted foot. World-space
// foot locks, if desired, are supplied through targets below by the caller.
export function footContacts(poseName = '', gait = null) {
  if (/(?:^|_)(?:jump|jumpKick|down|downB|grabbed|knockdownAir|juggle|vaultKick|dodgeRoll|roll|bassDrop)(?:_|$)/i.test(poseName) ||
      /(?:^|_)(?:slide_(?:active|follow)|launcher_(?:active|recover))(?:_|$)/i.test(poseName)) return [];
  if (/(?:^|_)(?:kick|upper)(?:_|$)/i.test(poseName)) return ['back'];
  if (/(?:^|_)(?:walk|run)[1-4]$/.test(poseName) || Number.isFinite(gait)) {
    const phase = Number.isFinite(gait) ? ((gait % 4) + 4) % 4 : Math.max(0, Number(poseName.match(/[1-4]$/)?.[0] || 1) - 1);
    return [phase < 2 ? 'front' : 'back'];
  }
  return ['front', 'back'];
}

// A pure planting pass for a pair of legs. Inputs describe pivot coordinates
// at zero root translation, already transformed through the actual torso scale
// and twist. Each leg: { root:[x,y], vectors:{upper,lower}, parentAngle, upper, joint,
//   contactVectors?: [heelVector, toeVector], upperLimits?,jointLimits? }.
// contactVectors are the separately scaled knee->sole vectors; target the
// lowest visible heel/toe, not their midpoint (a midpoint can bury the toe).
// This searches a small hip drop/lift around the authored support height and
// returns the best attainable contact, never scaling bones or mutating poses.
// targets: optional WORLD rig-space x/y locked contacts for each foot, after
// translation by origin; absent targets keep the authored x while fixing y.
export function plantFeet({ front, back, groundY, contacts = ['front', 'back'], targets = {},
  rootDy = null, maxHipTravel = 30, maxFootTravel = 18 }) {
  const legs = { front, back }, planted = contacts.filter(n => legs[n]);
  if (!planted.length) return { dy: 0, front: null, back: null, contacts: [], residual: 0 };
  const authored = Object.fromEntries(Object.entries(legs).filter(([, leg]) => leg).map(([name, leg]) =>
    [name, limbEndpoint(leg.root, leg.vectors, leg.upper, leg.joint, leg.parentAngle)]));
  const support = planted[0];
  const baseline = rootDy == null ? groundY - authored[support][1] : finite(rootDy);
  let best;
  // Whole rig shifts only as far as needed to make both support legs reachable;
  // articulate the knees/hips to absorb weight transfer instead of adding A.dy.
  const evaluate = step => {
    const dy = baseline + step, results = {}, xs = {}, totalShift = Math.abs(step) * 0.18;
    let cost = totalShift;
    for (const name of planted) {
      const leg = legs[name], lock = targets[name];
      const x0 = finite(lock?.[0], authored[name][0]);
      const y0 = finite(lock?.[1], groundY);
      let choice;
      // A foot without a world lock may slide a little horizontally to reach
      // the ground. With a lock, no drift is permitted.
      const offsets = lock ? [0] : [0, -4, 4, -8, 8, -12, 12, -maxFootTravel, maxFootTravel];
      for (const offset of offsets) {
        const x = x0 + offset, root = [leg.root[0], leg.root[1] + dy];
        const contacts = leg.contactVectors || [leg.vectors.lower];
        for (let i = 0; i < contacts.length; i++) {
          const candidate = solveTwoBone({ root, target: [x, y0],
            vectors: { upper: leg.vectors.upper, lower: contacts[i] }, parentAngle: leg.parentAngle,
            upperLimits: leg.upperLimits, jointLimits: leg.jointLimits,
            preferred: [leg.upper, leg.joint] });
          const soleY = Math.max(...contacts.map(lower => limbEndpoint(root,
            { upper: leg.vectors.upper, lower }, candidate.upper, candidate.joint, leg.parentAngle)[1]));
          const error = Math.max(candidate.error, Math.abs(soleY - y0));
          const score = error * error * 300 + Math.abs(offset) * 0.35 +
            Math.abs(candidate.upper - leg.upper) * 0.012 + Math.abs(candidate.joint - leg.joint) * 0.01;
          if (!choice || score < choice.score) choice = { ...candidate, error, score, contactIndex: i, soleY, target: [x, y0] };
        }
        // A precisely reached authored X cannot be improved by moving the foot.
        if (!lock && offset === 0 && choice.error < 1e-5) break;
      }
      results[name] = choice; xs[name] = choice.target[0]; cost += choice.score;
    }
    if (!best || cost < best.cost) best = { dy, ...results, contacts: planted, residual: Math.max(...planted.map(n => results[n].error)), cost, targetX: xs };
  };
  for (let step = -maxHipTravel; step <= maxHipTravel; step += 4) evaluate(step);
  const center = Math.round((best.dy - baseline) / 4) * 4;
  for (let step = Math.max(-maxHipTravel, center - 4); step <= Math.min(maxHipTravel, center + 4); step++) {
    evaluate(step);
  }
  // During single support, an authored swing can otherwise pass THROUGH the
  // floor after the pelvis moves to plant its opposite leg. Lift only when it
  // actually penetrates; the stance leg and shared pelvis remain untouched.
  best.swingAdjusted = [];
  for (const side of ['front', 'back']) {
    if (planted.includes(side) || !legs[side]) continue;
    const leg = legs[side], root = [leg.root[0], leg.root[1] + best.dy];
    const points = leg.contactVectors || [leg.vectors.lower];
    const y = Math.max(...points.map(lower => limbEndpoint(root,
      { upper: leg.vectors.upper, lower }, leg.upper, leg.joint, leg.parentAngle)[1]));
    if (y <= groundY + 0.5) continue;
    const lifted = plantFeet({ [side]: leg, groundY: groundY - 2, contacts: [side],
      rootDy: best.dy, maxHipTravel: 0, maxFootTravel });
    if (lifted[side].error < 0.75) {
      best[side] = lifted[side];
      best.swingAdjusted.push(side);
    }
  }
  return best;
}
