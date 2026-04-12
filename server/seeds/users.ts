import { db } from "../db";
import { users, companies } from "@shared/schema";
import { eq, isNull, isNotNull } from "drizzle-orm";
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

export async function seedUserCompanyAssignments() {
  const usersWithCompany = await db.select().from(users).where(isNotNull(users.companyId)).limit(1);
  if (usersWithCompany.length > 0) {
    return;
  }

  const companyNameToEmail: Record<string, string[]> = seedUsersConfig.companyAssignments;

  const allCompanies = await db.select().from(companies);
  const companyMap: Record<string, number> = {};
  for (const c of allCompanies) {
    companyMap[c.name] = c.id;
  }

  let assigned = 0;
  for (const [companyName, emails] of Object.entries(companyNameToEmail)) {
    const companyId = companyMap[companyName];
    if (!companyId) continue;
    for (const email of emails) {
      const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (user && user.companyId !== companyId) {
        await db.update(users).set({ companyId }).where(eq(users.id, user.id));
        assigned++;
      }
    }
  }

  if (assigned > 0) {
    logger.info(`Assigned ${assigned} user(s) to their companies`, "seed");
  }
}
