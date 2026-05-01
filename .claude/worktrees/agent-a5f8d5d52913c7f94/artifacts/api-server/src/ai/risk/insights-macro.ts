/**
 * Macro insight generator — reads FRED snapshots (Fed funds, 30Y mortgage,
 * CPI) and surfaces insights about the rate and inflation environment.
 */

import type { Property } from "@workspace/db";
import type { RiskInsight, MacroContext } from "@shared/risk-types";
import { fetchMacroRates } from "../ambient/fetchers";
import { logger } from "../../logger";
import { propertyEntity } from "./helpers";

export async function generateMacroInsights(properties: Property[]): Promise<{
  insights: RiskInsight[];
  macroContext: MacroContext;
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
