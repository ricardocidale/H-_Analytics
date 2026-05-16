import { pgTable, text, varchar, integer, timestamp, serial, index } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { users } from "./auth";

export const portfolios = pgTable("portfolios", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("portfolios_user_id_idx").on(table.userId),
]);

export type Portfolio = typeof portfolios.$inferSelect;
export type InsertPortfolio = typeof portfolios.$inferInsert;

export const insertPortfolioSchema = createInsertSchema(portfolios).pick({
  userId: true,
  name: true,
  description: true,
});

export const updatePortfolioSchema = insertPortfolioSchema
  .omit({ userId: true })
  .partial();

export const selectPortfolioSchema = createSelectSchema(portfolios);
