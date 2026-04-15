/**
 * server/ai/portfolio-risk-scorer.ts — Portfolio Risk Scoring Engine
 *
 * Analyzes concentration risk, geographic diversification, market tier exposure,
 * financial leverage, and operational metrics across the portfolio. Produces
 * a 0-100 score (higher = lower risk) with a letter grade (A-F) and actionable
 * recommendations.
 *
 * Works with live DB data — pulls property records directly and computes
 * metrics from their stored assumptions. No full engine run required.
 */

import type { Property } from "@shared/schema";
import { getCountryDefaults } from "@shared/countryDefaults";
import { pmt } from "../../calc/shared/pmt";

// ─── Public Interface ──────────────────────────────────────────────────────────

export interface PortfolioRiskReport {
  overallScore: number;
  riskGrade: "A" | "B" | "C" | "D" | "F";

  concentrationRisk: {
    score: number;
    propertyCount: number;
    herfindahlIndex: number;
    topPropertyRevenueShare: number;
    findings: string[];
  };

  geographicRisk: {
    score: number;
    countriesCount: number;
    marketsCount: number;
    countryExposure: Array<{
      country: string;
      propertyCount: number;
      revenueShare: number;
      countryRiskPremium: number;
    }>;
    findings: string[];
  };

  marketTierRisk: {
    score: number;
    tierDistribution: Record<string, number>;
    averageQualityTier: string;
    findings: string[];
  };

  financialRisk: {
    score: number;
    averageLTV: number;
    maxLTV: number;
    portfolioDSCR: number;
    averageCapRate: number;
    cashFlowAtRisk: number;
    findings: string[];
  };

  operationalRisk: {
    score: number;
    averageOccupancy: number;
    occupancyVariance: number;
    averageAgeYears: number;
    propertiesNeedingRenovation: number;
    findings: string[];
  };

  recommendations: string[];
}

// ─── Weights ──────────────────────────────────────────────────────────────────

const WEIGHT_CONCENTRATION = 0.25;
const WEIGHT_GEOGRAPHIC = 0.25;
const WEIGHT_MARKET_TIER = 0.15;
const WEIGHT_FINANCIAL = 0.25;
const WEIGHT_OPERATIONAL = 0.10;

// ─── Revenue Estimation ────────────────────────────────────────────────────────

/**
 * Estimate annualized revenue for a property from its stored assumptions.
 * Uses Year 1 stabilized occupancy, ADR, room count, and ancillary rev shares
 * to produce a rough total revenue figure without running the full engine.
 */
function estimateAnnualRevenue(p: Property): number {
  const roomCount = p.roomCount ?? 1;
  const adr = p.startAdr ?? 0;
  const occupancy = p.maxOccupancy ?? 0.7;
  const daysPerYear = 365;

  // For per-property (VRBO) pricing use nightly rate instead
  const isPricingPerProperty = p.pricingModel === "per_property";
  const nightlyRate = isPricingPerProperty
    ? (p.nightlyPropertyRate ?? adr)
    : 0;

  const roomRevenue = isPricingPerProperty
    ? nightlyRate * occupancy * daysPerYear
    : roomCount * adr * occupancy * daysPerYear;

  const revShareFB = p.revShareFB ?? 0;
  const revShareEvents = p.revShareEvents ?? 0;
  const revShareOther = p.revShareOther ?? 0;
  const ancillaryMultiplier = 1 + revShareFB + revShareEvents + revShareOther;

  return roomRevenue * ancillaryMultiplier;
}

// ─── Concentration Risk ────────────────────────────────────────────────────────

