import type { Express } from "express";
import { storage } from "../storage";
import { requireManagementAccess, requireAuth , getAuthUser } from "../auth";
import { updateScenarioSchema } from "@shared/schema";
import type {
  ScenarioGlobalAssumptionsSnapshot,
  ScenarioPropertySnapshot,
  ScenarioFeeCategorySnapshot,
} from "@shared/schema";

import { fromZodError } from "zod-validation-error";
import { z } from "zod";
import { logActivity, logAndSendError, createScenarioSchema, MAX_SCENARIOS_PER_USER, fullName } from "./helpers";
import { logger } from "../logger";
import { invalidateComputeCache } from "../finance/cache";
import { sendScenarioShareNotification, sendAdminShareNotification } from "../integrations/resend";
import { UserRole } from "@shared/constants";
import {
  requireScenarioPermission,
  importScenarioSchema,
  shareScenarioSchema,
  scenarioIdSchema,
  checkScenarioAccess,
  extractScenarioComputeInputs,
  buildCreateSnapshotData,
  tryComputeResults,
  validateLoadSnapshot,
  checkSharedPropertyAccess,
  buildPreviewData,
  buildCrossQueryResult,
  computeGhostName,
} from "./scenario-helpers";
import { registerScenarioAccessRoutes } from "./scenarios-access";

