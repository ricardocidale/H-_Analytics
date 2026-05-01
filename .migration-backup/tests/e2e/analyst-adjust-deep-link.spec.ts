/**
 * End-to-end (Playwright) coverage for the Analyst Adjust → deep-link
 * focus flow. Companion to the jsdom-level test
 * `tests/client/analyst-adjust-deep-link-e2e.test.tsx` (Task #761), which
 * verifies the registry → mount-point → URL contract and that
 * `useFocusFieldFromUrl()` focuses a `data-field` on mount, but cannot
 * exercise the real-browser hand-off between the click handler, the
 * SPA navigation, the destination page mount, and the actual focus
 * landing on a real input element.
 *
 * This spec drives a real browser through the full loop:
 *   1. Render the funding verdict on `/company/assumptions?tab=funding`
 *      by mocking `POST /api/analyst/refresh` (the funding specialist)
 *      with a synthetic verdict that includes a registry-known
 *      dimension whose mount point lives on a *different* page.
 *   2. Click the dimension's "Adjust" button (the `consult-cognitive`
 *      action), which triggers `mountTarget.navigate()` from
 *      `client/src/lib/analyst-mount-points.ts`.
 *   3. Assert the URL the browser ends up on contains
 *      `?focus=<fieldId>` — captured via a `pushState`/`replaceState`
 *      shim installed before the click, because
 *      `useFocusFieldFromUrl()` strips the param after focus succeeds.
 *   4. Assert the matching field's actual `<input>` is the focused
 *      element in the live DOM.
 *
 * We pick `defaultRevShareFb` (registered with mountPoint
 * `defaults/revenue` in `engine/analyst/registry/field-registry.ts`)
 * because:
 *   - It is a registry-known dimension.
 *   - Its mount point is `/admin#defaults-property/revenue` — i.e. a
 *     *different* page than the surface that rendered the verdict.
 *     This is the only path that actually remounts the destination
 *     page so `useFocusFieldFromUrl()` (which has a `[]` dep and runs
 *     once per mount) fires and focuses the field. A same-page
 *     `company-assumptions/funding` field would update the URL but
 *     never re-trigger the hook.
 *   - Its rendered control in `PropertyUnderwritingTab.tsx` carries
 *     `data-testid="field-defaultRevShareFb"` and is a focusable input.
 *
 * Auth: `playwright.config.ts` boots the dev server with
 * `DEV_SKIP_AUTH=true` (see `server/dev-flags.ts`), which auto-grants
 * a super_admin session, so no interactive login is needed here.
 *
 * Run locally:
 *   npx playwright test tests/e2e/analyst-adjust-deep-link.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";

const FIELD_ID = "defaultRevShareFb";

/**
 * Synthetic Analyst verdict served in place of a real funding-specialist
 * run. Shape mirrors `AnalystVerdict` from
 * `engine/analyst/contracts/verdict.ts`:
 *   - Tier 0 (no `cognitiveRunId` / `vendorsUsed` required).
 *   - One dimension whose `field` is a registry-known id with a
 *     *different-page* mount point (`defaults/revenue`).
 *   - `isNumericField: false` so no numeric `range` is required by the
 *     schema's "non-ok numeric verdicts must carry a range" refinement.
 *   - One evidence entry — `MIN_SOURCES_FOR_ADVICE = 1` per
 *     `shared/analyst-conviction.ts`.
 *   - One `consult-cognitive` action: this is the "Adjust" button under
 *     test (testId `button-verdict-action-<field>-consult-cognitive`).
 *   - `overallSeverity` = max(dimension severities) per the verdict
 *     invariant.
 */
function buildFundingVerdictFixture() {
  return {
    specialistId: "mgmt-co.funding",
    generatedAt: new Date().toISOString(),
    overallSeverity: "warning",
    overallQualityScore: 78,
    dimensions: [
      {
        field: FIELD_ID,
        isNumericField: false,
        severity: "warning",
        range: null,
        qualityScore: 78,
        evidence: [
          {
            sourceName: "e2e fixture",
            sourceTier: "estimated",
            asOf: "2026-04-01",
            personaFit: 0.9,
          },
        ],
        intent: "below-range",
        voice: {
          headline: "Worth a second look at the FB rev-share default",
          detail: "Synthetic e2e fixture — not a real recommendation.",
        },
        actions: [
          {
            kind: "consult-cognitive",
            label: "Adjust",
            payload: { field: FIELD_ID, reason: "below-range" },
          },
        ],
      },
    ],
    voice: {
      headline: "Funding verdict (e2e fixture)",
      detail: "Synthetic verdict for the Adjust deep-link e2e spec.",
    },
    meta: { tier: 0, durationMs: 5 },
  };
}

/**
 * Install a `pushState`/`replaceState` shim that records every URL the
 * SPA navigates to. We need this because the destination page's
 * `useFocusFieldFromUrl()` hook strips `?focus` from the URL
 * immediately after a successful focus (see
 * `client/src/lib/analyst-focus-field.ts → stripFocusParam`), so by
 * the time we read `page.url()` after the focus has landed the param
 * is already gone. The shim captures the intermediate URL state.
 *
 * Must be called *before* clicking the Adjust button.
 */
