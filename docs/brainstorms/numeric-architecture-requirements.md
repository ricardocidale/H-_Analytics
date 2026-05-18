# Numeric Architecture Requirements
## What Constants, Defaults, and Seed Values Are — and Where They Live

**Status:** Draft — brainstorm output (2026-05-18)
**Phase:** Requirements (precedes planning of Phase 2)
**§2 campaign:** PAUSED pending Phase 2 plan

---

## Problem Statement

The §2 type-tightening campaign (Sessions 17–20) was retiring `DEFAULT_*` TypeScript constants by moving their values to inline literals in schema `.default()` clauses and engine/calc code. This created a codebase where programmer-decided numbers (e.g., `0.03` ADR growth rate, `250` starting ADR) were hardcoded in multiple places rather than being owned by the research system.

The deeper issue: no one had written down what the correct rule is. As a result, different sessions held different mental models, and the campaign made progress in the wrong direction.

This document captures the correct architecture so every future session works from the same understanding.

---

## Three-Pillar Architecture

### Pillar A — Math/Physics Constants (unchanged from prior understanding)

Only genuine mathematical or physical universals belong in `constants.ts`.

Examples: `MONTHS_PER_YEAR = 12`, `DAYS_PER_YEAR = 365`, `HOURS_PER_DAY = 24`

These are not financial assumptions. They cannot be researched into a different value. They live in TypeScript forever.

### Pillar B — Seed Values and Admin-Managed DB Defaults

All financial assumption values — cost rates, growth rates, occupancy targets, ADR, room count defaults — belong in the **`model_defaults` DB table**, not in TypeScript.

Two sub-layers:

**B1 — Property Seeds (bootstrap values for Analyst-driven research):**
Values in `model_defaults` seeded at `lastSetSource: 'seed'` are programmer-guessed starting points. They are temporary placeholders. The explicit goal is that every such row should be replaced by values that originate from Analyst research (`lastSetSource: 'analyst_accepted'`).

The Analyst-proposes / admin-disposes workflow is already designed into the schema:
```
proposedValue, proposedRangeLow, proposedRangeHigh
proposedAuthority, proposedReferenceUrl, proposedConviction
lastSetSource: 'seed' | 'manual' | 'analyst_accepted'
```

A row with `lastSetSource: 'seed'` is a DEBT MARKER — it means "an Analyst agent has not yet researched this value." These rows should be driven to zero over time.

**B2 — Bracket Overlays (icp_brackets):**
`icp_brackets` table provides Layer-2 bracket-specific overlays (by country, quality tier, business model). These also start programmer-guessed and should be driven by Analyst research over time.

**B3 — Admin-Managed Overrides:**
Admin can set values manually via the Model Defaults UI. These override the seed/Analyst value at `lastSetSource: 'manual'`.

### Pillar C — Per-Entity User Values (permanent SSoT once saved)

`properties.adr_growth_rate`, `properties.start_adr`, `properties.start_occupancy`, etc. are the Layer-3 per-entity values. Once a user has saved a value, the DB row is the authority — no fallback constants apply.

The three-layer resolver guarantees Layer-3 is always populated at entity creation (from Layer-1/Layer-2 seeds). Engine code reads the column directly — never via `?? DEFAULT_*` fallbacks.

---

## Value Resolution Hierarchy

```
1. properties.* column (Layer 3 — per-entity, user-owned)
       ↓ always populated at creation time via resolver
2. icp_brackets (Layer 2 — bracket overlay, Analyst-researched over time)
       ↓ falls through when NULL
3. model_defaults (Layer 1 — universal seed, Analyst-researched over time)
       ↓ bootstrapped with programmer guess at `lastSetSource: 'seed'`
4. Schema .default() clause (DB safety net — absolute last resort)
       ↓ DB never returns NULL for NOT NULL column
```

The schema `.default()` clause exists as a database safety net. It is **not** an application-layer resolution step. The application never relies on it — the three-layer resolver always populates Layer-3 before a property reaches the engine.

### What this means for TypeScript

