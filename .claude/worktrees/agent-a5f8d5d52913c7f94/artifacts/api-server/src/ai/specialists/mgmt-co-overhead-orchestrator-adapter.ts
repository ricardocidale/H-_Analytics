/**
 * mgmt-co-overhead-orchestrator-adapter.ts — adapter contracts for the
 * Overhead Specialist's Tier-1 graduation (Phase 2 of P7-B).
 *
 * Mirrors mgmt-co-compensation-orchestrator-adapter.ts — same pattern, same
 * boundaries. Exports:
 *
 *   - `OverheadComparableRow` — one boutique-luxury ManCo's overhead snapshot
 *   - `getCannedOverheadComparables()` — 12-entry canned dataset for
 *     bring-up (representative profiles spanning founder-led to institutional
 *     scale, US + Latam + Mediterranean Europe)
 *   - `overheadComparableToEvidence()` — pure converter; threads each
 *     overhead profile into the AnalystVerdict contract as an Evidence row
 *
 * Live hospitality overhead survey API wiring follows in Phase 3 per
 * ADR-007. Sources are illustrative for v1 wiring validation.
 */

import type { Evidence } from "@engine/analyst/contracts/verdict";

// ────────────────────────────────────────────────────────────────────────────
// Comparable shape

/**
 * One boutique-luxury hospitality management company's overhead snapshot.
 * Captures fixed-line annual spend + per-property variable lines. All USD.
 */
