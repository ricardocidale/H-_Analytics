/**
 * Scheduled alert: emails admins when the most recent vector benchmark run's
 * p95 latency exceeds the thresholds embedded in `docs/vector-bench-history.json`.
 *
 * The history file is produced by `script/vector-bench.ts` (see `recordHistory`)
 * and has the shape:
 *   {
 *     thresholds: { singleP95Ms, singleP50Ms, multiP95Ms, multiP50Ms },
 *     namespaces, updatedAt,
 *     runs: [{ timestamp, queries, topK, sizes, results: [{ size, single, multi }] }]
 *   }
 *
 * On each tick this evaluator picks the latest run, compares each size's
 * single-namespace p95 against `thresholds.singleP95Ms` and the
 * multi-namespace p95 against `thresholds.multiP95Ms`. When any size breaches,
 * an email is sent to every admin user via the existing notifications channel.
 * Each run is alerted on at most once (deduped by `runId = run.timestamp`).
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { storage } from "../storage";
import { sendNotificationEmail } from "../integrations/resend";
import { getEventLabel, type NotificationEvent } from "./events";
import { isAdminRole, APP_BRAND_NAME } from "@shared/constants";
import { getAppUrl } from "../providers/config";
import { logger } from "../logger";
import { eq, desc } from "drizzle-orm";
import { db } from "../db";
import { notificationLogs } from "@shared/schema";

export const VECTOR_BENCH_HISTORY_PATH = "docs/vector-bench-history.json";
/** Path on the admin page that mounts the vector-search-latency chart. */
export const VECTOR_LATENCY_CHART_PATH = "/admin?section=vector-bench";

interface BenchStats {
  count?: number;
  meanMs?: number;
  p50Ms: number;
  p95Ms: number;
  maxMs?: number;
}

interface BenchRunResult {
  size: number;
  totalRowsAtRun?: number;
  single: BenchStats;
  multi: BenchStats;
}

interface BenchRun {
  timestamp: string;
  node?: string;
  dbHint?: string;
  queries?: number;
  topK?: number;
  sizes?: number[];
  results: BenchRunResult[];
}

interface BenchThresholds {
  singleP95Ms: number;
  singleP50Ms?: number;
  multiP95Ms: number;
  multiP50Ms?: number;
}

interface BenchHistory {
  thresholds: BenchThresholds;
  namespaces?: number;
  updatedAt?: string;
  runs: BenchRun[];
}

interface BreachedSize {
  size: number;
  scope: "single" | "multi";
  metric: "p50" | "p95";
  /** The actual latency value (ms) for the breached metric. */
  valueMs: number;
  /** The threshold (ms) that the value exceeded. */
  thresholdMs: number;
  /** Both p50 and p95 are included for context in emails / metadata. */
  p50Ms: number;
  p95Ms: number;
  /**
   * Legacy field retained for backward compatibility with downstream
   * consumers that expected a p95-only shape. Set only on p95 breaches.
   */
  thresholdP95Ms?: number;
}

/**
 * Resolve the effective thresholds by overlaying admin-provided overrides
 * (stored in `notification_settings`) on top of whatever was embedded in
 * `docs/vector-bench-history.json`. Both p95 and p50 thresholds may be
 * overridden independently for the single- and multi-namespace scopes.
 *
 * Override keys:
 *   - vector_latency_single_p95_override
 *   - vector_latency_multi_p95_override
 *   - vector_latency_single_p50_override   (new — see task #374)
 *   - vector_latency_multi_p50_override    (new — see task #374)
 *
 * A non-empty positive numeric override replaces the file value; an empty
 * string, null, or non-positive value leaves the file value in place.
 */
export interface ResolvedVectorLatencyThresholds {
  singleP95Ms: number;
  multiP95Ms: number;
  singleP50Ms?: number;
  multiP50Ms?: number;
}

function parseOverride(raw: string | null | undefined): number | undefined {
  if (raw == null) return undefined;
  const trimmed = String(raw).trim();
  if (trimmed === "") return undefined;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n;
}

/**
 * Combine the file thresholds with the admin-provided p95 overrides
 * (already loaded into `config` by `resolveVectorLatencyConfig`) and the
 * two new p50 override settings. Used by both the evaluator and tests.
 */
export async function resolveVectorLatencyThresholds(
  history: BenchHistory,
  config?: { singleP95Override: number | null; multiP95Override: number | null },
): Promise<ResolvedVectorLatencyThresholds> {
  const [singleP95Raw, multiP95Raw, singleP50Raw, multiP50Raw] = await Promise.all([
    config ? Promise.resolve(null) : storage.getNotificationSetting("vector_latency_single_p95_override"),
    config ? Promise.resolve(null) : storage.getNotificationSetting("vector_latency_multi_p95_override"),
    storage.getNotificationSetting("vector_latency_single_p50_override"),
    storage.getNotificationSetting("vector_latency_multi_p50_override"),
  ]);
  const singleP95 = config?.singleP95Override ?? parseOverride(singleP95Raw);
  const multiP95 = config?.multiP95Override ?? parseOverride(multiP95Raw);
  return {
    singleP95Ms: singleP95 ?? history.thresholds.singleP95Ms,
    multiP95Ms: multiP95 ?? history.thresholds.multiP95Ms,
    singleP50Ms: parseOverride(singleP50Raw) ?? history.thresholds.singleP50Ms,
    multiP50Ms: parseOverride(multiP50Raw) ?? history.thresholds.multiP50Ms,
  };
}