The only numbers that should appear as TypeScript constants or inline literals:
- Pillar A (math/physics universals)
- Structural indices/clamps: `0`, `1`, `-1`
- Algorithm calibration (IRS/GAAP-derived, non-admin-configurable)
- `SEED_*` constants in bootstrap-only surfaces (seed scripts, migration guards)

Financial assumption values (`0.03`, `0.55`, `250`, `0.85`, etc.) are NOT in this list. They belong in the DB.

---

## What Is Already Built

The infrastructure is largely in place:

| Component | Status |
|---|---|
| `model_defaults` table with Analyst proposal columns | ✅ Built |
| `icp_brackets` table with scope predicates | ✅ Built |
| Three-layer resolver (Layer 1→2→3 at entity creation) | ✅ Built |
| Seed script populating `model_defaults` at `lastSetSource: 'seed'` | ✅ Built |
| Model Defaults admin UI (view/edit current values) | ✅ Built |
| Analyst-proposes / admin-disposes UI (pending proposals queue) | ✅ Built (schema) |
| `getFactoryNumber` for country-specific rates (registry keys) | ✅ Built |

What is NOT yet built:

| Component | Status |
|---|---|
| Analyst agent that researches financial assumption values and writes `proposedValue` rows to `model_defaults` | ❌ Not built |
| `computePropertyDefaults` reading from `model_defaults` for property-level defaults (start ADR, occupancy, growth rates) | ❌ Not wired |
| `icp_brackets` rows populated from Analyst research (not programmer guesses) | ❌ Not done |

---

## The §2 Campaign — What It Got Right and Wrong

### What it got right

Eliminating TS constants as the authority source for financial assumption values is correct. `DEFAULT_EXIT_CAP_RATE = 0.085` is a category error — that number is a financial assumption that should come from research, not a programmer decision baked into source code.

### What it got wrong

The retirements replaced TS constants with **inline literals in engine/calc code**. That's the same error with a different address:
- `const adrGrowthRate = 0.03; // schema default` (in `default-resolver.ts`)
- `property.adrGrowthRate ?? 0.03` (in `exit-scenarios.ts`)

A schema `.default(0.03)` clause is also not the solution — it's a DB safety net, not an application-layer ownership claim.

The correct retirement path for a financial assumption constant:
1. Ensure the value exists in `model_defaults` (seed row) — already done
2. Ensure the three-layer resolver populates Layer-3 at entity creation — already done
3. Ensure engine code reads the Layer-3 column directly (`property.adrGrowthRate`) — already done
4. Remove the TS constant — then the removal is structural (engine never needed it) rather than cosmetic (replacing it with an inline literal)

### Retirements done in Sessions 17–20 — assessment

| Constant | Value type | Surfaces it went to | Assessment |
|---|---|---|---|
| `DEFAULT_ALERT_COOLDOWN_MINUTES` | System/operational | system config | ✅ Correct — not a financial assumption |
| `DEFAULT_MARKETING_RATE` | Financial cost rate | seed, field-registry, routes | ⚠️ DB model_defaults already has this; inline in routes is a soft fallback, acceptable for now |
| `DEFAULT_MISC_OPS_RATE` | Financial cost rate | seed, field-registry, routes | ⚠️ Same as above |
| `DEFAULT_ROOM_COUNT` | Structural default | seed, field-registry, UI, routes | ⚠️ Structural; inline at UI/route level is acceptable |
| `DEFAULT_START_ADR` | Financial assumption | seed, field-registry, UI, routes | ⚠️ Inline in field-registry/routes is a soft fallback; seed correctly seeded in model_defaults |
| `DEFAULT_ADR_GROWTH_RATE` | Financial assumption | **engine/calc inline** | ❌ Wrong — reverted (0.03 appeared in `default-resolver.ts` and `exit-scenarios.ts`); restoring the constant |

The committed retirements (ALERT_COOLDOWN, MARKETING_RATE, MISC_OPS_RATE, ROOM_COUNT, START_ADR) are acceptable because they did NOT inline values into engine/calc code. They remain committed. Their model_defaults seed rows are now `lastSetSource: 'seed'` — debt markers awaiting Analyst research.

---

## Phase 2 — What Needs to Be Built

### P2-A: Analyst Research Agent for Model Defaults

