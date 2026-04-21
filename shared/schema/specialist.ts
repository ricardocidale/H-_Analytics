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
] as const;
export type Subject = typeof SUBJECTS[number];
export const SubjectSchema = z.enum(SUBJECTS);

export const SUBJECT_LABELS: Record<Subject, string> = {
  "mgmt-co": "Management Company",
  property: "Property",
  photos: "Photos",
  "portfolio-ops": "Portfolio Ops",
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
    subject: SubjectSchema,
    capabilities: z.array(SpecialistCapabilitySchema).min(1),
    assignmentRefs: z.array(AssignmentRefSchema),
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

export const SpecialistConfigSection = z.enum(["llm-config", "required-fields", "runtime"]);
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

export const SpecialistConfigPublicViewSchema = z.object({
  specialistId: z.string(),
  promptTemplate: z.string(),
  modelResourceId: z.number().int().nullable(),
  requiredFields: z.array(z.string()),
  runtimeConfig: z.record(z.string(), z.unknown()),
  version: z.number().int().min(1),
  updatedAt: z.string(),
});
export type SpecialistConfigPublicView = z.infer<typeof SpecialistConfigPublicViewSchema>;
