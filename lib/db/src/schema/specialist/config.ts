/**
 * Specialist config Drizzle tables and API contracts.
 *
 * Split from `lib/db/src/schema/specialist.ts` (task #1361). See the barrel at
 * `../specialist.ts` for the full doctrine doc-comment.
 */

import { z } from "zod/v4";
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
import { adminResources } from "../admin-resource";
import { users } from "../auth";
import {
  SpecialistWorkflowOverridesSchema,
  type SpecialistWorkflowOverrides,
} from "./definition";

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
    index("specialist_configs_analyst_a_model_idx").on(t.analystAModelResourceId),
    index("specialist_configs_analyst_b_model_idx").on(t.analystBModelResourceId),
    index("specialist_configs_synthesis_model_idx").on(t.synthesisModelResourceId),
    index("specialist_configs_fallback_model_idx").on(t.fallbackModelResourceId),
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
    index("specialist_config_versions_analyst_a_model_idx").on(t.analystAModelResourceId),
    index("specialist_config_versions_analyst_b_model_idx").on(t.analystBModelResourceId),
    index("specialist_config_versions_synthesis_model_idx").on(t.synthesisModelResourceId),
    index("specialist_config_versions_fallback_model_idx").on(t.fallbackModelResourceId),
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
