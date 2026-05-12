import { describe, it, expect } from "vitest";
import { ICP_STR_ELIGIBLE_SERVICE_CATEGORIES } from "@norfolk/shared/constants";
import { generateCompanyProForma } from "../company-engine";
import type { PropertyInput, GlobalInput } from "../../types";
import type { ServiceTemplate } from "@calc/services/types";
import type { IcpBracketProfile, BracketMixEntry } from "../icp-bracket-types";

const STR_CATEGORY = ICP_STR_ELIGIBLE_SERVICE_CATEGORIES[0];
const NON_STR_CATEGORY = "Technology & Reservations";

function makeGlobal(overrides: Partial<GlobalInput> = {}): GlobalInput {
  return {
    modelStartDate: "2025-01-01",
    inflationRate: 0.03,
    marketingRate: 0.02,
    projectionYears: 2,
    exitCapRate: 0.07,
    debtAssumptions: {
      interestRate: 0.065,
      amortizationYears: 25,
    },
    ...overrides,
  };
}

function makeProperty(overrides: Partial<PropertyInput> = {}): PropertyInput {
  return {
    operationsStartDate: "2025-01-01",
    roomCount: 20,
    startAdr: 200,
    adrGrowthRate: 0.03,
    startOccupancy: 0.6,
    maxOccupancy: 0.8,
    occupancyRampMonths: 12,
    occupancyGrowthStep: 0.05,
    purchasePrice: 1_000_000,
    type: "Full Equity",
    costRateRooms: 0.25,
    costRateFB: 0.3,
    costRateAdmin: 0.08,
    costRateMarketing: 0.04,
    costRatePropertyOps: 0.05,
    costRateUtilities: 0.03,
    costRateTaxes: 0.02,
    costRateIT: 0.01,
    costRateFFE: 0.02,
    costRateOther: 0.01,
    costRateInsurance: 0.01,
    revShareEvents: 0.1,
    revShareFB: 0.3,
    revShareOther: 0.05,
    feeCategories: [
      { name: STR_CATEGORY, rate: 0.02, isActive: true },
      { name: NON_STR_CATEGORY, rate: 0.02, isActive: true },
    ],
    ...overrides,
  };
}

const SERVICE_TEMPLATES: ServiceTemplate[] = [
  {
    id: 1,
    name: STR_CATEGORY,
    defaultRate: 0.02,
    serviceModel: "centralized",
    serviceMarkup: 0.2,
    isActive: true,
    sortOrder: 1,
  },
  {
    id: 2,
    name: NON_STR_CATEGORY,
    defaultRate: 0.02,
    serviceModel: "centralized",
    serviceMarkup: 0.2,
    isActive: true,
    sortOrder: 2,
  },
];

const BRACKETS: IcpBracketProfile[] = [
  {
    slug: "hotel-lux",
    name: "Luxury Hotel",
    customerType: "hotel",
    serviceConsumptionProfile: "full",
  },
  {
    slug: "str-urban",
    name: "Urban STR",
    customerType: "str",
    serviceConsumptionProfile: "str_only",
  },
];

const HOTEL_MIX: BracketMixEntry[] = [{ bracketSlug: "hotel-lux", weight: 1.0 }];
const STR_MIX: BracketMixEntry[] = [{ bracketSlug: "str-urban", weight: 1.0 }];

/** Pick the first month with non-zero revenue (skips funding-gate zero months). */
function firstActiveMonth(financials: ReturnType<typeof generateCompanyProForma>) {
  return financials.find((f) => f.totalRevenue > 0);
}

