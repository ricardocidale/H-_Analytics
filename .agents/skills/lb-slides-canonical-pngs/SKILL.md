---
name: lb-slides-canonical-pngs
description: Canonical PNG reference images for the L+B 6-slide investor deck. Use when generating, reviewing, or validating any rendered slide — these PNGs are the pixel-authoritative source of comparison. Also use when re-uploading canonical images after a design change, or when updating the hash guard baseline. Sister skill to lb-slides-renderer.
---

# L+B Slides — Canonical PNG Reference Images

## Purpose

The six PNG files registered here are the **pixel-authoritative** source of truth for the L+B 6-slide investor deck. Every generated or modified slide MUST be compared against its corresponding canonical PNG before shipping. They are:

- The single reference a coding agent uses to verify layout, color, typography, and proportions
- The baseline for the `check:canonical-schema` hash guard
- The design authority supplementing `spec_skeleton_v4.json` and `contract.ts`

---

## Source Files (attached_assets/)

| Slide | Local filename |
|-------|----------------|
| 1 | `attached_assets/L+B_Property_6-Slide_Cannonical_Page_1_1777868023135.png` |
| 2 | `attached_assets/L+B_Property_6-Slide_Cannonical_Page_2_1777868023137.png` |
| 3 | `attached_assets/L+B_Property_6-Slide_Cannonical_Page_3_1777868023137.png` |
| 4 | `attached_assets/L+B_Property_6-Slide_Cannonical_Page_4_1777868023136.png` |
| 5 | `attached_assets/L+B_Property_6-Slide_Cannonical_Page_5_1777868023136.png` |
| 6 | `attached_assets/L+B_Property_6-Slide_Cannonical_Page_6_1777868023136.png` |

The timestamp suffix in each filename is the upload batch identifier — keep verbatim for provenance.

---

## R2 Storage Keys

All six PNGs are live in R2 under the canonical prefix. The manifest is at `docs/slide-system/canonical/r2-manifest.json`.

| Asset | R2 key |
|-------|--------|
| Slide 1 canonical PNG | `canonical/lb-6-slide/slides/slide-1.png` |
| Slide 2 canonical PNG | `canonical/lb-6-slide/slides/slide-2.png` |
| Slide 3 canonical PNG | `canonical/lb-6-slide/slides/slide-3.png` |
| Slide 4 canonical PNG | `canonical/lb-6-slide/slides/slide-4.png` |
| Slide 5 canonical PNG | `canonical/lb-6-slide/slides/slide-5.png` |
| Slide 6 canonical PNG | `canonical/lb-6-slide/slides/slide-6.png` |

Access via `CANONICAL_ASSETS.slide(N, "png")` from `canonical-assets.ts` (both server and portal).

---

## Re-uploading

If the canonical design changes (new approved reference images):

1. Replace the source files in `attached_assets/` with the new PNGs
2. Update the filename entries in `scripts/src/upload-canonical-pngs.ts` (the `SLIDE_FILES` array)
3. Run the upload:
   ```bash
   pnpm --filter @workspace/scripts run upload:canonical-pngs
   ```
4. Re-lock the schema hash guard:
   ```bash
   pnpm --filter @workspace/scripts run check:canonical-schema -- --init
   ```
5. Commit both the updated script and the new baseline file `scripts/src/_canonical-schema-baseline.json`

---

## Slide-by-Slide Content Reference

Use these canonical PNGs when building or reviewing slide code. The table below summarises what each slide contains so you know what to compare.

### Slide 1 — Pipeline Spotlight
- **Layout**: 2-photo grid left (hero aerial + pool/grounds), 1 photo right (estate at dusk)
- **Content**: Property name (large Garamond), subtitle, "Property Specs" green card (bullets), "The Vision" muted card (bullets)
- **Key chrome**: Green left-border header strip, asking price + target acquisition top right, cinematic captions on all 3 photos, italic closing tagline in sage footer
- **Canvas**: 960×540, background `#FFF9F5`, faint grid texture

### Slide 2 — Alt View / Gallery
- **Layout**: 2-photo grid left (exterior aerial + indoor pool), 1 photo right (intimate interior)
- **Content**: Property name (large Garamond), subtitle (italic), "Property Specs" green card, "The Vision" muted card
- **Key chrome**: Same header and footer as Slide 1; operational model text, revenue bullet, programming bullet
- **Note**: Slide 2 is a second "spotlight" slide — different photos, same structural layout as Slide 1

