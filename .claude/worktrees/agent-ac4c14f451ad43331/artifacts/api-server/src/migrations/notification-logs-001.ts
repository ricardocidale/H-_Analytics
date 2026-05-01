import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "notification-logs-001";

export async function runNotificationLogs001(): Promise<void> {
  const alterStatements = [
    `DO $$ BEGIN ALTER TABLE notification_logs RENAME COLUMN "error" TO "error_message"; EXCEPTION WHEN undefined_column THEN NULL; END $$`,
    `ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS "alert_rule_id" integer`,
    `DO $$ BEGIN ALTER TABLE notification_logs ADD CONSTRAINT notification_logs_alert_rule_id_fk FOREIGN KEY (alert_rule_id) REFERENCES alert_rules(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS "property_id" integer`,
    `DO $$ BEGIN ALTER TABLE notification_logs ADD CONSTRAINT notification_logs_property_id_fk FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS "retry_count" integer NOT NULL DEFAULT 0`,
    `ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT now() NOT NULL`,
    `UPDATE notification_logs SET created_at = now() WHERE created_at IS NULL`,
    `ALTER TABLE notification_logs ALTER COLUMN "created_at" SET NOT NULL`,
    `ALTER TABLE notification_logs ALTER COLUMN "created_at" SET DEFAULT now()`,
    `DO $$ BEGIN ALTER TABLE notification_settings RENAME COLUMN "key" TO "setting_key"; EXCEPTION WHEN undefined_column THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE notification_settings RENAME COLUMN "value" TO "setting_value"; EXCEPTION WHEN undefined_column THEN NULL; END $$`,
    `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS "user_id" integer`,
    `DO $$ BEGIN ALTER TABLE conversations ADD CONSTRAINT conversations_user_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `CREATE INDEX IF NOT EXISTS conversations_user_id_idx ON conversations (user_id)`,
    `DO $$ BEGIN ALTER TABLE alert_rules RENAME COLUMN "enabled" TO "is_active"; EXCEPTION WHEN undefined_column THEN NULL; END $$`,
    `ALTER TABLE alert_rules DROP COLUMN IF EXISTS "channels"`,
    `ALTER TABLE alert_rules DROP COLUMN IF EXISTS "created_by"`,
    `ALTER TABLE notification_preferences DROP COLUMN IF EXISTS "channels"`,
    `ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS "channel" text NOT NULL DEFAULT 'email'`,
    `ALTER TABLE notification_preferences DROP COLUMN IF EXISTS "updated_at"`,
    `DELETE FROM notification_preferences a USING notification_preferences b WHERE a.id > b.id AND a.user_id = b.user_id AND a.event_type = b.event_type AND a.channel = b.channel`,
    `CREATE UNIQUE INDEX IF NOT EXISTS notification_pref_unique ON notification_preferences (user_id, event_type, channel)`,
    `CREATE INDEX IF NOT EXISTS notification_prefs_user_id_idx ON notification_preferences (user_id)`,
    `DO $$ BEGIN ALTER TABLE companies ADD CONSTRAINT companies_logo_id_fk FOREIGN KEY (logo_id) REFERENCES logos(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE companies ADD CONSTRAINT companies_theme_id_fk FOREIGN KEY (theme_id) REFERENCES design_themes(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE users ADD CONSTRAINT users_selected_theme_id_fk FOREIGN KEY (selected_theme_id) REFERENCES design_themes(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE users ADD CONSTRAINT users_company_id_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE notification_preferences ADD CONSTRAINT notification_preferences_user_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE alert_rules ADD CONSTRAINT alert_rules_property_id_fk FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE property_fee_categories ADD CONSTRAINT property_fee_categories_property_id_fk FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE property_photos ADD CONSTRAINT property_photos_property_id_fk FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE property_photos ADD CONSTRAINT property_photos_before_photo_id_fk FOREIGN KEY (before_photo_id) REFERENCES property_photos(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE global_assumptions ADD CONSTRAINT ga_asset_logo_id_fk FOREIGN KEY (asset_logo_id) REFERENCES logos(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE global_assumptions ADD CONSTRAINT ga_company_logo_id_fk FOREIGN KEY (company_logo_id) REFERENCES logos(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  ];

  for (const ddl of alterStatements) {
    try {
      await db.execute(sql.raw(ddl));
    } catch (error: unknown) {
      const pgCode = (error as { code?: string })?.code;
      if (pgCode === "42701") {
        continue;
      }
      logger.error(`[${TAG}] Migration step failed: ${ddl.slice(0, 80)}… — ${String(error)}`, TAG);
      throw error;
    }
  }
  logger.info(`[${TAG}] Migration complete`, TAG);
}
