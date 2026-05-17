/**
 * check-ui-canonical.ts
 *
 * Zero-tolerance gate for two UI consistency rules in the H+ portal frontend:
 *
 * RULE A — Canonical "Analyst" CTA copy
 * --------------------------------------
 * Every Analyst call-to-action in the portal must read exactly "Analyst"
 * (or the canonical suffix variant "Analyst — <Tab>", or the running-state
 * "Studying…"). Variants like "Ask Analyst", "Ask The Analyst", or any
 * identifier shaped like onAskAnalyst / askTheAnalyst / askAnalyst are
 * forbidden — they recreate the surface area the canonical AnalystButton
 * and AnalystActionButton components exist to eliminate.
 *
 * Banned patterns:
 *   - Text:        /\bask\s+(the\s+)?analyst\b/i  inside any string/JSX text
 *   - Identifiers: onAskAnalyst, askAnalyst, askTheAnalyst, ASK_ANALYST_*
 *                  (case-sensitive; catches the "masking-literal" anti-pattern
 *                  from docs/solutions/tooling/magic-numbers-ratchet-improvements.md)
 *   - JSX prop:    <AnalystActionButton label="X"> where X != "Analyst"
 *                  Multi-line JSX buffering applied so multi-line callsites
 *                  are reached. (Most real callsites span >1 line — a strict
 *                  per-line regex would fire on zero of them.)
 *
 * Canonical replacements:
 *   import { AnalystButton } from "@/components/intelligence/AnalystButton"
 *   import { AnalystActionButton } from "@/components/analyst/AnalystActionButton"
 *
 * RULE B — Canonical horizontal tab strip
 * ----------------------------------------
 * Every horizontal menu in the portal must render through the canonical
 * <CurrentThemeTab> wrapper from @/components/ui/tabs. Direct imports of
 * TabsList or TabsTrigger from @/components/ui/tabs outside tabs.tsx
 * itself are forbidden. Hand-rolled <button> tab rows (button + activeTab
 * toggle styling) are flagged as a heuristic violation.
 *
 * TabsContent imports remain permitted — they wrap panel content, not the
 * strip itself.
 *
 * Source of truth:
 *   docs/solutions/conventions/currentthemetab-migration-convention-2026-05-16.md
 *
 * SKIPS
 * -----
 *   • test files (.test.ts(x), .spec.ts(x), __tests__/, /tests/)
 *   • node_modules, dist, build, .git, .cache, .claude, .local
 *   • mockup sandbox, api-server, attached_assets
 *
 * Cache: namespaced "ui-canonical" via scripts/src/lib/check-cache.ts.
 *
 * FALSE-POSITIVE ESCAPE HATCH
 * ---------------------------
 * If a genuine use case appears, add the file's relative path to ALLOWED_FILES
 * below with an explanatory comment naming the canonical it cites.
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
const CACHE_NAME = "ui-canonical";

const SCAN_DIRS = [
  "artifacts/hospitality-business-portal/src",
];

const CODE_SCAN_EXTS = new Set([".ts", ".tsx", ".js", ".jsx"]);

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
  "__tests__",
  "tests",
]);

const SKIP_PATH_PATTERNS: RegExp[] = [
  /\.test\.ts$/,
  /\.test\.tsx$/,
  /\.spec\.ts$/,
  /\.spec\.tsx$/,
  /\/tests\//,
];

const ALLOWED_FILES: string[] = [
  // none currently — every file should comply after cleanup unit.
];

const TABS_PRIMITIVE_SELF_PATH =
  "artifacts/hospitality-business-portal/src/components/ui/tabs.tsx";

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------

/** Rule A — banned text inside string literals or JSX text. Case-insensitive. */
const RULE_A_TEXT = /\bask\s+(the\s+)?analyst\b/i;

/**
 * Rule A — banned identifiers (case-sensitive).
 *   - onAskAnalyst    callback prop name
 *   - askAnalyst      function name
 *   - askTheAnalyst   function name
 *   - ASK_ANALYST_*   masking-literal constants (e.g. ASK_ANALYST_CTA)
 *   - button-ask-analyst  data-testid value
 */
const RULE_A_IDENT = /\b(onAskAnalyst|askAnalyst|askTheAnalyst|ASK_ANALYST_[A-Z_]+|button-ask-analyst[A-Za-z0-9_-]*)\b/;

/**
 * Rule A — banned <AnalystActionButton label="X"> JSX prop value where X is
 * not "Analyst". Multi-line buffer applied. The `label?` prop defaults to
 * "Analyst" so no-prop usage is fine.
 */
