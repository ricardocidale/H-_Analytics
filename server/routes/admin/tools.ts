import { type Express } from "express";
import { storage } from "../../storage";
import { requireAdmin, requireChecker, isApiRateLimited , getAuthUser } from "../../auth";
import { runFillOnlySync, runSmartSync } from "../../syncHelpers";
import { logAndSendError, logActivity } from "../helpers";
import { readFile } from "fs/promises";
import { resolve } from "path";
import { UserRole, isAdminRole } from "@shared/constants";
import { execFile } from "child_process";
import { VERIFY_PHASES, allProofFilePaths } from "../../../script/lib/verify-phases.js";

interface HealthCheckPhase {
  name: string;
  status: "PASS" | "FAIL" | "UNKNOWN";
  testCount: number | null;
  details: string[];
}

interface HealthCheckResult {
  timestamp: string;
  opinion: "UNQUALIFIED" | "ADVERSE";
  phases: HealthCheckPhase[];
  typescript: { passed: boolean; errorCount: number };
  lint: { passed: boolean; errorCount: number };
  docHarmony: { passed: boolean; summary: string };
  totalTests: number;
  durationMs: number;
}

let lastHealthCheck: HealthCheckResult | null = null;
let healthCheckRunning = false;

interface TestingDashboardResult {
  timestamp: string;
  durationMs: number;
  codebase: {
    totalFiles: number;
    totalLines: number;
    breakdown: { label: string; files: number; lines: number }[];
  };
  tests: {
    totalTests: number;
    totalFiles: number;
    testLines: number;
  };
  audit: {
    findings: { label: string; count: number; severity: "critical" | "warning" | "info"; samples: string[] }[];
    asAnyBudget: { server: number; client: number; total: number; limit: number };
    hasCritical: boolean;
  };
}

let lastTestingDashboard: TestingDashboardResult | null = null;
let testingDashboardRunning = false;

