---
title: "CodeRabbit False Positive — Engine Fields Covered by Three-Layer Resolver Don't Need ?? Fallbacks"
date: 2026-05-16
category: best-practices
module: engine-three-layer-resolver
problem_type: best_practice
component: tooling
severity: low
applies_when:
  - "CodeRabbit suggests adding ?? 0 or ?? DEFAULT_X fallbacks for engine fields (exitCapRate, landValuePercent, dispositionCommission, etc.)"
  - Reviewing a CodeRabbit finding on lib/engine/src/ or lib/calc/src/ that recommends a null-guard on a property column
  - Drafting a reply to explain why a null-coalescing suggestion is a false positive
  - Adding a new column to the properties table that feeds the engine and deciding whether a TS fallback is needed
  - Onboarding a reviewer who asks why engine code has no null-guard fallbacks
tags:
  - coderabbit
  - false-positive
  - three-layer-resolver
  - engine-invariants
  - no-fallback-constants
  - model-defaults
  - icp-brackets
  - taxonomy-category-2
related_components:
  - database
---

# CodeRabbit False Positive — Engine Fields Covered by Three-Layer Resolver Don't Need ?? Fallbacks

## Context

CodeRabbit reviewed engine and finance code in PR #158 and suggested adding `?? 0`
null-coalescing fallbacks for `landValuePercent`, `exitCapRate`, and `dispositionCommission`,
claiming TypeScript types marked these as potentially null. Applying the suggestion would have
silently introduced Category 2 taxonomy violations (CLAUDE.md §2) — hardcoded business default
values in TypeScript — disguised as null-safety guards.

## Guidance

**The three-layer resolver invariant**

H+ Analytics guarantees that property columns feeding the financial engine are non-null at the
engine boundary. The guarantee is enforced by three layers:

| Layer | Mechanism | Owner |
|---|---|---|
| 1 | `model_defaults` table — universal fallback, admin-editable | DB (bootstrapped by migration SQL) |
| 2 | `icp_brackets` rows — bracket overlay applied at property creation | DB (resolver writes at POST /api/properties) |
| 3 | `properties` column — always populated by the resolver | DB (NOT NULL DEFAULT in schema) |

The DB schema enforces `NOT NULL DEFAULT <value>` on these columns. The resolver writes Layer 3
at property creation time via `applyBracketLayerDefaults` in `defaults.ts`, which is called
before the property row is committed. Engine code reads `property.exitCapRate` as a number —
not `number | null` — because the schema and resolver together make null structurally impossible
at the engine boundary.

**Why `?? 0` is a violation, not a fix**

```typescript
// VIOLATION — what CodeRabbit suggested
const landValue = property.landValuePercent ?? 0;
// This is equivalent to:
const DEFAULT_LAND_VALUE_PERCENT = 0; // Category 2 violation (CLAUDE.md §2)
const landValue = property.landValuePercent ?? DEFAULT_LAND_VALUE_PERCENT;
```

`?? 0` introduces a hardcoded business default into TypeScript. Even though it looks structural
("just a zero"), it acts as a financial assumption fallback. If the DB row is somehow null, the
engine silently uses 0% land value — a wrong financial answer with no error signal. The three-layer
resolver guarantee means this path is unreachable; if it ever is reached, the correct behavior
is a thrown error that surfaces the resolver gap, not a silent wrong answer.

**The right reply to CodeRabbit**

When CodeRabbit flags a resolver-covered field with a `?? 0` suggestion, reply:

> "This field is non-null by DB constraint and guaranteed by the three-layer resolver
> (model_defaults → icp_brackets → properties column). Adding `?? 0` would introduce a Category 2
> taxonomy violation per CLAUDE.md §2 — business default values must live in the DB, not in
> TypeScript. If a property reaches the engine with this field null, the correct behavior is a
> thrown error that surfaces the resolver gap, not a silent fallback to 0."

## Why This Matters

- **Taxonomy discipline**: `?? 0` in engine code is a Category 2 constant in disguise. If `0` is
  wrong for a given property (e.g., a property with 10% land value), the fallback silently produces
  incorrect financial projections with no visible error.
- **Resolver trust**: accepting `?? 0` implies the resolver might legitimately fail, which
  undermines the invariant the DB schema and resolver were designed to enforce.
- **False fix cost**: once a `?? fallback` lands in engine code, it becomes load-bearing for
  developers who assume "if this reaches 0, the resolver failed and we need to fix the resolver"
  — instead it silently hides the gap.

## When to Apply

- Any field enumerated in `applyBracketLayerDefaults` (`defaults.ts`) and `withFinancialHydration`
  is resolver-guaranteed. These fields should never have `?? N` fallbacks in engine code.
- When TypeScript's type says `number | null` but the DB column is `NOT NULL` with a resolver-write
  path, the right fix is to correct the TypeScript type to `number`, not to add a runtime fallback.
- Add a null assertion that throws at hydration time if the invariant is ever violated:

```typescript
// Pattern: assert loudly at the resolver boundary, not silently in engine code
function hydrateProperty(row: PropertyRow): HydratedProperty {
  if (row.exitCapRate == null) throw new Error(`exitCapRate null on property ${row.id} — resolver gap`);
  // ... rest of hydration
}
```

## Examples

**Before (violation — what CodeRabbit suggested):**

```typescript
function computeExitValue(property: Property) {
  const capRate = property.exitCapRate ?? 0.085; // silent wrong answer if null; also: 0.085 is a magic number
  return property.noi / capRate;
}
```

**After (correct — resolver guarantees non-null):**

```typescript
function computeExitValue(property: Property) {
  // TypeScript type is `number` because DB column is NOT NULL + resolver writes it
  return property.noi / property.exitCapRate;
}
```

**After (correct — if TypeScript type lags the schema):**

```typescript
function computeExitValue(property: Property) {
  if (property.exitCapRate == null) throw new Error(`exitCapRate null on property ${property.id}`);
  return property.noi / property.exitCapRate;
}
```

## Related

- `docs/solutions/conventions/no-hardcoded-integration-identifiers-convention-2026-05-09.md` —
  the broader no-magic-strings rule; `?? 0` is a Category 2 instance of the same taxonomy violation
- `.agents/skills/hplus-variable-taxonomy/SKILL.md` — full taxonomy with the three-layer resolver
  guarantee and the list of confirmed exceptions (algorithm calibration constants, SEED_* values)
- `artifacts/api-server/src/finance/defaults.ts` — `applyBracketLayerDefaults`: source of truth
  for which fields the resolver guarantees at property creation
