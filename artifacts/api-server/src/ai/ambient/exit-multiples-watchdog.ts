/**
 * exit-multiples-watchdog.ts — scheduled producer of fresh exit-multiple data.
 *
 * Sibling of `capital-raise-watchdog.ts`. The `exit_multiples` table
 * (SaaS / e-commerce / marketplace / fintech / healthtech revenue
 * multiples) was previously seeded from defaults and only refreshed when
 * an admin clicked the manual button. This module mirrors the
 * Capital-Raise pipeline so exit-multiple guidance stays current
 * without admin clicks.
 *
 * Pipeline:
 *   1. The ambient scheduler ticks (every 6h, see `scheduler.ts`).
 *   2. `runExitMultiplesWatchdogCycle` is invoked.
 *   3. We check the cadence guard — if the last successful watchdog run
 *      was less than `EXIT_MULTIPLES_WATCHDOG_CADENCE_HOURS` ago (default
 *      168h = weekly), we skip without doing any work or LLM spend.
 *   4. Otherwise we call `researchExitMultiples` (the same LLM
 *      synthesizer the manual button uses) to gather fresh ranges and
 *      evidence on per-vertical revenue multiples.
 *   5. We enforce the N+1 evidence rule (≥3 independent sources). If the
 *      LLM was unreachable or returned a fallback / under-sourced
 *      result, we open + finalize an "aborted" audit row so the admin
 *      Analyst Tables UI shows the watchdog ran and explicitly chose
 *      not to overwrite the table.
 *   6. On a clean run, we map the proposed ranges into a
 *      `WatchdogExitMultiplesSnapshot` and call
 *      `applyWatchdogExitMultiplesSnapshot`, which atomically upserts
 *      the rows AND writes a "success" audit row tagged with
 *      `userAgent="exit-multiples-watchdog"`. That tag is what the
 *      admin UI uses to render watchdog runs alongside manual refreshes
 *      in the audit log.
 *
 * The manual refresh button (`POST /api/admin/analyst-tables/.../refresh`)
 * remains an admin override and continues to use the same downstream
 * storage layer — both paths land in the same audit log table with the
 * same diff format.
 */
import {
  applyWatchdogExitMultiplesSnapshot,
  researchExitMultiples,
  type AnalystRefreshResult,
  type ApplyWatchdogExitMultiplesResult,
  type WatchdogExitMultipleObservation,
} from "../analyst-table-refresh";
import { storage } from "../../storage";
import { log } from "../../logger";

const TABLE_ID = "exit_multiples" as const;
const WATCHDOG_USER_AGENT = "exit-multiples-watchdog";
/** N+1 evidence rule (N=2 → at least 3 independent sources). */
const MIN_SOURCES = 3;
/** Default cadence between watchdog runs (weekly). */
const DEFAULT_CADENCE_HOURS = 24 * 7;
const LOG_TAG = "exit-multiples-watchdog";

export interface RunExitMultiplesWatchdogOptions {
  /** Skip the cadence guard (used by tests / on-demand admin trigger). */
  force?: boolean;
}

export type RunExitMultiplesWatchdogResult =
  | { ran: false; reason: "cadence_skipped"; nextEligibleAt: Date }
  | {
      ran: true;
      reason: "applied" | "insufficient_evidence" | "no_observations";
      result: ApplyWatchdogExitMultiplesResult;
      sourceCount: number;
      tokensUsed: number;
    };

function cadenceMs(): number {
  const raw = process.env.EXIT_MULTIPLES_WATCHDOG_CADENCE_HOURS;
  const parsed = raw ? Number(raw) : NaN;
  const hours = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CADENCE_HOURS;
  return hours * 60 * 60 * 1000;
}

/**
 * Find the most recent watchdog run (success or aborted) so we can enforce
 * the cadence guard. We treat both "success" and "aborted" as "the watchdog
 * woke up" — `failure` and stale `pending` rows are ignored so a transient
 * outage or a crash mid-run doesn't suppress the next cycle.
 *
 * The query filters by `userAgent` at the storage layer so a high-volume of
 * manual admin refreshes can't push the latest watchdog row out of the
 * result set (would otherwise cause extra LLM-spending watchdog runs).
 */
async function lastWatchdogRunAt(cadenceDurationMs: number): Promise<Date | null> {
  // Look back at least 2× the configured cadence (and minimum 30 days) so
  // the cadence guard stays correct even if an admin sets a very long
  // cadence (e.g., monthly, quarterly) via the env var.
  const lookbackMs = Math.max(30 * 24 * 60 * 60 * 1000, cadenceDurationMs * 2);
  const recents = await storage.getRecentAnalystRefreshAuditLogs({
    tableId: TABLE_ID,
    userAgent: WATCHDOG_USER_AGENT,
    sinceMs: lookbackMs,
    limit: 10,
  });
  for (const row of recents) {
    if (row.status === "failure") continue;
    // A `pending` row that's older than ~10 minutes almost certainly
    // belongs to a crashed run that never got finalized — don't let it
    // block the next cycle. A truly in-flight call finalizes well within
    // this window (the LLM call has a 10s timeout via OpenAI client).
    if (row.status === "pending" && Date.now() - row.startedAt.getTime() > 10 * 60 * 1000) {
      continue;
    }
    return row.startedAt;
  }
  return null;
}

