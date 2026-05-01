# H+ Analytics — Master Implementation Plan

> **For any AI agent reading this:** This document is the single source of truth for the H+ Analytics product evolution. Read this FIRST before making any code changes. Read ALL `.claude/skills/business-model/` files and `docs/research/` files for deep context. This plan was developed through extensive discussion with the product owner and deep industry research.

---

## CONTEXT FOR NEW AGENTS (Replit, Claude Code, or any future chat)

### What Is This App?
H+ Analytics is a **fundraising intelligence platform** for a boutique hospitality management company. It is NOT an operating system. It is NOT a spreadsheet. It helps the company build credible financial models to raise capital from sophisticated investors (PE, family offices, HNWIs).

### What Makes It Valuable?
The **AI research engines** are the product. They supply the judgment that a human hospitality analyst would need years of experience to have. When someone enters "20-room boutique wellness hotel on 50 acres in the Catskills," the engines should understand what that means financially — comparable ADR ranges, realistic occupancy ramps, cost structures, financing terms, cap rates — the same way an experienced analyst would. Without the research engines, this is just Excel with a nicer UI.

### The Business Model (Two Businesses)
1. **The Brand/Management Company (ManCo):** Builds a hospitality brand focused on vertical communities (wellness, sexual wellness, corporate retreats, health/healing). Earns management fees from every property. The brand's value grows with each property.
2. **Each Property (SPV):** Independent real estate investment. Own investors, own capital structure, own debt. Pays fees to ManCo. Buys a large residential estate → converts to boutique hotel → operates under the brand → exits at a gain.

### Two Property Models
1. **Hotel Model** (all properties except Medellín duplex): ADR × rooms × occupancy. Target 50/50 rooms/F&B revenue split.
2. **Luxury Rental Model** (Medellín duplex type): Per-property-per-night pricing. Capacity-based (beds/people), not per-room revenue.

### Current Portfolio
- Medellín, Colombia — luxury rental (duplex)
- Cartagena, Colombia — Obra Pía (hotel, 50/50 F&B)
- New York State — 2 properties (hotel, estate conversions)
- Utah — 1 property (hotel, NOTE: restrictive liquor laws)

### Critical Rules
- **No magic numbers.** Only MONTHS_PER_YEAR=12 and DAYS_PER_MONTH=30.5 may be hardcoded. Everything else is DB-backed and country/state/city/research-driven.
- **Financial statement lines are FIXED.** Admin influences via percentages, not by adding/removing lines.
- **Properties are NEVER deleted.** Only toggled ON/OFF per scenario/user.
- **ALL models need F&B revenue.** Even luxury rentals.
- **ALL properties pay brand/management fees.** Marketing & Brand and incentive fees are mandatory.
- **If research hasn't run, fields should be EMPTY** — not pre-filled with US-centric guesses.
- **The chatbot is named Rebecca**, not Marcela.

### Key Reference Documents
- `.claude/skills/business-model/SKILL.md` — Complete business model
- `.claude/skills/business-model/vertical-communities.md` — Target markets and ICPs
- `.claude/skills/business-model/conversion-pipeline.md` — How properties are created
- `.claude/skills/business-model/comparable-companies.md` — Ennismore, Nobu, Selina lessons
- `.claude/skills/product-vision/product-direction.md` — Admin redesign, product roadmap
- `.claude/skills/research/research-intelligence-strategy.md` — Research engine architecture
- `.claude/skills/testing/golden-scenario-methodology.md` — Testing approach
- `docs/research/hospitality-classification-and-benchmarks.md` — STR scales, USALI, cap rates, ramp-up data
- `docs/research/hospitality-fee-structures.md` — Management fee benchmarks worldwide
- `docs/research/hospitality-data-apis.md` — Data sources, APIs, costs, integration priority
- `docs/research/conversion-economics.md` — Costs, timelines, zoning, permits, examples
- `docs/research/vertical-community-hospitality.md` — Market sizes, quality gap, ICPs, pricing
- `docs/research/similar-business-models.md` — Comparable companies, scaling phases, valuations

---

## TOOL ASSIGNMENT — WHO DOES WHAT

Three tools are available. Each has strengths and weaknesses. Using the wrong tool for a task causes bugs.

### The Three Tools

| Tool | Best For | Avoid For |
|------|----------|-----------|
| **Replit Agent (Architect mode)** | UI/frontend, admin redesign, component creation, anything touching Replit config/Vite/Tailwind/shadcn, visual work | Backend math, multi-file schema refactors, engine calculations |
| **Claude Code CLI (Replit Shell)** | Schema migrations, engine math, calc/ changes, backend routes, test files, surgical multi-file refactors | Large UI overhauls (tends to overshoot and break things) |
| **Claude Code Web (this planning chat)** | Planning, research, architecture decisions, writing specs/prompts, reviewing changes, deep thinking | Direct code changes to the live app |

