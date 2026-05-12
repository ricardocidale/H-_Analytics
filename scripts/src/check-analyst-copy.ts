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
 * literals or JSX text) outside of comments, AND in content files (Markdown,
 * MDX, MJML email templates, HTML, and JSON i18n bundles) that surface to
 * end users.
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
 *   # The Analyst is reviewing data       (Markdown heading)
 *   { "status": "The Analyst is loading" } (JSON value)
 *
 * Examples that PASS (the casual register the audits established):
 *   "Looking at your property…"
 *   "Crunching the numbers…"
 *   "Cooling down" (without the "The Analyst is" preamble)
 *   aria-label="Analyst is running"   // no "The" → not a status sentence
 *
 * COMMENT EXCLUSION (code files only)
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
 * Content files (.md, .mdx, .mjml, .html, .json) are scanned directly with
 * no comment stripping — HTML comments (<!-- -->) and JSON's lack of comments
 * mean any occurrence of the banned phrase is considered user-visible content.
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
const CACHE_NAME = "analyst-copy";

/**
 * Source trees to walk (relative to WORKSPACE_ROOT).
 *
 * The portal frontend is the original target (task #1436). Task #1467 extends
 * coverage to backend code that emits user-visible strings: the API server
 * (toasts, transactional emails, websocket status messages, OpenAPI error
 * descriptions) and shared `lib/*` packages used by both client and server.
 * Task #1505 extends coverage further to content files (.md, .mdx, .mjml,
 * .html, .json) within the same source trees.
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

/** File extensions scanned as code (comment-stripping + line skip predicates apply). */
const CODE_SCAN_EXTS = new Set([".ts", ".tsx", ".js", ".jsx"]);

/**
 * File extensions scanned as content (no comment stripping, no
 * SKIP_LINE_PATTERNS — any occurrence is user-visible).
 *
 * .md / .mdx  — in-app help text and MDX docs rendered to users
 * .mjml        — transactional email templates compiled to HTML
 * .html        — raw HTML email or in-app templates
 * .json        — i18n bundles and other content JSON
 */
const CONTENT_SCAN_EXTS = new Set([".md", ".mdx", ".mjml", ".html", ".json"]);

/** Directories to skip during tree walk (applied to both code and content). */
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
 * Path-substring patterns that mark CODE files as containing internal-only
 * content — LLM system prompts, RAG knowledge-base seeds, agent persona
 * definitions — which legitimately reference "The Analyst is …" in
 * declarative/descriptive (not status) prose. Matched against the POSIX-style
 * relative path.
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
const SKIP_PATH_PATTERNS_CODE: RegExp[] = [
  /\/prompts?\//, // any prompts/ directory
  /-prompt(s|-[a-z-]+)?\.ts$/, // *-prompt.ts, *-prompts.ts, *-prompt-engineer.ts
  /\/agent-personas\.ts$/, // persona description constants
  /\/knowledge-base[a-z-]*\.ts$/, // knowledge-base seed/content files
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
 * NOT applied to content files — every line in a content file is assumed to
 * be potentially user-visible.
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
// Comment stripper (code files only)
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

function* walkFiles(dir: string, exts: Set<string>): Generator<string> {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        yield* walkFiles(path.join(dir, entry.name), exts);
      }
    } else if (entry.isFile() && exts.has(path.extname(entry.name))) {
      yield path.join(dir, entry.name);
    }
  }
}

function isAllowed(absolutePath: string): boolean {
  const rel = path.relative(WORKSPACE_ROOT, absolutePath).replace(/\\/g, "/");
  return ALLOWED_FILES.includes(rel);
}

function isCodePathSkipped(absolutePath: string): boolean {
  const rel = path.relative(WORKSPACE_ROOT, absolutePath).replace(/\\/g, "/");
  return SKIP_PATH_PATTERNS_CODE.some((re) => re.test(rel));
}

