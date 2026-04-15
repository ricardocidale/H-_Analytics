/**
 * resolve-assumptions — Resolves property defaults and pre-computes loop-invariant
 * values for the property pro-forma engine.
 *
 * Extracts all assumption resolution, index computation, escalation factor
 * pre-computation, and mutable tracker initialization from the main engine loop
 * so that generatePropertyProForma focuses solely on the monthly iteration.
 */
import { startOfMonth } from "date-fns";
import { pmt } from "@calc/shared/pmt";
import {
  DEFAULT_LTV,
  DEFAULT_INTEREST_RATE,
  DEFAULT_TERM_YEARS,
  DEPRECIATION_YEARS,
  DAYS_PER_MONTH,
  DEFAULT_UTILITIES_VARIABLE_SPLIT,
  DEFAULT_LAND_VALUE_PERCENT,
  DEFAULT_PROPERTY_TAX_RATE,
  DEFAULT_OCCUPANCY_RAMP_MONTHS,
  BUSINESS_MODEL_DEFAULTS,
} from '@/lib/constants';
import {
  DEFAULT_AR_DAYS,
  DEFAULT_AP_DAYS,
  DEFAULT_ESCALATION_METHOD,
  DEFAULT_COST_SEG_5YR_PCT,
  DEFAULT_COST_SEG_7YR_PCT,
  DEFAULT_COST_SEG_15YR_PCT,
  COST_SEG_5YR_LIFE_YEARS,
  COST_SEG_7YR_LIFE_YEARS,
  COST_SEG_15YR_LIFE_YEARS,
  MONTHS_PER_YEAR,
} from '@shared/constants';
import { PropertyInput, GlobalInput } from '../types';
import { parseLocalDate } from '../helpers/utils';
import { assertFinite, dDiv, dPow } from '@calc/shared/decimal.js';

export interface PropertyEngineContext {
  modelStart: Date;
  opsStart: Date;
  acquisitionDate: Date;
  startYear: number;
  startMonth: number;
  opsStartIdx: number;
  acqMonthIdx: number;

  landPct: number;
  buildingValue: number;
  totalPropertyValue: number;
  totalPropertyValueDiv12: number;

  depreciationYears: number;
  costSegEnabled: boolean;
  monthlyDepreciation: number;
  costSeg5yrMonthly: number;
  costSeg7yrMonthly: number;
  costSeg15yrMonthly: number;
  costSegRestMonthly: number;
  costSeg5yrBasis: number;
  costSeg7yrBasis: number;
  costSeg15yrBasis: number;
  costSegRestBasis: number;

  originalLoanAmount: number;
  loanRate: number;
  taxRate: number;
  dayCountConvention: string;
  monthlyRate: number;
  totalPayments: number;
  monthlyPayment: number;
  isFinanced: boolean;
  loanN: number;

  arDays: number;
  apDays: number;
  escalationMethod: string;

  costRateRooms: number;
  costRateFB: number;
  costRateAdmin: number;
  costRateMarketing: number;
  costRatePropertyOps: number;
  costRateUtilities: number;
  costRateTaxes: number;
  costRateIT: number;
  costRateFFE: number;
  costRateOther: number;
  costRateInsurance: number;
  eventExpenseRate: number;
  otherExpenseRate: number;
  utilitiesVariableSplit: number;
  utilitiesFixedSplit: number;
  adrGrowthRate: number;
  effectiveInflation: number;
  fixedEscalationRate: number;
  incentiveFeeRate: number;
  baseMgmtFeeRate: number;
  activeFeeCategories: { name: string; rate: number; isActive: boolean }[] | undefined;
  hasActiveFeeCategories: boolean;

  pricingModel: "per_room" | "per_property";
  nightlyPropertyRate: number;
  rampMonths: number;
  availableRooms: number;
  daysPerMonth: number;
  baseAdr: number;
  baseMonthlyRoomRev: number;
  baseMonthlyTotalRev: number;
  revShareEvents: number;
  revShareFB: number;
  revShareOther: number;
  cateringBoostMultiplier: number;
  platformFeeRate: number;
  preOpeningMonthlyBurn: number;

  needsDaysLookup: boolean;
  daysInMonthLookup: number[];
  adrFactors: number[];
  fixedEscFactors: number[];
  monthlyEscRate: number;

  // Seasonality (12 monthly factors, null = flat)
  seasonalityProfile: number[] | null;
  // Occupancy ramp curve (annual % of stabilized, null = use step function)
  occupancyRampCurve: number[] | null;
  // Owner's priority return (fraction of equity invested required before incentive fees)
  ownerPriorityReturn: number;
  // Fee subordination mode: "none" | "partial" | "full"
  feeSubordination: string;
  // Equity invested (for priority return calculation)
  equityInvested: number;

