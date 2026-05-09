---
name: hplus-admin-nav-ia
description: >
  H+ Admin navigation information architecture — where Sources, Resources, APIs,
  benchmarks, market data, knowledge-related sections, Constants, Specialists,
  LLMs, and AI Agents belong in the admin UI. Load before any task that touches
  the Admin sidebar, Intelligence sidebar, adds a new admin section, or places
  data-source, API, Specialist, or LLM management anywhere in the admin UI.
---

# H+ Admin Navigation IA

Load this skill before adding any section to the Admin sidebar or Intelligence
sidebar, or planning where a feature lives. The distinctions below have been
clarified by the product owner and must not be relitigated.

---

## Two separate admin areas

| Area | URL | Sidebar file | Purpose |
|------|-----|-------------|---------|
| **Admin** | `/admin` | `AdminSidebar.tsx` | Operational management — users, scenarios, brand, financial defaults, sources, integrations |
| **Intelligence** | `/intelligence` | `IntelligenceSidebar.tsx` | AI agent configuration — Specialists directory, Rebecca assistant, Gustavo orchestrator, LLMs, research tooling |

The "AI" item in the Admin sidebar navigates from Admin → Intelligence.

---

## Orchestrator identity

The orchestrator's canonical **human name is Gustavo**.
- `ORCHESTRATOR_HUMAN_NAME = "Gustavo"` in `lib/engine/src/analyst/registry/specialist-names.ts`
- `ORCHESTRATOR_SPECIALIST_ID = "gaspar"` — internal system ID / logKey only, never shown in UI
- `ORCHESTRATOR_IDENTITY.humanName` resolves to `Gustavo` via `ORCHESTRATOR_HUMAN_NAME`
- Hardcoded fallback strings must use `|| "Gustavo"` (the canonical human name)
- The sidebar reads the humanName dynamically from `/api/admin/specialists` — the static fallback must always be "Gustavo"

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
└── AI ──────────────────────────────────── navigates to /intelligence
    │
    └── Intelligence  (/intelligence)
        │
        ├── AI Agents                     ← section grouping the two AI agents
        │   │
        │   ├── Rebecca                   ← conversational AI assistant
        │   │   ├── Configuration
        │   │   ├── Knowledge Base        ← ONLY home for KB (platform docs Rebecca reads)
        │   │   └── Conversations
        │   │
        │   └── Gustavo                   ← Analyst orchestrator — informational page only
        │       • Explains Gustavo's role as Analyst Orchestrator
        │       • 🟢/🔴 status icon: is Gustavo deployed and working?
        │       • Last health check: timestamp from internal activity log
        │       • READ-ONLY: no interactive controls whatsoever for admin
        │       • Styled like a specialist detail panel but with no actions
        │
        ├── Specialists                   ← single accordion-table page
        │   │   All research specialists listed by human name + function
        │   │   Collapsible accordion rows — one row per specialist
        │   │   Each collapsed row shows: name, function/domain, status icon
        │   │   Each expanded row shows (ALL READ-ONLY, admin cannot interact):
        │   │     • LLMs used — display labels only
        │   │       (to manage LLMs → go to LLMs section below)
        │   │     • Sources used — display labels only
        │   │       (to manage sources → go to Admin → Sources)
        │   │     • APIs used — display labels only
        │   │     • Last called: timestamp from internal activity log
        │   │     • [Run Analyst] button — health-checks this specialist:
        │   │         verifies it is deployed and responding
        │   │         records result + timestamp in internal activity log
        │   │
        │   NOTE: replaces ALL old individual Specialist group menu items.
        │   Management Company, Property, Photos, Portfolio Ops, and
        │   Resources Builder (Letícia) no longer appear as separate sidebar
        │   items — every Specialist lives in this accordion.
        │
        ├── LLMs                          ← the ONLY place to manage LLM configuration
        │                                   Model names, endpoints, API key references,
        │                                   rate limits, fallback chain
        │                                   (LLMs shown in Specialists panel link here
        │                                   conceptually but admin cannot click from there)
        │
        ├── Assumption Guidance           ← Analyst-generated calibration output
        │                                   (research run output — not a source)
        │
        ├── Knowledge Registry            ← registry of knowledge sources and documents
        │   ├── Knowledge Registry        ← top-level knowledge source registry
        │   └── Country Economic Data     ← inflation, FX rates, GDP, interest rate per country
        │
        └── System
            ├── System Health
            ├── Scheduled Research
            └── Vector Search Latency

