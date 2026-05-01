---
name: Source Code Documentation
description: Comprehensive reference for every layer of the H+ Analytics by Norfolk AI simulation portal.
---

# Source Code Documentation

Comprehensive reference for every layer of the H+ Analytics by Norfolk AI simulation portal.

---

## Directory Layout

```
├── server/              # Express backend (TypeScript ESM)
│   ├── index.ts         # Server bootstrap, middleware, static serving
│   ├── routes.ts        # All REST API endpoints (~2800 lines)
│   ├── auth.ts          # Authentication, session management, rate limiting
│   ├── storage.ts       # IStorage interface + Drizzle PostgreSQL implementation
│   ├── db.ts            # Drizzle ORM database connection
│   ├── seed.ts          # Database seeding (users, properties, assumptions, research)
│   ├── aiResearch.ts    # AI-powered market research orchestration (Claude tool-use)
│   ├── calculationChecker.ts  # Server-side financial calculation verification
│   ├── static.ts        # Static file serving configuration
│   ├── vite.ts          # Vite dev server integration
│   └── replit_integrations/  # Replit service connectors (audio, batch, chat, image, object_storage)
│
├── domain/              # Domain types and chart of accounts (pure types, no I/O)
│   ├── types/           # Accounting policy, journal deltas, rounding
│   │   ├── accounting-policy.ts  # GAAP accrual, depreciation method, ASC classification
│   │   ├── journal-delta.ts      # JournalDelta type, CashFlowBucket enum
│   │   └── rounding.ts           # RoundingPolicy + roundTo() utility
│   └── ledger/          # Chart of accounts and ledger types
│       ├── accounts.ts  # CHART_OF_ACCOUNTS (13 accounts: BS_ASSET, BS_LIABILITY, BS_EQUITY, IS_EXPENSE)
│       └── types.ts     # StatementEvent, PostedEntry, TrialBalanceEntry, AccountDef
│
├── engine/              # Double-entry posting engine
│   └── posting/
│       ├── post.ts           # postEvents(): validates & posts StatementEvents → PostedEntry[]
│       └── trial-balance.ts  # buildTrialBalance(), buildCumulativeTrialBalance()
│
├── statements/          # Financial statement extraction from ledger
│   ├── types.ts              # PeriodIncomeStatement, PeriodBalanceSheet, PeriodCashFlow, ReconciliationResult
│   ├── income-statement.ts   # extractIncomeStatement() from trial balance
│   ├── balance-sheet.ts      # extractBalanceSheet() with cumulative retained earnings
│   ├── cash-flow.ts          # extractCashFlow() from CASH account entries (ASC 230)
│   ├── reconcile.ts          # 3 checks: BS balance, CF tie-out, IS→RE roll-forward
│   ├── event-applier.ts      # Main orchestrator: events → post → TB → IS/BS/CF → reconcile
│   └── index.ts              # Barrel export
│
├── client/src/          # React 18 frontend (TypeScript)
│   ├── App.tsx          # Root component, routing, auth providers
│   ├── main.tsx         # React DOM entry point
│   ├── pages/           # 19 page components (Dashboard, Portfolio, etc.)
│   ├── components/      # Shared components (Layout, statements, analysis)
│   │   ├── ResearchRefreshOverlay.tsx  # 3D animated overlay for auto-refreshing market research on login
│   │   └── ui/          # 60+ shadcn/Radix UI primitives + custom components
│   ├── hooks/           # Custom React hooks (toast, mobile, upload)
│   ├── features/        # Feature modules
│   │   ├── design-themes/    # Theme manager, types, useDesignThemes hook
│   │   └── property-images/  # Property image picker, useGenerateImage hook
│   └── lib/             # Core business logic + utilities
│       ├── financial/                  # Core calculation engines
│       │   ├── property-engine.ts     # Single-property pro-forma (601 lines)
│       │   ├── company-engine.ts      # Management-company pro-forma (361 lines)
│       │   └── index.ts               # Barrel re-export
│       ├── financialEngine.ts         # Re-export shim (6 lines, backward compat)
│       ├── loanCalculations.ts    # Debt sizing, amortization, refinance (394 lines)
│       ├── equityCalculations.ts  # Equity investment helpers (64 lines)
│       ├── cashFlowAggregator.ts  # Monthly→yearly CF aggregation (98 lines)
│       ├── cashFlowSections.ts    # ASC 230 CFO/CFI/CFF computation (92 lines)
│       ├── yearlyAggregator.ts    # Monthly→yearly IS aggregation (151 lines)
│       ├── financialAuditor.ts    # 103-check verification engine (1294 lines)
│       ├── runVerification.ts     # Orchestrates all verification suites (417 lines)
│       ├── constants.ts           # Re-exports shared + client-only defaults (105 lines)
│       ├── auth.tsx               # AuthProvider context + useAuth hook
│       ├── store.ts               # Zustand local state management
│       ├── api.ts                 # API client utilities
│       ├── queryClient.ts         # TanStack React Query configuration
│       ├── formatters.ts          # Currency/number/date formatting
│       ├── utils.ts               # Tailwind cn() helper
│       ├── formulaChecker.ts      # Formula identity verification
│       ├── gaapComplianceChecker.ts  # GAAP ASC compliance checks
│       ├── crossCalculatorValidation.ts  # Cross-module validation
│       ├── designConsistencyChecker.ts   # UI theme consistency checks
│       ├── chartExport.ts         # Chart PNG export utility
│       ├── excelExport.ts         # Legacy Excel export (see exports/)
│       ├── pdfChartDrawer.ts      # Legacy PDF export (see exports/)
│       └── exports/               # Modular export system
│           ├── index.ts           # Export orchestration
│           ├── excelExport.ts     # xlsx workbook generation
│           ├── csvExport.ts       # CSV flat-file export
│           ├── pptxExport.ts      # PowerPoint slide generation
│           ├── pdfChartDrawer.ts  # PDF with embedded charts
│           ├── pngExport.ts       # Table/chart PNG snapshots
│           └── checkerManualExport.ts  # Checker Manual PDF
│
├── shared/              # Shared between client and server
│   ├── schema.ts        # Drizzle ORM tables (user_groups, users, sessions, global_assumptions, properties, scenarios, etc.), Zod schemas, TypeScript types
│   ├── constants.ts     # Single source of truth for DEFAULT_* values
│   └── models/          # Shared domain models
│
├── calc/                # Pure computation modules (no I/O)
│   ├── dispatch.ts      # Tool name → handler dispatch map
│   ├── shared/          # Shared utilities (pmt, schedule, schemas, types)
│   ├── financing/       # DSCR, debt yield, sensitivity, loan comparison
│   ├── funding/         # Equity rollforward, funding gates, timeline
│   ├── refinance/       # Refinance sizing, payoff, schedule
│   ├── returns/         # DCF/NPV, IRR vector, equity multiple, exit valuation
│   ├── validation/      # Financial identities, funding gates, reconciliation
│   └── analysis/        # Consolidation, scenario comparison, break-even
│
├── analytics/           # Advanced financial analytics
│   ├── fcf/             # Free Cash Flow computation
│   └── returns/         # IRR, sensitivity, return metrics
│
├── tests/               # Vitest test suite (32 test files)
│   ├── analytics/       # FCF, IRR, metrics, sensitivity golden tests
│   ├── auth/            # Auth utility tests
│   ├── engine/          # Pro forma and formatter golden tests
│   ├── financing/       # Closing costs, sizing, calculator golden tests
│   ├── funding/         # Equity rollforward, gates, timeline golden tests
│   ├── refinance/       # Payoff, schedule, sizing, flags golden tests
│   └── statements/      # BS, CF, IS, reconcile, trial-balance, event-applier tests
│
├── migrations/          # Drizzle Kit migration files
│   └── 0000_brainy_mother_askani.sql  # Initial schema migration
│
├── scripts/             # Ad-hoc analysis scripts
│   └── exit-value-analysis.js
│
└── .claude/             # Agent skills, rules, tools, manuals
    ├── rules/           # Financial engine rules, audit doctrine
    ├── skills/          # Exports, UI, finance, research skills
    ├── tools/           # Tool schemas (financing, returns, validation, analysis)
    ├── manuals/         # User manual, checker manual
    └── archive/         # Archived session memory
```

