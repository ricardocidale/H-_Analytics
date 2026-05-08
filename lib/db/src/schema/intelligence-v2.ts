import { pgTable, text, real, integer, timestamp, jsonb, boolean, index, unique, date, doublePrecision, serial } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
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
  /**
   * Set when a later research run replaces this guidance row's field.
   * Null means "current". Phase 5C will populate this on cache invalidation.
   * See ADR-004 — Verdict Cache.
   */
  supersededAt: timestamp("superseded_at"),
  /** Structured breakdown of range quality — explains WHY conviction is what it is */
  dataQuality: jsonb("data_quality").$type<{
    /** Number of independent sources that contributed to this range */
    sourceCount: number;
    /** Types of sources: "db_table" (pre-collected), "api" (live), "web" (Perplexity/Tavily), "estimated" (LLM) */
    sourceTypes: Array<"db_table" | "api" | "web" | "estimated">;
    /** Age of the most recent source data in days */
    dataAgeDays: number | null;
    /** How wide the range is as a percentage of the mid value — tighter = higher quality */
    rangeSpreadPct: number | null;
    /** Whether multiple sources agree on the range (true = converging, false = diverging) */
    sourcesConverge: boolean;
    /** 0-100 composite score: sourceCount × 25 + freshness × 25 + convergence × 25 + sourceType × 25 */
    qualityScore: number;
    /** Human-readable explanation */
    qualityNarrative: string;
  }>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  unique("assumption_guidance_unique").on(table.scenarioId, table.entityType, table.entityId, table.assumptionKey),
  index("assumption_guidance_scenario_idx").on(table.scenarioId),
]);

export const insertAssumptionGuidanceSchema = createInsertSchema(assumptionGuidance).pick({
  scenarioId: true, entityType: true, entityId: true, assumptionKey: true,
  valueLow: true, valueMid: true, valueHigh: true, confidence: true,
  sourceName: true, sourceDate: true, reasoning: true, comparableSet: true,
  relaxationLevel: true, researchRunId: true, dataQuality: true,
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
  /**
   * Verdict-cache lookup key — derived hash of (entityType, entityId,
   * scenarioId, fields, model knobs). Indexed for hot-path reads in
   * Phase 5B engine-client.ts. Nullable for back-compat with rows
   * written before Phase 5C populates it. See ADR-004 — Verdict Cache.
   */
  cacheKey: text("cache_key"),
  /** Hash of the input bundle used to compute cacheKey, for diagnostics. */
  cacheInputsHash: text("cache_inputs_hash"),
}, (table) => [
  index("research_runs_entity_idx").on(table.entityType, table.entityId),
  index("research_runs_status_idx").on(table.status),
  // Task #972: latest-successful-run for a Constants locality —
  // see getLatestSuccessfulRunForConstant(). WHERE entity_type = $1
  // AND status = $2 ORDER BY completed_at DESC LIMIT 1.
  index("research_runs_entity_status_completed_idx")
    .on(table.entityType, table.status, table.completedAt),
  index("research_runs_user_idx").on(table.userId),
  index("research_runs_scenario_idx").on(table.scenarioId),
  // Partial index — cacheKey is NULL for every row written before Phase 5C
  // populates it, and that NULL slice is the majority of the table for the
  // foreseeable future. Postgres indexes NULL values in btrees by default;
  // restricting the index to non-null rows keeps it ~the size of the actual
  // verdict-cache lookup set instead of the whole table.
  index("research_runs_cache_key_idx").on(table.cacheKey).where(sql`${table.cacheKey} IS NOT NULL`),
]);

/**
 * Per-user cooldown clock for the Interactive Analyst (POST /api/analyst/refresh).
 *
 * One row per user; `reservedAt` records when the most-recent run was reserved.
 * Reservation happens BEFORE the runner is invoked and is NOT released on
 * failure — see the file-level comment in server/routes/analyst-admin.ts for
 * the rationale (strict 60s budget per admin, even against flaky upstreams).
 *
 * This table replaces an earlier in-memory `Map<userId, timestamp>` so the
 * doctrine survives process restarts and is shared across app instances.
 */
