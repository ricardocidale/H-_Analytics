/**
 * server/ai/icp/narrative.ts — Investor-grade ICP narrative builder.
 *
 * Renders a rich markdown ICP narrative for injection into research prompts.
 * Replaces the weak 5-field `buildIcpNarrative()` in company-pack.ts.
 */

import type {
  GeneratedIcpConfig,
  GeneratedIcpDescriptive,
} from "@shared/icp-types";
import { fmtK } from "./helpers";

export function buildFullIcpNarrative(
  config: GeneratedIcpConfig | Record<string, unknown>,
  descriptive: GeneratedIcpDescriptive | Record<string, unknown>,
  companyName: string,
): string {
  // Cast to a permissive map for dynamic field access; templates tolerate
  // missing fields by emitting a `?` placeholder.
  const c = config as Record<string, unknown>;
  const d = descriptive as Record<string, unknown>;

  const num = (key: string): number =>
    typeof c[key] === "number" ? (c[key] as number) : 0;
  const val = (key: string): string | number =>
    (c[key] as string | number | undefined) ?? "?";
  const str = (key: string): string =>
    typeof d[key] === "string" ? (d[key] as string) : "";

  const sections: string[] = [];

  sections.push(`## Ideal Customer Profile — ${companyName}`);

  // Property targeting
  sections.push(`### Target Property Profile
- **Rooms:** ${val("roomsMin")}–${val("roomsMax")} (sweet spot ${val("roomsSweetSpotMin")}–${val("roomsSweetSpotMax")})
- **Land:** ${val("landAcresMin")}–${val("landAcresMax")} acres
- **Building:** ${fmtK(num("builtSqFtMin"))}–${fmtK(num("builtSqFtMax"))} sqft
- **ADR Target:** $${val("adrMin")}–$${val("adrMax")}
- **Occupancy Target:** ${val("occupancyMin")}%–${val("occupancyMax")}%
- **F&B Rating:** ${val("fbRating")}/5
- **Property Types:** ${str("propertyTypes") || "Not specified"}`);

  // Financial targets
  sections.push(`### Financial Criteria
- **Acquisition:** $${fmtK(num("acquisitionMin"))}–$${fmtK(num("acquisitionMax"))} (target $${fmtK(num("acquisitionTargetMin"))}–$${fmtK(num("acquisitionTargetMax"))})
- **Total Investment:** $${fmtK(num("totalInvestmentMin"))}–$${fmtK(num("totalInvestmentMax"))}
- **Renovation:** $${fmtK(num("renovationMin"))}–$${fmtK(num("renovationMax"))}
- **Target IRR:** ${val("targetIrr")}%
- **Equity Multiple:** ${val("equityMultipleMin")}x–${val("equityMultipleMax")}x
- **Hold Period:** ${val("holdYearsMin")}–${val("holdYearsMax")} years
- **Exit Cap Rate:** ${val("exitCapRateMin")}%–${val("exitCapRateMax")}%`);

  // Revenue mix
  sections.push(`### Revenue Mix Targets
- **F&B Share:** ${val("fbShareMin")}%–${val("fbShareMax")}%
- **Events Share:** ${val("eventsShareMin")}%–${val("eventsShareMax")}%
- **Total Ancillary:** ${val("totalAncillaryMin")}%–${val("totalAncillaryMax")}%
- **Management Fee:** ${val("baseMgmtFeeMin")}%–${val("baseMgmtFeeMax")}% base, ${val("incentiveFeeMin")}%–${val("incentiveFeeMax")}% incentive`);

  // Key amenities
  const mustHave: string[] = [];
  const majorPlus: string[] = [];
  for (const [key, value] of Object.entries(c)) {
    if (value === "must") mustHave.push(key);
    else if (value === "major") majorPlus.push(key);
  }
  if (mustHave.length > 0 || majorPlus.length > 0) {
    sections.push(`### Amenity Requirements
- **Must Have:** ${mustHave.join(", ") || "none specified"}
- **Major Plus:** ${majorPlus.join(", ") || "none specified"}`);
  }

  // Location
  const locChars = str("locationCharacteristics");
  const locDetails = str("locationDetails");
  if (locChars || locDetails) {
    sections.push(`### Location Strategy
${locChars}
${locDetails ? `\n**Markets:**\n${locDetails}` : ""}`);
  }

  // Exclusions
  const exclusions = str("exclusions");
  if (exclusions) {
    sections.push(`### Exclusions
${exclusions}`);
  }

  return sections.join("\n\n");
}
