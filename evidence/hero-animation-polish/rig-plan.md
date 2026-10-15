# Teknium / TurboFit rig and posture discovery

Baseline: `feat/hero-animation-polish` at `5d72948` (PR3 head). **Discovery only:** no production code, assets, generated files, or historical evidence changed by this workstream. The only repository output is this document. Coordinates are rig pixels; `FOOT_Y = 90`, gameplay scale is `0.7`, and clockwise-positive angles refer to the right-facing rig before mirroring.

## Scope, evidence, and provenance

Read the historical [AUDIT](../hero-assets-v2/AUDIT.md), [implementation README](../hero-assets-v2/README.md), current [MANIFEST](../../assets/heroes/MANIFEST.md), `rig.js`, `rig-geometry.js`, `foot-lock.js`, `hero-motion.js`, `animation-timeline.js`, generated `hero-rigs.js`, relevant tests/generators, and TurboFit's `src/{SLICE.json,design.jpg,sheetA.jpg,sheetB.jpg,heads.jpg}`. Images inspected include both heroes' `comparison/*_3x-crop.png`, turn/run strips and source sheets. Historical before images are **not** current failures: they document why separate hands/feet were introduced. The current failures below are residual v2 posture/readability problems.

The old audit's coats, tattoos, oversized frontal TurboFit head, and baked-in feet describe the pre-v2 assets; do not reintroduce that design or apply its old proportion measurements to this branch. Current source art is authoritative. Conversely, passing geometry tests do not prove readable anatomy.

Verification in this workstream uses read-only Node probes, selected PNG-alpha measurements, and image inspection. Full baseline suites/tooling belong to the parent workstream; historical green results are not presented here as newly run tests. One optional image-enlargement attempt stopped immediately because the current default Python has no `PIL`; source images were inspected directly instead. No dependencies were installed.

### Worker ledger and requested model

The available model catalog lists `openai/gpt-6-astra` with `xhigh`, but the configured-worker policy prohibits model overrides. Workers therefore used configured **GPT-6 Astra**, with reasoning variant **not exposed / xhigh unverified**. Do not describe this as a verified xhigh run.

| Child session | Exclusive read-only investigation | Status |
| --- | --- | --- |
| `ses_ebe8bee9affeJYLEiFqRrdymxG` | Weapon guard, shoulder/elbow visibility, in-memory pose candidates | **Completed**, including bounded follow-up; no descendants |
| `ses_ebe8bc7eeffeY14rPoM558TNpZ` | Fast-run toe support, ankle reach, fixture diagnosis | **Completed**; no descendants |

Both children were instructed not to spawn descendants. No more than two direct child tasks were active.

## 1. Measured residual failures and coverage gaps

### 1.1 Weapon floor guards hide authoring errors

The named-pose audit reproduces the historical **Teknium 8/118** and **TurboFit 16/122** guard-adjusted counts. Those denominators mean **all hero-prefixed named poses**, including synthetic aliases from other move sets—not independently established gameplay reachability. The current `tests/check-hero-v2.mjs:18–21` selector finds **84 poses for each hero**, of which **3 Teknium / 9 TurboFit** require the guard. Its `HERO_MOVES` enumeration misses `turbofit_axeB_*`, even though `HERO_CHAIN.turbofit` selects `axeB` (`rig.js:1068`). A replacement fixture list must include actual chain/kick/finisher/mechanic selections, not merely copy the existing denominator.

These measurements compare production solve with an in-memory copy having only the weapon-floor guard disabled. “Before” is after ordinary wrist mapping and foot planting but before that guard. No source file was altered. Final values pass the existing `Y <= 92` check; the problem is the size and visibility of the correction.

