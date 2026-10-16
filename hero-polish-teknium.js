// Authored against the original three-quarter cutouts. Angles are local degrees;
// weapon is the legacy wrist input, not a world-space blade direction.
// Install after native poses, mechanics and fallback aliases have been registered.
export function installTekniumPolish(POSES) {
  const set = (name, patch) => {
    const key = `teknium_${name}`;
    if (POSES[key]) POSES[key] = { ...POSES[key], ...patch };
  };
  const arms = (name, uarm, farm, uarm_b, farm_b, extra = {}) =>
    set(name, { uarm, farm, uarm_b, farm_b, ...extra });

  // Separate the trailing sleeve from the coat, without moving its attachment.
  arms('idleA', -8, -32, -18, -42);
  arms('idleB', -18, -46, -24, -54);
  arms('idleC', -6, -38, -16, -38);
  set('idle', POSES.teknium_idleA);
  arms('turn', -12, -42, -24, -54, { torso: 4, head: -4, weapon: -30.4 });
  arms('jump', -54, -58, -28, -46);
  arms('taunt', -60, -70, -50, -64); // blade hand low and forward: forearm passes under the chin
  arms('victory', -190, 6, -42, -48, { weapon: 50 }); // V: blade arm up and back, beside the head, not across the face

  // Compact contact/passing legs; world-space stance travel belongs to foot lock.
  const walk = [[-18, 18, 16, 14], [-4, 26, 4, 12], [16, 14, -18, 18], [4, 12, -4, 26]];
  const run = [[-24, 24, 20, 22], [-6, 48, 6, 18], [20, 22, -24, 24], [6, 18, -6, 48]];
  for (let i = 0; i < 4; i++) {
    for (const [gait, legs] of [['walk', walk[i]], ['run', run[i]]]) {
      const swing = [-1, 0, 1, 0][i], fast = gait === 'run';
      arms(`${gait}${i + 1}`, -12 + swing * 8, fast ? -44 : -34,
        -24 - swing * (fast ? 18 : 12), fast ? -58 : -40,
        { torso: fast ? 8 : 2, head: fast ? -7 : -3, tw: swing * .12,
          thigh: legs[0], shin: legs[1], thigh_b: legs[2], shin_b: legs[3], weapon: -30.4 });
    }
  }

  // Coil → cut → settle. A rising second cut still travels into the opponent;
  // it no longer finishes with the blade pointing behind the head.
  arms('bladeA_wind', -62, -96, -38, -48, { torso: -6, head: 3 });
  arms('bladeA_active', -72, -18, -24, -60);
  arms('bladeA_follow', -48, -26, -20, -54);
  arms('bladeB_wind', -30, -42, -28, -50, { torso: 10, weapon: -8 });
  arms('bladeB_active', -98, -18, -26, -62, { torso: 6, head: -6, weapon: 20, tw: -.45 });
  arms('bladeB_follow', -104, -24, -22, -58, { torso: 2, head: -4, weapon: 16, tw: -.35 });
  arms('bladeC_wind', 12, -94, -42, -52);
  arms('bladeC_active', -78, -12, -20, -48, { torso: 14, dx: 6 });
  arms('bladeC_follow', -74, -16, -18, -44, { torso: 16, dx: 6 });
  arms('dash_wind', 16, -72, -38, -48);
  arms('dash_active', -64, -18, -16, -40, { torso: 18 });
  arms('dash_follow', -48, -26, -18, -44, { torso: 16 });
  arms('burst_wind', -8, -100, -38, -80);
  arms('burst_active', -190, 4, -70, -28, { weapon: 50 }); // blade raised overhead, behind the face line
  arms('burst_follow', -184, 2, -58, -38, { weapon: 40 });

  // Mechanics get an actual free-arm action rather than the shared -92° elbow.
  const mechanics = {
    launcher: [[12, -74, -36, -54], [-112, -28, -22, -58], [-102, -30, -20, -54]],
    juggle: [[-30, -64, -40, -48], [-26, -42, -32, -54], [-34, -40, -28, -50]],
    dashAttack: [[12, -64, -36, -50], [-76, -22, -18, -48], [-64, -28, -20, -48]],
    grab: [[-16, -54, -68, -18], [-18, -52, -76, -12], [-20, -48, -68, -24]],
    grabThrow: [[-48, -60, -64, -40], [-22, -48, -72, -18], [-26, -44, -64, -24]],
    backAttack: [[24, -64, -42, -50], [-56, -36, -22, -56], [-48, -38, -24, -52]],
    hitReact: [[-18, -66, -40, -60], [-22, -62, -44, -56], [-18, -54, -36, -52]],
    healthSpecial: [[-86, -58, -48, -56], [-36, -38, -24, -44], [-42, -34, -22, -46]],
    groundPound: [[-62, -54, -52, -46], [-24, -44, -32, -38], [-28, -40, -28, -42]],
    dodgeRoll: [[-12, -54, -26, -58], [-48, -64, -34, -62], [-34, -52, -28, -54]],
  };
  for (const [move, keys] of Object.entries(mechanics))
    ['wind', 'active', 'follow'].forEach((phase, i) => arms(`${move}_${phase}`, ...keys[i]));
  // Load the rear knee in anticipation, then accept the cut on the front leg.
  // These are modest split stances, not a translation of the pelvis or a longer leg.
  const stance = (name, [thigh, shin, thigh_b, shin_b]) => set(name, { thigh, shin, thigh_b, shin_b });
  for (const move of ['bladeA', 'bladeB', 'bladeC', 'dash', 'burst', 'launcher', 'dashAttack',
    'grab', 'grabThrow', 'backAttack', 'healthSpecial', 'groundPound']) {
    stance(`${move}_wind`, [-18, 26, 16, 20]);
    stance(`${move}_active`, [-28, 28, 18, 12]);
    stance(`${move}_follow`, [-26, 26, 18, 14]);
  }
  arms('grabHold', -18, -52, -74, -16);
  arms('grabbed', 18, -68, -48, -46);
  arms('flinch', -18, -58, -38, -50);
  arms('stagger', 4, -66, -46, -54);
  arms('knockdownAir', 24, -76, -48, -64);
  // Fall with the weapon arm forward/up, then keep a bent high guard while the
  // pelvis rises. The negative shoulder arc carries the blade above the hand
  // throughout down → wake → idle, including the slower root-settling interval.
  arms('down', -160, -40, 35, -62);
  arms('downB', -160, -40, 35, -62);
  arms('wake', -80, -60, -34, -54);

  // Synthetic legacy follow aliases remain callable, so give their low sweeps
  // a bent elbow too. These are independent copies, never edits to shared poses.
  for (const move of ['axe', 'axeHeavy', 'bash', 'pound'])
    arms(`${move}_follow`, -24, -44, -24, -50);
  arms('throw_follow', -26, -44, -64, -24);
  for (const name of Object.keys(POSES).filter(n => n.startsWith('teknium_') && n.endsWith('_recover')))
    POSES[name] = { ...POSES.teknium_idleA };
  for (const name of Object.keys(POSES).filter(n => n.startsWith('teknium_')))
    POSES[name] = { ...POSES[name], __variants: tekniumPresentation(name) };
}

