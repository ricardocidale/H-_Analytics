---
id: 2026-05-14-008
title: "Property Underwriting Advisor — Rebeca (property.underwriting, letter R)"
status: active
created: 2026-05-14
depth: standard
origin: user-request-2026-05-14
tags: [specialist, property, capital-structure, refinance, advisor, guidance]
---

# Property Underwriting Advisor — Rebeca

## Problem Frame

The Property Assumptions form (Property Edit → Capital Structure section) contains the most financially consequential inputs in the model: acquisition LTV, acquisition interest rate, refinance LTV, refinance interest rate, loan term, and refinance basis. Users currently receive no guidance on whether their inputs are in a defensible market range. Ranges exist for occupancy and other revenue fields (via seed guidance records), but the capital structure and refinance fields are unguidanced.

Two usability gaps:

1. **No analyst opinion on debt structure** — a user can set Refinance LTV = 80% on a boutique hotel in a tertiary market and the UI never flags that senior lenders cap at 55–65% in that segment. Medellin Duplex, for example, currently has no feedback on its 70% refi LTV against a purchase-price basis.
2. **Hardcoded market-rate spread values** — `CapitalStructureSection.tsx` contains magic-number spreads (`2.75` and `2.0` percentage points above SOFR / 10Y Treasury) that determine what rate is auto-filled when a user clicks a rate chip. These are market inputs the admin should control, not compile-time constants.

Scope boundary: this plan does not expand the engine's debt model or change financial calculation logic. It adds an AI advisor layer on top of existing inputs.

## Scope

**In:**
- New specialist `property.underwriting` (letter R, human name "Rebeca")
- Field registry entries for refinance and acquisition capital-structure fields
- `AnalystRangeIndicator` wiring on refi + acq fields in `CapitalStructureSection`
- Second `useAnalystRefresh` hook in `PropertyEdit.tsx` targeting `property.underwriting`
- Two `model_defaults` rows for credit spread defaults (SOFR spread, Treasury 10Y spread)
- DB migration + frontend read of those spread rows

**Out:**
- Engine / calc logic changes (no §9 touches for business logic)
- Changing Daniela (property.risk-intelligence / D) or Eloá (property.executive-summary / E)
- Per-property acquisition fields in the engine (the field registry adds labels; no engine logic changes)
- Guidance on acquisition date, renovation costs, or other non-debt capital inputs

## Key Decisions

1. **Letter R, human name Rebeca** — next available letter after Q (Quentin, portfolio.capital-raise). Brazilian female name per CLAUDE.md §10 naming tradition. Subject `property` (same as Daniela D, Eloá E).

2. **Spread constants belong in model_defaults, not TS constants** — the `2.75` and `2.0` BPS spreads in `CapitalStructureSection` are Category 2 legacy debt per CLAUDE.md §2. They ship as two new `model_defaults` rows keyed `property.debt.sofrSpread` and `property.debt.treasury10ySpread`, with SEED_* named constants in the migration guard.

3. **Tier-0 only for Phase 1** — Like Daniela, Rebeca ships Tier-0 (deterministic watchdog) in this plan. Tier-1 (Opus single-shot with live comparables) follows in a later packet once the field registry and guidance wiring are proven in production.

4. **Field registry is CC-only, added in U2** — `lib/engine/src/analyst/registry/field-registry.ts` is in the §9 protected surface. All registry additions are CC-only. Frontend consumes these entries only at runtime via the verdict's `field` key.

5. **`guidance` prop already threaded but unused** — `PropertyEditSectionProps` already carries `guidance: AnalystGuidanceRecord[]` and it is threaded into `CapitalStructureSection` via its `PropertyEditSectionProps` type. The component passes `guidanceContext` objects on `landValuePercent`, `acqLtv`, `acqRate`, `refiLtv` but does NOT pass them on the remaining refi fields (refinanceInterestRate, refinanceTermYears, refinanceClosingCostRate) — this is the gap U4 closes.

