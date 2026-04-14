import { type Express } from "express";
import { z } from "zod";
import { storage } from "../../storage";
import { requireAdmin } from "../../auth";
import { logAndSendError, logActivity } from "../helpers";

const DEFAULT_REQUIRED_FIELDS = {
  name: true,
  location: true,
  roomCount: true,
  startAdr: true,
  purchasePrice: true,
  country: false,
  startOccupancy: false,
  qualityTier: false,
  businessModel: false,
  serviceLevel: false,
  locationType: false,
};

const VALID_REQUIRED_FIELD_KEYS = Object.keys(DEFAULT_REQUIRED_FIELDS) as [string, ...string[]];
const requiredFieldsSchema = z.record(z.enum(VALID_REQUIRED_FIELD_KEYS), z.boolean());

export function registerRequiredFieldsRoutes(app: Express) {
  app.get("/api/admin/required-fields", requireAdmin, async (_req, res) => {
    try {
      const assumptions = await storage.getGlobalAssumptions();
      const config = assumptions?.requiredFieldsConfig ?? DEFAULT_REQUIRED_FIELDS;
      res.json(config);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch required fields config", error);
    }
  });

  app.put("/api/admin/required-fields", requireAdmin, async (req, res) => {
    try {
      const validation = requiredFieldsSchema.safeParse(req.body);
      if (!validation.success) return res.status(400).json({ error: validation.error.message });

      const assumptions = await storage.getGlobalAssumptions();
      if (!assumptions) return res.status(404).json({ error: "Global assumptions not found" });

      await storage.patchGlobalAssumptions(assumptions.id, { requiredFieldsConfig: validation.data });

      logActivity(req, "update-required-fields", "settings", assumptions.id, "Updated required fields config");
      res.json(validation.data);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to update required fields config", error);
    }
  });
}
