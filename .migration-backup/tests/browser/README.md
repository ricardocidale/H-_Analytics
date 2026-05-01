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
   `Read-only admin tabs browser tests (Phase 4 doctrine)` step
   that re-runs the relevant files with their own name so failures
   are immediately attributable on the PR check list).

## Current plans and their CI counterparts

All Phase 4 read-only-doctrine companions run under one labeled CI
step: **`Read-only admin tabs browser tests (Phase 4 doctrine)`**
(see `.github/workflows/ci.yml`). The step re-runs every file in
the table below, so a regression on any covered admin surface
fails this clearly-named PR check (rather than being buried inside
the generic "Run Tests" output).

| Surface protected                                    | Vitest companion                                                       |
|------------------------------------------------------|------------------------------------------------------------------------|
| Constants tab (entire tab is read-only)              | `tests/client/model-constants-tab-browser.test.tsx`                    |
| Constants tab (single-row contract: taxRate)         | `tests/client/model-constants-tab-readonly.test.tsx`                   |
| Property Underwriting tab — Authority-Governed band  | `tests/client/property-underwriting-readonly-band-browser.test.tsx`    |
| Market & Macro tab — Authority-Governed bands        | `tests/client/market-macro-readonly-band-browser.test.tsx`             |
| Management Company Defaults tab — Authority-Gov bands | `tests/client/company-readonly-band-browser.test.tsx`                  |
| Photo album — non-admin viewer hides admin controls  | `tests/client/photo-album-viewer-readonly.test.tsx`                    |

The photo-album admin happy path (upload → AI enhance → multi-select →
move-between-properties → bulk delete) is covered three ways:

1. **`tests/playwright/photo-album.spec.ts`** — executable Playwright
   spec that drives the real UI end-to-end. Run with
   `npx playwright test tests/playwright/photo-album.spec.ts` while
   the dev server is up. The optional enhance round-trip is gated by
   `RUN_REPLICATE=1`.
2. **`photo-album.plan.md`** (this directory) — the matching
   `runTest()` plan, useful for ad-hoc agent-driven validation.
3. **`tests/e2e/photo-album-flow.test.ts`** — deterministic vitest
   API e2e (gated by `E2E=1`) that exercises the same upload → move →
   bulk-delete round-trip plus the `/enhance/reject` route, without
   spending Replicate quota.

The Constants-tab tests are accompanied by the live-server plan
`model-constants-tab-readonly.plan.md`. The three companion files
that protect the *embedded* Authority-Governed bands on the other
Defaults tabs do not (yet) have their own live-server plan — the
component tests are sufficient because each band is structurally
simple (a read-only `<Input>` inside a `section-model-constants-*`
container). If a band grows interactive affordances (e.g. a
"Refresh research" popover like the Constants tab has), add a
matching `*.plan.md` here and re-run with `runTest()`.

### What a regression looks like

Each companion test scans a well-defined set of read-only
containers — `[data-testid="row-model-constant-*"]` for the
Constants tab, and `[data-testid^="section-model-constants-"],
[data-testid$="-readonly"]` for the other tabs — and asserts that
no user-editable element lives inside. "User-editable" means an
`<input>` that is not `readOnly`/`disabled` and not of a non-text
type (`hidden`, `button`, `submit`, `reset`, `image`, `checkbox`,
`radio`); a `<textarea>` that is not `readOnly`/`disabled`; or
`[contenteditable]` with any value other than `"false"`. On
failure the test names the offending container(s) by
`data-testid` so a PR author sees exactly which row or band
regressed without scrolling through the diff. The Constants-tab
tests can additionally be re-run live against the dev server with
`runTest()` to confirm the fix end-to-end.

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
