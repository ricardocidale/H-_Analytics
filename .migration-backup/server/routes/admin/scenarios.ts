import { type Express } from "express";
import { storage } from "../../storage";
import { requireAdmin , getAuthUser } from "../../auth";
import { logAndSendError, logActivity, parseParamId } from "../helpers";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import { updateScenarioSchema } from "@shared/schema";

const createAdminScenarioSchema = z.object({
  userId: z.number(),
  name: z.string().min(1).max(60),
  description: z.string().max(1000).nullable().optional(),
  kind: z.enum(["default", "manual", "autosave"]).optional(),
  isLocked: z.boolean().optional(),
});

const accessGrantSchema = z.object({
  targetType: z.enum(["user", "group", "company"]),
  targetId: z.number(),
});

export function registerAdminScenarioRoutes(app: Express) {
  app.get("/api/admin/scenarios", requireAdmin, async (req, res) => {
    try {
      const userIdFilter = req.query.userId ? Number(req.query.userId) : undefined;
      const groupIdFilter = req.query.groupId ? Number(req.query.groupId) : undefined;
      const allScenarios = await storage.getAllScenarios({ userId: userIdFilter, groupId: groupIdFilter });
      const allShares = await storage.getAllScenarioShares();

      const sharesByScenario: Record<number, Array<{ id: number; targetType: string; targetId: number; grantedBy: number; createdAt: string }>> = {};
      for (const share of allShares) {
        if (!sharesByScenario[share.scenarioId]) sharesByScenario[share.scenarioId] = [];
        sharesByScenario[share.scenarioId].push({
          id: share.id,
          targetType: share.targetType,
          targetId: share.targetId,
          grantedBy: share.grantedBy,
          createdAt: share.createdAt?.toISOString?.() ?? String(share.createdAt),
        });
      }

      const result = allScenarios.map(s => ({
        id: s.id,
        userId: s.userId,
        name: s.name,
        description: s.description,
        kind: s.kind,
        ownerEmail: s.ownerEmail,
        ownerName: s.ownerName,
        propertyCount: Array.isArray(s.properties) ? (s.properties as unknown[]).length : 0,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        accessGrants: sharesByScenario[s.id] || [],
      }));

      res.json(result);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch admin scenarios", error);
    }
  });

  app.post("/api/admin/scenarios", requireAdmin, async (req, res) => {
    try {
      const validation = createAdminScenarioSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: fromZodError(validation.error).message });
      }

      const user = await storage.getUserById(validation.data.userId);
      if (!user) return res.status(404).json({ error: "Target user not found" });

      const scenario = await storage.createScenarioForUser(validation.data.userId, {
        name: validation.data.name,
        description: validation.data.description ?? null,
        kind: validation.data.kind,
      });

      logActivity(req, "admin-create-scenario", "scenario", scenario.id, scenario.name, { forUserId: validation.data.userId });
      res.status(201).json(scenario);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to create admin scenario", error);
    }
  });

  app.patch("/api/admin/scenarios/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseParamId(req.params.id, res, "scenario ID");
      if (id === null) return;

      const existing = await storage.getScenario(id);
      if (!existing) return res.status(404).json({ error: "Scenario not found" });

      const validation = updateScenarioSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: fromZodError(validation.error).message });
      }

      const scenario = await storage.updateScenario(id, validation.data);
      if (!scenario) return res.status(404).json({ error: "Scenario not found" });

      logActivity(req, "admin-update-scenario", "scenario", id, scenario.name);
      res.json(scenario);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to update admin scenario", error);
    }
  });

  app.delete("/api/admin/scenarios/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseParamId(req.params.id, res, "scenario ID");
      if (id === null) return;

      const existing = await storage.getScenario(id);
      if (!existing) return res.status(404).json({ error: "Scenario not found" });

      await storage.hardDeleteScenario(id);
      logActivity(req, "admin-delete-scenario", "scenario", id, existing.name);
      res.json({ success: true });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to delete admin scenario", error);
    }
  });

  app.post("/api/admin/scenarios/purge-expired", requireAdmin, async (req, res) => {
    try {
      const count = await storage.purgeExpiredScenarios();
      logActivity(req, "admin-purge-expired-scenarios", "scenario", null, null, { purgedCount: count });
      res.json({ success: true, purgedCount: count });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to purge expired scenarios", error);
    }
  });

  app.get("/api/admin/scenarios/deleted", requireAdmin, async (req, res) => {
    try {
      const userId = req.query.userId ? Number(req.query.userId) : undefined;
      const deleted = await storage.getDeletedScenarios({ userId });

      const userCache = new Map<number, { email: string; name: string | null }>();
      const enriched = [];
      for (const s of deleted) {
        if (!userCache.has(s.userId)) {
          const user = await storage.getUserById(s.userId);
          userCache.set(s.userId, {
            email: user?.email ?? "unknown",
            name: user ? [user.firstName, user.lastName].filter(Boolean).join(" ") || null : null,
          });
        }
        const owner = userCache.get(s.userId)!;
        enriched.push({
          id: s.id,
          name: s.name,
          userId: s.userId,
          kind: s.kind,
          deletedAt: s.deletedAt,
          deletedBy: s.deletedBy,
          purgeAfter: s.purgeAfter,
          createdAt: s.createdAt,
          ownerEmail: owner.email,
          ownerName: owner.name,
        });
      }

      res.json(enriched);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch deleted scenarios", error);
    }
  });

  app.post("/api/admin/scenarios/:id/restore", requireAdmin, async (req, res) => {
    try {
      const id = parseParamId(req.params.id, res, "scenario ID");
      if (id === null) return;

      const existing = await storage.getScenarioIncludingDeleted(id);
      if (!existing) return res.status(404).json({ error: "Scenario not found" });
      if (!existing.deletedAt) return res.status(400).json({ error: "Scenario is not deleted" });

      const restored = await storage.restoreScenario(id);
      logActivity(req, "admin-restore-scenario", "scenario", id, existing.name);
      res.json(restored);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to restore scenario", error);
    }
  });

  app.delete("/api/admin/scenarios/:id/purge", requireAdmin, async (req, res) => {
    try {
      const id = parseParamId(req.params.id, res, "scenario ID");
      if (id === null) return;

      const existing = await storage.getScenarioIncludingDeleted(id);
      if (!existing) return res.status(404).json({ error: "Scenario not found" });

      await storage.hardDeleteScenario(id);
      logActivity(req, "admin-purge-scenario", "scenario", id, existing.name);
      res.json({ success: true });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to purge scenario", error);
    }
  });

  app.post("/api/admin/scenarios/:id/access", requireAdmin, async (req, res) => {
    try {
      const id = parseParamId(req.params.id, res, "scenario ID");
      if (id === null) return;

      const existing = await storage.getScenario(id);
      if (!existing) return res.status(404).json({ error: "Scenario not found" });

      const validation = accessGrantSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: fromZodError(validation.error).message });
      }

      const { targetType, targetId } = validation.data;

      if (targetType === "user") {
        const targetUser = await storage.getUserById(targetId);
        if (!targetUser) return res.status(404).json({ error: "Target user not found" });
      }

      const share = await storage.addScenarioAccess(id, targetType, targetId, getAuthUser(req).id);

      logActivity(req, "admin-grant-scenario-access", "scenario", id, existing.name, { targetType, targetId });
      res.status(201).json(share);
    } catch (error: unknown) {
      if (typeof error === "object" && error !== null && "code" in error && (error as { code: string }).code === "23505") {
        return res.status(409).json({ error: "This access grant already exists" });
      }
      logAndSendError(res, "Failed to add scenario access", error);
    }
  });

  app.delete("/api/admin/scenarios/:id/access", requireAdmin, async (req, res) => {
    try {
      const id = parseParamId(req.params.id, res, "scenario ID");
      if (id === null) return;

      const validation = accessGrantSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: fromZodError(validation.error).message });
      }

      const { targetType, targetId } = validation.data;
      await storage.removeScenarioAccess(id, targetType, targetId);

      logActivity(req, "admin-revoke-scenario-access", "scenario", id, null, { targetType, targetId });
      res.json({ success: true });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to remove scenario access", error);
    }
  });

  app.get("/api/admin/scenarios/:id/access", requireAdmin, async (req, res) => {
    try {
      const id = parseParamId(req.params.id, res, "scenario ID");
      if (id === null) return;

      const shares = await storage.getScenarioSharesForScenario(id);
      res.json(shares);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch scenario access", error);
    }
  });

  app.delete("/api/admin/scenarios/:id/access/all", requireAdmin, async (req, res) => {
    try {
      const id = parseParamId(req.params.id, res, "scenario ID");
      if (id === null) return;

      const existing = await storage.getScenario(id);
      if (!existing) return res.status(404).json({ error: "Scenario not found" });

      const result = await storage.removeAllSharesForScenario(id);
      logActivity(req, "admin-unshare-all", "scenario", id, existing.name);
      res.json({ success: true, ...result });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to remove all scenario shares", error);
    }
  });

  app.get("/api/admin/users/:id/scenario-count", requireAdmin, async (req, res) => {
    try {
      const id = parseParamId(req.params.id, res, "user ID");
      if (id === null) return;

      const count = await storage.getScenarioCountByUser(id);
      res.json({ count });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to get scenario count", error);
    }
  });
}
