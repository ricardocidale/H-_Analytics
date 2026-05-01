---
name: Location Aware Seeding
description: Generates location-specific industry benchmark defaults for every property at creation time, stored in the `properties.research_values` JSONB colum...
---

# Location-Aware Research Seeding Skill

## Purpose

Generates location-specific industry benchmark defaults for every property at creation time, stored in the `properties.research_values` JSONB column. This replaces generic national averages with market-appropriate ranges before any AI research runs.

## Asset Type Independence

Seed profiles provide **location-based financial benchmarks** (tax rates, cost structures, ADR ranges) that apply to the hospitality asset class defined by `globalAssumptions.propertyLabel`. The profiles themselves are not asset-type-specific — they represent regional market conditions. When the asset type changes (e.g., from "Boutique Hotel" to "Eco-Lodge"), the location-based ranges remain valid as starting points, and AI research should be re-run to refine for the new asset class.

## Key File

`server/researchSeeds.ts`

## Schema

```typescript
interface ResearchValueEntry {
  display: string;   // Human-readable range: "$280–$450", "1.8%–3.5%"
  mid: number;       // Midpoint value for click-to-apply: 350, 2.5
  source: 'seed' | 'ai' | 'none';  // Provenance tracking
}

type ResearchValueMap = Record<string, ResearchValueEntry>;
```

Stored in: `properties.research_values` (JSONB column in `properties` table)

## Architecture

### LocationContext Input

```typescript
interface LocationContext {
  location: string;         // e.g., "Upstate New York"
  streetAddress?: string;   // e.g., "47 Ridgeview Lane, Rhinebeck, NY 12572"
  city?: string;
  stateProvince?: string;
  zipPostalCode?: string;
  country?: string;
  market: string;           // e.g., "North America", "Latin America"
}
```

### Region Detection

`regionFromLocation(ctx)` concatenates all location fields and pattern-matches against regex rules:

| Region Key | Pattern Examples | Market |
|------------|-----------------|--------|
| `ny_metro` | new york, nyc, rhinebeck, hudson valley | North America |
| `south_florida` | miami, fort lauderdale, palm beach, key west | North America |
| `california` | los angeles, san francisco, napa, sonoma | North America |
| `texas` | austin, dallas, houston, san antonio | North America |
| `southeast_resort` | asheville, charleston, savannah, nashville | North America |
| `mountain_west` | eden, park city, utah, salt lake, moab | North America |
| `hawaii` | maui, oahu, kauai, big island | North America |
| `midwest` | chicago, detroit, minneapolis, ohio, wisconsin | North America |
| `new_england` | boston, maine, vermont, connecticut | North America |
| `pacific_northwest` | seattle, portland, oregon, washington | North America |
| `colorado` | aspen, vail, denver, telluride | North America |
| `arizona` | scottsdale, sedona, phoenix | North America |
| `colombia` | medellín, bogotá, cartagena | Latin America |
| `mexico` | cancun, tulum, cabo, oaxaca | Latin America |
| `costa_rica` | guanacaste, monteverde, la fortuna | Latin America |
| `central_america` | panama, belize, guatemala | Latin America |
| `brazil` | rio, são paulo, bahia | Latin America |
| `argentina` | buenos aires, mendoza, patagonia | Latin America |
| `caribbean` | jamaica, bahamas, barbados, turks & caicos | Latin America |
| `europe` | london, paris, rome, barcelona, lisbon | Europe |
| `latam_generic` | Fallback when market = "Latin America" | Latin America |
| `us_generic` | Fallback for unmatched US locations | North America |

### RegionProfile Structure

Each profile is a record of 25 keys, each a `[low, mid, high]` triple:

```typescript
type RegionProfile = {
  adr: [number, number, number];        // e.g., [280, 350, 450]
  occupancy: [number, number, number];
  startOccupancy: [number, number, number];
  rampMonths: [number, number, number];
  capRate: [number, number, number];
  catering: [number, number, number];
  landValue: [number, number, number];
  costHousekeeping: [number, number, number];
  costFB: [number, number, number];
  costAdmin: [number, number, number];
  costPropertyOps: [number, number, number];
  costUtilities: [number, number, number];
  costFFE: [number, number, number];
  costMarketing: [number, number, number];
  costIT: [number, number, number];
  costOther: [number, number, number];
  costInsurance: [number, number, number];
  costPropertyTaxes: [number, number, number];
  svcFeeMarketing: [number, number, number];
  svcFeeIT: [number, number, number];
  svcFeeAccounting: [number, number, number];
  svcFeeReservations: [number, number, number];
  svcFeeGeneralMgmt: [number, number, number];
  incentiveFee: [number, number, number];
  incomeTax: [number, number, number];
};
```

### Override Mechanism

1. Start with `US_BASE` profile (national averages)
2. Apply region-specific overrides via `applyRegionOverrides(base, region)`
3. Only overridden fields change; all others keep the US_BASE values
4. Each field's display is formatted: ADR as `$low–$high`, ramp as `low–high mo`, everything else as `low%–high%`

## Display Format Rules

| Field | Format | Example |
|-------|--------|---------|
| `adr` | `$low–$high` | `$280–$450` |
| `rampMonths` | `low–high mo` | `12–24 mo` |
| All others | `low%–high%` | `1.8%–3.5%` |

## Integration Points

### Property Creation (`server/routes.ts`)

```typescript
app.post("/api/properties", async (req, res) => {
  const data = validation.data;
  if (!data.researchValues) {
    data.researchValues = generateLocationAwareResearchValues({
      location: data.location,
      streetAddress: data.streetAddress,
      city: data.city,
      stateProvince: data.stateProvince,
      market: data.market,
    });
  }
  const property = await storage.createProperty({ ...data, userId: req.user!.id });
});
```

### Seed Route Backfill

During `POST /api/admin/seed-data`, existing properties without `researchValues` are backfilled:

```typescript
for (const existing of existingProperties) {
  if (!existing.researchValues) {
    const rv = generateLocationAwareResearchValues({ ...existing });
    await storage.updateProperty(existing.id, { researchValues: rv });
  }
}
```

## Example Profiles

### NY Metro (Rhinebeck, Hudson Valley)
- ADR: $280–$450 (mid $350)
- Occupancy: 70%–82% (mid 76%)
- Cap Rate: 6.5%–8.5% (mid 7.5%)
- Property Tax: 1.8%–3.5% (mid 2.5%)
- Income Tax: 29%–34% (mid 31%)

### Colombia (Medellín)
- ADR: $120–$260 (mid $180)
- Occupancy: 55%–70% (mid 62%)
- Cap Rate: 9.0%–12.0% (mid 10.5%)
- Property Tax: 0.5%–1.5% (mid 1.0%)
- Income Tax: 30%–38% (mid 35%)

### US Generic (fallback)
- ADR: $175–$225 (mid $193)
- Occupancy: 65%–73% (mid 69%)
- Cap Rate: 8.0%–9.5% (mid 8.5%)
- Property Tax: 1.0%–2.5% (mid 1.5%)
- Income Tax: 24%–28% (mid 25%)

## Adding a New Region

1. Add a new regex pattern in `regionFromLocation()` in `server/researchSeeds.ts`
2. Add a new case in `applyRegionOverrides()` with the fields that differ from US_BASE
3. Only override fields that are meaningfully different for the region
4. Source your data from: CBRE, STR/CoStar, HVS, local tax authorities, insurance benchmarks
5. Test with: `npx tsx -e "import { generateLocationAwareResearchValues } from './server/researchSeeds'; console.log(generateLocationAwareResearchValues({ location: 'Your Location', market: 'Your Market' }));"`

## Rules

1. All generated entries use `source: 'seed'` — never `'ai'` or `'none'`
2. The `mid` value is what gets applied when a user clicks the ResearchBadge
3. Region detection is case-insensitive and checks location, streetAddress, city, stateProvince, country, and market
4. If no region matches, `us_generic` is used (national averages)
5. If `market` contains "Latin America" and no specific country matches, `latam_generic` is used
6. Service fee defaults (svcFee*) and incentive fee are not region-adjusted — they represent management company structure, not local market conditions
