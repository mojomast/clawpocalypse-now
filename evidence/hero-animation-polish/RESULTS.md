# Implemented changes and verification

Base: PR #3 at `5d72948`. Initial runtime integration: `14a2888`; visual-review
follow-up `fd1e4ee` adds explicit held knees and distinct third-hit contacts.
Final recovery correction: `d2560b5`. Final after-captures use this revision.

## What changed

- **Teknium:** compact counter-rotated locomotion, separate readable blade cuts,
  forward second cut, guarded reactions/get-up and free-arm gestures. The old
  support-exchange pelvis jump is replaced by a continuous feasible hip path.
- **TurboFit:** uniformly re-sliced anatomical arms, cleaned baked torso sockets,
  moving deltoids, a real closed support grip derived from the source sheet, and
  weighted guitar-axe anticipation/contact/follow-through. Source preparation,
  slice parameters and hashes are committed; generated metadata stays in sync.
- **Nous Girl:** new action poses, supported knees and distinct throws, natural
  slack curvature, bounded cable loops and damped follow-through. Full rendered
  plug/cable bounds fit the original whip reach. Contact entry can commit the
  rope once during hit-stop without advancing springs or simulation time.
- **Shared, three-hero-only presentation:** first-active drawings are ready when
  damage becomes eligible; kicks use legs rather than special-attack drawings;
  a compact third hook differs from the fourth-hit finisher; rear attacks use
  the rear elbow; non-damaging dash carries the weapon rather than slashing.

The four turtles and Don Piedro retain their original assets, authored data,
timeline output, world-foot-lock transforms and Canvas pose pixels. No title,
cinematic, story, previous v2 evidence, deployment or main-branch edits.

## Contact behavior — deliberate gameplay change

Original maximum ranges, damage values, startup/active/recovery durations,
hit-stop and lane caps are retained. For the three polished heroes, ordinary
melee boxes are **narrowed** to the visible contact limb/weapon envelope within
those caps, with a six-world-pixel contact/spark allowance. This removes invisible
reach; it can turn a previous distant hit into a whiff. It is not a claim that
combat targeting is unchanged. Back attacks use the rear elbow; kicks use the
foot/shin. Grabs retain their pinned-target behavior. Energy/sound attacks keep
their area boxes and gain a corresponding visible reach cue.

At the fixed **old broad-box midpoint** used by the comparative combat fixture,
Teknium/TurboFit rear-elbow attacks and Nous's compact launcher now whiff. Their
closer visual-envelope targets pass the separate combat-contact tests. This is
an intentional consequence of removing invisible reach, but needs gameplay
balance review; the comparison clips must not be presented as all attacks
preserving their previous effective reach.

Sparks now appear at the intersection with the target hurtbox, rather than at
its ground position. The authored contact drawing drives these bounds; they are
not per-pixel collisions against every antialias fringe or secondary hair lock.

## Executed checks

- `npm test` and the expanded polish checks include 8,640 recovery samples and
  5,616 enhanced gait supports with **zero toe fallback or
  ordinary anchor release**. Maximum measured Teknium/TurboFit gait pelvis
  velocity: **58.481 rig px/s**, replacing 44–55 px single-frame jumps.
- **288 Teknium/TurboFit authored poses + 25,048 transition samples:** maximum
  wrist/elbow floor-guard correction **0°**. The safety fallback remains for
  unexpected procedural input; authored moves no longer depend on it.
- **552** contact-timing cases at 30/60/120/144 Hz, including phase entry during
  hit-stop; **66 real combat hits + 24 held knee/throw cases** in both facings
  plus no-hit mobility and Power Chord's two damage pulses.
- Nous: **657 production geometry solves**, bounded segment lengths (maximum
  11.8 rig px), strict dt0 freeze, reflection symmetry and identical first-contact
  rope geometry across 30/60/144 Hz and a 1µs positive step.
- `npm run test:pixels`: **2,942 actual-alpha joint samples**, zero pairwise
  gaps over 1px and zero unusual overlap increases over the hero's idle art.
- `npm run test:browser`: all eight heroes exercised through real keyboard
  input in `index.html`; zero console/render errors or failed asset requests.
- `node tools/level-layout-smoke.mjs`: correct stage/actor depth order, all eight
  stages with co-op, zero render errors.
- `node tools/gen-hero-rigs.mjs --check`, syntax checks, whitespace checks and
  npm audit pass.
- **36 full-path knockdown/recovery cases:** three heroes, both facings,
  30/60/144 Hz, with and without the real invulnerability-blink render skipping.
  Worst settled hip error **0.1581 screen px**, settled ankle error **4.03e−14
  px**, and no settled anchor drift. Six independent actual-game captures stand
  idle for over three seconds after recovery, without a movement workaround.
  [Committed recovery frames and measurements](recovery/) preserve the recheck.
- Protected heroes: **1,186 exact RGBA pose/facing hashes**, exact source/pose/
  transition fingerprints, and exact full locomotion/get-up transforms at
  30/60/144 Hz, both facings.

## Visual-review limits

Passing the checks above does not establish hand-drawn, world-class animation
quality. These remain cutout rigs with rigid segment silhouettes. Existing
open/fist drawings and the repaired closed far grip are used intentionally;
**genuine new camera-facing/foreshortened near-hand artwork was not fabricated**.
Some oblique hand and torso views remain limited by the approved source sheets.

The independent review is preserved as a review of **`14a2888`**, including its
negative findings. The follow-up does not silently rewrite that historical
verdict: held knees and J2/J3 contacts were revised in `fd1e4ee`; stationary
recovery repair and its real-game recheck are documented separately in
`RECOVERY-FIX.md`. Final after-capture manifests identify their source revision.

The relaxed cable loop is an art-directed equilibrium for a free-ended rope,
not a claim of a two-anchor catenary. Contact entry is intentionally authored
and deterministic; recovery uses dynamics. The melee envelope is a conservative
box, not a full polygon sweep. These limits should be considered during manual
art-direction and gameplay balance review.

See `CLIPS.md`, `COMBAT_CLIPS.md` and `FINAL-REVIEW.md` for visual evidence and
independent review findings. Controlled combat fixtures have fixed targets and
enemy AI disabled; real browser input smoke is a separate check.

Final command output is retained in [`verification/`](verification/); actual
keyboard-playthrough screenshots and request/error reports are in
[`gameplay/`](gameplay/). Generated review output is marked as generated in
`.gitattributes`, not hidden or excluded from the repository.