NOTES:
- "Constants & Authority Sources" group is REMOVED from Intelligence entirely.
  Its DATA (tax constants, macro indicators, depreciation, reporting conventions)
  lives in Admin → Sources → Tables. The [Run Analyst] buttons there trigger the
  relevant Specialist directly.
- The old individual Specialist group menu items (Management Company, Property,
  Photos, Portfolio Ops) are REPLACED by the single "Specialists" accordion page.
- Rebecca moved from a standalone "Rebecca AI Assistant" item into "AI Agents" group.
- Gustavo moved from a standalone "The Analyst" item into "AI Agents" group as an
  informational-only page.
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

## Internal activity log (cross-cutting requirement)

A system-wide activity log must record all verification and regeneration events across the
admin UI. This log is the single source of truth for "last called" / "last verified" timestamps
shown throughout Sources, Specialists, Gustavo's panel, and System Health.

**Events that write to the log:**
- Specialist health check triggered from the Specialists accordion [Run Analyst] button
- Source regeneration triggered from any [Run Analyst] button in Sources → Tables / Market Research / Comparables
- Gustavo orchestrator health check
- Scheduled research run completions (System → Scheduled Research)
- Any other Analyst verification process in the admin UI

**Log entry shape (minimum):**
```
{
  timestamp: ISO datetime,
  actor: "admin" | "scheduler" | "system",
  target_type: "specialist" | "source" | "orchestrator" | "scheduled_run",
  target_id: string,       // specialist ID, source slug, "gaspar", etc.
  action: "health_check" | "regenerate" | "verify",
  result: "success" | "error" | "timeout",
  detail: string           // error message or summary
}
```

**Where timestamps surface:**
- Specialists page → expanded row → "Last called: X ago"
- Sources → Tables / Market Research → "Last regenerated: X ago"
- Gustavo's AI Agents page → "Last health check: X ago"
- System → System Health → per-component status

The log is append-only. Retention policy TBD.

---

## Specialists page UX requirements

The Specialists accordion page (`Intelligence → Specialists`) shows all research
Specialists in a single scrollable list. Rules:

### Read-only display for all resource references
- LLMs, Sources, and APIs shown in an expanded specialist row are **display-only labels**
- No links, no click-throughs, no edit controls from the Specialists page
- To manage LLMs: navigate to `Intelligence → LLMs`
- To manage Sources: navigate to `Admin → Sources`
- Admin cannot configure or invoke resources from the Specialists page

### Analyst button scope
- The [Run Analyst] button in each expanded specialist row performs a **health check only**:
  verifies the specialist is deployed and responding
- It does NOT regenerate source data (that lives in Admin → Sources)
- It does NOT modify LLM settings (that lives in Intelligence → LLMs)
- Result is written to the internal activity log and shown as "Last called: X ago"

### Gustavo is NOT in the Specialists accordion
- Gustavo (orchestrator) has his own dedicated page under AI Agents → Gustavo
- Rebecca (conversational assistant) is NOT a research specialist and is NOT in this list
- Only research Specialists appear in the accordion

---

## Gustavo's page UX requirements

`Intelligence → AI Agents → Gustavo` is a read-only informational page. Rules:

- Describes Gustavo's role as Analyst Orchestrator (how he dispatches and coordinates Specialists)
- Shows a 🟢/🔴 status icon: is the orchestrator deployed and healthy?
- Shows "Last health check: X ago" from the internal activity log
- **No interactive controls whatsoever** — no buttons, no forms, no edit fields
- Styled similarly to a Specialist expanded detail panel but with zero actions
- Admin can READ this page; they cannot DO anything from it

---

## Hard rules

