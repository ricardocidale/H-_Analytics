---
name: hplus-slide-recipe
description: Slot recipe for the L+B PPTX slide pipeline. Documents the hybrid Track 2 compositing approach (template background + slot compositing), the slot recipe JSON format, and how to re-extract or update the recipe. Use whenever working on Track 2 image-locked PPTX generation or improving slide visual fidelity.
---

# H+ Analytics — Slide Slot Recipe

## What This Is

The slot recipe is the bridge between the canonical L+B PPTX template and the Track 2 image-locked PPTX pipeline. It captures the exact position, size, font, and color of every substitutable element ("slot") in the template, so they can be precisely composited onto a pre-rendered background.

**Recipe file:** `scripts/src/slide-slot-recipe.json`  
**Extraction script:** `scripts/src/extract_slot_recipe.py`  
**Shape → field mapping:** `.agents/skills/hplus-slide-mapping/SKILL.md`

---

## Track 2 Architecture: Hybrid Compositing

The current Track 2 pipeline reconstructs entire slides from scratch using satori JSX. This fails to reproduce complex decorative fills, gradients, and layered elements present in the canonical template.

**The hybrid approach replaces full-slide JSX reconstruction with:**

```
Canonical PPTX backgrounds (one-time render)
  + Slot content composited at exact recipe positions
  = Pixel-accurate JPEG per slide
  → pptxgenjs wraps each JPEG as a PPTX slide
```

### Why This Works

The canonical PPTX has ~287 shapes per deck. Most are decorative (gradients, lines, overlapping fills, brand elements). The hybrid approach:
- Gets decorative content for FREE by rendering the template as a background image
- Only composites the ~25 data-dependent slots per slide (photos, text, financials)
- Eliminates satori's inability to reproduce complex CSS fills

### Pipeline Steps

1. **Pre-render backgrounds** — run `scripts/src/render_slide_backgrounds.py` once to produce `scripts/src/slide-backgrounds/slide-{1..6}-bg.jpg` (1920×1080 JPEG). These are committed to the repo. Re-run only if the canonical template changes.

2. **For each property**, for each slide:
   - Load the background JPEG for that slide number
   - For each slot in the recipe:
     - **Photo slot** → crop/resize property photo to slot dimensions → composite at slot position
     - **Text slot** → render text fragment via satori (slot-width × slot-height canvas, inline styles) → composite at slot position
     - **Table slot** → render table via satori → composite at slot position
   - Write composited JPEG to buffer

3. **Wrap** — pass JPEG buffers to `buildImagePptx()` via pptxgenjs (unchanged from current pipeline)

---

## Slot Recipe JSON Format

```jsonc
{
  "canvas_width_px": 1920,
  "canvas_height_px": 1080,
  "slide_width_emu": 12192000,
  "slide_height_emu": 6858000,
  "slide_width_in": 13.3333,
  "slide_height_in": 7.5,
  "slides": {
    "1": {
      "template_index": 0,
      "slot_count": 26,
      "missing_slots": [],
      "slots": [
        {
          "name": "Text 0",
          "kind": "text",          // "text" | "picture" | "table"
          "left_px": 66.0,
          "top_px": 13.95,
          "width_px": 1436.4,
          "height_px": 31.34,
          "left_pct": 3.4375,      // percentage of canvas width
          "top_pct": 1.2912,       // percentage of canvas height
          "width_pct": 74.8125,
          "height_pct": 2.9015,
          "left_emu": 419100,      // raw EMU for python-pptx round-trip
          "top_emu": 88553,
          "width_emu": 9121140,
          "height_emu": 198983,
          // text slots also include:
          "font_name": "Georgia",
          "font_size_pt": 16.0,
          "bold": true,
          "italic": true,
          "color_hex": "#257D41",
          "alignment": "left",
          "template_text": "Pipeline Spotlight: Belleayre Mountain, NY"
        },
        {
          "name": "Picture 68",
          "kind": "picture",
          "left_px": 1373.25,
          "top_px": 494.89,
          "width_px": 530.25,
          "height_px": 510.11,
          // ... pct and emu fields
        }
      ]
    }
  }
}
```

