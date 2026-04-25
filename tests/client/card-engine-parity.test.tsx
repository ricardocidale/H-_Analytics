// @vitest-environment happy-dom
/**
 * Task #603 — "One number admins see equals one number the engine uses".
 *
 * Catches the class of bug where a future contributor re-introduces a
 * hardcoded fallback in just one of: the editable card on Company
 * Assumptions / Property Edit, OR the engine that consumes the same
 * field. Audit #406 already reconciled the *current* divergence by
 * routing both the cards and the engines through
 * `getFactoryNumber('taxRate' | 'costRateTaxes', country, state)`.
 * Nothing structural prevents drift from creeping back; this test does.
 *
 * Approach for each card / engine pair:
 *   1. Render the actual editable card with a fresh US scenario, no
 *      overrides anywhere (formData / global / draft are minimally
 *      populated, no per-field value set).
 *   2. Read the displayed default value from the card via the Slider's
 *      `aria-valuenow` attribute (Radix Slider exposes the same numeric
 *      value the EditableValue text formats — both are derived from the
 *      same `?? DEFAULT_…` expression in the source).
 *   3. Run the same engine code path the production code calls
 *      (generateCompanyProForma for companyTaxRate; resolvePropertyAssumptions
 *      for costRateTaxes) and read the value the engine actually used.
 *   4. Assert byte-equal numeric identity, with a failure message that
 *      names the offending surface so the next admin who sees this fail
 *      knows which file to look at.
 *
 * Pair 1: TaxSection.tsx (companyTaxRate) ⇆ company-engine.ts
 * Pair 2: OperatingCostRatesSection.tsx (costRateTaxes) ⇆ resolve-assumptions.ts
 */

