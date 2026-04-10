# Opus Audit #319: Shared Schema, Types & Constants — Findings Report

**Auditor**: Main Agent  
**Date**: 2026-04-10  
**Scope**: All files under `shared/` (schema, constants, types, utilities)  
**Files Reviewed**: 33 TypeScript files (~4,700 lines total)

---

## Executive Summary

The shared layer is **well-organized, thoroughly documented, and architecturally sound**. The 17-file schema split with barrel re-export is clean, constants follow a disciplined single-source-of-truth philosophy with rich USALI/GAAP sourcing, and utility files are minimal and purposeful. Financial defaults are well-sourced from industry authorities (USALI, IRS, HVS, Damodaran).

**Overall Assessment**: PASS — No critical defects found. Two medium-severity issues and four low-severity findings.

**Severity Distribution**:
- Critical: 0
- High: 0
- Medium: 2
- Low: 4

---

## Architecture Review

### Schema Organization (shared/schema/)

| File | Tables | Lines | Quality |
|------|--------|-------|---------|
| `core.ts` | companies, logos, assetDescriptions, userGroups, designThemes | 172 | Excellent |
| `auth.ts` | users, sessions | 82 | Excellent |
| `properties.ts` | properties, propertyUrls, userGroupProperties | 361 | Excellent |
| `config.ts` | globalAssumptions, seedDefaults | 361 | Strong |
| `scenarios.ts` | scenarios, scenarioPropertyOverrides, scenarioShares, scenarioAccess | 170 | Excellent |
| `scenario-results.ts` | scenarioResults | 31 | Excellent |
| `services.ts` | companyServiceTemplates, propertyFeeCategories, propertyPhotos | 155 | Excellent |
| `intelligence.ts` | marketResearch, prospectiveProperties, savedSearches, researchQuestions, marketRates | 166 | Strong |
| `intelligence-v2.ts` | 14 tables (guidance, research runs, benchmarks, Rebecca, KB, guardrails, etc.) | 438 | Strong |
| `audit.ts` | loginLogs, activityLogs, verificationRuns | 85 | Strong |
| `calc-audit.ts` | calculationAuditLogs | 57 | Excellent |
| `engagement.ts` | conversations, messages | 23 | Adequate |
| `notifications.ts` | alertRules, notificationLogs, notificationPreferences, notificationSettings, documentExtractions, extractionFields | 220 | Strong |
| `integrations.ts` | externalIntegrations | 44 | Excellent |
| `research-types.ts` | (types only — ResearchConfig, ResearchEventConfig, etc.) | 79 | Strong |
| `types/jsonb-shapes.ts` | (interfaces only — 16 JSONB shape definitions) | 192 | Adequate |
| `index.ts` | Barrel re-export | 17 | Excellent |

### Constants Organization (shared/constants*.ts)

| File | Lines | Purpose | Quality |
|------|-------|---------|---------|
| `constants.ts` | 294 | Barrel + core financial defaults (USALI, IRS, GAAP) | Excellent |
| `constants-business-models.ts` | 108 | Hotel/Lodge/VRBO expense profiles | Excellent |
| `constants-funding.ts` | 38 | SAFE/tranche/debt defaults | Excellent |
| `constants-research.ts` | 53 | Research thresholds and source registry | Excellent |
| `constants-capex.ts` | 19 | CapEx per-key costs and life-years | Excellent |
| `constants-staffing.ts` | 18 | Staffing tiers and overhead | Excellent |
| `constants-enums.ts` | 36 | PropertyStatus, UserRole, brand constants | Strong |

### Utility Files (shared/*.ts)

| File | Lines | Purpose | Quality |
|------|-------|---------|---------|
| `field-registry.ts` | 501 | Property field metadata with GA↔property mapping | Excellent |
| `countryDefaults.ts` | 271 | 11-country + 10-state financial defaults | Excellent |
| `countryRiskPremiums.ts` | 139 | Damodaran CRP table with geo-pattern lookup | Excellent |
| `market-intelligence.ts` | 318 | Market data type definitions (FRED, CoStar, Apify, etc.) | Excellent |
| `companyBenchmarks.ts` | 46 | HVS/USALI seed ranges for company metrics | Excellent |
| `sensitivity-types.ts` | 66 | Wire-format types for sensitivity API | Excellent |
| `verification-types.ts` | 29 | CheckResult & PropertyCheckResults | Excellent |
| `dates.ts` | 18 | parseLocalDate — timezone-safe date parsing | Excellent |
| `errors.ts` | 44 | FinancialCalculationError with Sentry tags | Excellent |

### Legacy Files (Dead Code)

