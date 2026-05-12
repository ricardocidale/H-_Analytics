/**
 * check-analyst-copy.ts
 *
 * Casual-register guard for Analyst status copy.
 *
 * BACKGROUND
 * ----------
 * Tasks #1425 and #1427 audited every user-visible string in the H+ portal and
 * removed the formal "The Analyst is <verb>" construction (e.g. "The Analyst
 * is studying your property", "The Analyst is computing rates", "The Analyst
 * is researching comps") in favour of casual, action-oriented phrasing
 * ("Looking at your property…", "Crunching the numbers…", "Pulling
 * comps…"). The audits fixed every known instance, but nothing prevented
 * the formal construction from creeping back in as new features were added.
 *
 * This script is that guard. It walks the H+ portal source tree and fails
 * the build if it finds the banned pattern in source-level code (string
 * literals or JSX text) outside of comments.
 *
 * PATTERN
 * -------
 *   /\bThe Analyst is [a-z][\w-]*\/i
 *
 * Examples that FAIL:
 *   "The Analyst is studying your property"
 *   <p>The Analyst is computing rates…</p>
 *   `The Analyst is researching ${target}`
 *   toast({ title: "The Analyst is cooling down" })
 *
 * Examples that PASS (the casual register the audits established):
 *   "Looking at your property…"
 *   "Crunching the numbers…"
 *   "Cooling down" (without the "The Analyst is" preamble)
 *   aria-label="Analyst is running"   // no "The" → not a status sentence
 *
 * COMMENT EXCLUSION
 * -----------------
 * Comments (// line and /* block *\/) are stripped before the regex runs, so
 * historical/explanatory mentions like "// The Analyst is doing research"
 * inside JSDoc or inline comments are NOT flagged. Only actual code and
 * string content is checked.
 *
 * The stripper is a small hand-rolled state machine that tracks string
 * literals (' " `) so that a // or /* inside a string is preserved. It is
 * intentionally simple — pathological edge cases (e.g. // inside a regex
 * literal) could in principle truncate a line early, but the worst case is
 * a missed detection (false negative), never a false positive against an
 * actual non-comment occurrence.
 *
 * FALSE-POSITIVE ESCAPE HATCH
 * ---------------------------
 * If a genuine use case appears (e.g. a unit test that intentionally renders
 * the banned phrase to assert it's been removed), add the file's relative
 * path to ALLOWED_FILES below with an explanatory comment.
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

/**
 * Source trees to walk (relative to WORKSPACE_ROOT).
 *
 * The portal frontend is the original target (task #1436). Task #1467 extends
 * coverage to backend code that emits user-visible strings: the API server
 * (toasts, transactional emails, websocket status messages, OpenAPI error
 * descriptions) and shared `lib/*` packages used by both client and server.
 */
const SCAN_DIRS = [
  "artifacts/hospitality-business-portal/src",
  "artifacts/api-server/src",
  "lib/shared/src",
  "lib/db/src",
  "lib/domain/src",
  "lib/calc/src",
  "lib/engine/src",
  "lib/analytics/src",
  "lib/api-zod/src",
  "lib/api-client-react/src",
  "lib/api-spec/src",
];

/**
 * File extensions to scan.
 *
 * Code extensions (.ts/.tsx/.js/.jsx) were the original targets. Content
 * extensions (.md/.mdx/.json/.mjml/.html) were added in task #1528 so that
 * seed files, email templates, and locale JSON blobs are also guarded.
 * All content files within SCAN_DIRS are checked; documentation and agent
 * definition trees outside those dirs are never walked.
 */
const SCAN_EXTS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".md",
  ".mdx",
  ".json",
  ".mjml",
  ".html",
]);

/** Directories to skip during tree walk. */
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".cache",
  ".claude",
  "dist",
  "build",
  ".local",
  "vendor",
  "attached_assets",
  "screenshots",
  "tmp",
  "__generated__",
  "generated",
]);

/**
 * Path-substring patterns that mark files as containing internal-only content
 * — LLM system prompts, RAG knowledge-base seeds, agent persona definitions —
 * which legitimately reference "The Analyst is …" in declarative/descriptive
 * (not status) prose. Matched against the POSIX-style relative path.
 *
 * Anything matched here is excluded from the scan entirely. The intent of the
 * casual-register rule is user-visible STATUS copy ("Looking at your
 * property…"), not LLM prompt scaffolding or knowledge-base content that
 * defines what the Analyst IS.
 *
 * SEED FILE POLICY (task #1527)
 * ─────────────────────────────
 * Seed files fall into two categories:
 *
 *   Persona / prompt seeds — define what the Analyst IS in LLM system
 *     prompts, RAG knowledge-base entries, or agent-persona constants.
 *     These legitimately use "The Analyst is …" in declarative prose and
 *     are exempt from the scan. Covered by the per-file patterns below
 *     (`/\/knowledge-base[a-z-]*\.ts$/`, `/-prompt(s|-[a-z-]+)?\.ts$/`,
 *     `/\/agent-personas\.ts$/`).
 *
 *   Content seeds — seed user-visible UI strings such as toast copy,
 *     onboarding messages, help text, and display labels into the database.
 *     These MUST be scanned because the casual-register rule applies to every
 *     string that surfaces in the UI, regardless of whether it arrives via
 *     a hard-coded literal or a DB-seeded value.
 *
 * The former blanket `/\/seeds?\/` exclusion has been removed so that content
 * seeds are checked. Only the specific persona/prompt seed patterns below
 * remain exempt.
 */
