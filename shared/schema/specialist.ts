/**
 * Specialist registry contracts.
 *
 * Spec: docs/architecture/resources-control-plane.md
 * Doctrine: replit.md "AI Research sidebar section" + "Specialist page tab
 *           catalog" blocks (LOCKED 2026-04-21).
 *
 * The Specialist catalog (`engine/analyst/registry/specialist-catalog.ts`)
 * is the single source of truth for: which Specialists exist, what subject
 * each belongs to (sidebar grouping), what page tabs each renders
 * (capabilities), and what canonical Resources each is wired to
 * (assignmentRefs).
 *
 * The catalog is git-reviewable code. Adding/removing a Specialist or
 * changing its assignments requires a code edit + PR + deploy. A super-
 * admin-only audited time-boxed break-glass override (P2) exists for
 * incident reroute.
 *
 * P1 scope: types + the catalog declaration. No DB persistence yet (P2
 * adds the materialization job and the specialist_assignments join table).
 */

import { z } from "zod";
import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import {
  AssignmentRefSchema,
  assignmentRefKey,
  adminResources,
  type AssignmentRef,
} from "./admin-resource";
import { users } from "./auth";

// ────────────────────────────────────────────────────────────────────────────
// Subject — top-level grouping inside AI Research's collapsible 2-level tree.
// ────────────────────────────────────────────────────────────────────────────

export const SUBJECTS = [
  "mgmt-co",
  "property",
  "photos",
  "portfolio-ops",
  "constants",
  "resources",
] as const;
export type Subject = typeof SUBJECTS[number];
export const SubjectSchema = z.enum(SUBJECTS);

export const SUBJECT_LABELS: Record<Subject, string> = {
  "mgmt-co": "Management Company",
  property: "Property",
  photos: "Photos",
  "portfolio-ops": "Portfolio Ops",
  constants: "Constants & Authority Sources",
  resources: "Resource Builder",
};

// ────────────────────────────────────────────────────────────────────────────
// Specialist letter — stable display identifier. Survives renaming the real
// name. Letters are assigned in registration order; do NOT reshuffle when
// adding new Specialists (append at the next free letter).
// ────────────────────────────────────────────────────────────────────────────

export const SPECIALIST_LETTERS = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "J",
  "K",
  "L",
  "M",
  "N",
  "O",
] as const;
export type SpecialistLetter = typeof SPECIALIST_LETTERS[number];
export const SpecialistLetterSchema = z.enum(SPECIALIST_LETTERS);

// ────────────────────────────────────────────────────────────────────────────
// SpecialistCapability — declares which tabs the Specialist's page renders.
// A page renders a tab iff the Specialist declares the matching capability.
// ────────────────────────────────────────────────────────────────────────────

export const SPECIALIST_CAPABILITIES = [
  "required-fields",
  "llm-config",
  "resource-assignments",
  "runtime",
  "audit",
  "per-resource-overrides",
] as const;
export type SpecialistCapability = typeof SPECIALIST_CAPABILITIES[number];
export const SpecialistCapabilitySchema = z.enum(SPECIALIST_CAPABILITIES);

export const CAPABILITY_LABELS: Record<SpecialistCapability, string> = {
  "required-fields": "Required Fields",
  "llm-config": "LLM Config",
  "resource-assignments": "Resource Assignments",
  runtime: "Runtime / Triggers",
  audit: "Audit",
  "per-resource-overrides": "Per-Resource Overrides",
};

// ────────────────────────────────────────────────────────────────────────────
// SpecialistDefinition — the single registry entry per Specialist.
// ────────────────────────────────────────────────────────────────────────────

