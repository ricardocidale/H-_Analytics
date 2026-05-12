import { pgTable, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";

// --- PROPERTY DESCRIPTOR CATALOG ---
// Defines the universe of valid property descriptor keys and how each one is
// scoped against the As-Purchased / As-Improved temporal split (Milestone B,
// task #1407). The catalog is **code/migration-defined** — never admin-editable
// — and surfaces read-only under Admin → AI → Intelligence → Knowledge &
// Resources → Tables per the 2026-05-11 contract.
//
// `scope` values:
//   identity        — immutable across the As-Purchased → As-Improved transition
//                     (e.g. yearBuilt, locationType). Stored once on the
//                     property; resolved as As-Purchased only.
//   parallel        — meaningful in BOTH As-Purchased and As-Improved (e.g.
//                     fbVenues, eventSpaceSqft, description). Effective value =
//                     improved ?? purchased.
//   purchased_only  — only meaningful for the as-acquired snapshot
//                     (e.g. priorSalePrice). Renovation cannot change.
//   improved_only   — only meaningful post-renovation (e.g.
//                     plannedReopeningYear).
//
// `typed_column_purchased` / `typed_column_improved` map a descriptor back to
// its existing snake_case typed column on `properties` during the dual-write
// migration window. Both nullable; an "improved_only" field has no purchased
// column, etc.
export const propertyDescriptorCatalog = pgTable("property_descriptor_catalog", {
  fieldKey: text("field_key").primaryKey(),
  groupName: text("group_name").notNull(),
  scope: text("scope").notNull(),
  dataType: text("data_type").notNull(),
  enumValues: jsonb("enum_values"),
  unit: text("unit"),
  displayLabel: text("display_label").notNull(),
  helpText: text("help_text"),
  sortOrder: integer("sort_order").notNull().default(0),
  typedColumnPurchased: text("typed_column_purchased"),
  typedColumnImproved: text("typed_column_improved"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type PropertyDescriptorCatalogRow =
  typeof propertyDescriptorCatalog.$inferSelect;

export type DescriptorScope =
  | "identity"
  | "parallel"
  | "purchased_only"
  | "improved_only";

export type DescriptorDataType =
  | "int"
  | "float"
  | "text"
  | "enum"
  | "bool";

export interface DescriptorCatalogEntry {
  fieldKey: string;
  groupName: string;
  scope: DescriptorScope;
  dataType: DescriptorDataType;
  enumValues?: string[];
  unit?: string;
  displayLabel: string;
  helpText?: string;
  sortOrder: number;
  /** snake_case column name on `properties` for the As-Purchased value */
  typedColumnPurchased?: string;
  /** snake_case column name on `properties` for the As-Improved value */
  typedColumnImproved?: string;
}