function scoreConcentrationRisk(properties: Property[]): PortfolioRiskReport["concentrationRisk"] {
  const findings: string[] = [];
  const count = properties.length;

  if (count === 0) {
    return { score: 0, propertyCount: 0, herfindahlIndex: 1, topPropertyRevenueShare: 0, findings: ["No active properties in portfolio."] };
  }

  const revenues = properties.map(p => estimateAnnualRevenue(p));
  const totalRevenue = revenues.reduce((sum, r) => sum + r, 0);

  if (totalRevenue === 0) {
    return { score: 0, propertyCount: count, herfindahlIndex: 1, topPropertyRevenueShare: 0, findings: ["Total estimated revenue is zero."] };
  }

  const shares = revenues.map(r => r / totalRevenue);
  const hhi = shares.reduce((sum, s) => sum + s * s, 0);
  const topShare = Math.max(...shares);

  // Score HHI
  let score: number;
  if (hhi < 0.15) score = 100;
  else if (hhi <= 0.25) score = 70;
  else if (hhi <= 0.40) score = 40;
  else score = 20;

  // Penalize top-heavy portfolio
  if (topShare > 0.50) {
    score = Math.max(0, score - 20);
    const topPropIndex = shares.indexOf(topShare);
    const topName = properties[topPropIndex]?.name ?? "Unknown";
    findings.push(`"${topName}" accounts for ${(topShare * 100).toFixed(1)}% of estimated portfolio revenue — high single-asset concentration.`);
  }

  // Penalize small portfolios
  if (count < 3) {
    score = Math.max(0, score - 15);
    findings.push(`Only ${count} active ${count === 1 ? "property" : "properties"} — minimal diversification.`);
  }

  if (hhi >= 0.25) {
    findings.push(`Herfindahl Index of ${hhi.toFixed(3)} indicates concentrated revenue distribution.`);
  }

  if (findings.length === 0) {
    findings.push(`Revenue is well-distributed across ${count} properties (HHI ${hhi.toFixed(3)}).`);
  }

  return { score: clamp(score), propertyCount: count, herfindahlIndex: round(hhi, 4), topPropertyRevenueShare: round(topShare, 4), findings };
}

// ─── Geographic Risk ───────────────────────────────────────────────────────────

function scoreGeographicRisk(properties: Property[]): PortfolioRiskReport["geographicRisk"] {
  const findings: string[] = [];

  if (properties.length === 0) {
    return { score: 0, countriesCount: 0, marketsCount: 0, countryExposure: [], findings: ["No active properties."] };
  }

  const revenues = properties.map(p => estimateAnnualRevenue(p));
  const totalRevenue = revenues.reduce((sum, r) => sum + r, 0) || 1;

  // Group by country
  const countryMap = new Map<string, { count: number; revenue: number }>();
  for (let i = 0; i < properties.length; i++) {
    const country = properties[i].country || "Unknown";
    const existing = countryMap.get(country) ?? { count: 0, revenue: 0 };
    existing.count += 1;
    existing.revenue += revenues[i];
    countryMap.set(country, existing);
  }

  // Distinct markets (city / metro)
  const markets = new Set<string>();
  for (const p of properties) {
    const market = p.market || p.city || "Unknown";
    markets.add(market.toLowerCase().trim());
  }

  const countriesCount = countryMap.size;
  const marketsCount = markets.size;

  // Base score: more countries = better
  // 1 country = 25, +15 per additional, max 100
  let score = Math.min(100, 25 + (countriesCount - 1) * 15);

  // Build country exposure array
  const countryExposure: PortfolioRiskReport["geographicRisk"]["countryExposure"] = [];
  for (const [country, data] of Array.from(countryMap.entries())) {
    const defaults = getCountryDefaults(country);
    const crp = defaults?.countryRiskPremium ?? 0;
    countryExposure.push({
      country,
      propertyCount: data.count,
      revenueShare: round(data.revenue / totalRevenue, 4),
      countryRiskPremium: crp,
    });
  }

  // Sort by revenue share descending
  countryExposure.sort((a, b) => b.revenueShare - a.revenueShare);

  // Penalize single-market concentration > 70%
  for (const entry of countryExposure) {
    if (entry.revenueShare > 0.70) {
      score = Math.max(0, score - 15);
      findings.push(`${(entry.revenueShare * 100).toFixed(1)}% of revenue concentrated in ${entry.country}.`);
    }
  }

  // Penalize high-CRP exposure
  const weightedCRP = countryExposure.reduce((sum, e) => sum + e.countryRiskPremium * e.revenueShare, 0);
  if (weightedCRP > 0.03) {
    score = Math.max(0, score - 10);
    findings.push(`High weighted country risk premium of ${(weightedCRP * 100).toFixed(2)}% — consider balancing with lower-risk markets.`);
  }

  if (countriesCount === 1) {
    findings.push(`All properties in a single country (${countryExposure[0]?.country ?? "Unknown"}).`);
  }

  if (findings.length === 0) {
    findings.push(`Portfolio spans ${countriesCount} countries and ${marketsCount} distinct markets.`);
  }

  return { score: clamp(score), countriesCount, marketsCount, countryExposure, findings };
}

