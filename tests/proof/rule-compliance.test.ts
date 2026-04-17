import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// ─────────────────────────────────────────────────────────────
// Helper: recursively collect .ts files from a directory
// ─────────────────────────────────────────────────────────────
function collectTsFiles(dir: string, results: string[] = []): string[] {
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectTsFiles(full, results);
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      results.push(full);
    }
  }
  return results;
}

// ─────────────────────────────────────────────────────────────
// Section 1: Admin config literals
// Rule: no-hardcoded-admin-config.md
// ─────────────────────────────────────────────────────────────
describe("Admin config literals (no-hardcoded-admin-config)", () => {
  const FORBIDDEN_ADMIN_STRINGS = [
    "Norfolk Group",
    "KIT Capital",
    "Hospitality Business Group",
    "Boutique Hotel",
    "Estate Hotel",
    "Fluid Glass",
  ];

  // Directories to scan
  const SCAN_DIRS = [
    path.resolve("client/src/lib"),
    path.resolve("server"),
  ];

  // Files/paths where these strings are allowed
  function isExempt(filePath: string): boolean {
    const rel = path.relative(path.resolve("."), filePath).replace(/\\/g, "/");
    // Seed files (any file with "seed" in the path)
    if (/seed/i.test(rel)) return true;
    // Test files
    if (rel.endsWith(".test.ts") || rel.endsWith(".test.tsx")) return true;
    if (rel.includes("__test__") || rel.includes("__tests__")) return true;
    // Markdown files
    if (rel.endsWith(".md")) return true;
    // Knowledge base content
    if (rel.includes("knowledge-base") || rel.includes("kb-content")) return true;
    // .claude directory
    if (rel.startsWith(".claude/")) return true;
    // Seeds directory
    if (rel.includes("server/seeds/")) return true;
    // Sync helpers (fill-only seed defaults per database-seeding.md)
    if (rel.includes("syncHelpers")) return true;
    // Auth file contains seedAdminUser() which is a seed mechanism (database-seeding.md)
    if (rel.includes("server/auth")) return true;
    // AI system prompts and tool context
    if (rel.includes("replit_integrations/chat")) return true;
    if (rel.includes("routes/calculations")) return true;
    // Branding route (fallback company name resolved from DB, literal is last-resort default)
    if (rel.includes("routes/branding")) return true;
    // Export templates use company name as fallback when branding data unavailable
    if (rel.includes("exports/")) return true;
    if (rel.includes("premium-exports")) return true;
    if (rel.includes("premium-pdf-pipeline")) return true;
    // Verification runner (display-only fallback)
    if (rel.includes("runVerification")) return true;
    return false;
  }

  it("no forbidden admin-config strings in client/src/lib/ or server/ (outside exemptions)", () => {
    const violations: string[] = [];

    for (const dir of SCAN_DIRS) {
      const files = collectTsFiles(dir);
      for (const filePath of files) {
        if (isExempt(filePath)) continue;

        const content = fs.readFileSync(filePath, "utf-8");
        const lines = content.split("\n");

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const trimmed = line.trim();
          // Skip comments
          if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;

          for (const forbidden of FORBIDDEN_ADMIN_STRINGS) {
            if (line.includes(forbidden)) {
              const rel = path.relative(path.resolve("."), filePath).replace(/\\/g, "/");
              violations.push(
                `  ${rel}:${i + 1} — found "${forbidden}"\n    ${trimmed.substring(0, 120)}`
              );
            }
          }
        }
      }
    }

    if (violations.length > 0) {
      expect.fail(
        `Found ${violations.length} hardcoded admin-config string(s) outside allowed files:\n` +
        `${violations.join("\n")}\n\n` +
        `These values are managed through the Administration page and must come from the database.\n` +
        `Allowed locations: seed files, test files, knowledge-base.ts, .claude/ files.`
      );
    }
  });
});

