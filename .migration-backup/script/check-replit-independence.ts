#!/usr/bin/env tsx
/**
 * check-replit-independence.ts — Replit Independence Guardrail (Task #402)
 *
 * Fails the build if any source file outside the allow-listed locations
 * imports from `@replit/*`, reads `process.env.REPL*`, or hard-codes a
 * `replit.dev` / `replit.app` hostname.
 *
 * The allow-list is the set of files that legitimately couple to Replit:
 *   - server/replit_integrations/   – the wrapped Replit SDK calls
 *   - server/providers/             – the abstraction that forwards to them
 *   - vite.config.ts, vite-plugin-meta-images.ts – build-time Replit plugins
 *
 * To extend: add the new path to ALLOW_LIST below with a justification.
 * Do NOT widen the BANNED_PATTERNS to "soften" a legitimate violation —
 * route the call through `server/providers/` instead.
 *
 * Comment-aware (Task #530): banned literals that appear only inside
 * `//` line comments or `/​* … *​/` block comments are ignored. Sibling
 * guard `script/check-no-legacy-storage-urls.ts` shares the same
 * `script/lib/comment-scan.ts` helper.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { findNonCommentMatches } from "./lib/comment-scan.js";

const ALLOW_LIST = [
  // Provider abstraction and the Replit SDK wrappers it forwards to.
  "server/replit_integrations/",
  "server/providers/",
  // Build-time Replit Vite plugins (cartographer, dev banner, runtime error modal).
  "vite.config.ts",
  "vite-plugin-meta-images.ts",
];

// Files that the guardrail itself must not scan (it names the patterns it bans).
const SELF_REFERENCE = "script/check-replit-independence.ts";

const BANNED_PATTERNS: { name: string; regex: RegExp }[] = [
  // Direct imports of Replit-published packages
  { name: 'from "@replit/"', regex: /from\s+["']@replit\//g },
  { name: 'require("@replit/")', regex: /require\(["']@replit\//g },
  // Replit-injected env vars only (REPL_ID, REPL_SLUG, REPLIT_DOMAINS,
  // REPLIT_DB_URL, REPLIT_DEPLOYMENT, REPLIT_DEV_DOMAIN, …).
  // Tight prefix avoids matching unrelated names like REPLICATE_API_TOKEN.
  {
    name: "process.env.REPL*",
    regex: /process\.env\.(REPL_[A-Z_]+|REPLIT_[A-Z_]+)/g,
  },
  // Hard-coded Replit hostnames
  { name: "replit.dev", regex: /replit\.dev/g },
  { name: "replit.app", regex: /replit\.app/g },
];

const SEARCH_GLOBS = [
  "server",
  "shared",
  "client",
  "engine",
  "calc",
  "tests",
  "script",
  "vite-plugin-meta-images.ts",
  "vite.config.ts",
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
function rgListFiles(pattern: RegExp): string[] {
  const res = spawnSync(
    "rg",
    [
      "--files-with-matches",
      "--color=never",
      "-e",
      pattern.source,
      "--",
      ...SEARCH_GLOBS,
    ],
    { encoding: "utf8" },
  );
  if (res.status !== 0 && res.status !== 1) {
    // 0 = matches found, 1 = no matches, anything else = ripgrep error
    throw new Error(
      `ripgrep failed for pattern ${pattern.source}: ${res.stderr || res.stdout}`,
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
  for (const { regex } of BANNED_PATTERNS) {
    for (const f of rgListFiles(regex)) candidates.add(f);
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
    for (const { name, regex } of BANNED_PATTERNS) {
      for (const m of findNonCommentMatches(source, regex)) {
        violations.push({ file, line: m.line, text: m.text, pattern: name });
      }
    }
  }

  if (violations.length === 0) {
    console.log(
      `✅ Replit independence: 0 violations across ${SEARCH_GLOBS.join(", ")}`,
    );
    console.log(
      `   (allow-listed: ${ALLOW_LIST.join(", ")})`,
    );
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
    `❌ Replit independence: ${violations.length} violation(s) outside the allow-list.`,
  );
  console.error(
    `   Allow-listed locations: ${ALLOW_LIST.join(", ")}`,
  );
  console.error(
    `   To fix: route the call through server/providers/ instead of touching Replit directly.\n`,
  );
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  [${v.pattern}]`);
    console.error(`    ${v.text.trim()}`);
  }
  process.exit(1);
}

main();
