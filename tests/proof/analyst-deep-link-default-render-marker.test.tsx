// @vitest-environment happy-dom
/**
 * Analyst Adjust deep-link **default-render** marker audit (task #777).
 *
 * Sibling to the source-scan audit
 * (`tests/proof/analyst-deep-link-destination-marker.test.ts`), which
 * statically reads the destination file and asserts the marker is
 * spelled correctly somewhere in source. That check catches:
 *   - "marker on wrong page" (a registry mountPoint that points at a
 *     surface whose source carries no matching marker), and
 *   - "marker removed from form" (a refactor that strips the
 *     `data-field` / `data-testid="field-…"` attribute).
 *
 * What it does NOT catch is the case from this task: a marker that
 * exists in source but is wrapped in a conditional render, so the
 * default page state never paints it. Concrete worked example:
 * `ConvertibleTermsCard` in
 * `client/src/components/company-assumptions/FundingSection.tsx`
 * only renders its valuation-cap / discount-rate / interest-rate
 * inputs when the user toggles those rows on — both the markup and the
 * `data-field` markers (if any were added) sit behind
 * `{showValuationCap && (…)}` JSX. The static scan would pass while
 * `findFieldElement(fieldId)` would silently no-op on the default
 * page state for any user who hadn't already toggled the row open.
 *
 * This audit closes that gap by **rendering** each destination surface
 * in jsdom (happy-dom, no network) at default props, then asking the
 * runtime selector itself —
 * `findFieldElement(fieldId)` from
 * `client/src/lib/analyst-focus-field.ts` — whether each registered
 * field id is discoverable. A marker that lives behind
 * `{toggleOn && (<input data-field="x" />)}` is in source (so the
 * sibling scan passes) but not in the rendered DOM (so this test
 * fails) — the exact silent-failure class task #777 was opened to catch.
 *
 * Adding a new mountPoint slug:
 *   1. Add an entry to `MOUNT_POINT_RENDERERS` below mapping the slug
 *      to a `() => ReactElement` that renders the destination surface
 *      with default / empty props (the same surface the user lands on
 *      when the Adjust CTA navigates them in cold).
 *   2. The test will fail if the registry uses a slug not present in
 *      the map — that's the forcing function.
 */
import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// `analyst-mount-points.ts` (transitively imported by every destination
// tab via `useFocusFieldFromUrl` → no, actually only the resolver
// imports navigate; hooks read it via the wouter package). The tabs
// themselves don't directly call `navigate`, but the AnalystActionButton
// path is satisfied by omitting `onAnalystRefresh` (the buttons only
// render when an `onAnalystRefresh` callback is provided). Stubbing
// these here keeps the module graph self-contained and matches the
// pattern used by `tests/client/analyst-adjust-deep-link-e2e.test.tsx`.
const navigateMock = vi.fn();
vi.mock("wouter/use-browser-location", () => ({
  navigate: (...args: unknown[]) => navigateMock(...args),
}));
vi.mock("@/lib/admin-nav", () => ({
  setAdminSection: vi.fn(),
}));

// PropertyUnderwritingTab gates its Authority-Governed band on
// `useAuth().isSuperAdmin`; mirror the shape used by the existing
// readonly-band tests so the tab renders fully (and so the band's
// `data-testid="field-depreciationYears-readonly"` is part of the DOM,
// even though it's not a registry field — exercising the same render
// path users hit guards against an unrelated regression that would
// crash the destination component before any registry field could be
// queried).
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
import {
  CapitalRaisesCard,
  ConvertibleTermsCard,
  CapitalStackDisciplineCard,
} from "../../client/src/components/company-assumptions/FundingSection";
import { PropertyUnderwritingTab } from "../../client/src/components/admin/model-defaults/PropertyUnderwritingTab";
import { CompanyTab } from "../../client/src/components/admin/model-defaults/CompanyTab";
import { MarketMacroTab } from "../../client/src/components/admin/model-defaults/MarketMacroTab";
import OtherAssumptionsSection from "../../client/src/components/property-edit/OtherAssumptionsSection";
import CapitalStructureSection from "../../client/src/components/property-edit/CapitalStructureSection";
import { findFieldElement } from "../../client/src/lib/analyst-focus-field";
import { FIELD_REGISTRY } from "../../engine/analyst/registry/field-registry";

