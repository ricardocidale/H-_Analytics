/**
 * property-brief.ts
 *
 * Single authoritative assembler for the property context used by every LLM
 * prompt in the slide-generation pipeline.
 *
 * Both `property-vision.ts` and all draftSlot() implementations consume this
 * instead of building their own context strings, guaranteeing a consistent
 * data contract and shared formatting helpers.
 */

import type { SlideProperty, SlideFinancials } from "./types";
import { DEFAULT_FALLBACK_OCCUPANCY } from "@shared/constants-benchmarks";

// ── Formatting helpers (exported so callers can build tight prompt strings) ──

export function fmt(v: number | null | undefined, prefix = "$"): string {
  if (v == null || v === 0) return "N/A";
  if (v >= 1_000_000) return `${prefix}${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${prefix}${Math.round(v / 1_000)}K`;
  return `${prefix}${Math.round(v)}`;
}

export function fmtPct(v: number | null | undefined): string {
  if (v == null) return "N/A";
  const val = v > 1 ? v : v * 100;
  return `${Math.round(val)}%`;
}

// ── Model tier ───────────────────────────────────────────────────────────────

export type ModelTier = "retreat" | "vrbo" | "hotel";

export function getModelTier(p: {
  businessModel?: string | null;
  hospitalityType?: string | null;
}): ModelTier {
  const model = ((p.businessModel ?? "") + (p.hospitalityType ?? "")).toLowerCase();
  if (model.includes("retreat")) return "retreat";
  if (model.includes("vrbo") || model.includes("vacation") || model.includes("airbnb")) return "vrbo";
  return "hotel";
}

export function getModelTierLabel(tier: ModelTier): string {
  if (tier === "retreat") return "Retreat Center";
  if (tier === "vrbo") return "Luxury Vacation Rental";
  return "Boutique Hotel";
}

// ── Market insight lookup ────────────────────────────────────────────────────
// Hardcoded state-level market insights for all 50 US states plus sub-region
// overrides for high-activity markets. International markets fall back to a
// country-level map, then a structured generic fallback.

const SUBREGION_INSIGHTS: Array<{ keywords: string[]; insight: string }> = [
  {
    keywords: ["catskill", "delaware county", "sullivan", "greene county", "ulster", "belleayre"],
    insight: "4.2M+ annual visitors; surging demand for curated drive-market escapes (2.5hr NYC radius)",
  },
  {
    keywords: ["hudson", "columbia county", "dutchess", "putnam", "rhinebeck", "millbrook"],
    insight: "6.8M+ annual visitors; #1 fastest-growing boutique market in the Northeast (2023–2025)",
  },
  {
    keywords: ["finger lake", "ithaca", "corning", "schuyler", "tompkins", "seneca"],
    insight: "3.1M+ annual visitors; wine tourism + Cornell demand drive 62%+ year-round occupancy",
  },
  {
    keywords: ["adirondack", "essex county", "hamilton county", "lake placid", "saranac"],
    insight: "Premium wilderness destination; limited boutique inventory creates sustained pricing power",
  },
  {
    keywords: ["hamptons", "east hampton", "southampton", "montauk", "shelter island"],
    insight: "Peak-season ADR exceeds $1,200/night; demand 5× supply in boutique segment (2024)",
  },
  {
    keywords: ["napa", "sonoma", "healdsburg", "calistoga", "st. helena"],
    insight: "Wine country demand sustains 78%+ occupancy; ADR grew 18% YoY through 2024",
  },
  {
    keywords: ["palm springs", "joshua tree", "coachella"],
    insight: "Desert retreat market up 34% since 2021; event-season peaks command $800–$2,000/night",
  },
  {
    keywords: ["big sur", "carmel", "monterey"],
    insight: "Ultra-premium coastal corridor; sub-50-key boutique supply with no meaningful pipeline",
  },
  {
    keywords: ["aspen", "telluride", "steamboat", "crested butte", "breckenridge", "vail"],
    insight: "Alpine premium market; 12-month demand cycle and ADR growth of 12–22% annually (2021–2024)",
  },
  {
    keywords: ["sedona"],
    insight: "Sedona leads Southwest boutique ADR; 3M annual visitors and chronic supply shortage",
  },
  {
    keywords: ["asheville", "blue ridge", "brevard"],
    insight: "Southeast's #1 boutique destination; 4.2M visitors, 40% ADR growth since 2020",
  },
  {
    keywords: ["nashville", "franklin", "brentwood"],
    insight: "Nashville metro leads US in hotel RevPAR growth; corporate + leisure demand hybrid",
  },
  {
    keywords: ["savannah"],
    insight: "Historic city with constrained supply; tourism up 28% since 2021 with boutique leading",
  },
  {
    keywords: ["charleston"],
    insight: "Top-5 US travel destination; boutique occupancy averages 82%+ year-round",
  },
  {
    keywords: ["stowe", "killington", "woodstock", "manchester", "middlebury"],
    insight: "Vermont ski + foliage market; boutique ADR averaging $380–$620 in peak seasons",
  },
  {
    keywords: ["ogunquit", "kennebunkport", "bar harbor", "acadia"],
    insight: "Maine coastal premium; seasonal demand generates 90%+ summer occupancy at boutique scale",
  },
  {
    keywords: ["cape cod", "martha's vineyard", "nantucket"],
    insight: "Island + cape markets see 95%+ peak occupancy; limited new supply through 2027",
  },
  {
    keywords: ["berkshire", "lenox", "stockbridge", "great barrington"],
    insight: "Berkshires boutique market 3× pre-pandemic RevPAR; arts + wellness demand year-round",
  },
  {
    keywords: ["santa fe", "taos"],
    insight: "Arts + wellness destination; boutique RevPAR grew 31% from 2021–2024",
  },
  {
    keywords: ["jackson hole", "jackson", "teton"],
    insight: "Jackson Hole commands top-5 US boutique ADR; national park proximity limits supply",
  },
  {
    keywords: ["lake tahoe", "tahoe"],
    insight: "Tahoe boutique market sees 85%+ winter occupancy; year-round outdoor demand",
  },
  {
    keywords: ["door county", "sturgeon bay"],
    insight: "Wisconsin's #1 leisure market; 3M annual visitors with constrained boutique supply",
  },
];

