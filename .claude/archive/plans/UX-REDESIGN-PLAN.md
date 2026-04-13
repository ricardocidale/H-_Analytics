# UX Redesign Plan: Defaults Governance & App Simplification

**Version**: 4.0 (corrected: 2 tabs, not 3 — defaults vs working variables)
**Date**: 2026-03-17
**Planned by**: Claude Code Opus 4.6 (Anthropic) in collaboration with the project owner
**Architecture clarification**: See `CLAUDE-CODE-INSTRUCTIONS-MODEL-DEFAULTS.md` for the definitive defaults vs working variables distinction

---

## For Replit Agent

This plan covers ONE thing: **consolidating all property creation defaults into a single "Model Defaults" admin section and simplifying what non-admin users see.**

Key architectural rule: **Model Defaults contains only defaults (templates for new properties) and global economic parameters. Company working variables (partner comp, funding, staffing, overhead) stay on the Company Assumptions page where they are today.**

See companion documents for other initiatives:
- `CLAUDE-CODE-INSTRUCTIONS-MODEL-DEFAULTS.md` — definitive architecture guide
- `MODEL-DEFAULTS-COMPLETION.md` — detailed implementation spec with schema changes
- `MARCELA-ISOLATION.md` / `MARCELA-RESTORATION.md` — voice agent management
- `ADMIN-SYSTEM-CLEANUP.md` — Diagrams and Integrations tab cleanup
- `APP-UX-ROADMAP.md` — optimizing existing features (no new code)
- `NEW-FEATURES-BACKLOG.md` — new feature ideas (not approved)

---

## Table of Contents

