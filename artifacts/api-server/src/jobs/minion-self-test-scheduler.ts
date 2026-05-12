/**
 * Minion self-test scheduler — Task #1397.
 *
 * Periodic background loop that runs every entry in `MINION_SELF_TESTS`
 * on an admin-tunable cadence (default 6h). Mirrors the Costantino
 * scheduler shape: self-rescheduling setTimeout chain, runtime-editable
 * cadence via an `admin_resources` parameter row, concurrency guard,
 * and best-effort recording into `scheduler_runs`.
 *
 * On a `fail` outcome the scheduler opens (or refreshes) a row in
 * `costantino_findings` so admins see the regression on the same
 * findings surface they already use for integration-health drift. On a
 * subsequent `pass` the open finding for that minion is auto-resolved
 * with a short note. `skipped` outcomes do not open findings.
 *
 * Concurrency guard: a tick that arrives while the previous cycle is
 * still running is dropped (logged + skipped) — the next tick fires
 * after the in-flight one finishes.
 */
import { db } from "../db";
import { costantinoFindings } from "@workspace/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import { storage } from "../storage";
import { logger } from "../logger";
import { recordSchedulerCycle, truncateNotes } from "./scheduler-run-tracker";
import {
  MINION_SELF_TESTS,
  runMinionSelfTest,
  type MinionSelfTestResult,
} from "../slides/minions/self-tests";
import {
  DEFAULT_MINION_SELF_TEST_CYCLE_INTERVAL_MS,
  DEFAULT_MINION_SELF_TEST_MAX_CYCLE_INTERVAL_MS,
  DEFAULT_MINION_SELF_TEST_MIN_CYCLE_INTERVAL_MS,
  MINION_FINDING_TARGET_KIND,
  MINION_SELF_TEST_CADENCE_PARAM_SLUG,
  MINION_SELF_TEST_SCHEDULER_KEY,
} from "./minion-self-test-constants";

let isRunning = false;
let nextTickHandle: NodeJS.Timeout | null = null;
let stopped = false;

const FINDING_KIND = "minion_self_test_failed";

/**
 * Read the runtime-editable cadence row, clamp to [min, max], and fall
 * back to the compile-time default on any error or invalid value.
 */
async function resolveCadenceMs(): Promise<number> {
  try {
    const row = await storage.getAdminResourceBySlug?.("parameter", MINION_SELF_TEST_CADENCE_PARAM_SLUG);
    const cfg = row?.config as Record<string, unknown> | undefined;
    const raw = cfg?.value_ms;
    const ms = typeof raw === "number" && Number.isFinite(raw) && raw > 0
      ? raw
      : DEFAULT_MINION_SELF_TEST_CYCLE_INTERVAL_MS;
    const minRaw = cfg?.min_ms;
    const maxRaw = cfg?.max_ms;
    const min = typeof minRaw === "number" && minRaw > 0 ? minRaw : DEFAULT_MINION_SELF_TEST_MIN_CYCLE_INTERVAL_MS;
    const max = typeof maxRaw === "number" && maxRaw > 0 ? maxRaw : DEFAULT_MINION_SELF_TEST_MAX_CYCLE_INTERVAL_MS;
    return Math.max(min, Math.min(max, ms));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`[minion-self-test-scheduler] Failed to resolve cadence: ${msg}. Using default.`);
    return DEFAULT_MINION_SELF_TEST_CYCLE_INTERVAL_MS;
  }
}

interface CycleSummary {
  considered: number;
  passed: number;
  failed: number;
  skipped: number;
  findingsOpened: number;
  findingsResolved: number;
  results: MinionSelfTestResult[];
}

/**
 * Look up the open finding for `minionId`, if any.
 */
