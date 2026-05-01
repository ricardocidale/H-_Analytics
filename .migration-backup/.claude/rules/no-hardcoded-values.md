# No Hardcoded Values

## Rule

**If it is not math or physics, it comes from the database.** No exceptions.

A number is math/physics if and only if it has exactly one interpretation regardless of context (e.g., `100` in a percent conversion, `12` as months-in-a-year divisor, `2` for midpoint). If a reasonable person could ask "should this be different for our portfolio?"— it is not math. It goes in the database.

## Three tiers — all live in Neon

| Tier | Neon table | TypeScript fallback | Who writes it |
|---|---|---|---|
| **Authority constants** | `model_canonicals` | named constant in `shared/constants.ts` | AI Intelligence specialists only |
| **Admin defaults** | `model_defaults` | `DEFAULT_*` constant in `shared/constants.ts` | Admin UI (Steady-State Defaults page) |
| **User assumptions** | `global_assumptions` / `properties` | `DEFAULT_*` constant in `shared/constants.ts` | Users (Company Assumptions / Property Edit) |

The fallback constant in `shared/constants.ts` is a **last resort** for when the database has not been seeded yet. At runtime the chain is always: **DB row → named constant**. Never: **raw literal**.

### Range-shaped defaults (Specialist watchdog benchmark bands)

Specialist watchdog reference ranges (low/mid/high bands) are a fourth shape of admin default. They drive Tier-0 deterministic verdicts and seed Tier-1 LLM-prompt context. Live as named `DEFAULT_*_BENCHMARK_{LOW,MID,HIGH}` constants in a sibling file (e.g. `shared/constants-overhead-benchmarks.ts`). The band object that consumers use is assembled by reference — never inline literals.

The named constants double as the SEED for any `admin_resources` benchmark row, `hospitality_benchmarks` row, or `reference_ranges` row that backs the Specialist; they are not "hardcoded fallbacks", they are the canonical source of truth for that calibration. Recalibration goes through commit + ADR, not admin keystrokes.

```ts
// CORRECT — named bench-band constants assembled by reference
export const DEFAULT_OFFICE_LEASE_BENCHMARK_LOW  = 24_000;
export const DEFAULT_OFFICE_LEASE_BENCHMARK_MID  = 36_000;
export const DEFAULT_OFFICE_LEASE_BENCHMARK_HIGH = 48_000;

export const DEFAULT_OVERHEAD_BENCHMARKS = {
  officeLeaseStart: {
    low:  DEFAULT_OFFICE_LEASE_BENCHMARK_LOW,
    mid:  DEFAULT_OFFICE_LEASE_BENCHMARK_MID,
    high: DEFAULT_OFFICE_LEASE_BENCHMARK_HIGH,
  },
  // …
};

// WRONG — inline literals inside the band object
export const DEFAULT_OVERHEAD_BENCHMARKS = {
  officeLeaseStart: { low: 24_000, mid: 36_000, high: 48_000 }, // ← magic numbers
};
```

The `_BENCHMARK_` infix distinguishes calibration ranges (Specialist-readable, never user-editable) from `DEFAULT_*_START` values that seed `global_assumptions` columns (point seeds for user-editable assumption rows). The two are different tiers and may diverge intentionally — a conservative tenant seed (`DEFAULT_OFFICE_LEASE_START = 36_000`) does not have to equal an industry midpoint (`DEFAULT_OFFICE_LEASE_BENCHMARK_MID = 36_000`); they happen to coincide here, but a different default could legitimately differ.

See `.agents/skills/constants-vs-defaults/SKILL.md` ("Range-shaped defaults — naming convention") for the worked example + binding pattern.

## The only allowed literals everywhere

- `27.5` — IRS Pub 946 depreciation life (structural law)
- `30.5` — days/month industry standard (365 ÷ 12)

Every other number must be a named constant or come from the database.

## Mandatory pattern

```typescript
// CORRECT — DB value → named constant fallback
const taxRate = globalAssumptions.companyTaxRate ?? DEFAULT_COMPANY_TAX_RATE;

// WRONG — hardcoded literal
const taxRate = 0.30;

// WRONG — unnamed magic number as fallback
const taxRate = globalAssumptions.companyTaxRate ?? 0.30;
```

## Before writing any number, answer these three questions

1. **Is this pure math or physics?** (`100`, `12`, `2`, `27.5`, `30.5`) → literal is OK.
2. **Can an admin or user ever want this to be different?** → must come from DB (model_defaults or global_assumptions/properties).
3. **Is it a regulatory/industry reference value?** → must come from DB (model_canonicals, written by AI Intelligence specialist). Named constant is the fallback only.

If you cannot answer "yes" to question 1, the number goes in the database.

## Enforcement

`tests/proof/hardcoded-detection.test.ts` runs in every `verify:summary`. It scans:
- All `engine/**` files
- All `calc/**` files
- All `client/src/lib/financial/**` files
- Audit/checker/export files

**New violations fail CI immediately.** The test has a `KNOWN_MAGIC_NUMBER_BASELINE` and `KNOWN_FORBIDDEN_BASELINE` of pre-existing violations that must shrink to zero over time. You may never add new entries to either baseline — fix the violation or don't write it.

## What is NOT a fallback constant (context matters)

A value like `0.65` appearing in the FORBIDDEN_LITERALS list (flagged as `DEFAULT_EVENT_EXPENSE_RATE`) may actually be a quality-tier occupancy minimum. The numeric coincidence doesn't make it the same constant. Each semantically distinct value needs its own named constant with its own DB source.

## Branding / admin settings (same rule, different surface)

Admin-configurable values (company name, theme colors, logo URLs, sidebar toggles, preferred LLM) come from the database. No literals, no constants.

**Branding resolution chain (never short-circuit):**
- Company name: `myBranding.groupCompanyName` → `globalAssumptions.companyName`
- Logo: group logo → management co. logo pool → legacy URL → default asset
- Theme: `user.selectedThemeId` → `userGroup.themeId` → system default (`isDefault = true`)
