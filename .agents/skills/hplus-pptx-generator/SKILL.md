---
name: hplus-pptx-generator
description: How to run, extend, debug, and maintain the H+ Analytics per-property PPTX generator. Use when generating slide decks, debugging the Python generator, adding new slides, changing styling, or updating the API endpoint that calls the generator. Contains the full architecture, file locations, data contract, and extension guide.
---

# H+ Analytics PPTX Generator

Generates a 6-slide per-property PPTX from the L+B template.
**Slide 7 ("The Ask") is always excluded.**

---

## Architecture

```
scripts/src/generate_property_slides.py   ← main generator (stdin JSON → stdout JSON)
scripts/src/slide_helpers.py              ← deterministic helper functions
scripts/src/renovation_budget.py          ← renovation budget calculator
artifacts/api-server/src/routes/property-slides.ts  ← Express route
artifacts/api-server/src/ai/property-vision.ts      ← LLM + fallback vision text
artifacts/hospitality-business-portal/src/components/admin/SlideDecksTab.tsx  ← admin UI
```

---

## Running the Generator

```bash
# Direct test with fixture data
echo '{"property": {...}, "photos": [], "financials": {...}, "siblings": [], "visionText": {...}}' \
  | python3 scripts/src/generate_property_slides.py

# Output (stdout): {"path": "/tmp/slides_42_1746000000.pptx", "slides": 6}
# Errors (stderr): {"error": "...", "detail": "..."}
```

---

## Input JSON Contract

```typescript
interface SlideGeneratorInput {
  property: {
    id: number;
    name: string;
    city?: string;
    stateProvince?: string;
    county?: string;
    country?: string;
    purchasePrice?: number;       // e.g. 3250000
    roomCount?: number;           // e.g. 20
    startAdr?: number;            // starting ADR
    maxOccupancy?: number;        // 0–1 fraction, e.g. 0.72
    businessModel?: string;       // "hotel" | "vrbo" | "retreat" | ...
    hospitalityType?: string;     // more specific type
    qualityTier?: string;         // "upscale" | "luxury" | ...
    description?: string;
    acquisitionStatus?: string;   // "active" | "pipeline" | "closed"
    targetCloseDate?: string;
  };
  photos: Array<{
    url: string;               // absolute URL or /objects/ path
    base64?: string;           // pre-fetched bytes as base64 string
    isHero: boolean;
    sortOrder: number;
    caption?: string;
  }>;
  financials: {
    yearlyIS: Array<{          // from aggregateUnifiedByYear
      year: number;
      revenueTotal: number;
      totalExpenses: number;
      noi: number;
      gop: number;
      operationalMonthsInYear: number;
    }>;
    yearlyCF: Array<{
      year: number;
      debtService: number;
      netCashFlowToInvestors: number;
      cumulativeCashFlow: number;
      exitValue: number;
    }>;
    loanAmount: number;
    loanLtv: number;           // 0–1 fraction
    annualDebtService: number;
    irr?: number;              // 0–1 fraction
    equityMultiple?: number;
    exitCapRate?: number;
  };
  siblings: Array<{            // other H+ properties for slide 4
    id: number;
    name: string;
    city?: string;
    stateProvince?: string;
    purchasePrice?: number;
    hospitalityType?: string;
    heroPhotoBase64?: string;
  }>;
  visionText: {                // from property-vision.ts
    cinematicCaption: string;
    visionHeadline: string;
    visionBullet1: string;
    visionBullet2: string;
    badgeText: string;
    descriptionParagraph: string;
    investmentModelConcept: string;
    marketRationale: string;
    reason1Label: string; reason1Detail: string;
    reason2Label: string; reason2Detail: string;
    reason3Label: string; reason3Detail: string;
    closingLine: string;
    transformationDescription: string;
    operationalModelText: string;
    revenueBullet: string;
    programmingBullet: string;
    operationalParagraph: string;
  };
}
```

---

## Output JSON Contract

```json
{ "path": "/tmp/slides_42_1746000000.pptx", "slides": 6 }
```

On error (non-zero exit + stderr):
```json
{ "error": "Shape 'Picture 68' not found in slide 0", "slide": 0 }
```

---

## Template Source

`attached_assets/L+B_Property_Slides_1777637870265.pptx` — READ ONLY. Never modify.

Slide indexes used: 0, 1, 2, 3, 4, 5 (0-indexed). Slide 6 (index 6) = "The Ask" — SKIP.

---

## Key Helper Functions (slide_helpers.py)

| Function | Purpose |
|---|---|
| `clone_slide(prs, src_index, dst_prs)` | Deep-copy slide XML into output presentation |
| `set_shape_text(slide, name, text, page_hint=False)` | Replace text preserving all run formatting. `page_hint=True` targets the PAGE footer shape when name is ambiguous |
| `replace_picture(slide, name, image_bytes)` | Swap picture content by shape name |
| `add_styled_table(slide, left, top, w, h, headers, rows)` | Add a new styled table at exact EMU position |
| `remove_shape(slide, name)` | Remove shape from slide spTree |
| `format_currency(v)` | `"$2,300,000"` or `"$2.3M"` for large values |
| `format_pct(v)` | `"72%"` from 0.72 |
| `get_stable_year(yearly_is)` | First year with 12 operational months, or index 2 |
| `build_transformation_plan(property, reno_budget)` | Returns 4-row list of (feature, existing, proposed) |
| `get_renovation_budget(room_count, tier, is_historic)` | Deterministic estimate from hplus-renovation-benchmarks |

---

## Extending the Generator

### Adding a new slide
1. Add a new block in `generate_property_slides.py` using `clone_slide(prs, template_index, out_prs)`
2. Update `hplus-slide-mapping` skill with the new shape mapping
3. Add slide number in `set_shape_text(slide, "Text 19", f"PAGE {N}", page_hint=True)`
4. Update the `slides` count in the output JSON

### Changing table styling
Edit `SLIDE_COLORS` dict at top of `slide_helpers.py`. Never hardcode hex values inline.

### Adding a photo slot
Use `replace_picture(slide, "Image N", photo_bytes)`. Photo bytes must be JPEG or PNG.
Prefer JPEG for speed (python-pptx embeds as-is).

---

## Photo Fetching (server-side, property-slides.ts)

Photos are fetched server-side in Node before calling the Python script:
1. Call `storage.getPropertyPhotos(propertyId)` → sorted `[{url, isHero, sortOrder, ...}]`
2. For each photo (up to 8): resolve bytes
   - If URL starts with `/objects/` → fetch from R2 using `getObjectUrl(path)` → fetch bytes
   - If URL is http(s) and domain is trusted → fetch directly
   - Encode as base64 and include in `photos[].base64`
3. Pass base64 to Python script; Python decodes inline — no network calls from Python

---

## Cleanup

The API endpoint must clean up temp files in a `finally` block:
```typescript
try {
  // ... generate
} finally {
  if (tmpPath) await fs.unlink(tmpPath).catch(() => {});
}
```

Timeout: 45 seconds for the Python subprocess. If exceeded, kill process + cleanup + return 504.

---

## API Endpoint

`GET /api/properties/:id/slides` — `requireAuth` + `checkPropertyAccess`

Response headers:
```
Content-Type: application/vnd.openxmlformats-officedocument.presentationml.presentation
Content-Disposition: attachment; filename="{property-name}-slides.pptx"
```

Admin UI trigger: `SlideDecksTab.tsx` → fetch blob → `URL.createObjectURL` → anchor click download.
