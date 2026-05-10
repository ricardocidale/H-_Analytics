/**
 * check-taxonomy-mirror.ts
 *
 * Guard against silent drift in the Agent Taxonomy canonical definitions,
 * which must stay verbatim-identical in two files:
 *
 *   - CLAUDE.md  § 10 "### Canonical definitions" section (source of truth)
 *   - replit.md  "## Agent Taxonomy" section              (mirror)
 *
 * The four definition paragraphs (**Agent**, **Minion**, **Specialist**,
 * **Swarm**) are extracted from the *scoped section* of each file so that
 * a stray `**Agent** —` line elsewhere in the document cannot produce
 * false positives or negatives. Definitions are compared individually so
 * that error messages pinpoint exactly which term has drifted.
 *
 * Fix when this fails:
 *   1. Treat CLAUDE.md as the source of truth.
 *   2. Copy the drifted definition(s) verbatim into the replit.md
 *      "Agent Taxonomy" section, preserving its surrounding prose.
 *   3. Re-run `pnpm --filter @workspace/scripts run check:taxonomy-mirror`.
 *
 * Note: `replit.md` also says "Do not edit this block here — update CLAUDE.md
 * first, then mirror verbatim." That instruction is now enforced by this check.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { computeInputsHash, tryCacheHit, writeCacheHit } from "./lib/check-cache.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const SOURCE = path.join(REPO_ROOT, "CLAUDE.md");
const MIRROR = path.join(REPO_ROOT, "replit.md");

const TERMS = ["Agent", "Minion", "Specialist", "Swarm"] as const;
type Term = (typeof TERMS)[number];

const CACHE_NAME = "taxonomy-mirror";

export function collectInputFiles(): string[] {
  return [fileURLToPath(import.meta.url), SOURCE, MIRROR];
}

function readOrFail(p: string): string {
  if (!fs.existsSync(p)) {
    console.error(`[check:taxonomy-mirror] Missing file: ${p}`);
    process.exit(1);
  }
  return fs.readFileSync(p, "utf8");
}

/**
 * Slice a markdown file to only the lines that belong to the section whose
 * heading matches `sectionHeading` (exact string, including the `#` prefix).
 *
 * The section ends at the next heading of equal or lesser depth, or at EOF.
 * Returns only the lines *after* the heading line itself.
 */
function sliceSection(lines: string[], sectionHeading: string): string[] {
  const depth = sectionHeading.match(/^#+/)?.[0].length ?? 0;
  const start = lines.findIndex((l) => l.trimEnd() === sectionHeading);
  if (start === -1) return [];

  const result: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i]!;
    const m = line.match(/^(#+)\s/);
    if (m && m[1]!.length <= depth) break;
    result.push(line);
  }
  return result;
}

/**
 * Extract the four canonical definition paragraphs from the scoped section
 * lines of a file.
 *
 * Each definition starts with `**<Term>** —` and may span continuation lines
 * (collected until the next blank line or next bold-term definition).
 */
function extractDefinitions(
  lines: string[],
  sectionHeading: string,
  filePath: string,
): Record<Term, string> {
  const sectionLines = sliceSection(lines, sectionHeading);

  if (sectionLines.length === 0) {
    console.error(
      `[check:taxonomy-mirror] Could not find section "${sectionHeading}" in ${path.relative(REPO_ROOT, filePath)}`,
    );
    process.exit(1);
  }

  const result = {} as Record<Term, string>;

  for (let i = 0; i < sectionLines.length; i++) {
    for (const term of TERMS) {
      if (sectionLines[i]!.startsWith(`**${term}** —`)) {
        const paragraphLines: string[] = [sectionLines[i]!];
        let j = i + 1;
        while (j < sectionLines.length) {
          const next = sectionLines[j]!;
          if (next.trim() === "" || /^\*\*\w/.test(next)) break;
          paragraphLines.push(next);
          j++;
        }
        result[term] = paragraphLines.join("\n").trim();
        break;
      }
    }
  }

  const missing = TERMS.filter((t) => !(t in result));
  if (missing.length > 0) {
    console.error(
      `[check:taxonomy-mirror] Could not find definition(s) for: ${missing.join(", ")}`,
    );
    console.error(
      `  File: ${path.relative(REPO_ROOT, filePath)}, section: "${sectionHeading}"`,
    );
    process.exit(1);
  }

  return result;
}

function main(): void {
  const cacheHash = computeInputsHash({ files: collectInputFiles() });
  if (tryCacheHit(CACHE_NAME, cacheHash)) return;

  const sourceLines = readOrFail(SOURCE).split("\n");
  const mirrorLines = readOrFail(MIRROR).split("\n");

  const sourceDefs = extractDefinitions(sourceLines, "### Canonical definitions", SOURCE);
  const mirrorDefs = extractDefinitions(mirrorLines, "## Agent Taxonomy (verbatim from `CLAUDE.md` § 10)", MIRROR);

  const drifted: Term[] = [];
  for (const term of TERMS) {
    if (sourceDefs[term] !== mirrorDefs[term]) {
      drifted.push(term);
    }
  }

  if (drifted.length === 0) {
    console.log(
      `[check:taxonomy-mirror] OK — all four definitions match between CLAUDE.md and replit.md`,
    );
    writeCacheHit(CACHE_NAME, cacheHash);
    return;
  }

  console.error("[check:taxonomy-mirror] FAIL — taxonomy mirror has drifted from source.");
  console.error("");
  console.error(`  Source: ${path.relative(REPO_ROOT, SOURCE)}  (§ 10 "### Canonical definitions")`);
  console.error(`  Mirror: ${path.relative(REPO_ROOT, MIRROR)}  ("## Agent Taxonomy" section)`);
  console.error("");
  console.error(`  Drifted definitions: ${drifted.join(", ")}`);
  console.error("");

  for (const term of drifted) {
    console.error(`  ── ${term} ──`);
    console.error(`  SOURCE: ${sourceDefs[term]}`);
    console.error(`  MIRROR: ${mirrorDefs[term]}`);
    console.error("");
  }

  console.error("Fix:");
  console.error("  1. Treat CLAUDE.md as the source of truth.");
  console.error(
    "  2. Copy the drifted definition(s) verbatim into the replit.md Agent Taxonomy section.",
  );
  console.error("  3. Re-run: pnpm --filter @workspace/scripts run check:taxonomy-mirror");

  process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
