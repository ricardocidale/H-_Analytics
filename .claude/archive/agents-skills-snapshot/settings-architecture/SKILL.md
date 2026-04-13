---
name: settings-architecture
description: Where every configurable setting belongs in HBG Portal. Covers three configuration surfaces (Management Company, General Settings, Admin Panel), property overrides, and overlap prevention. Use when adding or moving settings.
---

Where every configurable setting belongs in the HBG Portal. Covers the three configuration surfaces (Management Company, General Settings, Admin Panel), property edit overrides, overlap prevention rules, and the decision tree for placing new settings. Use this skill when adding or moving any configurable setting.

## The Three Configuration Surfaces

### 1. Management Company Page (`/company` + `/company/assumptions`)

**Owner:** The management entity itself — its identity, revenue model, and operating costs.

**What belongs here:**
- Company identity: name, logo, contact info, EIN, address, founding year
- Company timeline: operations start date, projection years
- Revenue model: service fee category templates, incentive management fee rate
- Operating costs: staffing tiers, compensation schedules, fixed overhead, variable costs
- Funding: SAFE note tranches, amounts, dates, gates
- Company-specific economics: company tax rate, company inflation rate, cost of equity

**Decision test:** "Does this setting describe *what the management company is* or *how it operates*?" -> It belongs here.

**Sub-pages:**
- `/company` — Financial statements (Income, Cash Flow, Balance Sheet) with CompanyHeader KPIs
- `/company/assumptions` — All assumption inputs organized by section

### 2. General Settings (`/settings`)

**Owner:** System-wide defaults and preferences.

**Tabs:**
- **Property Defaults** — Default values for new properties (cost rates, financing terms, revenue shares, exit cap rate, commissions)
- **Macro** — Economic factors (global inflation rate, fiscal year start month)
- **Other** — UI behavior (calculation transparency toggles, research auto-refresh, guided tour)

**Decision test:** "Is this a default for *new properties* or *platform-wide behavior*?" -> It belongs here.

**Critical rule:** New properties MUST read defaults from General Settings (`global_assumptions`), not from hardcoded constants in `shared/constants.ts`. Hardcoded constants are last-resort fallbacks only.

### 3. Admin Panel (`/admin`)

**Owner:** Platform administration — system administrator only.

**What belongs here:** User management, ICP/Research Center config, AI agent config, design system, navigation toggles, system monitoring, notification rules.

**What does NOT belong here:** Financial defaults (-> General Settings), company identity/operating assumptions (-> Management Company), anything a Partner user should adjust.

**Decision test:** "Would a non-admin user ever need to see or change this?" -> If yes, NOT Admin.

## Property Edit (`/properties/:id/edit`)

Each property SPV's specific deal terms. Property-level values always override system defaults. Engine priority: `property value -> global_assumptions default -> hardcoded constant`.

## Overlap Prevention Rules

1. **No duplicate controls.** A setting appears in exactly ONE editable location. Read-only displays acceptable if clearly marked.
2. **No admin-only duplicates.** If editable on Management Company page, must NOT also be editable in Admin.
3. **Template vs. instance.** Fee categories on ManCo are *templates*; on Property Edit they are *instances* (copies that can diverge).
4. **New properties inherit.** Property creation reads from `global_assumptions`. Hardcoded constants are last-resort fallbacks.

## Decision Tree for New Settings

1. About the management company entity? -> Management Company assumptions
2. Default for new properties? -> General Settings -> Property Defaults
3. Platform-wide economic factor? -> General Settings -> Macro
4. UI/behavior preference? -> General Settings -> Other
5. System administration? -> Admin Panel
6. Specific to one property? -> Property Edit

## Key Files

| File | Purpose |
|------|---------|
| `client/src/pages/Settings.tsx` | General Settings page |
| `client/src/pages/CompanyAssumptions.tsx` | Management Company assumptions |
| `client/src/pages/PropertyEdit.tsx` | Property-level settings |
| `client/src/pages/Admin.tsx` | Admin Panel |
| `shared/schema/` | `globalAssumptions` and `properties` table definitions (split across `config.ts`, `properties.ts`) |
| `server/storage.ts` | Storage interface for CRUD operations on settings |
