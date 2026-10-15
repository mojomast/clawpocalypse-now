// Presentation timing only. Combat windows and hitboxes remain authoritative.
// Seconds for secondary follow; amplitudes are deliberately small at arcade scale.
export const HERO_MOTION = {
  turtle_purple: { settle: 0.11, headLag: 0.035, weaponLag: 0.025, breath: 0.8, stride: 1.0 },
  turtle_blue:   { settle: 0.10, headLag: 0.028, weaponLag: 0.020, breath: 0.7, stride: 1.0 },
  turtle_red:    { settle: 0.08, headLag: 0.025, weaponLag: 0.015, breath: 1.0, stride: 1.1 },
  turtle_orange: { settle: 0.09, headLag: 0.045, weaponLag: 0.045, breath: 1.2, stride: 1.15 },
  nous_girl:     { settle: 0.09, headLag: 0.055, weaponLag: 0.060, breath: 0.8, stride: 1.1 },
  teknium:       { settle: 0.10, headLag: 0.020, weaponLag: 0.012, breath: 0.4, stride: 0.85 },
  turbofit:      { settle: 0.14, headLag: 0.070, weaponLag: 0.045, breath: 1.0, stride: 0.9 },
  don_piedro:    { settle: 0.16, headLag: 0.065, weaponLag: 0.055, breath: 0.7, stride: 0.75 },
};

export function motionFor(poseName = '') {
  const hero = Object.keys(HERO_MOTION).find(id => poseName.startsWith(id + '_'));
  return HERO_MOTION[hero] || HERO_MOTION.turtle_blue;
}

// Called after a hero's stance/weapon drawings have been registered. Running
// keeps their weapon carriage but has its own reach, compressed passing knee,
// forward lean, and shoulder/hip opposition rather than a sped-up walk.
export function addRunPoses(poses, hero) {
  const style = HERO_MOTION[hero];
  if (!style) return;
  const legs = [[-38, 30, 28, 12], [-8, 58, 4, 8], [28, 12, -38, 30], [4, 8, -8, 58]];
  for (let i = 0; i < 4; i++) {
    const walk = poses[`${hero}_walk${i + 1}`];
    if (!walk) continue;
    const L = legs[i], swing = [-1, 0, 1, 0][i];
    poses[`${hero}_run${i + 1}`] = { ...walk,
      torso: (walk.torso || 0) + 7 * style.stride,
      head: (walk.head || 0) - 4 * style.stride,
      uarm: (walk.uarm || 0) - swing * 8 * style.stride,
      uarm_b: (walk.uarm_b || 0) + swing * 12 * style.stride,
      thigh: L[0] * style.stride, shin: L[1],
      thigh_b: L[2] * style.stride, shin_b: L[3], tw: -swing * 0.32 };
  }
}

export function addDownPoses(poses, hero) {
  // The original knockdown curled around a low boot, leaving the torso hovering
  // like a flying kick. Tuck both knees above the hips and rest on the shoulder
  // and torso silhouette instead. The bo lies along the floor, not through it.
  const base = poses[`${hero}_down`];
  poses[`${hero}_down`] = { ...base, torso: 88, head: -38,
    uarm: 68, farm: -45, uarm_b: 35, farm_b: -62,
    thigh: -8, shin: 72, thigh_b: 10, shin_b: 82,
    ...(hero === 'turtle_purple' ? { weapon: -61 } : {}) };
  poses[`${hero}_downB`] = { ...poses[`${hero}_down`], torso: 86,
    head: -40, uarm: 66, farm: -47, shin: 74, shin_b: 84 };
}

export function addDonPoses(poses) {
  const set = (name, overrides) => poses[`don_piedro_${name}`] = { ...poses.don_piedro_idleA, ...overrides };
  set('idleA', { torso: 13, head: -6, uarm: 12, farm: -76, uarm_b: -8, farm_b: -62,
    thigh: -24, shin: 34, thigh_b: 20, shin_b: 18, weapon: -20, tw: -0.12, dx: 0, dy: 0 });
  set('idleB', { torso: 15, head: -8, uarm: 16, farm: -82, tw: -0.2 });
  set('idleC', { torso: 12, head: -4, uarm: 10, farm: -72, tw: 0.05 });
  set('idle', {});
  const legs = [[-25, 26, 20, 16], [-3, 36, 2, 12], [20, 16, -25, 26], [2, 12, -3, 36]];
  legs.forEach((L, i) => set(`walk${i + 1}`, { torso: 14 + (i % 2 ? 0 : 2),
    head: -7, thigh: L[0], shin: L[1], thigh_b: L[2], shin_b: L[3],
    uarm: 12 + [-5, 0, 5, 0][i], uarm_b: -8 + [16, 0, -16, 0][i], tw: [-0.2, 0, 0.2, 0][i] }));
  set('jump', { torso: 16, head: -9, uarm: -38, farm: -65, thigh: -46, shin: 72, thigh_b: -8, shin_b: 54 });
  set('taunt', { torso: 18, head: -13, uarm_b: -54, farm_b: -110, uarm: 18, farm: -86, tw: -0.2 });
  set('victory', { torso: 8, head: -2, uarm: -138, farm: -24, weapon: -18, uarm_b: 14, farm_b: -54 });
  const swings = {
    slash: [
      { torso: -8, head: 4, uarm: -148, farm: -38, weapon: -38, tw: -0.8 },
      { torso: 24, head: -14, uarm: -40, farm: -12, weapon: -18, thigh: -36, shin: 44, tw: 0.9 },
      { torso: 29, head: -16, uarm: -14, farm: -16, weapon: -12, thigh: -38, shin: 48, tw: 0.8 }],
    slashUp: [
      { torso: 24, head: -12, uarm: 20, farm: -38, weapon: -28, thigh: -28, shin: 48, tw: -0.6 },
      { torso: 4, head: -6, uarm: -118, farm: -18, weapon: -22, thigh: -22, shin: 28, tw: 0.7 },
      { torso: -3, head: -2, uarm: -142, farm: -24, weapon: -28, tw: 0.6 }],
    slashSpin: [
      { torso: 4, head: -2, uarm: 28, farm: -84, weapon: -38, thigh: -26, shin: 44, tw: -0.9 },
      { torso: 19, head: -10, uarm: -74, farm: -12, weapon: -22, thigh: -30, shin: 34, tw: 0.9 },
      { torso: 24, head: -12, uarm: -38, farm: -22, weapon: -12, tw: 0.6 }],
    slashB: [
      { torso: 4, head: -2, uarm: 18, farm: -96, weapon: -42, tw: -0.7 },
      { torso: 24, head: -10, uarm: -64, farm: -10, weapon: -22, thigh: -38, shin: 42, tw: 0.8 },
      { torso: 28, head: -14, uarm: -42, farm: -16, weapon: -18, thigh: -38, shin: 44, tw: 0.6 }],
  };
  for (const [move, frames] of Object.entries(swings)) {
    ['wind', 'active', 'follow'].forEach((phase, i) => set(`${move}_${phase}`, frames[i]));
    set(`${move}_recover`, {});
  }
  // Inherited mechanics get his own recovery stance, without aliasing a turtle's
  // objects (editing one hero must never silently edit another hero).
  for (const name of Object.keys(poses)) if (name.startsWith('don_piedro_') && name.endsWith('_recover')) poses[name] = { ...poses.don_piedro_idleA };
  addRunPoses(poses, 'don_piedro');
  addDownPoses(poses, 'don_piedro');
}
