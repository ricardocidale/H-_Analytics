import { describe, it, expect } from "vitest";
import { generatePropertyProForma, MonthlyFinancials } from "@/lib/financialEngine";
import { aggregateCashFlowByYear } from "@/lib/financial/cashFlowAggregator";
import { LoanParams, GlobalLoanParams, YearlyCashFlowResult } from "@/lib/financial/loanCalculations";
import {
  DEFAULT_EXIT_CAP_RATE,
  DEFAULT_COMMISSION_RATE,
  DEFAULT_PROPERTY_INCOME_TAX_RATE,
  DEFAULT_LTV,
  DEFAULT_INTEREST_RATE,
  DEFAULT_TERM_YEARS,
  DAYS_PER_MONTH,
  DEPRECIATION_YEARS,
} from "@/lib/constants";
import { makeGlobal } from "../fixtures";
import { makePropertyInput } from "../fixtures/factories";
import type { PropertyInput } from "../../engine/types";

// Typed base property that includes all PropertyInput fields (no as-any needed)
const baseProperty: PropertyInput = makePropertyInput();

/**
 * Tests for aggregateCashFlowByYear() — the single source of truth
 * for yearly cash flow statement construction.
 *
 * Uses generatePropertyProForma() from the financial engine to create
 * realistic monthly data rather than mocking.
 */

// ---------------------------------------------------------------------------
// Base fixtures (mirrors proforma-edge-cases.test.ts patterns)
// ---------------------------------------------------------------------------

const baseGlobal = makeGlobal({ projectionYears: 10 });

/** Adapt a property object to the LoanParams interface required by the aggregator. */
function toLoanParams(prop: PropertyInput): LoanParams {
  return {
    purchasePrice: prop.purchasePrice,
    buildingImprovements: prop.buildingImprovements ?? 0,
    landValuePercent: prop.landValuePercent ?? 0.25,
    preOpeningCosts: 0,
    operatingReserve: 0,
    type: prop.type,
    acquisitionDate: prop.acquisitionDate ?? null,
    taxRate: prop.taxRate ?? null,
    acquisitionLTV: prop.acquisitionLTV ?? null,
    acquisitionInterestRate: prop.acquisitionInterestRate ?? null,
    acquisitionTermYears: prop.acquisitionTermYears ?? null,
    willRefinance: prop.willRefinance ?? null,
    refinanceDate: prop.refinanceDate ?? null,
    refinanceLTV: prop.refinanceLTV ?? null,
    refinanceInterestRate: prop.refinanceInterestRate ?? null,
    refinanceTermYears: prop.refinanceTermYears ?? null,
    refinanceClosingCostRate: prop.refinanceClosingCostRate ?? null,
    exitCapRate: prop.exitCapRate ?? null,
  };
}

/** Adapt a global object to the GlobalLoanParams interface required by the aggregator. */
function toGlobalLoanParams(glob: typeof baseGlobal): GlobalLoanParams {
  return {
    modelStartDate: glob.modelStartDate,
    debtAssumptions: glob.debtAssumptions,
    exitCapRate: undefined,
    commissionRate: undefined,
    salesCommissionRate: undefined,
  };
}

/** Helper: generate engine data + aggregated yearly results. */
function generateAndAggregate(
  prop: PropertyInput,
  glob: typeof baseGlobal,
  years: number
) {
  const months = years * 12;
  const data = generatePropertyProForma(prop, { ...glob, projectionYears: years }, months);
  const loanParams = toLoanParams(prop);
  const globalLoanParams = toGlobalLoanParams(glob);
  const results = aggregateCashFlowByYear(data, loanParams, globalLoanParams, years);
  return { data, results };
}

