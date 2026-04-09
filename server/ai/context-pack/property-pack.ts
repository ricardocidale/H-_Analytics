import type { Property, GlobalAssumptions } from "@shared/schema";
import type { IcpConfig } from "@shared/schema/types/jsonb-shapes";
import type { PropertyContextPack } from "./types";
import { buildCompositeLabel, buildComparableDescription } from "./luxury-classifier";

function pct(v: number | null | undefined): string {
  if (v == null) return "not set";
  return `${(v * 100).toFixed(1)}%`;
}

function usd(v: number | null | undefined): string {
  if (v == null) return "not set";
  return `$${v.toLocaleString("en-US")}`;
}

function detectAmenities(p: Property): { hasFB: boolean; hasEvents: boolean; hasWellness: boolean } {
  const desc = (p.description ?? "").toLowerCase();
  const name = (p.name ?? "").toLowerCase();
  const combined = `${desc} ${name}`;
  return {
    hasFB: /restaurant|f&b|food|dining|bar|bistro|chef|kitchen|culinary|breakfast|brunch/.test(combined),
    hasEvents: /event|conference|banquet|ballroom|catering|wedding|retreat|meeting|venue/.test(combined),
    hasWellness: /wellness|spa|retreat|yoga|thermal|hydrotherapy|massage|fitness|gym|sauna|pool|plunge/.test(combined),
  };
}

function buildLocationDisplay(p: Property): string {
  const parts = [p.streetAddress, p.city, p.stateProvince, p.zipPostalCode, p.country].filter(Boolean);
  if (parts.length > 0) return parts.join(", ");
  return p.location ?? "Unknown location";
}

function buildAmenityNarrative(p: Property, amenities: { hasFB: boolean; hasEvents: boolean; hasWellness: boolean }): string {
  const parts: string[] = [];
  parts.push(`${p.roomCount ?? 0}-room ${p.hospitalityType ?? "hotel"}`);

  const features: string[] = [];
  if (amenities.hasFB) features.push("F&B operations");
  if (amenities.hasEvents) features.push("event venues");
  if (amenities.hasWellness) features.push("wellness facilities");
  if (features.length > 0) parts.push(`with ${features.join(", ")}`);

  if (p.description) {
    const truncated = p.description.length > 200 ? p.description.slice(0, 200) + "…" : p.description;
    parts.push(`— "${truncated}"`);
  }

  return parts.join(" ");
}

function buildRevenueNarrative(p: Property): string {
  const parts: string[] = [];
  parts.push(`Starting ADR ${usd(p.startAdr)}`);
  if (p.adrGrowthRate != null) parts.push(`growing at ${pct(p.adrGrowthRate)}/year`);
  if (p.startOccupancy != null) parts.push(`initial occupancy ${pct(p.startOccupancy)}`);
  if (p.maxOccupancy != null) parts.push(`target ${pct(p.maxOccupancy)}`);
  if (p.occupancyRampMonths != null) parts.push(`ramp ${p.occupancyRampMonths} months`);

  const revShares: string[] = [];
  if (p.revShareEvents != null) revShares.push(`events ${pct(p.revShareEvents)}`);
  if (p.revShareFB != null) revShares.push(`F&B ${pct(p.revShareFB)}`);
  if (p.revShareOther != null) revShares.push(`other ${pct(p.revShareOther)}`);
  if (revShares.length > 0) parts.push(`revenue shares: ${revShares.join(", ")}`);

  return parts.join("; ");
}

function buildCostNarrative(p: Property): string {
  const rates: string[] = [];
  const add = (label: string, val: number | null) => { if (val != null) rates.push(`${label} ${pct(val)}`); };
  add("rooms", p.costRateRooms);
  add("F&B", p.costRateFB);
  add("admin", p.costRateAdmin);
  add("marketing", p.costRateMarketing);
  add("property ops", p.costRatePropertyOps);
  add("utilities", p.costRateUtilities);
  add("property taxes", p.costRateTaxes);
  add("IT", p.costRateIT);
  add("FF&E", p.costRateFFE);
  add("other", p.costRateOther);
  add("insurance", p.costRateInsurance);

  if (rates.length === 0) return "No cost rates configured";
  return `Operating cost rates (% of revenue): ${rates.join(", ")}`;
}

