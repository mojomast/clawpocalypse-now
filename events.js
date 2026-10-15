// Scripted events: the beats that make a level feel authored rather than spawned.
//
// Triggers are keyed by level and world x. When the player crosses one, the event
// fires once: enemies burst through a door, drop in from above, or walk in as an
// ambush, and the beat carries a dialogue line, a camera focus and a cue.
//
// Enemy AI and pacing stay with logic/collision (pipi); this module only stages
// spawns and the presentation beats around them.
//
// Iteration 9 (MR.INDIA, closing out iteration 5): every level now fields all
// eight segmented OpenClaw types (brawler, striker, blocker, thrower, charger,
// acrobat, skater goon, claw drone), waves rise in size between breathers, and
// each level has named scripted events (`event`): ambushBoth (from both sides),
// flyover (claw drones sweep across, then dive in), breach (wall/door blown
// open), gate (mini-boss / boss gate with a camera lock) and barks (speech
// bubbles over an enemy or the hero). Every fighting beat locks a short arena
// (camera held, player kept inside) until the wave is cleared, then a GO arrow
// points the way on.
import { WORLD_W, LEVELS, isWalkable } from './collision.js';
import { W, spawnPowerup } from './logic.js';
import { SUBWAY_TRIGGERS } from './subway-data.js'; // cheese: subway beats
import { HARBOR_TRIGGERS } from './harbor-data.js'; // mr_india: harbor beats
import { ARCADE_TRIGGERS } from './arcade-data.js'; // mr_india: arcade beats

const BAND = { 0: 363, 1: 358, 2: 358, 4: 384 };   // floor band top per level (LEVELS.md; 4 = tower)

// Radii and HP per enemy type, from MR.INDIA's MANIFEST.md behaviour notes
// (blockers are high HP, strikers low, chargers heavy, the rest mid). The drone
// values are the ones skate.js has always used (r 13, 1 HP). skate.js reads
// these tables too so a type has the same body on every level.
export const KIND_R = { boss: 26, skater: 15, foot: 14, runner: 11, trooper: 17, elite: 24, brawler: 17, striker: 14, blocker: 19, thrower: 16, charger: 22, acrobat: 15, drone: 13 };
export const KIND_HP = { boss: 16, skater: 2, foot: 1, runner: 1, trooper: 2, elite: 8, brawler: 2, striker: 1, blocker: 3, thrower: 2, charger: 4, acrobat: 2, drone: 1 };
export const SEGMENTED_KINDS = ['brawler', 'striker', 'blocker', 'thrower', 'charger', 'acrobat', 'skater', 'drone'];
export const SCRIPTED_EVENTS = ['ambushBoth', 'flyover', 'breach', 'gate', 'bark', 'hazardRun', 'roadblock'];

