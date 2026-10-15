# Motion discovery: Nous Girl cable, attack readability, and hands

**Status: discovery only. No implementation or replacement baseline capture authorized by this document.**

Inspected `feat/hero-animation-polish` at PR3 `5d72948`. This workstream writes only this file. Main owns immutable new baselines, capture tooling, and the implementation gate. Another workstream owns Teknium/TurboFit joints, floor guard, and running; observations below about their weapon direction are inputs to that workstream, not a competing solver change.

Constraints for any later implementation: preserve public hero/move IDs, combat timing/ranges/damage, `FOOT_Y=90`, gameplay scale 0.7, actor-local state, mirroring, and zero-dt hit-stop. The four turtles and Don must retain byte-identical rendered outputs, not merely unchanged assets. No changes to `title.js`, `cinematics.js`, or `assets/cine/`. Do not rewrite existing `evidence/hero-assets-v2/` evidence.

## 1. Sources and evidence limits

Read `evidence/hero-assets-v2/AUDIT.md`, its README, `assets/heroes/MANIFEST.md`, both after manifests, runtime `rig.js`, `secondary.js`, `foot-lock.js`, `animation-timeline.js`, `hero-motion.js`, `combat.js`, `hero-moves.js`, and relevant `grab.js`, draw integration, and tests. Visually reviewed the three `comparison/*_3x-crop.png` images, Nous's combo comparison, and the three hand source sheets (`assets/heroes/<id>/src/sheetB.jpg`).

The audit describes the **older** a53e191 designs: skirt, long arms, and open palm are not current Nous Girl bugs. The current manifest describes white turtleneck/jeans, separate grip hands, held jack, ten cable links, free jack, hair locks, and hip coil. The README explicitly retains these limits: no foreshortened hand drawings; nearly straight idle/walk cable; secondary state updated during drawing.

Existing comparisons establish appearance, not a valid current combat-contact baseline:

* `after/motion/manifest.json:2` identifies source revision **2120bd6**, not the current requested baseline 5d72948.
* `after/harness/strips.js:15–50` scripts timings and pose names at fixed `x`; it does not execute combat, damage, targets, start lunges, or combo buffering.
* **Additional cable-evidence limitation:** the harness advances animation/foot locks every frame (`:62–66`), but calls `rig.draw` only on retained samples (`:83–93`). Secondary physics lives in that draw call. It therefore does not step the rope through all the claimed 60 Hz frames. Drawing consecutive cells also substitutes page-layout coordinates for the real actor origin; the onion pass draws again with the same actor identity (`:96–106`). This is unsuitable for measuring inertial rope sag, continuity, or overshoot. Main's new harness must advance production secondary state once per simulation frame and copy snapshots for display, not re-simulate during sheet layout.
* The comparison images show a thin near-vertical idle cable and a narrow extended lash; they cannot quantify gameplay endpoint/hitbox error or attack readability at full speed. No new live clip has been measured here.

Measurements below are explicitly either **code facts**, **pure/static geometry**, or **synthetic dynamics**. None is described as a new immutable gameplay baseline.

## 2. Current measured findings

### 2.1 Nous cable: length, attachment, and hit-stop

