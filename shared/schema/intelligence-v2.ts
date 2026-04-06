import { pgTable, text, real, integer, timestamp, jsonb, boolean, index, unique, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./auth";
import { properties } from "./properties";
import { scenarios } from "./scenarios";

export const assumptionGuidance = pgTable("assumption_guidance", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  scenarioId: integer("scenario_id").references(() => scenarios.id, { onDelete: "cascade" }),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  assumptionKey: text("assumption_key").notNull(),
  valueLow: real("value_low"),
  valueMid: real("value_mid"),
  valueHigh: real("value_high"),
  confidence: text("confidence"),
  sourceName: text("source_name"),
  sourceDate: text("source_date"),
  reasoning: text("reasoning"),
  comparableSet: jsonb("comparable_set").$type<Record<string, unknown>>(),
  relaxationLevel: integer("relaxation_level").default(0),
  researchRunId: integer("research_run_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  unique("assumption_guidance_unique").on(table.scenarioId, table.entityType, table.entityId, table.assumptionKey),
  index("assumption_guidance_entity_idx").on(table.entityType, table.entityId),
  index("assumption_guidance_scenario_idx").on(table.scenarioId),
]);

export const insertAssumptionGuidanceSchema = createInsertSchema(assumptionGuidance).pick({
  scenarioId: true, entityType: true, entityId: true, assumptionKey: true,
  valueLow: true, valueMid: true, valueHigh: true, confidence: true,
  sourceName: true, sourceDate: true, reasoning: true, comparableSet: true,
  relaxationLevel: true, researchRunId: true,
});
export type AssumptionGuidance = typeof assumptionGuidance.$inferSelect;
export type InsertAssumptionGuidance = z.infer<typeof insertAssumptionGuidanceSchema>;

export const researchRuns = pgTable("research_runs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  scenarioId: integer("scenario_id").references(() => scenarios.id, { onDelete: "set null" }),
  tier: integer("tier").notNull().default(0),
  status: text("status").notNull().default("pending"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  durationMs: integer("duration_ms"),
  modelPrimary: text("model_primary"),
  modelSecondary: text("model_secondary"),
  modelSynthesis: text("model_synthesis"),
  tokensUsed: integer("tokens_used"),
  estimatedCost: real("estimated_cost"),
  error: text("error"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
}, (table) => [
  index("research_runs_entity_idx").on(table.entityType, table.entityId),
  index("research_runs_status_idx").on(table.status),
]);

export const insertResearchRunSchema = createInsertSchema(researchRuns).pick({
  userId: true, entityType: true, entityId: true, scenarioId: true,
  tier: true, status: true, completedAt: true, durationMs: true,
  modelPrimary: true, modelSecondary: true, modelSynthesis: true,
  tokensUsed: true, estimatedCost: true, error: true, metadata: true,
});
export type ResearchRun = typeof researchRuns.$inferSelect;
export type InsertResearchRun = z.infer<typeof insertResearchRunSchema>;

export const benchmarkSnapshots = pgTable("benchmark_snapshots", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  snapshotKey: text("snapshot_key").notNull().unique(),
  category: text("category").notNull(),
  value: real("value"),
  source: text("source"),
  sourceUrl: text("source_url"),
  fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
  staleness: text("staleness").default("fresh"),
  cadence: text("cadence").default("monthly"),
});

export const insertBenchmarkSnapshotSchema = createInsertSchema(benchmarkSnapshots).pick({
  snapshotKey: true, category: true, value: true, source: true,
  sourceUrl: true, staleness: true, cadence: true,
});
export type BenchmarkSnapshot = typeof benchmarkSnapshots.$inferSelect;
export type InsertBenchmarkSnapshot = z.infer<typeof insertBenchmarkSnapshotSchema>;

export const relaxationTraces = pgTable("relaxation_traces", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  researchRunId: integer("research_run_id").references(() => researchRuns.id, { onDelete: "cascade" }).notNull(),
  level: integer("level").notNull(),
  criteriaActive: jsonb("criteria_active").$type<Record<string, unknown>>(),
  compsFound: integer("comps_found").default(0),
  evidenceScore: real("evidence_score"),
  retained: jsonb("retained").$type<string[]>(),
  relaxed: jsonb("relaxed").$type<string[]>(),
}, (table) => [
  index("relaxation_traces_run_idx").on(table.researchRunId),
]);

