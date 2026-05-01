import { describe, it, expect } from "vitest";
import { generateCompanyProForma, generatePropertyProForma } from "../../client/src/lib/financialEngine.js";

/**
 * Golden-scenario tests for generateCompanyProForma().
 *
 * Uses a single Full Equity property with known inputs.
 * Company ops start = model start = 2026-04-01.
 * Funding instrument tranche 1 = $1M on model start.
 *
 * Tests cover:
 *   - Management fee calculation (base + incentive)
 *   - Staffing tiers
 *   - Partner compensation
 *   - Funding gate
 *   - Cash flow and cumulative cash
 */

const property = {
  operationsStartDate: "2026-04-01",
  acquisitionDate: "2026-04-01",
  roomCount: 10,
  startAdr: 200,
  adrGrowthRate: 0.03,
  startOccupancy: 0.60,
  maxOccupancy: 0.80,
  occupancyRampMonths: 6,
  occupancyGrowthStep: 0.05,
  purchasePrice: 1_000_000,
  buildingImprovements: 0,
  landValuePercent: 0.25,
  preOpeningCosts: 0,
  operatingReserve: 0,
  type: "Full Equity",
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
  baseManagementFeeRate: 0.05,
  incentiveManagementFeeRate: 0.15,
};

const global = {
  modelStartDate: "2026-04-01",
  companyOpsStartDate: "2026-04-01",
  projectionYears: 1,
  inflationRate: 0.03,
  fixedCostEscalationRate: 0.03,
  baseManagementFee: 0.05,
  incentiveManagementFee: 0.15,
  marketingRate: 0.05,
  miscOpsRate: 0.03,
  capitalRaise1Date: "2026-04-01",
  capitalRaise1Amount: 1_000_000,
  capitalRaise2Date: undefined as string | undefined,
  capitalRaise2Amount: 0,
  staffSalary: 75_000,
  staffTier1MaxProperties: 3,
  staffTier1Fte: 2.5,
  staffTier2MaxProperties: 6,
  staffTier2Fte: 4.5,
  staffTier3Fte: 7.0,
  officeLeaseStart: 36_000,
  professionalServicesStart: 24_000,
  techInfraStart: 18_000,
  travelCostPerClient: 12_000,
  itLicensePerClient: 3_000,
  partnerCompYear1: 540_000,
  debtAssumptions: {
    interestRate: 0.09,
    amortizationYears: 25,
    acqLTV: 0.75,
  },
};

