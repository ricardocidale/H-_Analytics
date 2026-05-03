/**
 * Task #542 — Helper for background schedulers to record their last
 * cycle summary into `scheduler_runs`.
 *
 * Each registered scheduler calls `recordSchedulerCycle` at the end of
 * every cycle (success OR failure). The Admin → Observability page reads
 * the table and renders a stale-warning when a row's `lastRunAt` is
 * older than `cycleIntervalMs * STALE_MULTIPLIER`.
 *
 * Persistence is best-effort and never throws — a failure to record the
 * cycle summary must never break the scheduler itself.
 */
import { storage } from "../storage";
import { logger } from "../logger";

/**
 * How many cycle intervals can elapse before a scheduler is considered
 * stale. The Admin → Observability page uses this multiplier to render
 * the stale warning, and the scheduler-stale alert evaluator uses the
 * same value so the email and the UI agree on what "stale" means.
 *
 * 2× cycle interval = "you missed at least one full cycle".
 */
export const SCHEDULER_STALE_MULTIPLIER = 2;

/**
 * Single source of truth for the registered schedulers. The Observability
 * page renders rows in this order so the UI stays stable even before any
 * cycle has fired (it shows "never run" rows for un-recorded schedulers).
 */
export const SCHEDULER_REGISTRY = [
  {
    key: "ambient-benchmarks",
    label: "Ambient Benchmark Refresh",
    cycleIntervalMs: 6 * 60 * 60 * 1000, // 6h
    description:
      "Refreshes hospitality benchmark snapshots, runs source health checks, refreshes the LLM registry, and runs the Analyst watchdog.",
  },
  {
    key: "research-workflows",
    label: "Scheduled Research Workflows",
    cycleIntervalMs: 15 * 60 * 1000, // 15min
    description:
      "Polls scheduled research workflow definitions and submits batched/sync research runs when due.",
  },
  {
    key: "resource-health-probes",
    label: "Resource Health Probes",
    cycleIntervalMs: 60 * 1000, // 60s
    description:
      "Probes admin_resources whose last health check is past the per-kind TTL.",
  },
  {
    key: "constants-refresh",
    label: "Constants Refresh",
    cycleIntervalMs: 60 * 60 * 1000, // 1h
    description:
      "Per-Specialist scheduled refresh of authority-sourced constants (tax, macro, depreciation, reporting).",
  },
  {
    key: "specialist-quality",
    label: "Specialist Quality Recompute",
    cycleIntervalMs: 24 * 60 * 60 * 1000, // 24h
    description:
      "Nightly recompute of every catalog Specialist's research quality score.",
  },
  {
    key: "specialist-photos-batch",
    label: "Photos & Renders Batch",
    cycleIntervalMs: 30 * 60 * 1000, // 30min poll; admin sets the actual cadence
    description:
      "Polls the Photos & Renders specialist (Fernanda) config and dispatches scheduled render batches across the configured property list.",
  },
  {
    key: "rebecca-fixture-replay",
    label: "Rebecca Fixture Replay",
    cycleIntervalMs: 24 * 60 * 60 * 1000, // 24h
    description:
      "Replays every saved Rebecca preview fixture through the server-side runner once per day, persists the per-fixture last-run badge, and emails admins when an answer drifts from its saved baseline.",
  },
  {
    key: "legacy-storage-url-audit",
    label: "Legacy Storage URL Audit",
    cycleIntervalMs: 24 * 60 * 60 * 1000, // 24h
    description:
      "Nightly walk of every text/varchar/jsonb column in the public schema for legacy Replit Object Storage URL shapes (Task #534). Alerts admins when new bad rows reappear after the R2 cutover.",
  },
  {
    key: "hero-photo-url-audit",
    label: "Hero Photo URL Audit",
    cycleIntervalMs: 24 * 60 * 60 * 1000, // 24h
    description:
      "Nightly check that every property's cached hero URL (`properties.image_url`) matches the album hero (with the same first-photo-by-id fallback the resync script uses) and that the resolved URL still serves. Alerts on-call admins with the affected property IDs and the current/expected URLs (Task #937).",
  },
] as const;

