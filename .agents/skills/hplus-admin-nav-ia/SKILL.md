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
│   │
│   ├── Tables          — ALL structured/grid data, including:
│   │                     • Benchmarks (Capital Raise, Exit Multiples, Reference Brands)
│   │                     • Market data (ADR index, labor rates, F&B, seasonal calendars)
│   │                     • Country economic data (inflation, FX, GDP, interest rate)
│   │                     • Constants & financial defaults
│   │                     • Any other reference / lookup table the app reads from
│   │
│   ├── Market Research — research content that is MORE than grid data:
│   │                     synthesized research text, analysis, findings
│   │                     (stored as vector chunks in market-research namespace)
│   │                     [if purely tabular → move under Tables instead]
│   │
│   ├── Links           — external URLs the app references or scrapes as research inputs
│   └── Files           — documents uploaded by admin (PDFs, CSVs, reference docs)
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
        │   └── [remaining vector namespaces if any stay here:
        │         Knowledge Base, Comparables, Assumption Guidance —
        │         confirm whether these also move to Admin → Sources]
        │
        └── System
            ├── System Health
            ├── Scheduled Research
            └── Vector Search Latency

OPEN QUESTION: Knowledge Base, Comparables, and Assumption Guidance are the
same kind of content as Market Research (vector text chunks). If Market Research
belongs under Admin → Sources, these likely do too — which would make Knowledge
Registry in AI Intelligence empty. Confirm before implementing.
```

---

## Hard rules

### Rule 1 — Sources belongs ONLY in the Admin sidebar

**Sources is an Admin sidebar top-level section. It does not appear anywhere inside `/ai-intelligence`.**

Never label any sub-item or page inside AI Intelligence as "Sources".

### Rule 2 — Tables under Sources holds ALL structured/grid data

`Admin → Sources → Tables` is the home for every structured data table the app uses:

- Benchmark tables: Capital Raise ranges, Exit Multiples ranges, Reference Brands
- Market data: ADR index, labor rates, F&B data, seasonal calendars
- Country economic data (inflation, FX rate, GDP growth, interest rate per country)
- Constants and financial defaults (numbers used in the financial engine)
- Any other reference or lookup table

If it is a structured grid/table the app reads from → it belongs under **Sources → Tables**.

### Rule 2b — Non-table source content sits alongside Tables, not inside it

If a source type is more than row/column data (e.g. research text, synthesized findings,
documents), it gets its own sub-item under Sources at the same level as Tables — not nested
inside Tables. Example: Market Research is vector text chunks (synthesized research) and
therefore sits as `Sources → Market Research`, not `Sources → Tables → Market Research`.

### Rule 3 — Resources → APIs has a live test button

`Admin → Resources → APIs` is a testable API registry. Each entry shows:
- Name, full description, endpoint URL, auth key reference, rate limit
- Status badge (active / inactive / unreachable)
- **Test button** — fires a real request, shows response status + sample output in-page

### Rule 4 — Knowledge Registry scope is unresolved pending product decision

Market Research (vector text chunks) has been confirmed to belong under Admin → Sources,
not AI Intelligence. Knowledge Base, Comparables, and Assumption Guidance are the same
kind of content. Until confirmed otherwise, treat their placement as an open question:
they may move to Admin → Sources as well, which would leave Knowledge Registry in
AI Intelligence with nothing — or they may stay in AI Intelligence for AI-specific reasons.

Do NOT add new items to Knowledge Registry until this is resolved. Sub-items must NOT
be called "Sources".

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
