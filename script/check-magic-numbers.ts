#!/usr/bin/env tsx
/**
 * check-magic-numbers.ts — Cross-file magic-number duplication detector.
 *
 * The `no-magic-numbers` skill (.agents/skills/no-magic-numbers/SKILL.md)
 * forbids raw numeric literals outside the four allowed categories. The
 * single failure mode it most reliably prevents is **silent cross-file
 * drift**: the same numeric literal appears in two or more files, one is
 * later "tuned", and the others silently disagree.
 *
 * This script is the runtime gate for that rule. ESLint catches per-file
 * literals; this catches the cross-file ones.
 *
 * How it works
 * ------------
 *  1. Walk `calc/`, `engine/`, `server/`, `shared/` for `.ts` files
 *     (excluding tests / generated code).
 *  2. Extract every numeric literal that is not "trivially structural"
 *     (0, 1, -1, 2, 3) and is not on a line that obviously isn't a
 *     numeric literal in the program-semantics sense (comments, task
 *     references, year keys, hex, regex, version strings, eslint-disables,
 *     unit-derivation comments on the same line).
 *  3. Group each distinct numeric value by the set of files it appears in.
 *  4. Any value present in `>= DUPLICATION_THRESHOLD` distinct files is a
 *     duplication suspect.
 *  5. Compare against the baseline at `tests/audit/_magic-numbers-baseline.json`:
 *     - If a baseline value's file-count GREW → fail (someone added a
 *       new occurrence of an already-known magic number — promote it
 *       to a shared named constant).
 *     - If a NEW value crosses the threshold → fail (someone introduced
 *       a brand-new cross-file duplication).
 *     - If a baseline value's file-count SHRANK → that's progress; the
 *       baseline can be re-frozen with `--init`.
 *
 * Modes
 * -----
 *  default       Ratchet mode. Reads baseline, fails on regressions.
 *                Used by `tests/audit/no-magic-numbers.test.ts`,
 *                `npm run magic:check`, and the "Magic Numbers Check"
 *                workflow.
 *  --show        Print every duplication >= threshold, no baseline check.
 *                Useful when you want to see the full landscape.
 *  --init        Re-snapshot the baseline. Use ONLY after intentionally
 *                cleaning up duplications, never to "make the test pass".
 *  --strict      Ignore the baseline; fail on ANY duplication >=
 *                threshold. Aspirational mode for when the baseline
 *                reaches zero.
 *
 * Exit code 0 = clean (or no regressions vs baseline), 1 = violation.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");
// The override env-vars (BASELINE_OVERRIDE, SCAN_DIRS_OVERRIDE) are
// strictly for guard tests in this repo. They MUST NOT silently take
// effect in a workflow shell — if they did, a contaminated environment
// could weaken the ratchet without leaving a trace. We require an
// explicit opt-in flag (MAGIC_NUMBERS_ALLOW_OVERRIDES=1) and hard-fail
// otherwise. The test suite sets the flag explicitly when needed.
const OVERRIDES_ALLOWED =
  process.env.MAGIC_NUMBERS_ALLOW_OVERRIDES === "1";
function readOverride(name: string): string | undefined {
  const raw = process.env[name];
  if (raw === undefined) return undefined;
  if (!OVERRIDES_ALLOWED) {
    console.error(
      `❌ Magic numbers: ${name} is set but MAGIC_NUMBERS_ALLOW_OVERRIDES=1\n` +
        `   is not. Override env-vars are test-only. If you intend to use\n` +
        `   them (only the guard tests should), set the allow flag.`,
    );
    process.exit(1);
  }
  console.error(`ℹ️  Magic numbers: ${name} active (test override).`);
  return raw;
}

// Baseline location. The env-var override exists ONLY so guard tests can
// point the script at a temporary baseline without mutating the real one
// (which would race with parallel workflows reading it). Production / CI
// paths never set the env-var.
const BASELINE_OVERRIDE = readOverride("MAGIC_NUMBERS_BASELINE_OVERRIDE");
const BASELINE_FILE = BASELINE_OVERRIDE
  ? path.resolve(REPO_ROOT, BASELINE_OVERRIDE)
  : path.join(REPO_ROOT, "tests/audit/_magic-numbers-baseline.json");

// Directories scanned. Limited to the financial / engine / shared paths
// where magic-number drift is most damaging. Client UI is intentionally
// excluded (display caps drift far less and ESLint warns there).
// Default scan dirs. The override env-var exists ONLY so guard tests can
// point the script at a temp directory outside the TS project (otherwise
// probe files leak into `.tsbuildinfo` and break the next TypeScript
// build). Comma-separated absolute paths. Production paths never set it.
const SCAN_DIRS_OVERRIDE = readOverride("MAGIC_NUMBERS_SCAN_DIRS_OVERRIDE");
const SCAN_DIRS: readonly string[] = SCAN_DIRS_OVERRIDE
  ? SCAN_DIRS_OVERRIDE.split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  : ["calc", "engine", "server", "shared"];

// Files / patterns excluded from the scan. Two reasons a file lives here:
// (a) it is generated / fixture code where literals are the data, or
// (b) it is the canonical home of a constant and the one place where the
//     literal is allowed to live.
const EXCLUDED_FILE_PATTERNS: readonly RegExp[] = [
  /\.test\.ts$/,
  /\.spec\.ts$/,
  /\.d\.ts$/,
  /^server\/seeds\//,                // seed data — literals ARE the data
  /^shared\/schema\//,               // drizzle column defaults must be literals
  /^shared\/constants\.ts$/,         // canonical constants live here
  /^shared\/model-constants-registry\.ts$/, // canonical registry
  /^shared\/field-registry\.ts$/,    // canonical registry
  /^server\/migrations\//,           // generated SQL/data migrations
  /^server\/ai\/regenerate-market-data\.ts$/, // LLM prompt templates — literals are example values for the LLM, not code logic
  /^server\/ai\/specialists\/.*-orchestrator-adapter\.ts$/, // benchmark fixture arrays for LLM prompting context — literals are data
];

// Literal values that are NEVER a magic number under any circumstance:
// 0, 1, -1, 2, 3 are structural (indices, clamps, identity, small loops).
// Empty array and null-ish guards push them into category 4 of the skill.
const TRIVIAL_VALUES = new Set([
  "0", "1", "-1", "2", "3",
  "0.0", "1.0", "0.00", "1.00",
]);

// A value duplicated across this many distinct files is treated as a
// likely magic number. Three is too noisy (coincidences); five is too
// permissive. Four is the calibrated threshold for this codebase.
const DUPLICATION_THRESHOLD = 4;

// Per-value allow-list: values that LOOK duplicated but are legitimately
// reused because their definition is universal — pure calendar math,
// pure unit conversion, or a constant of nature. Each entry must include
// a one-line justification — never widen this without reading SKILL.md
// (the "Universal vs. authority-dictated" section) first.
//
// CRITICAL — what does NOT belong here:
//   - Anything that varies by jurisdiction, authority, or accounting
//     framework. Depreciation lives, tax rates, amortization schedules,
//     trading-day conventions, day-count conventions for a specific debt
//     instrument, etc. all differ between US (IRS), Canada (CRA), Spain
//     (Ley 27/2014), France (CGI), Colombia (Estatuto Tributario), and
//     every other regime. The cross-file duplication detector EXISTS to
//     catch those, so they get promoted to the country-scoped Constants
//     table (see the `constants-vs-defaults` skill).
//
// What DOES belong here:
//   - Calendar math derivable from arithmetic alone (365/12, 24*60).
//   - Pure unit / scale (percent, basis points, magnitude separators).
//   - Mathematical and physical constants (π, e, √2).
const ALLOWED_DUPLICATED_VALUES: Record<string, string> = {
  // ---------- Scale (universal definitions, not policy) ----------
  // NOTE: bare "10" was REMOVED — it is too ambiguous (display cap?
  // small-number heuristic? base-10 exponent? policy threshold?) and
  // any vague catch-all here trivially defeats the ratchet.
  "100": "percent scale (decimal-to-percent) — see PERCENT_SCALE",
  "1000": "currency thousands separator",
  "1024": "binary kilobyte",
  "1000000": "million scale unit",
  "1000000000": "billion scale unit",
  // ---------- Calendar / time (universal arithmetic, not jurisdictional) ----------
  "7": "days per week (ISO calendar)",
  "12": "months per year",
  "24": "hours per day",
  "30.5": "days per month, calendar math (365 / 12) — GAAP-derivable",
  "52": "weeks per year (ISO)",
  "60": "seconds/minutes",
  "91.25": "days per quarter, exact calendar math (365 / 4)",
  "365": "days per year",
  "365.25": "days per year, Julian (accounts for leap)",
  "366": "days per leap year",
  "3600": "seconds per hour",
  "86400": "seconds per day",
  "1440": "minutes per day (24 * 60)",
  // NOTE: bare "30" was REMOVED — it is the 30/360 short-month day-count
  // convention used by US bonds, European mortgages, etc. and varies by
  // instrument and jurisdiction. 30/360, ACT/360, ACT/365, 90 days/quarter,
  // 360 banker's year, and 250/252 trading days are all deliberately
  // OMITTED — promote them to the country/instrument-scoped Constants
  // table per the constants-vs-defaults skill.
  // ---------- Basis points (universal definition: 1 bps = 1/10000) ----------
  "10000": "basis points per 100% (universal definition)",
  "0.0001": "one basis point as a decimal",
  "0.01": "one percent as a decimal",
  // ---------- Common rational fractions ----------
  // ---------- HTTP status codes (IETF RFC 9110 — protocol constants) ----------
  "400": "HTTP 400 Bad Request — IETF RFC 9110",
  "401": "HTTP 401 Unauthorized — IETF RFC 9110",
  "403": "HTTP 403 Forbidden — IETF RFC 9110",
  "404": "HTTP 404 Not Found — IETF RFC 9110",
  "409": "HTTP 409 Conflict — IETF RFC 9110",
  "500": "HTTP 500 Internal Server Error — IETF RFC 9110",
  // ---------- Common rational fractions ----------
  "0.25": "one quarter (display / calendar fraction)",
  "0.5": "midpoint / half-credit (documented in calc/ helpers)",
  "0.75": "three quarters (display / calendar fraction)",
  "0.3333": "one third (rounded)",
  "0.33333": "one third (rounded)",
  "0.6667": "two thirds (rounded)",
  "0.66667": "two thirds (rounded)",
  // ---------- Math / physics constants ----------
  // Prefer Math.PI / Math.E in code, but a literal here is by definition
  // a constant of nature, not a policy decision.
  "3.14159": "π (5-digit)",
  "3.141593": "π (6-digit)",
  "3.14159265": "π (8-digit)",
  "2.71828": "e (5-digit)",
  "2.718282": "e (6-digit)",
  "1.41421": "√2",
  "1.61803": "φ (golden ratio)",
};

// ---------------------------------------------------------------------------

interface DuplicationMap {
  // value (as canonical string) → sorted list of distinct files containing it
  [value: string]: string[];
}

interface BaselineFile {
  generatedAt: string;
  threshold: number;
  duplications: DuplicationMap;
}

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  const stack: string[] = [dir];
  while (stack.length) {
    const cur = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = path.join(cur, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === "dist" || e.name === ".cache") continue;
        stack.push(full);
      } else if (e.isFile() && e.name.endsWith(".ts")) {
        out.push(full);
      }
    }
  }
  return out;
}

function isExcluded(relPath: string): boolean {
  return EXCLUDED_FILE_PATTERNS.some((re) => re.test(relPath));
}

/**
 * Canonicalize a numeric token. "1.0" and "1.00" collapse to "1"; "0.50"
 * collapses to "0.5"; integer strings stay as-is. Negative literals carry
 * the sign. This avoids treating typographic variants as distinct.
 */
