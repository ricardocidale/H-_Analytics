import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { generatePropertyProForma } from "../../client/src/lib/financialEngine";
import { makePropertyInput as makeProperty, makeGlobalInput as makeGlobal } from "../fixtures/factories";

/**
 * Pipeline Trace Test — "Golden Lodge" Scenario
 *
 * A flat scenario (0% growth, 0% inflation, occupancy already at max) designed
 * to verify month-over-month invariants, debt amortization correctness, GAAP
 * identities, and cumulative cash accounting.
 *
 * With zero growth rates the engine must produce identical revenue/expense
 * figures every month within a year, and across the year boundary. Only the
 * debt amortization schedule should change month-to-month (interest decreases,
 * principal increases, PMT constant).
 */

const PENNY = 2; // toBeCloseTo decimal places

const goldenProperty = makeProperty({
  purchasePrice: 2_000_000,
  roomCount: 20,
  startAdr: 200,
  startOccupancy: 0.70,
  maxOccupancy: 0.70,
  occupancyGrowthStep: 0,
  adrGrowthRate: 0,
  type: "Financed",
  acquisitionLTV: 0.60,
  acquisitionInterestRate: 0.08,
  acquisitionTermYears: 25,
  landValuePercent: 0.25,
  buildingImprovements: 0,
  taxRate: 0.25,
  operatingReserve: 0,
  operationsStartDate: "2026-04-01",
  acquisitionDate: "2026-04-01",
});

const goldenGlobal = makeGlobal({
  modelStartDate: "2026-04-01",
  inflationRate: 0,
  fixedCostEscalationRate: 0,
});

// Generate 60 months (5 years) for debt amortization checks
const financials = generatePropertyProForma(goldenProperty, goldenGlobal, 60);

describe("Golden Lodge — Pipeline Trace", () => {

  describe("A. Month Invariant (flat scenario, within year 1)", () => {
    it("revenueTotal is identical month 0 vs month 11", () => {
      expect(financials[0].revenueTotal).toBe(financials[11].revenueTotal);
    });

    it("revenueRooms is identical month 0 vs month 11", () => {
      expect(financials[0].revenueRooms).toBe(financials[11].revenueRooms);
    });

    it("GOP is identical month 0 vs month 11", () => {
      expect(financials[0].gop).toBe(financials[11].gop);
    });

    it("NOI is identical month 0 vs month 11", () => {
      expect(financials[0].noi).toBe(financials[11].noi);
    });

    it("ANOI is identical month 0 vs month 11", () => {
      expect(financials[0].anoi).toBe(financials[11].anoi);
    });

    it("debtPayment (PMT) is identical month 0 vs month 11", () => {
      expect(financials[0].debtPayment).toBe(financials[11].debtPayment);
    });

    it("interestExpense decreases over time (month 0 > month 11)", () => {
      expect(financials[0].interestExpense).toBeGreaterThan(financials[11].interestExpense);
    });

    it("principalPayment increases over time (month 0 < month 11)", () => {
      expect(financials[0].principalPayment).toBeLessThan(financials[11].principalPayment);
    });
  });

  describe("B. Year Boundary (month 12 = year 2 with 0% growth)", () => {
    it("revenueTotal at month 12 equals month 0 (0% ADR growth)", () => {
      expect(financials[12].revenueTotal).toBe(financials[0].revenueTotal);
    });

    it("expenseAdmin at month 12 equals month 0 (0% escalation)", () => {
      expect(financials[12].expenseAdmin).toBe(financials[0].expenseAdmin);
    });
  });

  describe("C. Debt Amortization Correctness (60 months)", () => {
    it("debtOutstanding strictly decreases each month", () => {
      for (let i = 0; i < 59; i++) {
        expect(financials[i].debtOutstanding).toBeGreaterThan(
          financials[i + 1].debtOutstanding
        );
      }
    });

    it("interestExpense strictly decreases over time", () => {
      for (let i = 0; i < 59; i++) {
        expect(financials[i].interestExpense).toBeGreaterThan(
          financials[i + 1].interestExpense
        );
      }
    });

    it("principalPayment strictly increases over time", () => {
      for (let i = 0; i < 59; i++) {
        expect(financials[i].principalPayment).toBeLessThan(
          financials[i + 1].principalPayment
        );
      }
    });

    it("PMT is constant across all 60 months", () => {
      const pmt0 = financials[0].debtPayment;
      for (let i = 1; i < 60; i++) {
        expect(financials[i].debtPayment).toBe(pmt0);
      }
    });

    it("interest + principal = PMT every month", () => {
      for (let i = 0; i < 60; i++) {
        const sum = financials[i].interestExpense + financials[i].principalPayment;
        expect(sum).toBeCloseTo(financials[i].debtPayment, PENNY);
      }
    });
  });

  describe("D. GAAP Identities (every month)", () => {
    it("operatingCF = netIncome + depreciation (ASC 230)", () => {
      for (let i = 0; i < 60; i++) {
        const m = financials[i];
        const expected = m.netIncome + m.depreciationExpense;
        expect(m.operatingCashFlow).toBeCloseTo(expected, PENNY);
      }
    });

    it("financingCF = -principalPayment (ASC 230)", () => {
      for (let i = 0; i < 60; i++) {
        const m = financials[i];
        expect(m.financingCashFlow).toBeCloseTo(-m.principalPayment, PENNY);
      }
    });

    it("cashFlow = ANOI - debtPayment - incomeTax", () => {
      for (let i = 0; i < 60; i++) {
        const m = financials[i];
        const expected = m.anoi - m.debtPayment - m.incomeTax;
        expect(m.cashFlow).toBeCloseTo(expected, PENNY);
      }
    });
  });

  describe("E. Cumulative Cash Correctness", () => {
    it("endingCash[0] = cashFlow[0] (no reserve in this scenario)", () => {
      expect(financials[0].endingCash).toBeCloseTo(financials[0].cashFlow, PENNY);
    });

    it("endingCash[i] = endingCash[i-1] + cashFlow[i] for all i > 0", () => {
      for (let i = 1; i < 60; i++) {
        const expected = financials[i - 1].endingCash + financials[i].cashFlow;
        expect(financials[i].endingCash).toBeCloseTo(expected, PENNY);
      }
    });
  });

  describe("F. Server Checker Independence", () => {
    it("server calculation-checker imports zero client modules", () => {
      const checkerDir = path.resolve(__dirname, "../../server/calculation-checker");
      const allFiles: string[] = [];

      // Recursively collect all .ts files
      function collectFiles(dir: string) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            collectFiles(fullPath);
          } else if (entry.name.endsWith(".ts")) {
            allFiles.push(fullPath);
          }
        }
      }
      collectFiles(checkerDir);

      expect(allFiles.length).toBeGreaterThan(0);

      for (const file of allFiles) {
        const content = fs.readFileSync(file, "utf-8");
        const relPath = path.relative(checkerDir, file);
        expect(content, `${relPath} imports from client/`).not.toMatch(/from ['"].*client\//);
        expect(content, `${relPath} imports from @/lib/financial`).not.toMatch(/from ['"]@\/lib\/financial/);
        expect(content, `${relPath} imports from financialEngine`).not.toMatch(/from ['"].*financialEngine/);
      }
    });
  });
});
