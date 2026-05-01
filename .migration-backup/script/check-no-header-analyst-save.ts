#!/usr/bin/env tsx
/**
 * check-no-header-analyst-save.ts
 *
 * Guard rail for the v2 CompanyAssumptions layout (April 2026 refactor).
 *
 * The Analyst and Save buttons live INSIDE the tab strip (CurrentThemeTab's
 * `rightContent`) so they can be scoped to the active tab. Putting them back
 * in the page's `PageHeader` / `actions` slot would re-introduce the bug
 * where Save would write all dirty fields across every tab — silently
 * undoing per-tab gating. This script fails CI if `<AnalystButton>` or
 * `<SaveButton>` re-appears inside the `actions` prop of the PageHeader on
 * CompanyAssumptions.tsx.
 *
 * Exit code 0 = clean, 1 = violation found.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve("client/src/pages/CompanyAssumptions.tsx");
const src = readFileSync(FILE, "utf8");

// Find the PageHeader element and its `actions` prop block. We look for the
// `<PageHeader` opening tag, then scan until we find either `actions={` or
// the closing `/>` / `>`.
const pageHeaderIdx = src.indexOf("<PageHeader");
if (pageHeaderIdx < 0) {
  console.log("✓ No <PageHeader> found — nothing to guard.");
  process.exit(0);
}

// Crude but adequate: look for `actions={...}` block, balanced braces.
const actionsKey = "actions={";
const actionsIdx = src.indexOf(actionsKey, pageHeaderIdx);
if (actionsIdx < 0) {
  console.log("✓ <PageHeader> has no `actions` prop — nothing to guard.");
  process.exit(0);
}

let depth = 1;
let i = actionsIdx + actionsKey.length;
while (i < src.length && depth > 0) {
  const ch = src[i];
  if (ch === "{") depth++;
  else if (ch === "}") depth--;
  i++;
}
const actionsBlock = src.slice(actionsIdx + actionsKey.length, i - 1);

const banned = ["AnalystButton", "SaveButton"];
const violations = banned.filter((name) =>
  new RegExp(`<${name}\\b`).test(actionsBlock),
);

if (violations.length > 0) {
  console.error(
    `✗ Header guard FAILED: ${violations.join(", ")} found inside ` +
      `<PageHeader actions={...}> on CompanyAssumptions.tsx.\n` +
      `  These belong inside CurrentThemeTab's rightContent so they stay\n` +
      `  scoped to the active tab. See ARCHITECTURE.md §1a (v2 strip pattern).`,
  );
  process.exit(1);
}

console.log("✓ No header-level AnalystButton / SaveButton on CompanyAssumptions.");
