/**
 * Reference Range seeder — operating-side benchmark passes.
 *
 * Pass 5:  Hospitality KPI benchmarks (Tables 1, 6)
 * Pass 7:  Operating cost benchmarks (Tables 3, 4)
 * Pass 8:  EWW benchmarks (Table 7)
 * Pass 10: Fixed costs — property tax, insurance (Table 9)
 * Pass 11: Tax benchmarks (Table 10)
 */

import { logger } from "../../logger";
import { TAG, YEAR, upsertRange } from "./helpers";

// ── Pass 5: Hospitality KPI benchmarks — margins, cap rates, fees ────────────
// Tables 1, 6 from H+ Research 2026 (Americas vs. Southern Europe)

type KpiBenchmarkSeed = {
  metricKey: string; label: string;
  country: string; segment?: string;
  low: number; mid: number; high: number; unit: string;
  source: string; sourceUrl?: string; methodology?: string;
};

const HOSPITALITY_KPI_BENCHMARKS: KpiBenchmarkSeed[] = [
  // ── GOP margin ──
  { metricKey: "gop-margin", label: "GOP Margin — US Boutique/Select Service",
    country: "US", segment: "boutique_hotel",
    low: 25.0, mid: 35.0, high: 45.0, unit: "percent_of_revenue",
    source: "CBRE Hotels Trends 2024–2025 / HVS Survey",
    sourceUrl: "https://www.cbre.com", methodology: "USALI GOP ÷ Total Revenue; select to luxury boutique range" },
  { metricKey: "gop-margin", label: "GOP Margin — Spain Boutique",
    country: "ES", segment: "boutique_hotel",
    low: 20.0, mid: 27.5, high: 35.0, unit: "percent_of_revenue",
    source: "Horwath HTL Spain / HVS Europe Hotels 2024",
    sourceUrl: "https://www.horwathhtl.com" },
  { metricKey: "gop-margin", label: "GOP Margin — Italy Boutique",
    country: "IT", segment: "boutique_hotel",
    low: 20.0, mid: 27.0, high: 34.0, unit: "percent_of_revenue",
    source: "Horwath HTL Italy / HVS Europe Hotels 2024",
    sourceUrl: "https://www.horwathhtl.com" },
  { metricKey: "gop-margin", label: "GOP Margin — Greece Boutique",
    country: "GR", segment: "boutique_hotel",
    low: 20.0, mid: 28.0, high: 36.0, unit: "percent_of_revenue",
    source: "GNTO / HVS Athens 2024" },

  // ── NOI margin (after FF&E reserve) ──
  { metricKey: "noi-margin-after-ffe", label: "NOI Margin after FF&E — US Boutique",
    country: "US", segment: "boutique_hotel",
    low: 15.0, mid: 22.5, high: 30.0, unit: "percent_of_revenue",
    source: "CBRE Hotels Trends 2024–2025", sourceUrl: "https://www.cbre.com",
    methodology: "NOI after deducting standard 4–5% FF&E reserve from GOP" },
  { metricKey: "noi-margin-after-ffe", label: "NOI Margin after FF&E — Spain Boutique",
    country: "ES", segment: "boutique_hotel",
    low: 10.0, mid: 17.5, high: 25.0, unit: "percent_of_revenue",
    source: "Horwath HTL Spain 2024" },
  { metricKey: "noi-margin-after-ffe", label: "NOI Margin after FF&E — Italy Boutique",
    country: "IT", segment: "boutique_hotel",
    low: 10.0, mid: 17.0, high: 24.0, unit: "percent_of_revenue",
    source: "Horwath HTL Italy 2024" },
  { metricKey: "noi-margin-after-ffe", label: "NOI Margin after FF&E — Greece Boutique",
    country: "GR", segment: "boutique_hotel",
    low: 10.0, mid: 18.0, high: 26.0, unit: "percent_of_revenue",
    source: "GNTO / HVS Athens 2024" },

  // ── Stabilized occupancy (national average as benchmark) ──
  { metricKey: "occupancy-stabilized", label: "Stabilized Occupancy — US Boutique",
    country: "US", segment: "boutique_hotel",
    low: 0.65, mid: 0.70, high: 0.75, unit: "percent",
    source: "STR / CBRE Hotels 2024", sourceUrl: "https://www.costar.com" },
  { metricKey: "occupancy-stabilized", label: "Stabilized Occupancy — Southern Europe Boutique",
    country: "ES", segment: "boutique_hotel",
    low: 0.60, mid: 0.66, high: 0.72, unit: "percent",
    source: "Horwath HTL Spain / MTE Spain 2024" },
  { metricKey: "occupancy-stabilized", label: "Stabilized Occupancy — Italy Boutique",
    country: "IT", segment: "boutique_hotel",
    low: 0.58, mid: 0.65, high: 0.72, unit: "percent",
    source: "Horwath HTL Italy 2024" },
  { metricKey: "occupancy-stabilized", label: "Stabilized Occupancy — Greece Boutique",
    country: "GR", segment: "boutique_hotel",
    low: 0.55, mid: 0.63, high: 0.70, unit: "percent",
    source: "GNTO 2024" },

  // ── Stabilization ramp period ──
  { metricKey: "ramp-months", label: "Ramp to Stabilization — US",
    country: "US",
    low: 12.0, mid: 18.0, high: 24.0, unit: "months",
    source: "HVS / Horwath HTL Americas 2024", sourceUrl: "https://www.hvs.com",
    methodology: "Months from opening to reach stabilized occupancy; influenced by brand, market depth, and pre-opening marketing spend" },
  { metricKey: "ramp-months", label: "Ramp to Stabilization — Spain",
    country: "ES",
    low: 18.0, mid: 27.0, high: 36.0, unit: "months",
    source: "Horwath HTL Spain 2024", sourceUrl: "https://www.horwathhtl.com" },
  { metricKey: "ramp-months", label: "Ramp to Stabilization — Italy",
    country: "IT",
    low: 18.0, mid: 27.0, high: 36.0, unit: "months",
    source: "Horwath HTL Italy 2024" },
  { metricKey: "ramp-months", label: "Ramp to Stabilization — Greece",
    country: "GR",
    low: 18.0, mid: 27.0, high: 36.0, unit: "months",
    source: "HVS Athens 2024" },

  // ── Cap rate ──
  { metricKey: "cap-rate", label: "Exit Cap Rate — US Boutique Hotel",
    country: "US", segment: "boutique_hotel",
    low: 6.0, mid: 7.5, high: 9.5, unit: "percent",
    source: "CBRE Hotels Cap Rate Survey H2 2024", sourceUrl: "https://www.cbre.com",
    methodology: "TTM NOI ÷ Transaction price; stabilized boutique/lifestyle hotels" },
  { metricKey: "cap-rate", label: "Exit Cap Rate — Spain Boutique",
    country: "ES", segment: "boutique_hotel",
    low: 5.0, mid: 6.0, high: 7.5, unit: "percent",
    source: "Cushman & Wakefield Hotels Spain 2024 / HVS" },
  { metricKey: "cap-rate", label: "Exit Cap Rate — Italy Boutique",
    country: "IT", segment: "boutique_hotel",
    low: 5.0, mid: 6.0, high: 7.5, unit: "percent",
    source: "Cushman & Wakefield Hotels Italy 2024" },
  { metricKey: "cap-rate", label: "Exit Cap Rate — Greece Boutique",
    country: "GR", segment: "boutique_hotel",
    low: 6.0, mid: 7.0, high: 9.0, unit: "percent",
    source: "HVS Athens / JLL Hotels Greece 2024" },

  // ── Management fees (Table 6) ──
  { metricKey: "mgmt-fee-base", label: "Management Fee — Base % Revenue — US",
    country: "US",
    low: 2.0, mid: 3.0, high: 4.0, unit: "percent_of_revenue",
    source: "HVS / CBRE Hotels Management Fee Survey 2024", sourceUrl: "https://www.hvs.com",
    methodology: "Base fee as % of total hotel revenue; independent operators at low end, branded operators at high end" },
  { metricKey: "mgmt-fee-incentive", label: "Management Fee — Incentive % GOP — US",
    country: "US",
    low: 8.0, mid: 10.0, high: 12.0, unit: "percent_of_gop",
    source: "HVS / CBRE Hotels Management Fee Survey 2024", sourceUrl: "https://www.hvs.com",
    methodology: "Incentive calculated on Adjusted GOP after owner's priority return; branded full-service at high end" },
  { metricKey: "mgmt-fee-accounting", label: "Management Fee — Accounting/Tech/Mgmt per Room — US",
    country: "US",
    low: 500.0, mid: 1000.0, high: 1500.0, unit: "usd_per_room_annual",
    source: "CBRE Hotels / AHLA 2024" },
  { metricKey: "mgmt-fee-base", label: "Management Fee — Base % Revenue — Southern Europe",
    country: "ES",
    low: 2.0, mid: 2.75, high: 3.5, unit: "percent_of_revenue",
    source: "HVS Europe / Horwath HTL Spain 2024" },
  { metricKey: "mgmt-fee-incentive", label: "Management Fee — Incentive % GOP — Southern Europe",
    country: "ES",
    low: 8.0, mid: 9.0, high: 10.0, unit: "percent_of_gop",
    source: "HVS Europe / Horwath HTL 2024" },
];