6. **mountPoint convention for Capital Structure fields** — `"property-edit/capital-structure"` is the existing mountPoint for `landValuePercent`. All new refi and acq field registry entries use this same mountPoint so Adjust deep-links land on the correct section.

## Implementation Units

---

### U1: Spread Constants → model_defaults

**Goal:** Remove the hardcoded `2.75` and `2.0` magic numbers from `CapitalStructureSection.tsx`. Replace with `model_defaults` rows that the admin can tune via the Model Defaults UI.

**Files:**
- Create: `artifacts/api-server/src/migrations/model-defaults-debt-spreads-001.ts`
- Modify: `artifacts/api-server/src/startup/migrations.ts` (register guard)
- Modify: `artifacts/api-server/src/startup/seeds.ts` (add keys to `REQUIRED_MODEL_DEFAULT_KEYS`)
- Modify: `artifacts/api-server/src/defaults.ts` (expand `HydratedFinancials` + `FINANCIAL_DEFAULT_KEYS`)
- Modify: `artifacts/hospitality-business-portal/src/components/property-edit/CapitalStructureSection.tsx` (read from `globalAssumptions`, remove literals)

**Approach:**

Migration guard (`model-defaults-debt-spreads-001.ts`):
```
SEED_SOFR_SPREAD = 2.75      // 275 bps — typical SOFR + spread for stabilized hospitality acquisition; Source: CBRE 2024 Hotel Finance Survey
SEED_TREASURY10Y_SPREAD = 2.0 // 200 bps — typical 10Y UST + spread; Source: CBRE 2024 Hotel Finance Survey
```
Insert two `model_defaults` rows:
- key: `property.debt.sofrSpread`, value: `SEED_SOFR_SPREAD`, label: "SOFR Spread (bps)", description: "Basis points above SOFR rate for hospitality acquisition financing"
- key: `property.debt.treasury10ySpread`, value: `SEED_TREASURY10Y_SPREAD`, label: "Treasury 10Y Spread (bps)", description: "Basis points above 10Y Treasury for hospitality acquisition financing"

In `CapitalStructureSection.tsx`, replace:
```tsx
onChange("acquisitionInterestRate", (value + 2.75) / 100)
```
with:
```tsx
const sofrSpread = (globalAssumptions as Record<string, unknown>)?.sofrSpread as number ?? SOFR_SPREAD_FALLBACK
onChange("acquisitionInterestRate", (value + sofrSpread) / 100)
```
Where `SOFR_SPREAD_FALLBACK` is NOT a magic number — it is a named constant declared in `lib/shared/src/constants.ts` or read as a structural 0 fallback only. Actually — the correct fix is: the three-layer resolver for global assumptions guarantees the value is present once seeded. Read from `globalAssumptions` only. If `globalAssumptions` hasn't loaded yet (during hydration), show the rate chip without pre-filling (disable the apply button until globalAssumptions loads). This avoids any fallback constant.

**Test scenarios:**
- Migration guard runs idempotently (second call no-ops)
- `REQUIRED_MODEL_DEFAULT_KEYS` includes both spread keys
- MarketRateBenchmark chip applies correct rate (SOFR + admin-configured spread)
- magic-numbers gate passes after removing the literals
- typecheck clean

**Execution note:** plain-first (no TDD, purely mechanical migration pattern)

**Patterns to follow:**
- `artifacts/api-server/src/migrations/model-defaults-refi-params-001.ts` — SEED_* constant pattern
- `artifacts/api-server/src/defaults.ts` — FINANCIAL_DEFAULT_KEYS and HydratedFinancials expansion pattern

**Verification:**
- [ ] `pnpm run typecheck` — clean
- [ ] `scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts` — PASS (2.75 and 2.0 gone from CapitalStructureSection)
- [ ] `pnpm --filter @workspace/scripts run check:migration-guards` — PASS

---

### U2: Specialist catalog + surface specialist (CC-only §9)

**Goal:** Register `property.underwriting` (Rebeca, letter R) in the specialist catalog and create the Tier-0 deterministic surface specialist.

