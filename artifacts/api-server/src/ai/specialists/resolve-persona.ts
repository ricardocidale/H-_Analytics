/**
 * Canonical specialist persona resolution (NAI-29).
 *
 * Centralises the persona-triplet construction that was previously duplicated
 * inline across all 7 V1Path functions in analyst-admin.ts.
 *
 * G6-P3 enhancement path:
 *   - resolveCompanyPersona: enrich marketTier from ICP model profile;
 *     use ga.companyCountry for locale; derive verticalSlug from engine-
 *     computed RevPAR band + stabilised occupancy rather than a raw
 *     hospitalityType frequency count.
 *   - resolvePropertyPersona: enrich from property benchmarks (STR segment,
 *     comp-set tier) once the full property-research context is available.
 */

/** The canonical resolved persona triplet shared across all specialists. */
export interface ResolvedPersona {
  verticalSlug: string;
  marketTier: string;
  locale: string;
}

/**
 * Map a raw `hospitalityType` string to one of the known vertical slugs that
 * specialist prompts and cache-key hashes understand.
 *
 * Unmapped types fall back to "boutique-luxury" — the dominant L+B segment.
 */
export function hospitalityTypeToVerticalSlug(type: string): string {
  const normalized = type.toLowerCase().replace(/[^a-z]/g, "-");
  const knownSlugs: Record<string, string> = {
    hotel: "boutique-luxury",
    "boutique-hotel": "boutique-luxury",
    resort: "boutique-luxury",
    hostel: "budget-independent",
    "bed-and-breakfast": "boutique-luxury",
    "vacation-rental": "short-term-rental",
    motel: "budget-independent",
    vrbo: "short-term-rental",
    "vrbo-owner-managed": "short-term-rental",
  };
  return knownSlugs[normalized] ?? "boutique-luxury";
}

/**
 * Derive the plurality vertical slug for a portfolio. Active properties
 * (roomCount > 0) are used when present; falls back to all properties.
 * Returns "boutique-luxury" for an empty portfolio.
 */
export function portfolioVerticalSlug(
  properties: Array<{ hospitalityType?: string | null; roomCount?: unknown }>,
): string {
  const active = properties.filter(
    (p) => p.roomCount != null && (p.roomCount as number) > 0,
  );
  const pool = active.length > 0 ? active : properties;
  const freq: Record<string, number> = {};
  for (const p of pool) {
    const slug = hospitalityTypeToVerticalSlug(p.hospitalityType ?? "hotel");
    freq[slug] = (freq[slug] ?? 0) + 1;
  }
  const entries = Object.entries(freq);
  return entries.length > 0
    ? entries.reduce((a, b) => (b[1] > a[1] ? b : a))[0]
    : "boutique-luxury";
}

/**
 * Resolve a company-level specialist persona from the user's portfolio
 * properties and (optionally) their global assumptions row.
 *
 * v1 behaviour: marketTier is hardcoded to "L+B", locale to "US".
 * G6-P3 will derive marketTier from the ICP model profile and locale from
 * `ga.companyCountry`.
 *
 * @param properties  All properties for the user (loaded by the V1Path caller).
 * @param _ga         Reserved for G6-P3 ICP enrichment; not consumed in v1.
 */
export function resolveCompanyPersona(
  properties: Array<{ hospitalityType?: string | null; roomCount?: unknown }>,
  _ga?: { companyCountry?: string | null; icpModelTier?: string | null } | null,
): ResolvedPersona {
  return {
    verticalSlug: portfolioVerticalSlug(properties),
    marketTier: "L+B",
    locale: "US",
  };
}

/**
 * Resolve a property-level specialist persona from the property record.
 *
 * verticalSlug is derived from hospitalityType.
 * marketTier is taken from property.marketTier, defaulting to "L+B".
 * locale is taken from property.country, defaulting to "US".
 */
export function resolvePropertyPersona(property: {
  hospitalityType?: string | null;
  marketTier?: string | null;
  country?: string | null;
}): ResolvedPersona {
  return {
    verticalSlug: hospitalityTypeToVerticalSlug(property.hospitalityType ?? "hotel"),
    marketTier: property.marketTier ?? "L+B",
    locale: property.country ?? "US",
  };
}
