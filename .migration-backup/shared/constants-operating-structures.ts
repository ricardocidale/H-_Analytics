/**
 * shared/constants-operating-structures.ts
 *
 * Defines the six canonical hospitality operating structures and the default
 * fee / lease / capex overlays applied when modelling each one against a
 * baseline property pro-forma. Used by:
 *   - calc/analysis/structure-comparison.ts (overlay calculator)
 *   - server/routes/structure-comparison.ts (endpoint)
 *   - client/src/pages/OperatingStructureComparison.tsx (UI)
 *
 * The six structures we model:
 *   1. fee-simple-independent      Owner operates the hotel directly, no brand
 *   2. fee-simple-franchise        Owner operates under a brand franchise agreement
 *   3. fee-simple-hma              Owner hires a third-party manager (HMA)
 *   4. master-lease-tenant         We lease the property and operate it
 *   5. master-lease-landlord       We own the property and lease to an operator
 *   6. hybrid-hma-franchise        Soft-brand: brand franchise + 3rd-party HMA
 *
 * Each structure carries:
 *   - feeOverlay: replaces the property's baseline management/brand fees
 *   - lease: rent terms (only meaningful for the two lease modes)
 *   - capexFactor: multiplier on FF&E reserve (some structures shift capex)
 *   - cashFlowMode: "operating" | "leaseTenant" | "leaseLandlord"
 *   - riskProfile: qualitative downside (used for "what changes" callout)
 *   - keyTerms: human-readable contract clauses for the comparison table
 *
 * REGISTRY-BACKED RESOLUTION
 * --------------------------
 * Every numeric scalar that varies by country (royalty %, HMA base/incentive,
 * lease base/percentage rent, escalator, operator-take cap, capex factor) is
 * registered in `MODEL_CONSTANTS_REGISTRY` via the keys defined in
 * `constants-operating-structures-data.ts`. `getOperatingStructureOverlay()`
 * resolves these scalars through `getFactoryNumber()` so admin overrides and
 * future canonical-DB rows automatically flow through. Qualitative fields
 * (risk tier, downside haircut, label, description, key terms) remain in
 * code because they are calibration estimates with no per-country variance
 * surface today.
 */

import { getFactoryNumber } from "./model-constants-registry.js";
import type { StructureOverlayKey } from "./constants-operating-structures-data.js";

export type OperatingStructureId =
  | "fee-simple-independent"
  | "fee-simple-franchise"
  | "fee-simple-hma"
  | "master-lease-tenant"
  | "master-lease-landlord"
  | "hybrid-hma-franchise";

export type CashFlowMode = "operating" | "leaseTenant" | "leaseLandlord";

export type RiskTier = "low" | "medium" | "high" | "very-high";

export interface FeeOverlay {
  /** Brand royalty as a fraction of room revenue. */
  brandRoyaltyOnRooms: number;
  /** Marketing fund contribution as a fraction of room revenue. */
  brandMarketingOnRooms: number;
  /** Reservation/loyalty fee as a fraction of room revenue. */
  brandReservationOnRooms: number;
  /** HMA base fee as a fraction of total revenue (replaces baselineMgmtBase). */
  hmaBaseOnTotalRevenue: number;
  /** HMA incentive fee as a fraction of GOP (replaces baselineMgmtIncentive). */
  hmaIncentiveOnGop: number;
  /** Whether to keep the property's existing baseManagementFeeRate at all. */
  keepBaselineMgmtFee: boolean;
}

export interface LeaseTerms {
  /** Annual base rent as fraction of stabilized revenueTotal (Year-3 average). */
  baseRentRevenueShare: number;
  /** Percentage rent on incremental revenue above base. */
  percentageRentOnRevenue: number;
  /** Annual escalator on base rent (applies after Year 1). */
  rentEscalator: number;
  /**
   * Operator-take cap as fraction of GOP — landlord receives the rest. Only
   * meaningful for `leaseLandlord` mode (caps tenant operating margin).
   */
  operatorTakeCapOfGop: number;
}

export interface OperatingStructureDefaults {
  id: OperatingStructureId;
  label: string;
  shortLabel: string;
  description: string;
  cashFlowMode: CashFlowMode;
  feeOverlay: FeeOverlay;
  /** Multiplier applied to baseline FF&E reserve (1 = same; 0 = shifted to operator/landlord). */
  capexFactor: number;
  /** Lease terms — only used when `cashFlowMode` is a lease mode. */
  lease?: LeaseTerms;
  riskProfile: RiskTier;
  /** Stress factor on NOI under downside scenario (e.g. 0.30 = -30%). */
  downsideNoiHaircut: number;
  /** Human-readable contract terms for the comparison table. */
  keyTerms: string[];
}

