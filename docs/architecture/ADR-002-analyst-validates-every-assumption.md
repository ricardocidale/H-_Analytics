# ADR-002: The Analyst Validates Every Assumption — No Exceptions

**Status:** Proposed
**Date:** 2026-04-16
**Deciders:** Ricardo Cidale (Founder)

## Context

On April 16, 2026, we discovered that Jano Grande Ranch had been running with a 9% tax rate for Colombia — a country where corporate tax is 35%. This produced a 55% IRR that would have been shown to investors. The error existed in seed data that was never validated by The Analyst.

The Analyst's infrastructure is fully built: research prompts, 7 Pinecone namespaces, 7 pre-collected data tables, confidence scoring, assumption_guidance table, guidance decisions, range badges, source health checking. But The Analyst never ran because nothing triggered it.

**The root cause is architectural:** There is no enforcement that The Analyst must validate assumptions before they are used in financial calculations.

## Decision

**Every assumption used in a financial calculation must be validated by The Analyst at least once.** No assumption reaches a financial statement, IRR, or investor report without The Analyst having reviewed it and either confirming it's within range or flagging it for human review.

### Rule 1: Seed Validation Gate

When properties are seeded (via `server/seeds/` or admin bulk import), The Analyst runs a **validation pass** on every financial assumption field before the property is marked as "ready."

```
Seed inserts property → assumption_guidance has 0 rows for this property
→ Property status = "pending_validation"
→ The Analyst runs validateAllAssumptions() from benchmark-lookups.ts
→ For each field: checks against country_defaults, hospitality_benchmarks, pre-collected tables
→ Writes assumption_guidance rows with ranges and conviction levels
→ Fields within range: auto-endorsed
→ Fields outside range: flagged, property stays "pending_validation"
→ Admin reviews flagged fields, accepts or overrides
→ Property status = "validated"
```

### Rule 2: First-Visit Research Gate

When a user visits a property page for the first time:
- If assumption_guidance has 0 rows for this property: block the page, run The Analyst, then show results
- If assumption_guidance exists but is stale (> 30 days): show the page with a "Research outdated" banner, auto-trigger refresh in background
- If assumption_guidance exists and is fresh: show the page with range badges

### Rule 3: No Unvalidated Assumptions in Financial Output

The financial engine checks before computing:
```typescript
// In computePortfolioProjectionWithAudit()
const validationStatus = await storage.getPropertyValidationStatus(propertyId);
if (validationStatus === "pending_validation") {
  throw new Error(`Property ${propertyId} has unvalidated assumptions. Run The Analyst first.`);
}
```

The PDF export checks before generating:
```typescript
// In premium-exports route
const unvalidated = properties.filter(p => p.validationStatus === "pending_validation");
if (unvalidated.length > 0) {
  return res.status(400).json({ 
    error: `Cannot export: ${unvalidated.length} properties have unvalidated assumptions`,
    properties: unvalidated.map(p => p.name),
  });
}
```

### Rule 4: Country Defaults as Hard Floor

Certain fields have authoritative sources that The Analyst must check against unconditionally:

| Field | Source | Authority |
|-------|--------|-----------|
| taxRate | country_defaults table | Hard floor — seed value outside ±5% of country default is auto-flagged |
| depreciationYears | country_defaults table | Hard floor |
| inflationRate | FRED / country_defaults | Hard floor |
| countryRiskPremium | country_defaults | Hard floor |

For these fields, The Analyst doesn't need LLM research — a simple DB lookup catches the error in milliseconds. The `validateAssumptionRange()` function in `benchmark-lookups.ts` already does this.

### Rule 5: Validation Status on Property Record

Add to `properties` table:
```
validationStatus: text — "pending_validation" | "validated" | "stale" | "flagged"
lastValidatedAt: timestamp
flaggedFieldCount: integer — number of fields outside Analyst ranges
```

## Implementation

### Phase 1: Deterministic Validation on Seed (no LLM cost)

After seed inserts properties, run `validateAllAssumptions()` for each:
- Check every financial field against country_defaults and hospitality_benchmarks
- Write assumption_guidance rows with `changeSource: "seed_validation"`
- Set property `validationStatus` based on results

**This catches the 9% tax rate with zero API calls — pure DB lookup.**

### Phase 2: LLM-Enhanced Validation on First Visit

When user first visits a property, trigger The Analyst's full research:
- Web research for market ADR, occupancy benchmarks
- Comparable set analysis via Pinecone
- Multi-model synthesis for conviction scoring
- Write richer assumption_guidance rows with source citations

### Phase 3: Export Gate

Financial engine and export routes check `validationStatus` before computing/exporting.

## Consequences

- **Every investor-facing number has an Analyst audit trail**
- **Seed errors are caught immediately, not months later**
- **Properties can't be exported until validated** — may slow down first-time setup
- **Seeds take longer** — validation adds ~500ms per property (DB lookups only, no LLM)
- **Admin must review flagged fields** — adds a review step that doesn't exist today

## Action Items

1. [ ] Add `validationStatus`, `lastValidatedAt`, `flaggedFieldCount` to properties schema
2. [ ] Create `server/ai/seed-validator.ts` — runs validateAllAssumptions after seed
3. [ ] Wire seed-validator into `server/seeds/properties.ts` — run after insert
4. [ ] Add validation gate to financial engine compute endpoint
5. [ ] Add validation gate to premium-exports route
6. [ ] Update first-visit hook to check validation status, not just visit count
7. [ ] Admin UI: "Flagged Properties" panel showing unvalidated/flagged properties