### The Rule
**CLI touches the math and the data. Replit Agent touches the screen. Web does the thinking.**

When a task needs both backend and frontend:
1. CLI goes FIRST (schema, server, engine)
2. Replit Agent goes SECOND (UI components that consume the new backend)
3. Never both at the same time on the same files

### Task Assignment by Phase

| Phase | Task | Tool | Why |
|-------|------|------|-----|
| **0.1** | Fix verification retention | **CLI** | One-line backend change |
| **0.2** | Move fast-check to devDeps | **CLI** | package.json edit |
| **0.3** | Rename Marketing → Marketing & Brand | **CLI** | String constants, seed data |
| **0.4** | Fix VRBO F&B = 0 | **CLI** | Constants file |
| **0.5** | Remove dead feature flags | **CLI** | Multi-file backend search + removal |
| **0.6** | Documentation commit | **CLI** | Git operations |
| **1.1-1.3** | Add schema fields | **CLI** | Schema + migrations + types |
| **1.4** | Drop user groups (server) | **CLI** | Schema, storage, routes, auth |
| **1.4** | Drop user groups (client) | **Replit Agent** | Component deletion, UI cleanup |
| **1.5** | Add business brand entity | **CLI** | Schema + migration |
| **1.6** | Expand country defaults | **CLI** | Shared constants + DB |
| **1.7** | Add fee fields | **CLI** | Schema + types |
| **2.1** | Restructure admin sidebar | **Replit Agent** | UI navigation redesign |
| **2.2** | Delete duplicate components | **Replit Agent** | UI cleanup |
| **2.3** | Per-user default scenario UI | **CLI** first (backend), then **Replit Agent** (UI) |
| **2.4** | Required fields config UI | **CLI** first (backend), then **Replit Agent** (UI) |
| **3.1** | Fix F&B revenue model | **CLI** | Critical math — precision required |
| **3.2** | Luxury rental revenue model | **CLI** | New engine path — precision required |
| **3.3** | Add seasonality | **CLI** | Engine math |
| **3.4** | Improve occupancy ramp | **CLI** | Engine math |
| **3.5** | Owner's priority return | **CLI** | Engine math |
| **3.6** | Fee subordination | **CLI** | Engine math |
| **4.1** | FRED API integration | **CLI** | Backend service |
| **4.2** | Damodaran data loader | **CLI** | Backend service |
| **4.3** | Source management system | **CLI** first (DB + routes), then **Replit Agent** (admin cards UI) |
| **4.4** | Range badge UX | **Replit Agent** | UI component |
| **4.5** | Entity-aware research context | **CLI** | Backend prompt construction |
| **5.1** | Create golden scenarios | **CLI** | Test files, no UI |
| **5.2** | Edge case tests | **CLI** | Test files |
| **5.4** | Admin testing dashboard | **Replit Agent** | UI enhancement |
| **6.1** | Rebecca screen context | **CLI** first (backend), then **Replit Agent** (UI integration) |
| **6.2** | Enhanced RAG content | **CLI** | pgvector indexing |
| **6.3** | pgvector optimization | **CLI** | Backend service |
| **7.1** | Export template enhancement | **Replit Agent** | Visual/formatting work |
| **7.2** | Portfolio consolidated exports | **CLI** first (data), then **Replit Agent** (UI) |

---

## REPLIT ENVIRONMENT & CONSTRAINTS

### Replit-Specific Limitations
- **File size:** Replit can struggle with very large files. Keep individual changes focused.
- **Build time:** The app uses Vite + TypeScript. Builds can be slow on Replit. Test incrementally.
- **Database:** PostgreSQL on Replit (Neon or Replit DB). Migrations via Drizzle Kit (`npm run db:push`).
- **Context window:** Both Replit Agent and CLI have limited context. Feed ONE task at a time from this plan, with explicit file paths and line numbers. Always tell them to read `docs/MASTER-PLAN.md` and the relevant `.claude/skills/` files first.
- **Environment:** `.env` file contains API keys. Never commit secrets. Use `.env.example` as reference.
- **Package install:** `npm install` can timeout on Replit. If adding dependencies, do it separately from code changes.
- **Replit Agent overshoots less** than CLI on UI work — it understands Replit's Vite/Tailwind/shadcn setup natively.
- **CLI overshoots on UI** — it sometimes makes changes that break the build because it doesn't "see" the running app. Use CLI for backend, Replit Agent for frontend.

