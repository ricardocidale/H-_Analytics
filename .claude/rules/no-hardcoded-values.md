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
