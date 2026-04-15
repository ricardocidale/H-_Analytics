/**
 * server/ai/executive-summary.ts — Executive Summary Generator (Phase 11.3)
 *
 * Generates investor-grade 1-page executive summaries per property and per portfolio.
 * Two layers:
 *   1. Deterministic — key metrics computed from property assumptions (always available)
 *   2. LLM-enhanced — qualitative sections (investment thesis, market position, etc.)
 *      Gracefully degrades to template-based text if LLM is unavailable.
 *
 * Designed to be embedded as page 1 of any PDF/PPTX export.
 */

import type { Property } from "@shared/schema";
import type { AssumptionGuidance } from "@shared/schema/intelligence-v2";
import { getCountryDefaults } from "@shared/countryDefaults";
import { getRegulatoryProfile } from "@shared/regulatory-data";
import { computeStressScenarios, type StressAssumptions } from "../../engine/helpers/stress-scenarios";
import { pmt } from "../../calc/shared/pmt";
import { computePortfolioRiskScore } from "./portfolio-risk-scorer";
import { computeConfidenceBreakdown } from "./confidence-scorer";
import { getAnthropicClient } from "./clients";
import { logger } from "../logger";

// ─── Public Interfaces ────────────────────────────────────────────────────────

export interface PropertyExecutiveSummary {
  propertyName: string;
  propertyId: number;
  generatedAt: string;

  // The 1-page thesis
  investmentThesis: string;

  // Key metrics block (deterministic)
  keyMetrics: {
    totalInvestment: number;
    projectedIRR: number;
    equityMultiple: number;
    stabilizedNOI: number;
    exitValue: number;
    dscr: number | null;
    cashOnCash: number;
    paybackYears: number;
  };

  // Qualitative sections
  marketPosition: string;
  revenueStrategy: string;
  riskFactors: string;
  mitigants: string;
  exitStrategy: string;

  // Data backing
  comparableData: string;
  confidenceLevel: string;
  sources: string[];
}

export interface PortfolioExecutiveSummary {
  generatedAt: string;

  // Portfolio overview
  portfolioThesis: string;

  // Portfolio metrics
  totalProperties: number;
  totalInvestment: number;
  weightedIRR: number;
  portfolioRiskGrade: string;
  geographicSpread: string;

  // Strategy sections
  brandStrategy: string;
  diversificationAnalysis: string;
  growthPlan: string;
  managementCompanyValue: string;

  // Per-property summaries (abbreviated)
  propertySummaries: Array<{
    name: string;
    irr: number;
    riskGrade: string;
    oneLiner: string;
  }>;

  sources: string[];
}

// ─── Options ──────────────────────────────────────────────────────────────────

