import { describe, it, expect } from "vitest";
import { generatePropertyProForma } from "../../client/src/lib/financialEngine.js";
import { baseProperty, makeGlobal } from "../fixtures";
import { DEPRECIATION_YEARS } from "../../shared/constants.js";

/**
 * Golden-scenario test for generatePropertyProForma().
 *
 * Uses a minimal Full Equity property with known inputs.
 * All expected values are hand-calculated below.
 *
 * Property:
 *   10 rooms, $200 ADR, 60% start occupancy, 80% max occupancy
 *   Ramp: +5% every 6 months, ADR growth 3%/yr
 *   Full Equity (no debt), purchase $1M, improvements $0
 *   Land 25%, so depreciable basis = $750K
 *   All cost rates at defaults, ops start = model start = 2026-04-01
 *
 * Month 0 (first operational month) hand-calc:
 *   Available rooms = 10 × 30.5 = 305
 *   Sold rooms = 305 × 0.60 = 183
 *   Room Revenue = 183 × $200 = $36,600
 *
 *   New revenue model (% of total revenue):
 *   ancillaryShare = 0.43 + 0.22 + 0.07 = 0.72
 *   roomShareOfTotal = max(0.05, 1 - 0.72) = 0.28
 *   Total Revenue = $36,600 / 0.28 = $130,714.2857...
 *   Event Revenue = $130,714.2857 × 0.43 = $56,207.1429...
 *   F&B Revenue = $130,714.2857 × 0.22 = $28,757.1429...
 *   Other Revenue = $130,714.2857 × 0.07 = $9,150.00
 *   (Catering boost is NOT applied to revenue — deprecated)
 *
 *   Depreciation = $750,000 / DEPRECIATION_YEARS / 12 = $2,272.727...
 *   Debt = $0 (Full Equity)
 */

const property = baseProperty;
const global = makeGlobal({ projectionYears: 1 });

// Hand-calculated constants (new "% of total revenue" model)
const DAYS = 30.5;
const rooms = 10;
const adr = 200;
const occ = 0.60;
const availableRooms = rooms * DAYS; // 305
const soldRooms = availableRooms * occ; // 183
const roomRev = soldRooms * adr; // 36,600
const ancillaryShare = 0.43 + 0.22 + 0.07; // 0.72
const roomShareOfTotal = Math.max(0.05, 1 - ancillaryShare); // 0.28
const totalRev = roomRev / roomShareOfTotal;
const eventRev = totalRev * 0.43;
const fbRev = totalRev * 0.22; // catering boost NOT applied to revenue
const otherRev = totalRev * 0.07;

const depreciableBasis = 1_000_000 * 0.75; // 750,000
const monthlyDep = depreciableBasis / DEPRECIATION_YEARS / 12;

