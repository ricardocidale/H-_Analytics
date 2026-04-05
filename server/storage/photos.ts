import { propertyPhotos, properties, type PropertyPhoto, type InsertPropertyPhoto, type UpdatePropertyPhoto } from "@shared/schema";
import { db } from "../db";
import { eq, and, asc, inArray, sql } from "drizzle-orm";
import { stripAutoFields } from "./utils";

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

  async reorderPhotos(propertyId: number, orderedIds: number[]): Promise<void> {
    if (orderedIds.length === 0) return;

    const whenClauses = orderedIds.map((id, i) => sql`WHEN ${id} THEN ${i}`);
    await db.execute(sql`
      UPDATE ${propertyPhotos}
      SET sort_order = CASE id ${sql.join(whenClauses, sql` `)} END
      WHERE ${propertyPhotos.propertyId} = ${propertyId}
        AND ${propertyPhotos.id} IN ${sql`(${sql.join(orderedIds.map(id => sql`${id}`), sql`, `)})`}
    `);
  }

}