export async function seedHospitalityKpiBenchmarks(): Promise<void> {
  for (const r of HOSPITALITY_KPI_BENCHMARKS) {
    await upsertRange({
      domain: "kpi", metricKey: r.metricKey, label: r.label,
      country: r.country, segment: r.segment ?? null,
      year: YEAR,
      low: r.low, mid: r.mid, high: r.high, unit: r.unit,
      sourceName: r.source, sourceUrl: r.sourceUrl ?? null,
      methodology: r.methodology ?? null,
      confidence: r.sourceUrl ? "medium" : "low",
    });
  }
  logger.info(`Seeded hospitality KPI benchmarks: ${HOSPITALITY_KPI_BENCHMARKS.length} rows`, TAG);
}

// ── Pass 7: Operating cost benchmarks (Tables 3, 4) ──────────────────────────

const OPERATING_COST_BENCHMARKS: Array<{
  metricKey: string; label: string; country: string; segment?: string;
  low: number; mid: number; high: number; unit: string;
  source: string; sourceUrl?: string; methodology?: string;
}> = [
  // ── Labor (Table 3) ──
  { metricKey: "fte-per-key-select", label: "FTE per Key — US Select Service",
    country: "US", segment: "select_service",
    low: 0.45, mid: 0.55, high: 0.65, unit: "fte_per_key",
    source: "AHLA / HVS Staffing Survey 2024", sourceUrl: "https://www.hvs.com",
    methodology: "Full-time equivalent staff per available room; includes all departments; limited F&B select service" },
  { metricKey: "fte-per-key-full", label: "FTE per Key — US Full Service Boutique",
    country: "US", segment: "boutique_hotel",
    low: 0.80, mid: 1.00, high: 1.20, unit: "fte_per_key",
    source: "AHLA / CBRE Hotels Operational Survey 2024",
    methodology: "Full-service with full F&B; boutique hotels with personalized service land 20–30% above midscale full-service" },
  { metricKey: "fte-per-key-luxury", label: "FTE per Key — US Luxury",
    country: "US", segment: "luxury",
    low: 1.50, mid: 2.00, high: 2.50, unit: "fte_per_key",
    source: "CBRE Hotels / Forbes Five-Star benchmarks 2024" },
  { metricKey: "fte-per-key-select", label: "FTE per Key — Southern Europe Select",
    country: "ES", segment: "select_service",
    low: 0.50, mid: 0.65, high: 0.80, unit: "fte_per_key",
    source: "Horwath HTL Spain / IHOTELS Spain 2024",
    methodology: "Spain/Italy/Greece: higher than US select due to labor protections and split-shift requirements" },
  { metricKey: "fte-per-key-full", label: "FTE per Key — Southern Europe Full Service",
    country: "ES", segment: "boutique_hotel",
    low: 0.90, mid: 1.15, high: 1.40, unit: "fte_per_key",
    source: "Horwath HTL Spain 2024" },
  { metricKey: "benefits-load", label: "Benefits Load — US (% base wage)",
    country: "US",
    low: 22.0, mid: 25.0, high: 28.0, unit: "percent_of_base_salary",
    source: "BLS Employer Costs for Employee Compensation 2024", sourceUrl: "https://www.bls.gov",
    methodology: "Employer-paid benefits as % of base wages: FICA 7.65%, health insurance, workers comp, unemployment, PTO accrual" },
  { metricKey: "benefits-load", label: "Benefits Load — Southern Europe (% base wage)",
    country: "ES",
    low: 18.0, mid: 22.0, high: 28.0, unit: "percent_of_base_salary",
    source: "Ministerio de Trabajo España / IHOTELS 2024",
    methodology: "Spain: Social Security employer ~23.6%; Italy: INPS ~30%; Greece: IKA ~25%; range reflects mix across jurisdictions" },
  { metricKey: "payroll-tax-employer", label: "Payroll Tax Employer Contribution — US",
    country: "US",
    low: 7.65, mid: 9.5, high: 12.0, unit: "percent",
    source: "IRS Publication 15 / FUTA + SUTA 2024", sourceUrl: "https://www.irs.gov",
    methodology: "FICA 7.65% (SS 6.2% + Medicare 1.45%) + FUTA 0.6% + state SUTA 1–3.5%; bottom of range before SUTA" },
  { metricKey: "payroll-tax-employer", label: "Payroll Tax Employer Contribution — Spain",
    country: "ES",
    low: 23.0, mid: 25.0, high: 28.0, unit: "percent",
    source: "Seguridad Social España 2024",
    methodology: "Social Security contributions: contingencias comunes ~23.6% + contingencias profesionales ~1.5% + FOGASA + FP" },
  { metricKey: "payroll-tax-employer", label: "Payroll Tax Employer Contribution — Italy",
    country: "IT",
    low: 28.0, mid: 30.0, high: 32.0, unit: "percent",
    source: "INPS / Agenzia delle Entrate Italy 2024",
    methodology: "INPS contributions: ~30% of gross salary; varies by sector (CCNL turismo)" },
  { metricKey: "payroll-tax-employer", label: "Payroll Tax Employer Contribution — Greece",
    country: "GR",
    low: 22.0, mid: 24.0, high: 26.0, unit: "percent",
    source: "EFKA Greece / IKA contributions 2024",
    methodology: "IKA (social insurance): ~24% employer share; seasonal hotel workers have special seasonal contract provisions" },
  // ── F&B operating costs (Table 4) ──
  { metricKey: "food-cost-percent", label: "Food Cost % (COGS) — US Hotel Restaurant",
    country: "US",
    low: 28.0, mid: 32.0, high: 36.0, unit: "percent_of_food_revenue",
    source: "National Restaurant Association / CBRE Hotels F&B 2024",
    methodology: "Cost of food sold ÷ food revenue; higher end for upscale preparations; lower end for focused menus" },
  { metricKey: "beverage-cost-percent", label: "Beverage Cost % (COGS) — US Hotel Bar",
    country: "US",
    low: 20.0, mid: 24.0, high: 28.0, unit: "percent_of_beverage_revenue",
    source: "National Restaurant Association / CBRE Hotels F&B 2024",
    methodology: "Cost of beverages sold ÷ beverage revenue; full bar lower than wine-only; premium wine programs at high end" },
  { metricKey: "labor-cost-total", label: "Total Labor Cost % — US Hotel",
    country: "US",
    low: 28.0, mid: 33.0, high: 38.0, unit: "percent_of_revenue",
    source: "CBRE Hotels Trends in the US Hotel Industry 2024",
    methodology: "All departments including management, front office, housekeeping, F&B, maintenance; wages + benefits + contract" },
  { metricKey: "labor-cost-total", label: "Total Labor Cost % — Southern Europe Hotel",
    country: "ES",
    low: 30.0, mid: 35.0, high: 40.0, unit: "percent_of_revenue",
    source: "Horwath HTL Spain 2024",
    methodology: "Higher employer tax burden in SE; includes social security + benefits at prevailing CCNL rates" },
];

