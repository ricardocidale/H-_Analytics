/**
 * Scheduled Constants research refreshes.
 *
 * Doctrine: docs/audits/constants-specialist-ownership-gap.md §3.4 + §4
 * Phase 5. Authority sources (IRS publications, central-bank rates, IMF WEO,
 * USALI / AHLA) update on their own rhythms. Without a scheduled job, an
 * admin has to remember to hit "Refresh research" on every row before each
 * underwriting cycle — and they don't.
 *
 * What this job does on every cycle:
 *   1. Build the list of (constantKey × locality) rows worth refreshing.
 *      For universal constants that's just one row. For country / country+
 *      state constants it's the United States baseline plus every locality
 *      that already has a `model_constant_overrides` row for that key —
 *      i.e. localities the operator has already cared about. For country+
 *      state keys this includes per-state subdivision rows: if an admin
 *      has been editing California's taxRate, that (US, California) tuple
 *      goes on the same cadence as the US baseline so the per-state Stale
 *      badge stays meaningful. We don't sweep every supported country/
 *      state (would burn the grounded-search budget on rows nobody asks
 *      about); subdivisions without their own override row keep being
 *      computed on demand from the country baseline.
 *   2. For each row, look up the owning Specialist's `refreshCadenceDays`
 *      (declared in `engine/analyst/registry/specialist-catalog.ts`) and
 *      the most recent `research_runs` row for that locality. If the row
 *      has never been refreshed or the latest run is older than the
 *      cadence, fire the per-row Refresh Research flow (preview only,
 *      via `proposeConstantRegeneration`). Auto-apply is intentionally
 *      OFF — the proposal lands as a `research_runs` row and the admin
 *      reviews/applies via the existing Constants tab UI.
 *   3. Per-row try/catch: a failure on one (key, locality) is logged and
 *      persisted as a `status='failed'` `research_runs` row so the
 *      Constants tab's "History" surface shows it. The cycle keeps
 *      moving across all other rows.
 *
 * What this job intentionally does NOT do:
 *   - Apply proposals automatically. Until we have a Specialist conviction
 *     score we don't have a defensible auto-apply threshold; the admin
 *     remains in the loop.
 *   - Sweep all supported countries. Localities are opt-in via existing
 *     overrides + the US baseline. New countries are picked up by the
 *     scheduler the moment an admin manually refreshes them once.
 *
 * Scheduling: hooked from `server/index.ts` (Phase 3d). The cycle runs
 * hourly and is cheap when nothing is due — the only DB work is one
 * `listModelConstantOverrides` plus one `getResearchRunsForConstant`
 * per (key, locality) tuple.
 */

import { storage } from "../storage";
import { proposeConstantRegeneration } from "../ai/regenerate-constants";
import { logger, log as serverLog } from "../logger";
import { recordSchedulerCycle, truncateNotes } from "./scheduler-run-tracker";
import {
  MODEL_CONSTANTS_REGISTRY,
  REGISTERED_CONSTANT_KEYS,
} from "@shared/model-constants-registry";
import {
  getSpecialistForConstant,
  getRefreshCadenceDaysForConstant,
} from "../../engine/analyst/registry/specialist-catalog";
import type { ModelConstantOverride } from "@shared/schema";
import { db } from "../db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";

const SOURCE = "constants-refresh-scheduler";
const US_BASELINE = "United States";

let isRunning = false;
let schedulerInterval: ReturnType<typeof setInterval> | null = null;
let startupTimeout: ReturnType<typeof setTimeout> | null = null;

interface Locality {
  country: string | null;
  subdivision: string | null;
}

/**
 * activity_logs.userId is NOT NULL, so the scheduler needs a real user
 * to attribute system actions to. We use the first super_admin in the
 * database (resolved once and cached). If none exists yet — fresh
 * install before any admin is seeded — we skip the activity log entry
 * and rely on the failed research_runs row + warning log instead.
 */
let cachedSystemActorId: number | null | undefined;
async function resolveSystemActorId(): Promise<number | null> {
  if (cachedSystemActorId !== undefined) return cachedSystemActorId;
  try {
    const [row] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, "super_admin"))
      .orderBy(users.id)
      .limit(1);
    cachedSystemActorId = row?.id ?? null;
  } catch {
    cachedSystemActorId = null;
  }
  return cachedSystemActorId;
}