export const analystCooldowns = pgTable("analyst_cooldowns", {
  userId: integer("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  reservedAt: timestamp("reserved_at").notNull(),
});
export type AnalystCooldown = typeof analystCooldowns.$inferSelect;

export const rebeccaContextContractTurns = pgTable("rebecca_context_contract_turns", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  conversationId: integer("conversation_id").references(() => rebeccaConversations.id, { onDelete: "cascade" }),
  messageId: integer("message_id").references(() => rebeccaMessages.id, { onDelete: "set null" }),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  contract: jsonb("contract").$type<any>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("rebecca_ctx_contract_conv_idx").on(table.conversationId, table.createdAt),
  index("rebecca_ctx_contract_contract_idx").on(table.contract),
  // FK indexes (Task #971): support ON DELETE SET NULL cascades.
  index("rebecca_ctx_contract_message_idx").on(table.messageId),
  index("rebecca_ctx_contract_user_idx").on(table.userId),
]);

export const insertRebeccaContextContractTurnSchema = createInsertSchema(rebeccaContextContractTurns).pick({
  conversationId: true, messageId: true, userId: true, contract: true,
});
export type RebeccaContextContractTurn = typeof rebeccaContextContractTurns.$inferSelect;
export type InsertRebeccaContextContractTurn = z.infer<typeof insertRebeccaContextContractTurnSchema>;

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

export const rebeccaConversations = pgTable("rebecca_conversations", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  propertyId: integer("property_id").references(() => properties.id, { onDelete: "set null" }),
  contextType: text("context_type").notNull().default("general"),
  contextKey: text("context_key"),
  model: text("model"),
  language: text("language").default("en"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  lastMessageAt: timestamp("last_message_at").defaultNow().notNull(),
}, (table) => [
  index("rebecca_conversations_user_idx").on(table.userId),
  // Covering index for FK to properties (chat panel filters by property context).
  index("rebecca_conversations_property_idx").on(table.propertyId),
  // Task #972: "my recent conversations" list — see getRebeccaConversations(userId).
  // WHERE user_id = $1 ORDER BY last_message_at DESC.
  index("rebecca_conversations_user_last_msg_idx").on(table.userId, table.lastMessageAt),
  // Task #972: getOrCreateConversation lookup — runs on every Rebecca panel mount.
  // WHERE user_id = $1 AND context_type = $2 AND context_key … LIMIT 1.
  index("rebecca_conversations_user_ctx_idx").on(table.userId, table.contextType, table.contextKey),
]);

export const insertRebeccaConversationSchema = createInsertSchema(rebeccaConversations).pick({
  userId: true, propertyId: true, contextType: true, contextKey: true, model: true, language: true,
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
  // Task #972: chat-history fetch (WHERE conversation_id = $1
  // ORDER BY created_at DESC LIMIT N) — see getRebeccaMessages().
  index("rebecca_messages_conv_created_idx").on(table.conversationId, table.createdAt),
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
  index("rebecca_emails_user_idx").on(table.userId),
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
  index("rebecca_feedback_user_idx").on(table.userId),
  index("rebecca_feedback_conv_idx").on(table.conversationId),
  // Task #972: admin feedback queue (WHERE status = $1 ORDER BY created_at DESC) —
  // see getRebeccaFeedback(status).
  index("rebecca_feedback_status_created_idx").on(table.status, table.createdAt),
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
  index("coverage_snapshots_scenario_idx").on(table.scenarioId),
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
  /** Global N+1 orchestrator model defaults (P6e). FK → admin_resources ON DELETE SET NULL. */
  analystAModelResourceId: integer("analyst_a_model_resource_id"),
  analystBModelResourceId: integer("analyst_b_model_resource_id"),
  synthesisModelResourceId: integer("synthesis_model_resource_id"),
  fallbackModelResourceId: integer("fallback_model_resource_id"),
}, (t) => [
  index("pipeline_policies_analyst_a_model_idx").on(t.analystAModelResourceId),
  index("pipeline_policies_analyst_b_model_idx").on(t.analystBModelResourceId),
  index("pipeline_policies_synthesis_model_idx").on(t.synthesisModelResourceId),
  index("pipeline_policies_fallback_model_idx").on(t.fallbackModelResourceId),
]);

