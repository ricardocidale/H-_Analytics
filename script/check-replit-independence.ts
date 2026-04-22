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
 */
import { spawnSync } from "node:child_process";
import path from "node:path";

const ALLOW_LIST = [
  // Provider abstraction and the Replit SDK wrappers it forwards to.
  "server/replit_integrations/",
  "server/providers/",
  // Build-time Replit Vite plugins (cartographer, dev banner, runtime error modal).
  "vite.config.ts",
  "vite-plugin-meta-images.ts",
  // CSP frame-ancestors lists `*.replit.dev` / `*.replit.app` so the app
  // can be embedded inside the Replit IDE preview pane.
  "server/index.ts",
  // Linear bridge uses Replit Connectors SDK for OAuth credential exchange;
  // route through `server/providers/` if/when this gets ported.
  "server/integrations/linear.ts",
  // One-off backfill / image-render scripts that hit the running app over its
  // public Replit URL. Not part of the runtime hot path.
  "server/scripts/",
  // The guardrail itself names the patterns it bans.
  "script/check-replit-independence.ts",
];

const BANNED_PATTERNS = [
  // Direct imports of Replit-published packages
  String.raw`from\s+["']@replit/`,
  String.raw`require\(["']@replit/`,
  // Replit-injected env vars only (REPL_ID, REPL_SLUG, REPLIT_DOMAINS,
  // REPLIT_DB_URL, REPLIT_DEPLOYMENT, REPLIT_DEV_DOMAIN, …).
  // Tight prefix avoids matching unrelated names like REPLICATE_API_TOKEN.
  String.raw`process\.env\.(REPL_[A-Z_]+|REPLIT_[A-Z_]+)`,
  // Hard-coded Replit hostnames
  String.raw`replit\.dev`,
  String.raw`replit\.app`,
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
  return ALLOW_LIST.some((entry) => {
    if (entry.endsWith("/")) return file.startsWith(entry);
    return file === entry;
  });
}

function main(): void {
  const all: Hit[] = [];
  for (const pattern of BANNED_PATTERNS) {
    all.push(...rgFind(pattern));
  }

  const violations = all.filter((h) => !isAllowed(h.file));

  if (violations.length === 0) {
    console.log(
      `✅ Replit independence: 0 violations across ${SEARCH_GLOBS.join(", ")}`,
    );
    console.log(
      `   (allow-listed: ${ALLOW_LIST.join(", ")})`,
    );
    process.exit(0);
  }

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
