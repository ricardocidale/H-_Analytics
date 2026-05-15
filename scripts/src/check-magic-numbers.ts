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

import { computeInputsHash, tryCacheHit, writeCacheHit } from "./lib/check-cache.js";

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
 * Typed registry of numeric literals whose cross-file duplication is correct
 * and expected. Each entry declares its exception class per the no-magic-numbers
 * SKILL taxonomy, a citation, and an optional `feedsDefault` key.
 *
 * Exception classes:
 *   UNIVERSAL_MATH    — mathematics, physics, or calendar (same in every country)
 *   TECHNICAL_SPEC    — external technical standard (ISO, ITU-R, W3C, NIST, PDF)
 *   STRUCTURAL_CS     — data-structure / protocol properties (0, 1, -1, HTTP codes)
 *   RENDERER_SPEC     — measured calibration for a specific renderer/infra component
 *   AUTHORITY_BASELINE — authority-published value (IRS, GAAP, USALI) used as a TS
 *                        factory fallback; must also carry // FEEDS_DEFAULT: <key>
 *                        above the export const declaration in constants*.ts.
 *
 * Values that could legitimately differ under a different country's rules do NOT
 * belong here — promote them to the country-scoped Constants table.
 *
 * Any value that already appears in four or more distinct files gets its
 * duplication allowed via the Set below; new values appearing in <4 files
 * are still subject to the decision tree in the SKILL at first occurrence.
 */
interface AllowedConstant {
  /** String form of the numeric literal as it appears in source (e.g. "30.5"). */
  value: string;
  /** Exception class from the no-magic-numbers SKILL taxonomy. */
  category: "UNIVERSAL_MATH" | "TECHNICAL_SPEC" | "STRUCTURAL_CS" | "RENDERER_SPEC" | "AUTHORITY_BASELINE";
  /** Citation: standard, publication, spec, or derivation formula. */
  citation: string;
  /**
   * When category is AUTHORITY_BASELINE: the model-constants-registry key this
   * constant feeds as a TS factory fallback. The checker will warn (non-blocking)
   * if a file defines a constant annotated // FEEDS_DEFAULT: <key> but never
   * calls getFactoryNumber or getEffectiveConstant.
   */
  feedsDefault?: string;
}

