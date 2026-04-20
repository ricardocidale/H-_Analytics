/**
 * any-prop Detector — proof test enforcing typed component contracts.
 *
 * Flags `any` / `any[]` field types inside React component Props definitions
 * (interfaces/types named `*Props`). Catches the Task #15 contract drift
 * pattern: `PropertyFeeSummaryTable` took `properties: any[]` and rendered
 * an `isActive` badge off a field the actual type didn't have — the `any[]`
 * typing hid the mismatch from TS.
 *
 * Suggested in `.claude/rules/cross-check-invariants.md` §"Pattern 1 —
 * Contract drift via `any`".
 *
 * Scope:
 * - Scan: `client/src/**\/*.{ts,tsx}` component definitions
 * - Match: `interface *Props { ... }` and `type *Props = { ... }` bodies
 * - Flag: any `: any` or `: any[]` inside those bodies
 *
 * Exemption:
 * - `// @allow-any-prop: <reason>` comment on the same line or the line above
 *   the offending field
 *
 * Baseline:
 * - `BASELINE_KNOWN_ANY_PROPS` documents current violations at time of
 *   landing. Drive this toward [] in follow-up cleanup. Each entry is a
 *   contract bug waiting to happen.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "../..");
const SCAN_DIR = "client/src";

/**
 * Baseline of known `any`-typed props at time this test was added
 * (2026-04-20). Each entry is `<file>:<line>` of a `*Props` field using
 * `any` or `any[]`. Drive toward [] by replacing the `any` with a specific
 * type (preferred) or adding `// @allow-any-prop: <reason>` on the same
 * line (last resort).
 */
const BASELINE_KNOWN_ANY_PROPS: string[] = [
  // High-level portfolio/investment components — properties/global typed any
  "client/src/components/InvestmentAnalysis.tsx:37",
  "client/src/components/InvestmentAnalysis.tsx:38",
  "client/src/components/InvestmentAnalysis.tsx:42",

  // Company-research tab content payloads — untyped LLM output shapes
  "client/src/components/company-research/CompetitiveLandscapeTab.tsx:13",
  "client/src/components/company-research/OverheadBenchmarksTab.tsx:13",
  "client/src/components/company-research/PartnerCompTab.tsx:12",
  "client/src/components/company-research/ServiceRevenueTab.tsx:27",
  "client/src/components/company-research/VendorCostsTab.tsx:26",

  // Company components — properties/global typed any (the Phase 4 #15 pattern)
  "client/src/components/company/CompanyBenchmarkPanel.tsx:22",
  "client/src/components/company/income-helpers.tsx:9",
  "client/src/components/company/income-helpers.tsx:10",
  "client/src/components/company/types.ts:48",
  "client/src/components/company/types.ts:49",
  "client/src/components/company/types.ts:63",
  "client/src/components/company/types.ts:75",
  "client/src/components/company/types.ts:76",

  // Investment analysis components — properties/global typed any
  "client/src/components/investment/DCFAnalysis.tsx:13",
  "client/src/components/investment/DCFAnalysis.tsx:17",
  "client/src/components/investment/FCFAnalysisTable.tsx:10",
  "client/src/components/investment/PropertyIRRTable.tsx:8",

  // Property detail / edit
  "client/src/components/property-detail/BenchmarkPanel.tsx:25",
  "client/src/components/property-detail/InvestmentReturnsTab.tsx:9",
  "client/src/components/property-detail/InvestmentReturnsTab.tsx:10",
  "client/src/components/property-edit/types.ts:26",
  "client/src/components/property-edit/types.ts:29",

  // ICP tabs
  "client/src/pages/icp/IcpDataSourcesTab.tsx:8",
  "client/src/pages/icp/IcpMarketContextTab.tsx:7",
  "client/src/pages/icp/IcpMarketContextTab.tsx:8",
];

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
      if (entry.name.endsWith(".test.ts") || entry.name.endsWith(".test.tsx")) continue;
      if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
        out.push(p);
      }
    }
  }
  return out;
}

// -- Brace-balanced block extraction ----------------------------------------

/**
 * Given a source string and the index of the opening `{`, return the index
 * of the matching closing `}` (exclusive). Ignores braces inside strings and
 * template literals. Returns -1 if unbalanced.
 */
