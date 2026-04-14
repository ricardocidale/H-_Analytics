/**
 * server/ai/risk-intelligence.ts — Risk Intelligence Engine
 *
 * Generates investor-grade risk narratives, stress test explanations, and
 * educational content about risks specific to each property and the overall
 * portfolio. Combines deterministic data analysis with optional LLM-enhanced
 * narratives.
 *
 * Two layers:
 *   1. Deterministic insights — purely from data, always available, fast.
 *   2. LLM-enhanced narratives — optional, gracefully degraded if unavailable.
 */

import type { Property } from "@shared/schema";
import { getCountryDefaults } from "@shared/countryDefaults";
import { getRegulatoryProfile } from "@shared/regulatory-data";
import { computePortfolioRiskScore, type PortfolioRiskReport } from "./portfolio-risk-scorer";
import { fetchMacroRates } from "./ambient/fetchers";
import { getAnthropicClient } from "./clients";
import { logger } from "../logger";

// ─── Public Interfaces ────────────────────────────────────────────────────────

export interface RiskInsight {
  category: "leverage" | "market" | "operational" | "regulatory" | "macro" | "concentration" | "assumption";
  severity: "info" | "caution" | "warning" | "critical";
  title: string;
  narrative: string;
  dataPoints: Array<{
    label: string;
    value: string;
    benchmark?: string;
    delta?: string;
  }>;
  actionItems: string[];
  affectedEntities: Array<{ type: "property" | "company"; id: number; name: string }>;
}

export interface PropertyRiskBrief {
  propertyId: number;
  propertyName: string;
  overallRiskLevel: "low" | "moderate" | "elevated" | "high";
  insights: RiskInsight[];
  strengthsNarrative: string;
  concernsNarrative: string;
  questionsToAsk: string[];
}

export interface PortfolioRiskBrief {
  overallNarrative: string;
  propertyBriefs: PropertyRiskBrief[];
  macroContext: {
    fedFundsRate: string;
    mortgageRate: string;
    inflationRate: string;
    narrative: string;
  };
  topRisks: RiskInsight[];
  topStrengths: RiskInsight[];
}

// ─── Hospitality Benchmarks ──────────────────────────────────────────────────

