# Nous Girl: appearance research

Accessed 2026-10-15 (America/Toronto). Research only. No game code or assets were changed.

**Verdict: CONFIRMED.** Nous Research publishes official mascot art, so her design is well established.

## Sources

| # | Source | What it is | Status |
|---|---|---|---|
| 1 | https://x.com/NousResearch, profile image `pbs.twimg.com/profile_images/1816254738234761216/TX7TW-Mp_400x400.jpg`. Local copy: `refs/nousresearch-x-avatar.jpg` | Official verified account (282k followers). Avatar is the Nous Girl in black-and-white manga style with a headphone band | **Authoritative** |
| 2 | https://nousresearch.com, asset `web-assets.nousresearch.com/portal/43f2…/assets/nous-web/nous-stamp-dark.svg`. Local copies: `refs/nousweb-nous-stamp-dark.svg`, rendered `refs/nousweb-nous-stamp.png` | Official site seal: the Nous Girl inside a ring reading "REBELLION TO TYRANTS IS OBEDIENCE TO GOD." | **Authoritative** |
| 3 | Nous Research Brand Booklet, First Edition (Feb 5 2024, "Produced by JOHN GALT… Nous Forward Operations Base"; "for uses internal and external: core team, developers, press & marketing"). Mirror: https://github.com/SouthpawIN/nous-style-guide/releases/latest/download/NOUS-BRAND-BOOKLET-firstedition_1.pdf. Local renders: `refs/nous-brand-booklet-p09-sketches.png`, `-p10-badge.png`, `-p11-blues.png` | p.9 "Sketching the Nous Girl" (badge pose plus three headphone sketches); p.10 "The Nous Research badge, featuring the Nous Girl"; p.11 "Color Guide: The Blues of Nous" | **Authoritative content, secondary hosting.** The PDF is an official Nous document, but I found it on a community member's (sovthpaw's) GitHub release, not on nousresearch.com. The pages match the official avatar and stamp exactly |
| 4 | nousresearch.com social card `…/assets/nous-web/social-card.png`; mission art `mission-duo-*.webp`, `mission-header.webp`, `footer-field.webp`. Local copies: `refs/nousweb-*` | The current site uses an electric-blue duotone (`#0000F2`). The social card and `mission-duo-3` show close-up anime eyes and bangs in the same style | Authoritative for the current colour treatment |
| 5 | https://github.com/SouthpawIN/nous-style-guide (SKILL.md, MIT, by sovthpaw); https://thedavidmurray.github.io/nous-inspired-design-system/; magnus919 "nous-branding" skill | Community style guides that summarise the booklet | **Uncertain / secondary.** Useful for cross-checking. The serif "N" on the collar comes only from source 5 and I could not see it in the official art |
| 6 | https://github.com/SouthpawIN/sovth-config `profiles/nous-girl/portrait.png`; repos `SouthpawIN/nous-girl`, `nous-girl-agent` | Community Hermes Agent profiles named "Nous Girl" | Fan work, not official. Not a design source |

Checked with no Nous Girl found: Hermes 3 and Hermes 4 Hugging Face model cards (cover art is a winged helmeted Hermes figure), hermes-agent.nousresearch.com (multi-armed Hermes engraving), psyche.network and forge.nousresearch.com (no static image assets returned).

## Recognisable appearance (official art)

- **Silhouette:** a rounded bob that flares out at the ends into flipped curls at shoulder height, cut by a thin white arc (the headphone band). Normally shown as a bust in 3/4 view, looking off to the side or slightly up.
- **Face and head:** soft oval face with a small pointed chin. Large retro-shoujo eyes with heavy black upper lashes and a big iris with a highlight. Small nose, full slightly parted lips. Neutral, attentive, slightly wistful expression.
- **Hair:** **solid black** (ink). **Blunt straight bangs** to the eyebrows, chin-to-shoulder length, with ends flipped outward and white gloss streaks cut into the black. Hair falls behind the shoulders in the badge pose.
- **Headphones:** a **white** band over the crown in every pose. Over-ear cups are visible in the p.9 sketches; in the badge and avatar they are mostly hidden by hair. Community guides note that black headphones are wrong.
- **Clothing:** a simple **collared shirt or blouse**, drawn with a striped collar or shirt in the p.9 sketches. The badge and stamp show a plain top with a strap or neckline. There is no sailor uniform in the official art.
- **Style:** 1970s–80s shoujo manga, pure black on white with no greys, screentone or hatching, and bold shapes.

### Palette

