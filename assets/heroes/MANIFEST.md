# AGENT ARMEGEDDON: CLAWPOCALYPSE NOW hero cutout rigs (character select)

Same conventions as `../rig/RIG.md` (torso 68px tall, iteration 7 2x re-slice, part-local px, clockwise degrees, `_b` back limbs darkened, same draw order and pose table). Heroes face **right** natively, like the existing turtle. Files `<id>/<id>_{head,torso,uarm,farm,thigh,shin,weapon}.png`, source `<id>/sheet.jpg`, overview `contact_sheet.png`. Shins include feet. Pivots are computed from each image (head = neck bottom, limbs = top centre, weapon = grip near the bottom); tweak by eye.

Roster: turtle_blue, turtle_red, turtle_orange, turtle_purple (bo staff, long-reach sweeps and a pole-vault kick; iteration 8 parts from its own sheet), nous_girl, teknium, turbofit (7 playable heroes).

## turtle_purple (bo staff)

Palette: purple mask and wraps, green skin, brown shell, wooden bo.  Move set: Long reach: staff sweeps, 360 staff spin special, pole-vault kick. Iteration 8: sliced from `turtle_purple/sheet.jpg` at torso 68px, replacing the legacy upscaled `../rig/turtle_*` parts. The sheet's thigh had a foot drawn on it: cropped at the knee (below the knee pad). The bo was rotated level (it is drawn diagonally on the sheet) and is held in the back hand.

| part | image | size | pivot | parent | attach |
|---|---|---|---|---|---|
| head | turtle_purple_head.png | 65x49 | 32,43 | torso | 24,7 |
| torso | turtle_purple_torso.png | 48x68 | 24,34 | - | - |
| uarm | turtle_purple_uarm.png | 28x66 | 16,8 | torso | 28,16 |
| farm | turtle_purple_farm.png | 34x68 | 16,8 | uarm | 20,59 |
| thigh | turtle_purple_thigh.png | 33x44 | 12,11 | torso | 24,60 |
| shin | turtle_purple_shin.png | 35x73 | 11,9 | thigh | 20,35 |
| weapon | turtle_purple_weapon.png | 80x13 | 40,6 | farm_b | 22,58 |

## turtle_blue (katana)

Palette: blue mask, green skin, brown shell.  Move set: Balanced: fast katana slashes (3-hit chain), spin attack special (root rotates 360, hits all around).

| part | image | size | pivot | parent | attach |
|---|---|---|---|---|---|
| head | turtle_blue_head.png | 68x50 | 35,44 | torso | 24,6 |
| torso | turtle_blue_torso.png | 48x68 | 24,34 | - | - |
| uarm | turtle_blue_uarm.png | 35x51 | 11,6 | torso | 28,16 |
| farm | turtle_blue_farm.png | 42x64 | 14,7 | uarm | 25,44 |
| thigh | turtle_blue_thigh.png | 32x46 | 12,8 | torso | 24,60 |
| shin | turtle_blue_shin.png | 38x58 | 15,9 | thigh | 21,38 |
| weapon | turtle_blue_weapon.png | 19x102 | 9,82 | farm | 30,56 |

Weapon grip: 120 (degrees the weapon art turns in the fist; rig QA t_0309973138084dd1)

## turtle_red (sai)

Palette: red mask and wraps.  Move set: Aggressive: short-range sai flurry (rapid alternating stabs), rising uppercut launcher. Forearm image already holds a sai; the separate sai is for the other hand or throws.

| part | image | size | pivot | parent | attach |
|---|---|---|---|---|---|
| head | turtle_red_head.png | 65x49 | 33,43 | torso | 24,6 |
| torso | turtle_red_torso.png | 51x68 | 24,34 | - | - |
| uarm | turtle_red_uarm.png | 31x60 | 11,7 | torso | 31,16 |
| farm | turtle_red_farm.png | 40x65 | 20,7 | uarm | 21,53 |
| thigh | turtle_red_thigh.png | 34x53 | 12,8 | torso | 24,60 |
| shin | turtle_red_shin.png | 38x68 | 13,8 | thigh | 22,44 |
| weapon | turtle_red_weapon.png | 29x74 | 10,55 | farm | 17,60 |

## turtle_orange (nunchaku)

Palette: orange mask, brown pads.  Move set: Acrobatic: nunchaku spins (multi-hit), slide kick (low dash under attacks). Forearm holds one stick; the weapon image is the full nunchaku for spin frames.

