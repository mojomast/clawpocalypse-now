# Hero animation polish

## Start here

- [Results, measurements and limitations](RESULTS.md)
- [Independent visual review of the initial integrated pass](FINAL-REVIEW.md)
- [Stationary-recovery fix and real-game recheck](RECOVERY-FIX.md)
- [All 89 authored-motion comparisons](CLIPS.md)
- [All 54 real-combat-fixture comparisons](COMBAT_CLIPS.md)
- [Teknium run comparison](comparison/teknium/run.mp4)
- [Teknium combo comparison](comparison/combat/teknium/combo.gif)
- [Nous Girl lash comparison](comparison/nous_girl/whipA.gif)
- [TurboFit heavy swing comparison](comparison/turbofit/axeHeavy.gif)
- [TurboFit combo comparison](comparison/combat/turbofit/combo.gif)
- [Nous stationary recovery comparison](comparison/nous_girl/stationary-recovery.mp4)

Comparison clips show **before on the left, after on the right**, at native
gameplay scale. Each original before/after MP4 shows both facings. `*.scale.png`
is a native frame; `*.phases.png` selects startup/contact/recovery frames at
native size; overview `*.png` strips additionally contain reduced/cropped views.

Base: PR #3, `feat/natural-hero-assets`, commit
`5d72948d3ee446e1255463448ea84d26bb93a3d8`. This pass only changes Teknium,
Nous Girl and TurboFit. Historical `hero-assets-v2` captures remain untouched.

## Reproducible review

Requires Node 22, `npm ci`, Chromium/Playwright and ffmpeg (offline review tools,
not game dependencies). The game remains build-free.

`node tools/capture-polish.mjs before` captures from an isolated original-source
worktree (`BASELINE_ROOT`, default `/tmp/opencode/hero-polish-baseline`), not the
working implementation. It refuses an existing completed baseline manifest.
`node tools/capture-polish.mjs after` captures current code and compares the
protected heroes' original RGBA hashes. Set `CHROMIUM_PATH` for your machine.

Each move gets a 30fps MP4 sampled from a deterministic 60Hz production timeline,
foot-lock and secondary-motion replay, in both facings at scale **0.7**. PNG strips
provide an overview and crops. These are controlled rig-review sequences, not
recordings of enemies being struck: generic authored move previews use standard
review durations; hero finisher/special previews use their combat durations.
Actual gameplay and hit detection must be checked separately.

`node tools/capture-polish.mjs before --combat` records a second, controlled
combat fixture through the **real combat state machine and production pose
selector**. It includes J1–J4, full combo, ground/air kicks, launcher/juggle,
dash/back attacks, both mobility actions, specials, ordinary/final knees and
lane/screen throws. Targets are stationary diagnostics, not normal enemy AI;
phase/health/hit-stop/box traces accompany each clip. The same fixture is run
against current code with `after --combat`. These are not mislabelled keyboard
playthroughs. The normal browser smoke test exercises real `index.html` input.

`node tools/compare-polish.mjs` and `node tools/compare-polish.mjs --combat`
assemble before/after MP4s, motion-strip comparisons, phase-selected strips and
native gameplay-scale captures. The selected GIFs are convenience previews;
the MP4s retain the full deterministic sequence.

The optional `--extend --only NAME` capture mode adds a missing scenario from
the same immutable source revision without replacing already captured clips.
It was used to include TurboFit's previously omitted `axeB`, full combos and
three-second stationary recovery sequences for all three heroes.

## Protected heroes

`tests/check-polish-protected.mjs` compares source PNGs, rig metadata, every named
pose, solved matrices, and twelve timeline frames per pose against PR #3.
`npm run test:protected-pixels` independently compares all named poses in both
facings as raw Canvas RGBA hashes. A numerical match alone is not a substitute
for this render comparison.

## TurboFit source-art regeneration

Authoring only (not required to run the game/tests): use a Python environment
with Pillow, NumPy and SciPy, then run:

```sh
python assets/heroes/turbofit/src/prepare-polish.py
python tools/slice-hero-parts.py turbofit --write
node tools/gen-hero-rigs.mjs
node tools/generate-support.mjs # local HTTP server on 48791, or GAME_ORIGIN
```

The untouched approved `sheetA.jpg` is retained. `sheetA-polish.png` removes the
fixed torso shoulder sockets; `SLICE.json` records the anatomical arm reslices,
closed support-hand source region and input/output hashes. This does not add
a runtime build step or manufacture hand perspective by stretching sprites.

## Initial results

- Existing npm, pixel, browser and level-layout tests pass on PR #3.
- 22 fast-run support frames still use the toe-off fallback.
- Floor guards alter 8 Teknium and 16 TurboFit named poses, up to 56 degrees.
- These passing baseline tests are not evidence that those defects are fixed.