// ─────────────────────────────────────────────────────────────
// Section 2: Constants re-export parity
// Rule: constants-and-config.md
// ─────────────────────────────────────────────────────────────
describe("Constants re-export parity (constants-and-config)", () => {
  const sharedPath = path.resolve("shared/constants.ts");
  const clientPath = path.resolve("client/src/lib/constants.ts");

  it("shared/constants.ts exists", () => {
    expect(fs.existsSync(sharedPath), "shared/constants.ts must exist").toBe(true);
  });

  it("client/src/lib/constants.ts exists", () => {
    expect(fs.existsSync(clientPath), "client/src/lib/constants.ts must exist").toBe(true);
  });

  it("client constants file re-exports from @shared/constants", () => {
    if (!fs.existsSync(clientPath)) return;
    const content = fs.readFileSync(clientPath, "utf-8");
    const hasSharedImport =
      content.includes('from "@shared/constants"') ||
      content.includes("from '@shared/constants'") ||
      content.includes('from "../../shared/constants"') ||
      content.includes("from '../../shared/constants'");
    expect(
      hasSharedImport,
      `client/src/lib/constants.ts must re-export from @shared/constants`
    ).toBe(true);
  });

  it("all DEFAULT_*, DEPRECIATION_*, DAYS_* from shared are re-exported in client", () => {
    if (!fs.existsSync(sharedPath) || !fs.existsSync(clientPath)) return;

    const sharedContent = fs.readFileSync(sharedPath, "utf-8");
    const clientContent = fs.readFileSync(clientPath, "utf-8");

    // Extract all exported constant names matching the target patterns
    const exportRegex = /export\s+const\s+((?:DEFAULT_|DEPRECIATION_|DAYS_)[A-Z_0-9]+)\b/g;
    const sharedExports: string[] = [];
    let match;
    while ((match = exportRegex.exec(sharedContent)) !== null) {
      sharedExports.push(match[1]);
    }

    // Filter to financial constants only (skip AI agent, service template, service model constants
    // that may be server-only)
    const financialConstants = sharedExports.filter((name) => {
      // These are core financial constants that the client must have
      if (name.startsWith("DEFAULT_COST_RATE_")) return true;
      if (name.startsWith("DEFAULT_REV_SHARE_")) return true;
      if (name === "DEPRECIATION_YEARS") return true;
      if (name === "DAYS_PER_MONTH") return true;
      if (name === "DEFAULT_EXIT_CAP_RATE") return true;
      if (name === "DEFAULT_PROPERTY_TAX_RATE") return true;
      if (name === "DEFAULT_COMMISSION_RATE") return true;
      if (name === "DEFAULT_LAND_VALUE_PERCENT") return true;
      if (name === "DEFAULT_CATERING_BOOST_PCT") return true;
      if (name === "DEFAULT_EVENT_EXPENSE_RATE") return true;
      if (name === "DEFAULT_OTHER_EXPENSE_RATE") return true;
      if (name === "DEFAULT_UTILITIES_VARIABLE_SPLIT") return true;
      if (name === "DEFAULT_OCCUPANCY_RAMP_MONTHS") return true;
      if (name === "DEFAULT_BASE_MANAGEMENT_FEE_RATE") return true;
      if (name === "DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE") return true;
      if (name === "DEFAULT_CAPITAL_RAISE_VALUATION_CAP") return true;
      if (name === "DEFAULT_CAPITAL_RAISE_DISCOUNT_RATE") return true;
      if (name === "DEFAULT_FIXED_COST_ESCALATION_RATE") return true;
      if (name === "DEFAULT_COMPANY_TAX_RATE") return true;
      if (name === "DEFAULT_PROJECTION_YEARS") return true;
      if (name === "DEFAULT_SERVICE_FEE_CATEGORIES") return true;
      return false;
    });

    // Check each financial constant is re-exported in the client file
    const missing = financialConstants.filter((name) => {
      // Check for re-export in an export { ... } block or direct export
      return !clientContent.includes(name);
    });

    if (missing.length > 0) {
      expect.fail(
        `client/src/lib/constants.ts is missing re-exports for ${missing.length} shared constant(s):\n` +
        `  ${missing.join("\n  ")}\n\n` +
        `Add these to the export { ... } from "@shared/constants" block in client/src/lib/constants.ts.`
      );
    }
  });
});

