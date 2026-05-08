/**
 * check-magic-numbers.ts
 *
 * Cross-file numeric literal duplication ratchet for financial/engine source code.
 *
 * A value that appears in >= DUPLICATION_THRESHOLD distinct files is a
 * "duplication suspect" — it should live as a named constant in a shared
 * module (lib/shared/src/constants*.ts) rather than being copy-pasted.
 *
 * MODES
 *   (default)  — ratchet mode: compare current state to baseline JSON.
 *                Exits 1 if any duplication regresses (more files than baseline).
 *   --show     — print all current duplications without checking baseline.
 *   --init     — write the current state as the new baseline (lock in gains).
 *   --strict   — fail on ANY value at or above threshold (aspirational; use
 *                when baseline reaches zero suspects).
 *
 * ALLOWED VALUES
 *   Values in ALLOWED_DUPLICATED_VALUES are universally correct as literals
 *   (calendar math, unit definitions, physical constants). All other values
 *   that exceed the threshold must be promoted to named constants.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(__dirname, "../..");
const BASELINE_PATH = path.resolve(__dirname, "_magic-numbers-baseline.json");

/** Min distinct-file count to flag a value as a duplication suspect. */
const DUPLICATION_THRESHOLD = 4;

/** Source directories to scan. Paths relative to WORKSPACE_ROOT. */
const SCAN_DIRS = [
  "lib/calc/src",
  "lib/engine/src",
  "lib/shared/src",
  "lib/domain/src",
  "lib/analytics/src",
];

/** Server source, excluding the migrations directory (generated DDL). */
const SERVER_DIR = "artifacts/api-server/src";
const SERVER_EXCLUDE_DIRS = new Set(["migrations"]);

/** Directories to skip everywhere. */
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".cache",
  ".claude",
  "dist",
  "build",
  "__generated__",
]);

/** File name suffixes to skip — test files and dev harnesses use specific fixture values that are not production magic numbers. */
const SKIP_FILE_SUFFIXES = new Set([".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx", "_render-harness.ts", "smoke-producer.ts"]);

/**
 * Numeric literals whose duplication is correct and expected.
 * These are values fixed by math, calendar, or physical definition.
 * Any value that could legitimately differ under a different country's rules
 * does NOT belong here — promote it to the country-scoped Constants table.
 */
const ALLOWED_DUPLICATED_VALUES = new Set<string>([
  "12",       // months per year
  "52",       // weeks per year
  "4",        // quarters per year — also: RGBA channels (encoding spec)
  "7",        // days per week
  "24",       // hours per day
  "60",       // seconds/minute or minutes/hour
  "3600",     // seconds per hour (60 * 60)
  "86400",    // seconds per day (24 * 60 * 60)
  "365",      // days per year
  "365.25",   // days in a Julian year (astronomy)
  "30.5",     // days per month (365 / 12)
  "1000",     // milliseconds per second
  "10000",    // basis points per 100%
  "100",      // percent scale
  // Industry-standard dimensional / encoding constants — fixed by external
  // technical spec (PDF, ISO 216, ITU-R, W3C, NIST). Out of scope for the
  // business-model magic-number gate. See SKILL.md "Out-of-scope literals".
  "1920",     // Full HD width  (ITU-R BT.709)
  "1080",     // Full HD height (ITU-R BT.709)
  "1280",     // HD width       (ITU-R BT.709)
  "720",      // HD height      (ITU-R BT.709) — also matches PDF Letter half-points
  "3840",     // 4K UHD width   (ITU-R BT.2020)
  "2160",     // 4K UHD height  (ITU-R BT.2020)
  "960",      // canonical slide canvas width  (1920 / 2)
  "540",      // canonical slide canvas height (1080 / 2)
  "595",      // A4 width  in PDF points (ISO 216)
  "842",      // A4 height in PDF points (ISO 216)
  "612",      // US Letter width  in PDF points (ANSI)
  "792",      // US Letter height in PDF points (ANSI)
  "210",      // A4 width  (mm)
  "297",      // A4 height (mm)
  "72",       // PDF points per inch (ISO 32000)
  "96",       // CSS px per inch (W3C CSS spec)
  "25.4",     // mm per inch (NIST exact)
  "2.54",     // cm per inch (NIST exact)
  "256",      // 8-bit color depth
  "255",      // max 8-bit channel value
  // Regulatory/legal citation substrings — scanner sees these as numeric literals
  // because they appear as bare digits in strings like "IRS Publication 946" or
  // "NOM-030-SSA3-2013". Not executable numeric values; safe to allowlist.
  "946",      // IRS Publication 946 (depreciation)
  "030",      // NOM-030-SSA3-2013 (Mexican fire safety regulation)
  "04",       // date substrings: "2026-04-01", migration IDs "-004"
  "06",       // date substrings: "2026-06-01"
  "1980",     // regulatory year: "Arrêté du 25 juin 1980"
  "1988",     // regulatory year: "DM 31/12/1988"
  "1989",     // regulatory year: "Decreto 3019 de 1989"
  "1996",     // regulatory year: "Texto Ordenado 1996"
]);

