import type { Express } from "express";
import { requireAuth, requireAdmin , getAuthUser } from "../auth";
import { logAndSendError, parseRouteId } from "./helpers";
import { insertAlertRuleSchema } from "@shared/schema";
import { fromZodError } from "zod-validation-error";
import { z } from "zod";
import { storage } from "../storage";
import { testResendConnection, sendReportShareEmail, sendScenarioSummaryEmail, sendNotificationEmail } from "../integrations/resend";
import { isAdminRole, APP_BRAND_NAME } from "@shared/constants";
import { getEventLabel } from "../notifications/events";
import { resolveVectorLatencyConfig, VECTOR_LATENCY_CHART_PATH } from "../notifications/vector-latency-alert";
import { getAppUrl } from "../providers/config";
import { logger } from "../logger";

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
      const id = parseRouteId(req.params.id);
      if (!id) return res.status(400).json({ error: "Invalid rule ID" });
      const rule = await storage.updateAlertRule(id, validation.data);
      if (!rule) return res.status(404).json({ error: "Rule not found" });
      res.json(rule);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to update alert rule", error);
    }
  });

  app.delete("/api/notifications/alert-rules/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseRouteId(req.params.id);
      if (!id) return res.status(400).json({ error: "Invalid rule ID" });
      await storage.deleteAlertRule(id);
      res.json({ success: true });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to delete alert rule", error);
    }
  });

  // --- Notification Logs ---
  app.get("/api/notifications/logs", requireAdmin, async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 100, 500);
      const eventType =
        typeof req.query.eventType === "string" && req.query.eventType.length > 0
          ? req.query.eventType
          : undefined;
      const logs = await storage.getNotificationLogs(limit, eventType);
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
      const ALLOWED_SETTING_KEYS = new Set([
        "emailEnabled", "emailFrequency", "emailRecipients",
        "slackEnabled", "slackWebhookUrl", "slackChannel",
        "alertOnSourceDown", "alertOnResearchComplete", "alertOnEngineError",
        "digestEnabled", "digestFrequency", "digestRecipients",
        "resend_enabled",
        "vector_latency_alerts_disabled",
        "vector_latency_single_p95_override",
        "vector_latency_multi_p95_override",
        "vector_latency_recipient_user_ids",
      ]);
      const validation = z.record(z.string(), z.string().nullable()).safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: fromZodError(validation.error).message });
      }
      const updates = validation.data;
      const invalidKeys = Object.keys(updates).filter(k => !ALLOWED_SETTING_KEYS.has(k));
      if (invalidKeys.length > 0) {
        return res.status(400).json({ error: `Unknown setting keys: ${invalidKeys.join(", ")}` });
      }
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

  // --- Vector Latency Alert: send a test email to current configured recipients ---
  app.post("/api/notifications/test-vector-latency", requireAdmin, async (_req, res) => {
    try {
      const config = await resolveVectorLatencyConfig();
      if (!config.resendEnabled) {
        return res.status(400).json({ error: "Resend email delivery is disabled. Enable it on the Channels tab first." });
      }

      const allUsers = await storage.getAllUsers();
      let admins = allUsers.filter((u) => u.email && isAdminRole(u.role));
      if (config.recipientUserIds) {
        const allowed = new Set(config.recipientUserIds);
        admins = admins.filter((u) => allowed.has(u.id));
      }
      if (admins.length === 0) {
        return res.status(400).json({ error: "No admin recipients are configured." });
      }

      const chartUrl = `${getAppUrl()}${VECTOR_LATENCY_CHART_PATH}`;
      const subject = `[TEST] ${getEventLabel("VECTOR_LATENCY_BREACH")} — ${APP_BRAND_NAME}`;
      const body =
        `This is a <strong>test email</strong> from the vector latency alert configuration page. ` +
        `If you received this, the alert is wired up correctly and will reach you when a real ` +
        `benchmark run breaches the configured p95 thresholds.` +
        `<br/><br/>Active overrides: ` +
        `single p95 = ${config.singleP95Override ?? "from history file"}, ` +
        `multi p95 = ${config.multiP95Override ?? "from history file"}.`;

      let sent = 0;
      let failed = 0;
      const errors: string[] = [];
      for (const admin of admins) {
        try {
          await sendNotificationEmail({
            to: admin.email,
            subject,
            title: `Test: ${getEventLabel("VECTOR_LATENCY_BREACH")}`,
            body,
            actionUrl: chartUrl,
            actionLabel: "View Latency Chart",
          });
          await storage.createNotificationLog({
            eventType: "VECTOR_LATENCY_BREACH",
            channel: "email",
            recipient: admin.email,
            subject,
            status: "sent",
            metadata: { test: true },
          });
          sent++;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.error(`vector-latency-alert test: email to ${admin.email} failed: ${msg}`, "notifications");
          await storage.createNotificationLog({
            eventType: "VECTOR_LATENCY_BREACH",
            channel: "email",
            recipient: admin.email,
            subject,
            status: "failed",
            errorMessage: msg,
            metadata: { test: true },
          });
          errors.push(`${admin.email}: ${msg}`);
          failed++;
        }
      }
      res.json({ success: failed === 0, recipients: admins.length, sent, failed, errors });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to send vector latency test email", error);
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
