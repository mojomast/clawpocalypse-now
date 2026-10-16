// Run: node --experimental-default-type=module tests/check-levels.mjs
import assert from 'node:assert/strict';
import { actorDepth, drawDepthEntries } from '../layout-render.js';
import { createArcade, ensureArcade } from '../arcade.js';
import { ARCADE_LEVEL, CABINETS, CABINET_BASES } from '../arcade-data.js';
import { HARBOR_LEVEL, HARBOR_PROPS } from '../harbor-data.js';
import { LEVELS, TILE_W, isWalkable, resolveWalkable, moveWalkable } from '../collision.js';
import { placementsFor, propObstacles } from '../props.js';
import { createBreakables, BREAKABLE } from '../breakables.js';
import { TRIGGERS, KIND_R, stepEvents, ensureEvents } from '../events.js';
import { SKATE, BEATS, laneY, stepSkate } from '../skate.js';
import { createState, spawnWave, LEVEL_ORDER } from '../logic.js';
import { createCoop } from '../coop.js';
import { createSubway, HAZARD, onRoof, stationAt } from '../subway.js';
import { SUBWAY_ROOF, SUBWAY_STATIONS, SUBWAY_BOSS } from '../subway-data.js';
import { createHarbor, inWet } from '../harbor.js';
import { CRANES, CRANE, WET_ZONES, HARBOR_BOSS } from '../harbor-data.js';
import { ARCADE_BOSS } from '../arcade-data.js';
import { createTower, ELEVATOR_KEY, ELEVATOR_DROPS, FLOORS } from '../tower.js';

assert.equal(LEVELS.length, 8);
{
  const calls = [], actor = (name, y, r, z = 0) => ({ name, y: actorDepth({ y, r, z }), draw: () => calls.push(name) });
  const entries = [actor('P1 airborne', 420, 16, 120), { y: 425, draw: () => calls.push('crate') },
    actor('boss', 400, 23), actor('P2', 408, 16), actor('enemy', 430, 14),
    { y: 452, draw: () => calls.push('front barrel') }];
  drawDepthEntries(entries);
  assert.deepEqual(calls, ['boss', 'P2', 'crate', 'P1 airborne', 'enemy', 'front barrel']);
  assert.equal(new Set(calls).size, entries.length, 'each actor/object advances/draws once');
  assert.equal(entries[0].name, 'P1 airborne', 'sorting does not mutate caller queue');
}
// Every newly solid cabinet has an art-aligned foot, and destruction/restoration
// keeps the obstacle object (not an accumulating duplicate) across fresh runs.
{
  const arcade = createArcade({ rand: () => 0.5 });
  const s = { level: 7, wave: 1, hpMode: true, player: { x: 80, y: 423, r: 16 }, pizzas: [], score: 0 };
  const a = ensureArcade(s);
  for (const [i, cab] of a.cabs.entries()) {
    const ob = cab.ob;
    assert.equal(ob.x, CABINETS[i] - 32);
    assert.equal(ob.y + ob.h, CABINET_BASES[i]);
    for (let hit = 0; hit < 3; hit++) {
      s.pizzas = [{ x: cab.x, y: cab.baseY - 7, vx: 1 }]; arcade.step(s, 0);
    }
    assert.ok(cab.broken && ob.x < -1e5 && ARCADE_LEVEL.obstacles.includes(ob));
    assert.ok(a.tickets.every(t => t.y >= 410 && t.y <= 440));
  }
  assert.equal(a.smashed, CABINETS.length);
  ensureArcade({ ...s, arcade: undefined });
  assert.ok(ARCADE_LEVEL.obstacles.every((o, i) => o.x === CABINETS[i] - 32));
  const solids = HARBOR_PROPS.filter(p => p[3]);
  assert.equal(HARBOR_LEVEL.obstacles.length, solids.length);
  solids.forEach(([name, x, y, w, h], i) => {
    const o = HARBOR_LEVEL.obstacles[i];
    assert.deepEqual([o.x, o.y, o.w, o.h], [x - w / 2, y - h, w, h], `${name} harbor art footprint`);
  });
}
const radius = 16;
let routes = 0;
let encounters = 0;
for (const [index, level] of LEVELS.entries()) {
  if (level.auto) continue;
  const label = `${index}:${level.id}`;
  assert.ok(level.width > 0 && level.walkables.length, `${label} needs a walk band`);
  // Test both ends and the center of spawnY's advertised range; some spawns
  // require resolution at the radius inset or against a prop footprint.
  for (const random of [0, 0.5, 1]) {
    const y = level.spawnY(() => random);
    const resolved = resolveWalkable(level, 80, y, radius);
    assert.ok(isWalkable(level, resolved.x, resolved.y, radius), `${label} spawn ${random} must resolve`);
    assert.ok(Math.abs(resolved.x - 80) < 20 && Math.abs(resolved.y - y) < 40, `${label} spawn ${random} displaced too far`);
  }
  // Flood fill the body's actual radius-aware free space, from the opening
  // spawn to the exit. No magic obstacle coordinates: this sees live map edits.
  const step = 4, minY = Math.floor(Math.min(...level.walkables.map(b => b.y)) / step) * step;
  const maxY = Math.ceil(Math.max(...level.walkables.map(b => b.y + b.h)) / step) * step;
  const rows = Math.round((maxY - minY) / step) + 1;
  const cols = Math.ceil(level.width / step) + 1;
  const origin = resolveWalkable(level, 80, level.spawnY(() => 0.5), radius);
  const startX = Math.round(origin.x / step), startY = Math.round((origin.y - minY) / step);
  const start = startX * rows + startY, seen = new Uint8Array(cols * rows), queue = [start];
  seen[start] = 1;
  let exit = false;
  for (let head = 0; head < queue.length && !exit; head++) {
    const id = queue[head], cx = Math.floor(id / rows), cy = id % rows;
    if (cx * step >= level.width - radius - step * 2) { exit = true; break; }
    for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
      const next = nx * rows + ny;
      if (seen[next] || !isWalkable(level, nx * step, minY + ny * step, radius)) continue;
      seen[next] = 1; queue.push(next);
    }
  }
  assert.ok(exit, `${label}: radius-${radius} route from spawn to exit is disconnected`);
  routes++;
}