/**
 * Optional per-structure override patch supplied by callers (e.g. the
 * scenario editor). Any field not provided falls through to the
 * registry-resolved value. Deep-merged onto the resolved overlay by
 * `mergeStructureOverlay()` below — used by both the calc layer (for the
 * `overlays` request field) and any future per-scenario persistence.
 */
export interface StructureOverlayPatch {
  feeOverlay?: Partial<FeeOverlay>;
  lease?: Partial<LeaseTerms>;
  capexFactor?: number;
  downsideNoiHaircut?: number;
}

interface QualitativeDefaults {
  id: OperatingStructureId;
  label: string;
  shortLabel: string;
  description: string;
  cashFlowMode: CashFlowMode;
  riskProfile: RiskTier;
  downsideNoiHaircut: number;
  keepBaselineMgmtFee: boolean;
  keyTerms: string[];
  hasLease: boolean;
}

/**
 * Per-structure qualitative data (label, description, risk tier, key terms).
 * Numeric overlay values are sourced from `MODEL_CONSTANTS_REGISTRY` via the
 * scalar-key map below.
 */
const QUALITATIVE: Record<OperatingStructureId, QualitativeDefaults> = {
  "fee-simple-independent": {
    id: "fee-simple-independent",
    label: "Fee-Simple Independent",
    shortLabel: "Independent",
    description:
      "Owner holds fee-simple title and operates the hotel directly with in-house staff. No brand affiliation, no third-party manager.",
    cashFlowMode: "operating",
    riskProfile: "high",
    downsideNoiHaircut: 0.35,
    keepBaselineMgmtFee: true,
    keyTerms: [
      "No brand fees",
      "Owner controls all operating decisions",
      "Full demand-generation burden falls on owner",
    ],
    hasLease: false,
  },
  "fee-simple-franchise": {
    id: "fee-simple-franchise",
    label: "Fee-Simple Franchise",
    shortLabel: "Franchise",
    description:
      "Owner operates under a brand franchise agreement (Marriott, Hilton, IHG, etc.). Owner is operator; brand provides flag, reservations, and standards.",
    cashFlowMode: "operating",
    riskProfile: "medium",
    downsideNoiHaircut: 0.25,
    keepBaselineMgmtFee: true,
    keyTerms: [
      "5.5% royalty on rooms revenue",
      "4% marketing fund + 2% reservation fee",
      "Brand PIP every 5–7 years",
      "Typical 15–20 year initial term",
    ],
    hasLease: false,
  },
  "fee-simple-hma": {
    id: "fee-simple-hma",
    label: "Fee-Simple HMA",
    shortLabel: "HMA",
    description:
      "Owner hires a third-party hotel management company under a Hotel Management Agreement. Operator is independent of any brand.",
    cashFlowMode: "operating",
    riskProfile: "medium",
    downsideNoiHaircut: 0.25,
    keepBaselineMgmtFee: false,
    keyTerms: [
      "3% base fee on total revenue",
      "10% incentive fee on GOP after priority return",
      "Owner retains all upside above incentive threshold",
      "Typical 10–20 year term with termination rights",
    ],
    hasLease: false,
  },
  "master-lease-tenant": {
    id: "master-lease-tenant",
    label: "Master Lease (Tenant)",
    shortLabel: "Lease (Tenant)",
    description:
      "We lease the property from a separate landlord and operate it. Pay fixed base rent + percentage rent; capture all operating upside above rent.",
    cashFlowMode: "leaseTenant",
    riskProfile: "very-high",
    downsideNoiHaircut: 0.55,
    keepBaselineMgmtFee: true,
    keyTerms: [
      "18% base rent on stabilized revenue",
      "6% percentage rent on incremental revenue",
      "2% annual rent escalator",
      "Tenant captures operating upside but bears fixed-rent downside",
    ],
    hasLease: true,
  },
  "master-lease-landlord": {
    id: "master-lease-landlord",
    label: "Master Lease (Landlord)",
    shortLabel: "Lease (Landlord)",
    description:
      "We own the property fee-simple and lease it to an independent operating tenant. Receive fixed base rent + percentage rent.",
    cashFlowMode: "leaseLandlord",
    riskProfile: "low",
    downsideNoiHaircut: 0.10,
    keepBaselineMgmtFee: false,
    keyTerms: [
      "Receive 18% base rent on stabilized revenue",
      "6% percentage rent on incremental revenue",
      "2% annual escalator + tenant credit risk",
      "No operating upside; passive cash flow",
    ],
    hasLease: true,
  },
  "hybrid-hma-franchise": {
    id: "hybrid-hma-franchise",
    label: "Hybrid HMA + Franchise",
    shortLabel: "HMA + Franchise",
    description:
      "Soft-brand model: owner takes a brand franchise AND hires a third-party manager. Highest fee load but combines brand distribution with operator expertise.",
    cashFlowMode: "operating",
    riskProfile: "medium",
    downsideNoiHaircut: 0.28,
    keepBaselineMgmtFee: false,
    keyTerms: [
      "4.5% royalty + 3% marketing + 1.5% reservation",
      "2.5% HMA base + 8% incentive on GOP",
      "Brand distribution + professional operator",
      "Highest aggregate fee load (~12–14% of revenue)",
    ],
    hasLease: false,
  },
};