function canonicalize(raw: string): string {
  if (raw === "") return "";
  // Strip a leading "+" (rare in TS source).
  let n = raw.startsWith("+") ? raw.slice(1) : raw;
  // Underscored numerics: "86_400" → "86400".
  n = n.replace(/_/g, "");
  // Hex / octal / binary are not in scope here — caller filters them.
  const num = Number(n);
  if (!Number.isFinite(num)) return raw;
  // Use String() to drop trailing zeros: 1.00 → "1", 0.50 → "0.5".
  return String(num);
}

/**
 * Decide whether a whole line should be skipped before tokenization. Only
 * lines that are STRUCTURALLY non-code (pure comments, blank lines, bare
 * import/re-export forms) are skipped here. Anything that contains live
 * code goes through extractLiterals(), which strips comments and strings
 * itself — that way an inline comment cannot suppress a literal that
 * lives on the same line as real code.
 */
function lineIsScannable(rawLine: string): boolean {
  const line = rawLine.trim();
  if (line === "") return false;
  // Pure comment lines.
  if (line.startsWith("//")) return false;
  if (line.startsWith("*")) return false;
  if (line.startsWith("/*")) return false;
  // Pure import lines — strings inside imports are stripped anyway, but
  // catching them here is cheaper than the regex pass.
  if (/^import\s/.test(line)) return false;
  // Bare `export {…} from "…"` re-export lines hold no literals.
  if (/^export\s+(?:type\s+)?\{[^}]*\}\s+from\s+/.test(line)) return false;
  return true;
}

