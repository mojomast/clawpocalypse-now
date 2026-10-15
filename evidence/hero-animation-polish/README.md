# Hero animation polish

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

## Protected heroes

`tests/check-polish-protected.mjs` compares source PNGs, rig metadata, every named
pose, solved matrices, and twelve timeline frames per pose against PR #3.
`npm run test:protected-pixels` independently compares all named poses in both
facings as raw Canvas RGBA hashes. A numerical match alone is not a substitute
for this render comparison.

## Initial results

- Existing npm, pixel, browser and level-layout tests pass on PR #3.
- 22 fast-run support frames still use the toe-off fallback.
- Floor guards alter 8 Teknium and 16 TurboFit named poses, up to 56 degrees.
- These passing baseline tests are not evidence that those defects are fixed.
