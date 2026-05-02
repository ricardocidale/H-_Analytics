---
name: hplus-canonical-slide-1
description: Authoritative visual specification for canonical Slide 1 ("Property Spotlight") of the L+B Property Slides PPTX template — exact coordinates, colors, fonts, raster vs. native composition, and known issues. Use whenever generating, debugging, redesigning, or screenshot-comparing Slide 1; whenever a property's first slide renders incorrectly; whenever extending the Python generator's Slide 1 path; or whenever asked to rebuild Slide 1 from scratch in code, Figma, or another tool. Companion to `hplus-slide-mapping` (which has the H+ field → shape mapping) and `hplus-slide-recipe` (which has the slot-recipe extraction format).
---

# Canonical Slide 1 — Property Spotlight

Full visual + structural specification of Slide 1 of the L+B Property Slides PPTX template. The source-of-truth document is the unabridged extraction at:

**`attached_assets/Pasted-SLIDE-1-Sul-Monte-Investment-Spotlight-0-Slide-Level-Me_1777741401797.txt`** (200 lines)

Read that file when you need exact details. This skill distills the most actionable facts so most tasks can be done without loading the full 200-line dump.

---

## Slide 1 at a glance

- **Position:** 1 of 6 (template_index `0`)
- **Dimensions:** 960 × 540 pt (16:9)
- **Governing design system:** **L+B palette** (named below). The PPTX file's theme XML happens to report a "DEFAULT" layout on an "Office Theme" master — that's a python-pptx artifact, not a meaningful design choice. Treat L+B as the source-of-truth for colors and typography; the embedded Office theme is inert.
- **Effective canvas color:** `#FFF9F5` (warm ivory cream); confirm via `slideMaster1.xml <p:bg>` if regenerating
- **Composition:** ~70% raster (header band, footer band, card backgrounds, divider lines, bullet dots, decorative icons are all baked-in PNG/JPG fragments) + ~30% live text shapes overlaid on top. Signature of a Canva/Figma/PDF export pasted into PowerPoint.

---

## Color palette — L+B

These are the L+B brand colors. They are written into the PPTX as direct sRGB values (not via theme references), so the embedded Office theme can be ignored.

| Hex | Role |
|---|---|
| `#FFF9F5` | Cream background + cream-on-dark text |
| `#1C2B1E` | Deep green-black (price text, dark card backgrounds) |
| `#257D41` | Forest green (headlines, body bullets, page number) |
| `#7AAA88` | Lighter sage (vision bullets) |
| `#9FBCA4` | Muted green ("ASKING PRICE" eyebrow) |
| `#5A7A62` | Muted sage (subtitle, tagline) |

---

## Typography

| Font | Where used | Notes |
|---|---|---|
| Poppins ExtraLight | All headlines, body bullets, eyebrows | Custom — must be embedded or substituted |
| Georgia | Header band ("Pipeline Spotlight…"), page number | System font |
| Microsoft YaHei | Photo captions ("SUL MONTE · …", "HEATED SALT-WATER POOL · …") | Windows-only — falls back on Mac/web |

Body bullets are typically **9pt bold** with `line-height 11.7pt`. Headlines run 12pt (card headers) → 15pt (price) → 21pt ("Sul Monte" title). Eyebrows and captions are **6.75pt** with wide character spacing (32–76).

---

## Spatial layout (two-column grid)

```
y=0    [████ Dark green header band, full bleed, 44pt tall ████]
y=44   ┌─ Left column ───────────┬─ Right column ──────────────┐
y=51   │ Hero photo              │ Title card (51–104)         │
       │ 17,51,389,276           │   "Sul Monte" + tagline     │
       │ + duplicate at same xy  │   + ASKING $3.25M (right)   │
y=104  │                         ├─────────────────────────────┤
       │                         │ Specs card (110–253)        │
       │                         │   "Property Specs" header   │
       │                         │   6 bullet lines            │
y=258  │                         ├─────────────────────────────┤
y=327  │                         │ Vision card (258–499)       │
y=331  │ Secondary photo         │   "The Vision" header       │
       │ 16,331,387,168          │   3 bullet lines            │
y=499  │                         │   Pool photo at 687,247,    │
       │                         │     265,255 (sits beside)   │
y=507  └─────────────────────────┴─────────────────────────────┘
y=507  [████ Dark green footer band, full bleed, 33pt tall ████]
y=540
```

