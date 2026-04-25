/**
 * legacy-storage-url-audit.ts — reusable core of the data-side legacy
 * storage URL audit (Task #529). The CLI script
 * `script/audit-legacy-storage-urls-in-db.ts` is a thin wrapper around
 * this module so the same scanner can be invoked from a scheduled
 * background job (Task #534) without a separate process or pool.
 *
 * Pure: this module never closes the pool, never exits the process, and
 * never prints to stdout. Callers own those concerns. The function
 * walks every text/varchar/jsonb column in the `public` schema and
 * reports rows whose stored value matches any of the legacy storage URL
 * patterns from `script/check-no-legacy-storage-urls.ts`.
 */
import type { Pool } from "pg";
import { BANNED_PATTERNS } from "../check-no-legacy-storage-urls";

export { BANNED_PATTERNS };

export type ColumnRef = { table: string; column: string; dataType: string };

export type AuditHit = {
  table: string;
  column: string;
  dataType: string;
  pk: string | number;
  pattern: string;
  value: string;
};

export type AuditReport = {
  patterns: readonly string[];
  totalHits: number;
  byPattern: Record<string, number>;
  byColumn: Map<string, number>;
  hits: AuditHit[];
  /** Tables/columns the scanner could not query (privilege issues, computed
   * columns, etc.) — surfaced so the scheduler can warn when coverage drops. */
  skippedColumns: { table: string; column: string; reason: string }[];
};

const COMBINED_PG_REGEX = `(${BANNED_PATTERNS.join("|")})`;
const PER_PATTERN_JS_REGEXES = BANNED_PATTERNS.map((p) => ({
  pattern: p,
  re: new RegExp(p),
}));

async function listCandidateColumns(pool: Pool): Promise<ColumnRef[]> {
  const { rows } = await pool.query<{
    table_name: string;
    column_name: string;
    data_type: string;
  }>(
    `SELECT table_name, column_name, data_type
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND data_type IN ('text', 'character varying', 'jsonb')
      ORDER BY table_name, column_name`,
  );
  return rows.map((r) => ({
    table: r.table_name,
    column: r.column_name,
    dataType: r.data_type,
  }));
}

async function getPrimaryKeyColumn(
  pool: Pool,
  table: string,
): Promise<string | null> {
  const { rows } = await pool.query<{ attname: string }>(
    `SELECT a.attname
       FROM pg_index i
       JOIN pg_attribute a
         ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
      WHERE i.indrelid = $1::regclass
        AND i.indisprimary
      LIMIT 1`,
    [`public."${table}"`],
  );
  return rows[0]?.attname ?? null;
}

async function scanColumn(
  pool: Pool,
  col: ColumnRef,
  skipped: AuditReport["skippedColumns"],
): Promise<AuditHit[]> {
  const pk = await getPrimaryKeyColumn(pool, col.table);
  // Without a single-column primary key we can't emit a stable row pointer,
  // so skip those tables. They are extremely rare in this schema (mostly
  // join tables, none of which carry URL-shaped data).
  if (!pk) return [];

  // jsonb → text so the same regex applies to keys and values inside the doc.
  const valueExpr =
    col.dataType === "jsonb" ? `("${col.column}")::text` : `"${col.column}"`;

  let rows: Array<{ pk: string | number; v: string }>;
  try {
    const result = await pool.query<{ pk: string | number; v: string }>(
      `SELECT "${pk}" AS pk, ${valueExpr} AS v
         FROM "${col.table}"
        WHERE ${valueExpr} IS NOT NULL
          AND ${valueExpr} ~ $1`,
      [COMBINED_PG_REGEX],
    );
    rows = result.rows;
  } catch (err) {
    // Computed columns / view-backed tables / privilege issues should not
    // abort the whole audit — surface them so the operator can investigate
    // (and so the scheduler can warn when coverage drops).
    const reason = err instanceof Error ? err.message : String(err);
    skipped.push({ table: col.table, column: col.column, reason });
    return [];
  }

  const hits: AuditHit[] = [];
  for (const row of rows) {
    // A single value can match multiple patterns (e.g.
    // `objectstorage.replit.com/objects/uploads/...`). Emit one hit per
    // matched pattern so the report is fully attributable.
    for (const { pattern, re } of PER_PATTERN_JS_REGEXES) {
      if (re.test(row.v)) {
        hits.push({
          table: col.table,
          column: col.column,
          dataType: col.dataType,
          pk: row.pk,
          pattern,
          value: row.v,
        });
      }
    }
  }
  return hits;
}

export function summariseByPattern(hits: AuditHit[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const p of BANNED_PATTERNS) counts[p] = 0;
  for (const h of hits) counts[h.pattern] = (counts[h.pattern] ?? 0) + 1;
  return counts;
}

export function summariseByColumn(hits: AuditHit[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const h of hits) {
    const k = `${h.table}.${h.column}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}

/**
 * Run the full audit. Caller owns the pool (we never end it) and is
 * responsible for any user-facing reporting.
 */
export async function runLegacyStorageUrlAudit(
  pool: Pool,
  options: { onColumnScanned?: (col: ColumnRef, hits: number) => void } = {},
): Promise<AuditReport> {
  const cols = await listCandidateColumns(pool);
  const allHits: AuditHit[] = [];
  const skipped: AuditReport["skippedColumns"] = [];
  for (const col of cols) {
    const hits = await scanColumn(pool, col, skipped);
    if (hits.length) allHits.push(...hits);
    options.onColumnScanned?.(col, hits.length);
  }
  return {
    patterns: BANNED_PATTERNS,
    totalHits: allHits.length,
    byPattern: summariseByPattern(allHits),
    byColumn: summariseByColumn(allHits),
    hits: allHits,
    skippedColumns: skipped,
  };
}
