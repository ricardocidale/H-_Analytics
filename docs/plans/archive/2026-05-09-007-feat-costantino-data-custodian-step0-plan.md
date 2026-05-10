---
title: "feat: Costantino Data Custodian — Step 0 (agent-native skeleton + admin_resources health probe)"
type: feat
status: completed
date: 2026-05-09
deepened: 2026-05-09
---

# feat: Costantino Data Custodian — Step 0

## Summary

Introduce **Costantino**, a new peer agent (alongside Pietro / Vito / Gustavo / Marco / Rebecca) whose charter is data integrity, R2 contracts, dependency health, data sanity, and dev↔prod parity. Step 0 ships the agent-native skeleton + his **first probe**: replace the current "is the env var set?" health-checker with an actual per-integration HTTP probe driven by Costantino's LLM loop. As a side effect this clears the 96 `admin_resources` rows currently stuck on RED. Same code path runs on dev and prod; no manual prod step.

## Problem Frame

Today, three concrete failures hit users:

1. `admin_resources.last_health_status` reports 96 rows RED because the probe checks "is the secret set" instead of pinging the integration. The actual integrations work fine. Admin dashboard is misleading.
2. The codebase has no agent that owns "does the data we're storing make sense?" That responsibility was about to be smeared across Pietro, which violates the existing one-agent-one-charter discipline.
3. Prod ↔ dev parity is verified by hand. There is no agent-owned probe that tells you when prod has drifted from dev (schema, seed rows, integration health, R2 contents).

Step 0 addresses (1) end-to-end on dev AND prod, and lays the agent-native foundation that Steps 1–6 will extend to cover (2) and (3).

---

## Requirements

- **R1.** A new agent named **Costantino** exists with a documented charter, a system prompt, and atomic primitive tools. Costantino runs in an LLM loop — his behavior lives in prose, not in TS conditionals.
- **R2.** A new persistent table `costantino_findings` records anything Costantino observes worth tracking, with full CRUD reachable through his tools and through SQL.
- **R3.** Costantino's first probe correctly classifies every `admin_resources` row of `kind='integration'` into one of `{ ok, key_missing, key_invalid, rate_limited, api_down }` based on a real HTTP probe — not on env-var presence — and writes the result to `admin_resources.last_health_status` / `last_health_message`.
- **R4.** Costantino runs on a scheduler whose cadence is **admin-editable at runtime** (no redeploy needed). Initial seed value is **5 days**. The cadence lives as a row in `admin_resources` (`kind='parameter'`, `slug='costantino-health-cycle-interval-ms'`); the scheduler re-reads it at the start of every cycle so an admin edit takes effect within one cycle. The Phase 3l hook lives in `artifacts/api-server/src/index.ts` immediately after the Phase 3k Vito hook.
- **R5.** Every threshold, timeout, max-depth, and **fallback** cadence used by Costantino is a `DEFAULT_COSTANTINO_*` constant in `lib/shared/src/constants.ts`. No numeric literals in source. The cadence constant is a *fallback only* — used when the admin row is unreachable (DB error) or missing.
- **R6.** Costantino's LLM model is selected at runtime via `resolveLlmFor("costantino-orchestration")` against an `admin_resources` row of `kind='llm_slot'`. No hardcoded model names.
- **R7.** Probe recipes (endpoint URL, auth header pattern, success-status set) live as JSON in `admin_resources.config_json.healthProbe` per integration row, not in TS code. Adding a new integration = SQL row, not code change.
- **R8.** The Drizzle migration is reversible (down migration), is added to the journal, and applies cleanly on prod startup.
- **R9.** A new skill at `.agents/skills/costantino-data-custodian/SKILL.md` documents the charter, agent-native principles applied, system-prompt design, tool primitives, and the expansion protocol for Steps 1–6. `CLAUDE.md` and `replit.md` are updated to surface him.
- **R10.** After deploy, the same code path produces accurate `admin_resources` health on prod within one Costantino tick, verified by hitting `GET /api/admin/resources` on prod.

---

## Scope Boundaries

**Explicit non-goals for Step 0:**

- No DB integrity probes beyond the integration-health probe (orphan/FK/NULL audits live in Step 1).
- No R2 contract verification (Step 2).
- No LLM data-sanity audit of other minions' writes (Step 3).
- No cross-env parity verifier or prod backfill action (Step 4).
- No Costantino admin UI — findings viewer + manual "run now" button come in Step 5.

> **Note on cadence escape hatch.** Because the default cadence is 5 days, the Step 5 "Run Costantino now" admin button is the primary on-demand trigger. Until Step 5 ships, the SQL workaround in the Risks section (temporarily lower the cadence parameter row, wait for tick, restore) is the supported way to force an immediate run.
- No Rebecca tool integration (Step 6).
- No automated remediation. Costantino *observes* and *reports*; he does not silently rewrite other agents' data.
- No replacement of `resource-health-checker.ts` callers. The legacy file stays in place; Costantino subsumes its responsibility but the migration is not in this step.

### Deferred to Follow-Up Work

| Item | Where |
|---|---|
| DB integrity probes (orphans, dangling FKs, illegal NULLs) | Step 1 — separate plan |
| R2 contract probes (orphan objects, dangling DB refs, quota) | Step 2 |
| LLM data-sanity audit (does this lat/lng land in this country? is `year_built` plausible?) | Step 3 |
| Cross-env parity verifier + prod property backfill action | Step 4 |
| Admin UI for `costantino_findings` + manual "Run Costantino now" button | Step 5 |
| Rebecca tool wrapping `list_findings` for chat queries | Step 6 |
| Retiring `resource-health-checker.ts` once Costantino fully owns the responsibility | Step 1 cleanup |

---

## Context & Research

### Relevant Code and Patterns

| File | Why it matters |
|---|---|
| `artifacts/api-server/src/ai/pietro/agent.ts` | Canonical LLM-loop agent shape. Mirror system-prompt + `callLlm` + tool dispatch + run-history append + error handling. |
| `artifacts/api-server/src/ai/pietro/tools.ts` | `getXxxTools()` / `dispatchXxxTool()` pattern with Zod input schemas. |
| `artifacts/api-server/src/ai/pietro/workspace.ts` | `readPietroHealth` / `appendRunHistory` workspace pattern. |
| `artifacts/api-server/src/ai/vito/agent.ts` | Adjacent peer-agent pattern (audit-shaped, like Costantino). |
| `artifacts/api-server/src/jobs/vito-compliance-scheduler.ts` | Canonical scheduler shape for peer agents — startup delay, `setInterval`, concurrency-guarded boolean, `recordSchedulerCycle`. |
| `artifacts/api-server/src/jobs/scheduler-run-tracker.ts` | `recordSchedulerCycle` observability hook. |
| `artifacts/api-server/src/jobs/resource-health-checker.ts` | The bug location — proves Costantino's first probe is needed. Stays in place this step. |
| `artifacts/api-server/src/jobs/probes/index.ts` | Existing per-kind probe runner. Costantino's `probe_integration_endpoint` tool reuses pieces of this. |
| `artifacts/api-server/src/index.ts` (lines ~342–422) | Phase 3 startup hooks. Phase 3l is the new Costantino slot. |
| `artifacts/api-server/src/llm-config-resolver.ts` | `resolveLlmFor(slot)` — pulls model from `admin_resources`, never hardcoded. |
| `lib/shared/src/constants.ts` | Constants destination. Protected file — write tool must respect existing structure. |

