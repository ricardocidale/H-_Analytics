/**
 * End-to-end (Playwright) coverage for the Analyst Adjust → deep-link
 * focus loop **starting from a Property Edit verdict surface and landing
 * on a `property-edit/<section>` field on the same page**. Companion to
 * `tests/e2e/analyst-adjust-deep-link.spec.ts` (Task #761), which
 * exercises the *cross-page* hand-off (Company Assumptions → Admin
 * Defaults). This spec covers the *same-page* hand-off, which has a
 * subtly different invariant: because the destination doesn't remount,
 * the focus hook can only fire if it is **URL-reactive** (Task #767
 * made `useFocusFieldFromUrl()` re-run on every `useSearch()` change).
 * A regression that reverts the hook back to a `[]` deps array would
 * silently break this loop and pass the cross-page spec — this spec
 * captures that contract.
 *
 * Real production path under test (no synthetic UI shortcuts):
 *   1. Pick a real seeded property via `GET /api/properties` (the dev
 *      server's `DEV_SKIP_AUTH=true` flag — see `server/dev-flags.ts`
 *      and `playwright.config.ts` — auto-grants a super_admin session).
 *   2. Mock `POST /api/analyst/refresh` so the Analyst run resolves
 *      deterministically with a synthetic verdict that includes a
 *      `dispositionCommission` dimension and a `consult-cognitive`
 *      action ("Adjust"). The server-side runner is expensive and
 *      non-deterministic; the mock keeps the test fast and isolated.
 *   3. Navigate to `/property/:id/edit` and click the real
 *      `button-ask-analyst-property` button on the Property Edit page.
 *      That button drives `useAnalystRefresh().triggerRefresh()` →
 *      `POST /api/analyst/refresh` → the page renders
 *      `<AnalystVerdictDisplay verdict={lastVerdict} propertyId={id} />`
 *      under `data-testid="property-analyst-verdict-section"`.
 *   4. Click the real `button-verdict-action-dispositionCommission-consult-cognitive`
 *      that `AnalystVerdictDisplay` renders (see
 *      `client/src/components/analyst/AnalystVerdictDisplay.tsx`
 *      lines 254-265). Its onClick goes through the production
 *      handler (`handleAction → mountTarget.navigate()`), which calls
 *      `resolveFieldMountPoint("property-edit/other-assumptions",
 *      { propertyId, fieldId: "dispositionCommission" })` (see
 *      `client/src/lib/analyst-mount-points.ts` lines 84-92). That
 *      resolver builds the `/property/:id/edit?focus=…#…` URL and
 *      hands it to wouter's `navigate()`. Wouter v3's monkey-patched
 *      `pushState` (see `node_modules/wouter/src/use-browser-location.js`
 *      lines 71-89) dispatches a synthetic event that `useSearch()`
 *      consumes — and `useFocusFieldFromUrl()` re-runs against the
 *      new search string, focusing the matching `data-field` marker.
 *   5. Assert: (a) the recorded nav history includes a URL with
 *      `focus=dispositionCommission`, (b) the recorded URL targets
 *      the same property's edit page (proves `propertyId` was
 *      threaded into the resolver), (c) the live activeElement is
 *      *inside* the `data-field="dispositionCommission"` wrapper,
 *      and (d) the active element is a real focusable form control
 *      (input, textarea, select, contenteditable, or `[tabindex]`).
 *
 * We pick `dispositionCommission` (Sale Commission slider on
 * `OtherAssumptionsSection.tsx`) because:
 *   - It is registered with mountPoint `property-edit/other-assumptions`
 *     in `engine/analyst/registry/field-registry.ts`, so the resolver
 *     produces a real same-page URL.
 *   - The `<div className="space-y-2" data-field="dispositionCommission">`
 *     wrapper carries an `EditableValue`'s `<input>` as its first
 *     focusable descendant — `findFocusableDescendant()` in
 *     `client/src/lib/analyst-focus-field.ts` will land on it.
 *   - It is a per-property field (no admin-defaults overlap), so
 *     adding the registry entry doesn't perturb the cross-page
 *     resolver test.
 *
 * Run locally:
 *   npx playwright test tests/e2e/analyst-adjust-deep-link-property-edit.spec.ts
 */