const skate = LEVELS.find(l => l.id === 'skate');
assert.ok(skate?.auto && skate.walkables.length, 'skate has an auto-scrolling walk lane');
assert.ok(SKATE.length > 0 && SKATE.speed > 0 && SKATE.band[0] < SKATE.band[1]);
for (const f of [0, 0.5, 1]) {
  const y = laneY(f);
  assert.ok(y >= SKATE.band[0] && y <= SKATE.band[1], `skate laneY(${f}) inside rendered road`);
  for (const x of [0, SKATE.length / 2, SKATE.length]) {
    const lane = resolveWalkable(skate, x, y, radius);
    assert.ok(isWalkable(skate, lane.x, lane.y, radius) && Math.abs(lane.y - y) <= 2,
      `skate ${x},${y} resolves near rendered lane`);
    assert.ok(lane.allowed, 'all skate lane targets are radius-clear without correction');
    const spawned = resolveWalkable(skate, x, skate.spawnY(() => f), radius);
    assert.ok(isWalkable(skate, spawned.x, spawned.y, radius), `skate spawn ${f} resolves at distance ${x}`);
  }
}
assert.ok(BEATS.length > 0 && BEATS.every((b, i) => b.at >= 0 && b.at <= SKATE.length && (!i || b.at > BEATS[i - 1].at)), 'skate beats progress through the road');
for (const beat of BEATS) for (const [kind, fraction] of beat.obstacles || []) {
  assert.ok(['cone', 'barrier'].includes(kind) && fraction >= 0 && fraction <= 1 &&
    isWalkable(skate, Math.max(80, beat.at), laneY(fraction), radius), `skate obstacle ${beat.at} occupies a usable lane`);
}
const ss = createState();
ss.level = LEVELS.indexOf(skate); ss.skateStart = true;
stepSkate(ss, 0);
assert.ok(ss.skate && ss.skate.beat >= 1 && isWalkable(skate, ss.player.x, ss.player.y, ss.player.r), 'skate initializes player in static lane');
const priorX = ss.player.x;
stepSkate(ss, 0.5);
assert.ok(ss.player.x > priorX && ss.cameraX > 0 && isWalkable(skate, ss.player.x, ss.player.y, ss.player.r), 'auto-scroll carries player on road');

