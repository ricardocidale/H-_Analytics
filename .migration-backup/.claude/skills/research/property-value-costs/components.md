# Property Market Research Components

## Architecture
PropertyMarketResearch page is split into a ~160-line shell + extracted components in `client/src/components/property-research/`.

## File Map
| File | Purpose | Lines |
|------|---------|-------|
| `types.ts` | `SectionColorScheme` interface + `sectionColors` map (11 color themes) | ~30 |
| `SectionCard.tsx` | Reusable card with colored left border, icon header, children content | ~17 |
| `MetricCard.tsx` | Small metric display box with label/value/source | ~11 |
| `useResearchStream.ts` | Custom hook: SSE streaming from `/api/research/generate`, returns `{ isGenerating, streamedContent, generateResearch }` | ~80 |
| `ResearchSections.tsx` | All 11 research content sections rendered from `content` prop | ~300 |
| `index.ts` | Barrel export | ~6 |

## Streaming Hook API
```ts
const { isGenerating, streamedContent, generateResearch } = useResearchStream({
  property,    // property record from useProperty()
  propertyId,  // number
  global,      // global assumptions from useGlobalAssumptions()
});
```
- Streams SSE from `/api/research/generate`
- Accumulates `data.content` chunks into `streamedContent`
- Invalidates `["research", "property", propertyId]` query on `data.done`

## Section Card Pattern
```tsx
<SectionCard icon={Building2} title="Market Overview" color={sectionColors.market}>
  {/* section content */}
</SectionCard>
```

## Research Content Sections (in render order)
1. Market Overview — `content.marketOverview`
2. Stabilization Timeline — `content.stabilizationTimeline`
3. ADR Analysis — `content.adrAnalysis`
4. Occupancy Analysis — `content.occupancyAnalysis`
5. Event & Experience Demand — `content.eventDemand`
6. Catering & F&B Boost — `content.cateringAnalysis`
7. Cap Rate Analysis — `content.capRateAnalysis`
8. Land Value Allocation — `content.landValueAllocation`
9. Competitive Set — `content.competitiveSet`
10. Risks & Mitigations — `content.risks`
11. Sources — `content.sources`

## Color Themes
Each section has a named color scheme in `sectionColors`: `market`, `adr`, `occupancy`, `events`, `capRate`, `competitive`, `risks`, `sources`, `stabilization`, `landValue`, `catering`.

## Shell Page (PropertyMarketResearch.tsx)
Handles: routing, data queries, page layout, header with action buttons, export toolbar, loading/empty states. Delegates research content rendering to `<ResearchSections content={content} />`.
