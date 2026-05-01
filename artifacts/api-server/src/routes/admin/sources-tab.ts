/**
 * Sources tab + admin-editable connections (Task #496).
 *
 * Routes:
 *   GET  /api/admin/specialists/:id/sources           — grouped sources for a specialist
 *   GET  /api/admin/analyst/sources                   — grouped sources for The Analyst
 *   POST /api/admin/specialists/:id/sources/test-all  — fan out probes (rate-limit aware)
 *   POST /api/admin/analyst/sources/test-all
 *   GET  /api/admin/resources/:id/connections         — list connection targets
 *   PUT  /api/admin/resources/:id/connections         — replace the target list
 *   GET  /api/admin/connection-targets                — catalog of pickable targets
 *
 * The Sources view is read from `resource_specialist_connections`
 * exclusively — that table is the canonical, editable source of truth
 * for source ↔ specialist wiring. The migration seeds it once from the
 * catalog (`specialist_assignments`) so existing wiring lights up
 * immediately, and the catalog is still consulted *only* to badge a
 * card's `fromCatalog` provenance hint. Crucially, the read does NOT
 * union live catalog rows — otherwise removing a seeded link from the
 * editor would silently re-appear because the catalog still references
 * it. Runtime engine paths that need catalog doctrine read
 * `specialist_assignments` directly; this UI/edit surface is decoupled.
 */
import type { Express, Request } from "express";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import { storage } from "../../storage";
import { requireAdmin } from "../../auth";
import { logActivity, logAndSendError } from "../helpers";
import {
  ANALYST_CONNECTION_TARGET,
  ConnectionTargetSchema,
  SOURCE_GROUP_LABELS,
  SOURCE_GROUPS,
  SPECIALIST_TARGET_PREFIX,
  bucketResourceForSourcesTab,
  deriveHealthStatus,
  toResourcePublicView,
  type AdminResourceRow,
  type ProbeStatus,
  type ResourceHealthStatus,
  type ResourceKind,
  type SourceGroup,
} from "@workspace/db";
import { runProbe } from "../../jobs/probes";
import { specialistDisplayName } from "@workspace/db";
import { SPECIALIST_CATALOG } from "@engine/analyst/registry/specialist-catalog";
import {
  GASPAR_IDENTITY,
  ORCHESTRATOR_SPECIALIST_ID,
} from "@engine/analyst/identity";

const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const specialistIdParamSchema = z.object({
  id: z.string().min(1),
});

const replaceConnectionsBody = z.object({
  targets: z.array(ConnectionTargetSchema),
});

interface SourceCardView {
  resource: ReturnType<typeof toResourcePublicView>;
  group: SourceGroup;
  health: {
    status: ResourceHealthStatus;
    lastChecked: string | null;
    lastStatus: ProbeStatus | null;
    lastErrorCode: string | null;
  };
  /** True when the link is materialized from the catalog (read-only doctrine). */
  fromCatalog: boolean;
  /** True when the link is admin-set in resource_specialist_connections. */
  fromAdminConnection: boolean;
}

interface SourcesGroupView {
  group: SourceGroup;
  label: string;
  cards: SourceCardView[];
}

/**
 * Resolve the set of admin_resources rows connected to a target (specialist
 * id or "analyst"), tagging each with provenance flags so the UI can hint
 * which links are catalog vs admin-set. Excludes resources that don't
 * belong to one of the four Sources tab groups (e.g. models, benchmarks).
 */