### Rule 1 — Sources belongs ONLY in the Admin sidebar

**Sources is an Admin sidebar top-level section. It does not appear anywhere inside `/intelligence`.**

Never label any sub-item or page inside Intelligence as "Sources".

### Rule 2 — Tables under Sources holds ALL structured/grid data

`Admin → Sources → Tables` is the home for every structured data table the app uses:

- Benchmark tables: Capital Raise ranges, Exit Multiples ranges, Reference Brands
- Market data: ADR index, labor rates, F&B data, seasonal calendars
- Country economic data (inflation, FX rate, GDP growth, interest rate per country)
- Tax constants, Macro indicators, Depreciation schedules, Reporting conventions
- Model financial defaults (numbers used in the financial engine)
- Any other reference or lookup table

If it is structured grid/table data the app reads from → it belongs under **Sources → Tables**.

### Rule 2b — Non-table source content sits alongside Tables, not inside it

If a source type is more than row/column data (e.g. research text, synthesized findings),
it gets its own sub-item under Sources at the same level as Tables — not nested inside Tables.

### Rule 3 — Resources → APIs has a live test button

`Admin → Resources → APIs` is a testable API registry. Each entry shows:
- Name, full description, endpoint URL, auth key reference, rate limit
- Status badge (active / inactive / unreachable)
- **Test button** — fires a real request, shows response status + sample output in-page

### Rule 4 — One destination = one menu item (strict hierarchical tree)

**A hierarchical menu tree must never contain two items that navigate to the same destination.**

- Platform documentation Rebecca reads → `AI Agents → Rebecca → Knowledge Base` only
- External/authority data the app reads → `Sources → [appropriate sub-item]` only
- Analyst-generated output → `Intelligence → Assumption Guidance` only
- Specialist read-only directory → `Intelligence → Specialists` only
- LLM management → `Intelligence → LLMs` only
- Orchestrator info → `Intelligence → AI Agents → Gustavo` only
- Knowledge source registry → `Intelligence → Knowledge Registry` only
- Country economic data registry → `Intelligence → Knowledge Registry → Country Economic Data` only

### Rule 5 — "Catalog" is not a label to use in Intelligence

The old "Resources → Catalog" tab in Intelligence (APIs / Sources / Benchmark Slugs / Models)
is deprecated and being reorganised. Do not add new things labelled "Catalog" in Intelligence.

### Rule 6 — Legacy redirect

`"sources" → "data-sources"` in `SECTION_REDIRECTS` inside `AdminSidebar.tsx` is a stale legacy
alias. When implementing the new Sources section, update this to point to the canonical
Sources → Tables page.

### Rule 7 — Orchestrator persona name is Gustavo

In all user-facing strings: sidebar labels, page headers, tooltips, activity log display,
narration theater — the orchestrator's name is **Gustavo**.

`"gaspar"` (lowercase) appears only as:
- Internal `logKey` in log channel prefixes: `[gustavo] dispatched Helena…`
- `ORCHESTRATOR_SPECIALIST_ID = "gaspar"` — DB/system identifier (stored key, not the persona name)
- Stale hardcoded fallback strings `|| "Gustavo"` — always use the human name

Never write the internal id `"gaspar"` in any user-facing string. Use `ORCHESTRATOR_IDENTITY.humanName` or
`ORCHESTRATOR_HUMAN_NAME` (both resolve to "Gustavo") at every callsite.

### Rule 8 — "Constants & Authority Sources" is fully removed from Intelligence

This group is gone entirely. Its DATA lives in Admin → Sources → Tables. The 4 Specialists
who produced that data are now listed in the Specialists accordion page like all other
Specialists. No separate group or menu item for them in Intelligence.

### Rule 9 — Specialists page replaces all individual Specialist group menu items

The old per-domain group items (Management Company, Property, Photos, Portfolio Ops) no longer
exist as sidebar navigation entries. All research Specialists are accessed through the single
`Intelligence → Specialists` accordion page.

### Rule 10 — Specialists page is strictly read-only for resource references

