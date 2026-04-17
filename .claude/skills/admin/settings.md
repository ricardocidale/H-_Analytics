---
name: settings
description: Where configuration lives — seed defaults vs live assumptions vs config switches. The three categories of configurable values, where each is edited, and how they flow through the system.
---

# Settings Architecture — Where Configuration Lives

Every configurable value in the app falls into one of three categories. Knowing which category a value belongs to determines where it should be edited, how it behaves when changed, and who can access it.

**Related skills:** `finance/` (how engines consume values), `architecture/` (storage interface), `constants-governance/` (fallback constants)

---

## Terminology

| Term | Meaning |
|------|---------|
| **Seed default** | A template value that gets copied into a new property at creation time. Lives in Admin > Model Defaults. |
| **Live assumption** | A value the financial engine reads directly every time it runs. Lives in Company Assumptions or on the individual property. |
| **Config switch** | A toggle that controls UI behavior or platform features, not financial calculations. Lives in various admin tabs. |
| **Fallback constant** | A hardcoded value in `shared/constants.ts` used only when both the DB value and the admin override are NULL. Last resort. |

---

## The Three Categories

### 1. Seed Defaults (Templates for New Properties)

**What they are:** Starting values that get **copied into a new property** when it's created. After creation, the property owns its copy — changing the seed default has NO effect on existing properties.

**Where they're edited:** Admin > Model Defaults (2 tabs: Market & Macro, Property Underwriting)

**How they flow:**
```
Admin sets default ADR = $250 in Model Defaults
    ↓
User creates "Hotel Loch Sheldrake"
    ↓
buildPropertyDefaultsFromGlobal() reads defaults from globalAssumptions
    ↓
Property created with startAdr = $250 (copied from default)
    ↓
User edits property ADR to $300 and saves
    ↓
Admin later changes default ADR to $275
    ↓
Hotel Loch Sheldrake STILL has $300 (its own value)
NEXT new property will start at $275
```

**Technical pattern:** Seed default columns in `globalAssumptions` are **nullable**. NULL means "use the hardcoded constant from `shared/constants.ts`." The function `buildPropertyDefaultsFromGlobal()` in `server/routes/properties.ts` reads these at property creation time:

```typescript
startAdr: ga?.defaultStartAdr ?? DEFAULT_START_ADR,  // DB value or constant fallback
costRateRooms: ga?.defaultCostRateRooms ?? DEFAULT_COST_RATE_ROOMS,
```

**The test:** Does this value get copied into a new property at creation? → It's a seed default.

---

### 2. Live Assumptions (Active Financial Variables)

**What they are:** Values that **directly drive the financial engine** every time it runs. They are not templates — they ARE the live model inputs. Changing them takes effect immediately.

**Where they're edited:** Company Assumptions page (`/company/assumptions`) for company-level values; Property edit page (`/property/:id/edit`) for property-level values.

**Two sub-types:**

| Sub-type | Scope | Examples |
|----------|-------|---------|
| **Company assumptions** | Apply across the whole portfolio or to the management company entity | Base management fee rate, inflation rate, cost of equity, event expense rate |
| **Property assumptions** | Apply to one specific property, override any company-level default | This property's ADR, this property's cost rates, this property's exit cap rate |

**How they flow (company-level):**
```
User sets base management fee = 8.5% on Company Assumptions
    ↓
Company engine reads this value directly from globalAssumptions
    ↓
Company Income Statement shows fee revenue based on 8.5%
    ↓
User changes to 9.0% and saves
    ↓
Company Income Statement IMMEDIATELY updates
```

**How they flow (property-level):**
```
Engine resolves: property.costRateRooms ?? global.costRateRooms ?? DEFAULT_COST_RATE_ROOMS
    ↓
Property-specific value wins if set, else company assumption, else constant fallback
```

**The test:** Does this value directly drive a financial engine calculation and take effect immediately when changed? → It's a live assumption.

---

### 3. Config Switches (Platform Behavior)

**What they are:** Toggles that control **how the app looks and behaves** — what users see, which features are active, which AI model to use. They don't flow into financial calculations and don't pre-fill any entity.

**Where they're edited:** Various admin tabs (Navigation & Display, Research Center, AI Agents)

