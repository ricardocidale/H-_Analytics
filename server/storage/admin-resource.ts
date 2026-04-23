/**
 * AdminResourceStorage — orchestrator for the admin-resources control plane.
 *
 * Spec: docs/architecture/resources-control-plane.md
 * Tables: admin_resources, admin_resource_versions,
 *         audit_break_glass_overrides, specialist_assignments,
 *         resource_health_checks
 *
 * Composition: this orchestrator wires five focused submodules under
 * `./admin-resource/` into the same flat public surface the pre-split
 * class exposed. Each submodule is a self-contained storage class that
 * uses the module-level `db` import, so there is no cross-module state.
 *
 * Submodules (./admin-resource/):
 *   - crud.ts                    — resource CRUD + version-on-write
 *   - versioning.ts              — list versions, append-only rollback
 *   - specialist-assignments.ts  — impact lookup + idempotent catalog sync
 *   - break-glass.ts             — break-glass override list/create/revoke
 *   - health-checks.ts           — probe persistence, freshness derivation,
 *                                  scheduler queue, admin Test rate limit
 *
 * The composition pattern mirrors `server/storage/intelligence/constants.ts`:
 * each submodule is instantiated once, and every prototype method is rebound
 * onto `this`. Combined with declaration merging on `AdminResourceStorage`,
 * callers (DatabaseStorage, route handlers, tests) see one flat surface that
 * matches the prior monolithic class verbatim — no signature changes
 * downstream.
 */
import { AdminResourceCrudStorage } from "./admin-resource/crud";
import { AdminResourceVersioningStorage } from "./admin-resource/versioning";
import { AdminResourceAssignmentsStorage } from "./admin-resource/specialist-assignments";
import { AdminResourceBreakGlassStorage } from "./admin-resource/break-glass";
import { AdminResourceHealthChecksStorage } from "./admin-resource/health-checks";
import { AdminResourceQualitySnapshotsStorage } from "./admin-resource/quality-snapshots";

export type {
  ResourceImpactEntry,
  UpdateAdminResourcePatch,
  CatalogSyncDeclaration,
  CatalogSyncResult,
} from "./admin-resource/types";

/**
 * Single source of truth for which submodules the orchestrator wires up.
 * Both the constructor below and the orchestrator audit test
 * (`tests/audit/admin-resource-orchestrator.test.ts`) iterate this list,
 * so adding a new submodule here automatically extends the runtime
 * composition AND the gate-time audit — no second place to update.
 */
export const ADMIN_RESOURCE_DOMAIN_FACTORIES = [
  () => new AdminResourceCrudStorage(),
  () => new AdminResourceVersioningStorage(),
  () => new AdminResourceAssignmentsStorage(),
  () => new AdminResourceBreakGlassStorage(),
  () => new AdminResourceHealthChecksStorage(),
  () => new AdminResourceQualitySnapshotsStorage(),
] as const;

export interface AdminResourceStorage
  extends AdminResourceCrudStorage,
    AdminResourceVersioningStorage,
    AdminResourceAssignmentsStorage,
    AdminResourceBreakGlassStorage,
    AdminResourceHealthChecksStorage,
    AdminResourceQualitySnapshotsStorage {}

export class AdminResourceStorage {
  constructor() {
    for (const factory of ADMIN_RESOURCE_DOMAIN_FACTORIES) {
      const instance = factory();
      const proto = Object.getPrototypeOf(instance) as object;
      for (const name of Object.getOwnPropertyNames(proto)) {
        if (name === "constructor") continue;
        const value = (proto as Record<string, unknown>)[name];
        if (typeof value !== "function") continue;
        (this as Record<string, unknown>)[name] = (value as (...a: unknown[]) => unknown).bind(instance);
      }
    }
  }
}