async function findOpenFindingForMinion(minionId: string) {
  const rows = await db
    .select()
    .from(costantinoFindings)
    .where(
      and(
        eq(costantinoFindings.targetKind, MINION_FINDING_TARGET_KIND),
        eq(costantinoFindings.targetId, minionId),
        isNull(costantinoFindings.resolvedAt),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Open a finding when a self-test fails. If an open finding already
 * exists for this minion we refresh its evidence (most recent failure)
 * and bump `detected_at` so the roster shows the latest occurrence —
 * but do NOT open a duplicate row.
 *
 * Returns true if a brand-new row was inserted.
 */
async function openOrRefreshFailureFinding(
  result: MinionSelfTestResult,
): Promise<boolean> {
  const existing = await findOpenFindingForMinion(result.minionId);
  const evidence: Record<string, unknown> = {
    durationMs: result.durationMs,
    message: result.message,
    detectedBy: "minion-self-test-scheduler",
  };
  if (existing) {
    await db
      .update(costantinoFindings)
      .set({
        description: `Scheduled minion self-test failed: ${result.message}`,
        evidence: { ...(existing.evidence ?? {}), latest: evidence },
        detectedAt: sql`now()`,
      })
      .where(eq(costantinoFindings.findingId, existing.findingId));
    return false;
  }
  await db.insert(costantinoFindings).values({
    kind: FINDING_KIND,
    severity: "error",
    targetKind: MINION_FINDING_TARGET_KIND,
    targetId: result.minionId,
    description: `Scheduled minion self-test failed: ${result.message}`,
    evidence,
  });
  return true;
}

/**
 * Auto-resolve the open finding for `minionId` (if any) when its
 * self-test passes again.
 *
 * Returns true if a row was actually resolved.
 */
async function resolveOpenFindingForMinion(minionId: string): Promise<boolean> {
  const existing = await findOpenFindingForMinion(minionId);
  if (!existing) return false;
  const note = `auto-resolved: scheduled self-test passed at ${new Date().toISOString()}`;
  await db
    .update(costantinoFindings)
    .set({
      resolvedAt: sql`now()`,
      evidence: { ...(existing.evidence ?? {}), resolution: note },
    })
    .where(eq(costantinoFindings.findingId, existing.findingId));
  return true;
}

/**
 * Run every registered minion self-test once. Always returns a summary
 * — never throws — so the scheduler can record a cycle row even on
 * partial failure.
 */
export async function runMinionSelfTestsCycle(): Promise<CycleSummary> {
  const summary: CycleSummary = {
    considered: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    findingsOpened: 0,
    findingsResolved: 0,
    results: [],
  };

  const ids = Object.keys(MINION_SELF_TESTS).sort();
  for (const id of ids) {
    summary.considered += 1;
    let result: MinionSelfTestResult;
    try {
      result = await runMinionSelfTest(id);
    } catch (err: unknown) {
      // runMinionSelfTest catches its own errors and returns `{ status: "fail" }`,
      // but be defensive: treat an unexpected throw as a hard fail too.
      const msg = err instanceof Error ? err.message : String(err);
      result = { minionId: id, status: "fail", durationMs: 0, message: `runner threw: ${msg}` };
    }
    summary.results.push(result);

    if (result.status === "pass") {
      summary.passed += 1;
      try {
        const resolved = await resolveOpenFindingForMinion(id);
        if (resolved) summary.findingsResolved += 1;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn(`[minion-self-test-scheduler] Failed to resolve finding for "${id}": ${msg}`);
      }
    } else if (result.status === "skipped") {
      summary.skipped += 1;
      // Skipped tests are an honest "no signal" — don't open or resolve.
    } else {
      summary.failed += 1;
      try {
        const opened = await openOrRefreshFailureFinding(result);
        if (opened) summary.findingsOpened += 1;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn(`[minion-self-test-scheduler] Failed to open finding for "${id}": ${msg}`);
      }
    }
  }

  return summary;
}

function summaryNotes(summary: CycleSummary): string {
  const failedIds = summary.results.filter((r) => r.status === "fail").map((r) => r.minionId);
  const skippedIds = summary.results.filter((r) => r.status === "skipped").map((r) => r.minionId);
  const parts = [
    `${summary.considered} considered`,
    `${summary.passed} pass / ${summary.failed} fail / ${summary.skipped} skipped`,
    `findings opened ${summary.findingsOpened}, resolved ${summary.findingsResolved}`,
  ];
  if (failedIds.length > 0) parts.push(`failed: ${failedIds.join(",")}`);
  if (skippedIds.length > 0) parts.push(`skipped: ${skippedIds.join(",")}`);
  return parts.join(" | ");
}

async function tick(): Promise<void> {
  if (stopped) return;
  if (isRunning) {
    logger.info("[minion-self-test-scheduler] Skipping tick — previous cycle still running.");
    scheduleNext();
    return;
  }
  isRunning = true;
  const t0 = Date.now();
  try {
    logger.info("[minion-self-test-scheduler] Cycle starting.");
    const summary = await runMinionSelfTestsCycle();
    const durationMs = Date.now() - t0;
    const notes = summaryNotes(summary);
    const status: "ok" | "warn" | "error" = summary.failed > 0 ? "warn" : "ok";
    await recordSchedulerCycle({
      key: MINION_SELF_TEST_SCHEDULER_KEY,
      considered: summary.considered,
      succeeded: summary.passed,
      failed: summary.failed,
      status,
      notes: truncateNotes(notes),
      durationMs,
    });
    logger.info(`[minion-self-test-scheduler] Cycle complete in ${durationMs}ms — ${notes}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[minion-self-test-scheduler] Cycle threw: ${msg}`);
    await recordSchedulerCycle({
      key: MINION_SELF_TEST_SCHEDULER_KEY,
      considered: 0,
      succeeded: 0,
      failed: 0,
      status: "error",
      notes: truncateNotes(`cycle threw: ${msg}`),
      durationMs: Date.now() - t0,
    });
  } finally {
    isRunning = false;
    scheduleNext();
  }
}

function scheduleNext(): void {
  if (stopped) return;
  if (nextTickHandle) {
    clearTimeout(nextTickHandle);
    nextTickHandle = null;
  }
  resolveCadenceMs()
    .then((cadence) => {
      if (stopped) return;
      logger.info(`[minion-self-test-scheduler] Next cycle in ${cadence}ms.`);
      nextTickHandle = setTimeout(() => {
        void tick();
      }, cadence);
      // Don't keep the event loop alive purely for this scheduler.
      nextTickHandle.unref?.();
    })
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[minion-self-test-scheduler] scheduleNext failed: ${msg}`);
    });
}

/**
 * Boot the minion self-test scheduler. Defers the first cycle by one
 * cadence so server startup isn't blocked.
 */
export function startMinionSelfTestScheduler(): void {
  stopped = false;
  logger.info("[minion-self-test-scheduler] Starting minion self-test scheduler.");
  scheduleNext();
}

/** Test-only / shutdown helper. */
export function stopMinionSelfTestScheduler(): void {
  stopped = true;
  if (nextTickHandle) {
    clearTimeout(nextTickHandle);
    nextTickHandle = null;
  }
}
