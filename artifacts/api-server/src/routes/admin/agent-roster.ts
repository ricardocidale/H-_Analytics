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
  MINION_SELF_TEST_HISTORY_STRIP,
} from "@workspace/db";
import { db } from "../../db";
import { isNull } from "drizzle-orm";
import { getLatestIrisRun } from "../../storage/iris-runs";
import {
  MINION_FINDING_TARGET_KIND,
  MINION_SELF_TEST_SCHEDULER_KEY,
} from "../../jobs/minion-self-test-constants";
import { MINION_SELF_TESTS } from "../../slides/minions/self-tests";

type RosterHealthStatus = "healthy" | "degraded" | "error" | "unknown";

interface RosterHealthEntry {
  status: RosterHealthStatus;
  source: string;
  checkedAt: string | null;
  message?: string;
}

interface MinionSelfTestHistoryItem {
  status: string;
  durationMs: number;
  message: string | null;
  ranAt: string;
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

/**
 * Maps prefetched once per request so the per-specialist loop is O(assignments)
 * pure-CPU instead of O(assignments) DB roundtrips. The roster route polls on a
 * tight cadence; without batching, every poll multiplied the connection-pool
 * load by `Σ specialistAssignments`.
 */
interface RosterDataIndex {
  assignmentsBySpecialistId: Map<string, Awaited<ReturnType<typeof storage.listSpecialistAssignments>>>;
  resourcesById: Map<number, Awaited<ReturnType<typeof storage.getAdminResourceById>>>;
  latestHealthByResourceId: Map<number, Awaited<ReturnType<typeof storage.getLatestHealthCheck>>>;
}

async function specialistHealth(
  specialistId: string,
  now: Date,
  findingsBySlug: Map<string, CostantinoFinding[]>,
  findingsBySpecialistId: Map<string, CostantinoFinding[]>,
  index: RosterDataIndex,
): Promise<RosterHealthEntry> {
  const assignments = index.assignmentsBySpecialistId.get(specialistId) ?? [];

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
    const resource = row.resourceId ? index.resourcesById.get(row.resourceId) : undefined;
    if (!resource) {
      if (row.required) anyRedRequired = true;
      continue;
    }
    const latest = index.latestHealthByResourceId.get(resource.id);
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
 * Pre-fetch every assignment + resource + latest-health-check row touched by
 * the roster endpoint in three bulk queries instead of N+1 per specialist. The
 * route handler awaits this once and threads the result through every
 * `specialistHealth` invocation. Best-effort on each leg: a failure leaves the
 * relevant map empty so a single broken read can't kill the whole endpoint.
 */
async function buildRosterDataIndex(): Promise<RosterDataIndex> {
  const assignmentsBySpecialistId = new Map<string, Awaited<ReturnType<typeof storage.listSpecialistAssignments>>>();
  const resourcesById = new Map<number, Awaited<ReturnType<typeof storage.getAdminResourceById>>>();
  const latestHealthByResourceId = new Map<number, Awaited<ReturnType<typeof storage.getLatestHealthCheck>>>();

  // (1) All specialist assignments, bucketed by specialistId.
  try {
    const allAssignments = await storage.listSpecialistAssignments();
    for (const row of allAssignments) {
      const list = assignmentsBySpecialistId.get(row.specialistId) ?? [];
      list.push(row);
      assignmentsBySpecialistId.set(row.specialistId, list);
    }
  } catch {
    /* best-effort — empty map means every specialist reads as unknown */
  }

  // (2) All admin_resources keyed by id (covers every resourceId on any
  // assignment row). One query for the whole table; admin_resources is small
  // (low hundreds of rows at steady state).
  try {
    const allResources = await storage.listAdminResources();
    for (const r of allResources) {
      resourcesById.set(r.id, r);
    }
  } catch {
    /* best-effort */
  }

  // (3) Latest health-check rows. We don't have a bulk method that returns
  // the latest row per resource, so we still fan-out — but only over the
  // resource IDs actually referenced by some assignment. That trims the work
  // from "N specialists × M assignments" to "distinct(resourceIds)".
  // TODO(perf): replace with a single window-function query
  // (`ROW_NUMBER() OVER (PARTITION BY resource_id ORDER BY checked_at DESC)`)
  // when a storage helper exists; current admin_resources cardinality keeps
  // this acceptable but it's still O(distinct-resources) roundtrips.
  const referencedResourceIds = new Set<number>();
  for (const list of assignmentsBySpecialistId.values()) {
    for (const row of list) {
      if (row.resourceId) referencedResourceIds.add(row.resourceId);
    }
  }
  await Promise.all(
    Array.from(referencedResourceIds).map(async (id) => {
      try {
        const latest = await storage.getLatestHealthCheck(id);
        latestHealthByResourceId.set(id, latest);
      } catch {
        /* best-effort — leaves entry undefined → derives as unknown */
      }
    }),
  );

  return { assignmentsBySpecialistId, resourcesById, latestHealthByResourceId };
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
  byMinionId: Map<string, CostantinoFinding[]>;
}> {
  const bySlug = new Map<string, CostantinoFinding[]>();
  const bySpecialistId = new Map<string, CostantinoFinding[]>();
  const byMinionId = new Map<string, CostantinoFinding[]>();
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
      } else if (row.targetKind === MINION_FINDING_TARGET_KIND) {
        const list = byMinionId.get(row.targetId) ?? [];
        list.push(row);
        byMinionId.set(row.targetId, list);
      }
    }
  } catch {
    /* best-effort — empty maps mean "no finding signal", same as no findings */
  }
  return { bySlug, bySpecialistId, byMinionId };
}

