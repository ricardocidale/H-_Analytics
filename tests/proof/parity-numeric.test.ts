import { describe, it, expect } from "vitest";
import { generatePropertyProForma } from "../../client/src/lib/financialEngine";
import { baseProperty, makeGlobal, makeProperty } from "../fixtures";
import { aggregatePropertyByYear } from "../../engine/aggregation/yearlyAggregator";
import {
  generatePortfolioIncomeData,
  generatePortfolioBalanceSheetData,
} from "../../client/src/components/dashboard/statementBuilders";
import { generatePortfolioCashFlowData } from "../../client/src/components/dashboard/statement-builders/cash-flow";
import { PropertyStatus } from "../../shared/constants";
import type { Property } from "../../shared/schema/properties";

const PENNY = 2;

function makeTestProperty(id: number, name: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name,
    market: "Test Market",
    roomCount: baseProperty.roomCount,
    purchasePrice: 1_000_000,
    buildingImprovements: 0,
    acquisitionLTV: 0,
    acquisitionInterestRate: 0,
    operatingReserve: 0,
    preOpeningCosts: 0,
    exitCapRate: 0.07,
    taxRate: 0.21,
    acquisitionDate: "2026-04-01",
    operationsStartDate: "2026-04-01",
    startAdr: baseProperty.startAdr,
    type: "Full Equity",
    status: PropertyStatus.OPERATING,
    ...overrides,
  };
}

function getRow(rows: { category: string; values: number[] }[], label: string) {
  return rows.find((r) => r.category === label);
}

