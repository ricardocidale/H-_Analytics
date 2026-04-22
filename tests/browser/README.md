# Browser tests

This directory holds test plans and specs that exercise the app
through a real DOM (or a real browser, for the Playwright-driven
plans). They complement the unit / static tests in `tests/client/`,
`tests/server/`, and `tests/audit/`.

Two kinds of artifact live here:

1. **`*.plan.md`** — manual / live-server plans, executed via the
   agent testing skill (`runTest()`). These hit the running dev
   server through Playwright and cover end-to-end paths a component
   test cannot (real navigation, real API, real auth).

2. **Companion `*.test.tsx` files** — these live in `tests/client/`
   (so they're picked up by `vitest run`) and use happy-dom +
   `@testing-library/react` to render the same component tree the
   plan walks through. They run on every PR via `npm test` and
   `.github/workflows/ci.yml` (jobs: `Run Tests`, plus a dedicated
   `Constants tab read-only browser test (Phase 4 doctrine)` step
   that re-runs the file with its own name so failures are
   immediately attributable on the PR check list).

## Current plans and their CI counterparts

| Plan                                          | Vitest counterpart                                   | CI step                                                              |
|-----------------------------------------------|------------------------------------------------------|----------------------------------------------------------------------|
| `model-constants-tab-readonly.plan.md`        | `tests/client/model-constants-tab-browser.test.tsx`  | `Constants tab read-only browser test (Phase 4 doctrine)` (per-PR)   |
|                                               | `tests/client/model-constants-tab-readonly.test.tsx` | (same step)                                                          |

When a Phase 4 regression ships an `<input>`, `<textarea>`, or
`contenteditable` element inside any `row-model-constant-*` card,
the dedicated CI step fails with a message that lists the offending
row(s) by `data-testid` and points back to this plan. The plan can
then be re-run live against the dev server with `runTest()` to
confirm the fix end-to-end.

## Why two layers

Constants are authority-sourced (US Fed, IRS, IMF, central banks,
GAAP/USALI). Three guards enforce read-only-by-admin:

1. **Server guard** — `PUT /api/admin/model-constants/:key` returns
   HTTP 422 `SPECIALIST_OWNED_CONSTANT` for any specialist-owned key.
2. **Static-analysis lock** —
   `tests/client/model-constants-tab-readonly.test.tsx` greps the
   source for raw editable elements.
3. **Runtime DOM browser test** —
   `tests/client/model-constants-tab-browser.test.tsx` mounts every
   registry key and asserts zero editable elements at runtime,
   catching child components that wrap an editable internally.