| Pose | Additional wrist correction | Elbow correction | Lowest weapon Y, before → after |
| --- | ---: | ---: | ---: |
| `teknium_grabThrow_active` | −32° | 0° | 102.51 → 88.88 |
| `teknium_grabThrow_follow` | +2° | 0° | 90.16 → 89.27 |
| `teknium_healthSpecial_active` | −34° | 0° | 95.41 → 89.38 |
| `turbofit_turn` | −38° | 0° | 102.44 → 89.15 |
| `turbofit_taunt` | −30° | 0° | 111.58 → 89.35 |
| `turbofit_wake` | −14° | **−10°** | 106.90 → 88.88 |
| `turbofit_axe_follow` | −37° | 0° | 112.72 → 88.62 |
| `turbofit_axeHeavy_follow` | −25° | 0° | 109.44 → 89.40 |
| `turbofit_chord_active` | −23° | 0° | 112.03 → 89.35 |
| `turbofit_chord_follow` | −26° | 0° | 113.70 → 89.44 |
| `turbofit_juggle_active` | −1° | 0° | 89.95 → 88.95 |
| `turbofit_grabThrow_active` | **−56°** | 0° | 92.58 → 89.32 |

`rig.js:773–808` searches discrete wrist offsets, then elbow offsets, for floor clearance within the wrist window. It has no silhouette or temporal-continuity objective. The −56° correction fixes only 2.58 px of raw penetration; the legal-window search, not penetration depth alone, determines the jump. `wake` changes `farm` from −54° to −64°. **Keep the guard as a safety net; do not relax the floor test or expand wrist limits to conceal bad authored carriage.**

### 1.2 Hidden joints and baked shoulder caps

Measuring the solved far-elbow center in the selected torso image, with torso alpha ≥128 and the forearm behind the torso, yields **82/118 Teknium** and **54/122 TurboFit** named poses with an occluded far elbow. These are visibility diagnostics, not 136 proven disconnections: a far elbow may intentionally be hidden. Representative fully opaque intersections are:

| Pose | Solved far shoulder / elbow | Elbow in torso-image pixels | Torso alpha |
| --- | --- | --- | ---: |
| `teknium_idleA` | +8° / −30° | (27.82, 43.68) | 255 |
| `teknium_bladeA_active` | +30° / −90° | (11.45, 39.58) | 255 |
| `teknium_bladeA_follow` | +34° / −84° | (9.79, 38.36) | 255 |
| `teknium_run3` | +40.2° / −30° | (11.24, 36.21) | 255 |
| `turbofit_headbang_active` | +40° / −40° | (22.66, 44.88) | 255 |
| `turbofit_run3` | +20.8° / −60° | (36.84, 51.46) | 255 |
| `turbofit_axeB_active` | +20° / −80° | (38.39, 51.65) | 255 |

**Image diagnosis:** TurboFit's source `sheetA.jpg` contains skin-colored oval shoulder caps in both torso drawings. The after comparison's axe/axeHeavy poses show a cap while the far upper arm disappears behind the vest, producing an apparent shoulder stump. The bones remain attached; this is a painted-cap/layer/silhouette problem, not a gap solvable by increasing overlap. Teknium's thin sleeves and torso-colored far arm merge in idle/run and some blade poses; deliberate elbow separation should be authored where the free arm contributes to the action, while genuine far-side occlusion remains permissible.

TurboFit's active two-hand solve moves the far forearm and hand in front of the body but **leaves the upper arm behind it** (`rig.js:829–835`). The active near/far arm silhouette must be reviewed as a chain, not as isolated joint centers. Moving the entire arm forward for every pose would create different layering errors.

Current anatomical attachment facts (not proposed edits):

| Quantity | Teknium | TurboFit |
| --- | --- | --- |
| Torso size / pivot | 41×62 / (20,31) | 57×70 / (28,35) |
| Near / far shoulder in torso pixels | (8,14) / (32,11) | (6,17) / (50,15) |
| Upper arm / forearm wrist-chain length | 33 / 31.02 px | 39 / 36 px |
| Near hand pivot → grip | (5,1) → (5,11) | (5,1) → (5,14) |
| Weapon pivot → tip | (9,4) → (92,3) | (23,15) → (105,15) |
| Second grip | none | (45,15), 22 px from first grip |

Torso twist also shifts shoulders and narrows the torso (`rig.js:487–502`); review effective matrices, not just raw manifest coordinates. Do not move all pivots or lengthen limbs merely to make a hidden elbow visible.

Other conspicuous authored extremes needing dedicated poses:

- `teknium_bladeA_wind`: near shoulder −40°, elbow −150° (maximal fold).
- `turbofit_axe_wind`: torso −14°, near +140°/−10°, far +150°/−20°.
- `turbofit_axeHeavy_wind`: torso −20°, near +145°/−8°, far +150°/−20°.
- `turbofit_chord_wind`: torso −16°, near +140°/−10°, far +150°/−10°.

The heavy wind-ups send almost-straight arms overhead/back using the same three-quarter cutouts. `HERO_JOINT_LIMITS` has no shoulder constraint (`rig-geometry.js:43–47`); the two-hand IK admits far shoulder angles in [−200°,200°]. Numeric legality is not anatomical approval. Generic mechanics also receive a blanket far-elbow rewrite to −92° (`rig.js:1093–1102`), rather than hero-specific carriage.

### 1.3 Hands: actual availability differs from the general README description

| Hero / slot | Current drawing | Available slot variants | Current selection |
| --- | --- | --- | --- |
| Teknium `hand` | grip_back | none | Always armed gripping hand |
| Teknium `hand_front` | grip_front | none | Always overlays near grip |
| Teknium `hand_b` | fist | `open` | Open only for taunt/victory |
| TurboFit `hand` | grip_back | none | Always armed gripping hand |
| TurboFit `hand_front` | grip_front | none | Always overlays near grip |
| TurboFit `hand_b` | open | `grip_far` | Changes when two-hand IK succeeds |

In the current 84-pose v2 selector, Teknium uses **82 far fists / 2 open hands**; TurboFit uses **69 open / 15 `grip_far`**. The latter produces the test's 30 “two-hand frames” because each pose is enumerated twice for facings. Static `axeB_wind/active/follow/recover` all remain one-handed/open. This is not automatically wrong choreography, but it must become an explicit decision rather than a reachability accident.

**Art mismatch:** TurboFit's third hand on `src/sheetB.jpg`, used by `SLICE.json.parts.grip_far`, is an open/cupped palm with spread fingers, not a fist closing around a guitar neck. Its marker `(7,15)` can coincide perfectly with `grip2` without the pixels showing a grip. The source's first two closed hands carry a sample rod; the slicer uses them for the near registered grip pair. Rotating the existing far open palm cannot manufacture closed fingers.

The normal far hand is a back-of-hand drawing, whereas `grip_far` exposes the palm. That view change is useful only with deliberate arm rotation and supported contact. In the static gameplay comparisons, a large outstretched hand beside the neck often reads as a gesture rather than weight-bearing guitar support. Gameplay scale and enlarged source-art review are both required.

`rig.js:1154` deliberately exempts `hand_b` transitions into/out of `grip_far` from the 50 ms variant hold, so the hand follows instantaneous IK state. The current test checks **head** hysteresis only. Replaying the historical 60 Hz combo frame builder (110 frames, scales 0.7 and 1, right-facing) gives far-grip changes at frames **11 on, 20 off, 46 on, 56 off, 71 on, 91 off**. This fixture does not show a sub-50 ms toggle, but identifies six engagement/release boundaries needing visual continuity checks; it does not prove every speed/tween is stable.

**Metadata transport gap:** putting `__v:{hand_b:'open'}` on a Teknium `idleA` input does not select it. `solveV2` uses pose-name rules and `opts.variants`, not `__v` (`rig.js:821–828`). An in-memory pose with `wrist:12`, `foot:11`, and `__v` loses all three through `createAnim().step`, because `animation-timeline.js:8,15–20` copies only its fixed numeric keys and writes only its own metadata at lines 114–117. The old audit's proposed `wrist`, `foot`, `__v`, and `__footRoll` authoring API is **not implemented**. A plan relying on those keys alone would silently do nothing.

Hand changes should therefore start with a narrowly explicit per-hero presentation policy, not a new unused pose tag. Keep the near gripping hand while a weapon is carried; adding an empty near hand also needs an explicit weapon-hide/holster/transfer decision, otherwise a blade/guitar remains attached to an open palm. Teknium already has a usable far open/fist pair. TurboFit needs either an approved closed far-grip derivation from its existing grip artwork, or a new approved source drawing with appropriate finger occlusion. Do not hand-paint only the generated PNG.

### 1.4 All 22 fast-run toe samples are Teknium, and the sole rotates beyond vertical

