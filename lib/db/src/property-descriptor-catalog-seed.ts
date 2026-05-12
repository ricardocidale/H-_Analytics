// Code-defined seed for the property_descriptor_catalog table (task #1407,
// Milestone B). The catalog is migration-managed: this file is the single
// source of truth, and the 0054 migration replays it into the table.
//
// Each entry maps a logical descriptor key to:
//   - its temporal scope (identity / parallel / purchased_only / improved_only)
//   - its data type and display metadata for the read-only Knowledge &
//     Resources card
//   - the existing typed columns on `properties` so the accessor and
//     dual-write helpers can mirror the value into the JSONB blobs without
//     a backfill pass.
//
// To add a descriptor: append an entry here AND add the typed columns on the
// `properties` table (or rely on JSONB-only storage once Milestone B drops the
// dual-write window — see `deferred-milestone-b.md` step 7+).
import type { DescriptorCatalogEntry } from "./schema/property-descriptor-catalog";

export const PROPERTY_DESCRIPTOR_CATALOG: ReadonlyArray<DescriptorCatalogEntry> = [
  // ─── Identity (immutable across As-Purchased → As-Improved) ──────────────
  {
    fieldKey: "yearBuilt",
    groupName: "identity",
    scope: "identity",
    dataType: "int",
    unit: "year",
    displayLabel: "Year Built",
    helpText: "Original construction year. Does not change after renovation.",
    sortOrder: 10,
    typedColumnPurchased: "year_built",
  },
  {
    fieldKey: "locationType",
    groupName: "identity",
    scope: "identity",
    dataType: "text",
    displayLabel: "Location Type",
    helpText: "Urban / suburban / rural / resort. Geographic context, not a renovation outcome.",
    sortOrder: 20,
    typedColumnPurchased: "location_type",
  },
  {
    fieldKey: "marketTier",
    groupName: "identity",
    scope: "identity",
    dataType: "text",
    displayLabel: "Market Tier",
    helpText: "Primary / secondary / tertiary market classification.",
    sortOrder: 30,
    typedColumnPurchased: "market_tier",
  },

  // ─── Parallel (meaningful in BOTH As-Purchased and As-Improved) ──────────
  {
    fieldKey: "fbVenues",
    groupName: "envelope",
    scope: "parallel",
    dataType: "int",
    unit: "venues",
    displayLabel: "F&B Venues",
    helpText: "Number of food & beverage outlets on the property.",
    sortOrder: 100,
    typedColumnPurchased: "fb_venues",
    typedColumnImproved: "fb_venues_improved",
  },
  {
    fieldKey: "fbSeats",
    groupName: "envelope",
    scope: "parallel",
    dataType: "int",
    unit: "seats",
    displayLabel: "F&B Seating Capacity",
    helpText: "Total seating capacity across all F&B venues.",
    sortOrder: 110,
    typedColumnPurchased: "fb_seats",
    typedColumnImproved: "fb_seats_improved",
  },
  {
    fieldKey: "eventSpaceSqft",
    groupName: "envelope",
    scope: "parallel",
    dataType: "int",
    unit: "sqft",
    displayLabel: "Event Space (sq ft)",
    helpText: "Bookable event / meeting / banquet square footage.",
    sortOrder: 120,
    typedColumnPurchased: "event_space_sqft",
    typedColumnImproved: "event_space_sqft_improved",
  },
  {
    fieldKey: "totalBuildingSqft",
    groupName: "envelope",
    scope: "parallel",
    dataType: "int",
    unit: "sqft",
    displayLabel: "Total Building (sq ft)",
    helpText: "Conditioned/improved building footprint across all structures.",
    sortOrder: 130,
    typedColumnPurchased: "total_building_sqft",
    typedColumnImproved: "total_building_sqft_improved",
  },
  {
    fieldKey: "description",
    groupName: "narrative",
    scope: "parallel",
    dataType: "text",
    displayLabel: "Property Description",
    helpText: "Free-text narrative of the property's character and amenities.",
    sortOrder: 200,
    typedColumnPurchased: "description_purchased",
    typedColumnImproved: "description_improved",
  },

  // ─── Purchased-only (cannot change via renovation) ───────────────────────
  {
    fieldKey: "lastRenovationYear",
    groupName: "envelope",
    scope: "purchased_only",
    dataType: "int",
    unit: "year",
    displayLabel: "Last Renovation Year",
    helpText: "Year of the most recent renovation prior to acquisition.",
    sortOrder: 140,
    typedColumnPurchased: "last_renovation_year",
  },
  {
    fieldKey: "totalPropertyAcreage",
    groupName: "envelope",
    scope: "purchased_only",
    dataType: "float",
    unit: "acres",
    displayLabel: "Total Acreage",
    helpText: "Total land area in acres. Treated as fixed for the holding period.",
    sortOrder: 150,
    typedColumnPurchased: "total_property_acreage",
  },
  {
    fieldKey: "guestMixBusiness",
    groupName: "demand",
    scope: "purchased_only",
    dataType: "float",
    unit: "ratio",
    displayLabel: "Guest Mix — Business",
    helpText: "Share of room-nights from business travelers (0–1).",
    sortOrder: 300,
    typedColumnPurchased: "guest_mix_business",
  },
  {
    fieldKey: "guestMixLeisure",
    groupName: "demand",
    scope: "purchased_only",
    dataType: "float",
    unit: "ratio",
    displayLabel: "Guest Mix — Leisure",
    helpText: "Share of room-nights from leisure travelers (0–1).",
    sortOrder: 310,
    typedColumnPurchased: "guest_mix_leisure",
  },
  {
    fieldKey: "guestMixGroup",
    groupName: "demand",
    scope: "purchased_only",
    dataType: "float",
    unit: "ratio",
    displayLabel: "Guest Mix — Group",
    helpText: "Share of room-nights from group bookings (0–1).",
    sortOrder: 320,
    typedColumnPurchased: "guest_mix_group",
  },
  {
    fieldKey: "serviceLevel",
    groupName: "posture",
    scope: "purchased_only",
    dataType: "text",
    displayLabel: "Service Level",
    helpText: "Full service / select service / limited service.",
    sortOrder: 400,
    typedColumnPurchased: "service_level",
  },
  {
    fieldKey: "managementType",
    groupName: "posture",
    scope: "purchased_only",
    dataType: "text",
    displayLabel: "Management Type",
    helpText: "Owner-operated / third-party-managed / brand-managed.",
    sortOrder: 410,
    typedColumnPurchased: "management_type",
  },
  {
    fieldKey: "onMunicipalSewer",
    groupName: "posture",
    scope: "purchased_only",
    dataType: "bool",
    displayLabel: "On Municipal Sewer",
    helpText: "True if connected to municipal sewer; false if septic.",
    sortOrder: 420,
    typedColumnPurchased: "on_municipal_sewer",
  },

  // ─── Improved-only (only meaningful post-renovation) ─────────────────────
  {
    fieldKey: "plannedReopeningYear",
    groupName: "envelope",
    scope: "improved_only",
    dataType: "int",
    unit: "year",
    displayLabel: "Planned Reopening Year",
    helpText: "Calendar year the renovated property is projected to reopen.",
    sortOrder: 160,
    typedColumnImproved: "planned_reopening_year",
  },
];

/** Lookup map by fieldKey for O(1) access during dual-write / accessor. */
export const PROPERTY_DESCRIPTOR_CATALOG_BY_KEY: ReadonlyMap<string, DescriptorCatalogEntry> =
  new Map(PROPERTY_DESCRIPTOR_CATALOG.map((e) => [e.fieldKey, e]));

/** Subset that has an improved counterpart (parallel + improved_only). */
export const IMPROVABLE_DESCRIPTOR_KEYS: ReadonlyArray<string> =
  PROPERTY_DESCRIPTOR_CATALOG
    .filter((e) => e.scope === "parallel" || e.scope === "improved_only")
    .map((e) => e.fieldKey);