// Per level: x, type, and what the beat does. Pacing per ~5440px walking level
// (iteration 9): two rising waves (2 -> 3), breather (pizza), two bigger waves
// (3 -> 4), breather, the peak wave (5-6), then the gate fight at the end.
// `from`: door (just ahead), above (drop), right (ahead of camera), left
// (behind), both (split behind and ahead), sky (drone flyover from behind).
// `pickup`: drops a pizza (health) at spawnAt. `barks`: speech bubbles.
export const TRIGGERS = [
  // 0 sewer
  { level: 0, x: 300, type: 'doorBurst', kinds: ['brawler', 'striker'], spawnAt: 620, from: 'door', line: 'OpenClaw goons! They heard the pizza box.', cam: 620,
    barks: [{ who: 'enemy', text: 'Pizza for the overlords? Hand it over!' }] },
  { level: 0, x: 1000, type: 'ambush', event: 'ambushBoth', kinds: ['striker', 'skater', 'brawler'], spawnAt: 1450, from: 'both', line: 'Both ends of the tunnel — they boxed us in!',
    barks: [{ who: 'enemy', text: 'Nowhere to run, shell-back!' }] },
  { level: 0, x: 1600, type: 'breather', kinds: [], spawnAt: 1900, pickup: true, line: 'Quiet... grab that pizza.', barks: [{ who: 'hero', text: 'Pizza break!' }] },
  { level: 0, x: 2150, type: 'flyover', event: 'flyover', cue: 'dropIn', kinds: ['drone', 'drone', 'thrower'], spawnAt: 2450, from: 'sky', line: 'Claw drones in the pipes — Teknium, cover us!',
    barks: [{ who: 'hero', text: 'Drones! Heads down!' }] },
  { level: 0, x: 2800, type: 'setpiece', event: 'breach', cue: 'doorBurst', kinds: ['blocker', 'thrower', 'striker', 'brawler'], spawnAt: 3150, from: 'door', line: 'The flood gate bursts — shields up front!', cam: 3150 },
  { level: 0, x: 3500, type: 'breather', kinds: [], spawnAt: 3800, pickup: true, line: 'Nous Girl: the signal’s stronger this way.' },
  { level: 0, x: 4050, type: 'ambush', kinds: ['acrobat', 'blocker', 'skater', 'thrower', 'striker'], spawnAt: 3650, from: 'left', line: 'Behind us!',
    barks: [{ who: 'enemy', text: 'Surprise, turtles!' }] },
  // The gate trigger sits past the last crate (4942-5110) so the enforcer and
  // the hero never end up deadlocked on opposite sides of it.
  { level: 0, x: 5130, type: 'miniBoss', event: 'gate', kinds: ['charger', 'brawler', 'drone'], spawnAt: 5280, from: 'door', boss: { name: 'SEWER ENFORCER', hp: 10 }, line: 'OpenClaw enforcer. Watch the swings.', cam: 5100,
    banner: 'CLAW GATE — SEWER ENFORCER', barks: [{ who: 'enemy', text: 'This tunnel is CLOSED.' }] },
  // 1 street
  { level: 1, x: 300, type: 'ambush', kinds: ['brawler', 'skater'], spawnAt: 760, from: 'right', line: 'OpenClaw goons, rolling out of the alley.', cam: 640,
    barks: [{ who: 'enemy', text: 'Grind ’em into the curb!' }] },
  { level: 1, x: 1050, type: 'dropIn', kinds: ['acrobat', 'thrower', 'striker'], spawnAt: 1350, from: 'above', line: 'OpenClaw above the neon — heads up!' },
  { level: 1, x: 1650, type: 'breather', kinds: [], spawnAt: 1950, pickup: true, line: 'Rain and neon. The claw tower is over those rooftops.', cam: 1950 },
  { level: 1, x: 2300, type: 'flyover', event: 'flyover', cue: 'dropIn', kinds: ['drone', 'drone', 'skater'], spawnAt: 2600, from: 'sky', line: 'Claw drones sweeping the street!',
    barks: [{ who: 'hero', text: 'Incoming from the sky!' }] },
  { level: 1, x: 3000, type: 'setpiece', event: 'breach', cue: 'doorBurst', kinds: ['charger', 'thrower', 'thrower', 'striker'], spawnAt: 3350, from: 'door', line: 'The pawn shop shutter blows open!', cam: 3300,
    barks: [{ who: 'enemy', text: 'Closing time, turtles!' }] },
  { level: 1, x: 3650, type: 'breather', kinds: [], spawnAt: 3950, pickup: true, barks: [{ who: 'hero', text: 'Deep breath. Almost at the highway.' }] },
  { level: 1, x: 4200, type: 'ambush', event: 'ambushBoth', kinds: ['acrobat', 'blocker', 'brawler', 'thrower', 'skater', 'acrobat'], spawnAt: 4500, from: 'both', line: 'Fire escapes AND the alley — they’re everywhere!' },
  { level: 1, x: 4850, type: 'miniBoss', event: 'gate', kinds: ['charger', 'striker', 'striker', 'drone'], spawnAt: 5150, from: 'door', boss: { name: 'CLAW BRUISER', hp: 12 }, line: 'The Claw Bruiser blocks the road to the highway.', cam: 5100,
    banner: 'CLAW GATE — CLAW BRUISER', barks: [{ who: 'enemy', text: 'Highway’s closed. Permanently.' }] },
  // 2 rooftop
  { level: 2, x: 300, type: 'doorBurst', kinds: ['blocker', 'brawler'], spawnAt: 620, from: 'door', line: 'OpenClaw climbing the fire escape.', cam: 620 },
  { level: 2, x: 1000, type: 'ambush', kinds: ['thrower', 'thrower', 'striker'], spawnAt: 1450, from: 'right', line: 'Snipers on the water tower!',
    barks: [{ who: 'enemy', text: 'Lights out, green guys!' }] },
  { level: 2, x: 1650, type: 'breather', kinds: [], spawnAt: 1950, pickup: true, line: 'Catch your breath. The tower’s close.' },
  { level: 2, x: 2300, type: 'flyover', event: 'flyover', cue: 'dropIn', kinds: ['drone', 'drone', 'acrobat'], spawnAt: 2600, from: 'sky', line: 'Drone patrol off the claw tower!',
    barks: [{ who: 'hero', text: 'They own the sky up here!' }] },
  { level: 2, x: 3000, type: 'setpiece', event: 'breach', cue: 'doorBurst', kinds: ['charger', 'blocker', 'thrower', 'skater'], spawnAt: 3350, from: 'door', line: 'They blast through the stairwell wall!', cam: 3300 },
  { level: 2, x: 3650, type: 'breather', kinds: [], spawnAt: 3950, pickup: true, barks: [{ who: 'hero', text: 'Last slice before the top.' }] },
  { level: 2, x: 4200, type: 'ambush', event: 'ambushBoth', kinds: ['charger', 'striker', 'blocker', 'thrower', 'acrobat', 'skater'], spawnAt: 4500, from: 'both', line: 'Everything they’ve got — from both sides!',
    barks: [{ who: 'enemy', text: 'For the overlords!' }] },
  // The rooftop gate is a mini-boss now (OpenClaw Tower is the final level).
  { level: 2, x: 4850, type: 'miniBoss', event: 'gate', kinds: ['striker', 'acrobat', 'drone', 'drone'], spawnAt: 5200, from: 'door', boss: { name: 'SKY TALON', hp: 12 }, line: 'Sky Talon guards the bridge to the claw tower.', cam: 5100,
    banner: 'CLAW GATE — SKY TALON', barks: [{ who: 'enemy', text: 'Nobody reaches the overlord. NOBODY.' }] },
  // 4 OpenClaw Tower (baba_booey): lobby (tile 0) -> server floor (tile 1) ->
  // elevator ride (arena at the end of the server floor; tower.js runs the
  // climb and its extra drops) -> penthouse throne room (tile 2): SHREDCLAW.
  // Waves: 2 > 3 | breather | 3 > 4 > 4 | breather | 6 | final gate.
  { level: 4, x: 300, type: 'doorBurst', kinds: ['brawler', 'striker'], spawnAt: 640, from: 'door', line: 'OpenClaw Tower. The lobby guards heard us come in.', cam: 640,
    barks: [{ who: 'enemy', text: 'No pizza past the lobby!' }] },
  { level: 4, x: 1000, type: 'ambush', event: 'ambushBoth', kinds: ['skater', 'striker', 'blocker'], spawnAt: 1450, from: 'both', line: 'Security from both elevator banks!',
    barks: [{ who: 'hero', text: 'They locked the doors behind us!' }] },
  // Mid-level gate: the CLAW WALKER mech (boss.js MINI_BOSSES.mech, drawn by mech.js).
  { level: 4, x: 1300, type: 'miniBoss', event: 'gate', kinds: ['charger', 'brawler', 'striker'], spawnAt: 1640, from: 'door', boss: { name: 'CLAW WALKER', hp: 14 }, line: 'An OpenClaw mech walker guards the lobby lifts!', cam: 1400,
    banner: 'CLAW GATE — CLAW WALKER', barks: [{ who: 'enemy', text: 'INTRUDERS DETECTED. EXTERMINATE.' }] },
  { level: 4, x: 1650, type: 'breather', kinds: [], spawnAt: 1950, pickup: true, line: 'Nous Girl: their whole network runs through this server floor.' },
  { level: 4, x: 2150, type: 'flyover', event: 'flyover', cue: 'dropIn', kinds: ['drone', 'drone', 'thrower'], spawnAt: 2450, from: 'sky', line: 'Security drones off the server racks!',
    barks: [{ who: 'hero', text: 'Drones in the data center!' }] },
  { level: 4, x: 2500, type: 'setpiece', event: 'breach', cue: 'doorBurst', kinds: ['charger', 'blocker', 'thrower', 'acrobat'], spawnAt: 2900, from: 'door', line: 'They blow the server vault open!', cam: 2650,
    barks: [{ who: 'enemy', text: 'Firewall, meet fist!' }] },
  { level: 4, x: 3000, type: 'setpiece', event: 'elevator', cue: 'dropIn', kinds: ['acrobat', 'striker', 'thrower', 'skater'], spawnAt: 3200, from: 'above', line: 'Into the elevator. Next stop: the penthouse!', cam: 3240,
    banner: 'ELEVATOR — GOING UP', barks: [{ who: 'enemy', text: 'Going up? Not with us aboard!' }] },
  { level: 4, x: 3700, type: 'breather', kinds: [], spawnAt: 3950, pickup: true, barks: [{ who: 'hero', text: 'Penthouse. Last slice, then the overlord.' }] },
  { level: 4, x: 4150, type: 'ambush', kinds: ['charger', 'blocker', 'acrobat', 'thrower', 'skater', 'striker'], spawnAt: 3800, from: 'left', line: 'The overlord’s honor guard!',
    barks: [{ who: 'enemy', text: 'Kneel before the throne!' }] },
  { level: 4, x: 4650, type: 'boss', event: 'gate', kinds: ['boss'], spawnAt: 5080, from: 'door', line: 'SHREDCLAW. The overlord himself.', cam: 4893, banner: 'PENTHOUSE — SHREDCLAW',
    barks: [{ who: 'enemy', text: 'You brought ME pizza? How thoughtful.' }] },
  ...SUBWAY_TRIGGERS, // cheese: subway train beats (level 5, subway-data.js)
  ...HARBOR_TRIGGERS, // mr_india: harbor docks beats (level 6, harbor-data.js)
  ...ARCADE_TRIGGERS, // mr_india: arcade interior beats (level 7, arcade-data.js)
];

