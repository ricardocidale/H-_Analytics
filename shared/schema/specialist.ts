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
] as const;
export type Subject = typeof SUBJECTS[number];
export const SubjectSchema = z.enum(SUBJECTS);

export const SUBJECT_LABELS: Record<Subject, string> = {
  "mgmt-co": "Management Company",
  property: "Property",
  photos: "Photos",
  "portfolio-ops": "Portfolio Ops",
  constants: "Constants & Authority Sources",
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
    requiredFields: jsonb("required_fields").notNull().$type<string[]>().default([]),
    runtimeConfig: jsonb("runtime_config").notNull().$type<Record<string, unknown>>().default({}),
    /**
     * Admin override for the scheduled Constants refresh cadence (in days).
     * Null means "no override" — the scheduler falls back to the catalog
     * default declared in `engine/analyst/registry/specialist-catalog.ts`
     * (`refreshCadenceDays`). Only meaningful for Constants Specialists
     * that own one or more registry keys.
     */
    refreshCadenceDays: integer("refresh_cadence_days"),
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
    requiredFields: jsonb("required_fields").notNull().$type<string[]>().default([]),
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

export const SpecialistConfigSection = z.enum(["llm-config", "required-fields", "runtime", "cadence"]);
export type SpecialistConfigSectionType = z.infer<typeof SpecialistConfigSection>;

export const updateLlmConfigSchema = z.object({
  promptTemplate: z.string().max(20_000),
  modelResourceId: z.number().int().positive().nullable(),
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
export const updateCadenceSchema = z.object({
  refreshCadenceDays: z.number().int().positive().max(3650).nullable(),
  changeSummary: z.string().max(500).optional(),
});
export type UpdateCadenceInput = z.infer<typeof updateCadenceSchema>;

export const SpecialistConfigPublicViewSchema = z.object({
  specialistId: z.string(),
  promptTemplate: z.string(),
  modelResourceId: z.number().int().nullable(),
  requiredFields: z.array(z.string()),
  /**
   * Per-Specialist allow-list for `requiredFields` keys, or `null` when
   * the Specialist has no allow-list wired (any string accepted). When
   * non-null, the admin PUT route rejects fields outside this list and the
   * UI surfaces them as helper text. See
   * engine/analyst/registry/required-field-keys.ts for the source of truth.
   */
  validRequiredFieldKeys: z.array(z.string()).nullable(),
  runtimeConfig: z.record(z.string(), z.unknown()),
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
  version: z.number().int().min(1),
  updatedAt: z.string(),
});
export type SpecialistConfigPublicView = z.infer<typeof SpecialistConfigPublicViewSchema>;
