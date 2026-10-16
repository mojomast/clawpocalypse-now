# Hero Cutout Rigging Pipeline (`v2`)

This document explains how to take source art sheets (`1280x720` JPG/PNG on flat `#FF00FF` magenta backgrounds) and deterministically produce sliced cutout PNGs, anatomical pivots and grip axes, `assets/heroes/MANIFEST.md` tables, `hero-rigs.js`, `hero-support.js`, and verified motion renders for any v2 hero (`turbofit`, `teknium`, `nous_girl`). Before/after key poses and contact sheets: `node tools/capture-hero-evidence.mjs --root <checkout> --out <dir>` then `python3 tools/compose-hero-evidence.py <before> <after> <out> teknium nous_girl`.

Nothing in `hero-rigs.js` or `hero-support.js` is ever hand-edited.

---

## Quick Start (One-Liner to Rebuild a Hero)

To re-slice a hero (e.g. `turbofit`), update `assets/heroes/MANIFEST.md`, regenerate `hero-rigs.js` and `hero-support.js`, and run the verification suite:

```bash
python3 tools/slice-hero-parts.py turbofit --write && node tools/gen-hero-rigs.mjs && node tools/generate-support.mjs && npm test
```

To re-slice **all three** v2 heroes at once:

```bash
python3 tools/slice-hero-parts.py all --write && node tools/gen-hero-rigs.mjs && node tools/generate-support.mjs && npm test
```

---

## Pipeline Architecture & Data Flow

```text
assets/heroes/<hero>/src/*.{jpg,png}   (raw magenta-keyed source sheets)
               +
assets/heroes/<hero>/src/SLICE.json    (sheet rects, part lengths, pivots, gripPairs, rig hierarchy)
               │
               ▼
  python3 tools/slice-hero-parts.py <hero> --write
               │
               ├──► assets/heroes/<hero>/<hero>_*.png      (keyed, despilled, scaled cutout PNGs)
               ├──► assets/heroes/<hero>/src/SLICE.json    (records sha256 of inputs/outputs + measured geometry)
               └──► assets/heroes/MANIFEST.md              (updates <!-- slice:<hero>:begin/end --> table)
                               │
                               ▼
              node tools/gen-hero-rigs.mjs
                               │
                               └──► hero-rigs.js           (HERO_RIGS + HERO_V2 layers, wrist windows, links)
                                               │
                                               ▼
                              node tools/generate-support.mjs
                                               │
                                               └──► hero-support.js (convex alpha-hull polygons for floor/contact)
```

---

## Step-by-Step Guide for Adding or Updating a Hero Sheet

### 1. Source Sheet Conventions (`assets/heroes/<hero>/src/`)

Source sheets are `1280x720` images on a flat `#FF00FF` background (border median magentaness `>= 150`):
- **Vertical limbs:** Upper arms, forearms, thighs, and shins are drawn vertically with the proximal joint (shoulder/elbow/hip/knee) at the top and distal joint at the bottom.
- **Right-facing convention:** Heroes natively face screen-right (`+x`).
- **Grip rods on hands:** Any hand that grips a weapon is drawn closed around a straight, dark-grey horizontal sample rod (`#3a3a3e`) extending at least one hand-width past both sides of the fist (or a wider bar for a guitar neck). The slicer automatically detects the rod's centreline and angle, erases the rod outside the hand silhouette, and derives both the rear palm (`grip_back`) and front finger overlay (`grip_front`) from the **single** source drawing (`sourceIoU = 1.0`), guaranteeing pixel-exact finger/thumb registration.
- **Hidden overlap at joints:**
  - **Sleeve-over / cuff-over layering:** In `MANIFEST.md` `Layers:`, distal parts (`hand`, `farm`, `foot`, `shin`) are drawn *before* (under) proximal parts (`farm`, `uarm`, `shin`, `thigh`) when the proximal part ends in an open sleeve, wristband cuff, or jeans hem, or when the upper arm's elbow overlaps the forearm stub.
  - **Shoulder caps (`torso_cap`):** Torso art has flat, shoulderless armholes (no painted deltoid balls). A derived `torso_cap` part masks the vest lapel / jacket shoulder yoke from `torso` and draws *after* `uarm` so the upper arm's rounded top tenon hides cleanly underneath the vest/jacket.

### 2. Configuring `assets/heroes/<hero>/src/SLICE.json`

Each hero's `SLICE.json` has four top-level configuration sections:

1. **`sheets`**: Maps short sheet IDs (`"A"`, `"B"`, `"C"`, `"D"`, `"D2"`, `"H"`) to filenames in `src/` and optional `scaleFrom` rules:
   ```json
   "C": {
     "file": "sheetC-hands.jpg",
     "scale": 0.11
   }
   ```
   Or auto-calibrated from a reference feature width:
   ```json
   "B": {
     "file": "sheetB.jpg",
     "scaleFrom": { "part": "grip_back", "feature": "wristWidth", "targetPx": 11.33 }
   }
   ```

