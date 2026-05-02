---
name: hplus-canonical-slide-2
description: Authoritative visual specification for canonical Slide 2 ("Property Spotlight, alt view") of the L+B Property Slides PPTX template — exact coordinates, colors, fonts, raster vs. native composition, slide-1-vs-slide-2 deltas, and known issues. Use whenever generating, debugging, redesigning, or screenshot-comparing Slide 2; whenever a property's second slide renders incorrectly; whenever extending the Python generator's Slide 2 path; or whenever asked to rebuild Slide 2 from scratch in code, Figma, or another tool. Companion to `hplus-canonical-slide-1` (structural twin), `hplus-slide-mapping` (H+ field → shape mapping), `hplus-slide-recipe` (slot-recipe extraction format).
---

# Canonical Slide 2 — Property Spotlight (alt view)

Full visual + structural specification of Slide 2 of the L+B Property Slides PPTX template. The source-of-truth document is the unabridged extraction at:

**`attached_assets/Pasted-SLIDE-2-Hazelnis-Retreat-Investment-Spotlight-0-Slide-L_1777741586519.txt`** (183 lines)

Read that file when you need exact details. This skill distills the most actionable facts so most tasks can be done without loading the full dump.

---

## Slide 2 at a glance

- **Position:** 2 of 6 (template_index `1`)
- **Dimensions:** 960 × 540 pt (16:9)
- **Governing design system:** **L+B palette** (same as Slide 1; Office theme XML is dormant on Slides 1–4, all colors are direct hex). The `_02_` canonical consolidated three near-duplicate sage/dark-green hex values into `#9FBCA4` and `#1C2B1E`; Slide 2's old `#7C837A` tag-line second run is now `#9FBCA4` along with the rest.
- **Effective canvas color:** `#FFF9F5` (warm ivory cream) — inferred, identical to Slide 1
- **Composition:** **Structural clone of Slide 1.** Same chrome (header band, footer band, three right-column cards) and most divider rules / bullet-dot rasters at identical x/y. The deltas — Vision dot y-shift (295/324/350 vs Slide 1's 295/313/338), price-block removal, photo caption band moved up ~13pt, subtitle font size, tag-line color split, and the live-photo-over-placeholder pattern — are documented in full in the next section. A rebuilder should clone the Slide-1 template and apply those deltas, not re-author from scratch.

---

## Deltas from Slide 1 (the only things that change)

This is the most useful section for Slide-2 tasks. If you understand Slide 1, you understand Slide 2 plus these deltas:

| What changes | Slide 1 | Slide 2 |
|---|---|---|
| **Hero photo binding** | `Image 5` (raster, 17,51,389,276) only — no live photo above it | `Image 5` placeholder PLUS `Picture 35` (live photo, 20,52,385,272) sitting 2pt smaller on top — intentional 2pt frame effect |
| **Secondary photo** | `Picture 2` at `16,331,387,168` | `Picture 41` at `20,332,382,166` |
| **Pool photo** | `Picture 68` at `687,247,265,255` | `Picture 66` at `690,258,244,244` |
| **Price block (right of title card)** | Three shapes: `Text 7` "ASKING PRICE", `Text 8` "$3.25M", `Text 9` "Target Acquisition: $2.3M" | **REMOVED.** None of these shapes exist on Slide 2. No pricing data. |
| **Specs line 6 (`Text 16`)** | `"Asking: $3.25M"` (price line) | `"Ample Parking with Multi-Car Garage"` (property feature) |
| **Subtitle (`Text 6`) font size** | 8.63pt italic | 10pt italic (slightly larger) |
| **Vision bullet dot y-positions** | `295, 313, 338` | `295, 324, 350` (shifted to accommodate longer wrapped text) |
| **Vision bullet 1 (`Text 18`) container height** | ~12pt (single line) | ~24pt (two lines — text "Transform into a boutique retreat property supporting 20–30 guest experiences" wraps) |
| **Vision card closing tag-line color** | Single deep-green `#1C2B1E` run | Two-run split: `#257D41` then `#9FBCA4` (muted sage — was `#7C837A` pre-`_02_`) |
| **Photo caption y-positions** | y=482 | y=469–487 (bands sit ~13pt higher than Slide 1) |
| **`Text 22` footer textbox width** | 1339pt (overflows 427pt past slide edge) | 805pt (in-bounds) — but text content unclear from extraction |

All chrome raster assets (header band, footer band, card backgrounds, specs divider rules and bullet dots, header accents, footer page-number badge) are reused from Slide 1 and appear at identical positions. Font choices and the color palette also match. **Anything not in the table above can be assumed identical to Slide 1; anything in the table above must be applied as a delta.** The Vision card's bullet-dot y-positions are the one place where dots themselves move, not just the text.

---

## Color palette — L+B (post-consolidation, identical to Slide 1)

After the `_02_` consolidation, Slide 2's palette is identical to Slide 1's — the previously Slide-2-only `#7C837A` tag-line second run was collapsed into `#9FBCA4` along with `#5A7A62` and `#7AAA88`.

| Hex | Role |
|---|---|
| `#1C2B1E` | Deep forest green — backgrounds, primary text, tag-line first run |
| `#257D41` | Forest green — headlines, body bullets, page number, tag-line second run accent |
| `#9FBCA4` | Muted sage — subtitle, tagline, captions (collapses old `#5A7A62` + `#7AAA88` + `#7C837A`) |
| `#FFF9F5` | Warm ivory — slide canvas, cream-on-dark text |
| `#C8E8D0` | Mint — Slide 4 subtitle header (not used on Slide 2; listed for palette completeness) |
| `#FFFFFF` | White — table fills, header text on dark bg |

---

## Typography (same as Slide 1)

| Font | Where used | Notes |
|---|---|---|
| Poppins ExtraLight | All headlines, body bullets, eyebrows | Custom |
| Georgia | Header band, page number | System |
| Microsoft YaHei | Photo captions | Windows-only |

Subtitle (`Text 6`) is 10pt italic on Slide 2 vs 8.63pt on Slide 1. All other sizes match.

---

## Spatial layout

Identical to Slide 1's two-column grid. See `hplus-canonical-slide-1` for the ASCII diagram. Position deltas:

**Three photo slots (Slide 2):**
- Hero placeholder + live photo: `Image 5` at `17,51,389,276` + `Picture 35` at `20,52,385,272` (2pt frame)
- Secondary: `Picture 41` at `20,332,382,166`
- Pool / amenity: `Picture 66` at `690,258,244,244`

**Three right-column card backgrounds (same as Slide 1):**
- Title card: `Image 11` at `419, 51, 525, 53`
- Specs card: `Image 12` at `419, 110, 525, 143` + `Image 13` (header strip) `419, 110, 525, 23`
- Vision card: `Image 26` at `419, 258, 260, 241` + `Image 27` (header strip) `419, 258, 260, 23`

---

## Live text shapes (z-order: rendered after all raster images)

Full table in source file Section 2. Slide 2 inventory by region:

- **Header:** `Text 0` (property name + location), `Text 1` (region/county subline), `Text 2` ("INVESTMENT SPOTLIGHT" eyebrow — overflows by 49pt, same as Slide 1)
- **Captions:** `Text 3` (hero photo caption), `Text 4` (secondary photo caption), `Text 21` (pool photo caption)
- **Title card:** `Text 5` (property name, 21pt green), `Text 6` (10pt italic tagline). **No `Text 7`/`Text 8`/`Text 9` price block — these shapes do not exist on Slide 2.**
- **Specs card:** `Text 10` (header) + `Text 11`–`Text 16` (6 spec lines, all property features — no price line)
- **Vision card:** `Text 17` (header) + `Text 18`–`Text 20` (3 vision bullets that wrap to multiple lines)
- **Footer:** `Text 22` (footer textbox at 48,517,805,15 — content unclear from extraction; verify), `Text 19` (page number — same disambiguation rule as Slide 1: route by `"PAGE" in text`)

The two-`Text 19` disambiguation rule from Slide 1 applies here too.

---

## Known issues / reconstruction-risk flags

These mirror Slide 1 for the chrome elements, with Slide-2-specific items added:

1. **`Picture 35` over `Image 5` is intentional, not a bug.** Unlike Slide 1's duplicate-hero ambiguity, here `Image 5` (389×276) is a deliberate baked frame and `Picture 35` (385×272) is the swappable live photo sitting 2pt smaller on top. Do NOT collapse them.
2. **No pricing on Slide 2.** `Text 7`/`Text 8`/`Text 9` (ASKING PRICE / price / target) and `Text 16` price line are absent. Could be intentional (property's price is TBD) or a stale incomplete clone — verify with stakeholders before "fixing."
3. **`Text 22` footer content unclear.** Bounding box is in-bounds (805pt vs Slide 1's 1339pt overflow), but actual text content was not returned in the extraction. Verify by reading the PPTX directly.
4. **Vision bullets wrap.** All three Vision bullet shapes are 217–228pt wide for content of 50–80 chars. They will wrap to 2 lines. The dot y-positions (295, 324, 350) confirm three rows of wrapped text.
5. **Same Slide-1 issues persist:** `Text 0` green-on-dark-green low contrast; `Text 2` overflows right edge by 49pt; `"PAGE 22"` wrong page number on a 6-slide deck (Slide 2's stale value in the running 21→26 sequence — see Slide 1's "Page number wrong" note); 6.75pt micro-copy sub-readable on projected slides.
6. **"Hazelnis" flagged as misspelled** (`err="1"` on both `Text 0` and `Text 5` runs in the source XML). Likely intended spelling, but flag for editorial review.

---

## Reconstruction recipe

From Section 7 of the source file:

1. Start from the Slide-1 template (same chrome, same card backgrounds, same dot/divider rasters)
2. Swap the three photo assets: hero (`Picture 35`), secondary (`Picture 41`), pool (`Picture 66`)
3. Change header `Text 0` and `Text 1` to property name + location / region + county
4. Change title-card headline (`Text 5`) and 10pt italic tagline (`Text 6`)
5. **Remove the price block** (`Text 7`/`Text 8`/`Text 9`) — these shapes do not exist on Slide 2
6. Replace specs bullet text (`Text 11`–`Text 16`) with the Slide 2 spec list (no price line; all property features)
7. Replace vision bullet text (`Text 18`/`Text 19`/`Text 20`) — closing tag-line gets two-run colors `#257D41` then `#9FBCA4` (muted sage — was `#7C837A` pre-`_02_` consolidation)
8. Replace the three photo captions (`Text 3`, `Text 4`, `Text 21`)
9. Fix flagged issues only if user approves: wrong page number, header overflow, narrow Vision bullet shapes

---

## Cross-references

- `attached_assets/Pasted-SLIDE-2-Hazelnis-Retreat-Investment-Spotlight-0-Slide-L_1777741586519.txt` — full 183-line source extraction
- `.agents/skills/hplus-canonical-slide-1/SKILL.md` — Slide 1 spec; Slide 2 is its structural twin so most chrome details live there
- `.agents/skills/hplus-slide-mapping/SKILL.md` — H+ field → shape-name table for Slides 1–6 (note: Slide 2 mapping in that skill should be cross-checked against this extraction since Slide 1 had documented discrepancies)
- `.agents/skills/hplus-slide-recipe/SKILL.md` — slot-recipe JSON format and re-extraction procedure
- `.agents/skills/hplus-pptx-generator/SKILL.md` — full generator architecture and extension guide
- `scripts/src/generate_property_slides.py` — Python generator that writes Slide 2
- `scripts/src/slide-slot-recipe.json` — machine-readable slot recipe consumed by the api-server hybrid renderer
- `attached_assets/L+B_Property_Slides_02_1777743268816.pptx` — current canonical template (as of 2026-05-02 PM). Two prior canonicals (`_1777738821984.pptx`, `_1777637870265.pptx`) live in `attached_assets/archive/`. Path is centralized in `scripts/src/canonical_template.py` — never hardcode the filename.
