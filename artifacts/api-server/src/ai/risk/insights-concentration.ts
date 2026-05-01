/**
 * Concentration insight generator — flags single-property revenue
 * concentration and single-market/single-country geographic concentration.
 */

import type { Property } from "@workspace/db";
import type { RiskInsight } from "@shared/risk-types";
import { BENCHMARKS } from "./benchmarks";
import { dollars, estimateAnnualRevenue, pct, propertyEntity } from "./helpers";

export function generateConcentrationInsights(properties: Property[]): RiskInsight[] {
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
