import type { Property } from "@shared/schema";

export interface StarRatingSuggestion {
  rating: number;
  reasoning: string;
}

const THRESHOLDS = {
  LUXURY_ADR: 700,
  UPSCALE_ADR: 250,
  MIDSCALE_ADR: 150,
  ECONOMY_ADR: 80,
  BOUTIQUE_MAX_ROOMS: 15,
  BOUTIQUE_MIN_ADR: 400,
} as const;

export function suggestStarRating(property: Pick<Property, "startAdr" | "roomCount" | "name" | "description" | "location" | "hospitalityType">): StarRatingSuggestion {
  const adr = property.startAdr;
  const rooms = property.roomCount;
  const desc = (property.description ?? "").toLowerCase();
  const name = (property.name ?? "").toLowerCase();
  const location = (property.location ?? "").toLowerCase();
  const type = property.hospitalityType ?? "hotel";
  const combined = `${desc} ${name} ${location}`;

  const hasWellness = /wellness|spa|retreat|yoga|thermal|hydrotherapy/.test(combined);
  const hasEvents = /event|conference|banquet|ballroom|catering|wedding/.test(combined);
  const isResort = type === "resort" || type === "wellness_resort" || /resort/.test(combined);

  if (adr >= THRESHOLDS.LUXURY_ADR && (hasWellness || hasEvents || isResort)) {
    return { rating: 5, reasoning: `ADR $${adr} with ${[hasWellness && "wellness", hasEvents && "events", isResort && "resort"].filter(Boolean).join("+")} amenities indicates luxury (5★) positioning` };
  }

  if (rooms <= THRESHOLDS.BOUTIQUE_MAX_ROOMS && adr >= THRESHOLDS.BOUTIQUE_MIN_ADR) {
    const base = adr >= THRESHOLDS.LUXURY_ADR ? 5 : 4;
    return { rating: base, reasoning: `Boutique property (${rooms} rooms, $${adr} ADR) — ${base}★ minimum for high-ADR intimate properties` };
  }

  if (adr >= THRESHOLDS.LUXURY_ADR) {
    return { rating: 5, reasoning: `ADR $${adr} places this property in the luxury (5★) tier` };
  }

  if (adr >= THRESHOLDS.UPSCALE_ADR) {
    const bump = (hasWellness || hasEvents) ? 1 : 0;
    const rating = Math.min(4 + bump, 5);
    const extras = bump ? ` with ${[hasWellness && "wellness", hasEvents && "events"].filter(Boolean).join("+")}` : "";
    return { rating, reasoning: `ADR $${adr}${extras} indicates upscale (${rating}★) positioning` };
  }

  if (adr >= THRESHOLDS.MIDSCALE_ADR) {
    return { rating: 3, reasoning: `ADR $${adr} indicates midscale (3★) positioning` };
  }

  if (adr >= THRESHOLDS.ECONOMY_ADR) {
    return { rating: 2, reasoning: `ADR $${adr} indicates economy (2★) positioning` };
  }

  return { rating: 1, reasoning: `ADR $${adr} indicates budget (1★) positioning` };
}
