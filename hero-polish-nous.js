// Nous-only pose authorship. No rig dependency: install after per-hero setup.
// Angles are relative joint degrees, weapon uses rig.js's Nous grip offset.
// Feet, wrists, grip registration and floor placement remain the solver's job.
const PREFIX = 'nous_girl_';
const channels = ['torso', 'head', 'uarm', 'farm', 'uarm_b', 'farm_b', 'thigh', 'shin', 'thigh_b', 'shin_b', 'tw', 'dx', 'dy'];
const pose = (values, theta = -68) => Object.fromEntries([
  ...channels.map((key, i) => [key, values[i] ?? 0]), ['weapon', theta + 34.3],
]);

// Narrow, relaxed hip-out stance; counter-rotated head keeps the gaze level.
// Breathing shifts support across the feet rather than translating the whole rig.
const states = {
  idleA: [-4, 5, -14, -52, 12, -62, -8, 12, 12, 6, .22, -1],
  idleB: [-1, 3, -10, -58, 18, -70, -4, 16, 10, 4, .32, 0],
  idleC: [2, -1, -5, -48, 6, -56, -12, 16, 6, 8, -.12, 1],
  walk1: [2, 0, 6, -54, -26, -58, -24, 18, 22, 16, .22],
  walk2: [-1, 3, -10, -60, 2, -64, -2, 34, 2, 8, .04],
  walk3: [3, -1, -24, -56, 28, -60, 22, 16, -24, 18, -.22],
  walk4: [0, 2, -12, -50, 4, -58, 2, 8, -2, 34, -.04],
  // Elbows carry the cable close; the free shoulder opposes the driving knee.
  run1: [12, -7, 20, -98, -42, -76, -40, 32, 26, 12, .34],
  run2: [9, -5, -8, -108, -4, -82, -10, 62, 6, 8, .08],
  run3: [13, -8, -36, -92, 32, -86, 26, 12, -40, 32, -.34],
  run4: [10, -6, -12, -100, 2, -74, 6, 8, -10, 62, -.08],
  jump: [-8, 5, -84, -66, -48, -82, -54, 88, 8, 48, -.24],
  turn: [0, 6, -26, -66, 14, -78, -10, 20, 12, 14, -.5],
  taunt: [-7, 11, -34, -108, 26, -64, -4, 10, 16, 12, .42, -1],
  victory: [-9, 8, -196, 12, -112, -48, -24, 56, 8, 6, .32],
  flinch: [-17, 15, -28, -88, -24, -102, -12, 24, 18, 12, -.38, -2],
  stagger: [-24, 20, 8, -96, -38, -84, -20, 32, 24, 18, -.54, -3],
  knockdownAir: [-36, 22, -62, -64, -104, -42, -44, 72, 16, 52, -.4],
  down: [88, -38, 68, -45, 35, -62, -8, 72, 10, 82, -.12],
  downB: [86, -40, 64, -49, 31, -66, -8, 74, 10, 84, -.08],
  wake: [28, -18, -22, -72, -44, -48, -30, 64, 24, 38, -.22],
  grabHold: [8, -4, -54, -32, -64, -24, -16, 22, 14, 10, .26, 1],
  grabbed: [-12, 10, -46, -54, -38, -64, -8, 22, 16, 16, -.3],
};