1. **Visible length and combat reach are independent.** `MANIFEST.md:171–175` gives ten links, rest length 6 per link, lash length 118. `rig.js:641–649` nevertheless hard-codes 118 when building target points along the forearm. `secondaryInputs` separately reads the manifest's `lash` value (`rig.js:660–664`). Changing only the manifest would change constraint length but not that target extent. Combat uses its own rectangle and never tests cable segments (`combat.js:247–290`).
2. **Synthetic transient stretch is reproducible.** With a fixed `nous_girl_whipA_active` solve, new `createSecondary()`, origin `(200,300)`, scale 0.7 and eight 1/60 s calls, frame 2 has **143.322 rig px root-to-end distance** and a **15.637 rig px longest link**, versus the requested 118 total / 11.8 per extended link. Frame 6 is still 119.071 / 12.041; frame 8 is 117.752 / 11.803. This is not a full wind→active replay, so the magnitude in gameplay is still unknown. Six forward constraint sweeps plus floor projection do not guarantee bounded link length (`secondary.js:94–115`). More solver iterations alone are not an acceptance test.
3. **Rest hanging is by design, not proof of broken gravity.** `restRope` drops vertically then puts excess length along the floor (`secondary.js:23–32`). In normal idle there is no second anchor to produce a catenary: the hip coil is a separate decorative spring, not the other cable endpoint. A better relaxed S-curve/slack silhouette needs an authored equilibrium/low-strength shape bias, not a claim that a one-end free rope must sag like a two-end rope.
4. **Zero dt skips integration, but not every state mutation.** `secondary.js:50–55` resets the rope on a facing change before checking dt; `:117–120` rewrites the root and projects points to the floor even at zero dt. A fixed view and fixed inputs can freeze correctly; changed root/floor/facing inputs can alter the rope without elapsed time. Whether an ordinary gameplay hit-stop supplies such changes has not been demonstrated. Existing tests assert frozen spring angles, not rope arrays (`tests/check-hero-v2.mjs:141–149`).
5. **A turn resets rope shape rather than transforming its history.** Springs get a mirrored remembered angle/velocity, but rope points are nulled and initialized at rest (`secondary.js:50–55,89–93`). The documented “mirrors the state instead of snapping it” comment is not true of the rope. Test mirror symmetry from equivalent fresh simulations separately from continuity during an actual turn; these are different properties.
6. **Attachment convention needs visual confirmation.** The held plug's cable origin is its recorded `tip`, and the free plug's recorded `tip` is installed on the last rope point (`rig.js:662,686–691`). Source art shows a metal jack tip at one end and a cable strain-relief at the other. Do not conflate an accurate joint transform with physically correct plug-end choice. Inspect at 3× before deciding whether to introduce an explicit cable-eye landmark; retain exact endpoint attachment throughout any change.

### 2.2 Pure authored-active geometry versus physical boxes

Read-only Node measurements used `solve(hero, POSES[name], {poseName:name, animated:true})`, no actor, no animation interpolation, and no world foot locks; coordinates were multiplied by gameplay scale 0.7. The weapon hull is `HERO_SUPPORT[hero].weapon`, transformed by the returned matrix. The cable value is the rope endpoint, not the furthest pixel of the free plug. These are **static diagnostic extents**, not on-hit gameplay measurements.

| Hero / punch pose | Weapon hull furthest forward, world px | Cable endpoint forward, world px | Actual punch box forward edge, world px |
| --- | ---: | ---: | ---: |
| Nous `whipA_active` / punch 1 | 54.33 (held plug) | **136.37** | **74.40** |
| Nous `whipB_active` / punch 2 | 43.00 (held plug) | **111.40** | **74.40** |
| Nous `wave_active` / punch 3 | 51.57 (held plug) | 51.10 (slack) | 81.60 |
| Teknium `bladeA_active` / punch 1 | **92.48** | — | 74.40 |
| Teknium `bladeB_active` / punch 2 | **15.86** | — | 74.40 |
| Teknium `bladeC_active` / punch 3 | **102.28** | — | 81.60 |
| TurboFit `axe_active` / punch 1 | 54.94 | — | 74.40 |
| TurboFit `axeB_active` / punch 2 | 56.24 | — | 74.40 |
| TurboFit `axeHeavy_active` / punch 3 | 59.24 | — | 81.60 |

Teknium's `bladeB_active` tip itself is at **−29.82 world px**: the authored-active solved blade points substantially backward while the attack box is forward. Give this case to the other solver audit and capture its full swing; a sweeping path may pass forward before that terminal pose. Do not “fix” it by enlarging a box based on one still.

For player radius 16 and `CHAR_SCALE=2`, `attackBox` starts forward at 9.6 and ends at `9.6 + 1.8 × range`, relative to the **post-start player position** (`combat.js:253–263`). Start steps/lunges are separate movement. Hurtbox overlap, not target center distance, determines contact: test just-inside/outside using the target's near hurtbox edge. Vertical overlap and depth-lane filtering also apply. Wave/bass-drop/burst/chord are sound/energy/area presentations; compare their FX footprint to their box, not their weapon tip.

### 2.3 Attack identity and timing disparities

