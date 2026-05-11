/**
 * Admin Agent Roster routes (Task #1389, extended in Task #1391).
 *
 *   GET /api/admin/agent-roster/health
 *
 * Returns the most recent already-tracked health signal for every entity
 * the Intelligence sidebar's Agent Roster pages display:
 *
 *   - Specialists & the Analyst Orchestrator (Gustavo) → derived from
 *     `specialist_assignments` × cached `resource_health_checks` (the
 *     same data the per-Specialist probe endpoint inspects, just read in
 *     bulk), then merged with any open `costantino_findings` whose
 *     target maps to one of the Specialist's assigned admin_resources.
 *   - Iris → derived from the latest `iris_runs` row.
 *   - Rebecca → derived from `getRebeccaKBStats()` (any active KB
 *     content + a working vector store ⇒ healthy).
 *
 * The response also carries the most recent Costantino cycle outcome so
 * the UI can render a "live audit" indicator and admins can see when the
 * background custodian last swept the integration layer (Task #1391).
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
  costantinoFindings,
  type CostantinoFinding,
} from "@workspace/db";
import { db } from "../../db";
import { isNull } from "drizzle-orm";
import { getLatestIrisRun } from "../../storage/iris-runs";

type RosterHealthStatus = "healthy" | "degraded" | "error" | "unknown";

interface RosterHealthEntry {
  status: RosterHealthStatus;
  source: string;
  checkedAt: string | null;
  message?: string;
}

interface CostantinoCycleSummary {
  lastRunAt: string | null;
  status: "ok" | "warn" | "error" | null;
  notes: string | null;
  considered: number;
  succeeded: number;
  failed: number;
}

const COSTANTINO_SCHEDULER_KEY = "costantino-data-custodian";

/** Severity → roster status when a finding is open. */
function severityToStatus(severity: string): "degraded" | "error" {
  if (severity === "critical" || severity === "error") return "error";
  return "degraded";
}

/**
 * Severity ladder for roster statuses, worst-last. The index of a status
 * in this tuple is its severity rank (used by `worseStatus`).
 */
const ROSTER_STATUS_SEVERITY: readonly RosterHealthStatus[] = [
  "healthy",
  "unknown",
  "degraded",
  "error",
] as const;

/** Compose two roster statuses, picking the worse of the pair. */
function worseStatus(a: RosterHealthStatus, b: RosterHealthStatus): RosterHealthStatus {
  return ROSTER_STATUS_SEVERITY.indexOf(b) > ROSTER_STATUS_SEVERITY.indexOf(a) ? b : a;
}

async function specialistHealth(
  specialistId: string,
  now: Date,
  findingsBySlug: Map<string, CostantinoFinding[]>,
  findingsBySpecialistId: Map<string, CostantinoFinding[]>,
): Promise<RosterHealthEntry> {
  const assignments = await storage.listSpecialistAssignments(specialistId);

  // Open findings the custodian has tagged directly against this specialist
  // (target_kind='specialist'). These apply even when no assignments exist.
  const directFindings = findingsBySpecialistId.get(specialistId) ?? [];

  if (assignments.length === 0) {
    if (directFindings.length > 0) {
      const worst = directFindings.reduce<CostantinoFinding>(
        (acc, f) =>
          severityToStatus(f.severity) === "error" ? f : acc,
        directFindings[0],
      );
      return {
        status: severityToStatus(worst.severity),
        source: "costantino_findings (open, target=specialist)",
        checkedAt: worst.detectedAt.toISOString(),
        message: worst.description,
      };
    }
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
  let findingMessage: string | undefined;
  let findingStatus: RosterHealthStatus = "healthy";
  let findingDetectedAt: Date | null = null;

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

    // Costantino findings keyed by admin_resource slug — the custodian
    // writes target_id=<slug> when target_kind='admin_resource'.
    const findings = findingsBySlug.get(resource.slug) ?? [];
    for (const f of findings) {
      const fStatus = severityToStatus(f.severity);
      const merged = worseStatus(findingStatus, fStatus);
      if (merged !== findingStatus || !findingDetectedAt) {
        findingStatus = merged;
        findingMessage = `${resource.slug}: ${f.description}`;
        findingDetectedAt = f.detectedAt;
      }
    }
  }

  // Direct-against-specialist findings stack on top of the assignment view.
  for (const f of directFindings) {
    const fStatus = severityToStatus(f.severity);
    const merged = worseStatus(findingStatus, fStatus);
    if (merged !== findingStatus || !findingDetectedAt) {
      findingStatus = merged;
      findingMessage = f.description;
      findingDetectedAt = f.detectedAt;
    }
  }

  let assignmentStatus: RosterHealthStatus;
  if (anyRedRequired) assignmentStatus = "error";
  else if (anyAmber) assignmentStatus = "degraded";
  else if (anyGreen) assignmentStatus = "healthy";
  else if (allUnknown) assignmentStatus = "unknown";
  else assignmentStatus = "healthy";

  const status = worseStatus(assignmentStatus, findingStatus);

  // Prefer the more recent of (latest probe, latest finding) for the
  // "last checked" timestamp the UI shows.
  const checkedAtMs = Math.max(
    latestCheckedAt ? latestCheckedAt.getTime() : 0,
    findingDetectedAt ? findingDetectedAt.getTime() : 0,
  );
  const checkedAt = checkedAtMs > 0 ? new Date(checkedAtMs).toISOString() : null;

  const source = findingMessage
    ? "specialist_assignments × resource_health_checks + costantino_findings"
    : "specialist_assignments × resource_health_checks";

  return {
    status,
    source,
    checkedAt,
    message: findingMessage,
  };
}