// Each row is wind / contact / follow. Recover is a separate settling guard.
// The free hand counterbalances rather than duplicating the cable hand.
const moves = {
  // Lash contact: the elbow stays bent and the fist low and inboard, so the thrown cable
  // (not the arm) spans the reach as a taut stroke out of the fist instead of bunching
  // into a loop beside an already fully extended hand.
  whipA: [
    [-10, 7, 32, -112, -42, -66, -12, 28, 24, 14, -.8, -2],
    [12, -7, -32, -54, 34, -86, -30, 32, 26, 6, .9, 2],
    [16, -9, -26, -58, 38, -74, -32, 36, 24, 8, .65, 2]],
  whipB: [
    [8, -4, -192, -34, 26, -88, -18, 22, 16, 8, .65, 1], // cable hand cocked up and back behind the head, clear of the face
    [4, -5, -34, -52, -34, -72, -24, 28, 22, 8, -.75, 2],
    [-2, -2, -28, -54, -44, -60, -20, 24, 18, 10, -.55, 1]],
  wave: [
    [-12, 8, 10, -116, -20, -114, -12, 28, 22, 16, -.55, -2],
    [10, -6, -82, -12, -72, -22, -30, 32, 26, 8, .38, 2],
    [14, -8, -70, -26, -58, -36, -28, 34, 24, 10, .3, 2]],
  bassDrop: [
    [-12, 9, -192, -18, -134, -42, -26, 48, 12, 26, -.34], // overhead wind-up: cable hand up and back, clear of the face
    // AIR_POSE does not plant this named special. Authored root drop puts
    // both bent legs on the floor instead of leaving a suspended air tuck.
    [28, -18, -38, -28, -28, -38, -46, 80, -35, 80, .5, 0, 21.4],
    [20, -12, -24, -48, -12, -58, -30, 54, -35, 62, .28, 0, 9.4]],
  launcher: [
    [18, -6, 24, -102, -26, -88, -26, 46, 20, 24, -.6, -1],
    [-10, -8, -108, -46, 30, -76, -18, 20, 14, 6, .7, 2], // rising lash: elbow forward at chin height, fist up in front of the face
    [-14, -6, -112, -50, 36, -70, -14, 16, 12, 6, .5, 1]],
  juggle: [
    [-10, 6, 12, -100, -36, -76, -40, 66, 8, 42, -.5],
    [12, -8, -76, -20, 32, -74, -50, 44, 18, 52, .7],
    [16, -10, -54, -34, 38, -62, -42, 56, 12, 58, .45]],
  dashAttack: [
    [8, -4, 24, -100, -38, -70, -26, 42, 22, 20, -.65, -1],
    [22, -14, -70, -24, 40, -80, -42, 42, 30, 6, .8, 3],
    [26, -16, -46, -38, 44, -68, -38, 46, 28, 10, .55, 3]],
  grab: [
    [3, -2, -28, -70, -34, -58, -12, 22, 14, 12, -.18],
    states.grabHold,
    [10, -5, -58, -38, -68, -30, -18, 26, 16, 12, .32, 1]],
  grabThrow: [
    [-12, 9, -82, -54, -76, -48, -24, 40, 18, 20, -.6, -1],
    [20, -12, -40, -22, -78, -14, -30, 34, 24, 8, .8, 2],
    [26, -16, -18, -36, -54, -28, -32, 38, 24, 12, .6, 2]],
  backAttack: [
    [10, -8, -28, -96, -24, -82, -12, 24, 16, 12, .55],
    [-12, 14, 64, -48, -36, -80, 16, 16, -22, 28, -.75, -2],
    [-16, 16, 74, -58, -24, -88, 14, 20, -20, 30, -.5, -2]],
  groundPound: [
    [-10, 6, -192, -18, -118, -48, -44, 80, 10, 52, -.4],
    [34, -20, -28, -32, -44, -24, -42, 76, 26, 58, .5],
    [24, -14, -18, -52, -30, -46, -32, 56, 20, 36, .28]],
  dash: [
    [14, -8, 12, -104, -32, -84, -24, 42, 20, 20, -.24],
    [24, -14, 24, -108, -16, -96, -40, 48, 30, 12, .14],
    [18, -10, 8, -100, -28, -88, -28, 42, 22, 18, .08]],
  dodgeRoll: [
    [24, -14, -24, -94, -42, -82, -36, 66, 24, 46, -.3, 0, 16.7],
    // Tuck the free elbow clear of the floor; rest on the curled thigh/shin.
    [72, -36, -42, -100, -10, -145, -52, 108, 12, 94, -.5, 0, 71.5],
    [36, -22, -24, -82, -38, -70, -32, 64, 22, 42, -.24, 0, 25.4]],
  hitReact: [states.flinch, states.stagger,
    [-12, 8, -18, -78, -12, -86, -16, 26, 18, 14, -.22, -1]],
  // Presentation-only names for the main identity mapper. Combat still names
  // its knees 'grab', throws 'grabThrow', and ordinary kicks 'bassDrop'.
  kick: [
    [-8, 5, -18, -80, -30, -76, -42, 82, 12, 12, -.3],
    [-18, 10, 22, -80, -42, -68, -82, 16, 12, 8, .4],
    [-12, 7, 12, -84, -30, -74, -54, 52, 10, 10, .2]],
  jumpKick: [
    [-10, 5, -36, -78, -58, -62, -52, 86, 16, 54, -.3],
    [-22, 12, 26, -74, -54, -66, -86, 10, 16, 58, .4],
    [-16, 8, 12, -82, -38, -72, -54, 58, 10, 64, .2]],
  knee: [states.grabHold,
    [4, -6, -58, -38, -68, -30, -72, 108, 10, 8, .34, 1],
    [10, -6, -56, -34, -64, -30, -40, 72, 12, 12, .26, 1]],
  kneeFinal: [
    [12, -6, -52, -38, -62, -30, -36, 72, 14, 16, -.2],
    [-6, -8, -64, -30, -74, -22, -88, 104, 10, 6, .6, 2],
    [-10, -4, -44, -46, -54, -42, -56, 80, 12, 10, .36, 1]],
  screenThrow: [
    [-14, 10, -76, -62, -66, -58, -26, 42, 20, 24, -.55],
    [18, -10, -62, -28, -52, -32, -26, 30, 22, 10, .65, 2],
    [24, -14, -42, -42, -34, -48, -28, 36, 22, 14, .4, 2]],
};

