import { pgTable, integer, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { properties } from "./properties";

/**
 * lb_slides_config — single-row table (id always = 1, upserted).
 *
 * Stores the admin-selected property assignments for the LB Slide Deck:
 *   slide1, 2, 3, 5 — admin-picked properties (nullable until configured)
 *   slide4, slide6  — auto-generated (portfolio grid / 10-yr aggregate); no FK needed
 */
export const lbSlidesConfig = pgTable("lb_slides_config", {
  id: integer("id").primaryKey().default(1),
  slide1PropertyId: integer("slide1_property_id").references(() => properties.id, {
    onDelete: "set null",
  }),
  slide2PropertyId: integer("slide2_property_id").references(() => properties.id, {
    onDelete: "set null",
  }),
  slide3PropertyId: integer("slide3_property_id").references(() => properties.id, {
    onDelete: "set null",
  }),
  slide5PropertyId: integer("slide5_property_id").references(() => properties.id, {
    onDelete: "set null",
  }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`NOW()`),
});

export type LbSlidesConfig = typeof lbSlidesConfig.$inferSelect;
export type InsertLbSlidesConfig = typeof lbSlidesConfig.$inferInsert;
