#!/usr/bin/env tsx
/**
 * check-deprecated-constants.ts — Deprecated-Constant Import Guardrail (Task #407)
 *
 * Four constants in `shared/constants.ts` are `@deprecated` in favour of the
 * locality-aware `getFactoryNumber(...)` lookup against `MODEL_CONSTANTS_REGISTRY`:
 *
 *   - DEPRECIATION_YEARS                 → getFactoryNumber('depreciationYears', country, state)
 *   - DAYS_PER_MONTH                     → getFactoryNumber('daysPerMonth')
 *   - DEFAULT_PROPERTY_INFLATION_RATE    → getFactoryNumber('inflationRate', country, state)
 *   - DEFAULT_COMPANY_INFLATION_RATE     → getFactoryNumber('inflationRate', country, state)
 *
 * Audit #406 (Task #405) reconciliation: two further legacy fallbacks
 * (`DEFAULT_COMPANY_TAX_RATE` and `DEFAULT_COST_RATE_TAXES`) used to live
 * here too, with values that diverged from the registry baselines (0.30 vs
 * 0.21 federal corporate, and 0.03 vs 0.012 US property tax). They were
 * deleted from `shared/constants.ts` and every call site now resolves
 * exclusively through `getFactoryNumber('taxRate' | 'costRateTaxes', …)`.
 * The decision to NOT introduce a separate `companyTaxRate` registry key
 * was formally recorded in Task #403 (see the "COMPANY-LEVEL INCOME TAX —
 * DECISION RECORDED" block in `shared/constants.ts`). They are intentionally
 * NOT in the symbol list below — re-introducing either as a flat literal
 * would resurrect the divergence this guard exists to prevent, so the
 * TypeScript compile error from importing a non-existent export is the
 * right failure mode.
 *
 * The remaining four are still imported by a small, frozen allow-list of
 * files: schema column defaults, the canonical registry / field-registry,
 * UI fallbacks on the Property Edit & Company Assumptions screens, the
 * admin Model Defaults editor, legacy engine re-exports, the seeds, and
 * the existing test/golden harnesses. Today the only signal that someone
 * has *added* a brand-new import is the IDE's @deprecated underline —
 * easy to miss in CI.
 *
 * This guard fails the build if a file outside the allow-list imports any of
 * those four symbols from `@shared/constants` / `shared/constants`. The error
 * message points the author at `getFactoryNumber` and the registry.
 *
 * To extend the allow-list intentionally, add the path to ALLOWED_FILES below
 * with a short justification — never widen the symbol list to "soften" a
 * legitimate violation.
 *
 * Exit code 0 = clean, 1 = violation found.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";

// The four @deprecated symbols re-exported from shared/constants.ts. Keep in
// sync with the @deprecated JSDoc blocks in that file. (Two more were
// previously listed — DEFAULT_COMPANY_TAX_RATE and DEFAULT_COST_RATE_TAXES —
// and were deleted outright by Task #403 / Audit #406 (Task #405); importing
// them now fails at the TypeScript layer.)
const DEPRECATED_SYMBOLS = [
  "DEPRECIATION_YEARS",
  "DAYS_PER_MONTH",
  "DEFAULT_PROPERTY_INFLATION_RATE",
  "DEFAULT_COMPANY_INFLATION_RATE",
];

// Files permitted to import the deprecated symbols. Each entry is the exact
// repo-relative path. Grouped by why it is allowed.
const ALLOWED_FILES: ReadonlyArray<string> = [
  // Canonical declarations / registry plumbing.
  "shared/constants.ts",
  "shared/model-constants-registry.ts",
  "shared/field-registry.ts",

  // Drizzle schema column defaults — the database default has to be a literal.
  "shared/schema/config.ts",
  "shared/schema/properties.ts",

  // Seeds — populate the registry / properties from the same literals.
  "server/seeds/properties.ts",
  "server/seeds/property-data.ts",
  "script/seed-model-constants.ts",
  "script/seed-model-defaults.ts",

  // Sync helper that bridges legacy property fields ↔ registry values.
  "server/syncHelpers.ts",

  // Engine legacy re-exports kept until call sites migrate to the registry.
  "engine/company/company-engine.ts",
  "engine/property/property-engine.ts",
  "engine/debt/loanCalculations.ts",

  // Research / benchmark fallbacks.
  "calc/research/cost-benchmarks.ts",

  // UI fallbacks — Property Edit, statements, admin Model Defaults editor,
  // and the in-app verification/audit harnesses. (The Company Assumptions
  // page no longer references deprecated constants directly — its legacy
  // Company tab / TaxSection were removed in favor of Admin → Model Defaults.)
  "client/src/components/property-edit/OperatingCostRatesSection.tsx",
  "client/src/components/property-edit/OtherAssumptionsSection.tsx",
  "client/src/components/statements/YearlyIncomeStatement.tsx",
  "client/src/components/admin/model-defaults/CompanyTab.tsx",
  "client/src/components/admin/model-defaults/PropertyUnderwritingTab.tsx",
  "client/src/lib/audits/auditBalanceSheet.ts",
  "client/src/lib/audits/auditDepreciation.ts",
  "client/src/lib/audits/crossCalculatorValidation.ts",
  "client/src/lib/exports/checkerManualExport.ts",
  "client/src/lib/verification/known-value-runner.ts",
  "client/src/lib/verification/test-cases.ts",
];

// All `tests/**` and `tests/fixtures/**` files are allowed (the deprecated
// constants are deliberately referenced as test fixtures so existing golden
// numbers don't silently re-baseline).
const ALLOWED_PREFIXES: ReadonlyArray<string> = ["tests/"];

// The guardrail file itself names every banned symbol — exempt it from scanning.
const SELF_REFERENCE = "script/check-deprecated-constants.ts";

const SEARCH_GLOBS = ["server", "shared", "client", "engine", "calc", "tests", "script"];

interface Hit {
  file: string;
  line: number;
  text: string;
  symbol: string;
}

function rgFind(pattern: string): Array<{ file: string; line: number; text: string }> {
  const res = spawnSync(
    "rg",
    [
      "--no-heading",
      "--with-filename",
      "--line-number",
      "--color=never",
      "--multiline",
      "-e",
      pattern,
      "--",
      ...SEARCH_GLOBS,
    ],
    { encoding: "utf8" },
  );
  if (res.status !== 0 && res.status !== 1) {
    throw new Error(
      `ripgrep failed for pattern ${pattern}: ${res.stderr || res.stdout}`,
    );
  }
  if (!res.stdout) return [];
  const out: Array<{ file: string; line: number; text: string }> = [];
  for (const line of res.stdout.split("\n")) {
    if (!line) continue;
    const firstColon = line.indexOf(":");
    if (firstColon === -1) continue;
    const secondColon = line.indexOf(":", firstColon + 1);
    if (secondColon === -1) continue;
    const file = line.slice(0, firstColon);
    const lineNo = Number(line.slice(firstColon + 1, secondColon));
    const text = line.slice(secondColon + 1);
    out.push({ file: path.normalize(file), line: lineNo, text });
  }
  return out;
}

function isAllowed(file: string): boolean {
  if (file === SELF_REFERENCE) return true;
  if (ALLOWED_FILES.includes(file)) return true;
  return ALLOWED_PREFIXES.some((p) => file.startsWith(p));
}

function main(): void {
  // Match an `import { … X … } from "…/constants"` block (single- or
  // multi-line, optional `type` modifier, single or double quotes).
  const symbolAlt = DEPRECATED_SYMBOLS.join("|");
  const importPattern =
    String.raw`import\s+(?:type\s+)?\{[^}]*\b(` +
    symbolAlt +
    String.raw`)\b[^}]*\}\s*from\s*["'][^"']*constants["']`;

  const raw = rgFind(importPattern);
  const hits: Hit[] = [];
  for (const r of raw) {
    // The same import line may name multiple deprecated symbols — record each.
    for (const sym of DEPRECATED_SYMBOLS) {
      if (new RegExp(String.raw`\b` + sym + String.raw`\b`).test(r.text)) {
        hits.push({ ...r, symbol: sym });
      }
    }
  }

  // The deprecated-constants-guard.test.ts owns the canonical probe file
  // `server/_deprecated_const_guard_probe.ts`. The test creates it briefly,
  // shells out to this script, and unlinks it. When this script also runs
  // concurrently from Quick Audit / pre-commit, the probe is sometimes on
  // disk and gets flagged as a real violation. Ignore the probe by default;
  // the test opts in by setting INCLUDE_GUARD_PROBE=1 so it can still
  // assert the script catches the violation.
  const violations = hits.filter((h) => {
    if (
      h.file.endsWith("server/_deprecated_const_guard_probe.ts") &&
      !process.env.INCLUDE_GUARD_PROBE
    ) {
      return false;
    }
    return !isAllowed(h.file);
  });

  if (violations.length === 0) {
    console.log(
      `✅ Deprecated constants: 0 new imports across ${SEARCH_GLOBS.join(", ")}`,
    );
    console.log(
      `   (allow-listed files: ${ALLOWED_FILES.length}, plus tests/**)`,
    );
    process.exit(0);
  }

  console.error(
    `❌ Deprecated constants: ${violations.length} new import(s) outside the allow-list.\n`,
  );
  console.error(
    `   These four symbols in shared/constants.ts are @deprecated:`,
  );
  for (const s of DEPRECATED_SYMBOLS) console.error(`     - ${s}`);
  console.error(
    `\n   New code MUST use \`getFactoryNumber(<key>, country, state)\` from`,
  );
  console.error(
    `   @shared/model-constants-registry instead. See the @deprecated JSDoc on`,
  );
  console.error(
    `   each symbol in shared/constants.ts for the correct registry key.\n`,
  );
  console.error(
    `   If this import is genuinely necessary (schema default, UI fallback,`,
  );
  console.error(
    `   seed, or test fixture), add the file to ALLOWED_FILES in`,
  );
  console.error(`   ${SELF_REFERENCE} with a one-line justification.\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  [${v.symbol}]`);
    console.error(`    ${v.text.trim()}`);
  }
  process.exit(1);
}

main();
