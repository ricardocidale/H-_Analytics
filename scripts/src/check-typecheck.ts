/**
 * check-typecheck.ts
 *
 * Thin cache wrapper around `pnpm run typecheck` (the full workspace type-check:
 * tsc --build for composite libs, then tsc --noEmit for all artifact packages).
 *
 * Computes a SHA-256 over every TypeScript/TSX source file and every
 * tsconfig*.json file in the workspace.  If the hash matches the value stored
 * in `.cache/check-typecheck.hash` from the previous successful run, the full
 * tsc pass is skipped entirely.  On a cache miss the real typecheck command
 * runs, and if it exits 0 the new hash is persisted so the next invocation can
 * short-circuit.
 *
 * This makes `check-typecheck` a first-class participant in the composite
 * `check-all-cached` gate (see check-all-cached.ts) so a fully-warm workspace
 * can skip the entire `pnpm run check` suite in under a second.
 *
 * Bypass: set CHECK_CACHE_DISABLED=1 to force a full re-run.
 *
 * Run via:
 *   pnpm --filter @workspace/scripts run check:typecheck
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

const CACHE_NAME = "typecheck";

// ---------------------------------------------------------------------------
// Source directories to include in the hash.
// Mirrors the packages that `pnpm run typecheck` checks.
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
  "worktrees",
  ".claude",
]);

const SOURCE_EXTS = new Set([".ts", ".tsx"]);

function collectTsconfigs(dir: string, out: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        collectTsconfigs(path.join(dir, entry.name), out);
      }
    } else if (entry.isFile() && /^tsconfig.*\.json$/.test(entry.name)) {
      out.push(path.join(dir, entry.name));
    }
  }
}

export function collectInputFiles(): string[] {
  const files: string[] = [fileURLToPath(import.meta.url)];

  for (const dir of SOURCE_DIRS) {
    for (const f of walkFilesForCache(dir, {
      extensions: SOURCE_EXTS,
      skipDirs: SKIP_DIRS,
    })) {
      files.push(f);
    }
  }

  collectTsconfigs(WORKSPACE_ROOT, files);

  // pnpm-lock.yaml: a dependency upgrade can change tsc's module resolution
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
    execSync("pnpm run typecheck", {
      cwd: WORKSPACE_ROOT,
      stdio: "inherit",
    });
  } catch {
    process.exit(1);
  }

  writeCacheHit(CACHE_NAME, cacheHash);
  process.exit(0);
}
