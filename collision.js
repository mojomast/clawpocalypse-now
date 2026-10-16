// Walkable collision maps for AGENT ARMEGEDDON: CLAWPOCALYPSE NOW's side-scrolling stages.  These are
// data-first so MR.INDIA's art and animation can be layered on top without
// changes to the game loop: pipes, ladders and stage edges should match these boxes.
// One full level-strip tile: the world is wider than the viewport so the camera
// can scroll. Art strips are 1814x510 and loop seamlessly.
export const TILE_W = 1814;
// Iteration 7: walking levels are three strip tiles long (~3x). The strip art
// loops seamlessly every 1814px; per-segment props, decals and foreground keep
// the repeats from reading as copies.
export const WORLD_W = TILE_W * 3; // 5442

import { propObstacles } from './props.js';
import { SUBWAY_LEVEL } from './subway-data.js'; // cheese: subway level data
import { HARBOR_LEVEL } from './harbor-data.js'; // mr_india: harbor docks level data
import { ARCADE_LEVEL } from './arcade-data.js'; // mr_india: arcade interior level data

export const LEVELS = [
  {
    id: 'sewer',
    // Side-scroll art order requested by MR.INDIA.  The floor band is read directly
    // from assets/levels/LEVELS.md; the crates are the only authored blockers.
    // x ranges span a full 1814px strip tile (WORLD_W): the earlier 0-740 ranges
    // pinned the world to one screen, which is why nothing could scroll.
    width: WORLD_W,
    walkables: [
      { x: 0, y: 363, w: WORLD_W, h: 93 }
    ],
    obstacles: [
      // The painted crates repeat with every strip tile.
      ...[0, 1, 2].flatMap(k => [{ x: 332 + k * TILE_W, y: 295, w: 168, h: 85 }, { x: 1314 + k * TILE_W, y: 295, w: 168, h: 85 }]),
      // Props (props.js) contribute their footprints so they block where they stand.
      ...propObstacles(0)
    ],
    spawnY: (rand) => 390 + rand() * 45
  },
  {
    id: 'street',
    width: WORLD_W,
    walkables: [
      { x: 0, y: 358, w: WORLD_W, h: 152 }
    ],
    obstacles: [
      ...propObstacles(1)
    ],
    spawnY: (rand) => 380 + rand() * 110
  },
  {
    id: 'rooftop',
    width: WORLD_W,
    walkables: [
      { x: 0, y: 358, w: WORLD_W, h: 67 }
    ],
    obstacles: [
      ...propObstacles(2)
    ],
    spawnY: (rand) => 375 + rand() * 33
  },
  {
    // Iteration 6: auto-scrolling skate highway (skate.js). Played between street
    // and rooftop (logic.LEVEL_ORDER). The road band is endless; the camera, not
    // the level width, bounds the player. Obstacles are cones/barriers you ollie.
    id: 'skate',
    auto: true,
    walkables: [
      { x: -1e5, y: 384, w: 1e7, h: 112 }
    ],
    obstacles: [],
    spawnY: (rand) => 401 + rand() * 78
  },
  {
    // OpenClaw Tower (baba_booey): the final level, after the rooftop. Three
    // strip tiles: lobby, server floor (ends in the elevator arena), penthouse
    // throne room (SHREDCLAW). One band for all three: the painted floors start
    // at y~340 (lobby/server) and y~380 (throne dais), so 384-500 reads as floor
    // on every tile. No painted blockers; the elevator/throne are backdrop.
    id: 'tower',
    width: WORLD_W,
    walkables: [
      { x: 0, y: 384, w: WORLD_W, h: 116 }
    ],
    obstacles: [],
    spawnY: (rand) => 401 + rand() * 82
  }
];
LEVELS[5] = SUBWAY_LEVEL; // cheese: subway train level (index 5; tower is 4)
LEVELS[6] = HARBOR_LEVEL; // mr_india: harbor docks at night (index 6)
LEVELS[7] = ARCADE_LEVEL; // mr_india: retro arcade interior (index 7)

export function levelForIndex(level = 0) {
  const n = LEVELS.length;
  return LEVELS[((level % n) + n) % n];
}

export function isWalkable(levelOrIndex, x, y, radius = 0) {
  const level = typeof levelOrIndex === 'number' ? levelForIndex(levelOrIndex) : levelOrIndex;
  const r = radius > 0 ? radius + 1 : 0;
  const inLane = (level.walkables || []).some(box => (
    x >= box.x + r &&
    x <= box.x + box.w - r &&
    y >= box.y + r &&
    y <= box.y + box.h - r
  ));
  if (!inLane) return false;
  return !(level.obstacles || []).some(box => (
    x >= box.x - r &&
    x <= box.x + box.w + r &&
    y >= box.y - r &&
    y <= box.y + box.h + r
  ));
}

