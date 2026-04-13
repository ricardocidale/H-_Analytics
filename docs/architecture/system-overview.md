# System Architecture Overview

HBG Portal is a full-stack financial simulation platform for hospitality investment.
It models boutique hotel properties (SPVs) and the management company that serves them.

---

## System Layers

```
┌─────────────────────────────────────────────────────────┐
│  Client (React 18 + Vite)                               │
│  Pages → Components → Hooks → lib/financial/ engines    │
│  lib/exports/ (PDF, XLSX, PPTX, PNG, CSV, DOCX)        │
├─────────────────────────────────────────────────────────┤
│  Server (Express 5 + TypeScript ESM)                    │
│  routes.ts → storage/ facade → Drizzle ORM → PostgreSQL │
│  calculationChecker.ts (independent verification)       │
│  ai/ (research orchestration, Rebecca chatbot)          │
├─────────────────────────────────────────────────────────┤
│  Engine Layers (pure computation, no I/O)               │
│  calc/         37 deterministic tools (dispatch.ts)     │
│  engine/       Double-entry posting engine               │
│  statements/   IS, BS, CF extraction from trial balance │
│  analytics/    FCF, IRR, sensitivity analysis            │
│  domain/       Chart of accounts, accounting types       │
├─────────────────────────────────────────────────────────┤
│  Shared (used by both client and server)                │
│  shared/schema.ts    Drizzle tables + Zod schemas       │
│  shared/constants.ts DEFAULT_* named constants           │
│  shared/*.ts         Enums, dates, auth, types           │
└─────────────────────────────────────────────────────────┘
```

---

## Data Flow

```
User edits assumptions
  → Client engine (property-engine.ts / company-engine.ts)
    → Monthly pro-forma generation
      → Yearly aggregation (yearlyAggregator.ts)
        → Financial statements (IS, BS, CF, Investment Analysis)
          → UI display (financial tables, charts, KPIs)
          → Export (PDF, Excel, PowerPoint, PNG, CSV, DOCX)

Parallel verification path:
  → Server calculationChecker.ts (independent recalc)
  → Client financialAuditor.ts (103-check verification)
  → AI review via Rebecca (contextual explanation)
```

When any assumption changes, `invalidateAllFinancialQueries()` triggers full recalculation.

---

## Two-Entity Model

### Property SPVs (Special Purpose Vehicles)
- Each hotel property is held in its own legal entity
- Revenue: Room Revenue (ADR x Occupancy x Rooms x 30.5 days/month) + F&B + Events + Other
- Expenses follow USALI waterfall: Departmental -> Undistributed -> GOP -> Mgmt Fees -> AGOP -> Property Taxes -> NOI -> FF&E Reserve -> ANOI -> Interest / Depreciation / Tax -> Net Income
- Each property has its own debt schedule, depreciation, income tax (with NOL carryforward)
- Two business models: boutique hotel (per-room pricing) and luxury rental (per-property-per-night)

### Management Company (ManCo / OpCo)
- Never owns property — pure services and brand management
- Revenue: Base Fee + Incentive Fee from each managed property
- Many services are pass-through: ManCo hires vendors, applies markup
- Overhead: tiered staffing (scales with portfolio), fixed costs, variable costs per property
- Funded by SAFE instrument (two tranches) during pre-profitability phase

### Intercompany Linkage
Management fees paid by properties = fee revenue received by ManCo. These eliminate to zero in ASC 810 consolidation. Validated by the proof system.

---

## Revenue Model

Total property revenue derives from the room-revenue share:

```
totalRevenue = roomRevenue / (1 - eventsShare - fbShare - otherShare)
```

Where shares represent each revenue stream's proportion of total revenue. The business targets a 50/50 rooms-to-F&B revenue split.

---

## Three-Tier Verification

| Tier | Component | Location | Purpose |
|------|-----------|----------|---------|
| 1 | Server Checker | `server/calculationChecker.ts` | Independent server-side recalculation (never imports client engine) |
| 2 | Client Auditor | `client/src/lib/financialAuditor.ts` | 103-check verification engine (balance sheet balance, CF tie-out, IS->RE roll) |
| 3 | AI Review | `server/ai/` + Rebecca | Contextual explanation and anomaly detection |