### Slide 3 — Investment Model (Satellite Expansion Concept)
- **Layout**: 1 large photo left (~40% width), 3-column right panel: "The Concept" (italic bold), "Strategic Details" (bullets), "Why This Model?" (3 icon-label rows)
- **Key chrome**: Header with italic title and green-dot badge label; green icon dots beside reason rows; sage footer with closing pull quote
- **Background**: `#FFF9F5`, faint grid texture

### Slide 4 — Portfolio Overview / Pipeline
- **Layout**: 6-card grid (2 rows × 3 columns), each card: photo, badge label, city/property name, description, acquisition data row
- **Content**: Properties under consideration — mountain, lakeside, UNESCO luxury, expansion types
- **Key chrome**: Header italic title + green dot badge; sage footer with strategic filter text
- **Background**: `#FFF9F5`, faint grid texture

### Slide 5 — Transformation Plan
- **Layout**: Left panel (~50%): "The Transformation Plan" title (large italic), intro paragraph, 4-row Feature/Existing/Proposed table, investor metrics bullets; Right panel: "Snapshot of Stable Year" box (monospaced data), "Financing Summary" section
- **Key chrome**: Small dark-red accent bar top-left; sage background (`#9FBCAD`); no grid; monospaced financial data; green dot footer
- **Background**: `#9FBCAD` (sage solid)

### Slide 6 — 5-Year Pro Forma Income Statement
- **Layout**: Left: title block (large italic "5-Year Consolidated / Pro Forma Income Statement") + left income table (Revenue, Variable Cost, Gross Margin rows); Right: full-width overhead + compensation + travel + fixed cost + EBITDA/EBIT/EBT table (5 year columns: 2026–2030)
- **Key chrome**: Sage background (`#9FBCAD`); white text on sage; bold row labels; Roboto Condensed numerics; no header chrome (just page number `6` bottom-right)
- **Background**: `#9FBCAD` (sage solid)

---

## Comparison Workflow (mandatory before shipping slide changes)

When you have rendered a slide and need to verify it:

1. **Load the canonical PNG** for the slide you modified:
   - In the browser: use the R2 presigned URL via `CANONICAL_ASSETS.slide(N, "png")`
   - In the agent context: reference `attached_assets/L+B_Property_6-Slide_Cannonical_Page_N_*.png` directly

2. **Take a screenshot** of your rendered slide at 960×540

3. **Compare visually** across these dimensions (in order of severity):
   - **Layout positions**: all elements within ±2px of spec bbox values
   - **Colors**: must exactly match PALETTE tokens — no approximations
   - **Typography**: font family, weight, size, and capitalization match
   - **Text content**: dynamic slots populated; static chrome verbatim from spec
   - **Photo placement**: cover, clip radius, caption overlay present
   - **Footer**: tagline + dots/page number

4. **Never ship** a slide that fails any `error`-severity validation rule in `lb-slides-renderer` → Validation rules section

---

## Hash Guard

The `check:canonical-schema` workflow verifies that `spec_skeleton_v4.json`, `design-contract.json`, and `r2-manifest.json` have not drifted from their locked SHA-256 hashes.

```bash
# Verify current state
pnpm --filter @workspace/scripts run check:canonical-schema

# Re-lock after an intentional canonical update
pnpm --filter @workspace/scripts run check:canonical-schema -- --init
```

This runs as part of the Project validation suite in `.replit`.

---

## Import Path (frontend)

The PNGs in `attached_assets/` are available via the `@assets` Vite alias in the portal:

```ts
import slide1Png from "@assets/L+B_Property_6-Slide_Cannonical_Page_1_1777868023135.png";
import slide2Png from "@assets/L+B_Property_6-Slide_Cannonical_Page_2_1777868023137.png";
import slide3Png from "@assets/L+B_Property_6-Slide_Cannonical_Page_3_1777868023137.png";
import slide4Png from "@assets/L+B_Property_6-Slide_Cannonical_Page_4_1777868023136.png";
import slide5Png from "@assets/L+B_Property_6-Slide_Cannonical_Page_5_1777868023136.png";
import slide6Png from "@assets/L+B_Property_6-Slide_Cannonical_Page_6_1777868023136.png";
```

Do **not** reference `attached_assets/` paths in `src` attributes or URL strings — they are not served by the web server. Use the import alias or the R2 presigned URL from `CANONICAL_ASSETS`.

---

## Related skills

- `lb-slides-renderer` — rendering contract (canvas, positioning, PALETTE, fonts, forbidden patterns)
- `hplus-vision-templates` — content generation (text fields, char limits, LLM prompts)
- `hplus-renovation-benchmarks` — transformation cost ranges (budget realism for Slide 5)
