# TurboFit Rig v2 — Visual & Technical Assessment

## 1. Art Sheets Used vs. Reused / Rejected

| Sheet | Status | Parts / Notes |
|---|---|---|
| `assets/heroes/turbofit/src/sheetD2-arms.jpg` (new) | **Used** | `uarm` (obj1, flat-top upper arm with biceps forward), `farm` (obj2, bare forearm ending in studded leather wristband), `torso` (obj5, 3/4 studded leather vest over bare chest with chains and amber belt buckle, no painted shoulder bumps), `torso_front` (obj6, front vest torso), plus derived vest-lapel shoulder caps `torso_cap` and `torso_cap_front`. |
| `assets/heroes/turbofit/src/sheetD-arms.jpg` (new) | **Used (objs 3 & 4)** | `farm_cam` (obj3, foreshortened camera-facing forearm) and `farm_support` (obj4, thumb-side forearm crossing the chest to support the guitar neck). Objects 1, 2, 5, 6 from v1 were superseded by `sheetD2-arms.jpg` because v1's upper arm had a round ball cap and its torsos had painted shoulder bumps. |
| `assets/heroes/turbofit/src/sheetC-hands.jpg` (new) | **Used (all 6 hands)** | `grip_back` + `grip_front` (obj1, right side-grip on rod), `grip_cam_back` + `grip_cam_front` (obj2, right camera-facing foreshortened grip on rod), `grip_far` + `grip_far_front` (obj3, left support hand wrapping a wide flat guitar-neck bar), `hand_fist` (obj4, left side fist), `hand_fist_cam` (obj5, left camera-facing fist), `hand_open` (obj6, left open/releasing hand). |
| `assets/heroes/turbofit/src/heads.jpg` (existing) | **Reused** | `head` (3/4) and `head_front` (front) — preserves TurboFit's approved copper wavy hair with visible face. |
| `assets/heroes/turbofit/src/sheetB.jpg` (existing) | **Reused (weapon)** | `weapon` (`108x38`, black flying-V guitar axe with gold/green bevel stripe, `pivot=[23,15]`, `grip2=[45,15]`, `tip=[105,15]`). |
| `assets/heroes/turbofit/src/sheetA-polish.png` (existing) | **Reused (legs & hair springs)** | `thigh` (`18x52`), `shin` (`17x48`), `foot` (`34x33`, black boots with mint-green laces, `sole=[4,29,31,29]`), and copper-matched spring hair pieces (`hair_back_1`, `hair_back_2`, `hair_front`). |
| `sheetE-legs.jpg` (attached candidate) | **Rejected / Not used** | As documented in `RESULTS.md`, the candidate `sheetE-legs.jpg` drew the knee bend at 50–60% down the thigh piece instead of at the bottom 12%. Using it at true hip-to-knee bone length would make the thigh 1.5–2x too wide or require non-uniform squashing. Keeping `sheetA-polish.png` legs preserves clean proportions and exact ankle/sole landmarks (`[[8, 43], [8, 43]]` and `[4, 29, 31, 29]`). |

---

## 2. How Joints, Layering, and Grips Fit Together

1. **Shoulder Integration (`uarm` + `torso_cap`):**
   - `torso` (`60x70`) and `torso_front` (`60x70`) from `sheetD2-arms.jpg` have flat vest armholes with no painted deltoid balls.
   - `uarm` (`27x50`, `pivot=[10,7]`, `joint=[17,42]`) has its top tenon rounded (`roundTop: 7.5`) and de-outlined (`deoutlineTop: true`) around `pivot=[10,7]`, and attaches at `torso:shoulder` (`[8,17]`).
   - `torso_cap` (`21x29`, `pivot=[8,10]`, `role: 'cap'`) is derived in `tools/slice-hero-parts.py` from the vest lapel around `torso:shoulder` with `vestOnly: true` (masking out bare chest skin so it never pastes chest skin over a crossing arm) and is drawn immediately *after* `uarm`. As the shoulder rotates through wind-ups and overhead swings, the upper arm's root slides cleanly under the studded leather vest lapel.

2. **Sleeve-Over / Cuff-Over Layering (`hand < farm < uarm`):**
   - `MANIFEST.md` declares `Layers: hair_back_1, hair_back_2, hand_b, farm_b, uarm_b, hand_front_b, foot_b, shin_b, thigh_b, head, hair_front, foot, shin, thigh, torso, hand, farm, uarm, torso_cap, weapon, hand_front`.
   - Because `uarm` is drawn over `farm`, `uarm`'s anatomical elbow overlaps `farm`'s rounded, de-outlined top tenon (`roundTop: 5.5, deoutlineTop: true`), eliminating dark cut lines across the bare-skin elbow crease.
   - Because `farm` is drawn over `hand`, `hand`'s `3px` wrist tenon (`py = 3`, `roundTop: 3.5, deoutlineTop: true`) tucks inside `farm`'s black studded wristband cuff (`joint=[9,43]`), so the silver studs on the wristband remain fully visible instead of being covered by a wrist stub.