### Workflow for Each Task
1. Pull latest from GitHub: `git pull origin main`
2. Pick ONE task from this plan
3. Decide: CLI or Replit Agent? (See task assignment table above)
4. Give the chosen tool: (a) the task description, (b) relevant file paths, (c) the "WHY" section
5. **Tell it:** "Read `docs/MASTER-PLAN.md` for full context before starting."
6. Review the changes before committing
7. Run tests: `npm test`
8. If tests pass: commit and push
9. If task has a frontend part after backend: switch tools and do the UI portion
10. Pull in the other environment if working across Replit + external

---

## PHASE 0: FOUNDATION (No Breaking Changes)
**Goal:** Fix known issues, clean up, prepare for larger changes. Nothing here changes app behavior.

### 0.1 Fix Verification Run Retention
**WHY:** Verification runs currently auto-delete after 7 days. Financial audit history must persist for compliance and credibility.
**FILES:** `server/storage/activity.ts` lines 67-69
**CHANGE:** Change retention from 7 days to 365 days (1 year).
**RISK:** Low. Additive change.

### 0.2 Move `fast-check` to devDependencies
**WHY:** Property-based testing library is in production dependencies. Inflates bundle.
**FILES:** `package.json` line 96
**CHANGE:** Move `"fast-check": "^3.23.2"` from `dependencies` to `devDependencies`.
**RISK:** Low. Must verify no production code imports it.

### 0.3 Rename "Marketing" Service Fee to "Marketing & Brand"
**WHY:** The franchise/brand fee is embedded in this service category. The name should reflect that properties pay for the brand, not just marketing.
**FILES:** `shared/constants.ts` lines 106, 123. Anywhere "Marketing" appears as a service fee category name.
**CHANGE:** Rename string from "Marketing" to "Marketing & Brand" in DEFAULT_SERVICE_FEE_CATEGORIES and DEFAULT_SERVICE_TEMPLATES.
**RISK:** Low. String change only. Check seed data and any UI that displays the name.

### 0.4 Fix VRBO Business Model F&B = 0
**WHY:** ALL property models must include F&B revenue. Even a luxury rental has welcome baskets, catering, events, cooking experiences. Zero F&B is wrong.
**FILES:** `shared/constants-business-models.ts` lines 77-98
**CHANGE:** Set VRBO `costRateFB` and `revShareFB` to non-zero values. Suggest `costRateFB: 0.05` (5%), `revShareFB: 0.10` (10%) as minimum starting points — research engines will refine per property.
**RISK:** Low-Medium. Changes default calculations for any existing VRBO-type property.

### 0.5 Remove Dead Feature Flags
**WHY:** All 4 feature flags default to `true` and have likely been `true` for a long time. The v1 code paths are probably dead.
**FILES:** `server/feature-flags.ts`, then grep for `flag("RI_V2_WRITE")` etc. across codebase.
**APPROACH:** First, search for all usages. If v1 paths are truly dead (no `if (!flag(...))` branches with meaningful code), remove the flag system and dead branches. If any v1 paths are still meaningful, leave them.
**RISK:** Medium. Must verify no important code depends on flags being false.

### 0.6 Documentation Commit
**WHY:** All the research docs and updated skills need to be in the repo.
**FILES:** `docs/research/*.md`, `.claude/skills/business-model/*.md`, `.claude/skills/product-vision/product-direction.md`, `.claude/skills/research/research-intelligence-strategy.md`, `.claude/skills/testing/golden-scenario-methodology.md`
**CHANGE:** Commit all new/updated documentation files.
**RISK:** Zero. Documentation only.

---

## PHASE 1: DATA MODEL & SCHEMA EVOLUTION
**Goal:** Expand the database schema to support the full product vision. Schema changes are foundational — everything else builds on them.

### 1.1 Add Property Quality Tier Field
**WHY:** Star ratings don't work internationally. Need a word-based quality tier (Luxury → Economy) that drives comp set selection and ADR expectations.
**FILES:** `shared/schema/properties.ts`, migration file
**CHANGE:**
- Add `qualityTier` field: `text("quality_tier").notNull().default("upscale")`
- Valid values: `luxury`, `upper_upscale`, `upscale`, `upper_midscale`, `midscale`, `economy`
- Keep existing `starRating` field for countries where stars are government-mandated (Colombia, France, Spain)
- Add `qualityTier` to `PropertyInput` in `engine/types.ts`
**RISK:** Low. Additive. Existing properties get default "upscale".