* **Third and fourth punches reuse the finisher drawing with different mechanics.** `HERO_CHAIN` has three entries; combat has four punches. Punch 3 selects `wave` / `bladeC` / `axeHeavy` with shared hook timing `.09/.09/.17`, range 40 and non-heavy behavior. Punch 4 selects the same move name through `heroMove`, but with hero-specific timing, heavy behavior, and ranges 76/54/58. Sources: `rig.js:201–221,1067–1069,1274–1288`; `combat.js:139–142`; `hero-moves.js:36–68`. This is a confirmed identity collision; separate visual read at arcade scale remains unmeasured.
* **Kick, air kick, and non-attacking locomotion share attack drawings.** K alone/air kick select Nous `bassDrop`, Teknium `dash`, TurboFit `headbang`. Nous's forward kick is not her around-special. Teknium's forward dash is `noHit:true` yet selects the named blade-dash drawing (`combat.js:50–62`; `rig.js:1274–1288`). Keep these mechanics unchanged and make their presentation distinguishable.
* **Back attack uses reversed attack direction while body facing stays unchanged.** `combat.js:166` sets `attackFacing=-facing`; `game.js:370–373` mirrors by `facing`. That is not automatically a bug—a back elbow can face forward—but the pose's striking hand/weapon must be audited against the rear box, rather than blindly mirroring the entire body.
* **First damage can freeze an in-between attack drawing.** Combat changes wind→active without landing in that step, then tests damage on the next active update (`combat.js:527–541`). Animation eases toward the active key over up to .05 s light / .075 s heavy, capped by 60% of active duration (`animation-timeline.js:72–100`). Weapon lag is .060/.012/.045 s for Nous/Teknium/TurboFit (`hero-motion.js:8–10`). A first-opportunity hit sets hit-stop, and `game.js:368–370` then supplies dt=0; the timeline returns the preceding drawing (`animation-timeline.js:63–65`). Thus a test must inspect the **last pre-hit drawing and frozen impact drawing**, not assume the named active pose was reached. This code path establishes a timing risk; no live tip-to-target pixel error has been measured.
* Swing audio/FX starts in wind (`combat.js:174–175`). Recovery holds impact for one/two 60-Hz frame durations, then goes to follow-through and guard (`animation-timeline.js:85–108`). These clocks are not automatically synchronized to first damage. TurboFit chord needs two distinct damage/cue opportunities, not merely a long active pose.
* Teknium's `cancel:true` is authored, but recovery buffering is common to all moves (`hero-moves.js:43`; `combat.js:552–555`); no use of that flag was found. Do not promise a special cancel window without a separate gameplay decision.

### 2.4 Foreshortened hands: actual support, not a rotation fix

The source hand sheets draw hanging hands/grips, not fists aimed toward the camera. Current runtime has **no near-hand variants** for any of the three. A pure solve inventory across the same state/move set as `tests/check-hero-v2.mjs:18–21` found:

| Hero | Named poses inventoried | Near hand files selected | Far hand files selected | Upper arm / forearm / hands scale |
| --- | ---: | --- | --- | --- |
| Nous | 88 | grip_back only | fist, open | all `[1,1]` |
| Teknium | 84 | grip_back only | fist, open | all `[1,1]` |
| TurboFit | 84 | grip_back only | open, grip_far | all `[1,1]` |

`rig.js:494–503` rotates these parts without perspective shortening. `:821–838` selects only front head/torso and far-hand variants; `:604–606` limits the ordinary open-hand switch to taunt/victory. `animation-timeline.js:8,15–20` carries neither `wrist` channels nor stepped hand-view metadata through interpolation. The armed hand instead takes the soft-limited weapon angle. Consequently adding `wrist` or `__v` to a pose alone would not implement camera-facing hands.

**Coverage hole:** that inventory deliberately matches the existing v2 test, but TurboFit's live second hit `axeB` is absent from `HERO_MOVES.turbofit` while present in `HERO_CHAIN.turbofit` and `POSES` (`rig.js:220,1052–1054,1068`). The current “reachable” v2 test therefore omits this live attack. New enumerators must union chain IDs, kick IDs, combat overrides, mechanics, and explicit states; do not treat the above counts as complete gameplay coverage.

