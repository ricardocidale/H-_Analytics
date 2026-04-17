/**
 * Golden Scenario: Management Company Funding Interest Waterfall
 *
 * Extends the Clearwater Inn scenario (verified in mgmt-company-plus-one-property-golden.test.ts)
 * with 8% annual funding interest rate. Tests all three payment modes:
 *   1. accrues_only — interest accrues indefinitely, never paid
 *   2. quarterly   — accrued interest paid every 3 months
 *   3. annually    — accrued interest paid every 12 months
 *
 * Also tests a two-tranche scenario with quarterly payments where principal
 * steps up mid-projection, changing the monthly interest calculation.
 *
 * PROPERTY: 15 rooms, $175 ADR, 68% occ (flat), $1.5M cash purchase
 * COMPANY: SAFE $800K tranche 1, 8% interest, partner comp $540K/yr,
 *          staff $75K/yr, 2.5 FTE (tier 1), 0% growth/inflation.
 *
 * All values hand-calculated to the penny. Verifies:
 *   - Month-by-month interest accrual and payment events
 *   - EBITDA → Interest Expense → Pre-Tax → Tax → Net Income waterfall
 *   - Cash flow statement (indirect method: NI + interest addback + SAFE - payment)
 *   - Balance sheet identity: Cash = SAFE + AccruedInterest + RetainedEarnings
 *   - Export data generators (company-data.ts): IS, CF, BS row correctness
 *   - Tax shield effect of interest deduction
 *   - Months-of-runway burn rate includes interest payments
 *
 * Projection: 12 months (1 year) starting 2026-01-01.
 */
import { describe, it, expect } from "vitest";
import { generatePropertyProForma } from "../../client/src/lib/financial/property-engine";
import { generateCompanyProForma } from "../../client/src/lib/financial/company-engine";
import {
  generateCompanyIncomeData,
  generateCompanyCashFlowData,
  generateCompanyBalanceData,
} from "../../client/src/lib/company-data";
import {
  DEFAULT_COST_RATE_ROOMS, DEFAULT_COST_RATE_FB, DEFAULT_COST_RATE_ADMIN,
  DEFAULT_COST_RATE_MARKETING, DEFAULT_COST_RATE_PROPERTY_OPS, DEFAULT_COST_RATE_UTILITIES,
  DEFAULT_COST_RATE_TAXES, DEFAULT_COST_RATE_IT,
  DEFAULT_COST_RATE_FFE, DEFAULT_COST_RATE_OTHER, DEFAULT_COST_RATE_INSURANCE,
  DEFAULT_EVENT_EXPENSE_RATE, DEFAULT_OTHER_EXPENSE_RATE, DEFAULT_UTILITIES_VARIABLE_SPLIT,
  DEFAULT_REV_SHARE_EVENTS, DEFAULT_REV_SHARE_FB, DEFAULT_REV_SHARE_OTHER,
  DEFAULT_CATERING_BOOST_PCT, DEFAULT_BASE_MANAGEMENT_FEE_RATE, DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
  DEFAULT_COMPANY_TAX_RATE, DEFAULT_BUSINESS_INSURANCE_START,
  DAYS_PER_MONTH,
} from "../../shared/constants";
import type { PropertyInput, GlobalInput } from "../../engine/types";

const PENNY = 2;

const PROPERTY: PropertyInput = {
  id: 1,
  name: "Clearwater Inn",
  type: "Cash",
  purchasePrice: 1_500_000,
  buildingImprovements: 200_000,
  preOpeningCosts: 50_000,
  roomCount: 15,
  startAdr: 175,
  startOccupancy: 0.68,
  maxOccupancy: 0.68,
  occupancyGrowthStep: 0,
  occupancyRampMonths: 6,
  adrGrowthRate: 0,
  inflationRate: 0,
  operationsStartDate: "2026-01-01",
  acquisitionDate: "2026-01-01",
  operatingReserve: 75_000,
  taxRate: 0.30,
  exitCapRate: 0.08,
  dispositionCommission: 0.02,
  willRefinance: "No",
} as PropertyInput;

const makeGlobal = (overrides: Partial<GlobalInput> = {}): GlobalInput => ({
  modelStartDate: "2026-01-01",
  projectionYears: 1,
  inflationRate: 0,
  fixedCostEscalationRate: 0,
  companyInflationRate: 0,
  companyTaxRate: DEFAULT_COMPANY_TAX_RATE,
  companyOpsStartDate: "2026-01-01",
  capitalRaise1Date: "2026-01-01",
  capitalRaise1Amount: 800_000,
  capitalRaise2Date: null,
  capitalRaise2Amount: 0,
  staffSalary: 75_000,
  staffTier1MaxProperties: 3,
  staffTier1Fte: 2.5,
  staffTier2MaxProperties: 6,
  staffTier2Fte: 4.5,
  staffTier3Fte: 7.0,
  partnerCompYear1: 540_000,
  officeLeaseStart: 36_000,
  professionalServicesStart: 24_000,
  techInfraStart: 18_000,
  travelCostPerClient: 12_000,
  itLicensePerClient: 3_000,
  marketingRate: 0.05,
  miscOpsRate: 0.03,
  fundingInterestRate: 0.08,
  fundingInterestPaymentFrequency: 'accrues_only',
  ...overrides,
} as GlobalInput);

const MONTHS = 12;