### 1.2 Add Property Descriptor Fields
**WHY:** Research engines need enough context to find comparable properties. Currently missing: service level, location type, market tier, guest mix, F&B capacity.
**FILES:** `shared/schema/properties.ts`, migration file
**NEW FIELDS:**
```
serviceLevel: text("service_level") — full_service, select_service, limited_service, all_inclusive, luxury_rental
locationType: text("location_type") — urban, suburban, resort, airport, highway, rural_estate
marketTier: text("market_tier") — gateway, secondary, tertiary
guestMixBusiness: real("guest_mix_business") — % business travelers (0-1)
guestMixLeisure: real("guest_mix_leisure") — % leisure travelers (0-1)
guestMixGroup: real("guest_mix_group") — % group travelers (0-1)
fbVenues: integer("fb_venues") — number of F&B outlets
fbSeats: integer("fb_seats") — total F&B seating capacity
eventSpaceSqft: integer("event_space_sqft") — total event space square footage
totalPropertyAcreage: real("total_property_acreage") — land size in acres
totalBuildingSqft: integer("total_building_sqft") — total building square footage
yearBuilt: integer("year_built")
lastRenovationYear: integer("last_renovation_year")
managementType: text("management_type") — brand_managed, third_party, owner_operated
onMunicipalSewer: boolean("on_municipal_sewer").default(false) — affects room expansion capacity
```
**RISK:** Low. All nullable or with defaults. Additive migration.

### 1.3 Add Conversion Cost Fields to Properties
**WHY:** The property pipeline is residential → hotel conversion. Investors need to see the full capital stack: acquisition + conversion + room additions + venue + kitchen + pre-opening.
**FILES:** `shared/schema/properties.ts`, migration file
**NEW FIELDS:**
```
conversionCost: real("conversion_cost") — main structure renovation
roomAdditionCost: real("room_addition_cost") — A-frames, cabins, glamping units
eventVenueCost: real("event_venue_cost") — barn/outbuilding conversion
commercialKitchenCost: real("commercial_kitchen_cost")
zoningPermitCost: real("zoning_permit_cost") — soft costs
fireCodeAdaCost: real("fire_code_ada_cost") — sprinklers, ADA compliance
liquorLicenseCost: real("liquor_license_cost")
operatingDeficitReserve: real("operating_deficit_reserve") — cash for ramp-up losses
estimatedConversionMonths: integer("estimated_conversion_months")
```
**RISK:** Low. All nullable. Additive.

### 1.4 Simplify User System — Drop Groups
**WHY:** User groups add complexity (white-label branding, property visibility filtering) that the product no longer needs. Company is free text. ~49 files impacted.
**FILES:** Major multi-file change. See `project_user_simplification.md` for full impact list.
**APPROACH:**
1. First: Add migration to DROP `user_group_id` FK from users, DROP `user_group_properties` table, DROP `user_groups` table
2. Then: Remove all references from server code (storage, routes, auth, helpers)
3. Then: Remove all client components (UserGroupsTab, GroupsTab, group-related dialogs)
4. Then: Remove schema definitions from `shared/schema/core.ts`
5. Keep `users.company` free text field (already exists)
6. Drop `users.companyId` FK (keep only the free text)
**RISK:** HIGH. Breaking change across ~49 files. Must be done carefully with tests after each step. Do this in a dedicated branch. Run full test suite before merging.

### 1.5 Add Business Brand Entity
**WHY:** Single brand now, but architecture must support multiple brands. This is a lightweight entity that all properties reference.
**FILES:** New table in schema, migration
**NEW TABLE:**
```
business_brands: id, name, description, logoId, isDefault, createdAt
```
**CHANGE:** Add `brandId` FK to `properties` table (nullable, defaults to brand 1).
**RISK:** Low. Additive. Single brand seeded as default.

### 1.6 Expand Country Defaults to Include State/City Tiers
**WHY:** Hotel taxes are per-city, property taxes are per-state. The current flat country defaults miss this hierarchy.
**FILES:** `shared/countryDefaults.ts`, possibly new DB table
**APPROACH:**
- Keep `COUNTRY_DEFAULTS` for country-level values (depreciation, income tax, inflation)
- Remove `adrGrowthRate` and `exitCapRate` from country defaults (these are research-engine-driven, NOT country defaults)
- Expand `US_STATE_DEFAULTS` to include more states
- Add concept of city-level defaults (hotel tax / tourism tax)
- Consider moving to DB-backed table instead of TypeScript constants (for admin-refreshable values)
**RISK:** Medium. Changes how defaults are resolved. Must update all consumers.

### 1.7 Add Owner's Priority Return and Fee Subordination Fields
**WHY:** Industry standard for boutique operators. Investors expect to see these terms.
**FILES:** `shared/schema/properties.ts` or `shared/schema/config.ts`, engine types
**NEW FIELDS on properties:**
```
ownerPriorityReturn: real("owner_priority_return") — % of equity (e.g., 0.10 = 10%)
feeSubordination: text("fee_subordination") — none, partial, full
performanceTestEnabled: boolean("performance_test_enabled").default(false)
```
**NEW FIELDS on global_assumptions:**
```
defaultOwnerPriorityReturn: real("default_owner_priority_return")
defaultFeeSubordination: text("default_fee_subordination").default("partial")
```
**RISK:** Low. Additive fields. Engine changes needed to apply hurdle before incentive fee.