describe("generatePropertyProForma — golden scenario (Full Equity)", () => {
  const result = generatePropertyProForma(property, global, 12);

  it("produces 12 months of data", () => {
    expect(result).toHaveLength(12);
  });

  describe("Month 0 — first operational month", () => {
    const m0 = result[0];

    it("occupancy starts at 60%", () => {
      expect(m0.occupancy).toBeCloseTo(0.60, 4);
    });

    it("ADR = $200", () => {
      expect(m0.adr).toBeCloseTo(200, 2);
    });

    it("available rooms = 305", () => {
      expect(m0.availableRooms).toBeCloseTo(availableRooms, 2);
    });

    it("sold rooms = 183", () => {
      expect(m0.soldRooms).toBeCloseTo(soldRooms, 2);
    });

    it("room revenue = $36,600", () => {
      expect(m0.revenueRooms).toBeCloseTo(roomRev, 2);
    });

    it("event revenue = totalRev × 0.43", () => {
      expect(m0.revenueEvents).toBeCloseTo(eventRev, 2);
    });

    it("F&B revenue = totalRev × 0.22 (no catering boost)", () => {
      expect(m0.revenueFB).toBeCloseTo(fbRev, 2);
    });

    it("other revenue = totalRev × 0.07", () => {
      expect(m0.revenueOther).toBeCloseTo(otherRev, 2);
    });

    it("total revenue = sum of all streams", () => {
      expect(m0.revenueTotal).toBeCloseTo(totalRev, 2);
    });

    it("depreciation = $750K / DEPRECIATION_YEARS / 12", () => {
      expect(m0.depreciationExpense).toBeCloseTo(monthlyDep, 2);
    });

    it("no debt (Full Equity)", () => {
      expect(m0.interestExpense).toBe(0);
      expect(m0.principalPayment).toBe(0);
      expect(m0.debtPayment).toBe(0);
      expect(m0.debtOutstanding).toBe(0);
    });

    it("Net Income = NOI - Depreciation - Tax (no interest)", () => {
      const taxableIncome = m0.anoi - m0.depreciationExpense;
      const expectedTax = taxableIncome > 0 ? taxableIncome * 0.25 : 0;
      const expectedNI = m0.anoi - m0.depreciationExpense - expectedTax;
      expect(m0.netIncome).toBeCloseTo(expectedNI, 2);
    });

    it("principal is NOT in net income (ASC 470)", () => {
      // Net income should NOT include any principal component
      // For Full Equity, both are 0 — but verify the relationship
      expect(m0.netIncome).toBeCloseTo(
        m0.anoi - m0.interestExpense - m0.depreciationExpense - m0.incomeTax,
        2
      );
    });

    it("operating cash flow = NI + depreciation (ASC 230)", () => {
      expect(m0.operatingCashFlow).toBeCloseTo(
        m0.netIncome + m0.depreciationExpense,
        2
      );
    });

    it("financing cash flow = -principal", () => {
      expect(m0.financingCashFlow).toBeCloseTo(-m0.principalPayment, 2);
    });
  });

  describe("occupancy ramp", () => {
    it("months 0-5 at 60% (before first ramp step)", () => {
      for (let i = 0; i < 6; i++) {
        expect(result[i].occupancy).toBeCloseTo(0.60, 4);
      }
    });

    it("months 6-11 at 65% (after first ramp step)", () => {
      for (let i = 6; i < 12; i++) {
        expect(result[i].occupancy).toBeCloseTo(0.65, 4);
      }
    });
  });

  describe("balance sheet invariants (every month)", () => {
    it("property value = land + building - accumulated depreciation", () => {
      const landValue = 1_000_000 * 0.25;
      for (let i = 0; i < 12; i++) {
        const accDep = monthlyDep * (i + 1);
        const expected = landValue + depreciableBasis - accDep;
        expect(result[i].propertyValue).toBeCloseTo(expected, 0);
      }
    });
  });

  describe("cash flow consistency (every month)", () => {
    it("cashFlow = NOI - debtPayment - incomeTax", () => {
      for (const m of result) {
        expect(m.cashFlow).toBeCloseTo(m.anoi - m.debtPayment - m.incomeTax, 2);
      }
    });

    it("endingCash = cumulative cashFlow", () => {
      let cumCash = 0;
      for (const m of result) {
        cumCash += m.cashFlow;
        expect(m.endingCash).toBeCloseTo(cumCash, 2);
      }
    });

    it("no negative cash for profitable Full Equity property", () => {
      for (const m of result) {
        expect(m.cashShortfall).toBe(false);
      }
    });
  });

  describe("revenue only after operations start", () => {
    it("pre-ops months have zero revenue", () => {
      // Ops start = model start, so all months should have revenue
      // Test with a delayed property instead
      const delayedProp = { ...property, operationsStartDate: "2026-07-01" };
      const delayed = generatePropertyProForma(delayedProp, global, 12);

      // First 3 months (Apr, May, Jun) should have zero revenue
      for (let i = 0; i < 3; i++) {
        expect(delayed[i].revenueTotal).toBe(0);
        expect(delayed[i].occupancy).toBe(0);
      }
      // Month 3 (Jul) should have revenue
      expect(delayed[3].revenueTotal).toBeGreaterThan(0);
    });
  });
});

describe("generatePropertyProForma — golden scenario (Financed)", () => {
  const financedProp = {
    ...property,
    type: "Financed",
    acquisitionLTV: 0.75,
    acquisitionInterestRate: 0.09,
    acquisitionTermYears: 25,
  };

  const result = generatePropertyProForma(financedProp, global, 12);

  // Loan: $1M × 75% = $750K, rate 9%/12 = 0.75%/month, 300 payments
  const loanAmount = 1_000_000 * 0.75;
  const monthlyRate = 0.09 / 12;
  const numPayments = 25 * 12;
  const expectedPMT =
    (loanAmount * monthlyRate * Math.pow(1 + monthlyRate, numPayments)) /
    (Math.pow(1 + monthlyRate, numPayments) - 1);

  it("has positive debt outstanding", () => {
    expect(result[0].debtOutstanding).toBeGreaterThan(0);
    expect(result[0].debtOutstanding).toBeLessThanOrEqual(loanAmount);
  });

  it("debt service = PMT", () => {
    expect(result[0].debtPayment).toBeCloseTo(expectedPMT, 2);
  });

  it("interest + principal = PMT", () => {
    for (const m of result) {
      expect(m.interestExpense + m.principalPayment).toBeCloseTo(m.debtPayment, 2);
    }
  });

  it("interest decreases over time (amortization)", () => {
    expect(result[11].interestExpense).toBeLessThan(result[0].interestExpense);
  });

  it("principal increases over time (amortization)", () => {
    expect(result[11].principalPayment).toBeGreaterThan(result[0].principalPayment);
  });

  it("Net Income excludes principal (ASC 470)", () => {
    for (const m of result) {
      expect(m.netIncome).toBeCloseTo(
        m.anoi - m.interestExpense - m.depreciationExpense - m.incomeTax,
        2
      );
    }
  });

  it("first month interest = loanAmount × monthlyRate", () => {
    expect(result[0].interestExpense).toBeCloseTo(loanAmount * monthlyRate, 2);
  });

  it("debt outstanding decreases each month", () => {
    for (let i = 1; i < 12; i++) {
      expect(result[i].debtOutstanding).toBeLessThan(result[i - 1].debtOutstanding);
    }
  });
});
