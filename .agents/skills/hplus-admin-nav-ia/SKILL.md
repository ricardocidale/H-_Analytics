---
name: hplus-admin-nav-ia
description: >
  H+ Admin navigation information architecture — where Sources, Resources, APIs,
  benchmarks, market data, knowledge-related sections, and Constants belong in the
  admin UI. Load before any task that touches the Admin sidebar, AI Intelligence
  sidebar, adds a new admin section, or places data-source or API management
  anywhere in the admin UI.
---

# H+ Admin Navigation IA

Load this skill before adding any section to the Admin sidebar or AI Intelligence
sidebar, or planning where a feature lives. The distinctions below have been
clarified by the product owner and must not be relitigated.

---

## Two separate admin areas

| Area | URL | Sidebar file | Purpose |
|------|-----|-------------|---------|
| **Admin** | `/admin` | `AdminSidebar.tsx` | Operational management — users, scenarios, brand, financial defaults, sources, integrations |
| **AI Intelligence** | `/ai-intelligence` | `AiIntelligenceSidebar.tsx` | AI agent configuration — Specialist personas, Rebecca assistant, research orchestration |

The "AI" item in the Admin sidebar navigates from Admin → AI Intelligence.

---

## Orchestrator identity

The orchestrator's canonical **human name is Gustavo** (not Gaspar).
- `ORCHESTRATOR_HUMAN_NAME = "Gustavo"` in `lib/engine/src/analyst/registry/specialist-names.ts`
- `ORCHESTRATOR_SPECIALIST_ID = "gaspar"` — internal system ID / logKey only, never shown in UI
- `GASPAR_IDENTITY.humanName` resolves to `Gustavo` via `ORCHESTRATOR_HUMAN_NAME`
- Hardcoded fallback strings `|| "Gaspar"` in `AiIntelligenceSidebar.tsx` and elsewhere **must be updated to `|| "Gustavo"`** when encountered
- The sidebar reads the humanName dynamically from `/api/admin/specialists` — the static fallback is the only place Gaspar still leaks into UI

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
│   │                                       Each entry shows:
│   │                                         🟢/🔴 reachability status icon
│   │                                         "Last regenerated: X ago" timestamp
│   │                                         [Run Analyst] button to trigger regeneration
│   │
│   ├── Tables          — ALL structured/grid data:
│   │     • Benchmarks (Capital Raise ranges, Exit Multiples, Reference Brands)
│   │     • Market data (ADR index, labor rates, F&B, seasonal calendars)
│   │     • Country economic data (inflation, FX, GDP, interest rate per country)
│   │     • Tax constants (IRS rates, country tax authority data)
│   │     • Macro indicators (FRED, World Bank — GDP growth, CPI, interest rate)
│   │     • Depreciation schedules (MACRS, IRS asset class lives)
│   │     • Reporting conventions (GAAP / USALI standard references)
│   │     • Model financial defaults (numbers used in the financial engine)
│   │     • Any other reference / lookup table the app reads from
│   │     Each table row/group: status icon + last regenerated + Run Analyst button
│   │
│   ├── Market Research — synthesized research text, analysis, findings
│   │   │                 (vector chunks — more than grid data)
│   │   │                 status icon + last regenerated + Run Analyst button
│   │   └── Comparables — comparable properties/deals (sub-item of Market Research)
│   │                     status icon + last regenerated + Run Analyst button
│   │
│   ├── Links           — external URLs the app references or scrapes as research inputs
│   │                     status icon per link (reachable/unreachable) + last checked
│   └── Files           — documents uploaded by admin (PDFs, CSVs, reference docs)
│                         last uploaded timestamp
│
├── Resources                             ← top-level Admin sidebar section
│   └── APIs     — full API registry with live test button (see Rule 3)
│
└── AI ──────────────────────────────────── navigates to /ai-intelligence
    │
    └── AI Intelligence  (/ai-intelligence)
        │   [Proposed order — confirm with product owner before implementing]
        │
        ├── Rebecca AI Assistant          ← first: user-facing AI most admins configure
        │   ├── Configuration
        │   ├── Knowledge Base            ← ONLY home for KB (platform docs Rebecca reads)
        │   └── Conversations
        │
        ├── The Analyst → Gustavo         ← orchestrator (humanName = Gustavo)
        │   [logKey = "gaspar" — internal only, never shown in UI]
        │
        ├── Management Company
        │   ├── Funding Intelligence
        │   ├── Revenue Intelligence
        │   └── ICP Intelligence
        │
        ├── Property
        │   ├── Risk Intelligence
        │   └── Executive Summary
        │
        ├── Photos
        │   └── Photo Enhancer & Renders
        │
        ├── Portfolio Ops
        │   └── Portfolio Watchdog
        │
        ├── Resources Builder → Letícia
        │
        ├── Assumption Guidance           ← Analyst-generated calibration output
        │                                   (research run output — not a source)
        │
        └── System
            ├── System Health
            ├── Scheduled Research
            └── Vector Search Latency

