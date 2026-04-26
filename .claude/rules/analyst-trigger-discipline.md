# Analyst Trigger Discipline — Button Press Only

## Rule

The Analyst (any Surface Specialist's evaluation path, Tier-0 or Tier-1) MUST evaluate ONLY when the user explicitly presses the `<AnalystButton />` (or its `Consult` secondary). Save, edit, page load, scenario load, route navigation, focus revalidation, scheduled tasks, and all other implicit triggers are forbidden.

This rule is binding. Violations cost real $ (Tier-1 cognitive runs are LLM calls), undermine user agency (intelligence appears without consent), and erode trust (users feel the system is acting silently behind their back).

## Why

1. **Cost discipline.** Tier-1 evaluations involve N+1 cross-vendor LLM calls per `llm-vendor-roster.md`. Auto-triggering on every Save burns budget the user did not authorize.
2. **User agency.** Per `the-analyst-persona.md`, The Analyst delivers intelligence on demand. Auto-triggering surprises the user with results they didn't request and undermines the "Ask the Analyst" affordance.
3. **Trust.** Users who feel the system is making expensive decisions silently lose trust. The button press is the explicit consent gate.
4. **Cache hygiene.** Auto-triggering creates cache write storms keyed on transient input states (every keystroke could fire). Explicit press creates clean cache writes against finalized inputs.

## What's allowed

- **Reading cached prior verdicts.** A route handler MAY return a previously-computed `AnalystVerdict` from the verdict cache (`cacheState: "hit"`) without re-running the Specialist. The user sees their last paid-for intelligence; no new LLM call fires. This is reading, not evaluating.
- **Deterministic gates that don't involve The Analyst.** Phase 3b's `evaluateCapitalRaise()` / `evaluateRevenue()` are pure functions over benchmarks — fast, free, deterministic. They run as data-validation gates and are NOT The Analyst. They MAY run on Save **only** when their output is treated as a guard (e.g., "this value is outside expected range — proceed?"), not as Analyst intelligence.
- **Displaying staleness or missing-data badges.** A "Due for review" badge can prompt the user to click AnalystButton. The badge itself does NOT trigger an evaluation.

## What's forbidden

- **Save handlers that dispatch to a Specialist.** `/api/*/save-tab` and similar endpoints MUST persist data and return without running the Specialist.
- **`useEffect` hooks that fire `generateResearch()` / `consultCognitive()` / `router.dispatch()`** based on form-data change, page mount, focus, or any other state.
- **URL-param auto-triggers** like `?analyst=1` that fire The Analyst on page load. The exception: a URL the user explicitly clicked from another part of the app where they pressed AnalystButton — in that case, the click already happened upstream and the URL is just plumbing. But a user navigating directly to the URL (bookmark, paste, deep link) MUST require a fresh button press.
- **Auto-refresh toggles** that fire The Analyst when data goes stale. Replace with a "Due for review" badge that solicits a button press.
- **Window-focus revalidation** (e.g. `refetchOnWindowFocus: true` on a query that fires The Analyst).
- **Cron jobs / scheduled tasks** that run Specialists on a timer, except where the user explicitly opted into a scheduled run via an admin Resource (and even then, the schedule itself is the user's "press" — not implicit).
- **First-visit auto-runs.** When a user first lands on a page with no prior verdict, the page MUST display the empty state with a clear "Ask the Analyst" call to action — not silently fetch one.

## How to apply (verification before any new code path)

Before adding any code that calls a Specialist evaluator, ask:

1. Is this code path running because the user clicked `<AnalystButton />`?
   - **Yes** → OK. Proceed.
   - **No** → Stop. Either the Analyst call should be removed, or the trigger should be re-routed through an AnalystButton click.

2. If the path is reading cached intelligence (no new LLM call), is the cache lookup deterministic and idempotent? (No fresh evaluation on miss.)
   - **Yes** → OK. Document the read-only path.
   - **No** → Stop. Add a guard: on cache miss, return null + display the empty state. Let the user click the button.

## Surfaces to audit (initial sweep, 2026-04-26)

| Surface | Today | Required state |
|---|---|---|
| `POST /api/global-assumptions/save-tab` | Dispatches `MGMT_CO_FUNDING_ID` / `MGMT_CO_REVENUE_ID` per Save | Save persists data only; return cached `lastVerdict?` from store |
| `useCompanyAnalyst.tsx` `?analyst=1` deep-link | Auto-fires `generateResearch()` on URL param | Allowed only when upstream click set the URL; document the chain or remove |
| `useAutoRefreshIntelligence` hook + toggle | Fires `generateResearch()` when data goes stale and toggle is on | Remove the toggle; replace with "Due for review" badge |
| Any new Specialist registration | Must NOT add a save-time hook | All new Specialists wire only to AnalystButton click handlers |

A future `tests/proof/analyst-trigger-discipline.test.ts` should statically verify no Specialist dispatch lives inside a `*save-tab*` route handler or a `useEffect` hook.

## Related

- `.claude/rules/the-analyst-persona.md` — The Analyst is on-demand intelligence; this rule operationalizes that.
- `.claude/rules/branding-vocabulary-enforcement.md` — "Ask the Analyst" button label, "Due for review" copy.
- `.claude/rules/specialist-intelligence-bar.md` — Tier-1 cost economics; this rule prevents budget burn.
- `.claude/rules/llm-vendor-roster.md` — N+1 multi-vendor cost is real per call; auto-triggering compounds it.
- Memory: `analyst_trigger_discipline.md` — feedback memory anchoring this rule.