async function resolveSourcesForTarget(target: string): Promise<SourceCardView[]> {
  // Canonical: read only from the editable join table. The catalog set
  // is loaded separately and used solely to badge `fromCatalog` for the
  // UI hint — it MUST NOT add cards to the displayed set, otherwise
  // removing a seeded link in the editor would silently re-appear here.
  const adminConnectionIds = new Set(await storage.listResourceIdsForTarget(target));

  let catalogResourceIds = new Set<number>();
  if (target.startsWith(SPECIALIST_TARGET_PREFIX)) {
    const specialistId = target.slice(SPECIALIST_TARGET_PREFIX.length);
    const assignments = await storage.listSpecialistAssignments(specialistId);
    catalogResourceIds = new Set(
      assignments.filter((a) => a.resourceId !== null).map((a) => a.resourceId as number),
    );
  }

  if (adminConnectionIds.size === 0) return [];

  const now = new Date();
  const rows = await Promise.all(
    Array.from(adminConnectionIds).map((id) => storage.getAdminResourceById(id)),
  );

  const cards: SourceCardView[] = [];
  for (const row of rows) {
    if (!row) continue;
    const group = bucketResourceForSourcesTab({ kind: row.kind, config: row.config });
    if (!group) continue; // models/benchmarks live elsewhere
    const latest = await storage.getLatestHealthCheck(row.id);
    const rawStatus = deriveHealthStatus({
      lastStatus: (latest?.status as ProbeStatus | undefined) ?? null,
      lastCheckedAt: latest?.checkedAt ?? null,
      kind: row.kind as ResourceKind,
      now,
    });
    // Sources tab uses a strict 3-color contract: green (healthy/fresh),
    // red (failing OR stale — unfresh data is a fail signal), gray
    // (never probed). Collapse the wider 4-band status accordingly.
    const status: ResourceHealthStatus = rawStatus === "amber" ? "red" : rawStatus;
    cards.push({
      resource: toResourcePublicView(row, now),
      group,
      health: {
        status,
        lastChecked: latest?.checkedAt ? latest.checkedAt.toISOString() : null,
        lastStatus: (latest?.status as ProbeStatus | undefined) ?? null,
        lastErrorCode: latest?.errorCode ?? null,
      },
      fromCatalog: catalogResourceIds.has(row.id),
      fromAdminConnection: adminConnectionIds.has(row.id),
    });
  }
  // Stable order: by group, then display name.
  cards.sort((a, b) => {
    const ga = SOURCE_GROUPS.indexOf(a.group);
    const gb = SOURCE_GROUPS.indexOf(b.group);
    if (ga !== gb) return ga - gb;
    return a.resource.displayName.localeCompare(b.resource.displayName);
  });
  return cards;
}

function groupCards(cards: SourceCardView[]): SourcesGroupView[] {
  return SOURCE_GROUPS.map((group) => ({
    group,
    label: SOURCE_GROUP_LABELS[group],
    cards: cards.filter((c) => c.group === group),
  }));
}

/**
 * Run probes for every distinct admin_resources row connected to the
 * target. Per-card rate limits still apply — a throttled card is
 * reported as `skipped` with an explanatory error code so the UI can
 * mark it amber instead of red.
 */
async function runTestAllForTarget(req: Request, target: string) {
  const cards = await resolveSourcesForTarget(target);
  const actorId = req.user!.id;
  const results = await Promise.all(
    cards.map(async ({ resource }) => {
      const row = await storage.getAdminResourceById(resource.id);
      if (!row) {
        return { id: resource.id, status: "fail" as const, errorCode: "not_found" };
      }
      const kind = row.kind as ResourceKind;
      const limited = await storage.isAdminTestRateLimited(row.id, actorId, kind);
      if (limited) {
        return {
          id: row.id,
          status: "skipped" as const,
          errorCode: "rate_limited",
        };
      }
      const outcome = await runProbe(row);
      const persisted = await storage.recordProbeResult(row.id, kind, outcome, actorId);
      return {
        id: row.id,
        status: outcome.status,
        latencyMs: outcome.latencyMs,
        errorCode: outcome.errorCode ?? null,
        errorMessage: outcome.errorMessage ?? null,
        checkedAt: persisted.checkedAt.toISOString(),
      };
    }),
  );
  logActivity(
    req,
    "test-all-sources",
    "admin_resource_target",
    null,
    `${target}: ${results.length} card(s)`,
  );
  return results;
}