function findMatchingBrace(src: string, openIdx: number): number {
  let depth = 0;
  let i = openIdx;
  while (i < src.length) {
    const c = src[i];
    // Skip string / template literals
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      i++;
      while (i < src.length && src[i] !== quote) {
        if (src[i] === "\\") i += 2;
        else i++;
      }
      i++;
      continue;
    }
    // Skip line comments
    if (c === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    // Skip block comments
    if (c === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < src.length - 1 && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return -1;
}

// -- Props body extraction --------------------------------------------------

interface PropsBlock {
  name: string;
  bodyStart: number; // offset in file of opening `{`
  bodyEnd: number; // offset of closing `}`
}

/** Find every `interface XxxxProps { ... }` and `type XxxxProps = { ... }` block. */
function findPropsBlocks(src: string): PropsBlock[] {
  const blocks: PropsBlock[] = [];

  // interface XxxxProps [extends ...] {
  for (const m of src.matchAll(/\binterface\s+(\w*Props)\b[^{]*?\{/g)) {
    const openIdx = m.index! + m[0].length - 1;
    const closeIdx = findMatchingBrace(src, openIdx);
    if (closeIdx > 0) {
      blocks.push({ name: m[1], bodyStart: openIdx + 1, bodyEnd: closeIdx });
    }
  }

  // type XxxxProps = { ... }
  // Match the first `{` after the `=`. Handles multi-line definitions.
  for (const m of src.matchAll(/\btype\s+(\w*Props)\s*=\s*\{/g)) {
    const openIdx = m.index! + m[0].length - 1;
    const closeIdx = findMatchingBrace(src, openIdx);
    if (closeIdx > 0) {
      blocks.push({ name: m[1], bodyStart: openIdx + 1, bodyEnd: closeIdx });
    }
  }

  return blocks;
}

// -- any-type detection inside a props block --------------------------------

interface AnyPropHit {
  file: string;
  line: number;
  propsName: string;
  context: string;
}

const ANY_FIELD_REGEX = /^[ \t]*(\w+)[?]?\s*:\s*any(\[\])?\b/;

function scanPropsBlockForAny(
  file: string,
  src: string,
  block: PropsBlock
): AnyPropHit[] {
  const hits: AnyPropHit[] = [];
  const body = src.slice(block.bodyStart, block.bodyEnd);
  const bodyStartLine = (src.slice(0, block.bodyStart).match(/\n/g) || []).length + 1;

  const lines = body.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(ANY_FIELD_REGEX);
    if (!match) continue;

    // Exemption: `// @allow-any-prop` on same or previous line
    if (/@allow-any-prop\b/.test(line)) continue;
    if (i > 0 && /@allow-any-prop\b/.test(lines[i - 1])) continue;

    hits.push({
      file,
      line: bodyStartLine + i,
      propsName: block.name,
      context: line.trim(),
    });
  }
  return hits;
}

// -- Test --------------------------------------------------------------------

describe("any-prop — no `any` types in component Props contracts", () => {
  const files = listSourceFiles(SCAN_DIR);
  const currentHits: AnyPropHit[] = [];

  for (const file of files) {
    let src: string;
    try {
      src = readFileSync(join(ROOT, file), "utf-8");
    } catch {
      continue;
    }
    const blocks = findPropsBlocks(src);
    for (const block of blocks) {
      currentHits.push(...scanPropsBlockForAny(file, src, block));
    }
  }

  // Sort for deterministic output
  currentHits.sort((a, b) =>
    a.file !== b.file ? a.file.localeCompare(b.file) : a.line - b.line
  );

  const currentHitKeys = currentHits.map((h) => `${h.file}:${h.line}`);

  it("no NEW any-typed props beyond the documented baseline", () => {
    const baseline = new Set(BASELINE_KNOWN_ANY_PROPS);
    const newHits = currentHits.filter((h) => !baseline.has(`${h.file}:${h.line}`));

    const diag = newHits
      .map((h) => `  ${h.file}:${h.line}  (${h.propsName})  ${h.context}`)
      .join("\n");

    expect(
      newHits,
      `Found ${newHits.length} NEW any-typed prop(s) beyond baseline. Each is ` +
        `a contract drift risk (parent can pass the wrong shape; TS will not ` +
        `flag it). Replace with a specific type, or add \`// @allow-any-prop: ` +
        `<reason>\` on the field's line, or append the new entry to ` +
        `BASELINE_KNOWN_ANY_PROPS with justification.\n\n${diag}`
    ).toEqual([]);
  });

  it("baseline contains no stale entries (each listed position is still `any`)", () => {
    const currentSet = new Set(currentHitKeys);
    const stale = BASELINE_KNOWN_ANY_PROPS.filter((k) => !currentSet.has(k));

    expect(
      stale,
      `The following baseline entries are no longer \`any\` (fixed, deleted, ` +
        `or line-shifted) — remove or update them in BASELINE_KNOWN_ANY_PROPS:\n  ` +
        stale.join("\n  ")
    ).toEqual([]);
  });
});