---

## PHASE 2: ADMIN SECTION REDESIGN
**Goal:** Reorganize admin into 10 functional blocks. This is primarily a frontend restructure with some backend route changes.

### 2.1 Restructure Admin Sidebar Navigation
**WHY:** Current admin has 30+ sections with aliases and duplicates. Needs clear functional blocks.
**FILES:** `client/src/components/admin/AdminSidebar.tsx`, `client/src/pages/Admin.tsx`
**NEW STRUCTURE:**
```
Management Company
  ├── Financial Defaults
  ├── Services & Fees
  └── Company Profile

Properties
  ├── Hotel Model Defaults
  ├── Luxury Rental Defaults
  └── Required Fields Configuration

AI Research Engines
  ├── Sources & APIs
  ├── LLM Configuration
  └── Engine Health

Users
  └── User Management

Scenarios
  ├── All Scenarios
  └── Default Assignments

Rebecca (AI Assistant)
  ├── Configuration
  └── Knowledge Base

Themes & Appearance

App Settings

Testing & Verification

Reports & Exports
```
**RISK:** Medium. Large UI refactor. Existing functionality preserved, just reorganized.

### 2.2 Delete Duplicate Components
**WHY:** `UserGroupsTab.tsx` and `GroupsTab.tsx` are duplicates. After Phase 1.4 (drop groups), both are deleted. Additionally, several alias sections in Admin.tsx can be cleaned up.
**FILES:** Components listed in `project_user_simplification.md`
**RISK:** Low after Phase 1.4 is complete.

### 2.3 Build Per-User Default Scenario Assignment UI
**WHY:** Admin assigns each user a default scenario by toggling properties ON/OFF.
**FILES:** New component in `client/src/components/admin/users/`
**UI DESIGN:**
- Admin selects a user
- Sees chevron-expandable list of ALL properties in the app
- Each property row shows: name, location, business model, status
- ON/OFF toggle per property for that user's default scenario
- Save button persists the assignment
- Properties are NEVER deleted — only toggled
**BACKEND:** New table or extend existing scenario_access to support admin-assigned defaults.
**RISK:** Medium. New feature, needs new backend endpoint + DB support.

### 2.4 Build Required Fields Configuration UI
**WHY:** Admin controls which property fields are required before research can run. ON/OFF switches per field.
**FILES:** New component in admin Properties section
**APPROACH:** Store required-field configuration in `global_assumptions` (new JSONB column) or separate table. Research engine checks required fields before executing.
**RISK:** Low-Medium. New feature.

---

## PHASE 3: FINANCIAL ENGINE UPDATES
**Goal:** Fix the financial calculations to match reality. This is where wrong numbers get fixed.

### 3.1 Fix F&B Revenue Model
**WHY:** Current F&B at 18% of room revenue ≈ 12% of total. Need to support 35-50% of total revenue. This is the single biggest number error.
**FILES:** `shared/constants.ts`, `shared/constants-business-models.ts`, `engine/property/property-engine.ts`, `engine/types.ts`
**APPROACH:**
- The current model calculates F&B as `revShareFB × roomRevenue`. To reach 50% of total revenue, `revShareFB` would need to be ~1.0 (100% of room revenue). This is mathematically correct but semantically confusing.
- **ALTERNATIVE:** Change the model to express F&B as a percentage of TOTAL revenue, not room revenue. This requires engine refactoring but is more intuitive.
- Consult the existing help files and tooltips to understand the current intent before changing.
- Whatever the approach, the DEFAULT values must result in realistic revenue splits (50/50 for Obra Pía, 60/40 for typical hotel).
**RISK:** HIGH. Changes every property's financial projections. Must have golden scenario tests BEFORE making this change. Must run verification suite after.

### 3.2 Implement Luxury Rental Revenue Model
**WHY:** The Medellín duplex doesn't price per-room. It prices per-property-per-night based on capacity, location, and uniqueness.
**FILES:** `engine/property/property-engine.ts`, `engine/types.ts`, new fields needed
**APPROACH:**
- Add to `PropertyInput`: `pricingModel: "per_room" | "per_property"`, `nightlyPropertyRate: number`, `maxGuests: number`
- When `pricingModel === "per_property"`: revenue = `nightlyPropertyRate × daysPerMonth × occupancy`
- Room count still tracked for capacity but not for per-room revenue
- F&B and events revenue calculated similarly but on different base
- Simpler expense structure (fewer USALI categories needed)
**RISK:** HIGH. New revenue calculation path in the engine. Needs thorough testing.