## 3. Complete before/after move and transition checklist

Every row below requires both facings, gameplay scale and a magnified crop, **before and after using the same scenario**, not a replacement old strip. Timings are nominal `wind / active / recovery` seconds; sample counts depend on actual dt and hit-stop. A forward box is `+9.6…+edge`; an around box is `±edge`. Lane tolerance is ±14 for forward/back, ±28 for around. Mirroring reverses X.

### 3.1 Hero-specific chain and special cases

| Hero | Input/slot | Pose ID | Timing | Box edge | Extra capture |
| --- | --- | --- | --- | ---: | --- |
| Nous | J1 | whipA | .07/.08/.14 | 74.4 forward | cable hand-root, each segment, tip and box |
| Nous | J2 | whipB | .07/.08/.14 | 74.4 forward | reverse lash arc and recovery |
| Nous | J3 | wave (shared hook) | .09/.09/.17 | 81.6 forward | compare directly with J4 |
| Nous | J4 | wave (override) | .12/.14/.26 | 146.4 forward | sound cue/FX, not cable-tip contact |
| Nous | J+L | bassDrop | .14/.24/.30 | 158.4 around | front/rear and lane-edge targets |
| Teknium | J1 | bladeA | .07/.08/.14 | 74.4 forward | tip and blade hull |
| Teknium | J2 | bladeB | .07/.08/.14 | 74.4 forward | backward static tip outlier; full swing |
| Teknium | J3 | bladeC (shared hook) | .09/.09/.17 | 81.6 forward | compare directly with J4 |
| Teknium | J4 | bladeC (override) | .10/.13/.22 | 106.8 forward | buffer/cancel and hit-stop |
| Teknium | J+L | burst | .11/.22/.28 | 147.6 around | area cue, both sides |
| TurboFit | J1 | axe | .07/.08/.14 | 74.4 forward | guitar hull and two-hand state |
| TurboFit | J2 | axeB | .07/.08/.14 | 74.4 forward | explicitly include missing v2 test case |
| TurboFit | J3 | axeHeavy (shared hook) | .09/.09/.17 | 81.6 forward | compare directly with J4 |
| TurboFit | J4 | axeHeavy (override) | .16/.13/.34 | 114.0 forward | one-time start lunge 10, impact mass |
| TurboFit | J+L | chord | .15/.24/.34 | 172.8 around | two hits, .12 tick; both cue/damage frames |

J1–J3 step 7 px at start; Nous/Teknium J4 step 12; special around moves do not start-step. `combat.js:169–173` is conditional on walkability. Preserve these movements in replay; fixed-origin pose clips cannot measure total encounter reach.

### 3.2 Shared mechanics: repeat for all three

| Input/condition | Timing | Physical behavior | Required clip |
| --- | --- | --- | --- |
| K without chain | .15/.11/.24 | edge 99.6; step 12 | Nous bassDrop / Teknium dash / TurboFit headbang, compared with specials/locomotion |
| K after ≥2 punches: launcher | .10/.11/.18 | edge 85.2; step 12 | chain→launcher, target lift, hand follow-through |
| Air J/K without eligible juggle target: jumpKick | .05/.18/.10 | edge 88.8; air height box | low/high jump, grounded target, landing, whiff; hero kick drawing |
| Air attack with eligible launched target: juggle | .05/.10/.08 | edge 92.4; launched-target gate | launcher→jump→juggle; target-height overlap |
| Running J: dashAttack | .06/.16/.26 | edge 96; one-time +60 start lunge | run→lunge→strike→recover; near wall and unobstructed |
| J+K: backAttack | .08/.12/.22 | rear −9.6…−88.8 | target behind, both facings, turn immediately before it |
| Auto grab/hold | hold ≤1.5 s | pinned enemy, not conventional rectangle | approach/grab/hold/break free; check shown hand contact |
| Grab J knee 1 and 2 | .06/.07/.12 | pinned enemy | hold→each knee; preserve distinguishable action from hold |
| Grab J knee 3: kneeFinal | .08/.08/.22 | pinned enemy, releases/knocks down | third knee→release, separate from ordinary knee |
| Grab away+J: laneThrow | .12/.10/.25 | turns facing; pinned target then thrown-body collisions | turn/rope continuity, release, secondary target hit |
| Grab K or jump: screenThrow | .14/.10/.30 | pinned target, screen throw/KO | camera-directed hand presentation and target travel |
| Forward dash | .02/.18/.16 | noHit; active speed 760 | through enemy without damage; Teknium must not imply blade contact |
| Back dodgeRoll | .03/.30/.16 | noHit; active speed 470 | roll/recover, both facings, nearby enemy |

