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

## Not done / known gaps
- **Six backdrops were never on disk**: `bg_meeting`, `bg_briefing`, `bg_teamup`, `bg_boss_enter`,
  `bg_boss_defeat`, `bg_ending` (the source dir `/home/box/agent-data/agents/18e257ae-.../assets/`
  stayed empty through ~15 min of retries). Those panels still use the OLD art, which has the
  characters painted in, so the portraits double up there for now. Only `bg_donnie_lair` shipped.
  To finish: compress each JPG to `assets/cine/v3/<name>.jpg` (1280 wide, q82) and add its key
  (`intro1`, `intro2`, `intro3`, `bossEnter`, `bossDefeat`, `ending`) to `V3_READY` in cinematics.js.
- Hero names come from heroes.js ("PURPLE TURTLE"), so `{HERO}` lines read e.g. "PURPLE TURTLE
  leads the charge..."; over-wide lines now shrink to fit.

## Code
- `cine-v3.js` (new): portrait table, `SPEAKER:` parsing, left/right slots with slide/fade-in and
  dimming, bust-bottom fade, TURTLES group row, and the Discord UI drawn in CRT image coordinates.
- `cinematics.js`: v3 backdrop table + `V3_READY`, per-line speaker pans replaced by a slow Ken Burns
  drift (respects reduced motion), portraits drawn above the caption, coloured name plates,
  4-line caption window, Discord locked to the CRT through the same cover-fit/Ken Burns transform.
