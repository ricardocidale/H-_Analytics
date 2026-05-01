import { pgTable, text, integer, timestamp, jsonb, index, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./auth";
import type { ActivityLogMetadata, VerificationRunResults } from "./types/jsonb-shapes";

export const loginLogs = pgTable("login_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  loginAt: timestamp("login_at").defaultNow().notNull(),
  logoutAt: timestamp("logout_at"),
  sessionId: text("session_id").notNull(),
  ipAddress: text("ip_address"),
}, (table) => [
  index("login_logs_user_id_idx").on(table.userId),
  index("login_logs_session_id_idx").on(table.sessionId),
  index("login_logs_login_at_idx").on(table.loginAt),
]);

export const insertLoginLogSchema = createInsertSchema(loginLogs).omit({
  id: true,
  loginAt: true,
  logoutAt: true,
});

export type LoginLog = typeof loginLogs.$inferSelect;
export type InsertLoginLog = z.infer<typeof insertLoginLogSchema>;

export const activityLogs = pgTable("activity_logs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id"),
  entityName: text("entity_name"),
  metadata: jsonb("metadata").$type<ActivityLogMetadata>(),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("activity_logs_user_id_created_at_idx").on(table.userId, table.createdAt),
  index("activity_logs_entity_type_entity_id_idx").on(table.entityType, table.entityId),
  index("activity_logs_created_at_idx").on(table.createdAt),
]);

export const insertActivityLogSchema = z.object({
  userId: z.number(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.number().nullable().optional(),
  entityName: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).nullable().optional(),
  ipAddress: z.string().nullable().optional(),
});

export type ActivityLog = typeof activityLogs.$inferSelect;
export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;

export const verificationRuns = pgTable("verification_runs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  totalChecks: integer("total_checks").notNull(),
  passed: integer("passed").notNull(),
  failed: integer("failed").notNull(),
  auditOpinion: text("audit_opinion").notNull(),
  overallStatus: text("overall_status").notNull(),
  results: jsonb("results").notNull().$type<VerificationRunResults>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("verification_runs_user_id_idx").on(table.userId),
  index("verification_runs_created_at_idx").on(table.createdAt),
]);

export const insertVerificationRunSchema = z.object({
  userId: z.number(),
  totalChecks: z.number(),
  passed: z.number(),
  failed: z.number(),
  auditOpinion: z.string(),
  overallStatus: z.string(),
  results: z.record(z.unknown()),
});

export type VerificationRun = typeof verificationRuns.$inferSelect;
export type InsertVerificationRun = z.infer<typeof insertVerificationRunSchema>;
