import type { Express } from "express";
import { storage } from "../storage";
import { requireChecker, requireAuth , getAuthUser } from "../auth";
import { isAdminRole } from "@shared/constants";
import { runVerificationWithEngine } from "../calculationChecker";
import { withModelConstants } from "../finance/apply-model-constants";
import { logActivity, logAndSendError, parseRouteId } from "./helpers";
import { logger } from "../logger";
import * as calcSchemas from "../../calc/shared/schemas";
import { computeDCF } from "../../calc/returns/dcf-npv";
import { buildIRRVector } from "../../calc/returns/irr-vector";
import { computeEquityMultiple } from "../../calc/returns/equity-multiple";
import { computeExitValuation } from "../../calc/returns/exit-valuation";
import { validateFinancialIdentities } from "../../calc/validation/financial-identities";
import { checkFundingGates } from "../../calc/validation/funding-gates";
import { reconcileSchedule } from "../../calc/validation/schedule-reconcile";
import { checkAssumptionConsistency } from "../../calc/validation/assumption-consistency";
import { verifyExport } from "../../calc/validation/export-verification";
import { consolidateStatements } from "../../calc/analysis/consolidation";
import { compareScenarios } from "../../calc/analysis/scenario-compare";
import { computeBreakEven } from "../../calc/analysis/break-even";
import { fromZodError } from "zod-validation-error";

import { DEFAULT_ROUNDING } from "../../calc/shared/utils";
import { getOpenAIClient } from "../ai/clients";
import { DEFAULT_OPENAI_MODEL } from "../ai/resolve-llm";
import { logApiCost, estimateCost } from "../middleware/cost-logger";

