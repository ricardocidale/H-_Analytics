/**
 * live-comparables.ts — NAI-28: Live comparable fetchers for all 7 specialist runners.
 *
 * Re-export barrel. Implementation lives in ./live-comparables/ — split
 * per-specialist so each domain's data sources can be reviewed independently.
 * Importers resolve via this file unchanged.
 *
 * Each `getXxxComparables()` function:
 *   1. Tries free public APIs (non-fatal — 8 s timeout).
 *   2. Falls back to the canned dataset on any error.
 *   3. Logs "live" vs "canned" so the activity stream is transparent.
 *
 * Live sources wired today:
 *
 *   PropertyRisk   FRED CUSR0000SAH21 units=pc1 (US lodging CPI YoY %)
 *                  + IMF WEO REST PCPIPCH/EMG (EM aggregate inflation projection)
 *                  EU Eurostat HICP row kept canned (SDMX parsing deferred).
 *
 *   Company        FRED DGS10 (10-yr Treasury yield) → live US costOfEquity anchor.
 *                  Equity risk premium for boutique hospitality management sourced from
 *                  market_rates.erp_boutique_hospitality (Damodaran WACC — Lodging).
 *                  Corporate tax rate sourced from getFactoryNumber('taxRate', 'United States').
 *
 *   Compensation   FRED CES7000000003 (L&H avg hourly earnings) → annualised US floor
 *                  anchor row. ManCo professional-staff salaries exceed the L&H average;
 *                  this row is labelled as a market floor, not a target.
 *
 *   Funding        SEC EDGAR EFTS — Form D ("hotel fund") filings since 2022.
 *                  Fetches the EFTS search index, then pulls individual Form D XMLs
 *                  for totalOfferingAmount and dateOfFirstSale. Deduplicates by CIK
 *                  (keeps the most-recent filing per entity). Cached 24 h.
 *                  Canned fallback if fewer than 3 live rows are returned.
 *
 * Canned-only (no free public source available):
 *   Revenue        STR Host / CBRE Hotel Horizons — F&B + ancillary revenue mix.
 *   Overhead       HFTP / AHLA overhead cost surveys.
 *   PropertyDefaults  Kalibri Labs / AHLA distribution cost studies.
 */

export { getInflationComparables } from "./live-comparables/property-risk";
export { getCompanyComparables } from "./live-comparables/company";
export { getCompensationComparables } from "./live-comparables/compensation";
export { getLpComparables } from "./live-comparables/funding";
export { getRevenueComparables } from "./live-comparables/revenue";
export { getOverheadComparables } from "./live-comparables/overhead";
export { getPropertyDefaultsComparables } from "./live-comparables/property-defaults";
