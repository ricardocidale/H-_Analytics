# Staleness Specialist

**Status:** Engine partially built (`server/ai/staleness-detector.ts`); not yet a named Specialist.
**Future home:** `engine/analyst/surface/staleness/staleness-specialist.ts`
**Parent:** `docs/architecture/ANALYST.md`

---

## Scope

The Staleness Specialist owns the lifecycle of guidance: when does a previously-issued verdict become "Due for review" or "Overdue", and what should happen when it does?

This Specialist is what powers the Intelligence Status Bar that shows "Up to date / Due for review / Overdue / Not yet reviewed" per surface.

---

## Today's state

`server/ai/staleness-detector.ts` classifies guidance freshness. The classification feeds:

- `client/src/components/intelligence/IntelligenceStatusBar.tsx`
- `GET /api/research/staleness` route
- Various conditional refresh triggers in `analyst-watchdog.ts`

The logic exists; what doesn't exist is the Specialist wrapper that returns a verdict, integrates with the Surface Router, and owns the re-run policy.

---

## Triggers

- **Page open** (`PageOpened` event) — checks the relevant surface for stale guidance
- **Ambient sweep** (cron) — scans all properties + Mgmt-Co surfaces for overdue items
- **Source freshness change** — when a benchmark snapshot is refreshed, dependent guidance becomes stale and the Specialist surfaces it

---

## Outputs

`AnalystVerdict` with one entry per stale field:

- `severity: "advisory"` for "Due for review" (within tolerance but aging)
- `severity: "warning"` for "Overdue" (past tolerance)
- `actions: [{ kind: "consult-cognitive", reason: "guidance-overdue", surface, field }]` to allow one-click re-run

---

## Re-run policy (today's open question)

Claude Code's note flags a real ambiguity: when a user clicks "Consult the Analyst" on overdue guidance, what happens to the old guidance? Is it archived, overwritten, or appended as a new run?

This Specialist owns that policy. Initial proposal (subject to ADR in Phase 5):

- Every research run produces a row in `research_runs` with timestamp.
- `assumption_guidance` rows are versioned; the active row points at the most recent valid `research_runs` entry.
- Old guidance is never deleted; it's marked `superseded`.
- The user-visible badge always reflects the active row.

This needs to be confirmed against the actual schema before Phase 4. Logged as an ADR candidate.

---

## Cognitive consultation

This Specialist almost never consults the Cognitive Engine itself — it surfaces the need for consultation to other Specialists. The exception is the ambient sweep, which may pre-warm the orchestrator-level cache for Specialists likely to be invoked next.

---

## Persona-keyed test expectations

The L+B-segment golden test for Staleness includes:

- A property with guidance dated 30 days ago (within tolerance) → expects "Up to date"
- A property with guidance dated 60 days ago → expects "Due for review"
- A property with guidance dated 120 days ago → expects "Overdue"
- A property with no guidance → expects "Not yet reviewed"

Tolerance values themselves come from `global_assumptions.researchConfig` and can be adjusted by admins.
