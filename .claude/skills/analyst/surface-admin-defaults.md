# Skill: Admin Defaults Specialist

**Status:** Partially built (covers 2 of N curated tables today).
**Descriptive companion:** `docs/architecture/analyst/admin-defaults-specialist.md`.
**Future home:** `engine/analyst/surface/admin-defaults/defaults-specialist.ts`.
**Parent skill:** `_index.md`.

---

## Scope

Owns the Admin → Analyst Tables surface — the curated benchmark tables that ground every other Specialist's evaluations. When an admin edits a row in `analyst_watchdog_benchmarks`, `hospitality_benchmarks`, `fb_benchmarks`, etc., this Specialist:

1. Validates the edit against persona rules (no plural language; conviction floor; range completeness).
2. Optionally triggers a Cognitive Engine refresh of related rows.
3. Notifies the Cross-Portfolio Specialist that downstream verdicts may have shifted.
4. Writes an audit row to `change_log` with provenance.

Admin Defaults are the source-of-truth for every other Specialist's ranges. A bad benchmark here cascades. Treat this Specialist's steward gate as the strictest in the system.

---

## Today's state — `analyst-table-refresh.ts`

`server/ai/analyst-table-refresh.ts` (425 lines) implements the Tier-1 LLM refresh path for two tables: `capital_raise_benchmarks` and `exit_multiples`. Already enforces:

- N+1 evidence (`MIN_SOURCES = 3`).
- JSON-only LLM output with tolerant parsing fallback.
- Provenance capture in the response payload.
- Admin-visible streaming via SSE (the "RefreshTheater" UI at `client/src/components/admin/intelligence/AnalystRefreshTheater.tsx`).

This is good infrastructure that needs to be widened, not rebuilt. Phase 4 re-homes it under `engine/analyst/surface/admin-defaults/` and extends coverage.

---

## Hard rules

### 1. Tier discipline

| Trigger | Tier | Behavior |
|---|---|---|
| Admin edits a single row | **Tier-0** | Validate fields, write `change_log`, notify Cross-Portfolio. No LLM. |
| Admin clicks "Refresh from sources" on a table | **Tier-1** | Full Cognitive Engine consultation with N+1 evidence; updates table rows; streams narration. |
| Scheduled (cron) | **Tier-1** | Same as admin-triggered, but ambient. Frequency from `global_assumptions.researchConfig`. |

Row-edit path must NEVER invoke LLMs. Refresh paths MUST enforce N+1.

### 2. Conviction floor is gating

Any edit whose resulting `qualityScore` (Phase 3 Quality Scorer) falls below `CONVICTION_FLOOR` (40) is **rejected** unless the admin provides an explicit override flag + audit reason.

Below-floor overrides must be logged as such in `change_log`. Downstream Specialists reading the table are expected to surface the low-conviction flag.

### 3. Every verdict emits source list to the admin

The admin UI is designed to expose evidence. Admin Defaults verdicts ALWAYS include `evidence[]` with source name, tier, asOf, URL. The RefreshTheater component relies on this.

### 4. Cross-Portfolio notification is mandatory

Every successful row edit OR refresh dispatches `AdminDefaultsChanged` to the Surface Router, which fans out to the Cross-Portfolio Specialist. The Cross-Portfolio Specialist re-runs outlier detection because the baseline shifted.

Skipping this notification → downstream Specialists keep surfacing old outliers → product-breaking inconsistency. Non-negotiable.

### 5. Admin Defaults tables are read-only for other Specialists

Other Specialists (Mgmt-Co, Property, ICP, Cross-Portfolio) read from the curated tables this Specialist maintains. They MUST NOT call this Specialist directly. They MUST NOT write to the tables.

If a Specialist wants to propose a new benchmark, it emits a verdict action `{ kind: "open-admin", payload: { tableName, proposedRow } }`. The admin reviews and accepts; the Admin Defaults Specialist writes.

---

## Tables to cover

Already covered (by `analyst-table-refresh.ts`):
- `capital_raise_benchmarks`
- `exit_multiples`

Phase 4 adds:
- `hospitality_benchmarks`
- `fb_benchmarks`
- `country_defaults`
- `country_risk_premiums`
- Future benchmark stores added by other Specialists

---

## Persona discipline

The Admin Defaults Specialist is the place where bad data gets caught before it contaminates the system. Validation rules:

- **Range completeness** — every benchmark row with a range has low, mid, high populated.
- **Source citation** — every row references ≥ 1 source; refresh-updated rows reference ≥ 3.
- **Recency** — `evidence.asOf` populated and within tolerance (per-table configurable).
- **Persona-fit** — row's `segmentTags` match an allowed persona value.
- **Vocabulary** — any text fields (source names, notes) pass the vocabulary test.

A row that fails any of these is rejected with an advisory verdict explaining which rule fired.

---

## Cognitive consultation

This Specialist consults the Cognitive Engine ROUTINELY (the "Refresh from sources" button is its whole purpose). It is the only Specialist for which Tier-1 is the default rather than the exception.

The façade call: `engineClient.consult({ surface: "admin-defaults", scope: "table-refresh", tableName, segmentTags })`. The Engine produces N+1-backed values with provenance; the Specialist writes the rows.

Tier-1 cost concern (Phase 5 open question): the orchestrator-level cache should memoize repeat refreshes within a short window. Until the cache lands, admins should avoid back-to-back refreshes on the same table.

---

## What NOT to do

- Don't let other Specialists call this Specialist directly (they read tables; they don't dispatch to this surface).
- Don't skip the Cross-Portfolio notification on row changes.
- Don't allow below-floor edits without explicit override + audit reason.
- Don't invoke LLMs on single-row edits.
- Don't rebuild `analyst-table-refresh.ts` — widen it.

---

## References

- `docs/architecture/analyst/admin-defaults-specialist.md` — descriptive spec
- `server/ai/analyst-table-refresh.ts` — today's Tier-1 refresh path
- `client/src/components/admin/intelligence/AnalystRefreshTheater.tsx` — admin streaming UI
- `client/src/components/admin/intelligence/AnalystTables.tsx` — admin table CRUD
- `.claude/skills/analyst/surface-cross-portfolio.md` — downstream cascade target
- `.claude/skills/analyst/cognitive-engine.md` — façade rules
- `.claude/skills/analyst/steward.md` — change-control gate
- `.claude/rules/research-precision.md` — N+1 rule
