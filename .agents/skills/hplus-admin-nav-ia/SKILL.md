---
name: hplus-admin-nav-ia
description: >
  H+ Admin navigation information architecture — where Sources, Resources, APIs,
  and knowledge-related sections belong in the admin UI. Load before any task
  that touches the Admin sidebar, adds a new admin section, or places data-source
  or API management anywhere in the admin UI.
---

# H+ Admin Navigation IA

Load this skill before adding any section to the Admin sidebar or planning where
a feature lives in the admin UI. The distinctions below have been clarified by
the product owner and must not be relitigated.

---

## Two separate admin areas

| Area | URL | Sidebar file | Purpose |
|------|-----|-------------|---------|
| **Admin** | `/admin` | `AdminSidebar.tsx` | Operational management — users, scenarios, brand, financial defaults, sources, integrations |
| **AI Intelligence** | `/ai-intelligence` | `AiIntelligenceSidebar.tsx` | AI agent configuration — Specialist setup, Rebecca chat, knowledge assets, research orchestration |

The "AI" item in the Admin sidebar navigates from Admin → AI Intelligence.

---

## Canonical full navigation tree

```
Admin  (/admin)
│
├── [existing operational sections]
│   (users, activity, scenarios, brand, Steady State / model defaults, etc.)
│
├── Sources                               ← top-level Admin sidebar section
│   ├── Tables   — ALL structured data tables used by the app:
│   │              country economic data, constants/defaults tables,
│   │              benchmark tables, reference lookup tables, market data
│   ├── Links    — external URLs the app references or scrapes as research inputs
│   └── Files    — documents uploaded by admin (PDFs, CSVs, reference docs)
│
├── Resources                             ← top-level Admin sidebar section
│   └── APIs     — full API registry with live test button (see below)
│
└── AI ──────────────────────────────────── navigates to /ai-intelligence
    │
    └── AI Intelligence  (/ai-intelligence)
        │
        ├── The Analyst → Gaspar (Orchestrator)
        ├── Management Company → [Specialists]
        ├── Property → [Specialists]
        ├── Photos → [Specialists]
        ├── Portfolio Ops → [Specialists]
        ├── Constants & Authority Sources → [Specialists]
        ├── Resources Builder → [Letícia]
        │
        ├── Rebecca AI Assistant
        │   ├── Configuration
        │   ├── Knowledge Base
        │   └── Conversations
        │
        ├── Knowledge Registry            ← AI Intelligence section (scope TBD)
        │   └── [sub-items TBD — NOT called "Sources"]
        │
        └── Resources (existing)
            ├── Catalog      — slug/wire-up registry (APIs, Sources, Benchmark Slugs, Models tabs)
            └── Market Data  — AnalystTables: Capital Raise, Exit Multiples, Reference Brands
```

---

## Hard rules

### Rule 1 — Sources belongs ONLY in the Admin sidebar

**Sources is an Admin sidebar top-level section. It does not appear anywhere inside `/ai-intelligence`.**

Any sub-item or page labelled "Sources" inside the AI Intelligence area is wrong. Do not create one.

### Rule 2 — Tables under Sources holds ALL structured data

`Admin → Sources → Tables` is the home for every structured data table the app uses in its work and research:

- Country economic data (inflation, FX rate, GDP growth, interest rate per country)
- Constants and defaults tables (the numbers used in financial calculations)
- Benchmark tables (Capital Raise ranges, Exit Multiples ranges, Reference Brands)
- Reference and lookup tables of any kind

If it is a structured data table that the app reads from, it belongs under **Sources → Tables**.

### Rule 3 — Resources → APIs has a live test button

`Admin → Resources → APIs` is a testable API registry. Each entry shows:
- Name, full description, endpoint URL, auth key reference, rate limit
- Status badge (active / inactive / unreachable)
- **Test button** — fires a real request, shows response status + sample output in-page

### Rule 4 — Knowledge Registry naming

The AI Intelligence section may have a "Knowledge Registry" area for AI-synthesised knowledge assets (vector namespaces, AI research outputs). Its sub-items must **not** be called "Sources" — that name is reserved for the Admin sidebar section. Use "Knowledge Assets", "AI Knowledge", or another distinct label.

### Rule 5 — Legacy redirect

`"sources" → "data-sources"` in `SECTION_REDIRECTS` inside `AdminSidebar.tsx` is a stale legacy alias. When implementing the new Sources section, update this redirect to point to the new canonical Sources page (`"sources-tables"` or whichever section value is chosen).

---

## Relevant files

- `artifacts/hospitality-business-portal/src/components/admin/AdminSidebar.tsx` — Admin sidebar nav groups, `AdminSection` union type, `SECTION_REDIRECTS`
- `artifacts/hospitality-business-portal/src/pages/Admin.tsx` — renders the component for each `AdminSection`
- `artifacts/hospitality-business-portal/src/components/ai-intelligence/AiIntelligenceSidebar.tsx` — AI Intelligence sidebar, `AiIntelligenceSection` union type
- `artifacts/hospitality-business-portal/src/pages/AiIntelligence.tsx` — renders the component for each `AiIntelligenceSection`
- `artifacts/api-server/src/routes/admin/intelligence-sources.ts` — existing source registry API routes
- `artifacts/api-server/src/seeds/source-registry.ts` — existing seed pattern for external API/source entries
- `docs/brainstorms/knowledge-registry-requirements.md` — Knowledge Registry feature spec (AI Intelligence area)
- `docs/solutions/architecture-patterns/admin-sidebar-ia-sources-resources-2026-05-02.md` — compound knowledge doc
