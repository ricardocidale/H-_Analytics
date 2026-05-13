/**
 * icp-data.ts — DB cache tables for national research feeds that power
 * the ICP bracket model (R11–R14, docs/brainstorms/icp-simplification/requirements.md).
 *
 * Both tables store a single national number per service line, refreshable
 * from research. Mgmt Co calculations read from these tables at calc time;
 * a national refresh updates every Mgmt Co on next calc run.
 *
 * Minions:
 *   - Gaetano (MinionVendorPassthroughCosts) — populates vendor_passthrough_costs
 *   - Renato (MinionMgmtCoMarkupFactors)     — populates mgmt_co_markup_factors
 */
import {
  pgTable,
  integer,
  text,
  doublePrecision,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// ────────────────────────────────────────────────────────────────────────────
// vendor_passthrough_costs — national vendor cost as percent of revenue per
// service line. Populated by MinionVendorPassthroughCosts (Gaetano) weekly.
//
// cost_pct_revenue is stored as a decimal fraction (e.g. 0.03 = 3% of revenue).
//
// Unique key: (service_line, source, period). Upserts update cost_pct_revenue +
// source_url when the same service_line+source+period is re-fetched.
// ────────────────────────────────────────────────────────────────────────────

export const vendorPassthroughCosts = pgTable(
  "vendor_passthrough_costs",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    // Service line identifier, e.g. "marketing", "it", "accounting", "reservations",
    // "housekeeping", "maintenance", "revenue_management", "food_beverage".
    serviceLine: text("service_line").notNull(),
    // National vendor cost as decimal fraction of total revenue.
    // e.g. 0.03 = 3% of revenue.
    costPctRevenue: doublePrecision("cost_pct_revenue").notNull(),
    // Period string, e.g. "2024-H2", "2025-Q1", "2025-annual".
    period: text("period").notNull(),
    // Research source identifier, e.g. "str-global", "cbre", "hvs", "pkf",
    // "exa-research", "hma-handbook".
    source: text("source").notNull(),
    // Direct URL to the source document or page (nullable — some sources are
    // behind paywalls and only the publisher name is recorded).
    sourceUrl: text("source_url"),
    // Optional bracket scope (icp_brackets.slug). NULL means the rate is
    // universal across all brackets. Populated when source data breaks
    // down by archetype (Phase B of the bracket-mix peer-derived rebuild plan).
    bracketSlug: text("bracket_slug"),
    fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("vendor_passthrough_costs_line_source_period_uniq").on(
      t.serviceLine,
      t.source,
      t.period,
    ),
    index("vendor_passthrough_costs_service_line_idx").on(t.serviceLine),
    index("vendor_passthrough_costs_fetched_idx").on(t.fetchedAt),
  ],
);

export type VendorPassthroughCostRow = typeof vendorPassthroughCosts.$inferSelect;
export type InsertVendorPassthroughCost = typeof vendorPassthroughCosts.$inferInsert;

// ────────────────────────────────────────────────────────────────────────────
// mgmt_co_markup_factors — Management Company markup applied on top of vendor
// pass-through costs, expressed as percent of revenue. Populated by
// MinionMgmtCoMarkupFactors (Renato) weekly.
//
// markup_pct_revenue is stored as a decimal fraction (e.g. 0.015 = 1.5% of
// revenue). Design choice per requirements: stored as % of revenue (additive
// to R11 cost), not as a multiplier on the vendor cost. See R12 outstanding
// question in requirements.md.
//
// Unique key: (service_line, source, period).
// ────────────────────────────────────────────────────────────────────────────

export const mgmtCoMarkupFactors = pgTable(
  "mgmt_co_markup_factors",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    serviceLine: text("service_line").notNull(),
    // Mgmt Co markup as decimal fraction of total revenue.
    // e.g. 0.015 = 1.5% of revenue additive markup on pass-through.
    markupPctRevenue: doublePrecision("markup_pct_revenue").notNull(),
    period: text("period").notNull(),
    source: text("source").notNull(),
    sourceUrl: text("source_url"),
    // Optional bracket scope (icp_brackets.slug). NULL means the markup is
    // universal across all brackets. Populated when source data breaks
    // down by archetype (Phase B of the bracket-mix peer-derived rebuild plan).
    bracketSlug: text("bracket_slug"),
    fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("mgmt_co_markup_factors_line_source_period_uniq").on(
      t.serviceLine,
      t.source,
      t.period,
    ),
    index("mgmt_co_markup_factors_service_line_idx").on(t.serviceLine),
    index("mgmt_co_markup_factors_fetched_idx").on(t.fetchedAt),
  ],
);

export type MgmtCoMarkupFactorRow = typeof mgmtCoMarkupFactors.$inferSelect;
export type InsertMgmtCoMarkupFactor = typeof mgmtCoMarkupFactors.$inferInsert;
