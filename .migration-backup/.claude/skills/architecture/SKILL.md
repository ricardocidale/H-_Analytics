---
name: architecture
description: Project architecture, tech stack, and two-entity financial model. Use when building new features, understanding system structure, or making architectural decisions.
---

# Architecture & Tech Stack

## Project Summary

H+ Analytics by Norfolk AI is a GAAP-compliant financial simulation platform for boutique hospitality management. It models a management company alongside individual property SPVs, producing monthly and yearly financial projections with full three-statement output (Income Statement, Balance Sheet, Cash Flow Statement).

The platform enforces ASC 230, ASC 360, and ASC 470 compliance, applies IRS depreciation rules (straight-line and MACRS), and includes a built-in audit and verification engine. The test suite contains 4,536+ tests across 187+ files (500 golden reference tests) covering calculation accuracy, GAAP identity checks, and golden-file reconciliation. Hosted on Replit.

## Tech Stack

### Frontend
- **UI framework:** React 18 with TypeScript
- **Routing:** Wouter
- **Data fetching:** TanStack Query
- **State management:** Zustand
- **Component library:** shadcn/ui
- **Styling:** Tailwind CSS v4
- **Charts:** Recharts
- **3D & animation:** Three.js (react-three/fiber, drei, postprocessing), framer-motion
- **Typography:** Playfair Display (headings) + Inter (UI and data)

### Backend
- **Runtime:** Node.js with TypeScript (ESM)
- **Framework:** Express 5
- **ORM:** Drizzle ORM
- **Database:** PostgreSQL (Neon-backed via Replit)

### Build Tooling
- **Client:** Vite
- **Server:** esbuild

## Replit Platform Services

| Service | Details |
|---------|---------|
| **Database** | PostgreSQL via Neon — managed through Replit's built-in DB tooling |
| **Object Storage** | GCS-backed bucket for logos, property images, and exports |
| **AI Integrations** | Gemini, OpenAI, and Anthropic — used for market research and image generation |
| **Authentication** | Replit Auth (Login with Replit) |
| **Secrets Management** | API keys and credentials stored via Replit Secrets |
| **Deployments** | Replit Deployments for production hosting |

## Two-Entity Financial Model

### 1. Management Company
- Maintains its own Income Statement, Cash Flow Statement, Balance Sheet, and FCF/IRR
- Generates revenue through management and service fees charged to properties
- Fee revenue must match property fee expenses (intercompany linkage)

### 2. Property Portfolio
- Each property is modeled as an independent SPV
- Full financial statements and returns per property
- Aggregated and consolidated portfolio views available
- Consolidation includes intercompany elimination

### Five Mandatory Business Rules
Enforced across all scenarios. See `.claude/manuals/user-manual/skills/02-business-rules.md` for details.

## User Roles

| Role | Purpose |
|------|---------|
| **admin** | Full access — manage users, companies, properties, and system settings |
| **partner** | Company-level access — view and edit properties within assigned companies |
| **checker** | Read-only verification — run audits and review financial accuracy |
| **investor** | Portfolio-level read access — view dashboards and reports |

## Database Schema (35 tables)

**Core entities**
- `users`, `sessions`, `user_groups`

**Business data**
- `companies`, `properties`, `global_assumptions`, `property_fee_categories`, `scenarios`

**Branding & assets**
- `logos`, `design_themes`, `asset_descriptions`, `property_photos`

**Audit & activity**
- `login_logs`, `activity_logs`, `verification_runs`

**Research & prospecting**
- `market_research`, `market_rates`, `prospective_properties`, `saved_searches`, `research_questions`

**AI conversations**
- `conversations`, `messages`

**Notifications & alerts**
- `alert_rules`, `notification_logs`, `notification_preferences`, `notification_settings`

**Document intelligence**
- `document_extractions`, `extraction_fields`, `docusign_envelopes`

## Sub-Skills

