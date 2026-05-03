/**
 * sync-db-to-railway.ts
 *
 * One-command helper that syncs a source Postgres database (typically dev) into
 * a target Postgres database (typically a Railway-hosted instance used for
 * production cut-over or staging refresh).
 *
 * Steps:
 *   1. Push the Drizzle schema into the target via `drizzle-kit push`.
 *   2. Dump data-only from the source with `pg_dump` (custom format).
 *   3. Restore into the target with `pg_restore --disable-triggers
 *      --single-transaction --no-owner --no-acl`.
 *   4. Print row-count diffs for the major tables.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run sync-db-to-railway \
 *     --source <dev-postgres-url> \
 *     --target <railway-postgres-url> \
 *     [--skip-schema] [--skip-data] [--keep-dump] [--dump-file <path>]
 *
 * Environment variables can be used in place of the flags:
 *   SOURCE_DATABASE_URL, TARGET_DATABASE_URL.
 *
 * Requirements: `pg_dump`, `pg_restore`, and `psql` must be on PATH and version
 * compatible with the source/target server versions.
 */

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const DB_PACKAGE_DIR = path.join(REPO_ROOT, "lib/db");

const MAJOR_TABLES = [
  "users",
  "companies",
  "properties",
  "scenarios",
  "scenario_results",
  "financial_assumptions",
  "model_constants",
  "model_defaults",
  "property_slide_decks",
];

interface CliOptions {
  source: string;
  target: string;
  skipSchema: boolean;
  skipData: boolean;
  keepDump: boolean;
  dumpFile: string;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      opts[key] = true;
    } else {
      opts[key] = next;
      i++;
    }
  }

  const source =
    (opts.source as string | undefined) ?? process.env.SOURCE_DATABASE_URL;
  const target =
    (opts.target as string | undefined) ?? process.env.TARGET_DATABASE_URL;

  if (!source || !target) {
    console.error(
      "Usage: sync-db-to-railway --source <url> --target <url> [--skip-schema] [--skip-data] [--keep-dump] [--dump-file <path>]",
    );
    console.error(
      "  Or set SOURCE_DATABASE_URL and TARGET_DATABASE_URL in the environment.",
    );
    process.exit(2);
  }

  const dumpFile =
    (opts["dump-file"] as string | undefined) ??
    path.join(os.tmpdir(), `sync-db-to-railway-${Date.now()}.dump`);

  return {
    source,
    target,
    skipSchema: opts["skip-schema"] === true,
    skipData: opts["skip-data"] === true,
    keepDump: opts["keep-dump"] === true,
    dumpFile,
  };
}

function maskUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = "***";
    if (u.username) u.username = u.username.slice(0, 3) + "***";
    return u.toString();
  } catch {
    return "<unparseable url>";
  }
}

function requireBinary(name: string): void {
  const result = spawnSync(name, ["--version"], { stdio: "ignore" });
  if (result.error || result.status !== 0) {
    console.error(`Required binary not found on PATH: ${name}`);
    process.exit(1);
  }
}

function runStreaming(
  cmd: string,
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = REPO_ROOT,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit", env, cwd });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with code ${code}`));
    });
  });
}

function psqlScalar(databaseUrl: string, sql: string): number | null {
  const result = spawnSync("psql", [databaseUrl, "-tAc", sql], {
    encoding: "utf8",
  });
  if (result.status !== 0) return null;
  const trimmed = result.stdout.trim();
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

async function pushSchema(targetUrl: string): Promise<void> {
  console.log("\n[1/3] Pushing Drizzle schema into target database...");
  await runStreaming(
    "pnpm",
    ["exec", "drizzle-kit", "push", "--config", "./drizzle.config.ts"],
    { ...process.env, DATABASE_URL: targetUrl },
    DB_PACKAGE_DIR,
  );
}

async function dumpAndRestore(opts: CliOptions): Promise<void> {
  console.log(`\n[2/3] Dumping source data to ${opts.dumpFile}...`);
  await runStreaming("pg_dump", [
    "--data-only",
    "--no-owner",
    "--no-acl",
    "--disable-triggers",
    "--format=custom",
    `--file=${opts.dumpFile}`,
    opts.source,
  ]);

  console.log("\n[3/3] Restoring data into target database...");
  await runStreaming("pg_restore", [
    "--data-only",
    "--no-owner",
    "--no-acl",
    "--disable-triggers",
    "--single-transaction",
    `--dbname=${opts.target}`,
    opts.dumpFile,
  ]);
}

function printRowCountDiff(sourceUrl: string, targetUrl: string): void {
  console.log("\nRow-count diff for major tables:");
  const headers = ["table", "source", "target", "delta"];
  const rows: string[][] = [headers];
  for (const table of MAJOR_TABLES) {
    const src = psqlScalar(sourceUrl, `select count(*) from ${table}`);
    const tgt = psqlScalar(targetUrl, `select count(*) from ${table}`);
    const srcStr = src === null ? "n/a" : String(src);
    const tgtStr = tgt === null ? "n/a" : String(tgt);
    const deltaStr =
      src === null || tgt === null ? "n/a" : String(tgt - src);
    rows.push([table, srcStr, tgtStr, deltaStr]);
  }
  const widths = headers.map((_, c) =>
    Math.max(...rows.map((r) => r[c].length)),
  );
  for (const r of rows) {
    console.log(
      "  " + r.map((cell, c) => cell.padEnd(widths[c])).join("  "),
    );
  }
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));

  console.log("sync-db-to-railway");
  console.log(`  source: ${maskUrl(opts.source)}`);
  console.log(`  target: ${maskUrl(opts.target)}`);
  console.log(`  skipSchema=${opts.skipSchema} skipData=${opts.skipData}`);

  requireBinary("pg_dump");
  requireBinary("pg_restore");
  requireBinary("psql");

  if (!opts.skipSchema) {
    await pushSchema(opts.target);
  } else {
    console.log("\n[1/3] Skipping schema push (--skip-schema).");
  }

  if (!opts.skipData) {
    try {
      await dumpAndRestore(opts);
    } finally {
      if (!opts.keepDump && fs.existsSync(opts.dumpFile)) {
        fs.unlinkSync(opts.dumpFile);
      } else if (opts.keepDump) {
        console.log(`\nDump retained at ${opts.dumpFile}`);
      }
    }
  } else {
    console.log("\n[2/3, 3/3] Skipping data dump/restore (--skip-data).");
  }

  printRowCountDiff(opts.source, opts.target);
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("\nsync-db-to-railway failed:");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
