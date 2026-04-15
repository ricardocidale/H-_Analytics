import { sql } from "drizzle-orm";
import { pgTable, text, varchar, real, integer, timestamp, jsonb, boolean, index, serial, unique, check, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { designThemes } from "./core";

// --- USERS TABLE ---
// Every person who can log in. Roles control what they can see and do:
//   - "admin": full access — manage users, properties, assumptions, run verifications
//   - "user": general access — can edit properties and assumptions
//   - "checker": independent auditor — read-only access plus verification tools
//   - "investor": limited view — sees dashboard and reports but cannot edit
// Company is a free-text field for organizational display purposes.
export const users = pgTable("users", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  role: text("role").notNull().default("user"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  company: text("company"),
  title: text("title"),
  selectedThemeId: integer("selected_theme_id").references(() => designThemes.id, { onDelete: "set null" }),
  phoneNumber: text("phone_number"),
  googleId: text("google_id"),
  googleAccessToken: text("google_access_token"),
  googleRefreshToken: text("google_refresh_token"),
  googleTokenExpiry: timestamp("google_token_expiry"),
  hideTourPrompt: boolean("hide_tour_prompt").default(false).notNull(),
  canManageScenarios: boolean("can_manage_scenarios").default(true).notNull(),
  rebeccaOptOut: boolean("rebecca_opt_out").default(false).notNull(),
  colorMode: text("color_mode"),
  bgAnimation: text("bg_animation"),
  fontPreference: text("font_preference"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("users_phone_number_idx").on(table.phoneNumber),
]);

export const VALID_USER_ROLES = ["super_admin", "admin", "user", "checker", "investor"] as const;
export type UserRole = typeof VALID_USER_ROLES[number];

export const insertUserSchema = z.object({
  email: z.string(),
  passwordHash: z.string().nullable().optional(),
  role: z.enum(VALID_USER_ROLES).optional().default("user"),
  firstName: z.string().nullable().optional(),
  lastName: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  phoneNumber: z.string().nullable().optional(),
  googleId: z.string().nullable().optional(),
});

export const selectUserSchema = createSelectSchema(users);

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;


// --- SESSIONS TABLE ---
// Cookie-based sessions for authentication. Each session has an expiration date;
// expired sessions are cleaned up hourly by the server. Deleting a session = logout.
export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("sessions_user_id_idx").on(table.userId),
  index("sessions_expires_at_idx").on(table.expiresAt),
]);

export type Session = typeof sessions.$inferSelect;

export const userDefaultProperties = pgTable("user_default_properties", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  propertyId: integer("property_id").notNull(),
  isActive: boolean("is_active").notNull().default(true),
}, (table) => [
  unique("uq_user_default_property").on(table.userId, table.propertyId),
  index("user_default_properties_user_id_idx").on(table.userId),
]);

export type UserDefaultProperty = typeof userDefaultProperties.$inferSelect;