The historical count reproduces **exactly** at this head: **22 Teknium samples, 11 per facing; zero TurboFit and zero Nous Girl**. The reproduction is the world-contact fixture at `check-animation.mjs:59–91`; there is no `tests/check-world-feet.mjs` in this tree.

Exact conditions, needed for a durable regression fixture:

- Fresh animation and foot-lock state per hero, facing, and walk/run case.
- 120 frames at `dt=1/60`, initial `(x,y)=(200,0)`, scale `0.7`.
- Run speed `385` world px/s; walk control case `220`.
- Advance X before each sample. Run `walkT=(frame+1)*385/60/256`; phase `((walkT*8)%4+4)%4`; select `run${floor(walkT*8)%4+1}`.
- Timeline time is `frame/60`, not elapsed displacement time `(frame+1)/60`.
- Sequence `anim.step → footLocks.place → solve` with the resulting foot targets. The near/far contacts below are both trailing stance legs, not swing legs. Local geometry is equivalent in the two facings, while world anchor positions are mirrored.

| Zero-based frame | Time s | Pose | Phase | Support | Flat reach deficit, rig px | Sole angle |
| ---: | ---: | --- | ---: | --- | ---: | ---: |
| 18 | 0.300000 | `run4` | 3.809896 | back | 3.866299 | 107.054157° |
| 28 | 0.466667 | `run2` | 1.815104 | front | 3.459802 | 107.735707° |
| 38 | 0.633333 | `run4` | 3.820313 | back | 3.814269 | 107.102585° |
| 48 | 0.800000 | `run2` | 1.825521 | front | 3.497028 | 107.742490° |
| 58 | 0.966667 | `run4` | 3.830729 | back | 3.765349 | 107.148050° |
| 68 | 1.133333 | `run2` | 1.835938 | front | 3.537934 | 107.746016° |
| 78 | 1.300000 | `run4` | 3.841146 | back | 3.720613 | 107.190583° |
| 88 | 1.466667 | `run2` | 1.846354 | front | 3.583578 | 107.746327° |
| 98 | 1.633333 | `run4` | 3.851563 | back | 3.681127 | 107.230231° |
| 108 | 1.800000 | `run2` | 1.856771 | front | 3.635009 | 107.743470° |
| 118 | 1.966667 | `run4` | 3.861979 | back | 3.647956 | 107.267056° |

Each row occurs once in each facing. Every walk/run case has 240 support samples across the two facings. The table's reach deficit is hip→flat-ankle distance minus the two segment lengths, **after the flat planting pass's chosen pelvis height and before toe fallback**.

Representative worst frame 18: flat ankle target `[-69.789951,76]`, hip `[1.470191,49.886492]`, segment lengths `38.013156 + 34.014703 = 72.027858`, target distance `75.894158`, trailing X separation `71.260142`, root Y `27.501563`. The toe fallback reduces contact residual to effectively zero but lifts the heel **25.812755 rig px / 18.068929 screen px** and turns the sole **107.054157°**. A zero final toe residual is therefore not a successful natural foot pose.

Cause: `foot-lock.js:23–30` keeps the ankle X locked for the whole support interval. `rig.js:712–725` invokes toe fallback whenever flat error exceeds `0.5`, with no authored late-stance permission. It extends the IK lower segment from knee→ankle to knee→toe and accepts an improved residual; lines 753–770 then force foot-relative-to-shin angle to zero. The sneaker follows the shin rather than making a controlled ankle roll. These happen in late stance, but they are **unreachable-target fallbacks**, not authored toe-off.

Do not simply add extra pelvis drop: the horizontal reach already consumes nearly the entire leg length. Keeping X fixed would require an additional **13.65–15.63 rig px** downward translation for these frames. That is a diagnostic full-extension bound, not an approved animation change. Do not raise error tolerances or release ordinary stance anchors merely to reduce the count.

### 1.5 TurboFit's zero toe count conceals a larger pelvis discontinuity

Hip→knee→ankle reach is Teknium `72.027858`, TurboFit `84`, Nous Girl `79.012818` rig px. TurboFit's longer chain reaches every flat target in the exact fast-run fixture; maximum pre-fallback error is numerical noise. Its pelvis nevertheless jumps at support exchange:

