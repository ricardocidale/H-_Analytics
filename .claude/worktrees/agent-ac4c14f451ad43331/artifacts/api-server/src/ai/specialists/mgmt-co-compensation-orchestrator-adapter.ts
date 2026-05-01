/**
 * mgmt-co-compensation-orchestrator-adapter.ts — adapter contracts for the
 * Compensation Specialist's Tier-1 graduation (G3 of ADR-007).
 *
 * Mirrors mgmt-co-revenue-orchestrator-adapter.ts — same pattern, same
 * boundaries. Exports:
 *
 *   - `CompensationComparableRow` — one boutique-luxury ManCo's comp snapshot
 *   - `getCannedCompensationComparables()` — 12-entry canned dataset for
 *     bring-up (representative profiles spanning founder-led to institutional
 *     scale, US + Latam + Mediterranean Europe)
 *   - `compensationComparableToEvidence()` — pure converter; threads each
 *     comp profile into the AnalystVerdict contract as an Evidence row
 *
 * Live hospitality comp survey API wiring follows in a future packet per
 * ADR-007. Sources are illustrative for v1 wiring validation.
 */

import type { Evidence } from "@engine/analyst/contracts/verdict";

// ────────────────────────────────────────────────────────────────────────────
// Comparable shape

/**
 * One boutique-luxury hospitality management company's compensation
 * snapshot. Captures partner trajectory + staff baseline + scale staffing.
 */
