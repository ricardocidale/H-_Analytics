import { describe, it, expect } from "vitest";
import { computeDCF } from "../../calc/returns/dcf-npv.ts";
import { computeIRR } from "../../analytics/returns/irr.ts";
import { DEFAULT_ROUNDING } from "../../calc/shared/utils.ts";

describe("Golden DCF/NPV Scenarios", () => {
  const rounding_policy = DEFAULT_ROUNDING;

  it("Scenario 1: Simple 3-year DCF at 10%", () => {
    /**
     * Cash Flows: [-1000, 400, 400, 400]
     * r = 0.10
     * PV_0 = -1000 / (1.10^0) = -1000.00
     * PV_1 = 400 / (1.10^1) = 363.6363... -> 363.64
     * PV_2 = 400 / (1.10^2) = 330.5785... -> 330.58
     * PV_3 = 400 / (1.10^3) = 300.5259... -> 300.53
     * NPV = -1000 + 363.6363... + 330.5785... + 300.5259... = -5.2592... -> -5.26
     */
    const result = computeDCF({
      cash_flows: [-1000, 400, 400, 400],
      discount_rate: 0.10,
      rounding_policy
    });

    expect(result.npv).toBe(-5.26);
    expect(result.pv_timeline).toEqual([-1000, 363.64, 330.58, 300.53]);
  });

  it("Scenario 2: Zero discount rate", () => {
    /**
     * Cash Flows: [-1000, 400, 400, 400]
     * r = 0
     * NPV = sum of cash flows = -1000 + 400 + 400 + 400 = 200
     */
    const result = computeDCF({
      cash_flows: [-1000, 400, 400, 400],
      discount_rate: 0,
      rounding_policy
    });

    expect(result.npv).toBe(200);
    expect(result.pv_timeline).toEqual([-1000, 400, 400, 400]);
  });

  it("Scenario 3: High discount rate (50%)", () => {
    /**
     * Cash Flows: [-1000, 400, 400, 400]
     * r = 0.50
     * PV_0 = -1000
     * PV_1 = 400 / 1.5 = 266.67
     * PV_2 = 400 / 2.25 = 177.78
     * PV_3 = 400 / 3.375 = 118.52
     * NPV = -1000 + 266.666... + 177.777... + 118.518... = -437.037... -> -437.04
     */
    const result = computeDCF({
      cash_flows: [-1000, 400, 400, 400],
      discount_rate: 0.50,
      rounding_policy
    });

    expect(result.npv).toBe(-437.04);
    expect(result.pv_timeline).toEqual([-1000, 266.67, 177.78, 118.52]);
  });

  it("Scenario 4: IRR cross-check", () => {
    const cash_flows = [-1000, 400, 400, 400];
    const irrResult = computeIRR(cash_flows);
    expect(irrResult.converged).toBe(true);

    const result = computeDCF({
      cash_flows,
      discount_rate: irrResult.irr_periodic!,
      irr_cross_check: irrResult.irr_periodic!,
      rounding_policy
    });

    expect(result.irr_cross_check_passed).toBe(true);
    expect(Math.abs(result.npv)).toBeLessThan(0.01);
  });

  it("Scenario 5: Single period", () => {
    /**
     * Cash Flows: [-100, 110]
     * r = 0.05
     * PV_0 = -100
     * PV_1 = 110 / 1.05 = 104.7619... -> 104.76
     * NPV = 104.76 - 100 = 4.76
     */
    const result = computeDCF({
      cash_flows: [-100, 110],
      discount_rate: 0.05,
      rounding_policy
    });

    expect(result.npv).toBe(4.76);
    expect(result.pv_timeline).toEqual([-100, 104.76]);
  });

  it("Scenario 6: 10-year investment with exit at 8% discount", () => {
    /**
     * Cash Flows: [-5000000, 300000, 400000, 500000, 550000, 600000, 650000, 700000, 750000, 800000, 8500000]
     * r = 0.08
     * PV_0 = -5000000
     * PV_1 = 300000 / 1.08^1 = 277777.78
     * PV_2 = 400000 / 1.08^2 = 342935.53
     * PV_3 = 500000 / 1.08^3 = 396916.12
     * PV_4 = 550000 / 1.08^4 = 404264.88
     * PV_5 = 600000 / 1.08^5 = 408350.18
     * PV_6 = 650000 / 1.08^6 = 409605.34
     * PV_7 = 700000 / 1.08^7 = 408434.33
     * PV_8 = 750000 / 1.08^8 = 405206.87
     * PV_9 = 800000 / 1.08^9 = 400200.07
     * PV_10 = 8500000 / 1.08^10 = 3937145.42
     * NPV = sum(PV_t) = 2390836.52
     */
    const cash_flows = [-5000000, 300000, 400000, 500000, 550000, 600000, 650000, 700000, 750000, 800000, 8500000];
    const result = computeDCF({
      cash_flows,
      discount_rate: 0.08,
      rounding_policy
    });

    const expectedPVs = [
      -5000000,
      277777.78,
      342935.53,
      396916.12,
      404266.42,
      408349.92,
      409610.26,
      408443.28,
      405201.66,
      400199.17,
      3937144.65
    ];

    expect(result.pv_timeline).toEqual(expectedPVs);
    expect(result.npv).toBe(2390844.78);
  });

  it("Scenario 7: Monthly periods with annualization", () => {
    /**
     * Cash Flows: 12 months of $100 after -$1000 investment
     * r = 0.01 (monthly)
     * n = 12
     * annualized_discount_rate = (1.01^12) - 1 = 0.12682503...
     * The utility rounds to 6 decimals (RATE_ROUNDING).
     * 0.12682503... -> 0.126825
     */
    const cash_flows = [-1000, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100];
    const result = computeDCF({
      cash_flows,
      discount_rate: 0.01,
      periods_per_year: 12,
      rounding_policy
    });

    expect(result.annualized_discount_rate).toBe(0.126825);
    // NPV = -1000 + 100 * (1 - 1.01^-12) / 0.01 = -1000 + 100 * 11.25507... = 125.51
    expect(result.npv).toBe(125.51);
  });

  it("Scenario 8: PV timeline verification", () => {
    /**
     * Each entry = CF_t / (1+r)^t
     * Verification already covered in Scenario 1 and 6, but adding explicit check.
     */
    const cash_flows = [-1000, 200, 300, 400];
    const discount_rate = 0.15;
    const result = computeDCF({
      cash_flows,
      discount_rate,
      rounding_policy
    });

    for (let t = 0; t < cash_flows.length; t++) {
      const expectedPV = Math.round((cash_flows[t] / Math.pow(1 + discount_rate, t)) * 100) / 100;
      expect(result.pv_timeline[t]).toBe(expectedPV);
    }
  });
});
