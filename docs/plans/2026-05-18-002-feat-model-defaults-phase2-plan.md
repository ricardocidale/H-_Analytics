---
title: "feat: Phase 2 — wire computePropertyDefaults to model_defaults + Valentina research specialist"
type: feat
status: active
date: 2026-05-18
origin: docs/brainstorms/numeric-architecture-requirements.md
---

# feat: Phase 2 — wire computePropertyDefaults to model_defaults + Valentina research specialist

## Summary

Wire `computePropertyDefaults` to accept pre-fetched `model_defaults` values from the route layer (removing three hardcoded surfaces: `QUALITY_TIER_ADR` bracket map, `DEFAULT_ADR_GROWTH_RATE`, and the inline `0.85` max-occupancy fallback). Then retire `DEFAULT_ADR_GROWTH_RATE` once the wire is green, satisfying the §14 pre-conditions that blocked the T1-4 campaign. Separately build Valentina — a new Analyst specialist that researches current market benchmarks for every `model_defaults` row where `lastSetSource='seed'` and writes structured proposals back via the route layer for admin review.

---

## Problem Frame

The §2 T1-4 retirement campaign (sessions 17–20) has been PAUSED since session 20 because `DEFAULT_ADR_GROWTH_RATE` was retired before its DB destination was wired. The inline `0.03` leaked into `lib/engine/` and `lib/calc/`, breaking typecheck and regressing the magic-numbers ratchet 15→17. §14 (CLAUDE.md) now formalizes the rule: no retirement until the replacement destination is wired and reading in the same PR. This plan delivers that wiring and the retirement together, satisfying both §14 pre-conditions. It also builds the Analyst agent that drives all `lastSetSource='seed'` rows toward `'analyst_accepted'` — the long-term goal stated in the origin document.

---

## Requirements

- R1. `computePropertyDefaults` reads ADR growth rate, max occupancy, and per-tier ADR bracket data from `model_defaults` DB rows (passed via route layer) — no hardcoded maps or TS constants used in production paths.
- R2. The route layer fetches the required `model_defaults` rows before calling `computePropertyDefaults` and passes them as a typed parameter. No DB access in `lib/engine/src/` (ADR-007).
- R3. `REQUIRED_MODEL_DEFAULT_KEYS` (startup guard) includes every slug the new wiring reads. Missing rows cause a named boot-time error, not silent wrong defaults.
- R4. `DEFAULT_ADR_GROWTH_RATE` is retired from `lib/shared/src/constants.ts` after R1–R3 are verified green and the magic-numbers ratchet is re-baselined at ≤ current count (§14 pre-condition).
- R5. Valentina — a new Analyst specialist — reads all `model_defaults` rows where `lastSetSource='seed'`, researches current industry benchmark values via LLM, and returns structured proposals (value, range, authority, conviction) to the route layer, which persists them to `proposed_*` columns. Admin reviews via the existing pending-proposals queue.
- R6. Valentina's LLM calls go through `resolveLlmFor("valentina-model-defaults-research")` — no hardcoded model strings anywhere in source. LLM slot seeded in a new `admin-resources-015.ts` migration guard.
- R7. Agent-native parity: a Rebecca tool exists for triggering Valentina research, matching the admin trigger route.

---

## Scope Boundaries

- D5 (Rebecca conversational onboarding at property creation) is a separate brainstorm/plan — not in scope.
- D1/D2 (required-fields creation gate, tiered enrichment prompt) are not in scope — the plan focuses on the engine wiring and Analyst research, not the onboarding flow.
- D3 (continuous scheduled re-research cadence) is deferred: the trigger is on-demand only for this plan (admin button + Rebecca tool). Scheduling can be added in a follow-up.
- `DEFAULT_TRAVEL_COST_PER_CLIENT` and `DEFAULT_IT_LICENSE_PER_CLIENT` retirements remain on hold; their route-layer wiring is not part of this plan (separate T1-4 campaign units).
- `icp_brackets` proposal-column extension (P2-C in the brainstorm) is deferred to a follow-up plan.
- `DEFAULT_PROPERTY_INCOME_TAX_RATE` and `DEFAULT_LAND_VALUE_PERCENT` have dedicated plan docs; not touched here.

### Deferred to Follow-Up Work

- D3 scheduled cadence (cron-based auto-research): `docs/plans/` after this plan ships and Valentina is validated in production.
- P2-C `icp_brackets` Analyst research: requires proposal-column schema extension; separate plan.

---

## Context & Research

### Relevant Code and Patterns

