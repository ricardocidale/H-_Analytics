#!/usr/bin/env tsx
/**
 * cleanup-legacy-logo-urls.ts — One-time admin cleanup for the
 * `logos` rows still pointing at the pre-cutover `/objects/uploads/<uuid>`
 * namespace (Task #526, follow-up to Tasks #519 / #521).
 *
 * Why this exists
 * ---------------
 * Task #521 added defensive guards in `server/ai/asset-intelligence.ts` and
 * `server/lib/canonical-asset-url.ts` so that legacy logo URLs which can no
 * longer be resolved to a canonical sink:
 *   - silently drop out of Rebecca's search results at query time, and
 *   - get skipped at indexing time (with the "Skipped N logo(s) with
 *     unresolvable legacy /objects/uploads URL during indexing" warning).
 *
 * Those guards stop the breakage from leaking into Rebecca's prompt, but
 * they leave dead rows in the `logos` table and orphaned chunks in the
 * vector store. Once the R2 cutover has settled, an admin runs this
 * script to either:
 *   - REWRITE rows whose URL has a resolvable canonical sibling
 *     (`/api/media/<file>` row on the same `company_name`) so the
 *     row stops triggering the runtime guard, or
 *   - DELETE rows whose URL has no canonical sibling at all (the bytes
 *     are gone — the row is purely a 404 placeholder).
 *
 * The two operations are split because the choice is a human one: a
 * rewrite is safe and lossless; a delete throws away the row entirely
 * (FK refs in `companies.logo_id`, `business_brands.logo_id`,
 * `global_assumptions.company_logo_id`, and
 * `global_assumptions.asset_logo_id` already declare
 * `ON DELETE SET NULL`, so the database does the right thing — but
 * admins still want to see the report before pulling the trigger).
 *
 * Behaviour
 * ---------
 *   Default (read-only):
 *     - Scan `logos` for rows whose `url` starts with `/objects/uploads/`.
 *     - Bucket each row as `rewrite` (sibling exists) or `delete` (no sibling).
 *     - Print FK references for each row so the admin sees impact.
 *     - Exit 1 if any rows match (so the script can be wired into a
 *       scheduled / pre-deploy check without a separate flag), 0 if clean.
 *
 *   With `--rewrite-resolvable`:
 *     - For each `rewrite` row, update `logos.url` to the sibling URL
 *       in-place. Idempotent — re-running on a clean DB is a no-op.
 *
 *   With `--delete-unresolvable`:
 *     - For each `delete` row, delete the row from `logos`. The FK
 *       columns above SET NULL automatically. Refuses to delete rows
 *       marked `is_default = true` or `is_app_logo = true` — admin must
 *       reassign first.
 *
 *   With `--apply`: shorthand for both `--rewrite-resolvable` and
 *     `--delete-unresolvable` in one pass.
 *
 *   With `--json`: emit the report as JSON instead of a human table.
 *
 * Once `--apply` has been run successfully, the
 * `Skipped N logo(s) with unresolvable legacy /objects/uploads URL during
 *  indexing`
 * warning in `server/ai/asset-intelligence.ts` stops appearing because
 * the table no longer contains any `/objects/uploads/...` URLs at all.
 *
 * Re-runnable. Read-only by default.
 */
import { pool } from "../server/db";
import {
  type ClassifiedRow,
  type CleanupSummary,
  type LogoFkRefs,
  applyDeletes,
  applyRewrites,
  classifyLegacyLogos,
  fetchLegacyLogos,
  summariseCleanup,
} from "./lib/legacy-logo-cleanup";

interface CliOptions {
  json: boolean;
  rewriteResolvable: boolean;
  deleteUnresolvable: boolean;
}

function log(msg: string): void {
  process.stdout.write(msg + "\n");
}

function parseArgs(argv: string[]): CliOptions {
  const args = new Set(argv);
  const apply = args.has("--apply");
  return {
    json: args.has("--json"),
    rewriteResolvable: apply || args.has("--rewrite-resolvable"),
    deleteUnresolvable: apply || args.has("--delete-unresolvable"),
  };
}

function refsToString(refs: LogoFkRefs): string {
  const parts: string[] = [];
  if (refs.companies.length) parts.push(`companies=[${refs.companies.join(",")}]`);
  if (refs.businessBrands.length) parts.push(`business_brands=[${refs.businessBrands.join(",")}]`);
  if (refs.globalAssumptionsCompany.length)
    parts.push(`global_assumptions.company=[${refs.globalAssumptionsCompany.join(",")}]`);
  if (refs.globalAssumptionsAsset.length)
    parts.push(`global_assumptions.asset=[${refs.globalAssumptionsAsset.join(",")}]`);
  return parts.length ? parts.join(" ") : "(no FK refs)";
}

