import { pgTable, integer, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const propertySlideDecks = pgTable("property_slide_decks", {
  propertyId: integer("property_id").primaryKey(),
  status: text("status").notNull().default("idle"),
  r2Key: text("r2_key"),
  fileSizeBytes: integer("file_size_bytes"),
  generatedAt: timestamp("generated_at", { withTimezone: true }),
  triggeredBy: text("triggered_by"),
  errorMessage: text("error_message"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`NOW()`),
});

export type PropertySlideDeck = typeof propertySlideDecks.$inferSelect;
export type InsertPropertySlideDeck = typeof propertySlideDecks.$inferInsert;