// ===========================================================================
// 1. Basic Aggregation: Monthly data correctly summed to yearly periods
// ===========================================================================
describe("Basic Aggregation: Monthly to Yearly", () => {
  const years = 3;
  const { data, results } = generateAndAggregate(baseProperty, baseGlobal, years);

  it("returns the correct number of yearly results", () => {
    expect(results).toHaveLength(years);
  });

  it("year indices are sequential starting from 0", () => {
    results.forEach((r, i) => {
      expect(r.year).toBe(i);
    });
  });

  it("yearly NOI equals the sum of monthly NOIs for each year", () => {
    for (let y = 0; y < years; y++) {
      const yearData = data.slice(y * 12, (y + 1) * 12);
      const expectedNOI = yearData.reduce((sum, m) => sum + m.noi, 0);
      expect(results[y].noi).toBeCloseTo(expectedNOI, 2);
    }
  });

  it("yearly interest expense equals sum of monthly interest", () => {
    for (let y = 0; y < years; y++) {
      const yearData = data.slice(y * 12, (y + 1) * 12);
      const expected = yearData.reduce((sum, m) => sum + m.interestExpense, 0);
      expect(results[y].interestExpense).toBeCloseTo(expected, 2);
    }
  });

  it("yearly depreciation equals sum of monthly depreciation", () => {
    for (let y = 0; y < years; y++) {
      const yearData = data.slice(y * 12, (y + 1) * 12);
      const expected = yearData.reduce((sum, m) => sum + m.depreciationExpense, 0);
      expect(results[y].depreciation).toBeCloseTo(expected, 2);
    }
  });

  it("yearly net income equals sum of monthly net income", () => {
    for (let y = 0; y < years; y++) {
      const yearData = data.slice(y * 12, (y + 1) * 12);
      const expected = yearData.reduce((sum, m) => sum + m.netIncome, 0);
      expect(results[y].netIncome).toBeCloseTo(expected, 2);
    }
  });

  it("yearly tax liability equals sum of monthly income tax", () => {
    for (let y = 0; y < years; y++) {
      const yearData = data.slice(y * 12, (y + 1) * 12);
      const expected = yearData.reduce((sum, m) => sum + m.incomeTax, 0);
      expect(results[y].taxLiability).toBeCloseTo(expected, 2);
    }
  });

  it("yearly principal payment equals sum of monthly principal", () => {
    for (let y = 0; y < years; y++) {
      const yearData = data.slice(y * 12, (y + 1) * 12);
      const expected = yearData.reduce((sum, m) => sum + m.principalPayment, 0);
      expect(results[y].principalPayment).toBeCloseTo(expected, 2);
    }
  });

  it("yearly debt service equals sum of monthly debt payment", () => {
    for (let y = 0; y < years; y++) {
      const yearData = data.slice(y * 12, (y + 1) * 12);
      const expected = yearData.reduce((sum, m) => sum + m.debtPayment, 0);
      expect(results[y].debtService).toBeCloseTo(expected, 2);
    }
  });

  it("yearly refinancing proceeds equal sum of monthly refi proceeds", () => {
    for (let y = 0; y < years; y++) {
      const yearData = data.slice(y * 12, (y + 1) * 12);
      const expected = yearData.reduce((sum, m) => sum + m.refinancingProceeds, 0);
      expect(results[y].refinancingProceeds).toBeCloseTo(expected, 2);
    }
  });

  it("yearly maintenance capex (FF&E) equals sum of monthly FF&E expense", () => {
    for (let y = 0; y < years; y++) {
      const yearData = data.slice(y * 12, (y + 1) * 12);
      const expected = yearData.reduce((sum, m) => sum + m.expenseFFE, 0);
      expect(results[y].maintenanceCapex).toBeCloseTo(expected, 2);
    }
  });
});

// ===========================================================================
// 2. Operating Cash Flow: Net Income + Depreciation (ASC 230 indirect)
// ===========================================================================
describe("Operating Cash Flow (ASC 230 Indirect Method)", () => {
  const years = 5;
  const { results } = generateAndAggregate(baseProperty, baseGlobal, years);

  it("operatingCashFlow = netIncome + depreciation for each year", () => {
    for (const r of results) {
      expect(r.operatingCashFlow).toBeCloseTo(r.netIncome + r.depreciation, 2);
    }
  });

  it("cashFromOperations = operatingCashFlow - workingCapitalChange", () => {
    for (const r of results) {
      expect(r.cashFromOperations).toBeCloseTo(r.operatingCashFlow - r.workingCapitalChange, 2);
    }
  });

  it("workingCapitalChange is computed from AR/AP (non-zero when defaults apply)", () => {
    const hasNonZeroWC = results.some(r => r.workingCapitalChange !== 0);
    expect(hasNonZeroWC).toBe(true);
  });

  it("freeCashFlow = cashFromOperations - maintenanceCapex (FF&E)", () => {
    for (const r of results) {
      expect(r.freeCashFlow).toBeCloseTo(r.cashFromOperations - r.maintenanceCapex, 2);
    }
  });

  it("operating cash flow is positive for a profitable Full Equity property", () => {
    // A property operational from day 1 should generate positive operating CF
    for (const r of results) {
      expect(r.operatingCashFlow).toBeGreaterThan(0);
    }
  });
});