export async function seedOperatingCostBenchmarks(): Promise<void> {
  for (const r of OPERATING_COST_BENCHMARKS) {
    await upsertRange({
      domain: "labor", metricKey: r.metricKey, label: r.label,
      country: r.country, segment: r.segment ?? null,
      year: YEAR,
      low: r.low, mid: r.mid, high: r.high, unit: r.unit,
      sourceName: r.source, sourceUrl: r.sourceUrl ?? null,
      methodology: r.methodology ?? null,
      confidence: r.sourceUrl ? "medium" : "low",
    });
  }
  logger.info(`Seeded operating cost benchmarks: ${OPERATING_COST_BENCHMARKS.length} rows`, TAG);
}

// ── Pass 8: EWW benchmarks (Table 7) — USALI 12th Ed. Schedule EWW ───────────

const EWW_BENCHMARKS: Array<{
  metricKey: string; label: string; country: string;
  low: number; mid: number; high: number; unit: string;
  source: string; methodology?: string;
}> = [
  // Electricity per room (USD / EUR annual)
  { metricKey: "electricity-per-room", label: "Electricity Cost per Room — US Hotel",
    country: "US",
    low: 1200, mid: 1500, high: 1800, unit: "usd_per_room_annual",
    source: "AHLA / EIA Commercial Buildings Energy Consumption Survey 2024",
    methodology: "All-in annual electricity cost divided by room count; USALI Schedule EWW (12th Ed.); climate/asset-age variation significant" },
  { metricKey: "electricity-per-room", label: "Electricity Cost per Room — Southern Europe Hotel",
    country: "ES",
    low: 1500, mid: 2000, high: 2500, unit: "eur_per_room_annual",
    source: "IHOTELS Spain / Eurostat Energy Statistics 2024",
    methodology: "EUR-denominated; Southern Europe electricity rates 30–60% above US on per-kWh basis; older building stock drives high end" },
  { metricKey: "electricity-per-room", label: "Electricity Cost per Room — Italy",
    country: "IT",
    low: 1600, mid: 2100, high: 2600, unit: "eur_per_room_annual",
    source: "Federalberghi / Eurostat 2024" },
  { metricKey: "electricity-per-room", label: "Electricity Cost per Room — Greece",
    country: "GR",
    low: 1400, mid: 1900, high: 2400, unit: "eur_per_room_annual",
    source: "SETE / Eurostat Greece 2024",
    methodology: "Seasonal hotels; higher peak summer consumption for pools and HVAC; solar installations reducing low end" },
  // Water per room
  { metricKey: "water-per-room", label: "Water & Sewer Cost per Room — US Hotel",
    country: "US",
    low: 400, mid: 550, high: 700, unit: "usd_per_room_annual",
    source: "AHLA / Water Research Foundation Hotel Study 2024",
    methodology: "Combined water + sewer charges; pool properties at high end; arid markets (Phoenix, Las Vegas) 40–60% above average" },
  { metricKey: "water-per-room", label: "Water Cost per Room — Southern Europe",
    country: "ES",
    low: 500, mid: 700, high: 900, unit: "eur_per_room_annual",
    source: "IHOTELS Spain / Ministerio de Medio Ambiente 2024",
    methodology: "Pool resorts and spa properties are at high end; Mediterranean scarcity premium applies" },
  // Waste per room
  { metricKey: "waste-per-room", label: "Waste & Recycling Cost per Room — US Hotel",
    country: "US",
    low: 150, mid: 225, high: 300, unit: "usd_per_room_annual",
    source: "AHLA / USTOA Sustainability Survey 2024",
    methodology: "Refuse removal + recycling; urban markets significantly higher; food-waste diversion programs add cost short-term" },
  { metricKey: "waste-per-room", label: "Waste Cost per Room — Southern Europe",
    country: "ES",
    low: 200, mid: 300, high: 400, unit: "eur_per_room_annual",
    source: "IHOTELS Spain 2024" },
  // Total EWW as % of revenue
  { metricKey: "eww-total-pct-revenue", label: "Total EWW Cost % Revenue — US Hotel",
    country: "US",
    low: 3.5, mid: 4.25, high: 5.0, unit: "percent_of_revenue",
    source: "CBRE Hotels / AHLA Sustainability Report 2024",
    methodology: "Total electricity + water + waste as % total hotel revenue; USALI Schedule EWW classification (12th Ed. effective 2026)" },
  { metricKey: "eww-total-pct-revenue", label: "Total EWW Cost % Revenue — Southern Europe",
    country: "ES",
    low: 4.5, mid: 5.5, high: 6.5, unit: "percent_of_revenue",
    source: "Horwath HTL Spain / IHOTELS 2024",
    methodology: "Higher EUR-denominated utility rates; pool/spa resort segment at high end" },
  { metricKey: "eww-total-pct-revenue", label: "Total EWW Cost % Revenue — Italy",
    country: "IT",
    low: 4.5, mid: 5.5, high: 6.5, unit: "percent_of_revenue",
    source: "Federalberghi / Horwath HTL Italy 2024" },
  { metricKey: "eww-total-pct-revenue", label: "Total EWW Cost % Revenue — Greece",
    country: "GR",
    low: 4.5, mid: 5.5, high: 6.5, unit: "percent_of_revenue",
    source: "SETE / HVS Athens 2024" },
  // EWW cost inflation rate
  { metricKey: "eww-cost-inflation", label: "EWW Cost Inflation Rate — US",
    country: "US",
    low: 3.5, mid: 4.25, high: 5.0, unit: "percent_annual",
    source: "EIA / AHLA Energy Cost Survey 2024",
    methodology: "Annual rate of EWW cost increase; 2022–2024 spike from energy markets may not persist at high end" },
  { metricKey: "eww-cost-inflation", label: "EWW Cost Inflation Rate — Southern Europe",
    country: "ES",
    low: 5.0, mid: 6.5, high: 8.0, unit: "percent_annual",
    source: "Eurostat / Horwath HTL Energy Outlook 2024",
    methodology: "Energy transition costs + carbon pricing in EU contributing to structural upward pressure" },
];

