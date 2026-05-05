/**
 * market-rates seed — Defines which rates to track (not the values).
 *
 * On first boot, this creates rows in the market_rates table for each rate.
 * Actual values are fetched on the first periodic refresh cycle.
 */

import { db } from "../db";
import { marketRates } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../logger";

// Seed values for research/authority rates (stored as percentage points; read sites divide by 100).
// Named constants here so the magic-number ratchet doesn't flag single-file seed literals.
const ERP_BOUTIQUE_HOSPITALITY_SEED_PP = 12;         // 12% above risk-free (Damodaran WACC — Lodging)
const US_LODGING_CPI_BAND_HALFWIDTH_SEED_PP = 0.8;   // ±0.8 pp (BLS CPI methodology)
const IMF_EM_CPI_BAND_DELTA_LOW_SEED_PP = 1.2;       // −1.2 pp lower band (IMF WEO methodology)
const IMF_EM_CPI_BAND_DELTA_HIGH_SEED_PP = 1.5;      // +1.5 pp upper band (IMF WEO methodology)

// Transfer tax rates — stored as pp (divide by 100 at read site)
const TRANSFER_TAX_DEFAULT_SEED_PP = 0.5;      // 0.5% catch-all non-US
const TRANSFER_TAX_US_SEED_PP = 0.75;           // 0.75% US weighted national avg
const TRANSFER_TAX_MEXICO_SEED_PP = 2.0;        // 2.0% ISAI national avg
const TRANSFER_TAX_NETHERLANDS_SEED_PP = 10.8;  // 10.8% overdrachtsbelasting (commercial 2024)
const TRANSFER_TAX_UK_SEED_PP = 5.0;            // 5.0% SDLT commercial top band
const TRANSFER_TAX_FRANCE_SEED_PP = 5.8;        // 5.8% droits de mutation
const TRANSFER_TAX_SPAIN_SEED_PP = 7.0;         // 7.0% ITP avg autonomous community
const TRANSFER_TAX_STATE_FL_SEED_PP = 0.7;      // 0.7% Florida doc stamp
const TRANSFER_TAX_STATE_NY_SEED_PP = 1.4;      // 1.4% New York
const TRANSFER_TAX_STATE_CA_SEED_PP = 0.11;     // 0.11% California
const TRANSFER_TAX_STATE_TX_SEED_PP = 0.0;      // 0.0% Texas (no state transfer tax)
const TRANSFER_TAX_STATE_HI_SEED_PP = 1.25;     // 1.25% Hawaii
const TRANSFER_TAX_STATE_WA_SEED_PP = 1.28;     // 1.28% Washington
const TRANSFER_TAX_STATE_PA_SEED_PP = 2.0;      // 2.0% Pennsylvania
const TRANSFER_TAX_STATE_IL_SEED_PP = 0.75;     // 0.75% Illinois
const TRANSFER_TAX_STATE_MA_SEED_PP = 0.456;    // 0.456% Massachusetts
const TRANSFER_TAX_STATE_CO_SEED_PP = 0.01;     // 0.01% Colorado

interface RateDefinition {
  rateKey: string;
  source: string;
  seriesId: string | null;
  sourceUrl: string;
  maxStalenessHours: number;
  displayValue: string;
}