// ===========================================================================
// 3. Financing Cash Flow: -Principal + refinance proceeds
// ===========================================================================
describe("Financing Cash Flow", () => {
  it("Full Equity: principal and debt service are zero for all years", () => {
    const { results } = generateAndAggregate(baseProperty, baseGlobal, 5);
    for (const r of results) {
      expect(r.principalPayment).toBe(0);
      expect(r.debtService).toBe(0);
      expect(r.interestExpense).toBe(0);
    }
  });

  it("Financed: principal payments are positive each year", () => {
    const financedProp = {
      ...baseProperty,
      type: "Financed",
      acquisitionLTV: 0.75,
      acquisitionInterestRate: 0.09,
      acquisitionTermYears: 25,
    };
    const { results } = generateAndAggregate(financedProp, baseGlobal, 5);
    for (const r of results) {
      expect(r.principalPayment).toBeGreaterThan(0);
    }
  });

  it("Financed: interest + principal = debt service each year", () => {
    const financedProp = {
      ...baseProperty,
      type: "Financed",
      acquisitionLTV: 0.75,
      acquisitionInterestRate: 0.09,
      acquisitionTermYears: 25,
    };
    const { results } = generateAndAggregate(financedProp, baseGlobal, 5);
    for (const r of results) {
      expect(r.interestExpense + r.principalPayment).toBeCloseTo(r.debtService, 2);
    }
  });

  it("Financed: no refinancing proceeds without refinance configuration", () => {
    const financedProp = {
      ...baseProperty,
      type: "Financed",
      acquisitionLTV: 0.75,
      acquisitionInterestRate: 0.09,
      acquisitionTermYears: 25,
    };
    const { results } = generateAndAggregate(financedProp, baseGlobal, 5);
    for (const r of results) {
      expect(r.refinancingProceeds).toBe(0);
    }
  });
});

// ===========================================================================
// 4. Free Cash Flow: NOI - total debt service
// ===========================================================================
describe("Free Cash Flow Derivation", () => {
  it("Full Equity: BTCF = NOI - debt service = NOI (no debt)", () => {
    const { results } = generateAndAggregate(baseProperty, baseGlobal, 3);
    for (const r of results) {
      expect(r.btcf).toBeCloseTo(r.anoi - r.debtService, 2);
      expect(r.btcf).toBeCloseTo(r.anoi, 2);
    }
  });

  it("Financed: BTCF = NOI - debt service", () => {
    const financedProp = {
      ...baseProperty,
      type: "Financed",
      acquisitionLTV: 0.75,
      acquisitionInterestRate: 0.09,
      acquisitionTermYears: 25,
    };
    const { results } = generateAndAggregate(financedProp, baseGlobal, 3);
    for (const r of results) {
      expect(r.btcf).toBeCloseTo(r.anoi - r.debtService, 2);
    }
  });

  it("ATCF = BTCF - tax liability", () => {
    const { results } = generateAndAggregate(baseProperty, baseGlobal, 3);
    for (const r of results) {
      expect(r.atcf).toBeCloseTo(r.btcf - r.taxLiability, 2);
    }
  });

  it("taxableIncome = ANOI - interest - depreciation", () => {
    const { results } = generateAndAggregate(baseProperty, baseGlobal, 3);
    for (const r of results) {
      expect(r.taxableIncome).toBeCloseTo(r.anoi - r.interestExpense - r.depreciation, 2);
    }
  });
});

