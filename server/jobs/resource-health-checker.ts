/**
 * Background scheduler that walks admin_resources and runs the per-kind probe
 * when the last check is past TTL. Idempotent + cheap: read-mostly, only
 * writes one history row per resource per cycle when work is needed.
 *
 * Cadence: ticks every 60s. Each tick selects resources whose last check is
 * past their per-kind TTL (or never checked) and probes them serially.
 */
import { storage } from "../storage";
import { runProbe } from "./probes";
import { logger } from "../logger";
import { PROBE_PROFILES, type ResourceKind } from "@shared/schema";

let timer: NodeJS.Timeout | null = null;
const TICK_MS = 60_000;
let running = false;

export async function tickResourceHealthChecker(): Promise<{ checked: number; ok: number; failed: number; skipped: number }> {
  const due = await storage.listResourcesDueForHealthCheck(PROBE_PROFILES);
  let ok = 0, failed = 0, skipped = 0;
  for (const row of due) {
    const outcome = await runProbe(row);
    await storage.recordProbeResult(row.id, row.kind as ResourceKind, outcome, null /* scheduler, not user */);
    if (outcome.status === "ok") ok++;
    else if (outcome.status === "fail") failed++;
    else skipped++;
  }
  return { checked: due.length, ok, failed, skipped };
}

export function startResourceHealthChecker(): void {
  if (timer) return;
  logger.info("[resource-health-checker] starting (60s tick)");
  const fire = async () => {
    if (running) return; // Drop overlapping ticks.
    running = true;
    try {
      const result = await tickResourceHealthChecker();
      if (result.checked > 0) {
        logger.info(
          `[resource-health-checker] cycle: ${result.ok}/${result.checked} ok (${result.failed} failed, ${result.skipped} skipped)`,
        );
      }
    } catch (err: unknown) {
      logger.error(`[resource-health-checker] tick failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      running = false;
    }
  };
  timer = setInterval(fire, TICK_MS);
  // Kick once on startup so fresh resources get colored quickly.
  setTimeout(fire, 5_000);
}

export function stopResourceHealthChecker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