export const insertRelaxationTraceSchema = createInsertSchema(relaxationTraces).pick({
  researchRunId: true, level: true, criteriaActive: true,
  compsFound: true, evidenceScore: true, retained: true, relaxed: true,
});
export type RelaxationTrace = typeof relaxationTraces.$inferSelect;
export type InsertRelaxationTrace = z.infer<typeof insertRelaxationTraceSchema>;

export const guidanceDecisions = pgTable("guidance_decisions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
  assumptionGuidanceId: integer("assumption_guidance_id").references(() => assumptionGuidance.id, { onDelete: "cascade" }).notNull(),
  action: text("action").notNull(),
  previousValue: real("previous_value"),
  newValue: real("new_value"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("guidance_decisions_user_idx").on(table.userId),
  index("guidance_decisions_guidance_idx").on(table.assumptionGuidanceId),
]);

export const insertGuidanceDecisionSchema = createInsertSchema(guidanceDecisions).pick({
  userId: true, assumptionGuidanceId: true, action: true,
  previousValue: true, newValue: true,
});
export type GuidanceDecision = typeof guidanceDecisions.$inferSelect;
export type InsertGuidanceDecision = z.infer<typeof insertGuidanceDecisionSchema>;

export const rebeccaConversations = pgTable("rebecca_conversations", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  propertyId: integer("property_id").references(() => properties.id, { onDelete: "set null" }),
  contextType: text("context_type").notNull().default("general"),
  contextKey: text("context_key"),
  model: text("model"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  lastMessageAt: timestamp("last_message_at").defaultNow().notNull(),
}, (table) => [
  index("rebecca_conversations_user_idx").on(table.userId),
]);

export const insertRebeccaConversationSchema = createInsertSchema(rebeccaConversations).pick({
  userId: true, propertyId: true, contextType: true, contextKey: true, model: true,
});
export type RebeccaConversation = typeof rebeccaConversations.$inferSelect;
export type InsertRebeccaConversation = z.infer<typeof insertRebeccaConversationSchema>;

export const rebeccaMessages = pgTable("rebecca_messages", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  conversationId: integer("conversation_id").references(() => rebeccaConversations.id, { onDelete: "cascade" }).notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("rebecca_messages_conv_idx").on(table.conversationId),
]);

export const insertRebeccaMessageSchema = createInsertSchema(rebeccaMessages).pick({
  conversationId: true, role: true, content: true, metadata: true,
});
export type RebeccaMessage = typeof rebeccaMessages.$inferSelect;
export type InsertRebeccaMessage = z.infer<typeof insertRebeccaMessageSchema>;

export const rebeccaEmails = pgTable("rebecca_emails", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  conversationId: integer("conversation_id").references(() => rebeccaConversations.id, { onDelete: "cascade" }).notNull(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  recipientEmail: text("recipient_email").notNull(),
  subject: text("subject").notNull(),
  htmlContent: text("html_content").notNull(),
  status: text("status").notNull().default("draft"),
  sentAt: timestamp("sent_at"),
}, (table) => [
  index("rebecca_emails_conv_idx").on(table.conversationId),
]);

export const insertRebeccaEmailSchema = createInsertSchema(rebeccaEmails).pick({
  conversationId: true, userId: true, recipientEmail: true,
  subject: true, htmlContent: true, status: true, sentAt: true,
});
export type RebeccaEmail = typeof rebeccaEmails.$inferSelect;
export type InsertRebeccaEmail = z.infer<typeof insertRebeccaEmailSchema>;

