# Task: Rebuild the ICP Definition Page (/company/icp-definition)

## What Happened

Claude Code built a new server-side ICP auto-generation engine. The ICP (130+ fields) now generates itself from the existing portfolio properties — no manual entry needed. The old 4-tab form with 130 fields must be replaced with a simple, graphics-rich page.

## New API Endpoints (already built, ready to call)

```
POST /api/icp/generate          -> Full generation (portfolio + AI qualitative sections + essay)
POST /api/icp/generate-quick    -> Instant (portfolio analysis only, no AI, zero cost)
GET  /api/icp/portfolio-analysis -> Raw portfolio analysis stats
GET  /api/icp/narrative          -> Formatted ICP narrative for display
```

Response shape from both generate endpoints:

```typescript
{
  config: {
    roomsMin: number, roomsMax: number, roomsSweetSpotMin: number, roomsSweetSpotMax: number,
    adrMin: number, adrMax: number, occupancyMin: number, occupancyMax: number,
    acquisitionMin: number, acquisitionMax: number, acquisitionTargetMin: number, acquisitionTargetMax: number,
    totalInvestmentMin: number, totalInvestmentMax: number, renovationMin: number, renovationMax: number,
    fbShareMin: number, fbShareMax: number, eventsShareMin: number, eventsShareMax: number,
    totalAncillaryMin: number, totalAncillaryMax: number,
    baseMgmtFeeMin: number, baseMgmtFeeMax: number, incentiveFeeMin: number, incentiveFeeMax: number,
    exitCapRateMin: number, exitCapRateMax: number, targetIrr: number,
    equityMultipleMin: number, equityMultipleMax: number, holdYearsMin: number, holdYearsMax: number,
    landAcresMin: number, landAcresMax: number, builtSqFtMin: number, builtSqFtMax: number,
    fbRating: number, // 1-5
    pool: "must"|"major"|"nice"|"no",
    spa: "must"|"major"|"nice"|"no",
    // ... ~27 amenity priority fields total
    // ... 130 total fields
    _generated: boolean,
    _generatedAt: string, // ISO date
    _source: "portfolio" | "portfolio+ai",
    _portfolioAnalysis: { /* see portfolioAnalysis below */ },
    _definition: string, // the ICP essay (markdown)
  },
  descriptive: {
    propertyTypes: string,
    fbLevel: string,
    locationCharacteristics: string,
    locationDetails: string,
    conditionNotes: string,
    groundsTopography: string,
    vendorServices: string,
    regulatoryNotes: string,
    exclusions: string,
  },
  portfolioAnalysis: {
    propertyCount: number,
    rooms: { min: number, max: number, median: number, mean: number },
    adr: { min: number, max: number, median: number, mean: number },
    occupancy: { min: number, max: number, median: number, mean: number },
    purchasePrice: { min: number, max: number, median: number, mean: number },
    acreage: { min: number, max: number, median: number, mean: number } | null,
    buildingSqft: { min: number, max: number, median: number, mean: number } | null,
    fbSeats: { min: number, max: number, median: number, mean: number } | null,
    eventSpaceSqft: { min: number, max: number, median: number, mean: number } | null,
    qualityTiers: Record<string, number>,
    businessModels: Record<string, number>,
    countries: string[],
    regions: string[],
    dominantQualityTier: string,
    dominantBusinessModel: string,
    isInternational: boolean,
    hasFB: boolean,
    hasEvents: boolean,
    fbRating: number,
  },
  generatedAt: string,
  source: "portfolio" | "portfolio+ai",
  fieldsFromPortfolio: number,
  fieldsFromDefaults: number,
  fieldsFromAi: number,
  saved: true,
  icpEssay: string | null, // only on full /generate
}
```

## Page Layout — Replace CompanyIcpDefinition.tsx

Delete the current 4-tab form. Build a single-page layout with these sections:


### Header

```
ICP Definition — {companyName}
Subtitle: "Auto-generated from your portfolio of {propertyCount} properties"
Back link: /company/assumptions

Actions:
  [lightning icon Quick Generate]  [sparkle icon Generate with AI]  [Export dropdown]
```