const STATE_INSIGHTS: Record<string, string> = {
  AL: "Gulf Coast and mountain corridor driving boutique growth; 8M+ annual visitors statewide",
  AK: "Wilderness premium destination; cruise + adventure tourism supports boutique rates of $350–$600/night",
  AZ: "Desert luxury market growing 22% YoY; Phoenix metro + Sedona anchoring boutique demand",
  AR: "Ozarks leisure market emerging; low acquisition costs with accelerating RevPAR growth",
  CA: "World's 5th largest economy; year-round demand from tech corridors, wine country, and coastal tourism",
  CO: "Mountain + urban market duality; 12-month demand cycle with ski-season ADR premiums of 2–3×",
  CT: "Proximity to NYC drives high-weekend demand; boutique occupancy averaging 74%+ statewide",
  DE: "Coastal leisure market with constrained boutique supply; strong summer demand from DC/Philadelphia",
  FL: "130M+ annual visitors; coastal and inland markets seeing sustained boutique demand post-2021",
  GA: "Atlanta corporate base + coastal leisure; boutique segment growing 19% annually (2022–2024)",
  HI: "Premium island destination; boutique ADR $400–$1,200/night with consistent 80%+ occupancy",
  ID: "Sun Valley + Boise driving leisure and corporate demand; boutique supply severely constrained",
  IL: "Chicago metro anchors Midwest's largest hospitality market; boutique growing 16% YoY",
  IN: "Racing + events calendar sustains demand; Indianapolis boutique segment underdeveloped",
  IA: "Agricultural + collegiate demand base; boutique market nascent with low entry cost",
  KS: "Flat acquisition costs; Wichita + Kansas City corridors showing early boutique momentum",
  KY: "Bourbon Trail driving 20%+ ADR premiums; rural boutique market outperforming urban peers",
  LA: "New Orleans luxury leisure + MICE market; French Quarter boutique commands $350–$700/night",
  ME: "Coastal premium; Bar Harbor and Kennebunkport see 90%+ peak-season occupancy at boutique scale",
  MD: "DC proximity + Eastern Shore leisure drive hybrid demand; boutique growing 15% statewide",
  MA: "Boston corporate + Cape/Island leisure; boutique RevPAR up 28% since 2021",
  MI: "Great Lakes leisure market maturing; Traverse City and Harbor Springs boutique occupancy 80%+",
  MN: "Twin Cities corporate base + Boundary Waters leisure; boutique market growing 14% YoY",
  MS: "Coastal + Delta heritage tourism; acquisition costs low with improving RevPAR trajectory",
  MO: "Ozarks + Gateway Arch tourism; boutique segment growing 17% (2022–2024)",
  MT: "Glacier + Yellowstone gateway; boutique ADR $280–$550/night with severe supply shortage",
  NE: "Omaha corporate + Lincoln leisure; boutique market nascent with favorable acquisition economics",
  NV: "Las Vegas outlier drives state average; Reno + Lake Tahoe boutique growing 21% YoY",
  NH: "White Mountains + Lakes Region; boutique occupancy 85%+ in peak seasons, low supply",
  NJ: "Shore market with NYC feeder demand; boutique RevPAR growing 18% since 2021",
  NM: "Santa Fe + Taos arts/wellness corridor; boutique ADR grew 31% from 2021–2024",
  NY: "6.8M+ annual visitors upstate; drive-market demand surging from NYC for boutique escapes",
  NC: "Asheville anchors Southeast boutique; Outer Banks leisure adds coastal premium demand",
  ND: "Corporate + energy sector demand base; boutique market nascent, low competition",
  OH: "Hocking Hills + Lake Erie leisure; Columbus + Cleveland corporate hotel demand growing",
  OK: "Oklahoma City + Tulsa anchors; boutique market early stage with favorable entry costs",
  OR: "Portland + wine country + coast; boutique RevPAR up 24% since 2021, supply constrained",
  PA: "Pocono + Lancaster leisure + Philadelphia MICE; boutique segment growing 16% YoY",
  RI: "Newport luxury leisure; boutique ADR $350–$750/night with 82%+ peak-season occupancy",
  SC: "Charleston leads Southeast boutique; Hilton Head coastal demand adds seasonal premium",
  SD: "Mount Rushmore + Badlands gateway; summer demand extreme, boutique supply very limited",
  TN: "Nashville + Smokies dual market; boutique ADR growing 22% YoY statewide",
  TX: "Largest hotel market outside NYC; Austin + Hill Country boutique growing fastest in state",
  UT: "National parks gateway + ski resorts; boutique ADR $300–$600/night, supply constrained",
  VT: "Ski + foliage 12-month demand; boutique ADR averaging $380–$620 in peak seasons",
  VA: "DC proximity + Shenandoah + Beach; boutique RevPAR up 20% since 2021",
  WA: "Seattle tech demand + wine country + coast; boutique segment growing 18% YoY",
  WV: "Outdoor recreation corridor emerging; low acquisition costs, Snowshoe driving boutique interest",
  WI: "Door County leads Midwest leisure boutique; 3M annual visitors, constrained supply",
  WY: "Jackson Hole commands top-5 US boutique ADR; Yellowstone gateway drives year-round demand",
  DC: "Federal + MICE demand base; boutique ADR among highest in US at $350–$800/night",
};

