---
name: hplus-slide-mapping
description: Canonical H+ Analytics field → L+B PPTX shape name mapping for all 6 per-property slides. Use whenever generating, modifying, or debugging the PPTX slide generator for H+ Analytics properties. Contains the authoritative shape-name-to-data-field table for every slide in the template.
---

# H+ Analytics → L+B PPTX Shape Mapping

Template: `attached_assets/L+B_Property_Slides_1777637870265.pptx`
Output: 6 slides per property (template slides 1–6; slide 7 "The Ask" is EXCLUDED).
Slide size: 13.33" × 7.50"
Colors: dark bg `#1C2B1E`, accent green `#257D41`, sage `#7AAA88`, cream `#FFF9F5`, muted `#9FBCA4`

---

## Slide 1 — Property Spotlight (template index 0)

Primary spotlight view. Hero photo left, specs + vision right.

| Shape Name | H+ Field / Rule |
|---|---|
| Text 0 | `f"{status_label} Spotlight: {city}, {state}"` — e.g. "Acquisition Target: Belleayre, NY" |
| Text 1 | `f"Active {status_lower} — {county}, {state}"` |
| Text 2 | `"INVESTMENT SPOTLIGHT"` (keep) |
| Text 3 | `f"{property.name.upper()} · {type_label.upper()}"` — e.g. "SUL MONTE · HISTORIC STONE CHATEAU" |
| Text 4 | `cinematicCaption` (from vision generator) — e.g. "SALTWATER POOL · 61 PRIVATE ACRES" |
| Text 5 | `property.name` |
| Text 6 | Short tagline: first sentence of `property.description` (≤70 chars) |
| Text 7 | `"ASKING PRICE"` (keep) |
| Text 8 | `format_currency(property.purchasePrice)` |
| Text 9 | `f"Target Acquisition: {format_currency(property.purchasePrice * 0.85)}"` or actual target if available |
| Text 10 | `"Property Specs"` (keep) |
| Text 11 | `f"{property.roomCount} Keys / Guest Rooms"` |
| Text 12 | `f"ADR: {format_currency(property.startAdr)} per Key"` |
| Text 13 | `f"Stabilized Occupancy: {format_pct(property.maxOccupancy)}"` |
| Text 14 | `f"RevPAR: {format_currency(property.startAdr * property.maxOccupancy)}"` |
| Text 15 | `f"Property Type: {property.hospitalityType or property.businessModel}"` |
| Text 16 | `f"Asking: {format_currency(property.purchasePrice)}"` |
| Text 17 | `"The Vision"` (keep) |
| Text 18 | `visionHeadline` from vision generator |
| Text 19 *(vision bullet — NOT page number)* | `visionBullet1` from vision generator |
| Text 20 | `visionBullet2` from vision generator |
| Text 21 | `badgeText` from vision generator — e.g. "CURATED GUEST EXPERIENCE" |
| Text 22 | `descriptionParagraph` from vision generator (1–2 sentences) |
| Text 19 *(page — identified by "PAGE" in text)* | `"PAGE 1"` |
| Picture 68 | Hero photo bytes (prefer `isHero=true`, else `sortOrder` asc, largest) |
| Picture 2 | Secondary photo bytes (second-best from photo list) |

**Disambiguation of duplicate "Text 19":** Iterate all shapes; if name == "Text 19" AND current text contains "PAGE", update page number. Otherwise update vision bullet.

---

## Slide 2 — Alt View / Photo Gallery (template index 1)

Same property, different photo layout. Four column panels. Operational focus.