**Files (ALL CC-ONLY, §9 protected):**
- Modify: `lib/engine/src/analyst/registry/specialist-catalog.ts` (append catalog entry)
- Create: `lib/engine/src/analyst/surface/property/underwriting-specialist.ts` (Tier-0 deterministic)

**Catalog entry structure:**
```ts
{
  id: "property.underwriting",
  letter: "R",
  realName: "Underwriting",
  displayName: "Property Underwriting Advisor",
  humanName: "Rebeca",
  gender: "female",
  description: "Reviews the property's debt structure — acquisition and refinance LTV, interest rate, and loan term — against market benchmarks for the asset class and geography, so users get early feedback on whether their capital assumptions are defensible.",
  subject: "property",
  capabilities: ["required-fields", "llm-config", "resource-assignments", "runtime", "audit"],
  assignmentRefs: [
    { kind: "model", slug: "primary-llm", role: "synthesis", required: true },
    { kind: "api", slug: "web-search", required: true },
  ],
  candidateFields: [
    { key: "acquisitionLTV",           label: "Acquisition LTV",          surface: "property-edit", surfaceAnchor: "capital-structure" },
    { key: "acquisitionInterestRate",  label: "Acquisition Interest Rate", surface: "property-edit", surfaceAnchor: "capital-structure" },
    { key: "acquisitionTermYears",     label: "Acquisition Loan Term",     surface: "property-edit", surfaceAnchor: "capital-structure" },
    { key: "refinanceLTV",             label: "Refinance LTV",             surface: "property-edit", surfaceAnchor: "capital-structure" },
    { key: "refinanceInterestRate",    label: "Refinance Interest Rate",   surface: "property-edit", surfaceAnchor: "capital-structure" },
    { key: "refinanceTermYears",       label: "Refinance Loan Term",       surface: "property-edit", surfaceAnchor: "capital-structure" },
  ],
  prerequisites: ["property-basics-saved"],
  status: "built",
}
```

**Surface specialist (`underwriting-specialist.ts`):** Tier-0 deterministic. Emits advisory verdicts on LTV and rate fields when values are outside expected hospitality-market ranges. Ranges are NOT hardcoded — they come from a `PropertyUnderwritingInputs.benchmarks` parameter (caller-provided from `assumption_guardrails` rows), so the specialist file contains no financial literals. If no benchmarks are provided (guardrail rows not yet seeded), emit `missing-data` severity (not `ok`) so the UI shows an honest state.

**Patterns to follow:**
- `lib/engine/src/analyst/surface/property/risk-intelligence-specialist.ts` (Tier-0 pattern)
- `lib/engine/src/analyst/registry/specialist-catalog.ts` (catalog append pattern, letter R after Q)

**Test scenarios:**
- Catalog letter uniqueness validation passes (no duplicate R)
- Catalog ID uniqueness passes (no duplicate `property.underwriting`)
- Tier-0 surface returns `missing-data` severity when no benchmarks provided
- Tier-0 surface returns `advisory` when LTV > benchmark high
- Tier-0 surface returns `ok` when values within benchmark range
- `field-registry-parity.test.ts` passes (each candidateField key must appear in FIELD_REGISTRY — covered by U3)
- `admin-sidebar-section-map.test.ts` passes (SPECIALIST_SECTION_TO_ID must include new specialist — update in U2)

**Note:** `SPECIALIST_SECTION_TO_ID` in `AdminSidebar.tsx` must be extended with `"specialist-property-underwriting": "property.underwriting"`. This is a frontend file (not §9 protected). Add it as part of this unit.

**Execution note:** test-first for the surface specialist (write failing tier-0 spec before implementation)

**Verification:**
- [ ] `pnpm run typecheck` — clean
- [ ] `scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts` — PASS (surface specialist uses no financial literals)

---

### U3: Field registry expansion (CC-only §9)

**Goal:** Add entries for all refinance and acquisition capital-structure fields to `FIELD_REGISTRY` so Voice Renderer, deep-link CTAs, and parity tests all resolve correctly.