async function loadHistory(path: string): Promise<BenchHistory | null> {
  try {
    const raw = await readFile(resolve(process.cwd(), path), "utf8");
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      Array.isArray(parsed.runs) &&
      parsed.thresholds &&
      typeof parsed.thresholds.singleP95Ms === "number" &&
      typeof parsed.thresholds.multiP95Ms === "number"
    ) {
      return parsed as BenchHistory;
    }
    logger.warn(`vector-latency-alert: unexpected shape in ${path}`, "notifications");
    return null;
  } catch (err: unknown) {
    const e = err as NodeJS.ErrnoException;
    if (e?.code === "ENOENT") return null;
    logger.warn(
      `vector-latency-alert: failed to read ${path}: ${e?.message ?? String(err)}`,
      "notifications",
    );
    return null;
  }
}

function pickLatestRun(history: BenchHistory): BenchRun | null {
  const runs = history.runs.filter((r) => r && Array.isArray(r.results) && typeof r.timestamp === "string");
  if (runs.length === 0) return null;
  // Trust file order (append-only) but tolerate out-of-order data.
  const sorted = [...runs].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  return sorted[sorted.length - 1];
}

function findBreaches(
  run: BenchRun,
  thresholds: ResolvedVectorLatencyThresholds,
): BreachedSize[] {
  const breaches: BreachedSize[] = [];
  const checks: Array<{ scope: "single" | "multi"; metric: "p50" | "p95"; threshold: number | undefined }> = [
    { scope: "single", metric: "p95", threshold: thresholds.singleP95Ms },
    { scope: "multi", metric: "p95", threshold: thresholds.multiP95Ms },
    { scope: "single", metric: "p50", threshold: thresholds.singleP50Ms },
    { scope: "multi", metric: "p50", threshold: thresholds.multiP50Ms },
  ];
  for (const r of run.results ?? []) {
    for (const c of checks) {
      const t = Number(c.threshold);
      if (!Number.isFinite(t) || t <= 0) continue;
      const stats = c.scope === "single" ? r.single : r.multi;
      if (!stats) continue;
      const value = c.metric === "p95" ? stats.p95Ms : stats.p50Ms;
      if (!(value > t)) continue;
      const breach: BreachedSize = {
        size: r.size,
        scope: c.scope,
        metric: c.metric,
        valueMs: value,
        thresholdMs: t,
        p50Ms: stats.p50Ms,
        p95Ms: stats.p95Ms,
      };
      if (c.metric === "p95") breach.thresholdP95Ms = t;
      breaches.push(breach);
    }
  }
  return breaches;
}

async function alreadyAlerted(runId: string): Promise<boolean> {
  // Only treat a run as "already alerted" when at least one successful send
  // has been logged for it. Failed sends should not block retries on the
  // next tick (e.g. transient Resend outage).
  const rows = await db
    .select({ metadata: notificationLogs.metadata, status: notificationLogs.status })
    .from(notificationLogs)
    .where(eq(notificationLogs.eventType, "VECTOR_LATENCY_BREACH"))
    .orderBy(desc(notificationLogs.createdAt))
    .limit(100);
  return rows.some((r) => {
    if (r.status !== "sent") return false;
    const meta = r.metadata as Record<string, unknown> | null;
    return !!meta && typeof meta.runId === "string" && meta.runId === runId;
  });
}

function fmt(ms: number): string {
  if (!Number.isFinite(ms)) return "n/a";
  return ms >= 100 ? ms.toFixed(0) : ms.toFixed(1);
}

function buildEmailBody(run: BenchRun, breaches: BreachedSize[], chartUrl: string): string {
  const lines = breaches
    .map(
      (b) =>
        `<li><strong>size ${b.size.toLocaleString()} (${b.scope}-namespace)</strong>: ` +
        `${b.metric} <strong>${fmt(b.valueMs)} ms</strong> ` +
        `(threshold ${fmt(b.thresholdMs)} ms; p50 ${fmt(b.p50Ms)} ms, p95 ${fmt(b.p95Ms)} ms)</li>`,
    )
    .join("");
  const meta =
    `Run timestamp: ${run.timestamp}` +
    (run.topK ? `, top-K=${run.topK}` : "") +
    (run.queries ? `, queries/size=${run.queries}` : "");
  return (
    `The most recent vector benchmark run breached the configured latency thresholds.` +
    `<br/><br/>${meta}` +
    `<br/><br/><strong>Breached results:</strong><ul>${lines}</ul>` +
    `<a href="${chartUrl}">Open the latency chart</a> in the admin console (Intelligence → Vector Search Latency) to investigate.`
  );
}