**Three photo slots:**
- Hero: `17, 51, 389, 276`
- Secondary: `16, 331, 387, 168`
- Pool / amenity: `687, 247, 265, 255`

**Three right-column card backgrounds:**
- Title card: `419, 51, 525, 53`
- Specs card: `419, 110, 525, 143` (with dark green header strip ~23pt tall)
- Vision card: `419, 258, 260, 241` (with dark green header strip ~23pt tall)

---

## Live text shapes (z-order: rendered after all raster images)

The full table is in the source file (Section 2). The H+ field → shape-name mapping lives in `.agents/skills/hplus-slide-mapping/SKILL.md` (the slide-1 section). For Slide 1, the live shapes are:

- **Header:** `Text 0` (status spotlight headline), `Text 1` (active-acquisition subline), `Text 2` ("INVESTMENT SPOTLIGHT" eyebrow)
- **Captions:** `Text 3` (hero photo), `Text 4` (curated-experience), `Text 21` (pool photo)
- **Title card:** `Text 5` (property name), `Text 6` (tagline), `Text 7` ("ASKING PRICE"), `Text 8` (price), `Text 9` (target acquisition)
- **Specs card:** `Text 10` (header) + `Text 11`–`Text 16` (6 spec lines)
- **Vision card:** `Text 17` (header) + `Text 18`–`Text 20` (3 vision bullets)
- **Footer:** `Text 22` (footer copy — bounding box overflows by 427pt; investigate before reuse), `Text 19` (page number — disambiguate by checking text contains "PAGE")

**Critical disambiguation:** there are two shapes named `Text 19` on Slide 1 — one is a vision bullet, one is the page number. Iterate all shapes and route by text content (`"PAGE" in text`), per `hplus-slide-mapping`.

---

## Known issues / reconstruction-risk flags

These are baked into the canonical template. Do NOT silently "fix" them in the generator without explicit user approval — they may be intentional.

1. **Duplicate hero photos.** `Image 5` and `Image 6` sit at identical coordinates `17,51,389,276`. One is likely a tinted/duotone overlay; the other is the source photo. UNKNOWN which is which until inspected.
2. **Header copy mismatch.** `Text 0` reads `"Pipeline Spotlight: Belleayre Mountain, NY"` even on the Sul Monte slide — likely stale template copy. The Python generator overwrites this per property, but the master template has the wrong text.
3. **Page number wrong.** Footer reads `"PAGE 17"` on a 6-slide deck — leftover from a longer source document. Generator overwrites to `"PAGE 1"`.
4. **Bounding box overflows.**
   - `Text 2` ("INVESTMENT SPOTLIGHT"): width 162pt at x=847 → extends to x=1009 (49pt past slide right edge of 960)
   - `Text 22` (footer): width 1339pt at x=48 → extends 427pt past slide right edge
   - `Text 19` (vision bullet "Year-Round Demand…"): only 217pt wide for content that needs more
   - `Text 20` (vision bullet "Anchored Programming…"): only 228pt wide for content that needs more
5. **Header text color contrast.** `Text 0` is `#257D41` green on the dark-green header band — likely fails WCAG AA (<3:1).
6. **Sub-readable type.** All 6.75pt captions and eyebrows are below the 14pt projected-slide readability floor. Acceptable only for printed/screen-zoomed viewing.

---

## Reconstruction recipe (if rebuilding from scratch in code)

From Section 7 of the source file:

1. Set slide 960 × 540 (L+B design system; the layout name in the PPTX XML — "DEFAULT" — is irrelevant)
2. Set slide background to `#FFF9F5` (or confirm via master)
3. Place full-bleed dark-green bar `0,0,960,44` (~`#1C2B1E`)
4. Place full-bleed dark-green bar `0,507,960,33`
5. Place hero photo asset at `17,51,389,276`
6. Place secondary photo at `16,331,387,168`
7. Place pool photo at `687,247,265,255`
8. Place three right-column card backgrounds (Title `419,51` / Specs `419,110` / Vision `419,258`) — Specs and Vision get a dark header strip ~23pt tall in dark green
9. Place every native bullet dot (5×5pt) and divider rule (504pt × 18pt) — convert raster fragments to native shapes
10. Place every text shape from Section 2 with the exact font/size/weight/color/spacing recorded
11. Fix flagged issues only if user approves: correct header copy, correct page number, widen overflowing shapes, resolve duplicate hero image

---

## ⚠️ Known discrepancies with `hplus-slide-mapping`

A code review on 2026-05-02 surfaced two contradictions between this skill (which mirrors the canonical extraction at `attached_assets/Pasted-SLIDE-1-…txt`) and the field-mapping table in `hplus-slide-mapping`. Both have NOT been reconciled because doing so requires verifying what the Python generator (`scripts/src/generate_property_slides.py`) actually does at runtime — that is a separate task with generator-behavior implications.

**1. Photo slot count and `Picture 68` role.**
- `hplus-slide-mapping` lists only two photo slots: `Picture 68` = hero, `Picture 2` = secondary.
- This skill / the extraction shows **three** photo slots: hero at `Image 5` (with `Image 6` overlay) at `17,51,389,276`, secondary at `Picture 2` at `16,331,387,168`, and a pool/amenity photo at `Picture 68` at `687,247,265,255` (bottom-right). `Picture 68` is NOT the hero.

**2. `Text 4` ↔ `Text 21` swap (and `Text 22`).**
- `hplus-slide-mapping` says: `Text 4` = `cinematicCaption` (e.g. "SALTWATER POOL · 61 PRIVATE ACRES"), `Text 21` = `badgeText` (e.g. "CURATED GUEST EXPERIENCE"), `Text 22` = `descriptionParagraph`.
- Extraction shows: `Text 4` = "CURATED GUEST EXPERIENCE" (lower photo strip caption at `35,472`), `Text 21` = "HEATED SALT-WATER POOL · 61+ PRIVATE ACRES" (pool photo caption at `713,482`), `Text 22` = empty/oversized footer textbox at `48,517,1339,14`.
- The example text in `hplus-slide-mapping` matches the extraction's content **with the shape names swapped** — strong signal that the mapping has `Text 4` and `Text 21` reversed and that `Text 22` does not currently hold the description paragraph.

**Resolution path (deferred to a separate task):**
1. Read the actual photo-routing logic in `scripts/src/generate_property_slides.py` (and `slide_helpers.py`) to confirm runtime behavior for Slide 1.
2. Decide which document is canonical for each disagreement.
3. Update whichever skill is wrong (likely `hplus-slide-mapping`, since the extraction is a direct read of the PPTX), and document the decision in `claude.md`.

Until then: **trust the extraction in this skill for visual layout, coordinates, and what each shape currently contains; trust `hplus-slide-mapping` for which H+ field the generator is intended to write into each shape.** Where they conflict on Slide 1's three Picture/Image slots or on `Text 4`/`Text 21`/`Text 22`, verify against the generator code before making changes.

---

## Cross-references

- `attached_assets/Pasted-SLIDE-1-Sul-Monte-Investment-Spotlight-0-Slide-Level-Me_1777741401797.txt` — full 200-line source extraction
- `.agents/skills/hplus-canonical-slide-2/SKILL.md` — Slide 2 visual spec (structural twin; only deltas differ)
- `.agents/skills/hplus-slide-mapping/SKILL.md` — H+ field → shape-name table for Slide 1 (and slides 2–6)
- `.agents/skills/hplus-slide-recipe/SKILL.md` — slot-recipe JSON format and re-extraction procedure
- `.agents/skills/hplus-pptx-generator/SKILL.md` — full generator architecture and extension guide
- `scripts/src/generate_property_slides.py` — Python generator that writes Slide 1
- `scripts/src/slide-slot-recipe.json` — machine-readable slot recipe consumed by the api-server hybrid renderer
- `attached_assets/L+B_Property_Slides_1777738821984.pptx` — current canonical template (as of 2026-05-02)
