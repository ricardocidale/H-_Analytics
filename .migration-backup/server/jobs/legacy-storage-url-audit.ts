/**
 * Nightly legacy-storage-URL audit (Task #534).
 *
 * Companion to:
 *   - `script/check-no-legacy-storage-urls.ts` — PR-time guard against new
 *     code writing legacy Replit Object Storage URL shapes.
 *   - `script/audit-legacy-storage-urls-in-db.ts` — on-demand data-side
 *     audit of every text/varchar/jsonb column in the `public` schema
 *     (Task #529).
 *
 * The on-demand audit only catches what's in the database the moment an
 * operator runs it. This scheduler runs the same scanner nightly so a
 * write path that bypasses the source-side guard (third-party
 * integration, backfill, admin paste) is caught the next morning instead
 * of waiting for someone to remember to run the script.
 *
 * Behaviour:
 *   1. Scans the database via the shared scanner in
 *      `script/lib/legacy-storage-url-audit.ts` (the same scanner the CLI
 *      script uses, so reports stay in lockstep).
 *   2. Records a one-row cycle summary in `scheduler_runs` so the Admin →
 *      Observability page can show "last run, what happened, did it fail"
 *      and warn when the scheduler stops ticking.
 *   3. On non-zero hits, emits one `LEGACY_STORAGE_URLS_FOUND`
 *      notification event per admin recipient through
 *      `processNotificationEvent` — the same path used by the
 *      Constants-overdue digest and Specialist quality band-drop
 *      notifications.
 *   4. Suppresses repeat emails when the audit state hasn't changed: the
 *      "fingerprint" is the per-column hit-count signature, so the same
 *      bad rows on consecutive nights only notify once. A new column
 *      appearing or a hit-count changing forces a fresh notification.
 *      Once the audit comes back clean, the fingerprint resets so the
 *      next regression notifies again.
 *   5. Honors `legacy_storage_url_audit_disabled` ("true" mutes admin
 *      emails for this audit, while still recording cycle summaries and
 *      keeping the scanner running). Mirrors
 *      `specialist_quality_band_change_disabled` for the nightly
 *      Specialist quality recomputer.
 *
 * Scheduling: hooked from `server/index.ts`. Initial run after a settle
 * delay so migrations + seeds + sibling schedulers have a chance to
 * land first; then once every 24h. Concurrency-guarded so a manual run
 * (none yet, but room for an admin "run now" button) cannot race with
 * the cycle.
 */
import { pool } from "../db";
import { storage } from "../storage";
import { logger, log as serverLog } from "../logger";
import { processNotificationEvent } from "../notifications/engine";
import { createEvent } from "../notifications/events";
import { isAdminRole } from "@shared/constants";
import { recordSchedulerCycle, truncateNotes } from "./scheduler-run-tracker";
import { getAppUrl } from "../providers/config";
import {
  runLegacyStorageUrlAudit,
  type AuditReport,
} from "../../script/lib/legacy-storage-url-audit";

const SOURCE = "legacy-storage-url-audit";

const CYCLE_INTERVAL_MS = 24 * 60 * 60 * 1000; // nightly
const STARTUP_DELAY_MS = 90 * 1000; // let migrations + seeds + sibling schedulers settle

let schedulerInterval: NodeJS.Timeout | null = null;
let startupTimeout: NodeJS.Timeout | null = null;
let isRunning = false;

/**
 * Last fingerprint we emailed admins about. The fingerprint is the
 * per-column hit-count signature (sorted, stable). When the audit
 * returns the same signature on consecutive nights we suppress the
 * email — admins were already told about this exact set of rows.
 *
 * Cleared when the audit comes back clean so the next regression is a
 * fresh event and re-notifies. Module-level (not persisted) — a server
 * restart resets the fingerprint, which is fine: at worst admins get
 * one extra email after a restart, never one too few.
 */
let lastNotifiedFingerprint: string | null = null;

export function _resetLegacyStorageAuditStateForTest(): void {
  lastNotifiedFingerprint = null;
  isRunning = false;
}

