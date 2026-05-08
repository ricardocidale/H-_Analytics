/**
 * MinionFredExtended — additional FRED series for hospitality analytics.
 *
 * Extends the existing market_benchmarks table (written by fetchMacroRates)
 * with three hospitality-specific series not covered by the ambient fetcher.
 * Pattern mirrors fetchFredRate() in ../fetchers.ts exactly.
 */
import type { InsertBenchmarkSnapshot } from "@workspace/db";
import { storage } from "../../../storage";
import { logger } from "../../../logger";
import type { MinionResult } from "./index";

const TAG = "[minion:fred-extended]";

const FRED_EXTENSION_FETCH_TIMEOUT_MS = 10_000;

const HOSPITALITY_SERIES = [
  { id: "CUUR0000SEHB", label: "Hospitality CPI", category: "hospitality_inflation", cadence: "monthly" as const },
  { id: "CES7000000001", label: "Leisure & Hospitality Employment", category: "hospitality_labor", cadence: "monthly" as const },
  // HSNGSTARTW is a weekly series — use "weekly" to reflect actual FRED release cadence.
  { id: "HSNGSTARTW", label: "Housing Starts (Weekly Proxy)", category: "housing_starts", cadence: "weekly" as const },
] as const;

async function fetchHospitalitySeries(
  seriesId: string,
  label: string,
  category: string,
  cadence: string,
  apiKey: string,
): Promise<{ snapshot: Omit<InsertBenchmarkSnapshot, "id"> | null; error: string | null }> {
  try {
    const url =
      `https://api.stlouisfed.org/fred/series/observations` +
      `?series_id=${seriesId}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=1`;

    const response = await fetch(url, { signal: AbortSignal.timeout(FRED_EXTENSION_FETCH_TIMEOUT_MS) });
    if (!response.ok) {
      return { snapshot: null, error: `FRED ${seriesId}: HTTP ${response.status}` };
    }

    const data = (await response.json()) as { observations?: Array<{ value?: string }> };
    const obs = data.observations?.[0];
    if (!obs?.value || obs.value === ".") {
      return { snapshot: null, error: `FRED ${seriesId}: no observation value` };
    }

    return {
      snapshot: {
        snapshotKey: `fred_${seriesId.toLowerCase()}`,
        category,
        value: parseFloat(obs.value),
        source: "FRED",
        sourceUrl: `https://fred.stlouisfed.org/series/${seriesId}`,
        staleness: "fresh",
        cadence,
      },
      error: null,
    };
  } catch (err: unknown) {
    return {
      snapshot: null,
      error: `FRED ${seriesId}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export async function runMinionFredExtended(): Promise<MinionResult> {
  const t0 = Date.now();
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    logger.warn(`${TAG} FRED_API_KEY not set — skipping`);
    return { source: "fred-extended", rowsUpserted: 0, rowsFailed: 0, errors: ["FRED_API_KEY not set — skipping"], durationMs: Date.now() - t0 };
  }

  const results = await Promise.allSettled(
    HOSPITALITY_SERIES.map(s => fetchHospitalitySeries(s.id, s.label, s.category, s.cadence, apiKey)),
  );

  let rowsUpserted = 0;
  const errors: string[] = [];

  for (const result of results) {
    if (result.status === "rejected") {
      errors.push(`fetch threw: ${result.reason}`);
      continue;
    }
    const { snapshot, error } = result.value;
    if (error) { errors.push(error); continue; }
    if (!snapshot) continue;

    try {
      await storage.upsertBenchmarkSnapshot(snapshot);
      rowsUpserted++;
    } catch (err: unknown) {
      errors.push(`DB upsert ${snapshot.snapshotKey}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const durationMs = Date.now() - t0;
  if (errors.length > 0) {
    logger.warn(`${TAG} ${rowsUpserted} upserted, ${errors.length} errors (${durationMs}ms)`);
  } else {
    logger.info(`${TAG} ${rowsUpserted} upserted (${durationMs}ms)`);
  }

  return { source: "fred-extended", rowsUpserted, rowsFailed: errors.length, errors, durationMs };
}