function buildCapitalNarrative(p: Property): string {
  const parts: string[] = [];
  if (p.purchasePrice != null) parts.push(`Purchase price ${usd(p.purchasePrice)}`);
  if (p.type) parts.push(`structure: ${p.type}`);
  if (p.acquisitionLTV != null) parts.push(`LTV ${pct(p.acquisitionLTV)}`);
  if (p.acquisitionInterestRate != null) parts.push(`rate ${pct(p.acquisitionInterestRate)}`);
  if (p.acquisitionClosingCostRate != null) parts.push(`closing costs ${pct(p.acquisitionClosingCostRate)}`);
  if (p.exitCapRate != null) parts.push(`exit cap ${pct(p.exitCapRate)}`);
  if (p.taxRate != null) parts.push(`income tax ${pct(p.taxRate)}`);
  if (p.depreciationYears != null) parts.push(`depreciation ${p.depreciationYears} years`);
  if (p.costSegEnabled) parts.push("cost segregation enabled");
  if (p.willRefinance && p.willRefinance !== "no") {
    const refiParts: string[] = ["refinance planned"];
    if (p.refinanceLTV != null) refiParts.push(`LTV ${pct(p.refinanceLTV)}`);
    if (p.refinanceInterestRate != null) refiParts.push(`rate ${pct(p.refinanceInterestRate)}`);
    if (p.refinanceTermYears != null) refiParts.push(`${p.refinanceTermYears}-yr term`);
    if (p.refinanceClosingCostRate != null) refiParts.push(`closing ${pct(p.refinanceClosingCostRate)}`);
    if (p.refinanceYearsAfterAcquisition != null) refiParts.push(`year ${p.refinanceYearsAfterAcquisition}`);
    parts.push(refiParts.join(", "));
  }

  if (parts.length === 0) return "No capital structure configured";
  return parts.join("; ");
}

function computeIcpAlignment(p: Property, icpConfig: IcpConfig | null): { matchScore: number; matchDetails: string[]; narrative: string } {
  if (!icpConfig || Object.keys(icpConfig).length === 0) {
    return { matchScore: 0, matchDetails: [], narrative: "No ICP configured" };
  }

  const matches: string[] = [];
  const misses: string[] = [];
  let total = 0;
  let matched = 0;

  const asNum = (v: unknown): number | undefined => typeof v === "number" ? v : undefined;

  const check = (label: string, value: number | null | undefined, min: number | undefined, max: number | undefined) => {
    if (min == null && max == null) return;
    total++;
    if (value == null) { misses.push(`${label}: no value`); return; }
    if (min != null && value < min) { misses.push(`${label}: ${value} < min ${min}`); return; }
    if (max != null && value > max) { misses.push(`${label}: ${value} > max ${max}`); return; }
    matched++;
    matches.push(`${label}: ✓`);
  };

  check("Rooms", p.roomCount, asNum(icpConfig.roomsMin), asNum(icpConfig.roomsMax));
  check("ADR", p.startAdr, asNum(icpConfig.adrMin), asNum(icpConfig.adrMax));
  check("Occupancy", p.maxOccupancy != null ? p.maxOccupancy * 100 : null, asNum(icpConfig.occupancyMin), asNum(icpConfig.occupancyMax));
  check("Purchase Price", p.purchasePrice, asNum(icpConfig.acquisitionMin), asNum(icpConfig.acquisitionMax));

  const score = total > 0 ? Math.round((matched / total) * 100) : 0;
  const narrative = total > 0
    ? `ICP alignment: ${score}% (${matched}/${total} criteria met). ${misses.length > 0 ? `Gaps: ${misses.join("; ")}` : "All criteria met."}`
    : "No ICP criteria to evaluate";

  return { matchScore: score, matchDetails: [...matches, ...misses], narrative };
}