- **Engine function (protected CC surface):** `lib/engine/src/helpers/default-resolver.ts` — `computePropertyDefaults(qualityTier, businessModel, country, roomCount, stateProvince?, maxOccupancyFromProperty?)` returns `PropertyDefaults`. Three hardcoded surfaces: `QUALITY_TIER_ADR` (module-level map), `DEFAULT_ADR_GROWTH_RATE` (imported from shared constants), `0.85` inline (max occupancy fallback).
- **Route call sites:** `artifacts/api-server/src/routes/properties.ts` — `seedPropertyDefaults` helper (called after property creation) and `GET /api/properties/defaults/preview`. Neither passes `model_defaults` values today.
- **`FINANCIAL_DEFAULT_KEYS` + `hydratePropertyFinancials`:** `artifacts/api-server/src/defaults.ts:151` — already reads `mc.property_defaults.maxOccupancy` and 7 other keys for the underwriting hydration path. `adrGrowthRate` and the new `adrByTier` key are not yet in this list.
- **Startup guard:** `artifacts/api-server/src/startup/seeds.ts:107` — `REQUIRED_MODEL_DEFAULT_KEYS` array; `assertRequiredModelDefaults()` reads this at boot. Currently 8 keys; must grow to include the new keys read by the wired function.
- **`resolveDefault` function:** `artifacts/api-server/src/defaults.ts:76` — most-specific scope row wins (`country + country_subdivision + business_type + size_band`), falls back to universal row.
- **`resolveLlmFor` pattern:** `artifacts/api-server/src/ai/llm-config-resolver.ts:27` — canonical LLM dispatch; returns `{ vendor, modelId }`. All Analyst LLM calls route through this.
- **`logApiCost` pattern:** existing specialists call `logApiCost({ operation: slotSlug, route: "/admin/..." })` after each LLM call — follow this for Valentina.
- **Admin-resources migration pattern:** `artifacts/api-server/src/migrations/admin-resources-014.ts` — last in sequence; next is `admin-resources-015.ts`. Each migration guard is idempotent (`ON CONFLICT (kind, slug) DO NOTHING`).
- **Specialist architecture reference:** `artifacts/api-server/src/ai/analyst-refresh/reference-data.ts` — LLM calls via `resolveLlmFor` + structured JSON return to caller; caller owns DB writes.
- **Parity map:** `docs/discipline/agent-native-parity-map.md` — updated whenever a new admin action is added.

### Institutional Learnings

- **`docs/solutions/best-practices/coderabbit-false-positive-engine-null-fallbacks-2026-05-16.md`** — engine boundary must receive non-null values; if model_defaults row is absent, throw a named error at the hydration boundary, not a `??` fallback. Do not add any `?? 0` or `?? DEFAULT_*` in `lib/engine/src/` after the wiring.
- **`docs/solutions/database-issues/icp-brackets-slug-mismatch-layer2-overlay-inert-2026-05-13.md`** — slug mismatch in DB lookups produces silent wrong defaults, not errors. Prevention: every slug string that the wiring reads must appear in `REQUIRED_MODEL_DEFAULT_KEYS` so a missing row fails boot loudly.
- **`docs/solutions/architecture-patterns/reference-brands-ai-pipeline-wiring-2026-05-02.md`** — canonical DI pattern for this plan: typed input interface in engine/prompt layer, no DB imports; route layer fetches and maps; optional fields collapse to `undefined` so existing callers gracefully degrade.
- **`docs/solutions/architecture-patterns/matteo-multi-vendor-llm-slot-routing-2026-05-16.md`** — every LLM call goes through `resolveLlmFor(slotSlug)`; model names appear only in migration seed data; cost logged via `logApiCost`.
- **`docs/solutions/conventions/hplus-specialist-design-discipline-from-ce-researchers-2026-05-13.md`** — Pattern #13: specialist returns text-only structured output; route layer owns DB write (prevents idempotency violations). Pattern #10: every proposed value carries conviction label (high/moderate/low) with calibration criteria in system prompt. Pattern #17: specialist flags when proposed value deviates >20% from current seed value.

### External References

- No external research warranted — local patterns are well-established for all layers of this plan.

---

## Key Technical Decisions

- **Per-tier ADR brackets stored as JSON blob at `mc.property_defaults.adrByTier`**: A single `model_defaults` row holds `{"luxury": {"min": 350, "max": 500, "default": 400}, "upper-upscale": {"min": 250, "max": 400, "default": 300}, ...}`. This avoids adding a `quality_tier` scope column (schema migration overhead) while keeping the entire bracket map Analyst-researchable and admin-editable as one unit. Rationale: the QUALITY_TIER_ADR map in the engine today is a flat object; a JSON blob row mirrors that shape exactly.

- **`ModelDefaultsInput` is a required parameter to `computePropertyDefaults`**: Making the parameter optional with a "test-only fallback" reproduces the session-20 failure mode — a comment cannot enforce a production-path constraint across future sessions. All existing test call sites must be updated to supply a fixture `ModelDefaultsInput` (containing the constant values they relied on before). This is more upfront test-update work, but it eliminates the silent regression path where a missing `await buildModelDefaultsInput(scope)` in a new call site falls back to the old hardcoded constant with no error. The TS constant `DEFAULT_ADR_GROWTH_RATE` stays available until U4 retires it, but U2 no longer calls it at runtime — test fixtures reference the constant explicitly as a source of their fixture value.

