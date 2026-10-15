// Stateful support contacts for gameplay. The pure rig solve is also used by
// menus/sheets; only moving actors have a world origin against which to lock X.
import { solve, apply, SOLES, FOOT_Y } from './rig.js';
import { HERO_RIGS } from './hero-rigs.js';

export function createFootLocks() {
  const tracks = new Map();
  function place(key, kind, drawing, { x, y, flip = false, scale = 0.7, dt = 1 / 60 }) {
    if (!HERO_RIGS[kind] || !SOLES[kind]) return drawing;
    const pose = { ...drawing };
    delete pose.__footTargets;
    delete pose.__rootDy;
    const base = solve(kind, pose, { poseName: pose.__pose, animated: true });
    let track = tracks.get(key);
    if (!track || track.flip !== flip || Math.hypot(x - track.x, y - track.y) > 80) {
      track = { anchors: {}, flip }; tracks.set(key, track);
    }
    if (!base.contacts.length) track.anchors = {};
    const gettingUp = name => /(^|_)(down|downB|wake)$/.test(name || '');
    if (pose.__pose !== track.pose && (gettingUp(pose.__pose) || gettingUp(track.pose))) track.settle = 0.32;
    const sign = flip ? -1 : 1, targets = {};
    for (const side of Object.keys(track.anchors)) if (!base.contacts.includes(side)) delete track.anchors[side];
    for (const side of base.contacts) {
      if (track.anchors[side] == null) {
        const name = side === 'front' ? 'shin' : 'shin_b', part = HERO_RIGS[kind][name], sc = base.S[name];
        const points = SOLES[kind].map(([u, v]) => apply(base.M[name], (u - part.px) * sc[0], (v - part.py) * sc[1]));
        const contact = points.reduce((a, b) => a[1] > b[1] ? a : b);
        track.anchors[side] = x + sign * scale * contact[0];
      }
      targets[side] = [(track.anchors[side] - x) * sign / scale - (pose.dx || 0), FOOT_Y];
    }
    const free = solve(kind, pose, { poseName: pose.__pose, animated: true, footTargets: targets });
    if (track.settle > 0 && track.rootDy != null) {
      const delta = (free.M.torso[5] - track.rootDy) * (1 - Math.exp(-dt / 0.07));
      pose.__rootDy = track.rootDy + Math.max(-450 * dt, Math.min(450 * dt, delta));
      track.settle = Math.max(track.settle - dt, Math.abs(free.M.torso[5] - pose.__rootDy) > 0.5 ? dt : 0);
    }
    const locked = pose.__rootDy == null ? free : solve(kind, pose, { poseName: pose.__pose, animated: true, footTargets: targets, rootDy: pose.__rootDy });
    // Release an unreachable contact as a new step, never stretch a limb or drag
    // an invalid anchor indefinitely (teleports, recoil and large lunges).
    if (locked.ground?.residual > 0.75) {
      for (const side of base.contacts) if (locked.ground[side]?.error > 0.75) {
        delete track.anchors[side]; delete targets[side];
      }
    }
    track.x = x; track.y = y;
    track.pose = pose.__pose; track.rootDy = locked.M.torso[5];
    pose.__footTargets = targets;
    return pose;
  }
  return { place, forget: key => tracks.delete(key), tracks };
}