Grab timing source is **`grab.js:19–38`**, not just the fallback `MOVES.knee/grabThrow` records. The third knee and screen throw are distinct required clips. `rig.playerPose` can select `grab_active` for an `attack.hold` object; the dedicated `grabHold` check requires `!c.attack` (`rig.js:1304,1315–1317`). Audit actual hold presentation, not only the named `grabHold` still.

### 3.3 Pose-only completeness and transition coverage

Capture or explicitly label as **pose-only/not a separately reachable player move** every authored family:

* Nous: `whipA`, `whipB`, `wave`, `bassDrop`, `roll`.
* Teknium: `bladeA`, `bladeB`, `bladeC`, `dash`, `burst`.
* TurboFit: `axe`, **`axeB`**, `axeHeavy`, `chord`, `headbang`.
* Shared named families: `launcher`, `juggle`, `dashAttack`, `grab`, `grabThrow`, `backAttack`, `hitReact`, `healthSpecial`, `groundPound`, `dash`, `dodgeRoll`; retain every existing wind/active/recover/follow key. `groundPound`/`hitReact` are authored families, not newly discovered player inputs; do not invent combat timings for them. `healthSpecial` resolves to the hero's actual special in live play.
* Adjacent states: idle/A/B/C, walk1–4, run1–4, turn, jump/landing, taunt/victory, flinch/stagger, knockdownAir, down/downB/wake, grabHold/grabbed. Coordinate locomotion/floor captures with the other audit, not duplicate ownership.
* For each live attack: idle→attack, hit, whiff, guarded contact when applicable, full uncancelled recovery, buffered next attack/cancel, interrupt by hurt/down, hit-stop, and mirror. Record a complete J1→J4 chain as well as isolated hits. Test simultaneous actors to expose shared-state leakage.

## 4. Scoped production proposal, after the baseline gate

### 4.1 Nous-only production module and cable

Recommended small module: **`nous-motion.js`**, containing Nous's pose/style data (currently `rig.js:1017–1038`) plus explicit attack/cable presentation profiles. It should be pure data/functions, with no import back into `rig.js`, no image loading, and no combat mutation. If cable integration requires a larger implementation, separate a pure `nous-cable.js`; do not fork the entire rig or combat engine.

Suggested seam:

* `rig.js` retains `solve`, layer order, exact held-hand transforms, `applySecondary`, and its current v1 path. For **`kind === 'nous_girl'` only**, it asks the module for a profile and cable target using resolved hand/forearm matrices, move identity, phase/progress, and explicit rope landmarks/lengths.
* `secondary.js` keeps actor-local fixed-step ownership. Improve the rope constraint/turn/freeze branch without changing Teknium/TurboFit spring equations or any v1 path. A new helper can receive plain `pts/prev/start/floor/profile`; it must not create a second frame clock.
* `foot-lock.js` keeps its API, actor key and dt handoff. Cable polish must not independently change planted contacts/root offsets. Consume the final solved hand after foot-lock placement.
* A profile defines relaxed slack curvature, wind-up take-up, active contact target, recover follow-through and decaying settle. Use manifest length once; eliminate the independent 118 literal. Use bounded shape/angular overshoot, **not uncontrolled segment stretch** as the artistic overshoot.
* During whipA/B, solve the visible damaging reach against the existing combat envelope after applying the real origin/scale and final hand pose. Do not simply extend a 118-px ray from an already extended hand. Keep wave and bassDrop as different sound/area profiles; their attack envelope is conveyed by body/FX, not a damaging rope that is absent.
* Keep the rope root on the approved cable-eye landmark and the free plug on its end with the proper tangent. Decide whether the current `tip` landmark is physically correct before changing source metadata. No fake hand-to-coil connection unless the design explicitly changes: the coil is currently spare cable.
* Make mirror behavior explicit: identical fresh R/L scenarios must be reflections. On a live turn, transform **both current and previous rope points** into the new inertial basis (or another explicitly approved continuous policy); do not reset to rest. A facing change and hit-stop together must not reinitialize dynamics. For unchanged pose/view, repeated dt=0 calls must preserve state and rendered geometry exactly. Intentional camera/view changes should be tested as transforms, not misreported as elapsed physics.
* Initial spawn/teleport reset remains a separate deterministic policy. Repeated drawing of one snapshot must not integrate the rope twice. Preserve `__dt ?? dt`, not `__dt || dt`, so zero remains zero.

