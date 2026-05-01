# Skill: Staleness Specialist

**Status:** Engine partially built (`server/ai/staleness-detector.ts`); not yet a named Specialist.
**Descriptive companion:** `docs/architecture/analyst/staleness-specialist.md`.
**Future home:** `engine/analyst/surface/staleness/staleness-specialist.ts`.
**Parent skill:** `_index.md`.

---

## Scope

Owns the lifecycle of guidance — when a previously-issued verdict becomes "Due for review" or "Overdue" and what should happen when it does. Powers the Intelligence Status Bar (`client/src/components/intelligence/IntelligenceStatusBar.tsx`) that shows:

- **Up to date** — reviewed recently, nothing changed
- **Due for review** — changed inputs OR time has passed
- **Overdue** — > 90 days, market may have shifted
- **Not yet reviewed** — no guidance exists

---

## Today's state

`server/ai/staleness-detector.ts` classifies guidance freshness. Classification feeds:

- `GET /api/research/staleness`
- `IntelligenceStatusBar.tsx`
- Conditional refresh triggers in `server/ai/analyst-watchdog.ts`

The logic exists; the Specialist wrapper does not. Phase 4 wraps it.

---

## Hard rules

### 1. This Specialist rarely calls the Cognitive Engine itself

Its output is a verdict of the form "this surface needs re-evaluation by its own Specialist." The Engine is called by the surface Specialist that the Router dispatches NEXT, not by Staleness.

Exception: the ambient sweep may pre-warm the orchestrator-level cache (Phase 5) for Specialists likely to be invoked next.

### 2. Verdict shape surfaces per-field stale status

```
AnalystVerdict.dimensions = [
  { field: "adr", severity: "advisory", /* "Due for review" */ },
  { field: "occupancy", severity: "warning", /* "Overdue" */ },
  { field: "exit-cap-rate", severity: "advisory", /* "Not yet reviewed" */ },
]
```

Each dimension carries:
- `severity: "advisory"` for Due-for-review
- `severity: "warning"` for Overdue
- `severity: "ok"` for Up-to-date (but still listed so consumers know)
- `severity: "advisory"` for Not-yet-reviewed with `intent: "missing-data"`

### 3. Every stale dimension emits a consult action

```
actions: [{
  kind: "consult-cognitive",
  label: "Refresh ADR range",
  payload: { surface, field, propertyId? },
}]
```

The user (or a scheduler) can accept the action; the Router dispatches to the relevant Specialist, which calls the Cognitive Engine.

### 4. Tolerance values are admin-configurable

Staleness tolerance thresholds live in `global_assumptions.researchConfig`. Do NOT hardcode "90 days" inside this Specialist. Read the value at evaluation time.

### 5. Re-run policy — today's open question

Claude Code flagged a real ambiguity: when a user clicks consult on overdue guidance, what happens to the old guidance?

**Initial proposal (requires ADR in Phase 5 to confirm):**
- Every research run produces a row in `research_runs` with timestamp.
- `assumption_guidance` rows are versioned; the active row points at the most recent valid `research_runs` entry.
- Old guidance is NEVER deleted; it's marked `superseded`.
- The user-visible badge always reflects the active row.

Until this policy is ADR-locked, the Specialist should NOT assume how existing guidance is replaced. It surfaces staleness; the Specialist being re-dispatched (e.g., Property Revenue Specialist) handles persistence.

---

## Triggers

The Router dispatches to Staleness on:

- **Page open** (`PageOpened` event) — checks the relevant surface for stale guidance.
- **Ambient sweep** (cron) — scans all properties + Mgmt-Co surfaces for overdue items.
- **Source freshness change** — when a benchmark snapshot is refreshed, dependent guidance becomes stale.

---

## Inputs

- Property ID (when surface is property-scoped).
- Mgmt-Co ID (implicit — shared single row).
- Current `assumption_guidance` rows for the scope.
- Tolerance values from `global_assumptions.researchConfig`.
- Source recency from `evidence.asOf` on prior guidance rows.

---

## Persona-keyed test expectations

The L+B-segment golden for Staleness:

| Property state | Expected status |
|---|---|
| Guidance dated 30 days ago (within tolerance) | Up to date |
| Guidance dated 60 days ago | Due for review |
| Guidance dated 120 days ago | Overdue |
| No guidance | Not yet reviewed |

Tolerance values from a fixed `researchConfig` fixture.

---

## What Staleness does NOT do

- Does NOT compute `qualityScore` (that's the Quality Scorer).
- Does NOT modify guidance rows (the re-dispatched Specialist does that).
- Does NOT craft user-facing strings (Voice Renderer does).
- Does NOT decide which re-run policy applies (that's an ADR).
- Does NOT fire the Cognitive Engine per field; it just flags which fields need consultation.

---

## What lives in `server/ai/staleness-detector.ts` today

- Date-delta classification logic.
- Per-field tolerance lookup.
- `/api/research/staleness` route wiring.

Phase 4 preserves this logic but wraps it in a Specialist contract. The underlying detector becomes an internal helper; the Specialist is the public surface.

---

## References

- `docs/architecture/analyst/staleness-specialist.md` — descriptive spec
- `server/ai/staleness-detector.ts` — today's classification logic
- `client/src/components/intelligence/IntelligenceStatusBar.tsx` — the UI this powers
- `.claude/notes/analyst-architecture.md` — see §Open questions for the re-run policy debate
- `.claude/skills/analyst/orchestrator.md` — Router dispatch
- `.claude/skills/analyst/cognitive-engine.md` — consult action destination
- `.claude/skills/analyst/steward.md` — change-control gate
