# Verification and review notes

## Automated checks

- `npm test`: 2,744 rig pose/facing samples, 26,782 attached joints, 2,086
  weapon grips, 2,330 grounded samples; 7,320 attack recovery samples; 3,840
  world-space walk/run support samples (maximum horizontal drift **0.0112px**).
- All seven walking stages have a connected radius-aware route. Skate lanes,
  495 encounter/radius spawn cases, swept movement, destructible restoration,
  and authored prop footprints are covered by `tests/check-levels.mjs`.
- `npm run test:pixels`: 2,070 actual-alpha joint samples; **no measured
  pairwise gap over 1px**. Intended cutout overlap is reported separately; see
  `tests/RIG-CHECKS.md` for what this test does and does not prove.
- `CHROMIUM_PATH=/snap/bin/chromium npm run test:browser`: loaded real
  `index.html`, selected each of the eight heroes through the UI, and used
  keyboard walking/running, both attack facings, jumps, specials, and taunts.
  **Zero console errors, guarded render errors, or failed requests** in the
  final run. Screenshots and results are in `after/gameplay/`.
- `node tools/level-layout-smoke.mjs`: observed the real draw order
  `rear enemy → airborne P1 → P2 → barrel → front boss`, each once. All eight
  stages rendered with co-op active and zero render errors. Results are in
  `after/levels/integration.json`.

## Visual evidence

`before/<hero>.png`, `after/<hero>.png`, and `comparison/<hero>.png` contain
the complete pose sheets in both facings. New run poses are appended after the
original cells, preserving comparison alignment. `tools/rig-review.html` shows
a compact side-by-side overview. `before/levels/` and `after/levels/` contain
three-segment maps with actual background/prop art and collision overlays.

The canonical hero baseline comes from an isolated worktree at original
revision `bcec2ee`, not modified game code. The first raw-preview capture is
retained in commit `ee2b48c`; capture correction/provenance is documented in
`RIG-ANIMATION.md`.

## Scope and remaining art limits

No part PNGs were changed. Grounding, signed hinges, effective-scale pivots,
weapon grips, state timing, character poses, support locks and scene depth are
code fixes. Downed bodies rest on generated opaque-alpha support hulls; get-up
root movement is eased rather than teleporting to a standing solve.

A shin and foot are a single rigid cutout, so the foot rocks between heel and
toe without a separate ankle. Hair and coat panels are baked into head/torso
art: they follow head/body settling, not independent cloth/hair simulation.
Raw joint occlusion remains intentional. Revised prone poses removed the
initial unusually buried Don neck; the final alpha audit found no unusual
overlap increases over idle. These checks are not a claim that every
possible visual contour has reached hand-drawn-frame animation quality.

Browser play was automated in Chromium; the desktop browser tool was not
connected. The game itself still runs directly from a Python static server
without npm packages or a build step.
