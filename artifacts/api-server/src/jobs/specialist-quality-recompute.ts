/**
 * Nightly Specialist quality-score recomputer (Task #512, #554).
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
 *      track every transition. Each transition is tagged as a "drop"
 *      (green→amber, green→red, amber→red), an "up" (any improvement),
 *      or "lateral" (impossible by definition since bands are distinct).
 *   4. **Drops only** trigger admin notifications (Task #554). Upward
 *      transitions are visible on the Specialist quality sparkline but
 *      do not need to wake an admin up. Each dropping Specialist gets
 *      its own notification event with a deep link straight to that
 *      Specialist's page (`/ai-intelligence?section=specialist-…`) so
 *      the admin can land on the new score and gap list immediately.
 *   5. Suppression is **per-Specialist and event-scoped**: we remember
 *      the last drop fingerprint (`prior→new`) for each Specialist so
 *      the same drop detected on consecutive nights does not re-spam
 *      admins. A new drop (different prior or different new band)
 *      overrides the remembered fingerprint and notifies again. As
 *      soon as the Specialist *recovers* (any upward band transition),
 *      the remembered fingerprint is cleared — that drop event has
 *      ended. So if the Specialist later drops to the same band again,
 *      it counts as a fresh event and admins are notified. This is the
 *      "max 1 notification per Specialist per drop event" rule from
 *      Task #554, where an "event" runs from a downward crossing until
 *      the next upward recovery.
 *      The notification setting `specialist_quality_band_change_disabled`
 *      acts as a per-org kill switch (mirrors the
 *      `constants_refresh_digest_disabled` precedent for the Constants-
 *      refresh failure digest); when "true" the email is skipped without
 *      updating the suppression fingerprint, so re-enabling immediately
 *      surfaces the next real drop.
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
import { SPECIALIST_CATALOG } from "@engine/analyst/registry/specialist-catalog";
import { processNotificationEvent } from "../notifications/engine";
import { createEvent } from "../notifications/events";
import { isAdminRole } from "@shared/constants";
import { recordSchedulerCycle, truncateNotes } from "./scheduler-run-tracker";
import { getAppUrl } from "../providers/config";

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
export type BandDirection = "up" | "down";

export function qualityBandForScore(score: number): QualityBand {
  if (score >= GREEN_MIN) return "green";
  if (score >= AMBER_MIN) return "amber";
  return "red";
}

// Higher rank = healthier band. Used to classify a transition as a drop
// (rank decreased) or an upgrade (rank increased).
function bandRank(band: QualityBand): number {
  if (band === "green") return 2;
  if (band === "amber") return 1;
  return 0;
}

export function bandTransitionDirection(prior: QualityBand, next: QualityBand): BandDirection | null {
  const p = bandRank(prior);
  const n = bandRank(next);
  if (n < p) return "down";
  if (n > p) return "up";
  return null;
}

interface BandTransition {
  specialistId: string;
  priorScore: number | null;
  priorBand: QualityBand | null;
  newScore: number;
  newBand: QualityBand;
  /** "down" = drop (notifiable), "up" = improvement (no email). */
  direction: BandDirection;
}

export interface QualityRecomputeSummary {
  considered: number;
  recomputed: number;
  failed: number;
  /** Total band changes (drops + upgrades) — kept for backward compat. */
  bandChanges: number;
  /** Subset of transitions that are downward and therefore notifiable. */
  bandDrops: number;
  transitions: BandTransition[];
  errors: { specialistId: string; message: string }[];
}

let isRunning = false;
let schedulerInterval: ReturnType<typeof setInterval> | null = null;
let startupTimeout: ReturnType<typeof setTimeout> | null = null;
// Per-Specialist suppression: maps specialistId → last notified drop
// fingerprint (`prior→new`). A repeat detection of the same drop on the
// next cycle is suppressed; a fresh drop (different prior or new band)
// updates the entry and re-notifies.
const lastNotifiedDropByspecialist = new Map<string, string>();

function dropFingerprint(t: BandTransition): string {
  return `${t.priorBand ?? "none"}->${t.newBand}`;
}

/**
 * Convert a Specialist catalog id (`mgmt-co.funding`) to the AI
 * Intelligence sidebar section key (`specialist-mgmt-co-funding`) used
 * by `client/src/components/admin/AdminSidebar.tsx::SPECIALIST_SECTION_TO_ID`.
 * The mapping is mechanical: prefix `specialist-` and replace `.` with `-`.
 * Asserted bijective in `tests/client/admin-sidebar-section-map.test.ts`.
 */
export function specialistSectionForId(specialistId: string): string {
  return `specialist-${specialistId.replaceAll(".", "-")}`;
}

/**
 * Build the deep link to a Specialist's page on the AI Intelligence
 * surface. The `?section=…` query param is read by AiIntelligence on
 * mount and routed through `setAiIntelligenceSection`, so admins land
 * directly on the affected Specialist's score + gap list.
 */
export function specialistDeepLink(specialistId: string): string {
  return `${getAppUrl()}/ai-intelligence?section=${specialistSectionForId(specialistId)}`;
}