const ANALYST_ACTION_OPEN = /<AnalystActionButton\b/;
const LABEL_PROP_VALUE = /\blabel\s*=\s*"([^"]*)"/;

/**
 * Rule B — banned import of TabsList or TabsTrigger from @/components/ui/tabs.
 * TabsContent imports remain permitted.
 */
const RULE_B_IMPORT = /import\s*(?:type\s*)?\{[^}]*\b(?:TabsList|TabsTrigger)\b[^}]*\}\s*from\s*['"]@\/components\/ui\/tabs['"]/;

/**
 * Rule B — hand-rolled tab heuristic. Flags a <button> followed within 5 lines
 * by `activeTab === ` toggle styling. Catches files that bypass the wrapper
 * with a plain <button> row.
 */
const HAND_ROLLED_BUTTON = /<button\b/;
const ACTIVE_TAB_TOGGLE = /\bactiveTab\s*===\s*/;

// ---------------------------------------------------------------------------
// Comment stripper (shared shape with check-analyst-copy.ts)
// ---------------------------------------------------------------------------

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

function isPathSkipped(absolutePath: string): boolean {
  const rel = path.relative(WORKSPACE_ROOT, absolutePath).replace(/\\/g, "/");
  return SKIP_PATH_PATTERNS.some((re) => re.test(rel));
}

function isTabsPrimitiveSelf(absolutePath: string): boolean {
  const rel = path.relative(WORKSPACE_ROOT, absolutePath).replace(/\\/g, "/");
  return rel === TABS_PRIMITIVE_SELF_PATH;
}

// ---------------------------------------------------------------------------
// JSX label scanner (multi-line buffer)
// ---------------------------------------------------------------------------

/**
 * Walks `lines` and returns the (1-based) line numbers where
 * <AnalystActionButton ... label="X" ...> is found and X != "Analyst". The
 * JSX open is allowed to span multiple lines; the scanner buffers until the
 * matching `>` or `/>` closer. Comments must be stripped before calling.
 */
function scanAnalystActionLabels(
  lines: string[],
): { lineNum: number; label: string }[] {
  const hits: { lineNum: number; label: string }[] = [];
  let buffering: { startLine: number; buf: string } | null = null;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    if (!buffering) {
      const m = ANALYST_ACTION_OPEN.exec(line);
      if (!m) continue;
      buffering = { startLine: i + 1, buf: line.slice(m.index) };
      line = "";
    } else {
      buffering.buf += "\n" + line;
    }

    // Find the closing > or />, respecting that quoted strings may contain >
    const closeIdx = findJsxClose(buffering.buf);
    if (closeIdx === -1) continue;

    const fragment = buffering.buf.slice(0, closeIdx + 1);
    const labelMatch = LABEL_PROP_VALUE.exec(fragment);
    if (labelMatch && labelMatch[1] !== "Analyst") {
      hits.push({ lineNum: buffering.startLine, label: labelMatch[1] });
    }
    buffering = null;
  }
  return hits;
}

/**
 * Finds the index of the first `>` or `/>` in `buf` that closes the JSX open
 * tag, ignoring (a) `>` chars inside double-quoted strings and (b) `>` chars
 * inside JSX expression containers `{ ... }` (which catches arrow-function
 * `=>` tokens and `x > 5` comparisons inside prop expressions). Returns the
 * index of the closing `>` itself, or -1 if not found.
 */
function findJsxClose(buf: string): number {
  let inStr = false;
  let braceDepth = 0;
  // Skip the initial `<TagName` so `<` doesn't get treated as the bracket-open
  // of something else; depth tracking only applies to `{` / `}` JSX containers.
  for (let i = 0; i < buf.length; i++) {
    const c = buf[i];
    if (c === "\\") {
      i++;
      continue;
    }
    if (c === '"') {
      inStr = !inStr;
      continue;
    }
    if (inStr) continue;
    if (c === "{") {
      braceDepth++;
      continue;
    }
    if (c === "}") {
      braceDepth--;
      continue;
    }
    if (braceDepth === 0 && c === ">") return i;
  }
  return -1;
}

// ---------------------------------------------------------------------------
// Per-file scanner
// ---------------------------------------------------------------------------

interface Violation {
  rel: string;
  lineNum: number;
  rule: "A" | "B";
  message: string;
  shown: string;
}

