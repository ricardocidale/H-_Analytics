/**
 * company-engine — Management-company monthly pro-forma generator
 *
 * Rolls up all property pro-formas into the management company P&L.
 * Revenue = sum of base + incentive fees from every active property.
 * Expenses = staffing (dynamic tiers), partner comp, fixed G&A, variable ops.
 *
 * Fee zero-sum: fees earned here equal fees expensed in each property SPV.
 * In consolidation these intercompany amounts eliminate to zero.
 *
 * Funding gate: operations cannot begin before BOTH companyOpsStartDate AND
 * the first funding tranche date have been reached. The gate is strict — even
 * one day early returns zero revenue/expenses.
 *
 * Staffing tiers: headcount is derived each month from activePropertyCount
 * against tier thresholds in global (staffTier1MaxProperties, etc.).
 *
 * Service templates (optional): if provided, vendor cost-of-services is
 * deducted from fee revenue to produce grossProfit before G&A.
 */
import {
  PROJECTION_MONTHS,
  DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
  DEFAULT_BASE_MANAGEMENT_FEE_RATE,
  DEFAULT_PARTNER_COMP,
  DEFAULT_STAFF_SALARY,
  STAFFING_TIERS,
  DEFAULT_OFFICE_LEASE,
  DEFAULT_PROFESSIONAL_SERVICES,
  DEFAULT_TECH_INFRA,
  DEFAULT_BUSINESS_INSURANCE,
  DEFAULT_TRAVEL_PER_CLIENT,
  DEFAULT_IT_LICENSE_PER_CLIENT,
  DEFAULT_MARKETING_RATE,
  DEFAULT_MISC_OPS_RATE,
  DEFAULT_CAPITAL_RAISE_TRANCHE,
} from '@/lib/constants';
import { DEFAULT_COMPANY_TAX_RATE, MONTHS_PER_YEAR } from '@shared/constants';
import { computeCostOfServices } from '@calc/services/cost-of-services';
import type { ServiceTemplate, AggregatedServiceCosts } from '@calc/services/types';
import { PropertyInput, GlobalInput, CompanyMonthlyFinancials, ServiceFeeBreakdown } from '../types';
import { generatePropertyProForma } from '../property/property-engine';
import { parseLocalDate } from '@shared/dates';
import { assertFinite, dPow } from '@calc/shared/decimal.js';

/** Extract { year, month (0-based) } from a date string using parseLocalDate. */
function parseDateComponents(dateStr: string) {
  const d = parseLocalDate(dateStr);
  return { year: d.getFullYear(), month: d.getMonth() };
}

/**
 * Generate month-by-month financials for the management company itself.
 *
 * @param properties      All portfolio properties (used to compute fee revenue each month).
 * @param global          Model-wide assumptions (funding dates, staffing tiers, partner comp).
 * @param months          Projection horizon in months (default: PROJECTION_MONTHS = 120).
 * @param serviceTemplates Optional centralized-services templates. When present, vendor
 *                         cost-of-services is deducted from fee revenue → grossProfit.
 * @returns               Array of CompanyMonthlyFinancials, one entry per month from model start.
 *
 * Funding gate: hasStartedOps = currentDate >= companyOpsStartDate AND >= capitalRaise1Date.
 * Both conditions must hold simultaneously — no revenue or expenses accrue before the gate.
 */
