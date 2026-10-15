# Stationary knockdown recovery correction

Scope: `foot-lock.js` and the new `tests/check-polish-recovery.mjs`. No prior evidence, artwork, combat logic, or other runtime files are changed by this workstream. No commits or pushes.

## Reproduced cause

The first `wake` drawing is still blended from `down`. Its world-space support anchors are therefore temporary fallen/recovery contacts, not standing-idle contacts. Nous can keep reaching those anchors with bent legs, so the old unreachable-contact release never fires. The solver compensates by retaining a lower root indefinitely. Movement replaces the anchors, explaining the independently observed workaround.

The saved original `foot-lock.js` has SHA-256 `f4e5ed7e5ac04f7d0a66d62ae164d03044048e1f74c1f95de869150439147d81`, matching `FINAL-REVIEW.md`. Replaying the new full production-animation test against that original module reproduces **19.6 screen-pixel hip displacement** and approximately **38.4–38.9 screen-pixel ankle displacement** for Nous after recovery, in both facings at 30/60/144 Hz.

Original actual-game captures were preserved, without modifying the earlier evidence, at:

- `/tmp/opencode/polish-recovery-fix/live/original-review-nous-before-down.png`
- `/tmp/opencode/polish-recovery-fix/live/original-review-nous-after-down-idle-2s.png`
- `/tmp/opencode/polish-recovery-fix/live/original-review-nous-after-down-walk-idle.png`

## Regression method

Run `node tests/check-polish-recovery.mjs`. Set `POLISH_RECOVERY_REPORT=/absolute/path.json` to retain numerical samples.

The test invokes actual `damagePlayer(..., 12, { knockdown: true, ... })`, `combatStep`, the production `playerPose` selector, `createAnim`, `createFootLocks`, and `solve`. It covers all three heroes, both facings, 30/60/144 Hz, and three stationary idle seconds, both with every-frame rendering and with the game's invulnerability-blink omission of the animation/render path. The test also checks ordinary anchors, first-zero-dt active presentation, repeated hit-stop freezes, support residuals, and frame-to-frame root/ankle continuity.

The standing reference is a **persistent production idle control**, initially planted at authored rest and subsequently animated at the same breathing phase. Its ankles remain at the settled static idle anchors. Recreating the reference locks every frame would make its feet follow breathing rather than remain stationary: TurboFit's fresh-per-frame reference alone traverses more than 2 screen pixels. That is not a valid reference for judging fixed support drift.

Actual-game verification uses normal hero selection in `http://127.0.0.1:48791/index.html`, removes enemies in memory, and calls production `damagePlayer`. An observational `rig.draw` wrapper passes the original arguments and return value unchanged, retaining drawings for offline numerical inspection; it does not replace poses or rendering. Captures and scripts remain under `/tmp/opencode/polish-recovery-fix/live/`.

## Correction

Recovery contacts are marked only for Nous, Teknium, and TurboFit. On idle entry, the front foot and then the back foot make separate **0.3-second lifted replants** to the authored rest stance. The other support remains world-locked. Normal stance anchors are not reset.

The stricter test also exposed an existing wake-exit ankle snap: unreachable-target deletion could move Teknium/TurboFit's rendered foot immediately to an unanchored position, while Nous could switch to a toe-off fallback despite retaining its target. Recovery now selects a nearby reachable pelvis height without that toe-off fallback, while preserving root settling. The resulting foot steps scale with frame time instead of retaining a 24–67 px discontinuity as frame rate increases. Repeated zero-dt drawings freeze, including Nous; a newly active contact still commits on its first zero-dt frame.

Final source SHA-256: `8a95abf3bb9134a64d61153cc5d18e302e338ec8451625fb356c4d75a806da00`.

### Full-path numerical results

Screen/canvas pixels at the production rig scale of 0.7, over all 36 cases:

| Metric | Worst result |
|---|---:|
| Settled hips vs standing control | **0.158106 px** (blink-skipped path) |
| Settled ankles vs static rest anchors | **4.03e−14 px** |
| Contact residual during idle recovery | **0.175000 px** |
| Planted target drift | **2.43e−15 px** |
| Settled anchor drift | **0 px** |
| Repeated frozen recovery draws checked | **1,728** |

