# Replit Agent Brief — Phase 6 (Rebecca UI) & Phase 7 (Export UI)

> **Context:** All backend work for Phase 6 and 7 is done (CLI completed). You're building the frontend UI to surface these capabilities.
> Pull latest first: `git pull origin main`

---

## Phase 6: Rebecca Chatbot UI Enhancements

### What the backend already provides

The CLI enhanced `server/ai/rebecca-context-builder.ts` with:
- **Entity-aware property summaries** — quality tier, pricing model, seasonality, F&B capacity, event space, acreage, fee subordination, priority return
- **Proactive anomaly detection** — flags when F&B share is too low for the property type, or when event space is underutilized vs. revenue share
- The `buildRebeccaContext()` function returns a `RebeccaContextPayload` with `entitySummary`, `fieldContext`, `autoGreeting`, `entityName`, `entityType`, `entityId`

### What you need to build

#### 6A. Screen Context Awareness

Rebecca should know what page the user is on and what property/entity they're viewing.

**Where:** Find the Rebecca chatbot component (likely in `client/src/components/` — search for "rebecca", "chatbot", "assistant")

**What to add:**
1. Pass the current route/page context to the Rebecca API call:
   - Which page: "property-edit", "financial-statements", "scenario-comparison", "admin", etc.
   - Which property ID (if on a property page)
   - Which field is focused (if editing an assumption)
2. The backend already handles `RebeccaFieldContext` with `entityType`, `entityId`, `fieldKey`, `scenarioId`
3. When the user opens Rebecca while editing a property field, auto-populate the field context so Rebecca can give targeted advice

**Implementation pattern:**
```tsx
// In your app's route/page component, track context:
const rebeccaContext = useMemo(() => ({
  entityType: "property" as const,
  entityId: propertyId,
  fieldKey: focusedField, // e.g., "revShareFB" when that input is focused
  scenarioId: currentScenarioId,
  currentPage: location.pathname,
}), [propertyId, focusedField, currentScenarioId, location.pathname]);

// Pass to Rebecca component
<RebeccaChatbot context={rebeccaContext} />
```

#### 6B. Proactive Suggestions

When Rebecca's context payload includes anomaly observations (the `⚠️ Observations:` section in `entitySummary`), display them as suggestion chips or a banner in the chat.

**What to build:**
1. Parse the `entitySummary` for the `⚠️ Observations:` marker
2. Display observations as actionable suggestion cards:
   ```
   ┌──────────────────────────────────────────────┐
   │ 💡 Rebecca noticed:                          │
   │                                               │
   │ F&B revenue share is only 15% — research     │
   │ suggests 25-35% for properties with F&B      │
   │ programs.                                     │
   │                                               │
   │ [Run Research]  [Adjust F&B Share]  [Dismiss] │
   └──────────────────────────────────────────────┘
   ```
3. "Run Research" navigates to the research trigger for that property
4. "Adjust F&B Share" navigates to the revenue assumptions section with that field highlighted

#### 6C. Enhanced Greeting

When a user opens Rebecca on a property page, show a contextual greeting instead of a generic one:

```
"Hi! I'm looking at {propertyName} — a {qualityTier} {businessModel} in {location}. 
 It has {roomCount} rooms with {fbVenues} F&B venues. What would you like to explore?"
```

The `autoGreeting` field in `RebeccaContextPayload` may already provide this — check if it's being used in the chat UI.

---

## Phase 7: Export UI Enhancements

### What the backend already provides

The CLI enhanced `server/report/server-export-data.ts` with:
- **Property profile section** in exports — includes quality tier, business model, pricing model, descriptors, fee structure
- **Deferred fees rows** — shown when fee subordination is active
- **Owner priority return** and **fee subordination status** in export data
- Existing generators: `server/routes/format-generators/pptx-generator.ts`, `docx-generator.ts`
- Existing PDF pipeline: `server/routes/premium-pdf-pipeline.ts`, `server/pdf/`

### What you need to build

#### 7A. Export Scope Selector

**Where:** The export UI (search for "export", "download", "report" in client components)

**What to add:**
A scope selector that lets users choose what to export:
```
┌──────────────────────────────────────────────┐
│ Export Report                                 │
│                                               │
│ Scope:                                        │
│ ○ Single Property    [Select Property ▾]      │
│ ○ Portfolio (all properties)                  │
│ ○ Management Company                          │
│ ○ Consolidated (company + all properties)     │
│                                               │
│ Format:                                       │
│ ○ PDF  ○ PowerPoint  ○ Word  ○ Excel/CSV     │
│                                               │
│ Detail Level:                                 │
│ ○ Executive Summary (key metrics only)        │
│ ○ Full Report (all statements + details)      │
│                                               │
│ Include:                                      │
│ ☑ Property Profile                            │
│ ☑ Income Statement                            │
│ ☑ Cash Flow Statement                         │
│ ☑ Balance Sheet                               │
│ ☐ Sensitivity Analysis                        │
│ ☐ Research Summary                            │
│                                               │
│                          [Generate Report]    │
└──────────────────────────────────────────────┘
```

The backend already supports `reportScope: "all" | "income" | "cashflow" | "balance"` and `version: "full" | "short"`.

#### 7B. Property Profile in PDF/PPTX

The export data now includes a "Property Profile" section. Make sure the PDF and PPTX renderers handle it:

1. **PDF** (`server/pdf/section-renderers.tsx`): Add a renderer for the profile section — display as a key-value table, not a financial table
2. **PPTX** (`server/routes/format-generators/pptx-generator.ts`): Add a title slide with property profile data
3. **DOCX** (`server/routes/format-generators/docx-generator.ts`): Add a property overview section at the top

The profile section has `years: ["Value"]` (single column) and rows like:
```
{ category: "Quality Tier", values: ["luxury"], indent: 1 }
{ category: "Business Model", values: ["hotel"], indent: 1 }
```

These should render as a simple two-column table (Label | Value), not the multi-year financial table format.

#### 7C. Seasonality Visualization in Exports

If a property has a seasonality profile, include a 12-month bar chart in the export showing the seasonal factors. The data is available as `property.seasonalityProfile: number[12]`.

Use the existing `server/svg-charts.ts` for chart generation in PDF exports.

---

## Testing

After each task: `npm run test` — engine tests must continue passing.

## Priority Order
1. **6A** — Screen context (highest UX impact)
2. **6B** — Proactive suggestions (core product value)
3. **7A** — Export scope selector
4. **7B** — Property profile in exports
5. **6C** — Enhanced greeting (polish)
6. **7C** — Seasonality charts (nice-to-have)