// Perspective hands (sheetC) choose the drawing per named pose; MANIFEST Links switch
// the matching forearm and finger overlay with them, and nothing is interpolated.
//  - hand@grip_cam: knuckles-on grip on the foreshortened forearm, for cocked wind-ups
//    where the blade forearm points at the camera, and the taunt flourish.
//  - hand_b@fist_cam: rear elbow/fist driven toward the camera-side target line.
//  - hand_b@open: reaching, catching balance and expressive gestures.
//  - hand_b default: the closed side fist.
const TEK_GRIP_CAM = /^teknium_(?:(?:bladeA|bladeB|bladeC|launcher|burst|healthSpecial|groundPound)_wind|taunt|turn)$/;
const TEK_FIST_CAM = /^teknium_(?:backAttack_(?:active|follow)|stagger|healthSpecial_(?:active|follow))$/;
const TEK_OPEN = /^teknium_(?:grab(?:_|Hold)|grabThrow_wind|grabbed$|jump$|knockdownAir$|flinch$|hitReact_|wake$|taunt$|victory$|burst_(?:active|follow))/;
export function tekniumPresentation(poseName = '') {
  const v = {};
  if (TEK_GRIP_CAM.test(poseName)) v.hand = 'grip_cam';
  if (TEK_FIST_CAM.test(poseName)) v.hand_b = 'fist_cam';
  else if (TEK_OPEN.test(poseName)) v.hand_b = 'open';
  return v;
}