export const SpecialistDefinitionSchema = z
  .object({
    id: z.string().min(1).regex(/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/, {
      message: "Specialist id must be dotted-kebab-case (e.g. mgmt-co.funding)",
    }),
    letter: SpecialistLetterSchema,
    realName: z.string().min(1),
    /**
     * User-facing display name for sidebar labels and page headers. Defaults
     * to `realName` when absent. Set this when a marketing-quality name is
     * preferred over the engineering shorthand.
     */
    displayName: z.string().min(1).optional(),
    /**
     * Humanized first name for the Specialist persona. The orchestrator
     * (Gaspar) and the 12 Specialists use first names in narration and
     * activity logs to make the engine feel like a team rather than a
     * faceless pipeline. The persona is fixed in the catalog — admins
     * cannot rename a Specialist at runtime (that would corrupt the
     * activity-log narrative across the audit history).
     */
    humanName: z.string().min(1).max(40),
    /**
     * Persona gender. Used by `engine/analyst/identity.ts` and the log
     * prefix helper to drive pronoun selection in narration. The
     * orchestrator Gaspar is male; the 12 Specialists are female today.
     * `"neutral"` is reserved for future personas (a Specialist whose
     * persona prefers they/them, or an automated tool persona surfaced
     * in narration without a gendered pronoun).
     */
    gender: z.enum(["male", "female", "neutral"]),
    /**
     * 1–2 sentence plain-language description of what the agent does and the
     * value it delivers. Rendered under the Specialist page header and used
     * as the sidebar tooltip where supported.
     */
    description: z.string().min(1).max(400).optional(),
    subject: SubjectSchema,
    capabilities: z.array(SpecialistCapabilitySchema).min(1),
    assignmentRefs: z.array(AssignmentRefSchema),
    /**
     * Registry keys (from `shared/model-constants-registry.ts`) that this
     * Specialist owns. A Specialist owns a Constant iff it is the sole
     * authority allowed to write the corresponding `model_constant_overrides`
     * row with `source = 'analyst'`. The catalog enforces uniqueness — every
     * registry key has at most one owning Specialist (Phase 1 doctrine).
     *
     * Empty/omitted for non-Constants Specialists (e.g. mgmt-co, property,
     * photos, portfolio-ops). Required-but-empty is allowed; absence is
     * semantically the same as `[]`.
     */
    constantsOwned: z.array(z.string().min(1)).optional(),
    /**
     * Candidate fields the Specialist could require. Admins toggle these on or
     * off (and pick "hard-required" vs "recommended") on the Required Fields
     * tab. The catalog is the SOLE place where new candidates can appear —
     * admins cannot add free-form keys. Each entry pairs the field key (the
     * draft/payload key the form writes to) with a human label and the
     * "owning surface" so the roll-up page can group rows by surface.
     */
    candidateFields: z
      .array(
        z.object({
          key: z.string().min(1),
          label: z.string().min(1),
          surface: z.enum([
            "company-assumptions",
            "property-edit",
            "market-macro",
            "constants",
            "defaults",
          ]),
          /**
           * Catalog-locked hard-required marker. When `true`, this field is
           * hard-required for the Specialist to run AND admins cannot demote
           * it (or promote a non-locked field to "hard"). The minimum
           * requirements are a product/engineering decision and live here in
           * the catalog — the admin Required Fields UI renders these rows
           * read-only with a "Locked by catalog" hint, and the
           * `/field-toggles` endpoint rejects payloads that attempt to
           * change them.
           */
          lockedHard: z.boolean().optional(),
          /**
           * Optional sub-anchor inside the surface so the
           * `MissingRequiredFieldsPrompt` deep-link can land the user on the
           * exact tab/section. The frontend `resolveCandidateFieldNavTarget`
           * helper interprets this together with `surface` and the entity
           * context. Omitted = land at the surface root.
           */
          surfaceAnchor: z.string().min(1).max(80).optional(),
          /**
           * Optional verdict-field id this candidate corresponds to. When
           * present, the Specialist's `VerdictDimension.field` for this
           * dimension will use this value (the form-anchor id the Adjust
           * deep-link scrolls to) rather than `key` (the dispatch / payload
           * key that the required-fields gate evaluates against). When
           * absent, `key` is itself the verdict-field id (the common case —
           * payload key and form-anchor are the same string).
           *
           * Why this exists: a Specialist can legitimately gate on one key
           * and emit a verdict whose deep-link scrolls to a different field
           * id. For example, the Funding Specialist gates on
           * `runwayBufferMonths` (a numeric assumption in
           * `CapitalRaiseInputs`) but its Adjust deep-link points the user
           * at `capitalRaise1Amount` (the dollar-amount form input that
           * derives the buffer). The candidate-field parity test
           * (`tests/analyst/voice/field-registry-parity.test.ts`) reads
           * `verdictField ?? key` to decide whether a Specialist's tracked
           * verdict-field id is admin-promotable to required.
           */
          verdictField: z.string().min(1).max(120).optional(),
        }),
      )
      .optional(),
    /**
     * Prerequisite condition ids this Specialist may enforce. Each id MUST
     * appear in `engine/analyst/registry/prerequisites.ts`. Admins toggle
     * each on/off via the Required Fields tab. New conditions are added in
     * the library + here, never by admins.
     */
    prerequisites: z.array(z.string().min(1)).optional(),
    /**
     * Default cadence (in days) at which the scheduled Constants refresh job
     * (`server/jobs/specialist-constants-refresh.ts`) re-runs this Specialist
     * across every (constantKey × locality) row it owns. Authority sources
     * publish on different rhythms — IRS annually, central banks weekly /
     * monthly — so each Specialist declares its own cadence rather than
     * inheriting a global one. Omitted/`null` means "no scheduled refresh"
     * (admins still trigger refreshes on demand).
     */
    refreshCadenceDays: z.number().int().positive().optional(),
    status: z.enum(["built", "needs-page", "stub"]),
  })
  .refine(
    (def) => new Set(def.capabilities).size === def.capabilities.length,
    { message: "Specialist capabilities must be unique" },
  )
  .refine(
    (def) => {
      const seen = new Set<string>();
      for (const ref of def.assignmentRefs) {
        const key = assignmentRefKey(ref);
        if (seen.has(key)) return false;
        seen.add(key);
      }
      return true;
    },
    { message: "Specialist assignmentRefs must be unique by (kind, slug, role)" },
  );
