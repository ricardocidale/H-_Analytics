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
| Create property | Properties → New | `create_property` (deprecated — use create_property_record + seed_property_fees), `create_property_record` + `seed_property_fees` | ✅ |
| Edit property field | Property → Edit | `update_property` | ✅ |
| Edit multiple property fields at once | Property → Edit (bulk) | `patch_property` | ✅ |
| Update property coordinates after geocode | Property → Edit (basic info, auto on address resolve) | `update_property_coordinates` | ✅ |
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
| Share a scenario with another user by email | Scenarios → Share | `share_scenario` | ✅ |
| Run property research | Property → Research | `trigger_research` (deprecated — use seed + apply), `get_property_research_seeds` + `apply_property_research_values` | ✅ |
| Delete a property photo | Property → Photos → Delete | `delete_property_photo` | ✅ |
| Set property hero photo | Property → Photos → Set Hero | `set_hero_photo` | ✅ |
| List property photos | Property → Photos (view) | `list_property_photos` | ✅ |
| Update photo caption or sort order | Property → Photos → Edit | `update_photo` | ✅ |
| Add a photo by URL to a property gallery | Property → Photos → Add | `create_photo` | ✅ |
| View who a scenario is shared with | Scenarios → Shares | `list_scenario_shares` | ✅ |
| Revoke a scenario share for a specific user | Scenarios → Shares → Revoke | `revoke_share` | ✅ |
| Delete a slide factory run | Slide Factory → Runs → Delete | `delete_slide_factory_run` | ✅ |
| Reorder property photos | Property → Photos → Reorder | `reorder_photos` | ✅ |

## Property Finder Actions

| UI Action | UI Location | Rebecca Tool | Status |
|---|---|---|---|
| List saved/favorited properties | Property Finder → Saved | `list_prospective_properties` | ✅ |
| Save a property as a favorite | Property Finder → Save | `save_prospective_property` | ✅ |
| Delete a favorited property | Property Finder → Delete | `delete_prospective_property` | ✅ |
| Update notes on a favorited property | Property Finder → Notes | `update_prospective_property_notes` | ✅ |
| List price events for a property | Property Finder → Price History | `list_price_events` | ✅ |
| Add a price event | Property Finder → Add Price Event | `create_price_event` | ✅ |
| Update a price event | Property Finder → Edit Price Event | `update_price_event` | ✅ |
| Delete a price event | Property Finder → Delete Price Event | `delete_price_event` | ✅ |

## Analyst Table Actions

| UI Action | UI Location | Rebecca Tool | Status |
|---|---|---|---|
| Refresh Capital Raise benchmarks | Admin → Analyst tables | `refresh_analyst_table` (deprecated — use research + commit), `research_analyst_table` + `commit_analyst_table_research` | ✅ |
| Refresh Exit Multiples benchmarks | Admin → Analyst tables | `refresh_analyst_table` (deprecated — use research + commit), `research_analyst_table` + `commit_analyst_table_research` | ✅ |
| Refresh Reference Brands | Admin → Analyst tables | `refresh_analyst_table` (deprecated — use research + commit), `research_analyst_table` + `commit_analyst_table_research` | ✅ |
| Read current rows of an analyst table | Admin → Analyst tables | `get_analyst_table` | ✅ |

## Company Actions

| UI Action | UI Location | Rebecca Tool | Status |
|---|---|---|---|
| List active companies (management cos + SPVs) | Admin → Companies | `list_companies` | ✅ |
| View a single company by id | Admin → Companies → detail | `get_company` | ✅ |
| Update company name / type / description / active status | Admin → Companies → edit | `update_company` | ✅ |
| Create a new company (management co or SPV) | Admin → Companies → New | `create_company` | ✅ |
| Deactivate (soft-delete) a company | Admin → Companies → Deactivate | `delete_company` | ✅ |
| List service templates | Admin → Service Templates | `list_service_templates` | ✅ |
| Update a service template | Admin → Service Templates → Edit | `update_service_template` | ✅ |

