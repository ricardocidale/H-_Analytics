import { db } from "../db";
import { globalAssumptions, marketResearch, properties } from "@shared/schema";
import { seedUsers } from "./users";
import { seedGlobalAssumptions, seedProperties, seedFeeCategories, seedMedellinDuplex, seedMedellinDuplexPhotos } from "./properties";
import { seedDefaultLogos, seedCompanies } from "./branding";
import { seedMissingMarketResearch, getHudsonEstateResearch, getEdenSummitResearch, getAustinHillsideResearch, getCasaMedellinResearch, getBlueRidgeResearch } from "./research";
import { seedServiceTemplates } from "./services";
import { seedHospitalityBenchmarks } from "./hospitality-benchmarks";
import { seedMarketDataTables } from "./market-data-tables";
import { seedSourceRegistry } from "./source-registry";
import { seedPropertyPhotos } from "./photos";
import { seedKnowledgeBase } from "./knowledge-base-seeds";
import { indexPropertyProfile } from "../ai/pinecone-service";
import { logger } from "../logger";

export async function seed() {
  const forceReseed = process.argv.includes("--force");
  
  logger.info("Starting database seed...", "seed");

  const existingGlobal = await db.select().from(globalAssumptions).limit(1);
  const existingProperties = await db.select().from(properties).limit(1);

  if (existingGlobal.length > 0 || existingProperties.length > 0) {
    if (forceReseed) {
      logger.info("Force mode: Clearing existing data...", "seed");
      await db.delete(marketResearch);
      await db.delete(properties);
      await db.delete(globalAssumptions);
      logger.info("Existing data cleared.", "seed");
    } else {
      logger.info("Database already has data. Skipping seed to prevent duplicates.", "seed");
      logger.info("To force re-seed, run: npx tsx server/seed.ts --force", "seed");
      return;
    }
  }

  // Note: a full DB transaction is not used here because each seedX() function
  // imports `db` directly and would need to accept a `tx` parameter — a significant
  // refactor. Instead, we catch partial failures and clean up inserted rows so the
  // seed can safely be re-run with `--force`.
  try {
    await seedUsers();

    await seedGlobalAssumptions();

    await seedProperties();

    await seedFeeCategories();

    const seededProperties = await db.select().from(properties);
    const propertyMap: Record<string, number> = {};
    for (const p of seededProperties) {
      propertyMap[p.name] = p.id;
    }

    const allResearchEntries = [
      {
        userId: null,
        type: "property",
        propertyId: propertyMap["Jano Grande Ranch"],
        title: "Market Research: Jano Grande Ranch",
        llmModel: "seed-data",
        content: getCasaMedellinResearch()
      },
      {
        userId: null,
        type: "property",
        propertyId: propertyMap["Loch Sheldrake"],
        title: "Market Research: Loch Sheldrake",
        llmModel: "seed-data",
        content: getEdenSummitResearch()
      },
      {
        userId: null,
        type: "property",
        propertyId: propertyMap["Belleayre Mountain"],
        title: "Market Research: Belleayre Mountain",
        llmModel: "seed-data",
        content: getHudsonEstateResearch()
      },
      {
        userId: null,
        type: "property",
        propertyId: propertyMap["Scott's House"],
        title: "Market Research: Scott's House",
        llmModel: "seed-data",
        content: getAustinHillsideResearch()
      },
      {
        userId: null,
        type: "property",
        propertyId: propertyMap["Lakeview Haven Lodge"],
        title: "Market Research: Lakeview Haven Lodge",
        llmModel: "seed-data",
        content: getBlueRidgeResearch()
      }
    ];

    const validResearch = allResearchEntries.filter(e => e.propertyId != null);
    const skipped = allResearchEntries.length - validResearch.length;
    if (skipped > 0) {
      logger.warn(`Skipped ${skipped} research seed entries — property not found in DB`, "seed");
    }

    if (validResearch.length > 0) {
      await db.insert(marketResearch).values(validResearch);
      logger.info(`Seeded market research for ${validResearch.length} properties`, "seed");
    }

    await seedDefaultLogos();
    await seedCompanies();

    await seedServiceTemplates();

    await seedPropertyPhotos();

    await seedHospitalityBenchmarks();

    await seedMarketDataTables();

    await seedSourceRegistry();

    await indexAllPropertiesToPinecone();

    await seedKnowledgeBase();

    // The Analyst validates every seeded property — catches errors like wrong tax rates
    try {
      const { validateAllProperties } = await import("../ai/seed-validator");
      const results = await validateAllProperties();
      const flagged = results.filter(r => r.status === "flagged");
      if (flagged.length > 0) {
        logger.warn(
          `The Analyst flagged ${flagged.length} properties with assumption issues: ${flagged.map(f => `${f.propertyName} (${f.flagged} flags)`).join(", ")}`,
          "seed",
        );
      }
    } catch (validationErr: unknown) {
      logger.warn(`Analyst seed validation skipped: ${validationErr instanceof Error ? validationErr.message : String(validationErr)}`, "seed");
    }

    logger.info("Database seed completed successfully!", "seed");
  } catch (err: unknown) {
    logger.error(`Seed failed — rolling back inserted data so --force re-run is safe: ${err instanceof Error ? err.message : String(err)}`, "seed");
    try {
      await db.delete(marketResearch);
      await db.delete(properties);
      await db.delete(globalAssumptions);
    } catch (cleanupErr: unknown) {
      logger.warn(`Seed cleanup also failed: ${cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr)}`, "seed");
    }
    throw err;
  }
}

async function indexAllPropertiesToPinecone() {
  try {
    const allProps = await db.select().from(properties);
    let indexed = 0;
    for (const p of allProps) {
      await indexPropertyProfile({
        propertyId: p.id,
        name: p.name ?? "Unnamed Property",
        location: [p.city, p.stateProvince, p.country].filter(Boolean).join(", "),
        propertyType: "hotel",
        roomCount: p.roomCount ?? null,
        status: p.status ?? "active",
        purchasePrice: p.purchasePrice ?? null,
        market: p.market ?? null,
        description: p.description ?? null,
        streetAddress: p.streetAddress ?? null,
      });
      indexed++;
    }
    if (indexed > 0) {
      logger.info(`Indexed ${indexed} properties to Pinecone`, "seed");
    }
  } catch (err: unknown) {
    logger.warn(`Pinecone property indexing skipped: ${err instanceof Error ? err.message : err}`, "seed");
  }
}

export {
  seedSourceRegistry,
  seedHospitalityBenchmarks,
  seedMarketDataTables,
  seedMissingMarketResearch,
  seedDefaultLogos,
  seedCompanies,
  seedServiceTemplates,
  seedPropertyPhotos,
  seedMedellinDuplex,
  seedMedellinDuplexPhotos,
  seedKnowledgeBase,
};