const SKIP_PATH_PATTERNS: RegExp[] = [
  /\/prompts?\//, // any prompts/ directory
  /-prompt(s|-[a-z-]+)?\.ts$/, // *-prompt.ts, *-prompts.ts, *-prompt-engineer.ts
  /\/agent-personas\.ts$/, // persona description constants
  /\/knowledge-base[a-z-]*\.ts$/, // knowledge-base persona/RAG seed files
  /\.test\.ts$/, // unit tests routinely reference banned strings to assert removal
  /\.test\.tsx$/,
  /\.spec\.ts$/,
  /\.spec\.tsx$/,
];

/**
 * Path-substring patterns that mark CONTENT files (.md, .mdx, .mjml, .html,
 * .json) as internal-only — developer documentation, runbooks, migration
 * notes, tooling config — that are never rendered to end users.
 *
 * Matched against the POSIX-style relative path. Files matching any pattern
 * are excluded from the content scan entirely.
 */
const SKIP_PATH_PATTERNS_CONTENT: RegExp[] = [
  // Internal developer docs
  /\/docs\//,                           // any docs/ subtree
  /(^|\/)README(\.[a-z]+)?$/i,          // README, README.md, README.mdx …
  /(^|\/)CHANGELOG(\.[a-z]+)?$/i,       // changelogs
  /(^|\/)CONTRIBUTING(\.[a-z]+)?$/i,
  // Agent / skill definitions — describe what the Analyst IS, not status copy
  /\/\.agents\//,
  /\/skills?\//,
  // Internal run-history and health logs (not user-rendered)
  /\/iris\//,
  /\/costantino\//,
  // Migration artefacts
  /\/migrations?\//,
  // LLM prompt and seed content (same exemption as code files)
  /\/prompts?\//,
  /\/seeds?\//,
  /\/knowledge-base/,
  /\/agent-personas/,
  // Tooling / config JSON that is never user-visible content
  /\/tsconfig[^/]*\.json$/,
  /\/package\.json$/,
  /\/pnpm-lock\.yaml$/,
  /\/components\.json$/,
  /\/_journal\.json$/,
  /\/\d+_snapshot\.json$/,
  /\/migration-guards\.json$/,
  /\/llm-pricing\.json$/,
  /\/seed-users\.json$/,
  /\/\.replit-artifact\//,
];

/**
 * Per-line skip predicates for CODE files. These run AFTER comment stripping
 * but BEFORE the banned-phrase regex. A line is excluded from scanning if any
 * predicate returns true.
 *
 * The intent is to avoid flooding with false positives from backend-only
 * logging / tracing — `req.log.info("The Analyst is starting refresh")` is an
 * internal observability signal, not user-visible copy.
 */
const SKIP_LINE_PATTERNS: RegExp[] = [
  /\breq\.log\.(trace|debug|info|warn|error|fatal)\b/,
  /\b(logger|log)\.(trace|debug|info|warn|error|fatal)\b/,
  /\bconsole\.(log|info|warn|error|debug|trace)\b/,
];

/**
 * Files (relative to WORKSPACE_ROOT) that are permanently allowed to contain
 * the banned phrase. Add with an explanatory comment when genuinely necessary.
 */
const ALLOWED_FILES: string[] = [
  // none currently
];

// ---------------------------------------------------------------------------
// Pattern
// ---------------------------------------------------------------------------

/**
 * Matches the formal "The Analyst is <verb>" construction. Requires:
 *   - The word "The"           (rules out e.g. aria-label="Analyst is running")
 *   - A single space then "Analyst is "
 *   - At least one lowercase letter as the start of the verb (rules out
 *     identifiers like TheAnalystIsRunning where no space follows)
 *   - Case-insensitive so "the analyst is …" inside a string is also caught
 */
const BANNED_RE = /\bThe Analyst is [a-z][\w-]*/i;

// ---------------------------------------------------------------------------
// Comment stripper
// ---------------------------------------------------------------------------

/**
 * Replace every comment in `source` with whitespace of the same shape (so
 * line and column numbers are preserved for the caller). Tracks string
 * literals (' " `) so that a // or /* inside a string is left intact.
 */
