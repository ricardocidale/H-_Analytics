import { pgTable, text, real, integer, timestamp, unique, index } from "drizzle-orm/pg-core";
import { businessBrands } from "./core";

// --- MANAGEMENT COMPANY FEES TABLE ---
// Global Tier-A fee schedule: base management fee + incentive fee.
// These rates apply across all properties regardless of brand flag.
// Seeded at boot; admin-editable via the Management Co Fees admin panel.
export const managementCompanyFees = pgTable("management_company_fees", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  feeType: text("fee_type").notNull().unique(),
  rate: real("rate").notNull(),
  label: text("label").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  sourceUrl: text("source_url"),
  lastChecked: timestamp("last_checked"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type ManagementCompanyFee = typeof managementCompanyFees.$inferSelect;
export type InsertManagementCompanyFee = typeof managementCompanyFees.$inferInsert;

// --- BRAND FEES TABLE ---
// Per-flag fee schedule. Each row is one fee line for one brand flag.
// Hotel-flag rows: royalty, brand_marketing, loyalty, reservation, brand_tech.
// STR-flag rows: h_plus_str_brand_fee, channel_airbnb, channel_vrbo,
//                channel_booking, channel_plum_guide.
// Joined to business_brands via brand_slug (UNIQUE key on business_brands.slug).
export const brandFees = pgTable("brand_fees", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  brandSlug: text("brand_slug").notNull().references(() => businessBrands.slug, { onDelete: "restrict" }),
  feeType: text("fee_type").notNull(),
  rate: real("rate").notNull(),
  label: text("label").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  sourceUrl: text("source_url"),
  lastChecked: timestamp("last_checked"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  unique("brand_fees_brand_slug_fee_type_unique").on(table.brandSlug, table.feeType),
  index("brand_fees_brand_slug_idx").on(table.brandSlug),
]);

export type BrandFee = typeof brandFees.$inferSelect;
export type InsertBrandFee = typeof brandFees.$inferInsert;
