/**
 * property-vision.ts — LLM-powered vision text for per-property investor deck slides.
 *
 * Generates all narrative copy fields needed for the 6-slide deck.
 * Falls back deterministically to template strings if the LLM is unavailable.
 *
 * See .agents/skills/hplus-vision-templates/SKILL.md for field specs and
 * template fallback logic.
 */

import { getAnthropicClient } from "./clients";
import { logger } from "../logger";
import {
  buildPropertyBrief,
  briefToPromptLines,
  type PropertyBrief,
  type ModelTier,
} from "../slides/property-brief";
import type { SlideProperty } from "../slides/types";
import { SLOT_CONTEXT_MAP } from "../slides/slot-context-map";
import {
  DEFAULT_FALLBACK_OCCUPANCY,
  VISION_DRAFT_MAX_TOKENS,
  VISION_BADGE_MAX_CHARS,
  VISION_BULLET_MAX_CHARS,
  VISION_PARAGRAPH_MAX_CHARS,
  RETREAT_GUESTS_PER_KEY_MIN,
  RETREAT_GUESTS_PER_KEY_MAX,
  VRBO_GUESTS_PER_KEY,
} from "@shared/constants-benchmarks";

export interface PropertyVisionInput {
  id: number;
  name: string;
  city?: string | null;
  stateProvince?: string | null;
  county?: string | null;
  country?: string | null;
  purchasePrice?: number | null;
  roomCount?: number | null;
  startAdr?: number | null;
  maxOccupancy?: number | null;
  businessModel?: string | null;
  hospitalityType?: string | null;
  qualityTier?: string | null;
  description?: string | null;
  acquisitionStatus?: string | null;
}

export interface PropertyVisionText {
  cinematicCaption: string;
  visionHeadline: string;
  visionBullet1: string;
  visionBullet2: string;
  badgeText: string;
  descriptionParagraph: string;
  operationalModelText: string;
  revenueBullet: string;
  programmingBullet: string;
  operationalParagraph: string;
  investmentModelConcept: string;
  marketRationale: string;
  reason1Label: string;
  reason1Detail: string;
  reason2Label: string;
  reason2Detail: string;
  reason3Label: string;
  reason3Detail: string;
  closingLine: string;
  transformationDescription: string;
}

const VISION_MODEL = "claude-opus-4-6";

/** Fallback room count when property record has no roomCount. */
const FALLBACK_ROOM_COUNT = 10;

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
}

/**
 * Convert a PropertyVisionInput to the SlideProperty shape expected by
 * buildPropertyBrief(). Fills in defaults for fields not present in the
 * lightweight input type.
 */
function visionInputToSlideProperty(p: PropertyVisionInput): SlideProperty {
  return {
    id: p.id,
    name: p.name,
    city: p.city ?? "",
    stateProvince: p.stateProvince ?? "",
    county: p.county ?? "",
    country: p.country ?? "",
    purchasePrice: p.purchasePrice ?? 0,
    roomCount: p.roomCount ?? 0,
    startAdr: p.startAdr ?? 0,
    maxOccupancy: p.maxOccupancy ?? DEFAULT_FALLBACK_OCCUPANCY,
    businessModel: p.businessModel ?? "hotel",
    hospitalityType: p.hospitalityType ?? "",
    qualityTier: p.qualityTier ?? "",
    description: p.description ?? "",
    acquisitionStatus: p.acquisitionStatus ?? "pipeline",
  };
}

// ── Deterministic fallback templates ────────────────────────────────────────

export function buildPropertyVisionFallback(p: PropertyVisionInput): PropertyVisionText {
  const brief = buildPropertyBrief(visionInputToSlideProperty(p));
  return buildPropertyVisionFallbackFromBrief(brief);
}

