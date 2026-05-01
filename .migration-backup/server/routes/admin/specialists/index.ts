/**
 * Admin Specialist REST surface (P5) — barrel.
 *
 * Spec: docs/architecture/resources-control-plane.md (Specialist page section)
 * Doctrine: replit.md "AI Research sidebar section" + "Wiring authority —
 *           code-only with break-glass" blocks (LOCKED 2026-04-21).
 *
 * Composes the per-resource sub-routers (Task #482 split):
 *   - catalog.ts   — list + detail
 *   - config.ts    — llm-config, required-fields, recommendation-event/stats,
 *                    field-toggles, prerequisite-toggles
 *   - runtime.ts   — runtime, cadence, probe
 *   - identity.ts  — identity GET/PUT/DELETE/history (Phase 3 #453)
 *   - audit.ts     — config version history
 *
 * Routes:
 *   GET  /api/admin/specialists                       — full catalog (with config status)
 *   GET  /api/admin/specialists/:id                   — definition + config + assignments-with-health
 *   PUT  /api/admin/specialists/:id/llm-config        — promptTemplate + modelResourceId
 *   PUT  /api/admin/specialists/:id/required-fields   — string[]
 *   PUT  /api/admin/specialists/:id/field-toggles     — Record<key,"hard"|"recommended"|"off">
 *   PUT  /api/admin/specialists/:id/prerequisite-toggles
 *   POST /api/admin/specialists/:id/recommendation-event
 *   GET  /api/admin/specialists/:id/recommendation-stats
 *   PUT  /api/admin/specialists/:id/runtime           — runtimeConfig jsonb
 *   PUT  /api/admin/specialists/:id/cadence           — Constants Specialists only
 *   POST /api/admin/specialists/:id/probe             — dry-run "Test agent"
 *   GET  /api/admin/specialists/:id/identity          — Phase 3 (#453)
 *   PUT  /api/admin/specialists/:id/identity
 *   DELETE /api/admin/specialists/:id/identity
 *   GET  /api/admin/specialists/:id/identity/history
 *   GET  /api/admin/specialists/:id/audit             — config version history
 *
 * Read-only rule: there is intentionally NO route to relink resource
 * assignments through the Specialist surface. Assignments are code-only
 * (Specialist catalog → catalog-sync → specialist_assignments). Edits
 * happen on the canonical Resources pages; incident reroutes go through
 * the break-glass override route family in `resources.ts`.
 */
import type { Express } from "express";
import { registerCatalogRoutes } from "./catalog";
import { registerConfigRoutes } from "./config";
import { registerRuntimeRoutes } from "./runtime";
import { registerIdentityRoutes } from "./identity";
import { registerAuditRoutes } from "./audit";

// Re-export the helper consumed by `server/routes/global-assumptions.ts`
// and `server/routes/properties.ts` via `await import("./admin/specialists")`.
// The dynamic import path resolves to this barrel, so the export must be
// preserved here for backward compatibility.
export { deriveHardRequiredFieldKeys } from "./_shared";

export function registerAdminSpecialistRoutes(app: Express) {
  registerCatalogRoutes(app);
  registerConfigRoutes(app);
  registerRuntimeRoutes(app);
  registerIdentityRoutes(app);
  registerAuditRoutes(app);
}
