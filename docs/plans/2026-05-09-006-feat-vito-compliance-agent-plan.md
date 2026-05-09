---
title: "feat: Vito — Compliance Audit Agent for Number Taxonomy, admin_resources Parity, and KB Coverage"
type: feat
status: completed
date: 2026-05-09
---

# feat: Vito — Compliance Audit Agent

## Summary

Introduces **Vito**, a scheduled background audit agent that enforces H+ Analytics' three compliance contracts: (1) no hardcoded integration identifiers or magic numbers in source code, (2) every runtime-configurable value has a corresponding `admin_resources` DB row, and (3) important financial domain knowledge is indexed in the KB vector store for Rebecca to retrieve. Vito runs weekly on a scheduler (matching the Iris reindex cadence), writes structured violations to a new `compliance_violations` DB table, and surfaces findings in a new Admin > Compliance tab. Unlike the existing `check-magic-numbers.ts` static analysis script (which catches syntax-level raw literals as a hard deploy gate), Vito adds *semantic* compliance: understanding whether a named constant belongs in the DB, whether a financial benchmark exists only in code but should be KB-indexed, and whether `admin_resources` rows are actually used vs. shadowed by local copies.

---

## Problem Frame

Three rules in CLAUDE.md are routinely violated as the codebase grows, and none are caught until a human notices or a deploy gate fires at a bad moment:

- **§1**: LLM model names and API slugs appear as TypeScript string constants in agent files (confirmed: `IRIS_HAIKU_MODEL`, `PIETRO_SONNET_MODEL` — two active violations pre-dating this plan).
- **§2**: Financial constants that should be `admin_resources parameter` rows (conviction thresholds, pixel-diff gates) accumulate in source as the path of least resistance.
- **§6**: The KB vector store drifts from the domain knowledge encoded in code — financial benchmarks are hardcoded in `constants-benchmarks.ts` but not indexed so Rebecca cannot retrieve the underlying reasoning.

The existing gate (`check-magic-numbers.ts`) catches raw numeric literals but cannot reason about *why* a constant exists or *where* it should live. An LLM agent can.

---

## Requirements

- R1. Vito scans source files for integration identifiers (model slugs, API slugs, endpoint URLs) that appear as string literals or named string constants outside `admin_resources`.
- R2. Vito cross-references `admin_resources` rows against actual code usage — flags rows with no resolver call and flags code with no corresponding row.
- R3. Vito checks KB coverage: for each major financial domain constant in `constants-benchmarks.ts`, a KB entry should exist.
- R4. Violations are persisted to `compliance_violations` and `vito_runs` DB tables.
- R5. A new Admin > Compliance tab displays violations by severity, with resolution and accept-as-known actions.
- R6. Vito is registered with `scheduler-run-tracker.ts` and fires weekly; results appear on the Observability page alongside Pietro and Iris.
- R7. Vito never modifies source code or application data — it is read-only except for writing to its own output tables.

---

## Scope Boundaries

- Vito **does not fix** violations — it reports them. Automated refactoring is out of scope.
- Vito does **not replace** `check-magic-numbers.ts` — the static gate stays. Vito is the early-warning system between releases.
- No Linear/GitHub issue creation in v1 — violation records in DB are sufficient; issue creation is a follow-up.
- Vito does not scan `lib/engine/` or `lib/calc/` for magic numbers (the existing script covers those).

### Deferred to Follow-Up Work

- Auto-filing Linear issues for `critical` violations: follow-up to U4
- Slack notification on new critical violations: follow-up to U6
- Vito suggestion mode (proposes the DB row that should exist): follow-up, requires careful prompt design

---

## Context & Research

### Relevant Code and Patterns