import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";

const FIELD_ID = "dispositionCommission";

/**
 * Synthetic AnalystVerdict shaped to match
 * `engine/analyst/contracts/verdict.ts`:
 *   - Tier 0 (no `cognitiveRunId` / `vendorsUsed` required).
 *   - One dimension whose `field` is the registry-known id
 *     `dispositionCommission` (mountPoint `property-edit/other-assumptions`).
 *   - `isNumericField: false` so no numeric `range` is required by the
 *     schema's "non-ok numeric verdicts must carry a range" refinement.
 *   - One evidence entry — `MIN_SOURCES_FOR_ADVICE = 1` per
 *     `shared/analyst-conviction.ts`.
 *   - One `consult-cognitive` action: this is the "Adjust" button under
 *     test (testId `button-verdict-action-<field>-consult-cognitive`).
 *   - `overallSeverity` matches the dimension severity per the verdict
 *     invariant.
 */
function buildPropertyVerdictFixture() {
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
        intent: "above-range",
        voice: {
          headline: "Sale commission is above the local broker band",
          detail: "Synthetic e2e fixture — not a real recommendation.",
        },
        actions: [
          {
            kind: "consult-cognitive",
            label: "Adjust",
            payload: { field: FIELD_ID, reason: "above-range" },
          },
        ],
      },
    ],
    voice: {
      headline: "Property verdict (e2e fixture)",
      detail: "Synthetic verdict for the property-edit Adjust deep-link e2e spec.",
    },
    meta: { tier: 0, durationMs: 5 },
  };
}

/**
 * Pick the first seeded property via the dev API. The photo-album e2e
 * spec (`tests/playwright/photo-album.spec.ts`) uses the same helper
 * shape; we don't share it because we only need one property and
 * sharing would couple two unrelated specs.
 */
async function pickAnyProperty(
  request: APIRequestContext,
): Promise<{ id: number; name: string }> {
  const res = await request.get("/api/properties");
  expect(res.status(), "GET /api/properties").toBe(200);
  const properties = (await res.json()) as Array<{ id: number; name: string }>;
  expect(
    properties.length,
    "dev DB must seed at least 1 property so the property-edit deep-link can be exercised",
  ).toBeGreaterThanOrEqual(1);
  return { id: properties[0].id, name: properties[0].name };
}