export interface ExecutiveSummaryOptions {
  /** Enable LLM-enhanced qualitative narratives (default: true) */
  includeLLM?: boolean;
  /** Format: 'json' returns structured object, 'text' returns plain text for export embedding */
  format?: "json" | "text";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pct(val: number): string {
  return `${(val * 100).toFixed(1)}%`;
}

function dollars(val: number): string {
  const abs = Math.abs(val);
  if (abs >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${Math.round(val / 1_000).toLocaleString("en-US")}K`;
  return `$${Math.round(val).toLocaleString("en-US")}`;
}

function estimateAnnualRevenue(p: Property): number {
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

function estimateNOI(p: Property): number {
  const revenue = estimateAnnualRevenue(p);
  const totalCostRate =
    (p.costRateRooms ?? 0) + (p.costRateFB ?? 0) + (p.costRateAdmin ?? 0) +
    (p.costRateMarketing ?? 0) + (p.costRatePropertyOps ?? 0) + (p.costRateUtilities ?? 0) +
    (p.costRateTaxes ?? 0) + (p.costRateIT ?? 0) + (p.costRateFFE ?? 0) +
    (p.costRateOther ?? 0) + (p.costRateInsurance ?? 0);
  return revenue * (1 - totalCostRate);
}

function estimateAnnualDebtService(p: Property): number {
  const ltv = p.acquisitionLTV ?? 0;
  const loanAmount = (p.purchasePrice ?? 0) * ltv;
  const monthlyRate = (p.acquisitionInterestRate ?? 0.065) / 12;
  const termMonths = (p.acquisitionTermYears ?? 25) * 12;
  if (loanAmount <= 0 || monthlyRate <= 0 || termMonths <= 0) return 0;
  return pmt(loanAmount, monthlyRate, termMonths) * 12;
}

function computeEquityInvested(p: Property): number {
  const purchasePrice = p.purchasePrice ?? 0;
  const improvements = p.buildingImprovements ?? 0;
  const totalInvestment = purchasePrice + improvements;
  const ltv = p.acquisitionLTV ?? 0;
  const loanAmount = purchasePrice * ltv;
  return totalInvestment - loanAmount;
}

// ─── Key Metrics (Deterministic) ──────────────────────────────────────────────

function computeKeyMetrics(p: Property): PropertyExecutiveSummary["keyMetrics"] {
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
  const dispositionProceeds = exitValue - (purchasePrice * (p.acquisitionLTV ?? 0)); // exit value minus loan payoff (simplified)
  const totalReturn = totalCashFlows + dispositionProceeds;
  const equityMultiple = equity > 0 ? totalReturn / equity : 0;

  // Approximate IRR from equity multiple and hold period
  const projectedIRR = equity > 0 && holdYears > 0
    ? Math.pow(Math.max(equityMultiple, 0.01), 1 / holdYears) - 1
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

// ─── Stress Summary Builder ───────────────────────────────────────────────────

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

function summarizeWorstStress(p: Property): string {
  try {
    const stressResults = computeStressScenarios(buildStressAssumptions(p));
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

// ─── Template-Based Fallback (No LLM) ────────────────────────────────────────

function buildTemplateSummary(p: Property, metrics: PropertyExecutiveSummary["keyMetrics"]): {
  investmentThesis: string;
  marketPosition: string;
  revenueStrategy: string;
  riskFactors: string;
  mitigants: string;
  exitStrategy: string;
} {
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

  const revenueStrategy = `Revenue is structured as ${pct(roomShare)} rooms, ${pct(fbShare)} F&B, and ${pct(eventsShare)} events. ${fbShare > 0.15 ? "The significant F&B component reflects the 50/50 rooms-to-F&B revenue target, diversifying income beyond room nights." : "F&B and event revenue provide ancillary income streams."} ${isPricingPerProperty ? "The per-property pricing model targets high-net-worth group bookings." : `ADR growth of ${pct(p.adrGrowthRate ?? 0.03)} annually supports revenue escalation.`}`;

  const marketPosition = `The property operates as a ${tier} asset in the ${p.market || location || "target"} market. ${rooms <= 15 ? "Small room count provides an intimate, high-service experience typical of boutique conversions." : `With ${rooms} rooms, the property benefits from operational scale while maintaining boutique positioning.`}`;

  const hasDebt = ltv > 0;
  const riskFactors = `Key risks include ${hasDebt ? `leverage at ${pct(ltv)} LTV` : "execution risk on conversion timeline"}, ${occupancy > 0.80 ? "aggressive occupancy assumptions" : "market occupancy uncertainty"}, and sensitivity to ${fbShare > 0.15 ? "F&B operational costs" : "ADR compression in a competitive market"}. ${summarizeWorstStress(p)}`;

  const mitigants = `${hasDebt && metrics.dscr != null && metrics.dscr > 1.25 ? `DSCR of ${metrics.dscr.toFixed(2)}x provides debt cushion. ` : ""}${fbShare > 0.10 ? "Diversified revenue streams reduce dependence on room revenue. " : ""}${tier === "luxury" || tier === "upper_upscale" ? "Premium positioning provides pricing power and lower demand elasticity. " : ""}The management company's brand and operational expertise de-risk execution.`;

  const exitCapRate = p.exitCapRate ?? 0.07;
  const exitStrategy = `Exit is modeled at a ${pct(exitCapRate)} cap rate, implying a ${dollars(metrics.exitValue)} disposition value based on stabilized NOI of ${dollars(metrics.stabilizedNOI)}. ${exitCapRate < 0.06 ? "The sub-6% exit cap rate reflects premium asset pricing and may face compression risk." : "The exit cap rate is within market norms for the asset class."} A 7-year hold provides sufficient time for stabilization and value creation.`;

  return { investmentThesis, marketPosition, revenueStrategy, riskFactors, mitigants, exitStrategy };
}

// ─── LLM-Enhanced Summary ─────────────────────────────────────────────────────

async function generateLLMPropertySections(
  p: Property,
  metrics: PropertyExecutiveSummary["keyMetrics"],
  stressSummary: string,
  confidenceSummary: string,
  guidanceSummary: string,
): Promise<{
  investmentThesis: string;
  marketPosition: string;
  revenueStrategy: string;
  riskFactors: string;
  mitigants: string;
  exitStrategy: string;
} | null> {
  try {
    const anthropic = getAnthropicClient();

    const location = [p.city, p.stateProvince, p.country].filter(Boolean).join(", ");
    const tier = p.qualityTier ?? "upscale";
    const model = p.businessModel ?? "hotel";
    const isPricingPerProperty = p.pricingModel === "per_property";

    const prompt = `You are writing a 1-page investment executive summary for a potential LP investor.

PROPERTY: "${p.name}"
- Location: ${location || "Not specified"}
- Type: ${tier} ${model === "vrbo" ? "luxury rental" : "boutique hotel"} conversion
- Rooms: ${p.roomCount ?? 0}
- Pricing: ${isPricingPerProperty ? `$${p.nightlyPropertyRate ?? p.startAdr}/night whole-property` : `$${p.startAdr} ADR per room`}
- Stabilized Occupancy: ${pct(p.maxOccupancy ?? 0.7)}
- Revenue Mix: ${pct(Math.max(0, 1 - (p.revShareFB ?? 0) - (p.revShareEvents ?? 0) - (p.revShareOther ?? 0)))} rooms, ${pct(p.revShareFB ?? 0)} F&B, ${pct(p.revShareEvents ?? 0)} events

KEY FINANCIAL METRICS:
- Total Investment: ${dollars(metrics.totalInvestment)}
- Projected IRR: ${pct(metrics.projectedIRR)}
- Equity Multiple: ${metrics.equityMultiple.toFixed(2)}x
- Stabilized NOI: ${dollars(metrics.stabilizedNOI)}
- Exit Value: ${dollars(metrics.exitValue)} at ${pct(p.exitCapRate ?? 0.07)} cap
- ${metrics.dscr != null ? `DSCR: ${metrics.dscr.toFixed(2)}x` : "All equity — no debt service"}
- Cash-on-Cash: ${pct(metrics.cashOnCash)}
- Payback: ${metrics.paybackYears.toFixed(1)} years

STRESS TEST: ${stressSummary}
MARKET RESEARCH: ${guidanceSummary}
CONFIDENCE: ${confidenceSummary}
REGULATORY: ${p.country ? getRegulatoryHighlights(p.country) : "US domestic investment"}

Write the following sections in professional, investor-ready language. Return ONLY valid JSON:
{
  "investmentThesis": "3-5 sentences — the elevator pitch for why an LP should invest",
  "marketPosition": "2-3 sentences — why this market, what the comp set looks like",
  "revenueStrategy": "2-3 sentences — rooms, F&B, events breakdown and growth drivers",
  "riskFactors": "2-3 sentences — honest assessment of what could go wrong",
  "mitigants": "2-3 sentences — what protects the investment",
  "exitStrategy": "2-3 sentences — when and how the property exits"
}

Rules:
1. Be direct, specific, and cite numbers. This is for a skeptical LP who has seen 100 deals.
2. Avoid generic language like "exciting opportunity" or "strong fundamentals."
3. Use specific data: "$310 ADR based on 8 comparable properties" not "competitive rates."
4. Write like a Wall Street analyst, not a marketer.
5. Return ONLY valid JSON, no markdown formatting.`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250514",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = response.content.find(b => b.type === "text");
    if (!textBlock || textBlock.type !== "text") return null;

    // Strip markdown code fences if present
    let text = textBlock.text.trim();
    if (text.startsWith("```")) {
      text = text.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    }

    const parsed = JSON.parse(text);
    return {
      investmentThesis: parsed.investmentThesis || "",
      marketPosition: parsed.marketPosition || "",
      revenueStrategy: parsed.revenueStrategy || "",
      riskFactors: parsed.riskFactors || "",
      mitigants: parsed.mitigants || "",
      exitStrategy: parsed.exitStrategy || "",
    };
  } catch (err: unknown) {
    logger.warn(`LLM executive summary failed (graceful degradation): ${err instanceof Error ? err.message : err}`, "executive-summary");
    return null;
  }
}

async function generateLLMPortfolioSections(
  properties: Property[],
  propertySummaries: PortfolioExecutiveSummary["propertySummaries"],
  totalInvestment: number,
  weightedIRR: number,
  riskGrade: string,
  geographicSpread: string,
): Promise<{
  portfolioThesis: string;
  brandStrategy: string;
  diversificationAnalysis: string;
  growthPlan: string;
  managementCompanyValue: string;
} | null> {
  try {
    const anthropic = getAnthropicClient();

    const propertyLines = propertySummaries
      .map(ps => `- ${ps.name}: ${pct(ps.irr)} IRR, Risk ${ps.riskGrade} — ${ps.oneLiner}`)
      .join("\n");

    const prompt = `You are writing a 1-page portfolio investment executive summary for a potential LP investor in a boutique hospitality management company.

PORTFOLIO OVERVIEW:
- Total Properties: ${properties.length}
- Total Investment: ${dollars(totalInvestment)}
- Weighted IRR: ${pct(weightedIRR)}
- Portfolio Risk Grade: ${riskGrade}
- Geographic Spread: ${geographicSpread}

PROPERTIES:
${propertyLines}

Write the following sections in professional, investor-ready language. Return ONLY valid JSON:
{
  "portfolioThesis": "3-5 sentences — why invest in this portfolio as a whole",
  "brandStrategy": "2-3 sentences — how the management company brand creates value",
  "diversificationAnalysis": "2-3 sentences — geographic and segment diversification",
  "growthPlan": "2-3 sentences — how the portfolio scales",
  "managementCompanyValue": "2-3 sentences — what the ManCo brings to the table"
}

Rules:
1. Focus on portfolio-level value, not individual property details.
2. Be specific about diversification benefits and risk reduction.
3. Write for a sophisticated LP evaluating manager quality.
4. Return ONLY valid JSON, no markdown formatting.`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250514",
      max_tokens: 1200,
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = response.content.find(b => b.type === "text");
    if (!textBlock || textBlock.type !== "text") return null;

    let text = textBlock.text.trim();
    if (text.startsWith("```")) {
      text = text.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    }

    const parsed = JSON.parse(text);
    return {
      portfolioThesis: parsed.portfolioThesis || "",
      brandStrategy: parsed.brandStrategy || "",
      diversificationAnalysis: parsed.diversificationAnalysis || "",
      growthPlan: parsed.growthPlan || "",
      managementCompanyValue: parsed.managementCompanyValue || "",
    };
  } catch (err: unknown) {
    logger.warn(`LLM portfolio summary failed (graceful degradation): ${err instanceof Error ? err.message : err}`, "executive-summary");
    return null;
  }
}

// ─── Regulatory Highlights ────────────────────────────────────────────────────

function getRegulatoryHighlights(country: string): string {
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

// ─── Main Public APIs ─────────────────────────────────────────────────────────

/**
 * Generate an executive summary for a single property.
 * Deterministic metrics are always computed; LLM sections are optional.
 */
export async function generatePropertyExecutiveSummary(
  property: Property,
  guidanceRecords: AssumptionGuidance[],
  options: ExecutiveSummaryOptions = {},
): Promise<PropertyExecutiveSummary> {
  const { includeLLM = true } = options;
  const now = new Date().toISOString();

  // 1. Compute key metrics (deterministic)
  const keyMetrics = computeKeyMetrics(property);

  // 2. Build confidence summary
  let confidenceSummary = "No research data available.";
  let comparableData = "No comparable data available — run research engines to populate.";
  const sources: string[] = [];

  if (guidanceRecords.length > 0) {
    try {
      const confidence = await computeConfidenceBreakdown(guidanceRecords, "property");
      confidenceSummary = `${confidence.overall} confidence (${confidence.overallScore}/100): ${confidence.explanation}`;

      // Extract comparable count
      let maxComps = 0;
      for (const r of guidanceRecords) {
        const cs = r.comparableSet as Record<string, unknown> | null;
        if (cs && typeof cs === "object") {
          const comps = Array.isArray(cs) ? cs : (Array.isArray(cs.comps) ? cs.comps : null);
          if (comps && comps.length > maxComps) maxComps = comps.length;
        }
      }

      const location = [property.city, property.stateProvince, property.country].filter(Boolean).join(", ");
      comparableData = maxComps > 0
        ? `Based on ${maxComps} comparable properties in ${location || "the target market"}, with ${confidence.overall} confidence.`
        : `Research available for ${guidanceRecords.length} assumption fields in ${location || "the target market"}.`;

      // Collect sources
      for (const r of guidanceRecords) {
        if (r.sourceName && !sources.includes(r.sourceName)) {
          sources.push(r.sourceName);
        }
      }
    } catch {
      // Confidence scoring failed — continue with defaults
    }
  }

  // 3. Build guidance summary for LLM prompt
  const guidanceSummary = guidanceRecords.length > 0
    ? guidanceRecords
        .filter(r => r.valueMid != null)
        .slice(0, 10)
        .map(r => `${r.assumptionKey}: ${r.valueLow}–${r.valueHigh} (mid: ${r.valueMid}, confidence: ${r.confidence})`)
        .join("; ") || "Research ran but no numeric guidance produced."
    : "No research has been run for this property.";

  // 4. Build stress summary
  const stressSummary = summarizeWorstStress(property);

  // 5. Generate qualitative sections (LLM or template)
  let sections: {
    investmentThesis: string;
    marketPosition: string;
    revenueStrategy: string;
    riskFactors: string;
    mitigants: string;
    exitStrategy: string;
  };

  if (includeLLM) {
    const llmSections = await generateLLMPropertySections(
      property, keyMetrics, stressSummary, confidenceSummary, guidanceSummary,
    );
    sections = llmSections ?? buildTemplateSummary(property, keyMetrics);
  } else {
    sections = buildTemplateSummary(property, keyMetrics);
  }

  return {
    propertyName: property.name,
    propertyId: property.id,
    generatedAt: now,
    investmentThesis: sections.investmentThesis,
    keyMetrics,
    marketPosition: sections.marketPosition,
    revenueStrategy: sections.revenueStrategy,
    riskFactors: sections.riskFactors,
    mitigants: sections.mitigants,
    exitStrategy: sections.exitStrategy,
    comparableData,
    confidenceLevel: confidenceSummary,
    sources,
  };
}

/**
 * Generate a portfolio-level executive summary.
 * Aggregates metrics across all properties and builds portfolio narrative.
 */
export async function generatePortfolioExecutiveSummary(
  properties: Property[],
  guidanceByProperty: Map<number, AssumptionGuidance[]>,
  options: ExecutiveSummaryOptions = {},
): Promise<PortfolioExecutiveSummary> {
  const { includeLLM = true } = options;
  const now = new Date().toISOString();
  const active = properties.filter((p: any) => p.isActive !== false);

  // 1. Compute portfolio-level metrics
  let totalInvestment = 0;
  let totalEquity = 0;
  let weightedIRRSum = 0;
  const sources: string[] = [];

  const propertySummaries: PortfolioExecutiveSummary["propertySummaries"] = [];

  for (const p of active) {
    const metrics = computeKeyMetrics(p);
    const equity = computeEquityInvested(p);
    totalInvestment += metrics.totalInvestment;
    totalEquity += equity;
    weightedIRRSum += metrics.projectedIRR * equity;

    // Collect sources from guidance
    const guidance = guidanceByProperty.get(p.id) ?? [];
    for (const r of guidance) {
      if (r.sourceName && !sources.includes(r.sourceName)) {
        sources.push(r.sourceName);
      }
    }

    // Build one-liner
    const location = [p.city, p.stateProvince].filter(Boolean).join(", ") || p.country || "";
    const tier = p.qualityTier ?? "upscale";
    const model = p.businessModel === "vrbo" ? "luxury rental" : "boutique hotel";
    const ltv = p.acquisitionLTV ?? 0;
    const leverageNote = ltv > 0.60 ? "leveraged" : ltv > 0 ? "low leverage" : "all-equity";

    propertySummaries.push({
      name: p.name,
      irr: metrics.projectedIRR,
      riskGrade: "B", // Placeholder — will be refined below
      oneLiner: `${tier.charAt(0).toUpperCase() + tier.slice(1)} ${model} in ${location}, ${pct(metrics.projectedIRR)} IRR, ${leverageNote}`,
    });
  }

  const weightedIRR = totalEquity > 0 ? weightedIRRSum / totalEquity : 0;

  // 2. Portfolio risk grade
  const riskReport = computePortfolioRiskScore(active);
  const portfolioRiskGrade = riskReport.riskGrade;

  // Update per-property risk grades from individual risk scoring
  for (const ps of propertySummaries) {
    const prop = active.find(p => p.name === ps.name);
    if (prop) {
      // Simple property-level grade based on IRR and leverage
      const ltv = prop.acquisitionLTV ?? 0;
      const noi = estimateNOI(prop);
      const ds = estimateAnnualDebtService(prop);
      const dscr = ds > 0 ? noi / ds : 99;
      if (dscr < 1.0 && ds > 0) ps.riskGrade = "F";
      else if (dscr < 1.25 && ds > 0) ps.riskGrade = "D";
      else if (ltv > 0.80) ps.riskGrade = "C";
      else if (ltv > 0.65) ps.riskGrade = "B";
      else ps.riskGrade = "A";
    }
  }

  // 3. Geographic spread
  const countriesArr = Array.from(new Set(active.map(p => p.country || "Unknown")));
  const marketsArr = Array.from(new Set(active.map(p => p.market || p.city || "Unknown")));
  const geographicSpread = `${countriesArr.length} ${countriesArr.length === 1 ? "country" : "countries"}, ${marketsArr.length} ${marketsArr.length === 1 ? "market" : "markets"}`;

  // 4. Generate qualitative sections
  let qualitative: {
    portfolioThesis: string;
    brandStrategy: string;
    diversificationAnalysis: string;
    growthPlan: string;
    managementCompanyValue: string;
  };

  if (includeLLM) {
    const llmSections = await generateLLMPortfolioSections(
      active, propertySummaries, totalInvestment, weightedIRR, portfolioRiskGrade, geographicSpread,
    );
    qualitative = llmSections ?? buildTemplatePortfolioSummary(active, totalInvestment, weightedIRR, portfolioRiskGrade, geographicSpread);
  } else {
    qualitative = buildTemplatePortfolioSummary(active, totalInvestment, weightedIRR, portfolioRiskGrade, geographicSpread);
  }

  return {
    generatedAt: now,
    portfolioThesis: qualitative.portfolioThesis,
    totalProperties: active.length,
    totalInvestment,
    weightedIRR,
    portfolioRiskGrade,
    geographicSpread,
    brandStrategy: qualitative.brandStrategy,
    diversificationAnalysis: qualitative.diversificationAnalysis,
    growthPlan: qualitative.growthPlan,
    managementCompanyValue: qualitative.managementCompanyValue,
    propertySummaries,
    sources,
  };
}

// ─── Template Portfolio Fallback ──────────────────────────────────────────────

function buildTemplatePortfolioSummary(
  properties: Property[],
  totalInvestment: number,
  weightedIRR: number,
  riskGrade: string,
  geographicSpread: string,
): {
  portfolioThesis: string;
  brandStrategy: string;
  diversificationAnalysis: string;
  growthPlan: string;
  managementCompanyValue: string;
} {
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

// ─── Plain Text Formatter (for export embedding) ─────────────────────────────

export function formatPropertySummaryAsText(summary: PropertyExecutiveSummary): string {
  const m = summary.keyMetrics;
  return `EXECUTIVE SUMMARY — ${summary.propertyName}
Generated: ${new Date(summary.generatedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}

INVESTMENT THESIS
${summary.investmentThesis}

KEY METRICS
  Total Investment:    ${dollars(m.totalInvestment)}
  Projected IRR:       ${pct(m.projectedIRR)}
  Equity Multiple:     ${m.equityMultiple.toFixed(2)}x
  Stabilized NOI:      ${dollars(m.stabilizedNOI)}
  Exit Value:          ${dollars(m.exitValue)}
  DSCR:                ${m.dscr != null ? m.dscr.toFixed(2) + "x" : "N/A (all equity)"}
  Cash-on-Cash:        ${pct(m.cashOnCash)}
  Payback Period:      ${m.paybackYears.toFixed(1)} years

MARKET POSITION
${summary.marketPosition}

REVENUE STRATEGY
${summary.revenueStrategy}

RISK FACTORS
${summary.riskFactors}

RISK MITIGANTS
${summary.mitigants}

EXIT STRATEGY
${summary.exitStrategy}

DATA QUALITY
${summary.comparableData}
${summary.confidenceLevel}
${summary.sources.length > 0 ? "\nSources: " + summary.sources.join(", ") : ""}`;
}

export function formatPortfolioSummaryAsText(summary: PortfolioExecutiveSummary): string {
  const propLines = summary.propertySummaries
    .map(ps => `  - ${ps.name}: ${pct(ps.irr)} IRR, Risk ${ps.riskGrade} — ${ps.oneLiner}`)
    .join("\n");

  return `PORTFOLIO EXECUTIVE SUMMARY
Generated: ${new Date(summary.generatedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}

PORTFOLIO THESIS
${summary.portfolioThesis}

PORTFOLIO METRICS
  Total Properties:    ${summary.totalProperties}
  Total Investment:    ${dollars(summary.totalInvestment)}
  Weighted IRR:        ${pct(summary.weightedIRR)}
  Risk Grade:          ${summary.portfolioRiskGrade}
  Geographic Spread:   ${summary.geographicSpread}

BRAND STRATEGY
${summary.brandStrategy}

DIVERSIFICATION
${summary.diversificationAnalysis}

GROWTH PLAN
${summary.growthPlan}

MANAGEMENT COMPANY VALUE
${summary.managementCompanyValue}

PROPERTY SUMMARIES
${propLines}
${summary.sources.length > 0 ? "\nSources: " + summary.sources.join(", ") : ""}`;
}