/**
 * Minimal `global` payload for the FundingSection cards. The cards read
 * a handful of fields directly via `formData.<x> ?? global.<x>` and
 * pass the result into `EditableValue`, which assumes a `number` and
 * crashes on `undefined`. The funding-Specialist required-field
 * cascade fields (runwayBufferMonths, sizingOvershootPct, …) have
 * named DEFAULT_* fallbacks inside the component itself, so they don't
 * need to be set here. Every value is innocuous: amounts non-zero so
 * the date inputs render, and the convertible-terms knobs at zero so
 * their toggles are off (the default page state we want to audit).
 */
const FUNDING_GLOBAL = {
  fundingSourceLabel: "Test Fund",
  capitalRaise1Amount: 500_000,
  capitalRaise2Amount: 500_000,
  capitalRaise1Date: "2026-01-01",
  capitalRaise2Date: "2026-06-01",
  capitalRaiseValuationCap: 0,
  capitalRaiseDiscountRate: 0,
  fundingInterestRate: 0,
  fundingInterestPaymentFrequency: "accrues_only",
  // CapitalStackDisciplineCard reads these too but falls back to
  // DEFAULT_* constants when null/undefined; left out to exercise the
  // fallback path (which is the path real users with a fresh company
  // hit on first load).
} as unknown as Parameters<typeof CapitalRaisesCard>[0]["global"];

const NOOP_CHANGE = () => {};

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

/**
 * Slug → default-state renderer. Every slug used by FIELD_REGISTRY must
 * be mapped here. Each renderer returns the JSX the destination page
 * paints when the user lands on it cold (no toggles flipped, no draft
 * edits applied), wrapped in the providers the destination components
 * need to mount cleanly.
 */
const MOUNT_POINT_RENDERERS: Readonly<
  Record<string, () => React.ReactElement>
> = {
  // Funding tab is composed by `CompanyAssumptionsTabsView.tsx::renderBody`
  // case "funding" from the three named cards — render the same trio so
  // the audit hits the exact DOM users see on the funding tab.
  "company-assumptions/funding": () => (
    <TooltipProvider>
      <CapitalRaisesCard
        formData={{}}
        onChange={NOOP_CHANGE}
        global={FUNDING_GLOBAL}
      />
      <ConvertibleTermsCard
        formData={{}}
        onChange={NOOP_CHANGE}
        global={FUNDING_GLOBAL}
      />
      <CapitalStackDisciplineCard
        formData={{}}
        onChange={NOOP_CHANGE}
        global={FUNDING_GLOBAL}
      />
    </TooltipProvider>
  ),
  // PropertyUnderwritingTab hosts BOTH `defaults/property` (the
  // template values applied when creating a new property — ADR,
  // occupancy, cost rates, …) and the legacy `defaults/revenue` slug
  // (Ancillary Revenue Mix and the marketing cost rate inside the
  // USALI Operating Cost Rates section both live on this tab). Both
  // slugs render the same component; we keep two map entries so the
  // forcing-function test below catches a registry slug that no
  // mountPoint has been mapped for.
  "defaults/property": () => renderPropertyUnderwritingTab(),
  "defaults/revenue": () => renderPropertyUnderwritingTab(),
  "defaults/management-company": () => (
    <QueryClientProvider client={makeQueryClient()}>
      <TooltipProvider>
        <CompanyTab
          draft={{} as Parameters<typeof CompanyTab>[0]["draft"]}
          onChange={NOOP_CHANGE}
          guidance={[]}
        />
      </TooltipProvider>
    </QueryClientProvider>
  ),
  "defaults/market-macro": () => (
    <QueryClientProvider client={makeQueryClient()}>
      <TooltipProvider>
        <MarketMacroTab
          draft={{} as Parameters<typeof MarketMacroTab>[0]["draft"]}
          onChange={NOOP_CHANGE}
          guidance={[]}
        />
      </TooltipProvider>
    </QueryClientProvider>
  ),
  // Property Edit's "Other Assumptions" section hosts the
  // `dispositionCommission` field (Sale Commission slider). Its
  // `data-field="dispositionCommission"` wrapper is what
  // `useFocusFieldFromUrl()` lands on when the Analyst Adjust deep
  // link from a property-scoped verdict resolves to
  // `property-edit/other-assumptions` (Task #779).
  "property-edit/other-assumptions": () => (
    <QueryClientProvider client={makeQueryClient()}>
      <TooltipProvider>
        <OtherAssumptionsSection
          draft={
            {} as Parameters<typeof OtherAssumptionsSection>[0]["draft"]
          }
          onChange={NOOP_CHANGE}
          onNumberChange={NOOP_CHANGE as unknown as Parameters<
            typeof OtherAssumptionsSection
          >[0]["onNumberChange"]}
          globalAssumptions={undefined}
          researchValues={{}}
          guidance={[]}
          exitYear={2030}
        />
      </TooltipProvider>
    </QueryClientProvider>
  ),
  // Property Edit's "Capital Structure" section hosts the
  // `landValuePercent` field (Land Value % slider). Its
  // `data-field="landValuePercent"` wrapper is what
  // `useFocusFieldFromUrl()` lands on when the Analyst Adjust deep
  // link from a property-scoped verdict resolves to
  // `property-edit/capital-structure` (Task #791). The depreciation
  // override input lives on the same section but is not (yet) a
  // registry field — only `landValuePercent` is asserted here.
  "property-edit/capital-structure": () => (
    <QueryClientProvider client={makeQueryClient()}>
      <TooltipProvider>
        <CapitalStructureSection
          draft={
            {
              // CapitalStructureSection reads `purchasePrice`,
              // `buildingImprovements`, and `landValuePercent` directly
              // (without a `?? 0` fallback) when computing the
              // "Depreciable basis" hint. happy-dom would crash on
              // `undefined.toLocaleString()` from the empty draft, so
              // seed the minimum the section needs to mount cleanly.
              // None of these affect the marker discovery.
              purchasePrice: 0,
              buildingImprovements: 0,
              landValuePercent: null,
              type: "Full Equity",
            } as unknown as Parameters<typeof CapitalStructureSection>[0]["draft"]
          }
          onChange={NOOP_CHANGE}
          onNumberChange={NOOP_CHANGE as unknown as Parameters<
            typeof CapitalStructureSection
          >[0]["onNumberChange"]}
          globalAssumptions={undefined}
          researchValues={{}}
          guidance={[]}
        />
      </TooltipProvider>
    </QueryClientProvider>
  ),
};

