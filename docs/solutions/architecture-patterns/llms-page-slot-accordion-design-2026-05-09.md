---
title: "Intelligence → LLMs: slot-based accordion design — what was actually built"
date: 2026-05-09
category: architecture-patterns
module: intelligence-llms
problem_type: architecture_pattern
component: frontend_admin
severity: high
applies_when:
  - Building or modifying the Intelligence → LLMs page
  - Adding a new LLM slot to the system
  - Designing vendor/model assignment UI for admin
  - Understanding how model resolution works across the pipeline
tags: llms, intelligence, accordion, slots, admin-resources, vendor-health, analyst-button, n-plus-one, pipeline-policy, function-area-defaults
---

# Intelligence → LLMs: slot-based accordion design

## Context

The LLMs page (`Intelligence → LLMs`) is the single admin surface for managing all LLM
assignments in H+ Analytics. An earlier spec (`llms-page-workflow-cards-spec-2026-05-02.md`)
described a per-workflow-card design — one accordion row per named workflow, with per-card
Analyst buttons and per-card Save buttons. That design was never implemented.

What was actually built is a **slot-based accordion** backed by `admin_resources` rows
(`kind = 'llm_slot'`). Model identifiers are never hardcoded in source code — they live in
DB rows and are read at runtime, satisfying the no-magic-numbers integration-identifier rule.

The page is implemented in:
`artifacts/hospitality-business-portal/src/pages/intelligence/LlmWorkflowsPage.tsx`

---

## Page sections (top to bottom)

### 1. Toolbar

A `ToolbarRow` with title, subtitle, and two right-side controls:

- **Analyst button** — triggers `POST /api/admin/llm-registry/refresh`, which probes all
  configured vendor APIs, fetches current model lists, runs the recommender, and returns
  `vendorStatuses` + `recommendations`. Does NOT save anything. Rate-limited to 1 call per
  minute. The button is labeled "Analyst / Refresh models" following the
  `analyst-research-buttons` skill convention.
- **Save slots button** — a `SaveButton` that is only active (`hasChanges=true`) when one
  or more slot selections differ from the server-persisted value. On click it issues parallel
  `PUT /api/admin/resources/:id` requests for every dirty slot and invalidates the
  `["/api/admin/resources?kind=llm_slot"]` query cache.

The toolbar save covers the Slot Accordion only. Function-Area Defaults and N+1 Orchestrator
Defaults have their own inline Save buttons.

### 2. Vendor Health panel

Appears only after at least one Analyst probe. A 2×4 grid of small tiles — one per vendor
(`openai`, `anthropic`, `google`, `xai`, `tesla`, `microsoft`, `meta`, `deepseek`).

Each tile shows:
- A colored dot: green = API reachable, red = unreachable, gray = not yet probed
- Vendor display name
- After probe: model count + average latency in ms, or the error message

During a probe in progress, dots pulse with a CSS animation. The panel is controlled by
`data-testid="vendor-health-panel"` and per-vendor `data-testid="vendor-health-{vendor}"`.

### 3. Function-Area Defaults

A card (`data-testid="section-function-area-defaults"`) with a separate inline `SaveButton`
(`data-testid="button-save-function-area-defaults"`).

Contains a grid of `Section` components — one per functional area:

| Area key | Label | Function slug |
|---|---|---|
| `research` | Research | `research-deep` |
| `operations` | Operations | `operations` |
| `assistants` | Assistants | `chat` |
| `exports` | Exports | `exports` |

Each area exposes two dropdowns: **Default Vendor** and **Default Model**. The model dropdown
is disabled until a vendor is selected. Both are populated from `savedConfig.cachedModels`
(seeded by the last Analyst probe, with a `FALLBACK_MODELS` array as a static backstop).

When the Analyst has produced a recommendation for the area's function slug, a "recommended"
badge appears above the dropdowns, and the recommended vendor+model are shown as placeholder
text in their respective selects (with an "auto-selected" badge if no manual override exists).

These defaults are persisted via `PUT /api/admin/research-config` (the `ResearchConfig` blob
in `global_assumptions`), in the `tabDefaults` subkey. They represent the seed layer:

```
Resolution order: slot override → function-area default → system hardcoded fallback
```

