# Teknium + Nous Girl rig v2: assessment

Base: `feat/turbofit-rig-v2` (PR #8). Same pipeline: `SLICE.json` / `MANIFEST.md` -> `tools/slice-hero-parts.py --write`
-> `tools/gen-hero-rigs.mjs` -> `tools/generate-support.mjs`. `hero-rigs.js` is generated only.

Approved looks are unchanged. Head, legs, feet, hem tails, weapon and spring hair come from the
existing sheets. Teknium keeps the sage-teal spiky hair, the white wedge visor with red stripes, the green
jacket, charcoal trousers, fingerless gloves, white/green sneakers and the cyan blade. Nous keeps the black
manga hair, white headphones, white turtleneck, blue jeans, white/blue sneakers and the jack cable.

## 1. Sheets used and rejected

| Hero | Sheet | Status | Parts |
|---|---|---|---|
| Teknium | `src/sheetD-arms.jpg` (new) | Used | `torso` / `torso_front`: yoke jacket without painted shoulder balls. The vest armhole is closed with the new generic `fillDark` slicer option, which takes colour only from saturated fabric pixels well inside the silhouette. Also `uarm` (flat top, `roundTop` + `deoutlineTop` tenon), `farm` (sleeve ending in a cuff opening) and `farm_cam` (foreshortened forearm: same width, bone 25 px vs 31 px). `torso_cap` / `torso_cap_front` are derived. |
| Teknium | `src/sheetC-hands.jpg` (new) | Used | `grip` + `grip_front` (blade side-grip pair), `grip_cam` + `grip_cam_front` (knuckles-on grip), `hand_fist`, `hand_fist_cam`, `hand_open`. Scaled from the wrist width (6.4 px), so each wrist stub fits the cuff. |
| Nous | `src/sheetC-hands.jpg` (new) | Used | `grip` / `grip_cam` pairs (the cable leaves on the pinky side), `hand_fist`, `hand_fist_cam`, `hand_open`. Scaled from the wrist width (5.6 px). |
| Nous | `src/sheetD-arms-cable.jpg` (new) | Partly used | Used: obj4 jack plug (`weapon`, `cable_end`), cable segment, and obj6 as `fx_lash` (drawn along the cable chord only at lash contact). **Rejected: the sleeves (objs 1-3)**, see section 5. |
| Both | `sheetE-legs` | Not used | The knee bend is drawn mid-thigh, the same fault PR #8 documented. The legs are unchanged. |

## 2. How the joints fit

- **Shoulder:** the upper arm's flat, rounded, de-outlined tenon goes under the derived `torso_cap`, which is drawn after
  `uarm`. On Teknium the cap is cut from the jacket yoke. On Nous it is cut from the turtleneck shoulder.
  `torso_cap@front` is linked to `torso@front` for turn, taunt and victory.
- **Elbows under sleeves, wrists under cuffs:** Layers draw `hand < farm < uarm` (and `_b`), so the forearm's
  rounded top stub sits under the upper sleeve and the hand's wrist stub sits under the cuff.
- **Perspective hands** are chosen per pose in `hero-polish-teknium.js` / `hero-polish-nous.js` (`*Presentation`) and
  `hero-polish-actions.js`:
  - `grip_cam` on attack/special wind-ups, launcher, ground pound and taunt.
  - `fist_cam` on backAttack active/follow, stagger and health-special.
  - `open` on grabs, grabbed, jump, flinch, hit reacts, wake, taunt and victory.
  - `Links:` swap Teknium's `farm@cam` together with `hand@grip_cam` and `hand_front@grip_cam`.
- **Variant joints (new in `rig.js`):** a variant whose bone is a different length (Teknium's foreshortened forearm)
  moves its children rigidly onto its own wrist. Nothing is stretched. TurboFit's variants all share one bone vector, so it is
  unaffected. `tests/check-rigs.mjs` now checks attachment against the selected variant's joint.
- **Teknium blade grip:** palm (`hand`) < `weapon` < fingers (`hand_front`), both cut from one drawing (`gripPairs`).
- **Nous cable:** palm < plug < fingers.
  - At lash contact the cable is laid along the hand-to-jack chord as one taut, shallow arc, with the `fx_lash`
    streak drawn along it at 60 % alpha. Before, it was a closed loop.
  - Whip choreography keeps the elbow bent and the fist inboard, so the cable spans the reach instead of the arm.
  - At rest the Verlet cable drapes as an open trailing hook behind the hand, not a closed ring.

## 3. Results

- `npm test`, `npm run test:pixels`, `npm run test:browser` and `npm run test:protected-pixels` all pass.
  `test:protected-pixels` covers the four turtles, don_piedro and now **turbofit** (byte-identical to
  `feat/turbofit-rig-v2`, recorded in `evidence/turbofit-rig-v2/protected-*.json`).
- Floor guard, toe pivot, below-floor and arm-stretch counts over every authored key: Teknium 142 keys, 0 / 0 / 0 / 0.
  Nous 161 keys, 0 / 0 / 0 / 0. TurboFit 146 keys, 0 / 0 / 0 / 0.
- Reach: `check-polish-contact` covers 66 real combat hits in both facings, with bounded melee reach, aligned sparks and
  0 misses. It also covers 24 held knee/throw cases.

## 4. What still looks off (honest list)

1. **Nous has no foreshortened forearm.** `grip_cam` sits on the straight side-view sleeve. In whipB/launcher/bassDrop
   wind-ups the knuckles-on hand reads as slightly rotated, not pointing at the camera. Needs art, see section 5.
2. **Nous torso shoulder nubs.** The approved torso has painted round shoulders, the far one especially. With the arm
   swung forward, the far nub still reads a little like a second shoulder next to the cap.
3. **Raised arms in victory / burst** now go up and slightly back, beside the head, instead of across the face.
   - In burst_active and burst_follow, Teknium's upper sleeve still brushes the back edge of his hair.
   - The wrist limit (`Wrist: c=20 hw=35`) cannot stand the blade upright on an arm raised that far back, so it is held
     aloft angled back about 45°.
   - Teknium's taunt now holds the blade low and forward, with the forearm under the chin. It still crosses the collar.
4. **Lash slack is not drawn.** At contact the cable chord is capped by the reach budget (`__reach`), so the whip is
   always taut at full extension. There is no traveling wave or overshoot frame. It reads as a lash, but a stiff one.
5. **The held plug** still points down out of the fist during the lash. The free jack carries the strike.
6. **The resting cable** is a fixed hook shape driven by `restRope`. It sways, but its silhouette is the same in every idle.
7. **Teknium cap seam:** at 3-4x zoom a faint shade step shows where `torso_cap` meets the jacket on the near shoulder.
   It is invisible at 1x.
8. **Teknium `grip_cam` (sheet C obj 2)** is only weakly knuckles-on. Together with the shorter forearm the blade wind-ups
   read better than before, but it is not a strong foreshortening.
9. **Kicks:** Teknium's blade arm holds a fixed high guard (`[-120, -30]`) through kick, jumpKick and knee, so it stays
   clear of the raised leg. It doesn't counter-swing.
10. **Legs unchanged.** There is no `thigh@raised`, so high kicks use the side-view thigh.
11. **Back-limb shade:**
    - Side view: Nous's far arm uses a neutral `brightness(0.84)` (no sepia), so it reads as a shaded white sleeve
      rather than beige.
    - Front view (turn, taunt, victory): Nous's far arm takes only `brightness(0.96)` and Teknium's `brightness(0.86)`.
    - Her sheet-A sleeves still carry less painted shading than the turtleneck torso.
12. **Evidence background:** the evidence renders use `#3b4459`, because the black cable disappears on the game's darkest
    stage colour. On very dark stages the cable is still hard to see.

## 5. Missing art (needed to finish Nous; I did not fake these)

Nous `sheetD-arms-cable.jpg` objs 1-3 are unusable:
- obj1 (upper arm) is drawn already bent at the elbow.
- obj2 and obj3 (forearms) are about 1.6x too wide at the true bone length: about 18 px vs the 11 px sleeve.
  Making them fit would need non-uniform squashing.

Please regenerate, same style references as the N-D sheet:

| Object | View | Size at game scale (source about 12x) | Joints |
|---|---|---|---|
| Upper arm, white knit turtleneck sleeve | 3/4 side, perfectly straight and vertical, no elbow bend drawn | 13 x 48 px (width about 0.27 of length) | Flat, capless shoulder cut. Shoulder pivot centred about 8 % down. Elbow about 90 % down. Ends a little past the elbow. |
| Forearm, same sleeve | Side, straight and vertical | 11 x 42 px (width about 0.25 of length, no wider than the upper arm) | Flat, capless top stub, pivot about 8 % down. Ribbed cuff whose dark opening is exactly the C-hand wrist width (5.6 px). Wrist joint at the cuff centre about 95 % down. |
| Foreshortened forearm, same sleeve | Pointing toward the viewer | Same 11 px width, about 60 % of the length (bone about 22-25 px) | Same top stub. Cuff opening is a near face-on oval, with the wrist joint at its centre. |

Prompt (from `evidence/hero-art-fit/RESULTS.md`):
> 1) Upper arm in the white knit sleeve, perfectly STRAIGHT and vertical (no elbow bend drawn), width about 0.27 of its
> length, flat capless shoulder cut, ends a little past the elbow. 2) Forearm in the same sleeve, straight and vertical,
> width about 0.25 of its length (no wider than the upper arm), flat capless top stub, ribbed cuff with a dark opening
> exactly as wide as the wrist of the C-sheet hands. 3) The same forearm foreshortened toward the viewer, ~60% of the
> length and the SAME width as 2, the cuff opening a near-face-on oval.

Optional, both heroes: E legs, with the knee bend in the bottom 12 % of the thigh piece. The thigh is slender (width about 0.30
of length) with a flat hip cut. The shin starts with a capless stub that tucks under the knee. Thigh and shin are the same length.
Add a raised (foreshortened) thigh for kicks.

## 6. Files

- `compare/teknium-arms-grips.png`, `compare/nous_girl-arms-grips.png`: 6 key poses. BEFORE (base) and AFTER, right-facing,
  then left-facing. Teknium: idleA, bladeA_active, bladeC_active, burst_active, taunt, victory. Nous: idleA,
  whipA_active, wave_active, bassDrop_active, taunt, victory. Each cell settles 30 frames at 60 Hz, so the cable's
  secondary motion is live.
- `contact-sheets/{before,after,comparison}-{teknium,nous_girl}.png`: every named pose, both facings
  (`tools/rig-sheet.html?mode=baseline`).
- Regenerate with `node tools/capture-hero-evidence.mjs --root <checkout> --out <dir>`, then
  `python3 tools/compose-hero-evidence.py <before> <after> evidence/teknium-nous-rig-v2 teknium nous_girl`.
