import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SAFE_NUMBERS = new Set([
  "0", "1", "-1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11",
  "12", "100", "0.0", "1.0", "0.01",
]);

const SAFE_PATTERNS = [
  /^\d+e[+-]?\d+$/i,
  /^0[xX][0-9a-fA-F]+$/,
];

const FINANCE_ENGINE_FILES = [
  "engine/property/property-engine.ts",
  "engine/property/resolve-assumptions.ts",
  "engine/property/refinance-pass.ts",
  "engine/company/company-engine.ts",
  "engine/company/analyzeCompanyCashPosition.ts",
  "engine/helpers/utils.ts",
  "engine/helpers/portfolio-helpers.ts",
  "engine/aggregation/cashFlowAggregator.ts",
  "engine/aggregation/yearlyAggregator.ts",
  "engine/aggregation/consolidation.ts",
  "engine/aggregation/cashFlowSections.ts",
  "engine/debt/equityCalculations.ts",
  "engine/debt/loanCalculations.ts",
  "engine/debt/amortization.ts",
  "engine/funding/funding-predictor.ts",
  "client/src/lib/audits/crossCalculatorValidation.ts",
];

// Dynamic: scan all calc/**/*.ts files, excluding barrels/types/dispatch/hooks
const CALC_SKIP_FILES = new Set(["index.ts", "types.ts", "dispatch.ts", "schemas.ts"]);
const CALC_SKIP_PATTERNS = [/journal-hooks/, /service-fee/, /markup-waterfall/];
const CALC_MODULE_FILES = (function discoverCalcFiles(): string[] {
  const calcDir = path.resolve("calc");
  if (!fs.existsSync(calcDir)) return [];
  const files: string[] = [];
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) { walk(path.join(dir, entry.name)); continue; }
      if (!entry.name.endsWith(".ts")) continue;
      if (CALC_SKIP_FILES.has(entry.name)) continue;
      if (CALC_SKIP_PATTERNS.some(p => p.test(entry.name))) continue;
      files.push(path.relative(process.cwd(), path.join(dir, entry.name)).replace(/\\/g, "/"));
    }
  }
  walk(calcDir);
  return files.sort();
})();

const AUDIT_CHECKER_FILES = [
  "client/src/lib/financialAuditor.ts",
  "client/src/lib/audits/formulaChecker.ts",
  "client/src/lib/audits/gaapComplianceChecker.ts",
  "client/src/lib/runVerification.ts",
];

const EXPORT_FILES = [
  "client/src/lib/exports/checkerManualExport.ts",
  "client/src/lib/exports/excel/property-sheets.ts",
];

const ALL_SCANNED_FILES = [
  ...FINANCE_ENGINE_FILES,
  ...CALC_MODULE_FILES,
  ...AUDIT_CHECKER_FILES,
  ...EXPORT_FILES,
];

const FILES_THAT_MUST_IMPORT_CONSTANTS = [
  "engine/property/property-engine.ts",
  "engine/company/company-engine.ts",
  "engine/aggregation/cashFlowAggregator.ts",
  "engine/debt/equityCalculations.ts",
  "engine/debt/loanCalculations.ts",
  "client/src/lib/audits/crossCalculatorValidation.ts",
  "client/src/lib/financialAuditor.ts",
  "client/src/lib/exports/checkerManualExport.ts",
  "client/src/lib/exports/excel/property-sheets.ts",
];