export interface RefreshCycleSummary {
  considered: number;
  refreshed: number;
  skipped: number;
  failed: number;
  errors: { key: string; country: string | null; subdivision: string | null; message: string }[];
}

function localityLabel(loc: Locality): string {
  if (!loc.country) return "universal";
  return loc.subdivision ? `${loc.country}/${loc.subdivision}` : loc.country;
}

/**
 * Build the list of localities to refresh for a single constant key.
 * Universal → one row. Country / country+state → US baseline plus every
 * locality that already has an override row (i.e. localities the admin
 * has already opted into). For country+state keys per-state override
 * rows are kept as their own (country, subdivision) tuple so the
 * scheduler refreshes them on the same cadence as the country baseline
 * — that is what keeps the Constants tab Stale badge honest on per-state
 * rows. Subdivisions without an override row are not swept; they
 * continue to be computed on demand from the country baseline.
 */
function localitiesForKey(
  key: string,
  overrides: ModelConstantOverride[],
): Locality[] {
  const entry = MODEL_CONSTANTS_REGISTRY[key]!;
  if (entry.locality === "universal") {
    return [{ country: null, subdivision: null }];
  }
  const seen = new Set<string>();
  const out: Locality[] = [];
  const push = (loc: Locality) => {
    const k = `${loc.country ?? ""}::${loc.subdivision ?? ""}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push(loc);
  };
  push({ country: US_BASELINE, subdivision: null });
  for (const ov of overrides) {
    if (ov.constantKey !== key) continue;
    if (!ov.country) continue;
    // Pure country keys collapse to a single country-level row even if
    // some legacy override row carries a subdivision. Country+state keys
    // keep the subdivision as-is so per-state override rows (e.g. US/
    // California taxRate) get their own scheduled refresh and the
    // Constants tab Stale badge fires on those rows when overdue.
    if (entry.locality === "country") {
      push({ country: ov.country, subdivision: null });
    } else {
      push({ country: ov.country, subdivision: ov.countrySubdivision ?? null });
    }
  }
  return out;
}

/**
 * Decide whether (key, locality) is due for a refresh given its cadence
 * and the most recent *successful* research_run at that locality. Failed
 * attempts are intentionally ignored — otherwise a 503 from a grounded-
 * search call would push the next retry out by a full cadence window
 * and silently mark the row "fresh".
 */
async function isDue(
  key: string,
  loc: Locality,
  cadenceDays: number,
): Promise<{ due: boolean; ageDays: number | null }> {
  const latest = await storage.getLatestSuccessfulRunForConstant(
    key,
    loc.country,
    loc.subdivision,
  );
  if (!latest) return { due: true, ageDays: null };
  const ts = (latest.completedAt ?? latest.startedAt) as Date | null;
  if (!ts) return { due: true, ageDays: null };
  const ageMs = Date.now() - new Date(ts).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return { due: ageDays >= cadenceDays, ageDays };
}

/**
 * Persist a failed-refresh marker as a research_runs row so the Constants
 * tab's per-row History surface shows the failure without us inventing a
 * new audit table. Best-effort — a failure here is logged and dropped.
 */
async function recordFailure(key: string, loc: Locality, err: unknown): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  const owner = getSpecialistForConstant(key);
  try {
    await storage.createResearchRun({
      entityType: "model-constant",
      entityId: 0,
      tier: 1,
      status: "failed",
      completedAt: new Date(),
      error: message.slice(0, 500),
      metadata: {
        specialistId: owner?.id ?? null,
        specialistLetter: owner?.letter ?? null,
        constant: { key, country: loc.country, subdivision: loc.subdivision },
        scheduledRefresh: true,
      },
    });
  } catch (writeErr: unknown) {
    const msg = writeErr instanceof Error ? writeErr.message : String(writeErr);
    logger.warn(
      `Failed to persist failure marker for ${key} (${localityLabel(loc)}): ${msg}`,
      SOURCE,
    );
  }

  // Surface the failure in the admin activity log so it shows up in the
  // operator-facing audit trail (not just the per-row research history).
  // Best-effort: a missing system actor or an insert error here must not
  // interrupt the refresh cycle.
  try {
    const actorId = await resolveSystemActorId();
    if (actorId == null) return;
    await storage.createActivityLog({
      userId: actorId,
      action: "scheduled_constants_refresh_failed",
      entityType: "model-constant",
      entityId: undefined,
      entityName: `${key} (${localityLabel(loc)})`,
      metadata: {
        constantKey: key,
        country: loc.country,
        subdivision: loc.subdivision,
        specialistId: owner?.id ?? null,
        specialistLetter: owner?.letter ?? null,
        error: message.slice(0, 500),
        source: SOURCE,
      },
      ipAddress: "system",
    });
  } catch (logErr: unknown) {
    const msg = logErr instanceof Error ? logErr.message : String(logErr);
    logger.warn(
      `Failed to write activity log for ${key} (${localityLabel(loc)}): ${msg}`,
      SOURCE,
    );
  }
}

/**
 * Run one refresh cycle across every registered Constants key. Safe to
 * call concurrently with itself — second invocation no-ops while the
 * first is still in flight.
 */
export async function runConstantsRefreshCycle(): Promise<RefreshCycleSummary> {
  const summary: RefreshCycleSummary = {
    considered: 0,
    refreshed: 0,
    skipped: 0,
    failed: 0,
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
    const overrides = await storage.listModelConstantOverrides();
    // Per-Specialist admin cadence overrides (P5 follow-up). Loaded once
    // per cycle so the per-(key, locality) loop is a Map lookup, not
    // an N+1 query against `specialist_configs`.
    const cadenceOverrides = await storage.getRefreshCadenceOverrides();

    for (const key of REGISTERED_CONSTANT_KEYS) {
      const owner = getSpecialistForConstant(key);
      const catalogCadence = getRefreshCadenceDaysForConstant(key);
      const cadenceDays = (owner ? cadenceOverrides.get(owner.id) : undefined) ?? catalogCadence;
      if (cadenceDays == null) continue; // Specialist opted out of scheduled refresh.

      const localities = localitiesForKey(key, overrides);
      for (const loc of localities) {
        summary.considered += 1;
        try {
          const { due } = await isDue(key, loc, cadenceDays);
          if (!due) {
            summary.skipped += 1;
            continue;
          }
          await proposeConstantRegeneration({
            key,
            country: loc.country,
            subdivision: loc.subdivision,
            overrides,
          });
          summary.refreshed += 1;
        } catch (err: unknown) {
          summary.failed += 1;
          const message = err instanceof Error ? err.message : String(err);
          summary.errors.push({ key, country: loc.country, subdivision: loc.subdivision, message });
          logger.warn(
            `Refresh failed for ${key} (${localityLabel(loc)}): ${message}`,
            SOURCE,
          );
          await recordFailure(key, loc, err);
        }
      }
    }

    if (summary.refreshed > 0 || summary.failed > 0) {
      serverLog(
        `Cycle complete: ${summary.refreshed} refreshed, ${summary.skipped} fresh, ${summary.failed} failed (of ${summary.considered} considered)`,
        SOURCE,
      );
    }
    return summary;
  } catch (err: unknown) {
    cycleThrew = true;
    cycleErrorMessage = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    isRunning = false;
    // Persist a one-row cycle summary for Admin → Observability.
    // `succeeded` here = refreshed (the work that actually fired); skipped
    // rows count as "still fresh" so they're folded into the considered
    // total but not the success count.
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
              .map((e) => `${e.key}@${e.country ?? "universal"}: ${e.message}`)
              .join("; "),
          )
        : `${summary.refreshed} refreshed, ${summary.skipped} still fresh`;
    void recordSchedulerCycle({
      key: "constants-refresh",
      considered: summary.considered,
      succeeded: summary.refreshed,
      failed: summary.failed,
      status,
      notes,
      durationMs: Date.now() - cycleStart,
    });
  }
}

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly tick — actual refresh gated by per-Specialist cadence
const STARTUP_DELAY_MS = 30 * 1000; // let migrations + seeds settle first

export function startConstantsRefreshScheduler(): void {
  serverLog(
    `Starting — initial check in ${STARTUP_DELAY_MS / 1000}s, then every ${CHECK_INTERVAL_MS / 60000}m`,
    SOURCE,
  );
  startupTimeout = setTimeout(() => {
    startupTimeout = null;
    runConstantsRefreshCycle().catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      serverLog(`Initial cycle failed: ${msg}`, SOURCE, "error");
    });
    schedulerInterval = setInterval(() => {
      runConstantsRefreshCycle().catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        serverLog(`Periodic cycle failed: ${msg}`, SOURCE, "error");
      });
    }, CHECK_INTERVAL_MS);
  }, STARTUP_DELAY_MS);
}

export function stopConstantsRefreshScheduler(): void {
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