function flagsToString(r: ClassifiedRow): string {
  const flags: string[] = [];
  if (r.isDefault) flags.push("DEFAULT");
  if (r.isAppLogo) flags.push("APP_LOGO");
  return flags.length ? ` [${flags.join(",")}]` : "";
}

function printHumanReport(rows: ClassifiedRow[], summary: CleanupSummary): void {
  log("=== Legacy logo URL cleanup (Task #526) ===");
  log("");
  log(`Found ${summary.total} logo row(s) with /objects/uploads/<key> URLs:`);
  log(`  rewrite (sibling found):  ${summary.rewrite}`);
  log(`  delete  (no sibling):     ${summary.delete}`);
  if (summary.blockedByDefault > 0)
    log(`    ! ${summary.blockedByDefault} of the deletes are the DEFAULT logo — reassign first.`);
  if (summary.blockedByAppLogo > 0)
    log(`    ! ${summary.blockedByAppLogo} of the deletes are the APP logo — reassign first.`);
  log("");

  if (rows.length === 0) {
    log("ALL CLEAR — no legacy /objects/uploads/<key> logos remain.");
    return;
  }

  const rewriteRows = rows.filter((r) => r.verdict === "rewrite");
  const deleteRows = rows.filter((r) => r.verdict === "delete");

  if (rewriteRows.length > 0) {
    log(`-- REWRITE (${rewriteRows.length}) --`);
    for (const r of rewriteRows) {
      log(`  id=${r.id}  company=${JSON.stringify(r.companyName)}${flagsToString(r)}`);
      log(`    from: ${r.url}`);
      log(`    to:   ${r.canonicalUrl}`);
      log(`    refs: ${refsToString(r.refs)}`);
    }
    log("");
  }

  if (deleteRows.length > 0) {
    log(`-- DELETE (${deleteRows.length}) --`);
    for (const r of deleteRows) {
      log(`  id=${r.id}  company=${JSON.stringify(r.companyName)}${flagsToString(r)}`);
      log(`    url:  ${r.url}`);
      log(`    refs: ${refsToString(r.refs)}`);
    }
    log("");
  }
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const legacy = await fetchLegacyLogos(pool);
  const classified = await classifyLegacyLogos(pool, legacy);
  const summary = summariseCleanup(classified);

  if (opts.json && !opts.rewriteResolvable && !opts.deleteUnresolvable) {
    process.stdout.write(
      JSON.stringify(
        {
          summary,
          rows: classified,
          applied: { rewrites: 0, deletes: 0, blocked: [] as number[] },
        },
        null,
        2,
      ) + "\n",
    );
  } else if (!opts.json) {
    printHumanReport(classified, summary);
  }

  let exitCode = classified.length === 0 ? 0 : 1;

  if (opts.rewriteResolvable || opts.deleteUnresolvable) {
    let appliedRewrites = 0;
    let appliedDeletes = 0;
    let blocked: ClassifiedRow[] = [];

    if (opts.rewriteResolvable) {
      appliedRewrites = await applyRewrites(pool, classified);
    }
    if (opts.deleteUnresolvable) {
      const result = await applyDeletes(pool, classified);
      appliedDeletes = result.deleted;
      blocked = result.blocked;
    }

    if (!opts.json) {
      log("-- APPLIED --");
      log(`  rewritten: ${appliedRewrites}`);
      log(`  deleted:   ${appliedDeletes}`);
      if (blocked.length > 0) {
        log(`  blocked (default/app logo): ${blocked.length}`);
        for (const r of blocked) {
          log(`    id=${r.id} company=${JSON.stringify(r.companyName)}${flagsToString(r)}`);
        }
      }
      log("");
    } else {
      // JSON mode: emit one consolidated record so callers don't have to
      // parse two separate JSON documents from the same invocation.
      process.stdout.write(
        JSON.stringify(
          {
            summary,
            rows: classified,
            applied: {
              rewrites: appliedRewrites,
              deletes: appliedDeletes,
              blocked: blocked.map((r) => r.id),
            },
          },
          null,
          2,
        ) + "\n",
      );
    }

    // After successful application, recompute the residual count: any rows
    // still in the legacy namespace (i.e. blocked deletes) keep the exit
    // non-zero so an operator wiring this into CI sees the unfinished work.
    const residual = await fetchLegacyLogos(pool);
    exitCode = residual.length === 0 ? 0 : 1;
  }

  await pool.end();
  process.exit(exitCode);
}

main().catch(async (err) => {
  console.error("FAILED:", err);
  try {
    await pool.end();
  } catch {}
  process.exit(1);
});