Without invulnerability blinking, settled hip differences are also machine precision. All six first-zero-dt kick-contact cases and repeated frozen full-rig transforms pass.

Maximum rendered ankle motion per presented frame (both facings and blink modes):

| Hero | 30 Hz | 60 Hz | 144 Hz |
|---|---:|---:|---:|
| Nous | 9.8811 px | 4.9111 px | 2.0505 px |
| Teknium | 9.2473 px | 4.5953 px | 1.9184 px |
| TurboFit | 11.5783 px | 5.7511 px | 2.4017 px |

The stored track anchor changes when a lifted foot lands; that is not planted-foot drift. The test measures the actual rendered ankle each frame and separately verifies unchanged world targets while planted.

## Final checks and visual disposition

- `node tests/check-polish-recovery.mjs`: **36/36 pass**.
- `npm test`: **pass**, including exact protected source/pose checks and full locomotion/recovery transforms for the original four turtles and Don at 30/60/144 Hz, both facings.
- `git diff --check`: **pass** for the assigned files.
- Original-module replay against the same final 36-case test: **fails as expected**, retained in `recovery-before-final.json` and `recovery-before-final.log` under the temporary evidence directory. In addition to Nous's persistent kneel, the blink-skipped TurboFit path shows up to 21.29 px of stale ankle displacement before this correction.

Final numerical output is `/tmp/opencode/polish-recovery-fix/recovery-final.json`. The new regression was run separately because `package.json` is outside this workstream's edit ownership; the integrating session can add it to `npm test`.

**Final live recheck passes the persistent-recovery blocker.** The six-case actual-game capture records the same final SHA above at its start and end (`sourceStable: true`). Nous, Teknium, and TurboFit in both facings all reach standing `idleA` and remain stationary through the final captures, taken **3.133–3.142 simulation seconds after `playerDown` first reached zero**. HP changes 100→88; player X remains 80; movement stays false. There are zero browser, failed-request, or guarded-renderer errors.

At three seconds, both ankles match canonical standing idle to the recorded 0.001 canvas-pixel precision. Maximum root difference is **0.035 px**, maximum hip difference **0.135 px**, and settled contact residual is effectively zero. The actual intermediate frames show a moving sole lifted by **7 canvas px**, with opposite-support X variation at most **0.157 px**. Largest observed per-frame ankle-X change is **5.75 px** and root-Y change **5.29 px** in this live run; the controlled frame-rate matrix above provides the separate 30/60/144 Hz continuity check.

The independent verifier inspected short-interval production-canvas frames for Nous in both facings and Teknium/TurboFit facing right. The recovery remains a brisk, low lunge with sequential corrective footsteps, not a newly authored naturalistic get-up. **No obvious one-frame root pop, planted-foot slide, or return to the persistent kneeling idle was observed on the final revision.** This fixes the blocker; it does not withdraw unrelated style limitations in `FINAL-REVIEW.md`.

Actual final evidence under `/tmp/opencode/polish-recovery-fix/live/`:

- `after-results.json`: per-draw geometry, state timestamps, errors, equal start/end source hashes.
- `after-nous_girl-right-idle-3s.png` and `after-nous_girl-left-idle-3s.png`: standing recovery, no movement workaround.
- `after-{teknium,turbofit}-{right,left}-idle-3s.png`: the other four stationary cases.
- `after-nous_girl-{right,left}-transition-*.png`, `after-teknium-right-transition-*.png`, `after-turbofit-right-transition-*.png`: intermediate actual canvas frames.
- `verify.mjs`: reusable real-game capture; `candidate-10d44688/` retains the superseded prior-revision captures separately.

Both delegated workers completed: correction/reasoning (`ses_ebe6371e4ffecrcO9hcYShsIB8`) and independent live verification (`ses_ebe634d2effeNBzgPTv334I9RN`). Neither spawned further descendants. All assigned work is complete; the main session still owns integration into the aggregate test command and its final full-suite/capture rerun.