| File | Lines | Status |
|------|-------|--------|
| `auth.ts` | 29 | **Legacy Replit Auth scaffold** — defines `users`/`sessions` tables that conflict with `schema/auth.ts`. Only imported by `server/replit_integrations/auth/storage.ts`. |
| `chat.ts` | 34 | **Dead file** — defines `conversations`/`messages` tables identical to `schema/engagement.ts`. Zero imports across the codebase. |

---

## Findings

### F319-1: `insertGlobalAssumptionsSchema` uses `.omit()` instead of `.pick()` (Medium)

**File**: `shared/schema/config.ts:339`  
**Rule Violated**: drizzle-zod governance — NEVER use `.omit()`, only `.pick()`

The global assumptions insert schema uses:
```ts
createInsertSchema(globalAssumptions, { ... }).omit({ updatedAt: true });
```

This is the only drizzle-zod `.omit()` in schema/ that operates on a large table (60+ columns). When new columns are added, they are automatically included in the insert schema unless someone remembers to add them to the omit list — a fragile inverse approach.

**Impact**: New columns added to `globalAssumptions` will automatically be accepted by the insert schema even if they should be excluded (e.g., computed fields, server-generated timestamps). Silently permissive.

**Note**: Three other `.omit()` usages exist in `audit.ts:20`, `scenario-results.ts:25`, and `chat.ts:20,25`. The audit.ts and scenario-results.ts cases omit only auto-generated fields (id, timestamps) on small tables — lower risk but still inconsistent with the project rule.

**Recommendation**: Convert to `.pick()` with explicit field list, consistent with all other schema files in the project. This is a large but mechanical change.

---

### F319-2: Duplicate `UserRole` definition with member mismatch (Medium)

**Files**: `shared/constants-enums.ts:14-24` and `shared/schema/auth.ts:45-46`

Two separate `UserRole` definitions exist with different members:

| Source | Members |
|--------|---------|
| `constants-enums.ts` UserRole object | admin, user, checker, **partner**, investor |
| `schema/auth.ts` VALID_USER_ROLES | admin, user, checker, investor |

The `partner` role exists in `constants-enums.ts` but is absent from `auth.ts:VALID_USER_ROLES`. This means:
- The `insertUserSchema` (which validates via `z.enum(VALID_USER_ROLES)`) will **reject** role="partner"
- Code importing `UserRole` from `constants-enums.ts` sees `partner` as valid
- Code importing `UserRole` type from `schema/auth.ts` does not include `partner`

The database `users.role` column is `text` with no CHECK constraint, so any string is technically accepted at the DB level.

**Impact**: If any code path attempts to create a user with role="partner" using the insert schema, it will fail validation. The two type definitions (`UserRoleValue` vs `UserRole`) have overlapping names and different shapes, creating confusion.

**Recommendation**: Decide whether "partner" is a valid role. If yes, add it to `VALID_USER_ROLES` in auth.ts. If no, remove it from `constants-enums.ts`. Either way, consolidate to a single canonical definition.

---

### F319-3: Legacy files with duplicate table definitions (Low)

**Files**: `shared/auth.ts` and `shared/chat.ts`

These two files appear to be scaffolding from an earlier Replit Auth integration and an abandoned chat prototype:

- **`shared/auth.ts`**: Defines `users` (varchar PK) and `sessions` (varchar PK) tables that structurally conflict with `shared/schema/auth.ts` (integer PK). Only one import exists (`server/replit_integrations/auth/storage.ts`), which uses the Replit Auth version.
- **`shared/chat.ts`**: Defines `conversations` and `messages` tables identical in purpose to `shared/schema/engagement.ts`. Zero imports — completely dead code.

**Impact**: No runtime impact since the barrel `shared/schema/index.ts` does not re-export either file. However, they create confusion for developers and could cause accidental wrong-import issues.