export const insertPipelinePolicySchema = createInsertSchema(pipelinePolicies).pick({
  policyKey: true, tier: true, isEnabled: true, stalenessThresholdHours: true,
  maxConcurrentRuns: true, dailyTokenBudget: true, monthlyTokenBudget: true,
  relaxationMaxLevel: true, minEvidenceScore: true, minCompCount: true,
  autoRefreshIntervalHours: true,
  analystAModelResourceId: true, analystBModelResourceId: true,
  synthesisModelResourceId: true, fallbackModelResourceId: true,
});
export type PipelinePolicy = typeof pipelinePolicies.$inferSelect;
export type InsertPipelinePolicy = z.infer<typeof insertPipelinePolicySchema>;

export const scheduledResearchWorkflows = pgTable("scheduled_research_workflows", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  workflowKey: text("workflow_key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  researchType: text("research_type").notNull().default("global"),
  frequencyHours: integer("frequency_hours").notNull().default(168),
  promptInstructions: text("prompt_instructions"),
  isEnabled: boolean("is_enabled").notNull().default(true),
  lastRunAt: timestamp("last_run_at"),
  nextRunAt: timestamp("next_run_at"),
  lastRunStatus: text("last_run_status").default("pending"),
  lastRunDurationMs: integer("last_run_duration_ms"),
  lastRunError: text("last_run_error"),
  priority: integer("priority").notNull().default(5),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("scheduled_research_workflows_enabled_idx").on(table.isEnabled),
  index("scheduled_research_workflows_next_run_idx").on(table.nextRunAt),
  // Task #972: scheduler picker (WHERE is_enabled = true AND next_run_at <= NOW()
  // ORDER BY priority) — see getStaleScheduledWorkflows(); partial keeps the
  // index ~the size of the enabled subset.
  index("scheduled_research_workflows_due_idx")
    .on(table.nextRunAt, table.priority)
    .where(sql`${table.isEnabled} = true`),
]);

export const insertScheduledResearchWorkflowSchema = createInsertSchema(scheduledResearchWorkflows).pick({
  workflowKey: true, name: true, description: true, researchType: true,
  frequencyHours: true, promptInstructions: true, isEnabled: true,
  lastRunAt: true, nextRunAt: true, lastRunStatus: true,
  lastRunDurationMs: true, lastRunError: true, priority: true,
});
export type ScheduledResearchWorkflow = typeof scheduledResearchWorkflows.$inferSelect;
export type InsertScheduledResearchWorkflow = z.infer<typeof insertScheduledResearchWorkflowSchema>;

export const rebeccaKnowledgeBase = pgTable("rebecca_knowledge_base", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  category: text("category").notNull().default("custom"),
  source: text("source").notNull().default("manual"),
  tags: text("tags").array().default([]),
  priority: integer("priority").notNull().default(50),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("rebecca_kb_category_idx").on(table.category),
  index("rebecca_kb_active_idx").on(table.isActive),
  // Task #972: active KB browse (WHERE is_active = true ORDER BY priority DESC, title)
  // — see getActiveRebeccaKBEntries(); partial since inactive rows are write-only audit.
  // Mixed sort directions are expressed via sql`` since drizzle 0.45 indexes don't
  // expose .asc()/.desc() helpers; the migration is the source of truth for ordering.
  index("rebecca_kb_active_priority_idx")
    .on(sql`${table.priority} DESC`, table.title)
    .where(sql`${table.isActive} = true`),
]);

export const insertRebeccaKBSchema = createInsertSchema(rebeccaKnowledgeBase).pick({
  title: true, content: true, category: true, source: true,
  tags: true, priority: true, isActive: true,
});
export type RebeccaKBEntry = typeof rebeccaKnowledgeBase.$inferSelect;
export type InsertRebeccaKBEntry = z.infer<typeof insertRebeccaKBSchema>;

export const rebeccaKnowledgeHistory = pgTable("rebecca_knowledge_history", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  entryId: integer("entry_id").references(() => rebeccaKnowledgeBase.id, { onDelete: "cascade" }).notNull(),
  snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
  changedBy: text("changed_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("rebecca_kb_history_entry_idx").on(table.entryId),
]);

export const insertRebeccaKBHistorySchema = createInsertSchema(rebeccaKnowledgeHistory).pick({
  entryId: true, snapshot: true, changedBy: true,
});
export type RebeccaKBHistory = typeof rebeccaKnowledgeHistory.$inferSelect;
export type InsertRebeccaKBHistory = z.infer<typeof insertRebeccaKBHistorySchema>;