2. **`parts`**: Defines how each cutout PNG is extracted and shaped:
   - `sheet`, `rect`: `[x0, y0, x1, y1]` bounding box in the source sheet (`1280x720` coordinates). Use `rect` top/bottom crops to trim excess wrist shafts so hands start right at the wrist crease.
   - `kind`: `"torso"`, `"head"`, `"limb"`, `"foot"`, `"hand"`, `"grip"`, `"weapon"`, `"secondary"`, or `"cable"`.
   - `length` (for `"limb"` / `"foot"`) or `height` (for `"torso"` / `"head"` / `"secondary"`): target size in rig pixels. For `"limb"`, scale is computed so the distance between `pivot` and `joint` equals `length`.
   - `scaleAs`: reuse the exact uniform scale factor of another part (e.g. `"scaleAs": "farm"` on foreshortened forearms so they scale uniformly with the main forearm).
   - `pivotAt` / `jointAt`: vertical fraction (`0.0` .. `1.0`) of the cropped opaque height where the proximal `pivot` and distal `joint` sit (horizontally centered on the opaque row at that depth).
   - `roundTop` / `roundBottom`: optional semicircular cap radius (in output rig px) centered at `pivot` / `joint`. Rounds flat cut tenons so rotating a joint never pokes sharp corners out of a socket or cuff.
   - `deoutlineTop` / `deoutlineBottom`: `true` to blend dark cut-line outlines at the interior tenon end into the adjacent skin/fabric colour so overlapping bare-skin joints don't draw dark stripes across each other.
   - `fillDark`: `{ "rects": [[x0, y0, x1, y1], ...], "lum": 100, "edge": 0, "minChroma": 60 }` closes a painted opening (e.g. a vest armhole that the sleeve root now covers): dark interior pixels inside the fractional boxes take the colour of the nearest opaque, saturated (`chroma >= minChroma`) fabric pixel well inside the silhouette, never the despilled edge band. Teknium's yoke jacket uses it.
   - `toneMatch`: `{ "part": "torso", "strength": 1.0, "rim": 0.62 }` light tone match of a new sheet's part to an approved one sliced earlier in the same spec: the light fabric pixels' per-channel mean/std are matched to the reference's (dark ink untouched), and `rim` darkens the 1 px silhouette edge to the reference's line weight, skipping de-outlined tenon ends. Nous's sheetD2 sleeves use it to sit with the sheetA turtleneck.
   - `scale`: explicit uniform scale for one part (rare; prefer `length`/`height`/`scaleAs`).
   - `derive`: derive a child cutout (such as `"torso_cap"`) directly from an already-sliced part (`"derive": "torso"`, `"anchor": "shoulder"`, `"maskBox": [x0, y0, x1, y1]`, `"vestOnly": true`, `"feather": 2.0`).

3. **`gripPairs`**: Lists `[backPart, frontPart]` pairs (e.g. `["grip_back", "grip_front"]`, `["grip_cam_back", "grip_cam_front"]`, `["grip_far", "grip_far_front"]`).

4. **`rig`**: Maps rig slot names (including `slot@variant` rows) to `part`, `parent`, `attach` (e.g. `"torso:shoulder"`, `"uarm:joint"`, `"hand:grip"`), and `role` (`"torso"`, `"body"`, `"cap"`, `"hand"`, `"grip_front"`, `"weapon"`, `"foot"`, `"spring"`, `"rope"`, `"rope_end"`, `"variant"`).

### Perspective variants with their own joint

A `slot@variant` limb row carries its own `joint`. When the variant's bone vector (`joint - pivot`) equals the default drawing's (all of TurboFit's forearms), nothing changes. When it differs, e.g. a foreshortened forearm that is drawn shorter (`farm_cam` with `scaleAs: "farm"`), `rig.js` translates every descendant (hand, finger overlay, weapon) rigidly onto the variant's wrist, so the hand stays seated in the cuff opening without stretching the drawing. `tests/check-rigs.mjs` checks the attachment against the selected variant's joint.

### 3. Header Directives in `assets/heroes/MANIFEST.md`

Above `<!-- slice:<hero>:begin -->` in `assets/heroes/MANIFEST.md`, each v2 hero declares:
- **`Layers:`** Back-to-front draw order of slots.
- **`Links:`** Linked variant rules so choosing a driver variant in choreography (`__variants`) automatically switches dependent slots without non-uniform scaling:
  ```markdown
  Links: torso@front = torso_cap@front, hand@grip_cam = farm@cam + hand_front@grip_cam, hand_b@grip_far = farm_b@support + hand_front_b@grip_far, hand_b@fist_cam = farm_b@cam
  ```
- **`Wrist:`** Soft-limit wrist window `c=<center_deg> hw=<half_width_deg>`.

### 4. Inspecting Debug Crops & Verification

1. **Dry-run and 4x debug crops:**
   ```bash
   python3 tools/slice-hero-parts.py turbofit --debug /tmp/turbofit-dbg
   ```
   This prints every part's dimensions, scale, pivot/joint/grip coordinates, `partialAlpha` (must be `>= 0.02`), and `magentaPixels` (must be `0`), and writes 4x nearest-neighbour PNGs over a dark slate background to `/tmp/turbofit-dbg/`.

2. **Write sliced parts & regenerate rig tables:**
   ```bash
   python3 tools/slice-hero-parts.py turbofit --write
   node tools/gen-hero-rigs.mjs
   node tools/generate-support.mjs
   ```

3. **Run automated checks:**
   ```bash
   npm test
   npm run test:pixels
   npm run test:browser
   npm run test:protected-pixels
   node tools/level-layout-smoke.mjs
   node tools/gen-hero-rigs.mjs --check
   git diff --check
   ```

4. **Render contact sheets and motion strips:**
   ```bash
   node tools/render-rigs.mjs after --out /tmp/rig-sheets --heroes turbofit
   ```
