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
 * Shape names are matched per the canonical SKILL.md photo mapping.
 */
export function resolveSlotPhoto(
  slideNum: number,
  shapeName: string,
  photos: SlidePayload["photos"],
): Buffer | null {
  const hero = photos.find(ph => ph.isHero) ?? photos[0];
  const nonHero = photos.filter(ph => !ph.isHero);
  const secondary = nonHero[0] ?? photos[1];

  let photo;
  switch (slideNum) {
    case 1:
      if (shapeName === "Picture 68") photo = hero;
      else if (shapeName === "Picture 2") photo = secondary;
      break;
    case 2:
      if (shapeName === "Picture 35") photo = nonHero[0];
      else if (shapeName === "Picture 41") photo = nonHero[1];
      else if (shapeName === "Image 12")   photo = nonHero[2];
      else if (shapeName === "Image 26")   photo = nonHero[3];
      else if (shapeName === "Picture 66") photo = nonHero[4];
      break;
    case 3:
      if (shapeName === "Picture 46")  photo = hero;
      else if (shapeName === "Image 9")  photo = secondary;
      else if (shapeName === "Image 24") photo = nonHero[1] ?? secondary;
      break;
    case 4:
      if (shapeName === "Picture 68" || shapeName === "Picture 2") photo = hero;
      break;
  }

  if (!photo) return null;
  const b64 = photo.base64;
  if (!b64) return null;
  const raw = b64.startsWith("data:") ? b64.split(",")[1] : b64;
  return raw ? Buffer.from(raw, "base64") : null;
}
