import { pgTable, text, integer, boolean, serial } from "drizzle-orm/pg-core";
import { z } from "zod";

export const externalIntegrations = pgTable("external_integrations", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(),
  serviceKey: text("service_key").notNull().unique(),
  name: text("name").notNull(),
  sourceType: text("source_type").notNull(),
  credentialEnvVar: text("credential_env_var"),
  host: text("host"),
  isEnabled: boolean("is_enabled").notNull().default(true),
  isSubscribed: boolean("is_subscribed").notNull().default(true),
  notes: text("notes"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const insertExternalIntegrationSchema = z.object({
  kind: z.enum(["api", "scraper"]),
  serviceKey: z.string().min(1),
  name: z.string().min(1),
  sourceType: z.string().min(1),
  credentialEnvVar: z.string().nullable().optional(),
  host: z.string().nullable().optional(),
  isEnabled: z.boolean().optional().default(true),
  isSubscribed: z.boolean().optional().default(true),
  notes: z.string().nullable().optional(),
  sortOrder: z.number().int().optional().default(0),
});

export const updateExternalIntegrationSchema = z.object({
  name: z.string().min(1).optional(),
  sourceType: z.string().min(1).optional(),
  credentialEnvVar: z.string().nullable().optional(),
  host: z.string().nullable().optional(),
  isEnabled: z.boolean().optional(),
  isSubscribed: z.boolean().optional(),
  notes: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
});

export type ExternalIntegration = typeof externalIntegrations.$inferSelect;
export type InsertExternalIntegration = z.infer<typeof insertExternalIntegrationSchema>;
export type UpdateExternalIntegration = z.infer<typeof updateExternalIntegrationSchema>;