## Slides / Deck Actions (Legacy LB Deck — manual configure → render path)

> The tools below target the **legacy** `lb-deck-pdf` route, NOT the new
> Slide Factory pipeline (which has its own section below). The two surfaces
> coexist; legacy stays for the manual configure-and-render workflow used
> outside the wizard.

| UI Action | UI Location | Rebecca Tool | Status |
|---|---|---|---|
| Read LB deck configuration | Admin → Slides | `get_lb_deck_config` | ✅ |
| Configure deck (assign properties to slides 1/2/3/5) | Admin → Slides | `configure_lb_deck` | ✅ |
| Reset deck configuration to all-null defaults | Admin → Slides → Reset | `reset_lb_deck_config` | ✅ |
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
| Accept brief (Tab 1 → Tab 2 state) | `POST /api/lb-slides/factory/runs/:id/accept-brief` | `accept_slide_factory_brief` | ✅ |
| Start Lorenzo ingestion background job | (chat-only — REST path auto-fires) | `trigger_lorenzo_ingestion` | ✅ |
| Assign properties to slides 1/2/3/5 (Tab 3) | `POST /api/lb-slides/factory/runs/:id/properties` | `assign_slide_factory_properties` | ✅ |
| Start Lucca drafting background job | (chat-only — REST path auto-fires) | `trigger_lucca_draft` | ✅ |
| Edit a Lucca slot value or approval (Tab 4 or Tab 6 override) | `PATCH /api/lb-slides/factory/runs/:id/slots/:key` (allows `draft_review` and `complete`; stamps `admin-override` on complete runs) | `update_slide_factory_slot` | ✅ |
| Mark every Lucca slot approved at once (Tab 4) | `POST /api/lb-slides/factory/runs/:id/approve-all-slots` | `approve_all_slide_factory_slots` | ✅ |
| Trigger Marco build (Tab 4 → Tab 5) or re-trigger after error | `POST /api/lb-slides/factory/runs/:id/trigger-build` (accepts `draft_review` and `error` status; skips slot-approval check on error re-trigger) | `trigger_slide_factory_build` | ✅ |
| Cancel an in-progress build | `POST /api/lb-slides/factory/runs/:id/cancel` | `cancel_slide_factory_build` | ✅ |
| Produce / re-render deck PDF | Internal Marco tool + Rebecca `produce_slide_factory_deck` | `produce_slide_factory_deck` | ✅ |
| Override slot(s) and rebuild PDF (Tab 6) | `PATCH .../slots/:key` then `POST .../rebuild` | `update_slide_factory_slot` + `rebuild_slide_factory_deck` | ✅ |
| Request LLM copy suggestion for a single slot (Tab 6 override panel) | `POST /api/lb-slides/factory/runs/:id/slots/:key/suggest` | — | 🚫 N/A (admin-only inline copy-assist; suggestion is transient and not persisted until admin explicitly accepts and saves) |
| Upload brief PDF/PPTX file | Browser → R2 (presigned URL) | — | 🚫 N/A (file picker; user-only action) |
| Download rendered deck PDF (Tab 6) | `GET /api/lb-slides/factory/runs/:id/download` | `download_factory_v2_deck` (format='pdf') | ✅ |
| Download rendered deck PPTX (Tab 6) | `GET /api/lb-slides/factory/runs/:id/download/pptx` | `download_factory_v2_deck` (format='pptx') | ✅ |
| Download both PDF and PPTX (Tab 6) | See above | `download_factory_v2_deck` (format='both') | ✅ |

**Auto-fire pattern note:** `accept-brief` and `assign-properties` are
fire-and-forget transitions — they immediately advance status and return
202 while Lorenzo / Lucca run in the background. Rebecca's tools mirror
this; the corresponding tool returns a structured "advanced + dispatched"
response without waiting for the background job.