const ALLOWED_CONSTANTS: AllowedConstant[] = [
  // ── UNIVERSAL_MATH — calendar and arithmetic ──────────────────────────────
  { value: "12",      category: "UNIVERSAL_MATH",   citation: "12 months per year" },
  { value: "52",      category: "UNIVERSAL_MATH",   citation: "52 weeks per year" },
  { value: "4",       category: "UNIVERSAL_MATH",   citation: "4 quarters per year — also: RGBA channels (TECHNICAL_SPEC)" },
  { value: "7",       category: "UNIVERSAL_MATH",   citation: "7 days per week" },
  { value: "24",      category: "UNIVERSAL_MATH",   citation: "24 hours per day" },
  { value: "60",      category: "UNIVERSAL_MATH",   citation: "60 seconds/minute or 60 minutes/hour" },
  { value: "3600",    category: "UNIVERSAL_MATH",   citation: "3600 seconds per hour (60 × 60)" },
  { value: "86400",   category: "UNIVERSAL_MATH",   citation: "86400 seconds per day (24 × 60 × 60)" },
  { value: "365",     category: "UNIVERSAL_MATH",   citation: "365 days per year" },
  { value: "365.25",  category: "UNIVERSAL_MATH",   citation: "365.25 days in a Julian year (astronomy)" },
  { value: "30.5",    category: "UNIVERSAL_MATH",   citation: "30.5 days per month (365 / 12) — USALI industry convention" },
  { value: "1000",    category: "UNIVERSAL_MATH",   citation: "1000 milliseconds per second" },
  { value: "10000",   category: "UNIVERSAL_MATH",   citation: "10000 basis points per 100% (definition of a basis point)" },
  { value: "100",     category: "UNIVERSAL_MATH",   citation: "100 — decimal-to-percent scale factor" },

  // ── TECHNICAL_SPEC — external standards (ISO, ITU-R, W3C, NIST, PDF) ─────
  { value: "1920",    category: "TECHNICAL_SPEC",   citation: "Full HD width — ITU-R BT.709" },
  { value: "1080",    category: "TECHNICAL_SPEC",   citation: "Full HD height — ITU-R BT.709" },
  { value: "1280",    category: "TECHNICAL_SPEC",   citation: "HD width — ITU-R BT.709" },
  { value: "720",     category: "TECHNICAL_SPEC",   citation: "HD height — ITU-R BT.709 (also matches PDF Letter half-points)" },
  { value: "3840",    category: "TECHNICAL_SPEC",   citation: "4K UHD width — ITU-R BT.2020" },
  { value: "2160",    category: "TECHNICAL_SPEC",   citation: "4K UHD height — ITU-R BT.2020" },
  { value: "960",     category: "TECHNICAL_SPEC",   citation: "Canonical slide canvas width (1920 / 2)" },
  { value: "540",     category: "TECHNICAL_SPEC",   citation: "Canonical slide canvas height (1080 / 2)" },
  { value: "595",     category: "TECHNICAL_SPEC",   citation: "A4 width in PDF points — ISO 216" },
  { value: "842",     category: "TECHNICAL_SPEC",   citation: "A4 height in PDF points — ISO 216" },
  { value: "612",     category: "TECHNICAL_SPEC",   citation: "US Letter width in PDF points — ANSI" },
  { value: "792",     category: "TECHNICAL_SPEC",   citation: "US Letter height in PDF points — ANSI" },
  { value: "210",     category: "TECHNICAL_SPEC",   citation: "A4 width in mm — ISO 216" },
  { value: "297",     category: "TECHNICAL_SPEC",   citation: "A4 height in mm — ISO 216" },
  { value: "72",      category: "TECHNICAL_SPEC",   citation: "PDF points per inch — ISO 32000" },
  { value: "96",      category: "TECHNICAL_SPEC",   citation: "CSS pixels per inch — W3C CSS spec" },
  { value: "25.4",    category: "TECHNICAL_SPEC",   citation: "mm per inch — NIST exact definition" },
  { value: "2.54",    category: "TECHNICAL_SPEC",   citation: "cm per inch — NIST exact definition" },
  { value: "256",     category: "TECHNICAL_SPEC",   citation: "8-bit color depth — encoding spec" },
  { value: "255",     category: "TECHNICAL_SPEC",   citation: "Max 8-bit channel value — encoding spec" },

  // ── STRUCTURAL_CS — regulatory/citation substrings seen as numeric literals
  // The scanner encounters these as bare digits inside string literals such as
  // "IRS Publication 946" or "NOM-030-SSA3-2013". They are not executable
  // numeric values; allowlisting suppresses false-positive ratchet noise.
  { value: "946",     category: "STRUCTURAL_CS",    citation: "IRS Publication 946 (depreciation citation substring)" },
  { value: "030",     category: "STRUCTURAL_CS",    citation: "NOM-030-SSA3-2013 (Mexican fire safety regulation substring)" },
  { value: "04",      category: "STRUCTURAL_CS",    citation: "Date substring: '2026-04-01', migration IDs '-004'" },
  { value: "06",      category: "STRUCTURAL_CS",    citation: "Date substring: '2026-06-01'" },
  { value: "1980",    category: "STRUCTURAL_CS",    citation: "Regulatory year: 'Arrêté du 25 juin 1980'" },
  { value: "1988",    category: "STRUCTURAL_CS",    citation: "Regulatory year: 'DM 31/12/1988'" },
  { value: "1989",    category: "STRUCTURAL_CS",    citation: "Regulatory year: 'Decreto 3019 de 1989'" },
  { value: "1996",    category: "STRUCTURAL_CS",    citation: "Regulatory year: 'Texto Ordenado 1996'" },
];

/**
 * Runtime Set built from the typed registry above.
 * The duplication-ratchet gate logic is unchanged — it still reads this Set.
 * Extend the registry above (not this Set) when adding new allowed values.
 */
const ALLOWED_DUPLICATED_VALUES = new Set<string>(ALLOWED_CONSTANTS.map(c => c.value));

// ---------------------------------------------------------------------------
// FEEDS_DEFAULT bypass warning
// ---------------------------------------------------------------------------

/**
 * Scan lib/shared/src/constants*.ts for `// FEEDS_DEFAULT: <key>` annotations.
 * For each annotated constant, verify that the same file calls getFactoryNumber
 * or getEffectiveConstant somewhere (indicating the constant is genuinely used
 * only as a last-resort factory fallback, not as a hardcoded bypass).
 *
 * This check is NON-BLOCKING — it prints warnings but does not increment
 * the regressions counter or cause a gate failure.
 */
