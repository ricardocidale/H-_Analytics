/**
 * Shared types for the SpecialistPage admin surface. Mirrors the response
 * shape of `server/routes/admin/specialists.ts` so the page and its tabs
 * can speak the same language without re-importing the wire format.
 */
import type {
  ResourcePublicView,
  ResourceHealthStatus,
  ProbeStatus,
  ResourceKind,
} from "@shared/schema";

export type Capability =
  | "required-fields"
  | "llm-config"
  | "resource-assignments"
  | "runtime"
  | "audit";
export type Subject =
  | "mgmt-co"
  | "property"
  | "photos"
  | "portfolio-ops"
  | "resources"
  | "constants";
export type Status = "built" | "needs-page" | "stub";
export type Gender = "male" | "female" | "neutral";

export interface SpecialistAssignmentView {
  kind: ResourceKind;
  slug: string;
  role: string | null;
  required: boolean;
  resource: ResourcePublicView | null;
  health: {
    status: ResourceHealthStatus;
    lastChecked: string | null;
    lastStatus: ProbeStatus | null;
  };
}

export interface SpecialistConfigView {
  specialistId: string;
  promptTemplate: string;
  modelResourceId: number | null;
  requiredFields: string[];
  /** Per-Specialist allow-list for requiredFields keys; null = no allow-list. */
  validRequiredFieldKeys: string[] | null;
  /** Per-candidate-field toggle state (catalog-keyed). */
  fieldRequirements: Record<string, "hard" | "recommended" | "off">;
  /** Per-prerequisite toggle state (catalog-keyed). */
  prerequisiteToggles: Record<string, boolean>;
  runtimeConfig: Record<string, unknown>;
  /** Effective scheduled-refresh cadence (override → catalog default → null). */
  refreshCadenceDays: number | null;
  /** Catalog baseline used when no override is set. */
  defaultRefreshCadenceDays: number | null;
  /** Whether the admin has set a per-Specialist cadence override. */
  refreshCadenceOverridden: boolean;
  /** Catalog candidate-field keys observed missing on the most recent run. */
  lastObservedMissing: string[];
  /** ISO timestamp of the run that produced lastObservedMissing, or null. */
  lastObservedMissingAt: string | null;
  version: number;
  updatedAt: string;
}

export interface SpecialistDetailResponse {
  definition: {
    id: string;
    letter: string;
    realName: string;
    displayName?: string;
    /** Persona first name (e.g. "Helena"). Mirrors catalog `humanName`. */
    humanName?: string;
    /** Pronoun set used by narration helpers. */
    gender?: Gender;
    description?: string;
    subject: Subject;
    capabilities: Capability[];
    status: Status;
    assignmentRefs: {
      kind: ResourceKind;
      slug: string;
      role?: string | null;
      required: boolean;
    }[];
    constantsOwned?: string[];
    defaultRefreshCadenceDays?: number | null;
    candidateFields?: { key: string; label: string; surface: string }[];
    prerequisites?: { id: string; label: string; description: string }[];
  };
  config: SpecialistConfigView;
  assignments: SpecialistAssignmentView[];
}

export interface SpecialistAuditEntry {
  id: number;
  version: number;
  section: "llm-config" | "required-fields" | "runtime";
  changeSummary: string | null;
  changedByUserId: number | null;
  changedAt: string;
  promptTemplate: string;
  modelResourceId: number | null;
  requiredFields: string[];
  runtimeConfig: Record<string, unknown>;
}
