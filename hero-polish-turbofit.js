// Source-cutout choreography: a bent, chest-height two-handed coil rather than
// the old straight-arm overhead swing. Install after default/fallback authoring.
// Deliberately independent of rig.js (the installer must not create a cycle).
export function installTurboFitPolish(POSES) {
  const set = (name, channels) => {
    const key = `turbofit_${name}`;
    if (POSES[key]) POSES[key] = { ...POSES[key], ...channels };
  };
  // Clone aliases, and give legacy synthetic follow keys a real bent-arm carry.
  for (const key of Object.keys(POSES)) if (key.startsWith('turbofit_')) {
    POSES[key] = { ...POSES[key] };
    if (key.endsWith('_follow')) set(key.slice(9), { uarm: -24, farm: -66, uarm_b: -28, farm_b: -64, weapon: -36 });
  }
  const carry = { uarm: -18, farm: -58, uarm_b: -26, farm_b: -64, weapon: -40 };
  set('idleA', { ...carry, torso: 6, head: -4, tw: 0 });
  set('idleB', { ...carry, torso: 8, head: -5, uarm: -14, farm: -62, tw: 0.1 });
  set('idleC', { ...carry, torso: 4, head: -2, uarm: -22, farm: -54, tw: -0.1 });
  set('idle', POSES.turbofit_idleA);
  const walk = [[-22, 20, 20, 18], [-4, 26, 4, 12], [20, 18, -22, 20], [4, 12, -4, 26]];
  const run = [[-34, 30, 26, 38], [-12, 48, 10, 24], [26, 38, -34, 30], [10, 24, -12, 48]];
  for (let i = 0; i < 4; i++) for (const [mode, legs] of [['walk', walk], ['run', run]]) {
    const [thigh, shin, thigh_b, shin_b] = legs[i];
    set(`${mode}${i + 1}`, { ...carry, torso: mode === 'run' ? 11 : 7, head: -5,
      uarm: -18 + [3, 0, -3, 0][i], thigh, shin, thigh_b, shin_b, tw: [0.1, 0, -0.1, 0][i], dx: 0, dy: 0 });
  }
  set('turn', { ...carry, torso: 3, head: -2, tw: 0, uarm_b: -30, farm_b: -55, __variants: { hand: 'grip_cam', hand_b: 'fist_cam' } });
  set('taunt', { ...carry, torso: 2, head: 10, uarm_b: -88, farm_b: -50, tw: -0.2, __variants: { hand: 'grip_cam', hand_b: 'open' } });
  set('victory', { ...carry, torso: -6, head: 6, uarm: -80, farm: -35, uarm_b: -115, farm_b: -40, tw: 0, __variants: { hand: 'grip_cam', hand_b: 'open' } });
  set('jump', { ...carry, torso: -4, head: -6, uarm_b: -40, farm_b: -55 });
  const attack = (move, wind, active, follow) => {
    for (const [phase, p] of [['wind', wind], ['active', active], ['follow', follow]]) set(`${move}_${phase}`, { ...carry, ...p });
    set(`${move}_recover`, POSES.turbofit_idleA);
  };
  attack('axe',
    { torso: -10, head: 2, uarm: -42, farm: -42, tw: -0.3 },
    { torso: 18, head: -10, uarm: -24, farm: -52, tw: 0.4 },
    { torso: 23, head: -12, uarm: -14, farm: -62, tw: 0.35 });
  attack('axeB',
    { torso: 16, head: -8, uarm: -18, farm: -58, tw: 0.3 },
    { torso: -4, head: -6, uarm: -38, farm: -42, tw: -0.25 },
    { torso: -8, head: -4, uarm: -40, farm: -40, tw: -0.3 });
  attack('axeHeavy',
    { torso: -18, head: 4, uarm: -44, farm: -40, tw: -0.3, __variants: { hand: 'grip_cam' } },
    { torso: 26, head: -14, uarm: -22, farm: -52, tw: 0.45 },
    { torso: 30, head: -16, uarm: -10, farm: -68, tw: 0.4 });
  attack('chord',
    { torso: -12, head: 6, uarm: -38, farm: -44, tw: -0.2, __variants: { hand: 'grip_cam' } },
    { torso: 20, head: -8, uarm: -25, farm: -42, tw: 0.2 },
    { torso: 24, head: 6, uarm: -20, farm: -58, tw: 0.15 });
  attack('headbang',
    { torso: -8, head: -6, uarm: -16, farm: -60, tw: -0.15, __variants: { hand_b: 'fist' } },
    { torso: 26, head: 14, uarm: -10, farm: -66, tw: 0.2, __variants: { hand_b: 'fist' } },
    { torso: 22, head: 18, uarm: -14, farm: -68, tw: 0.15, __variants: { hand_b: 'fist' } });
  attack('launcher', { torso: 12, uarm: -4, farm: -62, __variants: { hand: 'grip_cam' } }, { torso: -10, uarm: -52, farm: -40 }, { torso: -14, uarm: -60, farm: -42 });
  attack('juggle', { torso: -8, uarm: -34, farm: -56 }, { torso: 12, uarm: -24, farm: -52 }, { torso: 16, uarm: -18, farm: -62 });
  for (const move of ['dash', 'dashAttack']) attack(move, { torso: -8, uarm: -12, farm: -64 }, { torso: 14, uarm: -44, farm: -36 }, { torso: 18, uarm: -36, farm: -48 });
  attack('grab', { uarm_b: -48, farm_b: -50, __variants: { hand_b: 'open' } }, { uarm_b: -65, farm_b: -24, __variants: { hand_b: 'open' } }, { uarm_b: -55, farm_b: -38, __variants: { hand_b: 'open' } });
  attack('grabThrow', { torso: -10, uarm_b: -65, farm_b: -65, __variants: { hand_b: 'open' } }, { torso: 16, uarm: -12, farm: -66, uarm_b: -75, farm_b: -20, __variants: { hand_b: 'fist' } }, { torso: 20, uarm_b: -70, farm_b: -30, __variants: { hand_b: 'fist' } });
  attack('backAttack', { torso: 8, uarm: -8, farm: -70, tw: -0.4 }, { torso: -12, uarm: -48, farm: -42, tw: 0.4, dx: -10 }, { torso: -6, uarm: -42, farm: -50, tw: 0.3, dx: -6 });
  attack('healthSpecial', { torso: -10, uarm: -40, farm: -48, __variants: { hand: 'grip_cam', hand_b: 'fist_cam' } }, { torso: 14, uarm: -14, farm: -58, uarm_b: -80, farm_b: -35, __variants: { hand_b: 'fist_cam' } }, { torso: 18, uarm: -10, farm: -68, uarm_b: -65, farm_b: -45, __variants: { hand_b: 'fist_cam' } });
  attack('groundPound', { torso: -10, uarm: -42, farm: -42, __variants: { hand: 'grip_cam' } }, { torso: 20, uarm: -12, farm: -64 }, { torso: 24, uarm: -8, farm: -70 });
  attack('dodgeRoll', { torso: -12, uarm: -20, farm: -70, __variants: { hand_b: 'fist' } }, { torso: 38, uarm: -30, farm: -90, uarm_b: -20, farm_b: -85, __variants: { hand_b: 'fist' } }, { torso: 24, uarm: -20, farm: -76, __variants: { hand_b: 'fist' } });
  attack('hitReact', { torso: -8, uarm: -16, farm: -68, __variants: { hand_b: 'fist' } }, { torso: -12, uarm: -10, farm: -74, __variants: { hand_b: 'fist' } }, { torso: -6, uarm: -14, farm: -70, __variants: { hand_b: 'fist' } });
  set('flinch', { ...carry, torso: -6, head: 6, uarm_b: -38, farm_b: -65, __variants: { hand_b: 'fist' } });
  set('stagger', { ...carry, torso: -14, head: 10, uarm: -8, farm: -78, uarm_b: -45, farm_b: -58, __variants: { hand_b: 'fist_cam' } });
  set('grabHold', { ...carry, uarm_b: -62, farm_b: -28, __variants: { hand_b: 'open' } });
  set('grabbed', { ...carry, torso: -10, uarm_b: -42, farm_b: -62, __variants: { hand_b: 'open' } });
  // Keep the guitar folded across the upper body while prone. The generic
  // trailing arm swept the neck through the floor as the pelvis rose into wake.
  // Retain the elbow fold during the first kneeling lift, then unfold to idle.
  set('down', { uarm: -110, farm: -110, weapon: -40 });
  set('downB', { uarm: -108, farm: -112, weapon: -40 });
  set('wake', { ...carry, torso: 30, head: -10, uarm: -40, farm: -110, uarm_b: -26, farm_b: -75 });
  for (const name of Object.keys(POSES).filter(n => n.startsWith('turbofit_')))
    POSES[name] = { ...POSES[name], __twoHand: turboFitPresentation(name).twoHand };
}

// Runtime integration: require support through these authored keys, then release
// to the open drawing during recovery. Promote the complete far arm chain only
// while support is engaged; keep the closed hand above the guitar neck.
export function turboFitPresentation(poseName) {
  const supported = /^turbofit_(axe|axeB|axeHeavy|chord|headbang)_(wind|active|follow)$/.test(poseName);
  const released = /_(recover|taunt|victory|flinch|stagger|knockdownAir|down|downB|wake|grabHold|grabbed)$/.test(poseName)
    || /^turbofit_(grab|grabThrow|hitReact|healthSpecial|dodgeRoll)_/.test(poseName);
  return { twoHand: supported ? 'required' : released ? 'off' : 'optional', farArmFront: !released,
    farHand: supported ? 'grip_far' : 'open' };
}
