import { sql } from "drizzle-orm";
import { pgTable, text, varchar, real, integer, timestamp, jsonb, boolean, index, serial, unique, check, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./auth";
import { properties } from "./properties";
import {
  DEFAULT_ALERT_COOLDOWN_MINUTES,
} from "../constants";
import type { NotificationLogMetadata, RawExtractionData } from "./types/jsonb-shapes";

// --- NOTIFICATION EVENT TYPES ---
export const NOTIFICATION_EVENT_TYPES = [
  "DSCR_BREACH",
  "RESEARCH_COMPLETE",
  "REPORT_SHARED",
  "PROPERTY_IMPORTED",
  "CHECKER_FAILURE",
  "OCCUPANCY_BREACH",
  "CAP_RATE_BREACH",
  "NOI_VARIANCE_BREACH",
  "LLM_MODEL_ISSUE",
  "VECTOR_LATENCY_BREACH",
] as const;
export type NotificationEventType = typeof NOTIFICATION_EVENT_TYPES[number];

export const NOTIFICATION_CHANNELS = ["email"] as const;
export type NotificationChannel = typeof NOTIFICATION_CHANNELS[number];

export const ALERT_OPERATORS = ["<", ">", "=", "!="] as const;
export type AlertOperator = typeof ALERT_OPERATORS[number];

export const ALERT_METRICS = ["dscr", "cap_rate", "occupancy", "noi_variance"] as const;
export type AlertMetric = typeof ALERT_METRICS[number];

export const ALERT_SCOPES = ["all", "specific", "portfolio"] as const;
export type AlertScope = typeof ALERT_SCOPES[number];


// --- ALERT RULES TABLE ---
export const alertRules = pgTable("alert_rules", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  metric: text("metric").notNull(),
  operator: text("operator").notNull(),
  threshold: real("threshold").notNull(),
  scope: text("scope").notNull().default("all"),
  propertyId: integer("property_id").references(() => properties.id, { onDelete: "cascade" }),
  cooldownMinutes: integer("cooldown_minutes").notNull().default(DEFAULT_ALERT_COOLDOWN_MINUTES),
  isActive: boolean("is_active").notNull().default(true),
  lastTriggeredAt: timestamp("last_triggered_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("alert_rules_property_id_idx").on(table.propertyId),
]);

export const insertAlertRuleSchema = z.object({
  name: z.string().min(1),
  metric: z.enum(ALERT_METRICS),
  operator: z.enum(ALERT_OPERATORS),
  threshold: z.number(),
  scope: z.enum(ALERT_SCOPES).optional().default("all"),
  propertyId: z.number().nullable().optional(),
  cooldownMinutes: z.number().optional().default(DEFAULT_ALERT_COOLDOWN_MINUTES),
  isActive: z.boolean().optional().default(true),
});

export type AlertRule = typeof alertRules.$inferSelect;
export type InsertAlertRule = z.infer<typeof insertAlertRuleSchema>;


// --- NOTIFICATION LOGS TABLE ---
export const notificationLogs = pgTable("notification_logs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  eventType: text("event_type").notNull(),
  channel: text("channel").notNull(),
  recipient: text("recipient"),
  subject: text("subject"),
  status: text("status").notNull().default("pending"),
  errorMessage: text("error_message"),
  metadata: jsonb("metadata").$type<NotificationLogMetadata>(),
  alertRuleId: integer("alert_rule_id").references(() => alertRules.id, { onDelete: "set null" }),
  propertyId: integer("property_id").references(() => properties.id, { onDelete: "set null" }),
  retryCount: integer("retry_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("notification_logs_event_type_idx").on(table.eventType),
  index("notification_logs_status_idx").on(table.status),
  index("notification_logs_created_at_idx").on(table.createdAt),
  index("notification_logs_alert_rule_id_idx").on(table.alertRuleId),
  index("notification_logs_property_id_idx").on(table.propertyId),
]);

export const insertNotificationLogSchema = z.object({
  eventType: z.string(),
  channel: z.string(),
  recipient: z.string().nullable().optional(),
  subject: z.string().nullable().optional(),
  status: z.string().optional().default("pending"),
  errorMessage: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).nullable().optional(),
  alertRuleId: z.number().nullable().optional(),
  propertyId: z.number().nullable().optional(),
  retryCount: z.number().optional().default(0),
});