const H_AVAIL_ROOMS = 15 * DAYS_PER_MONTH;
const H_SOLD_ROOMS = H_AVAIL_ROOMS * 0.68;
const H_REV_ROOMS = H_SOLD_ROOMS * 175;
// Revenue shares are % of TOTAL revenue; room share = 1 - ancillary
const H_ANCILLARY = DEFAULT_REV_SHARE_EVENTS + DEFAULT_REV_SHARE_FB + DEFAULT_REV_SHARE_OTHER;
const H_ROOM_SHARE = Math.max(0.05, 1 - H_ANCILLARY);
const H_REV_TOTAL = H_REV_ROOMS / H_ROOM_SHARE;
const H_REV_EVENTS = H_REV_TOTAL * DEFAULT_REV_SHARE_EVENTS;
const H_REV_FB = H_REV_TOTAL * DEFAULT_REV_SHARE_FB;
const H_REV_OTHER = H_REV_TOTAL * DEFAULT_REV_SHARE_OTHER;

const H_TOTAL_PROPERTY_VALUE = 1_500_000 + 200_000;
const H_GOP_EXP = H_REV_ROOMS * DEFAULT_COST_RATE_ROOMS
  + H_REV_FB * DEFAULT_COST_RATE_FB
  + H_REV_EVENTS * DEFAULT_EVENT_EXPENSE_RATE
  + H_REV_OTHER * DEFAULT_OTHER_EXPENSE_RATE
  + H_REV_TOTAL * DEFAULT_COST_RATE_MARKETING
  + H_REV_TOTAL * (DEFAULT_COST_RATE_UTILITIES * DEFAULT_UTILITIES_VARIABLE_SPLIT)
  + H_REV_TOTAL * DEFAULT_COST_RATE_ADMIN
  + H_REV_TOTAL * DEFAULT_COST_RATE_PROPERTY_OPS
  + H_REV_TOTAL * DEFAULT_COST_RATE_IT
  + H_REV_TOTAL * (DEFAULT_COST_RATE_UTILITIES * (1 - DEFAULT_UTILITIES_VARIABLE_SPLIT))
  + H_REV_TOTAL * DEFAULT_COST_RATE_OTHER
  + (H_TOTAL_PROPERTY_VALUE / 12) * DEFAULT_COST_RATE_INSURANCE;
const H_GOP = H_REV_TOTAL - H_GOP_EXP;

const H_FEE_BASE = H_REV_TOTAL * DEFAULT_BASE_MANAGEMENT_FEE_RATE;
const H_FEE_INCENTIVE = Math.max(0, H_GOP * DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE);

const H_CO_REV = H_FEE_BASE + H_FEE_INCENTIVE;

const H_CO_PARTNER = 540_000 / 12;
const H_CO_STAFF = (2.5 * 75_000) / 12;
const H_CO_OFFICE = 36_000 / 12;
const H_CO_PROF = 24_000 / 12;
const H_CO_TECH = 18_000 / 12;
const H_CO_TRAVEL = (1 * 12_000) / 12;
const H_CO_IT = (1 * 3_000) / 12;
const H_CO_MKT = H_CO_REV * 0.05;
const H_CO_MISC = H_CO_REV * 0.03;
const H_CO_BUSINESS_INSURANCE = DEFAULT_BUSINESS_INSURANCE_START / 12;
const H_CO_TOTAL_EXP = H_CO_PARTNER + H_CO_STAFF + H_CO_OFFICE + H_CO_PROF +
  H_CO_TECH + H_CO_BUSINESS_INSURANCE + H_CO_TRAVEL + H_CO_IT + H_CO_MKT + H_CO_MISC;

const H_EBITDA = H_CO_REV - H_CO_TOTAL_EXP;

const SAFE_PRINCIPAL = 800_000;
const ANNUAL_RATE = 0.08;
const H_MONTHLY_INTEREST = SAFE_PRINCIPAL * ANNUAL_RATE / 12;

const H_PRETAX_WITH_INTEREST = H_EBITDA - H_MONTHLY_INTEREST;
const H_TAX_WITH_INTEREST = H_PRETAX_WITH_INTEREST > 0 ? H_PRETAX_WITH_INTEREST * DEFAULT_COMPANY_TAX_RATE : 0;
const H_NI_WITH_INTEREST = H_PRETAX_WITH_INTEREST - H_TAX_WITH_INTEREST;

const H_PRETAX_NO_INTEREST = H_EBITDA;
const H_TAX_NO_INTEREST = H_PRETAX_NO_INTEREST > 0 ? H_PRETAX_NO_INTEREST * DEFAULT_COMPANY_TAX_RATE : 0;
const H_NI_NO_INTEREST = H_PRETAX_NO_INTEREST - H_TAX_NO_INTEREST;