/**
 * Map each structure to the registry keys that compose its overlay. Lookup
 * is via `getFactoryNumber(key, country)` so admin overrides per country
 * automatically apply.
 */
interface StructureScalarKeys {
  brandRoyaltyOnRooms?: StructureOverlayKey;
  brandMarketingOnRooms?: StructureOverlayKey;
  brandReservationOnRooms?: StructureOverlayKey;
  hmaBaseOnTotalRevenue?: StructureOverlayKey;
  hmaIncentiveOnGop?: StructureOverlayKey;
  capexFactor?: StructureOverlayKey;
  leaseBaseRentRevenueShare?: StructureOverlayKey;
  leasePercentageRentOnRevenue?: StructureOverlayKey;
  leaseRentEscalator?: StructureOverlayKey;
  leaseOperatorTakeCapOfGop?: StructureOverlayKey;
}

const STRUCTURE_SCALAR_KEYS: Record<OperatingStructureId, StructureScalarKeys> = {
  "fee-simple-independent": {
    // No fees, default capex factor
  },
  "fee-simple-franchise": {
    brandRoyaltyOnRooms: "franchiseBrandRoyaltyOnRooms",
    brandMarketingOnRooms: "franchiseBrandMarketingOnRooms",
    brandReservationOnRooms: "franchiseBrandReservationOnRooms",
    capexFactor: "franchiseCapexFactor",
  },
  "fee-simple-hma": {
    hmaBaseOnTotalRevenue: "hmaBaseFeeOnRevenue",
    hmaIncentiveOnGop: "hmaIncentiveFeeOnGop",
  },
  "master-lease-tenant": {
    capexFactor: "masterLeaseTenantCapexFactor",
    leaseBaseRentRevenueShare: "masterLeaseBaseRentRevenueShare",
    leasePercentageRentOnRevenue: "masterLeasePercentageRentOnRevenue",
    leaseRentEscalator: "masterLeaseRentEscalator",
  },
  "master-lease-landlord": {
    capexFactor: "masterLeaseLandlordCapexFactor",
    leaseBaseRentRevenueShare: "masterLeaseBaseRentRevenueShare",
    leasePercentageRentOnRevenue: "masterLeasePercentageRentOnRevenue",
    leaseRentEscalator: "masterLeaseRentEscalator",
    leaseOperatorTakeCapOfGop: "masterLeaseOperatorTakeCapOfGop",
  },
  "hybrid-hma-franchise": {
    brandRoyaltyOnRooms: "softBrandRoyaltyOnRooms",
    brandMarketingOnRooms: "softBrandMarketingOnRooms",
    brandReservationOnRooms: "softBrandReservationOnRooms",
    hmaBaseOnTotalRevenue: "hybridHmaBaseFeeOnRevenue",
    hmaIncentiveOnGop: "hybridHmaIncentiveFeeOnGop",
    capexFactor: "hybridCapexFactor",
  },
};

const ZERO_FEE_OVERLAY: Omit<FeeOverlay, "keepBaselineMgmtFee"> = {
  brandRoyaltyOnRooms: 0,
  brandMarketingOnRooms: 0,
  brandReservationOnRooms: 0,
  hmaBaseOnTotalRevenue: 0,
  hmaIncentiveOnGop: 0,
};

const DEFAULT_OPERATOR_TAKE_CAP_OF_GOP = 1.0;
const DEFAULT_CAPEX_FACTOR = 1.0;

