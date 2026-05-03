import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "fk-hardening-001";

// NOTE: `users_company_id_companies_id_fk` was intentionally removed on
// 2026-04-24 during the Helium → Neon cutover. The `users.company_id` column
// has never existed in production (`users.company` is a free-text field, not
// an FK), so the constraint was a permanent no-op that masked schema drift.
// If a future migration adds a real `users.company_id` column, re-add the FK
// here as a fresh entry rather than reviving this one.
const FK_CONSTRAINTS = [
  `ALTER TABLE "companies" ADD CONSTRAINT "companies_logo_id_logos_id_fk" FOREIGN KEY ("logo_id") REFERENCES "logos"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
  `ALTER TABLE "companies" ADD CONSTRAINT "companies_theme_id_design_themes_id_fk" FOREIGN KEY ("theme_id") REFERENCES "design_themes"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
  `ALTER TABLE "users" ADD CONSTRAINT "users_selected_theme_id_design_themes_id_fk" FOREIGN KEY ("selected_theme_id") REFERENCES "design_themes"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
  `ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
  `ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_alert_rule_id_alert_rules_id_fk" FOREIGN KEY ("alert_rule_id") REFERENCES "alert_rules"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
  `ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
];

export async function runFkHardening001(): Promise<void> {
  let applied = 0;
  let alreadyExists = 0;
  let skippedMissingColumn = 0;
  const errors: string[] = [];

  for (const ddl of FK_CONSTRAINTS) {
    const constraintMatch = ddl.match(/ADD CONSTRAINT "([^"]+)"/);
    const constraintName = constraintMatch?.[1] ?? ddl.slice(0, 60);

    // Parse source table + column and target table + column from the DDL
    const parsed = ddl.match(
      /ALTER TABLE "([^"]+)" ADD CONSTRAINT "[^"]+" FOREIGN KEY \("([^"]+)"\) REFERENCES "([^"]+)"\("([^"]+)"\)/,
    );

    const exists = await db.execute(
      sql.raw(`SELECT 1 FROM pg_constraint WHERE conname = '${constraintName}' LIMIT 1`),
    );
    if ((exists as { rows: unknown[] }).rows.length > 0) {
      alreadyExists++;
      continue;
    }

    // Verify both source and target columns exist before attempting; otherwise skip gracefully.
    if (parsed) {
      const [, srcTable, srcCol, tgtTable, tgtCol] = parsed;
      const colCheck = await db.execute(
        sql.raw(
          `SELECT
             (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${srcTable}' AND column_name = '${srcCol}' LIMIT 1) AS src,
             (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${tgtTable}' AND column_name = '${tgtCol}' LIMIT 1) AS tgt`,
        ),
      );
      const row = (colCheck as unknown as { rows: Array<{ src: number | null; tgt: number | null }> }).rows[0];
      if (!row?.src || !row?.tgt) {
        skippedMissingColumn++;
        const which = !row?.src ? `${srcTable}.${srcCol}` : `${tgtTable}.${tgtCol}`;
        logger.warn(`[${TAG}] Skipping ${constraintName}: column ${which} does not exist`);
        continue;
      }
    }

    try {
      await db.execute(sql.raw(ddl));
      applied++;
      logger.info(`[${TAG}] Applied: ${constraintName}`);
    } catch (error: unknown) {
      const msg = `Failed to apply ${constraintName}: ${String(error)}`;
      logger.error(`[${TAG}] ${msg}`, TAG);
      errors.push(msg);
    }
  }

  if (errors.length > 0) {
    throw new Error(`[${TAG}] ${errors.length} FK constraint(s) failed:\n${errors.join("\n")}`);
  }

  logger.info(
    `[${TAG}] FK hardening complete: ${applied} applied, ${alreadyExists} already existed, ${skippedMissingColumn} skipped (missing columns)`,
  );
}
