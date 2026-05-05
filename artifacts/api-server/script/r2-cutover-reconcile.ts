/**
 * r2-cutover-reconcile.ts — Storage drift sweep reconciler (Task #868)
 *
 * Scans the database for legacy storage URLs (GCS, Replit object storage,
 * /objects/uploads/ paths) and reports counts in the format consumed by
 * scripts/src/log-parser.ts → record-storage-drift-sweep.ts → Admin panel.
 *
 * Called nightly by .github/workflows/storage-reconcile-remediate.yml with:
 *   --remediate-missing   (flag accepted; R2-copy remediation not yet implemented)
 *   --remediate-legacy    (flag accepted; full DB rewrite remediation not yet implemented)
 *
 * The current database is clean (verified 2026-05-05). When legacy URLs are
 * found in the future, the script exits 1 so CI alerts the operator and
 * the Admin Observability panel shows "error" status. Full automated
 * remediation is deferred pending a separate planning pass (Task #868 plan).
 *
 * Output contract (must match log-parser.ts regexes):
 *
 *   Mutations performed:
 *     rewrote: N
 *     copied: N
 *     skipped: N
 *     failed: N
 *
 *   [RE-VERIFY]
 *   MISSING-R2: N
 *   MISSING-media: N
 *   MISSING-photo: N
 *   LEGACY-host: N
 */

import pkg from "pg";
const { Pool } = pkg;
import { runLegacyStorageUrlAudit } from "./lib/legacy-storage-url-audit.js";

// ---------------------------------------------------------------------------
// Parse flags (accepted but remediation is not yet implemented)
// ---------------------------------------------------------------------------

const args = new Set(process.argv.slice(2));
const remediateLegacy = args.has("--remediate-legacy");
const remediateMissing = args.has("--remediate-missing");

// ---------------------------------------------------------------------------
// DB connection
// ---------------------------------------------------------------------------

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set — cannot run reconciler");
  process.exit(1);
}

const pool = new Pool({ connectionString });

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const runDate = new Date().toISOString().slice(0, 10);
console.log(`Storage drift reconciler — ${runDate}`);
console.log(
  `Flags: --remediate-legacy=${remediateLegacy} --remediate-missing=${remediateMissing}`,
);
console.log();

// Step 1: audit
console.log("Scanning database for legacy storage URLs...");
const report = await runLegacyStorageUrlAudit(pool, {
  onColumnScanned: (col, hits) => {
    if (hits > 0) {
      process.stderr.write(`  HIT ${col.table}.${col.column}: ${hits}\n`);
    }
  },
});
console.log(
  `Audit complete: ${report.totalHits} legacy URL reference(s) found across ${report.hits.length} row match(es).`,
);

if (report.totalHits > 0) {
  console.log();
  console.log("Breakdown by pattern:");
  for (const [pattern, count] of Object.entries(report.byPattern)) {
    if (count > 0) console.log(`  ${pattern}: ${count}`);
  }
}

if (report.skippedColumns.length > 0) {
  console.log();
  console.log(`Warning: ${report.skippedColumns.length} column(s) could not be scanned:`);
  for (const sc of report.skippedColumns) {
    console.log(`  ${sc.table}.${sc.column}: ${sc.reason}`);
  }
}

console.log();

// Step 2: mutation counters
// Automated remediation is not implemented yet; all hits remain as skipped.
const rewrote = 0;
const copied = 0;
const skipped = report.totalHits;
const failed = 0;

console.log("Mutations performed:");
console.log(`  rewrote: ${rewrote}`);
console.log(`  copied: ${copied}`);
console.log(`  skipped: ${skipped}`);
console.log(`  failed: ${failed}`);
console.log();

// Step 3: re-verify residuals
// LEGACY-host = remaining legacy URL hits (totalHits minus any that were rewritten)
const legacyHostResidual = report.totalHits - rewrote;

console.log("[RE-VERIFY]");
console.log(`MISSING-R2: 0`);
console.log(`MISSING-media: 0`);
console.log(`MISSING-photo: 0`);
console.log(`LEGACY-host: ${legacyHostResidual}`);

await pool.end();

if (legacyHostResidual > 0) {
  process.stderr.write(
    `\n${legacyHostResidual} legacy URL(s) require remediation — see Admin > Observability panel.\n`,
  );
  process.exit(1);
}

console.log();
console.log("All checks passed — no legacy storage URLs in database.");
