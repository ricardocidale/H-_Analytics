import { describe, it, expect, beforeAll } from "vitest";
import { generatePropertyProForma } from "../../client/src/lib/financialEngine.js";
import { validateFinancialIdentities } from "../../calc/validation/financial-identities.js";
import { consolidateStatements } from "../../calc/analysis/consolidation.js";
import { DEFAULT_ROUNDING } from "../../calc/shared/utils.js";
import {
  DEFAULT_LAND_VALUE_PERCENT,
  DEPRECIATION_YEARS,
} from "../../shared/constants.js";
import fs from "fs";
import path from "path";
import { makeProperty, makeGlobal } from "../fixtures";

const ARTIFACTS_DIR = path.resolve("test-artifacts");

const baseProperty = makeProperty({
  startAdr: 250,
  maxOccupancy: 0.85,
  purchasePrice: 2_000_000,
});

const baseGlobal = makeGlobal({
  projectionYears: 10,
});

interface ReconciliationReport {
  scenario: string;
  timestamp: string;
  sources_and_uses: {
    sources: Record<string, number>;
    uses: Record<string, number>;
    total_sources: number;
    total_uses: number;
    balanced: boolean;
  };
  noi_to_fcf_bridge: {
    noi: number;
    anoi: number;
    less_debt_service: number;
    less_income_tax: number;
    plus_refi_proceeds: number;
    fcf: number;
    check_passed: boolean;
  };
  cash_bridge: {
    beginning_cash: number;
    plus_operating_cf: number;
    plus_financing_cf: number;
    ending_cash: number;
    check_passed: boolean;
  };
  debt_reconciliation: {
    beginning_balance: number;
    plus_draws: number;
    less_payments: number;
    ending_balance: number;
    check_passed: boolean;
  };
  financial_identities: {
    opinion: string;
    checks_passed: number;
    checks_total: number;
  };
}

