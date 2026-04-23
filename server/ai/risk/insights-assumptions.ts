/**
 * Assumption-challenge insight generator — flags ADR/occupancy/cost rate
 * assumptions that deviate from hospitality benchmarks.
 */

import type { Property } from "@shared/schema";
import type { RiskInsight } from "@shared/risk-types";
import { BENCHMARKS } from "./benchmarks";
import { dollars, pct, propertyEntity } from "./helpers";

export function generateAssumptionChallengeInsights(properties: Property[]): RiskInsight[] {
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
