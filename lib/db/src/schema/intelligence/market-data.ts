import { pgTable, text, integer, real, timestamp, boolean, jsonb, index, unique, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { users } from "../auth";
import { properties } from "../properties";

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
]);

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