export const rebeccaGuardrails = pgTable("rebecca_guardrails", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  label: text("label").notNull(),
  rule: text("rule").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertRebeccaGuardrailSchema = createInsertSchema(rebeccaGuardrails).pick({
  label: true, rule: true, sortOrder: true, isActive: true,
});
export type RebeccaGuardrail = typeof rebeccaGuardrails.$inferSelect;
export type InsertRebeccaGuardrail = z.infer<typeof insertRebeccaGuardrailSchema>;

// ---------------------------------------------------------------------------
// Rebecca Preview Fixtures (Task #538)
//
// Saved snapshots of an admin's preview transcript: the full RebeccaSettings
// in effect at the time + the user/assistant turns that were exchanged. Used
// as regression fixtures — admins replay a fixture's user turns against the
// current (unsaved) settings and the UI shows a turn-by-turn diff so any
// behavioural drift is immediately visible.
// ---------------------------------------------------------------------------
export type RebeccaPreviewTurn = {
  role: "user" | "assistant";
  content: string;
  ts: number;
};

export const rebeccaPreviewFixtures = pgTable("rebecca_preview_fixtures", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  description: text("description"),
  // Full RebeccaSettings snapshot — typed as Record so this schema file does
  // not need to import @shared/rebecca-settings (which would create a cycle
  // via shared/schema/index.ts → … → @shared/rebecca-settings consumers).
  settings: jsonb("settings").$type<Record<string, unknown>>().notNull(),
  turns: jsonb("turns").$type<RebeccaPreviewTurn[]>().notNull(),
  createdById: integer("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  // Task #559 — scheduled replay tracking. The scheduler (server/jobs/
  // rebecca-fixture-replay.ts) walks every fixture's turns through the
  // server-side preview runner once per cycle, computes match/differ/
  // error per turn, and writes the rolled-up shape here so the admin
  // fixtures panel can render a per-fixture last-run badge without
  // running the replay client-side. lastReplayFingerprint is a stable
  // hash of the per-turn status shape used for drift-alert suppression
  // (same fingerprint two cycles in a row → don't email twice).
  lastReplayAt: timestamp("last_replay_at"),
  lastReplayStatus: text("last_replay_status"),
  lastReplaySummary: jsonb("last_replay_summary").$type<RebeccaFixtureReplaySummary | null>(),
  lastReplayFingerprint: text("last_replay_fingerprint"),
}, (table) => [
  // Names are admin-curated handles; uniqueness keeps the side list legible
  // and prevents two fixtures from accidentally shadowing each other in
  // replay UIs that key by name.
  unique("rebecca_preview_fixtures_name_uq").on(table.name),
  // Covering index for FK so user-deletion cascades stay cheap.
  index("rebecca_preview_fixtures_created_by_idx").on(table.createdById),
  index("rebecca_preview_fixtures_created_at_idx").on(table.createdAt),
]);

export const insertRebeccaPreviewFixtureSchema = createInsertSchema(rebeccaPreviewFixtures).pick({
  name: true, description: true, settings: true, turns: true, createdById: true,
});
export type RebeccaPreviewFixture = typeof rebeccaPreviewFixtures.$inferSelect;
export type InsertRebeccaPreviewFixture = z.infer<typeof insertRebeccaPreviewFixtureSchema>;

/**
 * Per-turn outcome captured by the scheduled fixture replay
 * (server/jobs/rebecca-fixture-replay.ts). One entry per user turn from the
 * saved fixture, in the same order as the fixture's user turns. The
 * snippets are clipped (≤ 400 chars) so the JSONB stays small even when
 * Rebecca returns a long answer; the admin UI just needs enough to show a
 * preview and the diff badge.
 */
export type RebeccaFixtureReplayTurnStatus = "pass" | "differ" | "no-baseline" | "error";

export interface RebeccaFixtureReplayTurn {
  index: number;
  status: RebeccaFixtureReplayTurnStatus;
  prompt: string;
  expectedSnippet: string | null;
  actualSnippet: string | null;
  error?: string;
}

export interface RebeccaFixtureReplaySummary {
  totalTurns: number;
  matched: number;
  differed: number;
  noBaseline: number;
  errored: number;
  durationMs: number;
  perTurn: RebeccaFixtureReplayTurn[];
}

// ---------------------------------------------------------------------------
// Hospitality Benchmarks — admin-editable, DB-backed industry data
// ---------------------------------------------------------------------------
export const hospitalityBenchmarks = pgTable("hospitality_benchmarks", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  category: text("category").notNull(),          // e.g., "adr", "occupancy", "revpar", "cap_rate", "cost_rate"
  segment: text("segment").notNull(),             // e.g., "us_all", "us_luxury", "us_boutique", "us_economy", "global"
  metricKey: text("metric_key").notNull(),        // e.g., "us_hotel_adr", "luxury_adr", "cap_rate_full_service"
  metricLabel: text("metric_label").notNull(),    // Human-readable: "US Hotel Average ADR"
  value: doublePrecision("value").notNull(),      // The benchmark value
  unit: text("unit").notNull(),                   // "usd", "percent", "ratio", "years"
  sourceYear: integer("source_year").notNull(),   // 2024
  sourceName: text("source_name"),                // "STR/CoStar", "CBRE", "HVS", "PKF"
  sourceUrl: text("source_url"),                  // Link to source report
  country: text("country").default("US"),         // Country code
  notes: text("notes"),                           // Context or methodology notes
  isActive: boolean("is_active").default(true).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  updatedBy: integer("updated_by").references(() => users.id, { onDelete: "set null" }),
}, (table) => [
  unique("hospitality_benchmarks_metric_country_year").on(table.metricKey, table.country, table.sourceYear),
]);