describe("Golden: Company Funding Interest Waterfall (8%)", () => {

  describe("Preconditions: fee revenue and expenses match Clearwater Inn baseline", () => {
    const g = makeGlobal({ fundingInterestRate: 0 });
    const co = generateCompanyProForma([PROPERTY], g, MONTHS);

    it("monthly fee revenue is identical to zero-interest case", () => {
      expect(co[0].totalRevenue).toBeCloseTo(H_CO_REV, PENNY);
      expect(co[0].baseFeeRevenue).toBeCloseTo(H_FEE_BASE, PENNY);
      expect(co[0].incentiveFeeRevenue).toBeCloseTo(H_FEE_INCENTIVE, PENNY);
    });

    it("monthly expenses are identical to zero-interest case", () => {
      expect(co[0].totalExpenses).toBeCloseTo(H_CO_TOTAL_EXP, PENNY);
    });

    it("EBITDA = revenue - expenses (no interest, no vendor costs)", () => {
      const ebitda = co[0].totalRevenue - co[0].totalExpenses;
      expect(ebitda).toBeCloseTo(H_EBITDA, PENNY);
    });

    it("without interest: preTax = EBITDA, tax = 30%, NI = preTax × 0.70", () => {
      expect(co[0].preTaxIncome).toBeCloseTo(H_PRETAX_NO_INTEREST, PENNY);
      expect(co[0].companyIncomeTax).toBeCloseTo(H_TAX_NO_INTEREST, PENNY);
      expect(co[0].netIncome).toBeCloseTo(H_NI_NO_INTEREST, PENNY);
    });
  });

  describe("Mode 1: accrues_only — interest accrues, never paid", () => {
    const g = makeGlobal({ fundingInterestPaymentFrequency: 'accrues_only' });
    const co = generateCompanyProForma([PROPERTY], g, MONTHS);

    it("monthly interest expense = $800K × 8% / 12 = $5,333.33", () => {
      for (let m = 0; m < MONTHS; m++) {
        expect(co[m].fundingInterestExpense).toBeCloseTo(H_MONTHLY_INTEREST, PENNY);
      }
    });

    it("interest is never paid (fundingInterestPayment = 0 every month)", () => {
      for (let m = 0; m < MONTHS; m++) {
        expect(co[m].fundingInterestPayment).toBe(0);
      }
    });

    it("cumulative accrued interest = (m+1) × monthly interest", () => {
      for (let m = 0; m < MONTHS; m++) {
        expect(co[m].cumulativeAccruedInterest).toBeCloseTo(
          (m + 1) * H_MONTHLY_INTEREST, PENNY
        );
      }
    });

    it("EBITDA → Interest → Pre-Tax → Tax → NI waterfall is correct every month", () => {
      for (let m = 0; m < MONTHS; m++) {
        const ebitda = co[m].totalRevenue - co[m].totalVendorCost - co[m].totalExpenses;
        expect(ebitda).toBeCloseTo(H_EBITDA, PENNY);
        expect(co[m].preTaxIncome).toBeCloseTo(H_PRETAX_WITH_INTEREST, PENNY);
        expect(co[m].companyIncomeTax).toBeCloseTo(H_TAX_WITH_INTEREST, PENNY);
        expect(co[m].netIncome).toBeCloseTo(H_NI_WITH_INTEREST, PENNY);
      }
    });

    it("interest reduces pre-tax but not cash (non-cash accrual)", () => {
      const ebitda = H_EBITDA;
      expect(H_PRETAX_WITH_INTEREST).toBeCloseTo(ebitda - H_MONTHLY_INTEREST, PENNY);
      const cf = H_NI_WITH_INTEREST + H_MONTHLY_INTEREST;
      if (H_PRETAX_WITH_INTEREST <= 0) {
        expect(cf).toBeCloseTo(ebitda, PENNY);
      } else {
        const taxShield = H_MONTHLY_INTEREST * DEFAULT_COMPANY_TAX_RATE;
        expect(cf).toBeCloseTo(ebitda * (1 - DEFAULT_COMPANY_TAX_RATE) + taxShield, PENNY);
      }
    });

    it("cash flow = NI + interest_addback + SAFE - 0 (indirect method)", () => {
      expect(co[0].cashFlow).toBeCloseTo(H_NI_WITH_INTEREST + H_MONTHLY_INTEREST + SAFE_PRINCIPAL, PENNY);
      for (let m = 1; m < MONTHS; m++) {
        expect(co[m].cashFlow).toBeCloseTo(H_NI_WITH_INTEREST + H_MONTHLY_INTEREST, PENNY);
      }
    });

    it("ending cash = cumulative cashFlow", () => {
      let cumCash = 0;
      for (let m = 0; m < MONTHS; m++) {
        cumCash += co[m].cashFlow;
        expect(co[m].endingCash).toBeCloseTo(cumCash, PENNY);
      }
    });

    it("BS identity: Cash = SAFE_Notes + AccruedInterest + RetainedEarnings", () => {
      let cumNI = 0;
      for (let m = 0; m < MONTHS; m++) {
        cumNI += co[m].netIncome;
        const cumSAFE = SAFE_PRINCIPAL;
        const accruedInt = co[m].cumulativeAccruedInterest;
        const identity = cumSAFE + accruedInt + cumNI;
        expect(co[m].endingCash).toBeCloseTo(identity, 0);
      }
    });

    it("month 11 ending cash = SAFE + 12×(EBITDA − tax)", () => {
      const monthlyCashBeforeSAFE = H_NI_WITH_INTEREST + H_MONTHLY_INTEREST;
      const expected = SAFE_PRINCIPAL + 12 * monthlyCashBeforeSAFE;
      expect(co[11].endingCash).toBeCloseTo(expected, 0);
    });
  });

  describe("Mode 2: quarterly — interest paid every 3 months", () => {
    const g = makeGlobal({ fundingInterestPaymentFrequency: 'quarterly' });
    const co = generateCompanyProForma([PROPERTY], g, MONTHS);

    it("interest expense is identical to accrues_only (accrual ≠ payment)", () => {
      for (let m = 0; m < MONTHS; m++) {
        expect(co[m].fundingInterestExpense).toBeCloseTo(H_MONTHLY_INTEREST, PENNY);
      }
    });

    it("interest payments occur at months 2, 5, 8, 11 only", () => {
      const qtrPayment = 3 * H_MONTHLY_INTEREST;
      for (let m = 0; m < MONTHS; m++) {
        if ((m + 1) % 3 === 0) {
          expect(co[m].fundingInterestPayment).toBeCloseTo(qtrPayment, PENNY);
        } else {
          expect(co[m].fundingInterestPayment).toBe(0);
        }
      }
    });

    it("accrued interest resets to 0 after each quarterly payment", () => {
      for (let m = 0; m < MONTHS; m++) {
        if ((m + 1) % 3 === 0) {
          expect(co[m].cumulativeAccruedInterest).toBeCloseTo(0, PENNY);
        } else {
          const monthsIntoQuarter = (m % 3) + 1;
          expect(co[m].cumulativeAccruedInterest).toBeCloseTo(
            monthsIntoQuarter * H_MONTHLY_INTEREST, PENNY
          );
        }
      }
    });

    it("non-payment months: cashFlow = NI + interest_addback (no payment deduction)", () => {
      for (let m = 1; m < MONTHS; m++) {
        if ((m + 1) % 3 !== 0) {
          expect(co[m].cashFlow).toBeCloseTo(
            H_NI_WITH_INTEREST + H_MONTHLY_INTEREST, PENNY
          );
        }
      }
    });

    it("payment months: cashFlow = NI + interest_addback - 3×interest", () => {
      const qtrPayment = 3 * H_MONTHLY_INTEREST;
      for (let m = 0; m < MONTHS; m++) {
        if ((m + 1) % 3 === 0) {
          expect(co[m].cashFlow).toBeCloseTo(
            H_NI_WITH_INTEREST + H_MONTHLY_INTEREST - qtrPayment, PENNY
          );
        }
      }
    });

    it("year-end accrued interest = 0 (month 11 is a payment month)", () => {
      expect(co[11].cumulativeAccruedInterest).toBeCloseTo(0, PENNY);
    });

    it("BS identity holds every month", () => {
      let cumNI = 0;
      for (let m = 0; m < MONTHS; m++) {
        cumNI += co[m].netIncome;
        const identity = SAFE_PRINCIPAL + co[m].cumulativeAccruedInterest + cumNI;
        expect(co[m].endingCash).toBeCloseTo(identity, 0);
      }
    });

    it("quarterly cash is lower than accrues_only due to interest payments", () => {
      const gAccrues = makeGlobal({ fundingInterestPaymentFrequency: 'accrues_only' });
      const coAccrues = generateCompanyProForma([PROPERTY], gAccrues, MONTHS);
      expect(co[11].endingCash).toBeLessThan(coAccrues[11].endingCash);
      const totalPaid = 4 * 3 * H_MONTHLY_INTEREST;
      expect(coAccrues[11].endingCash - co[11].endingCash).toBeCloseTo(totalPaid, 0);
    });
  });

  describe("Mode 3: annually — interest paid every 12 months", () => {
    const g = makeGlobal({ fundingInterestPaymentFrequency: 'annually' });
    const co = generateCompanyProForma([PROPERTY], g, MONTHS);

    it("no payments for months 0-10, full year payment at month 11", () => {
      const annualPayment = 12 * H_MONTHLY_INTEREST;
      for (let m = 0; m < 11; m++) {
        expect(co[m].fundingInterestPayment).toBe(0);
      }
      expect(co[11].fundingInterestPayment).toBeCloseTo(annualPayment, PENNY);
    });

    it("accrued interest builds to 12 months then resets", () => {
      for (let m = 0; m < 11; m++) {
        expect(co[m].cumulativeAccruedInterest).toBeCloseTo(
          (m + 1) * H_MONTHLY_INTEREST, PENNY
        );
      }
      expect(co[11].cumulativeAccruedInterest).toBeCloseTo(0, PENNY);
    });

    it("month 11 cash flow = NI + interest_addback - 12×interest", () => {
      const annualPayment = 12 * H_MONTHLY_INTEREST;
      expect(co[11].cashFlow).toBeCloseTo(
        H_NI_WITH_INTEREST + H_MONTHLY_INTEREST - annualPayment, PENNY
      );
    });

    it("year-end ending cash = quarterly year-end ending cash (same total paid)", () => {
      const gQ = makeGlobal({ fundingInterestPaymentFrequency: 'quarterly' });
      const coQ = generateCompanyProForma([PROPERTY], gQ, MONTHS);
      expect(co[11].endingCash).toBeCloseTo(coQ[11].endingCash, 0);
    });

    it("BS identity holds every month", () => {
      let cumNI = 0;
      for (let m = 0; m < MONTHS; m++) {
        cumNI += co[m].netIncome;
        const identity = SAFE_PRINCIPAL + co[m].cumulativeAccruedInterest + cumNI;
        expect(co[m].endingCash).toBeCloseTo(identity, 0);
      }
    });
  });

  describe("Two-tranche scenario: $500K at m0 + $300K at m6, quarterly payments", () => {
    const g = makeGlobal({
      capitalRaise1Amount: 500_000,
      capitalRaise2Date: "2026-07-01",
      capitalRaise2Amount: 300_000,
      fundingInterestPaymentFrequency: 'quarterly',
    });
    const co = generateCompanyProForma([PROPERTY], g, MONTHS);

    const INT_PHASE1 = 500_000 * 0.08 / 12;
    const INT_PHASE2 = 800_000 * 0.08 / 12;

    it("SAFE funding: $500K at month 0, $300K at month 6", () => {
      expect(co[0].capitalRaiseFunding1).toBe(500_000);
      expect(co[0].capitalRaiseFunding2).toBe(0);
      expect(co[0].capitalRaiseFunding).toBe(500_000);
      expect(co[6].capitalRaiseFunding1).toBe(0);
      expect(co[6].capitalRaiseFunding2).toBe(300_000);
      expect(co[6].capitalRaiseFunding).toBe(300_000);
      for (let m = 0; m < MONTHS; m++) {
        if (m !== 0 && m !== 6) {
          expect(co[m].capitalRaiseFunding).toBe(0);
        }
      }
    });

    it("interest expense steps up after tranche 2 arrives", () => {
      for (let m = 0; m < 6; m++) {
        expect(co[m].fundingInterestExpense).toBeCloseTo(INT_PHASE1, PENNY);
      }
      for (let m = 6; m < MONTHS; m++) {
        expect(co[m].fundingInterestExpense).toBeCloseTo(INT_PHASE2, PENNY);
      }
    });

    it("quarterly payments reflect mixed interest amounts", () => {
      expect(co[2].fundingInterestPayment).toBeCloseTo(3 * INT_PHASE1, PENNY);
      expect(co[5].fundingInterestPayment).toBeCloseTo(3 * INT_PHASE1, PENNY);
      expect(co[8].fundingInterestPayment).toBeCloseTo(3 * INT_PHASE2, PENNY);
      expect(co[11].fundingInterestPayment).toBeCloseTo(3 * INT_PHASE2, PENNY);
    });

    it("BS identity holds: Cash = SAFE_total + AccruedInterest + cumNI", () => {
      let cumNI = 0;
      let cumSAFE = 0;
      for (let m = 0; m < MONTHS; m++) {
        cumNI += co[m].netIncome;
        cumSAFE += co[m].capitalRaiseFunding;
        const identity = cumSAFE + co[m].cumulativeAccruedInterest + cumNI;
        expect(co[m].endingCash).toBeCloseTo(identity, PENNY);
      }
    });

    it("pre-tax income changes when interest steps up", () => {
      const ebitda = co[0].totalRevenue - co[0].totalExpenses;
      expect(co[0].preTaxIncome).toBeCloseTo(ebitda - INT_PHASE1, PENNY);
      expect(co[6].preTaxIncome).toBeCloseTo(ebitda - INT_PHASE2, PENNY);
    });
  });

  describe("Export data generators: Income Statement", () => {
    const g = makeGlobal({ fundingInterestPaymentFrequency: 'quarterly' });
    const co = generateCompanyProForma([PROPERTY], g, MONTHS);
    const propF = generatePropertyProForma(PROPERTY, g, MONTHS);
    const years = [2026];
    const isData = generateCompanyIncomeData(co, years, [PROPERTY], [{ financials: propF }]);

    it("contains EBITDA row when interest is active", () => {
      const ebitdaRow = isData.rows.find(r => r.category.includes("EBITDA"));
      expect(ebitdaRow).toBeDefined();
      expect(ebitdaRow!.values[0]).toBeCloseTo(12 * H_EBITDA, PENNY);
    });

    it("contains Interest Expense row (negative)", () => {
      const intRow = isData.rows.find(r => r.category === "Interest Expense");
      expect(intRow).toBeDefined();
      expect(intRow!.values[0]).toBeCloseTo(-12 * H_MONTHLY_INTEREST, PENNY);
    });

    it("contains Pre-Tax Income row", () => {
      const ptRow = isData.rows.find(r => r.category === "Pre-Tax Income");
      expect(ptRow).toBeDefined();
      expect(ptRow!.values[0]).toBeCloseTo(12 * H_PRETAX_WITH_INTEREST, PENNY);
    });

    it("contains Tax row", () => {
      const taxRow = isData.rows.find(r => r.category === "Tax");
      expect(taxRow).toBeDefined();
      expect(taxRow!.values[0]).toBeCloseTo(-12 * H_TAX_WITH_INTEREST, PENNY);
    });

    it("Net Income row = 12 × monthly NI", () => {
      const niRow = isData.rows.find(r => r.category === "Net Income");
      expect(niRow).toBeDefined();
      expect(niRow!.values[0]).toBeCloseTo(12 * H_NI_WITH_INTEREST, PENNY);
    });

    it("no EBITDA row when interest rate is 0", () => {
      const g0 = makeGlobal({ fundingInterestRate: 0 });
      const co0 = generateCompanyProForma([PROPERTY], g0, MONTHS);
      const is0 = generateCompanyIncomeData(co0, years, [PROPERTY], [{ financials: propF }]);
      expect(is0.rows.find(r => r.category.includes("EBITDA"))).toBeUndefined();
      expect(is0.rows.find(r => r.category === "Interest Expense")).toBeUndefined();
    });
  });

  describe("Export data generators: Cash Flow Statement", () => {
    const g = makeGlobal({ fundingInterestPaymentFrequency: 'quarterly' });
    const co = generateCompanyProForma([PROPERTY], g, MONTHS);
    const propF = generatePropertyProForma(PROPERTY, g, MONTHS);
    const years = [2026];
    const cfData = generateCompanyCashFlowData(co, years, [PROPERTY], [{ financials: propF }], "SAFE");

    it("has 'Add Back: Interest Expense' row in operating activities", () => {
      const addbackRow = cfData.rows.find(r => r.category === "Add Back: Interest Expense");
      expect(addbackRow).toBeDefined();
      expect(addbackRow!.values[0]).toBeCloseTo(12 * H_MONTHLY_INTEREST, PENNY);
    });

    it("Net Cash from Operating Activities = NI + interest addback", () => {
      const opRow = cfData.rows.find(r => r.category === "Net Cash from Operating Activities");
      expect(opRow).toBeDefined();
      expect(opRow!.values[0]).toBeCloseTo(
        12 * (H_NI_WITH_INTEREST + H_MONTHLY_INTEREST), PENNY
      );
    });

    it("has 'Interest Paid on Notes' row in financing activities", () => {
      const paidRow = cfData.rows.find(r => r.category === "Interest Paid on Notes");
      expect(paidRow).toBeDefined();
      expect(paidRow!.values[0]).toBeCloseTo(-12 * H_MONTHLY_INTEREST, PENNY);
    });

    it("Net Cash from Financing = SAFE - interest paid", () => {
      const finRow = cfData.rows.find(r => r.category === "Net Cash from Financing Activities");
      expect(finRow).toBeDefined();
      expect(finRow!.values[0]).toBeCloseTo(
        SAFE_PRINCIPAL - 12 * H_MONTHLY_INTEREST, PENNY
      );
    });

    it("Closing Cash uses m.cashFlow, matches engine ending cash", () => {
      const closingRow = cfData.rows.find(r => r.category === "Closing Cash Balance");
      expect(closingRow).toBeDefined();
      expect(closingRow!.values[0]).toBeCloseTo(co[11].endingCash, PENNY);
    });

    it("Net Increase in Cash = operating + financing", () => {
      const netRow = cfData.rows.find(r => r.category === "Net Increase (Decrease) in Cash");
      expect(netRow).toBeDefined();
      const opRow = cfData.rows.find(r => r.category === "Net Cash from Operating Activities");
      const finRow = cfData.rows.find(r => r.category === "Net Cash from Financing Activities");
      expect(netRow!.values[0]).toBeCloseTo(
        opRow!.values[0] + finRow!.values[0], PENNY
      );
    });

    it("no interest rows when rate is 0", () => {
      const g0 = makeGlobal({ fundingInterestRate: 0 });
      const co0 = generateCompanyProForma([PROPERTY], g0, MONTHS);
      const cf0 = generateCompanyCashFlowData(co0, years, [PROPERTY], [{ financials: propF }], "SAFE");
      expect(cf0.rows.find(r => r.category === "Add Back: Interest Expense")).toBeUndefined();
      expect(cf0.rows.find(r => r.category === "Interest Paid on Notes")).toBeUndefined();
    });
  });

  describe("Export data generators: Balance Sheet", () => {
    const g = makeGlobal({ fundingInterestPaymentFrequency: 'accrues_only' });
    const co = generateCompanyProForma([PROPERTY], g, MONTHS);
    const years = [2026];
    const bsData = generateCompanyBalanceData(co, years, "SAFE");

    it("Cash = engine ending cash (uses m.cashFlow)", () => {
      const cashRow = bsData.rows.find(r => r.category === "Cash & Cash Equivalents");
      expect(cashRow).toBeDefined();
      expect(cashRow!.values[0]).toBeCloseTo(co[11].endingCash, PENNY);
    });

    it("has 'Accrued Interest on Notes' liability when interest accrues", () => {
      const accRow = bsData.rows.find(r => r.category === "Accrued Interest on Notes");
      expect(accRow).toBeDefined();
      expect(accRow!.values[0]).toBeCloseTo(12 * H_MONTHLY_INTEREST, PENNY);
    });

    it("TOTAL LIABILITIES = SAFE + accrued interest", () => {
      const tlRow = bsData.rows.find(r => r.category === "TOTAL LIABILITIES");
      expect(tlRow).toBeDefined();
      expect(tlRow!.values[0]).toBeCloseTo(SAFE_PRINCIPAL + 12 * H_MONTHLY_INTEREST, PENNY);
    });

    it("Retained Earnings = cumulative net income", () => {
      const reRow = bsData.rows.find(r => r.category === "Retained Earnings");
      expect(reRow).toBeDefined();
      expect(reRow!.values[0]).toBeCloseTo(12 * H_NI_WITH_INTEREST, PENNY);
    });

    it("A = L + E identity in export data", () => {
      const totalAssets = bsData.rows.find(r => r.category === "TOTAL ASSETS");
      const totalLE = bsData.rows.find(r => r.category === "TOTAL LIABILITIES & EQUITY");
      expect(totalAssets).toBeDefined();
      expect(totalLE).toBeDefined();
      expect(totalAssets!.values[0]).toBeCloseTo(totalLE!.values[0], PENNY);
    });

    it("no accrued interest row when interest rate is 0", () => {
      const g0 = makeGlobal({ fundingInterestRate: 0 });
      const co0 = generateCompanyProForma([PROPERTY], g0, MONTHS);
      const bs0 = generateCompanyBalanceData(co0, years, "SAFE");
      expect(bs0.rows.find(r => r.category === "Accrued Interest on Notes")).toBeUndefined();
    });

    it("no accrued interest row when quarterly and year ends on payment month", () => {
      const gQ = makeGlobal({ fundingInterestPaymentFrequency: 'quarterly' });
      const coQ = generateCompanyProForma([PROPERTY], gQ, MONTHS);
      const bsQ = generateCompanyBalanceData(coQ, years, "SAFE");
      const accRow = bsQ.rows.find(r => r.category === "Accrued Interest on Notes");
      expect(accRow).toBeUndefined();
    });
  });

  describe("Cash flow identity: Operating + Financing = Net Cash", () => {
    const modes = ['accrues_only', 'quarterly', 'annually'] as const;
    for (const mode of modes) {
      it(`${mode}: monthly cashFlow = NI + interest_addback + SAFE - payment`, () => {
        const g = makeGlobal({ fundingInterestPaymentFrequency: mode });
        const co = generateCompanyProForma([PROPERTY], g, MONTHS);
        for (let m = 0; m < MONTHS; m++) {
          const expected = co[m].netIncome + co[m].fundingInterestExpense +
            co[m].capitalRaiseFunding - co[m].fundingInterestPayment;
          expect(co[m].cashFlow).toBeCloseTo(expected, PENNY);
        }
      });
    }
  });

  describe("Net income consistency across payment modes", () => {
    it("net income is identical regardless of payment frequency", () => {
      const modes = ['accrues_only', 'quarterly', 'annually'] as const;
      const results = modes.map(mode => {
        const g = makeGlobal({ fundingInterestPaymentFrequency: mode });
        return generateCompanyProForma([PROPERTY], g, MONTHS);
      });
      for (let m = 0; m < MONTHS; m++) {
        expect(results[0][m].netIncome).toBeCloseTo(results[1][m].netIncome, PENNY);
        expect(results[1][m].netIncome).toBeCloseTo(results[2][m].netIncome, PENNY);
      }
    });

    it("interest expense is identical regardless of payment frequency", () => {
      const modes = ['accrues_only', 'quarterly', 'annually'] as const;
      const results = modes.map(mode => {
        const g = makeGlobal({ fundingInterestPaymentFrequency: mode });
        return generateCompanyProForma([PROPERTY], g, MONTHS);
      });
      for (let m = 0; m < MONTHS; m++) {
        expect(results[0][m].fundingInterestExpense).toBeCloseTo(results[1][m].fundingInterestExpense, PENNY);
        expect(results[1][m].fundingInterestExpense).toBeCloseTo(results[2][m].fundingInterestExpense, PENNY);
      }
    });
  });

  describe("Year-end cash equivalence: quarterly vs annually", () => {
    it("same total interest paid over 12 months → same ending cash", () => {
      const gQ = makeGlobal({ fundingInterestPaymentFrequency: 'quarterly' });
      const gA = makeGlobal({ fundingInterestPaymentFrequency: 'annually' });
      const coQ = generateCompanyProForma([PROPERTY], gQ, MONTHS);
      const coA = generateCompanyProForma([PROPERTY], gA, MONTHS);

      const totalPaidQ = coQ.reduce((s, m) => s + m.fundingInterestPayment, 0);
      const totalPaidA = coA.reduce((s, m) => s + m.fundingInterestPayment, 0);
      expect(totalPaidQ).toBeCloseTo(totalPaidA, PENNY);
      expect(coQ[11].endingCash).toBeCloseTo(coA[11].endingCash, PENNY);
    });

    it("accrues_only ending cash is higher by total interest paid", () => {
      const gAccrues = makeGlobal({ fundingInterestPaymentFrequency: 'accrues_only' });
      const gQ = makeGlobal({ fundingInterestPaymentFrequency: 'quarterly' });
      const coAccrues = generateCompanyProForma([PROPERTY], gAccrues, MONTHS);
      const coQ = generateCompanyProForma([PROPERTY], gQ, MONTHS);

      const totalPaid = coQ.reduce((s, m) => s + m.fundingInterestPayment, 0);
      expect(totalPaid).toBeCloseTo(12 * H_MONTHLY_INTEREST, PENNY);
      expect(coAccrues[11].endingCash - coQ[11].endingCash).toBeCloseTo(totalPaid, PENNY);
    });
  });

  describe("Edge: zero interest rate produces zero interest fields", () => {
    const g = makeGlobal({ fundingInterestRate: 0 });
    const co = generateCompanyProForma([PROPERTY], g, MONTHS);

    it("all interest fields are zero", () => {
      for (let m = 0; m < MONTHS; m++) {
        expect(co[m].fundingInterestExpense).toBe(0);
        expect(co[m].fundingInterestPayment).toBe(0);
        expect(co[m].cumulativeAccruedInterest).toBe(0);
      }
    });

    it("preTaxIncome = EBITDA (no interest deduction)", () => {
      for (let m = 0; m < MONTHS; m++) {
        const ebitda = co[m].totalRevenue - co[m].totalExpenses;
        expect(co[m].preTaxIncome).toBeCloseTo(ebitda, PENNY);
      }
    });

    it("cashFlow = netIncome + SAFE (no interest addback or payment)", () => {
      expect(co[0].cashFlow).toBeCloseTo(co[0].netIncome + SAFE_PRINCIPAL, PENNY);
      for (let m = 1; m < MONTHS; m++) {
        expect(co[m].cashFlow).toBeCloseTo(co[m].netIncome, PENNY);
      }
    });
  });

  describe("Edge: very high interest rate (50%) — company goes cashShortfall", () => {
    const g = makeGlobal({ fundingInterestRate: 0.50, fundingInterestPaymentFrequency: 'quarterly' });
    const co = generateCompanyProForma([PROPERTY], g, MONTHS);

    it("monthly interest = $800K × 50% / 12 ≈ $33,333.33", () => {
      expect(co[0].fundingInterestExpense).toBeCloseTo(800_000 * 0.50 / 12, PENNY);
    });

    it("pre-tax income is negative (interest > EBITDA)", () => {
      for (let m = 0; m < MONTHS; m++) {
        expect(co[m].preTaxIncome).toBeLessThan(0);
      }
    });

    it("tax is zero when pre-tax is negative", () => {
      for (let m = 0; m < MONTHS; m++) {
        expect(co[m].companyIncomeTax).toBe(0);
      }
    });

    it("company eventually runs out of cash", () => {
      const shortfallMonths = co.filter(m => m.cashShortfall);
      expect(shortfallMonths.length).toBeGreaterThan(0);
    });

    it("BS identity still holds even with negative cash", () => {
      let cumNI = 0;
      let cumSAFE = 0;
      for (let m = 0; m < MONTHS; m++) {
        cumNI += co[m].netIncome;
        cumSAFE += co[m].capitalRaiseFunding;
        const identity = cumSAFE + co[m].cumulativeAccruedInterest + cumNI;
        expect(co[m].endingCash).toBeCloseTo(identity, PENNY);
      }
    });
  });

  describe("Months of runway: burn rate includes interest payments", () => {
    it("quarterly: burn rate = (expenses + interest paid) / 12", () => {
      const g = makeGlobal({ fundingInterestPaymentFrequency: 'quarterly' });
      const co = generateCompanyProForma([PROPERTY], g, MONTHS);
      const annualExpenses = co.reduce((s, m) => s + m.totalExpenses, 0);
      const annualInterestPaid = co.reduce((s, m) => s + m.fundingInterestPayment, 0);
      const burnWithInterest = (annualExpenses + annualInterestPaid) / 12;
      const burnWithoutInterest = annualExpenses / 12;
      expect(annualInterestPaid).toBeCloseTo(12 * H_MONTHLY_INTEREST, PENNY);
      expect(burnWithInterest).toBeGreaterThan(burnWithoutInterest);
      const monthsOfRunway = co[11].endingCash / burnWithInterest;
      const monthsWithoutInterest = co[11].endingCash / burnWithoutInterest;
      expect(monthsOfRunway).toBeLessThan(monthsWithoutInterest);
    });

    it("accrues_only: burn rate = expenses only (no interest payments)", () => {
      const g = makeGlobal({ fundingInterestPaymentFrequency: 'accrues_only' });
      const co = generateCompanyProForma([PROPERTY], g, MONTHS);
      const annualInterestPaid = co.reduce((s, m) => s + m.fundingInterestPayment, 0);
      expect(annualInterestPaid).toBe(0);
    });
  });

  describe("Fixed numeric anchors (independent of imported constants)", () => {
    const g = makeGlobal({ fundingInterestPaymentFrequency: 'quarterly' });
    const co = generateCompanyProForma([PROPERTY], g, MONTHS);

    it("monthly interest = $5,333.33 (= $800,000 × 8% ÷ 12)", () => {
      expect(co[0].fundingInterestExpense).toBeCloseTo(5333.33, PENNY);
    });

    it("quarterly interest payment = $16,000.00 (= 3 × $5,333.33)", () => {
      expect(co[2].fundingInterestPayment).toBeCloseTo(16000.00, PENNY);
    });

    it("annual total interest expense = $64,000.00 (= $800,000 × 8%)", () => {
      const annualInterest = co.reduce((s, m) => s + m.fundingInterestExpense, 0);
      expect(annualInterest).toBeCloseTo(64000.00, PENNY);
    });

    it("annual total interest paid = $64,000.00 (4 quarterly payments)", () => {
      const annualPaid = co.reduce((s, m) => s + m.fundingInterestPayment, 0);
      expect(annualPaid).toBeCloseTo(64000.00, PENNY);
    });

    it("partner comp = $45,000/mo (= $540,000 ÷ 12)", () => {
      expect(co[0].partnerCompensation).toBeCloseTo(45000.00, PENNY);
    });

    it("staff comp = $15,625/mo (= 2.5 FTE × $75,000 ÷ 12)", () => {
      expect(co[0].staffCompensation).toBeCloseTo(15625.00, PENNY);
    });

    it("SAFE arrives at month 0 = $800,000 exactly", () => {
      expect(co[0].capitalRaiseFunding).toBe(800000);
      expect(co[1].capitalRaiseFunding).toBe(0);
    });

    it("year-end accrued interest = $0.00 (quarterly, month 11 is a payment month)", () => {
      expect(co[11].cumulativeAccruedInterest).toBeCloseTo(0, PENNY);
    });

    it("ending cash is positive at year-end (SAFE sustains operations)", () => {
      expect(co[11].endingCash).toBeGreaterThan(0);
    });

    it("total revenue = total base fees + total incentive fees", () => {
      for (let m = 0; m < MONTHS; m++) {
        expect(co[m].totalRevenue).toBeCloseTo(
          co[m].baseFeeRevenue + co[m].incentiveFeeRevenue, PENNY
        );
      }
    });
  });

  describe("Exact hand-calculated values (accountant verification)", () => {
    it("monthly interest = $5,333.333...", () => {
      expect(H_MONTHLY_INTEREST).toBeCloseTo(5333.333333, PENNY);
    });

    it("EBITDA is negative (small 1-property company)", () => {
      expect(H_EBITDA).toBeLessThan(0);
    });

    it("pre-tax with interest is more negative than without", () => {
      expect(H_PRETAX_WITH_INTEREST).toBeLessThan(H_PRETAX_NO_INTEREST);
      expect(H_PRETAX_WITH_INTEREST).toBeCloseTo(H_PRETAX_NO_INTEREST - H_MONTHLY_INTEREST, PENNY);
    });

    it("tax on negative pre-tax = 0", () => {
      if (H_PRETAX_WITH_INTEREST < 0) {
        expect(H_TAX_WITH_INTEREST).toBe(0);
      }
    });

    it("cash flow identity: CF = NI + interest + SAFE - payment (algebraically)", () => {
      const cf_accrues = H_NI_WITH_INTEREST + H_MONTHLY_INTEREST;
      const cf_qtr_nonpay = H_NI_WITH_INTEREST + H_MONTHLY_INTEREST;
      const cf_qtr_pay = H_NI_WITH_INTEREST + H_MONTHLY_INTEREST - 3 * H_MONTHLY_INTEREST;
      expect(cf_accrues).toBeCloseTo(cf_qtr_nonpay, PENNY);
      expect(cf_qtr_pay).toBeCloseTo(cf_accrues - 3 * H_MONTHLY_INTEREST, PENNY);
    });
  });
});