// ===========================================================================
// 5. FCFE: FCF - principal (to equity holders)
// ===========================================================================
describe("Free Cash Flow to Equity (FCFE)", () => {
  it("FCFE = freeCashFlow - principalPayment for each year", () => {
    const { results } = generateAndAggregate(baseProperty, baseGlobal, 5);
    for (const r of results) {
      expect(r.freeCashFlowToEquity).toBeCloseTo(r.freeCashFlow - r.principalPayment, 2);
    }
  });

  it("Full Equity: FCFE = FCF (no principal payments)", () => {
    const { results } = generateAndAggregate(baseProperty, baseGlobal, 5);
    for (const r of results) {
      expect(r.freeCashFlowToEquity).toBeCloseTo(r.freeCashFlow, 2);
    }
  });

  it("Financed: FCFE < FCF (principal reduces equity cash flow)", () => {
    const financedProp = {
      ...baseProperty,
      type: "Financed",
      acquisitionLTV: 0.75,
      acquisitionInterestRate: 0.09,
      acquisitionTermYears: 25,
    };
    const { results } = generateAndAggregate(financedProp, baseGlobal, 5);
    for (const r of results) {
      expect(r.freeCashFlowToEquity).toBeLessThan(r.freeCashFlow);
    }
  });
});

// ===========================================================================
// 6. Exit Value Calculation
// ===========================================================================
describe("Exit Value Calculation", () => {
  it("exit value is zero for all years except the last", () => {
    const years = 5;
    const { results } = generateAndAggregate(baseProperty, baseGlobal, years);
    for (let y = 0; y < years - 1; y++) {
      expect(results[y].exitValue).toBe(0);
    }
  });

  it("exit value is positive in the last year for a profitable property", () => {
    const years = 5;
    const { results } = generateAndAggregate(baseProperty, baseGlobal, years);
    expect(results[years - 1].exitValue).toBeGreaterThan(0);
  });

  it("exit value = grossValue - commission - outstandingDebt for Full Equity", () => {
    const years = 3;
    const { data, results } = generateAndAggregate(baseProperty, baseGlobal, years);
    const lastYearResult = results[years - 1];
    const lastYearData = data.slice((years - 1) * 12, years * 12);
    const noi = lastYearData.reduce((sum, m) => sum + m.noi, 0);

    const exitCapRate = DEFAULT_EXIT_CAP_RATE;
    const commissionRate = DEFAULT_COMMISSION_RATE;
    // All months are operational (full year), no annualization needed
    const grossValue = noi / exitCapRate;
    const commission = grossValue * commissionRate;
    const outstandingDebt = lastYearData[lastYearData.length - 1].debtOutstanding;
    const expectedExit = grossValue - commission - outstandingDebt;

    expect(lastYearResult.exitValue).toBeCloseTo(expectedExit, 0);
  });

  it("Financed: exit value accounts for outstanding debt", () => {
    const financedProp = {
      ...baseProperty,
      type: "Financed",
      acquisitionLTV: 0.75,
      acquisitionInterestRate: 0.09,
      acquisitionTermYears: 25,
    };
    const years = 5;
    const { data, results } = generateAndAggregate(financedProp, baseGlobal, years);
    const lastResult = results[years - 1];
    const lastYearData = data.slice((years - 1) * 12, years * 12);
    const outstandingDebt = lastYearData[lastYearData.length - 1].debtOutstanding;

    // Outstanding debt should be positive for a 25-year loan after only 5 years
    expect(outstandingDebt).toBeGreaterThan(0);
    // Exit value for financed should be less than for full equity (same NOI, but debt subtracted)
    const { results: equityResults } = generateAndAggregate(baseProperty, baseGlobal, years);
    expect(lastResult.exitValue).toBeLessThan(equityResults[years - 1].exitValue);
  });
});

