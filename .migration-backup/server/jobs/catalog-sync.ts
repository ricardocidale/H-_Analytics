/**
 * catalog-sync — materialize the Specialist catalog into the
 * `specialist_assignments` table.
 *
 * The catalog (`engine/analyst/registry/specialist-catalog.ts`) is the single
 * source of truth for which canonical Resources each Specialist needs. This
 * job flattens every catalog entry's `assignmentRefs` into a row per
 * (specialistId, kind, slug, role), resolves slugs to admin_resources rows,
 * and reconciles the table: insert new declarations, update changed ones,
 * remove rows the catalog no longer mentions.
 *
 * The job is intentionally idempotent — running it twice in a row produces
 * the same DB state and the second run reports zero inserts/updates/removes.
 * It is invoked on demand via `POST /api/admin/specialist-catalog/sync` and
 * (later, P3+) on app startup.
 */
import { SPECIALIST_CATALOG } from "../../engine/analyst/registry/specialist-catalog";
import type {
  CatalogSyncDeclaration,
  CatalogSyncResult,
} from "../storage/admin-resource";
import type { SpecialistDefinition } from "@shared/schema";
import { storage } from "../storage";

/**
 * Flatten the in-code catalog into the row-shape the storage layer expects.
 * Pure function; no I/O — used by both production callers and tests.
 */
export function flattenCatalogDeclarations(
  catalog: readonly SpecialistDefinition[] = SPECIALIST_CATALOG,
): CatalogSyncDeclaration[] {
  const out: CatalogSyncDeclaration[] = [];
  for (const def of catalog) {
    for (const ref of def.assignmentRefs) {
      out.push({
        specialistId: def.id,
        assignmentKind: ref.kind,
        assignmentSlug: ref.slug,
        assignmentRole: ref.role ?? null,
        required: ref.required,
      });
    }
  }
  return out;
}

/**
 * Production entrypoint. Reads the in-code catalog, flattens it, and writes
 * the diff into `specialist_assignments`. Returns counts so callers can log
 * or surface them in an admin response.
 */
export async function syncSpecialistCatalog(
  catalog: readonly SpecialistDefinition[] = SPECIALIST_CATALOG,
): Promise<CatalogSyncResult> {
  const declarations = flattenCatalogDeclarations(catalog);
  return storage.syncSpecialistCatalog(declarations);
}

export interface CatalogConnectionsBackfillResult extends CatalogSyncResult {
  /** New rows added to `resource_specialist_connections`. */
  connectionsInserted: number;
}

/**
 * End-to-end "light up the Sources tab" pass. Runs in two steps:
 *
 *   1. `syncSpecialistCatalog` — refresh `specialist_assignments` from the
 *      in-code catalog. This both inserts new declarations and re-resolves
 *      slugs to admin_resources rows (so a freshly created resource picks
 *      up its `resource_id` link).
 *   2. `backfillConnectionsFromCatalog` — copy any newly-resolved
 *      assignment rows into `resource_specialist_connections` so the
 *      Sources tab on each Specialist page renders the catalog wiring
 *      without manual setup.
 *
 * Both steps are idempotent. Safe to call at boot, after a resource is
 * created, or from an admin endpoint. Returns combined counts so callers
 * can log meaningful telemetry (e.g. "+3 catalog rows, +2 connections").
 */
export async function backfillCatalogConnections(
  catalog: readonly SpecialistDefinition[] = SPECIALIST_CATALOG,
): Promise<CatalogConnectionsBackfillResult> {
  const sync = await syncSpecialistCatalog(catalog);
  const connectionsInserted = await storage.backfillConnectionsFromCatalog();
  return { ...sync, connectionsInserted };
}
