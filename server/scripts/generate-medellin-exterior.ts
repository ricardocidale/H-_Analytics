/**
 * generate-medellin-exterior.ts
 *
 * Generates a photorealistic exterior architectural render of the building
 * housing the Medellin Duplex — a 16-story luxury residential tower in
 * El Poblado, Medellín, Colombia, with the penthouse duplex on the top two floors.
 *
 * Run: npx tsx server/scripts/generate-medellin-exterior.ts
 */

import "dotenv/config";
import { db } from "../db";
import { properties, propertyPhotos } from "@shared/schema";
import { eq } from "drizzle-orm";
import { replicateService } from "../integrations/replicate";
import { ObjectStorageService } from "../replit_integrations/object_storage";
import { storage } from "../storage";
import { logger } from "../logger";

const PROPERTY_NAME = "Medellin Duplex";
const objectStorageService = new ObjectStorageService();

const EXTERIOR_PROMPT = [
  "contemporary luxury 16-story residential tower in El Poblado Medellín Colombia",
  "penthouse duplex occupying the top two floors with floor-to-ceiling glass facades and wraparound terrace",
  "the building features a sleek modern facade of glass curtain wall and white concrete with cantilevered balconies",
  "lush Andes mountains and verdant El Poblado hillside visible in background",
  "upscale El Poblado street level with mature tropical trees and manicured landscaping",
  "neighboring luxury towers and the affluent residential neighborhood of El Poblado",
  "golden hour warm light casting long shadows, dramatic sky with scattered clouds",
  "street-level perspective looking up at the full height of the building showing the penthouse level",
].join(", ");

async function run() {
  const [property] = await db
    .select()
    .from(properties)
    .where(eq(properties.name, PROPERTY_NAME))
    .limit(1);

  if (!property) throw new Error(`"${PROPERTY_NAME}" not found — run seed first.`);
  logger.info(`Property id=${property.id}`, "exterior-script");

  // Check if an exterior render already exists
  const existing = await db
    .select()
    .from(propertyPhotos)
    .where(eq(propertyPhotos.propertyId, property.id));

  const alreadyHasExterior = existing.some(
    p => p.generationStyle === "architectural-exterior"
  );
  if (alreadyHasExterior) {
    logger.info("Exterior render already exists — skipping.", "exterior-script");
    return;
  }

  logger.info("Generating exterior render via Replicate FLUX 1.1 Pro...", "exterior-script");

  const buffer = await replicateService.generateImage(
    "architectural-exterior",
    EXTERIOR_PROMPT,
  );

  logger.info(`Generated ${buffer.length} bytes, uploading...`, "exterior-script");

  const uploadURL = await objectStorageService.getObjectEntityUploadURL();
  const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
  const uploadRes = await fetch(uploadURL, {
    method: "PUT",
    body: buffer,
    headers: { "Content-Type": "image/png" },
  });
  if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadRes.status}`);

  const nextSort = existing.length;
  const photo = await storage.addPropertyPhoto({
    propertyId: property.id,
    imageUrl: objectPath,
    caption: "Render — Exterior: El Poblado luxury residential tower, Medellín (penthouse duplex on top two floors)",
    sortOrder: nextSort,
    isHero: false,
    generationStyle: "architectural-exterior",
  });

  logger.info(`Saved exterior render id=${photo.id}`, "exterior-script");
  logger.info("Done.", "exterior-script");
}

run().catch(err => {
  logger.error(`Fatal: ${err instanceof Error ? err.message : err}`, "exterior-script");
  process.exit(1);
});
