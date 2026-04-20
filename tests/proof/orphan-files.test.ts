/**
 * Orphan-File Detector — proof test enforcing "every file reaches production."
 *
 * Flags .ts/.tsx files in candidate scope that are not imported by any
 * source file in the repo. Catches the pattern that cost us the 19-file
 * `server/ai/kb/` orphan directory (Phase 5B cleanup).
 *
 * Suggested in `.claude/rules/cross-check-invariants.md` §"Pattern 2 —
 * Half-finished implementations" and in `testing-strategy.md` §"Dead Code
 * Detection".
 *
 * Scope:
 * - Candidate (flagged if orphan): calc/, engine/, domain/, statements/,
 *   analytics/, shared/, server/
 * - Importer (counts as "used"): all .ts/.tsx source files (candidate
 *   scope + client/src/ + tests/ + script/)
 *
 * Exemptions — a file is NOT flagged if:
 * 1. It's a known entry point (server/index.ts, migrations, etc.)
 * 2. Its path matches an allow-list pattern (barrel files, config files)
 * 3. It contains a `// UNWIRED` annotation at the top
 *
 * If a new orphan is legitimate (intentionally-pending implementation),
 * add `// UNWIRED — blocking on: <reason>` at the top of the file per
 * the testing-strategy rule, OR add it to ALLOW_LIST below with a comment.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join, dirname, resolve } from "path";

const ROOT = join(__dirname, "../..");

// tsconfig.json `paths` aliases. Keep in sync with tsconfig.
const ALIAS_MAP: Record<string, string> = {
  "@/": "client/src/",
  "@shared/": "shared/",
  "@calc/": "calc/",
  "@domain/": "domain/",
  "@engine/": "engine/",
  "@statements/": "statements/",
  "@analytics/": "analytics/",
};

// Directories whose files are candidates for orphan flagging.
const CANDIDATE_DIRS = [
  "calc",
  "engine",
  "domain",
  "statements",
  "analytics",
  "shared",
  "server",
];

// Directories scanned for imports (a file imported by any of these counts as "used").
// Must be a SUPERSET of CANDIDATE_DIRS.
const IMPORTER_DIRS = [
  "calc",
  "engine",
  "domain",
  "statements",
  "analytics",
  "shared",
  "server",
  "client/src",
  "tests",
  "script",
];

// Path patterns that are exempt — these files are allowed to have no importers.
const EXEMPT_PATTERNS: RegExp[] = [
  // Server entry points
  /^server\/index\.ts$/,
  /^server\/vite\.ts$/,

  // Migration files — run via drizzle-kit or startup hook, not imported
  /^server\/migrations\//,
  /^server\/startup-migrations\.ts$/,

  // Database seed script — invoked via npm run seed
  /^server\/seed\.ts$/,

  // Auto-run scripts (standalone)
  /^server\/scripts?\//,

  // Build-time configs — consumed by tooling, not TS imports
  /\.config\.ts$/,
  /\.config\.tsx$/,

  // Shared schema drizzle files — drizzle-kit reads them by convention,
  // even if not all are re-exported through an index.
  /^shared\/schema\/[^/]+\.ts$/,

  // Vitest setup / test helpers run by vitest config, not imported
  /^tests?\//, // (defensive — candidate scope already excludes this)
];

/**
 * Baseline of known orphans at time this test was added (2026-04-20).
 *
 * Each entry is a real orphan — zero production imports. Listed here so
 * the detector can enforce "no NEW orphans" without first requiring a
 * cleanup sweep. Drive this list toward [] in follow-up audits. When
 * removing an entry, either delete the file or wire it up.
 *
 * Categories (for cleanup triage):
 * - BARREL: re-export `index.ts` with no current consumer. Low cost to leave.
 *   Delete if you prefer explicit imports; keep if you're about to add a
 *   consumer.
 * - SHIM: thin re-export wrapper around another module. Delete if no longer
 *   needed or wire up its consumers to the underlying module directly.
 * - UNWIRED: feature module that was built but never consumed. Either wire
 *   it up, or delete it per `.claude/rules/cross-check-invariants.md`
 *   §"Pattern 2 — Half-finished implementations".
 */
const BASELINE_KNOWN_ORPHANS = new Set<string>([
  // All 29 original baseline entries resolved 2026-04-20:
  // - 6 concrete entries deleted (server/utils/batch.ts shim + its now-dead
  //   target server/replit_integrations/batch/, 4 UNWIRED modules, and the
  //   duplicate shared/chat.ts schema).
  // - 23 barrel `index.ts` files deleted after verifying each had zero
  //   importers (consumers went direct to the concrete sibling files).
  //
  // Going forward: any orphan flagged is a real find. Either wire it up,
  // delete it, or annotate with `// UNWIRED — blocking on: <reason>`.
]);

// -- File enumeration --------------------------------------------------------

function listSourceFiles(dir: string): string[] {
  const full = join(ROOT, dir);
  if (!existsSync(full)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(full, { withFileTypes: true })) {
    const p = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      out.push(...listSourceFiles(p));
    } else if (entry.isFile()) {
      if (entry.name.endsWith(".d.ts")) continue;
      if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
        out.push(p);
      }
    }
  }
  return out;
}

// Normalize a path: collapse ../ and ./ segments, produce repo-relative posix.
function normalize(p: string): string {
  const abs = resolve(ROOT, p);
  let rel = abs.slice(ROOT.length);
  if (rel.startsWith("/") || rel.startsWith("\\")) rel = rel.slice(1);
  return rel.replace(/\\/g, "/");
}

