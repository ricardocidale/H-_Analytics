import { describe, it, expect } from "vitest";
import { consolidateStatements } from "../../calc/analysis/consolidation.js";
import type { ConsolidationInput, PropertyStatement, ManagementCompanyStatement } from "../../calc/analysis/consolidation.js";

const rounding = { precision: 2, bankers_rounding: false };

function makeProperty(overrides: Partial<PropertyStatement> = {}): PropertyStatement {
  return {
    name: "Hotel A",
    revenue: 100_000,
    operating_expenses: 40_000,
    gop: 60_000,
    management_fees: 10_000,
    ffe_reserve: 4_000,
    noi: 46_000,
    interest_expense: 5_000,
    depreciation: 3_000,
    income_tax: 2_000,
    net_income: 36_000,
    total_assets: 500_000,
    total_liabilities: 200_000,
    total_equity: 300_000,
    ...overrides,
  };
}

describe("consolidateStatements — properties_only", () => {
  it("sums financials across two properties", () => {
    const p1 = makeProperty();
    const p2 = makeProperty({
      name: "Hotel B",
      revenue: 200_000,
      operating_expenses: 80_000,
      noi: 92_000,
      net_income: 72_000,
      management_fees: 20_000,
      total_assets: 600_000,
      total_liabilities: 250_000,
      total_equity: 350_000,
    });

    const result = consolidateStatements({
      consolidation_type: "properties_only",
      property_statements: [p1, p2],
      rounding_policy: rounding,
    });

    expect(result.consolidated_revenue).toBe(300_000);
    expect(result.consolidated_noi).toBe(138_000);
    expect(result.consolidated_net_income).toBe(108_000);
    expect(result.consolidated_assets).toBe(1_100_000);
    expect(result.consolidated_liabilities).toBe(450_000);
    expect(result.consolidated_equity).toBe(650_000);
    expect(result.intercompany_eliminations.management_fees_eliminated).toBe(0);
    expect(result.property_count).toBe(2);
    expect(result.balance_sheet_balanced).toBe(true);
  });
});

describe("consolidateStatements — full_entity with mgmt company", () => {
  it("eliminates intercompany fees when balanced", () => {
    const p1 = makeProperty({ management_fees: 10_000 });
    const p2 = makeProperty({
      name: "Hotel B",
      revenue: 200_000,
      operating_expenses: 80_000,
      noi: 92_000,
      net_income: 72_000,
      management_fees: 20_000,
      total_assets: 600_000,
      total_liabilities: 250_000,
      total_equity: 350_000,
    });

    const mc: ManagementCompanyStatement = {
      fee_revenue: 30_000,
      operating_expenses: 15_000,
      net_income: 15_000,
      total_assets: 100_000,
      total_liabilities: 20_000,
      total_equity: 80_000,
    };

    const result = consolidateStatements({
      consolidation_type: "full_entity",
      property_statements: [p1, p2],
      management_company: mc,
      rounding_policy: rounding,
    });

    expect(result.intercompany_eliminations.management_fees_eliminated).toBe(30_000);
    expect(result.intercompany_eliminations.fee_linkage_balanced).toBe(true);
    expect(result.intercompany_eliminations.variance).toBe(0);
    expect(result.consolidated_revenue).toBe(300_000 + 30_000 - 30_000);
    expect(result.consolidated_net_income).toBe(108_000 + 15_000);
  });

  it("detects fee variance when mgmt company fee_revenue differs from property fees paid", () => {
    const p1 = makeProperty({ management_fees: 10_000 });
    const mc: ManagementCompanyStatement = {
      fee_revenue: 15_000,
      operating_expenses: 5_000,
      net_income: 10_000,
    };

    const result = consolidateStatements({
      consolidation_type: "full_entity",
      property_statements: [p1],
      management_company: mc,
      rounding_policy: rounding,
    });

    expect(result.intercompany_eliminations.fee_linkage_balanced).toBe(false);
    expect(result.intercompany_eliminations.variance).not.toBe(0);
    expect(result.intercompany_eliminations.management_fees_eliminated).toBe(10_000);
  });

  it("handles full_entity without management_company like properties_only", () => {
    const result = consolidateStatements({
      consolidation_type: "full_entity",
      property_statements: [makeProperty()],
      rounding_policy: rounding,
    });

    expect(result.intercompany_eliminations.management_fees_eliminated).toBe(0);
    expect(result.consolidated_revenue).toBe(100_000);
  });
});

describe("consolidateStatements — balance sheet", () => {
  it("balanced when assets = liabilities + equity", () => {
    const result = consolidateStatements({
      consolidation_type: "properties_only",
      property_statements: [makeProperty({
        total_assets: 500_000,
        total_liabilities: 200_000,
        total_equity: 300_000,
      })],
      rounding_policy: rounding,
    });
    expect(result.balance_sheet_balanced).toBe(true);
  });

  it("not balanced when assets != liabilities + equity", () => {
    const result = consolidateStatements({
      consolidation_type: "properties_only",
      property_statements: [makeProperty({
        total_assets: 500_000,
        total_liabilities: 200_000,
        total_equity: 200_000,
      })],
      rounding_policy: rounding,
    });
    expect(result.balance_sheet_balanced).toBe(false);
  });
});