export interface VectorLatencyAlertResult {
  status: "ok" | "no-history" | "no-breach" | "already-alerted" | "no-admins" | "disabled";
  runId?: string;
  breaches?: BreachedSize[];
  recipients?: number;
  sent?: number;
  failed?: number;
}

/**
 * Settings keys this evaluator honors (all stored in `notification_settings`):
 *  - `vector_latency_alerts_disabled` ("true" disables the alert entirely)
 *  - `vector_latency_single_p95_override` (numeric string; replaces file threshold)
 *  - `vector_latency_multi_p95_override`  (numeric string; replaces file threshold)
 *  - `vector_latency_recipient_user_ids`  (JSON array of admin user ids; when set,
 *     restricts recipients to that subset of admins. Empty/null => all admins.)
 */
function parsePositiveNumber(value: string | null | undefined): number | null {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function parseRecipientUserIds(value: string | null | undefined): number[] | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return null;
    const ids = parsed
      .map((v) => Number(v))
      .filter((n) => Number.isFinite(n) && Number.isInteger(n) && n > 0);
    return ids.length > 0 ? ids : null;
  } catch {
    return null;
  }
}

export async function resolveVectorLatencyConfig(): Promise<{
  alertsEnabled: boolean;
  resendEnabled: boolean;
  singleP95Override: number | null;
  multiP95Override: number | null;
  recipientUserIds: number[] | null;
}> {
  const [disabled, resendEnabled, single, multi, recipients] = await Promise.all([
    storage.getNotificationSetting("vector_latency_alerts_disabled"),
    storage.getNotificationSetting("resend_enabled"),
    storage.getNotificationSetting("vector_latency_single_p95_override"),
    storage.getNotificationSetting("vector_latency_multi_p95_override"),
    storage.getNotificationSetting("vector_latency_recipient_user_ids"),
  ]);
  return {
    alertsEnabled: disabled !== "true",
    resendEnabled: resendEnabled === "true",
    singleP95Override: parsePositiveNumber(single),
    multiP95Override: parsePositiveNumber(multi),
    recipientUserIds: parseRecipientUserIds(recipients),
  };
}

export async function evaluateVectorLatencyAlert(
  options: { historyPath?: string } = {},
): Promise<VectorLatencyAlertResult> {
  const config = await resolveVectorLatencyConfig();
  if (!config.alertsEnabled) return { status: "disabled" };

  // Honor the same global gate as processNotificationEvent: when Resend
  // delivery is turned off in admin settings, skip rather than queue
  // failed-send rows.
  if (!config.resendEnabled) return { status: "disabled" };

  const path = options.historyPath ?? VECTOR_BENCH_HISTORY_PATH;
  const history = await loadHistory(path);
  if (!history) return { status: "no-history" };

  const latest = pickLatestRun(history);
  if (!latest) return { status: "no-history" };

  const resolvedThresholds = await resolveVectorLatencyThresholds(history, config);
  const breaches = findBreaches(latest, resolvedThresholds);
  if (breaches.length === 0) return { status: "no-breach" };

  const runId = latest.timestamp;
  if (await alreadyAlerted(runId)) {
    return { status: "already-alerted", runId, breaches };
  }

  const allUsers = await storage.getAllUsers();
  let admins = allUsers.filter((u) => u.email && isAdminRole(u.role));
  if (config.recipientUserIds) {
    const allowed = new Set(config.recipientUserIds);
    admins = admins.filter((u) => allowed.has(u.id));
  }
  if (admins.length === 0) return { status: "no-admins", runId, breaches };

  const chartUrl = `${getAppUrl()}${VECTOR_LATENCY_CHART_PATH}`;
  const subject = `${getEventLabel("VECTOR_LATENCY_BREACH")} — ${APP_BRAND_NAME}`;
  const body = buildEmailBody(latest, breaches, chartUrl);

  const event: NotificationEvent = {
    type: "VECTOR_LATENCY_BREACH",
    message: `Vector search latency breached the configured thresholds in the latest benchmark run.`,
    link: chartUrl,
    timestamp: new Date(),
    metadata: {
      runId,
      thresholds: history.thresholds,
      resolvedThresholds,
      breaches: breaches.map((b) => ({
        size: b.size,
        scope: b.scope,
        metric: b.metric,
        valueMs: b.valueMs,
        thresholdMs: b.thresholdMs,
        p50Ms: b.p50Ms,
        p95Ms: b.p95Ms,
        ...(b.thresholdP95Ms !== undefined ? { thresholdP95Ms: b.thresholdP95Ms } : {}),
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
        title: getEventLabel("VECTOR_LATENCY_BREACH"),
        body,
        actionUrl: chartUrl,
        actionLabel: "View Latency Chart",
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
      logger.error(`vector-latency-alert: email to ${admin.email} failed: ${msg}`, "notifications");
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
    `vector-latency-alert: runId=${runId} breaches=${breaches.length} admins=${admins.length} sent=${sent} failed=${failed}`,
    "notifications",
  );
  return { status: "ok", runId, breaches, recipients: admins.length, sent, failed };
}
