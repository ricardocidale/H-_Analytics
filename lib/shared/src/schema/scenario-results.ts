import { pgTable, text, integer, timestamp, jsonb, index, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { scenarios } from "./scenarios";
import type { ConsolidatedYearlyJson } from "./types/jsonb-shapes";

export const scenarioResults = pgTable("scenario_results", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  scenarioId: integer("scenario_id").notNull().references(() => scenarios.id, { onDelete: "cascade" }),
  engineVersion: text("engine_version").notNull(),
  outputHash: text("output_hash").notNull(),
  inputsHash: text("inputs_hash").notNull(),
  consolidatedYearlyJson: jsonb("consolidated_yearly_json").notNull().$type<ConsolidatedYearlyJson>(),
  auditOpinion: text("audit_opinion").notNull(),
  projectionYears: integer("projection_years").notNull(),
  propertyCount: integer("property_count").notNull(),
  computedBy: integer("computed_by"),
  computedAt: timestamp("computed_at").defaultNow().notNull(),
}, (table) => [
  index("scenario_results_scenario_id_idx").on(table.scenarioId),
  index("scenario_results_output_hash_idx").on(table.outputHash),
  unique("scenario_results_scenario_output_unique").on(table.scenarioId, table.outputHash),
]);

export const insertScenarioResultSchema = createInsertSchema(scenarioResults).omit({
  computedAt: true,
});

export type ScenarioResult = typeof scenarioResults.$inferSelect;
export type InsertScenarioResult = z.infer<typeof insertScenarioResultSchema>;
