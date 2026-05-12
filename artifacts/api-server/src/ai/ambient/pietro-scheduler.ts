/**
 * Pietro scheduler — dispatches data minions on a 60-minute cadence.
 *
 * Each tick reads admin_resources for source/mcp kinds, checks staleness
 * against per-kind TTLs, respects daily_request_budget, and dispatches
 * the registered minion for each stale source.
 *
 * Staleness is determined by:
 *   1. `config.pietroTtlDays` — per-row override (e.g. 90 days for quarterly
 *      national benchmark feeds that don't need hourly refreshes).
 *   2. `PROBE_PROFILES[kind].ttlSeconds` — per-kind default (300 s for source).
 * After a successful minion run, Pietro calls `storage.recordProbeResult()` to
 * update `lastCheckedAt` on the admin_resources row so the TTL actually gates
 * the next dispatch.
 *
 * Pattern mirrors ambient/scheduler.ts exactly.
 */
import { db } from "../../db";
import { adminResources, PROBE_PROFILES } from "@workspace/db";
import { eq, inArray, or } from "drizzle-orm";
import { log } from "../../logger";
import { storage } from "../../storage";
import { recordSchedulerCycle, truncateNotes } from "../../jobs/scheduler-run-tracker";
import type { MinionResult } from "./minions/index";
import type { ResourceKind } from "@workspace/db";

// ---------------------------------------------------------------------------
// Minion registry — maps admin_resource slug → minion function
// ---------------------------------------------------------------------------

export type MinionFn = () => Promise<MinionResult>;

export const MINION_REGISTRY: Record<string, MinionFn> = {
  "fred-extended":            async () => { const { runMinionFredExtended }            = await import("./minions/fred-extension");            return runMinionFredExtended();            },
  "fmp-reit":                 async () => { const { runMinionFmpReit }                 = await import("./minions/fmp-reit");                 return runMinionFmpReit();                 },
  "daloopa-reit":             async () => { const { runMinionDaloopaReit }             = await import("./minions/daloopa-reit");             return runMinionDaloopaReit();             },
  "booking-rates":            async () => { const { runMinionBookingRates }            = await import("./minions/booking-rates");            return runMinionBookingRates();            },
  "expedia-rates":            async () => { const { runMinionExpediaRates }            = await import("./minions/expedia-rates");            return runMinionExpediaRates();            },
  "vendor-passthrough-costs": async () => { const { runMinionVendorPassthroughCosts } = await import("./minions/vendor-passthrough-costs"); return runMinionVendorPassthroughCosts(); },
  "mgmt-co-markup-factors":   async () => { const { runMinionMgmtCoMarkupFactors }    = await import("./minions/mgmt-co-markup-factors");   return runMinionMgmtCoMarkupFactors();    },
};

// ---------------------------------------------------------------------------
// Named constants
// ---------------------------------------------------------------------------

/** Tick cadence: 60 minutes between prefetch cycles. */
const PIETRO_REFRESH_INTERVAL_MS = 60 * 60 * 1_000;

/** Max per-source error strings collected into cycle notes. */
const PIETRO_MAX_ERRORS_IN_NOTES = 3;

/** Initial delay after boot before first tick. */
const PIETRO_STARTUP_DELAY_MS = 30_000;

/** Source/MCP kinds Pietro manages. */
const PIETRO_MANAGED_KINDS = ["source", "mcp"] as const;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let schedulerInterval: ReturnType<typeof setInterval> | null = null;
let startupTimeout: ReturnType<typeof setTimeout> | null = null;
let isRunning = false;
// Monotonic generation counter: every startPietroScheduler() call increments
// this. Callbacks capture their generation at dispatch time and bail if the
// current generation differs, preventing stop→start overlaps from allowing
// stale callbacks to install duplicate intervals.
let schedulerGeneration = 0;

// ---------------------------------------------------------------------------
// Staleness check
// ---------------------------------------------------------------------------

/**
 * Returns true if the admin_resources row is due for a minion dispatch.
 *
 * Staleness priority:
 *  1. `config.pietroTtlDays` — per-row override (e.g. 90 days for quarterly
 *     national benchmark feeds). Expressed in days; converted to ms.
 *  2. `PROBE_PROFILES[kind].ttlSeconds` — per-kind default (300 s for source).
 */
function isStale(row: { lastCheckedAt: Date | null; kind: string; config: unknown }): boolean {
  if (!row.lastCheckedAt) return true;

  const cfg = row.config && typeof row.config === "object" ? (row.config as Record<string, unknown>) : {};
  const pietroTtlDays = cfg.pietroTtlDays;
  let ttlMs: number;

  if (typeof pietroTtlDays === "number" && pietroTtlDays > 0) {
    ttlMs = pietroTtlDays * 24 * 60 * 60 * 1_000;
  } else {
    const kind = row.kind as keyof typeof PROBE_PROFILES;
    const profile = PROBE_PROFILES[kind];
    if (!profile) return true;
    ttlMs = profile.ttlSeconds * 1_000;
  }

  const ageMs = Date.now() - row.lastCheckedAt.getTime();
  return ageMs > ttlMs;
}

function isBudgetAvailable(row: { dailyRequestBudget: number | null }): boolean {
  // null = unlimited; 0 = disabled (e.g. context7 coding-session-only source)
  return row.dailyRequestBudget === null || row.dailyRequestBudget > 0;
}

// ---------------------------------------------------------------------------
// Main tick
// ---------------------------------------------------------------------------