export function register(app: Express) {
  // ────────────────────────────────────────────────────────────
  // CALCULATION ENDPOINTS
  // POST /api/calc/* — modular financial calculation endpoints
  // ────────────────────────────────────────────────────────────

  app.post("/api/verification/run", requireChecker, async (req, res) => {
    try {
      const calcUser = getAuthUser(req);
      const allProperties = isAdminRole(calcUser.role)
        ? await storage.getAllProperties()
        : await storage.getAllProperties(calcUser.id);
      // Only verify active properties — inactive ones are excluded from all calculations
      const properties = allProperties.filter(p => p.isActive !== false);
      const rawGlobal = await storage.getGlobalAssumptions(calcUser.id);

      if (!rawGlobal) {
        return res.status(400).json({ error: "Global assumptions not found" });
      }

      // Overlay admin-governed Model Constants so verification uses the same
      // numbers as finance/scenarios/exports. Without this, an admin override
      // on (e.g.) daysPerMonth would silently disagree with the rest of the
      // system inside the audit checker.
      const globalAssumptions = await withModelConstants(rawGlobal);

      const report = runVerificationWithEngine(
        properties,
        globalAssumptions,
      );

      const run = await storage.createVerificationRun({
        userId: getAuthUser(req).id,
        passed: report.summary.totalPassed,
        failed: report.summary.totalFailed,
        totalChecks: report.summary.totalChecks,
        auditOpinion: report.summary.auditOpinion,
        overallStatus: report.summary.overallStatus,
        results: { ...report },
      });

      logActivity(req, "run-verification", "verification", run.id, `Audit ${run.id}: ${run.auditOpinion}`);
      res.json(run);
    } catch (error: unknown) {
      logAndSendError(res, "Verification failed", error);
    }
  });

  app.get("/api/verification/history", requireChecker, async (req, res) => {
    try {
      const history = await storage.getVerificationRuns(50);
      res.json(history);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch verification history", error);
    }
  });

  app.get("/api/verification/runs/:id", requireChecker, async (req, res) => {
    try {
      const id = parseRouteId(req.params.id);
      if (!id) return res.status(400).json({ error: "Invalid run ID" });
      const run = await storage.getVerificationRun(id);
      if (!run) return res.status(404).json({ error: "Run not found" });
      res.json(run);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch verification run", error);
    }
  });

  app.post("/api/verification/ai-review", requireChecker, async (req, res) => {
    try {
      const history = await storage.getVerificationRuns(1);
      if (!history.length) {
        return res.status(400).json({ error: "No verification runs found. Run verification first." });
      }
      const latestRun = await storage.getVerificationRun(history[0].id);
      if (!latestRun) {
        return res.status(404).json({ error: "Verification run not found" });
      }

      const _globalAssumptions = await storage.getGlobalAssumptions(getAuthUser(req).id);
      const llmModel = DEFAULT_OPENAI_MODEL;

      const openai = getOpenAIClient();

      interface VerificationCheck { passed?: boolean; metric?: string; gaapRef?: string; variancePct?: number; severity?: string }
      interface PropertyResult { propertyName?: string; checks?: VerificationCheck[] }
      interface VerificationResults {
        summary?: { auditOpinion?: string; overallStatus?: string; totalChecks?: number; totalPassed?: number; totalFailed?: number; criticalIssues?: number; materialIssues?: number };
        propertiesChecked?: number;
        propertyResults?: PropertyResult[];
        companyChecks?: VerificationCheck[];
        consolidatedChecks?: VerificationCheck[];
      }
      const results = latestRun.results as VerificationResults;
      const summaryText = JSON.stringify({
        auditOpinion: results?.summary?.auditOpinion,
        overallStatus: results?.summary?.overallStatus,
        totalChecks: results?.summary?.totalChecks,
        totalPassed: results?.summary?.totalPassed,
        totalFailed: results?.summary?.totalFailed,
        criticalIssues: results?.summary?.criticalIssues,
        materialIssues: results?.summary?.materialIssues,
        propertyCount: results?.propertiesChecked,
        failedChecks: results?.propertyResults
          ?.flatMap((p: PropertyResult) => p.checks?.filter((c: VerificationCheck) => !c.passed).map((c: VerificationCheck) => ({
            property: p.propertyName,
            metric: c.metric,
            gaapRef: c.gaapRef,
            variance: c.variancePct,
            severity: c.severity,
          })) ?? []) ?? [],
        companyFailures: results?.companyChecks?.filter((c: VerificationCheck) => !c.passed) ?? [],
        consolidatedFailures: results?.consolidatedChecks?.filter((c: VerificationCheck) => !c.passed) ?? [],
      }, null, 2);

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      });

      const startTime = Date.now();
      const stream = await openai.chat.completions.create({
        model: llmModel,
        stream: true,
        max_tokens: 2048,
        messages: [
          {
            role: "system",
            content: "You are Rebecca, a GAAP financial auditor for Hospitality Business Group. Write a concise narrative review of the verification results below. Use professional audit language. Highlight any failures, their severity, and recommend next steps. If the opinion is UNQUALIFIED, confirm the financials are fairly stated. Keep the review under 500 words.",
          },
          {
            role: "user",
            content: `Here are the latest verification results:\n\n${summaryText}`,
          },
        ],
      });

      let fullReviewContent = "";
      for await (const chunk of stream) {
        const content = chunk.choices?.[0]?.delta?.content;
        if (content) {
          fullReviewContent += content;
          res.write(`data: ${JSON.stringify({ content })}\n\n`);
        }
      }

      const inTok = Math.round(summaryText.length / 4);
      const outTok = Math.round(fullReviewContent.length / 4);
      try { logApiCost({ timestamp: new Date().toISOString(), service: "openai", model: llmModel, operation: "ai-verification-review", inputTokens: inTok, outputTokens: outTok, estimatedCostUsd: estimateCost("openai", llmModel, inTok, outTok), durationMs: Date.now() - startTime, userId: req.user?.id, route: "/api/verification/ai-review" }); } catch (e: unknown) { logger.warn(`Failed to log API cost: ${(e instanceof Error ? e.message : String(e))}`, "cost-logger"); }

      res.write("data: [DONE]\n\n");
      res.end();
    } catch (error: unknown) {
      if (!res.headersSent) {
        logAndSendError(res, "AI review failed", error);
      } else {
        logger.error(`AI verification review error: ${error instanceof Error ? error.message : String(error)}`, "calculations");
        res.end();
      }
    }
  });

  app.post("/api/calc/dcf", requireAuth, async (req, res) => {
    try {
      const validation = calcSchemas.dcfSchema.safeParse(req.body);
      if (!validation.success) return res.status(400).json({ error: fromZodError(validation.error).message });
      const result = computeDCF({ ...validation.data, rounding_policy: DEFAULT_ROUNDING });
      res.json(result);
    } catch (_error: unknown) {
      res.status(500).json({ error: "DCF calculation failed" });
    }
  });

  app.post("/api/calc/irr-vector", requireAuth, async (req, res) => {
    try {
      const validation = calcSchemas.irrVectorSchema.safeParse(req.body);
      if (!validation.success) return res.status(400).json({ error: fromZodError(validation.error).message });
      const result = buildIRRVector(validation.data);
      res.json(result);
    } catch (_error: unknown) {
      res.status(500).json({ error: "IRR calculation failed" });
    }
  });

  app.post("/api/calc/equity-multiple", requireAuth, async (req, res) => {
    try {
      const validation = calcSchemas.equityMultipleSchema.safeParse(req.body);
      if (!validation.success) return res.status(400).json({ error: fromZodError(validation.error).message });
      const result = computeEquityMultiple({ ...validation.data, rounding_policy: DEFAULT_ROUNDING });
      res.json({ equityMultiple: result });
    } catch (_error: unknown) {
      res.status(500).json({ error: "Equity multiple calculation failed" });
    }
  });

  app.post("/api/calc/exit-valuation", requireAuth, async (req, res) => {
    try {
      const validation = calcSchemas.exitValuationSchema.safeParse(req.body);
      if (!validation.success) return res.status(400).json({ error: fromZodError(validation.error).message });
      const result = computeExitValuation({ ...validation.data, rounding_policy: DEFAULT_ROUNDING });
      res.json(result);
    } catch (_error: unknown) {
      res.status(500).json({ error: "Exit valuation failed" });
    }
  });

  app.post("/api/calc/validate-identities", requireChecker, async (req, res) => {
    try {
      const validation = calcSchemas.financialIdentitiesSchema.safeParse(req.body);
      if (!validation.success) return res.status(400).json({ error: fromZodError(validation.error).message });
      const result = validateFinancialIdentities({ ...validation.data, rounding_policy: DEFAULT_ROUNDING });
      res.json(result);
    } catch (_error: unknown) {
      res.status(500).json({ error: "Identity validation failed" });
    }
  });

  app.post("/api/calc/check-funding-gates", requireChecker, async (req, res) => {
    try {
      const validation = calcSchemas.fundingGatesSchema.safeParse(req.body);
      if (!validation.success) return res.status(400).json({ error: fromZodError(validation.error).message });
      const result = checkFundingGates(validation.data);
      res.json(result);
    } catch (_error: unknown) {
      res.status(500).json({ error: "Funding gate check failed" });
    }
  });

  app.post("/api/calc/reconcile-schedule", requireChecker, async (req, res) => {
    try {
      const validation = calcSchemas.scheduleReconcileSchema.safeParse(req.body);
      if (!validation.success) return res.status(400).json({ error: fromZodError(validation.error).message });
      const result = reconcileSchedule(validation.data);
      res.json(result);
    } catch (_error: unknown) {
      res.status(500).json({ error: "Schedule reconciliation failed" });
    }
  });

  app.post("/api/calc/check-consistency", requireChecker, async (req, res) => {
    try {
      const validation = calcSchemas.assumptionConsistencySchema.safeParse(req.body);
      if (!validation.success) return res.status(400).json({ error: fromZodError(validation.error).message });
      // Inject admin-managed exit-multiple ranges from the analyst
      // intelligence store unless the caller already supplied them
      // (tests/dispatch may pass them inline).
      let exitMultiples = validation.data.exit_multiples;
      // Treat an empty array the same as "not provided" so callers cannot
      // accidentally bypass the watchdog by sending exit_multiples: [].
      if (!exitMultiples || exitMultiples.length === 0) {
        try {
          const rows = await storage.getExitMultiples();
          exitMultiples = rows.map(r => ({
            dimensionKey: r.dimensionKey,
            label: r.label,
            valueLow: r.valueLow,
            valueMid: r.valueMid,
            valueHigh: r.valueHigh,
          }));
        } catch (err) {
          // Non-fatal — guidance is additive. Log and continue without ranges.
          logger.warn(`Failed to load exit_multiples for consistency check: ${(err instanceof Error ? err.message : String(err))}`, "calc");
        }
      }
      const result = checkAssumptionConsistency({ ...validation.data, exit_multiples: exitMultiples });
      res.json(result);
    } catch (_error: unknown) {
      res.status(500).json({ error: "Consistency check failed" });
    }
  });

  app.post("/api/calc/verify-export", requireChecker, async (req, res) => {
    try {
      const validation = calcSchemas.exportVerificationSchema.safeParse(req.body);
      if (!validation.success) return res.status(400).json({ error: fromZodError(validation.error).message });
      const result = verifyExport(validation.data);
      res.json(result);
    } catch (_error: unknown) {
      res.status(500).json({ error: "Export verification failed" });
    }
  });

  app.post("/api/calc/consolidate", requireAuth, async (req, res) => {
    try {
      const validation = calcSchemas.consolidationSchema.safeParse(req.body);
      if (!validation.success) return res.status(400).json({ error: fromZodError(validation.error).message });
      const result = consolidateStatements({ ...validation.data, rounding_policy: DEFAULT_ROUNDING });
      res.json(result);
    } catch (_error: unknown) {
      res.status(500).json({ error: "Consolidation failed" });
    }
  });

  app.post("/api/calc/compare-scenarios", requireAuth, async (req, res) => {
    try {
      const validation = calcSchemas.scenarioCompareSchema.safeParse(req.body);
      if (!validation.success) return res.status(400).json({ error: fromZodError(validation.error).message });
      const result = compareScenarios(validation.data);
      res.json(result);
    } catch (_error: unknown) {
      res.status(500).json({ error: "Scenario comparison failed" });
    }
  });

  app.post("/api/calc/break-even", requireAuth, async (req, res) => {
    try {
      const validation = calcSchemas.breakEvenSchema.safeParse(req.body);
      if (!validation.success) return res.status(400).json({ error: fromZodError(validation.error).message });
      const result = computeBreakEven(validation.data);
      res.json(result);
    } catch (_error: unknown) {
      res.status(500).json({ error: "Break-even analysis failed" });
    }
  });
}