// Event entries are not always on-screen (both-sides and flyovers arrive beyond
// the arena), but their authored spawnAt must have a nearby valid body center.
const bosses = { subway: SUBWAY_BOSS, harbor: HARBOR_BOSS, arcade: ARCADE_BOSS };
// Exercise real creation paths, not just whether a hypothetical spawn resolves.
for (const [index, lv] of LEVELS.entries()) {
  if (lv.auto) continue;
  const s = createState(); s.hpMode = true; s.wave = LEVEL_ORDER.indexOf(index);
  spawnWave(s, () => 1);
  assert.equal(s.level, index);
  for (const actor of [s.player, ...s.ninjas]) assert.ok(isWalkable(index, actor.x, actor.y, actor.r), `${lv.id} initial actor spawns clear`);
  const coop = createCoop(); coop.join(s, 'turtle_blue');
  assert.ok(isWalkable(index, coop.p2.player.x, coop.p2.player.y, coop.p2.player.r), `${lv.id} co-op joins clear`);
}
const originalRandom = Math.random;
try {
  for (const value of [0, 0.5, 0.999999]) {
    Math.random = () => value;
    for (const trigger of TRIGGERS) {
      if (LEVELS[trigger.level]?.auto) continue;
      const s = createState(); s.level = trigger.level; s.hpMode = true; s.walkLevel = true; s.ninjas = [];
      s.player.x = trigger.x;
      const e = ensureEvents(s);
      for (const other of TRIGGERS) if (other !== trigger) e.fired[`${other.level}:${other.x}`] = true;
      stepEvents(s, 0);
      assert.equal(s.ninjas.length, trigger.kinds.length, 'actual scripted group spawned');
      for (const n of s.ninjas) assert.ok(isWalkable(trigger.level, n.x, n.y, n.r), `${trigger.level}:${trigger.x} actual ${n.kind} radius ${n.r} spawn clear`);
    }
  }
} finally { Math.random = originalRandom; }
for (const trigger of TRIGGERS) {
  const level = LEVELS[trigger.level];
  if (!level || level.auto) continue;
  assert.ok(trigger.spawnAt >= 0 && trigger.spawnAt <= level.width, `${level.id}:${trigger.x} spawnAt in world`);
  const radii = new Set([radius, ...(trigger.kinds || []).map(k => KIND_R[k] || radius)]);
  if (trigger.boss) radii.add(bosses[level.id]?.r || (trigger.kinds?.[0] && KIND_R[trigger.kinds[0]]) || 22);
  for (const r of radii) for (const f of [0, 0.5, 1]) {
    const y = level.spawnY(() => f);
    const pos = resolveWalkable(level, trigger.spawnAt, y, r);
    assert.ok(isWalkable(level, pos.x, pos.y, r), `${level.id}:${trigger.x} spawnAt radius ${r} must resolve`);
    assert.ok(Math.abs(pos.x - trigger.spawnAt) <= 100 && Math.abs(pos.y - y) <= 80,
      `${level.id}:${trigger.x} radius ${r} spawn displaced excessively (${pos.x},${pos.y})`);
    encounters++;
  }
}
for (const [id, boss] of Object.entries(bosses)) {
  const level = LEVELS.find(l => l.id === id);
  const gate = TRIGGERS.filter(t => t.level === LEVELS.indexOf(level) && t.boss).at(-1);
  assert.ok(gate && boss.r >= 20, `${id} has a boss gate`);
  const pos = resolveWalkable(level, gate.spawnAt, level.spawnY(() => 0.5), boss.r);
  assert.ok(isWalkable(level, pos.x, pos.y, boss.r), `${id} boss radius ${boss.r} fits at gate`);
}

