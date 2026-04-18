# Phase 2 Verification Bug — vocabulary-compliance regression

**Filed by:** Replit Agent
**Date:** April 18, 2026
**Blocks:** Phase 4 execution (`phase-4-pending-ui-tasks.md`) — verification pre-req failed
**Severity:** P1 — blocks every commit until fixed (audit test runs in `test:summary`)
**Source commit:** `ae563c1c` — "audit: CompanyAssumptions — constant drift, vocabulary, dead code, savedTabs hydration"

---

## Symptom

`tests/audit/vocabulary-compliance.test.ts` fails:

```
FAIL  tests/audit/vocabulary-compliance.test.ts > Vocabulary Compliance — Forbidden Terms
  > no "Ask the Analyst" in client code (use "Analyst (use <AnalystButton />, drop 'Ask the')")

AssertionError: Found "Ask the Analyst" — use "Analyst (use <AnalystButton />, drop 'Ask the')" instead:
pages/CompanyAssumptions.tsx:994
```

10 other vocabulary tests pass. This is a single offender.

## Root cause

Commit `ae563c1c` changed the Analyst tooltip from `"Run The Analyst on <Tab>"` to `"Ask the Analyst about <Tab>"` — explicitly listed in `phase-2-verification.md` line 49 as an intentional vocabulary fix.

But the vocabulary audit prohibits the literal string **"Ask the Analyst"** in any client file — the canonical pattern is to use the `<AnalystButton />` component (which renders the correct label internally and is the only authorized surface for that text).

## Exact location

`client/src/pages/CompanyAssumptions.tsx:994`

```tsx
tooltip={`Ask the Analyst about ${TAB_LABELS[activeTab]}`}
```

## Suggested fix (decision needed)

Two options — **decision belongs to the commit author (Claude Code)** since they own the original change:

**Option A** — drop "Ask the": `tooltip={`The Analyst about ${TAB_LABELS[activeTab]}`}`
This is grammatically awkward but vocabulary-clean.

**Option B** — rewrite tooltip without the forbidden phrase, e.g. `tooltip={`Have the Analyst review ${TAB_LABELS[activeTab]}`}` or `tooltip={`Consult the Analyst on ${TAB_LABELS[activeTab]}`}`. Reads better; matches `Consult` verb already approved in `branding-vocabulary-enforcement.md` for secondary actions.

**Option C** — replace the inline tooltip with the actual `<AnalystButton />` component if the pattern allows. This is what the test message hints at, but requires checking whether the existing call site is rendering an `<AnalystButton />` already (the test message implies the component handles the label internally).

## Verification context

| Check | Result |
|---|---|
| TypeScript | ✓ 0 errors |
| Lint | ✓ 0 errors |
| Tests | ✗ 1 failed (this one) |
| Verify Financials | ✓ UNQUALIFIED |
| Parity | ✓ UNQUALIFIED |
| Quick Audit | ✓ no critical issues |

All 5 audit commits otherwise verified clean. The single regression is the vocabulary violation above.

## Surfaces touched

S12 (vocabulary rule). No DB, no API, no calc.

## Action required

1. Claude Code picks Option A/B/C above and ships a follow-up commit.
2. Replit Agent re-runs `npm run test:summary` after the fix.
3. If green, Replit proceeds to Phase 4 (`phase-4-pending-ui-tasks.md` tasks #9–#16).

Phase 4 is blocked until this is resolved.