/**
 * Install a `pushState`/`replaceState` shim that records every URL the
 * SPA navigates to. Mirrors the helper in
 * `tests/e2e/analyst-adjust-deep-link.spec.ts` — same rationale: the
 * destination page's `useFocusFieldFromUrl()` strips `?focus` from the
 * URL after a successful focus (see `stripFocusParam` in
 * `client/src/lib/analyst-focus-field.ts`), so by the time we read
 * `page.url()` after the focus has landed the param is already gone.
 *
 * The shim is installed *over* wouter's monkey-patched `pushState` (see
 * `node_modules/wouter/src/use-browser-location.js` lines 71-89). Order
 * matters: this shim wraps the wouter-patched function, so wouter's
 * synthetic-event dispatch still fires and the focus hook still
 * re-runs.
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

test.describe("Analyst Adjust deep link — same-page (PropertyEdit)", () => {
  test("Adjust on a property-edit verdict surface focuses the field via URL-reactive hook", async ({
    page,
    request,
  }) => {
    const property = await pickAnyProperty(request);

    // Mock the Analyst refresh endpoint so the verdict appears
    // deterministically without burning the 60s server cooldown or
    // calling out to vendor models. We accept any POST body — the
    // real `useAnalystRefresh` hook posts `{ scope, fields?, specialistId? }`.
    await page.route("**/api/analyst/refresh", async (route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ verdict: buildPropertyVerdictFixture() }),
      });
    });

    await page.goto(`/property/${property.id}/edit`);

    // The PropertyEdit page lazy-loads sections — gate on the
    // `data-field` marker mounting before doing anything else, so a
    // slow draft fetch can't race the click below.
    const fieldWrapper = page.locator(`[data-field="${FIELD_ID}"]`);
    await expect(fieldWrapper).toBeVisible({ timeout: 30_000 });

    // Trigger the real Analyst run. The button drives
    // `useAnalystRefresh().triggerRefresh()` → `POST /api/analyst/refresh`
    // (intercepted above) → `setLastVerdict(data.verdict)` → the
    // verdict-section conditional renders below.
    const askAnalystButton = page.getByTestId("button-ask-analyst-property");
    await expect(askAnalystButton).toBeVisible();
    await expect(askAnalystButton).toBeEnabled();
    await askAnalystButton.click();

    // Wait for the verdict section AnalystVerdictDisplay renders
    // when a verdict is present.
    const verdictSection = page.getByTestId(
      "property-analyst-verdict-section",
    );
    await expect(verdictSection).toBeVisible({ timeout: 15_000 });

    // The real Adjust button rendered by `AnalystVerdictDisplay` for
    // the registry-known `dispositionCommission` field. Its onClick
    // goes through `handleAction → mountTarget.navigate()` →
    // `resolveFieldMountPoint("property-edit/other-assumptions",
    // { propertyId, fieldId })` → wouter `navigate()`.
    const adjustButton = page.getByTestId(
      `button-verdict-action-${FIELD_ID}-consult-cognitive`,
    );
    await expect(adjustButton).toBeVisible();

    // Capture URL transitions before triggering the SPA navigation,
    // because the focus hook strips `?focus` after it succeeds.
    await installNavigationRecorder(page);

    await adjustButton.click();

    // Wait for the URL-reactive focus hook to land on the marker. The
    // hook descends from the `data-field` wrapper into the first
    // focusable control via `findFocusableDescendant()`
    // (see `client/src/lib/analyst-focus-field.ts`). Poll because the
    // hook defers focus through `setTimeout(0)` and may retry once if
    // the first attempt no-ops (e.g. a hidden tab).
    await expect
      .poll(
        async () => {
          return await page.evaluate((fieldId) => {
            const wrapper = document.querySelector(
              `[data-field="${fieldId}"]`,
            );
            if (!wrapper) return "no-wrapper";
            const active = document.activeElement as HTMLElement | null;
            if (!active) return "no-active";
            return wrapper.contains(active) ? "inside" : "outside";
          }, FIELD_ID);
        },
        { timeout: 15_000, intervals: [100, 250, 500] },
      )
      .toBe("inside");

    // Assertion 1 — the recorded nav history includes a URL with
    // `?focus=<fieldId>`. We check the recorded history because the
    // focus hook strips the param after it succeeds, so a plain
    // `page.url()` read would miss it. This proves the registry +
    // resolver actually produced the focus URL — not the test.
    const navHistory = await readNavigationHistory(page);
    const focusedUrl = navHistory.find((u) =>
      u.includes(`focus=${FIELD_ID}`),
    );
    expect(
      focusedUrl,
      `Expected nav history to include a URL with ?focus=${FIELD_ID}, got: ${JSON.stringify(navHistory)}`,
    ).toBeDefined();

    // Assertion 2 — the recorded URL targets the same property's edit
    // page. Proves the resolver wired the real `propertyId` from the
    // page context (via the `<AnalystVerdictDisplay propertyId={…} />`
    // prop) into the navigation target — a regression that dropped
    // the prop or stopped passing it would land the user on
    // `/property//edit` or `/admin` instead and this assertion
    // would fail.
    expect(
      focusedUrl,
      `Focus URL should land on /property/${property.id}/edit`,
    ).toContain(`/property/${property.id}/edit`);

    // Assertion 3 — the recorded URL carries the section anchor that
    // the registry's mountPoint encodes (`property-edit/other-assumptions`
    // → `#other-assumptions`). Locks the registry → resolver hash
    // contract.
    expect(focusedUrl).toContain("#other-assumptions");

    // Assertion 4 — the live activeElement is a real focusable form
    // control inside the wrapper, not just a presentational descendant
    // (e.g. a label text node).
    const activeInfo = await page.evaluate((fieldId) => {
      const wrapper = document.querySelector(`[data-field="${fieldId}"]`);
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
    }, FIELD_ID);

    expect(activeInfo.insideWrapper).toBe(true);
    expect(
      activeInfo.ok,
      `Active element should be a focusable form control; got <${activeInfo.tag}>`,
    ).toBe(true);
  });
});