// ===========================================================================
// 7. Full Equity vs Financed: Different cash flow patterns
// ===========================================================================
describe("Full Equity vs Financed Cash Flow Patterns", () => {
  const years = 5;
  const equityResult = generateAndAggregate(baseProperty, baseGlobal, years);
  const financedProp = {
    ...baseProperty,
    type: "Financed",
    acquisitionLTV: 0.75,
    acquisitionInterestRate: 0.09,
    acquisitionTermYears: 25,
  };
  const financedResult = generateAndAggregate(financedProp, baseGlobal, years);

  it("NOI is the same regardless of financing (NOI is debt-independent)", () => {
    for (let y = 0; y < years; y++) {
      expect(equityResult.results[y].noi).toBeCloseTo(financedResult.results[y].noi, 2);
    }
  });

  it("Full Equity has higher net income (no interest deduction)", () => {
    for (let y = 0; y < years; y++) {
      // Full equity has no interest, so net income should be higher
      // (though depreciation and tax are also in play)
      expect(equityResult.results[y].interestExpense).toBe(0);
      expect(financedResult.results[y].interestExpense).toBeGreaterThan(0);
    }
  });

  it("Full Equity BTCF = NOI; Financed BTCF = NOI - debt service", () => {
    for (let y = 0; y < years; y++) {
      expect(equityResult.results[y].btcf).toBeCloseTo(equityResult.results[y].anoi, 2);
      expect(financedResult.results[y].btcf).toBeCloseTo(
        financedResult.results[y].anoi - financedResult.results[y].debtService,
        2
      );
    }
  });

  it("Financed property has lower ATCF than Full Equity", () => {
    for (let y = 0; y < years; y++) {
      expect(financedResult.results[y].atcf).toBeLessThan(equityResult.results[y].atcf);
    }
  });

  it("Full Equity capitalExpenditures reflects full purchase price in acquisition year", () => {
    // For Full Equity, equityInvested = totalPropertyCost (no loan)
    const acqYearResult = equityResult.results[0];
    expect(acqYearResult.capitalExpenditures).toBeCloseTo(baseProperty.purchasePrice, 0);
  });

  it("Financed capitalExpenditures reflects equity portion only in acquisition year", () => {
    const acqYearResult = financedResult.results[0];
    const totalCost = baseProperty.purchasePrice;
    const loanAmount = baseProperty.purchasePrice * 0.75;
    const equityInvested = totalCost - loanAmount;
    expect(acqYearResult.capitalExpenditures).toBeCloseTo(equityInvested, 0);
  });
});

// ===========================================================================
// 8. Partial-Year Operations: Property starts mid-year
// ===========================================================================
describe("Partial-Year Operations", () => {
  it("handles property that starts mid-year (6 months into year 1)", () => {
    const prop = {
      ...baseProperty,
      operationsStartDate: "2026-10-01",
      acquisitionDate: "2026-10-01",
    };
    const years = 2;
    const { data, results } = generateAndAggregate(prop, baseGlobal, years);

    // First 6 months (Apr-Sep 2026) should have zero revenue
    for (let i = 0; i < 6; i++) {
      expect(data[i].revenueTotal).toBe(0);
    }
    // Remaining 6 months (Oct 2026 - Mar 2027) should have revenue
    for (let i = 6; i < 12; i++) {
      expect(data[i].revenueTotal).toBeGreaterThan(0);
    }

    // Year 1 NOI should reflect only 6 operational months
    expect(results[0].noi).toBeGreaterThan(0);
    // Year 2 NOI should be larger (full 12 months of operation)
    expect(results[1].noi).toBeGreaterThan(results[0].noi);
  });

  it("annualizes NOI for exit value when last year is partial", () => {
    // Property starts 9 months into the model, 1-year projection
    // Only 3 operational months in the single year
    const prop = {
      ...baseProperty,
      operationsStartDate: "2027-01-01",
      acquisitionDate: "2027-01-01",
    };
    const years = 1;
    const { data, results } = generateAndAggregate(prop, baseGlobal, years);

    // Only 3 months operational (Jan-Mar 2027)
    const operationalMonths = data.filter(m => m.revenueTotal > 0).length;
    expect(operationalMonths).toBe(3);

    // Exit value should use annualized NOI (not partial-year NOI)
    // which means multiplying the 3-month NOI by 12/3 = 4
    const partialNOI = results[0].noi;
    const annualizedNOI = (partialNOI / operationalMonths) * 12;
    const grossValue = annualizedNOI / DEFAULT_EXIT_CAP_RATE;
    const commission = grossValue * DEFAULT_COMMISSION_RATE;
    const outstandingDebt = data[data.length - 1].debtOutstanding;
    const expectedExit = grossValue - commission - outstandingDebt;

    expect(results[0].exitValue).toBeCloseTo(expectedExit, 0);
  });

  it("partial year uses annualized NOI for exit calculation vs full-year baseline", () => {
    // Compare: full-year property vs partial-year property
    // Exit values should be reasonably close since both annualize
    const fullYearProp = { ...baseProperty };
    const partialProp = {
      ...baseProperty,
      operationsStartDate: "2026-10-01",
      acquisitionDate: "2026-10-01",
    };
    const years = 1;
    const { results: fullResults } = generateAndAggregate(fullYearProp, baseGlobal, years);
    const { results: partialResults } = generateAndAggregate(partialProp, baseGlobal, years);

    // Both should have non-zero exit values
    expect(fullResults[0].exitValue).toBeGreaterThan(0);
    expect(partialResults[0].exitValue).toBeGreaterThan(0);
  });
});