// ─────────────────────────────────────────────────────────────
// Section 3: parseLocalDate single source of truth
// Skill: coding-conventions/context-reduction.md
// ─────────────────────────────────────────────────────────────
describe("parseLocalDate single source of truth (context-reduction)", () => {
  const CANONICAL_FILE = path.resolve("shared/dates.ts");

  it("shared/dates.ts exists with parseLocalDate definition", () => {
    expect(
      fs.existsSync(CANONICAL_FILE),
      "shared/dates.ts must exist as the canonical location for parseLocalDate"
    ).toBe(true);

    const content = fs.readFileSync(CANONICAL_FILE, "utf-8");
    expect(
      /export\s+function\s+parseLocalDate/.test(content),
      "shared/dates.ts must export parseLocalDate"
    ).toBe(true);
  });

  it("no local parseLocalDate definitions outside shared/dates.ts", () => {
    const scanDirs = [
      path.resolve("client/src"),
      path.resolve("server"),
      path.resolve("calc"),
      path.resolve("shared"),
    ];

    const violations: string[] = [];

    for (const dir of scanDirs) {
      const files = collectTsFiles(dir);
      for (const filePath of files) {
        // Skip the canonical file
        if (path.resolve(filePath) === CANONICAL_FILE) continue;
        // Skip test files
        if (filePath.endsWith(".test.ts") || filePath.endsWith(".test.tsx")) continue;

        const content = fs.readFileSync(filePath, "utf-8");
        const lines = content.split("\n");

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          // Match local function definitions (not re-exports)
          if (/function\s+parseLocalDate\s*\(/.test(line)) {
            // Allow re-exports like: export { parseLocalDate } from ...
            if (/export\s*\{[^}]*parseLocalDate[^}]*\}\s*from/.test(line)) continue;
            const rel = path.relative(path.resolve("."), filePath).replace(/\\/g, "/");
            violations.push(
              `  ${rel}:${i + 1} — local function definition found\n    ${line.trim().substring(0, 120)}`
            );
          }
        }
      }
    }

    if (violations.length > 0) {
      expect.fail(
        `Found ${violations.length} local parseLocalDate definition(s) outside shared/dates.ts:\n` +
        `${violations.join("\n")}\n\n` +
        `parseLocalDate must be defined ONLY in shared/dates.ts.\n` +
        `Other files should import it: import { parseLocalDate } from "@shared/dates";`
      );
    }
  });
});