// ─── Market Tier Risk ──────────────────────────────────────────────────────────

const TIER_ORDER = ["luxury", "upper_upscale", "upscale", "upper_midscale", "midscale", "economy"];

function scoreMarketTierRisk(properties: Property[]): PortfolioRiskReport["marketTierRisk"] {
  const findings: string[] = [];

  if (properties.length === 0) {
    return { score: 0, tierDistribution: {}, averageQualityTier: "unknown", findings: ["No active properties."] };
  }

  const tierDistribution: Record<string, number> = {};
  for (const p of properties) {
    const tier = p.qualityTier ?? "upscale";
    tierDistribution[tier] = (tierDistribution[tier] ?? 0) + 1;
  }

  const distinctTiers = Object.keys(tierDistribution).length;
  const total = properties.length;

  // Base score: more tier diversity = better
  // 1 tier = 40, 2 tiers = 65, 3+ tiers = 85, 4+ = 100
  let score: number;
  if (distinctTiers >= 4) score = 100;
  else if (distinctTiers >= 3) score = 85;
  else if (distinctTiers >= 2) score = 65;
  else score = 40;

  // Check concentration in specific tiers
  for (const [tier, count] of Object.entries(tierDistribution)) {
    const share = count / total;
    if (share > 0.70) {
      if (tier === "economy") {
        score = Math.max(0, score - 20);
        findings.push(`${(share * 100).toFixed(0)}% economy-tier concentration — margin pressure risk.`);
      } else if (tier === "luxury") {
        score = Math.max(0, score - 10);
        findings.push(`${(share * 100).toFixed(0)}% luxury-tier concentration — higher RevPAR but cyclical demand risk.`);
      }
    }
  }

  // Determine average tier
  const tierScores = properties.map(p => {
    const idx = TIER_ORDER.indexOf(p.qualityTier ?? "upscale");
    return idx >= 0 ? idx : 2; // default to "upscale"
  });
  const avgIdx = Math.round(tierScores.reduce((a, b) => a + b, 0) / tierScores.length);
  const averageQualityTier = TIER_ORDER[avgIdx] ?? "upscale";

  if (findings.length === 0) {
    findings.push(`Portfolio spans ${distinctTiers} quality tiers with average position at "${averageQualityTier}".`);
  }

  return { score: clamp(score), tierDistribution, averageQualityTier, findings };
}

// ─── Financial Risk ────────────────────────────────────────────────────────────

