import { properties, type Property, type InsertProperty, type UpdateProperty } from "@shared/schema";
import { db } from "../db";
import { eq, or, isNull, sql } from "drizzle-orm";
import { stripAutoFields } from "./utils";
import { indexPropertyProfile } from "../ai/pinecone-service";
import { logger } from "../logger";

async function _indexPropertyAsync(property: Property): Promise<void> {
  try {
    await indexPropertyProfile({
      propertyId: property.id,
      name: property.name ?? "Unnamed Property",
      location: [property.city, property.stateProvince, property.country].filter(Boolean).join(", "),
      propertyType: (property as any).propertyType ?? (property as any).property_type ?? "hotel",
      roomCount: (property as any).roomCount ?? (property as any).room_count ?? null,
      starRating: (property as any).starRating ?? (property as any).star_rating ?? null,
      status: (property as any).status ?? "active",
      purchasePrice: (property as any).purchasePrice ?? (property as any).purchase_price ?? null,
      market: (property as any).market ?? null,
      description: (property as any).description ?? null,
      streetAddress: (property as any).streetAddress ?? (property as any).street_address ?? null,
    });
  } catch (err) {
    logger.warn(`Async property index failed: ${err instanceof Error ? err.message : err}`, "pinecone");
  }
}

export class PropertyStorage {
  /**
   * Get all properties visible to a user. This includes properties they own
   * (userId matches) AND shared/seed properties (userId is null). Shared
   * properties are the initial portfolio that all users can see.
   */
  async getAllProperties(userId?: number): Promise<Property[]> {
    if (userId) {
      return await db.select().from(properties)
        .where(or(eq(properties.userId, userId), isNull(properties.userId)))
        .orderBy(properties.createdAt);
    }
    return await db.select().from(properties).orderBy(properties.createdAt);
  }

  /** Fetch a single property by ID. Returns undefined if not found. */
  async getProperty(id: number): Promise<Property | undefined> {
    const [property] = await db.select().from(properties).where(eq(properties.id, id));
    return property || undefined;
  }

  /** Insert a new property into the portfolio. Returns the created record with generated ID. */
  async createProperty(data: InsertProperty): Promise<Property> {
    const [property] = await db
      .insert(properties)
      .values(data as typeof properties.$inferInsert)
      .returning();
    _indexPropertyAsync(property).catch(() => {});
    return property;
  }

  async updateProperty(id: number, data: UpdateProperty): Promise<Property | undefined> {
    const [property] = await db
      .update(properties)
      .set({ ...stripAutoFields(data as Record<string, unknown>), updatedAt: new Date() })
      .where(eq(properties.id, id))
      .returning();
    if (property) {
      _indexPropertyAsync(property).catch(() => {});
    }
    return property || undefined;
  }

  /** Remove a property from the portfolio. Fee categories cascade-delete via FK. */
  async deleteProperty(id: number): Promise<void> {
    await db.delete(properties).where(eq(properties.id, id));
  }

  async getDistinctPropertyLocations(): Promise<{ country: string; stateProvince: string; city: string }[]> {
    const rows = await db.execute(sql`
      SELECT DISTINCT country, state_province, city
      FROM properties
      WHERE country IS NOT NULL AND country != ''
      ORDER BY country, state_province, city
    `);
    return (rows.rows as any[]).map((r) => ({
      country: r.country as string,
      stateProvince: (r.state_province as string) || "",
      city: (r.city as string) || "",
    }));
  }
}