/**
 * Extract numeric tokens from one line, after trimming away trailing
 * comments and common non-literal contexts. Hex / binary / octal are
 * filtered. Template literal *expressions* are kept (so `${RATE * 2}` is
 * scanned), but literal text inside a template is stripped.
 *
 * Caveat: a multi-line template literal (backtick spanning lines) cannot
 * be fully stripped by a single-line scanner. We accept that as a known
 * boundary — the SKILL's worst failure mode lives in code, not in
 * formatted multi-line strings.
 */
function extractLiterals(line: string): string[] {
  // Lines explicitly tagged `eslint-disable-next-line no-magic-numbers`
  // (or a same-line `eslint-disable-line no-magic-numbers`) opt out by
  // contract — but ONLY for that exact rule, not blanket disables.
  if (/eslint-disable(?:-next-line|-line)?\s+[^*]*no-magic-numbers/.test(line)) {
    return [];
  }
  // Strip trailing line comment so its numbers don't count.
  let work = line.replace(/\/\/.*$/, "");
  // Strip block comments fully on the same line.
  work = work.replace(/\/\*.*?\*\//g, "");
  // Strip string literals so embedded numbers don't count. For template
  // literals we strip ONLY the literal text segments and keep the
  // ${...} expression contents so embedded literals are still scanned.
  work = work.replace(/"(?:\\.|[^"\\])*"/g, '""');
  work = work.replace(/'(?:\\.|[^'\\])*'/g, "''");
  work = work.replace(/`((?:\\.|[^`\\])*)`/g, (_full, body: string) => {
    // Keep `${...}` expression contents; drop the literal text in between.
    let kept = "";
    let i = 0;
    while (i < body.length) {
      if (body[i] === "$" && body[i + 1] === "{") {
        // Find matching closing brace, accounting for nested braces.
        let depth = 1;
        let j = i + 2;
        while (j < body.length && depth > 0) {
          if (body[j] === "{") depth++;
          else if (body[j] === "}") depth--;
          if (depth > 0) j++;
        }
        kept += " " + body.slice(i + 2, j) + " ";
        i = j + 1;
      } else {
        i++;
      }
    }
    return "``" + kept + "``";
  });

  const out: string[] = [];
  // Match decimal numbers with optional sign, optional fraction (including
  // leading-decimal `.5`), optional underscore separators, and optional
  // scientific notation (`1e3`, `2.5E-6`). Exclude hex (0x), binary (0b),
  // octal (0o) by requiring the leading char not be a letter/digit/$/.
  const re = /(?<![A-Za-z0-9_$.])(-?(?:\d[\d_]*(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?)(?![A-Za-z0-9_$])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(work)) !== null) {
    const tok = m[1];
    if (/^-?0[xXbBoO]/.test(tok)) continue;
    const canonical = canonicalize(tok);
    if (canonical === "") continue;
    if (TRIVIAL_VALUES.has(canonical)) continue;
    out.push(canonical);
  }
  return out;
}

function scanRepo(): DuplicationMap {
  const valueToFiles = new Map<string, Set<string>>();

  for (const dir of SCAN_DIRS) {
    // path.resolve honors absolute paths from the test override; for
    // relative entries it joins against REPO_ROOT. path.join would
    // silently swallow absoluteness and produce REPO_ROOT/<abs-path>.
    const abs = path.resolve(REPO_ROOT, dir);
    if (!fs.existsSync(abs)) continue;
    for (const file of listTsFiles(abs)) {
      // For probe dirs outside the repo, anchor `rel` against the scan
      // dir itself so isExcluded sees a clean path (no `..` traversal).
      const baseForRel = path.isAbsolute(dir) ? abs : REPO_ROOT;
      const rel = path.relative(baseForRel, file).replace(/\\/g, "/");
      if (isExcluded(rel)) continue;
      // TOCTOU-tolerant read: tests in sibling suites (deprecated-constants
      // guard, etc.) plant and unlink probe files inside scanned dirs.
      // A file can vanish between the directory scan above and the read
      // here; treat that as "no content" rather than crashing the workflow.
      let content: string;
      try {
        content = fs.readFileSync(file, "utf-8");
      } catch (err: unknown) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === "ENOENT") continue;
        throw err;
      }
      const seenInThisFile = new Set<string>();
      for (const line of content.split("\n")) {
        if (!lineIsScannable(line)) continue;
        for (const v of extractLiterals(line)) {
          seenInThisFile.add(v);
        }
      }
      for (const v of seenInThisFile) {
        if (!valueToFiles.has(v)) valueToFiles.set(v, new Set());
        valueToFiles.get(v)!.add(rel);
      }
    }
  }

  const dup: DuplicationMap = {};
  for (const [v, files] of valueToFiles.entries()) {
    if (files.size < DUPLICATION_THRESHOLD) continue;
    if (v in ALLOWED_DUPLICATED_VALUES) continue;
    dup[v] = [...files].sort();
  }
  return dup;
}

function loadBaseline(): BaselineFile | null {
  if (!fs.existsSync(BASELINE_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(BASELINE_FILE, "utf-8")) as BaselineFile;
  } catch {
    return null;
  }
}

/**
 * The baseline is only meaningful when its threshold matches the current
 * detector configuration. If they drift, the ratchet would compare a
 * baseline computed at threshold N against scans at threshold M, which
 * silently turns into either a false-pass or a false-fail. Hard-fail
 * with an actionable message instead.
 */
function assertBaselineCompatible(baseline: BaselineFile): void {
  if (baseline.threshold !== DUPLICATION_THRESHOLD) {
    console.error(
      `❌ Baseline threshold mismatch: baseline was generated at threshold ` +
      `${baseline.threshold}, but the detector is configured for ` +
      `${DUPLICATION_THRESHOLD}. Re-snapshot via:\n` +
      `   tsx script/check-magic-numbers.ts --init`,
    );
    process.exit(1);
  }
}

function writeBaseline(dup: DuplicationMap): void {
  const baseline: BaselineFile = {
    generatedAt: new Date().toISOString(),
    threshold: DUPLICATION_THRESHOLD,
    duplications: dup,
  };
  fs.mkdirSync(path.dirname(BASELINE_FILE), { recursive: true });
  fs.writeFileSync(BASELINE_FILE, JSON.stringify(baseline, null, 2) + "\n");
}

function fmtSampleFiles(files: string[], n = 5): string {
  if (files.length <= n) return files.join(", ");
  return `${files.slice(0, n).join(", ")} (+${files.length - n} more)`;
}

function printGuidance(): void {
  console.error("");
  console.error("How to fix:");
  console.error("  1. Pick the value above and decide its meaning (read the");
  console.error("     no-magic-numbers SKILL.md decision tree).");
  console.error("  2. Promote it to a named constant in a shared module —");
  console.error("     usually shared/constants.ts, the relevant calc/ helper,");
  console.error("     or shared/model-constants-registry.ts for");
  console.error("     locality-aware financial values.");
  console.error("  3. Replace EVERY occurrence in EVERY listed file with the");
  console.error("     named import in the same commit.");
  console.error("  4. Re-run `npm run magic:check`. The duplication should");
  console.error("     drop below the threshold and the test should pass.");
  console.error("");
  console.error("If a value is genuinely a unit conversion or universal");
  console.error("constant (12 months, 365 days), add it to");
  console.error("ALLOWED_DUPLICATED_VALUES in script/check-magic-numbers.ts");
  console.error("with a one-line justification — never to silence a real bug.");
  console.error("");
  console.error("After an INTENTIONAL cleanup that legitimately reduces a");
  console.error("baseline entry, re-snapshot:  npm run magic:check -- --init");
}

function main(): void {
  const args = process.argv.slice(2);
  const showAll = args.includes("--show");
  const init = args.includes("--init");
  const strict = args.includes("--strict");

  const current = scanRepo();
  const totalDistinctValues = Object.keys(current).length;
  const totalOccurrences = Object.values(current).reduce(
    (a, b) => a + b.length,
    0,
  );

  if (init) {
    writeBaseline(current);
    console.log(
      `✅ Baseline written: ${totalDistinctValues} duplicated values, ${totalOccurrences} file occurrences.`,
    );
    console.log(`   Path: ${path.relative(REPO_ROOT, BASELINE_FILE)}`);
    process.exit(0);
  }

  if (showAll) {
    console.log(
      `Magic-number cross-file duplications (threshold ≥ ${DUPLICATION_THRESHOLD} distinct files):\n`,
    );
    const sorted = Object.entries(current).sort(
      (a, b) => b[1].length - a[1].length,
    );
    for (const [v, files] of sorted) {
      console.log(`  ${v.padStart(10)}  in ${files.length} files`);
      for (const f of files) console.log(`              ${f}`);
    }
    console.log(
      `\n${totalDistinctValues} distinct values, ${totalOccurrences} occurrences.`,
    );
    process.exit(0);
  }

  if (strict) {
    if (totalDistinctValues === 0) {
      console.log("✅ Strict: no cross-file duplicated literals found.");
      process.exit(0);
    }
    console.error(
      `❌ Strict: ${totalDistinctValues} duplicated values across ${totalOccurrences} file occurrences.\n`,
    );
    for (const [v, files] of Object.entries(current).sort(
      (a, b) => b[1].length - a[1].length,
    )) {
      console.error(`  ${v}  in ${files.length} files: ${fmtSampleFiles(files)}`);
    }
    printGuidance();
    process.exit(1);
  }

  // Default: ratchet against the baseline.
  const baseline = loadBaseline();
  if (!baseline) {
    console.error(
      `❌ No baseline at ${path.relative(REPO_ROOT, BASELINE_FILE)}. Run \`tsx script/check-magic-numbers.ts --init\` once to capture it.`,
    );
    process.exit(1);
  }
  assertBaselineCompatible(baseline);

  const regressions: Array<{ value: string; baselineCount: number; currentCount: number; newFiles: string[] }> = [];
  const brandNew: Array<{ value: string; files: string[] }> = [];

  for (const [v, files] of Object.entries(current)) {
    const prev = baseline.duplications[v];
    if (!prev) {
      brandNew.push({ value: v, files });
      continue;
    }
    // Compare file SETS, not just counts. A file-swap (one baseline file
    // removes the literal, a brand-new file picks it up) leaves the count
    // unchanged but is exactly the cross-file drift the SKILL forbids.
    const prevSet = new Set(prev);
    const newFiles = files.filter((f) => !prevSet.has(f));
    if (newFiles.length > 0) {
      regressions.push({
        value: v,
        baselineCount: prev.length,
        currentCount: files.length,
        newFiles,
      });
    }
  }

  // Improvements (a baseline value that shrank or vanished). Reported
  // for visibility; not an error. If the user wants to lock the gain in,
  // they re-run with --init.
  const improvements: string[] = [];
  for (const [v, prevFiles] of Object.entries(baseline.duplications)) {
    const cur = current[v];
    if (!cur) {
      improvements.push(`  ${v}: ${prevFiles.length} → 0 files (eliminated)`);
    } else if (cur.length < prevFiles.length) {
      improvements.push(
        `  ${v}: ${prevFiles.length} → ${cur.length} files`,
      );
    }
  }

  if (regressions.length === 0 && brandNew.length === 0) {
    console.log(
      `✅ Magic numbers: no new cross-file duplications vs baseline.`,
    );
    console.log(
      `   (${Object.keys(baseline.duplications).length} baseline values, threshold ≥ ${DUPLICATION_THRESHOLD} files)`,
    );
    if (improvements.length) {
      console.log(`\n   Improvements vs baseline (re-init to lock in):`);
      for (const i of improvements.slice(0, 5)) console.log(i);
      if (improvements.length > 5) {
        console.log(`   ... and ${improvements.length - 5} more`);
      }
    }
    process.exit(0);
  }

  console.error(`❌ Magic numbers: regressions vs baseline.\n`);
  if (brandNew.length) {
    console.error(
      `  ${brandNew.length} brand-new value(s) crossed the duplication threshold:`,
    );
    for (const { value, files } of brandNew) {
      console.error(`    ${value}  in ${files.length} files: ${fmtSampleFiles(files)}`);
    }
    console.error("");
  }
  if (regressions.length) {
    console.error(
      `  ${regressions.length} known value(s) appeared in MORE files than baseline:`,
    );
    for (const r of regressions) {
      console.error(
        `    ${r.value}  ${r.baselineCount} → ${r.currentCount} files; new: ${fmtSampleFiles(r.newFiles)}`,
      );
    }
    console.error("");
  }
  printGuidance();
  process.exit(1);
}

main();