### Institutional Learnings

- **Number taxonomy law (CLAUDE.md §1):** every numeric literal must be a named DEFAULT_* constant in `lib/shared/src/constants*.ts`. Costantino's cadence, timeouts, max tool depth, etc. are all in scope.
- **No hardcoded integration identifiers (CLAUDE.md):** model names, slugs, endpoint URLs are admin_resources rows, never TS literals. Probe recipes are `config_json.healthProbe`.
- **Inflation-cascade discipline (`.agents/skills/inflation-cascade/SKILL.md`):** every value flowing to a user must be source-attributed in-context. Costantino's findings carry the `evidence` JSONB so the future admin UI can surface "why is this RED" without further lookup.
- **Prefer-external-dependencies skill:** Costantino's HTTP probes go to existing external endpoints already configured in `admin_resources`; no new Replit-managed services.
- **Replit-independence skill:** all Costantino code paths must run on Railway prod identically to dev; no `process.env.REPL*` usage, no Replit-only APIs.

### External References

None required. All prior art is in-repo.

---

## Agent-Native Architecture Review

This plan is architected per `.agents/skills/ce-agent-native-architecture/SKILL.md`. Each checklist item is addressed below as either **satisfied in Step 0** or **deferred to a specific later step**.

### Core Principles

| Principle | Step 0 status | Notes |
|---|---|---|
| **Parity** (every UI action has an agent capability) | Partial — satisfied for Step 0 surface | No Costantino UI ships in Step 0, but the tool primitives (`list_findings`, `resolve_finding`, manual probe trigger) are designed so the future Step 5 admin UI is a thin wrapper. Each future UI verb has an existing tool. |
| **Granularity** (atomic primitives, not workflow tools) | ✅ Satisfied | Tools are read/write/probe primitives. There is **no** `fix_health_check` workflow tool — Costantino's loop composes `list_admin_resources` + `get_probe_recipe` + `probe_integration_endpoint` + `update_admin_resource_health` + `write_finding` + `complete_task`. Behavior lives in the system prompt. |
| **Composability** (new features = new prompts) | ✅ Foundation laid | Step 1's DB-integrity probes will be a new prompt section + new primitive tools (`count_orphans`, `list_dangling_fks`), not a refactor of Costantino's loop. **Cadence is data, not code** (admin_resources parameter row) — operator can change scheduler behavior without redeploy, exactly the composition pattern the skill targets. |
| **Emergent capability** (handle unanticipated requests) | ✅ Foundation laid | Once findings exist, asking Costantino "why was Perplexity down last Thursday?" works by `list_findings({target_kind:'integration', target_id:'perplexity', since:'2026-05-02'})` + reasoning. No "root-cause-by-date" feature is built. |
| **Improvement over time** | ✅ Foundation laid | Findings table accumulates context AND operators can tune cadence at runtime (parameter row) — responsiveness improves without redeploy. Future system-prompt iterations refine behavior over time without code changes. |

### Tool Design

| Item | Status | How |
|---|---|---|
| **Dynamic vs Static** | ✅ Dynamic | `probe_integration_endpoint(slug)` reads the recipe from `admin_resources.config_json.healthProbe` at call time. New integration = SQL row, not new tool. |
| **CRUD completeness** | ✅ Satisfied for `costantino_findings` | Create (`write_finding`), Read (`list_findings`), Update (`resolve_finding`), Delete (deferred — findings are append-only for audit; hard delete requires SQL admin). |
| **Primitives not Workflows** | ✅ Satisfied | See Granularity above. |
| **API as Validator** | ✅ Satisfied | Tool input schemas use `z.string()` for slugs and severities, not `z.enum()`. Validation lives in the integration response and in the agent's judgment, not in TS narrowing. |

### Files & Workspace

| Item | Status | How |
|---|---|---|
| **Shared workspace** | ✅ Satisfied | Findings live in `costantino_findings` (DB) — same data the future admin UI reads. No agent-only sandbox. |
| **`context.md` pattern** | ✅ Satisfied | `costantino_findings` IS Costantino's accumulated context (queryable, persistent, structured). His workspace also includes `artifacts/api-server/src/ai/costantino/run-history/YYYY-MM-DD.md` mirroring Pietro's pattern. |
| **File organization** | ✅ Satisfied | `artifacts/api-server/src/ai/costantino/` mirrors `pietro/` and `vito/` directory shape. |

### Agent Execution

| Item | Status | How |
|---|---|---|
| **Completion signals** | ✅ Satisfied | Explicit `complete_task(summary)` tool. No heuristic "stopped calling tools" detection. |
| **Partial completion** | ✅ Satisfied | `costantino_findings.detected_at` lets a resumed run see what the prior run already covered. Each tick is also independently safe. |
| **Context limits** | ✅ Satisfied | `DEFAULT_COSTANTINO_FINDINGS_CONTEXT_LIMIT` caps the recent-findings injection at run kickoff. `DEFAULT_COSTANTINO_MAX_TOOL_DEPTH` caps loop depth. |

### Context Injection

| Item | Status | How |
|---|---|---|
| **Available resources** | ✅ Satisfied | Kickoff prompt lists current `admin_resources` rows (slug, kind, last_health_status, last_checked_at) + recent unresolved findings. |
| **Available capabilities** | ✅ Satisfied | System prompt documents each tool with user-facing vocabulary, not implementation jargon. |
| **Dynamic context** | ✅ Satisfied | Each scheduled tick refreshes the kickoff context. No long-lived sessions. |

### UI Integration

| Item | Status | How |
|---|---|---|
| **Agent → UI** | Deferred to Step 5 | No Costantino admin page in Step 0. `update_admin_resource_health` does flow into the existing admin resources page immediately, so the *first observable signal* (correct health colors) appears in the existing UI without any frontend change. |
| **No silent actions** | ✅ Satisfied | Every health-status mutation writes a paired `costantino_findings` row with `evidence`. |
| **Capability discovery** | Deferred to Step 5 | Will surface in the admin UI alongside the findings viewer. |

---

## Key Technical Decisions

