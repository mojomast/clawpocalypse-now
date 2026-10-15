# Hero assets v2: audit, worklist and plan

Discovery task B. This is an audit only: no production code or assets were changed.
Baseline: `feat/natural-hero-assets` @ **a53e191**, stacked on open PR #1. Evidence is in
[`before/`](before/README.md); paths below are relative to `evidence/hero-assets-v2/`.

Units. All sizes and coordinates are in **rig px**, the scale the part PNGs are stored at and that
`hero-rigs.js` uses (torso = 68 px tall). Gameplay draws heroes at `RIG_SCALE 0.7` on a 960×540 canvas,
so on screen 1 rig px ≈ 0.7 px. Angles use the existing convention: degrees, clockwise-positive on the
right-facing rig, with the whole rig mirrored for left-facing.

---

## 0. Source of truth: MANIFEST.md and generator provenance

**Finding: the authoring copy matches the repo exactly.**

| Check | Result |
| --- | --- |
| `pizza-panic-dev/tools/gen_enemy_rigs.mjs --out /tmp/hv2/gen` (dry run, reading `pizza-panic/assets/heroes/MANIFEST.md`) | Generated `hero-rigs.js` is **byte-identical** to the repo's `hero-rigs.js`. Generated `enemy-rigs.js` is also identical. |
| `pizza-panic/hero-rigs.js` (live authoring copy) | Byte-identical to the repo's. |
| 55 hero part PNGs in `pizza-panic/assets/heroes/<id>/` | All byte-identical to the repo's. The only extra file is `nous_girl_fx_burst.png`, which is also in the repo. |
| `pizza-panic/tools/` | **Does not exist.** All tools are in `pizza-panic-dev/tools/`. |

How the current state was reached, and what is missing:

* `hero-rigs.js` says it was generated "by tools/gen_enemy_rigs.mjs". That generator lives in a
  different checkout. Its **default writes over `../../pizza-panic/{enemy,hero}-rigs.js`**; only `--out`
  makes it safe. It also derives every back limb with a hard-coded `ax-6, ay-2` shoulder/hip offset, and
  the only per-part semantics it reads from the manifest are `Weapon grip:` lines. Behaviour that matters
  (`SOLES`, `WRIST`, `PART_SCALE`, `GRIP_OFF`, `WEAPON_IN_HAND`, `SKIRTED`, `BACK_TINT`, layer order)
  is hand-written in `rig.js`/`don.js`, outside any source of truth.
* Original part sheets exist only in a stale app snapshot:
  `/home/box/orbitdesktop/.runtime/apps/pizza-panic-37f888b665a9bba26304fbe1/assets/heroes/<id>/sheet.jpg`
  (1280×720, seven heroes, no Don), with an older MANIFEST. That snapshot's parts **differ** from the
  current ones for 12 files: turbofit ×6, teknium head/torso/uarm/farm, nous_girl head, turtle_blue
  torso. The older MANIFEST rows differ accordingly (for example turbofit head 49×70 → 61×64, teknium
  head 34×37 → 40×43, purple/orange head attach `ay` 6 → 8).
  See `before/review/source_sheets.jpg`: the turbofit sheet's "head" is hair seen from behind, which is
  why it was later replaced (`pizza-panic-dev/check-turbofit-head.mjs`; old head in
  `pizza-panic-archive/turbofit_head_v1/`).
* Slicers:
  * The iteration-7/8 sheets were cut by `/workspace/pizza-enemies/slice_parts.py`. That file is outside
    both tools folders, and its defaults are torso 34 px with output to the *enemies* folder.
  * Don is cut by `pizza-panic-dev/tools/slice_don_v2.py`, from `/workspace/pizza-story/don/gen/don_parts_v2.jpg`.
    It writes **in place** by default and depends on `make_splash.py` and `slice_don.py`.
  * `slice_head.py` handles single heads.
  * No recorded command or sheet reproduces the reworked turbofit/teknium/nous/blue files above.
* The sheets themselves are poor slicer input:
  * The background varies from pink to violet rather than flat `#FF00FF`.
  * Parts sit on one row and are found by connected components.
  * Don's sheet has baked label numbers.
  * The sheets show no turnaround or design reference, so views (side, 3/4 and front) are mixed within a single character.

**Recommended setup in the repo** (step 1 of §3):

```
assets/heroes/MANIFEST.md                 # the ONLY hand-edited rig data (v2 schema, §2.4)
assets/heroes/<id>/src/design.png         # approved turnaround (§5 stage 1), flat #FF00FF
assets/heroes/<id>/src/parts-<A|B|C>.png  # derived parts sheets (§5 stage 2), lossless PNG
assets/heroes/<id>/src/SLICE.json         # sheet→part cell map, scale, per-part overrides, sha256 of inputs/outputs
assets/heroes/<id>/<id>_<part>[_<variant>].png   # sliced outputs (generated, never hand-edited)
tools/slice-hero-parts.py                 # grid slicer (port of slice_parts.py + slice_don_v2 keying)
tools/gen-hero-rigs.mjs                   # MANIFEST.md → hero-rigs.js (+ hero-variants.js); --check mode
tests/check-rig-sources.mjs               # regenerate to a temp dir and diff; verify SLICE.json hashes
```

* Start by importing the current authoring MANIFEST.md **verbatim**, plus a port of `gen_enemy_rigs.mjs`
  that is limited to heroes and writes only inside the repo. Because the output is byte-identical, this
  step changes nothing at runtime and can land on its own.
* Fix the header of `hero-rigs.js` to name the real in-repo generator.
* Move hand-tuned constants into MANIFEST columns over time: `SOLES`, `WRIST`, grip axes, `PART_SCALE`,
  layer roles and the back-limb offsets.
* Record provenance for the 12 reworked files as "legacy, no source". Their replacements come from §5.
* Slicing is deterministic: it uses a fixed grid, fixed scale and no randomness. CI re-runs the generator
  only. The slicer needs Python, NumPy, SciPy and PIL, so it is an authoring tool, not a test dependency;
  `SLICE.json` hashes make drift detectable without running it.

---

## Baseline results (before any change)

All suites ran under Node 22.23.3 with Playwright 1.64.1 Chromium
(`/home/box/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`, exported as `CHROMIUM` and
`CHROMIUM_PATH`). The scratch copy was served by `python3 -m http.server 48791 --bind 127.0.0.1`. All passed.

| Command | Result (logs in `before/tests/`) |
| --- | --- |
| `npm test` | PASS (5.4 s): 2,744 rig frames, 26,782 attached joints, 2,086 weapon grips, 2,330 grounded facings; production draw OK for 8 heroes × 2 facings; baseline manifest OK; 8 heroes / 7,320 recovery samples; 3,840 world supports, max X drift **0.0112 px**; down/get-up OK; collision: 7 routes, 495 spawns. |
| `npm run test:pixels` | PASS (3.6 s): 2,070 alpha joint samples; **0** disconnections >1 px; **0** unusual overlaps; **1,512** raw deep overlaps >6 px (reported, not fatal). |
| `npm run test:browser` | PASS (81 s): all 8 heroes via real `index.html` and keyboard, 0 console/render errors. |
| `node tools/level-layout-smoke.mjs` | PASS (5.2 s): depth queue rear enemy → airborne P1 → P2 → barrel → front boss; all 8 stages render without errors. |
| `node tools/render-rigs.mjs baseline` (in clone) | 8 sheets, 123–127 poses × 2 facings, absent: none. |

---

## Per-hero findings

Measured over each hero's **reachable** poses:
* idle/walk/run/turn/jump/taunt/victory and the reaction states;
* each of the hero's `HERO_MOVES`;
* all mechanics × wind/active/recover/follow.

Source: `before/tests/asset-metrics.json` (computed with the production `solve()` and the PNG alpha hulls).