describe("generateCompanyProForma() — bracket-mix consumption scaling", () => {
  it("100% STR mix produces lower cost-of-services than 100% hotel mix", () => {
    const property = makeProperty();
    const global = makeGlobal();
    const months = 24;

    const hotelOutput = generateCompanyProForma(
      [property],
      global,
      months,
      SERVICE_TEMPLATES,
      HOTEL_MIX,
      BRACKETS,
    );
    const strOutput = generateCompanyProForma(
      [property],
      global,
      months,
      SERVICE_TEMPLATES,
      STR_MIX,
      BRACKETS,
    );

    const hotelMonth = firstActiveMonth(hotelOutput);
    const strMonth = firstActiveMonth(strOutput);

    expect(hotelMonth).toBeDefined();
    expect(strMonth).toBeDefined();

    // Cost-of-services (totalVendorCost) for the STR mix must be strictly lower
    // than for the hotel mix because STR brackets do not consume the
    // non-STR-eligible category, so its revenue contribution is scaled to 0
    // before vendor cost is computed.
    expect(strMonth!.totalVendorCost).toBeGreaterThan(0);
    expect(hotelMonth!.totalVendorCost).toBeGreaterThan(strMonth!.totalVendorCost);

    // Revenue itself should also be lower for the STR mix (the non-STR
    // category's fee revenue is scaled to zero), confirming the scalar
    // flowed through to baseFeeRevenue / totalRevenue.
    expect(strMonth!.baseFeeRevenue).toBeLessThan(hotelMonth!.baseFeeRevenue);

    // STR-eligible category survives at the same level in both mixes.
    expect(strMonth!.serviceFeeBreakdown.byCategory[STR_CATEGORY]).toBeCloseTo(
      hotelMonth!.serviceFeeBreakdown.byCategory[STR_CATEGORY],
      8,
    );

    // Non-STR category collapses to 0 under a 100% STR mix.
    expect(strMonth!.serviceFeeBreakdown.byCategory[NON_STR_CATEGORY]).toBe(0);
    expect(hotelMonth!.serviceFeeBreakdown.byCategory[NON_STR_CATEGORY]).toBeGreaterThan(0);
  });

  it("hotel mix produces identical output whether bracket inputs are passed or omitted", () => {
    // For a pure-hotel mix, bracketMixHasStrComponent() returns false, so the
    // engine must short-circuit scaling entirely — output should match the
    // no-bracket path byte-for-byte on the relevant numeric fields.
    const property = makeProperty();
    const global = makeGlobal();
    const months = 24;

    const withHotelMix = generateCompanyProForma(
      [property],
      global,
      months,
      SERVICE_TEMPLATES,
      HOTEL_MIX,
      BRACKETS,
    );
    const withoutMix = generateCompanyProForma(
      [property],
      global,
      months,
      SERVICE_TEMPLATES,
    );

    const a = firstActiveMonth(withHotelMix);
    const b = firstActiveMonth(withoutMix);

    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(a!.baseFeeRevenue).toBeCloseTo(b!.baseFeeRevenue, 10);
    expect(a!.totalVendorCost).toBeCloseTo(b!.totalVendorCost, 10);
    expect(a!.grossProfit).toBeCloseTo(b!.grossProfit, 10);
  });

  it("STR scaling preserves byCategoryByPropertyId (drill-down) at gross levels", () => {
    // The engine intentionally scales only byCategory (the input to COS) and
    // leaves byCategoryByPropertyId at gross figures so per-property audit
    // views still show the un-scaled amount.
    const property = makeProperty({ id: 42 });
    const global = makeGlobal();

    const strOutput = generateCompanyProForma(
      [property],
      global,
      24,
      SERVICE_TEMPLATES,
      STR_MIX,
      BRACKETS,
    );
    const month = firstActiveMonth(strOutput);
    expect(month).toBeDefined();

    const perProp = month!.serviceFeeBreakdown.byCategoryByPropertyId[NON_STR_CATEGORY];
    expect(perProp).toBeDefined();
    // Gross per-property amount for the non-STR category is preserved (> 0)
    // even though the aggregated byCategory entry was scaled to 0.
    expect(perProp!["42"]).toBeGreaterThan(0);
    expect(month!.serviceFeeBreakdown.byCategory[NON_STR_CATEGORY]).toBe(0);
  });

  it("mixed-portfolio (50% hotel + 50% STR) lands between pure-hotel and pure-STR outputs", () => {
    // Task #1428 — verifies that bracket-mix weights actually drive the
    // Mgmt Co revenue split, not just the binary "any STR present" gate.
    // For a 50/50 mix the non-STR-eligible category must scale to exactly
    // 0.5 of its hotel-mix value (per computeServiceConsumptionScalars).
    const property = makeProperty();
    const global = makeGlobal();
    const months = 24;

    const MIXED_MIX: BracketMixEntry[] = [
      { bracketSlug: "hotel-lux", weight: 0.5 },
      { bracketSlug: "str-urban", weight: 0.5 },
    ];

    const hotelOutput = generateCompanyProForma([property], global, months, SERVICE_TEMPLATES, HOTEL_MIX, BRACKETS);
    const strOutput = generateCompanyProForma([property], global, months, SERVICE_TEMPLATES, STR_MIX, BRACKETS);
    const mixedOutput = generateCompanyProForma([property], global, months, SERVICE_TEMPLATES, MIXED_MIX, BRACKETS);

    const hotelMonth = firstActiveMonth(hotelOutput);
    const strMonth = firstActiveMonth(strOutput);
    const mixedMonth = firstActiveMonth(mixedOutput);

    expect(hotelMonth).toBeDefined();
    expect(strMonth).toBeDefined();
    expect(mixedMonth).toBeDefined();

    // STR-eligible category is consumed by both bracket types → unaffected by mix.
    expect(mixedMonth!.serviceFeeBreakdown.byCategory[STR_CATEGORY]).toBeCloseTo(
      hotelMonth!.serviceFeeBreakdown.byCategory[STR_CATEGORY],
      8,
    );

    // Non-STR category gets exactly half its hotel-mix value under a 50/50 mix.
    const hotelNonStr = hotelMonth!.serviceFeeBreakdown.byCategory[NON_STR_CATEGORY];
    const mixedNonStr = mixedMonth!.serviceFeeBreakdown.byCategory[NON_STR_CATEGORY];
    expect(hotelNonStr).toBeGreaterThan(0);
    expect(mixedNonStr).toBeCloseTo(hotelNonStr * 0.5, 8);

    // Mixed-portfolio revenue and cost-of-services must land strictly between
    // the two pure-mix endpoints — proves the weights are actually applied.
    expect(mixedMonth!.baseFeeRevenue).toBeLessThan(hotelMonth!.baseFeeRevenue);
    expect(mixedMonth!.baseFeeRevenue).toBeGreaterThan(strMonth!.baseFeeRevenue);
    expect(mixedMonth!.totalVendorCost).toBeLessThan(hotelMonth!.totalVendorCost);
    expect(mixedMonth!.totalVendorCost).toBeGreaterThan(strMonth!.totalVendorCost);
  });

  it("partial bracket-mix splits (70/30, 50/50, 30/70) scale the non-STR category linearly with hotel weight", () => {
    // Task #1469 — most real management companies live in the 30%–70% STR
    // range. The weighted-sum math in computeServiceConsumptionScalars must
    // produce a non-STR category fee revenue that is exactly hotel_weight ×
    // pure-hotel value, regardless of where on the spectrum the mix sits.
    const property = makeProperty();
    const global = makeGlobal();
    const months = 24;

    const hotelMonth = firstActiveMonth(
      generateCompanyProForma([property], global, months, SERVICE_TEMPLATES, HOTEL_MIX, BRACKETS),
    );
    expect(hotelMonth).toBeDefined();
    const hotelNonStr = hotelMonth!.serviceFeeBreakdown.byCategory[NON_STR_CATEGORY];
    const hotelStr = hotelMonth!.serviceFeeBreakdown.byCategory[STR_CATEGORY];
    expect(hotelNonStr).toBeGreaterThan(0);

    const splits: Array<{ hotel: number; str: number }> = [
      { hotel: 0.7, str: 0.3 },
      { hotel: 0.5, str: 0.5 },
      { hotel: 0.3, str: 0.7 },
    ];

    for (const { hotel, str } of splits) {
      const mix: BracketMixEntry[] = [
        { bracketSlug: "hotel-lux", weight: hotel },
        { bracketSlug: "str-urban", weight: str },
      ];
      const month = firstActiveMonth(
        generateCompanyProForma([property], global, months, SERVICE_TEMPLATES, mix, BRACKETS),
      );
      expect(month).toBeDefined();

      // STR-eligible category is consumed by both bracket types → unaffected.
      expect(month!.serviceFeeBreakdown.byCategory[STR_CATEGORY]).toBeCloseTo(hotelStr, 8);

      // Non-STR category scales linearly with the hotel weight.
      expect(month!.serviceFeeBreakdown.byCategory[NON_STR_CATEGORY]).toBeCloseTo(
        hotelNonStr * hotel,
        8,
      );
    }
  });

  it("non-STR category fee revenue and totalVendorCost decrease monotonically as STR weight rises 0 → 1", () => {
    // Task #1469 — sweep the STR weight across the full spectrum and assert
    // strict monotonic decrease in both the scaled fee revenue and the
    // downstream cost-of-services figure. Catches regressions where a
    // weighted-sum bug would non-monotonically misstate revenue/COS.
    const property = makeProperty();
    const global = makeGlobal();
    const months = 24;

    const strWeights = [0, 0.25, 0.5, 0.75, 1.0];

    const series = strWeights.map((strWeight) => {
      const mix: BracketMixEntry[] = [
        { bracketSlug: "hotel-lux", weight: 1 - strWeight },
        { bracketSlug: "str-urban", weight: strWeight },
      ];
      const month = firstActiveMonth(
        generateCompanyProForma([property], global, months, SERVICE_TEMPLATES, mix, BRACKETS),
      );
      expect(month).toBeDefined();
      return {
        strWeight,
        nonStr: month!.serviceFeeBreakdown.byCategory[NON_STR_CATEGORY],
        baseFeeRevenue: month!.baseFeeRevenue,
        totalVendorCost: month!.totalVendorCost,
      };
    });

    // Strictly monotonic decrease across the full sweep.
    for (let i = 1; i < series.length; i++) {
      const prev = series[i - 1]!;
      const curr = series[i]!;
      expect(curr.nonStr).toBeLessThan(prev.nonStr);
      expect(curr.baseFeeRevenue).toBeLessThan(prev.baseFeeRevenue);
      expect(curr.totalVendorCost).toBeLessThan(prev.totalVendorCost);
    }

    // Endpoints behave as expected: pure-STR collapses non-STR to zero.
    expect(series[0]!.nonStr).toBeGreaterThan(0);
    expect(series[series.length - 1]!.nonStr).toBe(0);

    // Linearity: the midpoint sample (strWeight = 0.5) sits at the exact
    // arithmetic mean of the two endpoints, within tolerance.
    const lo = series[0]!;
    const hi = series[series.length - 1]!;
    const mid = series.find((s) => s.strWeight === 0.5)!;
    expect(mid.nonStr).toBeCloseTo((lo.nonStr + hi.nonStr) / 2, 8);
    expect(mid.baseFeeRevenue).toBeCloseTo((lo.baseFeeRevenue + hi.baseFeeRevenue) / 2, 6);
    expect(mid.totalVendorCost).toBeCloseTo((lo.totalVendorCost + hi.totalVendorCost) / 2, 6);
  });
});
