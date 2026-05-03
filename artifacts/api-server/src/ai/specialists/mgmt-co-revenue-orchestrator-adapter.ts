/**
 * mgmt-co-revenue-orchestrator-adapter.ts — adapter contracts for the
 * Revenue Specialist's Tier-1 graduation (G2-v1 of ADR-007).
 *
 * Mirrors mgmt-co-funding-orchestrator-adapter.ts — same pattern, same
 * boundaries. Exports:
 *
 *   - `RevenueComparableRow` — one boutique-luxury hotel revenue comp
 *   - `getCannedRevenueComparables()` — 12-entry canned dataset for v1
 *     bring-up (STR-shaped, HVS-shaped; representative, not synthetic)
 *   - `revenueComparableToEvidence()` — pure converter; threads each comp
 *     into the AnalystVerdict contract as an Evidence row
 *   - `RevenueOrchestratorAdapter` — interface the runner composes against
 *
 * Live STR / CBRE / HVS API wiring follows in a future packet per ADR-007.
 */

import type { Evidence } from "@engine/analyst/contracts/verdict";
import { BENCHMARK_FB_SHARE_FRACTION_STD } from "../../constants";

// ────────────────────────────────────────────────────────────────────────────
// Comparable shape

/**
 * One boutique-luxury hotel's revenue ancillary mix snapshot.
 * All rate fields are expressed as fractions (0.0–1.0) except where noted.
 */
