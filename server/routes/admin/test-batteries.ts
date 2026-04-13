import { type Express } from "express";
import { requireAdmin, isApiRateLimited, getAuthUser } from "../../auth";
import { logAndSendError, logActivity } from "../helpers";
import { execFile } from "child_process";
import { checkAllSources } from "../../ai/source-health-checker";
import { detectStaleness } from "../../ai/staleness-detector";
import { storage } from "../../storage";

// ── Types ──────────────────────────────────────────────────────────────────

interface TestResult {
  name: string;
  status: "passed" | "failed" | "skipped";
  duration: number;
  failureMessage?: string;
}

interface BatteryRunResult {
  battery: string;
  passed: number;
  failed: number;
  skipped: number;
  total: number;
  duration: number;
  timestamp: string;
  results: TestResult[];
  error?: string;
}

interface SourceVerificationResult {
  sourceHealth: {
    total: number;
    healthy: number;
    unhealthy: number;
    results: Array<{
      serviceKey: string;
      healthy: boolean;
      latencyMs: number;
      error?: string;
      checkedAt: Date;
    }>;
  };
  staleness: {
    totalProperties: number;
    freshFields: number;
    staleFields: number;
    missingFields: number;
    criticallyStale: string[];
  };
  timestamp: string;
}

// ── Battery definitions ────────────────────────────────────────────────────

const BATTERY_DEFINITIONS: Record<
  string,
  { description: string; glob: string }
> = {
  engine: {
    description: "Financial engine math, defaults, stress tests",
    glob: "tests/engine/",
  },
  golden: {
    description: "Known-correct reference scenarios (golden values)",
    glob: "tests/golden/",
  },
  proof: {
    description: "Hardcoded detection, formula verification, precision",
    glob: "tests/proof/",
  },
  scoring: {
    description: "Confidence and portfolio risk scoring accuracy",
    glob: "tests/ai/confidence-scorer.test.ts tests/ai/portfolio-risk-scorer.test.ts",
  },
  research: {
    description: "Research infrastructure (source health, staleness)",
    glob: "tests/ai/source-health-checker.test.ts tests/ai/staleness-detector.test.ts",
  },
  audit: {
    description: "Architecture compliance and integration checks",
    glob: "tests/audit/",
  },
};

// ── In-memory cache for last run ───────────────────────────────────────────

let lastBatteryRun: BatteryRunResult | null = null;
let batteryRunning = false;

// ── Helpers ────────────────────────────────────────────────────────────────

function stripAnsiCodes(str: string): string {
  return str.replace(/\u001b\[[0-9;]*m/g, "");
}

function runCommand(
  cmd: string,
  args: string[],
  timeoutMs = 300_000,
): Promise<string> {
  return new Promise((resolve) => {
    execFile(
      cmd,
      args,
      {
        cwd: process.cwd(),
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env },
      },
      (_error, stdout, stderr) => {
        resolve((stdout || "") + (stderr || ""));
      },
    );
  });
}

/**
 * Run vitest with JSON reporter and parse the structured output.
 */