export function buildPropertyVisionFallbackFromBrief(brief: PropertyBrief): PropertyVisionText {
  const tier: ModelTier = brief.modelTier;
  const rooms = brief.roomCount || FALLBACK_ROOM_COUNT;
  const adr = brief.adrFormatted;
  const occ = brief.occupancyPct;
  const city = brief.city || "this market";
  const state = brief.stateProvince;
  const market = brief.marketInsight;
  const typeLabel = brief.modelTierLabel;

  if (tier === "retreat") {
    return {
      cinematicCaption: `${rooms} KEYS · PRIVATE RETREAT CAMPUS`,
      visionHeadline: `Post-Acquisition: ${rooms} Keys | ${rooms * RETREAT_GUESTS_PER_KEY_MIN}–${rooms * RETREAT_GUESTS_PER_KEY_MAX} Group Guests`,
      visionBullet1: "Year-Round Programming: Corporate Off-Sites, Wellness Retreats & Private Events",
      visionBullet2: "Curated Demand: Repeat Group Bookings + Direct B2B Retreat Partnerships",
      badgeText: "CURATED RETREAT EXPERIENCE",
      descriptionParagraph: `A purpose-built retreat center in ${city}, ${state} — positioned for high-margin group bookings in a supply-constrained market.`,
      operationalModelText: "Retreat Center: Group Bookings + Corporate Off-Sites + Programming Revenue",
      revenueBullet: `Revenue Mix: 60% Group Stays, 25% Corporate, 15% Individual Retreats`,
      programmingBullet: "Programming: Wellness, Leadership, Creative Arts — repeat clientele at $200+/guest/night premium",
      operationalParagraph: `A focused retreat model with predictable group revenue, high ADR premiums, and ${occ}% occupancy anchored by advance-booked programming.`,
      investmentModelConcept: `A managed retreat center — curated programming drives ADR premiums that a standard hotel cannot command.`,
      marketRationale: `Retreat center demand outpacing supply in ${state}; group bookings lock in revenue 6–12 months ahead.`,
      reason1Label: "Predictable, advance-booked revenue",
      reason1Detail: "Group retreats lock in 60–80% of annual revenue 3–6 months before arrival.",
      reason2Label: `Premium ADR vs. standard hospitality`,
      reason2Detail: `Programming + all-inclusive structure drives $50–$150/night premium over comparable keys.`,
      reason3Label: "Replicable, asset-light scale path",
      reason3Detail: "Proven retreat model can replicate to 2–3 additional sites without brand dilution.",
      closingLine: `One property. One proof. — The L+B retreat model, earning its IRR in ${city}.`,
      transformationDescription: `Converting a historic estate into a purpose-built retreat center — upgrading common areas, en-suiting all keys, and building programming infrastructure for repeatable group revenue.`,
    };
  }

  if (tier === "vrbo") {
    return {
      cinematicCaption: `WHOLE-PROPERTY LUXURY RENTAL · ${rooms} KEYS`,
      visionHeadline: `Whole-Property Rental: ${rooms} Keys | Up to ${rooms * VRBO_GUESTS_PER_KEY} Guests`,
      visionBullet1: `Premium Positioning: $1,500–$4,500/Night Whole-Property Rate at Peak`,
      visionBullet2: "Direct Booking + VRBO/Airbnb Hybrid: 40% Direct by Year 2",
      badgeText: "LUXURY PRIVATE RENTAL EXPERIENCE",
      descriptionParagraph: `A luxury whole-property rental in ${city} positioned for premium group bookings at peak-season rates of $2,500–$4,500/night.`,
      operationalModelText: "Whole-Property Luxury Rental — Platform + Direct Booking Hybrid Model",
      revenueBullet: "Revenue: 60% platform (VRBO/Airbnb), 40% direct by Year 2 for margin expansion",
      programmingBullet: "Guest Experience: Concierge amenities, local partnerships, self-catered luxury packages",
      operationalParagraph: `A self-managed luxury rental with minimal overhead, targeting peak-season ADR of $2,500–$4,500/night and 65%+ annual occupancy.`,
      investmentModelConcept: `Whole-property luxury rental — the highest-margin model for sub-20-key estate properties in high-demand drive markets.`,
      marketRationale: `Demand for curated private estate rentals in ${city} has grown 40%+ since 2021, with no meaningful new supply.`,
      reason1Label: "Lowest capital requirement",
      reason1Detail: "VRBO conversion requires $30k–$80k — the lightest capex path to hospitality cash flow.",
      reason2Label: "Peak pricing power",
      reason2Detail: "Holiday weekends and summer peaks command $3,000–$5,000/night whole-property rates.",
      reason3Label: "Self-managing or PMS automation",
      reason3Detail: "Modern PMS tools enable near-automated management at 2–5% overhead vs. 20–30% for hotel ops.",
      closingLine: `One estate. One market. — Maximum ADR, minimum overhead in ${city}.`,
      transformationDescription: `Light-touch luxury conversion — design refresh, amenity upgrade (hot tub, EV charger, smart home), and direct booking infrastructure for platform-independent revenue growth.`,
    };
  }

  // hotel default
  return {
    cinematicCaption: `${rooms} KEYS · BOUTIQUE HOTEL CONVERSION`,
    visionHeadline: `Post-Conversion: ${rooms} Keys | ${occ}% Stabilized Occupancy`,
    visionBullet1: "Year-Round Demand: Drive-Market Leisure + Weekend Escapes + Local Events",
    visionBullet2: "Direct Booking Focus: 50%+ Direct Mix by Year 3, Reducing OTA Dependency",
    badgeText: "BOUTIQUE HOSPITALITY EXPERIENCE",
    descriptionParagraph: `A repositioned ${typeLabel.toLowerCase()} capturing premium drive-market demand in an undersupplied ${city} market at ${adr} ADR.`,
    operationalModelText: "Direct Ownership + Active Management + F&B and Events Revenue",
    revenueBullet: "Revenue Mix: 70% Rooms, 20% F&B, 10% Events & Packages",
    programmingBullet: "Guest Experience: Curated local partnerships, farm-to-table dining, seasonal programming",
    operationalParagraph: `A lean owner-operator boutique targeting ${occ}% stabilized occupancy and 8–12% annual ADR growth from ${adr} starting rate.`,
    investmentModelConcept: `Direct boutique hotel ownership — active management unlocks ADR and occupancy premiums unavailable to passive investors.`,
    marketRationale: market,
    reason1Label: "Supply-constrained market",
    reason1Detail: `Fewer than 500 boutique keys in the ${city} submarket; new supply 3–5 years away at minimum.`,
    reason2Label: "ADR growth trajectory",
    reason2Detail: "8–12% annual ADR growth as direct booking mix improves and brand recognition builds.",
    reason3Label: "F&B and events upside",
    reason3Detail: "On-site F&B and private events add $45–$85 per guest per day to total revenue.",
    closingLine: `One boutique. One market. — The L+B model positioned for compounding returns in ${city}.`,
    transformationDescription: `Full boutique hotel conversion — en-suiting all guest rooms, upgrading F&B, and building direct booking infrastructure to reduce OTA dependency by Year 3.`,
  };
}

