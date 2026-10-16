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

## turbofit (black flying-V guitar axe)

Palette/look (v2, `src/design.jpg`, sovthpaw's TurboFit): copper wavy mane with the face visible (heads from `src/heads.jpg`; the sheetA heads have the wrong dark hair and are unused), studded black leather vest over a bare chest, silver chains, amber belt buckle, dark jeans, black boots with mint laces, black flying-V guitar-axe.  Move set: Heavy and slow: wide guitar-axe swings (long wind-up, big knockback), power chord shockwave special (ground wave both directions), headbang charge (head-first rush).

Rig: v2 (sliced by `tools/slice-hero-parts.py turbofit` from `src/sheetA.jpg`, `src/heads.jpg` + `src/sheetB.jpg`, spec `src/SLICE.json`). Separate boots (the shaft overlaps the jeans), hands with a grip pair on the guitar neck; the far hand closes on the neck's second grip (grip_far) whenever the far arm can reach it, otherwise it stays open. Two back hair locks and the crown piece on springs, colour-matched to the heads.jpg copper.
Layers: hair_back_1, hair_back_2, uarm_b, farm_b, hand_b, thigh_b, shin_b, foot_b, head, hair_front, thigh, shin, foot, torso, uarm, farm, hand, weapon, hand_front
Wrist: c=35 hw=35

<!-- slice:turbofit:begin -->
| part | image | size | pivot | parent | attach | role | data |
|---|---|---|---|---|---|---|---|
| hair_back_1 | turbofit_hair_back_1.png | 32x47 | 16,2 | head | 15,11 | spring | spring=90,9,0.16 range=-25,55 |
| hair_back_2 | turbofit_hair_back_2.png | 23x41 | 11,2 | head | 10,20 | spring | spring=120,10,0.14 range=-20,50 |
| uarm_b | turbofit_uarm.png | 16x47 | 8,3 | torso | 50,15 | body | joint=8,42 |
| farm_b | turbofit_farm.png | 14x43 | 7,3 | uarm_b | 8,42 | body | joint=7,39 |
| hand_b | turbofit_hand_open.png | 13x25 | 5,1 | farm_b | 7,39 | hand |  |
| hand_b@grip_far | turbofit_hand_grip_far.png | 15x24 | 4,1 | - | - | variant | grip=7,15 |
| thigh_b | turbofit_thigh.png | 18x52 | 8,3 | torso | 35,62 | body | joint=8,47 |
| shin_b | turbofit_shin.png | 17x48 | 8,3 | thigh_b | 8,47 | body | joint=8,43 |
| foot_b | turbofit_foot.png | 34x33 | 11,18 | shin_b | 8,43 | foot | sole=4,29,31,29 |
| head | turbofit_head.png | 37x49 | 18,46 | torso | 26,4 | body |  |
| head@front | turbofit_head_front.png | 32x49 | 15,46 | - | - | variant |  |
| hair_front | turbofit_hair_front.png | 29x31 | 14,1 | head | 16,1 | spring | spring=260,18,0.05 range=-8,12 |
| thigh | turbofit_thigh.png | 18x52 | 8,3 | torso | 21,62 | body | joint=8,47 |
| shin | turbofit_shin.png | 17x48 | 8,3 | thigh | 8,47 | body | joint=8,43 |
| foot | turbofit_foot.png | 34x33 | 11,18 | shin | 8,43 | foot | sole=4,29,31,29 |
| torso | turbofit_torso.png | 57x70 | 28,35 | - | - | torso |  |
| torso@front | turbofit_torso_front.png | 54x70 | 27,35 | - | - | variant |  |
| uarm | turbofit_uarm.png | 16x47 | 8,3 | torso | 6,17 | body | joint=8,42 |
| farm | turbofit_farm.png | 14x43 | 7,3 | uarm | 8,42 | body | joint=7,39 |
| hand | turbofit_hand_grip_back.png | 12x19 | 5,1 | farm | 7,39 | hand | grip=5,14 axis=-0.1 |
| weapon | turbofit_weapon.png | 108x38 | 23,15 | hand | 5,14 | weapon | tip=105,15 grip2=45,15 |
| hand_front | turbofit_hand_grip_front.png | 12x19 | 5,1 | hand | 5,1 | grip_front | grip=5,14 axis=-0.1 |
<!-- slice:turbofit:end -->

Weapon grip: 53 (degrees the weapon art turns in the fist; rig QA t_0309973138084dd1)

## nous_girl (audio-cable whip with jack plugs, Nous Research mascot)

Palette/look (v2, `src/design.jpg`, Kyle's own reference `src/kyle-reference.png`): black-ink manga style; glossy black hair with heavy bangs and outward-flipped ends, white headphones; white turtleneck, blue jeans (no skirt), white sneakers with blue trim; an instrument cable with a jack plug at each end, a spare coil clipped at the hip.  Move set: agile; sound-wave blasts (ranged special, projectile/FX `nous_girl_fx_burst.png`), cable-whip combos at mid range, bass-drop ground pound, quick dodge roll.

Rig: v2 (sliced by `tools/slice-hero-parts.py nous_girl` from `src/sheetA.jpg` + `src/sheetB.jpg`, spec `src/SLICE.json`). Separate feet and hands (the sleeve cuff drawn on each hand overlaps the forearm cuff), a grip pair around the held jack plug, the cable as a 10-link rope from the plug with the second plug at its free end (it lashes out on whip hits), two hair locks and the hip coil on springs, 3/4 head and torso with front variants. The v1 parts are in git history (a53e191); the unused v1 `nous_girl_weapon.png` is kept for the old baseline sheets.
Layers: uarm_b, farm_b, hand_b, thigh_b, shin_b, foot_b, head, thigh, shin, foot, torso, coil, hair_long, hair_short, uarm, farm, hand, weapon, hand_front, cable, cable_end
Wrist: c=0 hw=40

<!-- slice:nous_girl:begin -->
| part | image | size | pivot | parent | attach | role | data |
|---|---|---|---|---|---|---|---|
| uarm_b | nous_girl_uarm.png | 12x45 | 6,4 | torso | 37,15 | body | joint=6,41 |
| farm_b | nous_girl_farm.png | 11x42 | 5,3 | uarm_b | 6,41 | body | joint=4,38 |
| hand_b | nous_girl_hand_fist.png | 9x20 | 4,5 | farm_b | 4,38 | hand |  |
| hand_b@open | nous_girl_hand_open.png | 10x24 | 5,6 | - | - | variant |  |
| thigh_b | nous_girl_thigh.png | 15x48 | 7,4 | torso | 28,57 | body | joint=7,44 |
| shin_b | nous_girl_shin.png | 14x45 | 7,3 | thigh_b | 7,44 | body | joint=6,42 |
| foot_b | nous_girl_foot.png | 29x17 | 9,2 | shin_b | 6,42 | foot | sole=3,16,27,16 |
| head | nous_girl_head.png | 42x49 | 22,45 | torso | 22,8 | body |  |
| head@front | nous_girl_head_front.png | 41x49 | 20,45 | - | - | variant |  |
| thigh | nous_girl_thigh.png | 15x48 | 7,4 | torso | 17,57 | body | joint=7,44 |
| shin | nous_girl_shin.png | 14x45 | 7,3 | thigh | 7,44 | body | joint=6,42 |
| foot | nous_girl_foot.png | 29x17 | 9,2 | shin | 6,42 | foot | sole=3,16,27,16 |
| torso | nous_girl_torso.png | 45x66 | 22,33 | - | - | torso |  |
| torso@front | nous_girl_torso_front.png | 46x66 | 23,33 | - | - | variant |  |
| coil | nous_girl_coil.png | 16x13 | 8,1 | torso | 12,44 | spring | spring=220,16,0.06 range=-20,20 |
| hair_long | nous_girl_hair_long.png | 18x31 | 7,1 | head | 8,39 | spring | spring=110,10,0.14 range=-25,60 |
| hair_short | nous_girl_hair_short.png | 10x25 | 3,1 | head | 18,42 | spring | spring=110,10,0.14 range=-20,45 |
| uarm | nous_girl_uarm.png | 12x45 | 6,4 | torso | 8,16 | body | joint=6,41 |
| farm | nous_girl_farm.png | 11x42 | 5,3 | uarm | 6,41 | body | joint=4,38 |
| hand | nous_girl_hand_grip_back.png | 9x20 | 4,5 | farm | 4,38 | hand | grip=4,16 axis=0.0 |
| weapon | nous_girl_plug.png | 18x3 | 11,1 | hand | 4,16 | weapon | tip=17,1 |
| hand_front | nous_girl_hand_grip_front.png | 9x20 | 4,5 | hand | 4,5 | grip_front | grip=4,16 axis=0.0 |
| cable | nous_girl_cable_seg.png | 38x4 | 0,2 | weapon | 17,1 | rope | segs=10 len=6 lash=118 |
| cable_end | nous_girl_plug.png | 18x3 | 11,1 | cable | - | rope_end | tip=17,1 |
<!-- slice:nous_girl:end -->

Weapon grip: 25 (degrees the weapon art turns in the fist; rig QA t_0309973138084dd1)

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
