/**
 * Phase B: One-shot migration — move property_photos.image_data /
 * enhanced_image_data (base64 blobs stored INSIDE Postgres) to Replit Object
 * Storage at /objects/property-photos/<id>.png and update image_url so the
 * existing /objects/* route serves them straight from the bucket.
 *
 * Safe to re-run. Skips rows that have already been migrated (image_url
 * starts with /objects/property-photos/ AND image_data is null).
 */
import { db } from "../server/db";
import { propertyPhotos } from "../shared/schema";
import { eq, isNotNull, or } from "drizzle-orm";
import { ReplitStorageProvider } from "../server/providers/storage/replit-storage";

async function main() {
  const provider = new ReplitStorageProvider();

  const rows = await db
    .select({
      id: propertyPhotos.id,
      imageUrl: propertyPhotos.imageUrl,
      imageData: propertyPhotos.imageData,
      enhancedImageData: propertyPhotos.enhancedImageData,
    })
    .from(propertyPhotos)
    .where(or(isNotNull(propertyPhotos.imageData), isNotNull(propertyPhotos.enhancedImageData)));

  console.log(`Found ${rows.length} photo row(s) with inline blobs`);

  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      let newImageUrl = row.imageUrl;

      if (row.imageData) {
        const buf = Buffer.from(row.imageData, "base64");
        const url = await provider.uploadBuffer(
          `property-photos/${row.id}.png`,
          buf,
          "image/png",
        );
        newImageUrl = url;
        console.log(`  [${row.id}] image_data → ${url} (${(buf.length / 1024).toFixed(0)} KB)`);
      }

      if (row.enhancedImageData) {
        const buf = Buffer.from(row.enhancedImageData, "base64");
        const url = await provider.uploadBuffer(
          `property-photos/${row.id}-enhanced.png`,
          buf,
          "image/png",
        );
        console.log(`  [${row.id}] enhanced → ${url} (${(buf.length / 1024).toFixed(0)} KB)`);
      }

      await db
        .update(propertyPhotos)
        .set({
          imageUrl: newImageUrl,
          imageData: null,
          enhancedImageData: null,
        })
        .where(eq(propertyPhotos.id, row.id));

      migrated += 1;
    } catch (err) {
      failed += 1;
      console.error(`  [${row.id}] FAILED:`, err instanceof Error ? err.message : err);
    }
  }

  console.log("");
  console.log(`Done — migrated: ${migrated}, skipped: ${skipped}, failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Migration crashed:", err);
  process.exit(1);
});