Critical rule: `calculationChecker.ts` must NEVER import from the client engine. Independence is the point.

Additional verification layers:
- `calc/validation/` — Financial identity checks, funding gates, reconciliation
- `statements/reconcile.ts` — BS balance, CF tie-out, IS->RE roll-forward
- `tests/proof/` — 761 hand-calculated golden reference tests
- `npm run verify` — Runs full proof system; must remain UNQUALIFIED

---

## Research Pipeline

```
Entity context (property location, type, assumptions)
  → Research orchestrator (server/ai/)
    → Multi-source: Gemini 2.5 Flash (primary) + Claude (verification)
    → Live data: FRED API, hospitality benchmarks, RapidAPI
    → Deterministic calc tools (calc/research/) handle all arithmetic
    → Pinecone RAG for knowledge base retrieval
      → Research badges on UI assumption fields (3-tier hierarchy)
      → Rebecca chatbot for conversational explanation
```

LLMs never compute numbers — all arithmetic goes through deterministic `calc/` tools.

---

## Key Files Map

### Financial Engines
| File | Purpose |
|------|---------|
| `client/src/lib/financial/property-engine.ts` | Single-property monthly pro-forma (~601 lines) |
| `client/src/lib/financial/company-engine.ts` | ManCo monthly pro-forma (~361 lines) |
| `client/src/lib/financial/loanCalculations.ts` | Debt sizing, amortization, refinance |
| `shared/constants.ts` | Single source of truth for DEFAULT_* values |

### Verification
| File | Purpose |
|------|---------|
| `server/calculationChecker.ts` | Independent server-side verification |
| `client/src/lib/financialAuditor.ts` | 103-check client verification |
| `client/src/lib/runVerification.ts` | Orchestrates all verification suites |

### Server Core
| File | Purpose |
|------|---------|
| `server/routes.ts` | All REST API endpoints (~70 routes) |
| `server/storage/index.ts` | IStorage interface + DatabaseStorage facade |
| `server/db.ts` | Drizzle ORM database connection |
| `server/seed.ts` | Database seeding (users, properties, assumptions) |

### Double-Entry Engine
| File | Purpose |
|------|---------|
| `domain/ledger/accounts.ts` | Chart of accounts (13 accounts) |
| `engine/posting/post.ts` | postEvents(): validates and posts StatementEvents |
| `statements/event-applier.ts` | Orchestrator: events -> post -> TB -> IS/BS/CF -> reconcile |

---

## Storage Facade Pattern

`DatabaseStorage` implements `IStorage` as a thin facade delegating to 11 specialized classes:

```
IStorage (interface)
  └── DatabaseStorage (facade)
        ├── UserStorage, PropertyStorage, FinancialStorage
        ├── AdminStorage, ActivityStorage, ResearchStorage
        ├── PhotoStorage, DocumentStorage, ServiceStorage
        └── NotificationStorage
```

Route handlers receive `storage: IStorage` — never access specialized classes directly.

---

## Server Finance: Re-Export Pattern

The server imports client pure functions directly — single source of truth, no duplication:

```
server/finance/core/
  ├── property-pipeline.ts  → re-exports generatePropertyProForma from client
  ├── yearly-aggregator.ts  → re-exports aggregatePropertyByYear from client
  └── consolidation.ts      → re-exports consolidateYearlyFinancials from client
```

This ensures server and client always use identical math.

---

## Provider Abstraction

Replit-specific integrations are isolated in `server/replit_integrations/`. The storage layer uses an `IStorage` interface so the backing implementation (currently Drizzle + PostgreSQL) can be swapped without changing route handlers. Environment-specific config lives in `server/config/`.

---

## Tech Stack Summary

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, TanStack Query, Zustand, shadcn/ui, Tailwind CSS, Framer Motion |
| Backend | Express 5, TypeScript ESM, Drizzle ORM |
| Database | PostgreSQL 16 (Neon cloud or local) |
| Testing | Vitest (4,536+ tests) |
| AI | Gemini 2.5 Flash, Claude, OpenAI (configurable) |
| Exports | @react-pdf/renderer, ExcelJS, PptxGenJS, Puppeteer (PNG) |
| Vector DB | Pinecone (Rebecca RAG) |
