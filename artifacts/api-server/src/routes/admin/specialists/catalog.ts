/**
 * Admin Specialist catalog + detail routes (Task #482 split).
 *
 *   GET /api/admin/specialists              — full catalog with overlay identity
 *   GET /api/admin/specialists/:id          — definition + config + assignments
 *   GET /api/admin/specialists/:id/run-status — current run phase for persona orb
 *
 * Split rationale: catalog rendering and detail composition are read-only
 * and share the catalog/identity overlay machinery. They have no
 * dependency on the per-section update handlers.
 */
import type { Express } from "express";
import { storage } from "../../../storage";
import { requireAdmin } from "../../../auth";
import { logAndSendError } from "../../helpers";
import {
  SPECIALIST_CATALOG,
  getSpecialistById,
} from "@engine/analyst/registry/specialist-catalog";
import { specialistDisplayName } from "@workspace/db";
import {
  type ResourceKind,
  toResourcePublicView,
  deriveHealthStatus,
  type ResourceHealthStatus,
  type ProbeStatus,
} from "@workspace/db";
import { PREREQUISITES } from "@engine/analyst/registry/prerequisites";
import {
  ORCHESTRATOR_IDENTITY,
  ORCHESTRATOR_SPECIALIST_ID,
  resolveSpecialistIdentity,
} from "@engine/analyst/identity";
import { idParamSchema, toConfigView } from "./_shared";
import { getSpecialistGlobalLlmDefaults } from "../../../ai/specialist-llm-resolver";

/** How long after a run completes before the phase signal resets to null (ms). */
export const RECENT_RUN_THRESHOLD_MS = 30_000;

/** Pure helper — determines the UI phase for a specialist run-status response.
 *  Exported for unit testing; `now` defaults to Date.now() in route usage. */
export function deriveSpecialistPhase(
  runningCount: number,
  recentRun: { completedAt: Date | string | null; status: string } | null | undefined,
  now: number,
): "thinking" | "complete" | "error" | null {
  if (runningCount > 0) return "thinking";
  if (!recentRun) return null;
  const completedAt = recentRun.completedAt;
  const ageMs = completedAt ? now - new Date(completedAt).getTime() : Infinity;
  if (ageMs >= RECENT_RUN_THRESHOLD_MS) return null;
  if (recentRun.status === "completed") return "complete";
  if (recentRun.status === "failed") return "error";
  return null;
}

