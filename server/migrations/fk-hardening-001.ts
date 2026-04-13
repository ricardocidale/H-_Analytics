import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "fk-hardening-001";

const FK_CONSTRAINTS = [
  `ALTER TABLE "companies" ADD CONSTRAINT "companies_logo_id_logos_id_fk" FOREIGN KEY ("logo_id") REFERENCES "logos"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
  `ALTER TABLE "companies" ADD CONSTRAINT "companies_theme_id_design_themes_id_fk" FOREIGN KEY ("theme_id") REFERENCES "design_themes"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
  `ALTER TABLE "users" ADD CONSTRAINT "users_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
  `ALTER TABLE "users" ADD CONSTRAINT "users_selected_theme_id_design_themes_id_fk" FOREIGN KEY ("selected_theme_id") REFERENCES "design_themes"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
  `ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
  `ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_alert_rule_id_alert_rules_id_fk" FOREIGN KEY ("alert_rule_id") REFERENCES "alert_rules"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
  `ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
];

export async function runFkHardening001(): Promise<void> {
  let applied = 0;
  let alreadyExists = 0;
  const errors: string[] = [];

  for (const ddl of FK_CONSTRAINTS) {
    const constraintMatch = ddl.match(/ADD CONSTRAINT "([^"]+)"/);
    const constraintName = constraintMatch?.[1] ?? ddl.slice(0, 60);

    const exists = await db.execute(
      sql.raw(`SELECT 1 FROM pg_constraint WHERE conname = '${constraintName}' LIMIT 1`)
    );
    if ((exists as { rows: unknown[] }).rows.length > 0) {
      alreadyExists++;
      continue;
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

  logger.info(`[${TAG}] FK hardening complete: ${applied} applied, ${alreadyExists} already existed`);
}
