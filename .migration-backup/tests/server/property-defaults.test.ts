import { describe, it, expect } from "vitest";
import { buildPropertyDefaultsFromGlobal } from "../../server/routes/properties";
import type { GlobalAssumptions } from "@shared/schema";
import {
  DEFAULT_EXIT_CAP_RATE,
  DEFAULT_PROPERTY_INCOME_TAX_RATE,
  DEFAULT_COMMISSION_RATE,
  DEFAULT_BASE_MANAGEMENT_FEE_RATE,
  DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
  DEFAULT_COST_RATE_ROOMS,
  DEFAULT_COST_RATE_FB,
  DEFAULT_COST_RATE_ADMIN,
  DEFAULT_REV_SHARE_EVENTS,
  DEFAULT_REV_SHARE_FB,
  DEFAULT_REV_SHARE_OTHER,
  DEFAULT_LTV,
  DEFAULT_INTEREST_RATE,
  DEFAULT_TERM_YEARS,
  SEED_DEBT_ASSUMPTIONS,
} from "@shared/constants";

function makeGlobal(overrides: Partial<GlobalAssumptions> = {}): GlobalAssumptions {
  return {
    id: 1,
    userId: null,
    companyName: "Test Co",
    companyLogo: null,
    companyLogoId: null,
    propertyLabel: "Hotel",
    assetDescription: null,
    assetLogoId: null,
    modelStartDate: "2026-01-01",
    projectionYears: 10,
    companyOpsStartDate: "2026-06-01",
    fiscalYearStartMonth: 1,
    inflationRate: 0.03,
    fixedCostEscalationRate: 0.03,
    companyInflationRate: null,
    baseManagementFee: 0.085,
    incentiveManagementFee: 0.12,
    fundingSourceLabel: "SAFE",
    capitalRaise1Amount: 800000,
    capitalRaise1Date: "2026-06-01",
    capitalRaise2Amount: 800000,
    capitalRaise2Date: "2027-04-01",
    capitalRaiseValuationCap: 2500000,
    capitalRaiseDiscountRate: 0.2,
    fundingInterestRate: 0.08,
    fundingInterestPaymentFrequency: "accrues_only",
    partnerCompYear1: 540000,
    partnerCompYear2: 540000,
    partnerCompYear3: 540000,
    partnerCompYear4: 600000,
    partnerCompYear5: 600000,
    partnerCompYear6: 700000,
    partnerCompYear7: 700000,
    partnerCompYear8: 800000,
    partnerCompYear9: 800000,
    partnerCompYear10: 900000,
    partnerCountYear1: 3,
    partnerCountYear2: 3,
    partnerCountYear3: 3,
    partnerCountYear4: 3,
    partnerCountYear5: 3,
    partnerCountYear6: 3,
    partnerCountYear7: 3,
    partnerCountYear8: 3,
    partnerCountYear9: 3,
    partnerCountYear10: 3,
    staffSalary: 85000,
    staffTier1MaxProperties: 3,
    staffTier1Fte: 2.5,
    staffTier2MaxProperties: 6,
    staffTier2Fte: 4.5,
    staffTier3Fte: 7.0,
    officeLeaseStart: 36000,
    professionalServicesStart: 24000,
    techInfraStart: 18000,
    travelCostPerClient: 12000,
    itLicensePerClient: 3000,
    marketingRate: 0.05,
    miscOpsRate: 0.03,
    commissionRate: 0.05,
    standardAcqPackage: {},
    debtAssumptions: SEED_DEBT_ASSUMPTIONS,
    companyTaxRate: 0.30,
    costOfEquity: 0.18,
    exitCapRate: 0.085,
    salesCommissionRate: 0.05,
    eventExpenseRate: 0.65,
    otherExpenseRate: 0.60,
    utilitiesVariableSplit: 0.60,
    icpConfig: null,
    assetDefinition: {},
    preferredLlm: "claude-sonnet-4-5",
    companyPhone: null,
    companyEmail: null,
    companyWebsite: null,
    companyEin: null,
    companyFoundingYear: null,
    companyStreetAddress: null,
    companyCity: null,
    companyStateProvince: null,
    companyCountry: null,
    companyZipPostalCode: null,
    showCompanyCalculationDetails: true,
    showPropertyCalculationDetails: true,
    sidebarPropertyFinder: true,
    sidebarSensitivity: true,
    sidebarFinancing: true,
    sidebarCompare: true,
    sidebarTimeline: true,
    sidebarMapView: false,
    sidebarExecutiveSummary: true,
    sidebarScenarios: true,
    sidebarUserManual: true,
    sidebarResearch: true,
    showAiAssistant: false,
    rebeccaEnabled: false,
    rebeccaDisplayName: "Rebecca",
    rebeccaSystemPrompt: null,
    researchConfig: {},
    lastFullResearchRefresh: null,
    autoResearchRefreshEnabled: false,
    updatedAt: new Date(),
    ...overrides,
  } as GlobalAssumptions;
}