### 3.3 Add Seasonality (Monthly Distribution Factors)
**WHY:** The current model generates flat monthly revenue. Real hotels have 30-50 point occupancy swings between peak and trough. Investors will immediately ask "where's seasonality?"
**FILES:** `engine/property/property-engine.ts`, `engine/types.ts`, new fields
**APPROACH:**
- Add `seasonalityProfile: number[]` (12 monthly factors, default all 1.0 for flat)
- Research engines suggest profile based on location and property type
- Apply factors to occupancy AND ADR monthly calculations
- Example: Caribbean resort Jan=1.4, Feb=1.5, Mar=1.6, Sep=0.4
- Keep it simple: one array of 12 multipliers. Don't over-engineer.
**RISK:** Medium. Changes monthly projections. Existing tests may need adjustment.

### 3.4 Improve Occupancy Ramp Model
**WHY:** Current step-function ramp is mechanical and unrealistic. Real ramp follows a curve: Year 1 = 50-75% of stabilized, Year 2 = 70-90%, stabilization in 3-5 years.
**FILES:** `engine/property/property-engine.ts`, research engine output
**APPROACH:**
- Research engines suggest a ramp curve (array of annual percentages of stabilized occupancy)
- Engine applies the curve instead of linear step function
- Fallback to current step function if no research curve provided
- Don't remove the existing step function — add the curve as an override
**RISK:** Medium. Changes occupancy trajectory for all properties.

### 3.5 Implement Owner's Priority Return in Incentive Fee
**WHY:** Industry standard. The incentive fee should only kick in after the owner receives a minimum return on equity.
**FILES:** `engine/property/property-engine.ts` (where incentive fee is calculated)
**CHANGE:** Before calculating incentive fee, check if cumulative owner cash flow exceeds `ownerPriorityReturn × equity_invested`. If not, incentive fee = 0 for that period.
**RISK:** Medium. Changes management fee calculations. Must update golden scenarios.

### 3.6 Add Fee Subordination Logic
**WHY:** When fees are subordinated to debt service, management fees are deferred if the property can't cover its mortgage. Common investor protection.
**FILES:** `engine/property/property-engine.ts`
**CHANGE:** If `feeSubordination === "full"`, defer both base and incentive fees when cash flow < debt service. If "partial", defer only incentive fee. Track deferred fees for potential future payment.
**RISK:** Medium. New logic in the engine.

---

## PHASE 4: RESEARCH ENGINE ENHANCEMENT
**Goal:** Make the research engines actually intelligent. This is where the app stops being Excel.

### 4.1 Integrate FRED API
**WHY:** Free, reliable, real-time macroeconomic data. Risk-free rates, CPI, hotel CPI, exchange rates.
**FILES:** New service file in `server/ai/` or `server/integrations/`
**APPROACH:**
- Create `FredService` class with methods for key series (DGS10, CPIAUCSL, CPIHOSSL, FEDFUNDS, etc.)
- Schedule daily refresh of key series
- Store in DB with timestamps
- Admin can see latest values and trigger manual refresh
- Already has `FRED_API_KEY` in `.env.example`
**RISK:** Low. Additive. Free API.

### 4.2 Integrate Damodaran Data
**WHY:** Free country risk premiums (190+ countries), industry betas, cost of capital. Updated annually.
**FILES:** New service + loader script
**APPROACH:**
- Build a loader that downloads Damodaran Excel files (stable URLs)
- Parse Hotel/Gaming industry row for beta, WACC
- Parse country risk premiums for all countries
- Store in DB, flagged with source date
- Admin can trigger refresh (annual, January update)
- Replace hardcoded `countryRiskPremiums.ts` with DB-backed values
**RISK:** Low. Additive. Replaces static data with live data.

### 4.3 Build Source Management System
**WHY:** Admin needs to manage research sources as cards — APIs, URLs, RAG files, text. Test them, switch them ON/OFF.
**FILES:** New DB table, new admin UI, new server routes
**DB TABLE:**
```
research_sources: id, name, type (api|url|rag|text), endpoint, credentials_ref,
  is_active, last_tested_at, last_test_result, timeout_ms, refresh_frequency,
  created_at, updated_at
```
**UI:** Cards in Admin Block 3 (AI Research Engines). Each card shows: name, type, status (healthy/error/untested), last tested, ON/OFF switch, Test button.
**RISK:** Medium. New subsystem. But doesn't change existing functionality.

### 4.4 Implement Range Badge UX
**WHY:** Every assumption field should show the research-suggested range alongside its current value. User sees `{ low, mid, high }` and can accept or override.
**FILES:** New UI component, integrate across property assumption pages
**APPROACH:**
- Create `<RangeIndicator>` component that displays the researched range
- Tooltip shows: range (low/mid/high), rationale, source, confidence
- Visual indicator: green (within range), yellow (edge of range), red (outside range)
- "Accept Suggestion" button sets the field to `mid`
- If no research available: badge shows "Research needed" instead of a fake range
**RISK:** Medium. UI component + integration across many pages. But non-breaking — additive overlay.

