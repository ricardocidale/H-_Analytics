/**
 * MinionDaloopaReit — REIT fundamentals from Daloopa MCP.
 *
 * Higher-fidelity REIT data from SEC filings and earnings transcripts via the
 * Daloopa MCP server. Same tickers and target table as MinionFmpReit; source
 * field = "daloopa". Degrades gracefully if DALOOPA_API_KEY is absent — FMP
 * covers the same tickers as a fallback.
 */
import { db } from "../../../db";
import { reitBenchmarks, type InsertReitBenchmark } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../../../logger";
import type { MinionResult } from "./index";

const TAG = "[minion:daloopa-reit]";

const DALOOPA_FETCH_TIMEOUT_MS = 20_000;
const DALOOPA_MCP_URL = "https://mcp.daloopa.com/server/mcp";

const REIT_TICKERS = ["HST", "RHP", "PEB", "APLE", "SHO"] as const;

interface DaloopaFundamental {
  ticker?: string;
  metricName?: string;
  value?: number;
  period?: string;
}

async function fetchDaloopaFundamentals(ticker: string, apiKey: string): Promise<InsertReitBenchmark[]> {
  const response = await fetch(DALOOPA_MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": apiKey,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "tools/call",
      id: 1,
      params: {
        name: "get_fundamentals_data",
        arguments: { ticker, period: "quarterly", limit: 4 },
      },
    }),
    signal: AbortSignal.timeout(DALOOPA_FETCH_TIMEOUT_MS),
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const body = (await response.json()) as { result?: { content?: Array<{ text?: string }> } };
  const text = body.result?.content?.[0]?.text;
  if (!text) return [];

  const data = JSON.parse(text) as DaloopaFundamental[];
  if (!Array.isArray(data)) return [];

  return data
    .filter(d => d.ticker && d.metricName && d.value !== undefined && d.period)
    .map(d => ({
      ticker: d.ticker!,
      metricKey: d.metricName!.toLowerCase().replace(/\s+/g, "_"),
      value: d.value!,
      period: d.period!,
      source: "daloopa" as const,
      fetchedAt: new Date(),
    }));
}

export async function runMinionDaloopaReit(): Promise<MinionResult> {
  const t0 = Date.now();
  const apiKey = process.env.DALOOPA_API_KEY;
  if (!apiKey) {
    logger.info(`${TAG} DALOOPA_API_KEY not set — skipping (FMP covers the same tickers)`);
    return { source: "daloopa-reit", rowsUpserted: 0, rowsFailed: 0, errors: [], durationMs: Date.now() - t0 };
  }

  const results = await Promise.allSettled(
    REIT_TICKERS.map(ticker => fetchDaloopaFundamentals(ticker, apiKey)),
  );

  let rowsUpserted = 0;
  const errors: string[] = [];

  for (let i = 0; i < results.length; i++) {
    const ticker = REIT_TICKERS[i];
    const result = results[i];

    if (result.status === "rejected") {
      errors.push(`${ticker}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
      continue;
    }

    for (const row of result.value) {
      try {
        await db.insert(reitBenchmarks)
          .values(row)
          .onConflictDoUpdate({
            target: [reitBenchmarks.ticker, reitBenchmarks.metricKey, reitBenchmarks.period],
            set: { value: sql`excluded.value`, source: sql`excluded.source`, fetchedAt: sql`excluded.fetched_at` },
          });
        rowsUpserted++;
      } catch (err: unknown) {
        errors.push(`${ticker} ${row.metricKey}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  const durationMs = Date.now() - t0;
  if (errors.length > 0) {
    logger.warn(`${TAG} ${rowsUpserted} upserted, ${errors.length} errors (${durationMs}ms)`);
  } else {
    logger.info(`${TAG} ${rowsUpserted} upserted (${durationMs}ms)`);
  }

  return { source: "daloopa-reit", rowsUpserted, rowsFailed: errors.length, errors, durationMs };
}