| part | image | size | pivot | parent | attach |
|---|---|---|---|---|---|
| head | turtle_orange_head.png | 69x45 | 33,39 | torso | 26,8 |
| torso | turtle_orange_torso.png | 55x68 | 26,34 | - | - |
| uarm | turtle_orange_uarm.png | 28x62 | 14,8 | torso | 33,16 |
| farm | turtle_orange_farm.png | 54x73 | 14,8 | uarm | 16,54 |
| thigh | turtle_orange_thigh.png | 38x52 | 15,10 | torso | 29,60 |
| shin | turtle_orange_shin.png | 44x66 | 16,8 | thigh | 25,43 |
| weapon | turtle_orange_weapon.png | 44x73 | 14,59 | farm | 29,67 |

Weapon grip: 130 (degrees the weapon art turns in the fist; rig QA t_0309973138084dd1)


## teknium (teal energy blade)

Palette/look (v2, `src/design.jpg`, after Teknium's own avatar): white wedge visor with red stripes, spiky sage-teal hair with a green leaf cluster at the back, green high-collar zip jacket (short body; sleeves are the arm parts), charcoal trousers, black fingerless gloves, white/green sneakers, cyan energy blade.  Move set: Technical, combo-heavy: energy-blade slash chains (4-5 hits, cancelable), dash-through (passes through enemies, hits all in path), data burst projectile special.

Rig: v2 (sliced by `tools/slice-hero-parts.py teknium` from `src/sheetA.jpg` + `src/sheetB.jpg`, spec `src/SLICE.json`; `src/sheetA-rejected-blue-visor.jpg` is unused). Separate feet (ankle on the shin, sole flat on the floor), gloved hands with a grip pair around the blade (grip_back behind it, grip_front over it), 3/4 head and torso with front variants for turn/taunt/victory, two short jacket-hem tails on springs.
Layers: hem_b, uarm_b, farm_b, hand_b, thigh_b, shin_b, foot_b, head, thigh, shin, foot, hem, torso, uarm, farm, hand, weapon, hand_front
Wrist: c=20 hw=35

<!-- slice:teknium:begin -->
| part | image | size | pivot | parent | attach | role | data |
|---|---|---|---|---|---|---|---|
| hem_b | teknium_hem_tail_far.png | 10x25 | 4,1 | torso | 12,56 | spring | spring=150,13,0.12 range=-15,55 |
| uarm_b | teknium_uarm.png | 10x40 | 5,3 | torso | 32,11 | body | joint=5,36 |
| farm_b | teknium_farm.png | 10x38 | 5,3 | uarm_b | 5,36 | body | joint=4,34 |
| hand_b | teknium_hand_fist.png | 12x18 | 5,1 | farm_b | 4,34 | hand |  |
| hand_b@open | teknium_hand_open.png | 14x22 | 5,1 | - | - | variant |  |
| thigh_b | teknium_thigh.png | 13x46 | 6,4 | torso | 25,53 | body | joint=5,42 |
| shin_b | teknium_shin.png | 12x41 | 6,3 | thigh_b | 5,42 | body | joint=5,37 |
| foot_b | teknium_foot.png | 30x17 | 10,2 | shin_b | 5,37 | foot | sole=1,16,28,16 |
| head | teknium_head.png | 45x45 | 21,41 | torso | 23,7 | body |  |
| head@front | teknium_head_front.png | 42x45 | 21,41 | - | - | variant |  |
| thigh | teknium_thigh.png | 13x46 | 6,4 | torso | 16,53 | body | joint=5,42 |
| shin | teknium_shin.png | 12x41 | 6,3 | thigh | 5,42 | body | joint=5,37 |
| foot | teknium_foot.png | 30x17 | 10,2 | shin | 5,37 | foot | sole=1,16,28,16 |
| hem | teknium_hem_tail.png | 10x25 | 4,1 | torso | 7,56 | spring | spring=150,13,0.12 range=-15,55 |
| torso | teknium_torso.png | 41x62 | 20,31 | - | - | torso |  |
| torso@front | teknium_torso_front.png | 43x62 | 22,31 | - | - | variant |  |
| uarm | teknium_uarm.png | 10x40 | 5,3 | torso | 8,14 | body | joint=5,36 |
| farm | teknium_farm.png | 10x38 | 5,3 | uarm | 5,36 | body | joint=4,34 |
| hand | teknium_hand_grip_back.png | 12x16 | 5,1 | farm | 4,34 | hand | grip=5,11 axis=-0.1 |
| weapon | teknium_weapon.png | 94x8 | 9,4 | hand | 5,11 | weapon | tip=92,3 |
| hand_front | teknium_hand_grip_front.png | 12x16 | 5,1 | hand | 5,1 | grip_front | grip=5,11 axis=-0.1 |
<!-- slice:teknium:end -->

Weapon grip: 35 (degrees the weapon art turns in the fist; rig QA t_0309973138084dd1)

## turbofit (black electric guitar axe)

Palette/look: long wild brown hair (the head part), black tattered sleeveless top, tattooed arms, studded wristbands, black pants and boots.  Move set: Heavy and slow: wide guitar-axe swings (long wind-up, big knockback), power chord shockwave special (ground wave both directions), headbang charge (head-first rush).

| part | image | size | pivot | parent | attach |
|---|---|---|---|---|---|
| head | turbofit_head.png | 61x64 | 37,54 | torso | 23,6 |
| torso | turbofit_torso.png | 46x68 | 23,34 | - | - |
| uarm | turbofit_uarm.png | 26x54 | 13,7 | torso | 34,16 |
| farm | turbofit_farm.png | 28x58 | 13,6 | uarm | 13,46 |
| thigh | turbofit_thigh.png | 30x56 | 15,8 | torso | 23,58 |
| shin | turbofit_shin.png | 34x58 | 13,8 | thigh | 14,48 |
| weapon | turbofit_weapon.png | 65x118 | 47,38 | farm | 16,52 |

Weapon grip: -60 (degrees the weapon art turns in the fist; rig QA t_0309973138084dd1)

## nous_girl (coiled audio-cable whip, Nous Research mascot)

Palette/look: white hairband, blue blunt-bang bob, white sailor top with black collar and tie, black pleated skirt, blue-striped wristbands, black thigh-high socks with white stripe, black loafers. No headphones.  Move set: agile; sound-wave blasts (ranged special, projectile/FX `nous_girl_fx_burst.png`), cable-whip combos at mid range, bass-drop ground pound, quick dodge roll. The torso includes the skirt: attach thighs at about 72% of torso height, skirt drawn over them. Thighs include the sock tops; shins include the shoes. Previous parts are archived in ../_archive/nous_girl_v1/.

| part | image | size | pivot | parent | attach |
|---|---|---|---|---|---|
| head | nous_girl_head.png | 47x47 | 22,42 | torso | 18,6 |
| torso | nous_girl_torso.png | 37x68 | 18,34 | - | - |
| uarm | nous_girl_uarm.png | 15x59 | 6,6 | torso | 21,10 |
| farm | nous_girl_farm.png | 25x67 | 6,5 | uarm | 10,54 |
| thigh | nous_girl_thigh.png | 19x65 | 9,7 | torso | 19,48 |
| shin | nous_girl_shin.png | 22x60 | 8,5 | thigh | 8,60 |
| weapon | nous_girl_weapon.png | 30x52 | 8,43 | farm | 19,61 |

Weapon grip: 115 (degrees the weapon art turns in the fist; rig QA t_0309973138084dd1)

_hermes_girl was replaced by nous_girl; its art is archived in ../_archive/hermes_girl/._

## don_piedro (big spoon, Don Piedro Savastano)

Palette/look (v2, Kyle's redo): grumpy painted brown bear in alien battle armour: scowl, scar and a red scouter, white chest plate with the ribbed yellow shoulder pads and belly panel, blue bodysuit, white gloves and boots with yellow toe caps. Head is front-facing. Built by `pizza-panic-dev/tools/slice_don_v2.py` from `/workspace/pizza-story/don/gen/don_parts_v2.jpg` (magenta key sampled from the border, despilled, the baked label numbers dropped, 1 px ink outline, saturation trimmed to the turtle parts). One scale for the whole body so he stands as tall as turtle_red / TurboFit (~190 px); the pads' overhang is squeezed so they only widen the silhouette a bit. uarm = the sleeve above the cuff; farm = sleeve + cuff + fist. The spoon is stood upright (bowl up, handle down, like the katana art), so it shares turtle_blue's grip and keyframes; the pivot is at the handle end. Move set: Spoon bonk chains (3 hits), Soup Tornado special (root spins 360, hits all around), rising Spoon Uppercut on kick (Hermes' #1 fanboy).

| part | image | size | pivot | parent | attach |
|---|---|---|---|---|---|
| head | don_piedro_head.png | 54x59 | 26,53 | torso | 39,6 |
| torso | don_piedro_torso.png | 79x68 | 39,34 | - | - |
| uarm | don_piedro_uarm.png | 23x46 | 11,5 | torso | 47,15 |
| farm | don_piedro_farm.png | 26x75 | 13,6 | uarm | 12,40 |
| thigh | don_piedro_thigh.png | 30x55 | 14,8 | torso | 41,60 |
| shin | don_piedro_shin.png | 43x49 | 14,5 | thigh | 16,47 |
| weapon | don_piedro_weapon.png | 27x112 | 13,98 | farm | 13,63 |

Weapon grip: 120 (same as turtle_blue: upright weapon art held at the bottom of the handle)
