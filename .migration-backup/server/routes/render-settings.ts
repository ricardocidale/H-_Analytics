import type { Express } from "express";
import { storage } from "../storage";
import { requireAdmin } from "../auth";
import { updateRenderSettingSchema } from "@shared/schema";
import { fromZodError } from "zod-validation-error";
import { logAndSendError } from "./helpers";
import fs from "node:fs";
import path from "node:path";
import { logger } from "../logger";

export function register(app: Express) {
  app.get("/api/admin/render-settings", requireAdmin, async (_req, res) => {
    try {
      const settings = await storage.getAllRenderSettings();

      if (settings.length === 0) {
        try {
          const configPath = path.join(process.cwd(), "server/replicate-models.json");
          const raw = fs.readFileSync(configPath, "utf-8");
          const configs = JSON.parse(raw);
          await storage.seedFromJson(configs);
          const seeded = await storage.getAllRenderSettings();
          return res.json(seeded);
        } catch (seedErr: unknown) {
          logger.warn(`Failed to seed render settings from JSON: ${seedErr instanceof Error ? seedErr.message : String(seedErr)}`, "render-settings");
        }
      }

      res.json(settings);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch render settings", error);
    }
  });

  app.put("/api/admin/render-settings/:styleKey", requireAdmin, async (req, res) => {
    try {
      const styleKey = req.params.styleKey as string;
      const parsed = updateRenderSettingSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }

      const updated = await storage.updateRenderSetting(styleKey, parsed.data);
      if (!updated) {
        return res.status(404).json({ error: "Render setting not found" });
      }

      res.json(updated);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to update render setting", error);
    }
  });

  app.get("/api/admin/render-usage", requireAdmin, async (_req, res) => {
    try {
      const logFile = path.join(process.cwd(), "logs/api-costs.jsonl");
      if (!fs.existsSync(logFile)) {
        return res.json([]);
      }

      const lines = fs.readFileSync(logFile, "utf-8").trim().split("\n").filter(Boolean);
      const imageEntries = lines
        .map((line) => {
          try { return JSON.parse(line); } catch { return null; }
        })
        .filter((entry: Record<string, unknown> | null) =>
          entry &&
          (entry.operation === "image-gen" ||
           entry.operation === "image-gen-fallback" ||
           (entry.service === "replicate" && typeof entry.model === "string"))
        )
        .slice(-100);

      res.json(imageEntries);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch render usage", error);
    }
  });

  app.post("/api/admin/render-settings/seed", requireAdmin, async (_req, res) => {
    try {
      const configPath = path.join(process.cwd(), "server/replicate-models.json");
      const raw = fs.readFileSync(configPath, "utf-8");
      const configs = JSON.parse(raw);
      await storage.seedFromJson(configs);
      const settings = await storage.getAllRenderSettings();
      res.json(settings);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to seed render settings", error);
    }
  });
}
