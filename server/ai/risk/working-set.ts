/**
 * server/ai/risk/working-set.ts — Builder + pure helpers for risk insights.
 *
 * The working set (`RiskWorkingSet`) is the pre-computed per-property
 * financial snapshot consumed by every insight generator in this folder.
 * Keeping the revenue / NOI / debt-service math in one place guarantees that
 * all generators agree on a property's baseline numbers.
 */

import type { Property } from "@shared/schema";
import type {
  PropertyFinancials,
  RiskInsight,
  RiskLevel,
  RiskWorkingSet,
} from "@shared/risk-types";
import { pmt } from "../../../calc/shared/pmt";

// ─── Formatting helpers ──────────────────────────────────────────────────────

export function pct(val: number): string {
  return `${(val * 100).toFixed(1)}%`;
}

export function dollars(val: number): string {
  return `$${Math.round(val).toLocaleString("en-US")}`;
}

// ─── Per-property financial estimators ───────────────────────────────────────

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

export function totalCostRate(p: Property): number {
  return (
    (p.costRateRooms ?? 0) +
    (p.costRateFB ?? 0) +
    (p.costRateAdmin ?? 0) +
    (p.costRateMarketing ?? 0) +
    (p.costRatePropertyOps ?? 0) +
    (p.costRateUtilities ?? 0) +
    (p.costRateTaxes ?? 0) +
    (p.costRateIT ?? 0) +
    (p.costRateFFE ?? 0) +
    (p.costRateOther ?? 0) +
    (p.costRateInsurance ?? 0)
  );
}

export function estimateNOI(p: Property): number {
  return estimateAnnualRevenue(p) * (1 - totalCostRate(p));
}

export function estimateAnnualDebtService(p: Property): number {
  const ltv = p.acquisitionLTV ?? 0;
  const loanAmount = (p.purchasePrice ?? 0) * ltv;
  const monthlyRate = (p.acquisitionInterestRate ?? 0.065) / 12;
  const termMonths = (p.acquisitionTermYears ?? 25) * 12;
  if (loanAmount <= 0 || monthlyRate <= 0 || termMonths <= 0) return 0;
  return pmt(loanAmount, monthlyRate, termMonths) * 12;
}

// ─── Working-set builder ─────────────────────────────────────────────────────

export function buildPropertyFinancials(p: Property): PropertyFinancials {
  const revenue = estimateAnnualRevenue(p);
  const costRate = totalCostRate(p);
  const noi = revenue * (1 - costRate);
  const debtService = estimateAnnualDebtService(p);
  const dscr = debtService > 0 ? noi / debtService : 99;
  return { property: p, revenue, noi, debtService, dscr, totalCostRate: costRate };
}

export function buildRiskWorkingSet(properties: Property[]): RiskWorkingSet {
  const rows = properties.map(buildPropertyFinancials);
  const byId = new Map<number, PropertyFinancials>();
  for (const row of rows) byId.set(row.property.id, row);
  return { properties: rows, byId };
}

// ─── Affected-entity helper ──────────────────────────────────────────────────

export function propertyEntity(p: Property): { type: "property"; id: number; name: string } {
  return { type: "property", id: p.id, name: p.name };
}

export function assessPropertyRiskLevel(insights: RiskInsight[]): RiskLevel {
  const criticalCount = insights.filter((i) => i.severity === "critical").length;
  const warningCount = insights.filter((i) => i.severity === "warning").length;
  const cautionCount = insights.filter((i) => i.severity === "caution").length;
  if (criticalCount > 0) return "high";
  if (warningCount >= 2) return "elevated";
  if (warningCount >= 1 || cautionCount >= 3) return "moderate";
  return "low";
}
