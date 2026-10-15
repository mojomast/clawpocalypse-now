# Hero rig visual and geometry checks

Run `node tests/check-rigs.mjs` from the repository root. It needs Node 22 and
the checked-in `before/` contact sheets; no game build, npm package, or server is
needed. It imports `don.js` to register the eighth hero. The test checks every
hero-prefixed pose, shared locomotion/hurt states and interpolated transitions
under both facings, plus attachments, weapon grips, grounded soles, layers,
production Canvas draw calls, source PNG assets, and baseline coverage/hashes.

For visual review, `node tools/render-rigs.mjs after` renders current production
rigs into `after/` and produces side-by-side sheets in `comparison/`. The baseline capture used
`node tools/render-rigs.mjs baseline` and refuses to overwrite existing images.
Do not regenerate `before/` after animation changes; its images are the reference.

The baseline manifest explicitly reports missing named states (for example,
`run`) and any shared fallback pose it drew instead. It must not replace a
missing named state silently. A missing art file or failed image decode causes
rendering to fail rather than producing an apparently successful blank sheet.

`npm run test:pixels` independently rasterizes source PNG alpha through solved
matrices: 2,070 neck/shoulder/elbow/hip/knee samples, both facings. It fails on
pairwise disconnections over 1px and writes detailed crops and measurements to
`/tmp/opencode/rig-pixel-seams/`. Alpha contact is not a proof that every exposed
contour is aesthetically perfect.

Raw overlaps over 6px are **reported**, not silently discarded: cutout limbs
must tuck under their torso, pads, and coat. `--strict-overlap` makes all such
intersections fatal for an art-authoring audit, but is not the normal regression
gate (the unchanged source artwork intentionally overlaps). The first review
flagged Don's curled-down neck; revised prone poses removed that unusual burial.
The final audit reports zero unusual-vs-idle overlaps, but still reports 1,512
raw intersections rather than misrepresenting the sprites as overlap-free.

World-space contact tests and animation-state/timing tests are in
`check-animation.mjs`. The pure rig test covers all named poses, positive knee /
negative elbow limits, selected planted feet, independent forward weapon axes,
and both mirrored draw paths. Baked-in sai and flexible/double-ended weapons are
explicitly excluded from a meaningless rigid tip-direction assertion.
