import { propertyUrls, type PropertyUrl, type InsertPropertyUrl } from "@shared/schema";
import { db } from "../db";
import { eq, asc } from "drizzle-orm";

interface PropertyUrlUpdate {
  url?: string;
  label?: string | null;
  isValid?: boolean | null;
  isRelevant?: boolean | null;
  relevanceScore?: number | null;
  lastCheckedAt?: Date | null;
  metadata?: Record<string, unknown> | null;
  propertyId?: number;
}

export class PropertyUrlStorage {
  async getPropertyUrls(propertyId: number): Promise<PropertyUrl[]> {
    return await db.select().from(propertyUrls)
      .where(eq(propertyUrls.propertyId, propertyId))
      .orderBy(asc(propertyUrls.createdAt));
  }

  async getAllPropertyUrls(): Promise<PropertyUrl[]> {
    return await db.select().from(propertyUrls)
      .orderBy(asc(propertyUrls.propertyId), asc(propertyUrls.createdAt));
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

  async updatePropertyUrl(id: number, data: PropertyUrlUpdate): Promise<PropertyUrl | undefined> {
    const setData: Record<string, unknown> = {};
    if (data.url !== undefined) setData.url = data.url;
    if (data.label !== undefined) setData.label = data.label;
    if (data.isValid !== undefined) setData.isValid = data.isValid;
    if (data.isRelevant !== undefined) setData.isRelevant = data.isRelevant;
    if (data.relevanceScore !== undefined) setData.relevanceScore = data.relevanceScore;
    if (data.lastCheckedAt !== undefined) setData.lastCheckedAt = data.lastCheckedAt;
    if (data.metadata !== undefined) setData.metadata = data.metadata;
    if (data.propertyId !== undefined) setData.propertyId = data.propertyId;

    if (Object.keys(setData).length === 0) {
      return this.getPropertyUrlById(id);
    }

    const [row] = await db.update(propertyUrls)
      .set(setData)
      .where(eq(propertyUrls.id, id))
      .returning();
    return row || undefined;
  }

  async deletePropertyUrl(id: number): Promise<void> {
    await db.delete(propertyUrls).where(eq(propertyUrls.id, id));
  }
}