async function irisHealth(_now: Date): Promise<RosterHealthEntry> {
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

/**
 * Read the last Costantino scheduler run so the UI can show "audited X
 * ago — N ok / N failed". Best-effort: if the table read fails or no row
 * exists yet (the scheduler hasn't fired its first cycle), we return an
 * empty summary instead of failing the whole roster endpoint.
 */
async function lastCostantinoCycle(): Promise<CostantinoCycleSummary> {
  try {
    const rows = await storage.listSchedulerRuns();
    const row = rows.find((r) => r.schedulerKey === COSTANTINO_SCHEDULER_KEY);
    if (!row) {
      return { lastRunAt: null, status: null, notes: null, considered: 0, succeeded: 0, failed: 0 };
    }
    const ranAt = row.lastRunAt instanceof Date ? row.lastRunAt : new Date(row.lastRunAt);
    return {
      lastRunAt: ranAt.toISOString(),
      status: (row.status as CostantinoCycleSummary["status"]) ?? null,
      notes: row.notes ?? null,
      considered: row.considered ?? 0,
      succeeded: row.succeeded ?? 0,
      failed: row.failed ?? 0,
    };
  } catch {
    return { lastRunAt: null, status: null, notes: null, considered: 0, succeeded: 0, failed: 0 };
  }
}

/**
 * Pull every open Costantino finding once and bucket by target so the
 * per-specialist computations stay cheap (no N+1).
 */
async function loadOpenFindings(): Promise<{
  bySlug: Map<string, CostantinoFinding[]>;
  bySpecialistId: Map<string, CostantinoFinding[]>;
}> {
  const bySlug = new Map<string, CostantinoFinding[]>();
  const bySpecialistId = new Map<string, CostantinoFinding[]>();
  try {
    const rows = await db
      .select()
      .from(costantinoFindings)
      .where(isNull(costantinoFindings.resolvedAt));
    for (const row of rows) {
      if (row.targetKind === "admin_resource") {
        const list = bySlug.get(row.targetId) ?? [];
        list.push(row);
        bySlug.set(row.targetId, list);
      } else if (row.targetKind === "specialist") {
        const list = bySpecialistId.get(row.targetId) ?? [];
        list.push(row);
        bySpecialistId.set(row.targetId, list);
      }
    }
  } catch {
    /* best-effort — empty maps mean "no finding signal", same as no findings */
  }
  return { bySlug, bySpecialistId };
}

export function registerAgentRosterRoutes(app: Express) {
  app.get("/api/admin/agent-roster/health", requireAdmin, async (_req, res) => {
    try {
      const now = new Date();
      const entries: Record<string, RosterHealthEntry> = {};

      const [findings, costantinoCycle] = await Promise.all([
        loadOpenFindings(),
        lastCostantinoCycle(),
      ]);

      await Promise.all(
        SPECIALIST_CATALOG.map(async (def) => {
          entries[def.id] = await specialistHealth(
            def.id,
            now,
            findings.bySlug,
            findings.bySpecialistId,
          );
        }),
      );

      entries["iris"] = await irisHealth(now);
      entries["rebecca"] = await rebeccaHealth(now);

      res.json({
        entries,
        generatedAt: now.toISOString(),
        costantinoCycle,
      });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to read agent roster health", error, "AROSTER-001");
    }
  });
}
