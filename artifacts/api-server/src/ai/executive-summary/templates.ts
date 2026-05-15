/**
 * server/ai/executive-summary/templates.ts — Template-based fallback
 * narratives used when the LLM is unavailable. Pure helpers split out of
 * executive-summary.ts.
 */

import type { Property } from "@workspace/db";
import type { StressThresholds } from "@engine/helpers/stress-scenarios";
import {
  NARRATIVE_HIGH_OCCUPANCY_THRESHOLD,
  NARRATIVE_HIGH_FB_SHARE_THRESHOLD,
  NARRATIVE_DIVERSIFIED_FB_SHARE_THRESHOLD,
  NARRATIVE_STRONG_DSCR_THRESHOLD,
} from "@shared/constants-benchmarks";
import { pct, dollars, summarizeWorstStress } from "./finance-helpers";
import type {
  PropertyExecutiveSummary,
  PropertyQualitativeSections,
  PortfolioQualitativeSections,
} from "./types";

export function buildTemplateSummary(
  p: Property,
  metrics: PropertyExecutiveSummary["keyMetrics"],
  stressThresholds?: StressThresholds,
): PropertyQualitativeSections {
  const tier = p.qualityTier ?? "upscale";
  const model = p.businessModel ?? "hotel";
  const location = [p.city, p.stateProvince, p.country].filter(Boolean).join(", ");
  const adr = p.startAdr ?? 0;
  const occupancy = p.maxOccupancy ?? 0.7;
  const rooms = p.roomCount ?? 0;
  const ltv = p.acquisitionLTV ?? 0;
  const isPricingPerProperty = p.pricingModel === "per_property";

  const investmentThesis = `${p.name} is a ${tier} ${model === "vrbo" ? "luxury rental" : "boutique hotel"} conversion in ${location || "an undisclosed market"} requiring ${dollars(metrics.totalInvestment)} total investment. The property targets a ${pct(metrics.projectedIRR)} IRR and ${metrics.equityMultiple.toFixed(2)}x equity multiple over a 7-year hold, driven by ${isPricingPerProperty ? `whole-property nightly rates of ${dollars(p.nightlyPropertyRate ?? adr)}` : `a ${dollars(adr)} ADR across ${rooms} rooms at ${pct(occupancy)} stabilized occupancy`}. ${metrics.dscr != null ? `Debt service coverage of ${metrics.dscr.toFixed(2)}x provides adequate cushion.` : "The all-equity structure eliminates debt service risk."}`;

  const fbShare = p.revShareFB ?? 0;
  const eventsShare = p.revShareEvents ?? 0;
  const roomShare = Math.max(0, 1 - fbShare - eventsShare - (p.revShareOther ?? 0));

  const revenueStrategy = `Revenue is structured as ${pct(roomShare)} rooms, ${pct(fbShare)} F&B, and ${pct(eventsShare)} events. ${fbShare > NARRATIVE_HIGH_FB_SHARE_THRESHOLD ? "The significant F&B component reflects the 50/50 rooms-to-F&B revenue target, diversifying income beyond room nights." : "F&B and event revenue provide ancillary income streams."} ${isPricingPerProperty ? "The per-property pricing model targets high-net-worth group bookings." : `ADR growth of ${pct(p.adrGrowthRate ?? 0.03)} annually supports revenue escalation.`}`;

  const marketPosition = `The property operates as a ${tier} asset in the ${p.market || location || "target"} market. ${rooms <= 15 ? "Small room count provides an intimate, high-service experience typical of boutique conversions." : `With ${rooms} rooms, the property benefits from operational scale while maintaining boutique positioning.`}`;

  const hasDebt = ltv > 0;
  const riskFactors = `Key risks include ${hasDebt ? `leverage at ${pct(ltv)} LTV` : "execution risk on conversion timeline"}, ${occupancy > NARRATIVE_HIGH_OCCUPANCY_THRESHOLD ? "aggressive occupancy assumptions" : "market occupancy uncertainty"}, and sensitivity to ${fbShare > NARRATIVE_HIGH_FB_SHARE_THRESHOLD ? "F&B operational costs" : "ADR compression in a competitive market"}. ${summarizeWorstStress(p, stressThresholds)}`;

  const mitigants = `${hasDebt && metrics.dscr != null && metrics.dscr > NARRATIVE_STRONG_DSCR_THRESHOLD ? `DSCR of ${metrics.dscr.toFixed(2)}x provides debt cushion. ` : ""}${fbShare > NARRATIVE_DIVERSIFIED_FB_SHARE_THRESHOLD ? "Diversified revenue streams reduce dependence on room revenue. " : ""}${tier === "luxury" || tier === "upper_upscale" ? "Premium positioning provides pricing power and lower demand elasticity. " : ""}The management company's brand and operational expertise de-risk execution.`;

  const exitCapRate = p.exitCapRate ?? 0.07;
  const exitStrategy = `Exit is modeled at a ${pct(exitCapRate)} cap rate, implying a ${dollars(metrics.exitValue)} disposition value based on stabilized NOI of ${dollars(metrics.stabilizedNOI)}. ${exitCapRate < 0.06 ? "The sub-6% exit cap rate reflects premium asset pricing and may face compression risk." : "The exit cap rate is within market norms for the asset class."} A 7-year hold provides sufficient time for stabilization and value creation.`;

  return { investmentThesis, marketPosition, revenueStrategy, riskFactors, mitigants, exitStrategy };
}

export function buildTemplatePortfolioSummary(
  properties: Property[],
  totalInvestment: number,
  weightedIRR: number,
  riskGrade: string,
  geographicSpread: string,
): PortfolioQualitativeSections {
  const count = properties.length;
  const tiers = Array.from(new Set(properties.map(p => p.qualityTier ?? "upscale")));
  const models = Array.from(new Set(properties.map(p => p.businessModel ?? "hotel")));

  const portfolioThesis = `This portfolio comprises ${count} boutique hospitality ${count === 1 ? "asset" : "assets"} across ${geographicSpread}, requiring ${dollars(totalInvestment)} total investment. The portfolio targets a weighted ${pct(weightedIRR)} IRR with a ${riskGrade} risk grade. ${count > 1 ? "Geographic and segment diversification reduces single-asset concentration risk." : "Portfolio expansion would further reduce concentration risk."} Each property operates under the management company's brand, creating operational synergies and brand equity.`;

  const brandStrategy = `The management company operates all properties under a unified brand targeting ${tiers.join(", ")} tier positioning. Brand consistency enables premium pricing power, repeat guest relationships, and centralized marketing efficiency across the portfolio.`;

  const diversificationAnalysis = `The portfolio spans ${geographicSpread}${tiers.length > 1 ? ` across ${tiers.length} quality tiers` : ""}, ${models.includes("vrbo") ? "combining traditional hotel and luxury rental business models" : "focused on the boutique hotel model"}. ${count >= 3 ? "This diversification provides natural hedging against localized market downturns." : "Additional acquisitions would strengthen geographic diversification."}`;

  const growthPlan = `The management company's conversion pipeline targets large residential properties for boutique hospitality repositioning. ${count < 5 ? `Expanding from ${count} to 5+ properties would meaningfully improve portfolio economics and risk diversification.` : "The current portfolio provides a strong base for continued growth and fee scaling."}`;

  const managementCompanyValue = `The management company provides centralized operations, brand management, vendor relationships, and financial oversight across the portfolio. This operational platform creates value through economies of scale, institutional-quality reporting, and professional asset management that individual property owners cannot replicate.`;

  return { portfolioThesis, brandStrategy, diversificationAnalysis, growthPlan, managementCompanyValue };
}