// Read-only plan of a walking level for checks and reports.
export function levelPlan(level) {
  const beats = TRIGGERS.filter(t => t.level === level);
  const kinds = [...new Set(beats.flatMap(t => t.kinds))].filter(k => SEGMENTED_KINDS.includes(k));
  const events = [];
  for (const t of beats) {
    if (t.event) events.push(t.event);
    if (t.barks && t.barks.length) events.push('bark');
  }
  return { kinds, events: [...new Set(events)], beats };
}

export function ensureEvents(state) {
  if (!state.events) {
    state.events = { fired: {}, line: null, camX: null, camT: 0, cooldown: 0, firedCount: 0, log: [], lock: null, go: null, barks: [], banner: null, flash: 0 };
  }
  const e = state.events;
  if (!e.barks) e.barks = [];
  return e;
}

function makeEnemy(kind, x, y, level, extra = {}) {
  const r = KIND_R[kind] || 14;
  const hp = KIND_HP[kind] || 1;
  return {
    kind, level, x, y, r, hp, maxHp: hp,
    vx: kind === 'runner' ? -110 : kind === 'trooper' ? -60 : -70,
    vy: 0, ...extra,
  };
}

function spawn(state, kind, x, level, from) {
  const r = KIND_R[kind] || 14;
  const bandTop = BAND[level] ?? 358;
  const y = bandTop + 20 + Math.random() * 40;
  const extra = {};
  if (from === 'above') { extra.z = 150 + Math.random() * 40; extra.launchV = -40; extra.spin = 3; }
  if (from === 'left' || from === 'right') extra.vx = from === 'left' ? 70 : -70;
  if (kind === 'drone') { extra.hover = 70; extra.flying = true; }
  state.ninjas.push(makeEnemy(kind, Math.min(WORLD_W - r, Math.max(r, x)), y, level, extra));
  return { kind, x, y };
}

