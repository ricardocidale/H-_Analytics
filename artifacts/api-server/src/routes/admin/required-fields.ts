/**
 * Legacy `/api/admin/required-fields` surface — DEPRECATED.
 *
 * Replaced by per-Specialist toggle UI:
 *   PUT  /api/admin/specialists/:id/field-toggles
 *   PUT  /api/admin/specialists/:id/prerequisite-toggles
 *   GET  /api/admin/specialists                       (catalog rollup)
 *
 * Each Specialist now owns its own required-field declaration via the catalog
 * (`engine/analyst/registry/specialist-catalog.ts` — `candidateFields[]`) and
 * an admin toggle state stored in `specialist_configs.field_requirements`.
 * The roll-up Required Fields admin page reads the same data and renders a
 * read-only aggregate. There is no longer any global free-form list.
 *
 * GET remains as a temporary read-only proxy that derives the legacy boolean
 * map from the Specialist toggle state so any straggling consumer (browser
 * tab, bookmark, third-party script) gets a coherent answer instead of 404.
 *
 * PUT returns 410 Gone with instructions; admins must edit each Specialist's
 * Required Fields tab.
 */
import { type Express } from "express";
import { storage } from "../../storage";
import { requireAdmin } from "../../auth";
import { logAndSendError } from "../helpers";
import { SPECIALIST_CATALOG } from "@engine/analyst/registry/specialist-catalog";

export function registerRequiredFieldsRoutes(app: Express) {
  // Read-only derivation of the legacy boolean map from the per-Specialist
  // toggle state. Any candidate field that is `"hard"` for at least one
  // Specialist is reported as `true`; everything else is `false`. Pure
  // back-compat — no admin UI writes through this.
  app.get("/api/admin/required-fields", requireAdmin, async (_req, res) => {
    try {
      const out: Record<string, boolean> = {};
      for (const spec of SPECIALIST_CATALOG) {
        for (const cand of spec.candidateFields ?? []) {
          if (out[cand.key] === undefined) out[cand.key] = false;
        }
      }
      for (const spec of SPECIALIST_CATALOG) {
        const cfg = await storage.getSpecialistConfig(spec.id);
        const reqs = (cfg?.fieldRequirements ?? {}) as Record<string, "hard" | "recommended" | "off">;
        for (const [k, level] of Object.entries(reqs)) {
          if (level === "hard") out[k] = true;
        }
      }
      res.json(out);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch derived required fields", error, "AQFD-001");
    }
  });

  // Hard-retire the write path. Admins land here only via stale tabs.
  app.put("/api/admin/required-fields", requireAdmin, (_req, res) => {
    res.status(410).json({
      error:
        "The global Required Fields write API is retired. Each Specialist now owns its own required-field toggles. Edit them at Admin → Intelligence → <Specialist> → Required Fields, or use the read-only roll-up at Admin → Required Fields.",
      replacement: {
        toggles: "PUT /api/admin/specialists/:id/field-toggles",
        prerequisites: "PUT /api/admin/specialists/:id/prerequisite-toggles",
        rollup: "GET /api/admin/specialists",
      },
    });
  });
}
