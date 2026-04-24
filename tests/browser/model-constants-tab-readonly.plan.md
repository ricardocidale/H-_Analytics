# Browser test plan — admin Constants tab is read-only (Phase 4 doctrine)

Two layers protect the read-only Constants doctrine at runtime:

1. **`tests/client/model-constants-tab-browser.test.tsx`** — the
   automated runtime DOM render test that runs as part of `npm test`
   (vitest, happy-dom, @testing-library/react) **and on every PR**
   via the `Constants tab read-only browser test (Phase 4 doctrine)`
   step in `.github/workflows/ci.yml`. It mounts
   `<ModelConstantsTab />` with EVERY specialist-owned key from
   `MODEL_CONSTANTS_REGISTRY` mounted at once, then asserts:
     - 0 `<input>`, 0 `<textarea>`, 0 `[contenteditable="true"]`
       inside any `row-model-constant-*` card.
     - Every row carries a Specialist letter badge, a Refresh research
       button, and a History button.
     - Refresh research opens a popover with Previous/New diff,
       Authority + Evidence section, Apply + Discard buttons.
     - Discard closes the popover without issuing apply-proposal.
   This is the test that fails the build on a regression.

2. **This plan** — the manual / live-server counterpart, exercised
   via the agent testing skill (`runTest()`). It catches end-to-end
   regressions that the component-level test cannot, because it goes
   through real navigation, real API calls (including a real
   AI-Specialist refresh), and the real production assembly. Use it
   when verifying a Phase 4 change in the running dev server.

## How to run

Use the agent testing skill (`runTest()`). It launches a Playwright-based
testing subagent against the running dev server. Auth is auto-granted in
dev because `server/dev-flags.ts` sets `DEV_SKIP_AUTH = true`, so the
subagent lands on `/admin` already logged in as the seeded super_admin
(`ricardo.cidale@norfolkgroup.io`). No login step is needed in dev.

The plan below is verbatim what was successfully executed (subagent
`31598818-d4eb-4878-9e6d-4dab17e3a174`, status: success). Re-run any time
by pasting the steps into a new `runTest()` call.

## Plan

```
1. [New Context] Create a new browser context.
2. [Browser] Navigate to /admin.
3. [Browser] Click sidebar group "Defaults"
   (data-testid="admin-nav-group-defaults") to expand it.
4. [Browser] Click "Constants" (data-testid="admin-nav-constants").
5. [Verify] Tab content is rendered:
   - data-testid="tab-content-model-constants" is visible
   - At least one row "row-model-constant-..." is visible
6. [Verify] Read-only doctrine across ALL row-model-constant-* elements:
   - 0 <input>
   - 0 <textarea>
   - 0 [contenteditable="true"]
7. [Verify] Per-row affordances on EVERY row:
   - exactly one Specialist letter badge
     (data-testid starts with "badge-specialist-", letters H/I/J/K)
   - a "Refresh research" button
     (data-testid="button-refresh-research-<key>")
   - a "History" button
     (data-testid="button-history-<key>")
8. [Browser] Click the first row's refresh button.
9. [Verify] Popover opens (data-testid="popover-refresh-research-<key>")
   and shows the loading state. Wait up to 90s — refresh hits a real
   AI Specialist.
10. [Verify] After load, popover renders Previous/New diff + evidence:
    - data-testid="refresh-previous-<key>" has a value (not "—")
    - data-testid="refresh-new-<key>" has a value
    - popover text contains "Previous", "New", "Authority", "Evidence"
    - "Discard" button (button-discard-refresh-<key>) present
    - "Apply" button (button-apply-refresh-<key>) present
11. [Browser] Click Discard.
12. [Verify] Popover is no longer visible.
```

## Why this layer exists

Constants are authority-sourced (US Fed, IRS, IMF, central banks,
GAAP/USALI). They are written exclusively by AI Intelligence Specialists.
Admins must never be able to type a value. Three layers enforce this:

1. **Server guard** — `PUT /api/admin/model-constants/:key` returns
   HTTP 422 `SPECIALIST_OWNED_CONSTANT` for any specialistOwned key.
2. **Static-analysis lock** —
   `tests/client/model-constants-tab-readonly.test.tsx` and
   `tests/client/model-constants-tab-readonly.test.ts`-style greps
   forbid raw editable elements in the source.
3. **This runtime browser test** — catches regressions where a child
   component (e.g. a date picker, a hidden Input wrapped by another
   component) would render an editable element at runtime even though
   the source greps clean.