| Shape Name | H+ Field / Rule |
|---|---|
| Text 0 | `f"{property.name} — {city}, {state}"` |
| Text 1 | `f"{county} — {state}"` |
| Text 2 | `"INVESTMENT SPOTLIGHT"` (keep) |
| Text 3 | `f"{property.name.upper()} — {city.upper()} ESTATE"` |
| Text 5 | `property.name` |
| Text 6 | Second sentence of description or operational tagline |
| Text 10 | `"Property Specs"` (keep) |
| Text 11 | `f"Purchase Price: {format_currency(property.purchasePrice)}"` |
| Text 12 | `f"Renovation Budget: {format_currency(renovation_budget)}"` (from renovation_budget helper) |
| Text 13 | `f"Total Investment: {format_currency(property.purchasePrice + renovation_budget)}"` |
| Text 14 | `f"Stabilized Revenue (Yr 3): {format_currency(stable_year_revenue)}"` |
| Text 15 | `f"Projected NOI: {format_currency(stable_year_noi)}"` |
| Text 16 | `f"Est. IRR: {format_pct(irr)} over {horizon} years"` |
| Text 17 | `"The Vision"` (keep) |
| Text 18 | `f"Operational Model: {operational_model_text}"` |
| Text 19 *(bullet)* | Revenue strategy bullet |
| Text 20 | Programming / experience model bullet |
| Text 22 | Longer operational description paragraph |
| Text 19 *(PAGE)* | `"PAGE 2"` |
| Picture 35 | Photos[2] — left hero panel (top-left, ~770×544 px) |
| Picture 41 | Photos[3] — left secondary panel (bottom-left, ~764×331 px) |
| Image 12 | Photos[4] — wide top-right panel (~1050×287 px) |
| Image 26 | Photos[5] — center-right panel (~520×482 px) |
| Picture 66 | Photos[6] — far-right square panel (~489×489 px) |

**Note:** `Image 13`, `Image 22`, `Image 33`, `Image 44` are 9×9 px decorative bullet/icon elements — not photos. The original SKILL.md listed them incorrectly as panel photo targets.

---

## Slide 3 — Investment Model (template index 2)

Adapted from the Cartagena global expansion slide. Shows the L+B model applied to this property.

| Shape Name | H+ Field / Rule |
|---|---|
| Text 0 | `f"Investment Model: {property.name}"` |
| Text 1 | `f"The L+B model applied to {type_label} assets in {city}, {state}"` |
| Text 2 | `"INVESTMENT MODEL"` (replaces "GLOBAL EXPANSION") |
| Text 3 | `f"{city.upper()}, {state.upper()} · {type_label.upper()}"` |
| Text 5 | `"L+B\nModel"` (replaces "World\nHeritage") |
| Text 6 | `"THE CONCEPT"` (keep) |
| Text 7 | `investmentModelConcept` from vision generator |
| Text 8 | `f"Model: {business_model_label}"` — e.g. "Direct Ownership + Curated Programming" |
| Text 9 | `"Strategic Details"` (keep) |
| Text 10 | `f"Location: {city}, {state}"` |
| Text 11 | `f"Market: {market_insight}"` (from renovation benchmarks by region) |
| Text 12 | `f"Asset Type: {asset_type_label}"` |
| Text 13 | `f"Strategy: {strategy_text}"` |
| Text 14 | `f"Structure: {structure_text}"` |
| Text 15 | `"Why This Property?"` |
| Text 16 | `marketRationale` from vision generator |
| Text 17 | `"Why This Model?"` (keep) |
| Text 18 | `reason1_label` (e.g. "Rapid returns with controlled capital exposure") |
| Text 19 *(bullet)* | `reason1_detail` |
| Text 20 | `reason2_label` |
| Text 21 | `reason2_detail` |
| Text 22 | `reason3_label` |
| Text 23 | `reason3_detail` |
| Text 24 | `closingLine` — one-sentence investment thesis |
| Text 19 *(PAGE)* | `"PAGE 3"` |
| Image 5 | Hero photo (large left panel, 4.48"×6.23") |
| Image 9 | Secondary photo (center panel, 5.31"×6.44") |
| Image 24 | Tertiary photo (right panel, 3.23"×6.44") |

---

## Slide 4 — Market Context / Pipeline (template index 3)

Shows this property as primary card + up to 4 sibling properties from H+ Analytics.

Slide 4 has complex overlapping image/text card structure. Strategy: keep background/decorative shapes untouched. Find the text shapes by scan order and assign property data to them positionally.

| Shape Name | H+ Field / Rule |
|---|---|
| Text 0 | `f"Market Context: {state} Pipeline"` |
| Text 1 | `f"{property.name} and {n} related properties"` |
| Text 2 | `"PROPERTY PIPELINE"` |
| Text 3 | `f"{state.upper()} PORTFOLIO OVERVIEW"` |
| *(property card texts — 5 card slots)* | Card 1 = this property (prominent). Cards 2–5 = siblings sorted by purchasePrice desc, or "Coming Soon" if fewer siblings. Each card: name, city, price, type badge |
| Text 19 *(PAGE)* | `"PAGE 4"` |
| *(photo panels)* | Card 1 = hero photo of this property; cards 2–5 = hero photos of siblings (or placeholder) |