NOTES:
- "Constants & Authority Sources" group is REMOVED from AI Intelligence entirely.
  The 4 Specialists' DATA (tax constants, macro indicators, depreciation schedules,
  reporting conventions) lives in Admin → Sources → Tables. Their [Run Analyst] buttons
  in Sources trigger the relevant Specialist directly — no separate AI Intelligence
  entry is needed.
- AI Intelligence menu order above is PROPOSED — product owner must confirm before build
```

---

## Sources UX requirements

Every item in `Admin → Sources` must display three affordances:

### 1. Status icon (green / red)
- **Green** (🟢): source is reachable AND last refresh completed without errors
- **Red** (🔴): source is unreachable OR last refresh returned an error OR never refreshed
- Icon is checked at page load; optionally can be polled on a short interval
- Hovering the icon shows a tooltip: "Last checked: X ago" + error detail on red

### 2. Last regenerated timestamp
- Shows when this specific source was last successfully refreshed by the Analyst
- Format: relative time ("2 days ago") with ISO datetime on hover
- If never regenerated: "Never regenerated" in muted text

### 3. Run Analyst button
- Every source row or group of sources of the same kind has a **[Run Analyst]** button
- Clicking triggers the relevant Specialist (or the Analyst orchestrator) to regenerate that source
- During regeneration: button shows spinner + "Running…", icon shows amber/pending state
- On completion: status icon updates, last regenerated timestamp updates
- The button label should follow the analyst-research-buttons skill naming convention

Placement: status icon LEFT of the source label, timestamp and button RIGHT-aligned in the row.

---

## Hard rules

### Rule 1 — Sources belongs ONLY in the Admin sidebar

**Sources is an Admin sidebar top-level section. It does not appear anywhere inside `/ai-intelligence`.**

Never label any sub-item or page inside AI Intelligence as "Sources".

### Rule 2 — Tables under Sources holds ALL structured/grid data

`Admin → Sources → Tables` is the home for every structured data table the app uses,
including all data previously grouped under "Constants & Authority Sources":

- Benchmark tables: Capital Raise ranges, Exit Multiples ranges, Reference Brands
- Market data: ADR index, labor rates, F&B data, seasonal calendars
- Country economic data (inflation, FX rate, GDP growth, interest rate per country)
- **Tax constants** (IRS rates, country tax authority data) ← formerly Constants group
- **Macro indicators** (FRED, World Bank — GDP, CPI, interest) ← formerly Constants group
- **Depreciation schedules** (MACRS, IRS asset class lives) ← formerly Constants group
- **Reporting conventions** (GAAP / USALI standard references) ← formerly Constants group
- Model financial defaults (numbers used in the financial engine)
- Any other reference or lookup table

If it is structured grid/table data the app reads from → it belongs under **Sources → Tables**.

### Rule 2b — Non-table source content sits alongside Tables, not inside it

If a source type is more than row/column data (e.g. research text, synthesized findings),
it gets its own sub-item under Sources at the same level as Tables — not nested inside Tables.
Example: Market Research is vector text chunks and sits as `Sources → Market Research`.

### Rule 3 — Resources → APIs has a live test button

`Admin → Resources → APIs` is a testable API registry. Each entry shows:
- Name, full description, endpoint URL, auth key reference, rate limit
- Status badge (active / inactive / unreachable)
- **Test button** — fires a real request, shows response status + sample output in-page

### Rule 4 — One destination = one menu item (strict hierarchical tree)

**A hierarchical menu tree must never contain two items that navigate to the same destination.**
This is a hard UX rule with no exceptions.

If you find yourself placing the same label in two parts of the tree, the tree is wrong —
resolve it by picking one canonical home and removing all duplicates:

- Platform documentation Rebecca reads → `Rebecca AI Assistant → Knowledge Base` only
- External/authority data the app reads → `Sources → [appropriate sub-item]` only
- Analyst-generated output → `AI Intelligence → Assumption Guidance` only
- Specialist configuration → `AI Intelligence → [group] → [Specialist]` only

"Knowledge Registry" is **removed**. Never recreate it.

### Rule 5 — "Catalog" is not a label to use in AI Intelligence

The old "Resources → Catalog" tab in AI Intelligence (APIs / Sources / Benchmark Slugs / Models)
is deprecated and being reorganised. Do not add new things labelled "Catalog" in AI Intelligence.

### Rule 6 — Legacy redirect

`"sources" → "data-sources"` in `SECTION_REDIRECTS` inside `AdminSidebar.tsx` is a stale legacy
alias. When implementing the new Sources section, update this to point to the new canonical
Sources → Tables page.

### Rule 7 — Orchestrator is Gustavo, not Gaspar

In all user-facing strings: sidebar labels, page headers, tooltips, activity log display,
narration theater — the orchestrator's name is **Gustavo**.

"Gaspar" appears only as:
- Internal `logKey` in log channel prefixes: `[gaspar] dispatched Helena…`
- `ORCHESTRATOR_SPECIALIST_ID = "gaspar"` — DB/system identifier
- Stale hardcoded fallback strings `|| "Gaspar"` — must be replaced with `|| "Gustavo"`

Never write "Gaspar" in any user-facing string. Use `GASPAR_IDENTITY.humanName` or
`ORCHESTRATOR_HUMAN_NAME` (both resolve to "Gustavo") at every callsite.

### Rule 8 — "Constants & Authority Sources" is renamed "Model Constants" in AI Intelligence

The AI Intelligence sidebar group previously labelled "Constants & Authority Sources" must
be renamed to **"Model Constants"** (or similar that does not include "Sources" or "Constants"
as data labels — those belong in Admin → Sources → Tables).

The DATA these 4 Specialists produce lives in Admin → Sources → Tables.
Their CONFIGURATION (persona, prompts, LLM settings) stays in AI Intelligence under the
renamed group.

---

## Relevant files

- `artifacts/hospitality-business-portal/src/components/admin/AdminSidebar.tsx` — `AdminSection` union type, `SECTION_REDIRECTS`, nav groups
- `artifacts/hospitality-business-portal/src/pages/Admin.tsx` — renders component per `AdminSection`
- `artifacts/hospitality-business-portal/src/components/admin/resources/ResourcesAdminPage.tsx` — old Catalog page (4 tabs: APIs / Sources / Benchmark Slugs / Models) — being reorganised
- `artifacts/hospitality-business-portal/src/components/ai-intelligence/AiIntelligenceSidebar.tsx` — `AiIntelligenceSection` union type, `buildNavGroups()`, hardcoded `|| "Gaspar"` fallback to fix
- `artifacts/hospitality-business-portal/src/pages/AiIntelligence.tsx` — renders component per `AiIntelligenceSection`, `orchestratorMeta()` fallback to fix
- `artifacts/hospitality-business-portal/src/components/admin/intelligence/AnalystTables.tsx` — existing benchmark table Analyst UI (moves to Sources → Tables)
- `artifacts/api-server/src/routes/admin/intelligence-sources.ts` — existing source registry API routes
- `artifacts/api-server/src/seeds/source-registry.ts` — existing seed pattern for external API/source entries
- `lib/engine/src/analyst/identity.ts` — `GASPAR_IDENTITY`, `ORCHESTRATOR_SPECIALIST_ID = "gaspar"`, `ORCHESTRATOR_HUMAN_NAME`
- `lib/engine/src/analyst/registry/specialist-names.ts` — `ORCHESTRATOR_HUMAN_NAME = "Gustavo"`
- `docs/brainstorms/knowledge-registry-requirements.md` — Knowledge Registry feature spec (partially superseded)
- `docs/solutions/architecture-patterns/admin-sidebar-ia-sources-resources-2026-05-02.md` — compound knowledge doc
- `docs/solutions/architecture-patterns/no-duplicate-menu-items-hierarchical-nav-2026-05-02.md` — one-destination rule
- `docs/solutions/architecture-patterns/sources-ux-status-analyst-button-2026-05-02.md` — Sources UX requirements
