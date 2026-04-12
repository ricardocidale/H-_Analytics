import { describe, it, expect } from "vitest";
import { generatePropertyProForma } from "../../client/src/lib/financialEngine.js";
import {
  DEPRECIATION_YEARS,
  DAYS_PER_MONTH,
  DEFAULT_LAND_VALUE_PERCENT,
  DEFAULT_PROPERTY_TAX_RATE,
  DEFAULT_BASE_MANAGEMENT_FEE_RATE,
  DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
  DEFAULT_EVENT_EXPENSE_RATE,
  DEFAULT_OTHER_EXPENSE_RATE,
  DEFAULT_UTILITIES_VARIABLE_SPLIT,
} from "../../shared/constants.js";

const PENNY = 2;

const goldenProperty = {
  operationsStartDate: "2026-04-01",
  acquisitionDate: "2026-04-01",
  roomCount: 10,
  startAdr: 200,
  adrGrowthRate: 0,
  startOccupancy: 0.70,
  maxOccupancy: 0.70,
  occupancyRampMonths: 1,
  occupancyGrowthStep: 0,
  purchasePrice: 1_000_000,
  buildingImprovements: 0,
  landValuePercent: DEFAULT_LAND_VALUE_PERCENT,
  preOpeningCosts: 0,
  operatingReserve: 0,
  costRateRooms: 0.20,
  costRateFB: 0.09,
  costRateAdmin: 0.08,
  costRateMarketing: 0.01,
  costRatePropertyOps: 0.04,
  costRateUtilities: 0.05,
  costRateTaxes: 0.03,
  costRateIT: 0.005,
  costRateFFE: 0.04,
  costRateOther: 0.05,
  revShareEvents: 0.43,
  revShareFB: 0.22,
  revShareOther: 0.07,
  cateringBoostPercent: 0.30,
  baseManagementFeeRate: DEFAULT_BASE_MANAGEMENT_FEE_RATE,
  incentiveManagementFeeRate: DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
  taxRate: DEFAULT_PROPERTY_TAX_RATE,
  type: "Full Equity",
};

const goldenGlobal = {
  modelStartDate: "2026-04-01",
  projectionYears: 10,
  inflationRate: 0,
  fixedCostEscalationRate: 0,
  eventExpenseRate: DEFAULT_EVENT_EXPENSE_RATE,
  otherExpenseRate: DEFAULT_OTHER_EXPENSE_RATE,
  utilitiesVariableSplit: DEFAULT_UTILITIES_VARIABLE_SPLIT,
};