// Arena for a fighting beat: the camera window the wave is fought in.
function arenaFor(state, t, level) {
  const width = (LEVELS[level] && LEVELS[level].width) || WORLD_W;
  const center = t.cam != null ? t.cam : (state.cameraX || 0) + W / 2;
  const L = Math.max(0, Math.min(width - W, center - W / 2));
  return { L, R: L + W };
}

// Where the trigger's i-th enemy enters, given the arena.
function entryX(t, i, arena) {
  if (t.from === 'both') {
    const k = i >> 1;
    return i % 2 === 0 ? arena.L - 50 - k * 70 : arena.R + 50 + k * 70;
  }
  if (t.from === 'sky') return t.kinds[i] === 'drone' ? arena.L - 60 - i * 90 : t.spawnAt + i * 70;
  return t.spawnAt + (t.from === 'left' ? -i : i) * 70;
}

const camOf = (state, e) => (e && e.camX != null ? Math.max(0, Math.min(WORLD_W - W, e.camX - W * 0.5)) : (state.cameraX || 0));

function loadPortrait(src) {
  if (!src) return null;
  if (PORTRAITS.has(src)) return PORTRAITS.get(src);
  const im = new Image();
  im.onload = () => { im.ready = true; };
  im.onerror = () => { im.failed = true; };
  im.src = src;
  PORTRAITS.set(src, im);
  return im;
}
function heroPortraitSrc(state) { const id = state?.selectedHero || state?.player?.selectedHero || 'turtle_purple'; return 'assets/heroes/portraits/' + id + '.png'; }
function enemyPortraitSrc(kind) {
  if (kind === 'boss' || kind === 'elite' || kind === 'charger') return 'assets/enemies/charger/charger_head.png';
  if (kind === 'drone') return 'assets/enemies/drone/drone_torso.png';
  if (kind && SEGMENTED_KINDS.includes(kind)) return 'assets/enemies/' + kind + '/' + kind + '_head.png';
  return 'assets/enemies/brawler/brawler_head.png';
}
function barkPortraitSrc(state, who, n) { return who === 'hero' ? heroPortraitSrc(state) : enemyPortraitSrc(n?.kind); }
function linePortraitSrc(t, state) {
  const low = (t.line || '').toLowerCase();
  if (/openclaw|goon|enforcer/i.test(low)) return enemyPortraitSrc(null);
  if (/overlord|shredclaw/i.test(low)) return enemyPortraitSrc('charger');
  return heroPortraitSrc(state);
}
const PORTRAITS = new Map();
function addBark(e, who, text, n, portrait) {
  e.barks.push({ who, text, n: n || null, portrait: portrait || null, t: 0, dur: Math.max(2.2, text.length * 0.06 + 0.8) });
}

