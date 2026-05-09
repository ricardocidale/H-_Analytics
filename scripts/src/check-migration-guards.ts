/**
 * check-migration-guards.ts
 *
 * Enforces the belt-and-suspenders migration pattern documented in
 * artifacts/api-server/src/migrations/README.md.
 *
 * Every entry in artifacts/api-server/migrations/meta/_journal.json must be
 * declared in artifacts/api-server/src/migrations/migration-guards.json with
 * one of these statuses:
 *
 *   guarded         → has a runtime *.ts guard in src/migrations/ that
 *                     re-applies the DDL idempotently. Requires a `guard`
 *                     field pointing at a file that exists.
 *   self-idempotent → the .sql file itself is fully idempotent (every
 *                     statement uses IF NOT EXISTS / IF EXISTS / DO block).
 *                     Requires a `reason`.
 *   legacy          → pre-bootstrap entry (idx 0–3) pre-marked as applied
 *                     by bootstrapDrizzleMigrationState(). New entries
 *                     should NOT use this status.
 *   waived          → deliberate exception. Requires a `reason`.
 *
 * Exits 1 on any violation. Run via:
 *
 *   pnpm --filter @workspace/scripts run check:migration-guards
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { computeInputsHash, tryCacheHit, writeCacheHit } from "./lib/check-cache.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(__dirname, "../..");

const JOURNAL_PATH = path.join(
  WORKSPACE_ROOT,
  "artifacts/api-server/migrations/meta/_journal.json",
);
const GUARDS_DIR = path.join(WORKSPACE_ROOT, "artifacts/api-server/src/migrations");
const MANIFEST_PATH = path.join(GUARDS_DIR, "migration-guards.json");

const VALID_STATUSES = new Set([
  "guarded",
  "self-idempotent",
  "legacy",
  "waived",
]);

type ManifestEntry = {
  status: string;
  guard?: string;
  reason?: string;
};

type Manifest = {
  entries: Record<string, ManifestEntry>;
};

type JournalEntry = { idx: number; tag: string };

function fail(violations: string[]): never {
  console.error(`\n✖ check:migration-guards found ${violations.length} violation(s):\n`);
  for (const v of violations) console.error(`  - ${v}`);
  console.error(
    "\nSee artifacts/api-server/src/migrations/README.md for the belt-and-suspenders pattern.\n",
  );
  process.exit(1);
}

const CACHE_NAME = "migration-guards";

function collectInputFiles(): string[] {
  const files: string[] = [
    fileURLToPath(import.meta.url),
    JOURNAL_PATH,
    MANIFEST_PATH,
  ];
  // Every guard file in src/migrations/ contributes to the verdict — adding
  // or editing a guard must invalidate the cache.
  try {
    for (const entry of fs.readdirSync(GUARDS_DIR, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      if (entry.name.endsWith(".ts") || entry.name.endsWith(".json")) {
        files.push(path.join(GUARDS_DIR, entry.name));
      }
    }
  } catch {
    // Directory missing — main() will surface a clearer error.
  }
  return files;
}

function main(): void {
  if (!fs.existsSync(JOURNAL_PATH)) {
    console.error(`✖ journal not found at ${JOURNAL_PATH}`);
    process.exit(1);
  }
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error(`✖ manifest not found at ${MANIFEST_PATH}`);
    process.exit(1);
  }

  // Input-hash cache (task #1214) — exit early if nothing has changed.
  const cacheHash = computeInputsHash({ files: collectInputFiles() });
  if (tryCacheHit(CACHE_NAME, cacheHash)) return;

  const journal = JSON.parse(fs.readFileSync(JOURNAL_PATH, "utf-8")) as {
    entries: JournalEntry[];
  };
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8")) as Manifest;

  const violations: string[] = [];
  const journalTags = new Set(journal.entries.map((e) => e.tag));
  const manifestTags = new Set(Object.keys(manifest.entries));

  // 1. Every journal entry must be declared.
  for (const entry of journal.entries) {
    const decl = manifest.entries[entry.tag];
    if (!decl) {
      violations.push(
        `Journal entry "${entry.tag}" is not declared in migration-guards.json. ` +
          `Add an entry with status "guarded" (preferred for new schema changes), ` +
          `"self-idempotent", or "waived".`,
      );
      continue;
    }

    if (!VALID_STATUSES.has(decl.status)) {
      violations.push(
        `"${entry.tag}" has invalid status "${decl.status}". ` +
          `Allowed: ${[...VALID_STATUSES].join(", ")}.`,
      );
      continue;
    }

    if (decl.status === "guarded") {
      if (!decl.guard) {
        violations.push(
          `"${entry.tag}" is "guarded" but has no "guard" field pointing at the runtime file.`,
        );
      } else {
        const guardPath = path.join(GUARDS_DIR, decl.guard);
        if (!fs.existsSync(guardPath)) {
          violations.push(
            `"${entry.tag}" guard file does not exist: ${path.relative(WORKSPACE_ROOT, guardPath)}`,
          );
        }
      }
    }

    if (
      (decl.status === "self-idempotent" || decl.status === "waived") &&
      !decl.reason
    ) {
      violations.push(
        `"${entry.tag}" has status "${decl.status}" but no "reason". ` +
          `Document why no runtime guard is needed.`,
      );
    }
  }

  // 2. No stale manifest entries (tag exists in manifest but not in journal).
  for (const tag of manifestTags) {
    if (!journalTags.has(tag)) {
      violations.push(
        `manifest references "${tag}" but it is not present in the Drizzle journal. ` +
          `Remove the manifest entry or restore the .sql file.`,
      );
    }
  }

  if (violations.length > 0) fail(violations);

  console.log(
    `✓ check:migration-guards: all ${journal.entries.length} Drizzle journal entries are declared.`,
  );
  writeCacheHit(CACHE_NAME, cacheHash);
}

main();
