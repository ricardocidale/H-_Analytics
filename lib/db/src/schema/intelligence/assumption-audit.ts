import { pgTable, text, integer, real, timestamp, index, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { users } from "../auth";
import { scenarios } from "../scenarios";
import { researchRuns } from "./analyst";

// ── Assumption Change Log ────────────────────────────────────────
// Field-level audit trail for every property/company assumption change.
// Answers: "What was the old value, who changed it, why, and was The Analyst involved?"

export const assumptionChangeLog = pgTable("assumption_change_log", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  entityType: text("entity_type").notNull(),          // "property" | "company" | "scenario_override"
  entityId: integer("entity_id").notNull(),
  scenarioId: integer("scenario_id").references(() => scenarios.id, { onDelete: "set null" }),
  fieldName: text("field_name").notNull(),             // "taxRate", "startAdr", "exitCapRate", etc.
  previousValue: text("previous_value"),               // stored as text for flexibility (numbers, strings, null)
  newValue: text("new_value"),
  changeSource: text("change_source").notNull(),       // "seed" | "manual" | "analyst" | "document_extraction" | "admin_override" | "bulk_import"
  reason: text("reason"),                              // human-readable explanation
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  researchRunId: integer("research_run_id").references(() => researchRuns.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  // FK indexes (Task #971): support ON DELETE SET NULL cascades.
  index("assumption_change_log_scenario_idx").on(table.scenarioId),
  index("assumption_change_log_user_idx").on(table.userId),
  index("assumption_change_log_research_run_idx").on(table.researchRunId),
]);

export const insertAssumptionChangeLogSchema = createInsertSchema(assumptionChangeLog).pick({
  entityType: true, entityId: true, scenarioId: true, fieldName: true,
  previousValue: true, newValue: true, changeSource: true, reason: true,
  userId: true, researchRunId: true,
});
export type AssumptionChangeLog = typeof assumptionChangeLog.$inferSelect;
export type InsertAssumptionChangeLog = z.infer<typeof insertAssumptionChangeLogSchema>;

// ── Assumption Acknowledgments ───────────────────────────────────
// Per-field "Keep my value" overrides. When a saved value lands outside
// The Analyst's recommended range and the user clicks "Keep my value",
// we record the snapshot here (value + the range it deviated from). The
// warning generator then suppresses re-flagging the same field as long as
// the value is still inside that acknowledged window.
//
// If the user later edits the field to a new value, the route layer
// deletes the matching ack so the next post-save review can re-flag.
export const assumptionAcknowledgments = pgTable("assumption_acknowledgments", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  entityType: text("entity_type").notNull(),    // "company" | "property"
  entityId: integer("entity_id").notNull(),     // 0 for company-level
  fieldName: text("field_name").notNull(),
  valueAtAck: real("value_at_ack").notNull(),
  rangeLowAtAck: real("range_low_at_ack").notNull(),
  rangeHighAtAck: real("range_high_at_ack").notNull(),
  ackedAt: timestamp("acked_at").defaultNow().notNull(),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
}, (table) => [
  // Per-user uniqueness — different users can independently acknowledge the
  // same company-level field on their own scenarios without colliding.
  unique("assumption_ack_entity_field_uq").on(table.entityType, table.entityId, table.fieldName, table.userId),
]);

export const insertAssumptionAcknowledgmentSchema = createInsertSchema(assumptionAcknowledgments).pick({
  entityType: true, entityId: true, fieldName: true,
  valueAtAck: true, rangeLowAtAck: true, rangeHighAtAck: true, userId: true,
});
export type AssumptionAcknowledgment = typeof assumptionAcknowledgments.$inferSelect;
export type InsertAssumptionAcknowledgment = z.infer<typeof insertAssumptionAcknowledgmentSchema>;
