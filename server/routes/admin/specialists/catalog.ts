/**
 * Admin Specialist catalog + detail routes (Task #482 split).
 *
 *   GET /api/admin/specialists       — full catalog with overlay identity
 *   GET /api/admin/specialists/:id   — definition + config + assignments
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
} from "../../../../engine/analyst/registry/specialist-catalog";
import { specialistDisplayName } from "@shared/schema/specialist";
import {
  type ResourceKind,
  toResourcePublicView,
  deriveHealthStatus,
  type ResourceHealthStatus,
  type ProbeStatus,
} from "@shared/schema";
import { PREREQUISITES } from "../../../../engine/analyst/registry/prerequisites";
import {
  GASPAR_IDENTITY,
  ORCHESTRATOR_SPECIALIST_ID,
  resolveSpecialistIdentity,
} from "../../../../engine/analyst/identity";
import { idParamSchema, toConfigView } from "./_shared";

export function registerCatalogRoutes(app: Express) {
  // ── List catalog ────────────────────────────────────────────────
  // Overlays the Phase-3 admin identity override (humanName + gender) onto
  // each catalog row so the sidebar / list surfaces show the currently-
  // effective persona, not the stale catalog default. Also appends a
  // synthetic row for Gaspar (the orchestrator) so admins can navigate to
  // the same SpecialistPage and edit Gaspar's identity through the same UI.
  app.get("/api/admin/specialists", requireAdmin, async (_req, res) => {
    try {
      const overrides = await storage.listIdentityOverrides();
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
          candidateFields: d.candidateFields ?? [],
          prerequisites: (d.prerequisites ?? []).map((id) => ({
            id,
            label: PREREQUISITES[id]?.label ?? id,
            description: PREREQUISITES[id]?.description ?? "",
          })),
        };
      });
      const gasparOverride = overrideById.get(ORCHESTRATOR_SPECIALIST_ID) ?? null;
      const gasparResolved = resolveSpecialistIdentity(
        { humanName: GASPAR_IDENTITY.humanName, gender: GASPAR_IDENTITY.gender },
        gasparOverride,
      );
      const gasparRow = {
        id: ORCHESTRATOR_SPECIALIST_ID,
        letter: "G",
        realName: GASPAR_IDENTITY.humanName,
        displayName: GASPAR_IDENTITY.role,
        humanName: gasparResolved.humanName,
        gender: gasparResolved.gender,
        description: GASPAR_IDENTITY.description,
        subject: "orchestrator" as const,
        capabilities: [] as string[],
        status: "built" as const,
        candidateFields: [] as never[],
        prerequisites: [] as never[],
      };
      res.json([gasparRow, ...catalogRows]);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to list specialists", error);
    }
  });

  // ── Detail (definition + config + assignments-with-health) ──────
  // Accepts id="gaspar" via a synthetic detail response so the orchestrator
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
          { humanName: GASPAR_IDENTITY.humanName, gender: GASPAR_IDENTITY.gender },
          override,
        );
        return res.json({
          definition: {
            id: ORCHESTRATOR_SPECIALIST_ID,
            letter: "G",
            realName: GASPAR_IDENTITY.humanName,
            displayName: GASPAR_IDENTITY.role,
            humanName: resolved.humanName,
            gender: resolved.gender,
            description: GASPAR_IDENTITY.description,
            subject: "orchestrator",
            // Gaspar declares no editable capability tabs — the synthetic
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
      if (!def) return res.status(404).json({ error: "Specialist not found" });
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
          prerequisites: (def.prerequisites ?? []).map((id) => ({
            id,
            label: PREREQUISITES[id]?.label ?? id,
            description: PREREQUISITES[id]?.description ?? "",
          })),
        },
        config: toConfigView(config, def),
        assignments,
      });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch specialist", error);
    }
  });
}
