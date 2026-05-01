# Admin Defaults Specialist

**Status:** Partially built (covers 2 of N curated tables today).
**Future home:** `engine/analyst/surface/admin-defaults/defaults-specialist.ts`
**Parent:** `docs/architecture/ANALYST.md`

---

## Scope

The Admin Defaults Specialist owns the Admin → Analyst Tables surface — the curated benchmark tables that ground every other Specialist's evaluations. When an admin edits a row in `analyst_watchdog_benchmarks`, `hospitality_benchmarks`, `fb_benchmarks`, etc., this Specialist:

1. Validates the edit against persona rules (no plural language; conviction floor; range completeness).
2. Optionally triggers a Cognitive Engine refresh of related rows (the existing "RefreshTheater" workflow).
3. Notifies the Cross-Portfolio Specialist that downstream verdicts may have shifted.
4. Writes an audit row to `change_log` with provenance.

---

## Today's state

`server/ai/analyst-table-refresh.ts` (425 lines) implements the Tier-1 LLM refresh path for two tables: `capital_raise_benchmarks` and `exit_multiples`. It already enforces:

- N+1 evidence (`MIN_SOURCES = 3`)
- JSON-only LLM output with tolerant parsing fallback
- Provenance capture in the response payload
- Admin-visible streaming via SSE (the "RefreshTheater" UI)

The admin UI (`client/src/components/admin/intelligence/AnalystRefreshTheater.tsx` + `AnalystTables.tsx`) presents the refresh narration and the table CRUD.

This is **good infrastructure that needs to be widened**, not rebuilt.

---

## What Phase 4 adds

- Re-home `analyst-table-refresh.ts` under `engine/analyst/surface/admin-defaults/` with the Specialist contract.
- Extend coverage to all curated tables: `hospitality_benchmarks`, `fb_benchmarks`, `country_defaults`, `country_risk_premiums`, future benchmark stores added by other Specialists.
- Standardize the admin "what changed since last refresh?" diff view.
- Wire Cross-Portfolio Specialist notification on every successful refresh.

---

## Refresh tiers

| Trigger | Tier | Cost | Behavior |
|---|---|---|---|
| Admin edits a single row | Tier-0 | Free | Validate fields, write `change_log`, notify Cross-Portfolio. No LLM. |
| Admin clicks "Refresh from sources" on a table | Tier-1 | High (Gemini + Sonnet + Opus) | Full Cognitive Engine consultation with N+1 evidence; updates table rows; streams narration. |
| Scheduled (cron) | Tier-1 | High | Same as admin-triggered, but ambient. Frequency configured in `global_assumptions.researchConfig`. |

Tier-1 paths must respect the orchestrator-level cache (Phase 5; see Claude Code's open question on cost).

---

## Persona discipline

Admin Defaults are the source-of-truth for every other Specialist's ranges. A bad benchmark here cascades. The Specialist must:

- Reject any edit whose `qualityScore` (Phase 3 Quality Scorer) falls below `CONVICTION_FLOOR`.
- Require an explicit override flag + audit reason for any below-floor edit.
- Always emit verdicts with the source list visible to the admin.

---

## Cognitive consultation

This Specialist consults the Cognitive Engine routinely (it's the whole point of the "Refresh from sources" button). Other Specialists do not call this Specialist directly — they read from the curated tables it maintains.