### 4. N+1 Orchestrator Defaults

A card (`data-testid="section-n1-defaults"`) with its own inline `SaveButton`
(`data-testid="button-n1-save"`).

Assigns model resources to the four roles in the multi-model research pipeline:

| Role | Select test-id | Hardcoded fallback if unset |
|---|---|---|
| Quantitative Panel (Analyst A) | `select-n1-analystAModelResourceId` | gemini-2.5-flash |
| Market Panel (Analyst B) | `select-n1-analystBModelResourceId` | claude-sonnet-4-5 |
| Synthesis (Verdict) | `select-n1-synthesisModelResourceId` | claude-opus-4-6 |
| Fallback (N+2) | `select-n1-fallbackModelResourceId` | specialist primary |

Each dropdown lists all `admin_resources` rows with `kind = 'model'`. Selecting `__unset__`
reverts to the hardcoded default. Persisted via `PATCH /api/admin/pipeline-policies/tier1_property`
with `analystAModelResourceId`, `analystBModelResourceId`, `synthesisModelResourceId`, and
`fallbackModelResourceId`. Specialists can override these on their own LLM Config tab.

### 5. Slot Accordion

A Radix `Accordion` (type="multiple", default-open: `financial` and `research` groups).
Each `AccordionItem` wraps a `Card`.

Slots are grouped into six functional categories — each is one accordion item:

| Group ID | Label | Slots |
|---|---|---|
| `financial` | Financial Analysis | `specialist-prompt-engineer`, `specialist-quant-panel`, `specialist-market-panel`, `specialist-primary` |
| `research` | Research Orchestration | `research-analyst-a`, `research-analyst-b`, `research-synthesis` |
| `property-docs` | Property Documents | `vision`, `executive-summary-property`, `executive-summary-portfolio`, `risk-brief`, `icp-intelligence` |
| `data-extraction` | Data Extraction | `url-extraction`, `grounded-web-research` |
| `image-gen` | Image Generation | `image-generation`, `image-generation-fallback` |
| `system` | System Operations | `analyst-table-refresh`, `regen-constants` |

The accordion trigger shows the group label, a slot-count badge, and an "N unsaved" amber
badge when that group has dirty slots. The description is shown on wider viewports.

Inside each accordion panel, slots are laid out in a responsive grid (1 → 2 → 3 columns).
Each slot is a `SlotCard` component (`data-testid="slot-card-{slug}"`).

#### SlotCard

A self-contained card that manages vendor + model selection for one slot:

- Displays `slot.displayName` and `slot.description` (from the `admin_resources` row)
- **Vendor select** (`data-testid="select-vendor-{slug}"`) — lists all vendors with their
  probe-status dot and model count from the last registry state
- **Model select** (`data-testid="select-model-{slug}"`) — disabled until vendor selected;
  lists all `kind='model'` resources that belong to the chosen vendor
- When the selection differs from the last-saved `config.modelSlug` on the row, the card
  gains an amber border + "unsaved" badge
- A green dot appears on the card when a model is assigned and the vendor is available

Selections are staged in component state (`selections: Record<number, {vendorFilter, modelSlug}>`).
Nothing is persisted until the toolbar's Save slots button is pressed.

### 6. Specialists section

A flat tile grid (`data-testid="section-specialists-llm"`) listing all specialists from
`GET /api/admin/specialists`. Only specialists for which a `SPECIALIST_SECTION_TO_ID` mapping
exists are shown. Each tile is a button that navigates to the specialist's LLM Config tab
via `setIntelligenceTabHint(id, "llm-config")` + `setIntelligenceSection(section)`.

Badges: "custom" (amber) if `hasLlmOverrides === true`, otherwise "default" (muted). A
section-level badge counts how many specialists have custom overrides.

---

## Why slots over per-workflow-cards

The original spec imagined one accordion row per named workflow, with each card owning its
own Analyst trigger and its own Save. This does not scale:

1. **Model identity lives in `admin_resources`**, not in application code. A workflow card
   would need to know its own slug to look up its row — tight coupling between UI and DB
   identity.
2. **The resolution chain** (slot → area default → hardcoded fallback) requires a
   centralized slot registry. Per-card saves would fragment that registry across N save
   operations with no transactional guarantee.
