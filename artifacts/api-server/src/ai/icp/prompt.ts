/**
 * server/ai/icp/prompt.ts — LLM prompt builder for the qualitative ICP
 * sections (Phase 2 AI step). The single prompt produces all 9 descriptive
 * fields plus the investor-ready ICP essay.
 */

import type { GlobalAssumptions } from "@workspace/db";
import type {
  GeneratedIcpConfig,
  PortfolioAnalysis,
} from "@shared/icp-types";
import { fmtK, pctDisplay } from "./helpers";

export function buildIcpGenerationPrompt(
  analysis: PortfolioAnalysis,
  ga: GlobalAssumptions | null,
  config: GeneratedIcpConfig,
): string {
  const companyName = ga?.companyName || "Management Company";
  const description = ga?.assetDescription || "";
  const propertyLabel = ga?.propertyLabel || "Hotel";

  const locationList = analysis.locations.map(l =>
    [l.city, l.state, l.country].filter(Boolean).join(", ")
  ).join("; ");

  const tierList = Object.entries(analysis.qualityTiers).map(([k, v]) => `${k}: ${v}`).join(", ");
  const modelList = Object.entries(analysis.businessModels).map(([k, v]) => `${k}: ${v}`).join(", ");

  return `You are a hospitality investment analyst writing the Ideal Customer Profile (ICP) for a boutique hospitality management company.

## COMPANY CONTEXT
- **Company:** ${companyName}
- **Description:** ${description || "Boutique hospitality management company"}
- **Property Label:** ${propertyLabel}

## PORTFOLIO ANALYSIS (${analysis.propertyCount} properties)
- **Rooms:** ${analysis.rooms.min}–${analysis.rooms.max} (median ${analysis.rooms.median})
- **ADR:** $${analysis.adr.min}–$${analysis.adr.max} (median $${analysis.adr.median})
- **Purchase Price:** $${fmtK(analysis.purchasePrice.min)}–$${fmtK(analysis.purchasePrice.max)}
- **Quality Tiers:** ${tierList || "not classified"}
- **Business Models:** ${modelList || "hotel"}
- **Locations:** ${locationList || "not specified"}
- **Countries:** ${analysis.countries.join(", ") || "US"}
- **International:** ${analysis.isInternational ? "Yes" : "No"}
- **F&B Operations:** ${analysis.hasFB ? "Yes" : "No"}${analysis.fbSeats ? ` (${analysis.fbSeats.min}–${analysis.fbSeats.max} seats)` : ""}
- **Event Capability:** ${analysis.hasEvents ? "Yes" : "No"}${analysis.eventSpaceSqft ? ` (${analysis.eventSpaceSqft.min}–${analysis.eventSpaceSqft.max} sqft)` : ""}
- **Acreage:** ${analysis.acreage ? `${analysis.acreage.min}–${analysis.acreage.max} acres` : "not recorded"}
- **Building Size:** ${analysis.buildingSqft ? `${fmtK(analysis.buildingSqft.min)}–${fmtK(analysis.buildingSqft.max)} sqft` : "not recorded"}
- **Revenue Mix (F&B):** ${analysis.revShareFB ? `${pctDisplay(analysis.revShareFB.min)}–${pctDisplay(analysis.revShareFB.max)}` : "not set"}
- **Revenue Mix (Events):** ${analysis.revShareEvents ? `${pctDisplay(analysis.revShareEvents.min)}–${pctDisplay(analysis.revShareEvents.max)}` : "not set"}

## DERIVED ICP PARAMETERS
- **Target Rooms:** ${config.roomsMin}–${config.roomsMax} (sweet spot ${config.roomsSweetSpotMin}–${config.roomsSweetSpotMax})
- **Target ADR:** $${config.adrMin}–$${config.adrMax}
- **Target Acquisition:** $${fmtK(config.acquisitionMin)}–$${fmtK(config.acquisitionMax)}
- **F&B Rating:** ${config.fbRating}/5
- **Dominant Quality:** ${analysis.dominantQualityTier}
- **Dominant Model:** ${analysis.dominantBusinessModel}

## TASK

Generate the following 10 sections for this company's ICP. Each section should be specific to THIS company's portfolio, markets, and strategy — NOT generic hospitality copy. Reference actual locations, property types, and financial parameters from the portfolio above.

Return a JSON object with these exact keys:

\`\`\`json
{
  "propertyTypes": "<2-3 sentences describing ideal property types based on the portfolio pattern>",
  "fbLevel": "<2-3 sentences describing F&B operations requirements based on portfolio>",
  "locationCharacteristics": "<2-3 sentences describing ideal location traits based on where current properties are>",
  "locationDetails": "<Paragraph per geographic region where the company operates or targets, with evocative descriptions of each market. Include current portfolio locations AND 2-3 logical expansion markets.>",
  "conditionNotes": "<2-3 sentences on property condition requirements>",
  "groundsTopography": "<2-3 sentences on grounds/landscape preferences based on portfolio>",
  "vendorServices": "<Brief bullet list of vendor service categories the management company coordinates>",
  "regulatoryNotes": "<2-3 sentences on regulatory requirements based on the markets the company operates in>",
  "exclusions": "<Bulleted list of property types and situations to exclude, based on what the company does NOT do>",
  "icpEssay": "<A 3-5 paragraph investment-ready narrative essay summarizing the complete ICP. This goes into investor presentations. Professional, specific, data-backed.>"
}
\`\`\`

Do not output any text outside the JSON code block.`;
}