---

## Server Layer

### `server/index.ts` — Bootstrap
- Creates Express 5 app with JSON body parser
- Registers all API routes via `registerRoutes()`
- Sets up Vite dev server (development) or static serving (production)
- Binds to port 5000 on 0.0.0.0
- Auto-seeds database on startup: default admin, checker user, properties, assumptions, market research

### `server/routes.ts` — API Endpoints (~70 routes)

**Authentication (4 routes)**
- `POST /api/auth/login` — Email/password login with bcrypt, rate limiting (5 attempts / 15 min lockout)
- `POST /api/auth/admin-login` — Admin backdoor login with ADMIN_PASSWORD env secret
- `POST /api/auth/logout` — Session invalidation + login log update
- `GET /api/auth/me` — Current authenticated user

**User Profile (2 routes)**
- `PATCH /api/profile` — Update name, email, company, title
- `PATCH /api/profile/password` — Change password with current-password verification

**Admin User Management (5 routes, requireAdmin)**
- `GET/POST /api/admin/users` — List all / create new user
- `PATCH /api/admin/users/:id` — Update user (name, email, role, company, title); last-admin protection
- `PATCH /api/admin/users/:id/password` — Reset user password
- `DELETE /api/admin/users/:id` — Delete user; last-admin protection

**Admin Operations (8 routes, requireAdmin/requireChecker)**
- `GET /api/admin/login-logs` — Login activity log
- `POST /api/admin/seed-production` — Seed production database
- `GET /api/admin/run-verification` — Run financial verification (requireChecker)
- `POST /api/admin/ai-verification` — AI-powered verification (requireChecker)
- `GET /api/admin/run-design-check` — Design consistency audit
- `GET /api/admin/activity-logs` — User activity logs with filters
- `GET /api/admin/checker-activity` — Checker-specific activity log
- `GET /api/admin/verification-history` — Past verification runs