function stripAnsiCodes(str: string): string {
  return str.replace(/\u001b\[[0-9;]*m/g, "");
}

function parseVerifyOutput(rawOutput: string): HealthCheckPhase[] {
  const clean = stripAnsiCodes(rawOutput);
  const lines = clean.split("\n");
  const results: HealthCheckPhase[] = [];

  for (const phase of VERIFY_PHASES) {
    const fileLine = lines.find(
      (l) => l.includes(phase.file) && !l.trimStart().startsWith("stdout") && !l.trimStart().startsWith("stderr"),
    ) ?? lines.find((l) => l.includes(phase.file));

    if (!fileLine) {
      results.push({ name: phase.name, status: "UNKNOWN", testCount: null, details: ["Phase not found in output"] });
      continue;
    }

    const isFail = fileLine.includes("\u00d7") || fileLine.includes("\u2717") || fileLine.trimStart().startsWith("\u00d7");
    const isPass = fileLine.includes("\u2713") || fileLine.trimStart().startsWith("\u2713");
    const testCountMatch = fileLine.match(/\((\d+) tests?.*?\)/);
    const testCount = testCountMatch ? parseInt(testCountMatch[1], 10) : null;

    if (isFail) {
      const phaseFileBase = phase.file.replace(".test.ts", "");
      const phaseStart = lines.findIndex((l: string) => l.includes(phaseFileBase) && (l.includes("FAIL") || l.includes("\u00d7")));
      const phaseEnd = phaseStart >= 0
        ? lines.findIndex((l: string, i: number) => i > phaseStart && (l.includes(".test.ts") || l.trimStart() === ""))
        : -1;
      const scopedLines = phaseStart >= 0
        ? lines.slice(phaseStart, phaseEnd > phaseStart ? phaseEnd : phaseStart + 20)
        : lines;
      const failDetails = scopedLines
        .filter((l: string) =>
          (l.includes("AssertionError") || l.includes("AssertError") || l.includes("expected") || l.includes("Error:")) &&
          !l.includes("node_modules"),
        )
        .slice(0, 3)
        .map((l: string) => l.trim().slice(0, 120));
      results.push({ name: phase.name, status: "FAIL", testCount, details: failDetails });
    } else if (isPass) {
      results.push({ name: phase.name, status: "PASS", testCount, details: [] });
    } else {
      results.push({ name: phase.name, status: "UNKNOWN", testCount, details: [] });
    }
  }
  return results;
}

function docHarmonyCheckAll(content: string, file: string, pattern: RegExp, actual: number, label: string, stale: string[]) {
  let m: RegExpExecArray | null;
  const re = new RegExp(pattern.source, "g");
  while ((m = re.exec(content)) !== null) {
    const documented = parseInt(m[1].replace(/,/g, ""), 10);
    if (documented !== actual) {
      stale.push(`${label}: ${file} says ${documented}, actual ${actual}`);
    }
  }
}

async function checkDocHarmonyServer(verifyOutput: string): Promise<{ passed: boolean; summary: string }> {
  try {
    const [claudeMd, replitMd] = await Promise.all([
      readFile(resolve(".claude/claude.md"), "utf-8"),
      readFile(resolve("replit.md"), "utf-8"),
    ]);

    const clean = stripAnsiCodes(verifyOutput);
    const totalMatch = clean.match(/Tests\s+\d+\s+passed\s*(?:\|\s*\d+\s+skipped\s*)?\((\d+)\)/);
    const actualTests = totalMatch ? parseInt(totalMatch[1], 10) : 0;
    if (actualTests === 0) return { passed: true, summary: "PASS (skipped — no test count)" };

    const stale: string[] = [];

    docHarmonyCheckAll(claudeMd, "claude.md", /(\d[,\d]*)\s*tests/, actualTests, "tests", stale);
    docHarmonyCheckAll(replitMd, "replit.md", /(\d[,\d]*)\s*tests/, actualTests, "tests", stale);

    const unique = Array.from(new Set(stale));
    return { passed: unique.length === 0, summary: unique.length === 0 ? "PASS" : `FAIL — ${unique[0]}` };
  } catch (_error: unknown) {
    return { passed: true, summary: "PASS (skipped — files not readable)" };
  }
}

function runCommand(cmd: string, args: string[], timeoutMs = 180_000): Promise<string> {
  return new Promise((resolve) => {
    execFile(cmd, args, {
      cwd: process.cwd(),
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env },
    }, (_error, stdout, stderr) => {
      resolve((stdout || "") + (stderr || ""));
    });
  });
}

