import { propertyUrls, type PropertyUrl, type InsertPropertyUrl } from "@shared/schema";
import { db } from "../db";
import { eq, asc } from "drizzle-orm";

export class PropertyUrlStorage {
  async getPropertyUrls(propertyId: number): Promise<PropertyUrl[]> {
    return await db.select().from(propertyUrls)
      .where(eq(propertyUrls.propertyId, propertyId))
      .orderBy(asc(propertyUrls.createdAt));
  }

  async getPropertyUrlById(id: number): Promise<PropertyUrl | undefined> {
    const [row] = await db.select().from(propertyUrls)
      .where(eq(propertyUrls.id, id));
    return row || undefined;
  }

  async addPropertyUrl(data: InsertPropertyUrl): Promise<PropertyUrl> {
    const [row] = await db.insert(propertyUrls)
      .values(data as typeof propertyUrls.$inferInsert)
      .returning();
    return row;
  }

  async updatePropertyUrl(id: number, data: Partial<Omit<PropertyUrl, "id" | "createdAt">>): Promise<PropertyUrl | undefined> {
    const { ...rest } = data;
    const [row] = await db.update(propertyUrls)
      .set(rest as any)
      .where(eq(propertyUrls.id, id))
      .returning();
    return row || undefined;
  }

  async deletePropertyUrl(id: number): Promise<void> {
    await db.delete(propertyUrls).where(eq(propertyUrls.id, id));
  }
}
