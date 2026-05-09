/**
 * check-lint-libs.ts
 *
 * Thin cache wrapper around `pnpm --filter './lib/**' -r --if-present run lint`
 * (library packages only).
 *
 * Computes a SHA-256 over the contents of every TypeScript/JavaScript source
 * file in the lib/ directory plus the shared ESLint config.  If the hash
 * matches the value stored in `.cache/check-lint-libs.hash` from the previous
 * successful run, ESLint is skipped entirely.  On a cache miss the real lint
 * command runs, and if it exits 0 the new hash is persisted for future runs.
 *
 * This makes `check-lint-libs` a first-class participant in the composite
 * `check-all-cached` gate (see check-all-cached.ts) so a fully-warm workspace
 * can skip the entire `pnpm run check` suite.
 *
 * Bypass: set CHECK_CACHE_DISABLED=1 to force a full re-run.
 *
 * Run via:
 *   pnpm --filter @workspace/scripts run check:lint:libs
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  computeInputsHash,
  tryCacheHit,
  walkFilesForCache,
  WORKSPACE_ROOT,
  writeCacheHit,
} from "./lib/check-cache.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CACHE_NAME = "lint-libs";

// ---------------------------------------------------------------------------
// Source directories to include in the hash (only lib packages).
// ---------------------------------------------------------------------------

const LIB_DIR = path.join(WORKSPACE_ROOT, "lib");

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".cache",
  "dist",
  "build",
  "__generated__",
  ".claude",
]);

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".mts"]);

/** ESLint config files that affect lib linting. */
const ESLINT_CONFIGS = [path.join(WORKSPACE_ROOT, "lib/shared/eslint.config.mjs")];

function collectInputFiles(): string[] {
  const files: string[] = [fileURLToPath(import.meta.url)];

  for (const f of walkFilesForCache(LIB_DIR, {
    extensions: SOURCE_EXTENSIONS,
    skipDirs: SKIP_DIRS,
  })) {
    files.push(f);
  }

  for (const cfg of ESLINT_CONFIGS) {
    if (fs.existsSync(cfg)) files.push(cfg);
  }

  return files;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const cacheHash = computeInputsHash({ files: collectInputFiles() });

if (tryCacheHit(CACHE_NAME, cacheHash)) {
  process.exit(0);
}

try {
  execSync("pnpm --filter './lib/**' -r --if-present run lint", {
    cwd: WORKSPACE_ROOT,
    stdio: "inherit",
  });
} catch {
  process.exit(1);
}

writeCacheHit(CACHE_NAME, cacheHash);
process.exit(0);
