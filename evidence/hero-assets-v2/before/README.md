# Hero assets v2 — pre-change baseline (discovery task B)

Captured 2026-10-15 from `feat/natural-hero-assets` at **a53e191** (stacked on PR #1), clean tree.
Nothing in the game, tools, assets or the old `before/`, `after/`, `comparison/` folders was modified.
All captures ran from scratch copies outside the repo:

* `/tmp/cpn-hv2-clone` — `git clone` of the repo at a53e191 (tree verified identical with `diff -rq`),
  with its own `before/` moved aside so the **unmodified** `node tools/render-rigs.mjs baseline` could
  write fresh sheets; those were copied here.
* `/tmp/cpn-hv2-run` — rsync copy used for the test suite, because `browser-smoke.mjs` and
  `tools/level-layout-smoke.mjs` write into `after/` (repo `after/` was not touched).

| Folder | Contents |
| --- | --- |
| `contact-sheets/` | `tools/render-rigs.mjs baseline` output: every named pose (123–127 per hero) × RIGHT/LEFT, scale 0.85, `manifest.json` with sha256, `sourceRevision: a53e191`. |
| `motion/<hero>/` | 60 Hz strips through the production path (`anim.step` → `footLocks.place` → `rig.draw`, scale 1.0): `walk`, `run` (+ world-space onion with locked support anchors), `idle-to-attack`, `combo` (chain hits 1–3 + finisher, combat.js timings), `turn`, `landing`, `hurt-down-getup`. Row 1 starts facing right, row 2 facing left. `manifest.json` lists sampled frame counts. |
| `gameplay/` | `<hero>_gameplay-scale.png`: 960×540 canvas on the sewer art at RIG_SCALE 0.7 / FEET_SCREEN 63 (idleA, walk2, run1, chain-1 active, finisher active, jump, flinch, down; alternating facing). `<hero>_3x-crop.png`: nearest-neighbour 3× crops of the same row. `real-game/`: screenshots from the real `index.html` keyboard run (`npm run test:browser`). |
| `parts/` | Each source part PNG at 4× nearest on a checkerboard with pivot (red), child attach points (blue) and SOLES (green); `part-stats.json` (size, alpha, partial-alpha pixel count, components, pivot alpha); `alpha-hulls.json`. |
| `review/` | Key-pose crops (idle R/L, turn, jump, kick move, wake, down, victory) and `source_sheets.jpg` (original magenta part sheets, see AUDIT §0). |
| `tests/` | Logs of `npm test`, `npm run test:pixels` (+ full seam report JSON), `npm run test:browser`, `node tools/level-layout-smoke.mjs` (+ integration.json), the render log, and `asset-metrics.json` (proportions, sole tilt, weapon/floor penetration over reachable poses). |
| `harness/` | The scratch harness used (`strips.*`, `gameplay.*`, `metrics.mjs`, `capture.mjs`, `parts.py`). It expects to sit in `<clone>/__hv2/`; it is evidence only, not production code. |

One console error was recorded across the 64 harness page loads (`motion/manifest.json` → `errors`): an
unattributed HTTP 404. A re-probe of both harness pages with response logging showed no 4xx, and the
harness throws if any rig part image fails to load, so no capture is missing art.
