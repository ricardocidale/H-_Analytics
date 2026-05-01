import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

function readFile(filePath: string): string {
  return fs.readFileSync(filePath, "utf-8");
}

function fileContains(filePath: string, pattern: RegExp): boolean {
  if (!fs.existsSync(filePath)) return false;
  return pattern.test(fs.readFileSync(filePath, "utf-8"));
}

function scanImports(filePath: string): string[] {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, "utf-8");
  const importRegex = /from\s+["']([^"']+)["']/g;
  const imports: string[] = [];
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }
  return imports;
}

describe("Calculation Checker Boundary Enforcement", () => {
  const CHECKER_DIR = "server/calculation-checker";
  const checkerFiles = fs.readdirSync(CHECKER_DIR, { recursive: true })
    .map(f => path.join(CHECKER_DIR, f as string))
    .filter(f => f.endsWith(".ts") && !f.includes(".test."));

  it("checker directory contains all expected files", () => {
    const names = checkerFiles.map(f => path.basename(f));
    expect(names).toContain("index.ts");
    expect(names).toContain("adapters.ts");
    expect(names).toContain("gaap-checks.ts");
    expect(names).toContain("property-checks.ts");
    expect(names).toContain("portfolio-checks.ts");
    expect(names).toContain("types.ts");
  });

  it("NO checker file imports from @engine/ (boundary rule)", () => {
    for (const file of checkerFiles) {
      const imports = scanImports(file);
      const engineImports = imports.filter(i => i.startsWith("@engine/") || i.startsWith("@engine"));
      expect(engineImports).toEqual([]);
    }
  });

  it("adapters.ts imports from calc/validation/ (not @engine/)", () => {
    const imports = scanImports(path.join(CHECKER_DIR, "adapters.ts"));
    const calcImports = imports.filter(i => i.includes("calc/validation/"));
    expect(calcImports.length).toBeGreaterThanOrEqual(3);
  });

  it("adapters.ts imports from calc/shared/pmt (not @engine/)", () => {
    const imports = scanImports(path.join(CHECKER_DIR, "adapters.ts"));
    const pmtImport = imports.filter(i => i.includes("calc/shared/pmt"));
    expect(pmtImport.length).toBeGreaterThanOrEqual(1);
  });
});

describe("Calculation Checker Adapter Wiring", () => {
  it("adapters.ts exports runFinancialIdentityChecks", () => {
    expect(fileContains(
      "server/calculation-checker/adapters.ts",
      /export function runFinancialIdentityChecks/
    )).toBe(true);
  });

  it("adapters.ts exports runFundingGateChecks", () => {
    expect(fileContains(
      "server/calculation-checker/adapters.ts",
      /export function runFundingGateChecks/
    )).toBe(true);
  });

  it("adapters.ts exports runScheduleReconcileChecks", () => {
    expect(fileContains(
      "server/calculation-checker/adapters.ts",
      /export function runScheduleReconcileChecks/
    )).toBe(true);
  });

  it("adapters.ts calls validateFinancialIdentities from calc/validation", () => {
    expect(fileContains(
      "server/calculation-checker/adapters.ts",
      /validateFinancialIdentities\(/
    )).toBe(true);
  });

  it("adapters.ts calls checkFundingGates from calc/validation", () => {
    expect(fileContains(
      "server/calculation-checker/adapters.ts",
      /checkFundingGates\(/
    )).toBe(true);
  });

  it("adapters.ts calls reconcileSchedule from calc/validation", () => {
    expect(fileContains(
      "server/calculation-checker/adapters.ts",
      /reconcileSchedule\(/
    )).toBe(true);
  });

  it("index.ts imports adapter functions", () => {
    const content = readFile("server/calculation-checker/index.ts");
    expect(content).toContain("runFinancialIdentityChecks");
    expect(content).toContain("runFundingGateChecks");
    expect(content).toContain("runScheduleReconcileChecks");
  });
});

describe("Verification Endpoint Access Policy", () => {
  it("all verification endpoints require admin role", () => {
    const content = readFile("server/routes/calculations.ts");
    const verificationRoutes = content.split("\n").filter(
      line => line.includes("/api/verification/") && (line.includes(".post(") || line.includes(".get("))
    );
    expect(verificationRoutes.length).toBeGreaterThanOrEqual(4);
    for (const route of verificationRoutes) {
      expect(route).toContain("requireAdmin");
    }
  });

  it("all calc tool endpoints require at least auth", () => {
    const content = readFile("server/routes/calculations.ts");
    const calcRoutes = content.split("\n").filter(
      line => line.includes("/api/calc/") && line.includes(".post(")
    );
    expect(calcRoutes.length).toBeGreaterThanOrEqual(4);
    for (const route of calcRoutes) {
      expect(route).toMatch(/requireAuth|requireAdmin/);
    }
  });

  it("checker-specific calc endpoints (validate-identities, check-funding-gates, reconcile-schedule) require admin role", () => {
    const content = readFile("server/routes/calculations.ts");
    const checkerEndpoints = ["/api/calc/validate-identities", "/api/calc/check-funding-gates", "/api/calc/reconcile-schedule"];
    for (const endpoint of checkerEndpoints) {
      const line = content.split("\n").find(l => l.includes(endpoint));
      expect(line).toBeDefined();
      expect(line).toContain("requireAdmin");
    }
  });

  it("verification run endpoint scopes queries to authenticated user", () => {
    const content = readFile("server/routes/calculations.ts");
    expect(content).toContain("getAuthUser(req)");
  });

  it("calc/validation modules exist as independent pure functions", () => {
    expect(fs.existsSync("calc/validation/financial-identities.ts")).toBe(true);
    expect(fs.existsSync("calc/validation/funding-gates.ts")).toBe(true);
    expect(fs.existsSync("calc/validation/schedule-reconcile.ts")).toBe(true);
  });

  it("calc/validation modules do NOT import from server/", () => {
    const validationDir = "calc/validation";
    const files = fs.readdirSync(validationDir)
      .filter(f => f.endsWith(".ts") && !f.includes(".test."));
    for (const file of files) {
      const imports = scanImports(path.join(validationDir, file));
      const serverImports = imports.filter(i => i.includes("server/") || i.startsWith("../../server"));
      expect(serverImports).toEqual([]);
    }
  });
});