async function installNavigationRecorder(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as {
      __navHistory?: string[];
      __navInstalled?: boolean;
    };
    if (w.__navInstalled) return;
    w.__navHistory = [];
    const record = (url: string | URL | null | undefined): void => {
      if (url == null) return;
      try {
        const abs = new URL(String(url), window.location.href).toString();
        w.__navHistory!.push(abs);
      } catch {
        w.__navHistory!.push(String(url));
      }
    };
    const origPush = window.history.pushState.bind(window.history);
    const origReplace = window.history.replaceState.bind(window.history);
    window.history.pushState = function (data, unused, url) {
      record(url ?? null);
      return origPush(data, unused, url ?? null);
    };
    window.history.replaceState = function (data, unused, url) {
      record(url ?? null);
      return origReplace(data, unused, url ?? null);
    };
    w.__navInstalled = true;
  });
}

async function readNavigationHistory(page: Page): Promise<string[]> {
  return await page.evaluate(() => {
    const w = window as unknown as { __navHistory?: string[] };
    return [...(w.__navHistory ?? [])];
  });
}

test.describe("Analyst Adjust deep link (real browser)", () => {
  test("clicking Adjust on a funding verdict deep-links and focuses the field", async ({
    page,
  }) => {
    // Mock the Analyst refresh endpoint so the funding verdict appears
    // deterministically without burning the 60s server cooldown or
    // calling out to vendor models. The funding specialist is invoked
    // with `specialistId=mgmt-co.funding`; we accept any POST body.
    await page.route("**/api/analyst/refresh", async (route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ verdict: buildFundingVerdictFixture() }),
      });
    });

    await page.goto("/company/assumptions?tab=funding");

    // The page-level Ask-Analyst button on the funding tab uses
    // testId `button-ask-analyst-funding` (see
    // CompanyAssumptionsTabsView.tsx). Wait for it to be ready, then
    // click it to trigger the mocked refresh.
    const askAnalyst = page.getByTestId("button-ask-analyst-funding");
    await expect(askAnalyst).toBeVisible({ timeout: 30_000 });
    await expect(askAnalyst).toBeEnabled();
    await askAnalyst.click();

    // Verdict section renders inside the funding tab once the mocked
    // response resolves.
    const verdictSection = page.getByTestId("funding-verdict-section");
    await expect(verdictSection).toBeVisible({ timeout: 15_000 });

    const adjustButton = page.getByTestId(
      `button-verdict-action-${FIELD_ID}-consult-cognitive`,
    );
    await expect(adjustButton).toBeVisible();

    // Capture URL transitions before triggering the SPA navigation,
    // because the destination's focus hook strips `?focus` after it
    // succeeds.
    await installNavigationRecorder(page);

    await adjustButton.click();

    // Wait for the destination admin section to mount and the focused
    // field's input to actually receive focus. The mount-point
    // resolver for `defaults/revenue` calls
    // `setAdminSection("defaults-property")` (which navigates to
    // `/admin`) and then `navigate("/admin?focus=<id>#defaults-property/revenue")`.
    // PropertyUnderwritingTab then mounts and runs
    // `useFocusFieldFromUrl()`, which scrolls to + focuses the field.
    await page.waitForURL(/\/admin(\?|#|$)/, { timeout: 15_000 });

    const fieldWrapper = page.getByTestId(`field-${FIELD_ID}`);
    await expect(fieldWrapper).toBeVisible({ timeout: 15_000 });

    // The focus hook descends from the `data-testid` wrapper into the
    // first focusable control via `findFocusableDescendant()`
    // (see `client/src/lib/analyst-focus-field.ts`). Wait until the
    // active element is *inside* the wrapper — guards against the
    // hook's `setTimeout(0)` deferral and any retry attempts.
    await expect
      .poll(
        async () => {
          return await page.evaluate((testId) => {
            const wrapper = document.querySelector(
              `[data-testid="${testId}"]`,
            );
            if (!wrapper) return "no-wrapper";
            const active = document.activeElement as HTMLElement | null;
            if (!active) return "no-active";
            return wrapper.contains(active) ? "inside" : "outside";
          }, `field-${FIELD_ID}`);
        },
        { timeout: 15_000, intervals: [100, 250, 500] },
      )
      .toBe("inside");

    // Assertion 1 — URL the browser ended up on (or passed through)
    // contains `?focus=<fieldId>`. We check the recorded history
    // because the focus hook strips the param after it succeeds.
    const navHistory = await readNavigationHistory(page);
    const focusedUrl = navHistory.find((u) =>
      u.includes(`focus=${FIELD_ID}`),
    );
    expect(
      focusedUrl,
      `Expected nav history to include a URL with ?focus=${FIELD_ID}, got: ${JSON.stringify(navHistory)}`,
    ).toBeDefined();

    // Assertion 2 — the matching field's actual input is the
    // focused element in the live DOM. We re-read activeElement and
    // assert it is a real form control inside the field wrapper, not
    // just any descendant (e.g. a label text node or a presentational
    // span).
    const activeInfo = await page.evaluate((testId) => {
      const wrapper = document.querySelector(`[data-testid="${testId}"]`);
      const active = document.activeElement as HTMLElement | null;
      if (!wrapper || !active) {
        return { ok: false, tag: null, insideWrapper: false };
      }
      const tag = active.tagName.toLowerCase();
      const isFormControl =
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        active.hasAttribute("contenteditable") ||
        active.hasAttribute("tabindex");
      return {
        ok: isFormControl,
        tag,
        insideWrapper: wrapper.contains(active),
      };
    }, `field-${FIELD_ID}`);

    expect(activeInfo.insideWrapper).toBe(true);
    expect(
      activeInfo.ok,
      `Active element should be a focusable form control; got <${activeInfo.tag}>`,
    ).toBe(true);
  });
});
