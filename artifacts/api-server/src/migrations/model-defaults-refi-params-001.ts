/**
 * model-defaults-refi-params-001 — Seed model_defaults rows for the three
 * per-property refinance parameters that previously fell back to hardcoded
 * TypeScript constants (Category 2 violations):
 *
 *   mc.funding.refiInterestRate   — refinance loan annual interest rate
 *   mc.funding.refiTermYears      — refinance amortization term in years
 *   mc.funding.refiClosingCostRate — refinance closing costs as % of loan
 *
 * These rows make the values admin-editable through Model Defaults UI and
 * allow hydratePropertyFinancials to guarantee non-null values at engine call
 * time, removing the need for ?? DEFAULT_* fallbacks in the engine.
 *
 * After seeding model_defaults, backfills any property rows where the column
 * is still NULL (existing properties created before this migration).
 *
 * Idempotent: ON CONFLICT DO NOTHING + UPDATE only NULL rows.
 *
 * Sources:
 *   SEED_REFI_INTEREST_RATE    — US commercial bridge/stabilized loan avg 2024 (Trepp)
 *   SEED_REFI_TERM_YEARS       — Standard commercial amortization (25 yrs, industry norm)
 *   SEED_REFI_CLOSING_COST_RATE— Industry standard 3% of loan (origination + title + legal)
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "[migration] model-defaults-refi-params-001";

const SEED_REFI_INTEREST_RATE     = 0.075; // Trepp 2024 US commercial stabilized loan avg
const SEED_REFI_TERM_YEARS        = 25;    // Standard commercial amortization term
const SEED_REFI_CLOSING_COST_RATE = 0.03;  // Industry norm: origination + title + legal

export async function runModelDefaultsRefiParams001(): Promise<void> {
  logger.info(`${TAG} — seeding model_defaults for refi params`);

  await db.execute(sql`
    INSERT INTO model_defaults (default_key, value, label, card, sub_tab, sort_order)
    VALUES
      ('mc.funding.refiInterestRate',    ${SEED_REFI_INTEREST_RATE},     'Refinance Interest Rate',    'funding', 'refinance', 310),
      ('mc.funding.refiTermYears',       ${SEED_REFI_TERM_YEARS},        'Refinance Term (years)',      'funding', 'refinance', 320),
      ('mc.funding.refiClosingCostRate', ${SEED_REFI_CLOSING_COST_RATE}, 'Refinance Closing Cost Rate', 'funding', 'refinance', 330)
    ON CONFLICT (default_key) WHERE country IS NULL AND business_type IS NULL DO NOTHING
  `);

  logger.info(`${TAG} — model_defaults rows seeded`);

  // Backfill property rows that still have NULL for these columns.
  const r1 = await db.execute(sql`
    UPDATE properties SET refinance_interest_rate = ${SEED_REFI_INTEREST_RATE}
    WHERE refinance_interest_rate IS NULL
  `);
  const r2 = await db.execute(sql`
    UPDATE properties SET refinance_term_years = ${SEED_REFI_TERM_YEARS}
    WHERE refinance_term_years IS NULL
  `);
  const r3 = await db.execute(sql`
    UPDATE properties SET refinance_closing_cost_rate = ${SEED_REFI_CLOSING_COST_RATE}
    WHERE refinance_closing_cost_rate IS NULL
  `);

  logger.info(
    `${TAG} — backfilled interest_rate=${(r1 as { rowCount?: number }).rowCount ?? 0}, ` +
    `term_years=${(r2 as { rowCount?: number }).rowCount ?? 0}, ` +
    `closing_cost_rate=${(r3 as { rowCount?: number }).rowCount ?? 0} property rows`,
  );
}