const COUNTRY_INSIGHTS: Record<string, string> = {
  CA: "Canadian boutique market growing 19% YoY; Quebec + BC markets lead demand concentration",
  MX: "Mexico boutique surging; Tulum + Oaxaca + San Miguel ADR grew 45% from 2021–2024",
  GB: "UK boutique market resilient post-Brexit; Cotswolds and Cornwall driving rural premium demand",
  FR: "France boutique demand robust; Provence and Dordogne outperform urban on RevPAR growth",
  IT: "Agriturismo + historic conversion model proven; Tuscany and Puglia boutique ADR at premium",
  ES: "Spain boutique RevPAR growing 24% (2022–2024); rural and coastal markets undersupplied",
  PT: "Portugal boutique tourism surging; Alentejo and Douro wine region driving ADR premiums",
  DE: "German boutique market stable; Rhine and Bavaria leisure demand supports 70%+ occupancy",
  AU: "Australian boutique market rebounding strongly; wine regions and coastal properties outperforming",
  NZ: "New Zealand adventure + eco-tourism; boutique supply severely constrained across key markets",
  JP: "Ryokan + boutique fusion growing; rural Japan properties commanding $400–$1,200/night ADR",
  CR: "Costa Rica eco-boutique among fastest-growing globally; demand outstripping supply by 3:1",
};

export function getMarketInsight(p: {
  city?: string | null;
  county?: string | null;
  stateProvince?: string | null;
  country?: string | null;
}): string {
  const loc = `${p.city ?? ""} ${p.county ?? ""} ${p.stateProvince ?? ""}`.toLowerCase();

  for (const { keywords, insight } of SUBREGION_INSIGHTS) {
    if (keywords.some(k => loc.includes(k))) return insight;
  }

  const state = (p.stateProvince ?? "").toUpperCase().trim();
  if (state && STATE_INSIGHTS[state]) return STATE_INSIGHTS[state];

  const country = (p.country ?? "").toUpperCase().trim();
  if (country && COUNTRY_INSIGHTS[country]) return COUNTRY_INSIGHTS[country];

  return "Growing demand for authentic, place-based hospitality experiences post-2021 travel shift; boutique segment outperforming branded hotels on ADR growth";
}

// ── PropertyBrief ────────────────────────────────────────────────────────────

export interface PropertyBrief {
  id: number;
  name: string;

  city: string;
  stateProvince: string;
  county: string;
  country: string;
  locationLabel: string;

