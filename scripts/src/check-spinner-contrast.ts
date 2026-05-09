/**
 * check-spinner-contrast.ts
 *
 * Two guards in one script:
 *
 * GUARD 1 — Loader2 spinners with `text-accent-pop` inside dark Buttons
 * -----------------------------------------------------------------------
 * Detects Loader2 spinners with `text-accent-pop` nested inside a Button that
 * renders with a dark / coloured fill:
 *
 *   • <Button variant="default" …>      sage fill  (~1.7:1 with amber)
 *   • <Button variant="destructive" …>  red fill   (~1.2:1 with amber)
 *
 * The fix is always the same: replace `text-accent-pop` with `text-white`.
 * `text-white` matches the button label colour and clears WCAG 3:1 for
 * non-text UI on every theme.
 *
 * CANONICAL FIX (Guard 1)
 * -----------------------
 *   Before (invisible on dark button):
 *     <Loader2 className="w-4 h-4 animate-spin text-accent-pop" />
 *
 *   After:
 *     {/* Spinner sits on bg-primary (sage); text-white keeps WCAG 3:1. *\/}
 *     <Loader2 className="w-4 h-4 animate-spin text-white" />
 *
 * GUARD 2 — Icon components with non-white colour classes inside dark Buttons
 * ---------------------------------------------------------------------------
 * Detects decorative SVG icon components (e.g. <SaveIcon, <PlusIcon, <Lucide*,
 * <Icon*) that carry an explicit non-white / non-inherited colour class
 * (e.g. `text-accent-pop`, `text-muted-foreground`) inside the same dark-fill
 * buttons.  These silently fail the WCAG 3:1 non-text contrast requirement for
 * interactive elements.
 *
 * Safe colours (excluded from the check):
 *   text-white    — explicitly correct on dark fills
 *   text-current  — inherits the button's text-primary-foreground (safe)
 *   text-inherit  — same inheritance chain (safe)
 *
 * CANONICAL FIX (Guard 2)
 * -----------------------
 *   Before (low-contrast icon on sage/red button):
 *     <PlusIcon className="w-4 h-4 text-muted-foreground" />
 *
 *   After (remove or replace with safe colour):
 *     <PlusIcon className="w-4 h-4 text-white" />
 *     — or just remove the explicit colour so the icon inherits text-primary-foreground —
 *     <PlusIcon className="w-4 h-4" />
 *
 * DETECTION STRATEGY
 * ------------------
 * JSX cannot be parsed perfectly without an AST, so this script uses a
 * conservative text-heuristic that handles the two most common forms:
 *
 *   Form A — single-line props:
 *     <Button variant="default" onClick={...}>
 *       <SomeIcon className="... text-accent-pop ..." />
 *     </Button>
 *
 *   Form B — multi-line props (variant on its own line):
 *     <Button
 *       variant="default"
 *       onClick={...}
 *     >
 *       <SomeIcon className="... text-muted-foreground ..." />
 *     </Button>
 *
 * Algorithm for each matching icon / spinner line:
 *   1. Gather up to CONTEXT_LINES lines above the element in the file.
 *   2. Search (right-to-left in that window) for a `<Button` open-tag that:
 *        a. Has variant="default" or variant="destructive" on the SAME line
 *           OR within the next 8 lines (covering multi-line prop forms).
 *        b. Is NOT closed by a `</Button>` between the button open and the
 *           icon line — meaning the icon really is inside the button.
 *   3. If such a button is found → VIOLATION.
 *
 * KNOWN LIMITATIONS
 * -----------------
 * 1. Icon-name heuristic: Guard 2 only matches component names that end in
 *    "Icon" (e.g. <PlusIcon>), start with "Icon" (e.g. <IconSave>), or start
 *    with "Lucide" (e.g. <LucideCheck>).  Icon components that use short names
 *    without these affixes (e.g. a bare <Plus /> from an icon library) will not
 *    be detected.  This is a known gap; the heuristic covers the naming
 *    convention used consistently in this codebase.
 *
 * 2. Safe-colour allowlist: Guard 2 excludes text-white, text-current, and
 *    text-inherit.  If a design-system semantic token such as
 *    text-primary-foreground is used directly on an icon inside a dark button
 *    it will be flagged even though it is technically safe (the token resolves
 *    to white on dark fills).  Add the file to ALLOWED_FILES if this occurs.
 *
 * 3. Single-line scope: both guards operate one source line at a time for the
 *    element being checked.  A colour class spread across a multi-line cn()
 *    call will not be detected.
 *
 * FALSE-POSITIVE ESCAPE HATCH
 * ---------------------------
 * If a genuine use case arises, add the file's relative path to ALLOWED_FILES
 * below with an explanatory comment.
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

/** Source trees to walk (relative to WORKSPACE_ROOT). */
const SCAN_DIRS = [
  "artifacts/hospitality-business-portal/src",
];