/**
 * Resolve the structure overlay for a country. Numeric scalars come from
 * the model-constants registry (which honours admin overrides + canonical
 * rows); qualitative fields come from the in-code QUALITATIVE table.
 *
 * Returns a fresh object — safe to mutate.
 */
export function getOperatingStructureOverlay(
  structure: OperatingStructureId,
  country?: string | null,
): OperatingStructureDefaults {
  const q = QUALITATIVE[structure];
  const keys = STRUCTURE_SCALAR_KEYS[structure];
  const read = (k: StructureOverlayKey | undefined, fallback: number): number =>
    k ? getFactoryNumber(k, country ?? null) : fallback;

  const feeOverlay: FeeOverlay = {
    brandRoyaltyOnRooms: read(keys.brandRoyaltyOnRooms, ZERO_FEE_OVERLAY.brandRoyaltyOnRooms),
    brandMarketingOnRooms: read(keys.brandMarketingOnRooms, ZERO_FEE_OVERLAY.brandMarketingOnRooms),
    brandReservationOnRooms: read(keys.brandReservationOnRooms, ZERO_FEE_OVERLAY.brandReservationOnRooms),
    hmaBaseOnTotalRevenue: read(keys.hmaBaseOnTotalRevenue, ZERO_FEE_OVERLAY.hmaBaseOnTotalRevenue),
    hmaIncentiveOnGop: read(keys.hmaIncentiveOnGop, ZERO_FEE_OVERLAY.hmaIncentiveOnGop),
    keepBaselineMgmtFee: q.keepBaselineMgmtFee,
  };

  const capexFactor = read(keys.capexFactor, DEFAULT_CAPEX_FACTOR);

  const lease: LeaseTerms | undefined = q.hasLease
    ? {
        baseRentRevenueShare: read(keys.leaseBaseRentRevenueShare, 0),
        percentageRentOnRevenue: read(keys.leasePercentageRentOnRevenue, 0),
        rentEscalator: read(keys.leaseRentEscalator, 0),
        operatorTakeCapOfGop: read(
          keys.leaseOperatorTakeCapOfGop,
          DEFAULT_OPERATOR_TAKE_CAP_OF_GOP,
        ),
      }
    : undefined;

  return {
    id: q.id,
    label: q.label,
    shortLabel: q.shortLabel,
    description: q.description,
    cashFlowMode: q.cashFlowMode,
    feeOverlay,
    capexFactor,
    lease,
    riskProfile: q.riskProfile,
    downsideNoiHaircut: q.downsideNoiHaircut,
    keyTerms: q.keyTerms,
  };
}

/**
 * Deep-merge a scenario `patch` onto an already-resolved structure overlay.
 * Any field omitted from the patch falls through to the resolved value.
 */
export function mergeStructureOverlay(
  base: OperatingStructureDefaults,
  patch: StructureOverlayPatch | undefined,
): OperatingStructureDefaults {
  if (!patch) return base;
  return {
    ...base,
    feeOverlay: { ...base.feeOverlay, ...(patch.feeOverlay ?? {}) },
    lease: base.lease
      ? { ...base.lease, ...(patch.lease ?? {}) }
      : patch.lease
        ? ({ ...patch.lease } as LeaseTerms)
        : undefined,
    capexFactor: patch.capexFactor ?? base.capexFactor,
    downsideNoiHaircut: patch.downsideNoiHaircut ?? base.downsideNoiHaircut,
  };
}

export const OPERATING_STRUCTURE_IDS: OperatingStructureId[] = [
  "fee-simple-independent",
  "fee-simple-franchise",
  "fee-simple-hma",
  "master-lease-tenant",
  "master-lease-landlord",
  "hybrid-hma-franchise",
];

/**
 * USA-baseline snapshot for UI affordances that need a synchronous, country-
 * agnostic label/description map (e.g. toggle row, key-terms cards). For any
 * computation that depends on per-country numeric values, call
 * `getOperatingStructureOverlay(structure, country)` instead — that path
 * honours admin overrides via the registry.
 */
export const OPERATING_STRUCTURE_DEFAULTS: Record<OperatingStructureId, OperatingStructureDefaults> =
  Object.fromEntries(
    OPERATING_STRUCTURE_IDS.map((id) => [id, getOperatingStructureOverlay(id, null)]),
  ) as Record<OperatingStructureId, OperatingStructureDefaults>;