| Hero | Largest consecutive-frame root-Y jump | Screen jump at 0.7 | Frame exchange |
| --- | ---: | ---: | --- |
| Teknium | **44.636918** | **31.245843** | 48 → 49 |
| TurboFit | **55.018627** | **38.513039** | 108 → 109 |
| Nous Girl, contextual control only | 22.094623 | 15.466236 | 108 → 109 |

TurboFit frame 108 has front support, phase `1.856771`, root Y `25.010898`; frame 109 switches to back support, phase `2.057292`, root Y `−30.007730`. `plantFeet` derives baseline height from the currently designated support leg's authored endpoint (`rig-geometry.js:145–148`), while the support changes immediately at phases 2/0. Ordinary gait has no root settling (`foot-lock.js:19–20,33–37` enables it around down/wake only). A pose `dy` alone cannot fix a planted root calculated by the solver. A post-solve root clamp can also make locked contacts unreachable; continuity and reach must be solved together.

**The historical run images do not depict the 22-event fixture.** Their harness uses speed **280**, scale **1**, initial X `400`, 55 simulation frames for two cycles, and capture every third frame plus the final frame (`after/harness/strips.js:28–35,43,65–66`). Numerical replay of those conditions has **zero toe fallbacks for all three heroes**. It still has root jumps of Teknium `18.458777` and TurboFit `29.995882` rig px, consistent with the visible crouch/rise changes. New evidence must capture the exact 385/0.7 frames rather than cite the old slower strip as proof of the 22 failures.

## 2. Concrete proposed pose changes, not an implementation

These scratch-only candidates were rechecked with the production solver. They are starting points for visual approval, **not approved finished poses**. No combat or production files were changed.

### Arm / weapon candidates

| Pose | Exact authored channel changes | Guard wrist baseline → candidate | Candidate lowest weapon Y | Remaining condition |
| --- | --- | ---: | ---: | --- |
| `teknium_idleA` | `uarm_b:8→−18`, `farm_b:−30→−42` | 0° → 0° | 40.13 | Far elbow becomes visible; shoulder remains intentionally covered |
| `teknium_grabThrow_active` | `uarm:26→11`, `farm:−6→−36` | −32° → **0°** | 87.89 | Only 2.11 px clearance; review paired throw transition |
| `teknium_healthSpecial_active` | `uarm:34→44`, `farm:−8→−13` | −34° → **0°** | 87.06 | Orientation-sensitive low point; far-arm visibility still unresolved |
| `turbofit_axe_follow` | `uarm:0→−5`, `farm:−24→−54` | −37° → **0°** | 87.12 | Two-hand IK retained; shoulder-cap appearance unresolved |
| `turbofit_axeHeavy_follow` | `farm:−44→−69`, retain `uarm:−2` | −25° → **0°** | 82.93 | Two-hand IK retained; more floor margin |
| `turbofit_chord_active` | `uarm:−30→−25`, `farm:−6→−36` | −23° → **0°** | 81.04 | Two-hand IK retained; supported bent-arm carriage |

All six have **zero candidate guard elbow correction and solved torso translation delta `[0,0]`**. They preserve torso/head, legs, twist, timing and weapon key. These are upstream shoulder/elbow changes, not the guard delta baked into a weapon key; ordinary wrist mapping uses the saturating `wristAngle(kind, weapon + grip) - HOLD[kind]` (`rig.js:496`), so weapon-key changes are not linear wrist changes.

The Teknium idle candidate moves the far elbow from torso-local `(27.82,43.68)`, alpha 255, to `(42.74,42.38)`, outside the 41-px-wide torso, alpha 0. The two Teknium attack candidates remove guard dependence but leave their far elbows hidden. The three TurboFit candidates keep the far forearm after the torso, with solved far shoulder/elbow respectively `(19.24,−75.29)`, `(23.53,−94.41)`, `(15.17,−86.57)`. That only excludes occlusion by the torso; it does not guarantee visibility against the near arm/guitar/hand or remove baked shoulder caps.

