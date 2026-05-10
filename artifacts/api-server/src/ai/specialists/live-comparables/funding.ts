/**
 * live-comparables/funding.ts — Funding specialist LP-raise comparables.
 *
 * Funding        SEC EDGAR EFTS — Form D ("hotel fund") filings since 2022.
 *                Fetches the EFTS search index, then pulls individual Form D XMLs
 *                for totalOfferingAmount and dateOfFirstSale. Deduplicates by CIK
 *                (keeps the most-recent filing per entity). Cached 24 h.
 *                Canned fallback if fewer than 3 live rows are returned.
 */

import { logger } from "../../../logger";
import { cache } from "../../../cache";
import {
  getCannedLpComparables,
  type ComparableRow,
} from "../mgmt-co-funding-orchestrator-adapter";
import {
  DEFAULT_RUNWAY_NEED_MONTHS_PLACEHOLDER,
  EDGAR_MIN_LIVE_ROWS,
  EDGAR_COMPARABLE_SIZING_OVERSHOOT_PCT,
} from "@shared/constants-funding";
import { CHANNEL, FETCH_TIMEOUT_MS } from "./shared";

// SEC EDGAR — Form D hotel fund comparables
const EDGAR_UA = "NAI-HospitalityAnalytics/1.0 contact@norfolkai.com";
const EDGAR_EFTS_URL =
  "https://efts.sec.gov/LATEST/search-index?q=%22hotel+fund%22&forms=D&dateRange=custom&startdt=2022-01-01&enddt=2027-12-31";
const EDGAR_ARCHIVES_BASE = "https://www.sec.gov/Archives/edgar/data";
const EDGAR_MIN_RAISE_USD = 2_000_000; // exclude trivial/test filings
const EDGAR_MIN_VINTAGE = 2020;        // exclude stale vintage years
const EDGAR_CACHE_TTL_SECONDS = 24 * 60 * 60; // 24 hours
const EDGAR_MAX_FILINGS = 15;          // XML fetches per call

// ────────────────────────────────────────────────────────────────────────────
// EDGAR — hotel fund Form D comparables

/**
 * Fetch live LP-raise comparables from SEC EDGAR Form D filings.
 *
 * Strategy:
 *   1. Search EFTS for "hotel fund" Form D filings since 2022.
 *   2. Deduplicate hits by CIK — keep the most-recent filing per entity.
 *   3. Fetch each filing's primary_doc.xml in parallel to read:
 *        - totalOfferingAmount  (raise size in USD)
 *        - dateOfFirstSale      (vintage year; falls back to file_date year)
 *   4. Discard rows with raise < EDGAR_MIN_RAISE_USD or vintage < EDGAR_MIN_VINTAGE.
 *
 * Non-EDGAR fields (runwayBufferMonths, sizingOvershootPct, trancheGapMonths)
 * are set to representative constants because Form D does not disclose them.
 *
 * Cached 24 h — EDGAR is a free public endpoint with a rate-limit request
 * that we respect via User-Agent identification.
 */
