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
| intro_3_turtles.png | TURTLES group line: the four turtle busts overlap in a row, outer pair behind, facing the middle |
| intro_3_hero.png / intro_3_hero_teknium.png / intro_3_hero_don_piedro.png | `{HERO}` line maps to the chosen hero (purple turtle / Teknium / Don Piedro runs) |
| bossEnter.png | Shredclaw portrait right |
| bossDefeat.png / bossDefeat_teknium.png | `{HERO}` portrait left |
| ending.png / ending_don_piedro.png | the chosen hero stays on stage, on the left, clear of the lobster |
| portraits_sheet.png | all 9 story cutouts on mid-grey |

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

## Turtle + Don Piedro manga busts
`assets/cine/v3/portraits/{donatello,leonardo,raphael,michelangelo,don_piedro}.png` were keyed from
`/workspace/uploads/story-portraits/portrait_*_src.jpg` (1280x720, hot-pink ground ~#F0047F-#FD02A1).
The Nous-gang method (a hard RGB threshold in pizza-story/story-v3/mock.py) would cut into bright purple,
so I used a magentaness key instead:
- `m = min(R, 1.6B) - G`, with the ground colour sampled per image from the border.
- Fully opaque below 0.50*m_bg, fully clear above 0.78*m_bg, a 0.6 px edge soften, and only the
  largest blob kept (small pinholes filled).
- Despill un-mixes the ground colour from edge pixels, then clamps any leftover pink.
- Checked at 1:1 on green: the purple, red and orange bandanas, the outlines, Mikey's tongue, the nunchaku chain and Don's lens are intact.
- Residue check: 0-1 opaque pink pixels per image.

Trimmed and scaled to 512 px tall. The title-screen cutouts in `assets/cine/title/` are unchanged
and still used by the title and select screens.
All nine story portraits are now busts with the bottom fade, and they are mirrored so they face into the frame.
don.js no longer draws its old portrait chip, so intro_don shows one Don: his cutout on the plate.

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
