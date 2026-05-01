import { BaseIntegrationService } from "./BaseIntegrationService";
import { cache } from "../cache";

const RAPIDAPI_HOST = "realty-in-us.p.rapidapi.com";
const CACHE_TTL_SECONDS = 15 * 60;

interface RealtyListing {
  property_id?: string;
  listing_id?: string;
  list_price?: number;
  list_price_max?: number;
  description?: {
    beds?: number;
    baths?: number;
    sqft?: number;
    lot_sqft?: number;
    type?: string;
    name?: string;
  };
  location?: {
    address?: {
      line?: string;
      city?: string;
      state_code?: string;
      postal_code?: string;
    };
  };
  primary_photo?: { href?: string };
  photos?: Array<{ href?: string }>;
  href?: string;
}

interface RealtyApiResponse {
  data?: {
    home_search?: {
      results?: RealtyListing[];
      total?: number;
      count?: number;
    };
  };
  errors?: Array<{ message: string }>;
}

export interface PropertySearchResult {
  externalId: string;
  address: string;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  lotSizeAcres: number | null;
  propertyType: string | null;
  imageUrl: string | null;
  listingUrl: string | null;
}

export interface PropertySearchResponse {
  results: PropertySearchResult[];
  total: number;
  offset: number;
}

const PROPERTY_TYPE_MAP: Record<string, string> = {
  single_family: "single_family",
  multi_family: "multi_family",
  land: "land",
  commercial: "commercial",
  house: "single_family",
  "multi-family": "multi_family",
};

function parseLocation(location: string): { city?: string; state_code?: string; postal_code?: string } {
  const trimmed = location.trim();
  const zipMatch = trimmed.match(/\b(\d{5})\b/);
  if (zipMatch) return { postal_code: zipMatch[1] };

  const parts = trimmed.split(",").map((p) => p.trim());
  if (parts.length >= 2) {
    const stateStr = parts[parts.length - 1].replace(/\d+/g, "").trim().toUpperCase();
    const stateCode = stateStr.length === 2 ? stateStr : STATE_ABBREVS[stateStr.toLowerCase()] || undefined;
    return { city: parts[0], state_code: stateCode };
  }
  return { city: trimmed };
}

const STATE_ABBREVS: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA",
  kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO",
  montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ",
  "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND",
  ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI",
  "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT",
  vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV",
  wisconsin: "WI", wyoming: "WY",
};

function mapPropertyType(type?: string): string {
  if (!type) return "Other";
  const lower = type.toLowerCase();
  if (lower.includes("single")) return "House";
  if (lower.includes("multi")) return "Multi-Family";
  if (lower.includes("land")) return "Land";
  if (lower.includes("commercial") || lower.includes("condo")) return "Commercial";
  return type;
}

export class RealtyService extends BaseIntegrationService {
  constructor() {
    super("RealtyInUS", 15_000);
  }

  isAvailable(): boolean {
    return !!process.env.RAPIDAPI_KEY;
  }

  async searchProperties(params: {
    location: string;
    priceMin?: number;
    priceMax?: number;
    bedsMin?: number;
    lotSizeMinAcres?: number;
    propertyType?: string;
    offset?: number;
    limit?: number;
  }): Promise<PropertySearchResponse> {
    const key = process.env.RAPIDAPI_KEY;
    if (!key) throw new Error("RapidAPI key not configured");

    const { location, priceMin, priceMax, bedsMin, lotSizeMinAcres, propertyType, offset = 0, limit = 20 } = params;
    const cacheKey = `realty:search:${JSON.stringify(params)}`;

    return cache.staleWhileRevalidate<PropertySearchResponse>(cacheKey, CACHE_TTL_SECONDS, async () => {
      const parsed = parseLocation(location);
      const body: Record<string, unknown> = {
        limit,
        offset,
        status: ["for_sale"],
        sort: { direction: "desc", field: "list_date" },
      };

      if (parsed.postal_code) body.postal_code = parsed.postal_code;
      else if (parsed.city) {
        body.city = parsed.city;
        if (parsed.state_code) body.state_code = parsed.state_code;
      }

      if (priceMin || priceMax) {
        body.list_price = {};
        if (priceMin) (body.list_price as Record<string, number>).min = priceMin;
        if (priceMax) (body.list_price as Record<string, number>).max = priceMax;
      }
      if (bedsMin) body.beds_min = bedsMin;
      if (lotSizeMinAcres) body.lot_sqft_min = Math.round(lotSizeMinAcres * 43560);
      if (propertyType && propertyType !== "any") {
        const mapped = PROPERTY_TYPE_MAP[propertyType.toLowerCase()];
        if (mapped) body.type = [mapped];
      }

      const url = `https://${RAPIDAPI_HOST}/properties/v3/list`;

      const response = await this.fetchWithTimeout(url, {
        method: "POST",
        headers: {
          "x-rapidapi-key": key,
          "x-rapidapi-host": RAPIDAPI_HOST,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const data: RealtyApiResponse = await response.json();

      if (data.errors?.length) {
        this.warn(`API errors: ${data.errors.map((e) => e.message).join(", ")}`);
      }

      const homeSearch = data.data?.home_search;
      const listings = homeSearch?.results ?? [];
      const total = homeSearch?.total ?? listings.length;

      const results: PropertySearchResult[] = listings.map((l) => {
        const addr = l.location?.address;
        const desc = l.description;
        const lotAcres = desc?.lot_sqft ? Math.round((desc.lot_sqft / 43560) * 100) / 100 : null;
        const photoUrl = l.primary_photo?.href?.replace("s.jpg", "od-w480_h360.jpg") ?? null;

        return {
          externalId: l.property_id || l.listing_id || `realty-${Math.random().toString(36).slice(2, 10)}`,
          address: addr?.line ?? "Address not available",
          city: addr?.city ?? null,
          state: addr?.state_code ?? null,
          zipCode: addr?.postal_code ?? null,
          price: l.list_price ?? l.list_price_max ?? null,
          beds: desc?.beds ?? null,
          baths: desc?.baths ?? null,
          sqft: desc?.sqft ?? null,
          lotSizeAcres: lotAcres,
          propertyType: mapPropertyType(desc?.type),
          imageUrl: photoUrl,
          listingUrl: l.href
            ? (l.href.startsWith("http") ? l.href : `https://www.realtor.com${l.href}`)
            : null,
        };
      });

      this.log(`Search "${location}": ${results.length} results (total: ${total})`);
      return { results, total, offset };
    });
  }
}
