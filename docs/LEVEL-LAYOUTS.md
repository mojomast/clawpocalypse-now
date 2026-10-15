# Level-layout audit and review

This pass preserves the painted level strips and encounter scripts. Dressing is
authored, not randomized. Narrow platforms stay navigable without requiring a
jump or destroying an object. Wall hardware stays against the back wall; loose
objects use staggered depths instead of a single horizontal row.

## Coordinate contract

- All art uses the production 510px-high coordinate system.
- Prop `baseY` is the bottom of its sprite. Its collision box is the authored
  bottom footprint, not the full height of the sprite.
- Actor pathfinding checks the body center with radius 16 **plus one pixel** of
  clearance. The legal center band is therefore 17px inset on each side.
- Depth sorting must compare the prop base with the actor's **ground foot**
  (`y + r`), not the sprite's airborne position. Shadows/telegraphs stay on the
  ground layer. Merely moving a prop forward while drawing every prop behind
  every actor is not sufficient integration.

## Stage policy

| Stage | Floor band | Treatment |
| --- | --- | --- |
| Sewer | 363–456 | Alternate loose containers between back and near lanes; keep wall valves back and avoid the six painted crate groups. |
| Street | 358–510 | Use the wide pavement for clear back/middle/front clusters and keep shop entrances readable. |
| Rooftop | 358–425 | Small rear equipment offsets and edge dressing; do not put a hard barrier across this narrow lane. |
| Skate | 384–496 | Keep the endless road clear of static props; cones/barriers are the existing timed jump hazards, not map walls. |
| Tower | 384–500 | Preserve lobby/server/elevator/final arena space; painted machines and throne remain backdrop. |
| Subway | 372–452 | Preserve carriage boarding space and roof hazard run; no gratuitous static clutter. |
| Harbor | 396–470 | Stagger small dock dressing; containers and mounted life rings stay back. Preserve crane/wet-plank escape room. |
| Arcade | 392–458 | Vary cabinets and machine offsets without sealing the carpet lane; damage and ticket drops follow cabinet depth. |

## Collision fixes

`resolveWalkable` now evaluates radius-inset lane boundaries and obstacle-edge
projections rather than coarse sampling followed by rounding. The former method
could miss narrow clear strips or round a result back into collision.

`moveWalkable` now sweeps movement in bounded spatial steps with segment/AABB
intersection checks and axis sliding. A long frame cannot pass through a narrow
prop just because its final position is free. Invalid starting positions are
resolved before moving. Stage spawn-depth ranges use the same clearance as the
walkability predicate; larger enemies still need radius-aware spawn resolution.

Harbor wet-plank momentum uses the same swept collision, so the new dock solids
cannot be tunneled through during a long frame. Newly spawned subway signals
and crane drops no longer consume the spawning frame's elapsed time; their
warning is visible before the hazard becomes active. Tests cover warning,
impact, dodge/jump behavior, long spawning frames, and unobstructed slides.
All nine cabinet footprints are checked through smash/removal/new-run
restoration, and all eleven solid harbor footprints are checked against their
authored art bases.

## Reproduce verification

```sh
node --experimental-default-type=module tests/check-levels.mjs
node tools/render-levels.mjs after
```

The capture command starts a private HTTP server and headless Chromium (override
the executable with `CHROMIUM`). There are no npm or build prerequisites.

`before/levels/source/` preserves the original layout modules. The baseline
renderer maps those modules into a separate URL namespace and falls back to the
unchanged production dependencies. `before/levels/*.png` and
`after/levels/*.png` show all three segments of each of the eight stages using
actual production art and renderers, with floor bands, radius-aware reachable
centers, solid boxes, and prop base markers. Foreground occluders and fighters
are intentionally omitted to make footprints readable; these are map audit
sheets, not an end-to-end actor occlusion test. Dynamic hazards are verified
separately from the static overview.

Baseline capture is create-only (`node tools/render-levels.mjs baseline`); the
after command verifies baseline PNG SHA-256 hashes. Baseline art and encounter
scripts are unchanged. Do not overwrite the captured baseline for subsequent
layout edits.

## Game-loop integration (applied)

The layout modules expose world-space `{ y, draw() }` entries. `game.js` merges
these into the actor queue once per frame, via `layout-render.js`:

```js
const stageEntries = [
  ...props.depthEntries(ctx, s.level, camX, camX + W, breakables.propMod(s.level)),
  ...harbor.depthEntries(ctx, s, camX),
  ...arcade.depthEntries(ctx, s, camX),
];
const entries = [...stageEntries, ...actorEntries];
entries.sort((a, b) => a.y - b.y);
for (const entry of entries) entry.draw();
```

1. The old early `props.draw(...)` and `arcade.drawWorld(...)` calls are removed.
2. The early harbor call is
   `harbor.drawWorld(ctx, s, camX, animT, true)` (wet-floor sheen only).
3. P1, P2, and **each individual enemy**, including bosses, have callbacks
   keyed by their ground feet. Animation advances once per actor per frame;
   the existing P1 foot-lock and hitstop behavior is preserved.
4. Breakable pickups/debris, floor impact effects, and boss/enemy
   telegraphs remain in their appropriate ground/effect passes. Harbor crane
   drops already have depth entries. Skate has no static props and keeps its
   existing road-obstacle rendering.
5. Compatibility `draw`/`drawWorld` fallbacks are not called as well as entries.

`events.js` now reads each real stage's floor band and resolves the **actual
final coordinates** with each enemy's radius, keeping airborne z separate.
`logic.js` resolves player/opening-enemy spawns; `coop.js` resolves P2 join,
continue, and stage-regroup positions. Skate's outer `laneY()` targets are now
401 and 479. Tests exercise real spawning functions at all stages and at three
randomness extremes, not just hypothetical spawn coordinates.

`node tools/level-layout-smoke.mjs` runs the real game in Chromium, verifies
keyboard movement, freezes the simulation, then observes production Canvas and
rig calls. The observed order is **rear enemy → airborne P1 → P2 → barrel →
front boss**, each drawn once. All eight stage collectors are exercised with
co-op active. Results are saved in `after/levels/integration.json`. This test
requires the local game HTTP server and Playwright development dependency.

### Visual review result

The eight production-art sheets were inspected before and after. The sewer now
reads as a floor with staggered loose objects rather than a row on the top edge;
the barrel pair no longer sits on a painted crate. Street uses more of its wide
pavement. Rooftop, harbor, and arcade alternate shallow and near-edge objects
with a continuous radius-aware passage between them. Subway, skate, and tower
retain their readable hazard/arena floors rather than receiving arbitrary
clutter. The six sewer painted crate groups still match their original art.
The static sheets remain footprint reviews; the separate real-game trace test
verifies actor/prop occlusion ordering after integration.
