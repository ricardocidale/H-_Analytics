---
name: icp-research
description: ICP (Ideal Customer Profile) definition and AI research center. Covers location hierarchy, property profile parameters, prompt builder with configurable context toggles, and AI-generated market research reports. Load when working on ICP pages, research prompts, or admin ICP configuration.
---

# ICP Research System

## Purpose

Documents the two-page ICP system: a **Profile Definition** page where users configure target property characteristics and locations, and a **Research Studio** where AI generates location-specific market research reports using the ICP profile as context.

## Key Files

| File | Purpose |
|------|---------|
| `client/src/pages/CompanyIcpDefinition.tsx` | ICP Profile page — location hierarchy, property parameters, exclusions |
| `client/src/pages/IcpStudio.tsx` | Research Studio — AI research generation with prompt builder |
| `client/src/pages/Icp.tsx` | ICP landing/router page |
| `server/routes/icp-research.ts` | API: prompt building, Anthropic streaming, report parsing |

## Architecture

```
CompanyIcpDefinition.tsx → icpConfig JSONB (global_assumptions)
                              ↓
IcpStudio.tsx → POST /api/icp-research/generate
                  ↓
buildIcpResearchPrompt(icpConfig, assetDescription, propertyLabel, promptBuilder, financialSummary)
                  ↓
Anthropic Claude → structured JSON report
                  ↓
Parse → { generalMarket, locations[], conclusion, extractedMetrics }
```

## ICP Config Structure (`icpConfig` JSONB)

Stored in `global_assumptions.icpConfig`. Three top-level sections:

### `_locations` — Location Hierarchy

```typescript
interface IcpLocation {
  id: string;
  country: string;        // e.g. "United States"
  countryCode: string;    // e.g. "US"
  states: string[];       // e.g. ["New York", "Connecticut"]
  cities: IcpLocationCity[]; // e.g. [{ name: "Hudson", radius: 25 }]
  notes: string;          // Free-text context for this location
}
```

Each location is country → state(s) → city/cities with mile radius. The prompt renders this as a hierarchical location block for the AI.

### `_descriptive` — Property Profile

- `propertyTypes`: Target property types (e.g. "Boutique luxury hotel")
- `exclusions`: Properties to exclude from consideration

### `_sources` — Reference Sources

- `urls[]`: External URLs with labels
- `files[]`: Uploaded files or Google Drive links
- `allowUnrestricted`: If false, AI must restrict research to listed sources only

### Numeric Parameters

- `roomsMin / roomsMax`: Room count range
- `roomsSweetSpotMin / roomsSweetSpotMax`: Ideal room count sweet spot
- `fbRating`: F&B importance rating (1-5)
- `landAcresMin / landAcresMax`: Land area range

## Prompt Builder

The research prompt is assembled from configurable context toggles:

| Toggle | Default | What It Includes |
|--------|---------|-----------------|
| `location` | true | Target locations hierarchy |
| `propertyProfile` | true | Room count, land, F&B rating |
| `propertyDescription` | true | Property types and exclusions |
| `questions` | true | Custom research questions (sorted by `sortOrder`) |
| `additionalInstructions` | true | Free-text additional instructions |
| `financialResults` | false | Management company financial summary |

Admin can configure custom questions with `{ id, question, sortOrder }` arrays.

## AI Research Output

The AI returns structured JSON with:

```typescript
interface IcpResearchReport {
  generalMarket: { title: string; content: string };
  locations: { locationKey: string; title: string; content: string }[];
  conclusion: { title: string; content: string };
  extractedMetrics: {
    nationalAvgAdr: { value: number; unit: "USD"; range: string };
    nationalAvgOccupancy: { value: number; unit: "%" };
    nationalAvgRevPAR: { value: number; unit: "USD" };
    avgCapRate: { value: number; unit: "%" };
    avgManagementFee: { value: number; unit: "%"; range: string };
    avgIncentiveFee: { value: number; unit: "%"; range: string };
    locationMetrics: LocationMetric[];
  };
}
```

Each location section covers: ADR ranges by sub-market, occupancy benchmarks, RevPAR, land costs, fee structures, competitive landscape, lending rates, regulatory environment, and KPIs.

## Granularity Requirements

- **ADR**: Always ranges, varying by street/zone/neighborhood
- **Occupancy**: Seasonal ranges + annual averages per sub-market
- **Fees**: Both USD amounts and percentages as ranges
- **Competitors**: Named companies in each location
- **KPIs**: Location-specific performance indicators

## API Routes

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/api/icp-research/generate` | POST | requireAuth | Generate ICP research report (streaming) |
| `/api/icp-research/reports` | GET | requireAuth | List saved reports |
| `/api/icp-research/reports/:id` | GET | requireAuth | Get specific report |

## Related Skills

- `.claude/skills/research/SKILL.md` — Property-level research (different from ICP)
- `.claude/skills/market-intelligence/SKILL.md` — FRED/Hospitality/Grounded data pipeline
- `.claude/skills/admin/SKILL.md` — Admin ICP configuration tab
