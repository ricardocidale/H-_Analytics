import { sql } from "drizzle-orm";
import { db } from "../db";

export async function migrateCheckerInvestorToUser() {
  await db.execute(sql`UPDATE users SET role = 'user' WHERE role IN ('checker', 'investor')`);
}