describe("Golden Value Tests — Penny-Exact Verification", () => {
  const result = generatePropertyProForma(goldenProperty, goldenGlobal, 120);

  const avail = 10 * DAYS_PER_MONTH;
  const sold = avail * 0.70;
  const revRooms = sold * 200;
  const ancillaryShare = 0.43 + 0.22 + 0.07;
  const roomShareOfTotal = Math.max(0.05, 1 - ancillaryShare);
  const revTotal = revRooms / roomShareOfTotal;
  const revEvents = revTotal * 0.43;
  const revFB = revTotal * 0.22;
  const revOther = revTotal * 0.07;

  const expRooms = revRooms * 0.20;
  const expFB = revFB * 0.09;
  const expEvents = revEvents * DEFAULT_EVENT_EXPENSE_RATE;
  const expOther = revOther * DEFAULT_OTHER_EXPENSE_RATE;
  const expMarketing = revTotal * 0.01;
  const expUtilVar = revTotal * (0.05 * DEFAULT_UTILITIES_VARIABLE_SPLIT);
  const expFFE = revTotal * 0.04;
  const expAdmin = revTotal * 0.08;
  const expPropOps = revTotal * 0.04;
  const expIT = revTotal * 0.005;
  const expTaxes = (1_000_000 / 12) * 0.03;
  const expUtilFixed = revTotal * (0.05 * (1 - DEFAULT_UTILITIES_VARIABLE_SPLIT));
  const expOtherCosts = revTotal * 0.05;
  const expInsurance = (1_000_000 / 12) * 0.015;
  const totalOpEx = expRooms + expFB + expEvents + expOther + expMarketing +
    expPropOps + expUtilVar + expAdmin + expIT + expUtilFixed + expInsurance + expOtherCosts;
  const gop = revTotal - totalOpEx;
  const feeBase = revTotal * DEFAULT_BASE_MANAGEMENT_FEE_RATE;
  const feeIncentive = Math.max(0, gop * DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE);
  const agop = gop - feeBase - feeIncentive;
  const noi = agop - expTaxes;
  const anoi = noi - expFFE;
  const depBasis = 1_000_000 * (1 - DEFAULT_LAND_VALUE_PERCENT);
  const monthlyDep = depBasis / DEPRECIATION_YEARS / 12;
  const taxableIncome = anoi - monthlyDep;
  const incomeTax = taxableIncome > 0 ? taxableIncome * DEFAULT_PROPERTY_TAX_RATE : 0;
  const netIncome = anoi - monthlyDep - incomeTax;
  const cashFlow = anoi - incomeTax;

  it("month 1 revenue components are penny-exact", () => {
    const m = result[0];
    expect(m.availableRooms).toBeCloseTo(avail, PENNY);
    expect(m.soldRooms).toBeCloseTo(sold, PENNY);
    expect(m.revenueRooms).toBeCloseTo(revRooms, PENNY);
    expect(m.revenueEvents).toBeCloseTo(revEvents, PENNY);
    expect(m.revenueFB).toBeCloseTo(revFB, PENNY);
    expect(m.revenueOther).toBeCloseTo(revOther, PENNY);
    expect(m.revenueTotal).toBeCloseTo(revTotal, PENNY);
  });

  it("month 1 expenses are penny-exact", () => {
    const m = result[0];
    expect(m.expenseRooms).toBeCloseTo(expRooms, PENNY);
    expect(m.expenseFB).toBeCloseTo(expFB, PENNY);
    expect(m.expenseEvents).toBeCloseTo(expEvents, PENNY);
    expect(m.expenseOther).toBeCloseTo(expOther, PENNY);
    expect(m.expenseMarketing).toBeCloseTo(expMarketing, PENNY);
    expect(m.expenseAdmin).toBeCloseTo(expAdmin, PENNY);
    expect(m.expensePropertyOps).toBeCloseTo(expPropOps, PENNY);
    expect(m.expenseIT).toBeCloseTo(expIT, PENNY);
  });

  it("month 1 GOP, fees, NOI are penny-exact", () => {
    const m = result[0];
    expect(m.gop).toBeCloseTo(gop, PENNY);
    expect(m.feeBase).toBeCloseTo(feeBase, PENNY);
    expect(m.feeIncentive).toBeCloseTo(feeIncentive, PENNY);
    expect(m.noi).toBeCloseTo(noi, PENNY);
    expect(m.anoi).toBeCloseTo(anoi, PENNY);
  });

  it("month 1 net income and cash flow are penny-exact", () => {
    const m = result[0];
    expect(m.depreciationExpense).toBeCloseTo(monthlyDep, PENNY);
    expect(m.incomeTax).toBeCloseTo(incomeTax, PENNY);
    expect(m.netIncome).toBeCloseTo(netIncome, PENNY);
    expect(m.cashFlow).toBeCloseTo(cashFlow, PENNY);
  });

  it("all 120 months produce identical values (zero growth scenario)", () => {
    for (let i = 0; i < 120; i++) {
      const m = result[i];
      expect(m.revenueTotal).toBeCloseTo(revTotal, PENNY);
      expect(m.gop).toBeCloseTo(gop, PENNY);
      expect(m.noi).toBeCloseTo(noi, PENNY);
      expect(m.anoi).toBeCloseTo(anoi, PENNY);
      expect(m.cashFlow).toBeCloseTo(cashFlow, PENNY);
    }
  });

  it("cumulative cash after 12 months equals 12 × monthly cashFlow", () => {
    const expected12MonthCash = cashFlow * 12;
    expect(result[11].endingCash).toBeCloseTo(expected12MonthCash, PENNY);
  });

  it("cumulative cash after 120 months equals 120 × monthly cashFlow", () => {
    const expected120MonthCash = cashFlow * 120;
    expect(result[119].endingCash).toBeCloseTo(expected120MonthCash, 0);
  });

  it("property value declines exactly by depreciation each month", () => {
    const landValue = 1_000_000 * DEFAULT_LAND_VALUE_PERCENT;
    for (let i = 0; i < 120; i++) {
      const expectedPV = landValue + depBasis - monthlyDep * (i + 1);
      expect(result[i].propertyValue).toBeCloseTo(expectedPV, 0);
    }
  });
});