/**
 * Read the last minion-self-test scheduler run so the Minions roster can
 * display "tests last ran X ago — N pass / N fail" alongside the
 * on-demand badge admins get from the Analyst button (Task #1397).
 */
async function lastMinionSelfTestCycle(): Promise<CostantinoCycleSummary> {
  try {
    const rows = await storage.listSchedulerRuns();
    const row = rows.find((r) => r.schedulerKey === MINION_SELF_TEST_SCHEDULER_KEY);
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
 * Derive a per-minion roster health entry from the most recent
 * self-test scheduler cycle and any open `costantino_findings` row
 * targeting that minion. If the scheduler has not yet fired its first
 * cycle and no open finding exists, status stays `unknown` so the UI
 * does not display a fake green dot.
 */
function minionHealth(
  minionId: string,
  lastCycle: CostantinoCycleSummary,
  openFindings: CostantinoFinding[],
): RosterHealthEntry {
  if (openFindings.length > 0) {
    const worst = openFindings.reduce<CostantinoFinding>(
      (acc, f) => (severityToStatus(f.severity) === "error" ? f : acc),
      openFindings[0],
    );
    return {
      status: severityToStatus(worst.severity),
      source: "minion-self-test scheduler · finding open",
      checkedAt: worst.detectedAt.toISOString(),
      message: worst.description,
    };
  }
  if (lastCycle.lastRunAt) {
    // Respect the scheduler-cycle status. A cycle row's timestamp alone is
    // insufficient — a cycle that recorded `warn` or `error` must surface as
    // degraded/error in the roster, not as a false green. The producer enum
    // is `"ok" | "warn" | "error"` (see SchedulerRunRow / recordSchedulerCycle).
    const cycleStatus = lastCycle.status;
    const rosterStatus: RosterHealthStatus =
      cycleStatus === "ok"
        ? "healthy"
        : cycleStatus === "warn"
          ? "degraded"
          : cycleStatus === "error"
            ? "error"
            : "unknown";
    return {
      status: rosterStatus,
      source: `minion-self-test scheduler · last cycle ${cycleStatus ?? "unknown"}`,
      checkedAt: lastCycle.lastRunAt,
      message: lastCycle.notes ?? undefined,
    };
  }
  return {
    status: "unknown",
    source: "minion-self-test scheduler (no cycle yet)",
    checkedAt: null,
  };
}

export function registerAgentRosterRoutes(app: Express) {
  app.get("/api/admin/agent-roster/health", requireAdmin, async (_req, res) => {
    try {
      const now = new Date();
      const entries: Record<string, RosterHealthEntry> = {};

      const [findings, costantinoCycle, minionSelfTestCycle, minionHistoryRows, rosterIndex] =
        await Promise.all([
          loadOpenFindings(),
          lastCostantinoCycle(),
          lastMinionSelfTestCycle(),
          // Best-effort: a failure here surfaces an empty history map rather
          // than failing the whole roster endpoint.
          storage
            .listMinionSelfTestHistory({ limitPerMinion: MINION_SELF_TEST_HISTORY_STRIP })
            .catch(() => []),
          buildRosterDataIndex(),
        ]);

      // Bucket minion self-test rows by minionId for the response payload.
      // Rows are already sorted (minion_id ASC, ran_at DESC, id DESC) by
      // listMinionSelfTestHistory's PARTITION query.
      const minionHistory: Record<string, MinionSelfTestHistoryItem[]> = {};
      for (const row of minionHistoryRows) {
        const list = minionHistory[row.minionId] ?? [];
        list.push({
          status: row.status,
          durationMs: row.durationMs,
          message: row.message,
          ranAt: row.ranAt instanceof Date ? row.ranAt.toISOString() : String(row.ranAt),
        });
        minionHistory[row.minionId] = list;
      }

      await Promise.all(
        SPECIALIST_CATALOG.map(async (def) => {
          entries[def.id] = await specialistHealth(
            def.id,
            now,
            findings.bySlug,
            findings.bySpecialistId,
            rosterIndex,
          );
        }),
      );

      entries["iris"] = await irisHealth(now);
      entries["rebecca"] = await rebeccaHealth(now);

      // Minions — derived from the scheduler cycle row + any open
      // findings the scheduler wrote during a previous fail. Task #1397.
      for (const minionId of Object.keys(MINION_SELF_TESTS)) {
        entries[minionId] = minionHealth(
          minionId,
          minionSelfTestCycle,
          findings.byMinionId.get(minionId) ?? [],
        );
      }

      res.json({
        entries,
        generatedAt: now.toISOString(),
        costantinoCycle,
        minionSelfTestCycle,
        minionHistory,
        minionHistoryStrip: MINION_SELF_TEST_HISTORY_STRIP,
      });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to read agent roster health", error, "AROSTER-001");
    }
  });
}