export function registerSourcesTabRoutes(app: Express) {
  // ── Specialist sources ──────────────────────────────────────────
  app.get("/api/admin/specialists/:id/sources", requireAdmin, async (req, res) => {
    try {
      const { id } = specialistIdParamSchema.parse(req.params);
      // Gaspar uses the same UI but routes to the Analyst connection bucket
      // since it acts as the orchestrator and has no catalog assignments.
      const target =
        id === ORCHESTRATOR_SPECIALIST_ID
          ? ANALYST_CONNECTION_TARGET
          : `${SPECIALIST_TARGET_PREFIX}${id}`;
      const cards = await resolveSourcesForTarget(target);
      res.json({ target, groups: groupCards(cards) });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to load specialist sources", error);
    }
  });

  app.post("/api/admin/specialists/:id/sources/test-all", requireAdmin, async (req, res) => {
    try {
      const { id } = specialistIdParamSchema.parse(req.params);
      const target =
        id === ORCHESTRATOR_SPECIALIST_ID
          ? ANALYST_CONNECTION_TARGET
          : `${SPECIALIST_TARGET_PREFIX}${id}`;
      const results = await runTestAllForTarget(req, target);
      res.json({ target, results });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to run sources test-all", error);
    }
  });

  // ── Analyst sources (alias surface for clarity) ─────────────────
  app.get("/api/admin/analyst/sources", requireAdmin, async (_req, res) => {
    try {
      const cards = await resolveSourcesForTarget(ANALYST_CONNECTION_TARGET);
      res.json({ target: ANALYST_CONNECTION_TARGET, groups: groupCards(cards) });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to load analyst sources", error);
    }
  });

  app.post("/api/admin/analyst/sources/test-all", requireAdmin, async (req, res) => {
    try {
      const results = await runTestAllForTarget(req, ANALYST_CONNECTION_TARGET);
      res.json({ target: ANALYST_CONNECTION_TARGET, results });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to run analyst sources test-all", error);
    }
  });

  // ── Per-resource connection editor (Resources area "Connected to") ──
  app.get("/api/admin/resources/:id/connections", requireAdmin, async (req, res) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const rows = await storage.listConnectionsForResource(id);
      res.json({ resourceId: id, targets: rows.map((r) => r.target) });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to list resource connections", error);
    }
  });

  app.put("/api/admin/resources/:id/connections", requireAdmin, async (req, res) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const parsed = replaceConnectionsBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }
      const exists = await storage.getAdminResourceById(id);
      if (!exists) return res.status(404).json({ error: "Resource not found" });
      const rows = await storage.replaceConnectionsForResource(id, parsed.data.targets);
      logActivity(
        req,
        "update-resource-connections",
        "admin_resource",
        id,
        `${exists.kind}/${exists.slug} → ${parsed.data.targets.length} target(s)`,
      );
      res.json({ resourceId: id, targets: rows.map((r) => r.target) });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to update resource connections", error);
    }
  });

  // ── Catalog of pickable connection targets (multi-select source) ────
  app.get("/api/admin/connection-targets", requireAdmin, async (_req, res) => {
    try {
      const targets = [
        {
          target: ANALYST_CONNECTION_TARGET,
          label: `${GASPAR_IDENTITY.humanName} (The Analyst)`,
          group: "analyst" as const,
        },
        ...SPECIALIST_CATALOG.map((d) => ({
          target: `${SPECIALIST_TARGET_PREFIX}${d.id}`,
          label: `${d.letter} · ${specialistDisplayName(d)}`,
          group: "specialist" as const,
        })),
      ];
      res.json(targets);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to list connection targets", error);
    }
  });
}

// Used in tests to exercise the resolver without going through HTTP.
export const __test = { resolveSourcesForTarget, groupCards };

// Silence "imported but unused" lints for the row helper type when this
// file is re-exported in stripped builds.
export type { AdminResourceRow };