An Analyst agent (or orchestrated research run) that:
1. Fetches industry benchmarks for each `model_defaults` row where `lastSetSource = 'seed'`
2. Writes `proposedValue`, `proposedRangeLow`, `proposedRangeHigh`, `proposedAuthority`, `proposedReferenceUrl`, `proposedConviction`
3. Sets `proposedAt` timestamp
4. Leaves `lastSetSource = 'seed'` until admin accepts

Admin then reviews and accepts proposals via the Pending Proposals queue → sets `lastSetSource = 'analyst_accepted'`.

### P2-B: Wire `computePropertyDefaults` to Read from `model_defaults`

`lib/engine/src/helpers/default-resolver.ts` currently uses:
- `QUALITY_TIER_ADR` (hardcoded tier→ADR mapping)
- `adrGrowthRate = 0.03` (hardcoded)
- `maxOccupancy = 0.85` (hardcoded)

These should be read from `model_defaults` rows for the matching scope (country, quality tier, business model). The route layer fetches the relevant `model_defaults` rows and passes them as a parameter to `computePropertyDefaults` (no DB access in engine — per ADR-007).

Scope resolution for `model_defaults`: most-specific matching row wins (country + subdivision + businessType + sizeBand), falls back to universal row.

### P2-C: `icp_brackets` Research Run

Each `icp_brackets` row that currently holds programmer-guessed values (exit cap rate, LTV, etc.) should be updated via Analyst research, following the same Analyst-proposes / admin-disposes pattern (requires adding proposal columns to `icp_brackets` if not already present).

---

## Scope Boundaries

### In scope for this architecture

- Where financial assumption numbers live (model_defaults, NOT TypeScript)
- How they get populated (Analyst research → admin acceptance)
- How engine code reads them (via route layer, no direct DB access in engine)
- What `lastSetSource: 'seed'` means (debt marker, not permanent)

### Out of scope (deferred)

- The specific Analyst agent implementation (separate plan)
- The `icp_brackets` proposal column extension (separate plan)
- Migration of existing `lastSetSource: 'seed'` rows to Analyst-researched values
- The `DEFAULT_PROPERTY_INCOME_TAX_RATE` and `DEFAULT_LAND_VALUE_PERCENT` cross-cutting retirements (already have dedicated plan docs)
- The remaining Tier 1 T1-4 targets (`DEFAULT_TRAVEL_COST_PER_CLIENT`, `DEFAULT_IT_LICENSE_PER_CLIENT`) — on hold until Phase 2 is planned

### Not in scope for any session

- `DEFAULT_ADR_GROWTH_RATE` retirement — BLOCKED until P2-B wires `computePropertyDefaults` to read from model_defaults (otherwise there's nowhere safe to move it)
- Removing `??` fallbacks in engine/calc code — only after Layer-3 is guaranteed populated for ALL entities (migration verification needed)

---

## Success Criteria

1. No financial assumption value appears as a TypeScript constant (Category 2 = LEGACY DEBT fully retired)
2. No financial assumption value appears as an inline literal in `lib/engine/src/`, `lib/calc/src/`, or `artifacts/api-server/src/finance/`
3. Every `model_defaults` row has `lastSetSource = 'analyst_accepted'` (all seed debt markers resolved via research)
4. `computePropertyDefaults` reads its tier defaults from `model_defaults` rows, not hardcoded maps
5. The magic numbers ratchet baseline continues to decrease (not increase) with each session

---

## Immediate Decisions (locked)

| Decision | Ruling |
|---|---|
| §2 retirement campaign | PAUSED — resume only after P2-B is designed and approved |
| `DEFAULT_ADR_GROWTH_RATE` | RESTORED — stays as TS constant until P2-B wires model_defaults into the resolver |
| Sessions 17–20 committed retirements | KEEP — they went to appropriate surfaces; their seed rows are now debt markers |
| `getFactoryNumber('adrGrowthRate')` | BLOCKED — key not in MODEL_CONSTANTS_REGISTRY, do not add it there; growth rates are a model_defaults concern, not a country-rate registry concern |
| Schema `.default()` for financial values | Use as DB safety net only; never rely on it as application resolution |
