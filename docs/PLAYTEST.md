# Gameplay improvement playtest plan

Use this alongside the automated regression suites. Passing geometry, browser,
or pixel tests does not establish that the game is fun or balanced.

## Repeatable comparison

Record the revision, browser/device, input device, hero, difficulty, player count,
accessibility settings, stage and test scenario. Compare one change at a time.
Use a fresh browser profile or document its saved checkpoint/settings. Do not
silently clear a player's real save to prepare a test.

Start with short sessions involving both new and experienced players, solo and
co-op, and players with relevant access needs. Invite a fresh round after each
meaningful change rather than waiting until all tuning is finished.

### First five minutes

- Can the player start, move, change lanes, attack, throw pizza, dash, and pause?
- Do control hints match their device and selected input preset?
- Can they find reduced flash/motion, subtitle size, and tutorial replay?
- Does the tutorial replay on the current run without losing progress?
- Ask them to explain an attack that missed and a hit they received. Record
  confusion about depth, reach, telegraphs, and recovery, not just deaths.

### Combat and pacing

- Compare the same opening arena with the same hero and input device.
- Record attack choices, whiffs, special use, damage taken, and retries.
- Ask whether each special's health cost felt worthwhile. Include movement,
  safety and crowd control when judging value—not damage alone.
- Note stretches with no meaningful decision: travel, waiting for an enemy,
  repetitive clean-up, and unusually long boss recovery or damage-sponge phases.
- Compare Easy/Normal/Hard using actual authored encounters. Do not equate
  longer fights with better challenge.
- Ask about clarity, frustration, satisfaction, and willingness to replay.
  Completion rate and damage-per-second are supporting data, not a fun score.

### Co-op

- Both players should identify their character, controls, threat direction,
  down/revive state, and remaining continue time.
- Check camera edges and shared-screen crowding with players far apart.
- Observe whether both players feel useful. Do not automatically reduce damage
  or add enemies merely because the party completes a fight faster.
- Include join, death, revive, continue, controller disconnect, and rejoin.

## Challenge-route prototype and effective hits

Compare Classic and Challenge with the same hero, difficulty, input device and
player count. The prototype should change only its two designated non-boss
encounters; verify every other fight, boss, breather and reward remains intact.

- Can a first-time player find the route selector and tell which route is active?
  If a selection is queued, can they tell when it takes effect?
- In each alternate fight, ask which enemy they targeted first and why. Look for
  a different decision, not simply a longer clear time.
- Check ranged cleanup, camera edges and flanking in solo and co-op. Do not
  describe an unchanged enemy/HP budget as proof of equivalent difficulty.
- Quit/reload and Continue at a stage boundary. The route must match the saved
  encounter plan; starting a fresh Classic run must not inherit Challenge actors.
- Attack an invulnerable boss: no damage should mean no successful-hit reward or
  misleading hit reaction. Distinguish rejection from a block/parry cue.
- Compare damage upgrades on eligible melee/projectile attacks by either player,
  including lethal hits and multi-target moves. Hazards must not silently inherit
  a player upgrade; each KO should generate its normal reward exactly once.
- Check that continuing remains available when the co-op down countdown reaches
  zero, and that the prompt describes this honestly rather than implying a cap.

No human fun/fairness result follows from passing the automated checks. Expand
the prototype only after short matched solo/co-op sessions support doing so.

## Teamwork and recovery checks

- Compare solo meter gains against the same pre-teamwork scenario. Joining a
  second player must not change ordinary damage, continue rules or route choice.
- In co-op, alternate genuine contacts on one enemy. Both players should
  understand the shared TEAM UP contribution and who helped; repeated same-player
  hits, automatic ally damage and immune contacts must not farm it.
- Try linking near a full meter, after a down/revive, after leaving/rejoining and
  at a stage boundary. Credit must respect its cap and reset rules. Check its cue
  alongside the route badge, maximum subtitle size and boss HUD.
- On a physical controller, hold a stick, attack button, L3 or R3 while switching
  away from the game. On return, nothing should reactivate until the controller
  has returned to neutral. Then a fresh input should work normally. Include P2,
  disconnect/reconnect and one controller remaining when another disconnects.
- Normal pause-menu navigation is a separate case: it must remain usable without
  unnecessary neutral-input barriers. Verify keyboard and touch input separately.
- Interrupt audio loading in a fresh isolated browser profile, restore networking,
  and confirm music can recover without changing the selected scene or reloading.
  Listen for duplicate loops, bursts of queued effects, incorrect theme changes,
  and lost mute/volume preferences. Automated audio mocks do not prove audibility.

## Accessibility and effects

- Check default settings, OS reduced-motion with no saved preference, and an
  explicit saved preference that differs from the OS preference.
- Adjust flash, shake and motion independently; verify the actual gameplay
  output, not only the displayed toggle. Check maximum text size with two players.
- Look for important cues covered by particles or other HUD/indicator elements.
- Verify threat information without relying on hue alone or sound alone.
- Record combined effects during multi-enemy deaths and simultaneous impacts.

Reducing overlay alpha or limiting each effect source separately is **not** a
photosensitivity-safety or WCAG conformance test. Evaluate the combined rendered
sequence, including luminance/red transitions, frequency, area, and the largest
intended display size with appropriate analysis. Title/cinematic content is a
separate review surface; gameplay settings coverage must not be represented as
whole-game safety certification.

## Browser lifecycle

On a real browser/device, background the tab during gameplay, during a manual
pause, and during a menu. Also test window focus loss and controller disconnect.

- Hidden gameplay must not advance or keep playing audible game audio.
- Returning must not replay accumulated simulation time or latched controls.
- A manually paused game must remain paused; music identity, volume and mute
  preferences must survive.
- Do not infer actual background behavior from dispatching a visibility event
  without changing document visibility.
- Stage checkpoints must retain stage-checkpoint semantics: do not snapshot
  mid-stage inventory as though it were the inventory at the start of a stage.

## Rendering experiments

Benchmark representative devices, including at least one lower-powered device,
using the same hero/palette, scene, enemy count, co-op mode and effects. Warm up
each configuration, repeat it, and report p50/p95/p99 frame times, long frames,
simulation backlog and memory—not only average FPS.

Headless/software-raster results are diagnostic, not hardware FPS promises.
Compare an optimization against an actual reference path, not merely a different
scene. A tint-cache experiment must bound memory and preserve the protected hero
renders. Pre-baking filters may change interpolation/color rounding; visual
equivalence must be measured rather than assumed.

Keep the existing 120 Hz simulation/interpolation unless measurements establish
a concrete problem. Do not add an engine rewrite, blanket actor rounding or
aggressive frame skipping as a substitute for profiling.

## Regression gate

Run with Node 22+ and the project's browser dependencies:

```sh
npm test
npm run test:pixels
# Start the local source server on port 48791 before browser/layout tests.
CHROMIUM_PATH=/path/to/chromium npm run test:browser
node tools/level-layout-smoke.mjs
node tools/gen-hero-rigs.mjs --check
npm run test:protected-pixels
git diff --check
```

Keep new captures outside historical evidence directories. Report defects,
uncertainties and unsuccessful experiments alongside improvements. No commit,
push, deployment, or balance-policy decision is implied by this checklist.