// Subway signals belong to the moving train, not the static collision map.
// Validate their roof/station boundaries and both warned and active phases.
const subway = LEVELS.find(l => l.id === 'subway');
assert.ok(SUBWAY_ROOF.x0 > 0 && SUBWAY_ROOF.x1 < subway.width && SUBWAY_ROOF.x1 > SUBWAY_ROOF.x0);
assert.ok(onRoof((SUBWAY_ROOF.x0 + SUBWAY_ROOF.x1) / 2) && !onRoof(SUBWAY_ROOF.x0) && !onRoof(SUBWAY_ROOF.x1));
for (const station of SUBWAY_STATIONS) {
  assert.ok(station.x0 < station.x1 && station.x0 >= 0 && station.x1 <= subway.width);
  assert.ok(stationAt((station.x0 + station.x1) / 2) >= 0);
}
assert.ok(HAZARD.warn > 0 && HAZARD.every[0] > HAZARD.warn && HAZARD.lowClearZ > 0);
for (const kind of ['low', 'high']) for (const safe of [false, true]) {
  const engine = createSubway({ forceDuck: kind === 'high' && safe });
  const s = createState();
  s.level = LEVELS.indexOf(subway); s.wave = 1; s.hpMode = true;
  s.player.x = (SUBWAY_ROOF.x0 + SUBWAY_ROOF.x1) / 2;
  s.player.y = resolveWalkable(subway, s.player.x, subway.spawnY(() => 0.5), s.player.r).y;
  s.cameraX = s.player.x - 300;
  s.events = { log: [{ level: s.level, event: 'hazardRun' }], lock: null };
  engine.step(s, 0); // initialize the run without advancing the warning clock
  s.subway.next = 0.01;
  engine.step(s, 0.1);
  const h = s.subway.hz[0];
  assert.ok(h && h.warn > 0 && !h.passed, `subway ${kind}: hazard telegraphs before contact`);
  h.kind = kind; h.x = s.player.x;
  s.player.z = kind === 'low' && safe ? HAZARD.lowClearZ + 1 : 0;
  engine.step(s, Math.min(0.2, h.warn / 2));
  assert.equal(s.hp, s.maxHp, `subway ${kind}: warning cannot damage`);
  engine.step(s, HAZARD.warn);
  engine.step(s, 0.01);
  assert.ok(h.passed, `subway ${kind}: signal crosses player`);
  assert.equal(s.hp, s.maxHp - (safe ? 0 : HAZARD.dmg), `subway ${kind}: ${safe ? 'avoid' : 'hit'} outcome`);
}
{
  const engine = createSubway();
  const s = createState();
  s.level = LEVELS.indexOf(subway); s.wave = 1;
  s.player.x = (SUBWAY_ROOF.x0 + SUBWAY_ROOF.x1) / 2;
  s.cameraX = s.player.x - 300;
  s.events = { log: [{ level: s.level, event: 'hazardRun' }], lock: null };
  engine.step(s, HAZARD.warn + 0.5); // spawn timer elapses within this long frame
  const h = s.subway.hz[0];
  assert.ok(h && h.warn === HAZARD.warn && !h.passed && s.hp === s.maxHp,
    'new subway hazard keeps its full warning on a long spawning frame');
  engine.step(s, 0.1);
  assert.ok(h.warn < HAZARD.warn && h.warn > 0, 'subway warning starts aging on the following tick');
}