LLMs, Sources, and APIs displayed within an expanded Specialist row are display labels only.
Admins cannot click, configure, or invoke them from the Specialists page.
- To manage LLMs → `Intelligence → LLMs`
- To manage Sources → `Admin → Sources`

### Rule 11 — Gustavo's page has no interactive controls

`AI Agents → Gustavo` is informational only. No buttons (except status display), no forms,
no edit fields. The only "action" is the automatic status check that fires on page load.

### Rule 12 — LLMs is the only place in Intelligence to manage LLM configuration

LLM model names, endpoints, API key references, rate limits, and fallback chains are managed
exclusively in `Intelligence → LLMs`. Never add LLM configuration controls to the
Specialists page, Gustavo's page, or anywhere else in Intelligence.

### Rule 13 — LLMs page uses workflow cards (accordion), not an LLM registry

The LLMs page uses a **slot-based accordion** — vendor/model selections are organized by functional area and per-slot overrides, not by workflow card. See the current design: `docs/solutions/architecture-patterns/llms-page-slot-accordion-design-2026-05-09.md`

Key sections: Vendor Health panel (post-probe status tiles), Function-Area Defaults (Research/Operations/Assistants/Exports), N+1 Orchestrator Defaults, Slot Accordion (per-slot vendor+model overrides, batch Save), Specialists (override status + deep-link to Config tab).
- Prompt display (literal text or construction description; may be multiple prompts)
- Specialists involved (⚠ warning flag if none assigned)
- Status icon + last updated timestamp
- Dirty-state guard: leaving unsaved card triggers Save / Discard / Keep editing dialog

---

## Relevant files

- `artifacts/hospitality-business-portal/src/components/admin/AdminSidebar.tsx` — `AdminSection` union type, `SECTION_REDIRECTS`, nav groups
- `artifacts/hospitality-business-portal/src/pages/Admin.tsx` — renders component per `AdminSection`
- `artifacts/hospitality-business-portal/src/components/admin/resources/ResourcesAdminPage.tsx` — old Catalog page (4 tabs: APIs / Sources / Benchmark Slugs / Models) — being reorganised
- `artifacts/hospitality-business-portal/src/components/intelligence/IntelligenceSidebar.tsx` — `IntelligenceSection` union type, `buildNavGroups()`, hardcoded fallback must be `|| "Gustavo"`
- `artifacts/hospitality-business-portal/src/pages/Intelligence.tsx` — renders component per `IntelligenceSection`, `orchestratorMeta()` fallback to fix
- `artifacts/hospitality-business-portal/src/components/admin/intelligence/AnalystTables.tsx` — existing benchmark table Analyst UI (moves to Sources → Tables)
- `artifacts/api-server/src/routes/admin/intelligence-sources.ts` — existing source registry API routes
- `artifacts/api-server/src/seeds/source-registry.ts` — existing seed pattern for external API/source entries
- `lib/engine/src/analyst/identity.ts` — `GASPAR_IDENTITY`, `ORCHESTRATOR_SPECIALIST_ID = "gaspar"`, `ORCHESTRATOR_HUMAN_NAME`
- `lib/engine/src/analyst/registry/specialist-names.ts` — `ORCHESTRATOR_HUMAN_NAME = "Gustavo"`
- `docs/brainstorms/knowledge-registry-requirements.md` — Knowledge Registry feature spec (partially superseded)
- `docs/solutions/architecture-patterns/admin-sidebar-ia-sources-resources-2026-05-02.md` — compound knowledge doc
- `docs/solutions/architecture-patterns/no-duplicate-menu-items-hierarchical-nav-2026-05-02.md` — one-destination rule
- `docs/solutions/architecture-patterns/sources-ux-status-analyst-button-2026-05-02.md` — Sources UX requirements
- `docs/solutions/architecture-patterns/llms-page-slot-accordion-design-2026-05-09.md` — LLMs page architecture: slot-based accordion with vendor health, function-area defaults, N+1 orchestrator defaults, and per-slot overrides
- `docs/solutions/architecture-patterns/intelligence-specialists-page-2026-05-02.md` — Specialists accordion page spec
