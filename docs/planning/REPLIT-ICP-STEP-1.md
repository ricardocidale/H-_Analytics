# Step 1: Rewrite CompanyIcpDefinition.tsx

## What to do

Rewrite client/src/pages/CompanyIcpDefinition.tsx to replace the current 4-tab form (130 manual fields) with a simple single-page layout. The server now auto-generates the entire ICP from the portfolio.

DO NOT touch any server files. DO NOT touch CompanyAssumptions.tsx. Only modify CompanyIcpDefinition.tsx in this step.

## New API Endpoints (already built, just call them)

```
POST /api/icp/generate          -> Full generation (portfolio + AI, 5-15 sec, ~$0.02)
POST /api/icp/generate-quick    -> Instant (portfolio only, no AI, free)
```

Both return the same shape and auto-save to global_assumptions. After calling either, invalidate the ["global-assumptions"] query key to refresh the page.

The generated data lives in global.icpConfig (numeric fields + metadata) and global.icpDescriptive (text sections). Key metadata fields inside icpConfig:
- _generated: boolean
- _generatedAt: string (ISO date)
- _source: "portfolio" | "portfolio+ai"
- _definition: string (the ICP essay, markdown)
- _portfolioAnalysis: object with propertyCount, rooms, adr, purchasePrice, qualityTiers, businessModels, countries, regions, dominantQualityTier, fbRating, etc. Each numeric field has { min, max, median, mean }.

## Page Layout

### Header
- Title: "ICP Definition — {companyName}"
- Subtitle: "Auto-generated from your portfolio"
- Back link to /company/assumptions
- Two action buttons: "Quick Generate" (calls /api/icp/generate-quick) and "Generate with AI" (calls /api/icp/generate)
- Keep the existing ExportMenu (PDF/PPTX)
- Show spinner on the button while generating. Show success toast when done.
- If properties.length === 0, disable both buttons and show "Add at least one property first"

### Status Card (top of page, always visible)
If icpConfig._generated is true:
- Green checkmark, "ICP generated from {_portfolioAnalysis.propertyCount} properties"
- Show _generatedAt formatted as readable date
- Show _source as "Portfolio + AI" or "Portfolio Only"

If icpConfig._generated is falsy:
- Info style card: "ICP has not been generated yet. Click Generate to build from your portfolio."

### Section 1: Investment Thesis
- Render icpConfig._definition as formatted markdown text
- If no _definition exists, show placeholder: "Click 'Generate with AI' to create an investor-ready ICP narrative"
- Add Edit/Save buttons for manual editing (save via PUT /api/global-assumptions with updated icpConfig._definition)
- This section should look premium — large text, good typography

### Section 2: Portfolio Snapshot (read-only)
A grid of 6 stat cards using _portfolioAnalysis data:
1. Properties: {propertyCount}
2. Rooms: {rooms.min}-{rooms.max} (median {rooms.median})
3. ADR: ${adr.min}-${adr.max} (median ${adr.median})
4. Acquisition: formatted purchase price range
5. Quality: {dominantQualityTier} with tier breakdown
6. F&B Rating: {fbRating}/5

Below cards show location chips from _portfolioAnalysis.regions and model breakdown from _portfolioAnalysis.businessModels.

### Section 3: Key Parameters (collapsible, default collapsed)
Show derived ICP parameters in organized cards. Read from icpConfig fields directly.

Card "Target Property": roomsMin/Max, roomsSweetSpotMin/Max, landAcresMin/Max, builtSqFtMin/Max, adrMin/Max, occupancyMin/Max, fbRating

Card "Financial Targets": acquisitionMin/Max, acquisitionTargetMin/Max, totalInvestmentMin/Max, renovationMin/Max, targetIrr, equityMultipleMin/Max, holdYearsMin/Max, exitCapRateMin/Max

Card "Revenue Mix": fbShareMin/Max, eventsShareMin/Max, totalAncillaryMin/Max, baseMgmtFeeMin/Max, incentiveFeeMin/Max

Card "Amenities": Show amenity priority fields as colored chips. Green = "must", blue = "major", gray = "nice", hidden = "no". Amenity keys: pool, spa, sauna, steamRoom, coldPlunge, yogaStudio, gym, tennis, pickleball, hikingTrails, garden, vineyard, casitas, barn, glamping, firePit, wineCellar, outdoorKitchen, hotTub, horseFacilities

### Section 4: Qualitative Sections (accordion)
Show 9 expandable sections from global.icpDescriptive:
- propertyTypes (label: "Property Types")
- fbLevel (label: "F&B Operations")
- locationCharacteristics (label: "Location Characteristics")
- locationDetails (label: "Target Markets")
- conditionNotes (label: "Condition Requirements")
- groundsTopography (label: "Grounds & Topography")
- vendorServices (label: "Vendor Services")
- regulatoryNotes (label: "Regulatory Notes")
- exclusions (label: "Exclusions")

Each shows the text content when expanded. If empty, show "Generate ICP to populate."

### Auto-Generate on Mount
```typescript
useEffect(() => {
  if (!global || properties.length === 0) return;
  const generatedAt = (global as any)?.icpConfig?._generatedAt;
  if (!generatedAt) {
    // First visit, auto-generate (quick, free)
    fetch("/api/icp/generate-quick", { method: "POST" })
      .then(r => r.json())
      .then(() => queryClient.invalidateQueries({ queryKey: ["global-assumptions"] }));
  }
}, [global, properties]);
```

## Imports you can still use
- useGlobalAssumptions, useUpdateAdminConfig, useProperties from @/lib/api
- PageHeader, Card, Button, etc from existing UI components
- Tabs/TabsList/TabsTrigger/TabsContent if you want collapsible sections
- Collapsible from @/components/ui/collapsible if available, or Accordion
- ExportMenu, pdfAction, pptxAction from @/components/ui/export-toolbar
- Keep the existing export handlers (handleExportPDF, handleExportPPTX)

## After completing this step
Commit and push with message: "Rebuild ICP page with auto-generation from portfolio"
