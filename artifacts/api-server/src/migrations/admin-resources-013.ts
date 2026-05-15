/**
 * admin-resources-013 — Seed lb-v7-pptx-template source row.
 *
 * Provisions the admin_resources 'source' row that backs
 * substituteSlotsFromAdminResource() in the U7 PPTX pipeline (marco.ts).
 *
 * The row stores the R2 key for the bare PPTX template extracted from the
 * v7 reconstruction package. At runtime, U7 downloads the template buffer
 * via config.r2Key, applies slot substitutions, and converts to PDF via
 * soffice on Railway.
 *
 * Idempotent — ON CONFLICT (kind, slug) DO NOTHING.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";
import {
  FACTORY_V2_PPTX_TEMPLATE_KIND,
  FACTORY_V2_PPTX_TEMPLATE_SLUG,
  FACTORY_V2_PPTX_TEMPLATE_R2_KEY,
} from "../slides/factory-v2-constants";

const TAG = "[migration] admin-resources-013";

export async function runAdminResources013(): Promise<void> {
  const result = await db.execute(sql`
    INSERT INTO admin_resources (kind, slug, display_name, description, config)
    VALUES (
      ${FACTORY_V2_PPTX_TEMPLATE_KIND},
      ${FACTORY_V2_PPTX_TEMPLATE_SLUG},
      'Factory v2 — L+B v7 PPTX Template',
      'Bare PPTX template for the slide factory v2 substitution pipeline (U7). Extracted from the v7 reconstruction package. R2 key points to the slot-ready presentation file used by substituteSlotsFromAdminResource().',
      ${JSON.stringify({ r2Key: FACTORY_V2_PPTX_TEMPLATE_R2_KEY })}::jsonb
    )
    ON CONFLICT (kind, slug) DO NOTHING
  `);

  const inserted = Number((result as { rowCount?: number }).rowCount ?? 0);
  if (inserted > 0) {
    logger.info(`${TAG} seeded ${FACTORY_V2_PPTX_TEMPLATE_SLUG} → ${FACTORY_V2_PPTX_TEMPLATE_R2_KEY}`);
  } else {
    logger.info(`${TAG} ${FACTORY_V2_PPTX_TEMPLATE_SLUG} already exists — skipping`);
  }
}
