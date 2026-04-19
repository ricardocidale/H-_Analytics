# Handoff — Financial Sentry contexts + 100% sampling for critical errors

**From:** Claude Code
**To:** Replit Agent
**Date:** 2026-04-19
**Track:** Operational Tooling (independent of OT-A and PostHog; can run in parallel)
**Why this is a handoff:** Touches `server/sentry.ts`, `client/src/lib/sentry.ts`, and several server route error handlers — runtime code across server + client. Per `.claude/rules/claude-replit-split.md`, your domain.

---

## Why this is happening

`@sentry/node` + `@sentry/react` are installed and initialized. Current config samples 20% in production. `FinancialCalculationError` is already tagged. Per `docs/architecture/DEPENDENCIES.md §13`, the next obvious move is:

1. **Force 100% sampling for financial-critical errors** (the 20% default is fine for everything else, but a balance-sheet imbalance or verdict-invariant failure should NEVER be sampled out — those are the events that drive weekly audit rewrites)
2. **Add structured error classes** with rich context (propertyId, specialistId, severity, computation scope)
3. **Add Sentry breadcrumbs** for research orchestrator phases so when something fails we know what was happening

The goal: Sentry becomes the canary that catches drift before the next audit does. Today's audit-rewrite cycle is expensive because we discover problems days or weeks after they ship.

---

## Mandatory pre-flight reading

1. `docs/architecture/DEPENDENCIES.md §13 Observability + analytics`
2. `.claude/rules/pre-commit-verification.md` — five gates
3. `.claude/rules/error-handling.md` — structured error pattern `[LEVEL] [domain] message`
4. `.claude/rules/balance-sheet-identity.md` — the $1-tolerance rule that drives `BalanceSheetImbalanceError`
5. `.claude/rules/claude-replit-split.md` — you may NOT touch `engine/analyst/contracts/verdict.ts` (frozen contract; Phase 3a territory)
6. `server/sentry.ts` and `client/src/lib/sentry.ts` — existing init
7. `engine/analyst/contracts/verdict.ts` — `InvalidVerdictError` class (read only; do not modify)
8. `client/src/components/statements/ConsolidatedBalanceSheet.tsx` + `client/src/components/dashboard/dashboardExports.ts` — the two files from the balance-sheet rule where imbalance checks live

---

## Deliverables (one commit)

### File 1 (new): `server/errors/financial-errors.ts`

A small error hierarchy. Classes:

```typescript
/**
 * Base class for financial-critical errors that must bypass Sentry sample rate.
 * Child classes add typed context. Route handlers detect `instanceof FinancialSentryError`
 * and call Sentry.captureException unconditionally.
 */
export abstract class FinancialSentryError extends Error {
  abstract readonly errorClass: string;
  readonly financialContext: Record<string, unknown>;

  constructor(message: string, context: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    this.financialContext = context;
  }
}

export class BalanceSheetImbalanceError extends FinancialSentryError {
  readonly errorClass = "BalanceSheetImbalanceError";
  constructor(context: {
    scope: "property" | "company" | "consolidated";
    propertyId?: number;
    month?: number;
    year?: number;
    totalAssets: number;
    totalLiabilitiesAndEquity: number;
    delta: number;      // |assets - (L+E)|, should be <= $1
    tolerance: number;  // always 1 per .claude/rules/balance-sheet-identity.md
  }) {
    super(
      `Balance sheet imbalance on ${context.scope}${context.propertyId ? ` (property ${context.propertyId})` : ""}: A=${context.totalAssets.toFixed(2)}, L+E=${context.totalLiabilitiesAndEquity.toFixed(2)}, Δ=${context.delta.toFixed(2)}`,
      context,
    );
  }
}

export class OrchestratorTimeoutError extends FinancialSentryError {
  readonly errorClass = "OrchestratorTimeoutError";
  constructor(context: {
    phase: "relaxation" | "panel-a" | "panel-b" | "validation" | "synthesis";
    model?: string;
    elapsedMs: number;
    timeoutMs: number;
    propertyId?: number;
    researchRunId?: string;
  }) {
    super(
      `Research orchestrator timeout in phase "${context.phase}" after ${context.elapsedMs}ms (limit ${context.timeoutMs}ms)`,
      context,
    );
  }
}

export class VerdictInvariantError extends FinancialSentryError {
  readonly errorClass = "VerdictInvariantError";
  constructor(context: {
    specialistId: string;
    cause: string;          // what invariant failed
    severity?: string;
    qualityScore?: number;
    dimensionCount?: number;
    zodIssues?: Array<{ path: string; message: string }>;
  }) {
    super(
      `Analyst verdict invariant failed for ${context.specialistId}: ${context.cause}`,
      context,
    );
  }
}

/** Legacy/existing pattern — extend to make it a FinancialSentryError. */
export class FinancialCalculationError extends FinancialSentryError {
  readonly errorClass = "FinancialCalculationError";
  constructor(message: string, context: {
    calculation: string;
    propertyId?: number;
    scope?: string;
    inputs?: Record<string, unknown>;
  }) {
    super(message, context);
  }
}
```

