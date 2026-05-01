/**
 * server/ai/icp/fallback-descriptive.ts — Deterministic fallbacks for the
 * qualitative ICP sections, used when the LLM call is skipped or fails.
 * Mirrors the structure the LLM is asked to return in `prompt.ts`.
 */

import type { GlobalAssumptions } from "@workspace/db";
import type {
  GeneratedIcpDescriptive,
  PortfolioAnalysis,
} from "@shared/icp-types";
import { capitalize, fmtK } from "./helpers";

export function buildFallbackDescriptive(
  analysis: PortfolioAnalysis,
  ga: GlobalAssumptions | null,
): GeneratedIcpDescriptive {
  return {
    propertyTypes: buildFallbackPropertyTypes(analysis, ga),
    fbLevel: buildFallbackFbLevel(analysis),
    locationCharacteristics: buildFallbackLocationCharacteristics(analysis),
    locationDetails: buildFallbackLocationDetails(analysis),
    conditionNotes: "Property in good to excellent structural condition. Cosmetic renovation acceptable but no major structural remediation required. Unique architectural character preferred.",
    groundsTopography: "Gentle rolling hills, flat meadows, or terraced hillside. Mature landscaping preferred. Water features valued. Mountain, valley, or pastoral views.",
    vendorServices: "The management company coordinates: IT/PMS, housekeeping, grounds maintenance, professional services (accounting, legal, insurance), F&B purveyors, marketing/PR.",
    regulatoryNotes: "Clear zoning for hospitality/commercial use or demonstrable path to re-zoning. Building permits must allow conversion within 6–18 months. Fire, ADA, and health department compliance required.",
    exclusions: `Properties requiring more than $${fmtK(analysis.purchasePrice.max * 0.5)} in structural renovation\nUrban high-rise or mid-rise buildings\nProperties below ${Math.max(analysis.rooms.min - 2, 3)} rooms or above ${analysis.rooms.max + 20} rooms\nChain-affiliated or conventional box hotels\nTimeshare, fractional ownership, or condo-hotel structures`,
    additionalContext: "",
  };
}

export function buildFallbackPropertyTypes(
  analysis: PortfolioAnalysis,
  ga: GlobalAssumptions | null,
): string {
  const tier = analysis.dominantQualityTier;
  const model = analysis.dominantBusinessModel;
  const label = ga?.propertyLabel || "hotel";
  const parts: string[] = [];
  parts.push(`${capitalize(tier)} boutique ${label}`);
  if (model === "lodge") parts.push("lodge, manor, or large private estate");
  else parts.push("estate hotel, hacienda, or large private residence");
  parts.push("suitable for conversion into a full-service hospitality operation");
  return parts.join(", ") + ". Properties must convey exclusivity, architectural character, and a strong sense of place.";
}

export function buildFallbackFbLevel(analysis: PortfolioAnalysis): string {
  if (analysis.fbRating >= 4) return "Full-service F&B operation with chef-driven restaurant, bar/lounge program, room service, and event catering. Farm-to-table or locally sourced menus preferred.";
  if (analysis.fbRating >= 3) return "Full breakfast service with dinner offerings. Capacity for private dining and event catering.";
  if (analysis.fbRating >= 2) return "Limited food and beverage with light meal options. Breakfast included in rate.";
  return "Continental breakfast only. No on-site restaurant required.";
}

export function buildFallbackLocationCharacteristics(analysis: PortfolioAnalysis): string {
  const parts: string[] = ["Secluded or estate-like setting with near-total privacy"];
  if (analysis.isInternational) parts.push("International markets with strong tourism demand");
  else parts.push("Proximity to tourism demand generators");
  parts.push("Accessible by paved road year-round");
  return parts.join(". ") + ".";
}

export function buildFallbackLocationDetails(analysis: PortfolioAnalysis): string {
  if (analysis.locations.length === 0) return "Geographic targets to be determined based on portfolio growth.";
  const byCountry: Record<string, string[]> = {};
  for (const loc of analysis.locations) {
    const key = loc.country;
    if (!byCountry[key]) byCountry[key] = [];
    const label = [loc.city, loc.state].filter(Boolean).join(", ");
    if (label) byCountry[key].push(label);
  }
  return Object.entries(byCountry)
    .map(([country, locs]) => `${country}: ${Array.from(new Set(locs)).join("; ")}`)
    .join("\n");
}
