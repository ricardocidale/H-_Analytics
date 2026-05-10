/**
 * Reference Range seeder — capital structure and construction passes.
 *
 * Pass 6: Financing benchmarks (Table 2)
 * Pass 9: CAPEX / construction benchmarks (Table 5, Table 8)
 */

import { logger } from "../../logger";
import { TAG, YEAR, upsertRange } from "./helpers";

// ── Pass 6: Financing benchmarks (Table 2) ────────────────────────────────────

const FINANCING_BENCHMARKS: Array<{
  metricKey: string; label: string; country: string; segment?: string;
  low: number; mid: number; high: number; unit: string;
  source: string; sourceUrl?: string; methodology?: string;
}> = [
  // LTV
  { metricKey: "ltv-senior", label: "Senior Loan LTV — US Boutique Hotel",
    country: "US", segment: "boutique_hotel",
    low: 55.0, mid: 62.5, high: 70.0, unit: "percent",
    source: "CBRE Hotels Capital Markets / HVS Debt Survey 2024", sourceUrl: "https://www.cbre.com",
    methodology: "Senior construction/bridge lenders; stabilized perm closer to low end; value-add deals at high end" },
  { metricKey: "ltv-senior", label: "Senior Loan LTV — Southern Europe Hotel",
    country: "ES", segment: "boutique_hotel",
    low: 50.0, mid: 57.5, high: 65.0, unit: "percent",
    source: "HVS Europe / Cushman & Wakefield Hotels Finance 2024",
    methodology: "European lenders haircut appraised values harder; Spain/Italy/Greece typically more conservative than US" },
  // DSCR
  { metricKey: "dscr-minimum", label: "DSCR Minimum — US Hotel Senior Debt",
    country: "US",
    low: 1.20, mid: 1.30, high: 1.50, unit: "ratio",
    source: "CBRE Hotels / HVS Debt Survey 2024",
    methodology: "Minimum DSCR required for loan approval; stabilized TTM NOI ÷ annual debt service" },
  { metricKey: "dscr-minimum", label: "DSCR Minimum — European Hotel Senior Debt",
    country: "ES",
    low: 1.25, mid: 1.35, high: 1.60, unit: "ratio",
    source: "HVS Europe Hotels Debt Survey 2024" },
  // Debt yield
  { metricKey: "debt-yield-minimum", label: "Debt Yield Minimum — US Hotel Perm Loan",
    country: "US",
    low: 7.0, mid: 8.0, high: 9.5, unit: "percent",
    source: "CBRE Capital Markets Hotels 2024",
    methodology: "NOI ÷ Loan amount; lender floor for perm underwriting independent of rate environment" },
  // Interest rate spreads
  { metricKey: "interest-rate-bridge", label: "Bridge Loan Rate — US Hotel",
    country: "US",
    low: 7.0, mid: 8.5, high: 10.0, unit: "percent",
    source: "HVS / CBRE Hotels Capital Markets 2024",
    methodology: "All-in floating rate (SOFR + spread); SOFR ~5.3% + 175–300bps spread as of 2024" },
  { metricKey: "interest-rate-perm", label: "Permanent Loan Rate — US Hotel",
    country: "US",
    low: 6.5, mid: 7.5, high: 8.5, unit: "percent",
    source: "CBRE Hotels Capital Markets 2024",
    methodology: "Fixed rate agency or life-company perm; based on 10-yr Treasury + 250–350bps spread" },
  // Equity multiples
  { metricKey: "equity-multiple-target", label: "Equity Multiple Target — US Boutique Hotel",
    country: "US", segment: "boutique_hotel",
    low: 1.8, mid: 2.2, high: 2.8, unit: "multiple",
    source: "CBRE Hotels / HVS Investor Survey 2024",
    methodology: "Total equity distributions ÷ total equity invested over hold period (typically 5–7 years); IRR target 12–18% IRR" },
  { metricKey: "equity-multiple-target", label: "Equity Multiple Target — Southern Europe Boutique",
    country: "ES", segment: "boutique_hotel",
    low: 1.7, mid: 2.0, high: 2.5, unit: "multiple",
    source: "HVS Europe / Cushman & Wakefield Hotels Investor Survey 2024" },
  // Preferred equity / mezz spread
  { metricKey: "mezzanine-rate", label: "Mezzanine / Pref Equity Rate — US Hotel",
    country: "US",
    low: 12.0, mid: 14.0, high: 18.0, unit: "percent",
    source: "HVS / CBRE Hotels Capital Markets 2024",
    methodology: "All-in preferred return or mezz coupon; PIK or current-pay depending on structure" },
];

export async function seedFinancingBenchmarks(): Promise<void> {
  for (const r of FINANCING_BENCHMARKS) {
    await upsertRange({
      domain: "financing", metricKey: r.metricKey, label: r.label,
      country: r.country, segment: r.segment ?? null,
      year: YEAR,
      low: r.low, mid: r.mid, high: r.high, unit: r.unit,
      sourceName: r.source, sourceUrl: r.sourceUrl ?? null,
      methodology: r.methodology ?? null,
      confidence: r.sourceUrl ? "medium" : "low",
    });
  }
  logger.info(`Seeded financing benchmarks: ${FINANCING_BENCHMARKS.length} rows`, TAG);
}

// ── Pass 9: CAPEX / construction benchmarks (Table 5, Table 8) ───────────────