**Session Management (2 routes, requireAdmin)**
- `GET /api/admin/active-sessions` — List active sessions
- `DELETE /api/admin/sessions/:sessionId` — Force-terminate session

**Global Assumptions (2 routes)**
- `GET /api/global-assumptions` — Fetch user's global assumptions
- `POST /api/global-assumptions` — Upsert global assumptions

**Properties (5 routes)**
- `GET /api/properties` — List all properties (per user)
- `GET /api/properties/:id` — Single property detail
- `POST /api/properties` — Create property
- `PATCH /api/properties/:id` — Update property
- `DELETE /api/properties/:id` — Delete property

**Property Images (2 routes)**
- `POST /api/generate-property-image` — AI-generate property image
- `POST /api/fix-images` — Batch fix property images (admin)

**Scenarios (7 routes)**
- CRUD: `GET/POST/PATCH/DELETE /api/scenarios`
- `POST /api/scenarios/:id/load` — Load scenario (replaces active assumptions + properties)
- `GET /api/scenarios/:id/export` — Export scenario as JSON
- `POST /api/scenarios/import` — Import scenario from JSON
- `POST /api/scenarios/:id/clone` — Duplicate scenario
- `GET /api/scenarios/:id1/compare/:id2` — Side-by-side scenario comparison

**Design Themes (5 routes)**
- CRUD: `GET/POST/PATCH/DELETE /api/design-themes`
- `POST /api/design-themes/:id/activate` — Set active theme

**Market Research (2 routes)**
- `GET /api/research/:type` — Fetch cached research by type
- `POST /api/research/generate` — Generate AI research (rate limited: 3/min)

**Property Finder (7 routes)**
- `GET /api/property-finder/search` — Search properties via RapidAPI
- CRUD for favorites: `GET/POST/DELETE /api/property-finder/favorites`
- `PATCH /api/property-finder/favorites/:id/notes` — Update property notes
- CRUD for saved searches: `GET/POST/DELETE /api/property-finder/saved-searches`

**Activity Logging (2 routes)**
- `GET /api/activity-logs/mine` — Current user's activity
- `POST /api/activity-logs/manual-view` — Log manual page view

**Calculation APIs (12 routes)**

Financing (requireAuth):
- `POST /api/financing/dscr` — DSCR calculation
- `POST /api/financing/debt-yield` — Debt yield analysis
- `POST /api/financing/sensitivity` — Rate sensitivity matrix
- `POST /api/financing/prepayment` — Prepayment analysis

Returns (requireAuth):
- `POST /api/returns/dcf-npv` — Discounted cash flow / NPV
- `POST /api/returns/irr-vector` — IRR cash flow vector
- `POST /api/returns/equity-multiple` — Equity multiple
- `POST /api/returns/exit-valuation` — Exit value computation

Validation (requireChecker):
- `POST /api/validation/financial-identities`
- `POST /api/validation/funding-gates`
- `POST /api/validation/schedule-reconcile`
- `POST /api/validation/assumption-consistency`
- `POST /api/validation/export-verification`

Analysis (requireChecker):
- `POST /api/analysis/consolidation`
- `POST /api/analysis/scenario-compare`
- `POST /api/analysis/break-even`

### `server/auth.ts` — Authentication & Rate Limiting

**Session Management:**
- Cookie-based sessions (`session_id` cookie, 7-day duration)
- bcrypt password hashing (12 rounds)
- Crypto-random session IDs

**Rate Limiting:**
- Login: 5 failed attempts → 15-minute lockout per email
- API: Per-user sliding window (60s), configurable max requests per endpoint
- `isRateLimited(email)` / `isApiRateLimited(userId, endpoint, max)`

**Middleware:**
- `requireAuth` — Validates session cookie, attaches `req.user`
- `requireAdmin` — Requires `role === "admin"`
- `requireChecker` — Requires `role === "admin" || role === "checker"` (admin is superset)

### `server/storage.ts` — Data Access Layer (628 lines)

**IStorage Interface** — 40+ methods covering:
- Users: CRUD, password updates, role management
- User Groups: CRUD, assign/unassign users to groups
- Sessions: Create, get (with user join), delete, expire cleanup
- Global Assumptions: Per-user get/upsert
- Properties: Per-user CRUD
- Scenarios: Per-user CRUD, load (atomic swap), clone
- Login Logs: Create, update logout, list
- Design Themes: CRUD, activation (per user)
- Market Research: Get by type, upsert, delete
- Property Finder: Favorites CRUD, saved searches CRUD
- Activity Logs: Create, query with filters
- Verification Runs: Create, list, get by ID

**Implementation:** All methods use Drizzle ORM queries against PostgreSQL.

### `server/seed.ts` — Database Seeding

**Auto-seed on startup:**
1. Admin user (from `ADMIN_PASSWORD` env secret)
2. Checker user (`checker@norfolkgroup.io`, from `CHECKER_PASSWORD` env secret)
3. 5 boutique hotel properties with realistic data
4. Global assumptions (fee rates, inflation, staffing tiers)
5. Market research data for all properties

