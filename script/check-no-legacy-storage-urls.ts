#!/usr/bin/env tsx
/**
 * check-no-legacy-storage-urls.ts — Legacy Storage URL Guardrail (Task #524)
 *
 * Fails the build if any source file outside the allow-listed locations
 * hard-codes a legacy storage URL host or sidecar bucket path. The
 * pre-deploy storage gate already catches these *after* they've been
 * written to Postgres; this guard catches them at PR time, before the
 * write path ever ships.
 *
 * The patterns mirror `REPLIT_HOST_RE` / `URL_RE` in
 * `script/r2-cutover-reconcile.ts` — the runtime reconciler that
 * rewrites these legacy shapes back to the relative `/objects/<key>`
 * form. If you find yourself wanting to write one of these literals in
 * new code, write the relative `/objects/<key>` form instead.
 *
 * The allow-list is the set of files that legitimately mention these
 * hosts:
 *   - server/replit_integrations/                   — wrapped Replit Object Storage SDK
 *   - server/providers/storage/replit-storage.ts    — the legacy provider adapter
 *   - script/r2-cutover-reconcile.ts                — the reconciler itself (regex literals)
 *   - server/routes/property-photos.ts              — defensive allow-list for fetch validation
 *   - server/lib/canonical-asset-url.ts             — Task #521 detection / canonicalization
 *   - server/ai/asset-intelligence.ts               — Task #521 detection / canonicalization
 *
 * To extend: add the new path to ALLOW_LIST below with a justification.
 * Do NOT widen BANNED_PATTERNS to "soften" a legitimate violation —
 * route the write through the relative `/objects/<key>` form instead.
 *
 * Comment-aware (Task #530): banned literals that appear only inside
 * `//` line comments or `/​* … *​/` block comments are ignored. JSDoc
 * paragraphs that describe the legacy shapes are not violations. The
 * sibling `script/check-replit-independence.ts` shares the same
 * `script/lib/comment-scan.ts` helper.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { findNonCommentMatches } from "./lib/comment-scan.js";

const ALLOW_LIST = [
  // Wrapped Replit Object Storage SDK calls.
  "server/replit_integrations/",
  // Legacy provider adapter that knows how to talk to the Replit sidecar.
  "server/providers/storage/replit-storage.ts",
  // The reconciler script that finds-and-rewrites these URLs in Postgres
  // (the patterns appear in regex literals at runtime, not just comments).
  "script/r2-cutover-reconcile.ts",
  // Task #533 — bespoke one-shot migration that rewrites/neutralises the
  // pre-cutover `/objects/uploads/<uuid>` rows the data-side audit
  // (`script/audit-legacy-storage-urls-in-db.ts`) flagged. Like the
  // reconciler above, the legacy substring appears in SQL filters and
  // log messages by necessity — the script's job is to find that exact
  // shape in the DB and replace it.
  "script/migrate-legacy-uploads-in-db.ts",
  // Defensive allow-list for outbound fetches to known image hosts. This
  // is a *read-side* validation, not a write to the database, so it must
  // mention these hosts by name.
  "server/routes/property-photos.ts",
  // Task #521 — detection + canonicalization of legacy `/objects/uploads/<uuid>`
  // URLs. These files exist *to block* the bad shape, so they must
  // mention it to detect it; they never persist a new one.
  "server/lib/canonical-asset-url.ts",
  "server/ai/asset-intelligence.ts",
  // Task #526 — one-time admin cleanup that finds-and-rewrites legacy
  // `/objects/uploads/<uuid>` rows in the `logos` table. The script and
  // its extracted helper module both have to mention the pattern in
  // SQL `LIKE` literals to do their job; they never write a new one.
  "script/cleanup-legacy-logo-urls.ts",
  "script/lib/legacy-logo-cleanup.ts",
];

// Files that the guardrail itself must not scan (it names the patterns it bans).
const SELF_REFERENCE = "script/check-no-legacy-storage-urls.ts";

// Patterns mirror `REPLIT_HOST_RE` in `script/r2-cutover-reconcile.ts`,
// minus `replit.dev` / `replit.app` themselves — those are already
// caught by `script/check-replit-independence.ts` with a broader rule.
//
// Exported so the data-side audit (`script/audit-legacy-storage-urls-in-db.ts`,
// Task #529) can scan persisted Postgres rows for the same shapes the PR-time
// guard catches in source. Keep the list a single source of truth.
//
// Each entry is a regex fragment that is valid in BOTH ECMAScript regex (used
// by ripgrep + the comment-aware scanner here) and POSIX regex (used by
// Postgres `~` in the audit). The `\.` escape and literal `/` work in both
// flavours; do not introduce constructs that diverge (e.g. `\d`, lookarounds)
// without updating both callers.
export const BANNED_PATTERNS = [
  // GCS-direct sidecar URLs (Replit Object Storage's underlying bucket).
  String.raw`storage\.googleapis\.com`,
  // Replit Object Storage REST host.
  String.raw`objectstorage\.replit\.com`,
  // Legacy `*.repl.co/objects/...` sidecar shape.
  String.raw`repl\.co/objects`,
  // Legacy bucket-relative path: every photo/logo URL of this shape is a
  // legacy write. New writes should use the relative `/objects/<key>`
  // form (no `uploads/` segment).
  String.raw`/objects/uploads/`,
];

const SEARCH_GLOBS = [
  "server",
  "shared",
  "client",
  "script",
];

interface Hit {
  file: string;
  line: number;
  text: string;
  pattern: string;
}

/**
 * Use ripgrep to list files that contain any of the banned patterns.
 * This is just a fast pre-filter; the precise comment-aware check
 * happens per-file in TypeScript below.
 */
