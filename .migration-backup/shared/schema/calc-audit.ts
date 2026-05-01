import { pgTable, text, integer, timestamp, jsonb, index, real } from "drizzle-orm/pg-core";
import { z } from "zod";
import { users } from "./auth";

export interface CalcAuditLogEntry {
  step: number;
  module: string;
  label: string;
  formula: string;
  inputs: Record<string, number>;
  output: number;
  note?: string;
}

export const calculationAuditLogs = pgTable("calculation_audit_logs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  scenarioId: integer("scenario_id").notNull(),
  propertyId: integer("property_id").notNull(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  computedAt: timestamp("computed_at").defaultNow().notNull(),
  engineVersion: text("engine_version").notNull(),
  inputHash: text("input_hash").notNull(),
  outputHash: text("output_hash").notNull(),
  auditOpinion: text("audit_opinion").notNull(),
  durationMs: real("duration_ms").notNull(),
  totalSteps: integer("total_steps").notNull().default(0),
  logEntries: jsonb("log_entries").notNull().$type<CalcAuditLogEntry[]>(),
}, (table) => [
  index("calc_audit_scenario_idx").on(table.scenarioId),
  index("calc_audit_property_idx").on(table.propertyId),
  index("calc_audit_user_idx").on(table.userId),
  index("calc_audit_computed_at_idx").on(table.computedAt),
]);

export const insertCalcAuditLogSchema = z.object({
  scenarioId: z.number(),
  propertyId: z.number(),
  userId: z.number(),
  engineVersion: z.string(),
  inputHash: z.string(),
  outputHash: z.string(),
  auditOpinion: z.string(),
  durationMs: z.number(),
  totalSteps: z.number(),
  logEntries: z.array(z.object({
    step: z.number(),
    module: z.string(),
    label: z.string(),
    formula: z.string(),
    inputs: z.record(z.number()),
    output: z.number(),
    note: z.string().optional(),
  })),
});

export type CalcAuditLog = typeof calculationAuditLogs.$inferSelect;
export type InsertCalcAuditLog = z.infer<typeof insertCalcAuditLogSchema>;