// Advance the event system one frame: fire triggers the player has passed, run the
// dialogue/camera timers, and report spawned enemies to the caller.
export function stepEvents(state, dt) {
  const e = ensureEvents(state);
  const spawned = [];
  if (e.cooldown > 0) e.cooldown = Math.max(0, e.cooldown - dt);
  if (e.camT > 0) { e.camT = Math.max(0, e.camT - dt); if (e.camT === 0 && !e.lock) e.camX = null; }
  if (e.line) { e.line.t += dt; if (e.line.t >= e.line.dur) e.line = null; }
  if (e.flash > 0) e.flash = Math.max(0, e.flash - dt);
  if (e.banner) { e.banner.t += dt; if (e.banner.t >= e.banner.dur) e.banner = null; }
  if (e.go) { e.go.t += dt; if (e.go.t >= e.go.dur) e.go = null; }
  for (const b of e.barks) b.t += dt;
  e.barks = e.barks.filter(b => b.t < b.dur && !(b.n && b.n.dead));

  const level = state.level | 0;
  for (const t of TRIGGERS) {
    if (t.level !== level || state.level === 3) continue;
    const key = t.level + ':' + t.x;
    if (e.fired[key]) continue;
    if (state.player.x < t.x) continue;
    if (e.cooldown > 0 || e.lock) continue;
    e.fired[key] = true;
    e.firedCount += 1;
    e.cooldown = t.lineDur || 1.5; // baba_booey: a talk beat (lineDur) holds the next trigger until it has been read
    e.log.push({ type: t.type, level, x: t.x, at: Math.round(state.player.x), event: t.event || null, kinds: t.kinds.slice() });
    if (t.line) e.line = { speaker: t.speaker || null, text: t.line, portrait: t.portrait || linePortraitSrc(t, state), t: 0, dur: t.lineDur || Math.max(2.4, t.line.length * 0.055) };
    if (t.cam != null) { e.camX = t.cam; e.camT = 2.0; }
    const fighting = t.kinds.length > 0;
    const arena = fighting ? arenaFor(state, t, level) : null;
    const group = [];
    for (let i = 0; i < t.kinds.length; i++) {
      // Spread a group out (and off-screen for right/left/both entries).
      const at = entryX(t, i, arena);
      const from = t.from === 'both' ? (at < arena.L ? 'left' : 'right') : t.from;
      spawned.push(spawn(state, t.kinds[i], at, level, from));
      const n = state.ninjas[state.ninjas.length - 1];
      group.push(n);
      if (t.from === 'sky' && n.kind === 'drone') {
        // Flyover: sweep in high from behind the hero, then peel off and dive in.
        // (level cleared while airborne so floor props like crates don't block it).
        n.scripted = true; n.flyover = true; n.hover = 150; n.vx = 300; n.vy = 0; n.flyT = 0; n.level = null;
        n.peelAt = arena.R - 150 - i * 110;
      }
      if (i === 0 && t.boss) { n.elite = true; n.hp = n.maxHp = t.boss.hp; n.name = t.boss.name; n.scale = 1.25; n.levelBoss = true; }
      if (t.kinds[i] === 'boss') { n.levelBoss = true; n.name = 'SHREDCLAW'; n.scale = 1.5; state.bossSeen = true; }
    }
    for (const b of t.barks || []) {
      const target = group.find(n => n.kind !== 'drone') || group[0] || null;
      if (b.who === 'hero') addBark(e, 'hero', b.text, null, barkPortraitSrc(state, 'hero', null));
      else addBark(e, 'enemy', b.text, target, barkPortraitSrc(state, 'enemy', target) || barkPortraitSrc(state, b.portrait ? 'enemy' : 'enemy', target));
      e.log.push({ type: 'bark', who: b.who, level, x: t.x, text: b.text, portrait: b.portrait || null });
    }
    if (t.banner) e.banner = { text: t.banner, t: 0, dur: 2.2 };
    if (t.event === 'breach') e.flash = 0.35;
    if (fighting) {
      e.lock = { L: arena.L, R: arena.R, t: 0, key, gate: t.event === 'gate', final: t.type === 'boss' };
      e.go = null;
      e.log.push({ type: 'arenaLock', level, x: t.x, L: Math.round(arena.L) });
    }
    if (t.pickup) { spawnPowerup(state, { x: t.spawnAt, y: (BAND[level] ?? 358) + 40 }, () => 0.99); state.powerups[state.powerups.length - 1].type = 'life'; }
    if (state.eventCue) state.eventCue(t.cue || t.type, { x: t.spawnAt, y: BAND[level], level, kinds: t.kinds, line: t.line, event: t.event || null });
  }
  // Drone flyover: scripted drones cross the arena, then join the fight.
  for (const n of state.ninjas) {
    if (!n.flyover || n.dead) continue;
    n.vy = 0; n.vx = 300; n.flyT = (n.flyT || 0) + dt;
    if (n.x >= n.peelAt || n.flyT > 5) { n.flyover = false; n.scripted = false; n.hover = 70; n.vx = 0; n.level = level; }
  }
  // Arena lock: the camera holds on the arena and the hero stays inside it until
  // the wave is down; then a GO arrow points on. A long stall (an enemy stuck
  // somewhere unreachable) releases the lock rather than soft-locking the run.
  if (e.lock && state.walkLevel) {
    const lk = e.lock;
    lk.t += dt;
    e.camX = lk.L + W / 2; e.camT = 0;
    const p = state.player;
    p.x = Math.max(lk.L + 30, Math.min(lk.R - 30, p.x));
    // Stragglers outside the arena (ranged types holding their distance, late
    // entries) walk in, so every wave is fought on screen.
    for (const n of state.ninjas) {
      if (n.dead || n.flyover || n.grabbed) continue;
      const was = n.x;
      if (n.x < lk.L + 24) n.x = Math.min(lk.L + 24, n.x + 160 * dt);
      else if (n.x > lk.R - 24) n.x = Math.max(lk.R - 24, n.x - 160 * dt);
      // mr_india (soak t_6935cafade474eaa): an arena edge inside a crate pinned a straggler against it (pulled in,
      // pushed back out by the obstacle, for the whole 75 s lock). If the way in is blocked, slide along the
      // obstacle toward the nearest open lane so the pull can finish.
      if (n.x !== was && !(n.z > 0) && LEVELS[level] && !isWalkable(level, n.x, n.y, n.r || 16)) {
        for (let d = 8; d <= 160; d += 8) {
          if (isWalkable(level, n.x, n.y + d, n.r || 16)) { n.y += Math.min(d, 160 * dt); break; }
          if (isWalkable(level, n.x, n.y - d, n.r || 16)) { n.y -= Math.min(d, 160 * dt); break; }
        }
      }
    }
    const live = state.ninjas.some(n => !n.dead);
    if (!live || lk.t > 75) {
      e.log.push({ type: live ? 'lockTimeout' : 'arenaClear', level, x: Math.round(lk.L), t: +lk.t.toFixed(1) });
      e.lock = null; e.camX = null;
      if (!lk.final) { e.go = { t: 0, dur: 2.6 }; e.log.push({ type: 'go', level, x: Math.round(p.x) }); }
    }
  } else if (e.lock && !state.walkLevel) { e.lock = null; e.camX = null; }
  // Once an enemy has been on screen it stays on screen, so ranged types can be cornered.
  if (state.hpMode && state.walkLevel) {
    const cam = camOf(state, e);
    for (const n of state.ninjas) {
      if (n.dead || n.grabbed || n.flyover) continue;
      if (n.onScreen) n.x = Math.max(cam + 24, Math.min(cam + 716, n.x));
      else if (n.x > cam + 24 && n.x < cam + 716) n.onScreen = true;
    }
  }
  // Level end (hpMode walking levels): every beat fired, the road clear and the
  // hero at the far end -> release the wave hold so logic starts the next level.
  // Iteration 8: once the final boss is down the run is over; the ending
  // cinematic takes it from here, so the level end must not release the next
  // (sewer) wave.
  if (state.bossSeen && !state.ninjas.some(n => n.kind === 'boss' && !n.dead)) { state.runComplete = true; state.holdWave = true; }
  if (state.hpMode && state.holdWave && state.walkLevel && !state.runComplete && !state.ninjas.some(n => !n.dead)) {
    const all = TRIGGERS.filter(t => t.level === level).every(t => e.fired[t.level + ':' + t.x]);
    const width = (LEVELS[level] && LEVELS[level].width) || WORLD_W;
    if (all && state.player.x > width - 420) { state.holdWave = false; state.walkLevel = false; state.levelsDone = (state.levelsDone || 0) + 1; e.log.push({ type: 'levelEnd', level }); e.go = null; e.barks = []; }
  }
  return spawned;
}

