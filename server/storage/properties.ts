import { properties, userDefaultProperties, type Property, type InsertProperty, type UpdateProperty } from "@shared/schema";
import { db } from "../db";
import { eq, or, and, isNull, inArray, sql } from "drizzle-orm";
import { stripToColumns } from "./utils";
import { indexPropertyProfile } from "../ai/pinecone-service";
import { logger } from "../logger";

async function _indexPropertyAsync(property: Property): Promise<void> {
  try {
    const rec = property as unknown as Record<string, unknown>;
    await indexPropertyProfile({
      propertyId: property.id,
      name: property.name ?? "Unnamed Property",
      location: [property.city, property.stateProvince, property.country].filter(Boolean).join(", "),
      propertyType: String(rec.propertyType ?? rec.property_type ?? "hotel"),
      roomCount: (rec.roomCount ?? rec.room_count ?? null) as number | null,
      starRating: (rec.starRating ?? rec.star_rating ?? null) as number | null,
      status: String(rec.status ?? "active"),
      purchasePrice: (rec.purchasePrice ?? rec.purchase_price ?? null) as number | null,
      market: (rec.market ?? null) as string | null,
      description: (rec.description ?? null) as string | null,
      streetAddress: (rec.streetAddress ?? rec.street_address ?? null) as string | null,
    });
  } catch (err: unknown) {
    logger.warn(`Async property index failed: ${err instanceof Error ? err.message : err}`, "pinecone");
  }
}

export class PropertyStorage {
  /**
   * Get all properties visible to a user. First checks the userDefaultProperties
   * join table for assigned properties. Falls back to legacy userId filter if no
   * assignments exist. Shared/seed properties (userId is null) are included in
   * the fallback path. Archived properties are always excluded.
   */
  async getAllProperties(userId?: number): Promise<Property[]> {
    if (userId) {
      // Try assigned properties via userDefaultProperties join table
      const assignedPropertyIds = await db
        .select({ propertyId: userDefaultProperties.propertyId })
        .from(userDefaultProperties)
        .where(
          and(
            eq(userDefaultProperties.userId, userId),
            eq(userDefaultProperties.isActive, true)
          )
        );

      if (assignedPropertyIds.length > 0) {
        const ids = assignedPropertyIds.map(r => r.propertyId);
        return db
          .select()
          .from(properties)
          .where(
            and(
              inArray(properties.id, ids),
              isNull(properties.archivedAt)
            )
          )
          .orderBy(properties.createdAt);
      }

      // Fallback: legacy behavior — properties owned by user directly + shared/seed
      return await db.select().from(properties)
        .where(
          and(
            or(eq(properties.userId, userId), isNull(properties.userId)),
            isNull(properties.archivedAt)
          )
        )
        .orderBy(properties.createdAt);
    }
    // Admin path: all non-archived properties
    return await db.select().from(properties)
      .where(isNull(properties.archivedAt))
      .orderBy(properties.createdAt);
  }

  /**
   * Admin method to get ALL properties, optionally including archived ones.
   */
  async getAllPropertiesAdmin(includeArchived: boolean = false): Promise<Property[]> {
    if (includeArchived) {
      return db.select().from(properties).orderBy(properties.name);
    }
    return db.select().from(properties)
      .where(isNull(properties.archivedAt))
      .orderBy(properties.name);
  }

  /** Fetch a single property by ID. Returns undefined if not found. */
  async getProperty(id: number): Promise<Property | undefined> {
    const [property] = await db.select().from(properties).where(eq(properties.id, id));
    return property || undefined;
  }

  /** Insert a new property into the portfolio. Returns the created record with generated ID. */
  async createProperty(data: InsertProperty): Promise<Property> {
    // Defense-in-depth: strip any non-column keys that may have leaked through
    // `as any` casts from callers (syncHelpers, route handlers, etc.)
    const safeData = stripToColumns(properties, data as Record<string, unknown>);
    const [property] = await db
      .insert(properties)
      .values(safeData as typeof properties.$inferInsert)
      .returning();
    _indexPropertyAsync(property).catch(() => { /* ignore: Pinecone indexing is async best-effort */ });
    return property;
  }

  async updateProperty(id: number, data: UpdateProperty): Promise<Property | undefined> {
    const safeData = stripToColumns(properties, { ...(data as Record<string, unknown>), updatedAt: new Date() });
    const [property] = await db
      .update(properties)
      .set(safeData)
      .where(eq(properties.id, id))
      .returning();
    if (property) {
      _indexPropertyAsync(property).catch(() => { /* ignore: Pinecone indexing is async best-effort */ });
    }
    return property || undefined;
  }

  /** Soft-delete: archive a property instead of permanently destroying data. */
  async deleteProperty(id: number, archivedByUserId?: number): Promise<void> {
    await db.update(properties)
      .set({ archivedAt: new Date(), archivedBy: archivedByUserId ?? null })
      .where(eq(properties.id, id));
  }

  /** Restore an archived property back to active status. */
  async restoreProperty(id: number): Promise<void> {
    await db.update(properties)
      .set({ archivedAt: null, archivedBy: null })
      .where(eq(properties.id, id));
  }

  async getDistinctPropertyLocations(): Promise<{ country: string; stateProvince: string; city: string }[]> {
    const rows = await db.execute(sql`
      SELECT DISTINCT country, state_province, city
      FROM properties
      WHERE country IS NOT NULL AND country != ''
        AND archived_at IS NULL
      ORDER BY country, state_province, city
    `);
    return (rows.rows as Array<Record<string, string>>).map((r) => ({
      country: r.country,
      stateProvince: r.state_province || "",
      city: r.city || "",
    }));
  }
}
