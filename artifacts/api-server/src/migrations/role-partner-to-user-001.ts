import { sql } from "drizzle-orm";
import { db } from "../db";

export async function migratePartnerToUser() {
  await db.execute(sql`UPDATE users SET role = 'user' WHERE role = 'partner'`);
}