function scoreFinancialRisk(properties: Property[]): PortfolioRiskReport["financialRisk"] {
  const findings: string[] = [];

  if (properties.length === 0) {
    return { score: 0, averageLTV: 0, maxLTV: 0, portfolioDSCR: 0, averageCapRate: 0, cashFlowAtRisk: 0, findings: ["No active properties."] };
  }

  // LTV analysis
  const ltvValues: number[] = [];
  for (const p of properties) {
    const ltv = p.acquisitionLTV ?? 0;
    ltvValues.push(ltv);
  }

  const averageLTV = ltvValues.reduce((a, b) => a + b, 0) / ltvValues.length;
  const maxLTV = Math.max(...ltvValues);

  // LTV score
  let ltvScore: number;
  if (averageLTV < 0.60) ltvScore = 100;
  else if (averageLTV <= 0.75) ltvScore = 70;
  else if (averageLTV <= 0.85) ltvScore = 40;
  else ltvScore = 20;

  if (averageLTV > 0.75) {
    findings.push(`Average LTV of ${(averageLTV * 100).toFixed(1)}% indicates elevated leverage.`);
  }

  if (maxLTV > 0.85) {
    const highLtvProps = properties.filter(p => (p.acquisitionLTV ?? 0) > 0.85);
    for (const p of highLtvProps) {
      findings.push(`"${p.name}" has LTV of ${((p.acquisitionLTV ?? 0) * 100).toFixed(1)}% — consider reducing leverage.`);
    }
  }

  // DSCR estimation: NOI / annual debt service
  // Approximate annual debt service from purchase price, LTV, interest rate, and term
  let totalNOI = 0;
  let totalDebtService = 0;
  let negCashFlowCount = 0;

  for (const p of properties) {
    const revenue = estimateAnnualRevenue(p);
    const totalCostRate = (p.costRateRooms ?? 0) + (p.costRateFB ?? 0) + (p.costRateAdmin ?? 0) +
      (p.costRateMarketing ?? 0) + (p.costRatePropertyOps ?? 0) + (p.costRateUtilities ?? 0) +
      (p.costRateTaxes ?? 0) + (p.costRateIT ?? 0) + (p.costRateFFE ?? 0) + (p.costRateOther ?? 0) +
      (p.costRateInsurance ?? 0);
    // Sanity: if all cost rates are null/zero, use a conservative 60% cost assumption
    const safeCostRate = totalCostRate > 0.01 ? totalCostRate : 0.60;
    const noi = revenue * (1 - safeCostRate);
    totalNOI += noi;

    const ltv = p.acquisitionLTV ?? 0;
    const loanAmount = (p.purchasePrice ?? 0) * ltv;
    const rate = (p.acquisitionInterestRate ?? 0.065) / 12;
    const termMonths = (p.acquisitionTermYears ?? 25) * 12;

    let annualDebtService = 0;
    if (loanAmount > 0 && rate > 0 && termMonths > 0) {
      annualDebtService = pmt(loanAmount, rate, termMonths) * 12;
    }
    totalDebtService += annualDebtService;

    // Check for negative cash flow (NOI - debt service < 0)
    if (noi - annualDebtService < 0) {
      negCashFlowCount++;
    }
  }

  const portfolioDSCR = totalDebtService > 0 ? totalNOI / totalDebtService : 99;

  // DSCR score
  let dscrScore: number;
  if (portfolioDSCR > 2.0) dscrScore = 100;
  else if (portfolioDSCR >= 1.5) dscrScore = 80;
  else if (portfolioDSCR >= 1.25) dscrScore = 50;
  else dscrScore = 20;

  if (portfolioDSCR < 1.25 && totalDebtService > 0) {
    findings.push(`Portfolio DSCR of ${portfolioDSCR.toFixed(2)}x is below 1.25x — debt service coverage is thin.`);
  }

  // Negative cash flow penalty: each property = -15
  const negPenalty = negCashFlowCount * 15;

  const cashFlowAtRisk = properties.length > 0 ? negCashFlowCount / properties.length : 0;
  if (negCashFlowCount > 0) {
    findings.push(`${negCashFlowCount} ${negCashFlowCount === 1 ? "property has" : "properties have"} estimated negative cash flow after debt service.`);
  }

  // Average cap rate
  const capRates = properties.map(p => p.exitCapRate ?? 0.07).filter(c => c > 0);
  const averageCapRate = capRates.length > 0 ? capRates.reduce((a, b) => a + b, 0) / capRates.length : 0;

  // Combined score (average LTV and DSCR, minus negative-CF penalty)
  const score = Math.max(0, (ltvScore + dscrScore) / 2 - negPenalty);

  if (findings.length === 0) {
    findings.push(`Financial metrics are healthy: avg LTV ${(averageLTV * 100).toFixed(1)}%, DSCR ${portfolioDSCR.toFixed(2)}x.`);
  }

  return {
    score: clamp(score),
    averageLTV: round(averageLTV, 4),
    maxLTV: round(maxLTV, 4),
    portfolioDSCR: round(portfolioDSCR, 2),
    averageCapRate: round(averageCapRate, 4),
    cashFlowAtRisk: round(cashFlowAtRisk, 4),
    findings,
  };
}

// ─── Operational Risk ──────────────────────────────────────────────────────────

