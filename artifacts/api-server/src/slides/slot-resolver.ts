/**
 * Resolves per-property text values for each slide's named slot shapes.
 * Returns null for slots whose value should fall back to template_text.
 * Based on the canonical mapping in .agents/skills/hplus-slide-mapping/SKILL.md.
 */

import type { SlidePayload } from "./slide-jsx";
import { DEFAULT_MAX_OCCUPANCY, DEFAULT_START_OCCUPANCY } from "@shared/constants";

// ── Formatting helpers (mirrors slide-jsx.tsx private fns) ───────────────────

export function fmtCurrency(n: number | null | undefined): string {
  if (n == null || n === 0) return "—";
  const v = Math.round(n);
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
}

export function fmtPct(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${Math.round(n * 100)}%`;
}

function typeLabel(p: SlidePayload["property"]): string {
  const m = ((p.hospitalityType ?? "") + (p.businessModel ?? "")).toLowerCase();
  if (m.includes("retreat")) return "Retreat Center";
  if (m.includes("vrbo") || m.includes("vacation")) return "Luxury Vacation Rental";
  if (m.includes("boutique") || m.includes("hotel")) return "Boutique Hotel";
  if (m.includes("bnb")) return "Bed & Breakfast";
  if (m.includes("motel")) return "Boutique Motel";
  if (m.includes("resort")) return "Boutique Resort";
  return "Hospitality Property";
}

function statusLabel(s: string): string {
  const MAP: Record<string, string> = {
    active: "Acquisition Target", pipeline: "Pipeline",
    closed: "Acquired", operating: "Operating", disposed: "Disposed",
  };
  return MAP[s.toLowerCase()] ?? "Pipeline";
}

function firstSentence(text: string, maxLen = 70): string {
  const dot = text.indexOf(". ");
  const sentence = dot > 0 ? text.slice(0, dot + 1) : text;
  return sentence.length <= maxLen ? sentence : sentence.slice(0, maxLen).trimEnd() + "…";
}

export function stableYear(yearlyIS: SlidePayload["financials"]["yearlyIS"]) {
  return (
    yearlyIS.find(y => y.operationalMonthsInYear >= 12 && y.revenueTotal > 0) ??
    yearlyIS[2] ?? yearlyIS[0]
  );
}

// ── Element shape descriptor ─────────────────────────────────────────────────

export interface RecipeElement {
  name: string;
  is_slot: boolean;
  slot_kind: string | null;
  /** Stable content identifier — survives PPTX template swaps. Set by extract_slot_recipe.py via slide-semantic-map.json. */
  semantic_id?: string | null;
  is_page_number?: boolean;
  template_text?: string | null;
  kind: string;
  z_order: number;
  left_px: number;
  top_px: number;
  width_px: number;
  height_px: number;
  font_name?: string | null;
  font_size_pt?: number | null;
  bold?: boolean | null;
  italic?: boolean | null;
  color_hex?: string | null;
  alignment?: string | null;
  paragraphs?: Array<{
    text: string; alignment: string;
    font_name: string | null; font_size_pt: number | null;
    bold: boolean | null; italic: boolean | null; color_hex: string | null;
  }> | null;
  rows?: number | null;
  cols?: number | null;
  cells?: Array<Array<{ text: string; fill_color_hex: string | null }>> | null;
}

// ---------------------------------------------------------------------------
// Semantic ID lookup (runtime fallback until recipe JSON is regenerated with
// semantic_ids embedded by extract_slot_recipe.py).
// Source of truth for shape_name→semantic_id is scripts/src/slide-semantic-map.json.
// ---------------------------------------------------------------------------

// prettier-ignore
const SHAPE_TO_SEMANTIC: Record<number, Record<string, string>> = {
  1: {
    "Picture 68": "hero_photo",       "Picture 2":  "secondary_photo",
    "Text 0": "s1_page_header",       "Text 1":  "s1_location_subheader",
    "Text 2": "s1_section_label",     "Text 3":  "s1_property_badge",
    "Text 4": "s1_cinematic_caption", "Text 5":  "s1_property_name_large",
    "Text 6": "s1_short_description", "Text 7":  "s1_asking_price_label",
    "Text 8": "s1_asking_price_value","Text 9":  "s1_target_acquisition",
    "Text 10":"s1_specs_header",      "Text 11": "s1_room_count",
    "Text 12":"s1_adr",               "Text 13": "s1_occupancy",
    "Text 14":"s1_revpar",            "Text 15": "s1_property_type",
    "Text 16":"s1_asking_price_inline","Text 17": "s1_vision_header",
    "Text 18":"s1_vision_headline",   "Text 19": "s1_vision_bullet_1",
    "Text 20":"s1_vision_bullet_2",   "Text 21": "s1_type_badge",
    "Text 22":"s1_description_paragraph",
  },
  2: {
    "Picture 35":"gallery_photo_1",   "Picture 41":"gallery_photo_2",
    "Image 12":  "gallery_photo_3",   "Image 26":  "gallery_photo_4",
    "Picture 66":"gallery_photo_5",
    "Text 0": "s2_property_header",   "Text 1":  "s2_location_subheader",
    "Text 2": "s2_section_label",     "Text 3":  "s2_property_estate_badge",
    "Text 5": "s2_property_name_large","Text 6": "s2_operational_model_text",
    "Text 10":"s2_specs_header",      "Text 11": "s2_purchase_price",
    "Text 12":"s2_renovation_budget", "Text 13": "s2_total_investment",
    "Text 14":"s2_stabilized_revenue","Text 15": "s2_projected_noi",
    "Text 16":"s2_irr",               "Text 17": "s2_vision_header",
    "Text 18":"s2_operational_model_label","Text 19":"s2_revenue_bullet",
    "Text 20":"s2_programming_bullet","Text 22": "s2_operational_paragraph",
  },
  3: {
    "Picture 46":"hero_photo",        "Image 9":   "secondary_photo",
    "Image 24":  "tertiary_photo",
    "Text 0": "s3_investment_model_header","Text 1":"s3_model_subheader",
    "Text 2": "s3_section_label",     "Text 3":  "s3_location_type_badge",
    "Text 5": "s3_model_label",       "Text 6":  "s3_concept_header",
    "Text 7": "s3_investment_model_concept","Text 8":"s3_model_type",
    "Text 9": "s3_strategic_details_header","Text 10":"s3_location_detail",
    "Text 11":"s3_market_detail",     "Text 12": "s3_asset_type",
    "Text 13":"s3_strategy",          "Text 14": "s3_structure",
    "Text 15":"s3_why_property_header","Text 16": "s3_market_rationale",
    "Text 17":"s3_why_model_header",  "Text 18": "s3_reason_1_label",
    "Text 19":"s3_reason_1_detail",   "Text 20": "s3_reason_2_label",
    "Text 21":"s3_reason_2_detail",   "Text 22": "s3_reason_3_label",
    "Text 23":"s3_reason_3_detail",   "Text 24": "s3_closing_line",
  },
  4: {
    "Picture 6": "hero_photo",        "Picture 7": "sibling_photo_1",
    "Picture 8": "sibling_photo_2",   "Picture 9": "sibling_photo_3",
    "Picture 10":"sibling_photo_4",   "Picture 11":"sibling_photo_5",
  },
  5: {
    "Table 4": "s5_transformation_table","Table 3":"s5_stable_year_snapshot",
    "Table 10":"s5_financing_summary",
  },
  6: {
    "Picture 4":"s6_is_table_image",  "Picture 6":"s6_investor_metrics_image",
  },
};

/** Returns the semantic_id for a slot — prefers the recipe-embedded value,
 *  falls back to the TypeScript lookup until the recipe is regenerated. */
function semanticId(slideNum: number, el: RecipeElement): string | null {
  return el.semantic_id ?? SHAPE_TO_SEMANTIC[slideNum]?.[el.name] ?? null;
}

// ── Main resolver ────────────────────────────────────────────────────────────

/**
 * Returns the display text for a slot element, or null to use template_text.
 */
export function resolveSlotText(
  slideNum: number,
  el: RecipeElement,
  p: SlidePayload,
): string | null {
  const { property, visionText, financials } = p;
  const type = typeLabel(property);
  const name = el.name;
  const isPage = el.is_page_number === true;

  switch (slideNum) {
    case 1: {
      const status = statusLabel(property.acquisitionStatus);
      const revpar = (property.startAdr ?? 0) * (property.maxOccupancy ?? 0.7);
      return resolveSlide1(name, isPage, property, visionText, type, status, revpar);
    }
    case 2: {
      // Deterministic renovation budget computed server-side (mirrors Track 1 Python).
      const renovBudget = financials.renovationBudget;
      const stable = stableYear(financials.yearlyIS);
      return resolveSlide2(name, isPage, property, visionText, financials, type, renovBudget, stable);
    }
    case 3: return resolveSlide3(name, isPage, property, visionText, type);
    case 4: return resolveSlide4(name, isPage, property, p.siblings);
    case 5: {
      const stable = stableYear(financials.yearlyIS);
      return resolveSlide5(name, isPage, property, visionText, financials, stable);
    }
    case 6: return resolveSlide6(name, isPage, property);
    default: return null;
  }
}

// ── Per-slide resolvers ──────────────────────────────────────────────────────

function resolveSlide1(
  name: string,
  isPage: boolean,
  p: SlidePayload["property"],
  v: SlidePayload["visionText"],
  type: string,
  status: string,
  revpar: number,
): string | null {
  if (name === "Text 19" && isPage) return "PAGE 1";
  switch (name) {
    case "Text 0":  return `${status} Spotlight: ${p.city}, ${p.stateProvince}`;
    case "Text 1":  return `Active ${status.toLowerCase()} — ${p.county}, ${p.stateProvince}`;
    case "Text 2":  return "INVESTMENT SPOTLIGHT";
    case "Text 3":  return `${p.name.toUpperCase()} · ${type.toUpperCase()}`;
    case "Text 4":  return v.cinematicCaption || `${p.roomCount} KEYS · ${type.toUpperCase()}`;
    case "Text 5":  return p.name;
    case "Text 6":  return firstSentence(p.description ?? "");
    case "Text 7":  return "ASKING PRICE";
    case "Text 8":  return fmtCurrency(p.purchasePrice);
    case "Text 9":  return `Target Acquisition: ${fmtCurrency((p.purchasePrice ?? 0) * 0.85)}`;
    case "Text 10": return "Property Specs";
    case "Text 11": return `${p.roomCount} Keys / Guest Rooms`;
    case "Text 12": return `ADR: ${fmtCurrency(p.startAdr)} per Key`;
    case "Text 13": return `Stabilized Occupancy: ${fmtPct(p.maxOccupancy)}`;
    case "Text 14": return `RevPAR: ${fmtCurrency(revpar)}`;
    case "Text 15": return `Property Type: ${p.hospitalityType || p.businessModel}`;
    case "Text 16": return `Asking: ${fmtCurrency(p.purchasePrice)}`;
    case "Text 17": return "The Vision";
    case "Text 18": return v.visionHeadline;
    case "Text 19": return v.visionBullet1; // non-page branch
    case "Text 20": return v.visionBullet2;
    case "Text 21": return v.badgeText || type.toUpperCase();
    case "Text 22": return v.descriptionParagraph;
    default: return null;
  }
}

function resolveSlide2(
  name: string,
  isPage: boolean,
  p: SlidePayload["property"],
  v: SlidePayload["visionText"],
  fin: SlidePayload["financials"],
  type: string,
  renovBudget: number,
  stable: ReturnType<typeof stableYear>,
): string | null {
  if (name === "Text 19" && isPage) return "PAGE 2";
  const totalInv = (p.purchasePrice ?? 0) + renovBudget;
  const irr = fin.irr ?? 0;
  switch (name) {
    case "Text 0":  return `${p.name} — ${p.city}, ${p.stateProvince}`;
    case "Text 1":  return `${p.county} — ${p.stateProvince}`;
    case "Text 2":  return "INVESTMENT SPOTLIGHT";
    case "Text 3":  return `${p.name.toUpperCase()} — ${p.city.toUpperCase()} ESTATE`;
    case "Text 5":  return p.name;
    case "Text 6":  return v.operationalModelText || firstSentence(p.description ?? "");
    case "Text 10": return "Property Specs";
    case "Text 11": return `Purchase Price: ${fmtCurrency(p.purchasePrice)}`;
    case "Text 12": return `Renovation Budget: ${fmtCurrency(renovBudget)}`;
    case "Text 13": return `Total Investment: ${fmtCurrency(totalInv)}`;
    case "Text 14": return `Stabilized Revenue (Yr 3): ${fmtCurrency(stable?.revenueTotal)}`;
    case "Text 15": return `Projected NOI: ${fmtCurrency(stable?.noi)}`;
    case "Text 16": return `Est. IRR: ${fmtPct(irr)} over 5 years`;
    case "Text 17": return "The Vision";
    case "Text 18": return `Operational Model: ${v.operationalModelText}`;
    case "Text 19": return v.revenueBullet;
    case "Text 20": return v.programmingBullet;
    case "Text 22": return v.operationalParagraph;
    default: return null;
  }
}

function resolveSlide3(
  name: string,
  isPage: boolean,
  p: SlidePayload["property"],
  v: SlidePayload["visionText"],
  type: string,
): string | null {
  if (name === "Text 19" && isPage) return "PAGE 3";
  switch (name) {
    case "Text 0":  return `Investment Model: ${p.name}`;
    case "Text 1":  return `The L+B model applied to ${type} assets in ${p.city}, ${p.stateProvince}`;
    case "Text 2":  return "INVESTMENT MODEL";
    case "Text 3":  return `${p.city.toUpperCase()}, ${p.stateProvince.toUpperCase()} · ${type.toUpperCase()}`;
    case "Text 5":  return "L+B\nModel";
    case "Text 6":  return "THE CONCEPT";
    case "Text 7":  return v.investmentModelConcept;
    case "Text 8":  return `Model: ${p.businessModel || type}`;
    case "Text 9":  return "Strategic Details";
    case "Text 10": return `Location: ${p.city}, ${p.stateProvince}`;
    case "Text 11": return `Market: ${p.county}`;
    case "Text 12": return `Asset Type: ${type}`;
    case "Text 13": return "Strategy: Direct Ownership + Curated Programming";
    case "Text 14": return `Structure: ${p.businessModel || type}`;
    case "Text 15": return "Why This Property?";
    case "Text 16": return v.marketRationale;
    case "Text 17": return "Why This Model?";
    case "Text 18": return v.reason1Label;
    case "Text 19": return v.reason1Detail;
    case "Text 20": return v.reason2Label;
    case "Text 21": return v.reason2Detail;
    case "Text 22": return v.reason3Label;
    case "Text 23": return v.reason3Detail;
    case "Text 24": return v.closingLine;
    default: return null;
  }
}

function resolveSlide4(
  name: string,
  isPage: boolean,
  p: SlidePayload["property"],
  siblings: SlidePayload["siblings"],
): string | null {
  if (name === "Text 19" && isPage) return "PAGE 4";
  switch (name) {
    case "Text 0": return `Market Context: ${p.stateProvince} Pipeline`;
    case "Text 1": return `${p.name} and ${siblings.length} related ${siblings.length === 1 ? "property" : "properties"}`;
    case "Text 2": return "PROPERTY PIPELINE";
    case "Text 3": return `${p.stateProvince.toUpperCase()} PORTFOLIO OVERVIEW`;
    default: return null;
  }
}

function resolveSlide5(
  name: string,
  isPage: boolean,
  p: SlidePayload["property"],
  v: SlidePayload["visionText"],
  fin: SlidePayload["financials"],
  stable: ReturnType<typeof stableYear>,
): string | null {
  if (isPage) return "PAGE 5";
  const stableYr = stable?.year ?? 2028;
  const grossMargin = stable && stable.revenueTotal > 0 ? stable.gop / stable.revenueTotal : null;
  const ebitdaPct   = stable && stable.revenueTotal > 0 ? stable.noi / stable.revenueTotal : null;
  switch (name) {
    case "TextBox 2":
      return `The Transformation Plan — ${p.name}`;
    case "Rectangle 1":
      return `Snapshot of Stable Year (${stableYr})`;
    case "TextBox 9":
      return `Key Investor Metrics — GOP Margin: ${fmtPct(grossMargin)}   EBITDA (${stableYr}): ${fmtPct(ebitdaPct)}\n* Projections are for the first full year of stabilized operations and are based on the finalized financial assumptions.`;
    case "Text 19":
      return "PAGE 5";
    default:
      return null;
  }
}

function resolveSlide6(
  name: string,
  isPage: boolean,
  p: SlidePayload["property"],
): string | null {
  if (name === "Slide Number Placeholder 1") return "6";
  if (isPage) return "PAGE 6";
  switch (name) {
    case "Rectangle 1":
      return `5-Year Consolidated Pro Forma Income Statement\n${p.name}`;
    default:
      return null;
  }
}

// ── Table resolver ───────────────────────────────────────────────────────────

/**
 * Returns the cell grid for a table slot, or null if none.
 * Currently only Slide 5 has structured table slots in the recipe;
 * Slide 6's "tables" are picture-slot placeholders synthesized in the hybrid
 * renderer (see renderHybridSlide).
 *
 * If a table slot can't be resolved to data, callers fall back to "—" cells.
 */
export function resolveSlotTable(
  slideNum: number,
  el: RecipeElement,
  p: SlidePayload,
): string[][] | null {
  if (slideNum !== 5) return null;
  const { property, financials, improvements } = p;
  const stable = stableYear(financials.yearlyIS);

  switch (el.name) {
    case "Table 4": {
      // Transformation table 5×3
      const header: string[] = ["Feature", "Existing", "Proposed"];
      const data = improvements.length > 0
        ? improvements.slice(0, 4).map(i => [i.feature, i.existing, i.proposed])
        : [
            ["Guest Capacity", `${Math.max(1, property.roomCount - 2)} Guests`, `${property.roomCount} Keys`],
            ["Event Space",    "Limited",                                       "Curated venue spaces"],
            ["Lodging",        "Standard rooms",                                `${property.roomCount} boutique-designed keys`],
            ["Amenities",      "Basic",                                         "Curated experiential amenities"],
          ];
      const rows: string[][] = [header, ...data];
      while (rows.length < (el.rows ?? 5)) rows.push(["—", "—", "—"]);
      return rows;
    }

    case "Table 3": {
      // Snapshot of stable year 9×2
      const stableOcc = stable && stable.availableRooms > 0
        ? Math.min(DEFAULT_MAX_OCCUPANCY, Math.max(DEFAULT_START_OCCUPANCY, stable.soldRooms / stable.availableRooms))
        : (property.maxOccupancy ?? 0.7);
      const stableAdr    = stable?.cleanAdr ?? property.startAdr ?? 0;
      const stableRevpar = stableAdr * stableOcc;
      const grossMargin  = stable && stable.revenueTotal > 0 ? stable.gop / stable.revenueTotal : null;
      const ebitdaPct    = stable && stable.revenueTotal > 0 ? stable.noi / stable.revenueTotal : null;
      return [
        ["Item",           "Value"],
        ["Occupancy",      fmtPct(stableOcc)],
        ["ADR",            fmtCurrency(stableAdr)],
        ["RevPAR",         fmtCurrency(stableRevpar)],
        ["Revenue",        fmtCurrency(stable?.revenueTotal)],
        ["Variable Costs", fmtCurrency(stable?.totalExpenses)],
        ["GOP Margin",     fmtPct(grossMargin)],
        ["EBITDA",         fmtPct(ebitdaPct)],
        ["",               ""],
      ];
    }

    case "Table 10": {
      // Financing summary 6×2
      const renov    = financials.renovationBudget;
      const totalInv = (property.purchasePrice ?? 0) + renov;
      const ltvPct   = financials.loanLtv > 0 ? `${Math.round(financials.loanLtv * 100)}%` : "65%";
      return [
        ["Financing Summary",         ""],
        ["Purchase Price",            fmtCurrency(property.purchasePrice)],
        ["Renovation Budget",         fmtCurrency(renov)],
        ["Total Investment",          fmtCurrency(totalInv)],
        [`Loan Amount (${ltvPct})`,   fmtCurrency(financials.loanAmount)],
        ["Annual Debt Service",       fmtCurrency(financials.annualDebtService)],
      ];
    }
  }
  return null;
}

// ── Photo resolver ───────────────────────────────────────────────────────────

/**
 * Returns the Buffer for a photo slot, or null if unavailable.
 * Routes by semantic_id so shape names are opaque to this function —
 * update scripts/src/slide-semantic-map.json when loading a new template.
 */
export function resolveSlotPhoto(
  slideNum: number,
  el: RecipeElement,
  photos: SlidePayload["photos"],
): Buffer | null {
  const hero = photos.find(ph => ph.isHero) ?? photos[0];
  const nonHero = photos.filter(ph => !ph.isHero);
  const secondary = nonHero[0] ?? photos[1];

  const sem = semanticId(slideNum, el);
  let photo;
  switch (sem) {
    case "hero_photo":      photo = hero; break;
    case "secondary_photo": photo = secondary; break;
    case "tertiary_photo":  photo = nonHero[1] ?? secondary; break;
    case "gallery_photo_1": photo = nonHero[0]; break;
    case "gallery_photo_2": photo = nonHero[1]; break;
    case "gallery_photo_3": photo = nonHero[2]; break;
    case "gallery_photo_4": photo = nonHero[3]; break;
    case "gallery_photo_5": photo = nonHero[4]; break;
    // s6_is_table_image / s6_investor_metrics_image are synthesized in
    // hybrid-renderer.ts — they do not map to a property photo here.
    default: return null;
  }

  if (!photo) return null;
  const b64 = photo.base64;
  if (!b64) return null;
  const raw = b64.startsWith("data:") ? b64.split(",")[1] : b64;
  return raw ? Buffer.from(raw, "base64") : null;
}