// ─────────────────────────────────────────────────────────────
// Section 4: .claude is the sole source of truth
// Rule: documentation.md
// ─────────────────────────────────────────────────────────────
describe("doc harmony — replit.md and claude.md stay in sync", () => {
  const ROOT = path.resolve(".");
  const claudeMd = path.join(ROOT, ".claude", "claude.md");
  const replitMd = path.join(ROOT, "replit.md");

  it(".claude/claude.md exists", () => {
    expect(
      fs.existsSync(claudeMd),
      ".claude/claude.md must exist"
    ).toBe(true);
  });

  it(".claude/claude.md contains required sections", () => {
    if (!fs.existsSync(claudeMd)) return;
    const content = fs.readFileSync(claudeMd, "utf-8");
    const required = ["Architecture", "Rules", "Session"];
    const missing = required.filter((s) => !content.includes(s));
    expect(
      missing.length,
      `.claude/claude.md is missing required sections: ${missing.join(", ")}`
    ).toBe(0);
  });

  it("replit.md exists and is comprehensive (covers key sections)", () => {
    expect(fs.existsSync(replitMd), "replit.md must exist").toBe(true);
    if (!fs.existsSync(replitMd)) return;
    const content = fs.readFileSync(replitMd, "utf-8");
    const required = ["User Roles", "Key Rules", "Quick Commands", "Skill Router", "Tech Stack"];
    const missing = required.filter((s) => !content.includes(s));
    expect(
      missing.length,
      `replit.md is missing required sections: ${missing.join(", ")}. Both docs must be comprehensive.`
    ).toBe(0);
  });

  it("replit.md references .claude/ skills directory", () => {
    if (!fs.existsSync(replitMd)) return;
    const content = fs.readFileSync(replitMd, "utf-8");
    const hasRef =
      content.includes(".claude/skills/") ||
      content.includes(".claude/rules/");
    expect(
      hasRef,
      "replit.md must reference .claude/skills/ or .claude/rules/ so agents can find skills"
    ).toBe(true);
  });

  it("no root-level CLAUDE.md or instructions.md that could shadow .claude/", () => {
    const forbidden = ["CLAUDE.md", "instructions.md", "INSTRUCTIONS.md"];
    const found = forbidden.filter((f) => fs.existsSync(path.join(ROOT, f)));
    expect(
      found,
      `Found root-level file(s) that could shadow .claude/: ${found.join(", ")}. ` +
      `All project knowledge must live inside .claude/.`
    ).toHaveLength(0);
  });

  it("no .md rule files exist outside .claude/rules/", () => {
    // Only check known alternative locations — not the whole repo
    const suspectDirs = [
      path.join(ROOT, "docs"),
      path.join(ROOT, ".github"),
    ];
    const violations: string[] = [];
    for (const dir of suspectDirs) {
      if (!fs.existsSync(dir)) continue;
      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        if (/^(rules?|constraints?|instructions?)\.md$/i.test(entry)) {
          violations.push(path.join(dir, entry));
        }
      }
    }
    expect(
      violations,
      `Found rule/instruction files outside .claude/rules/: ${violations.join(", ")}. ` +
      `All binding rules must live in .claude/rules/.`
    ).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────
// Section 5: No raw Date constructor with date strings in
// financial engine files (prevents timezone bugs)
// ─────────────────────────────────────────────────────────────
describe("No raw Date constructor with date strings in financial files", () => {
  const FINANCE_ENGINE_FILES = [
    "client/src/lib/financial/property-engine.ts",
    "client/src/lib/financial/company-engine.ts",
    "client/src/lib/financial/utils.ts",
    "client/src/lib/cashFlowAggregator.ts",
    "client/src/lib/yearlyAggregator.ts",
    "client/src/lib/equityCalculations.ts",
    "client/src/lib/loanCalculations.ts",
  ];

  // Pattern: new Date("20... — raw date string construction
  const RAW_DATE_PATTERN = /new\s+Date\s*\(\s*["']20/;

  it("financial engine files do not use raw new Date() with date strings", () => {
    const violations: string[] = [];

    for (const relFile of FINANCE_ENGINE_FILES) {
      const absPath = path.resolve(relFile);
      if (!fs.existsSync(absPath)) continue;

      const content = fs.readFileSync(absPath, "utf-8");
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Skip comments
        if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;

        if (RAW_DATE_PATTERN.test(line)) {
          // Exception: lines that already include T00:00:00 (which is what parseLocalDate does)
          if (line.includes("T00:00:00")) continue;

          violations.push(
            `  ${relFile}:${i + 1} — raw new Date("20...") found\n    ${trimmed.substring(0, 120)}`
          );
        }
      }
    }

    if (violations.length > 0) {
      expect.fail(
        `Found ${violations.length} raw Date constructor call(s) with date strings in financial files:\n` +
        `${violations.join("\n")}\n\n` +
        `Use parseLocalDate() instead of new Date("YYYY-MM-DD") to prevent timezone bugs.\n` +
        `Import from shared/dates.ts: import { parseLocalDate } from "@shared/dates";`
      );
    }
  });
});

// ─────────────────────────────────────────────────────────────
// Section 6: Error handling safety
// Prevents regression of catch-any and unsafe error casts
// ─────────────────────────────────────────────────────────────
describe("Error handling safety — no catch(x: any) or unsafe (x as Error)", () => {
  const SCAN_DIRS = [
    path.resolve("client/src"),
    path.resolve("server"),
    path.resolve("calc"),
    path.resolve("shared"),
    path.resolve("script"),
  ];

  const CATCH_ANY_PATTERN = /catch\s*\(\s*\w+\s*:\s*any\s*\)/;
  const UNSAFE_AS_ERROR_PATTERN = /\(\s*\w+\s+as\s+Error\s*\)\s*\.\s*message/;

  function isExemptFile(filePath: string): boolean {
    const rel = path.relative(path.resolve("."), filePath).replace(/\\/g, "/");
    if (rel.endsWith(".test.ts") || rel.endsWith(".test.tsx")) return true;
    if (rel.includes("node_modules")) return true;
    if (rel.startsWith("script/")) return true;
    return false;
  }

  it("no catch(x: any) in production code", () => {
    const violations: string[] = [];

    for (const dir of SCAN_DIRS) {
      const files = collectTsFiles(dir);
      for (const file of files) {
        if (isExemptFile(file)) continue;
        const content = fs.readFileSync(file, "utf-8");
        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.trimStart().startsWith("//")) continue;
          if (CATCH_ANY_PATTERN.test(line)) {
            const rel = path.relative(path.resolve("."), file).replace(/\\/g, "/");
            violations.push(`  ${rel}:${i + 1}\n    ${line.trim().substring(0, 120)}`);
          }
        }
      }
    }

    if (violations.length > 0) {
      expect.fail(
        `Found ${violations.length} catch(x: any) violation(s):\n${violations.join("\n")}\n\n` +
        `Use catch (error: unknown) with instanceof Error guards instead.`
      );
    }
  });

  it("no unsafe (x as Error).message casts in production code", () => {
    const violations: string[] = [];

    for (const dir of SCAN_DIRS) {
      const files = collectTsFiles(dir);
      for (const file of files) {
        if (isExemptFile(file)) continue;
        const content = fs.readFileSync(file, "utf-8");
        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.trimStart().startsWith("//")) continue;
          if (UNSAFE_AS_ERROR_PATTERN.test(line)) {
            const rel = path.relative(path.resolve("."), file).replace(/\\/g, "/");
            violations.push(`  ${rel}:${i + 1}\n    ${line.trim().substring(0, 120)}`);
          }
        }
      }
    }

    if (violations.length > 0) {
      expect.fail(
        `Found ${violations.length} unsafe (x as Error).message cast(s):\n${violations.join("\n")}\n\n` +
        `Use: error instanceof Error ? error.message : String(error)`
      );
    }
  });
});

