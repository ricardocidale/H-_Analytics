/**
 * Task #525 — One-shot backfill of historical `/objects/uploads/<uuid>`
 * URLs in `rebecca_messages.content` and `activity_logs.metadata` to
 * their canonical post-cutover equivalents.
 *
 * Background
 * ----------
 * Task #521 added pre-insert guards in `server/storage/intelligence-rebecca.ts`
 * and `server/storage/activity.ts` so NEW rows can no longer be written with
 * the legacy `/objects/uploads/<uuid>` URL shape. But rows written before
 * those guards landed still carry those URLs in their bodies. After the R2
 * cutover (Task #519), the legacy GCS-backed Replit sidecar is unreachable
 * and any of those URLs 404 in the UI (broken images in old Rebecca chats
 * and audit logs).
 *
 * What this script does
 * ---------------------
 *   1. Selects every `rebecca_messages` row whose `content` text contains
 *      `/objects/uploads/`.
 *   2. Selects every `activity_logs` row whose `metadata` jsonb (cast to
 *      text) contains `/objects/uploads/`.
 *   3. For each row, runs the same canonicalisation helper used by the
 *      write-side guards (`server/lib/canonical-asset-url.ts`) so the
 *      rewrite policy stays in lockstep:
 *        - resolvable legacy URLs (`property_photos.image_url` or a
 *          sibling `/api/media/<file>` logo on the same `company_name`)
 *          are rewritten in place;
 *        - unresolvable legacy URLs are left untouched so the reconcile
 *          script can still surface them for manual remediation.
 *   4. Reports per-table counts of:
 *        - rows scanned
 *        - rows rewritten (and total URLs rewritten)
 *        - legacy URLs left as-is (no canonical sink owns the bytes)
 *
 * Modes
 * -----
 *   Default: DRY-RUN. Reads only; prints what WOULD change.
 *   --apply: commit the rewrites with `UPDATE` statements (parameterised,
 *            keyed by primary key).
 *
 * Validation
 * ----------
 * After running with `--apply`, `script/r2-cutover-reconcile.ts` should
 * report ALL CLEAR (i.e. zero `missing-r2` for the legacy upload paths
 * that this script knew how to canonicalise). Anything left in the
 * "unresolved" bucket below is genuinely unresolvable from the DB
 * (no canonical sink owns those bytes) — operator must remediate by
 * either uploading the canonical equivalent or scrubbing the row.
 *
 * Re-runnable. Idempotent — a second invocation finds zero rewritable URLs
 * because the first invocation already rewrote everything resolvable.
 */
import { pool } from "../server/db";
import {
  containsLegacyUploadUrl,
  rewriteLegacyUploadsInText,
} from "../server/lib/canonical-asset-url";

/** Same regex shape the helper uses, replicated here so we can count
 *  per-row legacy occurrences without re-implementing detection. */
const LEGACY_UPLOAD_RE = /\/objects\/uploads\/[A-Za-z0-9_-]+/g;

function log(msg: string) {
  process.stdout.write(msg + "\n");
}

function uniqueLegacyMatches(s: string): string[] {
  return Array.from(new Set(s.match(LEGACY_UPLOAD_RE) ?? []));
}

type TableStats = {
  table: string;
  rowsScanned: number;
  rowsRewritten: number;
  urlsRewritten: number;
  urlsUnresolved: number;
  unresolvedSamples: Array<{ pk: number | string; url: string }>;
};

function emptyStats(table: string): TableStats {
  return {
    table,
    rowsScanned: 0,
    rowsRewritten: 0,
    urlsRewritten: 0,
    urlsUnresolved: 0,
    unresolvedSamples: [],
  };
}

/**
 * Backfill `rebecca_messages.content`. The column is plain text, so the
 * text-rewriter from the helper applies directly.
 */
async function backfillRebeccaMessages(apply: boolean): Promise<TableStats> {
  const stats = emptyStats("rebecca_messages.content");
  const { rows } = await pool.query<{ id: number; content: string }>(
    `SELECT id, content
       FROM rebecca_messages
      WHERE content LIKE '%/objects/uploads/%'`,
  );
  stats.rowsScanned = rows.length;

  for (const row of rows) {
    if (!containsLegacyUploadUrl(row.content)) continue;
    const before = uniqueLegacyMatches(row.content);
    const result = await rewriteLegacyUploadsInText(row.content);
    const after = uniqueLegacyMatches(result.text);

    stats.urlsRewritten += result.rewritten;
    // Anything still present after rewrite has no canonical sink.
    for (const stillPresent of after) {
      stats.urlsUnresolved += 1;
      if (stats.unresolvedSamples.length < 25) {
        stats.unresolvedSamples.push({ pk: row.id, url: stillPresent });
      }
    }

    if (result.rewritten > 0 && result.text !== row.content) {
      stats.rowsRewritten += 1;
      const verb = apply ? "rewrite" : "would rewrite";
      log(
        `  ${verb} rebecca_messages#${row.id}: ${result.rewritten}/${before.length} URL(s)`,
      );
      if (apply) {
        await pool.query(
          `UPDATE rebecca_messages SET content = $1 WHERE id = $2`,
          [result.text, row.id],
        );
      }
    }
  }
  return stats;
}