// Drawing a portrait into a circular chip makes every bubble a small identity
// card instead of anonymous text: the speaker leadsm reads in the corner of the
// player's eye before they have time to parse the line.
function portrait(ctx, x, y, size, src, hero) {
  ctx.save();
  roundPath(ctx, x, y, size, size, size * 0.35);
  ctx.clip();
  const im = src ? loadPortrait(src) : null;
  if (im && im.ready && im.width) {
    const scale = Math.max(size / im.width, size / im.height);
    const dw = im.width * scale, dh = im.height * scale;
    ctx.drawImage(im, x + (size - dw) / 2, y + (size - dh) / 2, dw, dh);
  } else {
    ctx.fillStyle = hero ? 'rgba(47,143,58,0.75)' : 'rgba(198,40,40,0.75)';
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = 'bold 15px monospace'; ctx.textAlign = 'center';
    ctx.fillText((hero ? 'H' : 'C') , x + size / 2, y + size / 2 + 5);
  }
  ctx.restore();
  ctx.save();
  roundPath(ctx, x, y, size, size, size * 0.35);
  ctx.lineWidth = 2;
  ctx.strokeStyle = hero ? '#9cf4a0' : '#ff8a8a'; ctx.stroke();
  ctx.restore();
}
function roundPath(ctx, x, y, w, h, r) {
  const s = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + s, y);
  ctx.arcTo(x + w, y, x + w, y + h, s);
  ctx.arcTo(x + w, y + h, x, y + h, s);
  ctx.arcTo(x, y + h, x, y, s);
  ctx.arcTo(x, y, x + w, y, s);
  ctx.closePath();
}
function bubble(ctx, x, y, text, hero, portraitSrc) {
  ctx.font = 'bold 13px monospace';
  const portraitSize = 30;
  const maxText = Math.min(220, Math.max(120, ctx.measureText(text).width + 18));
  const w = maxText + (portraitSrc ? portraitSize + 10 : 0) + 12;
  const h = Math.max(28, Math.ceil((ctx.measureText(text).width + 10) / (maxText - 10)) * 18 + 12);
  const bx = Math.max(6, Math.min(W - w - 6, x - w / 2)), by = Math.max(70, y - h);
  ctx.fillStyle = hero ? 'rgba(232,255,236,0.96)' : 'rgba(255,240,240,0.96)';
  roundPath(ctx, bx, by, w, h, 8);
  ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = hero ? '#2f8f3a' : '#c62828'; ctx.stroke();
  const tc = hero ? '#1b3b25' : '#3a1212';
  const tx = bx + 8 + (portraitSrc ? portraitSize + 6 : 0); // was `portrait + 6` (the function) -> NaN, bark text vanished
  if (portraitSrc) portrait(ctx, bx + 6, by + (h - portraitSize) / 2, portraitSize, portraitSrc, hero);
  ctx.fillStyle = tc; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.font = 'bold 12px monospace';
  const words = text.split(/\s+/); let line = '', lineY = by + h / 2, lineHeight = 14, lines = [];
  for (const word of words) {
    const next = line ? line + ' ' + word : word;
    if (ctx.measureText(next).width > w - (portraitSrc ? portraitSize + 18 : 16)) { lines.push(line); line = word; }
    else line = next;
  }
  if (line) lines.push(line);
  lines = lines.slice(0, 2);
  if (lineCount(lines) > 1) lineY = by + 9;
  lineY = by + (h - lines.length * lineHeight) / 2 + lineHeight / 2;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], tx, lineY + i * lineHeight, w - (portraitSrc ? portraitSize + 18 : 16));
  }
  const edgeX = Math.max(bx + 8, Math.min(bx + w - 8, x));
  ctx.fillStyle = hero ? 'rgba(232,255,236,0.96)' : 'rgba(255,240,240,0.96)';
  ctx.beginPath(); ctx.moveTo(edgeX - 5, by + h); ctx.lineTo(edgeX, by + h + 8); ctx.lineTo(edgeX + 5, by + h); ctx.closePath(); ctx.fill();
}
function lineCount(lines) { return lines.length; }

