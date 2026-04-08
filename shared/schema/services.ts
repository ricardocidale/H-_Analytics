import { sql } from "drizzle-orm";
import { pgTable, text, varchar, real, integer, timestamp, jsonb, boolean, index, serial, unique, check, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { properties } from "./properties";
import {
  DEFAULT_SERVICE_MARKUP,
} from "../constants";

// --- COMPANY SERVICE TEMPLATES TABLE ---
// Company-level templates defining which services the management company provides
// to properties. Each template has a service model (centralized or direct) and a
// cost-plus markup percentage. These templates are the source of truth for:
//   1. Seeding new property_fee_categories when a property is created
//   2. Determining the company's cost-of-service in generateCompanyProForma()
// Categories are managed from the Company Assumptions > Service Categories section.
export const companyServiceTemplates = pgTable("company_service_templates", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  defaultRate: real("default_rate").notNull().default(0),
  serviceModel: text("service_model").notNull().default('centralized'),
  serviceMarkup: real("service_markup").notNull().default(DEFAULT_SERVICE_MARKUP),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  check("service_template_rate_range", sql`${table.defaultRate} >= 0 AND ${table.defaultRate} <= 1`),
  check("service_template_markup_range", sql`${table.serviceMarkup} >= 0 AND ${table.serviceMarkup} <= 1`),
  check("service_template_model_check", sql`${table.serviceModel} IN ('centralized', 'direct')`),
]);

export const insertServiceTemplateSchema = createInsertSchema(companyServiceTemplates).pick({
  name: true,
  defaultRate: true,
  serviceModel: true,
  serviceMarkup: true,
  isActive: true,
  sortOrder: true,
});

export const updateServiceTemplateSchema = z.object({
  name: z.string().optional(),
  defaultRate: z.number().min(0).max(1).optional(),
  serviceModel: z.enum(['centralized', 'direct']).optional(),
  serviceMarkup: z.number().min(0).max(1).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().optional(),
});

export type ServiceTemplate = typeof companyServiceTemplates.$inferSelect;
export type InsertServiceTemplate = z.infer<typeof insertServiceTemplateSchema>;
export type UpdateServiceTemplate = z.infer<typeof updateServiceTemplateSchema>;


// --- PROPERTY FEE CATEGORIES TABLE ---
// Granular breakdown of the management company's base fee for each property.
// Instead of a single 8.5% base fee, each property can itemize fees by service
// (Marketing, IT, Accounting, Reservations, General Management). The sum of
// all active category rates should approximate the base management fee rate.
// Auto-seeded with DEFAULT_SERVICE_FEE_CATEGORIES when a property is first created.
export const propertyFeeCategories = pgTable("property_fee_categories", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  propertyId: integer("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  rate: real("rate").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("fee_categories_property_id_idx").on(table.propertyId),
  check("fee_cat_rate_range", sql`${table.rate} >= 0 AND ${table.rate} <= 1`),
]);

export const insertFeeCategorySchema = createInsertSchema(propertyFeeCategories).pick({
  propertyId: true,
  name: true,
  rate: true,
  isActive: true,
  sortOrder: true,
});

export const updateFeeCategorySchema = z.object({
  name: z.string().optional(),
  rate: z.number().min(0).max(1).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().optional(),
});

export type FeeCategory = typeof propertyFeeCategories.$inferSelect;
export type InsertFeeCategory = z.infer<typeof insertFeeCategorySchema>;
export type UpdateFeeCategory = z.infer<typeof updateFeeCategorySchema>;


// --- PROPERTY PHOTOS TABLE ---
// Each property can have multiple photos stored in an album. One photo is marked
// as the "hero" (isHero=true) and its URL is synced to properties.imageUrl for
// backward compatibility with all existing display locations and exports.
export const propertyPhotos = pgTable("property_photos", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  propertyId: integer("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
  imageUrl: text("image_url").notNull(),
  caption: text("caption"),
  sortOrder: integer("sort_order").notNull().default(0),
  isHero: boolean("is_hero").notNull().default(false),
  variants: jsonb("variants").$type<{
    thumb?: string;
    card?: string;
    hero?: string;
    full?: string;
    original?: string;
  }>(),
  generationStyle: text("generation_style"),
  beforePhotoId: integer("before_photo_id"),
  // Base64-encoded image binary stored in Neon PostgreSQL for true persistence.
  // When present, the image is served directly from the DB at
  // /api/property-photos/:id/image, independent of Replit Object Storage.
  imageData: text("image_data"),
  enhancedImageData: text("enhanced_image_data"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("property_photos_property_id_idx").on(table.propertyId),
]);

export const insertPropertyPhotoSchema = createInsertSchema(propertyPhotos).pick({
  propertyId: true,
  imageUrl: true,
  caption: true,
  sortOrder: true,
  isHero: true,
  variants: true,
  generationStyle: true,
  beforePhotoId: true,
  imageData: true,
  enhancedImageData: true,
});

export const updatePropertyPhotoSchema = z.object({
  caption: z.string().nullable().optional(),
  sortOrder: z.number().optional(),
  isHero: z.boolean().optional(),
  variants: z.object({
    thumb: z.string().optional(),
    card: z.string().optional(),
    hero: z.string().optional(),
    full: z.string().optional(),
    original: z.string().optional(),
  }).nullable().optional(),
  enhancedImageData: z.string().nullable().optional(),
});

export type PropertyPhoto = typeof propertyPhotos.$inferSelect;
export type InsertPropertyPhoto = z.infer<typeof insertPropertyPhotoSchema>;
export type UpdatePropertyPhoto = z.infer<typeof updatePropertyPhotoSchema>;