/**
 * Backfill `activity_logs.metadata`. The column is jsonb. Stringifying and
 * running the text-rewriter is safe because:
 *   - the legacy URL pattern (`/objects/uploads/<uuid>`) contains only
 *     characters that JSON.stringify never escapes, so substring replacement
 *     across the serialised form keeps JSON validity;
 *   - canonical replacements are also plain ASCII, with no JSON-significant
 *     characters (no quotes, no backslashes), preserving validity.
 * We re-parse and round-trip through JSON.stringify before writing back so
 * the value we send to Postgres is canonical JSON regardless of the
 * original whitespace.
 */
async function backfillActivityLogs(apply: boolean): Promise<TableStats> {
  const stats = emptyStats("activity_logs.metadata");
  const { rows } = await pool.query<{ id: number; metadata: unknown }>(
    `SELECT id, metadata
       FROM activity_logs
      WHERE metadata::text LIKE '%/objects/uploads/%'`,
  );
  stats.rowsScanned = rows.length;

  for (const row of rows) {
    if (row.metadata == null || typeof row.metadata !== "object") continue;
    const serialised = JSON.stringify(row.metadata);
    if (!containsLegacyUploadUrl(serialised)) continue;
    const before = uniqueLegacyMatches(serialised);
    const result = await rewriteLegacyUploadsInText(serialised);
    const after = uniqueLegacyMatches(result.text);

    stats.urlsRewritten += result.rewritten;
    for (const stillPresent of after) {
      stats.urlsUnresolved += 1;
      if (stats.unresolvedSamples.length < 25) {
        stats.unresolvedSamples.push({ pk: row.id, url: stillPresent });
      }
    }

    if (result.rewritten > 0 && result.text !== serialised) {
      // Re-parse to confirm validity before writing. If the rewrite somehow
      // produced invalid JSON (it shouldn't — see comment above) we fail
      // loudly rather than corrupt the row.
      let nextMetadata: unknown;
      try {
        nextMetadata = JSON.parse(result.text);
      } catch (err) {
        log(
          `  SKIP activity_logs#${row.id}: rewritten metadata is not valid JSON: ${err instanceof Error ? err.message : err}`,
        );
        continue;
      }
      stats.rowsRewritten += 1;
      const verb = apply ? "rewrite" : "would rewrite";
      log(
        `  ${verb} activity_logs#${row.id}: ${result.rewritten}/${before.length} URL(s)`,
      );
      if (apply) {
        await pool.query(
          `UPDATE activity_logs SET metadata = $1::jsonb WHERE id = $2`,
          [JSON.stringify(nextMetadata), row.id],
        );
      }
    }
  }
  return stats;
}

function reportTable(stats: TableStats) {
  log("");
  log(`  ── ${stats.table} ──`);
  log(`    rows scanned    : ${stats.rowsScanned}`);
  log(`    rows rewritten  : ${stats.rowsRewritten}`);
  log(`    URLs rewritten  : ${stats.urlsRewritten}`);
  log(`    URLs unresolved : ${stats.urlsUnresolved}`);
  if (stats.unresolvedSamples.length) {
    log(`    unresolved samples (kept as-is for manual review):`);
    for (const s of stats.unresolvedSamples) {
      log(`      #${s.pk} → ${s.url}`);
    }
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const apply = args.has("--apply");

  log("=== Backfill canonical URLs (Task #525) ===");
  log(`mode: ${apply ? "APPLY (will UPDATE rows)" : "DRY-RUN (no writes)"}`);
  log("");

  log("[1/2] Scanning rebecca_messages.content ...");
  const rebeccaStats = await backfillRebeccaMessages(apply);

  log("");
  log("[2/2] Scanning activity_logs.metadata ...");
  const activityStats = await backfillActivityLogs(apply);

  log("");
  log("=== Summary ===");
  reportTable(rebeccaStats);
  reportTable(activityStats);

  const totalRewritable =
    rebeccaStats.urlsRewritten + activityStats.urlsRewritten;
  const totalUnresolved =
    rebeccaStats.urlsUnresolved + activityStats.urlsUnresolved;

  log("");
  if (apply) {
    log(
      `Applied ${totalRewritable} URL rewrite(s). ${totalUnresolved} legacy URL(s) left as-is (no canonical sink).`,
    );
    log(
      `Next: run \`tsx script/r2-cutover-reconcile.ts\` to confirm ALL CLEAR.`,
    );
  } else {
    log(
      `DRY-RUN: would rewrite ${totalRewritable} URL(s); ${totalUnresolved} would remain unresolved.`,
    );
    log(`Re-run with --apply to commit.`);
  }

  await pool.end();
}

main().catch(async (err) => {
  console.error("FAILED:", err);
  try {
    await pool.end();
  } catch {}
  process.exit(1);
});
