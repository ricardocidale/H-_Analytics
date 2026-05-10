/**
 * Reference Range seeder — shared helpers and constants.
 *
 * Exports the `upsertRange` row-upserter, the shared `TAG` for log lines,
 * and the `YEAR` stamp used across every pass.
 */

import { db } from "../../db";
import { sql } from "drizzle-orm";

export const TAG = "seed:reference-ranges";
export const YEAR = new Date().getFullYear();

// ── Helpers ───────────────────────────────────────────────────────────────────

export async function upsertRange(row: {
  domain: string; metricKey: string; label: string;
  country: string; subdivision?: string | null; market?: string | null;
  segment?: string | null; propertyType?: string | null;
  year: number;
  low: number; mid: number; high: number; unit: string;
  sourceName?: string | null; sourceUrl?: string | null;
  methodology?: string | null; confidence?: string;
  verifiedBy?: string | null;
}): Promise<void> {
  await db.execute(sql`
    INSERT INTO reference_range
      (domain, metric_key, label, country, subdivision, market, segment, property_type,
       year, low, mid, high, unit, source_name, source_url, methodology, confidence,
       verified_by, last_verified_at, updated_at)
    VALUES
      (${row.domain}, ${row.metricKey}, ${row.label},
       ${row.country}, ${row.subdivision ?? null}, ${row.market ?? null},
       ${row.segment ?? null}, ${row.propertyType ?? null},
       ${row.year}, ${row.low}, ${row.mid}, ${row.high}, ${row.unit},
       ${row.sourceName ?? null}, ${row.sourceUrl ?? null},
       ${row.methodology ?? null}, ${row.confidence ?? "medium"},
       ${"seed-loader"}, now(), now())
    ON CONFLICT (domain, metric_key, country, subdivision, market, segment, property_type, year)
      DO UPDATE SET
        low = EXCLUDED.low, mid = EXCLUDED.mid, high = EXCLUDED.high,
        unit = EXCLUDED.unit,
        source_name = COALESCE(EXCLUDED.source_name, reference_range.source_name),
        source_url  = COALESCE(EXCLUDED.source_url,  reference_range.source_url),
        methodology = COALESCE(EXCLUDED.methodology,  reference_range.methodology),
        confidence  = EXCLUDED.confidence,
        verified_by = EXCLUDED.verified_by,
        last_verified_at = now(),
        updated_at  = now()
  `);
}