  nolBalance: number;
  cumulativeCash: number;
  cumulativeOwnerCashFlow: number;
  cumulativeDeferredFees: number;
  prevDebtOutstanding: number;
  acqDebtMonthCount: number;
  prevAR: number;
  prevAP: number;
}

export function resolvePropertyAssumptions(
  property: PropertyInput,
  global: GlobalInput,
  months: number
): PropertyEngineContext {
  const modelStart = startOfMonth(parseLocalDate(global.modelStartDate));
  const opsStart = startOfMonth(parseLocalDate(property.operationsStartDate));
  const acquisitionDate = property.acquisitionDate ? startOfMonth(parseLocalDate(property.acquisitionDate)) : opsStart;

  const landPct = property.landValuePercent ?? DEFAULT_LAND_VALUE_PERCENT;
  const buildingValue = property.purchasePrice * (1 - landPct) + (property.buildingImprovements ?? 0);

  const depreciationYears = (property.depreciationYears ?? global.depreciationYears ?? DEPRECIATION_YEARS) || DEPRECIATION_YEARS;
  const daysPerMonth = global.daysPerMonth ?? DAYS_PER_MONTH;

  const costSegEnabled = property.costSegEnabled ?? false;
  let monthlyDepreciation = assertFinite(dDiv(dDiv(buildingValue, depreciationYears), MONTHS_PER_YEAR), 'monthlyDepreciation');
  let costSeg5yrMonthly = 0;
  let costSeg7yrMonthly = 0;
  let costSeg15yrMonthly = 0;
  let costSegRestMonthly = 0;
  let costSeg5yrBasis = 0;
  let costSeg7yrBasis = 0;
  let costSeg15yrBasis = 0;
  let costSegRestBasis = 0;
  if (costSegEnabled) {
    let pct5 = property.costSeg5yrPct ?? DEFAULT_COST_SEG_5YR_PCT;
    let pct7 = property.costSeg7yrPct ?? DEFAULT_COST_SEG_7YR_PCT;
    let pctLong = property.costSeg15yrPct ?? DEFAULT_COST_SEG_15YR_PCT;
    // Clamp proportionally if percentages sum > 100%
    const totalPct = pct5 + pct7 + pctLong;
    if (totalPct > 1) {
      const scale = 1 / totalPct;
      pct5 *= scale;
      pct7 *= scale;
      pctLong *= scale;
    }
    const pctRest = 1 - pct5 - pct7 - pctLong;
    costSeg5yrBasis = buildingValue * pct5;
    costSeg7yrBasis = buildingValue * pct7;
    costSeg15yrBasis = buildingValue * pctLong;
    costSegRestBasis = buildingValue * Math.max(0, pctRest);
    costSeg5yrMonthly = assertFinite(dDiv(dDiv(costSeg5yrBasis, COST_SEG_5YR_LIFE_YEARS), MONTHS_PER_YEAR), 'costSeg5yrMonthly');
    costSeg7yrMonthly = assertFinite(dDiv(dDiv(costSeg7yrBasis, COST_SEG_7YR_LIFE_YEARS), MONTHS_PER_YEAR), 'costSeg7yrMonthly');
    costSeg15yrMonthly = assertFinite(dDiv(dDiv(costSeg15yrBasis, COST_SEG_15YR_LIFE_YEARS), MONTHS_PER_YEAR), 'costSeg15yrMonthly');
    costSegRestMonthly = assertFinite(dDiv(dDiv(costSegRestBasis, depreciationYears), MONTHS_PER_YEAR), 'costSegRestMonthly');
  }

  const totalPropertyValue = property.purchasePrice + (property.buildingImprovements ?? 0);
  const ltv = property.acquisitionLTV ?? DEFAULT_LTV;
  const originalLoanAmount = property.type === "Financed" ? totalPropertyValue * ltv : 0;
  const loanRate = property.acquisitionInterestRate ?? DEFAULT_INTEREST_RATE;
  const loanTerm = property.acquisitionTermYears ?? DEFAULT_TERM_YEARS;
  // Income tax rate (NOT property tax — property taxes use costRateTaxes)
  const taxRate = property.taxRate ?? DEFAULT_PROPERTY_TAX_RATE;
  const dayCountConvention = property.dayCountConvention ?? '30/360';
  const monthlyRate = loanRate / MONTHS_PER_YEAR;
  const totalPayments = loanTerm * MONTHS_PER_YEAR;
  let monthlyPayment = 0;
  if (originalLoanAmount > 0) {
    monthlyPayment = assertFinite(pmt(originalLoanAmount, monthlyRate, totalPayments), 'monthlyPayment');
  }

  const arDays = property.arDays ?? DEFAULT_AR_DAYS;
  const apDays = property.apDays ?? DEFAULT_AP_DAYS;
  const escalationMethod = property.escalationMethod ?? DEFAULT_ESCALATION_METHOD;

  const bm = (property.businessModel as 'hotel' | 'lodge' | 'vrbo') ?? 'hotel';
  const modelDefaults = BUSINESS_MODEL_DEFAULTS[bm] ?? BUSINESS_MODEL_DEFAULTS.hotel;

  const pricingModel = property.pricingModel ?? 'per_room';
  const nightlyPropertyRate = property.nightlyPropertyRate ?? 0;
  const baseAdr = property.startAdr;
  // Per-room: roomCount × daysPerMonth × ADR × occupancy
  // Per-property: nightlyPropertyRate × daysPerMonth × occupancy (whole property, one unit)
  const baseMonthlyRoomRev = pricingModel === 'per_property'
    ? nightlyPropertyRate * daysPerMonth * property.startOccupancy
    : property.roomCount * daysPerMonth * baseAdr * property.startOccupancy;
  const revShareEvents = property.revShareEvents ?? modelDefaults.revShareEvents;
  const revShareFB = property.revShareFB ?? modelDefaults.revShareFB;
  const revShareOther = property.revShareOther ?? modelDefaults.revShareOther;
  const cateringBoostPct = property.cateringBoostPercent ?? modelDefaults.cateringBoostPct;
  const cateringBoostMultiplier = 1 + cateringBoostPct;
  const ancillaryShare = revShareEvents + revShareFB + revShareOther;
  const roomShareOfTotal = Math.max(0.05, 1 - ancillaryShare);
  const baseMonthlyTotalRev = baseMonthlyRoomRev / roomShareOfTotal;

  const startYear = modelStart.getFullYear();
  const startMonth = modelStart.getMonth();
  const opsStartIdx = (opsStart.getFullYear() - startYear) * MONTHS_PER_YEAR + (opsStart.getMonth() - startMonth);
  const acqMonthIdx = (acquisitionDate.getFullYear() - startYear) * MONTHS_PER_YEAR + (acquisitionDate.getMonth() - startMonth);

  const needsDaysLookup = dayCountConvention === 'ACT/360' || dayCountConvention === 'ACT/365';
  const daysInMonthLookup: number[] = needsDaysLookup ? new Array(months) : [];
  if (needsDaysLookup) {
    for (let i = 0; i < months; i++) {
      const totalM = startMonth + i;
      const y = startYear + Math.floor(totalM / MONTHS_PER_YEAR);
      const m = totalM % MONTHS_PER_YEAR;
      daysInMonthLookup[i] = new Date(y, m + 1, 0).getDate();
    }
  }

  const costRateRooms = property.costRateRooms ?? modelDefaults.costRateRooms;
  const costRateFB = property.costRateFB ?? modelDefaults.costRateFB;
  const costRateAdmin = property.costRateAdmin ?? modelDefaults.costRateAdmin;
  const costRateMarketing = property.costRateMarketing ?? modelDefaults.costRateMarketing;
  const costRatePropertyOps = property.costRatePropertyOps ?? modelDefaults.costRatePropertyOps;
  const costRateUtilities = property.costRateUtilities ?? modelDefaults.costRateUtilities;
  const costRateTaxes = property.costRateTaxes ?? modelDefaults.costRateTaxes;
  const costRateIT = property.costRateIT ?? modelDefaults.costRateIT;
  const costRateFFE = property.costRateFFE ?? modelDefaults.costRateFFE;
  const costRateOther = property.costRateOther ?? modelDefaults.costRateOther;
  const costRateInsurance = property.costRateInsurance ?? modelDefaults.costRateInsurance;
  const eventExpenseRate = global.eventExpenseRate ?? modelDefaults.eventExpenseRate;
  const otherExpenseRate = global.otherExpenseRate ?? modelDefaults.otherExpenseRate;
  const utilitiesVariableSplit = global.utilitiesVariableSplit ?? DEFAULT_UTILITIES_VARIABLE_SPLIT;
  const utilitiesFixedSplit = 1 - utilitiesVariableSplit;
  const adrGrowthRate = property.adrGrowthRate ?? 0;
  const effectiveInflation = property.inflationRate ?? global.inflationRate;
  const fixedEscalationRate = global.fixedCostEscalationRate ?? effectiveInflation;
  const incentiveFeeRate = property.incentiveManagementFeeRate ?? modelDefaults.incentiveMgmtFeeRate;
  const baseMgmtFeeRate = property.baseManagementFeeRate ?? modelDefaults.baseMgmtFeeRate;
  const activeFeeCategories = property.feeCategories?.filter(c => c.isActive);
  const hasActiveFeeCategories = activeFeeCategories != null && activeFeeCategories.length > 0;
  const rampMonths = Math.max(1, property.occupancyRampMonths ?? DEFAULT_OCCUPANCY_RAMP_MONTHS);
  const availableRooms = property.roomCount * daysPerMonth;
  const totalPropertyValueDiv12 = totalPropertyValue / MONTHS_PER_YEAR;
  const isFinanced = property.type === "Financed";
  const loanN = loanTerm * MONTHS_PER_YEAR;

  const maxMonthsSinceOps = opsStartIdx < 0 ? months - 1 + Math.abs(opsStartIdx) : months - 1;
  const maxOpsYear = Math.floor(maxMonthsSinceOps / MONTHS_PER_YEAR) + 1;
  const adrFactors = new Array(maxOpsYear);
  const fixedEscFactors = new Array(maxOpsYear);
  for (let y = 0; y < maxOpsYear; y++) {
    adrFactors[y] = assertFinite(dPow(1 + adrGrowthRate, y), `adrFactor[year=${y}]`);
    fixedEscFactors[y] = assertFinite(dPow(1 + fixedEscalationRate, y), `fixedEscFactor[year=${y}]`);
  }
  const monthlyEscRate = escalationMethod === 'monthly' ? dPow(1 + fixedEscalationRate, 1 / MONTHS_PER_YEAR) - 1 : 0;

  return {
    modelStart,
    opsStart,
    acquisitionDate,
    startYear,
    startMonth,
    opsStartIdx,
    acqMonthIdx,
    landPct,
    buildingValue,
    totalPropertyValue,
    totalPropertyValueDiv12,
    depreciationYears,
    costSegEnabled,
    monthlyDepreciation,
    costSeg5yrMonthly,
    costSeg7yrMonthly,
    costSeg15yrMonthly,
    costSegRestMonthly,
    costSeg5yrBasis,
    costSeg7yrBasis,
    costSeg15yrBasis,
    costSegRestBasis,
    originalLoanAmount,
    loanRate,
    taxRate,
    dayCountConvention,
    monthlyRate,
    totalPayments,
    monthlyPayment,
    isFinanced,
    loanN,
    arDays,
    apDays,
    escalationMethod,
    costRateRooms,
    costRateFB,
    costRateAdmin,
    costRateMarketing,
    costRatePropertyOps,
    costRateUtilities,
    costRateTaxes,
    costRateIT,
    costRateFFE,
    costRateOther,
    costRateInsurance,
    eventExpenseRate,
    otherExpenseRate,
    utilitiesVariableSplit,
    utilitiesFixedSplit,
    adrGrowthRate,
    effectiveInflation,
    fixedEscalationRate,
    incentiveFeeRate,
    baseMgmtFeeRate,
    activeFeeCategories,
    hasActiveFeeCategories,
    pricingModel,
    nightlyPropertyRate,
    rampMonths,
    availableRooms,
    daysPerMonth,
    baseAdr,
    baseMonthlyRoomRev,
    baseMonthlyTotalRev,
    revShareEvents,
    revShareFB,
    revShareOther,
    cateringBoostMultiplier,
    platformFeeRate: property.platformFeeRate ?? modelDefaults.platformFeeRate,
    preOpeningMonthlyBurn: property.preOpeningMonthlyBurn ?? modelDefaults.preOpeningMonthlyBurn,
    needsDaysLookup,
    daysInMonthLookup,
    adrFactors,
    fixedEscFactors,
    monthlyEscRate,
    seasonalityProfile: property.seasonalityProfile ?? null,
    occupancyRampCurve: property.occupancyRampCurve ?? null,
    ownerPriorityReturn: property.ownerPriorityReturn ?? 0,
    feeSubordination: property.feeSubordination ?? 'none',
    equityInvested: totalPropertyValue - originalLoanAmount,
    nolBalance: 0,
    cumulativeCash: 0,
    cumulativeOwnerCashFlow: 0,
    cumulativeDeferredFees: 0,
    prevDebtOutstanding: originalLoanAmount,
    acqDebtMonthCount: 0,
    prevAR: 0,
    prevAP: 0,
  };
}