/** Extensions to scan. */
const CHECKED_EXTENSIONS = new Set([".ts", ".tsx"]);

// ---------------------------------------------------------------------------
// Numeric literal extractor
// ---------------------------------------------------------------------------

/**
 * Strip single-line comments from a line.
 * Handles the common case; does not attempt to parse multi-line comments or
 * string-embedded comment markers (good enough for the ratchet's purpose).
 */
function stripLineComment(line: string): string {
  const idx = line.indexOf("//");
  if (idx === -1) return line;
  // Crude check: if the '//' is inside a string, don't strip.
  // Count unescaped quotes before idx.
  const before = line.slice(0, idx);
  const singleQuotes = (before.match(/(?<!\\)'/g) || []).length;
  const doubleQuotes = (before.match(/(?<!\\)"/g) || []).length;
  if (singleQuotes % 2 !== 0 || doubleQuotes % 2 !== 0) return line;
  return before;
}

/**
 * Extract distinct numeric literal values from a single TypeScript source file.
 * Returns a Set of string representations of the found numeric literals.
 *
 * Heuristic rules (good enough for ratchet; not a full parser):
 * - Skip comment-only lines (starting with // or * )
 * - Strip inline comments
 * - Skip values 0, 1, -1, 2 (structural: index, clamp, identity, pair)
 * - Skip year-like 4-digit integers >= 2000 (date literals in tests/seeds)
 * - Skip integers that are obviously array indices / port numbers / HTTP status
 *   codes (heuristic: bare integers > 9999 that look like ports or ids)
 */
function extractLiterals(filePath: string): Set<string> {
  const result = new Set<string>();
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split("\n");

  for (let line of lines) {
    const trimmed = line.trim();
    // Skip comment-only lines
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;
    // Skip import/export lines (numbers there are version strings)
    if (trimmed.startsWith("import ") || trimmed.startsWith("export * from")) continue;
    // Skip named constant definitions: (export )?const ALL_CAPS_NAME = <number>
    // These are authoritative single-source definitions, not magic-number usages.
    // The architectural rule against assumption-class shadow constants is enforced
    // by the architecture note in CLAUDE.md and code review — not by the duplication
    // ratchet, which is scoped to detecting DUPLICATION across files only.
    if (/^(export\s+)?const\s+[A-Z][A-Z0-9_]+\s*=\s*-?\d/.test(trimmed)) continue;

    line = stripLineComment(line);

    // Strip string literals so digits embedded in color strings ("rgba(28,43,30,0.05)"),
    // CSS dimension strings ("0.18em"), and other quoted values are not counted as
    // standalone numeric literals.  We replace matched strings with empty quotes so
    // adjacent tokens don't accidentally merge.
    line = line
      .replace(/"(?:[^"\\]|\\.)*"/g, '""')
      .replace(/'(?:[^'\\]|\\.)*'/g, "''")
      .replace(/`(?:[^`\\]|\\.)*`/g, "``");

    // Extract all numeric literals: integer and decimal forms
    // Excludes numbers immediately preceded by letters (e.g., css "12px", hex "0x")
    const matches = line.matchAll(/(?<![a-zA-Z_$0-9#])(\d+(?:\.\d+)?)(?![a-zA-Z_%])/g);
    for (const m of matches) {
      const raw = m[1];
      const val = parseFloat(raw);

      // Skip structural values: 0, 1, 2, -1 (clamp, index, identity)
      if (val === 0 || val === 1 || val === 2 || val === -1) continue;
      // Skip year literals (2020–2099)
      if (/^\d{4}$/.test(raw) && val >= 2000 && val <= 2099) continue;
      // Skip HTTP status codes (100–599 if they're whole numbers — too many false positives otherwise)
      // Actually don't skip — they should be named constants (HTTP_OK, etc.) in shared code

      result.add(raw);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// File walker
// ---------------------------------------------------------------------------

function* walkDir(dir: string, excludeDirs?: Set<string>): Generator<string> {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      if (excludeDirs?.has(entry.name)) continue;
      yield* walkDir(path.join(dir, entry.name), excludeDirs);
    } else if (
      entry.isFile() &&
      CHECKED_EXTENSIONS.has(path.extname(entry.name)) &&
      !Array.from(SKIP_FILE_SUFFIXES).some(s => entry.name.endsWith(s))
    ) {
      yield path.join(dir, entry.name);
    }
  }
}

// ---------------------------------------------------------------------------
// Build the value → file-set map
// ---------------------------------------------------------------------------

type DuplicationMap = Record<string, string[]>;

/**
 * Content-deduplication: two source files with identical byte content are the
 * same logical unit (e.g. lib/shared/src/X.ts mirrored to
 * artifacts/api-server/src/shared/X.ts).  Counting them twice would inflate
 * the duplication score for every constant defined in the shared package.
 * We keep the lexicographically first path as the canonical representative.
 */
const contentHashToCanonical = new Map<string, string>();

function canonicalPath(absFile: string, rel: string): string {
  const content = fs.readFileSync(absFile, "utf8");
  const hash = crypto.createHash("sha1").update(content).digest("hex");
  if (!contentHashToCanonical.has(hash)) {
    contentHashToCanonical.set(hash, rel);
  }
  return contentHashToCanonical.get(hash)!;
}

function buildDuplicationMap(): DuplicationMap {
  contentHashToCanonical.clear();
  const valueToFiles = new Map<string, Set<string>>();

  const scan = (dir: string, excludeDirs?: Set<string>) => {
    const absDir = path.join(WORKSPACE_ROOT, dir);
    for (const absFile of walkDir(absDir, excludeDirs)) {
      const rel = path.relative(WORKSPACE_ROOT, absFile).replace(/\\/g, "/");
      const canonical = canonicalPath(absFile, rel);
      const literals = extractLiterals(absFile);
      for (const lit of literals) {
        if (!valueToFiles.has(lit)) valueToFiles.set(lit, new Set());
        valueToFiles.get(lit)!.add(canonical);
      }
    }
  };

  for (const dir of SCAN_DIRS) scan(dir);
  scan(SERVER_DIR, SERVER_EXCLUDE_DIRS);

  const result: DuplicationMap = {};
  for (const [value, files] of valueToFiles) {
    if (files.size >= DUPLICATION_THRESHOLD && !ALLOWED_DUPLICATED_VALUES.has(value)) {
      result[value] = Array.from(files).sort();
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Modes
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const mode = args[0] ?? "check";

const current = buildDuplicationMap();

if (mode === "--show") {
  const suspects = Object.entries(current).sort((a, b) => b[1].length - a[1].length);
  if (suspects.length === 0) {
    console.log("No cross-file numeric literal duplications above threshold.");
    process.exit(0);
  }
  console.log(`\nMagic-number duplication suspects (${DUPLICATION_THRESHOLD}+ files):\n`);
  for (const [value, files] of suspects) {
    console.log(`  ${value}  (${files.length} files)`);
    for (const f of files) console.log(`    ${f}`);
  }
  console.log(`\nTotal suspects: ${suspects.length}`);
  process.exit(0);
}

if (mode === "--init") {
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(current, null, 2) + "\n", "utf8");
  const count = Object.keys(current).length;
  console.log(`Baseline written to ${path.relative(WORKSPACE_ROOT, BASELINE_PATH)}`);
  console.log(`${count} value(s) at or above threshold locked in.`);
  process.exit(0);
}

if (mode === "--strict") {
  const suspects = Object.keys(current);
  if (suspects.length === 0) {
    console.log("check:magic-numbers --strict  PASS — no duplications found");
    process.exit(0);
  }
  console.error(`check:magic-numbers --strict  FAIL — ${suspects.length} duplication(s) found`);
  for (const [value, files] of Object.entries(current)) {
    console.error(`  ${value}: ${files.length} files`);
  }
  process.exit(1);
}

// Default: ratchet check against baseline
if (!fs.existsSync(BASELINE_PATH)) {
  console.error(`Baseline not found: ${BASELINE_PATH}`);
  console.error("Run: tsx scripts/src/check-magic-numbers.ts --init");
  process.exit(1);
}

const baseline: DuplicationMap = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));

let regressions = 0;
let improvements = 0;

// Check existing baseline values
for (const [value, baseFiles] of Object.entries(baseline)) {
  const currFiles = current[value];
  if (!currFiles) {
    improvements++;
    continue;
  }
  if (currFiles.length > baseFiles.length) {
    const newFiles = currFiles.filter(f => !baseFiles.includes(f));
    console.error(`REGRESSION  ${value}: ${baseFiles.length} → ${currFiles.length} files (+${newFiles.join(", ")})`);
    regressions++;
  }
}

// Check for brand-new suspects not in baseline
for (const [value, currFiles] of Object.entries(current)) {
  if (!(value in baseline)) {
    console.error(`NEW SUSPECT  ${value}: ${currFiles.length} files (${currFiles.join(", ")})`);
    regressions++;
  }
}

if (regressions === 0) {
  const summary = improvements > 0
    ? `PASS — ${improvements} improvement(s) since baseline`
    : "PASS — no regressions";
  console.log(`check:magic-numbers  ${summary}`);
  process.exit(0);
} else {
  console.error(`\ncheck:magic-numbers  FAIL — ${regressions} regression(s)`);
  console.error("Fix: promote the literal to a named constant in lib/shared/src/constants*.ts");
  console.error("then re-run tsx scripts/src/check-magic-numbers.ts --init to lock in the gain.");
  process.exit(1);
}
