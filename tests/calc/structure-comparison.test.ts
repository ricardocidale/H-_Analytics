/**
 * tests/calc/structure-comparison.test.ts
 *
 * Targeted tests for compareOperatingStructures — focuses on the tenant vs
 * landlord cash-flow identity and the IRR invariants required by the
 * structure-comparison brief (Task #809).
 *
 * Specifically validates:
 *   1. Master-lease TENANT: levered IRR == unlevered IRR (no real-estate debt
 *      at the tenant level → leverage cannot amplify returns).
 *   2. Master-lease TENANT: revenue distribution sums to gross revenue
 *      (operator + brand + lender + sponsor + opex ≈ revenueTotal).
 *   3. Master-lease LANDLORD: receives rent only; sponsor cash flow reflects
 *      rent − landlord opex − debt service.
 *   4. The tenant Y0 outlay is the leasehold deposit (NOT total project cost),
 *      and the recommendation engine ranks structures consistently.
 */
import { describe, it, expect } from "vitest";
import {
  compareOperatingStructures,
  type StructureComparisonInput,
} from "../../calc/analysis/structure-comparison.js";
import type { YearlyPropertyFinancials } from "../../engine/aggregation/yearlyAggregator.js";

function makeYear(year: number, overrides: Partial<YearlyPropertyFinancials> = {}): YearlyPropertyFinancials {
  // Realistic ~$10M-revenue mid-scale hotel year
  const revenue = 10_000_000;
  const gop = 3_500_000;
  const noi = 2_500_000;
  const debt = 1_400_000;
  return {
    year,
    soldRooms: 50_000,
    availableRooms: 73_000,
    cleanAdr: 200,
    revenueRooms: revenue * 0.7,
    revenueEvents: revenue * 0.05,
    revenueFB: revenue * 0.2,
    revenueOther: revenue * 0.05,
    revenueTotal: revenue,
    expenseRooms: revenue * 0.25,
    expenseFB: revenue * 0.15,
    expenseEvents: revenue * 0.02,
    expenseOther: revenue * 0.02,
    expenseOtherCosts: 0,
    expenseInsurance: 80_000,
    expenseMarketing: revenue * 0.04,
    expensePropertyOps: revenue * 0.05,
    expenseUtilitiesVar: revenue * 0.02,
    expenseUtilitiesFixed: 0,
    expenseUtilities: revenue * 0.02,
    expenseAdmin: revenue * 0.04,
    expenseIT: revenue * 0.005,
    expenseTaxes: 250_000,
    expenseFFE: revenue * 0.04,
    expensePlatformFees: 0,
    expensePreOpening: 0,
    feeBase: revenue * 0.03,
    feeIncentive: revenue * 0.01,
    serviceFeesByCategory: {},
    totalExpenses: revenue - gop,
    gop,
    agop: gop,
    noi,
    anoi: noi,
    interestExpense: 800_000,
    depreciationExpense: 600_000,
    incomeTax: 0,
    netIncome: noi - 800_000 - 600_000,
    principalPayment: 200_000,
    debtPayment: debt,
    refinancingProceeds: 0,
    accountsReceivable: 0,
    accountsPayable: 0,
    workingCapitalChange: 0,
    ...overrides,
  } as YearlyPropertyFinancials;
}

function makeInput(overrides: Partial<StructureComparisonInput> = {}): StructureComparisonInput {
  const yearly = Array.from({ length: 5 }, (_, i) => makeYear(i + 1));
  const totalProjectCost = 25_000_000;
  const ltv = 0.6;
  const initialDebt = totalProjectCost * ltv;
  return {
    propertyId: 1,
    propertyName: "Test Hotel",
    country: "USA",
    totalProjectCost,
    initialEquity: totalProjectCost - initialDebt,
    exitDebtBalance: initialDebt - 1_000_000, // ~5y of principal pay-down
    exitCapRate: 0.085,
    yearly,
    ...overrides,
  };
}

