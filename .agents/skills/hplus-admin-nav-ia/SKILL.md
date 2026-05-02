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

The app has two distinct admin surfaces. They look similar but serve different audiences and have different sidebars:

| Area | URL | Sidebar file | Purpose |
|------|-----|-------------|---------|
| **Admin** | `/admin` | `AdminSidebar.tsx` | Operational management — users, scenarios, brand, financial defaults, data sources, integrations |
| **AI Intelligence** | `/ai-intelligence` | `AiIntelligenceSidebar.tsx` | AI agent configuration — Specialist setup, Rebecca chat, knowledge assets, research orchestration |

The "AI" item in the Admin sidebar navigates from Admin → AI Intelligence.

---

## Admin sidebar: canonical section structure

```
Admin  (/admin)
│
├── [operational sections — users, scenarios, brand, financial defaults, etc.]
│
├── Sources                          ← top-level Admin sidebar section
│   ├── Tables      — structured data tables the app uses (benchmark, reference, lookup)
│   ├── Links       — external URLs referenced or scraped as research inputs
│   └── Files       — documents uploaded by admin (PDFs, CSVs, reference docs)
│
├── Resources                        ← top-level Admin sidebar section
│   └── APIs        — full API registry with live test button (see below)
│
└── AI  ──────────────────────────── navigates to /ai-intelligence
```

### Sources section (Admin sidebar)

Every type of input the app uses in its work and research, organised by kind:

- **Tables** — structured data tables (benchmark ranges, reference tables, lookup data)
- **Links** — external URLs the app references in research
- **Files** — admin-uploaded documents used as knowledge source material

Content is read-only for browsing. Admins can upload files and add links. Regeneration of AI-derived content is done via Analyst buttons, never by hand-editing values.

### Resources → APIs page (Admin sidebar)

A purpose-built testable API registry. Each API entry shows:

- Name and full description of what the API does and what the app uses it for
- Endpoint URL
- Auth method and environment variable key reference
- Rate limit
- Current status badge (active / inactive / unreachable)
- **Test button** — fires a real request and shows the response status + sample output in-page

This is an operational tool for admins to verify integrations are healthy, not just a list.

---

## AI Intelligence sidebar: canonical section structure

```
AI Intelligence  (/ai-intelligence)
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
├── Knowledge Registry               ← AI Intelligence section (not Admin)
│   ├── Sources   — all 7 AI knowledge assets (vector namespaces + benchmark tables + country data)
│   └── Country Data — dedicated country economic data grid
│
└── Resources
    ├── Catalog      — slug/wire-up registry (APIs, Sources, Benchmark Slugs, Models tabs)
    └── Market Data  — AnalystTables: Capital Raise, Exit Multiples, Reference Brands
```

The Knowledge Registry is **AI Intelligence only** — it surfaces AI knowledge assets
(vector chunks, benchmark ranges, country economic data) with Analyst regeneration buttons.
It is not the same as the Admin Sources section.

---

## Hard rules

1. **Sources in Admin sidebar** — any feature categorised as "source material the app draws from" (tables, links, uploaded files) belongs under Admin → Sources, not inside AI Intelligence.

2. **APIs in Admin → Resources** — the external API registry with live test capability belongs under Admin → Resources → APIs.

3. **Knowledge Registry in AI Intelligence** — the Analyst-managed knowledge assets (vector namespaces, benchmark tables, country economic data) belong under AI Intelligence → Knowledge Registry.

4. **Do not collapse these** — Sources (Admin) and Knowledge Registry (AI Intelligence) are intentionally separate. One is about raw input material; the other is about AI-synthesised knowledge assets.

5. **Legacy redirect** — `"sources" → "data-sources"` in `SECTION_REDIRECTS` inside `AdminSidebar.tsx` is a stale legacy alias. When implementing the new Sources section, update this redirect to point to the new canonical Sources page.

---

## Relevant files

- `artifacts/hospitality-business-portal/src/components/admin/AdminSidebar.tsx` — Admin sidebar nav groups, `AdminSection` union type, `SECTION_REDIRECTS`
- `artifacts/hospitality-business-portal/src/pages/Admin.tsx` — renders the component for each `AdminSection`
- `artifacts/hospitality-business-portal/src/components/ai-intelligence/AiIntelligenceSidebar.tsx` — AI Intelligence sidebar, `AiIntelligenceSection` union type
- `artifacts/hospitality-business-portal/src/pages/AiIntelligence.tsx` — renders the component for each `AiIntelligenceSection`
- `artifacts/api-server/src/routes/admin/intelligence-sources.ts` — existing source registry API routes
- `artifacts/api-server/src/seeds/source-registry.ts` — existing seed pattern for external API/source entries
- `docs/brainstorms/knowledge-registry-requirements.md` — full Knowledge Registry feature spec (AI Intelligence area)
- `docs/solutions/architecture-patterns/admin-sidebar-ia-sources-resources-2026-05-02.md` — compound knowledge doc