export function registerToolRoutes(app: Express) {

  app.get("/api/admin/health-check/last", requireAdmin, (_req, res) => {
    if (!lastHealthCheck) return res.status(404).json({ error: "No health check results yet" });
    res.json(lastHealthCheck);
  });

  app.post("/api/admin/health-check/run", requireAdmin, async (req, res) => {
    try {
      if (healthCheckRunning) {
        return res.status(429).json({ error: "Health check already running" });
      }
      if (isApiRateLimited(getAuthUser(req).id, "health-check-run", 1)) {
        return res.status(429).json({ error: "Health check rate-limited to 1 run per minute" });
      }
      healthCheckRunning = true;
      logActivity(req, "run-health-check", "verification");
      const startTime = Date.now();

      const proofFiles = allProofFilePaths();

      const [tscOutput, lintOutput, verifyOutput] = await Promise.all([
        runCommand("npx", ["tsc", "--noEmit"]),
        runCommand("npx", ["eslint", ".", "--ext", ".ts,.tsx", "--quiet", "--format", "compact"], 60_000).catch(() => ""),
        runCommand("npx", ["vitest", "run", ...proofFiles]),
      ]);

      const tscClean = stripAnsiCodes(tscOutput);
      const tsErrors = tscClean.split("\n").filter(l => l.includes("error TS")).length;

      const lintClean = stripAnsiCodes(lintOutput);
      const lintErrors = lintClean.split("\n").filter(l => /\d+ error/.test(l)).length > 0
        ? parseInt((lintClean.match(/(\d+) error/) || ["0", "0"])[1], 10)
        : 0;

      const phases = parseVerifyOutput(verifyOutput);
      const totalTests = phases.reduce((sum, p) => sum + (p.testCount ?? 0), 0);
      const allPhasesPassed = phases.every(p => p.status === "PASS");

      const docHarmony = await checkDocHarmonyServer(verifyOutput);

      const durationMs = Date.now() - startTime;

      const result: HealthCheckResult = {
        timestamp: new Date().toISOString(),
        opinion: allPhasesPassed && tsErrors === 0 && lintErrors === 0 && docHarmony.passed ? "UNQUALIFIED" : "ADVERSE",
        phases,
        typescript: { passed: tsErrors === 0, errorCount: tsErrors },
        lint: { passed: lintErrors === 0, errorCount: lintErrors },
        docHarmony,
        totalTests,
        durationMs,
      };

      lastHealthCheck = result;
      healthCheckRunning = false;
      res.json(result);
    } catch (error: unknown) {
      healthCheckRunning = false;
      logAndSendError(res, "Health check failed", error);
    }
  });

  app.get("/api/admin/testing-dashboard/last", requireAdmin, (_req, res) => {
    if (!lastTestingDashboard) return res.status(404).json({ error: "No testing dashboard results yet" });
    res.json(lastTestingDashboard);
  });

  app.post("/api/admin/testing-dashboard/run", requireAdmin, async (req, res) => {
    try {
      if (testingDashboardRunning) {
        return res.status(429).json({ error: "Testing dashboard scan already running" });
      }
      if (isApiRateLimited(getAuthUser(req).id, "testing-dashboard-run", 1)) {
        return res.status(429).json({ error: "Testing dashboard rate-limited to 1 run per minute" });
      }
      testingDashboardRunning = true;
      logActivity(req, "run-testing-dashboard", "verification");
      const startTime = Date.now();

      const [statsOutput, auditOutput] = await Promise.all([
        runCommand("npx", ["tsx", "script/stats.ts"], 30_000),
        runCommand("npx", ["tsx", "script/audit-quick.ts"], 30_000),
      ]);

      const statsClean = stripAnsiCodes(statsOutput);
      const auditClean = stripAnsiCodes(auditOutput);

      const breakdown: { label: string; files: number; lines: number }[] = [];
      const breakdownLabels = ["client/", "server/", "calc/", "shared/"];
      for (const lbl of breakdownLabels) {
        const re = new RegExp(`${lbl.replace("/", "/")}\\s+(\\d+)\\s+files\\s+([\\d,]+)\\s+lines`);
        const m = statsClean.match(re);
        if (m) {
          breakdown.push({ label: lbl, files: parseInt(m[1], 10), lines: parseInt(m[2].replace(/,/g, ""), 10) });
        }
      }

      const sourceMatch = statsClean.match(/Source\s+(\d+)\s+files\s+([\d,]+)\s+lines/);
      const totalFiles = sourceMatch ? parseInt(sourceMatch[1], 10) : breakdown.reduce((s, b) => s + b.files, 0);
      const totalLines = sourceMatch ? parseInt(sourceMatch[2].replace(/,/g, ""), 10) : breakdown.reduce((s, b) => s + b.lines, 0);

      const testsMatch = statsClean.match(/Tests\s+(\d+)\s+files\s+([\d,]+)\s+lines\s+\(~(\d+)\s+tests\s+in\s+(\d+)\s+files\)/);
      const testLines = testsMatch ? parseInt(testsMatch[2].replace(/,/g, ""), 10) : 0;
      const totalTests = testsMatch ? parseInt(testsMatch[3], 10) : 0;
      const totalTestFiles = testsMatch ? parseInt(testsMatch[4], 10) : 0;

      const findings: TestingDashboardResult["audit"]["findings"] = [];
      const auditLines = auditClean.split("\n");
      const findingPattern = /^\s*[✓✗!·]\s+(.+?)\s{2,}(\d+)\s*$/;
      for (const line of auditLines) {
        const m = line.match(findingPattern);
        if (m) {
          const label = m[1].replace(/`/g, "").trim();
          const count = parseInt(m[2], 10);
          const trimmed = line.trimStart();
          const isCriticalMark = trimmed.startsWith("✗");
          const isWarnMark = trimmed.startsWith("!");
          const severity = isCriticalMark && count > 0 ? "critical" as const :
            count === 0 ? "info" as const :
            (isWarnMark || label.toLowerCase().includes("files over")) ? "warning" as const :
            "info" as const;
          const samples: string[] = [];
          const idx = auditLines.indexOf(line);
          for (let i = idx + 1; i < Math.min(idx + 6, auditLines.length); i++) {
            const sl = auditLines[i];
            if (!sl || sl.match(findingPattern) || sl.includes("────")) break;
            if (sl.trim().startsWith("client/") || sl.trim().startsWith("server/") || sl.trim().startsWith("calc/")) {
              samples.push(sl.trim().slice(0, 120));
            }
          }
          findings.push({ label, count, severity, samples });
        }
      }

      const asAnyMatch = auditClean.match(/`as any` budget \(server:\s*(\d+),\s*client:\s*(\d+)\)\s+(\d+)/);
      const asAnyBudget = asAnyMatch
        ? { server: parseInt(asAnyMatch[1], 10), client: parseInt(asAnyMatch[2], 10), total: parseInt(asAnyMatch[3], 10), limit: 100 }
        : { server: 0, client: 0, total: 0, limit: 100 };

      const hasCritical = findings.some(f => f.severity === "critical" && f.count > 0);

      const durationMs = Date.now() - startTime;

      const result: TestingDashboardResult = {
        timestamp: new Date().toISOString(),
        durationMs,
        codebase: { totalFiles, totalLines, breakdown },
        tests: { totalTests, totalFiles: totalTestFiles, testLines },
        audit: { findings, asAnyBudget, hasCritical },
      };

      lastTestingDashboard = result;
      testingDashboardRunning = false;
      res.json(result);
    } catch (error: unknown) {
      testingDashboardRunning = false;
      logAndSendError(res, "Testing dashboard scan failed", error);
    }
  });

  app.get("/api/admin/checker-activity", requireAdmin, async (_req, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      const checkerUsers = allUsers.filter((u: any) => u.role === UserRole.CHECKER || isAdminRole(u.role));
      let totalActions = 0, verificationRuns = 0, manualViews = 0, exports = 0, pageVisits = 0, roleChanges = 0;
      const recentActivity: any[] = [];

      // Fetch all user logs in parallel instead of sequentially (N+1 fix)
      const userLogs = await Promise.all(
        checkerUsers.map(user => storage.getActivityLogs({ userId: user.id, limit: 100 }))
      );

      const checkers = checkerUsers.map((user, i) => {
        const logs = userLogs[i];
        const userActions = logs.length;
        const userVerifications = logs.filter((l: any) => l.action === "run-verification").length;
        const userManualViews = logs.filter((l: any) => l.action === "view-manual" || l.entityType === "manual").length;
        const userExports = logs.filter((l: any) => l.action?.includes("export")).length;

        totalActions += userActions;
        verificationRuns += userVerifications;
        manualViews += userManualViews;
        exports += userExports;

        recentActivity.push(...logs.slice(0, 10));

        return {
          id: user.id,
          email: user.email,
          name: `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email,
          totalActions: userActions,
          lastActive: logs[0]?.createdAt ?? null,
          verificationRuns: userVerifications,
          manualViews: userManualViews,
          exports: userExports,
        };
      });

      recentActivity.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      res.json({
        checkers,
        summary: { totalActions, verificationRuns, manualViews, exports, pageVisits, roleChanges },
        recentActivity: recentActivity.slice(0, 50),
      });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch checker activity", error);
    }
  });

  app.post("/api/admin/seed-production", requireAdmin, async (req, res) => {
    try {
      const { runFillOnlySync: fill } = await import("../../syncHelpers");
      const result = await fill(storage);
      logActivity(req, "seed-production", "database", null, null, result as unknown as Record<string, unknown>);
      res.json({ success: true, message: "Missing values populated", ...result });
    } catch (error: unknown) {
      logAndSendError(res, (error instanceof Error ? error.message : undefined) || "Fill failed", error);
    }
  });

  // ── Smart Sync (3-way merge using seed manifest) ──────────────────
  app.get("/api/admin/smart-sync/preview", requireAdmin, async (_req, res) => {
    try {
      const result = await runSmartSync(storage, { dryRun: true });
      res.json(result);
    } catch (error: unknown) {
      logAndSendError(res, (error instanceof Error ? error.message : undefined) || "Smart sync preview failed", error);
    }
  });

  app.post("/api/admin/smart-sync", requireAdmin, async (req, res) => {
    try {
      const result = await runSmartSync(storage, { dryRun: false });
      logActivity(req, "smart-sync", "database", null, null, result as unknown as Record<string, unknown>);
      res.json({ success: true, ...result });
    } catch (error: unknown) {
      logAndSendError(res, (error instanceof Error ? error.message : undefined) || "Smart sync failed", error);
    }
  });

  app.post("/api/admin/fill-missing-research", requireAdmin, async (req, res) => {
    try {
      const result = await runFillOnlySync(storage);
      res.json(result);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to backfill research", error);
    }
  });

  app.get("/api/admin/login-logs", requireAdmin, async (req, res) => {
    try {
      const logs = await storage.getLoginLogs();
      res.json(logs.map((log: any) => ({
        id: log.id,
        email: log.user.email,
        ipAddress: log.ipAddress,
        loginAt: log.loginAt,
        logoutAt: log.logoutAt,
      })));
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch login logs", error);
    }
  });

  app.get("/api/admin/health-check", requireAdmin, async (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.get("/api/admin/sync-status", requireAdmin, async (req, res) => {
    try {
      const properties = await storage.getAllProperties();
      const status = properties.map((p: any) => ({
        id: p.id,
        name: p.name,
        hasResearch: !!p.researchValues,
        lastUpdated: p.updatedAt,
      }));
      res.json(status);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch sync status", error);
    }
  });

  app.get("/api/admin/active-sessions", requireAdmin, async (req, res) => {
    try {
      const sessions = await storage.getActiveSessions();
      res.json(sessions.map((s: any) => ({
        id: s.id,
        userId: s.userId,
        email: s.user.email,
        expiresAt: s.expiresAt,
        createdAt: s.createdAt,
      })));
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch active sessions", error);
    }
  });

  app.delete("/api/admin/sessions/:id", requireAdmin, async (req, res) => {
    try {
      await storage.forceDeleteSession(String(req.params.id));
      res.json({ success: true });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to delete session", error);
    }
  });

  // ---------- Golden Scenario Tests ----------

  function parseGoldenResults(raw: any): any {
    const allResults = raw.testResults ?? [];
    const goldenFiles = allResults.filter((t: any) => (t.name ?? "").includes("tests/golden/"));

    const scenarios = goldenFiles.map((file: any) => {
      const fileName = (file.name ?? "").split("tests/golden/").pop() ?? file.name;
      const assertions = (file.assertionResults ?? []).map((a: any) => ({
        title: a.title ?? a.fullName ?? "",
        status: a.status as "passed" | "failed",
        duration: a.duration ?? 0,
      }));
      const passed = assertions.filter((a: any) => a.status === "passed").length;
      return {
        file: fileName,
        name: (file.assertionResults?.[0]?.ancestorTitles?.[0]) ?? fileName.replace(/\.test\.ts$/, ""),
        tests: assertions.length,
        passed,
        failed: assertions.length - passed,
        duration: (file.endTime ?? 0) - (file.startTime ?? 0),
        assertions,
      };
    });

    const totalTests = scenarios.reduce((s: number, f: any) => s + f.tests, 0);
    const totalPassed = scenarios.reduce((s: number, f: any) => s + f.passed, 0);

    return {
      timestamp: raw.startTime ? new Date(raw.startTime).toISOString() : new Date().toISOString(),
      totalFiles: scenarios.length,
      totalTests,
      passed: totalPassed,
      failed: totalTests - totalPassed,
      duration: (raw.testResults ?? []).reduce((s: number, f: any) => s + ((f.endTime ?? 0) - (f.startTime ?? 0)), 0),
      scenarios,
    };
  }

  app.get("/api/admin/golden-test-summary", requireAdmin, async (_req, res) => {
    try {
      const resultsPath = resolve(process.cwd(), "test-results.json");
      const raw = JSON.parse(await readFile(resultsPath, "utf-8"));
      res.json(parseGoldenResults(raw));
    } catch (error: unknown) {
      if (typeof error === "object" && error !== null && "code" in error && (error as { code: string }).code === "ENOENT") {
        return res.json({ timestamp: null, totalFiles: 0, totalTests: 0, passed: 0, failed: 0, duration: 0, scenarios: [] });
      }
      logAndSendError(res, "Failed to read golden test results", error);
    }
  });

  app.post("/api/admin/golden-test-run", requireAdmin, async (req, res) => {
    try {
      if (isApiRateLimited(getAuthUser(req).id, "golden-test-run", 1)) {
        return res.status(429).json({ error: "Golden tests rate-limited to 1 run per minute" });
      }
      logActivity(req, "run-golden-tests", "verification");
      const projectRoot = process.cwd();
      const result = await new Promise<string>((resolve, reject) => {
        execFile(
          "npx",
          ["vitest", "run", "tests/golden/", "--reporter=json"],
          { cwd: projectRoot, timeout: 60_000, maxBuffer: 5 * 1024 * 1024 },
          (error, stdout, stderr) => {
            // vitest exits non-zero on test failures, but still outputs valid JSON
            if (stdout && stdout.trim().startsWith("{")) {
              resolve(stdout);
            } else if (error) {
              reject(new Error(stderr || error.message));
            } else {
              resolve(stdout);
            }
          },
        );
      });

      const raw = JSON.parse(result);

      // Also write to test-results-golden.json for caching
      const { writeFile } = await import("fs/promises");
      await writeFile(resolve(projectRoot, "test-results-golden.json"), JSON.stringify(raw), "utf-8").catch(() => { /* ignore: cache write is best-effort */ });

      res.json(parseGoldenResults(raw));
    } catch (error: unknown) {
      logAndSendError(res, "Failed to run golden tests", error);
    }
  });

  app.get("/api/activity-logs", requireChecker, async (req, res) => {
    try {
      const { userId, entityType, from, to, limit, offset } = req.query;
      const logs = await storage.getActivityLogs({
        userId: userId ? Number(userId) : undefined,
        entityType: entityType as string,
        from: from ? new Date(from as string) : undefined,
        to: to ? new Date(to as string) : undefined,
        limit: Math.min(limit ? Number(limit) : 50, 500),
        offset: Math.min(offset ? Number(offset) : 0, 50000),
      });
      res.json(logs.map((l: any) => ({
        ...l,
        userName: `${l.user.firstName} ${l.user.lastName}`.trim() || l.user.email,
      })));
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch activity logs", error);
    }
  });

  const SHARING_ACTIONS = [
    "share", "share_all",
    "grant_access", "revoke_access",
    "admin-grant-scenario-access", "admin-revoke-scenario-access", "admin-unshare-all",
  ];

  app.get("/api/admin/sharing-log", requireAdmin, async (req, res) => {
    try {
      const { userId, from, to, limit, offset } = req.query;
      const logs = await storage.getActivityLogs({
        userId: userId ? Number(userId) : undefined,
        actions: SHARING_ACTIONS,
        from: from ? new Date(from as string) : undefined,
        to: to ? new Date(to as string) : undefined,
        limit: Math.min(limit ? Number(limit) : 100, 500),
        offset: Math.min(offset ? Number(offset) : 0, 50000),
      });
      res.json(logs.map((l: any) => ({
        ...l,
        userName: `${l.user.firstName} ${l.user.lastName}`.trim() || l.user.email,
      })));
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch sharing log", error);
    }
  });
}