export interface OverheadComparableRow {
  /** Representative operator name (not necessarily the real brand). */
  operator: string;
  /** Primary operating locale ("US", "CO", "BR", "PT", "ES", "IT", "DO", "MX"). */
  locale: string;
  /** Operator vertical (e.g. "boutique-luxury", "wellness", "lifestyle"). */
  vertical: string;
  /** Property count at the time of the snapshot. */
  propertyCount: number;
  /** Annual office lease + utilities (USD). */
  officeLeaseUsd: number;
  /** Annual legal + accounting + audit (USD). */
  professionalServicesUsd: number;
  /** Annual corporate tech infrastructure (USD). */
  techInfraUsd: number;
  /** Annual business insurance — D&O/E&O/cyber (USD). */
  businessInsuranceUsd: number;
  /** Annual travel cost per managed property (USD/property). */
  travelCostPerClientUsd: number;
  /** Annual IT/licensing cost per managed property (USD/property). */
  itLicensePerClientUsd: number;
  /** Vintage year of the snapshot. */
  vintage: number;
  /** Citable source (e.g. "AHLA Lodging Industry Survey 2023"). */
  source: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Canned dataset

/**
 * Canned boutique-luxury hospitality ManCo overhead comparables for Phase 2
 * bring-up. 12 entries spanning founder-led (3-5 properties) → expansion
 * (6-12) → institutional (13-25) across US gateway markets, Latin America,
 * and Mediterranean Europe. Representative values drawn from publicly
 * available AHLA, HFTP, AICPA, and HVS benchmark publications (2022-2024).
 * Numbers are illustrative for v1 wiring validation; live survey API
 * integration replaces this set in a follow-up packet.
 *
 * Range is intentionally wide so Opus reasons from diversity rather than
 * collapsing to a consensus (no mode-collapse).
 */
export function getCannedOverheadComparables(): readonly OverheadComparableRow[] {
  return [
    // ── Founder-led (3-5 properties) ──────────────────────────────────────
    {
      operator: "Founder Hotel Co A",
      locale: "US",
      vertical: "boutique-luxury",
      propertyCount: 4,
      officeLeaseUsd: 28_000,
      professionalServicesUsd: 22_000,
      techInfraUsd: 14_000,
      businessInsuranceUsd: 9_500,
      travelCostPerClientUsd: 9_000,
      itLicensePerClientUsd: 2_400,
      vintage: 2023,
      source: "AHLA Lodging Industry Survey 2023 (illustrative)",
    },
    {
      operator: "Boutique ManCo Co B",
      locale: "CO",
      vertical: "wellness",
      propertyCount: 5,
      officeLeaseUsd: 22_000,
      professionalServicesUsd: 18_500,
      techInfraUsd: 12_500,
      businessInsuranceUsd: 8_500,
      travelCostPerClientUsd: 11_000,
      itLicensePerClientUsd: 2_800,
      vintage: 2023,
      source: "COTELCO Latam ManCo Benchmarks 2023 (illustrative)",
    },
    {
      operator: "Wellness Operator Co C",
      locale: "MX",
      vertical: "wellness",
      propertyCount: 3,
      officeLeaseUsd: 26_000,
      professionalServicesUsd: 20_000,
      techInfraUsd: 13_000,
      businessInsuranceUsd: 9_000,
      travelCostPerClientUsd: 12_000,
      itLicensePerClientUsd: 3_000,
      vintage: 2023,
      source: "HVS Latam ManCo Survey 2023 (illustrative)",
    },
    // ── Expansion stage (6-12 properties) ─────────────────────────────────
    {
      operator: "Expansion Platform Co D",
      locale: "US",
      vertical: "lifestyle",
      propertyCount: 9,
      officeLeaseUsd: 42_000,
      professionalServicesUsd: 30_000,
      techInfraUsd: 20_000,
      businessInsuranceUsd: 12_500,
      travelCostPerClientUsd: 13_500,
      itLicensePerClientUsd: 3_800,
      vintage: 2024,
      source: "STR ManCo Overhead Index 2024 (illustrative)",
    },
    {
      operator: "Latam Boutique Group Co E",
      locale: "BR",
      vertical: "boutique-luxury",
      propertyCount: 7,
      officeLeaseUsd: 32_000,
      professionalServicesUsd: 26_000,
      techInfraUsd: 17_000,
      businessInsuranceUsd: 10_000,
      travelCostPerClientUsd: 14_500,
      itLicensePerClientUsd: 3_400,
      vintage: 2023,
      source: "FOHB Latam Operator Benchmarks 2023 (illustrative)",
    },
    {
      operator: "Med Europe Lifestyle Co F",
      locale: "PT",
      vertical: "lifestyle",
      propertyCount: 8,
      officeLeaseUsd: 38_000,
      professionalServicesUsd: 28_000,
      techInfraUsd: 18_500,
      businessInsuranceUsd: 11_000,
      travelCostPerClientUsd: 12_500,
      itLicensePerClientUsd: 3_500,
      vintage: 2023,
      source: "HVS European ManCo Index 2023 (illustrative)",
    },
    {
      operator: "Mountain Resort Operator Co G",
      locale: "US",
      vertical: "wellness",
      propertyCount: 10,
      officeLeaseUsd: 40_000,
      professionalServicesUsd: 32_000,
      techInfraUsd: 21_000,
      businessInsuranceUsd: 13_500,
      travelCostPerClientUsd: 16_000,
      itLicensePerClientUsd: 4_000,
      vintage: 2024,
      source: "STR ManCo Overhead Index 2024 (illustrative)",
    },
    // ── Institutional scale (13-25 properties) ────────────────────────────
    {
      operator: "Institutional Platform Co H",
      locale: "US",
      vertical: "boutique-luxury",
      propertyCount: 18,
      officeLeaseUsd: 46_000,
      professionalServicesUsd: 36_000,
      techInfraUsd: 24_000,
      businessInsuranceUsd: 14_500,
      travelCostPerClientUsd: 15_000,
      itLicensePerClientUsd: 4_500,
      vintage: 2024,
      source: "CBRE Hospitality C-Suite Survey 2024 (illustrative)",
    },
    {
      operator: "Multi-Market Platform Co I",
      locale: "ES",
      vertical: "boutique-luxury",
      propertyCount: 16,
      officeLeaseUsd: 44_000,
      professionalServicesUsd: 34_000,
      techInfraUsd: 22_500,
      businessInsuranceUsd: 13_000,
      travelCostPerClientUsd: 14_000,
      itLicensePerClientUsd: 4_200,
      vintage: 2023,
      source: "HVS European ManCo Index 2023 (illustrative)",
    },
    {
      operator: "Latam Institutional Co J",
      locale: "BR",
      vertical: "boutique-luxury",
      propertyCount: 14,
      officeLeaseUsd: 36_000,
      professionalServicesUsd: 30_000,
      techInfraUsd: 19_000,
      businessInsuranceUsd: 11_500,
      travelCostPerClientUsd: 15_500,
      itLicensePerClientUsd: 3_700,
      vintage: 2024,
      source: "FOHB Latam Operator Benchmarks 2024 (illustrative)",
    },
    {
      operator: "European Lifestyle Co K",
      locale: "IT",
      vertical: "lifestyle",
      propertyCount: 22,
      officeLeaseUsd: 48_000,
      professionalServicesUsd: 36_000,
      techInfraUsd: 24_000,
      businessInsuranceUsd: 14_000,
      travelCostPerClientUsd: 13_000,
      itLicensePerClientUsd: 4_800,
      vintage: 2024,
      source: "HVS European ManCo Index 2024 (illustrative)",
    },
    // ── Founder lean (counterexample — overhead restraint at scale) ───────
    {
      operator: "Founder-Lean Platform Co L",
      locale: "US",
      vertical: "boutique-luxury",
      propertyCount: 12,
      officeLeaseUsd: 30_000,
      professionalServicesUsd: 24_000,
      techInfraUsd: 16_000,
      businessInsuranceUsd: 10_500,
      travelCostPerClientUsd: 10_000,
      itLicensePerClientUsd: 3_200,
      vintage: 2023,
      source: "AHLA Lodging Industry Survey 2023 (illustrative)",
    },
  ];
}

// ────────────────────────────────────────────────────────────────────────────
// Comparable → Evidence converter

/**
 * Convert one OverheadComparableRow to one Evidence row. Used by the
 * runner to thread comparables through the AnalystVerdict contract — each
 * comparable becomes one Evidence entry with tier: "db_table".
 */
export function overheadComparableToEvidence(row: OverheadComparableRow): Evidence {
  const k = (n: number) => `$${Math.round(n / 1000).toLocaleString("en-US")}K`;
  return {
    source:
      `Overhead: ${row.operator} — ${row.locale} (${row.vertical}, ${row.propertyCount} props) ` +
      `— office ${k(row.officeLeaseUsd)}, prof svcs ${k(row.professionalServicesUsd)}, ` +
      `tech ${k(row.techInfraUsd)}, ins ${k(row.businessInsuranceUsd)}, ` +
      `travel/client ${k(row.travelCostPerClientUsd)}, IT/client ${k(row.itLicensePerClientUsd)} | ` +
      `${row.vintage} | ${row.source}`,
    tier: "db_table",
    asOf: `${row.vintage}-12-31`,
    personaFit: 0.82,
  };
}