// Harbor cranes should telegraph, land once, and admit dodging. Wet zones
// must describe reachable floor without changing the static collision map.
const harbor = LEVELS.find(l => l.id === 'harbor');
for (const zone of WET_ZONES) {
  assert.ok(zone.x0 >= 0 && zone.x0 < zone.x1 && zone.x1 <= harbor.width);
  assert.ok(inWet((zone.x0 + zone.x1) / 2) && !inWet(zone.x0 - 1));
  const mid = (zone.x0 + zone.x1) / 2;
  const pos = resolveWalkable(harbor, mid, harbor.spawnY(() => 0.5), radius);
  assert.ok(isWalkable(harbor, pos.x, pos.y, radius) && Math.abs(pos.x - mid) < 80, 'wet planks on reachable floor');
}
assert.ok(CRANE.telegraph > 0 && CRANE.fall > 0 && CRANE.cd > CRANE.telegraph + CRANE.fall);
for (const cx of CRANES) {
  const pos = resolveWalkable(harbor, cx, harbor.spawnY(() => 0.5), radius);
  assert.ok(cx >= 0 && cx <= harbor.width && isWalkable(harbor, pos.x, pos.y, radius) && Math.abs(pos.x - cx) < CRANE.reach,
    `harbor crane ${cx} targets a playable area`);
}
for (const dodge of [false, true]) {
  const engine = createHarbor();
  const s = createState();
  s.level = LEVELS.indexOf(harbor); s.wave = 1; s.hpMode = true; s.combat = { moving: false };
  const target = resolveWalkable(harbor, CRANES[0], harbor.spawnY(() => 0.5), s.player.r);
  Object.assign(s.player, target);
  engine.step(s, 0.05);
  const drop = s.harbor.drops[0];
  assert.ok(drop && !drop.landed && drop.t < CRANE.telegraph, 'harbor crane creates warning');
  engine.step(s, CRANE.telegraph / 2);
  assert.equal(s.hp, s.maxHp, 'harbor telegraph cannot damage');
  if (dodge) {
    const away = resolveWalkable(harbor, target.x + CRANE.radius + s.player.r + 50, target.y, s.player.r);
    Object.assign(s.player, away);
    assert.ok(Math.abs(s.player.x - drop.x) > CRANE.radius + s.player.r, 'dodge leaves impact radius');
  }
  engine.step(s, CRANE.telegraph + CRANE.fall);
  assert.ok(drop.landed, 'harbor drop eventually lands');
  assert.equal(s.hp, s.maxHp - (dodge ? 0 : CRANE.dmg), `harbor ${dodge ? 'dodge' : 'impact'} outcome`);
  engine.step(s, 0.05);
  assert.equal(s.hp, s.maxHp - (dodge ? 0 : CRANE.dmg), 'landing only deals damage once');
}
{
  const engine = createHarbor();
  const s = createState();
  s.level = LEVELS.indexOf(harbor); s.wave = 1; s.hpMode = true; s.combat = { moving: false };
  Object.assign(s.player, resolveWalkable(harbor, CRANES[0], harbor.spawnY(() => 0.5), s.player.r));
  engine.step(s, CRANE.telegraph + CRANE.fall + 0.5);
  const drop = s.harbor.drops[0];
  assert.ok(drop && drop.t === 0 && !drop.landed && s.hp === s.maxHp,
    'new harbor crane drop keeps its full telegraph and cannot hit on a long spawning frame');
  engine.step(s, CRANE.telegraph / 2);
  assert.ok(!drop.landed && s.hp === s.maxHp, 'existing harbor warning advances on the next tick');
  engine.step(s, CRANE.telegraph + CRANE.fall);
  assert.ok(drop.landed && s.hp === s.maxHp - CRANE.dmg, 'existing harbor drop still lands once warning expires');
}
{
  // Find an actual solid prop inside a wet zone with clear ground on both sides:
  // an endpoint-only move would appear to clear it during a laggy slide frame.
  const band = harbor.walkables[0], speed = 400, dt = 0.6, clearance = radius + 1;
  const candidate = harbor.obstacles.map(ob => {
    const x = ob.x - 120;
    const y = Math.max(band.y + clearance, Math.min(ob.y + ob.h, band.y + band.h - clearance));
    return { ob, x, y };
  }).find(({ ob, x, y }) => inWet(x) && isWalkable(harbor, x, y, radius) &&
    !isWalkable(harbor, ob.x + ob.w / 2, y, radius) && isWalkable(harbor, x + speed * dt, y, radius));
  assert.ok(candidate, 'harbor has a wet-zone solid blocker for swept slide regression');
  const { ob, x, y } = candidate;
  const s = createState();
  s.level = LEVELS.indexOf(harbor); s.wave = 1; s.hpMode = true; s.combat = { moving: false };
  Object.assign(s.player, { x, y });
  const engine = createHarbor();
  engine.step(s, 0); // initialize the same run without moving
  s.harbor.sv = speed;
  engine.step(s, dt);
  assert.ok(s.player.x > x && s.player.x < ob.x - clearance && isWalkable(harbor, s.player.x, s.player.y, radius),
    'wet slide stops at solid prop rather than tunneling through at high dt');
  assert.equal(s.harbor.sv, 0, 'impact cancels wet momentum');

  const free = createState();
  free.level = s.level; free.wave = 1; free.hpMode = true; free.combat = { moving: false };
  Object.assign(free.player, { x, y });
  const freeEngine = createHarbor();
  freeEngine.step(free, 0);
  free.harbor.sv = 100;
  freeEngine.step(free, 0.1);
  assert.ok(Math.abs(free.player.x - (x + 10)) < 0.01 && free.harbor.sv > 0,
    'unobstructed wet slide retains momentum and normal distance');
}