function checkFeedsDefaultAnnotations(): void {
  const constantsDir = path.join(WORKSPACE_ROOT, "lib/shared/src");
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(constantsDir, { withFileTypes: true });
  } catch {
    return;
  }

  /** Regex matching an actual getFactoryNumber / getEffectiveConstant invocation (open paren required). */
  const INVOCATION_PATTERN = /\b(?:getFactoryNumber|getEffectiveConstant)\s*\(/;

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.startsWith("constants") || !entry.name.endsWith(".ts")) continue;

    const filePath = path.join(constantsDir, entry.name);
    const rel = path.relative(WORKSPACE_ROOT, filePath).replace(/\\/g, "/");
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split("\n");

    // Strip block comments and line comments before testing for real invocations.
    // This prevents a @deprecated JSDoc that mentions getFactoryNumber from
    // suppressing the warning on a file that has no actual call site.
    const strippedContent = content
      .replace(/\/\*[\s\S]*?\*\//g, "")    // block comments
      .replace(/\/\/[^\n]*/g, "");          // line comments
    const hasCalls = INVOCATION_PATTERN.test(strippedContent);

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      const fdMatch = /^\/\/\s*FEEDS_DEFAULT:\s*(\S+)/.exec(trimmed);
      if (!fdMatch) continue;

      const registryKey = fdMatch[1];

      // Verify placement: the annotation must be immediately followed by
      // export const (the next non-blank line should be the declaration).
      const nextLine = lines[i + 1]?.trim() ?? "";
      const isPlacedCorrectly = /^(?:export\s+)?const\s+[A-Z]/.test(nextLine);
      if (!isPlacedCorrectly) {
        console.warn(
          `[FEEDS_DEFAULT warning]  ${rel}:${i + 1}  // FEEDS_DEFAULT: ${registryKey}` +
          `  — annotation must appear on the line immediately above "export const …".` +
          `  Found instead: "${nextLine.slice(0, 60)}"`,
        );
      }

      if (!hasCalls) {
        console.warn(
          `[FEEDS_DEFAULT warning]  ${rel}:${i + 1}  // FEEDS_DEFAULT: ${registryKey}` +
          `  — file has no getFactoryNumber/getEffectiveConstant invocation.` +
          `  Possible hardcoded bypass of model-constants registry.`,
        );
      }
    }
  }
}

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
    // The architectural rule against assumption-class shadow constants (configurable
    // values must live in model_constants DB via getFactoryNumber, not in TS files)
    // is enforced by the constants-taxonomy check (findDbCandidateViolations below).
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
// Constants-taxonomy check: configurable values must live in DB, not TS files
// ---------------------------------------------------------------------------

/**
 * Name-suffix patterns that flag a constant defined in lib/shared/src/constants*.ts
 * as a "DB candidate" — values configurable at runtime by admins that must live in
 * `model_constants` via `getFactoryNumber` (model-constants-registry) rather than
 * being hardcoded in TypeScript.
 *
 * Exemption A — a `// DB: <key>` comment on any of the 3 lines preceding the
 * `export const` line explicitly acknowledges the constant is either already
 * DB-backed (with a TS fallback only) or is a fixed architectural bound.
 *
 * Exemption B — an authority citation in the preceding 3 lines: RFC, ISO, USALI,
 * IRS, NIST, ANSI, W3C, §, Damodaran, IMF, or a time-unit phrase ("per second",
 * "per minute", etc.). These are universally fixed values, not tunable config.
 */
const DB_CANDIDATE_PATTERNS: readonly string[] = [
  "_LIMIT",              // row / display caps
  "_TOP_K",              // RAG retrieval depth
  "_PAGE_SIZE",          // pagination page size
  "_TIMEOUT_MS",         // network / tool timeouts
  "_INTERVAL_MS",        // polling / scheduling cadences
  "_MAX_OUTPUT_TOKENS",  // LLM output token budget
];

const TAXONOMY_DB_MARKER = "// DB:";
const TAXONOMY_EXEMPTION_LOOKBACK_LINES = 3;

const TAXONOMY_AUTHORITY_MARKERS: readonly string[] = [
  "RFC", "IRS", "GAAP", "ISO", "USALI", "HVS", "NIST", "ITU", "ANSI", "W3C",
  "\u00a7", "Damodaran", "IMF",
  "per second", "per minute", "per hour", "per day", "per month", "per year",
  "milliseconds per", "seconds per",
];

export interface TaxonomyViolation {
  file: string;
  name: string;
  line: number;
}

/**
 * Scan lib/shared/src/constants*.ts for `export const NAME = …` lines whose
 * names match DB_CANDIDATE_PATTERNS and are not covered by an exemption comment.
 * Returns a list of violations; an empty list means the check passes.
 */
