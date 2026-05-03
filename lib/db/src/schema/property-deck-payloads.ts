/**
 * property-deck-payloads — sidecar table for editor-authored deck slot copy.
 *
 * One row per property. Holds the human-only and LLM-draft-then-approved
 * editorial slots for the 6-slide L+B canonical deck. Deterministic slots
 * (property name, specs, asking price, etc.) are NOT stored here — they are
 * derived at render time from `properties` and the finance engine.
 *
 * The `payload` jsonb conforms to `DeckPayloadV2` (see
 * `lib/shared/src/deck-payload-v2.ts`). It defaults to `{}` so a freshly
 * inserted row is safely renderable (the renderer uses deterministic
 * fallbacks for any missing slot).
 *
 * Architectural rationale: keeping editor copy in a sidecar (not on the hot
 * `properties` row) avoids TOAST bloat on the most-read table, gives a clean
 * audit boundary (`updated_by`/`updated_at` per property, untangled from
 * other property edits), and isolates this concern from the unrelated
 * `property_slide_deck_variants` table (which tracks PDF render artifacts).
 */
import { sql } from "drizzle-orm";
import { pgTable, integer, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { properties } from "./properties";
import { users } from "./auth";

export const propertyDeckPayloads = pgTable("property_deck_payloads", {
  propertyId: integer("property_id")
    .primaryKey()
    .references(() => properties.id, { onDelete: "cascade" }),
  payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),
  updatedBy: integer("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(sql`NOW()`)
    .$onUpdate(() => new Date()),
});

export const insertPropertyDeckPayloadSchema = createInsertSchema(propertyDeckPayloads).omit({
  updatedAt: true,
});
export type InsertPropertyDeckPayload = z.infer<typeof insertPropertyDeckPayloadSchema>;
export type PropertyDeckPayloadRow = typeof propertyDeckPayloads.$inferSelect;