export async function seedEwwBenchmarks(): Promise<void> {
  for (const r of EWW_BENCHMARKS) {
    await upsertRange({
      domain: "risk", metricKey: r.metricKey, label: r.label,
      country: r.country,
      year: YEAR,
      low: r.low, mid: r.mid, high: r.high, unit: r.unit,
      sourceName: r.source,
      methodology: r.methodology ?? null,
      confidence: "medium",
    });
  }
  logger.info(`Seeded EWW benchmarks: ${EWW_BENCHMARKS.length} rows`, TAG);
}

// ── Pass 10: Fixed costs — property tax, insurance (Table 9) ─────────────────

const FIXED_COST_BENCHMARKS: Array<{
  metricKey: string; label: string; country: string; subdivision?: string;
  low: number; mid: number; high: number; unit: string;
  source: string; sourceUrl?: string; methodology?: string;
}> = [
  // ── Property taxes ──
  { metricKey: "property-tax-rate", label: "Property Tax Rate — US (% Assessed Value)",
    country: "US",
    low: 1.0, mid: 1.75, high: 2.5, unit: "percent_assessed_value",
    source: "Lincoln Institute of Land Policy / CBRE Hotels Tax Survey 2024",
    methodology: "Effective rate on hotel assessed value; assessment may be below market; local jurisdiction rates vary 0.5–3.5%; reassessment at sale is a key risk event for proforma" },
  { metricKey: "property-tax-rate", label: "Property Tax Rate — New York",
    country: "US", subdivision: "NY",
    low: 1.5, mid: 2.5, high: 4.0, unit: "percent_assessed_value",
    source: "NYC Department of Finance / CBRE NYC Hotels 2024",
    methodology: "Class 4 commercial property; assessed value typically 45% of market value; 421-a exemptions may apply for new construction" },
  { metricKey: "property-tax-rate", label: "Property Tax Rate — Texas",
    country: "US", subdivision: "TX",
    low: 1.8, mid: 2.2, high: 2.8, unit: "percent_assessed_value",
    source: "Texas Comptroller / CBRE Hotels Texas 2024",
    methodology: "No state income tax but above-average property tax rates; hotels valued at income approach" },
  { metricKey: "property-tax-rate", label: "Property Tax Rate — Florida",
    country: "US", subdivision: "FL",
    low: 0.8, mid: 1.1, high: 1.6, unit: "percent_assessed_value",
    source: "Florida Department of Revenue 2024",
    methodology: "No state income tax; SOH cap limits annual increases on homestead but not commercial; tourist areas may carry special assessments" },
  { metricKey: "property-tax-rate", label: "IBI Property Tax (Impuesto Bienes Inmuebles) — Spain",
    country: "ES",
    low: 0.4, mid: 0.75, high: 1.1, unit: "percent_cadastral_value",
    source: "Ministerio de Hacienda España / IHOTELS 2024",
    methodology: "Annual municipal property tax on cadastral value; cadastral values typically 30–60% below market; varies by municipality" },
  { metricKey: "property-tax-rate", label: "IMU Property Tax — Italy",
    country: "IT",
    low: 0.76, mid: 1.0, high: 1.06, unit: "percent_cadastral_value",
    source: "Agenzia delle Entrate Italy 2024",
    methodology: "Imposta Municipale Propria (IMU); hotels classified as D category; base rate 0.76% + municipal surcharge; cadastral value << market" },
  { metricKey: "property-tax-rate", label: "Property Tax (ENFIA) — Greece",
    country: "GR",
    low: 0.3, mid: 0.6, high: 1.0, unit: "percent_objective_value",
    source: "AADE Greece / SETE 2024",
    methodology: "ENFIA (Unified Property Tax); objective value set by state; hotels on Aegean islands may benefit from reduced-rate zones" },
  // ── Insurance ──
  { metricKey: "insurance-per-room", label: "Property & Casualty Insurance per Room — US Hotel",
    country: "US",
    low: 1200, mid: 2100, high: 3000, unit: "usd_per_room_annual",
    source: "AHLA / Marsh McLennan Hotel Insurance Survey 2024",
    methodology: "All-risk property + general liability + loss of income; catastrophe-zone properties (FL, TX, CA) at high end; national average $1,800–2,200/room as of 2024" },
  { metricKey: "insurance-per-room", label: "Property & Casualty Insurance per Room — Southern Europe",
    country: "ES",
    low: 800, mid: 1150, high: 1500, unit: "eur_per_room_annual",
    source: "IHOTELS Spain / Mapfre Hospitality 2024",
    methodology: "Lower catastrophe exposure than US; seismic risk (IT/GR) adds premium; some EU markets require building insurance separately from contents" },
  { metricKey: "insurance-per-room", label: "Property & Casualty Insurance per Room — Italy",
    country: "IT",
    low: 900, mid: 1200, high: 1600, unit: "eur_per_room_annual",
    source: "Federalberghi / Generali Hotels 2024",
    methodology: "Seismic zone coverage adds 10–25%; heritage building replacement value premium" },
  { metricKey: "insurance-per-room", label: "Property & Casualty Insurance per Room — Greece",
    country: "GR",
    low: 700, mid: 1000, high: 1400, unit: "eur_per_room_annual",
    source: "SETE / XRTC Greece Insurance Survey 2024",
    methodology: "Aegean island properties add marine and seasonal storm coverage" },
  // ── Insurance inflation ──
  { metricKey: "insurance-cost-inflation", label: "Insurance Cost Inflation — US (recent trend)",
    country: "US",
    low: 18.0, mid: 21.5, high: 25.0, unit: "percent_annual",
    source: "Marsh / Aon Hotel Market Update 2023–2024",
    methodology: "Insurance market hardening 2021–2024; reinsurance capacity withdrawal from CAT-exposed markets; FL and CA at high end" },
  { metricKey: "insurance-cost-inflation", label: "Insurance Cost Inflation — Southern Europe",
    country: "ES",
    low: 8.0, mid: 10.0, high: 12.0, unit: "percent_annual",
    source: "MAPFRE / Lloyd's Europe Market Update 2024",
    methodology: "Moderate hardening; EU reinsurance market less stressed than US; climate risk creeping into Adriatic and Mediterranean coastal exposure" },
];