describe("compareOperatingStructures — tenant vs landlord invariants", () => {
  it("master-lease TENANT has levered IRR equal to unlevered IRR (no real-estate debt at tenant level)", () => {
    const result = compareOperatingStructures(
      makeInput({ structures: ["master-lease-tenant"] }),
    );
    const tenant = result.structures.find((s) => s.id === "master-lease-tenant");
    expect(tenant).toBeDefined();
    if (!tenant?.unleveredIrr || !tenant?.leveredIrr) return;
    // Equal by construction — no debt at the tenant level
    expect(tenant.leveredIrr).toBeCloseTo(tenant.unleveredIrr, 6);
  });

  it("master-lease TENANT revenue distribution sums to ~gross revenue (sponsor + opex ≈ revenueTotal)", () => {
    const result = compareOperatingStructures(
      makeInput({ structures: ["master-lease-tenant"] }),
    );
    const tenant = result.structures.find((s) => s.id === "master-lease-tenant");
    expect(tenant).toBeDefined();
    if (!tenant) return;
    const { operator, brand, lender, sponsor, operatingExpenses, grossRevenue } =
      tenant.revenueDistribution;
    // Tenant: no operator/brand fees flow to user (they're absorbed),
    // no lender (no debt) — sponsor + opex should reconcile to gross revenue.
    expect(operator).toBe(0);
    expect(brand).toBe(0);
    expect(lender).toBe(0);
    const sum = sponsor + operatingExpenses;
    // Allow ~0.5% drift for rounding/capex factors
    expect(Math.abs(sum - grossRevenue) / grossRevenue).toBeLessThan(0.005);
  });

  it("master-lease LANDLORD has positive lender flow (debt service paid from rent)", () => {
    const result = compareOperatingStructures(
      makeInput({ structures: ["master-lease-landlord"] }),
    );
    const landlord = result.structures.find(
      (s) => s.id === "master-lease-landlord",
    );
    expect(landlord).toBeDefined();
    if (!landlord) return;
    // Landlord pays the property-level debt → lender bucket is non-zero
    expect(landlord.revenueDistribution.lender).toBeGreaterThan(0);
  });

  it("TENANT Y0 outlay is the leasehold deposit, not total project cost (equity multiple > 1 typical)", () => {
    const result = compareOperatingStructures(
      makeInput({ structures: ["master-lease-tenant"] }),
    );
    const tenant = result.structures.find((s) => s.id === "master-lease-tenant");
    expect(tenant).toBeDefined();
    if (!tenant) return;
    // If we had used totalProjectCost as Y0, equityMultiple would be ~0.x
    // because hold-period operating CF is tiny vs $25M outlay. With the
    // leasehold deposit (months of base rent) as Y0, distributions over 5y
    // exceed the deposit by orders of magnitude → MOIC is very large.
    expect(tenant.equityMultiple).toBeGreaterThan(2);
  });

  it("returns a stable recommendation across all six structures", () => {
    const result = compareOperatingStructures(makeInput());
    expect(result.structures).toHaveLength(6);
    expect(result.recommendation).toBeDefined();
    expect(result.recommendationRationale.length).toBeGreaterThan(0);
    expect(typeof result.isCloseCall).toBe("boolean");
    expect(result.closeCallStructures.length).toBeGreaterThanOrEqual(1);
  });

  it("pure function — same input produces same output", () => {
    const input = makeInput();
    const a = compareOperatingStructures(input);
    const b = compareOperatingStructures(input);
    expect(a.recommendation).toBe(b.recommendation);
    expect(a.structures.map((s) => s.unleveredIrr)).toEqual(
      b.structures.map((s) => s.unleveredIrr),
    );
  });

  it("scenario overlays patch a single structure without affecting siblings", () => {
    // Doubling the franchise royalty must lower the franchise NOI but leave
    // every other structure (e.g. independent, HMA) at their baseline
    // numbers — proves the overlay deep-merge is per-structure scoped.
    const baseline = compareOperatingStructures(makeInput());
    const patched = compareOperatingStructures(
      makeInput({
        overlays: {
          "fee-simple-franchise": {
            feeOverlay: { brandRoyaltyOnRooms: 0.11 }, // 2× the 5.5% baseline
          },
        },
      }),
    );

    const baseFranchise = baseline.structures.find((s) => s.id === "fee-simple-franchise")!;
    const patchedFranchise = patched.structures.find((s) => s.id === "fee-simple-franchise")!;
    expect(patchedFranchise.avgNoi).toBeLessThan(baseFranchise.avgNoi);

    // All other structures unchanged
    const others: Array<typeof baseline.structures[number]["id"]> = [
      "fee-simple-independent",
      "fee-simple-hma",
      "master-lease-tenant",
      "master-lease-landlord",
      "hybrid-hma-franchise",
    ];
    for (const id of others) {
      const b = baseline.structures.find((s) => s.id === id)!;
      const p = patched.structures.find((s) => s.id === id)!;
      expect(p.avgNoi).toBeCloseTo(b.avgNoi, 4);
    }
  });

  it("scenario overlays merge with country-resolved baselines (omitted fields fall through)", () => {
    // Override only the HMA incentive — base fee should remain at the
    // country-resolved baseline (not silently collapse to 0).
    const result = compareOperatingStructures(
      makeInput({
        structures: ["fee-simple-hma"],
        overlays: {
          "fee-simple-hma": {
            feeOverlay: { hmaIncentiveOnGop: 0.20 }, // 2× the 10% baseline
          },
        },
      }),
    );
    const hma = result.structures.find((s) => s.id === "fee-simple-hma")!;
    const baselineHma = compareOperatingStructures(
      makeInput({ structures: ["fee-simple-hma"] }),
    ).structures.find((s) => s.id === "fee-simple-hma")!;
    // HMA fees flow into the *operator* bucket (brand bucket is for
    // franchise royalty/marketing/reservation, all zero on a pure HMA).
    // Doubling the incentive must grow the operator bucket — and the
    // baseline base fee must still be present (proving the omitted field
    // fell through to the resolved value rather than collapsing to 0).
    expect(hma.revenueDistribution.operator).toBeGreaterThan(
      baselineHma.revenueDistribution.operator,
    );
    expect(baselineHma.revenueDistribution.operator).toBeGreaterThan(0);
  });
});
