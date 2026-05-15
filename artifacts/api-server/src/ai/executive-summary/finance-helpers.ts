/**
 * server/ai/executive-summary/finance-helpers.ts — Deterministic finance
 * helpers for the executive summary generator. Pure, side-effect free
 * functions that compute metrics and stress narratives from a property
 * record. Split out of executive-summary.ts.
 */

import type { Property } from "@workspace/db";
import { dPow } from "@calc/shared/decimal";
import { getCountryDefaults } from "@shared/countryDefaults";
import { getRegulatoryProfile } from "@shared/regulatory-data";
import { computeStressScenarios, type StressAssumptions, type StressThresholds } from "@engine/helpers/stress-scenarios";
import { pmt } from "@calc/shared/pmt";
import type { PropertyExecutiveSummary } from "./types";

// ─── Formatters ──────────────────────────────────────────────────────────────

export function pct(val: number): string {
  return `${(val * 100).toFixed(1)}%`;
}

export function dollars(val: number): string {
  const abs = Math.abs(val);
  if (abs >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${Math.round(val / 1_000).toLocaleString("en-US")}K`;
  return `$${Math.round(val).toLocaleString("en-US")}`;
}

// ─── Property-derived estimates ──────────────────────────────────────────────

export function estimateAnnualRevenue(p: Property): number {
  const roomCount = p.roomCount ?? 1;
  const adr = p.startAdr ?? 0;
  const occupancy = p.maxOccupancy ?? 0.7;
  const isPricingPerProperty = p.pricingModel === "per_property";
  const nightlyRate = isPricingPerProperty ? (p.nightlyPropertyRate ?? adr) : 0;
  const roomRevenue = isPricingPerProperty
    ? nightlyRate * occupancy * 365
    : roomCount * adr * occupancy * 365;
  const ancillary = 1 + (p.revShareFB ?? 0) + (p.revShareEvents ?? 0) + (p.revShareOther ?? 0);
  return roomRevenue * ancillary;
}

export function estimateNOI(p: Property): number {
  const revenue = estimateAnnualRevenue(p);
  const totalCostRate =
    (p.costRateRooms ?? 0) + (p.costRateFB ?? 0) + (p.costRateAdmin ?? 0) +
    (p.costRateMarketing ?? 0) + (p.costRatePropertyOps ?? 0) + (p.costRateUtilities ?? 0) +
    (p.costRateTaxes ?? 0) + (p.costRateIT ?? 0) + (p.costRateFFE ?? 0) +
    (p.costRateOther ?? 0) + (p.costRateInsurance ?? 0);
  return revenue * (1 - totalCostRate);
}

export function estimateAnnualDebtService(p: Property): number {
  const ltv = p.acquisitionLTV ?? 0;
  const loanAmount = (p.purchasePrice ?? 0) * ltv;
  const monthlyRate = (p.acquisitionInterestRate ?? 0.065) / 12;
  const termMonths = (p.acquisitionTermYears ?? 25) * 12;
  if (loanAmount <= 0 || monthlyRate <= 0 || termMonths <= 0) return 0;
  return pmt(loanAmount, monthlyRate, termMonths) * 12;
}

export function computeEquityInvested(p: Property): number {
  const purchasePrice = p.purchasePrice ?? 0;
  const improvements = p.buildingImprovements ?? 0;
  const totalInvestment = purchasePrice + improvements;
  const ltv = p.acquisitionLTV ?? 0;
  const loanAmount = purchasePrice * ltv;
  return totalInvestment - loanAmount;
}

// ─── Key Metrics (deterministic) ─────────────────────────────────────────────

export function computeKeyMetrics(p: Property): PropertyExecutiveSummary["keyMetrics"] {
  const purchasePrice = p.purchasePrice ?? 0;
  const improvements = p.buildingImprovements ?? 0;
  const totalInvestment = purchasePrice + improvements;
  const equity = computeEquityInvested(p);

  const stabilizedNOI = estimateNOI(p);
  const exitCapRate = p.exitCapRate ?? 0.07;
  const exitValue = exitCapRate > 0 ? stabilizedNOI / exitCapRate : 0;

  const debtService = estimateAnnualDebtService(p);
  const hasDebt = debtService > 0;
  const dscr = hasDebt ? stabilizedNOI / debtService : null;

  const cashFlow = stabilizedNOI - debtService;
  const cashOnCash = equity > 0 ? cashFlow / equity : 0;

  // Simplified IRR estimate: (NOI + appreciation) / equity over hold period
  const holdYears = 7;
  const totalCashFlows = cashFlow * holdYears;
  const dispositionProceeds = exitValue - (purchasePrice * (p.acquisitionLTV ?? 0)); // exit minus loan payoff (simplified)
  const totalReturn = totalCashFlows + dispositionProceeds;
  const equityMultiple = equity > 0 ? totalReturn / equity : 0;

  // Approximate IRR from equity multiple and hold period
  const projectedIRR = equity > 0 && holdYears > 0
    ? dPow(Math.max(equityMultiple, 0.01), 1 / holdYears) - 1
    : 0;

  // Payback years: equity / annual cash flow
  const paybackYears = cashFlow > 0 ? equity / cashFlow : holdYears;

  return {
    totalInvestment,
    projectedIRR,
    equityMultiple,
    stabilizedNOI,
    exitValue,
    dscr,
    cashOnCash,
    paybackYears: Math.min(paybackYears, holdYears),
  };
}

// ─── Stress Summary ──────────────────────────────────────────────────────────

function buildStressAssumptions(p: Property): StressAssumptions {
  const ltv = p.acquisitionLTV ?? 0;
  const loanAmount = (p.purchasePrice ?? 0) * ltv;

  return {
    roomCount: p.roomCount ?? 1,
    startAdr: p.startAdr ?? 0,
    startOccupancy: p.startOccupancy ?? (p.maxOccupancy ?? 0.7),
    maxOccupancy: p.maxOccupancy ?? 0.7,
    revShareFB: p.revShareFB ?? 0,
    revShareEvents: p.revShareEvents ?? 0,
    revShareOther: p.revShareOther ?? 0,
    costRateRooms: p.costRateRooms ?? 0,
    costRateAdmin: p.costRateAdmin ?? 0,
    costRateMarketing: p.costRateMarketing ?? 0,
    costRatePropertyOps: p.costRatePropertyOps ?? 0,
    costRateUtilities: p.costRateUtilities ?? 0,
    baseFeePercent: p.baseManagementFeeRate ?? 0.03,
    incentiveFeePercent: p.incentiveManagementFeeRate ?? 0.10,
    loanAmount: loanAmount > 0 ? loanAmount : undefined,
    interestRate: loanAmount > 0 ? (p.acquisitionInterestRate ?? 0.065) : undefined,
    loanTermYears: loanAmount > 0 ? (p.acquisitionTermYears ?? 25) : undefined,
    purchasePrice: p.purchasePrice ?? 0,
  };
}

export function summarizeWorstStress(p: Property, stressThresholds?: StressThresholds): string {
  try {
    const stressResults = computeStressScenarios(buildStressAssumptions(p), stressThresholds);
    const worst = stressResults
      .filter(r => r.severity === "critical" || r.severity === "severe")
      .sort((a, b) => a.impactOnNoiPercent - b.impactOnNoiPercent);

    if (worst.length === 0) {
      return "All five stress scenarios remain within acceptable parameters.";
    }
    const w = worst[0];
    return `${w.scenario}: ${w.narrative}`;
  } catch {
    return "Stress test data unavailable.";
  }
}

// ─── Regulatory Highlights ───────────────────────────────────────────────────

export function getRegulatoryHighlights(country: string): string {
  const profile = getRegulatoryProfile(country);
  const defaults = getCountryDefaults(country);
  const parts: string[] = [];

  if (defaults) {
    parts.push(`Tax rate: ${pct(defaults.taxRate)}`);
    if (defaults.countryRiskPremium > 0.01) {
      parts.push(`Country risk premium: ${pct(defaults.countryRiskPremium)}`);
    }
  }
  if (profile) {
    if (!profile.foreignInvestment.foreignOwnershipAllowed) {
      parts.push("Foreign ownership restricted");
    }
    if (profile.licensing.typicalTimeline) {
      parts.push(`Licensing: ${profile.licensing.typicalTimeline}`);
    }
  }

  return parts.length > 0 ? parts.join(". ") : `${country} — standard investment jurisdiction`;
}