export const rebeccaFeedback = pgTable("rebecca_feedback", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  conversationId: integer("conversation_id").references(() => rebeccaConversations.id, { onDelete: "cascade" }).notNull(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  category: text("category").notNull(),
  notes: text("notes"),
  conversationContext: jsonb("conversation_context").$type<Record<string, unknown>>(),
  status: text("status").notNull().default("new"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("rebecca_feedback_status_idx").on(table.status),
]);

export const insertRebeccaFeedbackSchema = createInsertSchema(rebeccaFeedback).pick({
  conversationId: true, userId: true, category: true, notes: true,
  conversationContext: true, status: true,
});
export type RebeccaFeedback = typeof rebeccaFeedback.$inferSelect;
export type InsertRebeccaFeedback = z.infer<typeof insertRebeccaFeedbackSchema>;

export const coverageSnapshots = pgTable("coverage_snapshots", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  scenarioId: integer("scenario_id").references(() => scenarios.id, { onDelete: "cascade" }),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  totalFields: integer("total_fields").notNull(),
  freshCount: integer("fresh_count").notNull().default(0),
  staleCount: integer("stale_count").notNull().default(0),
  missingCount: integer("missing_count").notNull().default(0),
  coveragePct: real("coverage_pct").notNull().default(0),
  snapshotDate: date("snapshot_date").defaultNow().notNull(),
}, (table) => [
  index("coverage_snapshots_entity_idx").on(table.entityType, table.entityId),
]);

export const insertCoverageSnapshotSchema = createInsertSchema(coverageSnapshots).pick({
  scenarioId: true, entityType: true, entityId: true,
  totalFields: true, freshCount: true, staleCount: true, missingCount: true, coveragePct: true,
});
export type CoverageSnapshot = typeof coverageSnapshots.$inferSelect;
export type InsertCoverageSnapshot = z.infer<typeof insertCoverageSnapshotSchema>;

export const sourceRegistry = pgTable("source_registry", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  serviceKey: text("service_key").notNull().unique(),
  name: text("name").notNull(),
  sourceType: text("source_type").notNull(),
  trustScore: text("trust_score").default("unverified"),
  category: text("category").notNull(),
  cadence: text("cadence"),
  lastHealthCheck: timestamp("last_health_check"),
  isActive: boolean("is_active").notNull().default(true),
});

export const insertSourceRegistrySchema = createInsertSchema(sourceRegistry).pick({
  serviceKey: true, name: true, sourceType: true, trustScore: true,
  category: true, cadence: true, lastHealthCheck: true, isActive: true,
});
export type SourceRegistryEntry = typeof sourceRegistry.$inferSelect;
export type InsertSourceRegistryEntry = z.infer<typeof insertSourceRegistrySchema>;

export const integrationKeyRotations = pgTable("integration_key_rotations", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  serviceKey: text("service_key").notNull(),
  rotatedBy: integer("rotated_by").references(() => users.id, { onDelete: "set null" }),
  rotatedAt: timestamp("rotated_at").defaultNow().notNull(),
  previousKeyHash: text("previous_key_hash"),
  notes: text("notes"),
});

export const insertIntegrationKeyRotationSchema = createInsertSchema(integrationKeyRotations).pick({
  serviceKey: true, rotatedBy: true, previousKeyHash: true, notes: true,
});
export type IntegrationKeyRotation = typeof integrationKeyRotations.$inferSelect;
export type InsertIntegrationKeyRotation = z.infer<typeof insertIntegrationKeyRotationSchema>;

export const pipelinePolicies = pgTable("pipeline_policies", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  policyKey: text("policy_key").notNull().unique(),
  tier: integer("tier").notNull().default(0),
  isEnabled: boolean("is_enabled").notNull().default(true),
  stalenessThresholdHours: integer("staleness_threshold_hours").default(168),
  maxConcurrentRuns: integer("max_concurrent_runs").default(3),
  dailyTokenBudget: integer("daily_token_budget").default(100000),
  monthlyTokenBudget: integer("monthly_token_budget").default(2000000),
  relaxationMaxLevel: integer("relaxation_max_level").default(5),
  minEvidenceScore: real("min_evidence_score").default(0.3),
  minCompCount: integer("min_comp_count").default(3),
  autoRefreshIntervalHours: integer("auto_refresh_interval_hours"),
});

export const insertPipelinePolicySchema = createInsertSchema(pipelinePolicies).pick({
  policyKey: true, tier: true, isEnabled: true, stalenessThresholdHours: true,
  maxConcurrentRuns: true, dailyTokenBudget: true, monthlyTokenBudget: true,
  relaxationMaxLevel: true, minEvidenceScore: true, minCompCount: true,
  autoRefreshIntervalHours: true,
});
export type PipelinePolicy = typeof pipelinePolicies.$inferSelect;
export type InsertPipelinePolicy = z.infer<typeof insertPipelinePolicySchema>;
