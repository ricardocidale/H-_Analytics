# Knowledge Registry — Requirements

**Status:** Ready for implementation
**Date:** 2026-05-02
**Source:** ce-brainstorm session + architect analysis + product owner clarification

---

## 1. Problem Statement

Every AI knowledge asset in H+ Analytics — vector namespaces, benchmark tables, country economic data — lives in a different system with no unified place to see it, understand it, or regenerate it. Admins cannot answer basic questions like "what does the AI actually know about comparables?" or "when was the country inflation data last updated?" without digging into code or the database directly.

The Knowledge Registry gives every AI knowledge asset a human-readable home in the **AI Intelligence** admin area: a single section where each asset is visible as a purpose-built table, explained in plain language, and regenerable via the canonical Analyst button. Nothing is editable by hand — the Analyst is the only update path.

> **Important navigation note:** The Knowledge Registry is an AI Intelligence section (`/ai-intelligence`), not the Admin sidebar. "Sources" and "Resources" as Admin sidebar top-level sections are separate features — see §10 below and the skill at `.agents/skills/hplus-admin-nav-ia/SKILL.md`.

---

## 2. Scope

All 7 knowledge assets are in scope from the start:

| # | Asset | Backing System | Content Type |
|---|-------|---------------|--------------|
| 1 | Market Research | `vector_chunks` — `market-research` namespace | Text chunks (cards) |
| 2 | Knowledge Base | `vector_chunks` — `knowledge-base` namespace | Text chunks (cards) |
| 3 | Comparables | `vector_chunks` — `comparables` namespace | Text chunks (cards) |
| 4 | Assumption Guidance | `vector_chunks` — `assumption-guidance` namespace | Text chunks (cards) |
| 5 | Benchmark: Capital Raise | `analyst_table_ranges` — `capital_raise` | Numeric ranges grid |
| 6 | Benchmark: Exit Multiples | `analyst_table_ranges` — `exit_multiples` | Numeric ranges grid |
| 7 | Benchmark: Reference Brands | `analyst_table_ranges` — `reference_brands` | Card grid |
| 8 | Country Economic Data | Structured table (new) | Country × metric grid |

The `research-history`, `documents`, `scenarios`, and `properties` namespaces are excluded — they are operational/transactional data, not knowledge assets managed by the Analyst.

---

## 3. Navigation

The Knowledge Registry lives inside the existing **AI Intelligence** section (`/ai-intelligence`), accessible via the "AI" item in the main Admin sidebar.

A new **"Knowledge Registry"** group is added to `AiIntelligenceSidebar.tsx` with two entries:

```
AI Intelligence (/ai-intelligence)
│
└── Knowledge Registry               ← NEW group
    ├── Sources     — overview of all 8 assets, one collapsible panel each
    └── Country Data — dedicated full-screen grid for country economic data
```

`AiIntelligenceSection` type adds: `"knowledge-registry"` and `"knowledge-registry-country-data"`.

---

## 4. The `knowledge_registry` Control-Plane Table

A new database table `knowledge_registry` acts as the metadata backbone for all 8 assets. It is seeded from code (like `source-registry.ts`) and never edited by hand or by the admin UI.

### Schema

```sql
knowledge_registry (
  id                  text PRIMARY KEY,          -- e.g. "market-research", "capital-raise"
  display_name        text NOT NULL,             -- "Market Research"
  description         text NOT NULL,             -- plain-language "what this contains"
  how_built           text NOT NULL,             -- "how the Analyst builds/rebuilds it"
  source_description  text NOT NULL,             -- "what sources the Analyst draws from"
  renewal_mechanism   text NOT NULL,             -- "On-demand via Analyst button"
  asset_type          text NOT NULL,             -- "vector_namespace" | "benchmark_table" | "benchmark_brands" | "country_data"
  asset_ref           text NOT NULL,             -- namespace slug or table id
  last_refreshed_at   timestamptz,               -- updated on every successful Analyst run
  created_at          timestamptz DEFAULT now()
)
```

Seeds are defined in `artifacts/api-server/src/seeds/knowledge-registry.ts` and run at server startup (same pattern as `source-registry.ts`). Seeds are idempotent — they upsert on `id`.

---

## 5. Sources Overview Page

**Route/section:** `knowledge-registry`

### 5.1 Layout

