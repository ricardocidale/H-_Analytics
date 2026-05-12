/**
 * national-benchmarks — read-layer for ICP national research feed data.
 *
 * Provides typed access to the two national benchmark tables populated by
 * the Pietro scheduler minions Gaetano (vendor pass-through costs) and
 * Renato (Mgmt Co markup factors). The calc pipeline and specialist agents
 * consume these values to compare against or default property-level ICP
 * assumptions when no property override exists.
 *
 * Design contract:
 * - Returns the most recent period's rows (ordered by fetched_at DESC).
 * - Returns empty arrays (never throws) when the table has no rows — minions
 *   have not yet run, EXA_API_KEY was not set, or DB is not reachable.
 * - Does NOT write to the DB — all writes are owned by the minions.
 *
 * R11–R14 ICP simplification integration:
 *   Downstream consumers (ICP calc orchestration, Analyst specialists) should
 *   call getLatestNationalBenchmarks() and use the returned arrays to populate
 *   benchmark range chips on cost-assumption fields. See follow-up task #1415
 *   for wiring into the full engine calc pipeline.
 */

import { db } from "../db";
import { vendorPassthroughCosts, mgmtCoMarkupFactors } from "@workspace/db";
import { desc } from "drizzle-orm";
import { logger } from "../logger";

export interface NationalVendorCostRow {
  serviceLine: string;
  costPctRevenue: number;
  period: string;
  source: string;
  sourceUrl: string | null;
  fetchedAt: Date;
}

export interface NationalMarkupFactorRow {
  serviceLine: string;
  markupPctRevenue: number;
  period: string;
  source: string;
  sourceUrl: string | null;
  fetchedAt: Date;
}

export interface NationalBenchmarks {
  vendorCosts: NationalVendorCostRow[];
  markupFactors: NationalMarkupFactorRow[];
  /** ISO timestamp of the most recent Gaetano run, or null if no rows. */
  vendorCostsLastFetchedAt: string | null;
  /** ISO timestamp of the most recent Renato run, or null if no rows. */
  markupFactorsLastFetchedAt: string | null;
}

/**
 * Load the latest national benchmark rows from both ICP research feed tables.
 *
 * @returns NationalBenchmarks — always resolves; empty arrays on any error.
 */
export async function getLatestNationalBenchmarks(): Promise<NationalBenchmarks> {
  try {
    const [vendorRows, markupRows] = await Promise.all([
      db
        .select()
        .from(vendorPassthroughCosts)
        .orderBy(desc(vendorPassthroughCosts.fetchedAt)),
      db
        .select()
        .from(mgmtCoMarkupFactors)
        .orderBy(desc(mgmtCoMarkupFactors.fetchedAt)),
    ]);

    const vendorCostsLastFetchedAt =
      vendorRows[0]?.fetchedAt.toISOString() ?? null;
    const markupFactorsLastFetchedAt =
      markupRows[0]?.fetchedAt.toISOString() ?? null;

    return {
      vendorCosts: vendorRows.map(r => ({
        serviceLine: r.serviceLine,
        costPctRevenue: r.costPctRevenue,
        period: r.period,
        source: r.source,
        sourceUrl: r.sourceUrl ?? null,
        fetchedAt: r.fetchedAt,
      })),
      markupFactors: markupRows.map(r => ({
        serviceLine: r.serviceLine,
        markupPctRevenue: r.markupPctRevenue,
        period: r.period,
        source: r.source,
        sourceUrl: r.sourceUrl ?? null,
        fetchedAt: r.fetchedAt,
      })),
      vendorCostsLastFetchedAt,
      markupFactorsLastFetchedAt,
    };
  } catch (err: unknown) {
    logger.warn(
      `[national-benchmarks] Failed to load national benchmarks: ${err instanceof Error ? err.message : String(err)}`,
    );
    return {
      vendorCosts: [],
      markupFactors: [],
      vendorCostsLastFetchedAt: null,
      markupFactorsLastFetchedAt: null,
    };
  }
}

/**
 * Look up the national vendor pass-through cost for a specific service line.
 * Returns null if no data is available or the service line is not found.
 */
export async function getNationalVendorCost(
  serviceLine: string,
): Promise<{ costPctRevenue: number; period: string; source: string } | null> {
  const { vendorCosts } = await getLatestNationalBenchmarks();
  return vendorCosts.find(r => r.serviceLine === serviceLine) ?? null;
}

/**
 * Look up the national Mgmt Co markup factor for a specific service line.
 * Returns null if no data is available or the service line is not found.
 */
export async function getNationalMarkupFactor(
  serviceLine: string,
): Promise<{ markupPctRevenue: number; period: string; source: string } | null> {
  const { markupFactors } = await getLatestNationalBenchmarks();
  return markupFactors.find(r => r.serviceLine === serviceLine) ?? null;
}