- `artifacts/api-server/src/jobs/scheduler-run-tracker.ts` — `SCHEDULER_REGISTRY` `as const` array; add Vito's weekly entry here. `recordSchedulerCycle()` for end-of-run upsert.
- `artifacts/api-server/src/jobs/specialist-quality-recompute.ts` — canonical job file pattern: `let schedulerInterval`, exported `startVito()` / `stopVito()`, `setInterval` trigger, `recordSchedulerCycle` call at end.
- `artifacts/api-server/src/ai/pietro/` (`agent.ts`, `tools.ts`, `workspace.ts`) — three-file agent structure to follow.
- `artifacts/api-server/src/ai/iris/agent.ts` — `IrisTrigger` union + `runIrisAgent(trigger)` export pattern.
- `lib/db/src/schema/scheduler-runs.ts` — `scheduler_runs` schema and upsert pattern.
- `lib/db/src/schema/intelligence.ts` line 240 — `analystRefreshAuditLog` as reference for an append-only violations log.
- `artifacts/hospitality-business-portal/src/components/admin/ObservabilityTab.tsx` — shows scheduler run cards; Vito entries appear here automatically once registered.
- `scripts/src/check-magic-numbers.ts` — existing static analysis; Vito complements it, does not replace it.
- `lib/shared/src/constants-benchmarks.ts` — primary scan target for KB coverage gaps.
- `lib/shared/src/constants*.ts` — scan for `DEFAULT_*` constants defined in wrong files.

### Institutional Learnings

- `CLAUDE.md` §1: integration identifiers banned as string literals/constants — Vito enforces this at runtime.
- `CLAUDE.md` §2: four categories only. Vito flags category misclassification.
- `CLAUDE.md` §3: seed files must not contain raw numeric literals.
- Scheduler pattern: never throw from scheduler callback; wrap entire cycle in try/catch and record `status: "error"` on failure.
- One row per scheduler in `scheduler_runs` (upsert) — but `compliance_violations` is append-only per run (violations accumulate; old ones resolved over time).

---

## Key Technical Decisions

- **Vito is a cross-app specialist** (single name, not Name-NN) — it runs across the whole codebase surface, not inside one pipeline.

- **Source file availability in production (Dockerfile constraint):** The Railway runtime container copies `lib/` in full (`COPY --from=build /app/lib ./lib`) but copies only the compiled bundle for `artifacts/api-server/` (`COPY --from=build /app/artifacts/api-server/dist`). Agent source files (`artifacts/api-server/src/ai/iris/agent.ts`, etc.) are NOT present in production. Vito therefore has two operating modes:
  - **Runtime mode** (scheduled in production): scans `lib/shared/src/constants*.ts` and `lib/db/src/schema/` for taxonomy violations; queries `admin_resources` DB for parity; queries `vector_chunks` for KB coverage. These passes always work.
  - **Full mode** (dev / manual trigger only): additionally scans `artifacts/api-server/src/` for integration identifier violations. Only available when the api-server is running against the full source tree (Replit dev, local).
  The scheduled weekly production job runs in runtime mode. Full mode is triggered manually by an admin who's in a dev environment.

- **Integration identifier sweep is CI-complemented:** The `artifacts/api-server/src/` sweep for model name string literals cannot run in production. This pass complements (but does not replace) a future CI linting step. For now, the existing `check-magic-numbers.ts` gate plus the U6 fix in plan 005 are the enforcement mechanism for known violations.

- **Two output tables with fingerprint dedup**: `vito_runs` (append-only, one row per scan) and `compliance_violations` (keyed by `violation_fingerprint` — a deterministic hash of `violationType + file + description`). On each run, new violations are `INSERT`ed; previously-seen violations get their `lastSeenAt` and `lastRunId` updated via upsert on fingerprint. This prevents the same violation from re-pestering admins every week. Resolution state (`resolved_at`, `accepted_at`) lives on the fingerprinted row and survives across runs.

- **Severity maps to the canonical H+ scheme** — no new levels (CLAUDE.md: "ok=emerald, advisory=sky, warning=amber, block=red — no new levels"). Vito uses: `block` (integration identifier in source — §1 violation), `warning` (magic number, DEFAULT_* in wrong file), `advisory` (admin_resources drift — row unused or shadowed), `info` (KB coverage gap — informational, not a rule violation).

