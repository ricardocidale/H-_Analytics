/**
 * check-lint.ts
 *
 * Thin cache wrapper around `pnpm -r --if-present run lint` (all packages).
 *
 * Computes a SHA-256 over the contents of every TypeScript/JavaScript source
 * file in the workspace plus every ESLint config file.  If the hash matches
 * the value stored in `.cache/check-lint.hash` from the previous successful
 * run, ESLint is skipped entirely.  On a cache miss the real lint command runs,
 * and if it exits 0 the new hash is persisted for future runs.
 *
 * This makes `check-lint` a first-class participant in the composite
 * `check-all-cached` gate (see check-all-cached.ts) so a fully-warm workspace
 * can skip the entire `pnpm run check` suite.
 *
 * Bypass: set CHECK_CACHE_DISABLED=1 to force a full re-run.
 *
 * Run via:
 *   pnpm --filter @workspace/scripts run check:lint
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

const CACHE_NAME = "lint";

// ---------------------------------------------------------------------------
// Source directories to include in the hash (mirrors the packages that
// `pnpm -r --if-present run lint` will lint).
// ---------------------------------------------------------------------------

const SOURCE_DIRS = [
  path.join(WORKSPACE_ROOT, "lib"),
  path.join(WORKSPACE_ROOT, "artifacts"),
  path.join(WORKSPACE_ROOT, "scripts", "src"),
];

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".cache",
  "dist",
  "build",
  "__generated__",
  "migrations",
  ".claude",
  "worktrees",
]);

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".mts"]);

/** Known ESLint config files across the workspace. */
const ESLINT_CONFIGS = [
  path.join(WORKSPACE_ROOT, "artifacts/api-server/eslint.config.mjs"),
  path.join(WORKSPACE_ROOT, "artifacts/hospitality-business-portal/eslint.config.mjs"),
  path.join(WORKSPACE_ROOT, "lib/shared/eslint.config.mjs"),
];

export function collectInputFiles(): string[] {
  const files: string[] = [fileURLToPath(import.meta.url)];

  for (const dir of SOURCE_DIRS) {
    for (const f of walkFilesForCache(dir, {
      extensions: SOURCE_EXTENSIONS,
      skipDirs: SKIP_DIRS,
    })) {
      files.push(f);
    }
  }

  for (const cfg of ESLINT_CONFIGS) {
    if (fs.existsSync(cfg)) files.push(cfg);
  }

  // pnpm-lock.yaml: a dependency upgrade can introduce new lint rules
  // without touching any source file, producing a false cache hit.
  const lockfile = path.join(WORKSPACE_ROOT, "pnpm-lock.yaml");
  if (fs.existsSync(lockfile)) files.push(lockfile);

  return files;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cacheHash = computeInputsHash({ files: collectInputFiles() });

  if (tryCacheHit(CACHE_NAME, cacheHash)) {
    process.exit(0);
  }

  try {
    execSync("pnpm -r --if-present run lint", {
      cwd: WORKSPACE_ROOT,
      stdio: "inherit",
    });
  } catch {
    process.exit(1);
  }

  writeCacheHit(CACHE_NAME, cacheHash);
  process.exit(0);
}
