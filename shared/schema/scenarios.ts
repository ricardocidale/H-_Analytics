import { sql } from "drizzle-orm";
import { pgTable, text, integer, timestamp, jsonb, index, unique, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./auth";
import { companies } from "./core";
import { properties } from "./properties";
import type {
  ScenarioGlobalAssumptionsSnapshot,
  ScenarioPropertySnapshot,
  ScenarioFeeCategorySnapshot,
  ScenarioPhotoSnapshot,
  ScenarioImagesSnapshot,
  ScenarioPropertyOverrideData,
  ScenarioServiceTemplateSnapshot,
} from "./types/jsonb-shapes";

export interface ComputedResultsSnapshot {
  engineVersion: string;
  computedAt: string;
  outputHash: string;
  projectionYears: number;
  propertyCount: number;
  auditOpinion: "UNQUALIFIED" | "QUALIFIED" | "ADVERSE";
  consolidatedYearly: unknown[];
}

export const scenarios = pgTable("scenarios", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  globalAssumptions: jsonb("global_assumptions").notNull().$type<ScenarioGlobalAssumptionsSnapshot>(),
  properties: jsonb("properties").notNull().$type<ScenarioPropertySnapshot[]>(),
  scenarioImages: jsonb("scenario_images").$type<ScenarioImagesSnapshot>(),
  feeCategories: jsonb("fee_categories").$type<Record<string, ScenarioFeeCategorySnapshot[]>>(),
  propertyPhotos: jsonb("property_photos").$type<Record<string, ScenarioPhotoSnapshot[]>>(),
  serviceTemplates: jsonb("service_templates").$type<ScenarioServiceTemplateSnapshot[]>(),
  computedResults: jsonb("computed_results").$type<ComputedResultsSnapshot | null>(),
  computeHash: text("compute_hash"),
  version: integer("version").notNull().default(1),
  baseSnapshotHash: text("base_snapshot_hash"),
  lastOutputHash: text("last_output_hash"),
  lastComputedAt: timestamp("last_computed_at"),
  lastEngineVersion: text("last_engine_version"),
  tags: jsonb("tags").$type<string[]>().default([]),
  kind: text("kind").notNull().default("manual"),
  isLocked: boolean("is_locked").notNull().default(false),
  deletedAt: timestamp("deleted_at"),
  deletedBy: integer("deleted_by"),
  purgeAfter: timestamp("purge_after"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("scenarios_user_id_idx").on(table.userId),
]);

// --- SCENARIO PROPERTY OVERRIDES TABLE ---
// Stores per-property diffs for each scenario. Instead of duplicating the entire
// property blob in every scenario, we store only the fields that changed from
// the baseline. This enables:
//   - Efficient storage (only changed fields are stored)
//   - Cross-scenario queries (query a field across all scenarios via SQL)
//   - Non-destructive preview (merge base + overrides without modifying live data)
//   - Change tracking (see exactly what changed in each scenario)
//
// The `overrides` JSONB contains only the fields that differ from the baseline
// property snapshot. Example: { "startAdr": 250, "adrGrowthRate": 0.04 }
//
// `changeType` indicates whether the property was added, removed, or modified
// in this scenario relative to the baseline.
export const scenarioPropertyOverrides = pgTable("scenario_property_overrides", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  scenarioId: integer("scenario_id").notNull().references(() => scenarios.id, { onDelete: "cascade" }),
  propertyId: integer("property_id").references(() => properties.id, { onDelete: "set null" }),
  propertyName: text("property_name").notNull(),
  changeType: text("change_type").notNull().default("modified"),
  overrides: jsonb("overrides").notNull().default({}).$type<ScenarioPropertyOverrideData>(),
  basePropertySnapshot: jsonb("base_property_snapshot").$type<ScenarioPropertySnapshot | null>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("spo_scenario_id_idx").on(table.scenarioId),
  index("spo_scenario_property_id_idx").on(table.scenarioId, table.propertyId),
  index("spo_property_name_idx").on(table.propertyName),
  unique("spo_scenario_property_unique").on(table.scenarioId, table.propertyName),
  index("spo_overrides_gin_idx").using("gin", table.overrides),
]);

export const scenarioShares = pgTable("scenario_shares", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  scenarioId: integer("scenario_id").notNull().references(() => scenarios.id, { onDelete: "cascade" }),
  targetType: text("target_type").notNull(),
  targetId: integer("target_id").notNull(),
  grantedBy: integer("granted_by").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("scenario_shares_scenario_id_idx").on(table.scenarioId),
  index("scenario_shares_target_idx").on(table.targetType, table.targetId),
  unique("scenario_shares_unique_grant").on(table.scenarioId, table.targetType, table.targetId),
]);

// --- SCENARIO ACCESS TABLE ---
// Fine-grained access control for scenario sharing. Two grant types:
//   - "specific": scenarioId is set — grants access to one scenario
//   - "all": scenarioId is NULL — grants access to ALL scenarios owned by ownerId
//
// A row with scenarioId = NULL + grantType = "all" means the grantee can see
// every scenario that ownerId owns (current and future). A row with a specific
// scenarioId grants access to just that one scenario.
export const scenarioAccess = pgTable("scenario_access", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  scenarioId: integer("scenario_id").references(() => scenarios.id, { onDelete: "cascade" }),
  ownerId: integer("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  granteeId: integer("grantee_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  grantType: text("grant_type").notNull(), // "specific" | "all"
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("scenario_access_owner_id_idx").on(table.ownerId),
  index("scenario_access_grantee_id_idx").on(table.granteeId),
  index("scenario_access_scenario_id_idx").on(table.scenarioId),
  unique("scenario_access_unique_grant").on(table.scenarioId, table.ownerId, table.granteeId, table.grantType),
]);

export const insertScenarioAccessSchema = createInsertSchema(scenarioAccess).pick({
  scenarioId: true,
  ownerId: true,
  granteeId: true,
  grantType: true,
});

export type ScenarioAccess = typeof scenarioAccess.$inferSelect;
export type InsertScenarioAccess = z.infer<typeof insertScenarioAccessSchema>;

export const insertScenarioSchema = createInsertSchema(scenarios).pick({
  userId: true,
  name: true,
  description: true,
  globalAssumptions: true,
  properties: true,
  scenarioImages: true,
  feeCategories: true,
  propertyPhotos: true,
  serviceTemplates: true,
  computedResults: true,
  computeHash: true,
  version: true,
  baseSnapshotHash: true,
  tags: true,
  kind: true,
  isLocked: true,
});

export const insertScenarioPropertyOverrideSchema = createInsertSchema(scenarioPropertyOverrides).pick({
  scenarioId: true,
  propertyId: true,
  propertyName: true,
  changeType: true,
  overrides: true,
  basePropertySnapshot: true,
});

export const updateScenarioSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  description: z.string().nullable().optional(),
  tags: z.array(z.string().min(1).max(50)).max(20).optional(),
});

export const selectScenarioSchema = createSelectSchema(scenarios);

export type Scenario = typeof scenarios.$inferSelect;
export type InsertScenario = z.infer<typeof insertScenarioSchema>;
export type UpdateScenario = z.infer<typeof updateScenarioSchema>;
export type ScenarioShare = typeof scenarioShares.$inferSelect;
export type ScenarioPropertyOverride = typeof scenarioPropertyOverrides.$inferSelect;
export type InsertScenarioPropertyOverride = z.infer<typeof insertScenarioPropertyOverrideSchema>;
