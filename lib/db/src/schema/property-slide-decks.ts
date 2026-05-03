import { pgTable, integer, text, timestamp, primaryKey, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { properties } from "./properties";

export const propertySlideDecks = pgTable(
  "property_slide_deck_variants",
  {
    propertyId: integer("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
    format: text("format").notNull(),
    status: text("status").notNull().default("idle"),
    r2Key: text("r2_key"),
    fileSizeBytes: integer("file_size_bytes"),
    generatedAt: timestamp("generated_at", { withTimezone: true }),
    triggeredBy: text("triggered_by"),
    errorMessage: text("error_message"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`NOW()`),
  },
  (table) => [
    primaryKey({ columns: [table.propertyId, table.format] }),
    check("property_slide_deck_variants_format_check", sql`${table.format} IN ('pdf')`),
    check("property_slide_deck_variants_status_check", sql`${table.status} IN ('idle', 'generating', 'ready', 'error')`),
  ],
);

export type PropertySlideDeck = typeof propertySlideDecks.$inferSelect;
export type InsertPropertySlideDeck = typeof propertySlideDecks.$inferInsert;
