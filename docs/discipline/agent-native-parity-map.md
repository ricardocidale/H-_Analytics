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

## Slides / Deck Actions

| UI Action | UI Location | Rebecca Tool | Status |
|---|---|---|---|
| Read LB deck configuration | Admin → Slides | `get_lb_deck_config` | ✅ |
| Configure deck (assign properties to slides 1/2/3/5) | Admin → Slides | `configure_lb_deck` | ✅ |
| Trigger deck render | Admin → Slides | `trigger_lb_deck_render` | ✅ |
| Check render status | Admin → Slides | `get_lb_deck_render_status` | ✅ |
| Download combined PDF | Admin → Slides | — | 🚫 N/A (file download) |

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
