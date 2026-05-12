/**
 * national-benchmarks.ts — Read-only API for ICP national research feed data.
 *
 * Surfaces the two national benchmark tables (vendor pass-through costs +
 * Mgmt Co markup factors) populated by the Pietro scheduler minions
 * Gaetano and Renato, plus Fabio's deterministic range-quality
 * classification per row, computed from `assumption_guardrails`.
 *
 * Behavior:
 *   - Returns empty arrays + null timestamps when no rows exist (graceful
 *     empty-state — minions have not yet run or EXA_API_KEY missing).
 *   - Each benchmark row carries a `dot` (green | amber | red | grey)
 *     and the `guardrail` (low/high) so the front-of-app can decide
 *     whether a user-entered value is "out of range" without re-deriving
 *     bounds.
 *   - Never writes (writes owned by minions; guardrails owned by code seed).
 *
 * Routes:
 *   GET /api/national-benchmarks
 */
import type { Express, Request, Response } from "express";
import { db } from "../db";
import { assumptionGuardrails } from "@workspace/db";
import { requireAuth } from "../auth";
import { getLatestNationalBenchmarks } from "../finance/national-benchmarks";
import {
  classifyRangeQuality,
  vendorPassthroughGuardrailKey,
  mgmtCoMarkupGuardrailKey,
  type AssumptionGuardrail,
  type RangeQualityDot,
} from "@workspace/engine/analyst/minions/fabio";

interface BenchmarkOut {
  serviceLine: string;
  value: number;
  period: string;
  source: string;
  sourceUrl: string | null;
  fetchedAt: string;
  dot: RangeQualityDot;
  guardrail: { low: number; high: number } | null;
}

function asGuardrail(
  row: typeof assumptionGuardrails.$inferSelect | undefined,
): AssumptionGuardrail | null {
  if (!row) return null;
  return {
    assumptionKey: row.assumptionKey,
    low: row.low,
    high: row.high,
    targetLow: row.targetLow,
    targetHigh: row.targetHigh,
  };
}

export function register(app: Express): void {
  app.get(
    "/api/national-benchmarks",
    requireAuth,
    async (_req: Request, res: Response) => {
      const benchmarks = await getLatestNationalBenchmarks();

      const guardrailRows = await db.select().from(assumptionGuardrails);
      const byKey = new Map(guardrailRows.map((r) => [r.assumptionKey, r]));

      const vendorCosts: BenchmarkOut[] = benchmarks.vendorCosts.map((r) => {
        const g = asGuardrail(byKey.get(vendorPassthroughGuardrailKey(r.serviceLine)));
        return {
          serviceLine: r.serviceLine,
          value: r.costPctRevenue,
          period: r.period,
          source: r.source,
          sourceUrl: r.sourceUrl,
          fetchedAt: r.fetchedAt.toISOString(),
          dot: classifyRangeQuality(r.costPctRevenue, g),
          guardrail: g ? { low: g.low, high: g.high } : null,
        };
      });

      const markupFactors: BenchmarkOut[] = benchmarks.markupFactors.map((r) => {
        const g = asGuardrail(byKey.get(mgmtCoMarkupGuardrailKey(r.serviceLine)));
        return {
          serviceLine: r.serviceLine,
          value: r.markupPctRevenue,
          period: r.period,
          source: r.source,
          sourceUrl: r.sourceUrl,
          fetchedAt: r.fetchedAt.toISOString(),
          dot: classifyRangeQuality(r.markupPctRevenue, g),
          guardrail: g ? { low: g.low, high: g.high } : null,
        };
      });

      res.json({
        vendorCosts,
        markupFactors,
        vendorCostsLastFetchedAt: benchmarks.vendorCostsLastFetchedAt,
        markupFactorsLastFetchedAt: benchmarks.markupFactorsLastFetchedAt,
      });
    },
  );
}
