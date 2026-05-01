# Admin Cleanup — Packet Index

Sequence of UI-cleanup packets from `.claude/audits/admin-intelligence-inventory.md`. Replit executes in order. Each is independently shippable.

## Sequence

| # | Packet | Scope | Why ordered here |
|---|---|---|---|
| 1 | `admin-cleanup-specialist-readonly.md` | 4 Specialist tabs (Identity, RequiredFields, LlmConfig, Runtime) → read-only | **Highest impact**: 12 specialists × 4 tabs = 48 surfaces in compliance. Also lowers proof-test T2 baseline from infinity to 0, locking the rule. |
| 2 | `admin-cleanup-rebecca-guardrails-readonly.md` | Rebecca → Guardrails → read-only | Same rule violation, isolated surface. Independent of #1; can run in parallel if Replit prefers. |
| 3 | `admin-cleanup-scheduled-research-strip-cron.md` | System → Scheduled Research → manual-runs-only | Different rule (`analyst-trigger-discipline.md`), different fix shape. May surface a BLOCKED if no manual-trigger endpoint exists — CC owns the fix. |
| 4 | `admin-cleanup-exports-tab-kill.md` | Admin → Reports & Exports tab kill | Pure deletion (orphan). Easiest packet, last in queue because it's lowest blast risk and benefits from the proof test (#1's S5) being in place to confirm no dead-route. |

## Pacing

Replit can ship these as four separate commits in sequence, or batch into fewer if velocity permits. The verification gates (5 gates per commit, per `pre-commit-verification.md`) are independent — each packet's gates pass on its own commit.

## Follow-up work owned by CC (not in these packets)

After Replit ships #1-4, CC removes:
- PUT `/api/admin/specialists/:id/{identity,required-fields,llm-config,runtime}` server endpoints
- POST/PATCH/DELETE `/api/rebecca/guardrails/*` server endpoints
- Cron worker + `frequencyHours` consumption in scheduled-research backend
- `GET/PUT /api/admin/export-config` server endpoint + `global_assumptions.exportConfig` column drop migration

These follow-ups close the loop: UI is read-only → server can't accept writes either.

## Related (separate audit follow-up)

The 5 UX quick-win packets (dual-mount KB+Conversations, Market & Macro sidebar leaf, Resources 4-way consolidation, Benchmarks/Market Data merge, PeopleTab→UsersTab merge) are NOT in this index. They'll be authored after the rule-violation cleanup ships, since they're lower-risk reshuffling and benefit from the cleaner baseline these four create.

## Rollback

Each packet's `Rollback notes` section names the per-task git restore. No packet creates a migration that's not reversible by `git revert`.