/**
 * How many lines above the spinner to include in the context window.
 * 50 lines covers even deeply indented Button blocks.
 */
const CONTEXT_LINES = 50;

/**
 * When we find a `<Button` line WITHOUT a closing `>` on the same line,
 * how many following lines to search for `variant="default|destructive"`.
 * 8 covers even heavily prop-loaded Button tags.
 */
const MULTILINE_PROP_LOOKAHEAD = 8;

/**
 * Files (relative to WORKSPACE_ROOT) that are permanently allowed to have
 * this pattern. Add with an explanatory comment when genuinely necessary.
 */
const ALLOWED_FILES: string[] = [
  // none currently
];

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
]);

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------

/**
 * Matches a Loader2 JSX element that has text-accent-pop in its className on
 * the same source line.
 *
 * Examples:
 *   <Loader2 className="w-4 h-4 animate-spin text-accent-pop" />
 *   <Loader2 className={cn("animate-spin text-accent-pop", extra)} />
 */
const LOADER2_ACCENT_POP_RE = /<Loader2[^>]*text-accent-pop/;

/**
 * Matches icon-component JSX elements that carry an explicit non-white,
 * non-inherited colour class.  An icon component is any of:
 *
 *   • PascalCase name ending in "Icon"  e.g. <PlusIcon, <GripVerticalIcon
 *   • Name starting with "Icon"         e.g. <IconSave, <IconTrash
 *   • Name starting with "Lucide"       e.g. <LucideCheck, <LucidePlus
 *
 * The colour is "non-white / non-inherited" when the className contains a
 * `text-*` class that is NOT one of:
 *   text-white   (explicitly safe on dark fills)
 *   text-current (inherits the button's text-primary-foreground — safe)
 *   text-inherit (same inheritance chain — safe)
 *
 * The negative-lookahead `(?!white\b|current\b|inherit\b)` excludes those
 * three safe tokens while still matching things like `text-accent-pop`,
 * `text-muted-foreground`, `text-foreground`, `text-primary`, etc.
 */
const ICON_NONWHITE_RE =
  /<(?:[A-Z][a-zA-Z]*Icon|Icon[A-Z][a-zA-Z]*|Lucide[A-Z][a-zA-Z]*)\b[^>]*\btext-(?!white\b|current\b|inherit\b)\w/;

/**
 * Companion to ICON_NONWHITE_RE that handles the cn() helper form, e.g.:
 *
 *   <PlusIcon className={cn("w-4 h-4", isActive && "text-accent-pop")} />
 *
 * The base regex above relies on `[^>]*` between the icon tag and the
 * `text-*` literal, which is broken by any `>` character earlier on the line
 * (most commonly a JS comparison operator like `count > 0` inside the cn()
 * conditional).  This companion regex skips the no-`>` constraint as long as
 * the colour literal sits inside a `cn(` call:
 *
 *   icon-tag opens → ... → cn( → ... → "...text-<non-safe>..."
 *
 * The string-literal anchor (`["']`) plus the negative-lookahead for the
 * three safe tokens keep the match scoped to actual non-white colour
 * literals and avoid matching unrelated text-* substrings.
 */