- **Route layer uses `resolveDefault` per-key, not bulk fetch**: `computePropertyDefaults` needs three keys (`mc.property_defaults.adrGrowthRate`, `mc.property_defaults.adrByTier`, `mc.property_defaults.maxOccupancy`). Using `resolveDefault` individually per key is consistent with the existing pattern in `hydratePropertyFinancials`. A single `resolveDefaultsByCard("property_defaults")` bulk fetch would be cleaner but couples the caller to the card structure. Individual calls are explicit and testable.

- **Valentina returns proposals as structured JSON, never writes to DB directly**: Valentina's function returns `ValentinaProposals[]` to the caller (route handler). The route handler validates each proposal and calls `db.update(modelDefaults).set({...})`. This follows Pattern #13 and ADR-007 — the specialist has no DB import. The route layer performs the write transactionally.

- **Conviction calibration encoded in system prompt, not in code**: The criteria for high/moderate/low conviction (e.g., "high = ≥3 sources within ±15%") are stated in Valentina's system prompt string. They are not TS constants — they are prompt content. This keeps them editable without code changes.

---

## Open Questions

### Resolved During Planning

- **Should `QUALITY_TIER_ADR` use a new scope column or a JSON blob?** Resolved: JSON blob at `mc.property_defaults.adrByTier` — no schema migration needed, tier-map is naturally a single researchable unit. (see Key Technical Decisions)
- **Is `ModelDefaultsInput` required or optional?** Resolved: **Required** — optional parameter with test-only fallback reproduces the session-20 failure mode (silent regression when a new call site forgets to fetch model_defaults). All existing test call sites are updated to supply a fixture object. (see Key Technical Decisions)
- **What triggers the initial Valentina research run?** Resolved: on-demand admin button route (`POST /api/admin/model-defaults/research`) + matching Rebecca tool. Scheduled cadence is deferred.

### Deferred to Implementation

- **What is the exact LLM system prompt for Valentina?** The prompt structure (research context, conviction calibration criteria, output JSON schema) is determined during implementation from the existing specialist prompt patterns and the `model_defaults` key labels.
- **Which keys should Valentina skip or handle specially?** (e.g., `mc.funding.ltv` is an admin preference, not a market benchmark). Implementation discovers this by reading the `category` and `sub_tab` columns of `lastSetSource='seed'` rows and filtering to `category='property'` financial assumptions.
- **Does `resolveDefault` need a scope parameter from the property context?** For U3, the call site is the `seedPropertyDefaults` function which has `country`, `qualityTier`, `businessModel` available. The scope should be passed to `resolveDefault` for the `adrByTier` lookup. Exact scope object shape confirmed during implementation.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
Before (current):
  POST /api/properties
    → seedPropertyDefaults(qualityTier, businessModel, country, roomCount)
        → computePropertyDefaults(qualityTier, businessModel, country, roomCount)
            reads: QUALITY_TIER_ADR (hardcoded map)
            reads: DEFAULT_ADR_GROWTH_RATE (TS constant)
            reads: 0.85 (inline literal)
            → PropertyDefaults

After (this plan):
  POST /api/properties
    → [route layer] resolveDefault("mc.property_defaults.adrGrowthRate", scope)
    → [route layer] resolveDefault("mc.property_defaults.adrByTier", scope)
    → [route layer] resolveDefault("mc.property_defaults.maxOccupancy", scope) ← already via hydratePropertyFinancials
    → seedPropertyDefaults(qualityTier, businessModel, country, roomCount, modelDefaultsInput)
        → computePropertyDefaults(qualityTier, businessModel, country, roomCount, maxOccupancy, modelDefaultsInput)
            reads: modelDefaultsInput.adrByTier[qualityTier] (from DB)
            reads: modelDefaultsInput.adrGrowthRate       (from DB)
            reads: modelDefaultsInput.maxOccupancy        (from DB)
            → PropertyDefaults  (sources map updated to "model_defaults:mc.property_defaults.*")

Valentina research flow:
  POST /api/admin/model-defaults/research
    → runValentinaResearch()
        → db.select(model_defaults WHERE lastSetSource='seed' AND category='property')
        → valentina(rows)   ← pure function, no DB imports
            → LLM via resolveLlmFor("valentina-model-defaults-research")
            → returns ValentinaProposals[]
        → [route handler] db.update(model_defaults).set(proposed_*) for each proposal
        → responds { proposed: N, skipped: M }
  Admin reviews in Model Defaults pending-proposals queue (already built)