### 4.5 Add Entity-Aware Research Context
**WHY:** Research engines must know whether they're analyzing a management company, a hotel property, or a luxury rental. Each needs different comp sets and assumptions.
**FILES:** `server/ai/research-orchestrator.ts`, research prompt templates
**CHANGE:** Research prompts include entity type + all relevant descriptors. For hotels: quality tier, service level, location, market tier, room count, F&B capacity. For luxury rentals: capacity, sqft, location, amenities.
**RISK:** Medium. Changes research prompt construction.

---

## PHASE 5: TESTING & VERIFICATION
**Goal:** Ensure every number is correct. Build golden scenarios. Make the testing section bulletproof.

### 5.1 Create Golden Scenarios
**WHY:** Known-correct test scenarios that verify the entire calculation pipeline. If golden scenario outputs change, something broke.
**FILES:** New test files in `tests/golden/`, new seed data
**APPROACH:**
- Create one golden scenario per real property type:
  1. Medellín duplex (luxury rental, COP context)
  2. Cartagena Obra Pía (hotel, 50/50 F&B, Colombian tax)
  3. NY estate conversion (hotel, US tax, NY liquor)
  4. Utah property (hotel, restricted liquor, different financing)
- Calculate expected outputs by hand or verified spreadsheet
- Lock inputs + expected outputs in test fixtures
- CI/CD runs golden scenarios on every commit
**RISK:** Low. Additive tests. But requires significant effort to calculate correct expected outputs.

### 5.2 Add Edge Case Tests
**FILES:** `tests/golden/` and `tests/calc/`
**CASES:**
- Zero occupancy months (pre-opening)
- 100% occupancy cap
- Negative cash flow during ramp
- Refinance at various timing points
- Properties toggled ON/OFF mid-scenario
- Portfolio consolidation with mixed currencies
- Seasonal variation on monthly projections
- 120-month projection with no penny drift
**RISK:** Low. Additive tests.

### 5.3 Extend Verification Run Retention
(Already covered in Phase 0.1)

### 5.4 Admin Testing Dashboard Enhancement
**WHY:** Admin needs a one-click "Run All Tests" with clear pass/fail reporting.
**FILES:** `client/src/components/admin/verification/`
**CHANGE:** Enhance existing verification UI to:
- Run golden scenarios with one click
- Show pass/fail per property, per check
- Historical trend (are we getting better or worse?)
- Export test results
**RISK:** Low-Medium. Builds on existing verification infrastructure.

---

## PHASE 6: REBECCA ENHANCEMENT
**Goal:** Make Rebecca delightful, context-aware, and deeply knowledgeable.

### 6.1 Screen Context Awareness
**WHY:** Rebecca should know what page/section the user is on and provide contextual help.
**FILES:** `server/routes/rebecca.ts`, `client/src/components/` (wherever Rebecca is integrated)
**APPROACH:** Pass current page/section identifier to Rebecca's context. Include visible data (property name, scenario name, which assumptions are showing).
**RISK:** Low-Medium. Enhances existing chatbot.

### 6.2 Enhanced RAG Content
**WHY:** Rebecca needs to answer about business models, research data, and app usage.
**FILES:** pgvector knowledge-base namespace, RAG content files
**CHANGE:** Index the research docs (`docs/research/*.md`), business model skills, and app help content into pgvector.
**RISK:** Low. Additive content.

### 6.3 pgvector Optimization
**WHY:** 7 namespaces exist but may not be optimally indexed for Rebecca's query patterns.
**FILES:** `server/ai/vector-store-service.ts`, `server/ai/vector-indexing.ts`
**CHANGE:** Review namespace usage, optimize chunk sizes, ensure research history is properly indexed for retrieval.
**RISK:** Low.

---

## PHASE 7: REPORTS & EXPORTS
**Goal:** Investor-ready output. Branded, professional, with charts and narrative.

### 7.1 Review and Enhance PDF/PPTX/DOCX Templates
**WHY:** Exports must be investor-ready — what goes directly to PE firms and family offices.
**FILES:** `server/pdf-styles.ts`, export-related files in `client/src/lib/exports/`
**CHANGE:** Ensure management company logo, theme colors, professional formatting. Add narrative sections where appropriate. Financial statements properly formatted per USALI.
**RISK:** Low-Medium. Enhancement of existing functionality.

### 7.2 Add Portfolio-Level Consolidated Exports
**WHY:** Investors want to see the full portfolio, not just individual properties.
**FILES:** Export routes + templates
**CHANGE:** New export option: "Portfolio Summary" that includes all active properties, consolidated statements, and key metrics.
**RISK:** Medium. New export type.

---