const ICON_CN_NONWHITE_RE =
  /<(?:[A-Z][a-zA-Z]*Icon|Icon[A-Z][a-zA-Z]*|Lucide[A-Z][a-zA-Z]*)\b.*\bcn\(.*["'][^"']*\btext-(?!white\b|current\b|inherit\b)[\w-]+/;

/**
 * Matches `<Button` on a line, anchored to catch only the opening JSX tag
 * (not e.g. `</Button>` or `ButtonGroup`).
 */
const BUTTON_OPEN_RE = /<Button\b/;

/**
 * Matches `variant="default"` or `variant="destructive"` anywhere on a line.
 */
const DARK_VARIANT_RE = /variant=["'](default|destructive)["']/;

/**
 * Matches a self-closing button — when `<Button` and `/>` both appear on the
 * same line, the element has no children and cannot contain a spinner.
 */
const SELF_CLOSE_SAME_LINE_RE = /<Button\b[^>]*\/>/;

/**
 * Matches a closing `</Button>` tag.
 */
const BUTTON_CLOSE_RE = /<\/Button>/;

/**
 * Matches a `<SaveButton` opening tag.
 * SaveButton always renders a <Button variant="default"> internally, so any
 * Loader2 with text-accent-pop passed as children will sit on a dark fill.
 */
const SAVE_BUTTON_OPEN_RE = /<SaveButton\b/;

/**
 * Matches a closing `</SaveButton>` tag.
 */
const SAVE_BUTTON_CLOSE_RE = /<\/SaveButton>/;

// ---------------------------------------------------------------------------
// Tree walker
// ---------------------------------------------------------------------------

function* walkFiles(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
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
// Allow-list check
// ---------------------------------------------------------------------------

function isAllowed(absolutePath: string): boolean {
  const rel = path.relative(WORKSPACE_ROOT, absolutePath).replace(/\\/g, "/");
  return ALLOWED_FILES.includes(rel);
}

// ---------------------------------------------------------------------------
// Core detection
// ---------------------------------------------------------------------------

/**
 * Given the lines ABOVE the Loader2 (up to CONTEXT_LINES of them), determine
 * whether the spinner is nested inside a dark-variant Button that is still
 * open (i.e., not closed before the spinner line).
 *
 * Scans right-to-left (nearest first) for a `<Button` open tag, then checks:
 *   1. That the tag has variant="default" or "destructive" (same line or in
 *      the next MULTILINE_PROP_LOOKAHEAD lines of the context block).
 *   2. That there is no `</Button>` between that tag and the spinner line.
 *
 * Returns the 0-based index into contextLines of the matching Button, or -1.
 */
function findEnclosingDarkButton(contextLines: string[]): number {
  for (let i = contextLines.length - 1; i >= 0; i--) {
    const line = contextLines[i];

    if (!BUTTON_OPEN_RE.test(line)) continue;

    // Skip self-closing buttons on the same line — they can't contain anything.
    if (SELF_CLOSE_SAME_LINE_RE.test(line)) continue;

    // Determine whether this button has a dark variant.
    // First, check the opening line itself (Form A).
    let hasDarkVariant = DARK_VARIANT_RE.test(line);

    if (!hasDarkVariant) {
      // Form B: variant may be on a following line within the same open tag.
      // "Following" in file order = higher indices in contextLines.
      const end = Math.min(i + MULTILINE_PROP_LOOKAHEAD + 1, contextLines.length);
      for (let j = i + 1; j < end; j++) {
        if (DARK_VARIANT_RE.test(contextLines[j])) {
          hasDarkVariant = true;
          break;
        }
        // If we hit a `>` that closes the tag (without `variant`), stop looking.
        // A plain `>` on its own line or at the end of a line after attributes
        // indicates the end of this tag's props.
        if (/^\s*>/.test(contextLines[j])) break;
      }
    }

    if (!hasDarkVariant) continue;

    // The button has a dark variant. Now verify it is not already closed
    // before the spinner line. Check all lines AFTER this button and before
    // the spinner for a </Button>.
    const afterButton = contextLines.slice(i + 1);
    const alreadyClosed = afterButton.some((l) => BUTTON_CLOSE_RE.test(l));

    if (!alreadyClosed) {
      return i; // violation: spinner is inside an open dark button
    }
  }

  return -1; // no enclosing dark button found
}

/**
 * Returns true when the spinner appears to be inside a wrapping (non-self-closing)
 * `<SaveButton>` block in the context window.
 *
 * SaveButton always renders a `<Button variant="default">` internally, so any
 * Loader2 with text-accent-pop passed as SaveButton children sits on a dark fill
 * (sage) that makes the amber colour invisible.
 *
 * Self-closing detection heuristic
 * ----------------------------------
 * When a `<SaveButton` is found we look at the lines between that tag and the
 * spinner to decide if it is self-closing or wrapping:
 *
 *   • A line whose trimmed content is just `/>` signals self-closing (multi-line
 *     JSX props pattern — the self-close delimiter sits alone on its own line).
 *   • A `/>` that appears inline within another element on the same line
 *     (e.g. `  <IconSave className="..." />`) does NOT match because the pattern
 *     anchors at the start of the line (whitespace then slash-gt only).
 *   • `</SaveButton>` appearing before the spinner means the block was already
 *     closed and cannot contain the spinner.
 *   • A line whose trimmed content is just `>` signals a wrapping open tag.
 *
 * This correctly handles the common admin pattern where SaveButton is passed as
 * the `actions={}` prop of PageHeader using self-closing syntax:
 *   actions={saveState ? <SaveButton ... /> : undefined}
 *
 * Returns true if a wrapping SaveButton enclosing the spinner was found.
 */
function findEnclosingSaveButton(contextLines: string[]): boolean {
  for (let i = contextLines.length - 1; i >= 0; i--) {
    const line = contextLines[i];

    if (!SAVE_BUTTON_OPEN_RE.test(line)) continue;

    // If the opening tag self-closes on the same line, skip it.
    if (/\/>/.test(line)) continue;

    // Look at lines between this opening and the spinner prefix.
    const inBetween = contextLines.slice(i + 1);

    // </SaveButton> before the spinner → already closed, not a container.
    const hasExplicitClose = inBetween.some((l) => SAVE_BUTTON_CLOSE_RE.test(l));
    if (hasExplicitClose) continue;

    // A line that is only whitespace + `/>` indicates the multi-line self-closing
    // form of the tag — the spinner is NOT inside this SaveButton.
    const selfCloseIdx = inBetween.findIndex((l) => /^\s*\/>/.test(l));

    // A line that is only whitespace + `>` (without `/`) indicates the wrapping
    // form — the spinner IS inside this SaveButton.
    const wrapOpenIdx = inBetween.findIndex(
      (l) => /^\s*>/.test(l) && !/\/>/.test(l)
    );

    if (selfCloseIdx !== -1) {
      // Self-close appears before any wrapping-open `>` → not a container.
      if (wrapOpenIdx === -1 || selfCloseIdx < wrapOpenIdx) continue;
    }

    // Either wrapping form or no definitive delimiter found between the opening
    // tag and the spinner — treat conservatively as wrapping (container).
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Input-hash cache (task #1214) — short-circuits when no .tsx file under the
// scan dirs has changed since the last successful run.
// ---------------------------------------------------------------------------

const CACHE_NAME = "spinner-contrast";

const cacheInputFiles: string[] = [fileURLToPath(import.meta.url)];
for (const scanDir of SCAN_DIRS) {
  const absDir = path.join(WORKSPACE_ROOT, scanDir);
  if (!fs.existsSync(absDir)) continue;
  for (const absPath of walkFiles(absDir)) cacheInputFiles.push(absPath);
}

const cacheHash = computeInputsHash({ files: cacheInputFiles });
if (tryCacheHit(CACHE_NAME, cacheHash)) process.exit(0);

let violations = 0;

for (const scanDir of SCAN_DIRS) {
  const absDir = path.join(WORKSPACE_ROOT, scanDir);
  if (!fs.existsSync(absDir)) continue;

  for (const absPath of walkFiles(absDir)) {
    if (isAllowed(absPath)) continue;

    const rel = path.relative(WORKSPACE_ROOT, absPath).replace(/\\/g, "/");
    const lines = fs.readFileSync(absPath, "utf8").split("\n");

    for (let i = 0; i < lines.length; i++) {
      // --- Guard 1: Loader2 with text-accent-pop ---
      if (LOADER2_ACCENT_POP_RE.test(lines[i])) {
        const start = Math.max(0, i - CONTEXT_LINES);
        const spinnerPos = lines[i].search(LOADER2_ACCENT_POP_RE);
        const spinnerLinePrefix = lines[i].slice(0, spinnerPos);
        const context = [...lines.slice(start, i), spinnerLinePrefix];

        if (findEnclosingDarkButton(context) !== -1 || findEnclosingSaveButton(context)) {
          console.error(`VIOLATION  ${rel}:${i + 1}  ${lines[i].trim()}`);
          violations++;
        }
      }

      // --- Guard 2: Icon component with non-white colour inside dark Button ---
      // Two regexes cover the two common shapes:
      //   • ICON_NONWHITE_RE     — colour literal in a plain className string
      //   • ICON_CN_NONWHITE_RE  — colour literal inside a cn() helper call
      // We pick whichever matches first on the line so the prefix slice (used
      // to anchor the context window) lines up with the actual icon tag.
      const iconBaseMatch = ICON_NONWHITE_RE.test(lines[i]);
      const iconCnMatch = !iconBaseMatch && ICON_CN_NONWHITE_RE.test(lines[i]);
      if (iconBaseMatch || iconCnMatch) {
        const activeRe = iconBaseMatch ? ICON_NONWHITE_RE : ICON_CN_NONWHITE_RE;
        const start = Math.max(0, i - CONTEXT_LINES);
        const iconPos = lines[i].search(activeRe);
        const iconLinePrefix = lines[i].slice(0, iconPos);
        const context = [...lines.slice(start, i), iconLinePrefix];

        if (findEnclosingDarkButton(context) !== -1 || findEnclosingSaveButton(context)) {
          console.error(`VIOLATION (icon-contrast)  ${rel}:${i + 1}  ${lines[i].trim()}`);
          violations++;
        }
      }
    }
  }
}

if (violations === 0) {
  console.log(
    "check:spinner-contrast  PASS — no contrast violations in dark-fill buttons"
  );
  writeCacheHit(CACHE_NAME, cacheHash);
  process.exit(0);
} else {
  console.error(
    `\ncheck:spinner-contrast  FAIL — ${violations} violation(s) found`
  );
  console.error("");
  console.error("Guard 1 fix (Loader2): Replace `text-accent-pop` with `text-white` on the Loader2.");
  console.error("Guard 2 fix (Icons):   Replace the non-white colour class with `text-white`");
  console.error("                       or remove it so the icon inherits text-primary-foreground.");
  console.error("");
  console.error("EXAMPLES:");
  console.error(
    "  {/* Spinner sits on bg-primary (sage); text-white keeps WCAG 3:1 contrast. */}"
  );
  console.error('  <Loader2 className="w-4 h-4 animate-spin text-white" />');
  console.error('  <PlusIcon className="w-4 h-4 text-white" />');
  console.error('  <PlusIcon className="w-4 h-4" />  {/* inherits text-primary-foreground */}');
  console.error("");
  console.error(
    "To allow a specific file permanently, add it to ALLOWED_FILES in"
  );
  console.error("scripts/src/check-spinner-contrast.ts with an explanatory comment.");
  process.exit(1);
}