// Given a file and an import specifier, resolve to a repo-relative source file
// (or null if the import targets an npm package / can't be resolved).
function resolveImport(fromFile: string, spec: string): string | null {
  let base: string | null = null;

  if (spec.startsWith(".")) {
    base = join(dirname(fromFile), spec);
  } else {
    for (const [alias, target] of Object.entries(ALIAS_MAP)) {
      if (spec === alias.slice(0, -1) || spec.startsWith(alias)) {
        base = target + spec.slice(alias.length);
        break;
      }
    }
  }

  if (!base) return null;

  base = normalize(base);

  // ESM TypeScript convention: imports use `.js` / `.jsx` extension even though
  // the source file is `.ts` / `.tsx`. Strip the extension and try TS first.
  const stripped = base.replace(/\.(js|jsx|mjs|cjs)$/, "");

  const candidates = [
    base,                  // bare — file may literally exist (.ts included)
    `${stripped}.ts`,
    `${stripped}.tsx`,
    `${stripped}/index.ts`,
    `${stripped}/index.tsx`,
  ];
  for (const c of candidates) {
    if (existsSync(join(ROOT, c))) {
      // Reject directories that happen to match the bare path
      try {
        readdirSync(join(ROOT, c));
        continue; // it's a directory
      } catch {
        return c; // it's a file
      }
    }
  }
  return null;
}

// Extract every import specifier from a file's source.
function extractImports(src: string): string[] {
  const out: string[] = [];
  // `import ... from "path"` and `export ... from "path"`
  for (const m of src.matchAll(
    /\b(?:import|export)\b[^'"`;]*?\bfrom\s+["']([^"']+)["']/g
  )) {
    out.push(m[1]);
  }
  // Side-effect import: `import "path"`
  for (const m of src.matchAll(/\bimport\s+["']([^"']+)["']/g)) {
    out.push(m[1]);
  }
  // Dynamic import: `import("path")`
  for (const m of src.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) {
    out.push(m[1]);
  }
  // require("path") — rare but possible
  for (const m of src.matchAll(/\brequire\s*\(\s*["']([^"']+)["']\s*\)/g)) {
    out.push(m[1]);
  }
  return out;
}

function hasUnwiredAnnotation(src: string): boolean {
  // Look at the first 500 chars for `// UNWIRED` or `/* UNWIRED`
  const head = src.slice(0, 500);
  return /\/\/\s*UNWIRED\b/i.test(head) || /\/\*\s*UNWIRED\b/i.test(head);
}

function isExempt(file: string): boolean {
  return EXEMPT_PATTERNS.some((re) => re.test(file));
}

// -- Test --------------------------------------------------------------------

describe("Orphan Files — every candidate file must be imported", () => {
  // Enumerate candidate files
  const candidateFiles = new Set<string>();
  for (const dir of CANDIDATE_DIRS) {
    for (const f of listSourceFiles(dir)) {
      if (f.endsWith(".test.ts") || f.endsWith(".test.tsx")) continue;
      candidateFiles.add(f);
    }
  }

  // Enumerate all importer files (superset)
  const importerFiles = new Set<string>();
  for (const dir of IMPORTER_DIRS) {
    for (const f of listSourceFiles(dir)) {
      importerFiles.add(f);
    }
  }

  // Build importedBy set by scanning every importer file once
  const importedBy = new Map<string, Set<string>>();
  for (const importer of importerFiles) {
    let src: string;
    try {
      src = readFileSync(join(ROOT, importer), "utf-8");
    } catch {
      continue;
    }
    for (const spec of extractImports(src)) {
      const target = resolveImport(importer, spec);
      if (target && candidateFiles.has(target)) {
        if (!importedBy.has(target)) importedBy.set(target, new Set());
        importedBy.get(target)!.add(importer);
      }
    }
  }

  // Compute the current orphan set once for both tests
  const currentOrphans: string[] = [];
  for (const file of candidateFiles) {
    if (isExempt(file)) continue;

    const referrers = importedBy.get(file);
    if (referrers && referrers.size > 0) continue;

    // `// UNWIRED` annotation at top = legitimate pending work
    try {
      const src = readFileSync(join(ROOT, file), "utf-8");
      if (hasUnwiredAnnotation(src)) continue;
    } catch {
      continue;
    }

    currentOrphans.push(file);
  }
  currentOrphans.sort();

  it("no NEW orphan files beyond the documented baseline", () => {
    const newOrphans = currentOrphans.filter(
      (f) => !BASELINE_KNOWN_ORPHANS.has(f)
    );

    expect(
      newOrphans,
      `Found ${newOrphans.length} orphan file(s) beyond the documented baseline. ` +
        `Either wire each into a production code path, delete it, annotate with ` +
        `\`// UNWIRED — blocking on: <reason>\` at the top, or add to ` +
        `BASELINE_KNOWN_ORPHANS in this test with a category comment.\n\n` +
        `New orphans:\n  ${newOrphans.join("\n  ")}`
    ).toEqual([]);
  });

  it("baseline contains no stale entries (each listed file is still an orphan)", () => {
    const staleEntries = [...BASELINE_KNOWN_ORPHANS].filter(
      (f) => !currentOrphans.includes(f)
    );

    expect(
      staleEntries,
      `The following baseline entries are no longer orphans ` +
        `(either wired up or deleted) — remove them from BASELINE_KNOWN_ORPHANS ` +
        `in this test:\n  ${staleEntries.join("\n  ")}`
    ).toEqual([]);
  });
});
