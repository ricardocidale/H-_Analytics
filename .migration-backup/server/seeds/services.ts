import { db } from "../db";
import { companyServiceTemplates } from "@shared/schema";
import { DEFAULT_SERVICE_TEMPLATES } from "@shared/constants";
import { logger } from "../logger";

/**
 * Seed the company_service_templates table with default categories.
 * Idempotent: skips if any templates already exist.
 */
export async function seedServiceTemplates(): Promise<void> {
  const existing = await db.select().from(companyServiceTemplates).limit(1);
  if (existing.length > 0) {
    logger.info("Service templates already exist, skipping seed.", "seed");
    return;
  }

  const values = DEFAULT_SERVICE_TEMPLATES.map(t => ({
    name: t.name,
    defaultRate: t.defaultRate,
    serviceModel: t.serviceModel,
    serviceMarkup: t.serviceMarkup,
    isActive: true,
    sortOrder: t.sortOrder,
  }));

  await db.insert(companyServiceTemplates).values(values);
  logger.info(`Seeded ${values.length} company service templates`, "seed");
}
