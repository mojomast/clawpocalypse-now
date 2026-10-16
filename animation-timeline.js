// The pose table supplies drawings; this timeline supplies spacing between them.
// Keep hit timing in combat.js. In particular, never add anticipation by delaying
// the hitbox or shorten recovery to make an animation look faster.
import { POSES } from './rig.js';
import { motionFor } from './hero-motion.js';

export const BLEND = 0.1;
const KEYS = ['torso', 'head', 'uarm', 'farm', 'uarm_b', 'farm_b', 'thigh', 'shin', 'thigh_b', 'shin_b', 'weapon', 'tw', 'dx', 'dy'];
const clamp01 = t => Math.max(0, Math.min(1, t));
const easeInOut = t => t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
const easeOut = t => 1 - (1 - t) ** 3;
const easeOutBack = (t, s = 1.70158) => 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2;
const get = name => POSES[name] || POSES.idle;
const gaitKey = name => /^(.*_)?(walk|run)([1-4])$/.exec(name || '');
function mix(a, b, t) {
  const out = {};
  // Joint rotations are authored on one continuous arc. Do not wrap hinge
  // angles through 360 degrees (that turns a bent elbow inside out).
  for (const k of KEYS) out[k] = (a[k] || 0) + ((b[k] || 0) - (a[k] || 0)) * t;
  return out;
}
function target(name, info, t) {
  const gait = gaitKey(name), style = motionFor(name);
  if (gait && info.walkT != null) {
    const ph = ((info.walkT * (info.walkRate || 8)) % 4 + 4) % 4;
    const i = Math.floor(ph), u = ph - i, prefix = (gait[1] || '') + gait[2];
    const pose = mix(get(prefix + (i + 1)), get(prefix + ((i + 1) % 4 + 1)), easeInOut(u));
    // Twice-per-cycle hip drop, with shoulders counter-rotating against the hips.
    // The support solve absorbs root height; these channels do not lift the feet.
    const cycle = ph * Math.PI / 2;
    pose.torso += Math.sin(cycle) * 1.5 * style.stride;
    pose.head -= Math.sin(cycle) * 1.1 * style.stride;
    pose.tw = (pose.tw || 0) - Math.sin(cycle) * 0.12;
    return pose;
  }
  let pose = { ...get(name) };
  if (/(^|_)down(?:_b|B)?$/.test(name)) {
    const base = name.replace(/(?:_b|B)$/, '');
    pose = mix(get(base), get(base + 'B'), (1 - Math.cos(t * 1.6 + (info.seed || 0))) / 2);
  }
  if (/(^|_)idle[ABC]?$/.test(name) || info.breathe) {
    const b = Math.sin(t * 2.4 + (info.seed || 0)) * style.breath;
    const w = Math.sin(t * 1.15 + (info.seed || 0) * 0.7) * style.breath;
    pose.torso = (pose.torso || 0) + b * 0.9 + w * 0.7;
    pose.head = (pose.head || 0) - b * 0.7 - w * 0.5;
    pose.uarm = (pose.uarm || 0) + b * 1.4;
    pose.uarm_b = (pose.uarm_b || 0) + b * 1.1;
    pose.shin = (pose.shin || 0) + w * 1.8;
    pose.shin_b = (pose.shin_b || 0) - w * 1.8;
    pose.tw = (pose.tw || 0) + w * 0.06;
  }
  return pose;
}