**Do not tune final sag amplitude, extension, damping, or contact target yet.** Their numeric acceptance budgets must come from main's locked production-path baseline and an approved gameplay-scale silhouette, not the legacy strips. Numerical length/finiteness/freeze assertions can be defined now; perceived “natural” motion cannot be promised from those assertions.

### 4.2 All-three attack presentation, without combat rebalance

1. Add a v2-only presentation descriptor keyed by **combat identity + chain slot**, not just a reused pose string. Keep public names and legacy behavior stable. Distinguish shared hook J3 from true J4, ground/air kick from area special, and noHit locomotion dash from damaging kick/dashAttack. This is a small presentation seam, not a rewritten `MOVES` table.
2. Align a designated contact drawing with first damage opportunity. Preserve existing combat windows; move anticipation into wind and tune **v2 strike** spacing/weapon lag rather than delaying the hitbox. Retain lag on recovery/secondary parts where it does not pull the visible weapon off contact during hit-stop. Keep a readable continuation across the rest of active, and do not remove follow-through to make the clip appear faster.
3. Evaluate actual solved blade/guitar/cable and target hurtbox each active tick, including floor-guard or two-hand corrections. A debug rectangle reaching past a weapon is not fixed by drawing a bigger cosmetic smear. Conversely a long decorative lash must not look like damaging reach when it is outside the box.
4. Hand/arm/back-attack changes remain hero-gated. Shared `animation-timeline.js` or `rig.js` edits require exact legacy-render comparison. Keep combat numbers and target selection unchanged unless the parent separately approves a gameplay change.

### 4.3 Foreshortening: two honest options

**Animation-only scope:** choose side/three-quarter arm actions that the current art supports, reduce direct-to-camera thrusts, and preserve the cuff/wrist/grip chain. This improves readability but does **not** add true foreshortening.

**Actual camera-facing hands (separate approved asset scope):** author matched `fist_front`, `open_front`, and, only where required, paired foreshortened grip-back/grip-front drawings. Prioritize screen-throw/guard/taunt or a specifically approved attack, not a roster-wide asset replacement. Match wrist pivot, cuff overlap and grip axis/point; use explicit stepped hand-view metadata at safe pose boundaries. Carry that metadata through the timeline and choose variants in the v2 solver; do not infer camera-facing orientation from a 2D arm angle. Any projected limb shortening must update child attachment/IK as well as the image and preserve weapon contact. Do not anisotropically squash an isolated hand and call it perspective.

At 0.7 scale Nous's near hand is only 6.3×14 screen px, Teknium's 8.4×11.2 and TurboFit's 8.4×13.3 (manifest image rectangles). Review both native scale and 3×; preserve visible fingers/cuff without growing a mitten. Approved asset changes would require SLICE provenance, manifest/generator sync and alpha-edge checks. None is authorized in this discovery pass.

## 5. Verification requirements and gates

### Before touching production

Main must freeze a new 5d72948 production-path baseline with full revision, tool revision, inputs, initial state, frame dt, dimensions/scale, asset hashes, and output hashes. Keep the previous evidence immutable. Log exact combat name/chain/phase/timer, pose name, player origin/facing/attackFacing, target hurtbox, active box, damage/hit-stop frames, and rendered contact landmark/rope snapshots. The chosen source revision must match the runtime actually served.

