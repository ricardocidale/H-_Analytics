import { pgTable, text, real, integer, timestamp, jsonb, boolean, index, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./auth";
import { properties } from "./properties";
import { DEFAULT_MAX_STALENESS_HOURS } from "../constants";
import type { MarketResearchContent, PromptConditions } from "./types/jsonb-shapes";

export const marketResearch = pgTable("market_research", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  propertyId: integer("property_id").references(() => properties.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  content: jsonb("content").notNull().$type<MarketResearchContent>(),
  promptConditions: jsonb("prompt_conditions").$type<PromptConditions>(),
  llmModel: text("llm_model"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("market_research_user_id_idx").on(table.userId),
  index("market_research_type_idx").on(table.type),
  index("market_research_property_id_idx").on(table.propertyId),
  index("market_research_updated_at_idx").on(table.updatedAt),
]);

export const insertMarketResearchSchema = createInsertSchema(marketResearch).pick({
  userId: true,
  type: true,
  propertyId: true,
  title: true,
  content: true,
  promptConditions: true,
  llmModel: true,
});

export type MarketResearch = typeof marketResearch.$inferSelect;
export type InsertMarketResearch = z.infer<typeof insertMarketResearchSchema>;

export const prospectiveProperties = pgTable("prospective_properties", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  externalId: text("external_id").notNull(),
  source: text("source").notNull().default("realty-in-us"),
  address: text("address").notNull(),
  city: text("city"),
  state: text("state"),
  zipCode: text("zip_code"),
  price: real("price"),
  beds: integer("beds"),
  baths: real("baths"),
  sqft: real("sqft"),
  lotSizeAcres: real("lot_size_acres"),
  propertyType: text("property_type"),
  imageUrl: text("image_url"),
  listingUrl: text("listing_url"),
  notes: text("notes"),
  rawData: jsonb("raw_data").$type<Record<string, unknown>>(),
  savedAt: timestamp("saved_at").defaultNow().notNull(),
}, (table) => [
  index("prospective_props_user_id_idx").on(table.userId),
  index("prospective_props_external_id_idx").on(table.externalId),
  unique("prospective_props_user_external_source").on(table.userId, table.externalId, table.source),
]);

export const insertProspectivePropertySchema = z.object({
  userId: z.number(),
  externalId: z.string(),
  source: z.string().optional(),
  address: z.string(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  zipCode: z.string().nullable().optional(),
  price: z.number().nullable().optional(),
  beds: z.number().nullable().optional(),
  baths: z.number().nullable().optional(),
  sqft: z.number().nullable().optional(),
  lotSizeAcres: z.number().nullable().optional(),
  propertyType: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  listingUrl: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  rawData: z.record(z.unknown()).nullable().optional(),
});

export type ProspectiveProperty = typeof prospectiveProperties.$inferSelect;
export type InsertProspectiveProperty = z.infer<typeof insertProspectivePropertySchema>;

export const savedSearches = pgTable("saved_searches", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  location: text("location").notNull(),
  priceMin: text("price_min"),
  priceMax: text("price_max"),
  bedsMin: text("beds_min"),
  lotSizeMin: text("lot_size_min"),
  propertyType: text("property_type"),
  savedAt: timestamp("saved_at").defaultNow().notNull(),
}, (table) => [
  index("saved_searches_user_id_idx").on(table.userId),
]);

export const insertSavedSearchSchema = z.object({
  userId: z.number(),
  name: z.string().min(1),
  location: z.string().min(1),
  priceMin: z.string().nullable().optional(),
  priceMax: z.string().nullable().optional(),
  bedsMin: z.string().nullable().optional(),
  lotSizeMin: z.string().nullable().optional(),
  propertyType: z.string().nullable().optional(),
});

export type SavedSearch = typeof savedSearches.$inferSelect;
export type InsertSavedSearch = z.infer<typeof insertSavedSearchSchema>;

export const researchQuestions = pgTable("research_questions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  question: text("question").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertResearchQuestionSchema = z.object({
  question: z.string().min(1),
  sortOrder: z.number().optional(),
});

export type ResearchQuestion = typeof researchQuestions.$inferSelect;
export type InsertResearchQuestion = z.infer<typeof insertResearchQuestionSchema>;

