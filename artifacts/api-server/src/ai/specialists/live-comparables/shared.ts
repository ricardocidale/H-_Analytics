/**
 * live-comparables/shared.ts — cross-specialist helpers and constants.
 *
 * Hosts the fetch helpers and constants reused by 2+ specialist files in
 * this folder: FRED observation fetch, Wikipedia summary, CNBC headlines,
 * date-offset utility, and the shared CHANNEL / FETCH_TIMEOUT_MS values.
 *
 * Helpers used by exactly one specialist live in that specialist's file.
 */

import {
  LIVE_CNBC_FETCH_LIMIT,
  LIVE_CNBC_HEADLINE_SLICE,
} from "../../../constants";

export const CHANNEL = "live-comparables";
export const FETCH_TIMEOUT_MS = 8_000;

// ── Wikipedia / CNBC ─────────────────────────────────────────────────────────
export const WIKIPEDIA_UA           = "NAI-HospitalityAnalytics/1.0 contact@norfolkai.com";
export const WIKIPEDIA_SUMMARY_BASE = "https://en.wikipedia.org/api/rest_v1/page/summary";
export const CNBC_RAPIDAPI_HOST     = "cnbc.p.rapidapi.com";

// ────────────────────────────────────────────────────────────────────────────
// Internal fetch helpers

/**
 * Fetch one FRED series observation. Returns `null` on missing key, network
 * error, or un-parseable value.
 *
 * @param seriesId  FRED series identifier (e.g. "CUSR0000SAH21").
 * @param units     Optional FRED units transformation ("lin" | "pc1" | "pca").
 *                  "pc1" = percent change from year ago — used for CPI series.
 */
export async function fetchFredObs(
  seriesId: string,
  units: "lin" | "pc1" | "pca" = "lin",
): Promise<number | null> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) return null;

  try {
    const params = new URLSearchParams({
      series_id: seriesId,
      api_key: apiKey,
      file_type: "json",
      sort_order: "desc",
      limit: "1",
    });
    if (units !== "lin") params.set("units", units);

    const url = `https://api.stlouisfed.org/fred/series/observations?${params.toString()}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;

    const data = (await res.json()) as {
      observations?: Array<{ value?: string }>;
    };
    const val = data.observations?.[0]?.value;
    if (!val || val === ".") return null;

    const parsed = parseFloat(val);
    return isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Date string N calendar days from today, formatted YYYY-MM-DD. */
export function liveCompDateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Fetch a single Wikipedia REST API page summary (no auth required).
 * Returns the plain-text extract string, or null on any error / missing page.
 */
export async function fetchWikipediaSummary(pageTitle: string): Promise<string | null> {
  try {
    const url = `${WIKIPEDIA_SUMMARY_BASE}/${encodeURIComponent(pageTitle)}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "User-Agent": WIKIPEDIA_UA },
    });
    if (!res.ok) return null;
    const data = await res.json() as { extract?: string };
    return data.extract ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetch CNBC autocomplete headlines for a topic via RapidAPI KEY_3.
 * Returns up to LIVE_CNBC_HEADLINE_SLICE headline strings (empty array on error).
 */
export async function fetchCNBCHeadlines(topic: string): Promise<string[]> {
  const key = process.env.RAPIDAPI_KEY_3;
  if (!key) return [];
  try {
    const url =
      `https://${CNBC_RAPIDAPI_HOST}/v2/auto-complete?` +
      new URLSearchParams({ q: topic, limit: String(LIVE_CNBC_FETCH_LIMIT) });
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "x-rapidapi-key": key, "x-rapidapi-host": CNBC_RAPIDAPI_HOST },
    });
    if (!res.ok) return [];
    const data = await res.json() as {
      data?: Array<{ title?: string; name?: string }>;
    };
    return (data.data ?? [])
      .map((a) => a.title ?? a.name ?? "")
      .filter(Boolean)
      .slice(0, LIVE_CNBC_HEADLINE_SLICE);
  } catch {
    return [];
  }
}
