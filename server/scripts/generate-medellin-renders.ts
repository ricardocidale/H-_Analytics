/**
 * generate-medellin-renders.ts
 *
 * One-time script: generates photorealistic renders for the Medellin Duplex
 * using the uploaded photos as img2img source references.
 *
 * Run: npx tsx server/scripts/generate-medellin-renders.ts
 *
 * What it does:
 *   1. Loads the Medellin Duplex property + its source photos from the DB
 *   2. Skips any photo that already has a render (beforePhotoId match)
 *   3. For each source photo, calls Replicate (photo-to-render style)
 *   4. Uploads the resulting buffer to object storage
 *   5. Saves a new property_photos row:
 *        generationStyle = "photo-to-render"
 *        beforePhotoId   = source photo id
 *        caption         = "Render — <original caption>"
 *        isHero          = false (first render is promoted at the end)
 *   6. Sets the render derived from the first (hero) source photo as the new hero
 *
 * Idempotent: re-running is safe — existing renders are detected and skipped.
 */

import "dotenv/config";
import { db } from "../db";
import { properties, propertyPhotos } from "@shared/schema";
import { eq, and, isNotNull } from "drizzle-orm";
import { replicateService } from "../integrations/replicate";
import { ObjectStorageService } from "../replit_integrations/object_storage";
import { storage } from "../storage";
import { logger } from "../logger";

const PROPERTY_NAME = "Medellin Duplex";
const BASE_URL = process.env.BASE_URL ?? "https://partner-portal-landb.replit.app";
const objectStorageService = new ObjectStorageService();

async function uploadBuffer(buffer: Buffer): Promise<string> {
  const uploadURL = await objectStorageService.getObjectEntityUploadURL();
  const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
  const res = await fetch(uploadURL, {
    method: "PUT",
    body: buffer,
    headers: { "Content-Type": "image/png" },
  });
  if (!res.ok) throw new Error(`Object storage upload failed: ${res.status}`);
  return objectPath;
}

function buildSourceUrl(imageUrl: string): string {
  // Static public files are served from the app's public directory
  if (imageUrl.startsWith("http")) return imageUrl;
  return `${BASE_URL}${imageUrl}`;
}

async function run() {
  logger.info(`Looking up property: ${PROPERTY_NAME}`, "render-script");

  const [property] = await db
    .select()
    .from(properties)
    .where(eq(properties.name, PROPERTY_NAME))
    .limit(1);

  if (!property) {
    throw new Error(`Property "${PROPERTY_NAME}" not found in DB — run the seed first.`);
  }

  logger.info(`Found property id=${property.id}`, "render-script");

  // Load source photos (exclude any already-rendered photos)
  const allPhotos = await db
    .select()
    .from(propertyPhotos)
    .where(eq(propertyPhotos.propertyId, property.id));

  const sourcePhotos = allPhotos.filter(p => !p.generationStyle);
  const existingRenders = allPhotos.filter(p => p.generationStyle === "photo-to-render");
  const renderedSourceIds = new Set(existingRenders.map(r => r.beforePhotoId).filter(Boolean));

  logger.info(`Source photos: ${sourcePhotos.length}, existing renders: ${existingRenders.length}`, "render-script");

  const toProcess = sourcePhotos.filter(p => !renderedSourceIds.has(p.id));
  if (!toProcess.length) {
    logger.info("All renders already exist — nothing to do.", "render-script");
    return;
  }

  logger.info(`Generating renders for ${toProcess.length} source photo(s)...`, "render-script");

  const generatedRenderIds: number[] = [];

  for (const sourcePhoto of toProcess) {
    const sourceUrl = buildSourceUrl(sourcePhoto.imageUrl);
    const renderCaption = `Render — ${sourcePhoto.caption ?? "Medellin Duplex"}`;

    logger.info(`  Rendering: ${sourceUrl}`, "render-script");

    let buffer: Buffer;
    try {
      buffer = await replicateService.generateImage(
        "photo-to-render",
        "luxury duplex interior El Poblado Medellín, contemporary open-concept design",
        sourceUrl,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Surface rate-limit errors clearly so the user knows to add Replicate credits
      if (msg.includes("429") || msg.includes("throttled") || msg.includes("rate limit")) {
        logger.error(`  Rate limited by Replicate. Add credits at replicate.com/account/billing and re-run this script.`, "render-script");
        break;
      }
      logger.error(`  Replicate failed for photo ${sourcePhoto.id}: ${msg}`, "render-script");
      continue;
    }

    // Brief pause between renders to respect Replicate's burst limit
    if (toProcess.indexOf(sourcePhoto) < toProcess.length - 1) {
      await new Promise(r => setTimeout(r, 12_000));
    }

    logger.info(`  Generated ${buffer.length} bytes, uploading...`, "render-script");

    const objectPath = await uploadBuffer(buffer);

    const nextSortOrder = allPhotos.length + generatedRenderIds.length;
    const render = await storage.addPropertyPhoto({
      propertyId: property.id,
      imageUrl: objectPath,
      caption: renderCaption,
      sortOrder: nextSortOrder,
      isHero: false,
      generationStyle: "photo-to-render",
      beforePhotoId: sourcePhoto.id,
    });

    logger.info(`  Saved render id=${render.id} caption="${renderCaption}"`, "render-script");
    generatedRenderIds.push(render.id);
  }

  if (!generatedRenderIds.length) {
    logger.warn("No renders were successfully generated.", "render-script");
    return;
  }

  // Set the first generated render as the property card hero
  const heroRenderId = generatedRenderIds[0];
  await storage.setHeroPhoto(property.id, heroRenderId);
  logger.info(`Set render id=${heroRenderId} as hero (property card image)`, "render-script");

  logger.info("Done.", "render-script");
}

run().catch(err => {
  logger.error(`Fatal: ${err instanceof Error ? err.message : err}`, "render-script");
  process.exit(1);
});
