/**
 * Admin Specialist Tools surface (Phase 2b — Tool inspectability).
 *
 * GET /api/admin/specialist-tools
 *   Returns the static SPECIALIST_TOOLS registry annotated with
 *   `lastBuiltAt` resolved through the storage hook. Read-only —
 *   editing the registry requires a code change + deploy.
 */
import type { Express } from "express";
import { storage } from "../../storage";
import { requireAdmin } from "../../auth";
import { logAndSendError } from "../helpers";
import {
  SPECIALIST_CATALOG,
  getSpecialistById,
} from "../../../engine/analyst/registry/specialist-catalog";
import { getEffectiveSpecialistIdentities } from "../../lib/specialist-identity-resolver";

export function registerAdminSpecialistToolRoutes(app: Express) {
  app.get("/api/admin/specialist-tools", requireAdmin, async (_req, res) => {
    try {
      const rows = await storage.intelligenceV2.listSpecialistToolsWithFreshness();

      // Phase 3 (#453) — overlay identity overrides so renaming Helena
      // (or flipping her pronouns) propagates to the tool inspector
      // immediately, with no second deploy. Single storage round-trip.
      const personaIds = new Set<string>();
      for (const { tool } of rows) {
        personaIds.add(tool.ownerSpecialistId);
        for (const c of tool.calledBy) personaIds.add(c);
      }
      const resolvedById = await getEffectiveSpecialistIdentities(Array.from(personaIds));

      const view = rows.map(({ tool, lastBuiltAt }) => {
        const owner = getSpecialistById(tool.ownerSpecialistId);
        const ownerResolved = resolvedById.get(tool.ownerSpecialistId);
        const calledBy = tool.calledBy.map((id) => {
          const def = getSpecialistById(id);
          const r = resolvedById.get(id);
          return {
            id,
            humanName: r?.humanName ?? def?.humanName ?? id,
            displayName: def?.displayName ?? def?.realName ?? id,
          };
        });
        return {
          id: tool.id,
          displayName: tool.displayName,
          description: tool.description,
          kind: tool.kind,
          sourceFile: tool.sourceFile,
          citation: tool.citation ?? null,
          resourceSlug: tool.resourceSlug ?? null,
          owner: {
            specialistId: tool.ownerSpecialistId,
            humanName: ownerResolved?.humanName ?? owner?.humanName ?? tool.ownerSpecialistId,
            displayName: owner?.displayName ?? owner?.realName ?? tool.ownerSpecialistId,
          },
          calledBy,
          lastBuiltAt: lastBuiltAt?.toISOString() ?? null,
          lastBuiltSource: tool.lastBuiltSource,
        };
      });

      res.json({
        catalogSize: SPECIALIST_CATALOG.length,
        tools: view,
      });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to list specialist tools", error);
    }
  });
}
