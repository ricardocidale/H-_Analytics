# Browser test plan — Admin → Analyst Tables refresh / commit / discard flow

End-to-end Playwright plan for the Analyst Tables admin surface (Task #345).
The seven backend guards in `server/middleware/analyst-refresh-guards.ts`
have unit tests, but the full admin UX — refresh button → theater overlay
→ diff dialog → commit/discard → suspicious-activity banner — was only
covered by hand. This plan exercises that flow against the running dev
server.

## How to run

Use the agent testing skill (`runTest()`). It launches a Playwright-based
testing subagent against the running dev server. Auth is auto-granted in
dev because `server/dev-flags.ts` sets `DEV_SKIP_AUTH = true`, so the
subagent lands on `/admin` already logged in as the seeded super_admin
(`ricardo.cidale@norfolkgroup.io`). No login step is needed in dev.

The Analyst Tables admin section is currently orphaned in the sidebar
(it has no `admin-nav-analyst-tables` button). To reach it from a test
the plan uses `window.__setAdminSection`, a dev/test-only escape hatch
exposed by `client/src/lib/admin-nav.ts` and gated by
`import.meta.env.DEV`. The hook never ships in production bundles —
it mirrors the existing `DEV_SKIP_AUTH` affordance.

The refresh endpoint (`POST /api/admin/analyst-tables/:id/refresh`) is
guarded against missing OpenAI keys: `researchCapitalRaiseBenchmarks` /
`researchExitMultiples` in `server/ai/analyst-table-refresh.ts` fall
back to the current ranges + `FALLBACK_NARRATION` if the LLM call fails,
so the test does not require a live `AI_INTEGRATIONS_OPENAI_API_KEY`.

## Plan

```
1. [New Context] Create a new browser context.
2. [Browser] Navigate to /admin.
3. [Verify] The admin page is rendered:
   - data-testid="admin-content-defaults-management-company" is visible
     (default landing section).
4. [Browser] Run JS in the page:
     window.__setAdminSection('analyst-tables')
   This switches the in-memory admin section to Analyst Tables. No URL
   change is required — the Admin page subscribes via useSyncExternalStore.
5. [Verify] The Analyst Tables tab is rendered:
   - data-testid="analyst-tables-tab" is visible.
   - data-testid="admin-content-analyst-tables" is visible.
   - At least one row "card-analyst-table-capital_raise_benchmarks"
     OR "card-analyst-table-exit_multiples" is visible.
   - Each rendered row exposes:
       * data-testid="text-table-label-<id>"
       * data-testid="badge-freshness-<id>" with text "fresh", "stale",
         or "missing"
       * a Sparkles "Analyst" button (data-testid="button-analyst-<id>").
6. [Verify] Suspicious-activity banner state is consistent:
   - If data-testid="banner-suspicious-activity" is present, it contains
     the copy "Unusual refresh activity detected".
   - If absent, the page renders without it (the banner is gated on the
     server's `lastSuspiciousAlertAt` being within the last hour).
7. [Browser] Click the refresh button on the Capital Raise Benchmarks row:
   - data-testid="button-analyst-capital_raise_benchmarks"
8. [Verify] The theater overlay appears within ~2 seconds:
   - data-testid="analyst-refresh-theater" is visible.
   - The overlay shows a heading "Gaspar is researching".
   - data-testid="text-narration" is present with non-empty text.
   - data-testid="text-elapsed" is present and shows "Elapsed: <n>s".
9. [Verify] Narration rotates while the request is in flight:
   - Capture the text of data-testid="text-narration".
   - Wait ~2.5s (rotation cadence is 2200ms).
   - Capture again. The two strings should differ (the ticker rotates
     through `DEFAULT_NARRATION` in AnalystRefreshTheater.tsx).
   - If the request resolved before the second capture (e.g. fallback
     path with no LLM), record this as PASS — the rotation guarantee
     applies only while pending.
10. [Verify] Wait up to 90s for the refresh to resolve and the diff
    dialog to open:
    - data-testid="refresh-diff-dialog" is visible.
    - data-testid="analyst-refresh-theater" is no longer visible.
    - The dialog title contains "Review proposed ranges".
    - data-testid="text-refresh-meta" is present with "<n> sources ·
      <n> tokens used" copy.
    - At least one row data-testid^="diff-row-" is rendered.
    - Each diff row shows three columns: Dimension label, Current
      (low / mid / high), Proposed (low / mid / high). Numeric cells
      may be "—" when no current value exists yet, but proposed cells
      always render.
    - The dialog footer exposes data-testid="button-discard" and
      data-testid="button-commit", both enabled.
11. [Browser] Click data-testid="button-commit".
12. [Verify] The dialog closes cleanly within ~10s:
    - data-testid="refresh-diff-dialog" is no longer in the DOM.
    - data-testid="analyst-refresh-theater" is no longer visible.
    - A toast appears with text containing "Ranges committed" or
      "The benchmark table is now live."
    - The Capital Raise Benchmarks row re-renders with freshness badge
      "fresh" (data-testid="badge-freshness-capital_raise_benchmarks"
      text === "fresh").
13. [Browser] Click the refresh button again on the same row:
    - data-testid="button-analyst-capital_raise_benchmarks"
14. [Verify] The theater overlay reappears, then the diff dialog opens
    again (same waits as step 10).
15. [Browser] Click data-testid="button-discard".
16. [Verify] Discard path closes the dialog cleanly without writing:
    - data-testid="refresh-diff-dialog" is no longer in the DOM.
    - A toast appears with text containing "Refresh discarded" or
      "No changes were applied".
    - data-testid="analyst-tables-tab" is still visible.
```

## Why this layer exists

The Analyst-Tables admin surface is the operator's only manual lever
over the LLM-sourced benchmark singletons (capital raise, exit
multiples). Three layers of test discipline cover it:

1. **Unit tests** — `tests/server/analyst-tables-routes.test.ts` and
   the seven guard tests under `tests/server/` cover the API + guards.
2. **Component test** — happy-dom render tests under `tests/client/`
   cover individual pieces (theater, diff dialog, banner) in isolation.
3. **This plan** — the live-server end-to-end counterpart, exercised
   via the agent testing skill (`runTest()`). It catches regressions
   that the unit and component tests cannot, because it goes through
   real navigation, the real wouter router, real React Query
   invalidation, real toast plumbing, and the real
   `POST /refresh → POST /commit | POST /discard` round-trip.

Re-run any time by pasting the steps above into a new `runTest()` call.