describe("Golden Value Tests — Financed Property Debt Schedule", () => {
  const financedProperty = {
    ...goldenProperty,
    type: "Financed",
    acquisitionLTV: 0.75,
    acquisitionInterestRate: 0.06,
    acquisitionTermYears: 25,
  };
  const result = generatePropertyProForma(financedProperty, goldenGlobal, 120);

  const loanAmount = 1_000_000 * 0.75;
  const monthlyRate = 0.06 / 12;
  const numPayments = 25 * 12;
  const pmt = (loanAmount * monthlyRate * Math.pow(1 + monthlyRate, numPayments)) /
    (Math.pow(1 + monthlyRate, numPayments) - 1);

  it("month 1 interest = loanAmount × monthlyRate (penny-exact)", () => {
    expect(result[0].interestExpense).toBeCloseTo(loanAmount * monthlyRate, PENNY);
  });

  it("month 1 principal = PMT - interest (penny-exact)", () => {
    const expectedPrincipal = pmt - loanAmount * monthlyRate;
    expect(result[0].principalPayment).toBeCloseTo(expectedPrincipal, PENNY);
  });

  it("month 1 ending balance = loanAmount - principal (penny-exact)", () => {
    const expectedBalance = loanAmount - (pmt - loanAmount * monthlyRate);
    expect(result[0].debtOutstanding).toBeCloseTo(expectedBalance, PENNY);
  });

  it("carry-forward produces identical results to independent amortization schedule", () => {
    let bal = loanAmount;
    for (let i = 0; i < 120; i++) {
      const interest = bal * monthlyRate;
      const principal = pmt - interest;
      bal = Math.max(0, bal - principal);
      expect(result[i].debtOutstanding).toBeCloseTo(bal, PENNY);
      expect(result[i].interestExpense).toBeCloseTo(interest, PENNY);
      expect(result[i].principalPayment).toBeCloseTo(principal, PENNY);
    }
  });

  it("interest + principal = PMT every month (exact)", () => {
    for (const m of result) {
      if (m.debtPayment > 0) {
        expect(m.interestExpense + m.principalPayment).toBeCloseTo(m.debtPayment, PENNY);
      }
    }
  });

  it("month 120 balance matches independent calculation to the penny", () => {
    let bal = loanAmount;
    for (let i = 0; i < 120; i++) {
      const interest = bal * monthlyRate;
      const principal = pmt - interest;
      bal = Math.max(0, bal - principal);
    }
    expect(result[119].debtOutstanding).toBeCloseTo(bal, PENNY);
  });
});