```

---

## Implementation Units

- U1. **Normalize `qualityTier` key format + seed `mc.property_defaults.adrByTier`**

**Goal:** Resolve the three-way format conflict in `qualityTier` strings before seeding the new row, then add the `model_defaults` DB row backing the per-tier ADR bracket map.

**Requirements:** R1, R3

**Dependencies:** None

**Files:**
- Modify: `lib/engine/src/helpers/default-resolver.ts` (normalize `QUALITY_TIER_ADR` key format)
- Modify: `artifacts/api-server/script/seed-model-defaults.ts` (add `adrByTier` row)
- Verify: `lib/shared/src/` and `lib/db/src/schema/properties.ts` — `qualityTier` enum/column definition

**Approach:**
- **First: audit the canonical format.** The engine currently uses Title Case with spaces (`"Luxury"`, `"Upper Upscale"`). The DB `properties.quality_tier` column uses lowercase (`"upscale"`). One of these is wrong. The DB column is the authoritative value (it's what `computePropertyDefaults` receives as `qualityTier` at runtime). Read `lib/db/src/schema/properties.ts` to confirm the exact enum values in the DB. Treat those as canonical.
- **Normalize the engine map keys.** In `default-resolver.ts`, change the `QUALITY_TIER_ADR` map keys to exactly match the DB enum values (lowercase with hyphens, or whatever the DB stores). This is a pure key-rename — same data, consistent format. Do this in U1 (before U2) so U2 can reference the correct keys.
- **Seed the DB row.** Add `defaultKey: "mc.property_defaults.adrByTier"` to the `SPECS` array. The JSON value keys must use the same canonical format established above (e.g., `{ "luxury": { "min": 350, "max": 500, "default": 400 }, ... }`).
- `lastSetSource: 'seed'` (debt marker — Valentina will research the bracket values).
- `onConflictDoNothing()` keeps the script idempotent.

**Patterns to follow:**
- Existing seed rows in `artifacts/api-server/script/seed-model-defaults.ts` (SPECS array pattern)
- Category 5 (SEED_*) rules from CLAUDE.md §2: seed scripts only, never imported by engine/calc/route code

**Test scenarios:**
- Test expectation: none — this is a seed script change with no behavioral change. U2 tests cover the downstream consumption.

**Verification:**
- `pnpm run typecheck` PASS
- `scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts` PASS (the JSON values are in a seed script, in scope for SEED_* carve-out)
- After seed runs: `SELECT default_key, value FROM model_defaults WHERE default_key = 'mc.property_defaults.adrByTier'` returns one row with the tier map.

---

- U2. **Extend `computePropertyDefaults` to accept required `ModelDefaultsInput`**

**Goal:** Replace the three hardcoded surfaces in `computePropertyDefaults` (`QUALITY_TIER_ADR` map, `DEFAULT_ADR_GROWTH_RATE`, inline `0.85`) with values from a new **required** `ModelDefaultsInput` typed parameter. All existing test call sites are updated to supply a fixture object.

**Requirements:** R1, R2

**Dependencies:** U1 (need the key name confirmed before updating the sources map)

**Files:**
- Modify: `lib/engine/src/helpers/default-resolver.ts`
- Modify or create: `artifacts/api-server/src/tests/engine/default-resolver.test.ts` (or matching engine test path)

**Approach:**
- Define a new exported interface `ModelDefaultsInput` in `default-resolver.ts` with at least: `adrGrowthRate: number`, `adrByTier: Record<string, { min: number; max: number; default: number }>`, `maxOccupancy: number`. (No DB imports — pure TypeScript type.)
- Add `modelDefaultsInput: ModelDefaultsInput` as a **required** parameter to `computePropertyDefaults` (last positional). This eliminates the silent fallback path — a call site that forgets to fetch model_defaults values will fail at compile time, not at runtime with a wrong number.
- Update all existing test call sites (engine tests, proof tests) to supply a fixture `ModelDefaultsInput` object. The fixture values should mirror the pre-existing constants (e.g., `adrGrowthRate: 0.03`) so tests remain behaviorally unchanged. The constants can still be referenced in test fixture construction until U4 removes them.
- In the function body: use `modelDefaultsInput.adrByTier[qualityTier]` in place of `QUALITY_TIER_ADR[qualityTier]`, use `modelDefaultsInput.adrGrowthRate` in place of `DEFAULT_ADR_GROWTH_RATE`, use `modelDefaultsInput.maxOccupancy` in place of `maxOccupancyFromProperty ?? 0.85`. Remove the inline `0.85` and the Upscale `220` fallback.
- Remove `QUALITY_TIER_ADR` from the module (now in DB). Keep `DEFAULT_ADR_GROWTH_RATE` import only until U4 (tests reference it for fixture construction).
- Update the `sources` map entries to `"model_defaults:mc.property_defaults.<key>"` for all three replaced fields.
- If `modelDefaultsInput.adrByTier[qualityTier]` is `undefined` (tier not in the map), throw `ModelDefaultsMissingTier(qualityTier)` — named error, not silent `undefined` access.

**Execution note:** Implement new behavior test-first — write the `ModelDefaultsInput`-supplied-path tests before modifying the production code path.

**Patterns to follow:**
- `ResearchToolDeps` pattern in `docs/solutions/architecture-patterns/reference-brands-ai-pipeline-wiring-2026-05-02.md` — reference for DI shape, but note that U2 uses a **required** parameter, not optional. The optional variant from that doc is deliberately rejected here (see Key Technical Decisions on C2).
- Existing `sources` map convention in `default-resolver.ts`

**Test scenarios:**
- Happy path: supply `ModelDefaultsInput` with known values → returned `startAdr`, `adrGrowthRate`, `maxOccupancy` match the supplied values (not the hardcoded constants). `sources` map entries reflect `"model_defaults:mc.property_defaults.*"`.
- Happy path: tier lookup — supply `adrByTier` with canonical tier key and `{ default: 450 }` → `startAdr` is `450`.
- Error path: `adrByTier` contains no entry for the requested `qualityTier` → throws named `ModelDefaultsMissingTier(qualityTier)` (not silent `undefined` access).
- Error path: `adrGrowthRate: NaN` in `ModelDefaultsInput` → returned value is `NaN`; do not silently clamp — let callers catch it.
- Compile-time enforcement: call `computePropertyDefaults(...)` without the `modelDefaultsInput` argument → TypeScript error (required parameter). No optional fallback path exists.
- Test fixture update: all pre-existing test call sites that previously called `computePropertyDefaults` without model defaults now supply `mockModelDefaultsInput` fixture — tests pass with the same behavioral results as before.

**Verification:**
- `pnpm run typecheck` PASS
- `scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts` PASS (no new inline literals in engine code)
- All engine tests PASS including existing tests that use the fallback path
- The three hardcoded values are no longer used in any production path that supplies `modelDefaultsInput`

---

- U3. **Route layer: fetch `model_defaults` and pass `ModelDefaultsInput` to `computePropertyDefaults`**

**Goal:** Wire the route layer to fetch the three required `model_defaults` values before calling `computePropertyDefaults`, satisfy ADR-007 (engine receives pure params), and update the startup guard so missing rows fail boot loudly.

**Requirements:** R1, R2, R3

**Dependencies:** U1, U2

**Files:**
- Modify: `artifacts/api-server/src/routes/properties.ts`
- Modify: `artifacts/api-server/src/defaults.ts`
- Modify: `artifacts/api-server/src/startup/seeds.ts`

**Approach:**
- In `artifacts/api-server/src/defaults.ts`: add `{ field: "adrGrowthRate", defaultKey: "mc.property_defaults.adrGrowthRate" }` and `{ field: "adrByTier", defaultKey: "mc.property_defaults.adrByTier" }` to `FINANCIAL_DEFAULT_KEYS`. Export a new `buildModelDefaultsInput(scope)` helper (or add logic to `hydratePropertyFinancials`) that fetches these two keys plus `maxOccupancy` from `model_defaults` and returns a `ModelDefaultsInput`.
- In `artifacts/api-server/src/routes/properties.ts`: call `buildModelDefaultsInput(scope)` **before** the non-blocking try/catch that wraps `seedPropertyDefaults`. The non-blocking catch is intentionally designed to swallow defaults failures silently — if `buildModelDefaultsInput` is inside it, a missing `model_defaults` row produces wrong-but-silent output. Placing it before the try/catch ensures a missing row throws and surfaces as a 500, which is the correct behavior (the startup guard makes this path unreachable in production; in dev it surfaces the gap immediately). The `scope` object should include `country`, `qualityTier`, `businessModel` from the property being created. Pass the resolved `modelDefaultsInput` into `seedPropertyDefaults` (and then to `computePropertyDefaults`).
- In `artifacts/api-server/src/startup/seeds.ts`: add `"mc.property_defaults.adrGrowthRate"` and `"mc.property_defaults.adrByTier"` to `REQUIRED_MODEL_DEFAULT_KEYS`. A missing row must fail boot with a named error — not produce wrong defaults silently.
- The `buildModelDefaultsInput` helper throws a descriptive `ModelDefaultsMissingKey(key)` error if `resolveDefault` returns null for any of the three keys (production invariant: three-layer resolver guarantees these rows exist after seeding).

**Patterns to follow:**
- `FINANCIAL_DEFAULT_KEYS` + `resolveDefault` pattern in `artifacts/api-server/src/defaults.ts`
- `REQUIRED_MODEL_DEFAULT_KEYS` guard in `artifacts/api-server/src/startup/seeds.ts`
- Reference-brands DI pattern in `docs/solutions/architecture-patterns/reference-brands-ai-pipeline-wiring-2026-05-02.md`

**Test scenarios:**
- Happy path: `buildModelDefaultsInput()` returns a populated `ModelDefaultsInput` when all three keys exist in DB — `adrGrowthRate` and `adrByTier` values match the seeded rows.
- Error path: `buildModelDefaultsInput()` throws `ModelDefaultsMissingKey("mc.property_defaults.adrGrowthRate")` when the key is absent from the DB (simulated by removing the row in a test fixture).
- Integration (sentinel-value, also required by U4's §14 gate): seed `model_defaults` row `mc.property_defaults.adrGrowthRate` with value `0.1234` in the test DB fixture; call `POST /api/properties` with valid body; assert created property's `adrGrowthRate` equals `0.1234`. This test must be green and committed as part of U3 — U4 verification references it explicitly.
- Integration: `GET /api/properties/defaults/preview` returns `adrGrowthRate` from `model_defaults`, not `DEFAULT_ADR_GROWTH_RATE`.
- Integration: startup guard fails boot when `mc.property_defaults.adrGrowthRate` is absent from a non-empty `model_defaults` table (integration test or manual verification).

**Verification:**
- `pnpm run typecheck` PASS
- `scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts` PASS (no new inline literals in route/service layer)
- `pnpm run test` (or scoped route test) PASS
- `POST /api/properties` smoke-test: created property receives `adrGrowthRate` from `model_defaults` row

---

- U4. **Retire `DEFAULT_ADR_GROWTH_RATE` (§14 gate)**

**Goal:** Remove the last TypeScript constant for ADR growth rate now that U2 and U3 guarantee the production path reads from `model_defaults`. Satisfies §14 pre-conditions and unblocks the T1-4 campaign.

**Requirements:** R4

**Dependencies:** U2, U3 — both must be merged and CI green before this unit lands. This is the §14 gate: destination wired (U3) + reading green (U2+U3 CI) → retirement is safe.

**Files:**
- Modify: `lib/shared/src/constants.ts` (remove `DEFAULT_ADR_GROWTH_RATE`)
- Modify: `artifacts/api-server/script/seed-model-defaults.ts` (replace `DEFAULT_ADR_GROWTH_RATE` import with the literal `0.03` with `SEED_` prefix and provenance comment — this is the seed script bootstrap value; CLAUDE.md §2 Category 5 carve-out applies)
- Modify: `lib/engine/src/helpers/default-resolver.ts` (remove fallback constant reference; update test-only path comment)
- Modify: any remaining import sites (grep `DEFAULT_ADR_GROWTH_RATE` across repo)

**Approach:**
- Run `grep -r "DEFAULT_ADR_GROWTH_RATE"` before editing to enumerate all import sites.
- The seed script may retain the value as an inline `0.03` literal with a `// SEED value: calibrated from HVS 2024 survey; see docs/runbooks/seed-calibration-2026-05-13.md` comment. The Category 5 carve-out permits this.
- Engine test fallback path in U2: after this unit, the fallback should use a local test fixture value (not the exported constant) or the test should supply `ModelDefaultsInput` directly. Update tests accordingly.
- Run `check-magic-numbers` and confirm the baseline does not increase. If it stays flat or decreases, the §14 second pre-condition is met.