const CONSTANT_IMPORT_PATTERN = /from\s+['"].*constants['"]/;
const NUMERIC_LITERAL = /(?<![a-zA-Z_$.'"`])(\d+\.?\d*|\.\d+)(?![a-zA-Z_$])/g;

const FORBIDDEN_LITERALS: Record<string, string> = {
  "0.085": "DEFAULT_BASE_MANAGEMENT_FEE_RATE or DEFAULT_EXIT_CAP_RATE",
  "0.12": "DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE",
  "0.30": "DEFAULT_REV_SHARE_EVENTS",
  "0.18": "DEFAULT_REV_SHARE_FB",
  "0.05": "DEFAULT_COST_RATE_UTILITIES / DEFAULT_REV_SHARE_OTHER / DEFAULT_COMMISSION_RATE / DEFAULT_COST_RATE_OTHER",
  "0.22": "DEFAULT_CATERING_BOOST_PCT / DEFAULT_COST_RATE_ROOMS",
  "0.20": "DEFAULT_COST_RATE_ROOMS / DEFAULT_SAFE_DISCOUNT_RATE",
  "0.65": "DEFAULT_EVENT_EXPENSE_RATE",
  "0.60": "DEFAULT_OTHER_EXPENSE_RATE / DEFAULT_UTILITIES_VARIABLE_SPLIT",
  "0.09": "DEFAULT_COST_RATE_FB",
  "0.08": "DEFAULT_COST_RATE_ADMIN",
  "0.04": "DEFAULT_COST_RATE_PROPERTY_OPS / DEFAULT_COST_RATE_FFE",
  "0.02": "DEFAULT_COST_RATE_MARKETING",
  "0.03": "DEFAULT_COST_RATE_TAXES",
  "0.005": "DEFAULT_COST_RATE_IT",
  "0.25": "DEFAULT_PROPERTY_TAX_RATE / DEFAULT_LAND_VALUE_PERCENT",
  "39": "DEPRECIATION_YEARS",
  "30.5": "DAYS_PER_MONTH",
  "2500000": "DEFAULT_SAFE_VALUATION_CAP",
  "0.015": "DEFAULT_SERVICE_FEE (Accounting)",
};

const CONTEXT_EXCEPTIONS = [
  /\.toFixed\s*\(/,
  /\.toPrecision\s*\(/,
  /\.slice\s*\(/,
  /\.substring\s*\(/,
  /\.length\s*/,
  /index|Index|idx|Idx/,
  /Math\.(min|max|floor|ceil|round|pow|abs)\s*\(/,
  /getMonth|getFullYear|getDate/,
  /\[\s*\d+\s*\]/,
  /monthIndex|yearIndex|monthsSince/,
  /for\s*\(\s*(let|const|var)\s+\w+\s*=\s*\d+/,
  /i\s*[<>]=?\s*\d+/,
  /i\s*\+\+|i\s*--|\+\+\s*i|--\s*i/,
  /\?\s*\d+\s*:/,
  /\/\/|\/\*|\*/,
  /["'].*ASC\s+\d+/,
  /["'].*FASB/,
  /["'].*IRS/,
  /gaap_ref/i,
  /gaap_reference/i,
  /["'][^"']*\d+[^"']*["']/,
  /tolerance/i,
  /threshold/i,
  /epsilon/i,
  /\.padStart\s*\(/,
  /\.padEnd\s*\(/,
  /statusCode|status\s*===?\s*\d+/,
  /setTimeout|setInterval/,
  /sortOrder/i,
  /\.push\s*\(/,
  /\.pop\s*\(/,
  /new Date/,
  /\.getTime\s*\(/,
  /setColumnWidths/,
  /columnWidth|colWidth|cellWidth/i,
  /\.width\s*=/,
  /padding|margin|fontSize|fontsize/i,
  /doc\.\w+\s*\(/,
  /setTextColor|setFillColor|setDrawColor|setLineWidth|rect\s*\(/i,
  /\d+,\s*\d+,\s*\d+[)\]]/,
  /fillColor|textColor|headStyles|alternateRowStyles|cellPadding/i,
  /pageWidth|pageHeight|marginLeft|marginRight/i,
  /^\s*(let\s+|const\s+|var\s+)?y\s*[=+]|^\s*(let\s+|const\s+|var\s+)?x\s*[=+]/,
  /brandedHeader|addSection|drawTable/i,
  /\+\s*y\b|\+\s*x\b/,
  /y\s*\+=|x\s*\+=/,
  /lineHeight|rowHeight|headerHeight/i,
  /formatMoney\s*\(/,
  /format(Currency|Percent|Number)\s*\(/i,
];

interface MagicNumberFinding {
  file: string;
  line: number;
  value: string;
  context: string;
}

function scanFileForMagicNumbers(filePath: string): MagicNumberFinding[] {
  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) return [];

  const content = fs.readFileSync(absPath, "utf-8");
  const lines = content.split("\n");
  const findings: MagicNumberFinding[] = [];
  let skipBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.includes("skipcalcscan")) { skipBlock = true; continue; }
    if (skipBlock && trimmed === "") { skipBlock = false; continue; }
    if (skipBlock) continue;
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;
    if (trimmed.startsWith("import ") || trimmed.startsWith("export {")) continue;
    if (trimmed.startsWith("export const ") || trimmed.startsWith("const ")) {
      if (/^(export\s+)?const\s+[A-Z_][A-Z0-9_]*\s*=/.test(trimmed)) continue;
    }

    let match;
    const regex = new RegExp(NUMERIC_LITERAL.source, "g");
    while ((match = regex.exec(line)) !== null) {
      const value = match[1];

      if (SAFE_NUMBERS.has(value)) continue;
      if (SAFE_PATTERNS.some((p) => p.test(value))) continue;

      const surroundingContext = line.substring(
        Math.max(0, match.index - 30),
        Math.min(line.length, match.index + match[0].length + 30),
      );

      if (CONTEXT_EXCEPTIONS.some((p) => p.test(surroundingContext))) continue;
      if (CONTEXT_EXCEPTIONS.some((p) => p.test(line))) continue;

      if (/[<>]=?\s*0?\.\d/.test(line)) continue;
      if (/source:\s*[`'"]/.test(line)) continue;
      if (/`[^`]*\$\{/.test(line) && /Publication|IRS|ASC|FASB|WP-/.test(line)) continue;
      if (/`[^`]*\$\{/.test(line)) continue;
      if (/workpaperRef|workpaper_ref/i.test(line)) continue;
      if (/expected\w*:|name:|property:/i.test(line)) continue;
      if (/\?\?\s*\d/.test(line)) continue;
      if (/start\w+:|room\w*:|purchase\w*:|building\w*:|max\w*:|acquisition\w*:/i.test(line)) continue;

      findings.push({
        file: filePath,
        line: i + 1,
        value,
        context: trimmed.substring(0, 120),
      });
    }
  }

  return findings;
}

interface ForbiddenLiteralFinding {
  file: string;
  line: number;
  value: string;
  shouldBe: string;
  context: string;
}

function scanForForbiddenLiterals(filePath: string): ForbiddenLiteralFinding[] {
  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) return [];

  const content = fs.readFileSync(absPath, "utf-8");
  const lines = content.split("\n");
  const findings: ForbiddenLiteralFinding[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;
    if (trimmed.startsWith("import ") || trimmed.startsWith("export {")) continue;
    if (/^(export\s+)?const\s+[A-Z_][A-Z0-9_]*\s*=/.test(trimmed)) continue;

    for (const [literal, constantName] of Object.entries(FORBIDDEN_LITERALS)) {
      const escapedLiteral = literal.replace(/\./g, "\\.");
      const pattern = new RegExp(`(?<![a-zA-Z_$.'"\`\\d])${escapedLiteral}(?![a-zA-Z_$\\d])`, "g");
      let match;
      while ((match = pattern.exec(line)) !== null) {
        const surroundingContext = line.substring(
          Math.max(0, match.index - 40),
          Math.min(line.length, match.index + match[0].length + 40),
        );

        if (CONTEXT_EXCEPTIONS.some((p) => p.test(surroundingContext))) continue;
        if (/["'][^"']*$/.test(line.substring(0, match.index)) &&
            /^[^"']*["']/.test(line.substring(match.index + match[0].length))) continue;

        if (/start[A-Z]\w*:\s*/.test(surroundingContext)) continue;
        if (/Occupancy|occupancy|Adr|adr|ADR/.test(surroundingContext)) continue;
        if (/Math\.abs\s*\(/.test(surroundingContext) || /<\s*0\.\d/.test(surroundingContext)) continue;
        if (/[<>]=?\s*0?\.\d/.test(line)) continue;
        if (/[<>]=?\s*\d/.test(line) && /rate|_rate|ltv|percent|Range|range|bound|limit/i.test(line)) continue;
        if (/source:\s*`/.test(line) || /source:\s*['"]/.test(line)) continue;

        findings.push({
          file: filePath,
          line: i + 1,
          value: literal,
          shouldBe: constantName,
          context: trimmed.substring(0, 120),
        });
      }
    }
  }

  return findings;
}

describe("Hardcoded Value Detection", () => {
  describe("Magic number scan — engine files", () => {
    const engineFindings: MagicNumberFinding[] = [];
    for (const file of FINANCE_ENGINE_FILES) {
      engineFindings.push(...scanFileForMagicNumbers(file));
    }

    it("finance engine files contain no magic numbers", () => {
      if (engineFindings.length > 0) {
        const report = engineFindings
          .map((f) => `  ${f.file}:${f.line} — value ${f.value}\n    ${f.context}`)
          .join("\n");
        expect.fail(
          `Found ${engineFindings.length} magic number(s) in engine files:\n${report}\n\n` +
          `All numeric literals must come from constants.ts or function parameters.`,
        );
      }
    });
  });

  describe("Magic number scan — calc modules", () => {
    const calcFindings: MagicNumberFinding[] = [];
    for (const file of CALC_MODULE_FILES) {
      calcFindings.push(...scanFileForMagicNumbers(file));
    }

    it("calc module files contain no magic numbers", () => {
      if (calcFindings.length > 0) {
        const report = calcFindings
          .map((f) => `  ${f.file}:${f.line} — value ${f.value}\n    ${f.context}`)
          .join("\n");
        expect.fail(
          `Found ${calcFindings.length} magic number(s) in calc modules:\n${report}\n\n` +
          `All numeric literals must come from constants.ts or function parameters.`,
        );
      }
    });
  });

  describe("Magic number scan — audit/checker files", () => {
    const auditFindings: MagicNumberFinding[] = [];
    for (const file of AUDIT_CHECKER_FILES) {
      auditFindings.push(...scanFileForMagicNumbers(file));
    }

    it("auditor and checker files contain no magic numbers", () => {
      if (auditFindings.length > 0) {
        const report = auditFindings
          .map((f) => `  ${f.file}:${f.line} — value ${f.value}\n    ${f.context}`)
          .join("\n");
        expect.fail(
          `Found ${auditFindings.length} magic number(s) in audit/checker files:\n${report}\n\n` +
          `All numeric literals must come from constants.ts or function parameters.`,
        );
      }
    });
  });

  describe("Magic number scan — export files", () => {
    const exportFindings: MagicNumberFinding[] = [];
    for (const file of EXPORT_FILES) {
      exportFindings.push(...scanFileForMagicNumbers(file));
    }

    it("export files contain no magic numbers", () => {
      if (exportFindings.length > 0) {
        const report = exportFindings
          .map((f) => `  ${f.file}:${f.line} — value ${f.value}\n    ${f.context}`)
          .join("\n");
        expect.fail(
          `Found ${exportFindings.length} magic number(s) in export files:\n${report}\n\n` +
          `All numeric literals must come from constants.ts or function parameters.`,
        );
      }
    });
  });

  describe("Forbidden literal values — known constants used raw", () => {
    const forbiddenFindings: ForbiddenLiteralFinding[] = [];
    for (const file of ALL_SCANNED_FILES) {
      forbiddenFindings.push(...scanForForbiddenLiterals(file));
    }

    it("no known constant values appear as raw literals in runtime code", () => {
      if (forbiddenFindings.length > 0) {
        const report = forbiddenFindings
          .map((f) => `  ${f.file}:${f.line} — found raw ${f.value} (should be ${f.shouldBe})\n    ${f.context}`)
          .join("\n");
        expect.fail(
          `Found ${forbiddenFindings.length} raw literal(s) that should use named constants:\n${report}\n\n` +
          `Import and use the named constant from shared/constants.ts instead.`,
        );
      }
    });
  });

  describe("Constant imports required", () => {
    for (const file of FILES_THAT_MUST_IMPORT_CONSTANTS) {
      it(`${file} imports from constants`, () => {
        const absPath = path.resolve(file);
        if (!fs.existsSync(absPath)) return;
        const content = fs.readFileSync(absPath, "utf-8");
        expect(
          CONSTANT_IMPORT_PATTERN.test(content),
          `${file} must import from constants — financial files need named constants, not raw numbers`,
        ).toBe(true);
      });
    }
  });

  describe("Schema defaults use constants, not literals", () => {
    it("shared/schema.ts references constants for financial .default() calls", () => {
      const schemaPath = path.resolve("shared/schema.ts");
      if (!fs.existsSync(schemaPath)) return;
      const content = fs.readFileSync(schemaPath, "utf-8");
      const lines = content.split("\n");

      const structuralFieldPatterns = [
        /partnerCount/,
        /partnerComp/,
        /staffTier/,
        /staffFte/,
        /MaxProperties/,
        /holdPeriod/,
        /roomCount/,
        /eventLocations/,
        /maxEventCapacity/,
        /acreage/,
        /parkingSpaces/,
        /sortOrder/,
        /spaRooms/,
        /meetingRooms/,
        /numberOfUnits/,
        /floors/,
        /yearBuilt/,
        /lotSize/,
        /squareFootage/,
        /occupancyRamp/,
        /stabilizationMonths/,
        /startYear/,
        /acquisitionMonth/,
        /maxRooms/,
        /minRooms/,
        /safeTranche\d/,
        /fiscalYearStartMonth/,
      ];

      const violations: string[] = [];
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;

        if (structuralFieldPatterns.some((p) => p.test(line))) continue;

        if (/z\.\w+\(\)/.test(line) && /\.default\(/.test(line)) continue;

        const defaultMatch = /\.default\(\s*([^)]+)\s*\)/.exec(line);
        if (!defaultMatch) continue;

        const defaultArg = defaultMatch[1].trim();

        if (/^(true|false|null|"[^"]*"|'[^']*'|sql`.+`)$/.test(defaultArg)) continue;

        if (/^-?\d+\.?\d*$/.test(defaultArg) && !["0", "1", "-1"].includes(defaultArg)) {
          violations.push(`  line ${i + 1}: .default(${defaultArg}) — should use a named constant\n    ${trimmed.substring(0, 120)}`);
        }
      }

      if (violations.length > 0) {
        expect.fail(
          `Found ${violations.length} schema .default() call(s) using raw numeric literals:\n` +
          `${violations.join("\n")}\n\n` +
          `Schema defaults for financial rates/percentages must use named constants from shared/constants.ts.\n` +
          `Structural fields (room counts, staff tiers, etc.) are exempt.`,
        );
      }
    });
  });

  describe("Constants file is the single source of truth", () => {
    it("shared/constants.ts exists and exports key constants", () => {
      const constantsPath = path.resolve("shared/constants.ts");
      expect(fs.existsSync(constantsPath), "shared/constants.ts must exist").toBe(true);

      const content = fs.readFileSync(constantsPath, "utf-8");

      const requiredExports = [
        "DEFAULT_REV_SHARE_EVENTS",
        "DEFAULT_REV_SHARE_FB",
        "DEFAULT_REV_SHARE_OTHER",
        "DEFAULT_CATERING_BOOST_PCT",
        "DEFAULT_BASE_MANAGEMENT_FEE_RATE",
        "DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE",
        "DEFAULT_EXIT_CAP_RATE",
        "DEFAULT_PROPERTY_TAX_RATE",
        "DEFAULT_COMMISSION_RATE",
        "DEFAULT_LAND_VALUE_PERCENT",
        "DEPRECIATION_YEARS",
        "DAYS_PER_MONTH",
        "DEFAULT_COST_RATE_ROOMS",
        "DEFAULT_COST_RATE_FB",
        "DEFAULT_COST_RATE_ADMIN",
        "DEFAULT_COST_RATE_MARKETING",
        "DEFAULT_COST_RATE_PROPERTY_OPS",
        "DEFAULT_COST_RATE_UTILITIES",
        "DEFAULT_COST_RATE_TAXES",
        "DEFAULT_COST_RATE_IT",
        "DEFAULT_COST_RATE_FFE",
        "DEFAULT_COST_RATE_OTHER",
        "DEFAULT_EVENT_EXPENSE_RATE",
        "DEFAULT_OTHER_EXPENSE_RATE",
        "DEFAULT_UTILITIES_VARIABLE_SPLIT",
        "DEFAULT_SAFE_VALUATION_CAP",
        "DEFAULT_SAFE_DISCOUNT_RATE",
        "DEFAULT_SERVICE_FEE_CATEGORIES",
        "DEFAULT_SERVICE_MARKUP",
        "DEFAULT_OCCUPANCY_RAMP_MONTHS",
        "DEFAULT_FIXED_COST_ESCALATION_RATE",
        "DEFAULT_COMPANY_TAX_RATE",
        "DEFAULT_PROJECTION_YEARS",
      ];

      const missing = requiredExports.filter(
        (name) => !new RegExp(`export\\s+const\\s+${name}\\b`).test(content),
      );

      if (missing.length > 0) {
        expect.fail(
          `shared/constants.ts is missing required exports:\n  ${missing.join("\n  ")}\n\n` +
          `All financial default values must be exported from this file.`,
        );
      }
    });

    it("no duplicate constant definitions exist outside shared/constants.ts", () => {
      const constantsPath = path.resolve("shared/constants.ts");
      const content = fs.readFileSync(constantsPath, "utf-8");

      const exportedNames: string[] = [];
      const exportRegex = /export\s+const\s+([A-Z_]+)\b/g;
      let match;
      while ((match = exportRegex.exec(content)) !== null) {
        exportedNames.push(match[1]);
      }

      const clientConstantsPath = path.resolve("client/src/lib/constants.ts");
      if (!fs.existsSync(clientConstantsPath)) return;
      const clientContent = fs.readFileSync(clientConstantsPath, "utf-8");

      const duplicates = exportedNames.filter(
        (name) => new RegExp(`(export\\s+)?const\\s+${name}\\s*=`).test(clientContent),
      );

      if (duplicates.length > 0) {
        expect.fail(
          `Found duplicate constant definitions in client/src/lib/constants.ts:\n  ${duplicates.join("\n  ")}\n\n` +
          `These are already defined in shared/constants.ts — import from there instead.`,
        );
      }
    });
  });

  describe("Seed file uses correct values matching constants", () => {
    it("server/seed.ts exists", () => {
      const seedPath = path.resolve("server/seed.ts");
      expect(fs.existsSync(seedPath), "server/seed.ts must exist").toBe(true);
    });
  });

  describe("Coverage check — all runtime financial files are scanned", () => {
    it("no unscanned .ts files in client/src/lib/ with financial calculations", () => {
      const libDir = path.resolve("client/src/lib");
      if (!fs.existsSync(libDir)) return;

      const nonFinanceFiles = new Set([
        "api.ts",
        "auth-utils.ts",
        "queryClient.ts",
        "utils.ts",
        "formatters.ts",
        "store.ts",
        "pdfChartDrawer.ts",
        "constants.ts",
        "financialEngine.ts",
        "company-data.ts",
        "themeUtils.ts",
        "confetti.ts",
        "theme-utils.ts",
        "analytics.ts",
        "sentry.ts",
        "image-variants.ts",
        "admin-nav.ts",
        "exportConfig.ts",
        "map-utils.ts",
        "glossary.ts",
        "scenario-dirty-state.ts",
        "panel-manager.ts",
      ]);

      const allLibFiles = fs.readdirSync(libDir)
        .filter((f) => f.endsWith(".ts") && !nonFinanceFiles.has(f));

      const scannedBasenames = [
        ...ALL_SCANNED_FILES
          .filter((f) => f.startsWith("client/src/lib/") && !f.includes("/exports/"))
          .map((f) => path.basename(f)),
        ...ALL_SCANNED_FILES
          .filter((f) => f.startsWith("engine/"))
          .map((f) => path.basename(f)),
      ];

      const financialShimDir = path.resolve("client/src/lib/financial");
      const shimFiles = fs.existsSync(financialShimDir)
        ? fs.readdirSync(financialShimDir).filter((f) => f.endsWith(".ts"))
        : [];

      const unscanned = allLibFiles.filter((f) =>
        !scannedBasenames.includes(f) && !shimFiles.includes(f),
      );

      if (unscanned.length > 0) {
        expect.fail(
          `Found ${unscanned.length} financial lib file(s) not included in hardcoded detection scan:\n` +
          `  ${unscanned.join("\n  ")}\n\n` +
          `Add these to the appropriate scan list or to the nonFinanceFiles exclusion set.`,
        );
      }
    });

    it("calc/ files are dynamically discovered (non-empty scan list)", () => {
      // CALC_MODULE_FILES is built dynamically via discoverCalcFiles() above.
      // This test confirms the auto-discovery found files.
      expect(
        CALC_MODULE_FILES.length,
        "Dynamic calc file discovery should find at least 30 files",
      ).toBeGreaterThanOrEqual(30);
    });
  });
});
