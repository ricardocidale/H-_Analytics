/**
 * check-cache.ts
 *
 * Shared input-hashing helper used by the lightweight check scripts to
 * short-circuit when nothing on disk has changed since the last successful
 * run. Pairs with the TS incremental and ESLint caches added in tasks #1208
 * and #1209 to make a warm `pnpm run check` skip work it has already done.
 *
 * Each consumer:
 *   1. Builds a list of input file paths whose contents (plus the script's
 *      own contents) fully determine the check's verdict.
 *   2. Computes a stable SHA-256 over (sorted absolute path + content hash).
 *   3. Compares against the value previously persisted at
 *      .cache/check-<name>.hash. If equal, prints a "PASS (cached)" line
 *      and exits 0 without doing real work.
 *   4. On a real successful run, writes the new hash so the next invocation
 *      can short-circuit.
 *
 * Cache misses simply fall through to the normal check. The cache is never
 * written on failure, so a failing check stays failing on the next run.
 *
 * The cache files live under .cache/ which is already gitignored.
 *
 * Bypass:
 *   - Set CHECK_CACHE_DISABLED=1 to force every check to re-run from scratch.
 *   - Delete .cache/check-<name>.hash to invalidate one specific check.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Workspace root (scripts/src/lib -> ../../..). */
export const WORKSPACE_ROOT = path.resolve(__dirname, "../../..");

const CACHE_DIR = path.join(WORKSPACE_ROOT, ".cache");

export interface CacheInputs {
  /** Absolute file paths whose contents affect the check's verdict. */
  files: string[];
  /**
   * Optional extra string folded into the hash — use for things like the
   * script's CLI args or schema version when those should bust the cache.
   */
  extra?: string;
}

function isDisabled(): boolean {
  return process.env.CHECK_CACHE_DISABLED === "1";
}

export function computeInputsHash(inputs: CacheInputs): string {
  const h = crypto.createHash("sha256");
  const sorted = [...new Set(inputs.files)].sort();
  for (const f of sorted) {
    const rel = path.relative(WORKSPACE_ROOT, f).replace(/\\/g, "/");
    h.update(rel);
    h.update("\0");
    try {
      const stat = fs.statSync(f);
      if (stat.isFile()) {
        const data = fs.readFileSync(f);
        h.update(crypto.createHash("sha256").update(data).digest());
      } else {
        h.update("NON_FILE");
      }
    } catch {
      h.update("MISSING");
    }
    h.update("\0");
  }
  if (inputs.extra) {
    h.update("EXTRA\0");
    h.update(inputs.extra);
  }
  return h.digest("hex");
}

function cachePath(name: string): string {
  return path.join(CACHE_DIR, `check-${name}.hash`);
}

function readCache(name: string): string | null {
  try {
    return fs.readFileSync(cachePath(name), "utf8").trim();
  } catch {
    return null;
  }
}

/**
 * Returns true and prints a "cached" PASS line when the previously persisted
 * hash matches the supplied one. Callers should `process.exit(0)` immediately.
 */
export function tryCacheHit(name: string, hash: string): boolean {
  if (isDisabled()) return false;
  const prev = readCache(name);
  if (prev !== hash) return false;
  console.log(`check:${name}  PASS (cached, inputs unchanged)`);
  return true;
}

/** Persist the hash of the inputs that just produced a successful run. */
export function writeCacheHit(name: string, hash: string): void {
  if (isDisabled()) return;
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(cachePath(name), hash + "\n", "utf8");
  } catch {
    // Cache writes are best-effort — never fail the check on a cache write
    // problem (read-only FS, race with another runner, etc.).
  }
}

/**
 * Walk a directory and yield every file path whose extension is in the
 * supplied set. Directories listed in `skipDirs` (matched by basename) are
 * pruned. Used by callers to enumerate the file set whose contents form the
 * cache key.
 */
export function* walkFilesForCache(
  dir: string,
  opts: {
    extensions: Set<string>;
    skipDirs: Set<string>;
    /** Optional per-file filter applied after extension matching. */
    fileFilter?: (basename: string) => boolean;
  },
): Generator<string> {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (opts.skipDirs.has(entry.name)) continue;
      yield* walkFilesForCache(path.join(dir, entry.name), opts);
    } else if (entry.isFile()) {
      if (!opts.extensions.has(path.extname(entry.name))) continue;
      if (opts.fileFilter && !opts.fileFilter(entry.name)) continue;
      yield path.join(dir, entry.name);
    }
  }
}