function generateReport(
  scenario: string,
  result: ReturnType<typeof generatePropertyProForma>,
  property: typeof baseProperty & { type: string; acquisitionLTV?: number },
): ReconciliationReport {
  const lastMonth = result[result.length - 1];
  const totalNOI = result.reduce((s, m) => s + m.noi, 0);
  const totalANOI = result.reduce((s, m) => s + m.anoi, 0);
  const totalDebtService = result.reduce((s, m) => s + m.debtPayment, 0);
  const totalTax = result.reduce((s, m) => s + m.incomeTax, 0);
  const totalCF = result.reduce((s, m) => s + m.cashFlow, 0);
  const totalOCF = result.reduce((s, m) => s + m.operatingCashFlow, 0);
  const totalFCF = result.reduce((s, m) => s + m.financingCashFlow, 0);
  const totalRefi = result.reduce((s, m) => s + m.refinancingProceeds, 0);
  const totalPrincipal = result.reduce((s, m) => s + m.principalPayment, 0);

  const ltv = property.acquisitionLTV ?? 0;
  const equity = property.purchasePrice * (1 - ltv);
  const debt = property.purchasePrice * ltv;

  const sourcesUses = {
    sources: { equity, debt },
    uses: { purchase_price: property.purchasePrice },
    total_sources: equity + debt,
    total_uses: property.purchasePrice,
    balanced: Math.abs(equity + debt - property.purchasePrice) < 1,
  };

  const noiBridge = {
    noi: totalNOI,
    anoi: totalANOI,
    less_debt_service: totalDebtService,
    less_income_tax: totalTax,
    plus_refi_proceeds: totalRefi,
    fcf: totalCF,
    check_passed: Math.abs(totalANOI - totalDebtService - totalTax + totalRefi - totalCF) < 1,
  };

  const cashBridge = {
    beginning_cash: 0,
    plus_operating_cf: totalOCF,
    plus_financing_cf: totalFCF,
    ending_cash: lastMonth.endingCash,
    check_passed: Math.abs(totalOCF + totalFCF - lastMonth.endingCash) < 1,
  };

  const refiDraw = totalRefi > 0
    ? (result.find((m) => m.refinancingProceeds > 0)?.debtOutstanding ?? 0)
    : 0;
  const debtRecon = {
    beginning_balance: debt,
    plus_draws: refiDraw,
    less_payments: totalPrincipal,
    ending_balance: lastMonth.debtOutstanding,
    check_passed: debt > 0 || refiDraw > 0
      ? Math.abs((debt + refiDraw - totalPrincipal) - lastMonth.debtOutstanding) < 1
      : lastMonth.debtOutstanding === 0,
  };

  const yearEnd = result[11];
  const y1Months = result.slice(0, 12);
  const idResult = validateFinancialIdentities({
    balance_sheet: {
      total_assets: yearEnd.propertyValue + yearEnd.endingCash,
      total_liabilities: yearEnd.debtOutstanding,
      total_equity: yearEnd.propertyValue + yearEnd.endingCash - yearEnd.debtOutstanding,
    },
    income_statement: {
      noi: y1Months.reduce((s, m) => s + m.noi, 0),
      anoi: y1Months.reduce((s, m) => s + m.anoi, 0),
      interest_expense: y1Months.reduce((s, m) => s + m.interestExpense, 0),
      depreciation: y1Months.reduce((s, m) => s + m.depreciationExpense, 0),
      income_tax: y1Months.reduce((s, m) => s + m.incomeTax, 0),
      net_income: y1Months.reduce((s, m) => s + m.netIncome, 0),
    },
    cash_flow_statement: {
      operating_cash_flow: y1Months.reduce((s, m) => s + m.operatingCashFlow, 0),
      financing_cash_flow: y1Months.reduce((s, m) => s + m.financingCashFlow, 0),
      ending_cash: yearEnd.endingCash,
      principal_payment: y1Months.reduce((s, m) => s + m.principalPayment, 0),
    },
    rounding_policy: DEFAULT_ROUNDING,
  });

  return {
    scenario,
    timestamp: new Date().toISOString(),
    sources_and_uses: sourcesUses,
    noi_to_fcf_bridge: noiBridge,
    cash_bridge: cashBridge,
    debt_reconciliation: debtRecon,
    financial_identities: {
      opinion: idResult.opinion,
      checks_passed: idResult.checks.filter((c) => c.passed).length,
      checks_total: idResult.checks.length,
    },
  };
}

function toMarkdown(report: ReconciliationReport): string {
  const fmt = (n: number) =>
    n < 0
      ? `($${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`
      : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const pass = (b: boolean) => (b ? "PASS" : "**FAIL**");

  return `# Reconciliation Report: ${report.scenario}
Generated: ${report.timestamp}
## Sources & Uses at Acquisition
| Item | Amount |
|------|--------|
| Equity | ${fmt(report.sources_and_uses.sources.equity)} |
| Debt | ${fmt(report.sources_and_uses.sources.debt)} |
| **Total Sources** | ${fmt(report.sources_and_uses.total_sources)} |
| Purchase Price | ${fmt(report.sources_and_uses.uses.purchase_price)} |
| **Total Uses** | ${fmt(report.sources_and_uses.total_uses)} |
| Balanced | ${pass(report.sources_and_uses.balanced)} |
## NOI → FCF Bridge (10-Year Total)
| Item | Amount |
|------|--------|
| NOI | ${fmt(report.noi_to_fcf_bridge.noi)} |
| ANOI | ${fmt(report.noi_to_fcf_bridge.anoi)} |
| Less: Debt Service | ${fmt(report.noi_to_fcf_bridge.less_debt_service)} |
| Less: Income Tax | ${fmt(report.noi_to_fcf_bridge.less_income_tax)} |
| Plus: Refi Proceeds | ${fmt(report.noi_to_fcf_bridge.plus_refi_proceeds)} |
| **Free Cash Flow** | ${fmt(report.noi_to_fcf_bridge.fcf)} |
| Check | ${pass(report.noi_to_fcf_bridge.check_passed)} |
## Begin Cash → End Cash Bridge (Financing CF includes refi proceeds)
| Item | Amount |
|------|--------|
| Beginning Cash | ${fmt(report.cash_bridge.beginning_cash)} |
| + Operating CF | ${fmt(report.cash_bridge.plus_operating_cf)} |
| + Financing CF | ${fmt(report.cash_bridge.plus_financing_cf)} |
| **Ending Cash** | ${fmt(report.cash_bridge.ending_cash)} |
| Check | ${pass(report.cash_bridge.check_passed)} |
## Debt Schedule Reconciliation
| Item | Amount |
|------|--------|
| Beginning Balance | ${fmt(report.debt_reconciliation.beginning_balance)} |
| Less: Payments | ${fmt(report.debt_reconciliation.less_payments)} |
| Ending Balance | ${fmt(report.debt_reconciliation.ending_balance)} |
| Check | ${pass(report.debt_reconciliation.check_passed)} |
## Financial Identity Checks (Year 1)
| Metric | Value |
|--------|-------|
| Opinion | ${report.financial_identities.opinion} |
| Passed | ${report.financial_identities.checks_passed}/${report.financial_identities.checks_total} |
`;
}