/**
 * Stable signature of the audit's column-level hit distribution. We do
 * NOT include individual `pk` values — those can churn (rows get
 * inserted, deleted, renumbered) without the underlying problem
 * actually changing. The column-level signature captures "where the bad
 * rows live and how many there are", which is the actionable bit.
 */
export function fingerprintReport(report: AuditReport): string {
  if (report.totalHits === 0) return "clean";
  const entries = Array.from(report.byColumn.entries()).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return entries.map(([col, n]) => `${col}=${n}`).join("|");
}

/**
 * Cap on the number of row-level samples included in the email body and
 * the notification metadata. Emails must remain readable, and the
 * `notifications` table is not a row-by-row audit log — when a bad
 * column is huge, the email shows the first N pks and points operators
 * at the CLI for the full report.
 */
const ROW_SAMPLE_LIMIT = 25;

export interface AffectedRowSample {
  table: string;
  column: string;
  pk: string | number;
  pattern: string;
}

/**
 * Pick a deterministic, bounded sample of `(table, column, pk)` rows so
 * an admin who only reads the email can still identify *which* concrete
 * rows to look at. Sorted by table, column, pk for stability across
 * cycles (so suppression and change-detection stay coherent).
 */
export function selectRowSamples(report: AuditReport): AffectedRowSample[] {
  return [...report.hits]
    .sort((a, b) => {
      if (a.table !== b.table) return a.table.localeCompare(b.table);
      if (a.column !== b.column) return a.column.localeCompare(b.column);
      const aPk = String(a.pk);
      const bPk = String(b.pk);
      return aPk.localeCompare(bPk, undefined, { numeric: true });
    })
    .slice(0, ROW_SAMPLE_LIMIT)
    .map((h) => ({
      table: h.table,
      column: h.column,
      pk: h.pk,
      pattern: h.pattern,
    }));
}

function buildEmailMessage(
  report: AuditReport,
  rowSamples: AffectedRowSample[],
  dashboardUrl: string,
): string {
  const sortedCols = Array.from(report.byColumn.entries()).sort((a, b) => b[1] - a[1]);
  const colLines = sortedCols
    .slice(0, 25)
    .map(([col, n]) => `• ${col} — ${n} row(s)`)
    .join("\n");
  const more =
    sortedCols.length > 25 ? `\n…and ${sortedCols.length - 25} more column(s).` : "";
  const patternLines = Object.entries(report.byPattern)
    .filter(([, n]) => n > 0)
    .map(([p, n]) => `• ${p} — ${n}`)
    .join("\n");

  const rowLines = rowSamples
    .map((r) => `• ${r.table}.${r.column} pk=${r.pk}`)
    .join("\n");
  const rowMore =
    report.totalHits > rowSamples.length
      ? `\n…and ${report.totalHits - rowSamples.length} more row(s) — run the CLI for the full list.`
      : "";

  return (
    `The nightly legacy-storage-URL audit found <strong>${report.totalHits}</strong> ` +
    `row(s) referencing banned legacy Replit Object Storage URL shapes across ` +
    `<strong>${report.byColumn.size}</strong> column(s).<br/><br/>` +
    `<strong>By column (top 25):</strong><pre style="white-space:pre-wrap">${colLines}${more}</pre>` +
    `<strong>By pattern:</strong><pre style="white-space:pre-wrap">${patternLines}</pre>` +
    `<strong>Affected rows (first ${rowSamples.length}):</strong>` +
    `<pre style="white-space:pre-wrap">${rowLines}${rowMore}</pre>` +
    `Run <code>npx tsx script/audit-legacy-storage-urls-in-db.ts</code> for a full row-level ` +
    `report, then <code>script/r2-cutover-reconcile.ts --rewrite-legacy-hosts</code> (or a ` +
    `bespoke migration for non-rewritable shapes) to clean these up.<br/><br/>` +
    `<a href="${dashboardUrl}">Open the Observability dashboard</a> to inspect the cycle history.`
  );
}