**Examples:**
| Switch | What It Controls | Admin Tab |
|--------|-----------------|-----------|
| `sidebarPropertyFinder` | Show Property Finder in sidebar | Navigation & Display |
| `showCompanyCalculationDetails` | Show formula breakdowns | Navigation & Display |
| `rebeccaEnabled` | Enable Rebecca chatbot | AI Agents |
| `preferredLlm` | Which AI model for research | Research Center |
| `autoResearchRefreshEnabled` | Auto-refresh stale research | Research Center |

**The test:** Does this toggle a UI feature or platform behavior without affecting financial numbers? → It's a config switch.

---

## The Dual-Residence Principle

**Most financial parameters live in two places simultaneously.** This is intentional, not duplication.

A single financial concept — say, "exit cap rate" — appears as:
1. A **seed default** in Model Defaults (8.5%) — template value copied into new properties at creation
2. A **live assumption** in Company Assumptions (8.5%) — the value the engine reads right now for company-level calculations

These are stored in the same `globalAssumptions` row but serve different purposes:

```
globalAssumptions.exitCapRate
    ├── Read by buildPropertyDefaultsFromGlobal() → copied into new property at creation (seed default)
    └── Read by resolve-assumptions.ts → used in live engine calculations (live assumption)
```

**Why dual-residence exists:** The management company is a single entity that doesn't get "created" like properties do. Its assumptions are always live. But when a new property is created, it needs sensible starting values. The same `globalAssumptions` field serves both roles.

**When a field is NOT dual-residence:**
- **Seed-only fields** use the `default*` naming convention (e.g., `defaultStartAdr`, `defaultRoomCount`). These are pure templates — the engine never reads them directly. They only flow through `buildPropertyDefaultsFromGlobal()`.
- **Live-only fields** have no `default*` counterpart (e.g., `partnerCompensation`, `capitalRaise1`). These are consumed directly by the company engine and never copied into properties.

**Examples of dual-residence fields:**
| Field | Seed Role (Model Defaults) | Live Role (Company Assumptions) |
|-------|---------------------------|-------------------------------|
| `exitCapRate` | Default exit cap for new properties | Current portfolio exit assumption |
| `salesCommissionRate` | Default commission for new properties | Current disposition commission |
| `eventExpenseRate` | Default event cost ratio for new properties | Current event expense ratio used by engine |
| `utilitiesVariableSplit` | Default variable/fixed split for new properties | Current split used by engine |
| `costOfEquity` | Not a seed default (company-only) | WACC discount rate for DCF |

**Examples of seed-only fields (NOT dual-residence):**
| Field | Why Seed-Only |
|-------|--------------|
| `defaultStartAdr` | ADR is purely per-property; no company-level ADR concept |
| `defaultRoomCount` | Room count is per-property only |
| `defaultOccupancyRampMonths` | Ramp period is per-property only |
| `defaultCateringBoostPct` | DEPRECATED — catering boost no longer used in revenue calc |

**Rule: When in doubt about whether a field needs dual-residence, it probably does.** Nearly all financial parameters that affect property calculations also have a company-level interpretation. Only fields that are purely physical property attributes (room count, ADR) are seed-only.

---

## Quick Decision Guide

```
"Where does this new setting belong?"

Does it get COPIED into a new property at creation?
  YES → Seed Default → Admin > Model Defaults > Property Underwriting
       Also ask: does the engine read this from globalAssumptions directly?
         YES → Dual-residence: also add to Company Assumptions
         NO  → Seed-only (use `default*` column naming)
  NO ↓

Does it directly drive the company financial engine?
  YES → Live Assumption → Company Assumptions page
  NO ↓

Is it a global economic parameter (inflation, fiscal year)?
  YES → Market Parameter → Admin > Model Defaults > Market & Macro
  NO ↓

Does it toggle a UI feature or platform behavior?
  YES → Config Switch → Relevant admin tab
  NO → Ask the project owner before implementing
```

---

## Where Each Category Lives

### Admin > Model Defaults > Market & Macro
Global economic context — not entity-specific.
- Macro inflation rate, cost of equity, days per month (governed), fiscal year start month

