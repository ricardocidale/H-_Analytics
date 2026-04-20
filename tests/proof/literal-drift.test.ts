/**
 * Literal-Drift Detector — proof test catching duplicated magic values.
 *
 * Flags YYYY-MM-DD date string literals that appear in 2+ source files
 * outside `shared/constants.ts`. These are drift candidates — every one
 * should either come from a named `DEFAULT_*` constant (preferred) or be
 * explicitly allow-listed as a per-row-specific literal (e.g., a seed row
 * for a specific property whose real acquisition date happens to match).
 *
 * Catches the drift clusters D-1 (`"2026-06-01"` scattered across 7+ files
 * before Phase 5C) and D-1-B (capital raise dates) documented in the
 * April 18 audit.
 *
 * Suggested in `.claude/rules/cross-check-invariants.md` §"Enforcement via
 * proof tests — suggested additions".
 *
 * Scope:
 * - Scan: client/src, server, shared, calc, engine, domain, statements, analytics
 * - Exclude: shared/constants.ts (source of truth), tests/, node_modules, .d.ts
 * - Match: `"YYYY-MM-DD"` or `'YYYY-MM-DD'` string literals
 *
 * Exemption:
 * - `// @allow-literal-date: <reason>` on same line or prior line
 * - BASELINE_KNOWN_DATE_DRIFT list
 *
 * Scope is intentionally narrow for v1. Can be extended to decimal rates
 * (capRate, ltv, etc.) in a future pass.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "../..");

const SCAN_DIRS = [
  "client/src",
  "server",
  "shared",
  "calc",
  "engine",
  "domain",
  "statements",
  "analytics",
];

// File-level exemptions — these files are the source of truth / intentional
// literal-bearers and must not be flagged.
const EXEMPT_FILE_PATTERNS: RegExp[] = [
  // Source-of-truth constants files (named literals live here)
  /^shared\/constants\.ts$/,
  /^client\/src\/lib\/constants\.ts$/,

  // Per-country / citation tables — intentional literal tables
  /^shared\/countryDefaults\.ts$/,
  /^shared\/citations\.ts$/,

  // Seed files are by definition collections of literal fixture data.
  // Per-property acquisition and operations dates are genuinely per-row;
  // shared defaults already import from shared/constants.ts (enforced by
  // the `DEFAULT_MODEL_START_DATE` migration of 2026-04-20).
  /^server\/seeds\//,

  // Zustand store with INITIAL_PROPERTIES mirrors the server-side seed data.
  // Per-property acquisition/operations dates are intentional per-row values.
  // Known follow-up: the client/server seed data duplication itself is drift
  // (same properties defined in both store.ts and server/seeds/property-data.ts);
  // resolving it is out of scope for this detector — covered separately in a
  // future audit pass.
  /^client\/src\/lib\/store\.ts$/,

  // Tests and migrations are intentionally point-in-time
  /\.test\.ts$/,
  /\.test\.tsx$/,
  /^tests?\//,
  /^server\/migrations\//,
];

/**
 * Per-file-and-line exemptions. Use when a literal date is genuinely
 * row-specific and does NOT represent a default (e.g., a seed row for
 * a specific property with its own acquisition date).
 *
 * Drive this list toward [] — every new entry needs an inline
 * `// @allow-literal-date: <reason>` comment as the canonical justification;
 * this array is the baseline snapshot at time of landing.
 */
const BASELINE_KNOWN_DATE_DRIFT: string[] = [
  // Baseline emptied 2026-04-20:
  // - 4 DEFAULT_MODEL_START_DATE sites resolved by promoting constant to
  //   shared/constants.ts (commit 00f26d8e).
  // - 17 per-property seed-date sites resolved by exempting seed files
  //   (server/seeds/ + client/src/lib/store.ts) as intentional fixtures
  //   at the file-pattern level rather than per-line.
  //
  // Any future flagged date is a real find: two or more files duplicating
  // the same YYYY-MM-DD literal outside exempted locations.
];

// -- Pattern -----------------------------------------------------------------