**`dataChanged` emission:** every mutation tool above emits
`dataChanged: { entityType: "slide_factory_run", entityId: <runId> }` on
the SSE `done` payload so the frontend invalidates its run query and
re-renders the panel.

## ICP Bracket Mix Actions

Bracket mix actions live on the Management Company page at `/company/icp-definition`
(the new bracket-mix page that replaced the 70-field freeform editor per task-1411).
The ICP Research Specialist and bracket-assignment minion are planned backend work;
tools will be added when those services ship.

| UI Action | UI Location | Rebecca Tool | Status |
|---|---|---|---|
| View bracket mix for the active management company | Company → ICP Bracket Mix → Bracket Mix tab | `get_bracket_mix` | ✅ GET /api/company/bracket-mix returns mix + catalog; tool wired (task-1412) |
| Run bracket assignment (Assign Brackets button) | Company → ICP Bracket Mix → Bracket Mix tab → Assign Brackets | `get_bracket_mix` | ✅ POST /api/company/bracket-mix/assign runs deterministic bracket-assignment minion; Rebecca reads result via get_bracket_mix (task-1412) |
| Update bracket weights / mix | Company → ICP Bracket Mix → Bracket Mix tab (weight inputs) | `update_bracket_mix` | ✅ PATCH /api/company/bracket-mix + update_bracket_mix tool; server normalises weights to 1.0 (task-1412) |
| View market evidence / comp context | Company → ICP Bracket Mix → Market Evidence tab | `get_global_assumptions` | ✅ (global assumptions already retrievable; dedicated bracket-evidence tool deferred) |
| View legacy deprecated ICP record | Company → ICP Bracket Mix → Legacy ICP tab | `get_global_assumptions` | ✅ (legacy 70-field data is part of global assumptions; read-only) |

## Admin Actions (N/A or Deferred)

| UI Action | Route / Location | Rebecca Tool | Status |
|---|---|---|---|
| Upload document | Property → Docs | — | 🚫 N/A (file picker) |
| Read global assumptions | Admin → Defaults (view) | `get_global_assumptions` | ✅ |
| Edit global assumptions | Admin → Defaults | `update_global_assumptions` | ✅ |
| Save a Company Assumptions tab | Company → Assumptions → (per-tab Save) | `save_company_assumption_tab` | ✅ |
| Change brand / appearance | Admin → Appearance | — | 🚫 N/A (admin-only) |
| Manage users | Admin → Team | — | 🚫 N/A (admin-only) |
| Change Rebecca config | Admin → AI | — | 🚫 N/A (admin-only) |
| Update company record | Admin → Company | `update_company` | ✅ |

## Specialist Actions

Specialist prompts, models, required-fields, field-toggles, and prerequisite-toggles are **dev-defined only** per `.claude/rules/specialists-are-dev-defined-only.md`. The corresponding admin routes return 405. The only admin-mutable surface is the append-only Required Fields telemetry below.

| UI Action | UI Location | Rebecca Tool | Status |
|---|---|---|---|
| List Specialists in catalog | Specialists Directory | `list_specialists` | ✅ |
| View one Specialist's config + definition | Specialist Page | `get_specialist_config` | ✅ |
| Promote / Ignore a Required-Fields candidate | Specialist → Required Fields tab | `record_specialist_recommendation_event` | ✅ |
| Edit Specialist prompt template | — | — | 🚫 N/A (dev-defined) |
| Edit Specialist model slug | — | — | 🚫 N/A (dev-defined) |
| Edit Specialist required-fields | — | — | 🚫 N/A (dev-defined) |
| Edit Specialist field-toggles / prerequisite-toggles | — | — | 🚫 N/A (dev-defined) |

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
| List KB entries | Admin → Knowledge Base | `list_kb_entries` | ✅ |
| View single KB entry | Admin → Knowledge Base | `get_kb_entry` | ✅ |
| Create KB entry | Admin → Knowledge Base | `create_kb_entry` | ✅ |
| Update KB entry | Admin → Knowledge Base | `update_kb_entry` | ✅ |
| Delete KB entry | Admin → Knowledge Base | `delete_kb_entry` | ✅ |

