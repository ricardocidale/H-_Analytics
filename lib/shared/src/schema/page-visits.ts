import { pgTable, integer, text, boolean, timestamp, unique, index } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const userPageVisits = pgTable("user_page_visits", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  pageKey: text("page_key").notNull(),
  entityType: text("entity_type"),
  entityId: integer("entity_id"),
  firstVisitedAt: timestamp("first_visited_at").defaultNow(),
  lastVisitedAt: timestamp("last_visited_at").defaultNow(),
  lastSavedAt: timestamp("last_saved_at"),
  lastAnalystRunAt: timestamp("last_analyst_run_at"),
  endorsed: boolean("endorsed").default(false).notNull(),
  compulsoryFieldsComplete: boolean("compulsory_fields_complete").default(false).notNull(),
  visitCount: integer("visit_count").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  unique("uq_user_page_visit").on(table.userId, table.pageKey),
  index("idx_user_page_visits_user").on(table.userId),
  index("idx_user_page_visits_page").on(table.pageKey),
]);

export type UserPageVisit = typeof userPageVisits.$inferSelect;
export type InsertUserPageVisit = z.infer<typeof insertUserPageVisitSchema>;

export const insertUserPageVisitSchema = createInsertSchema(userPageVisits).pick({
  userId: true,
  pageKey: true,
  entityType: true,
  entityId: true,
  endorsed: true,
  compulsoryFieldsComplete: true,
});
