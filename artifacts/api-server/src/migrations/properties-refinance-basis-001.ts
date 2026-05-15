/**
 * properties-refinance-basis-001 — Add refinance_basis column to properties.
 *
 * Three-way selection for how the property value is estimated when sizing a
 * refinance loan:
 *   'purchase_price'                   — original purchase price (default)
 *   'purchase_price_plus_improvements' — purchase price + building improvements
 *   'appreciated_asset'                — income-cap (NOI ÷ exit cap rate)
 *
 * All existing rows default to 'purchase_price', matching the engine's prior
 * conservative behaviour (and the explicit decision recorded in the session
 * history: refi basis = purchase price, not appreciated asset).
 *
 * Idempotent: ADD COLUMN IF NOT EXISTS + UPDATE only NULL rows.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "[migration] properties-refinance-basis-001";

export async function runPropertiesRefinanceBasis001(): Promise<void> {
  logger.info(`${TAG} — adding refinance_basis column`);

  await db.execute(sql`
    ALTER TABLE properties
    ADD COLUMN IF NOT EXISTS refinance_basis TEXT
  `);

  const result = await db.execute(sql`
    UPDATE properties
    SET refinance_basis = 'purchase_price'
    WHERE refinance_basis IS NULL
  `);

  logger.info(`${TAG} — backfilled ${(result as { rowCount?: number }).rowCount ?? 0} rows to 'purchase_price'`);
}
