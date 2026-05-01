# Admin + AI Intelligence Inventory Audit

**Date:** 2026-05-01
**Scope:** Every sidebar entry + sub-tab in `Admin` and `AI Intelligence` sections.
**Purpose:** User cannot see all admin surfaces at once and is afraid configs have been forgotten. This audit traces every tab to its DB persistence and downstream consumer to identify orphans, duplicates, and rule violations.
**Method:** Read-only static analysis. No code changed.

---

## Executive Summary

**Surfaces audited:** ~38 admin tab files + 12 Specialist pages × 8 internal tabs + 7 Rebecca sub-tabs + 5 Resources sub-tabs + 3 System sub-tabs ≈ **180 individual surfaces**.

**Critical findings:**

| # | Severity | Finding |
|---|---|---|
| 1 | 🔴 Rule violation | **4 of 8 Specialist tabs violate `specialists-are-dev-defined-only.md`** by allowing runtime edits to persona, field-requirement toggles, LLM config/prompts, and free-form JSON config. |
| 2 | 🔴 Rule violation | **Scheduled Research** allows cron-triggered Specialist runs — forbidden by `analyst-trigger-discipline.md`. |
| 3 | 🔴 Rule violation | **Rebecca → Guardrails** is admin-editable at runtime — same rule violation as #1. |
| 4 | 🟠 Orphan | **Admin → Reports & Exports** persists `exportConfig` to DB but production export code never reads it (uses localStorage instead). UI lies. |
| 5 | 🟠 Dual mount | **Knowledge Base** and **Conversations** are reachable via both sidebar AND inside RebeccaAdminTabs — same surface, two routes. |
| 6 | 🟠 Sidebar duplication | **Market & Macro** appears as both a sidebar leaf AND a tab inside ModelDefaultsTab — same content. |
| 7 | 🟠 UX | **Resources** has 4 sidebar entries (APIs / Sources / Benchmarks / Models) pointing to the same `ResourcesTab` with different `kind=` props — should be one entry with internal tabs. |
| 8 | ✅ Resolved | ~~**Market Data tables** and **Resources → Benchmarks** display overlapping benchmark data.~~ Investigation (admin-cleanup-8) confirmed they are *not* duplicates: Resources → Benchmark Slugs is the admin-managed registry of which benchmark *slugs* exist (`/api/admin/resources?kind=benchmark`), while Market Data holds the actual *values* refreshed by The Analyst (`/api/admin/market-data-tables/*`). Renamed the catalog tab to "Benchmark Slugs" and cross-linked the two subtitles. |
| 9 | 🟡 Overlap | **Resources → Models** registry and **Steady State → LLM Defaults** both touch the same LLM config — unclear which is source-of-truth. |
| 10 | 🟡 Wrapper | **PeopleTab** is a 21-line wrapper around `UsersTab` — pointless indirection. |
| 11 | 🟡 Unclear | **Vector Search Latency** purpose unclear — possible debug artifact left in production. |

**Surfaces that are clean** (~78% of audited surfaces): Steady State → Mgmt Co/Property Underwriting/Constants/DD Template/Analyst Tables/Reference Ranges/Benchmarks; Admin → Users/Scenarios/Brand/Notifications/Sidebar Visibility/Database/Activity/Verification/Observability/QA Sandbox; AI Intel → System Health, Specialist Workflow/Sources/Resource Assignments/Audit tabs.

---

## Master Inventory Table

### Admin Section

| Sidebar Entry | Sub-tab | Purpose | Connected? | Duplicate of? | Recommendation |
|---|---|---|---|---|---|
| Steady State | Mgmt Co (`CompanyTab`) | Edit ManCo defaults seeded into new tenants | ✅ wired | — | Keep |
| Steady State | Property Underwriting | Property revenue/cost templates | ✅ wired | — | Keep |
| Steady State | Market & Macro (sidebar leaf) | Inflation, cost of equity, fiscal year | ✅ wired | Identical to Mgmt Co tab "Market & Macro" sub-tab | **Kill sidebar leaf**; keep only as Mgmt Co sub-tab |
| Steady State | Constants (`ModelConstantsTab`) | Apply/discard Specialist-authored authority constants | ✅ wired | — | Keep |
| Steady State | Analyst Tables | Commit/discard Analyst table proposals | ✅ wired | — | Keep |
| Steady State | Reference Ranges | CRUD reference ranges for Analyst LLM context | ✅ wired | — | Keep |
| Steady State | Hospitality Benchmarks | Edit industry benchmarks | ✅ wired | Possibly overlaps Reference Ranges (different table, same purpose?) | Verify semantic boundary, document in tab description |
| Steady State | DD Template | DD workstream templates | ✅ wired | — | Keep |
| Steady State | LLM Defaults | Vendor/model defaults for Research, Operations, Assistants, Exports | ⚠️ partial | Overlaps Specialist `LlmConfigTab` (per-Specialist) AND `Resources → Models` registry | Single-owner: pick one writer surface |
| Properties | Required Fields | Read-only rollup linking to per-Specialist tabs | ✅ wired | — | Keep |
| Users | All Users (`PeopleTab` → `UsersTab`) | User CRUD | ✅ wired | `PeopleTab` is thin wrapper | Merge wrapper into target |
| Scenarios | All Scenarios + Default Assignments | Scenario CRUD + defaults | ✅ wired | — | Keep |
| Brand & Appearance | Brand Settings (Logos + Themes) | Logo & theme management | ✅ wired | — | Keep |
| Reports & Exports | All Exports (`ExportsTab`) | Toggle which sections render in PDF/PNG exports | ❌ **ORPHAN** | Saves to `global_assumptions.exportConfig`; production never reads it (export-generate.ts ignores; ExportDialog reads localStorage) | **Kill or rewire** — currently misleading |
| Testing & Verification | Verification | GAAP financial audit (7 sub-tabs) | ✅ wired | — | Keep |
| Testing & Verification | QA Sandbox | Live prompt tests against LLM models | ✅ wired | — | Keep |
| App Settings | Notifications | Alert rules, channels | ✅ wired | — | Keep |
| App Settings | Sidebar Visibility | Toggle 5 user-facing sidebar items | ✅ wired | — | Keep |
| App Settings | Database | Entity counts + production seed | ✅ wired | — | Keep |
| App Settings | Observability | Background scheduler health | ✅ wired | — | Keep |
| App Settings | Activity | 4 audit-log feeds | ✅ wired | — | Keep |

