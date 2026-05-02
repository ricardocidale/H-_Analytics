import { propertyPhotos, properties, type PropertyPhoto, type InsertPropertyPhoto, type UpdatePropertyPhoto } from "@workspace/db";
import { db } from "../db";
import { eq, and, asc, inArray, sql } from "drizzle-orm";
import { stripAutoFields } from "./utils";
import { getStorageProviderAsync } from "../providers/storage";
import { logger } from "../logger";

export class PhotoStorage {
  async getPropertyPhotos(propertyId: number): Promise<PropertyPhoto[]> {
    return await db.select().from(propertyPhotos)
      .where(eq(propertyPhotos.propertyId, propertyId))
      .orderBy(asc(propertyPhotos.sortOrder));
  }

  async getPhotosByProperties(propertyIds: number[]): Promise<Record<number, PropertyPhoto[]>> {
    if (propertyIds.length === 0) return {};
    const rows = await db.select().from(propertyPhotos)
      .where(inArray(propertyPhotos.propertyId, propertyIds))
      .orderBy(asc(propertyPhotos.sortOrder));
    const grouped: Record<number, PropertyPhoto[]> = {};
    for (const row of rows) {
      if (!grouped[row.propertyId]) grouped[row.propertyId] = [];
      grouped[row.propertyId].push(row);
    }
    return grouped;
  }

  async getPhotoById(id: number): Promise<PropertyPhoto | undefined> {
    const [photo] = await db.select().from(propertyPhotos)
      .where(eq(propertyPhotos.id, id));
    return photo || undefined;
  }

  async getHeroPhoto(propertyId: number): Promise<PropertyPhoto | undefined> {
    const [photo] = await db.select().from(propertyPhotos)
      .where(and(eq(propertyPhotos.propertyId, propertyId), eq(propertyPhotos.isHero, true)));
    return photo || undefined;
  }

  async addPropertyPhoto(data: InsertPropertyPhoto): Promise<PropertyPhoto> {
    return await db.transaction(async (tx) => {
      const existing = await tx.select().from(propertyPhotos)
        .where(eq(propertyPhotos.propertyId, data.propertyId));

      const isFirst = existing.length === 0;

      // Insert first so we get the auto-generated id
      const [photo] = await tx.insert(propertyPhotos)
        .values({
          ...data,
          isHero: isFirst ? true : (data.isHero ?? false),
          sortOrder: data.sortOrder ?? existing.length,
        } as typeof propertyPhotos.$inferInsert)
        .returning();

      // If image binary is stored in DB, rewrite imageUrl to the DB-served path
      // so the image is portable and independent of Replit Object Storage.
      let resolvedImageUrl = photo.imageUrl;
      if (photo.imageData) {
        resolvedImageUrl = `/api/property-photos/${photo.id}/image`;
        await tx.update(propertyPhotos)
          .set({ imageUrl: resolvedImageUrl })
          .where(eq(propertyPhotos.id, photo.id));
      }

      if (photo.isHero) {
        await tx.update(properties)
          .set({ imageUrl: resolvedImageUrl, updatedAt: new Date() })
          .where(eq(properties.id, data.propertyId));
      }

      return { ...photo, imageUrl: resolvedImageUrl };
    });
  }

  async updatePropertyPhoto(id: number, data: UpdatePropertyPhoto): Promise<PropertyPhoto | undefined> {
    const [photo] = await db.update(propertyPhotos)
      .set(stripAutoFields(data as Record<string, unknown>))
      .where(eq(propertyPhotos.id, id))
      .returning();
    return photo || undefined;
  }

  async deletePropertyPhoto(id: number): Promise<void> {
    await db.transaction(async (tx) => {
      const [photo] = await tx.select().from(propertyPhotos)
        .where(eq(propertyPhotos.id, id));
      if (!photo) return;

      await tx.delete(propertyPhotos).where(eq(propertyPhotos.id, id));

      if (photo.isHero) {
        const remaining = await tx.select().from(propertyPhotos)
          .where(eq(propertyPhotos.propertyId, photo.propertyId))
          .orderBy(asc(propertyPhotos.sortOrder))
          .limit(1);

        if (remaining.length > 0) {
          await tx.update(propertyPhotos)
            .set({ isHero: true })
            .where(eq(propertyPhotos.id, remaining[0].id));
          await tx.update(properties)
            .set({ imageUrl: remaining[0].imageUrl, updatedAt: new Date() })
            .where(eq(properties.id, photo.propertyId));
        }
      }
    });
  }

  async setHeroPhoto(propertyId: number, photoId: number): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.update(propertyPhotos)
        .set({ isHero: false })
        .where(eq(propertyPhotos.propertyId, propertyId));

      const [hero] = await tx.update(propertyPhotos)
        .set({ isHero: true })
        .where(and(eq(propertyPhotos.id, photoId), eq(propertyPhotos.propertyId, propertyId)))
        .returning();