### Live Market Research

| UI Action | Route / Location | Rebecca Tool | Status |
|---|---|---|---|
| Fetch competitor hotel data for a market | Research context / comp-set questions | `get_tripadvisor_hotels` | ✅ |

### Market Rates

| UI Action | Route / Location | Rebecca Tool | Status |
|---|---|---|---|
| View market rates and staleness status | Admin → Sources & Resources | `get_market_rates` | ✅ |
| Regenerate market rate row (Analyst button) | Admin → Sources & Resources → Analyst | N/A — row-level regeneration only; individual cell editing not supported (CLAUDE.md §8) | 🚫 N/A |

### Data Infrastructure (Pietro — Tools Deferred to U10)

| UI Action | UI Location | Rebecca Tool | Status |
|---|---|---|---|
| Probe / health-check a data source (Analyst button) | Admin → Sources | `probe_data_source` | ✅ |
| Regenerate a data source (triggers minion) | Admin → Sources | `regenerate_data_source` | ✅ |
| View all data source statuses | Admin → Sources | `get_data_source_status` | ✅ |

### ICP National Research Feeds (Task #1410)

| UI Action | UI Location | Rebecca Tool | Status |
|---|---|---|---|
| Read vendor pass-through cost table | Admin → AI → Intelligence → Knowledge & Resources → Tables → National Vendor Pass-Through Costs | `get_vendor_passthrough_costs` | ✅ |
| Regenerate vendor pass-through cost data (Analyst button) | Admin → AI → Intelligence → Knowledge & Resources → Tables → National Vendor Pass-Through Costs | `regenerate_data_source("vendor-passthrough-costs")` | ✅ |
| Read Mgmt Co markup factor table | Admin → AI → Intelligence → Knowledge & Resources → Tables → National Mgmt Co Markup Factors | `get_mgmt_co_markup_factors` | ✅ |
| Regenerate Mgmt Co markup factor data (Analyst button) | Admin → AI → Intelligence → Knowledge & Resources → Tables → National Mgmt Co Markup Factors | `regenerate_data_source("mgmt-co-markup-factors")` | ✅ |

### Admin Resources (model/api/mcp/source/factory_number registry)

> `admin_resources` rows are added and removed via migrations only. The
> Rebecca tool exposes the same versioned update path the Resources tab uses.

| UI Action | UI Location | Rebecca Tool | Status |
|---|---|---|---|
| Update an admin_resources row (versioned) | Admin → Resources → Edit | `update_admin_resource` | ✅ |
| Create an admin_resources row | — | — | 🚫 N/A (migrations only) |
| Delete an admin_resources row | — | — | 🚫 N/A (migrations only) |
| Roll back to a prior version | Admin → Resources → History | — | ⚠️ Deferred (HTTP-only for now) |

## When to Update This Map

- When a new UI action is added → add a row and either implement the tool (✅) or document the gap (⚠️)
- When a new Rebecca tool is added → update the corresponding row to ✅
- When a gap is resolved → flip ⚠️ to ✅

## Report Export Actions (Valentina)

| UI Action | UI Location | Rebecca Tool | Status |
|---|---|---|---|
| Export financial report as PDF / Excel / CSV / ZIP | Property or company report page → Export | `generate_financial_report_export_link` | ✅ |

## Compliance Actions (Vito)

| UI Action | UI Location | Rebecca Tool | Status |
|---|---|---|---|
| Trigger compliance audit | Admin → Compliance → Run Audit | `run_compliance_audit` | ✅ |
| View violations | Admin → Compliance | — | 🚫 N/A (read-only display; no mutation needed via chat) |
| Resolve violation | Admin → Compliance → Resolve | — | 🚫 N/A (admin-only destructive action) |
| Accept violation | Admin → Compliance → Accept | — | 🚫 N/A (admin-only destructive action) |