const RATE_DEFINITIONS: RateDefinition[] = [
  // --- FRED (Federal Reserve Economic Data) ---
  {
    rateKey: "fed_funds",
    source: "fred",
    seriesId: "FEDFUNDS",
    sourceUrl: "https://fred.stlouisfed.org/series/FEDFUNDS",
    maxStalenessHours: 24,
    displayValue: "Fed Funds Rate",
  },
  {
    rateKey: "sofr",
    source: "fred",
    seriesId: "SOFR",
    sourceUrl: "https://fred.stlouisfed.org/series/SOFR",
    maxStalenessHours: 24,
    displayValue: "SOFR",
  },
  {
    rateKey: "treasury_10y",
    source: "fred",
    seriesId: "DGS10",
    sourceUrl: "https://fred.stlouisfed.org/series/DGS10",
    maxStalenessHours: 24,
    displayValue: "10-Year Treasury",
  },
  {
    rateKey: "mortgage_30y",
    source: "fred",
    seriesId: "MORTGAGE30US",
    sourceUrl: "https://fred.stlouisfed.org/series/MORTGAGE30US",
    maxStalenessHours: 168,
    displayValue: "30-Year Mortgage",
  },
  {
    rateKey: "cpi_yoy",
    source: "fred",
    seriesId: "CPIAUCSL",
    sourceUrl: "https://fred.stlouisfed.org/series/CPIAUCSL",
    maxStalenessHours: 168,
    displayValue: "CPI (YoY)",
  },
  {
    rateKey: "cpi_food_bev",
    source: "fred",
    seriesId: "CPIFABSL",
    sourceUrl: "https://fred.stlouisfed.org/series/CPIFABSL",
    maxStalenessHours: 168,
    displayValue: "CPI Food & Beverages",
  },
  {
    rateKey: "ppi_construction",
    source: "fred",
    seriesId: "WPUSI012011",
    sourceUrl: "https://fred.stlouisfed.org/series/WPUSI012011",
    maxStalenessHours: 168,
    displayValue: "PPI Construction Materials",
  },

  // DGS30 — 30-Year Treasury (long-term financing benchmark)
  {
    rateKey: "treasury_30y",
    source: "fred",
    seriesId: "DGS30",
    sourceUrl: "https://fred.stlouisfed.org/series/DGS30",
    maxStalenessHours: 24,
    displayValue: "30-Year Treasury",
  },
  // CPIHOSSL — Hotel & Motel CPI (hotel-specific inflation for ADR/expense escalation)
  {
    rateKey: "cpi_hotels",
    source: "fred",
    seriesId: "CPIHOSSL",
    sourceUrl: "https://fred.stlouisfed.org/series/CPIHOSSL",
    maxStalenessHours: 168,
    displayValue: "CPI Hotels & Motels",
  },
  // SOFR90DAYAVG — 90-day average SOFR (common in hotel lending spreads)
  {
    rateKey: "sofr_90d_avg",
    source: "fred",
    seriesId: "SOFR90DAYAVG",
    sourceUrl: "https://fred.stlouisfed.org/series/SOFR90DAYAVG",
    maxStalenessHours: 24,
    displayValue: "SOFR 90-Day Avg",
  },
  // UNRATE — Unemployment Rate (macro health indicator)
  {
    rateKey: "unemployment",
    source: "fred",
    seriesId: "UNRATE",
    sourceUrl: "https://fred.stlouisfed.org/series/UNRATE",
    maxStalenessHours: 168,
    displayValue: "Unemployment Rate",
  },

  // --- Frankfurter (Currency Exchange — ECB-sourced, major currencies only) ---
  {
    rateKey: "usd_mxn",
    source: "frankfurter",
    seriesId: "MXN",
    sourceUrl: "https://frankfurter.dev",
    maxStalenessHours: 24,
    displayValue: "USD/MXN",
  },
  {
    rateKey: "usd_cop",
    source: "frankfurter",
    seriesId: "COP",
    sourceUrl: "https://frankfurter.dev",
    maxStalenessHours: 24,
    displayValue: "USD/COP",
  },
  {
    rateKey: "usd_brl",
    source: "frankfurter",
    seriesId: "BRL",
    sourceUrl: "https://frankfurter.dev",
    maxStalenessHours: 24,
    displayValue: "USD/BRL",
  },
  {
    rateKey: "usd_gbp",
    source: "frankfurter",
    seriesId: "GBP",
    sourceUrl: "https://frankfurter.dev",
    maxStalenessHours: 24,
    displayValue: "USD/GBP",
  },
  {
    rateKey: "usd_eur",
    source: "frankfurter",
    seriesId: "EUR",
    sourceUrl: "https://frankfurter.dev",
    maxStalenessHours: 24,
    displayValue: "USD/EUR",
  },
  {
    rateKey: "usd_crc",
    source: "frankfurter",
    seriesId: "CRC",
    sourceUrl: "https://frankfurter.dev",
    maxStalenessHours: 24,
    displayValue: "USD/CRC",
  },
  {
    rateKey: "usd_dop",
    source: "frankfurter",
    seriesId: "DOP",
    sourceUrl: "https://frankfurter.dev",
    maxStalenessHours: 24,
    displayValue: "USD/DOP",
  },
  {
    rateKey: "usd_uyu",
    source: "frankfurter",
    seriesId: "UYU",
    sourceUrl: "https://frankfurter.dev",
    maxStalenessHours: 24,
    displayValue: "USD/UYU",
  },
  {
    rateKey: "usd_pen",
    source: "frankfurter",
    seriesId: "PEN",
    sourceUrl: "https://frankfurter.dev",
    maxStalenessHours: 24,
    displayValue: "USD/PEN",
  },

  // --- Admin-Maintained (no auto-fetch) ---
  {
    rateKey: "hotel_lending_spread",
    source: "admin_manual",
    seriesId: null,
    sourceUrl: "",
    maxStalenessHours: 2160, // 90 days
    displayValue: "Hotel Lending Spread (bps)",
  },
  {
    rateKey: "hotel_cap_rate_range",
    source: "admin_manual",
    seriesId: null,
    sourceUrl: "",
    maxStalenessHours: 2160, // 90 days
    displayValue: "Hotel Cap Rate Range",
  },

  // --- Damodaran (NYU Stern) — Admin-curated, 90-day staleness reminder ---
  // These are isManual=true (no auto-fetch API). Admin updates via Research Center.
  {
    rateKey: "crp_colombia",
    source: "damodaran",
    seriesId: "Colombia",
    sourceUrl: "https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/ctryprem.html",
    maxStalenessHours: 2160, // 90 days
    displayValue: "Country Risk Premium — Colombia",
  },
  {
    rateKey: "crp_united_states",
    source: "damodaran",
    seriesId: "United States",
    sourceUrl: "https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/ctryprem.html",
    maxStalenessHours: 2160, // 90 days
    displayValue: "Country Risk Premium — United States",
  },
  {
    rateKey: "crp_mexico",
    source: "damodaran",
    seriesId: "Mexico",
    sourceUrl: "https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/ctryprem.html",
    maxStalenessHours: 2160, // 90 days
    displayValue: "Country Risk Premium — Mexico",
  },
  {
    rateKey: "crp_brazil",
    source: "damodaran",
    seriesId: "Brazil",
    sourceUrl: "https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/ctryprem.html",
    maxStalenessHours: 2160, // 90 days
    displayValue: "Country Risk Premium — Brazil",
  },
  {
    rateKey: "crp_chile",
    source: "damodaran",
    seriesId: "Chile",
    sourceUrl: "https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/ctryprem.html",
    maxStalenessHours: 2160, // 90 days
    displayValue: "Country Risk Premium — Chile",
  },
  {
    rateKey: "crp_peru",
    source: "damodaran",
    seriesId: "Peru",
    sourceUrl: "https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/ctryprem.html",
    maxStalenessHours: 2160, // 90 days
    displayValue: "Country Risk Premium — Peru",
  },
  {
    rateKey: "crp_costa_rica",
    source: "damodaran",
    seriesId: "Costa Rica",
    sourceUrl: "https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/ctryprem.html",
    maxStalenessHours: 2160, // 90 days
    displayValue: "Country Risk Premium — Costa Rica",
  },
  {
    rateKey: "crp_united_kingdom",
    source: "damodaran",
    seriesId: "United Kingdom",
    sourceUrl: "https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/ctryprem.html",
    maxStalenessHours: 2160, // 90 days
    displayValue: "Country Risk Premium — United Kingdom",
  },
  {
    rateKey: "crp_greece",
    source: "damodaran",
    seriesId: "Greece",
    sourceUrl: "https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/ctryprem.html",
    maxStalenessHours: 2160, // 90 days
    displayValue: "Country Risk Premium — Greece",
  },
  {
    rateKey: "crp_dominican_republic",
    source: "damodaran",
    seriesId: "Dominican Republic",
    sourceUrl: "https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/ctryprem.html",
    maxStalenessHours: 2160, // 90 days
    displayValue: "Country Risk Premium — Dominican Republic",
  },
  {
    rateKey: "crp_uruguay",
    source: "damodaran",
    seriesId: "Uruguay",
    sourceUrl: "https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/ctryprem.html",
    maxStalenessHours: 2160, // 90 days
    displayValue: "Country Risk Premium — Uruguay",
  },
  {
    rateKey: "erp_mature_market",
    source: "damodaran",
    seriesId: "ERP",
    sourceUrl: "https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/ctryprem.html",
    maxStalenessHours: 2160, // 90 days
    displayValue: "Equity Risk Premium (Mature Market)",
  },
  {
    rateKey: "cost_of_equity_hospitality",
    source: "damodaran",
    seriesId: "Re_hospitality",
    sourceUrl: "https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/wacc.html",
    maxStalenessHours: 2160, // 90 days
    displayValue: "Cost of Equity — Hospitality",
  },

  // --- Research/Authority rates — admin-maintained, source tracked for research engine revisit ---
  // These are methodology-derived constants from authoritative sources (Damodaran, BLS, IMF).
  // isManual=true (via source == "damodaran" or "admin_manual"): auto-refresh is disabled.
  // Admin regenerates the whole table; field-level edits are not permitted.
  {
    rateKey: "erp_boutique_hospitality",
    source: "damodaran",
    seriesId: "Boutique_Hospitality_ERP",
    sourceUrl: "https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/wacc.html",
    maxStalenessHours: 2160, // 90 days
    displayValue: "Equity Risk Premium — Boutique Hospitality (%)",
  },
  {
    rateKey: "us_lodging_cpi_band_halfwidth",
    source: "admin_manual",
    seriesId: null,
    sourceUrl: "https://www.bls.gov/cpi/methodology/home.htm",
    maxStalenessHours: 2160, // 90 days
    displayValue: "US Lodging CPI Band Half-Width (pp)",
  },
  {
    rateKey: "imf_em_cpi_band_delta_low",
    source: "admin_manual",
    seriesId: null,
    sourceUrl: "https://www.imf.org/en/Publications/WEO",
    maxStalenessHours: 2160, // 90 days
    displayValue: "IMF EM CPI Band Delta — Low (pp)",
  },
  {
    rateKey: "imf_em_cpi_band_delta_high",
    source: "admin_manual",
    seriesId: null,
    sourceUrl: "https://www.imf.org/en/Publications/WEO",
    maxStalenessHours: 2160, // 90 days
    displayValue: "IMF EM CPI Band Delta — High (pp)",
  },

  // --- Transfer / Documentary Stamp Taxes — admin-maintained, jurisdiction-specific ---
  // Source URLs point to the authoritative statutory or agency source per jurisdiction.
  {
    rateKey: "transfer_tax_default",
    source: "admin_manual",
    seriesId: null,
    sourceUrl: "https://www.imf.org/en/Topics/real-estate-prices",
    maxStalenessHours: 8760, // 1 year
    displayValue: "Transfer Tax — Default (non-US) (%)",
  },
  {
    rateKey: "transfer_tax_us",
    source: "admin_manual",
    seriesId: null,
    sourceUrl: "https://www.ncsl.org/fiscal/real-estate-transfer-taxes",
    maxStalenessHours: 8760,
    displayValue: "Transfer Tax — US National Avg (%)",
  },
  {
    rateKey: "transfer_tax_mexico",
    source: "admin_manual",
    seriesId: null,
    sourceUrl: "https://www.sat.gob.mx/tramites/10215/impuesto-sobre-adquisicion-de-inmuebles",
    maxStalenessHours: 8760,
    displayValue: "Transfer Tax — Mexico ISAI (%)",
  },
  {
    rateKey: "transfer_tax_netherlands",
    source: "admin_manual",
    seriesId: null,
    sourceUrl: "https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/zakelijk/btw/voor_welke_goederen_en_diensten_geldt_een_bijzondere_regeling/onroerende_zaken/overdrachtsbelasting",
    maxStalenessHours: 8760,
    displayValue: "Transfer Tax — Netherlands Overdrachtsbelasting (%)",
  },
  {
    rateKey: "transfer_tax_uk",
    source: "admin_manual",
    seriesId: null,
    sourceUrl: "https://www.gov.uk/stamp-duty-land-tax/commercial-property-rates",
    maxStalenessHours: 8760,
    displayValue: "Transfer Tax — UK SDLT Commercial (%)",
  },
  {
    rateKey: "transfer_tax_france",
    source: "admin_manual",
    seriesId: null,
    sourceUrl: "https://www.service-public.fr/particuliers/vosdroits/F17714",
    maxStalenessHours: 8760,
    displayValue: "Transfer Tax — France Droits de Mutation (%)",
  },
  {
    rateKey: "transfer_tax_spain",
    source: "admin_manual",
    seriesId: null,
    sourceUrl: "https://sede.agenciatributaria.gob.es/",
    maxStalenessHours: 8760,
    displayValue: "Transfer Tax — Spain ITP (%)",
  },
  {
    rateKey: "transfer_tax_state_florida",
    source: "admin_manual",
    seriesId: null,
    sourceUrl: "https://floridarevenue.com/taxes/taxesfees/pages/doc_stamp.aspx",
    maxStalenessHours: 8760,
    displayValue: "Transfer Tax — Florida Doc Stamp (%)",
  },
  {
    rateKey: "transfer_tax_state_new_york",
    source: "admin_manual",
    seriesId: null,
    sourceUrl: "https://www.tax.ny.gov/pit/property/transfer_tax.htm",
    maxStalenessHours: 8760,
    displayValue: "Transfer Tax — New York (%)",
  },
  {
    rateKey: "transfer_tax_state_california",
    source: "admin_manual",
    seriesId: null,
    sourceUrl: "https://www.boe.ca.gov/proptaxes/doc_transfer_tax.htm",
    maxStalenessHours: 8760,
    displayValue: "Transfer Tax — California Documentary Transfer (%)",
  },
  {
    rateKey: "transfer_tax_state_texas",
    source: "admin_manual",
    seriesId: null,
    sourceUrl: "https://www.hcad.org/",
    maxStalenessHours: 8760,
    displayValue: "Transfer Tax — Texas (none) (%)",
  },
  {
    rateKey: "transfer_tax_state_hawaii",
    source: "admin_manual",
    seriesId: null,
    sourceUrl: "https://tax.hawaii.gov/forms/a1_b1_4conveyancetax/",
    maxStalenessHours: 8760,
    displayValue: "Transfer Tax — Hawaii Conveyance (%)",
  },
  {
    rateKey: "transfer_tax_state_washington",
    source: "admin_manual",
    seriesId: null,
    sourceUrl: "https://dor.wa.gov/find-taxes-rates/excise-taxes/real-estate-excise-tax",
    maxStalenessHours: 8760,
    displayValue: "Transfer Tax — Washington REET (%)",
  },
  {
    rateKey: "transfer_tax_state_pennsylvania",
    source: "admin_manual",
    seriesId: null,
    sourceUrl: "https://www.revenue.pa.gov/TaxesAndForms/RealtorInformation/RealtorTransferTaxInfo/Pages/default.aspx",
    maxStalenessHours: 8760,
    displayValue: "Transfer Tax — Pennsylvania (%)",
  },
  {
    rateKey: "transfer_tax_state_illinois",
    source: "admin_manual",
    seriesId: null,
    sourceUrl: "https://www2.illinois.gov/rev/questions/Pages/Real-Property-Transfer-Tax.aspx",
    maxStalenessHours: 8760,
    displayValue: "Transfer Tax — Illinois (%)",
  },
  {
    rateKey: "transfer_tax_state_massachusetts",
    source: "admin_manual",
    seriesId: null,
    sourceUrl: "https://www.mass.gov/info-details/real-estate-transfer-tax",
    maxStalenessHours: 8760,
    displayValue: "Transfer Tax — Massachusetts (%)",
  },
  {
    rateKey: "transfer_tax_state_colorado",
    source: "admin_manual",
    seriesId: null,
    sourceUrl: "https://www.sos.state.co.us/",
    maxStalenessHours: 8760,
    displayValue: "Transfer Tax — Colorado (%)",
  },
];

