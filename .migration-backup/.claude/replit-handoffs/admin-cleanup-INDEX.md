# Admin Cleanup — Packet Index

Full sequence of UI-cleanup packets from `.claude/audits/admin-intelligence-inventory.md`. Replit executes in order. Each is independently shippable.

## Tier 1 — Rule violations (highest priority)

| # | Packet | Scope | Why ordered here |
|---|---|---|---|
| 1 | `admin-cleanup-specialist-readonly.md` | 4 Specialist tabs (Identity, RequiredFields, LlmConfig, Runtime) → read-only | **Highest impact**: 12 specialists × 4 tabs = 48 surfaces in compliance. Lowers proof-test T2 baseline from infinity to 0, locking the rule. |
| 2 | `admin-cleanup-rebecca-guardrails-readonly.md` | Rebecca → Guardrails → read-only | Same rule violation, isolated surface. Independent of #1; can run in parallel if Replit prefers. |
| 3 | `admin-cleanup-scheduled-research-strip-cron.md` | System → Scheduled Research → manual-runs-only | Different rule (`analyst-trigger-discipline.md`), different fix shape. May surface a BLOCKED if no manual-trigger endpoint exists — CC owns the fix. |
| 4 | `admin-cleanup-exports-tab-kill.md` | Admin → Reports & Exports tab kill | Pure deletion (orphan). Easiest packet, last in Tier 1 because it's lowest blast risk and benefits from the proof test (#1's S5) being in place to confirm no dead-route. |

## Tier 2 — UX quick wins (lower priority, lower blast risk)

| # | Packet | Scope | Notes |
|---|---|---|---|
| 5 | `admin-cleanup-rebecca-dual-mounts.md` | Remove KB + Conversations from RebeccaAdminTabs (sidebar leaves stay) | Drops T3 baseline allow-list from 3 → 1. |
| 6 | `admin-cleanup-market-macro-leaf-removal.md` | Drop the "Market & Macro" sidebar leaf under Steady State | Smallest packet — 1 file, 1 sub-step. |
| 7 | `admin-cleanup-resources-consolidation.md` | 4 Resources sidebar leaves (APIs/Sources/Benchmarks/Models) → 1 entry with internal tabs | Creates a new wrapper component. Market Data stays separate. |
| 8 | `admin-cleanup-benchmarks-into-market-data.md` | Investigate Benchmarks vs Market Data overlap; merge or clarify | **Depends on #7** shipping first. Investigation-first — Replit decides A vs B path. |
| 9 | `admin-cleanup-peopletab-merge.md` | Merge PeopleTab wrapper into UsersTab | 21-line wrapper deletion. |

## Pacing

Tier 1 first (rule compliance). Within Tier 1, packet #1 is highest impact. Within Tier 2, any order; #6 is the easiest warm-up.

The verification gates (5 gates per commit, per `pre-commit-verification.md`) are independent — each packet's gates pass on its own commit.

## Follow-up work owned by CC (after Replit Tier 1 ships)

- PUT `/api/admin/specialists/:id/{identity,required-fields,llm-config,runtime}` server endpoints — remove
- POST/PATCH/DELETE `/api/rebecca/guardrails/*` server endpoints — remove
- Cron worker + `frequencyHours` consumption in scheduled-research backend — remove
- `GET/PUT /api/admin/export-config` server endpoint + `global_assumptions.exportConfig` column drop migration — remove

These follow-ups close the loop: UI is read-only → server can't accept writes either. Without them, the violations are inert at the UI but the endpoints still exist for direct API callers.

## Rollback

Each packet's `Rollback notes` section names the per-task git restore. No packet creates a migration that's not reversible by `git revert`.
