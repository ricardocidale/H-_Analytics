import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

function scanPath(target: string, regex: RegExp): string[] {
  const results: string[] = [];
  if (!fs.existsSync(target)) return results;
  const stat = fs.statSync(target);
  if (stat.isFile()) {
    const norm = target.replace(/\\/g, "/");
    const lines = fs.readFileSync(target, "utf-8").split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (regex.test(lines[i])) results.push(`${norm}:${i + 1}:${lines[i]}`);
    }
    return results;
  }
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    const full = path.join(target, entry.name);
    const norm = full.replace(/\\/g, "/");
    if (entry.isDirectory()) results.push(...scanPath(full, regex));
    else if (entry.name.endsWith(".ts") && !entry.name.includes(".test.")) {
      const lines = fs.readFileSync(full, "utf-8").split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) results.push(`${norm}:${i + 1}:${lines[i]}`);
      }
    }
  }
  return results;
}

function grepServer(pattern: string, searchPath = "server/"): string[] {
  return scanPath(searchPath, new RegExp(pattern));
}

function grepRoutes(pattern: string): string[] {
  return grepServer(pattern, "server/routes/");
}

function readFileLines(filePath: string): string[] {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, "utf-8").split("\n");
}

function scanFilesForPattern(dir: string, regex: RegExp, ext = ".ts"): string[] {
  const results: string[] = [];
  function walk(d: string) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(ext) && !entry.name.includes(".test.")) {
        const lines = fs.readFileSync(full, "utf-8").split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (regex.test(lines[i])) results.push(`${full}:${i + 1}:${lines[i]}`);
        }
      }
    }
  }
  walk(dir);
  return results;
}

describe("Endpoint Security Audit — Auth Middleware", () => {
  const AUTH_ALLOWED = [
    "auth/login",
    "auth/admin-login",
    "auth/dev-login",
    "auth/logout",
    "auth/google",
    "// public",
    "// public webhook",
  ];

  function isExempt(line: string): boolean {
    return AUTH_ALLOWED.some(exempt => line.includes(exempt)) || line.includes(".test.");
  }

  it("all POST endpoints have authentication middleware", () => {
    const postRoutes = grepRoutes("\\.(post)\\(");
    const unprotected = postRoutes.filter(
      line =>
        !line.includes("requireAuth") &&
        !line.includes("requireAdmin") &&
        !line.includes("requireManagement") &&
        !line.includes("requireChecker") &&
        !isExempt(line)
    );
    expect(unprotected).toEqual([]);
  });

  it("all PUT endpoints have authentication middleware", () => {
    const putRoutes = grepRoutes("\\.(put)\\(");
    const unprotected = putRoutes.filter(
      line =>
        !line.includes("requireAuth") &&
        !line.includes("requireAdmin") &&
        !line.includes("requireManagement") &&
        !isExempt(line)
    );
    expect(unprotected).toEqual([]);
  });

  it("all PATCH endpoints have authentication middleware", () => {
    const patchRoutes = grepRoutes("\\.(patch)\\(");
    const unprotected = patchRoutes.filter(
      line =>
        !line.includes("requireAuth") &&
        !line.includes("requireAdmin") &&
        !line.includes("requireManagement") &&
        !isExempt(line)
    );
    expect(unprotected).toEqual([]);
  });

  it("all DELETE endpoints have authentication middleware", () => {
    const deleteRoutes = grepRoutes("\\.(delete)\\(\"/api/");
    const unprotected = deleteRoutes.filter(
      line =>
        !line.includes("requireAuth") &&
        !line.includes("requireAdmin") &&
        !line.includes("requireManagement") &&
        !line.includes("requireChecker") &&
        !isExempt(line)
    );
    expect(unprotected).toEqual([]);
  });
});

describe("Endpoint Security Audit — Rate Limiting", () => {
  const RATE_LIMITED_ENDPOINTS = [
    { name: "finance-compute", file: "finance.ts" },
    { name: "geocode", file: "geospatial.ts" },
    { name: "market-research", file: "research.ts" },
    { name: "document-extract", file: "documents.ts" },
    { name: "icp-research", file: "icp-research.ts" },
    { name: "upload", file: "uploads.ts" },
  ];

  for (const { name, file } of RATE_LIMITED_ENDPOINTS) {
    it(`${name} endpoint in ${file} has rate limiting`, () => {
      const lines = grepServer(`isApiRateLimited.*"${name}"`, "server/routes/");
      const matchingFile = lines.filter(l => l.includes(file));
      expect(matchingFile.length).toBeGreaterThanOrEqual(1);
    });
  }
});

describe("Endpoint Security Audit — Zod Validation", () => {
  it("properties POST route validates body with Zod schema", () => {
    const lines = grepServer("insertPropertySchema|propertyInsertSchema|Schema\\.parse|safeParse", "server/routes/properties.ts");
    expect(lines.length).toBeGreaterThan(0);
  });

  it("global-assumptions PUT route validates body with Zod schema", () => {
    const lines = grepServer("Schema\\.parse|safeParse|globalAssumptions.*Schema", "server/routes/global-assumptions.ts");
    expect(lines.length).toBeGreaterThan(0);
  });

  it("scenarios POST route validates body with Zod schema", () => {
    const lines = grepServer("Schema\\.parse|safeParse|scenarioCreate|createScenario", "server/routes/scenarios.ts");
    expect(lines.length).toBeGreaterThan(0);
  });

  it("export-generate POST route validates body with Zod schema", () => {
    const lines = grepServer("generateExportSchema|Schema\\.parse|safeParse", "server/routes/export-generate.ts");
    expect(lines.length).toBeGreaterThan(0);
  });

  it("finance compute POST validates body with Zod schema", () => {
    const lines = grepServer("Schema\\.parse|safeParse|computeRequestSchema", "server/routes/finance.ts");
    expect(lines.length).toBeGreaterThan(0);
  });
});

describe("Endpoint Security Audit — Code Quality", () => {
  it("no console.log in production server code (except logger)", () => {
    const consoleLogs = grepServer("console\\.log\\(");
    const violations = consoleLogs.filter(
      line => !line.includes("logger.ts") && !line.includes(".test.")
    );
    expect(violations).toEqual([]);
  });

  it("no hardcoded secrets or API keys in server source", () => {
    const secretPattern = /(sk-|api_key|secret_key)\s*=\s*["']/;
    const hardcoded = scanFilesForPattern("server", secretPattern);
    const violations = hardcoded.filter(
      l => !l.includes(".test.") && !l.includes("example") && !l.includes("placeholder")
    );
    expect(violations).toEqual([]);
  });
});
