/**
 * Task #557 — Scheduled alert: emails admins when a background scheduler
 * stops running for too long.
 *
 * The Admin → Observability page (server/routes/admin/observability.ts)
 * already flags any scheduler whose `lastRunAt` is older than
 * `cycleIntervalMs * SCHEDULER_STALE_MULTIPLIER` as stale, but admins
 * only see that flag if they happen to open the page. This evaluator
 * runs on a cadence (folded into the 6h ambient cycle) and proactively
 * emails every admin one alert per stale scheduler. Repeated emails for
 * the same scheduler are throttled to one per 24h while it's still
 * stale, modelled on the constants-refresh-failure-digest pattern.
 *
 * Honors the same global gates as the other notification evaluators:
 *   - `resend_enabled` ("true" required)
 *   - `scheduler_stale_alerts_disabled` ("true" disables the alert)
 *
 * One row per email is written to `notification_logs` with
 * `eventType = 'SCHEDULER_STALE'` so we can both audit deliveries and
 * use the metadata to dedupe.
 */
import { storage } from "../storage";
import { sendNotificationEmail } from "../integrations/resend";
import { getEventLabel, type NotificationEvent } from "./events";
import { isAdminRole, APP_BRAND_NAME } from "@shared/constants";
import { getAppUrl } from "../providers/config";
import { logger } from "../logger";
import { eq, gte, and, desc } from "drizzle-orm";
import { db } from "../db";
import { notificationLogs } from "@shared/schema";
import {
  SCHEDULER_REGISTRY,
  SCHEDULER_STALE_MULTIPLIER,
  type SchedulerKey,
} from "../jobs/scheduler-run-tracker";

/** Throttle window: at most one email per scheduler per 24h while stale. */
export const SCHEDULER_STALE_THROTTLE_MS = 24 * 60 * 60 * 1000;

/** Path on the admin page that shows scheduler health. */
export const OBSERVABILITY_TAB_PATH = "/admin?section=observability";

interface StaleScheduler {
  key: SchedulerKey;
  label: string;
  cycleIntervalMs: number;
  /** Wall-clock age since lastRunAt; null when the scheduler has never run. */
  staleForMs: number | null;
  lastRunAt: Date | null;
}

export type SchedulerStaleAlertOutcome =
  | { schedulerKey: string; status: "sent" | "throttled" | "no-admins" | "failed"; sent?: number; failed?: number };

export interface SchedulerStaleAlertResult {
  status: "ok" | "no-stale" | "disabled";
  evaluated?: number;
  stale?: number;
  outcomes?: SchedulerStaleAlertOutcome[];
}

function findStaleSchedulers(
  rows: Array<{ schedulerKey: string; lastRunAt: Date | string | null; cycleIntervalMs: number | null }>,
  now: Date,
): StaleScheduler[] {
  const byKey = new Map(rows.map((r) => [r.schedulerKey, r] as const));
  const result: StaleScheduler[] = [];
  for (const entry of SCHEDULER_REGISTRY) {
    const row = byKey.get(entry.key);
    const cycleIntervalMs = row?.cycleIntervalMs != null
      ? Number(row.cycleIntervalMs)
      : entry.cycleIntervalMs;
    const lastRunDate = row?.lastRunAt
      ? row.lastRunAt instanceof Date
        ? row.lastRunAt
        : new Date(row.lastRunAt)
      : null;
    const ageMs = lastRunDate ? now.getTime() - lastRunDate.getTime() : null;
    // A scheduler that has never recorded a run is intentionally NOT
    // alerted on — that's a "first deploy" or "scheduler never started"
    // condition that the Observability UI surfaces, not a regression we
    // want to spam admins about every 6h.
    if (ageMs == null) continue;
    if (ageMs > cycleIntervalMs * SCHEDULER_STALE_MULTIPLIER) {
      result.push({
        key: entry.key,
        label: entry.label,
        cycleIntervalMs,
        staleForMs: ageMs,
        lastRunAt: lastRunDate,
      });
    }
  }
  return result;
}

