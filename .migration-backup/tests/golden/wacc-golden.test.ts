/**
 * wacc-golden.test.ts — Hand-calculated WACC golden reference tests.
 *
 * All expected values computed by hand. Zero ambiguity:
 *   WACC = (E/V × Re) + (D/V × Rd × (1 − T))
 *
 * Scenarios:
 *   1. All-cash purchase (no debt) → WACC = cost of equity
 *   2. 75% LTV typical hotel deal → blended WACC
 *   3. 50/50 capital structure → symmetric weights
 *   4. Zero tax rate → no tax shield benefit
 *   5. 100% debt (theoretical edge case)
 *   6. Portfolio with 2 properties, different capital structures
 *   7. Portfolio with 3 properties, mixed cash/financed
 *   8. Single-property portfolio (should equal single-property WACC)
 *   9. Empty portfolio (zero properties)
 */
import { describe, it, expect } from "vitest";
import { computeWACC, computePortfolioWACC } from "../../calc/returns/wacc";
import { DEFAULT_ROUNDING } from "../../calc/shared/utils";

const RP = DEFAULT_ROUNDING;

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLE-PROPERTY WACC
// ═══════════════════════════════════════════════════════════════════════════════

describe("WACC — Single Property", () => {
  it("Scenario 1: All-cash purchase — WACC equals cost of equity", () => {
    // E = 1,500,000, D = 0, Re = 0.18, Rd = 0 (irrelevant), T = 0.25
    // WACC = (1.0 × 0.18) + (0.0 × 0 × 0.75) = 0.18
    const result = computeWACC({
      equity: 1_500_000,
      debt: 0,
      cost_of_equity: 0.18,
      cost_of_debt: 0.09,
      tax_rate: 0.25,
      rounding_policy: RP,
    });
    expect(result.wacc).toBe(0.18);
    expect(result.equity_weight).toBe(1.0);
    expect(result.debt_weight).toBe(0.0);
    expect(result.equity_component).toBe(0.18);
    expect(result.debt_component).toBe(0.0);
    expect(result.after_tax_cost_of_debt).toBe(0.0675); // 0.09 × 0.75
    expect(result.total_capital).toBe(1_500_000);
  });

  it("Scenario 2: 75% LTV typical hotel — blended WACC", () => {
    // Purchase: $2,000,000. LTV 75% → D = 1,500,000, E = 500,000
    // Re = 0.20, Rd = 0.09, T = 0.25
    // E/V = 500k/2M = 0.25, D/V = 1.5M/2M = 0.75
    // After-tax Rd = 0.09 × (1 - 0.25) = 0.0675
    // WACC = (0.25 × 0.20) + (0.75 × 0.0675)
    //      = 0.05 + 0.050625 = 0.100625
    const result = computeWACC({
      equity: 500_000,
      debt: 1_500_000,
      cost_of_equity: 0.20,
      cost_of_debt: 0.09,
      tax_rate: 0.25,
      rounding_policy: RP,
    });
    expect(result.wacc).toBe(0.100625);
    expect(result.equity_weight).toBe(0.25);
    expect(result.debt_weight).toBe(0.75);
    expect(result.equity_component).toBe(0.05);
    expect(result.debt_component).toBe(0.050625);
    expect(result.after_tax_cost_of_debt).toBe(0.0675);
    expect(result.total_capital).toBe(2_000_000);
  });

  it("Scenario 3: 50/50 capital structure — symmetric weights", () => {
    // E = 1,000,000, D = 1,000,000, Re = 0.15, Rd = 0.07, T = 0.30
    // E/V = 0.5, D/V = 0.5
    // After-tax Rd = 0.07 × 0.70 = 0.049
    // WACC = (0.5 × 0.15) + (0.5 × 0.049) = 0.075 + 0.0245 = 0.0995
    const result = computeWACC({
      equity: 1_000_000,
      debt: 1_000_000,
      cost_of_equity: 0.15,
      cost_of_debt: 0.07,
      tax_rate: 0.30,
      rounding_policy: RP,
    });
    expect(result.wacc).toBe(0.0995);
    expect(result.equity_weight).toBe(0.5);
    expect(result.debt_weight).toBe(0.5);
    expect(result.equity_component).toBe(0.075);
    expect(result.debt_component).toBe(0.0245);
    expect(result.after_tax_cost_of_debt).toBe(0.049);
  });

  it("Scenario 4: Zero tax rate — no tax shield", () => {
    // E = 400,000, D = 600,000, Re = 0.22, Rd = 0.08, T = 0
    // E/V = 0.4, D/V = 0.6
    // After-tax Rd = 0.08 × 1.0 = 0.08
    // WACC = (0.4 × 0.22) + (0.6 × 0.08) = 0.088 + 0.048 = 0.136
    const result = computeWACC({
      equity: 400_000,
      debt: 600_000,
      cost_of_equity: 0.22,
      cost_of_debt: 0.08,
      tax_rate: 0,
      rounding_policy: RP,
    });
    expect(result.wacc).toBe(0.136);
    expect(result.after_tax_cost_of_debt).toBe(0.08);
  });

  it("Scenario 5: 100% debt — WACC equals after-tax cost of debt", () => {
    // E = 0, D = 1,000,000, Re = 0.20 (irrelevant), Rd = 0.10, T = 0.25
    // E/V = 0, D/V = 1.0
    // WACC = (0 × 0.20) + (1.0 × 0.10 × 0.75) = 0.075
    const result = computeWACC({
      equity: 0,
      debt: 1_000_000,
      cost_of_equity: 0.20,
      cost_of_debt: 0.10,
      tax_rate: 0.25,
      rounding_policy: RP,
    });
    expect(result.wacc).toBe(0.075);
    expect(result.equity_weight).toBe(0.0);
    expect(result.debt_weight).toBe(1.0);
    expect(result.equity_component).toBe(0.0);
    expect(result.debt_component).toBe(0.075);
  });

  it("Scenario 6: Zero capital — returns all zeros", () => {
    const result = computeWACC({
      equity: 0,
      debt: 0,
      cost_of_equity: 0.20,
      cost_of_debt: 0.10,
      tax_rate: 0.25,
      rounding_policy: RP,
    });
    expect(result.wacc).toBe(0);
    expect(result.total_capital).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PORTFOLIO WACC
// ═══════════════════════════════════════════════════════════════════════════════

describe("WACC — Portfolio", () => {
  it("Scenario 7: Two properties with different capital structures", () => {
    // Property A: E=500k, D=1.5M (total=2M), Re=0.20, Rd=0.09
    // Property B: E=800k, D=200k (total=1M), Re=0.16, Rd=0.06
    // Tax rate: 0.25
    //
    // Property A WACC:
    //   E/V=0.25, D/V=0.75, after-tax Rd=0.0675
    //   = (0.25 × 0.20) + (0.75 × 0.0675) = 0.05 + 0.050625 = 0.100625
    //
    // Property B WACC:
    //   E/V=0.80, D/V=0.20, after-tax Rd=0.045
    //   = (0.80 × 0.16) + (0.20 × 0.045) = 0.128 + 0.009 = 0.137
    //
    // Total capital: 2M + 1M = 3M
    // Capital shares: A=2/3, B=1/3
    //
    // Portfolio WACC = (2/3 × 0.100625) + (1/3 × 0.137)
    //               = 0.067083... + 0.045666... = 0.11275
    const result = computePortfolioWACC({
      properties: [
        { name: "Hotel A", equity: 500_000, debt: 1_500_000, cost_of_equity: 0.20, cost_of_debt: 0.09 },
        { name: "Hotel B", equity: 800_000, debt: 200_000, cost_of_equity: 0.16, cost_of_debt: 0.06 },
      ],
      tax_rate: 0.25,
      rounding_policy: RP,
    });

    // Portfolio-level
    expect(result.total_equity).toBe(1_300_000);
    expect(result.total_debt).toBe(1_700_000);
    expect(result.total_capital).toBe(3_000_000);
    expect(result.portfolio_equity_weight).toBeCloseTo(1_300_000 / 3_000_000, 4);
    expect(result.portfolio_debt_weight).toBeCloseTo(1_700_000 / 3_000_000, 4);

    // Per-property WACCs
    expect(result.property_details).toHaveLength(2);
    expect(result.property_details[0].wacc).toBe(0.100625);
    expect(result.property_details[1].wacc).toBe(0.137);

    // Capital shares
    expect(result.property_details[0].capital_share).toBeCloseTo(2 / 3, 4);
    expect(result.property_details[1].capital_share).toBeCloseTo(1 / 3, 4);

    // Portfolio WACC = capital-weighted average
    const expected = (2 / 3) * 0.100625 + (1 / 3) * 0.137;
    expect(result.portfolio_wacc).toBeCloseTo(expected, 4);
  });

  it("Scenario 8: Three properties — mixed cash and financed", () => {
    // Cash property: E=1M, D=0, Re=0.18, Rd=0 (cap=1M)
    // Financed A: E=300k, D=700k, Re=0.22, Rd=0.10 (cap=1M)
    // Financed B: E=600k, D=1.4M, Re=0.20, Rd=0.08 (cap=2M)
    // Tax: 0.20
    //
    // Cash WACC = 0.18 (all equity)
    // A WACC = (0.3 × 0.22) + (0.7 × 0.10 × 0.80) = 0.066 + 0.056 = 0.122
    // B WACC = (0.3 × 0.20) + (0.7 × 0.08 × 0.80) = 0.06 + 0.0448 = 0.1048
    //
    // Total cap = 4M. Shares: Cash=1/4, A=1/4, B=2/4
    // Portfolio = (0.25 × 0.18) + (0.25 × 0.122) + (0.50 × 0.1048)
    //          = 0.045 + 0.0305 + 0.0524 = 0.1279
    const result = computePortfolioWACC({
      properties: [
        { name: "Cash Hotel", equity: 1_000_000, debt: 0, cost_of_equity: 0.18, cost_of_debt: 0 },
        { name: "Financed A", equity: 300_000, debt: 700_000, cost_of_equity: 0.22, cost_of_debt: 0.10 },
        { name: "Financed B", equity: 600_000, debt: 1_400_000, cost_of_equity: 0.20, cost_of_debt: 0.08 },
      ],
      tax_rate: 0.20,
      rounding_policy: RP,
    });

    expect(result.total_capital).toBe(4_000_000);
    expect(result.property_details).toHaveLength(3);
    expect(result.property_details[0].wacc).toBe(0.18);
    expect(result.property_details[1].wacc).toBe(0.122);
    expect(result.property_details[2].wacc).toBe(0.1048);

    const expected = 0.25 * 0.18 + 0.25 * 0.122 + 0.50 * 0.1048;
    expect(result.portfolio_wacc).toBeCloseTo(expected, 4);
  });

  it("Scenario 9: Single-property portfolio equals single-property WACC", () => {
    const single = computeWACC({
      equity: 500_000,
      debt: 1_500_000,
      cost_of_equity: 0.20,
      cost_of_debt: 0.09,
      tax_rate: 0.25,
      rounding_policy: RP,
    });
    const portfolio = computePortfolioWACC({
      properties: [
        { name: "Only Hotel", equity: 500_000, debt: 1_500_000, cost_of_equity: 0.20, cost_of_debt: 0.09 },
      ],
      tax_rate: 0.25,
      rounding_policy: RP,
    });
    expect(portfolio.portfolio_wacc).toBe(single.wacc);
  });

  it("Scenario 10: Empty portfolio — returns all zeros", () => {
    const result = computePortfolioWACC({
      properties: [],
      tax_rate: 0.25,
      rounding_policy: RP,
    });
    expect(result.portfolio_wacc).toBe(0);
    expect(result.total_capital).toBe(0);
    expect(result.property_details).toHaveLength(0);
  });

  it("Scenario 11: WACC < cost of equity (leverage benefit with tax shield)", () => {
    // Adding debt should REDUCE WACC below Re due to the tax shield
    // All-equity: WACC = 0.18
    // With 60% debt at 8%, T=30%:
    //   After-tax Rd = 0.08 × 0.70 = 0.056
    //   WACC = (0.4 × 0.18) + (0.6 × 0.056) = 0.072 + 0.0336 = 0.1056
    //   0.1056 < 0.18 ✓ (leverage benefit)
    const allEquity = computeWACC({
      equity: 1_000_000, debt: 0,
      cost_of_equity: 0.18, cost_of_debt: 0.08, tax_rate: 0.30,
      rounding_policy: RP,
    });
    const levered = computeWACC({
      equity: 400_000, debt: 600_000,
      cost_of_equity: 0.18, cost_of_debt: 0.08, tax_rate: 0.30,
      rounding_policy: RP,
    });
    expect(levered.wacc).toBeLessThan(allEquity.wacc);
    expect(levered.wacc).toBe(0.1056);
  });

  it("Scenario 12: Higher leverage = lower WACC (monotonic with cheap debt)", () => {
    // When Rd(1-T) < Re, increasing leverage should reduce WACC
    const ltv50 = computeWACC({
      equity: 500_000, debt: 500_000,
      cost_of_equity: 0.20, cost_of_debt: 0.08, tax_rate: 0.25,
      rounding_policy: RP,
    });
    const ltv75 = computeWACC({
      equity: 250_000, debt: 750_000,
      cost_of_equity: 0.20, cost_of_debt: 0.08, tax_rate: 0.25,
      rounding_policy: RP,
    });
    expect(ltv75.wacc).toBeLessThan(ltv50.wacc);
  });
});
