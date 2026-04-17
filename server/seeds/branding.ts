import { db } from "../db";
import { eq, sql } from "drizzle-orm";
import { logos, companies, designThemes, globalAssumptions } from "@shared/schema";
import { logger } from "../logger";
import { SEED_COMPANY_IDENTITY } from "./properties";

const HPLUS_URL = "/logos/h-logo-glass.png";
const LB_URL = "/logos/lb-logo.jpeg";
const HPLUS_DEFAULT_MIGRATION_TAG = "branding_hplus_default_v1";

/**
 * Run the one-time corrective fix that flips legacy environments where
 * L+B was the default/app logo (or assigned to companies/global assumptions)
 * over to H+ Analytics. Gated by `_applied_migrations` so admin choices
 * made afterward are never overwritten on subsequent restarts.
 */
async function applyHplusDefaultCorrection(hplusId: number, lbId: number): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS _applied_migrations (
      tag TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  const check = await db.execute(
    sql`SELECT 1 FROM _applied_migrations WHERE tag = ${HPLUS_DEFAULT_MIGRATION_TAG} LIMIT 1`
  );
  if ((check as { rows: Array<Record<string, unknown>> }).rows?.length > 0) {
    return; // Already applied — do not override admin selections.
  }

  // App logo: only force-set H+ when there is none, or it currently is L+B.
  const currentAppLogo = await db.select().from(logos).where(eq(logos.isAppLogo, true));
  const appLogoNeedsFix =
    currentAppLogo.length === 0 || currentAppLogo.some(l => l.id === lbId);
  if (appLogoNeedsFix) {
    await db.update(logos).set({ isAppLogo: false }).where(eq(logos.isAppLogo, true));
    await db.update(logos).set({ isAppLogo: true }).where(eq(logos.id, hplusId));
    logger.info("Set H+ Analytics as app logo (corrective)", "seed");
  }

  // Default logo: only force-set H+ when there is none, or it currently is L+B.
  const currentDefault = await db.select().from(logos).where(eq(logos.isDefault, true));
  const defaultNeedsFix =
    currentDefault.length === 0 || currentDefault.some(l => l.id === lbId);
  if (defaultNeedsFix) {
    await db.update(logos).set({ isDefault: false }).where(eq(logos.isDefault, true));
    await db.update(logos).set({ isDefault: true }).where(eq(logos.id, hplusId));
    logger.info("Set H+ Analytics as default logo (corrective)", "seed");
  }

  // Re-point any company that points at L+B → H+ Analytics
  const companiesPointingAtLb = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.logoId, lbId));
  if (companiesPointingAtLb.length > 0) {
    await db.update(companies).set({ logoId: hplusId }).where(eq(companies.logoId, lbId));
    logger.info(`Re-pointed ${companiesPointingAtLb.length} companies from L+B → H+ Analytics`, "seed");
  }

  // Re-point global_assumptions.companyLogoId references
  const gaIdPointingAtLb = await db
    .select({ id: globalAssumptions.id })
    .from(globalAssumptions)
    .where(eq(globalAssumptions.companyLogoId, lbId));
  if (gaIdPointingAtLb.length > 0) {
    await db
      .update(globalAssumptions)
      .set({ companyLogoId: hplusId })
      .where(eq(globalAssumptions.companyLogoId, lbId));
    logger.info(`Re-pointed ${gaIdPointingAtLb.length} global_assumptions.companyLogoId from L+B → H+ Analytics`, "seed");
  }

  // Legacy URL field: rewrite L+B URL → H+ Analytics URL
  const gaUrlPointingAtLb = await db
    .select({ id: globalAssumptions.id })
    .from(globalAssumptions)
    .where(eq(globalAssumptions.companyLogo, LB_URL));
  if (gaUrlPointingAtLb.length > 0) {
    await db
      .update(globalAssumptions)
      .set({ companyLogo: HPLUS_URL })
      .where(eq(globalAssumptions.companyLogo, LB_URL));
    logger.info(`Re-pointed ${gaUrlPointingAtLb.length} global_assumptions.companyLogo URL from L+B → H+ Analytics`, "seed");
  }

  await db.execute(
    sql`INSERT INTO _applied_migrations (tag) VALUES (${HPLUS_DEFAULT_MIGRATION_TAG}) ON CONFLICT (tag) DO NOTHING`
  );
  logger.info(`Applied one-time branding correction: ${HPLUS_DEFAULT_MIGRATION_TAG}`, "seed");
}

export async function seedDefaultLogos() {
  const existingLogos = await db.select().from(logos);
  const isFirstSeed = existingLogos.length === 0;

  if (isFirstSeed) {
    // Fresh seed: H+ Analytics is the default AND the app logo. L+B exists
    // but is a regular non-default entry.
    const inserted = await db.insert(logos).values([
      {
        name: "H+ Analytics",
        companyName: "H+ Analytics",
        url: HPLUS_URL,
        isDefault: true,
        isAppLogo: true,
      },
      {
        name: "L+B Logo",
        companyName: "L+B",
        url: LB_URL,
        isDefault: false,
        isAppLogo: false,
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
    ]).returning();
    logger.info(`Seeded ${inserted.length} default logos (H+ Analytics as default + app)`, "seed");
    // Mark the corrective migration as applied — fresh DBs don't need it.
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS _applied_migrations (
        tag TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await db.execute(
      sql`INSERT INTO _applied_migrations (tag) VALUES (${HPLUS_DEFAULT_MIGRATION_TAG}) ON CONFLICT (tag) DO NOTHING`
    );
    return;
  }

  // Idempotent ensure: H+ Analytics and L+B both exist in the library, but
  // do NOT touch isDefault/isAppLogo here — the corrective migration handles
  // legacy state, and admin selections must be preserved on subsequent boots.
  let hplus = existingLogos.find(l => l.url === HPLUS_URL);
  if (!hplus) {
    [hplus] = await db.insert(logos).values({
      name: "H+ Analytics",
      companyName: "H+ Analytics",
      url: HPLUS_URL,
      isDefault: false,
      isAppLogo: false,
    }).returning();
    logger.info("Added H+ Analytics logo to library", "seed");
  }

  let lb = existingLogos.find(l => l.url === LB_URL);
  if (!lb) {
    [lb] = await db.insert(logos).values({
      name: "L+B Logo",
      companyName: "L+B",
      url: LB_URL,
      isDefault: false,
      isAppLogo: false,
    }).returning();
    logger.info("Added L+B logo to library (non-default)", "seed");
  }

  await applyHplusDefaultCorrection(hplus.id, lb.id);
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
