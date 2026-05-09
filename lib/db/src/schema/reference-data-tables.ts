import { pgTable, text, serial, timestamp, boolean, integer, index, unique, date, real } from "drizzle-orm/pg-core";
import { vector } from "./vector-chunks";
import { sourceRegistry } from "./intelligence-v2";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ─────────────────────────────────────────────────────────────────────────────
// 1. Geography Dimension
// ─────────────────────────────────────────────────────────────────────────────
export const geographyDimension = pgTable("geography_dimension", {
  id: serial("id").primaryKey(),
  level: text("level").notNull(), // "country" | "state" | "territory"
  parentCountryCode: text("parent_country_code"), // ISO 3166-1 alpha-2 for states/territories
  isoCode: text("iso_code").notNull(), // alpha-2 for countries/states
  name: text("name").notNull(),
  currency: text("currency").notNull(),
  currencySymbol: text("currency_symbol").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  embedding: vector("embedding", { dimensions: 1536 }), // for semantic search
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  unique("geography_dimension_iso_level_uq").on(table.isoCode, table.level),
  index("geography_dimension_level_idx").on(table.level),
  index("geography_dimension_parent_idx").on(table.parentCountryCode),
]);

export const insertGeographyDimensionSchema = createInsertSchema(geographyDimension).pick({
  level: true, parentCountryCode: true, isoCode: true, name: true,
  currency: true, currencySymbol: true, isActive: true, embedding: true,
});
export type GeographyDimension = typeof geographyDimension.$inferSelect;
export type InsertGeographyDimension = z.infer<typeof insertGeographyDimensionSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 2. Jurisdictional Taxes (Hotel/Occupancy/Tourism)
// ─────────────────────────────────────────────────────────────────────────────
export const jurisdictionalTaxes = pgTable("jurisdictional_taxes", {
  id: serial("id").primaryKey(),
  country: text("country").notNull(), // ISO-3166 alpha-2
  subdivision: text("subdivision"), // State/Province
  market: text("market"), // City/MSA
  taxName: text("tax_name").notNull(),
  taxRate: real("tax_rate").notNull(), // decimal
  isLayered: boolean("is_layered").default(false).notNull(),
  effectiveFrom: date("effective_from").notNull(),
  effectiveUntil: date("effective_until"),
  sourceId: integer("source_id").references(() => sourceRegistry.id, { onDelete: "set null" }),
  sourceName: text("source_name"),
  sourceUrl: text("source_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("jurisdictional_taxes_lookup_idx").on(table.country, table.subdivision, table.market),
]);

export const insertJurisdictionalTaxSchema = createInsertSchema(jurisdictionalTaxes).pick({
  country: true, subdivision: true, market: true, taxName: true,
  taxRate: true, isLayered: true, effectiveFrom: true, effectiveUntil: true,
  sourceId: true, sourceName: true, sourceUrl: true,
});
export type JurisdictionalTax = typeof jurisdictionalTaxes.$inferSelect;
export type InsertJurisdictionalTax = z.infer<typeof insertJurisdictionalTaxSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 3. Regulatory Fees Schedule
// ─────────────────────────────────────────────────────────────────────────────
export const regulatoryFees = pgTable("regulatory_fees", {
  id: serial("id").primaryKey(),
  country: text("country").notNull(),
  subdivision: text("subdivision"),
  market: text("market"),
  feeType: text("fee_type").notNull(), // "permit" | "licensing" | "inspection" | etc.
  feeName: text("fee_name").notNull(),
  amount: real("amount").notNull(),
  unit: text("unit").notNull(), // "per_key" | "flat" | "per_sqft"
  effectiveFrom: date("effective_from").notNull(),
  effectiveUntil: date("effective_until"),
  sourceId: integer("source_id").references(() => sourceRegistry.id, { onDelete: "set null" }),
  sourceName: text("source_name"),
  sourceUrl: text("source_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("regulatory_fees_lookup_idx").on(table.country, table.subdivision, table.market),
]);

export const insertRegulatoryFeeSchema = createInsertSchema(regulatoryFees).pick({
  country: true, subdivision: true, market: true, feeType: true, feeName: true,
  amount: true, unit: true, effectiveFrom: true, effectiveUntil: true,
  sourceId: true, sourceName: true, sourceUrl: true,
});
export type RegulatoryFee = typeof regulatoryFees.$inferSelect;
export type InsertRegulatoryFee = z.infer<typeof insertRegulatoryFeeSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 4. Cap Rates by Market (Time-Series)
// ─────────────────────────────────────────────────────────────────────────────
export const marketCapRates = pgTable("market_cap_rates", {
  id: serial("id").primaryKey(),
  country: text("country").notNull(),
  subdivision: text("subdivision"),
  market: text("market").notNull(),
  segment: text("segment"), // "luxury" | "upscale" | etc.
  capRate: real("cap_rate").notNull(),
  asOfDate: date("as_of_date").notNull(),
  sourceId: integer("source_id").references(() => sourceRegistry.id, { onDelete: "set null" }),
  sourceName: text("source_name"), // e.g. "STR", "CBRE"
  sourceUrl: text("source_url"),
  embedding: vector("embedding", { dimensions: 1536 }), // for semantic market search
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("market_cap_rates_lookup_idx").on(table.market, table.asOfDate),
  index("market_cap_rates_geo_idx").on(table.country, table.subdivision),
]);

export const insertMarketCapRateSchema = createInsertSchema(marketCapRates).pick({
  country: true, subdivision: true, market: true, segment: true,
  capRate: true, asOfDate: true, sourceId: true, sourceName: true,
  sourceUrl: true, embedding: true,
});
export type MarketCapRate = typeof marketCapRates.$inferSelect;
export type InsertMarketCapRate = z.infer<typeof insertMarketCapRateSchema>;