const CAPEX_BENCHMARKS: Array<{
  metricKey: string; label: string; country: string; segment?: string;
  low: number; mid: number; high: number; unit: string;
  source: string; sourceUrl?: string; methodology?: string;
}> = [
  // ── Annual FF&E reserve (Table 8) ──
  { metricKey: "ffe-reserve-annual", label: "Annual FF&E Reserve — Standard (% Gross Revenue)",
    country: "US",
    low: 4.0, mid: 4.5, high: 5.0, unit: "percent_of_revenue",
    source: "HVS / CBRE Hotels / Hotel Franchisors Standard 2024", sourceUrl: "https://www.hvs.com",
    methodology: "Annual set-aside for furniture, fixtures & equipment replacement; branded hotels have franchise-mandated minimums of 4–5%" },
  { metricKey: "ffe-reserve-annual", label: "Annual FF&E Reserve — Southern Europe",
    country: "ES",
    low: 3.0, mid: 4.0, high: 5.0, unit: "percent_of_revenue",
    source: "Horwath HTL Spain / HVS Europe 2024",
    methodology: "Similar to US standard; EU brands increasingly require contractual minimums" },
  // ── Catch-up/PIP cycle CAPEX (Table 8) ──
  { metricKey: "ffe-catchup-pct-asset", label: "Catch-up FF&E Cycle Cost — US (% Asset Value)",
    country: "US",
    low: 15.0, mid: 20.0, high: 25.0, unit: "percent_asset_value",
    source: "HVS / CBRE Hotels Capital Markets 2024",
    methodology: "Comprehensive renovation every 7–10 years; full rooms + public areas + back-of-house; varies by brand PIP requirements" },
  { metricKey: "ffe-catchup-pct-asset", label: "Catch-up FF&E Cycle Cost — Southern Europe (% Asset Value)",
    country: "ES",
    low: 10.0, mid: 15.0, high: 20.0, unit: "percent_asset_value",
    source: "Horwath HTL Spain 2024",
    methodology: "Lower renovation frequency driven by family ownership patterns; heritage buildings constrain scope of renovations" },
  // ── PIP cost per key ──
  { metricKey: "pip-cost-per-key-brand-change", label: "PIP Cost per Key — Brand/Flag Change",
    country: "US",
    low: 20000, mid: 30000, high: 40000, unit: "usd_per_key",
    source: "HVS PIP Analysis 2024", sourceUrl: "https://www.hvs.com",
    methodology: "Product Improvement Plan cost on brand conversion; rooms-only renovation; excludes lobby and exterior" },
  { metricKey: "pip-cost-per-key-reposition", label: "PIP Cost per Key — Full Brand Repositioning",
    country: "US",
    low: 50000, mid: 75000, high: 100000, unit: "usd_per_key",
    source: "HVS PIP Analysis 2024",
    methodology: "Full repositioning: rooms + public spaces + F&B + back-of-house; luxury repositioning at high end" },
  // ── New construction cost per key (Table 5) ──
  { metricKey: "construction-cost-per-key-select", label: "New Construction Cost per Key — US Select Service",
    country: "US", segment: "select_service",
    low: 167000, mid: 195000, high: 223000, unit: "usd_per_key",
    source: "HVS / RS Means / Hotel Development Cost Surveys 2024–2025", sourceUrl: "https://www.hvs.com",
    methodology: "Hard costs only; site-specific, market, and design complexity premium not included; 2024 labor cost escalation baked in" },
  { metricKey: "construction-cost-per-key-full", label: "New Construction Cost per Key — US Full Service Boutique",
    country: "US", segment: "boutique_hotel",
    low: 300000, mid: 355000, high: 409000, unit: "usd_per_key",
    source: "HVS / Cushman & Wakefield Hotel Development Costs 2024" },
  { metricKey: "construction-cost-per-key-luxury", label: "New Construction Cost per Key — US Luxury",
    country: "US", segment: "luxury",
    low: 450000, mid: 600000, high: 900000, unit: "usd_per_key",
    source: "HVS / JLL Hotels Luxury Development Survey 2024",
    methodology: "High-end finishes, art budgets, specialized F&B, spa; top end for ultra-luxury urban flagships" },
  // ── Soft costs (% hard costs) ──
  { metricKey: "soft-costs-pct-hard", label: "Soft Costs as % Hard Costs — US Hotel Development",
    country: "US",
    low: 15.0, mid: 20.0, high: 25.0, unit: "percent",
    source: "HVS / RS Means Hotel Development Guide 2024",
    methodology: "Architecture/engineering 8–12%, FF&E design 2–4%, legal/permitting 2–4%, pre-opening 3–5%; varies by market regulation" },
  // ── Construction contingency ──
  { metricKey: "contingency-pct-hard", label: "Construction Contingency — % Hard Costs",
    country: "US",
    low: 5.0, mid: 7.5, high: 10.0, unit: "percent",
    source: "HVS / Hotel Development Cost Survey 2024",
    methodology: "Owner's contingency reserve in project budget; adaptive reuse and historic renovation at high end; ground-up standard at low end" },
  { metricKey: "contingency-pct-hard", label: "Construction Contingency — Southern Europe (% Hard Costs)",
    country: "ES",
    low: 5.0, mid: 8.0, high: 12.0, unit: "percent",
    source: "Horwath HTL Spain 2024",
    methodology: "Heritage building renovation and permitting uncertainty typically demands higher contingency in Spain/Italy" },
];

export async function seedCapexBenchmarks(): Promise<void> {
  for (const r of CAPEX_BENCHMARKS) {
    await upsertRange({
      domain: "construction", metricKey: r.metricKey, label: r.label,
      country: r.country, segment: r.segment ?? null,
      year: YEAR,
      low: r.low, mid: r.mid, high: r.high, unit: r.unit,
      sourceName: r.source, sourceUrl: r.sourceUrl ?? null,
      methodology: r.methodology ?? null,
      confidence: r.sourceUrl ? "medium" : "low",
    });
  }
  logger.info(`Seeded CAPEX benchmarks: ${CAPEX_BENCHMARKS.length} rows`, TAG);
}
