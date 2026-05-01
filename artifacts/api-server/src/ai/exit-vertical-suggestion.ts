/**
 * exit-vertical-suggestion.ts — Analyst-style heuristic that picks an industry
 * vertical (from the admin-managed `exit_multiples` table) for the user's
 * portfolio, so the Property Defaults card can pre-suggest one when the user
 * has not chosen yet.
 *
 * Deterministic, no LLM. Builds a small bag of profile keywords from the
 * portfolio (dominant quality tier, ADR-bracket-implied tier, hospitality
 * type, "boutique" if rooms are small) and scores each vertical by how many
 * of those keywords appear in its `dimensionKey` or `label`.
 *
 * Why deterministic:
 *   - The exit_multiples list is admin-curated and may use any naming
 *     convention (default seed is SaaS / ecommerce / etc.; admins typically
 *     reseed with hospitality verticals like "boutique-luxury" / "select-
 *     service"). A keyword-overlap score works for both.
 *   - No LLM cost, instant, and the rationale is explainable.
 */
import type { Property } from "@workspace/db";
import type { ExitMultiple } from "@workspace/db";

export interface IndustryVerticalSuggestion {
  dimensionKey: string;
  label: string;
  rationale: string;
}

type VerticalCandidate = Pick<ExitMultiple, "dimensionKey" | "label">;

function tokenize(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

interface PortfolioProfile {
  tokens: string[];
  rationale: string[];
}

function buildPortfolioProfile(properties: Property[]): PortfolioProfile {
  const active = properties.filter((p) => p.isActive !== false);
  if (active.length === 0) return { tokens: [], rationale: [] };

  const totalRooms = active.reduce((s, p) => s + (p.roomCount ?? 0), 0);
  const avgRooms = totalRooms / active.length;

  const adrSamples = active
    .map((p) => p.startAdr ?? 0)
    .filter((v) => v > 0);
  const avgAdr = adrSamples.length
    ? adrSamples.reduce((s, v) => s + v, 0) / adrSamples.length
    : 0;

  const dominant = (vals: (string | null | undefined)[], fallback: string): string => {
    const counts = new Map<string, number>();
    for (const v of vals) {
      const key = (v ?? "").toLowerCase().trim();
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    if (counts.size === 0) return fallback;
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0][0];
  };

  const dominantTier = dominant(active.map((p) => p.qualityTier), "upscale");
  const dominantHospitality = dominant(active.map((p) => p.hospitalityType), "hotel");
  const dominantServiceLevel = dominant(active.map((p) => p.serviceLevel), "");
  const dominantLocation = dominant(active.map((p) => p.locationType), "");

  const tokens: string[] = [];
  const rationale: string[] = [];

  // Dominant categorical signals.
  tokens.push(...tokenize(dominantTier), ...tokenize(dominantHospitality));
  rationale.push(`${dominantTier} tier`);
  if (dominantHospitality !== "hotel") rationale.push(`${dominantHospitality} format`);
  if (dominantServiceLevel) {
    tokens.push(...tokenize(dominantServiceLevel));
  }
  if (dominantLocation) {
    tokens.push(...tokenize(dominantLocation));
    if (/resort|beach|mountain/.test(dominantLocation)) {
      tokens.push("resort");
    }
  }

  // Room-count shape.
  if (avgRooms > 0 && avgRooms < 75) {
    tokens.push("boutique", "lifestyle");
    rationale.push(`small format (${Math.round(avgRooms)} avg rooms)`);
  } else if (avgRooms >= 75 && avgRooms < 200) {
    tokens.push("lifestyle", "select", "service");
  } else if (avgRooms >= 200) {
    tokens.push("full", "service");
  }

  // ADR-implied tier (parallel signal — survives missing qualityTier).
  if (avgAdr >= 350) {
    tokens.push("luxury", "ultra");
    rationale.push(`luxury ADR (~$${Math.round(avgAdr)})`);
  } else if (avgAdr >= 250) {
    tokens.push("upper", "upscale");
    rationale.push(`upper-upscale ADR (~$${Math.round(avgAdr)})`);
  } else if (avgAdr >= 180) {
    tokens.push("upscale");
    rationale.push(`upscale ADR (~$${Math.round(avgAdr)})`);
  } else if (avgAdr >= 130) {
    tokens.push("midscale", "select");
    rationale.push(`midscale ADR (~$${Math.round(avgAdr)})`);
  } else if (avgAdr > 0) {
    tokens.push("economy", "limited", "budget");
    rationale.push(`economy ADR (~$${Math.round(avgAdr)})`);
  }

  // Always include generic hospitality fallbacks so a "Hospitality" or
  // "Hotel" vertical can still beat unrelated ones (SaaS, fintech, ...).
  tokens.push("hospitality", "hotel", "lodging");

  return { tokens, rationale };
}

export function suggestIndustryVertical(
  properties: Property[],
  available: VerticalCandidate[],
): IndustryVerticalSuggestion | null {
  if (available.length === 0) return null;
  const { tokens, rationale } = buildPortfolioProfile(properties);
  if (tokens.length === 0) return null;

  let best: { v: VerticalCandidate; score: number; matched: Set<string> } | null = null;
  for (const v of available) {
    const verticalTokens = new Set([
      ...tokenize(v.dimensionKey),
      ...tokenize(v.label),
    ]);
    const matched = new Set<string>();
    let score = 0;
    for (const t of tokens) {
      if (verticalTokens.has(t) && !matched.has(t)) {
        matched.add(t);
        score += 1;
      }
    }
    if (!best || score > best.score) best = { v, score, matched };
  }

  if (!best) return null;

  const profileSummary = rationale.slice(0, 3).join(", ") || "your portfolio profile";

  if (best.score === 0) {
    return {
      dimensionKey: best.v.dimensionKey,
      label: best.v.label,
      rationale: `No vertical closely matches ${profileSummary}. Suggesting "${best.v.label}" as a starting point — you can change it any time.`,
    };
  }

  const matchedList = Array.from(best.matched).slice(0, 3).join(", ");
  return {
    dimensionKey: best.v.dimensionKey,
    label: best.v.label,
    rationale: `Best fit for ${profileSummary} (matched on ${matchedList}).`,
  };
}