async function runBattery(
  batteryKey: string,
  glob: string,
): Promise<BatteryRunResult> {
  const startTime = Date.now();
  const fileArgs = glob.split(/\s+/).filter(Boolean);

  const rawOutput = await runCommand("npx", [
    "vitest",
    "run",
    "--reporter=json",
    ...fileArgs,
  ]);

  // vitest --reporter=json outputs a JSON blob (possibly preceded/followed by text)
  const jsonStart = rawOutput.indexOf("{");
  const jsonEnd = rawOutput.lastIndexOf("}");
  const duration = Date.now() - startTime;

  if (jsonStart < 0 || jsonEnd < 0) {
    return {
      battery: batteryKey,
      passed: 0,
      failed: 0,
      skipped: 0,
      total: 0,
      duration,
      timestamp: new Date().toISOString(),
      results: [],
      error: `Could not parse vitest JSON output (${stripAnsiCodes(rawOutput).slice(0, 500)})`,
    };
  }

  try {
    const json = JSON.parse(rawOutput.slice(jsonStart, jsonEnd + 1));
    const testResults: TestResult[] = [];
    let passed = 0;
    let failed = 0;
    let skipped = 0;

    for (const file of json.testResults ?? []) {
      for (const assertion of file.assertionResults ?? []) {
        const status = assertion.status as "passed" | "failed" | "pending";
        const mapped =
          status === "pending" ? "skipped" : (status as "passed" | "failed");
        if (mapped === "passed") passed++;
        else if (mapped === "failed") failed++;
        else skipped++;

        testResults.push({
          name: assertion.fullName || assertion.title || "unknown",
          status: mapped,
          duration: assertion.duration ?? 0,
          ...(mapped === "failed" && assertion.failureMessages?.length
            ? {
                failureMessage: (assertion.failureMessages as string[])
                  .join("\n")
                  .slice(0, 500),
              }
            : {}),
        });
      }
    }

    return {
      battery: batteryKey,
      passed,
      failed,
      skipped,
      total: passed + failed + skipped,
      duration,
      timestamp: new Date().toISOString(),
      results: testResults,
    };
  } catch {
    return {
      battery: batteryKey,
      passed: 0,
      failed: 0,
      skipped: 0,
      total: 0,
      duration,
      timestamp: new Date().toISOString(),
      results: [],
      error: "Failed to parse vitest JSON output",
    };
  }
}

// ── Route registration ─────────────────────────────────────────────────────

