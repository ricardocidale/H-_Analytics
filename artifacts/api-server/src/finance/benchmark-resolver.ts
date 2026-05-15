/**
 * benchmark-resolver.ts — Runtime resolver for market benchmark bands.
 *
 * Each `resolve*Benchmarks()` function loads canonical and override rows from
 * the DB and assembles the typed band object for a specialist category.
 *
 * Falls back transparently to the TS factory defaults (via registry.factoryValue)
 * when a key has no DB row — so the system works correctly at first boot before
 * `tsx script/seed-model-constants.ts` has run.
 *
 * Usage:
 *   const benchmarks = await resolveRevenueBenchmarks();
 *   const result = await runRevenueSpecialist(ctx, benchmarks, comparables);
 */

import { ModelCanonicalsStorage } from "../storage/model-canonicals";
import { ModelConstantsStorage } from "../storage/model-constants";
import { getEffectiveConstant } from "@shared/get-effective-constant";
import { getFactoryNumber, type RegisteredConstantKey } from "@shared/model-constants-registry";
import type {
  CompensationBenchmarks,
  RevenueBenchmarks,
  OverheadBenchmarks,
  PropertyDefaultsBenchmarks,
  CompanyBenchmarks,
} from "@shared/model-constants-registry";
import type { StressThresholds } from "@engine/helpers/stress-scenarios";

const canonicalsStorage = new ModelCanonicalsStorage();
const overridesStorage = new ModelConstantsStorage();

type BenchmarkContext = {
  canonicals: Awaited<ReturnType<ModelCanonicalsStorage["listCanonicals"]>>;
  overrides: Awaited<ReturnType<ModelConstantsStorage["listModelConstantOverrides"]>>;
};

async function loadContext(): Promise<BenchmarkContext> {
  const [canonicals, overrides] = await Promise.all([
    canonicalsStorage.listCanonicals(),
    overridesStorage.listModelConstantOverrides(),
  ]);
  return { canonicals, overrides };
}

function read({ key, canonicals, overrides }: { key: string } & BenchmarkContext): number {
  const result = getEffectiveConstant<number>({
    key,
    country: null,
    subdivision: null,
    canonicals,
    overrides,
  });
  if (typeof result.value === "number" && Number.isFinite(result.value)) {
    return result.value;
  }
  return getFactoryNumber(key as RegisteredConstantKey);
}

export async function resolveCompensationBenchmarks(): Promise<CompensationBenchmarks> {
  const ctx = await loadContext();
  const r = (key: string) => read({ key, ...ctx });
  return {
    partnerCompYear1:  { low: r("benchmarkCompPartnerCompYear1Low"),  mid: r("benchmarkCompPartnerCompYear1Mid"),  high: r("benchmarkCompPartnerCompYear1High") },
    partnerCompYear10: { low: r("benchmarkCompPartnerCompYear10Low"), mid: r("benchmarkCompPartnerCompYear10Mid"), high: r("benchmarkCompPartnerCompYear10High") },
    partnerCountYear1: { low: r("benchmarkCompPartnerCountYear1Low"), mid: r("benchmarkCompPartnerCountYear1Mid"), high: r("benchmarkCompPartnerCountYear1High") },
    staffSalary:       { low: r("benchmarkCompStaffSalaryLow"),       mid: r("benchmarkCompStaffSalaryMid"),       high: r("benchmarkCompStaffSalaryHigh") },
    staffTier3Fte:     { low: r("benchmarkCompStaffTier3FteLow"),     mid: r("benchmarkCompStaffTier3FteMid"),     high: r("benchmarkCompStaffTier3FteHigh") },
  };
}

export async function resolveRevenueBenchmarks(): Promise<RevenueBenchmarks> {
  const ctx = await loadContext();
  const r = (key: string) => read({ key, ...ctx });
  return {
    marketingRate:      { low: r("benchmarkRevMarketingRateLow"),      mid: r("benchmarkRevMarketingRateMid"),      high: r("benchmarkRevMarketingRateHigh") },
    fbRevenueShare:     { low: r("benchmarkRevFbRevenueShareLow"),     mid: r("benchmarkRevFbRevenueShareMid"),     high: r("benchmarkRevFbRevenueShareHigh") },
    eventsRevenueShare: { low: r("benchmarkRevEventsRevenueShareLow"), mid: r("benchmarkRevEventsRevenueShareMid"), high: r("benchmarkRevEventsRevenueShareHigh") },
    otherRevenueShare:  { low: r("benchmarkRevOtherRevenueShareLow"),  mid: r("benchmarkRevOtherRevenueShareMid"),  high: r("benchmarkRevOtherRevenueShareHigh") },
    cateringBoostPct:   { low: r("benchmarkRevCateringBoostPctLow"),   mid: r("benchmarkRevCateringBoostPctMid"),   high: r("benchmarkRevCateringBoostPctHigh") },
  };
}

export async function resolveOverheadBenchmarks(): Promise<OverheadBenchmarks> {
  const ctx = await loadContext();
  const r = (key: string) => read({ key, ...ctx });
  return {
    officeLeaseStart:          { low: r("benchmarkOverheadOfficeLeaseLow"),        mid: r("benchmarkOverheadOfficeLeaseMid"),        high: r("benchmarkOverheadOfficeLeaseHigh") },
    professionalServicesStart: { low: r("benchmarkOverheadProfServicesLow"),       mid: r("benchmarkOverheadProfServicesMid"),       high: r("benchmarkOverheadProfServicesHigh") },
    techInfraStart:            { low: r("benchmarkOverheadTechInfraLow"),          mid: r("benchmarkOverheadTechInfraMid"),          high: r("benchmarkOverheadTechInfraHigh") },
    businessInsuranceStart:    { low: r("benchmarkOverheadBizInsuranceLow"),       mid: r("benchmarkOverheadBizInsuranceMid"),       high: r("benchmarkOverheadBizInsuranceHigh") },
    travelCostPerClient:       { low: r("benchmarkOverheadTravelPerClientLow"),    mid: r("benchmarkOverheadTravelPerClientMid"),    high: r("benchmarkOverheadTravelPerClientHigh") },
    itLicensePerClient:        { low: r("benchmarkOverheadItLicensePerClientLow"), mid: r("benchmarkOverheadItLicensePerClientMid"), high: r("benchmarkOverheadItLicensePerClientHigh") },
  };
}