// ─────────────────────────────────────────────────────────────
// Section 7: No `any` types in financial calculation code
// ─────────────────────────────────────────────────────────────
describe("No any types in financial calculation code", () => {
  const FINANCE_DIRS = [
    path.resolve("calc"),
    path.resolve("engine"),
  ];

  const ANY_PATTERN = /:\s*any\b|as\s+any\b/;

  it("calc/ and engine/ directories have zero any types", () => {
    const violations: string[] = [];

    for (const dir of FINANCE_DIRS) {
      if (!fs.existsSync(dir)) continue;
      const files = collectTsFiles(dir);
      for (const file of files) {
        if (file.endsWith(".test.ts")) continue;
        const content = fs.readFileSync(file, "utf-8");
        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.trimStart().startsWith("//") || line.trimStart().startsWith("*")) continue;
          if (ANY_PATTERN.test(line)) {
            const rel = path.relative(path.resolve("."), file).replace(/\\/g, "/");
            violations.push(`  ${rel}:${i + 1}\n    ${line.trim().substring(0, 120)}`);
          }
        }
      }
    }

    if (violations.length > 0) {
      expect.fail(
        `Found ${violations.length} any type(s) in financial calculation code:\n${violations.join("\n")}\n\n` +
        `Financial calculation code must use explicit types for correctness.`
      );
    }
  });
});