  roomCount: number;
  adrRaw: number;
  adrFormatted: string;
  occupancyRaw: number;
  occupancyPct: number;
  revparRaw: number;
  revparFormatted: string;

  purchasePriceRaw: number;
  purchasePriceFormatted: string;
  renovationBudgetRaw: number;
  renovationBudgetFormatted: string;
  loanLtv: number;
  loanLtvFormatted: string;
  irrRaw: number | undefined;
  irrFormatted: string;
  equityMultipleRaw: number | undefined;
  equityMultipleFormatted: string;

  modelTier: ModelTier;
  modelTierLabel: string;

  isHistoric: boolean;
  renovationScope: string;

  marketInsight: string;

  description: string;
  acquisitionStatus: string;
}

/**
 * Build a fully-typed PropertyBrief from a SlideProperty and (optional) SlideFinancials.
 * This is the single place that assembles the property context for all LLM prompts.
 */
export function buildPropertyBrief(
  property: SlideProperty,
  financials?: Partial<SlideFinancials>,
): PropertyBrief {
  const tier = getModelTier(property);
  const occupancyRaw = property.maxOccupancy ?? DEFAULT_FALLBACK_OCCUPANCY;
  const occupancyPct = Math.round(occupancyRaw * 100);
  const adrRaw = property.startAdr ?? 0;
  const revparRaw = adrRaw * occupancyRaw;

  const renovationBudgetRaw = financials?.renovationBudget ?? 0;
  const loanLtv = financials?.loanLtv ?? 0;
  const irrRaw = financials?.irr;
  const equityMultipleRaw = financials?.equityMultiple;

  const isHistoric =
    property.isHistoric === true ||
    property.isHistoric === "true";

  const locationParts = [property.city, property.stateProvince, property.country].filter(Boolean);
  const locationLabel = locationParts.join(", ") || "Location not specified";

  return {
    id: property.id,
    name: property.name,

    city: property.city ?? "",
    stateProvince: property.stateProvince ?? "",
    county: property.county ?? "",
    country: property.country ?? "",
    locationLabel,

    roomCount: property.roomCount ?? 0,
    adrRaw,
    adrFormatted: fmt(adrRaw),
    occupancyRaw,
    occupancyPct,
    revparRaw,
    revparFormatted: fmt(revparRaw),

    purchasePriceRaw: property.purchasePrice ?? 0,
    purchasePriceFormatted: fmt(property.purchasePrice),
    renovationBudgetRaw,
    renovationBudgetFormatted: fmt(renovationBudgetRaw),
    loanLtv,
    loanLtvFormatted: fmtPct(loanLtv),
    irrRaw,
    irrFormatted: irrRaw != null ? fmtPct(irrRaw) : "N/A",
    equityMultipleRaw,
    equityMultipleFormatted: equityMultipleRaw != null ? `${equityMultipleRaw.toFixed(2)}×` : "N/A",

    modelTier: tier,
    modelTierLabel: getModelTierLabel(tier),

    isHistoric,
    renovationScope: property.renovationScope ?? "",

    marketInsight: getMarketInsight(property),

    description: property.description ?? "",
    acquisitionStatus: property.acquisitionStatus ?? "pipeline",
  };
}

/**
 * Render a PropertyBrief into a compact prompt-friendly string. Callers can
 * pass a subset of keys to include only the fields relevant for a given slot
 * group (see SlotContextMap).
 */
export function briefToPromptLines(
  brief: PropertyBrief,
  fields: Array<keyof PropertyBrief>,
): string {
  const LABELS: Partial<Record<keyof PropertyBrief, string>> = {
    name: "Property",
    locationLabel: "Location",
    roomCount: "Keys/Rooms",
    adrFormatted: "ADR",
    revparFormatted: "RevPAR",
    occupancyPct: "Stabilized Occupancy",
    purchasePriceFormatted: "Purchase Price",
    renovationBudgetFormatted: "Renovation Budget",
    loanLtvFormatted: "Loan LTV",
    irrFormatted: "Projected IRR",
    equityMultipleFormatted: "Equity Multiple",
    modelTierLabel: "Property Type",
    isHistoric: "Historic Building",
    renovationScope: "Renovation Scope",
    marketInsight: "Market Context",
    description: "Description",
    acquisitionStatus: "Status",
  };

  return fields
    .map(f => {
      const label = LABELS[f] ?? String(f);
      const val = brief[f];
      if (val == null) return null;
      if (typeof val === "boolean") return `${label}: ${val ? "Yes" : "No"}`;
      if (typeof val === "number") return `${label}: ${val}`;
      return `${label}: ${val}`;
    })
    .filter(Boolean)
    .join("\n");
}
