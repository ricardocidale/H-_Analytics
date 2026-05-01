/**
 * compute_make_vs_buy — Hospitality Outsourcing Decision Tool
 * 
 * Compares the total cost of ownership (TCO) for performing a service in-house
 * (labor, overhead, training, benefits) versus outsourcing to a third-party 
 * vendor (contract price, management oversight).
 * 
 * Logic follows standard hospitality management accounting (USALI) for 
 * departmental vs. unallocated expenses.
 */
import { DEFAULT_ROUNDING } from "../shared/utils.js";
import { dPow } from "../shared/decimal.js";
import {
  RESEARCH_MAKE_VS_BUY_MARGINAL_THRESHOLD,
  RESEARCH_MAKE_VS_BUY_DEFAULT_DISCOUNT_RATE,
  RESEARCH_MAKE_VS_BUY_DEFAULT_ESCALATION_RATE,
} from "../../shared/constants.js";

interface MakeVsBuyInput {
  serviceName: string;
  inHouseLabor: number;
  benefitsRate: number;
  trainingAnnual: number;
  suppliesAnnual: number;
  allocatedOverhead: number;
  vendorContractPrice: number;
  internalOversightHours: number;
  managerHourlyRate: number;
  unitCount: number;
  projection_years?: number;
  discount_rate?: number;
  cost_escalation_rate?: number;
  rounding_policy?: typeof DEFAULT_ROUNDING;
}

interface MakeVsBuyResult {
  service: string;
  totalInHouseCost: number;
  totalVendorCost: number;
  annualSavings: number;
  savingsPercent: number;
  costPerUnitInHouse: number;
  costPerUnitVendor: number;
  breakEvenUnits: number;
  npv_inhouse: number;
  npv_vendor: number;
  npv_savings: number;
  recommendation: 'In-House' | 'Outsource' | 'Marginal';
  analysis: string;
}

export function computeMakeVsBuy(input: MakeVsBuyInput): MakeVsBuyResult {
  const {
    serviceName,
    inHouseLabor,
    benefitsRate,
    trainingAnnual,
    suppliesAnnual,
    allocatedOverhead,
    vendorContractPrice,
    internalOversightHours,
    managerHourlyRate,
    unitCount
  } = input;

  // 1. Calculate Total In-House Cost
  const fullyLoadedLabor = inHouseLabor * (1 + benefitsRate);
  const totalInHouseCost = fullyLoadedLabor + trainingAnnual + suppliesAnnual + allocatedOverhead;

  // 2. Calculate Total Vendor Cost
  const oversightCost = internalOversightHours * 52 * managerHourlyRate;
  const totalVendorCost = vendorContractPrice + oversightCost;

  // 3. Comparisons
  const annualSavings = totalInHouseCost - totalVendorCost;
  const savingsPercent = totalInHouseCost > 0 ? (annualSavings / totalInHouseCost) : 0;
  
  const costPerUnitInHouse = unitCount > 0 ? (totalInHouseCost / unitCount) : 0;
  const costPerUnitVendor = unitCount > 0 ? (totalVendorCost / unitCount) : 0;

  const breakEvenUnits = unitCount;

  const projYears = input.projection_years ?? 5;
  const discRate = input.discount_rate ?? RESEARCH_MAKE_VS_BUY_DEFAULT_DISCOUNT_RATE;
  const escalation = input.cost_escalation_rate ?? RESEARCH_MAKE_VS_BUY_DEFAULT_ESCALATION_RATE;
  let npvInhouse = 0;
  let npvVendor = 0;
  for (let y = 1; y <= projYears; y++) {
    const factor = dPow(1 + escalation, y - 1);
    const discFactor = dPow(1 + discRate, y);
    npvInhouse += (totalInHouseCost * factor) / discFactor;
    npvVendor += (totalVendorCost * factor) / discFactor;
  }
  npvInhouse = Math.round(npvInhouse * 100) / 100;
  npvVendor = Math.round(npvVendor * 100) / 100;
  const npvSavings = Math.round((npvInhouse - npvVendor) * 100) / 100;

  let recommendation: 'In-House' | 'Outsource' | 'Marginal';
  const MARGINAL_THRESHOLD = RESEARCH_MAKE_VS_BUY_MARGINAL_THRESHOLD;
  const npvDiffPct = npvInhouse > 0 ? npvSavings / npvInhouse : savingsPercent;
  if (npvDiffPct > MARGINAL_THRESHOLD) {
    recommendation = 'Outsource';
  } else if (npvDiffPct < -MARGINAL_THRESHOLD) {
    recommendation = 'In-House';
  } else {
    recommendation = 'Marginal';
  }

  const analysis = recommendation === 'Outsource' 
    ? `Outsourcing ${serviceName} is projected to save $${Math.abs(annualSavings).toLocaleString()} annually (${(savingsPercent * 100).toFixed(1)}%).`
    : recommendation === 'In-House'
    ? `In-house operations for ${serviceName} are $${Math.abs(annualSavings).toLocaleString()} more cost-effective than vendor quotes.`
    : `The financial difference between in-house and outsourcing for ${serviceName} is marginal (${(savingsPercent * 100).toFixed(1)}%). Consider qualitative factors like quality control and flexibility.`;

  return {
    service: serviceName,
    totalInHouseCost,
    totalVendorCost,
    annualSavings,
    savingsPercent,
    costPerUnitInHouse,
    costPerUnitVendor,
    breakEvenUnits,
    npv_inhouse: npvInhouse,
    npv_vendor: npvVendor,
    npv_savings: npvSavings,
    recommendation,
    analysis
  };
}