**Files (CC-ONLY, §9 protected):**
- Modify: `lib/engine/src/analyst/registry/field-registry.ts`

**New entries (all `mountPoint: "property-edit/capital-structure"`):**

```ts
// ─── property.underwriting (Rebeca) — Capital Structure fields ───────────
acquisitionLTV: {
  label: "Acquisition LTV",
  unit: "%",
  mountPoint: "property-edit/capital-structure",
  subSection: "Acquisition Financing",
},
acquisitionInterestRate: {
  label: "Acquisition Interest Rate",
  unit: "%",
  mountPoint: "property-edit/capital-structure",
  subSection: "Acquisition Financing",
},
acquisitionTermYears: {
  label: "Acquisition Loan Term",
  unit: "mo",   // Voice Renderer emits in months; the dimension is term-length
  mountPoint: "property-edit/capital-structure",
  subSection: "Acquisition Financing",
},
acquisitionClosingCostRate: {
  label: "Acquisition Closing Costs",
  unit: "%",
  mountPoint: "property-edit/capital-structure",
  subSection: "Acquisition Financing",
},
refinanceLTV: {
  label: "Refinance LTV",
  unit: "%",
  mountPoint: "property-edit/capital-structure",
  subSection: "Refinance Terms",
},
refinanceInterestRate: {
  label: "Refinance Interest Rate",
  unit: "%",
  mountPoint: "property-edit/capital-structure",
  subSection: "Refinance Terms",
},
refinanceTermYears: {
  label: "Refinance Loan Term",
  unit: "mo",
  mountPoint: "property-edit/capital-structure",
  subSection: "Refinance Terms",
},
refinanceClosingCostRate: {
  label: "Refinance Closing Costs",
  unit: "%",
  mountPoint: "property-edit/capital-structure",
  subSection: "Refinance Terms",
},
```

Note on `unit` for term-year fields: the engine emits the verdict dimension keyed to the form field, but the analyst's dimensional range is measured in months (the natural unit for loan terms in lender analysis). `"mo"` matches what the Voice Renderer will format.

**Test scenarios:**
- `field-registry-parity.test.ts` passes — every candidateField key in Rebeca's catalog entry resolves to a FIELD_REGISTRY entry
- `analyst-deep-link-destination-marker.test.ts` — verify `data-field="refinanceLTV"` and `data-field="acquisitionLTV"` markers exist in `CapitalStructureSection.tsx` (these markers are added in U4)

**Verification:**
- [ ] `pnpm run typecheck` — clean
- [ ] `scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts` — PASS

---

### U4: API-server specialist runner (Tier-1 skeleton)

**Goal:** Create the Tier-1 runner for `property.underwriting` in the api-server. Ships as a stub that passes through to Tier-0 (no Opus call yet) — same pattern Daniela started with. Wires the runner into the surface router.

