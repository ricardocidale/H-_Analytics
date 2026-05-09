# Agent-Native Parity Map

Every UI action a user can take, Rebecca must be able to achieve through conversation.
This document is the canonical record of parity status. Update it whenever a new UI
feature ships or a new Rebecca tool is added.

**Status values:**
- ✅ Tool exists
- ⚠️ Gap — UI action has no Rebecca tool (must be resolved before merging UI feature)
- 🚫 N/A — user-only action or explicitly deferred

## Portfolio Actions

| UI Action | Route / Location | Rebecca Tool | Status |
|---|---|---|---|
| View property list | Properties sidebar | `list_properties` | ✅ |
| View property detail | Property page | `get_property` | ✅ |
| Create property | Properties → New | `create_property` | ✅ |
| Edit property field | Property → Edit | `update_property` | ✅ |
| Edit multiple property fields at once | Property → Edit (bulk) | `patch_property` | ✅ |
| Delete property | Property → Delete | `delete_property` | ✅ |
| List scenarios | Scenarios sidebar | `list_scenarios` | ✅ |
| View scenario detail | Scenario page | `get_scenario` | ✅ |
| Create scenario | Scenarios → New | `create_scenario` | ✅ |
| Clone scenario | Scenarios → Clone | `create_scenario (cloneFromId)` | ✅ |
| Edit scenario name / description / tags | Scenario → Edit | `update_scenario` | ✅ |
| Edit scenario financial assumptions | Scenario → Edit | `update_scenario_assumptions` | ✅ |
| Lock scenario | Scenario → Lock | `lock_scenario` | ✅ |
| Delete scenario | Scenario → Delete | `delete_scenario` | ✅ |
| Compare two scenarios side-by-side | Scenarios → Compare | `compare_scenarios` | ✅ |
| Run property research | Property → Research | `trigger_research` | ✅ |

## Analyst Table Actions

| UI Action | UI Location | Rebecca Tool | Status |
|---|---|---|---|
| Refresh Capital Raise benchmarks | Admin → Analyst tables | `refresh_analyst_table` | ✅ |
| Refresh Exit Multiples benchmarks | Admin → Analyst tables | `refresh_analyst_table` | ✅ |
| Refresh Reference Brands | Admin → Analyst tables | `refresh_analyst_table` | ✅ |
| Read current rows of an analyst table | Admin → Analyst tables | `get_analyst_table` | ✅ |

## Company Actions

| UI Action | UI Location | Rebecca Tool | Status |
|---|---|---|---|
| List active companies (management cos + SPVs) | Admin → Companies | `list_companies` | ✅ |
| View a single company by id | Admin → Companies → detail | `get_company` | ✅ |

## Slides / Deck Actions (Legacy LB Deck — manual configure → render path)

> The tools below target the **legacy** `lb-deck-pdf` route, NOT the new
> Slide Factory pipeline (which has its own section below). The two surfaces
> coexist; legacy stays for the manual configure-and-render workflow used
> outside the wizard.

| UI Action | UI Location | Rebecca Tool | Status |
|---|---|---|---|
| Read LB deck configuration | Admin → Slides | `get_lb_deck_config` | ✅ |
| Configure deck (assign properties to slides 1/2/3/5) | Admin → Slides | `configure_lb_deck` | ✅ |
| Trigger deck render | Admin → Slides | `trigger_lb_deck_render` | ✅ |
| Check render status | Admin → Slides | `get_lb_deck_render_status` | ✅ |
| Download combined PDF | Admin → Slides | — | 🚫 N/A (file download) |

## Slide Factory Pipeline (V2 wizard — Tabs 1–6)

> The Slide Factory is the agent-native deck pipeline: brief upload (Tab 1)
> → Lorenzo ingestion (Tab 2) → property assignment (Tab 3) → Lucca draft
> review (Tab 4) → Marco build with per-slide swarms (Tab 5) → Download
> (Tab 6). Every UI action in `SlideFactoryPanel.tsx` is mapped below.
> Endpoints are in `artifacts/api-server/src/routes/slide-factory.ts`.

