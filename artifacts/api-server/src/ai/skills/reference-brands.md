# Reference Brands — AI Skill

## What this table is

`reference_brands` is a curated database of **real hospitality brands** that operate in the boutique, lifestyle, and experiential space. These brands serve as **directional orientation points** — not benchmarks, not templates, not targets — for understanding the range of possibilities when scaling a boutique lifestyle operator.

The table is populated and refreshed exclusively by the Analyst via LLM + web research. Admins cannot manually edit rows. Each refresh **fully replaces** the table.

## What this table is NOT

- **Not a benchmark set.** Unlike `capital_raise_benchmarks` or `exit_multiples`, which provide tight financial ranges for underwriting, this table contains real-world brand snapshots that vary enormously in scale, niche, geography, and business model. A single "average" would be meaningless.
- **Not a competitive set.** The brands included operate across very different niches (luxury adventure, co-living, micro-hotels, glamping, LGBTQ+ boutique, museum hotels, etc.). The operator client is not competing with all of them.
- **Not audited financial data.** All metrics are orientation-grade, sourced from public filings, press releases, analyst reports, and industry publications. Treat all numbers as directional ranges, not precise actuals.

## Interpreting wide variation — this is normal

Variation across rows is **intentional and expected**:

| Metric | Low end | High end | Why the spread is valid |
|---|---|---|---|
| ADR | $85 (Selina co-living) | $1,800 (Hästens sleep spa) | Different niches, value propositions, and guest willingness-to-pay |
| Property count | 1–2 (Desire, Hästens) | 150+ (Selina) | Asset-light vs. asset-heavy; early vs. mature brand |
| Occupancy % | 60–65% (Selina, Hästens) | 82–87% (citizenM, Zoku) | Business mix, segment demand, operational maturity |
| Revenue range | $3M (small flagship) | $120M (large multi-property) | Scale, coverage, F&B mix |

Do **not** average across rows. Do **not** cite a single row as "the benchmark." Instead:

- Use the spread to illustrate what's possible across niches.
- Use individual rows as directional reference when the client brand matches that niche.
- Highlight outliers explicitly: if a brand is in the $1,800 ADR segment, note it's a niche ultra-luxury outlier.

## The 6 founding brands (from the client slide deck)

These 6 brands were specified by the client as particularly relevant reference points. The Analyst should verify and enrich their data on each refresh:

1. **Axel Hotels** — LGBTQ+ boutique lifestyle, ~11 properties, Spain/Europe-focused, ADR ~$185–200, Occ ~82%
2. **Mama Shelter** — Quirky design-led with strong F&B, ~25 properties, Europe/global, ADR ~$145–165, Occ ~78–80%
3. **Desire Resorts** — Adults-only/lifestyle, ~2 properties, Mexico/Caribbean, ADR ~$320–380 (all-inclusive)
4. **Selina** — Co-living/co-working hybrid, 150+ locations, global, ADR ~$75–95, Occ ~60–65%
5. **Eleven Experience** — Luxury adventure lodges, ~9 properties, remote locations, ADR ~$600–700
6. **Yotel** — Tech-forward micro-hotel, ~22 properties, airports/cities, ADR ~$170–195, Occ ~78–82%

## What to include on each refresh

For each brand row, the Analyst should provide:

- **brandName** — official brand name
- **niche** — 2–5 word positioning label (e.g., "LGBTQ+ boutique lifestyle")
- **positioningSummary** — 1–2 sentence brand DNA description
- **guestSegment** — primary guest profiles
- **propertyCount** — number of properties currently operating
- **keyCountMin / keyCountMax** — typical room/key count range per property
- **geographicFocus** — primary markets
- **adrUsd** — approximate average daily rate in USD (orientation-grade)
- **occupancyPct** — approximate occupancy (0.0–1.0)
- **revparUsd** — RevPAR = ADR × Occupancy (orientation-grade)
- **revenueRangeLowUsd / revenueRangeHighUsd** — estimated annual brand revenue range
- **ownershipModel** — how the brand owns/operates (franchise, management, ownership, lease)
- **acquisitionContext** — any notable M&A, PE backing, IPO history
- **description** — 2–4 sentence narrative covering brand origin, signature features, and what makes it relevant as a reference
- **dataYear** — the year the data primarily reflects (typically current year)
- **sourceUrls** — array of URLs cited

## How many brands to include

Target **15–25 brands** per refresh. Always include the 6 founding brands above. Fill the remainder with additional boutique/lifestyle/experiential brands that share profile characteristics: independent spirit, design-forward, strong F&B identity, experiential programming, or tech-enabled operations.

Exclude:
- Large chain brands (Marriott, Hilton, IHG full portfolios)
- Pure budget/economy brands (unless they have a clear lifestyle positioning)
- Brands with fewer than 1 operating property

## Citing sources

The Analyst must cite at least 3 independent sources per refresh run. Acceptable sources:
- Brand official websites and press pages
- Hospitality trade publications (Skift, Hospitality Net, Hotel Management, CoStar)
- Financial filings for publicly traded brands (SLNA, etc.)
- PE fund or M&A transaction disclosures
- Industry analyst reports (JLL, CBRE, STR)

## Data caveats to surface

When returning brand data, the Analyst should note:
- ADR/RevPAR figures are estimates from public sources and may lag 6–18 months
- Occupancy data for private brands is often not publicly disclosed; use industry estimates
- Revenue ranges are orientation-grade and should be labeled as such in any consumer-facing output
- Brand portfolios change frequently; property counts may shift between research runs

## Refresh behavior

This table uses **full-replace** semantics: every refresh deletes all existing rows and inserts a fresh set. There is no diff/commit review step. The Analyst auto-commits on successful completion. This is consistent with the app-wide "no manual edits" policy for Analyst-managed tables.
