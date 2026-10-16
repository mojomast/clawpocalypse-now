# Independent final visual review

> **Follow-up:** This review records `14a2888`, not the final revised source.
> The stationary-recovery blocker was subsequently repaired and independently
> rechecked in the actual game; see [RECOVERY-FIX.md](RECOVERY-FIX.md).
> `fd1e4ee` also adds explicit Teknium/TurboFit held-knee lifts and lower J3
> contacts. The original findings below remain intact as the review history;
> the hand-art and general cutout/silhouette limitations still apply.

**Review date:** 2026-10-15, approximately 21:59–22:07 UTC.  
**Target:** integrated `feat/hero-animation-polish`, served at `http://127.0.0.1:48791`.  
**Verdict: not ready for unconditional visual sign-off.** One persistent recovery defect was reproduced in the real game, not just a pose sheet. The new contact timing and ground/air kick distinctions do work in the inspected frames. Remaining silhouette/source-view limitations should not be described as “world-class” animation.

This review changed no code, assets, tests, or historical evidence and made no commits. Its only repository output is this document. Independent screenshots are local, temporary evidence under `/tmp/opencode/polish-final-review/`; their absolute paths below identify the actual images inspected.

## 1. High-priority blocker: Nous remains kneeling after knockdown recovery

**Confirmed in `index.html`, with `playerDown === 0`, combat phase `idle`, and `playerPose(...) === 'nous_girl_idleA'`.** Her lower legs remain folded backward and her body remains too low. This is not simply an intentionally crouched wake drawing or the normal time needed to stand up.

Reproduction used the real game, selected Nous through the normal selection screen, then isolated enemies in memory (`ninjas = []`, `holdWave = true`). Calling the production `damagePlayer(state, 12, { knockdown: true, x: player.x + 100 })` produced the normal `playerDown = 0.7` and HP 100→88. At approximately **two seconds after that call**, without movement input, the game had returned to idle but the drawing had not returned to standing. A short rightward walk subsequently released the bad stance. No source or renderer override was used. The live reproduction had zero page errors and zero guarded renderer errors.

Actual game evidence:

- Before: `/tmp/opencode/polish-final-review/live/nous-before-down.png`
- During: `/tmp/opencode/polish-final-review/live/nous-during-down.png`
- **Recovered state, still kneeling:** `/tmp/opencode/polish-final-review/live/nous-after-down-idle-2s.png`
- After walking: `/tmp/opencode/polish-final-review/live/nous-after-down-walk-idle.png`

The independent production-animation replay also reproduces this in **both facings**, still present at frame 180:

- `/tmp/opencode/polish-final-review/nous-tek/nous_girl-hurt-down-getup.png`
- `/tmp/opencode/polish-final-review/nous-tek/nous-down-idle-f180.png`

**Disposition:** block final animation-polish sign-off until fixed and rechecked. It is a visual recovery/state defect, not a demonstrated input lock or crash. Retained wake foot anchors/root settling are a plausible investigation area in `foot-lock.js`; this review does not claim to have proved the exact implementation cause. A regression check should exercise **down → wake → stationary idle**, not just independently solved named poses or an immediate walk after recovery. Check both facings and all three heroes after the correction.

## 2. What visibly works

### First active versus first hit/hit-stop

Native 960×300 captures use the actual `combatStep` and production pose selector, animation, foot locks, live secondary simulation, and scale **0.7**. In these fixtures, the phase becomes active one simulation frame before damage is registered. The contact drawing is already present on that first active frame; it does not wait for the later HP change.

| Case | Teknium active / hit | Nous active / hit | TurboFit active / hit |
|---|---|---|---|
| J1 | 16 / 17 | 16 / 17 | 16 / 17 |
| J2 | 16 / 17 | 16 / 17 | 16 / 17 |
| J3 | 17 / 18 | 17 / 18 | 17 / 18 |
| J4 / finisher | 18 / 19 | 19 / 20 | 21 / 22 |
| Ground kick | 21 / 22 | 21 / 22 | 21 / 22 |
| Air kick | 15 / 16 | 15 / 16 | 15 / 16 |

Frame numbers are zero-based fixture frames, not claims about input latency. First-hit sheets actually inspected:

- `/tmp/opencode/polish-final-review/contacts/teknium-combo-first-contact.png`
- `/tmp/opencode/polish-final-review/contacts/nous_girl-combo-first-contact.png`
- `/tmp/opencode/polish-final-review/contacts/turbofit-combo-first-contact.png`
- `/tmp/opencode/polish-final-review/contacts/teknium-kick-grab-first-contact.png`
- `/tmp/opencode/polish-final-review/contacts/nous_girl-kick-grab-first-contact.png`
- `/tmp/opencode/polish-final-review/contacts/turbofit-kick-grab-first-contact.png`

A separate focused browser check rendered wind → **first active with `dt = 0`** → another zero-dt active draw, using the production animation/foot-lock/rig/secondary path. For J1, J4, ground kick and air kick on each hero, all **12 repeated hit-stop images were pixel-identical**. The first zero-dt image visibly commits the strike rather than retaining the wind-up:

- `/tmp/opencode/polish-final-review/contacts/teknium-zero-dt-commit.png`
- `/tmp/opencode/polish-final-review/contacts/nous_girl-zero-dt-commit.png`
- `/tmp/opencode/polish-final-review/contacts/turbofit-zero-dt-commit.png`

This is a targeted contact presentation check, not a substitute for the main session's full gameplay/test suite.

### Kicks, support and anatomy

- **All three ground kicks have an extended striking leg and a visibly planted support leg.** Air kicks have the extended front leg and a raised/tucked rear leg. They are no longer merely weapon attacks under a kick name.
- Teknium's diagonal blade crosses the raised-leg region and makes his kick busier than Nous's cleaner silhouette. This is a readability limitation, not a missing kick.
- TurboFit J1 has a low diagonal guitar contact, J2 a higher/upright contact, and the heavy finisher adds a deeper body dip. The hands and shoulders remain connected in the unobstructed inspected frames; no persistent detached shoulder/hand was confirmed.
- Grounded attack/recovery samples generally retain support. TurboFit's short down/get-up replay has a visibly floating, horizontal-body transition before lowering and returning upright. That is less convincing than a decisive fall/settle, but it is **not** the persistent idle defect reproduced for Nous.

Useful unobstructed evidence:

- `/tmp/opencode/polish-final-review/turbofit/detail-review-sequence.png`
- `/tmp/opencode/polish-final-review/turbofit/review-03.png`
- `/tmp/opencode/polish-final-review/nous-tek/teknium-kick-native-f21.png`
- `/tmp/opencode/polish-final-review/nous-tek/teknium-jumpKick-native-f19.png`

### Nous cable and actual dynamic secondary motion

Consecutive actual-combat frames **12–35**, rather than unrelated static poses, were inspected for Nous J1/J2 and Teknium J1/J2:

- `/tmp/opencode/polish-final-review/nous-tek/nous_girl-punch1-perframe.png`
- `/tmp/opencode/polish-final-review/nous-tek/nous_girl-punch2-perframe.png`
- `/tmp/opencode/polish-final-review/nous-tek/teknium-punch1-perframe.png`
- `/tmp/opencode/polish-final-review/nous-tek/teknium-punch2-perframe.png`

Nous's cable visibly changes shape through recovery, while the impact/hit-stop drawings hold. The hand-to-cable connection and compact forward loop remain intact in the inspected active frames in both facings; no forward-end runaway was reproduced. These captures pass gameplay reach into animation and do not infer combat cable range from a reach-less authored-move preview. Hair and coat overlap is much subtler at gameplay size than the cable motion.

The cable is dark on a dark background, and its tightly bounded loop can read as a small held loop rather than a broad whip sweep. That is a real style/readability limit, not proof of a disconnected cable. Small floating blue/gray marks in some stills are weapon-smear copies, not sufficient evidence that the live endpoint has detached.

## 3. Remaining quality limitations, not equivalent to the recovery blocker

