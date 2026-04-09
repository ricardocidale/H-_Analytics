import { type Express } from "express";
import { storage } from "../../storage";
import { requireAdmin, requireAuth, requireChecker, isApiRateLimited , getAuthUser } from "../../auth";
import { runFillOnlySync, runSmartSync } from "../../syncHelpers";
import { logAndSendError, logActivity } from "../helpers";
import { readFile } from "fs/promises";
import { resolve } from "path";
import { UserRole } from "@shared/constants";
import { execFile } from "child_process";

export function registerToolRoutes(app: Express) {
  app.get("/api/admin/checker-activity", requireAdmin, async (_req, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      const checkerUsers = allUsers.filter((u: any) => u.role === UserRole.CHECKER || u.role === UserRole.ADMIN);
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
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
      logAndSendError(res, "Failed to fetch active sessions", error);
    }
  });

  app.delete("/api/admin/sessions/:id", requireAdmin, async (req, res) => {
    try {
      await storage.forceDeleteSession(String(req.params.id));
      res.json({ success: true });
    } catch (error) {
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
      if (error.code === "ENOENT") {
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
    } catch (error) {
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
        limit: limit ? Number(limit) : 50,
        offset: offset ? Number(offset) : 0,
      });
      res.json(logs.map((l: any) => ({
        ...l,
        userName: `${l.user.firstName} ${l.user.lastName}`.trim() || l.user.email,
      })));
    } catch (error) {
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
        limit: limit ? Number(limit) : 100,
        offset: offset ? Number(offset) : 0,
      });
      res.json(logs.map((l: any) => ({
        ...l,
        userName: `${l.user.firstName} ${l.user.lastName}`.trim() || l.user.email,
      })));
    } catch (error) {
      logAndSendError(res, "Failed to fetch sharing log", error);
    }
  });
}
