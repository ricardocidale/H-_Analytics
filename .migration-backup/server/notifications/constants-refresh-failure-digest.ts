/**
 * Scheduled alert: emails admins a daily digest of failed scheduled
 * Constants refreshes (server/jobs/specialist-constants-refresh.ts).
 *
 * Each failed cycle persists a `research_runs` row with
 *   entityType='model-constant', status='failed',
 *   metadata.scheduledRefresh=true
 * (see `recordFailure()` in the refresh job). This evaluator pulls the
 * last 24h of such rows, groups them, and sends a single digest email to
 * every admin user. It dedupes by UTC day so it never sends twice for the
 * same digest window even if the scheduler ticks more frequently.
 *
 * Honors:
 *   - `resend_enabled` global gate (same as processNotificationEvent),
 *   - `constants_refresh_digest_disabled` ("true" disables the digest).
 */
import { storage } from "../storage";
import { sendNotificationEmail } from "../integrations/resend";
import { getEventLabel, type NotificationEvent } from "./events";
import { isAdminRole, APP_BRAND_NAME } from "@shared/constants";
import { getAppUrl } from "../providers/config";
import { logger } from "../logger";
import { eq, desc } from "drizzle-orm";
import { db } from "../db";
import { notificationLogs } from "@shared/schema";

export const CONSTANTS_REFRESH_DIGEST_WINDOW_MS = 24 * 60 * 60 * 1000;
export const CONSTANTS_TAB_PATH = "/admin?section=model-defaults&tab=model-constants";

export interface ConstantsRefreshDigestResult {
  status: "ok" | "no-failures" | "already-sent" | "no-admins" | "disabled";
  digestKey?: string;
  failures?: number;
  recipients?: number;
  sent?: number;
  failed?: number;
}

interface FailureRowLite {
  key: string;
  country: string | null;
  subdivision: string | null;
  completedAt: Date;
  error: string;
}

function digestKeyForDay(d: Date): string {
  // UTC YYYY-MM-DD — one digest per calendar day in UTC.
  return d.toISOString().slice(0, 10);
}

function extractFailure(run: {
  metadata: unknown;
  completedAt: Date | null;
  error: string | null;
}): FailureRowLite | null {
  const meta = (run.metadata ?? {}) as {
    constant?: { key?: string; country?: string | null; subdivision?: string | null };
  };
  const c = meta.constant;
  if (!c?.key || !run.completedAt) return null;
  return {
    key: c.key,
    country: c.country ?? null,
    subdivision: c.subdivision ?? null,
    completedAt: run.completedAt,
    error: run.error ?? "(no error message recorded)",
  };
}

async function alreadySentForDigest(digestKey: string): Promise<boolean> {
  const rows = await db
    .select({ metadata: notificationLogs.metadata, status: notificationLogs.status })
    .from(notificationLogs)
    .where(eq(notificationLogs.eventType, "CONSTANTS_REFRESH_FAILED"))
    .orderBy(desc(notificationLogs.createdAt))
    .limit(100);
  return rows.some((r) => {
    if (r.status !== "sent") return false;
    const meta = r.metadata as Record<string, unknown> | null;
    return !!meta && typeof meta.digestKey === "string" && meta.digestKey === digestKey;
  });
}

function buildDigestBody(failures: FailureRowLite[], tabUrl: string): string {
  const items = failures
    .slice(0, 50)
    .map((f) => {
      const loc = `${f.country ?? "universal"}${f.subdivision ? ` / ${f.subdivision}` : ""}`;
      const when = f.completedAt.toISOString();
      const errSafe = String(f.error).slice(0, 240).replace(/[<>]/g, "");
      return `<li><strong>${f.key}</strong> (${loc}) — ${when}<br/><span style="color:#a33">${errSafe}</span></li>`;
    })
    .join("");
  const more = failures.length > 50 ? `<p>…and ${failures.length - 50} more.</p>` : "";
  return (
    `The scheduled Constants refresher recorded <strong>${failures.length}</strong> ` +
    `failed run(s) in the last 24 hours. The next cycle will retry them automatically.` +
    `<br/><br/><strong>Failures:</strong><ul>${items}</ul>${more}` +
    `<a href="${tabUrl}">Open the Constants admin tab</a> to investigate.`
  );
}

export async function evaluateConstantsRefreshFailureDigest(
  options: { now?: Date } = {},
): Promise<ConstantsRefreshDigestResult> {
  const [disabled, resendEnabled] = await Promise.all([
    storage.getNotificationSetting("constants_refresh_digest_disabled"),
    storage.getNotificationSetting("resend_enabled"),
  ]);
  if (disabled === "true") return { status: "disabled" };
  if (resendEnabled !== "true") return { status: "disabled" };

  const now = options.now ?? new Date();
  const since = new Date(now.getTime() - CONSTANTS_REFRESH_DIGEST_WINDOW_MS);

  const runs = await storage.getFailedScheduledConstantsRefreshes(since);
  const failures = runs
    .map(extractFailure)
    .filter((f): f is FailureRowLite => f !== null);

  if (failures.length === 0) return { status: "no-failures" };

  const digestKey = digestKeyForDay(now);
  if (await alreadySentForDigest(digestKey)) {
    return { status: "already-sent", digestKey, failures: failures.length };
  }

  const allUsers = await storage.getAllUsers();
  const admins = allUsers.filter((u) => u.email && isAdminRole(u.role));
  if (admins.length === 0) {
    return { status: "no-admins", digestKey, failures: failures.length };
  }

  const tabUrl = `${getAppUrl()}${CONSTANTS_TAB_PATH}`;
  const subject = `${getEventLabel("CONSTANTS_REFRESH_FAILED")} — ${APP_BRAND_NAME}`;
  const body = buildDigestBody(failures, tabUrl);

  const event: NotificationEvent = {
    type: "CONSTANTS_REFRESH_FAILED",
    message: `Scheduled Constants refresh failures (${failures.length}) in the last 24h.`,
    link: tabUrl,
    timestamp: now,
    metadata: {
      digestKey,
      failureCount: failures.length,
      sampleFailures: failures.slice(0, 10).map((f) => ({
        key: f.key,
        country: f.country,
        subdivision: f.subdivision,
        completedAt: f.completedAt.toISOString(),
        error: f.error.slice(0, 240),
      })),
    },
  };

  let sent = 0;
  let failed = 0;
  for (const admin of admins) {
    try {
      await sendNotificationEmail({
        to: admin.email,
        subject,
        title: getEventLabel("CONSTANTS_REFRESH_FAILED"),
        body,
        actionUrl: tabUrl,
        actionLabel: "Open Constants Tab",
      });
      await storage.createNotificationLog({
        eventType: event.type,
        channel: "email",
        recipient: admin.email,
        subject,
        status: "sent",
        metadata: event.metadata ?? null,
      });
      sent++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`constants-refresh-digest: email to ${admin.email} failed: ${msg}`, "notifications");
      await storage.createNotificationLog({
        eventType: event.type,
        channel: "email",
        recipient: admin.email,
        subject,
        status: "failed",
        errorMessage: msg,
        metadata: event.metadata ?? null,
      });
      failed++;
    }
  }

  logger.info(
    `constants-refresh-digest: digestKey=${digestKey} failures=${failures.length} admins=${admins.length} sent=${sent} failed=${failed}`,
    "notifications",
  );
  return { status: "ok", digestKey, failures: failures.length, recipients: admins.length, sent, failed };
}