**Patterns to follow:**
- §14 two pre-conditions checklist (CLAUDE.md §14); both must appear in this unit's verification
- Category 5 SEED_* carve-out (CLAUDE.md §2) for the seed script literal

**Test scenarios:**
- Test expectation: after removal, `grep -r "DEFAULT_ADR_GROWTH_RATE" lib/ artifacts/` returns zero matches.
- Error path: any test that previously relied on the constant and did not supply `ModelDefaultsInput` should now either (a) supply a fixture value, or (b) be updated to use the test-only path — neither option silently uses the deleted constant.

**Verification:**
- §14 pre-condition 1 (destination wired and reading): a specific integration test must be green before merging U4. The test: seed `model_defaults` row `mc.property_defaults.adrGrowthRate` with sentinel value `0.1234`, call `POST /api/properties` with valid body, assert created property's `adrGrowthRate` field equals `0.1234`. "U2+U3 CI passed" is not sufficient — this sentinel-value test proves the production path reads from DB, not that CI passed on a path that may use the constant.
- §14 pre-condition 2: `scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts` PASS and baseline count ≤ count before U4 (run and record the number).
- `pnpm run typecheck` PASS — zero remaining references to `DEFAULT_ADR_GROWTH_RATE` anywhere in source (confirmed by grep).
- `pnpm run test` PASS.