function isContentPathSkipped(absolutePath: string): boolean {
  const rel = path.relative(WORKSPACE_ROOT, absolutePath).replace(/\\/g, "/");
  return SKIP_PATH_PATTERNS_CONTENT.some((re) => re.test(rel));
}

function isLineSkipped(line: string): boolean {
  return SKIP_LINE_PATTERNS.some((re) => re.test(line));
}

// Per-file scanners
// ---------------------------------------------------------------------------

interface Violation {
  rel: string;
  lineNum: number;
  shown: string;
}

function scanCodeFile(absolutePath: string): Violation[] {
  const rel = path.relative(WORKSPACE_ROOT, absolutePath).replace(/\\/g, "/");
  const source = fs.readFileSync(absolutePath, "utf8");
  const stripped = stripComments(source);
  const strippedLines = stripped.split("\n");
  const originalLines = source.split("\n");
  const violations: Violation[] = [];

  for (let i = 0; i < strippedLines.length; i++) {
    if (isLineSkipped(strippedLines[i])) continue;
    if (BANNED_RE.test(strippedLines[i])) {
      violations.push({
        rel,
        lineNum: i + 1,
        shown: (originalLines[i] ?? strippedLines[i]).trim(),
      });
    }
  }

  return violations;
}

/**
 * Scan a content file (.md, .mdx, .mjml, .html, .json) line-by-line for the
 * banned phrase. No comment stripping is applied — any occurrence is treated
 * as potentially user-visible. SKIP_LINE_PATTERNS are NOT applied (those are
 * code-only logging exemptions).
 */
function scanContentFile(absolutePath: string): Violation[] {
  const rel = path.relative(WORKSPACE_ROOT, absolutePath).replace(/\\/g, "/");
  const source = fs.readFileSync(absolutePath, "utf8");
  const lines = source.split("\n");
  const violations: Violation[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (BANNED_RE.test(lines[i])) {
      violations.push({ rel, lineNum: i + 1, shown: lines[i].trim() });
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function collectInputFiles(): string[] {
  const files: string[] = [
    fileURLToPath(import.meta.url),
    path.join(WORKSPACE_ROOT, "pnpm-lock.yaml"),
  ];
  for (const scanDir of SCAN_DIRS) {
    const absDir = path.join(WORKSPACE_ROOT, scanDir);
    if (!fs.existsSync(absDir)) continue;
    for (const absPath of walkFiles(absDir, CODE_SCAN_EXTS)) {
      if (isCodePathSkipped(absPath)) continue;
      files.push(absPath);
    }
    for (const absPath of walkFiles(absDir, CONTENT_SCAN_EXTS)) {
      if (isContentPathSkipped(absPath)) continue;
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

    // --- Code files (.ts/.tsx/.js/.jsx) ---
    for (const absPath of walkFiles(absDir, CODE_SCAN_EXTS)) {
      if (isAllowed(absPath)) continue;
      if (isCodePathSkipped(absPath)) continue;

      for (const v of scanCodeFile(absPath)) {
        console.error(`VIOLATION  ${v.rel}:${v.lineNum}  ${v.shown}`);
        violations++;
      }
    }

    // --- Content files (.md/.mdx/.mjml/.html/.json) ---
    for (const absPath of walkFiles(absDir, CONTENT_SCAN_EXTS)) {
      if (isAllowed(absPath)) continue;
      if (isContentPathSkipped(absPath)) continue;

      for (const v of scanContentFile(absPath)) {
        console.error(`VIOLATION  ${v.rel}:${v.lineNum}  ${v.shown}`);
        violations++;
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
      "This rule applies to ALL user-facing content: TypeScript/TSX code,",
    );
    console.error(
      "Markdown/MDX help text, JSON i18n bundles, and email templates.",
    );
    console.error("");
    console.error(
      "Comments (// and /* */) in code files are excluded — only actual code",
    );
    console.error(
      "and string content is checked. To allow a specific file permanently,",
    );
    console.error("add it to ALLOWED_FILES in scripts/src/check-analyst-copy.ts");
    console.error("with an explanatory comment.");
    process.exit(1);
  }
}