export function resolveWalkable(levelOrIndex, x, y, radius = 0) {
  const level = typeof levelOrIndex === 'number' ? levelForIndex(levelOrIndex) : levelOrIndex;
  if (isWalkable(level, x, y, radius)) return { x, y, allowed: true };
  const r = radius > 0 ? radius + 1 : 0; // Same clearance as isWalkable.
  const obstacles = level.obstacles || [];
  let best = null;
  // The nearest free point must lie on a lane edge, an obstacle edge, or
  // the projection of (x,y) onto those edges. Test their intersections instead
  // of sampling a grid (which misses narrow lanes and can round back into a wall).
  const epsilon = 0.001; // Obstacle edges themselves are closed/blocked.
  for (const lane of level.walkables || []) {
    const left = lane.x + r, right = lane.x + lane.w - r;
    const top = lane.y + r, bottom = lane.y + lane.h - r;
    if (left > right || top > bottom) continue;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const xs = [left, right, clamp(x, left, right)];
    const ys = [top, bottom, clamp(y, top, bottom)];
    for (const ob of obstacles) {
      if (ob.y - r <= bottom && ob.y + ob.h + r >= top) {
        xs.push(clamp(ob.x - r - epsilon, left, right), clamp(ob.x + ob.w + r + epsilon, left, right));
      }
      if (ob.x - r <= right && ob.x + ob.w + r >= left) {
        ys.push(clamp(ob.y - r - epsilon, top, bottom), clamp(ob.y + ob.h + r + epsilon, top, bottom));
      }
    }
    for (const px of xs) for (const py of ys) {
      const d2 = (px - x) ** 2 + (py - y) ** 2;
      if (best && d2 >= best.d2) continue;
      if (isWalkable(level, px, py, radius)) best = { x: px, y: py, d2 };
    }
  }
  return best ? { x: best.x, y: best.y, allowed: false } : { x, y, allowed: false };
}

export function moveWalkable(p, dx, dy, dt, levelOrIndex = 0) {
  const level = typeof levelOrIndex === 'number' ? levelForIndex(levelOrIndex) : levelOrIndex;
  const r = p.r || 0;
  const speed = p.speed || 0;
  const start = isWalkable(level, p.x, p.y, r) ? p : resolveWalkable(level, p.x, p.y, r);
  if (!isWalkable(level, start.x, start.y, r)) return { x: p.x, y: p.y, blocked: true };
  const mx = dx * speed * dt, my = dy * speed * dt;
  // Sweep in small spatial steps, independent of dt: endpoint-only checks let
  // a laggy frame teleport through thin props. Keep the axis slide at each step.
  const steps = Math.max(1, Math.ceil(Math.hypot(mx, my) / 4));
  const sx = mx / steps, sy = my / steps;
  const clearance = r > 0 ? r + 1 : 0;
  const canTraverse = (ax, ay, bx, by) => {
    if (!isWalkable(level, bx, by, r)) return false;
    // Segment/AABB slab intersection prevents tunneling even through a blocker
    // thinner than the step size (including radius-zero callers).
    for (const ob of level.obstacles || []) {
      let enter = 0, leave = 1;
      for (const [a, delta, lo, hi] of [
        [ax, bx - ax, ob.x - clearance, ob.x + ob.w + clearance],
        [ay, by - ay, ob.y - clearance, ob.y + ob.h + clearance]
      ]) {
        if (delta === 0) { if (a < lo || a > hi) { enter = 2; break; } }
        else {
          const t0 = (lo - a) / delta, t1 = (hi - a) / delta;
          enter = Math.max(enter, Math.min(t0, t1));
          leave = Math.min(leave, Math.max(t0, t1));
        }
      }
      if (enter <= leave) return false;
    }
    return true;
  };
  let x = start.x, y = start.y, blocked = false;
  for (let i = 0; i < steps; i++) {
    const nx = x + sx, ny = y + sy;
    if (canTraverse(x, y, nx, ny)) { x = nx; y = ny; continue; }
    blocked = true;
    if (canTraverse(x, y, nx, y)) x = nx;
    if (canTraverse(x, y, x, ny)) y = ny;
  }
  return { x, y, blocked: blocked || start !== p };
}
