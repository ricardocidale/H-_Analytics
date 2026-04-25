/**
 * Nightly Specialist quality-score recomputer (Task #512).
 *
 * Quality snapshots auto-recompute on read when older than 6h, and admins
 * can press "Recompute quality" in the gaps banner. There is no background
 * scheduler, so a Specialist nobody opens for a week shows a stale score
 * in any aggregate (gaps banner avg, transparency table). This job keeps
 * every catalog Specialist's score fresh and produces a stable history
 * series for the per-Specialist quality timeline.
 *
 * What this job does on every cycle:
 *   1. Iterate every Specialist in `engine/analyst/registry/specialist-
 *      catalog.ts` (Gaspar / non-catalog Specialists are intentionally
 *      excluded — only catalog-driven Specialists have probeable resources
 *      and candidate fields).
 *   2. Read the prior latest `specialist_research_quality_snapshots` row
 *      so we can detect band transitions, then call
 *      `recomputeAndRecordSpecialistQuality` (which appends a fresh row).
 *   3. Compare the prior band (green / amber / red, by score thresholds
 *      that match the Resources transparency UI) to the new band and
 *      track every transition.
 *   4. If any Specialist crossed a band, emit a single admin notification
 *      via the same `processNotificationEvent` path that the LLM registry
 *      refresh uses (event type `SPECIALIST_QUALITY_BAND_CHANGED`). The
 *      notification is fingerprinted on the set of (specialistId, prior
 *      band → new band) transitions so the same crossings on consecutive
 *      nights don't re-spam admins until something changes again.
 *      The notification setting `specialist_quality_band_change_disabled`
 *      acts as a per-org kill switch (mirrors the
 *      `constants_refresh_digest_disabled` precedent for the Constants-
 *      refresh failure digest); when "true" the email is skipped without
 *      updating the suppression fingerprint, so re-enabling immediately
 *      surfaces the next real change.
 *
 * Per-Specialist try/catch: a failure on one Specialist is logged and
 * the cycle continues across the rest. We deliberately do not write a
 * `research_runs` failure row here — quality recompute is a pure read-
 * over-existing-data operation, not a research call, so failure surfaces
 * via the structured server log and the band-change notification omits
 * the Specialist from its counts.
 *
 * Scheduling: hooked from `server/index.ts`. Runs once on startup (after
 * a settle delay) and then every 24h. Concurrency-guarded so a manual
 * run via the bulk recompute admin endpoint cannot race with the cycle.
 */

import { storage } from "../storage";
import { recomputeAndRecordSpecialistQuality } from "../ai/research-quality";
import { logger, log as serverLog } from "../logger";
import { SPECIALIST_CATALOG } from "../../engine/analyst/registry/specialist-catalog";
import { processNotificationEvent } from "../notifications/engine";
import { createEvent } from "../notifications/events";
import { isAdminRole } from "@shared/constants";

const SOURCE = "specialist-quality-scheduler";

// Band thresholds match the Resources transparency UI tone classes
// (client/src/components/admin/resources/ResourcesTab.tsx and the
// matching ResourceAssignmentsTab / ResourceDetailDialog scorers):
//   score >= 80 → green
//   score >= 60 → amber
//   score <  60 → red
const GREEN_MIN = 80;
const AMBER_MIN = 60;

export type QualityBand = "green" | "amber" | "red";

export function qualityBandForScore(score: number): QualityBand {
  if (score >= GREEN_MIN) return "green";
  if (score >= AMBER_MIN) return "amber";
  return "red";
}

interface BandTransition {
  specialistId: string;
  priorScore: number | null;
  priorBand: QualityBand | null;
  newScore: number;
  newBand: QualityBand;
}

export interface QualityRecomputeSummary {
  considered: number;
  recomputed: number;
  failed: number;
  bandChanges: number;
  transitions: BandTransition[];
  errors: { specialistId: string; message: string }[];
}

let isRunning = false;
let schedulerInterval: ReturnType<typeof setInterval> | null = null;
let startupTimeout: ReturnType<typeof setTimeout> | null = null;
let lastNotifiedFingerprint: string | null = null;

function transitionFingerprint(transitions: BandTransition[]): string {
  return transitions
    .map((t) => `${t.specialistId}:${t.priorBand ?? "none"}->${t.newBand}`)
    .sort()
    .join("|");
}

async function notifyAdminsOfBandChanges(
  transitions: BandTransition[],
): Promise<void> {
  // Mirror the LLM registry refresh notify path: per-admin loop, one event
  // per recipient with `metadata.recipientEmail` set so processNotificationEvent
  // emails them when Resend is enabled.
  try {
    const allUsers = await storage.getAllUsers();
    const admins = allUsers.filter((u) => u.email && isAdminRole(u.role));
    if (admins.length === 0) return;

    const lines = transitions
      .slice(0, 25)
      .map((t) => {
        const prior = t.priorBand ?? "new";
        const priorScore = t.priorScore ?? "—";
        return `• ${t.specialistId}: ${prior} (${priorScore}) → ${t.newBand} (${t.newScore})`;
      })
      .join("\n");
    const more =
      transitions.length > 25
        ? `\n…and ${transitions.length - 25} more.`
        : "";
    const message =
      `The nightly Specialist quality recompute detected ${transitions.length} ` +
      `band transition${transitions.length > 1 ? "s" : ""}:\n\n${lines}${more}\n\n` +
      `Open Admin → Intelligence → Resources to review the affected Specialists.`;

    for (const admin of admins) {
      const event = createEvent("SPECIALIST_QUALITY_BAND_CHANGED", {
        message,
        metadata: {
          recipientEmail: admin.email,
          transitionCount: transitions.length,
          transitions: transitions.map((t) => ({
            specialistId: t.specialistId,
            priorBand: t.priorBand,
            priorScore: t.priorScore,
            newBand: t.newBand,
            newScore: t.newScore,
          })),
        },
      });
      await processNotificationEvent(event);
    }

    serverLog(
      `Notified ${admins.length} admin(s) of ${transitions.length} band transition(s)`,
      SOURCE,
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`Failed to notify admins of band changes: ${msg}`, SOURCE);
  }
}