function scoreOperationalRisk(properties: Property[]): PortfolioRiskReport["operationalRisk"] {
  const findings: string[] = [];
  const currentYear = new Date().getFullYear();

  if (properties.length === 0) {
    return { score: 0, averageOccupancy: 0, occupancyVariance: 0, averageAgeYears: 0, propertiesNeedingRenovation: 0, findings: ["No active properties."] };
  }

  // Occupancy analysis
  const occupancies = properties.map(p => p.maxOccupancy ?? 0.7);
  const avgOcc = occupancies.reduce((a, b) => a + b, 0) / occupancies.length;

  // Occupancy score
  let occScore: number;
  if (avgOcc > 0.80) occScore = 100;
  else if (avgOcc >= 0.70) occScore = 70;
  else if (avgOcc >= 0.60) occScore = 40;
  else occScore = 20;

  // Occupancy variance (standard deviation)
  const occMean = avgOcc;
  const occVariance = Math.sqrt(
    occupancies.reduce((sum, o) => sum + Math.pow(o - occMean, 2), 0) / occupancies.length,
  );

  // High variance penalty
  if (occVariance > 0.10) {
    occScore = Math.max(0, occScore - 10);
    findings.push(`Occupancy varies significantly across properties (std dev ${(occVariance * 100).toFixed(1)}%).`);
  }

  // Age analysis
  const ages: number[] = [];
  let renovationCount = 0;
  for (const p of properties) {
    if (p.yearBuilt) {
      ages.push(currentYear - p.yearBuilt);
    }
    const lastReno = p.lastRenovationYear;
    if (lastReno && (currentYear - lastReno) > 10) {
      renovationCount++;
    } else if (!lastReno && p.yearBuilt && (currentYear - p.yearBuilt) > 10) {
      renovationCount++;
    }
  }

  const avgAge = ages.length > 0 ? ages.reduce((a, b) => a + b, 0) / ages.length : 0;

  // Renovation penalty
  if (renovationCount > 0) {
    occScore = Math.max(0, occScore - renovationCount * 5);
    findings.push(`${renovationCount} ${renovationCount === 1 ? "property needs" : "properties need"} renovation (last renovation > 10 years ago).`);
  }

  if (avgOcc < 0.70) {
    findings.push(`Average max occupancy of ${(avgOcc * 100).toFixed(1)}% is below the 70% threshold.`);
  }

  if (findings.length === 0) {
    findings.push(`Operational metrics are solid: avg occupancy ${(avgOcc * 100).toFixed(1)}%, low variance.`);
  }

  return {
    score: clamp(occScore),
    averageOccupancy: round(avgOcc, 4),
    occupancyVariance: round(occVariance, 4),
    averageAgeYears: round(avgAge, 1),
    propertiesNeedingRenovation: renovationCount,
    findings,
  };
}

// ─── Recommendations Engine ────────────────────────────────────────────────────

interface CategoryScore {
  category: string;
  score: number;
  findings: string[];
}