async function notifyAdminsOfHits(report: AuditReport): Promise<{
  recipients: number;
  sent: number;
  failed: number;
}> {
  const allUsers = await storage.getAllUsers();
  const admins = allUsers.filter((u) => u.email && isAdminRole(u.role));
  if (admins.length === 0) return { recipients: 0, sent: 0, failed: 0 };

  const dashboardUrl = `${getAppUrl().replace(/\/+$/, "")}/admin?section=observability`;
  const rowSamples = selectRowSamples(report);
  const message = buildEmailMessage(report, rowSamples, dashboardUrl);
  const sharedMetadata = {
    totalHits: report.totalHits,
    columnsAffected: report.byColumn.size,
    byPattern: report.byPattern,
    byColumn: Object.fromEntries(report.byColumn),
    fingerprint: fingerprintReport(report),
    // Row-level identifiers so an alert pipeline (or an admin reading
    // the email) can pinpoint the affected rows without re-running the
    // CLI. Capped — see ROW_SAMPLE_LIMIT.
    affectedRows: rowSamples,
    affectedRowsTruncated: report.totalHits > rowSamples.length,
  };

  let sent = 0;
  let failed = 0;
  for (const admin of admins) {
    try {
      const event = createEvent("LEGACY_STORAGE_URLS_FOUND", {
        message,
        link: dashboardUrl,
        metadata: {
          recipientEmail: admin.email,
          ...sharedMetadata,
        },
      });
      await processNotificationEvent(event);
      sent++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(
        `${SOURCE}: notify ${admin.email} failed: ${msg}`,
        SOURCE,
      );
      failed++;
    }
  }

  return { recipients: admins.length, sent, failed };
}

export interface LegacyStorageAuditCycleSummary {
  totalHits: number;
  columnsAffected: number;
  skippedColumns: number;
  fingerprint: string;
  notification:
    | { status: "clean" }
    | { status: "disabled"; reason: string }
    | { status: "suppressed"; reason: string }
    | { status: "no-admins" }
    | { status: "sent"; recipients: number; sent: number; failed: number };
}

/**
 * Run one full audit cycle: scan, record observability summary, and
 * notify admins on a fresh non-zero state. Returns a summary the caller
 * (scheduler tick or test harness) can introspect.
 */
