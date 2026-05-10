/**
 * check-direct-run-guards.ts
 *
 * Guards against the esbuild bundle-unsafe direct-run pattern in script/ files.
 *
 * ## Background
 *
 * When esbuild bundles everything into dist/index.mjs, all inlined modules
 * share the same import.meta.url (the bundle entry point). Scripts that used:
 *
 *   import.meta.url === pathToFileURL(resolve(process.argv[1])).href
 *
 * to detect "am I being run directly?" would therefore evaluate to `true` on
 * every server boot and call process.exit(0), silently killing the server.
 *
 * This happened with three seed scripts in May 2026. All were fixed manually
 * by switching to the bundle-safe pattern (argv basename regex check), but
 * there was no automated guard to prevent reintroduction.
 *
 * ## What this check does
 *
 * Scans every *.ts file under artifacts/api-server/script/ (and any other
 * artifact-level script/ directories discovered in the workspace) for lines
 * that contain both `import.meta.url` and `pathToFileURL`. Lines that are
 * pure comments (// or *) are skipped.  Any match is a violation.
 *
 * ## Safe alternative (bundle-safe direct-run guard)
 *
 *   const isDirectRun =
 *     Boolean(process.argv[1]) &&
 *     /my-script-name\.[jt]s(x?)$/.test(process.argv[1]);
 *
 *   if (isDirectRun) { main(); }
 *
 * See: docs/solutions/runtime-errors/esbuild-import-meta-url-direct-run-guard-2026-05-10.md
 *
 * Run via:
 *   pnpm --filter @workspace/scripts run check:direct-run-guards
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { computeInputsHash, tryCacheHit, writeCacheHit } from "./lib/check-cache.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(__dirname, "../..");

const LEARNING_DOC =
  "docs/solutions/runtime-errors/esbuild-import-meta-url-direct-run-guard-2026-05-10.md";

/**
 * Directories named `script` (not `scripts`) are the target — these are the
 * artifact-local seed/utility scripts that get bundled by esbuild alongside
 * the server code.  The workspace-level `scripts/` package is a separate
 * tool/CI package and is intentionally excluded.
 */
const SCRIPT_DIR_NAME = "script";

/** Root of the artifacts tree to deep-walk when discovering script/ dirs. */
const ARTIFACTS_ROOT = path.join(WORKSPACE_ROOT, "artifacts");

/**
 * Pattern 1 — same-line: the classic broken guard written as a single
 * expression line.
 *   import.meta.url === pathToFileURL(resolve(process.argv[1])).href
 */
const SAME_LINE_RE = /import\.meta\.url.*pathToFileURL/;

/**
 * Pattern 2 — import.meta.url used in a non-import, non-comment context.
 * We flag any code line that contains `import.meta.url` AND the file also
 * contains `pathToFileURL` anywhere in non-comment code.  This catches
 * multi-line expressions where the two halves appear on different lines.
 */
const META_URL_RE = /import\.meta\.url/;
const PATH_TO_FILE_URL_RE = /pathToFileURL/;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns true if the trimmed line is a line comment or block-comment line. */
function isCommentLine(line: string): boolean {
  const trimmed = line.trimStart();
  return (
    trimmed.startsWith("//") ||
    trimmed.startsWith("*") ||
    trimmed.startsWith("/*")
  );
}

/** Strip single-line comment suffix from a line (crude but good enough). */
function stripInlineComment(line: string): string {
  const idx = line.indexOf("//");
  return idx >= 0 ? line.slice(0, idx) : line;
}

// ---------------------------------------------------------------------------
// Input file collection (exported for check-selective.ts)
// ---------------------------------------------------------------------------

/**
 * Recursively walks `dir`, collecting all *.ts files found inside any
 * directory whose name equals SCRIPT_DIR_NAME ("script").  Directories named
 * SCRIPT_DIR_NAME are not descended into further — only their direct *.ts
 * children are collected (nested script/ dirs are an unusual layout that would
 * need an explicit decision to support).
 */
function collectScriptFilesDeep(dir: string, out: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const child = path.join(dir, entry.name);

    if (entry.name === SCRIPT_DIR_NAME) {
      // Found a script/ directory — collect its *.ts files directly.
      let scriptEntries: fs.Dirent[];
      try {
        scriptEntries = fs.readdirSync(child, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const sf of scriptEntries) {
        if (sf.isFile() && sf.name.endsWith(".ts")) {
          out.push(path.join(child, sf.name));
        }
      }
    } else {
      // Keep descending into non-script directories.
      collectScriptFilesDeep(child, out);
    }
  }
}