New capture must advance the production animation → foot-lock → rig/secondary path once per frame, at the real actor origin, before sampling. Rendering a contact sheet or debug overlay must not perturb actor state. Use both clean footage and synchronized `?debug=1` footage: existing debug boxes are amber outside active and red in active, so a displayed box is not itself proof of damage (`game.js:513–528`). Record reduced-motion/flash settings; special FX are optional presentation (`specialfx.js:15–24`) and must not be the only readable attack cue.

### Focused automated tests to add after approval

* Enumerate actual chain/kick/override/mechanic IDs, explicitly including `axeB`, kneeFinal and both throw kinds. Assert source combat move/timing/range/damage unchanged; test presentation mapping separately.
* Live or deterministic combat replay: inside/outside hurtbox-edge targets, lane edges, rear targets, airborne heights, whiff/guard/hit, J3 versus J4, and two chord hits. Assert actual first/last damage frames, not just `phase==='active'`.
* Cable at 30/60/144 Hz, same initial conditions: finite **both** coordinates, above-floor points and free-plug hull, exact root/free-plug attachment, bounded segment/total length during initial extension/retraction/floor projection, bounded settle and comparable equal-time trajectories. Existing cross-rate tests compare only spring angles, not rope motion.
* Strict dt0 replay: compare all rope points, Verlet history, spring state, variant state and rendered contact position before/after repeated zero-dt frames with fixed inputs. Include active hit-stop and pause, turn while frozen, camera-only transform, respawn/teleport, and two independent actors. Define turn continuity independently of reflection symmetry.
* Perspective variants if approved: exact pivot/child registration, no >1 px alpha seam, no grip/back/front layering break, grip within 1 rig px and 1 degree, far grip within 2 px, proper stepped selection with no chatter, no delayed contact swap at a 50 ms hold boundary, and mirror-equivalent selection. Test actual intermediate timeline frames, not only named keys.
* Preserve existing ankle/contact/wrist/floor tests; coordinate any weapon floor correction with the other audit. Tests over named static poses alone cannot approve attack contact or cable physics.

### Integration/review gate

Run `npm test`, `npm run test:pixels`, browser gameplay smoke and `tools/level-layout-smoke.mjs` using parent-approved fresh output paths. **Do not run `npm run rigs:after` here:** its package script targets existing `evidence/hero-assets-v2/after/contact-sheets`. Rebuild is not required for this plain ES-module game; ensure the server/browser is serving the intended revision and reload modules for verification.

Review every §3 before/after pair at native playback speed, slow motion, and native scale, with frame landmarks for wind end, first active draw, first damage, frozen impact, last active, follow-through, guard. No claim that attacks are “aligned” until those actual active frames and target overlaps are reviewed. Repeat legacy hero solve/render hash checks and require byte-identical turtle/Don render outputs. Final acceptance includes a diff showing no excluded files and no existing evidence modifications.

## 6. Work completed and remaining blockers

Executed here: **`node tests/check-hero-v2.mjs` PASS** at 5d72948. Output: Teknium 168, Nous 176, TurboFit 168 tested facing-labelled frames; max planted sole tilt 0.00°; weapon maximum Y 89.4/47.6/89.4; TurboFit 30 two-hand cases; existing variant/spring/proportion/alpha checks passed. Also ran read-only Node inventories and static/cable probes described above. No production edit, browser capture, or baseline regeneration performed. Passing this suite does not cover the newly identified rope and attack-alignment gaps.

Remaining blockers: immutable current live baselines are main-owned and not yet verified in this workstream; visual contact budgets and preferred sag silhouette have not been approved; camera-facing hand art needs explicit asset authorization; Teknium/TurboFit solver ownership remains with the other audit. No blocker justifies relaxing byte-identical legacy rendering or changing combat timing/range.

Child ledger (both read-only; no descendants):

* `ses_ebe8bfe19ffe7hew7JyrPW8HTs` — worker-sol, Nous cable mechanics — **completed**.
* `ses_ebe8bdce7ffeB1WJut9tlHEY2W` — worker-sol, attack timing/inventory — **completed**.

Their findings were reviewed against source, the cable probe was rerun with precise values, hand/static reach measurements were added, and the move inventory was expanded with the actual grab module variants and the missing TurboFit `axeB` test case.
