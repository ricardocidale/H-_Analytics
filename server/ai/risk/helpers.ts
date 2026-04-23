/**
 * Shared helpers for the risk-intelligence module: formatting, deterministic
 * per-property financial estimators, and the builder for the
 * `RiskWorkingSet` session object consumed by every insight generator.
 */

import type { Property } from "@shared/schema";
import type {
  PropertyFinancials,
  RiskInsight,
  RiskWorkingSet,
  RiskAffectedEntity,
  OverallRiskLevel,
} from "@shared/risk-types";
import { pmt } from "../../../calc/shared/pmt";

// ─── Formatting ────────────────────────────────────────────────────────────────

export function pct(val: number): string {
  return `${(val * 100).toFixed(1)}%`;
}

export function dollars(val: number): string {
  return `$${Math.round(val).toLocaleString("en-US")}`;
}

// ─── Per-property financial estimators ─────────────────────────────────────────

export function estimateAnnualRevenue(p: Property): number {
  const roomCount = p.roomCount ?? 1;
  const adr = p.startAdr ?? 0;
  const occupancy = p.maxOccupancy ?? 0.7;
  const isPricingPerProperty = p.pricingModel === "per_property";
  const nightlyRate = isPricingPerProperty
    ? (p.nightlyPropertyRate ?? adr)
    : 0;
  const roomRevenue = isPricingPerProperty
    ? nightlyRate * occupancy * 365
    : roomCount * adr * occupancy * 365;
  const ancillary = 1 + (p.revShareFB ?? 0) + (p.revShareEvents ?? 0) + (p.revShareOther ?? 0);
  return roomRevenue * ancillary;
}

export function computeTotalCostRate(p: Property): number {
  return (p.costRateRooms ?? 0) + (p.costRateFB ?? 0) + (p.costRateAdmin ?? 0) +
    (p.costRateMarketing ?? 0) + (p.costRatePropertyOps ?? 0) + (p.costRateUtilities ?? 0) +
    (p.costRateTaxes ?? 0) + (p.costRateIT ?? 0) + (p.costRateFFE ?? 0) + (p.costRateOther ?? 0) +
    (p.costRateInsurance ?? 0);
}

export function estimateNOI(p: Property): number {
  const revenue = estimateAnnualRevenue(p);
  return revenue * (1 - computeTotalCostRate(p));
}

export function estimateAnnualDebtService(p: Property): number {
  const ltv = p.acquisitionLTV ?? 0;
  const loanAmount = (p.purchasePrice ?? 0) * ltv;
  const monthlyRate = (p.acquisitionInterestRate ?? 0.065) / 12;
  const termMonths = (p.acquisitionTermYears ?? 25) * 12;
  if (loanAmount <= 0 || monthlyRate <= 0 || termMonths <= 0) return 0;
  return pmt(loanAmount, monthlyRate, termMonths) * 12;
}

// ─── Entity / severity helpers ─────────────────────────────────────────────────

export function propertyEntity(p: Property): RiskAffectedEntity {
  return { type: "property", id: p.id, name: p.name };
}

export function assessPropertyRiskLevel(insights: RiskInsight[]): OverallRiskLevel {
  const criticalCount = insights.filter(i => i.severity === "critical").length;
  const warningCount = insights.filter(i => i.severity === "warning").length;
  const cautionCount = insights.filter(i => i.severity === "caution").length;
  if (criticalCount > 0) return "high";
  if (warningCount >= 2) return "elevated";
  if (warningCount >= 1 || cautionCount >= 3) return "moderate";
  return "low";
}

// ─── Working set builder ───────────────────────────────────────────────────────

/**
 * Build the precomputed `RiskWorkingSet` consumed by every insight generator.
 * All per-property financial estimates are computed exactly once here, so
 * downstream generators share a single authoritative snapshot.
 */
export function buildRiskWorkingSet(properties: Property[]): RiskWorkingSet {
  const rows: PropertyFinancials[] = properties.map((p) => {
    const revenue = estimateAnnualRevenue(p);
    const noi = estimateNOI(p);
    const debtService = estimateAnnualDebtService(p);
    const dscr = debtService > 0 ? noi / debtService : 99;
    return {
      property: p,
      revenue,
      noi,
      debtService,
      dscr,
      totalCostRate: computeTotalCostRate(p),
    };
  });

  const byId = new Map<number, PropertyFinancials>();
  let totalRevenue = 0;
  for (const row of rows) {
    byId.set(row.property.id, row);
    totalRevenue += row.revenue;
  }

  return { properties: rows, byId, totalRevenue };
}