// Dialogue overlay: a letterboxed line at the bottom, as a beat, not a window.
// Iteration 9 adds speech-bubble barks, the gate banner, the breach flash and
// the GO arrow after a cleared arena.
export function drawEventOverlay(ctx, state, W, H) {
  const e = state.events;
  if (!e) return;
  ctx.save();
  if (e.flash > 0) { ctx.fillStyle = `rgba(255,244,214,${Math.min(0.7, e.flash * 2)})`; ctx.fillRect(0, 0, W, H); }
  const cam = state.level === 3 || Number.isFinite(state.cameraX) ? (state.cameraX || 0) : camOf(state, e); // baba_booey: bubbles ride the shown (smoothed) camera
  for (const b of e.barks || []) {
    const a = Math.min(1, b.t / 0.15, (b.dur - b.t) / 0.3);
    ctx.globalAlpha = Math.max(0, a);
    const who = b.who === 'hero' ? state.player : b.n;
    if (!who) continue;
    const top = who.y - (who.z || 0) - (who.hover || 0) - 63 * 2 * (who.scale || 1) - 16;
    bubble(ctx, who.x - cam, top, b.text, b.who === 'hero', b.portrait);
  }
  ctx.globalAlpha = 1;
  if (e.banner) {
    const { text, t, dur } = e.banner;
    const a = Math.max(0, Math.min(1, t / 0.2, (dur - t) / 0.4));
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(120,0,0,0.75)'; ctx.fillRect(0, 118, W, 40);
    ctx.fillStyle = '#ffeb57'; ctx.font = 'bold 22px monospace'; ctx.textAlign = 'center';
    ctx.fillText(text, W / 2, 146);
    ctx.globalAlpha = 1;
  }
  if (e.go && Math.floor(e.go.t * 4) % 2 === 0) {
    const x = W - 120, y = 210;
    ctx.fillStyle = '#ffeb57'; ctx.strokeStyle = '#000'; ctx.lineWidth = 4;
    ctx.font = 'bold 44px monospace'; ctx.textAlign = 'center';
    ctx.strokeText('GO', x, y); ctx.fillText('GO', x, y);
    ctx.beginPath(); ctx.moveTo(x - 40, y + 14); ctx.lineTo(x + 20, y + 14); ctx.lineTo(x + 20, y + 2); ctx.lineTo(x + 56, y + 28);
    ctx.lineTo(x + 20, y + 54); ctx.lineTo(x + 20, y + 42); ctx.lineTo(x - 40, y + 42); ctx.closePath(); ctx.stroke(); ctx.fill();
  }
  if (e.line) {
    const { text, t, dur, portrait, speaker } = e.line;
    const a = Math.min(1, Math.min(t / 0.25, (dur - t) / 0.4));
    ctx.globalAlpha = Math.max(0, a);
    ctx.fillStyle = 'rgba(0,0,0,0.62)';
    ctx.fillRect(0, H - 76, W, 52);
    if (portrait) {
      const im = loadPortrait(portrait);
      if (im && im.ready && im.width) {
        const s = 34, scale = Math.max(s / im.width, s / im.height);
        ctx.drawImage(im, (W - s) / 2 - 170, H - 68 + (s - im.height * scale) / 2, im.width * scale, im.height * scale, (W - s) / 2 - 170, H - 68, s, s);
      }
      ctx.save(); ctx.strokeStyle = speaker === 'enemy' ? '#ff8a8a' : '#9cf4a0'; ctx.lineWidth = 2;
      roundPath(ctx, (W - 34) / 2 - 170, H - 68, 34, 34, 8); ctx.stroke(); ctx.restore();
    }
    ctx.fillStyle = '#ffeb57';
    ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center';
    if (speaker) ctx.fillText(String(speaker).toUpperCase(), W / 2, H - 58);
    ctx.font = 'bold 18px monospace';
    ctx.fillText(text, W / 2, H - 36, W - 180);
  }
  ctx.restore();
  ctx.textAlign = 'left';
}

// Read-only summary for verification.
export function eventsInfo(state) {
  const e = ensureEvents(state);
  return { fired: e.firedCount, log: e.log.slice(), line: e.line ? e.line.text : null, camX: e.camX, lock: e.lock ? { L: e.lock.L, R: e.lock.R } : null, go: !!e.go, barks: e.barks.map(b => b.text), banner: e.banner ? e.banner.text : null };
}