export type NotificationLog = typeof notificationLogs.$inferSelect;
export type InsertNotificationLog = z.input<typeof insertNotificationLogSchema>;


// --- NOTIFICATION PREFERENCES TABLE ---
export const notificationPreferences = pgTable("notification_preferences", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  channel: text("channel").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  unique("notification_pref_unique").on(table.userId, table.eventType, table.channel),
  index("notification_prefs_user_id_idx").on(table.userId),
]);

export const insertNotificationPreferenceSchema = z.object({
  userId: z.number(),
  eventType: z.string(),
  channel: z.string(),
  enabled: z.boolean().optional().default(true),
});

export type NotificationPreference = typeof notificationPreferences.$inferSelect;
export type InsertNotificationPreference = z.infer<typeof insertNotificationPreferenceSchema>;


// --- NOTIFICATION SETTINGS TABLE ---
export const notificationSettings = pgTable("notification_settings", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  settingKey: text("setting_key").notNull().unique(),
  settingValue: text("setting_value"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertNotificationSettingSchema = createInsertSchema(notificationSettings).pick({
  settingKey: true,
  settingValue: true,
});

export type NotificationSetting = typeof notificationSettings.$inferSelect;
export type InsertNotificationSetting = z.infer<typeof insertNotificationSettingSchema>;



// --- DOCUMENT EXTRACTIONS TABLE ---
// Tracks OCR extraction jobs from uploaded financial documents (P&L, appraisals, STR reports).
// Each extraction links a source document to a property and records the processing status.
export const documentExtractions = pgTable("document_extractions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  propertyId: integer("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  fileContentType: text("file_content_type").notNull(),
  objectPath: text("object_path").notNull(),
  documentType: text("document_type").notNull().default("general"),
  status: text("status").notNull().default("pending"),
  rawExtractionData: jsonb("raw_extraction_data").$type<RawExtractionData>(),
  errorMessage: text("error_message"),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("doc_extractions_property_id_idx").on(table.propertyId),
  index("doc_extractions_user_id_idx").on(table.userId),
]);

export const insertDocumentExtractionSchema = z.object({
  propertyId: z.number(),
  userId: z.number(),
  fileName: z.string(),
  fileContentType: z.string(),
  objectPath: z.string(),
  documentType: z.string().optional(),
  status: z.string().optional(),
});

export type DocumentExtraction = typeof documentExtractions.$inferSelect;
export type InsertDocumentExtraction = z.infer<typeof insertDocumentExtractionSchema>;


// --- EXTRACTION FIELDS TABLE ---
// Individual fields extracted from a document. Each field maps to a property financial
// assumption (e.g., roomsRevenue, costRateRooms). Includes confidence scores and approval status.
export const extractionFields = pgTable("extraction_fields", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  extractionId: integer("extraction_id").notNull().references(() => documentExtractions.id, { onDelete: "cascade" }),
  fieldName: text("field_name").notNull(),
  fieldLabel: text("field_label").notNull(),
  extractedValue: text("extracted_value").notNull(),
  mappedPropertyField: text("mapped_property_field"),
  confidence: real("confidence").notNull().default(0),
  status: text("status").notNull().default("pending"),
  currentValue: text("current_value"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("extraction_fields_extraction_id_idx").on(table.extractionId),
]);

export const insertExtractionFieldSchema = z.object({
  extractionId: z.number(),
  fieldName: z.string(),
  fieldLabel: z.string(),
  extractedValue: z.string(),
  mappedPropertyField: z.string().nullable().optional(),
  confidence: z.number().optional(),
  status: z.string().optional(),
  currentValue: z.string().nullable().optional(),
});

export type ExtractionField = typeof extractionFields.$inferSelect;
export type InsertExtractionField = z.infer<typeof insertExtractionFieldSchema>;