### AI Intelligence Section

| Sidebar Entry | Sub-tab | Purpose | Connected? | Duplicate of? | Recommendation |
|---|---|---|---|---|---|
| The Analyst | Gaspar (Orchestrator) | Same 8-tab template as 12 Specialists | ⚠️ partial | Reuses SpecialistPage with no orchestrator-distinct content | Either build orchestrator-specific view OR drop the entry (reachable via every Specialist's Workflow tab anyway) |
| Mgmt Co Specialists × 3 | (each → SpecialistPage 8 tabs) | Specialist pages | ⚠️ rule violations | See Specialist tab section below | Apply Specialist Tab Remediation (below) |
| Property Specialists × 2 | (each → SpecialistPage) | Specialist pages | ⚠️ rule violations | Same | Same |
| Photos | Photo Enhancer & Renders (`FernandaRenderConsolePage`) | Special page for Fernanda | ✅ wired | — | Keep |
| Portfolio Ops | Portfolio Watchdog | SpecialistPage | ⚠️ rule violations | — | Apply Specialist Tab Remediation |
| Constants & Authority Sources × 4 | (each → SpecialistPage) | Helena/Isadora/Júlia/Kamila | ⚠️ rule violations | — | Same |
| Resources Builder | Letícia (SpecialistPage) | — | ⚠️ rule violations | — | Same; also nest under Resources group |
| Rebecca | Configuration | System prompt, display name, chat engine | ✅ wired | LLM vendor here vs Steady State → LLM Defaults — precedence unclear | Document precedence in tooltip OR consolidate |
| Rebecca | Knowledge Base (in RebeccaAdminTabs) | KB editor | ❌ **DUAL-MOUNTED** | Same surface as sidebar entry below | **Remove from RebeccaAdminTabs** |
| Rebecca | Conversations (in RebeccaAdminTabs) | Chat history viewer | ❌ **DUAL-MOUNTED** | Same as sidebar entry below | **Remove from RebeccaAdminTabs** |
| Rebecca | Personas | Read-only persona display | ✅ wired | — | Keep |
| Rebecca | Guardrails | Edit safety guardrails at runtime | 🔴 **RULE VIOLATION** | — | **Make read-only** OR move guardrails into source code (per `specialists-are-dev-defined-only.md`) |
| Rebecca | Feedback | User feedback observability | ✅ wired | — | Keep |
| Rebecca | Analytics | Conversation metrics | ✅ wired | — | Keep |
| Rebecca | Knowledge Base (sidebar) | KB editor | ✅ wired | Dual-mount #5 | Keep, remove from RebeccaAdminTabs |
| Rebecca | Conversations (sidebar) | Chat history | ✅ wired | Dual-mount #5 | Keep, remove from RebeccaAdminTabs |
| Resources | APIs (`ResourcesTab kind="api"`) | External HTTP services registry | ✅ wired | Same component, 4 sidebar entries | **Consolidate**: one Resources entry with internal tabs |
| Resources | Sources (`ResourcesTab kind="source"`) | Bulk data sources | ✅ wired | Same | Same |
| Resources | Market Data (`MarketDataTablesPage`) | Industry benchmark *values* (read-only; Analyst-refreshed) | ✅ wired | Different surface from Resources → Benchmark Slugs (registry of admin-managed slugs) | Cross-linked in subtitles ✅ |
| Resources | Benchmark Slugs (`ResourcesTab kind="benchmark"`) | Registry of which benchmark *slugs* exist (admin-managed) | ✅ wired | NOT a duplicate of Market Data — different table, different shape (slug registry vs values) | Renamed to "Benchmark Slugs" + cross-linked ✅ |
| Resources | Models (`ResourcesTab kind="model"`) | LLM provider+secret wiring | ⚠️ overlap | Steady State → LLM Defaults | Pick one source-of-truth |
| System | System Health | Engine dashboard | ✅ wired | — | Keep |
| System | Scheduled Research | Cron schedules for Specialist runs | 🔴 **RULE VIOLATION** | — | **Strip cron, make manual-run-only** (per `analyst-trigger-discipline.md`) |
| System | Vector Search Latency | pgvector p50/p95 trends | ⚠️ unclear | — | Verify if production-monitored; if debug artifact, kill |

---

## Specialist Tab Remediation (4 rule violations)

Per `specialists-are-dev-defined-only.md` §3, **admins cannot edit Specialist persona, prompts, models, field requirements, or routing at runtime**. The current SpecialistPage has 8 tabs; 4 of them allow forbidden edits:

| Tab | Today | Required state | Action |
|---|---|---|---|
| Workflow | Read-only | ✅ | Keep |
| **Identity** | Editable: humanName + gender | Read-only display | **Remove edit affordances**; move humanName/gender to catalog |
| Sources | Read-only | ✅ | Keep |
| **Required Fields** | 3-way toggle (Off/Recommended/Hard) | Read-only display from catalog | **Delete tab entirely**; move to catalog |
| **LLM Config** | Edit prompt template + models + workflow overrides | Read-only display | **Delete tab entirely**; move to catalog + global defaults |
| Resource Assignments | Read-only | ✅ | Keep |
| **Runtime** | Free-form JSON editor | Audit what's in there | If config-like → delete; if telemetry-only → keep with allowlist |
| Audit | Read-only | ✅ | Keep |

**Result after remediation:** SpecialistPage drops from 8 tabs to ~3 tabs (Workflow, Sources, Audit; Resource Assignments folds into Workflow). Matches the brainstorm's recommendation A.

---

## Recommended Action Buckets

### 🔴 Critical — fix before next investor demo
1. **Specialist tab violations** (Identity / Required Fields / LLM Config / Runtime) — 4 tabs, 12 specialists × 4 tabs = 48 surfaces in violation. Make all read-only or delete.
2. **Rebecca → Guardrails** — make read-only; move guardrail config to source code.
3. **Scheduled Research** — strip cron triggers; manual-run-only console.
4. **Admin → Reports & Exports** — either kill (if config truly unused) or rewire to consume `global_assumptions.exportConfig` from production export code.

### 🟠 High UX leverage — quick wins
5. Dual-mount Knowledge Base + Conversations — remove from RebeccaAdminTabs.
6. Steady State → Market & Macro sidebar leaf — kill (already exists as Mgmt Co sub-tab).
7. Resources 4-way duplication — consolidate to one entry with internal tabs.
8. PeopleTab wrapper — merge into UsersTab.
9. Resources → Benchmarks vs Market Data — pick one.

### 🟡 Investigate before deciding
10. LLM Defaults vs Specialist LlmConfig vs Resources → Models — three surfaces, unclear ownership.
11. Vector Search Latency — kill if debug artifact.
12. Hospitality Benchmarks vs Reference Ranges — document boundary or consolidate.
13. Gaspar entry — distinct view or drop.

### ✅ Keep as-is
All other surfaces (78% of total).

---

## Drift Prevention — Proof Test Sketch

To prevent this state from recurring (the user's stated fear: "what may have been forgotten"), add `tests/proof/admin-surface-coverage.test.ts` that asserts:

1. **Every entry in `AdminSidebar.buildNavGroups()` and `AiIntelligenceSidebar.buildNavGroups()` resolves to a real component** (no dead routes).
2. **Every Specialist tab that contains a form input is in an allow-list with justification** (catches future rule violations).
3. **No two sidebar entries point to the same component with the same props** (catches dual-mounts).
4. **Every editable admin tab's mutation handler has at least one downstream consumer** (catches orphan settings — would have caught ExportsTab).

Implementation cost: ~1 day. Zero ongoing maintenance once the allow-list is seeded.

---

## Open questions for sign-off

1. **Bucket 🔴 #4 (ExportsTab):** Was the intention for users to control export sections from Admin (rewire), or was this UI built and abandoned (kill)? Reading the code suggests abandonment.
2. **Bucket 🟠 #7 (Resources consolidation):** Are APIs/Sources/Benchmarks/Models meaningful enough as separate concepts to keep 4 sidebar entries with internal-tab nesting, or is one entry with 4 internal tabs cleaner?
3. **Specialist tab remediation:** Any specific Specialist where the LlmConfig edit is genuinely needed in production (e.g., emergency model swap during an outage)? If yes, that one Specialist gets an exception with a written reason; the other 11 lose the tab.

