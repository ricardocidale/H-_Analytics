/**
 * shared/risk-types.ts — Portable contracts for the risk-intelligence engine.
 *
 * Pure type declarations only. No runtime logic. These are consumed by
 * server-side risk generators (see `server/ai/risk/`) and by any frontend
 * surface that needs to render a risk brief.
 *
 * The `RiskWorkingSet` is the transaction-scoped session object introduced by
 * Audit #319 R5 Phase 6: it captures the per-property financials that every
 * risk generator needs, computed once and passed around instead of being
 * re-derived in each function.
 */

import type { Property } from "@workspace/db/schema/properties";

// ─── Public narrative interfaces ──────────────────────────────────────────────

export type RiskCategory =
  | "leverage"
  | "market"
  | "operational"
  | "regulatory"
  | "macro"
  | "concentration"
  | "assumption";

export type RiskSeverity = "info" | "caution" | "warning" | "critical";

export type OverallRiskLevel = "low" | "moderate" | "elevated" | "high";

export interface RiskDataPoint {
  label: string;
  value: string;
  benchmark?: string;
  delta?: string;
}

export interface RiskAffectedEntity {
  type: "property" | "company";
  id: number;
  name: string;
}

export interface RiskInsight {
  category: RiskCategory;
  severity: RiskSeverity;
  title: string;
  narrative: string;
  dataPoints: RiskDataPoint[];
  actionItems: string[];
  affectedEntities: RiskAffectedEntity[];
}

export interface PropertyRiskBrief {
  propertyId: number;
  propertyName: string;
  overallRiskLevel: OverallRiskLevel;
  insights: RiskInsight[];
  strengthsNarrative: string;
  concernsNarrative: string;
  questionsToAsk: string[];
}

export interface MacroContext {
  fedFundsRate: string;
  mortgageRate: string;
  inflationRate: string;
  narrative: string;
}

export interface PortfolioRiskBrief {
  overallNarrative: string;
  propertyBriefs: PropertyRiskBrief[];
  macroContext: MacroContext;
  topRisks: RiskInsight[];
  topStrengths: RiskInsight[];
}

// ─── Working-set session object (Phase 6 precursor) ───────────────────────────

/**
 * Precomputed per-property financial snapshot consumed by every risk insight
 * generator. Prior to this contract, each generator independently invoked
 * `estimateAnnualRevenue` / `estimateNOI` / `estimateAnnualDebtService`,
 * duplicating work and making it impossible to enforce consistency when one
 * inputs changed. Building the working set once at the top of the orchestrator
 * and threading it into each generator is the session-object precursor for the
 * risk module split.
 */
export interface PropertyFinancials {
  property: Property;
  revenue: number;
  noi: number;
  debtService: number;
  /** NOI / debt service. Set to 99 when debt service is zero (no leverage). */
  dscr: number;
  totalCostRate: number;
}

export interface RiskWorkingSet {
  properties: PropertyFinancials[];
  /** Map keyed by `Property.id` for O(1) lookup when generators need one row. */
  byId: Map<number, PropertyFinancials>;
  /** Sum of `revenue` across `properties`. Cached for concentration checks. */
  totalRevenue: number;
}