**Execution guard:** `seedDatabase()` called from `index.ts`, not on import.

### `server/aiResearch.ts` — AI Research Orchestration

**Architecture:**
- Loads all 10 research skill SKILL.md files as combined system prompt
- Scans each skill's `tools/` subfolder for JSON tool definitions
- Deduplicates tools by name at startup
- `validateSkillFolders()` checks for missing skill directories

**Data-driven TOOL_PROMPTS map:**
```
{ market_overview → analyze_market, adr_analysis → analyze_adr, ... }
```
Eliminates hardcoded switch/case for research type → tool mapping.

**Caching:** In-memory cache bypassed in development (live prompt editing), enabled in production for performance.

**Tool-use loop:** Handles Claude's multi-turn tool calls, dispatching computation tools via `calc/dispatch.ts`.

---

## Client Layer

### Routing (`App.tsx`)

Three route guard components:
- `ProtectedRoute` — Requires authenticated user
- `AdminRoute` — Requires admin role
- `CheckerRoute` — Requires admin OR checker role

Lazy-loaded pages: PropertyDetail, PropertyEdit, PropertyMarketResearch, CompanyResearch, GlobalResearch, Admin, Scenarios, PropertyFinder, SensitivityAnalysis, FinancingAnalysis, Methodology, CheckerManual.

Eager-loaded pages: Dashboard, Company, CompanyAssumptions, Portfolio, Settings, Profile, Login.

### Pages (19 total)

| Page | Route | Guard | Purpose |
|------|-------|-------|---------|
| Login | /login | none | Email/password login |
| Dashboard | / | auth | Portfolio overview, KPIs, charts |
| Company | /company | auth | Management company financials |
| CompanyAssumptions | /company/assumptions | auth | Fee rates, staffing, capital raise funding |
| Portfolio | /portfolio | auth | Property list, aggregate metrics |
| PropertyDetail | /property/:id | auth | Single property pro forma, statements |
| PropertyEdit | /property/:id/edit | auth | Property assumption editor |
| PropertyMarketResearch | /property/:id/research | auth | AI market research per property |
| CompanyResearch | /company/research | auth | Management company research |
| GlobalResearch | /global/research | auth | Industry-wide research |
| Settings | /settings | auth | App settings, design themes |
| Profile | /profile | auth | User profile editor |
| Admin | /admin | admin | User management, activity logs, verification |
| Scenarios | /scenarios | auth | Save/load/compare scenarios |
| PropertyFinder | /property-finder | auth | External property search |
| SensitivityAnalysis | /sensitivity | auth | Rate/occupancy sensitivity matrix |
| FinancingAnalysis | /financing | auth | Debt sizing, DSCR, comparison |
| Methodology | /methodology | auth | Financial methodology documentation |
| CheckerManual | /checker-manual | checker | 7-phase verification manual |

### Core Financial Library

#### `financial/property-engine.ts` (601 lines)
The heart of the simulation. Generates 120 months (10 years) of property-level financials.

**Key function:** `generatePropertyProForma(property, global) → MonthlyFinancials[]`

**Monthly calculation flow:**
1. Room revenue = rooms × ADR × occupancy × 30.5 days/month
2. Total revenue = roomRevenue / (1 - eventsShare - fbShare - otherShare)
3. Event/F&B/Other revenue = totalRevenue × respective share
4. USALI-standard departmental expenses (rooms, F&B, admin, marketing, etc.)
5. Management fees (base + incentive) as percentage of revenue/GOP
6. NOI = Revenue - Expenses - Fees
7. Debt service (interest + principal via PMT formula)
8. Depreciation: 27.5-year straight-line on building value (excluding land)
9. Income tax on taxable income
10. Net income, cash flow, ending cash balance
11. Refinancing proceeds (if applicable, via `@calc/refinance`)

#### `financial/company-engine.ts` (361 lines)
Rolls up all property pro-formas into the management company P&L.

**Key function:** `generateCompanyProForma(properties, global) → CompanyMonthlyFinancials[]`

#### `financialEngine.ts` (6 lines — re-export shim)
Thin backward-compatibility shim that re-exports everything from `./financial/`. New code should import directly from the engine files above.

**Occupancy ramp model:** Linear from `startOccupancy` to `maxOccupancy` over configurable ramp months, with growth steps.

**Fiscal year support:** Configurable fiscal year start month (January = 1, April = 4, etc.).

#### `loanCalculations.ts` (394 lines)
Debt sizing and amortization for acquisition and refinance loans.

**Key interfaces:**
- `LoanParams` — Per-property: purchase price, LTV, rate, term, refinance options
- `GlobalLoanParams` — Model-wide: start date, commission rate, debt assumptions
- `LoanCalculation` — Computed: loan amount, equity, monthly payment, depreciation
- `RefinanceCalculation` — Refi proceeds, new loan terms, closing costs