- **Cadence: 5 days, admin-editable at runtime.** Lives as `admin_resources` row `kind='parameter' slug='costantino-health-cycle-interval-ms'` with `config_json.value_ms` storing the integer. Initial seed = `5 * 24 * 60 * 60 * 1000` (5 days). The TS-side fallback constant `DEFAULT_COSTANTINO_HEALTH_CYCLE_INTERVAL_MS` carries the same value and is used **only** when the DB row is unreachable or missing. The scheduler re-reads the row at the start of every cycle (cheap single-row SELECT) — admin edits take effect within one cycle without any redeploy or restart. Why 5 days: integration health is slow-moving (keys rarely revoke, endpoints rarely change). Hourly probing is overkill, costs LLM tokens, and adds noise. The Step 5 admin UI will expose a "Run Costantino now" button for ad-hoc triggering between scheduled cycles.
- **Replace vs side-by-side: side-by-side in Step 0.** `resource-health-checker.ts` stays in place this step. Costantino runs alongside, writing his own findings + updating `last_health_status`. The two writers are idempotent on the same column. Removing the legacy checker happens in Step 1 cleanup once Costantino is proven on prod for one cycle.
- **LLM loop, not deterministic.** The probe RECIPE is data; the DECISION (is 429 a temporary rate-limit or persistent over-quota? is a slow 200 healthy?) is the agent's judgment in the loop. This honors the agent-native granularity principle and avoids the "agent executes your code" anti-pattern.
- **`costantino_findings` schema** — full column list:
  - `finding_id uuid pk default gen_random_uuid()`
  - `kind text not null` — e.g. `'integration_health'`, `'orphan_row'` (Step 1+)
  - `severity text not null` — `'info' | 'warn' | 'block'` (severity strings, not enum, for agent-native flexibility)
  - `target_kind text not null` — e.g. `'admin_resource'`, `'property'`, `'r2_object'`
  - `target_id text not null` — slug or uuid as text (heterogeneous targets)
  - `description text not null` — agent's prose summary
  - `detected_at timestamptz not null default now()`
  - `resolved_at timestamptz null`
  - `resolved_by uuid null` — admin user id when resolved through UI; null when self-resolved
  - `evidence jsonb not null default '{}'::jsonb` — raw probe response, status code, latency, etc.
  - Indexes: `(target_kind, target_id)`, `(detected_at desc)`, partial index `(resolved_at) where resolved_at is null` for "open findings" queries.
- **Per-integration probe recipe** lives in `admin_resources.config_json.healthProbe`:
  ```json
  { "method": "GET", "endpoint": "https://api.perplexity.ai/...", "authType": "bearer", "secretRef": "PERPLEXITY_API_KEY", "successStatusCodes": [200, 204] }
  ```
  Costantino composes the request, fires it with timeout `DEFAULT_COSTANTINO_PROBE_TIMEOUT_MS`, returns `{ status_code, latency_ms, response_summary, error? }` to the agent. The agent then decides classification.
- **Costantino's LLM slot** — new `admin_resources` row `kind='llm_slot' slug='costantino-orchestration'` seeded by the migration, pointing at the same model resource the other orchestrators use. Resolved via `resolveLlmFor("costantino-orchestration")`.

---

## Open Questions

### Resolved During Planning

- **Q: Should the first probe be deterministic or agent-loop?** → Agent-loop. (User explicitly invoked `ce-agent-native-architecture`.)
- **Q: Replace `resource-health-checker.ts` or run side-by-side?** → Side-by-side in Step 0; legacy retires in Step 1 after one prod cycle proves Costantino correct.
- **Q: Where do probe recipes live?** → `admin_resources.config_json.healthProbe` JSON, not TS code.
- **Q: Cadence?** → 5 days, admin-editable at runtime via `admin_resources` row. TS constant is fallback only.
- **Q: How does an admin change the cadence after deploy?** → Edit the `admin_resources` row `slug='costantino-health-cycle-interval-ms'`, field `config_json.value_ms`. Step 0 supports SQL or the existing admin_resources admin page (already exists). Step 5 will add a friendlier "Costantino settings" panel.
- **Q: What if the admin sets cadence to something insane (e.g. 100ms or 999 years)?** → Scheduler clamps to `[DEFAULT_COSTANTINO_MIN_CYCLE_INTERVAL_MS, DEFAULT_COSTANTINO_MAX_CYCLE_INTERVAL_MS]` after reading the row. Out-of-range values log a warning and use the clamped value; the row is not auto-corrected.
- **Q: Findings table — append-only or hard-deletable?** → Append-only in Step 0; `resolve_finding` sets `resolved_at`. Hard delete requires SQL admin until Step 5 UI.
- **Q: Should we codegen the U1 migration SQL from `DEFAULT_COSTANTINO_*` constants to avoid integer literals (432000000, 60000, 2592000000) in the seed?** → No. A header comment in the migration citing each constant + value is sufficient for traceability. SQL files inside `lib/db/drizzle/*.sql` are exempt from the magic-numbers gate; codegen here would be over-engineering for a one-time seed row.

### Deferred to Implementation

- **Q: Exact text of Costantino's system prompt?** → Authored during U3 implementation; will read like Pietro's but with the data-custody charter.
- **Q: Should `evidence.response_summary` truncate the body, hash it, or store full JSON?** → Decide during U4; default plan: truncate to first 1KB, store full status + headers.
- **Q: Does `admin_resources.config_json` exist on the current schema?** → Verify in U1; add column if missing. Migration is reversible either way.
- **Q: Where do scheduler clamp warnings (admin set cadence below floor / above ceiling) surface beyond the api-server log?** → Step 0: log + `scheduler_run_tracker.notes.cadence_ms_used` (admin can SELECT to compare requested vs effective). Step 5 will surface clamp warnings in the Costantino admin panel alongside the "Run now" button.

---

## Output Structure

```
artifacts/api-server/src/ai/costantino/
├── agent.ts                            # NEW — LLM loop, mirrors pietro/agent.ts
├── tools.ts                            # NEW — atomic primitives + Zod schemas
└── workspace.ts                        # NEW — readCostantinoContext / appendRunHistory

artifacts/api-server/src/jobs/
└── costantino-scheduler.ts             # NEW — mirrors vito-compliance-scheduler.ts

artifacts/api-server/src/index.ts       # MODIFIED — add Phase 3l hook

lib/db/drizzle/
├── 00NN_costantino_findings.sql        # NEW migration (next sequence number)
└── meta/_journal.json                  # MODIFIED — add migration entry

lib/db/src/schema-costantino.ts         # NEW — Drizzle schema for costantino_findings
lib/db/src/index.ts                     # MODIFIED — re-export new schema

lib/shared/src/constants.ts             # MODIFIED — add DEFAULT_COSTANTINO_* constants

.agents/skills/costantino-data-custodian/
└── SKILL.md                            # NEW — charter, system-prompt design, expansion protocol

CLAUDE.md                               # MODIFIED — agent roster + Architecture Notes + Recent Changes (drop oldest)
replit.md                               # MODIFIED — Pointers + Recent Changes
```

