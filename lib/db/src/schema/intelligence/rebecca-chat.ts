import { pgTable, text, integer, timestamp, jsonb, boolean, index, unique } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { users } from "../auth";
import { properties } from "../properties";

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