**Key functions:**
- `calculateLoanParams(property, global)` — Full loan computation with three-tier fallback (property → global → constant)
- `getAcquisitionYear(loan)` — Year index of property acquisition
- `calculateRefinance(property, global)` — Refinance sizing at specified year

#### `equityCalculations.ts` (64 lines)
Single source of truth for equity/investment math (replaces 11 inline copies).

- `totalPropertyCost()` — Purchase + improvements + pre-opening + reserve
- `acquisitionLoanAmount()` — LTV-based loan sizing (0 for Full Equity)
- `propertyEquityInvested()` — Total cost minus loan
- `acquisitionYearIndex()` — Year of acquisition (0-based)

#### `cashFlowAggregator.ts` (98 lines)
Aggregates monthly engine data into yearly `YearlyCashFlowResult[]`. All values come from the engine's monthly calculations — nothing is re-derived. Guarantees IS, CF, BS, and exports use identical numbers.

Fields: NOI, interest, depreciation, net income, tax, BTCF, ATCF, FCF, FCFE, exit value, cumulative cash flow.

#### `yearlyAggregator.ts` (151 lines)
Monthly-to-yearly aggregation for income statement views. Single-pass accumulation via `SUM_FIELDS` array. `endingCash` uses pick-last (not sum) for the last month of each year.

Replaces 6 independent implementations across Dashboard, PropertyDetail, IS, CF, and exports.

#### `cashFlowSections.ts` (92 lines)
ASC 230-compliant three-section cash flow computation:
- **CFO** (Cash from Operations): Revenue - OpEx - Interest - Taxes
- **CFI** (Cash from Investing): -Acquisition - FF&E + Exit proceeds
- **CFF** (Cash from Financing): Equity + Loan proceeds - Principal + Refi

Plus: Net change in cash, opening/closing balances, FCF, FCFE.

#### `financialAuditor.ts` (1294 lines)
103 automated verification checks organized by category:
- Timing & date validation
- Depreciation calculations (IRS Pub 946)
- Loan amortization accuracy
- Income statement reconciliation
- Balance sheet balancing
- Cash flow statement (ASC 230)
- Fee linkage (property ↔ company)

**Outputs:** `AuditReport` with `UNQUALIFIED`, `QUALIFIED`, or `ADVERSE` opinion.

#### `runVerification.ts` (417 lines)
Orchestrates all verification suites:
1. Formula checks (`formulaChecker.ts`)
2. GAAP compliance checks (`gaapComplianceChecker.ts`)
3. Full financial audit (`financialAuditor.ts`)
4. Cross-calculator validation (`crossCalculatorValidation.ts`)

Returns: `VerificationResults` with pass/fail counts, critical/material issues, audit opinion, overall status.

### Constants System

#### `shared/constants.ts` — Single source of truth
Shared between client and server. All `DEFAULT_*` values for:
- Revenue shares (events: 18%, F&B: 30%, other: 3%) — as % of total revenue
- Catering boost (deprecated, defaults to 0%)
- USALI cost rates (rooms: 36%, F&B: 32%, admin: 8%, etc.)
- Exit/sale (cap rate: 8.5%, tax: 25%, commission: 5%)
- Land value (25%, IRS Pub 946)
- Depreciation (27.5 years)
- Days per month (30.5)
- capital raise funding (valuation cap: $2.5M, discount: 20%)

#### `client/src/lib/constants.ts` — Re-exports shared + client-only
Client-only additions:
- Loan defaults (LTV: 75%, rate: 9%, term: 25yr)
- Property defaults (10 rooms, $250 ADR, 55-85% occupancy)
- Company costs (staff salary: $75K, office: $36K, etc.)
- Staffing tiers (≤3 properties: 2.5 FTE, ≤6: 4.5, 7+: 7.0)
- Projection period (10 years / 120 months)
- Audit thresholds (variance: 1%, dollar: $100)

### Components

#### Layout Component (`Layout.tsx`)
- Dark gradient sidebar navigation
- Responsive with mobile drawer
- Role-aware menu items (admin/checker sections)
- User profile dropdown

#### Financial Statement Components
- `YearlyIncomeStatement.tsx` — USALI-standard income statement
- `YearlyCashFlowStatement.tsx` — ASC 230 three-section cash flow
- `ConsolidatedBalanceSheet.tsx` — Multi-property consolidated BS
- `InvestmentAnalysis.tsx` — IRR, equity multiple, DCF analysis
- `FinancialStatement.tsx` — Generic statement wrapper

#### Custom UI Components (beyond shadcn)
- `glass-button.tsx` / `glass-card.tsx` — Dark glass-morphism buttons/cards
- `financial-chart.tsx` — Preset Recharts with gradient lines
- `financial-table.tsx` — Sticky columns, section grouping
- `export-toolbar.tsx` — 6-format export dropdown (PDF/Excel/CSV/PPTX/PNG)
- `stat-card.tsx` — KPI cards (glass/light/sage variants)
- `content-panel.tsx` — Light/dark section wrappers
- `page-header.tsx` — Consistent page titles
- `save-button.tsx` — Saving state indicator
- `research-badge.tsx` — Research data status badges

