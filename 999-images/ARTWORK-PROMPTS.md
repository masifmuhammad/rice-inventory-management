# 999 artwork prompts, version 2: refine the drawings, don't reinvent them

The first Codex batch went wrong in three ways:

- **Too much ornament.** Truck-art covered every object, even the scale and the degh.
- **Wrong medium.** The images were glossy 3D renders, while the site is flat illustration.
- **Wrong logo.** The 999 mark was redrawn as a mosque dome.

This set works differently. **Every prompt attaches the site's own drawing** (from `999-images/reference/`) and asks Codex to *polish* it, not to imagine a new one. Composition, colours and proportions stay ours; Codex adds craft.

## How to run each prompt

1. Attach **three images**:
   - **The sketch.** The `sketch-….png` named in the table below.
   - **The style board.** `999-style-board.png`, the whole family together.
   - **The logo.** `999-logo-taj-vermilion.png`, only when the object carries the mark.
2. Paste the **master prompt**, then the object line from the table.
3. Save the result at the path in the table. Tell me, and I'll switch it on in `ART` in `frontend/src/pages/Landing.js`.

## The master prompt (paste every time)

> Redraw the first attached image as a polished, premium flat illustration. **Keep its composition, silhouette, proportions and colours exactly.** It belongs to the illustration family shown in the second attached image; match that family.
>
> Style: flat vector colour, a uniform deep-ink outline (#16130F, about 3px at this size), crisp curves, and one flat shadow tone per colour on the side away from the upper-left light. Add a very fine paper grain at about 4% opacity. Palette only: vermilion #E8322A, marigold #F4B400, cobalt #1F4FD8, pink #D93A7A, rice white #F4F1EA, ink #16130F, plus warm earth browns for jute, wood and copper.
>
> **Don't** use 3D rendering, gradients, gloss, photorealism, lens effects or drop shadows beyond a flat ellipse on the ground. Don't add objects, people, scenery or decoration that isn't in the sketch. Don't draw domes, mosques, minarets or the Taj Mahal. Don't write Urdu, and don't add any text beyond what the sketch already has. Where the 999 mark appears, use the attached logo exactly, as a flat stamp.
>
> Output a transparent background, the object centred and filling about 80% of the square.

## Objects → `frontend/public/brand/999/cutouts/` (2000 × 2000 PNG)

| Save as | Attach sketch | Object line (after the master prompt) |
| --- | --- | --- |
| `field.png` | `sketch-field.png` | Three clumps of ripe basmati paddy. Give each stalk a slender olive stem and a drooping head of individual golden grains. Gentle movement, as if in a light breeze. |
| `sacks.png` | `sketch-sacks.png` | Three jute rice sacks in a pyramid. Show the woven texture with flat hatching, not photo texture. Tied tops, one cobalt band each, and the 999 mark stencilled in vermilion. |
| `road.png` | `sketch-road.png` | The painted Bedford goods truck, side view facing right. **This is the one object allowed truck-art ornament:** refine the flower panels, add a small peacock to the middle panel, chamak-patti trim and the chain-and-bell fringe. All of it stays flat and within the palette. Keep the crown above the cab carrying the 999 mark. Sacks under a rope net on top. |
| `mill.png` | `sketch-mill.png` | The rice mill: a cream sawtooth-roof factory with dark windows, a marigold silo on the left and a small 999 sign on the roof line. Plain and architectural, no ornament. |
| `pack.png` | `sketch-pack.png` | The 999 Basmati rice pack, turned slightly to the left. Matte pouch, crimped seal, grain window. Clean, no ornament. |
| `shop.png` | `sketch-shop.png` | The kiryana shop front: cobalt signboard reading "Kiryana Store" (keep the sign's Urdu exactly as drawn), a scalloped vermilion-and-white awning, shelves of little packs and a wooden counter. |
| `table.png` | `sketch-table.png` | The copper degh with its lid, handles and three soft wisps of steam. Hammered copper suggested with a few flat facets, not a metallic render. |

## Rice packs → `frontend/public/brand/999/packs/` (1500 × 2000 PNG)

Use the same master prompt, with "front view, perfectly upright, identical shape across all three" added. Attach the matching sketch.

| Save as | Attach sketch | Notes |
| --- | --- | --- |
| `basmati.png` | `sketch-pack-basmati.png` | Vermilion pouch, rice-white print, "BASMATI". |
| `sella.png` | `sketch-pack-sella.png` | Marigold pouch, ink print, "SELLA". |
| `steam.png` | `sketch-pack-steam.png` | Cobalt pouch, rice-white print, "STEAM". |

The small Urdu name on each pack is part of the sketch. Ask Codex to "keep it exactly as drawn". If it garbles the Urdu, ask for the pack without it, and I'll set the Urdu in real type on top.

## Scenes → `frontend/public/brand/999/art/` (opaque, no transparency)

For these, replace the master prompt's last line with "full-bleed, opaque".

| Save as | Size | Attach sketch | Scene line |
| --- | --- | --- | --- |
| `footer-punjab.png` | 2880 × 1120 | `sketch-scene-footer-punjab.png` | Dusk over the Punjab paddies. Rows run to the horizon, the khaal reflects the sky, kikar trees and a tubewell kotha stand in silhouette, and a small painted truck sits on the bund road. The 999 mark sets like the sun, its bottom hidden by the fields. Indigo-to-vermilion sky, a few stars, flat bands of colour. The top 20% fades to ink so it melts into the page. |
| `family.png` | 2400 × 1800 | `sketch-scene-family.png` | The paddies from directly above: a patchwork of gold and olive plots, the khaal crossing on its raised bank, round tree canopies. A **kotha with a flat roof and a small courtyard**, seen from above. Harvesters as small top-down figures with dupattas and sickles, and cut bundles laid in rows. |
| `table.png` | 2400 × 1600 | `sketch-scene-table.png` | The end of the journey: a white dastarkhwan with a vermilion block-print border, the copper degh at the centre with steam rising, plates of rice either side, a roti basket, a clay water jug, and the 999 basmati pack at the edge. Side view at the level of the cloth, warm evening light, flat colour. Leave the top third empty and calm; the site writes *کھانا لگ گیا* there. |

## Check each result before sending

- Does it look like it belongs on the style board, next to the others?
- Is it flat, with no shine and no 3D?
- Is the 999 mark the taj shape, not a dome?
- Is there no new clutter that wasn't in the sketch?

If any answer is no, reply to Codex: "too much — simplify back toward the sketch; flat colour only."
