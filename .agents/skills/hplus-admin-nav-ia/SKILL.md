---
name: hplus-admin-nav-ia
description: >
  H+ Admin navigation information architecture — where Sources, Resources, APIs,
  benchmarks, market data, and knowledge-related sections belong in the admin UI.
  Load before any task that touches the Admin sidebar, adds a new admin section,
  or places data-source or API management anywhere in the admin UI.
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
| **AI Intelligence** | `/ai-intelligence` | `AiIntelligenceSidebar.tsx` | AI agent configuration — Specialist setup, Rebecca chat, vector knowledge assets, research orchestration |

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
│   │                                       ONLY place in the app labelled "Sources"
│   ├── Tables   — ALL structured data tables, including:
│   │              • Country economic data (inflation, FX, GDP, interest rate per country)
│   │              • Constants & financial defaults (numbers used in the financial engine)
│   │              • Benchmark tables (Capital Raise, Exit Multiples, Reference Brands)
│   │              • Market data (ADR index, labor rates, F&B, seasonal calendars)
│   │              • Any other reference / lookup table the app reads from
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
        ├── Knowledge Registry            ← AI Intelligence section
        │   └── [vector knowledge namespaces: text chunks the AI reads —
        │         Market Research, Knowledge Base, Comparables, Assumption Guidance]
        │
        └── System
            ├── System Health
            ├── Scheduled Research
            └── Vector Search Latency

NOTE: The old "Resources → Catalog / Market Data" group in AI Intelligence
is being reorganised. Market Data and all benchmark tables move to
Admin → Sources → Tables. "Catalog" as a label in AI Intelligence does not
have a clear meaning and should not be used.
```

---

## Hard rules

### Rule 1 — Sources belongs ONLY in the Admin sidebar

**Sources is an Admin sidebar top-level section. It does not appear anywhere inside `/ai-intelligence`.**

Never label any sub-item or page inside AI Intelligence as "Sources".

### Rule 2 — Tables under Sources holds ALL structured data

`Admin → Sources → Tables` is the home for every structured data table the app uses:

- Country economic data (inflation, FX rate, GDP growth, interest rate per country)
- Constants and financial defaults (numbers used in the financial engine)
- Benchmark tables: Capital Raise ranges, Exit Multiples ranges, Reference Brands
- Market data: ADR index, labor rates, F&B data, seasonal calendars
- Any other reference or lookup table

If it is a structured data table the app reads from → it belongs under **Sources → Tables**.

### Rule 3 — Resources → APIs has a live test button

`Admin → Resources → APIs` is a testable API registry. Each entry shows:
- Name, full description, endpoint URL, auth key reference, rate limit
- Status badge (active / inactive / unreachable)
- **Test button** — fires a real request, shows response status + sample output in-page

### Rule 4 — Knowledge Registry is for vector/text knowledge only

`AI Intelligence → Knowledge Registry` surfaces the AI's text-based knowledge namespaces:
vector chunk collections the AI reads when answering questions (Market Research, Knowledge Base,
Comparables, Assumption Guidance). These cannot be shown as a simple data grid — they are
text chunks with embeddings. Sub-items are NOT called "Sources".

### Rule 5 — "Catalog" is not a label to use in AI Intelligence

The old "Resources → Catalog" tab in AI Intelligence (APIs / Sources / Benchmark Slugs / Models)
is being deprecated and reorganised. Do not add new things labelled "Catalog" in AI Intelligence.

### Rule 6 — Legacy redirect

`"sources" → "data-sources"` in `SECTION_REDIRECTS` inside `AdminSidebar.tsx` is a stale legacy
alias. When implementing the new Sources section, update this to point to the new canonical
Sources → Tables page.

---

## Relevant files

- `artifacts/hospitality-business-portal/src/components/admin/AdminSidebar.tsx` — `AdminSection` union type, `SECTION_REDIRECTS`, nav groups
- `artifacts/hospitality-business-portal/src/pages/Admin.tsx` — renders component per `AdminSection`
- `artifacts/hospitality-business-portal/src/components/admin/resources/ResourcesAdminPage.tsx` — old Catalog page (4 tabs: APIs / Sources / Benchmark Slugs / Models) — being reorganised
- `artifacts/hospitality-business-portal/src/components/ai-intelligence/AiIntelligenceSidebar.tsx` — `AiIntelligenceSection` union type
- `artifacts/hospitality-business-portal/src/pages/AiIntelligence.tsx` — renders component per `AiIntelligenceSection`
- `artifacts/hospitality-business-portal/src/components/admin/intelligence/AnalystTables.tsx` — existing benchmark table Analyst UI (moves to Sources → Tables)
- `artifacts/api-server/src/routes/admin/intelligence-sources.ts` — existing source registry API routes
- `artifacts/api-server/src/seeds/source-registry.ts` — existing seed pattern for external API/source entries
- `docs/brainstorms/knowledge-registry-requirements.md` — Knowledge Registry feature spec
- `docs/solutions/architecture-patterns/admin-sidebar-ia-sources-resources-2026-05-02.md` — compound knowledge doc