export async function resolvePropertyDefaultsBenchmarks(): Promise<PropertyDefaultsBenchmarks> {
  const ctx = await loadContext();
  const r = (key: string) => read({ key, ...ctx });
  return {
    eventExpenseRate:       { low: r("benchmarkPropDefaultsEventExpenseRateLow"),    mid: r("benchmarkPropDefaultsEventExpenseRateMid"),    high: r("benchmarkPropDefaultsEventExpenseRateHigh") },
    otherExpenseRate:       { low: r("benchmarkPropDefaultsOtherExpenseRateLow"),    mid: r("benchmarkPropDefaultsOtherExpenseRateMid"),    high: r("benchmarkPropDefaultsOtherExpenseRateHigh") },
    utilitiesVariableSplit: { low: r("benchmarkPropDefaultsUtilitiesVarSplitLow"),  mid: r("benchmarkPropDefaultsUtilitiesVarSplitMid"),  high: r("benchmarkPropDefaultsUtilitiesVarSplitHigh") },
    salesCommissionRate:    { low: r("benchmarkPropDefaultsSalesCommissionRateLow"), mid: r("benchmarkPropDefaultsSalesCommissionRateMid"), high: r("benchmarkPropDefaultsSalesCommissionRateHigh") },
  };
}

export async function resolveCompanyBenchmarks(): Promise<CompanyBenchmarks> {
  const ctx = await loadContext();
  const r = (key: string) => read({ key, ...ctx });
  return {
    baseManagementFee:      { low: r("benchmarkCompanyBaseMgmtFeeLow"),      mid: r("benchmarkCompanyBaseMgmtFeeMid"),      high: r("benchmarkCompanyBaseMgmtFeeHigh") },
    incentiveManagementFee: { low: r("benchmarkCompanyIncentiveMgmtFeeLow"), mid: r("benchmarkCompanyIncentiveMgmtFeeMid"), high: r("benchmarkCompanyIncentiveMgmtFeeHigh") },
    companyTaxRate:         { low: r("benchmarkCompanyTaxRateLow"),          mid: r("benchmarkCompanyTaxRateMid"),          high: r("benchmarkCompanyTaxRateHigh") },
    costOfEquity:           { low: r("benchmarkCompanyCostOfEquityLow"),     mid: r("benchmarkCompanyCostOfEquityMid"),     high: r("benchmarkCompanyCostOfEquityHigh") },
  };
}

/**
 * Resolves DSCR and stress-scenario thresholds from the DB (model_constants
 * table) so that admin edits take effect without a code deploy.
 *
 * Pass the returned object as the second argument to `computeStressScenarios`.
 * stressRateShockBps is derived from stressRateShockDecimal × 10 000.
 */
export async function resolveStressThresholds(): Promise<StressThresholds> {
  const ctx = await loadContext();
  const r = (key: string) => read({ key, ...ctx });
  const decimalRate = r("benchmarkStressRateShockDecimal");
  return {
    dscrCovenantStandard:        r("benchmarkDscrCovenantStandard"),
    dscrCovenantCritical:        r("benchmarkDscrCovenantCritical"),
    stressOccupancyShock:        r("benchmarkStressOccupancyShock"),
    stressAdrShock:              r("benchmarkStressAdrShock"),
    stressRateShockDecimal:      decimalRate,
    stressRateShockBps:          Math.round(decimalRate * 10_000),
    stressCostShock:             r("benchmarkStressCostShock"),
    stressCombinedOccupancyShock: r("benchmarkStressCombinedOccupancyShock"),
    stressCombinedCostShock:     r("benchmarkStressCombinedCostShock"),
    stressSeverityNoiThreshold:  r("benchmarkStressSeverityNoiThreshold"),
  };
}

/**
 * Resolves staffing-default scalars from the DB (model_constants table) so
 * that admin edits take effect for new-user seeding without a code deploy.
 *
 * Use the returned object to populate GlobalInput / seed rows instead of
 * the deprecated @shared/constants-staffing TS constants.
 */
export async function resolveStaffingDefaults(): Promise<{
  staffSalary: number;
  officeLeaseStart: number;
  professionalServicesStart: number;
  techInfraStart: number;
  businessInsuranceStart: number;
  travelCostPerClient: number;
  itLicensePerClient: number;
}> {
  const ctx = await loadContext();
  const r = (key: string) => read({ key, ...ctx });
  return {
    staffSalary:               r("benchmarkStaffDefaultSalary"),
    officeLeaseStart:          r("benchmarkStaffDefaultOfficeLease"),
    professionalServicesStart: r("benchmarkStaffDefaultProfServices"),
    techInfraStart:            r("benchmarkStaffDefaultTechInfra"),
    businessInsuranceStart:    r("benchmarkStaffDefaultBizInsurance"),
    travelCostPerClient:       r("benchmarkStaffDefaultTravelPerClient"),
    itLicensePerClient:        r("benchmarkStaffDefaultItLicensePerClient"),
  };
}
