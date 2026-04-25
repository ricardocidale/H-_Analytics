#!/usr/bin/env tsx
/**
 * audit-legacy-storage-urls-in-db.ts — Data-side legacy storage URL audit
 * (Task #529, follow-up to Task #524).
 *
 * The PR-time gate `script/check-no-legacy-storage-urls.ts` keeps NEW code
 * from writing legacy Replit Object Storage URLs (sidecar GCS hosts,
 * `objectstorage.replit.com`, `*.repl.co/objects/...`, and the
 * `/objects/uploads/...` bucket-relative shape). It does not, however, see
 * what was already persisted to Postgres before the cutover. This audit is
 * the data-side complement: it walks every text/varchar/jsonb column in the
 * `public` schema and reports rows whose stored value matches any banned
 * shape, so a follow-up migration can rewrite them to the canonical
 * relative `/objects/<key>` form.
 *
 * Read-only by design. Exits 1 if any row matches so the script can be
 * wired into a scheduled / pre-deploy check without a separate flag.
 *
 * Usage
 * -----
 *   npx tsx script/audit-legacy-storage-urls-in-db.ts            # human report
 *   npx tsx script/audit-legacy-storage-urls-in-db.ts --json     # machine-readable
 *   npx tsx script/audit-legacy-storage-urls-in-db.ts --limit 5  # cap rows shown per column
 *
 * Output identifies (table, primary-key value, column, matched pattern,
 * truncated offending value) so a follow-up `r2-cutover-reconcile.ts`
 * `--rewrite-legacy-hosts` run, or a bespoke migration, can target each row.
 *
 * The pattern list is imported from `script/check-no-legacy-storage-urls.ts`
 * to keep both gates in lockstep — do not duplicate the list here.
 */
import { pool } from "../server/db";
import { BANNED_PATTERNS } from "./check-no-legacy-storage-urls";

type ColumnRef = { table: string; column: string; dataType: string };
type Hit = {
  table: string;
  column: string;
  dataType: string;
  pk: string | number;
  pattern: string;
  value: string;
};

// Postgres `~` is POSIX. Joining the patterns into one alternation lets us
// scan each column in a single SELECT and still attribute the hit afterwards
// in JS by re-testing each pattern against the offending value.
const COMBINED_PG_REGEX = `(${BANNED_PATTERNS.join("|")})`;
const PER_PATTERN_JS_REGEXES = BANNED_PATTERNS.map(
  (p) => ({ pattern: p, re: new RegExp(p) }),
);

function parseArgs(argv: string[]): { json: boolean; limit: number } {
  const args = new Set(argv);
  let limit = 20;
  const limitFlag = argv.findIndex((a) => a === "--limit");
  if (limitFlag !== -1 && argv[limitFlag + 1]) {
    const n = Number(argv[limitFlag + 1]);
    if (Number.isFinite(n) && n > 0) limit = n;
  }
  return { json: args.has("--json"), limit };
}

function log(msg: string): void {
  process.stdout.write(msg + "\n");
}

