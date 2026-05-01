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
 * The same audit is also run nightly inside the server process by
 * `server/jobs/legacy-storage-url-audit.ts` (Task #534), which shares the
 * pure scanner in `script/lib/legacy-storage-url-audit.ts`. Edit the
 * scanner there — this file is just the CLI wrapper that owns the pool
 * lifecycle and human/JSON output.
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
 * via the shared scanner module to keep both gates in lockstep — do not
 * duplicate the list here.
 */
import { pool } from "../server/db";
import {
  BANNED_PATTERNS,
  runLegacyStorageUrlAudit,
  type AuditHit,
} from "./lib/legacy-storage-url-audit";

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

function truncateForDisplay(v: string, max = 160): string {
  // Collapse whitespace so multiline jsonb values stay on a single report
  // line; the goal is identification, not reproduction.
  const oneLine = v.replace(/\s+/g, " ");
  return oneLine.length > max ? oneLine.slice(0, max) + "…" : oneLine;
}

async function main(): Promise<void> {
  const { json, limit } = parseArgs(process.argv.slice(2));

  if (!json) {
    log("=== Legacy storage URL audit (Task #529, data side) ===");
    log(`patterns: ${BANNED_PATTERNS.join(", ")}`);
    log("");
    log("[1/2] Scanning text/varchar/jsonb columns in public schema...");
  }

  const report = await runLegacyStorageUrlAudit(pool, {
    onColumnScanned: (col, hits) => {
      if (!json && hits > 0) log(`      ${col.table}.${col.column}: ${hits} hit(s)`);
    },
  });

  if (!json) {
    for (const sk of report.skippedColumns) {
      log(`  ! skip ${sk.table}.${sk.column}: ${sk.reason}`);
    }
  }

  if (json) {
    process.stdout.write(
      JSON.stringify(
        {
          patterns: BANNED_PATTERNS,
          totalHits: report.totalHits,
          byPattern: report.byPattern,
          byColumn: Object.fromEntries(report.byColumn),
          hits: report.hits.map((h) => ({
            table: h.table,
            column: h.column,
            dataType: h.dataType,
            pk: h.pk,
            pattern: h.pattern,
            value: h.value,
          })),
          skippedColumns: report.skippedColumns,
        },
        null,
        2,
      ) + "\n",
    );
    await pool.end();
    process.exit(report.totalHits > 0 ? 1 : 0);
  }

  log("");
  log("[2/2] Report");
  log("");

  if (report.totalHits === 0) {
    log("ALL CLEAR — no rows reference any banned legacy storage URL pattern.");
    await pool.end();
    process.exit(0);
  }

  log("By pattern:");
  for (const p of BANNED_PATTERNS) {
    log(`  ${(report.byPattern[p] ?? 0).toString().padStart(6)}  ${p}`);
  }
  log("");

  log("By column:");
  // Sort heaviest-hit columns first so the operator's eye lands on the
  // biggest cleanup opportunities.
  const sorted = [...report.byColumn.entries()].sort((a, b) => b[1] - a[1]);
  for (const [k, n] of sorted) {
    log(`  ${n.toString().padStart(6)}  ${k}`);
  }
  log("");

  log(`Hits (showing up to ${limit} per column):`);
  // Bucket hits by column so the per-column cap is enforceable, then emit.
  const byColumnHits = new Map<string, AuditHit[]>();
  for (const h of report.hits) {
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
    `${report.totalHits} legacy URL reference(s) found across ${report.byColumn.size} column(s). ` +
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
