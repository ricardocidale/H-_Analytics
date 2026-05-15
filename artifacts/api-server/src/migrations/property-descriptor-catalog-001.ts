// Property Descriptor Catalog re-seeder.
//
// Plan 2026-05-13-002 U2 — companion to migration 0054, invoked by the
// Knowledge & Resources Analyst button so admins can restore any descriptor
// rows that were manually deleted in the database. Idempotent: each entry is
// upserted via ON CONFLICT DO UPDATE so the catalog always matches the
// codebase source of truth in `lib/db/src/property-descriptor-catalog-seed.ts`.
//
// The DDL itself lives in migration 0054 — this runner only re-asserts data
// rows. It must remain safe to invoke at any time.
import { sql } from "drizzle-orm";
import { db, PROPERTY_DESCRIPTOR_CATALOG } from "@workspace/db";
import { logger } from "../logger";

export interface PropertyDescriptorCatalogReseedResult {
  rowsUpserted: number;
}

export async function runPropertyDescriptorCatalog001(): Promise<PropertyDescriptorCatalogReseedResult> {
  let upserted = 0;
  for (const entry of PROPERTY_DESCRIPTOR_CATALOG) {
    const enumValuesJson = entry.enumValues ? JSON.stringify(entry.enumValues) : null;
    await db.execute(sql`
      INSERT INTO property_descriptor_catalog (
        field_key, group_name, scope, data_type, enum_values,
        unit, display_label, help_text, sort_order,
        typed_column_purchased, typed_column_improved
      ) VALUES (
        ${entry.fieldKey},
        ${entry.groupName},
        ${entry.scope},
        ${entry.dataType},
        ${enumValuesJson === null ? null : sql`${enumValuesJson}::jsonb`},
        ${entry.unit ?? null},
        ${entry.displayLabel},
        ${entry.helpText ?? null},
        ${entry.sortOrder},
        ${entry.typedColumnPurchased ?? null},
        ${entry.typedColumnImproved ?? null}
      )
      ON CONFLICT (field_key) DO UPDATE SET
        group_name             = EXCLUDED.group_name,
        scope                  = EXCLUDED.scope,
        data_type              = EXCLUDED.data_type,
        enum_values            = EXCLUDED.enum_values,
        unit                   = EXCLUDED.unit,
        display_label          = EXCLUDED.display_label,
        help_text              = EXCLUDED.help_text,
        sort_order             = EXCLUDED.sort_order,
        typed_column_purchased = EXCLUDED.typed_column_purchased,
        typed_column_improved  = EXCLUDED.typed_column_improved
    `);
    upserted += 1;
  }
  logger.info(
    `Property descriptor catalog re-seeded: ${upserted} rows upserted`,
    "knowledge-registry",
  );
  return { rowsUpserted: upserted };
}
