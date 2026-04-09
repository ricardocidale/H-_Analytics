import { sql } from "drizzle-orm";
import { db } from "../db";
import { log } from "../logger";

interface DuplicateFk {
  table: string;
  drop: string;
  keep: string;
}

const DUPLICATE_FKS: DuplicateFk[] = [
  {
    table: "notification_logs",
    drop: "notification_logs_alert_rule_id_fkey",
    keep: "notification_logs_alert_rule_id_fk",
  },
  {
    table: "notification_logs",
    drop: "notification_logs_property_id_fkey",
    keep: "notification_logs_property_id_fk",
  },
  {
    table: "conversations",
    drop: "conversations_user_id_fkey",
    keep: "conversations_user_id_fk",
  },
];

export async function runDbHygiene001() {
  const TAG = "[migration] db-hygiene-001";

  try {
    let totalDropped = 0;

    for (const { table, drop, keep } of DUPLICATE_FKS) {
      try {
        const result = await db.execute(sql`
          SELECT constraint_name
          FROM information_schema.table_constraints
          WHERE table_name = ${table}
            AND constraint_type = 'FOREIGN KEY'
            AND constraint_name IN (${drop}, ${keep})
        `);
        const names = new Set(result.rows.map((r: any) => r.constraint_name));

        if (names.has(drop) && names.has(keep)) {
          await db.execute(
            sql.raw(`ALTER TABLE "${table}" DROP CONSTRAINT "${drop}"`)
          );
          totalDropped++;
          log(`Dropped duplicate FK ${drop} (keeper: ${keep})`, TAG);
        } else if (names.has(drop) && !names.has(keep)) {
          log(`Skipping ${drop} — keeper ${keep} not found`, TAG);
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        if (!errMsg.includes("does not exist")) {
          log(`Failed to drop ${drop}: ${errMsg}`, TAG, "warn");
        }
      }
    }

    log(`FK phase complete — dropped ${totalDropped} duplicate FK(s)`, TAG);
  } catch (error: unknown) {
    log(`FK phase failed: ${error instanceof Error ? error.message : String(error)}`, TAG, "error");
  }
}

export async function cleanOrphanedLogos() {
  const TAG = "[migration] db-hygiene-001";

  try {
    const result = await db.execute(sql`
      DELETE FROM logos
      WHERE is_default = false
        AND url NOT LIKE '/logos/h-plus-%'
        AND id NOT IN (
          SELECT logo_id FROM companies WHERE logo_id IS NOT NULL
          UNION
          SELECT logo_id FROM user_groups WHERE logo_id IS NOT NULL
          UNION
          SELECT company_logo_id FROM global_assumptions WHERE company_logo_id IS NOT NULL
          UNION
          SELECT asset_logo_id FROM global_assumptions WHERE asset_logo_id IS NOT NULL
        )
    `);
    const orphanCount = result.rowCount ?? 0;
    if (orphanCount > 0) {
      log(`Removed ${orphanCount} orphaned logo rows`, TAG);
    } else {
      log("No orphaned logos found", TAG);
    }
  } catch (error: unknown) {
    log(`Logo cleanup failed: ${error instanceof Error ? error.message : String(error)}`, TAG, "error");
  }
}