export function register(app: Express) {
  app.get("/api/scenarios", requireAuth, async (req, res) => {
    try {
      const userId = getAuthUser(req).id;
      const owned = await storage.getScenariosByUser(userId);
      const shared = await storage.getScenariosSharedWithUser(userId);

      const userVisible = owned.filter(s => s.kind === "manual");
      const ownedWithAccess = userVisible.map(s => ({ ...s, accessType: "owned" as const, sharedByUserId: null, sharedByName: null }));
      res.json([...ownedWithAccess, ...shared]);
    } catch (error) {
      logAndSendError(res, "Failed to fetch scenarios", error);
    }
  });

  app.post("/api/scenarios/auto-save", requireManagementAccess, async (req, res) => {
    try {
      const user = getAuthUser(req);
      const { scenarioGA, scenarioProps, propertyFeeCategories, propertyPhotos } = await buildCreateSnapshotData(user.id);
      const { computedResults, computeHash } = tryComputeResults(scenarioGA, scenarioProps);

      const existing = await storage.getAutoSaveScenario(user.id);
      if (existing) {
        const updated = await storage.updateScenarioSnapshot(existing.id, {
          globalAssumptions: scenarioGA,
          properties: scenarioProps,
          feeCategories: propertyFeeCategories,
          propertyPhotos,
          computedResults,
          computeHash,
        });
        res.json({ success: true, scenario: updated });
      } else {
        const fi = (user.firstName || "")[0]?.toUpperCase() || "";
        const li = (user.lastName || "")[0]?.toUpperCase() || "";
        const initials = (fi + li) || user.email.split("@")[0].slice(0, 2).toUpperCase();

        try {
          const scenario = await storage.createScenario({
            userId: user.id,
            name: `${initials} Auto-Save`,
            globalAssumptions: scenarioGA,
            properties: scenarioProps,
            feeCategories: propertyFeeCategories,
            propertyPhotos,
            computedResults,
            computeHash,
            kind: "autosave",
          });
          res.json({ success: true, scenario });
        } catch (createErr: unknown) {
          const dbErr = createErr as Record<string, unknown>;
          if (dbErr?.code === "23505") {
            const raced = await storage.getAutoSaveScenario(user.id);
            if (raced) {
              const updated = await storage.updateScenarioSnapshot(raced.id, {
                globalAssumptions: scenarioGA,
                properties: scenarioProps,
                feeCategories: propertyFeeCategories,
                propertyPhotos,
                computedResults,
                computeHash,
              });
              res.json({ success: true, scenario: updated });
              return;
            }
          }
          throw createErr;
        }
      }
    } catch (error) {
      logAndSendError(res, "Failed to auto-save scenario", error);
    }
  });

  app.get("/api/scenarios/auto-save/check", requireAuth, async (req, res) => {
    try {
      const existing = await storage.getAutoSaveScenario(getAuthUser(req).id);
      res.json({ exists: !!existing, updatedAt: existing?.updatedAt?.toISOString() ?? null });
    } catch (error) {
      logAndSendError(res, "Failed to check auto-save", error);
    }
  });

  app.get("/api/scenarios/suggest-name", requireAuth, async (req, res) => {
    try {
      const user = getAuthUser(req);
      const count = await storage.countManualScenarios(user.id);
      const suggestion = computeGhostName(count, user);
      res.json({ suggestion });
    } catch (error) {
      logAndSendError(res, "Failed to suggest scenario name", error);
    }
  });

  app.post("/api/scenarios", requireManagementAccess, requireScenarioPermission, async (req, res) => {
    try {
      const user = getAuthUser(req);
      const validation = createScenarioSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: fromZodError(validation.error).message });
      }

      const manualCount = await storage.countManualScenarios(user.id);
      if (manualCount >= MAX_SCENARIOS_PER_USER) {
        return res.status(400).json({ error: `Maximum of ${MAX_SCENARIOS_PER_USER} scenarios allowed` });
      }

      const { scenarioGA, scenarioProps, propertyFeeCategories, propertyPhotos, diffResult } =
        await buildCreateSnapshotData(user.id);

      const { computedResults, computeHash } = tryComputeResults(scenarioGA, scenarioProps);

      const scenario = await storage.createScenario({
        userId: user.id,
        name: validation.data.name,
        description: validation.data.description,
        globalAssumptions: scenarioGA,
        properties: scenarioProps,
        feeCategories: propertyFeeCategories,
        propertyPhotos: propertyPhotos,
        computedResults,
        computeHash,
        version: 1,
        baseSnapshotHash: diffResult.snapshotHash,
      });

      if (diffResult.propertyDiffs.length > 0) {
        await storage.writePropertyOverrides(scenario.id, diffResult.propertyDiffs);
      }

      logActivity(req, "create", "scenario", scenario.id, scenario.name);
      res.status(201).json({
        ...scenario,
        snapshotStatus: computedResults ? "computed" : "failed",
      });
    } catch (error) {
      logAndSendError(res, "Failed to create scenario", error);
    }
  });

  app.patch("/api/scenarios/:id", requireManagementAccess, requireScenarioPermission, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await storage.getScenario(id);
      if (!existing) return res.status(404).json({ error: "Scenario not found" });
      if (existing.userId !== getAuthUser(req).id) return res.status(403).json({ error: "Access denied" });

      if (existing.isLocked) {
        return res.status(403).json({ error: "This scenario is locked and cannot be edited" });
      }

      const validation = updateScenarioSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: fromZodError(validation.error).message });
      }

      const scenario = await storage.updateScenario(id, validation.data);
      if (!scenario) return res.status(404).json({ error: "Scenario not found" });

      logActivity(req, "update", "scenario", id, scenario.name);
      res.json(scenario);
    } catch (error) {
      logAndSendError(res, "Failed to update scenario", error);
    }
  });

  app.post("/api/scenarios/:id/load", requireManagementAccess, async (req, res) => {
    try {
      const user = getAuthUser(req);
      const id = Number(req.params.id);
      const scenario = await storage.getScenario(id);
      if (!scenario) return res.status(404).json({ error: "Scenario not found" });

      const isOwner = scenario.userId === user.id;
      if (!isOwner) {
        const shared = await storage.getScenariosSharedWithUser(user.id);
        const hasAccess = shared.some(s => s.id === id);
        if (!hasAccess) return res.status(403).json({ error: "Access denied" });
      }

      const validation = validateLoadSnapshot(scenario);
      if (validation.error) {
        return res.status(validation.error.status).json({ error: validation.error.message });
      }

      const { snapshotProps, orphanedFeeCategories, orphanedPhotos } = validation;

      if (!isOwner) {
        const accessError = await checkSharedPropertyAccess(id, user.id, snapshotProps);
        if (accessError) return res.status(403).json({ error: accessError });
      }

      if (orphanedFeeCategories.length > 0) {
        logger.warn(`[scenario-load] Scenario ${id}: fee categories reference missing properties: ${orphanedFeeCategories.join(", ")}`, "scenarios");
      }
      if (orphanedPhotos.length > 0) {
        logger.warn(`[scenario-load] Scenario ${id}: photos reference missing properties: ${orphanedPhotos.join(", ")}`, "scenarios");
      }

      await storage.loadScenario(
        user.id,
        scenario.globalAssumptions,
        snapshotProps,
        scenario.feeCategories ?? undefined,
        scenario.propertyPhotos ?? undefined
      );

      invalidateComputeCache();
      logActivity(req, "load", "scenario", id, scenario.name);
      res.json({
        success: true,
        propertyCount: snapshotProps.length,
        warnings: [
          ...orphanedFeeCategories.map(name => `Fee categories for "${name}" have no matching property`),
          ...orphanedPhotos.map(name => `Photos for "${name}" have no matching property`),
        ].filter(w => w.length > 0),
      });
    } catch (error) {
      logAndSendError(res, "Failed to load scenario", error);
    }
  });

  app.delete("/api/scenarios/:id", requireManagementAccess, requireScenarioPermission, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const scenario = await storage.getScenario(id);
      if (!scenario) return res.status(404).json({ error: "Scenario not found" });
      if (scenario.userId !== getAuthUser(req).id) return res.status(403).json({ error: "Access denied" });

      if (scenario.isLocked) {
        return res.status(403).json({ error: "This scenario is locked and cannot be deleted" });
      }

      const user = getAuthUser(req);
      await storage.softDeleteScenario(id, user.id);
      logActivity(req, "delete", "scenario", id, scenario.name);
      res.json({ success: true });
    } catch (error) {
      logAndSendError(res, "Failed to delete scenario", error);
    }
  });

  app.post("/api/scenarios/:id/clone", requireManagementAccess, requireScenarioPermission, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const scenario = await storage.getScenario(id);
      if (!scenario) return res.status(404).json({ error: "Scenario not found" });
      if (scenario.userId !== getAuthUser(req).id) return res.status(403).json({ error: "Access denied" });

      const cloneManualCount = await storage.countManualScenarios(getAuthUser(req).id);
      if (cloneManualCount >= MAX_SCENARIOS_PER_USER) {
        return res.status(400).json({ error: `Maximum of ${MAX_SCENARIOS_PER_USER} scenarios allowed` });
      }

      const cloned = await storage.cloneScenario(id, getAuthUser(req).id);
      logActivity(req, "clone", "scenario", cloned.id, cloned.name);
      res.status(201).json(cloned);
    } catch (error) {
      logAndSendError(res, "Failed to clone scenario", error);
    }
  });

  app.get("/api/scenarios/:id/export", requireAuth, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const scenario = await storage.getScenario(id);
      if (!scenario) return res.status(404).json({ error: "Scenario not found" });
      if (scenario.userId !== getAuthUser(req).id) return res.status(403).json({ error: "Access denied" });

      const exportData = {
        name: scenario.name,
        description: scenario.description,
        globalAssumptions: scenario.globalAssumptions,
        properties: scenario.properties,
        feeCategories: scenario.feeCategories,
      };

      logActivity(req, "export", "scenario", id, scenario.name);
      const filename = scenario.name.replace(/[^a-zA-Z0-9-_ ]/g, "") + ".json";
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.json(exportData);
    } catch (error) {
      logAndSendError(res, "Failed to export scenario", error);
    }
  });

  app.post("/api/scenarios/import", requireManagementAccess, requireScenarioPermission, async (req, res) => {
    try {
      const validation = importScenarioSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: fromZodError(validation.error).message });
      }

      const user = getAuthUser(req);
      const importManualCount = await storage.countManualScenarios(user.id);
      if (importManualCount >= MAX_SCENARIOS_PER_USER) {
        return res.status(400).json({ error: `Maximum of ${MAX_SCENARIOS_PER_USER} scenarios allowed` });
      }

      const data = validation.data;
      const scenario = await storage.createScenario({
        userId: user.id,
        name: data.name,
        description: data.description ?? null,
        globalAssumptions: data.globalAssumptions as ScenarioGlobalAssumptionsSnapshot,
        properties: data.properties as ScenarioPropertySnapshot[],
        feeCategories: (data.feeCategories || {}) as Record<string, ScenarioFeeCategorySnapshot[]>,
      });

      logActivity(req, "import", "scenario", scenario.id, scenario.name);
      res.status(201).json(scenario);
    } catch (error) {
      logAndSendError(res, "Failed to import scenario", error);
    }
  });

  app.get("/api/scenarios/:id1/compare/:id2", requireAuth, async (req, res) => {
    try {
      const id1 = Number(req.params.id1);
      const id2 = Number(req.params.id2);
      const [s1, s2] = await Promise.all([
        storage.getScenario(id1),
        storage.getScenario(id2),
      ]);
      if (!s1 || !s2) return res.status(404).json({ error: "Scenario not found" });
      if (s1.userId !== getAuthUser(req).id || s2.userId !== getAuthUser(req).id) {
        return res.status(403).json({ error: "Access denied" });
      }

      const result = storage.compareScenarios(s1, s2);
      res.json(result);
    } catch (error) {
      logAndSendError(res, "Failed to compare scenarios", error);
    }
  });

  app.post("/api/scenarios/shares", requireManagementAccess, requireScenarioPermission, async (req, res) => {
    try {
      const validation = shareScenarioSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: fromZodError(validation.error).message });
      }

      const { recipientEmail, mode, scenarioId } = validation.data;

      if (recipientEmail === getAuthUser(req).email) {
        return res.status(400).json({ error: "You cannot share scenarios with yourself" });
      }

      const recipient = await storage.getUserByEmail(recipientEmail);
      if (!recipient) {
        return res.status(404).json({ error: "No user found with that email address" });
      }

      const sharer = getAuthUser(req);
      const sharerDisplayName = fullName(sharer) || sharer.email;
      const recipientDisplayName = fullName(recipient) || recipient.email;
      let scenarioNames: string[] = [];

      if (mode === "single") {
        if (!scenarioId) {
          return res.status(400).json({ error: "scenarioId is required for single share mode" });
        }
        const scenario = await storage.getScenario(scenarioId);
        if (!scenario) return res.status(404).json({ error: "Scenario not found" });
        if (scenario.userId !== sharer.id) return res.status(403).json({ error: "You can only share your own scenarios" });

        const share = await storage.shareScenarioWithUser(scenarioId, recipient.id, sharer.id);
        logActivity(req, "share", "scenario", scenarioId, scenario.name);
        scenarioNames = [scenario.name];
        res.status(201).json({ shares: share ? [share] : [], recipientName: recipientDisplayName });
      } else {
        const shares = await storage.shareAllScenariosWithUser(sharer.id, recipient.id);
        logActivity(req, "share_all", "scenario", null, `All scenarios to ${recipient.email}`);
        const userScenarios = await storage.getScenariosByUser(sharer.id);
        scenarioNames = userScenarios.filter(s => s.kind === "manual").map(s => s.name);
        res.status(201).json({ shares, recipientName: recipientDisplayName });
      }

      const portalUrl = process.env.REPLIT_DOMAINS
        ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}/scenarios`
        : undefined;

      sendScenarioShareNotification({
        to: recipient.email,
        recipientName: recipientDisplayName,
        sharerName: sharerDisplayName,
        sharerEmail: sharer.email,
        scenarioNames,
        mode,
        portalUrl,
      }).catch(err => logger.warn(`Failed to send share notification to recipient: ${err instanceof Error ? err.message : String(err)}`, "scenarios"));

      if (sharer.role !== UserRole.ADMIN) {
        const allUsers = await storage.getAllUsers();
        const admins = allUsers.filter(u => u.role === UserRole.ADMIN && u.email !== sharer.email);
        for (const admin of admins) {
          sendAdminShareNotification({
            to: admin.email,
            sharerName: sharerDisplayName,
            sharerEmail: sharer.email,
            recipientName: recipientDisplayName,
            recipientEmail: recipient.email,
            scenarioNames,
            mode,
          }).catch(err => logger.warn(`Failed to send admin share notification: ${err instanceof Error ? err.message : String(err)}`, "scenarios"));
        }
      }
    } catch (error) {
      logAndSendError(res, "Failed to share scenario", error);
    }
  });

  app.get("/api/scenarios/:id/preview", requireAuth, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const scenario = await storage.getScenario(id);
      if (!scenario) return res.status(404).json({ error: "Scenario not found" });

      const isOwner = scenario.userId === getAuthUser(req).id;
      if (!isOwner) {
        const shared = await storage.getScenariosSharedWithUser(getAuthUser(req).id);
        const hasAccess = shared.some(s => s.id === id);
        if (!hasAccess) return res.status(403).json({ error: "Access denied" });
      }

      const overrides = await storage.getPropertyOverrides(id);
      const liveProperties = await storage.getAllProperties(scenario.userId);
      res.json(buildPreviewData(overrides, liveProperties as Array<Record<string, unknown>>, scenario));
    } catch (error) {
      logAndSendError(res, "Failed to preview scenario", error);
    }
  });

  app.get("/api/scenarios/cross-query", requireAuth, async (req, res) => {
    try {
      const field = req.query.field as string;
      if (!field) return res.status(400).json({ error: "field query parameter is required" });

      const [results, userScenarios] = await Promise.all([
        storage.getPropertyOverridesForField(getAuthUser(req).id, field),
        storage.getScenariosByUser(getAuthUser(req).id),
      ]);

      res.json({
        field,
        scenarios: buildCrossQueryResult(userScenarios, field),
        overrides: results,
      });
    } catch (error) {
      logAndSendError(res, "Failed to query across scenarios", error);
    }
  });

  registerScenarioAccessRoutes(app);
}
