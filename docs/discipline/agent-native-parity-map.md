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
| Create property | Properties → New | — | ⚠️ Route exists, tool missing |
| Edit property field | Property → Edit | `update_property` | ✅ |
| Delete property | Property → Delete | — | ⚠️ Route exists, tool missing |
| Create scenario | Scenarios → New | `create_scenario` | ✅ |
| Clone scenario | Scenarios → Clone | `create_scenario (cloneFromId)` | ✅ |
| Edit scenario name / description / tags | Scenario → Edit | `update_scenario` | ✅ |
| Edit scenario financial assumptions | Scenario → Edit | `update_scenario_assumptions` | ✅ |
| Lock scenario | Scenario → Lock | `lock_scenario` | ✅ |
| Delete scenario | Scenario → Delete | `delete_scenario` | ✅ |
| Run property research | Property → Research | `trigger_research` | ✅ |

## Analyst Table Actions

| UI Action | UI Location | Rebecca Tool | Status |
|---|---|---|---|
| Refresh Capital Raise benchmarks | Admin → Analyst tables | `refresh_analyst_table` | ✅ |
| Refresh Exit Multiples benchmarks | Admin → Analyst tables | `refresh_analyst_table` | ✅ |
| Refresh Reference Brands | Admin → Analyst tables | `refresh_analyst_table` | ✅ |

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
| Edit a Lucca slot value or approval (Tab 4) | `PATCH /api/lb-slides/factory/runs/:id/slots/:key` | `update_slide_factory_slot` | ✅ |
| Mark every Lucca slot approved at once (Tab 4) | `POST /api/lb-slides/factory/runs/:id/approve-all-slots` | `approve_all_slide_factory_slots` | ✅ |
| Trigger Marco build (Tab 4 → Tab 5) | `POST /api/lb-slides/factory/runs/:id/trigger-build` | `trigger_slide_factory_build` | ✅ |
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
| Edit global assumptions | Admin → Defaults | — | ⚠️ Deferred (high risk surface) |
| Change brand / appearance | Admin → Appearance | — | 🚫 N/A (admin-only) |
| Manage users | Admin → Team | — | 🚫 N/A (admin-only) |
| Change Rebecca config | Admin → AI | — | 🚫 N/A (admin-only) |

## AI Intelligence Actions

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

## When to Update This Map

- When a new UI action is added → add a row and either implement the tool (✅) or document the gap (⚠️)
- When a new Rebecca tool is added → update the corresponding row to ✅
- When a gap is resolved → flip ⚠️ to ✅
