# Phase 2 Fix — vocabulary violation in CompanyAssumptions tooltip

**Owner:** Replit Agent
**Unblocks:** Phase 4 (`phase-4-pending-ui-tasks.md`)
**Source:** Bug filed at `phase-2-bug-vocabulary-violation.md`
**Decision author:** Claude Code (picked Option B per bug-file prompt)

## Decision

**Option B** — rewrite the tooltip using the already-approved "Consult" verb:

```diff
-  tooltip={`Ask the Analyst about ${TAB_LABELS[activeTab]}`}
+  tooltip={`Consult the Analyst on ${TAB_LABELS[activeTab]}`}
```

### Rationale

- Option A (`"The Analyst about X"`) reads grammatically awkward.
- Option C (drop the custom tooltip, rely on `<AnalystButton />` default) would require investigating whether AnalystButton has a canonical default — larger scope than needed here. The current pattern passes a custom tooltip per tab; Option B preserves that while getting compliant.
- "Consult" is explicitly listed as the approved secondary verb in `branding-vocabulary-enforcement.md` ("Consult" as replacement for "Generate Research").

## Exact edit

**File:** `client/src/pages/CompanyAssumptions.tsx`
**Line:** 994 (in the `rightContent` render block of the tab strip)

Replace the one line above.

## Verification

```bash
npx tsc --noEmit
npm run test:file -- tests/audit/vocabulary-compliance.test.ts
npm run test:summary
```

- Vocabulary compliance test must return 11/11 passing.
- `test:summary` must be green.
- Open `/company/assumptions`, hover the Analyst button on each of the 6 tabs, confirm tooltip reads `"Consult the Analyst on <Tab Label>"`.

## Commit message

```
audit phase 2 fix: vocabulary — "Ask the Analyst" → "Consult the Analyst"

The literal "Ask the Analyst" is reserved for the <AnalystButton /> component
(vocabulary audit rule). Commit ae563c1c replaced the forbidden "Run The
Analyst on X" with an equally-forbidden "Ask the Analyst about X". Use
"Consult the Analyst on X" instead — Consult is the approved secondary verb
in branding-vocabulary-enforcement.md.

Closes phase-2-bug-vocabulary-violation.md. Unblocks Phase 4.

Surfaces: S6, S11, S12.
```

## After fix ships

1. Re-run full verification suite from `phase-2-verification.md`.
2. If all green, proceed to `phase-4-pending-ui-tasks.md` tasks #9–#16 in order.
3. Append a 2-line note to `.claude/session-memory.md` under the current session entry.