No numeric TurboFit **turn** candidate is promoted: clearance improvements changed two-hand engagement during front-variant switching. Alternative **heavy wind-ups** cleared the floor but remained one-handed and redirected the overhead guitar, so they failed the desired supported-wind-up criterion. These require pose/art review rather than pretending a bounded numeric search solved the anatomy. `taunt`, `wake`, `grabThrow_active`, `axeB`, and headbang need explicit follow-up fixtures too.

### Run contact candidates and the remaining solver task

Start with **Teknium `run1.thigh = −36.3°` and `run3.thigh_b = −36.3°`**, from −32.3°: a −4° adjustment to the entering/contact thigh only. Independent replay in **both facings** changes 11 toe fallbacks per facing to **0**, with **0 anchor releases** and no metadata/art changes. Root discontinuity is reduced only to **41.738895 rig px** in each facing, so the candidate alone is not a completed fast-run fix.

| Additional contact-thigh angle | Teknium toe samples per facing | Teknium maximum root jump | TurboFit maximum root jump |
| ---: | ---: | ---: | ---: |
| 0° | 11 | 44.636918 | 55.018627 |
| −2° | 11 | 44.229539 | 47.835056 |
| −4° | 0 | 41.738895 | 42.553218 |
| −6° | 0 | 37.165887 | 38.173279 |
| −8° | 0 | 32.511322 | 33.695703 |
| −10° | 0 | 27.775571 | 30.120151 |

All listed probes retain zero TurboFit toe fallbacks and zero anchor releases. TurboFit starts at −34.2°; no leg-length increase is justified. Simply choosing −10° because it reduces a metric would distort the stride while leaving a huge root pop. Tune each hero's passing/contact poses with a **hero-scoped continuous pelvis/support transition policy**. Do not alter the shared four-pose run template for the protected heroes.

Distinguish three states in diagnostics and future authoring: **flat stance**, **explicit bounded toe roll**, and **unreachable fallback**. Count unexpected fallback as failure even when final residual is zero. A proposed initial reviewed toe-roll envelope is ≤45° absolute sole tilt in local right-facing coordinates, restricted to late stance; the old 107° fallback is not acceptable. A proposed ordinary-gait pelvis-velocity budget is 300 rig px/s (5 px per 60 Hz step), evaluated with reach and world lock, not imposed by a final transform clamp. These are proposed acceptance budgets, not existing project guarantees; review against the desired gait before implementation.

## 3. Source-of-truth and safe future edit ownership

`hero-rigs.js` contains **generated art/rig metadata, not authored poses**. Its header names `tools/gen-hero-rigs.mjs`; do not move pose overrides into it or hand-edit its pivots.

The actual provenance chain is:

```text
hero src sheets + src/SLICE.json parts/rig configuration
    → tools/slice-hero-parts.py <hero> --write
    → hero PNGs + SLICE.json measured/hashes + that hero's MANIFEST slice block
MANIFEST tables + Layers:/Wrist:/Weapon grip: lines
    → tools/gen-hero-rigs.mjs
    → hero-rigs.js
hero PNG alpha
    → tools/generate-support.mjs
    → hero-support.js
```

For an attachment-only change, update the responsible `SLICE.json` anchor or `rig.*.attach/attachOffset` and reproduce its manifest row; do not leave an isolated hand-edited manifest attachment that the next slice overwrites. `tests/check-rig-sources.mjs` checks manifest→JS equality and sheet/PNG hashes, **not** re-sliced manifest-row equality. That gap needs a targeted provenance fixture. `Layers:` / `Wrist:` / `Weapon grip:` lines outside the slice blocks are manifest-owned. Changing a pivot does not itself require a new pixel hull, but actual PNG alpha changes do. The support generator currently writes the shared output directly and skips `_b` slots and variants; a new distinct far-hand silhouette needs explicit support/visibility fixture treatment, not an assumption that a base-hand hull covers it.

### Exact proposed ownership boundaries