const BENCHMARKS = {
  luxuryADR: 396.40,
  boutiqueADR: 245.00,
  luxuryOccupancy: 0.682,
  boutiqueOccupancy: 0.705,
  avgCostRateRooms: 0.36,
  avgCostRateFB: 0.32,
  avgCostRateAdmin: 0.09,
  avgCostRateMarketing: 0.06,
  avgCostRatePropertyOps: 0.05,
  avgCostRateUtilities: 0.04,
  avgFFEReserve: 0.04,
  ltv75Threshold: 0.75,
  ltv85Threshold: 0.85,
  dscr125Threshold: 1.25,
  dscr150Threshold: 1.50,
  concentrationThreshold: 0.40,
  highOccupancyThreshold: 0.85,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pct(val: number): string {
  return `${(val * 100).toFixed(1)}%`;
}

function dollars(val: number): string {
  return `$${Math.round(val).toLocaleString("en-US")}`;
}

function estimateAnnualRevenue(p: Property): number {
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

function estimateNOI(p: Property): number {
  const revenue = estimateAnnualRevenue(p);
  const totalCostRate = (p.costRateRooms ?? 0) + (p.costRateFB ?? 0) + (p.costRateAdmin ?? 0) +
    (p.costRateMarketing ?? 0) + (p.costRatePropertyOps ?? 0) + (p.costRateUtilities ?? 0) +
    (p.costRateTaxes ?? 0) + (p.costRateIT ?? 0) + (p.costRateFFE ?? 0) + (p.costRateOther ?? 0) +
    (p.costRateInsurance ?? 0);
  return revenue * (1 - totalCostRate);
}

function estimateAnnualDebtService(p: Property): number {
  const ltv = p.acquisitionLTV ?? 0;
  const loanAmount = (p.purchasePrice ?? 0) * ltv;
  const rate = (p.acquisitionInterestRate ?? 0.065) / 12;
  const termMonths = (p.acquisitionTermYears ?? 25) * 12;
  if (loanAmount <= 0 || rate <= 0 || termMonths <= 0) return 0;
  const monthlyPayment = loanAmount * (rate * Math.pow(1 + rate, termMonths)) / (Math.pow(1 + rate, termMonths) - 1);
  return monthlyPayment * 12;
}

function propertyEntity(p: Property): { type: "property"; id: number; name: string } {
  return { type: "property", id: p.id, name: p.name };
}

function assessPropertyRiskLevel(insights: RiskInsight[]): "low" | "moderate" | "elevated" | "high" {
  const criticalCount = insights.filter(i => i.severity === "critical").length;
  const warningCount = insights.filter(i => i.severity === "warning").length;
  const cautionCount = insights.filter(i => i.severity === "caution").length;
  if (criticalCount > 0) return "high";
  if (warningCount >= 2) return "elevated";
  if (warningCount >= 1 || cautionCount >= 3) return "moderate";
  return "low";
}

// ─── Deterministic Insight Generators ─────────────────────────────────────────

function generateLeverageInsights(properties: Property[]): RiskInsight[] {
  const insights: RiskInsight[] = [];

  for (const p of properties) {
    const ltv = p.acquisitionLTV ?? 0;
    const noi = estimateNOI(p);
    const debtService = estimateAnnualDebtService(p);
    const dscr = debtService > 0 ? noi / debtService : 99;

    // LTV check
    if (ltv > BENCHMARKS.ltv85Threshold) {
      insights.push({
        category: "leverage",
        severity: "critical",
        title: `Very high leverage on ${p.name}`,
        narrative: `The loan-to-value ratio of ${pct(ltv)} on "${p.name}" significantly exceeds the ${pct(BENCHMARKS.ltv85Threshold)} threshold considered aggressive for hospitality assets. This leaves very little equity cushion — a ${pct(0.15)} decline in property value would put the loan underwater. Lenders may also impose restrictive covenants at this leverage level.`,
        dataPoints: [
          { label: "LTV", value: pct(ltv), benchmark: `<${pct(BENCHMARKS.ltv75Threshold)}`, delta: `+${pct(ltv - BENCHMARKS.ltv75Threshold)} above safe` },
          { label: "Purchase Price", value: dollars(p.purchasePrice ?? 0) },
          { label: "Loan Amount", value: dollars((p.purchasePrice ?? 0) * ltv) },
        ],
        actionItems: [
          "Increase equity contribution to bring LTV below 75%",
          "Negotiate interest-only period to improve early cash flow",
          "Consider mezzanine financing to reduce senior debt exposure",
        ],
        affectedEntities: [propertyEntity(p)],
      });
    } else if (ltv > BENCHMARKS.ltv75Threshold) {
      insights.push({
        category: "leverage",
        severity: "caution",
        title: `Elevated leverage on ${p.name}`,
        narrative: `The LTV of ${pct(ltv)} on "${p.name}" exceeds the ${pct(BENCHMARKS.ltv75Threshold)} level that most institutional hospitality lenders consider conservative. While not uncommon for value-add deals, this leverage level amplifies both upside returns and downside risk.`,
        dataPoints: [
          { label: "LTV", value: pct(ltv), benchmark: `<${pct(BENCHMARKS.ltv75Threshold)}`, delta: `+${pct(ltv - BENCHMARKS.ltv75Threshold)} above benchmark` },
        ],
        actionItems: [
          "Verify debt service coverage under a 15% revenue decline scenario",
          "Confirm loan terms include reasonable cure periods",
        ],
        affectedEntities: [propertyEntity(p)],
      });
    }

    // DSCR check
    if (debtService > 0 && dscr < 1.0) {
      insights.push({
        category: "leverage",
        severity: "critical",
        title: `Negative cash flow on ${p.name}`,
        narrative: `"${p.name}" has a debt service coverage ratio of ${dscr.toFixed(2)}x, meaning estimated NOI does not cover debt payments. The property would require additional capital infusion of approximately ${dollars(debtService - noi)} per year to service debt. This is a significant risk that must be addressed before committing capital.`,
        dataPoints: [
          { label: "DSCR", value: `${dscr.toFixed(2)}x`, benchmark: `>${BENCHMARKS.dscr125Threshold.toFixed(2)}x`, delta: `${(dscr - BENCHMARKS.dscr125Threshold).toFixed(2)}x below minimum` },
          { label: "Annual NOI", value: dollars(noi) },
          { label: "Annual Debt Service", value: dollars(debtService) },
          { label: "Annual Shortfall", value: dollars(debtService - noi) },
        ],
        actionItems: [
          "Reduce leverage or negotiate lower interest rate",
          "Increase revenue assumptions (ADR, occupancy, ancillary) if supported by market data",
          "Budget a cash reserve to cover shortfalls during ramp-up",
        ],
        affectedEntities: [propertyEntity(p)],
      });
    } else if (debtService > 0 && dscr < BENCHMARKS.dscr125Threshold) {
      insights.push({
        category: "leverage",
        severity: "warning",
        title: `Thin debt coverage on ${p.name}`,
        narrative: `"${p.name}" has a DSCR of ${dscr.toFixed(2)}x, below the ${BENCHMARKS.dscr125Threshold.toFixed(2)}x minimum that lenders typically require. A modest decline in occupancy or increase in expenses could push the property into negative cash flow territory.`,
        dataPoints: [
          { label: "DSCR", value: `${dscr.toFixed(2)}x`, benchmark: `>${BENCHMARKS.dscr125Threshold.toFixed(2)}x` },
          { label: "Annual NOI", value: dollars(noi) },
          { label: "Annual Debt Service", value: dollars(debtService) },
        ],
        actionItems: [
          "Stress test with 10-15% occupancy reduction",
          "Build operating reserve equal to 6 months of debt service",
        ],
        affectedEntities: [propertyEntity(p)],
      });
    }
  }

  return insights;
}

function generateAssumptionChallengeInsights(properties: Property[]): RiskInsight[] {
  const insights: RiskInsight[] = [];

  for (const p of properties) {
    const adr = p.startAdr ?? 0;
    const occupancy = p.maxOccupancy ?? 0.7;
    const tier = p.qualityTier ?? "upscale";

    // ADR challenge
    const adrBenchmark = tier === "luxury" ? BENCHMARKS.luxuryADR : BENCHMARKS.boutiqueADR;
    if (adr > adrBenchmark * 1.10) {
      insights.push({
        category: "assumption",
        severity: adr > adrBenchmark * 1.30 ? "warning" : "caution",
        title: `Aggressive ADR assumption on ${p.name}`,
        narrative: `Your ADR assumption of ${dollars(adr)} exceeds the ${tier} segment average of ${dollars(adrBenchmark)} by ${pct((adr - adrBenchmark) / adrBenchmark)}. This requires strong brand positioning, premium amenities, and exceptional location to sustain. Consider whether the property's competitive set supports this rate.`,
        dataPoints: [
          { label: "Assumed ADR", value: dollars(adr), benchmark: dollars(adrBenchmark), delta: `+${dollars(adr - adrBenchmark)}` },
          { label: "Quality Tier", value: tier },
        ],
        actionItems: [
          "Run ADR research engine to validate against comparable properties",
          "Review competitive set positioning to confirm premium is justified",
          "Model a conservative ADR scenario for downside analysis",
        ],
        affectedEntities: [propertyEntity(p)],
      });
    }

    // Occupancy challenge
    if (occupancy > BENCHMARKS.highOccupancyThreshold) {
      insights.push({
        category: "assumption",
        severity: occupancy > 0.90 ? "warning" : "caution",
        title: `High occupancy target on ${p.name}`,
        narrative: `A stabilized occupancy of ${pct(occupancy)} is achievable for well-positioned ${tier} properties but requires exceptional operations, marketing, and favorable market conditions. The ${tier} segment averaged ${pct(tier === "luxury" ? BENCHMARKS.luxuryOccupancy : BENCHMARKS.boutiqueOccupancy)} occupancy in recent data. Consider whether ramp-up timing assumptions are realistic.`,
        dataPoints: [
          { label: "Target Occupancy", value: pct(occupancy), benchmark: pct(tier === "luxury" ? BENCHMARKS.luxuryOccupancy : BENCHMARKS.boutiqueOccupancy), delta: `+${pct(occupancy - (tier === "luxury" ? BENCHMARKS.luxuryOccupancy : BENCHMARKS.boutiqueOccupancy))}` },
        ],
        actionItems: [
          "Run occupancy research engine to validate against local market",
          "Review ramp-up curve assumptions — new properties typically take 18-36 months to stabilize",
          "Model a conservative occupancy scenario at 70-75%",
        ],
        affectedEntities: [propertyEntity(p)],
      });
    }

    // Cost rate challenges
    const costRateRooms = p.costRateRooms ?? 0;
    if (costRateRooms > 0 && costRateRooms < BENCHMARKS.avgCostRateRooms * 0.75) {
      insights.push({
        category: "assumption",
        severity: "caution",
        title: `Low rooms cost on ${p.name}`,
        narrative: `Your rooms department cost of ${pct(costRateRooms)} is ${pct(BENCHMARKS.avgCostRateRooms - costRateRooms)} below the industry average of ${pct(BENCHMARKS.avgCostRateRooms)}. Verify this reflects actual staffing plans, housekeeping costs, and amenity expenses. Understating operating costs is a common pitfall in hospitality pro formas.`,
        dataPoints: [
          { label: "Rooms Cost Rate", value: pct(costRateRooms), benchmark: pct(BENCHMARKS.avgCostRateRooms), delta: `-${pct(BENCHMARKS.avgCostRateRooms - costRateRooms)}` },
        ],
        actionItems: [
          "Build a bottom-up staffing model to validate cost assumptions",
          "Compare against USALI benchmarks for properties of similar size and tier",
        ],
        affectedEntities: [propertyEntity(p)],
      });
    }

    const costRateFB = p.costRateFB ?? 0;
    if (costRateFB > 0 && costRateFB < BENCHMARKS.avgCostRateFB * 0.75) {
      insights.push({
        category: "assumption",
        severity: "caution",
        title: `Low F&B cost on ${p.name}`,
        narrative: `Your F&B department cost of ${pct(costRateFB)} is below the industry average of ${pct(BENCHMARKS.avgCostRateFB)}. F&B operations in boutique properties often run higher costs due to lower volume. Ensure this rate accounts for food waste, seasonal menu changes, and skilled kitchen staffing.`,
        dataPoints: [
          { label: "F&B Cost Rate", value: pct(costRateFB), benchmark: pct(BENCHMARKS.avgCostRateFB), delta: `-${pct(BENCHMARKS.avgCostRateFB - costRateFB)}` },
        ],
        actionItems: [
          "Validate against comparable boutique F&B operations",
          "Consider seasonal staffing fluctuations in the cost model",
        ],
        affectedEntities: [propertyEntity(p)],
      });
    }
  }

  return insights;
}

async function generateMacroInsights(properties: Property[]): Promise<{
  insights: RiskInsight[];
  macroContext: PortfolioRiskBrief["macroContext"];
}> {
  let fedFundsRate = "N/A";
  let mortgageRate = "N/A";
  let inflationRate = "N/A";
  const insights: RiskInsight[] = [];

  try {
    const macroData = await fetchMacroRates();
    const snapshots = macroData.snapshots;

    const fedFunds = snapshots.find(s => s.snapshotKey === "fred_dff");
    const mortgage30 = snapshots.find(s => s.snapshotKey === "fred_mortgage30us");
    const cpi = snapshots.find(s => s.snapshotKey === "fred_cpiaucsl");

    if (fedFunds?.value != null) fedFundsRate = `${fedFunds.value.toFixed(2)}%`;
    if (mortgage30?.value != null) mortgageRate = `${mortgage30.value.toFixed(2)}%`;
    if (cpi?.value != null) inflationRate = `${cpi.value.toFixed(1)}%`;

    // High mortgage rate insight
    if (mortgage30?.value != null && mortgage30.value > 7.0) {
      const financedProperties = properties.filter(p => (p.acquisitionLTV ?? 0) > 0);
      if (financedProperties.length > 0) {
        insights.push({
          category: "macro",
          severity: "warning",
          title: "Elevated mortgage rates impact debt service",
          narrative: `The 30-year mortgage rate is at ${mortgage30.value.toFixed(2)}%, well above the historical average of ~5%. This directly impacts debt service costs on all financed properties. For variable-rate loans, this means higher near-term payments. For fixed-rate acquisitions, this rate environment may limit refinancing options at exit.`,
          dataPoints: [
            { label: "30-Year Mortgage", value: `${mortgage30.value.toFixed(2)}%`, benchmark: "~5.0% historical avg", delta: `+${(mortgage30.value - 5.0).toFixed(2)}%` },
            { label: "Financed Properties", value: `${financedProperties.length}` },
          ],
          actionItems: [
            "Stress test all financed properties at current market rates",
            "Consider interest rate caps or swaps for variable-rate debt",
            "Factor in potential rate environment at planned exit date",
          ],
          affectedEntities: financedProperties.map(propertyEntity),
        });
      }
    }

    // High inflation insight
    if (cpi?.value != null && cpi.value > 4.0) {
      insights.push({
        category: "macro",
        severity: "caution",
        title: "Inflation pressure on operating costs",
        narrative: `CPI is running at ${cpi.value.toFixed(1)}%, which puts upward pressure on labor costs, food costs, utilities, and insurance. Hospitality is particularly exposed to inflation through high labor intensity and food-service operations. Ensure your expense growth assumptions reflect current inflationary conditions.`,
        dataPoints: [
          { label: "CPI", value: `${cpi.value.toFixed(1)}%`, benchmark: "~2.5% target", delta: `+${(cpi.value - 2.5).toFixed(1)}%` },
        ],
        actionItems: [
          "Review expense inflation assumptions in each property's pro forma",
          "Consider escalation clauses in vendor contracts",
          "Verify ADR growth assumptions exceed cost inflation",
        ],
        affectedEntities: [],
      });
    }

    // Fed funds rate context
    if (fedFunds?.value != null && fedFunds.value > 4.0) {
      insights.push({
        category: "macro",
        severity: "info",
        title: "Restrictive monetary policy environment",
        narrative: `The federal funds rate at ${fedFunds.value.toFixed(2)}% signals a restrictive monetary environment. This raises the cost of capital across the board and may compress cap rates as investors demand higher yields. Hospitality assets with strong cash flow benefit in this environment, while leveraged deals face headwinds.`,
        dataPoints: [
          { label: "Fed Funds Rate", value: `${fedFunds.value.toFixed(2)}%` },
        ],
        actionItems: [
          "Monitor Fed meeting minutes for policy direction signals",
          "Factor higher discount rates into exit valuation models",
        ],
        affectedEntities: [],
      });
    }
  } catch (err: unknown) {
    logger.warn(`Macro data fetch failed in risk intelligence: ${err instanceof Error ? err.message : err}`, "risk-intelligence");
  }

  // Build macro narrative
  const narrativeParts: string[] = [];
  if (fedFundsRate !== "N/A") narrativeParts.push(`the Fed funds rate at ${fedFundsRate}`);
  if (mortgageRate !== "N/A") narrativeParts.push(`30-year mortgages at ${mortgageRate}`);
  if (inflationRate !== "N/A") narrativeParts.push(`CPI at ${inflationRate}`);
  const macroNarrative = narrativeParts.length > 0
    ? `Current macro environment: ${narrativeParts.join(", ")}. ${mortgageRate !== "N/A" && parseFloat(mortgageRate) > 6 ? "Elevated rates impact debt service costs and may compress exit valuations." : "Rate environment is relatively favorable for hospitality acquisitions."}`
    : "Macro data is currently unavailable. Consider refreshing FRED data sources.";

  return {
    insights,
    macroContext: { fedFundsRate, mortgageRate, inflationRate, narrative: macroNarrative },
  };
}

function generateRegulatoryInsights(properties: Property[]): RiskInsight[] {
  const insights: RiskInsight[] = [];

  for (const p of properties) {
    const country = p.country;
    if (!country) continue;

    const profile = getRegulatoryProfile(country);
    const defaults = getCountryDefaults(country);
    if (!profile && !defaults) continue;

    // Foreign ownership restrictions
    if (profile && !profile.foreignInvestment.foreignOwnershipAllowed) {
      insights.push({
        category: "regulatory",
        severity: "critical",
        title: `Foreign ownership restricted in ${country}`,
        narrative: `${country} restricts foreign ownership of real property. ${profile.foreignInvestment.ownershipRestrictions}. This may require structuring the investment through a local entity or trust. Consult local counsel before committing capital.`,
        dataPoints: [
          { label: "Restriction", value: profile.foreignInvestment.ownershipRestrictions },
          { label: "Treaty Protections", value: profile.foreignInvestment.treatyProtections },
        ],
        actionItems: [
          "Engage local legal counsel for structuring advice",
          "Evaluate holding company or trust structures",
          "Verify repatriation rules for investment returns",
        ],
        affectedEntities: [propertyEntity(p)],
      });
    } else if (profile && profile.foreignInvestment.ownershipRestrictions && profile.foreignInvestment.ownershipRestrictions !== "None") {
      insights.push({
        category: "regulatory",
        severity: "info",
        title: `Investment regulations in ${country}`,
        narrative: `${country} allows foreign ownership with conditions: ${profile.foreignInvestment.ownershipRestrictions}. ${profile.foreignInvestment.repatriationRestrictions ? "Note: there are repatriation restrictions on investment returns." : "No repatriation restrictions apply."}`,
        dataPoints: [
          { label: "Conditions", value: profile.foreignInvestment.ownershipRestrictions },
        ],
        actionItems: [
          "Review country-specific investment requirements with counsel",
        ],
        affectedEntities: [propertyEntity(p)],
      });
    }

    // High country risk premium
    if (defaults && defaults.countryRiskPremium > 0.03) {
      insights.push({
        category: "regulatory",
        severity: "caution",
        title: `High country risk premium for ${country}`,
        narrative: `${country} carries a country risk premium of ${pct(defaults.countryRiskPremium)} (Damodaran). This reflects elevated political, economic, or currency risks that affect the required return on equity. Investors should demand commensurately higher projected returns for this market.`,
        dataPoints: [
          { label: "CRP", value: pct(defaults.countryRiskPremium), benchmark: "<3.0%", delta: `+${pct(defaults.countryRiskPremium - 0.03)}` },
          { label: "Tax Rate", value: pct(defaults.taxRate) },
        ],
        actionItems: [
          "Ensure projected IRR compensates for the additional country risk",
          "Consider political risk insurance for this jurisdiction",
        ],
        affectedEntities: [propertyEntity(p)],
      });
    }

    // Licensing timeline
    if (profile && profile.licensing.typicalTimeline) {
      const months = parseInt(profile.licensing.typicalTimeline);
      if (!isNaN(months) && months > 6) {
        insights.push({
          category: "regulatory",
          severity: "info",
          title: `Licensing timeline in ${country}`,
          narrative: `Hospitality licensing in ${country} typically takes ${profile.licensing.typicalTimeline}. Factor this into your ramp-up timeline and pre-opening budget. Delays are common and can extend the period of negative cash flow.`,
          dataPoints: [
            { label: "Timeline", value: profile.licensing.typicalTimeline },
            { label: "License Type", value: profile.licensing.licenseType },
          ],
          actionItems: [
            "Begin licensing process immediately upon acquisition",
            "Budget for pre-opening costs during the licensing period",
          ],
          affectedEntities: [propertyEntity(p)],
        });
      }
    }
  }

  return insights;
}

function generateConcentrationInsights(properties: Property[]): RiskInsight[] {
  const insights: RiskInsight[] = [];
  if (properties.length < 2) return insights;

  const revenues = properties.map(p => ({ property: p, revenue: estimateAnnualRevenue(p) }));
  const totalRevenue = revenues.reduce((sum, r) => sum + r.revenue, 0);
  if (totalRevenue === 0) return insights;

  // Single property concentration
  for (const r of revenues) {
    const share = r.revenue / totalRevenue;
    if (share > BENCHMARKS.concentrationThreshold) {
      insights.push({
        category: "concentration",
        severity: share > 0.60 ? "warning" : "caution",
        title: `${r.property.name} dominates portfolio revenue`,
        narrative: `"${r.property.name}" accounts for ${pct(share)} of estimated portfolio revenue. If this property underperforms — due to market downturn, natural disaster, or operational issues — the entire portfolio's returns are at risk. Well-diversified hospitality portfolios typically limit single-asset exposure to 20-30%.`,
        dataPoints: [
          { label: "Revenue Share", value: pct(share), benchmark: `<${pct(BENCHMARKS.concentrationThreshold)}`, delta: `+${pct(share - BENCHMARKS.concentrationThreshold)} above threshold` },
          { label: "Estimated Revenue", value: dollars(r.revenue) },
          { label: "Portfolio Total", value: dollars(totalRevenue) },
        ],
        actionItems: [
          "Add properties in different markets to reduce concentration",
          "Consider different property types to diversify revenue sources",
        ],
        affectedEntities: [propertyEntity(r.property)],
      });
    }
  }

  // Geographic concentration
  const countryMap = new Map<string, Property[]>();
  for (const p of properties) {
    const country = p.country || "Unknown";
    const list = countryMap.get(country) ?? [];
    list.push(p);
    countryMap.set(country, list);
  }

  if (countryMap.size === 1) {
    const [country, props] = Array.from(countryMap.entries())[0];
    // Check state concentration for US
    const stateMap = new Map<string, Property[]>();
    for (const p of props) {
      const state = p.stateProvince || "Unknown";
      const list = stateMap.get(state) ?? [];
      list.push(p);
      stateMap.set(state, list);
    }

    if (stateMap.size === 1) {
      const [state] = Array.from(stateMap.entries())[0];
      insights.push({
        category: "concentration",
        severity: "caution",
        title: `All properties in ${state}, ${country}`,
        narrative: `The entire portfolio is concentrated in ${state}, ${country}. This exposes the portfolio to localized risks: regional economic downturns, natural disasters, and regulatory changes in a single jurisdiction. Geographic diversification is one of the most effective risk mitigation strategies in hospitality.`,
        dataPoints: [
          { label: "Countries", value: "1" },
          { label: "States/Regions", value: "1" },
          { label: "Properties", value: `${properties.length}` },
        ],
        actionItems: [
          "Evaluate acquisition targets in different states or countries",
          "Prioritize markets with uncorrelated demand drivers",
        ],
        affectedEntities: props.map(propertyEntity),
      });
    } else {
      insights.push({
        category: "concentration",
        severity: "info",
        title: `All properties in ${country}`,
        narrative: `The portfolio is concentrated in ${country} across ${stateMap.size} states/regions. While some geographic diversification exists within the country, the portfolio is still exposed to country-level risks: currency fluctuations, regulatory changes, and macroeconomic conditions.`,
        dataPoints: [
          { label: "Countries", value: "1" },
          { label: "States/Regions", value: `${stateMap.size}` },
        ],
        actionItems: [
          "Consider expanding to additional countries for broader diversification",
        ],
        affectedEntities: props.map(propertyEntity),
      });
    }
  }

  return insights;
}

function generateStressTestInsights(properties: Property[]): RiskInsight[] {
  const insights: RiskInsight[] = [];

  for (const p of properties) {
    const baseRevenue = estimateAnnualRevenue(p);
    const baseNOI = estimateNOI(p);
    const debtService = estimateAnnualDebtService(p);

    // Stress: occupancy drops 15%
    const stressedOccupancy = (p.maxOccupancy ?? 0.7) * 0.85;
    const stressedRevenue = baseRevenue * (stressedOccupancy / (p.maxOccupancy ?? 0.7));
    const totalCostRate = (p.costRateRooms ?? 0) + (p.costRateFB ?? 0) + (p.costRateAdmin ?? 0) +
      (p.costRateMarketing ?? 0) + (p.costRatePropertyOps ?? 0) + (p.costRateUtilities ?? 0) +
      (p.costRateTaxes ?? 0) + (p.costRateIT ?? 0) + (p.costRateFFE ?? 0) + (p.costRateOther ?? 0) +
      (p.costRateInsurance ?? 0);
    const stressedNOI = stressedRevenue * (1 - totalCostRate);
    const noiDelta = stressedNOI - baseNOI;
    const cashAfterDebt = stressedNOI - debtService;

    if (debtService > 0 && cashAfterDebt < 0) {
      insights.push({
        category: "operational",
        severity: "warning",
        title: `${p.name}: occupancy stress breaks cash flow`,
        narrative: `If occupancy on "${p.name}" drops 15% (from ${pct(p.maxOccupancy ?? 0.7)} to ${pct(stressedOccupancy)}), NOI falls to ${dollars(stressedNOI)} — ${dollars(Math.abs(cashAfterDebt))} short of covering debt service. This stress scenario results in negative cash flow, meaning the investment would require additional capital to service its debt.`,
        dataPoints: [
          { label: "Base NOI", value: dollars(baseNOI) },
          { label: "Stressed NOI (-15% occ)", value: dollars(stressedNOI), delta: dollars(noiDelta) },
          { label: "Debt Service", value: dollars(debtService) },
          { label: "Cash Shortfall", value: dollars(cashAfterDebt) },
        ],
        actionItems: [
          "Build a cash reserve to cover 12 months of potential shortfall",
          "Negotiate covenants that allow for temporary DSCR dips",
          "Develop contingency plan for revenue decline (cost cuts, marketing push)",
        ],
        affectedEntities: [propertyEntity(p)],
      });
    }

    // Stress: rates rise 200bps
    if (debtService > 0) {
      const currentRate = p.acquisitionInterestRate ?? 0.065;
      const stressedRate = currentRate + 0.02;
      const loanAmount = (p.purchasePrice ?? 0) * (p.acquisitionLTV ?? 0);
      const stressedMonthlyRate = stressedRate / 12;
      const termMonths = (p.acquisitionTermYears ?? 25) * 12;
      const stressedMonthly = loanAmount > 0 && stressedMonthlyRate > 0
        ? loanAmount * (stressedMonthlyRate * Math.pow(1 + stressedMonthlyRate, termMonths)) / (Math.pow(1 + stressedMonthlyRate, termMonths) - 1)
        : 0;
      const stressedDebtService = stressedMonthly * 12;
      const debtServiceIncrease = stressedDebtService - debtService;
      const stressedCash = baseNOI - stressedDebtService;

      if (stressedCash < 0 && baseNOI - debtService > 0) {
        insights.push({
          category: "macro",
          severity: "warning",
          title: `${p.name}: rate increase breaks cash flow`,
          narrative: `A 200 basis point increase in interest rates on "${p.name}" would raise annual debt service by ${dollars(debtServiceIncrease)} to ${dollars(stressedDebtService)}, pushing the property from positive to negative cash flow. This is a significant vulnerability for variable-rate debt or upcoming refinancing.`,
          dataPoints: [
            { label: "Current Rate", value: pct(currentRate) },
            { label: "Stressed Rate (+200bps)", value: pct(stressedRate) },
            { label: "Current Debt Service", value: dollars(debtService) },
            { label: "Stressed Debt Service", value: dollars(stressedDebtService), delta: `+${dollars(debtServiceIncrease)}` },
            { label: "Cash Flow at Stressed Rate", value: dollars(stressedCash) },
          ],
          actionItems: [
            "Lock in fixed-rate financing to eliminate rate risk",
            "Purchase an interest rate cap to limit exposure",
            "Reduce leverage to improve cash flow cushion",
          ],
          affectedEntities: [propertyEntity(p)],
        });
      }
    }
  }

  return insights;
}

// ─── Main Deterministic Generator ─────────────────────────────────────────────

export async function generateDeterministicInsights(
  properties: Property[],
  _globalAssumptions?: any,
  _riskReport?: PortfolioRiskReport,
): Promise<{
  insights: RiskInsight[];
  macroContext: PortfolioRiskBrief["macroContext"];
}> {
  const leverageInsights = generateLeverageInsights(properties);
  const assumptionInsights = generateAssumptionChallengeInsights(properties);
  const { insights: macroInsights, macroContext } = await generateMacroInsights(properties);
  const regulatoryInsights = generateRegulatoryInsights(properties);
  const concentrationInsights = generateConcentrationInsights(properties);
  const stressInsights = generateStressTestInsights(properties);

  const allInsights = [
    ...leverageInsights,
    ...assumptionInsights,
    ...macroInsights,
    ...regulatoryInsights,
    ...concentrationInsights,
    ...stressInsights,
  ];

  // Sort by severity: critical > warning > caution > info
  const severityOrder: Record<string, number> = { critical: 0, warning: 1, caution: 2, info: 3 };
  allInsights.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return { insights: allInsights, macroContext };
}

// ─── Per-Property Brief (Deterministic) ───────────────────────────────────────

function buildDeterministicPropertyBrief(
  property: Property,
  allInsights: RiskInsight[],
): PropertyRiskBrief {
  const propInsights = allInsights.filter(i =>
    i.affectedEntities.some(e => e.type === "property" && e.id === property.id),
  );

  const riskLevel = assessPropertyRiskLevel(propInsights);

  // Build basic strengths
  const strengths: string[] = [];
  const noi = estimateNOI(property);
  const debtService = estimateAnnualDebtService(property);
  const dscr = debtService > 0 ? noi / debtService : 99;

  if (dscr > BENCHMARKS.dscr150Threshold && debtService > 0) {
    strengths.push(`Strong debt service coverage at ${dscr.toFixed(2)}x`);
  }
  if ((property.acquisitionLTV ?? 0) < 0.65 && (property.acquisitionLTV ?? 0) > 0) {
    strengths.push(`Conservative leverage at ${pct(property.acquisitionLTV ?? 0)} LTV`);
  }
  if ((property.roomCount ?? 0) >= 10) {
    strengths.push(`Scale advantage with ${property.roomCount} rooms`);
  }
  const fbShare = property.revShareFB ?? 0;
  const eventsShare = property.revShareEvents ?? 0;
  if (fbShare > 0.20 || eventsShare > 0.10) {
    strengths.push("Diversified revenue streams beyond room revenue");
  }

  const strengthsNarrative = strengths.length > 0
    ? `Key strengths: ${strengths.join(". ")}. These factors support the investment thesis and provide resilience against market downturns.`
    : "No standout strengths identified based on current assumptions. Consider running research engines to validate positioning.";

  // Build concerns narrative from insights
  const concerns = propInsights
    .filter(i => i.severity === "warning" || i.severity === "critical")
    .map(i => i.title);
  const concernsNarrative = concerns.length > 0
    ? `Key concerns: ${concerns.join(". ")}. These risks should be addressed or mitigated before committing capital.`
    : propInsights.filter(i => i.severity === "caution").length > 0
      ? `Minor cautions flagged (${propInsights.filter(i => i.severity === "caution").length} items). Review these to ensure assumptions are well-supported.`
      : "No significant concerns identified based on current data.";

  // Basic questions
  const questions = [
    "What is the competitive set and how does this property differentiate?",
    "What is the realistic ramp-up timeline based on comparable openings?",
    "What are the key downside scenarios and how much capital is at risk?",
  ];

  return {
    propertyId: property.id,
    propertyName: property.name,
    overallRiskLevel: riskLevel,
    insights: propInsights,
    strengthsNarrative,
    concernsNarrative,
    questionsToAsk: questions,
  };
}

// ─── LLM-Enhanced Narratives ──────────────────────────────────────────────────

export async function generateLLMRiskBrief(
  deterministicInsights: RiskInsight[],
  propertyBriefs: PropertyRiskBrief[],
  macroContext: PortfolioRiskBrief["macroContext"],
): Promise<{
  overallNarrative: string;
  enhancedBriefs: PropertyRiskBrief[];
} | null> {
  try {
    const anthropic = getAnthropicClient();

    // Build structured prompt
    const insightsSummary = deterministicInsights
      .slice(0, 15)
      .map(i => `[${i.severity.toUpperCase()}] ${i.title}: ${i.narrative}`)
      .join("\n\n");

    const propertySummaries = propertyBriefs
      .map(b => `${b.propertyName} (Risk: ${b.overallRiskLevel}): ${b.insights.length} insights. Strengths: ${b.strengthsNarrative} Concerns: ${b.concernsNarrative}`)
      .join("\n\n");

    const macroSummary = `Fed Funds: ${macroContext.fedFundsRate}, Mortgage Rate: ${macroContext.mortgageRate}, CPI: ${macroContext.inflationRate}. ${macroContext.narrative}`;

    const prompt = `You are a senior hospitality investment analyst preparing a risk brief for an investor evaluating a boutique hospitality portfolio.

Portfolio data (top risk insights):
${insightsSummary}

Property profiles:
${propertySummaries}

Current macro environment:
${macroSummary}

Generate a concise, professional risk brief in this exact JSON format:
{
  "overallNarrative": "3-5 sentence portfolio summary for investors (plain language, no jargon, explain what the numbers mean)",
  "propertyEnhancements": [
    {
      "propertyName": "exact property name",
      "strengthsNarrative": "2-3 sentences on what's good about this investment",
      "concernsNarrative": "2-3 sentences on what an investor should worry about",
      "questionsToAsk": ["3-5 specific questions an investor should ask before committing"]
    }
  ]
}

Rules:
1. Be direct and honest — flag aggressive assumptions without being alarmist
2. Write like a Wall Street analyst, not a marketer — investors want truth
3. Connect macro data to property-level impact (e.g., "rates at X% means your debt service on Property Y is Z")
4. Questions should be specific to these properties, not generic
5. Return ONLY valid JSON, no markdown formatting`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250514",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = response.content.find(b => b.type === "text");
    if (!textBlock || textBlock.type !== "text") return null;

    const parsed = JSON.parse(textBlock.text);

    // Enhance property briefs with LLM content
    const enhancedBriefs = propertyBriefs.map(brief => {
      const enhancement = parsed.propertyEnhancements?.find(
        (e: any) => e.propertyName === brief.propertyName,
      );
      if (enhancement) {
        return {
          ...brief,
          strengthsNarrative: enhancement.strengthsNarrative || brief.strengthsNarrative,
          concernsNarrative: enhancement.concernsNarrative || brief.concernsNarrative,
          questionsToAsk: enhancement.questionsToAsk || brief.questionsToAsk,
        };
      }
      return brief;
    });

    return {
      overallNarrative: parsed.overallNarrative || "",
      enhancedBriefs,
    };
  } catch (err: unknown) {
    logger.warn(`LLM risk brief generation failed (graceful degradation): ${err instanceof Error ? err.message : err}`, "risk-intelligence");
    return null;
  }
}

// ─── Top-Level Orchestrators ──────────────────────────────────────────────────

/**
 * Generate a full portfolio risk brief with deterministic insights and optional LLM narratives.
 */
export async function generatePortfolioRiskBrief(
  properties: Property[],
  options: { includeLLM?: boolean } = {},
): Promise<PortfolioRiskBrief> {
  const active = properties.filter((p: any) => p.isActive !== false);

  // Deterministic analysis
  const { insights, macroContext } = await generateDeterministicInsights(active);

  // Build per-property briefs
  const propertyBriefs = active.map(p => buildDeterministicPropertyBrief(p, insights));

  // Identify top risks and strengths
  const topRisks = insights
    .filter(i => i.severity === "critical" || i.severity === "warning")
    .slice(0, 5);

  // Build strength insights from positive signals
  const strengthInsights: RiskInsight[] = [];
  const riskReport = computePortfolioRiskScore(active);

  if (riskReport.financialRisk.score >= 80) {
    strengthInsights.push({
      category: "leverage",
      severity: "info",
      title: "Strong financial fundamentals",
      narrative: `The portfolio has healthy financial metrics with an average LTV of ${pct(riskReport.financialRisk.averageLTV)} and portfolio DSCR of ${riskReport.financialRisk.portfolioDSCR.toFixed(2)}x. This provides a solid margin of safety against market downturns.`,
      dataPoints: [
        { label: "Avg LTV", value: pct(riskReport.financialRisk.averageLTV) },
        { label: "Portfolio DSCR", value: `${riskReport.financialRisk.portfolioDSCR.toFixed(2)}x` },
      ],
      actionItems: [],
      affectedEntities: [],
    });
  }

  if (riskReport.geographicRisk.countriesCount >= 2) {
    strengthInsights.push({
      category: "concentration",
      severity: "info",
      title: "Geographic diversification",
      narrative: `The portfolio spans ${riskReport.geographicRisk.countriesCount} countries and ${riskReport.geographicRisk.marketsCount} distinct markets, providing meaningful geographic diversification that reduces exposure to any single market downturn.`,
      dataPoints: [
        { label: "Countries", value: `${riskReport.geographicRisk.countriesCount}` },
        { label: "Markets", value: `${riskReport.geographicRisk.marketsCount}` },
      ],
      actionItems: [],
      affectedEntities: [],
    });
  }

  if (riskReport.operationalRisk.averageOccupancy > 0.75) {
    strengthInsights.push({
      category: "operational",
      severity: "info",
      title: "Solid occupancy targets",
      narrative: `Average target occupancy of ${pct(riskReport.operationalRisk.averageOccupancy)} is healthy and supported by market data. This provides a strong revenue foundation for the portfolio.`,
      dataPoints: [
        { label: "Avg Occupancy", value: pct(riskReport.operationalRisk.averageOccupancy) },
      ],
      actionItems: [],
      affectedEntities: [],
    });
  }

  const topStrengths = strengthInsights.slice(0, 3);

  // Default overall narrative (deterministic)
  let overallNarrative = `This portfolio of ${active.length} boutique hospitality ${active.length === 1 ? "property" : "properties"} has an overall risk grade of ${riskReport.riskGrade} (score: ${riskReport.overallScore}/100). `;
  if (topRisks.length > 0) {
    overallNarrative += `Key risk areas: ${topRisks.slice(0, 3).map(r => r.title).join("; ")}. `;
  }
  if (topStrengths.length > 0) {
    overallNarrative += `Key strengths: ${topStrengths.map(s => s.title).join("; ")}.`;
  }

  let finalBriefs = propertyBriefs;

  // Optional LLM enhancement
  if (options.includeLLM) {
    const llmResult = await generateLLMRiskBrief(insights, propertyBriefs, macroContext);
    if (llmResult) {
      overallNarrative = llmResult.overallNarrative || overallNarrative;
      finalBriefs = llmResult.enhancedBriefs;
    }
  }

  return {
    overallNarrative,
    propertyBriefs: finalBriefs,
    macroContext,
    topRisks,
    topStrengths,
  };
}

/**
 * Generate a risk brief for a single property.
 */
export async function generatePropertyRiskBrief(
  property: Property,
  allProperties: Property[],
  options: { includeLLM?: boolean } = {},
): Promise<PropertyRiskBrief> {
  const { insights, macroContext } = await generateDeterministicInsights(allProperties);
  let brief = buildDeterministicPropertyBrief(property, insights);

  if (options.includeLLM) {
    const llmResult = await generateLLMRiskBrief(
      insights.filter(i => i.affectedEntities.some(e => e.type === "property" && e.id === property.id)),
      [brief],
      macroContext,
    );
    if (llmResult && llmResult.enhancedBriefs.length > 0) {
      brief = llmResult.enhancedBriefs[0];
    }
  }

  return brief;
}

/**
 * Get a brief risk summary string suitable for inclusion in Rebecca context.
 */
export function getRiskSummaryForContext(brief: PropertyRiskBrief): string {
  const topInsight = brief.insights[0];
  const topStrength = brief.strengthsNarrative.split(":")[1]?.split(".")[0]?.trim() ?? "See full risk brief";
  const topConcern = topInsight?.title ?? "No significant concerns";
  return `Risk Profile: ${brief.overallRiskLevel}. Key concern: ${topConcern}. Key strength: ${topStrength}.`;
}
