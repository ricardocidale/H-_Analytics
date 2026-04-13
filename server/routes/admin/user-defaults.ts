import { type Express } from "express";
import { z } from "zod";
import { storage } from "../../storage";
import { requireAdmin } from "../../auth";
import { logAndSendError, parseParamId, logActivity } from "../helpers";

export function registerUserDefaultRoutes(app: Express) {
  app.get("/api/admin/users/:userId/default-properties", requireAdmin, async (req, res) => {
    try {
      const userId = parseParamId(req.params.userId, res);
      if (!userId) return;

      const propertyIds = await storage.getUserDefaultPropertyIds(userId);
      res.json(propertyIds);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch user default properties", error);
    }
  });

  app.put("/api/admin/users/:userId/default-properties", requireAdmin, async (req, res) => {
    try {
      const userId = parseParamId(req.params.userId, res);
      if (!userId) return;

      const schema = z.object({ propertyIds: z.array(z.number()) });
      const validation = schema.safeParse(req.body);
      if (!validation.success) return res.status(400).json({ error: validation.error.message });

      const { propertyIds } = validation.data;
      await storage.setUserDefaultPropertyIds(userId, propertyIds);

      logActivity(req, "update-user-defaults", "user", userId, `Updated default properties`, { propertyIds });
      res.json({ propertyIds });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to update user default properties", error);
    }
  });
}