async function listCandidateColumns(): Promise<ColumnRef[]> {
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

async function getPrimaryKeyColumn(table: string): Promise<string | null> {
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

async function scanColumn(col: ColumnRef): Promise<Hit[]> {
  const pk = await getPrimaryKeyColumn(col.table);
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
    // abort the whole audit — skip noisily so the operator can investigate.
    log(
      `  ! skip ${col.table}.${col.column}: ${err instanceof Error ? err.message : err}`,
    );
    return [];
  }

  const hits: Hit[] = [];
  for (const row of rows) {
    // A single value can match multiple patterns (e.g. `objectstorage.replit.com/objects/uploads/...`).
    // Emit one hit per matched pattern so the report is fully attributable.
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

function truncateForDisplay(v: string, max = 160): string {
  // Collapse whitespace so multiline jsonb values stay on a single report
  // line; the goal is identification, not reproduction.
  const oneLine = v.replace(/\s+/g, " ");
  return oneLine.length > max ? oneLine.slice(0, max) + "…" : oneLine;
}

function summariseByPattern(hits: Hit[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const p of BANNED_PATTERNS) counts[p] = 0;
  for (const h of hits) counts[h.pattern] = (counts[h.pattern] ?? 0) + 1;
  return counts;
}

function summariseByColumn(hits: Hit[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const h of hits) {
    const k = `${h.table}.${h.column}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}

async function main(): Promise<void> {
  const { json, limit } = parseArgs(process.argv.slice(2));

  if (!json) {
    log("=== Legacy storage URL audit (Task #529, data side) ===");
    log(`patterns: ${BANNED_PATTERNS.join(", ")}`);
    log("");
  }

  const cols = await listCandidateColumns();
  if (!json) log(`[1/2] Scanning ${cols.length} text/varchar/jsonb columns in public schema...`);

  const allHits: Hit[] = [];
  for (const col of cols) {
    const hits = await scanColumn(col);
    if (hits.length) {
      if (!json) log(`      ${col.table}.${col.column}: ${hits.length} hit(s)`);
      allHits.push(...hits);
    }
  }

  if (json) {
    process.stdout.write(
      JSON.stringify(
        {
          patterns: BANNED_PATTERNS,
          totalHits: allHits.length,
          byPattern: summariseByPattern(allHits),
          byColumn: Object.fromEntries(summariseByColumn(allHits)),
          hits: allHits.map((h) => ({
            table: h.table,
            column: h.column,
            dataType: h.dataType,
            pk: h.pk,
            pattern: h.pattern,
            value: h.value,
          })),
        },
        null,
        2,
      ) + "\n",
    );
    await pool.end();
    process.exit(allHits.length > 0 ? 1 : 0);
  }

  log("");
  log("[2/2] Report");
  log("");

  if (allHits.length === 0) {
    log("ALL CLEAR — no rows reference any banned legacy storage URL pattern.");
    await pool.end();
    process.exit(0);
  }

  const byPattern = summariseByPattern(allHits);
  log("By pattern:");
  for (const p of BANNED_PATTERNS) {
    log(`  ${byPattern[p].toString().padStart(6)}  ${p}`);
  }
  log("");

  const byColumn = summariseByColumn(allHits);
  log("By column:");
  // Sort heaviest-hit columns first so the operator's eye lands on the
  // biggest cleanup opportunities.
  const sorted = [...byColumn.entries()].sort((a, b) => b[1] - a[1]);
  for (const [k, n] of sorted) {
    log(`  ${n.toString().padStart(6)}  ${k}`);
  }
  log("");

  log(`Hits (showing up to ${limit} per column):`);
  // Bucket hits by column so the per-column cap is enforceable, then emit.
  const byColumnHits = new Map<string, Hit[]>();
  for (const h of allHits) {
    const k = `${h.table}.${h.column}`;
    if (!byColumnHits.has(k)) byColumnHits.set(k, []);
    byColumnHits.get(k)!.push(h);
  }
  for (const [k, hits] of byColumnHits) {
    log(`  ── ${k} (${hits.length}) ──`);
    for (const h of hits.slice(0, limit)) {
      log(
        `    pk=${h.pk}  matched=[${h.pattern}]  →  ${truncateForDisplay(h.value)}`,
      );
    }
    if (hits.length > limit) log(`    ... and ${hits.length - limit} more`);
  }

  log("");
  log(
    `${allHits.length} legacy URL reference(s) found across ${byColumn.size} column(s). ` +
      `Re-run \`script/r2-cutover-reconcile.ts --rewrite-legacy-hosts\` (and/or write a ` +
      `bespoke migration for non-rewritable shapes) to clean these up.`,
  );

  await pool.end();
  process.exit(1);
}

main().catch(async (err) => {
  console.error("FAILED:", err);
  try {
    await pool.end();
  } catch {}
  process.exit(1);
});
