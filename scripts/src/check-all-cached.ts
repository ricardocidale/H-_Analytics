/**
 * check-all-cached.ts
 *
 * Composite warm-cache gate for `pnpm run check`.
 *
 * This script computes a FRESH SHA-256 over the union of every input file that
 * any check in `pnpm run check:core` inspects — TypeScript sources, JavaScript
 * sources, migration files, ESLint configs, and the check scripts themselves.
 * If the composite hash matches the value persisted in `.cache/check-all.hash`
 * from the previous successful all-green run, the entire suite can safely be
 * skipped.
 *
 * KEY DESIGN PRINCIPLE
 * The composite is computed from CURRENT file contents, not from the stored
 * per-check `.cache/check-<name>.hash` files.  Reading stored files would
 * leave the gate blind to file changes that occurred since the last run
 * (the stored files are only updated AFTER a successful check, so stale stored
 * values can falsely report "cached" when inputs have changed).
 *
 * MODES
 *   (default)  Gate mode:  computes fresh composite, exits 0 on hit ("ALL
 *              CHECKS PASS (cached)"), exits 1 on miss.
 *   --write    Write-back: computes fresh composite, persists it to
 *              .cache/check-all.hash. Called after all individual checks have
 *              passed (pnpm run check:core succeeds). Exits 0 always
 *              (best-effort).
 *
 * BYPASS
 *   Set CHECK_CACHE_DISABLED=1 to force a miss in gate mode and a no-op in
 *   write-back mode (consistent with the individual check caches).
 *
 * INPUT COVERAGE
 *   The composite covers every file that any check in check:core inspects:
 *     • All TS/TSX/JS/MJS source files in lib/, artifacts/, scripts/src/
 *       (covers: lint, lint-libs, magic-numbers, replit-independence,
 *        spinner-contrast, production-image, types-mirror, typecheck)
 *     • lib/db/src/**  and  lib/db/migrations/**  .ts/.sql/.json
 *       (covers: schema-drift)
 *     • artifacts/api-server/migrations/meta/_journal.json
 *       artifacts/api-server/src/migrations/*.ts + *.json
 *       (covers: migration-guards)
 *     • All eslint.config.* files in the workspace
 *       (covers: lint, lint-libs)
 *   If any of these files changes, the gate correctly misses and check:core
 *   runs in full.
 *
 * USAGE (invoked by root package.json `check` script)
 *   pnpm run check:all-cached            # gate — skip suite on hit
 *   pnpm run check:all-cached:write      # write-back after individual checks
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  computeInputsHash,
  walkFilesForCache,
  WORKSPACE_ROOT,
  writeCacheHit,
} from "./lib/check-cache.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CACHE_NAME = "all";

// ---------------------------------------------------------------------------
// Input file collection
// Covers the union of every input that any check in check:core inspects.
// ---------------------------------------------------------------------------

const SKIP_DIRS_GENERAL = new Set([
  "node_modules",
  ".git",
  ".cache",
  "dist",
  "build",
  "__generated__",
  "worktrees",
]);

/** TS/JS source extensions used by lint, typecheck, and static-analysis checks. */
const SOURCE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".mts"]);

/** Source roots whose every TS/JS file is an input to at least one check. */
const SOURCE_ROOTS = [
  path.join(WORKSPACE_ROOT, "lib"),
  path.join(WORKSPACE_ROOT, "artifacts"),
  path.join(WORKSPACE_ROOT, "scripts", "src"),
];

/** Additional migration/schema file extensions (schema-drift, migration-guards). */
const MIGRATION_EXTS = new Set([".sql", ".json"]);

/** Recursively collect every package.json under `dir`, skipping `skipDirs`. */
function collectPackageJsonFiles(
  dir: string,
  skipDirs: Set<string>,
  out: string[],
): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!skipDirs.has(entry.name)) {
        collectPackageJsonFiles(path.join(dir, entry.name), skipDirs, out);
      }
    } else if (entry.isFile() && entry.name === "package.json") {
      out.push(path.join(dir, entry.name));
    }
  }
}

function collectInputFiles(): string[] {
  const files: string[] = [];

  // ── General TS/JS sources ─────────────────────────────────────────────────
  for (const root of SOURCE_ROOTS) {
    for (const f of walkFilesForCache(root, {
      extensions: SOURCE_EXTS,
      skipDirs: SKIP_DIRS_GENERAL,
    })) {
      files.push(f);
    }
  }

  // ── DB schema + migration SQL/JSON (schema-drift) ─────────────────────────
  const dbLib = path.join(WORKSPACE_ROOT, "lib/db");
  for (const f of walkFilesForCache(dbLib, {
    extensions: new Set([".ts", ".sql", ".json"]),
    skipDirs: new Set(["node_modules"]),
  })) {
    files.push(f);
  }

  // ── API-server migration journal + guard files (migration-guards) ──────────
  const apiMigrationsMeta = path.join(
    WORKSPACE_ROOT,
    "artifacts/api-server/migrations/meta/_journal.json",
  );
  if (fs.existsSync(apiMigrationsMeta)) {
    files.push(apiMigrationsMeta);
  }

  // ── ESLint configs (lint, lint-libs) ──────────────────────────────────────
  const knownEslintConfigs = [
    path.join(WORKSPACE_ROOT, "artifacts/api-server/eslint.config.mjs"),
    path.join(WORKSPACE_ROOT, "artifacts/hospitality-business-portal/eslint.config.mjs"),
    path.join(WORKSPACE_ROOT, "lib/shared/eslint.config.mjs"),
  ];
  for (const cfg of knownEslintConfigs) {
    if (fs.existsSync(cfg)) files.push(cfg);
  }

  // ── Dependency manifests (pnpm-lock.yaml + all workspace package.json) ────
  // A dependency upgrade can introduce new lint rules or change tsc resolution
  // without touching any source file, so these must be part of the hash.
  const lockfile = path.join(WORKSPACE_ROOT, "pnpm-lock.yaml");
  if (fs.existsSync(lockfile)) files.push(lockfile);
  collectPackageJsonFiles(WORKSPACE_ROOT, SKIP_DIRS_GENERAL, files);

  return files;
}

// ---------------------------------------------------------------------------
// Cache I/O helpers (thin layer; the composite uses CACHE_NAME = "all")
// ---------------------------------------------------------------------------

const CACHE_DIR = path.join(WORKSPACE_ROOT, ".cache");
const CACHE_PATH = path.join(CACHE_DIR, `check-${CACHE_NAME}.hash`);

function readStoredHash(): string | null {
  try {
    return fs.readFileSync(CACHE_PATH, "utf8").trim() || null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Gate mode (default)
// ---------------------------------------------------------------------------

function runGate(): void {
  if (process.env.CHECK_CACHE_DISABLED === "1") {
    process.exit(1);
  }

  const freshHash = computeInputsHash({ files: collectInputFiles() });
  const stored = readStoredHash();

  if (stored === freshHash) {
    console.log("ALL CHECKS PASS (cached)");
    process.exit(0);
  }

  // Cache miss — caller will run individual checks.
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Write-back mode (--write)
// ---------------------------------------------------------------------------

function runWrite(): void {
  if (process.env.CHECK_CACHE_DISABLED === "1") {
    process.exit(0);
  }

  const freshHash = computeInputsHash({ files: collectInputFiles() });
  writeCacheHit(CACHE_NAME, freshHash);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const isWrite = process.argv.includes("--write");
if (isWrite) {
  runWrite();
} else {
  runGate();
}