async function runPietroTick(): Promise<void> {
  if (isRunning) {
    log("Tick skipped — previous cycle still running", "pietro-scheduler", "warn");
    return;
  }
  isRunning = true;
  const cycleStart = Date.now();
  let succeeded = 0;
  let failed = 0;
  const allErrors: string[] = [];
  let cycleThrew = false;
  let cycleErrorMessage: string | null = null;

  try {
    const rows = await db
      .select()
      .from(adminResources)
      .where(or(...PIETRO_MANAGED_KINDS.map(k => inArray(adminResources.kind, [k]))));

    const candidates = rows.filter(r => isStale(r) && isBudgetAvailable(r));

    log(
      `Tick: ${rows.length} source/mcp rows, ${candidates.length} stale and eligible`,
      "pietro-scheduler",
    );

    for (const row of candidates) {
      const minion = MINION_REGISTRY[row.slug];
      if (!minion) {
        log(`No minion for slug '${row.slug}' — skipping`, "pietro-scheduler");
        continue;
      }

      try {
        const result = await minion();
        log(
          `${row.slug}: ${result.rowsUpserted} upserted, ${result.rowsFailed} failed (${result.durationMs}ms)`,
          "pietro-scheduler",
          result.rowsFailed > 0 ? "warn" : "info",
        );
        if (result.errors.length > 0) allErrors.push(...result.errors.slice(0, PIETRO_MAX_ERRORS_IN_NOTES));

        // Update lastCheckedAt on the admin_resources row so the per-kind (or
        // per-row pietroTtlDays) TTL gates the next dispatch correctly.
        // A run with partial failures is still recorded as "ok" so the TTL
        // is respected; a complete run failure leaves lastCheckedAt untouched
        // so the row stays stale for the next tick.
        const probeStatus = result.rowsFailed === result.rowsUpserted + result.rowsFailed && result.rowsFailed > 0
          ? "fail"
          : "ok";
        await storage.recordProbeResult(
          row.id,
          row.kind as ResourceKind,
          { status: probeStatus, latencyMs: result.durationMs },
          null,
        ).catch((recordErr: unknown) => {
          log(
            `${row.slug}: failed to record probe result — ${recordErr instanceof Error ? recordErr.message : String(recordErr)}`,
            "pietro-scheduler",
            "warn",
          );
        });

        succeeded++;
      } catch (err: unknown) {
        const msg = `${row.slug}: ${err instanceof Error ? err.message : String(err)}`;
        allErrors.push(msg);
        log(msg, "pietro-scheduler", "error");

        // Record a "fail" probe result so lastCheckedAt is set (to now)
        // even on error — this prevents a broken minion from hammering on
        // every tick. The status=fail will surface as red in the admin UI.
        await db
          .select({ id: adminResources.id, kind: adminResources.kind })
          .from(adminResources)
          .where(eq(adminResources.slug, row.slug))
          .limit(1)
          .then(async ([r]) => {
            if (!r) return;
            await storage.recordProbeResult(
              r.id,
              r.kind as ResourceKind,
              { status: "fail", latencyMs: 0, errorMessage: msg },
              null,
            );
          })
          .catch(() => { /* best-effort — don't mask the original error */ });

        failed++;
      }
    }
  } catch (err: unknown) {
    cycleThrew = true;
    cycleErrorMessage = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    isRunning = false;
    const durationMs = Date.now() - cycleStart;
    const considered = succeeded + failed;
    const status: "ok" | "warn" | "error" = cycleThrew
      ? "error"
      : failed > 0 || allErrors.length > 0
        ? "warn"
        : "ok";
    const notes = cycleThrew
      ? truncateNotes(cycleErrorMessage)
      : allErrors.length > 0
        ? truncateNotes(allErrors.slice(0, PIETRO_MAX_ERRORS_IN_NOTES).join("; "))
        : `${succeeded} source(s) refreshed`;

    void recordSchedulerCycle({
      key: "pietro-data-refresh",
      considered,
      succeeded,
      failed,
      status,
      notes,
      durationMs,
    });
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export { runPietroTick };

export function startPietroScheduler(): void {
  log(
    `Starting — initial tick in ${PIETRO_STARTUP_DELAY_MS / 1_000}s, then every ${PIETRO_REFRESH_INTERVAL_MS / (60 * 60 * 1_000)}h`,
    "pietro-scheduler",
  );

  const gen = ++schedulerGeneration;
  startupTimeout = setTimeout(async () => {
    startupTimeout = null;
    if (schedulerGeneration !== gen) return; // superseded by stop→start
    try {
      await runPietroTick();
    } catch (err: unknown) {
      log(
        `Initial tick failed: ${err instanceof Error ? err.message : String(err)}`,
        "pietro-scheduler",
        "error",
      );
    }

    if (schedulerGeneration !== gen) return; // superseded while tick ran
    schedulerInterval = setInterval(async () => {
      try {
        await runPietroTick();
      } catch (err: unknown) {
        log(
          `Periodic tick failed: ${err instanceof Error ? err.message : String(err)}`,
          "pietro-scheduler",
          "error",
        );
      }
    }, PIETRO_REFRESH_INTERVAL_MS);
  }, PIETRO_STARTUP_DELAY_MS);
}

export function stopPietroScheduler(): void {
  schedulerGeneration++; // invalidate any in-flight startup callbacks
  if (startupTimeout) { clearTimeout(startupTimeout); startupTimeout = null; }
  if (schedulerInterval) { clearInterval(schedulerInterval); schedulerInterval = null; }
  log("Stopped", "pietro-scheduler");
}
