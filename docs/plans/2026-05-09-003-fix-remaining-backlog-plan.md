---
title: "Fix Remaining Backlog: Share Leak, Alias Hygiene, Plan/Issue Staleness"
type: fix
status: completed
date: 2026-05-09
origin: docs/plans/2026-05-05-007-master-priority-plan.md
---

# Fix Remaining Backlog: Share Leak, Alias Hygiene, Plan/Issue Staleness

## Summary

Six of the nine items on the master-priority-plan.md pending list shipped on prior branches
(L2-U5, L2-U6, L4-U9, L4-U10, L5-U11, L5-U12 are fully implemented). This plan covers the
genuine remainder: a response-discrimination privacy gap at the scenario-share endpoint, the
`PROJECTION_YEARS` alias export, and stale plan/issue documentation.

---

## Requirements

- R1. `POST /api/scenarios/shares` does not let an observer determine whether an email is
  registered by comparing the HTTP status code or response shape.
- R2. `PROJECTION_YEARS` is no longer exported from `lib/shared` (callers use `DEFAULT_PROJECTION_YEARS`).
- R3. `docs/plans/2026-05-05-007-master-priority-plan.md` reflects the actual shipped state for
  all six completed units.
- R4. `docs/issues/known-issues.md` reflects the current behavior.

---

## Scope Boundaries

- L2-U7 dev DB reseed is a manual operational step; not a code unit.
- Parity map ⚠️ gaps (global assumptions, per-resource Iris sync) remain explicitly deferred.

---

## Implementation Units

- U1. **Fix scenario-share response discrimination** ✅ Done (commit `657326f6`)

  Already shipped by prior Replit agent commit. Returns `201 {shares:[], recipientName:null}`
  for unrecognised emails — same status and shape as zero-new-shares success.

- U2. **Remove PROJECTION_YEARS alias** ✅ Done (commit `8176c58b`)

  Removed from `lib/shared/src/constants.ts` and `lib/engine/src/debt/loanCalculations.ts`
  import/re-export blocks. Updated callers in `calculation-checker/index.ts`,
  `runVerification.ts`, `useServerFinancials.ts`, `PropertyDetail.tsx`, and frontend
  `lib/constants.ts` shim (now uses `_PY` alias for `DEFAULT_PROJECTION_YEARS`).

- U3. **Refresh master-priority-plan.md and known-issues.md** ✅ Done

  Added done markers for L2-U5/U6, L4-U9/U10, L5-U11/U12 in the master plan.
  Updated known-issues.md with resolution notes and commit references.

---

## Sources & References

- Origin plan: `docs/plans/2026-05-05-007-master-priority-plan.md`
- Known issues: `docs/issues/known-issues.md`