// Tower elevator inserts its own two waves after the scripted opening wave.
const tower = LEVELS.find(l => l.id === 'tower');
const elevator = createTower({ rand: () => 0.5 });
const ts = createState(), lock = { L: TILE_W + 700, R: TILE_W + 1440, t: 0, key: ELEVATOR_KEY };
ts.level = LEVELS.indexOf(tower); ts.events = { lock, log: [], go: null };
elevator.step(ts, 0.01);
assert.equal(ts.tower.elev.total, ELEVATOR_DROPS.length);
assert.ok(ts.tower.elev.total > 0 && FLOORS.from < FLOORS.to);
for (let wave = 0; wave < ELEVATOR_DROPS.length; wave++) {
  elevator.step(ts, 1.3);
  assert.equal(ts.tower.elev.drops, wave + 1, `tower drop ${wave + 1} arrives`);
  const arrived = ts.ninjas.filter(n => n.elevator && !n.dead);
  assert.equal(arrived.length, ELEVATOR_DROPS[wave].length, `tower drop ${wave + 1} roster`);
  for (const n of arrived) {
    assert.ok(n.x >= lock.L && n.x <= lock.R, `${n.ext || n.kind} lands in elevator arena`);
    assert.ok(isWalkable(tower, n.x, n.y, n.r), `${n.ext || n.kind} radius ${n.r} lands on tower floor`);
  }
  for (const n of arrived) n.dead = true;
}
ts.events.lock = null;
elevator.step(ts, 0.01);
assert.ok(ts.tower.elev.done && ts.tower.elev.floor === FLOORS.to, 'tower opens at final floor after drops are clear');

// A synthetic narrow band catches sampling/rounding regressions in the resolver.
const narrow = { walkables: [{ x: 0, y: 0, w: 100, h: 36 }], obstacles: [{ x: 40, y: 0, w: 8, h: 21 }] };
const fixed = resolveWalkable(narrow, 43, 21, 5);
assert.ok(isWalkable(narrow, fixed.x, fixed.y, 5));
assert.ok(fixed.x < 34 || fixed.x > 54 || fixed.y > 27, 'resolver escapes obstacle without snapping into blocked depth');
const empty = { walkables: [{ x: 0, y: 0, w: 20, h: 20 }], obstacles: [{ x: 0, y: 0, w: 20, h: 20 }] };
assert.deepEqual(resolveWalkable(empty, 10, 10, 2), { x: 10, y: 10, allowed: false });

// A long frame may cross several obstacles even when its endpoint is clear.
const tunnel = { walkables: [{ x: 0, y: 0, w: 500, h: 100 }], obstacles: [{ x: 100, y: 0, w: 4, h: 100 }] };
const hit = moveWalkable({ x: 40, y: 50, r: 16, speed: 1000 }, 1, 0, 0.2, tunnel);
assert.ok(hit.blocked && hit.x < 100 - 17 && isWalkable(tunnel, hit.x, hit.y, 16), 'sweep must not tunnel');
const sliver = { walkables: [{ x: 0, y: 0, w: 100, h: 50 }], obstacles: [{ x: 21.2, y: 0, w: 0.1, h: 50 }] };
const thinHit = moveWalkable({ x: 10, y: 25, r: 0, speed: 100 }, 1, 0, 0.4, sliver);
assert.ok(thinHit.blocked && thinHit.x < 21.2, 'segment sweep catches subpixel-thin blockers');
const slide = moveWalkable({ x: 70, y: 40, r: 5, speed: 200 }, 1, 1, 0.5,
  { walkables: [{ x: 0, y: 0, w: 200, h: 200 }], obstacles: [{ x: 80, y: 0, w: 5, h: 80 }] });
assert.ok(slide.blocked && slide.y > 80 && isWalkable({ walkables: [{ x: 0, y: 0, w: 200, h: 200 }], obstacles: [{ x: 80, y: 0, w: 5, h: 80 }] }, slide.x, slide.y, 5));

// The sewer backdrop repeats once per tile; its two painted crate groups are
// 332..500 and 1314..1482, y295..380 in the 1814px source image.
const sewer = LEVELS.find(l => l.id === 'sewer');
for (let tile = 0; tile < sewer.width / TILE_W; tile++) for (const x of [332, 1314]) {
  assert.ok(sewer.obstacles.some(o => o.x === x + tile * TILE_W && o.y === 295 && o.w === 168 && o.h === 85),
    `sewer painted crate footprint missing at ${x + tile * TILE_W}`);
}

