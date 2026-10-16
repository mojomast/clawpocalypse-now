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
| Nous | `src/sheetD2-arms.jpg` (new, regenerated to the spec in section 5) | Used | `uarm` 13x48 (straight, flat top, rounded bottom; pivot [6,4], elbow [6,41]), `farm` 11x42 (straight, ribbed cuff; pivot [5,3], wrist [5,39]) and `farm_cam` 14x28 (foreshortened, face-on cuff oval; pivot [6,2], wrist [7,25], bone 23 px = 64 % of `farm`'s 36). All three use one uniform scale each (`farm_cam` uses `scaleAs: farm`). `farm_cam`'s top is cropped, not squashed, because that part sits under the upper sleeve. The tenons are shaped like TurboFit's (`roundTop` + `deoutlineTop`). A light `toneMatch` to the torso is applied: per-channel mean/std of the light fabric matched to the turtleneck, plus a 1 px rim at 0.62 to match its line weight. |
| Nous | `src/sheetA.jpg` arms | Superseded | Replaced by sheet D2. |
| Nous | `src/sheetC-hands.jpg` (new) | Used | `grip` / `grip_cam` pairs (the cable leaves on the pinky side), `hand_fist`, `hand_fist_cam`, `hand_open`. Scaled from the wrist width (5.6 px). |
| Nous | `src/sheetD-arms-cable.jpg` (new) | Partly used | Used: obj4 jack plug (`weapon`, `cable_end`), cable segment, and obj6 as `fx_lash` (drawn along the cable chord only at lash contact). **Rejected: the sleeves (objs 1-3)**: obj1 is pre-bent, and objs 2 and 3 are about 1.6x too wide. Superseded by sheet D2. |
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
  - On both heroes, `Links:` swap `farm@cam` together with `hand@grip_cam` and `hand_front@grip_cam`, and swap `farm_b@cam` with
    `hand_b@fist_cam`.
- **Variant joints (new in `rig.js`):** a variant whose bone is a different length (both heroes' foreshortened forearms)
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

1. **Nous's new sleeves are plainer than the torso.** After the tone match the colour and contrast agree with the
   turtleneck, but the sleeves are smooth tubes with faint hatching. The torso has bold cel-shaded fold shadows, so at 1x
   the arms read slightly flatter and more "plastic" than the body. Other details:
   - The upper sleeve (13 px) is wider than the forearm (11 px), which gives a small step at the elbow on straight arms.
   - `farm_cam`'s cuff flares to 14 px, as drawn in perspective. Its knuckles-on hand is narrower than that oval.
2. **Nous torso shoulder nubs.** The approved torso has painted round shoulders, the far one especially. With the arm
   swung forward, the far nub still reads a little like a second shoulder next to the cap.
3. **Raised arms** now go up and slightly back, beside the head, instead of across the face. This covers victory (both
   heroes), Teknium's burst, and Nous's overhead wind-ups (whipB, bassDrop/healthSpecial and groundPound wind).
   - Nous's launcher has to strike forward (the contact test needs the attack side), so it raises the fist in front of
     the face with the elbow at chin height instead of going up and back. Her arm clears the face, but in
     launcher_follow the draped cable falls back across it for a few frames.
   - In whipB_wind, Nous's upper sleeve still overlaps the back of her hair and headphone.
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
    - Side view: Nous's far arm uses a neutral `brightness(0.9)` (no sepia), so it reads as a shaded white sleeve
      rather than beige or grey.
    - Front view (turn, taunt, victory): Nous's far arm takes only `brightness(0.96)` and Teknium's `brightness(0.86)`.
12. **Evidence background:** the evidence renders use `#3b4459`, because the black cable disappears on the game's darkest
    stage colour. On very dark stages the cable is still hard to see.

## 5. Missing art

The Nous sleeves requested in the previous pass have arrived (`src/sheetD2-arms.jpg`) and are in use. Their aspect ratios
fit the spec at uniform scale: 121x459 source -> 13x48, 114x458 -> 11x42. Only the foreshortened forearm's top was cropped.

Still optional, both heroes: E legs, with the knee bend in the bottom 12 % of the thigh piece. The thigh is slender (width about
0.30 of length) with a flat hip cut. The shin starts with a capless stub that tucks under the knee. Thigh and shin are the same
length. Add a raised (foreshortened) thigh for kicks.

## 6. Files

- `compare/teknium-arms-grips.png`, `compare/nous_girl-arms-grips.png`: 6 key poses. BEFORE (base) and AFTER, right-facing,
  then left-facing. Teknium: idleA, bladeA_active, bladeC_active, burst_active, taunt, victory. Nous: idleA,
  whipA_active, wave_active, bassDrop_active, taunt, victory. Each cell settles 30 frames at 60 Hz, so the cable's
  secondary motion is live.
- `contact-sheets/{before,after,comparison}-{teknium,nous_girl}.png`: every named pose, both facings
  (`tools/rig-sheet.html?mode=baseline`).
- The capture tool now waits for every drawing, including perspective variants and the lash stroke, to decode before the
  first cell. Before this, a cold start could drop a variant hand from the first cells.
- Regenerate with `node tools/capture-hero-evidence.mjs --root <checkout> --out <dir>`, then
  `python3 tools/compose-hero-evidence.py <before> <after> evidence/teknium-nous-rig-v2 teknium nous_girl`.