1. [The Problem](#1-the-problem)
2. [Design Principles](#2-design-principles)
3. [Defaults vs Working Variables](#3-defaults-vs-working-variables)
4. [What Changes for Users](#4-what-changes-for-users)
5. [Model Defaults — The New Admin Section](#5-model-defaults)
6. [Governed Fields](#6-governed-fields)
7. [Page Changes](#7-page-changes)
8. [Field Migration Map](#8-field-migration-map)
9. [Data Flow](#9-data-flow)
10. [Implementation Phases](#10-implementation-phases)

---

## 1. The Problem

Property creation defaults are scattered across multiple locations:

| Location | What's There | Who Accesses |
|----------|-------------|-------------|
| `/settings` ("General Settings") | Acquisition/refi financing defaults, inflation, fiscal year, display toggles | Management users |
| `/company/assumptions` | Exit cap rate, expense rates, catering boost (property defaults mixed in with company working variables) | Management users |
| Code constants (`shared/constants.ts`) | `DEPRECIATION_YEARS = 27.5`, `DAYS_PER_MONTH = 30.5`, `DEFAULT_START_ADR`, all `DEFAULT_*` values | No one (hardcoded) |

A user asking "where do I set the default interest rate for new properties?" has to guess. Exit cap rate is under Company Assumptions, but acquisition financing defaults are under Settings. ADR and occupancy defaults are invisible — hardcoded in client code.

**The fix:** One place for all property creation defaults (Admin > Model Defaults), clearly separated from company working variables.

---

## 2. Design Principles

1. **All property defaults in one place** — Admin > Model Defaults with 2 tabs: Market & Macro, Property Underwriting
2. **Defaults are templates, not live values** — They pre-fill new properties at creation. Changing a default does NOT retroactively change existing properties.
3. **Company working variables stay where they are** — Partner comp, funding, staffing, overhead, fees, tax are NOT defaults. They are live values on the Company Assumptions page.
4. **Non-admin users get a clean operational view** — No settings pages. Every sidebar item is something they use daily.
5. **Governed values inform, not block** — IRS/GAAP values are editable but carry a shield icon + authority citation.
6. **Config switches are not defaults** — Sidebar toggles, AI settings, display preferences stay in their admin tabs.
7. **Nullable with constant fallback** — New default columns are nullable. NULL = use hardcoded constant. Non-NULL = admin has explicitly set a custom default.

---

## 3. Defaults vs Working Variables

This is the key architectural distinction. See `CLAUDE-CODE-INSTRUCTIONS-MODEL-DEFAULTS.md` for the full explanation.

| Category | Where Edited | Purpose | Example |
|----------|-------------|---------|---------|
| **Default** | Admin > Model Defaults | Template value copied into new properties at creation | Default ADR ($250), default cost rate rooms (20%), default exit cap rate (8.5%) |
| **Working Variable** | Company Assumptions page | Live value directly driving the financial engine for the management company | Partner comp, staff salary, funding tranches, overhead costs, company tax rate |
| **Config Switch** | Various admin tabs | Platform behavior toggle — no entity field it pre-fills | Sidebar visibility, preferred LLM, tour prompt |

**The test:** Does this value get copied into a new property? → It's a default, put it in Model Defaults. Does it directly drive the management company engine? → It's a working variable, it stays on Company Assumptions.

---

## 4. What Changes for Users

### Non-Admin Users

**Before:** Sidebar has "General Settings" with 15 fields.

**After:**
- "General Settings" is **gone** from sidebar
- Every remaining sidebar item is operational
- Property Edit still fully editable (property owns its values after creation)
- Company Assumptions page **stays** (it has working variables that users may need to adjust)

**Sidebar before → after:**
```
Before:                          After:
SETTINGS                         ACCOUNT
  My Profile                       My Profile
  My Scenarios                     My Scenarios
  General Settings  ← REMOVED
```

### Admin Users

**Before:** Property defaults scattered across Settings page, Company Assumptions page, and code constants.

**After:**
- New **"Model Defaults"** in admin sidebar (currently in System group)
- Two tabs: Market & Macro, Property Underwriting
- All property creation defaults in one place
- Company Assumptions page remains for company working variables

---

## 5. Model Defaults — The New Admin Section (2 Tabs)

### Tab 1: Market & Macro

*"Global economic assumptions that provide context for research, benchmarking, and valuation calculations across all properties."*

#### Economic Environment

| Field | Type | Default | Governed? |
|-------|------|---------|-----------|
| Macro inflation rate | % | 3.0% | No |
| Cost of equity | % | 18.0% | No |
| Days per month | number | 30.5 | **Yes** — Industry standard (365/12) |

#### Fiscal Calendar

| Field | Type | Default |
|-------|------|---------|
| Fiscal year start month | select 1-12 | 1 (January) |

---

### Tab 2: Property Underwriting

*"Default values applied to new properties at creation. Each property can override these individually on its assumptions page."*

**On save, show toast:** *"Property defaults saved. These will apply to new properties. {N} existing properties retain their current values."*

#### Revenue Assumptions

| Field | Type | Default | Schema Column |
|-------|------|---------|---------------|
| Default room count | number | 10 | `defaultRoomCount` (NEW) |
| Default starting ADR | $ | 250 | `defaultStartAdr` (NEW) |
| Default ADR growth rate | % | 3.0% | `defaultAdrGrowthRate` (NEW) |
| Default starting occupancy | % | 55% | `defaultStartOccupancy` (NEW) |
| Default stabilized occupancy | % | 85% | `defaultMaxOccupancy` (NEW) |
| Default stabilization months | number | 6 | `defaultOccupancyRampMonths` (NEW) |
| Default F&B revenue share | % | 18% | `defaultRevShareFb` (NEW) |
| Default event revenue share | % | 30% | `defaultRevShareEvents` (NEW) |
| Default other revenue share | % | 5% | `defaultRevShareOther` (NEW) |
| Default catering boost | % | 22% | `defaultCateringBoostPct` (NEW) |

#### USALI Operating Cost Rates

**Departmental Expenses:**

| Field | Type | Default | Schema Column |
|-------|------|---------|---------------|
| Rooms expense rate | % | 20% | `defaultCostRateRooms` (NEW) |
| F&B expense rate | % | 9% | `defaultCostRateFb` (NEW) |

**Undistributed Operating Expenses:**

| Field | Type | Default | Schema Column |
|-------|------|---------|---------------|
| Admin / G&A rate | % | 8% | `defaultCostRateAdmin` (NEW) |
| Sales & Marketing rate | % | 1% | `defaultCostRateMarketing` (NEW) |
| Property Ops & Maintenance | % | 4% | `defaultCostRatePropertyOps` (NEW) |
| Utilities rate | % | 5% | `defaultCostRateUtilities` (NEW) |
| IT rate | % | 0.5% | `defaultCostRateIt` (NEW) |

**Fixed Charges:**

| Field | Type | Default | Schema Column |
|-------|------|---------|---------------|
| Property taxes rate | % | 3% | `defaultCostRateTaxes` (NEW) |
| Insurance rate | % | 1.5% | `defaultCostRateInsurance` (NEW) |
| FF&E reserve rate | % | 4% | `defaultCostRateFfe` (NEW) |

**Other:**

| Field | Type | Default | Schema Column |
|-------|------|---------|---------------|
| Other expense rate | % | 5% | `defaultCostRateOther` (NEW) |

**Revenue Stream Expense Rates (existing columns):**

| Field | Type | Default | Schema Column |
|-------|------|---------|---------------|
| Event expense rate | % | 65% | `eventExpenseRate` (EXISTS) |
| Other revenue expense rate | % | 60% | `otherExpenseRate` (EXISTS) |
| Utilities variable split | % | 60% | `utilitiesVariableSplit` (EXISTS) |

#### Acquisition Financing

| Field | Type | Default | Schema Column |
|-------|------|---------|---------------|
| Default LTV | % | 75% | `debtAssumptions.acqLTV` (EXISTS) |
| Default interest rate | % | 9.0% | `debtAssumptions.interestRate` (EXISTS) |
| Default term (years) | number | 25 | `debtAssumptions.amortizationYears` (EXISTS) |
| Default closing cost rate | % | 2.0% | `debtAssumptions.acqClosingCostRate` (EXISTS) |

#### Refinance Terms

| Field | Type | Default | Schema Column |
|-------|------|---------|---------------|
| Default refi LTV | % | 75% | `debtAssumptions.refiLTV` (EXISTS) |
| Default refi interest rate | % | 7.0% | `debtAssumptions.refiInterestRate` (EXISTS) |
| Default refi term (years) | number | 25 | `debtAssumptions.refiAmortizationYears` (EXISTS) |
| Default refi closing cost rate | % | 3.0% | `debtAssumptions.refiClosingCostRate` (EXISTS) |

#### Depreciation & Tax

| Field | Type | Default | Governed? | Schema Column |
|-------|------|---------|-----------|---------------|
| Depreciation years | number | 27.5 | **Yes** — IRS Pub 946 | `depreciationYears` (EXISTS) |
| Default property income tax rate | % | 25% | No | `defaultPropertyTaxRate` (NEW) |
| Default land value percent | % | 25% | No | `defaultLandValuePercent` (NEW) |
| Default property inflation rate | % | 3.0% | No | (uses `inflationRate` as fallback) |

#### Disposition

| Field | Type | Default | Schema Column |
|-------|------|---------|---------------|
| Default exit cap rate | % | 8.5% | `exitCapRate` (EXISTS) |
| Default sales commission | % | 5.0% | `salesCommissionRate` (EXISTS) |
| Default acquisition commission | % | 5.0% | `commissionRate` (EXISTS) |

#### Default Acquisition Package

| Field | Type | Default | Schema Column |
|-------|------|---------|---------------|
| Default purchase price | $ | 3,800,000 | `standardAcqPackage.purchasePrice` (EXISTS) |
| Default building improvements | $ | 1,200,000 | `standardAcqPackage.buildingImprovements` (EXISTS) |
| Default pre-opening costs | $ | 200,000 | `standardAcqPackage.preOpeningCosts` (EXISTS) |
| Default operating reserve | $ | 250,000 | `standardAcqPackage.operatingReserve` (EXISTS) |
| Default months to operations | number | 6 | `standardAcqPackage.monthsToOps` (EXISTS) |

---

## 6. Governed Fields

A governed field is any value backed by regulation, tax law, or industry standard. Editable but carries authority citation.

| Field | Authority | Location(s) |
|-------|-----------|-------------|
| Depreciation years (27.5) | IRS Publication 946 | Model Defaults > Property Underwriting AND Property Edit |
| Days per month (30.5) | Industry convention (365/12) | Model Defaults > Market & Macro |

### Visual Design

```
┌──────────────────────────────────────────────────┐
│  Depreciation Years                🛡 IRS Pub 946│
│  ┌──────────┐                                    │
│  │  27.5    │                                    │
│  └──────────┘                                    │
│  ▸ 27.5 years: residential rental property.      │
│    39 years: nonresidential real property.        │
│    Changing this deviates from standard tax       │
│    depreciation. Consult your tax advisor.        │
└──────────────────────────────────────────────────┘
```

Already implemented as `GovernedFieldWrapper` component in `client/src/components/ui/governed-field.tsx`.

---

## 7. Page Changes

### 7.1 Settings Page → ELIMINATED

The `/settings` page is removed. Its 15 fields move to:

| Current Field | Current Tab | Moves To |
|--------------|-------------|----------|
| Disposition commission | Property Defaults | Model Defaults > Property Underwriting > Disposition |
| Acquisition LTV, rate, term, closing | Property Defaults | Model Defaults > Property Underwriting > Acq Financing |
| Refi LTV, rate, term, closing, years-after | Property Defaults | Model Defaults > Property Underwriting > Refi Terms |
| Fiscal year start month | Macro | Model Defaults > Market & Macro |
| Inflation escalator | Macro | Model Defaults > Market & Macro |
| Show company calc details | Other | Admin > Navigation & Display |
| Show property calc details | Other | Admin > Navigation & Display |
| Auto-refresh research | Other | Admin > Research Center |
| Show tour prompt | Other | Admin > Navigation & Display |

"General Settings" removed from sidebar. `/settings` redirects.

### 7.2 Company Assumptions Page → STAYS (working variables)

**Previous plan** proposed moving all 63+ fields to Model Defaults. **This was wrong.**

**Corrected:** Company Assumptions page stays as-is. It contains working variables (partner comp, funding, staffing, overhead, tax, fees) that directly drive the management company engine. These are NOT defaults.

The only fields that **move out** of Company Assumptions are:
- Exit cap rate, sales commission → Model Defaults > Property Underwriting > Disposition (these are property defaults, not company working variables)
- Event expense rate, other expense rate, utilities variable split → Model Defaults > Property Underwriting > Operating Cost Rates (same reason)
- Catering boost % → Model Defaults > Property Underwriting > Revenue Assumptions (same reason)

### 7.3 Company Page (`/company`) — Model Inputs Panel

Add a **read-only expandable accordion** showing key company working variables:

```
▸ Model Inputs                           Set on Company Assumptions page

(when expanded:)
┌─────────────────────────────────────────────────────┐
│ Revenue: Base fee 8.5% · Incentive fee 12.0%        │
│ Funding: Tranche 1 $1.0M · Tranche 2 $1.0M         │
│ People: 3 partners · $75K/FTE · Tier 1: 2.5 FTE    │
│ Overhead: $36K office · $24K prof svc · 3%/yr esc   │
│ Tax: 30%                                            │
│                                                     │
│ [Edit on Company Assumptions page →]                │
└─────────────────────────────────────────────────────┘
```

### 7.4 Property Edit — Pre-fill from Defaults

When a user creates a new property, all fields are pre-filled from Model Defaults > Property Underwriting. The `buildPropertyDefaultsFromGlobal()` function in `server/routes/properties.ts` reads defaults from `globalAssumptions` with constant fallbacks:

```typescript
startAdr: ga?.defaultStartAdr ?? DEFAULT_START_ADR,
costRateRooms: ga?.defaultCostRateRooms ?? DEFAULT_COST_RATE_ROOMS,
exitCapRate: ga?.exitCapRate ?? DEFAULT_EXIT_CAP_RATE,
```

### 7.5 Admin Panel — Model Defaults Added

"Model Defaults" added to admin sidebar. Navigation tab renamed to "Navigation & Display" and gains display toggle + tour toggle fields from eliminated Settings page.

---

## 8. Field Migration Map

### From Settings Page (15 fields → Model Defaults + admin tabs)

| Field | Settings Tab | Moves To |
|-------|-------------|----------|
| Real estate commission | Property Defaults | Model Defaults > Property Underwriting > Disposition |
| Acquisition LTV, rate, term, closing | Property Defaults | Model Defaults > Property Underwriting > Acq Financing |
| Refi LTV, rate, term, closing, years-after | Property Defaults | Model Defaults > Property Underwriting > Refi Terms |
| Fiscal year start month | Macro | Model Defaults > Market & Macro |
| Inflation escalator | Macro | Model Defaults > Market & Macro |
| Show company calc details | Other | Admin > Navigation & Display |
| Show property calc details | Other | Admin > Navigation & Display |
| Auto-refresh research | Other | Admin > Research Center |
| Show tour prompt | Other | Admin > Navigation & Display |

### From Company Assumptions Page (only property defaults move)

| Section | Fields | Moves To |
|---------|--------|----------|
| Exit Assumptions | Exit cap rate, sales commission | Model Defaults > Property Underwriting > Disposition |
| Property Expense Rates | Event expense, other expense, utilities split | Model Defaults > Property Underwriting > Operating Costs |
| Catering | Catering boost % | Model Defaults > Property Underwriting > Revenue |

**Everything else on Company Assumptions STAYS:** Company identity, timeline, funding, fees, compensation, staffing, overhead, variable costs, tax. These are working variables.

### From Code Constants (NEW schema columns)

| Constant | Value | New Schema Column |
|----------|-------|-------------------|
| `DEPRECIATION_YEARS` | 27.5 | `depreciationYears` (already added) |
| `DAYS_PER_MONTH` | 30.5 | `daysPerMonth` (already added) |
| `DEFAULT_START_ADR` | 250 | `defaultStartAdr` (NEW) |
| `DEFAULT_ADR_GROWTH_RATE` | 0.03 | `defaultAdrGrowthRate` (NEW) |
| `DEFAULT_START_OCCUPANCY` | 0.55 | `defaultStartOccupancy` (NEW) |
| `DEFAULT_MAX_OCCUPANCY` | 0.85 | `defaultMaxOccupancy` (NEW) |
| `DEFAULT_OCCUPANCY_RAMP_MONTHS` | 6 | `defaultOccupancyRampMonths` (NEW) |
| `DEFAULT_ROOM_COUNT` | 10 | `defaultRoomCount` (NEW) |
| `DEFAULT_REV_SHARE_FB` | 0.18 | `defaultRevShareFb` (NEW) |
| `DEFAULT_REV_SHARE_EVENTS` | 0.30 | `defaultRevShareEvents` (NEW) |
| `DEFAULT_REV_SHARE_OTHER` | 0.05 | `defaultRevShareOther` (NEW) |
| `DEFAULT_CATERING_BOOST_PCT` | 0.22 | `defaultCateringBoostPct` (NEW) |
| `DEFAULT_COST_RATE_ROOMS` | 0.20 | `defaultCostRateRooms` (NEW) |
| `DEFAULT_COST_RATE_FB` | 0.09 | `defaultCostRateFb` (NEW) |
| `DEFAULT_COST_RATE_ADMIN` | 0.08 | `defaultCostRateAdmin` (NEW) |
| `DEFAULT_COST_RATE_MARKETING` | 0.01 | `defaultCostRateMarketing` (NEW) |
| `DEFAULT_COST_RATE_PROPERTY_OPS` | 0.04 | `defaultCostRatePropertyOps` (NEW) |
| `DEFAULT_COST_RATE_UTILITIES` | 0.05 | `defaultCostRateUtilities` (NEW) |
| `DEFAULT_COST_RATE_TAXES` | 0.03 | `defaultCostRateTaxes` (NEW) |
| `DEFAULT_COST_RATE_IT` | 0.005 | `defaultCostRateIt` (NEW) |
| `DEFAULT_COST_RATE_FFE` | 0.04 | `defaultCostRateFfe` (NEW) |
| `DEFAULT_COST_RATE_OTHER` | 0.05 | `defaultCostRateOther` (NEW) |
| `DEFAULT_COST_RATE_INSURANCE` | 0.015 | `defaultCostRateInsurance` (NEW) |
| (property tax rate) | 0.25 | `defaultPropertyTaxRate` (NEW) |
| (land value %) | 0.25 | `defaultLandValuePercent` (NEW) |

All new columns are **nullable**. NULL = use hardcoded constant fallback.

### Config Switches (NOT defaults — stay in current admin tabs)

| Switch | Stays In |
|--------|----------|
| Sidebar visibility toggles (×10) | Admin > Navigation & Display |
| Show calc details (×2) | Admin > Navigation & Display (moved FROM Settings) |
| Show tour prompt | Admin > Navigation & Display (moved FROM Settings) |
| Auto-refresh research | Admin > Research Center (moved FROM Settings) |
| Preferred LLM | Admin > Research Center (already there) |
| Rebecca enabled/config | Admin > AI Agents |

---

## 9. Data Flow

```
┌───────────────────────────────────────────────────┐
│           ADMIN > MODEL DEFAULTS                   │
│  ┌─────────────┐  ┌───────────────────────────┐   │
│  │ Market &    │  │ Property Underwriting      │   │
│  │ Macro       │  │ (templates for new props)  │   │
│  └──────┬──────┘  └────────────┬──────────────┘   │
└─────────┼──────────────────────┼──────────────────┘
          │                      │
          ▼                      ▼
    Research &              New property creation
    benchmarks              (buildPropertyDefaultsFromGlobal)
                                 │
                                 ▼
                            Property Edit
                            (pre-filled, user edits and saves)
                                 │
                                 ▼
                            Property OWNS its values

┌───────────────────────────────────────────────────┐
│      COMPANY ASSUMPTIONS PAGE (unchanged)          │
│  Partner comp, funding, staffing, overhead,        │
│  fees, tax — working variables for the engine      │
│         ↓                                          │
│    Company Pro-Forma (direct, live)                │
└───────────────────────────────────────────────────┘
```

**When admin changes a Property Underwriting default** → only affects next property created. Existing properties unchanged.

**When admin changes a Market & Macro value** → immediately affects research context and calculations reading this global value.

**When user changes Company Assumptions** → immediately affects company pro-forma (these are live working variables, not defaults).

---

## 10. Implementation Phases

### Phase 1: Schema — Add 23 nullable columns
**Effort:** Small | **Risk:** Low | **Depends on:** Nothing

Add missing columns to `globalAssumptions` for revenue defaults, USALI cost rate defaults, property tax rate, land value percent. All nullable — NULL = use constant fallback. See `MODEL-DEFAULTS-COMPLETION.md` Phase 1 for exact column list.

### Phase 2: Model Defaults UI — Complete & redesign
**Effort:** Medium | **Risk:** Medium | **Depends on:** Phase 1

Complete `ModelDefaultsTab.tsx`: add Revenue Assumptions section, expand USALI Operating Cost Rates to all 14 fields, add property tax rate and land value percent. Premium design upgrade. See `MODEL-DEFAULTS-COMPLETION.md` Phases 3-7 for full spec.

### Phase 3: Governed Field Component
**Effort:** Small | **Risk:** Low | **Depends on:** Nothing

Already implemented as `GovernedFieldWrapper`. Applied to depreciation years and days per month.

### Phase 4: Extend Property Creation Pre-fill
**Effort:** Small | **Risk:** Medium | **Depends on:** Phase 1

Update `buildPropertyDefaultsFromGlobal()` in `server/routes/properties.ts` to read new default columns with constant fallbacks. See `MODEL-DEFAULTS-COMPLETION.md` Phase 2.

### Phase 5: Eliminate Settings Page
**Effort:** Small | **Risk:** Low | **Depends on:** Phase 2

Remove `/settings` route and sidebar item. Add redirect. Move display toggles to Navigation & Display. Move research auto-refresh to Research Center. Move tour toggle to Navigation & Display.

### Phase 6: Move Property Defaults from Company Assumptions
**Effort:** Small | **Risk:** Low | **Depends on:** Phase 2

Move exit cap rate, sales commission, expense rates, and catering boost from Company Assumptions page to Model Defaults > Property Underwriting. These are the only fields that move — everything else stays.

### Phase 7: Code Constants Migration
**Effort:** Large | **Risk:** High | **Depends on:** Phase 1, 4

Migrate engine code to read `DEPRECIATION_YEARS` and `DAYS_PER_MONTH` from database instead of constants. 90+ files reference these. Migrate one at a time, full test suite after each.

### Phase 8: Testing & Documentation
**Effort:** Medium | **Risk:** Low | **Depends on:** All phases

Run `npm run verify:summary` → UNQUALIFIED. Run `npm run health`.

### Summary

| Phase | Work | Effort | Risk | Depends On |
|-------|------|--------|------|------------|
| 1 | Schema — 23 nullable columns | Small | Low | — |
| 2 | Model Defaults UI — complete & redesign | Medium | Medium | 1 |
| 3 | Governed Field Component | Done | — | — |
| 4 | Extend Property Creation Pre-fill | Small | Medium | 1 |
| 5 | Eliminate Settings Page | Small | Low | 2 |
| 6 | Move Property Defaults from Company Assumptions | Small | Low | 2 |
| 7 | Code Constants Migration | **Large** | **High** | 1, 4 |
| 8 | Testing & Documentation | Medium | Low | All |

---

*This document covers only the defaults governance redesign. For implementation details see `MODEL-DEFAULTS-COMPLETION.md`. For other initiatives see companion documents in `.claude/plans/`.*