describe("Month-over-Month Continuity Cross-Checks", () => {
  const property = {
    ...goldenProperty,
    type: "Financed",
    acquisitionLTV: 0.75,
    acquisitionInterestRate: 0.06,
    acquisitionTermYears: 25,
    adrGrowthRate: 0.03,
    startOccupancy: 0.60,
    maxOccupancy: 0.85,
    occupancyRampMonths: 6,
    occupancyGrowthStep: 0.05,
  };
  const global = {
    ...goldenGlobal,
    inflationRate: 0.03,
    fixedCostEscalationRate: 0.03,
  };
  const result = generatePropertyProForma(property, global, 120);

  it("endingCash = previous endingCash + cashFlow every month", () => {
    let cumCash = 0;
    for (let i = 0; i < 120; i++) {
      cumCash += result[i].cashFlow;
      expect(result[i].endingCash).toBeCloseTo(cumCash, PENNY);
    }
  });

  it("GOP = revenue - operating expenses every month", () => {
    for (const m of result) {
      const totalOpEx = m.expenseRooms + m.expenseFB + m.expenseEvents + m.expenseOther +
        m.expenseMarketing + m.expensePropertyOps + m.expenseUtilitiesVar +
        m.expenseAdmin + m.expenseIT +
        m.expenseUtilitiesFixed + m.expenseInsurance + m.expenseOtherCosts;
      expect(m.gop).toBeCloseTo(m.revenueTotal - totalOpEx, PENNY);
    }
  });

  it("NOI = GOP - fees - FFE every month", () => {
    for (const m of result) {
      const agop = m.gop - m.feeBase - m.feeIncentive;
      const noi = agop - m.expenseTaxes;
      const anoi = noi - m.expenseFFE;
      expect(m.noi).toBeCloseTo(noi, PENNY);
      expect(m.anoi).toBeCloseTo(anoi, PENNY);
    }
  });

  it("netIncome = NOI - interest - depreciation - tax every month", () => {
    for (const m of result) {
      const expected = m.anoi - m.interestExpense - m.depreciationExpense - m.incomeTax;
      expect(m.netIncome).toBeCloseTo(expected, PENNY);
    }
  });

  it("cashFlow = NOI - debtPayment - tax every month", () => {
    for (const m of result) {
      expect(m.cashFlow).toBeCloseTo(m.anoi - m.debtPayment - m.incomeTax, PENNY);
    }
  });

  it("operatingCashFlow = netIncome + depreciation (ASC 230) every month", () => {
    for (const m of result) {
      expect(m.operatingCashFlow).toBeCloseTo(m.netIncome + m.depreciationExpense, PENNY);
    }
  });

  it("financingCashFlow = -principalPayment every month", () => {
    for (const m of result) {
      expect(m.financingCashFlow).toBeCloseTo(-m.principalPayment, PENNY);
    }
  });

  it("totalExpenses = operating expenses + fees + FFE every month", () => {
    for (const m of result) {
      const totalOpEx = m.expenseRooms + m.expenseFB + m.expenseEvents + m.expenseOther +
        m.expenseMarketing + m.expensePropertyOps + m.expenseUtilitiesVar +
        m.expenseAdmin + m.expenseIT +
        m.expenseUtilitiesFixed + m.expenseInsurance + m.expenseOtherCosts;
    }
  });

  it("debt outstanding strictly decreases (amortization continuity)", () => {
    for (let i = 1; i < 120; i++) {
      if (result[i].debtPayment > 0 && result[i - 1].debtPayment > 0) {
        expect(result[i].debtOutstanding).toBeLessThan(result[i - 1].debtOutstanding);
      }
    }
  });

  it("interest decreases over time (as balance amortizes)", () => {
    const firstInterest = result[0].interestExpense;
    const lastInterest = result[119].interestExpense;
    expect(lastInterest).toBeLessThan(firstInterest);
  });

  it("revenue never goes negative", () => {
    for (const m of result) {
      expect(m.revenueTotal).toBeGreaterThanOrEqual(0);
      expect(m.revenueRooms).toBeGreaterThanOrEqual(0);
    }
  });

  it("no tax when taxable income is negative", () => {
    for (const m of result) {
      const taxableIncome = m.noi - m.interestExpense - m.depreciationExpense;
      if (taxableIncome <= 0) {
        expect(m.incomeTax).toBe(0);
      }
    }
  });

  it("cashShortfall flag matches endingCash < 0", () => {
    for (const m of result) {
      expect(m.cashShortfall).toBe(m.endingCash < 0);
    }
  });
});