// ─────────────────────────────────────────────────────────────
// Section 8: Domain boundary — route files must not import
// db or drizzle-orm directly (use storage interface instead)
// ─────────────────────────────────────────────────────────────
describe("Domain boundary — routes use storage interface only", () => {
  const ROUTES_DIR = path.resolve("server/routes");

  const FORBIDDEN_IMPORTS = [
    /from\s+["']drizzle-orm/,
    /from\s+["']\.\.\/db["']/,
    /from\s+["']\.\/db["']/,
    /from\s+["']\.\.\/\.\.\/db["']/,
    /require\s*\(\s*["']drizzle-orm/,
  ];

  it("route files do not import db or drizzle-orm directly", () => {
    const violations: string[] = [];
    const files = collectTsFiles(ROUTES_DIR);

    for (const file of files) {
      if (file.endsWith(".test.ts")) continue;
      const content = fs.readFileSync(file, "utf-8");
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trimStart().startsWith("//")) continue;

        for (const pattern of FORBIDDEN_IMPORTS) {
          if (pattern.test(line)) {
            const rel = path.relative(path.resolve("."), file).replace(/\\/g, "/");
            violations.push(`  ${rel}:${i + 1}\n    ${line.trim().substring(0, 120)}`);
          }
        }
      }
    }

    if (violations.length > 0) {
      expect.fail(
        `Found ${violations.length} domain boundary violation(s) in route files:\n${violations.join("\n")}\n\n` +
        `Route files must use the storage interface (IStorage) for data access.\n` +
        `Move direct db/drizzle-orm imports to server/storage.ts.`
      );
    }
  });
});

// ─────────────────────────────────────────────────────────────
// Section 9: as-any budget — track and cap unsafe type casts
// in critical directories to prevent regression
// ─────────────────────────────────────────────────────────────
describe("as-any budget — capped unsafe type assertions", () => {
  const AS_ANY_PATTERN = /\bas\s+any\b/;

  function countAsAny(dir: string): number {
    if (!fs.existsSync(dir)) return 0;
    const files = collectTsFiles(dir);
    let count = 0;
    for (const file of files) {
      if (file.endsWith(".test.ts") || file.endsWith(".test.tsx")) continue;
      const content = fs.readFileSync(file, "utf-8");
      const lines = content.split("\n");
      for (const line of lines) {
        if (line.trimStart().startsWith("//") || line.trimStart().startsWith("*")) continue;
        const matches = line.match(new RegExp(AS_ANY_PATTERN, "g"));
        if (matches) count += matches.length;
      }
    }
    return count;
  }

  it("server/ as-any count stays within budget", () => {
    const count = countAsAny(path.resolve("server"));
    const BUDGET = 85;
    expect(
      count,
      `server/ has ${count} 'as any' casts (budget: ${BUDGET}). Reduce before adding more.`
    ).toBeLessThanOrEqual(BUDGET);
  });

  it("client/src/ as-any count stays within budget", () => {
    const count = countAsAny(path.resolve("client/src"));
    const BUDGET = 100;
    expect(
      count,
      `client/src/ has ${count} 'as any' casts (budget: ${BUDGET}). Reduce before adding more.`
    ).toBeLessThanOrEqual(BUDGET);
  });

  it("shared/ has zero as-any casts", () => {
    const count = countAsAny(path.resolve("shared"));
    expect(
      count,
      `shared/ has ${count} 'as any' casts — shared code must be fully typed.`
    ).toBe(0);
  });
});

describe("Client-side financial calculation gate (T016)", () => {
  const CLIENT_FINANCE_DIRS = [
    path.resolve("client/src/components"),
    path.resolve("client/src/pages"),
    path.resolve("client/src/lib"),
  ];

  const ALLOWLISTED_FILES = new Set([
    "useServerFinancials.ts",
    "usePortfolioFinancials.ts",
    "financialEngine.ts",
    "yearlyAggregator.ts",
    "loanCalculations.ts",
    "equityCalculations.ts",
    "portfolio-helpers.ts",
    "statementBuilders.ts",
    "cash-flow.ts",
    "investment.ts",
    "formatters.ts",
    "auditIncomeStatement.ts",
    "crossCalculatorValidation.ts",
    "formulaChecker.ts",
    "runVerification.ts",
    "known-value-runner.ts",
    "pdfHelpers.ts",
    "pdfChartDrawer.ts",
    "exportStyles.ts",
    "companyExports.ts",
    "property-sheets.ts",
    "map-utils.ts",
    "map-elements.ts",
    "icp-config.ts",
    "PropertyIRRTable.tsx",
    "SensitivityAnalysis.tsx",
    "OverviewTab.tsx",
    "overview-helpers.ts",
    "overviewExportData.ts",
    "DCFAnalysis.tsx",
    "InvestmentAnalysis.tsx",
    "CompanyInvestmentTab.tsx",
  ]);

  const FINANCIAL_CALC_PATTERNS = [
    /\bfunction\s+calculateIRR\b/,
    /\bconst\s+\w+\s*=.*\bcomputeIRR\b/,
    /\bconst\s+equityMultiple\s*=.*\//,
    /\bconst\s+cashOnCash\s*=.*\//,
    /\bconst\s+portfolioIRR\s*=.*calculateIRR/,
    /\bconst\s+totalInitialEquity\s*=.*reduce/,
  ];

  it("no unauthorized financial calculations in client components/pages", () => {
    const violations: string[] = [];

    for (const dir of CLIENT_FINANCE_DIRS) {
      const files = collectTsFiles(dir);
      for (const file of files) {
        const fileName = path.basename(file);
        if (ALLOWLISTED_FILES.has(fileName)) continue;
        if (file.includes("node_modules")) continue;

        const content = fs.readFileSync(file, "utf-8");
        const lines = content.split("\n");

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.trimStart().startsWith("//") || line.trimStart().startsWith("*")) continue;

          for (const pattern of FINANCIAL_CALC_PATTERNS) {
            if (pattern.test(line)) {
              const relFile = path.relative(process.cwd(), file);
              violations.push(
                `  ${relFile}:${i + 1} — unauthorized financial calc: ${pattern.source}\n    ${line.trim().substring(0, 120)}`
              );
            }
          }
        }
      }
    }

    if (violations.length > 0) {
      expect.fail(
        `Found ${violations.length} unauthorized client-side financial calculation(s):\n` +
        `${violations.join("\n")}\n\n` +
        `Financial computations must happen server-side. If this is a legitimate UI-only calculation,\n` +
        `add the file to the ALLOWLISTED_FILES set in this test.`
      );
    }
  });
});