export const insertHospitalityBenchmarkSchema = createInsertSchema(hospitalityBenchmarks).pick({
  category: true, segment: true, metricKey: true, metricLabel: true,
  value: true, unit: true, sourceYear: true, sourceName: true,
  sourceUrl: true, country: true, notes: true, isActive: true, updatedBy: true,
});
export type HospitalityBenchmark = typeof hospitalityBenchmarks.$inferSelect;
export type InsertHospitalityBenchmark = z.infer<typeof insertHospitalityBenchmarkSchema>;

// ---------------------------------------------------------------------------
// Market ADR Index — quarterly ADR by major market
// ---------------------------------------------------------------------------
export const marketAdrIndex = pgTable("market_adr_index", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  market: text("market").notNull(),
  country: text("country").notNull(),
  quarter: text("quarter").notNull(),
  avgAdr: real("avg_adr"),
  luxuryAdr: real("luxury_adr"),
  upscaleAdr: real("upscale_adr"),
  midscaleAdr: real("midscale_adr"),
  economyAdr: real("economy_adr"),
  boutiqueAdr: real("boutique_adr"),
  avgOccupancy: real("avg_occupancy"),
  avgRevpar: real("avg_revpar"),
  source: text("source"),
  sourceUrl: text("source_url"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  unique("uq_market_adr_quarter").on(table.market, table.quarter),
]);

export const insertMarketAdrIndexSchema = createInsertSchema(marketAdrIndex).pick({
  market: true, country: true, quarter: true,
  avgAdr: true, luxuryAdr: true, upscaleAdr: true, midscaleAdr: true, economyAdr: true, boutiqueAdr: true,
  avgOccupancy: true, avgRevpar: true, source: true, sourceUrl: true,
});
export type MarketAdrIndex = typeof marketAdrIndex.$inferSelect;
export type InsertMarketAdrIndex = z.infer<typeof insertMarketAdrIndexSchema>;

// ---------------------------------------------------------------------------
// Seasonal Calendars — peak/trough/shoulder by market and month
// ---------------------------------------------------------------------------
export const seasonalCalendars = pgTable("seasonal_calendars", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  market: text("market").notNull(),
  country: text("country").notNull(),
  month: integer("month").notNull(),
  seasonType: text("season_type").notNull(),
  demandMultiplier: real("demand_multiplier").notNull().default(1.0),
  avgAdrMultiplier: real("avg_adr_multiplier").default(1.0),
  notes: text("notes"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  unique("uq_seasonal_market_month").on(table.market, table.month),
]);