function stripComments(source: string): string {
  let out = "";
  let inBlock = false;
  let inStr: '"' | "'" | "`" | null = null;

  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    const next = source[i + 1];

    if (inBlock) {
      if (c === "*" && next === "/") {
        inBlock = false;
        out += "  ";
        i++;
      } else {
        out += c === "\n" ? "\n" : " ";
      }
      continue;
    }

    if (inStr) {
      if (c === "\\" && next !== undefined) {
        out += c + next;
        i++;
        continue;
      }
      if (c === inStr) inStr = null;
      out += c;
      continue;
    }

    if (c === "/" && next === "*") {
      inBlock = true;
      out += "  ";
      i++;
      continue;
    }
    if (c === "/" && next === "/") {
      while (i < source.length && source[i] !== "\n") i++;
      // Re-emit the newline (or end of file).
      if (source[i] === "\n") out += "\n";
      continue;
    }

    if (c === '"' || c === "'" || c === "`") {
      inStr = c;
      out += c;
      continue;
    }

    out += c;
  }

  return out;
}

// ---------------------------------------------------------------------------
// Tree walker
// ---------------------------------------------------------------------------

function* walkFiles(dir: string): Generator<string> {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        yield* walkFiles(path.join(dir, entry.name));
      }
    } else if (entry.isFile() && SCAN_EXTS.has(path.extname(entry.name))) {
      yield path.join(dir, entry.name);
    }
  }
}

function isAllowed(absolutePath: string): boolean {
  const rel = path.relative(WORKSPACE_ROOT, absolutePath).replace(/\\/g, "/");
  return ALLOWED_FILES.includes(rel);
}

function isPathSkipped(absolutePath: string): boolean {
  const rel = path.relative(WORKSPACE_ROOT, absolutePath).replace(/\\/g, "/");
  return SKIP_PATH_PATTERNS.some((re) => re.test(rel));
}

function isLineSkipped(line: string): boolean {
  return SKIP_LINE_PATTERNS.some((re) => re.test(line));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const CACHE_NAME = "analyst-copy";

export function collectInputFiles(): string[] {
  const files: string[] = [
    fileURLToPath(import.meta.url),
    path.join(WORKSPACE_ROOT, "pnpm-lock.yaml"),
  ];
  for (const scanDir of SCAN_DIRS) {
    const absDir = path.join(WORKSPACE_ROOT, scanDir);
    if (!fs.existsSync(absDir)) continue;
    for (const absPath of walkFiles(absDir)) {
      if (isPathSkipped(absPath)) continue;
      files.push(absPath);
    }
  }
  return files;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cacheInputFiles = collectInputFiles();
  const cacheHash = computeInputsHash({ files: cacheInputFiles });
  if (tryCacheHit(CACHE_NAME, cacheHash)) process.exit(0);

  let violations = 0;

  for (const scanDir of SCAN_DIRS) {
    const absDir = path.join(WORKSPACE_ROOT, scanDir);
    if (!fs.existsSync(absDir)) continue;

    for (const absPath of walkFiles(absDir)) {
      if (isAllowed(absPath)) continue;
      if (isPathSkipped(absPath)) continue;

      const rel = path.relative(WORKSPACE_ROOT, absPath).replace(/\\/g, "/");
      const source = fs.readFileSync(absPath, "utf8");
      const stripped = stripComments(source);
      const strippedLines = stripped.split("\n");
      const originalLines = source.split("\n");

      for (let i = 0; i < strippedLines.length; i++) {
        if (isLineSkipped(strippedLines[i])) continue;
        if (BANNED_RE.test(strippedLines[i])) {
          const shown = (originalLines[i] ?? strippedLines[i]).trim();
          console.error(`VIOLATION  ${rel}:${i + 1}  ${shown}`);
          violations++;
        }
      }
    }
  }

  if (violations === 0) {
    console.log(
      "check:analyst-copy  PASS — no banned 'The Analyst is [verb]' copy",
    );
    writeCacheHit(CACHE_NAME, cacheHash);
    process.exit(0);
  } else {
    console.error(
      `\ncheck:analyst-copy  FAIL — ${violations} violation(s) found`,
    );
    console.error("");
    console.error(
      "Casual-register rule (tasks #1425, #1427): user-visible status copy",
    );
    console.error(
      "must NOT use the formal 'The Analyst is <verb>' construction.",
    );
    console.error("Use casual, action-oriented phrasing instead. Examples:");
    console.error('  Before: "The Analyst is studying your property"');
    console.error('  After:  "Looking at your property…"');
    console.error('  Before: "The Analyst is computing rates"');
    console.error('  After:  "Crunching the numbers…"');
    console.error("");
    console.error(
      "Comments (// and /* */) are excluded — only code and string content is",
    );
    console.error(
      "checked. To allow a specific file permanently, add it to ALLOWED_FILES",
    );
    console.error("in scripts/src/check-analyst-copy.ts with an explanatory comment.");
    process.exit(1);
  }
}