1. **J2/J3 silhouette distinction is weak.** TurboFit's upright guitar position and Teknium's rising blade position remain particularly similar across those two contacts. Nous changes the hand/cable height and body turn, but the overall gesture remains restrained. A separate hook pose name does not by itself make J3 read as a strongly different strike. The native combo sheets above are the evidence; this is not a claim that all four hits are identical.
2. **Teknium and TurboFit held-knee actions remain mostly standing arm/weapon gestures.** The `kneeFinal` hit samples do not show a comparably explicit knee lift to Nous's. That weakens the move's visual explanation even though the grabbed-target fixture registers the hit. See the three `*-kick-grab-first-contact.png` sheets and `/tmp/opencode/polish-final-review/nous-tek/teknium-kneeFinal.png` versus `nous_girl-kneeFinal.png`.
3. **Hand foreshortening remains source-limited.** Nous/Teknium have registered grip-back and finger-overlay images plus fist/open free-hand images, not a separately authored side-grip view. Neither primary hand exposes a sidegrip variant in the served rig table. Inspect `/tmp/opencode/polish-final-review/nous-tek/available-hand-sourceviews.png` (native images plus 5× enlargement). Rotating these narrow cutouts can maintain a connected grasp, but it cannot substantiate a claim of independently drawn side-view hand anatomy or convincing in-depth foreshortening. TurboFit's corrected closed far grip is useful, but is likewise not proof of a complete multi-angle hand library.
4. **Weapon/body overlap and limited exaggeration remain visible.** TurboFit's folded guitar/wrist/torso cluster reduces the sense of a wide, heavy axe sweep; Teknium's rear arm can merge with his coat. These are art-direction/presentation limits rather than confirmed severed joints.

## 4. Installed-source check and evidence qualifications

- `rig.js` calls all three hero installers and then `installPolishedActions`; these are active, not merely unreferenced modules.
- TurboFit's `SLICE.json` uses `sheetA-polish.png`; `prepare-polish.py` documents the torso socket cleanup from the untouched approved source. Generated rig metadata points at the installed arm/torso and closed far-grip assets. The rendered TurboFit anatomy above, rather than this metadata alone, informed the review.
- Observed checkout HEAD during review: `14a28885ccb8d2d4ae7fbb6c5d685a02f8ef7fe2`. The main session was also producing documentation/captures, so this is a review of the served integrated source, not a separate immutable worktree.
- Relevant source fingerprints for the reproduced recovery issue: `foot-lock.js` SHA-256 `f4e5ed7e5ac04f7d0a66d62ae164d03044048e1f74c1f95de869150439147d81`; `rig.js` SHA-256 `cf6f908697c38844145fda04c49782009a876096c98f2ef06d6cb758204dad85`.
- The combat fixture uses fixed rectangular targets, not enemy animation/AI. It does **not** establish correct two-character grab overlap in a real fight. `grabdown` is not a separately exposed move; coverage used grabbed/hold, knees, throws and down/get-up.
- Area/sound actions are not literal weapon-tip contacts. In particular, `tools/polish-combat.js` does not draw the game's `drawContactCue` area/wave cue, so a wave fixture still with a distant hit must not be mislabeled as a missing production sound-wave effect.
- Teknium/TurboFit rear-elbow attacks miss the fixture's old broad-range midpoint. Their new narrow rear boxes are closer to the visible elbow; that miss alone is **not** evidence of a contact bug. A closer-target gameplay test would be needed to judge usefulness/balance.
- **Rejected misleading evidence:** `/tmp/opencode/polish-final-review/turbofit/detail-kicks.png` crops away the forward foot and joins opposing actor crops. An initial “no extended kick” interpretation was withdrawn after checking intact native images. Do not use that crop sheet to support a kick-anatomy defect.

## 5. Review coverage and completion

Two independent read-only reviewers completed their work: TurboFit anatomy/all replay states/actions, and Nous/Teknium actions/cable/hand source views. The lead reviewer checked their images, rejected the crop-induced false positive, independently captured first-active/on-hit cases for all three heroes, performed the 12 zero-dt checks, and reproduced the Nous recovery defect in the actual game.

TurboFit coverage included all exposed 13 review states, 16 review actions, and 18 combat fixtures, with native sheets and selected sequential close-ups. Nous/Teknium coverage included full combos/finishers, specials, ground/air kicks, launcher/juggle/dash attacks, rear actions, holds/knees/throws, dodge recovery, down/get-up, and front-facing presentation/hand views. Representative additional sheets are under `turbofit/` and `nous-tek/` in the evidence root above.

Four turtles, Don, title art and cinematics were not edited or aesthetically re-reviewed. Protected-source/pixel certification and the full npm suite belong to the main session; they were not duplicated or claimed as passed here. All child sessions finished. **Outstanding action: repair and re-review Nous's stationary recovery before presenting this pass as visually complete.**