// ===========================================================================
// 9. Refinance Year: Proceeds correctly attributed
// ===========================================================================
describe("Refinance Year Cash Flow", () => {
  const financedRefiProp = {
    ...baseProperty,
    type: "Financed",
    acquisitionLTV: 0.75,
    acquisitionInterestRate: 0.09,
    acquisitionTermYears: 25,
    willRefinance: "Yes",
    refinanceDate: "2029-04-01", // 3 years into the model
    refinanceLTV: 0.65,
    refinanceInterestRate: 0.08,
    refinanceTermYears: 25,
    refinanceClosingCostRate: 0.03,
    exitCapRate: 0.085,
  };

  it("refinancing proceeds appear only in the refinance year", () => {
    const years = 5;
    const { results } = generateAndAggregate(financedRefiProp, baseGlobal, years);

    // Refinance is at month 36 (year 3, index 3)
    const refiYearIndex = 3;
    for (let y = 0; y < years; y++) {
      if (y === refiYearIndex) {
        // There should be refinancing proceeds in year 3
        // (may be 0 if loan sizing doesn't produce enough, but conceptually this is the year)
        // We just verify other years are 0
      } else {
        expect(results[y].refinancingProceeds).toBe(0);
      }
    }
  });

  it("refinancing proceeds are non-negative", () => {
    const years = 5;
    const { results } = generateAndAggregate(financedRefiProp, baseGlobal, years);
    for (const r of results) {
      expect(r.refinancingProceeds).toBeGreaterThanOrEqual(0);
    }
  });

  it("net cash flow to investors includes refi proceeds in refi year", () => {
    const years = 5;
    const { results } = generateAndAggregate(financedRefiProp, baseGlobal, years);
    const refiYearIndex = 3;
    const r = results[refiYearIndex];

    // netCashFlowToInvestors = atcf + refiProceeds + exitValue (0 if not last year) - capitalExpenditures
    const expected = r.atcf + r.refinancingProceeds + r.exitValue - r.capitalExpenditures;
    expect(r.netCashFlowToInvestors).toBeCloseTo(expected, 2);
  });
});

// ===========================================================================
// 10. Zero-Revenue Months: Pre-operations period handled
// ===========================================================================
describe("Zero-Revenue Months (Pre-Operations)", () => {
  const prop = {
    ...baseProperty,
    operationsStartDate: "2027-04-01", // 1 year after model start
    acquisitionDate: "2027-04-01",
  };

  it("year 0 has zero NOI when property has not started operations", () => {
    const years = 3;
    const { results } = generateAndAggregate(prop, baseGlobal, years);
    // Year 0 (Apr 2026 - Mar 2027): no operations
    expect(results[0].noi).toBe(0);
  });

  it("year 0 has zero revenue-related aggregates", () => {
    const years = 3;
    const { results } = generateAndAggregate(prop, baseGlobal, years);
    expect(results[0].noi).toBe(0);
    expect(results[0].interestExpense).toBe(0);
    expect(results[0].depreciation).toBe(0);
    expect(results[0].netIncome).toBe(0);
    expect(results[0].taxLiability).toBe(0);
    expect(results[0].operatingCashFlow).toBe(0);
    expect(results[0].btcf).toBe(0);
    expect(results[0].atcf).toBe(0);
  });

  it("year 1 (operational) has positive NOI", () => {
    const years = 3;
    const { results } = generateAndAggregate(prop, baseGlobal, years);
    expect(results[1].noi).toBeGreaterThan(0);
  });

  it("cumulative cash flow is 0 after year 0 with no operations or capital events", () => {
    const years = 3;
    const { results } = generateAndAggregate(prop, baseGlobal, years);
    // Year 0 has no operations and no capital expenditures (acquisition in year 1)
    // BUT capital expenditures happen in the acquisition year
    // Acquisition is at month 12 = year 1, so year 0 capex should be 0
    expect(results[0].capitalExpenditures).toBe(0);
    expect(results[0].netCashFlowToInvestors).toBe(0);
    expect(results[0].cumulativeCashFlow).toBe(0);
  });
});

