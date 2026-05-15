/**
 * check-flex-label-overflow.ts
 *
 * Ratchet guard for the flex label/value overflow discipline:
 *
 *   <div className="flex justify-between items-center">
 *     <LabelSide className="... min-w-0 ...">…</LabelSide>   ← MUST have min-w-0
 *     <ValueSide className="... shrink-0 ...">…</ValueSide>  ← MUST have shrink-0
 *   </div>
 *
 * Without `min-w-0` the label side cannot truncate — it pushes the value off
 * the right edge on narrow viewports. Without `shrink-0` the value shrinks
 * instead of the label, which is the wrong overflow behaviour.
 *
 * DETECTION STRATEGY
 * ------------------
 * JSX cannot be parsed perfectly without an AST, so this script uses an
 * indentation-based heuristic:
 *
 *   1. Find every source line containing `flex justify-between items-center`.
 *   2. Determine the div's indentation level (leading-space count).
 *   3. Scan forward: the FIRST non-empty line at a strictly deeper indentation
 *      becomes the "child indentation level".
 *   4. Track JSX open/close tags at the child indentation level to identify
 *      the boundary between the first and second direct children.
 *   5. Collect the opening-tag text of each direct child (from `<Tag` to its
 *      closing `>` or `/>`, spanning multiple lines if necessary).
 *   6. Check the collected text for `min-w-0` (first child) and `shrink-0`
 *      (second child).
 *
 * RATCHET MODE (default) — SET-DIFF GATE
 * ----------------------------------------
 * The baseline JSON (`_flex-label-overflow-baseline.json`) stores an ARRAY OF
 * VIOLATION SIGNATURES, not just a count.  Each signature encodes:
 *
 *   <relative-file>:<line>:<sorted-missing-classes>
 *   e.g.  src/components/company/Foo.tsx:149:min-w-0:shrink-0
 *
 * On each run the live signatures are compared to the baseline SET:
 *   • Any live signature NOT in the baseline set → FAIL (new violation).
 *   • All live signatures in the baseline → PASS (even if total count dropped).
 *
 * This is strictly stronger than a count-only ratchet: a "replacement
 * regression" (fix row A, introduce row B — net count stays the same) is
 * always caught because B's signature is unknown to the baseline.
 *
 * MAINTAINER NOTE — line-number churn
 * When lines are added or removed above a grandfathered violation, its line
 * number shifts and the old signature no longer matches → the check flags it
 * as a "new violation".  This is expected behaviour: run `--init` to update
 * the baseline after any such refactor that does NOT introduce real new
 * violations.  The churn is intentional — it keeps the baseline tight.
 *
 * MODES
 *   (default)  Set-diff ratchet: any live signature absent from the baseline
 *              fails the check. Exit 1 on regression.
 *   --init     Write the current violation signatures as the new baseline.
 *              Run after fixing a batch of rows or after innocuous line shifts.
 *   --show     Print all current violations without checking or writing baseline.
 *   --strict   Fail on ANY violation (zero-tolerance). Use once the codebase
 *              is fully compliant.
 *
 * ALLOW LIST
 * ----------
 * Add a file's path (relative to WORKSPACE_ROOT) to ALLOWED_FILES to
 * permanently exempt it from the check, with an explanatory comment.
 *
 * KNOWN LIMITATIONS
 * -----------------
 * 1. Self-closing divs:  `<div ... />` cannot have children; skipped correctly.
 * 2. Inline divs:  when the div and its children are on ONE line, the child
 *    cannot be split at indentation boundaries. These rows are skipped with a
 *    note if the child text is found within the same line.
 * 3. Dynamic className:  `cn("flex justify-between items-center", ...)` forms
 *    where the flex classes appear in a cn() call are NOT detected because the
 *    search targets the className string literal directly.
 * 4. JSX expressions as children:  `{condition && <Label>}` where the tag does
 *    not start at the expected indentation may be missed.
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

const BASELINE_PATH = path.resolve(__dirname, "_flex-label-overflow-baseline.json");

/** Source trees to scan (relative to WORKSPACE_ROOT). */
const SCAN_DIRS = [
  "artifacts/hospitality-business-portal/src",
];