/** Enumerate all *.ts files under every script/ directory beneath artifacts/. */
export function collectInputFiles(): string[] {
  const files: string[] = [fileURLToPath(import.meta.url)];
  collectScriptFilesDeep(ARTIFACTS_ROOT, files);
  return files;
}

// ---------------------------------------------------------------------------
// Scan a single file for violations
// ---------------------------------------------------------------------------

interface Violation {
  file: string;
  line: number;
  text: string;
  reason: string;
}

export function scanFile(absPath: string): Violation[] {
  const violations: Violation[] = [];
  const rel = path.relative(WORKSPACE_ROOT, absPath);

  let content: string;
  try {
    content = fs.readFileSync(absPath, "utf8");
  } catch {
    return violations;
  }

  const lines = content.split("\n");

  // Collect non-comment code lines for whole-file checks.
  const codeLines = lines.map((l, i) => ({
    idx: i,
    raw: l,
    code: isCommentLine(l) ? "" : stripInlineComment(l),
  }));

  // Check 1: same-line pattern (import.meta.url AND pathToFileURL on one line).
  for (const { idx, code } of codeLines) {
    if (!code) continue;
    if (SAME_LINE_RE.test(code)) {
      violations.push({
        file: rel,
        line: idx + 1,
        text: lines[idx].trim(),
        reason:
          "same-line import.meta.url + pathToFileURL — fires true for every " +
          "inlined module when bundled with esbuild",
      });
    }
  }

  // Check 2: file contains pathToFileURL in code AND import.meta.url in code,
  // even if on different lines (multi-line expression).  Only report if check 1
  // didn't already catch it (avoid double-reporting the same file).
  if (violations.length === 0) {
    const hasPathToFileUrl = codeLines.some((l) => l.code && PATH_TO_FILE_URL_RE.test(l.code));
    if (hasPathToFileUrl) {
      for (const { idx, code } of codeLines) {
        if (!code) continue;
        if (META_URL_RE.test(code)) {
          violations.push({
            file: rel,
            line: idx + 1,
            text: lines[idx].trim(),
            reason:
              "import.meta.url used in code AND file also uses pathToFileURL — " +
              "likely a multi-line bundle-unsafe direct-run guard",
          });
        }
      }
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const CACHE_NAME = "direct-run-guards";

function main(): void {
  const inputFiles = collectInputFiles();
  const cacheHash = computeInputsHash({ files: inputFiles });
  if (tryCacheHit(CACHE_NAME, cacheHash)) return;

  // inputFiles[0] is the script itself; scan everything else.
  const scriptFiles = inputFiles.slice(1);

  if (scriptFiles.length === 0) {
    console.log("check:direct-run-guards  PASS — no script/ files found to scan");
    writeCacheHit(CACHE_NAME, cacheHash);
    return;
  }

  const allViolations: Violation[] = [];
  for (const f of scriptFiles) {
    allViolations.push(...scanFile(f));
  }

  if (allViolations.length === 0) {
    console.log(
      `check:direct-run-guards  PASS — ${scriptFiles.length} file(s) scanned, no violations`,
    );
    writeCacheHit(CACHE_NAME, cacheHash);
    return;
  }

  console.error(
    `\n✖ check:direct-run-guards found ${allViolations.length} violation(s):\n`,
  );
  for (const v of allViolations) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`    ${v.text}`);
    console.error(`    ↳ ${v.reason}`);
    console.error("");
  }

  console.error("── Why this matters ─────────────────────────────────────────────────────");
  console.error(
    "  When esbuild bundles script/ files into dist/index.mjs, all inlined",
  );
  console.error(
    "  modules share the same import.meta.url. A guard that compares",
  );
  console.error(
    "  import.meta.url to pathToFileURL(process.argv[1]).href will evaluate",
  );
  console.error(
    "  to `true` on every server boot, calling process.exit(0) silently.",
  );
  console.error("");
  console.error("── Safe alternative ─────────────────────────────────────────────────────");
  console.error(
    "  const isDirectRun =",
  );
  console.error(
    "    Boolean(process.argv[1]) &&",
  );
  console.error(
    "    /my-script-name\\.[jt]s(x?)$/.test(process.argv[1]);",
  );
  console.error("");
  console.error(`── Learning doc ─────────────────────────────────────────────────────────`);
  console.error(`  ${LEARNING_DOC}`);
  console.error("");

  process.exit(1);
}

// Bundle-safe direct-run guard (uses argv basename, NOT import.meta.url).
const isDirectRun =
  Boolean(process.argv[1]) &&
  /check-direct-run-guards\.[jt]s(x?)$/.test(process.argv[1]);

if (isDirectRun) {
  main();
}
