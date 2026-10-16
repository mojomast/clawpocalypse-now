# AGENT ARMEGEDDON: CLAWPOCALYPSE NOW

A beat-'em-up in plain HTML5 canvas + JavaScript (formerly *Pizza Panic*). No build step, no server code.

**Play:** https://mojomast.github.io/clawpocalypse-now/

## Controls (keyboard)

| Action | Keys |
|---|---|
| Move | A / D or Arrows (press twice to dash) |
| Walk lanes | W / S |
| Jump | L |
| Punch | J (4-hit chain; number to finisher) |
| Kick | K (launcher, air juggle) |
| Back attack | J + K while facing an enemy |
| Special | J + L (costs a little HP) |
| Grab | Walk into a stunned foe; J / K / throw |
| Shoot pizza | Space (aimed by facing; shorter throw while running) |
| Pause | P or Esc |

Gamepad and touch controls are also supported.

### Settings and help

Pause with **P / Esc**, then open **Options**. Up/Down moves through the paginated
list; Left/Right adjusts a value and Enter activates it. Settings include reduced
flash/motion, screen shake, subtitle size, dialogue speed/advance, colour-safe
cues, and gamepad deadzone/preset. Explicit saved preferences take precedence over
the OS reduced-motion preference. These are comfort controls, not a guarantee
that all game content meets photosensitivity thresholds.

The **Controls** page includes P1 and P2 mappings. **Show tutorial again** replays
the coach on the current run. The alternate pad preset uses a single-press dash;
the classic preset remains the default. Full custom rebinding is not provided.

## Audio credits

All sound effects and music are CC0. Full source list and authors: [CREDITS-AUDIO.md](CREDITS-AUDIO.md).
Audio ships as concatenated Ogg Vorbis packs (`assets/audio/*-pack.ogg.txt`, byte offsets in `audio-pack.js`);
the `.txt` extension is a hosting workaround, the bytes are plain Ogg.

## Hosting notes / shims

None. The game uses only relative paths and has no server API calls or host-specific globals, so it runs
unmodified on GitHub Pages. (`.nojekyll` is present so Pages serves every file as-is.)

## Local play and rig/layout verification

```sh
python3 -m http.server 48791
# Open http://localhost:48791/index.html
```

For local frame-time diagnostics, append `?debug=1`. The bounded
`window.__ppPerf.export()` capture stays in memory until explicitly exported;
it is not sent to an analytics service. Combat counters are P1-scoped, not party
totals; score events are not hit counts. See [the playtest plan](docs/PLAYTEST.md)
for device, lifecycle, accessibility and balance checks that automated tests
cannot replace.

`?rigCache=1` enables an **experimental**, bounded sprite-tint cache. It is off
by default; non-protected rendering can differ because pre-baked filtering and
transformed filtering round differently. It is not a demonstrated device-level
performance improvement. Do not enable it by default on the basis of headless
benchmark numbers.

Focused checks: `npm run test:qol`, `npm run test:runtime`, and
`npm run test:render-cache`. The last checks protected-character identity and
reports non-protected experimental differences separately. Run
`npm run benchmark:runtime` for a headless diagnostic, not a hardware FPS claim.

The game still needs no npm packages or build step. Developer checks use Node 22+:

```sh
npm ci                             # browser-test dependency only
npm test                           # geometry, animation, contacts, level routes
CHROMIUM_PATH=/snap/bin/chromium npm run test:browser
# Or: npx playwright install chromium && npm run test:browser
node tools/render-rigs.mjs after    # Chromium; after/ + comparison/ sheets
node tools/render-levels.mjs after  # collision/layout maps for all eight stages
```

The contact-sheet tools use installed Chromium (`CHROMIUM=/path/to/chromium` to
override their default). `before/` references original game revision `bcec2ee`;
its hero sheet manifest records checksums and capture provenance. Never recapture
it from modified game code. See [rig notes](RIG-ANIMATION.md),
[rig checks](tests/RIG-CHECKS.md), and [layout notes](docs/LEVEL-LAYOUTS.md).

## Deploying

`./deploy.sh` copies the game from its working folder, commits with a timestamp, and pushes to `main`.

For development, use a feature branch and a pull request instead. **Do not run
`deploy.sh` to publish a review branch**: `main` is served by GitHub Pages.