/**
 * For each (schedulerKey × recipient) pair, has a successful
 * `SCHEDULER_STALE` alert already been delivered inside the last
 * `SCHEDULER_STALE_THROTTLE_MS` window?
 *
 * We dedupe per-recipient (not per-scheduler globally) so that a
 * partial delivery failure — e.g. one admin's mailbox bouncing while
 * another's succeeds — doesn't lock the failed recipient out of the
 * alert for 24h. The aggregate "one per scheduler per 24h" guarantee
 * the task asks for still holds for any individual admin, since each
 * admin's row is independently throttled.
 *
 * We query by `createdAt >= cutoff` (no fixed row cap) so the throttle
 * remains correct under arbitrary scale: N admins × M stale schedulers
 * could otherwise produce more rows than a small `limit(...)` would
 * cover, allowing in-window deliveries to fall off the end of the
 * lookup and trigger an unwanted resend before 24h elapsed. The window
 * is inherently bounded (24h of SCHEDULER_STALE rows only), and the
 * `notification_logs_created_at_idx` index keeps the scan cheap.
 */
async function recentlyAlertedRecipients(
  schedulerKey: string,
  now: Date,
): Promise<Set<string>> {
  const cutoff = new Date(now.getTime() - SCHEDULER_STALE_THROTTLE_MS);
  const rows = await db
    .select({
      metadata: notificationLogs.metadata,
      status: notificationLogs.status,
      recipient: notificationLogs.recipient,
      createdAt: notificationLogs.createdAt,
    })
    .from(notificationLogs)
    .where(
      and(
        eq(notificationLogs.eventType, "SCHEDULER_STALE"),
        gte(notificationLogs.createdAt, cutoff),
      ),
    )
    .orderBy(desc(notificationLogs.createdAt));
  const recipients = new Set<string>();
  for (const r of rows) {
    if (r.status !== "sent") continue;
    if (!r.recipient) continue;
    const meta = r.metadata as Record<string, unknown> | null;
    if (!meta || typeof meta.schedulerKey !== "string" || meta.schedulerKey !== schedulerKey) continue;
    recipients.add(r.recipient);
  }
  return recipients;
}

function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  const minutes = ms / 60_000;
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = minutes / 60;
  if (hours < 48) return `${hours.toFixed(1)}h`;
  const days = hours / 24;
  return `${days.toFixed(1)}d`;
}

function buildEmailBody(stale: StaleScheduler, tabUrl: string): string {
  const ageStr = stale.staleForMs == null ? "never run" : formatDuration(stale.staleForMs);
  const intervalStr = formatDuration(stale.cycleIntervalMs);
  const lastRunStr = stale.lastRunAt ? stale.lastRunAt.toISOString() : "never";
  return (
    `<strong>${stale.label}</strong> (<code>${stale.key}</code>) hasn't run in ` +
    `<strong>${ageStr}</strong>. Its expected cycle is every ${intervalStr}, so this ` +
    `is past the ${SCHEDULER_STALE_MULTIPLIER}× stale threshold.` +
    `<br/><br/>Last successful cycle: ${lastRunStr}.` +
    `<br/><br/>The scheduler is almost certainly broken — check server logs and ` +
    `restart the affected job.` +
    `<br/><br/><a href="${tabUrl}">Open Admin → Observability</a> to investigate.`
  );
}