      if (hero) {
        // Prefer the DB-served path when imageData is present
        const heroImageUrl = hero.imageData
          ? `/api/property-photos/${hero.id}/image`
          : hero.imageUrl;
        await tx.update(properties)
          .set({ imageUrl: heroImageUrl, updatedAt: new Date() })
          .where(eq(properties.id, propertyId));
      }
    });
  }

  async movePhotos(photoIds: number[], destinationPropertyId: number): Promise<PropertyPhoto[]> {
    if (photoIds.length === 0) return [];
    return await db.transaction(async (tx) => {
      const sources = await tx.select().from(propertyPhotos)
        .where(inArray(propertyPhotos.id, photoIds));
      if (sources.length === 0) return [];

      const destExisting = await tx.select().from(propertyPhotos)
        .where(eq(propertyPhotos.propertyId, destinationPropertyId));
      const destStartOrder = destExisting.length;
      const sourcePropertyIds = Array.from(new Set(sources.map(s => s.propertyId).filter(p => p !== destinationPropertyId)));

      const moved: PropertyPhoto[] = [];
      let i = 0;
      for (const src of sources) {
        if (src.propertyId === destinationPropertyId) {
          moved.push(src);
          continue;
        }
        const [updated] = await tx.update(propertyPhotos)
          .set({
            propertyId: destinationPropertyId,
            isHero: false,
            sortOrder: destStartOrder + i,
          })
          .where(eq(propertyPhotos.id, src.id))
          .returning();
        moved.push(updated);
        i++;
      }

      // Repair source: if hero was moved away, promote a remaining photo
      for (const srcPid of sourcePropertyIds) {
        const remaining = await tx.select().from(propertyPhotos)
          .where(eq(propertyPhotos.propertyId, srcPid))
          .orderBy(asc(propertyPhotos.sortOrder));
        const hasHero = remaining.some(p => p.isHero);
        if (!hasHero && remaining.length > 0) {
          await tx.update(propertyPhotos)
            .set({ isHero: true })
            .where(eq(propertyPhotos.id, remaining[0].id));
          await tx.update(properties)
            .set({ imageUrl: remaining[0].imageUrl, updatedAt: new Date() })
            .where(eq(properties.id, srcPid));
        } else if (remaining.length === 0) {
          await tx.update(properties)
            .set({ imageUrl: "", updatedAt: new Date() })
            .where(eq(properties.id, srcPid));
        }
      }

      // Destination: if no hero exists, promote first
      const destAfter = await tx.select().from(propertyPhotos)
        .where(eq(propertyPhotos.propertyId, destinationPropertyId))
        .orderBy(asc(propertyPhotos.sortOrder));
      const destHasHero = destAfter.some(p => p.isHero);
      if (!destHasHero && destAfter.length > 0) {
        await tx.update(propertyPhotos)
          .set({ isHero: true })
          .where(eq(propertyPhotos.id, destAfter[0].id));
        await tx.update(properties)
          .set({ imageUrl: destAfter[0].imageUrl, updatedAt: new Date() })
          .where(eq(properties.id, destinationPropertyId));
      }

      return moved;
    });
  }

  async copyPhotos(photoIds: number[], destinationPropertyId: number): Promise<PropertyPhoto[]> {
    if (photoIds.length === 0) return [];
    return await db.transaction(async (tx) => {
      const sources = await tx.select().from(propertyPhotos)
        .where(inArray(propertyPhotos.id, photoIds));
      if (sources.length === 0) return [];

      const destExisting = await tx.select().from(propertyPhotos)
        .where(eq(propertyPhotos.propertyId, destinationPropertyId));
      const destStartOrder = destExisting.length;

      const copies: PropertyPhoto[] = [];
      for (let i = 0; i < sources.length; i++) {
        const src = sources[i];
        const [created] = await tx.insert(propertyPhotos).values({
          propertyId: destinationPropertyId,
          imageUrl: src.imageUrl,
          caption: src.caption,
          sortOrder: destStartOrder + i,
          isHero: false,
          variants: src.variants,
          generationStyle: src.generationStyle,
          beforePhotoId: null,
          imageData: src.imageData,
          enhancedImageData: src.enhancedImageData,
        } as typeof propertyPhotos.$inferInsert).returning();

        // If image binary stored in DB, re-point imageUrl to its own served path
        if (created.imageData) {
          const newUrl = `/api/property-photos/${created.id}/image`;
          const [repointed] = await tx.update(propertyPhotos)
            .set({ imageUrl: newUrl })
            .where(eq(propertyPhotos.id, created.id))
            .returning();
          copies.push(repointed);
        } else {
          copies.push(created);
        }
      }

      // Destination hero promotion if none yet
      const destAfter = await tx.select().from(propertyPhotos)
        .where(eq(propertyPhotos.propertyId, destinationPropertyId))
        .orderBy(asc(propertyPhotos.sortOrder));
      const destHasHero = destAfter.some(p => p.isHero);
      if (!destHasHero && destAfter.length > 0) {
        await tx.update(propertyPhotos)
          .set({ isHero: true })
          .where(eq(propertyPhotos.id, destAfter[0].id));
        await tx.update(properties)
          .set({ imageUrl: destAfter[0].imageUrl, updatedAt: new Date() })
          .where(eq(properties.id, destinationPropertyId));
      }

      return copies;
    });
  }

  async reorderPhotos(propertyId: number, orderedIds: number[]): Promise<void> {
    if (orderedIds.length === 0) return;

    // Drizzle's parameterised numbers can be inferred as text by Postgres in a
    // CASE expression, which then trips the integer sort_order column. Cast the
    // THEN value (and the comparison ids, defensively) to int.
    const whenClauses = orderedIds.map(
      (id, i) => sql`WHEN ${id}::int THEN ${i}::int`,
    );
    const idList = sql.join(
      orderedIds.map((id) => sql`${id}::int`),
      sql`, `,
    );
    await db.execute(sql`
      UPDATE ${propertyPhotos}
      SET sort_order = CASE id ${sql.join(whenClauses, sql` `)} END
      WHERE ${propertyPhotos.propertyId} = ${propertyId}
        AND ${propertyPhotos.id} IN (${idList})
    `);
  }

}
