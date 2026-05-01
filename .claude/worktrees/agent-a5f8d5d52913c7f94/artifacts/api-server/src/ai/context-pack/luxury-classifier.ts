export interface ClassificationInput {
  starRating: number | null;
  hospitalityType: string;
  startAdr: number;
  roomCount: number;
  hasFB: boolean;
  hasEvents: boolean;
  hasWellness: boolean;
  city: string | null;
  stateProvince: string | null;
  country: string | null;
}

function getAdrTier(adr: number): string {
  if (adr >= 700) return "ultra-luxury";
  if (adr >= 400) return "luxury";
  if (adr >= 250) return "upper upscale";
  if (adr >= 150) return "upscale";
  if (adr >= 80) return "midscale";
  return "economy";
}

function getSizeLabel(rooms: number): string {
  if (rooms <= 8) return "intimate retreat";
  if (rooms <= 15) return "boutique";
  if (rooms <= 40) return "small hotel";
  if (rooms <= 80) return "mid-size hotel";
  return "large hotel";
}

function getAmenityDensity(hasFB: boolean, hasEvents: boolean, hasWellness: boolean): string | null {
  const count = [hasFB, hasEvents, hasWellness].filter(Boolean).length;
  if (count === 3) return "full-experience";
  if (count === 2) return "enhanced-amenity";
  if (count === 1) return "focused-amenity";
  return null;
}

function getLocationType(city: string | null, stateProvince: string | null): string {
  const combined = `${city ?? ""} ${stateProvince ?? ""}`.toLowerCase();
  const urbanMarkers = ["new york", "chicago", "los angeles", "miami", "boston", "san francisco", "seattle", "atlanta", "dallas", "houston", "denver", "washington", "bogota", "bogotá", "medellin", "medellín"];
  const suburbanMarkers = ["suburb", "metro"];
  if (urbanMarkers.some(m => combined.includes(m))) return "urban";
  if (suburbanMarkers.some(m => combined.includes(m))) return "suburban";
  return "rural/resort";
}

const TYPE_LABELS: Record<string, string> = {
  hotel: "hotel",
  resort: "resort",
  boutique_hotel: "boutique hotel",
  business_hotel: "business hotel",
  wellness_resort: "wellness resort",
  conference_hotel: "conference hotel",
  extended_stay: "extended-stay property",
};

export function buildCompositeLabel(input: ClassificationInput): string {
  const starLabel = input.starRating ? `${input.starRating}★` : "";
  const adrTier = getAdrTier(input.startAdr);
  const sizeLabel = getSizeLabel(input.roomCount);
  const typeLabel = TYPE_LABELS[input.hospitalityType] || input.hospitalityType;
  const amenityDensity = getAmenityDensity(input.hasFB, input.hasEvents, input.hasWellness);
  const locationType = getLocationType(input.city, input.stateProvince);

  const parts: string[] = [];
  if (starLabel) parts.push(starLabel);
  parts.push(adrTier);
  if (sizeLabel !== typeLabel) parts.push(sizeLabel);
  if (amenityDensity) parts.push(amenityDensity);
  parts.push(typeLabel);
  if (locationType) parts.push(`(${locationType})`);

  return parts.join(" ");
}

export function buildComparableDescription(input: ClassificationInput): string {
  const starRange = input.starRating
    ? `${Math.max(1, input.starRating - 1)}★–${Math.min(5, input.starRating + 1)}★`
    : "any star rating";
  const roomRange = `${Math.round(input.roomCount * 0.6)}–${Math.round(input.roomCount * 1.4)} rooms`;
  const adrRange = `$${Math.round(input.startAdr * 0.7)}–$${Math.round(input.startAdr * 1.3)} ADR`;
  const typeLabel = TYPE_LABELS[input.hospitalityType] || input.hospitalityType;

  const amenities: string[] = [];
  if (input.hasFB) amenities.push("F&B");
  if (input.hasEvents) amenities.push("events");
  if (input.hasWellness) amenities.push("wellness");

  const location = [input.city, input.stateProvince, input.country].filter(Boolean).join(", ");

  return `${starRange} ${typeLabel}s with ${roomRange}, ${adrRange}${amenities.length ? `, with ${amenities.join("/")}` : ""} in ${location || "comparable markets"}`;
}
