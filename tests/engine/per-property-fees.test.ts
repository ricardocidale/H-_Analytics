import { describe, it, expect } from "vitest";
import {
  generatePropertyProForma,
  generateCompanyProForma,
} from "../../client/src/lib/financialEngine.js";
import {
  DEFAULT_BASE_MANAGEMENT_FEE_RATE,
  DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
} from "../../shared/constants.js";
import { makeProperty, makeGlobal } from "../fixtures";

const baseProperty = {
  ...makeProperty({
    startAdr: 250,
    maxOccupancy: 0.85,
    purchasePrice: 2_000_000,
  }),
  baseManagementFeeRate: DEFAULT_BASE_MANAGEMENT_FEE_RATE,
  incentiveManagementFeeRate: DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
};

const baseGlobal = {
  ...makeGlobal({ projectionYears: 1 }),
  companyOpsStartDate: "2026-04-01",
  baseManagementFee: 0.05,
  incentiveManagementFee: 0.15,
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
};

describe("Per-Property Management Fee Rates — SPV Pro Forma", () => {
  describe("default rates (explicit)", () => {
    const result = generatePropertyProForma(baseProperty, baseGlobal, 12);

    it("base fee uses DEFAULT_BASE_MANAGEMENT_FEE_RATE (5%)", () => {
      for (const m of result) {
        expect(m.feeBase).toBeCloseTo(m.revenueTotal * DEFAULT_BASE_MANAGEMENT_FEE_RATE, 2);
      }
    });

    it("incentive fee uses DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE (15%)", () => {
      for (const m of result) {
        expect(m.feeIncentive).toBeCloseTo(Math.max(0, m.gop * DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE), 2);
      }
    });
  });

  describe("custom base rate override (3%)", () => {
    const customProperty = { ...baseProperty, baseManagementFeeRate: 0.03 };
    const result = generatePropertyProForma(customProperty, baseGlobal, 12);

    it("base fee uses property-specific rate (3%), not default (5%)", () => {
      for (const m of result) {
        expect(m.feeBase).toBeCloseTo(m.revenueTotal * 0.03, 2);
        expect(m.feeBase).not.toBeCloseTo(m.revenueTotal * DEFAULT_BASE_MANAGEMENT_FEE_RATE, 2);
      }
    });

    it("incentive fee still uses default rate when not overridden", () => {
      for (const m of result) {
        expect(m.feeIncentive).toBeCloseTo(Math.max(0, m.gop * DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE), 2);
      }
    });
  });

  describe("custom incentive rate override (10%)", () => {
    const customProperty = { ...baseProperty, incentiveManagementFeeRate: 0.10 };
    const result = generatePropertyProForma(customProperty, baseGlobal, 12);

    it("incentive fee uses property-specific rate (10%), not default (15%)", () => {
      for (const m of result) {
        expect(m.feeIncentive).toBeCloseTo(Math.max(0, m.gop * 0.10), 2);
        if (m.gop > 0) {
          expect(m.feeIncentive).not.toBeCloseTo(m.gop * DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE, 2);
        }
      }
    });

    it("base fee still uses default rate when not overridden", () => {
      for (const m of result) {
        expect(m.feeBase).toBeCloseTo(m.revenueTotal * DEFAULT_BASE_MANAGEMENT_FEE_RATE, 2);
      }
    });
  });

  describe("both rates overridden (7% base, 20% incentive)", () => {
    const customProperty = {
      ...baseProperty,
      baseManagementFeeRate: 0.07,
      incentiveManagementFeeRate: 0.20,
    };
    const result = generatePropertyProForma(customProperty, baseGlobal, 12);

    it("base fee = 7% of total revenue", () => {
      for (const m of result) {
        expect(m.feeBase).toBeCloseTo(m.revenueTotal * 0.07, 2);
      }
    });

    it("incentive fee = 20% of max(0, GOP)", () => {
      for (const m of result) {
        expect(m.feeIncentive).toBeCloseTo(Math.max(0, m.gop * 0.20), 2);
      }
    });
  });

  describe("fallback when rates are undefined", () => {
    const noRateProperty = { ...baseProperty } as Record<string, any>;
    delete noRateProperty.baseManagementFeeRate;
    delete noRateProperty.incentiveManagementFeeRate;
    const result = generatePropertyProForma(noRateProperty, baseGlobal, 12);

    it("falls back to DEFAULT_BASE_MANAGEMENT_FEE_RATE", () => {
      for (const m of result) {
        expect(m.feeBase).toBeCloseTo(m.revenueTotal * DEFAULT_BASE_MANAGEMENT_FEE_RATE, 2);
      }
    });

    it("falls back to DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE", () => {
      for (const m of result) {
        expect(m.feeIncentive).toBeCloseTo(Math.max(0, m.gop * DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE), 2);
      }
    });
  });

  describe("zero rates produce zero fees", () => {
    const zeroRateProperty = {
      ...baseProperty,
      baseManagementFeeRate: 0,
      incentiveManagementFeeRate: 0,
    };
    const result = generatePropertyProForma(zeroRateProperty, baseGlobal, 12);

    it("zero base rate → zero base fee", () => {
      for (const m of result) {
        expect(m.feeBase).toBe(0);
      }
    });

    it("zero incentive rate → zero incentive fee", () => {
      for (const m of result) {
        expect(m.feeIncentive).toBe(0);
      }
    });

    it("NOI is higher when management fees are zero", () => {
      const defaultResult = generatePropertyProForma(baseProperty, baseGlobal, 12);
      for (let i = 0; i < 12; i++) {
        expect(result[i].noi).toBeGreaterThan(defaultResult[i].noi);
      }
    });
  });
});