**Recommendation**: `shared/chat.ts` can be safely deleted. `shared/auth.ts` should be documented as the Replit Auth integration schema (intentionally separate from the app's auth schema).

---

### F319-4: `DebtAssumptions` interface defined twice with different shapes (Low)

**Files**: `shared/schema/types/jsonb-shapes.ts:147` and `shared/field-registry.ts:475`

| Location | All fields required? |
|----------|---------------------|
| `jsonb-shapes.ts` | Yes — `interestRate`, `amortizationYears`, etc. are all required |
| `field-registry.ts` | No — all fields are optional (`acqLTV?: number`, etc.) |

The jsonb-shapes.ts version is used as the JSONB column type for `globalAssumptions.debtAssumptions`. The field-registry.ts version is used internally in `buildPropertyDefaultsFromRegistry()`.

**Impact**: No runtime bug — the two types serve different purposes (strict JSONB storage vs. lenient lookup helper). But having two exported interfaces with the same name in the same `shared/` tree creates ambiguity. TypeScript doesn't flag this because neither file re-exports via the barrel.

**Recommendation**: Rename the field-registry version to `DebtAssumptionsPartial` or `DebtAssumptionsLookup` to eliminate ambiguity.

---

### F319-5: JSONB shapes use open `[key: string]: unknown` index signatures (Low)

**File**: `shared/schema/types/jsonb-shapes.ts` — 14 occurrences across 10 interfaces

The following interfaces include catch-all index signatures:
- `IcpResearchReport`, `IcpConfig`, `MarketResearchContent`, `PromptConditions`
- `ActivityLogMetadata`, `ScenarioGlobalAssumptionsSnapshot`, `ScenarioPropertySnapshot`
- `ScenarioFeeCategorySnapshot`, `ScenarioPhotoSnapshot`, `ScenarioImagesSnapshot`
- `ScenarioPropertyOverrideData`, `VerificationRunResults`, `NotificationLogMetadata`, `RawExtractionData`

**Impact**: These weaken TypeScript's compile-time safety — any arbitrary property can be assigned without type checking. For some interfaces (like `ScenarioPropertyOverrideData` which represents arbitrary property field diffs), this is intentional and necessary. For others (like `PromptConditions` which is `{ [key: string]: unknown }` with zero named properties), the interface adds no type value beyond `Record<string, unknown>`.

**Recommendation**: Acceptable for genuinely open shapes (scenario snapshots, override data). Consider tightening interfaces where the actual JSONB structure is known — e.g., `ActivityLogMetadata` could enumerate `previousValue`, `newValue`, `changedFields` without the index signature.

---

### F319-6: `shared/schema/engagement.ts` has no insert schemas or types (Low)

**File**: `shared/schema/engagement.ts` (23 lines)

This file defines `conversations` and `messages` tables but exports no insert schemas, no select schemas, and no TypeScript types (unlike every other schema file). The tables use only `integer("id").primaryKey().generatedAlwaysAsIdentity()` for ID generation — correct — but the absence of insert schemas means routes must construct raw objects without Zod validation.

**Impact**: Any route inserting into conversations or messages bypasses schema validation. This is compensated by the fact that these tables have very simple schemas (just `title`, `role`, `content` text columns), but it's inconsistent with the project's otherwise thorough validation pattern.

**Recommendation**: Add `insertConversationSchema`, `insertMessageSchema`, and corresponding types, following the pattern used everywhere else.

---

## Positive Observations

1. **Schema documentation is exceptional** — Nearly every table has a multi-line comment block explaining its business purpose, how it fits into the system, and key financial concepts. This is rare and extremely valuable.

2. **Check constraints on financial ranges** — Both `properties` and `globalAssumptions` use PostgreSQL CHECK constraints to enforce valid ranges (e.g., occupancy 0-1, cap rate 0-1). This provides database-level guardrails beyond application validation.

3. **Constants sourcing is rigorous** — Financial defaults cite USALI, IRS Publication 946, HVS Fee Survey 2024, Global Wellness Institute, and Damodaran NYU Stern. This is institutional-quality documentation.

4. **Country defaults are comprehensive** — 11 countries and 10 US states with depreciation authority citations, CRP values, and tax rates. The dollar-indexed economy handling (Argentina, El Salvador, Panama) is a sophisticated touch.

5. **Field registry pattern** — `shared/field-registry.ts` provides a single metadata registry mapping property fields to their GA sources, fallback values, and validation ranges. This eliminates scattered field-level logic.

6. **Business model profiles** — `constants-business-models.ts` cleanly separates Hotel/Lodge/VRBO financial profiles with per-model expense rates, revenue shares, and management fee structures. Platform fees are only applied to VRBO.

7. **Zero `as any` casts** — The entire `shared/` directory has zero type assertion escapes, which is outstanding for a ~4,700-line shared layer.

---

## Summary Table

| ID | Severity | Finding | File(s) |
|----|----------|---------|---------|
| F319-1 | Medium | `insertGlobalAssumptionsSchema` uses `.omit()` | config.ts:339 |
| F319-2 | Medium | Duplicate UserRole with member mismatch | constants-enums.ts / auth.ts |
| F319-3 | Low | Legacy dead files (auth.ts, chat.ts) | shared/auth.ts, shared/chat.ts |
| F319-4 | Low | Duplicate DebtAssumptions with different shapes | jsonb-shapes.ts / field-registry.ts |
| F319-5 | Low | 14 JSONB shapes with open index signatures | types/jsonb-shapes.ts |
| F319-6 | Low | engagement.ts missing insert schemas/types | engagement.ts |