| Owner | Exclusive writable paths in later implementation | Constraints / handoff |
| --- | --- | --- |
| Teknium pose worker | New `hero-poses-teknium.js`; new `tests/fixtures/hero-animation-polish/teknium-poses.json` | Export an installer or pure overrides receiving the pose registry; only clone/replace `teknium_*`. No import back into `rig.js`, no combat changes, no shared-file edits. |
| TurboFit pose worker | New `hero-poses-turbofit.js`; new `tests/fixtures/hero-animation-polish/turbofit-poses.json` | Same rule for `turbofit_*`; include `axeB` explicitly. May run independently of Teknium after interface is fixed. |
| Runtime integrator | `rig.js`, `foot-lock.js`, targeted v2 contact policy in `rig-geometry.js`, and only if needed `animation-timeline.js` / `hero-motion.js`; new shared polish tests | One writer. Add both scoped installers **after** the registration/fallback loop ending at `rig.js:1103`. Review shared hooks with the separate cable/animation workstream before edits. Do not alter generic/turtle/Don behavior. |
| Asset/provenance owner | `assets/heroes/{teknium,turbofit}/src/**` and generated assets for the selected hero; `assets/heroes/MANIFEST.md`; generated `hero-rigs.js`, `hero-support.js` | Serialize regeneration of shared outputs. Author shoulder-cap cleanup / far hand in source, not generated PNGs. No changes to Nous assets from this workstream. |
| Test/evidence integrator | New `tests/check-hero-animation-polish.mjs`, shared test selectors as needed, new evidence under `evidence/hero-animation-polish/` | Coordinate test integration/package script changes with parent. Historical evidence stays immutable. |

Install scoped overrides after `addRunPoses` / `addDownPoses`, native move registration, and generic fallback rewrites; otherwise later code silently overwrites them. Clone every modified pose object, including recoveries currently aliased to idle. Avoid modifying the shared `POSES.turn`, generic mechanics, or global `HERO_MOTION` entries as a shortcut. Preserve `HERO_CHAIN`, `HERO_KICK`, combat IDs, hit windows, damage, and `hero-moves.js` combat definitions. If optional numeric/stepped channels are introduced, transport them only for opted-in v2 heroes and prove legacy byte-equivalence.

**Explicitly forbidden:** turtles and `don_piedro` assets/poses/outputs, `don.js`, `title.js`, `cinematics.js`, `assets/cine/**`, and `evidence/hero-assets-v2/**`. Reading them for baseline preservation is allowed; changing their behavior through shared solver/timeline code is not.

## 4. Required fixture and acceptance design

1. **Reachable pose coverage:** union the heroes' actual chain, kick, combat finisher, mechanics and locomotion/reaction states. Assert `turbofit_axeB_*` inclusion. Keep an additional all-named-pose sweep, but label it separately rather than calling synthetic aliases reachable.
2. **Weapon carriage:** record pose/time, raw hull Y, final hull Y, ordinary wrist mapping, extra wrist correction, and elbow correction. For newly authored grounded keys target **zero guard correction**, with a proposed ≤5° residual safety budget only where explicitly reviewed; no blanket allowance for today's 34–56° corrections. Keep final `Y <= FOOT_Y + 2`, wrist-window and grip checks. Dense transition sampling must catch branch jumps hidden between keys.
3. **Anatomy/visibility:** render per-part masks at gameplay scale and 3×, in both facings. Record later-layer occlusion of shoulder/elbow neighborhoods and a visible connected arm path, not merely alpha contact. Whitelist deliberate far-side hiding by pose/phase. Include TurboFit baked-cap close-ups; do not set an impossible rule that every far elbow must always be visible.
4. **Heavy two-hand choreography:** explicitly name required two-hand phases, optional/release phases and elbow bend direction. Test shoulder/elbow ranges, second-grip error ≤2 px, near grip ≤1 px / 1°, finger/shaft occlusion, and arm layer continuity. The existing test only checks a grip **if** IK happens to engage. Do not force reach by stretching limbs.
5. **Hand variants:** isolated open/fist/grip source contact sheet; idle/taunt/victory/grab/reaction/attack strips; wrist registration and no doubled grip-front overlay; selected file and geometry agree. Assert actual closed-finger appearance around the far guitar neck, not just a marker named `grip`. Exercise all six measured combo boundaries and both facing reversals. If an engagement hysteresis policy is added, release when unreachable rather than keeping a disconnected hand for 50 ms.
6. **Pose-channel API:** if new channels/tags are introduced, test `POSES → target/mix → createAnim.step → footLocks.place → solve → draw`; verify stepped tags, numeric interpolation, hit-stop, and restore behavior. Tests must fail on the currently ignored `__v` / dropped wrist-foot keys rather than accepting a no-op patch.
7. **Protected regressions:** preserve the four turtles and Don's pose/matrix hashes, asset hashes and contact-sheet pixels. Exercise unchanged hit timing, foot world-lock drift, down/get-up, collision/depth queue, and real-browser draw. Do not regenerate an expected baseline to excuse a protected change.
8. **Provenance:** `node tools/gen-hero-rigs.mjs --check`, `node tests/check-rig-sources.mjs`, plus a dry-run source/spec→manifest row comparison for changed heroes. Prove unchanged hero sections stay byte-identical after shared generation. All new captures must explicitly target the new evidence directory or scratch, never `npm run rigs:after` (which targets historical evidence).
9. **Exact fast-run contacts:** keep the full 120-frame 385/0.7 fixture and both facings. Capture Teknium windows `17–20`, `27–30`, …, `107–110`, and `117–119`, plus TurboFit `107–110`, with root/ankle/heel/toe overlays. Record pre-fallback error, reach margin, root Y/velocity, support side, fallback reason and anchor release count. Do not skip a flatness failure solely because `toeOff` became true. Test both legitimate toe contact and heel clearance, all foot hulls, no stretch, no ordinary support release, and existing world drift tolerance.
10. **Continuous gait:** separately retain the slower historical 280/1 fixture; run 30/60/144 Hz with equivalent world motion, phase-boundary probes, startup, walk↔run and turn transitions, and the actual gameplay speeds chosen by the parent. Require no support-exchange jump outside an agreed pelvis budget, no unintended toe fallback, and `dt=0` freeze of pose/root/anchors. Static pose checks currently report **0 toe-offs** and cannot substitute for these dynamic frames.