### State Management

**Server state:** TanStack React Query with configured `queryClient`.
**Local state:** Zustand store (`store.ts`) for UI state.
**Auth state:** React Context via `AuthProvider` in `auth.tsx`, exposing `useAuth()` hook with `{ user, isLoading, isAdmin, login, logout }`.

---

## Calculation Layer (`calc/`)

Pure computation modules with no I/O dependencies. Each module:
- Accepts typed input objects
- Returns typed output objects
- Uses Zod schemas for validation (`calc/shared/schemas.ts`)
- Shares PMT/schedule utilities (`calc/shared/`)

### Dispatch System (`calc/dispatch.ts`)
Maps tool names to handler functions. Used by `server/aiResearch.ts` for AI tool calls and by `/api/financing/`, `/api/returns/`, `/api/validation/`, `/api/analysis/` API routes.

```typescript
TOOL_DISPATCH = {
  calculate_dcf_npv → computeDCF,
  build_irr_cashflow_vector → buildIRRVector,
  compute_equity_multiple → computeEquityMultiple,
  exit_valuation → computeExitValuation,
  validate_financial_identities → validateFinancialIdentities,
  funding_gate_checks → checkFundingGates,
  schedule_reconcile → reconcileSchedule,
  assumption_consistency_check → checkAssumptionConsistency,
  export_verification → verifyExport,
  consolidate_statements → consolidateStatements,
  scenario_compare → compareScenarios,
  break_even_analysis → computeBreakEven,
}
```

### Module Categories

**Financing (`calc/financing/`):**
- `dscr-calculator.ts` — Debt Service Coverage Ratio
- `debt-yield.ts` — NOI / Loan Amount
- `sensitivity.ts` — Rate/LTV sensitivity matrices
- `loan-comparison.ts` — Side-by-side loan term comparison
- `closing-costs.ts` — Acquisition/refi closing cost computation
- `sizing.ts` — Max loan sizing given constraints
- `prepayment.ts` — Prepayment penalty analysis
- `validate.ts` — Financing assumption validation

**Funding (`calc/funding/`):**
- `funding-engine.ts` — Capital raise + equity funding timeline
- `equity-rollforward.ts` — Period-over-period equity tracking
- `gates.ts` — Funding sufficiency checks (5 mandatory rules)
- `timeline.ts` — Capital call scheduling

**Refinance (`calc/refinance/`):**
- `refinance-calculator.ts` — Full refinance computation
- `payoff.ts` — Original loan payoff at refi date
- `sizing.ts` — New loan sizing based on appraised value
- `schedule.ts` — New amortization schedule
- `pmt.ts` — Payment calculation (shared)

**Returns (`calc/returns/`):**
- `dcf-npv.ts` — Discounted Cash Flow / Net Present Value
- `irr-vector.ts` — IRR cash flow vector builder
- `equity-multiple.ts` — Total return / equity invested
- `exit-valuation.ts` — Cap rate-based exit pricing

**Validation (`calc/validation/`):**
- `financial-identities.ts` — Verify IS/BS/CF mathematical identities
- `funding-gates.ts` — Check 5 mandatory business rules
- `schedule-reconcile.ts` — Debt schedule ↔ engine reconciliation
- `assumption-consistency.ts` — Cross-property assumption checks
- `export-verification.ts` — Verify export data matches engine

**Analysis (`calc/analysis/`):**
- `consolidation.ts` — Multi-property statement consolidation
- `scenario-compare.ts` — Side-by-side scenario delta analysis
- `break-even.ts` — Occupancy/ADR break-even computation

---

## Analytics Layer (`analytics/`)

### FCF Module (`analytics/fcf/`)
- `compute-fcf.ts` — Free Cash Flow computation
- `types.ts` — FCF-specific type definitions
- `index.ts` — Module barrel export

### Returns Module (`analytics/returns/`)
- `irr.ts` — Internal Rate of Return (Newton-Raphson method)
- `metrics.ts` — Return metric aggregation
- `sensitivity.ts` — Multi-variable sensitivity analysis
- `types.ts` — Return-specific type definitions

---

## Domain Layer (`domain/`)

Pure type definitions and chart of accounts — no I/O, no dependencies on runtime.

### Accounting Policy (`domain/types/accounting-policy.ts`)
Defines the `AccountingPolicy` interface and `DEFAULT_ACCOUNTING_POLICY`:
- `accounting_basis`: Always `"GAAP_ACCRUAL"`
- `cash_flow_classification`: Interest paid → Operating, distributions → Financing, debt issuance → Financing
- `depreciation_method`: `"STRAIGHT_LINE"` (IRS Pub 946)
- `amortization_method`: `"STRAIGHT_LINE"` or `"EIR"`
- `rounding_policy`: `{ precision: 2, bankers_rounding: false }`

### Journal Deltas (`domain/types/journal-delta.ts`)
- `CashFlowBucket` type: `"OPERATING" | "INVESTING" | "FINANCING"`
- `JournalDelta` interface: account, debit, credit, classification, cash_flow_bucket, memo