async function notifyAdminsOfBandDrop(transition: BandTransition): Promise<void> {
  // Per-Specialist email so each drop carries its own deep link. Mirrors
  // the LLM registry refresh notify path: per-admin loop, one event per
  // recipient with `metadata.recipientEmail` set so processNotificationEvent
  // emails them when Resend is enabled.
  try {
    const allUsers = await storage.getAllUsers();
    const admins = allUsers.filter((u) => u.email && isAdminRole(u.role));
    if (admins.length === 0) return;

    const link = specialistDeepLink(transition.specialistId);
    const priorScoreLabel = transition.priorScore === null ? "—" : String(transition.priorScore);
    const priorBandLabel = transition.priorBand ?? "new";
    const message =
      `Specialist "${transition.specialistId}" quality dropped from ` +
      `${priorBandLabel} (${priorScoreLabel}) to ${transition.newBand} (${transition.newScore}). ` +
      `Open the Specialist's page to review the new score and gap list.`;

    for (const admin of admins) {
      const event = createEvent("SPECIALIST_QUALITY_BAND_CHANGED", {
        message,
        link,
        metadata: {
          recipientEmail: admin.email,
          specialistId: transition.specialistId,
          priorBand: transition.priorBand,
          priorScore: transition.priorScore,
          newBand: transition.newBand,
          newScore: transition.newScore,
          link,
        },
      });
      await processNotificationEvent(event);
    }

    serverLog(
      `Notified ${admins.length} admin(s) of band drop ${transition.specialistId}: ` +
        `${priorBandLabel}→${transition.newBand}`,
      SOURCE,
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(
      `Failed to notify admins of band drop for ${transition.specialistId}: ${msg}`,
      SOURCE,
    );
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
    bandDrops: 0,
    transitions: [],
    errors: [],
  };
  if (isRunning) {
    serverLog("Cycle already in progress — skipping", SOURCE, "warn");
    return summary;
  }
  isRunning = true;
  const cycleStart = Date.now();
  let cycleThrew = false;
  let cycleErrorMessage: string | null = null;
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
          const direction = bandTransitionDirection(priorBand, newBand);
          if (direction === null) continue;
          summary.bandChanges += 1;
          if (direction === "down") summary.bandDrops += 1;
          summary.transitions.push({
            specialistId: def.id,
            priorScore,
            priorBand,
            newScore: result.score,
            newBand,
            direction,
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

    const drops = summary.transitions.filter((t) => t.direction === "down");
    if (drops.length > 0) {
      // Honor the admin kill switch — same precedent as
      // `constants_refresh_digest_disabled` for the Constants-refresh
      // failure digest. When disabled we skip both the notification AND
      // the per-Specialist fingerprint update so the next genuine cycle
      // after re-enabling still fires (rather than being suppressed as
      // a duplicate).
      const disabled =
        (await storage.getNotificationSetting(
          "specialist_quality_band_change_disabled",
        )) === "true";
      if (disabled) {
        serverLog(
          `Suppressed band-drop notifications (disabled by admin): ${drops.length} drop(s)`,
          SOURCE,
        );
      } else {
        for (const drop of drops) {
          const fp = dropFingerprint(drop);
          const previous = lastNotifiedDropByspecialist.get(drop.specialistId);
          if (previous === fp) {
            serverLog(
              `Suppressed duplicate drop notification for ${drop.specialistId} (${fp})`,
              SOURCE,
            );
            continue;
          }
          await notifyAdminsOfBandDrop(drop);
          lastNotifiedDropByspecialist.set(drop.specialistId, fp);
        }
      }
    }

    // Recovery clears the per-Specialist suppression fingerprint so the
    // next drop on the same Specialist counts as a fresh event. Without
    // this, a Specialist that drops green→amber, recovers to green, then
    // drops green→amber again on a later cycle would never re-notify
    // admins (the fingerprint would still match). A drop event runs from
    // its downward crossing until the next upward recovery; once that
    // recovery happens the event has ended and any future drop deserves
    // its own notification, even if it lands on the same prior→new pair.
    for (const t of summary.transitions) {
      if (t.direction === "up") {
        lastNotifiedDropByspecialist.delete(t.specialistId);
      }
    }

    serverLog(
      `Cycle complete: ${summary.recomputed} recomputed, ${summary.bandChanges} band change(s) ` +
        `(${summary.bandDrops} drop), ${summary.failed} failed (of ${summary.considered} considered)`,
      SOURCE,
    );
    return summary;
  } catch (err: unknown) {
    cycleThrew = true;
    cycleErrorMessage = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    isRunning = false;
    // Persist a one-row summary so the Admin → Observability page can
    // report "last run, what happened, did it fail" without scraping logs.
    const status: "ok" | "warn" | "error" = cycleThrew
      ? "error"
      : summary.failed > 0
        ? "warn"
        : "ok";
    const notes = cycleThrew
      ? truncateNotes(cycleErrorMessage)
      : summary.failed > 0
        ? truncateNotes(
            summary.errors
              .slice(0, 3)
              .map((e) => `${e.specialistId}: ${e.message}`)
              .join("; "),
          )
        : summary.bandChanges > 0
          ? `${summary.bandChanges} band change(s)`
          : null;
    void recordSchedulerCycle({
      key: "specialist-quality",
      considered: summary.considered,
      succeeded: summary.recomputed,
      failed: summary.failed,
      status,
      notes,
      durationMs: Date.now() - cycleStart,
    });
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
  lastNotifiedDropByspecialist.clear();
  isRunning = false;
}
