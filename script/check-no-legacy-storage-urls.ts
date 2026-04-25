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
 *   - script/r2-cutover-reconcile.ts                — the reconciler itself
 *   - script/migrate-graphics-to-neon.ts            — one-off legacy data migration
 *   - server/routes/property-photos.ts              — defensive allow-list for fetch validation
 *
 * To extend: add the new path to ALLOW_LIST below with a justification.
 * Do NOT widen BANNED_PATTERNS to "soften" a legitimate violation —
 * route the write through the relative `/objects/<key>` form instead.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";

const ALLOW_LIST = [
  // Wrapped Replit Object Storage SDK calls.
  "server/replit_integrations/",
  // Legacy provider adapter that knows how to talk to the Replit sidecar.
  "server/providers/storage/replit-storage.ts",
  // The reconciler script that finds-and-rewrites these URLs in Postgres.
  "script/r2-cutover-reconcile.ts",
  // One-off migration script that pulls bytes out of the legacy bucket;
  // its references are in JSDoc/comments describing the legacy shapes.
  "script/migrate-graphics-to-neon.ts",
  // Defensive allow-list for outbound fetches to known image hosts. This
  // is a *read-side* validation, not a write to the database, so it must
  // mention these hosts by name.
  "server/routes/property-photos.ts",
];

// Files that the guardrail itself must not scan (it names the patterns it bans).
const SELF_REFERENCE = "script/check-no-legacy-storage-urls.ts";

// Patterns mirror `REPLIT_HOST_RE` in `script/r2-cutover-reconcile.ts`,
// minus `replit.dev` / `replit.app` themselves — those are already
// caught by `script/check-replit-independence.ts` with a broader rule.
const BANNED_PATTERNS = [
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

function rgFind(pattern: string): Hit[] {
  const res = spawnSync(
    "rg",
    [
      "--no-heading",
      "--with-filename",
      "--line-number",
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
  const hits: Hit[] = [];
  for (const line of res.stdout.split("\n")) {
    if (!line) continue;
    // file:line:content
    const firstColon = line.indexOf(":");
    if (firstColon === -1) continue;
    const secondColon = line.indexOf(":", firstColon + 1);
    if (secondColon === -1) continue;
    const file = line.slice(0, firstColon);
    const lineNo = Number(line.slice(firstColon + 1, secondColon));
    const text = line.slice(secondColon + 1);
    hits.push({ file: path.normalize(file), line: lineNo, text, pattern });
  }
  return hits;
}

function isAllowed(file: string): boolean {
  if (file === SELF_REFERENCE) return true;
  return ALLOW_LIST.some((entry) => {
    if (entry.endsWith("/")) return file.startsWith(entry);
    return file === entry;
  });
}

// Skip lines that only mention the pattern inside a comment. The intent
// of the gate is to catch new *string literals* that get persisted to
// the database — JSDoc and inline comments that describe the legacy
// shapes are fine. Heuristic: a line whose trimmed start is `//`, `*`,
// or `/*` is treated as a comment-only line.
function isCommentOnly(text: string): boolean {
  const trimmed = text.trim();
  return (
    trimmed.startsWith("//") ||
    trimmed.startsWith("*") ||
    trimmed.startsWith("/*")
  );
}

function main(): void {
  const all: Hit[] = [];
  for (const pattern of BANNED_PATTERNS) {
    all.push(...rgFind(pattern));
  }

  const violations = all.filter(
    (h) => !isAllowed(h.file) && !isCommentOnly(h.text),
  );

  if (violations.length === 0) {
    console.log(
      `✅ Legacy storage URLs: 0 violations across ${SEARCH_GLOBS.join(", ")}`,
    );
    console.log(`   (allow-listed: ${ALLOW_LIST.join(", ")})`);
    process.exit(0);
  }

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

main();