---

## Slide 5 — Financial Snapshot (template index 4)

Three tables + text boxes. All filled with real finance engine output.

### Table 4 (5r × 3c) — Transformation Plan, left=0.73" top=2.07"
| Row | Col 0 (Feature) | Col 1 (Existing) | Col 2 (Proposed) |
|---|---|---|---|
| 0 | Feature | Existing | Proposed |
| 1 | Guest Capacity | `f"{existing_guests} Guests"` | `f"{proposed_keys} Keys / {proposed_guests} Guests"` |
| 2 | Event Space | `existing_event_space` | `proposed_event_space` |
| 3 | Lodging | `existing_lodging` | `proposed_lodging` |
| 4 | Amenities | `existing_amenities` | `proposed_amenities` |

*Use `build_transformation_plan(property)` helper to derive existing/proposed values from property fields.*

### Table 3 (9r × 2c) — Stable Year Snapshot, left=8.24" top=1.16"
| Row | Col 0 | Col 1 |
|---|---|---|
| 0 | Item | Value |
| 1 | Occupancy | `format_pct(stable_occ)` |
| 2 | ADR | `format_currency(stable_adr)` |
| 3 | RevPAR | `format_currency(stable_revpar)` |
| 4 | Revenue | `format_currency(stable_revenue)` |
| 5 | Variable Costs | `format_currency(stable_opex)` |
| 6 | Gross Margin | `format_pct(gross_margin)` |
| 7 | EBITDA | `format_pct(ebitda_pct)` |
| 8 | (empty) | (empty) |

*Stable year = first year where revenueTotal > 0 and operationalMonthsInYear >= 12, or year index 2.*

### Table 10 (6r × 2c) — Financing Summary, left=8.24" top=4.52"
| Row | Col 0 | Col 1 |
|---|---|---|
| 0 | Financing Summary | (empty) |
| 1 | Purchase Price | `format_currency(purchasePrice)` |
| 2 | Renovation Budget | `format_currency(renovationBudget)` |
| 3 | Total Investment | `format_currency(purchasePrice + renovationBudget)` |
| 4 | `f"Loan Amount ({ltv_pct}%)"` | `format_currency(loanAmount)` |
| 5 | Annual Debt Service | `format_currency(annualDebtService)` |

### Text shapes
| Shape | Rule |
|---|---|
| TextBox 2 | `f"The Transformation Plan\n{transformation_description}"` (2–3 sentences from vision generator) |
| Rectangle 1 | `f"Snapshot of Stable Year ({stable_year_label})\n"` |
| TextBox 9 | `f"Key Investor Metrics*\nGross Margin: {format_pct(gross_margin)}\nEBITDA ({stable_year_label}): {format_pct(ebitda_pct)}\n* Projections for first full stabilized year"` |
| Text 19 *(PAGE)* | `"PAGE 5"` |

---

## Slide 6 — Income Statement (template index 5)

**Remove** Picture 4 and Picture 6. **Insert** two styled python-pptx tables at their exact positions.

### Left Table (replaces Picture 4): position left=0.57" top=2.70" width=5.84" height=3.79"
5-year IS summary. Columns: Year 1 … Year 5.
Rows: Revenue, Operating Expenses, NOI, Debt Service, Net Cash Flow, Cumulative Cash Flow.

### Right Table (replaces Picture 6): position left=7.02" top=0.56" width=5.91" height=6.18"
Key investor metrics. Two columns: Metric | Value.
Rows: IRR (5yr horizon), Equity Multiple, Stabilized NOI, Exit Cap Rate, Exit Value (Yr 5), Total Return.

### Table styling (both tables)
- Header row: fill `#1C2B1E`, font color white, bold, 9pt
- Data rows: alternating `#FFF9F5` / white, font color `#1C2B1E`, 8pt
- First column bold
- Left border on first column: `#257D41` 1pt

### Text shapes (keep, just update)
| Shape | Rule |
|---|---|
| Rectangle 1 | `f"5-Year Consolidated Pro Forma Income Statement\n{property.name}"` |
| Slide Number Placeholder 1 | `"6"` |
