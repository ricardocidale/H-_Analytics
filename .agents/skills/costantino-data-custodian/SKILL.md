---
name: costantino-data-custodian
description: Costantino is the Data Custodian — a periodic agentic loop that audits every external integration registered in admin_resources (kinds api, source, mcp), records probe outcomes, and opens/closes findings on anomalies. Use when adding a new integration, changing a healthProbe recipe, troubleshooting a red admin_resources row, debugging the costantino_findings backlog, adjusting the audit cadence, or extending Costantino with new tools or finding kinds.
---

# Costantino — Data Custodian

Costantino is one of the H+ Analytics agentic schedulers. He owns one question:

> **Is every integration we depend on actually working right now?**

He answers it by running a periodic agentic loop: catalog → probe → persist → open/resolve findings → write summary. Step 0 (the version this skill documents) covers the agent, the tools, the scheduler, and the findings table. Later steps will add admin UI, Rebecca tool integration, and migration of the existing `resource-health-checker` workload onto Costantino.

## What Costantino owns

| Concern | Where |
|---|---|
| Agent loop | `artifacts/api-server/src/ai/costantino/agent.ts` |
| Tools (8) | `artifacts/api-server/src/ai/costantino/tools.ts` |
| Workspace fs | `artifacts/api-server/src/ai/costantino/workspace.ts` |
| Scheduler | `artifacts/api-server/src/jobs/costantino-scheduler.ts` |
| Findings table | `lib/db/src/schema/costantino.ts` (`costantino_findings`) |
| Migration | `artifacts/api-server/migrations/0048_costantino_findings.sql` |
| Constants | `lib/shared/src/constants.ts` (`DEFAULT_COSTANTINO_*`) |
| Boot hook | `artifacts/api-server/src/index.ts` Phase 3l |
| Scheduler tracker | `artifacts/api-server/src/jobs/scheduler-run-tracker.ts` (`"costantino-data-custodian"` in REGISTRY + DISPATCH) |

## What he does NOT own (Step 0 boundary)

- He does NOT modify `admin_resources` rows beyond writing to `last_health_status` / `last_checked_at` (via `storage.recordProbeResult`).
- He does NOT add or edit healthProbe recipes — admins do.
- He does NOT replace `resource-health-checker.ts` — they run side-by-side in Step 0. Step 1 retires the legacy checker.
- He does NOT have a Rebecca tool yet (Step 2).
- He does NOT have an admin UI yet (Step 1).

## Tool roster

| Tool | When called |
|---|---|
| `list_admin_resources` | First, every cycle. Filters to kinds api/source/mcp by default. |
| `get_probe_recipe` | Read `config.healthProbe` from a single row. |
| `probe_integration_endpoint` | Execute the recipe (HTTP fetch with 15s timeout). Returns ok/degraded/fail + latency. |
| `update_admin_resource_health` | Persist a probe outcome via `storage.recordProbeResult` — atomic `resource_health_checks` insert + parent row update. |
| `write_finding` | Open a row in `costantino_findings`. |
| `list_findings` | Read open/recent findings (default scope `open`). |
| `resolve_finding` | Close a finding (sets `resolved_at`). |
| `complete_task` | **Terminal — always last.** Writes the cycle summary to `costantino/health.md`. |

## Cadence — admin-editable at runtime

The default cadence is **5 days**, set in `DEFAULT_COSTANTINO_HEALTH_CYCLE_INTERVAL_MS` and seeded into the `admin_resources` parameter row `costantino-health-cycle-interval-ms`.

The scheduler re-reads that row at the **start of every cycle** (not just at boot) and clamps to `[DEFAULT_MIN, DEFAULT_MAX] = [60s, 30d]`. To change the cadence in dev or prod, update the row's `config.value_ms` — no restart required:

```sql
UPDATE admin_resources
SET config = jsonb_set(config, '{value_ms}', '60000')
WHERE kind = 'parameter' AND slug = 'costantino-health-cycle-interval-ms';
```

The scheduler uses a **self-rescheduling `setTimeout` chain**, not `setInterval`, precisely so the cadence change takes effect on the next tick.

## Authoring rules

- **No hardcoded model.** The orchestration LLM is resolved at call time via `resolveLlmFor(COSTANTINO_LLM_SLOT)`. To change models, update the `costantino-orchestration` `llm_slot` row.
- **No hardcoded numbers.** Cadence, timeouts, round caps, sampling temperature — all live in `lib/shared/src/constants.ts` as `DEFAULT_COSTANTINO_*`. The SQL seed values must mirror these constants.
- **All health writes go through `storage.recordProbeResult`.** Never write `lastHealthStatus` directly — the band-mapping (ok/degraded/fail → green/amber/red) and the probe-history insert are bound together in a single transaction.
- **All findings are jsonb-evidenced.** When you open a finding, populate `evidence` with the actual probe result (httpStatus, latencyMs, errorCode, errorMessage). Step 1's admin UI will render this.

## Adding a new tool

1. Add the JSON-Schema definition in `getCostantinoTools()` in `tools.ts`.
2. Implement the function (`async function toolMyNewThing(args, metrics)`).
3. Wire it into `dispatchCostantinoTool` in the switch.
4. Add a sentence to the system prompt in `agent.ts` explaining when to call it.
5. If the tool mutates state, update `CostantinoCycleMetrics` and increment in the implementation.

## Adding a new finding kind

1. Add the slug to `FINDING_KINDS` in `tools.ts`.
2. Update the `write_finding` tool's `kind` enum.
3. Document the meaning in the system prompt's responsibility 4 ("Open findings").

### Known finding kinds

- `probe_failed`, `missing_recipe`, `missing_secret`, `schema_mismatch`, `stale_feed`, `unknown` — original Step 0 set covering admin_resources health probes and the national-feed freshness check.
- `peer_research_stale` — Phase B U7. Opened when an `icp_peer_companies` row's `last_researched_at` is older than the effective staleness threshold (per-peer `costantino_config.staleAfterDays` override → `admin_resources.config.peerFreshness.staleAfterDays` default 90d → hardcoded 90d fallback). Caller queues re-research via `Tiago.runForPeer`. `targetKind='icp_peer'`, `targetId=<peer id>`.

## Testing — dry-cycle script

`scripts/src/costantino-dry-cycle.ts` runs `runCostantinoCycle()` end-to-end against the dev DB with a stubbed LLM (deterministic canned tool calls) and a stubbed fetch (always returns 200). Zero external cost. Use this to verify code-path coverage after any change to the agent, tools, or scheduler:

```sh
pnpm --filter @workspace/scripts run dry:costantino
```

## Step 0 → Step 1+ roadmap (informational)

| Step | What it adds |
|---|---|
| Step 0 (this) | Agent + tools + scheduler + findings table + skill. Runs side-by-side with `resource-health-checker`. |
| Step 1 | Retires `resource-health-checker`. Admin UI for `costantino_findings`. |
| Step 2 | Rebecca tool: `ask_costantino` for on-demand health questions. |
| Step 3 | Findings → notifications/email integration. |