function buildCurrentAssumptionsSummary(p: Property): string {
  const sections: string[] = [];

  const rev: string[] = [];
  if (p.startAdr != null) rev.push(`ADR: ${usd(p.startAdr)}`);
  if (p.maxOccupancy != null) rev.push(`Max Occupancy: ${pct(p.maxOccupancy)}`);
  if (p.adrGrowthRate != null) rev.push(`ADR Growth: ${pct(p.adrGrowthRate)}`);
  if (rev.length > 0) sections.push(`Revenue: ${rev.join(", ")}`);

  const cost: string[] = [];
  if (p.costRateRooms != null) cost.push(`Rooms: ${pct(p.costRateRooms)}`);
  if (p.costRateFB != null) cost.push(`F&B: ${pct(p.costRateFB)}`);
  if (p.costRateAdmin != null) cost.push(`Admin: ${pct(p.costRateAdmin)}`);
  if (cost.length > 0) sections.push(`Costs: ${cost.join(", ")}`);

  const cap: string[] = [];
  if (p.exitCapRate != null) cap.push(`Exit Cap: ${pct(p.exitCapRate)}`);
  if (p.acquisitionLTV != null) cap.push(`LTV: ${pct(p.acquisitionLTV)}`);
  if (p.acquisitionInterestRate != null) cap.push(`Rate: ${pct(p.acquisitionInterestRate)}`);
  if (cap.length > 0) sections.push(`Capital: ${cap.join(", ")}`);

  return sections.length > 0 ? sections.join(". ") : "No assumptions configured";
}

function buildGlobalContext(ga: GlobalAssumptions | null): string {
  if (!ga) return "";
  const parts: string[] = [];
  if (ga.projectionYears != null) parts.push(`${ga.projectionYears}-year projection horizon`);
  if (ga.companyTaxRate != null) parts.push(`company tax rate ${pct(ga.companyTaxRate)}`);
  if (ga.costOfEquity != null) parts.push(`cost of equity ${pct(ga.costOfEquity)}`);
  if (ga.inflationRate != null) parts.push(`inflation ${pct(ga.inflationRate)}`);
  if (ga.propertyLabel) parts.push(`property label: ${ga.propertyLabel}`);
  if (ga.assetDescription) parts.push(`portfolio: "${ga.assetDescription}"`);
  return parts.length > 0 ? `Portfolio context: ${parts.join(", ")}` : "";
}