### Rounding (`domain/types/rounding.ts`)
- `RoundingPolicy`: precision + bankers_rounding flag
- `roundTo(value, policy)`: Standard or banker's rounding

### Chart of Accounts (`domain/ledger/accounts.ts`)
13 accounts organized by classification:

| Classification | Account Codes |
|----------------|--------------|
| BS_ASSET | CASH, PROPERTY, RESERVES |
| BS_DEFERRED | CLOSING_COSTS |
| BS_LIABILITY | DEBT_ACQUISITION, DEBT_NEW, DEBT_OLD, ACCRUED_INTEREST_PAYABLE |
| BS_EQUITY | EQUITY_CONTRIBUTED, RETAINED_EARNINGS |
| IS_EXPENSE | INTEREST_EXPENSE, DEPRECIATION_EXPENSE, PREPAYMENT_PENALTY_EXPENSE |

Each account has: code, name, normal_side (DEBIT/CREDIT), classification.

### Ledger Types (`domain/ledger/types.ts`)
- `StatementEvent` — Timestamped event with journal deltas (event_id, event_type, date, entity_id)
- `PostedEntry` — Posted journal entry with period metadata
- `TrialBalanceEntry` — Per-account debit/credit totals and balance
- `AccountDef` — Account definition (code, name, normal_side, classification)

---

## Engine Layer (`engine/`)

Double-entry posting engine that converts `StatementEvent[]` into `PostedEntry[]`.

### `engine/posting/post.ts` — Event Posting
`postEvents(events, rounding) → PostingResult`
- Validates double-entry: Σ(debit) = Σ(credit) per event (tolerance < 0.01)
- Unbalanced events are skipped and recorded in `unbalanced_events`
- Extracts YYYY-MM period from event dates
- Applies rounding policy to all amounts

### `engine/posting/trial-balance.ts` — Trial Balance
- `buildTrialBalance(entries, period, rounding)` — Single-period trial balance grouped by account. Balance respects normal side.
- `buildCumulativeTrialBalance(entries, throughPeriod, rounding)` — Cumulative balance through a period (used for balance sheet point-in-time snapshots).

---

## Statements Layer (`statements/`)

Extracts GAAP-compliant financial statements from the posted ledger.

### `statements/income-statement.ts`
`extractIncomeStatement(trialBalance, period, rounding) → PeriodIncomeStatement`
- Filters trial balance for IS_REVENUE and IS_EXPENSE accounts
- Computes total revenue, total expenses, net income

### `statements/balance-sheet.ts`
`extractBalanceSheet(entries, period, cumulativeNetIncome, rounding) → PeriodBalanceSheet`
- Uses `buildCumulativeTrialBalance()` for point-in-time snapshot
- Assets = BS_ASSET + BS_DEFERRED (debit normal)
- Liabilities = BS_LIABILITY (credit normal)
- Equity = BS_EQUITY + Retained Earnings (includes cumulative net income)
- Verifies A = L + E (balanced flag)

### `statements/cash-flow.ts`
`extractCashFlow(entries, period, rounding) → PeriodCashFlow`
- ASC 230 indirect method: analyzes CASH account entries only
- Groups by `cash_flow_bucket`: OPERATING, INVESTING, FINANCING
- Cash impact: debit to CASH = inflow, credit = outflow
- `computeCashDelta()` for CF tie-out verification

### `statements/reconcile.ts`
`reconcile(entries, IS[], BS[], CF[], rounding) → ReconciliationResult`
Three cross-statement checks:
1. **BS Balance**: Assets = Liabilities + Equity every period (FASB)
2. **CF Tie-out**: Net Cash Flow = ΔCASH every period (ASC 230)
3. **IS→RE**: Cumulative Net Income = Retained Earnings balance (FASB)

### `statements/event-applier.ts`
`applyEvents(events, rounding) → StatementApplierOutput`
Main orchestrator — the full pipeline:
1. Post all events → `PostedEntry[]` + validation flags
2. Determine all periods spanned
3. For each period: trial balance → IS, BS, CF
4. Run reconciliation checks
5. Assemble complete output

Output includes: posted entries, periods, trial balances, income statements, balance sheets, cash flows, reconciliation results, and flags for posting errors.

---

## Test Suite (`tests/`)

32 test files organized by module, using Vitest. Golden tests compare computed outputs against known-good snapshots.

| Module | Files | Coverage |
|--------|-------|----------|
| analytics/ | 5 | FCF, IRR, metrics, sensitivity, golden |
| auth/ | 1 | Auth utility functions |
| engine/ | 3 | Company pro forma, formatters, golden |
| financing/ | 4 | Closing costs, calculator, sizing, golden |
| funding/ | 5 | Equity rollforward, engine, gates, timeline, golden |
| refinance/ | 6 | Flags, payoff, calculator, schedule, sizing, golden |
| statements/ | 8 | BS, CF, IS, event-applier, post, reconcile, trial-balance, golden |

---

## Client Features (`client/src/features/`)

