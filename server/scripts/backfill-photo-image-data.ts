/**
 * backfill-photo-image-data.ts
 *
 * Backfills the image_data column for all property_photos that currently store
 * their binary only in Replit Object Storage (imageUrl starts with /objects/).
 *
 * After this script runs, every photo has its binary in Neon PostgreSQL and
 * its imageUrl updated to /api/property-photos/:id/image, making the platform
 * independent of Replit Object Storage for image persistence.
 *
 * Run: npx tsx server/scripts/backfill-photo-image-data.ts
 *
 * Safe to re-run: photos that already have imageData are skipped.
 */

import "dotenv/config";
import { db } from "../db";
import { propertyPhotos, properties } from "@shared/schema";
import { eq, isNull, like } from "drizzle-orm";
import { logger } from "../logger";

const BASE_URL = process.env.BASE_URL ?? "https://partner-portal-landb.replit.app";
const TAG = "backfill-photo-image-data";

async function fetchImageAsBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.toString("base64");
}

async function run() {
  // Find all photos that have object-storage paths but no imageData yet
  const photos = await db.select().from(propertyPhotos);
  const toBackfill = photos.filter(p => !p.imageData);

  logger.info(`Total photos: ${photos.length}. Need backfill: ${toBackfill.length}`, TAG);

  if (toBackfill.length === 0) {
    logger.info("All photos already have imageData — nothing to do.", TAG);
    return;
  }

  let succeeded = 0;
  let failed = 0;

  for (const photo of toBackfill) {
    const srcUrl = photo.imageUrl.startsWith("http")
      ? photo.imageUrl
      : `${BASE_URL}${photo.imageUrl}`;

    logger.info(`  [${photo.id}] Fetching: ${srcUrl}`, TAG);

    let imageData: string;
    try {
      imageData = await fetchImageAsBase64(srcUrl);
    } catch (err) {
      logger.error(`  [${photo.id}] Failed to fetch: ${err instanceof Error ? err.message : err}`, TAG);
      failed++;
      continue;
    }

    // Store binary in DB and rewrite imageUrl to the DB-served path
    const dbImageUrl = `/api/property-photos/${photo.id}/image`;
    await db.update(propertyPhotos)
      .set({ imageData, imageUrl: dbImageUrl })
      .where(eq(propertyPhotos.id, photo.id));

    // If this photo is the hero, sync the new imageUrl to properties.imageUrl
    if (photo.isHero) {
      await db.update(properties)
        .set({ imageUrl: dbImageUrl })
        .where(eq(properties.id, photo.propertyId));
      logger.info(`  [${photo.id}] Updated hero URL on property ${photo.propertyId}`, TAG);
    }

    logger.info(`  [${photo.id}] Saved ${Math.round(imageData.length * 0.75 / 1024)}KB to Neon`, TAG);
    succeeded++;

    // Polite pause to avoid hammering the app server
    await new Promise(r => setTimeout(r, 500));
  }

  logger.info(`Done. Succeeded: ${succeeded}, Failed: ${failed}`, TAG);
  if (failed > 0) {
    logger.warn("Some photos could not be backfilled. Re-run this script after fixing the errors.", TAG);
  }
}

run().catch(err => {
  logger.error(`Fatal: ${err instanceof Error ? err.message : err}`, TAG);
  process.exit(1);
});