function rgListFiles(pattern: string): string[] {
  const res = spawnSync(
    "rg",
    [
      "--files-with-matches",
      "--color=never",
      "-e",
      pattern,
      "--",
      ...SEARCH_GLOBS,
    ],
    { encoding: "utf8" },
  );
  if (res.status !== 0 && res.status !== 1) {
    // 0 = matches found, 1 = no matches, anything else = ripgrep error
    throw new Error(
      `ripgrep failed for pattern ${pattern}: ${res.stderr || res.stdout}`,
    );
  }
  if (!res.stdout) return [];
  return res.stdout
    .split("\n")
    .filter(Boolean)
    .map((f) => path.normalize(f));
}

function isAllowed(file: string): boolean {
  if (file === SELF_REFERENCE) return true;
  return ALLOW_LIST.some((entry) => {
    if (entry.endsWith("/")) return file.startsWith(entry);
    return file === entry;
  });
}

function main(): void {
  // Collect candidate files across all banned patterns.
  const candidates = new Set<string>();
  for (const pattern of BANNED_PATTERNS) {
    for (const f of rgListFiles(pattern)) candidates.add(f);
  }

  const violations: Hit[] = [];
  const sourceCache = new Map<string, string>();
  for (const file of candidates) {
    if (isAllowed(file)) continue;
    let source = sourceCache.get(file);
    if (source === undefined) {
      source = readFileSync(file, "utf8");
      sourceCache.set(file, source);
    }
    for (const pattern of BANNED_PATTERNS) {
      // The fragment is shared with the data-side audit (POSIX-compatible),
      // so we wrap it in a JS RegExp here for the in-process scan.
      const regex = new RegExp(pattern, "g");
      for (const m of findNonCommentMatches(source, regex)) {
        violations.push({ file, line: m.line, text: m.text, pattern });
      }
    }
  }

  if (violations.length === 0) {
    console.log(
      `✅ Legacy storage URLs: 0 violations across ${SEARCH_GLOBS.join(", ")}`,
    );
    console.log(`   (allow-listed: ${ALLOW_LIST.join(", ")})`);
    process.exit(0);
  }

  // Stable ordering so CI logs diff cleanly across runs.
  violations.sort((a, b) =>
    a.file === b.file
      ? a.line === b.line
        ? a.pattern.localeCompare(b.pattern)
        : a.line - b.line
      : a.file.localeCompare(b.file),
  );

  console.error(
    `❌ Legacy storage URLs: ${violations.length} violation(s) outside the allow-list.`,
  );
  console.error(`   Allow-listed locations: ${ALLOW_LIST.join(", ")}`);
  console.error(
    `   To fix: write the relative \`/objects/<key>\` form instead of a full host URL or \`/objects/uploads/<uuid>\` path.\n`,
  );
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  [${v.pattern}]`);
    console.error(`    ${v.text.trim()}`);
  }
  process.exit(1);
}

// Only run when invoked as a script. The `BANNED_PATTERNS` export is also
// imported by `script/audit-legacy-storage-urls-in-db.ts`; we don't want
// `main()` to fire as a side effect of that import.
//
// `import.meta.url` parses to a `file://` URL; `process.argv[1]` is an OS
// path. Resolve `argv[1]` through `pathToFileURL` so the comparison is
// robust on every platform (avoids false negatives when one side has a
// trailing slash, percent-encoded chars, etc.).
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
