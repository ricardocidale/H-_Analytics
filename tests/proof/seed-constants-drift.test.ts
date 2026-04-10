import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * Seed Constants Drift Detection
 *
 * Verifies that seed data in server/seeds/properties.ts and property-data.ts
 * uses named constants from shared/constants.ts rather than hardcoded literals
 * that could drift. Also checks structural integrity of seed data.
 */

const seedPropsPath = path.resolve(__dirname, "../../server/seeds/properties.ts");
const seedDataPath = path.resolve(__dirname, "../../server/seeds/property-data.ts");
const seedPropsContent = fs.readFileSync(seedPropsPath, "utf-8") + "\n" + fs.readFileSync(seedDataPath, "utf-8");

const seedIndexPath = path.resolve(__dirname, "../../server/seeds/index.ts");
const seedIndexContent = fs.readFileSync(seedIndexPath, "utf-8");

describe("Seed Constants Drift — Global Assumptions", () => {
  it("uses DEFAULT_SAFE_VALUATION_CAP (not a literal)", () => {
    expect(seedPropsContent).toContain("safeValuationCap: DEFAULT_SAFE_VALUATION_CAP");
  });

  it("uses DEFAULT_SAFE_DISCOUNT_RATE (not a literal)", () => {
    expect(seedPropsContent).toContain("safeDiscountRate: DEFAULT_SAFE_DISCOUNT_RATE");
  });

  it("uses DEFAULT_COMMISSION_RATE for commissionRate", () => {
    expect(seedPropsContent).toContain("commissionRate: DEFAULT_COMMISSION_RATE");
  });

  it("uses DEFAULT_EXIT_CAP_RATE for exitCapRate", () => {
    expect(seedPropsContent).toContain("exitCapRate: DEFAULT_EXIT_CAP_RATE");
  });

  it("uses DEFAULT_COMMISSION_RATE for salesCommissionRate", () => {
    expect(seedPropsContent).toContain("salesCommissionRate: DEFAULT_COMMISSION_RATE");
  });

  it("uses DEFAULT_EVENT_EXPENSE_RATE", () => {
    expect(seedPropsContent).toContain("eventExpenseRate: DEFAULT_EVENT_EXPENSE_RATE");
  });

  it("uses DEFAULT_OTHER_EXPENSE_RATE", () => {
    expect(seedPropsContent).toContain("otherExpenseRate: DEFAULT_OTHER_EXPENSE_RATE");
  });

  it("uses DEFAULT_UTILITIES_VARIABLE_SPLIT", () => {
    expect(seedPropsContent).toContain("utilitiesVariableSplit: DEFAULT_UTILITIES_VARIABLE_SPLIT");
  });
});

describe("Seed Constants Drift — Property Cost Rates", () => {
  const requiredConstants = [
    "DEFAULT_COST_RATE_ROOMS",
    "DEFAULT_COST_RATE_ADMIN",
    "DEFAULT_COST_RATE_MARKETING",
    "DEFAULT_COST_RATE_PROPERTY_OPS",
    "DEFAULT_COST_RATE_UTILITIES",
    "DEFAULT_COST_RATE_TAXES",
    "DEFAULT_COST_RATE_IT",
    "DEFAULT_COST_RATE_FFE",
    "DEFAULT_COST_RATE_OTHER",
  ];

  for (const constant of requiredConstants) {
    it(`imports and uses ${constant}`, () => {
      expect(seedPropsContent).toContain(constant);
    });
  }
});

describe("Seed Constants Drift — Property Revenue & Fee Rates", () => {
  const requiredConstants = [
    "DEFAULT_REV_SHARE_EVENTS",
    "DEFAULT_REV_SHARE_FB",
    "DEFAULT_REV_SHARE_OTHER",
    "DEFAULT_PROPERTY_TAX_RATE",
    "DEFAULT_BASE_MANAGEMENT_FEE_RATE",
    "DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE",
    "DEFAULT_COMMISSION_RATE",
  ];

  for (const constant of requiredConstants) {
    it(`imports and uses ${constant}`, () => {
      expect(seedPropsContent).toContain(constant);
    });
  }
});

describe("Seed Data Structural Integrity", () => {
  it("seeds exactly 6 Norfolk AI properties", () => {
    const propertyNames = ["Jano Grande Ranch", "Loch Sheldrake", "Belleayre Mountain", "Scott's House", "Lakeview Haven Lodge", "San Diego"];
    for (const name of propertyNames) {
      expect(seedPropsContent).toContain(`name: "${name}"`);
    }
  });

  it("all seed properties have userId set to null (shared ownership)", () => {
    expect(seedPropsContent).toContain("userId: null");
    expect(seedPropsContent).not.toContain("userId: adminUserId");
  });

  it("financed properties have per-property financing fields", () => {
    expect(seedPropsContent).toContain('type: "Financed"');
    expect(seedPropsContent).toContain("acquisitionLTV:");
    expect(seedPropsContent).toContain("acquisitionInterestRate:");
    expect(seedPropsContent).toContain("acquisitionTermYears:");
    expect(seedPropsContent).toContain("acquisitionClosingCostRate:");
  });

  it("Full Equity properties have refinance fields", () => {
    expect(seedPropsContent).toContain('type: "Full Equity"');
    expect(seedPropsContent).toContain("refinanceLTV:");
    expect(seedPropsContent).toContain("refinanceInterestRate:");
  });

  it("all properties have operationsStartDate after acquisitionDate", () => {
    const acqDates = [...seedPropsContent.matchAll(/acquisitionDate:\s*"(\d{4}-\d{2}-\d{2})"/g)].map(m => m[1]);
    const opsDates = [...seedPropsContent.matchAll(/operationsStartDate:\s*"(\d{4}-\d{2}-\d{2})"/g)].map(m => m[1]);
    expect(acqDates.length).toBe(12);
    expect(opsDates.length).toBe(12);
    for (let i = 0; i < 12; i++) {
      expect(opsDates[i] >= acqDates[i]).toBe(true);
    }
  });

  it("seed index calls all required seed functions", () => {
    expect(seedIndexContent).toContain("seedUsers()");
    expect(seedIndexContent).toContain("seedGlobalAssumptions()");
    expect(seedIndexContent).toContain("seedProperties()");
    expect(seedIndexContent).toContain("seedFeeCategories()");
    expect(seedIndexContent).toContain("seedDefaultLogos()");
    expect(seedIndexContent).toContain("seedUserGroups()");
    expect(seedIndexContent).toContain("seedServiceTemplates()");
  });

  it("global assumptions sets companyName to The Norfolk AI Group", () => {
    expect(seedPropsContent).toContain('companyName: "The Norfolk AI Group"');
  });
});