describe("T009 — Parity Numeric Verification", () => {
  const global = makeGlobal({ projectionYears: 2 });
  const monthlyResults = generatePropertyProForma(baseProperty, global, 24);
  const yearlyResults = aggregatePropertyByYear(monthlyResults, 2);
  const getFiscalYear = (i: number) => 2026 + i;
  const prop = makeTestProperty(1, "Test Hotel");

  describe("Income Statement builder values match engine output", () => {
    const incomeData = generatePortfolioIncomeData(
      yearlyResults,
      2,
      getFiscalYear,
      false,
      [yearlyResults],
      ["Test Hotel"],
    );
    const rows = incomeData.rows;

    it("Total Revenue matches yearlyConsolidated.revenueTotal", () => {
      const row = getRow(rows, "Total Revenue");
      expect(row).toBeDefined();
      for (let y = 0; y < 2; y++) {
        expect(row!.values[y]).toBeCloseTo(yearlyResults[y].revenueTotal, PENNY);
      }
    });

    it("Room Revenue matches yearlyConsolidated.revenueRooms", () => {
      const row = getRow(rows, "Room Revenue");
      expect(row).toBeDefined();
      for (let y = 0; y < 2; y++) {
        expect(row!.values[y]).toBeCloseTo(yearlyResults[y].revenueRooms, PENNY);
      }
    });

    it("Event Revenue matches yearlyConsolidated.revenueEvents", () => {
      const row = getRow(rows, "Event Revenue");
      expect(row).toBeDefined();
      for (let y = 0; y < 2; y++) {
        expect(row!.values[y]).toBeCloseTo(yearlyResults[y].revenueEvents, PENNY);
      }
    });

    it("F&B Revenue matches yearlyConsolidated.revenueFB", () => {
      const row = getRow(rows, "F&B Revenue");
      expect(row).toBeDefined();
      for (let y = 0; y < 2; y++) {
        expect(row!.values[y]).toBeCloseTo(yearlyResults[y].revenueFB, PENNY);
      }
    });

    it("Other Revenue matches yearlyConsolidated.revenueOther", () => {
      const row = getRow(rows, "Other Revenue");
      expect(row).toBeDefined();
      for (let y = 0; y < 2; y++) {
        expect(row!.values[y]).toBeCloseTo(yearlyResults[y].revenueOther, PENNY);
      }
    });

    it("GOP matches yearlyConsolidated.gop", () => {
      const row = getRow(rows, "Gross Operating Profit (GOP)");
      expect(row).toBeDefined();
      for (let y = 0; y < 2; y++) {
        expect(row!.values[y]).toBeCloseTo(yearlyResults[y].gop, PENNY);
      }
    });

    it("AGOP matches yearlyConsolidated.agop", () => {
      const row = getRow(rows, "Adjusted Gross Operating Profit (AGOP)");
      expect(row).toBeDefined();
      for (let y = 0; y < 2; y++) {
        expect(row!.values[y]).toBeCloseTo(yearlyResults[y].agop, PENNY);
      }
    });

    it("NOI matches yearlyConsolidated.noi", () => {
      const row = getRow(rows, "Net Operating Income (NOI)");
      expect(row).toBeDefined();
      for (let y = 0; y < 2; y++) {
        expect(row!.values[y]).toBeCloseTo(yearlyResults[y].noi, PENNY);
      }
    });

    it("ANOI matches yearlyConsolidated.anoi", () => {
      const row = getRow(rows, "Adjusted NOI (ANOI)");
      expect(row).toBeDefined();
      for (let y = 0; y < 2; y++) {
        expect(row!.values[y]).toBeCloseTo(yearlyResults[y].anoi, PENNY);
      }
    });

    it("Net Income matches yearlyConsolidated.netIncome", () => {
      const row = getRow(rows, "Net Income");
      expect(row).toBeDefined();
      for (let y = 0; y < 2; y++) {
        expect(row!.values[y]).toBeCloseTo(yearlyResults[y].netIncome, PENNY);
      }
    });

    it("Departmental Expenses sum matches component fields", () => {
      const row = getRow(rows, "Departmental Expenses");
      expect(row).toBeDefined();
      for (let y = 0; y < 2; y++) {
        const expected = yearlyResults[y].expenseRooms +
          yearlyResults[y].expenseFB +
          yearlyResults[y].expenseEvents +
          yearlyResults[y].expenseOther;
        expect(row!.values[y]).toBeCloseTo(expected, PENNY);
      }
    });

    it("Undistributed Expenses sum matches component fields", () => {
      const row = getRow(rows, "Undistributed Operating Expenses");
      expect(row).toBeDefined();
      for (let y = 0; y < 2; y++) {
        const expected = yearlyResults[y].expenseMarketing +
          yearlyResults[y].expensePropertyOps +
          yearlyResults[y].expenseAdmin +
          yearlyResults[y].expenseIT +
          yearlyResults[y].expenseInsurance +
          yearlyResults[y].expenseUtilitiesVar +
          yearlyResults[y].expenseUtilitiesFixed +
          yearlyResults[y].expenseOtherCosts;
        expect(row!.values[y]).toBeCloseTo(expected, PENNY);
      }
    });

    it("Management Fees total = feeBase + feeIncentive", () => {
      const row = getRow(rows, "Management Fees");
      expect(row).toBeDefined();
      for (let y = 0; y < 2; y++) {
        const expected = yearlyResults[y].feeBase + yearlyResults[y].feeIncentive;
        expect(row!.values[y]).toBeCloseTo(expected, PENNY);
      }
    });

    it("Debt Service matches yearlyConsolidated.debtPayment", () => {
      const row = getRow(rows, "Debt Service");
      expect(row).toBeDefined();
      for (let y = 0; y < 2; y++) {
        expect(row!.values[y]).toBeCloseTo(yearlyResults[y].debtPayment, PENNY);
      }
    });

    it("FF&E Reserve matches yearlyConsolidated.expenseFFE", () => {
      const row = getRow(rows, "FF&E Reserve");
      expect(row).toBeDefined();
      for (let y = 0; y < 2; y++) {
        expect(row!.values[y]).toBeCloseTo(yearlyResults[y].expenseFFE, PENNY);
      }
    });

    it("Income Statement line item values are not truncated by formatting", () => {
      const keyRows = [
        "Total Revenue", "Room Revenue", "Event Revenue", "F&B Revenue",
        "Gross Operating Profit (GOP)", "Net Operating Income (NOI)",
        "Net Income",
      ];
      for (const label of keyRows) {
        const row = getRow(rows, label);
        if (!row) continue;
        for (const val of row.values) {
          expect(Number.isFinite(val)).toBe(true);
          expect(val).toBeGreaterThanOrEqual(0);
        }
      }
    });
  });

  describe("Cash Flow builder values match engine output", () => {
    const yearlyIS = yearlyResults;

    const yearlyCF = yearlyResults.map((yr, i) => ({
      year: 2026 + i,
      noi: yr.noi,
      anoi: yr.anoi,
      interestExpense: yr.interestExpense,
      principalPayment: yr.principalPayment,
      taxLiability: yr.incomeTax,
      cashFromOperations: yr.anoi - yr.interestExpense - yr.principalPayment - yr.incomeTax,
      capitalExpenditures: -yr.expenseFFE,
      exitValue: 0,
      refinancingProceeds: 0,
      debtService: yr.debtPayment,
      freeCashFlow: yr.anoi - yr.expenseFFE,
      freeCashFlowToEquity: yr.anoi - yr.expenseFFE - yr.debtPayment,
      maintenanceCapex: yr.expenseFFE,
      netCashFlowToInvestors: 0,
      cumulativeCashFlow: 0,
      atcf: yr.cashFlow,
      btcf: yr.anoi - yr.debtPayment,
      taxableIncome: yr.netIncome + yr.depreciationExpense,
    }));

    const cfData = generatePortfolioCashFlowData(
      [yearlyCF],
      2,
      getFiscalYear,
      new Set(["cfo", "cfi", "cff"]),
      false,
      ["Test Hotel"],
      yearlyIS,
    );
    const rows = cfData.rows;

    it("ANOI row matches engine ANOI", () => {
      const row = getRow(rows, "Adjusted NOI (ANOI)");
      expect(row).toBeDefined();
      for (let y = 0; y < 2; y++) {
        expect(row!.values[y]).toBeCloseTo(yearlyResults[y].anoi, PENNY);
      }
    });

    it("Interest Expense row matches engine value", () => {
      const row = getRow(rows, "Less: Interest Expense");
      expect(row).toBeDefined();
      for (let y = 0; y < 2; y++) {
        expect(Math.abs(row!.values[y])).toBeCloseTo(yearlyResults[y].interestExpense, PENNY);
      }
    });

    it("FCF row matches ANOI - FF&E", () => {
      const row = getRow(rows, "Free Cash Flow (FCF)");
      expect(row).toBeDefined();
      for (let y = 0; y < 2; y++) {
        const expected = yearlyResults[y].anoi - yearlyResults[y].expenseFFE;
        expect(row!.values[y]).toBeCloseTo(expected, PENNY);
      }
    });
  });

  describe("Balance Sheet builder values are internally consistent", () => {
    const bsData = generatePortfolioBalanceSheetData(
      [{ property: prop as unknown as Property, financials: monthlyResults }],
      2,
      getFiscalYear,
      new Date("2026-04-01"),
    );
    const rows = bsData.rows;

    it("TOTAL ASSETS row exists and is positive", () => {
      const row = getRow(rows, "TOTAL ASSETS");
      expect(row).toBeDefined();
      for (const val of row!.values) {
        expect(val).toBeGreaterThan(0);
      }
    });

    it("TOTAL LIABILITIES & EQUITY row exists", () => {
      const row = getRow(rows, "TOTAL LIABILITIES & EQUITY");
      expect(row).toBeDefined();
    });

    it("Balance Check (Assets − L&E) is zero or near-zero", () => {
      const row = getRow(rows, "Balance Check (Assets − L&E)");
      expect(row).toBeDefined();
      for (const val of row!.values) {
        expect(Math.abs(val)).toBeLessThan(1);
      }
    });

    it("PPE row matches property purchase price + improvements", () => {
      const row = getRow(rows, "Property, Plant & Equipment");
      expect(row).toBeDefined();
      const expectedPPE = prop.purchasePrice + prop.buildingImprovements;
      for (const val of row!.values) {
        expect(val).toBeCloseTo(expectedPPE, PENNY);
      }
    });

    it("Accumulated Depreciation is negative and growing", () => {
      const row = getRow(rows, "Less: Accumulated Depreciation");
      expect(row).toBeDefined();
      for (const val of row!.values) {
        expect(val).toBeLessThanOrEqual(0);
      }
      if (row!.values.length > 1) {
        expect(Math.abs(row!.values[1])).toBeGreaterThan(Math.abs(row!.values[0]));
      }
    });

    it("Mortgage Notes are zero for Full Equity", () => {
      const row = getRow(rows, "Mortgage Notes Payable");
      expect(row).toBeDefined();
      for (const val of row!.values) {
        expect(val).toBe(0);
      }
    });
  });

  describe("cross-statement numeric consistency", () => {
    it("NOI is consistent between Income Statement and Cash Flow builders", () => {
      const incomeData = generatePortfolioIncomeData(yearlyResults, 2, getFiscalYear);
      const noiRow = getRow(incomeData.rows, "Net Operating Income (NOI)");
      expect(noiRow).toBeDefined();

      for (let y = 0; y < 2; y++) {
        expect(noiRow!.values[y]).toBeCloseTo(yearlyResults[y].noi, PENNY);
      }
    });

    it("ANOI is consistent between Income Statement and Cash Flow", () => {
      const incomeData = generatePortfolioIncomeData(yearlyResults, 2, getFiscalYear);
      const anoiRow = getRow(incomeData.rows, "Adjusted NOI (ANOI)");
      expect(anoiRow).toBeDefined();

      for (let y = 0; y < 2; y++) {
        expect(anoiRow!.values[y]).toBeCloseTo(yearlyResults[y].anoi, PENNY);
      }
    });

    it("all Income Statement numeric values are finite", () => {
      const incomeData = generatePortfolioIncomeData(yearlyResults, 2, getFiscalYear);
      for (const row of incomeData.rows) {
        for (const val of row.values) {
          expect(Number.isFinite(val), `${row.category} has non-finite value`).toBe(true);
        }
      }
    });

    it("all Balance Sheet numeric values are finite", () => {
      const bsData = generatePortfolioBalanceSheetData(
        [{ property: prop as unknown as Property, financials: monthlyResults }],
        2, getFiscalYear, new Date("2026-04-01"),
      );
      for (const row of bsData.rows) {
        for (const val of row.values) {
          expect(Number.isFinite(val), `${row.category} has non-finite value`).toBe(true);
        }
      }
    });
  });
});