async function emailAdminsForScheduler(
  stale: StaleScheduler,
  admins: Array<{ id: number; email: string | null }>,
  alreadyAlertedRecipients: Set<string>,
  now: Date,
): Promise<SchedulerStaleAlertOutcome> {
  const tabUrl = `${getAppUrl()}${OBSERVABILITY_TAB_PATH}`;
  const subject = `${getEventLabel("SCHEDULER_STALE")} — ${stale.label} — ${APP_BRAND_NAME}`;
  const body = buildEmailBody(stale, tabUrl);

  const event: NotificationEvent = {
    type: "SCHEDULER_STALE",
    message: `Background scheduler "${stale.label}" hasn't run in ${
      stale.staleForMs == null ? "the expected window" : formatDuration(stale.staleForMs)
    }.`,
    link: tabUrl,
    timestamp: now,
    metadata: {
      schedulerKey: stale.key,
      schedulerLabel: stale.label,
      cycleIntervalMs: stale.cycleIntervalMs,
      staleForMs: stale.staleForMs,
      staleMultiplier: SCHEDULER_STALE_MULTIPLIER,
      lastRunAt: stale.lastRunAt ? stale.lastRunAt.toISOString() : null,
    },
  };

  let sent = 0;
  let failed = 0;
  for (const admin of admins) {
    if (!admin.email) continue;
    if (alreadyAlertedRecipients.has(admin.email)) {
      continue;
    }
    try {
      await sendNotificationEmail({
        to: admin.email,
        subject,
        title: `${getEventLabel("SCHEDULER_STALE")} — ${stale.label}`,
        body,
        actionUrl: tabUrl,
        actionLabel: "Open Observability",
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
      logger.error(`scheduler-stale-alert: email to ${admin.email} failed: ${msg}`, "notifications");
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
  // Status semantics:
  //   • sent      — at least one new email went out
  //   • throttled — no new email went out, but every eligible recipient
  //                 was already alerted inside the 24h window
  //   • failed    — there were eligible recipients to send to but every
  //                 send threw
  let status: SchedulerStaleAlertOutcome["status"];
  if (sent > 0) status = "sent";
  else if (failed > 0) status = "failed";
  else status = "throttled";
  return { schedulerKey: stale.key, status, sent, failed };
}

export async function evaluateSchedulerStaleAlert(
  options: { now?: Date } = {},
): Promise<SchedulerStaleAlertResult> {
  const [disabled, resendEnabled] = await Promise.all([
    storage.getNotificationSetting("scheduler_stale_alerts_disabled"),
    storage.getNotificationSetting("resend_enabled"),
  ]);
  if (disabled === "true") return { status: "disabled" };
  if (resendEnabled !== "true") return { status: "disabled" };

  const now = options.now ?? new Date();
  const rows = await storage.listSchedulerRuns();
  const staleSchedulers = findStaleSchedulers(rows, now);

  if (staleSchedulers.length === 0) {
    return { status: "no-stale", evaluated: SCHEDULER_REGISTRY.length, stale: 0 };
  }

  const allUsers = await storage.getAllUsers();
  const admins = allUsers.filter((u) => u.email && isAdminRole(u.role));
  const outcomes: SchedulerStaleAlertOutcome[] = [];

  for (const stale of staleSchedulers) {
    if (admins.length === 0) {
      outcomes.push({ schedulerKey: stale.key, status: "no-admins" });
      continue;
    }
    const alreadyAlerted = await recentlyAlertedRecipients(stale.key, now);
    const eligibleAdmins = admins.filter((a) => a.email);
    const allAlreadyAlerted =
      eligibleAdmins.length > 0 &&
      eligibleAdmins.every((a) => a.email && alreadyAlerted.has(a.email));
    if (allAlreadyAlerted) {
      outcomes.push({ schedulerKey: stale.key, status: "throttled" });
      continue;
    }
    const outcome = await emailAdminsForScheduler(stale, admins, alreadyAlerted, now);
    outcomes.push(outcome);
  }

  logger.info(
    `scheduler-stale-alert: stale=${staleSchedulers.length} admins=${admins.length} ` +
      `sent=${outcomes.filter((o) => o.status === "sent").length} ` +
      `throttled=${outcomes.filter((o) => o.status === "throttled").length}`,
    "notifications",
  );

  return {
    status: "ok",
    evaluated: SCHEDULER_REGISTRY.length,
    stale: staleSchedulers.length,
    outcomes,
  };
}