| Role | Hex | Source |
|---|---|---|
| Ink (hair, lines) | `#000000` | Booklet, avatar, stamp |
| Paper (skin, headphones, highlights) | `#FFFFFF` | Booklet, avatar, stamp |
| Current web electric blue (duotone wash) | `#0000F2`, mid `#3939F5`, tint `#BBBBF7` | nousresearch.com social card |
| "Blues of Nous" booklet swatches | `#00769A` `#006F9D` `#003D59` `#A4C4DD` `#B5E5FC` `#004D6C` `#8CB4CE` `#00658D` `#000F26` `#7AA8C9` `#1F82AC` `#C2D9EB` `#86D2F6` `#02172A` `#005076` `#73A8C8` `#003A54` `#D2DEEA` `#3C8FB9` `#003046` | Booklet p.11 (sampled from render, ±2) |

## Real appearance vs game costume and equipment

| Element | Source |
|---|---|
| Black blunt-bang bob, flipped ends | **Canonical** |
| White headphones (band plus over-ear cups) | **Canonical** |
| Shoujo face, large lashed eyes, parted lips | **Canonical** |
| Collared shirt | **Canonical**, though the exact garment varies |
| Monochrome look with an electric-blue accent | **Canonical brand treatment** |
| Audio-cable whip with a 1/4" jack (`nous_girl_weapon.png`), bass-drop burst FX | **Game equipment.** Fits the headphone and audio theme |
| Sailor-collar school uniform, black skirt, thigh-high socks, loafers, wristbands | **Game costume.** Not in any official art |

## Current game art vs sources

Compared against `assets/heroes/nous_girl/*`, `assets/heroes/portraits/nous_girl.png` and `after/nous_girl.png`.

**Right:**
- The bob with blunt bangs, the white band across the crown and the manga face with large eyes and parted lips match well.
- The audio-cable whip and bass-drop are good thematic equipment.
- The navy and black sailor tie loosely echoes the "blues of Nous".

**Wrong:**
1. **Hair colour.** The game hair is royal blue (`#0030A8`/`#001878`). Official hair is **black** in every source. Blue belongs in a duotone wash or accent, not the hair. (An "electric blue variant" palette swap could be a nod to the website.)
2. **Headphones.** The game shows only a white headband with **no ear cups**, so it reads as an Alice band. Add white over-ear cups, at least on the side facing the viewer.
3. **Outfit.** The sailor uniform is invented. The official art shows a plain collared shirt or blouse.
4. **Hair shape.** The game bob is a short rounded helmet. The official bob is longer, reaching shoulder level, with outward-flipped ends that give the distinctive flared silhouette.
5. **Rendering.** The game is soft-shaded and full colour. The official art is hard black-and-white ink. A high-contrast ink style with 2–3 tones would be closer.

## Source-use restrictions

- All official art (avatar, stamp, booklet, website imagery) is © Nous Research. **No public licence was found.** The booklet is a brand guide for "core team, developers, press & marketing", which is not a licence for third-party games.
- Use these images for **reference only**. Do not trace, embed or ship the mascot illustration, the NOUS badge or wordmark, or the stamp ring text. Draw an original pixel-art character with the canonical traits. If the game is commercial or prominently Nous-branded, Kyle should get permission from Nous Research.
- The booklet copy came from a community mirror, so cite Nous Research as the author.
- `refs/nous_girl-board.png` embeds only the game's own art and sampled hex values. Official images are linked, not embedded. Keep the downloaded `refs/` copies out of public commits unless cleared.

## Visual identity spec for new assets

- Retro-shoujo girl, slim, head slightly oversized (manga proportions).
- **Hair:** solid black (`#000000` with a 1–2 tone dark-blue shadow such as `#02172A` in sprites). Blunt straight bangs to the brows. A bob reaching the shoulders with **outward-flipped ends**, plus sharp white or electric-blue gloss streaks.
- **White over-ear headphones:** band over the crown plus a visible cup over the ear. Keep both white (`#FFFFFF`, shadow `#C2D9EB`).
- **Face:** large eyes with heavy black upper lashes, small nose, slightly parted lips, a calm or attentive expression rather than an angry one.
- **Outfit:** a simple white collared shirt or blouse (optionally a thin striped collar), with a dark skirt or trousers as free costume. Drop the sailor collar. Avoid the "N" collar mark unless Kyle wants it, since it is unverified.
- **Palette:** black and white plus **one** accent of Nous electric blue `#0000F2` (cable glow, FX, eye highlights, a palette-swap skin). Booklet blues work for shading.
- **Rendering:** hard-edged ink look with minimal gradients and optional screentone dithering on shadows.
- **Equipment:** keep the audio-cable whip and jack, with cable or FX in electric blue. The bass-drop burst can use concentric-ring or halftone motifs.
