# Hospitality Business Group — Business Simulation Portal

A financial modeling and portfolio management platform for boutique hospitality. The portal generates GAAP-compliant monthly and yearly pro forma projections, income statements, balance sheets, cash flow statements, and investment return analyses for hospitality assets — all verified by a 4,536-test, 15-phase verification pipeline with three-tier financial verification.

---

## Table of Contents

- [What This Application Does](#what-this-application-does)
- [Business Model](#business-model)
- [Data Sources and Sources of Truth](#data-sources-and-sources-of-truth)
- [Infrastructure](#infrastructure)
- [Financial Engine](#financial-engine)
- [Calculation Methodology](#calculation-methodology)
- [Verification and Proof System](#verification-and-proof-system)
- [Intelligence & Risk Analysis](#intelligence--risk-analysis)
- [GAAP Standards Referenced](#gaap-standards-referenced)
- [Role-Based Access](#role-based-access)
- [AI Capabilities](#ai-capabilities)
- [Branding Architecture](#branding-architecture)
- [Admin Page Structure](#admin-page-structure)
- [Tech Stack](#tech-stack)
- [Codebase Overview](#codebase-overview)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Testing and Quality](#testing-and-quality)

---

## What This Application Does

This portal is a **full business simulation** for a hospitality management company. It allows administrators, partners, financial checkers, and investors to:

- **Model hotel properties** with configurable assumptions — room count, ADR, occupancy curves, revenue shares, expense ratios, capital structure (full equity or financed), and exit scenarios.
- **Generate pro forma projections** spanning up to 30 years (360 months) of monthly financial data per property.
- **View consolidated financial statements** — Income Statements, Balance Sheets, and Cash Flow Statements — at both the individual property level and the aggregated portfolio level.
- **Analyze the management company** — revenue from management fees (base + incentive), staff costs, partner compensation, overhead, SAFE funding tranches, and company net income.
- **Run investment return analyses** — IRR (Internal Rate of Return), equity multiples, cash-on-cash returns, and sensitivity analysis across variables like occupancy, ADR growth, cap rates, and interest rates.
- **Compare scenarios** — create and compare alternate assumption sets side-by-side with drift detection to evaluate different investment strategies.
- **Research intelligence** — AI-powered market research engines that gather competitive data, regulatory information, and property valuations from multiple sources.
- **Rebecca chatbot** — a RAG-powered AI assistant with screen context awareness that answers questions about properties, financials, and methodology.
- **Independently verify all calculations** — a three-tier proof system (server-side independent recalculation, client-side GAAP auditor, and AI-powered methodology review) produces audit opinions following standard audit language (Unqualified, Qualified, Adverse).
- **Manage branding** — configurable company name, logo, design theme, and asset descriptions with a hierarchical resolution system.
- **Generate AI-powered content** — logos, property photos, and market research using Google's Gemini, OpenAI, and Anthropic Claude models.
- **Export reports** — PDF, Excel (XLSX), and PowerPoint (PPTX) exports of financial statements, verification reports, and checker manuals.

Every financial number displayed on screen is the direct output of the financial engine — there is no mock data, no placeholder values, and no hardcoded assumptions in the rendering layer. What you see is what the math produces.

---

## Business Model

The system models **two distinct financial entities** linked by management fees:

```
┌──────────────────────────────────────┐
│        PROPERTY PORTFOLIO P&L        │
│                                      │
│  Revenue: Rooms + F&B + Events       │
│  Less: Operating Expenses            │
│  Less: Debt Service (financed)       │
│  = Free Cash Flow to Equity (FCFE)   │
└──────────────────┬───────────────────┘
                   │
                   │ Management Fees (5% base + 15% incentive on GOP)
                   ▼
┌──────────────────────────────────────┐
│       MANAGEMENT COMPANY P&L         │
│                                      │
│  Revenue: Mgmt Fees from all props   │
│  Less: Partners, Staff, Overhead     │
│  = Company Net Income                │
│  Funded by: SAFE tranches            │
└──────────────────────────────────────┘
```

### Property Lifecycle

Each property follows a four-phase lifecycle:

1. **Acquisition** — Purchase price + closing costs (2%) + operating reserve. Capital structure is either Full Equity or Financed (debt at 75% LTV default).
2. **Operations** — Revenue ramps from starting occupancy (55%) to stabilized max (85%) over a configurable period. Expenses follow USALI categories.
3. **Refinancing** — Financed properties can refinance (default: 3 years post-operations) based on appraised value. Net proceeds distribute to investors.
4. **Exit** — Properties are sold at end of projection period at cap-rate valuation. Net proceeds (after commission and debt payoff) determine final returns.

---

## Data Sources and Sources of Truth

Every number in the application traces back to an explicit, auditable source. There are **no hardcoded financial assumptions** in the rendering or business logic layers — all values flow from the sources below.

### Primary Data Sources

| Source | What It Contains | Where It Lives |
|--------|-----------------|----------------|
| **PostgreSQL Database** | All persistent state: properties, assumptions, users, companies, scenarios, logos, themes, activity logs, verification runs | `DATABASE_URL` — Neon-backed or self-hosted PostgreSQL |
| **Drizzle ORM Schema** | The single schema definition for all database tables | `shared/schema.ts` |
| **Global Assumptions Table** | Company-wide defaults: fee rates, expense ratios, occupancy targets, ADR growth, depreciation periods, staff FTEs, partner compensation | `global_assumptions` table in PostgreSQL |
| **Property Records** | Per-property overrides: room count, ADR, purchase price, capital structure, custom expense ratios, location, operating dates | `properties` table in PostgreSQL |
| **Named Constants** | Immutable system defaults and fallback values used when no database value exists | `client/src/lib/constants.ts` |
| **S3-Compatible Object Storage** | Uploaded images (logos, property photos), AI-generated images, exported documents | AWS S3, Cloudflare R2, or local filesystem |
| **Environment Variables (.env)** | API keys, passwords, and service configuration | `.env` file or host environment |

### Source of Truth Hierarchy

The financial engine uses a strict three-tier fallback for every configurable value:

```
Property-Specific Value  →  Global Assumption  →  DEFAULT Constant
     (highest priority)      (company-wide)        (immutable fallback)
```

- If a property has a custom ADR, that value is used.
- If not, the global assumption's default ADR is used.
- If neither exists, the constant `DEFAULT_ADR` from `constants.ts` applies.

This hierarchy is enforced by the financial engine and verified by the proof system. Any violation is flagged as an audit finding.

### Database Tables

| Table | Purpose |
|-------|---------|
| `users` | User accounts with roles (admin, partner, checker, investor) |
| `sessions` | Express session storage for authentication |
| `companies` | Companies of interest |
| `properties` | Hotel properties with financial assumptions |
| `global_assumptions` | Company-wide default assumptions |
| `property_fee_categories` | Custom fee/expense categories per property |
| `scenarios` | Alternate assumption sets for comparison analysis |
| `logos` | Logo images with names, URLs, and company associations |
| `design_themes` | UI themes (colors, typography, styling) |
| `asset_descriptions` | Configurable asset/property description templates |
| `login_logs` | Authentication audit trail |
| `activity_logs` | User activity tracking |
| `verification_runs` | Stored verification/audit results |
| `market_research` | AI-generated market research data |
| `prospective_properties` | Property finder search results |
| `saved_searches` | Saved property search configurations |
| `conversations` / `messages` | AI chat conversation history |

---

## Infrastructure

| Component | Technology |
|-----------|-----------|
| **Database** | PostgreSQL (Neon or self-hosted) via Drizzle ORM |
| **Object Storage** | S3-compatible (AWS S3, Cloudflare R2, or local filesystem) |
| **Authentication** | Express sessions + configurable OAuth providers |
| **AI Integrations** | Anthropic Claude, Google Gemini, OpenAI (direct API keys) |
| **Deployment** | Any Node.js host (Vercel, Railway, Fly.io, Docker) |

---

## Financial Engine

The financial engine lives in `engine/` and generates monthly projections using a single-source architecture:

```
User Input (UI)
    │
    ▼
Global Assumptions (DB) + Property Data (DB)
    │
    ▼
engine/ → generatePropertyProForma()
    │
    ▼
MonthlyFinancials[] (up to 360 months of projections)
    │
    ├── Dashboard charts (aggregated portfolio view)
    ├── Property detail tables (individual analysis)
    ├── Company P&L (management company roll-up)
    ├── Balance sheet (consolidated view)
    └── Cash flow statement (GAAP indirect method)
```

### Revenue Model

Revenue is calculated from room revenue, with all other streams expressed as a percentage of total revenue:

```
totalRevenue = roomRevenue / (1 - eventsShare - fbShare - otherShare)
```

Each stream is a share of total revenue, ensuring the portfolio-level revenue split is always internally consistent.

For luxury rental properties, room revenue uses per-property-per-night pricing:

```
roomRevenue = nightlyPropertyRate × daysPerMonth × occupancy
```

### Additional Engine Features

- **Seasonality** — 12 monthly multipliers that adjust ADR and occupancy by month
- **Occupancy ramp curves** — configurable ramp from starting to stabilized occupancy
- **Owner's priority return** — preferred return to equity investors before incentive fees
- **Fee subordination** — management fee waterfall with priority ordering

All named constants are defined in a single source of truth: `client/src/lib/constants.ts`. The system uses a three-tier fallback: **property-specific value → global assumption → DEFAULT constant**.

Every save action in the application triggers a **full financial recalculation** — there is no partial cache invalidation. This ensures that every number displayed is always current and internally consistent.

---

## Calculation Methodology

### Revenue

| Stream | Formula | Default Share of Total |
|--------|---------|----------------------|
| Room Revenue | Room Count x ADR x Occupancy x 30.5 days | 49% (1 - 0.18 - 0.30 - 0.03) |
| F&B Revenue | Total Revenue x F&B Share | 30% of total revenue |
| Event Revenue | Total Revenue x Events Share | 18% of total revenue |
| Other Revenue | Total Revenue x Other Share | 3% of total revenue |

- **30.5 days/month** is an immutable industry standard (365 / 12)
- ADR grows annually at the configured growth rate (default 3%)
- Occupancy ramps over configurable months, then grows by step increments

### Operating Expenses (USALI Standard)

| Category | Default Rate | Basis |
|----------|-------------|-------|
| Room Department | 36% | Room Revenue |
| F&B Department | 15% | F&B Revenue |
| Events | 65% | Event Revenue |
| Admin & General | 8% | Total Revenue |
| Marketing | 5% | Total Revenue |
| Property Operations | 4% | Total Revenue |
| Utilities | 5% (60% variable / 40% fixed) | Total Revenue |
| Property Taxes | 3% | Property Value |
| IT & Technology | 0.5% | Total Revenue |
| FF&E Reserve | 4% | Total Revenue |

### Profitability Waterfall

```
Total Revenue
  - Operating Expenses
  = Gross Operating Profit (GOP)
  - Management Fees (base + incentive)
  - FF&E Reserve
  = Net Operating Income (NOI)
  - Interest Expense
  - Depreciation (39-year straight-line per IRC §168(e)(2)(A))
  = Net Income
```

### Debt Service

- **PMT formula**: `P x r x (1+r)^n / ((1+r)^n - 1)` — standard amortization
- Default: 75% LTV, 9% interest, 25-year amortization
- Each payment splits into interest (operating expense per ASC 470) and principal (financing activity)
- Refinancing uses a two-pass calculation: project NOI forward → appraise → new loan → re-amortize

### Cash Flow Statement (GAAP Indirect Method)

```
Net Income
  + Depreciation (non-cash add-back)
  = Operating Cash Flow                    [ASC 230]
  - Capital Expenditures
  = Free Cash Flow (FCF)
  - Principal Payments                     [ASC 470 — financing activity]
  = Free Cash Flow to Equity (FCFE)
```

### Balance Sheet

```
Assets = Liabilities + Equity             [FASB Conceptual Framework]

Assets:      Purchase Price + Improvements - Accumulated Depreciation + Cash
Liabilities: Outstanding Loan Balance (after principal payments / refinancing)
Equity:      Initial Equity + Retained Earnings
```

Verified every month across every property — any imbalance triggers a critical audit finding.

---

## Verification and Proof System

The system provides **independent three-tier verification** of all financial calculations, backed by **4,694+ automated tests** across 187+ test files with a 15-phase verification pipeline.

### Tier 1: Server-Side Independent Recalculation

`server/calculationChecker.ts` reimplements all financial math from scratch — it does **not** import from the client-side engine. This ensures true independence. Approximately 18 checks per property plus company and consolidated checks, covering:

- Revenue calculations (ASC 606)
- Depreciation (ASC 360)
- Loan amortization and interest/principal split (ASC 470)
- Balance sheet equation (FASB)
- Cash flow classification (ASC 230)
- NOI margin reasonableness (industry benchmarks)

### Tier 2: Client-Side GAAP Auditor

Three client-side modules run in the browser:

| Module | Purpose |
|--------|---------|
| `financialAuditor.ts` | GAAP audit with ASC references for each property |
| `formulaChecker.ts` | Mathematical relationship validation (GOP = Rev - OpEx, etc.) |
| `gaapComplianceChecker.ts` | Cash flow classification and compliance checks |

### Tier 3: AI-Powered Methodology Review

An optional LLM review (Anthropic Claude, OpenAI, or Google Gemini) analyzes the full verification report for methodology issues, streamed via SSE.

### Audit Opinions

| Opinion | Criteria |
|---------|----------|
| **UNQUALIFIED** | 0 critical, 0 material issues — clean opinion |
| **QUALIFIED** | 0 critical, some material issues — minor discrepancies |
| **ADVERSE** | Any critical issues — significant errors found |

Tolerance: 1% variance allowed for floating-point comparison.

### Calculation Transparency

Two toggles in **Settings > Other** control whether formula explanations (? tooltip icons beside each line item) are visible:

- `showCompanyCalculationDetails` — Management Company reports
- `showPropertyCalculationDetails` — Property reports

When ON (default), every financial line item shows a help icon explaining its formula and meaning. When OFF, the view is clean and investor-ready.

---

## Intelligence & Risk Analysis

### Research Intelligence
- **Regenerate Intelligence**: One-button AI research using N+1 multi-LLM pipeline with entity-aware context
- **Range Badges**: Gold/amber badges next to every assumption field showing researched min-max ranges
- **Confidence Scoring**: 7-factor weighted score (0-100) per field and per entity
- **25 Data Sources**: FRED, Perplexity, Tavily, Pinecone, 3 RapidAPI slots, Google Maps, Walk Score, and more — all health-checked
- **18-Country Regulatory Data**: Licensing, zoning, building codes, foreign investment, labor for all supported markets

### Risk Analysis
- **Portfolio Risk Scoring**: 5-factor analysis (concentration, geographic, market tier, financial, operational) with A-F grade
- **Stress Scenarios**: 5 deterministic tests (occupancy -15%, ADR -10%, rates +200bps, costs +20%, combined) with DSCR breach detection
- **Risk Intelligence Engine**: Deterministic insights + optional LLM-generated investor narratives
- **Property Defaults**: 4-layer cascade (business model → country → quality tier → scale) for intelligent assumption defaults

### Property Portfolio Management
- **Soft Delete**: Properties are never permanently deleted — archived with timestamp, restorable by admin
- **Portfolio Assignment**: Admin assigns properties to users via toggles. Users see only their assigned portfolio.
- **Scenario Overrides**: Users customize assumptions per scenario without changing the base property record

---

## GAAP Standards Referenced

| Standard | Topic | Application |
|----------|-------|-------------|
| ASC 230 | Statement of Cash Flows | Indirect method, operating/investing/financing classification |
| ASC 360 | Property, Plant & Equipment | 39-year straight-line depreciation (nonresidential per IRC §168(e)(2)(A)), asset valuation |
| ASC 470 | Debt | Loan amortization, interest/principal separation |
| ASC 606 | Revenue Recognition | Revenue timing and calculation verification |
| USALI | Uniform System of Accounts for Lodging | Hospitality-specific expense categorization |
| FASB Conceptual Framework | General | Balance sheet equation, double-entry integrity |

---

## Role-Based Access

### User Roles

| Role | Access Level |
|------|-------------|
| **Admin** | Full access — all pages, Administration panel, user management, system configuration |
| **Partner** | Management-level — Dashboard, Properties, Company, Settings, Reports (no Administration) |
| **Checker** | Financial verification — same as Partner, plus access to verification tools and checker manual |
| **Investor** | Limited view — Dashboard, Properties, Profile, Help only |

---

## AI Capabilities

### Image Generation

- **Primary model:** Gemini (`gemini-2.5-flash-image`) via Google Gemini — fast, high-quality image generation
- **Fallback model:** OpenAI `gpt-image-1`
- **Reusable component:** `AIImagePicker` supports three modes: file upload, AI prompt generation, and manual URL input
- **Use cases:** Logo creation, property photo generation, branding assets
- **Server endpoint:** `POST /api/generate-property-image` — generates image, uploads to object storage, returns the object path

### Market Research

AI-powered market research analysis for property markets, using multi-provider LLM access (Anthropic Claude, Google Gemini, OpenAI) with direct API keys.

### Rebecca Chatbot

RAG-powered AI assistant using Pinecone vector database for document retrieval. Context-aware — understands which property or page the user is viewing and provides relevant financial insights, methodology explanations, and data lookups.

### Financial Methodology Review

Optional AI analysis of verification reports to flag potential methodology issues beyond what automated checks cover.

### AnimatedLogo

Logos are rendered through an SVG wrapper component (`AnimatedLogo`) that converts raster images into vector-like elements supporting scaling and animations (pulse, glow, spin, bounce).

---

## Branding Architecture

Branding resolution follows a strict hierarchy:

```
User → Company Setting → Default
```

- **Design Themes** are standalone entities (not user-owned). Each has an `isDefault` flag.
- **Users** have a free-text company field and inherit branding from company-level configuration.
- **Admin** manages branding at the company level.

---

## Admin Page Structure

The Administration page (`/admin`) is organized into these tabs:

| Tab | Purpose |
|-----|---------|
| **Users** | Create, edit, delete users; manage roles and passwords |
| **Companies** | Manage companies of interest |
| **Activity** | View user activity logs and audit trail |
| **Verification** | Run and view financial verification results |
| **Logos** | Upload, AI-generate, or URL-import logo images |
| **Branding** | View branding configuration summary |
| **Themes** | Manage design themes (colors, typography) |
| **Navigation** | Configure sidebar navigation visibility |
| **Database** | Database management and diagnostics |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript, Wouter, TanStack Query, shadcn/ui, Tailwind CSS, Recharts, Three.js |
| Backend | Node.js + Express 5, TypeScript ESM |
| Database | PostgreSQL (Neon or self-hosted) with Drizzle ORM |
| Object Storage | S3-compatible (AWS S3, Cloudflare R2, or local filesystem) |
| AI Image Generation | Gemini (`gemini-2.5-flash-image`), OpenAI (`gpt-image-1`) |
| AI Text/Analysis | Anthropic Claude, Google Gemini Pro, OpenAI GPT |
| Vector Database | Pinecone (RAG for Rebecca chatbot) |
| Authentication | Express sessions + configurable OAuth |
| Error Tracking | Sentry |
| Analytics | PostHog |
| Caching | Upstash Redis |
| Transactional Email | Resend |
| Build | Vite (client), esbuild (server) |
| Deployment | Any Node.js host (Vercel, Railway, Fly.io, Docker) |
| Exports | jsPDF, xlsx, pptxgenjs |

---

## Codebase Overview

```
engine/                                   # Pure financial calculation engine (no I/O)
calc/                                     # Standalone calculation modules (78 files)
server/                                   # Express API, storage, AI, exports (294 files)
client/                                   # React 18 frontend (702 files)
shared/                                   # Types, constants, schemas (36 files)
tests/                                    # Test suites (194 files)
.claude/                                  # AI development knowledge base
docs/                                     # Architecture, user guide, research, planning
```

### Key Files and Directories

```
shared/
  schema.ts                               # Drizzle ORM schema — single source of truth for all tables

engine/
  property/                               # Property-level financial calculations
                                          # Revenue, expenses, debt, depreciation, cash flow

client/src/
  pages/
    Dashboard.tsx                          # Portfolio overview — charts, KPIs, consolidated statements
    PropertyDetail.tsx                     # Individual property financial analysis
    Company.tsx                            # Management company P&L and projections
    CompanyAssumptions.tsx                 # Global model configuration
    PropertyEdit.tsx                       # Property-level assumption editing
    FinancingAnalysis.tsx                  # Loan and refinancing analysis
    SensitivityAnalysis.tsx               # Multi-variable sensitivity tables
    Methodology.tsx                        # Calculation methodology documentation
    Admin.tsx                              # Administration — users, companies, branding, verification
    Settings.tsx                           # User preferences and calculation transparency
    Help.tsx                               # In-app help and documentation
  lib/
    constants.ts                           # All named constants and defaults
    loanCalculations.ts                    # Loan amortization and refinance logic
    financialAuditor.ts                    # Client-side GAAP audit engine
    formulaChecker.ts                      # Mathematical relationship validation
    gaapComplianceChecker.ts               # Cash flow compliance checks
    cashFlowSections.ts                    # Cash flow statement section builder
    runVerification.ts                     # Verification orchestrator
  components/
    ui/                                    # Reusable UI components (60+ files)
      ai-image-picker.tsx                  # Generic AI image picker (upload + generate + URL)
      animated-logo.tsx                    # SVG logo wrapper with animation support
      help-tooltip.tsx                     # Financial line item explanation tooltips
    financial-table-rows.tsx               # Composable financial statement row primitives
    FinancialStatement.tsx                 # Monthly pro forma table
    YearlyIncomeStatement.tsx              # Annual income statement
    YearlyCashFlowStatement.tsx            # Annual cash flow statement
    ConsolidatedBalanceSheet.tsx           # Balance sheet view

server/
  routes/                                  # Express API routes
  storage.ts                               # Database access layer (IStorage interface)
  auth.ts                                  # Authentication & session management
  ai/                                      # AI integrations (image generation, research, chatbot)
  report/                                  # Export generation (PDF, XLSX, PPTX)
  seeds/                                   # Database seeding with sample properties

calc/
  analysis/                                # Portfolio consolidation and scenario comparison
  returns/                                 # IRR vector and return calculations
  validation/                              # Cross-calculator validation and reconciliation
  shared/                                  # Shared calculation utilities

tests/
  golden/                                  # Golden scenario tests
  proof/                                   # Proof system tests
  engine/                                  # Engine calculation tests
```

---

## Getting Started

```bash
# Option 1: Direct (requires Node.js 20+ and PostgreSQL 16+)
npm install
cp .env.example .env  # Fill in your API keys
npm run db:push
npm run dev

# Option 2: Docker
docker-compose up -d
```

### Seeding Sample Data

```bash
# Seed database with sample data
npx tsx server/seed.ts

# Force re-seed (clears existing properties & assumptions)
npx tsx server/seed.ts --force
```

### Quick Commands

```bash
npm run health         # TypeScript + tests + verification in one shot
npm run test:summary   # Run all tests (1-line output on pass)
npm run verify:summary # Financial verification (compact output)
npm run lint:summary   # TypeScript type checking
npm run stats          # Codebase metrics
npm run audit:quick    # Quick code quality scan
npm run exports:check  # Find unused exports
```

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `ANTHROPIC_API_KEY` | Claude API for research and chatbot |
| `GOOGLE_AI_API_KEY` | Gemini for image generation and research |
| `OPENAI_API_KEY` | GPT for fallback image generation |
| `PINECONE_API_KEY` | Vector database for RAG |
| `PINECONE_INDEX` | Pinecone index name |
| `SENTRY_DSN` | Error tracking |
| `POSTHOG_KEY` | Analytics |
| `UPSTASH_REDIS_URL` | Caching |
| `RESEND_API_KEY` | Transactional email |
| `S3_BUCKET` / `S3_REGION` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` | Object storage |
| `SESSION_SECRET` | Express session encryption |
| `ADMIN_PASSWORD` | Admin user password |

---

## Testing and Quality

| Metric | Value |
|--------|-------|
| **Total Tests** | 4,694+ across 187+ test files |
| **Verification Pipeline** | 15-phase verification pipeline |
| **Test Coverage** | Revenue, expenses, depreciation, loan amortization, balance sheet, cash flow, management fees, scenarios, refinancing, IRR, sensitivity analysis, seasonality, luxury rentals |
| **Verification Opinion** | UNQUALIFIED (clean — 0 critical, 0 material issues) |
| **TypeScript** | Strict mode, 0 errors |

The proof system runs automatically and can be triggered manually via `npm run verify`. Every financial calculation is independently verified by both the server-side checker and client-side auditor before an audit opinion is issued.