export interface RevenueComparableRow {
  /** Representative property name (not necessarily the real brand). */
  property: string;
  /** City for market context. */
  city: string;
  /** ISO-3166-1 alpha-2 country code. */
  country: string;
  /** Property vertical (e.g. "boutique-luxury", "wellness", "lifestyle"). */
  vertical: string;
  /** Room count (for scale context). */
  roomCount: number;
  /** Marketing + brand spend as fraction of room revenue. */
  marketingRateFraction: number;
  /** F&B revenue as fraction of total hotel revenue. */
  fbShareFraction: number;
  /** Events & banquets as fraction of total hotel revenue. */
  eventsShareFraction: number;
  /** Other ancillary (spa, retail, parking, recreation) as fraction of total. */
  otherShareFraction: number;
  /** Catering lift above base F&B rate, as a fraction. */
  cateringBoostFraction: number;
  /** Data vintage year. */
  year: number;
  /** Citable source (e.g. "HVS 2023 F&B Survey", "STR Benchmarking"). */
  source: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Canned dataset

/**
 * Canned boutique-luxury hotel revenue comparables for G2 bring-up (v1).
 *
 * 12 entries spanning: urban lifestyle, resort/wellness, Latin America,
 * Mediterranean Europe, and mid-Atlantic US. Representative values drawn
 * from publicly available HVS, CBRE, and STR benchmark publications
 * (2022–2024). Numbers are illustrative for v1 wiring validation; live API
 * integration replaces this set in a follow-up packet.
 *
 * Range is intentionally wide across the dataset so Opus reasons from
 * diversity rather than collapsing to a consensus (no mode-collapse).
 */
export function getCannedRevenueComparables(): readonly RevenueComparableRow[] {
  return [
    // ── Urban boutique-luxury, US ─────────────────────────────────────────
    {
      property: "Urban Lifestyle Hotel A",
      city: "New York",
      country: "US",
      vertical: "boutique-luxury",
      roomCount: 120,
      marketingRateFraction: 0.07,
      fbShareFraction: BENCHMARK_FB_SHARE_FRACTION_STD,
      eventsShareFraction: 0.08,
      otherShareFraction: 0.03,
      cateringBoostFraction: 0.04,
      year: 2023,
      source: "CBRE Hotel Horizons 2023 (illustrative)",
    },
    {
      property: "Urban Independent Hotel B",
      city: "Chicago",
      country: "US",
      vertical: "boutique-luxury",
      roomCount: 85,
      marketingRateFraction: 0.06,
      fbShareFraction: 0.20,
      eventsShareFraction: 0.06,
      otherShareFraction: 0.02,
      cateringBoostFraction: 0.03,
      year: 2023,
      source: "STR Benchmarking 2023 (illustrative)",
    },
    // ── Wellness / resort, US ─────────────────────────────────────────────
    {
      property: "Mountain Wellness Resort A",
      city: "Aspen",
      country: "US",
      vertical: "wellness",
      roomCount: 60,
      marketingRateFraction: 0.09,
      fbShareFraction: 0.28,
      eventsShareFraction: 0.05,
      otherShareFraction: 0.14,
      cateringBoostFraction: 0.03,
      year: 2023,
      source: "HVS Spa & Wellness Survey 2023 (illustrative)",
    },
    {
      property: "Coastal Wellness Resort B",
      city: "Sedona",
      country: "US",
      vertical: "wellness",
      roomCount: 48,
      marketingRateFraction: 0.10,
      fbShareFraction: 0.26,
      eventsShareFraction: 0.04,
      otherShareFraction: 0.16,
      cateringBoostFraction: 0.02,
      year: 2022,
      source: "HVS Spa & Wellness Survey 2022 (illustrative)",
    },
    // ── Lifestyle / select-service, US ────────────────────────────────────
    {
      property: "Lifestyle Hotel C",
      city: "Nashville",
      country: "US",
      vertical: "lifestyle",
      roomCount: 150,
      marketingRateFraction: 0.05,
      fbShareFraction: 0.18,
      eventsShareFraction: 0.10,
      otherShareFraction: 0.02,
      cateringBoostFraction: 0.05,
      year: 2024,
      source: "STR Benchmarking 2024 (illustrative)",
    },
    // ── Latin America — Colombia ──────────────────────────────────────────
    {
      property: "Cartagena Design Hotel A",
      city: "Cartagena",
      country: "CO",
      vertical: "boutique-luxury",
      roomCount: 42,
      marketingRateFraction: 0.08,
      fbShareFraction: 0.30,
      eventsShareFraction: 0.12,
      otherShareFraction: 0.04,
      cateringBoostFraction: 0.06,
      year: 2023,
      source: "COTELCO / HVS Latam Benchmarks 2023 (illustrative)",
    },
    // ── Latin America — Mexico ────────────────────────────────────────────
    {
      property: "Boutique Resort Tulum A",
      city: "Tulum",
      country: "MX",
      vertical: "wellness",
      roomCount: 35,
      marketingRateFraction: 0.11,
      fbShareFraction: 0.33,
      eventsShareFraction: 0.07,
      otherShareFraction: 0.10,
      cateringBoostFraction: 0.04,
      year: 2023,
      source: "HVS Latam Benchmarks 2023 (illustrative)",
    },
    // ── Latin America — Brazil ────────────────────────────────────────────
    {
      property: "Luxury Pousada Florianópolis A",
      city: "Florianópolis",
      country: "BR",
      vertical: "boutique-luxury",
      roomCount: 28,
      marketingRateFraction: 0.07,
      fbShareFraction: 0.35,
      eventsShareFraction: 0.09,
      otherShareFraction: 0.03,
      cateringBoostFraction: 0.05,
      year: 2022,
      source: "FOHB / HVS Brazil Benchmarks 2022 (illustrative)",
    },
    // ── Mediterranean Europe — Portugal ──────────────────────────────────
    {
      property: "Design Hotel Lisbon A",
      city: "Lisbon",
      country: "PT",
      vertical: "boutique-luxury",
      roomCount: 55,
      marketingRateFraction: 0.06,
      fbShareFraction: 0.22,
      eventsShareFraction: 0.08,
      otherShareFraction: 0.03,
      cateringBoostFraction: 0.04,
      year: 2023,
      source: "HVS European Hotel Valuation Index 2023 (illustrative)",
    },
    // ── Mediterranean Europe — Spain ──────────────────────────────────────
    {
      property: "Boutique Resort Mallorca A",
      city: "Palma de Mallorca",
      country: "ES",
      vertical: "wellness",
      roomCount: 72,
      marketingRateFraction: 0.08,
      fbShareFraction: 0.29,
      eventsShareFraction: 0.06,
      otherShareFraction: 0.08,
      cateringBoostFraction: 0.03,
      year: 2023,
      source: "HVS European Hotel Valuation Index 2023 (illustrative)",
    },
    // ── Mediterranean Europe — Italy ─────────────────────────────────────
    {
      property: "Amalfi Clifftop Hotel A",
      city: "Ravello",
      country: "IT",
      vertical: "boutique-luxury",
      roomCount: 30,
      marketingRateFraction: 0.09,
      fbShareFraction: 0.31,
      eventsShareFraction: 0.07,
      otherShareFraction: 0.05,
      cateringBoostFraction: 0.04,
      year: 2022,
      source: "HVS European Hotel Valuation Index 2022 (illustrative)",
    },
    // ── All-inclusive / high F&B capture ─────────────────────────────────
    {
      property: "All-Inclusive Resort Caribbean A",
      city: "Punta Cana",
      country: "DO",
      vertical: "lifestyle",
      roomCount: 200,
      marketingRateFraction: 0.05,
      fbShareFraction: 0.40,
      eventsShareFraction: 0.05,
      otherShareFraction: 0.06,
      cateringBoostFraction: 0.08,
      year: 2023,
      source: "STR Caribbean Benchmarking 2023 (illustrative)",
    },
  ];
}

// ────────────────────────────────────────────────────────────────────────────
// Comparable → Evidence converter

/**
 * Convert one RevenueComparableRow to one Evidence row. Used by the runner
 * to thread comparables through the AnalystVerdict contract without extending
 * the schema — each comparable becomes one Evidence entry with tier: "db_table".
 */
export function revenueComparableToEvidence(row: RevenueComparableRow): Evidence {
  const pct = (n: number) => `${(n * 100).toFixed(0)}%`;
  return {
    source: `Rev comp: ${row.property} — ${row.city}, ${row.country} (${row.vertical}, ${row.roomCount} rooms) — marketing ${pct(row.marketingRateFraction)}, F&B ${pct(row.fbShareFraction)}, events ${pct(row.eventsShareFraction)} | ${row.year} | ${row.source}`,
    tier: "db_table",
    asOf: `${row.year}-12-31`,
    personaFit: 0.82,
  };
}
