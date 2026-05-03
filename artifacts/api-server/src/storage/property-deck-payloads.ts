/**
 * property-deck-payloads — sub-storage for the LB-deck editor sidecar.
 *
 * Two operations:
 *   - getDeckPayload(propertyId)            → returns { payload, updatedBy, updatedAt } or null
 *   - setDeckPayload(propertyId, payload, userId) → upserts; row is created on first save
 *
 * Routes that need to read the payload at render time call getDeckPayload;
 * a `null` return means "no editor copy exists yet" and the renderer falls
 * back to deterministic templates per slot. The PATCH admin endpoint reads
 * the current row, deep-merges the partial update, and calls setDeckPayload.
 */
import { propertyDeckPayloads, type PropertyDeckPayloadRow } from "@workspace/db";
import { db } from "../db";
import { eq, sql } from "drizzle-orm";

export interface PropertyDeckPayloadStorage {
  getDeckPayload(propertyId: number): Promise<PropertyDeckPayloadRow | null>;
  setDeckPayload(
    propertyId: number,
    payload: Record<string, unknown>,
    userId: number | null,
  ): Promise<PropertyDeckPayloadRow>;
}

export class PropertyDeckPayloadStorageImpl implements PropertyDeckPayloadStorage {
  async getDeckPayload(propertyId: number): Promise<PropertyDeckPayloadRow | null> {
    const rows = await db
      .select()
      .from(propertyDeckPayloads)
      .where(eq(propertyDeckPayloads.propertyId, propertyId))
      .limit(1);
    return rows[0] ?? null;
  }

  async setDeckPayload(
    propertyId: number,
    payload: Record<string, unknown>,
    userId: number | null,
  ): Promise<PropertyDeckPayloadRow> {
    const [row] = await db
      .insert(propertyDeckPayloads)
      .values({
        propertyId,
        payload,
        updatedBy: userId,
      })
      .onConflictDoUpdate({
        target: propertyDeckPayloads.propertyId,
        set: {
          payload,
          updatedBy: userId,
          updatedAt: sql`NOW()`,
        },
      })
      .returning();
    return row;
  }
}