export const insertSeasonalCalendarSchema = createInsertSchema(seasonalCalendars).pick({
  market: true, country: true, month: true, seasonType: true,
  demandMultiplier: true, avgAdrMultiplier: true, notes: true,
});
export type SeasonalCalendar = typeof seasonalCalendars.$inferSelect;
export type InsertSeasonalCalendar = z.infer<typeof insertSeasonalCalendarSchema>;

// ---------------------------------------------------------------------------
// Event Calendars — demand-driving events by market
// ---------------------------------------------------------------------------
export const eventCalendars = pgTable("event_calendars", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  market: text("market").notNull(),
  country: text("country").notNull(),
  eventName: text("event_name").notNull(),
  startMonth: integer("start_month"),
  endMonth: integer("end_month"),
  specificDate: text("specific_date"),
  demandImpact: text("demand_impact").notNull(),
  isRecurring: boolean("is_recurring").notNull().default(true),
  category: text("category"),
  estimatedAttendees: integer("estimated_attendees"),
  notes: text("notes"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertEventCalendarSchema = createInsertSchema(eventCalendars).pick({
  market: true, country: true, eventName: true,
  startMonth: true, endMonth: true, specificDate: true,
  demandImpact: true, isRecurring: true, category: true,
  estimatedAttendees: true, notes: true,
});
export type EventCalendar = typeof eventCalendars.$inferSelect;
export type InsertEventCalendar = z.infer<typeof insertEventCalendarSchema>;

// ---------------------------------------------------------------------------
// Airport Distances — pre-computed per property
// ---------------------------------------------------------------------------
export const airportDistances = pgTable("airport_distances", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  propertyId: integer("property_id").notNull(),
  airportCode: text("airport_code").notNull(),
  airportName: text("airport_name").notNull(),
  distanceKm: real("distance_km"),
  driveMinutes: integer("drive_minutes"),
  isInternational: boolean("is_international").default(false),
  computedAt: timestamp("computed_at").defaultNow().notNull(),
}, (table) => [
  unique("uq_airport_property").on(table.propertyId, table.airportCode),
  index("idx_airport_property_id").on(table.propertyId),
]);

export const insertAirportDistanceSchema = createInsertSchema(airportDistances).pick({
  propertyId: true, airportCode: true, airportName: true,
  distanceKm: true, driveMinutes: true, isInternational: true,
});
export type AirportDistance = typeof airportDistances.$inferSelect;
export type InsertAirportDistance = z.infer<typeof insertAirportDistanceSchema>;

// ---------------------------------------------------------------------------
// Labor Rates — hospitality staffing costs by market
// ---------------------------------------------------------------------------
export const laborRates = pgTable("labor_rates", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  market: text("market").notNull(),
  country: text("country").notNull(),
  role: text("role").notNull(),
  hourlyRate: real("hourly_rate"),
  annualSalary: real("annual_salary"),
  currency: text("currency").notNull().default("USD"),
  employmentType: text("employment_type").notNull().default("fte"),
  source: text("source"),
  sourceUrl: text("source_url"),
  sourceYear: integer("source_year"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  unique("uq_labor_market_role").on(table.market, table.role, table.employmentType),
]);

export const insertLaborRateSchema = createInsertSchema(laborRates).pick({
  market: true, country: true, role: true,
  hourlyRate: true, annualSalary: true, currency: true,
  employmentType: true, source: true, sourceUrl: true, sourceYear: true,
});
export type LaborRate = typeof laborRates.$inferSelect;
export type InsertLaborRate = z.infer<typeof insertLaborRateSchema>;

// ---------------------------------------------------------------------------
// F&B Benchmarks — food and beverage operating metrics
// ---------------------------------------------------------------------------
export const fbBenchmarks = pgTable("fb_benchmarks", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  market: text("market").notNull(),
  country: text("country").notNull(),
  propertyType: text("property_type").notNull(),
  avgTicketPerPerson: real("avg_ticket_per_person"),
  avgBreakfastTicket: real("avg_breakfast_ticket"),
  avgLunchTicket: real("avg_lunch_ticket"),
  avgDinnerTicket: real("avg_dinner_ticket"),
  avgBarRevenuePerGuest: real("avg_bar_revenue_per_guest"),
  coversPerRoomNight: real("covers_per_room_night"),
  cateringCostPerEvent: real("catering_cost_per_event"),
  fbCostOfGoodsPercent: real("fb_cost_of_goods_percent"),
  fbLaborCostPercent: real("fb_labor_cost_percent"),
  source: text("source"),
  sourceUrl: text("source_url"),
  sourceYear: integer("source_year"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  unique("uq_fb_market_type").on(table.market, table.propertyType),
])

export const insertFbBenchmarkSchema = createInsertSchema(fbBenchmarks).pick({
  market: true, country: true, propertyType: true,
  avgTicketPerPerson: true, avgBreakfastTicket: true, avgLunchTicket: true, avgDinnerTicket: true,
  avgBarRevenuePerGuest: true, coversPerRoomNight: true, cateringCostPerEvent: true,
  fbCostOfGoodsPercent: true, fbLaborCostPercent: true,
  source: true, sourceUrl: true, sourceYear: true,
});
export type FbBenchmark = typeof fbBenchmarks.$inferSelect;
export type InsertFbBenchmark = z.infer<typeof insertFbBenchmarkSchema>;

// ---------------------------------------------------------------------------
// Tax Bulletin Cache — Phase 2c (Helena's tax-bulletin-diff tool).
//
// Persists the latest fetched tax-authority bulletin per jurisdiction so
// Helena's deterministic tool can compute incremental diffs across refreshes
// instead of full re-reads. One row per (country, subdivision); upserts on
// every successful fetch. `bulletinHash` is sha256 of the normalized raw
// payload — equality short-circuits the diff to "no change".
//
// `subdivision` is stored as the empty string (not NULL) so the unique
// constraint actually enforces one row per (country, subdivision); Postgres
// treats NULLs as distinct, which would let duplicates accumulate.
// ---------------------------------------------------------------------------
export const taxBulletinCache = pgTable("tax_bulletin_cache", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  country: text("country").notNull(),
  subdivision: text("subdivision").notNull().default(""),
  sourceUrl: text("source_url").notNull(),
  publisher: text("publisher").notNull(),
  bulletinHash: text("bulletin_hash").notNull(),
  parsedValues: jsonb("parsed_values").$type<Record<string, unknown>>().notNull(),
  rawExcerpt: text("raw_excerpt").notNull(),
  fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
}, (table) => [
  unique("uq_tax_bulletin_jurisdiction").on(table.country, table.subdivision),
]);

