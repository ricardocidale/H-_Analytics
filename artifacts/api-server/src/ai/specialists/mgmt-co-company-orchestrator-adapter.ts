/**
 * mgmt-co-company-orchestrator-adapter.ts — comparables and evidence adapter
 * for the Company Specialist's Tier-1 graduation (Phase 2 of P7-B).
 *
 * Exports:
 *   - `CompanyComparableRow` — one boutique-luxury ManCo's financial defaults snapshot
 *   - `getCannedCompanyComparables()` — 12-entry canned dataset
 *   - `companyComparableToEvidence()` — pure converter to Evidence row
 */

import type { Evidence } from "@engine/analyst/contracts/verdict";
import { BENCHMARK_COMPANY_TAX_RATE_MID } from "../../constants";

// ────────────────────────────────────────────────────────────────────────────
// Comparable shape

export interface CompanyComparableRow {
  operator: string;
  locale: string;
  vertical: string;
  propertyCount: number;
  /** Base management fee as a fraction (e.g. 0.08 = 8% of revenue). */
  baseManagementFee: number;
  /** Incentive management fee as a fraction (e.g. 0.10 = 10% of GOP). */
  incentiveManagementFee: number;
  /** Effective combined corporate income tax rate as a fraction. */
  companyTaxRate: number;
  /** Cost of equity / DCF Re as a fraction. */
  costOfEquity: number;
  vintage: number;
  source: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Canned dataset

export function getCannedCompanyComparables(): readonly CompanyComparableRow[] {
  return [
    // ── Founder-led (3-5 properties) ──────────────────────────────────────
    {
      operator: "Founder Boutique ManCo A",
      locale: "US",
      vertical: "boutique-luxury",
      propertyCount: 4,
      baseManagementFee: 0.06,
      incentiveManagementFee: 0.09,
      companyTaxRate: 0.25,
      costOfEquity: 0.17,
      vintage: 2023,
      source: "CBRE Hotel Management Fee Study 2023 (illustrative)",
    },
    {
      operator: "Wellness Operator ManCo B",
      locale: "CO",
      vertical: "wellness",
      propertyCount: 5,
      baseManagementFee: 0.07,
      incentiveManagementFee: 0.10,
      companyTaxRate: BENCHMARK_COMPANY_TAX_RATE_MID,
      costOfEquity: 0.18,
      vintage: 2023,
      source: "HVS Latam ManCo Survey 2023 (illustrative)",
    },
    {
      operator: "Lifestyle Boutique ManCo C",
      locale: "MX",
      vertical: "lifestyle",
      propertyCount: 3,
      baseManagementFee: 0.065,
      incentiveManagementFee: 0.09,
      companyTaxRate: 0.22,
      costOfEquity: 0.19,
      vintage: 2023,
      source: "HVS Latam ManCo Survey 2023 (illustrative)",
    },
    // ── Expansion stage (6-12 properties) ─────────────────────────────────
    {
      operator: "Expansion Platform ManCo D",
      locale: "US",
      vertical: "boutique-luxury",
      propertyCount: 9,
      baseManagementFee: 0.08,
      incentiveManagementFee: 0.10,
      companyTaxRate: 0.26,
      costOfEquity: 0.16,
      vintage: 2024,
      source: "HVS Management Contract Study 2024 (illustrative)",
    },
    {
      operator: "Latam Boutique Group ManCo E",
      locale: "BR",
      vertical: "boutique-luxury",
      propertyCount: 7,
      baseManagementFee: 0.075,
      incentiveManagementFee: 0.10,
      companyTaxRate: 0.28,
      costOfEquity: 0.20,
      vintage: 2023,
      source: "FOHB Latam Operator Benchmarks 2023 (illustrative)",
    },
    {
      operator: "Med Europe Lifestyle ManCo F",
      locale: "PT",
      vertical: "lifestyle",
      propertyCount: 8,
      baseManagementFee: 0.08,
      incentiveManagementFee: 0.11,
      companyTaxRate: 0.23,
      costOfEquity: 0.17,
      vintage: 2023,
      source: "HVS European ManCo Index 2023 (illustrative)",
    },
    {
      operator: "Mountain Resort ManCo G",
      locale: "US",
      vertical: "wellness",
      propertyCount: 10,
      baseManagementFee: 0.085,
      incentiveManagementFee: 0.10,
      companyTaxRate: 0.27,
      costOfEquity: 0.16,
      vintage: 2024,
      source: "AHLA Lodging Industry Survey 2024 (illustrative)",
    },
    // ── Institutional scale (13-25 properties) ────────────────────────────
    {
      operator: "Institutional Platform ManCo H",
      locale: "US",
      vertical: "boutique-luxury",
      propertyCount: 18,
      baseManagementFee: 0.09,
      incentiveManagementFee: 0.115,
      companyTaxRate: 0.27,
      costOfEquity: 0.15,
      vintage: 2024,
      source: "CBRE Hotel Management Fee Study 2024 (illustrative)",
    },
    {
      operator: "Multi-Market Platform ManCo I",
      locale: "ES",
      vertical: "boutique-luxury",
      propertyCount: 16,
      baseManagementFee: 0.085,
      incentiveManagementFee: 0.11,
      companyTaxRate: 0.25,
      costOfEquity: 0.16,
      vintage: 2023,
      source: "HVS European ManCo Index 2023 (illustrative)",
    },
    {
      operator: "Latam Institutional ManCo J",
      locale: "BR",
      vertical: "boutique-luxury",
      propertyCount: 14,
      baseManagementFee: 0.08,
      incentiveManagementFee: 0.10,
      companyTaxRate: 0.29,
      costOfEquity: 0.21,
      vintage: 2024,
      source: "FOHB Latam Operator Benchmarks 2024 (illustrative)",
    },
    {
      operator: "European Lifestyle ManCo K",
      locale: "IT",
      vertical: "lifestyle",
      propertyCount: 22,
      baseManagementFee: 0.09,
      incentiveManagementFee: 0.12,
      companyTaxRate: BENCHMARK_COMPANY_TAX_RATE_MID,
      costOfEquity: 0.16,
      vintage: 2024,
      source: "HVS European ManCo Index 2024 (illustrative)",
    },
    // ── Founder-lean counterexample ────────────────────────────────────────
    {
      operator: "Lean Founder ManCo L",
      locale: "US",
      vertical: "boutique-luxury",
      propertyCount: 12,
      baseManagementFee: 0.07,
      incentiveManagementFee: 0.095,
      companyTaxRate: 0.26,
      costOfEquity: 0.18,
      vintage: 2023,
      source: "AHLA Lodging Industry Survey 2023 (illustrative)",
    },
  ];
}

// ────────────────────────────────────────────────────────────────────────────
// Comparable → Evidence converter

export function companyComparableToEvidence(row: CompanyComparableRow): Evidence {
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  return {
    source:
      `Company: ${row.operator} — ${row.locale} (${row.vertical}, ${row.propertyCount} props) ` +
      `— baseFee ${pct(row.baseManagementFee)}, incentiveFee ${pct(row.incentiveManagementFee)}, ` +
      `taxRate ${pct(row.companyTaxRate)}, Re ${pct(row.costOfEquity)} | ` +
      `${row.vintage} | ${row.source}`,
    tier: "db_table",
    asOf: `${row.vintage}-12-31`,
    personaFit: 0.82,
  };
}