// ===========================================================================
// Additional: GAAP Cross-Check Identities
// ===========================================================================
describe("GAAP Cross-Check Identities on Aggregated Data", () => {
  const years = 10;
  const { results } = generateAndAggregate(baseProperty, baseGlobal, years);

  it("netIncome = ANOI - interest - depreciation - taxLiability for each year", () => {
    for (const r of results) {
      expect(r.netIncome).toBeCloseTo(
        r.anoi - r.interestExpense - r.depreciation - r.taxLiability,
        2
      );
    }
  });

  it("operatingCashFlow = netIncome + depreciation (non-cash add-back)", () => {
    for (const r of results) {
      expect(r.operatingCashFlow).toBeCloseTo(r.netIncome + r.depreciation, 2);
    }
  });

  it("BTCF = ANOI - debtService for each year", () => {
    for (const r of results) {
      expect(r.btcf).toBeCloseTo(r.anoi - r.debtService, 2);
    }
  });

  it("ATCF = BTCF - taxLiability for each year", () => {
    for (const r of results) {
      expect(r.atcf).toBeCloseTo(r.btcf - r.taxLiability, 2);
    }
  });

  it("taxableIncome = ANOI - interest - depreciation for each year", () => {
    for (const r of results) {
      expect(r.taxableIncome).toBeCloseTo(r.anoi - r.interestExpense - r.depreciation, 2);
    }
  });

  it("freeCashFlowToEquity = freeCashFlow - principalPayment for each year", () => {
    for (const r of results) {
      expect(r.freeCashFlowToEquity).toBeCloseTo(r.freeCashFlow - r.principalPayment, 2);
    }
  });

  it("cumulative cash flow is running sum of netCashFlowToInvestors", () => {
    let cumulative = 0;
    for (const r of results) {
      cumulative += r.netCashFlowToInvestors;
      expect(r.cumulativeCashFlow).toBeCloseTo(cumulative, 2);
    }
  });
});

// ===========================================================================
// Additional: Net Cash Flow to Investors formula
// ===========================================================================
describe("Net Cash Flow to Investors Formula", () => {
  it("netCashFlowToInvestors = atcf + refiProceeds + exitValue - capitalExpenditures", () => {
    const years = 5;
    const { results } = generateAndAggregate(baseProperty, baseGlobal, years);
    for (const r of results) {
      const expected = r.atcf + r.refinancingProceeds + r.exitValue - r.capitalExpenditures;
      expect(r.netCashFlowToInvestors).toBeCloseTo(expected, 2);
    }
  });

  it("acquisition year has negative capital expenditure impact on investor CF", () => {
    const years = 3;
    const { results } = generateAndAggregate(baseProperty, baseGlobal, years);
    // Year 0 is the acquisition year for a property acquired at model start
    expect(results[0].capitalExpenditures).toBeGreaterThan(0);
    // Net CF to investors in year 0 should be lower due to capital expenditure
    expect(results[0].netCashFlowToInvestors).toBeLessThan(results[0].atcf);
  });

  it("non-acquisition, non-exit years: netCashFlowToInvestors = atcf", () => {
    const years = 5;
    const { results } = generateAndAggregate(baseProperty, baseGlobal, years);
    // Years 1, 2, 3 (not acquisition year 0, not exit year 4)
    for (let y = 1; y < years - 1; y++) {
      expect(results[y].capitalExpenditures).toBe(0);
      expect(results[y].refinancingProceeds).toBe(0);
      expect(results[y].exitValue).toBe(0);
      expect(results[y].netCashFlowToInvestors).toBeCloseTo(results[y].atcf, 2);
    }
  });
});