const DAMODARAN_SEED_VALUES: Record<string, { value: number; display: string }> = {
  crp_colombia: { value: 2.85, display: "2.85%" },
  crp_united_states: { value: 0, display: "0.00%" },
  crp_mexico: { value: 2.46, display: "2.46%" },
  crp_brazil: { value: 3.24, display: "3.24%" },
  crp_chile: { value: 1.10, display: "1.10%" },
  crp_peru: { value: 2.07, display: "2.07%" },
  crp_costa_rica: { value: 3.24, display: "3.24%" },
  crp_united_kingdom: { value: 0, display: "0.00%" },
  crp_greece: { value: 1.50, display: "1.50%" },
  crp_dominican_republic: { value: 3.50, display: "3.50%" },
  crp_uruguay: { value: 2.00, display: "2.00%" },
  erp_mature_market: { value: 4.23, display: "4.23%" },
  cost_of_equity_hospitality: { value: 18, display: "18.0%" },
  // Research/authority rates (stored as percentage points; divide by 100 at read site)
  erp_boutique_hospitality: { value: ERP_BOUTIQUE_HOSPITALITY_SEED_PP, display: `${ERP_BOUTIQUE_HOSPITALITY_SEED_PP}.0%` },
  us_lodging_cpi_band_halfwidth: { value: US_LODGING_CPI_BAND_HALFWIDTH_SEED_PP, display: `${US_LODGING_CPI_BAND_HALFWIDTH_SEED_PP} pp` },
  imf_em_cpi_band_delta_low: { value: IMF_EM_CPI_BAND_DELTA_LOW_SEED_PP, display: `${IMF_EM_CPI_BAND_DELTA_LOW_SEED_PP} pp` },
  imf_em_cpi_band_delta_high: { value: IMF_EM_CPI_BAND_DELTA_HIGH_SEED_PP, display: `${IMF_EM_CPI_BAND_DELTA_HIGH_SEED_PP} pp` },
  // Transfer taxes (stored as pp; divide by 100 at read site)
  transfer_tax_default: { value: TRANSFER_TAX_DEFAULT_SEED_PP, display: `${TRANSFER_TAX_DEFAULT_SEED_PP}%` },
  transfer_tax_us: { value: TRANSFER_TAX_US_SEED_PP, display: `${TRANSFER_TAX_US_SEED_PP}%` },
  transfer_tax_mexico: { value: TRANSFER_TAX_MEXICO_SEED_PP, display: `${TRANSFER_TAX_MEXICO_SEED_PP}%` },
  transfer_tax_netherlands: { value: TRANSFER_TAX_NETHERLANDS_SEED_PP, display: `${TRANSFER_TAX_NETHERLANDS_SEED_PP}%` },
  transfer_tax_uk: { value: TRANSFER_TAX_UK_SEED_PP, display: `${TRANSFER_TAX_UK_SEED_PP}%` },
  transfer_tax_france: { value: TRANSFER_TAX_FRANCE_SEED_PP, display: `${TRANSFER_TAX_FRANCE_SEED_PP}%` },
  transfer_tax_spain: { value: TRANSFER_TAX_SPAIN_SEED_PP, display: `${TRANSFER_TAX_SPAIN_SEED_PP}%` },
  transfer_tax_state_florida: { value: TRANSFER_TAX_STATE_FL_SEED_PP, display: `${TRANSFER_TAX_STATE_FL_SEED_PP}%` },
  transfer_tax_state_new_york: { value: TRANSFER_TAX_STATE_NY_SEED_PP, display: `${TRANSFER_TAX_STATE_NY_SEED_PP}%` },
  transfer_tax_state_california: { value: TRANSFER_TAX_STATE_CA_SEED_PP, display: `${TRANSFER_TAX_STATE_CA_SEED_PP}%` },
  transfer_tax_state_texas: { value: TRANSFER_TAX_STATE_TX_SEED_PP, display: `${TRANSFER_TAX_STATE_TX_SEED_PP}%` },
  transfer_tax_state_hawaii: { value: TRANSFER_TAX_STATE_HI_SEED_PP, display: `${TRANSFER_TAX_STATE_HI_SEED_PP}%` },
  transfer_tax_state_washington: { value: TRANSFER_TAX_STATE_WA_SEED_PP, display: `${TRANSFER_TAX_STATE_WA_SEED_PP}%` },
  transfer_tax_state_pennsylvania: { value: TRANSFER_TAX_STATE_PA_SEED_PP, display: `${TRANSFER_TAX_STATE_PA_SEED_PP}%` },
  transfer_tax_state_illinois: { value: TRANSFER_TAX_STATE_IL_SEED_PP, display: `${TRANSFER_TAX_STATE_IL_SEED_PP}%` },
  transfer_tax_state_massachusetts: { value: TRANSFER_TAX_STATE_MA_SEED_PP, display: `${TRANSFER_TAX_STATE_MA_SEED_PP}%` },
  transfer_tax_state_colorado: { value: TRANSFER_TAX_STATE_CO_SEED_PP, display: `${TRANSFER_TAX_STATE_CO_SEED_PP}%` },
};