export async function runLegacyStorageUrlAuditCycle(): Promise<LegacyStorageAuditCycleSummary> {
  if (isRunning) {
    serverLog("Cycle already in progress — skipping", SOURCE, "warn");
    return {
      totalHits: 0,
      columnsAffected: 0,
      skippedColumns: 0,
      fingerprint: "skipped",
      notification: { status: "suppressed", reason: "cycle-in-progress" },
    };
  }
  isRunning = true;
  const cycleStart = Date.now();
  let cycleThrew = false;
  let cycleErrorMessage: string | null = null;
  let report: AuditReport | null = null;
  let notification: LegacyStorageAuditCycleSummary["notification"] = {
    status: "clean",
  };

  try {
    report = await runLegacyStorageUrlAudit(pool);

    if (report.totalHits === 0) {
      // Reset suppression so the next regression triggers a fresh email.
      if (lastNotifiedFingerprint !== null && lastNotifiedFingerprint !== "clean") {
        serverLog(
          `Audit recovered to clean state (was: ${lastNotifiedFingerprint})`,
          SOURCE,
        );
      }
      lastNotifiedFingerprint = "clean";
      notification = { status: "clean" };
    } else {
      const fingerprint = fingerprintReport(report);
      if (lastNotifiedFingerprint === fingerprint) {
        serverLog(
          `Suppressed duplicate notification (fingerprint=${fingerprint})`,
          SOURCE,
        );
        notification = {
          status: "suppressed",
          reason: "duplicate-fingerprint",
        };
      } else {
        const disabled =
          (await storage.getNotificationSetting(
            "legacy_storage_url_audit_disabled",
          )) === "true";
        if (disabled) {
          serverLog(
            `Suppressed notification (disabled by admin); ${report.totalHits} hit(s) across ${report.byColumn.size} column(s)`,
            SOURCE,
          );
          notification = { status: "disabled", reason: "admin-muted" };
          // Do NOT update fingerprint when disabled — re-enabling should
          // immediately surface the next genuine cycle as a fresh event.
        } else {
          const result = await notifyAdminsOfHits(report);
          if (result.recipients === 0) {
            serverLog(
              `No admin recipients to notify; ${report.totalHits} hit(s) across ${report.byColumn.size} column(s)`,
              SOURCE,
              "warn",
            );
            notification = { status: "no-admins" };
            // Do NOT update fingerprint — once an admin exists they
            // should be notified of the still-present problem.
          } else {
            serverLog(
              `Notified ${result.sent}/${result.recipients} admin(s) (${result.failed} failed) about ${report.totalHits} hit(s) across ${report.byColumn.size} column(s)`,
              SOURCE,
            );
            notification = {
              status: "sent",
              recipients: result.recipients,
              sent: result.sent,
              failed: result.failed,
            };
            lastNotifiedFingerprint = fingerprint;
          }
        }
      }
    }

    return {
      totalHits: report.totalHits,
      columnsAffected: report.byColumn.size,
      skippedColumns: report.skippedColumns.length,
      fingerprint: fingerprintReport(report),
      notification,
    };
  } catch (err: unknown) {
    cycleThrew = true;
    cycleErrorMessage = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    isRunning = false;
    // Persist a one-row cycle summary so the Admin → Observability page
    // can report "last run, what happened, did it fail" without scraping
    // logs. A clean cycle is `ok`; non-zero hits are `warn` (the audit
    // itself ran fine, the data is the problem); a thrown scanner is
    // `error`. Skipped columns add a hint to the notes so coverage
    // regressions are visible.
    const totalHits = report?.totalHits ?? 0;
    const columnsAffected = report?.byColumn.size ?? 0;
    const skippedCount = report?.skippedColumns.length ?? 0;
    const status: "ok" | "warn" | "error" = cycleThrew
      ? "error"
      : totalHits > 0 || skippedCount > 0
        ? "warn"
        : "ok";
    const skipNote =
      skippedCount > 0 ? ` (${skippedCount} column(s) skipped)` : "";
    const notes = cycleThrew
      ? truncateNotes(cycleErrorMessage)
      : totalHits === 0
        ? `Clean${skipNote}`
        : truncateNotes(
            `${totalHits} hit(s) across ${columnsAffected} column(s)${skipNote}; notification=${notification.status}`,
          );
    void recordSchedulerCycle({
      key: "legacy-storage-url-audit",
      considered: report ? report.byColumn.size : 0,
      succeeded: report ? report.totalHits : 0,
      failed: cycleThrew ? 1 : 0,
      status,
      notes,
      durationMs: Date.now() - cycleStart,
    });
  }
}

export function startLegacyStorageUrlAuditScheduler(): void {
  if (startupTimeout || schedulerInterval) return;
  serverLog(
    `Starting — initial audit in ${STARTUP_DELAY_MS / 1000}s, then every ${CYCLE_INTERVAL_MS / 3_600_000}h`,
    SOURCE,
  );
  startupTimeout = setTimeout(() => {
    startupTimeout = null;
    runLegacyStorageUrlAuditCycle().catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      serverLog(`Initial cycle failed: ${msg}`, SOURCE, "error");
    });
    schedulerInterval = setInterval(() => {
      runLegacyStorageUrlAuditCycle().catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        serverLog(`Periodic cycle failed: ${msg}`, SOURCE, "error");
      });
    }, CYCLE_INTERVAL_MS);
  }, STARTUP_DELAY_MS);
}

export function stopLegacyStorageUrlAuditScheduler(): void {
  if (startupTimeout) {
    clearTimeout(startupTimeout);
    startupTimeout = null;
  }
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
  serverLog("Stopped", SOURCE);
}
