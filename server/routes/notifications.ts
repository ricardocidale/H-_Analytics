import type { Express } from "express";
import { requireAuth, requireAdmin , getAuthUser } from "../auth";
import { logAndSendError } from "./helpers";
import { insertAlertRuleSchema } from "@shared/schema";
import { fromZodError } from "zod-validation-error";
import { z } from "zod";
import { storage } from "../storage";
import { testResendConnection, sendReportShareEmail, sendScenarioSummaryEmail } from "../integrations/resend";

export function register(app: Express) {
  // --- Alert Rules CRUD ---
  app.get("/api/notifications/alert-rules", requireAdmin, async (_req, res) => {
    try {
      const rules = await storage.getAllAlertRules();
      res.json(rules);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch alert rules", error);
    }
  });

  app.post("/api/notifications/alert-rules", requireAdmin, async (req, res) => {
    try {
      const validation = insertAlertRuleSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: fromZodError(validation.error).message });
      }
      const rule = await storage.createAlertRule(validation.data);
      res.status(201).json(rule);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to create alert rule", error);
    }
  });

  app.patch("/api/notifications/alert-rules/:id", requireAdmin, async (req, res) => {
    try {
      const validation = insertAlertRuleSchema.partial().safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: fromZodError(validation.error).message });
      }
      const rule = await storage.updateAlertRule(Number(req.params.id), validation.data);
      if (!rule) return res.status(404).json({ error: "Rule not found" });
      res.json(rule);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to update alert rule", error);
    }
  });

  app.delete("/api/notifications/alert-rules/:id", requireAdmin, async (req, res) => {
    try {
      await storage.deleteAlertRule(Number(req.params.id));
      res.json({ success: true });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to delete alert rule", error);
    }
  });

  // --- Notification Logs ---
  app.get("/api/notifications/logs", requireAdmin, async (req, res) => {
    try {
      const limit = Number(req.query.limit) || 100;
      const logs = await storage.getNotificationLogs(limit);
      res.json(logs);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch notification logs", error);
    }
  });

  // --- Notification Settings ---
  app.get("/api/notifications/settings", requireAdmin, async (_req, res) => {
    try {
      const settings = await storage.getAllNotificationSettings();
      const result: Record<string, string | null> = {};
      for (const s of settings) {
        result[s.settingKey] = s.settingValue;
      }
      res.json(result);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch notification settings", error);
    }
  });

  app.put("/api/notifications/settings", requireAdmin, async (req, res) => {
    try {
      const validation = z.record(z.string(), z.string().nullable()).safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: fromZodError(validation.error).message });
      }
      const updates = validation.data;
      for (const [key, value] of Object.entries(updates)) {
        await storage.setNotificationSetting(key, value);
      }
      res.json({ success: true });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to update notification settings", error);
    }
  });

  // --- Notification Preferences (per-user) ---
  app.get("/api/notifications/preferences", requireAuth, async (req, res) => {
    try {
      const prefs = await storage.getNotificationPreferences(getAuthUser(req).id);
      res.json(prefs);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch notification preferences", error);
    }
  });

  app.put("/api/notifications/preferences", requireAuth, async (req, res) => {
    try {
      const validation = z.object({
        eventType: z.string().min(1),
        channel: z.string().min(1),
        enabled: z.boolean().optional().default(true),
      }).safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: fromZodError(validation.error).message });
      }
      const { eventType, channel, enabled } = validation.data;
      await storage.upsertNotificationPreference(getAuthUser(req).id, eventType, channel, enabled);
      res.json({ success: true });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to update notification preference", error);
    }
  });

  // --- Test integrations ---
  app.post("/api/notifications/test-resend", requireAdmin, async (_req, res) => {
    try {
      const result = await testResendConnection();
      res.json(result);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to test Resend connection", error);
    }
  });

  // --- Share via Email ---
  app.post("/api/notifications/share-report", requireAuth, async (req, res) => {
    try {
      const validation = z.object({
        to: z.string().email(),
        propertyName: z.string().min(1),
        metrics: z.record(z.string(), z.any()).optional(),
        message: z.string().optional(),
        attachmentBase64: z.string().optional(),
        attachmentFilename: z.string().optional(),
      }).safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: fromZodError(validation.error).message });
      }
      const { to, propertyName, metrics, message, attachmentBase64, attachmentFilename } = validation.data;

      await sendReportShareEmail({ to, propertyName, metrics: metrics || {}, message, attachmentBase64, attachmentFilename });

      await storage.createNotificationLog({
        eventType: "REPORT_SHARED",
        channel: "email",
        recipient: to,
        subject: `Report: ${propertyName}`,
        status: "sent",
        metadata: { propertyName },
      });

      res.json({ success: true });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to share report via email", error);
    }
  });

  app.post("/api/notifications/share-scenarios", requireAuth, async (req, res) => {
    try {
      const validation = z.object({
        to: z.string().email(),
        scenarios: z.array(z.any()).min(1),
        message: z.string().optional(),
      }).safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: fromZodError(validation.error).message });
      }
      const { to, scenarios, message } = validation.data;

      await sendScenarioSummaryEmail({ to, scenarios, message });
      res.json({ success: true });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to share scenario summary", error);
    }
  });
}
