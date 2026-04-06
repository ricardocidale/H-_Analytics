# Project Description — Hospitality Business Group Financial Modeling Portal

## Overview

HBG Portal is a comprehensive financial simulation and analysis platform for hospitality investment professionals. It models the consolidated financial performance of a portfolio of hotel properties and the hospitality management company that serves them.

**The full product purpose, two-entity model, revenue streams, research engine, AI assistant, admin capabilities, and design tenets are documented in `.claude/skills/product-vision/SKILL.md`. Read that skill for any work involving product direction, feature planning, or understanding what the app does and why.**

---

## Two Business Entities

### 1. Property SPVs (Special Purpose Vehicles)
- Each hotel property is held in its own legal entity
- Revenue driven by: Room Revenue (ADR × Occupancy × Rooms × 30.5 days/month), F&B, Events, Other
- Expenses follow USALI waterfall: Departmental → Undistributed → GOP → Management Fees → AGOP → Property Taxes → NOI → FF&E Reserve → ANOI → Interest / Depreciation / Tax → Net Income
- Each property has its own debt schedule, depreciation, and income tax (with NOL carryforward)
- Properties activate at `acquisitionDate` / `operationsStartDate` — no revenue before operations begin

### 2. Hospitality Management Company (ManCo / OpCo)
- Never owns property — pure services and brand management
- Revenue: Base Fee + Incentive Fee from each property it manages
- Many services are **pass-through**: ManCo hires third-party vendors and applies a markup
- Overhead: tiered staffing (scales with portfolio size), fixed costs, variable costs per property
- Funded by SAFE instrument (two tranches) during pre-profitability phase

### Intercompany Relationship
Management fees paid by properties = fee revenue received by ManCo. These eliminate to zero in consolidation (ASC 810). This is validated by the proof system.

---

## Financial Statements (Authority-Compliant)

Produced for each entity (property, portfolio rollup, ManCo, consolidated):

| Statement | Standard |
|-----------|----------|
| Income Statement | GAAP / USALI |
| Statement of Cash Flows | ASC 230 |
| Balance Sheet | GAAP (must balance within $1) |
| Investment Analysis | Industry (IRR, Equity Multiple, FCFE, DCF) |

Exportable at any level in six formats: PDF, Excel, CSV, PowerPoint, PNG (ZIP), DOCX.

---

## Financial Engine Architecture

| File | Purpose |
|------|---------|
| `client/src/lib/financial/property-engine.ts` | Single-property monthly pro-forma (`generatePropertyProForma`) |
| `client/src/lib/financial/company-engine.ts` | ManCo monthly pro-forma (`generateCompanyProForma`) |
| `client/src/lib/financial/loanCalculations.ts` | Loan amortization, PMT |
| `client/src/lib/constants.ts` | Named constants and defaults |
| `server/calculationChecker.ts` | Independent server-side recalculation (never imports client engine) |
| `calc/dispatch.ts` | 37 deterministic tool registry (pure functions, no I/O) |

**Critical rule:** `calculationChecker.ts` must NEVER import from the client engine. Independence is the entire point of the verification system.

---

## Key Domain Areas

### Assumptions & Recalculation
- Each property has a large set of assumptions (room count, ADR, occupancy ramp, acquisition cost, debt terms, renovation, capex, etc.)
- GlobalAssumptions configure ManCo behavior, staffing tiers, inflation, SAFE funding, and more
- When assumptions change, ALL calculations recalculate via `invalidateAllFinancialQueries()`
- Users save snapshots as **Scenarios** — restoring a scenario always produces identical outputs

### Multi-LLM AI Research Engine
- Research badges on assumption fields provide guided ranges and benchmarks
- Three tiers: property research, company research, global/market research
- Uses Gemini 2.5 Flash (primary), Claude (verification), FRED API, hospitality benchmarks, RAG files
- Deterministic `calc/research/` tools handle all arithmetic — LLMs never compute numbers
- Research is informational only; never auto-applies

### Rebecca AI Chatbot
- Answers anything about the app, its calculations, its assumptions, and workflows
- Injected with full financial context (property data, pro-forma output, global assumptions)
- Handles: Super Conversations, context injection, email summaries, fee breakdowns

### Admin Panel
- User management, user groups, multi-tenant branding/themes
- Model defaults (LLM routing), AI agent configuration (Rebecca)
- Research configuration, ICP management, asset definitions
- Database tools, integration status, logs

---

## Assumptions & Recalculation

- All working variables have default values from `shared/constants.ts` with DB overrides
- **No hardcoded values** — every configurable value comes from the database with named-constant fallbacks
- Production database: fill-only seeding (never overwrite user-set values)

---

## Quality Standards

- Financial reports must be correct in both short (header/totals) and extended (all line items) forms
- PPTX and PDF exports must be investment committee presentation quality
- Balance sheet must balance within $1 at every entity level
- Proof system (`npm run verify:summary`) must remain UNQUALIFIED
- All tests must pass (`npm run test:summary`)
