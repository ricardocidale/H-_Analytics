# Replit Brief: ICP Page Simplification

## Context

The ICP (Ideal Customer/Property Profile) page currently has 130+ manually-editable fields across 4 tabs. No user will ever fill these in. A new server-side engine (`POST /api/icp/generate`) auto-generates the entire ICP from the existing portfolio — all 130 numeric fields + 9 qualitative text sections + investor-ready essay.

## What Changed (Server — Already Built by Claude Code)

- `POST /api/icp/generate` — Full generation: portfolio analysis + AI-written qualitative sections (~$0.02 per call)
- `POST /api/icp/generate-quick` — Instant: portfolio-only, no AI, zero cost
- `GET /api/icp/portfolio-analysis` — Raw portfolio analysis data
- `GET /api/icp/narrative` — Full ICP narrative formatted for research prompts

All results auto-save to `global_assumptions.icpConfig` and `global_assumptions.icpDescriptive`.

## New ICP Page Design

**Replace the current 4-tab form with a single-page layout:**

### Header Section
```
ICP Definition — [Company Name]
[Generate from Portfolio]  [Generate with AI]  [Export PDF ▾]
```
- "Generate from Portfolio" → calls `POST /api/icp/generate-quick` (instant, free)
- "Generate with AI" → calls `POST /api/icp/generate` (5-10 seconds, ~$0.02)
- Both buttons show a loading spinner while generating
- After generation, show a success toast: "ICP generated from X properties"

### Status Card (top)
```
┌─────────────────────────────────────────────────────┐
│ ✓ ICP auto-generated from 5 properties             │
│   Last generated: April 14, 2026 at 3:45 PM        │
│   Source: Portfolio + AI Enhancement                │
│   Fields from portfolio: 68 | From AI: 10 | Defaults: 52 │
│                                                      │
│   ⚠ ICP may be stale — 2 properties added since    │
│   last generation. [Regenerate]                      │
└─────────────────────────────────────────────────────┘
```
Show stale warning when properties have been added/removed/modified since `_generatedAt`.

### Section 1: Investment Thesis (the essay)
- Render the `icpConfig._definition` markdown as formatted text
- Show an "Edit" button that opens a textarea for manual editing
- This is the section that goes into investor presentations
- If no essay exists, show "Click 'Generate with AI' to create an investor-ready ICP narrative"

### Section 2: Portfolio Summary (read-only, from portfolio analysis)
```
┌────────────────────────────────────────────────┐
│ Portfolio Snapshot                              │
│                                                │
│ Properties: 5          Rooms: 5–20 (median 12) │
│ ADR: $200–$450        Occupancy: 55%–80%       │
│ Acquisition: $1.2M–$5M                        │
│ Markets: Catskills NY, Medellín CO, Utah       │
│ Quality: Luxury (80%), Premium (20%)           │
│ Models: Hotel (60%), Lodge (40%)               │
│ F&B Rating: 4/5                                │
└────────────────────────────────────────────────┘
```
Data comes from `_portfolioAnalysis` stored in icpConfig.

### Section 3: Key Parameters (collapsible, editable overrides)
Show the most important derived parameters in an organized grid. Each field shows:
- Current value (from auto-generation)
- A small "🔒 derived" or "✏️ override" indicator
- If user edits a value, it gets "pinned" — auto-generation won't overwrite it

**Group into cards:**

**Target Property Profile:**
- Rooms: min–max (sweet spot)
- Land: min–max acres  
- Building: min–max sqft
- ADR: min–max
- Occupancy: min–max %

**Financial Targets:**
- Acquisition: min–max (target range)
- Total Investment: min–max
- Target IRR: %
- Equity Multiple: min–max x
- Hold Period: min–max years

**Revenue Mix:**
- F&B Share: min–max %
- Events Share: min–max %
- Total Ancillary: min–max %
- Mgmt Fee: base + incentive ranges

**Must-Have Amenities:**
Show only "must" and "major" amenities as tag chips:
`[Pool ✓] [Spa ✓] [Sauna ✓] [Cold Plunge ✓] [Outdoor Kitchen ✓] [Barn ✓]`
Click a chip to cycle: must → major → nice → no

