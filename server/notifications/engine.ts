import type { NotificationEvent } from "./events";
import { getEventLabel } from "./events";
import type { Property } from "@shared/schema";
import { sendNotificationEmail } from "../integrations/resend";
import { storage } from "../storage";
import { APP_BRAND_NAME } from "@shared/constants";
import { logger } from "../logger";

async function logNotification(
  event: NotificationEvent,
  channel: string,
  status: string,
  extra: { recipient?: string; subject?: string; errorMessage?: string; alertRuleId?: number; retryCount?: number } = {}
) {
  await storage.createNotificationLog({
    eventType: event.type,
    channel,
    recipient: extra.recipient ?? null,
    subject: extra.subject ?? null,
    status,
    errorMessage: extra.errorMessage ?? null,
    metadata: event.metadata ?? null,
    alertRuleId: extra.alertRuleId ?? null,
    propertyId: event.propertyId ?? null,
    retryCount: extra.retryCount ?? 0,
  });
}

export async function processNotificationEvent(event: NotificationEvent): Promise<void> {
  const resendEnabled = await storage.getNotificationSetting("resend_enabled");

  if (resendEnabled === "true" && event.metadata?.recipientEmail && event.type !== "REPORT_SHARED") {
    try {
      await sendNotificationEmail({
        to: event.metadata.recipientEmail,
        subject: `${getEventLabel(event.type)} — ${APP_BRAND_NAME}`,
        title: getEventLabel(event.type),
        body: event.message || "A system event has occurred.",
        actionUrl: event.link ? undefined : undefined,
      });
      await logNotification(event, "email", "sent", {
        recipient: event.metadata.recipientEmail,
        subject: getEventLabel(event.type),
      });
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Resend email failed: ${errMsg}`, "notifications");
      await logNotification(event, "email", "failed", {
        recipient: event.metadata.recipientEmail,
        errorMessage: errMsg,
      });
    }
  }
}

export async function evaluateAlertRules(
  property: Property,
  metrics: { dscr?: number; cap_rate?: number; occupancy?: number; noi_variance?: number }
): Promise<void> {
  const rules = await storage.getActiveAlertRulesForProperty(property.id);

  for (const rule of rules) {
    const metricValue = metrics[rule.metric as keyof typeof metrics];
    if (metricValue === undefined || metricValue === null) continue;

    const breached = evaluateCondition(metricValue, rule.operator, rule.threshold);
    if (!breached) continue;

    if (rule.lastTriggeredAt) {
      const cooldownMs = (rule.cooldownMinutes ?? 1440) * 60 * 1000;
      if (Date.now() - new Date(rule.lastTriggeredAt).getTime() < cooldownMs) {
        continue;
      }
    }

    const eventType = getMetricEventType(rule.metric);
    const event: NotificationEvent = {
      type: eventType,
      propertyId: property.id,
      propertyName: property.name,
      metric: rule.metric,
      currentValue: metricValue,
      threshold: rule.threshold,
      direction: rule.operator === "<" ? "below" : "above",
      message: `${formatMetricName(rule.metric)} is ${metricValue} (threshold: ${rule.operator} ${rule.threshold}) for ${property.name}`,
      link: `/property/${property.id}`,
      timestamp: new Date(),
      metadata: { ruleName: rule.name, ruleId: rule.id },
    };

    await processNotificationEvent(event);

    await storage.updateAlertRule(rule.id, { lastTriggeredAt: new Date() });
  }
}

function evaluateCondition(value: number, operator: string, threshold: number): boolean {
  switch (operator) {
    case "<": return value < threshold;
    case ">": return value > threshold;
    case "=": return Math.abs(value - threshold) < 0.0001;
    case "!=": return Math.abs(value - threshold) >= 0.0001;
    default: return false;
  }
}

function getMetricEventType(metric: string): NotificationEvent["type"] {
  switch (metric) {
    case "dscr": return "DSCR_BREACH";
    case "cap_rate": return "CAP_RATE_BREACH";
    case "occupancy": return "OCCUPANCY_BREACH";
    case "noi_variance": return "NOI_VARIANCE_BREACH";
    default: return "DSCR_BREACH";
  }
}

function formatMetricName(metric: string): string {
  switch (metric) {
    case "dscr": return "DSCR";
    case "cap_rate": return "Cap Rate";
    case "occupancy": return "Occupancy";
    case "noi_variance": return "NOI Variance";
    default: return metric;
  }
}