describe("buildPropertyDefaultsFromGlobal", () => {
  it("maps global_assumptions values to property fields", () => {
    const ga = makeGlobal({
      exitCapRate: 0.09,
      salesCommissionRate: 0.06,
      baseManagementFee: 0.10,
      incentiveManagementFee: 0.15,
      debtAssumptions: {
        acqLTV: 0.80,
        refiLTV: 0.70,
        interestRate: 0.07,
        amortizationYears: 30,
        acqClosingCostRate: 0.025,
        refiClosingCostRate: 0.035,
      },
    });

    const defaults = buildPropertyDefaultsFromGlobal(ga);

    expect(defaults.exitCapRate).toBe(0.09);
    expect(defaults.dispositionCommission).toBe(0.06);
    expect(defaults.baseManagementFeeRate).toBe(0.10);
    expect(defaults.incentiveManagementFeeRate).toBe(0.15);
    expect(defaults.acquisitionLTV).toBe(0.80);
    expect(defaults.acquisitionInterestRate).toBe(0.07);
    expect(defaults.acquisitionTermYears).toBe(30);
    expect(defaults.acquisitionClosingCostRate).toBe(0.025);
    expect(defaults.refinanceLTV).toBe(0.70);
    expect(defaults.refinanceInterestRate).toBe(0.07);
    expect(defaults.refinanceTermYears).toBe(30);
    expect(defaults.refinanceClosingCostRate).toBe(0.035);
  });

  it("falls back to hardcoded constants when global values are null/undefined", () => {
    const ga = makeGlobal({
      exitCapRate: null as unknown as number,
      salesCommissionRate: null as unknown as number,
      baseManagementFee: null as unknown as number,
      incentiveManagementFee: null as unknown as number,
      debtAssumptions: {},
    });

    const defaults = buildPropertyDefaultsFromGlobal(ga);

    expect(defaults.exitCapRate).toBe(DEFAULT_EXIT_CAP_RATE);
    expect(defaults.dispositionCommission).toBe(DEFAULT_COMMISSION_RATE);
    expect(defaults.baseManagementFeeRate).toBe(DEFAULT_BASE_MANAGEMENT_FEE_RATE);
    expect(defaults.incentiveManagementFeeRate).toBe(DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE);
    expect(defaults.acquisitionLTV).toBe(DEFAULT_LTV);
    expect(defaults.acquisitionInterestRate).toBe(DEFAULT_INTEREST_RATE);
    expect(defaults.acquisitionTermYears).toBe(DEFAULT_TERM_YEARS);
    expect(defaults.acquisitionClosingCostRate).toBe(SEED_DEBT_ASSUMPTIONS.acqClosingCostRate);
    expect(defaults.refinanceLTV).toBe(DEFAULT_LTV);
    expect(defaults.refinanceInterestRate).toBe(DEFAULT_INTEREST_RATE);
    expect(defaults.refinanceTermYears).toBe(DEFAULT_TERM_YEARS);
    expect(defaults.refinanceClosingCostRate).toBe(SEED_DEBT_ASSUMPTIONS.refiClosingCostRate);
  });

  it("includes taxRate as hardcoded constant", () => {
    const ga = makeGlobal();
    const defaults = buildPropertyDefaultsFromGlobal(ga);
    expect(defaults.taxRate).toBe(DEFAULT_PROPERTY_INCOME_TAX_RATE);
  });

  it("includes cost rate and revenue share defaults", () => {
    const ga = makeGlobal();
    const defaults = buildPropertyDefaultsFromGlobal(ga);

    expect(defaults.costRateRooms).toBe(DEFAULT_COST_RATE_ROOMS);
    expect(defaults.costRateFB).toBe(DEFAULT_COST_RATE_FB);
    expect(defaults.costRateAdmin).toBe(DEFAULT_COST_RATE_ADMIN);
    expect(defaults.revShareEvents).toBe(DEFAULT_REV_SHARE_EVENTS);
    expect(defaults.revShareFB).toBe(DEFAULT_REV_SHARE_FB);
    expect(defaults.revShareOther).toBe(DEFAULT_REV_SHARE_OTHER);
  });

  it("handles missing debtAssumptions gracefully", () => {
    const ga = makeGlobal({ debtAssumptions: null as unknown as object });
    const defaults = buildPropertyDefaultsFromGlobal(ga);

    expect(defaults.acquisitionLTV).toBe(DEFAULT_LTV);
    expect(defaults.acquisitionInterestRate).toBe(DEFAULT_INTEREST_RATE);
    expect(defaults.acquisitionTermYears).toBe(DEFAULT_TERM_YEARS);
  });

  it("returns hardcoded constants when no global_assumptions exists", () => {
    const defaults = buildPropertyDefaultsFromGlobal(undefined);

    expect(defaults.exitCapRate).toBe(DEFAULT_EXIT_CAP_RATE);
    expect(defaults.dispositionCommission).toBe(DEFAULT_COMMISSION_RATE);
    expect(defaults.baseManagementFeeRate).toBe(DEFAULT_BASE_MANAGEMENT_FEE_RATE);
    expect(defaults.incentiveManagementFeeRate).toBe(DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE);
    expect(defaults.taxRate).toBe(DEFAULT_PROPERTY_INCOME_TAX_RATE);
    expect(defaults.acquisitionLTV).toBe(DEFAULT_LTV);
    expect(defaults.acquisitionInterestRate).toBe(DEFAULT_INTEREST_RATE);
    expect(defaults.acquisitionTermYears).toBe(DEFAULT_TERM_YEARS);
    expect(defaults.costRateRooms).toBe(DEFAULT_COST_RATE_ROOMS);
    expect(defaults.revShareEvents).toBe(DEFAULT_REV_SHARE_EVENTS);
  });

  it("merge logic: body values override global defaults", () => {
    const ga = makeGlobal({ exitCapRate: 0.09 });
    const defaults = buildPropertyDefaultsFromGlobal(ga);

    const body = { exitCapRate: 0.10, name: "Test Hotel" };
    const merged: Record<string, unknown> = {};
    for (const [key, globalValue] of Object.entries(defaults)) {
      const userValue = (body as Record<string, unknown>)[key];
      if (userValue === undefined || userValue === null) {
        merged[key] = globalValue;
      }
    }

    expect(merged.exitCapRate).toBeUndefined();
    expect(defaults.exitCapRate).toBe(0.09);
  });
});