export function registerCatalogRoutes(app: Express) {
  // ── List catalog ────────────────────────────────────────────────
  // Overlays the Phase-3 admin identity override (humanName + gender) onto
  // each catalog row so the sidebar / list surfaces show the currently-
  // effective persona, not the stale catalog default. Also appends a
  // synthetic row for Gustavo (the orchestrator) so admins can navigate to
  // the same SpecialistPage and edit Gustavo's identity through the same UI.
  app.get("/api/admin/specialists", requireAdmin, async (_req, res) => {
    try {
      const [overrides, llmOverrideIds] = await Promise.all([
        storage.listIdentityOverrides(),
        // Task #502 — single batch query that returns the set of specialist
        // ids whose specialist_configs row diverges from the global LLM /
        // pipeline-policy defaults. We surface this on each catalog row so
        // the sidebar can render an "Overrides" badge at a glance and the
        // LLM Defaults page can show a drift summary. The method is part
        // of the IStorage contract (see server/storage/specialist-config.ts);
        // a missing implementation would surface as a typed error rather
        // than a silent empty set.
        storage.listSpecialistsWithLlmOverrides(),
      ]);
      const overrideById = new Map(overrides.map((o) => [o.specialistId, o]));
      const catalogRows = SPECIALIST_CATALOG.map((d) => {
        const resolved = resolveSpecialistIdentity(
          { humanName: d.humanName, gender: d.gender },
          overrideById.get(d.id) ?? null,
        );
        return {
          id: d.id,
          letter: d.letter,
          realName: d.realName,
          displayName: specialistDisplayName(d),
          humanName: resolved.humanName,
          gender: resolved.gender,
          description: d.description ?? null,
          subject: d.subject,
          capabilities: d.capabilities,
          status: d.status,
          // Task #502 — true iff this Specialist's `specialist_configs`
          // row has any non-null N+1 model override, multi-model toggle
          // override, or pipeline-policy workflow override. Specialists
          // that lack `llm-config` capability never report true (no UI
          // to set an override in the first place).
          hasLlmOverrides: llmOverrideIds.has(d.id),
          candidateFields: d.candidateFields ?? [],
          prerequisites: (d.prerequisites ?? []).map((id) => ({
            id,
            label: PREREQUISITES[id]?.label ?? id,
            description: PREREQUISITES[id]?.description ?? "",
          })),
        };
      });
      const gustavoOverride = overrideById.get(ORCHESTRATOR_SPECIALIST_ID) ?? null;
      const gustavoResolved = resolveSpecialistIdentity(
        { humanName: ORCHESTRATOR_IDENTITY.humanName, gender: ORCHESTRATOR_IDENTITY.gender },
        gustavoOverride,
      );
      const gustavoRow = {
        id: ORCHESTRATOR_SPECIALIST_ID,
        letter: "G",
        realName: ORCHESTRATOR_IDENTITY.humanName,
        displayName: ORCHESTRATOR_IDENTITY.role,
        humanName: gustavoResolved.humanName,
        gender: gustavoResolved.gender,
        description: ORCHESTRATOR_IDENTITY.description,
        subject: "orchestrator" as const,
        capabilities: [] as string[],
        status: "built" as const,
        // Gustavo declares no editable LLM Config tab — overrides are not
        // possible for the orchestrator, so this is always false.
        hasLlmOverrides: false,
        candidateFields: [] as never[],
        prerequisites: [] as never[],
      };
      res.json([gustavoRow, ...catalogRows]);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to list specialists", error, "ASCA-001");
    }
  });

  // ── Cross-Specialist perennial-offender roll-up (Task #614) ──────
  // Surfaces the top N (specialistId, fieldKey) pairs where a Specialist
  // keeps recommending a candidate field (`appearances >= 3`) without
  // ever having been promoted (`lastPromotedAt IS NULL`). Joined with
  // catalog metadata (Specialist letter+name, field label+surface) so
  // the UI can render a deep-link list without a follow-up round-trip
  // per row. Path is registered BEFORE `/:id` so the literal segment
  // wins over the params route. Catalog-orphan rows (the field has been
  // removed from the Specialist's candidate list since the counter was
  // bumped) are filtered out — they cannot be acted on from the UI.
  app.get(
    "/api/admin/specialists/perennial-offenders",
    requireAdmin,
    async (req, res) => {
      try {
        const rawLimit = Number.parseInt(String(req.query.limit ?? ""), 10);
        const limit =
          Number.isFinite(rawLimit) && rawLimit > 0 && rawLimit <= 100
            ? rawLimit
            : 20;
        const rows = await storage.getTopPerennialRecommendationOffenders(limit);
        const enriched = rows
          .map((r) => {
            const def = getSpecialistById(r.specialistId);
            if (!def) return null;
            const cand = (def.candidateFields ?? []).find(
              (c) => c.key === r.fieldKey,
            );
            if (!cand) return null;
            return {
              specialistId: r.specialistId,
              specialistLetter: def.letter,
              specialistRealName: def.realName,
              specialistDisplayName: specialistDisplayName(def),
              fieldKey: r.fieldKey,
              fieldLabel: cand.label,
              fieldSurface: cand.surface,
              appearances: r.appearances,
              firstObservedAt: r.firstObservedAt,
              lastObservedAt: r.lastObservedAt,
            };
          })
          .filter((r): r is NonNullable<typeof r> => r !== null);
        res.json(enriched);
      } catch (error: unknown) {
        logAndSendError(
          res,
          "Failed to load perennial recommendation offenders",
          error,
          "ASCA-004",
        );
      }
    },
  );

  // ── Per-Specialist run-status (for persona orb animation) ───────
  // Returns the current cognitive phase for the SpecialistPage header
  // animation. Polled by the client every SPECIALIST_STATUS_POLL_INTERVAL_MS
  // while a run is in progress; polls stop automatically when phase is null.
  //
  // Phase derivation:
  //   running count > 0       → "thinking"  (active research in flight)
  //   last run completed <30s → "complete"  (brief success signal)
  //   last run failed <30s    → "error"     (brief failure signal)
  //   otherwise               → null        (orb hidden)
  //
  // Must be registered BEFORE the `/:id` detail route so Express does not
  // attempt to match "run-status" as a specialist id.

  app.get("/api/admin/specialists/:id/run-status", requireAdmin, async (req, res) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const isDefined =
        id === ORCHESTRATOR_SPECIALIST_ID || getSpecialistById(id) !== undefined;
      if (!isDefined) return res.status(404).json({ error: "Specialist not found", code: "ASCA-004" });

      const runningCount = await storage.countRunningResearchRunsForSpecialist(id);
      const isRunning = runningCount > 0;
      const recentRuns = isRunning ? [] : await storage.getResearchRunsForSpecialist(id, 1);
      const phase = deriveSpecialistPhase(runningCount, recentRuns[0] ?? null, Date.now());

      res.json({ isRunning, runningCount, phase });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch specialist run status", error, "ASCA-002");
    }
  });

  // ── Detail (definition + config + assignments-with-health) ──────
  // Accepts ORCHESTRATOR_SPECIALIST_ID ("gaspar") via a synthetic detail response so the orchestrator
  // can be edited through the same SpecialistPage as the 12 catalog
  // specialists. Catalog rows have their humanName/gender overlaid with
  // any Phase-3 admin override so the page header matches what the
  // Identity tab will show.
  app.get("/api/admin/specialists/:id", requireAdmin, async (req, res) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      if (id === ORCHESTRATOR_SPECIALIST_ID) {
        const override = await storage.getIdentityOverride(id);
        const resolved = resolveSpecialistIdentity(
          { humanName: ORCHESTRATOR_IDENTITY.humanName, gender: ORCHESTRATOR_IDENTITY.gender },
          override,
        );
        return res.json({
          definition: {
            id: ORCHESTRATOR_SPECIALIST_ID,
            letter: "G",
            realName: ORCHESTRATOR_IDENTITY.humanName,
            displayName: ORCHESTRATOR_IDENTITY.role,
            humanName: resolved.humanName,
            gender: resolved.gender,
            description: ORCHESTRATOR_IDENTITY.description,
            subject: "orchestrator",
            // Gustavo declares no editable capability tabs — the synthetic
            // Identity tab (added unconditionally by SpecialistPage) is the
            // only editable surface for the orchestrator.
            capabilities: [],
            assignmentRefs: [],
            constantsOwned: [],
            defaultRefreshCadenceDays: null,
            candidateFields: [],
            prerequisites: [],
          },
          config: null,
          assignments: [],
        });
      }
      const def = getSpecialistById(id);
      if (!def) return res.status(404).json({ error: "Specialist not found", code: "ASCA-005" });
      const config = await storage.getOrCreateSpecialistConfig(id);
      const identityOverride = await storage.getIdentityOverride(id);
      const resolvedIdentity = resolveSpecialistIdentity(
        { humanName: def.humanName, gender: def.gender },
        identityOverride,
      );

      // Materialize assignments + health. Joins specialist_assignments → admin_resources.
      const rows = await storage.listSpecialistAssignments(id);
      const now = new Date();
      const assignments = await Promise.all(
        rows.map(async (row) => {
          const resource = row.resourceId
            ? await storage.getAdminResourceById(row.resourceId)
            : undefined;
          let health: { status: ResourceHealthStatus; lastChecked: string | null; lastStatus: ProbeStatus | null } = {
            status: "gray",
            lastChecked: null,
            lastStatus: null,
          };
          if (resource) {
            const latest = await storage.getLatestHealthCheck(resource.id);
            health = {
              status: deriveHealthStatus({
                lastStatus: (latest?.status as ProbeStatus | undefined) ?? null,
                lastCheckedAt: latest?.checkedAt ?? null,
                kind: resource.kind as ResourceKind,
                now,
              }),
              lastChecked: latest?.checkedAt ? latest.checkedAt.toISOString() : null,
              lastStatus: (latest?.status as ProbeStatus | undefined) ?? null,
            };
          }
          return {
            kind: row.assignmentKind as ResourceKind,
            slug: row.assignmentSlug,
            role: row.assignmentRole,
            required: row.required,
            resource: resource ? toResourcePublicView(resource, now) : null,
            health,
          };
        }),
      );

      res.json({
        definition: {
          id: def.id,
          letter: def.letter,
          realName: def.realName,
          displayName: specialistDisplayName(def),
          humanName: resolvedIdentity.humanName,
          gender: resolvedIdentity.gender,
          description: def.description ?? null,
          subject: def.subject,
          capabilities: def.capabilities,
          status: def.status,
          assignmentRefs: def.assignmentRefs,
          // Surfaced so the Specialist page can render the editable
          // cadence card (only meaningful for Constants Specialists, i.e.
          // ones whose catalog entry declares `refreshCadenceDays`).
          constantsOwned: def.constantsOwned ?? [],
          defaultRefreshCadenceDays: def.refreshCadenceDays ?? null,
          candidateFields: def.candidateFields ?? [],
          prerequisites: (def.prerequisites ?? []).map((prereqId) => ({
            id: prereqId,
            label: PREREQUISITES[prereqId]?.label ?? prereqId,
            description: PREREQUISITES[prereqId]?.description ?? "",
          })),
        },
        config: toConfigView(config, def, await getSpecialistGlobalLlmDefaults()),
        assignments,
      });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch specialist", error, "ASCA-003");
    }
  });
}
