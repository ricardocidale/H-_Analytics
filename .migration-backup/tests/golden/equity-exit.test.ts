import { describe, it, expect } from "vitest";
import { computeEquityMultiple } from "../../calc/returns/equity-multiple";
import { computeExitValuation } from "../../calc/returns/exit-valuation";

describe("T003: Golden Equity Multiple & Exit Valuation", () => {
  const rounding_policy = { mode: "round", precision: 2 } as const;

  describe("Equity Multiple Scenarios", () => {
    /**
     * Scenario 1: Simple 2x
     * Cash Flows: [-500000, 200000, 200000, 600000]
     * Invested: 500,000
     * Returned: 200,000 + 200,000 + 600,000 = 1,000,000
     * Multiple: 1,000,000 / 500,000 = 2.0
     * Profit: 1,000,000 - 500,000 = 500,000
     */
    it("Scenario 1: Simple 2x return", () => {
      const result = computeEquityMultiple({
        cash_flows: [-500000, 200000, 200000, 600000],
        rounding_policy
      });
      expect(result.total_invested).toBe(500000);
      expect(result.total_returned).toBe(1000000);
      expect(result.equity_multiple).toBe(2.0);
      expect(result.net_profit).toBe(500000);
    });

    /**
     * Scenario 2: Loss
     * Cash Flows: [-1000000, 300000, 200000]
     * Invested: 1,000,000
     * Returned: 300,000 + 200,000 = 500,000
     * Multiple: 500,000 / 1,000,000 = 0.5
     * Profit: 500,000 - 1,000,000 = -500,000
     */
    it("Scenario 2: Investment loss (0.5x multiple)", () => {
      const result = computeEquityMultiple({
        cash_flows: [-1000000, 300000, 200000],
        rounding_policy
      });
      expect(result.total_invested).toBe(1000000);
      expect(result.total_returned).toBe(500000);
      expect(result.equity_multiple).toBe(0.5);
      expect(result.net_profit).toBe(-500000);
    });

    /**
     * Scenario 3: Break-even
     * Cash Flows: [-100, 100]
     * Invested: 100
     * Returned: 100
     * Multiple: 100 / 100 = 1.0
     * Profit: 100 - 100 = 0
     */
    it("Scenario 3: Break-even (1.0x multiple)", () => {
      const result = computeEquityMultiple({
        cash_flows: [-100, 100],
        rounding_policy
      });
      expect(result.total_invested).toBe(100);
      expect(result.total_returned).toBe(100);
      expect(result.equity_multiple).toBe(1.0);
      expect(result.net_profit).toBe(0);
    });

    /**
     * Scenario 4: Multiple investments
     * Cash Flows: [-500, -300, 400, 600]
     * Invested: 500 + 300 = 800
     * Returned: 400 + 600 = 1000
     * Multiple: 1000 / 800 = 1.25
     * Profit: 1000 - 800 = 200
     */
    it("Scenario 4: Multiple investment periods", () => {
      const result = computeEquityMultiple({
        cash_flows: [-500, -300, 400, 600],
        rounding_policy
      });
      expect(result.total_invested).toBe(800);
      expect(result.total_returned).toBe(1000);
      expect(result.equity_multiple).toBe(1.25);
      expect(result.net_profit).toBe(200);
    });
  });

  describe("Exit Valuation Scenarios", () => {
    /**
     * Scenario 1: Standard
     * NOI: 740,000
     * Cap Rate: 7.5% (0.075)
     * Gross Sale Price: 740,000 / 0.075 = 9,866,666.67
     * Commission: 5% of Gross = 493,333.33
     * Net Sale Proceeds: 9,866,666.67 - 493,333.33 = 9,373,333.34
     * Debt Repayment: 4,000,000
     * Net to Equity: 9,373,333.34 - 4,000,000 = 5,373,333.34
     */
    it("Scenario 1: Standard exit with debt", () => {
      const result = computeExitValuation({
        stabilized_noi: 740000,
        exit_cap_rate: 0.075,
        commission_rate: 0.05,
        outstanding_debt: 4000000,
        rounding_policy
      });
      expect(result.gross_sale_price).toBe(9866666.67);
      expect(result.commission).toBe(493333.33);
      expect(result.net_sale_proceeds).toBe(9373333.34);
      expect(result.debt_repayment).toBe(4000000);
      expect(result.net_to_equity).toBe(5373333.34);
    });

    /**
     * Scenario 2: Debt-free exit
     * NOI: 500,000
     * Cap Rate: 10% (0.10)
     * Gross: 5,000,000
     * Commission: 5% = 250,000
     * Net Proceeds: 5,000,000 - 250,000 = 4,750,000
     * Debt: 0
     * Net to Equity: 4,750,000
     */
    it("Scenario 2: Debt-free exit", () => {
      const result = computeExitValuation({
        stabilized_noi: 500000,
        exit_cap_rate: 0.10,
        commission_rate: 0.05,
        outstanding_debt: 0,
        rounding_policy
      });
      expect(result.gross_sale_price).toBe(5000000);
      expect(result.net_sale_proceeds).toBe(4750000);
      expect(result.debt_repayment).toBe(0);
      expect(result.net_to_equity).toBe(4750000);
    });

    /**
     * Scenario 3: Zero cap rate edge case
     * Expected: Returns 0 according to implementation (line 64-66)
     */
    it("Scenario 3: Zero cap rate edge case", () => {
      const result = computeExitValuation({
        stabilized_noi: 500000,
        exit_cap_rate: 0,
        rounding_policy
      });
      expect(result.gross_sale_price).toBe(0);
      expect(result.net_to_equity).toBe(0);
    });

    /**
     * Scenario 4: High leverage exit (Underwater)
     * NOI: 200,000
     * Cap Rate: 10% (0.10)
     * Gross: 2,000,000
     * Commission: 5% = 100,000
     * Net Proceeds: 1,900,000
     * Debt: 2,500,000
     * Net to Equity: 1,900,000 - 2,500,000 = -600,000
     */
    it("Scenario 4: High leverage exit (Underwater)", () => {
      const result = computeExitValuation({
        stabilized_noi: 200000,
        exit_cap_rate: 0.10,
        commission_rate: 0.05,
        outstanding_debt: 2500000,
        rounding_policy
      });
      expect(result.gross_sale_price).toBe(2000000);
      expect(result.net_sale_proceeds).toBe(1900000);
      expect(result.debt_repayment).toBe(2500000);
      expect(result.net_to_equity).toBe(-600000);
      expect(result.debt_free_at_exit).toBe(false);
    });

    /**
     * Scenario 5: Price per key
     * Rooms: 50
     * Gross Sale Price: 10,000,000
     * Implied Price per Key: 10,000,000 / 50 = 200,000
     */
    it("Scenario 5: Price per key calculation", () => {
      const result = computeExitValuation({
        stabilized_noi: 800000,
        exit_cap_rate: 0.08,
        room_count: 50,
        rounding_policy
      });
      expect(result.gross_sale_price).toBe(10000000);
      expect(result.implied_price_per_key).toBe(200000);
    });
  });
});