export type SchedulerKey = (typeof SCHEDULER_REGISTRY)[number]["key"];

const SCHEDULER_BY_KEY: Map<string, (typeof SCHEDULER_REGISTRY)[number]> =
  new Map(SCHEDULER_REGISTRY.map((s) => [s.key, s]));

export function getSchedulerDefinition(key: SchedulerKey) {
  return SCHEDULER_BY_KEY.get(key)!;
}

export interface RecordSchedulerCycleInput {
  key: SchedulerKey;
  considered: number;
  succeeded: number;
  failed: number;
  status: "ok" | "warn" | "error";
  notes?: string | null;
  durationMs?: number | null;
  lastRunAt?: Date;
}

/**
 * Best-effort write — never throws, never blocks the scheduler.
 */
export async function recordSchedulerCycle(input: RecordSchedulerCycleInput): Promise<void> {
  const def = SCHEDULER_BY_KEY.get(input.key);
  if (!def) {
    logger.warn(`[scheduler-run-tracker] Unknown scheduler key: ${input.key}`);
    return;
  }
  try {
    await storage.recordSchedulerRun({
      schedulerKey: def.key,
      schedulerLabel: def.label,
      cycleIntervalMs: def.cycleIntervalMs,
      considered: input.considered,
      succeeded: input.succeeded,
      failed: input.failed,
      status: input.status,
      notes: input.notes ?? null,
      durationMs: input.durationMs ?? null,
      lastRunAt: input.lastRunAt,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`[scheduler-run-tracker] Failed to record cycle for ${input.key}: ${msg}`);
  }
}

/**
 * Task #556 — Per-scheduler dispatch map for the "Run now" admin button.
 *
 * Each entry returns a thunk that runs one cycle of the corresponding
 * scheduler. We use dynamic `import()` so this module can stay a leaf in
 * the import graph (every scheduler already imports
 * `recordSchedulerCycle` from here — a static back-edge would create a
 * circular dependency).
 *
 * The cycle functions themselves already guard against overlapping ticks
 * (they early-return when an in-flight cycle is running), so concurrent
 * "Run now" clicks are debounced naturally.
 */
export const SCHEDULER_DISPATCH: Record<SchedulerKey, () => Promise<unknown>> = {
  "ambient-benchmarks": async () => {
    const mod = await import("../ai/ambient/scheduler");
    return mod.runRefreshCycle();
  },
  "research-workflows": async () => {
    const mod = await import("../ai/ambient/research-scheduler");
    return mod.runScheduledCheckCycle();
  },
  "resource-health-probes": async () => {
    const mod = await import("./resource-health-checker");
    return mod.tickResourceHealthChecker();
  },
  "constants-refresh": async () => {
    const mod = await import("./specialist-constants-refresh");
    return mod.runConstantsRefreshCycle();
  },
  "specialist-quality": async () => {
    const mod = await import("./specialist-quality-recompute");
    return mod.runSpecialistQualityRecomputeCycle();
  },
  "specialist-photos-batch": async () => {
    const mod = await import("./specialist-photos-batch");
    return mod.runPhotosBatchCycle();
  },
  // Task #559 added the scheduler key; this dispatch entry was missing
  // because Task #556 (dispatch map) and Task #559 (new scheduler) merged
  // independently. Surfaced by tsc as TS2741 — fixed here so the
  // Observability "Run now" button can fire a fixture replay on demand.
  "rebecca-fixture-replay": async () => {
    const mod = await import("./rebecca-fixture-replay");
    return mod.runRebeccaFixtureReplayCycle();
  },
  "legacy-storage-url-audit": async () => {
    const mod = await import("./legacy-storage-url-audit");
    return mod.runLegacyStorageUrlAuditCycle();
  },
  "hero-photo-url-audit": async () => {
    const mod = await import("./hero-photo-url-audit");
    return mod.runHeroPhotoUrlAuditCycle();
  },
};

/**
 * Trim a string for storage in `notes` — single line, capped length.
 */
export function truncateNotes(notes: string | null | undefined, max = 280): string | null {
  if (!notes) return null;
  const flat = notes.replace(/\s+/g, " ").trim();
  if (!flat) return null;
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