- **Model: Sonnet 4.6** via `resolveLlmFor("vito_compliance_audit")` slot.

- **`accept_as_known` resolution state**: admins can mark violations `accepted` with a note (e.g. "intentional fallback — see PR #48"). Accepted violations are suppressed from default view but preserved in DB.

---

## Open Questions

### Resolved During Planning

- *Can Vito read source files in production?* Partially. `lib/` source is present (`COPY --from=build /app/lib ./lib` in Dockerfile). `artifacts/api-server/src/` is NOT — only the compiled bundle is copied. Runtime mode scans `lib/` only; full mode scans `artifacts/` and requires a dev environment.
- *Should `compliance_violations` be append-only or upsert?* Upsert on `violation_fingerprint` (hash of violationType + file + description). New violations are inserted; existing ones get `lastSeenAt` + `lastRunId` updated. Prevents weekly re-pestering of resolved violations.
- *Two tables or one?* Two — `vito_runs` (one row per scan, audit trail) and `compliance_violations` (fingerprinted, resolvable). Matches the pattern of `scheduler_runs` + per-scheduler output tables.
- *Does `vector_chunks` have queryable metadata?* Yes — confirmed `metadata jsonb` field at schema line 35. KB domain query reads `metadata->>'category'` grouping.

### Deferred to Implementation

