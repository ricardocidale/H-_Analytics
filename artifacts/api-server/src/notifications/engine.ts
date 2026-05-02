import type { NotificationEvent } from "./events";
import { ALERT_METRICS, type AlertMetric } from "@workspace/db";
import { getEventLabel } from "./events";
import type { Property } from "@workspace/db";
import { sendNotificationEmail } from "../integrations/resend";
import { storage } from "../storage";
import { APP_BRAND_NAME, DEFAULT_ALERT_COOLDOWN_MINUTES } from "@shared/constants";
import { logger } from "../logger";
import { getAppUrl } from "../providers/config";

/**
 * Convert a notification event's `link` to an absolute URL suitable for
 * an email CTA button. Email clients cannot resolve relative paths, so
 * a callsite like `link: \`/property/${id}\`` would render a broken
 * "Open property" button. We rewrite any relative path against the
 * configured app URL; absolute http(s) URLs pass through untouched.
 * Returns `undefined` when the event has no link, so the email omits
 * the action button entirely (as it did before action URLs were wired).
 */
function emailActionUrl(link: string | undefined): string | undefined {
  if (!link) return undefined;
  if (/^https?:\/\//i.test(link)) return link;
  const base = getAppUrl().replace(/\/+$/, "");
  const path = link.startsWith("/") ? link : `/${link}`;
  return `${base}${path}`;
}

async function logNotification(
  event: NotificationEvent,
  channel: "email",
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
        actionUrl: emailActionUrl(event.link),
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
  // Skip alerts for properties excluded from portfolio calculations
  if (property.isActive === false) return;

  const rules = await storage.getActiveAlertRulesForProperty(property.id);

  for (const rule of rules) {
    const metricValue = metrics[rule.metric as keyof typeof metrics];
    if (metricValue === undefined || metricValue === null) continue;

    const breached = evaluateCondition(metricValue, rule.operator, rule.threshold);
    if (!breached) continue;

    if (rule.lastTriggeredAt) {
      const cooldownMs = (rule.cooldownMinutes ?? DEFAULT_ALERT_COOLDOWN_MINUTES) * 60 * 1000;
      if (Date.now() - new Date(rule.lastTriggeredAt).getTime() < cooldownMs) {
        continue;
      }
    }

    if (!isAlertMetric(rule.metric)) {
      console.warn(`[notifications] skipping rule ${rule.id}: unknown metric "${rule.metric}"`);
      continue;
    }
    const ruleMetric: AlertMetric = rule.metric;
    const eventType = getMetricEventType(ruleMetric);
    const event: NotificationEvent = {
      type: eventType,
      propertyId: property.id,
      propertyName: property.name,
      metric: ruleMetric,
      currentValue: metricValue,
      threshold: rule.threshold,
      direction: rule.operator === "<" ? "below" : "above",
      message: `${formatMetricName(ruleMetric)} is ${metricValue} (threshold: ${rule.operator} ${rule.threshold}) for ${property.name}`,
      link: `/property/${property.id}`,
      timestamp: new Date(),
      metadata: { ruleName: rule.name, ruleId: rule.id },
    };

    await processNotificationEvent(event);

    await storage.updateAlertRule(rule.id, { lastTriggeredAt: new Date() });
  }
}

function isAlertMetric(value: string): value is AlertMetric {
  return (ALERT_METRICS as readonly string[]).includes(value);
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

function getMetricEventType(metric: AlertMetric): NotificationEvent["type"] {
  switch (metric) {
    case "dscr": return "DSCR_BREACH";
    case "cap_rate": return "CAP_RATE_BREACH";
    case "occupancy": return "OCCUPANCY_BREACH";
    case "noi_variance": return "NOI_VARIANCE_BREACH";
    default: {
      const _exhaustive: never = metric;
      throw new Error(`Unhandled alert metric: ${String(_exhaustive)}`);
    }
  }
}

function formatMetricName(metric: AlertMetric): string {
  switch (metric) {
    case "dscr": return "DSCR";
    case "cap_rate": return "Cap Rate";
    case "occupancy": return "Occupancy";
    case "noi_variance": return "NOI Variance";
    default: {
      const _exhaustive: never = metric;
      throw new Error(`Unhandled alert metric: ${String(_exhaustive)}`);
    }
  }
}