| UI Action | Endpoint | Rebecca Tool | Status |
|---|---|---|---|
| Create a new slide factory run | `POST /api/lb-slides/factory/runs` | `create_slide_factory_run` | ✅ |
| List slide factory runs | `GET /api/lb-slides/factory/runs` | `list_slide_factory_runs` | ✅ |
| Get a specific run (with full status + agent results) | `GET /api/lb-slides/factory/runs/:id` | `get_slide_factory_run` | ✅ |
| Record uploaded brief R2 key (Tab 1) | `POST /api/lb-slides/factory/runs/:id/brief` | `record_slide_factory_brief` | ✅ |
| Accept brief and auto-fire Lorenzo (Tab 1 → Tab 2) | `POST /api/lb-slides/factory/runs/:id/accept-brief` | `accept_slide_factory_brief` | ✅ |
| Manually trigger Lorenzo ingestion (rare) | `POST /api/lb-slides/factory/runs/:id/trigger-ingestion` | — | 🚫 N/A (admin-only edge case; auto-fire is the canonical path) |
| Assign properties to slides 1/2/3/5 + auto-fire Lucca (Tab 3) | `POST /api/lb-slides/factory/runs/:id/properties` | `assign_slide_factory_properties` | ✅ |
| Edit a Lucca slot value or approval (Tab 4 or Tab 6 override) | `PATCH /api/lb-slides/factory/runs/:id/slots/:key` (allows `draft_review` and `complete`; stamps `admin-override` on complete runs) | `update_slide_factory_slot` | ✅ |
| Mark every Lucca slot approved at once (Tab 4) | `POST /api/lb-slides/factory/runs/:id/approve-all-slots` | `approve_all_slide_factory_slots` | ✅ |
| Trigger Marco build (Tab 4 → Tab 5) or re-trigger after error | `POST /api/lb-slides/factory/runs/:id/trigger-build` (accepts `draft_review` and `error` status; skips slot-approval check on error re-trigger) | `trigger_slide_factory_build` | ✅ |
| Cancel an in-progress build | `POST /api/lb-slides/factory/runs/:id/cancel` | `cancel_slide_factory_build` | ✅ |
| Produce / re-render deck PDF | Internal Marco tool + Rebecca `produce_slide_factory_deck` | `produce_slide_factory_deck` | ✅ |
| Override slot(s) and rebuild PDF (Tab 6) | `PATCH .../slots/:key` then `POST .../rebuild` | `update_slide_factory_slot` + `rebuild_slide_factory_deck` | ✅ |
| Request LLM copy suggestion for a single slot (Tab 6 override panel) | `POST /api/lb-slides/factory/runs/:id/slots/:key/suggest` | — | 🚫 N/A (admin-only inline copy-assist; suggestion is transient and not persisted until admin explicitly accepts and saves) |
| Upload brief PDF/PPTX file | Browser → R2 (presigned URL) | — | 🚫 N/A (file picker; user-only action) |
| Download rendered deck PDF (Tab 6) | `GET /api/lb-slides/factory/runs/:id/download` (planned) | — | 🚫 N/A (file download; planned in plan U9) |

**Auto-fire pattern note:** `accept-brief` and `assign-properties` are
fire-and-forget transitions — they immediately advance status and return
202 while Lorenzo / Lucca run in the background. Rebecca's tools mirror
this; the corresponding tool returns a structured "advanced + dispatched"
response without waiting for the background job.

**`dataChanged` emission:** every mutation tool above emits
`dataChanged: { entityType: "slide_factory_run", entityId: <runId> }` on
the SSE `done` payload so the frontend invalidates its run query and
re-renders the panel.

## Admin Actions (N/A or Deferred)

| UI Action | Route / Location | Rebecca Tool | Status |
|---|---|---|---|
| Upload document | Property → Docs | — | 🚫 N/A (file picker) |
| Edit global assumptions | Admin → Defaults | `update_global_assumptions` | ✅ |
| Change brand / appearance | Admin → Appearance | — | 🚫 N/A (admin-only) |
| Manage users | Admin → Team | — | 🚫 N/A (admin-only) |
| Change Rebecca config | Admin → AI | — | 🚫 N/A (admin-only) |

## Intelligence Actions

### Iris Agent Controls

| UI Action | UI Location | Rebecca Tool | Status |
|---|---|---|---|
| Run Health Check | Iris panel | `trigger_iris_health_check` | ✅ |
| Run Full Reindex | Iris panel | `trigger_iris_reindex` | ✅ |
| Clear Gaps | Iris panel | `clear_iris_gaps` | ✅ |
| View Iris status | Iris panel | `get_iris_status` | ✅ |
| Per-resource Sync | Iris panel | — | ⚠️ Deferred (no single-source admin route) |

### Knowledge Base

| UI Action | Route / Location | Rebecca Tool | Status |
|---|---|---|---|
| Record retrieval gap | Auto (Rebecca unanswered query) | `write_retrieval_gap` | ✅ |
| Create KB entry | Admin → Knowledge Base | `create_kb_entry` | ✅ |
| Update KB entry | Admin → Knowledge Base | `update_kb_entry` | ✅ |
| Delete KB entry | Admin → Knowledge Base | `delete_kb_entry` | ✅ |

### Live Market Research

| UI Action | Route / Location | Rebecca Tool | Status |
|---|---|---|---|
| Fetch competitor hotel data for a market | Research context / comp-set questions | `get_tripadvisor_hotels` | ✅ |

### Data Infrastructure (Pietro — Tools Deferred to U10)

| UI Action | UI Location | Rebecca Tool | Status |
|---|---|---|---|
| Probe / health-check a data source (Analyst button) | Admin → Sources | `probe_data_source` | ✅ |
| Regenerate a data source (triggers minion) | Admin → Sources | `regenerate_data_source` | ✅ |
| View all data source statuses | Admin → Sources | `get_data_source_status` | ✅ |

## When to Update This Map

- When a new UI action is added → add a row and either implement the tool (✅) or document the gap (⚠️)
- When a new Rebecca tool is added → update the corresponding row to ✅
- When a gap is resolved → flip ⚠️ to ✅

## Compliance Actions (Vito)

| UI Action | UI Location | Rebecca Tool | Status |
|---|---|---|---|
| Trigger compliance audit | Admin → Compliance → Run Audit | `run_compliance_audit` | ✅ |
| View violations | Admin → Compliance | — | 🚫 N/A (read-only display; no mutation needed via chat) |
| Resolve violation | Admin → Compliance → Resolve | — | 🚫 N/A (admin-only destructive action) |
| Accept violation | Admin → Compliance → Accept | — | 🚫 N/A (admin-only destructive action) |