export function registerTestBatteryRoutes(app: Express) {
  // ── List available batteries ────────────────────────────────────────
  app.get("/api/admin/tests/batteries", requireAdmin, (_req, res) => {
    const batteries = Object.entries(BATTERY_DEFINITIONS).map(
      ([key, def]) => ({
        key,
        description: def.description,
      }),
    );
    batteries.push({
      key: "all",
      description: "Run every battery (engine + golden + proof + scoring + research + audit)",
    });
    res.json(batteries);
  });

  // ── Get last battery run result ─────────────────────────────────────
  app.get("/api/admin/tests/last-run", requireAdmin, (_req, res) => {
    if (!lastBatteryRun)
      return res
        .status(404)
        .json({ error: "No battery results yet — run a battery first" });
    res.json(lastBatteryRun);
  });

  // ── Run a specific battery (or "all") ───────────────────────────────
  app.post("/api/admin/tests/run-battery", requireAdmin, async (req, res) => {
    try {
      const { battery } = req.body as { battery?: string };
      if (!battery) {
        return res.status(400).json({ error: "Missing 'battery' in request body" });
      }

      const validKeys = [...Object.keys(BATTERY_DEFINITIONS), "all"];
      if (!validKeys.includes(battery)) {
        return res
          .status(400)
          .json({ error: `Invalid battery '${battery}'. Valid: ${validKeys.join(", ")}` });
      }

      if (batteryRunning) {
        return res.status(429).json({ error: "A battery is already running" });
      }

      // Rate limit: 1 run per 2 minutes
      if (isApiRateLimited(getAuthUser(req).id, "test-battery-run", 1)) {
        return res
          .status(429)
          .json({ error: "Test battery rate-limited to 1 run per 2 minutes" });
      }

      batteryRunning = true;
      logActivity(req, "run-test-battery", "verification", null, battery);

      const startTime = Date.now();

      if (battery === "all") {
        // Run all batteries sequentially so we don't blow up memory
        const allResults: TestResult[] = [];
        let totalPassed = 0;
        let totalFailed = 0;
        let totalSkipped = 0;
        const errors: string[] = [];

        for (const [key, def] of Object.entries(BATTERY_DEFINITIONS)) {
          const result = await runBattery(key, def.glob);
          allResults.push(...result.results);
          totalPassed += result.passed;
          totalFailed += result.failed;
          totalSkipped += result.skipped;
          if (result.error) errors.push(`${key}: ${result.error}`);
        }

        const combined: BatteryRunResult = {
          battery: "all",
          passed: totalPassed,
          failed: totalFailed,
          skipped: totalSkipped,
          total: totalPassed + totalFailed + totalSkipped,
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          results: allResults,
          ...(errors.length ? { error: errors.join("; ") } : {}),
        };

        lastBatteryRun = combined;
        batteryRunning = false;
        return res.json(combined);
      }

      // Single battery
      const def = BATTERY_DEFINITIONS[battery];
      const result = await runBattery(battery, def.glob);
      lastBatteryRun = result;
      batteryRunning = false;
      res.json(result);
    } catch (error: unknown) {
      batteryRunning = false;
      logAndSendError(res, "Test battery failed", error);
    }
  });

  // ── Source verification (health + staleness) ────────────────────────
  app.post(
    "/api/admin/tests/source-verification",
    requireAdmin,
    async (req, res) => {
      try {
        if (isApiRateLimited(getAuthUser(req).id, "source-verification", 1)) {
          return res
            .status(429)
            .json({ error: "Source verification rate-limited to 1 run per minute" });
        }

        logActivity(req, "run-source-verification", "verification");

        // 1. Source health check
        const healthResults = await checkAllSources();

        // 2. Staleness across all users' properties
        const allUsers = await storage.getAllUsers();
        let totalProperties = 0;
        let freshFields = 0;
        let staleFields = 0;
        let missingFields = 0;
        const criticallyStaleSet = new Set<string>();

        for (const user of allUsers) {
          try {
            const report = await detectStaleness(user.id);
            totalProperties += report.totalFields;
            freshFields += report.freshCount;
            staleFields += report.staleCount;
            missingFields += report.missingCount;
            for (const c of report.criticallyStale) {
              criticallyStaleSet.add(c);
            }
          } catch {
            // Skip users with no properties or errors
          }
        }

        const result: SourceVerificationResult = {
          sourceHealth: {
            total: healthResults.length,
            healthy: healthResults.filter((r) => r.healthy).length,
            unhealthy: healthResults.filter((r) => !r.healthy).length,
            results: healthResults,
          },
          staleness: {
            totalProperties,
            freshFields,
            staleFields,
            missingFields,
            criticallyStale: Array.from(criticallyStaleSet),
          },
          timestamp: new Date().toISOString(),
        };

        res.json(result);
      } catch (error: unknown) {
        logAndSendError(res, "Source verification failed", error);
      }
    },
  );

  // ── Financial verification (verify:summary) ─────────────────────────
  app.post(
    "/api/admin/tests/financial-verify",
    requireAdmin,
    async (req, res) => {
      try {
        if (isApiRateLimited(getAuthUser(req).id, "financial-verify", 1)) {
          return res
            .status(429)
            .json({ error: "Financial verify rate-limited to 1 run per minute" });
        }

        logActivity(req, "run-financial-verify", "verification");

        const rawOutput = await runCommand(
          "npx",
          ["tsx", "script/verify-summary.ts"],
          120_000,
        );

        const clean = stripAnsiCodes(rawOutput);

        // Parse opinion from output
        let opinion: "UNQUALIFIED" | "QUALIFIED" | "ADVERSE" = "ADVERSE";
        if (clean.includes("UNQUALIFIED")) opinion = "UNQUALIFIED";
        else if (clean.includes("QUALIFIED")) opinion = "QUALIFIED";

        // Extract pass/fail lines
        const lines = clean.split("\n").filter((l) => l.trim().length > 0);
        const findings = lines
          .filter(
            (l) =>
              l.includes("PASS") ||
              l.includes("FAIL") ||
              l.includes("\u2713") ||
              l.includes("\u2717") ||
              l.includes("\u00d7"),
          )
          .map((l) => l.trim().slice(0, 200));

        res.json({
          opinion,
          findings,
          rawLength: clean.length,
          timestamp: new Date().toISOString(),
        });
      } catch (error: unknown) {
        logAndSendError(res, "Financial verification failed", error);
      }
    },
  );
}