| Hero | Idle height | Head ÷ height | Arm ÷ torso | Leg ÷ torso | Upper arm / forearm→fist | Thigh / shin→sole | Idle sole tilt (near, far) | Planted contacts with sole tilt >10° | Reachable poses with weapon >2 px below floor (worst) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| turtle_purple | 174.5 | 0.28 | 1.60 | 1.35 | 51 / 58 | **25 / 67** | −8°, **46°** | 82 / 112 | 5 (wake 31 px) |
| turtle_blue | 175.5 | 0.28 | 1.43 | 1.23 | 41 / 57 | 31 / 52 | **26°, 33°** | 100 / 120 | 5 (grabThrow_active 48 px) |
| turtle_red | 188.8 | 0.26 | 1.52 | 1.47 | 47 / 57 | 37 / 62 | **24°, 31°** | 107 / 124 | n/a (sai baked into forearm) |
| turtle_orange | 182.2 | 0.25 | **1.64** | 1.42 | 46 / 66 | 35 / 62 | **30°, 36°** | 103 / 124 | n/a (weapon only on spin) |
| teknium | 171.3 | 0.25 | 1.11 | 1.40 | 31 / 45 | 44 / 51 | −1°, 11° | 83 / 128 | 1 (wake 10 px) |
| turbofit | 191.8 | **0.33** | 1.32 | 1.34 | 39 / 51 | 40 / 51 | −2°, 18° | 88 / 128 | **16** (wake 45 px) |
| nous_girl | 183.3 | 0.26 | 1.36\* | **1.51** | 40 / 53\* | 49 / 54 | 7°, 14° | 86 / 120 | 0 (cable is soft) |
| don_piedro | 186.5 | **0.32** | 1.53 | 1.32 | 35 / **69** | 39 / 51 | −12°, **58°** | 104 / 120 | 6 (grabThrow_active 44 px) |

\* After `PART_SCALE` squashes nous_girl's arms to 0.82/0.84 of their height. The art itself is longer.

Sole tilt is the heel→toe line of a planted foot relative to the floor. Because the foot is baked into
the shin, every bent knee tips the sole. The solver keeps *one* sole point (heel or toe) on `FOOT_Y`, so
most planted feet stand on a toe or a heel. This happens even in idle: blue, red and orange idle on
tilted feet, and Don's far foot is at 58°. This is the main measurable case for an ankle.

Pixel seams: there are no gaps over 1 px, but every limb root is deeply buried. Max raw overlap is 9–11 px
at shoulders, hips and knees for turtles, turbofit and Don; the measurement is capped by the 14 px window,
so true burial is deeper. Nous_girl and teknium have almost no elbow/knee overlap. Their thin limbs rely
on a few pixels of contact, so they are the most seam-prone once ankles and wrists add rotation.

Edge treatment is inconsistent:
* **1-bit alpha** (no partial-alpha pixels): every teknium body part except thigh/shin, all of turbofit
  except the guitar, nous_girl's head, and turtle_blue's torso.
* **Antialiased:** all other parts.

Under rotation, hard edges shimmer and soft edges halo, so the two read as different art styles.

### turtle_purple (bo)

Evidence:
* `before/parts/turtle_purple_parts_4x.png`
* `before/review/turtle_purple_keyposes.png`
* `before/gameplay/turtle_purple_3x-crop.png`
* `before/motion/turtle_purple/*`

* **Missing articulation**
  * The foot is baked into the shin (`shin` 35×73, ankle at row 43).
  * The fist is baked into the forearm.
  * The bandana tails are baked into the head (65×49).
  * The belt and buckle are baked into the torso, which is fine.
* **Proportions**
  * The thigh is only 25 px against a 67 px shin. The sheet's thigh had a foot drawn on it and was cut at
    the knee pad, so the knee sits too high and the leg reads as all shin.
  * The arms are 1.60× the torso.
  * The bo art is forearm length and is stretched by `PART_SCALE [1.85, 1.15]`, which gives anisotropic
    blurred pixels.
* **Grip**
  * The bo is held only by the **far** hand (`parent: farm_b`). Its rotation pivot is the bo centre
    (`px 40`) placed at the far fist.
  * The near hand floats free in every sweep.
  * The bo draws in the far layer, so it passes *behind* the torso even when the pose holds it across the
    front (see `idleA`, `jump`).
  * It also crosses the floor in `wake` (31 px) and `grabHold`.
  * No fingers wrap the shaft: the bo is drawn on top of the fist.
* **Rotation that needs a drawing**
  * `turn` reuses a generic arms-back pose and mirrors at once (`before/motion/turtle_purple/turn.png`).
    A shell side view cannot become the other side without a front/plastron drawing.
* **Near/far**
  * The far arm and leg are darkened copies of the near ones, with identical knuckles and wraps.

### turtle_blue (katana)

Evidence:
* `before/parts/turtle_blue_parts_4x.png`
* `before/review/turtle_blue_keyposes.png`
* `before/motion/turtle_blue/turn.png`

* **Missing articulation**
  * The foot is baked into the shin (38×58; huge splayed foot, ankle at row 30).
  * The fist is baked into the forearm.
  * The bandana tails are baked into the head.
  * **Sash tails** are baked into the torso and hang off the belt rigidly in every pose.
* **Joint construction**
  * The upper arm and thigh end in **open tube caps** (a flat hollow cross-section is visible at the
    bottom of `uarm` and `thigh`). They show as a seam whenever the elbow or knee bends.
  * The forearm is drawn with a pre-bent elbow bulge (42×64), so straightening it creates a kink.
* **Ankle**
  * The idle feet are tipped 26°/33° onto the toes.
  * 100 of 120 planted contacts are tilted >10°.
* **Grip**
  * The katana is drawn over a closed fist with no fingers around the tsuka.
  * The blade goes **through the floor** in `turn`, `wake`, `grabThrow_active` (48 px) and
    `healthSpecial_active` (43 px).
* **Rotation**
  * `turn` mirrors the side-view shell in one frame (visible pop at t≈0.6 s in the strip).

### turtle_red (sai ×2)

Evidence:
* `before/parts/turtle_red_parts_4x.png`
* `before/gameplay/turtle_red_3x-crop.png`

* **Missing articulation**
  * The **sai is baked into the forearm** (40×65), and the same image is reused for the far arm, so both
    hands hold an identical sai at one fixed angle.
  * There is no wrist: the tip direction is fixed relative to the forearm in every stab, flurry and uppercut.
  * Reverse grip, the natural sai guard, is impossible.
  * The standalone `turtle_red_weapon.png` (29×74) is loaded but never drawn (`WEAPON_IN_HAND`).
  * The foot is baked into the shin (ankle at row 36), with large claw toes.
  * The bandana tails are baked into the head.