import { describe, it, expect, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { TooltipProvider } from "../../client/src/components/ui/tooltip";

import TaxSection from "../../client/src/components/company-assumptions/TaxSection";
import OperatingCostRatesSection from "../../client/src/components/property-edit/OperatingCostRatesSection";

import { generateCompanyProForma } from "../../engine/company/company-engine";
import { resolvePropertyAssumptions } from "../../engine/property/resolve-assumptions";
import { getFactoryNumber } from "../../shared/model-constants-registry";
import type { GlobalInput, PropertyInput } from "../../engine/types";

afterEach(() => cleanup());

// ── Test wrapper ─────────────────────────────────────────────────────────────
// The cards transitively use react-query (ResearchContextFieldLabel reads
// guidance via useQuery) and wouter (OperatingCostRatesSection uses <Link>).
// Wrapping in a fresh QueryClientProvider + memory Router keeps each test
// hermetic and avoids "no QueryClient" / "no Router" errors at render time.
function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const { hook } = memoryLocation({ path: "/" });
  return (
    <QueryClientProvider client={qc}>
      <Router hook={hook}>
        <TooltipProvider>{children}</TooltipProvider>
      </Router>
    </QueryClientProvider>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────
// Read the numeric value off a Radix Slider thumb. The thumb exposes
// `aria-valuenow` as the current position — same number the parent <Slider>
// receives via its `value={[N]}` prop, which is itself the
// `displayed × 100` form of the underlying fraction (e.g. 0.21 ⇒ 21).
function sliderPercent(thumb: HTMLElement): number {
  const raw = thumb.getAttribute("aria-valuenow");
  if (raw == null) {
    throw new Error("slider thumb missing aria-valuenow");
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    throw new Error(`slider thumb has non-finite aria-valuenow=${raw}`);
  }
  return n;
}

// Locate a slider in the document by the label text of its surrounding
// row. Walks up to the nearest `space-y-2` container (the Card row that
// holds <label, EditableValue, Slider, [Indicator]>) and finds the lone
// slider thumb inside it.
function findSliderByRowLabel(labelText: string | RegExp): HTMLElement {
  const labels = screen.getAllByText(labelText);
  for (const label of labels) {
    const row = label.closest(".space-y-2");
    if (!row) continue;
    const thumb = row.querySelector('[role="slider"]') as HTMLElement | null;
    if (thumb) return thumb;
  }
  throw new Error(
    `no slider found in any row containing label ${String(labelText)}`,
  );
}

// ── Engine fixtures ──────────────────────────────────────────────────────────
// Minimal-but-runnable scenarios to exercise the production engine paths.
// No company-level overhead → guarantees positive preTaxIncome so the
// company tax can be backed out as `companyIncomeTax / preTaxIncome`.

function makeUsHotelProperty(overrides: Partial<PropertyInput> = {}): PropertyInput {
  return {
    operationsStartDate: "2026-01-01",
    roomCount: 50,
    startAdr: 200,
    adrGrowthRate: 0,
    startOccupancy: 0.7,
    maxOccupancy: 0.7,
    occupancyRampMonths: 1,
    occupancyGrowthStep: 0,
    purchasePrice: 5_000_000,
    type: "Full Equity",
    // Operating cost rates intentionally OMITTED below where we want the
    // engine to fall through to the BUSINESS_MODEL_DEFAULTS.hotel baseline
    // (which Audit #406 documented to equal the registry US value 0.012).
    costRateRooms: 0.25,
    costRateFB: 0.30,
    costRateAdmin: 0.08,
    costRateMarketing: 0.05,
    costRatePropertyOps: 0.06,
    costRateUtilities: 0.04,
    // costRateTaxes deliberately NOT set on this fixture in the
    // resolve-assumptions test — see propertyForCostTaxes below.
    costRateTaxes: 0.012,
    costRateIT: 0.01,
    costRateFFE: 0.04,
    costRateOther: 0.02,
    costRateInsurance: 0.012,
    revShareEvents: 0,
    revShareFB: 0,
    revShareOther: 0,
    baseManagementFeeRate: 0.20,
    incentiveManagementFeeRate: 0,
    ...overrides,
  };
}

function makeOverheadFreeGlobal(overrides: Partial<GlobalInput> = {}): GlobalInput {
  return {
    modelStartDate: "2026-01-01",
    inflationRate: 0, // disable escalation noise
    fixedCostEscalationRate: 0,
    marketingRate: 0,
    miscOpsRate: 0,
    // Zero out partner comp + staffing cost so ebitda > 0 with just one
    // small property. The engine still goes through its `?? fallback`
    // path for companyTaxRate.
    partnerCompYear1: 0,
    partnerCompYear2: 0,
    partnerCompYear3: 0,
    partnerCompYear4: 0,
    partnerCompYear5: 0,
    partnerCompYear6: 0,
    partnerCompYear7: 0,
    partnerCompYear8: 0,
    partnerCompYear9: 0,
    partnerCompYear10: 0,
    staffSalary: 0,
    officeLeaseStart: 0,
    professionalServicesStart: 0,
    techInfraStart: 0,
    businessInsuranceStart: 0,
    travelCostPerClient: 0,
    itLicensePerClient: 0,
    capitalRaise1Amount: 0,
    capitalRaise2Amount: 0,
    fundingInterestRate: 0,
    // companyTaxRate intentionally NOT set — engine must fall through to
    // its registry-backed DEFAULT_COMPANY_TAX_RATE_US.
    ...overrides,
  } as GlobalInput;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Task #603 — card display ⇆ engine consumption parity", () => {
  describe("Company Income Tax (TaxSection.tsx ⇆ company-engine.ts)", () => {
    it("displayed default == engine-consumed value, byte-equal", () => {
      // (1) Render the editable card with no overrides anywhere.
      render(
        <Wrapper>
          <TaxSection
            formData={{}}
            global={{} as never}
            researchValues={{}}
            onChange={() => {}}
          />
        </Wrapper>,
      );

      // (2) Read what the user sees. The Company Income Tax slider is the
      // only one in TaxSection with aria-valuemax="50" (Inflation has
      // max=10), so disambiguate by max — robust against label rewording.
      const allThumbs = screen.getAllByRole("slider") as HTMLElement[];
      const taxThumb = allThumbs.find(
        (t) => t.getAttribute("aria-valuemax") === "50",
      );
      if (!taxThumb) {
        throw new Error(
          "TaxSection: could not locate the Company Income Tax slider " +
          "(no slider with aria-valuemax=50). If the slider's max changed, " +
          "update this test to find it by label instead.",
        );
      }
      // The slider value is `(displayed_decimal_rate × 100)`, so divide
      // back out to get the underlying rate (0.21 etc.).
      const cardDisplayedRate = sliderPercent(taxThumb) / 100;

      // (3) Run the engine for the same fresh-US no-override scenario.
      const properties = [makeUsHotelProperty()];
      const global = makeOverheadFreeGlobal();
      // 24 months — gives the property ramp time to produce stable revenue.
      const out = generateCompanyProForma(properties, global, 24);

      // Find the first month where preTaxIncome is meaningfully positive
      // — that's where companyIncomeTax = preTaxIncome × companyTaxRate
      // is non-zero, letting us recover companyTaxRate exactly.
      const goodMonth = out.find(
        (m) => m.preTaxIncome > 1 && m.companyIncomeTax > 0,
      );
      if (!goodMonth) {
        throw new Error(
          "card-engine parity test: no positive-preTax month produced " +
          "by overhead-free company scenario — fixture is broken, not the " +
          "card/engine pair. Inspect makeUsHotelProperty/makeOverheadFreeGlobal.",
        );
      }
      const engineConsumedRate =
        goodMonth.companyIncomeTax / goodMonth.preTaxIncome;

      // (4) Byte-equal assertion (modulo IEEE float noise).
      //
      // We can NOT use strict `.toBe()` here even though the conceptual
      // requirement is "same number". Reason: we recover the engine's
      // rate by dividing two outputs:
      //     companyIncomeTax / preTaxIncome
      // where companyIncomeTax was computed as (preTaxIncome × rate),
      // and preTaxIncome itself is a sum of many revenue/expense terms.
      // IEEE-754 (a + b + …) × c / (a + b + …) is not always === c (it
      // can differ by 1–2 ULP). So 12-decimal tolerance (~5e-13) is
      // tight enough to catch any economically-meaningful drift while
      // absorbing pure floating-point reassociation. The strict
      // equality check below (cardDisplayedRate vs registryRate) gives
      // us the byte-equal guarantee on the card side, and the engine's
      // own constant `DEFAULT_COMPANY_TAX_RATE_US` is the literal
      // `getFactoryNumber('taxRate','United States')` call (see
      // engine/company/company-engine.ts:48), so the two are exact at
      // the source — only the recovered ratio is lossy.
      expect(engineConsumedRate).toBeCloseTo(cardDisplayedRate, 12);

      // Belt-and-suspenders — also pin both sides to the registry source
      // of truth, so a regression in either surface fails with a message
      // that names the offending file.
      const registryRate = getFactoryNumber("taxRate", "United States");
      expect(
        cardDisplayedRate,
        "TaxSection.tsx companyTaxRate fallback drifted from " +
          "getFactoryNumber('taxRate', 'United States')",
      ).toBe(registryRate);
      expect(
        engineConsumedRate,
        "engine/company/company-engine.ts DEFAULT_COMPANY_TAX_RATE_US " +
          "drifted from getFactoryNumber('taxRate', 'United States')",
      ).toBeCloseTo(registryRate, 12);
    });
  });

  describe("Property Taxes (OperatingCostRatesSection.tsx ⇆ resolve-assumptions.ts)", () => {
    it("displayed default == engine-consumed value, byte-equal", () => {
      // (1) Render the editable card for a fresh US property, no
      // costRateTaxes override. `country: 'United States'` tells the
      // card to resolve via the locality-aware registry call.
      const draft = {
        id: 1,
        country: "United States",
        stateProvince: null,
        // Other fields the engine doesn't read for this test but the
        // component's render path may touch — use empty research values
        // and minimal globals.
      };
      render(
        <Wrapper>
          <OperatingCostRatesSection
            // Casting: the section's prop type is wide (full PropertyResponse)
            // but the only fields it reads for the tax row are country +
            // stateProvince + costRateTaxes — see lines 62–66 of the section.
            draft={draft as never}
            globalAssumptions={{ utilitiesVariableSplit: 0.6 } as never}
            researchValues={{} as never}
            onChange={() => {}}
            onNumberChange={() => {}}
          />
        </Wrapper>,
      );

      // (2) Find the Property Taxes slider via its row label and read
      // the displayed default. The Property Taxes row contains a label
      // text "Property Taxes" inside a ResearchContextFieldLabel; we
      // walk up to the row and grab the slider thumb.
      const propTaxThumb = findSliderByRowLabel(/^Property Taxes$/);
      const cardDisplayedRate = sliderPercent(propTaxThumb) / 100;

      // (3) Run the engine path the same scenario takes. The property
      // engine resolves costRateTaxes via:
      //   property.costRateTaxes ?? modelDefaults.costRateTaxes
      // where modelDefaults = BUSINESS_MODEL_DEFAULTS[businessModel ?? 'hotel'].
      // Build a property with NO costRateTaxes override (force the
      // fallback path) and read ctx.costRateTaxes — that IS the value
      // every property-engine line item consumes.
      const propertyForCostTaxes = makeUsHotelProperty();
      // Surgically remove costRateTaxes so the `??` fallback fires.
      // (The fixture provides it for the company-tax test above.)
      delete (propertyForCostTaxes as Partial<PropertyInput>).costRateTaxes;
      const global = makeOverheadFreeGlobal();
      const ctx = resolvePropertyAssumptions(
        propertyForCostTaxes as PropertyInput,
        global,
        12,
      );
      const engineConsumedRate = ctx.costRateTaxes;

      // (4) Byte-equal assertion. Both sides derive from a registry /
      // BUSINESS_MODEL_DEFAULTS pair that Audit #406 documented to equal
      // 0.012 for US hotels — see `costRateTaxes: 0.012` in
      // shared/constants-business-models.ts and `getFactoryNumber(
      // 'costRateTaxes', 'United States')` in shared/model-constants-registry.ts.
      expect(engineConsumedRate).toBe(cardDisplayedRate);

      // Belt-and-suspenders — pin both surfaces to the registry value.
      // If a future contributor edits one but not the other, the message
      // names the file to fix.
      const registryRate = getFactoryNumber(
        "costRateTaxes",
        "United States",
        null,
      );
      expect(
        cardDisplayedRate,
        "OperatingCostRatesSection.tsx DEFAULT_COST_RATE_TAXES fallback " +
          "drifted from getFactoryNumber('costRateTaxes', country, state)",
      ).toBe(registryRate);
      expect(
        engineConsumedRate,
        "engine/property/resolve-assumptions.ts modelDefaults.costRateTaxes " +
          "(BUSINESS_MODEL_DEFAULTS.hotel) drifted from " +
          "getFactoryNumber('costRateTaxes','United States') — update " +
          "either shared/constants-business-models.ts or the registry, " +
          "but keep them equal.",
      ).toBe(registryRate);
    });
  });
});
