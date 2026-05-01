import { describe, it, expect } from "vitest";
import { computeStressTest } from "../../calc/analysis/stress-test";
import { computeWaterfall } from "../../calc/analysis/waterfall";
import { DEFAULT_ROUNDING } from "../../calc/shared/utils";

describe("T006: Golden Stress Test & Waterfall", () => {
  describe("Stress Test Scenarios", () => {
    /**
     * Scenario 1: Base: ADR=250, Occ=75%, NOI=800k, Revenue=2M, DS=300k, exit cap 7.5%. 
     * Apply Mild Recession (ADR -5%, Occ -10%, Exp +3%): 
     * 
     * Hand-calculations:
     * Base:
     * - RevPAR = 250 * 0.75 = 187.50
     * - OpEx = 2,000,000 - 800,000 = 1,200,000
     * - Exit Value = 800,000 / 0.075 = 10,666,666.67
     * - DSCR = 800,000 / 300,000 = 2.6667
     * 
     * Stressed (Mild Recession):
     * - Stressed ADR = 250 * 0.95 = 237.50
     * - Stressed Occ = 0.75 * 0.90 = 0.675
     * - Stressed RevPAR = 237.50 * 0.675 = 160.31 (rounded to 2 decimals)
     * - Revenue Multiplier = 160.31 / 187.50 = 0.8549866...
     * - Stressed Revenue = 2,000,000 * 0.8549866... = 1,709,973.33 (rounded)
     * - Stressed OpEx = 1,200,000 * 1.03 = 1,236,000
     * - Stressed NOI = 1,709,973.33 - 1,236,000 = 473,973.33
     * - Stressed Exit Cap = 0.075 (no shock)
     * - Stressed Exit Value = 473,973.33 / 0.075 = 6,319,644.40
     * - NOI Impact % = (473,973.33 - 800,000) / 800,000 = -40.75%
     * - Exit Value Impact % = (6,319,644.40 - 10,666,666.67) / 10,666,666.67 = -40.75%
     * - Stressed DSCR = 473,973.33 / 300,000 = 1.5799
     * - Severity: Critical (NOI drop > 30%)
     */
    it("Scenario 1: Mild Recession impact on a standard property", () => {
      const input = {
        base_adr: 250,
        base_occupancy: 0.75,
        base_noi: 800000,
        room_count: 100, // Not explicitly used for RevPAR but often required in models
        annual_revenue: 2000000,
        annual_debt_service: 300000,
        exit_cap_rate: 0.075,
        hold_period_years: 5,
        scenarios: [
          {
            label: "Mild Recession",
            adr_shock_pct: -5,
            occupancy_shock_pct: -10,
            expense_shock_pct: 3,
            cap_rate_shock_bps: 0
          }
        ],
        rounding_policy: DEFAULT_ROUNDING
      };

      const result = computeStressTest(input);
      const scenario = result.scenarios[0];

      expect(result.base_revpar).toBe(187.50);
      expect(result.base_exit_value).toBe(10666666.67);
      expect(result.base_dscr).toBe(2.6667);

      expect(scenario.stressed_adr).toBe(237.50);
      expect(scenario.stressed_occupancy).toBe(0.6750);
      expect(scenario.stressed_revpar).toBe(160.31);
      expect(scenario.stressed_revenue).toBe(1709973.33);
      expect(scenario.stressed_noi).toBe(473973.33);
      expect(scenario.stressed_exit_value).toBe(6319644.40);
      expect(scenario.noi_impact_pct).toBe(-40.75);
      expect(scenario.dscr).toBe(1.5799);
      expect(scenario.severity).toBe("critical");
    });

    /**
     * Scenario 2: Pandemic Shock: ADR -30%, Occ -50%, Exp -10%, Cap Rate +150 bps
     * Base: ADR=250, Occ=75%, NOI=800k, Revenue=2M, DS=300k, exit cap 7.5%.
     * 
     * Hand-calculations:
     * - Stressed ADR = 250 * 0.70 = 175
     * - Stressed Occ = 0.75 * 0.50 = 0.375
     * - Stressed RevPAR = 175 * 0.375 = 65.63 (rounded)
     * - Revenue Multiplier = 65.63 / 187.50 = 0.3500266...
     * - Stressed Revenue = 2,000,000 * 0.3500266... = 700,053.33
     * - Stressed OpEx = 1,200,000 * 0.90 = 1,080,000
     * - Stressed NOI = 700,053.33 - 1,080,000 = -379,946.67
     * - Stressed Exit Cap = 0.075 + 0.015 = 0.09
     * - Stressed Exit Value = -379,946.67 / 0.09 = -4,221,629.67
     * - Severity: Critical
     */
    it("Scenario 2: Pandemic Shock with negative NOI", () => {
      const input = {
        base_adr: 250,
        base_occupancy: 0.75,
        base_noi: 800000,
        room_count: 100,
        annual_revenue: 2000000,
        annual_debt_service: 300000,
        exit_cap_rate: 0.075,
        hold_period_years: 5,
        scenarios: [
          {
            label: "Pandemic Shock",
            adr_shock_pct: -30,
            occupancy_shock_pct: -50,
            expense_shock_pct: -10,
            cap_rate_shock_bps: 150
          }
        ],
        rounding_policy: DEFAULT_ROUNDING
      };

      const result = computeStressTest(input);
      const scenario = result.scenarios[0];

      expect(scenario.stressed_noi).toBeLessThan(0);
      expect(scenario.severity).toBe("critical");
      expect(result.scenarios_below_breakeven).toBe(1);
      expect(scenario.dscr).toBe(-1.2665);
      expect(scenario.dscr_passes).toBe(false);
    });

    it("Scenario 3: No debt service results in null DSCR", () => {
      const input = {
        base_adr: 250,
        base_occupancy: 0.75,
        base_noi: 800000,
        room_count: 100,
        annual_revenue: 2000000,
        exit_cap_rate: 0.075,
        hold_period_years: 5,
        scenarios: [{ label: "Test", adr_shock_pct: 0, occupancy_shock_pct: 0 }],
        rounding_policy: DEFAULT_ROUNDING
      };
      const result = computeStressTest(input);
      expect(result.base_dscr).toBeNull();
      expect(result.scenarios[0].dscr).toBeNull();
    });

    it("Scenario 4: Portfolio risk score formula verification", () => {
       // Risk score = ((criticalCount * 3 + severeCount * 2 + belowBreakeven * 4) / totalScenarios)
       const input = {
        base_adr: 100,
        base_occupancy: 1,
        base_noi: 1000,
        room_count: 10,
        annual_revenue: 2000,
        exit_cap_rate: 0.1,
        hold_period_years: 5,
        scenarios: [
          { label: "Critical + Breakeven", adr_shock_pct: -100, occupancy_shock_pct: 0 }, // NOI = -1000 (OpEx was 1000), Impact -200% -> Critical
          { label: "Severe", adr_shock_pct: -10, occupancy_shock_pct: 0 }, // Revenue 1800, OpEx 1000, NOI 800, Impact -20% -> Severe
        ],
        rounding_policy: DEFAULT_ROUNDING
      };
      const result = computeStressTest(input);
      // Critical: 1, Severe: 1, BelowBreakeven: 1
      // Score = (1*3 + 1*2 + 1*4) / 2 = 9 / 2 = 4.5
      expect(result.portfolio_risk_score).toBe(4.5);
    });
  });

  describe("Waterfall Scenarios", () => {
    /**
     * Scenario 1: Simple 2-tier: $1M equity (90% LP/10% GP), $1.5M distributable, 8% pref, tiers [80/20, 70/30]
     * 
     * Hand-calculations:
     * - LP Equity: 900,000
     * - GP Equity: 100,000
     * - Distributable: 1,500,000
     * 
     * 1. ROC: min(1,500,000, 1,000,000) = 1,000,000
     *    - LP ROC: 1,000,000 * 0.9 = 900,000
     *    - GP ROC: 1,000,000 * 0.1 = 100,000
     *    Remaining: 500,000
     * 
     * 2. Pref (8% of 1M): 80,000 — LP-priority (entire pref to LP)
     *    - LP Pref: 80,000
     *    - GP Pref: 0
     *    Remaining: 420,000
     * 
     * 3. Tier 1 (80/20 split):
     *    - LP: 420,000 * 0.8 = 336,000
     *    - GP: 420,000 * 0.2 = 84,000
     *    Remaining: 0
     * 
     * Totals:
     * - LP: 900k + 80k + 336k = 1,316,000
     * - GP: 100k + 0 + 84k = 184,000
     * - LP Multiple: 1,316,000 / 900,000 = 1.4622
     * - GP Multiple: 184,000 / 100,000 = 1.84
     */
    it("Scenario 1: Simple 2-tier waterfall", () => {
      const input = {
        total_equity_invested: 1000000,
        lp_equity: 900000,
        gp_equity: 100000,
        distributable_cash_flows: [1500000],
        preferred_return: 0.08,
        tiers: [
          { label: "Tier 1", hurdle_irr: 0.12, lp_split: 0.8, gp_split: 0.2 },
          { label: "Tier 2", hurdle_irr: 0.18, lp_split: 0.7, gp_split: 0.3 }
        ],
        rounding_policy: DEFAULT_ROUNDING
      };

      const result = computeWaterfall(input);

      expect(result.return_of_capital).toBe(1000000);
      expect(result.preferred_return_amount).toBe(80000);
      expect(result.tier_results[0].amount_distributed).toBe(420000);
      expect(result.tier_results[0].lp_amount).toBe(336000);
      expect(result.tier_results[0].gp_amount).toBe(84000);
      expect(result.total_to_lp).toBe(1316000);
      expect(result.total_to_gp).toBe(184000);
      expect(result.lp_multiple).toBe(1.4622);
      expect(result.gp_multiple).toBe(1.84);
    });

    /**
     * Scenario 2: Insufficient cash (pref shortfall): only $900k distributable for $1M invested
     * 
     * Hand-calculations:
     * - ROC: min(900k, 1M) = 900k
     * - Pref Target: 80k
     * - Pref Paid: 0 (remaining was 0)
     * - Shortfall: 80k
     */
    it("Scenario 2: Insufficient cash resulting in pref shortfall", () => {
      const input = {
        total_equity_invested: 1000000,
        lp_equity: 900000,
        gp_equity: 100000,
        distributable_cash_flows: [900000],
        preferred_return: 0.08,
        tiers: [
          { label: "Tier 1", hurdle_irr: 0.12, lp_split: 0.8, gp_split: 0.2 }
        ],
        rounding_policy: DEFAULT_ROUNDING
      };

      const result = computeWaterfall(input);

      expect(result.return_of_capital).toBe(900000);
      expect(result.preferred_return_amount).toBe(0);
      expect(result.preferred_return_shortfall).toBe(80000);
      expect(result.total_to_lp).toBe(810000);
      expect(result.total_to_gp).toBe(90000);
    });

    /**
     * Scenario 3: With catch-up: GP 100% catch-up to 20% target
     * 
     * Hand-calculations (using values from Scenario 1 but with catch-up):
     * LP Equity: 900k, GP Equity: 100k
     * Distributable: 1.5M
     * 1. ROC: LP 900k, GP 100k. Remaining 500k.
     * 2. Pref: 80k entirely to LP (LP-priority). Remaining 420k.
     * 
     * 3. Catch-up: GP target 20% of all distributions so far (1.08M)
     *    Total distributed so far = 1.08M
     *    GP target total = 1.08M * 0.20 / (1 - 0.20) = 1.08M * 0.25 = 270,000
     *    GP has received = 100,000 (ROC only)
     *    GP Shortfall = 270,000 - 100,000 = 170,000
     *    Remaining is 420,000, so GP gets full 170,000 (at 100% rate)
     *    Remaining after catch-up: 420,000 - 170,000 = 250,000
     * 
     * 4. Tier 1 (80/20 split of 250,000):
     *    LP: 250,000 * 0.8 = 200,000
     *    GP: 250,000 * 0.2 = 50,000
     * 
     * Totals:
     * LP: 900k + 80k + 200k = 1,180,000
     * GP: 100k + 0 + 170k + 50k = 320,000
     */
    it("Scenario 3: Waterfall with 100% GP catch-up", () => {
      const input = {
        total_equity_invested: 1000000,
        lp_equity: 900000,
        gp_equity: 100000,
        distributable_cash_flows: [1500000],
        preferred_return: 0.08,
        catch_up_rate: 1.0,
        catch_up_to_gp_pct: 0.20,
        tiers: [
          { label: "Tier 1", hurdle_irr: 0.12, lp_split: 0.8, gp_split: 0.2 }
        ],
        rounding_policy: DEFAULT_ROUNDING
      };

      const result = computeWaterfall(input);

      expect(result.catch_up_amount).toBe(170000);
      expect(result.total_to_lp).toBe(1180000);
      expect(result.total_to_gp).toBe(320000);
    });

    it("Scenario 4: Zero distributable returns all zeros", () => {
      const input = {
        total_equity_invested: 1000000,
        lp_equity: 900000,
        gp_equity: 100000,
        distributable_cash_flows: [0],
        preferred_return: 0.08,
        tiers: [{ label: "T1", hurdle_irr: 0.1, lp_split: 0.8, gp_split: 0.2 }],
        rounding_policy: DEFAULT_ROUNDING
      };
      const result = computeWaterfall(input);
      expect(result.total_to_lp).toBe(0);
      expect(result.total_to_gp).toBe(0);
      expect(result.lp_multiple).toBe(0);
      expect(result.gp_multiple).toBe(0);
    });
  });
});
