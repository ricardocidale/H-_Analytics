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
  SpecialistGlobalLlmDefaults,
  SpecialistWorkflowOverrides,
} from "@shared/schema";

export type { SpecialistGlobalLlmDefaults, SpecialistWorkflowOverrides };

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
  /** N+1 multi-model orchestrator overrides. `null` ⇒ inherit global default. */
  analystAModelResourceId: number | null;
  analystBModelResourceId: number | null;
  synthesisModelResourceId: number | null;
  /** N+2 fallback model. */
  fallbackModelResourceId: number | null;
  /** Tri-state: true / false / null = inherit global. */
  multiModelEnabled: boolean | null;
  /** Per-Specialist tier-1 workflow overrides. */
  workflowOverrides: SpecialistWorkflowOverrides | null;
  /** Resolved global defaults to render as "Inheriting global default" placeholders. */
  globalLlmDefaults: SpecialistGlobalLlmDefaults;
  requiredFields: string[];
  /** Per-Specialist allow-list for requiredFields keys; null = no allow-list. */
  validRequiredFieldKeys: string[] | null;
  /** Per-candidate-field toggle state (catalog-keyed). */
  fieldRequirements: Record<string, "hard" | "recommended" | "off">;
  /**
   * Catalog-locked hard-required candidate keys. Always
   * persisted as "hard"; admins can neither demote them nor promote a
   * sibling to "hard". The Required Fields UI renders these rows
   * read-only with a "Locked by catalog" hint.
   */
  lockedHardKeys: string[];
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
    candidateFields?: { key: string; label: string; surface: string; lockedHard?: boolean; surfaceAnchor?: string }[];
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
  changedFieldLabels: string[];
  changedByUserId: number | null;
  changedAt: string;
  promptTemplate: string;
  modelResourceId: number | null;
  requiredFields: string[];
  runtimeConfig: Record<string, unknown>;
}