export async function seedFixedCostBenchmarks(): Promise<void> {
  for (const r of FIXED_COST_BENCHMARKS) {
    await upsertRange({
      domain: "risk", metricKey: r.metricKey, label: r.label,
      country: r.country, subdivision: r.subdivision ?? null,
      year: YEAR,
      low: r.low, mid: r.mid, high: r.high, unit: r.unit,
      sourceName: r.source, sourceUrl: r.sourceUrl ?? null,
      methodology: r.methodology ?? null,
      confidence: r.sourceUrl ? "medium" : "low",
    });
  }
  logger.info(`Seeded fixed cost benchmarks: ${FIXED_COST_BENCHMARKS.length} rows`, TAG);
}

// ── Pass 11: Tax benchmarks (Table 10) ───────────────────────────────────────

const TAX_BENCHMARKS: Array<{
  metricKey: string; label: string; country: string; subdivision?: string;
  low: number; mid: number; high: number; unit: string;
  source: string; sourceUrl?: string; methodology?: string;
}> = [
  // ── Corporate income tax ──
  { metricKey: "corporate-tax-rate", label: "Corporate Income Tax — US (Federal)",
    country: "US",
    low: 21.0, mid: 21.0, high: 21.0, unit: "percent",
    source: "IRS / Tax Cuts and Jobs Act 2017 (effective 2018)", sourceUrl: "https://www.irs.gov",
    methodology: "Flat federal rate since TCJA 2017; combined federal + state effective rate typically 25–29%; state rates from 0% (TX, FL) to 9.8% (MN)" },
  { metricKey: "corporate-tax-rate-combined", label: "Corporate Income Tax — US (Federal + State effective)",
    country: "US",
    low: 23.0, mid: 26.5, high: 30.0, unit: "percent",
    source: "Tax Foundation / KPMG Corporate Tax Survey 2024",
    methodology: "Federal 21% + blended state; leisure-heavy states (FL, NV) at low end; high-state-tax markets (CA, NY, MN) at high end" },
  { metricKey: "corporate-tax-rate", label: "Corporate Income Tax — Spain",
    country: "ES",
    low: 25.0, mid: 25.0, high: 25.0, unit: "percent",
    source: "Agencia Tributaria España 2024", sourceUrl: "https://www.agenciatributaria.es",
    methodology: "Impuesto sobre Sociedades; standard rate 25%; 15% for newly created companies first 2 profitable years; 23% for SMEs <1M revenue" },
  { metricKey: "corporate-tax-rate", label: "Corporate Income Tax — Italy",
    country: "IT",
    low: 24.0, mid: 27.9, high: 27.9, unit: "percent",
    source: "Agenzia delle Entrate Italy 2024", sourceUrl: "https://www.agenziaentrate.gov.it",
    methodology: "IRES 24% + IRAP (regional business tax) 3.9% standard; IRAP varies by region; hotel sector typically IRES + IRAP = 27.9%" },
  { metricKey: "corporate-tax-rate", label: "Corporate Income Tax — Greece",
    country: "GR",
    low: 22.0, mid: 22.0, high: 22.0, unit: "percent",
    source: "AADE Greece / KPMG Greece 2024",
    methodology: "Corporate income tax 22%; reduced 10-year tax holiday available for hotel investments above EUR 3M in qualifying zones" },
  { metricKey: "corporate-tax-rate", label: "Corporate Income Tax — Portugal",
    country: "PT",
    low: 21.0, mid: 21.0, high: 31.5, unit: "percent",
    source: "Autoridade Tributária Portugal 2024",
    methodology: "IRC standard 21%; municipal surtax (derrama) up to 1.5%; state surtax on profits above EUR 1.5M; some Madeira IFIZ zones at reduced rates" },
  // ── VAT / Tourism services ──
  { metricKey: "vat-hotel-services", label: "VAT on Hotel Services — Spain",
    country: "ES",
    low: 10.0, mid: 10.0, high: 21.0, unit: "percent",
    source: "Agencia Tributaria España 2024",
    methodology: "Reduced rate 10% applies to hotel accommodation and restaurant services; standard 21% applies to non-food retail, some ancillary services; Canary Islands IGIC 7%" },
  { metricKey: "vat-hotel-services", label: "VAT on Hotel Services — Italy",
    country: "IT",
    low: 10.0, mid: 10.0, high: 22.0, unit: "percent",
    source: "Agenzia delle Entrate Italy 2024",
    methodology: "Reduced rate 10% on accommodation; restaurant services 10%; standard 22% on retail/non-food; reduced 5% on some cultural services" },
  { metricKey: "vat-hotel-services", label: "VAT on Hotel Services — Greece",
    country: "GR",
    low: 13.0, mid: 13.0, high: 24.0, unit: "percent",
    source: "AADE Greece 2024",
    methodology: "Reduced rate 13% on hotel accommodation; restaurant services 13%; standard 24% on most other services; Aegean island rates 30% lower (e.g. 9%/16%)" },
  { metricKey: "vat-hotel-services", label: "VAT on Hotel Services — Portugal",
    country: "PT",
    low: 6.0, mid: 6.0, high: 23.0, unit: "percent",
    source: "Autoridade Tributária Portugal 2024",
    methodology: "Reduced rate 6% on hotel accommodation; restaurant food 6%; beverages 13%; standard 23%; Azores/Madeira lower rates" },
  // ── Property transfer tax ──
  { metricKey: "property-transfer-tax", label: "Property Transfer Tax — US",
    country: "US",
    low: 0.5, mid: 2.5, high: 5.0, unit: "percent",
    source: "CBRE Hotels Capital Markets / Lincoln Institute 2024",
    methodology: "State + local deed/transfer taxes; TX and FL at low end; NY (1.425%–2.075%), CA, and RETT-heavy states at high end; entity-level transfers (stock deals) may avoid" },
  { metricKey: "property-transfer-tax", label: "Transfer Tax ITP — Spain (on existing buildings)",
    country: "ES",
    low: 6.0, mid: 8.5, high: 11.0, unit: "percent",
    source: "Ministerio de Hacienda España / IHOTELS 2024",
    methodology: "Impuesto de Transmisiones Patrimoniales; buyer-side tax on resale buildings; rate set by Autonomous Community: Madrid 6%, Cataluña 10%, Andalucía 7%; new builds use IVA+AJD instead" },
  { metricKey: "property-transfer-tax", label: "Transfer Tax — Italy",
    country: "IT",
    low: 2.0, mid: 5.5, high: 9.0, unit: "percent",
    source: "Agenzia delle Entrate Italy 2024",
    methodology: "Imposta di registro: 2% for primary residence, 9% commercial (hotels); VAT option on new builds at 10%+registration; luxury hotel reclassification reduces rate in some regions" },
  { metricKey: "property-transfer-tax", label: "Transfer Tax — Greece",
    country: "GR",
    low: 3.0, mid: 3.0, high: 3.0, unit: "percent",
    source: "AADE Greece 2024",
    methodology: "Fixed 3% property transfer tax; seller declares value; VAT 24% applies on new residential transfers from developers but hotels typically follow transfer tax regime" },
  // ── Capital gains tax ──
  { metricKey: "capital-gains-tax", label: "Capital Gains Tax — US (Long-term Federal)",
    country: "US",
    low: 20.0, mid: 23.8, high: 23.8, unit: "percent",
    source: "IRS / Investment Income Tax 2024", sourceUrl: "https://www.irs.gov",
    methodology: "Long-term (>1 year): 20% federal + 3.8% NIIT for high-income; depreciation recapture taxed at 25%; combined state+federal can reach 33–37% in high-tax states" },
  { metricKey: "capital-gains-tax", label: "Capital Gains Tax — Spain",
    country: "ES",
    low: 19.0, mid: 23.0, high: 26.0, unit: "percent",
    source: "Agencia Tributaria España 2024",
    methodology: "Impuesto sobre las Ganancias Patrimoniales: 19% up to EUR 6k, 21% EUR 6–50k, 23% EUR 50–200k, 26% above EUR 200k; participations exemption may apply for qualifying holding structures" },
  { metricKey: "capital-gains-tax", label: "Capital Gains Tax — Italy",
    country: "IT",
    low: 24.0, mid: 26.0, high: 26.0, unit: "percent",
    source: "Agenzia delle Entrate Italy 2024",
    methodology: "Plusvalenza: IRES 24%; cedolare secca 26% for individuals; participation exemption 95% for qualifying holdings; holding-period discount eliminated 2019" },
  { metricKey: "capital-gains-tax", label: "Capital Gains Tax — Greece",
    country: "GR",
    low: 15.0, mid: 15.0, high: 15.0, unit: "percent",
    source: "AADE Greece 2024",
    methodology: "Flat 15% on real property gains; exemption for primary residence; 5-year transfer moratorium on subsidized development zones" },
];

export async function seedTaxBenchmarks(): Promise<void> {
  for (const r of TAX_BENCHMARKS) {
    await upsertRange({
      domain: "tax", metricKey: r.metricKey, label: r.label,
      country: r.country, subdivision: r.subdivision ?? null,
      year: YEAR,
      low: r.low, mid: r.mid, high: r.high, unit: r.unit,
      sourceName: r.source, sourceUrl: r.sourceUrl ?? null,
      methodology: r.methodology ?? null,
      confidence: r.sourceUrl ? "medium" : "low",
    });
  }
  logger.info(`Seeded tax benchmarks: ${TAX_BENCHMARKS.length} rows`, TAG);
}