/** Directories to skip during the tree walk. */
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
]);

/**
 * Files (relative to WORKSPACE_ROOT) permanently exempt from the check.
 * Add with a comment explaining the exception when genuinely necessary.
 */
const ALLOWED_FILES: string[] = [
  // none currently
];

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
    } else if (entry.isFile() && entry.name.endsWith(".tsx")) {
      yield path.join(dir, entry.name);
    }
  }
}

// ---------------------------------------------------------------------------
// Allow-list helpers
// ---------------------------------------------------------------------------

function isAllowed(absolutePath: string): boolean {
  const rel = path.relative(WORKSPACE_ROOT, absolutePath).replace(/\\/g, "/");
  return ALLOWED_FILES.includes(rel);
}

// ---------------------------------------------------------------------------
// JSX child detection helpers
// ---------------------------------------------------------------------------

/** Count leading spaces (or tabs as 1 each) on a source line. */
function leadingSpaces(line: string): number {
  let count = 0;
  for (const ch of line) {
    if (ch === " ") count++;
    else if (ch === "\t") count++;
    else break;
  }
  return count;
}

/**
 * Decide whether a trimmed line looks like a JSX OPENING tag start.
 * Accepts `<Tag`, `<tag`, but NOT `</Tag` or `{...`.
 */
function isOpeningTagStart(trimmed: string): boolean {
  return /^<[A-Za-z]/.test(trimmed) && !trimmed.startsWith("</");
}

/**
 * Decide whether a trimmed line looks like a JSX CLOSING tag.
 * `</Tag>` or just `</Tag`.
 */
function isClosingTag(trimmed: string): boolean {
  return trimmed.startsWith("</");
}

/**
 * Return true when the collected opening-tag text (potentially spanning
 * multiple lines) is complete — i.e. the tag's props section has been closed
 * by `/>` (self-closing) or a bare `>` that ends the opening.
 *
 * We treat BOTH `/>` and `>` (not inside a nested JSX expression) as closing
 * the tag for the purpose of bounding the className search window.
 *
 * Heuristic: if the text so far contains `/>` or ends with `>` on a line that
 * has more leading spaces than the CHILD level (deeper nesting means we may be
 * collecting nested JSX), we stay open. We stop as soon as a line at or
 * shallower than childIndent contains `>` at the END or contains `/>`.
 */
