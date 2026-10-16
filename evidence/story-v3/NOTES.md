# Story v3: speaker portraits, live Discord CRT, character-free backdrops

Captured headless (Chrome + playwright-core, run from outside the repo) against
`python3 -m http.server`, localStorage cleared, flow: first key -> Esc (skip attract) -> Enter ->
hero select -> Enter. Canvas-only screenshots (740x510 canvas, CSS-scaled to 900 px wide).
Boss/ending panels were played via the existing `window.__ppCinema.play(id)` hook (no new cheats).

Result: console errors **0**, HTTP 404s **0** (index.html gets a `data:` favicon so even
`/favicon.ico` no longer 404s), Escape skip still ends a panel (`SKIP_OK true`).

| file | what it shows |
| --- | --- |
| select.png | hero select before the intro |
| intro_0_a_typing.png | ORIGIN, line 1: lair backdrop, live Discord on the CRT with "teknium is typing...", Donatello portrait (right, clear of the CRT) |
| intro_0_b_teknium_post.png | line 2: teknium's help request lands (highlighted) |
| intro_0_c_leonardo.png | line 3: Leonardo replaces Donatello on the right; claw_watch typing |
| intro_0_d_reply.png | line 7: donnie_tech replies on Discord; 7-line panel now scrolls (max 4 lines) instead of running off the canvas |
| intro_1_nous_girl.png / intro_1_donatello.png | conversation flips sides; the previous speaker stays, dimmed |
| intro_2_turbofit.png | TurboFit right, Nous Girl dimmed left |
| intro_don_teknium.png | don.js still draws Don's cutout; Teknium portrait on the left |
| intro_3_turtles.png | TURTLES group line: all four turtles small, centred |
| intro_3_hero.png / intro_3_hero_teknium.png | `{HERO}` line maps to the chosen hero (purple turtle / Teknium run) |
| bossEnter.png | Shredclaw portrait right |
| bossDefeat.png / bossDefeat_teknium.png | `{HERO}` portrait left |
| ending.png | narration only: no portraits |

## Backdrops
All seven v3 backdrops are now live (`V3_READY` lists every panel). The six late ones came as 1024x576
originals (`/workspace/uploads/story-bg/`) and were upscaled to 1280x720 (Lanczos, JPEG q82, ~160-210 KB).
None of them has a character painted in, so the portraits no longer double up.

Where portraits go:
- ORIGIN (lair): everyone stands on the right, so the CRT on the left stays visible.
- MEETING (rainy street): conversation flips left/right around the steaming manhole in the centre.
- BRIEFING (war room): everyone stands on the left, and the camera drifts toward the tower hologram on the right.
- TEAM UP (rooftop): Teknium on the left, the hero on the right. On the TURTLES line, the four
  stand in a row and the other portraits step back (fade).
- BOSS ENTER: Shredclaw on the right, beside the throne.
- BOSS DEFEAT / ENDING: narration panels keep the chosen hero on stage (`heroPortrait`), on the left,
  clear of the friendly robot lobster on the right of the ending.

## Known gaps
- Hero names come from heroes.js ("PURPLE TURTLE"), so `{HERO}` lines read e.g. "PURPLE TURTLE
  leads the charge..."; over-wide lines now shrink to fit.
- The backdrops are upscaled from 1024 wide, so they are a little soft at full size.

## Code
- `cine-v3.js` (new): portrait table, `SPEAKER:` parsing, left/right slots with slide/fade-in and
  dimming, bust-bottom fade, TURTLES group row, and the Discord UI drawn in CRT image coordinates.
- `cinematics.js`: v3 backdrop table + `V3_READY`, per-line speaker pans replaced by a slow Ken Burns
  drift (respects reduced motion), portraits drawn above the caption, coloured name plates,
  4-line caption window, Discord locked to the CRT through the same cover-fit/Ken Burns transform.