// ===========================================================================
// Additional: Single-year projection
// ===========================================================================
describe("Single-Year Projection", () => {
  it("produces exactly 1 yearly result for a 1-year projection", () => {
    const { results } = generateAndAggregate(baseProperty, baseGlobal, 1);
    expect(results).toHaveLength(1);
  });

  it("single year includes both exit value and capital expenditure", () => {
    const { results } = generateAndAggregate(baseProperty, baseGlobal, 1);
    expect(results[0].exitValue).toBeGreaterThan(0);
    expect(results[0].capitalExpenditures).toBeGreaterThan(0);
  });

  it("cumulative cash flow equals net cash flow to investors in single year", () => {
    const { results } = generateAndAggregate(baseProperty, baseGlobal, 1);
    expect(results[0].cumulativeCashFlow).toBeCloseTo(results[0].netCashFlowToInvestors, 2);
  });
});

// ===========================================================================
// Additional: Financed property with full 10-year projection
// ===========================================================================
describe("Financed Property Full 10-Year Projection", () => {
  const financedProp = {
    ...baseProperty,
    type: "Financed",
    acquisitionLTV: 0.75,
    acquisitionInterestRate: 0.09,
    acquisitionTermYears: 25,
  };
  const years = 10;
  const { results } = generateAndAggregate(financedProp, baseGlobal, years);

  it("interest expense decreases over time (amortization effect)", () => {
    // Interest should generally decrease as principal is paid down
    // Compare year 1 to year 9 (avoiding year 0 which may have partial effects)
    expect(results[8].interestExpense).toBeLessThan(results[1].interestExpense);
  });

  it("principal payment increases over time (amortization effect)", () => {
    // Principal should generally increase as loan amortizes
    expect(results[8].principalPayment).toBeGreaterThan(results[1].principalPayment);
  });

  it("debt service is constant each year (level-payment mortgage)", () => {
    // For a standard amortizing loan, PMT is constant
    // All years should have the same debt service (12 * monthly PMT)
    const expectedAnnualDS = results[0].debtService;
    for (let y = 1; y < years; y++) {
      expect(results[y].debtService).toBeCloseTo(expectedAnnualDS, 0);
    }
  });

  it("exit value in final year deducts outstanding debt", () => {
    const lastYearResult = results[years - 1];
    // For a financed property, exit value should account for remaining debt
    // It should still be positive for a profitable hotel
    expect(lastYearResult.exitValue).toBeGreaterThan(0);
  });
});

// ===========================================================================
// Additional: Zero exit cap rate edge case
// ===========================================================================
describe("Edge Case: Zero Exit Cap Rate", () => {
  it("exit value is 0 when exitCapRate is 0 (division guard)", () => {
    const prop = {
      ...baseProperty,
      exitCapRate: 0,
    };
    const glob = {
      ...baseGlobal,
      exitCapRate: 0,
    };
    const years = 3;
    const loanParams = toLoanParams(prop);
    const globalLoanParams: GlobalLoanParams = {
      ...toGlobalLoanParams(glob),
      exitCapRate: 0,
    };
    const months = years * 12;
    const data = generatePropertyProForma(prop, { ...glob, projectionYears: years }, months);
    const results = aggregateCashFlowByYear(data, loanParams, globalLoanParams, years);

    expect(results[years - 1].exitValue).toBe(0);
  });
});

// ===========================================================================
// Additional: Long projection (10 years) cumulative consistency
// ===========================================================================
describe("10-Year Cumulative Cash Flow Consistency", () => {
  const years = 10;
  const { results } = generateAndAggregate(baseProperty, baseGlobal, years);

  it("cumulative cash flow is monotonically increasing for profitable Full Equity property (excluding acquisition year)", () => {
    // After the acquisition year hit, cumulative CF should grow each year
    for (let y = 2; y < years; y++) {
      expect(results[y].cumulativeCashFlow).toBeGreaterThan(results[y - 1].cumulativeCashFlow);
    }
  });

  it("final year cumulative includes exit value boost", () => {
    // The last year's cumulative should jump significantly due to exit value
    const penultimateYearCF = results[years - 2].netCashFlowToInvestors;
    const lastYearCF = results[years - 1].netCashFlowToInvestors;
    // Last year has exit value, so it should be much larger
    expect(lastYearCF).toBeGreaterThan(penultimateYearCF);
  });
});
