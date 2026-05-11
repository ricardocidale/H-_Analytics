/**
 * Admin Agent Roster routes (Task #1389).
 *
 *   GET /api/admin/agent-roster/health
 *
 * Returns the most recent already-tracked health signal for every entity
 * the Intelligence sidebar's Agent Roster pages display:
 *
 *   - Specialists & the Analyst Orchestrator (Gustavo) → derived from
 *     `specialist_assignments` × cached `resource_health_checks` (the
 *     same data the per-Specialist probe endpoint inspects, just read in
 *     bulk).
 *   - Iris → derived from the latest `iris_runs` row.
 *   - Rebecca → derived from `getRebeccaKBStats()` (any active KB
 *     content + a working vector store ⇒ healthy).
 *
 * No live LLM calls. Minions are intentionally absent — they're
 * deterministic helpers and have no health signal to report.
 */

import type { Express } from "express";
import { storage } from "../../storage";
import { requireAdmin } from "../../auth";
import { logAndSendError } from "../helpers";
import { SPECIALIST_CATALOG } from "@engine/analyst/registry/specialist-catalog";
import {
  deriveHealthStatus,
  type ResourceKind,
  type ProbeStatus,
} from "@workspace/db";
import { getLatestIrisRun } from "../../storage/iris-runs";

type RosterHealthStatus = "healthy" | "degraded" | "error" | "unknown";

interface RosterHealthEntry {
  status: RosterHealthStatus;
  source: string;
  checkedAt: string | null;
  message?: string;
}

async function specialistHealth(
  specialistId: string,
  now: Date,
): Promise<RosterHealthEntry> {
  const assignments = await storage.listSpecialistAssignments(specialistId);
  if (assignments.length === 0) {
    // No tracked health signal at all — surface as unknown so the UI does
    // not display a fake green check. Reviewer requirement (Task #1389):
    // "entities without any health signal show an unknown state rather
    // than a fake green check."
    return {
      status: "unknown",
      source: "catalog (no resource assignments — no tracked signal)",
      checkedAt: null,
    };
  }

  let latestCheckedAt: Date | null = null;
  let anyRedRequired = false;
  let anyAmber = false;
  let anyGreen = false;
  let allUnknown = true;

  for (const row of assignments) {
    const resource = row.resourceId
      ? await storage.getAdminResourceById(row.resourceId)
      : undefined;
    if (!resource) {
      if (row.required) anyRedRequired = true;
      continue;
    }
    const latest = await storage.getLatestHealthCheck(resource.id);
    if (latest?.checkedAt && (!latestCheckedAt || latest.checkedAt > latestCheckedAt)) {
      latestCheckedAt = latest.checkedAt;
    }
    const health = deriveHealthStatus({
      lastStatus: (latest?.status as ProbeStatus | undefined) ?? null,
      lastCheckedAt: latest?.checkedAt ?? null,
      kind: resource.kind as ResourceKind,
      now,
    });
    if (health === "green") { anyGreen = true; allUnknown = false; }
    else if (health === "amber") { anyAmber = true; allUnknown = false; }
    else if (health === "red") {
      allUnknown = false;
      if (row.required) anyRedRequired = true;
      else anyAmber = true;
    }
  }

  let status: RosterHealthStatus;
  if (anyRedRequired) status = "error";
  else if (anyAmber) status = "degraded";
  else if (anyGreen) status = "healthy";
  else if (allUnknown) status = "unknown";
  else status = "healthy";

  return {
    status,
    source: "specialist_assignments × resource_health_checks",
    checkedAt: latestCheckedAt ? latestCheckedAt.toISOString() : null,
  };
}

async function irisHealth(now: Date): Promise<RosterHealthEntry> {
  const lastRun = await getLatestIrisRun();
  if (!lastRun) {
    return { status: "unknown", source: "iris_runs (no rows)", checkedAt: null };
  }
  const checkedAt = lastRun.runAt instanceof Date ? lastRun.runAt : new Date(lastRun.runAt);
  // Iris is scheduled. We don't impose a freshness window here — older
  // successful runs simply read as `healthy` with their last-run
  // timestamp; the row UI surfaces the age so admins can judge.
  let status: RosterHealthStatus;
  if (lastRun.status === "completed") status = "healthy";
  else if (lastRun.status === "running") status = "healthy";
  else status = "error";
  return {
    status,
    source: "iris_runs.latest",
    checkedAt: checkedAt.toISOString(),
    message: `Last run: ${lastRun.status}`,
  };
}

async function rebeccaHealth(now: Date): Promise<RosterHealthEntry> {
  try {
    const stats = await storage.getRebeccaKBStats();
    const activeEntries = stats?.active ?? 0;
    if (activeEntries > 0) {
      return {
        status: "healthy",
        source: "rebecca_kb stats",
        checkedAt: now.toISOString(),
      };
    }
    return {
      status: "degraded",
      source: "rebecca_kb stats",
      checkedAt: now.toISOString(),
      message: "Knowledge base is empty.",
    };
  } catch (err) {
    return {
      status: "error",
      source: "rebecca_kb stats",
      checkedAt: now.toISOString(),
      message: err instanceof Error ? err.message : "Failed to read KB stats",
    };
  }
}

export function registerAgentRosterRoutes(app: Express) {
  app.get("/api/admin/agent-roster/health", requireAdmin, async (_req, res) => {
    try {
      const now = new Date();
      const entries: Record<string, RosterHealthEntry> = {};

      await Promise.all(
        SPECIALIST_CATALOG.map(async (def) => {
          entries[def.id] = await specialistHealth(def.id, now);
        }),
      );

      entries["iris"] = await irisHealth(now);
      entries["rebecca"] = await rebeccaHealth(now);

      res.json({ entries, generatedAt: now.toISOString() });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to read agent roster health", error, "AROSTER-001");
    }
  });
}