### Section 4: Qualitative Sections (collapsible, editable)
Show each of the 9 descriptive text sections as expandable cards:
- Property Types
- F&B Level
- Location Characteristics
- Location Details (markets)
- Condition Notes
- Grounds & Topography
- Vendor Services
- Regulatory Notes
- Exclusions

Each shows AI-generated text with an "Edit" button. If user edits, the edit is preserved on next regeneration.

### Section 5: Data Sources & Research Config
Keep the existing "Data Sources" tab content here (custom sources, research meta).

## What to REMOVE

1. **Delete the 4-tab layout** (ICP Profile, Market Context, Industry Standards, Data Sources)
2. **Delete the 130-field form** — users should never manually enter roomsMin, bathroomsMax, poolSqFt, etc. Those are auto-derived.
3. **Delete the IcpProfileTab, IcpMarketContextTab, IcpIndustryStandardsTab components** — or repurpose their content into the simpler read-only sections above
4. **Delete the separate Icp.tsx page** at `/icp` — merge into the one page at `/company/icp-definition`
5. **Delete IcpStudio.tsx** at `/admin/icp-studio` — admin doesn't need a separate studio when ICP auto-generates

## Auto-Trigger Logic

Add to the ICP page:
```typescript
// On mount, check if ICP needs regeneration
useEffect(() => {
  const generatedAt = icpConfig?._generatedAt;
  const portfolioModified = properties.some(p => 
    new Date(p.updatedAt) > new Date(generatedAt || 0)
  );
  if (!generatedAt || portfolioModified) {
    // Auto-generate (quick/free) on first visit or when stale
    fetch("/api/icp/generate-quick", { method: "POST" })
      .then(r => r.json())
      .then(data => queryClient.invalidateQueries({ queryKey: ["global-assumptions"] }));
  }
}, []);
```

## Key Files to Modify

| File | Action |
|---|---|
| `client/src/pages/CompanyIcpDefinition.tsx` | REWRITE — new single-page layout |
| `client/src/pages/Icp.tsx` | DELETE or redirect to `/company/icp-definition` |
| `client/src/pages/IcpStudio.tsx` | DELETE or redirect |
| `client/src/pages/icp/IcpProfileTab.tsx` | DELETE (fields auto-generated) |
| `client/src/pages/icp/IcpMarketContextTab.tsx` | SIMPLIFY — read-only portfolio summary |
| `client/src/pages/icp/IcpIndustryStandardsTab.tsx` | DELETE or merge into main page |
| `client/src/pages/icp/IcpDataSourcesTab.tsx` | Keep, move into section 5 |

## API Endpoints Available

```
POST /api/icp/generate          — Full (portfolio + AI), saves to DB
POST /api/icp/generate-quick    — Instant (portfolio only), saves to DB
GET  /api/icp/portfolio-analysis — Raw portfolio stats
GET  /api/icp/narrative          — Formatted narrative for research prompts

Response shape for generate endpoints:
{
  config: { ...130 numeric fields },
  descriptive: { propertyTypes, fbLevel, locationDetails, ... },
  portfolioAnalysis: { propertyCount, rooms, adr, ... },
  generatedAt: "2026-04-14T...",
  source: "portfolio+ai",
  fieldsFromPortfolio: 68,
  fieldsFromDefaults: 52,
  fieldsFromAi: 10,
  saved: true,
  icpEssay: "..." // only on full generate
}
```

## Why This Matters

The ICP feeds EVERY research prompt — company and property. Before this change, the LLM got "No ICP configuration defined" because nobody filled in 130 fields. Now it auto-generates from the portfolio and the LLM gets a rich, specific context like:

> "HBG targets 5–20 room luxury estate conversions in rural/resort markets. Acquisition $1.2M–$5.5M. Must-have: pool, spa, sauna, cold plunge, commercial kitchen. ADR $200–$450. F&B 25–50% of revenue. Markets: Catskills NY, Medellín CO, Park City UT. Hold 7–10 years, target 18% IRR."

This makes the difference between generic industry ranges and ranges calibrated to Ricardo's actual business.
