/**
 * Pietro scheduler — dispatches data minions on a 60-minute cadence.
 *
 * Each tick reads admin_resources for source/mcp kinds, checks staleness
 * against per-kind TTLs, respects daily_request_budget, and dispatches
 * the registered minion for each stale source.
 *
 * Pattern mirrors ambient/scheduler.ts exactly.
 */
import { db } from "../../db";
import { adminResources, PROBE_PROFILES } from "@workspace/db";
import { inArray, or } from "drizzle-orm";
import { log } from "../../logger";
import { recordSchedulerCycle, truncateNotes } from "../../jobs/scheduler-run-tracker";
import type { MinionResult } from "./minions/index";

// ---------------------------------------------------------------------------
// Minion registry — maps admin_resource slug → minion function
// ---------------------------------------------------------------------------

export type MinionFn = () => Promise<MinionResult>;

export const MINION_REGISTRY: Record<string, MinionFn> = {
  "fred-extended":  async () => { const { runMinionFredExtended }  = await import("./minions/fred-extension"); return runMinionFredExtended(); },
  "fmp-reit":       async () => { const { runMinionFmpReit }       = await import("./minions/fmp-reit");       return runMinionFmpReit();       },
  "daloopa-reit":   async () => { const { runMinionDaloopaReit }   = await import("./minions/daloopa-reit");   return runMinionDaloopaReit();   },
  "booking-rates":  async () => { const { runMinionBookingRates }  = await import("./minions/booking-rates");  return runMinionBookingRates();  },
  "expedia-rates":  async () => { const { runMinionExpediaRates }  = await import("./minions/expedia-rates");  return runMinionExpediaRates();  },
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

// ---------------------------------------------------------------------------
// Staleness check
// ---------------------------------------------------------------------------

function isStale(row: { lastCheckedAt: Date | null; kind: string }): boolean {
  if (!row.lastCheckedAt) return true; // never checked = stale
  const kind = row.kind as keyof typeof PROBE_PROFILES;
  const profile = PROBE_PROFILES[kind];
  if (!profile) return true;
  const ageMs = Date.now() - row.lastCheckedAt.getTime();
  return ageMs > profile.ttlSeconds * 1_000;
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
        succeeded++;
      } catch (err: unknown) {
        const msg = `${row.slug}: ${err instanceof Error ? err.message : String(err)}`;
        allErrors.push(msg);
        log(msg, "pietro-scheduler", "error");
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
      : failed > 0
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
    `Starting — initial tick in ${PIETRO_STARTUP_DELAY_MS / 1_000}s, then every ${PIETRO_REFRESH_INTERVAL_MS / 3_600_000}h`,
    "pietro-scheduler",
  );

  startupTimeout = setTimeout(async () => {
    startupTimeout = null;
    try {
      await runPietroTick();
    } catch (err: unknown) {
      log(
        `Initial tick failed: ${err instanceof Error ? err.message : String(err)}`,
        "pietro-scheduler",
        "error",
      );
    }

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
  if (startupTimeout) { clearTimeout(startupTimeout); startupTimeout = null; }
  if (schedulerInterval) { clearInterval(schedulerInterval); schedulerInterval = null; }
  log("Stopped", "pietro-scheduler");
}
