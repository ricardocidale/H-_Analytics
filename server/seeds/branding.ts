import { db } from "../db";
import { eq } from "drizzle-orm";
import { logos, companies, designThemes } from "@shared/schema";
import { logger } from "../logger";
import { SEED_COMPANY_IDENTITY } from "./properties";

export async function seedDefaultLogos() {
  const existingLogos = await db.select().from(logos);

  const hasNewLogo = existingLogos.some(l => l.url === "/logos/h-logo-glass.png");
  if (!hasNewLogo && existingLogos.length > 0) {
    await db.update(logos).set({ isDefault: false }).where(eq(logos.isDefault, true));
    await db.insert(logos).values({
      name: "H+ Analytics",
      companyName: "H+ Analytics",
      url: "/logos/h-logo-glass.png",
      isDefault: true,
    });
    logger.info("Added new H+ Analytics logo and set as default", "seed");
  }

  if (existingLogos.length > 0) return;

  await db.insert(logos).values([
    {
      name: "H+ Analytics",
      companyName: "H+ Analytics",
      url: "/logos/h-logo-glass.png",
      isDefault: true,
      isAppLogo: true,
    },
    {
      name: "Boutique Elegance",
      companyName: "Boutique Hotel Group",
      url: "/logos/norfolk-ai-blue.png",
      isDefault: false,
    },
    {
      name: "Classic Hospitality",
      companyName: "Hospitality Management Co.",
      url: "/logos/norfolk-ai-yellow.png",
      isDefault: false,
    },
    {
      name: "Modern Resort",
      companyName: "Resort Partners",
      url: "/logos/norfolk-ai-wireframe.png",
      isDefault: false,
    },
  ]);
  logger.info("Seeded default logos: H+ Analytics (default + app) + 3 generic", "seed");
}

export async function seedCompanies() {
  const [defaultTheme] = await db.select().from(designThemes).where(eq(designThemes.isDefault, true));
  const defaultThemeId = defaultTheme?.id ?? null;

  const existing = await db.select().from(companies);
  const existingNames = new Set(existing.map(c => c.name));

  if (existing.length > 0) {
    // Companies already exist — only ensure "General" exists (required by system).
    // Do NOT re-create user-deleted companies on restart.
    if (!existingNames.has("General")) {
      await db.insert(companies).values({ name: "General", type: "spv", description: "Default catch-all company", themeId: defaultThemeId });
      logger.info("Re-created required 'General' company", "seed");
    }
  } else {
    const companiesToSeed = [
      { name: SEED_COMPANY_IDENTITY.companyName, type: "management" as const, description: "AI-powered hospitality technology and management group based in Norfolk, VA" },
      { name: "General", type: "spv" as const, description: "Default catch-all company" },
    ];

    for (const c of companiesToSeed) {
      await db.insert(companies).values({ ...c, themeId: defaultThemeId });
    }
    logger.info(`Seeded ${companiesToSeed.length} companies (themeId=${defaultThemeId})`, "seed");
  }

  if (defaultThemeId) {
    const needsUpdate = existing.filter(c => c.themeId !== defaultThemeId);
    for (const c of needsUpdate) {
      await db.update(companies).set({ themeId: defaultThemeId }).where(eq(companies.id, c.id));
    }
    if (needsUpdate.length > 0) {
      logger.info(`Assigned default theme to ${needsUpdate.length} existing companies`, "seed");
    }
  }

  const allCompanies = await db.select().from(companies);
  const [defaultLogo] = await db.select().from(logos).where(eq(logos.isDefault, true));
  if (defaultLogo) {
    let assigned = 0;
    for (const c of allCompanies) {
      if (c.logoId) continue;
      await db.update(companies).set({ logoId: defaultLogo.id }).where(eq(companies.id, c.id));
      assigned++;
    }
    if (assigned > 0) {
      logger.info(`Assigned default logo to ${assigned} companies without logos`, "seed");
    }
  }
}