| File | Purpose |
|------|---------|
| `app-architecture.md` | **Unified architecture map** — navigation, all 86+ property fields, 107 global assumptions, file injection points, 30+ external dependencies, codebase health trends, intelligence pipeline |
| `api-routes.md` | API endpoint reference (all `/api/` routes) — now in `.claude/rules/` |
| `storage-facade.md` | IStorage facade pattern, 8 specialized storage classes |

## File Organization

```
client/src/
├── pages/                        # Route-level page components
├── components/
│   ├── ui/                       # shadcn/ui component library
│   ├── charts/                   # HeatMap, RadarChart, WaterfallChart
│   └── graphics/                 # 3D backgrounds, motion, composites
├── features/
│   ├── design-themes/            # Theme manager and hooks
│   └── property-images/          # AI image generation
├── lib/
│   ├── exports/                  # Excel, PPTX, PDF, PNG, CSV export
│   ├── financial/                 # Core calculation engines (split modules)
│   │   ├── property-engine.ts    # Single-property pro-forma (generatePropertyProForma)
│   │   ├── company-engine.ts     # Management-company pro-forma (generateCompanyProForma)
│   │   └── index.ts              # Barrel re-export
│   ├── financialEngine.ts        # Re-export shim (backward compat → ./financial/)
│   ├── loanCalculations.ts       # Loan amortization and sizing
│   ├── equityCalculations.ts     # Equity waterfall and distributions
│   ├── cashFlowAggregator.ts     # Monthly cash flow roll-up
│   ├── yearlyAggregator.ts       # Yearly aggregation
│   ├── gaapComplianceChecker.ts  # Client-side GAAP checks
│   ├── financialAuditor.ts       # Audit engine
│   ├── runVerification.ts        # Verification runner
│   ├── constants.ts              # Named constants and defaults
│   └── store.ts                  # Zustand store
└── hooks/                        # use-auth, use-toast, use-analytics, etc.

server/
├── routes.ts                     # Express API routes
├── storage.ts                    # IStorage interface + Drizzle implementation
├── auth.ts                       # Authentication middleware
├── calculationChecker.ts         # Server-side financial verification
├── seed.ts                       # Database seed data
├── aiResearch.ts                 # AI-powered market research
├── integrations/                 # Stripe, Gmail, Google Sheets, etc.
└── replit_integrations/          # Auth, object storage, chat, image, audio

calc/
├── shared/                       # PMT, schedule helpers, schemas, types
├── financing/                    # Loan sizing, DSCR, debt yield, sensitivity
├── funding/                      # Equity rollforward, gates, timeline
├── refinance/                    # Refi calculator, payoff, schedule
├── returns/                      # DCF/NPV, IRR, equity multiple, exit valuation
├── analysis/                     # Break-even, stress test, waterfall, RevPAR
└── validation/                   # Identity checks, gate validation, reconciliation

shared/
├── schema.ts                     # Drizzle table definitions + Zod schemas
└── constants.ts                  # Shared constants

domain/
├── ledger/                       # Chart of accounts, journal types
└── types/                        # Accounting policy, rounding, journal deltas

engine/
└── posting/                      # Journal posting, trial balance

statements/
├── income-statement.ts           # Income statement builder
├── balance-sheet.ts              # Balance sheet builder
├── cash-flow.ts                  # Cash flow statement builder
├── reconcile.ts                  # Statement reconciliation
└── event-applier.ts              # Event-driven statement updates

analytics/
├── fcf/                          # Free cash flow computation
└── returns/                      # IRR, sensitivity, metrics

tests/
├── engine/                       # Proforma, GAAP, formatters, golden files
├── financing/                    # Loan calculator, closing costs, sizing
├── funding/                      # Equity rollforward, gates, timeline
├── refinance/                    # Refi calculator, payoff, schedule
├── statements/                   # Three-statement and reconciliation tests
├── analytics/                    # IRR, NPV, sensitivity, golden files
├── calc/                         # Stress test, waterfall, RevPAR, validation
├── proof/                        # Hardcoded detection, reconciliation reports
├── auth/                         # Auth utility tests
└── admin/                        # Database sync tests
```