// Optional geometry consumer, never a combat rule. Supply canonical rig-space
// cable points after secondary simulation; extents are actor-local world px.
export function nousReachFor(name, cablePoints, scale = .7) {
  if (!/^nous_girl_whip[AB]_active$/.test(name) || !Number.isFinite(scale) || scale <= 0 ||
      !Array.isArray(cablePoints) || cablePoints.length < 2 ||
      !cablePoints.every(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))) return null;
  const xs = cablePoints.map(p => p[0]);
  return Object.freeze({ kind: 'cable', forward: scale * Math.max(...xs), back: scale * Math.min(...xs), scale });
}

// sheetC hands per named pose (stepped, never interpolated; MANIFEST Links switch the
// finger overlay with the grip). Nous has no foreshortened forearm drawing, so the
// camera-facing grip is limited to raised wind-ups where the sleeve reads end-on.
const NOUS_GRIP_CAM = /^(?:whipB|launcher|bassDrop|healthSpecial|groundPound)_wind$/;
const NOUS_FIST_CAM = /^(?:backAttack_(?:active|follow)|juggle_active)$/;
const NOUS_OPEN = /^(?:grab_(?:wind|active|follow)|grabHold|grabbed|grabThrow_follow|laneThrow_follow|screenThrow_follow|jump|flinch|stagger|knockdownAir|wake|taunt|victory|hitReact_(?:wind|active))$/;
export function nousPresentation(short = '') {
  const v = {};
  if (NOUS_GRIP_CAM.test(short)) v.hand = 'grip_cam';
  if (NOUS_FIST_CAM.test(short)) v.hand_b = 'fist_cam';
  else if (NOUS_OPEN.test(short)) v.hand_b = 'open';
  return v;
}

export function installNousPolish(poses) {
  const set = (name, values) => {
    const v = nousPresentation(name);
    poses[PREFIX + name] = Object.keys(v).length ? { ...pose(values), __variants: v } : pose(values);
  };
  for (const [name, values] of Object.entries(states)) set(name, values);
  set('idle', states.idleA);
  // The existing contact classifier recognizes a `kick_` token as back-foot
  // support. Use these presentation aliases for held knees: ordinary `knee`
  // names remain available, but would plant both feet and turn a strike into a squat.
  const families = { ...moves, roll: moves.dodgeRoll, healthSpecial: moves.bassDrop, laneThrow: moves.grabThrow,
    kick_knee: moves.knee, kick_kneeFinal: moves.kneeFinal };
  for (const [move, frames] of Object.entries(families)) {
    ['wind', 'active', 'follow'].forEach((phase, i) => set(`${move}_${phase}`, frames[i]));
    // Keep a little of the outgoing shoulder/hip rotation as the guard returns.
    const settle = [...states.idleA];
    settle[0] = (states.idleA[0] * 3 + frames[2][0]) / 4;
    settle[2] = (states.idleA[2] * 3 + frames[2][2]) / 4;
    settle[10] = (states.idleA[10] * 3 + frames[2][10]) / 4;
    set(`${move}_recover`, settle);
  }
  return poses;
}