async function fetchEdgarHotelFundComparables(): Promise<readonly ComparableRow[]> {
  const searchRes = await fetch(EDGAR_EFTS_URL, {
    headers: { "User-Agent": EDGAR_UA },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!searchRes.ok) return [];

  const searchData = (await searchRes.json()) as {
    hits?: { hits?: Array<{
      _source?: {
        adsh?: string;
        ciks?: string[];
        display_names?: string[];
        file_date?: string;
      };
    }> };
  };

  const hits = searchData.hits?.hits ?? [];

  // Deduplicate by CIK — keep only the first (most-relevant) filing per entity.
  const seenCiks = new Set<string>();
  const uniqueHits = hits.filter((h) => {
    const cik = h._source?.ciks?.[0];
    if (!cik || seenCiks.has(cik)) return false;
    seenCiks.add(cik);
    return true;
  });

  // Fetch Form D XMLs in parallel (up to EDGAR_MAX_FILINGS)
  const xmlFetches = uniqueHits.slice(0, EDGAR_MAX_FILINGS).map(async (hit) => {
    const src = hit._source;
    if (!src) return null;

    const cik = src.ciks?.[0]?.replace(/^0+/, "");
    const adsh = src.adsh?.replace(/-/g, "");
    if (!cik || !adsh) return null;

    try {
      const xmlUrl = `${EDGAR_ARCHIVES_BASE}/${cik}/${adsh}/primary_doc.xml`;
      const xmlRes = await fetch(xmlUrl, {
        headers: { "User-Agent": EDGAR_UA },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!xmlRes.ok) return null;
      const xml = await xmlRes.text();

      // Parse offering amount
      const amountMatch = xml.match(
        /<totalOfferingAmount[^>]*>([\d.]+)<\/totalOfferingAmount>/
      );
      if (!amountMatch) return null;
      const raiseUsd = Math.round(parseFloat(amountMatch[1]));
      if (!isFinite(raiseUsd) || raiseUsd < EDGAR_MIN_RAISE_USD) return null;

      // Parse dateOfFirstSale — may be nested <value>YYYY-MM-DD</value> or
      // just "true" (meaning "already occurred"). Fall back to file_date year.
      const dateMatch = xml.match(
        /<dateOfFirstSale[^>]*>(?:[^<]*<value>)?(\d{4}-\d{2}-\d{2})/
      );
      const vintage = dateMatch
        ? Number(dateMatch[1].slice(0, 4))
        : Number((src.file_date ?? "0").slice(0, 4));

      if (!isFinite(vintage) || vintage < EDGAR_MIN_VINTAGE) return null;

      // Clean entity name — EDGAR display_names often suffix "(CIK 0001234567)"
      const rawName = src.display_names?.[0] ?? "Unknown Hotel Fund";
      const operator = rawName.replace(/\s*\(CIK\s+\d+\)\s*$/, "").trim();

      const row: ComparableRow = {
        operator,
        vintage,
        vertical: "boutique-luxury",
        propertyCount: 0,
        raiseUsd,
        runwayBufferMonths: DEFAULT_RUNWAY_NEED_MONTHS_PLACEHOLDER,  // representative — not disclosed in Form D
        sizingOvershootPct: EDGAR_COMPARABLE_SIZING_OVERSHOOT_PCT,  // representative — not disclosed in Form D
        trancheGapMonths: null,    // not disclosed in Form D
        source: `SEC EDGAR Form D ${src.adsh ?? adsh} filed ${src.file_date ?? "n/a"}`,
        asOf: src.file_date ?? new Date().toISOString().slice(0, 10),
      };
      return row;
    } catch {
      return null;
    }
  });

  const results = await Promise.all(xmlFetches);
  return results.filter((r): r is ComparableRow => r !== null);
}

// ────────────────────────────────────────────────────────────────────────────
// Funding — LP raise comparables (SEC EDGAR Form D)

/**
 * Fetch live LP-raise comparables for the Funding specialist.
 *
 * Primary source: SEC EDGAR Form D "hotel fund" filings since 2022, fetched
 * via EFTS search + individual XML parsing. Cached 24 h to respect EDGAR's
 * rate-limit guidelines and avoid redundant XML fetches.
 *
 * Fallback: canned dataset (getCannedLpComparables) when EDGAR returns fewer
 * than 3 qualifying rows. The canned set is always appended after live rows
 * so the specialist has ≥ 3 comparables even on partial EDGAR results.
 *
 * Non-EDGAR representative constants (not disclosed in Form D filings):
 *   runwayBufferMonths = 18   (typical GP runway target)
 *   sizingOvershootPct = 0.15 (typical 15% oversize buffer)
 *   trancheGapMonths   = null (tranche structure not disclosed)
 */
export async function getLpComparables(): Promise<readonly ComparableRow[]> {
  const canned = getCannedLpComparables();

  const edgarRows = await cache.staleWhileRevalidate<readonly ComparableRow[]>(
    "edgar:hotel-fund-form-d",
    EDGAR_CACHE_TTL_SECONDS,
    () => fetchEdgarHotelFundComparables().catch(() => []),
  );

  if (edgarRows.length >= EDGAR_MIN_LIVE_ROWS) {
    logger.info(
      `getLpComparables: ${edgarRows.length} live EDGAR rows returned (canned appended for depth)`,
      CHANNEL,
    );
    return [...edgarRows, ...canned];
  }

  logger.info(
    `getLpComparables: EDGAR returned ${edgarRows.length} qualifying rows — using canned set`,
    CHANNEL,
  );
  return canned;
}