---

- U5. **Valentina — Model Defaults Research Specialist + admin trigger + Rebecca parity**

**Goal:** Build Valentina: the first Analyst specialist that populates `model_defaults.proposed_*` columns for rows where `lastSetSource='seed'`. Admin reviews proposals via the existing pending-proposals queue; Rebecca can trigger the research via conversation.

**Requirements:** R5, R6, R7

**Dependencies:** U1, U3 (Valentina reads the same keys wired in U3; the pattern is established)

**Files:**
- Create: `artifacts/api-server/src/migrations/admin-resources-015.ts`
- Create: `artifacts/api-server/src/ai/valentina-model-defaults.ts`
- Modify: `artifacts/api-server/src/routes/admin/model-defaults.ts` (add `POST /api/admin/model-defaults/research` route)
- Modify: Rebecca tools file (add `trigger_model_defaults_research` tool)
- Modify: `docs/discipline/agent-native-parity-map.md`

**Approach:**

*`admin-resources-015.ts`:*
- Add `kind='llm_slot'` row with `slug: "valentina-model-defaults-research"`, `displayName: "Valentina — Model Defaults Research"`, `config: { modelSlug: "claude-sonnet-4-6" }` (Sonnet is appropriate for structured benchmark research; Opus is for financial engine work per CLAUDE.md §12).
- Add `kind='parameter'` feature-flag row with `slug: "valentina-enabled"`, `config: { value: 0 }` (ships dark; admin flips to `1` to enable).
- All rows: `ON CONFLICT (kind, slug) DO NOTHING`.