function renderPropertyUnderwritingTab(): React.ReactElement {
  return (
    <QueryClientProvider client={makeQueryClient()}>
      <TooltipProvider>
        <PropertyUnderwritingTab
          draft={
            {} as Parameters<typeof PropertyUnderwritingTab>[0]["draft"]
          }
          onChange={NOOP_CHANGE}
          guidance={[]}
        />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  // happy-dom doesn't implement scrollIntoView; make it a noop so the
  // focus hook (if it ever fires here) doesn't blow up. The audit
  // never sets `?focus=…`, so this is purely defensive.
  Element.prototype.scrollIntoView = function () {} as Element["scrollIntoView"];
  // Suspend any network the depreciation-years readonly band might
  // attempt — return an empty payload so the component takes the
  // "no value yet" branch and renders without throwing.
  globalThis.fetch = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          country: "United States",
          subdivision: null,
          items: [],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
  ) as unknown as typeof fetch;
  // Reset URL between tests so a stray `?focus=` from another file
  // doesn't survive into this file's renders.
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Analyst Adjust deep-link default-render marker audit (task #777)", () => {
  const ENTRIES = Object.entries(FIELD_REGISTRY);

  it("has at least one registered field (sanity check)", () => {
    // Mirrors the sibling audits — guards against a refactor that
    // empties FIELD_REGISTRY, which would make every per-field check
    // below vacuously pass.
    expect(ENTRIES.length).toBeGreaterThan(0);
  });

  it("MOUNT_POINT_RENDERERS covers every mountPoint slug used by FIELD_REGISTRY", () => {
    // Forcing function: a registry slug with no renderer is a blocker
    // up front, so a developer adding a new surface gets a clear
    // "register a default-render renderer" message rather than a
    // confusing per-field "marker not found" cascade.
    const usedSlugs = new Set<string>();
    for (const [, entry] of ENTRIES) usedSlugs.add(entry.mountPoint);
    const unmapped: string[] = [];
    for (const slug of usedSlugs) {
      if (!(slug in MOUNT_POINT_RENDERERS)) unmapped.push(slug);
    }
    if (unmapped.length > 0) {
      throw new Error(
        "FIELD_REGISTRY uses mountPoint slugs that the default-render " +
          "audit doesn't know how to render. Add an entry to " +
          "MOUNT_POINT_RENDERERS in " +
          "tests/proof/analyst-deep-link-default-render-marker.test.tsx " +
          "for each of:\n" +
          unmapped.map((s) => `  - "${s}"`).join("\n"),
      );
    }
  });

  it("every registered field id is discoverable in the destination's default render", () => {
    // Group fields by mountPoint so we render each destination once
    // and run all its field lookups against that single render. Same
    // memoisation trick the source-scan sibling uses, but at the DOM
    // level — re-rendering would cost a fresh React tree per field.
    const byMount = new Map<string, string[]>();
    for (const [fieldId, entry] of ENTRIES) {
      const list = byMount.get(entry.mountPoint) ?? [];
      list.push(fieldId);
      byMount.set(entry.mountPoint, list);
    }

    const violations: string[] = [];
    for (const [slug, fieldIds] of byMount) {
      const renderer = MOUNT_POINT_RENDERERS[slug];
      if (!renderer) {
        // The forcing-function test above already reports unmapped
        // slugs — skip here so the per-field message stays focused on
        // marker drift.
        continue;
      }
      // Render once per slug; cleanup() in afterEach handles teardown
      // for the suite, but we cleanup between slugs too so the DOM
      // contains only the surface currently under test (a marker
      // present on a different tab must NOT mask a missing marker on
      // this one).
      cleanup();
      render(renderer());
      for (const fieldId of fieldIds) {
        if (findFieldElement(fieldId) === null) {
          violations.push(
            `  - "${fieldId}" (mountPoint="${slug}"): no ` +
              `[data-field="${fieldId}"] or ` +
              `[data-testid="field-${fieldId}"] element found in the ` +
              `destination's default render. The marker exists in source ` +
              `(the sibling source-scan audit would still pass) but is ` +
              `wrapped in a conditional render that is off by default — ` +
              `clicking Adjust will land the user on the right page and ` +
              `the focus hook will silently exhaust its retry budget.`,
          );
        }
      }
    }

    if (violations.length > 0) {
      throw new Error(
        "FIELD_REGISTRY entries point at a marker that does not paint " +
          "on the destination's default page state — the Analyst's " +
          "'Adjust' CTA will silently fail to scroll/focus the field for " +
          "any user who hasn't already toggled the section open (this is " +
          "the silent-failure class task #777 was opened to catch):\n" +
          violations.join("\n") +
          "\n\nFix one of the following:\n" +
          "  - Move the marker out from behind the toggle so it always " +
          "renders (e.g. wrap the LABEL in `data-field`, not the " +
          "conditionally-rendered input).\n" +
          "  - Render the toggle ON by default when the field is part of " +
          "the registered surface.\n" +
          "  - Update the registry's `mountPoint` to point at a different " +
          "surface where the marker is unconditionally rendered.",
      );
    }
  });

  it("self-check: a marker hidden behind a default-off toggle is NOT discoverable", () => {
    // Meta-assertion that the audit above can actually detect a
    // hidden-by-default marker. Without this, a regression that broke
    // `findFieldElement` (e.g. it started returning a stub element
    // unconditionally) would silently make every per-field assertion
    // pass.
    //
    // `ConvertibleTermsCard`'s valuation-cap input is the canonical
    // example called out in the task #777 brief: its `<EditableValue>`
    // (and any sibling `data-field` marker if one were added) sit
    // inside `{showValuationCap && (…)}`. With the default global
    // (`capitalRaiseValuationCap: 0`) the toggle starts OFF, so a
    // hypothetical `data-field="capitalRaiseValuationCap"` would not
    // appear in the rendered DOM. We verify the absence with the
    // `data-testid="toggle-valuation-cap"` selector that DOES exist on
    // the always-rendered toggle Switch — proving the card mounted —
    // alongside the absence of any marker for the conditionally-rendered
    // input (we use the literal id `capitalRaiseValuationCap` which
    // intentionally is NOT in FIELD_REGISTRY today; if it ever gets
    // registered, the per-field audit above will catch it and this
    // self-check will need to pick a different default-collapsed field).
    cleanup();
    render(
      <TooltipProvider>
        <ConvertibleTermsCard
          formData={{}}
          onChange={NOOP_CHANGE}
          global={FUNDING_GLOBAL}
        />
      </TooltipProvider>,
    );
    // Sanity: the card mounted (the always-rendered Switch is
    // present). If this fails, the renderer is broken and the
    // negative assertion that follows would falsely pass.
    expect(
      document.querySelector('[data-testid="toggle-valuation-cap"]'),
    ).not.toBeNull();
    // The valuation-cap input — and any `data-field` marker on it —
    // lives behind `{showValuationCap && …}` and the global seeds the
    // toggle off, so it must not appear in the default-render DOM.
    expect(findFieldElement("capitalRaiseValuationCap")).toBeNull();
    // Same story for the discount-rate and interest-rate rows; both
    // toggles default off, both inputs are conditionally rendered.
    expect(findFieldElement("capitalRaiseDiscountRate")).toBeNull();
    expect(findFieldElement("fundingInterestRate")).toBeNull();
  });
});
