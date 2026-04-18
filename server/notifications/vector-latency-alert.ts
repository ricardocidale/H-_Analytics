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
  p50Ms: number;
  p95Ms: number;
  thresholdP95Ms: number;
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

function findBreaches(run: BenchRun, thresholds: BenchThresholds): BreachedSize[] {
  const breaches: BreachedSize[] = [];
  const single = Number(thresholds.singleP95Ms);
  const multi = Number(thresholds.multiP95Ms);
  for (const r of run.results ?? []) {
    if (Number.isFinite(single) && single > 0 && r.single?.p95Ms > single) {
      breaches.push({
        size: r.size,
        scope: "single",
        p50Ms: r.single.p50Ms,
        p95Ms: r.single.p95Ms,
        thresholdP95Ms: single,
      });
    }
    if (Number.isFinite(multi) && multi > 0 && r.multi?.p95Ms > multi) {
      breaches.push({
        size: r.size,
        scope: "multi",
        p50Ms: r.multi.p50Ms,
        p95Ms: r.multi.p95Ms,
        thresholdP95Ms: multi,
      });
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
        `p50 ${fmt(b.p50Ms)} ms, p95 <strong>${fmt(b.p95Ms)} ms</strong> ` +
        `(threshold ${fmt(b.thresholdP95Ms)} ms)</li>`,
    )
    .join("");
  const meta =
    `Run timestamp: ${run.timestamp}` +
    (run.topK ? `, top-K=${run.topK}` : "") +
    (run.queries ? `, queries/size=${run.queries}` : "");
  return (
    `The most recent vector benchmark run breached the configured p95 latency thresholds.` +
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

export async function evaluateVectorLatencyAlert(
  options: { historyPath?: string } = {},
): Promise<VectorLatencyAlertResult> {
  const disabled = await storage.getNotificationSetting("vector_latency_alerts_disabled");
  if (disabled === "true") return { status: "disabled" };

  // Honor the same global gate as processNotificationEvent: when Resend
  // delivery is turned off in admin settings, skip rather than queue
  // failed-send rows.
  const resendEnabled = await storage.getNotificationSetting("resend_enabled");
  if (resendEnabled !== "true") return { status: "disabled" };

  const path = options.historyPath ?? VECTOR_BENCH_HISTORY_PATH;
  const history = await loadHistory(path);
  if (!history) return { status: "no-history" };

  const latest = pickLatestRun(history);
  if (!latest) return { status: "no-history" };

  const breaches = findBreaches(latest, history.thresholds);
  if (breaches.length === 0) return { status: "no-breach" };

  const runId = latest.timestamp;
  if (await alreadyAlerted(runId)) {
    return { status: "already-alerted", runId, breaches };
  }

  const allUsers = await storage.getAllUsers();
  const admins = allUsers.filter((u) => u.email && isAdminRole(u.role));
  if (admins.length === 0) return { status: "no-admins", runId, breaches };

  const chartUrl = `${getAppUrl()}${VECTOR_LATENCY_CHART_PATH}`;
  const subject = `${getEventLabel("VECTOR_LATENCY_BREACH")} — ${APP_BRAND_NAME}`;
  const body = buildEmailBody(latest, breaches, chartUrl);

  const event: NotificationEvent = {
    type: "VECTOR_LATENCY_BREACH",
    message: `Vector search p95 latency breached the embedded thresholds in the latest benchmark run.`,
    link: chartUrl,
    timestamp: new Date(),
    metadata: {
      runId,
      thresholds: history.thresholds,
      breaches: breaches.map((b) => ({
        size: b.size,
        scope: b.scope,
        p50Ms: b.p50Ms,
        p95Ms: b.p95Ms,
        thresholdP95Ms: b.thresholdP95Ms,
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
