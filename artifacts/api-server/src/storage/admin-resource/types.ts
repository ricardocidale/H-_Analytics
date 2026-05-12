/**
 * Shared type surface for the admin-resource storage submodules.
 *
 * Lives in its own file so each focused submodule under
 * `server/storage/admin-resource/` (crud, versioning, specialist-assignments,
 * break-glass, health-checks) can import only what it needs without pulling
 * the orchestrator file into its dependency graph.
 *
 * The orchestrator (`server/storage/admin-resource.ts`) re-exports these
 * types so existing callers can keep importing from the original module
 * path verbatim — nothing downstream had to change when the file was split.
 */
import type { ResourceKind } from "@workspace/db";

export interface ResourceImpactEntry {
  specialistId: string;
  assignmentKind: string;
  assignmentSlug: string;
  assignmentRole: string | null;
  required: boolean;
}

export interface UpdateAdminResourcePatch {
  displayName?: string;
  description?: string | null;
  config?: Record<string, unknown>;
  secretRef?: string | null;
  // Per-entity self-test cadence override (Task #1459). null clears the
  // override and falls back to the 30-day system default.
  selfTestIntervalDays?: number | null;
  changeSummary?: string;
}

export interface CatalogSyncDeclaration {
  specialistId: string;
  assignmentKind: ResourceKind;
  assignmentSlug: string;
  assignmentRole?: string | null;
  required: boolean;
}

export interface CatalogSyncResult {
  inserted: number;
  updated: number;
  removed: number;
  unresolvedSlugs: number;
}