function isOpeningTagComplete(collectedLines: string[]): boolean {
  for (const line of collectedLines) {
    if (/\/>/.test(line)) return true; // self-closing anywhere in collected text
  }
  const last = collectedLines[collectedLines.length - 1];
  // A line that ends with `>` (not `=>`, not `>=`) closes the opening tag.
  // We use a trimmed-end check to ignore trailing whitespace.
  if (/(?<![=!<])>[\s]*$/.test(last)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Violation type
// ---------------------------------------------------------------------------

interface Violation {
  file: string;       // relative path
  line: number;       // 1-based line number of the flex div
  missingMinW0: boolean;
  missingShrink0: boolean;
}

// ---------------------------------------------------------------------------
// Flex-row pattern matching
// ---------------------------------------------------------------------------

/**
 * Return true when the string contains all three class tokens that define the
 * label/value flex-row pattern, regardless of order within the className.
 *
 * Handles all common orderings:
 *   "flex justify-between items-center"
 *   "flex items-center justify-between"
 *   "flex justify-between items-center gap-2"   (extra classes allowed)
 *   etc.
 */
function hasFlexRowClasses(text: string): boolean {
  return (
    /\bflex\b/.test(text) &&
    /\bjustify-between\b/.test(text) &&
    /\bitems-center\b/.test(text)
  );
}

/**
 * Given a line index that starts a `<div` tag, collect the text of the
 * opening tag (the full span from `<div` to the closing `>`).
 * Stops at the first `>` not preceded by `=` or inside a string, or after
 * MAX_TAG_LINES lines (whichever comes first).
 *
 * Returns the concatenated text of the opening tag.
 */
const MAX_TAG_LINES = 8;

function collectDivOpenTag(lines: string[], startIdx: number): string {
  const parts: string[] = [];
  for (let k = startIdx; k < Math.min(lines.length, startIdx + MAX_TAG_LINES); k++) {
    parts.push(lines[k]);
    // Stop once the tag is closed. We use a simple heuristic: if the
    // accumulated text contains `>` (not `=>`, not `>=`), the opening tag
    // is complete. This may be fooled by `>` inside attribute string values,
    // but that is rare in JSX and acceptable for a heuristic check.
    const joined = parts.join(" ");
    if (/(?<![=!<])>/.test(joined)) break;
  }
  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Core detector
// ---------------------------------------------------------------------------

/**
 * Scan one TSX file and return any label-overflow violations found.
 */
function detectViolations(absPath: string): Violation[] {
  const rel = path.relative(WORKSPACE_ROOT, absPath).replace(/\\/g, "/");
  const content = fs.readFileSync(absPath, "utf8");
  const lines = content.split("\n");
  const violations: Violation[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trimStart();

    // Gate: look only at lines that START a <div opening tag.
    if (!trimmedLine.startsWith("<div")) continue;

    // Collect the full opening-tag text (may span multiple lines).
    const openTagText = collectDivOpenTag(lines, i);

    // Check if the opening tag contains all three flex-row class tokens.
    if (!hasFlexRowClasses(openTagText)) continue;

    // Determine how many lines the opening tag spans so we can start the
    // child-scan from AFTER the `>` that closes the opening tag.
    let tagEndLine = i;
    {
      let acc = "";
      for (let k = i; k < Math.min(lines.length, i + MAX_TAG_LINES); k++) {
        acc += " " + lines[k];
        if (/(?<![=!<])>/.test(acc)) {
          tagEndLine = k;
          break;
        }
      }
    }

    // Skip single-line divs that also have their children on the same line
    // (cannot split children reliably).
    if (tagEndLine === i && openTagText.includes("</div>")) continue;

    const divIndent = leadingSpaces(line);

    // Determine child indentation from the first non-empty line AFTER the
    // opening tag closes (tagEndLine + 1 handles multiline div tags).
    const childScanStart = tagEndLine + 1;
    let childIndent: number | null = null;
    for (let j = childScanStart; j < Math.min(lines.length, childScanStart + 5); j++) {
      if (lines[j].trim() === "") continue;
      const ci = leadingSpaces(lines[j]);
      if (ci > divIndent) {
        childIndent = ci;
        break;
      }
    }
    if (childIndent === null) continue; // div appears to be childless

    // ---- State machine: collect first and second direct children ------------
    //
    // Strategy: scan forward through lines[childScanStart ..]. For each line:
    //   • If indent <= divIndent and line is non-empty → closing div reached, stop.
    //   • If indent === childIndent and the trimmed line starts a new opening tag
    //     (not a closing tag) → we are at the START of a new direct child.
    //   • While building a child's opening-tag text, keep appending lines until
    //     `isOpeningTagComplete` signals we have enough to check className.
    //   • Track JSX depth at the childIndent level to know when a child closes:
    //     – open tag at childIndent → depth++
    //     – close tag at childIndent → depth--; when depth hits 0 the child ended.
    //   • Self-closing tags (`/>`) immediately close at depth 0.

    const childrenOpeningText: string[][] = []; // opening-tag lines per child
    let currentChildLines: string[] | null = null;
    let depth = 0;

    for (let j = childScanStart; j < Math.min(lines.length, childScanStart + 120); j++) {
      const ln = lines[j];
      const trimmed = ln.trim();

      if (trimmed === "") continue;

      const indent = leadingSpaces(ln);

      // Back at div level or above → closing div, stop.
      if (indent <= divIndent) break;

      if (indent === childIndent) {
        if (isOpeningTagStart(trimmed)) {
          if (depth === 0) {
            // Starting a brand-new direct child.
            if (currentChildLines !== null) {
              // Shouldn't normally happen (means previous child was never closed),
              // but save what we have.
              childrenOpeningText.push(currentChildLines);
            }
            currentChildLines = [ln];
            depth = 1;

            // Check for self-closing on the same line.
            if (/\/>/.test(trimmed) || /(?<![=!<])>[\s]*$/.test(trimmed)) {
              childrenOpeningText.push(currentChildLines);
              currentChildLines = null;
              depth = 0;
            }
          }
          // depth > 0 means we're inside a child — these are nested open tags
          // that happen to be at child indent (indentation may not be strict).
        } else if (isClosingTag(trimmed)) {
          if (depth > 0) {
            depth--;
            if (depth === 0 && currentChildLines !== null) {
              childrenOpeningText.push(currentChildLines);
              currentChildLines = null;
            }
          }
        }
      } else if (indent > childIndent && currentChildLines !== null && depth === 1) {
        // Deeper line — part of the current child's opening-tag props or body.
        // Only accumulate while we're still building the opening tag.
        if (!isOpeningTagComplete(currentChildLines)) {
          currentChildLines.push(ln);
        }
        // Check if this deeper line CLOSES the child's opening tag.
        // This handles the common multiline self-closing pattern:
        //   <Component          ← at childIndent, depth becomes 1
        //     prop={x}          ← at deeper indent, accumulated above
        //   />                  ← at deeper indent, self-closes here
        const isSelfClose = /\/>/.test(trimmed);
        const isOpenClose = /(?<![=!<])>[\s]*$/.test(trimmed);
        if (isSelfClose) {
          // Self-closing tag completes the child immediately.
          childrenOpeningText.push(currentChildLines);
          currentChildLines = null;
          depth = 0;
        } else if (isOpenClose && !isOpeningTagStart(trimmed)) {
          // The opening tag closed (trailing `>`), but the child has a body;
          // leave depth=1 so the closing-tag path finalizes it when we see
          // the explicit `</Tag>` at childIndent later.
        }
      }

      // Early exit: we only care about the first two children.
      if (childrenOpeningText.length >= 2) break;
    }

    if (childrenOpeningText.length < 2) {
      // Can't determine both children — skip this row.
      continue;
    }

    const firstChildText = childrenOpeningText[0].join(" ");
    const secondChildText = childrenOpeningText[1].join(" ");

    const missingMinW0 = !firstChildText.includes("min-w-0");
    const missingShrink0 = !secondChildText.includes("shrink-0");

    if (missingMinW0 || missingShrink0) {
      violations.push({ file: rel, line: i + 1, missingMinW0, missingShrink0 });
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Input file collection (for cache key)
// ---------------------------------------------------------------------------

export function collectInputFiles(): string[] {
  const files: string[] = [
    fileURLToPath(import.meta.url),
    BASELINE_PATH,
  ];
  for (const scanDir of SCAN_DIRS) {
    const absDir = path.join(WORKSPACE_ROOT, scanDir);
    if (!fs.existsSync(absDir)) continue;
    for (const absPath of walkFiles(absDir)) {
      files.push(absPath);
    }
  }
  return files;
}

// ---------------------------------------------------------------------------
// Violation signature helpers
// ---------------------------------------------------------------------------

/**
 * Compute a stable string signature for a violation that can be stored in the
 * baseline and compared across runs.
 *
 * Format: `<relative-file>:<line>:<issues>`
 * where <issues> is a sorted, colon-separated list of missing-class tokens.
 *
 * Example: `artifacts/.../CapitalStructureSection.tsx:149:min-w-0:shrink-0`
 *
 * Using file+line (not just file) means that two violations on different lines
 * of the same file are tracked independently. This is the right granularity:
 * fixing one row doesn't forgive a newly introduced row even if the file is
 * the same.
 */
function violationSignature(v: Violation): string {
  const issues: string[] = [];
  if (v.missingMinW0) issues.push("min-w-0");
  if (v.missingShrink0) issues.push("shrink-0");
  return `${v.file}:${v.line}:${issues.sort().join(":")}`;
}

// ---------------------------------------------------------------------------
// Baseline I/O
// ---------------------------------------------------------------------------

/**
 * Baseline stores the EXACT SET of known-grandfathered violation signatures.
 * A new violation is detected when its signature does NOT appear in this set.
 * Count regressions are also flagged for visibility, but the gate is set-based.
 */
interface Baseline {
  /** ISO timestamp of when this baseline was written. */
  updatedAt: string;
  /**
   * Sorted array of violation signatures that are currently allowed.
   * Any live signature not in this list is a NEW violation → FAIL.
   */
  signatures: string[];
}

function readBaseline(): Baseline | null {
  try {
    return JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8")) as Baseline;
  } catch {
    return null;
  }
}

function writeBaseline(violations: Violation[]): void {
  const signatures = violations.map(violationSignature).sort();
  const baseline: Baseline = {
    updatedAt: new Date().toISOString(),
    signatures,
  };
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + "\n", "utf8");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const CACHE_NAME = "flex-label-overflow";

const args = process.argv.slice(2);
const isInit = args.includes("--init");
const isShow = args.includes("--show");
const isStrict = args.includes("--strict");

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // Input-hash cache: skip the scan if nothing has changed since a clean run.
  // Only applies in default (ratchet) mode — --init, --show, and --strict always
  // perform a fresh scan to give accurate output.
  if (!isInit && !isShow && !isStrict) {
    const cacheFiles = collectInputFiles();
    const cacheHash = computeInputsHash({ files: cacheFiles });
    if (tryCacheHit(CACHE_NAME, cacheHash)) process.exit(0);
  }

  // ---- Scan ----------------------------------------------------------------
  const allViolations: Violation[] = [];

  for (const scanDir of SCAN_DIRS) {
    const absDir = path.join(WORKSPACE_ROOT, scanDir);
    if (!fs.existsSync(absDir)) continue;
    for (const absPath of walkFiles(absDir)) {
      if (isAllowed(absPath)) continue;
      const violations = detectViolations(absPath);
      allViolations.push(...violations);
    }
  }

  const liveCount = allViolations.length;

  // ---- --show mode ---------------------------------------------------------
  if (isShow) {
    if (liveCount === 0) {
      console.log("check:flex-label-overflow  No violations found — codebase is fully compliant.");
    } else {
      console.log(`check:flex-label-overflow  ${liveCount} violation(s) found:\n`);
      for (const v of allViolations) {
        const issues: string[] = [];
        if (v.missingMinW0) issues.push("first child missing min-w-0");
        if (v.missingShrink0) issues.push("second child missing shrink-0");
        console.log(`  ${v.file}:${v.line}  [${issues.join(", ")}]`);
      }
    }
    process.exit(0);
  }

  // ---- --init mode ---------------------------------------------------------
  if (isInit) {
    writeBaseline(allViolations);
    const count = allViolations.length;
    console.log(
      `check:flex-label-overflow  Baseline written: ${count} violation signature(s) recorded.`
    );
    console.log(`  File: scripts/src/_flex-label-overflow-baseline.json`);
    process.exit(0);
  }

  // ---- --strict mode -------------------------------------------------------
  if (isStrict) {
    if (liveCount === 0) {
      console.log("check:flex-label-overflow  PASS (strict) — zero violations.");
      process.exit(0);
    } else {
      console.error(`\ncheck:flex-label-overflow  FAIL (strict) — ${liveCount} violation(s):\n`);
      for (const v of allViolations) {
        const issues: string[] = [];
        if (v.missingMinW0) issues.push("first child missing min-w-0");
        if (v.missingShrink0) issues.push("second child missing shrink-0");
        console.error(`  ${v.file}:${v.line}  [${issues.join(", ")}]`);
      }
      printFixHint();
      process.exit(1);
    }
  }

  // ---- Default: set-diff ratchet mode ---------------------------------------
  //
  // The gate checks that every LIVE violation signature appears in the
  // BASELINE set. A signature not present in the baseline means a NEW row was
  // introduced (or an existing row's issues changed) → FAIL.
  //
  // If a baseline row disappears (the violation was fixed), that is allowed —
  // fixing rows is always welcome. Run --init afterward to tighten the baseline
  // so the now-fixed row cannot be reintroduced by a later PR.
  //
  // This is strictly stronger than a count-only ratchet: it blocks replacement
  // regressions (fix row A at line 10, add row B at line 11 — net count stays
  // the same but the new row has an unknown signature → FAIL).

  const baseline = readBaseline();

  if (baseline === null) {
    console.error("check:flex-label-overflow  ERROR — no baseline file found.");
    console.error(
      "  Run `pnpm --filter @workspace/scripts run check:flex-label-overflow:init` to create it."
    );
    process.exit(1);
  }

  const baselineSet = new Set(baseline.signatures);
  const newViolations = allViolations.filter(
    (v) => !baselineSet.has(violationSignature(v))
  );
  const fixedCount = baseline.signatures.filter(
    (sig) => !allViolations.some((v) => violationSignature(v) === sig)
  ).length;

  if (newViolations.length > 0) {
    console.error(
      `\ncheck:flex-label-overflow  FAIL — ${newViolations.length} new violation(s) not in baseline:\n`
    );
    for (const v of newViolations) {
      const issues: string[] = [];
      if (v.missingMinW0) issues.push("first child missing min-w-0");
      if (v.missingShrink0) issues.push("second child missing shrink-0");
      console.error(`  ${v.file}:${v.line}  [${issues.join(", ")}]`);
    }
    if (fixedCount > 0) {
      console.error(
        `\n  (${fixedCount} baseline violation(s) were fixed in this change — well done, but the new violations above must be removed too.)`
      );
    }
    printFixHint();
    process.exit(1);
  }

  // All live violations are in the baseline — no new rows introduced.
  if (fixedCount > 0) {
    console.log(
      `check:flex-label-overflow  PASS — ${fixedCount} violation(s) fixed. ` +
        `${liveCount} remaining. Run --init to tighten the baseline.`
    );
  } else {
    console.log(
      `check:flex-label-overflow  PASS — ${liveCount} violation(s), all in baseline (${baseline.signatures.length} allowed).`
    );
  }

  // Write cache only on a clean pass (no regression).
  const cacheFiles2 = collectInputFiles();
  const cacheHash2 = computeInputsHash({ files: cacheFiles2 });
  writeCacheHit(CACHE_NAME, cacheHash2);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Fix hint
// ---------------------------------------------------------------------------

function printFixHint(): void {
  console.error("");
  console.error("HOW TO FIX:");
  console.error('  Add `min-w-0` to the className of the FIRST child (label side):');
  console.error('    <Label className="... min-w-0 ...">');
  console.error('    <ResearchContextFieldLabel className="... min-w-0 ..." ...>');
  console.error("");
  console.error('  Add `shrink-0` to the className of the SECOND child (value side):');
  console.error('    <span className="... shrink-0">');
  console.error('    <EditableValue className="... shrink-0" ...>');
  console.error("");
  console.error("WHY:");
  console.error(
    "  Without min-w-0 the label cannot truncate — it pushes the value off the right edge."
  );
  console.error(
    "  Without shrink-0 the value shrinks instead of the label — wrong overflow behaviour."
  );
  console.error("");
  console.error(
    "  To permanently allow an exception, add the file path to ALLOWED_FILES in"
  );
  console.error("  scripts/src/check-flex-label-overflow.ts with an explanatory comment.");
  console.error("");
  console.error(
    "  After fixing rows, run --init to update the baseline:"
  );
  console.error(
    "    pnpm --filter @workspace/scripts run check:flex-label-overflow:init"
  );
}