- "Quick Generate" calls POST /api/icp/generate-quick (instant, shows spinner for 1 second)
- "Generate with AI" calls POST /api/icp/generate (shows spinner for 5-15 seconds, costs ~$0.02)
- After either completes: invalidate ["global-assumptions"] query, show success toast
- If no properties exist: disable both buttons, show message "Add at least one property to generate your ICP"


### Status Card (always visible at top)

Show generation status from global.icpConfig._generated, ._generatedAt, ._source:

If generated:
```
checkmark ICP auto-generated from {portfolioAnalysis.propertyCount} properties
  Last generated: {_generatedAt formatted}
  Source: {_source === "portfolio+ai" ? "Portfolio + AI Enhancement" : "Portfolio Analysis"}
  Coverage: {fieldsFromPortfolio} from portfolio | {fieldsFromAi} from AI | {fieldsFromDefaults} from defaults
```

If stale (any property's updatedAt is newer than _generatedAt):
Add amber warning: "warning Portfolio changed since last generation. [Regenerate]"

If never generated:
```
info ICP has not been generated yet. Click "Generate" to auto-build from your portfolio.
```


### Section 1: Investment Thesis (the essay)

- Read from global.icpConfig._definition (markdown string)
- Render as formatted markdown (use existing markdown renderer or simple dangerouslySetInnerHTML with a markdown library)
- Show "Edit" button that opens textarea for manual editing. "Save" saves back via PUT /api/global-assumptions with { icpConfig: { ...existing, _definition: newText } }
- If no essay: show call-to-action "Click 'Generate with AI' to create an investor-ready ICP narrative"
- This section should look premium — it goes into investor presentations


### Section 2: Portfolio Snapshot (read-only cards)

A visual grid showing the portfolio analysis. Use the data from global.icpConfig._portfolioAnalysis:

Row 1:
- Card: {propertyCount} Properties (with a small icon)
- Card: {rooms.min}-{rooms.max} Rooms (subtitle: median {rooms.median})
- Card: ${adr.min}-${adr.max} ADR (subtitle: median ${adr.median})

Row 2:
- Card: ${purchasePrice.min formatted}-${purchasePrice.max formatted} Acquisition
- Card: {dominantQualityTier} ({qualityTiers percentage breakdown})
- Card: {fbRating}/5 F&B Rating (with a visual bar)

Below the cards, show a "Markets" row with location chips:
[Catskills, NY] [Medellin, CO] [Park City, UT]

And model breakdown: Hotel: 60% | Lodge: 40%


### Section 3: Target Parameters (editable overrides, collapsible)

Show the key derived parameters grouped into cards. Default collapsed, user can expand to review/override.

Each field shows:
- Label
- Value (from global.icpConfig.fieldName)
- Small gray "derived" tag if auto-generated, or "override" tag in blue if user manually changed it

Card: Target Property
- Rooms: {roomsMin}-{roomsMax} (sweet spot {roomsSweetSpotMin}-{roomsSweetSpotMax})
- Land: {landAcresMin}-{landAcresMax} acres
- Building: {builtSqFtMin}-{builtSqFtMax} sqft
- ADR: ${adrMin}-${adrMax}
- Occupancy: {occupancyMin}%-{occupancyMax}%
- F&B Rating: {fbRating}/5

Card: Financial Targets
- Acquisition: ${acquisitionMin}-${acquisitionMax}
- Target Range: ${acquisitionTargetMin}-${acquisitionTargetMax}
- Total Investment: ${totalInvestmentMin}-${totalInvestmentMax}
- Renovation: ${renovationMin}-${renovationMax}
- Target IRR: {targetIrr}%
- Equity Multiple: {equityMultipleMin}x-{equityMultipleMax}x
- Hold Period: {holdYearsMin}-{holdYearsMax} years
- Exit Cap Rate: {exitCapRateMin}%-{exitCapRateMax}%

Card: Revenue Mix
- F&B Share: {fbShareMin}%-{fbShareMax}%
- Events Share: {eventsShareMin}%-{eventsShareMax}%
- Total Ancillary: {totalAncillaryMin}%-{totalAncillaryMax}%
- Base Mgmt Fee: {baseMgmtFeeMin}%-{baseMgmtFeeMax}%
- Incentive Fee: {incentiveFeeMin}%-{incentiveFeeMax}%

Card: Must-Have Amenities
Show amenities as colored tag chips based on their priority value:
- "must" = green chip with checkmark
- "major" = blue chip
- "nice" = gray chip (only show if section is expanded)
- "no" = don't show

Amenity keys: pool, spa, sauna, steamRoom, coldPlunge, yogaStudio, gym, tennis, pickleball, hikingTrails, horseFacilities, garden, vineyard, casitas, barn, glamping, firePit, wineCellar, outdoorKitchen, chapel, gameRoom, library, hotTub, secondPool, basketball, greenhouse

User can click a chip to cycle its priority: must -> major -> nice -> no -> must


### Section 4: Qualitative Sections (expandable accordion)

Show each of the 9 descriptive text sections from global.icpDescriptive:

Each is an expandable accordion row:
- Property Types
- F&B Operations Level
- Location Characteristics
- Location Details (Markets)
- Condition Requirements
- Grounds & Topography
- Vendor Services
- Regulatory Notes
- Exclusions

When expanded, show the text with an "Edit" button. If user edits, save back to icpDescriptive via PUT /api/global-assumptions.

If sections are empty (ICP not generated yet), show placeholder: "Generate ICP to populate this section"


### Section 5: Data Sources (keep existing)

Keep the current data sources tab content (custom sources, research meta). Move it here as a collapsible section at the bottom. Import IcpDataSourcesTab from ./icp/IcpDataSourcesTab.


## Auto-Generation on Page Load

Add this logic to the page:

```typescript
useEffect(() => {
  if (!global || properties.length === 0) return;
  const generatedAt = (global as any)?.icpConfig?._generatedAt;
  
  // Never generated? Auto-generate (quick, free)
  if (!generatedAt) {
    fetch("/api/icp/generate-quick", { method: "POST" })
      .then(r => r.json())
      .then(() => queryClient.invalidateQueries({ queryKey: ["global-assumptions"] }));
    return;
  }
  
  // Check if any property was modified after generation
  const genDate = new Date(generatedAt);
  const portfolioChanged = properties.some(p => new Date(p.updatedAt) > genDate);
  if (portfolioChanged) {
    // Show stale indicator but don't auto-regenerate (user decides)
    setIsStale(true);
  }
}, [global, properties]);
```


## Files to Modify

| File | Action |
|---|---|
| client/src/pages/CompanyIcpDefinition.tsx | REWRITE — new single-page layout as described above |
| client/src/pages/icp/IcpProfileTab.tsx | DELETE — 130-field form no longer needed |
| client/src/pages/icp/IcpMarketContextTab.tsx | DELETE — portfolio snapshot replaces this |
| client/src/pages/icp/IcpIndustryStandardsTab.tsx | DELETE — merged into main page |
| client/src/pages/icp/IcpUIComponents.tsx | DELETE — only used by deleted tabs |
| client/src/pages/icp/IcpDataSourcesTab.tsx | KEEP — import into section 5 |
| client/src/pages/Icp.tsx | DELETE — change /icp route to Redirect in App.tsx |
| client/src/pages/IcpStudio.tsx | DELETE — change /admin/icp-studio route to Redirect in App.tsx |
| client/src/App.tsx | Update routes: remove Icp and IcpStudio lazy imports, change their Route entries to Redirect to="/company/icp-definition" |

## Files to NOT Touch

- client/src/components/admin/icp-types.ts — keep (types still used)
- client/src/components/admin/icp-defaults.ts — keep (fallback defaults)
- client/src/components/admin/icp-config.ts — keep (essay generation, exports)
- client/src/pages/CompanyAssumptions.tsx — keep as-is (already has the "ICP Definition" link button)
- Everything in server/ — already built by Claude Code, do not modify

## Design Notes

- This page should feel premium and investor-ready — the ICP essay section especially
- Use the app's existing card/accordion/collapsible components
- The portfolio snapshot cards should be visually rich with mini progress bars or visual indicators
- The amenity chips should be colorful and tappable
- The overall vibe: "your AI built this for you, here's what it found, override anything you want"
- Keep the export functionality (PDF/PPTX) — move the ExportMenu into the header actions
- Every section should have a premium feel. This is a $50K+ financial platform.