- Page header: "Knowledge Registry" + subtitle "Every AI knowledge asset — what it contains, when it was last built, and how to regenerate it."
- One **asset panel** per registered asset, rendered as a collapsible card.
- Default state: all panels collapsed, showing only the summary row.
- Expanded state: shows the content viewer + metadata footer.

### 5.2 Asset Panel — Summary Row (always visible)

| Field | Source |
|-------|--------|
| Asset name | `knowledge_registry.display_name` |
| Freshness badge | `fresh` / `stale` / `missing` — derived from `last_refreshed_at` vs cadence |
| Chunk / row count | Live query against backing store |
| Last refreshed | `last_refreshed_at` (human-relative: "3 days ago") |
| Analyst button | Opens the full-screen Analyst theater (same affordance as AnalystTables) |

### 5.3 Asset Panel — Expanded Content Viewer

Content viewer is **type-specific**, selected by `asset_type`:

**`vector_namespace`** — Text Chunk Cards
A paginated list of the most-recently-upserted chunks from the namespace. Each card shows: chunk text (truncated to ~200 chars), metadata tags (source, date if present). Pagination: 20 per page. Read-only.

**`benchmark_table`** — Ranges Grid
Reuses the existing `AnalystTables` range display: a compact table with columns Low / Mid / High, one row per dimension. Read-only (no inline edit).

**`benchmark_brands`** — Card Grid
Reuses the existing `ReferenceBrandsGrid` component. Read-only card grid of reference hotel brands with their key attributes.

**`country_data`** — Link out to dedicated Country Data sub-page (see §6).

### 5.4 Asset Panel — Metadata Footer

Shown below the content viewer, always visible when expanded:

- **Description:** `knowledge_registry.description`
- **How it's built:** `knowledge_registry.how_built`
- **Sources:** `knowledge_registry.source_description`
- **Renewal:** `knowledge_registry.renewal_mechanism`

### 5.5 Analyst Button Behavior

Clicking the Analyst button on any asset panel opens `AnalystRefreshTheater` (the same full-screen streaming component used by AnalystTables). The theater calls a new unified endpoint:

```
POST /api/admin/knowledge-registry/:id/regenerate
```

On success:
- `knowledge_registry.last_refreshed_at` is updated.
- The backing store (vector namespace or benchmark table or country data table) is updated with the new data.
- Vector namespaces: replace on upsert (no manual commit step).
- Benchmark tables: keep the existing diff/commit/discard flow.
- The asset panel refreshes its chunk count and freshness badge.

**No background auto-refresh.** The Analyst button is the only update path.

---

## 6. Country Economic Data Sub-Page

**Route/section:** `knowledge-registry-country-data`

### 6.1 Purpose

Admins need to see the actual numbers used in financial calculations (inflation rate, FX rate, GDP growth, interest rate) for each country in the system.

### 6.2 Data Model

```sql
country_economic_data (
  id               serial PRIMARY KEY,
  country_code     text NOT NULL,       -- ISO 3166-1 alpha-2, e.g. "US", "MX", "CO"
  country_name     text NOT NULL,       -- "United States"
  inflation_rate   numeric,             -- annual %, e.g. 3.2
  fx_rate_to_usd   numeric,             -- units of local currency per 1 USD
  gdp_growth_rate  numeric,             -- annual %, e.g. 2.1
  interest_rate    numeric,             -- central bank rate %, e.g. 5.25
  sourced_at       timestamptz,         -- when the Analyst last fetched these figures
  source_notes     text,                -- e.g. "FRED CPI + Frankfurter ECB FX + IMF WEO"
  updated_at       timestamptz DEFAULT now()
)
```

Initial countries: US, MX, CO, BR. Seeded with last-known values; empty cells shown as "—" with a "missing" badge.

### 6.3 Layout

- Page header: "Country Economic Data" + subtitle + last-regenerated timestamp.
- Wide table: rows = countries, columns = Inflation Rate / FX Rate / GDP Growth / Interest Rate / Sourced At / Source Notes.
- Freshness indicator per row.
- Global **Analyst** button at top-right: regenerates all countries in one run.
- Table is read-only. No inline editing.

### 6.4 Regeneration

```
POST /api/admin/knowledge-registry/country-economic-data/regenerate
```

Fetches current figures from FRED (US inflation/interest rates), Frankfurter ECB (FX rates), and IMF/World Bank estimates (GDP growth, international rates).

---

## 7. API Endpoints