export type SpecialistDefinition = z.infer<typeof SpecialistDefinitionSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Display helpers
// ────────────────────────────────────────────────────────────────────────────

export function specialistDisplayLabel(def: SpecialistDefinition): string {
  return `Specialist ${def.letter} — ${def.realName}`;
}

/** User-facing display name (falls back to realName). */
export function specialistDisplayName(def: SpecialistDefinition): string {
  return def.displayName ?? def.realName;
}

/**
 * Persona label used in narration and activity logs:
 *   "Helena (Tax Authority Research)"
 * The persona name comes from the catalog and never changes at runtime.
 */
export function specialistPersonaLabel(def: SpecialistDefinition): string {
  return `${def.humanName} (${specialistDisplayName(def)})`;
}

export function specialistHasCapability(
  def: SpecialistDefinition,
  capability: SpecialistCapability,
): boolean {
  return def.capabilities.includes(capability);
}

export function assignmentRefsByKind(
  def: SpecialistDefinition,
): Map<AssignmentRef["kind"], AssignmentRef[]> {
  const out = new Map<AssignmentRef["kind"], AssignmentRef[]>();
  for (const ref of def.assignmentRefs) {
    const existing = out.get(ref.kind) ?? [];
    existing.push(ref);
    out.set(ref.kind, existing);
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// SpecialistWorkflowOverrides — per-Specialist overrides for the Tier-1
// pipeline policy knobs. Mirrors the field set on the global Pipeline
// Policies form. Every field is independently nullable so a Specialist
// can override one knob (e.g. shorter staleness) without re-stating the
// rest. Absent / null ⇒ inherit the global default at resolution time.
// ────────────────────────────────────────────────────────────────────────────

export const SpecialistWorkflowOverridesSchema = z.object({
  stalenessThresholdHours: z.number().int().min(0).max(8760).nullable().optional(),
  maxConcurrentRuns: z.number().int().min(1).max(20).nullable().optional(),
  dailyTokenBudget: z.number().int().min(0).max(10_000_000).nullable().optional(),
  monthlyTokenBudget: z.number().int().min(0).max(100_000_000).nullable().optional(),
  relaxationMaxLevel: z.number().int().min(0).max(5).nullable().optional(),
  minEvidenceScore: z.number().min(0).max(1).nullable().optional(),
  minCompCount: z.number().int().min(0).max(50).nullable().optional(),
  autoRefreshIntervalHours: z.number().int().min(1).max(8760).nullable().optional(),
});
export type SpecialistWorkflowOverrides = z.infer<typeof SpecialistWorkflowOverridesSchema>;

/** Workflow override field keys exposed to the UI banner / audit renderer. */
export const SPECIALIST_WORKFLOW_OVERRIDE_KEYS = [
  "stalenessThresholdHours",
  "maxConcurrentRuns",
  "dailyTokenBudget",
  "monthlyTokenBudget",
  "relaxationMaxLevel",
  "minEvidenceScore",
  "minCompCount",
  "autoRefreshIntervalHours",
] as const satisfies readonly (keyof SpecialistWorkflowOverrides)[];

// ════════════════════════════════════════════════════════════════════════════
// P5 — DRIZZLE TABLES (per-Specialist mutable config the admin edits in the
// Specialist page). The catalog declares what's wired (and is code-only); this
// table holds the runtime knobs (prompt, model assignment, required-field
// subset, runtime triggers) the admin tweaks without a code deploy.
//
// Resource ASSIGNMENTS remain code-only (Specialist catalog → catalog-sync →
// specialist_assignments). The Specialist page is read-only for assignments;
// edits happen on the canonical Resources pages. The break-glass override
// surface (P2) is the only runtime alternative for re-routing.
// ════════════════════════════════════════════════════════════════════════════

export const specialistConfigs = pgTable(
  "specialist_configs",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    specialistId: text("specialist_id").notNull(),
    promptTemplate: text("prompt_template").notNull().default(""),
    modelResourceId: integer("model_resource_id").references(() => adminResources.id, { onDelete: "set null" }),
    /**
     * Per-Specialist N+1 multi-model orchestrator overrides. All nullable so
     * `null` ⇒ inherit the global default. (analystAModel, analystBModel) is
     * the dual-panel; synthesisModel is the +1 reconciler; fallback is N+2.
     */
    analystAModelResourceId: integer("analyst_a_model_resource_id").references(() => adminResources.id, { onDelete: "set null" }),
    analystBModelResourceId: integer("analyst_b_model_resource_id").references(() => adminResources.id, { onDelete: "set null" }),
    synthesisModelResourceId: integer("synthesis_model_resource_id").references(() => adminResources.id, { onDelete: "set null" }),
    fallbackModelResourceId: integer("fallback_model_resource_id").references(() => adminResources.id, { onDelete: "set null" }),
    /** Tri-state: true / false / null = inherit global. */
    multiModelEnabled: boolean("multi_model_enabled"),
    /**
     * Per-Specialist overrides for the Tier-1 pipeline policy knobs. Stored
     * as a JSON object so the column is forward-compatible with new knobs
     * without a migration. Keys with `null` (or absent) inherit the global
     * pipeline policy. See `SpecialistWorkflowOverridesSchema`.
     */
    workflowOverrides: jsonb("workflow_overrides").$type<SpecialistWorkflowOverrides | null>(),
    requiredFields: jsonb("required_fields").notNull().$type<string[]>().default([]),
    /**
     * Per-candidate-field toggle state. Keyed by the catalog `candidateFields[].key`.
     * Values: "hard" (gate aborts when missing), "recommended" (visible on
     * Required Fields tab + the per-surface panel, but does not gate the
     * run), or "off" (default — equivalent to absence). The catalog is the
     * sole source of valid keys.
     */
    fieldRequirements: jsonb("field_requirements").notNull().$type<Record<string, "hard" | "recommended" | "off">>().default({}),
    /**
     * Per-prerequisite toggle state. Keyed by `engine/analyst/registry/prerequisites.ts`
     * id. True = the prerequisite is enforced before this Specialist runs.
     * Absent / false = unenforced.
     */
    prerequisiteToggles: jsonb("prerequisite_toggles").notNull().$type<Record<string, boolean>>().default({}),
    runtimeConfig: jsonb("runtime_config").notNull().$type<Record<string, unknown>>().default({}),
    /**
     * Admin override for the scheduled Constants refresh cadence (in days).
     * Null means "no override" — the scheduler falls back to the catalog
     * default declared in `engine/analyst/registry/specialist-catalog.ts`
     * (`refreshCadenceDays`). Only meaningful for Constants Specialists
     * that own one or more registry keys.
     */
    refreshCadenceDays: integer("refresh_cadence_days"),
    /**
     * Candidate-field keys that the most recent Specialist run observed as
     * "missing but materially useful" — i.e. catalog `candidateFields[].key`
     * entries that are currently toggled "off" yet were absent from the
     * payload at run time. The Required Fields tab surfaces these as
     * one-click "promote to Recommended / Hard-required" recommendations.
     *
     * This is run-time telemetry, NOT admin config: writes do NOT bump
     * `version`, do NOT snapshot to `specialist_config_versions`, and do
     * NOT appear in the Audit tab. Each run overwrites the prior list.
     */
    lastObservedMissing: jsonb("last_observed_missing").notNull().$type<string[]>().default([]),
    /** Wallclock of the run that produced `lastObservedMissing`. */
    lastObservedMissingAt: timestamp("last_observed_missing_at"),
    version: integer("version").notNull().default(1),
    updatedByUserId: integer("updated_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("specialist_configs_specialist_uniq").on(t.specialistId),
  ],
);

export type SpecialistConfigRow = typeof specialistConfigs.$inferSelect;

// Append-only history; powers the Specialist Audit tab.
export const specialistConfigVersions = pgTable(
  "specialist_config_versions",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    specialistId: text("specialist_id").notNull(),
    version: integer("version").notNull(),
    section: text("section").notNull(), // "llm-config" | "required-fields" | "runtime"
    promptTemplate: text("prompt_template").notNull().default(""),
    modelResourceId: integer("model_resource_id").references(() => adminResources.id, { onDelete: "set null" }),
    analystAModelResourceId: integer("analyst_a_model_resource_id").references(() => adminResources.id, { onDelete: "set null" }),
    analystBModelResourceId: integer("analyst_b_model_resource_id").references(() => adminResources.id, { onDelete: "set null" }),
    synthesisModelResourceId: integer("synthesis_model_resource_id").references(() => adminResources.id, { onDelete: "set null" }),
    fallbackModelResourceId: integer("fallback_model_resource_id").references(() => adminResources.id, { onDelete: "set null" }),
    multiModelEnabled: boolean("multi_model_enabled"),
    workflowOverrides: jsonb("workflow_overrides").$type<SpecialistWorkflowOverrides | null>(),
    requiredFields: jsonb("required_fields").notNull().$type<string[]>().default([]),
    fieldRequirements: jsonb("field_requirements").notNull().$type<Record<string, "hard" | "recommended" | "off">>().default({}),
    prerequisiteToggles: jsonb("prerequisite_toggles").notNull().$type<Record<string, boolean>>().default({}),
    runtimeConfig: jsonb("runtime_config").notNull().$type<Record<string, unknown>>().default({}),
    refreshCadenceDays: integer("refresh_cadence_days"),
    changeSummary: text("change_summary"),
    changedByUserId: integer("changed_by_user_id").references(() => users.id, { onDelete: "set null" }),
    changedAt: timestamp("changed_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("specialist_config_versions_uniq").on(t.specialistId, t.version),
    index("specialist_config_versions_specialist_idx").on(t.specialistId),
  ],
);

export type SpecialistConfigVersionRow = typeof specialistConfigVersions.$inferSelect;

// ────────────────────────────────────────────────────────────────────────────
// API contracts for Specialist routes
// ────────────────────────────────────────────────────────────────────────────

export const SpecialistConfigSection = z.enum([
  "llm-config",
  "required-fields",
  "field-toggles",
  "prerequisite-toggles",
  "runtime",
  "cadence",
]);
export type SpecialistConfigSectionType = z.infer<typeof SpecialistConfigSection>;

export const updateLlmConfigSchema = z.object({
  promptTemplate: z.string().max(20_000),
  modelResourceId: z.number().int().positive().nullable(),
  /** N+1 multi-model orchestrator overrides. `null` ⇒ inherit global default. */
  analystAModelResourceId: z.number().int().positive().nullable().optional(),
  analystBModelResourceId: z.number().int().positive().nullable().optional(),
  synthesisModelResourceId: z.number().int().positive().nullable().optional(),
  /** N+2 fallback model. `null` ⇒ inherit global default. */
  fallbackModelResourceId: z.number().int().positive().nullable().optional(),
  /** Tri-state multi-model toggle. `null` ⇒ inherit global default. */
  multiModelEnabled: z.boolean().nullable().optional(),
  /**
   * Workflow-policy overrides. Send `null` to clear all overrides; send an
   * object to merge field-by-field (omitted / null fields inherit global).
   */
  workflowOverrides: SpecialistWorkflowOverridesSchema.nullable().optional(),
  changeSummary: z.string().max(500).optional(),
});
export type UpdateLlmConfigInput = z.infer<typeof updateLlmConfigSchema>;

export const updateRequiredFieldsSchema = z.object({
  fields: z.array(z.string().min(1).max(100)).max(200),
  changeSummary: z.string().max(500).optional(),
});
export type UpdateRequiredFieldsInput = z.infer<typeof updateRequiredFieldsSchema>;

export const updateRuntimeSchema = z.object({
  runtimeConfig: z.record(z.string(), z.unknown()),
  changeSummary: z.string().max(500).optional(),
});
export type UpdateRuntimeInput = z.infer<typeof updateRuntimeSchema>;

/**
 * Per-Specialist override for the scheduled Constants refresh cadence.
 * `refreshCadenceDays = null` clears the override and falls back to the
 * catalog default. Positive integer values cap at 3650 (10 years) to
 * keep the input sane and prevent accidental "never refresh" rows that
 * silently disable the scheduler.
 */
/**
 * Per-Specialist field toggle update. Body shape:
 *   { fieldRequirements: { [fieldKey]: "hard"|"recommended"|"off" } }
 *
 * The route validates each fieldKey against the Specialist's catalog
 * `candidateFields[]` declaration — keys outside the candidate set are
 * rejected. Admins cannot add free-form keys; only flip switches.
 */
export const updateFieldTogglesSchema = z.object({
  fieldRequirements: z.record(
    z.string().min(1),
    z.enum(["hard", "recommended", "off"]),
  ),
  changeSummary: z.string().max(500).optional(),
});
export type UpdateFieldTogglesInput = z.infer<typeof updateFieldTogglesSchema>;

/**
 * Per-Specialist prerequisite toggle update. Body shape:
 *   { prerequisiteToggles: { [prereqId]: boolean } }
 */
export const updatePrerequisiteTogglesSchema = z.object({
  prerequisiteToggles: z.record(z.string().min(1), z.boolean()),
  changeSummary: z.string().max(500).optional(),
});
export type UpdatePrerequisiteTogglesInput = z.infer<typeof updatePrerequisiteTogglesSchema>;

export const updateCadenceSchema = z.object({
  refreshCadenceDays: z.number().int().positive().max(3650).nullable(),
  changeSummary: z.string().max(500).optional(),
});
export type UpdateCadenceInput = z.infer<typeof updateCadenceSchema>;

/**
 * Snapshot of the global defaults that the LLM Config tab shows as the
 * "Inheriting global default" placeholder for each overridable field.
 * Pulled from the global pipeline policies + N+1 orchestrator constants
 * server-side so the UI doesn't have to re-resolve them per render.
 */
export const SpecialistGlobalLlmDefaultsSchema = z.object({
  multiModelEnabled: z.boolean(),
  analystAModelLabel: z.string().nullable(),
  analystBModelLabel: z.string().nullable(),
  synthesisModelLabel: z.string().nullable(),
  fallbackModelLabel: z.string().nullable(),
  /** DB-persisted global N+1 resource IDs (null = unset, UI shows HARDCODED_LLM_DEFAULTS placeholder). */
  analystAModelResourceId: z.number().int().nullable(),
  analystBModelResourceId: z.number().int().nullable(),
  synthesisModelResourceId: z.number().int().nullable(),
  fallbackModelResourceId: z.number().int().nullable(),
  workflow: z.object({
    stalenessThresholdHours: z.number().int().nullable(),
    maxConcurrentRuns: z.number().int().nullable(),
    dailyTokenBudget: z.number().int().nullable(),
    monthlyTokenBudget: z.number().int().nullable(),
    relaxationMaxLevel: z.number().int().nullable(),
    minEvidenceScore: z.number().nullable(),
    minCompCount: z.number().int().nullable(),
    autoRefreshIntervalHours: z.number().int().nullable(),
  }),
});
export type SpecialistGlobalLlmDefaults = z.infer<typeof SpecialistGlobalLlmDefaultsSchema>;

export const SpecialistConfigPublicViewSchema = z.object({
  specialistId: z.string(),
  promptTemplate: z.string(),
  modelResourceId: z.number().int().nullable(),
  /** N+1 multi-model orchestrator overrides. `null` ⇒ inherit global default. */
  analystAModelResourceId: z.number().int().nullable(),
  analystBModelResourceId: z.number().int().nullable(),
  synthesisModelResourceId: z.number().int().nullable(),
  fallbackModelResourceId: z.number().int().nullable(),
  multiModelEnabled: z.boolean().nullable(),
  workflowOverrides: SpecialistWorkflowOverridesSchema.nullable(),
  /** Resolved global defaults shown as inherit placeholders in the UI. */
  globalLlmDefaults: SpecialistGlobalLlmDefaultsSchema,
  requiredFields: z.array(z.string()),
  /**
   * Per-Specialist allow-list for `requiredFields` keys, or `null` when
   * the Specialist has no allow-list wired (any string accepted). When
   * non-null, the admin PUT route rejects fields outside this list and the
   * UI surfaces them as helper text. See
   * engine/analyst/registry/required-field-keys.ts for the source of truth.
   */
  validRequiredFieldKeys: z.array(z.string()).nullable(),
  /**
   * Per-candidate-field toggle state. Keys come from the catalog
   * `candidateFields[].key`. Absent keys are equivalent to `"off"`.
   */
  fieldRequirements: z.record(z.string(), z.enum(["hard", "recommended", "off"])),
  /**
   * catalog-locked hard-required candidate keys. The admin
   * Required Fields tab renders rows with these keys read-only ("Hard
   * required (locked by catalog)") and disables any UI that would attempt
   * to demote them or promote a sibling to "hard". Always a subset of
   * `candidateFields[].key` from the catalog.
   */
  lockedHardKeys: z.array(z.string()),
  /**
   * Per-prerequisite toggle state. Keys come from the catalog
   * `prerequisites[]`. Absent keys are equivalent to `false`.
   */
  prerequisiteToggles: z.record(z.string(), z.boolean()),
  runtimeConfig: z.record(z.string(), z.unknown()),
  /**
   * Recommended model slugs by pipeline role, derived from the vendor roster
   * recommendation matrix (`.claude/rules/llm-vendor-roster.md`). The LLM
   * Config tab highlights model dropdowns whose selected resource slug matches
   * the recommendation with a "Recommended" badge. Null values mean no
   * recommendation is defined for that role.
   */
  recommendedModelSlugs: z.object({
    primary: z.string().nullable(),
    analystA: z.string().nullable(),
    analystB: z.string().nullable(),
    synthesis: z.string().nullable(),
    fallback: z.string().nullable(),
  }),
  /**
   * Effective scheduled-refresh cadence (in days) for this Specialist's
   * Constants research. Resolved as `override ?? catalog default`. Null
   * when neither the override nor the catalog declares a cadence — i.e.
   * the Specialist is not a Constants Specialist.
   */
  refreshCadenceDays: z.number().int().positive().nullable(),
  /** Catalog default cadence (read-only baseline used when override is null). */
  defaultRefreshCadenceDays: z.number().int().positive().nullable(),
  /** Whether the admin has set a per-Specialist cadence override. */
  refreshCadenceOverridden: z.boolean(),
  /**
   * Candidate-field keys observed missing on the most recent Specialist
   * run. The Required Fields tab renders these as one-click "promote to
   * Recommended / Hard-required" recommendations. Always a subset of the
   * Specialist's catalog `candidateFields[].key` set.
   */
  lastObservedMissing: z.array(z.string()),
  /** ISO timestamp of the run that produced `lastObservedMissing`, or null. */
  lastObservedMissingAt: z.string().nullable(),
  version: z.number().int().min(1),
  updatedAt: z.string(),
});
export type SpecialistConfigPublicView = z.infer<typeof SpecialistConfigPublicViewSchema>;

// ════════════════════════════════════════════════════════════════════════════
// Phase 3 — Admin-editable Specialist identity (humanName + gender)
//
// The catalog is the factory default. Admins may override per Specialist
// without a code deploy via the SpecialistPage Identity tab. The override
// row is single-row-per-specialistId; absence ⇒ catalog wins. The orchestrator
// "gaspar" is editable through the same routes (its catalog default lives in
// `engine/analyst/identity.ts`, not the SPECIALIST_CATALOG).
//
// Audit trail lives in `specialist_identity_override_versions` — a focused
// append-only table. Every PUT/DELETE writes a snapshot row so the audit
// footer can render "Last edited by X on Y" and (eventually) a diff view.
// ════════════════════════════════════════════════════════════════════════════

export const specialistIdentityOverrides = pgTable(
  "specialist_identity_overrides",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    specialistId: text("specialist_id").notNull(),
    humanName: text("human_name"),
    gender: text("gender").$type<"male" | "female" | "neutral">(),
    updatedByUserId: integer("updated_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("specialist_identity_overrides_uniq").on(t.specialistId),
  ],
);
export type SpecialistIdentityOverrideRow = typeof specialistIdentityOverrides.$inferSelect;

export const specialistIdentityOverrideVersions = pgTable(
  "specialist_identity_override_versions",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    specialistId: text("specialist_id").notNull(),
    /** "upsert" when a value was set/changed, "reset" when cleared. */
    action: text("action").notNull(),
    prevHumanName: text("prev_human_name"),
    prevGender: text("prev_gender"),
    nextHumanName: text("next_human_name"),
    nextGender: text("next_gender"),
    changeSummary: text("change_summary"),
    changedByUserId: integer("changed_by_user_id").references(() => users.id, { onDelete: "set null" }),
    changedAt: timestamp("changed_at").defaultNow().notNull(),
  },
  (t) => [
    index("specialist_identity_versions_specialist_idx").on(t.specialistId),
  ],
);
export type SpecialistIdentityOverrideVersionRow = typeof specialistIdentityOverrideVersions.$inferSelect;

export const SpecialistGenderSchema = z.enum(["male", "female", "neutral"]);
export type SpecialistGender = z.infer<typeof SpecialistGenderSchema>;

/**
 * Identity-override patch. Each field is independently nullable: `null`
 * clears that field's override (factory default wins), a string/enum value
 * sets it. `undefined` is rejected by the route — admins always submit both
 * fields explicitly so the audit row records both sides of the diff.
 */
export const updateSpecialistIdentitySchema = z.object({
  humanName: z.string().min(1).max(40).nullable(),
  gender: SpecialistGenderSchema.nullable(),
  changeSummary: z.string().max(500).optional(),
});
export type UpdateSpecialistIdentityInput = z.infer<typeof updateSpecialistIdentitySchema>;

export const SpecialistIdentityPublicViewSchema = z.object({
  specialistId: z.string(),
  /** Catalog factory defaults — never change at runtime. */
  catalog: z.object({
    humanName: z.string(),
    gender: SpecialistGenderSchema,
  }),
  /** Admin override (null when no override exists). */
  override: z
    .object({
      // .min(1) mirrors `updateSpecialistIdentitySchema` so a stray empty
      // string in the table (manual SQL, future migration drift) is
      // rejected on read instead of silently rendering "In effect: " with
      // no name in the admin header. The route layer must canonicalize
      // "" → null on write to keep this contract honest.
      humanName: z.string().min(1).nullable(),
      gender: SpecialistGenderSchema.nullable(),
      updatedByUserId: z.number().int().nullable(),
      updatedAt: z.string(),
    })
    .nullable(),
  /** Effective values used by UI/logger (override-when-present, catalog otherwise). */
  resolved: z.object({
    humanName: z.string(),
    gender: SpecialistGenderSchema,
    /** Per-field provenance so the UI can render "(default)" vs "(custom)". */
    source: z.object({
      humanName: z.enum(["override", "catalog"]),
      gender: z.enum(["override", "catalog"]),
    }),
  }),
});
export type SpecialistIdentityPublicView = z.infer<typeof SpecialistIdentityPublicViewSchema>;

// ════════════════════════════════════════════════════════════════════════════
// Phase 4 — Specialist recommendation telemetry (promote vs ignore)
//
// The Required Fields tab surfaces `lastObservedMissing` candidate-field keys
// as one-click promote-to-Recommended / promote-to-Hard-required actions.
// Until now, the only signal was a side effect on `field_requirements` (a
// successful promote bumped the toggle). Ignored recommendations left no
// trace, so we couldn't tell whether a key is being ignored on purpose vs
// the admin simply hasn't seen the page yet.
//
// This table is append-only telemetry: every promote action AND every
// explicit "Ignore" action writes one row. Aggregating by (specialistId,
// fieldKey) yields the promote-vs-ignore ratio that calibrates whether
// the catalog should declare a key "recommended" by default in a future
// release.
// ════════════════════════════════════════════════════════════════════════════

export const SPECIALIST_RECOMMENDATION_ACTIONS = [
  "promote-recommended",
  "promote-hard",
  "ignore",
] as const;
export type SpecialistRecommendationAction =
  typeof SPECIALIST_RECOMMENDATION_ACTIONS[number];
export const SpecialistRecommendationActionSchema = z.enum(
  SPECIALIST_RECOMMENDATION_ACTIONS,
);

export const specialistRecommendationEvents = pgTable(
  "specialist_recommendation_events",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    specialistId: text("specialist_id").notNull(),
    fieldKey: text("field_key").notNull(),
    action: text("action").$type<SpecialistRecommendationAction>().notNull(),
    actorUserId: integer("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    occurredAt: timestamp("occurred_at").defaultNow().notNull(),
  },
  (t) => [
    index("specialist_rec_events_specialist_idx").on(t.specialistId),
    index("specialist_rec_events_specialist_field_idx").on(t.specialistId, t.fieldKey),
  ],
);
export type SpecialistRecommendationEventRow =
  typeof specialistRecommendationEvents.$inferSelect;

export const recordRecommendationEventSchema = z.object({
  fieldKey: z.string().min(1).max(100),
  action: SpecialistRecommendationActionSchema,
});
export type RecordRecommendationEventInput = z.infer<
  typeof recordRecommendationEventSchema
>;

// ════════════════════════════════════════════════════════════════════════════
// Task #438 — Per-(specialistId, fieldKey) appearance counters.
//
// `lastObservedMissing` only tells us "what was missing on the last run". To
// help admins spot perennial offenders ("this field has been recommended N
// times, never promoted") we need a rolling counter that is bumped every
// time a candidate field appears in the observed-missing list.
//
// Promotion ANNOTATES the counter: `lastPromotedAt` is set and `appearances`
// is reset to 0 so the count reads "since last promotion". The row is
// preserved (not deleted) so the annotation survives a future demote.
// ════════════════════════════════════════════════════════════════════════════

export const specialistRecommendationCounters = pgTable(
  "specialist_recommendation_counters",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    specialistId: text("specialist_id").notNull(),
    fieldKey: text("field_key").notNull(),
    /**
     * Number of Specialist runs in which this candidate field appeared in
     * the observed-missing list since the last promotion (or ever, if the
     * field has never been promoted). Reset to 0 by a promote action.
     */
    appearances: integer("appearances").notNull().default(0),
    /** First time this counter row was created. */
    firstObservedAt: timestamp("first_observed_at").defaultNow().notNull(),
    /** Most recent run that observed this field as missing. */
    lastObservedAt: timestamp("last_observed_at").defaultNow().notNull(),
    /** Last admin promotion of this field (annotation, null = never). */
    lastPromotedAt: timestamp("last_promoted_at"),
  },
  (t) => [
    uniqueIndex("specialist_rec_counters_uniq").on(t.specialistId, t.fieldKey),
    index("specialist_rec_counters_specialist_idx").on(t.specialistId),
  ],
);
export type SpecialistRecommendationCounterRow =
  typeof specialistRecommendationCounters.$inferSelect;

export const SpecialistIdentityHistoryEntrySchema = z.object({
  id: z.number().int(),
  action: z.enum(["upsert", "reset"]),
  prevHumanName: z.string().nullable(),
  prevGender: SpecialistGenderSchema.nullable(),
  nextHumanName: z.string().nullable(),
  nextGender: SpecialistGenderSchema.nullable(),
  changeSummary: z.string().nullable(),
  changedByUserId: z.number().int().nullable(),
  changedAt: z.string(),
});
export type SpecialistIdentityHistoryEntry = z.infer<typeof SpecialistIdentityHistoryEntrySchema>;