- Which source file paths are accessible in the Railway production container — verify actual bundle layout at implementation time.
- Whether Vito needs a workspace file (like Pietro's `workspace.ts`) or whether DB-only output is sufficient — decide at implementation time based on whether a markdown health report is useful alongside the structured DB rows.

---

## High-Level Technical Design

> *Directional guidance, not implementation specification.*

```
[Weekly scheduler tick]  trigger="scheduled-audit"  mode="runtime"
        ↓
runVitoAgent(trigger, mode)
        ↓
  Pass 1 (runtime): scan_lib_constants()  ← lib/ always present in container
        → finds DEFAULT_* in wrong files, taxonomy misclassification
        → write_violations(warning | advisory)
        ↓
  Pass 2 (runtime): list_admin_resources() + list_resolver_call_sites()
        → cross-reference: slots with no resolver call (orphaned rows)
        → cross-reference: resolver calls with no admin_resources row (missing rows)
        → write_violations(advisory: drift)
        ↓
  Pass 3 (runtime): list_kb_entry_domains()
        → compare against known benchmark domains in lib/shared/src/constants-benchmarks.ts
        → write_violations(info: KB gaps)
        ↓
  [Full mode only — skipped in scheduled runtime]
  Pass 4 (full): scan_agent_source_files(artifacts/api-server/src/)
        → finds model string literals, API slugs, endpoint URL constants
        → write_violations(block: integration identifier violations)
        ↓
  recordSchedulerCycle(key: "vito-compliance-audit", ...)
  finalize vito_runs row
```

**Admin panel Compliance tab:**
```
Admin > Compliance
  ┌─ Summary bar ─────────────────────────────────┐
  │  1 block  ·  3 warning  ·  5 advisory  ·  2 info │
  │  Last scan: 2026-05-09 (runtime mode)          │
  │  Next: 2026-05-16  [Run Full Audit]            │
  └───────────────────────────────────────────────┘
  ┌─ Violations table ───────────────────────────────────────────────────┐
  │ Sev      File                           Description         Actions  │
  │ BLOCK    ai/iris/agent.ts:23  (full)    Model string        Fix · ✓  │
  │ WARNING  lib/shared/constants.ts:99     Magic number        Fix · ✓  │
  │ ADVISORY admin_resources: iris_reindex  Row unused          View · ✓ │
  │ INFO     constants-benchmarks.ts:14     No KB entry         KB  · ✓  │
  └─────────────────────────────────────────────────────────────────────┘
  Note: BLOCK violations require Full Audit (dev/manual trigger).
```

---

## Implementation Units

- U1. **compliance_violations and vito_runs DB tables**

**Goal:** Persistent storage for Vito's findings and run history, with resolution tracking.

**Requirements:** R4

**Dependencies:** None

**Files:**
- Create: `lib/db/src/schema/compliance.ts`
- Modify: `lib/db/src/schema/index.ts` (add export)
- Generate migration: `lib/db/migrations/<next>_compliance_tables.sql`

**Approach:**
- `vito_runs`: append-only, one row per scan. Columns: `id`, `trigger` (text: `"scheduled-audit"` | `"manual"` | `"manual-full"`), `mode` (text: `"runtime"` | `"full"`), `passesCompleted` (int 0–4), `blockCount`, `warningCount`, `advisoryCount`, `infoCount`, `status` (ok/warn/error), `notes`, `durationMs`, `createdAt`.
- `compliance_violations`: one row per unique violation, keyed by `violationFingerprint` (deterministic hash: `sha256(violationType + ":" + file + ":" + description)`). Columns: `id`, `violationFingerprint` (text, unique), `violationType` (text: `"integration_identifier"` | `"magic_number"` | `"admin_resources_drift"` | `"kb_gap"`), `severity` (`"block"` | `"warning"` | `"advisory"` | `"info"` — canonical H+ severity scheme, CLAUDE.md convention), `file` (text), `lineHint` (int nullable), `description` (text), `suggestedFix` (text nullable), `firstSeenAt` (timestamp), `lastSeenAt` (timestamp), `lastRunId` (int FK → vito_runs), `resolvedAt` (timestamp nullable), `resolvedBy` (int FK → users nullable), `acceptedAt` (timestamp nullable), `acceptedNote` (text nullable).
- Upsert strategy: `INSERT ... ON CONFLICT (violation_fingerprint) DO UPDATE SET last_seen_at = NOW(), last_run_id = excluded.last_run_id`.
- Index on `(severity, resolved_at, accepted_at)` for the admin tab query.

**Patterns to follow:**
- `lib/db/src/schema/intelligence.ts` `analystRefreshAuditLog` for append-only violation log structure.
- `lib/db/src/schema/scheduler-runs.ts` for run-tracker table.
- Schema change workflow from CLAUDE.md §Migration system architecture.

**Test scenarios:**
- Happy path: migration runs cleanly on fresh DB — both tables created
- Happy path: insert a `vito_runs` row, then insert `compliance_violations` with FK → verify FK constraint
- Edge case: insert violation with `resolvedAt` set and `acceptedAt` set — both allowed simultaneously

**Verification:**
- `pnpm --filter @workspace/db run generate` produces correct migration SQL
- `pnpm --filter @workspace/scripts run check:migration-guards` — PASS
- `pnpm run typecheck` — PASS

---

- U2. **Vito agent core and tools**

**Goal:** The LLM agent that executes the three-pass compliance audit and writes findings to DB.

**Requirements:** R1, R2, R3, R7

**Dependencies:** U1

**Files:**
- Create: `artifacts/api-server/src/ai/vito/agent.ts`
- Create: `artifacts/api-server/src/ai/vito/tools.ts`
- Create: `artifacts/api-server/src/ai/vito/workspace.ts`

**Approach:**

*`tools.ts`* — Six tools:
- `scan_lib_constants(patterns?: string[])`: reads `lib/shared/src/constants*.ts` and `lib/db/src/constants*.ts` (always present in production container). Returns lines matching patterns or flags DEFAULT_* defined outside canonical files. Non-LLM file I/O.
- `scan_agent_source_files(patterns: string[])`: reads `artifacts/api-server/src/ai/` and `artifacts/api-server/src/routes/` for integration identifier patterns. Returns `{ file, lineNumber, lineContent }[]`. Preflight check: if path not readable, returns `{ unavailable: true }` — agent skips Pass 4 and notes "runtime mode, source unavailable."
- `list_admin_resources(kind?: string)`: queries `admin_resources` table, returns rows grouped by kind. Read-only.
- `list_resolver_call_sites()`: scans `lib/` files for calls to `resolveLlmFor()`, `getAdminResourceBySlug()`, `getParameterValue()` — returns `{ file, slot }[]`. (Resolver calls in agent files in `artifacts/` cannot be scanned in runtime mode — noted as a known gap.)
- `list_kb_entry_domains()`: queries `vector_chunks` table for distinct `metadata->>'category'` groupings and counts — returns domain coverage summary without fetching content.
- `write_violation(runId, violationType, severity, file, lineHint, description, suggestedFix?)`: upserts into `compliance_violations` on `violation_fingerprint`. Severity must be one of `"block" | "warning" | "advisory" | "info"`. Returns upserted row ID and whether it was new or updated.

*`agent.ts`* — `runVitoAgent(trigger)`:
- Resolves model via `resolveLlmFor("vito_compliance_audit")` (U3 seeds this slot).
- Creates a `vito_runs` row at start, updates at end.
- System prompt instructs Vito to run three passes in order, call `write_violation` for each finding, and NOT suggest code fixes inline (keep report factual and brief).
- Tool loop depth: max 20 (three passes × up to 5–6 tool calls each, plus writes).
- Low temperature (0.1) — deterministic auditor, no creativity.

*`workspace.ts`* — Helpers: `createVitoRun(trigger)`, `finalizeVitoRun(runId, summary)`, `getLatestVitoRun()`.

**Patterns to follow:**
- `artifacts/api-server/src/ai/pietro/agent.ts` — `runPietroAgent(trigger)` structure, tool loop, error handling.
- `artifacts/api-server/src/ai/iris/tools.ts` — `ingest_document` as model for a tool that does file I/O.

**Test scenarios:**
- Happy path: `runVitoAgent("manual")` with stubbed tools → completes three passes, creates `vito_runs` row with `passesCompleted: 3`
- Happy path: `scan_source_files` with a known violation pattern → returns matching lines
- Happy path: `list_resolver_call_sites()` → returns at least the specialist `resolveLlmFor` call sites
- Error path: `write_violation` with invalid FK runId → error surfaced in tool result, agent continues other passes
- Error path: source file not readable → tool returns empty array, agent notes in run summary, does not throw
- Integration: full agent run on real codebase → finds at least the two known `IRIS_HAIKU_MODEL` / `PIETRO_SONNET_MODEL` violations

**Verification:**
- `runVitoAgent("manual")` completes without throwing
- At least `critical` violations found for known violations in `iris/agent.ts` and `pietro/agent.ts` (pre-U6 of the parity plan)
- `pnpm run typecheck` — PASS

---

- U3. **Scheduler registration and weekly trigger**

**Goal:** Vito fires weekly via the existing scheduler infrastructure and appears on the Observability page.

**Requirements:** R6

**Dependencies:** U2

**Files:**
- Modify: `artifacts/api-server/src/jobs/scheduler-run-tracker.ts` (add Vito to `SCHEDULER_REGISTRY`)
- Create: `artifacts/api-server/src/jobs/vito-compliance-scheduler.ts`
- Modify: `artifacts/api-server/src/index.ts` (or wherever schedulers are started — add `startVitoScheduler()`)
- Modify (seed): admin_resources seed file — add `llm_slot` row for `vito_compliance_audit` pointing to Sonnet

**Approach:**
- Add to `SCHEDULER_REGISTRY`:
  ```
  { key: "vito-compliance-audit", label: "Vito Compliance Audit",
    cycleIntervalMs: 7 * 24 * 60 * 60 * 1000,  // weekly
    description: "Weekly compliance audit: integration identifier sweep, admin_resources parity check, and KB coverage gap detection." }
  ```
- `vito-compliance-scheduler.ts`: follows `specialist-quality-recompute.ts` pattern exactly — `let schedulerInterval`, `startVitoScheduler()`, `stopVitoScheduler()`, try/catch wrapper, `recordSchedulerCycle()` call at end.
- Seed `llm_slot` row: `slug: "vito_compliance_audit"` → existing Sonnet model row (no hardcoded string in agent.ts — U2 uses `resolveLlmFor`).

**Patterns to follow:**
- `artifacts/api-server/src/jobs/specialist-quality-recompute.ts` — complete scheduler job pattern.

**Test scenarios:**
- Happy path: `startVitoScheduler()` registers interval; `stopVitoScheduler()` clears it
- Happy path: scheduler fires → `runVitoAgent("scheduled-audit")` called → `recordSchedulerCycle` called with result
- Error path: `runVitoAgent` throws → scheduler catches, records `status: "error"`, does not crash the process
- Test expectation: none for Observability page display — automatic once `SCHEDULER_REGISTRY` entry is added

**Verification:**
- `SCHEDULER_REGISTRY` contains `"vito-compliance-audit"` key
- Vito entry visible in Admin > Observability scheduler cards
- `pnpm run typecheck` — PASS

---

- U4. **Admin > Compliance tab**

**Goal:** Admins can view current violations, trend history, and mark violations as resolved or accepted.

**Requirements:** R5

**Dependencies:** U1, U3

**Files:**
- Create: `artifacts/hospitality-business-portal/src/components/admin/ComplianceTab.tsx`
- Modify: `artifacts/hospitality-business-portal/src/components/admin/AdminSidebar.tsx` (add Compliance entry)
- Create (API): `artifacts/api-server/src/routes/admin/compliance.ts` (violations list + resolve/accept endpoints)
- Modify: `artifacts/api-server/src/routes/admin/index.ts` (mount compliance routes)

**Approach:**
- Three API endpoints:
  - `GET /api/admin/compliance/violations?severity=&resolved=false` — paginated violations list
  - `POST /api/admin/compliance/violations/:id/resolve` — marks resolved
  - `POST /api/admin/compliance/violations/:id/accept` — marks accepted with note
- `ComplianceTab.tsx`:
  - Summary bar: colored severity counts (critical=red, high=amber, medium=sky, low=emerald) + last-run timestamp
  - Filter chips: All / Critical / High / Medium / Low / Resolved
  - Violations table: severity badge, file path (monospace), description, suggested fix (collapsed by default), action buttons
  - "Run audit now" button → `POST /api/admin/compliance/run` (fires `runVitoAgent("manual")` as fire-and-forget, returns immediately)
  - Trend sparkline: violations count over last 8 runs (from `vito_runs`)
- Sidebar: add "Compliance" item under "Intelligence" or "Observability" group in `AdminSidebar.tsx`.

**Patterns to follow:**
- `artifacts/hospitality-business-portal/src/components/admin/ObservabilityTab.tsx` — admin tab structure and scheduler card pattern.
- Severity color mapping: ok=emerald, advisory=sky, warning=amber, block=red — matches existing `AnalystVerdictDisplay` severity convention.

**Test scenarios:**
- Happy path: violations table renders with mock data — severity badges correct colors
- Happy path: "Resolve" button → POST → violation row updates to show resolved state
- Happy path: "Accept as Known" → modal prompts for note → POST → violation marked accepted, disappears from default view
- Happy path: "Run audit now" → spinner shows, resolves when agent completes
- Edge case: zero violations → empty state "No compliance violations found. Last scan: <date>."
- Edge case: Vito has never run → empty state "Compliance audit has not run yet. Click Run Audit to start."

**Verification:**
- Compliance tab accessible in admin panel without errors
- Severity counts match DB query
- `/post-coding-design-review` design gate passes (CLAUDE.md §11)
- `pnpm run typecheck` — PASS

---

- U5. **Manual trigger via Rebecca tool**

**Goal:** Admins can ask Rebecca to "run the compliance audit" — closing agent-native parity for Vito's manual trigger.

**Requirements:** R6 (parity)

**Dependencies:** U2, U3

**Files:**
- Modify: `artifacts/api-server/src/chat/rebecca-tools.ts`

**Approach:**
- Add one tool: `run_compliance_audit()` — admin-only via `requireAdminCtx(ctx)`.
- Fires `runVitoAgent("manual")` as fire-and-forget (same as the "Run audit now" button in U4).
- Returns `dataChanged: { entityType: "compliance_run", entityId: runId }` — add `"compliance_run"` to `DataChangedEntry` union.
- `RebeccaPanel.tsx`: `"compliance_run"` → invalidate `["/api/admin/compliance/violations"]`.
- Update `docs/discipline/agent-native-parity-map.md`: mark `run_compliance_audit` as ✅.

**Patterns to follow:**
- `toolTriggerIrisHealthCheck` — fire-and-forget async tool returning a run ID.

**Test scenarios:**
- Happy path (admin): `run_compliance_audit` → `runVitoAgent` called, returns run ID in `dataChanged`
- Error path (non-admin): returns `{ error: "Admin access required" }`

**Verification:**
- Tool present in schema
- Parity map updated
- `pnpm run typecheck` — PASS

---

## System-Wide Impact

- **Interaction graph:** Vito reads files and DB — purely additive, no effect on existing request paths.
- **Error propagation:** Vito scheduler errors are caught and recorded as `status: "error"` in `scheduler_runs`. A failed Vito cycle never affects Pietro, Iris, or any other scheduler.
- **State lifecycle risks:** `compliance_violations` rows accumulate indefinitely — add a retention policy (delete rows older than 90 days where resolved/accepted) in a follow-up.
- **API surface parity:** `run_compliance_audit` tool in U5 covers the admin panel trigger.
- **Unchanged invariants:** `check-magic-numbers.ts` hard gate is unaffected. Vito is additive, not a replacement.

---

## Risks & Dependencies

| Risk | Mitigation |
|---|---|
| `artifacts/api-server/src/` not present in Railway container (confirmed) | Runtime mode skips Pass 4 gracefully; `scan_agent_source_files` returns `{ unavailable: true }` — agent notes gap in run summary. Full mode (manual trigger in dev) covers Pass 4. |
| Vito run takes >5min (many lib/ files, slow LLM) | Weekly cadence, cap tool loop at 20, per-pass 90s timeout |
| False positives on legitimate string constants in lib/ | System prompt instructs: check against `admin_resources` before flagging — a slug present as a DB row is not a violation |
| `compliance_violations` grows unbounded | Fingerprint udup means violations don't multiply. Add 90-day retention for fully-resolved rows in a follow-up. |
| Resolver call site scan misses `artifacts/` calls in runtime mode | Known gap, documented. DB parity (Pass 2) still catches missing `admin_resources` rows even without call-site scan. |

---

## Documentation / Operational Notes

- Vito's first run will surface the two known pre-existing violations (`IRIS_HAIKU_MODEL`, `PIETRO_SONNET_MODEL`). These will be fixed by the 005 plan U6. Mark as resolved once U6 is deployed.
- After deploying Vito, trigger a manual run immediately via "Run audit now" to baseline the violation count before the scheduled weekly cycle.
- Vito's scheduler entry in `SCHEDULER_REGISTRY` makes it automatically visible in Admin > Observability alongside Pietro and Iris.

---

## Sources & References

- CLAUDE.md §1 (integration identifiers), §2 (number taxonomy), §3 (seed file rule), §6 (institutional knowledge store)
- `artifacts/api-server/src/jobs/scheduler-run-tracker.ts` — scheduler registration pattern
- `artifacts/api-server/src/ai/pietro/agent.ts` — agent structure pattern
- Related plan: `docs/plans/2026-05-09-005-feat-agent-native-parity-improvements-plan.md` — U6 and U7 fix violations Vito will detect