* **Proportions**
  * He is the tallest turtle (189 px against blue's 176): the leg is 1.47× the torso.
* **Ankle**
  * The low crouch idle puts both feet on their toes (24°/31°).
  * 107 of 124 planted contacts are tilted.
* **Near/far**
  * The near and far hands are the same drawing, with the same knuckles toward the camera.

### turtle_orange (nunchaku)

Evidence:
* `before/parts/turtle_orange_parts_4x.png`
* `before/gameplay/turtle_orange_3x-crop.png`
* `before/motion/turtle_orange/combo.png`

* **Missing articulation**
  * **One nunchaku stick is baked into the forearm** (54×73). Outside spin frames he appears to hold two
    single sticks, one per hand, with no chain.
  * On spin frames the full 44×73 nunchaku is drawn *in addition*, so a **duplicate stick** appears at
    the fist.
  * There is no chain dynamics; the free stick is rigid.
  * The foot is baked into the shin, which also carries the knee pad.
  * The bandana tails are baked into the head.
* **Proportions**
  * His arms are the longest of the roster at 1.64× the torso (forearm→fist 66 px).
* **Ankle**
  * His idle tilt is 30°/36°, the worst among the turtles.

### nous_girl (audio cable)

Evidence:
* `before/parts/nous_girl_parts_4x.png`
* `before/gameplay/nous_girl_3x-crop.png`
* `before/review/nous_girl_keyposes.png`

* **Missing articulation**
  * The **skirt is baked into the torso** (37×68; thighs attach at 72% height and hide under it). The
    skirt stays rigid through run, jump, bassDrop and down, and juts out sideways when lying.
  * The bob hair is baked into the head. It is short, so that is acceptable for now.
  * The loafer is baked into the shin (ankle at row 35).
  * The **hand is open** and baked into the forearm.
* **Grip**
  * The cable (a coiled 30×52 image) is pinned at its plug to the open palm (`grip 115`). No hand closes
    on it, and no cable runs from the hand to the coil.
  * The whip lash is a procedural polyline (`drawLash`), not art.
* **Proportions**
  * Arms reach the knees. `uarm` is 59 px and **ends in a wristband**, which is a forearm feature, and
    the forearm has a second wristband: there are two bands per arm.
  * `PART_SCALE` squashes the arms by 0.82/0.84 to hide this, which distorts the band and hand.
  * Legs are 1.51× the torso.
  * The torso is frontal while the head is 3/4 and the legs are in profile.
* **Joints**
  * She has the least joint overlap in the roster (shoulder 6.5 px; no elbow/knee overlap over 6 px).
    Thin limbs plus new wrist/ankle rotation risk visible gaps.

### teknium (energy blade)

Evidence:
* `before/parts/teknium_parts_4x.png`
* `before/gameplay/teknium_3x-crop.png`

* **Missing articulation**
  * The **long coat skirt/tails are baked into the torso** (44×68, thighs at 70% height). The coat
    cannot swing in run or dash and stays rigid when lying.
  * The sneaker is baked into the shin (ankle at row 33).
  * The gloved fist is baked into the forearm, along with a striped cuff.
* **Views**
  * The head is 3/4, the coat front is fully frontal, and the legs are in profile. The frontal coat
    opening stays camera-facing while the body turns.
* **Proportions**
  * The arms are the shortest of the roster: 1.11× the torso, with a 31 px upper arm.
  * The head is small at 40×43.
* **Grip**
  * The blade's pivot is the pommel end, drawn over the closed fist; no fingers wrap it.
* **Edges**
  * Head, torso and arms have 1-bit alpha, while the thigh, shin and blade are antialiased.

### turbofit (guitar axe)

Evidence:
* `before/parts/turbofit_parts_4x.png`
* `before/gameplay/turbofit_3x-crop.png`
* `before/motion/turbofit/combo.png`

* **Views and proportions**
  * The **frontal head with long hair** (61×64) is 0.33 of body height, which reads as a bobblehead on a
    body in profile. The face always looks at the camera, so the headbang has no readable direction.
  * The torso is frontal.
* **Missing articulation**
  * The hair is baked into the head, so the headbang charge cannot whip it.
  * The boots are baked into the shins (ankle at row 34).
  * Fists and studded bands are baked into the forearms.
  * The tank-top hem tatters are baked into the torso (fine).
* **Grip**
  * One hand holds the guitar **at the neck near the headstock** (pivot 47,38 on a 65×118 image). The
    far hand never touches it.
  * The guitar **goes through the floor in 16 reachable poses**, up to 45 px (`wake`, `axe_follow`,
    `axeHeavy_follow`).
* **Near/far and mirroring**
  * The tribal tattoo on the near upper arm is duplicated on the darkened far arm, and it changes
    anatomical arm when mirrored.
* **Edges**
  * All body parts have 1-bit alpha.

### don_piedro (big spoon)

Evidence:
* `before/parts/don_piedro_parts_4x.png`
* `before/gameplay/don_piedro_3x-crop.png`
* `before/motion/don_piedro/hurt-down-getup.png`

* **Views**
  * The **head and torso are frontal**, while the boots are in profile.
  * The red scouter is on one eye, so mirroring moves it to the other eye.
* **Missing articulation**
  * The **shoulder pads are baked into the 79 px wide torso** (squeezed by the slicer), so the upper arm
    rotates under a rigid pad.
  * The glove is baked into the forearm, which makes the forearm and glove 69 px against a 35 px upper
    arm: the elbow sits far too high.
  * The boot is baked into the shin (ankle at row 29).
* **Ankle**
  * The far foot is at 58° in idle (the worst of the roster).
  * 104 of 120 planted contacts are tilted.
* **Grip**
  * The spoon's pivot is at the very end of the handle (13,98 of 112), so the glove covers nothing and
    the handle does not pass through the fist.
  * The spoon goes **through the floor** in `grabThrow_active` (44 px), `healthSpecial_active` (37 px),
    `slash_follow` (32 px) and `down`/`wake`.
* **Joints**
  * He has the deepest burial in the roster: hips 10.7 px, shoulders 10.2 px, elbows 9 px.

### Cross-cutting problems that more rotation cannot fix

1. **Ankles.** All eight heroes have the foot baked into the shin; feet tilt 11–58° even in idle.
2. **Wrists and hands.** All eight have the hand baked into the forearm. Weapons are drawn on top of fists,
   or baked in (red, orange) or pinned to an open palm (nous).
3. **Turn.** `turn` is a shared pose plus an instant mirror. Side-view torsos (turtles) need a front
   drawing; frontal torsos and heads (Don, turbofit, nous, teknium) need a 3/4 drawing.
4. **Far limbs.** The far limbs are tinted copies, so asymmetric marks show on both sides (turbofit's
   tattoo, Don's scouter when mirrored). Hands show the same face whichever side they are on.
5. **Secondary shapes.** Bandana and sash tails, hair, coat, skirt and cable are rigid.
6. **Weapon and floor.** The weapon is excluded from floor/contact logic (`HERO_SUPPORT` skips it), so
   blades, guitars, spoons and the bo pass through the floor in 33 reachable poses.
7. **Scale hacks.** Anisotropic `PART_SCALE` (purple's bo, nous's arms) distorts pixels; the art should
   be drawn at the right size instead.

---

## 1. Per-hero asset worklist

### 1.0 Shared conventions (apply to every row below)

* **Size.** Sizes are given as `W×H rig px` (on screen ×0.7 at `RIG_SCALE`). Art is authored at 4× (§5)
  and downsampled with Lanczos, so every part has antialiased alpha. 1-bit edges are rejected.
* **Neutral orientation.** Limbs hang **straight down**, pivot at the top centre, child joint at the bottom
  centre, with a rounded **ball cap** at both ends (no open tubes).
  * **Foot:** ankle pivot, sole flat on the image bottom, toe pointing +x (right-facing), heel point and toe
    point recorded as `sole`. Range −30° (toe up) to +50° (toe down).
  * **Hand:** wrist pivot at the top centre, fingers down. Range ±35° from the forearm, matching the
    existing `WRIST` soft limit.
  * **Heads and torsos:** face +x.
* **Overlap margin.** This is the cap radius beyond the joint centre that must stay under the parent:
  * 6–8 px for shoulder and hip;
  * 5–6 px for elbow and knee;
  * 4 px for wrist and ankle.

  `check-rig-pixels` then expects 0 gaps and *less* deep overlap than the baseline (§4).
* **Layer roles.** These extend the current back-to-front order:
  `weapon_b → hand_b → farm_b → uarm_b → shin_b/foot_b → thigh_b → [back secondary] → torso → [front secondary] → head → thigh → shin → foot → uarm → farm → grip_back → weapon → grip_front`.
  * A **grip pair** splits the hand: `grip_back` (palm and back fingers) draws *before* the weapon and
    `grip_front` (front fingers and thumb) *after*, so the shaft passes through the fist.
* **Near/far.** Each row says whether the far side reuses the same file with a tint (`tint`), needs its
  own drawing (`_far`), or needs a mirror-safe alternative (`_mirror`; used when the hero faces left and
  a marking must stay on the anatomically correct side).
* **Source codes.**
  * **G** = generate new (§5).
  * **E** = edit or repaint an existing PNG at 4× (keep its design, fix its cut or caps).
  * **R** = reuse the existing file unchanged.
  * **D** = derived by the slicer from another generated part (flip plus marking edit).
* **Priority.**
  * **P0** fixes a demonstrated measured problem: tilted feet, floor penetration, floating grips, baked
    weapons, open caps, wrong-view turn.
  * **P1** is new articulation for natural motion: secondary chains, alternate drawings.
  * **P2** is polish.

Common to all heroes:
* `shin` is regenerated **without the foot**. Its length is the old shin minus the measured ankle row:
  purple 43, blue 30, red 36, orange 36, nous 35, teknium 33, turbofit 34, don 29.
* `foot` is a new part.
* `hand_*`/`grip_*` are new parts, and `farm` is regenerated **without the hand**.

Two **variant** parts per hero are listed as `head_front` and `torso_front`. They replace the instant
mirror in `turn` (and serve front-facing taunt and victory poses):
* For side-view heroes (turtles) they are a 3/4-front plastron view.
* For frontal-view heroes (nous, teknium, turbofit, don) the default `head`/`torso` are regenerated as
  3/4 side, and the old frontal art becomes the `_front` variant.


### 1.1 turtle_purple (bo): 15 files

| File | Purpose | States | Size rig px (screen) | Pivot → parent @ attach | Neutral | Layer | Near/far | Grip / tip | Overlap | Src | Pri |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `turtle_purple_thigh.png` | thigh, longer, ball caps | all | 30×42 (21×29) | top-c → torso hip | down | leg | tint | - | 7 px | G | P0 |
| `turtle_purple_shin.png` | shin without foot | all | 28×46 (20×32) | top-c → thigh knee | down | leg | tint | - | 6 px | G | P0 |
| `turtle_purple_foot.png` | ankle and flat sole | all grounded | 40×22 (28×15) | ankle → shin bottom | toe +x | leg | tint | sole heel/toe | 4 px | G | P0 |
| `turtle_purple_farm.png` | forearm without fist | all | 24×44 (17×31) | top-c → uarm elbow | down | arm | tint | - | 5 px | G | P0 |
| `turtle_purple_uarm.png` | upper arm, shorter (target arm 1.40× torso) | all | 26×44 (18×31) | top-c → torso shoulder | down | arm | tint | - | 7 px | G | P1 |
| `turtle_purple_hand_fist.png` | empty fist | idle/hurt/down | 22×22 (15×15) | wrist → farm | fingers down | arm | tint | - | 4 px | G | P0 |
| `turtle_purple_hand_grip_back.png` | palm behind bo | all armed | 22×22 (15×15) | wrist → farm | fingers down | before weapon | tint | shaft axis | 4 px | G | P0 |
| `turtle_purple_hand_grip_front.png` | fingers over bo | all armed | 22×22 (15×15) | wrist → farm | fingers down | after weapon | tint | shaft axis | 4 px | G | P0 |
| `turtle_purple_hand_grip_far.png` | far hand on bo (2nd grip, two-hand) | bo sweeps | 22×22 (15×15) | wrist → farm_b | fingers down | far arm | _far | 2nd grip pt | 4 px | G | P0 |
| `turtle_purple_weapon.png` | bo at true length (no PART_SCALE) | all armed | 14×150 (10×105) | grip centre → hand | vertical | weapon (near) | - | grip 0.35/0.65, tips | - | G | P0 |
| `turtle_purple_head.png` | head without tails | all | 58×46 (41×32) | neck → torso | face +x | head | - | - | 8 px | E | P0 |
| `turtle_purple_mask_tail_1/2.png` | bandana tail segments | all (spring) | 12×26 (8×18) | knot → head / tail_1 | down | behind head | - | - | 3 px | G | P1 |
| `turtle_purple_head_front.png` | 3/4-front head | turn/taunt/victory | 58×46 (41×32) | neck → torso | 3/4 front | head | - | - | 8 px | G | P1 |
| `turtle_purple_torso_front.png` | 3/4 plastron torso | turn/taunt/victory | 56×68 (39×48) | root | 3/4 front | torso | - | - | - | G | P1 |

### 1.2 turtle_blue (katana): 17 files

| File | Purpose | States | Size rig px (screen) | Pivot → parent @ attach | Neutral | Layer | Near/far | Grip / tip | Overlap | Src | Pri |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `turtle_blue_uarm.png` | upper arm, closed caps | all | 26×40 (18×28) | top-c → shoulder | down | arm | tint | - | 7 px | G | P0 |
| `turtle_blue_thigh.png` | thigh, closed caps | all | 30×32 (21×22) | top-c → hip | down | leg | tint | - | 7 px | G | P0 |
| `turtle_blue_farm.png` | straight forearm without fist | all | 24×42 (17×29) | top-c → elbow | down | arm | tint | - | 5 px | G | P0 |
| `turtle_blue_shin.png` | shin without foot | all | 28×30 (20×21) | top-c → knee | down | leg | tint | - | 6 px | G | P0 |
| `turtle_blue_foot.png` | ankle and flat sole (smaller) | grounded | 38×20 (27×14) | ankle → shin | toe +x | leg | tint | sole | 4 px | G | P0 |
| `turtle_blue_hand_fist.png` | empty fist | idle/hurt/down | 22×22 (15×15) | wrist → farm | down | arm | tint | - | 4 px | G | P0 |
| `turtle_blue_hand_grip_back.png` | palm behind tsuka | armed | 22×22 (15×15) | wrist → farm | down | before weapon | tint | tsuka axis | 4 px | G | P0 |
| `turtle_blue_hand_grip_front.png` | fingers over tsuka | armed | 22×22 (15×15) | wrist → farm | down | after weapon | tint | tsuka axis | 4 px | G | P0 |
| `turtle_blue_weapon.png` | katana, pivot moved to tsuka centre | armed | 16×96 (11×67) | tsuka centre → hand | vertical | weapon | - | grip, tip | - | E | P0 |
| `turtle_blue_torso.png` | torso without sash tails | all | 52×68 (36×48) | root | side | torso | - | - | - | E | P0 |
| `turtle_blue_sash_tail_1/2.png` | sash tail segments | all (spring) | 12×24 (8×17) | belt knot → torso | down | behind torso | - | - | 3 px | G | P1 |
| `turtle_blue_head.png` | head without tails | all | 56×46 (39×32) | neck → torso | face +x | head | - | - | 8 px | E | P0 |
| `turtle_blue_mask_tail_1/2.png` | bandana tail segments | all (spring) | 12×26 (8×18) | knot → head | down | behind head | - | - | 3 px | G | P1 |
| `turtle_blue_head_front.png` | 3/4-front head | turn/taunt/victory | 56×46 (39×32) | neck | 3/4 front | head | - | - | 8 px | G | P1 |
| `turtle_blue_torso_front.png` | 3/4 plastron | turn/taunt/victory | 54×68 (38×48) | root | 3/4 front | torso | - | - | - | G | P1 |

### 1.3 turtle_red (sai ×2): 12 files

| File | Purpose | States | Size rig px (screen) | Pivot → parent @ attach | Neutral | Layer | Near/far | Grip / tip | Overlap | Src | Pri |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `turtle_red_farm.png` | forearm without sai or fist | all | 24×42 (17×29) | top-c → elbow | down | arm | tint | - | 5 px | G | P0 |
| `turtle_red_hand_grip_back.png` | palm behind sai handle | all | 22×22 (15×15) | wrist → farm | down | before weapon | tint | handle axis | 4 px | G | P0 |
| `turtle_red_hand_grip_front.png` | fingers over handle | all | 22×22 (15×15) | wrist → farm | down | after weapon | tint | handle axis | 4 px | G | P0 |
| `turtle_red_weapon.png` | existing standalone sai, now drawn in both hands (forward/reverse via 180° grip flip) | all | 29×74 (20×52) | handle centre → hand | vertical | weapon/weapon_b | same file | grip, tip | - | R | P0 |
| `turtle_red_shin.png` | shin without foot | all | 28×40 (20×28) | top-c → knee | down | leg | tint | - | 6 px | G | P0 |
| `turtle_red_foot.png` | ankle and flat sole | grounded | 40×22 (28×15) | ankle → shin | toe +x | leg | tint | sole | 4 px | G | P0 |
| `turtle_red_hand_fist.png` | empty fist | hurt/down/grab | 22×22 (15×15) | wrist → farm | down | arm | tint | - | 4 px | G | P1 |
| `turtle_red_head.png` | head without tails | all | 56×46 (39×32) | neck | face +x | head | - | - | 8 px | E | P0 |
| `turtle_red_mask_tail_1/2.png` | bandana tails | all (spring) | 12×26 (8×18) | knot → head | down | behind head | - | - | 3 px | G | P1 |
| `turtle_red_head_front.png` | 3/4-front head | turn/taunt | 56×46 (39×32) | neck | 3/4 front | head | - | - | 8 px | G | P1 |
| `turtle_red_torso_front.png` | 3/4 plastron | turn/taunt | 54×68 (38×48) | root | 3/4 front | torso | - | - | - | G | P1 |

### 1.4 turtle_orange (nunchaku): 15 files

| File | Purpose | States | Size rig px (screen) | Pivot → parent @ attach | Neutral | Layer | Near/far | Grip / tip | Overlap | Src | Pri |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `turtle_orange_farm.png` | forearm without stick or fist | all | 24×46 (17×32) | top-c → elbow | down | arm | tint | - | 5 px | G | P0 |
| `turtle_orange_uarm.png` | upper arm, shorter (target arm 1.45× torso) | all | 26×40 (18×28) | top-c → shoulder | down | arm | tint | - | 7 px | G | P1 |
| `turtle_orange_hand_grip_back.png` | palm behind stick | all | 22×22 (15×15) | wrist → farm | down | before weapon | tint | stick axis | 4 px | G | P0 |
| `turtle_orange_hand_grip_front.png` | fingers over stick | all | 22×22 (15×15) | wrist → farm | down | after weapon | tint | stick axis | 4 px | G | P0 |
| `turtle_orange_nunchaku_handle.png` | held stick | all | 12×40 (8×28) | grip → hand | vertical | weapon | - | grip, chain eye | - | G | P0 |
| `turtle_orange_nunchaku_chain.png` | chain link (×3 instances, spring) | all | 6×8 (4×6) | eye → previous | down | weapon | - | - | 1 px | G | P0 |
| `turtle_orange_nunchaku_stick.png` | free stick (spring end) | all | 12×40 (8×28) | eye → chain | down | weapon | - | tip | - | G | P0 |
| `turtle_orange_shin.png` | shin without foot | all | 28×40 (20×28) | top-c → knee | down | leg | tint | - | 6 px | G | P0 |
| `turtle_orange_foot.png` | ankle and flat sole | grounded | 40×22 (28×15) | ankle → shin | toe +x | leg | tint | sole | 4 px | G | P0 |
| `turtle_orange_hand_fist.png` | empty fist | hurt/down | 22×22 (15×15) | wrist → farm | down | arm | tint | - | 4 px | G | P1 |
| `turtle_orange_head.png` | head without tails | all | 56×46 (39×32) | neck | face +x | head | - | - | 8 px | E | P0 |
| `turtle_orange_mask_tail_1/2.png` | bandana tails | all (spring) | 12×26 (8×18) | knot → head | down | behind head | - | - | 3 px | G | P1 |
| `turtle_orange_head_front.png` | 3/4-front head | turn/taunt | 56×46 (39×32) | neck | 3/4 front | head | - | - | 8 px | G | P1 |
| `turtle_orange_torso_front.png` | 3/4 plastron | turn/taunt | 54×68 (38×48) | root | 3/4 front | torso | - | - | - | G | P1 |

### 1.5 nous_girl (audio cable): 16 files

| File | Purpose | States | Size rig px (screen) | Pivot → parent @ attach | Neutral | Layer | Near/far | Grip / tip | Overlap | Src | Pri |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `nous_girl_torso.png` | 3/4 torso without skirt | all | 34×48 (24×34) | root | 3/4 side | torso | - | - | - | G | P0 |
| `nous_girl_skirt_front.png` | front skirt panel (spring) | all | 40×26 (28×18) | waist → torso | down | front of thighs | - | - | 4 px | G | P0 |
| `nous_girl_skirt_back.png` | back skirt panel (spring) | all | 40×26 (28×18) | waist → torso | down | behind thighs | - | - | 4 px | G | P0 |
| `nous_girl_uarm.png` | upper arm, no wristband (target arm 1.35× torso) | all | 16×40 (11×28) | top-c → shoulder | down | arm | tint | - | 6 px | G | P0 |
| `nous_girl_farm.png` | forearm with single band, no hand | all | 15×38 (10×27) | top-c → elbow | down | arm | tint | - | 5 px | G | P0 |
| `nous_girl_hand_open.png` | open hand | idle/taunt/hurt | 16×20 (11×14) | wrist → farm | down | arm | tint | - | 4 px | G | P1 |
| `nous_girl_hand_grip_back.png` | palm behind plug | armed | 16×18 (11×13) | wrist → farm | down | before weapon | tint | plug axis | 4 px | G | P0 |
| `nous_girl_hand_grip_front.png` | fingers over plug | armed | 16×18 (11×13) | wrist → farm | down | after weapon | tint | plug axis | 4 px | G | P0 |
| `nous_girl_cable_plug.png` | jack plug held in fist | armed | 10×24 (7×17) | grip → hand | vertical | weapon | - | grip, cable eye | - | G | P0 |
| `nous_girl_cable_seg.png` | cable segment (×N, rope chain; replaces drawLash polyline) | lash/idle | 6×14 (4×10) | eye → previous | down | weapon | - | - | 1 px | G | P1 |
| `nous_girl_cable_coil.png` | coil worn at hip (idle slack) | idle/walk | 30×40 (21×28) | hip → torso | down | front of torso | - | - | 3 px | E | P2 |
| `nous_girl_thigh.png` | thigh (target leg 1.40× torso) | all | 20×44 (14×31) | top-c → hip | down | leg | tint | - | 6 px | G | P1 |
| `nous_girl_shin.png` | shin without loafer | all | 18×42 (13×29) | top-c → knee | down | leg | tint | - | 5 px | G | P0 |
| `nous_girl_foot.png` | loafer, ankle and flat sole | grounded | 28×14 (20×10) | ankle → shin | toe +x | leg | tint | sole | 4 px | G | P0 |
| `nous_girl_head_front.png` | old frontal head (repainted AA) | turn/taunt/victory | 40×44 (28×31) | neck | front | head | - | - | 6 px | G | P1 |
| `nous_girl_torso_front.png` | frontal torso | turn/taunt/victory | 36×48 (25×34) | root | front | torso | - | - | - | G | P1 |

### 1.6 teknium (energy blade): 14 files

| File | Purpose | States | Size rig px (screen) | Pivot → parent @ attach | Neutral | Layer | Near/far | Grip / tip | Overlap | Src | Pri |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `teknium_torso.png` | 3/4 torso without coat tails | all | 40×46 (28×32) | root | 3/4 side | torso | - | - | - | G | P0 |
| `teknium_coat_tail.png` | coat tail near (spring, 2 segments drawn as one image with bend) | all | 30×40 (21×28) | waist → torso | down | front of thighs | near | - | 4 px | G | P0 |
| `teknium_coat_tail_far.png` | coat tail far | all | 30×40 (21×28) | waist → torso | down | behind thighs | _far | - | 4 px | G | P0 |
| `teknium_uarm.png` | upper arm (target arm 1.30× torso) | all | 18×40 (13×28) | top-c → shoulder | down | arm | tint | - | 6 px | G | P0 |
| `teknium_farm.png` | forearm and cuff without glove | all | 17×38 (12×27) | top-c → elbow | down | arm | tint | - | 5 px | G | P0 |
| `teknium_hand_grip_back.png` | glove palm behind hilt | armed | 18×18 (13×13) | wrist → farm | down | before weapon | tint | hilt axis | 4 px | G | P0 |
| `teknium_hand_grip_front.png` | glove fingers over hilt | armed | 18×18 (13×13) | wrist → farm | down | after weapon | tint | hilt axis | 4 px | G | P0 |
| `teknium_hand_open.png` | open glove | idle/hurt/taunt | 18×20 (13×14) | wrist → farm | down | arm | tint | - | 4 px | G | P1 |
| `teknium_weapon.png` | blade, pivot moved to hilt centre, AA edges | armed | 16×90 (11×63) | hilt centre → hand | vertical | weapon | - | grip, tip | - | E | P0 |
| `teknium_shin.png` | shin without sneaker | all | 20×40 (14×28) | top-c → knee | down | leg | tint | - | 5 px | G | P0 |
| `teknium_foot.png` | sneaker, ankle and flat sole | grounded | 32×16 (22×11) | ankle → shin | toe +x | leg | tint | sole | 4 px | G | P0 |
| `teknium_head.png` | 3/4 head, AA, slightly larger | all | 44×46 (31×32) | neck | face +x | head | - | - | 7 px | G | P1 |
| `teknium_head_front.png` | frontal head | turn/taunt | 44×46 (31×32) | neck | front | head | - | - | 7 px | G | P1 |
| `teknium_torso_front.png` | frontal coat | turn/taunt | 44×68 (31×48) | root | front | torso | - | - | - | G | P1 |

### 1.7 turbofit (guitar axe): 16 files

| File | Purpose | States | Size rig px (screen) | Pivot → parent @ attach | Neutral | Layer | Near/far | Grip / tip | Overlap | Src | Pri |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `turbofit_head.png` | 3/4 head WITHOUT hair, AA (target head 0.27 of height) | all | 40×44 (28×31) | neck | face +x | head | - | - | 7 px | G | P0 |
| `turbofit_hair_back_1/2.png` | hair locks behind (spring chain) | all | 24×34 (17×24) | scalp → head / hair_1 | down | behind head | - | - | 3 px | G | P1 |
| `turbofit_hair_front.png` | fringe and side lock in front of face (spring) | all | 18×26 (13×18) | scalp → head | down | after head | - | - | 3 px | G | P1 |
| `turbofit_torso.png` | 3/4 torso, AA | all | 46×64 (32×45) | root | 3/4 side | torso | - | - | - | G | P0 |
| `turbofit_uarm_far.png` | far upper arm WITHOUT tattoo | all | 22×42 (15×29) | top-c → shoulder | down | far arm | _far | - | 6 px | D | P1 |
| `turbofit_uarm_mirror.png` | near upper arm with tattoo moved (left-facing) | all, facing left | 22×42 (15×29) | top-c → shoulder | down | arm | _mirror | - | 6 px | D | P2 |
| `turbofit_farm.png` | forearm and band without fist, AA | all | 20×40 (14×28) | top-c → elbow | down | arm | tint | - | 5 px | G | P0 |
| `turbofit_hand_grip_back.png` | palm behind neck | armed | 20×20 (14×14) | wrist → farm | down | before weapon | tint | neck axis | 4 px | G | P0 |
| `turbofit_hand_grip_front.png` | fingers over neck | armed | 20×20 (14×14) | wrist → farm | down | after weapon | tint | neck axis | 4 px | G | P0 |
| `turbofit_hand_grip_far.png` | far hand on body/lower neck (two-hand) | axe swings | 20×20 (14×14) | wrist → farm_b | down | far arm | _far | 2nd grip pt | 4 px | G | P0 |
| `turbofit_weapon.png` | guitar, grip moved to lower neck, pivot at grip | armed | 65×118 (46×83) | grip → hand | vertical | weapon | - | grip 1 and 2, tip | - | E | P0 |
| `turbofit_shin.png` | shin without boot, AA | all | 22×40 (15×28) | top-c → knee | down | leg | tint | - | 5 px | G | P0 |
| `turbofit_foot.png` | boot, ankle and flat sole | grounded | 36×18 (25×13) | ankle → shin | toe +x | leg | tint | sole | 4 px | G | P0 |
| `turbofit_head_front.png` | current frontal head without hair, repainted AA | turn/taunt | 48×50 (34×35) | neck | front | head | - | - | 7 px | E | P1 |
| `turbofit_torso_front.png` | current frontal torso repainted AA | turn/taunt | 46×64 (32×45) | root | front | torso | - | - | - | E | P1 |

### 1.8 don_piedro (big spoon): 14 files

| File | Purpose | States | Size rig px (screen) | Pivot → parent @ attach | Neutral | Layer | Near/far | Grip / tip | Overlap | Src | Pri |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `don_piedro_head.png` | 3/4 head with scouter on the near eye | all | 46×50 (32×35) | neck | face +x | head | - | - | 7 px | G | P0 |
| `don_piedro_torso.png` | 3/4 torso without pads, narrower | all | 56×66 (39×46) | root | 3/4 side | torso | - | - | - | G | P0 |
| `don_piedro_pad.png` | near shoulder pad (follows uarm 40%) | all | 30×24 (21×17) | shoulder → torso | flat | after uarm | near | - | 4 px | G | P0 |
| `don_piedro_pad_far.png` | far shoulder pad | all | 26×22 (18×15) | shoulder → torso | flat | before uarm_b | _far | - | 4 px | G | P1 |
| `don_piedro_farm.png` | forearm without glove (target forearm ≈ upper arm) | all | 22×38 (15×27) | top-c → elbow | down | arm | tint | - | 5 px | G | P0 |
| `don_piedro_hand_fist.png` | empty glove fist | hurt/down/grab | 24×24 (17×17) | wrist → farm | down | arm | tint | - | 4 px | G | P1 |
| `don_piedro_hand_grip_back.png` | glove palm behind handle | armed | 24×24 (17×17) | wrist → farm | down | before weapon | tint | handle axis | 4 px | G | P0 |
| `don_piedro_hand_grip_front.png` | glove fingers over handle | armed | 24×24 (17×17) | wrist → farm | down | after weapon | tint | handle axis | 4 px | G | P0 |
| `don_piedro_weapon.png` | spoon, pivot moved to handle at 25% length | armed | 26×112 (18×78) | grip → hand | vertical | weapon | - | grip, bowl tip | - | E | P0 |
| `don_piedro_shin.png` | shin without boot | all | 24×38 (17×27) | top-c → knee | down | leg | tint | - | 5 px | G | P0 |
| `don_piedro_foot.png` | boot, ankle and flat sole | grounded | 38×20 (27×14) | ankle → shin | toe +x | leg | tint | sole | 4 px | G | P0 |
| `don_piedro_head_mirror.png` | 3/4 head with scouter on the other eye (left-facing) | all, facing left | 46×50 (32×35) | neck | face +x | head | _mirror | - | 7 px | D | P2 |
| `don_piedro_head_front.png` | current frontal head | turn/taunt | 48×52 (34×36) | neck | front | head | - | - | 7 px | R | P1 |
| `don_piedro_torso_front.png` | current frontal torso | turn/taunt | 79×66 (55×46) | root | front | torso | - | - | - | R | P1 |

### 1.9 Totals

**119 part files.** There are 116 table rows; `_1/2` rows count as two files.

| Hero | Files |
| --- | --- |
| turtle_purple | 15 |
| turtle_blue | 17 |
| turtle_red | 12 |
| turtle_orange | 15 |
| nous_girl | 16 |
| teknium | 14 |
| turbofit | 16 |
| don_piedro | 14 |

| Breakdown | Counts |
| --- | --- |
| By source | **101 generated**, 12 edited, 3 reused, 3 derived |
| By priority | **75 P0**, 41 P1, 3 P2 |

Of these files, **27 are variant drawings** that replace or alternate with a default part:
* 16 turn/front drawings (`head_front` and `torso_front` × 8);
* 4 far drawings (`hand_grip_far` purple and turbofit, `coat_tail_far`, `pad_far`);
* 1 far-arm derivation (`turbofit_uarm_far`);
* 2 mirror-safe drawings (`turbofit_uarm_mirror`, `don_head_mirror`);
* 4 hand-pose alternates beyond the grip pair (`hand_fist` purple and blue, `hand_open` nous and teknium).

That gives 92 base parts and 27 variants.

* The `hand_fist` rows for red, orange and don are base parts, used where no weapon is held.
* `red_weapon` is reused for both hands, so `weapon_b` adds no file.
* Nunchaku chain links and cable segments are instanced at runtime (×3 and ×N); they add no files.

Retired after migration: every `_b` image (still derived at load as a tint unless a `_far` file exists),
the baked-in weapon forearms of red and orange, and `PART_SCALE` entries for purple's bo and nous's arms.

---

## 2. Rig structure

### 2.1 Hierarchy (torso is the root, as today)

```
torso ─┬─ head ─┬─ mask_tail_1 ─ mask_tail_2            (turtles; spring)
       │        ├─ hair_back_1 ─ hair_back_2, hair_front (turbofit; spring)
       ├─ pad / pad_b                                    (don; 40% follow of uarm)
       ├─ uarm ─ farm ─ hand(variant) ─ weapon ─┬─ nunchaku_chain×3 ─ nunchaku_stick (orange; spring)
       │                                        └─ cable_seg×N  (nous; rope)
       ├─ uarm_b ─ farm_b ─ hand_b(variant) ─ weapon_b (red) │ 2nd grip on weapon (purple, turbofit)
       ├─ skirt_front / skirt_back, coat_tail / coat_tail_far, sash_tail_1 ─ sash_tail_2 (spring)
       ├─ thigh ─ shin ─ foot
       └─ thigh_b ─ shin_b ─ foot_b
```

* **Ankle.**
  * Joint position: `plantFeet` (two-bone IK) still places the ankle, using the existing hip→knee→ankle
    lengths so that PR #1's `foot-lock.js` anchors keep working.
  * Foot angle, after IK:
    * **Grounded foot:** `foot.rot = −(world shin angle)` so the sole is flat, clamped to −30…+50°
      relative to the shin.
    * **Toe-off / heel-strike:** when the pose carries `__footRoll` (`toe` or `heel`), the foot pivots on
      the toe or heel instead of the ankle, so the lock point stays fixed.
    * **Airborne:** the foot follows the pose's `foot` key, or defaults to 15° toe-down.
  * Sole tables: `SOLES` moves from the shin to the foot image, so `[heel, toe]` become foot-local and
    are flat by construction.
* **Wrist and hand.**
  * `hand.rot` comes from the pose's `wrist` key (new), clamped by the existing `WRIST` soft limit.
  * For armed states the weapon angle is the primary key; the hand is solved backwards so the grip axis
    of `grip_back`/`grip_front` aligns with the weapon's grip axis.
  * The weapon's pivot is its grip point, coincident with the hand's grip point by construction.
* **Two-hand grip** (purple, turbofit, and optionally blue and don on heavy moves).
  * The far arm is solved by a two-bone IK from the far shoulder to the weapon's second grip point,
    with elbow-bend sign rules matching the existing `chainSolve` near-arm convention.
* **Secondary chains** (new `secondary.js`).
  * Damped angular springs per segment, with stiffness and damping from MANIFEST.
  * Integrated at a fixed 1/120 s substep from `anim.step`.
  * Frozen when dt = 0 (hit-stop, pause), so hit-stop freezes cloth as it freezes bodies.
  * Reset on spawn and on `turn` facing change.
  * State lives on the actor and is never global.
  * Determinism: the same dt sequence gives the same output, so tests can replay.

### 2.2 Variant selection

For each slot (`head`, `torso`, `hand`, `hand_b`, `uarm_b`, ...), the drawn file is chosen in this order:

1. **The pose tag `__v`.** Explicit in the pose, for example `turn` frames 2–3 have
   `__v:{head:'front', torso:'front'}`, and armed poses have `hand:'grip'`.
2. **Rules from MANIFEST.**
   * `facing<0` → `_mirror` if it exists.
   * Weapon holstered or none → `fist`/`open`.
   * Second grip active → `grip_far`.
   * The far side uses `_far` if it exists, else a tint of the near part.
3. **Default.**

* **Hysteresis.** Rule-driven switches hold for at least 3 frames (50 ms) and change only at keyframe
  boundaries, never mid-tween, so there is no flicker.
* **Compatibility.** Every variant of a slot must share the pivot and the child attach point (±1 px). The
  generator rejects a variant that does not, so swapping never pops a joint.
* **Turn sequence.** The turn becomes 4 keys: side → 3/4 front variant → mirrored 3/4 front → mirrored
  side. The facing flip happens while the front variant (symmetric-ish) is shown, replacing today's
  instant mirror.

### 2.3 MANIFEST.md v2 schema (per part row)

```
| part | file | w | h | px | py | parent | ax | ay | layer | side(near/far/both) | variantOf | grip(x,y,angle) | tip(x,y) | sole(heel,toe) | range(min,max) | spring(k,c) | src(G/E/R/D) | sha256 |
```

* Existing rows keep `part, file, w, h, px, py, parent, ax, ay`, so a v1 manifest is valid v2.
* The generator emits:
  * `hero-rigs.js`, with the same `HERO_RIGS` shape and public IDs;
  * `hero-variants.js`;
  * `hero-grips.js`, replacing hand-written `GRIP_OFF` and `SOLES`.

---

## 3. Code integration plan (file by file, in order)

**Preserve** PR #1's work: collision boxes, prop interaction, `layout-render.js`, the depth queue, the
`drawHero(ctx, actor, …)` signature, `FOOT_Y=90`, `RIG_SCALE`, `FEET_SCREEN`, foot-lock anchors, and all
public hero, move and state IDs (`turtle_purple`…`don_piedro`, `HERO_MOVES` keys, mechanic names).

Each step lands with green `npm test`, `test:pixels`, `test:browser` and the layout smoke test.

1. **`assets/heroes/MANIFEST.md`, `tools/gen-hero-rigs.mjs`, `tests/check-rig-sources.mjs`.**
   * Import the manifest verbatim and port the generator (repo-local outputs only, `--check`).
   * Output is byte-identical; no runtime change.
2. **Generator v2.**
   * Parse the v2 columns.
   * Emit `hero-variants.js` and `hero-grips.js`.
   * The v1 rows produce today's tables exactly. Test this with a fixture diff.
3. **`rig-geometry.js`.**
   * Add the `foot` and `hand` bones to `solve()`: ankle and wrist joints, foot-local sole, two-hand IK
     helper.
   * Keep the old shin-sole path behind a `hasFoot` check so heroes migrate one at a time.
4. **`rig.js`.**
   * Draw the new layer roles (grip_back/weapon/grip_front split, secondary layers).
   * Add the variant lookup and `_far` vs tint.
   * Remove `WEAPON_IN_HAND`/`WEAPON_SPIN_ONLY` per hero as each hero migrates.
   * Retire `PART_SCALE` entries as the art lands.
   * `drawLash` stays as a fallback until nous's cable segments exist.
5. **`secondary.js` (new).** Add the spring chains; `anim.step` calls them with the same dt it already
   receives.
6. **`foot-lock.js`.** Lock on the foot's heel or toe point (from `hero-grips.js`) instead of the shin's
   sole; the anchor API is unchanged.
7. **`animation-timeline.js`.**
   * Add the `wrist`, `foot`, `__footRoll` and `__v` keys to `KEYS` with the existing interpolation.
   * `__v` is stepped, not tweened.
8. **Pose files** (`hero-motion.js`, `hero-moves.js`, `don.js`).
   * Add wrist and foot keys only where the defaults are wrong.
   * Add the 4-key `turn` and two-hand flags.
   * Don's `SOLES`/`WRIST` move into the MANIFEST.
9. **`tools/generate-support.mjs` and `hero-support`.**
   * Regenerate the down-pose hulls with the foot part.
   * Add **weapon hulls** so down and wake poses keep weapons above `FOOT_Y`.
10. **`tools/render-rigs.mjs`, `tools/rig-sheet.js`.** Add `--out <dir>` so tests and evidence never
    write into `before/`/`after/` by default. This also removes the side effects found in this audit.
11. **Art, one hero per step**, in order of measured severity and least design risk:
    blue → red → orange → purple → teknium → nous → turbofit → don.
    * Each hero step:
      * regenerate the parts;
      * slice and generate;
      * re-measure (§4);
      * capture `evidence/hero-assets-v2/after/<hero>`.

Not touched: `game.js`/`coop.js` beyond the draw call they already make, `levels/*`, collision and props,
`layout-render.js`, and the enemy rigs.

---

## 4. Test changes

### 4.1 Re-measurements (existing checks whose constants change with new art)

* `check-rigs.mjs`: `expectedSoles` moves to the foot image; the weapon tip axes and grip coincidence
  use `hero-grips.js`.
* `check-rigs.mjs`: the red/orange weapon exemption is removed once each has a free weapon.
* The baseline asset-coverage assertion (`before/manifest.json` vs current `HERO_RIGS`):
  * It must compare against the **old** baseline on purpose, so add an allow-list generated from the
    MANIFEST v2 `src` column.
  * Keep a separate new-baseline manifest in `evidence/hero-assets-v2/before/contact-sheets/manifest.json`.
* `WRIST`, `GRIP_OFF`, `PART_SCALE` and `idleLift` values change; they come from generated tables, not
  literals.
* `check-animation.mjs`: down/get-up support hulls are regenerated, and the world-support drift budget
  stays at ≤0.05 px.
* `check-rig-pixels.mjs`: add ankle and wrist to the joint list. The deep-overlap budget per joint becomes
  ≤ the cap radius in §1.0.

### 4.2 New checks

1. **Flat sole.** A planted foot's sole has ≤5° tilt, except frames tagged `__footRoll`.
   Baseline failure: 753 of 976 contacts.
2. **Weapon/floor.** No weapon pixel is more than 2 px below `FOOT_Y` in reachable poses.
   Baseline failure: 33 poses.
3. **Grip coincidence and layer order.** The hand's grip point equals the weapon's grip point within
   1 px, and `grip_back < weapon < grip_front` in the draw order.
4. **Two-hand grip.** The second hand lies within 2 px of the second grip point, and the far-arm IK is
   reachable (no overstretch beyond 98%).
5. **Variant integrity and hysteresis.** Every variant matches its pivot and attach point within 1 px. No
   slot switches more than once per 50 ms in the 30/60/144 Hz replays.
6. **Mirror asymmetry.** Parts flagged asymmetric must have a `_mirror` or be drawn on the camera-agnostic
   side; checked from MANIFEST flags.
7. **Secondary-chain stability.**
   * Spring chains are replayed at 30, 60 and 144 Hz.
   * Final angles agree within 3°.
   * There are no NaNs and no angle above the range limits.
   * The output is frozen during hit-stop (dt = 0).
8. **Proportion bounds.** Head ÷ height must be 0.24–0.29, arm ÷ torso 1.25–1.50 and leg ÷ torso 1.25–1.45.
   Baseline failures: turbofit and don (head); purple and orange (arms); nous (legs).
9. **Alpha edges and magenta spill.**
   * Every part needs ≥2% partial-alpha edge pixels.
   * No pixel may have r>150, b>150, g<80 with alpha > 0 (magenta fringe).
10. **Source sync.** `tests/check-rig-sources.mjs`: the generator `--check` passes, and the `SLICE.json`
    hashes match the PNGs.
11. **Evidence immutability.** Tests and tools never write under `evidence/**/before|after|comparison`
    unless `--out` names the directory explicitly.

---

## 5. Image-generation plan

Generation has two stages per hero. **Never generate parts before that hero's turnaround is approved.**
Store every input and output under `assets/heroes/<id>/src/` together with the prompt text.

### 5.1 Stage 1: turnaround (one per hero, design lock)

* **Canvas.** 2048×1024 PNG, background **flat #FF00FF**, with no gradient, shadow, floor line, text or labels.
* **Layout.** Four full-body views left to right in equal 512 px columns:
  1. **side**, facing right;
  2. **3/4 front**, facing right;
  3. **front**;
  4. **back**.
* **Scale.** Each figure is **760 px tall** from sole to the top of the head (hair included). Soles are
  on **y = 900**, and each figure is centred in its column.
* **Pose.** Neutral A-pose: arms 20° out from the body, hands relaxed and open, legs straight, feet flat.
  The weapon is drawn separately in the side column's lower margin only if the generator cannot avoid it;
  prefer a separate weapon turnaround in Stage 2.
* **Style lock.** Copy this verbatim into every prompt for the roster:
  > clean cel-shaded cartoon, 3 px dark outline at this size, flat colours with one shadow tone and one
  > highlight, no texture noise, no gradients on the background, no cast shadow, same light from upper
  > left.
* **Proportion targets.** These match the bounds in §4.2-8:

| Measure | Target |
| --- | --- |
| Head ÷ height | 0.26 (turtles 0.27; turbofit and don ≤0.28) |
| Arm, shoulder→wrist ÷ torso | 1.35 |
| Upper arm ≈ forearm | ±10% |
| Leg, hip→ankle ÷ torso | 1.35 |
| Thigh ≈ shin | ±10% |
| Foot length ÷ height | 0.16–0.18 |

* **Per-hero design notes.** Keep the existing identity (colours, mask, props) taken from the current
  parts and `before/review/<hero>_keyposes.png`.
  * Turtles show a plastron in front and 3/4 views.
  * Don's scouter goes on the near eye in the side view.
  * Turbofit's tattoo goes on the near arm only.
  * Nous and teknium skirts and coats hang free of the thighs.
* **Approval gate.** The user approves the turnaround image. The approved file becomes
  `src/design.png`, and its sha256 is recorded in `SLICE.json`.

### 5.2 Stage 2: parts sheets (derived from the approved turnaround)

* **Format.** Each sheet is **2048×1536 PNG**, flat **#FF00FF**: a **4 columns × 3 rows grid of 512×512
  cells**.
* **Scale.** Parts are drawn at **4× rig px** (a 68 px torso is 272 px tall). One part per cell, centred.
  At least 32 px of magenta margin to the cell edge; nothing crosses a cell border.
* **Orientation.** Each part is in its §1.0 neutral orientation (limbs vertical, pivot end up), with ball
  caps drawn on both ends, and in the **side view** unless the cell says otherwise.
* **No overlap.** No text, numbers, guides, shadows or overlapping parts.

**Sheet A (body)**

| Row | Column 1 | Column 2 | Column 3 | Column 4 |
| --- | --- | --- | --- | --- |
| 1 | head | head_front | torso | torso_front |
| 2 | uarm | farm | thigh | shin |
| 3 | foot | far/extra 1 (`uarm_far`, `pad`) | far/extra 2 (`pad_far`, `head_mirror`) | spare (magenta) |

**Sheet B (hands and weapon)**

| Row | Column 1 | Column 2 | Column 3 | Column 4 |
| --- | --- | --- | --- | --- |
| 1 | hand_fist / hand_open | hand_grip_back | hand_grip_front | hand_grip_far |
| 2 | weapon | weapon | weapon | weapon |
| 3 | weapon sub-part 1 | weapon sub-part 2 | weapon sub-part 3 | spare |

* **Row 2:** the weapon spans the whole row as **one cell of 2048×512**, drawn horizontally with the grip
  to the left. The slicer rotates it to vertical.
* **Row 3:** sub-parts such as `nunchaku_handle`/`chain`/`stick`, `cable_plug`/`cable_seg`, or the second
  sai if a drawing differs.
* Grip cells show the hand closed on a **thin dark-grey guide rod**. The rod is keyed out by the slicer
  (exact `#404040`), so fingers wrap a real gap of the weapon's grip width.

**Sheet C (secondary; only for heroes that need it)**

| Row | Content |
| --- | --- |
| 1 | mask, sash or hair segments, 1 per cell, in chain order |
| 2 | skirt_front / skirt_back / coat_tail / coat_tail_far |
| 3 | spare |

* **Prompt rules (every parts sheet).**
  * Attach `design.png` as the reference. Name each cell's content in reading order and give the grid
    explicitly.
  * Say "same character, same colours, same outline weight as the reference"; "each body part separated
    as a cut-out puppet piece with rounded joint caps"; "flat #FF00FF background"; and "no labels".
  * Reject and regenerate any sheet with:
    * a part touching a cell border;
    * magenta inside a part;
    * view or style drift from the turnaround (a human compares it against the turnaround);
    * or an unrequested baked-in item, such as a hand on a forearm or a foot on a shin.

### 5.3 Slicer contract (`tools/slice-hero-parts.py`)

* **Inputs.**
  * `SLICE.json`: hero id; sheet → cell → part name; 4× scale; optional per-part overrides
    (`pivot`, `grip`, `tip`, `sole`, `rotate`).
  * The sheet PNGs.
* **Key.**
  * Background where `min(r, 1.6·b) − g > 70 && r > 150`.
  * Edge pixels get alpha from distance to the key colour, with **despill** (pull r and b toward g on edge
    pixels).
  * Guide rod `#404040 ±12` is keyed to transparent in grip cells.
* **Cut.** Fixed by cell: no connected-component guessing. Take the largest component per cell and fail
  if any other component is larger than 1% of it.
* **Scale.** Lanczos downsample by 4, then trim to the alpha bounding box plus 1 px.
* **Pivots by rule.**
  * **Limbs:** pivot at the top-cap centre, child attach at the bottom-cap centre (cap centre = the centroid
    of the topmost or bottommost 15% of alpha rows).
  * **Foot:** ankle = the top-cap centre; sole = the lowest-row heel and toe extremes.
  * **Hand:** wrist = the top-cap centre; grip = the centroid of the keyed rod gap, with its angle.
  * **Weapon:** grip = the rod-matching segment; tip = the farthest alpha point from the grip.
  * **Head and torso:** neck and shoulder/hip attach points come from `SLICE.json`. These cannot be inferred
    reliably.
* **Outputs.**
  * `assets/heroes/<id>/<id>_<part>.png`.
  * MANIFEST.md v2 rows for those parts (replace by part name, keep the rest).
  * `SLICE.json` sha256 values.
* **Safety.**
  * The slicer refuses to write outside `assets/heroes/<id>/`.
  * It refuses to overwrite a PNG whose current hash is not the one recorded in `SLICE.json`, unless
    `--force`.
  * Dry-run by default; `--write` to apply.
* **After slicing.** Run `node tools/gen-hero-rigs.mjs`, then `npm test`, `test:pixels` and the §4 checks,
  then `render-rigs` into `evidence/hero-assets-v2/after/<hero>` with `--out`.