## PHASE ORDER & DEPENDENCIES

```
Phase 0 (Foundation) ──── No dependencies, do first
    │
Phase 1 (Schema) ──────── Depends on Phase 0
    │
    ├── 1.1-1.3, 1.5-1.7 can be done in parallel (additive fields)
    │
    └── 1.4 (Drop Groups) should be done LAST in Phase 1 (breaking change)
         │
Phase 2 (Admin UI) ────── Depends on Phase 1
    │
Phase 3 (Engine) ──────── Depends on Phase 1 (needs new fields)
    │                      3.1 (F&B fix) should be done FIRST
    │                      3.2 (Luxury rental) after 3.1
    │                      3.3-3.6 can be done in any order after 3.1
    │
Phase 4 (Research) ────── Can start in parallel with Phase 3
    │                      4.1-4.2 (FRED, Damodaran) can start immediately
    │
Phase 5 (Testing) ─────── Create golden scenarios BEFORE Phase 3 changes
    │                      Then verify AFTER Phase 3 changes
    │
Phase 6 (Rebecca) ─────── Can be done in parallel with Phases 3-5
    │
Phase 7 (Exports) ─────── Do last (needs all engine changes finalized)
```

### Critical Ordering Rule
**CREATE GOLDEN SCENARIOS (Phase 5.1) BEFORE MAKING ENGINE CHANGES (Phase 3).** This way you can verify that Phase 3 changes produce correct outputs, not just different outputs.

---

## SDK, INFRASTRUCTURE & CONTRACTS

### NPM Dependencies to Add
- None required for Phase 0-1
- FRED API: no SDK needed (REST + fetch)
- Damodaran: no SDK needed (Excel file download + parse, use existing `xlsx` package)
- Consider `node-cron` or similar for scheduled data refreshes (or use existing Replit cron)

### NPM Dependencies to Potentially Remove
- `fast-check` from production deps → devDeps (Phase 0.2)
- Evaluate `canvas-confetti`, `dom-to-image-more`, `supercluster` for actual usage

### External Service Contracts
| Service | Current | Change Needed |
|---------|---------|---------------|
| Anthropic Claude | Active | No change |
| OpenAI | Active (embeddings) | No change |
| Google Gemini | Active (Rebecca default engine) | No change |
| Perplexity | Active (research) | No change |
| pgvector | Active (7 namespaces) | Optimize indexing |
| FRED | API key in .env.example | Activate and integrate |
| Sentry | Active | No change |
| Upstash Redis | Active | No change |
| Resend | Active (email) | No change |
| PostHog | Active (analytics) | No change |

### Database Considerations
- **`real` (float4) columns for financial data** — known precision risk. Ideal fix: migrate to `numeric` or `double precision`. However, this is a massive migration touching every financial column. Recommend: do NOT change existing columns now. Use `decimal.js` in the engine (already done) to maintain precision in calculations. Flag for future migration when the app is more stable.
- **pgvector** — already integrated, 7 namespaces, OpenAI embeddings. Ensure embedding API key is configured. If OpenAI key is missing, embedding silently disables — this should be made more visible to admin.

### RAG & Vector Database
- pgvector store: `lb-hospitality`
- Embedding model: `text-embedding-3-small` (1536 dims, cosine)
- 7 namespaces covering knowledge base, research history, comparables, guidance, documents, scenarios, properties
- **Action needed:** Index the new research docs (`docs/research/*.md`) into the `knowledge-base` namespace
- **Action needed:** Ensure property descriptors (new fields from Phase 1.2) are indexed in the `properties` namespace for semantic comp-set search

---

## WHAT SUCCESS LOOKS LIKE

When this plan is fully executed:

1. **An admin** can manage the management company, properties (two models), research sources, users, and scenarios from a clean, organized admin panel with 10 clear sections.

2. **A user** adds a new property by entering ~8 required descriptors, clicks "Research," and gets intelligent ranges for every financial assumption — ADR, occupancy, cost rates, cap rates, fee structures — specific to that property's location, quality tier, and market context.

3. **The financial engine** produces monthly projections with seasonality, realistic ramp-up curves, correct F&B revenue (35-50% of total), owner's priority return hurdles, and fee subordination — all per USALI standards.

4. **Golden scenarios** verify that every number is correct. Admin clicks one button and sees pass/fail across hundreds of checks.

5. **Rebecca** answers any question about the app, the business model, or the research — aware of what the user is currently looking at.

6. **Exports** go directly to investors — branded PDFs, pitch decks, and detailed Excel data.

7. **An investor** looks at the output and says: "This is professional. The assumptions are defensible. I trust these numbers."

That last point is everything. The app exists to make that investor say yes.

---

*Plan version: 1.0 | Created: 2026-04-12 | Based on full product owner discussion + 6 deep research reports*