---

## Implementation Units

### U1. Drizzle migration: `costantino_findings` table + admin_resources seed rows

**Goal:** Create the persistence + seed the data Costantino needs to run.

**Requirements:** R2, R6, R7, R8

**Dependencies:** none

**Files:**
- Create: `lib/db/drizzle/00NN_costantino_findings.sql` (next sequence after 0042)
- Create: `lib/db/src/schema-costantino.ts`
- Modify: `lib/db/src/index.ts` (re-export)
- Modify: `lib/db/drizzle/meta/_journal.json` (add entry)

**Approach:**
- Migration creates `costantino_findings` per the schema in Key Technical Decisions, with `gen_random_uuid()` default and three indexes.
- Migration verifies/adds `admin_resources.config_json jsonb default '{}'::jsonb` if missing.
- Migration seeds `healthProbe` recipes for every existing `kind='integration'` row currently in `admin_resources` (Perplexity / Tavily / Exa / Google Maps / Tripadvisor / OpenAI / Anthropic / Gemini / FRED / GitHub PAT / R2 — all SET in env per current secrets).
- Migration seeds one new row: `kind='llm_slot' slug='costantino-orchestration'` pointing at the existing default orchestrator model resource.
- Migration seeds one new row: `kind='parameter' slug='costantino-health-cycle-interval-ms'` with `config_json = '{"value_ms": 432000000, "min_ms": 60000, "max_ms": 2592000000, "unit": "ms", "human": "5 days"}'::jsonb` (5 days = 432,000,000 ms; min = 1 minute = 60,000; max = 30 days = 2,592,000,000). All raw integers in the SQL seed are computed from `DEFAULT_COSTANTINO_*` constants in U2 via a code-generation comment header on the migration file (the SQL still contains literal numbers — that's allowed inside `lib/db/drizzle/*.sql`, but the comment cites the source constants for traceability).
- Down migration drops the table, removes all three seed rows by slug, leaves `config_json` column in place (data preservation > clean rollback when adding a column).

**Patterns to follow:**
- `lib/db/drizzle/0042_*` for migration file structure and journal-entry shape
- `lib/db/src/schema-research-runs.ts` for a parallel "agent-owned table" Drizzle schema

**Test scenarios:**
- *Happy path:* `pnpm --filter @workspace/api-server run drizzle:migrate` applies cleanly; `SELECT count(*) FROM costantino_findings` returns 0.
- *Happy path:* `SELECT slug FROM admin_resources WHERE kind='llm_slot' AND slug='costantino-orchestration'` returns one row.
- *Happy path:* `SELECT count(*) FROM admin_resources WHERE kind='integration' AND config_json ? 'healthProbe'` equals total integration row count.
- *Edge case:* Re-running the migration is a no-op (idempotent guards on seed inserts).
- *Reversibility:* Down migration drops the table without orphaning data.

**Verification:**
- `pnpm --filter @workspace/scripts run check:schema-drift` passes.
- `pnpm --filter @workspace/scripts run check:migration-guards` passes.

---

### U2. Costantino constants in `lib/shared/src/constants.ts`

**Goal:** Land every numeric value Costantino will use as a named constant before any consumer is written.

**Requirements:** R5

**Dependencies:** none (parallel with U1)

**Files:**
- Modify: `lib/shared/src/constants.ts`

**Approach:**
Add this block:

```ts
// ── Costantino Data Custodian ──────────────────────────────────────────
/**
 * FALLBACK cycle interval, used only when the admin_resources row
 * `slug='costantino-health-cycle-interval-ms'` is unreachable or missing.
 * The runtime cadence is admin-editable — see R4. Initial seed = 5 days.
 */
export const DEFAULT_COSTANTINO_HEALTH_CYCLE_INTERVAL_MS = 5 * 24 * 60 * 60 * 1000;
/** Lower clamp on the admin-editable cadence (1 minute). Protects against accidental DOSing of integrations. */
export const DEFAULT_COSTANTINO_MIN_CYCLE_INTERVAL_MS = 60 * 1000;
/** Upper clamp on the admin-editable cadence (30 days). Protects against accidental "never run". */
export const DEFAULT_COSTANTINO_MAX_CYCLE_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;
/** Startup delay so other schedulers settle first. */
export const DEFAULT_COSTANTINO_STARTUP_DELAY_MS = 120 * 1000;
/** Max tool-call iterations per Costantino run. */
export const DEFAULT_COSTANTINO_MAX_TOOL_DEPTH = 12;
/** Low temperature — deterministic classification decisions. */
export const DEFAULT_COSTANTINO_TEMPERATURE = 0.1;
/** Token budget per Costantino run. */
export const DEFAULT_COSTANTINO_MAX_OUTPUT_TOKENS = 3_000;
/** Per-probe HTTP timeout (network call to integration endpoint). */
export const DEFAULT_COSTANTINO_PROBE_TIMEOUT_MS = 10_000;
/** Cap on recent unresolved findings injected into kickoff context. */
export const DEFAULT_COSTANTINO_FINDINGS_CONTEXT_LIMIT = 50;
/** Max bytes of integration response body stored in evidence.response_summary. */
export const DEFAULT_COSTANTINO_EVIDENCE_BODY_MAX_BYTES = 1_024;
/** Slug of the admin_resources parameter row that controls cadence. */
export const COSTANTINO_CADENCE_PARAM_SLUG = "costantino-health-cycle-interval-ms";
```

**Patterns to follow:**
- Existing `DEFAULT_PIETRO_*` block in the same file for grouping convention
- `constants-research.ts` for the "sourced + justified comment" pattern

**Test scenarios:**
- *Verification only:* `pnpm --filter @workspace/scripts run check:magic-numbers` passes for every file that will reference these constants in U3–U5.

**Verification:**
- `pnpm run typecheck` clean.
- `pnpm --filter @workspace/scripts run check:magic-numbers` clean.

---

### U3. Costantino agent skeleton (`agent.ts`, `workspace.ts`)

**Goal:** The LLM loop runs end-to-end with a system prompt that expresses Costantino's charter and a workspace that persists run history.

**Requirements:** R1, R6

**Dependencies:** U1, U2

**Files:**
- Create: `artifacts/api-server/src/ai/costantino/agent.ts`
- Create: `artifacts/api-server/src/ai/costantino/workspace.ts`
- Test: existing integration-test pattern under `artifacts/api-server/__tests__/` if present (otherwise smoke-test via scheduler tick)

**Approach:**
- `agent.ts` mirrors `pietro/agent.ts`: `runCostantinoAgent(trigger)` builds kickoff context (current `admin_resources` summary + recent unresolved findings, capped by `DEFAULT_COSTANTINO_FINDINGS_CONTEXT_LIMIT`), calls `callLlm` in a loop bounded by `DEFAULT_COSTANTINO_MAX_TOOL_DEPTH`, dispatches tools via `dispatchCostantinoTool`, ends when `complete_task` is called or depth is hit.
- System prompt structure:
  - "You are Costantino, the Data Custodian."
  - The 5-responsibility charter (full text — even though Step 0 implements only #1, the prompt declares the full role so future steps don't require re-reading the prompt).
  - Tool list with user-facing vocabulary.
  - Decision criteria for the integration-health probe: how to interpret status codes, when to mark `key_invalid` vs `api_down`, when a slow 200 is still healthy, how to classify 429s.
  - "Always end by calling `complete_task` with a one-line summary."
- `workspace.ts`: `appendRunHistory(date, entry)` writes to `artifacts/api-server/src/ai/costantino/run-history/YYYY-MM-DD.md`. `readRecentFindings(limit)` queries `costantino_findings`.

**Patterns to follow:**
- `pietro/agent.ts` line-by-line for the loop shape, error handling, metric accumulation
- `vito/agent.ts` for an audit-shaped peer agent's tone

**Test scenarios:**
- *Happy path:* Manual call `runCostantinoAgent("manual")` from a Node REPL completes without throwing, returns a `CostantinoRunResult` with `toolsInvoked` non-empty.
- *Edge case:* Run with zero `admin_resources` integration rows — agent calls `complete_task` immediately with "no work" summary, no findings written.
- *Error path:* Tool dispatch throws — agent catches, logs via `serverLog`, accumulates error in metrics, still calls `complete_task`.
- *Integration:* Run history file is appended after run completes.

**Verification:**
- `pnpm run typecheck` clean.
- One manual run from `restart_workflow artifacts/api-server: API Server` log shows Costantino completing a tick.

---

### U4. Atomic tool primitives (`tools.ts`)

**Goal:** Implement the eight primitive tools the agent loop composes.

**Requirements:** R1, R2, R3, R7

**Dependencies:** U1, U2, U3

**Files:**
- Create: `artifacts/api-server/src/ai/costantino/tools.ts`

**Approach:**
- `getCostantinoTools()` returns Zod-typed declarations for:
  - `list_admin_resources({ kind?, slug?, health? })` — read from `admin_resources` via `storage.listAdminResources`.
  - `get_probe_recipe({ slug })` — reads `admin_resources.config_json.healthProbe`. Returns the recipe verbatim or an error if missing.
  - `probe_integration_endpoint({ slug })` — composes HTTP request from recipe, fires with `AbortSignal.timeout(DEFAULT_COSTANTINO_PROBE_TIMEOUT_MS)`, returns `{ status_code, latency_ms, response_summary, error?, headers_summary }`. Truncates body at `DEFAULT_COSTANTINO_EVIDENCE_BODY_MAX_BYTES`. Resolves secret value from `process.env[recipe.secretRef]` for the request — never logs the secret value, never echoes it back to the agent.
  - `update_admin_resource_health({ slug, status, message })` — writes via `storage.updateAdminResourceHealth`.
  - `write_finding({ kind, severity, target_kind, target_id, description, evidence })` — inserts into `costantino_findings`. Returns the new `finding_id`.
  - `list_findings({ target_kind?, target_id?, resolved?, since? })` — query helper.
  - `resolve_finding({ finding_id, resolved_by, note? })` — sets `resolved_at`. `resolved_by` defaults to a system uuid for agent-self-resolves.
  - `complete_task({ summary })` — explicit completion signal; the loop exits on this.
- `dispatchCostantinoTool(name, args)` switches on tool name, validates args via Zod, executes, returns the result object.
- All tool errors are caught at the dispatch boundary and returned as `{ error: string }` so the agent can reason about failures rather than the loop crashing.

**Patterns to follow:**
- `pietro/tools.ts` for Zod schema + dispatch pattern
- `vito/tools.ts` for an "agent writes findings" tool shape (`write_violation`)
- `routes/admin-resources.ts` for storage method shapes

**Test scenarios:**
- *Happy path:* `probe_integration_endpoint` against a live Perplexity recipe returns `status_code=200`, `latency_ms < 5000`.
- *Edge case:* Probe recipe missing → tool returns `{ error: "no healthProbe recipe configured" }`, does not throw.
- *Edge case:* Secret env var unset → tool returns `{ error: "secret PERPLEXITY_API_KEY not set", classification_hint: "key_missing" }`.
- *Error path:* Network timeout → tool returns `{ error: "timeout after 10000ms", classification_hint: "api_down" }`.
- *Error path:* Integration returns 401 → tool returns `{ status_code: 401, response_summary, classification_hint: "key_invalid" }`. The hint is a hint, not a decision — the agent may override.
- *Integration:* `write_finding` followed by `list_findings({ target_id: same_slug })` returns the just-written row.
- *Integration:* `resolve_finding` sets `resolved_at`; subsequent `list_findings({ resolved: false })` excludes it.

**Verification:**
- `pnpm run typecheck` clean.
- `pnpm --filter @workspace/scripts run check:magic-numbers` clean (all timeouts/limits reference U2 constants).
- One manual run shows the agent composing `list_admin_resources` → `get_probe_recipe` → `probe_integration_endpoint` → `update_admin_resource_health` + `write_finding` → `complete_task` for a real integration.

---

### U5. Scheduler + admin-editable cadence + Phase 3l startup hook

**Goal:** Costantino runs at the admin-configured cadence (5 days seed) on dev and prod, with admin edits taking effect within one cycle without redeploy.

**Requirements:** R4, R10

**Dependencies:** U1 (admin_resources cadence row), U3, U4

**Files:**
- Create: `artifacts/api-server/src/jobs/costantino-scheduler.ts`
- Modify: `artifacts/api-server/src/index.ts` (add Phase 3l hook)

**Approach:**
- Scheduler does **not** use `setInterval` with a fixed period (that would freeze cadence at startup time and ignore admin edits). Instead, it uses a self-rescheduling `setTimeout` chain:
  1. On startup, after `DEFAULT_COSTANTINO_STARTUP_DELAY_MS`, fire the first cycle.
  2. After each cycle (success or failure), call `resolveCadenceMs()` and `setTimeout(runCostantinoCycle, resolvedMs)` for the next tick.
  3. `resolveCadenceMs()`: SELECT `config_json->>'value_ms'` from `admin_resources` WHERE `slug=COSTANTINO_CADENCE_PARAM_SLUG`. Parse to integer. Clamp to `[DEFAULT_COSTANTINO_MIN_CYCLE_INTERVAL_MS, DEFAULT_COSTANTINO_MAX_CYCLE_INTERVAL_MS]`. On any error (DB unreachable, row missing, parse failure), log warning + return `DEFAULT_COSTANTINO_HEALTH_CYCLE_INTERVAL_MS` (the fallback constant).
  4. `runCostantinoCycle()` reads cadence FIRST (so the log line at cycle start reports the active cadence), then calls `runCostantinoAgent("scheduled")`, catches errors, finally calls `recordSchedulerCycle({ key: "costantino-data-custodian", notes: { cadence_ms_used } })`.
  5. `isRunning` boolean concurrency guard against accidental double-fires.
- `SOURCE = "costantino-data-custodian"`. No `CYCLE_INTERVAL_MS` module-level constant — cadence is dynamic.
- `startCostantinoScheduler()` exports the lazy-import target.
- `index.ts` Phase 3l hook (immediately after Phase 3k Vito):
  ```ts
  // ── Phase 3l: Costantino data-custody scheduler (cadence admin-editable) ────────
  import("./jobs/costantino-scheduler").then(({ startCostantinoScheduler }) => {
    startCostantinoScheduler();
  });
  ```

**Patterns to follow:**
- `vito-compliance-scheduler.ts` for shape (startup delay, concurrency guard, recordSchedulerCycle), but **swap `setInterval` for self-rescheduling `setTimeout` chain** so cadence reads dynamically per cycle
- `index.ts` Phase 3k block for the exact import-then-call shape
- `llm-config-resolver.ts` for the "read config from admin_resources at use time" pattern

**Test scenarios:**
- *Happy path:* `restart_workflow artifacts/api-server: API Server` → log shows `[costantino-data-custodian] Starting — initial run in 120s, then cadence read from admin_resources (seed 5 days)`.
- *Happy path:* After 120s, log shows `[costantino-data-custodian] Cycle starting — cadence_ms=432000000 (5 days)` then `Cycle complete — N admin_resources probed, M findings written, next tick in 5 days`.
- *Happy path admin-edit:* Update `admin_resources` cadence row to 60000 (1 minute) via SQL → next cycle log line shows `cadence_ms=60000 (1 minute)` and the following tick fires after 1 minute, not 5 days.
- *Edge case (clamp low):* Set cadence row to 100ms → log warns `cadence 100ms below floor; using 60000ms`, scheduler waits 1 minute.
- *Edge case (clamp high):* Set cadence row to 999 days → log warns `cadence above ceiling; using 30 days`, scheduler waits 30 days.
- *Edge case (missing row):* Delete cadence row → log warns `cadence row missing; using fallback 5 days`, scheduler waits 5 days.
- *Edge case (DB error during cadence read):* Mock SELECT failure → log warns `cadence read failed; using fallback 5 days`, scheduler waits 5 days; cycle still runs.
- *Edge case (overlap):* Direct second call before first completes → second call no-ops with "Cycle already in progress — skipping".
- *Error path:* Cycle throws — log captures error, scheduler-run-tracker records `status=error`, next tick still scheduled at current cadence.
- *Integration:* `SELECT * FROM scheduler_run_tracker WHERE key='costantino-data-custodian' ORDER BY created_at DESC LIMIT 1` shows the run with `notes.cadence_ms_used` after the first tick.

**Resilience notes (self-rescheduling setTimeout chain):**
- (a) **Restart mid-cycle:** No durable state on the timer. On next boot, Phase 3l hook re-fires; scheduler waits `STARTUP_DELAY_MS` and resumes. In-flight cycle is lost (next-tick was never scheduled), which is fine — the post-restart cycle is the resumed cycle.
- (b) **Cycle longer than cadence** (e.g. cadence=30s, cycle takes 60s): The `setTimeout` for next tick is scheduled in the `finally` block AFTER the cycle completes — never during. So the next tick fires `cadence_ms` after cycle-completion, not after cycle-start. `isRunning` guard prevents overlap if a manual-trigger path is added later. Effective real cadence in this pathological case = `cycle_duration + cadence_ms`. Acceptable; documented.
- (c) **Process exit during the setTimeout wait:** Chain is non-durable (in-memory only). Phase 3l hook on next boot restarts the chain after `STARTUP_DELAY_MS`. No work is lost since cycles are stateless.
- (d) **No timer accumulation:** Single chain — exactly one outstanding `setTimeout` handle at any moment. No memory leak risk.
- (e) **Downtime backfill:** Not implemented. If multiple ticks "should have" fired during downtime, Costantino runs once on resume and continues from there. Acceptable for slow-moving health data; not acceptable for transactional work (out of Step 0 scope).

**Verification:**
- `pnpm run typecheck` clean.
- `pnpm --filter @workspace/scripts run check:magic-numbers` clean.
- Workflow log shows Costantino first tick + cycle complete on dev with cadence reported.
- `GET /api/admin/resources` on dev shows previously-RED rows now reflect actual health within one cycle.
- **Admin-edit verification:** Temporarily set cadence row to 60000ms via SQL, observe two consecutive 1-minute ticks in the log, then restore to 5 days.

---

### U6. Skill + docs capture

**Goal:** Make Costantino discoverable to future agents and to humans reading the repo.

**Requirements:** R9

**Dependencies:** U1–U5 (so the skill describes what was actually shipped)

**Files:**
- Create: `.agents/skills/costantino-data-custodian/SKILL.md`
- Modify: `CLAUDE.md` — add Costantino to agent roster, add `### Costantino — Data Custodian` Architecture Notes subsection, add Recent Significant Changes entry (drop oldest of the existing 3)
- Modify: `replit.md` — add Pointers row, add Recent Changes entry (drop oldest)

**Approach:**
- New skill follows the structure of `.agents/skills/specialist-persona-naming/SKILL.md`: charter, agent-native principles applied, system-prompt design notes, tool primitives list, expansion protocol for Steps 1–6, anti-patterns to avoid (e.g. "do not move probe-recipe logic into TS").
- `CLAUDE.md` agent-roster table gets a new row. The Architecture Notes subsection explains the side-by-side relationship with `resource-health-checker.ts` and the planned Step-1 retirement.
- `replit.md` Pointers table gets `| Costantino agent (data custody) | costantino-data-custodian skill |`.

**Test scenarios:**
- *Verification only:* `CLAUDE.md` Recent Significant Changes still ≤ 3 entries.
- *Verification only:* `replit.md` Recent Significant Changes still ≤ 3 entries.
- *Verification only:* New skill has the standard `description:` frontmatter so `skillSearch` can find it.

**Verification:**
- Manual diff review.
- `rg -n "Costantino" CLAUDE.md replit.md` shows the agent surfaces in both files.

---

## System-Wide Impact

- **Interaction graph:** Costantino reads `admin_resources` (read+write `last_health_status`/`last_health_message`/`config_json`), writes `costantino_findings`, reads `scheduler_run_tracker` indirectly via `recordSchedulerCycle`, calls `callLlm` (which logs to `llm_calls`). No interaction with property data, slide pipeline, or Rebecca chat in Step 0.
- **Error propagation:** Tool errors stay inside the agent loop as structured `{ error }` results. Cycle-level errors are caught by the scheduler's try/finally and surfaced via `recordSchedulerCycle({ status: "error", notes })`. No exception escapes to the api-server top level.
- **State lifecycle risks:** `admin_resources.last_health_status` has two writers in Step 0 (legacy `resource-health-checker.ts` and Costantino). Last-writer-wins is acceptable because both writers are column-scoped and Costantino's 5-day cadence interleaves rarely with the legacy 60s tick; the only visible effect is that Costantino's verdict (real probe) overwrites the legacy verdict (env-var presence) for ~one minute every 5 days, which is the desired direction. Admin lowering cadence for debugging makes Costantino's verdict dominate more often — also desired.
- **API surface parity:** No new public HTTP routes in Step 0. `GET /api/admin/resources` returns the same shape with more accurate `last_health_status` values.
- **Integration coverage:** First Costantino tick fires real HTTP probes against every configured integration. This is observable in each integration's request logs (Perplexity/Tavily/Exa/etc) — desired but worth noting.
- **Unchanged invariants:** `resource-health-checker.ts` behavior, all Pietro/Vito/Gustavo/Marco/Rebecca code paths, all property-fact tables, all slide-pipeline tables, all auth/session behavior, the migration journal sync mechanism.

---

## Risks & Dependencies

| Risk | Mitigation |
|---|---|
| Costantino's first probe blasts all integrations at once and trips a rate limit | Cadence is 5 days by default; probes are sequential within a tick; each is a single GET. Total probe count ≤ ~15 per cycle. Far below any free-tier limit. |
| 5-day cadence delays detection of new integration breakages | Mitigated by Step 5 "Run Costantino now" admin button (the primary escape hatch). Until Step 5 ships, an admin can SQL-update the `admin_resources` parameter row (`slug='costantino-health-cycle-interval-ms'`) to a small value (e.g. 60000ms), wait for the next tick to fire, then restore to 432000000ms (5 days). The self-rescheduling chain picks up the new cadence on the very next tick. |
| LLM loop loops forever | `DEFAULT_COSTANTINO_MAX_TOOL_DEPTH = 12` cap; explicit `complete_task` requirement in system prompt. |
| Probe accidentally logs a secret | `probe_integration_endpoint` reads the secret only into the `Authorization` header value at request-build time; never assigns it to a logged variable; tool result `error` strings are sanitized. Code review must enforce. |
| Two writers race on `admin_resources.last_health_status` | Both are idempotent and column-scoped. Last-writer-wins is the desired outcome; legacy retires in Step 1. |
| Migration fails on prod (e.g. `gen_random_uuid()` extension missing) | Drizzle journal applies on prod startup with rollback on error per existing CLAUDE.md migration discipline; verify `pgcrypto`/`uuid-ossp` present (they are — used by `properties.id`). |
| Costantino's model-resolver row missing in admin_resources on prod | Migration U1 seeds it idempotently. Failure mode: `runCostantinoAgent` throws on `resolveLlmFor`, scheduler catches, marks cycle error — non-fatal to api-server. |
| Cost overrun from per-tick LLM call | Costantino runs every 5 days = ~0.2 calls/day at default cadence. At ~3K output tokens with Claude Sonnet, cost is rounding-error per month. Even if an admin temporarily lowers cadence to 1 minute for debugging, capped exposure is ≤ $5/day until restored. |

---

## Verification & Rollout (dev + prod)

### Dev verification (pre-merge)

1. `pnpm run typecheck` — clean.
2. `pnpm --filter @workspace/scripts run check:magic-numbers` — clean.
3. `pnpm --filter @workspace/scripts run check:migration-guards` — clean.
4. `pnpm --filter @workspace/scripts run check:schema-drift` — clean.
5. `pnpm run check:lint` — clean.
6. `restart_workflow artifacts/api-server: API Server` — log shows Phase 3l Costantino hook starting and the cadence read (initial 5 days).
7. **Temporarily lower cadence for verification** so we don't wait 5 days: `psql $POSTGRES_URL -c "UPDATE admin_resources SET config_json = jsonb_set(config_json, '{value_ms}', '60000'::jsonb) WHERE slug='costantino-health-cycle-interval-ms'"`.
8. Wait `DEFAULT_COSTANTINO_STARTUP_DELAY_MS` (~2 min) for first tick, then ~1 min for the second tick. Log shows two `Cycle complete` lines with `cadence_ms=60000 (1 minute)`.
9. **Restore cadence:** `psql $POSTGRES_URL -c "UPDATE admin_resources SET config_json = jsonb_set(config_json, '{value_ms}', '432000000'::jsonb) WHERE slug='costantino-health-cycle-interval-ms'"`. Confirm next-tick log line shows `cadence_ms=432000000 (5 days)`.
10. `curl -b <auth> localhost:80/api/admin/resources` — confirms previously-RED rows now show accurate statuses (mix of OK / key_invalid / rate_limited).
11. `psql $POSTGRES_URL -c "SELECT count(*), severity FROM costantino_findings GROUP BY severity"` — non-zero rows with appropriate severities.
12. `psql $POSTGRES_URL -c "SELECT created_at, status, notes->>'cadence_ms_used' AS cadence_used FROM scheduler_run_tracker WHERE key='costantino-data-custodian' ORDER BY created_at DESC LIMIT 5"` — last cycles have `status='ok'` or `status='warn'`, and `cadence_used` reflects the temporary 60000 then 432000000.

### Pull Request (between dev verification and prod rollout)

After all dev verification steps pass, ship via the `ce-commit-push-pr` skill (read `.agents/skills/ce-commit-push-pr/SKILL.md` first). Manual `git push` / `gh pr create` is acceptable as fallback if the skill is unavailable; the structure below is identical either way.

- **Branch name:** `feat/costantino-data-custodian-step0`
  - Created from `main`, single branch for all six implementation units (U1–U6). Do **not** spread across multiple PRs — Step 0 is one cohesive primitive (agent + scheduler + migration + skill) and each piece is non-functional without the others.
- **Commit strategy:** One squash-able PR. Implementation may be multiple commits per unit (U1, U2, …, U6) for review readability, but the merge to `main` is a single squash commit. Conventional commit type = `feat`. Subject line: `feat(api-server): add Costantino data-custodian agent (Step 0)`.
- **PR title:** `feat: Costantino — Data Custodian (Step 0: agent-native skeleton + admin_resources health probe)`
- **PR body skeleton** (fill in during PR creation; the skill auto-drafts most of this from the diff + plan):

  ```markdown
  ## What ships
  Costantino — first agent in the data-custody roster. Step 0 of a 7-step plan.

  - New agent at `artifacts/api-server/src/ai/costantino/{agent,tools,workspace}.ts`
  - New scheduler at `artifacts/api-server/src/jobs/costantino-scheduler.ts` (Phase 3l in `index.ts`)
  - New table `costantino_findings` (migration `00NN_costantino_findings.sql`)
  - New `admin_resources` rows: `kind='llm_slot' slug='costantino-orchestration'` + `kind='parameter' slug='costantino-health-cycle-interval-ms'` (initial 5 days, admin-editable)
  - Probe recipes seeded into `admin_resources.config_json.healthProbe` per integration
  - New skill `.agents/skills/costantino-data-custodian/SKILL.md`
  - Updates to `CLAUDE.md` and `replit.md` (Recent Significant Changes — drop oldest)

  ## Plan
  Full plan + agent-native architecture review: `docs/plans/2026-05-09-007-feat-costantino-data-custodian-step0-plan.md`

  ## Requirements satisfied
  R1–R10 (see plan § Requirements). Each verified in dev — log evidence below.

  ## Verification evidence (dev)
  - [ ] All 12 dev-verification steps pass (paste log snippets — Phase 3l boot line, two `Cycle complete` lines, restored cadence line, admin_resources status distribution, findings count, scheduler_run_tracker rows)
  - [ ] All seven `check:*` workflows green (typecheck, lint, magic-numbers, migration-guards, schema-drift, replit-independence, types-mirror)

  ## Agent-native architecture
  Cadence is data, not code (admin_resources parameter). Tools are atomic primitives, not workflow tools. Behavior in system prompt, not TS conditionals. Full review in plan § Agent-Native Architecture Review.

  ## Risks & rollback
  See plan § Risks & Dependencies and § Rollback. Fast-disable: comment Phase 3l hook + redeploy. Migration is reversible.

  ## Prod rollout
  Auto-deploy on merge. Prod verification is agent-owned (not human-owned) per plan § Prod verification — temporarily lower cadence to 60s, observe two ticks, restore to 5 days.

  ## Out of scope (deferred)
  Steps 1–6 of the 7-step plan — see plan § Scope Boundaries.
  ```

- **Required PR checks (all must be green before merge):**
  - `check:typecheck`, `check:lint`, `check:magic-numbers`, `check:migration-guards`, `check:schema-drift`, `check:replit-independence`, `check:types-mirror`, `check:production-image`, `check:spinner-contrast`, `test:calc` (existing CI workflows; no new check added in Step 0)
- **Required PR review:** `nai-code-review` skill (per `replit.md` Pointers table). Reviewer focus areas to call out in the PR body: (1) no hardcoded numbers/slugs, (2) no secret leakage in probe error strings, (3) self-rescheduling setTimeout chain ordering correctness, (4) migration reversibility, (5) parity-map updated if any new tool surface is reachable from UI in Step 0 (it isn't — confirm).
- **Linear ticket linkage:** If a Linear issue exists for the data-custody initiative, reference it in the PR body footer (`Closes ENG-NNNN` or `Refs ENG-NNNN`). If none exists yet, the `linear` integration is configured — create one before opening the PR titled "Costantino — Data Custodian (Step 0)".
- **Demo reel:** Not required — Step 0 has no UI surface. (Step 5 PR will need one per `ce-demo-reel` skill.)
- **Merge gate:** Do NOT click merge until (a) all checks green, (b) one human approval, (c) verification evidence pasted into the PR body. The merge itself triggers prod auto-deploy on Railway, so treat merge = prod release.

### Prod rollout

1. Merge the PR to `main` — Railway deploys api-server image automatically.
2. Migration `00NN_costantino_findings.sql` auto-applies on prod startup via Drizzle journal.
3. Phase 3l hook fires on prod startup; Costantino scheduler waits `DEFAULT_COSTANTINO_STARTUP_DELAY_MS`.
4. First prod tick runs ~2 minutes after deploy.

### Prod verification (post-deploy, agent-owned not human-owned)

0. **Temporarily lower prod cadence for verification** (don't wait 5 days for the first scheduled tick): `psql $PROD_POSTGRES_URL -c "UPDATE admin_resources SET config_json = jsonb_set(config_json, '{value_ms}', '60000'::jsonb) WHERE slug='costantino-health-cycle-interval-ms'"`. Wait ~2 min STARTUP_DELAY + 2 min for two ticks, then **restore**: `UPDATE … '{value_ms}', '432000000'`. Confirm next-tick prod log line shows `cadence_ms=432000000 (5 days)`.
1. `curl -b <prod-auth> https://<prod-domain>/api/admin/resources` after the verification ticks — confirm `last_health_status` distribution mirrors dev shape (not 96 RED).
2. Hit prod `GET /api/admin/observability/scheduler-runs?key=costantino-data-custodian&limit=5` — confirm last cycles have status `ok` or `warn` and `notes.cadence_ms_used` reflects the temporary 60000 then 432000000.
3. Spot-check one finding via `GET /api/admin/...` (or `psql $PROD_POSTGRES_URL`) to confirm `evidence` JSONB contains real probe response data.
4. Compare prod and dev `admin_resources` health distribution side-by-side — they should match in shape (same integrations report same statuses; differences only where dev/prod actually differ on secrets or quotas).

### Rollback

If Costantino misbehaves on prod:
1. **Fast disable (no deploy):** comment out the Phase 3l import in `index.ts` and re-deploy. Scheduler stops on next restart.
2. **Mid-flight kill:** Costantino tools are read-only on `admin_resources` columns and append-only on `costantino_findings`. Worst-case state is stale `last_health_status` (recovers on next legacy `resource-health-checker.ts` tick which still runs side-by-side).
3. **Migration rollback:** Down migration drops `costantino_findings` and removes seeded `llm_slot` row. Safe because no other code reads from these in Step 0.

---

## Sources & References

- `docs/plans/2026-05-08-002-feat-pietro-data-infrastructure-plan.md` — peer-agent pattern (Pietro)
- `docs/plans/2026-05-09-006-feat-vito-compliance-agent-plan.md` — most direct adjacent plan (peer audit-shaped agent + scheduler)
- `.agents/skills/ce-agent-native-architecture/SKILL.md` — architecture lens applied throughout
- `.agents/skills/inflation-cascade/SKILL.md` — source-attribution discipline mirrored in `evidence` JSONB
- `.agents/skills/prefer-external-dependencies/SKILL.md` — Costantino probes existing external endpoints, no Replit-managed services
- `.agents/skills/replit-independence/SKILL.md` — same code path on dev (Replit) and prod (Railway)
- `CLAUDE.md` §1 (number-taxonomy law), §"Inviolable login/auth rules", "Migration system architecture"