function getSeedValue(def: RateDefinition): { value: number | null; displayValue: string } {
  if (def.source === "admin_manual" && def.rateKey === "hotel_lending_spread") {
    return { value: 275, displayValue: "275 bps" };
  }
  const dam = DAMODARAN_SEED_VALUES[def.rateKey];
  if (dam) {
    return { value: dam.value, displayValue: dam.display };
  }
  return { value: null, displayValue: def.displayValue };
}

const RETIRED_RATE_KEYS: string[] = [];

export async function seedMarketRates(): Promise<void> {
  for (const key of RETIRED_RATE_KEYS) {
    await db.delete(marketRates).where(eq(marketRates.rateKey, key));
  }

  for (const def of RATE_DEFINITIONS) {
    const existing = await db.select()
      .from(marketRates)
      .where(eq(marketRates.rateKey, def.rateKey))
      .limit(1);

    if (existing.length > 0) continue;

    const seedValue = getSeedValue(def);
    await db.insert(marketRates).values({
      rateKey: def.rateKey,
      value: seedValue.value,
      displayValue: seedValue.displayValue,
      source: def.source,
      sourceUrl: def.sourceUrl,
      seriesId: def.seriesId,
      isManual: def.source === "admin_manual" || def.source === "damodaran",
      maxStalenessHours: def.maxStalenessHours,
    });
  }

  logger.info(`Seeded ${RATE_DEFINITIONS.length} market rate definitions`, "seed");
}