export const marketRates = pgTable("market_rates", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  rateKey: text("rate_key").notNull().unique(),
  value: real("value"),
  displayValue: text("display_value"),
  source: text("source").notNull(),
  sourceUrl: text("source_url"),
  seriesId: text("series_id"),
  publishedAt: timestamp("published_at"),
  fetchedAt: timestamp("fetched_at"),
  isManual: boolean("is_manual").notNull().default(false),
  manualNote: text("manual_note"),
  maxStalenessHours: integer("max_staleness_hours").notNull().default(DEFAULT_MAX_STALENESS_HOURS),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertMarketRateSchema = z.object({
  rateKey: z.string().min(1),
  value: z.number().nullable().optional(),
  displayValue: z.string().nullable().optional(),
  source: z.string().min(1),
  sourceUrl: z.string().nullable().optional(),
  seriesId: z.string().nullable().optional(),
  publishedAt: z.date().nullable().optional(),
  fetchedAt: z.date().nullable().optional(),
  isManual: z.boolean().optional(),
  manualNote: z.string().nullable().optional(),
  maxStalenessHours: z.number().optional(),
});

export type MarketRate = typeof marketRates.$inferSelect;
export type InsertMarketRate = z.infer<typeof insertMarketRateSchema>;

// ── Capital Raise Benchmarks ─────────────────────────────────────
// Singleton-style benchmark table used by the Analyst watchdog to validate
// capital-raise (funding) assumptions. One row per dimension keyed by
// `dimensionKey` (e.g. "valuationCap", "discountRate", "trancheSize").
// Refreshed by admins via the Analyst Tables admin module.
export const capitalRaiseBenchmarks = pgTable("capital_raise_benchmarks", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  dimensionKey: text("dimension_key").notNull().unique(),
  label: text("label").notNull(),
  unit: text("unit").notNull().default("usd"),
  valueLow: real("value_low"),
  valueMid: real("value_mid"),
  valueHigh: real("value_high"),
  sourceCount: integer("source_count").notNull().default(0),
  lastRefreshedAt: timestamp("last_refreshed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCapitalRaiseBenchmarkSchema = createInsertSchema(capitalRaiseBenchmarks).pick({
  dimensionKey: true, label: true, unit: true,
  valueLow: true, valueMid: true, valueHigh: true,
  sourceCount: true, lastRefreshedAt: true,
});
export type CapitalRaiseBenchmark = typeof capitalRaiseBenchmarks.$inferSelect;
export type InsertCapitalRaiseBenchmark = z.infer<typeof insertCapitalRaiseBenchmarkSchema>;

// ── Analyst Refresh Audit Log ────────────────────────────────────
// Every admin-triggered Analyst-table refresh attempt is recorded here.
// Provides a tamper-evident trail of who refreshed which table, when, with
// what evidence, and what the resulting diff was. Required for the 7
// security guardrails on POST /api/admin/analyst-tables/:id/refresh.
export const analystRefreshAuditLog = pgTable("analyst_refresh_audit_log", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  tableId: text("table_id").notNull(),
  adminId: integer("admin_id").references(() => users.id, { onDelete: "set null" }),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  finishedAt: timestamp("finished_at"),
  sourceCount: integer("source_count"),
  tokensUsed: integer("tokens_used"),
  diffSummary: jsonb("diff_summary").$type<Record<string, unknown>>(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  status: text("status").notNull().default("success"), // success | failure | aborted | pending
  errorMessage: text("error_message"),
}, (table) => [
  index("analyst_refresh_audit_table_idx").on(table.tableId),
  index("analyst_refresh_audit_admin_idx").on(table.adminId),
  index("analyst_refresh_audit_started_idx").on(table.startedAt),
]);

export const insertAnalystRefreshAuditLogSchema = createInsertSchema(analystRefreshAuditLog).pick({
  tableId: true, adminId: true, sourceCount: true, tokensUsed: true,
  diffSummary: true, ipAddress: true, userAgent: true, status: true,
  errorMessage: true, finishedAt: true,
});
export type AnalystRefreshAuditLog = typeof analystRefreshAuditLog.$inferSelect;
export type InsertAnalystRefreshAuditLog = z.infer<typeof insertAnalystRefreshAuditLogSchema>;

// ── Analyst Refresh Settings (singleton) ─────────────────────────
// Single-row config table for the analyst-refresh module. The route layer
// upserts the row with id=1 so reads always return one record.
export const analystRefreshSettings = pgTable("analyst_refresh_settings", {
  id: integer("id").primaryKey(),
  globalCadenceDays: integer("global_cadence_days").notNull().default(30),
  lastSuspiciousAlertAt: timestamp("last_suspicious_alert_at"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertAnalystRefreshSettingsSchema = z.object({
  id: z.number().optional(),
  globalCadenceDays: z.number().int().min(1).max(365).optional(),
  lastSuspiciousAlertAt: z.date().nullable().optional(),
});
export type AnalystRefreshSettings = typeof analystRefreshSettings.$inferSelect;
export type InsertAnalystRefreshSettings = z.infer<typeof insertAnalystRefreshSettingsSchema>;
