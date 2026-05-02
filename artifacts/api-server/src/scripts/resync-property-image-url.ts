/**
 * resync-property-image-url.ts
 *
 * One-shot repair for the `properties.image_url` cache.
 *
 * `properties.image_url` is a *cache* of the current hero `property_photos`
 * row's `imageUrl`, kept around so existing display code (portfolio cards,
 * exports, slide generators) can read a single field instead of joining the
 * album every time. The cache is normally maintained by `setHeroPhoto`, but
 * historical write paths (legacy `PUT /api/properties/:id` from the Photos
 * page picker, the `PropertyPhotoUpload` overlay button) wrote `imageUrl`
 * directly without touching the album. When the album row's canonical URL
 * later changed (e.g. binaries migrated from `/api/property-photos/:id/image`
 * to `/api/media/photo-N.png`), the cache silently 404'd.
 *
 * For every property whose `image_url` differs from its hero photo's
 * `imageUrl`, this script writes the hero's URL into the cache. If a
 * property has photos but no `is_hero=true` row (a separate breakage
 * mode where the hero flag was lost), it falls back to the
 * first photo by `id` — same ordering `getPropertyPhotos` uses — so
 * the cache still points at *something* renderable instead of leaving
 * a stale URL in place. Properties with no album at all are left
 * alone. Properties whose cache already matches are skipped.
 *
 * Safe to re-run. No external HTTP — pure DB.
 *
 * Run: npx tsx artifacts/api-server/src/scripts/resync-property-image-url.ts
 */

import "dotenv/config";
import { db } from "../db";
import { propertyPhotos, properties } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "resync-property-image-url";

async function run() {
  const allProps = await db.select().from(properties);
  const allPhotos = await db.select().from(propertyPhotos);

  // Index album rows two ways: explicit hero (preferred) and first-by-id
  // fallback (used when a property has photos but no `is_hero=true` row —
  // e.g. the hero flag was lost in a prior migration). Sort by id ascending
  // so the fallback matches `getPropertyPhotos`'s ordering.
  const heroByPropertyId = new Map<number, typeof allPhotos[number]>();
  const firstPhotoByPropertyId = new Map<number, typeof allPhotos[number]>();
  const sortedPhotos = [...allPhotos].sort((a, b) => a.id - b.id);
  for (const photo of sortedPhotos) {
    if (photo.isHero) heroByPropertyId.set(photo.propertyId, photo);
    if (!firstPhotoByPropertyId.has(photo.propertyId)) {
      firstPhotoByPropertyId.set(photo.propertyId, photo);
    }
  }

  let synced = 0;
  let alreadyEqual = 0;
  let noPhotos = 0;
  let fellBackToFirstPhoto = 0;

  for (const prop of allProps) {
    const hero = heroByPropertyId.get(prop.id);
    const fallback = !hero ? firstPhotoByPropertyId.get(prop.id) : undefined;
    const source = hero ?? fallback;
    if (!source) {
      noPhotos++;
      continue;
    }
    if (fallback) fellBackToFirstPhoto++;
    if (prop.imageUrl === source.imageUrl) {
      alreadyEqual++;
      continue;
    }

    logger.info(
      `  [${prop.id}] ${prop.name}${fallback ? " (no hero — first photo)" : ""}: ${prop.imageUrl} -> ${source.imageUrl}`,
      TAG,
    );
    await db
      .update(properties)
      .set({ imageUrl: source.imageUrl })
      .where(eq(properties.id, prop.id));
    synced++;
  }

  logger.info(
    `Done. Synced: ${synced}, Already equal: ${alreadyEqual}, No photos: ${noPhotos}, First-photo fallbacks: ${fellBackToFirstPhoto}, Total properties: ${allProps.length}`,
    TAG,
  );
}

run().catch((err) => {
  logger.error(`Fatal: ${err instanceof Error ? err.message : err}`, TAG);
  process.exit(1);
});