*`valentina-model-defaults.ts`:*
- Pure function: `async function runValentinaResearch(rows: ModelDefaultRow[]): Promise<ValentinaProposal[]>` — no DB imports, no storage imports.
- Input: array of `{ id, defaultKey, label, unit, value, category, sub_tab }` rows from `model_defaults WHERE lastSetSource='seed' AND category IN ('property', 'management_company')`.
- Filters out rows where benchmark research is inappropriate (e.g., structural defaults like `roomCount` or admin-preference values — filter by `sub_tab NOT IN ('funding')` or by a flag in the input). Also explicitly handles the `mc.property_defaults.adrByTier` JSON-blob row: because the proposal schema (`proposedValue`, `proposedRangeLow`, etc.) is scalar, Valentina cannot propose a new 6-tier bracket map using a single scalar proposal. For this row, Valentina adds it to `skipped` with `skipReason: "json-blob-row-requires-manual-research"` and includes its current seed values in the response body for admin visibility. Bracket-level research is deferred to a follow-up (likely alongside the `icp_brackets` extension in P2-C).
- For each eligible row, calls `resolveLlmFor("valentina-model-defaults-research")` and invokes the LLM with a research prompt that includes: the key label, current seed value, unit, and instructions to return `{ proposedValue, rangeLow, rangeHigh, authority, referenceUrl, conviction: "high"|"moderate"|"low", reasoning }`.
- Calls are batched where possible (one LLM call per card or sub_tab group) to reduce API cost.
- Returns `ValentinaProposal[]` — each element has `id` (the row's PK), the proposal fields, and `skipped: boolean` with `skipReason` for rows that were filtered.
- Calls `logApiCost({ operation: "valentina-model-defaults-research", route: "/api/admin/model-defaults/research" })` after each LLM call.

*Route handler (`POST /api/admin/model-defaults/research`):*
- `requireAdmin` middleware.
- Checks `valentina-enabled` feature flag; returns 503 with `{ error: "Valentina is not yet enabled", code: "MD-001" }` if flag is `0`.
- Fetches `model_defaults` rows where `lastSetSource='seed'` and appropriate category filter.
- Calls `runValentinaResearch(rows)`.
- For each proposal in the result: `db.update(modelDefaults).set({ proposedValue, proposedRangeLow, proposedRangeHigh, proposedAuthority, proposedReferenceUrl, proposedConviction, proposedAt: new Date() }).where(eq(modelDefaults.id, proposal.id))`.
- Returns `{ proposed: N, skipped: M, runId: researchRunId }`.

*Rebecca tool:*
- `trigger_model_defaults_research` — calls `POST /api/admin/model-defaults/research` (same route); returns the proposal count summary to the user in natural language.

**Execution note:** Implement and test `valentina-model-defaults.ts` with a mock LLM response first (pure function, easy to unit test) before wiring the admin route.

**Patterns to follow:**
- `artifacts/api-server/src/ai/analyst-refresh/reference-data.ts` — LLM call via `resolveLlmFor` + structured JSON return; caller owns DB writes.
- `artifacts/api-server/src/migrations/admin-resources-014.ts` — LLM slot + feature flag seed pattern.
- Pattern #10 (conviction labels), #13 (text-only output), #17 (flag large deviations from current value) from `docs/solutions/conventions/hplus-specialist-design-discipline-from-ce-researchers-2026-05-13.md`.
- Naming convention: Valentina — single name, cross-app specialist, Brazilian/Italian tradition (Italian).

**Test scenarios:**
- Happy path: `runValentinaResearch([{...rows}])` with mocked LLM returning valid JSON → returns `ValentinaProposal[]` with conviction, range, authority for each row.
- Happy path: route `POST /api/admin/model-defaults/research` (admin session) → 200 with `{ proposed: N, skipped: M }`.
- Edge case: empty array input (no `lastSetSource='seed'` rows remain) → returns `{ proposed: 0, skipped: 0 }` without calling LLM.
- Edge case: LLM returns malformed JSON for one row → that row is added to `skipped` with `skipReason: "parse-error"`, others are still persisted.
- Error path: feature flag `valentina-enabled=0` → route returns 503 `{ code: "MD-001" }`.
- Error path: non-admin user calls route → 403.
- Integration: after successful run, `SELECT proposed_value FROM model_defaults WHERE last_set_source='seed' AND category='property'` returns non-null for the rows that were proposed.
- Parity: Rebecca tool `trigger_model_defaults_research` triggers the same route and returns a human-readable summary.

**Verification:**
- `pnpm run typecheck` PASS
- `scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts` PASS (no model names or API slugs in source code)
- `scripts/node_modules/.bin/tsx scripts/src/check-ui-canonical.ts` PASS (no frontend changes)
- `pnpm run test` PASS
- `docs/discipline/agent-native-parity-map.md` updated with `trigger_model_defaults_research` ✅
- Admin route smoke-test: `POST /api/admin/model-defaults/research` with `valentina-enabled=1` → 200 response with proposal counts
- Pending-proposals queue in Model Defaults admin UI shows the Valentina-written proposals

---

## System-Wide Impact

- **Interaction graph:** `computePropertyDefaults` is called from `seedPropertyDefaults` (property creation) and `GET /api/properties/defaults/preview`. Both call sites gain a new `await buildModelDefaultsInput(scope)` call, adding ~1 DB round-trip to property creation. The preview endpoint similarly adds one round-trip.
- **Error propagation:** If `resolveDefault` returns null for a required key at runtime (post-seed): `buildModelDefaultsInput` throws, the route returns 500 with a descriptive error. This is the correct behavior — a missing row is a data integrity failure, not a graceful degradation case. The startup guard (U3) makes this path unreachable in production.
- **State lifecycle risks:** Valentina writes to `proposed_*` columns (not `value`). The `value` column (authoritative) is only updated when admin accepts via the existing accept-proposal route. No risk of Valentina overwriting admin-set values.
- **API surface parity:** `POST /api/admin/model-defaults/research` is a new admin-only endpoint. Rebecca `trigger_model_defaults_research` is the parity counterpart (R7). No existing endpoints are modified.
- **Unchanged invariants:** The `hydratePropertyFinancials` function is not changed. The three-layer resolver (Layer 1→2→3) continues to run at property creation. The `icp_brackets` Layer-2 overlay is not affected. The `PropertyDefaults` return type interface is not changed — all existing fields remain.
- **Integration coverage:** The production integration path (property creation → `buildModelDefaultsInput` → `computePropertyDefaults` receiving DB values) is the only path that cannot be fully proven by unit tests alone. A smoke-test against the dev DB (or a fixed integration test that seeds a `model_defaults` row and calls `POST /api/properties`) is recommended.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| `qualityTier` string values in the engine map do not match the DB column values — three-way conflict (Title Case in engine map, lowercase in DB, lowercase-hyphen in seed) → tier lookup returns `undefined` → property creation throws | U1 explicitly normalizes the engine map keys to match the DB column enum before seeding. U1 is the first unit and resolves this conflict before any other code change. U2 enforces the contract via `ModelDefaultsMissingTier` named error if a mismatch still exists. |
| Valentina LLM response JSON is malformed for a subset of rows → partial proposals written, others silently skipped | Route handler treats each proposal independently: parse-error rows go to `skipped` with reason; valid proposals are written. Caller receives the `skipped` count so admin knows some rows weren't proposed. |
| `DEFAULT_ADR_GROWTH_RATE` has import sites in test files that break after U4 removes it | Pre-U4: run `grep -r "DEFAULT_ADR_GROWTH_RATE"` to enumerate all sites. Update test files to use local fixture values before removing the export. |
| Valentina runs are expensive (N LLM calls for N seed rows) → accidental double-trigger | Feature flag (`valentina-enabled`) ships at `0`; admin explicitly enables. The route is idempotent: re-running overwrites `proposed_*` columns harmlessly. Consider adding a `runningAt` lock column or a simple in-memory mutex if concurrency risk is identified during implementation. |
| New `await buildModelDefaultsInput(scope)` adds latency to `POST /api/properties` | Three `resolveDefault` calls are parallel-friendly (use `Promise.all`). Each is a single indexed PK-equivalent lookup. Expected overhead < 5ms. |

---

## Sources & References

- **Origin document:** [docs/brainstorms/numeric-architecture-requirements.md](docs/brainstorms/numeric-architecture-requirements.md)
- Architecture constraint: CLAUDE.md §9 (CC-only surface), §2 (number taxonomy), §14 (retirement discipline), ADR-007
- Companion explainer: [docs/concepts/numeric-values-explained.md](docs/concepts/numeric-values-explained.md)
- ICP bracket slug incident: `docs/solutions/database-issues/icp-brackets-slug-mismatch-layer2-overlay-inert-2026-05-13.md`
- DI pattern reference: `docs/solutions/architecture-patterns/reference-brands-ai-pipeline-wiring-2026-05-02.md`
- LLM slot routing: `docs/solutions/architecture-patterns/matteo-multi-vendor-llm-slot-routing-2026-05-16.md`
- Specialist design discipline: `docs/solutions/conventions/hplus-specialist-design-discipline-from-ce-researchers-2026-05-13.md`
- Engine null-fallback rule: `docs/solutions/best-practices/coderabbit-false-positive-engine-null-fallbacks-2026-05-16.md`