describe("Per-Property Management Fee Rates — Company (OpCo) Pro Forma", () => {
  describe("different rates per property flow to OpCo revenue correctly", () => {
    const propertyA = {
      ...baseProperty,
      baseManagementFeeRate: 0.03,
      incentiveManagementFeeRate: 0.10,
    };
    const propertyB = {
      ...baseProperty,
      baseManagementFeeRate: 0.07,
      incentiveManagementFeeRate: 0.20,
      roomCount: 15,
      startAdr: 300,
      purchasePrice: 3_000_000,
    };

    const proFormaA = generatePropertyProForma(propertyA, baseGlobal, 12);
    const proFormaB = generatePropertyProForma(propertyB, baseGlobal, 12);
    const companyResult = generateCompanyProForma([propertyA, propertyB], baseGlobal, 12);

    it("OpCo base fee revenue = sum of each property's base fee at its own rate", () => {
      for (let i = 0; i < 12; i++) {
        const expectedBase = proFormaA[i].feeBase + proFormaB[i].feeBase;
        expect(companyResult[i].baseFeeRevenue).toBeCloseTo(expectedBase, 2);
      }
    });

    it("OpCo incentive fee revenue = sum of each property's incentive fee at its own rate", () => {
      for (let i = 0; i < 12; i++) {
        const expectedIncentive = proFormaA[i].feeIncentive + proFormaB[i].feeIncentive;
        expect(companyResult[i].incentiveFeeRevenue).toBeCloseTo(expectedIncentive, 2);
      }
    });

    it("property A fees are less than property B fees (lower rates and smaller property)", () => {
      const totalFeesA = proFormaA.reduce((s, m) => s + m.feeBase + m.feeIncentive, 0);
      const totalFeesB = proFormaB.reduce((s, m) => s + m.feeBase + m.feeIncentive, 0);
      expect(totalFeesA).toBeLessThan(totalFeesB);
    });
  });

  describe("uniform rates across properties produce same result as legacy global", () => {
    const propWithDefaults = { ...baseProperty };
    const companyResult = generateCompanyProForma([propWithDefaults], baseGlobal, 12);
    const propResult = generatePropertyProForma(propWithDefaults, baseGlobal, 12);

    it("OpCo base fee matches property fee expense (single property)", () => {
      for (let i = 0; i < 12; i++) {
        expect(companyResult[i].baseFeeRevenue).toBeCloseTo(propResult[i].feeBase, 2);
      }
    });

    it("OpCo incentive fee matches property fee expense (single property)", () => {
      for (let i = 0; i < 12; i++) {
        expect(companyResult[i].incentiveFeeRevenue).toBeCloseTo(propResult[i].feeIncentive, 2);
      }
    });
  });
});