// ── LLM generation ──────────────────────────────────────────────────────────

export async function generatePropertyVisionText(
  p: PropertyVisionInput,
): Promise<PropertyVisionText> {
  const brief = buildPropertyBrief(visionInputToSlideProperty(p));
  return generatePropertyVisionTextFromBrief(brief);
}

export async function generatePropertyVisionTextFromBrief(
  brief: PropertyBrief,
): Promise<PropertyVisionText> {
  const fallback = buildPropertyVisionFallbackFromBrief(brief);
  try {
    const anthropic = getAnthropicClient();

    // Use SlotContextMap to build a minimal prompt — only fields relevant to
    // the vision + operational + investment groups.
    const visionFields = SLOT_CONTEXT_MAP["slide1.visionBullets"].briefFields;
    const operationalFields = SLOT_CONTEXT_MAP["slide2.operationalModelText"].briefFields;
    const investmentFields = SLOT_CONTEXT_MAP["slide3.reasons"].briefFields;
    const allFields = [...new Set([...visionFields, ...operationalFields, ...investmentFields])];
    const contextBlock = briefToPromptLines(brief, allFields);

    const prompt = `You are writing investor-grade slide copy for a boutique hospitality investment deck.

${contextBlock}

Generate concise, investor-grade slide copy for all fields below. Return ONLY valid JSON — no markdown, no explanation.

Rules:
1. Cite specific numbers from the data above (ADR, rooms, price, market stats)
2. NEVER use: "exciting", "unique opportunity", "world-class", "strong fundamentals"
- Cinematic caption: ALL CAPS, max 2 features, format "FEATURE · FEATURE" (max 60 chars)
- Badge text: short ALL CAPS phrase (max ${VISION_BADGE_MAX_CHARS} chars)
- All bullets: max ${VISION_BULLET_MAX_CHARS} chars, punchy, metric-driven
- Paragraphs: max ${VISION_PARAGRAPH_MAX_CHARS} chars, one sentence, direct
- Labels: max 60 chars, noun phrases
- Closing line: one sentence, short, references the city

Return:
{
  "cinematicCaption": "...",
  "visionHeadline": "...",
  "visionBullet1": "...",
  "visionBullet2": "...",
  "badgeText": "...",
  "descriptionParagraph": "...",
  "operationalModelText": "...",
  "revenueBullet": "...",
  "programmingBullet": "...",
  "operationalParagraph": "...",
  "investmentModelConcept": "...",
  "marketRationale": "...",
  "reason1Label": "...",
  "reason1Detail": "...",
  "reason2Label": "...",
  "reason2Detail": "...",
  "reason3Label": "...",
  "reason3Detail": "...",
  "closingLine": "...",
  "transformationDescription": "..."
}`;

    const response = await anthropic.messages.create({
      model: VISION_MODEL,
      max_tokens: VISION_DRAFT_MAX_TOKENS,
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = response.content.find(b => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      logger.warn("Vision text LLM returned no text block — using fallback", "property-vision");
      return fallback;
    }

    const parsed = JSON.parse(stripCodeFences(textBlock.text)) as Partial<PropertyVisionText>;

    // Merge parsed with fallback to ensure all fields are populated
    return {
      cinematicCaption:       parsed.cinematicCaption       ?? fallback.cinematicCaption,
      visionHeadline:         parsed.visionHeadline         ?? fallback.visionHeadline,
      visionBullet1:          parsed.visionBullet1          ?? fallback.visionBullet1,
      visionBullet2:          parsed.visionBullet2          ?? fallback.visionBullet2,
      badgeText:              parsed.badgeText              ?? fallback.badgeText,
      descriptionParagraph:   parsed.descriptionParagraph   ?? fallback.descriptionParagraph,
      operationalModelText:   parsed.operationalModelText   ?? fallback.operationalModelText,
      revenueBullet:          parsed.revenueBullet          ?? fallback.revenueBullet,
      programmingBullet:      parsed.programmingBullet      ?? fallback.programmingBullet,
      operationalParagraph:   parsed.operationalParagraph   ?? fallback.operationalParagraph,
      investmentModelConcept: parsed.investmentModelConcept ?? fallback.investmentModelConcept,
      marketRationale:        parsed.marketRationale        ?? fallback.marketRationale,
      reason1Label:           parsed.reason1Label           ?? fallback.reason1Label,
      reason1Detail:          parsed.reason1Detail          ?? fallback.reason1Detail,
      reason2Label:           parsed.reason2Label           ?? fallback.reason2Label,
      reason2Detail:          parsed.reason2Detail          ?? fallback.reason2Detail,
      reason3Label:           parsed.reason3Label           ?? fallback.reason3Label,
      reason3Detail:          parsed.reason3Detail          ?? fallback.reason3Detail,
      closingLine:            parsed.closingLine            ?? fallback.closingLine,
      transformationDescription: parsed.transformationDescription ?? fallback.transformationDescription,
    };
  } catch (err: unknown) {
    logger.warn(
      `Property vision LLM failed (using fallback): ${err instanceof Error ? err.message : String(err)}`,
      "property-vision",
    );
    return fallback;
  }
}