**Duplicate shape names:** Some shapes share a name (e.g. "Text 19" appears twice on slide 1 — once for the vision bullet, once for the page number). The page-number instance has `"is_page_number": true`. The duplicate instance has `"duplicate_index": 1`.

---

## Re-Extracting the Recipe

The recipe JSON is committed to the repo and should be re-generated whenever:
- The canonical template PPTX changes (`attached_assets/L+B_Property_Slides_*.pptx`)
- New slots are added to the hplus-slide-mapping skill

```bash
python3 scripts/src/extract_slot_recipe.py
# Writes: scripts/src/slide-slot-recipe.json
```

The script reads only the shapes listed in `SLOT_NAMES` (defined at the top of the script). To add a new slot, add its name to the correct slide's list in `SLOT_NAMES`.

---

## Slot Count by Slide

| Slide | Name | Text slots | Photo slots | Table slots | Total |
|-------|------|-----------|-------------|-------------|-------|
| 1 | Property Spotlight | 24 | 2 | 0 | 26 |
| 2 | Alt View / Photo Gallery | 19 | 5 | 0 | 24 |
| 3 | Investment Model | 25 | 3 | 0 | 28 |
| 4 | Market Context / Pipeline | 5 | 0 | 0 | 5 |
| 5 | Financial Snapshot | 4 | 0 | 3 | 7 |
| 6 | Income Statement | 2 | 2 | 0 | 4 |
| **Total** | | **79** | **12** | **3** | **94** |

---

## Key Slot Positions (Slide 1 Reference)

| Shape | Position (px) | Size (px) | Font | Notes |
|-------|--------------|-----------|------|-------|
| Text 0 | 66, 14 | 1436×31 | Georgia 16pt bold italic #257D41 | Headline (green) |
| Text 8 | 1578, 137 | 288×33 | Poppins ExtraLight 15pt bold #1C2B1E | Asking price, right-aligned |
| Text 3 | 50, 612 | 656×29 | — | Property name + type badge |
| Picture 68 | 1373, 495 | 530×510 | — | Hero photo (right panel) |
| Picture 2 | 32, 661 | 773×336 | — | Secondary photo (left bottom) |

---

## Known Issues / Notes

- **Slide 2 panel photos:** Original SKILL.md listed `Image 13/22/33/44` as panel photo targets. These are 9×9 px decorative bullet icons — not photos. Correct shape names are `Picture 35`, `Picture 41`, `Image 12`, `Image 26`, `Picture 66`. Both the generator and SKILL.md have been updated.
- **Slide 4 card structure:** The property pipeline card layout uses complex overlapping shapes not fully captured in the slot recipe. Track 2 slide 4 compositing will need manual position verification.
- **Font fallback:** `font_name` and `font_size_pt` reflect the first run of the first non-empty paragraph. Some shapes have `null` font fields if the text is empty in the template — fall back to brand defaults (EB Garamond for headers, Poppins ExtraLight for body).
- **Z-order:** The recipe captures shapes in document order, which corresponds to Z-order in the PPTX. When compositing, apply slots in recipe order so overlapping slots render correctly.

---

## Related

- `.agents/skills/hplus-slide-mapping/SKILL.md` — authoritative shape name → H+ field mapping for all 6 slides
- `.agents/skills/hplus-pptx-generator/SKILL.md` — Track 1 python-pptx generator architecture
- `scripts/src/extract_slot_recipe.py` — extraction script
- `scripts/src/slide-slot-recipe.json` — the recipe (version-controlled)
- `artifacts/api-server/src/slides/image-renderer.ts` — Track 2 pipeline entry point
- `docs/solutions/architecture-patterns/two-format-slide-deck-generation-2026-05-02.md` — overall two-format architecture
