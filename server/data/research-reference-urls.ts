/**
 * research-reference-urls.ts — Curated reference links for research engines.
 *
 * These URLs are injected into research prompts to guide LLMs toward authoritative
 * sources. They are NOT scraped automatically — they provide context about where
 * the best data lives so the research AI can cite and recommend them.
 *
 * Maintained manually. Update when sources publish new editions or change URLs.
 * Last audited: 2026-04-13.
 */

export const HOSPITALITY_REFERENCE_URLS = {
  // ── Industry Benchmarks ────────────────────────────────────────────────
  str_trend_report: "https://str.com/data-solutions/industry-trend-reports",
  str_pipeline: "https://str.com/data-solutions/supply-pipeline",
  cbre_cap_rate_survey: "https://www.cbre.com/insights/figures/us-cap-rate-survey",
  cbre_hotel_state_of_union: "https://www.cbre.com/insights/books/us-hotels-state-of-the-union",
  hvs_publications: "https://www.hvs.com/publications",
  pkf_hospitality_research: "https://www.pkf.com/hospitality-research",
  hotstats_benchmarks: "https://www.hotstats.com",
  horwath_htl_publications: "https://horwathhtl.com/publications",
  jll_hotel_investment_outlook: "https://www.jll.com/en/trends-and-insights/investor/hotel-investment-outlook",

  // ── Government / Regulatory ────────────────────────────────────────────
  irs_depreciation: "https://www.irs.gov/publications/p946",
  irs_cost_segregation: "https://www.irs.gov/businesses/cost-segregation-audit-techniques-guide-table-of-contents",
  sba_hotel_lending: "https://www.sba.gov/funding-programs/loans/7a-loans",
  sba_504_loans: "https://www.sba.gov/funding-programs/loans/504-loans",
  colombia_rnt: "https://www.mincit.gov.co/minturismo/registro-nacional-de-turismo",
  colombia_dian: "https://www.dian.gov.co",
  mexico_sectur: "https://www.gob.mx/sectur",
  costa_rica_ict: "https://www.ict.go.cr",
  canada_cra_cca: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/sole-proprietorships-partnerships/report-business-income-expenses/claiming-capital-cost-allowance.html",
  france_legifrance: "https://www.legifrance.gouv.fr",
  spain_agencia_tributaria: "https://www.agenciatributaria.es",

  // ── Macro Economic Data APIs ───────────────────────────────────────────
  fred_api_docs: "https://fred.stlouisfed.org/docs/api/fred/",
  fred_sofr: "https://fred.stlouisfed.org/series/SOFR",
  fred_10y_treasury: "https://fred.stlouisfed.org/series/DGS10",
  fred_30y_mortgage: "https://fred.stlouisfed.org/series/MORTGAGE30US",
  fred_cpi_hotels: "https://fred.stlouisfed.org/series/CPIHOSSL",
  fred_unemployment: "https://fred.stlouisfed.org/series/UNRATE",
  frankfurter_api: "https://api.frankfurter.app",
  world_bank_api: "https://api.worldbank.org/v2",
  bls_data: "https://www.bls.gov/data/",

  // ── Hospitality Accounting ─────────────────────────────────────────────
  usali_12th: "https://www.ahla.com/usali",
  withum_usali_guide: "https://www.withum.com/resources/usali-12th-edition-aligning-hotel-accounting-with-modern-hospitality/",

  // ── Finance & Valuation ────────────────────────────────────────────────
  damodaran_country_risk: "https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/ctryprem.html",
  damodaran_wacc: "https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/wacc.html",
  damodaran_betas: "https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/totalbeta.html",
  damodaran_erp: "https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/implpr.html",

  // ── Industry Organizations ─────────────────────────────────────────────
  ahla_research: "https://www.ahla.com/research",
  aahoa_resources: "https://www.aahoa.com/resources",
  ishc_publications: "https://www.ishc.com/publications",
  blla_boutique: "https://www.bfrands.com",

  // ── Vertical Markets (Wellness, Retreats, Events) ─────────────────────
  global_wellness_institute: "https://globalwellnessinstitute.org/industry-research/",
  wellness_tourism_association: "https://www.wellnesstourismassociation.org",
  gwi_wellness_economy: "https://globalwellnessinstitute.org/the-global-wellness-economy/",

  // ── Real Estate / Transactions ─────────────────────────────────────────
  costar_analytics: "https://www.costar.com/products/costar-suite",
  real_capital_analytics: "https://www.msci.com/our-solutions/real-assets/real-capital-analytics",
  lodging_econometrics: "https://lodgingeconometrics.com",

  // ── Comp Set / STR Scraping Sources ────────────────────────────────────
  airbnb: "https://www.airbnb.com",
  vrbo: "https://www.vrbo.com",
  booking_com: "https://www.booking.com",
  tripadvisor: "https://www.tripadvisor.com",
  hotels_com: "https://www.hotels.com",

  // ── Walk Score & Location Quality ──────────────────────────────────────
  walk_score_methodology: "https://www.walkscore.com/methodology.shtml",
  walk_score_api_docs: "https://www.walkscore.com/professional/api.php",
} as const;

/**
 * Grouped by research engine context — which URLs to inject for each engine type.
 */
export const REFERENCE_URL_GROUPS = {
  adr_research: [
    "str_trend_report", "cbre_hotel_state_of_union", "hotstats_benchmarks",
    "pkf_hospitality_research", "hvs_publications",
  ],
  cap_rate_research: [
    "cbre_cap_rate_survey", "jll_hotel_investment_outlook", "hvs_publications",
    "damodaran_country_risk", "damodaran_wacc",
  ],
  operating_cost_research: [
    "pkf_hospitality_research", "hotstats_benchmarks", "usali_12th",
    "str_trend_report", "ishc_publications",
  ],
  macro_economic_research: [
    "fred_api_docs", "fred_sofr", "fred_10y_treasury", "fred_cpi_hotels",
    "world_bank_api", "bls_data",
  ],
  tax_depreciation_research: [
    "irs_depreciation", "irs_cost_segregation", "colombia_dian",
    "canada_cra_cca", "france_legifrance", "spain_agencia_tributaria",
  ],
  wellness_vertical_research: [
    "global_wellness_institute", "wellness_tourism_association",
    "gwi_wellness_economy",
  ],
  comp_set_research: [
    "airbnb", "vrbo", "booking_com", "tripadvisor", "hotels_com",
    "str_trend_report",
  ],
  location_quality_research: [
    "walk_score_methodology", "walk_score_api_docs",
  ],
  regulatory_research: [
    "colombia_rnt", "mexico_sectur", "costa_rica_ict",
    "sba_hotel_lending", "sba_504_loans",
  ],
} as const;
