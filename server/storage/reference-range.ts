/**
 * ReferenceRangeStorage — Phase 1 read-only helpers for the
 * `reference_range` table.
 *
 * Phase 2 will extend this class with create / update / archive paths
 * driven by the admin edit UX, and Phase 3 will add the best-match
 * resolver consumed by Specialists' `lookupReferenceRange` tool.
 *
 * Kept as a free-standing class for now (not wired into the IStorage
 * interface in `server/storage/index.ts`) because Phase 1 has exactly
 * one consumer (the read-only admin route). When the write paths come
 * online in Phase 2 we'll register it as a domain factory there so the
 * rest of the surface picks it up via the canonical `storage.*`
 * accessors.
 */
import { and, asc, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { db } from "../db";
import {
  referenceRanges,
  REFERENCE_RANGE_DOMAINS,
  type ReferenceRange,
  type ReferenceRangeDomain,
  type InsertReferenceRange,
} from "@shared/schema/reference-range";

export interface BestMatchParams {
  domain: ReferenceRangeDomain;
  metricKey: string;
  country?: string;
  subdivision?: string;
  market?: string;
  segment?: string;
  propertyType?: string;
  /** Calendar year for the lookup. Evergreen rows (year = 0) always match. */
  year?: number;
}

export interface ReferenceRangeFilter {
  domain?: ReferenceRangeDomain;
  metricKey?: string;
  country?: string;
  year?: number;
  /** When false (default) archived rows are excluded. */
  includeArchived?: boolean;
}

export interface ReferenceRangeFacets {
  domains: { value: ReferenceRangeDomain; count: number }[];
  countries: { value: string; count: number }[];
  years: { value: number; count: number }[];
  totalActive: number;
  totalArchived: number;
}

export class ReferenceRangeStorage {
  async list(filter: ReferenceRangeFilter = {}): Promise<ReferenceRange[]> {
    const conditions = [];
    if (filter.domain) conditions.push(eq(referenceRanges.domain, filter.domain));
    if (filter.metricKey) {
      // Substring + case-insensitive so the admin grid's "Filter by metric
      // key…" input behaves like the search affordance it presents.
      conditions.push(ilike(referenceRanges.metricKey, `%${filter.metricKey}%`));
    }
    if (filter.country) conditions.push(eq(referenceRanges.country, filter.country));
    if (filter.year !== undefined) conditions.push(eq(referenceRanges.year, filter.year));
    if (!filter.includeArchived) conditions.push(isNull(referenceRanges.archivedAt));

    return db
      .select()
      .from(referenceRanges)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(
        asc(referenceRanges.domain),
        asc(referenceRanges.metricKey),
        asc(referenceRanges.country),
        desc(referenceRanges.year),
      );
  }

  async getById(id: number): Promise<ReferenceRange | undefined> {
    const [row] = await db
      .select()
      .from(referenceRanges)
      .where(eq(referenceRanges.id, id))
      .limit(1);
    return row;
  }

  /**
   * Filter dropdown facets. Counts are restricted to active rows so the
   * admin grid's filter pills mirror what you'd see on screen by default.
   */
  async facets(): Promise<ReferenceRangeFacets> {
    const domainRows = await db
      .select({
        domain: referenceRanges.domain,
        count: sql<number>`count(*)::int`,
      })
      .from(referenceRanges)
      .where(isNull(referenceRanges.archivedAt))
      .groupBy(referenceRanges.domain);

    const countryRows = await db
      .select({
        country: referenceRanges.country,
        count: sql<number>`count(*)::int`,
      })
      .from(referenceRanges)
      .where(isNull(referenceRanges.archivedAt))
      .groupBy(referenceRanges.country);

    const yearRows = await db
      .select({
        year: referenceRanges.year,
        count: sql<number>`count(*)::int`,
      })
      .from(referenceRanges)
      .where(isNull(referenceRanges.archivedAt))
      .groupBy(referenceRanges.year);

    const [{ count: totalActive } = { count: 0 }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(referenceRanges)
      .where(isNull(referenceRanges.archivedAt));

    const [{ count: totalArchived } = { count: 0 }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(referenceRanges)
      .where(sql`${referenceRanges.archivedAt} is not null`);

    return {
      domains: domainRows
        .filter((r): r is { domain: ReferenceRangeDomain; count: number } =>
          (REFERENCE_RANGE_DOMAINS as readonly string[]).includes(r.domain),
        )
        .map((r) => ({ value: r.domain, count: r.count }))
        .sort((a, b) => a.value.localeCompare(b.value)),
      countries: countryRows
        .map((r) => ({ value: r.country, count: r.count }))
        .sort((a, b) => a.value.localeCompare(b.value)),
      years: yearRows
        .map((r) => ({ value: r.year, count: r.count }))
        .sort((a, b) => b.value - a.value),
      totalActive,
      totalArchived,
    };
  }

  // ── Phase 2: write paths ────────────────────────────────────────────

  async create(data: InsertReferenceRange): Promise<ReferenceRange> {
    const now = new Date();
    const [row] = await db
      .insert(referenceRanges)
      .values({ ...data, createdAt: now, updatedAt: now })
      .returning();
    return row;
  }

  async update(id: number, data: Partial<InsertReferenceRange>): Promise<ReferenceRange | undefined> {
    const [row] = await db
      .update(referenceRanges)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(referenceRanges.id, id))
      .returning();
    return row;
  }

  async archive(id: number): Promise<ReferenceRange | undefined> {
    const [row] = await db
      .update(referenceRanges)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(eq(referenceRanges.id, id))
      .returning();
    return row;
  }

  async restore(id: number): Promise<ReferenceRange | undefined> {
    const [row] = await db
      .update(referenceRanges)
      .set({ archivedAt: null, updatedAt: new Date() })
      .where(eq(referenceRanges.id, id))
      .returning();
    return row;
  }

  // ── Phase 3: best-match resolver ────────────────────────────────────

  async bestMatch(params: BestMatchParams): Promise<ReferenceRange | undefined> {
    const candidates = await db
      .select()
      .from(referenceRanges)
      .where(
        and(
          eq(referenceRanges.domain, params.domain),
          eq(referenceRanges.metricKey, params.metricKey),
          isNull(referenceRanges.archivedAt),
          or(
            eq(referenceRanges.country, "GLOBAL"),
            eq(referenceRanges.country, params.country ?? "GLOBAL"),
          ),
        ),
      );

    return selectBestMatch(candidates, params);
  }
}

export const referenceRangeStorage = new ReferenceRangeStorage();

/**
 * Pure best-match selector. Exported for unit testing without a DB.
 *
 * A row is a valid candidate when every non-null dimension it carries
 * matches the corresponding query dimension (rows that over-specify are
 * excluded — they can't safely apply to a broader context).
 *
 * Specificity weights (higher = more specific):
 *   country non-GLOBAL: +1 | subdivision: +2 | market: +4
 *   segment: +8 | propertyType: +16
 *
 * Tie-break: highest year ≤ requested year wins; year = 0 (evergreen)
 * beats nothing — explicit years win at equal specificity.
 */
export function selectBestMatch(
  rows: ReferenceRange[],
  params: BestMatchParams,
): ReferenceRange | undefined {
  let best: ReferenceRange | undefined;
  let bestScore = -Infinity;
  let bestYear = -Infinity;

  for (const row of rows) {
    if (row.subdivision !== null && row.subdivision !== (params.subdivision ?? null)) continue;
    if (row.market !== null && row.market !== (params.market ?? null)) continue;
    if (row.segment !== null && row.segment !== (params.segment ?? null)) continue;
    if (row.propertyType !== null && row.propertyType !== (params.propertyType ?? null)) continue;
    if (params.year !== undefined && row.year !== 0 && row.year > params.year) continue;

    const score =
      (row.country !== "GLOBAL" ? 1 : 0) +
      (row.subdivision !== null ? 2 : 0) +
      (row.market !== null ? 4 : 0) +
      (row.segment !== null ? 8 : 0) +
      (row.propertyType !== null ? 16 : 0);

    const yearKey = row.year === 0 ? -1 : row.year;

    if (score > bestScore || (score === bestScore && yearKey > bestYear)) {
      best = row;
      bestScore = score;
      bestYear = yearKey;
    }
  }

  return best;
}

/**
 * Convenience wrapper consumed by Specialists and the
 * `lookupReferenceRange` tool callable. Returns the best-matching
 * active row or undefined when no suitable range exists.
 */
export async function lookupReferenceRange(
  params: BestMatchParams,
): Promise<ReferenceRange | undefined> {
  return referenceRangeStorage.bestMatch(params);
}
