/**
 * server/ai/icp/narrative.ts — Investor-grade ICP narrative builder.
 *
 * Renders a rich markdown ICP narrative for injection into research prompts.
 * Replaces the weak 5-field `buildIcpNarrative()` in company-pack.ts.
 *
 * Field access is dynamic because the inputs may be either the strongly-typed
 * generated objects or the raw record persisted on `globalAssumptions`. We
 * read through `Record<string, unknown>` casts and coerce per slot, which
 * preserves the legacy `c.x ?? "?"` / `d.x || ""` rendering exactly while
 * avoiding `any`.
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
  const c = config as Record<string, unknown>;
  const d = descriptive as Record<string, unknown>;

  /** Mirror legacy `c.x ?? "?"` for display values that may be number|string. */
  const v = (key: string): string | number => {
    const raw = c[key];
    return raw == null ? "?" : (raw as string | number);
  };

  /** Mirror legacy `c.x ?? 0` for numeric formatting via fmtK. */
  const n = (key: string): number => {
    const raw = c[key];
    return typeof raw === "number" ? raw : 0;
  };

  /** Mirror legacy `d.x || ""` for descriptive prose. */
  const s = (key: string): string => {
    const raw = d[key];
    return typeof raw === "string" ? raw : "";
  };

  const sections: string[] = [];

  sections.push(`## Ideal Customer Profile — ${companyName}`);

  // Property targeting
  sections.push(`### Target Property Profile
- **Rooms:** ${v("roomsMin")}–${v("roomsMax")} (sweet spot ${v("roomsSweetSpotMin")}–${v("roomsSweetSpotMax")})
- **Land:** ${v("landAcresMin")}–${v("landAcresMax")} acres
- **Building:** ${fmtK(n("builtSqFtMin"))}–${fmtK(n("builtSqFtMax"))} sqft
- **ADR Target:** $${v("adrMin")}–$${v("adrMax")}
- **Occupancy Target:** ${v("occupancyMin")}%–${v("occupancyMax")}%
- **F&B Rating:** ${v("fbRating")}/5
- **Property Types:** ${s("propertyTypes") || "Not specified"}`);

  // Financial targets
  sections.push(`### Financial Criteria
- **Acquisition:** $${fmtK(n("acquisitionMin"))}–$${fmtK(n("acquisitionMax"))} (target $${fmtK(n("acquisitionTargetMin"))}–$${fmtK(n("acquisitionTargetMax"))})
- **Total Investment:** $${fmtK(n("totalInvestmentMin"))}–$${fmtK(n("totalInvestmentMax"))}
- **Renovation:** $${fmtK(n("renovationMin"))}–$${fmtK(n("renovationMax"))}
- **Target IRR:** ${v("targetIrr")}%
- **Equity Multiple:** ${v("equityMultipleMin")}x–${v("equityMultipleMax")}x
- **Hold Period:** ${v("holdYearsMin")}–${v("holdYearsMax")} years
- **Exit Cap Rate:** ${v("exitCapRateMin")}%–${v("exitCapRateMax")}%`);

  // Revenue mix
  sections.push(`### Revenue Mix Targets
- **F&B Share:** ${v("fbShareMin")}%–${v("fbShareMax")}%
- **Events Share:** ${v("eventsShareMin")}%–${v("eventsShareMax")}%
- **Total Ancillary:** ${v("totalAncillaryMin")}%–${v("totalAncillaryMax")}%
- **Management Fee:** ${v("baseMgmtFeeMin")}%–${v("baseMgmtFeeMax")}% base, ${v("incentiveFeeMin")}%–${v("incentiveFeeMax")}% incentive`);

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

  // Location — preserve legacy template exactly (note the literal blank line
  // when locationCharacteristics is empty).
  const locChars = d.locationCharacteristics;
  const locDetails = d.locationDetails;
  if (locChars || locDetails) {
    sections.push(`### Location Strategy
${locChars || ""}
${locDetails ? `\n**Markets:**\n${locDetails}` : ""}`);
  }

  // Exclusions
  if (d.exclusions) {
    sections.push(`### Exclusions
${d.exclusions}`);
  }

  return sections.join("\n\n");
}
