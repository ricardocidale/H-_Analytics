import { pgTable, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./auth";

export const conversations = pgTable("conversations", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  channel: text("channel").notNull().default("web"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("conversations_user_id_idx").on(table.userId),
]);

export const messages = pgTable("messages", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  conversationId: integer("conversation_id").references(() => conversations.id, { onDelete: "cascade" }).notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("messages_conversation_id_idx").on(table.conversationId),
]);
