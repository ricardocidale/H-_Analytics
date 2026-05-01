import { db } from "../db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { logger } from "../logger";
import { UserRole } from "@shared/constants";
import seedUsersConfig from "../seed-users.json" with { type: "json" };


export async function seedUsers() {
  const adminSeed = seedUsersConfig.users.find(u => u.role === UserRole.ADMIN);
  if (!adminSeed) return;

  const existingAdmin = await db.select().from(users).where(eq(users.email, adminSeed.email)).limit(1);
  if (existingAdmin.length === 0) {
    const password = process.env[adminSeed.envVar] || process.env.PASSWORD_DEFAULT;
    if (!password) {
      logger.warn(`${adminSeed.envVar} not set and no PASSWORD_DEFAULT. Skipping admin seed.`, "seed");
      return;
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    await db.insert(users).values({
      email: adminSeed.email,
      passwordHash: hashedPassword,
      firstName: adminSeed.firstName,
      lastName: adminSeed.lastName,
      role: adminSeed.role,
    });
    logger.info(`Created admin user (email: ${adminSeed.email})`, "seed");
  }
}
