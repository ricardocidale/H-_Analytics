/**
 * Reference Range seeder — Pass 12 (2026 bibliography additions).
 *
 * New jurisdictions (CY, NL, AT), updated SS rates (ES, GR), CPOR/HPOR,
 * lifestyle ADR premium, EU/UK inflation, AU construction per sqm.
 *
 * Sources: PwC, Actabl, JLL, RLB/Whitebridge.
 */

import { logger } from "../../logger";
import { TAG, YEAR, upsertRange } from "./helpers";

// ── Pass 12: 2026 Bibliography Additions — PwC, Actabl, JLL, RLB/Whitebridge ──
// New jurisdictions (CY, NL, AT), updated SS rates (ES, GR), CPOR/HPOR,
// lifestyle ADR premium, EU/UK inflation, AU construction per sqm.

const PASS12_SEEDS: Array<Parameters<typeof upsertRange>[0]> = [
  // ── Tax: Cyprus (CY) — new jurisdiction ──────────────────────────────────
  { domain: "tax", metricKey: "corporate-tax-rate",
    label: "Corporate Income Tax — Cyprus",
    country: "CY", year: YEAR,
    low: 12.5, mid: 12.5, high: 15.0, unit: "percent",
    sourceName: "RemotePeople Employer of Record Cyprus 2026 / OECD Global Minimum Tax",
    sourceUrl: "https://remotepeople.com/countries/cyprus/employer-of-record/",
    methodology: "Domestic CIT 12.5% for small/mid operators and boutique hotel SPVs below OECD Pillar Two threshold; rate rises to 15% only for in-scope multinationals with €750M+ consolidated revenue. Non-Dom regime: 0% on worldwide dividends & interest for 17 years; 0% CGT on private shares.",
    confidence: "high" },

  { domain: "tax", metricKey: "payroll-tax-employer",
    label: "Employer Social Security Contribution — Cyprus",
    country: "CY", year: YEAR,
    low: 15.4, mid: 15.4, high: 15.4, unit: "percent",
    sourceName: "RemotePeople Employer of Record Cyprus 2026",
    sourceUrl: "https://remotepeople.com/countries/cyprus/employer-of-record/",
    methodology: "Social Insurance 8.8% + GeSY healthcare 2.9% + Social Cohesion Fund 2.0% + EKAD 1.2% + Holiday Fund 0.5% = 15.4%; lowest employer SS in Southern/Eastern Europe",
    confidence: "high" },

  { domain: "tax", metricKey: "capital-gains-tax",
    label: "Capital Gains Tax on Shares — Cyprus (Non-Dom)",
    country: "CY", year: YEAR,
    low: 0.0, mid: 0.0, high: 0.0, unit: "percent",
    sourceName: "Koufettas Law / TaxLife Cyprus Non-Dom 2026",
    sourceUrl: "https://koufettaslaw.com/cyprus-vs-malta-vs-portugal-vs-greece-2026-tax-comparison/",
    methodology: "Zero CGT on disposal of private company shares under Cyprus law; applicable to holding structures; EU-compatible; real property gains subject to separate 20% rate",
    confidence: "high" },

  // ── Tax: Netherlands (NL) — hotel VAT 2026 ───────────────────────────────
  { domain: "tax", metricKey: "vat-hotel-services",
    label: "VAT on Hotel / Short-Stay Accommodation — Netherlands (2026)",
    country: "NL", year: YEAR,
    low: 21.0, mid: 21.0, high: 21.0, unit: "percent",
    sourceName: "PwC Key Tax Issues at Year End for Real Estate Investors 2025/2026",
    sourceUrl: "https://www.pwc.com/gx/en/tax/pdf/key-tax-issues-at-year-end-for-real-estate-investors-2025-26.pdf",
    methodology: "Mandatory effective 2026-01-01: hotel accommodation, boarding houses, and holiday rentals moved from 9% reduced rate to standard 21% rate; 12pp increase forces margin decision or demand-price pass-through",
    confidence: "high" },

  { domain: "tax", metricKey: "property-transfer-tax",
    label: "Real Estate Transfer Tax — Netherlands (Commercial CRE)",
    country: "NL", year: YEAR,
    low: 10.4, mid: 10.4, high: 10.4, unit: "percent",
    sourceName: "PwC Key Tax Issues at Year End for Real Estate Investors 2025/2026",
    sourceUrl: "https://www.pwc.com/gx/en/tax/pdf/key-tax-issues-at-year-end-for-real-estate-investors-2025-26.pdf",
    methodology: "Overdrachtsbelasting: 10.4% on commercial and logistics real estate; residential reduced to 8% in 2026; new 2026 VAT revision scheme applies to renovation/expansion — track asset use changes over 5–10 year window",
    confidence: "high" },

  // ── Tax: Austria (AT) — RETT + share deal crackdown ─────────────────────
  { domain: "tax", metricKey: "property-transfer-tax",
    label: "Real Estate Transfer Tax — Austria",
    country: "AT", year: YEAR,
    low: 3.5, mid: 4.6, high: 4.6, unit: "percent",
    sourceName: "PwC Key Tax Issues at Year End for Real Estate Investors 2025/2026",
    sourceUrl: "https://www.pwc.com/gx/en/tax/pdf/key-tax-issues-at-year-end-for-real-estate-investors-2025-26.pdf",
    methodology: "Standard RETT 3.5% on acquisition price + 1.1% registration fee on market value; BBG 2025 aggressively closed share-deal loophole: indirect share transfers now frequently trigger 3.5% on fair market value",
    confidence: "high" },

  // ── Tax: Spain — employer SS update (PwC 2026, supersedes 2024 estimate) ─
  { domain: "tax", metricKey: "payroll-tax-employer",
    label: "Employer Social Security Contribution — Spain (2026)",
    country: "ES", year: YEAR,
    low: 30.65, mid: 30.65, high: 32.15, unit: "percent",
    sourceName: "PwC Worldwide Tax Summaries: Spain 2026",
    sourceUrl: "https://taxsummaries.pwc.com/spain/corporate/other-taxes",
    methodology: "General regime 2026: contingencias comunes + desempleo + FOGASA + FP + MECANISMO EQUIDAD = 30.65%; plus variable accident rate ~1.5% (office) to 6.7% (construction); employee contribution 6.50%",
    confidence: "high" },

  // ── Tax: Greece — employer SS precise rate (PwC 2026) ────────────────────
  { domain: "tax", metricKey: "payroll-tax-employer",
    label: "Employer Social Security Contribution — Greece (2025/2026)",
    country: "GR", year: YEAR,
    low: 21.79, mid: 21.79, high: 22.5, unit: "percent",
    sourceName: "PwC Worldwide Tax Summaries: Greece 2026",
    sourceUrl: "https://taxsummaries.pwc.com/greece/corporate/other-taxes",
    methodology: "EFKA (e-EFKA) 2025/2026: employer 21.79% of gross salary; employee 13.37%; combined 35.16%; monthly cap at EUR 7,761.94; 50% income tax exemption available for new employees for 7 years",
    confidence: "high" },

  // ── Labor: CPOR / HPOR benchmarks (Actabl 2026) ──────────────────────────
  { domain: "labor", metricKey: "cpor",
    label: "Wage Cost Per Occupied Room — US Hotel (2025)",
    country: "US", year: YEAR,
    low: 42.82, mid: 48.32, high: 56.0, unit: "usd_per_occupied_room",
    sourceName: "Actabl / HotelData.com — 2025 Hotel Labor Costs & Trends",
    sourceUrl: "https://lodgingmagazine.com/new-report-finds-operators-improve-labor-efficiency-amid-rising-wages-and-softer-revenue/",
    methodology: "Aggregated from thousands of US hotel properties; 2025 CPOR $48.32 (+12.8% from $42.82 in 2024); Q4 2025 spike of +21.1% signals permanent cost recalibration; hourly wages rose 8.0%",
    confidence: "high" },

  { domain: "labor", metricKey: "hpor-extended-stay",
    label: "Hours Per Occupied Room — US Extended-Stay",
    country: "US", year: YEAR,
    low: 1.20, mid: 1.30, high: 1.45, unit: "hours_per_occupied_room",
    sourceName: "Actabl / HotelData.com 2025 Hotel Labor Costs & Trends",
    sourceUrl: "https://lodgingmagazine.com/new-report-finds-operators-improve-labor-efficiency-amid-rising-wages-and-softer-revenue/",
    methodology: "Most efficient segment: limited housekeeping, minimal daily service; HPOR rose 4.4% overall in 2025",
    confidence: "high" },

  { domain: "labor", metricKey: "hpor-select-service",
    label: "Hours Per Occupied Room — US Select-Service",
    country: "US", year: YEAR,
    low: 1.30, mid: 1.44, high: 1.65, unit: "hours_per_occupied_room",
    sourceName: "Actabl / HotelData.com 2025 Hotel Labor Costs & Trends",
    sourceUrl: "https://lodgingmagazine.com/new-report-finds-operators-improve-labor-efficiency-amid-rising-wages-and-softer-revenue/",
    methodology: "Limited F&B, reduced housekeeping services; cross-training can push toward low end; MPOR (minutes per occupied room) fell 9% overall through productivity optimization",
    confidence: "high" },

  { domain: "labor", metricKey: "hpor-full-service",
    label: "Hours Per Occupied Room — US Full-Service / Boutique",
    country: "US", segment: "boutique_hotel", year: YEAR,
    low: 2.30, mid: 2.57, high: 3.10, unit: "hours_per_occupied_room",
    sourceName: "Actabl / HotelData.com 2025 Hotel Labor Costs & Trends",
    sourceUrl: "https://lodgingmagazine.com/new-report-finds-operators-improve-labor-efficiency-amid-rising-wages-and-softer-revenue/",
    methodology: "Full F&B, full housekeeping, concierge; engineering/guestrooms most susceptible to overrun; maintenance engineer CPOR +7.5% YoY",
    confidence: "high" },

  { domain: "labor", metricKey: "hpor-resort",
    label: "Hours Per Occupied Room — US Resort",
    country: "US", segment: "luxury", year: YEAR,
    low: 3.90, mid: 4.48, high: 5.50, unit: "hours_per_occupied_room",
    sourceName: "Actabl / HotelData.com 2025 Hotel Labor Costs & Trends",
    sourceUrl: "https://lodgingmagazine.com/new-report-finds-operators-improve-labor-efficiency-amid-rising-wages-and-softer-revenue/",
    methodology: "Complex resort: multiple F&B outlets, spa, activities, pool, event services; massive staffing complexity; rate-growth moderation exposes margin risk",
    confidence: "high" },

  // ── KPI: Lifestyle ADR premium (JLL 2026) ─────────────────────────────────
  { domain: "kpi", metricKey: "lifestyle-adr-premium",
    label: "Lifestyle Hotel ADR Premium over Traditional — APAC/Global",
    country: "GLOBAL", year: YEAR,
    low: 10.0, mid: 10.5, high: 11.0, unit: "percent",
    sourceName: "JLL Hotels & Hospitality — APAC Lifestyle Hotels 2026",
    sourceUrl: "https://geonet.properties/news/jll-11-signals-shaping-hotel-investment-right-now",
    methodology: "Lifestyle properties command 10–11% ADR premium over traditional hotels in same market; consistent across varying macroeconomic cycles; driven by distinctive design and localized experiences",
    confidence: "high" },

  // ── Macro: EU/UK inflation projections (CBRE 2026) ────────────────────────
  { domain: "macro", metricKey: "inflation-cpi-eu",
    label: "Eurozone Inflation — 2026 Projection",
    country: "EU", year: YEAR,
    low: 1.2, mid: 1.5, high: 2.0, unit: "percent_annual",
    sourceName: "CBRE European Real Estate Market Outlook 2026",
    sourceUrl: "https://mediaassets.cbre.com/-/media/files/2026/european-real-estate-market-outlook-2026.pdf",
    methodology: "ECB not expected to cut rates further in 2026; inflation supports real household income and domestic consumption; structural supply-demand imbalances in living sector persist",
    confidence: "medium" },

  { domain: "macro", metricKey: "inflation-cpi-gb",
    label: "UK Inflation — 2026 Projection",
    country: "GB", year: YEAR,
    low: 2.0, mid: 2.5, high: 3.0, unit: "percent_annual",
    sourceName: "CBRE UK Real Estate Market Outlook 2026",
    sourceUrl: "https://www.cbre.co.uk/insights",
    methodology: "Stickier inflation than Eurozone; single BOE rate cut anticipated; long-term rates remaining elevated; service sector wage growth principal driver",
    confidence: "medium" },

  // ── Construction: Australia per sqm (RLB/Whitebridge 2026) ───────────────
  { domain: "construction", metricKey: "construction-cost-per-sqm-budget",
    label: "Hotel Construction Cost per sqm — Australia Budget",
    country: "AU", year: YEAR,
    low: 3670, mid: 4455, high: 5240, unit: "aud_per_sqm",
    sourceName: "Whitebridge Hospitality / RLB — APAC Hotels Monitor Issue 12",
    sourceUrl: "https://whitebridgehospitality.com/media/zpdphtop/whitebridge-apac-hotels-monitor-issue-12.pdf",
    methodology: "Budget properties; CCCI annual growth +2.9% (Jun 2025) — return to pre-COVID ~4% historical average; post-pandemic supply chain spikes largely subsided",
    confidence: "medium" },

  { domain: "construction", metricKey: "construction-cost-per-sqm-boutique",
    label: "Hotel Construction Cost per sqm — Australia Boutique Motel",
    country: "AU", year: YEAR,
    low: 5025, mid: 6292, high: 7558, unit: "aud_per_sqm",
    sourceName: "BMT Quantity Surveyors / RLB APAC Hotels Monitor Issue 12",
    sourceUrl: "https://whitebridgehospitality.com/media/zpdphtop/whitebridge-apac-hotels-monitor-issue-12.pdf",
    methodology: "Single-level boutique motel; range reflects finish level; on-site construction activity increased in Australia per RLB 2025",
    confidence: "medium" },

  { domain: "construction", metricKey: "construction-cost-per-sqm-luxury",
    label: "Hotel Construction Cost per sqm — Australia Luxury",
    country: "AU", year: YEAR,
    low: 4820, mid: 6000, high: 8500, unit: "aud_per_sqm",
    sourceName: "Whitebridge Hospitality / RLB — APAC Hotels Monitor Issue 12",
    sourceUrl: "https://whitebridgehospitality.com/media/zpdphtop/whitebridge-apac-hotels-monitor-issue-12.pdf",
    methodology: "Bespoke luxury; AUD 4,820+ per sqm minimum; no published upper bound for ultra-luxury one-off projects; India contrast: >10% YoY GOP growth driven by low energy costs",
    confidence: "low" },
];

export async function seedPass12Updates(): Promise<void> {
  for (const r of PASS12_SEEDS) {
    await upsertRange(r);
  }
  logger.info(`Seeded Pass 12 (2026 bibliography additions): ${PASS12_SEEDS.length} rows`, TAG);
}