export function generateCompanyProForma(
  properties: PropertyInput[],
  global: GlobalInput,
  months: number = PROJECTION_MONTHS,
  serviceTemplates?: ServiceTemplate[],
): CompanyMonthlyFinancials[] {
  const results: CompanyMonthlyFinancials[] = [];
  let cumulativeCompanyCash = 0;
  let cumulativeAccruedInterest = 0;
  let monthsOfAccrual = 0;
  let cumulativePrincipal = 0;

  const startParsed = parseDateComponents(global.modelStartDate);
  const tranche1Parsed = global.capitalRaise1Date ? parseDateComponents(global.capitalRaise1Date) : startParsed;
  const tranche2Parsed = global.capitalRaise2Date ? parseDateComponents(global.capitalRaise2Date) : null;
  const opsStartParsed = global.companyOpsStartDate ? parseDateComponents(global.companyOpsStartDate) : startParsed;
  
  const propertyFinancials = properties.map(p => generatePropertyProForma(p, global, months));

  // ── Pre-computed month indices (Task 6: eliminate Date allocations) ──
  const opsStartMonthIdx = (opsStartParsed.year - startParsed.year) * 12 + (opsStartParsed.month - startParsed.month);
  const firstSafeMonthIdx = (tranche1Parsed.year - startParsed.year) * 12 + (tranche1Parsed.month - startParsed.month);
  const opsGateIdx = Math.max(opsStartMonthIdx, firstSafeMonthIdx);
  const tranche1MonthIdx = (tranche1Parsed.year - startParsed.year) * 12 + (tranche1Parsed.month - startParsed.month);
  const tranche2MonthIdx = tranche2Parsed
    ? (tranche2Parsed.year - startParsed.year) * 12 + (tranche2Parsed.month - startParsed.month)
    : -1;

  // ── Pre-computed active property count timeline (Task 6) ──
  const activePropertyTimeline = new Array(months);
  for (let m = 0; m < months; m++) {
    let count = 0;
    for (let i = 0; i < properties.length; i++) {
      const pf = propertyFinancials[i];
      if (m < pf.length && pf[m].revenueTotal > 0) count++;
    }
    activePropertyTimeline[m] = count;
  }

  // ── Hoisted loop-invariant constants (Task 6) ──
  const companyInflation = global.companyInflationRate ?? global.inflationRate;
  const fixedEscalationRate = global.fixedCostEscalationRate ?? companyInflation;
  const yearlyPartnerComp = [
    global.partnerCompYear1 ?? DEFAULT_PARTNER_COMP[0],
    global.partnerCompYear2 ?? DEFAULT_PARTNER_COMP[1],
    global.partnerCompYear3 ?? DEFAULT_PARTNER_COMP[2],
    global.partnerCompYear4 ?? DEFAULT_PARTNER_COMP[3],
    global.partnerCompYear5 ?? DEFAULT_PARTNER_COMP[4],
    global.partnerCompYear6 ?? DEFAULT_PARTNER_COMP[5],
    global.partnerCompYear7 ?? DEFAULT_PARTNER_COMP[6],
    global.partnerCompYear8 ?? DEFAULT_PARTNER_COMP[7],
    global.partnerCompYear9 ?? DEFAULT_PARTNER_COMP[8],
    global.partnerCompYear10 ?? DEFAULT_PARTNER_COMP[9],
  ];
  const staffSalary = global.staffSalary ?? DEFAULT_STAFF_SALARY;
  const tier1Max = global.staffTier1MaxProperties ?? STAFFING_TIERS[0].maxProperties;
  const tier1Fte = global.staffTier1Fte ?? STAFFING_TIERS[0].fte;
  const tier2Max = global.staffTier2MaxProperties ?? STAFFING_TIERS[1].maxProperties;
  const tier2Fte = global.staffTier2Fte ?? STAFFING_TIERS[1].fte;
  const tier3Fte = global.staffTier3Fte ?? STAFFING_TIERS[2].fte;
  const officeLeaseStart = global.officeLeaseStart ?? DEFAULT_OFFICE_LEASE;
  const professionalServicesStart = global.professionalServicesStart ?? DEFAULT_PROFESSIONAL_SERVICES;
  const techInfraStart = global.techInfraStart ?? DEFAULT_TECH_INFRA;
  const businessInsuranceStart = global.businessInsuranceStart ?? DEFAULT_BUSINESS_INSURANCE;
  const travelCostPerClient = global.travelCostPerClient ?? DEFAULT_TRAVEL_PER_CLIENT;
  const itLicensePerClient = global.itLicensePerClient ?? DEFAULT_IT_LICENSE_PER_CLIENT;
  const marketingRate = global.marketingRate ?? DEFAULT_MARKETING_RATE;
  const miscOpsRate = global.miscOpsRate ?? DEFAULT_MISC_OPS_RATE;
  const companyTaxRate = global.companyTaxRate ?? DEFAULT_COMPANY_TAX_RATE;
  const capitalRaise1Amount = global.capitalRaise1Amount ?? DEFAULT_CAPITAL_RAISE_TRANCHE;
  const capitalRaise2Amount = global.capitalRaise2Amount ?? DEFAULT_CAPITAL_RAISE_TRANCHE;
  const fundingInterestRate = global.fundingInterestRate ?? 0;
  const fundingInterestPaymentFrequency = global.fundingInterestPaymentFrequency ?? 'accrues_only';
  const hasServiceTemplates = serviceTemplates && serviceTemplates.length > 0;

  // ── Pre-computed escalation factor arrays (Task 6) ──
  const maxMonthsSinceOps = opsStartMonthIdx < 0 ? months - 1 + Math.abs(opsStartMonthIdx) : months - 1;
  const maxCompanyOpsYear = Math.floor(maxMonthsSinceOps / MONTHS_PER_YEAR) + 1;
  const fixedCostFactors = new Array(maxCompanyOpsYear);
  const variableCostFactors = new Array(maxCompanyOpsYear);
  for (let y = 0; y < maxCompanyOpsYear; y++) {
    fixedCostFactors[y] = dPow(1 + fixedEscalationRate, y);
    variableCostFactors[y] = dPow(1 + companyInflation, y);
  }

  // ── Pre-computed property base fee rates ──
  // INVARIANT: properties array order must not change between rate mapping and usage
  const propBaseFeeRates = properties.map(p => p.baseManagementFeeRate ?? DEFAULT_BASE_MANAGEMENT_FEE_RATE);
  const propIds = properties.map((p, i) => String(p.id ?? i));

  for (let m = 0; m < months; m++) {
    const year = Math.floor(m / MONTHS_PER_YEAR);
    const hasStartedOps = m >= opsGateIdx;

    const monthsSinceCompanyOps = hasStartedOps ? m - opsStartMonthIdx : 0;
    const companyOpsYear = Math.floor(monthsSinceCompanyOps / MONTHS_PER_YEAR);
    const fixedCostFactor = fixedCostFactors[companyOpsYear];
    const variableCostFactor = variableCostFactors[companyOpsYear];
    const activePropertyCount = activePropertyTimeline[m];
    
    let totalPropertyRevenue = 0;
    let totalPropertyGOP = 0;
    let baseFeeRevenue = 0;
    let incentiveFeeRevenue = 0;
    const incentiveFeeByPropertyId: Record<string, number> = {};
    const serviceFeeBreakdown: ServiceFeeBreakdown = {
      byCategory: {},
      byPropertyId: {},
      byCategoryByPropertyId: {},
    };

    if (hasStartedOps) {
      for (let i = 0; i < properties.length; i++) {
        const pf = propertyFinancials[i];
        if (m < pf.length) {
          totalPropertyRevenue += pf[m].revenueTotal;
          totalPropertyGOP += pf[m].gop;
        }
      }

      for (let i = 0; i < properties.length; i++) {
        const pf = propertyFinancials[i];
        if (m < pf.length) {
          const propId = propIds[i];
          const propIncentive = pf[m].feeIncentive;
          incentiveFeeRevenue += propIncentive;
          incentiveFeeByPropertyId[propId] = propIncentive;
          
          const catFees = pf[m].serviceFeesByCategory;
          const hasCategoryData = Object.keys(catFees).length > 0;
          if (hasCategoryData) {
            let propServiceTotal = 0;
            for (const [catName, rawCatAmount] of Object.entries(catFees)) {
              const catAmount = assertFinite(rawCatAmount as number, `serviceFee[${catName}]`);
              serviceFeeBreakdown.byCategory[catName] = (serviceFeeBreakdown.byCategory[catName] ?? 0) + catAmount;
              if (!serviceFeeBreakdown.byCategoryByPropertyId[catName]) {
                serviceFeeBreakdown.byCategoryByPropertyId[catName] = {};
              }
              serviceFeeBreakdown.byCategoryByPropertyId[catName][propId] = catAmount;
              propServiceTotal += catAmount;
            }
            serviceFeeBreakdown.byPropertyId[propId] = propServiceTotal;
            baseFeeRevenue += propServiceTotal;
          } else {
            const propServiceFee = pf[m].revenueTotal * propBaseFeeRates[i];
            baseFeeRevenue += propServiceFee;
            serviceFeeBreakdown.byPropertyId[propId] = propServiceFee;
            serviceFeeBreakdown.byCategory["Service Fee"] = (serviceFeeBreakdown.byCategory["Service Fee"] ?? 0) + propServiceFee;
            if (!serviceFeeBreakdown.byCategoryByPropertyId["Service Fee"]) {
              serviceFeeBreakdown.byCategoryByPropertyId["Service Fee"] = {};
            }
            serviceFeeBreakdown.byCategoryByPropertyId["Service Fee"][propId] = propServiceFee;
          }
        }
      }
    }
    const totalRevenue = baseFeeRevenue + incentiveFeeRevenue;

    let costOfCentralizedServices: AggregatedServiceCosts | null = null;
    let totalVendorCost = 0;
    let grossProfit = totalRevenue;
    if (hasServiceTemplates) {
      costOfCentralizedServices = computeCostOfServices(
        serviceFeeBreakdown.byCategory,
        serviceTemplates!,
      );
      totalVendorCost = costOfCentralizedServices.totalVendorCost;
      grossProfit = totalRevenue - totalVendorCost;
    }

    let partnerCompensation = 0;
    let staffCompensation = 0;
    let officeLease = 0;
    let professionalServices = 0;
    let techInfrastructure = 0;
    let businessInsurance = 0;
    let travelCosts = 0;
    let itLicensing = 0;
    let marketing = 0;
    let miscOps = 0;
    
    if (hasStartedOps) {
      // Use operations year (not model year) for partner comp lookup
      const opsYearIndex = Math.min(companyOpsYear, yearlyPartnerComp.length - 1);
      const totalPartnerCompForYear = yearlyPartnerComp[opsYearIndex];
      
      const staffFTE = activePropertyCount <= tier1Max ? tier1Fte
        : activePropertyCount <= tier2Max ? tier2Fte
        : tier3Fte;
      
      partnerCompensation = totalPartnerCompForYear / MONTHS_PER_YEAR;
      staffCompensation = (staffFTE * staffSalary * fixedCostFactor) / MONTHS_PER_YEAR;
      officeLease = (officeLeaseStart * fixedCostFactor) / MONTHS_PER_YEAR;
      professionalServices = (professionalServicesStart * fixedCostFactor) / MONTHS_PER_YEAR;
      techInfrastructure = (techInfraStart * fixedCostFactor) / MONTHS_PER_YEAR;
      businessInsurance = (businessInsuranceStart * fixedCostFactor) / MONTHS_PER_YEAR;

      travelCosts = (activePropertyCount * travelCostPerClient * variableCostFactor) / MONTHS_PER_YEAR;
      itLicensing = (activePropertyCount * itLicensePerClient * variableCostFactor) / MONTHS_PER_YEAR;
      marketing = totalRevenue * marketingRate;
      miscOps = totalRevenue * miscOpsRate;
    }
    
    const totalExpenses = partnerCompensation + staffCompensation + officeLease + professionalServices +
      techInfrastructure + businessInsurance + travelCosts + itLicensing + marketing + miscOps;

    let capitalRaiseFunding1 = 0;
    let capitalRaiseFunding2 = 0;
    if (m === tranche1MonthIdx) {
      capitalRaiseFunding1 = capitalRaise1Amount;
    }
    if (m === tranche2MonthIdx) {
      capitalRaiseFunding2 = capitalRaise2Amount;
    }
    const capitalRaiseFunding = capitalRaiseFunding1 + capitalRaiseFunding2;
    cumulativePrincipal += capitalRaiseFunding;

    const fundingInterestExpense = fundingInterestRate > 0 ? cumulativePrincipal * fundingInterestRate / MONTHS_PER_YEAR : 0;
    cumulativeAccruedInterest += fundingInterestExpense;

    let fundingInterestPayment = 0;
    if (fundingInterestRate > 0 && cumulativeAccruedInterest > 0) {
      if (fundingInterestExpense > 0) {
        monthsOfAccrual++;
      }
      const paymentInterval = fundingInterestPaymentFrequency === 'quarterly' ? 3 :
                               fundingInterestPaymentFrequency === 'annually' ? MONTHS_PER_YEAR : 0;
      if (paymentInterval > 0 && monthsOfAccrual > 0 && monthsOfAccrual % paymentInterval === 0) {
        fundingInterestPayment = cumulativeAccruedInterest;
        cumulativeAccruedInterest = 0;
      }
    }

    const ebitda = totalRevenue - totalVendorCost - totalExpenses;
    const preTaxIncome = ebitda - fundingInterestExpense;
    const companyIncomeTax = preTaxIncome > 0 ? preTaxIncome * companyTaxRate : 0;
    const netIncome = preTaxIncome - companyIncomeTax;
    
    const cashFlow = netIncome + fundingInterestExpense + capitalRaiseFunding - fundingInterestPayment;
    cumulativeCompanyCash += cashFlow;

    const totalMonths = startParsed.month + m;
    const currentYear = startParsed.year + Math.floor(totalMonths / MONTHS_PER_YEAR);
    const currentMonth = totalMonths % MONTHS_PER_YEAR;
    const currentDate = new Date(currentYear, currentMonth, 1);

    results.push({
      date: currentDate,
      monthIndex: m,
      year: year + 1,
      baseFeeRevenue,
      incentiveFeeRevenue,
      incentiveFeeByPropertyId,
      serviceFeeBreakdown,
      totalRevenue,
      costOfCentralizedServices,
      totalVendorCost,
      grossProfit,
      partnerCompensation,
      staffCompensation,
      officeLease,
      professionalServices,
      techInfrastructure,
      businessInsurance,
      travelCosts,
      itLicensing,
      marketing,
      miscOps,
      totalExpenses,
      fundingInterestExpense,
      fundingInterestPayment,
      cumulativeAccruedInterest,
      preTaxIncome,
      companyIncomeTax,
      netIncome,
      capitalRaiseFunding,
      capitalRaiseFunding1,
      capitalRaiseFunding2,
      cashFlow,
      endingCash: cumulativeCompanyCash,
      cashShortfall: cumulativeCompanyCash < 0,
    });
  }
  
  return results as CompanyMonthlyFinancials[];
}

/**
 * Analyze company cash position over the projection period.
 */
export function analyzeCompanyCashPosition(financials: CompanyMonthlyFinancials[]) {
  const shortfalls = financials.filter(f => f.cashShortfall);
  const minCash = Math.min(...financials.map(f => f.endingCash));
  const totalNetIncome = financials.reduce((sum, f) => sum + f.netIncome, 0);
  
  return {
    hasShortfall: shortfalls.length > 0,
    firstShortfallMonth: shortfalls.length > 0 ? shortfalls[0].monthIndex : null,
    minimumCashBalance: minCash,
    totalProjectedNetIncome: totalNetIncome,
  };
}