3. **Analyst probes are vendor-scoped, not workflow-scoped.** One probe surfaces the health
   of all vendors simultaneously; per-card buttons would each re-probe the same vendors
   redundantly.
4. **Grouped accordion** lets the admin see the model assignment surface as a whole, observe
   which groups have drift, and save all dirty slots in one click — matching the "Analyst
   refreshes, admin reviews, Save persists" workflow.

---

## Data flow

```
GET /api/admin/resources?kind=llm_slot   → slot rows (slug, displayName, description, config.modelSlug)
GET /api/admin/resources?kind=model      → model rows (slug, displayName, config.vendor)
GET /api/admin/llm-registry              → last probe state (vendorStatuses, recommendations)
POST /api/admin/llm-registry/refresh     → re-probe, returns new state (does not save)
PUT  /api/admin/resources/:id            → persist modelSlug on a single slot row
GET/PUT /api/admin/research-config       → function-area tabDefaults (ResearchConfig blob)
GET /api/admin/pipeline-policies         → N+1 model resource IDs (tier1_property row)
PATCH /api/admin/pipeline-policies/:key  → persist N+1 model IDs
GET /api/admin/specialists               → specialist list with hasLlmOverrides flag
```

---

## When to Apply

- **Adding a new LLM slot**: create a new `admin_resources` row with `kind='llm_slot'`, set
  its `slug` to the canonical slot name, add the slug to the appropriate `SLOT_GROUPS` entry
  in `LlmWorkflowsPage.tsx`.
- **Adding a new vendor**: add it to the `LLM_VENDORS` constant in `research-shared.tsx` and
  ensure the registry manager probes it.
- **Adding a new functional area**: add an entry to `LLM_TAB_ITEMS` (key, label, description,
  function slug). The function slug must match a `recommendations[].function` value that the
  Analyst recommender can produce.
- **Specialist override**: implement on the specialist's own LLM Config tab, not here. This
  page shows override status only; navigation deep-links to the specialist's config.

---

## Examples

Slot card dirty state and save flow:

```
1. Admin opens Slot Accordion → Financial Analysis group
2. Changes "specialist-quant-panel" from claude-sonnet to gemini-flash
3. SlotCard gains amber border, "unsaved" badge; group trigger shows "1 unsaved"
4. Toolbar "Save slots (1)" button becomes active
5. Admin clicks Save → PUT /api/admin/resources/{id} with { config: { modelSlug: "gemini-flash-slug" } }
6. On success: toast "LLM assignments saved (1 slot)", cache invalidated, dirty state cleared
```

Function-area default (seeding vs. slot override):

```
Research area default: vendor=anthropic, model=claude-sonnet-4-5
research-analyst-a slot: modelSlug=null → falls through to area default
research-analyst-b slot: modelSlug="gemini-flash" → uses slot override, ignores area default
```

---

## Related

- `artifacts/hospitality-business-portal/src/pages/intelligence/LlmWorkflowsPage.tsx` — implementation
- `artifacts/api-server/src/routes/admin/research.ts` — `GET/PUT /api/admin/research-config`, `GET/POST /api/admin/llm-registry`
- `artifacts/api-server/src/routes/admin/intelligence.ts` — `GET/PATCH /api/admin/pipeline-policies`
- `artifacts/api-server/src/ai/specialist-llm-resolver.ts` — three-tier resolution chain at runtime
- `.agents/skills/hplus-admin-nav-ia/SKILL.md` — canonical nav tree; Rule 12 (LLM config is exclusive to this page), Rule 13 (references the old spec — update that reference to point here)
- `.agents/skills/analyst-research-buttons/SKILL.md` — Analyst button naming convention
- `docs/solutions/architecture-patterns/admin-sidebar-ia-sources-resources-2026-05-02.md` — admin_resources as the integration-identity store
- `docs/solutions/architecture-patterns/intelligence-specialists-page-2026-05-02.md` — Specialists accordion (same general page pattern)

> **Note on cross-reference:** `.agents/skills/hplus-admin-nav-ia/SKILL.md` Rule 13 and the
> skill's Related section still point to the old `llms-page-workflow-cards-spec-2026-05-02.md`.
> That reference should be updated separately to point to this document.