/**
 * Map a `researchExitMultiples` result into a watchdog snapshot.
 * Drops dimensions whose three values are all null (nothing to write).
 */
function buildObservations(research: AnalystRefreshResult): WatchdogExitMultipleObservation[] {
  const obs: WatchdogExitMultipleObservation[] = [];
  for (const r of research.proposedRanges) {
    if (r.valueLow == null && r.valueMid == null && r.valueHigh == null) continue;
    obs.push({
      dimensionKey: r.dimensionKey,
      label: r.label,
      unit: r.unit,
      valueLow: r.valueLow,
      valueMid: r.valueMid,
      valueHigh: r.valueHigh,
    });
  }
  return obs;
}

/**
 * One watchdog cycle. Safe to call from the ambient scheduler on every
 * tick — the cadence guard handles "did we already run this week?".
 */
export async function runExitMultiplesWatchdogCycle(
  opts: RunExitMultiplesWatchdogOptions = {},
): Promise<RunExitMultiplesWatchdogResult> {
  const now = new Date();
  const cadence = cadenceMs();

  // ── Cadence guard ──────────────────────────────────────────────
  if (!opts.force) {
    try {
      const last = await lastWatchdogRunAt(cadence);
      if (last && now.getTime() - last.getTime() < cadence) {
        const nextEligibleAt = new Date(last.getTime() + cadence);
        return { ran: false, reason: "cadence_skipped", nextEligibleAt };
      }
    } catch (err: unknown) {
      // Non-fatal — if the audit-log read fails we still proceed; the
      // watchdog is meant to be best-effort.
      log(
        `Cadence-guard read failed (proceeding): ${err instanceof Error ? err.message : String(err)}`,
        LOG_TAG,
        "warn",
      );
    }
  }

  // ── Synthesize fresh exit-multiple data via the LLM ────────────
  // We feed in the current rows so the LLM keeps dimension keys/labels stable.
  let current: Awaited<ReturnType<typeof storage.getExitMultiples>>;
  try {
    current = await storage.getExitMultiples();
  } catch (err: unknown) {
    log(
      `Could not load current exit multiples (treating as empty): ${err instanceof Error ? err.message : String(err)}`,
      LOG_TAG,
      "warn",
    );
    current = [];
  }

  const research = await researchExitMultiples(current);

  // ── N+1 evidence rule ──────────────────────────────────────────
  // The synthesizer's fallback path returns sourceCount=0 + empty evidence.
  // Either of those is grounds to abort: we'd rather leave the table alone
  // and surface an aborted audit row than overwrite real data with stub
  // ranges.
  const evidenceCount = research.evidence?.length ?? 0;
  const insufficient = research.sourceCount < MIN_SOURCES || evidenceCount < MIN_SOURCES;

  if (insufficient) {
    const result = await applyWatchdogExitMultiplesSnapshot({
      observations: [],
      sourceCount: research.sourceCount,
      recordedAt: now,
      evidence: research.evidence,
      notes: `Aborted: ${research.sourceCount} sourceCount, ${evidenceCount} evidence entries cited; N+1 rule requires both to be ≥${MIN_SOURCES}.`,
    });
    log(
      `Aborted — insufficient evidence (${evidenceCount} sources, need ≥${MIN_SOURCES}); audit row #${result.auditId ?? "?"}`,
      LOG_TAG,
      "warn",
    );
    return {
      ran: true,
      reason: "insufficient_evidence",
      result,
      sourceCount: research.sourceCount,
      tokensUsed: research.tokensUsed,
    };
  }

  // ── Apply the snapshot ─────────────────────────────────────────
  const observations = buildObservations(research);
  if (observations.length === 0) {
    const result = await applyWatchdogExitMultiplesSnapshot({
      observations: [],
      sourceCount: research.sourceCount,
      recordedAt: now,
      evidence: research.evidence,
      notes: "Aborted: LLM returned no usable vertical ranges.",
    });
    log(
      `Aborted — no usable verticals in LLM response; audit row #${result.auditId ?? "?"}`,
      LOG_TAG,
      "warn",
    );
    return {
      ran: true,
      reason: "no_observations",
      result,
      sourceCount: research.sourceCount,
      tokensUsed: research.tokensUsed,
    };
  }

  const result = await applyWatchdogExitMultiplesSnapshot({
    observations,
    sourceCount: research.sourceCount,
    recordedAt: now,
    evidence: research.evidence,
    notes: `Scheduled watchdog refresh (${observations.length} vertical(s), ${evidenceCount} source(s), ${research.tokensUsed} tokens).`,
  });

  log(
    `Applied ${result.appliedDimensions.length} vertical(s) (skipped ${result.skippedDimensions.length}); audit row #${result.auditId ?? "?"}`,
    LOG_TAG,
  );

  return {
    ran: true,
    reason: "applied",
    result,
    sourceCount: research.sourceCount,
    tokensUsed: research.tokensUsed,
  };
}