### Design Themes (`features/design-themes/`)
- `ThemeManager.tsx` — Theme editor UI component
- `useDesignThemes.ts` — React Query hook for CRUD operations
- `types.ts` — Theme configuration types
- `index.ts` — Barrel export

### Property Images (`features/property-images/`)
- `PropertyImagePicker.tsx` — AI image generation UI
- `useGenerateImage.ts` — Hook for image generation API
- `index.ts` — Barrel export

---

## Shared Layer (`shared/`)

### `schema.ts` — Database Schema (Drizzle ORM)

**Tables:**
- `users` — id, name, email, passwordHash, role, company, title, createdAt
- `sessions` — id, userId, sessionId, expiresAt, createdAt
- `globalAssumptions` — userId + all fee/inflation/staffing/capital raise fields
- `properties` — userId + property details (rooms, ADR, occupancy, costs, financing)
- `scenarios` — userId, name, savedAssumptions (JSON), savedProperties (JSON[])
- `loginLogs` — userId, sessionId, loginAt, logoutAt, ipAddress
- `designThemes` — userId, name, config (JSON), isActive
- `marketResearch` — userId, propertyId, type, data (JSON)
- `prospectiveProperties` — userId, externalId, data (JSON), notes
- `savedSearches` — userId, name, filters (JSON)
- `activityLogs` — userId, action, entityType, entityId, details (JSON), timestamp
- `verificationRuns` — userId, results (JSON), opinion, createdAt

**Roles:** `VALID_USER_ROLES = ["admin", "partner", "checker", "investor"]`

**Zod Schemas:** `insertUserSchema`, `insertPropertySchema`, etc. generated via `createInsertSchema()` from `drizzle-zod`.

### `constants.ts` — Shared Constants
See [Constants System](#constants-system) above.

---

## Key Data Flows

### Monthly Pro Forma Generation
```
Property + Global Assumptions
  → property-engine.generatePropertyProForma()   // client/src/lib/financial/property-engine.ts
    → 120 MonthlyFinancials records
      → yearlyAggregator.aggregatePropertyByYear() → IS views
      → cashFlowAggregator.aggregateCashFlowByYear() → CF views
      → cashFlowSections.computeCashFlowSections() → ASC 230 sections
```

### Financial Verification
```
Properties + Assumptions
  → runVerification.runFullVerification()
    → formulaChecker (identity checks)
    → gaapComplianceChecker (ASC 230/360/470)
    → financialAuditor (103 checks → audit opinion)
    → crossCalculatorValidation (calc/ ↔ engine reconciliation)
  → VerificationResults { opinion: UNQUALIFIED|QUALIFIED|ADVERSE }
```

### AI Research Generation
```
POST /api/research/generate { type, propertyId }
  → aiResearch.ts loads skill prompts + tool definitions
  → Claude API call with tool-use loop
  → Tool calls dispatched via calc/dispatch.ts
  → Research result stored in marketResearch table
```

### Export Pipeline
```
Financial data
  → exports/index.ts orchestration
  → Format-specific renderer:
    → excelExport.ts (multi-sheet xlsx)
    → csvExport.ts (flat file)
    → pptxExport.ts (slide deck)
    → pdfChartDrawer.ts (PDF with charts)
    → pngExport.ts (table/chart images)
```

### Ledger-Based Statement Pipeline
```
StatementEvents (ACQUISITION, REFINANCE, DEBT_SERVICE, DEPRECIATION, ...)
  → engine/posting/post.ts → postEvents() → PostedEntry[]
  → engine/posting/trial-balance.ts → buildTrialBalance() per period
  → statements/income-statement.ts → extractIncomeStatement()
  → statements/balance-sheet.ts → extractBalanceSheet()
  → statements/cash-flow.ts → extractCashFlow()
  → statements/reconcile.ts → reconcile() (BS balance, CF tie-out, IS→RE)
  → StatementApplierOutput { IS[], BS[], CF[], ReconciliationResult }
```

### Three-Tier Constant Fallback
```
Property-level value (e.g., property.acquisitionLTV)
  ?? Global assumption (e.g., global.debtAssumptions.acqLTV)
    ?? Client constant (e.g., DEFAULT_LTV = 0.75)
```

---

## Role-Based Access Control

| Role | Permissions |
|------|------------|
| `user` | View/edit own data, run pro formas, exports |
| `checker` | All user permissions + verification, validation APIs, checker manual |
| `admin` | All checker permissions + user management, activity logs, session control, design checks |

Admin is a **superset** of checker. The `requireChecker` middleware allows both admin and checker roles. Last-admin protection prevents demoting or deleting the final admin user.

---

## Database Conventions

- **Column naming:** Database uses `snake_case` (e.g., `cost_rate_fb`), Drizzle schema uses `camelCase` (e.g., `costRateFb`)
- **Per-user data:** Properties, assumptions, scenarios, themes scoped by `userId`
- **JSON columns:** Scenarios store full snapshots as JSON for point-in-time state
- **Seed data:** 5 pre-seeded properties with realistic boutique hotel configurations