/**
 * Run one full recompute cycle across every catalog Specialist. Safe to
 * call concurrently with itself — a second invocation no-ops while the
 * first is still in flight.
 */
export async function runSpecialistQualityRecomputeCycle(): Promise<QualityRecomputeSummary> {
  const summary: QualityRecomputeSummary = {
    considered: 0,
    recomputed: 0,
    failed: 0,
    bandChanges: 0,
    transitions: [],
    errors: [],
  };
  if (isRunning) {
    serverLog("Cycle already in progress — skipping", SOURCE, "warn");
    return summary;
  }
  isRunning = true;
  try {
    for (const def of SPECIALIST_CATALOG) {
      summary.considered += 1;
      try {
        const prior = await storage.getLatestQualitySnapshot(def.id);
        const priorScore = prior ? Number(prior.score) : null;
        const priorBand = priorScore === null ? null : qualityBandForScore(priorScore);

        const result = await recomputeAndRecordSpecialistQuality(def.id);
        summary.recomputed += 1;

        const newBand = qualityBandForScore(result.score);
        // A first-ever snapshot (priorBand=null) is not counted as a
        // transition — it's just the score appearing on the chart for
        // the first time. Only band-to-band crossings are noteworthy.
        if (priorBand !== null && priorBand !== newBand) {
          summary.bandChanges += 1;
          summary.transitions.push({
            specialistId: def.id,
            priorScore,
            priorBand,
            newScore: result.score,
            newBand,
          });
        }
      } catch (err: unknown) {
        summary.failed += 1;
        const message = err instanceof Error ? err.message : String(err);
        summary.errors.push({ specialistId: def.id, message });
        logger.warn(
          `Quality recompute failed for ${def.id}: ${message}`,
          SOURCE,
        );
      }
    }

    if (summary.bandChanges > 0) {
      // Honor the admin kill switch — same precedent as
      // `constants_refresh_digest_disabled` for the Constants-refresh
      // failure digest. When disabled we skip both the notification AND
      // the fingerprint update so the next genuine cycle after re-enabling
      // still fires (rather than being suppressed as a duplicate).
      const disabled =
        (await storage.getNotificationSetting(
          "specialist_quality_band_change_disabled",
        )) === "true";
      if (disabled) {
        serverLog(
          `Suppressed band-change notification (disabled by admin): ${summary.bandChanges} transition(s)`,
          SOURCE,
        );
      } else {
        const fp = transitionFingerprint(summary.transitions);
        if (fp !== lastNotifiedFingerprint) {
          await notifyAdminsOfBandChanges(summary.transitions);
          lastNotifiedFingerprint = fp;
        } else {
          serverLog(
            `Suppressed duplicate band-change notification (same ${summary.bandChanges} transition(s))`,
            SOURCE,
          );
        }
      }
    } else {
      // All bands stable — clear the suppression fingerprint so the next
      // genuine change after a stable stretch will notify, even if it
      // happens to repeat an earlier fingerprint.
      lastNotifiedFingerprint = null;
    }

    serverLog(
      `Cycle complete: ${summary.recomputed} recomputed, ${summary.bandChanges} band change(s), ${summary.failed} failed (of ${summary.considered} considered)`,
      SOURCE,
    );
    return summary;
  } finally {
    isRunning = false;
  }
}

const CYCLE_INTERVAL_MS = 24 * 60 * 60 * 1000; // nightly
const STARTUP_DELAY_MS = 60 * 1000; // let migrations + seeds + other schedulers settle

export function startSpecialistQualityRecomputeScheduler(): void {
  serverLog(
    `Starting — initial recompute in ${STARTUP_DELAY_MS / 1000}s, then every ${CYCLE_INTERVAL_MS / 3_600_000}h`,
    SOURCE,
  );
  startupTimeout = setTimeout(() => {
    startupTimeout = null;
    runSpecialistQualityRecomputeCycle().catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      serverLog(`Initial cycle failed: ${msg}`, SOURCE, "error");
    });
    schedulerInterval = setInterval(() => {
      runSpecialistQualityRecomputeCycle().catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        serverLog(`Periodic cycle failed: ${msg}`, SOURCE, "error");
      });
    }, CYCLE_INTERVAL_MS);
  }, STARTUP_DELAY_MS);
}

export function stopSpecialistQualityRecomputeScheduler(): void {
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

/** Test seam: reset module-level state between tests. */
export function __resetQualityRecomputeStateForTest(): void {
  lastNotifiedFingerprint = null;
  isRunning = false;
}
