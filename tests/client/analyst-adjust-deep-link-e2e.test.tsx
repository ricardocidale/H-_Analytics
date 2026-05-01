// @vitest-environment happy-dom
/**
 * Task #761 — End-to-end coverage for the Analyst "Adjust" CTA round-trip.
 *
 * Background:
 *   The mount-point resolver (`client/src/lib/analyst-mount-points.ts`)
 *   and the URL-driven focus hook (`client/src/lib/analyst-focus-field.ts`)
 *   already have unit-test coverage in isolation. What was missing — and
 *   what this file adds — is the end-to-end seam: click the verdict's
 *   "Adjust" button → resolver appends `?focus=<fieldId>` → destination
 *   page mounts → focus hook scrolls + focuses the matching form field.
 *
 *   A regression in any single piece (registry entry, slug resolver,
 *   focus hook, or host page wiring) would only surface today as a
 *   silent UX issue: the user clicks "Adjust" and lands on the right
 *   section but the wrong field is highlighted, or no field is, or no
 *   navigation happens at all. The two tests below close that gap.
 *
 * Tests:
 *   1. Render `AnalystVerdictDisplay` with a registry-known dimension,
 *      click the consult-cognitive ("Adjust") button, and assert the
 *      destination URL the resolver navigates to carries
 *      `?focus=<fieldId>`.
 *   2. Mount the destination admin tab (`PropertyUnderwritingTab`) with
 *      `?focus=<fieldId>` already in the URL and assert the matching
 *      `[data-testid="field-<id>"]` container receives the focus
 *      side-effect (scrollIntoView) the hook fires on success, and that
 *      the hook strips the `?focus` param from the URL afterwards so a
 *      back-nav or re-render doesn't re-fire the side-effect.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// wouter's `navigate` mutates window.location via pushState; we mock it
// so the resolver can be exercised in jsdom-style envs without a real
// router and so we can assert the exact URL the verdict's "Adjust"
// button asked for. Mirrors the unit-test stub in
// `tests/client/analyst-mount-points.test.ts`.
const navigateMock = vi.fn();
vi.mock("wouter/use-browser-location", () => ({
  navigate: (...args: unknown[]) => navigateMock(...args),
}));

// `setAdminSection` is a side-effect on the admin shell's tab state
// invoked by the resolver for `defaults/*` slugs. Test 1 uses a
// `property-edit/*` slug (which doesn't call it) and test 2 mounts the
// destination tab directly, so this stub keeps the import surface
// satisfied without participating in either assertion.
const setAdminSectionMock = vi.fn();
vi.mock("@/lib/admin-nav", () => ({
  setAdminSection: (...args: unknown[]) => setAdminSectionMock(...args),
}));

// PropertyUnderwritingTab gates its Authority-Governed band on
// super_admin via useAuth(); mirror the same shape used by the
// existing readonly-band tests so the tab renders fully.
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { id: "test-super", role: "super_admin" },
    isAdmin: true,
    isSuperAdmin: true,
  }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

import { TooltipProvider } from "../../client/src/components/ui/tooltip";
import { AnalystVerdictDisplay } from "../../client/src/components/analyst/AnalystVerdictDisplay";
import { PropertyUnderwritingTab } from "../../client/src/components/admin/model-defaults/PropertyUnderwritingTab";
import { CompanyTab } from "../../client/src/components/admin/model-defaults/CompanyTab";
import { MarketMacroTab } from "../../client/src/components/admin/model-defaults/MarketMacroTab";
import { ModelConstantsTab } from "../../client/src/components/admin/model-defaults/ModelConstantsTab";
import { resolveFieldMountPoint } from "../../client/src/lib/analyst-mount-points";
import { getFieldRegistryEntry } from "@engine/analyst/registry/field-registry";
import {
  buildAnalystVerdict,
  __castVoiceRendered,
  type VerdictDimension,
  type VoiceBlock,
} from "@engine/analyst/contracts/verdict";

function voice(headline: string, detail?: string): VoiceBlock {
  return {
    headline: __castVoiceRendered(headline),
    detail: detail ? __castVoiceRendered(detail) : undefined,
  };
}

function makeVerdictForField(fieldId: string) {
  const dimension: VerdictDimension = {
    field: fieldId,
    isNumericField: true,
    severity: "warning",
    range: { low: 18, mid: 24, high: 30, unit: "mo" },
    qualityScore: 78,
    evidence: [
      {
        source: "test fixture",
        tier: "estimated",
        asOf: "2026-04-01",
        personaFit: 0.9,
      },
    ],
    voice: voice(
      `${fieldId} sits below Gustavo's range`,
      "Take another look at the funding plan.",
    ),
    actions: [
      {
        kind: "consult-cognitive",
        label: "Adjust",
        payload: { field: fieldId, reason: "below-range" },
      },
    ],
  };
  return buildAnalystVerdict({
    specialistId: "mgmt-co.funding",
    dimensions: [dimension],
    surfaceVoice: voice("Verdict for tests"),
    meta: { tier: 0, durationMs: 5 },
    generatedAt: "2026-04-28T00:00:00.000Z",
  });
}

// Tracks the element scrollIntoView was last called on so test 2 can
// verify the focus hook targeted the right field container without
// depending on whether Radix Slider thumbs render with focusable
// tabindex in happy-dom.
let lastScrolledElement: Element | null = null;

beforeEach(() => {
  navigateMock.mockReset();
  setAdminSectionMock.mockReset();
  lastScrolledElement = null;
  // happy-dom + Radix compatibility shims (mirrors
  // tests/client/property-underwriting-readonly-band-browser.test.tsx).
  // Use a plain function (not arrow) so `this` binds to the element the
  // focus hook scrolls into view.
  Element.prototype.scrollIntoView = function (this: Element) {
    lastScrolledElement = this;
  } as Element["scrollIntoView"];
  if (
    !(Element.prototype as unknown as { hasPointerCapture?: unknown })
      .hasPointerCapture
  ) {
    (
      Element.prototype as unknown as { hasPointerCapture: () => boolean }
    ).hasPointerCapture = () => false;
  }
  // Reset the URL between tests so a stale `?focus=` from one test
  // doesn't leak into the other.
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Analyst 'Adjust' CTA — end-to-end deep-link round-trip", () => {
  it("clicking Adjust on a registry-known dimension navigates to a URL containing ?focus=<fieldId>", () => {
    // Pick a field that exists in the field registry. We deliberately
    // do NOT hardcode the resulting URL — the registry's mountPoint
    // moves over time as Specialists rehome their fields (e.g. task
    // #760 moved capitalRaise1Amount from property-edit/* to
    // company-assumptions/*). The contract this test protects is:
    //
    //   "Clicking Adjust on a registered dimension navigates to the
    //    URL the resolver produces for that dimension's mountPoint,
    //    and that URL carries ?focus=<fieldId>."
    //
    // So we look up the registry entry, ask the resolver what URL it
    // would produce, and assert the verdict UI calls navigate() with
    // exactly that URL. A regression in the registry, the resolver,
    // or the verdict UI's wiring all surface here.
    const FIELD = "capitalRaise1Amount";
    const registryEntry = getFieldRegistryEntry(FIELD);
    expect(
      registryEntry,
      `${FIELD} must remain in the field registry for this test to be meaningful`,
    ).not.toBeNull();
    const expectedTarget = resolveFieldMountPoint(registryEntry!.mountPoint, {
      propertyId: 42,
      fieldId: FIELD,
    });
    expect(
      expectedTarget,
      `resolver must return a target for the registered mountPoint '${registryEntry!.mountPoint}'`,
    ).not.toBeNull();
    expect(expectedTarget!.href).toContain(`focus=${FIELD}`);

    const verdict = makeVerdictForField(FIELD);
    render(
      React.createElement(
        TooltipProvider,
        null,
        React.createElement(AnalystVerdictDisplay, {
          verdict,
          propertyId: 42,
        }),
      ),
    );

    const adjustBtn = screen.getByTestId(
      `button-verdict-action-${FIELD}-consult-cognitive`,
    );
    expect(adjustBtn.textContent).toBe("Adjust");
    fireEvent.click(adjustBtn);

    expect(navigateMock).toHaveBeenCalledTimes(1);
    const navigatedTo = navigateMock.mock.calls[0][0] as string;
    expect(navigatedTo).toContain(`focus=${FIELD}`);
    expect(navigatedTo).toBe(expectedTarget!.href);
  });

  it("mounting PropertyUnderwritingTab with ?focus=<fieldId> in the URL focuses the matching field", async () => {
    // defaultRevShareFb is in the field registry with mountPoint
    // `defaults/revenue` → routes to this tab. The tab renders the
    // editable PctField with `data-testid="field-defaultRevShareFb"`
    // and calls useFocusFieldFromUrl() once on mount.
    const FIELD = "defaultRevShareFb";
    window.history.replaceState(
      null,
      "",
      `/admin?focus=${FIELD}#defaults-property/revenue`,
    );

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    // Tab fetches /api/admin/model-constants? on mount for the
    // depreciation-years readonly display; satisfy the request so the
    // tab renders fully. Same shape used by the readonly-band test.
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            country: "United States",
            subdivision: null,
            items: [{ key: "depreciationYears", effectiveValue: 39 }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    ) as unknown as typeof fetch;

    render(
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(
          TooltipProvider,
          null,
          React.createElement(PropertyUnderwritingTab, {
            draft: {} as Parameters<typeof PropertyUnderwritingTab>[0]["draft"],
            onChange: () => {},
            guidance: [],
          }),
        ),
      ),
    );

    const fieldDiv = await screen.findByTestId(`field-${FIELD}`);

    // The hook scrolls + focuses on a setTimeout(0); wait for the
    // microtask queue to drain so we observe the post-effect state.
    // Two complementary assertions for the "field receives focus"
    // contract:
    //   (a) scrollIntoView was called on the field's container — the
    //       hook's first side-effect once it locates the field.
    //   (b) the resulting document.activeElement lives inside that
    //       same container — the hook's second side-effect (focusing
    //       the most natural form control inside the matched element,
    //       in this case the Radix Slider thumb [tabindex=0] inside
    //       PctField).
    // Together they catch a regression in either half of
    // `focusFieldElement` independently.
    await waitFor(() => {
      expect(lastScrolledElement).not.toBeNull();
      expect(lastScrolledElement).toBe(fieldDiv);
    });
    await waitFor(() => {
      const active = document.activeElement;
      expect(active).not.toBeNull();
      expect(active).not.toBe(document.body);
      expect(fieldDiv.contains(active)).toBe(true);
    });

    // The hook strips the ?focus param after success so a re-render or
    // back-nav doesn't re-fire the side-effect. Verify the URL no
    // longer carries it (the hash anchor must remain so the section
    // stays linkable).
    await waitFor(() => {
      expect(window.location.search).toBe("");
    });
    expect(window.location.hash).toBe("#defaults-property/revenue");
  });

  // Task #775 — extend end-to-end coverage to the two other admin tabs
  // that opted into the Analyst deep-link contract via `useFocusFieldFromUrl`.
  // PropertyUnderwritingTab (above) covers the `defaults/revenue` mount
  // point; the cases below cover `defaults/management-company` (CompanyTab)
  // and `defaults/market-macro` (MarketMacroTab). Without these, a
  // regression in the focus-hook wiring on either tab would only be
  // caught by the resolver/hook unit tests in isolation, not as a
  // mounted-tab end-to-end seam.
  it("mounting CompanyTab with ?focus=baseManagementFee in the URL focuses the matching field", async () => {
    // baseManagementFee is the canonical field id used by the
    // `Base Management Fee` PctField in CompanyTab (testId
    // "field-baseManagementFee"). Its registry mountPoint is
    // `defaults/management-company`, which the resolver routes here.
    const FIELD = "baseManagementFee";
    window.history.replaceState(
      null,
      "",
      `/admin?focus=${FIELD}#defaults-company/management-company`,
    );

    render(
      React.createElement(
        TooltipProvider,
        null,
        React.createElement(CompanyTab, {
          draft: {} as Parameters<typeof CompanyTab>[0]["draft"],
          onChange: () => {},
          guidance: [],
        }),
      ),
    );

    const fieldDiv = await screen.findByTestId(`field-${FIELD}`);

    // Same two-part contract as the PropertyUnderwritingTab case:
    //   (a) scrollIntoView fired on the field's container, and
    //   (b) the resulting document.activeElement lives inside that
    //       same container (the Radix Slider thumb [tabindex=0]
    //       inside the PctField is the natural focus target).
    await waitFor(() => {
      expect(lastScrolledElement).not.toBeNull();
      expect(lastScrolledElement).toBe(fieldDiv);
    });
    await waitFor(() => {
      const active = document.activeElement;
      expect(active).not.toBeNull();
      expect(active).not.toBe(document.body);
      expect(fieldDiv.contains(active)).toBe(true);
    });

    // The hook must strip the ?focus param after success while leaving
    // the hash anchor intact so the section stays linkable.
    await waitFor(() => {
      expect(window.location.search).toBe("");
    });
    expect(window.location.hash).toBe("#defaults-company/management-company");
  });

  it("mounting MarketMacroTab with ?focus=inflationRate in the URL focuses the matching field", async () => {
    // inflationRate is the canonical field id used by the
    // `Macro Inflation Rate` PctField in MarketMacroTab (testId
    // "field-inflationRate"). Its registry mountPoint is
    // `defaults/market-macro`, which the resolver routes here.
    const FIELD = "inflationRate";
    window.history.replaceState(
      null,
      "",
      `/admin?focus=${FIELD}#defaults-company/market-macro`,
    );

    render(
      React.createElement(
        TooltipProvider,
        null,
        React.createElement(MarketMacroTab, {
          draft: {} as Parameters<typeof MarketMacroTab>[0]["draft"],
          onChange: () => {},
          guidance: [],
        }),
      ),
    );

    const fieldDiv = await screen.findByTestId(`field-${FIELD}`);

    await waitFor(() => {
      expect(lastScrolledElement).not.toBeNull();
      expect(lastScrolledElement).toBe(fieldDiv);
    });
    await waitFor(() => {
      const active = document.activeElement;
      expect(active).not.toBeNull();
      expect(active).not.toBe(document.body);
      expect(fieldDiv.contains(active)).toBe(true);
    });

    await waitFor(() => {
      expect(window.location.search).toBe("");
    });
    expect(window.location.hash).toBe("#defaults-company/market-macro");
  });

  // Task #783 — Constants is the fourth Steady-State sidebar destination,
  // and its admin section is named `constants` (not `defaults-*`) because
  // its rows are authority-sourced rather than admin-editable. The
  // resolver maps `defaults/constants` slugs to that section, and
  // `ModelConstantsTab` exposes a `data-field="<key>"` marker on each
  // row so the focus hook can scroll/focus the matching constant.
  // Without this case, a regression in either the resolver mapping or
  // the tab's focus wiring would only surface in the unit tests, not
  // as a mounted-tab end-to-end seam (mirrors the Property /
  // CompanyTab / MarketMacroTab cases above).
  it("mounting ModelConstantsTab with ?focus=<key> in the URL focuses the matching constant row", async () => {
    const FIELD = "taxRate";
    window.history.replaceState(null, "", `/admin?focus=${FIELD}#constants`);

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    // ModelConstantsTab fetches `/api/admin/model-constants?country=…`
    // on mount and renders one `ConstantRowCard` per item. Return a
    // single specialistOwned row keyed by the field-under-focus so the
    // matching `[data-field="taxRate"]` marker appears in the DOM. The
    // shape mirrors the fixture already used by
    // `tests/client/model-constants-tab-readonly.test.tsx`.
    const taxRow = {
      key: FIELD,
      label: "Income tax rate",
      locality: "country+state" as const,
      authority: "Country corporate income tax statute",
      referenceUrl: null,
      helperText: "Effective corporate income tax rate.",
      requestedAt: { country: "United States", subdivision: null },
      scope: {
        locality: "country+state" as const,
        country: "United States",
        subdivision: null,
      },
      unit: "percent" as const,
      factoryValue: 0.21,
      factoryWasFallback: false,
      effectiveValue: 0.21,
      source: "factory" as const,
      resolvedAt: "country" as const,
      override: null,
      specialistOwned: true,
      specialistId: "constants.tax-research",
      specialistLetter: "H",
      specialistName: "Tax research",
      lastRefreshedAt: "2026-04-20T00:00:00Z",
      refreshCadenceDays: 90,
      isStale: false,
      latestResearchRun: {
        id: 100,
        asOf: "2026-04-20T00:00:00Z",
        authority: "IRS Pub 542",
        value: 0.21,
        sourcesCount: 2,
        isDifferentFromCurrent: false,
      },
      convictionSummary: "Tax research verified against IRS Pub 542",
    };

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.startsWith("/api/admin/model-constants/scheduled-failures")) {
        return new Response(
          JSON.stringify({
            count: 0,
            since: "2026-01-01T00:00:00Z",
            lastVisitedAt: null,
            failures: [],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.startsWith("/api/admin/model-constants?")) {
        return new Response(
          JSON.stringify({
            country: "United States",
            subdivision: null,
            items: [taxRow],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("", { status: 404 });
    }) as unknown as typeof fetch;

    render(
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(
          TooltipProvider,
          null,
          React.createElement(ModelConstantsTab),
        ),
      ),
    );

    // The row mounts after the GET resolves; once present, its
    // `data-field="taxRate"` marker is the focus hook's first-priority
    // lookup target. We assert against the same DOM node via the
    // long-standing `row-model-constant-<key>` test id so the test
    // doesn't bind to an internal selector convention.
    const fieldDiv = await screen.findByTestId(`row-model-constant-${FIELD}`);

    await waitFor(() => {
      expect(lastScrolledElement).not.toBeNull();
      expect(lastScrolledElement).toBe(fieldDiv);
    });

    // The hook strips the `?focus` param after success while leaving
    // the hash anchor intact so the section stays linkable.
    await waitFor(() => {
      expect(window.location.search).toBe("");
    });
    expect(window.location.hash).toBe("#constants");
  });
});