function scanFile(absolutePath: string): Violation[] {
  const rel = path.relative(WORKSPACE_ROOT, absolutePath).replace(/\\/g, "/");
  const source = fs.readFileSync(absolutePath, "utf8");
  const stripped = stripComments(source);
  const lines = stripped.split("\n");
  const originalLines = source.split("\n");
  const isSelf = isTabsPrimitiveSelf(absolutePath);
  const violations: Violation[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const original = (originalLines[i] ?? line).trim();

    if (RULE_A_TEXT.test(line)) {
      violations.push({
        rel,
        lineNum: i + 1,
        rule: "A",
        message:
          'Rule A: banned "Ask (the) Analyst" text. Use <AnalystButton> from @/components/intelligence/AnalystButton or <AnalystActionButton> from @/components/analyst/AnalystActionButton.',
        shown: original,
      });
    }

    if (RULE_A_IDENT.test(line)) {
      violations.push({
        rel,
        lineNum: i + 1,
        rule: "A",
        message:
          "Rule A: banned identifier (onAskAnalyst/askAnalyst/askTheAnalyst/ASK_ANALYST_*/button-ask-analyst-*). Rename to onAnalystClick/runAnalyst/button-analyst-*.",
        shown: original,
      });
    }

    if (!isSelf && RULE_B_IMPORT.test(line)) {
      violations.push({
        rel,
        lineNum: i + 1,
        rule: "B",
        message:
          'Rule B: banned import of TabsList/TabsTrigger from @/components/ui/tabs. Use <CurrentThemeTab> from the same module. TabsContent imports remain permitted.',
        shown: original,
      });
    }

    // Hand-rolled tab heuristic: <button> within 5 lines of activeTab === toggle.
    if (HAND_ROLLED_BUTTON.test(line)) {
      const windowEnd = Math.min(lines.length, i + 6);
      for (let j = i; j < windowEnd; j++) {
        if (ACTIVE_TAB_TOGGLE.test(lines[j])) {
          violations.push({
            rel,
            lineNum: i + 1,
            rule: "B",
            message:
              "Rule B: hand-rolled <button> tab row (activeTab === toggle styling). Replace with <CurrentThemeTab> from @/components/ui/tabs.",
            shown: original,
          });
          break;
        }
      }
    }
  }

  // Multi-line JSX label scan (Rule A — JSX prop).
  for (const hit of scanAnalystActionLabels(lines)) {
    violations.push({
      rel,
      lineNum: hit.lineNum,
      rule: "A",
      message: `Rule A: <AnalystActionButton label="${hit.label}"> must be "Analyst". Omit the prop to use the default, or canonicalize the label.`,
      shown: (originalLines[hit.lineNum - 1] ?? "").trim(),
    });
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

  let violationsCount = 0;

  for (const scanDir of SCAN_DIRS) {
    const absDir = path.join(WORKSPACE_ROOT, scanDir);
    if (!fs.existsSync(absDir)) continue;

    for (const absPath of walkFiles(absDir, CODE_SCAN_EXTS)) {
      if (isAllowed(absPath)) continue;
      if (isPathSkipped(absPath)) continue;

      for (const v of scanFile(absPath)) {
        console.error(`VIOLATION  ${v.rel}:${v.lineNum}  ${v.message}`);
        console.error(`           ${v.shown}`);
        violationsCount++;
      }
    }
  }

  if (violationsCount === 0) {
    console.log(
      "check:ui-canonical  PASS — no Rule A (Analyst CTA) or Rule B (canonical tabs) violations",
    );
    writeCacheHit(CACHE_NAME, cacheHash);
    process.exit(0);
  } else {
    console.error(
      `\ncheck:ui-canonical  FAIL — ${violationsCount} violation(s) found`,
    );
    console.error("");
    console.error("Two UI consistency rules (CLAUDE.md §13):");
    console.error("  Rule A — canonical \"Analyst\" CTA text + identifiers.");
    console.error("           Use <AnalystButton> (@/components/intelligence/AnalystButton)");
    console.error("           or <AnalystActionButton> (@/components/analyst/AnalystActionButton).");
    console.error("  Rule B — canonical horizontal tabs.");
    console.error("           Use <CurrentThemeTab> from @/components/ui/tabs.");
    console.error("");
    console.error("Skill: .agents/skills/analyst-research-buttons/SKILL.md (Rule A)");
    console.error("Skill: .agents/skills/ui-page-patterns/SKILL.md (Rule B)");
    console.error("Convention: docs/solutions/conventions/currentthemetab-migration-convention-2026-05-16.md");
    process.exit(1);
  }
}