### Admin > Model Defaults > Property Underwriting
Templates for new properties — copied at creation, then independent.
- Revenue defaults (ADR, occupancy, ramp, revenue shares as % of total revenue)
- USALI operating cost rates (11 rates across departmental, undistributed, fixed charges)
- Revenue stream expense rates (event, other, utilities split)
- Acquisition financing defaults (LTV, rate, term, closing costs)
- Refinance defaults
- Depreciation & tax (depreciation years, income tax rate, land value %)
- Disposition (exit cap rate, commissions)
- Default acquisition package (purchase price, improvements, reserves)

### Company Assumptions Page (`/company/assumptions`)
Live assumptions — directly consumed by the financial engine.
- Company identity (name, logo, contact, address)
- Timeline (model start date, ops start date, projection years)
- Funding (SAFE tranches, valuation cap, interest)
- Management fees (base %, incentive %)
- Compensation (salary, tiers, partner comp)
- Overhead (office, professional services, tech, insurance)
- Variable costs (travel, IT, marketing, misc ops)
- Tax (company tax rate, company inflation)
- Exit & valuation (cost of equity, exit cap rate, sales commission) — dual-residence with Model Defaults
- Property expense rates (event, other, utilities split) — dual-residence with Model Defaults

### Property Edit (`/property/:id/edit`)
Per-property values — override company assumptions and seed defaults.
- Everything from Property Underwriting defaults but specific to this property
- Plus: property name, location, dates, photos, fee categories

### Various Admin Tabs
Config switches — platform behavior toggles.
- Navigation & Display: sidebar toggles, calculation detail toggles, tour prompt
- Research Center: LLM selection, per-domain research behavior, auto-refresh
- AI Agents: Rebecca config

---

## Resolution Order (Engine Priority)

When the financial engine needs a value, it resolves through a 3-tier fallback chain:

```
property.costRateRooms          ← Per-property override (if set)
  ?? global.costRateRooms       ← Company assumption / seed default from globalAssumptions
    ?? DEFAULT_COST_RATE_ROOMS  ← Hardcoded constant (last resort)
```

This is implemented in `resolve-assumptions.ts`:
```typescript
const costRateRooms = property.costRateRooms ?? global.costRateRooms ?? DEFAULT_COST_RATE_ROOMS;
```

For seed-only fields (no company-level meaning), the resolution at creation time is:
```
ga?.defaultStartAdr ?? DEFAULT_START_ADR  → copied into property.startAdr
```
After creation, the property owns its value and the chain is just:
```
property.startAdr ?? DEFAULT_START_ADR
```

---

## Key Rules

1. **Seed defaults never affect existing properties.** Only the next property created gets the new value.
2. **Live assumptions take effect immediately.** The engine reads these on every calculation.
3. **Property values always win.** Engine priority: property → global assumption → hardcoded constant.
4. **All seed default columns are nullable.** NULL = use constant fallback. Non-NULL = admin set a custom default.
5. **Dual-residence is the norm for financial parameters.** If a rate applies to property calculations AND the engine reads it from `globalAssumptions`, it belongs in both Model Defaults and Company Assumptions.
6. **Seed-only fields use the `default*` naming convention.** Fields like `defaultStartAdr`, `defaultRoomCount` are never read directly by the engine — only by `buildPropertyDefaultsFromGlobal()`.
7. **Never put live assumptions in Model Defaults alone.** If the engine reads it, users need to edit it on Company Assumptions too.
8. **Never put config switches in financial surfaces.** If it toggles behavior without affecting numbers, it belongs in its admin tab.

---

## Key Files

| File | Role |
|------|------|
| `client/src/components/admin/ModelDefaultsTab.tsx` | Model Defaults UI (seed defaults + market parameters) |
| `client/src/pages/CompanyAssumptions.tsx` | Company live assumptions UI |
| `client/src/pages/PropertyEdit.tsx` | Per-property value editing |
| `shared/schema/config.ts` | `globalAssumptions` table (stores all three categories) |
| `server/routes/properties.ts` | `buildPropertyDefaultsFromGlobal()` — where seed defaults flow to new properties |
| `client/src/lib/financial/resolve-assumptions.ts` | Resolution order — property → global → constant |
| `shared/constants.ts` | Hardcoded fallback constants (last resort when DB value is NULL) |
