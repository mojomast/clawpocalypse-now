# Teknium: appearance research

Accessed 2026-10-15 (America/Toronto). Research only. No game code or assets were changed.

**Verdict: CONFIRMED.** His creator-controlled persona art (X avatar) is clear and authoritative.

## Sources

| # | Source | What it is | Status |
|---|---|---|---|
| 1 | https://x.com/Teknium, profile image `pbs.twimg.com/profile_images/1642401912648777728/2KFikPsE_400x400.jpg`. Local copy: `refs/teknium-x-avatar.jpg` | Creator-controlled anime-style avatar. The account is "Teknium 🪽", bio "Cofounder and Lead Engineer - Hermes Agent @NousResearch, prev @StabilityAI", id 1365020011123773442 | **Authoritative.** This is the design reference |
| 2 | Same account, banner `pbs.twimg.com/profile_banners/1365020011123773442/1679544051/1500x500`. Local copy: `refs/teknium-x-banner.jpg` | Ornate pink, teal and plum illustration with a compass/clock motif. No character in it | Authoritative for mood and palette only |
| 3 | https://x.com/vSouthvPawv banner. Local copy: `refs/sovthpaw-x-banner.jpg` | Community art by sovthpaw (Nous Research community) with a small figure wearing green leaf hair and a red/white visor, i.e. a Teknium-style figure | **Uncertain.** Fan corroboration that the visor and leaves are how the community reads him. Not a design source |
| 4 | https://x.com/123mikeyd/status/2105920162021192013 | A community Hermes-built fighting game with "Teknium Shooting lasers" | Context only. Not a design source |

Handle note: the brief says @Teknium1, but the X API returns "user not found" for that handle. His live posts come from **@Teknium** (same bio and role). Treat @Teknium as the current handle.

Photos were deliberately not used. No real-person photo was searched for or used.

## Recognisable appearance (from source 1)

- **Silhouette:** slim anime young man, shown head and shoulders in 3/4 profile facing left. A big, ragged hair mass reads wider at the top-right where it turns into leaves. A tall jacket collar frames the jaw.
- **Face and head:** soft, narrow anime face with a pointed chin, small nose and closed neutral mouth. Pale warm skin. A visible ear sits under the hair. **The eyes are never shown** because the visor covers them.
- **Hair:** messy, spiky short-to-medium layers in pale **sage-teal / blue-grey**. On the back and right side the hair dissolves into a cluster of **bright green leaves**, with loose leaves drifting off it. This leafy hair is the second key identifier.
- **Visor (main identifier):** an oversized, angular **white wedge or blade-shaped visor** across both eyes, with **two thick diagonal red stripes**. It is not round goggles.
- **Clothing:** dark **forest-green zip jacket** with a tall, turned-up funnel collar and a visible zipper pull.
- **Motif:** white background with green leaves blowing across it. The display name carries a wing (🪽), which echoes Hermes.

### Palette (sampled from source 1)

| Role | Hex |
|---|---|
| Hair, sage-teal | `#72AD97` |
| Hair, light | `#85C1A3` |
| Hair, shadow | `#3A685E` |
| Leaf green | `#196B1F` |
| Leaf, dark | `#0F6014` |
| Visor red stripes | `#C24E4E` |
| Visor white | `#FDFDFD` |
| Skin | `#E9D1C5` |
| Jacket green | `#3C6847` |
| Jacket shadow | `#1F372A` |
| Banner mood (optional FX) | `#A66766` `#DE9C89` `#391D30` `#3E3446` |

## Real appearance vs game costume and equipment

| Element | Source |
|---|---|
| Sage-teal spiky hair with green leaves | **Persona (real)** |
| White wedge visor with red stripes | **Persona (real)** |
| Green high-collar zip jacket | **Persona (real)** |
| Pale skin, slim anime face, eyes hidden | **Persona (real)** |
| Cyan energy blade (`teknium_weapon.png`) | **Game equipment** |
| Trousers, gloves, red/white cuffs, green/white sneakers, long coat tails | **Game costume.** None of these appear in the sources |
| Dash move, lasers | Game moveset |

## Current game art vs sources

Compared against `assets/heroes/teknium/*`, `assets/heroes/portraits/teknium.png`, `after/teknium.png` and `after/gameplay/teknium.png`.

**Right:**
- Spiky hair in green tones, a slim build and a youthful anime-style face.
- Red eyewear and green outerwear with a high collar in the portrait.
- The cyan blade works as game equipment.

**Wrong:**
1. **Visor.** The game uses orange/red tinted goggles with a red lens. The source is a white angular wedge with two diagonal red stripes. This is the biggest recognisability miss.
2. **Hair colour and structure.** The game uses one saturated emerald (`#187848`/`#006030` range). The source is pale sage-teal hair with a separate cluster of bright green leaves and no leaf shapes elsewhere. The game has no leaves at all.
3. **Eyes and brow.** The game goggles are a tinted-lens shape with the brow showing above them. The source visor is opaque, sits higher and wider, and covers the whole eye and brow band.
4. **Jacket.** The game has a long open trench coat with red/white striped lining. The source has a fitted, zipped jacket with a tall funnel collar. The striped lining is invented, though it does nod to the visor stripes.
5. **Skin.** The game uses a tanned orange skin (`#F0A860`). The source skin is pale `#E9D1C5`.

## Source-use restrictions

- The avatar and banner belong to the account holder. No licence is published, and the artist is not credited on the profile. Treat them as **reference only**. Do not trace, embed or ship them.
- Draw an original pixel-art rendition that keeps the identifying traits (visor, leaves, collar) without copying the illustration.
- Do not use any photo of Teknium. Since he is a real, named person, Kyle may want Teknium's OK to appear as a playable hero in a public game.
- `refs/teknium-board.png` embeds only the game's own art and sampled hex values. The third-party images are linked, not embedded. The downloaded copies in `refs/` are for local research. Avoid committing them to the public repo unless the rights are cleared.

## Visual identity spec for new assets

- Slim anime young man. Head about 1/6 of body height on the rig, with a narrow pointed chin.
- **White wedge visor** across both eyes with **two diagonal red stripes** (`#FDFDFD` / `#C24E4E`). The eyes are never visible. The visor must stay legible at 1x sprite scale, so use a 1px dark outline.
- **Hair:** spiky sage-teal (`#72AD97`, shadow `#3A685E`, light `#85C1A3`). On the back and crown, a cluster of 4–7 pixel-art leaves in `#196B1F`/`#0F6014`. Optionally shed 1–2 leaf particles on dash or idle.
- **Forest-green zip jacket** (`#3C6847` / `#1F372A`) with a tall funnel collar up to the jaw and a visible zipper line. Keep it waist length, not a trench.
- Pale skin `#E9D1C5`.
- Costume (free to design): dark trousers and footwear. Keep any accents within the green, white and red family.
- Equipment: the cyan energy blade stays as-is. Teal FX could shift towards leaf green to tie back to the hair.
- Optional flourish: a small white wing glyph on the jacket shoulder (from the 🪽 in his display name).