export const insertTaxBulletinCacheSchema = createInsertSchema(taxBulletinCache).pick({
  country: true, subdivision: true, sourceUrl: true, publisher: true,
  bulletinHash: true, parsedValues: true, rawExcerpt: true,
});
export type TaxBulletinCache = typeof taxBulletinCache.$inferSelect;
export type InsertTaxBulletinCache = z.infer<typeof insertTaxBulletinCacheSchema>;

// ---------------------------------------------------------------------------
// Submarket Supply Pipeline Projects — Task #810.
//
// Normalized list of comp-hotel new-supply projects in a property's
// submarket. Specialist-supplied (Daniela / property.risk-intelligence in
// the Intelligence catalog), refreshed on demand via the Analyst
// affordance. One row per project. `propertyId` anchors the project to the
// subject asset's submarket; `submarketKey` is a free-form locality slug
// (e.g. "austin-downtown-tx") so the same row set can be re-used across
// nearby properties without duplication.
//
// Status values: "announced" | "planned" | "under_construction" |
// "opened_recent" — the four buckets the property risk overlay reasons
// over. Status drives the pipeline-pressure score weighting (see
// `shared/market-intelligence-pipeline.ts`).
//
// `conviction` mirrors the other Specialist-emitted signals: "high" |
// "medium" | "low". `lastRefreshedAt` is the canonical "as of" timestamp
// the UI chip renders.
// ---------------------------------------------------------------------------
export const submarketSupplyProjects = pgTable("submarket_supply_projects", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  propertyId: integer("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
  submarketKey: text("submarket_key").notNull(),
  name: text("name").notNull(),
  brand: text("brand"),
  segment: text("segment"),
  keyCount: integer("key_count").notNull().default(0),
  status: text("status").notNull().default("planned"),
  openingYear: integer("opening_year"),
  distanceKm: real("distance_km"),
  source: text("source"),
  sourceUrl: text("source_url"),
  conviction: text("conviction").notNull().default("medium"),
  notes: text("notes"),
  lastRefreshedAt: timestamp("last_refreshed_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("submarket_supply_property_idx").on(table.propertyId),
  index("submarket_supply_submarket_idx").on(table.submarketKey),
  index("submarket_supply_status_idx").on(table.status),
]);

export const insertSubmarketSupplyProjectSchema = createInsertSchema(submarketSupplyProjects).pick({
  propertyId: true, submarketKey: true, name: true, brand: true, segment: true,
  keyCount: true, status: true, openingYear: true, distanceKm: true,
  source: true, sourceUrl: true, conviction: true, notes: true, lastRefreshedAt: true,
});
export type SubmarketSupplyProject = typeof submarketSupplyProjects.$inferSelect;
export type InsertSubmarketSupplyProject = z.infer<typeof insertSubmarketSupplyProjectSchema>;

export const SUPPLY_PROJECT_STATUSES = ["announced", "planned", "under_construction", "opened_recent"] as const;
export type SupplyProjectStatus = typeof SUPPLY_PROJECT_STATUSES[number];

// ---------------------------------------------------------------------------
// STR Ordinance Events — Task #810.
//
// Chronological list of short-term-rental rule changes (and proposed
// legislation) for a locality. Specialist-supplied. `eventDate` is the
// ordinance / proposal date (text so partial dates like "2024-Q3" are
// allowed). `eventType` is the high-level kind ("ordinance_passed" |
// "ordinance_proposed" | "court_ruling" | "ban" | "cap_change" |
// "tax_change") and `direction` records the trend impact on STR
// operations: "tightening" | "loosening" | "stable".
//
// `localityKey` is a free-form slug ("austin-tx", "miami-beach-fl") so
// multiple properties in the same locality can re-use the same event set.
// `propertyId` anchors the per-property STR risk view in the UI; the
// per-property anchor is what the Risk Specialist (Task #801) overlays.
// ---------------------------------------------------------------------------
export const strOrdinanceEvents = pgTable("str_ordinance_events", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  propertyId: integer("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
  localityKey: text("locality_key").notNull(),
  title: text("title").notNull(),
  summary: text("summary"),
  eventDate: text("event_date").notNull(),
  eventType: text("event_type").notNull(),
  direction: text("direction").notNull().default("stable"),
  source: text("source"),
  sourceUrl: text("source_url"),
  conviction: text("conviction").notNull().default("medium"),
  /** Snapshot of currently-binding STR rules at the time of this event. */
  rulesSnapshot: jsonb("rules_snapshot").$type<{
    allowed?: "allowed" | "restricted" | "banned";
    ownerOccupancyRequired?: boolean;
    permitCap?: number | null;
    primaryResidenceOnly?: boolean;
    daysPerYearCap?: number | null;
    lodgingTaxParity?: boolean;
  }>(),
  lastRefreshedAt: timestamp("last_refreshed_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("str_ordinance_property_idx").on(table.propertyId),
  index("str_ordinance_locality_idx").on(table.localityKey),
  index("str_ordinance_date_idx").on(table.eventDate),
]);

export const insertStrOrdinanceEventSchema = createInsertSchema(strOrdinanceEvents).pick({
  propertyId: true, localityKey: true, title: true, summary: true,
  eventDate: true, eventType: true, direction: true,
  source: true, sourceUrl: true, conviction: true, rulesSnapshot: true,
  lastRefreshedAt: true,
});
export type StrOrdinanceEvent = typeof strOrdinanceEvents.$inferSelect;
export type InsertStrOrdinanceEvent = z.infer<typeof insertStrOrdinanceEventSchema>;

export const STR_DIRECTIONS = ["tightening", "loosening", "stable"] as const;
export type StrDirection = typeof STR_DIRECTIONS[number];

export const STR_EVENT_TYPES = [
  "ordinance_passed", "ordinance_proposed", "court_ruling",
  "ban", "cap_change", "tax_change",
] as const;
export type StrEventType = typeof STR_EVENT_TYPES[number];

export const SIGNAL_CONVICTION_LEVELS = ["high", "medium", "low"] as const;
export type SignalConviction = typeof SIGNAL_CONVICTION_LEVELS[number];
