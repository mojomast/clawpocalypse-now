# AGENT ARMEGEDDON: CLAWPOCALYPSE NOW

A beat-'em-up in plain HTML5 canvas + JavaScript (formerly *Pizza Panic*). No build step, no server code.

**Play:** https://mojomast.github.io/clawpocalypse-now/

## Controls (keyboard)

| Action | Keys |
|---|---|
| Move | A / D or Arrows (press twice to dash) |
| Walk lanes | W / S |
| Jump | L |
| Punch | J (4-hit chain; number to finisher) |
| Kick | K (launcher, air juggle) |
| Back attack | J + K while facing an enemy |
| Special | J + L (costs a little HP) |
| Grab | Walk into a stunned foe; J / K / throw |
| Shoot pizza | Space (aimed by facing; shorter throw while running) |
| Pause | P or Esc |

Gamepad and touch controls are also supported.

## Audio credits

All sound effects and music are CC0. Full source list and authors: [CREDITS-AUDIO.md](CREDITS-AUDIO.md).
Audio ships as concatenated Ogg Vorbis packs (`assets/audio/*-pack.ogg.txt`, byte offsets in `audio-pack.js`);
the `.txt` extension is a hosting workaround, the bytes are plain Ogg.

## Hosting notes / shims

None. The game uses only relative paths and has no server API calls or host-specific globals, so it runs
unmodified on GitHub Pages. (`.nojekyll` is present so Pages serves every file as-is.)

## Deploying

`./deploy.sh` copies the game from its working folder, commits with a timestamp, and pushes to `main`.
