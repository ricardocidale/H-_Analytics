import { sql } from "drizzle-orm";
import { pgTable, text, integer, real, timestamp, boolean, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { properties } from "./properties";
import { users } from "./auth";
import { DD_STATUSES, DD_WORKSTREAMS } from "../dd-template";

// --- DD TEMPLATE ITEMS ---
// Mirror of the canonical hospitality DD checklist defined in
// `shared/dd-template.ts`. The catalog seeds rows here on startup; admins
// override per-row defaults from the Constants area without a code change.
// `key` is the stable identifier shared with the code template — adding a
// row in code inserts here; removing a row in code archives the row but
// keeps it for existing per-property instances.
export const ddTemplateItems = pgTable(
  "dd_template_items",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    key: text("key").notNull(),
    workstream: text("workstream").notNull(),
    label: text("label").notNull(),
    description: text("description").notNull(),
    isStopGate: boolean("is_stop_gate").notNull().default(false),
    defaultVendorType: text("default_vendor_type"),
    sortOrder: integer("sort_order").notNull().default(0),
    archived: boolean("archived").notNull().default(false),
    templateVersion: integer("template_version").notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("dd_template_items_key_uniq").on(t.key),
    index("dd_template_items_workstream_idx").on(t.workstream),
    check("dd_template_items_workstream_valid", sql`${t.workstream} IN (${sql.join(DD_WORKSTREAMS.map(w => sql`${w}`), sql`, `)})`),
  ],
);

export const insertDdTemplateItemSchema = createInsertSchema(ddTemplateItems).pick({
  key: true,
  workstream: true,
  label: true,
  description: true,
  isStopGate: true,
  defaultVendorType: true,
  sortOrder: true,
  templateVersion: true,
});

export const updateDdTemplateItemSchema = z.object({
  label: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  isStopGate: z.boolean().optional(),
  defaultVendorType: z.string().max(120).nullable().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  archived: z.boolean().optional(),
});

export type DdTemplateItemRow = typeof ddTemplateItems.$inferSelect;
export type InsertDdTemplateItem = z.infer<typeof insertDdTemplateItemSchema>;
export type UpdateDdTemplateItem = z.infer<typeof updateDdTemplateItemSchema>;

// --- PROPERTY DD ITEMS ---
// One row per (property, template item). Created lazily when a target is
// "seeded from template". Status / owner / vendor / cost / findings are
// all per-property; the template item supplies the immutable
// label/description/stop-gate flag (denormalized at seed time so a future
// label edit doesn't silently rewrite history on a closed deal).
export const propertyDdItems = pgTable(
  "property_dd_items",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    propertyId: integer("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
    templateItemKey: text("template_item_key").notNull(),
    workstream: text("workstream").notNull(),
    label: text("label").notNull(),
    isStopGate: boolean("is_stop_gate").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),

    status: text("status").notNull().default("not_started"),
    ownerUserId: integer("owner_user_id").references(() => users.id, { onDelete: "set null" }),
    ownerName: text("owner_name"),
    vendor: text("vendor"),
    dueDate: text("due_date"),
    costEstimate: real("cost_estimate"),
    costActual: real("cost_actual"),
    findings: text("findings"),
    /** Linked object-storage URL to the underlying report (out of v1 scope to upload). */
    documentUrl: text("document_url"),

    seededAt: timestamp("seeded_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("property_dd_items_property_key_uniq").on(t.propertyId, t.templateItemKey),
    index("property_dd_items_property_idx").on(t.propertyId),
    index("property_dd_items_workstream_idx").on(t.workstream),
    index("property_dd_items_owner_user_id_idx").on(t.ownerUserId),
    check("property_dd_items_status_valid", sql`${t.status} IN (${sql.join(DD_STATUSES.map(s => sql`${s}`), sql`, `)})`),
  ],
);

export const updatePropertyDdItemSchema = z.object({
  status: z.enum(DD_STATUSES).optional(),
  ownerUserId: z.number().int().positive().nullable().optional(),
  ownerName: z.string().max(200).nullable().optional(),
  vendor: z.string().max(200).nullable().optional(),
  dueDate: z.string().max(20).nullable().optional(),
  costEstimate: z.number().min(0).nullable().optional(),
  costActual: z.number().min(0).nullable().optional(),
  findings: z.string().max(5000).nullable().optional(),
  documentUrl: z.string().url().max(2048).nullable().optional(),
});

export type PropertyDdItemRow = typeof propertyDdItems.$inferSelect;
export type UpdatePropertyDdItem = z.infer<typeof updatePropertyDdItemSchema>;
