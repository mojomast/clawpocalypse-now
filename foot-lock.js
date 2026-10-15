// Stateful support contacts for gameplay. The pure rig solve is also used by
// menus/sheets; only moving actors have a world origin against which to lock X.
import { solve, apply, SOLES, soleGround, POSES } from './rig.js';
import { HERO_RIGS } from './hero-rigs.js';

export function createFootLocks() {
  const tracks = new Map();
  function place(key, kind, drawing, { x, y, flip = false, scale = 0.7, dt = 1 / 60 }) {
    if (!HERO_RIGS[kind] || !SOLES[kind]) return drawing;
    const pose = { ...drawing };
    delete pose.__footTargets;
    delete pose.__rootDy;
    const polish = kind === 'teknium' || kind === 'turbofit';
    const recoveryHero = polish || kind === 'nous_girl';
    const gait = /_(walk|run)[1-4]$/.test(pose.__pose || '');
    if (polish && gait) pose.__strideSpan = (/_run/.test(pose.__pose) ? 64 : 46) / scale;
    const base = solve(kind, pose, { poseName: pose.__pose, animated: true });
    let track = tracks.get(key);
    if (!track || track.flip !== flip || Math.hypot(x - track.x, y - track.y) > 80) {
      track = { anchors: {}, flip }; tracks.set(key, track);
    }
    // Freeze an already-presented contact, but let a new active drawing commit
    // on the first zero-dt hit frame (the combat presentation contract).
    if (recoveryHero && dt === 0 && track.pose === pose.__pose && track.lastPose) {
      return { ...track.lastPose, __dt: 0 };
    }
    if (!base.contacts.length) track.anchors = {};
    const gettingUp = name => /(^|_)(down|downB|wake)$/.test(name || '');
    if (recoveryHero && gettingUp(pose.__pose)) track.recovery = { elapsed: 0 };
    const recoveryIdle = track.recovery && /_idle[ABC]?$/.test(pose.__pose || '');
    if (track.recovery && !recoveryIdle && !gettingUp(pose.__pose)) delete track.recovery;
    if (pose.__pose !== track.pose && (gettingUp(pose.__pose) || gettingUp(track.pose))) track.settle = 0.32;
    if (polish && track.pose && /_(walk|run)[1-4]$/.exec(pose.__pose || '')?.[1] !== /_(walk|run)[1-4]$/.exec(track.pose)?.[1]) track.settle = 0.16;
    const sign = flip ? -1 : 1, targets = {};
    const contactX = (side, solution = base) => {
      const name = side === 'front' ? 'shin' : 'shin_b', part = HERO_RIGS[kind][name], sc = solution.S[name];
      const points = SOLES[kind].map(([u, v]) => apply(solution.M[name], (u - part.px) * sc[0], (v - part.py) * sc[1]));
      return x + sign * scale * points.reduce((a, b) => a[1] > b[1] ? a : b)[0];
    };
    for (const side of Object.keys(track.anchors)) if (!base.contacts.includes(side)) delete track.anchors[side];
    for (const side of base.contacts) {
      if (track.anchors[side] == null) {
        track.anchors[side] = contactX(side);
      }
      targets[side] = [(track.anchors[side] - x) * sign / scale - (pose.dx || 0), soleGround(kind)];
    }
    if (recoveryIdle) {
      const recovery = track.recovery;
      recovery.elapsed += dt;
      // Wake starts on a blended fallen drawing. Its reachable contacts are
      // temporary: replant one foot at a time through the idle blend, keeping the
      // other world anchor fixed rather than dragging both supports upright.
      if (recovery.elapsed > 0) {
        const side = recovery.side || 'front';
        if (!recovery.side) {
          // Plant at the authored rest stance, not an arbitrary extremum of
          // idle breathing. Subsequent breathing articulates over fixed feet.
          const rest = solve(kind, POSES[pose.__pose], { poseName: pose.__pose, animated: true });
          recovery.rest = { front: contactX('front', rest), back: contactX('back', rest) };
          recovery.side = side; recovery.time = 0;
          recovery.from = track.anchors[side]; recovery.to = recovery.rest[side];
        }
        recovery.time = Math.min(0.3, recovery.time + dt);
        const u = recovery.time / 0.3, ease = u * u * (3 - 2 * u);
        const stepX = recovery.from + (recovery.to - recovery.from) * ease;
        targets[side] = [(stepX - x) * sign / scale - (pose.dx || 0), soleGround(kind) - 10 * Math.sin(Math.PI * u) ** 2];
        track.settle = Math.max(track.settle || 0, 0.32);
        if (u === 1) {
          track.anchors[side] = recovery.to;
          if (side === 'front') {
            recovery.side = 'back'; recovery.time = 0;
            recovery.from = track.anchors.back; recovery.to = recovery.rest.back;
          } else delete track.recovery;
        }
      }
    }
    const free = solve(kind, pose, { poseName: pose.__pose, animated: true, footTargets: targets });
    if (track.settle > 0 && track.rootDy != null) {
      const delta = ((recoveryIdle ? base : free).M.torso[5] - track.rootDy) * (1 - Math.exp(-dt / 0.07));
      const rate = polish ? 240 : 450;
      pose.__rootDy = track.rootDy + Math.max(-rate * dt, Math.min(rate * dt, delta));
      track.settle = Math.max(track.settle - dt, Math.abs(free.M.torso[5] - pose.__rootDy) > 0.5 ? dt : 0);
    }
    let locked = pose.__rootDy == null ? free : solve(kind, pose, { poseName: pose.__pose, animated: true, footTargets: targets, rootDy: pose.__rootDy });
    if (recoveryHero && (track.recovery || recoveryIdle)) {
      // A wake support must remain reachable until its deliberate lifted step.
      // Raising the pelvis too soon either releases it in this module or makes
      // Nous's solver pivot to a toe, both of which snap the rendered ankle.
      const reachable = solution => base.contacts.every(side => solution.ground?.[side]?.error < 0.25 && !solution.ground[side].toeOff);
      if (!reachable(locked)) {
        const root = locked.M.torso[5];
        let low = root, high = root;
        for (let step = 1; step <= 256; step++) {
          const offset = Math.ceil(step / 2) * 0.5 * (step % 2 ? 1 : -1);
          high = root + offset;
          const candidate = solve(kind, pose, { poseName: pose.__pose, animated: true, footTargets: targets, rootDy: high });
          if (reachable(candidate)) {
            locked = candidate;
            for (let i = 0; i < 12; i++) {
              const middle = (low + high) / 2;
              const trial = solve(kind, pose, { poseName: pose.__pose, animated: true, footTargets: targets, rootDy: middle });
              if (reachable(trial)) { high = middle; locked = trial; } else low = middle;
            }
            pose.__rootDy = high;
            break;
          }
        }
      }
    }
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
    // v2 rigs: the actor identity and frame time drive hair/hem/cable secondary motion
    // (dt is 0 during hit-stop, which freezes it).
    pose.__actor = kind + ':' + key; pose.__dt = dt;
    if (recoveryHero) track.lastPose = { ...pose };
    return pose;
  }
  return { place, forget: key => tracks.delete(key), tracks };
}