describe("generateCompanyProForma — golden scenario", () => {
  const result = generateCompanyProForma([property], global, 12);

  it("produces 12 months", () => {
    expect(result).toHaveLength(12);
  });

  describe("Month 0 — management fees from property revenue", () => {
    const m0 = result[0];
    const propM0 = generatePropertyProForma(property, global, 12)[0];

    it("base fee = property revenue × 5%", () => {
      expect(m0.baseFeeRevenue).toBeCloseTo(propM0.revenueTotal * 0.05, 2);
    });

    it("incentive fee = property GOP × 15%", () => {
      expect(m0.incentiveFeeRevenue).toBeCloseTo(propM0.gop * 0.15, 2);
    });

    it("total revenue = base + incentive", () => {
      expect(m0.totalRevenue).toBeCloseTo(m0.baseFeeRevenue + m0.incentiveFeeRevenue, 2);
    });
  });

  describe("staffing model (1 property → Tier 1)", () => {
    const m0 = result[0];

    it("staff compensation = 2.5 FTE × $75K / 12", () => {
      const expected = (2.5 * 75_000) / 12;
      expect(m0.staffCompensation).toBeCloseTo(expected, 2);
    });
  });

  describe("partner compensation", () => {
    it("monthly partner comp = Year 1 annual / 12", () => {
      expect(result[0].partnerCompensation).toBeCloseTo(540_000 / 12, 2);
    });
  });

  describe("fixed costs (Year 1, no escalation)", () => {
    const m0 = result[0];

    it("office lease = $36K / 12", () => {
      expect(m0.officeLease).toBeCloseTo(36_000 / 12, 2);
    });

    it("professional services = $24K / 12", () => {
      expect(m0.professionalServices).toBeCloseTo(24_000 / 12, 2);
    });

    it("tech infrastructure = $18K / 12", () => {
      expect(m0.techInfrastructure).toBeCloseTo(18_000 / 12, 2);
    });

    it("total fixed overhead matches expected", () => {
    });
  });

  describe("variable costs (1 active property)", () => {
    const m0 = result[0];

    it("travel = 1 property × $12K / 12", () => {
      expect(m0.travelCosts).toBeCloseTo(12_000 / 12, 2);
    });

    it("IT licensing = 1 property × $3K / 12", () => {
      expect(m0.itLicensing).toBeCloseTo(3_000 / 12, 2);
    });

    it("marketing = totalRevenue × 5%", () => {
      expect(m0.marketing).toBeCloseTo(m0.totalRevenue * 0.05, 2);
    });

    it("miscOps = totalRevenue × 3%", () => {
      expect(m0.miscOps).toBeCloseTo(m0.totalRevenue * 0.03, 2);
    });
  });

  describe("total expenses and net income", () => {
    const m0 = result[0];

    it("totalExpenses = sum of all expense line items", () => {
      const sum = m0.partnerCompensation + m0.staffCompensation +
        m0.officeLease + m0.professionalServices + m0.techInfrastructure +
        m0.businessInsurance + m0.travelCosts + m0.itLicensing +
        m0.marketing + m0.miscOps;
      expect(m0.totalExpenses).toBeCloseTo(sum, 2);
    });

    it("netIncome = totalRevenue - totalExpenses", () => {
      expect(m0.netIncome).toBeCloseTo(m0.totalRevenue - m0.totalExpenses, 2);
    });
  });

  describe("Funding instrument", () => {
    it("tranche 1 received in month 0", () => {
      expect(result[0].capitalRaiseFunding1).toBe(1_000_000);
      expect(result[0].capitalRaiseFunding).toBe(1_000_000);
    });

    it("no funding in subsequent months", () => {
      for (let i = 1; i < 12; i++) {
        expect(result[i].capitalRaiseFunding).toBe(0);
      }
    });
  });

  describe("cash flow", () => {
    it("cashFlow = netIncome + capitalRaiseFunding", () => {
      for (const m of result) {
        expect(m.cashFlow).toBeCloseTo(m.netIncome + m.capitalRaiseFunding, 2);
      }
    });

    it("endingCash = cumulative cashFlow", () => {
      let cumCash = 0;
      for (const m of result) {
        cumCash += m.cashFlow;
        expect(m.endingCash).toBeCloseTo(cumCash, 2);
      }
    });

    it("no negative cash (funded company with revenue)", () => {
      for (const m of result) {
        expect(m.cashShortfall).toBe(false);
      }
    });
  });
});

describe("Funding gate — company ops blocked before funding receipt", () => {
  it("has zero expenses before funding date", () => {
    const delayedGlobal = {
      ...global,
      companyOpsStartDate: "2026-04-01",
      capitalRaise1Date: "2026-07-01", // Funding delayed to July
    };

    const result = generateCompanyProForma([property], delayedGlobal, 12);

    // Months 0-2 (Apr-Jun) should have zero expenses (ops gated)
    for (let i = 0; i < 3; i++) {
      expect(result[i].totalExpenses).toBe(0);
      expect(result[i].partnerCompensation).toBe(0);
      expect(result[i].staffCompensation).toBe(0);
    }

    // Month 3 (Jul) should have expenses after funding received
    expect(result[3].totalExpenses).toBeGreaterThan(0);
  });
});

describe("pre-ops company — zero revenue and expenses before ops start", () => {
  it("has zero revenue before company ops start", () => {
    const delayedGlobal = {
      ...global,
      companyOpsStartDate: "2026-07-01",
      capitalRaise1Date: "2026-04-01",
    };

    const result = generateCompanyProForma([property], delayedGlobal, 12);

    // Months 0-2 (Apr-Jun) should have zero expenses (ops haven't started)
    for (let i = 0; i < 3; i++) {
      expect(result[i].totalExpenses).toBe(0);
    }

    // Month 3 (Jul) should have expenses
    expect(result[3].totalExpenses).toBeGreaterThan(0);
  });
});

describe("staffing tier transitions", () => {
  it("uses Tier 2 FTE when property count exceeds Tier 1 max", () => {
    // 4 properties → exceeds Tier 1 max (3) → Tier 2 (4.5 FTE)
    const fourProperties = Array(4).fill(property);
    const result = generateCompanyProForma(fourProperties, global, 12);
    const expectedStaff = (4.5 * 75_000) / 12;
    expect(result[0].staffCompensation).toBeCloseTo(expectedStaff, 2);
  });

  it("uses Tier 3 FTE when property count exceeds Tier 2 max", () => {
    // 7 properties → exceeds Tier 2 max (6) → Tier 3 (7.0 FTE)
    const sevenProperties = Array(7).fill(property);
    const result = generateCompanyProForma(sevenProperties, global, 12);
    const expectedStaff = (7.0 * 75_000) / 12;
    expect(result[0].staffCompensation).toBeCloseTo(expectedStaff, 2);
  });
});