The parent should then run the full project checks (`npm test`, `npm run test:pixels`, `npm run test:browser`, layout smoke) after implementation. This document proposes those checks; it does not claim they were run here.

## 5. Integration order, verification, and open decisions

1. Parent lands fresh baseline/protected-output checks and the exact dynamic/pose diagnostics first. Preserve the currently failing metrics as evidence, not as accepted future targets.
2. Freeze the two hero-module interfaces and shared runtime ownership. Add opt-in hooks once, after the current registration loop. Never give parallel workers overlapping edits in `rig.js`, the timeline or generated outputs.
3. Parallelize independent Teknium and TurboFit pose authoring in their new files. Start with the measured zero-guard candidates, then expand to idle/walk/run silhouette, `axeB`, turn/reactions and required two-hand phases. Keep choreography/combat timing unchanged.
4. Integrate hero-scoped contact reach and continuous pelvis/support behavior. The −4° Teknium contact probe is a useful seed, not a replacement for this solver work. Coordinate metadata transport with the parent's animation/cable workstream rather than landing two incompatible APIs.
5. Serialize source-art cleanup (TurboFit shoulder caps and an actual far grip) and manifest/generator integration. Reapprove pose silhouettes after the art change, because occlusion measurements depend on its alpha.
6. Produce exact-frame gameplay-scale/3× comparisons, run targeted tests and full checks, and verify protected heroes before calling the work done.

Reviewed targeted checks: the foot worker's scratch `probes.mjs` and `summary.mjs` were rerun by this workstream and reproduced the counts/root jumps above; all six arm candidates were independently solved again and reproduced their zero wrist guard, retained TurboFit grips and `[0,0]` torso translation. Hand inventory, variant transport no-op, `axeB` one-hand state and the 110-frame grip-boundary fixture were also measured with read-only inline Node commands. Detailed toe-event instrumentation is scratch-only at `/tmp/opencode/toe-discovery/{measure.mjs,results.json,probes.mjs,summary.mjs,rig.mjs}`; the exact reproduction conditions and event table above are the durable record.

**Open decisions / blockers to final implementation acceptance:** choose an approved supported TurboFit heavy wind-up and turn choreography; approve shoulder-cap cleanup and a closed far-grip drawing/derivation; agree the pelvis/roll continuity budget and implementation with the runtime integrator. No existing art pivot or limb-length change is required by the demonstrated first fixes. No candidate here has a completed temporal/raster approval pass. All descendants are complete.
