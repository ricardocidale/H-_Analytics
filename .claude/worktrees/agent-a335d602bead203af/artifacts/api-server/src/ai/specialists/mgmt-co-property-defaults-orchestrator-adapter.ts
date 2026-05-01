/**
 * mgmt-co-property-defaults-orchestrator-adapter.ts — comparables and evidence
 * adapter for the Property-Defaults Specialist's Tier-1 graduation (Phase 2
 * of P7-B).
 *
 * Exports:
 *   - `PropertyDefaultsComparableRow` — one boutique-luxury property's
 *     underwriting defaults snapshot
 *   - `getCannedPropertyDefaultsComparables()` — 12-entry canned dataset
 *   - `propertyDefaultsComparableToEvidence()` — pure converter to Evidence row
 */

import type { Evidence } from "@engine/analyst/contracts/verdict";

// ────────────────────────────────────────────────────────────────────────────
// Comparable shape

export interface PropertyDefaultsComparableRow {
  propertyName: string;
  locale: string;
  vertical: string;
  roomCount: number;
  /** Event expense rate as a fraction of event revenue (e.g. 0.65 = 65%). */
  eventExpenseRate: number;
  /** Other expense rate as a fraction of other/ancillary revenue (e.g. 0.60 = 60%). */
  otherExpenseRate: number;
  /** Fraction of utilities treated as variable / occupancy-driven (e.g. 0.60 = 60%). */
  utilitiesVariableSplit: number;
  /** Blended distribution/OTA commission as fraction of total room revenue (e.g. 0.07 = 7%). */
  salesCommissionRate: number;
  vintage: number;
  source: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Canned dataset

export function getCannedPropertyDefaultsComparables(): readonly PropertyDefaultsComparableRow[] {
  return [
    // ── Boutique-luxury, US, 30-60 rooms ──────────────────────────────────
    {
      propertyName: "Boutique Mountain Lodge A",
      locale: "US",
      vertical: "boutique-luxury",
      roomCount: 42,
      eventExpenseRate: 0.62,
      otherExpenseRate: 0.56,
      utilitiesVariableSplit: 0.58,
      salesCommissionRate: 0.065,
      vintage: 2023,
      source: "CBRE Hotel Operations Report 2023 (illustrative)",
    },
    {
      propertyName: "Urban Boutique Property B",
      locale: "US",
      vertical: "boutique-luxury",
      roomCount: 55,
      eventExpenseRate: 0.67,
      otherExpenseRate: 0.61,
      utilitiesVariableSplit: 0.55,
      salesCommissionRate: 0.09,
      vintage: 2023,
      source: "AHLA Distribution Cost Study 2023 (illustrative)",
    },
    {
      propertyName: "Coastal Resort Boutique C",
      locale: "US",
      vertical: "wellness",
      roomCount: 38,
      eventExpenseRate: 0.60,
      otherExpenseRate: 0.52,
      utilitiesVariableSplit: 0.62,
      salesCommissionRate: 0.055,
      vintage: 2024,
      source: "Kalibri Labs Direct Booking Study 2024 (illustrative)",
    },
    // ── Boutique-luxury, Latam ─────────────────────────────────────────────
    {
      propertyName: "Boutique Andean Retreat D",
      locale: "CO",
      vertical: "boutique-luxury",
      roomCount: 30,
      eventExpenseRate: 0.64,
      otherExpenseRate: 0.58,
      utilitiesVariableSplit: 0.50,
      salesCommissionRate: 0.08,
      vintage: 2023,
      source: "HVS Latam Hotel Operations 2023 (illustrative)",
    },
    {
      propertyName: "Jungle Eco-Boutique E",
      locale: "BR",
      vertical: "wellness",
      roomCount: 25,
      eventExpenseRate: 0.70,
      otherExpenseRate: 0.65,
      utilitiesVariableSplit: 0.45,
      salesCommissionRate: 0.10,
      vintage: 2023,
      source: "FOHB Latam Operator Benchmarks 2023 (illustrative)",
    },
    {
      propertyName: "Colonial Heritage Hotel F",
      locale: "MX",
      vertical: "lifestyle",
      roomCount: 48,
      eventExpenseRate: 0.66,
      otherExpenseRate: 0.60,
      utilitiesVariableSplit: 0.53,
      salesCommissionRate: 0.075,
      vintage: 2024,
      source: "HVS Latam Hotel Operations 2024 (illustrative)",
    },
    // ── Boutique-luxury, Mediterranean Europe ─────────────────────────────
    {
      propertyName: "Boutique Quinta Portugal G",
      locale: "PT",
      vertical: "boutique-luxury",
      roomCount: 35,
      eventExpenseRate: 0.58,
      otherExpenseRate: 0.54,
      utilitiesVariableSplit: 0.65,
      salesCommissionRate: 0.07,
      vintage: 2023,
      source: "HVS European Hotel Benchmarks 2023 (illustrative)",
    },
    {
      propertyName: "Coastal Boutique Spain H",
      locale: "ES",
      vertical: "lifestyle",
      roomCount: 52,
      eventExpenseRate: 0.63,
      otherExpenseRate: 0.59,
      utilitiesVariableSplit: 0.60,
      salesCommissionRate: 0.095,
      vintage: 2024,
      source: "HVS European Hotel Benchmarks 2024 (illustrative)",
    },
    {
      propertyName: "Agriturismo Boutique Italy I",
      locale: "IT",
      vertical: "wellness",
      roomCount: 28,
      eventExpenseRate: 0.68,
      otherExpenseRate: 0.62,
      utilitiesVariableSplit: 0.48,
      salesCommissionRate: 0.085,
      vintage: 2023,
      source: "STR European Boutique Operations Survey 2023 (illustrative)",
    },
    // ── Direct-booking optimized counterexamples ───────────────────────────
    {
      propertyName: "Direct-Booking Leader US J",
      locale: "US",
      vertical: "boutique-luxury",
      roomCount: 45,
      eventExpenseRate: 0.61,
      otherExpenseRate: 0.57,
      utilitiesVariableSplit: 0.61,
      salesCommissionRate: 0.038,
      vintage: 2024,
      source: "Kalibri Labs Direct Booking Study 2024 (illustrative)",
    },
    {
      propertyName: "OTA-Heavy Urban Boutique K",
      locale: "US",
      vertical: "boutique-luxury",
      roomCount: 60,
      eventExpenseRate: 0.65,
      otherExpenseRate: 0.63,
      utilitiesVariableSplit: 0.56,
      salesCommissionRate: 0.118,
      vintage: 2023,
      source: "Phocuswright OTA Commission Report 2023 (illustrative)",
    },
    // ── Lean operator (low cost structure) ────────────────────────────────
    {
      propertyName: "Lean Boutique Operator L",
      locale: "US",
      vertical: "lifestyle",
      roomCount: 32,
      eventExpenseRate: 0.57,
      otherExpenseRate: 0.51,
      utilitiesVariableSplit: 0.67,
      salesCommissionRate: 0.042,
      vintage: 2024,
      source: "CBRE Hotel Operations Report 2024 (illustrative)",
    },
  ];
}

// ────────────────────────────────────────────────────────────────────────────
// Comparable → Evidence converter

export function propertyDefaultsComparableToEvidence(
  row: PropertyDefaultsComparableRow,
): Evidence {
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  return {
    source:
      `PropertyDefaults: ${row.propertyName} — ${row.locale} (${row.vertical}, ${row.roomCount} rooms) ` +
      `— eventExp ${pct(row.eventExpenseRate)}, otherExp ${pct(row.otherExpenseRate)}, ` +
      `utilVarSplit ${pct(row.utilitiesVariableSplit)}, salesComm ${pct(row.salesCommissionRate)} | ` +
      `${row.vintage} | ${row.source}`,
    tier: "db_table",
    asOf: `${row.vintage}-12-31`,
    personaFit: 0.82,
  };
}
