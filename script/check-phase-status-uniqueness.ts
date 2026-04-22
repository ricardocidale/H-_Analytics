#!/usr/bin/env tsx
/**
 * Phase-status uniqueness CI guard.
 *
 * Enforces that `.claude/phases.md` is the single source of truth for live
 * phase-status tables. Any other file that contains a markdown table whose
 * header includes both "Phase" and "Status" columns is a violation.
 *
 * Allowlist:
 *   - .claude/phases.md (the canonical SoT itself)
 *   - docs/architecture/decisions/ADR-*.md (decision artifacts may list
 *     "Implementation phases" without live status tokens — checked
 *     separately by absence of ✅/⏳/🟡/⏸/🟢/❌)
 *
 * Run via: `npm run phases:check`
 *
 * See `.claude/rules/claude-replit-split.md` § Doctrine Freeze Gate +
 * `.claude/phases.md` for context.
 */

import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const SOT_FILE = ".claude/phases.md";

// A markdown header row that has both "Phase" and "Status" cells (any order),
// case-insensitive, separated by pipes. Captures the full header line.
const STATUS_TABLE_HEADER = /^\|.*\bphase\b.*\bstatus\b.*\|$|^\|.*\bstatus\b.*\bphase\b.*\|$/im;

// Live-status tokens — if any of these appear in a Phase|Status table row,
// the table is "live" (vs. ADR historical "Implementation phases" lists).
const LIVE_STATUS_TOKENS = /[✅⏳🟡⏸🟢❌]|\bShipped\b|\bIn progress\b|\bPending\b|\bPaused\b|\bPartial\b/;

function listTrackedMarkdownFiles(): string[] {
  const out = execSync("git ls-files '*.md'", { encoding: "utf8" });
  return out.split("\n").filter((line) => line.length > 0);
}

function isAdrFile(path: string): boolean {
  return /docs\/architecture\/decisions\/ADR-/.test(path);
}

function checkFile(path: string): { violation: boolean; reason?: string } {
  if (path === SOT_FILE) return { violation: false };
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return { violation: false };
  }

  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!STATUS_TABLE_HEADER.test(line)) continue;

    // Found a candidate Phase|Status header. Walk forward until end-of-table
    // (blank line or non-pipe row), collecting body rows.
    const body: string[] = [];
    for (let j = i + 2; j < lines.length; j++) {
      // skip the separator row at i+1
      const row = lines[j];
      if (!row.startsWith("|")) break;
      body.push(row);
    }

    if (body.length === 0) continue;

    // A Phase|Status table is "live" only if at least one body row carries a
    // live-status token. Planning docs (planned phase lists), ADR
    // "Implementation phases" sections, and user checklists with checkbox
    // glyphs (☐) are exempt — only live trackers belong in `.claude/phases.md`.
    const hasLiveTokens = body.some((row) => LIVE_STATUS_TOKENS.test(row));
    if (!hasLiveTokens) continue;
    // (isAdrFile check kept for the future case where an ADR has live tokens
    // — those should still be flagged because they belong in phases.md.)
    void isAdrFile;

    return {
      violation: true,
      reason: `Live phase|status table found at line ${i + 1}. Move live status to ${SOT_FILE} and replace this with a pointer.`,
    };
  }

  return { violation: false };
}

function main() {
  const files = listTrackedMarkdownFiles();
  const violations: { path: string; reason: string }[] = [];

  for (const path of files) {
    const result = checkFile(path);
    if (result.violation && result.reason) {
      violations.push({ path, reason: result.reason });
    }
  }

  if (violations.length === 0) {
    console.log(`✅ phases:check PASS — only ${SOT_FILE} carries a live phase|status table.`);
    process.exit(0);
  }

  console.error(`❌ phases:check FAIL — ${violations.length} file(s) carry a duplicate phase|status table:`);
  for (const v of violations) {
    console.error(`  - ${v.path}: ${v.reason}`);
  }
  console.error(`\nSee .claude/phases.md and .claude/rules/documentation.md § "Phase status changes" for the rule.`);
  process.exit(1);
}

main();