// Every drawn prop has its correctly translated foot in the level map. The
// shallow and foreground rows must not overlap or seal a full-depth wall.
const breakables = createBreakables({ rand: () => 0.5 });
const touched = [];
for (const li of [0, 1, 2]) {
  const state = { level: li, player: { x: 80, y: 400 }, pizzas: [], score: 0 };
  const footprints = propObstacles(li), placements = placementsFor(li);
  assert.equal(footprints.length, placements.length);
  assert.ok(placements.length, `${li}: level dressing populated`);
  for (const [i, p] of placements.entries()) {
    const f = footprints[i], [fx, fy, fw, fh] = p.spec.foot;
    assert.ok(Number.isFinite(p.baseY) && Number.isFinite(p.x) && p.x >= 0 && p.x <= LEVELS[li].width, `${li}:${i} prop anchored in world`);
    assert.ok(fx >= 0 && fy >= 0 && fw > 0 && fh > 0 && fx + fw <= p.spec.w && fy + fh <= p.spec.h, `${li}:${i} footprint inside sprite`);
    assert.equal(f.x, Math.round(p.x - p.spec.w / 2 + fx), `${li}:${i} foot x matches drawn art`);
    assert.equal(f.y, Math.round(p.baseY - p.spec.h + fy), `${li}:${i} foot y matches drawn art`);
    assert.equal(f.w, fw); assert.equal(f.h, fh);
    assert.ok(LEVELS[li].obstacles.some(o => (f.id ? o.id === f.id : o.x === f.x && o.y === f.y) && o.x === f.x && o.y === f.y && o.w === f.w && o.h === f.h),
      `${li}:${i} footprint must appear exactly in collision`);
    assert.ok(LEVELS[li].walkables.some(b => f.x < b.x + b.w && f.x + f.w > b.x && f.y <= b.y + b.h && f.y + f.h >= b.y),
      `${li}:${i} prop foot touches its playable band`);
    for (let j = 0; j < i; j++) {
      const other = footprints[j];
      assert.ok(f.x >= other.x + other.w || other.x >= f.x + f.w || f.y >= other.y + other.h || other.y >= f.y + f.h,
        `${li}: prop footprints ${j}/${i} overlap`);
    }
  }
  // Older maps may use one base; only enforce three genuinely different depth
  // rows once the level has authored explicit per-placement baseY values.
  if (placements.length >= 3 && placements.every(p => Number.isFinite(p.baseY)) && new Set(placements.map(p => p.baseY)).size > 1) {
    const bases = placements.map(p => p.baseY);
    assert.ok(new Set(bases).size >= 3 && Math.max(...bases) - Math.min(...bases) >= 24, `${li} props cover back, middle and foreground depth`);
  }
  const which = placements.findIndex(p => BREAKABLE[p.name]);
  assert.ok(which >= 0, `${li}: needs a breakable placement`);
  const footprint = footprints[which];
  const ob = LEVELS[li].obstacles.find(o => o.x === footprint.x && o.y === footprint.y && o.w === footprint.w && o.h === footprint.h);
  assert.ok(ob, `${li}: prop visual footprint must match collision`);
  breakables.list(state);
  breakables.smash(state, which);
  assert.ok(ob.x < -1e5, `${li}: smashed prop frees footprint`);
  assert.ok(LEVELS[li].obstacles.includes(ob), 'keep original obstacle identity for restoration');
  touched.push({ ob, x: footprint.x });
  // A level transition within the same run retains the broken prop, while
  // the other stage's prop state initializes independently.
  const other = (li + 1) % 3;
  state.level = other;
  breakables.list(state);
  assert.ok(ob.x < -1e5, `${li}: level switch keeps previously smashed prop clear`);
  state.level = li;
  assert.ok(breakables.list(state)[which].broken, `${li}: returning to level retains smashed state`);
  breakables.list({ ...state }); // new run resets all level footprints
  assert.equal(ob.x, footprint.x, `${li}: restored footprint on new run`);
  assert.equal(ob.__x0, undefined);
}
assert.ok(touched.every(({ ob, x }) => ob.x === x), 'all levels restore exact obstacle identity and position');
console.log(`Collision checks passed: ${routes} walking routes, ${encounters} encounter/radius spawns, props, swept motion, breakable restoration.`);