export function buildPropertyContextPack(
  property: Property,
  globalAssumptions: GlobalAssumptions | null,
  icpConfig: IcpConfig | null,
): PropertyContextPack {
  const p = property;
  const amenities = detectAmenities(p);
  const locationDisplay = buildLocationDisplay(p);

  const compositeLabel = buildCompositeLabel({
    starRating: p.starRating,
    hospitalityType: p.hospitalityType ?? "hotel",
    startAdr: p.startAdr ?? 0,
    roomCount: p.roomCount ?? 0,
    hasFB: amenities.hasFB,
    hasEvents: amenities.hasEvents,
    hasWellness: amenities.hasWellness,
    city: p.city,
    stateProvince: p.stateProvince,
    country: p.country,
  });

  const amenityNarrative = buildAmenityNarrative(p, amenities);
  const revenueNarrative = buildRevenueNarrative(p);
  const costNarrative = buildCostNarrative(p);
  const capitalNarrative = buildCapitalNarrative(p);
  const icpAlignment = computeIcpAlignment(p, icpConfig);
  const currentSummary = buildCurrentAssumptionsSummary(p);
  const globalContext = buildGlobalContext(globalAssumptions);

  const comparable = buildComparableDescription({
    starRating: p.starRating,
    hospitalityType: p.hospitalityType ?? "hotel",
    startAdr: p.startAdr ?? 0,
    roomCount: p.roomCount ?? 0,
    hasFB: amenities.hasFB,
    hasEvents: amenities.hasEvents,
    hasWellness: amenities.hasWellness,
    city: p.city,
    stateProvince: p.stateProvince,
    country: p.country,
  });

  const narrativeParts = [
    `**${p.name}** is a ${compositeLabel} at ${locationDisplay}.`,
    amenityNarrative,
    `Revenue profile: ${revenueNarrative}.`,
    `Cost profile: ${costNarrative}.`,
    `Capital structure: ${capitalNarrative}.`,
    icpAlignment.narrative,
    `Current assumptions: ${currentSummary}.`,
    `Comparable benchmark set: ${comparable}.`,
  ];
  if (globalContext) narrativeParts.push(globalContext);

  const sourceUrls = p.sourceUrls as string[] | null | undefined;
  if (sourceUrls && sourceUrls.length > 0) {
    narrativeParts.push(
      `\n**Reference Sources (user-provided URLs — extract property details, photos, amenities, location info, and rates from these):**\n` +
      sourceUrls.map((url, i) => `  ${i + 1}. ${url}`).join("\n")
    );
  }
  const fullNarrative = narrativeParts.join("\n");

  return {
    identity: {
      id: p.id,
      name: p.name ?? "Unnamed Property",
      description: p.description,
      stableKey: p.stableKey ?? "",
    },
    location: {
      display: locationDisplay,
      streetAddress: p.streetAddress,
      city: p.city,
      stateProvince: p.stateProvince,
      zipPostalCode: p.zipPostalCode,
      country: p.country,
      market: p.market,
      latitude: p.latitude,
      longitude: p.longitude,
    },
    classification: {
      starRating: p.starRating,
      starRatingSource: p.starRatingSource,
      starRatingSuggested: p.starRatingSuggested,
      hospitalityType: p.hospitalityType ?? "hotel",
      businessModel: p.businessModel ?? "hotel",
      compositeLabel,
    },
    physicalCharacter: {
      roomCount: p.roomCount ?? 0,
      narrative: `${p.roomCount ?? 0}-room property`,
    },
    amenityProfile: {
      ...amenities,
      narrative: amenityNarrative,
    },
    revenueProfile: {
      startAdr: p.startAdr ?? 0,
      adrGrowthRate: p.adrGrowthRate,
      startOccupancy: p.startOccupancy,
      maxOccupancy: p.maxOccupancy,
      occupancyRampMonths: p.occupancyRampMonths,
      occupancyGrowthStep: p.occupancyGrowthStep,
      revShareEvents: p.revShareEvents,
      revShareFB: p.revShareFB,
      revShareOther: p.revShareOther,
      cateringBoostPercent: p.cateringBoostPercent,
      narrative: revenueNarrative,
    },
    costProfile: {
      costRateRooms: p.costRateRooms,
      costRateFB: p.costRateFB,
      costRateAdmin: p.costRateAdmin,
      costRateMarketing: p.costRateMarketing,
      costRatePropertyOps: p.costRatePropertyOps,
      costRateUtilities: p.costRateUtilities,
      costRateTaxes: p.costRateTaxes,
      costRateIT: p.costRateIT,
      costRateFFE: p.costRateFFE,
      costRateOther: p.costRateOther,
      costRateInsurance: p.costRateInsurance,
      narrative: costNarrative,
    },
    capitalStructure: {
      purchasePrice: p.purchasePrice,
      buildingImprovements: p.buildingImprovements,
      landValuePercent: p.landValuePercent,
      type: p.type,
      acquisitionLTV: p.acquisitionLTV,
      acquisitionInterestRate: p.acquisitionInterestRate,
      acquisitionTermYears: p.acquisitionTermYears,
      exitCapRate: p.exitCapRate,
      taxRate: p.taxRate,
      dispositionCommission: p.dispositionCommission,
      costSegEnabled: p.costSegEnabled,
      depreciationYears: p.depreciationYears,
      narrative: capitalNarrative,
    },
    icpAlignment,
    currentAssumptionsSummary: currentSummary,
    fullNarrative,
  };
}