If a `FinancialCalculationError` class already exists elsewhere in the codebase (I recall it's referenced in `server/sentry.ts`), either move/migrate it to this file or extend it there — but its new parent must be `FinancialSentryError`. Whatever you choose, only one definition should remain. Grep for existing occurrences before adding.

### File 2 (edit): `server/sentry.ts`

Two changes:

1. **`beforeSend` hook** that tags financial errors and forces capture (bypass sample rate):

```typescript
import { FinancialSentryError } from "./errors/financial-errors";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.REPLIT_DEPLOYMENT === "1" ? "production" : "development",
  tracesSampleRate: 0.2,
  beforeSend(event, hint) {
    const err = hint?.originalException;
    if (err instanceof FinancialSentryError) {
      event.tags = { ...event.tags, financial: "true", financial_error_class: err.errorClass };
      event.extra = { ...event.extra, financial_context: err.financialContext };
      event.level = "error";
      // 100% capture: ensure this event is always sent regardless of other sampling.
      // (Sentry's `beforeSend` returning the event is sufficient for error events;
      //  `tracesSampleRate` only affects performance/traces, not errors.)
    }
    return event;
  },
});
```

Note: the 20% sample rate only affects **traces/transactions** (performance monitoring). All **errors** are captured 100% by default. The `beforeSend` tagging is still the right move — it makes financial errors queryable in the Sentry UI (`tags.financial:true`) and keeps context attached.

If you also want financial errors to always create a performance transaction (rare — probably skip), use `tracesSampler` instead; but for this handoff, error tagging is enough.

2. **Global unhandled-rejection capture** — verify Sentry's default handlers cover unhandled promise rejections in the orchestrator path. If not, add `Sentry.captureException` at the orchestrator top-level catch.

### File 3 (edit): `client/src/lib/sentry.ts`

Mirror the `beforeSend` hook. The client will never throw `BalanceSheetImbalanceError` or `OrchestratorTimeoutError` directly (those are server-side), but it WILL propagate them from API responses — add a small check for response bodies tagged `financial: true` and attach the same `tags.financial = "true"` before re-raising.

If this is too involved, just tag client-side `FinancialCalculationError` (if any client code throws it) the same way and move on.

### File 4 (edit): balance-sheet imbalance throw sites

Per `.claude/rules/balance-sheet-identity.md`, two files derive balance-sheet cash and are the canonical places to detect imbalance:

- `client/src/components/statements/ConsolidatedBalanceSheet.tsx`
- `client/src/components/dashboard/dashboardExports.ts`

Today these files likely compute the delta and render a visual warning. **Add** (not replace) a `BalanceSheetImbalanceError` throw path behind a flag — or, safer, a `Sentry.captureException(new BalanceSheetImbalanceError({...}))` call that captures without throwing (UI continues to show the red variance warning as it does today).

Pattern:

```typescript
import { BalanceSheetImbalanceError } from "@/lib/errors";  // or server path if shared
import * as Sentry from "@sentry/react";

const delta = Math.abs(totalAssets - totalLiabilitiesAndEquity);
if (delta > 1) {
  Sentry.captureException(new BalanceSheetImbalanceError({
    scope: "consolidated",
    month,
    year,
    totalAssets,
    totalLiabilitiesAndEquity,
    delta,
    tolerance: 1,
  }));
  // Render variance warning as today; do NOT throw — this is observation, not rejection
}
```

**Important:** these are client-side components. Either share the error class via `shared/errors/financial-errors.ts` (preferred — the error class is pure types) OR duplicate the minimum at `client/src/lib/errors.ts`. Pick one approach, not both.

### File 5 (edit): `server/ai/research-orchestrator.ts` — breadcrumbs + timeout detection

Add Sentry breadcrumbs at each phase transition:

```typescript
import * as Sentry from "@sentry/node";

// Inside orchestrateResearch, at each yield "phase" event:
Sentry.addBreadcrumb({
  category: "orchestrator.phase",
  message: `Phase: ${phaseDescription}`,
  level: "info",
  data: { phase, elapsedMs: Date.now() - startedAt },
});
```

And wrap the parallel Promise.all with a timeout detection — if either panel exceeds `AI_GENERATION_TIMEOUT_MS`, throw `OrchestratorTimeoutError` instead of the current generic timeout behavior.

### File 6 (edit): route handlers catching `InvalidVerdictError`

Find every `try { buildAnalystVerdict(...) }` call site in `server/routes/**`. When `InvalidVerdictError` is caught, wrap it:

```typescript
import { VerdictInvariantError } from "../errors/financial-errors";
import * as Sentry from "@sentry/node";

try {
  const verdict = buildAnalystVerdict(inputs);
  return verdict;
} catch (err) {
  if (err instanceof InvalidVerdictError) {
    const wrapped = new VerdictInvariantError({
      specialistId: inputs.specialistId,
      cause: err.message,
      zodIssues: err.cause?.issues?.map(i => ({ path: i.path.join("."), message: i.message })) ?? [],
    });
    Sentry.captureException(wrapped);
    throw err;  // preserve original for route 500 handler
  }
  throw err;
}
```

**Do NOT modify `engine/analyst/contracts/verdict.ts`.** That file is frozen Phase 3a contract territory. Wrapping happens at the call site, not inside the contract.

### File 7 (update): `docs/architecture/DEPENDENCIES.md §13`

Change the Sentry row:

**Before:**
> | **Sentry** | `@sentry/node`, `@sentry/react` (`^10.43.0`) | Error + performance monitoring | `SENTRY_DSN` | core |

**After:**
> | **Sentry** | `@sentry/node`, `@sentry/react` (`^10.43.0`) | Error + performance monitoring. Financial errors (`FinancialSentryError` subclasses: `BalanceSheetImbalanceError`, `OrchestratorTimeoutError`, `VerdictInvariantError`, `FinancialCalculationError`) captured with `tags.financial:true` and full context. Orchestrator phases emit breadcrumbs. Traces sampled at 20% prod; all errors captured at 100%. | `SENTRY_DSN` | core |

---

## Sentry query playbook (for the user, post-deploy)

Once this lands, the user can slice Sentry events by the new tags:

| Query | Tells you |
|---|---|
| `tags.financial:true` | Every financial-critical error |
| `tags.financial_error_class:BalanceSheetImbalanceError` | Every imbalance incident |
| `tags.financial_error_class:OrchestratorTimeoutError` | Every research-run timeout |
| `tags.financial_error_class:VerdictInvariantError` | Every verdict construction failure |
| `tags.financial_error_class:FinancialCalculationError` | Every engine-level calc failure |

Create a Sentry alert on `tags.financial:true AND count() > 3 in 1 hour` → email to user. That's your first line of drift detection.

---

## Boundaries — what NOT to touch

- **`engine/analyst/contracts/verdict.ts`** — frozen. `InvalidVerdictError` stays as-is. Wrap at call sites only.
- **`engine/analyst/**` generally** — Phase 3b territory. The orchestrator is in `server/ai/`, not `engine/`, so that's OK; but don't touch any `engine/analyst/surface/**` Specialist.
- **`.claude/rules/**`** — no rule changes.
- **`calc/**`** — pure calculation files. No Sentry imports inside `calc/**`. If you find one, it's a violation.
- **Error classes beyond the 4 listed** — don't add a 5th class without updating this handoff. Discipline is the point.
- **PostHog wiring** — that's a separate handoff (`HANDOFF-replit-posthog-wiring.md`). Don't interleave.

---

## Pre-commit verification — all five gates

Per `.claude/rules/pre-commit-verification.md`:

1. `npx tsc --noEmit --skipLibCheck` — exit 0
2. `npm run lint` — exit 0
3. `npm run test:file -- tests/audit/vocabulary-compliance.test.ts` — 11/11 pass
4. `npm run test:summary` — all pass (expect no new test failures)
5. `npm run verify:summary` — UNQUALIFIED

Commit message footer:

```
Surfaces: S13 (observability), S8 (server/ai orchestrator instrumentation)
Verified: TS 0, Lint 0, Vocab 11/11, test:summary PASS, Verify UNQUALIFIED
```

### Functional verification

In dev:

1. Trigger a deliberate balance-sheet imbalance (e.g. modify a test fixture that violates A = L+E). Verify Sentry captures the event with `tags.financial:true` and `tags.financial_error_class:BalanceSheetImbalanceError`.
2. Trigger a verdict with invalid inputs (e.g. qualityScore=30 with severity=warning). Confirm `VerdictInvariantError` lands in Sentry with `zodIssues` in the context.
3. Start a research run and kill the Anthropic network connection mid-flight. Verify `OrchestratorTimeoutError` fires with the right phase.
4. Confirm the existing 20% sample rate still applies to non-financial errors (spot-check with a contrived non-financial throw).

---

## Rollback

Per-piece rollback paths:

- **Disable all financial capture:** remove the `beforeSend` hook (one commit revert). Errors still capture at default sample rate.
- **Disable a specific error class:** stop throwing it. The class definitions can stay in place without consequence.
- **Full revert:** single commit, one `git revert`. Clean.

No DB migrations, no new env vars (Sentry DSN already exists), no client bundle size impact beyond a few hundred bytes of error classes.

---

## After this handoff

Append ≤5 lines to `.claude/session-memory.md`:

> `Sentry financial contexts wired (<commit SHA>): 4 error classes (BalanceSheetImbalance, OrchestratorTimeout, VerdictInvariant, FinancialCalculation) all extend FinancialSentryError; beforeSend hook tags with financial:true; orchestrator phases emit breadcrumbs. DEPENDENCIES.md row updated.`

Reply here when done. Claude Code will then:

1. Review the first week of financial Sentry events
2. Draft Sentry alert configurations (cross-cutting — possibly a follow-up handoff or a runbook)
3. Decide on OT-B (Promptfoo) timing

---

## Conflict check

If any instruction contradicts `.claude/rules/error-handling.md`, `.claude/rules/balance-sheet-identity.md`, `.claude/rules/claude-replit-split.md`, or `.claude/rules/pre-commit-verification.md`, **the `.claude/rules/*` files win**. Flag the contradiction in `BLOCKED-sentry-contexts.md` and stop.

---

## Addendum — OT-A.3 era error classes (April 20, 2026)

Since this handoff was drafted (April 19, pre-OT-A.3 saga), three new rule-enforced error conditions have emerged from the Cognitive Engine migration. Consider tagging them the same way:

### Extension to `FinancialSentryError` hierarchy

Add these classes alongside the existing four. They already have matching rules; Sentry tagging makes runtime violations observable.

```typescript
/** Fires when a FIELD_DEFINITIONS entry ships with a banned typical-range hint. */
export class FieldDefinitionHintViolationError extends FinancialSentryError {
  readonly errorClass = "FieldDefinitionHintViolationError";
  constructor(context: {
    fieldKey: string;      // e.g. "rampMonths"
    hintMatched: string;   // the offending substring
    pattern: string;       // which banned regex pattern fired
  }) {
    super(
      `FIELD_DEFINITIONS hint violation on "${context.fieldKey}": "${context.hintMatched}" matches banned pattern "${context.pattern}"`,
      context,
    );
  }
}

/** Fires when ENGINE_VERSION hasn't been bumped but SYNTHESIS_FINGERPRINT changed. */
export class EngineVersionDriftError extends FinancialSentryError {
  readonly errorClass = "EngineVersionDriftError";
  constructor(context: {
    declaredFingerprint: string;
    actualFingerprint: string;
    declaredVersion: string;
  }) {
    super(
      `Engine version drift: declared ${context.declaredFingerprint.slice(0, 12)}... but actual is ${context.actualFingerprint.slice(0, 12)}...`,
      context,
    );
  }
}

/** Fires when an LLM contract migration attempts raw-output parity on mismatched shapes. */
export class ContractMigrationParityMisuseError extends FinancialSentryError {
  readonly errorClass = "ContractMigrationParityMisuseError";
  constructor(context: {
    legacyShape: "point" | "range" | "enum" | "prose";
    newShape: "point" | "range" | "enum" | "prose";
    parityLayer: "raw-output" | "downstream-effect";
    suggestedLayer?: "downstream-effect";
  }) {
    super(
      `Contract migration parity at ${context.parityLayer} layer attempted across shape mismatch: legacy=${context.legacyShape}, new=${context.newShape}`,
      context,
    );
  }
}
```

These are primarily **build-time** errors surfaced by proof tests (`tests/proof/field-definitions-no-hints.test.ts`, `tests/proof/engine-version-drift.test.ts`). But if any slip through to runtime (e.g. a Specialist dynamically constructs a FIELD_DEFINITIONS-like prompt), tagging them as `financial` in Sentry gives us the same canary behavior as the existing four classes.

### Linkage to ADR-004 verdict cache

ADR-004 (`docs/architecture/decisions/ADR-004-verdict-cache.md`, Proposed) adds a content-addressed cache to the Cognitive Engine. Cache invalidation depends on `ENGINE_VERSION` bumps being correct. If `EngineVersionDriftError` fires in production AFTER the cache ships (Phase 5A+), it means stale reasoning may have been served as fresh — that's an audit event worth a page, not just a Sentry tag. **Add to `@high-severity` alerts when the cache phase lands.**

### Breadcrumb addition for orchestrator phases

The existing `phase-<name>` breadcrumb pattern should extend to include the three new OT-A.3 safety conditions:

- `mode-collapse-check-passed` — per-field unique-range count ≥ 3 across N markets (where applicable).
- `field-definitions-verified` — synthesis prompt built without banned hints.
- `engine-version-match` — `SYNTHESIS_FINGERPRINT` matched at call time.

These don't need to emit anything normally; their absence in a Sentry event timeline tells you *where* in the pipeline a failure happened.

### One pending Sentry decision

Once this handoff lands, Claude Code will draft a Sentry alert runbook covering:
- `financial_error_class:BalanceSheetImbalanceError` → immediate page
- `financial_error_class:VerdictInvariantError` + frequency ≥ 3/hour → investigation
- `financial_error_class:EngineVersionDriftError` → immediate page (post-Phase-5A)
- `financial:true` + no match above → weekly digest

Track that as `OT-A-follow-up-sentry-alerts.md` — will draft after this handoff commits.
