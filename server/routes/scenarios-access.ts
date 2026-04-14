import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, getAuthUser } from "../auth";
import type { ComputedResultsSnapshot } from "@shared/schema";
import { fromZodError } from "zod-validation-error";
import { z } from "zod";
import { logActivity, logAndSendError } from "./helpers";
import { computePortfolioProjection } from "../finance/service";
import { stableHash } from "../scenarios/stable-json";
import { logger } from "../logger";
import {
  scenarioIdSchema,
  recomputeBodySchema,
  checkScenarioAccess,
  extractScenarioComputeInputs,
  determineDriftStatus,
  buildDriftCheckResponse,
} from "./scenario-helpers";

export function registerScenarioAccessRoutes(app: Express) {
  app.post("/api/scenarios/:id/recompute", requireAuth, async (req, res) => {
    try {
      const idParse = scenarioIdSchema.safeParse(req.params.id);
      if (!idParse.success) return res.status(400).json({ error: "Invalid scenario ID" });
      const scenarioId = idParse.data;

      const bodyParse = recomputeBodySchema.safeParse(req.body);
      if (!bodyParse.success) return res.status(400).json({ error: fromZodError(bodyParse.error).message });

      const scenario = await storage.getScenario(scenarioId);
      if (!scenario) return res.status(404).json({ error: "Scenario not found" });

      if (scenario.userId !== getAuthUser(req).id) {
        return res.status(403).json({ error: "Only the scenario owner can trigger recompute" });
      }

      const { propertyInputs, globalInput, projYears, scenarioProps, scenarioGA } =
        extractScenarioComputeInputs(scenario, bodyParse.data?.projectionYears);

      const computeResult = computePortfolioProjection({
        properties: propertyInputs,
        globalAssumptions: globalInput,
        projectionYears: projYears,
      });

      const inputsPayload = { properties: scenarioProps, globalAssumptions: scenarioGA };
      const inputsHash = stableHash(inputsPayload);

      const stored = await storage.getLatestScenarioResult(scenarioId);
      const { drift, status: driftStatus } = determineDriftStatus(
        stored ? { outputHash: stored.outputHash, engineVersion: stored.engineVersion } : null,
        computeResult.outputHash,
        computeResult.engineVersion
      );

      const savedResult = await storage.saveScenarioResult({
        scenarioId,
        engineVersion: computeResult.engineVersion,
        outputHash: computeResult.outputHash,
        inputsHash,
        consolidatedYearlyJson: computeResult.consolidatedYearly,
        auditOpinion: computeResult.validationSummary.opinion,
        projectionYears: computeResult.projectionYears,
        propertyCount: computeResult.propertyCount,
        computedBy: getAuthUser(req).id,
      });

      const updatedSnapshot: ComputedResultsSnapshot = {
        engineVersion: computeResult.engineVersion,
        computedAt: computeResult.computedAt,
        outputHash: computeResult.outputHash,
        projectionYears: computeResult.projectionYears,
        propertyCount: computeResult.propertyCount,
        auditOpinion: computeResult.validationSummary.opinion,
        consolidatedYearly: computeResult.consolidatedYearly,
      };
      await storage.updateScenarioComputedResults(scenarioId, updatedSnapshot, computeResult.outputHash);

      logger.info(`[recompute] Scenario ${scenarioId}: hash=${computeResult.outputHash.slice(0, 16)}..., opinion=${computeResult.validationSummary.opinion}, drift=${driftStatus}`, "scenario-results");

      res.json({
        id: savedResult.id,
        outputHash: computeResult.outputHash,
        inputsHash,
        auditOpinion: computeResult.validationSummary.opinion,
        engineVersion: computeResult.engineVersion,
        projectionYears: computeResult.projectionYears,
        propertyCount: computeResult.propertyCount,
        drift,
        driftStatus,
        computedAt: savedResult.computedAt,
      });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to recompute scenario", error);
    }
  });

  app.get("/api/scenarios/:id/results/latest", requireAuth, async (req, res) => {
    try {
      const idParse = scenarioIdSchema.safeParse(req.params.id);
      if (!idParse.success) return res.status(400).json({ error: "Invalid scenario ID" });
      const scenarioId = idParse.data;

      const scenario = await storage.getScenario(scenarioId);
      if (!scenario) return res.status(404).json({ error: "Scenario not found" });

      const hasAccess = await checkScenarioAccess(scenarioId, getAuthUser(req).id, scenario);
      if (!hasAccess) return res.status(403).json({ error: "Access denied" });

      const result = await storage.getLatestScenarioResult(scenarioId);
      if (!result) return res.status(404).json({ error: "No computed results found for this scenario" });

      res.json(result);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch scenario result", error);
    }
  });

  app.post("/api/scenarios/:id/drift-check", requireAuth, async (req, res) => {
    try {
      const idParse = scenarioIdSchema.safeParse(req.params.id);
      if (!idParse.success) return res.status(400).json({ error: "Invalid scenario ID" });
      const scenarioId = idParse.data;

      const scenario = await storage.getScenario(scenarioId);
      if (!scenario) return res.status(404).json({ error: "Scenario not found" });

      const hasAccess = await checkScenarioAccess(scenarioId, getAuthUser(req).id, scenario);
      if (!hasAccess) return res.status(403).json({ error: "Access denied" });

      const stored = await storage.getLatestScenarioResult(scenarioId);
      if (!stored) {
        return res.json({ drift: true, status: "no_baseline", details: "No previous computation found" });
      }

      const { propertyInputs, globalInput, projYears } =
        extractScenarioComputeInputs(scenario, stored.projectionYears);

      const computeResult = computePortfolioProjection({
        properties: propertyInputs,
        globalAssumptions: globalInput,
        projectionYears: projYears,
      });

      const driftResponse = buildDriftCheckResponse(stored, computeResult.outputHash, computeResult.engineVersion);
      logger.info(`[drift-check] Scenario ${scenarioId}: status=${driftResponse.status}`, "scenario-results");
      res.json(driftResponse);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to check scenario drift", error);
    }
  });

  const grantAccessSchema = z.object({
    granteeId: z.number().int().positive(),
    scenarioId: z.number().int().positive().nullable().optional(),
  });

  const revokeAccessSchema = z.object({
    granteeId: z.number().int().positive(),
    scenarioId: z.number().int().positive().nullable().optional(),
  });

  app.post("/api/scenarios/access", requireAuth, async (req, res) => {
    try {
      const user = getAuthUser(req);
      const validation = grantAccessSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: fromZodError(validation.error).message });
      }

      const { granteeId, scenarioId } = validation.data;
      const resolvedScenarioId = scenarioId ?? null;

      if (granteeId === user.id) {
        return res.status(400).json({ error: "You cannot grant access to yourself" });
      }

      const grantee = await storage.getUserById(granteeId);
      if (!grantee) {
        return res.status(404).json({ error: "User not found" });
      }

      if (resolvedScenarioId != null) {
        const scenario = await storage.getScenario(resolvedScenarioId);
        if (!scenario) return res.status(404).json({ error: "Scenario not found" });
        if (scenario.userId !== user.id) return res.status(403).json({ error: "You can only grant access to your own scenarios" });
      }

      const access = await storage.grantScenarioAccess(user.id, granteeId, resolvedScenarioId);
      logActivity(req, "grant_access", "scenario_access", access.id, `Grant ${resolvedScenarioId ? `scenario ${resolvedScenarioId}` : "all scenarios"} to user ${granteeId}`);
      res.status(201).json(access);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to grant scenario access", error);
    }
  });

  app.delete("/api/scenarios/access", requireAuth, async (req, res) => {
    try {
      const user = getAuthUser(req);
      const validation = revokeAccessSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: fromZodError(validation.error).message });
      }

      const { granteeId, scenarioId } = validation.data;
      const resolvedScenarioId = scenarioId ?? null;

      await storage.revokeScenarioAccess(user.id, granteeId, resolvedScenarioId);
      logActivity(req, "revoke_access", "scenario_access", null, `Revoke ${resolvedScenarioId ? `scenario ${resolvedScenarioId}` : "all scenarios"} from user ${granteeId}`);
      res.json({ success: true });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to revoke scenario access", error);
    }
  });

  app.get("/api/scenarios/access", requireAuth, async (req, res) => {
    try {
      const user = getAuthUser(req);
      const grants = await storage.getScenarioAccessByOwner(user.id);
      res.json(grants);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch scenario access grants", error);
    }
  });

  app.get("/api/scenarios/shared-with-me", requireAuth, async (req, res) => {
    try {
      const user = getAuthUser(req);
      const sharedScenarios = await storage.getScenariosSharedWithUser(user.id);
      res.json(sharedScenarios);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch shared scenarios", error);
    }
  });
}
