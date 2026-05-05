import { pgTable, integer, timestamp, text } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { properties } from "./properties";

/**
 * lb_slides_config — single-row table (id always = 1, upserted).
 *
 * Stores the admin-selected property assignments for the LB Slide Deck:
 *   slide1, 2, 3, 5 — admin-picked properties (nullable until configured)
 *   slide4, slide6  — auto-generated (portfolio grid / 10-yr aggregate); no FK needed
 *
 * Global copy fields for auto-generated slides:
 *   slide4SectionSubtitle — optional subtitle shown below the slide 4 header
 *   slide6Disclaimer      — optional disclaimer text in the slide 6 callout box
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
  slide4SectionSubtitle: text("slide4_section_subtitle"),
  slide6Disclaimer: text("slide6_disclaimer"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`NOW()`),
});

export type LbSlidesConfig = typeof lbSlidesConfig.$inferSelect;
export type InsertLbSlidesConfig = typeof lbSlidesConfig.$inferInsert;