All endpoints under `/api/admin/knowledge-registry`.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | List all registry entries with live stats (chunk counts, freshness) |
| GET | `/:id` | Single asset detail + recent regeneration history |
| POST | `/:id/regenerate` | Trigger Analyst regeneration for one asset |
| GET | `/country-economic-data` | All country rows with current values |
| POST | `/country-economic-data/regenerate` | Trigger full country data refresh |

Route file: `artifacts/api-server/src/routes/admin/knowledge-registry.ts`

---

## 8. OpenAPI / Codegen

New paths added to `artifacts/api-spec/openapi.yaml`. After editing the spec, run:

```
pnpm --filter @workspace/api-spec run codegen
```

---

## 9. Rebecca & Specialist Access

- **Rebecca** continues to query `knowledge-base` via `queryChunks` as today. When the admin regenerates the `knowledge-base` asset via the registry, the new chunks replace the old ones and Rebecca's next query automatically uses the new data.
- **Specialists** — namespace access mappings are unchanged. The metadata footer shows "Used by: [Specialist names]" read-only.

---

## 10. Related but Separate: Admin Sidebar Sources & Resources

The following features are **not** part of the Knowledge Registry. They belong in the Admin sidebar (`/admin`) as separate top-level sections:

### Admin → Sources

A top-level Admin sidebar section exposing every type of raw input the app uses in its work and research:

| Sub-item | Contents |
|----------|---------|
| **Tables** | Structured data tables (benchmark slugs, reference tables, lookup data) |
| **Links** | External URLs referenced or scraped as research inputs |
| **Files** | Admin-uploaded documents (PDFs, CSVs, reference docs) used as knowledge source material |

### Admin → Resources → APIs

A top-level Admin sidebar section with an **APIs** sub-item. The APIs page is a testable registry: every external API the app calls, with full description, endpoint, auth key reference, rate limit, status badge, and a **live Test button** that fires a real request and shows the response.

These are separate implementation tasks from the Knowledge Registry. See `.agents/skills/hplus-admin-nav-ia/SKILL.md` for the full navigation IA and hard rules.

---

## 11. Permissions & Access Control

- **Admin role:** Read asset metadata, view content, trigger regeneration via Analyst button. No inline edit of any value.
- Existing middleware gate for `/ai-intelligence` remains unchanged.

---

## 12. Freshness Logic

| Status | Condition |
|--------|-----------|
| `missing` | `last_refreshed_at` is null OR chunk/row count is 0 |
| `stale` | `last_refreshed_at` older than `global_cadence_days` (default: 30) |
| `fresh` | Within cadence AND count > 0 |

Same `globalCadenceDays` setting used by AnalystTables applies here (shared, not per-asset).

---

## 13. What Does NOT Change

- `AnalystTables.tsx` and its endpoints are untouched. The benchmark tables remain in "Market Data" and are additionally mirrored in the Knowledge Registry overview.
- Vector namespace management in `intelligence-vector-store.ts` is untouched.
- `source-registry.ts` and the existing "Resources → Catalog" page in AI Intelligence are untouched.
- Rebecca's chat interface and configuration are untouched.

---

## 14. Implementation Order

1. **DB migrations** — `knowledge_registry` table + `country_economic_data` table
2. **Seeds** — `knowledge-registry.ts` seed file for all 8 assets
3. **API routes** — `knowledge-registry.ts` route file
4. **OpenAPI spec** — new paths + codegen run
5. **Frontend: Sources overview page** — `KnowledgeRegistry.tsx` with asset panels, type-specific content viewers, Analyst button wiring
6. **Frontend: Country Data sub-page** — `CountryEconomicData.tsx`
7. **Sidebar wiring** — new sections in `AiIntelligenceSidebar.tsx` and `AiIntelligence.tsx`
8. **Regeneration logic** — Analyst prompts and data-write handlers per asset type

Steps 1–4 (backend) are parallelizable with steps 5–7 (frontend shell with loading states).

---

## 15. Open Questions (Deferred)

- **Per-asset cadence**: today cadence is global. Per-asset override is post-v1.
- **Specialist connection management**: read-only in v1. Editing connections from the registry panel is post-v1.
- **Country scope**: US, MX, CO, BR confirmed as initial set. Confirm before step 1.
- **Admin sidebar Sources & Resources**: separate implementation tasks; not blocked on Knowledge Registry.