3. **Matched Forearm Bone Vectors & Linked Perspective Variants (`Links:`):**
   - All three forearm drawings (`farm` from `sheetD2`, `farm_cam` from `sheetD` obj3 rotated `-6°`, and `farm_support` from `sheetD` obj4 rotated `+13°`) share the **exact same bone vector `[-1, 35]`** from elbow `pivot` to wrist `joint`. When `Links:` switches `farm` to `farm@cam` or `farm_b` to `farm_b@support`, the child hand stays seated on the wristband cuff opening with zero displacement.
   - `grip_back`/`grip_front` and `grip_cam_back`/`grip_cam_front` both have `pivot=[12,3]` and `grip=[9,17]`, so switching `hand@grip_cam` keeps the guitar handle locked at the exact same palm coordinates.

4. **Two-Handed Guitar Neck Wrap (`hand_b < weapon < hand_front_b`):**
   - When two-handed support IK succeeds (`twoHandSolve` reaches `weapon.grip2 = [45,15]` within `<= 2px`), `variants.hand_b = 'grip_far'` triggers `Links: hand_b@grip_far = farm_b@support + hand_front_b@grip_far`.
   - `uarm_b` stays *behind* `torso` (emerging naturally from behind the far side of the chest), while `farm_b` (`farm_support`) and `hand_b` (`grip_far` rear palm/thumb) move in front of `torso` and before `weapon`, and `hand_front_b` (`grip_far_front` curled four fingers) is drawn *after* `weapon` at `M.hand_front_b = M.hand_b`.
   - The crossing forearm/hand use `brightness(0.88)` instead of the dark `0.66` back-limb tint so the arm crossing the chest reads as lit skin rather than a dark blob.

5. **Choreography & Reach:**
   - Opened the guitar/torso angles on `axe`, `axeB`, and `axeHeavy` wind-up and active frames so the guitar body and arms don't bunch against the chest.
   - Tuned `turbofit_backAttack` (`torso: -12, dx: -10, uarm_b: 92, farm_b: -105, __variants: { hand_b: 'fist_cam' }`) so the rear elbow/fist reaches the back-attack hitbox without invisible reach padding.

---

## 3. Verification & Evidence Files in `evidence/turbofit-rig-v2/`

- `contact-sheets/before-turbofit.png`, `contact-sheets/after-turbofit.png`, `contact-sheets/comparison-turbofit.png`: Full 151-pose × 2-facing contact sheets before and after.
- `compare/turbofit-arms-grips.png`: Side-by-side 6-pose comparison (`idleA`, `axe_active`, `axeHeavy_active`, `chord_active`, `taunt`, `victory`) showing the shoulder cap, elbow seam removal, two-handed neck wrap, and hand variants.
- `before/turbofit/*.png`, `after/turbofit/*.png`, `comparison/turbofit/*.png`: 30 production 60 Hz motion strips at `RIG_SCALE = 0.7` in both facings (columns 1–2 at 1:1 game scale, columns 3–4 at zoom crop) covering every attack (`axe`, `axeB`, `axeHeavy`, `chord`, `headbang`, `launcher`, `juggle`, `dash`, `dashAttack`, `grab`, `grabThrow`, `backAttack`, `hitReact`, `healthSpecial`, `groundPound`, `dodgeRoll`) and state (`idleA/B/C`, `walk`, `run`, `jump`, `turn`, `grabHold`, `grabbed`, `stagger`, `hurt-down-getup`, `stationary-recovery`, `taunt`, `victory`).

---

## 4. Honest Assessment of Remaining Issues

- **Legs unchanged (`sheetE-legs.jpg` not used):** Because the candidate `sheetE-legs.jpg` had the knee drawn mid-thigh (50–60% down the sprite), we kept the `sheetA-polish.png` legs rather than distorting or non-uniformly scaling `sheetE`. Consequently, high kicks (`kick`, `jumpKick`, `kick_knee`) still use the standard thigh drawing rather than a dedicated foreshortened `thigh@raised` variant. A ready-to-use regeneration prompt for `sheetE-legs.jpg` is included in `RESULTS.md` / `tools/HERO-PIPELINE.md`.
- **Support forearm thickness in tight chest crosses:** In deeply coiled frames (`chord_active`), `farm_b@support` crosses horizontally across the bare chest and covers a large portion of the upper abs/chains. It reads cleanly as an arm now (with the wristband and fingers wrapping the guitar neck), though a slightly slimmer support forearm drawing would leave more of the chest chains visible.
- **Turn/Taunt front-head transition:** In `turn`, `taunt`, and `victory`, the head and vest switch to `@front` while the arms remain in 3/4 view; `torso_cap@front` hides the near shoulder join cleanly, though in `victory` (where `uarm` is raised `-80°` overhead) a small portion of the bare axilla tenon peeks out below the lapel edge at 4x zoom.
