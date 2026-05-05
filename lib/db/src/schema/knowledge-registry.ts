import { pgTable, text, serial, numeric, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ---------------------------------------------------------------------------
// Knowledge Registry — U1 (backend DDL only).
//
// `knowledge_registry` is the catalog of all knowledge assets surfaced in
// the H+ platform: vector namespaces, benchmark tables, brand comps, and
// country economic datasets. Each row is a slug-keyed entry that describes
// what the asset is, how it was built, and how it stays fresh.
//
// `country_economic_data` stores macro-economic indicators (inflation, FX,
// GDP growth, interest rate) per country, keyed by ISO 3166-1 alpha-2 code.
// Rows are upserted on refresh; `sourced_at` records the data vintage.
// ---------------------------------------------------------------------------

export const knowledgeRegistry = pgTable("knowledge_registry", {
  id: text("id").primaryKey(),                                    // slug, e.g. "market-research"
  displayName: text("display_name").notNull(),
  description: text("description").notNull(),
  howBuilt: text("how_built").notNull(),
  sourceDescription: text("source_description").notNull(),
  renewalMechanism: text("renewal_mechanism").notNull(),
  assetType: text("asset_type").notNull(),                        // "vector_namespace" | "benchmark_table" | "benchmark_brands" | "country_data"
  assetRef: text("asset_ref").notNull(),
  lastRefreshedAt: timestamp("last_refreshed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertKnowledgeRegistrySchema = createInsertSchema(knowledgeRegistry).pick({
  id: true, displayName: true, description: true, howBuilt: true,
  sourceDescription: true, renewalMechanism: true, assetType: true,
  assetRef: true, lastRefreshedAt: true,
});
export type KnowledgeRegistry = typeof knowledgeRegistry.$inferSelect;
export type InsertKnowledgeRegistry = z.infer<typeof insertKnowledgeRegistrySchema>;

export const countryEconomicData = pgTable("country_economic_data", {
  id: serial("id").primaryKey(),
  countryCode: text("country_code").notNull().unique(),           // ISO 3166-1 alpha-2
  countryName: text("country_name").notNull(),
  inflationRate: numeric("inflation_rate"),
  fxRateToUsd: numeric("fx_rate_to_usd"),
  gdpGrowthRate: numeric("gdp_growth_rate"),
  interestRate: numeric("interest_rate"),
  sourcedAt: timestamp("sourced_at", { withTimezone: true }),
  sourceNotes: text("source_notes"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertCountryEconomicDataSchema = createInsertSchema(countryEconomicData).pick({
  countryCode: true, countryName: true, inflationRate: true,
  fxRateToUsd: true, gdpGrowthRate: true, interestRate: true,
  sourcedAt: true, sourceNotes: true,
});
export type CountryEconomicData = typeof countryEconomicData.$inferSelect;
export type InsertCountryEconomicData = z.infer<typeof insertCountryEconomicDataSchema>;