**Files (NOT §9 protected):**
- Create: `artifacts/api-server/src/ai/specialists/property-underwriting-output-schema.ts`
- Create: `artifacts/api-server/src/ai/specialists/property-underwriting-prompt.ts`
- Create: `artifacts/api-server/src/ai/specialists/property-underwriting-runner.ts`
- Modify: `artifacts/api-server/src/analyst/surface-router.ts` (register Rebeca's runner) — check exact file path first

**Output schema:** Zod schema for the analyst verdict shape. Mirror `property-risk-intelligence-output-schema.ts`.

**Prompt:** Placeholder prompt that instructs the model to evaluate acquisition and refi LTV, rate, and term against hospitality segment benchmarks. Mark as `// TODO: Tier-1 prompt — expand with live comparables fetch in next packet`.

**Runner:** Tier-0 passthrough initially. Returns the Tier-0 deterministic verdict (from the surface specialist in U2) without an Opus call. Structured to make the Tier-1 upgrade mechanical.

**Patterns to follow:**
- `artifacts/api-server/src/ai/specialists/property-risk-intelligence-runner.ts` — Tier-0 passthrough pattern
- `artifacts/api-server/src/ai/specialists/property-risk-intelligence-output-schema.ts` — schema pattern

**Test scenarios:**
- Runner returns a valid verdict shape for a property with LTV = 0.70
- Runner returns `missing-data` when `hospitalityType` is absent (required prerequisite)

**Verification:**
- [ ] `pnpm run typecheck` — clean
- [ ] `scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts` — PASS

---

### U5: CapitalStructureSection guidance wiring (frontend)

**Goal:** Wire `AnalystRangeIndicator` (or `AssumptionGuidancePopover`) onto the three refi fields that currently have no guidance context: `refinanceInterestRate`, `refinanceTermYears`, `refinanceClosingCostRate`. Also add `data-field` markers so deep-link CTAs work.

**Files:**
- Modify: `artifacts/hospitality-business-portal/src/components/property-edit/CapitalStructureSection.tsx`

**Current state:**
- `landValuePercent` — has `guidanceContext` + `data-field` marker ✅
- `acquisitionLTV` (acqLtv) — has `guidanceContext` via `ResearchContextFieldLabel` ✅
- `acquisitionInterestRate` (acqRate) — has `guidanceContext` via `ResearchContextFieldLabel` ✅
- `refinanceLTV` (refiLtv) — has `guidanceContext` via `ResearchContextFieldLabel` ✅
- `refinanceInterestRate` — **no guidanceContext, no data-field marker** ❌
- `refinanceTermYears` — **no guidanceContext, no data-field marker** ❌
- `refinanceClosingCostRate` — **no guidanceContext, no data-field marker** ❌
- `acquisitionTermYears` — **no guidanceContext, no data-field marker** ❌
- `acquisitionClosingCostRate` — **no guidanceContext, no data-field marker** ❌

**Approach:**
For each unguidanced field, wrap the `Label` in `ResearchContextFieldLabel` (or add a `guidanceContext` prop where the pattern already supports it) and add `data-field="<fieldId>"` to the wrapping `div`. The `guidanceContext` object is constructed via the existing `gc()` helper already present in the component:

```tsx
const gc = (key: string, label?: string) =>
  eid ? { entityType: "property" as const, entityId: eid, assumptionKey: key, fieldLabel: label } : undefined;
```

No new imports needed — `ResearchContextFieldLabel` and `guidanceContext` are already used in this file.

**Also:** convert the plain `<Label>` on `refinanceInterestRate` to `ResearchContextFieldLabel` to match the pattern on `acquisitionInterestRate`.

**Design gate:** run `/post-coding-design-review` before marking complete (CLAUDE.md §11).

**Patterns to follow:**
- The existing `refinanceLTV` field block with `ResearchContextFieldLabel` in this same file — mirror that pattern exactly

**Test scenarios:**
- `analyst-deep-link-destination-marker.test.ts` — `data-field="refinanceInterestRate"`, `data-field="refinanceTermYears"`, `data-field="refinanceClosingCostRate"` markers exist in the rendered output
- Visual: guidance popover appears on hover over field label when a guidance record exists

**Verification:**
- [ ] `pnpm run typecheck` — clean
- [ ] `scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts` — PASS
- [ ] `/post-coding-design-review` — PASS

---

### U6: Second useAnalystRefresh in PropertyEdit.tsx (frontend)

**Goal:** Add a second `useAnalystRefresh` hook targeting `property.underwriting` (Rebeca) in `PropertyEdit.tsx`, and surface an Analyst button in the Capital Structure section so users can trigger Rebeca.

**Files:**
- Modify: `artifacts/hospitality-business-portal/src/pages/PropertyEdit.tsx`
- Modify: `artifacts/hospitality-business-portal/src/components/property-edit/CapitalStructureSection.tsx` (add Analyst button + `onAnalystRefresh` prop)
- Modify: `artifacts/hospitality-business-portal/src/components/property-edit/types.ts` (extend `PropertyEditSectionProps`)

**Approach:**

In `PropertyEdit.tsx`, add:
```tsx
const underwritingRefresh = useAnalystRefresh({
  scope: "property",
  specialistId: "property.underwriting",
  entityId: propertyId,
  invalidateKeys: [guidanceQueryKey],
  entityValues: draft,
  onMissingRequiredFields: (info) => setMissingFieldsPrompt({ open: true, ...info }),
});
```

Pass `onUnderwritingAnalystRefresh` + `underwritingAnalystRunning` + `underwritingAnalystCooldownMs` down to `CapitalStructureSection`.

In `CapitalStructureSection`, add an Analyst button at the top of the Capital Structure card (same style as Mariana's Analyst button in `CompensationSection.tsx`). Button triggers `onUnderwritingAnalystRefresh`, shows spinner when running, shows cooldown countdown.

**Patterns to follow:**
- `artifacts/hospitality-business-portal/src/components/company-assumptions/CompensationSection.tsx` — AnalystButton placement + props pattern
- `artifacts/hospitality-business-portal/src/pages/ModelDefaultsTab.tsx` — `useAnalystRefresh` hook wiring

**Test scenarios:**
- Analyst button renders in Capital Structure section
- Clicking button triggers `triggerRefresh()` on the underwriting specialist
- Cooldown state reflected in button disabled state
- `MissingRequiredFieldsPrompt` opens when `hospitalityType` is absent (locked-hard preflight)

**Design gate:** run `/post-coding-design-review` before marking complete.

**Verification:**
- [ ] `pnpm run typecheck` — clean
- [ ] `scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts` — PASS
- [ ] `/post-coding-design-review` — PASS

---

## Sequencing

```
U1 (spread constants → model_defaults)   ← standalone, can go first
U2 (specialist catalog + surface)        ← CC-only, depends on nothing
U3 (field registry)                      ← CC-only, must come after U2 (parity test needs catalog entry)
U4 (API runner)                          ← depends on U2 + U3
U5 (CapitalStructureSection wiring)      ← depends on U3 (data-field markers match registry keys)
U6 (PropertyEdit useAnalystRefresh)      ← depends on U4 + U5
```

U1 and U2 can run in parallel (no file overlap). U3 after U2. U4 after U3. U5 after U3. U6 after U4+U5.

## Deferred to Implementation

- Tier-1 Opus upgrade for Rebeca (live web-search comparables for hospitality lending norms) — follow-on packet after Phase 1 ships to production
- `assumption_guardrails` rows for the new fields (refi LTV, acq LTV, etc.) — need to research hospitality-market guardrail ranges before seeding; deferring so we don't hard-code stale benchmarks
- Agent-native parity map update (`docs/discipline/agent-native-parity-map.md`) — add Rebeca's fields once runner is wired
- Rebecca chatbot awareness of Rebeca's verdicts — future packet

## Risks

| Risk | Mitigation |
|---|---|
| `field-registry-parity.test.ts` fails if candidateField keys don't match registry entries | Add U3 registry entries before U2 catalog entry (or run in same commit). U3 depends-on U2. |
| `admin-sidebar-section-map.test.ts` fails when new specialist is added to catalog but not to `SPECIALIST_SECTION_TO_ID` | Update `AdminSidebar.tsx` as part of U2. |
| Magic-number gate catches spread fallbacks in frontend | U1 removes the literals; frontend reads from `globalAssumptions` once loaded. No fallback literals remain. |
| Tier-0 surface imports financial range thresholds (magic numbers) | Surface specialist never hardcodes ranges. Accepts `benchmarks` parameter from caller; emits `missing-data` when absent. |

## Verification Checklist (plan-level)

- [ ] `pnpm run typecheck` (workspace-wide) — clean
- [ ] `scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts` — PASS
- [ ] `pnpm --filter @workspace/scripts run check:migration-guards` — PASS
- [ ] `tests/analyst/voice/field-registry-parity.test.ts` — PASS
- [ ] `tests/client/admin-sidebar-section-map.test.ts` — PASS
- [ ] Specialist catalog letter-uniqueness validation at module load — no throw
- [ ] `/post-coding-design-review` — PASS on U5 + U6
