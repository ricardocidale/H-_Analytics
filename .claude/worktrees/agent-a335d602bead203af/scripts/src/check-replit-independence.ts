/**
 * check-replit-independence.ts
 *
 * Scans the workspace for Replit-specific imports and environment-variable reads.
 * Exits 1 if any are found outside the allow-listed paths below; exits 0 if clean.
 *
 * --- ALLOW-LIST ---
 * The following paths are intentional Replit touchpoints and are excluded from
 * violations. To migrate fully off Replit, delete these files/directories and
 * remove their entries here.
 *
 *   1. artifacts/api-server/src/providers/
 *      Provider wrappers that abstract storage, auth (Replit OIDC), and config.
 *      These are the correct seam — swap providers here, not in business logic.
 *
 *   2. vite.config.ts  (any workspace)
 *      Replit dev-environment plugins are conditional on REPL_ID at build time.
 *      These never ship to production containers.
 *
 *   3. vite-plugin-meta-images.ts  (any workspace)
 *      Same rationale — Replit domain helpers used only during local development.
 *
 *   4. .replit, replit.nix, replit.md
 *      Replit workspace config files; not TypeScript, not checked here.
 *
 * NOTE: replit_integrations/ does not currently exist in the repository. If it is
 * created in the future, add its path to ALLOWED_PATH_PREFIXES below.
 * --- END ALLOW-LIST ---
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(__dirname, "../..");

/**
 * Paths (relative to WORKSPACE_ROOT) that are allowed to contain Replit
 * references. Comparisons are prefix-based so subdirectories are covered.
 */
const ALLOWED_PATH_PREFIXES: string[] = [
  "artifacts/api-server/src/providers/",
];

/**
 * File base-names that are always allowed regardless of location.
 * Covers every workspace's vite.config.ts and vite-plugin-meta-images.ts.
 * Also includes this file itself (the scanner mentions @replit/ in comments).
 */
const ALLOWED_BASENAMES: string[] = [
  "vite.config.ts",
  "vite-plugin-meta-images.ts",
  "check-replit-independence.ts",
];

/** File extensions to inspect. */
const CHECKED_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"]);

/** Directories to skip during tree walk. */
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".cache",     // local tool / build caches (e.g. bun, npm)
  ".claude",    // Claude Code session data, agent worktrees, skills
  "dist",
  "build",
  ".local",
  "vendor",     // third-party packages checked in verbatim
  "attached_assets",
  "screenshots",
  "tmp",
]);

/**
 * Pattern 1: import/require from @replit/ packages.
 * Matches:  import ... from "@replit/foo"
 *           require("@replit/foo")
 *           import("@replit/foo")
 */
const REPLIT_IMPORT_RE = /["']@replit\//;

/**
 * Pattern 2: Replit environment variable reads.
 * Matches REPL_ID, REPL_SLUG, REPLIT_DOMAINS, REPLIT_DEV_DOMAIN, etc.
 * Deliberately does NOT match REPLICATE_* (different vendor).
 */
const REPLIT_ENV_RE = /process\.env\.REPL(?:_|IT_|IT\b)/;

// ---------------------------------------------------------------------------
// Tree walker
// ---------------------------------------------------------------------------

function* walkFiles(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        yield* walkFiles(path.join(dir, entry.name));
      }
    } else if (entry.isFile()) {
      yield path.join(dir, entry.name);
    }
  }
}

// ---------------------------------------------------------------------------
// Allow-list check
// ---------------------------------------------------------------------------

function isAllowed(absolutePath: string): boolean {
  const rel = path.relative(WORKSPACE_ROOT, absolutePath).replace(/\\/g, "/");
  const base = path.basename(absolutePath);

  if (ALLOWED_BASENAMES.includes(base)) return true;
  for (const prefix of ALLOWED_PATH_PREFIXES) {
    if (rel.startsWith(prefix)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

let violations = 0;

for (const absPath of walkFiles(WORKSPACE_ROOT)) {
  const ext = path.extname(absPath);
  if (!CHECKED_EXTENSIONS.has(ext)) continue;
  if (isAllowed(absPath)) continue;

  const rel = path.relative(WORKSPACE_ROOT, absPath);
  const lines = fs.readFileSync(absPath, "utf8").split("\n");

  lines.forEach((line, idx) => {
    if (REPLIT_IMPORT_RE.test(line) || REPLIT_ENV_RE.test(line)) {
      console.error(`VIOLATION  ${rel}:${idx + 1}  ${line.trim()}`);
      violations++;
    }
  });
}

if (violations === 0) {
  console.log("check:replit-independence  PASS — no violations found");
  process.exit(0);
} else {
  console.error(
    `\ncheck:replit-independence  FAIL — ${violations} violation(s) found`
  );
  console.error(
    "If a new legitimate Replit touchpoint is needed, add it to the allow-list"
  );
  console.error("in scripts/src/check-replit-independence.ts.");
  process.exit(1);
}
