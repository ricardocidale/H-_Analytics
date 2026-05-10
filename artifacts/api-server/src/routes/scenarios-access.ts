import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, getAuthUser } from "../auth";
import type { ComputedResultsSnapshot } from "@workspace/db";
import { zodErrorMessage } from "./helpers";
import { z } from "zod";
import { logActivity, logAndSendError } from "./helpers";
import { computePortfolioProjection } from "../finance/service";
import { applyModelConstantsToGlobals } from "../finance/apply-model-constants";
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
import {
  HTTP_201_CREATED,
  HTTP_400_BAD_REQUEST,
  HTTP_403_FORBIDDEN,
  HTTP_404_NOT_FOUND,
} from "../constants";

export function registerScenarioAccessRoutes(app: Express) {
  app.post("/api/scenarios/:id/recompute", requireAuth, async (req, res) => {
    try {
      const idParse = scenarioIdSchema.safeParse(req.params.id);
      if (!idParse.success) return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid scenario ID", code: "SCNA-008" });
      const scenarioId = idParse.data;

      const bodyParse = recomputeBodySchema.safeParse(req.body);
      if (!bodyParse.success) return res.status(HTTP_400_BAD_REQUEST).json({ error: zodErrorMessage(bodyParse.error) });

      const scenario = await storage.getScenario(scenarioId);
      if (!scenario) return res.status(HTTP_404_NOT_FOUND).json({ error: "Scenario not found", code: "SCNA-009" });

      if (scenario.userId !== getAuthUser(req).id) {
        return res.status(HTTP_403_FORBIDDEN).json({ error: "Only the scenario owner can trigger recompute", code: "SCNA-010" });
      }

      const { propertyInputs, globalInput, projYears, scenarioProps, scenarioGA } =
        extractScenarioComputeInputs(scenario, bodyParse.data?.projectionYears);

      const modelConstantOverrides = await storage.listModelConstantOverrides();
      const computeResult = computePortfolioProjection({
        properties: propertyInputs,
        globalAssumptions: applyModelConstantsToGlobals(globalInput, modelConstantOverrides),
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
      logAndSendError(res, "Failed to recompute scenario", error, "SCNA-001");
    }
  });

  app.get("/api/scenarios/:id/results/latest", requireAuth, async (req, res) => {
    try {
      const idParse = scenarioIdSchema.safeParse(req.params.id);
      if (!idParse.success) return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid scenario ID", code: "SCNA-011" });
      const scenarioId = idParse.data;

      const scenario = await storage.getScenario(scenarioId);
      if (!scenario) return res.status(HTTP_404_NOT_FOUND).json({ error: "Scenario not found", code: "SCNA-012" });

      const hasAccess = await checkScenarioAccess(scenarioId, getAuthUser(req).id, scenario);
      if (!hasAccess) return res.status(HTTP_403_FORBIDDEN).json({ error: "Access denied", code: "SCNA-013" });

      const result = await storage.getLatestScenarioResult(scenarioId);
      if (!result) return res.status(HTTP_404_NOT_FOUND).json({ error: "No computed results found for this scenario", code: "SCNA-014" });

      res.json(result);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch scenario result", error, "SCNA-002");
    }
  });

  app.post("/api/scenarios/:id/drift-check", requireAuth, async (req, res) => {
    try {
      const idParse = scenarioIdSchema.safeParse(req.params.id);
      if (!idParse.success) return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid scenario ID", code: "SCNA-015" });
      const scenarioId = idParse.data;

      const scenario = await storage.getScenario(scenarioId);
      if (!scenario) return res.status(HTTP_404_NOT_FOUND).json({ error: "Scenario not found", code: "SCNA-016" });

      const hasAccess = await checkScenarioAccess(scenarioId, getAuthUser(req).id, scenario);
      if (!hasAccess) return res.status(HTTP_403_FORBIDDEN).json({ error: "Access denied", code: "SCNA-017" });

      const stored = await storage.getLatestScenarioResult(scenarioId);
      if (!stored) {
        return res.json({ drift: true, status: "no_baseline", details: "No previous computation found" });
      }

      const { propertyInputs, globalInput, projYears } =
        extractScenarioComputeInputs(scenario, stored.projectionYears);

      const modelConstantOverrides = await storage.listModelConstantOverrides();
      const computeResult = computePortfolioProjection({
        properties: propertyInputs,
        globalAssumptions: applyModelConstantsToGlobals(globalInput, modelConstantOverrides),
        projectionYears: projYears,
      });

      const driftResponse = buildDriftCheckResponse(stored, computeResult.outputHash, computeResult.engineVersion);
      logger.info(`[drift-check] Scenario ${scenarioId}: status=${driftResponse.status}`, "scenario-results");
      res.json(driftResponse);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to check scenario drift", error, "SCNA-003");
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
        return res.status(HTTP_400_BAD_REQUEST).json({ error: zodErrorMessage(validation.error) });
      }

      const { granteeId, scenarioId } = validation.data;
      const resolvedScenarioId = scenarioId ?? null;

      if (granteeId === user.id) {
        return res.status(HTTP_400_BAD_REQUEST).json({ error: "You cannot grant access to yourself", code: "SCNA-018" });
      }

      const grantee = await storage.getUserById(granteeId);
      if (!grantee) {
        return res.status(HTTP_404_NOT_FOUND).json({ error: "User not found", code: "SCNA-019" });
      }

      if (resolvedScenarioId != null) {
        const scenario = await storage.getScenario(resolvedScenarioId);
        if (!scenario) return res.status(HTTP_404_NOT_FOUND).json({ error: "Scenario not found", code: "SCNA-020" });
        if (scenario.userId !== user.id) return res.status(HTTP_403_FORBIDDEN).json({ error: "You can only grant access to your own scenarios", code: "SCNA-021" });
      }

      const access = await storage.grantScenarioAccess(user.id, granteeId, resolvedScenarioId);
      logActivity(req, "grant_access", "scenario_access", access.id, `Grant ${resolvedScenarioId ? `scenario ${resolvedScenarioId}` : "all scenarios"} to user ${granteeId}`);
      res.status(HTTP_201_CREATED).json(access);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to grant scenario access", error, "SCNA-004");
    }
  });

  app.delete("/api/scenarios/access", requireAuth, async (req, res) => {
    try {
      const user = getAuthUser(req);
      const validation = revokeAccessSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(HTTP_400_BAD_REQUEST).json({ error: zodErrorMessage(validation.error) });
      }

      const { granteeId, scenarioId } = validation.data;
      const resolvedScenarioId = scenarioId ?? null;

      if (resolvedScenarioId != null) {
        const scenario = await storage.getScenario(resolvedScenarioId);
        if (!scenario) return res.status(HTTP_404_NOT_FOUND).json({ error: "Scenario not found", code: "SCNA-022" });
        if (scenario.userId !== user.id) return res.status(HTTP_403_FORBIDDEN).json({ error: "You can only revoke access to your own scenarios", code: "SCNA-023" });
      }

      await storage.revokeScenarioAccess(user.id, granteeId, resolvedScenarioId);
      logActivity(req, "revoke_access", "scenario_access", null, `Revoke ${resolvedScenarioId ? `scenario ${resolvedScenarioId}` : "all scenarios"} from user ${granteeId}`);
      res.json({ success: true });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to revoke scenario access", error, "SCNA-005");
    }
  });

  app.get("/api/scenarios/access", requireAuth, async (req, res) => {
    try {
      const user = getAuthUser(req);
      const grants = await storage.getScenarioAccessByOwner(user.id);
      res.json(grants);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch scenario access grants", error, "SCNA-006");
    }
  });

  app.get("/api/scenarios/shared-with-me", requireAuth, async (req, res) => {
    try {
      const user = getAuthUser(req);
      const sharedScenarios = await storage.getScenariosSharedWithUser(user.id);
      res.json(sharedScenarios);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch shared scenarios", error, "SCNA-007");
    }
  });
}
