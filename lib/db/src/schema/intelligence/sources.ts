import { pgTable, text, integer, real, timestamp, boolean, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { users } from "../auth";

export const sourceRegistry = pgTable("source_registry", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  serviceKey: text("service_key").notNull().unique(),
  name: text("name").notNull(),
  sourceType: text("source_type").notNull(),
  trustScore: text("trust_score").default("unverified"),
  category: text("category").notNull(),
  cadence: text("cadence"),
  lastHealthCheck: timestamp("last_health_check"),
  lastDataDate: timestamp("last_data_date"),
  isActive: boolean("is_active").notNull().default(true),
  description: text("description"),
  endpoint: text("endpoint"),
  apiKeyRef: text("api_key_ref"),
  rateLimitPerMin: integer("rate_limit_per_min"),
  successRate: real("success_rate"),
  avgLatencyMs: integer("avg_latency_ms"),
  costPerCall: text("cost_per_call"),
  dataProvided: jsonb("data_provided").$type<string[]>(),
});

export const insertSourceRegistrySchema = createInsertSchema(sourceRegistry).pick({
  serviceKey: true, name: true, sourceType: true, trustScore: true,
  category: true, cadence: true, lastHealthCheck: true, lastDataDate: true, isActive: true,
  description: true, endpoint: true, apiKeyRef: true, rateLimitPerMin: true,
  successRate: true, avgLatencyMs: true, costPerCall: true, dataProvided: true,
});
export type SourceRegistryEntry = typeof sourceRegistry.$inferSelect;
export type InsertSourceRegistryEntry = z.infer<typeof insertSourceRegistrySchema>;

export const sourceCallLogs = pgTable("source_call_logs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  sourceId: integer("source_id").references(() => sourceRegistry.id, { onDelete: "cascade" }).notNull(),
  serviceKey: text("service_key").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  httpStatus: integer("http_status"),
  latencyMs: integer("latency_ms"),
  success: boolean("success").notNull(),
  errorMessage: text("error_message"),
}, (table) => [
  index("source_call_logs_source_idx").on(table.sourceId),
]);

export const insertSourceCallLogSchema = createInsertSchema(sourceCallLogs).pick({
  sourceId: true, serviceKey: true, httpStatus: true,
  latencyMs: true, success: true, errorMessage: true,
});
export type SourceCallLog = typeof sourceCallLogs.$inferSelect;
export type InsertSourceCallLog = z.infer<typeof insertSourceCallLogSchema>;

export const integrationKeyRotations = pgTable("integration_key_rotations", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  serviceKey: text("service_key").notNull(),
  rotatedBy: integer("rotated_by").references(() => users.id, { onDelete: "set null" }),
  rotatedAt: timestamp("rotated_at").defaultNow().notNull(),
  previousKeyHash: text("previous_key_hash"),
  notes: text("notes"),
}, (table) => [
  // FK index (Task #971): support ON DELETE SET NULL cascade from users.
  index("integration_key_rotations_rotated_by_idx").on(table.rotatedBy),
]);

export const insertIntegrationKeyRotationSchema = createInsertSchema(integrationKeyRotations).pick({
  serviceKey: true, rotatedBy: true, previousKeyHash: true, notes: true,
});
export type IntegrationKeyRotation = typeof integrationKeyRotations.$inferSelect;
export type InsertIntegrationKeyRotation = z.infer<typeof insertIntegrationKeyRotationSchema>;
