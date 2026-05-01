# Company Research Components

## Location
`client/src/components/company-research/`

## Components

### CompanyResearchSections
- **File**: `CompanyResearchSections.tsx`
- **Props**: `{ content: any }` — parsed research content object
- **Renders**: Management Fees, GAAP Standards, Industry Benchmarks, Compensation Benchmarks, Contract Terms, Sources
- **Reuses**: `SectionCard` and `MetricCard` from `../property-research/`

### useCompanyResearchStream
- **File**: `useCompanyResearchStream.ts`
- **Returns**: `{ isGenerating, streamedContent, generateResearch }`
- **Behavior**: POSTs to `/api/research/generate` with `{ type: "company" }`, streams SSE response, invalidates `["research", "company"]` query on completion

### types.ts
- **Exports**: `companySectionColors` — color scheme record for fees, gaap, benchmarks, compensation, contracts, sources
- **Re-exports**: `SectionColorScheme` from `../property-research/types`

### index.ts (barrel)
- Exports: `CompanyResearchSections`, `useCompanyResearchStream`, `companySectionColors`, `SectionColorScheme`

## Page Shell
`client/src/pages/CompanyResearch.tsx` (~150 lines) — Layout, PageHeader, query, export toolbar, streaming indicator, empty state, and `<CompanyResearchSections>` rendering.

## Shared Components (reused from property-research)
- `SectionCard` — card with colored left border, icon header
- `MetricCard` — labeled value display with color scheme