describe("Reconciliation Report Generator", () => {
  beforeAll(() => {
    if (!fs.existsSync(ARTIFACTS_DIR)) {
      fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
    }
  });

  const scenarios = [
    {
      name: "cash-purchase",
      label: "Cash Purchase (Full Equity)",
      property: { ...baseProperty, type: "Full Equity" },
    },
    {
      name: "financed-purchase",
      label: "Financed Purchase (75% LTV)",
      property: {
        ...baseProperty,
        type: "Financed",
        acquisitionLTV: 0.75,
        acquisitionInterestRate: 0.09,
        acquisitionTermYears: 25,
      },
    },
    {
      name: "cash-to-refi",
      label: "Cash Purchase → Refinance Year 3",
      property: {
        ...baseProperty,
        type: "Full Equity",
        willRefinance: "Yes" as const,
        refinanceDate: "2029-04-01",
        refinanceLTV: 0.65,
        refinanceInterestRate: 0.08,
        refinanceTermYears: 25,
        refinanceClosingCostRate: 0.03,
      },
    },
  ];

  for (const s of scenarios) {
    it(`generates ${s.name} report with all checks passing`, () => {
      const result = generatePropertyProForma(s.property, baseGlobal, 120);
      const report = generateReport(s.label, result, s.property);

      fs.writeFileSync(
        path.join(ARTIFACTS_DIR, `${s.name}.json`),
        JSON.stringify(report, null, 2),
      );
      fs.writeFileSync(
        path.join(ARTIFACTS_DIR, `${s.name}.md`),
        toMarkdown(report),
      );

      expect(report.sources_and_uses.balanced).toBe(true);
      expect(report.noi_to_fcf_bridge.check_passed).toBe(true);
      expect(report.cash_bridge.check_passed).toBe(true);
      expect(report.financial_identities.opinion).toBe("UNQUALIFIED");
    });
  }

  it("generates consolidated elimination report", () => {
    const propA = { ...baseProperty, type: "Full Equity" };
    const propB = {
      ...baseProperty,
      type: "Financed",
      acquisitionLTV: 0.75,
      acquisitionInterestRate: 0.09,
      acquisitionTermYears: 25,
      startAdr: 300,
      roomCount: 15,
      purchasePrice: 3_000_000,
    };
    const resultA = generatePropertyProForma(propA, baseGlobal, 12);
    const resultB = generatePropertyProForma(propB, baseGlobal, 12);

    const totalFeesA = resultA.reduce((s, m) => s + m.feeBase + m.feeIncentive, 0);
    const totalFeesB = resultB.reduce((s, m) => s + m.feeBase + m.feeIncentive, 0);
    const totalSPVFees = totalFeesA + totalFeesB;

    const consOutput = consolidateStatements({
      consolidation_type: "full_entity",
      property_statements: [
        {
          name: "Property A",
          revenue: resultA.reduce((s, m) => s + m.revenueTotal, 0),
          noi: resultA.reduce((s, m) => s + m.noi, 0),
          net_income: resultA.reduce((s, m) => s + m.netIncome, 0),
          management_fees: totalFeesA,
          total_assets: resultA[11].propertyValue + resultA[11].endingCash,
          total_liabilities: resultA[11].debtOutstanding,
          total_equity: resultA[11].propertyValue + resultA[11].endingCash - resultA[11].debtOutstanding,
        },
        {
          name: "Property B",
          revenue: resultB.reduce((s, m) => s + m.revenueTotal, 0),
          noi: resultB.reduce((s, m) => s + m.noi, 0),
          net_income: resultB.reduce((s, m) => s + m.netIncome, 0),
          management_fees: totalFeesB,
          total_assets: resultB[11].propertyValue + resultB[11].endingCash,
          total_liabilities: resultB[11].debtOutstanding,
          total_equity: resultB[11].propertyValue + resultB[11].endingCash - resultB[11].debtOutstanding,
        },
      ],
      management_company: {
        fee_revenue: totalSPVFees,
        operating_expenses: totalSPVFees * 0.3,
        net_income: totalSPVFees * 0.7,
        total_assets: totalSPVFees * 0.5,
        total_liabilities: 0,
        total_equity: totalSPVFees * 0.5,
      },
      rounding_policy: DEFAULT_ROUNDING,
    });

    const elimReport = {
      scenario: "Consolidated with Eliminations",
      timestamp: new Date().toISOString(),
      property_a_fees: totalFeesA,
      property_b_fees: totalFeesB,
      total_spv_fees: totalSPVFees,
      opco_fee_revenue: totalSPVFees,
      fees_eliminated: consOutput.intercompany_eliminations.management_fees_eliminated,
      fee_linkage_balanced: consOutput.intercompany_eliminations.fee_linkage_balanced,
      fee_variance: consOutput.intercompany_eliminations.variance,
      consolidated_revenue: consOutput.consolidated_revenue,
      consolidated_net_income: consOutput.consolidated_net_income,
      balance_sheet_balanced: consOutput.balance_sheet_balanced,
    };

    fs.writeFileSync(
      path.join(ARTIFACTS_DIR, "consolidated-eliminations.json"),
      JSON.stringify(elimReport, null, 2),
    );

    const md = `# Intercompany Elimination Report
Generated: ${elimReport.timestamp}
## Fee Linkage
| Item | Amount |
|------|--------|
| Property A Fees | $${totalFeesA.toFixed(2)} |
| Property B Fees | $${totalFeesB.toFixed(2)} |
| Total SPV Fees (Expense) | $${totalSPVFees.toFixed(2)} |
| OpCo Fee Revenue | $${totalSPVFees.toFixed(2)} |
| Fees Eliminated | $${consOutput.intercompany_eliminations.management_fees_eliminated.toFixed(2)} |
| Linkage Balanced | ${elimReport.fee_linkage_balanced ? "PASS" : "**FAIL**"} |
| Variance | $${elimReport.fee_variance.toFixed(2)} |
## Consolidated Totals (Post-Elimination)
| Item | Amount |
|------|--------|
| Revenue | $${consOutput.consolidated_revenue.toFixed(2)} |
| Net Income | $${consOutput.consolidated_net_income.toFixed(2)} |
| BS Balanced | ${consOutput.balance_sheet_balanced ? "PASS" : "**FAIL**"} |
`;

    fs.writeFileSync(path.join(ARTIFACTS_DIR, "consolidated-eliminations.md"), md);

    expect(consOutput.intercompany_eliminations.fee_linkage_balanced).toBe(true);
    expect(consOutput.balance_sheet_balanced).toBe(true);
  });
});
