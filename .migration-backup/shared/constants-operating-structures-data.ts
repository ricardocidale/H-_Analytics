/**
 * shared/constants-operating-structures-data.ts
 *
 * Pure data-only baseline + country-delta tables for operating-structure
 * overlays. Split out from `constants-operating-structures.ts` so that
 * `model-constants-registry.ts` can register these values without a
 * circular import (the registry must be importable from the runtime
 * resolver inside `constants-operating-structures.ts`).
 *
 * Authority context:
 *   - HVS 2024 USA Hotel Management Survey (HMA base + incentive bands)
 *   - JLL 2024 Hotel Brand Fee Guide (franchise royalty / marketing / reservation)
 *   - CBRE 2024 Hotel Lease Comps EU/UK (base rent share, escalators)
 *   - HVS LatAm 2024 (Mexico / Colombia delta)
 *
 * Doctrine: these are *Defaults* (calibration estimates from industry
 * surveys), not authority-published Constants. They are still registered
 * in `MODEL_CONSTANTS_REGISTRY` so admins can override per country and
 * the values flow through `getFactoryNumber()` like every other governed
 * scalar. The `specialistOwned: false` flag on each entry permits
 * manual admin overrides (analyst-apply path is not required).
 */

/**
 * Every fee/lease/capex scalar that participates in the operating-structure
 * overlay. The naming convention is `<structure-prefix><scalar-name>` so
 * keys are self-describing in the admin Constants tab.
 */
export type StructureOverlayKey =
  // Franchise (fee-simple-franchise)
  | "franchiseBrandRoyaltyOnRooms"
  | "franchiseBrandMarketingOnRooms"
  | "franchiseBrandReservationOnRooms"
  | "franchiseCapexFactor"
  // HMA (fee-simple-hma)
  | "hmaBaseFeeOnRevenue"
  | "hmaIncentiveFeeOnGop"
  // Hybrid soft-brand (hybrid-hma-franchise)
  | "softBrandRoyaltyOnRooms"
  | "softBrandMarketingOnRooms"
  | "softBrandReservationOnRooms"
  | "hybridHmaBaseFeeOnRevenue"
  | "hybridHmaIncentiveFeeOnGop"
  | "hybridCapexFactor"
  // Master lease (tenant + landlord share these scalar names)
  | "masterLeaseBaseRentRevenueShare"
  | "masterLeasePercentageRentOnRevenue"
  | "masterLeaseRentEscalator"
  | "masterLeaseTenantCapexFactor"
  | "masterLeaseLandlordCapexFactor"
  | "masterLeaseOperatorTakeCapOfGop";

/** USA baseline values for every structure overlay scalar. */
export const STRUCTURE_OVERLAY_BASELINES: Record<StructureOverlayKey, number> = {
  // Franchise — Hilton/Marriott midscale band, JLL 2024
  franchiseBrandRoyaltyOnRooms: 0.055,
  franchiseBrandMarketingOnRooms: 0.04,
  franchiseBrandReservationOnRooms: 0.02,
  franchiseCapexFactor: 1.1,

  // HMA — HVS 2024 third-party manager median
  hmaBaseFeeOnRevenue: 0.03,
  hmaIncentiveFeeOnGop: 0.10,

  // Hybrid soft-brand — Curio/Tribute/Autograph band, JLL 2024
  softBrandRoyaltyOnRooms: 0.045,
  softBrandMarketingOnRooms: 0.03,
  softBrandReservationOnRooms: 0.015,
  hybridHmaBaseFeeOnRevenue: 0.025,
  hybridHmaIncentiveFeeOnGop: 0.08,
  hybridCapexFactor: 1.1,

  // Master lease — CBRE Hotel Lease Comps 2024 USA
  masterLeaseBaseRentRevenueShare: 0.18,
  masterLeasePercentageRentOnRevenue: 0.06,
  masterLeaseRentEscalator: 0.02,
  masterLeaseTenantCapexFactor: 0.4,
  masterLeaseLandlordCapexFactor: 0.6,
  masterLeaseOperatorTakeCapOfGop: 0.55,
};

/**
 * Country deltas — sparse overrides applied on top of USA baselines.
 * Missing keys (or missing countries) fall through to the USA baseline.
 * Mirrors the COUNTRY_DELTAS pattern in the original constants file.
 */
export const STRUCTURE_OVERLAY_COUNTRY_DELTAS: Record<
  string,
  Partial<Record<StructureOverlayKey, number>>
> = {
  Mexico: {
    franchiseBrandRoyaltyOnRooms: 0.045,
    franchiseBrandMarketingOnRooms: 0.035,
    franchiseBrandReservationOnRooms: 0.018,
    hmaBaseFeeOnRevenue: 0.035,
    hmaIncentiveFeeOnGop: 0.09,
  },
  "United Kingdom": {
    hmaBaseFeeOnRevenue: 0.035,
    hmaIncentiveFeeOnGop: 0.08,
    masterLeaseBaseRentRevenueShare: 0.22,
    masterLeasePercentageRentOnRevenue: 0.05,
    masterLeaseRentEscalator: 0.025,
  },
  Canada: {
    franchiseBrandRoyaltyOnRooms: 0.05,
    franchiseBrandMarketingOnRooms: 0.04,
    franchiseBrandReservationOnRooms: 0.02,
  },
};

/**
 * Resolve a single overlay scalar for a given country, falling back to the
 * USA baseline when no country override exists. Used by both the registry
 * `factoryValue` path and by the `getOperatingStructureOverlay` resolver.
 */
export function resolveStructureOverlayScalar(
  key: StructureOverlayKey,
  country?: string | null,
): number {
  const baseline = STRUCTURE_OVERLAY_BASELINES[key];
  if (!country) return baseline;
  const delta = STRUCTURE_OVERLAY_COUNTRY_DELTAS[country];
  if (!delta) return baseline;
  const override = delta[key];
  return override ?? baseline;
}