export interface CompensationComparableRow {
  /** Representative operator name (not necessarily the real brand). */
  operator: string;
  /** Primary operating locale ("US", "CO", "BR", "PT", "ES", "IT", "DO"). */
  locale: string;
  /** Operator vertical (e.g. "boutique-luxury", "wellness", "lifestyle"). */
  vertical: string;
  /** Property count at the time of the snapshot. */
  propertyCount: number;
  /** Year 1 total management compensation (annual USD). */
  partnerCompYear1Usd: number;
  /** Year 10 total management compensation (annual USD). */
  partnerCompYear10Usd: number;
  /** Partner headcount at Year 1. */
  partnerCountYear1: number;
  /** Average annual staff salary (USD per FTE). */
  staffSalaryUsd: number;
  /** Tier-3 (max-scale) FTE count. */
  staffTier3Fte: number;
  /** Vintage year of the snapshot. */
  vintage: number;
  /** Citable source (e.g. "AHLA Lodging Industry Survey 2023"). */
  source: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Canned dataset

/**
 * Canned boutique-luxury hospitality ManCo compensation comparables for G3
 * bring-up. 12 entries spanning founder-led (3-5 properties) → expansion
 * (6-12) → institutional (13-25) across US gateway markets, Latin America,
 * and Mediterranean Europe. Representative values drawn from publicly
 * available AHLA, HVS, and CBRE benchmark publications (2022-2024). Numbers
 * are illustrative for v1 wiring validation; live survey API integration
 * replaces this set in a follow-up packet.
 *
 * Range is intentionally wide so Opus reasons from diversity rather than
 * collapsing to a consensus (no mode-collapse).
 */
export function getCannedCompensationComparables(): readonly CompensationComparableRow[] {
  return [
    // ── Founder-led (3-5 properties) ──────────────────────────────────────
    {
      operator: "Founder Hotel Co A",
      locale: "US",
      vertical: "boutique-luxury",
      propertyCount: 4,
      partnerCompYear1Usd: 320_000,
      partnerCompYear10Usd: 720_000,
      partnerCountYear1: 2,
      staffSalaryUsd: 65_000,
      staffTier3Fte: 5,
      vintage: 2023,
      source: "AHLA Lodging Industry Survey 2023 (illustrative)",
    },
    {
      operator: "Boutique ManCo Co B",
      locale: "CO",
      vertical: "wellness",
      propertyCount: 5,
      partnerCompYear1Usd: 280_000,
      partnerCompYear10Usd: 680_000,
      partnerCountYear1: 3,
      staffSalaryUsd: 48_000,
      staffTier3Fte: 6,
      vintage: 2023,
      source: "COTELCO Latam ManCo Benchmarks 2023 (illustrative)",
    },
    {
      operator: "Wellness Operator Co C",
      locale: "MX",
      vertical: "wellness",
      propertyCount: 3,
      partnerCompYear1Usd: 360_000,
      partnerCompYear10Usd: 780_000,
      partnerCountYear1: 2,
      staffSalaryUsd: 52_000,
      staffTier3Fte: 5,
      vintage: 2023,
      source: "HVS Latam ManCo Survey 2023 (illustrative)",
    },
    // ── Expansion stage (6-12 properties) ─────────────────────────────────
    {
      operator: "Expansion Platform Co D",
      locale: "US",
      vertical: "lifestyle",
      propertyCount: 9,
      partnerCompYear1Usd: 540_000,
      partnerCompYear10Usd: 950_000,
      partnerCountYear1: 3,
      staffSalaryUsd: 78_000,
      staffTier3Fte: 8,
      vintage: 2024,
      source: "STR ManCo Compensation Index 2024 (illustrative)",
    },
    {
      operator: "Latam Boutique Group Co E",
      locale: "BR",
      vertical: "boutique-luxury",
      propertyCount: 7,
      partnerCompYear1Usd: 460_000,
      partnerCompYear10Usd: 880_000,
      partnerCountYear1: 3,
      staffSalaryUsd: 56_000,
      staffTier3Fte: 7,
      vintage: 2023,
      source: "FOHB Latam Operator Benchmarks 2023 (illustrative)",
    },
    {
      operator: "Med Europe Lifestyle Co F",
      locale: "PT",
      vertical: "lifestyle",
      propertyCount: 8,
      partnerCompYear1Usd: 500_000,
      partnerCompYear10Usd: 920_000,
      partnerCountYear1: 3,
      staffSalaryUsd: 72_000,
      staffTier3Fte: 8,
      vintage: 2023,
      source: "HVS European ManCo Index 2023 (illustrative)",
    },
    {
      operator: "Mountain Resort Operator Co G",
      locale: "US",
      vertical: "wellness",
      propertyCount: 10,
      partnerCompYear1Usd: 580_000,
      partnerCompYear10Usd: 1_050_000,
      partnerCountYear1: 4,
      staffSalaryUsd: 82_000,
      staffTier3Fte: 9,
      vintage: 2024,
      source: "STR ManCo Compensation Index 2024 (illustrative)",
    },
    // ── Institutional scale (13-25 properties) ────────────────────────────
    {
      operator: "Institutional Platform Co H",
      locale: "US",
      vertical: "boutique-luxury",
      propertyCount: 18,
      partnerCompYear1Usd: 780_000,
      partnerCompYear10Usd: 1_400_000,
      partnerCountYear1: 5,
      staffSalaryUsd: 95_000,
      staffTier3Fte: 11,
      vintage: 2024,
      source: "CBRE Hospitality C-Suite Survey 2024 (illustrative)",
    },
    {
      operator: "Multi-Market Platform Co I",
      locale: "ES",
      vertical: "boutique-luxury",
      propertyCount: 16,
      partnerCompYear1Usd: 700_000,
      partnerCompYear10Usd: 1_300_000,
      partnerCountYear1: 4,
      staffSalaryUsd: 88_000,
      staffTier3Fte: 10,
      vintage: 2023,
      source: "HVS European ManCo Index 2023 (illustrative)",
    },
    {
      operator: "Latam Institutional Co J",
      locale: "BR",
      vertical: "boutique-luxury",
      propertyCount: 14,
      partnerCompYear1Usd: 620_000,
      partnerCompYear10Usd: 1_180_000,
      partnerCountYear1: 4,
      staffSalaryUsd: 64_000,
      staffTier3Fte: 9,
      vintage: 2024,
      source: "FOHB Latam Operator Benchmarks 2024 (illustrative)",
    },
    {
      operator: "European Lifestyle Co K",
      locale: "IT",
      vertical: "lifestyle",
      propertyCount: 22,
      partnerCompYear1Usd: 880_000,
      partnerCompYear10Usd: 1_500_000,
      partnerCountYear1: 5,
      staffSalaryUsd: 90_000,
      staffTier3Fte: 12,
      vintage: 2024,
      source: "HVS European ManCo Index 2024 (illustrative)",
    },
    // ── Founder lean (counterexample — comp restraint at scale) ───────────
    {
      operator: "Founder-Lean Platform Co L",
      locale: "US",
      vertical: "boutique-luxury",
      propertyCount: 12,
      partnerCompYear1Usd: 380_000,
      partnerCompYear10Usd: 850_000,
      partnerCountYear1: 2,
      staffSalaryUsd: 70_000,
      staffTier3Fte: 7,
      vintage: 2023,
      source: "AHLA Lodging Industry Survey 2023 (illustrative)",
    },
  ];
}

// ────────────────────────────────────────────────────────────────────────────
// Comparable → Evidence converter

/**
 * Convert one CompensationComparableRow to one Evidence row. Used by the
 * runner to thread comparables through the AnalystVerdict contract — each
 * comparable becomes one Evidence entry with tier: "db_table".
 */
export function compensationComparableToEvidence(row: CompensationComparableRow): Evidence {
  const usd = (n: number) => `$${Math.round(n / 1000).toLocaleString("en-US")}K`;
  return {
    source:
      `Comp: ${row.operator} — ${row.locale} (${row.vertical}, ${row.propertyCount} props) ` +
      `— Y1 ${usd(row.partnerCompYear1Usd)}, Y10 ${usd(row.partnerCompYear10Usd)}, ` +
      `${row.partnerCountYear1}p, staff ${usd(row.staffSalaryUsd)}, T3 ${row.staffTier3Fte} FTE | ` +
      `${row.vintage} | ${row.source}`,
    tier: "db_table",
    asOf: `${row.vintage}-12-31`,
    personaFit: 0.82,
  };
}