export function findDbCandidateViolations(): TaxonomyViolation[] {
  const violations: TaxonomyViolation[] = [];
  const constantsDir = path.join(WORKSPACE_ROOT, "lib/shared/src");

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(constantsDir, { withFileTypes: true });
  } catch {
    return violations;
  }

  for (const entry of entries) {
    if (
      !entry.isFile() ||
      !entry.name.startsWith("constants") ||
      !entry.name.endsWith(".ts")
    ) continue;

    const filePath = path.join(constantsDir, entry.name);
    const rel = path.relative(WORKSPACE_ROOT, filePath).replace(/\\/g, "/");
    const lines = fs.readFileSync(filePath, "utf8").split("\n");

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      // Match: (export )?const ALL_CAPS_NAME[: Type] = <anything>
      const m = /^(export\s+)?const\s+([A-Z][A-Z0-9_]+)\b(?:\s*:\s*[^=]+)?\s*=/.exec(trimmed);
      if (!m) continue;

      const name = m[2];

      // Must match at least one DB-candidate suffix
      if (!DB_CANDIDATE_PATTERNS.some(p => name.endsWith(p))) continue;

      // Exempt if any of the preceding lines carries a DB marker or authority citation
      const preceding = lines.slice(Math.max(0, i - TAXONOMY_EXEMPTION_LOOKBACK_LINES), i).join("\n");
      if (preceding.includes(TAXONOMY_DB_MARKER)) continue;
      if (TAXONOMY_AUTHORITY_MARKERS.some(marker => preceding.includes(marker))) continue;

      violations.push({ file: rel, name, line: i + 1 });
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Modes
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Input-hash cache (task #1214) — short-circuits the default ratchet mode
// when no input file has changed since the last successful run.
// ---------------------------------------------------------------------------

const CACHE_NAME = "magic-numbers";

export function collectInputFiles(): string[] {
  const files: string[] = [
    fileURLToPath(import.meta.url),
    BASELINE_PATH,
    path.join(WORKSPACE_ROOT, "pnpm-lock.yaml"),
  ];
  const collect = (dir: string, excludeDirs?: Set<string>): void => {
    const absDir = path.join(WORKSPACE_ROOT, dir);
    for (const f of walkDir(absDir, excludeDirs)) files.push(f);
  };
  for (const dir of SCAN_DIRS) collect(dir);
  collect(SERVER_DIR, SERVER_EXCLUDE_DIRS);
  return files;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const mode = args[0] ?? "check";

  let cacheHash: string | null = null;
  if (mode !== "--show" && mode !== "--init" && mode !== "--strict") {
    cacheHash = computeInputsHash({
      files: collectInputFiles(),
      extra: `threshold=${DUPLICATION_THRESHOLD}`,
    });
    if (tryCacheHit(CACHE_NAME, cacheHash)) process.exit(0);
  }

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

  // Non-blocking FEEDS_DEFAULT bypass warning (runs in all non-show/non-init modes)
  checkFeedsDefaultAnnotations();

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

  // Constants-taxonomy check (zero-tolerance — no baseline file; violations must be
  // fixed or explicitly exempted with a `// DB: <key>` comment above the const).
  const taxonomyViolations = findDbCandidateViolations();
  for (const v of taxonomyViolations) {
    console.error(`DB-CANDIDATE  ${v.name}  (${v.file}:${v.line})`);
    regressions++;
  }
  if (taxonomyViolations.length > 0) {
    console.error(`\nDB-candidate fix: configurable values must live in model_constants DB.`);
    console.error(`  Register via getFactoryNumber() in lib/shared/src/model-constants-registry.ts,`);
    console.error(`  or add  // DB: <key>  above the const if it is already DB-backed / a fixed bound.`);
  }

  if (regressions === 0) {
    const summary = improvements > 0
      ? `PASS — ${improvements} improvement(s) since baseline`
      : "PASS — no regressions";
    console.log(`check:magic-numbers  ${summary}`);
    if (cacheHash) writeCacheHit(CACHE_NAME, cacheHash);
    process.exit(0);
  } else {
    const ratchetCount = regressions - taxonomyViolations.length;
    console.error(`\ncheck:magic-numbers  FAIL — ${regressions} issue(s) (${taxonomyViolations.length} DB-candidate, ${ratchetCount} ratchet regression(s))`);
    if (ratchetCount > 0) {
      console.error("Ratchet fix: promote the literal to a named constant in lib/shared/src/constants*.ts");
      console.error("then re-run tsx scripts/src/check-magic-numbers.ts --init to lock in the gain.");
    }
    process.exit(1);
  }
}
