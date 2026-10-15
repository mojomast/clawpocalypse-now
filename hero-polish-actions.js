// Presentation-only distinctions for shared combat actions. Damage, startup,
// recovery and input bindings still come from combat.js / grab.js.
export function installPolishedActions(poses, chains) {
  for (const hero of ['teknium', 'nous_girl', 'turbofit']) {
    const idle = poses[hero + '_idleA'], put = (n, p) => { poses[`${hero}_${n}`] = { ...idle, ...p }; };
    // A kick is a leg attack, not the hero's area special or a sword-dash.
    const guard = { torso: -6, head: 4, dx: 0, dy: 0, tw: -.15 };
    if (hero !== 'nous_girl') {
      put('kick_wind', { ...guard, thigh: -35, shin: 90, thigh_b: 2, shin_b: 20 });
      put('kick_active', { ...guard, thigh: -82, shin: 20, thigh_b: -2, shin_b: 18 });
      put('kick_follow', { ...guard, thigh: -66, shin: 48, thigh_b: -2, shin_b: 22 });
      put('kick_recover', { ...idle, thigh: -22, shin: 55 });
      for (const phase of ['wind', 'active', 'follow', 'recover']) {
        put('jumpKick_' + phase, { ...poses[`${hero}_kick_${phase}`], thigh_b: 30, shin_b: 70, torso: -12 });
      }
    }
    // Third punch is a compact hook; the heavy finisher keeps its own named
    // wind/contact/follow poses and its fourth-hit combat timing.
    const second = chains[hero][1];
    for (const phase of ['wind', 'active', 'follow', 'recover']) {
      const base = poses[`${hero}_${second}_${phase}`] || idle;
      put('hook_' + phase, { ...base, head: (base.head || 0) - 4, tw: phase === 'wind' ? -.45 : phase === 'recover' ? -.1 : .7 });
    }
    chains[hero] = [chains[hero][0], second, 'hook'];
    // Back attacks strike with the rear elbow, while the weapon stays guarded.
    // A two-hand guitar solve must not pull that elbow back onto the neck.
    for (const [phase, uarm_b, farm_b] of [['wind', 20, -100], ['active', 72, -105], ['follow', 82, -110]]) {
      put('backAttack_' + phase, { ...poses[`${hero}_backAttack_${phase}`], uarm_b, farm_b,
        __twoHand: phase === 'wind' ? 'off' : 'free', __variants: {} });
    }
    // Non-damaging travel carries the weapon in guard, not in its attack pose.
    put('dashTravel_wind', { ...idle, torso: 8, thigh: -24, shin: 44 });
    put('dashTravel_active', { ...idle, torso: 14, head: -10, thigh: -28, shin: 48, thigh_b: 18, shin_b: 30, dy: -5 });
    put('dashTravel_follow', { ...idle, torso: 10, thigh: -18, shin: 34 });
    put('dashTravel_recover', idle);
  }
}