function generateRecommendations(
  categories: CategoryScore[],
  properties: Property[],
): string[] {
  const recommendations: string[] = [];
  const sorted = [...categories].sort((a, b) => a.score - b.score);

  for (const cat of sorted) {
    if (recommendations.length >= 5) break;
    if (cat.score >= 80) continue; // Don't recommend for strong areas

    switch (cat.category) {
      case "concentration": {
        if (properties.length < 3) {
          recommendations.push("Expand the portfolio to at least 3-5 properties to reduce single-asset concentration risk.");
        } else {
          const revenues = properties.map(p => ({ name: p.name, rev: estimateAnnualRevenue(p) }));
          revenues.sort((a, b) => b.rev - a.rev);
          if (revenues.length > 0) {
            recommendations.push(
              `Consider geographic diversification — "${revenues[0].name}" dominates portfolio revenue. Adding mid-tier properties in different markets would improve concentration metrics.`,
            );
          }
        }
        break;
      }
      case "geographic": {
        const countries = Array.from(new Set(properties.map(p => p.country || "Unknown")));
        if (countries.length <= 1) {
          recommendations.push(`All properties are in ${countries[0]}. Consider expanding to additional countries to reduce geographic concentration.`);
        } else {
          const highCRPCountries = countries
            .filter(c => (getCountryDefaults(c)?.countryRiskPremium ?? 0) > 0.03);
          if (highCRPCountries.length > 0) {
            recommendations.push(`Reduce exposure to high country-risk markets (${highCRPCountries.join(", ")}) by balancing with properties in lower-risk countries.`);
          }
        }
        break;
      }
      case "marketTier": {
        const tiers = Array.from(new Set(properties.map(p => p.qualityTier ?? "upscale")));
        if (tiers.length === 1) {
          recommendations.push(`All properties are ${tiers[0]}-tier. Diversifying across quality tiers reduces cyclical demand risk.`);
        }
        break;
      }
      case "financial": {
        const highLTV = properties.filter(p => (p.acquisitionLTV ?? 0) > 0.80);
        if (highLTV.length > 0) {
          const names = highLTV.map(p => p.name).join(", ");
          recommendations.push(`Reduce leverage on ${names} (LTV > 80%) to improve financial risk score and debt service coverage.`);
        } else {
          recommendations.push("Review debt structure — consider refinancing to lower rates or extending amortization to improve DSCR.");
        }
        break;
      }
      case "operational": {
        const lowOcc = properties.filter(p => (p.maxOccupancy ?? 0.7) < 0.60);
        if (lowOcc.length > 0) {
          recommendations.push(`Properties with low occupancy targets (${lowOcc.map(p => p.name).join(", ")}) may need repositioning or marketing investment.`);
        }
        const needsReno = properties.filter(p => {
          const year = new Date().getFullYear();
          return (p.lastRenovationYear && (year - p.lastRenovationYear) > 10) ||
            (!p.lastRenovationYear && p.yearBuilt && (year - p.yearBuilt) > 10);
        });
        if (needsReno.length > 0) {
          recommendations.push(`Plan renovation capital for ${needsReno.map(p => p.name).join(", ")} to maintain competitive positioning and ADR.`);
        }
        break;
      }
    }
  }

  if (recommendations.length === 0) {
    recommendations.push("Portfolio risk profile is strong. Continue monitoring market conditions and maintain current diversification strategy.");
  }

  return recommendations.slice(0, 5);
}

// ─── Grade Assignment ──────────────────────────────────────────────────────────

function assignGrade(score: number): "A" | "B" | "C" | "D" | "F" {
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  if (score >= 50) return "C";
  if (score >= 35) return "D";
  return "F";
}

// ─── Main Scorer ───────────────────────────────────────────────────────────────

/**
 * Compute the portfolio risk report from an array of Property records.
 * Only active properties should be passed in (filter isActive before calling).
 */
export function computePortfolioRiskScore(properties: Property[]): PortfolioRiskReport {
  const active = properties.filter(p => p.isActive !== false);

  const concentration = scoreConcentrationRisk(active);
  const geographic = scoreGeographicRisk(active);
  const marketTier = scoreMarketTierRisk(active);
  const financial = scoreFinancialRisk(active);
  const operational = scoreOperationalRisk(active);

  const overallScore = clamp(Math.round(
    concentration.score * WEIGHT_CONCENTRATION +
    geographic.score * WEIGHT_GEOGRAPHIC +
    marketTier.score * WEIGHT_MARKET_TIER +
    financial.score * WEIGHT_FINANCIAL +
    operational.score * WEIGHT_OPERATIONAL,
  ));

  const categories: CategoryScore[] = [
    { category: "concentration", score: concentration.score, findings: concentration.findings },
    { category: "geographic", score: geographic.score, findings: geographic.findings },
    { category: "marketTier", score: marketTier.score, findings: marketTier.findings },
    { category: "financial", score: financial.score, findings: financial.findings },
    { category: "operational", score: operational.score, findings: operational.findings },
  ];

  const recommendations = generateRecommendations(categories, active);

  return {
    overallScore,
    riskGrade: assignGrade(overallScore),
    concentrationRisk: concentration,
    geographicRisk: geographic,
    marketTierRisk: marketTier,
    financialRisk: financial,
    operationalRisk: operational,
    recommendations,
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function round(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}