// Match YYYY-MM-DD inside single-quoted or double-quoted string. Require
// 2020-2099 to avoid ripping into random UUIDs or hex-like content.
const DATE_LITERAL_RE = /["'](20[2-9][0-9]-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01]))["']/g;

// -- File enumeration --------------------------------------------------------

function listSourceFiles(dir: string, out: string[] = []): string[] {
  const full = join(ROOT, dir);
  if (!existsSync(full)) return out;
  for (const entry of readdirSync(full, { withFileTypes: true })) {
    const p = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      listSourceFiles(p, out);
    } else if (entry.isFile()) {
      if (entry.name.endsWith(".d.ts")) continue;
      if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
        out.push(p);
      }
    }
  }
  return out;
}

function isExempt(file: string): boolean {
  return EXEMPT_FILE_PATTERNS.some((re) => re.test(file));
}

// -- Detection --------------------------------------------------------------

interface DateHit {
  file: string;
  line: number;
  date: string;
  lineText: string;
}

function scanFile(file: string, src: string): DateHit[] {
  const hits: DateHit[] = [];
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Inline exemption
    if (/@allow-literal-date\b/.test(line)) continue;
    if (i > 0 && /@allow-literal-date\b/.test(lines[i - 1])) continue;
    // Skip comment-only lines (pure `// ...`)
    if (/^\s*(?:\/\/|\*)/.test(line)) continue;

    DATE_LITERAL_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = DATE_LITERAL_RE.exec(line)) !== null) {
      hits.push({
        file,
        line: i + 1,
        date: m[1],
        lineText: line.trim(),
      });
    }
  }
  return hits;
}

// -- Test --------------------------------------------------------------------

describe("Literal Drift — duplicate YYYY-MM-DD dates across source files", () => {
  // Collect all date-literal hits across non-exempt files
  const allHits: DateHit[] = [];
  for (const dir of SCAN_DIRS) {
    for (const file of listSourceFiles(dir)) {
      if (isExempt(file)) continue;
      let src: string;
      try {
        src = readFileSync(join(ROOT, file), "utf-8");
      } catch {
        continue;
      }
      allHits.push(...scanFile(file, src));
    }
  }

  // Group by date value — which dates appear in 2+ distinct files?
  const fileByDate = new Map<string, Set<string>>();
  for (const h of allHits) {
    if (!fileByDate.has(h.date)) fileByDate.set(h.date, new Set());
    fileByDate.get(h.date)!.add(h.file);
  }

  // Flag hits whose date appears in 2+ files AND aren't in baseline
  const currentDrift = allHits
    .filter((h) => (fileByDate.get(h.date)?.size ?? 0) >= 2)
    .sort((a, b) =>
      a.date !== b.date
        ? a.date.localeCompare(b.date)
        : a.file !== b.file
          ? a.file.localeCompare(b.file)
          : a.line - b.line
    );

  const currentDriftKeys = currentDrift.map((h) => `${h.file}:${h.line}:${h.date}`);

  it("no NEW duplicated date literals beyond the documented baseline", () => {
    const baseline = new Set(BASELINE_KNOWN_DATE_DRIFT);
    const newDrift = currentDrift.filter(
      (h) => !baseline.has(`${h.file}:${h.line}:${h.date}`)
    );

    const groups = new Map<string, DateHit[]>();
    for (const h of newDrift) {
      if (!groups.has(h.date)) groups.set(h.date, []);
      groups.get(h.date)!.push(h);
    }

    const diag = [...groups.entries()]
      .map(
        ([date, hits]) =>
          `  "${date}" appears in ${hits.length} location(s):\n` +
          hits.map((h) => `    ${h.file}:${h.line}  ${h.lineText}`).join("\n")
      )
      .join("\n");

    expect(
      newDrift,
      `Found ${newDrift.length} NEW duplicated date literal(s) beyond baseline. ` +
        `Replace with an import from \`shared/constants.ts\` (preferred), ` +
        `or add \`// @allow-literal-date: <reason>\` on the line if the ` +
        `literal is genuinely row-specific, or append to ` +
        `BASELINE_KNOWN_DATE_DRIFT with justification.\n\n${diag}`
    ).toEqual([]);
  });

  it("baseline contains no stale entries (each listed position still drifts)", () => {
    const currentSet = new Set(currentDriftKeys);
    const stale = BASELINE_KNOWN_DATE_DRIFT.filter((k) => !currentSet.has(k));

    expect(
      stale,
      `The following baseline entries no longer drift (fixed, deleted, or ` +
        `no longer duplicated) — remove from BASELINE_KNOWN_DATE_DRIFT:\n  ` +
        stale.join("\n  ")
    ).toEqual([]);
  });
});
