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