describe("Per-Property Fee Impact on NOI and Cash Flow", () => {
  it("higher fee rates reduce property NOI", () => {
    const lowFee = { ...baseProperty, baseManagementFeeRate: 0.02, incentiveManagementFeeRate: 0.05 };
    const highFee = { ...baseProperty, baseManagementFeeRate: 0.08, incentiveManagementFeeRate: 0.25 };
    const resultLow = generatePropertyProForma(lowFee, baseGlobal, 12);
    const resultHigh = generatePropertyProForma(highFee, baseGlobal, 12);

    for (let i = 0; i < 12; i++) {
      expect(resultLow[i].noi).toBeGreaterThan(resultHigh[i].noi);
    }
  });

  it("higher fee rates increase OpCo revenue", () => {
    const lowFee = { ...baseProperty, baseManagementFeeRate: 0.02, incentiveManagementFeeRate: 0.05 };
    const highFee = { ...baseProperty, baseManagementFeeRate: 0.08, incentiveManagementFeeRate: 0.25 };
    const companyLow = generateCompanyProForma([lowFee], baseGlobal, 12);
    const companyHigh = generateCompanyProForma([highFee], baseGlobal, 12);

    for (let i = 0; i < 12; i++) {
      expect(companyHigh[i].totalRevenue).toBeGreaterThan(companyLow[i].totalRevenue);
    }
  });

  it("fee changes are zero-sum: SPV loss = OpCo gain", () => {
    const propA = { ...baseProperty, baseManagementFeeRate: 0.03, incentiveManagementFeeRate: 0.10 };
    const propB = { ...baseProperty, baseManagementFeeRate: 0.07, incentiveManagementFeeRate: 0.20 };

    const resultA = generatePropertyProForma(propA, baseGlobal, 12);
    const resultB = generatePropertyProForma(propB, baseGlobal, 12);

    for (let i = 0; i < 12; i++) {
      const feeDiffBase = resultB[i].feeBase - resultA[i].feeBase;
      const feeDiffIncentive = resultB[i].feeIncentive - resultA[i].feeIncentive;
      const agopDiff = resultA[i].agop - resultB[i].agop;
      expect(agopDiff).toBeCloseTo(feeDiffBase + feeDiffIncentive, 2);
    }
  });
});

describe("Per-Property Fee Constants", () => {
  it("DEFAULT_BASE_MANAGEMENT_FEE_RATE is 8.5%", () => {
    expect(DEFAULT_BASE_MANAGEMENT_FEE_RATE).toBe(0.085);
  });

  it("DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE is 12%", () => {
    expect(DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE).toBe(0.12);
  });
});

describe("Seed Data Integrity", () => {
  const seedConfig = require("../../server/seed-users.json");
  const expectedUsers = seedConfig.users.map((u: { email: string; firstName: string; lastName?: string; company: string; title: string; role: string }) => ({
    email: u.email,
    name: [u.firstName, u.lastName].filter(Boolean).join(" "),
    company: u.company,
    title: u.title,
    role: u.role,
  }));

  it("has exactly 8 seeded users", () => {
    expect(expectedUsers).toHaveLength(8);
  });

  it("has at least 1 admin user", () => {
    const admins = expectedUsers.filter((u: { role: string }) => u.role === "admin");
    expect(admins.length).toBeGreaterThanOrEqual(1);
  });

  it("has exactly 1 checker user", () => {
    const checkers = expectedUsers.filter((u: { role: string }) => u.role === "checker");
    expect(checkers).toHaveLength(1);
    expect(checkers[0].email).toBe("checker@norfolkgroup.io");
  });

  it("has 5 regular users", () => {
    const users = expectedUsers.filter((u: { role: string }) => u.role === "user");
    expect(users).toHaveLength(5);
  });

  it("all users have non-empty name, company, and title", () => {
    for (const u of expectedUsers) {
      expect((u as { name: string }).name.length).toBeGreaterThan(0);
      expect((u as { company: string }).company.length).toBeGreaterThan(0);
      expect((u as { title: string }).title.length).toBeGreaterThan(0);
    }
  });

  it("all emails are unique", () => {
    const emails = expectedUsers.map((u: { email: string }) => u.email);
    expect(new Set(emails).size).toBe(emails.length);
  });

  it("KIT Capital group has 3 members", () => {
    const kitMembers = expectedUsers.filter((u: { company: string }) => u.company === "KIT Capital");
    expect(kitMembers).toHaveLength(3);
  });

  it("Norfolk entities have 3 members", () => {
    const norfolkMembers = expectedUsers.filter((u: { company: string }) =>
      u.company === "The Norfolk AI Group" || u.company === "Norfolk AI"
    );
    expect(norfolkMembers).toHaveLength(3);
  });

  it("Leslie Cidale is in Numeratti Endeavors", () => {
    const leslie = expectedUsers.find((u: { email: string }) => u.email === "leslie@cidale.com");
    expect(leslie).toBeDefined();
    expect((leslie as { company: string }).company).toBe("Numeratti Endeavors");
    expect((leslie as { title: string }).title).toBe("Senior Partner");
  });
});