export function createAnim() {
  const tracks = new Map();
  function step(key, name, info = {}, dt = 1 / 60, t = 0) {
    info ||= {};
    dt = Math.max(0, Math.min(0.1, dt));
    const phase = info.phase === 'recover' ? 'rec' : info.phase;
    const goal = target(name, info, t), style = motionFor(name);
    let tr = tracks.get(key);
    // Hit stop freezes the actual drawing, including secondary channels and
    // breathing; the game clock may continue while the combat clock is paused.
    if (tr && dt === 0) return tr.cur;
    if (!tr) {
      tr = { name, phase, from: { ...goal }, cur: { ...goal }, elapsed: 1, duration: BLEND, history: [] };
      tracks.set(key, tr);
    }
    const oldGait = gaitKey(tr.name), newGait = gaitKey(name);
    const sameGait = oldGait && newGait && oldGait[1] === newGait[1] && oldGait[2] === newGait[2];
    if ((name !== tr.name && !sameGait) || phase !== tr.phase) {
      tr.from = { ...tr.cur };
      tr.elapsed = 0;
      tr.history = [];
      tr.duration = style.settle;
      if (phase === 'wind') tr.duration = Math.max(1 / 60, (info.dur || 0.1) * 0.8);
      else if (phase === 'active') tr.duration = Math.max(1 / 60, Math.min(info.heavy ? 0.075 : 0.05, (info.dur || 0.08) * 0.6));
      else if (/(^|_)(flinch|grabbed|knockdownAir)$/.test(name)) tr.duration = 0.05;
      else if (/(^|_)stagger$/.test(name)) tr.duration = 0.09;
      else if (/(^|_)wake$/.test(name)) tr.duration = 0.22;
      else if (/(^|_)victory$/.test(name)) tr.duration = 0.28;
    }
    tr.name = name; tr.phase = phase; tr.elapsed += dt;
    const follow = phase === 'rec' && POSES[name.replace(/_(?:active|recover)$/, '_follow')];
    let pose;
    if (follow) {
      // One/two 60-Hz drawings held on impact, then the follow-through, then an
      // eased recovery. Each interval is explicit so a short recovery cannot
      // cancel its own follow-through or jump directly back to the guard.
      const duration = Math.max(0.05, info.dur || 0.2);
      const hold = Math.min(info.heavy ? 2 / 60 : 1 / 60, duration * 0.2);
      const followTime = (duration - hold) * 0.32;
      if (tr.elapsed <= hold) pose = mix(tr.from, tr.from, 0);
      else if (tr.elapsed < hold + followTime) pose = mix(tr.from, follow, easeOut(clamp01((tr.elapsed - hold) / followTime)));
      else pose = mix(follow, goal, easeInOut(clamp01((tr.elapsed - hold - followTime) / (duration - hold - followTime))));
    } else {
      const u = clamp01(tr.elapsed / tr.duration);
      pose = mix(tr.from, goal, phase === 'wind' || phase === 'active' ? easeOut(u) : easeInOut(u));
    }
    // Overlap stays at the neck and wrist, never by translating a detached part.
    // Calm Teknium settles quickly; hair and the heavy spoon/guitar settle later.
    const holdingImpact = follow && tr.elapsed <= Math.min(info.heavy ? 2 / 60 : 1 / 60, (info.dur || 0.2) * 0.2);
    if (!holdingImpact && dt > 0) {
      for (const [channel, lag] of [['head', style.headLag], ['weapon', style.weaponLag]]) {
        const amount = 1 - Math.exp(-dt / lag);
        pose[channel] = tr.cur[channel] + (pose[channel] - tr.cur[channel]) * amount;
      }
    }
    const smear = phase === 'active';
    if (smear && dt > 0) tr.history = [tr.cur, ...tr.history].slice(0, 2).map(p => mix(p, p, 0));
    else if (!smear) tr.history = [];
    tr.cur = pose;
    // Metadata is intentionally not interpolated as numeric channels.
    pose.__phase = phase; pose.__pt = tr.elapsed; pose.__pose = name;
    if (newGait && info.walkT != null) pose.__gait = ((info.walkT * (info.walkRate || 8)) % 4 + 4) % 4;
    if (smear) pose.__trail = tr.history;
    return pose;
  }
  function forget(key) { tracks.delete(key); }
  function breath(t, seed = 0) { return Math.sin(t * 2.4 + seed) * 1.5; }
  return { step, forget, breath, tracks, easeInOut, easeOutBack };
}
